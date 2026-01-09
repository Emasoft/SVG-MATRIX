#!/usr/bin/env node
/**
 * @fileoverview SVG Font Management CLI
 *
 * Dedicated CLI tool for SVG font operations:
 * - Embed external fonts as base64 data URIs
 * - Extract embedded fonts to files
 * - Apply font replacement maps
 * - Interactive font management mode
 *
 * @module bin/svgfonts
 * @license MIT
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  realpathSync,
} from "fs";
import { join, basename, extname, resolve, isAbsolute } from "path";
import { createInterface } from "readline";

// Import library modules
import { VERSION } from "../src/index.js";
import * as SVGToolbox from "../src/svg-toolbox.js";
import { parseSVG, serializeSVG } from "../src/svg-parser.js";
import * as FontManager from "../src/font-manager.js";

// ============================================================================
// CONSTANTS
// ============================================================================
const CONSTANTS = {
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  EXIT_SUCCESS: 0,
  EXIT_ERROR: 1,
  SVG_EXTENSIONS: [".svg", ".svgz"],
  DEFAULT_TIMEOUT: 30000,
  DEFAULT_FONTS_DIR: "./fonts",
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
        magenta: "",
      }
    : {
        reset: "\x1b[0m",
        red: "\x1b[31m",
        yellow: "\x1b[33m",
        green: "\x1b[32m",
        cyan: "\x1b[36m",
        dim: "\x1b[2m",
        bright: "\x1b[1m",
        magenta: "\x1b[35m",
      };

// ============================================================================
// CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
  command: null,
  inputs: [],
  output: null,
  recursive: false,
  quiet: false,
  verbose: false,
  noBackup: false,
  validate: false,
  dryRun: false,
  // Embed options
  subset: true,
  full: false,
  woff2: false,
  source: null, // 'google' | 'local' | 'fontget' | 'fnt'
  timeout: CONSTANTS.DEFAULT_TIMEOUT,
  useCache: true,
  searchAlternatives: false,
  // Replace options
  mapFile: null,
  autoDownload: true,
  // Extract options
  extractDir: CONSTANTS.DEFAULT_FONTS_DIR,
  restoreLinks: false,
  // Template options
  templateOutput: null,
  // Cache options
  cacheAction: "stats", // 'stats' | 'clean' | 'list'
  maxAge: 30, // days
  // Search options
  query: null,
  limit: 10,
  threshold: 0.3,
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

function logWarn(msg) {
  if (!config.quiet) console.warn(`${colors.yellow}warn:${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  if (!config.quiet) console.log(`${colors.green}${msg}${colors.reset}`);
}

function logVerbose(msg) {
  if (config.verbose && !config.quiet) {
    console.log(`${colors.dim}${msg}${colors.reset}`);
  }
}

// ============================================================================
// HELP
// ============================================================================
const HELP = `
${colors.bright}svgfonts${colors.reset} - SVG Font Management Tool v${VERSION}

${colors.cyan}USAGE:${colors.reset}
  svgfonts [command] [options] <input.svg...>

${colors.cyan}COMMANDS:${colors.reset}
  embed       Embed external fonts into SVG (default)
  extract     Extract embedded fonts to files
  replace     Apply font replacement map
  list        List fonts in SVG
  interactive Interactive font management mode
  template    Generate replacement map template
  cache       Manage font cache (stats, clean)
  search      Search for fonts by name with similarity matching
  dedupe      Detect and merge duplicate @font-face rules

${colors.cyan}GLOBAL OPTIONS:${colors.reset}
  -i, --input <file>       Input SVG file(s)
  -o, --output <file>      Output file (default: overwrite input)
  -r, --recursive          Process directories recursively
  -q, --quiet              Suppress output
  -v, --verbose            Verbose output
  --no-backup              Skip backup creation (default: create .bak)
  --validate               Validate SVG after each operation
  --dry-run                Show what would be done without changes
  --no-color               Disable colored output
  -h, --help               Show this help
  --version                Show version

${colors.cyan}EMBED OPTIONS:${colors.reset}
  --subset                 Only embed glyphs used in SVG (default)
  --full                   Embed complete font files
  --woff2                  Convert fonts to WOFF2 format (~30% smaller)
  --source <name>          Preferred font source (google|local|fontget|fnt)
  --timeout <ms>           Download timeout (default: 30000)
  --no-cache               Disable font caching (enabled by default)
  --search-alternatives    If font unavailable, search for alternatives

${colors.cyan}REPLACE OPTIONS:${colors.reset}
  --map <file>             Path to replacement YAML
  --no-auto-download       Don't download missing fonts automatically

${colors.cyan}EXTRACT OPTIONS:${colors.reset}
  --extract-dir <dir>      Directory for extracted fonts (default: ./fonts/)
  --restore-links          Convert back to external URL references

${colors.cyan}TEMPLATE OPTIONS:${colors.reset}
  --template-output <file> Output path for template (default: stdout)

${colors.cyan}CACHE OPTIONS:${colors.reset}
  --cache-action <action>  Cache action: stats, clean, list (default: stats)
  --max-age <days>         Max cache age in days for clean (default: 30)

${colors.cyan}SEARCH OPTIONS:${colors.reset}
  --query <name>           Font name to search for (required)
  --limit <n>              Max results to show (default: 10)
  --threshold <0-1>        Minimum similarity (default: 0.3)

${colors.cyan}EXAMPLES:${colors.reset}
  svgfonts embed icon.svg              # Embed fonts with subsetting
  svgfonts embed --full icon.svg       # Embed complete fonts
  svgfonts embed --woff2 icon.svg      # Embed with WOFF2 compression
  svgfonts list document.svg           # List all fonts in SVG
  svgfonts replace --map fonts.yml *.svg  # Apply replacement map
  svgfonts extract -o ./fonts doc.svg  # Extract embedded fonts
  svgfonts interactive icon.svg        # Interactive mode
  svgfonts template > fonts.yml        # Generate template
  svgfonts cache                       # Show font cache stats
  svgfonts cache --cache-action clean  # Clean old cached fonts
  svgfonts search --query "roboto"     # Search for fonts by name
  svgfonts dedupe icon.svg             # Merge duplicate @font-face rules

${colors.cyan}ENVIRONMENT:${colors.reset}
  SVGM_REPLACEMENT_MAP     Path to default replacement map YAML

${colors.cyan}SEE ALSO:${colors.reset}
  svgm (general SVG optimization)
  svg-matrix (matrix operations)
`;

// ============================================================================
// ARGUMENT PARSING
// ============================================================================
function parseArgs(args) {
  const result = { ...DEFAULT_CONFIG };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case "--version":
        console.log(VERSION);
        process.exit(CONSTANTS.EXIT_SUCCESS);
        break;

      case "embed":
      case "extract":
      case "replace":
      case "list":
      case "interactive":
      case "template":
      case "cache":
      case "search":
      case "dedupe":
        if (!result.command) {
          result.command = arg;
        } else {
          result.inputs.push(arg);
        }
        break;

      case "-i":
      case "--input":
        if (args[i + 1]) {
          result.inputs.push(args[++i]);
        }
        break;

      case "-o":
      case "--output":
        result.output = args[++i];
        break;

      case "-r":
      case "--recursive":
        result.recursive = true;
        break;

      case "-q":
      case "--quiet":
        result.quiet = true;
        break;

      case "-v":
      case "--verbose":
        result.verbose = true;
        break;

      case "--no-backup":
        result.noBackup = true;
        break;

      case "--validate":
        result.validate = true;
        break;

      case "--dry-run":
        result.dryRun = true;
        break;

      case "--no-color":
        // Already handled in colors setup
        break;

      // Embed options
      case "--subset":
        result.subset = true;
        result.full = false;
        break;

      case "--full":
        result.full = true;
        result.subset = false;
        break;

      case "--source":
        result.source = args[++i];
        break;

      case "--timeout":
        result.timeout = parseInt(args[++i], 10);
        break;

      // Replace options
      case "--map":
        result.mapFile = args[++i];
        break;

      case "--no-auto-download":
        result.autoDownload = false;
        break;

      // Extract options
      case "--extract-dir":
        result.extractDir = args[++i];
        break;

      case "--restore-links":
        result.restoreLinks = true;
        break;

      // Template options
      case "--template-output":
        result.templateOutput = args[++i];
        break;

      // Embed new options
      case "--woff2":
        result.woff2 = true;
        break;

      case "--no-cache":
        result.useCache = false;
        break;

      case "--search-alternatives":
        result.searchAlternatives = true;
        break;

      // Cache options
      case "--cache-action":
        result.cacheAction = args[++i];
        break;

      case "--max-age":
        result.maxAge = parseInt(args[++i], 10);
        break;

      // Search options
      case "--query":
        result.query = args[++i];
        break;

      case "--limit":
        result.limit = parseInt(args[++i], 10);
        break;

      case "--threshold":
        result.threshold = parseFloat(args[++i]);
        break;

      default:
        // Assume it's an input file
        if (!arg.startsWith("-")) {
          result.inputs.push(arg);
        } else {
          logError(`Unknown option: ${arg}`);
          process.exit(CONSTANTS.EXIT_ERROR);
        }
    }
    i++;
  }

  // Default command is 'embed' if inputs provided
  if (!result.command && result.inputs.length > 0) {
    result.command = "embed";
  }

  return result;
}

// ============================================================================
// FILE UTILITIES
// ============================================================================
function collectSvgFiles(inputs, recursive = false) {
  const files = [];
  const visited = new Set();

  for (const input of inputs) {
    const absPath = isAbsolute(input) ? input : resolve(input);

    if (!existsSync(absPath)) {
      logWarn(`File not found: ${input}`);
      continue;
    }

    // Detect symlink loops
    try {
      const realPath = realpathSync(absPath);
      if (visited.has(realPath)) continue;
      visited.add(realPath);
    } catch {
      continue;
    }

    const stat = statSync(absPath);

    if (stat.isFile()) {
      const ext = extname(absPath).toLowerCase();
      if (CONSTANTS.SVG_EXTENSIONS.includes(ext)) {
        files.push(absPath);
      }
    } else if (stat.isDirectory() && recursive) {
      const entries = readdirSync(absPath);
      const subPaths = entries.map((e) => join(absPath, e));
      files.push(...collectSvgFiles(subPaths, recursive));
    }
  }

  return files;
}

// ============================================================================
// COMMAND: LIST
// ============================================================================
async function cmdList(files) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const doc = parseSVG(content);

    const fonts = FontManager.listFonts(doc);

    log(`\n${colors.bright}${basename(file)}${colors.reset}`);
    log("─".repeat(60));

    if (fonts.length === 0) {
      log(`  ${colors.dim}No fonts found${colors.reset}`);
      continue;
    }

    log(
      `  ${colors.cyan}${"#".padEnd(4)}${"Font Family".padEnd(25)}${"Type".padEnd(12)}${"Size".padEnd(12)}Used Chars${colors.reset}`
    );
    log("  " + "─".repeat(56));

    fonts.forEach((font, idx) => {
      const num = `${idx + 1}.`.padEnd(4);
      const family = font.family.slice(0, 24).padEnd(25);
      const type = font.type.padEnd(12);
      const size = font.size
        ? `${(font.size / 1024).toFixed(1)} KB`.padEnd(12)
        : font.source
          ? `(${font.source.slice(0, 8)}...)`.padEnd(12)
          : "".padEnd(12);
      const chars = font.usedChars
        ? [...font.usedChars].slice(0, 20).join("") +
          (font.usedChars.size > 20 ? "..." : "")
        : "";

      log(`  ${num}${family}${type}${size}${chars}`);
    });
  }
}

// ============================================================================
// COMMAND: EMBED
// ============================================================================
async function cmdEmbed(files) {
  for (const file of files) {
    logVerbose(`Processing: ${file}`);

    const content = readFileSync(file, "utf8");

    // Create backup
    if (!config.noBackup && !config.dryRun) {
      const backupPath = FontManager.createBackup(file, { noBackup: config.noBackup });
      if (backupPath) {
        logVerbose(`Backup created: ${backupPath}`);
      }
    }

    if (config.dryRun) {
      log(`[dry-run] Would embed fonts in: ${file}`);
      continue;
    }

    const doc = parseSVG(content);

    // Use svg-toolbox embedExternalDependencies
    const result = await SVGToolbox.embedExternalDependencies(doc, {
      embedImages: false,
      embedExternalSVGs: false,
      embedCSS: true,
      embedFonts: true,
      embedScripts: false,
      embedAudio: false,
      subsetFonts: config.subset && !config.full,
      timeout: config.timeout,
      verbose: config.verbose,
    });

    const output = serializeSVG(result);

    // Validate if requested
    if (config.validate) {
      const validation = await FontManager.validateSvgAfterFontOperation(output, "embed");
      if (!validation.valid) {
        logError(`Validation failed for ${file}: ${validation.errors.join(", ")}`);
        continue;
      }
      for (const warn of validation.warnings) {
        logWarn(warn);
      }
    }

    const outputPath = config.output || file;
    writeFileSync(outputPath, output);
    logSuccess(`Embedded fonts: ${outputPath}`);
  }
}

// ============================================================================
// COMMAND: EXTRACT
// ============================================================================
async function cmdExtract(files) {
  mkdirSync(config.extractDir, { recursive: true });

  for (const file of files) {
    logVerbose(`Processing: ${file}`);

    const content = readFileSync(file, "utf8");

    // Create backup
    if (!config.noBackup && !config.dryRun) {
      FontManager.createBackup(file, { noBackup: config.noBackup });
    }

    if (config.dryRun) {
      log(`[dry-run] Would extract fonts from: ${file}`);
      continue;
    }

    const doc = parseSVG(content);

    // Use svg-toolbox exportEmbeddedResources
    const result = await SVGToolbox.exportEmbeddedResources(doc, {
      outputDir: config.extractDir,
      extractFonts: true,
      extractImages: false,
      extractStyles: false,
      restoreGoogleFonts: config.restoreLinks,
    });

    const output = serializeSVG(result);

    // Validate if requested
    if (config.validate) {
      const validation = await FontManager.validateSvgAfterFontOperation(output, "extract");
      if (!validation.valid) {
        logError(`Validation failed for ${file}: ${validation.errors.join(", ")}`);
        continue;
      }
    }

    const outputPath = config.output || file;
    writeFileSync(outputPath, output);
    logSuccess(`Extracted fonts to: ${config.extractDir}`);
  }
}

// ============================================================================
// COMMAND: REPLACE
// ============================================================================
async function cmdReplace(files) {
  // Load replacement map
  const map = FontManager.loadReplacementMap(config.mapFile);

  if (!map) {
    logError(
      "No replacement map found. Create one with 'svgfonts template' or specify --map"
    );
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  log(`Using replacement map: ${map.path}`);

  const replacementCount = Object.keys(map.replacements).length;
  if (replacementCount === 0) {
    logWarn("Replacement map has no font mappings defined");
    return;
  }

  log(`Found ${replacementCount} font replacement(s)`);

  for (const file of files) {
    logVerbose(`Processing: ${file}`);

    const content = readFileSync(file, "utf8");

    // Create backup
    if (!config.noBackup && !config.dryRun) {
      FontManager.createBackup(file, { noBackup: config.noBackup });
    }

    if (config.dryRun) {
      log(`[dry-run] Would apply replacements to: ${file}`);
      continue;
    }

    const doc = parseSVG(content);

    // Apply replacements
    const replaceResult = FontManager.applyFontReplacements(doc, map.replacements);

    if (replaceResult.modified) {
      const output = serializeSVG(doc);

      // Validate if requested
      if (config.validate) {
        const validation = await FontManager.validateSvgAfterFontOperation(
          output,
          "replace"
        );
        for (const warn of validation.warnings) {
          logWarn(warn);
        }
      }

      const outputPath = config.output || file;
      writeFileSync(outputPath, output);

      for (const r of replaceResult.replaced) {
        log(`  ${r.from} -> ${r.to}`);
      }
      logSuccess(`Replaced fonts: ${outputPath}`);
    } else {
      log(`  No fonts replaced in ${basename(file)}`);
    }
  }
}

// ============================================================================
// COMMAND: TEMPLATE
// ============================================================================
function cmdTemplate() {
  const template = FontManager.generateReplacementMapTemplate();

  if (config.templateOutput) {
    writeFileSync(config.templateOutput, template);
    logSuccess(`Template written to: ${config.templateOutput}`);
  } else {
    console.log(template);
  }
}

// ============================================================================
// COMMAND: CACHE
// ============================================================================
function cmdCache() {
  // Initialize cache if needed
  FontManager.initFontCache();

  switch (config.cacheAction) {
    case "stats": {
      const stats = FontManager.getFontCacheStats();
      log(`\n${colors.bright}Font Cache Statistics${colors.reset}`);
      log(`${"─".repeat(40)}`);
      log(`  Location:     ${FontManager.FONT_CACHE_DIR}`);
      log(`  Total fonts:  ${stats.totalFonts}`);
      log(`  Total size:   ${formatSize(stats.totalSize)}`);
      if (stats.oldestAge > 0) {
        const oldestDays = Math.floor(stats.oldestAge / (24 * 60 * 60 * 1000));
        const newestDays = Math.floor(stats.newestAge / (24 * 60 * 60 * 1000));
        log(`  Oldest entry: ${oldestDays} days ago`);
        log(`  Newest entry: ${newestDays} days ago`);
      } else {
        log(`  Oldest entry: N/A`);
        log(`  Newest entry: N/A`);
      }
      break;
    }

    case "clean": {
      const maxAgeMs = config.maxAge * 24 * 60 * 60 * 1000;
      const result = FontManager.cleanupFontCache(maxAgeMs);
      if (result.removed > 0) {
        logSuccess(`Cleaned ${result.removed} old cached fonts (${formatSize(result.freedBytes)})`);
      } else {
        log("No fonts to clean (all within max age)");
      }
      break;
    }

    case "list": {
      // Read the cache index directly to get list
      const indexPath = join(FontManager.FONT_CACHE_DIR, FontManager.FONT_CACHE_INDEX);
      log(`\n${colors.bright}Cached Fonts${colors.reset}`);
      log(`${"─".repeat(60)}`);
      if (existsSync(indexPath)) {
        try {
          const index = JSON.parse(readFileSync(indexPath, "utf8"));
          const entries = Object.entries(index.fonts);
          if (entries.length > 0) {
            for (const [key, data] of entries) {
              const age = Math.floor((Date.now() - data.timestamp) / (24 * 60 * 60 * 1000));
              log(`  ${key.slice(0, 30).padEnd(30)} ${formatSize(data.size || 0).padStart(10)} ${age}d ago`);
            }
          } else {
            log("  No cached fonts");
          }
        } catch {
          log("  No cached fonts");
        }
      } else {
        log("  No cached fonts");
      }
      break;
    }

    default:
      logError(`Unknown cache action: ${config.cacheAction}`);
      process.exit(CONSTANTS.EXIT_ERROR);
  }
}

// ============================================================================
// COMMAND: SEARCH
// ============================================================================
async function cmdSearch() {
  if (!config.query) {
    logError("Missing --query option. Usage: svgfonts search --query <font-name>");
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  log(`\n${colors.bright}Searching for fonts matching: "${config.query}"${colors.reset}`);
  log(`${"─".repeat(60)}`);

  const results = await FontManager.searchSimilarFonts(config.query, {
    limit: config.limit,
    threshold: config.threshold,
  });

  if (results.length === 0) {
    log(`No fonts found matching "${config.query}" with similarity >= ${config.threshold}`);
    return;
  }

  log(`\n${colors.cyan}#   Similarity  Font Name${" ".repeat(25)}Source${colors.reset}`);
  log(`${"─".repeat(60)}`);

  results.forEach((result, idx) => {
    const simPercent = Math.round(result.similarity * 100);
    const simBar = "█".repeat(Math.round(simPercent / 10)) + "░".repeat(10 - Math.round(simPercent / 10));
    const simColor = simPercent >= 80 ? colors.green : simPercent >= 50 ? colors.yellow : colors.dim;
    log(
      `${(idx + 1).toString().padStart(2)}. ${simColor}${simBar}${colors.reset} ${simPercent.toString().padStart(3)}%  ${result.name.padEnd(28)} ${colors.dim}${result.source}${colors.reset}`
    );
  });

  log(`\n${colors.dim}Use 'svgfonts embed --source google <svg>' to embed a font${colors.reset}`);
}

// ============================================================================
// COMMAND: DEDUPE
// ============================================================================
async function cmdDedupe(files) {
  for (const file of files) {
    logVerbose(`Processing: ${file}`);

    const content = readFileSync(file, "utf8");

    // Create backup
    if (!config.noBackup && !config.dryRun) {
      const backupPath = FontManager.createBackup(file, { noBackup: config.noBackup });
      if (backupPath) {
        logVerbose(`Backup created: ${backupPath}`);
      }
    }

    const doc = parseSVG(content);

    // Detect duplicates first
    const { duplicates, total } = FontManager.detectDuplicateFontFaces(doc);

    if (duplicates.length === 0) {
      log(`${basename(file)}: No duplicate @font-face rules found (${total} total)`);
      continue;
    }

    if (config.dryRun) {
      log(`[dry-run] Would merge ${duplicates.length} duplicate font group(s) in: ${file}`);
      for (const dup of duplicates) {
        log(`  - "${dup.family}" (${dup.weight}/${dup.style}): ${dup.count} occurrences`);
      }
      continue;
    }

    // Merge duplicates
    const result = FontManager.mergeDuplicateFontFaces(doc);

    if (result.removed > 0) {
      const output = serializeSVG(doc);

      // Validate if requested
      if (config.validate) {
        const validation = await FontManager.validateSvgAfterFontOperation(output, "dedupe");
        if (!validation.valid) {
          logError(`Validation failed for ${file}: ${validation.errors.join(", ")}`);
          continue;
        }
      }

      const outputPath = config.output || file;
      writeFileSync(outputPath, output);

      logSuccess(`Merged ${result.removed} duplicate @font-face rule(s): ${outputPath}`);
      for (const dup of duplicates) {
        log(`  - "${dup.family}" (${dup.weight}/${dup.style})`);
      }
    } else {
      log(`${basename(file)}: No duplicates merged`);
    }
  }
}

// ============================================================================
// COMMAND: INTERACTIVE
// ============================================================================

/**
 * Box-drawing characters for consistent borders
 */
