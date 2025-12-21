#!/usr/bin/env node
/**
 * svglinter - SVG validation CLI tool
 *
 * A linter for SVG files with ESLint/Ruff-style output.
 * Validates SVG files against SVG 1.1 specification.
 *
 * Usage:
 *   svglinter [options] <file|dir|glob...>
 *
 * Examples:
 *   svglinter icon.svg
 *   svglinter src/icons/*.svg
 *   svglinter --fix broken.svg
 *   svglinter --ignore E001,W003 *.svg
 *   svglinter --list-rules
 *
 * Library Usage:
 *   const { lint, lintFile, lintString, RULES } = require('./svglinter.cjs');
 *   const results = await lintFile('icon.svg', { ignore: ['W104'] });
 *
 * @module svglinter
 * @version 1.0.0
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Config file parsers - lazy loaded to avoid startup cost if not needed
let yaml = null;
let toml = null;

/**
 * Lazy load YAML parser.
 * @returns {Object} js-yaml module
 * @throws {Error} If js-yaml is not installed
 */
function getYamlParser() {
  if (!yaml) {
    try {
      yaml = require("js-yaml");
    } catch {
      throw new Error(
        "js-yaml is required for YAML config files. Install with: npm install js-yaml",
      );
    }
  }
  return yaml;
}

/**
 * Lazy load TOML parser.
 * @returns {Object} toml module
 * @throws {Error} If toml is not installed
 */
function getTomlParser() {
  if (!toml) {
    try {
      toml = require("toml");
    } catch {
      throw new Error(
        "toml is required for TOML config files. Install with: npm install toml",
      );
    }
  }
  return toml;
}

/**
 * Parse INI/properties file format.
 * Supports sections [section] and key=value pairs. Built-in, no dependencies.
 * @param {string} content - INI file content
 * @returns {Object} Parsed object with sections as nested objects
 */
function parseIni(content) {
  const result = {};
  let currentSection = result;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }

    // Section header [section]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      result[sectionName] = result[sectionName] || {};
      currentSection = result[sectionName];
      continue;
    }

    // Key=value pair
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove quotes if present (require at least 2 chars to avoid single quote edge case)
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }

      // Try to parse as JSON for arrays/objects
      try {
        currentSection[key] = JSON.parse(value);
      } catch {
        // Keep as string, handling booleans and numbers
        if (value.toLowerCase() === "true") currentSection[key] = true;
        else if (value.toLowerCase() === "false") currentSection[key] = false;
        else if (value !== "" && Number.isFinite(Number(value)))
          currentSection[key] = Number(value);
        else currentSection[key] = value;
      }
    }
  }

  return result;
}

/**
 * Strip comments from JSONC (JSON with Comments) content safely.
 * Uses a state machine to avoid stripping // or /* inside string literals.
 * @param {string} str - JSONC content
 * @returns {string} JSON content with comments removed
 */
function stripJsonComments(str) {
  let result = "";
  let i = 0;
  const len = str.length;

  while (i < len) {
    const ch = str[i];
    const next = str[i + 1];

    // Handle string literals - copy them verbatim
    if (ch === '"') {
      result += ch;
      i++;
      // Copy string contents including escaped chars
      while (i < len) {
        const strCh = str[i];
        result += strCh;
        if (strCh === "\\" && i + 1 < len) {
          // Copy escaped character
          i++;
          result += str[i];
        } else if (strCh === '"') {
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // Handle single-line comments //
    if (ch === "/" && next === "/") {
      // Skip until end of line
      while (i < len && str[i] !== "\n") {
        i++;
      }
      continue;
    }

    // Handle multi-line comments /* */
    if (ch === "/" && next === "*") {
      i += 2;
      let foundEnd = false;
      // Skip until */ (use len instead of len-1 to handle last char properly)
      while (i < len) {
        if (i < len - 1 && str[i] === "*" && str[i + 1] === "/") {
          i += 2;
          foundEnd = true;
          break;
        }
        i++;
      }
      // BUG FIX: Warn about unclosed multi-line comment instead of silently continuing
      if (!foundEnd) {
        console.warn(
          "Warning: Unclosed multi-line comment in JSONC, remaining content may be parsed incorrectly",
        );
      }
      continue;
    }

    // Regular character - copy it
    result += ch;
    i++;
  }

  return result;
}

/**
 * Escape regex special characters for XML key path matching.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in regex
 */
// BUG FIX: Renamed to avoid duplicate function name - this version escapes ALL special chars
// Used for XML key path escaping where * should be literal
function escapeRegexCharsForXml(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse XML config value from element path.
 * Simple XML parser for config extraction (built-in, limited).
 * Only extracts text content from simple element paths.
 * @param {string} content - XML file content
 * @param {string} keyPath - Dot-separated path like 'PropertyGroup.SvgLintConfig'
 * @returns {Object|undefined} Parsed JSON from element text, or undefined
 */
function parseXmlConfigValue(content, keyPath) {
  const keys = keyPath.split(".");
  let current = content;

  for (const key of keys) {
    // Escape regex special chars in key to prevent injection attacks
    const escapedKey = escapeRegexCharsForXml(key);
    const regex = new RegExp(
      `<${escapedKey}[^>]*>([\\s\\S]*?)</${escapedKey}>`,
      "i",
    );
    const match = current.match(regex);
    if (!match) return undefined;
    current = match[1].trim();
  }

  // Try to parse the content as JSON
  try {
    return JSON.parse(current);
  } catch {
    return undefined;
  }
}

// ============================================================================
// CONSTANTS AND VERSION
// ============================================================================

/** Package version - read from package.json */
const VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    return pkg.version || "1.0.0";
  } catch {
    // Silently fall back to default version - package.json read failure is non-fatal
    // This can happen when running from different directory structures or in bundled environments
    return "1.0.0";
  }
})();

/** Valid output format names */
const VALID_FORMATS = new Set([
  "stylish",
  "compact",
  "ruff",
  "json",
  "json-compact",
  "tap",
  "junit",
  "txt",
  "text",
  "detailed",
  "txt-compact",
  "text-compact",
  "xml",
  "xml-compact",
  "md",
  "markdown",
  "md-compact",
  "markdown-compact",
  "sarif",
  "github",
]);

/** Default max line width for text reports */
const DEFAULT_MAX_LINE_WIDTH = 80;
const MIN_MAX_LINE_WIDTH = 40;
const MAX_MAX_LINE_WIDTH = 500;

/** Default file read timeout for network drives (ms) */
const FILE_READ_TIMEOUT = 30000;

/** Maximum symlink depth to prevent infinite loops */
const MAX_SYMLINK_DEPTH = 20;

/** Maximum file size to process (100 MB) - prevents OOM on huge files */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ============================================================================
// RULE REGISTRY - All validation rules with unique codes and descriptions
// ============================================================================

/**
 * Rule registry mapping issue types to codes and descriptions
 * Format: { code, type, severity, description, fixable }
 *
 * Codes:
 *   E001-E099: Reference errors
 *   E100-E199: Structure errors
 *   E200-E299: Syntax errors
 *   W001-W099: Reference warnings
 *   W100-W199: Typo/unknown warnings
 *   W200-W299: Style warnings
 */
const RULES = {
  // === ERRORS (E###) ===

  // Reference errors (E001-E099)
  E001: {
    type: "broken_reference",
    severity: "error",
    description: 'Reference to non-existent ID (url(#id) or xlink:href="#id")',
    fixable: false,
  },
  E002: {
    type: "broken_url_reference",
    severity: "error",
    description: "Broken URL reference in href or xlink:href attribute",
    fixable: false,
  },
  E003: {
    type: "duplicate_id",
    severity: "error",
    description: "Duplicate ID attribute (IDs must be unique)",
    fixable: true,
  },

  // Structure errors (E100-E199)
  E101: {
    type: "missing_required_attribute",
    severity: "error",
    description: "Required attribute is missing on element",
    fixable: false,
  },
  E102: {
    type: "invalid_child_element",
    severity: "error",
    description: "Invalid child element (not allowed by SVG spec)",
    fixable: false,
  },
  E103: {
    type: "animation_in_empty_element",
    severity: "error",
    description: "Animation element inside empty element (no valid target)",
    fixable: false,
  },

  // Syntax errors (E200-E299)
  E201: {
    type: "malformed_viewbox",
    severity: "error",
    description: "Malformed viewBox attribute (requires 4 numbers)",
    fixable: false,
  },
  E202: {
    type: "malformed_points",
    severity: "error",
    description: "Malformed points attribute on polygon/polyline",
    fixable: false,
  },
  E203: {
    type: "malformed_transform",
    severity: "error",
    description: "Malformed transform attribute",
    fixable: false,
  },
  E204: {
    type: "invalid_enum_value",
    severity: "error",
    description: "Invalid enumeration value for attribute",
    fixable: false,
  },
  E205: {
    type: "invalid_numeric_constraint",
    severity: "error",
    description:
      "Numeric value violates constraint (negative where positive required)",
    fixable: false,
  },
  E206: {
    type: "invalid_character",
    severity: "error",
    description:
      "Invalid control character in SVG content (NULL, DEL, or Unicode non-character)",
    fixable: false,
  },
  E207: {
    type: "fatal_error",
    severity: "error",
    description:
      "Fatal error processing file (parse error, I/O error, or other failure)",
    fixable: false,
  },
  E208: {
    type: "malformed_path_data",
    severity: "error",
    description:
      "Malformed path data in d attribute (must start with M/m, no invalid chars)",
    fixable: false,
  },

  // === WARNINGS (W###) ===

  // Reference warnings (W001-W099)
  W001: {
    type: "invalid_attr_on_element",
    severity: "warning",
    description: "Attribute not valid on this element type",
    fixable: false,
  },
  W002: {
    type: "missing_namespace",
    severity: "warning",
    description: "Missing xmlns namespace declaration on root SVG",
    fixable: true,
  },
  W003: {
    type: "invalid_timing",
    severity: "warning",
    description: "Invalid timing value in animation element",
    fixable: false,
  },

  // Typo/unknown warnings (W100-W199)
  W101: {
    type: "mistyped_element_detected",
    severity: "warning",
    description: "Possible typo in element name (similar to valid SVG element)",
    fixable: true,
  },
  W102: {
    type: "unknown_element_detected",
    severity: "warning",
    description: "Unknown element (not in SVG 1.1 or SVG 2.0 spec)",
    fixable: false,
  },
  W103: {
    type: "mistyped_attribute_detected",
    severity: "warning",
    description:
      "Possible typo in attribute name (similar to valid SVG attribute)",
    fixable: true,
  },
  W104: {
    type: "unknown_attribute_detected",
    severity: "warning",
    description: "Unknown attribute (not in SVG 1.1 spec)",
    fixable: false,
  },

  // Style warnings (W200-W299)
  W201: {
    type: "uppercase_unit",
    severity: "warning",
    description: "Uppercase unit (should be lowercase: px, em, etc.)",
    fixable: true,
  },
  W202: {
    type: "invalid_whitespace",
    severity: "warning",
    description: "Invalid whitespace in attribute value",
    fixable: true,
  },
  W203: {
    type: "invalid_number",
    severity: "warning",
    description: "Invalid number format in attribute value",
    fixable: false,
  },
  W204: {
    type: "invalid_color",
    severity: "warning",
    description:
      "Invalid color value (not a valid CSS color or SVG color keyword)",
    fixable: false,
  },

  // Structure warnings (W300-W399)
  W301: {
    type: "circular_reference",
    severity: "warning",
    description:
      "Circular reference detected (mask/clipPath/filter/use references itself)",
    fixable: false,
  },
  W302: {
    type: "deep_nesting",
    severity: "warning",
    description: "Excessive element nesting depth (may cause rendering issues)",
    fixable: false,
  },
  W303: {
    type: "empty_defs",
    severity: "warning",
    description: "Empty <defs> element (can be removed)",
    fixable: true,
  },
  W304: {
    type: "gradient_stop_order",
    severity: "warning",
    description:
      "Gradient stops not in ascending offset order (may render incorrectly)",
    fixable: false,
  },

  // Performance warnings (W400-W499)
  W401: {
    type: "path_complexity",
    severity: "warning",
    description:
      "Path has excessive complexity (>10000 coordinates, may cause slow rendering)",
    fixable: false,
  },

  // Security warnings (W500-W599)
  W501: {
    type: "external_resource",
    severity: "warning",
    description:
      "External resource reference detected (potential security/CORS issue)",
    fixable: false,
  },
  W502: {
    type: "script_content",
    severity: "warning",
    description:
      "Script content detected (potential security issue in untrusted SVGs)",
    fixable: false,
  },
  W503: {
    type: "event_handler",
    severity: "warning",
    description: "Event handler attribute detected (potential XSS vector)",
    fixable: false,
  },

  // Accessibility warnings (W600-W699)
  W601: {
    type: "missing_title",
    severity: "warning",
    description: "Missing <title> element (recommended for accessibility)",
    fixable: false,
  },
  W602: {
    type: "missing_desc",
    severity: "warning",
    description: "Missing <desc> element (recommended for complex SVGs)",
    fixable: false,
  },
  W603: {
    type: "invalid_aria",
    severity: "warning",
    description: "Invalid ARIA attribute or value",
    fixable: false,
  },
  W604: {
    type: "missing_lang",
    severity: "warning",
    description: "Missing lang/xml:lang attribute on SVG with text content",
    fixable: false,
  },
};

// Create reverse lookup: type -> code
const TYPE_TO_CODE = {};
for (const [code, rule] of Object.entries(RULES)) {
  TYPE_TO_CODE[rule.type] = code;
}

// ============================================================================
// ANSI COLORS
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  blue: "\x1b[34m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
};

const NO_COLOR = process.env.NO_COLOR || process.env.SVGLINT_NO_COLOR;
const FORCE_COLOR = process.env.FORCE_COLOR || process.env.SVGLINT_FORCE_COLOR;

/**
 * Detect if we're in a real terminal or embedded/emulated terminal
 * Checks for common CI environments, embedded terminals, and TTY
 * @returns {boolean}
 */
function detectTerminalCapabilities() {
  // Check for CI environments (usually no color)
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return !!FORCE_COLOR; // Only color if explicitly forced
  }
  // Check for dumb terminal
  if (process.env.TERM === "dumb") {
    return false;
  }
  // Check for common terminal emulators
  if (
    process.env.TERM_PROGRAM ||
    process.env.COLORTERM ||
    process.env.WT_SESSION
  ) {
    return true;
  }
  // Fall back to TTY check
  return process.stdout.isTTY;
}

let useColors = FORCE_COLOR || (!NO_COLOR && detectTerminalCapabilities());
let verboseMode = false;

/**
 * Apply ANSI color to text if colors are enabled
 * @param {string} color - Color name from colors object
 * @param {string} text - Text to colorize
 * @returns {string}
 */
