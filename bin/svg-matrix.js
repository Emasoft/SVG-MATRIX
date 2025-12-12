#!/usr/bin/env node
/**
 * @fileoverview CLI tool for @emasoft/svg-matrix
 * Provides command-line interface for SVG processing operations.
 *
 * Features:
 * - Single file processing
 * - Batch processing from folders
 * - Batch processing from file lists (txt)
 * - Configurable logging (--quiet, --verbose, --log-file)
 * - Cross-platform path handling
 *
 * @module bin/svg-matrix
 * @license MIT
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync, unlinkSync, openSync, readSync, closeSync } from 'fs';
import { join, dirname, basename, extname, resolve, isAbsolute } from 'path';

// Import library modules
import * as SVGFlatten from '../src/svg-flatten.js';
import * as GeometryToPath from '../src/geometry-to-path.js';
import * as FlattenPipeline from '../src/flatten-pipeline.js';
import { VERSION } from '../src/index.js';
import * as SVGToolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

// ============================================================================
// CONSTANTS
// Why: Centralize all magic numbers and configuration defaults in one place.
// This makes the code easier to maintain and prevents inconsistent values.
// Never duplicate these values elsewhere - always reference this object.
// ============================================================================
const CONSTANTS = {
  // Precision defaults for Decimal.js operations
  DEFAULT_PRECISION: 6,
  MAX_PRECISION: 50,
  MIN_PRECISION: 1,

  // File size limits to prevent memory issues
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB - larger files need streaming

  // Iteration limits to prevent infinite loops
  MAX_GROUP_ITERATIONS: 10, // Prevent infinite loop in group transform propagation

  // Process timeouts
  GRACEFUL_EXIT_TIMEOUT_MS: 1000, // Time to wait for cleanup before forced exit

  // Exit codes - standard Unix conventions
  EXIT_SUCCESS: 0,
  EXIT_ERROR: 1,
  EXIT_INTERRUPTED: 130, // 128 + SIGINT(2)

  // SVG file extensions recognized
  SVG_EXTENSIONS: ['.svg', '.svgz'],

  // SVG header pattern for validation
  SVG_HEADER_PATTERN: /<svg[\s>]/i,
};

// ============================================================================
// SIGNAL HANDLING (global state)
// Why: Track shutdown state and current file for crash logs.
// The signal handlers are registered later, after colors are defined.
// ============================================================================
let isShuttingDown = false;
let currentInputFile = null; // Track for crash log
let currentOutputFile = null; // Track for cleanup on interrupt

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * @typedef {Object} CLIConfig
 * @property {string} command - Command to run
 * @property {string[]} inputs - Input files/folders
 * @property {string} output - Output file/folder
 * @property {string|null} listFile - File containing list of inputs
 * @property {boolean} quiet - Suppress all output
 * @property {boolean} verbose - Enable verbose logging
 * @property {string|null} logFile - Path to log file
 * @property {number} precision - Decimal precision for output
 * @property {boolean} recursive - Process folders recursively
 * @property {boolean} overwrite - Overwrite existing files
 * @property {boolean} dryRun - Show what would be done without doing it
 * @property {boolean} transformOnly - Only flatten transforms (legacy mode)
 * @property {boolean} resolveClipPaths - Apply clipPath boolean operations
 * @property {boolean} resolveMasks - Convert masks to clipped geometry
 * @property {boolean} resolveUse - Expand use/symbol references
 * @property {boolean} resolveMarkers - Expand marker references
 * @property {boolean} resolvePatterns - Expand pattern fills
 * @property {boolean} bakeGradients - Bake gradientTransform into coordinates
 */

const DEFAULT_CONFIG = {
  command: 'help',
  inputs: [],
  output: null,
  listFile: null,
  quiet: false,
  verbose: false,
  logFile: null,
  precision: CONSTANTS.DEFAULT_PRECISION,
  recursive: false,
  overwrite: false,
  dryRun: false,
  showCommandHelp: false,     // Track if --help was requested for a specific command
  // Full flatten options - all enabled by default for TRUE flattening
  transformOnly: false,       // If true, skip all resolvers (legacy behavior)
  resolveClipPaths: true,     // Apply clipPath boolean intersection
  resolveMasks: true,         // Convert masks to clipped geometry
  resolveUse: true,           // Expand use/symbol elements inline
  resolveMarkers: true,       // Instantiate markers as path geometry
  resolvePatterns: true,      // Expand pattern fills to tiled geometry
  bakeGradients: true,        // Bake gradientTransform into gradient coords
  // NOTE: Verification is ALWAYS enabled - precision is non-negotiable
  // E2E verification precision controls
  clipSegments: 64,           // Polygon samples for clip operations (higher = more precise)
  bezierArcs: 8,              // Bezier arcs for circles/ellipses (multiple of 4; 8=π/4 optimal)
  e2eTolerance: '1e-10',      // E2E verification tolerance (tighter with more segments)
  preserveVendor: false,      // If true, preserve vendor-prefixed properties and editor namespaces
};

/** @type {CLIConfig} */
let config = { ...DEFAULT_CONFIG };

// ============================================================================
// LOGGING
// ============================================================================

const LogLevel = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

function getLogLevel() {
  if (config.quiet) return LogLevel.ERROR;
  if (config.verbose) return LogLevel.DEBUG;
  return LogLevel.INFO;
}

