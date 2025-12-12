#!/usr/bin/env node
/**
 * @fileoverview SVGO-compatible CLI for @emasoft/svg-matrix
 * Drop-in replacement for SVGO with arbitrary-precision transforms.
 *
 * Usage mirrors SVGO exactly:
 *   svgm input.svg                    # optimize in place
 *   svgm input.svg -o output.svg      # optimize to output
 *   svgm -f folder/ -o out/           # batch folder
 *   svgm -p 3 input.svg               # set precision
 *
 * @module bin/svgm
 * @license MIT
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname, resolve, isAbsolute } from 'path';

// Import library modules
import { VERSION } from '../src/index.js';
import * as SVGToolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

// ============================================================================
// CONSTANTS
// ============================================================================
const CONSTANTS = {
  DEFAULT_PRECISION: 6,
  MAX_PRECISION: 50,
  MIN_PRECISION: 0,
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  EXIT_SUCCESS: 0,
  EXIT_ERROR: 1,
  SVG_EXTENSIONS: ['.svg', '.svgz'],
};

// ============================================================================
// COLORS (respects NO_COLOR env)
// ============================================================================
const colors = process.env.NO_COLOR !== undefined || process.argv.includes('--no-color') ? {
  reset: '', red: '', yellow: '', green: '', cyan: '', dim: '', bright: '',
} : {
  reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m',
  green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', bright: '\x1b[1m',
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
  inputs: [],
  folder: null,
  output: null,
  string: null,
  precision: null, // null means use default from plugins
  multipass: false,
  pretty: false,
  indent: 2,
  eol: null,
  finalNewline: false,
  recursive: false,
  exclude: [],
  quiet: false,
  datauri: null,
  showPlugins: false,
};

let config = { ...DEFAULT_CONFIG };

// ============================================================================
// LOGGING
// ============================================================================
function log(msg) {
  if (!config.quiet) console.log(msg);
}

function logError(msg) {
  console.error(`${colors.red}error:${colors.reset} ${msg}`);
}

// ============================================================================
// AVAILABLE OPTIMIZATIONS (like SVGO plugins)
// ============================================================================
const OPTIMIZATIONS = [
  { name: 'cleanupIds', description: 'Remove unused and minify used IDs' },
  { name: 'cleanupNumericValues', description: 'Round numeric values, remove default values' },
  { name: 'cleanupListOfValues', description: 'Round list of numeric values' },
  { name: 'cleanupAttributes', description: 'Remove unnecessary attributes' },
  { name: 'removeDoctype', description: 'Remove DOCTYPE declaration' },
  { name: 'removeXMLProcInst', description: 'Remove XML processing instructions' },
  { name: 'removeComments', description: 'Remove comments' },
  { name: 'removeMetadata', description: 'Remove <metadata> elements' },
  { name: 'removeTitle', description: 'Remove <title> elements' },
  { name: 'removeDesc', description: 'Remove <desc> elements' },
  { name: 'removeEditorsNSData', description: 'Remove editor namespaces and data' },
  { name: 'removeEmptyAttrs', description: 'Remove empty attributes' },
  { name: 'removeEmptyContainers', description: 'Remove empty containers' },
  { name: 'removeEmptyText', description: 'Remove empty text elements' },
  { name: 'removeHiddenElements', description: 'Remove hidden elements' },
  { name: 'removeUselessDefs', description: 'Remove unused <defs> content' },
  { name: 'removeUnknownsAndDefaults', description: 'Remove unknown elements and default attributes' },
  { name: 'convertShapesToPath', description: 'Convert shapes to paths' },
  { name: 'convertPathData', description: 'Optimize path data' },
  { name: 'convertTransform', description: 'Collapse multiple transforms' },
  { name: 'convertColors', description: 'Convert color values to shorter form' },
  { name: 'convertStyleToAttrs', description: 'Convert style to attributes' },
  { name: 'convertEllipseToCircle', description: 'Convert ellipse to circle when rx=ry' },
  { name: 'collapseGroups', description: 'Collapse useless groups' },
  { name: 'mergePaths', description: 'Merge multiple paths into one' },
  { name: 'moveGroupAttrsToElems', description: 'Move group attributes to elements' },
  { name: 'moveElemsAttrsToGroup', description: 'Move common element attributes to group' },
  { name: 'minifyStyles', description: 'Minify <style> content' },
  { name: 'inlineStyles', description: 'Inline styles from <style>' },
  { name: 'sortAttrs', description: 'Sort attributes for better compression' },
  { name: 'sortDefsChildren', description: 'Sort <defs> children for better compression' },
];

// Default optimization pipeline (matches SVGO defaults)
const DEFAULT_PIPELINE = [
  'removeDoctype',
  'removeXMLProcInst',
  'removeComments',
  'removeMetadata',
  'removeEditorsNSData',
  'cleanupAttributes',
  'cleanupNumericValues',
  'convertColors',
  'removeUnknownsAndDefaults',
  'removeEmptyAttrs',
  'removeEmptyContainers',
  'removeEmptyText',
  'removeHiddenElements',
  'removeUselessDefs',
  'convertShapesToPath',
  'convertPathData',
  'convertTransform',
  'collapseGroups',
  'mergePaths',
  'sortAttrs',
  'cleanupIds',
];

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
  }
}

function getSvgFiles(dir, recursive = false, exclude = []) {
  const files = [];
  function scan(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      // Check exclusion patterns
      const shouldExclude = exclude.some(pattern => {
        const regex = new RegExp(pattern);
        return regex.test(fullPath) || regex.test(entry.name);
      });
      if (shouldExclude) continue;

      if (entry.isDirectory() && recursive) scan(fullPath);
      else if (entry.isFile() && CONSTANTS.SVG_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
        files.push(normalizePath(fullPath));
      }
    }
  }
  scan(dir);
  return files;
}

// ============================================================================
// SVG OPTIMIZATION
// ============================================================================
async function optimizeSvg(content, options = {}) {
  const doc = parseSVG(content);
  const pipeline = DEFAULT_PIPELINE;

  // Run optimization pipeline
  for (const pluginName of pipeline) {
    const fn = SVGToolbox[pluginName];
    if (fn && typeof fn === 'function') {
      try {
        await fn(doc, { precision: options.precision });
      } catch (e) {
        // Skip failed optimizations silently
      }
    }
  }

  // Multipass: run again if requested
  if (options.multipass) {
    for (const pluginName of pipeline) {
      const fn = SVGToolbox[pluginName];
      if (fn && typeof fn === 'function') {
        try {
          await fn(doc, { precision: options.precision });
        } catch (e) {
          // Skip failed optimizations silently
        }
      }
    }
  }

  let result = serializeSVG(doc);

  // Pretty print if requested
  if (options.pretty) {
    result = prettifyXml(result, options.indent);
  }

  // Handle EOL
  if (options.eol === 'crlf') {
    result = result.replace(/\n/g, '\r\n');
  }

  // Final newline
  if (options.finalNewline && !result.endsWith('\n')) {
    result += '\n';
  }

  return result;
}

function prettifyXml(xml, indent = 2) {
  // Simple XML prettifier
  const indentStr = ' '.repeat(indent);
  let formatted = '';
  let depth = 0;

  // Split on tags
  xml.replace(/>\s*</g, '>\n<').split('\n').forEach(line => {
    line = line.trim();
    if (!line) return;

    // Decrease depth for closing tags
    if (line.startsWith('</')) {
      depth = Math.max(0, depth - 1);
    }

    formatted += indentStr.repeat(depth) + line + '\n';

    // Increase depth for opening tags (not self-closing)
    if (line.startsWith('<') && !line.startsWith('</') && !line.startsWith('<?') &&
        !line.startsWith('<!') && !line.endsWith('/>') && !line.includes('</')) {
      depth++;
    }
  });

  return formatted.trim();
}

function toDataUri(content, format) {
  if (format === 'base64') {
    return 'data:image/svg+xml;base64,' + Buffer.from(content).toString('base64');
  } else if (format === 'enc') {
    return 'data:image/svg+xml,' + encodeURIComponent(content);
  } else {
    return 'data:image/svg+xml,' + content;
  }
}

// ============================================================================
// PROCESS FILES
// ============================================================================
async function processFile(inputPath, outputPath, options) {
  try {
    const content = readFileSync(inputPath, 'utf8');
    const originalSize = Buffer.byteLength(content);

    const optimized = await optimizeSvg(content, options);
    const optimizedSize = Buffer.byteLength(optimized);

    let output = optimized;
    if (options.datauri) {
      output = toDataUri(optimized, options.datauri);
    }

    if (outputPath === '-') {
      process.stdout.write(output);
    } else {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, output, 'utf8');
    }

    const savings = originalSize - optimizedSize;
    const percent = ((savings / originalSize) * 100).toFixed(1);

    return { success: true, originalSize, optimizedSize, savings, percent, inputPath, outputPath };
  } catch (error) {
    return { success: false, error: error.message, inputPath };
  }
}

// ============================================================================
// HELP
// ============================================================================
function showHelp() {
  console.log(`Usage: svgm [options] [INPUT...]

SVGM is an SVGO-compatible CLI powered by svg-matrix for arbitrary-precision
SVG optimization.

Arguments:
  INPUT                      Input files (or use -i, -f, -s)

Options:
  -v, --version              Output the version number
  -i, --input <INPUT...>     Input files, "-" for STDIN
  -s, --string <STRING>      Input SVG data string
  -f, --folder <FOLDER>      Input folder, optimize and rewrite all *.svg files
  -o, --output <OUTPUT...>   Output file or folder (by default same as input),
                             "-" for STDOUT
  -p, --precision <INTEGER>  Set number of digits in the fractional part,
                             overrides plugins params
  --datauri <FORMAT>         Output as Data URI string (base64), URI encoded
                             (enc) or unencoded (unenc)
  --multipass                Pass over SVGs multiple times to ensure all
                             optimizations are applied
  --pretty                   Make SVG pretty printed
  --indent <INTEGER>         Indent number when pretty printing SVGs
  --eol <EOL>                Line break to use when outputting SVG: lf, crlf
  --final-newline            Ensure SVG ends with a line break
  -r, --recursive            Use with '--folder'. Optimizes *.svg files in
                             folders recursively.
  --exclude <PATTERN...>     Use with '--folder'. Exclude files matching
                             regular expression pattern.
  -q, --quiet                Only output error messages
  --show-plugins             Show available plugins and exit
  --no-color                 Output plain text without color
  -h, --help                 Display help for command

Examples:
  svgm input.svg -o output.svg
  svgm -f ./icons/ -o ./optimized/
  svgm input.svg --pretty --indent 4
  svgm -p 2 --multipass input.svg

Docs: https://github.com/Emasoft/SVG-MATRIX#readme`);
}

function showVersion() {
  console.log(VERSION);
}

function showPlugins() {
  console.log('\nAvailable optimizations:\n');
  for (const opt of OPTIMIZATIONS) {
    console.log(`  ${colors.green}${opt.name.padEnd(30)}${colors.reset} ${opt.description}`);
  }
  console.log(`\nTotal: ${OPTIMIZATIONS.length} optimizations\n`);
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
      case '-v':
      case '--version':
        showVersion();
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case '-h':
      case '--help':
        showHelp();
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case '-i':
      case '--input':
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          inputs.push(args[i]);
          i++;
        }
        i--; // Back up one since the while loop went past
        break;

      case '-s':
      case '--string':
        cfg.string = args[++i];
        break;

      case '-f':
      case '--folder':
        cfg.folder = args[++i];
        break;

      case '-o':
      case '--output':
        i++;
        // Collect output(s)
        const outputs = [];
        while (i < args.length && !args[i].startsWith('-')) {
          outputs.push(args[i]);
          i++;
        }
        i--;
        cfg.output = outputs.length === 1 ? outputs[0] : outputs;
        break;

      case '-p':
      case '--precision':
        cfg.precision = parseInt(args[++i], 10);
        break;

      case '--datauri':
        cfg.datauri = args[++i];
        break;

      case '--multipass':
        cfg.multipass = true;
        break;

      case '--pretty':
        cfg.pretty = true;
        break;

      case '--indent':
        cfg.indent = parseInt(args[++i], 10);
        break;

      case '--eol':
        cfg.eol = args[++i];
        break;

      case '--final-newline':
        cfg.finalNewline = true;
        break;

      case '-r':
      case '--recursive':
        cfg.recursive = true;
        break;

      case '--exclude':
        i++;
        while (i < args.length && !args[i].startsWith('-')) {
          cfg.exclude.push(args[i]);
          i++;
        }
        i--;
        break;

      case '-q':
      case '--quiet':
        cfg.quiet = true;
        break;

      case '--show-plugins':
        cfg.showPlugins = true;
        break;

      case '--no-color':
        // Already handled in colors initialization
        break;

      default:
        if (arg.startsWith('-')) {
          logError(`Unknown option: ${arg}`);
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        inputs.push(arg);
    }
    i++;
  }

  cfg.inputs = inputs;
  return cfg;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  config = parseArgs(args);

  if (config.showPlugins) {
    showPlugins();
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  const options = {
    precision: config.precision,
    multipass: config.multipass,
    pretty: config.pretty,
    indent: config.indent,
    eol: config.eol,
    finalNewline: config.finalNewline,
    datauri: config.datauri,
  };

  // Handle string input
  if (config.string) {
    try {
      const result = await optimizeSvg(config.string, options);
      const output = config.datauri ? toDataUri(result, config.datauri) : result;
      if (config.output && config.output !== '-') {
        writeFileSync(config.output, output, 'utf8');
        log(`${colors.green}Done!${colors.reset}`);
      } else {
        process.stdout.write(output);
      }
    } catch (e) {
      logError(e.message);
      process.exit(CONSTANTS.EXIT_ERROR);
    }
    return;
  }

  // Gather input files
  let files = [];

  if (config.folder) {
    const folderPath = resolvePath(config.folder);
    if (!isDir(folderPath)) {
      logError(`Folder not found: ${config.folder}`);
      process.exit(CONSTANTS.EXIT_ERROR);
    }
    files = getSvgFiles(folderPath, config.recursive, config.exclude);
  }

  // Add explicit inputs
  for (const input of config.inputs) {
    if (input === '-') {
      // STDIN handling would go here
      logError('STDIN not yet supported');
      process.exit(CONSTANTS.EXIT_ERROR);
    }
    const resolved = resolvePath(input);
    if (isFile(resolved)) {
      files.push(resolved);
    } else if (isDir(resolved)) {
      files.push(...getSvgFiles(resolved, config.recursive, config.exclude));
    } else {
      logError(`File not found: ${input}`);
      process.exit(CONSTANTS.EXIT_ERROR);
    }
  }

  if (files.length === 0) {
    logError('No input files');
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  // Process files
  let totalOriginal = 0;
  let totalOptimized = 0;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const inputPath = files[i];
    let outputPath;

    if (config.output) {
      if (config.output === '-') {
        outputPath = '-';
      } else if (Array.isArray(config.output)) {
        outputPath = config.output[i] || config.output[0];
      } else if (files.length > 1 || isDir(resolvePath(config.output))) {
        // Multiple files or output is a directory
        outputPath = join(resolvePath(config.output), basename(inputPath));
      } else {
        outputPath = resolvePath(config.output);
      }
    } else {
      // In-place optimization (same as input)
      outputPath = inputPath;
    }

    const result = await processFile(inputPath, outputPath, options);

    if (result.success) {
      successCount++;
      totalOriginal += result.originalSize;
      totalOptimized += result.optimizedSize;

      if (outputPath !== '-') {
        log(`${colors.green}${basename(inputPath)}${colors.reset} - ${result.originalSize} B -> ${result.optimizedSize} B (${result.percent}% saved)`);
      }
    } else {
      errorCount++;
      logError(`${basename(inputPath)}: ${result.error}`);
    }
  }

  // Summary
  if (files.length > 1 && !config.quiet) {
    const totalSavings = totalOriginal - totalOptimized;
    const totalPercent = totalOriginal > 0 ? ((totalSavings / totalOriginal) * 100).toFixed(1) : 0;
    console.log(`\n${colors.bright}Total:${colors.reset} ${successCount} file(s) optimized, ${errorCount} error(s)`);
    console.log(`${colors.bright}Savings:${colors.reset} ${totalOriginal} B -> ${totalOptimized} B (${totalPercent}% saved)`);
  }

  if (errorCount > 0) {
    process.exit(CONSTANTS.EXIT_ERROR);
  }
}

main().catch((e) => {
  logError(e.message);
  process.exit(CONSTANTS.EXIT_ERROR);
});