function c(color, text) {
  if (!useColors) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Log verbose debug message (only when --verbose is enabled)
 * @param {...any} args - Arguments to log
 */
function verbose(...args) {
  if (verboseMode) {
    const timestamp = new Date().toISOString().substring(11, 23);
    console.error(c("dim", `[${timestamp}]`), ...args);
  }
}

/**
 * Log warning message to stderr
 * @param {string} message - Warning message
 * @param {Error} [error] - Optional error object for stack trace
 */
function warn(message, error = null) {
  console.error(c("yellow", `Warning: ${message}`));
  if (error && verboseMode) {
    console.error(c("dim", error.stack || error.message));
  }
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/**
 * Escape special XML characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape special Markdown characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeMarkdown(str) {
  if (!str) return "";
  return String(str)
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Normalize line endings for cross-platform compatibility
 * Handles Windows (CRLF), Unix (LF), and old Mac (CR) line endings
 * @param {string} content - Content to normalize
 * @returns {string} Normalized content with LF line endings
 */
function normalizeLineEndings(content) {
  // Type validation for exported library function
  if (typeof content !== "string") {
    throw new TypeError("normalizeLineEndings expects a string argument");
  }
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Remove UTF-8 BOM if present
 * @param {string} content - File content
 * @returns {string} Content without BOM
 */
function stripBOM(content) {
  // Type validation for exported library function
  if (typeof content !== "string") {
    return content; // Return non-strings unchanged (graceful degradation)
  }
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

/**
 * Detect and validate file encoding from XML declaration
 * @param {string} content - File content
 * @returns {{encoding: string, valid: boolean}} Detected encoding info
 */
function detectEncoding(content) {
  // Look for XML declaration: <?xml version="1.0" encoding="UTF-8"?>
  const xmlDeclMatch = content.match(
    /<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i,
  );
  if (xmlDeclMatch) {
    const encoding = xmlDeclMatch[1].toUpperCase();
    // Only UTF-8 and ASCII are reliably supported
    const valid = [
      "UTF-8",
      "US-ASCII",
      "ASCII",
      "ISO-8859-1",
      "LATIN1",
    ].includes(encoding);
    return { encoding, valid };
  }
  return { encoding: "UTF-8", valid: true }; // Default to UTF-8
}

/**
 * Check for invalid/control characters in content
 * Returns array of found issues
 * @param {string} content - Content to check
 * @returns {Array<{char: string, code: number, line: number, column: number}>}
 */
function findInvalidCharacters(content) {
  // Type validation for exported library function
  if (typeof content !== "string") {
    return []; // Return empty array for non-strings
  }
  const issues = [];
  const lines = content.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const code = line.charCodeAt(colIdx);
      // Check for control characters (except tab, newline, carriage return)
      // Also check for NULL bytes and other problematic characters
      if (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        code === 127 || // DEL
        (code >= 0xfdd0 && code <= 0xfdef) || // Non-characters
        (code & 0xffff) === 0xfffe || // Non-character
        (code & 0xffff) === 0xffff
      ) {
        // Non-character
        issues.push({
          char: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
          code,
          line: lineIdx + 1,
          column: colIdx + 1,
        });
      }
    }
  }

  return issues;
}

/**
 * Read file with timeout support for network drives
 * Includes file size check to prevent OOM on huge files
 * @param {string} filePath - Path to file
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<string>} File content
 */
async function readFileWithTimeout(filePath, timeout = FILE_READ_TIMEOUT) {
  // Check file size first to prevent OOM on huge files
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      throw new Error(
        `File '${filePath}' is too large (${sizeMB} MB) - max ${maxMB} MB`,
      );
    }
  } catch (err) {
    if (err.message.includes("too large")) {
      throw err; // Re-throw our own error
    }
    // Ignore stat errors - they'll be caught by readFile
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Timeout reading file '${filePath}' after ${timeout}ms (possibly slow network drive)`,
        ),
      );
    }, timeout);

    fs.readFile(filePath, "utf8", (err, data) => {
      clearTimeout(timeoutId);
      if (err) {
        reject(new Error(`Failed to read '${filePath}': ${err.message}`));
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Read content from stdin (non-blocking with timeout)
 * @param {number} timeout - Timeout in milliseconds (default 30000)
 * @returns {Promise<string>} Content from stdin
 */
async function readStdin(timeout = 30000) {
  return new Promise((resolve, reject) => {
    // Check if stdin is a TTY (interactive terminal) - if so, no piped input
    if (process.stdin.isTTY) {
      reject(
        new Error("No piped input detected (stdin is interactive terminal)"),
      );
      return;
    }

    let data = "";

    // BUG FIX: Define named handlers so we can remove only our specific listeners (not all)
    // These functions reference each other before definition due to the cleanup pattern
    /* eslint-disable no-use-before-define */
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
    };

    const onData = (chunk) => {
      data += chunk;
    };
    const onEnd = () => {
      clearTimeout(timeoutId);
      cleanup();
      resolve(data);
    };
    const onError = (err) => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error(`Error reading stdin: ${err.message}`));
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout reading from stdin after ${timeout}ms`));
    }, timeout);
    /* eslint-enable no-use-before-define */

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
}

/**
 * Check if path is a symbolic link and resolve it safely
 * @param {string} filePath - Path to check
 * @param {number} depth - Current recursion depth
 * @returns {{resolved: string, isSymlink: boolean, error: string|null}}
 */
function resolveSymlink(filePath, depth = 0) {
  if (depth > MAX_SYMLINK_DEPTH) {
    return {
      resolved: filePath,
      isSymlink: true,
      error: `Symlink loop or excessive depth (>${MAX_SYMLINK_DEPTH})`,
    };
  }

  try {
    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      const target = fs.readlinkSync(filePath);
      const resolvedTarget = path.isAbsolute(target)
        ? target
        : path.join(path.dirname(filePath), target);
      return resolveSymlink(resolvedTarget, depth + 1);
    }
    return { resolved: filePath, isSymlink: false, error: null };
  } catch (err) {
    return { resolved: filePath, isSymlink: false, error: err.message };
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Dedicated config files (highest priority)
// Note: JS config files are NOT supported (would require dynamic require/import)
const CONFIG_FILES = [
  ".svglintrc", // Assumed JSON
  ".svglintrc.json",
  ".svglintrc.yaml",
  ".svglintrc.yml",
  ".svglintrc.toml",
  "svglint.config.json",
  "svglint.config.yaml",
  "svglint.config.yml",
  "svglint.config.toml",
];

// Project config files that may contain svglint config (lower priority)
// Format: { file, parser, key } where key is the config key path
// SUPPORTED PARSERS: json, yaml, toml, ini, properties, xml
// NOTE: Language-specific parsers (gomod, ruby, swift, js, elixir, sbt, edn, clojure,
//       zon, nimble, dune, erlang, lua, dcf, vmod, sdl, meson, bazelrc) are NOT supported
const PROJECT_CONFIG_FILES = [
  // ============ JavaScript/TypeScript Ecosystem ============
  { file: "package.json", parser: "json", key: "svglint" }, // npm/node projects
  { file: "package.json", parser: "json", key: "svglintConfig" }, // alternate key
  { file: "deno.json", parser: "json", key: "svglint" }, // Deno projects
  { file: "deno.jsonc", parser: "json", key: "svglint" }, // Deno projects (JSONC)

  // ============ Python Ecosystem ============
  { file: "pyproject.toml", parser: "toml", key: "tool.svglint" }, // Python (PEP 518)
  { file: "setup.cfg", parser: "ini", key: "svglint" }, // Python legacy

  // ============ Rust Ecosystem ============
  { file: "Cargo.toml", parser: "toml", key: "package.metadata.svglint" }, // Rust crates
  { file: "Cargo.toml", parser: "toml", key: "workspace.metadata.svglint" }, // Rust workspaces

  // ============ PHP Ecosystem ============
  { file: "composer.json", parser: "json", key: "extra.svglint" }, // PHP Composer

  // ============ Java/Kotlin/Gradle Ecosystem ============
  { file: "gradle.properties", parser: "properties", key: "svglint" }, // Gradle properties

  // ============ .NET/C# Ecosystem ============
  {
    file: "Directory.Build.props",
    parser: "xml",
    key: "PropertyGroup.SvgLintConfig",
  }, // .NET
  { file: "nuget.config", parser: "xml", key: "configuration.svglint" }, // NuGet

  // ============ Mobile: Flutter/Dart ============
  { file: "pubspec.yaml", parser: "yaml", key: "svglint" }, // Flutter/Dart

  // ============ Chinese Mini Programs & Frameworks ============
  { file: "project.config.json", parser: "json", key: "svglint" }, // WeChat Mini Program
  { file: "app.json", parser: "json", key: "svglint" }, // WeChat/Alipay/Baidu Mini Program
  { file: "mini.project.json", parser: "json", key: "svglint" }, // Alipay Mini Program
  { file: "project.tt.json", parser: "json", key: "svglint" }, // ByteDance Mini Program
  { file: "project.swan.json", parser: "json", key: "svglint" }, // Baidu Mini Program
  { file: "manifest.json", parser: "json", key: "svglint" }, // Quick App / uni-app
  { file: "pages.json", parser: "json", key: "svglint" }, // uni-app

  // ============ Korean Frameworks ============
  { file: "kakao.config.json", parser: "json", key: "svglint" }, // Kakao Mini
  { file: "naver.config.json", parser: "json", key: "svglint" }, // Naver Mini

  // ============ Other Languages (with supported parsers) ============
  { file: "package.yaml", parser: "yaml", key: "extra.svglint" }, // Haskell Stack
  { file: "Project.toml", parser: "toml", key: "extras.svglint" }, // Julia
  { file: "shard.yml", parser: "yaml", key: "svglint" }, // Crystal
  { file: "dub.json", parser: "json", key: "svglint" }, // D language
  { file: "gradle/libs.versions.toml", parser: "toml", key: "svglint" }, // Gradle version catalog

  // ============ Build Systems ============
  {
    file: "CMakePresets.json",
    parser: "json",
    key: "configurePresets.0.cacheVariables.SVGLINT_CONFIG",
  }, // CMake
  { file: ".buckconfig", parser: "ini", key: "svglint" }, // Buck2
  { file: "nx.json", parser: "json", key: "svglint" }, // Nx monorepo
  { file: "turbo.json", parser: "json", key: "svglint" }, // Turborepo
  { file: "lerna.json", parser: "json", key: "svglint" }, // Lerna monorepo
  { file: "rush.json", parser: "json", key: "svglint" }, // Rush monorepo
  { file: "pnpm-workspace.yaml", parser: "yaml", key: "svglint" }, // pnpm workspace
  { file: ".yarnrc.yml", parser: "yaml", key: "svglint" }, // Yarn Berry
];

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj - Object to extract from
 * @param {string} keyPath - Dot-separated key path (e.g., 'tool.svglint')
 * @returns {*} The value at the path, or undefined if not found
 */
function getNestedValue(obj, keyPath) {
  if (!obj || typeof obj !== "object") return undefined;
  const keys = keyPath.split(".");
  let current = obj;
  for (const key of keys) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Parse config file content based on file extension
 * @param {string} content - File content to parse
 * @param {string} filepath - File path (used to detect format from extension)
 * @returns {Object} Parsed configuration object
 * @throws {Error} If parsing fails or format is unsupported
 */
function parseConfigContent(content, filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const basename = path.basename(filepath).toLowerCase();

  // Determine format based on extension
  if (ext === ".yaml" || ext === ".yml") {
    const yamlParser = getYamlParser();
    return yamlParser.load(content);
  }

  if (ext === ".toml") {
    const tomlParser = getTomlParser();
    return tomlParser.parse(content);
  }

  if (ext === ".json" || basename === ".svglintrc") {
    // JSON format (including extensionless .svglintrc which is assumed JSON)
    return JSON.parse(content);
  }

  if (ext === ".js") {
    // JS configs require dynamic import which is complex in CJS
    throw new Error(
      `JS config files are not supported in CJS mode. Use JSON, YAML, or TOML format instead.`,
    );
  }

  // Unknown extension - try JSON first, then YAML
  try {
    return JSON.parse(content);
  } catch {
    try {
      const yamlParser = getYamlParser();
      return yamlParser.load(content);
    } catch {
      throw new Error(
        `Unable to parse config file. Tried JSON and YAML formats.`,
      );
    }
  }
}

/**
 * Load configuration from file.
 * Supports JSON, YAML (.yaml, .yml), and TOML (.toml) formats.
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig(configPath) {
  const defaultConfig = {
    ignore: [],
    select: [],
    fix: false,
    quiet: false,
    format: "stylish",
    maxWarnings: -1,
    bail: false,
  };

  // If explicit config path provided
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(c("red", `Error: Config file not found: ${configPath}`));
      process.exit(2);
    }
    try {
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = parseConfigContent(content, configPath);
      return { ...defaultConfig, ...parsed };
    } catch (err) {
      console.error(c("red", `Error parsing config file: ${err.message}`));
      process.exit(2);
    }
  }

  // Search for config file in current directory
  for (const filename of CONFIG_FILES) {
    const filepath = path.join(process.cwd(), filename);
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, "utf8");
        const parsed = parseConfigContent(content, filepath);
        return { ...defaultConfig, ...parsed };
      } catch (err) {
        // Warn about parse errors in auto-discovered configs so users know their config is broken
        console.error(
          c(
            "yellow",
            `Warning: Failed to parse config file '${filename}': ${err.message}`,
          ),
        );
        console.error(
          c(
            "dim",
            `  Using default configuration. Fix the config file or use --config to specify a valid one.`,
          ),
        );
      }
    }
  }

  // Search for config in project config files (package.json, Cargo.toml, pyproject.toml, etc.)
  for (const { file, parser, key } of PROJECT_CONFIG_FILES) {
    // Handle glob patterns in file names (e.g., *.nimble, *.rockspec)
    let filepath;
    if (file.includes("*")) {
      const pattern = file.replace("*", "");
      const cwd = process.cwd();
      try {
        const files = fs.readdirSync(cwd).filter((f) => f.endsWith(pattern));
        if (files.length === 0) continue;
        filepath = path.join(cwd, files[0]);
      } catch (err) {
        verbose(
          `Failed to read directory '${cwd}' for config '${file}': ${err.message}`,
        );
        continue;
      }
    } else {
      filepath = path.join(process.cwd(), file);
    }

    if (!fs.existsSync(filepath)) continue;

    try {
      const content = fs.readFileSync(filepath, "utf8");
      let parsed;
      let svglintConfig;

      // Parse based on parser type
      switch (parser) {
        case "json": {
          // Handle JSONC (JSON with comments) using state-machine based parser
          const stripped = stripJsonComments(content);
          parsed = JSON.parse(stripped);
          svglintConfig = getNestedValue(parsed, key);
          break;
        }

        case "toml": {
          const tomlParser = getTomlParser();
          parsed = tomlParser.parse(content);
          svglintConfig = getNestedValue(parsed, key);
          break;
        }

        case "yaml": {
          const yamlParser = getYamlParser();
          parsed = yamlParser.load(content);
          svglintConfig = getNestedValue(parsed, key);
          break;
        }

        case "ini":
        case "properties":
          parsed = parseIni(content);
          svglintConfig = getNestedValue(parsed, key);
          break;

        case "xml":
          // For XML files, try to extract JSON config from element
          svglintConfig = parseXmlConfigValue(content, key);
          break;

        // Unsupported parsers - skip silently (comment-based configs not implemented)
        case "gomod":
        case "ruby":
        case "swift":
        case "js":
        case "elixir":
        case "sbt":
        case "edn":
        case "clojure":
        case "zon":
        case "nimble":
        case "dune":
        case "erlang":
        case "lua":
        case "dcf":
        case "vmod":
        case "sdl":
        case "meson":
        case "bazelrc":
          // These would require language-specific parsers or comment extraction
          // For now, skip them silently - users can use dedicated config files
          continue;

        default:
          continue;
      }

      if (svglintConfig && typeof svglintConfig === "object") {
        return { ...defaultConfig, ...svglintConfig };
      }
    } catch (err) {
      // Skip project config files that fail to parse - they may not contain svglint config
      // Log in verbose mode so users can debug config issues
      verbose(`Skipping config file '${filepath}': ${err.message}`);
    }
  }

  return defaultConfig;
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

/**
 * Parse command-line arguments.
 * @param {string[]} argv - Process argv array
 * @returns {Object} Parsed arguments object
 */
function parseArgs(argv) {
  const args = {
    files: [],
    fix: false,
    quiet: false,
    format: "stylish",
    maxWarnings: -1,
    errorsOnly: false,
    help: false,
    version: false,
    color: null, // null = auto-detect, true = force color, false = no color
    outputFile: null,
    outputMode: "auto", // 'terminal', 'file', 'both', 'auto' (auto: terminal unless -o specified)
    config: null,
    ignore: [],
    select: [],
    listRules: false,
    showIgnored: false,
    bail: false,
    stats: false, // Show statistics by rule code
    explain: null, // Explain a specific rule
    init: false, // Generate default config
    maxLineWidth: 80, // Max width for detailed text report lines
    verbose: false, // Enable verbose debug output
    stdin: false, // Read from stdin instead of files
    severityOverrides: {}, // Map of rule code -> 'error'|'warning' for severity customization
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--version" || arg === "-v") {
      args.version = true;
    } else if (arg === "--fix") {
      args.fix = true;
    } else if (arg === "--quiet" || arg === "-q") {
      args.quiet = true;
    } else if (arg === "--errors-only" || arg === "-E") {
      args.errorsOnly = true;
    } else if (arg === "--max-warnings" || arg === "-W") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(c("red", `Error: --max-warnings requires a number`));
        process.exit(2);
      }
      const num = parseInt(argv[i], 10);
      if (Number.isNaN(num) || num < 0) {
        console.error(
          c("red", `Error: --max-warnings must be a non-negative integer`),
        );
        process.exit(2);
      }
      args.maxWarnings = num;
    } else if (arg.startsWith("--max-warnings=")) {
      const value = arg.split("=")[1];
      const num = parseInt(value, 10);
      if (Number.isNaN(num) || num < 0) {
        console.error(
          c("red", `Error: --max-warnings must be a non-negative integer`),
        );
        process.exit(2);
      }
      args.maxWarnings = num;
    } else if (arg === "--severity") {
      // Format: --severity RULE:LEVEL (e.g., --severity W101:error or --severity E001:warning)
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --severity requires RULE:LEVEL format (e.g., --severity W101:error)`,
          ),
        );
        process.exit(2);
      }
      const parts = argv[i].split(":");
      if (parts.length !== 2) {
        console.error(
          c(
            "red",
            `Error: --severity must be in RULE:LEVEL format (e.g., W101:error)`,
          ),
        );
        process.exit(2);
      }
      const [ruleCode, level] = [
        parts[0].toUpperCase(),
        parts[1].toLowerCase(),
      ];
      if (!RULES[ruleCode]) {
        console.error(
          c(
            "red",
            `Error: Unknown rule '${ruleCode}'. Use --list-rules to see available rules.`,
          ),
        );
        process.exit(2);
      }
      if (level !== "error" && level !== "warning") {
        console.error(
          c(
            "red",
            `Error: Severity level must be 'error' or 'warning', got '${level}'`,
          ),
        );
        process.exit(2);
      }
      args.severityOverrides[ruleCode] = level;
    } else if (arg.startsWith("--severity=")) {
      // Format: --severity=RULE:LEVEL
      const value = arg.substring("--severity=".length);
      const parts = value.split(":");
      if (parts.length !== 2) {
        console.error(
          c(
            "red",
            `Error: --severity must be in RULE:LEVEL format (e.g., --severity=W101:error)`,
          ),
        );
        process.exit(2);
      }
      const [ruleCode, level] = [
        parts[0].toUpperCase(),
        parts[1].toLowerCase(),
      ];
      if (!RULES[ruleCode]) {
        console.error(
          c(
            "red",
            `Error: Unknown rule '${ruleCode}'. Use --list-rules to see available rules.`,
          ),
        );
        process.exit(2);
      }
      if (level !== "error" && level !== "warning") {
        console.error(
          c(
            "red",
            `Error: Severity level must be 'error' or 'warning', got '${level}'`,
          ),
        );
        process.exit(2);
      }
      args.severityOverrides[ruleCode] = level;
    } else if (arg === "--no-color") {
      args.color = false;
    } else if (arg === "--color") {
      args.color = true;
    } else if (arg === "--output-mode") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --output-mode requires a mode: terminal, file, both, or auto`,
          ),
        );
        process.exit(2);
      }
      const mode = argv[i].toLowerCase();
      if (["terminal", "file", "both", "auto"].includes(mode)) {
        args.outputMode = mode;
      } else {
        console.error(
          c(
            "red",
            `Invalid output mode: ${argv[i]}. Use: terminal, file, both, or auto`,
          ),
        );
        process.exit(2);
      }
    } else if (arg.startsWith("--output-mode=")) {
      const value = arg.split("=")[1];
      if (!value || value.trim() === "") {
        console.error(
          c(
            "red",
            `Error: --output-mode= requires a mode: terminal, file, both, or auto`,
          ),
        );
        process.exit(2);
      }
      const mode = value.toLowerCase();
      if (["terminal", "file", "both", "auto"].includes(mode)) {
        args.outputMode = mode;
      } else {
        console.error(
          c(
            "red",
            `Invalid output mode: ${value}. Use: terminal, file, both, or auto`,
          ),
        );
        process.exit(2);
      }
    } else if (arg === "--list-rules" || arg === "--rules") {
      args.listRules = true;
    } else if (arg === "--show-ignored") {
      args.showIgnored = true;
    } else if (arg === "--bail" || arg === "--fail-fast" || arg === "-x") {
      args.bail = true;
    } else if (arg === "--stats") {
      args.stats = true;
    } else if (arg === "--explain") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --explain requires a rule code (e.g., --explain E001)`,
          ),
        );
        process.exit(2);
      }
      args.explain = argv[i].toUpperCase();
    } else if (arg.startsWith("--explain=")) {
      const value = arg.split("=")[1];
      if (!value || value.trim() === "") {
        console.error(
          c(
            "red",
            `Error: --explain= requires a rule code (e.g., --explain=E001)`,
          ),
        );
        process.exit(2);
      }
      args.explain = value.toUpperCase();
    } else if (arg === "--init") {
      args.init = "json"; // Default to JSON format
    } else if (arg.startsWith("--init=")) {
      const value = arg.split("=")[1].toLowerCase();
      if (!["json", "yaml", "yml", "toml"].includes(value)) {
        console.error(
          c(
            "red",
            `Error: --init= format must be one of: json, yaml, yml, toml`,
          ),
        );
        process.exit(2);
      }
      args.init = value === "yml" ? "yaml" : value; // Normalize yml to yaml
    } else if (arg === "--format" || arg === "-f") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --format requires a format type (e.g., stylish, json, ruff)`,
          ),
        );
        process.exit(2);
      }
      args.format = argv[i];
    } else if (arg.startsWith("--format=")) {
      const value = arg.split("=")[1];
      if (!value || value.trim() === "") {
        console.error(
          c(
            "red",
            `Error: --format= requires a format type (e.g., stylish, json, ruff)`,
          ),
        );
        process.exit(2);
      }
      args.format = value;
      // NOTE: --max-warnings is handled earlier at lines 1144-1163 (with -W shortcut)
      // Removed duplicate handling that was here
    } else if (arg === "--output" || arg === "-o") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(c("red", `Error: --output requires a file path`));
        process.exit(2);
      }
      if (argv[i].trim() === "") {
        console.error(c("red", `Error: --output file path cannot be empty`));
        process.exit(2);
      }
      args.outputFile = argv[i];
    } else if (arg.startsWith("--output=")) {
      const value = arg.split("=")[1];
      if (!value || value.trim() === "") {
        console.error(c("red", `Error: --output= requires a file path`));
        process.exit(2);
      }
      args.outputFile = value;
    } else if (arg === "--config" || arg === "-c") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(c("red", `Error: --config requires a file path`));
        process.exit(2);
      }
      if (argv[i].trim() === "") {
        console.error(c("red", `Error: --config file path cannot be empty`));
        process.exit(2);
      }
      args.config = argv[i];
    } else if (arg.startsWith("--config=")) {
      const value = arg.split("=")[1];
      if (!value || value.trim() === "") {
        console.error(c("red", `Error: --config= requires a file path`));
        process.exit(2);
      }
      args.config = value;
    } else if (arg === "--ignore" || arg === "-i") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --ignore requires a comma-separated list of rule codes (e.g., E001,W104)`,
          ),
        );
        process.exit(2);
      }
      const codes = argv[i]
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      if (codes.length === 0) {
        console.error(
          c("red", `Error: --ignore requires at least one rule code`),
        );
        process.exit(2);
      }
      args.ignore.push(...codes);
    } else if (arg.startsWith("--ignore=")) {
      const value = arg.split("=")[1];
      const codes = value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      if (codes.length === 0) {
        console.error(
          c(
            "red",
            `Error: --ignore= requires at least one rule code (e.g., --ignore=E001,W104)`,
          ),
        );
        process.exit(2);
      }
      args.ignore.push(...codes);
    } else if (arg === "--select" || arg === "-s") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --select requires a comma-separated list of rule codes (e.g., E001,E002)`,
          ),
        );
        process.exit(2);
      }
      const codes = argv[i]
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      if (codes.length === 0) {
        console.error(
          c("red", `Error: --select requires at least one rule code`),
        );
        process.exit(2);
      }
      args.select.push(...codes);
    } else if (arg.startsWith("--select=")) {
      const value = arg.split("=")[1];
      const codes = value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      if (codes.length === 0) {
        console.error(
          c(
            "red",
            `Error: --select= requires at least one rule code (e.g., --select=E001,E002)`,
          ),
        );
        process.exit(2);
      }
      args.select.push(...codes);
    } else if (arg === "--max-line-width" || arg === "--line-width") {
      i++;
      if (argv[i] === undefined || argv[i].startsWith("-")) {
        console.error(
          c(
            "red",
            `Error: --max-line-width requires a number (e.g., --max-line-width 120)`,
          ),
        );
        process.exit(2);
      }
      const parsed = parseInt(argv[i], 10);
      if (Number.isNaN(parsed)) {
        console.error(
          c(
            "red",
            `Error: --max-line-width requires a valid number, got '${argv[i]}'`,
          ),
        );
        process.exit(2);
      }
      args.maxLineWidth = parsed;
    } else if (arg.startsWith("--max-line-width=")) {
      const value = arg.split("=")[1];
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        console.error(
          c(
            "red",
            `Error: --max-line-width requires a valid number, got '${value}'`,
          ),
        );
        process.exit(2);
      }
      args.maxLineWidth = parsed;
    } else if (arg.startsWith("--line-width=")) {
      const value = arg.split("=")[1];
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        console.error(
          c(
            "red",
            `Error: --line-width requires a valid number, got '${value}'`,
          ),
        );
        process.exit(2);
      }
      args.maxLineWidth = parsed;
    } else if (arg === "--verbose" || arg === "-V") {
      args.verbose = true;
    } else if (arg === "--stdin" || arg === "-") {
      args.stdin = true;
    } else if (!arg.startsWith("-")) {
      args.files.push(arg);
    } else {
      console.error(c("red", `Unknown option: ${arg}`));
      console.error(`Run 'svglinter --help' for usage information.`);
      // BUG FIX: Use exit code 2 for usage errors (fatal error), not 1 (lint errors)
      process.exit(2);
    }
    i++;
  }

  return args;
}

