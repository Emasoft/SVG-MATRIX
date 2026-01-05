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
import { join, dirname, basename, extname, resolve, isAbsolute } from "path";
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
  source: null, // 'google' | 'local' | 'fontget' | 'fnt'
  timeout: CONSTANTS.DEFAULT_TIMEOUT,
  // Replace options
  mapFile: null,
  autoDownload: true,
  // Extract options
  extractDir: CONSTANTS.DEFAULT_FONTS_DIR,
  restoreLinks: false,
  // Template options
  templateOutput: null,
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
  --source <name>          Preferred font source (google|local|fontget|fnt)
  --timeout <ms>           Download timeout (default: 30000)

${colors.cyan}REPLACE OPTIONS:${colors.reset}
  --map <file>             Path to replacement YAML
  --no-auto-download       Don't download missing fonts automatically

${colors.cyan}EXTRACT OPTIONS:${colors.reset}
  --extract-dir <dir>      Directory for extracted fonts (default: ./fonts/)
  --restore-links          Convert back to external URL references

${colors.cyan}TEMPLATE OPTIONS:${colors.reset}
  --template-output <file> Output path for template (default: stdout)

${colors.cyan}EXAMPLES:${colors.reset}
  svgfonts embed icon.svg              # Embed fonts with subsetting
  svgfonts embed --full icon.svg       # Embed complete fonts
  svgfonts list document.svg           # List all fonts in SVG
  svgfonts replace --map fonts.yml *.svg  # Apply replacement map
  svgfonts extract -o ./fonts doc.svg  # Extract embedded fonts
  svgfonts interactive icon.svg        # Interactive mode
  svgfonts template > fonts.yml        # Generate template

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
// COMMAND: INTERACTIVE
// ============================================================================
async function cmdInteractive(files) {
  if (files.length === 0) {
    logError("No input files specified for interactive mode");
    process.exit(CONSTANTS.EXIT_ERROR);
  }

  const file = files[0]; // Process one file at a time in interactive mode
  const content = readFileSync(file, "utf8");
  let doc = parseSVG(content);
  let modified = false;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  // Create backup before interactive session
  if (!config.noBackup) {
    const backupPath = FontManager.createBackup(file, { noBackup: config.noBackup });
    if (backupPath) {
      log(`Backup created: ${backupPath}`);
    }
  }

  while (true) {
    console.clear();
    const fonts = FontManager.listFonts(doc);

    log(`\n${colors.bright}Fonts in: ${basename(file)}${colors.reset}`);
    log("━".repeat(60));
    log(
      `  ${colors.cyan}${"#".padEnd(4)}${"Font Family".padEnd(25)}${"Type".padEnd(12)}${"Size".padEnd(12)}Used Chars${colors.reset}`
    );
    log("━".repeat(60));

    if (fonts.length === 0) {
      log(`  ${colors.dim}No fonts found${colors.reset}`);
    } else {
      fonts.forEach((font, idx) => {
        const num = `${idx + 1}.`.padEnd(4);
        const family = font.family.slice(0, 24).padEnd(25);
        const type = font.type.padEnd(12);
        const size = font.size
          ? `${(font.size / 1024).toFixed(1)} KB`.padEnd(12)
          : "".padEnd(12);
        const chars = font.usedChars
          ? [...font.usedChars].slice(0, 15).join("") +
            (font.usedChars.size > 15 ? "..." : "")
          : "";
        log(`  ${num}${family}${type}${size}${chars}`);
      });
    }

    log("━".repeat(60));
    log(`\n${colors.cyan}Actions:${colors.reset}`);
    log("  [1-9] Select font by number");
    log("  [a]   Apply to all fonts");
    log("  [e]   Embed all external fonts");
    log("  [s]   Save and exit");
    log("  [q]   Quit without saving");

    const choice = await question(`\n${colors.bright}>${colors.reset} `);

    if (choice === "q") {
      log("\nExiting without saving.");
      rl.close();
      return;
    }

    if (choice === "s") {
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

    if (choice === "e") {
      log("\nEmbedding all external fonts...");
      doc = await SVGToolbox.embedExternalDependencies(doc, {
        embedFonts: true,
        embedImages: false,
        embedCSS: true,
        subsetFonts: true,
        verbose: config.verbose,
      });
      modified = true;
      logSuccess("Done!");
      await question("\nPress Enter to continue...");
      continue;
    }

    if (choice === "a") {
      log(`\n${colors.cyan}Apply to all fonts:${colors.reset}`);
      log("  [e] Embed all (subset)");
      log("  [E] Embed all (full)");
      log("  [b] Back");

      const subChoice = await question(`\n${colors.bright}>${colors.reset} `);

      if (subChoice === "e" || subChoice === "E") {
        log("\nEmbedding all fonts...");
        doc = await SVGToolbox.embedExternalDependencies(doc, {
          embedFonts: true,
          embedImages: false,
          embedCSS: true,
          subsetFonts: subChoice === "e",
          verbose: config.verbose,
        });
        modified = true;
        logSuccess("Done!");
        await question("\nPress Enter to continue...");
      }
      continue;
    }

    const fontIdx = parseInt(choice, 10) - 1;
    if (fontIdx >= 0 && fontIdx < fonts.length) {
      const selectedFont = fonts[fontIdx];

      log(`\n${colors.bright}Selected: ${selectedFont.family}${colors.reset}`);
      log(`Type: ${selectedFont.type}`);
      if (selectedFont.source) log(`Source: ${selectedFont.source}`);
      if (selectedFont.size) log(`Size: ${(selectedFont.size / 1024).toFixed(1)} KB`);

      log(`\n${colors.cyan}Actions:${colors.reset}`);
      log("  [e] Embed (subset)");
      log("  [E] Embed (full)");
      log("  [r] Replace with another font");
      log("  [v] Validate font link");
      log("  [b] Back to list");

      const action = await question(`\n${colors.bright}>${colors.reset} `);

      if (action === "e" || action === "E") {
        log(`\nEmbedding ${selectedFont.family}...`);
        doc = await SVGToolbox.embedExternalDependencies(doc, {
          embedFonts: true,
          embedImages: false,
          embedCSS: true,
          subsetFonts: action === "e",
          verbose: config.verbose,
        });
        modified = true;
        logSuccess("Done!");
        await question("\nPress Enter to continue...");
      } else if (action === "r") {
        const newFont = await question("Enter replacement font name: ");
        if (newFont.trim()) {
          const replaceResult = FontManager.applyFontReplacements(doc, {
            [selectedFont.family]: newFont.trim(),
          });
          if (replaceResult.modified) {
            modified = true;
            logSuccess(`Replaced: ${selectedFont.family} -> ${newFont.trim()}`);
          }
        }
        await question("\nPress Enter to continue...");
      } else if (action === "v") {
        if (selectedFont.source) {
          log(`\nValidating: ${selectedFont.source}`);
          try {
            const response = await fetch(selectedFont.source, { method: "HEAD" });
            if (response.ok) {
              logSuccess("Font link is valid!");
            } else {
              logError(`HTTP ${response.status}: ${response.statusText}`);
            }
          } catch (err) {
            logError(`Failed to validate: ${err.message}`);
          }
        } else {
          log("No external URL to validate.");
        }
        await question("\nPress Enter to continue...");
      }
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
