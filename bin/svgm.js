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

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { join, dirname, basename, extname, resolve, isAbsolute } from "path";
import yaml from "js-yaml";

// Import library modules
import { VERSION } from "../src/index.js";
import * as SVGToolbox from "../src/svg-toolbox.js";
import { parseSVG, serializeSVG } from "../src/svg-parser.js";
import {
  injectPolyfills,
  detectSVG2Features,
  setPolyfillMinification,
} from "../src/svg2-polyfills.js";

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
  SVG_EXTENSIONS: [".svg", ".svgz"],
};

// ============================================================================
// COLORS (respects NO_COLOR env)
// ============================================================================
const colors =
  process.env.NO_COLOR !== undefined || process.argv.includes("--no-color")
    ? {
        reset: "",
        red: "",
        yellow: "",
        green: "",
        cyan: "",
        dim: "",
        bright: "",
      }
    : {
        reset: "\x1b[0m",
        red: "\x1b[31m",
        yellow: "\x1b[33m",
        green: "\x1b[32m",
        cyan: "\x1b[36m",
        dim: "\x1b[2m",
        bright: "\x1b[1m",
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
  preserveNamespaces: [],
  preserveVendor: false,
  svg2Polyfills: false,
  showPlugins: false,
  configFile: null,
  // Embed options
  embed: false,
  embedImages: false,
  embedExternalSVGs: false,
  embedExternalSVGMode: "extract",
  embedCSS: false,
  embedFonts: false,
  embedScripts: false,
  embedAudio: false,
  embedSubsetFonts: false,
  embedRecursive: false,
  embedMaxRecursionDepth: 10,
  embedTimeout: 30000,
  embedOnMissingResource: "warn",
};

let config = { ...DEFAULT_CONFIG };

// ============================================================================
// LOGGING
// ============================================================================
/**
 * Log message to console unless in quiet mode.
 * @param {string} msg - Message to log
 * @returns {void}
 */
function log(msg) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof msg !== "string") {
    throw new TypeError(`log: expected string, got ${typeof msg}`);
  }
  if (!config.quiet) console.log(msg);
}

/**
 * Log error message to console.
 * @param {string} msg - Error message
 * @returns {void}
 */
function logError(msg) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof msg !== "string") {
    console.error(`${colors.red}error:${colors.reset} Invalid error message type: ${typeof msg}`);
    return;
  }
  console.error(`${colors.red}error:${colors.reset} ${msg}`);
}

// ============================================================================
// AVAILABLE OPTIMIZATIONS (matching SVGO plugins)
// ============================================================================
const OPTIMIZATIONS = [
  // Cleanup plugins
  { name: "cleanupAttributes", description: "Remove useless attributes" },
  { name: "cleanupIds", description: "Remove unused and minify used IDs" },
  {
    name: "cleanupNumericValues",
    description: "Round numeric values, remove default px units",
  },
  { name: "cleanupListOfValues", description: "Round list of numeric values" },
  {
    name: "cleanupEnableBackground",
    description: "Remove or fix enable-background attribute",
  },
  // Remove plugins
  { name: "removeDoctype", description: "Remove DOCTYPE declaration" },
  {
    name: "removeXMLProcInst",
    description: "Remove XML processing instructions",
  },
  { name: "removeComments", description: "Remove comments" },
  { name: "removeMetadata", description: "Remove <metadata> elements" },
  {
    name: "removeTitle",
    description: "Remove <title> elements (not in default)",
  },
  { name: "removeDesc", description: "Remove <desc> elements" },
  {
    name: "removeEditorsNSData",
    description: "Remove editor namespaces, elements, and attributes",
  },
  { name: "removeEmptyAttrs", description: "Remove empty attributes" },
  {
    name: "removeEmptyContainers",
    description: "Remove empty container elements",
  },
  { name: "removeEmptyText", description: "Remove empty text elements" },
  { name: "removeHiddenElements", description: "Remove hidden elements" },
  { name: "removeUselessDefs", description: "Remove unused <defs> content" },
  {
    name: "removeUnknownsAndDefaults",
    description: "Remove unknown elements and default attribute values",
  },
  {
    name: "removeNonInheritableGroupAttrs",
    description: "Remove non-inheritable presentation attributes from groups",
  },
  // Convert plugins
  { name: "convertShapesToPath", description: "Convert basic shapes to paths" },
  {
    name: "convertPathData",
    description: "Optimize path data: convert, remove useless, etc.",
  },
  {
    name: "convertTransform",
    description: "Collapse multiple transforms into one, convert matrices",
  },
  {
    name: "convertColors",
    description: "Convert color values to shorter form",
  },
  {
    name: "convertStyleToAttrs",
    description: "Convert style to presentation attributes (not in default)",
  },
  {
    name: "convertEllipseToCircle",
    description: "Convert ellipse to circle when rx equals ry",
  },
  // Structure plugins
  { name: "collapseGroups", description: "Collapse useless groups" },
  { name: "mergePaths", description: "Merge multiple paths into one" },
  {
    name: "moveGroupAttrsToElems",
    description: "Move group attributes to contained elements",
  },
  {
    name: "moveElemsAttrsToGroup",
    description: "Move common element attributes to parent group",
  },
  // Style plugins
  { name: "minifyStyles", description: "Minify <style> elements content" },
  {
    name: "inlineStyles",
    description: "Inline styles from <style> to element style attributes",
  },
  // Sort plugins
  {
    name: "sortAttrs",
    description: "Sort attributes for better gzip compression",
  },
  {
    name: "sortDefsChildren",
    description: "Sort children of <defs> for better gzip compression",
  },
];