// ============================================================================
// HELP & VERSION
// ============================================================================

/**
 * Display help message with usage information.
 * @returns {void}
 */
function showHelp() {
  console.log(`
${c("bold", "svglinter")} - SVG validation CLI tool (ESLint/Ruff style)

${c("bold", "USAGE")}
  svglinter [options] <file|dir|glob...>

${c("bold", "ARGUMENTS")}
  <file|dir|glob...>       Files, directories, or glob patterns to lint

${c("bold", "OPTIONS")}
  ${c("cyan", "-h, --help")}               Show this help message
  ${c("cyan", "-v, --version")}            Show version number
  ${c("cyan", "-V, --verbose")}            Show debug output (timestamps, file processing)
  ${c("cyan", "--list-rules")}             List all available rules with codes
  ${c("cyan", "--explain")} <rule>         Show detailed explanation for a rule
  ${c("cyan", "--fix")}                    Automatically fix problems (when possible)
  ${c("cyan", "-q, --quiet")}              Suppress output (only show summary)
  ${c("cyan", "-E, --errors-only")}        Only report errors (ignore warnings)
  ${c("cyan", "-x, --bail")}               Stop after first error (fail-fast mode)

${c("bold", "INPUT")}
  ${c("cyan", "--stdin, -")}               Read SVG content from stdin

${c("bold", "RULE SELECTION")}
  ${c("cyan", "-i, --ignore")} <rules>     Ignore specific rules (comma-separated)
  ${c("cyan", "-s, --select")} <rules>     Only check specific rules (comma-separated)
  ${c("cyan", "--show-ignored")}           Show which issues were ignored

${c("bold", "OUTPUT")}
  ${c("cyan", "-f, --format")} <type>      Output format (see FORMATS below)
  ${c("cyan", "-o, --output")} <file>      Write report to file
  ${c("cyan", "--output-mode")} <mode>     Output destination: terminal, file, both, auto (default: auto)
  ${c("cyan", "-W, --max-warnings")} <n>   Exit with error if warnings exceed threshold
  ${c("cyan", "--severity")} <RULE:LVL>    Override rule severity (e.g., --severity W101:error)
  ${c("cyan", "--max-line-width")} <n>     Max line width for txt format (default: 80)
  ${c("cyan", "--stats")}                  Show statistics by rule code
  ${c("cyan", "--color")}                  Force colored output
  ${c("cyan", "--no-color")}               Disable colored output

${c("bold", "FORMATS")}
  ${c("dim", "Pretty (human-readable):")}
    stylish         Default ESLint-style with colors and spacing
    txt, text       Detailed report with source context (like rustc/clang)
    json            Pretty-printed JSON with indentation
    xml             Pretty-printed XML with indentation
    md, markdown    Markdown tables and sections

  ${c("dim", "Compact (machine-readable):")}
    compact         One issue per line: file:line:col: severity [CODE] message
    ruff            Ruff/Pylint style: file:line:col: CODE message
    json-compact    Minified single-line JSON
    xml-compact     Minified single-line XML
    md-compact      Minimal markdown (tables only)

  ${c("dim", "CI/Testing:")}
    tap             TAP (Test Anything Protocol) format
    junit           JUnit XML format for CI systems
    sarif           SARIF 2.1.0 for security tools (CodeQL, Snyk, etc.)
    github          GitHub Actions annotations (::error, ::warning)

${c("bold", "CONFIGURATION")}
  ${c("cyan", "-c, --config")} <file>      Path to config file
  ${c("cyan", "--init")}[=format]          Create config file (json, yaml, toml; default: json)

  ${c("dim", "Auto-detected config files (in priority order):")}
    .svglintrc, .svglintrc.json, .svglintrc.yaml, .svglintrc.yml, .svglintrc.toml
    svglint.config.json, svglint.config.yaml, svglint.config.yml, svglint.config.toml

  ${c("dim", "Project config files (embedded config support):")}
    ${c("cyan", "JavaScript/Node:")}  package.json, deno.json, nx.json, turbo.json, lerna.json
    ${c("cyan", "Python:")}           pyproject.toml ${c("dim", "[tool.svglint]")}, setup.cfg
    ${c("cyan", "Rust:")}             Cargo.toml ${c("dim", "[package.metadata.svglint]")}
    ${c("cyan", "PHP:")}              composer.json ${c("dim", '["extra"]["svglint"]')}
    ${c("cyan", "Mobile:")}           pubspec.yaml (Flutter), project.config.json (Mini Programs)
    ${c("cyan", "Build:")}            gradle.properties, CMakePresets.json, .buckconfig
    ${c("cyan", "Monorepos:")}        pnpm-workspace.yaml, .yarnrc.yml, rush.json
    ${c("cyan", "Other:")}            dub.json (D), shard.yml (Crystal), Project.toml (Julia)

${c("bold", "RULE CODES")}
  ${c("red", "E001-E099")}  Reference errors (broken refs, duplicates)
  ${c("red", "E100-E199")}  Structure errors (missing attrs, invalid children)
  ${c("red", "E200-E299")}  Syntax errors (malformed values)
  ${c("yellow", "W001-W099")}  Reference warnings (invalid attrs, timing)
  ${c("yellow", "W100-W199")}  Typo/unknown warnings (elements, attributes)
  ${c("yellow", "W200-W299")}  Style warnings (case, whitespace, colors)

${c("bold", "EXAMPLES")}
  ${c("dim", "# Lint files")}
  svglinter icon.svg
  svglinter "src/**/*.svg"

  ${c("dim", "# Ignore specific rules")}
  svglinter --ignore E001,W104 *.svg
  svglinter --ignore W1   ${c("dim", "# Ignores all W1xx rules")}

  ${c("dim", "# Only check specific rules")}
  svglinter --select E001,E002 *.svg

  ${c("dim", "# Fix issues automatically")}
  svglinter --fix broken.svg

  ${c("dim", "# CI-friendly output")}
  svglinter --format json --output report.json src/

  ${c("dim", "# Detailed text report with source context")}
  svglinter --format txt --output report.txt --max-line-width 120 src/

  ${c("dim", "# Show statistics by rule")}
  svglinter --stats src/

  ${c("dim", "# Get help for a specific rule")}
  svglinter --explain E001

  ${c("dim", "# Create default config file")}
  svglinter --init

${c("bold", "CONFIG FILE")} (.svglintrc.json)
  {
    "ignore": ["W104", "W204"],
    "maxWarnings": 10,
    "fix": false
  }

${c("bold", "INLINE COMMENTS")}
  <!-- svglint-disable -->           Disable all rules
  <!-- svglint-disable E001,W104 --> Disable specific rules
  <!-- svglint-enable -->            Re-enable rules

${c("bold", "EXIT CODES")}
  ${c("green", "0")}  No errors found
  ${c("red", "1")}  Errors found or max-warnings exceeded
  ${c("red", "2")}  Fatal error

${c("dim", "Docs: https://github.com/Emasoft/SVG-MATRIX")}
`);
}

/**
 * Display version number.
 * @returns {void}
 */
function showVersion() {
  const packagePath = path.join(__dirname, "..", "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    console.log(`svglinter ${pkg.version}`);
  } catch {
    // Fall back to constant VERSION if package.json unreadable
    console.log(`svglinter ${VERSION}`);
  }
}

/**
 * List all available validation rules with codes.
 * @returns {void}
 */