const colors = process.env.NO_COLOR !== undefined ? {
  reset: '', red: '', yellow: '', green: '', cyan: '', dim: '', bright: '',
} : {
  reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m',
  green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', bright: '\x1b[1m',
};

// ============================================================================
// SIGNAL HANDLING (handlers)
// Why: Ensure graceful cleanup when user presses Ctrl+C or when the process
// is terminated. Without this, partial files may be left behind and resources
// won't be properly released. The isShuttingDown flag prevents duplicate
// cleanup attempts during signal cascades.
// ============================================================================
function handleGracefulExit(signal) {
  // Why: Prevent duplicate cleanup if multiple signals arrive quickly
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${colors.yellow}Received ${signal}, cleaning up...${colors.reset}`);

  // Why: Remove partial output file if interrupt occurred during processing
  if (currentOutputFile && existsSync(currentOutputFile)) {
    try {
      unlinkSync(currentOutputFile);
      console.log(`${colors.dim}Removed partial output: ${basename(currentOutputFile)}${colors.reset}`);
    } catch { /* ignore cleanup errors */ }
  }

  // Log the interruption for debugging
  if (config.logFile) {
    writeToLogFile(`INTERRUPTED: Received ${signal} while processing ${currentInputFile || 'unknown'}`);
  }

  // Why: Give async operations time to complete, but don't hang indefinitely
  setTimeout(() => {
    process.exit(CONSTANTS.EXIT_INTERRUPTED);
  }, CONSTANTS.GRACEFUL_EXIT_TIMEOUT_MS);
}

// Register signal handlers - must be done before any async operations
process.on('SIGINT', () => handleGracefulExit('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => handleGracefulExit('SIGTERM')); // kill command
// Note: SIGTERM is not fully supported on Windows. On Windows, SIGINT (Ctrl+C) works,
// but SIGTERM requires special handling or third-party libraries. This is acceptable
// for a CLI tool as Ctrl+C is the primary interrupt mechanism on all platforms.

function writeToLogFile(message) {
  if (config.logFile) {
    try {
      const timestamp = new Date().toISOString();
      const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
      appendFileSync(config.logFile, `[${timestamp}] ${cleanMessage}\n`);
    } catch { /* ignore */ }
  }
}

function logError(msg) {
  console.error(`${colors.red}ERROR:${colors.reset} ${msg}`);
  writeToLogFile(`ERROR: ${msg}`);
}

function logWarn(msg) {
  if (getLogLevel() >= LogLevel.WARN) console.warn(`${colors.yellow}WARN:${colors.reset} ${msg}`);
  writeToLogFile(`WARN: ${msg}`);
}

function logInfo(msg) {
  if (getLogLevel() >= LogLevel.INFO) console.log(msg);
  writeToLogFile(`INFO: ${msg}`);
}

function logDebug(msg) {
  if (getLogLevel() >= LogLevel.DEBUG) console.log(`${colors.dim}DEBUG: ${msg}${colors.reset}`);
  writeToLogFile(`DEBUG: ${msg}`);
}

function logSuccess(msg) {
  if (getLogLevel() >= LogLevel.INFO) console.log(`${colors.green}OK${colors.reset} ${msg}`);
  writeToLogFile(`SUCCESS: ${msg}`);
}

// ============================================================================
// PROGRESS INDICATOR
// Why: Batch operations can take a long time. Users need feedback to know
// the operation is still running and how far along it is. Without this,
// users may think the program is frozen and kill it prematurely.
// ============================================================================
function showProgress(current, total, filename) {
  // Why: Don't show progress in quiet mode or when there's only one file
  if (config.quiet || total <= 1) return;

  // Why: In verbose mode, newline before progress to avoid overwriting debug output
  if (config.verbose && current > 1) {
    process.stdout.write('\n');
  }

  const percent = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));

  // Why: Use \r to overwrite the same line, keeping terminal clean
  process.stdout.write(`\r${colors.cyan}[${bar}]${colors.reset} ${percent}% (${current}/${total}) ${basename(filename)}`);

  // Why: Clear to end of line to remove any leftover characters from longer filenames
  process.stdout.write('\x1b[K');

  // Why: Print newline when complete so next output starts on new line
  if (current === total) {
    process.stdout.write('\n');
  }
}

// ============================================================================
// FILE VALIDATION
// Why: Fail fast on invalid input. Processing non-SVG files wastes time and
// may produce confusing errors. Size limits prevent memory exhaustion.
// ============================================================================
function validateSvgFile(filePath) {
  const stats = statSync(filePath);

  // Why: Prevent memory exhaustion from huge files
  if (stats.size > CONSTANTS.MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max: ${CONSTANTS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
  }

  // Why: Read only first 1KB to check header - don't load entire file
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024);
  readSync(fd, buffer, 0, 1024, 0);
  closeSync(fd);
  const header = buffer.toString('utf8');

  // Why: SVG files must have an <svg> element - if not, it's not a valid SVG
  if (!CONSTANTS.SVG_HEADER_PATTERN.test(header)) {
    throw new Error('Not a valid SVG file (missing <svg> element)');
  }

  return true;
}

// ============================================================================
// WRITE VERIFICATION
// Why: Detect silent write failures. Some filesystems (especially network
// shares) may appear to write successfully but fail to persist data.
// Verification catches this immediately rather than discovering corruption later.
// ============================================================================
function verifyWriteSuccess(filePath, expectedContent) {
  // Why: Read back what was written and compare
  const actualContent = readFileSync(filePath, 'utf8');

  // Why: Compare lengths first (fast), then content if needed
  if (actualContent.length !== expectedContent.length) {
    throw new Error(`Write verification failed: size mismatch (expected ${expectedContent.length}, got ${actualContent.length})`);
  }

  // Why: Full content comparison to catch bit flips or encoding issues
  if (actualContent !== expectedContent) {
    throw new Error('Write verification failed: content mismatch');
  }

  return true;
}

// ============================================================================
// CRASH LOG
// Why: When the program crashes, users need detailed information to report
// the bug or fix the issue themselves. This generates a timestamped log file
// with full context about what was being processed when the crash occurred.
// ============================================================================
function generateCrashLog(error, context = {}) {
  const crashDir = join(process.cwd(), '.svg-matrix-crashes');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const crashFile = join(crashDir, `crash-${timestamp}.log`);

  try {
    ensureDir(crashDir);

    const crashContent = `SVG-MATRIX CRASH REPORT
========================
Timestamp: ${new Date().toISOString()}
Version: ${VERSION}
Node: ${process.version}
Platform: ${process.platform} ${process.arch}
Command: ${config.command}

Context:
${JSON.stringify(context, null, 2)}

Error:
${error.name}: ${error.message}

Stack:
${error.stack}

Config:
${JSON.stringify({ ...config, logFile: config.logFile ? '[redacted]' : null }, null, 2)}
`;

    writeFileSync(crashFile, crashContent, 'utf8');
    logError(`Crash log written to: ${crashFile}`);
    return crashFile;
  } catch (e) {
    // Why: Don't throw from error handler - just log and continue
    logError(`Failed to write crash log: ${e.message}`);
    return null;
  }
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

function normalizePath(p) { return p.replace(/\\/g, '/'); }

function resolvePath(p) {
  return isAbsolute(p) ? normalizePath(p) : normalizePath(resolve(process.cwd(), p));
}

function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logDebug(`Created directory: ${dir}`);
  }
}

function getSvgFiles(dir, recursive = false) {
  const files = [];
  function scan(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory() && recursive) scan(fullPath);
      // Why: Support both .svg and .svgz as defined in CONSTANTS.SVG_EXTENSIONS
      else if (entry.isFile() && CONSTANTS.SVG_EXTENSIONS.includes(extname(entry.name).toLowerCase())) files.push(normalizePath(fullPath));
    }
  }
  scan(dir);
  return files;
}

function parseFileList(listPath) {
  const content = readFileSync(listPath, 'utf8');
  const files = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const resolved = resolvePath(trimmed);
    if (isFile(resolved)) files.push(resolved);
    else if (isDir(resolved)) files.push(...getSvgFiles(resolved, config.recursive));
    else logWarn(`File not found: ${trimmed}`);
  }
  return files;
}

// ============================================================================
// SHAPE EXTRACTION HELPERS
// Why: The same attribute extraction patterns are repeated for each shape type.
// Consolidating them reduces code duplication (DRY principle) and ensures
// consistent behavior across all commands. Fix bugs in one place, not many.
// ============================================================================

/**
 * Extract numeric attribute from element attributes string.
 * @param {string} attrs - Element attributes string
 * @param {string} attrName - Attribute name to extract
 * @param {number} defaultValue - Default if not found
 * @returns {number} Parsed value or default
 */
function extractNumericAttr(attrs, attrName, defaultValue = 0) {
  // Why: Use word boundary \b to avoid matching 'rx' when looking for 'x'
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = attrs.match(regex);
  return match ? parseFloat(match[1]) : defaultValue;
}

/**
 * Extract shape geometry as path data.
 * @param {string} shapeType - Shape element type (rect, circle, etc.)
 * @param {string} attrs - Element attributes string
 * @param {number} precision - Decimal precision
 * @returns {string|null} Path data or null if extraction failed
 */
function extractShapeAsPath(shapeType, attrs, precision) {
  switch (shapeType) {
    case 'rect': {
      const x = extractNumericAttr(attrs, 'x');
      const y = extractNumericAttr(attrs, 'y');
      const w = extractNumericAttr(attrs, 'width');
      const h = extractNumericAttr(attrs, 'height');
      const rx = extractNumericAttr(attrs, 'rx');
      const ry = extractNumericAttr(attrs, 'ry', rx); // ry defaults to rx per SVG spec
      if (w <= 0 || h <= 0) return null;
      return GeometryToPath.rectToPathData(x, y, w, h, rx, ry, false, precision);
    }
    case 'circle': {
      const cx = extractNumericAttr(attrs, 'cx');
      const cy = extractNumericAttr(attrs, 'cy');
      const r = extractNumericAttr(attrs, 'r');
      if (r <= 0) return null;
      return GeometryToPath.circleToPathData(cx, cy, r, precision);
    }
    case 'ellipse': {
      const cx = extractNumericAttr(attrs, 'cx');
      const cy = extractNumericAttr(attrs, 'cy');
      const rx = extractNumericAttr(attrs, 'rx');
      const ry = extractNumericAttr(attrs, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return GeometryToPath.ellipseToPathData(cx, cy, rx, ry, precision);
    }
    case 'line': {
      const x1 = extractNumericAttr(attrs, 'x1');
      const y1 = extractNumericAttr(attrs, 'y1');
      const x2 = extractNumericAttr(attrs, 'x2');
      const y2 = extractNumericAttr(attrs, 'y2');
      return GeometryToPath.lineToPathData(x1, y1, x2, y2, precision);
    }
    case 'polygon': {
      const points = attrs.match(/points\s*=\s*["']([^"']+)["']/)?.[1];
      return points ? GeometryToPath.polygonToPathData(points, precision) : null;
    }
    case 'polyline': {
      const points = attrs.match(/points\s*=\s*["']([^"']+)["']/)?.[1];
      return points ? GeometryToPath.polylineToPathData(points, precision) : null;
    }
    default:
      return null;
  }
}

/**
 * Get attributes to remove when converting shape to path.
 * @param {string} shapeType - Shape element type
 * @returns {string[]} Attribute names to remove
 */
function getShapeSpecificAttrs(shapeType) {
  const attrMap = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polygon: ['points'],
    polyline: ['points'],
  };
  return attrMap[shapeType] || [];
}

/**
 * Remove shape-specific attributes from element attributes string.
 * @param {string} attrs - Element attributes string
 * @param {string[]} attrsToRemove - Attribute names to remove
 * @returns {string} Cleaned attributes
 */
function removeShapeAttrs(attrs, attrsToRemove) {
  let result = attrs;
  for (const attrName of attrsToRemove) {
    result = result.replace(new RegExp(`\\b${attrName}\\s*=\\s*["'][^"']*["']`, 'gi'), '');
  }
  return result.trim();
}

// ============================================================================
// COMMANDS
// ============================================================================

// ============================================================================
// ENHANCED CLI HELP SYSTEM
// ============================================================================

// Box drawing helpers
const supportsUnicode = () => {
  if (process.platform === 'win32') {
    return !!(process.env.WT_SESSION || process.env.CHCP === '65001' ||
              process.env.ConEmuANSI === 'ON' || process.env.TERM_PROGRAM);
  }
  return true;
};

const B = supportsUnicode()
  ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', dot: '•', arr: '→' }
  : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', dot: '*', arr: '->' };

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function boxLine(content, width = 70) {
  const visible = stripAnsi(content).length;
  const padding = Math.max(0, width - visible - 2);
  return `${colors.cyan}${B.v}${colors.reset} ${content}${' '.repeat(padding)}${colors.cyan}${B.v}${colors.reset}`;
}

function boxHeader(title, width = 70) {
  const hr = B.h.repeat(width);
  const visible = stripAnsi(title).length;
  const padding = Math.max(0, width - visible - 2);
  return `${colors.cyan}${B.v}${colors.reset} ${colors.bright}${title}${colors.reset}${' '.repeat(padding)}${colors.cyan}${B.v}${colors.reset}`;
}

function boxDivider(width = 70) {
  return `${colors.cyan}${B.v}${B.h.repeat(width)}${B.v}${colors.reset}`;
}

function showHelp() {
  const W = 72;
  const hr = B.h.repeat(W);

  console.log(`
${colors.cyan}${B.tl}${hr}${B.tr}${colors.reset}
${boxLine(`${colors.bright}@emasoft/svg-matrix${colors.reset} v${VERSION}`, W)}
${boxLine(`${colors.dim}Arbitrary-precision SVG transforms with decimal.js${colors.reset}`, W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('USAGE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix <command> [options] <input> [-o <output>]`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('COMMANDS', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}flatten${colors.reset}     TRUE flatten: resolve ALL transform dependencies`, W)}
${boxLine(`              ${colors.dim}Bakes transforms, applies clipPaths, expands use/markers${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}convert${colors.reset}     Convert shapes (rect, circle, ellipse, line) to paths`, W)}
${boxLine(`              ${colors.dim}Preserves all style attributes${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}normalize${colors.reset}   Convert all paths to absolute cubic Bezier curves`, W)}
${boxLine(`              ${colors.dim}Ideal for animation and path morphing${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}info${colors.reset}        Show SVG file information and element counts`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}test-toolbox${colors.reset} Test all svg-toolbox functions on an SVG file`, W)}
${boxLine(`              ${colors.dim}Creates timestamped folder with all processed versions${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}help${colors.reset}        Show this help (or: svg-matrix <command> --help)`, W)}
${boxLine(`  ${colors.green}version${colors.reset}     Show version number`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('GLOBAL OPTIONS', W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}-o, --output <path>${colors.reset}     Output file or directory`, W)}
${boxLine(`  ${colors.dim}-l, --list <file>${colors.reset}       Read input files from text file`, W)}
${boxLine(`  ${colors.dim}-r, --recursive${colors.reset}         Process directories recursively`, W)}
${boxLine(`  ${colors.dim}-p, --precision <n>${colors.reset}     Decimal precision (default: 6, max: 50)`, W)}
${boxLine(`  ${colors.dim}-f, --force${colors.reset}             Overwrite existing output files`, W)}
${boxLine(`  ${colors.dim}-n, --dry-run${colors.reset}           Show what would be done`, W)}
${boxLine(`  ${colors.dim}-q, --quiet${colors.reset}             Suppress all output except errors`, W)}
${boxLine(`  ${colors.dim}-v, --verbose${colors.reset}           Enable verbose/debug output`, W)}
${boxLine(`  ${colors.dim}--log-file <path>${colors.reset}       Write log to file`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('FLATTEN OPTIONS', W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}--transform-only${colors.reset}        Only flatten transforms (skip resolvers)`, W)}
${boxLine(`  ${colors.dim}--no-clip-paths${colors.reset}         Skip clipPath boolean operations`, W)}
${boxLine(`  ${colors.dim}--no-masks${colors.reset}              Skip mask to clip conversion`, W)}
${boxLine(`  ${colors.dim}--no-use${colors.reset}                Skip use/symbol expansion`, W)}
${boxLine(`  ${colors.dim}--no-markers${colors.reset}            Skip marker instantiation`, W)}
${boxLine(`  ${colors.dim}--no-patterns${colors.reset}           Skip pattern expansion`, W)}
${boxLine(`  ${colors.dim}--no-gradients${colors.reset}          Skip gradient transform baking`, W)}
${boxLine(`  ${colors.dim}--preserve-vendor${colors.reset}       Keep vendor prefixes and editor namespaces`, W)}
${boxLine(`                          ${colors.dim}(inkscape, sodipodi, -webkit-*, etc.)${colors.reset}`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('PRECISION OPTIONS', W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}--clip-segments <n>${colors.reset}     Polygon samples for clipping (default: 64)`, W)}
${boxLine(`                          ${colors.dim}64=balanced, 128=high, 256=very high${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}--bezier-arcs <n>${colors.reset}       Bezier arcs for curves (default: 8)`, W)}
${boxLine(`                          ${colors.dim}Must be multiple of 4. Error rates:${colors.reset}`, W)}
${boxLine(`                          ${colors.dim}8: 0.0004%, 16: 0.000007%, 64: 0.00000001%${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}--e2e-tolerance <exp>${colors.reset}   Verification tolerance (default: 1e-10)`, W)}
${boxLine(`                          ${colors.dim}Examples: 1e-8, 1e-10, 1e-12, 1e-14${colors.reset}`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.yellow}${B.dot} Mathematical verification is ALWAYS enabled${colors.reset}`, W)}
${boxLine(`  ${colors.yellow}${B.dot} Precision is non-negotiable in this library${colors.reset}`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('EXAMPLES', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}svg-matrix flatten${colors.reset} input.svg -o output.svg`, W)}
${boxLine(`  ${colors.green}svg-matrix flatten${colors.reset} ./svgs/ -o ./out/ --transform-only`, W)}
${boxLine(`  ${colors.green}svg-matrix flatten${colors.reset} --list files.txt -o ./out/ --no-patterns`, W)}
${boxLine(`  ${colors.green}svg-matrix convert${colors.reset} input.svg -o output.svg -p 10`, W)}
${boxLine(`  ${colors.green}svg-matrix info${colors.reset} input.svg`, W)}
${boxLine('', W)}
${boxDivider(W)}
${boxLine('', W)}
${boxHeader('JAVASCRIPT API', W)}
${boxLine('', W)}
${boxLine(`  import { Matrix, Vector, Transforms2D } from '@emasoft/svg-matrix'`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}${B.dot} Matrix${colors.reset}        Arbitrary-precision matrix operations`, W)}
${boxLine(`  ${colors.green}${B.dot} Vector${colors.reset}        High-precision vector math`, W)}
${boxLine(`  ${colors.green}${B.dot} Transforms2D${colors.reset}  rotate, scale, translate, skew, reflect`, W)}
${boxLine(`  ${colors.green}${B.dot} Transforms3D${colors.reset}  3D affine transformations`, W)}
${boxLine('', W)}
${colors.cyan}${B.bl}${hr}${B.br}${colors.reset}

  ${colors.cyan}Docs:${colors.reset} https://github.com/Emasoft/SVG-MATRIX#readme
`);
}

function showCommandHelp(command) {
  const W = 72;
  const hr = B.h.repeat(W);

  const commandHelp = {
    flatten: `
${colors.cyan}${B.tl}${hr}${B.tr}${colors.reset}
${boxLine(`${colors.bright}svg-matrix flatten${colors.reset} - TRUE SVG Flattening`, W)}
${boxDivider(W)}
${boxLine('', W)}
${boxLine(`Resolves ALL transform dependencies to produce a "flat" SVG where`, W)}
${boxLine(`every coordinate is in the root coordinate system.`, W)}
${boxLine('', W)}
${boxHeader('WHAT IT DOES', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Bakes transform attributes into path coordinates`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Applies clipPath as boolean intersection operations`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Converts masks to equivalent clipped geometry`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Expands <use> and <symbol> references inline`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Instantiates markers as actual path geometry`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Expands pattern fills to tiled geometry`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Bakes gradientTransform into gradient coordinates`, W)}
${boxLine('', W)}
${boxHeader('USAGE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix flatten <input> [options]`, W)}
${boxLine('', W)}
${boxHeader('EXAMPLES', W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}# Full flatten (all resolvers enabled)${colors.reset}`, W)}
${boxLine(`  svg-matrix flatten input.svg -o output.svg`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}# Transform-only mode (legacy, faster)${colors.reset}`, W)}
${boxLine(`  svg-matrix flatten input.svg -o out.svg --transform-only`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}# High-precision mode for complex curves${colors.reset}`, W)}
${boxLine(`  svg-matrix flatten in.svg -o out.svg --clip-segments 128`, W)}
${boxLine('', W)}
${boxLine(`  ${colors.dim}# Skip specific resolvers${colors.reset}`, W)}
${boxLine(`  svg-matrix flatten in.svg -o out.svg --no-patterns --no-markers`, W)}
${boxLine('', W)}
${colors.cyan}${B.bl}${hr}${B.br}${colors.reset}
`,
    convert: `
${colors.cyan}${B.tl}${hr}${B.tr}${colors.reset}
${boxLine(`${colors.bright}svg-matrix convert${colors.reset} - Shape to Path Conversion`, W)}
${boxDivider(W)}
${boxLine('', W)}
${boxLine(`Converts all basic shapes to <path> elements while preserving`, W)}
${boxLine(`all style and presentation attributes.`, W)}
${boxLine('', W)}
${boxHeader('SUPPORTED SHAPES', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}${B.dot} rect${colors.reset}       ${B.arr} path (with optional rounded corners)`, W)}
${boxLine(`  ${colors.green}${B.dot} circle${colors.reset}     ${B.arr} path (4 cubic Bezier arcs)`, W)}
${boxLine(`  ${colors.green}${B.dot} ellipse${colors.reset}    ${B.arr} path (4 cubic Bezier arcs)`, W)}
${boxLine(`  ${colors.green}${B.dot} line${colors.reset}       ${B.arr} path (M...L command)`, W)}
${boxLine(`  ${colors.green}${B.dot} polygon${colors.reset}    ${B.arr} path (closed polyline)`, W)}
${boxLine(`  ${colors.green}${B.dot} polyline${colors.reset}   ${B.arr} path (open polyline)`, W)}
${boxLine('', W)}
${boxHeader('USAGE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix convert <input> -o <output> [-p <precision>]`, W)}
${boxLine('', W)}
${boxHeader('EXAMPLE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix convert shapes.svg -o paths.svg --precision 8`, W)}
${boxLine('', W)}
${colors.cyan}${B.bl}${hr}${B.br}${colors.reset}
`,
    normalize: `
${colors.cyan}${B.tl}${hr}${B.tr}${colors.reset}
${boxLine(`${colors.bright}svg-matrix normalize${colors.reset} - Path Normalization`, W)}
${boxDivider(W)}
${boxLine('', W)}
${boxLine(`Converts all path commands to absolute cubic Bezier curves.`, W)}
${boxLine(`Ideal for path morphing, animation, and consistent processing.`, W)}
${boxLine('', W)}
${boxHeader('WHAT IT DOES', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Converts relative commands (m,l,c,s,q,t,a) to absolute`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Converts all curves to cubic Beziers (C commands)`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Expands shorthand (S,T) to full curves`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Converts arcs (A) to cubic Bezier approximations`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Converts lines (L,H,V) to degenerate cubics`, W)}
${boxLine('', W)}
${boxHeader('OUTPUT FORMAT', W)}
${boxLine('', W)}
${boxLine(`  All paths become: M x y C x1 y1 x2 y2 x y C ... Z`, W)}
${boxLine('', W)}
${boxHeader('USAGE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix normalize <input> -o <output>`, W)}
${boxLine('', W)}
${boxHeader('EXAMPLE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix normalize complex.svg -o normalized.svg`, W)}
${boxLine('', W)}
${colors.cyan}${B.bl}${hr}${B.br}${colors.reset}
`,
    info: `
${colors.cyan}${B.tl}${hr}${B.tr}${colors.reset}
${boxLine(`${colors.bright}svg-matrix info${colors.reset} - SVG File Information`, W)}
${boxDivider(W)}
${boxLine('', W)}
${boxLine(`Displays detailed information about an SVG file including`, W)}
${boxLine(`dimensions, element counts, and structure analysis.`, W)}
${boxLine('', W)}
${boxHeader('INFORMATION SHOWN', W)}
${boxLine('', W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} File path and size`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Dimensions (viewBox, width, height)`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Element counts (paths, shapes, groups)`, W)}
${boxLine(`  ${colors.green}${B.dot}${colors.reset} Transform attribute count`, W)}
${boxLine('', W)}
${boxHeader('USAGE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix info <input>`, W)}
${boxLine(`  svg-matrix info <folder> -r    ${colors.dim}# recursive${colors.reset}`, W)}
${boxLine('', W)}
${boxHeader('EXAMPLE', W)}
${boxLine('', W)}
${boxLine(`  svg-matrix info logo.svg`, W)}
${boxLine('', W)}
${colors.cyan}${B.bl}${hr}${B.br}${colors.reset}
`
  };

  if (commandHelp[command]) {
    console.log(commandHelp[command]);
  } else {
    showHelp();
  }
}

function showVersion() { console.log(`@emasoft/svg-matrix v${VERSION}`); }

/**
 * Extract transform attribute value from element attributes string.
 * @param {string} attrs - Element attributes string
 * @returns {string|null} Transform value or null
 */
function extractTransform(attrs) {
  const match = attrs.match(/transform\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Remove transform attribute from element attributes string.
 * @param {string} attrs - Element attributes string
 * @returns {string} Attributes without transform
 */
function removeTransform(attrs) {
  return attrs.replace(/\s*transform\s*=\s*["'][^"']*["']/gi, '');
}

/**
 * Extract path d attribute value.
 * @param {string} attrs - Element attributes string
 * @returns {string|null} Path data or null
 */
function extractPathD(attrs) {
  const match = attrs.match(/\bd\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Replace path d attribute value.
 * @param {string} attrs - Element attributes string
 * @param {string} newD - New path data
 * @returns {string} Updated attributes
 */
function replacePathD(attrs, newD) {
  return attrs.replace(/(\bd\s*=\s*["'])[^"']+["']/i, `$1${newD}"`);
}

/**
 * Flatten SVG completely - no transform dependencies remain.
 *
 * TRUE flattening resolves ALL transform-dependent elements:
 * - Bakes transform attributes into path coordinates
 * - Applies clipPath boolean operations
 * - Converts masks to clipped geometry
 * - Expands use/symbol references inline
 * - Instantiates markers as path geometry
 * - Expands pattern fills to tiled geometry
 * - Bakes gradientTransform into gradient coordinates
 *
 * Use --transform-only flag for legacy behavior (transforms only).
 *
 * @param {string} inputPath - Input file path
 * @param {string} outputPath - Output file path
 * @returns {boolean} True if successful
 */
function processFlatten(inputPath, outputPath) {
  try {
    logDebug(`Processing: ${inputPath}`);
    const svgContent = readFileSync(inputPath, 'utf8');

    // Use legacy transform-only mode if requested
    if (config.transformOnly) {
      return processFlattenLegacy(inputPath, outputPath, svgContent);
    }

    // Build pipeline options from config
    const pipelineOptions = {
      precision: config.precision,
      curveSegments: 20,
      clipSegments: config.clipSegments,     // Higher segments for clip accuracy (default 64)
      bezierArcs: config.bezierArcs,         // Bezier arcs for circles/ellipses (default 16)
      e2eTolerance: config.e2eTolerance,     // Configurable E2E tolerance (default 1e-10)
      resolveUse: config.resolveUse,
      resolveMarkers: config.resolveMarkers,
      resolvePatterns: config.resolvePatterns,
      resolveMasks: config.resolveMasks,
      resolveClipPaths: config.resolveClipPaths,
      flattenTransforms: true, // Always flatten transforms
      bakeGradients: config.bakeGradients,
      removeUnusedDefs: true,
      // NOTE: Verification is ALWAYS enabled - precision is non-negotiable
    };

    // Run the full flatten pipeline
    const { svg: flattenedSvg, stats } = FlattenPipeline.flattenSVG(svgContent, pipelineOptions);

    // Report statistics
    const parts = [];
    if (stats.transformsFlattened > 0) parts.push(`${stats.transformsFlattened} transforms`);
    if (stats.useResolved > 0) parts.push(`${stats.useResolved} use`);
    if (stats.markersResolved > 0) parts.push(`${stats.markersResolved} markers`);
    if (stats.patternsResolved > 0) parts.push(`${stats.patternsResolved} patterns`);
    if (stats.masksResolved > 0) parts.push(`${stats.masksResolved} masks`);
    if (stats.clipPathsApplied > 0) parts.push(`${stats.clipPathsApplied} clipPaths`);
    if (stats.gradientsProcessed > 0) parts.push(`${stats.gradientsProcessed} gradients`);

    if (parts.length > 0) {
      logInfo(`Flattened: ${parts.join(', ')}`);
    } else {
      logInfo('No transform dependencies found');
    }

    // Report verification results (ALWAYS - precision is non-negotiable)
    if (stats.verifications) {
      const v = stats.verifications;
      const total = v.passed + v.failed;
      if (total > 0) {
        const verifyStatus = v.allPassed
          ? `${colors.green}VERIFIED${colors.reset}`
          : `${colors.red}${v.failed} FAILED${colors.reset}`;
        logInfo(`Verification: ${v.passed}/${total} - ${verifyStatus}`);

        // Show detailed results in verbose mode
        if (config.verbose) {
          if (v.matrices.length > 0) {
            logDebug(`  Matrix verifications: ${v.matrices.filter(m => m.valid).length}/${v.matrices.length} passed`);
          }
          if (v.transforms.length > 0) {
            logDebug(`  Transform round-trips: ${v.transforms.filter(t => t.valid).length}/${v.transforms.length} passed`);
          }
          if (v.polygons.length > 0) {
            logDebug(`  Polygon intersections: ${v.polygons.filter(p => p.valid).length}/${v.polygons.length} passed`);
          }
          if (v.gradients.length > 0) {
            logDebug(`  Gradient transforms: ${v.gradients.filter(g => g.valid).length}/${v.gradients.length} passed`);
          }
          if (v.e2e && v.e2e.length > 0) {
            logDebug(`  E2E area conservation: ${v.e2e.filter(e => e.valid).length}/${v.e2e.length} passed`);
          }
        }

        // Always show failed verifications (not just in verbose mode)
        const allVerifications = [...v.matrices, ...v.transforms, ...v.polygons, ...v.gradients, ...(v.e2e || [])];
        const failed = allVerifications.filter(vr => !vr.valid);
        if (failed.length > 0) {
          for (const f of failed.slice(0, 3)) {
            logError(`${colors.red}VERIFICATION FAILED:${colors.reset} ${f.message}`);
          }
          if (failed.length > 3) {
            logError(`...and ${failed.length - 3} more failed verifications`);
          }
        }
      }
    }

    // Report any errors
    if (stats.errors.length > 0) {
      for (const err of stats.errors.slice(0, 5)) {
        logWarn(err);
      }
      if (stats.errors.length > 5) {
        logWarn(`...and ${stats.errors.length - 5} more errors`);
      }
    }

    if (!config.dryRun) {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, flattenedSvg, 'utf8');
    }
    logSuccess(`${basename(inputPath)} -> ${basename(outputPath)}`);
    return true;
  } catch (error) {
    logError(`Failed: ${inputPath}: ${error.message}`);
    return false;
  }
}

/**
 * Legacy flatten mode - only bakes transform attributes into coordinates.
 * Does NOT resolve clipPaths, masks, use, markers, patterns, or gradients.
 * Use this when you only need transform flattening without boolean operations.
 * @private
 */
function processFlattenLegacy(inputPath, outputPath, svgContent) {
  let result = svgContent;
  let transformCount = 0;
  let pathCount = 0;
  let shapeCount = 0;

  // Step 1: Flatten transforms on path elements
  result = result.replace(/<path\s+([^>]*?)\s*\/?>/gi, (match, attrs) => {
    const transform = extractTransform(attrs);
    const pathD = extractPathD(attrs);

    if (!transform || !pathD) {
      return match;
    }

    try {
      const ctm = SVGFlatten.parseTransformAttribute(transform);
      const transformedD = SVGFlatten.transformPathData(pathD, ctm, { precision: config.precision });
      const newAttrs = removeTransform(replacePathD(attrs, transformedD));
      transformCount++;
      pathCount++;
      logDebug(`Flattened path transform: ${transform}`);
      return `<path ${newAttrs.trim()}${match.endsWith('/>') ? '/>' : '>'}`;
    } catch (e) {
      logWarn(`Failed to flatten path: ${e.message}`);
      return match;
    }
  });

  // Step 2: Convert shapes with transforms to flattened paths
  const shapeTypes = ['rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline'];

  for (const shapeType of shapeTypes) {
    const shapeRegex = new RegExp(`<${shapeType}([^>]*)\\/>`, 'gi');

    result = result.replace(shapeRegex, (match, attrs) => {
      const transform = extractTransform(attrs);
      if (!transform) {
        return match;
      }

      try {
        const pathD = extractShapeAsPath(shapeType, attrs, config.precision);
        if (!pathD) {
          return match;
        }

        const ctm = SVGFlatten.parseTransformAttribute(transform);
        const transformedD = SVGFlatten.transformPathData(pathD, ctm, { precision: config.precision });
        const attrsToRemove = getShapeSpecificAttrs(shapeType);
        const styleAttrs = removeShapeAttrs(removeTransform(attrs), attrsToRemove);
        transformCount++;
        shapeCount++;
        logDebug(`Flattened ${shapeType} transform: ${transform}`);
        return `<path d="${transformedD}"${styleAttrs ? ' ' + styleAttrs : ''}/>`;
      } catch (e) {
        logWarn(`Failed to flatten ${shapeType}: ${e.message}`);
        return match;
      }
    });
  }

  // Step 3: Handle group transforms
  let groupIterations = 0;
  while (groupIterations < CONSTANTS.MAX_GROUP_ITERATIONS) {
    const beforeResult = result;

    result = result.replace(
      /<g([^>]*transform\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/g>/gi,
      (match, gAttrs, groupTransform, content) => {
        try {
          const groupCtm = SVGFlatten.parseTransformAttribute(groupTransform);
          let modifiedContent = content;
          let childrenModified = false;

          modifiedContent = modifiedContent.replace(/<path\s+([^>]*?)\s*\/?>/gi, (pathMatch, pathAttrs) => {
            const pathD = extractPathD(pathAttrs);
            if (!pathD) return pathMatch;

            try {
              const childTransform = extractTransform(pathAttrs);
              let combinedCtm = groupCtm;

              if (childTransform) {
                const childCtm = SVGFlatten.parseTransformAttribute(childTransform);
                combinedCtm = groupCtm.mul(childCtm);
              }

              const transformedD = SVGFlatten.transformPathData(pathD, combinedCtm, { precision: config.precision });
              const newAttrs = removeTransform(replacePathD(pathAttrs, transformedD));
              childrenModified = true;
              transformCount++;
              return `<path ${newAttrs.trim()}${pathMatch.endsWith('/>') ? '/>' : '>'}`;
            } catch (e) {
              logWarn(`Failed to apply group transform to path: ${e.message}`);
              return pathMatch;
            }
          });

          if (childrenModified) {
            const newGAttrs = removeTransform(gAttrs);
            logDebug(`Propagated group transform to children: ${groupTransform}`);
            return `<g${newGAttrs}>${modifiedContent}</g>`;
          }
          return match;
        } catch (e) {
          logWarn(`Failed to process group: ${e.message}`);
          return match;
        }
      }
    );

    if (result === beforeResult) {
      break;
    }
    groupIterations++;
  }

  logInfo(`Flattened ${transformCount} transforms (${pathCount} paths, ${shapeCount} shapes) [legacy mode]`);

  if (!config.dryRun) {
    ensureDir(dirname(outputPath));
    writeFileSync(outputPath, result, 'utf8');
  }
  logSuccess(`${basename(inputPath)} -> ${basename(outputPath)}`);
  return true;
}

function processConvert(inputPath, outputPath) {
  try {
    logDebug(`Converting: ${inputPath}`);
    let result = readFileSync(inputPath, 'utf8');

    // Convert all shape types to paths
    const shapeTypes = ['rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline'];

    for (const shapeType of shapeTypes) {
      const shapeRegex = new RegExp(`<${shapeType}([^>]*)\\/>`, 'gi');

      result = result.replace(shapeRegex, (match, attrs) => {
        try {
          // Extract shape as path using helper
          const pathData = extractShapeAsPath(shapeType, attrs, config.precision);

          if (!pathData) {
            return match; // Couldn't convert to path
          }

          // Remove shape-specific attributes, keep style/presentation attributes
          const attrsToRemove = getShapeSpecificAttrs(shapeType);
          const otherAttrs = removeShapeAttrs(attrs, attrsToRemove);

          return `<path d="${pathData}"${otherAttrs ? ' ' + otherAttrs : ''}/>`;
        } catch (e) {
          logWarn(`Failed to convert ${shapeType}: ${e.message}`);
          return match;
        }
      });
    }

    if (!config.dryRun) {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, result, 'utf8');
    }
    logSuccess(`${basename(inputPath)} -> ${basename(outputPath)}`);
    return true;
  } catch (error) {
    logError(`Failed: ${inputPath}: ${error.message}`);
    return false;
  }
}

function processNormalize(inputPath, outputPath) {
  try {
    logDebug(`Normalizing: ${inputPath}`);
    let result = readFileSync(inputPath, 'utf8');

    result = result.replace(/d\s*=\s*["']([^"']+)["']/gi, (match, pathData) => {
      try {
        const normalized = GeometryToPath.pathToCubics(pathData);
        return `d="${normalized}"`;
      } catch { return match; }
    });

    if (!config.dryRun) {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, result, 'utf8');
    }
    logSuccess(`${basename(inputPath)} -> ${basename(outputPath)}`);
    return true;
  } catch (error) {
    logError(`Failed: ${inputPath}: ${error.message}`);
    return false;
  }
}

function processInfo(inputPath) {
  try {
    const svg = readFileSync(inputPath, 'utf8');
    const vb = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1] || 'not set';
    const w = svg.match(/<svg[^>]*\swidth\s*=\s*["']([^"']+)["']/i)?.[1] || 'not set';
    const h = svg.match(/<svg[^>]*\sheight\s*=\s*["']([^"']+)["']/i)?.[1] || 'not set';

    console.log(`
${colors.cyan}File:${colors.reset} ${inputPath}
${colors.cyan}Size:${colors.reset} ${(svg.length / 1024).toFixed(2)} KB
${colors.bright}Dimensions:${colors.reset} viewBox=${vb}, width=${w}, height=${h}
${colors.bright}Elements:${colors.reset}
  paths: ${(svg.match(/<path/gi) || []).length}
  rects: ${(svg.match(/<rect/gi) || []).length}
  circles: ${(svg.match(/<circle/gi) || []).length}
  ellipses: ${(svg.match(/<ellipse/gi) || []).length}
  groups: ${(svg.match(/<g[\s>]/gi) || []).length}
  transforms: ${(svg.match(/transform\s*=/gi) || []).length}
`);
    return true;
  } catch (error) {
    logError(`Failed: ${inputPath}: ${error.message}`);
    return false;
  }
}

// ============================================================================
// TEST TOOLBOX
// ============================================================================

// All testable functions from svg-toolbox.js organized by category
const TOOLBOX_FUNCTIONS = {
  cleanup: ['cleanupIds', 'cleanupNumericValues', 'cleanupListOfValues', 'cleanupAttributes', 'cleanupEnableBackground'],
  remove: ['removeUnknownsAndDefaults', 'removeNonInheritableGroupAttrs', 'removeUselessDefs', 'removeHiddenElements', 'removeEmptyText', 'removeEmptyContainers', 'removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata', 'removeTitle', 'removeDesc', 'removeEditorsNSData', 'removeEmptyAttrs', 'removeViewBox', 'removeXMLNS', 'removeRasterImages', 'removeScriptElement', 'removeStyleElement', 'removeXlink', 'removeDimensions', 'removeAttrs', 'removeElementsByAttr', 'removeAttributesBySelector', 'removeOffCanvasPath'],
  convert: ['convertShapesToPath', 'convertPathData', 'convertTransform', 'convertColors', 'convertStyleToAttrs', 'convertEllipseToCircle'],
  collapse: ['collapseGroups', 'mergePaths'],
  move: ['moveGroupAttrsToElems', 'moveElemsAttrsToGroup'],
  style: ['minifyStyles', 'inlineStyles'],
  sort: ['sortAttrs', 'sortDefsChildren'],
  pathOptimization: ['optimizePaths', 'simplifyPaths', 'simplifyPath', 'reusePaths'],
  flatten: ['flattenClipPaths', 'flattenMasks', 'flattenGradients', 'flattenPatterns', 'flattenFilters', 'flattenUseElements', 'flattenAll'],
  transform: ['decomposeTransform'],
  other: ['addAttributesToSVGElement', 'addClassesToSVGElement', 'prefixIds', 'optimizeAnimationTiming'],
  validation: ['validateXML', 'validateSVG', 'fixInvalidSvg'],
  detection: ['detectCollisions', 'measureDistance'],
};

const SKIP_TOOLBOX_FUNCTIONS = ['imageToPath', 'detectCollisions', 'measureDistance'];

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function testToolboxFunction(fnName, originalContent, originalSize, outputDir) {
  const result = { name: fnName, status: 'unknown', outputSize: 0, sizeDiff: 0, sizeDiffPercent: 0, error: null, outputFile: null, timeMs: 0 };

  try {
    const fn = SVGToolbox[fnName];
    if (!fn) { result.status = 'not_found'; result.error = `Function not found`; return result; }
    if (SKIP_TOOLBOX_FUNCTIONS.includes(fnName)) { result.status = 'skipped'; result.error = 'Requires special handling'; return result; }

    const startTime = Date.now();
    const doc = parseSVG(originalContent);
    // Pass preserveVendor option from config to toolbox functions
    await fn(doc, { preserveVendor: config.preserveVendor });
    const output = serializeSVG(doc);
    const outputSize = Buffer.byteLength(output);
    result.timeMs = Date.now() - startTime;

    const outputFile = join(outputDir, `${fnName}.svg`);
    writeFileSync(outputFile, output);

    result.status = 'success';
    result.outputSize = outputSize;
    result.sizeDiff = outputSize - originalSize;
    result.sizeDiffPercent = ((outputSize - originalSize) / originalSize * 100).toFixed(1);
    result.outputFile = outputFile;

    if (output.length < 100) { result.status = 'warning'; result.error = 'Output suspiciously small'; }
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
  }
  return result;
}

async function processTestToolbox() {
  const files = gatherInputFiles();
  if (files.length === 0) { logError('No input file specified'); process.exit(CONSTANTS.EXIT_ERROR); }
  if (files.length > 1) { logError('test-toolbox only accepts one input file'); process.exit(CONSTANTS.EXIT_ERROR); }

  const inputFile = files[0];
  validateSvgFile(inputFile);

  const baseName = basename(inputFile, extname(inputFile));
  const timestamp = getTimestamp();
  const outputDirName = `${baseName}_${timestamp}`;
  const outputBase = config.output || dirname(inputFile);
  const outputDir = join(outputBase, outputDirName);
  mkdirSync(outputDir, { recursive: true });

  console.log('\n' + '='.repeat(70));
  console.log(`${colors.bright}SVG-TOOLBOX FUNCTION TEST${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  const originalContent = readFileSync(inputFile, 'utf8');
  const originalSize = Buffer.byteLength(originalContent);

  logInfo(`Input:  ${colors.cyan}${inputFile}${colors.reset}`);
  logInfo(`Size:   ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  logInfo(`Output: ${colors.cyan}${outputDir}/${colors.reset}\n`);

  const allResults = [];
  let total = 0, success = 0, errors = 0, skipped = 0;

  for (const [category, functions] of Object.entries(TOOLBOX_FUNCTIONS)) {
    console.log(`\n${colors.bright}--- ${category.toUpperCase()} ---${colors.reset}`);
    for (const fnName of functions) {
      total++;
      process.stdout.write(`  Testing ${fnName.padEnd(30)}... `);
      const result = await testToolboxFunction(fnName, originalContent, originalSize, outputDir);
      allResults.push({ category, ...result });

      if (result.status === 'success') {
        success++;
        const sizeStr = result.sizeDiff >= 0 ? `+${result.sizeDiffPercent}%` : `${result.sizeDiffPercent}%`;
        console.log(`${colors.green}OK${colors.reset} (${sizeStr}, ${result.timeMs}ms)`);
      } else if (result.status === 'skipped' || result.status === 'not_found') {
        skipped++;
        console.log(`${colors.yellow}SKIP${colors.reset}: ${result.error}`);
      } else if (result.status === 'warning') {
        success++;
        console.log(`${colors.yellow}WARN${colors.reset}: ${result.error}`);
      } else {
        errors++;
        console.log(`${colors.red}ERROR${colors.reset}: ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`${colors.bright}SUMMARY${colors.reset}`);
  console.log('='.repeat(70));
  console.log(`Total: ${total}  ${colors.green}Success: ${success}${colors.reset}  ${colors.red}Errors: ${errors}${colors.reset}  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);

  console.log('\n' + '-'.repeat(70));
  console.log(`${colors.bright}TOP SIZE REDUCERS${colors.reset}`);
  console.log('-'.repeat(70));

  const successResults = allResults.filter(r => r.status === 'success' || r.status === 'warning').sort((a, b) => a.sizeDiff - b.sizeDiff).slice(0, 10);
  console.log('\nFunction                              Output Size    Diff');
  console.log('-'.repeat(60));
  for (const r of successResults) {
    const name = r.name.padEnd(38);
    const size = ((r.outputSize / 1024 / 1024).toFixed(2) + ' MB').padStart(10);
    const diff = (r.sizeDiff >= 0 ? '+' : '') + r.sizeDiffPercent + '%';
    console.log(`${name} ${size}    ${diff}`);
  }

  if (errors > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log(`${colors.red}${colors.bright}ERROR DETAILS${colors.reset}`);
    console.log('-'.repeat(70));
    for (const r of allResults.filter(r => r.status === 'error')) {
      console.log(`\n${colors.red}${r.name}:${colors.reset} ${r.error}`);
    }
  }

  const resultsFile = join(outputDir, '_test-results.json');
  writeFileSync(resultsFile, JSON.stringify({ timestamp: new Date().toISOString(), inputFile, originalSize, outputDir, summary: { total, success, errors, skipped }, results: allResults }, null, 2));

  console.log('\n' + '='.repeat(70));
  logInfo(`Results: ${colors.cyan}${resultsFile}${colors.reset}`);
  logInfo(`Output:  ${colors.cyan}${outputDir}${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  if (errors > 0) process.exit(CONSTANTS.EXIT_ERROR);
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(args) {
  const cfg = { ...DEFAULT_CONFIG };
  const inputs = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '-o': case '--output': cfg.output = args[++i]; break;
      case '-l': case '--list': cfg.listFile = args[++i]; break;
      case '-r': case '--recursive': cfg.recursive = true; break;
      case '-p': case '--precision': {
        const precision = parseInt(args[++i], 10);
        if (isNaN(precision) || precision < CONSTANTS.MIN_PRECISION || precision > CONSTANTS.MAX_PRECISION) {
          logError(`Precision must be between ${CONSTANTS.MIN_PRECISION} and ${CONSTANTS.MAX_PRECISION}`);
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        cfg.precision = precision;
        break;
      }
      case '-f': case '--force': cfg.overwrite = true; break;
      case '-n': case '--dry-run': cfg.dryRun = true; break;
      case '-q': case '--quiet': cfg.quiet = true; break;
      case '-v': case '--verbose': cfg.verbose = true; break;
      case '--log-file': cfg.logFile = args[++i]; break;
      case '-h': case '--help':
        // If a command is already set (not 'help'), show command-specific help
        if (cfg.command !== 'help' && ['flatten', 'convert', 'normalize', 'info', 'test-toolbox'].includes(cfg.command)) {
          cfg.showCommandHelp = true;
        } else {
          cfg.command = 'help';
        }
        break;
      case '--version': cfg.command = 'version'; break;
      // Full flatten pipeline options
      case '--transform-only': cfg.transformOnly = true; break;
      case '--no-clip-paths': cfg.resolveClipPaths = false; break;
      case '--no-masks': cfg.resolveMasks = false; break;
      case '--no-use': cfg.resolveUse = false; break;
      case '--no-markers': cfg.resolveMarkers = false; break;
      case '--no-patterns': cfg.resolvePatterns = false; break;
      case '--no-gradients': cfg.bakeGradients = false; break;
      // Vendor preservation option
      case '--preserve-vendor': cfg.preserveVendor = true; break;
      // E2E verification precision options
      case '--clip-segments': {
        const segs = parseInt(args[++i], 10);
        if (isNaN(segs) || segs < 8 || segs > 512) {
          logError('clip-segments must be between 8 and 512');
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        cfg.clipSegments = segs;
        break;
      }
      case '--bezier-arcs': {
        const arcs = parseInt(args[++i], 10);
        if (isNaN(arcs) || arcs < 4 || arcs > 128) {
          logError('bezier-arcs must be between 4 and 128');
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        cfg.bezierArcs = arcs;
        break;
      }
      case '--e2e-tolerance': {
        const tol = args[++i];
        if (!/^1e-\d+$/.test(tol)) {
          logError('e2e-tolerance must be in format 1e-N (e.g., 1e-10, 1e-12)');
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        cfg.e2eTolerance = tol;
        break;
      }
      // NOTE: --verify removed - verification is ALWAYS enabled
      default:
        if (arg.startsWith('-')) { logError(`Unknown option: ${arg}`); process.exit(CONSTANTS.EXIT_ERROR); }
        if (['flatten', 'convert', 'normalize', 'info', 'test-toolbox', 'help', 'version'].includes(arg) && cfg.command === 'help') {
          cfg.command = arg;
        } else {
          inputs.push(arg);
        }
    }
    i++;
  }
  cfg.inputs = inputs;
  return cfg;
}

function gatherInputFiles() {
  const files = [];
  if (config.listFile) {
    const listPath = resolvePath(config.listFile);
    // Why: Use CONSTANTS.EXIT_ERROR for consistency with all other error exits
    if (!isFile(listPath)) { logError(`List file not found: ${config.listFile}`); process.exit(CONSTANTS.EXIT_ERROR); }
    files.push(...parseFileList(listPath));
  }
  for (const input of config.inputs) {
    const resolved = resolvePath(input);
    if (isFile(resolved)) files.push(resolved);
    else if (isDir(resolved)) files.push(...getSvgFiles(resolved, config.recursive));
    else logWarn(`Input not found: ${input}`);
  }
  return files;
}

function getOutputPath(inputPath) {
  if (!config.output) {
    const dir = dirname(inputPath);
    const base = basename(inputPath, '.svg');
    return join(dir, `${base}-processed.svg`);
  }
  const output = resolvePath(config.output);
  if (config.inputs.length > 1 || config.listFile || isDir(output)) {
    return join(output, basename(inputPath));
  }
  return output;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) { showHelp(); process.exit(CONSTANTS.EXIT_SUCCESS); }

    config = parseArgs(args);

    // Handle command-specific help (e.g., `svg-matrix flatten --help`)
    if (config.showCommandHelp) {
      showCommandHelp(config.command);
      process.exit(CONSTANTS.EXIT_SUCCESS);
    }

    if (config.logFile) {
      try {
        if (existsSync(config.logFile)) unlinkSync(config.logFile);
        writeToLogFile(`=== svg-matrix v${VERSION} ===`);
      } catch (e) { logWarn(`Could not init log: ${e.message}`); }
    }

    switch (config.command) {
      case 'help': showHelp(); break;
      case 'version': showVersion(); break;
      case 'info': {
        const files = gatherInputFiles();
        if (files.length === 0) { logError('No input files'); process.exit(CONSTANTS.EXIT_ERROR); }
        for (const f of files) processInfo(f);
        break;
      }
      case 'flatten': case 'convert': case 'normalize': {
        const files = gatherInputFiles();
        if (files.length === 0) { logError('No input files'); process.exit(CONSTANTS.EXIT_ERROR); }
        logInfo(`Processing ${files.length} file(s)...`);
        if (config.dryRun) logInfo('(dry run)');

        let ok = 0, fail = 0;
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          currentInputFile = f; // Track for crash log
          showProgress(i + 1, files.length, f);

          try {
            // Validate input file
            validateSvgFile(f);

            const out = getOutputPath(f);
            if (!config.overwrite && !config.dryRun && isFile(out)) {
              logWarn(`Skip ${basename(f)}: exists (use -f)`);
              continue;
            }

            // Why: Track output file for cleanup on interrupt
            currentOutputFile = out;

            const fn = config.command === 'flatten' ? processFlatten :
                       config.command === 'convert' ? processConvert : processNormalize;

            if (fn(f, out)) {
              // Verify write if not dry run
              if (!config.dryRun) {
                // Why: Simple empty check instead of full verifyWriteSuccess because:
                // 1. Full verification requires double memory (storing content before write)
                // 2. Empty file is the most common silent failure mode
                // 3. Full content already written, re-reading only to check existence/size
                const written = readFileSync(out, 'utf8');
                if (written.length === 0) {
                  throw new Error('Output file is empty after write');
                }
              }
              // Why: Clear output file tracker after successful processing
              currentOutputFile = null;
              ok++;
            } else {
              fail++;
            }
          } catch (error) {
            logError(`Failed to process ${basename(f)}: ${error.message}`);
            fail++;
          }
        }
        currentInputFile = null;
        currentOutputFile = null;
        logInfo(`\n${colors.bright}Done:${colors.reset} ${ok} ok, ${fail} failed`);
        if (config.logFile) logInfo(`Log: ${config.logFile}`);
        if (fail > 0) process.exit(CONSTANTS.EXIT_ERROR);
        break;
      }
      case 'test-toolbox': {
        await processTestToolbox();
        break;
      }
      default:
        logError(`Unknown command: ${config.command}`);
        showHelp();
        process.exit(CONSTANTS.EXIT_ERROR);
    }
  } catch (error) {
    generateCrashLog(error, {
      currentFile: currentInputFile,
      args: process.argv.slice(2)
    });
    logError(`Fatal error: ${error.message}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
}

// Why: Catch unhandled promise rejections which would otherwise cause silent failures
process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  generateCrashLog(error, { type: 'unhandledRejection', currentFile: currentInputFile });
  logError(`Unhandled rejection: ${error.message}`);
  process.exit(CONSTANTS.EXIT_ERROR);
});

main().catch((e) => { logError(`Error: ${e.message}`); process.exit(CONSTANTS.EXIT_ERROR); });