// ============================================================================
// DEFAULT PIPELINE - Matches SVGO preset-default exactly (34 plugins)
// Order matters! This is the exact order from SVGO's preset-default.js
// ============================================================================
const DEFAULT_PIPELINE = [
  // 1-6: Initial cleanup (matching SVGO preset-default order)
  "removeDoctype",
  "removeXMLProcInst",
  "removeComments",
  // removeDeprecatedAttrs - not implemented (rarely needed)
  "removeMetadata",
  "removeEditorsNSData",
  // 7-11: Style processing
  "cleanupAttributes",
  // mergeStyles - not implemented
  "inlineStyles",
  "minifyStyles",
  "cleanupIds",
  // 12-18: Remove unnecessary elements
  "removeUselessDefs",
  "cleanupNumericValues",
  "convertColors",
  "removeUnknownsAndDefaults",
  "removeNonInheritableGroupAttrs",
  // removeUselessStrokeAndFill - not implemented
  "cleanupEnableBackground",
  "removeHiddenElements",
  "removeEmptyText",
  // 19-27: Convert and optimize
  // NOTE: convertShapesToPath removed - SVGO only converts when it saves bytes
  // Our version converts all shapes which often increases size
  "convertEllipseToCircle",
  "moveElemsAttrsToGroup",
  "moveGroupAttrsToElems",
  "collapseGroups",
  "convertPathData",
  "convertTransform",
  // 28-34: Final cleanup
  "removeEmptyAttrs",
  "removeEmptyContainers",
  "mergePaths",
  // removeUnusedNS - not implemented
  "sortAttrs",
  "sortDefsChildren",
  "removeDesc",
];

// ============================================================================
// PATH UTILITIES
// ============================================================================
/**
 * Normalize path separators to forward slashes.
 * @param {string} p - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(p) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof p !== "string") {
    throw new TypeError(`normalizePath: expected string, got ${typeof p}`);
  }
  return p.replace(/\\/g, "/");
}

/**
 * Resolve path to absolute path with normalized separators.
 * @param {string} p - Path to resolve
 * @returns {string} Absolute normalized path
 */
function resolvePath(p) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof p !== "string") {
    throw new TypeError(`resolvePath: expected string, got ${typeof p}`);
  }
  return isAbsolute(p)
    ? normalizePath(p)
    : normalizePath(resolve(process.cwd(), p));
}

/**
 * Check if path is a directory.
 * @param {string} p - Path to check
 * @returns {boolean} True if directory exists
 */
function isDir(p) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof p !== "string") return false;
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file.
 * @param {string} p - Path to check
 * @returns {boolean} True if file exists
 */
function isFile(p) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof p !== "string") return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, creating it if necessary.
 * @param {string} dir - Directory path
 * @returns {void}
 */