function listRules() {
  console.log(`
${c("bold", "SVGLINTER RULES")}
${"=".repeat(78)}
`);

  // Group by severity and code range
  const errors = Object.entries(RULES).filter(([code]) => code.startsWith("E"));
  const warnings = Object.entries(RULES).filter(([code]) =>
    code.startsWith("W"),
  );

  console.log(c("bold", c("red", "ERRORS")) + "\n");
  console.log(
    `${c("dim", "Code")}    ${c("dim", "Fixable")}  ${c("dim", "Description")}`,
  );
  console.log(`${"-".repeat(78)}`);

  for (const [code, rule] of errors) {
    const fixable = rule.fixable ? c("green", "Yes") : c("dim", "No ");
    console.log(`${c("red", code)}    ${fixable}      ${rule.description}`);
  }

  console.log(`\n${c("bold", c("yellow", "WARNINGS"))}\n`);
  console.log(
    `${c("dim", "Code")}    ${c("dim", "Fixable")}  ${c("dim", "Description")}`,
  );
  console.log(`${"-".repeat(78)}`);

  for (const [code, rule] of warnings) {
    const fixable = rule.fixable ? c("green", "Yes") : c("dim", "No ");
    console.log(`${c("yellow", code)}    ${fixable}      ${rule.description}`);
  }

  console.log(`
${c("dim", "Total:")} ${errors.length} error rules, ${warnings.length} warning rules
${c("dim", "Fixable:")} ${Object.values(RULES).filter((r) => r.fixable).length} rules

${c("bold", "Usage:")}
  svglinter --ignore E001,W104 file.svg   ${c("dim", "# Ignore specific rules")}
  svglinter --ignore W1 file.svg          ${c("dim", "# Ignore all W1xx rules")}
  svglinter --select E001,E002 file.svg   ${c("dim", "# Only check these rules")}
`);
}

/**
 * Show detailed explanation for a specific rule.
 * @param {string} code - Rule code to explain
 * @returns {void}
 */
function explainRule(code) {
  const rule = RULES[code];

  if (!rule) {
    console.error(c("red", `Unknown rule code: ${code}`));
    console.error(`Run 'svglinter --list-rules' to see all available rules.`);
    process.exit(2);
  }

  const severity = code.startsWith("E")
    ? c("red", "Error")
    : c("yellow", "Warning");
  const fixable = rule.fixable ? c("green", "Yes") : c("dim", "No");

  console.log(`
${c("bold", `Rule ${code}`)}
${"=".repeat(60)}

${c("bold", "Description:")} ${rule.description}
${c("bold", "Severity:")}    ${severity}
${c("bold", "Type:")}        ${rule.type}
${c("bold", "Fixable:")}     ${fixable}

${c("bold", "Details:")}
`);

  // Extended explanations for each rule
  const explanations = {
    E001: `This rule detects broken ID references in SVG files.

When an SVG element uses url(#someId) or href="#someId" to reference
another element by ID, that ID must exist in the document.

${c("bold", "Common causes:")}
  - Copy-paste errors leaving orphaned references
  - Deleted elements that were still being referenced
  - Typos in ID names

${c("bold", "Example of violation:")}
  <use href="#missing-icon"/>  ${c("dim", "<!-- #missing-icon does not exist -->")}

${c("bold", "How to fix:")}
  - Add the missing element with the referenced ID
  - Update the reference to point to an existing ID
  - Remove the reference if the element is no longer needed`,

    E002: `This rule detects broken URL references in href attributes.

External URLs in href or xlink:href must be valid and accessible.

${c("bold", "Example of violation:")}
  <image href="https://example.com/missing.png"/>

${c("bold", "How to fix:")}
  - Verify the URL is correct and accessible
  - Update to a valid URL
  - Remove the element if the resource is no longer needed`,

    E003: `This rule detects duplicate ID attributes.

Every ID in an SVG document must be unique. Duplicate IDs cause
unpredictable behavior when referencing elements.

${c("bold", "Example of violation:")}
  <rect id="box" .../>
  <circle id="box" .../>  ${c("dim", "<!-- Duplicate ID -->")}

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to automatically rename duplicate IDs`,

    E101: `This rule checks for missing required attributes.

Certain SVG elements require specific attributes to be valid.
For example, <stop> elements require an 'offset' attribute.

${c("bold", "Example of violation:")}
  <stop style="stop-color:red"/>  ${c("dim", "<!-- Missing offset -->")}

${c("bold", "How to fix:")}
  Add the required attribute:
  <stop offset="0%" style="stop-color:red"/>`,

    E102: `This rule detects invalid child elements.

SVG elements have specific rules about what children they can contain.
For example, a <linearGradient> can only contain <stop> elements.

${c("bold", "How to fix:")}
  - Move the invalid child to an appropriate parent
  - Remove the invalid child if not needed`,

    E103: `This rule detects animation elements inside empty elements.

Animation elements (<animate>, <animateMotion>, etc.) must be
children of elements that can be animated.

${c("bold", "How to fix:")}
  Move the animation to a valid parent element`,

    W001: `This rule warns about invalid attributes on elements.

Certain attributes are not valid on all element types.
For example, 'x' and 'y' are not valid on <g> elements in SVG 1.1.

${c("bold", "Example of violation:")}
  <g x="10" y="10">  ${c("dim", "<!-- x, y not valid on g -->")}

${c("bold", "How to fix:")}
  Use transform="translate(10, 10)" instead`,

    W002: `This rule warns about missing xmlns namespace.

The root <svg> element should declare the SVG namespace.

${c("bold", "Example of violation:")}
  <svg viewBox="0 0 100 100">

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to add the namespace:
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,

    W101: `This rule detects possible typos in element names.

When an element name is similar to a valid SVG element,
it may be a typo.

${c("bold", "Example of violation:")}
  <rectt .../>  ${c("dim", "<!-- Did you mean <rect>? -->")}

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to correct the typo`,

    W104: `This rule warns about unknown attributes.

Attributes not defined in the SVG 1.1 specification may indicate
typos or non-standard extensions.

${c("bold", "Note:")} Some unknown attributes may be intentional
(e.g., data-* attributes, custom namespaced attributes)

${c("bold", "How to suppress:")}
  svglinter --ignore W104 file.svg`,

    E201: `This rule detects malformed viewBox attributes.

The viewBox attribute must contain exactly 4 numbers:
min-x, min-y, width, and height.

${c("bold", "Example of violation:")}
  <svg viewBox="0 0 100">  ${c("dim", "<!-- Only 3 values -->")}
  <svg viewBox="0 0 100 abc">  ${c("dim", "<!-- Non-numeric value -->")}

${c("bold", "Correct format:")}
  <svg viewBox="0 0 100 100">
  <svg viewBox="0 0 200 150">`,

    E202: `This rule detects malformed points attributes on polygon/polyline.

The points attribute must contain pairs of x,y coordinates.
Each pair should be separated by spaces or commas.

${c("bold", "Example of violation:")}
  <polygon points="10 20 30">  ${c("dim", "<!-- Odd number of values -->")}
  <polyline points="10,abc,30,40">  ${c("dim", "<!-- Non-numeric -->")}

${c("bold", "Correct format:")}
  <polygon points="10,20 30,40 50,60"/>
  <polyline points="0 0, 50 25, 100 0"/>`,

    E203: `This rule detects malformed transform attributes.

Transform values must use valid SVG transform functions:
matrix(), translate(), scale(), rotate(), skewX(), skewY()

${c("bold", "Example of violation:")}
  <g transform="move(10, 20)">  ${c("dim", "<!-- Invalid function -->")}
  <g transform="rotate(abc)">  ${c("dim", "<!-- Non-numeric argument -->")}

${c("bold", "Correct format:")}
  <g transform="translate(10, 20)">
  <g transform="rotate(45) scale(1.5)">`,

    E204: `This rule detects invalid enumeration values.

Some SVG attributes only accept specific predefined values.

${c("bold", "Examples of constrained attributes:")}
  - spreadMethod: pad, reflect, repeat
  - preserveAspectRatio: xMidYMid, xMinYMin, etc.
  - overflow: visible, hidden, scroll, auto
  - fill-rule: nonzero, evenodd

${c("bold", "Example of violation:")}
  <linearGradient spreadMethod="mirror">  ${c("dim", "<!-- Invalid -->")}

${c("bold", "How to fix:")}
  Use one of the allowed values from the SVG specification`,

    E205: `This rule detects numeric constraint violations.

Some attributes require non-negative or positive values.

${c("bold", "Examples:")}
  - r (radius): must be non-negative
  - width, height: must be non-negative
  - stroke-width: must be non-negative

${c("bold", "Example of violation:")}
  <circle r="-5"/>  ${c("dim", "<!-- Negative radius -->")}
  <rect width="-100"/>  ${c("dim", "<!-- Negative width -->")}

${c("bold", "How to fix:")}
  Use valid non-negative values`,

    E206: `This rule detects invalid control characters.

SVG content should not contain:
  - NULL character (U+0000)
  - DEL character (U+007F)
  - Unicode non-characters (U+FFFE, U+FFFF)
  - Other ASCII control characters (U+0001-U+001F except tab/newline)

${c("bold", "Common causes:")}
  - Binary data accidentally included in text
  - Corrupted files
  - Improper encoding conversion

${c("bold", "How to fix:")}
  Remove or replace invalid characters with valid content`,

    E207: `This rule indicates a fatal error during file processing.

This error occurs when the linter cannot process the file at all.

${c("bold", "Common causes:")}
  - XML parse errors (malformed XML)
  - File I/O errors (cannot read file)
  - Invalid encoding
  - Corrupted file content

${c("bold", "How to fix:")}
  - Check that the file is valid XML
  - Ensure proper file permissions
  - Verify file encoding is UTF-8`,

    E208: `This rule detects malformed path data in the d attribute.

SVG path data must follow strict syntax rules.

${c("bold", "Requirements:")}
  - Must start with M (moveto) or m (relative moveto) command
  - Can only contain valid path commands: M, Z, L, H, V, C, S, Q, T, A
  - Numbers can include digits, decimal points, minus signs, scientific notation

${c("bold", "Valid path commands:")}
  M/m - moveto
  Z/z - closepath
  L/l - lineto
  H/h - horizontal lineto
  V/v - vertical lineto
  C/c - curveto (cubic Bezier)
  S/s - smooth curveto
  Q/q - quadratic Bezier curveto
  T/t - smooth quadratic Bezier
  A/a - elliptical arc

${c("bold", "Example of violation:")}
  <path d="L 10 10"/>  ${c("dim", "<!-- Must start with M -->")}
  <path d="M 10 10 X 20"/>  ${c("dim", "<!-- Invalid command X -->")}

${c("bold", "Correct format:")}
  <path d="M 10 10 L 20 20 Z"/>`,

    W003: `This rule warns about invalid timing values in animations.

Animation timing attributes (dur, begin, end, etc.) must use
valid clock values or sync base values.

${c("bold", "Valid formats:")}
  - Clock values: "1s", "500ms", "2.5s", "00:05:00"
  - Sync values: "id.begin+1s", "id.end"
  - Indefinite: "indefinite"

${c("bold", "Example of violation:")}
  <animate dur="fast"/>  ${c("dim", "<!-- Invalid -->")}
  <animate begin="abc"/>  ${c("dim", "<!-- Invalid -->")}

${c("bold", "Correct format:")}
  <animate dur="2s" begin="0s"/>`,

    W102: `This rule warns about unknown elements.

Elements not defined in SVG 1.1 or SVG 2.0 specifications
may not render correctly in browsers.

${c("bold", "Note:")} Unlike W101 (typos), this rule triggers when
an element name is not similar to any valid SVG element.

${c("bold", "Example of violation:")}
  <customShape .../>  ${c("dim", "<!-- Not in SVG spec -->")}

${c("bold", "How to fix:")}
  - Use standard SVG elements
  - If custom, wrap in <foreignObject>
  - Use data-* attributes on standard elements instead`,

    W103: `This rule detects possible typos in attribute names.

When an attribute name is similar to a valid SVG attribute,
it may be a typo.

${c("bold", "Example of violation:")}
  <rect widht="100"/>  ${c("dim", "<!-- Did you mean width? -->")}
  <circle strok="black"/>  ${c("dim", "<!-- Did you mean stroke? -->")}

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to correct the typo`,

    W201: `This rule warns about uppercase units.

CSS/SVG units should be lowercase for consistency and standards compliance.

${c("bold", "Example of violation:")}
  <rect width="100PX"/>  ${c("dim", "<!-- Should be px -->")}
  <text font-size="12PT"/>  ${c("dim", "<!-- Should be pt -->")}

${c("bold", "Valid units (lowercase):")}
  px, em, rem, pt, pc, cm, mm, in, %

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to convert to lowercase`,

    W202: `This rule warns about invalid whitespace in attribute values.

Some attributes should not contain leading/trailing whitespace
or unexpected internal whitespace.

${c("bold", "Example of violation:")}
  <rect fill=" red "/>  ${c("dim", "<!-- Extra spaces -->")}
  <circle r=" 5"/>  ${c("dim", "<!-- Leading space -->")}

${c("bold", "How to fix:")}
  Remove unnecessary whitespace from attribute values`,

    W203: `This rule warns about invalid number formats.

Numeric values should use valid formats without extra characters.

${c("bold", "Example of violation:")}
  <rect width="100px50"/>  ${c("dim", "<!-- Malformed -->")}
  <circle r="5..5"/>  ${c("dim", "<!-- Double decimal -->")}

${c("bold", "Valid number formats:")}
  - Integer: 100, -50
  - Decimal: 3.14, -0.5, .5
  - Scientific: 1e5, 2.5E-3`,

    W204: `This rule warns about invalid color values.

Colors must be valid CSS/SVG color specifications.

${c("bold", "Valid color formats:")}
  - Keywords: red, blue, transparent, currentColor
  - Hex: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
  - RGB/RGBA: rgb(255, 0, 0), rgba(255, 0, 0, 0.5)
  - HSL/HSLA: hsl(0, 100%, 50%), hsla(0, 100%, 50%, 0.5)

${c("bold", "Example of violation:")}
  <rect fill="#GGG"/>  ${c("dim", "<!-- Invalid hex -->")}
  <rect fill="superred"/>  ${c("dim", "<!-- Invalid keyword -->")}

${c("bold", "How to fix:")}
  Use a valid CSS/SVG color value`,

    W301: `This rule detects circular references in SVG definitions.

Circular references occur when elements like <use>, <mask>, <clipPath>,
or <filter> directly or indirectly reference themselves, creating an
infinite loop that browsers cannot render.

${c("bold", "Example of violation:")}
  <clipPath id="clip1">
    <use href="#clip1"/>  ${c("dim", "<!-- References itself -->")}
  </clipPath>

  <mask id="m1">
    <rect mask="url(#m2)"/>
  </mask>
  <mask id="m2">
    <rect mask="url(#m1)"/>  ${c("dim", "<!-- Circular: m1->m2->m1 -->")}
  </mask>

${c("bold", "How to fix:")}
  - Remove the circular reference
  - Ensure referenced elements don't reference back`,

    W302: `This rule warns about excessive element nesting depth.

Deep nesting (>50 levels) can cause:
  - Stack overflow in some parsers/renderers
  - Performance issues during rendering
  - Debugging difficulties

${c("bold", "Example of violation:")}
  <g><g><g><g>... ${c("dim", "(50+ levels deep)")} ...</g></g></g></g>

${c("bold", "How to fix:")}
  - Flatten unnecessary group nesting
  - Use transforms instead of nested groups
  - Restructure complex compositions`,

    W303: `This rule detects empty <defs> elements.

Empty <defs> elements serve no purpose and can be safely removed
to reduce file size.

${c("bold", "Example of violation:")}
  <defs></defs>  ${c("dim", "<!-- Empty -->")}
  <defs>
    <!-- Only whitespace/comments -->
  </defs>

${c("bold", "How to fix:")}
  Run 'svglinter --fix' to remove empty <defs> elements`,

    W304: `This rule warns about gradient stops not in ascending order.

Gradient stops should have offset values in ascending order (0 to 1)
for predictable rendering across browsers.

${c("bold", "Example of violation:")}
  <linearGradient>
    <stop offset="50%" stop-color="red"/>
    <stop offset="0%" stop-color="blue"/>  ${c("dim", "<!-- Out of order -->")}
    <stop offset="100%" stop-color="green"/>
  </linearGradient>

${c("bold", "Correct order:")}
  <linearGradient>
    <stop offset="0%" stop-color="blue"/>
    <stop offset="50%" stop-color="red"/>
    <stop offset="100%" stop-color="green"/>
  </linearGradient>`,

    W401: `This rule warns about paths with excessive complexity.

Paths with more than 10,000 coordinate values can cause:
  - Slow rendering performance
  - Memory issues on mobile devices
  - Large file sizes

${c("bold", "Example of violation:")}
  <path d="M 0 0 L 1 1 L 2 2 ... ${c("dim", "(10000+ coordinates)")}"/>

${c("bold", "How to fix:")}
  - Simplify the path using a vector editor
  - Use SVGO or similar tools to optimize paths
  - Consider breaking into multiple paths
  - Use bezier curves instead of many line segments`,

    W501: `This rule warns about external resource references.

External resources can cause:
  - CORS errors when loaded cross-origin
  - Security risks from untrusted sources
  - Broken images if resources become unavailable
  - Privacy concerns (tracking pixels)

${c("bold", "Example of violation:")}
  <image href="https://external.com/image.png"/>
  <use href="https://icons.com/sprite.svg#icon"/>
  <style>@import url('https://fonts.com/font.css')</style>

${c("bold", "How to fix:")}
  - Embed resources inline (base64 for images)
  - Host resources on same domain
  - Use local copies of external resources`,

    W502: `This rule warns about script content in SVGs.

Script elements can execute JavaScript, which is a security risk
when loading untrusted SVG files.

${c("bold", "Example of violation:")}
  <script>alert('XSS')</script>
  <script href="malicious.js"/>

${c("bold", "Security concerns:")}
  - XSS attacks when displaying user-uploaded SVGs
  - Data exfiltration from the page
  - Session hijacking

${c("bold", "How to fix:")}
  - Remove script elements from untrusted SVGs
  - Use Content Security Policy (CSP) headers
  - Sanitize SVGs before displaying`,

    W503: `This rule warns about event handler attributes.

Event handlers can execute JavaScript, which is a security risk
when loading untrusted SVG files.

${c("bold", "Example of violation:")}
  <rect onclick="alert('XSS')"/>
  <svg onload="malicious()"/>
  <a onmouseover="steal(document.cookie)">

${c("bold", "Common event handlers:")}
  onclick, onload, onmouseover, onmouseout, onfocus, onblur,
  onerror, onscroll, onresize, etc.

${c("bold", "How to fix:")}
  - Remove event handlers from untrusted SVGs
  - Use external JavaScript with proper event binding
  - Sanitize SVGs before displaying`,

    W601: `This rule recommends adding a <title> element for accessibility.

The <title> element provides accessible name for screen readers
and is displayed as tooltip on hover.

${c("bold", "Example of violation:")}
  <svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="40"/>  ${c("dim", "<!-- No title -->")}
  </svg>

${c("bold", "How to fix:")}
  <svg viewBox="0 0 100 100">
    <title>Red Circle Icon</title>
    <circle cx="50" cy="50" r="40"/>
  </svg>

${c("bold", "Best practices:")}
  - Use concise, descriptive titles
  - Avoid redundant prefixes like "Image of..."
  - Match alt text conventions`,

    W602: `This rule recommends adding a <desc> element for complex SVGs.

The <desc> element provides detailed description for screen readers,
useful for complex graphics like charts, diagrams, and illustrations.

${c("bold", "Example of violation:")}
  <svg viewBox="0 0 400 300">
    <title>Q3 Sales Chart</title>
    ${c("dim", "<!-- No desc for complex chart -->")}
    ...complex chart elements...
  </svg>

${c("bold", "How to fix:")}
  <svg viewBox="0 0 400 300">
    <title>Q3 Sales Chart</title>
    <desc>Bar chart showing Q3 sales by region: North $1.2M,
    South $0.8M, East $1.5M, West $1.1M</desc>
    ...
  </svg>

${c("bold", "Note:")} Not needed for simple icons; use for infographics`,

    W603: `This rule detects invalid ARIA attributes.

ARIA (Accessible Rich Internet Applications) attributes must use
correct names and valid values.

${c("bold", "Example of violation:")}
  <svg aria-role="image"/>  ${c("dim", "<!-- Should be role -->")}
  <svg role="invalid"/>  ${c("dim", "<!-- Invalid role value -->")}
  <svg aria-hidden="yes"/>  ${c("dim", "<!-- Should be true/false -->")}

${c("bold", "Valid ARIA patterns:")}
  <svg role="img" aria-label="Description">
  <svg role="img" aria-labelledby="title-id">
  <svg aria-hidden="true">  ${c("dim", "<!-- Decorative icon -->")}

${c("bold", "Common roles:")} img, graphics-document, graphics-symbol`,

    W604: `This rule warns when SVGs with text content lack lang attribute.

The lang (or xml:lang) attribute helps screen readers pronounce
text content correctly.

${c("bold", "Example of violation:")}
  <svg viewBox="0 0 200 50">
    <text x="10" y="30">Bonjour le monde</text>  ${c("dim", "<!-- No lang -->")}
  </svg>

${c("bold", "How to fix:")}
  <svg viewBox="0 0 200 50" lang="fr">
    <text x="10" y="30">Bonjour le monde</text>
  </svg>

${c("bold", "Note:")} Only applies to SVGs containing <text> elements`,
  };

  const explanation = explanations[code];
  if (explanation) {
    console.log(explanation);
  } else {
    console.log(c("dim", "No extended explanation available for this rule."));
  }

  console.log(`
${c("bold", "Usage:")}
  svglinter --select ${code} file.svg    ${c("dim", "# Check only this rule")}
  svglinter --ignore ${code} file.svg    ${c("dim", "# Ignore this rule")}
`);
}

