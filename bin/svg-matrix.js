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
import { VERSION } from '../src/index.js';

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

function showHelp() {
  console.log(`
${colors.cyan}${colors.bright}@emasoft/svg-matrix${colors.reset} v${VERSION}
High-precision SVG matrix and transformation CLI

${colors.bright}USAGE:${colors.reset}
  svg-matrix <command> [options] <input> [-o <output>]

${colors.bright}COMMANDS:${colors.reset}
  flatten     Flatten SVG transforms into path data
  convert     Convert shapes (rect, circle, etc.) to paths
  normalize   Convert paths to absolute cubic Bezier curves
  info        Show SVG file information
  help        Show this help message
  version     Show version number

${colors.bright}OPTIONS:${colors.reset}
  -o, --output <path>     Output file or directory
  -l, --list <file>       Read input files from text file
  -r, --recursive         Process directories recursively
  -p, --precision <n>     Decimal precision (default: 6)
  -f, --force             Overwrite existing output files
  -n, --dry-run           Show what would be done
  -q, --quiet             Suppress all output except errors
  -v, --verbose           Enable verbose/debug output
  --log-file <path>       Write log to file
  -h, --help              Show help

${colors.bright}EXAMPLES:${colors.reset}
  svg-matrix flatten input.svg -o output.svg
  svg-matrix flatten ./svgs/ -o ./output/
  svg-matrix flatten --list files.txt -o ./output/
  svg-matrix convert input.svg -o output.svg --precision 10
  svg-matrix info input.svg

${colors.bright}FILE LIST FORMAT:${colors.reset}
  One path per line. Lines starting with # are comments.

${colors.bright}DOCUMENTATION:${colors.reset}
  https://github.com/Emasoft/SVG-MATRIX#readme
`);
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
 * Flatten transforms in SVG content by baking transforms into path data.
 * Handles: path elements, shape elements (converted to paths), and nested groups.
 * @param {string} inputPath - Input file path
 * @param {string} outputPath - Output file path
 * @returns {boolean} True if successful
 */
function processFlatten(inputPath, outputPath) {
  try {
    logDebug(`Processing: ${inputPath}`);
    let result = readFileSync(inputPath, 'utf8');
    let transformCount = 0;
    let pathCount = 0;
    let shapeCount = 0;

    // Step 1: Flatten transforms on path elements
    // Note: regex captures attrs without the closing /> or >
    result = result.replace(/<path\s+([^>]*?)\s*\/?>/gi, (match, attrs) => {
      const transform = extractTransform(attrs);
      const pathD = extractPathD(attrs);

      if (!transform || !pathD) {
        return match; // No transform or no path data, skip
      }

      try {
        // Parse the transform and build CTM
        const ctm = SVGFlatten.parseTransformAttribute(transform);
        // Transform the path data
        const transformedD = SVGFlatten.transformPathData(pathD, ctm, { precision: config.precision });
        // Remove transform and update path data
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
          return match; // No transform, skip
        }

        try {
          // Extract shape attributes and convert to path using helper
          const pathD = extractShapeAsPath(shapeType, attrs, config.precision);

          if (!pathD) {
            return match; // Couldn't convert to path
          }

          // Parse the transform and build CTM
          const ctm = SVGFlatten.parseTransformAttribute(transform);
          // Transform the path data
          const transformedD = SVGFlatten.transformPathData(pathD, ctm, { precision: config.precision });
          // Build new path element, preserving style attributes
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

    // Step 3: Handle group transforms by propagating to children
    // This is a simplified approach - for full support, we'd need DOM parsing
    // For now, we handle the case where a <g> has a transform and contains paths/shapes
    let groupIterations = 0;

    while (groupIterations < CONSTANTS.MAX_GROUP_ITERATIONS) {
      const beforeResult = result;

      // Find groups with transforms
      result = result.replace(
        /<g([^>]*transform\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/g>/gi,
        (match, gAttrs, groupTransform, content) => {
          try {
            const groupCtm = SVGFlatten.parseTransformAttribute(groupTransform);
            let modifiedContent = content;
            let childrenModified = false;

            // Apply group transform to child paths
            modifiedContent = modifiedContent.replace(/<path\s+([^>]*?)\s*\/?>/gi, (pathMatch, pathAttrs) => {
              const pathD = extractPathD(pathAttrs);
              if (!pathD) return pathMatch;

              try {
                const childTransform = extractTransform(pathAttrs);
                let combinedCtm = groupCtm;

                // If child has its own transform, compose them
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
              // Remove transform from group
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

      // Check if anything changed
      if (result === beforeResult) {
        break;
      }
      groupIterations++;
    }

    logInfo(`Flattened ${transformCount} transforms (${pathCount} paths, ${shapeCount} shapes)`);

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
      case '-h': case '--help': cfg.command = 'help'; break;
      case '--version': cfg.command = 'version'; break;
      default:
        if (arg.startsWith('-')) { logError(`Unknown option: ${arg}`); process.exit(CONSTANTS.EXIT_ERROR); }
        if (['flatten', 'convert', 'normalize', 'info', 'help', 'version'].includes(arg) && cfg.command === 'help') {
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