const BOX = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
  ml: "├",
  mr: "┤",
  mt: "┬",
  mb: "┴",
  cross: "┼",
  // Double line variants for headers
  dh: "═",
  dtl: "╔",
  dtr: "╗",
  dbl: "╚",
  dbr: "╝",
  dv: "║",
  dml: "╠",
  dmr: "╣",
};

/**
 * Draw a horizontal line with box characters
 */
function drawLine(width, left = BOX.ml, fill = BOX.h, right = BOX.mr) {
  return left + fill.repeat(width - 2) + right;
}

/**
 * Format a table row with padding
 */
function tableRow(cols, widths, sep = BOX.v) {
  return (
    sep +
    cols.map((col, i) => ` ${String(col).slice(0, widths[i] - 2).padEnd(widths[i] - 2)} `).join(sep) +
    sep
  );
}

/**
 * Format file size for display
 */
function formatSize(bytes) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get status indicator for font type
 */
function fontTypeIcon(type) {
  switch (type) {
    case "embedded":
      return `${colors.green}●${colors.reset}`;
    case "external":
      return `${colors.yellow}○${colors.reset}`;
    case "system":
      return `${colors.cyan}◆${colors.reset}`;
    default:
      return `${colors.dim}?${colors.reset}`;
  }
}

async function cmdInteractive(files) {
  if (files.length === 0) {
    logError("No input files specified for interactive mode");
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  const file = files[0]; // Process one file at a time in interactive mode
  const content = readFileSync(file, "utf8");
  let doc = parseSVG(content);
  let modified = false;
  let filterText = "";
  let selectedIdx = -1;
  let scrollOffset = 0; // For scrolling through long font lists
  let message = ""; // Status message to display
  let messageType = "info"; // "info", "success", "error", "warn"

  // Page size for font list (visible rows)
  const PAGE_SIZE = 10;

  // Undo history (stores serialized SVG states)
  const history = [];
  const MAX_HISTORY = 20;

  const pushHistory = () => {
    const state = serializeSVG(doc);
    history.push(state);
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
  };

  const undo = () => {
    if (history.length > 0) {
      const prevState = history.pop();
      doc = parseSVG(prevState);
      return true;
    }
    return false;
  };

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((res) => rl.question(prompt, res));

  /**
   * Read single keypress (for arrow key navigation)
   */
  const _readKey = () =>
    new Promise((res) => {
      const wasRaw = process.stdin.isRaw;
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.once("data", (key) => {
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(wasRaw);
        }
        res(key.toString());
      });
    });

  // Create backup before interactive session
  if (!config.noBackup) {
    const backupPath = FontManager.createBackup(file, { noBackup: config.noBackup });
    if (backupPath) {
      message = `Backup: ${basename(backupPath)}`;
    }
  }

  // Calculate table widths
  const TABLE_WIDTH = 76;
  const COL_WIDTHS = [4, 26, 12, 10, 22]; // #, Font Family, Type, Size, Used Chars

  /**
   * Display help screen
   */
  const showHelp = async () => {
    console.clear();
    log(`\n${colors.bright}${BOX.dtl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dtr}${colors.reset}`);
    log(`${colors.bright}${BOX.dv}${colors.reset} ${"INTERACTIVE MODE HELP".padStart(38).padEnd(TABLE_WIDTH - 4)} ${colors.bright}${BOX.dv}${colors.reset}`);
    log(`${colors.bright}${BOX.dbl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dbr}${colors.reset}`);

    log(`\n${colors.cyan}Navigation (for long font lists):${colors.reset}`);
    log(`  ${colors.bright}j${colors.reset}/${colors.bright}↓${colors.reset}    Scroll down one line`);
    log(`  ${colors.bright}k${colors.reset}/${colors.bright}↑${colors.reset}    Scroll up one line`);
    log(`  ${colors.bright}n${colors.reset}      Page down (next page)`);
    log(`  ${colors.bright}p${colors.reset}      Page up (previous page)`);
    log(`  ${colors.bright}g${colors.reset}      Jump to top of list`);
    log(`  ${colors.bright}G${colors.reset}      Jump to bottom of list`);

    log(`\n${colors.cyan}Main Menu Commands:${colors.reset}`);
    log(`  ${colors.bright}1-99${colors.reset}   Select font by number`);
    log(`  ${colors.bright}a${colors.reset}      Apply action to all fonts`);
    log(`  ${colors.bright}e${colors.reset}      Embed all external fonts (subset)`);
    log(`  ${colors.bright}E${colors.reset}      Embed all external fonts (full)`);
    log(`  ${colors.bright}/${colors.reset}      Search/filter fonts by name`);
    log(`  ${colors.bright}c${colors.reset}      Clear filter`);
    log(`  ${colors.bright}u${colors.reset}      Undo last change`);
    log(`  ${colors.bright}i${colors.reset}      Show SVG info summary`);
    log(`  ${colors.bright}s${colors.reset}      Save and exit`);
    log(`  ${colors.bright}q${colors.reset}      Quit without saving`);
    log(`  ${colors.bright}h${colors.reset}/${colors.bright}?${colors.reset}    Show this help`);

    log(`\n${colors.cyan}Per-Font Commands:${colors.reset}`);
    log(`  ${colors.bright}e${colors.reset}      Embed font (subset - smaller file)`);
    log(`  ${colors.bright}E${colors.reset}      Embed font (full - all glyphs)`);
    log(`  ${colors.bright}r${colors.reset}      Replace with another font`);
    log(`  ${colors.bright}x${colors.reset}      Extract font to file`);
    log(`  ${colors.bright}d${colors.reset}      Delete font from SVG`);
    log(`  ${colors.bright}v${colors.reset}      Validate external URL`);
    log(`  ${colors.bright}c${colors.reset}      Copy font details to clipboard`);
    log(`  ${colors.bright}b${colors.reset}      Back to font list`);

    log(`\n${colors.cyan}Legend:${colors.reset}`);
    log(`  ${colors.green}●${colors.reset} Embedded   ${colors.yellow}○${colors.reset} External   ${colors.cyan}◆${colors.reset} System   ${colors.dim}?${colors.reset} Unknown`);

    log(`\n${colors.dim}Press Enter to return...${colors.reset}`);
    await question("");
  };

  /**
   * Show SVG info summary
   */
  const showInfo = async () => {
    console.clear();
    const fonts = FontManager.listFonts(doc);

    log(`\n${colors.bright}${BOX.dtl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dtr}${colors.reset}`);
    log(`${colors.bright}${BOX.dv}${colors.reset} ${"SVG INFORMATION".padStart(38).padEnd(TABLE_WIDTH - 4)} ${colors.bright}${BOX.dv}${colors.reset}`);
    log(`${colors.bright}${BOX.dbl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dbr}${colors.reset}`);

    log(`\n${colors.cyan}File:${colors.reset} ${basename(file)}`);
    log(`${colors.cyan}Path:${colors.reset} ${file}`);

    const svgContent = serializeSVG(doc);
    log(`${colors.cyan}Size:${colors.reset} ${formatSize(svgContent.length)}`);

    log(`\n${colors.cyan}Font Summary:${colors.reset}`);
    const embedded = fonts.filter((f) => f.type === "embedded").length;
    const external = fonts.filter((f) => f.type === "external").length;
    const system = fonts.filter((f) => f.type === "system").length;
    const unknown = fonts.filter((f) => f.type === "unknown").length;

    log(`  Total fonts:   ${fonts.length}`);
    log(`  ${colors.green}●${colors.reset} Embedded:    ${embedded}`);
    log(`  ${colors.yellow}○${colors.reset} External:    ${external}`);
    log(`  ${colors.cyan}◆${colors.reset} System:      ${system}`);
    if (unknown > 0) log(`  ${colors.dim}?${colors.reset} Unknown:     ${unknown}`);

    // Calculate total embedded font size
    const totalEmbedSize = fonts
      .filter((f) => f.type === "embedded" && f.size)
      .reduce((sum, f) => sum + f.size, 0);

    if (totalEmbedSize > 0) {
      log(`\n${colors.cyan}Embedded Font Size:${colors.reset} ${formatSize(totalEmbedSize)}`);
    }

    // List unique characters used
    const allChars = new Set();
    fonts.forEach((f) => {
      if (f.usedChars) {
        for (const c of f.usedChars) allChars.add(c);
      }
    });
    log(`${colors.cyan}Unique Characters:${colors.reset} ${allChars.size}`);

    log(`\n${colors.dim}Press Enter to return...${colors.reset}`);
    await question("");
  };

  /**
   * Main interactive loop
   */
  while (true) {
    console.clear();
    const fonts = FontManager.listFonts(doc);

    // Apply filter
    const filteredFonts = filterText
      ? fonts.filter((f) => f.family.toLowerCase().includes(filterText.toLowerCase()))
      : fonts;

    // Header
    log(`${colors.bright}${BOX.dtl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dtr}${colors.reset}`);
    const title = ` SVGFONTS INTERACTIVE `;
    const modIndicator = modified ? `${colors.yellow}[MODIFIED]${colors.reset}` : "";
    const headerText = `${title}${modIndicator}`.padEnd(TABLE_WIDTH - 4 + (modified ? 14 : 0));
    log(`${colors.bright}${BOX.dv}${colors.reset}${headerText}${colors.bright}${BOX.dv}${colors.reset}`);
    log(`${colors.bright}${BOX.dml}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dmr}${colors.reset}`);

    // File info row
    const fileInfo = ` File: ${basename(file)} `;
    const fontCount = ` Fonts: ${filteredFonts.length}${filterText ? ` (filtered)` : ``} `;
    const undoCount = history.length > 0 ? ` Undo: ${history.length} ` : "";
    log(
      `${BOX.v}${fileInfo.padEnd(40)}${fontCount.padEnd(20)}${undoCount.padEnd(TABLE_WIDTH - 62)}${BOX.v}`
    );
    log(drawLine(TABLE_WIDTH, BOX.ml, BOX.h, BOX.mr));

    // Filter indicator
    if (filterText) {
      log(`${BOX.v} ${colors.magenta}Filter: "${filterText}"${colors.reset}${" ".repeat(TABLE_WIDTH - filterText.length - 14)}${BOX.v}`);
      log(drawLine(TABLE_WIDTH, BOX.ml, BOX.h, BOX.mr));
    }

    // Column headers
    log(
      tableRow(
        [
          `${colors.cyan}#${colors.reset}`,
          `${colors.cyan}Font Family${colors.reset}`,
          `${colors.cyan}Type${colors.reset}`,
          `${colors.cyan}Size${colors.reset}`,
          `${colors.cyan}Used Chars${colors.reset}`,
        ],
        COL_WIDTHS
      )
    );
    log(drawLine(TABLE_WIDTH, BOX.ml, BOX.h, BOX.mr));

    // Font rows with pagination
    if (filteredFonts.length === 0) {
      const emptyMsg = filterText ? "No fonts match filter" : "No fonts found";
      log(`${BOX.v} ${colors.dim}${emptyMsg.padEnd(TABLE_WIDTH - 4)}${colors.reset} ${BOX.v}`);
    } else {
      // Ensure scroll offset is valid
      const maxOffset = Math.max(0, filteredFonts.length - PAGE_SIZE);
      if (scrollOffset > maxOffset) scrollOffset = maxOffset;
      if (scrollOffset < 0) scrollOffset = 0;

      // Show visible fonts based on scroll position
      const visibleFonts = filteredFonts.slice(scrollOffset, scrollOffset + PAGE_SIZE);
      const hasMore = filteredFonts.length > PAGE_SIZE;

      // Show scroll indicator if there are fonts above
      if (scrollOffset > 0) {
        log(`${BOX.v} ${colors.dim}  ↑ ${scrollOffset} more above...${" ".repeat(TABLE_WIDTH - 24)}${colors.reset} ${BOX.v}`);
      }

      visibleFonts.forEach((font, visibleIdx) => {
        const actualIdx = scrollOffset + visibleIdx;
        const num = `${actualIdx + 1}.`;
        const icon = fontTypeIcon(font.type);
        const family = font.family.slice(0, 22);
        const typeStr = `${icon} ${font.type}`;
        const size = formatSize(font.size);
        const chars = font.usedChars
          ? [...font.usedChars].slice(0, 18).join("") + (font.usedChars.size > 18 ? "..." : "")
          : "-";

        // Highlight selected font
        const isSelected = actualIdx === selectedIdx;
        const highlight = isSelected ? colors.bright : "";
        const resetH = isSelected ? colors.reset : "";
        const selectMarker = isSelected ? "▶" : " ";

        log(
          `${BOX.v}${selectMarker}${highlight}${num.padEnd(3)}${resetH} ${BOX.v} ${highlight}${family.padEnd(24)}${resetH} ${BOX.v} ${typeStr.padEnd(10 + 9)} ${BOX.v} ${size.padEnd(8)} ${BOX.v} ${chars.padEnd(20)} ${BOX.v}`
        );
      });

      // Show scroll indicator if there are fonts below
      const remaining = filteredFonts.length - scrollOffset - PAGE_SIZE;
      if (remaining > 0) {
        log(`${BOX.v} ${colors.dim}  ↓ ${remaining} more below...${" ".repeat(TABLE_WIDTH - 24)}${colors.reset} ${BOX.v}`);
      }

      // Show pagination info if list is long
      if (hasMore) {
        const currentPage = Math.floor(scrollOffset / PAGE_SIZE) + 1;
        const totalPages = Math.ceil(filteredFonts.length / PAGE_SIZE);
        const pageInfo = `Page ${currentPage}/${totalPages}`;
        log(drawLine(TABLE_WIDTH, BOX.ml, BOX.h, BOX.mr));
        log(`${BOX.v} ${colors.dim}${pageInfo}${colors.reset}${" ".repeat(TABLE_WIDTH - pageInfo.length - 4)} ${BOX.v}`);
      }
    }

    // Footer
    log(`${BOX.bl}${BOX.h.repeat(TABLE_WIDTH - 2)}${BOX.br}`);

    // Status message
    if (message) {
      const msgColor =
        messageType === "success"
          ? colors.green
          : messageType === "error"
            ? colors.red
            : messageType === "warn"
              ? colors.yellow
              : colors.dim;
      log(`\n${msgColor}${message}${colors.reset}`);
      message = "";
    }

    // Action menu - show arrow keys if list is long
    const hasMoreFonts = filteredFonts.length > PAGE_SIZE;
    if (hasMoreFonts) {
      log(`\n${colors.cyan}Navigation:${colors.reset} ${colors.dim}[↑/↓]${colors.reset} scroll  ${colors.dim}[j/k]${colors.reset} up/down  ${colors.dim}[PgUp/PgDn]${colors.reset} page  ${colors.dim}[g/G]${colors.reset} top/bottom`);
    }
    log(`${colors.cyan}Commands:${colors.reset} ${colors.dim}[1-99]${colors.reset} select  ${colors.dim}[a]${colors.reset} all  ${colors.dim}[e/E]${colors.reset} embed  ${colors.dim}[/]${colors.reset} filter  ${colors.dim}[u]${colors.reset} undo  ${colors.dim}[s]${colors.reset} save  ${colors.dim}[q]${colors.reset} quit  ${colors.dim}[h]${colors.reset} help`);

    const choice = await question(`\n${colors.bright}>${colors.reset} `);

    // Handle vim-style navigation keys
    if (choice === "j" || choice === "\x1b[B") {
      // Down arrow or j - scroll down
      scrollOffset = Math.min(scrollOffset + 1, Math.max(0, filteredFonts.length - PAGE_SIZE));
      continue;
    }
    if (choice === "k" || choice === "\x1b[A") {
      // Up arrow or k - scroll up
      scrollOffset = Math.max(0, scrollOffset - 1);
      continue;
    }
    if (choice === "g") {
      // Go to top
      scrollOffset = 0;
      message = "Jumped to top";
      messageType = "info";
      continue;
    }
    if (choice === "G") {
      // Go to bottom
      scrollOffset = Math.max(0, filteredFonts.length - PAGE_SIZE);
      message = "Jumped to bottom";
      messageType = "info";
      continue;
    }
    if (choice === "n" || choice === "\x1b[6~") {
      // Page down (n or PgDn)
      scrollOffset = Math.min(scrollOffset + PAGE_SIZE, Math.max(0, filteredFonts.length - PAGE_SIZE));
      continue;
    }
    if (choice === "p" || choice === "\x1b[5~") {
      // Page up (p or PgUp)
      scrollOffset = Math.max(0, scrollOffset - PAGE_SIZE);
      continue;
    }

    // Handle commands
    if (choice === "q" || choice === "Q") {
      if (modified) {
        const confirm = await question(
          `${colors.yellow}Unsaved changes! Quit anyway? [y/N]${colors.reset} `
        );
        if (confirm.toLowerCase() !== "y") continue;
      }
      log("\nExiting without saving.");
      rl.close();
      return;
    }

    if (choice === "s" || choice === "S") {
      if (modified) {
        const output = serializeSVG(doc);
        const outputPath = config.output || file;
        writeFileSync(outputPath, output);
        logSuccess(`\nSaved: ${outputPath}`);
      } else {
        log("\nNo changes to save.");
      }
      rl.close();
      return;
    }

    if (choice === "h" || choice === "?" || choice === "H") {
      await showHelp();
      continue;
    }

    if (choice === "i" || choice === "I") {
      await showInfo();
      continue;
    }

    if (choice === "/") {
      const searchTerm = await question(`${colors.cyan}Filter fonts:${colors.reset} `);
      filterText = searchTerm.trim();
      message = filterText ? `Filtering by: "${filterText}"` : "Filter cleared";
      messageType = "info";
      continue;
    }

    if (choice === "c" || choice === "C") {
      filterText = "";
      message = "Filter cleared";
      messageType = "info";
      continue;
    }

    if (choice === "u" || choice === "U") {
      if (undo()) {
        modified = history.length > 0;
        message = "Undo successful";
        messageType = "success";
      } else {
        message = "Nothing to undo";
        messageType = "warn";
      }
      continue;
    }

    if (choice === "e") {
      log("\nEmbedding all external fonts (subset)...");
      pushHistory();
      doc = await SVGToolbox.embedExternalDependencies(doc, {
        embedFonts: true,
        embedImages: false,
        embedCSS: true,
        subsetFonts: true,
        verbose: config.verbose,
      });
      modified = true;
      message = "All fonts embedded (subset)";
      messageType = "success";
      continue;
    }

    if (choice === "E") {
      log("\nEmbedding all external fonts (full)...");
      pushHistory();
      doc = await SVGToolbox.embedExternalDependencies(doc, {
        embedFonts: true,
        embedImages: false,
        embedCSS: true,
        subsetFonts: false,
        verbose: config.verbose,
      });
      modified = true;
      message = "All fonts embedded (full)";
      messageType = "success";
      continue;
    }

    if (choice === "a" || choice === "A") {
      log(`\n${colors.cyan}Apply to all fonts:${colors.reset}`);
      log(`  ${colors.dim}[e]${colors.reset} Embed all (subset)`);
      log(`  ${colors.dim}[E]${colors.reset} Embed all (full)`);
      log(`  ${colors.dim}[r]${colors.reset} Replace all with mapping`);
      log(`  ${colors.dim}[d]${colors.reset} Delete all fonts`);
      log(`  ${colors.dim}[b]${colors.reset} Back`);

      const subChoice = await question(`\n${colors.bright}>${colors.reset} `);

      if (subChoice === "e" || subChoice === "E") {
        log("\nEmbedding all fonts...");
        pushHistory();
        doc = await SVGToolbox.embedExternalDependencies(doc, {
          embedFonts: true,
          embedImages: false,
          embedCSS: true,
          subsetFonts: subChoice === "e",
          verbose: config.verbose,
        });
        modified = true;
        message = `All fonts embedded (${subChoice === "e" ? "subset" : "full"})`;
        messageType = "success";
      } else if (subChoice === "r") {
        const mapFile = await question(`${colors.cyan}Replacement map file (or Enter for default):${colors.reset} `);
        const map = FontManager.loadReplacementMap(mapFile.trim() || null);
        if (map) {
          pushHistory();
          const result = FontManager.applyFontReplacements(doc, map.replacements);
          if (result.modified) {
            modified = true;
            message = `Replaced ${result.replaced.length} font(s)`;
            messageType = "success";
          } else {
            message = "No fonts matched replacement map";
            messageType = "warn";
          }
        } else {
          message = "No replacement map found";
          messageType = "error";
        }
      } else if (subChoice === "d") {
        const confirm = await question(
          `${colors.red}Delete ALL fonts? This cannot be undone! [y/N]${colors.reset} `
        );
        if (confirm.toLowerCase() === "y") {
          pushHistory();
          // Remove all @font-face rules and font references
          const styleEls = doc.querySelectorAll?.("style") || [];
          for (const styleEl of styleEls) {
            if (styleEl.textContent) {
              styleEl.textContent = styleEl.textContent.replace(/@font-face\s*\{[^}]*\}/gi, "");
            }
          }
          modified = true;
          message = "All fonts deleted";
          messageType = "success";
        }
      }
      continue;
    }

    // Font selection by number
    const fontIdx = parseInt(choice, 10) - 1;
    if (fontIdx >= 0 && fontIdx < filteredFonts.length) {
      const selectedFont = filteredFonts[fontIdx];
      selectedIdx = fontIdx;

      console.clear();
      log(`\n${colors.bright}${BOX.dtl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dtr}${colors.reset}`);
      log(`${colors.bright}${BOX.dv}${colors.reset} FONT DETAILS${" ".repeat(TABLE_WIDTH - 16)}${colors.bright}${BOX.dv}${colors.reset}`);
      log(`${colors.bright}${BOX.dbl}${BOX.dh.repeat(TABLE_WIDTH - 2)}${BOX.dbr}${colors.reset}`);

      log(`\n${colors.cyan}Family:${colors.reset}  ${selectedFont.family}`);
      log(`${colors.cyan}Type:${colors.reset}    ${fontTypeIcon(selectedFont.type)} ${selectedFont.type}`);
      if (selectedFont.source) {
        const srcDisplay =
          selectedFont.source.length > 60
            ? selectedFont.source.slice(0, 57) + "..."
            : selectedFont.source;
        log(`${colors.cyan}Source:${colors.reset}  ${srcDisplay}`);
      }
      if (selectedFont.size) {
        log(`${colors.cyan}Size:${colors.reset}    ${formatSize(selectedFont.size)}`);
      }
      if (selectedFont.usedChars && selectedFont.usedChars.size > 0) {
        const chars = [...selectedFont.usedChars].sort().join("");
        const charsDisplay = chars.length > 60 ? chars.slice(0, 57) + "..." : chars;
        log(`${colors.cyan}Chars:${colors.reset}   ${charsDisplay} (${selectedFont.usedChars.size} unique)`);
      }

      log(`\n${colors.cyan}Actions:${colors.reset}`);
      log(`  ${colors.dim}[e]${colors.reset} Embed (subset)    ${colors.dim}[E]${colors.reset} Embed (full)`);
      log(`  ${colors.dim}[r]${colors.reset} Replace font      ${colors.dim}[x]${colors.reset} Extract to file`);
      log(`  ${colors.dim}[d]${colors.reset} Delete font       ${colors.dim}[v]${colors.reset} Validate URL`);
      log(`  ${colors.dim}[c]${colors.reset} Copy details      ${colors.dim}[b]${colors.reset} Back to list`);

      const action = await question(`\n${colors.bright}>${colors.reset} `);

      if (action === "e" || action === "E") {
        log(`\n${colors.dim}Embedding ${selectedFont.family}...${colors.reset}`);
        pushHistory();
        doc = await SVGToolbox.embedExternalDependencies(doc, {
          embedFonts: true,
          embedImages: false,
          embedCSS: true,
          subsetFonts: action === "e",
          verbose: config.verbose,
        });
        modified = true;
        message = `Embedded: ${selectedFont.family} (${action === "e" ? "subset" : "full"})`;
        messageType = "success";
      } else if (action === "r") {
        const newFont = await question(`${colors.cyan}Replace with:${colors.reset} `);
        if (newFont.trim()) {
          pushHistory();
          const replaceResult = FontManager.applyFontReplacements(doc, {
            [selectedFont.family]: newFont.trim(),
          });
          if (replaceResult.modified) {
            modified = true;
            message = `Replaced: ${selectedFont.family} -> ${newFont.trim()}`;
            messageType = "success";
          } else {
            message = "Font not found in document";
            messageType = "warn";
          }
        }
      } else if (action === "x") {
        if (selectedFont.type === "embedded" && selectedFont.size) {
          const extractDir = await question(
            `${colors.cyan}Extract to directory [./fonts]:${colors.reset} `
          );
          const dir = extractDir.trim() || "./fonts";
          mkdirSync(dir, { recursive: true });

          // Extract using svg-toolbox
          await SVGToolbox.exportEmbeddedResources(doc, {
            outputDir: dir,
            extractFonts: true,
            extractImages: false,
          });
          message = `Font extracted to: ${dir}`;
          messageType = "success";
        } else {
          message = "Only embedded fonts can be extracted";
          messageType = "warn";
        }
      } else if (action === "d") {
        const confirm = await question(
          `${colors.red}Delete ${selectedFont.family}? [y/N]${colors.reset} `
        );
        if (confirm.toLowerCase() === "y") {
          pushHistory();
          // Remove @font-face for this font
          const styleEls = doc.querySelectorAll?.("style") || [];
          for (const styleEl of styleEls) {
            if (styleEl.textContent) {
              const pattern = new RegExp(
                `@font-face\\s*\\{[^}]*font-family:\\s*['"]?${selectedFont.family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?[^}]*\\}`,
                "gi"
              );
              styleEl.textContent = styleEl.textContent.replace(pattern, "");
            }
          }
          modified = true;
          message = `Deleted: ${selectedFont.family}`;
          messageType = "success";
        }
      } else if (action === "v") {
        if (selectedFont.source && !selectedFont.source.startsWith("data:")) {
          log(`\n${colors.dim}Validating: ${selectedFont.source}${colors.reset}`);
          try {
            const response = await fetch(selectedFont.source, { method: "HEAD" });
            if (response.ok) {
              message = `Valid: ${response.status} ${response.statusText}`;
              messageType = "success";
            } else {
              message = `Invalid: HTTP ${response.status}`;
              messageType = "error";
            }
          } catch (err) {
            message = `Error: ${err.message}`;
            messageType = "error";
          }
        } else {
          message = "No external URL to validate";
          messageType = "warn";
        }
      } else if (action === "c") {
        // Copy font details to clipboard (platform-specific)
        const details = [
          `Font Family: ${selectedFont.family}`,
          `Type: ${selectedFont.type}`,
          selectedFont.source ? `Source: ${selectedFont.source}` : null,
          selectedFont.size ? `Size: ${formatSize(selectedFont.size)}` : null,
          selectedFont.usedChars
            ? `Characters: ${[...selectedFont.usedChars].join("")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          // Try pbcopy (macOS), xclip (Linux), clip (Windows)
          const clipCmd =
            process.platform === "darwin"
              ? "pbcopy"
              : process.platform === "win32"
                ? "clip"
                : "xclip -selection clipboard";
          const { execSync } = await import("child_process");
          execSync(clipCmd, { input: details });
          message = "Font details copied to clipboard";
          messageType = "success";
        } catch {
          // Fallback: just show the details
          log(`\n${colors.dim}${details}${colors.reset}`);
          message = "Could not copy to clipboard (shown above)";
          messageType = "warn";
        }
      }
      // 'b' or any other key returns to list
      selectedIdx = -1;
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  config = parseArgs(process.argv.slice(2));

  // Show help if no command and no inputs
  if (!config.command && config.inputs.length === 0) {
    console.log(HELP);
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  // Handle template command (no inputs needed)
  if (config.command === "template") {
    cmdTemplate();
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  // Handle cache command (no inputs needed)
  if (config.command === "cache") {
    cmdCache();
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  // Handle search command (no inputs needed)
  if (config.command === "search") {
    await cmdSearch();
    process.exit(CONSTANTS.EXIT_SUCCESS);
  }

  // Collect files
  const files = collectSvgFiles(config.inputs, config.recursive);

  if (files.length === 0) {
    logError("No SVG files found");
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  log(`Found ${files.length} SVG file(s)`);

  // Execute command
  try {
    switch (config.command) {
      case "list":
        await cmdList(files);
        break;

      case "embed":
        await cmdEmbed(files);
        break;

      case "extract":
        await cmdExtract(files);
        break;

      case "replace":
        await cmdReplace(files);
        break;

      case "interactive":
        await cmdInteractive(files);
        break;

      case "dedupe":
        await cmdDedupe(files);
        break;

      default:
        // Default to embed
        await cmdEmbed(files);
    }
  } catch (err) {
    logError(err.message);
    if (config.verbose) {
      console.error(err.stack);
    }
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  process.exit(CONSTANTS.EXIT_SUCCESS);
}

main();