/**
 * Initialize a default config file
 * @param {string} format - Config format: 'json', 'yaml', or 'toml'
 */
function initConfig(configFormat = "json") {
  const extensions = { json: ".json", yaml: ".yaml", toml: ".toml" };

  // Validate format parameter to avoid creating .svglintrcundefined
  if (!extensions[configFormat]) {
    console.error(
      c(
        "red",
        `Error: Invalid format '${configFormat}'. Must be 'json', 'yaml', or 'toml'`,
      ),
    );
    process.exit(2);
  }

  const configFile = `.svglintrc${extensions[configFormat]}`;

  // Check if any config file already exists
  for (const existingFile of CONFIG_FILES) {
    const existingPath = path.join(process.cwd(), existingFile);
    if (fs.existsSync(existingPath)) {
      console.error(
        c("yellow", `Config file '${existingFile}' already exists.`),
      );
      console.error("Delete it first if you want to regenerate.");
      process.exit(2);
    }
  }

  const defaultConfig = {
    ignore: [],
    select: [],
    fix: false,
    quiet: false,
    format: "stylish",
    maxWarnings: -1,
    bail: false,
  };

  let content;
  if (configFormat === "yaml") {
    const yamlParser = getYamlParser();
    content =
      `# SVG Linter configuration\n# See: svglinter --help\n\n` +
      yamlParser.dump(defaultConfig, { indent: 2 });
  } else if (configFormat === "toml") {
    // Generate TOML manually (toml package doesn't have stringify)
    content = `# SVG Linter configuration
# See: svglinter --help

ignore = []
select = []
fix = false
quiet = false
format = "stylish"
maxWarnings = -1
bail = false
`;
  } else {
    // JSON format (default)
    content = JSON.stringify(defaultConfig, null, 2) + "\n";
  }

  try {
    fs.writeFileSync(configFile, content);
  } catch (err) {
    if (err.code === "EACCES" || err.code === "EPERM") {
      console.error(
        c("red", `Error: Permission denied creating '${configFile}'`),
      );
    } else if (err.code === "ENOSPC") {
      console.error(c("red", `Error: No space left on device`));
    } else {
      console.error(
        c("red", `Error: Failed to create config file: ${err.message}`),
      );
    }
    process.exit(2);
  }

  console.log(c("green", `Created ${configFile}`));
  console.log(`
${c("dim", "Configuration options:")}

  ${c("cyan", "ignore")}:       ["E001", "W104"]  ${c("dim", "- Rules to ignore")}
  ${c("cyan", "select")}:       ["E001", "E002"]  ${c("dim", "- Only check these rules")}
  ${c("cyan", "fix")}:          true/false        ${c("dim", "- Auto-fix issues")}
  ${c("cyan", "quiet")}:        true/false        ${c("dim", "- Suppress output")}
  ${c("cyan", "format")}:       "stylish"         ${c("dim", "- Output format")}
  ${c("cyan", "maxWarnings")}:  10                ${c("dim", "- Fail if warnings exceed")}
  ${c("cyan", "bail")}:         true/false        ${c("dim", "- Stop on first error")}

${c("dim", "Supported config formats: .svglintrc.json, .svglintrc.yaml, .svglintrc.toml")}
${c("dim", "Run svglinter --help for more information.")}
`);
}

/**
 * Show statistics by rule code.
 * @param {Array} results - Lint results array
 * @returns {void}
 */
function showStats(results) {
  const stats = {};
  const totalFiles = results.length;
  let filesWithIssues = 0;

  for (const result of results) {
    if (result.issues.length > 0) filesWithIssues++;

    for (const issue of result.issues) {
      const code = TYPE_TO_CODE[issue.type] || "W000";
      if (!stats[code]) {
        stats[code] = {
          count: 0,
          files: new Set(),
          severity: issue.severity,
          description: RULES[code]?.description || issue.type,
        };
      }
      stats[code].count++;
      stats[code].files.add(result.file);
    }
  }

  // Sort by count descending
  const sortedStats = Object.entries(stats).sort(
    (a, b) => b[1].count - a[1].count,
  );

  if (sortedStats.length === 0) {
    console.log(c("green", "\nNo issues found - no statistics to display."));
    return;
  }

  console.log(`
${c("bold", "ISSUE STATISTICS BY RULE")}
${"=".repeat(78)}
`);

  console.log(
    `${c("dim", "Code")}    ${c("dim", "Count")}  ${c("dim", "Files")}  ${c("dim", "Description")}`,
  );
  console.log(`${"-".repeat(78)}`);

  for (const [code, data] of sortedStats) {
    const colorFn = data.severity === "error" ? "red" : "yellow";
    const countStr = String(data.count).padStart(5);
    const filesStr = String(data.files.size).padStart(5);
    const desc =
      data.description.length > 45
        ? data.description.substring(0, 42) + "..."
        : data.description;

    console.log(`${c(colorFn, code)}    ${countStr}  ${filesStr}  ${desc}`);
  }

  console.log(`${"-".repeat(78)}`);

  const totalIssues = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
  const totalErrors = Object.entries(stats)
    .filter(([_, s]) => s.severity === "error")
    .reduce((sum, [_, s]) => sum + s.count, 0);
  const totalWarnings = totalIssues - totalErrors;

  console.log(`
${c("bold", "Summary:")}
  Files scanned:     ${totalFiles}
  Files with issues: ${filesWithIssues}
  Total issues:      ${totalIssues} (${c("red", `${totalErrors} errors`)}, ${c("yellow", `${totalWarnings} warnings`)})
  Unique rules:      ${sortedStats.length}
`);
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * Expand file patterns to list of SVG files.
 * @param {string[]} patterns - File patterns, directories, or globs
 * @returns {Promise<string[]>} Array of resolved SVG file paths
 */
async function expandFiles(patterns) {
  const files = new Set();

  for (const pattern of patterns) {
    try {
      if (fs.existsSync(pattern)) {
        const stat = fs.statSync(pattern);
        if (stat.isFile() && pattern.toLowerCase().endsWith(".svg")) {
          files.add(path.resolve(pattern));
        } else if (stat.isDirectory()) {
          const dirFiles = await findSvgFiles(pattern);
          dirFiles.forEach((f) => files.add(f));
        }
      } else {
        const globFiles = await globPromise(pattern);
        globFiles
          .filter((f) => f.toLowerCase().endsWith(".svg"))
          .forEach((f) => files.add(path.resolve(f)));
      }
    } catch (err) {
      // Handle fs.existsSync/statSync errors (e.g., permission denied, broken symlinks)
      if (err.code === "EACCES" || err.code === "EPERM") {
        console.error(
          c(
            "yellow",
            `Warning: Permission denied accessing '${pattern}' - skipping`,
          ),
        );
      } else if (err.code === "ENOENT") {
        // Try glob expansion for patterns that don't exist as literal paths
        const globFiles = await globPromise(pattern);
        globFiles
          .filter((f) => f.toLowerCase().endsWith(".svg"))
          .forEach((f) => files.add(path.resolve(f)));
      } else {
        console.error(
          c(
            "yellow",
            `Warning: Error accessing '${pattern}': ${err.message} - skipping`,
          ),
        );
      }
    }
  }

  return Array.from(files).sort();
}

/**
 * Recursively find SVG files in directory.
 * @param {string} dir - Directory to search
 * @param {Set} visited - Set of visited directories to prevent loops
 * @returns {Promise<string[]>} Array of SVG file paths
 */
async function findSvgFiles(dir, visited = new Set()) {
  const results = [];

  // Resolve symlinks and check for loops to prevent infinite recursion
  let realPath;
  try {
    realPath = fs.realpathSync(dir);
  } catch {
    console.error(
      c("yellow", `Warning: Cannot resolve path '${dir}' - skipping`),
    );
    return results;
  }

  if (visited.has(realPath)) {
    console.error(
      c("yellow", `Warning: Symlink loop detected at '${dir}' - skipping`),
    );
    return results;
  }
  visited.add(realPath);

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Handle permission errors and other fs errors gracefully
    if (err.code === "EACCES" || err.code === "EPERM") {
      console.error(
        c(
          "yellow",
          `Warning: Permission denied accessing directory '${dir}' - skipping`,
        ),
      );
    } else if (err.code === "ENOENT") {
      console.error(
        c("yellow", `Warning: Directory '${dir}' does not exist - skipping`),
      );
    } else {
      console.error(
        c(
          "yellow",
          `Warning: Error reading directory '${dir}': ${err.message} - skipping`,
        ),
      );
    }
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      // Pass visited set to recursive call
      const subFiles = await findSvgFiles(fullPath, visited);
      results.push(...subFiles);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".svg")) {
      results.push(path.resolve(fullPath));
    }
  }

  return results;
}

/**
 * Escape special regex characters for glob pattern matching.
 * BUG FIX: Renamed to avoid duplicate function name - this version keeps * unescaped for glob patterns.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegexCharsForGlob(str) {
  // Escape all special regex chars except * (which we handle separately)
  return str.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Simple glob pattern matching for SVG files.
 * @param {string} pattern - Glob pattern
 * @returns {Promise<string[]>} Array of matching file paths
 */
async function globPromise(pattern) {
  const files = [];

  if (pattern.includes("**")) {
    const baseDir = pattern.split("**")[0] || ".";
    const ext = pattern.split("**")[1]?.replace(/^[/\\]*\*/, "") || ".svg";
    const dirFiles = await findSvgFilesWithExt(baseDir, ext);
    files.push(...dirFiles);
  } else if (pattern.includes("*")) {
    const dir = path.dirname(pattern);
    const filePattern = path.basename(pattern);
    // Escape special regex chars, then convert glob * to [^/\\]* instead of .* to prevent
    // catastrophic backtracking and avoid matching across path separators
    const escapedPattern = escapeRegexCharsForGlob(filePattern).replace(
      /\*/g,
      "[^/\\\\]*",
    );
    const regex = new RegExp("^" + escapedPattern + "$");

    try {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (regex.test(entry)) {
            files.push(path.resolve(path.join(dir, entry)));
          }
        }
      }
    } catch (err) {
      // Handle permission errors and other fs errors gracefully
      if (err.code === "EACCES" || err.code === "EPERM") {
        console.error(
          c(
            "yellow",
            `Warning: Permission denied accessing directory '${dir}' - skipping`,
          ),
        );
      } else if (err.code !== "ENOENT") {
        console.error(
          c(
            "yellow",
            `Warning: Error reading directory '${dir}': ${err.message} - skipping`,
          ),
        );
      }
    }
  }

  return files;
}

/**
 * Find files with specific extension recursively.
 * @param {string} dir - Directory to search
 * @param {string} ext - File extension to match
 * @param {Set} visited - Set of visited directories to prevent loops
 * @returns {Promise<string[]>} Array of matching file paths
 */
async function findSvgFilesWithExt(dir, ext, visited = new Set()) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  // Resolve symlinks and check for loops to prevent infinite recursion
  let realPath;
  try {
    realPath = fs.realpathSync(dir);
  } catch {
    console.error(
      c("yellow", `Warning: Cannot resolve path '${dir}' - skipping`),
    );
    return results;
  }

  if (visited.has(realPath)) {
    console.error(
      c("yellow", `Warning: Symlink loop detected at '${dir}' - skipping`),
    );
    return results;
  }
  visited.add(realPath);

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Handle permission errors and other fs errors gracefully
    if (err.code === "EACCES" || err.code === "EPERM") {
      console.error(
        c(
          "yellow",
          `Warning: Permission denied accessing directory '${dir}' - skipping`,
        ),
      );
    } else {
      console.error(
        c(
          "yellow",
          `Warning: Error reading directory '${dir}': ${err.message} - skipping`,
        ),
      );
    }
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      // Pass visited set to recursive call
      const subFiles = await findSvgFilesWithExt(fullPath, ext, visited);
      results.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(path.resolve(fullPath));
    }
  }

  return results;
}

// ============================================================================
// RULE FILTERING
// ============================================================================

/**
 * Check if a rule code should be ignored.
 * @param {string} code - Rule code to check
 * @param {string[]} ignoreList - List of ignore patterns
 * @returns {boolean} True if rule should be ignored
 */
function shouldIgnoreRule(code, ignoreList) {
  if (!ignoreList || ignoreList.length === 0) return false;

  for (const pattern of ignoreList) {
    // Exact match
    if (code === pattern) return true;

    // Prefix match (e.g., "W1" matches "W101", "W102", etc.)
    if (code.startsWith(pattern)) return true;

    // Category match (e.g., "E" matches all errors)
    if (pattern.length === 1 && code.startsWith(pattern)) return true;
  }

  return false;
}