function ensureDir(dir) {
  // Why: Validate parameter to prevent runtime errors with null/undefined
  if (typeof dir !== "string") {
    throw new TypeError(`ensureDir: expected string, got ${typeof dir}`);
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get all SVG files in directory with optional exclusion patterns.
 * @param {string} dir - Directory path
 * @param {boolean} recursive - Whether to search recursively
 * @param {string[]} exclude - Array of exclusion patterns
 * @returns {string[]} Array of SVG file paths
 */
function getSvgFiles(dir, recursive = false, exclude = []) {
  // Why: Validate parameters to prevent runtime errors
  if (typeof dir !== "string") {
    throw new TypeError(`getSvgFiles: expected string dir, got ${typeof dir}`);
  }
  if (!existsSync(dir)) {
    throw new Error(`getSvgFiles: directory does not exist: ${dir}`);
  }
  if (!Array.isArray(exclude)) {
    throw new TypeError(`getSvgFiles: expected array exclude, got ${typeof exclude}`);
  }

  const files = [];
  function scan(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      // Check exclusion patterns
      const shouldExclude = exclude.some((pattern) => {
        try {
          // Why: Wrap RegExp constructor in try-catch to handle invalid patterns
          const regex = new RegExp(pattern);
          return regex.test(fullPath) || regex.test(entry.name);
        } catch (_e) {
          // Why: Catch invalid regex patterns (unused error marked with underscore per ESLint)
          logError(`Invalid exclusion pattern: ${pattern}`);
          return false;
        }
      });
      if (shouldExclude) continue;

      if (entry.isDirectory() && recursive) scan(fullPath);
      else if (
        entry.isFile() &&
        CONSTANTS.SVG_EXTENSIONS.includes(extname(entry.name).toLowerCase())
      ) {
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
/**
 * Optimize SVG content using default pipeline.
 * @param {string} content - SVG content
 * @param {Object} options - Optimization options
 * @returns {Promise<string>} Optimized SVG content
 */
async function optimizeSvg(content, options = {}) {
  // Why: Validate parameters to prevent runtime errors
  if (typeof content !== "string") {
    throw new TypeError(`optimizeSvg: expected string content, got ${typeof content}`);
  }
  if (content.length === 0) {
    throw new Error("optimizeSvg: content is empty");
  }
  if (options !== null && typeof options !== "object") {
    throw new TypeError(`optimizeSvg: expected object options, got ${typeof options}`);
  }
  const doc = parseSVG(content);
  const pipeline = DEFAULT_PIPELINE;

  // Detect SVG 2 features BEFORE optimization pipeline removes them
  // (removeUnknownsAndDefaults strips elements not in SVG 1.1 spec)
  let svg2Features = null;
  if (options.svg2Polyfills) {
    svg2Features = detectSVG2Features(doc);
  }

  // Run optimization pipeline
  for (const pluginName of pipeline) {
    const fn = SVGToolbox[pluginName];
    if (fn && typeof fn === "function") {
      try {
        await fn(doc, {
          precision: options.precision,
          preserveNamespaces: options.preserveNamespaces,
        });
      } catch {
        // Skip failed optimizations silently
      }
    }
  }

  // Multipass: run again if requested
  if (options.multipass) {
    for (const pluginName of pipeline) {
      const fn = SVGToolbox[pluginName];
      if (fn && typeof fn === "function") {
        try {
          await fn(doc, {
            precision: options.precision,
            preserveNamespaces: options.preserveNamespaces,
          });
        } catch {
          // Skip failed optimizations silently
        }
      }
    }
  }

  // Inject SVG 2 polyfills if requested (using pre-detected features)
  if (options.svg2Polyfills && svg2Features) {
    if (
      svg2Features.meshGradients.length > 0 ||
      svg2Features.hatches.length > 0
    ) {
      // Pass pre-detected features since pipeline may have removed SVG2 elements
      injectPolyfills(doc, { features: svg2Features });
    }
  }

  let result = serializeSVG(doc);

  // Pretty print if requested, otherwise minify (SVGO default behavior)
  if (options.pretty) {
    result = prettifyXml(result, options.indent);
  } else {
    result = minifyXml(result);
  }

  // Handle EOL
  if (options.eol === "crlf") {
    result = result.replace(/\n/g, "\r\n");
  }

  // Final newline
  if (options.finalNewline && !result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

/**
 * Minify XML output while keeping it valid.
 * KEEPS XML declaration (ensures valid SVG), removes whitespace between tags,
 * and collapses multiple spaces.
 * @param {string} xml - XML content to minify
 * @returns {string} Minified XML
 */
function minifyXml(xml) {
  // Why: Validate parameter to prevent runtime errors
  if (typeof xml !== "string") {
    throw new TypeError(`minifyXml: expected string, got ${typeof xml}`);
  }
  return (
    xml
      // Remove newlines and collapse whitespace between tags
      .replace(/>\s+</g, "><")
      // Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Prettify XML with indentation.
 * @param {string} xml - XML content to prettify
 * @param {number} indent - Number of spaces per indent level
 * @returns {string} Prettified XML
 */
function prettifyXml(xml, indent = 2) {
  // Why: Validate parameters to prevent runtime errors
  if (typeof xml !== "string") {
    throw new TypeError(`prettifyXml: expected string xml, got ${typeof xml}`);
  }
  if (typeof indent !== "number" || indent < 0 || indent > 16) {
    throw new RangeError(`prettifyXml: indent must be number 0-16, got ${indent}`);
  }
  // Simple XML prettifier
  const indentStr = " ".repeat(indent);
  let formatted = "";
  let depth = 0;

  // Split on tags
  xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .forEach((originalLine) => {
      const line = originalLine.trim();
      if (!line) return;

      // Decrease depth for closing tags
      if (line.startsWith("</")) {
        depth = Math.max(0, depth - 1);
      }

      formatted += indentStr.repeat(depth) + line + "\n";

      // Increase depth for opening tags (not self-closing)
      if (
        line.startsWith("<") &&
        !line.startsWith("</") &&
        !line.startsWith("<?") &&
        !line.startsWith("<!") &&
        !line.endsWith("/>") &&
        !line.includes("</")
      ) {
        depth++;
      }
    });

  return formatted.trim();
}

/**
 * Convert SVG content to data URI.
 * @param {string} content - SVG content
 * @param {string} format - Format: 'base64', 'enc', or 'unenc'
 * @returns {string} Data URI string
 */
function toDataUri(content, format) {
  // Why: Validate parameters to prevent runtime errors
  if (typeof content !== "string") {
    throw new TypeError(`toDataUri: expected string content, got ${typeof content}`);
  }
  const validFormats = ["base64", "enc", "unenc"];
  if (!validFormats.includes(format)) {
    throw new Error(`toDataUri: format must be one of ${validFormats.join(", ")}, got ${format}`);
  }
  if (format === "base64") {
    return (
      "data:image/svg+xml;base64," + Buffer.from(content).toString("base64")
    );
  } else if (format === "enc") {
    return "data:image/svg+xml," + encodeURIComponent(content);
  } else {
    return "data:image/svg+xml," + content;
  }
}

// ============================================================================
// PROCESS FILES
// ============================================================================
/**
 * Process single SVG file with optimization.
 * @param {string} inputPath - Input file path
 * @param {string} outputPath - Output file path
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result with success status and metrics
 */
async function processFile(inputPath, outputPath, options) {
  // Why: Validate parameters to prevent runtime errors
  if (typeof inputPath !== "string") {
    return { success: false, error: `Invalid input path: ${typeof inputPath}`, inputPath };
  }
  if (typeof outputPath !== "string") {
    return { success: false, error: `Invalid output path: ${typeof outputPath}`, inputPath };
  }
  if (options !== null && typeof options !== "object") {
    return { success: false, error: `Invalid options: ${typeof options}`, inputPath };
  }

  try {
    let content = readFileSync(inputPath, "utf8");
    const originalSize = Buffer.byteLength(content);

    // Why: Validate file size to prevent processing extremely large files
    if (originalSize > CONSTANTS.MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File too large: ${originalSize} bytes (max ${CONSTANTS.MAX_FILE_SIZE_BYTES} bytes)`,
        inputPath
      };
    }

    // Apply embedding if enabled
    if (options.embed) {
      const doc = parseSVG(content);
      const embedOptions = {
        images: options.embedImages,
        externalSVGs: options.embedExternalSVGs,
        externalSVGMode: options.embedExternalSVGMode,
        css: options.embedCSS,
        fonts: options.embedFonts,
        scripts: options.embedScripts,
        audio: options.embedAudio,
        subsetFonts: options.embedSubsetFonts,
        recursive: options.embedRecursive,
        maxRecursionDepth: options.embedMaxRecursionDepth,
        timeout: options.embedTimeout,
        onMissingResource: options.embedOnMissingResource,
        baseDir: dirname(inputPath),
      };

      if (SVGToolbox.embedExternalDependencies) {
        await SVGToolbox.embedExternalDependencies(doc, embedOptions);
        content = serializeSVG(doc);
      } else {
        log(
          `${colors.yellow}Warning:${colors.reset} embedExternalDependencies not available in svg-toolbox`,
        );
      }
    }

    const optimized = await optimizeSvg(content, options);
    const optimizedSize = Buffer.byteLength(optimized);

    let output = optimized;
    if (options.datauri) {
      output = toDataUri(optimized, options.datauri);
    }

    if (outputPath === "-") {
      process.stdout.write(output);
    } else {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, output, "utf8");
    }

    const savings = originalSize - optimizedSize;
    // Why: Handle case where optimizedSize > originalSize (negative savings)
    const percent = originalSize > 0
      ? ((savings / originalSize) * 100).toFixed(1)
      : "0.0";

    return {
      success: true,
      originalSize,
      optimizedSize,
      savings,
      percent,
      inputPath,
      outputPath,
    };
  } catch (error) {
    return { success: false, error: error.message, inputPath };
  }
}

// ============================================================================
// HELP
// ============================================================================
/**
 * Display help message.
 * @returns {void}
 */
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
  --preserve-ns <NS,...>     Preserve vendor namespaces (inkscape, sodipodi,
                             illustrator, figma, etc.). Comma-separated.
  --preserve-vendor          Keep all vendor prefixes and editor namespaces
  --svg2-polyfills           Inject JavaScript polyfills for SVG 2 features
                             (mesh gradients, hatches) for browser support
  --no-minify-polyfills      Use full (non-minified) polyfills for debugging
  --no-color                 Output plain text without color
  -h, --help                 Display help for command

Embed Options:
  --config <path>            Load settings from YAML configuration file
  --embed, --embed-all       Enable all embedding options
  --embed-images             Embed external images as data URIs
  --embed-external-svgs      Embed external SVG files
  --embed-svg-mode <mode>    Mode for external SVGs: 'extract' or 'full'
  --embed-css                Embed external CSS files
  --embed-fonts              Embed external font files
  --embed-scripts            Embed external JavaScript files
  --embed-audio              Embed external audio files
  --embed-subset-fonts       Subset fonts to used glyphs only
  --embed-recursive          Recursively embed dependencies
  --embed-max-depth <n>      Maximum recursion depth (default: 10)
  --embed-timeout <ms>       Timeout for external resources (default: 30000)
  --embed-on-missing <mode>  Handle missing resources: 'warn', 'fail', 'skip'

Examples:
  svgm input.svg -o output.svg
  svgm -f ./icons/ -o ./optimized/
  svgm input.svg --pretty --indent 4
  svgm -p 2 --multipass input.svg
  svgm input.svg --embed-all -o output.svg
  svgm input.svg --config svgm.yml -o output.svg

Docs: https://github.com/Emasoft/SVG-MATRIX#readme`);
}

/**
 * Display version number.
 * @returns {void}
 */
function showVersion() {
  console.log(VERSION);
}

/**
 * Display available optimization plugins.
 * @returns {void}
 */
function showPlugins() {
  console.log("\nAvailable optimizations:\n");
  for (const opt of OPTIMIZATIONS) {
    console.log(
      `  ${colors.green}${opt.name.padEnd(30)}${colors.reset} ${opt.description}`,
    );
  }
  console.log(`\nTotal: ${OPTIMIZATIONS.length} optimizations\n`);
}

// ============================================================================
// CONFIG FILE LOADING
// ============================================================================
/**
 * Load and parse configuration file (YAML).
 * @param {string} configPath - Path to config file
 * @returns {Object} Parsed configuration
 */
function loadConfigFile(configPath) {
  // Why: Validate parameter to prevent runtime errors
  if (typeof configPath !== "string") {
    logError(`Invalid config path: expected string, got ${typeof configPath}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  try {
    const absolutePath = resolvePath(configPath);
    if (!existsSync(absolutePath)) {
      logError(`Config file not found: ${configPath}`);
      process.exit(CONSTANTS.EXIT_ERROR);
    }
    const content = readFileSync(absolutePath, "utf8");
    // Why: Use safeLoad to prevent arbitrary code execution via YAML (security fix)
    const loadedConfig = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA });

    // Why: Validate loaded config is an object to prevent runtime errors
    if (loadedConfig === null || typeof loadedConfig !== "object") {
      logError(`Invalid config file: expected object, got ${typeof loadedConfig}`);
      process.exit(CONSTANTS.EXIT_ERROR);
    }

    // Convert YAML config structure to CLI config structure
    const result = {};

    if (loadedConfig.embed) {
      const embedCfg = loadedConfig.embed;
      if (embedCfg.images !== undefined) result.embedImages = embedCfg.images;
      if (embedCfg.externalSVGs !== undefined)
        result.embedExternalSVGs = embedCfg.externalSVGs;
      if (embedCfg.externalSVGMode !== undefined)
        result.embedExternalSVGMode = embedCfg.externalSVGMode;
      if (embedCfg.css !== undefined) result.embedCSS = embedCfg.css;
      if (embedCfg.fonts !== undefined) result.embedFonts = embedCfg.fonts;
      if (embedCfg.scripts !== undefined)
        result.embedScripts = embedCfg.scripts;
      if (embedCfg.audio !== undefined) result.embedAudio = embedCfg.audio;
      if (embedCfg.subsetFonts !== undefined)
        result.embedSubsetFonts = embedCfg.subsetFonts;
      if (embedCfg.recursive !== undefined)
        result.embedRecursive = embedCfg.recursive;
      if (embedCfg.maxRecursionDepth !== undefined)
        result.embedMaxRecursionDepth = embedCfg.maxRecursionDepth;
      if (embedCfg.timeout !== undefined)
        result.embedTimeout = embedCfg.timeout;
      if (embedCfg.onMissingResource !== undefined)
        result.embedOnMissingResource = embedCfg.onMissingResource;

      // If any embed option is enabled, set embed flag
      if (
        Object.keys(result).some(
          (key) => key.startsWith("embed") && result[key] === true,
        )
      ) {
        result.embed = true;
      }
    }

    // Support other config options if present
    if (loadedConfig.precision !== undefined)
      result.precision = loadedConfig.precision;
    if (loadedConfig.multipass !== undefined)
      result.multipass = loadedConfig.multipass;
    if (loadedConfig.pretty !== undefined) result.pretty = loadedConfig.pretty;
    if (loadedConfig.indent !== undefined) result.indent = loadedConfig.indent;
    if (loadedConfig.quiet !== undefined) result.quiet = loadedConfig.quiet;

    return result;
  } catch (error) {
    logError(`Failed to load config file: ${error.message}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================
/**
 * Helper to safely get next argument with bounds checking.
 * @param {string[]} args - Arguments array
 * @param {number} i - Current index
 * @param {string} flag - Flag name for error message
 * @returns {string} Next argument value
 */
function getNextArg(args, i, flag) {
  // Why: Validate parameters to prevent runtime errors
  if (!Array.isArray(args)) {
    logError(`getNextArg: expected array args, got ${typeof args}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  if (typeof i !== "number" || i < 0) {
    logError(`getNextArg: expected non-negative number i, got ${typeof i}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  // Why: Validate bounds to prevent accessing undefined arguments
  if (i + 1 >= args.length) {
    logError(`${flag} requires a value`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  return args[i + 1];
}

/**
 * Parse command-line arguments.
 * @param {string[]} args - Command-line arguments
 * @returns {Object} Parsed configuration object
 */
function parseArgs(args) {
  // Why: Validate parameter to prevent runtime errors
  if (!Array.isArray(args)) {
    logError(`parseArgs: expected array, got ${typeof args}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  let cfg = { ...DEFAULT_CONFIG };
  const inputs = [];
  let i = 0;

  while (i < args.length) {
    let arg = args[i];
    let argValue = null;

    // Handle --arg=value format
    if (arg.includes("=") && arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      argValue = arg.substring(eqIdx + 1);
      arg = arg.substring(0, eqIdx);
    }

    switch (arg) {
      case "-v":
      case "--version":
        showVersion();
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case "-h":
      case "--help":
        showHelp();
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case "-i":
      case "--input":
        i++;
        while (i < args.length && !args[i].startsWith("-")) {
          inputs.push(args[i]);
          i++;
        }
        i--; // Back up one since the while loop went past
        break;

      case "-s":
      case "--string":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.string = getNextArg(args, i, arg);
        i++;
        break;

      case "-f":
      case "--folder":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.folder = getNextArg(args, i, arg);
        i++;
        break;

      case "-o":
      case "--output": {
        i++;
        // Collect output(s)
        const outputs = [];
        while (i < args.length && !args[i].startsWith("-")) {
          outputs.push(args[i]);
          i++;
        }
        i--;
        cfg.output = outputs.length === 1 ? outputs[0] : outputs;
        break;
      }

      case "-p":
      case "--precision":
        // Why: Use helper to safely get next argument with bounds checking
        {
          const precisionArg = getNextArg(args, i, arg);
          const parsed = parseInt(precisionArg, 10);
          // Why: Validate parseInt result to prevent NaN values
          if (isNaN(parsed)) {
            logError(`--precision requires a valid number, got: ${precisionArg}`);
            process.exit(CONSTANTS.EXIT_ERROR);
          }
          cfg.precision = parsed;
          i++;
        }
        break;

      case "--datauri":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.datauri = getNextArg(args, i, arg);
        i++;
        break;

      case "--multipass":
        cfg.multipass = true;
        break;

      case "--pretty":
        cfg.pretty = true;
        break;

      case "--indent":
        // Why: Use helper to safely get next argument with bounds checking
        {
          const indentArg = getNextArg(args, i, arg);
          const parsed = parseInt(indentArg, 10);
          // Why: Validate parseInt result to prevent NaN values
          if (isNaN(parsed)) {
            logError(`--indent requires a valid number, got: ${indentArg}`);
            process.exit(CONSTANTS.EXIT_ERROR);
          }
          cfg.indent = parsed;
          i++;
        }
        break;

      case "--eol":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.eol = getNextArg(args, i, arg);
        i++;
        break;

      case "--final-newline":
        cfg.finalNewline = true;
        break;

      case "-r":
      case "--recursive":
        cfg.recursive = true;
        break;

      case "--exclude":
        i++;
        while (i < args.length && !args[i].startsWith("-")) {
          cfg.exclude.push(args[i]);
          i++;
        }
        i--;
        break;

      case "-q":
      case "--quiet":
        cfg.quiet = true;
        break;

      case "--show-plugins":
        cfg.showPlugins = true;
        break;

      case "--preserve-ns":
        {
          // Why: Use helper to safely get next argument with bounds checking
          const val = argValue || getNextArg(args, i, arg);
          if (!argValue) i++; // Only increment if we used getNextArg
          if (!val) {
            logError(
              "--preserve-ns requires a comma-separated list of namespaces",
            );
            process.exit(CONSTANTS.EXIT_ERROR);
          }
          cfg.preserveNamespaces = val
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0);
        }
        break;

      case "--preserve-vendor":
        cfg.preserveVendor = true;
        break;

      case "--svg2-polyfills":
        cfg.svg2Polyfills = true;
        break;

      case "--no-minify-polyfills":
        cfg.noMinifyPolyfills = true;
        setPolyfillMinification(false);
        break;

      case "--no-color":
        // Already handled in colors initialization
        break;

      case "--config":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.configFile = getNextArg(args, i, arg);
        i++;
        break;

      case "--embed":
      case "--embed-all":
        cfg.embed = true;
        cfg.embedImages = true;
        cfg.embedExternalSVGs = true;
        cfg.embedCSS = true;
        cfg.embedFonts = true;
        cfg.embedScripts = true;
        cfg.embedAudio = true;
        cfg.embedSubsetFonts = true;
        cfg.embedRecursive = true;
        break;

      case "--embed-images":
        cfg.embed = true;
        cfg.embedImages = true;
        break;

      case "--embed-external-svgs":
        cfg.embed = true;
        cfg.embedExternalSVGs = true;
        break;

      case "--embed-svg-mode":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.embedExternalSVGMode = getNextArg(args, i, arg);
        i++;
        break;

      case "--embed-css":
        cfg.embed = true;
        cfg.embedCSS = true;
        break;

      case "--embed-fonts":
        cfg.embed = true;
        cfg.embedFonts = true;
        break;

      case "--embed-scripts":
        cfg.embed = true;
        cfg.embedScripts = true;
        break;

      case "--embed-audio":
        cfg.embed = true;
        cfg.embedAudio = true;
        break;

      case "--embed-subset-fonts":
        cfg.embed = true;
        cfg.embedSubsetFonts = true;
        break;

      case "--embed-recursive":
        cfg.embed = true;
        cfg.embedRecursive = true;
        break;

      case "--embed-max-depth":
        // Why: Use helper to safely get next argument with bounds checking
        {
          const depthArg = getNextArg(args, i, arg);
          const parsed = parseInt(depthArg, 10);
          // Why: Validate parseInt result to prevent NaN values
          if (isNaN(parsed)) {
            logError(`--embed-max-depth requires a valid number, got: ${depthArg}`);
            process.exit(CONSTANTS.EXIT_ERROR);
          }
          cfg.embedMaxRecursionDepth = parsed;
          i++;
        }
        break;

      case "--embed-timeout":
        // Why: Use helper to safely get next argument with bounds checking
        {
          const timeoutArg = getNextArg(args, i, arg);
          const parsed = parseInt(timeoutArg, 10);
          // Why: Validate parseInt result to prevent NaN values
          if (isNaN(parsed)) {
            logError(`--embed-timeout requires a valid number, got: ${timeoutArg}`);
            process.exit(CONSTANTS.EXIT_ERROR);
          }
          cfg.embedTimeout = parsed;
          i++;
        }
        break;

      case "--embed-on-missing":
        // Why: Use helper to safely get next argument with bounds checking
        cfg.embedOnMissingResource = getNextArg(args, i, arg);
        i++;
        break;

      default:
        if (arg.startsWith("-")) {
          logError(`Unknown option: ${arg}`);
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        inputs.push(arg);
    }
    i++;
  }

  cfg.inputs = inputs;

  // Validate numeric arguments
  // Why: Check type first before using isNaN to prevent incorrect validation
  if (
    cfg.precision !== undefined && cfg.precision !== null &&
    (typeof cfg.precision !== "number" || isNaN(cfg.precision) ||
     cfg.precision < CONSTANTS.MIN_PRECISION || cfg.precision > CONSTANTS.MAX_PRECISION)
  ) {
    logError(`--precision must be a number between ${CONSTANTS.MIN_PRECISION} and ${CONSTANTS.MAX_PRECISION}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  if (
    cfg.indent !== undefined && cfg.indent !== null &&
    (typeof cfg.indent !== "number" || isNaN(cfg.indent) || cfg.indent < 0 || cfg.indent > 16)
  ) {
    logError("--indent must be a number between 0 and 16");
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  if (
    cfg.embedMaxRecursionDepth !== undefined && cfg.embedMaxRecursionDepth !== null &&
    (typeof cfg.embedMaxRecursionDepth !== "number" || isNaN(cfg.embedMaxRecursionDepth) ||
      cfg.embedMaxRecursionDepth < 1 ||
      cfg.embedMaxRecursionDepth > 100)
  ) {
    logError("--embed-max-depth must be a number between 1 and 100");
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  if (
    cfg.embedTimeout !== undefined && cfg.embedTimeout !== null &&
    (typeof cfg.embedTimeout !== "number" || isNaN(cfg.embedTimeout) ||
      cfg.embedTimeout < 1000 ||
      cfg.embedTimeout > 300000)
  ) {
    logError("--embed-timeout must be a number between 1000 and 300000 (ms)");
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  // Validate enum arguments (only check if explicitly set, not null/undefined defaults)
  const validEol = ["lf", "crlf"];
  if (cfg.eol != null && !validEol.includes(cfg.eol)) {
    logError(`--eol must be one of: ${validEol.join(", ")}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  const validDatauri = ["base64", "enc", "unenc"];
  if (cfg.datauri != null && !validDatauri.includes(cfg.datauri)) {
    logError(`--datauri must be one of: ${validDatauri.join(", ")}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  const validSvgMode = ["extract", "full"];
  if (
    cfg.embedExternalSVGMode != null &&
    cfg.embedExternalSVGMode !== "extract" &&
    !validSvgMode.includes(cfg.embedExternalSVGMode)
  ) {
    logError(`--embed-svg-mode must be one of: ${validSvgMode.join(", ")}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }
  const validOnMissing = ["warn", "fail", "skip"];
  if (
    cfg.embedOnMissingResource != null &&
    !validOnMissing.includes(cfg.embedOnMissingResource)
  ) {
    logError(`--embed-on-missing must be one of: ${validOnMissing.join(", ")}`);
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  // Load config file if specified and merge with CLI options (CLI takes precedence)
  if (cfg.configFile) {
    const fileConfig = loadConfigFile(cfg.configFile);
    // Merge: file config first, then CLI overrides
    cfg = { ...DEFAULT_CONFIG, ...fileConfig, ...cfg };
  }

  return cfg;
}

// ============================================================================
// MAIN
// ============================================================================
/**
 * Main entry point for CLI.
 * @returns {Promise<void>}
 */
async function main() {
  // Why: Validate process.argv exists and is an array to prevent runtime errors
  if (!Array.isArray(process.argv)) {
    logError("process.argv is not an array");
    process.exit(CONSTANTS.EXIT_ERROR);
  }
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
    preserveNamespaces: config.preserveNamespaces,
    svg2Polyfills: config.svg2Polyfills,
    noMinifyPolyfills: config.noMinifyPolyfills, // Pass through for pipeline consistency
    // Embed options
    embed: config.embed,
    embedImages: config.embedImages,
    embedExternalSVGs: config.embedExternalSVGs,
    embedExternalSVGMode: config.embedExternalSVGMode,
    embedCSS: config.embedCSS,
    embedFonts: config.embedFonts,
    embedScripts: config.embedScripts,
    embedAudio: config.embedAudio,
    embedSubsetFonts: config.embedSubsetFonts,
    embedRecursive: config.embedRecursive,
    embedMaxRecursionDepth: config.embedMaxRecursionDepth,
    embedTimeout: config.embedTimeout,
    embedOnMissingResource: config.embedOnMissingResource,
  };

  // Handle string input
  if (config.string) {
    try {
      const result = await optimizeSvg(config.string, options);
      const output = config.datauri
        ? toDataUri(result, config.datauri)
        : result;
      if (config.output && config.output !== "-") {
        writeFileSync(config.output, output, "utf8");
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
    if (input === "-") {
      // STDIN handling would go here
      logError("STDIN not yet supported");
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
    logError("No input files");
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
      if (config.output === "-") {
        outputPath = "-";
      } else if (Array.isArray(config.output)) {
        // Why: Bounds check when accessing array to prevent undefined values
        if (config.output.length === 0) {
          logError("Output array is empty");
          process.exit(CONSTANTS.EXIT_ERROR);
        }
        outputPath = config.output[i] || config.output[config.output.length - 1];
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

      if (outputPath !== "-") {
        log(
          `${colors.green}${basename(inputPath)}${colors.reset} - ${result.originalSize} B -> ${result.optimizedSize} B (${result.percent}% saved)`,
        );
      }
    } else {
      errorCount++;
      logError(`${basename(inputPath)}: ${result.error}`);
    }
  }

  // Summary
  if (files.length > 1 && !config.quiet) {
    const totalSavings = totalOriginal - totalOptimized;
    const totalPercent =
      totalOriginal > 0 ? ((totalSavings / totalOriginal) * 100).toFixed(1) : 0;
    console.log(
      `\n${colors.bright}Total:${colors.reset} ${successCount} file(s) optimized, ${errorCount} error(s)`,
    );
    console.log(
      `${colors.bright}Savings:${colors.reset} ${totalOriginal} B -> ${totalOptimized} B (${totalPercent}% saved)`,
    );
  }

  if (errorCount > 0) {
    process.exit(CONSTANTS.EXIT_ERROR);
  }
}

main().catch((e) => {
  logError(e.message);
  process.exit(CONSTANTS.EXIT_ERROR);
});