/**
 * Check if a rule code is selected.
 * @param {string} code - Rule code to check
 * @param {string[]} selectList - List of selected patterns
 * @returns {boolean} True if rule is selected
 */
function isRuleSelected(code, selectList) {
  if (!selectList || selectList.length === 0) return true;

  for (const pattern of selectList) {
    if (code === pattern) return true;
    if (code.startsWith(pattern)) return true;
    if (pattern.length === 1 && code.startsWith(pattern)) return true;
  }

  return false;
}

/**
 * Parse inline disable comments from SVG content.
 * @param {string} content - SVG file content
 * @returns {Array<Object>} Array of disabled ranges with rules
 */
function parseInlineDisables(content) {
  const disabledRanges = [];
  // Normalize line endings for cross-platform consistency
  const lines = normalizeLineEndings(content).split("\n");

  let currentDisabled = null;
  let disabledRules = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for disable comment
    const disableMatch = line.match(
      /<!--\s*svglint-disable(?:\s+([A-Z0-9,\s]+))?\s*-->/i,
    );
    if (disableMatch) {
      const rules = disableMatch[1]
        ? disableMatch[1].split(",").map((r) => r.trim().toUpperCase())
        : ["*"];
      currentDisabled = lineNum;
      disabledRules = new Set(rules);
    }

    // Check for enable comment
    const enableMatch = line.match(/<!--\s*svglint-enable\s*-->/i);
    if (enableMatch && currentDisabled !== null) {
      disabledRanges.push({
        startLine: currentDisabled,
        endLine: lineNum,
        rules: disabledRules,
      });
      currentDisabled = null;
      disabledRules = new Set();
    }

    // Check for disable-next-line comment
    const nextLineMatch = line.match(
      /<!--\s*svglint-disable-next-line(?:\s+([A-Z0-9,\s]+))?\s*-->/i,
    );
    if (nextLineMatch) {
      const rules = nextLineMatch[1]
        ? nextLineMatch[1].split(",").map((r) => r.trim().toUpperCase())
        : ["*"];
      disabledRanges.push({
        startLine: lineNum + 1,
        endLine: lineNum + 1,
        rules: new Set(rules),
      });
    }
  }

  // Handle unclosed disable (disable until end of file)
  if (currentDisabled !== null) {
    disabledRanges.push({
      startLine: currentDisabled,
      endLine: lines.length + 1,
      rules: disabledRules,
    });
  }

  return disabledRanges;
}

/**
 * Check if an issue is disabled by inline comments.
 * @param {Object} issue - Issue object
 * @param {Array<Object>} disabledRanges - Array of disabled ranges
 * @returns {boolean} True if issue is disabled
 */
function isDisabledByInline(issue, disabledRanges) {
  const code = TYPE_TO_CODE[issue.type] || "";
  const line = issue.line || 0;

  for (const range of disabledRanges) {
    if (line >= range.startLine && line <= range.endLine) {
      if (range.rules.has("*") || range.rules.has(code)) {
        return true;
      }
      // Check prefix match
      for (const rule of range.rules) {
        if (code.startsWith(rule)) return true;
      }
    }
  }

  return false;
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format issue type to rule code.
 * @param {string} type - Issue type
 * @returns {string} Rule code
 */
function formatRuleCode(type) {
  return TYPE_TO_CODE[type] || "W000";
}

/**
 * Format severity with color for output.
 * @param {string} severity - Severity level
 * @param {string} outputFormat - Output format type
 * @returns {string} Formatted severity string
 */
function formatSeverity(severity, outputFormat = "stylish") {
  if (outputFormat === "compact" || outputFormat === "ruff") {
    return severity === "error" ? "error" : "warning";
  }

  if (severity === "error") {
    return c("red", "error");
  }
  return c("yellow", "warning");
}

/**
 * Format results in ESLint stylish format.
 * @param {Array} results - Lint results array
 * @param {boolean} quiet - Suppress output
 * @param {boolean} showIgnored - Show ignored issues count
 * @returns {string} Formatted output
 */
function formatStylish(results, quiet, showIgnored) {
  const lines = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalIgnored = 0;

  for (const result of results) {
    if (result.issues.length === 0 && (!showIgnored || result.ignored === 0))
      continue;

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    totalIgnored += result.ignored || 0;

    lines.push("");
    lines.push(c("bold", path.relative(process.cwd(), result.file)));

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const pos = c("dim", `${line}:${column}`.padEnd(8));
      const severity = formatSeverity(issue.severity);
      const code = c("cyan", formatRuleCode(issue.type).padEnd(5));
      const message = issue.reason || issue.type;

      lines.push(
        `  ${pos} ${severity.padEnd(useColors ? 17 : 7)} ${code} ${message}`,
      );

      if (issue.sourceLine && !quiet) {
        const sourceLine = issue.sourceLine.replace(/\t/g, "  ");
        lines.push(
          c(
            "dim",
            `           ${sourceLine.substring(0, 72)}${sourceLine.length > 72 ? "..." : ""}`,
          ),
        );
      }
    }

    if (showIgnored && result.ignored > 0) {
      lines.push(
        c(
          "dim",
          `  (${result.ignored} issue${result.ignored === 1 ? "" : "s"} ignored)`,
        ),
      );
    }
  }

  if (!quiet && (totalErrors > 0 || totalWarnings > 0)) {
    lines.push("");

    const problemCount = totalErrors + totalWarnings;
    const summary = [];

    if (totalErrors > 0) {
      summary.push(
        c("red", `${totalErrors} error${totalErrors === 1 ? "" : "s"}`),
      );
    }
    if (totalWarnings > 0) {
      summary.push(
        c(
          "yellow",
          `${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`,
        ),
      );
    }

    const icon = totalErrors > 0 ? c("red", "\u2716") : c("yellow", "\u26A0");
    lines.push(
      `${icon} ${problemCount} problem${problemCount === 1 ? "" : "s"} (${summary.join(", ")})`,
    );

    if (totalIgnored > 0) {
      lines.push(
        c(
          "dim",
          `  ${totalIgnored} issue${totalIgnored === 1 ? "" : "s"} ignored`,
        ),
      );
    }
  }

  return lines.join("\n");
}

/**
 * Format results in Ruff style.
 * @param {Array} results - Lint results array
 * @returns {string} Formatted output
 */
function formatRuff(results) {
  // Ruff-style: file:line:col: CODE message
  const lines = [];

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const code = formatRuleCode(issue.type);
      const message = issue.reason || issue.type;

      lines.push(`${relPath}:${line}:${column}: ${c("cyan", code)} ${message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format results in compact format.
 * @param {Array} results - Lint results array
 * @returns {string} Formatted output
 */
function formatCompact(results) {
  const lines = [];

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const severity = issue.severity === "error" ? "error" : "warning";
      const code = formatRuleCode(issue.type);
      const message = issue.reason || issue.type;

      lines.push(
        `${relPath}:${line}:${column}: ${severity} [${code}] ${message}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Format results as JSON.
 * @param {Array} results - Lint results array
 * @returns {string} JSON formatted output
 */
function formatJson(results) {
  const output = results.map((r) => ({
    filePath: r.file,
    messages: r.issues.map((issue) => ({
      ruleId: formatRuleCode(issue.type),
      severity: issue.severity === "error" ? 2 : 1,
      message: issue.reason || issue.type,
      line: issue.line || 0,
      column: issue.column || 0,
      element: issue.element,
      attribute: issue.attr,
    })),
    errorCount: r.errorCount,
    warningCount: r.warningCount,
    ignoredCount: r.ignored || 0,
  }));

  return JSON.stringify(output, null, 2);
}

/**
 * Format results in TAP (Test Anything Protocol) format.
 * @param {Array} results - Lint results array
 * @returns {string} TAP formatted output
 */
function formatTap(results) {
  const lines = ["TAP version 13"];
  let testNum = 0;

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);

    if (result.issues.length === 0) {
      testNum++;
      lines.push(`ok ${testNum} - ${relPath}`);
    } else {
      for (const issue of result.issues) {
        testNum++;
        const line = issue.line || 0;
        const code = formatRuleCode(issue.type);
        const message = issue.reason || issue.type;
        lines.push(
          `not ok ${testNum} - ${relPath}:${line} [${code}] ${message}`,
        );
        lines.push(`  ---`);
        lines.push(`  ruleId: ${code}`);
        lines.push(`  severity: ${issue.severity}`);
        if (issue.element) lines.push(`  element: ${issue.element}`);
        if (issue.attr) lines.push(`  attribute: ${issue.attr}`);
        lines.push(`  ...`);
      }
    }
  }

  lines.push(`1..${testNum}`);
  return lines.join("\n");
}

/**
 * Format results in JUnit XML format.
 * @param {Array} results - Lint results array
 * @returns {string} JUnit XML formatted output
 */
function formatJunit(results) {
  // Uses shared escapeXml utility function
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];

  let totalTests = 0;
  let totalFailures = 0;
  let totalErrors = 0;

  const testSuites = [];

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);
    totalTests++;

    if (result.errorCount > 0) totalErrors++;
    else if (result.warningCount > 0) totalFailures++;

    const failures = result.issues
      .map((issue) => {
        const code = formatRuleCode(issue.type);
        const message = escapeXml(issue.reason || issue.type);
        const severity = issue.severity === "error" ? "error" : "failure";
        return (
          `      <${severity} message="[${code}] ${message}" type="${code}">` +
          `${escapeXml(relPath)}:${issue.line || 0}:${issue.column || 0}` +
          `</${severity}>`
        );
      })
      .join("\n");

    testSuites.push(`  <testsuite name="${escapeXml(relPath)}" tests="1" failures="${result.warningCount}" errors="${result.errorCount}">
    <testcase name="${escapeXml(relPath)}" classname="svglinter">
${failures || ""}
    </testcase>
  </testsuite>`);
  }

  lines.push(
    `<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}">`,
  );
  lines.push(testSuites.join("\n"));
  lines.push("</testsuites>");

  return lines.join("\n");
}

/**
 * Format detailed text report with source context and underline indicators
 * This produces a human-readable report similar to rustc or clang output.
 *
 * @param {Array} results - The lint results
 * @param {number} maxLineWidth - Maximum width for each line in the report (default 80)
 * @returns {string} Formatted report
 */
function formatDetailedText(results, maxLineWidth = 80) {
  const lines = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of results) {
    if (result.issues.length === 0) continue;

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;

    // Read file content to get source lines (normalize line endings for cross-platform)
    let sourceLines = [];
    try {
      // Check file size before reading to prevent OOM on huge files
      const maxFileSizeForContext = 50 * 1024 * 1024; // 50MB limit for source context
      const stats = fs.statSync(result.file);
      if (stats.size > maxFileSizeForContext) {
        verbose(
          `File too large for source context (${stats.size} bytes), skipping source lines`,
        );
      } else {
        const content = fs.readFileSync(result.file, "utf8");
        sourceLines = normalizeLineEndings(content).split("\n");
      }
    } catch (err) {
      // If we can't read the file, continue without source context
      // This is non-fatal - we just won't show the source line in the report
      verbose(`Could not read source for context: ${err.message}`);
    }

    const relPath = path.relative(process.cwd(), result.file);

    for (const issue of result.issues) {
      const lineNum = issue.line || 1;
      const column = issue.column || 1;
      const code = formatRuleCode(issue.type);
      const severity = issue.severity === "error" ? "error" : "warning";
      const message = issue.reason || issue.type;

      // Header line: file:line:col: severity [code]: message
      lines.push("");
      lines.push(
        `${relPath}:${lineNum}:${column}: ${severity} [${code}]: ${message}`,
      );

      // Get context lines (line before, error line, line after)
      const contextStart = Math.max(0, lineNum - 2);
      const contextEnd = Math.min(sourceLines.length - 1, lineNum);

      if (sourceLines.length > 0 && lineNum <= sourceLines.length) {
        lines.push(""); // Empty line before context

        // Calculate padding for line numbers
        const maxLineNumWidth = String(contextEnd + 1).length;

        for (let i = contextStart; i <= contextEnd; i++) {
          const lineNumStr = String(i + 1).padStart(maxLineNumWidth);
          const isErrorLine = i + 1 === lineNum;
          const prefix = isErrorLine ? " --> " : "     ";
          const lineContent = sourceLines[i] || "";

          // Truncate line if needed, keeping error column visible
          const truncatedLine = truncateLineAroundColumn(
            lineContent,
            column,
            maxLineWidth - maxLineNumWidth - 7, // Account for prefix and padding
            isErrorLine,
          );

          lines.push(`${prefix}${lineNumStr} | ${truncatedLine.text}`);

          // Add underline indicator on the error line
          if (isErrorLine) {
            const underlinePadding = " ".repeat(maxLineNumWidth + 7); // Align with content
            const indicatorLine = buildIndicator(
              truncatedLine.visibleColumn,
              truncatedLine.errorLength || 1,
              column,
              issue.element,
              issue.attr,
            );
            lines.push(`${underlinePadding}${indicatorLine}`);
          }
        }
      }
    }
  }

  // Summary
  if (totalErrors > 0 || totalWarnings > 0) {
    lines.push("");
    lines.push("=".repeat(Math.min(maxLineWidth, 80)));
    const problemCount = totalErrors + totalWarnings;
    lines.push(
      `Summary: ${problemCount} problem${problemCount === 1 ? "" : "s"} (${totalErrors} error${totalErrors === 1 ? "" : "s"}, ${totalWarnings} warning${totalWarnings === 1 ? "" : "s"})`,
    );
    lines.push("=".repeat(Math.min(maxLineWidth, 80)));
  }

  return lines.join("\n");
}

/**
 * Truncate a line to fit within maxWidth, keeping the target column visible.
 * Returns an object with the truncated text and the adjusted column position.
 *
 * @param {string} line - The source line
 * @param {number} column - The 1-based column number of the error
 * @param {number} maxWidth - Maximum width for the line
 * @param {boolean} isErrorLine - Whether this is the line with the error
 * @returns {{text: string, visibleColumn: number, errorLength: number}}
 */
function truncateLineAroundColumn(line, column, maxWidth, _isErrorLine) {
  // Replace tabs with spaces for consistent width
  const expandedLine = line.replace(/\t/g, "  ");
  // Handle NaN/undefined column values gracefully
  const safeColumn = Number.isFinite(column) && column >= 1 ? column : 1;
  const col = safeColumn - 1; // Convert to 0-based

  if (expandedLine.length <= maxWidth) {
    // No truncation needed
    return {
      text: expandedLine,
      visibleColumn: col,
      errorLength: 1,
    };
  }

  // Calculate how much context to show around the error column
  const ellipsis = "...";
  const ellipsisLen = ellipsis.length;
  const availableWidth = maxWidth - ellipsisLen * 2; // Space for both ellipses

  if (availableWidth < 10) {
    // Not enough space, just truncate from the start
    // BUG FIX: Ensure non-negative values to prevent RangeError in repeat()
    const safeWidth = Math.max(0, maxWidth - ellipsisLen);
    return {
      text: expandedLine.substring(0, safeWidth) + ellipsis,
      visibleColumn: Math.max(0, Math.min(col, safeWidth)),
      errorLength: 1,
    };
  }

  // Center the error column in the available space
  const halfWidth = Math.floor(availableWidth / 2);
  let startPos = col - halfWidth;
  let endPos = col + halfWidth;

  // Adjust if we're near the start or end
  if (startPos < 0) {
    endPos -= startPos;
    startPos = 0;
  }
  if (endPos > expandedLine.length) {
    startPos -= endPos - expandedLine.length;
    endPos = expandedLine.length;
    if (startPos < 0) startPos = 0;
  }

  // Build the truncated line
  let result = "";
  let visibleColumn = col;

  if (startPos > 0) {
    result = ellipsis;
    visibleColumn = col - startPos + ellipsisLen;
  }

  result += expandedLine.substring(startPos, endPos);

  if (endPos < expandedLine.length) {
    result += ellipsis;
  }

  return {
    text: result,
    visibleColumn: visibleColumn,
    errorLength: 1,
  };
}

/**
 * Build the underline indicator string (^^^^ or ^ with message)
 *
 * @param {number} column - 0-based column position in the visible line
 * @param {number} length - Length of the error span
 * @param {number} originalColumn - Original 1-based column for display
 * @param {string} element - Element name (if available)
 * @param {string} attr - Attribute name (if available)
 * @returns {string} The indicator line
 */
function buildIndicator(column, length, originalColumn, element, attr) {
  // Handle NaN/undefined values gracefully to prevent RangeError in repeat()
  // BUG FIX: Add upper bounds to prevent OOM from extremely large values
  const MAX_REPEAT = 1000; // Reasonable maximum for terminal width
  const safeColumn =
    Number.isFinite(column) && column >= 0 ? Math.min(column, MAX_REPEAT) : 0;
  const safeLength =
    Number.isFinite(length) && length >= 1 ? Math.min(length, MAX_REPEAT) : 1;

  // Build padding to align with the error column
  const padding = " ".repeat(safeColumn);

  // Build the underline characters
  const underline = "^".repeat(safeLength);

  // Build hint text
  let hint = "";
  if (element && attr) {
    hint = ` (${element}@${attr})`;
  } else if (element) {
    hint = ` (${element})`;
  } else if (attr) {
    hint = ` (@${attr})`;
  }

  return `${padding}${underline}${hint}`;
}

/**
 * Format compact JSON output (minified, single-line)
 * Machine-readable format for piping to other tools
 */
function formatJsonCompact(results) {
  const output = results.map((r) => ({
    filePath: r.file,
    messages: r.issues.map((issue) => ({
      ruleId: formatRuleCode(issue.type),
      severity: issue.severity === "error" ? 2 : 1,
      message: issue.reason || issue.type,
      line: issue.line || 0,
      column: issue.column || 0,
      element: issue.element,
      attribute: issue.attr,
    })),
    errorCount: r.errorCount,
    warningCount: r.warningCount,
    ignoredCount: r.ignored || 0,
  }));

  return JSON.stringify(output);
}

/**
 * Format XML output (pretty-printed with indentation)
 * Compatible with common code quality tools
 */
function formatXml(results, compact = false) {
  // Uses shared escapeXml utility function
  const nl = compact ? "" : "\n";
  const indent = compact ? "" : "  ";

  let totalErrors = 0;
  let totalWarnings = 0;
  results.forEach((r) => {
    totalErrors += r.errorCount;
    totalWarnings += r.warningCount;
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>${nl}`;
  xml += `<svglint-results version="1.0" files="${results.length}" errors="${totalErrors}" warnings="${totalWarnings}">${nl}`;

  for (const result of results) {
    const relPath = escapeXml(path.relative(process.cwd(), result.file));

    if (result.issues.length === 0) {
      xml += `${indent}<file path="${relPath}" errors="0" warnings="0"/>${nl}`;
      continue;
    }

    xml += `${indent}<file path="${relPath}" errors="${result.errorCount}" warnings="${result.warningCount}">${nl}`;

    for (const issue of result.issues) {
      const code = formatRuleCode(issue.type);
      const severity = issue.severity === "error" ? "error" : "warning";
      const message = escapeXml(issue.reason || issue.type);
      const line = issue.line || 0;
      const column = issue.column || 0;
      const element = issue.element
        ? ` element="${escapeXml(issue.element)}"`
        : "";
      const attr = issue.attr ? ` attribute="${escapeXml(issue.attr)}"` : "";

      xml += `${indent}${indent}<issue rule="${code}" severity="${severity}" line="${line}" column="${column}"${element}${attr}>${nl}`;
      xml += `${indent}${indent}${indent}<message>${message}</message>${nl}`;
      xml += `${indent}${indent}</issue>${nl}`;
    }

    xml += `${indent}</file>${nl}`;
  }

  xml += `</svglint-results>${nl}`;
  return xml.trim();
}

/**
 * Format Markdown output (human-readable with tables)
 * Good for documentation and GitHub Issues/PRs
 * Uses shared escapeMarkdown utility function
 */
function formatMarkdown(results, compact = false) {
  let totalErrors = 0;
  let totalWarnings = 0;
  results.forEach((r) => {
    totalErrors += r.errorCount;
    totalWarnings += r.warningCount;
  });

  const lines = [];

  if (!compact) {
    lines.push("# SVGLinter Report");
    lines.push("");
    lines.push(`**Files scanned:** ${results.length}`);
    lines.push(
      `**Total issues:** ${totalErrors + totalWarnings} (${totalErrors} errors, ${totalWarnings} warnings)`,
    );
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Group issues by file
  for (const result of results) {
    if (result.issues.length === 0) continue;

    const relPath = path.relative(process.cwd(), result.file);

    if (!compact) {
      lines.push(`## ${escapeMarkdown(relPath)}`);
      lines.push("");
    } else {
      lines.push(`### ${escapeMarkdown(relPath)}`);
    }

    // Table header
    lines.push("| Line | Col | Severity | Rule | Message |");
    lines.push("|------|-----|----------|------|---------|");

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const col = issue.column || 0;
      const severity = issue.severity === "error" ? "**Error**" : "Warning";
      const code = formatRuleCode(issue.type);
      const message = escapeMarkdown(issue.reason || issue.type);

      lines.push(
        `| ${line} | ${col} | ${severity} | \`${code}\` | ${message} |`,
      );
    }

    lines.push("");
  }

  if (!compact) {
    lines.push("---");
    lines.push("");
    lines.push(`*Generated by svglinter*`);
  }

  return lines.join("\n");
}

/**
 * Format compact text output (minimal, one line per issue)
 * Similar to compact but without severity word
 */
function formatTextCompact(results) {
  const lines = [];

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const code = formatRuleCode(issue.type);
      const severity = issue.severity === "error" ? "E" : "W";
      const message = issue.reason || issue.type;

      // Format: file:line:col:E/W:CODE:message
      lines.push(`${relPath}:${line}:${column}:${severity}:${code}:${message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format results as SARIF 2.1.0 for security tool integration
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
function formatSarif(results) {
  const sarif = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "svglinter",
            version: VERSION,
            informationUri: "https://github.com/Emasoft/SVG-MATRIX",
            rules: Object.entries(RULES).map(([id, rule]) => ({
              id: id,
              name: rule.type,
              shortDescription: { text: rule.description },
              defaultConfiguration: {
                level: rule.severity === "error" ? "error" : "warning",
              },
              properties: {
                fixable: rule.fixable,
              },
            })),
          },
        },
        results: results.flatMap((r) =>
          r.issues.map((issue) => ({
            ruleId: TYPE_TO_CODE[issue.type] || "W000",
            level: issue.severity === "error" ? "error" : "warning",
            message: { text: issue.reason || issue.type },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: path
                      .relative(process.cwd(), r.file)
                      .replace(/\\/g, "/"),
                    uriBaseId: "%SRCROOT%",
                  },
                  region: {
                    startLine: issue.line || 1,
                    startColumn: issue.column || 1,
                  },
                },
              },
            ],
            properties: {
              element: issue.element,
              attribute: issue.attr,
            },
          })),
        ),
        artifacts: results.map((r) => ({
          location: {
            uri: path.relative(process.cwd(), r.file).replace(/\\/g, "/"),
            uriBaseId: "%SRCROOT%",
          },
          mimeType: "image/svg+xml",
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Format results as GitHub Actions annotations
 * @see https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
 */
function formatGithub(results) {
  const lines = [];

  for (const result of results) {
    const relFile = path
      .relative(process.cwd(), result.file)
      .replace(/\\/g, "/");

    for (const issue of result.issues) {
      const level = issue.severity === "error" ? "error" : "warning";
      const line = issue.line || 1;
      const col = issue.column || 1;
      const code = TYPE_TO_CODE[issue.type] || "W000";
      // Escape special characters for GitHub annotations
      // % must be first, then all others including ; and | which are special in workflow commands
      const msg = (issue.reason || issue.type)
        .replace(/%/g, "%25")
        .replace(/\r/g, "%0D")
        .replace(/\n/g, "%0A")
        .replace(/:/g, "%3A")
        .replace(/,/g, "%2C")
        .replace(/;/g, "%3B")
        .replace(/\|/g, "%7C");

      // GitHub annotation format: ::level file=path,line=N,col=N,title=TITLE::MESSAGE
      lines.push(
        `::${level} file=${relFile},line=${line},col=${col},title=${code}::${msg}`,
      );
    }
  }

  return lines.join("\n");
}

function formatResults(
  results,
  outputFormat,
  quiet,
  showIgnored,
  maxLineWidth = 80,
) {
  switch (outputFormat) {
    case "json":
      return formatJson(results);
    case "json-compact":
      return formatJsonCompact(results);
    case "compact":
      return formatCompact(results);
    case "ruff":
      return formatRuff(results);
    case "tap":
      return formatTap(results);
    case "junit":
      return formatJunit(results);
    case "txt":
    case "text":
    case "detailed":
      return formatDetailedText(results, maxLineWidth);
    case "txt-compact":
    case "text-compact":
      return formatTextCompact(results);
    case "xml":
      return formatXml(results, false);
    case "xml-compact":
      return formatXml(results, true);
    case "md":
    case "markdown":
      return formatMarkdown(results, false);
    case "md-compact":
    case "markdown-compact":
      return formatMarkdown(results, true);
    case "sarif":
      return formatSarif(results);
    case "github":
      return formatGithub(results);
    case "stylish":
    default:
      return formatStylish(results, quiet, showIgnored);
  }
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Main CLI entry point.
 * @returns {Promise<void>}
 */
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  if (args.listRules) {
    listRules();
    process.exit(0);
  }

  if (args.explain) {
    explainRule(args.explain);
    process.exit(0);
  }

  if (args.init) {
    initConfig(args.init);
    process.exit(0);
  }

  // Handle color mode: --color forces color, --no-color disables it
  // If neither is specified, auto-detect based on TTY and environment variables
  if (args.color === false) {
    useColors = false;
  } else if (args.color === true) {
    useColors = true;
  }
  // Otherwise useColors stays at its auto-detected value from FORCE_COLOR/NO_COLOR/isTTY

  // Enable verbose mode if requested
  if (args.verbose) {
    verboseMode = true;
    verbose("Verbose mode enabled");
    verbose(`Version: ${VERSION}`);
    verbose(`Working directory: ${process.cwd()}`);
    verbose(`Color mode: ${useColors ? "enabled" : "disabled"}`);
  }

  // Validate output format
  if (!VALID_FORMATS.has(args.format)) {
    const validList = Array.from(VALID_FORMATS).join(", ");
    console.error(c("red", `Error: Invalid format '${args.format}'`));
    console.error(`Valid formats: ${validList}`);
    process.exit(2);
  }
  verbose(`Output format: ${args.format}`);

  // Validate maxLineWidth bounds
  if (args.maxLineWidth < MIN_MAX_LINE_WIDTH) {
    warn(
      `maxLineWidth ${args.maxLineWidth} is below minimum ${MIN_MAX_LINE_WIDTH}, using minimum`,
    );
    args.maxLineWidth = MIN_MAX_LINE_WIDTH;
  } else if (args.maxLineWidth > MAX_MAX_LINE_WIDTH) {
    warn(
      `maxLineWidth ${args.maxLineWidth} exceeds maximum ${MAX_MAX_LINE_WIDTH}, using maximum`,
    );
    args.maxLineWidth = MAX_MAX_LINE_WIDTH;
  }

  // Load config file
  const config = loadConfig(args.config);
  verbose(
    `Config loaded from: ${args.config || "auto-discovered or defaults"}`,
  );

  // Defensive null checks for config arrays (in case of malformed config files)
  const configIgnore = Array.isArray(config.ignore) ? config.ignore : [];
  const configSelect = Array.isArray(config.select) ? config.select : [];

  // Validate rule codes in ignore/select lists
  const validateRuleCodes = (codes, listName) => {
    for (const code of codes) {
      // Allow prefix matches like "E", "W", "E1", "W10", etc.
      const isValidPrefix = /^[EW]\d{0,3}$/.test(code);
      const isExactMatch = RULES[code] !== undefined;
      if (!isValidPrefix && !isExactMatch) {
        console.error(
          c(
            "yellow",
            `Warning: Unknown rule code '${code}' in ${listName} - will be ignored`,
          ),
        );
      }
    }
  };
  validateRuleCodes(args.ignore, "--ignore");
  validateRuleCodes(args.select, "--select");
  validateRuleCodes(configIgnore, "config.ignore");
  validateRuleCodes(configSelect, "config.select");

  // Merge config with CLI args (CLI takes precedence)
  const ignore = [...configIgnore, ...args.ignore];
  const select = args.select.length > 0 ? args.select : configSelect;
  const fix = args.fix || config.fix;
  const quiet = args.quiet || config.quiet;
  const maxWarnings =
    args.maxWarnings >= 0 ? args.maxWarnings : config.maxWarnings;
  const bail = args.bail || config.bail;

  // Handle stdin input
  let stdinContent = null;
  if (args.stdin) {
    verbose("Reading from stdin...");
    stdinContent = await readStdin();
    if (!stdinContent || stdinContent.trim().length === 0) {
      console.error(c("red", "Error: No content received from stdin"));
      process.exit(2);
    }
    verbose(`Read ${stdinContent.length} bytes from stdin`);
  }

  // Check for file arguments (unless reading from stdin)
  if (!args.stdin && args.files.length === 0) {
    console.error(c("red", "Error: No files specified"));
    console.error(`Run 'svglinter --help' for usage information.`);
    process.exit(2);
  }

  const files = args.stdin ? [] : await expandFiles(args.files);
  verbose(`Found ${files.length} files to process`);

  if (!args.stdin && files.length === 0) {
    console.error(
      c("red", "Error: No SVG files found matching the specified patterns"),
    );
    process.exit(2);
  }

  // Import the correctly-named functions from svg-toolbox.js
  // validateSVG is the sync version that works with parsed DOM
  // validateSVGAsync is the async version that handles file paths
  // fixInvalidSVG is wrapped by createOperation
  const { validateSVGAsync, fixInvalidSVG } = await import(
    "../src/svg-toolbox.js"
  );

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalIgnored = 0;
  let filesFixed = 0;

  // Handle stdin content first (if provided)
  if (stdinContent) {
    verbose("Processing stdin content...");
    try {
      // Process the stdin content
      let content = stdinContent;

      // Strip BOM if present
      const originalLength = content.length;
      content = stripBOM(content);
      if (content.length !== originalLength) {
        verbose("Stripped UTF-8 BOM from stdin content");
      }

      // Normalize line endings
      content = normalizeLineEndings(content);

      // Check encoding declaration
      const { encoding, valid: encodingValid } = detectEncoding(content);
      if (!encodingValid) {
        warn(
          `stdin declares encoding '${encoding}' which may not be fully supported`,
        );
      }
      verbose(`Detected encoding: ${encoding}`);

      // Check for invalid characters
      const invalidChars = findInvalidCharacters(content);
      if (invalidChars.length > 0) {
        verbose(`Found ${invalidChars.length} invalid character(s) in stdin`);
        // Add as issues to the result
      }

      const inlineDisables = parseInlineDisables(content);

      // Validate the SVG string using validateSVGAsync (works with string input)
      const result = await validateSVGAsync(content, {
        errorsOnly: args.errorsOnly,
        includeSource: true,
      });

      // Add invalid character issues
      for (const ic of invalidChars) {
        result.issues.push({
          type: "invalid_character",
          severity: "error",
          reason: `Invalid control character ${ic.char} at line ${ic.line}, column ${ic.column}`,
          line: ic.line,
          column: ic.column,
        });
      }

      // Filter issues
      const filteredIssues = [];
      let ignoredCount = 0;

      for (const issue of result.issues) {
        const code = TYPE_TO_CODE[issue.type] || "W000";
        if (shouldIgnoreRule(code, ignore)) {
          ignoredCount++;
          continue;
        }
        if (!isRuleSelected(code, select)) {
          ignoredCount++;
          continue;
        }
        if (isDisabledByInline(issue, inlineDisables)) {
          ignoredCount++;
          continue;
        }
        // Apply severity overrides if specified via --severity
        if (args.severityOverrides && args.severityOverrides[code]) {
          issue.severity = args.severityOverrides[code];
        }
        filteredIssues.push(issue);
      }

      const errorCount = filteredIssues.filter(
        (i) => i.severity === "error",
      ).length;
      const warningCount = filteredIssues.filter(
        (i) => i.severity === "warning",
      ).length;

      results.push({
        file: "<stdin>",
        issues: filteredIssues,
        errorCount,
        warningCount,
        ignored: ignoredCount,
      });

      totalErrors += errorCount;
      totalWarnings += warningCount;
      totalIgnored += ignoredCount;
    } catch (err) {
      results.push({
        file: "<stdin>",
        issues: [
          {
            type: "fatal_error",
            severity: "error",
            reason: `Failed to process stdin: ${err.message}`,
            line: 0,
            column: 0,
          },
        ],
        errorCount: 1,
        warningCount: 0,
        ignored: 0,
      });
      totalErrors++;
    }
  }

  // Progress indicator for large file sets
  const PROGRESS_INTERVAL = 50; // Show progress every N files
  const showProgress =
    files.length >= PROGRESS_INTERVAL && !quiet && process.stderr.isTTY;
  let processedCount = 0;

  // Process file arguments
  for (const file of files) {
    verbose(`Processing file: ${file}`);

    // Show progress for large batches
    if (
      showProgress &&
      processedCount > 0 &&
      processedCount % PROGRESS_INTERVAL === 0
    ) {
      const pct = Math.round((processedCount / files.length) * 100);
      process.stderr.write(
        `\r${c("dim", `Processing: ${processedCount}/${files.length} files (${pct}%)`)}`,
      );
    }
    processedCount++;
    try {
      // Check for symlink loops
      const symlinkInfo = resolveSymlink(file);
      if (symlinkInfo.error) {
        warn(`Symlink issue with '${file}': ${symlinkInfo.error}`);
      }
      const resolvedFile = symlinkInfo.resolved;

      // Read file content with timeout (for network drives)
      let content = await readFileWithTimeout(resolvedFile);

      // Save original content before normalization for fix comparison
      const originalContent = content;

      // Strip BOM if present
      const originalLength = content.length;
      content = stripBOM(content);
      if (content.length !== originalLength) {
        verbose(`Stripped UTF-8 BOM from ${file}`);
      }

      // Normalize line endings
      content = normalizeLineEndings(content);

      // Check encoding declaration
      const { encoding, valid: encodingValid } = detectEncoding(content);
      if (!encodingValid) {
        warn(
          `File '${file}' declares encoding '${encoding}' which may not be fully supported`,
        );
      }

      // Check for invalid characters
      const invalidChars = findInvalidCharacters(content);
      if (invalidChars.length > 0) {
        verbose(`Found ${invalidChars.length} invalid character(s) in ${file}`);
      }

      const inlineDisables = parseInlineDisables(content);

      if (fix) {
        // fixInvalidSVG returns { doc, result, output } via createOperation wrapper
        // When outputFile is specified, it writes the fixed SVG to that file
        const fixResult = await fixInvalidSVG(file, {
          outputFile: file,
          verbose: false,
        });

        // The result contains the fixed document; compare to original content (not normalized)
        // to avoid false positive fixes from BOM stripping or line ending normalization
        if (fixResult && fixResult.output !== originalContent) {
          filesFixed++;
        }
      }

      // validateSVGAsync is the proper async validation function
      const result = await validateSVGAsync(file, {
        errorsOnly: args.errorsOnly,
        includeSource: true,
      });

      // Add invalid character issues
      for (const ic of invalidChars) {
        result.issues.push({
          type: "invalid_character",
          severity: "error",
          reason: `Invalid control character ${ic.char} at line ${ic.line}, column ${ic.column}`,
          line: ic.line,
          column: ic.column,
        });
      }

      // Filter issues based on ignore/select and inline disables
      const filteredIssues = [];
      let ignoredCount = 0;

      for (const issue of result.issues) {
        const code = TYPE_TO_CODE[issue.type] || "W000";

        // Check if rule is ignored
        if (shouldIgnoreRule(code, ignore)) {
          ignoredCount++;
          continue;
        }

        // Check if rule is selected
        if (!isRuleSelected(code, select)) {
          ignoredCount++;
          continue;
        }

        // Check inline disables
        if (isDisabledByInline(issue, inlineDisables)) {
          ignoredCount++;
          continue;
        }

        // Apply severity overrides if specified via --severity
        if (args.severityOverrides && args.severityOverrides[code]) {
          issue.severity = args.severityOverrides[code];
        }

        filteredIssues.push(issue);
      }

      const errorCount = filteredIssues.filter(
        (i) => i.severity === "error",
      ).length;
      const warningCount = filteredIssues.filter(
        (i) => i.severity === "warning",
      ).length;

      results.push({
        file,
        issues: filteredIssues,
        errorCount,
        warningCount,
        ignored: ignoredCount,
      });

      totalErrors += errorCount;
      totalWarnings += warningCount;
      totalIgnored += ignoredCount;

      // Bail on first error if requested
      if (bail && errorCount > 0) {
        if (!quiet) {
          console.log(
            c("red", `\n\u2716 Bailing after first error (--bail mode)`),
          );
        }
        break;
      }
    } catch (err) {
      results.push({
        file,
        issues: [
          {
            type: "fatal_error",
            severity: "error",
            reason: `Failed to process file: ${err.message}`,
            line: 0,
            column: 0,
          },
        ],
        errorCount: 1,
        warningCount: 0,
        ignored: 0,
      });
      totalErrors++;

      // Bail on fatal error if requested
      if (bail) {
        if (!quiet) {
          console.log(
            c("red", `\n\u2716 Bailing after first error (--bail mode)`),
          );
        }
        break;
      }
    }
  }

  // Clear progress indicator if shown
  if (showProgress) {
    process.stderr.write("\r" + " ".repeat(60) + "\r"); // Clear the progress line
  }

  // Format and output
  const output = formatResults(
    results,
    args.format,
    quiet,
    args.showIgnored,
    args.maxLineWidth,
  );

  // Determine output destination based on --output-mode
  // auto: terminal if no -o, file only if -o specified
  // terminal: always print to terminal (even with -o)
  // file: only write to file (requires -o)
  // both: print to terminal AND write to file
  let writeToTerminal = false;
  let writeToFile = false;

  switch (args.outputMode) {
    case "terminal":
      writeToTerminal = true;
      writeToFile = !!args.outputFile; // Also write to file if -o specified
      break;
    case "file":
      if (!args.outputFile) {
        console.error(
          c("red", "Error: --output-mode=file requires -o/--output option"),
        );
        process.exit(2);
      }
      writeToFile = true;
      writeToTerminal = false;
      break;
    case "both":
      writeToTerminal = true;
      writeToFile = !!args.outputFile;
      if (!args.outputFile) {
        console.error(
          c("red", "Error: --output-mode=both requires -o/--output option"),
        );
        process.exit(2);
      }
      break;
    case "auto":
    default:
      // Auto mode: if -o specified, write to file only; otherwise print to terminal
      if (args.outputFile) {
        writeToFile = true;
        writeToTerminal = false;
      } else {
        writeToTerminal = true;
        writeToFile = false;
      }
      break;
  }

  // Write to file if requested
  if (writeToFile && args.outputFile) {
    // Validate output file path for safety
    const outputPath = path.resolve(args.outputFile);
    const normalizedOutput = path.normalize(outputPath);
    const dangerousPaths = [
      "/dev/",
      "/proc/",
      "/sys/",
      "/etc/passwd",
      "/etc/shadow",
    ];
    // BUG FIX: Use normalized paths and proper segment matching to avoid false positives
    // (e.g., /developer/ should NOT match /dev/)
    const isDangerous = dangerousPaths.some((p) => {
      if (p.endsWith("/")) {
        // Directory: block the dir itself and anything inside it
        // Ensure we match exactly the directory path, not similar prefixes
        const dirPath = path.normalize(p.slice(0, -1));
        return (
          normalizedOutput === dirPath ||
          normalizedOutput.startsWith(dirPath + path.sep)
        );
      } else {
        // File: block exact match only
        return normalizedOutput === path.normalize(p);
      }
    });
    if (isDangerous) {
      console.error(
        c(
          "red",
          `Error: Refusing to write to dangerous path '${args.outputFile}'`,
        ),
      );
      process.exit(2);
    }

    try {
      // Ensure directory exists (cross-platform)
      const outDir = path.dirname(outputPath);
      if (outDir && outDir !== "." && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, output, "utf8");
      if (!quiet && !writeToTerminal) {
        // Only show message if we're not also printing to terminal
        console.log(c("green", `Report written to ${args.outputFile}`));
      }
    } catch (err) {
      if (err.code === "EACCES" || err.code === "EPERM") {
        console.error(
          c("red", `Error: Permission denied writing to '${args.outputFile}'`),
        );
      } else if (err.code === "ENOSPC") {
        console.error(
          c(
            "red",
            `Error: No space left on device when writing to '${args.outputFile}'`,
          ),
        );
      } else if (err.code === "EROFS") {
        console.error(
          c(
            "red",
            `Error: Read-only file system when writing to '${args.outputFile}'`,
          ),
        );
      } else {
        console.error(
          c(
            "red",
            `Error: Failed to write output file '${args.outputFile}': ${err.message}`,
          ),
        );
      }
      process.exit(2);
    }
  }

  // Print to terminal if requested
  if (writeToTerminal && output) {
    console.log(output);
    if (writeToFile && args.outputFile && !quiet) {
      console.log(c("dim", `(Also saved to ${args.outputFile})`));
    }
  }

  // Show statistics if requested
  if (args.stats && !quiet) {
    showStats(results);
  }

  // Show fix summary
  if (fix && filesFixed > 0 && !quiet) {
    console.log("");
    console.log(
      c(
        "green",
        `\u2714 Fixed issues in ${filesFixed} file${filesFixed === 1 ? "" : "s"}`,
      ),
    );
  }

  // Exit codes
  if (totalErrors > 0) {
    process.exit(1);
  }

  if (maxWarnings >= 0 && totalWarnings > maxWarnings) {
    if (!quiet) {
      console.log("");
      console.log(
        c(
          "red",
          `\u2716 Max warnings exceeded: ${totalWarnings} > ${maxWarnings}`,
        ),
      );
    }
    process.exit(1);
  }

  if (
    !quiet &&
    results.length > 0 &&
    totalErrors === 0 &&
    totalWarnings === 0
  ) {
    // Handle both file and stdin inputs in the summary - count ALL inputs processed
    const stdinCount = args.stdin ? 1 : 0;
    const fileCount = files.length;
    const inputCount = stdinCount + fileCount;

    let inputLabel;
    if (stdinCount > 0 && fileCount > 0) {
      inputLabel = `inputs (${stdinCount} stdin + ${fileCount} file${fileCount === 1 ? "" : "s"})`;
    } else if (stdinCount > 0) {
      inputLabel = "stdin input";
    } else {
      inputLabel = fileCount === 1 ? "file" : "files";
    }

    let msg = `\u2714 ${inputCount} ${inputLabel} checked`;
    if (totalIgnored > 0) {
      msg += ` (${totalIgnored} issue${totalIgnored === 1 ? "" : "s"} ignored)`;
    } else {
      msg += " - no issues found";
    }
    console.log(c("green", msg));
  }

  process.exit(0);
}

// Only run main() if this is the entry point (not imported as a library)
if (require.main === module) {
  main().catch((err) => {
    console.error(c("red", `Fatal error: ${err.message}`));
    process.exit(2);
  });
}

// ============================================================================
// LIBRARY EXPORTS
// ============================================================================

/**
 * Lint SVG files programmatically
 *
 * @example
 * const { lint, lintFile, lintString, RULES } = require('./svglinter.cjs');
 *
 * // Lint multiple files
 * const results = await lint(['icon.svg', 'src/icons/*.svg'], { ignore: ['W104'] });
 *
 * // Lint a single file
 * const result = await lintFile('icon.svg', { errorsOnly: true });
 *
 * // Lint a string
 * const result = await lintString('<svg>...</svg>', { ignore: ['W104'] });
 *
 * // Get all rules
 * console.log(RULES);
 */

/**
 * Lint multiple files or glob patterns
 * @param {string[]} patterns - File paths or glob patterns
 * @param {Object} options - Options
 * @param {string[]} [options.ignore] - Rules to ignore
 * @param {string[]} [options.select] - Rules to select (only check these)
 * @param {boolean} [options.errorsOnly] - Only report errors
 * @param {boolean} [options.includeSource] - Include source line context
 * @returns {Promise<Array>} Array of results
 */
async function lint(patterns, options = {}) {
  // validateSVGAsync is dynamically imported per-file via lintFile
  const files = await expandFiles(patterns);
  const results = [];

  for (const file of files) {
    const result = await lintFile(file, options);
    results.push(result);
  }

  return results;
}

/**
 * Lint a single file
 * @param {string} filePath - Path to SVG file
 * @param {Object} options - Options
 * @returns {Promise<Object>} Lint result
 */
async function lintFile(filePath, options = {}) {
  const { validateSVGAsync } = await import("../src/svg-toolbox.js");

  const content = await readFileWithTimeout(filePath);
  const processedContent = normalizeLineEndings(stripBOM(content));
  const inlineDisables = parseInlineDisables(processedContent);
  const invalidChars = findInvalidCharacters(processedContent);

  const result = await validateSVGAsync(filePath, {
    errorsOnly: options.errorsOnly || false,
    includeSource: options.includeSource !== false,
  });

  // Add invalid character issues
  for (const ic of invalidChars) {
    result.issues.push({
      type: "invalid_character",
      severity: "error",
      reason: `Invalid control character ${ic.char}`,
      line: ic.line,
      column: ic.column,
    });
  }

  // Filter issues
  const filteredIssues = [];
  let ignoredCount = 0;

  for (const issue of result.issues) {
    const code = TYPE_TO_CODE[issue.type] || "W000";
    if (shouldIgnoreRule(code, options.ignore || [])) {
      ignoredCount++;
      continue;
    }
    if (
      options.select &&
      options.select.length > 0 &&
      !isRuleSelected(code, options.select)
    ) {
      ignoredCount++;
      continue;
    }
    if (isDisabledByInline(issue, inlineDisables)) {
      ignoredCount++;
      continue;
    }
    // Apply severity overrides if specified
    if (options.severityOverrides && options.severityOverrides[code]) {
      issue.severity = options.severityOverrides[code];
    }
    filteredIssues.push(issue);
  }

  return {
    file: filePath,
    issues: filteredIssues,
    errorCount: filteredIssues.filter((i) => i.severity === "error").length,
    warningCount: filteredIssues.filter((i) => i.severity === "warning").length,
    ignored: ignoredCount,
  };
}

/**
 * Lint an SVG string
 * @param {string} svgContent - SVG content as string
 * @param {Object} options - Options
 * @returns {Promise<Object>} Lint result
 */
async function lintString(svgContent, options = {}) {
  const { validateSVGAsync } = await import("../src/svg-toolbox.js");

  const processedContent = normalizeLineEndings(stripBOM(svgContent));
  const inlineDisables = parseInlineDisables(processedContent);
  const invalidChars = findInvalidCharacters(processedContent);

  // Validate the SVG string using validateSVGAsync (works with string input)
  const result = await validateSVGAsync(processedContent, {
    errorsOnly: options.errorsOnly || false,
    includeSource: options.includeSource !== false,
  });

  // Add invalid character issues
  for (const ic of invalidChars) {
    result.issues.push({
      type: "invalid_character",
      severity: "error",
      reason: `Invalid control character ${ic.char}`,
      line: ic.line,
      column: ic.column,
    });
  }

  // Filter issues
  const filteredIssues = [];
  let ignoredCount = 0;

  for (const issue of result.issues) {
    const code = TYPE_TO_CODE[issue.type] || "W000";
    if (shouldIgnoreRule(code, options.ignore || [])) {
      ignoredCount++;
      continue;
    }
    if (
      options.select &&
      options.select.length > 0 &&
      !isRuleSelected(code, options.select)
    ) {
      ignoredCount++;
      continue;
    }
    if (isDisabledByInline(issue, inlineDisables)) {
      ignoredCount++;
      continue;
    }
    // Apply severity overrides if specified
    if (options.severityOverrides && options.severityOverrides[code]) {
      issue.severity = options.severityOverrides[code];
    }
    filteredIssues.push(issue);
  }

  return {
    file: "<string>",
    issues: filteredIssues,
    errorCount: filteredIssues.filter((i) => i.severity === "error").length,
    warningCount: filteredIssues.filter((i) => i.severity === "warning").length,
    ignored: ignoredCount,
  };
}

/**
 * Format results using specified format
 * @param {Array} results - Lint results
 * @param {string} format - Output format
 * @param {Object} options - Format options
 * @returns {string} Formatted output
 */
function format(results, formatType = "stylish", options = {}) {
  // BUG FIX: Validate maxLineWidth bounds for library users (CLI validates in main())
  let maxLineWidth = options.maxLineWidth || DEFAULT_MAX_LINE_WIDTH;
  if (maxLineWidth < MIN_MAX_LINE_WIDTH) {
    maxLineWidth = MIN_MAX_LINE_WIDTH;
  } else if (maxLineWidth > MAX_MAX_LINE_WIDTH) {
    maxLineWidth = MAX_MAX_LINE_WIDTH;
  }
  return formatResults(
    results,
    formatType,
    options.quiet,
    options.showIgnored,
    maxLineWidth,
  );
}

// Export public API
module.exports = {
  // Main API
  lint,
  lintFile,
  lintString,
  format,

  // Rule registry
  RULES,
  TYPE_TO_CODE,
  VALID_FORMATS,

  // Utilities (for advanced use)
  escapeXml,
  escapeMarkdown,
  normalizeLineEndings,
  stripBOM,
  detectEncoding,
  findInvalidCharacters,
  parseInlineDisables,

  // Constants
  VERSION,
  DEFAULT_MAX_LINE_WIDTH,
  MIN_MAX_LINE_WIDTH,
  MAX_MAX_LINE_WIDTH,
  FILE_READ_TIMEOUT,
  MAX_SYMLINK_DEPTH,
  MAX_FILE_SIZE,
};
