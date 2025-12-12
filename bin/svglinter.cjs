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
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
    type: 'broken_reference',
    severity: 'error',
    description: 'Reference to non-existent ID (url(#id) or xlink:href="#id")',
    fixable: false,
  },
  E002: {
    type: 'broken_url_reference',
    severity: 'error',
    description: 'Broken URL reference in href or xlink:href attribute',
    fixable: false,
  },
  E003: {
    type: 'duplicate_id',
    severity: 'error',
    description: 'Duplicate ID attribute (IDs must be unique)',
    fixable: true,
  },

  // Structure errors (E100-E199)
  E101: {
    type: 'missing_required_attribute',
    severity: 'error',
    description: 'Required attribute is missing on element',
    fixable: false,
  },
  E102: {
    type: 'invalid_child_element',
    severity: 'error',
    description: 'Invalid child element (not allowed by SVG spec)',
    fixable: false,
  },
  E103: {
    type: 'animation_in_empty_element',
    severity: 'error',
    description: 'Animation element inside empty element (no valid target)',
    fixable: false,
  },

  // Syntax errors (E200-E299)
  E201: {
    type: 'malformed_viewbox',
    severity: 'error',
    description: 'Malformed viewBox attribute (requires 4 numbers)',
    fixable: false,
  },
  E202: {
    type: 'malformed_points',
    severity: 'error',
    description: 'Malformed points attribute on polygon/polyline',
    fixable: false,
  },
  E203: {
    type: 'malformed_transform',
    severity: 'error',
    description: 'Malformed transform attribute',
    fixable: false,
  },
  E204: {
    type: 'invalid_enum_value',
    severity: 'error',
    description: 'Invalid enumeration value for attribute',
    fixable: false,
  },
  E205: {
    type: 'invalid_numeric_constraint',
    severity: 'error',
    description: 'Numeric value violates constraint (negative where positive required)',
    fixable: false,
  },

  // === WARNINGS (W###) ===

  // Reference warnings (W001-W099)
  W001: {
    type: 'invalid_attr_on_element',
    severity: 'warning',
    description: 'Attribute not valid on this element type',
    fixable: false,
  },
  W002: {
    type: 'missing_namespace',
    severity: 'warning',
    description: 'Missing xmlns namespace declaration on root SVG',
    fixable: true,
  },
  W003: {
    type: 'invalid_timing',
    severity: 'warning',
    description: 'Invalid timing value in animation element',
    fixable: false,
  },

  // Typo/unknown warnings (W100-W199)
  W101: {
    type: 'mistyped_element_detected',
    severity: 'warning',
    description: 'Possible typo in element name (similar to valid SVG element)',
    fixable: true,
  },
  W102: {
    type: 'unknown_element_detected',
    severity: 'warning',
    description: 'Unknown element (not in SVG 1.1 or SVG 2.0 spec)',
    fixable: false,
  },
  W103: {
    type: 'mistyped_attribute_detected',
    severity: 'warning',
    description: 'Possible typo in attribute name (similar to valid SVG attribute)',
    fixable: true,
  },
  W104: {
    type: 'unknown_attribute_detected',
    severity: 'warning',
    description: 'Unknown attribute (not in SVG 1.1 spec)',
    fixable: false,
  },

  // Style warnings (W200-W299)
  W201: {
    type: 'uppercase_unit',
    severity: 'warning',
    description: 'Uppercase unit (should be lowercase: px, em, etc.)',
    fixable: true,
  },
  W202: {
    type: 'invalid_whitespace',
    severity: 'warning',
    description: 'Invalid whitespace in attribute value',
    fixable: true,
  },
  W203: {
    type: 'invalid_number',
    severity: 'warning',
    description: 'Invalid number format in attribute value',
    fixable: false,
  },
  W204: {
    type: 'invalid_color',
    severity: 'warning',
    description: 'Invalid color value (not a valid CSS color or SVG color keyword)',
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
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  blue: '\x1b[34m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgGreen: '\x1b[42m',
};

const NO_COLOR = process.env.NO_COLOR || process.env.SVGLINT_NO_COLOR;
const FORCE_COLOR = process.env.FORCE_COLOR || process.env.SVGLINT_FORCE_COLOR;
let useColors = FORCE_COLOR || (!NO_COLOR && process.stdout.isTTY);

function c(color, text) {
  if (!useColors) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG_FILES = [
  '.svglintrc',
  '.svglintrc.json',
  'svglint.config.json',
  '.svglintrc.js',
  'svglint.config.js',
];

/**
 * Load configuration from file
 */
function loadConfig(configPath) {
  const defaultConfig = {
    ignore: [],
    select: [],
    fix: false,
    quiet: false,
    format: 'stylish',
    maxWarnings: -1,
    bail: false,
  };

  // If explicit config path provided
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(c('red', `Error: Config file not found: ${configPath}`));
      process.exit(2);
    }
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(content) };
    } catch (err) {
      console.error(c('red', `Error parsing config file: ${err.message}`));
      process.exit(2);
    }
  }

  // Search for config file in current directory
  for (const filename of CONFIG_FILES) {
    const filepath = path.join(process.cwd(), filename);
    if (fs.existsSync(filepath)) {
      try {
        if (filename.endsWith('.js')) {
          // For JS configs, we'd need dynamic import (not supported in CJS easily)
          continue;
        }
        const content = fs.readFileSync(filepath, 'utf8');
        return { ...defaultConfig, ...JSON.parse(content) };
      } catch {
        // Ignore parse errors in auto-discovered configs
      }
    }
  }

  return defaultConfig;
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(argv) {
  const args = {
    files: [],
    fix: false,
    quiet: false,
    format: 'stylish',
    maxWarnings: -1,
    errorsOnly: false,
    help: false,
    version: false,
    noColor: false,
    outputFile: null,
    config: null,
    ignore: [],
    select: [],
    listRules: false,
    showIgnored: false,
    bail: false,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else if (arg === '--fix') {
      args.fix = true;
    } else if (arg === '--quiet' || arg === '-q') {
      args.quiet = true;
    } else if (arg === '--errors-only' || arg === '-E') {
      args.errorsOnly = true;
    } else if (arg === '--no-color') {
      args.noColor = true;
    } else if (arg === '--list-rules' || arg === '--rules') {
      args.listRules = true;
    } else if (arg === '--show-ignored') {
      args.showIgnored = true;
    } else if (arg === '--bail' || arg === '--fail-fast' || arg === '-x') {
      args.bail = true;
    } else if (arg === '--format' || arg === '-f') {
      i++;
      args.format = argv[i] || 'stylish';
    } else if (arg.startsWith('--format=')) {
      args.format = arg.split('=')[1];
    } else if (arg === '--max-warnings') {
      i++;
      args.maxWarnings = parseInt(argv[i], 10);
    } else if (arg.startsWith('--max-warnings=')) {
      args.maxWarnings = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--output' || arg === '-o') {
      i++;
      args.outputFile = argv[i];
    } else if (arg.startsWith('--output=')) {
      args.outputFile = arg.split('=')[1];
    } else if (arg === '--config' || arg === '-c') {
      i++;
      args.config = argv[i];
    } else if (arg.startsWith('--config=')) {
      args.config = arg.split('=')[1];
    } else if (arg === '--ignore' || arg === '-i') {
      i++;
      if (argv[i]) {
        args.ignore.push(...argv[i].split(',').map(s => s.trim().toUpperCase()));
      }
    } else if (arg.startsWith('--ignore=')) {
      args.ignore.push(...arg.split('=')[1].split(',').map(s => s.trim().toUpperCase()));
    } else if (arg === '--select' || arg === '-s') {
      i++;
      if (argv[i]) {
        args.select.push(...argv[i].split(',').map(s => s.trim().toUpperCase()));
      }
    } else if (arg.startsWith('--select=')) {
      args.select.push(...arg.split('=')[1].split(',').map(s => s.trim().toUpperCase()));
    } else if (!arg.startsWith('-')) {
      args.files.push(arg);
    } else {
      console.error(c('red', `Unknown option: ${arg}`));
      console.error(`Run 'svglinter --help' for usage information.`);
      process.exit(1);
    }
    i++;
  }

  return args;
}

// ============================================================================
// HELP & VERSION
// ============================================================================

function showHelp() {
  console.log(`
${c('bold', 'svglinter')} - SVG validation CLI tool (ESLint/Ruff style)

${c('bold', 'USAGE')}
  svglinter [options] <file|dir|glob...>

${c('bold', 'ARGUMENTS')}
  <file|dir|glob...>       Files, directories, or glob patterns to lint

${c('bold', 'OPTIONS')}
  ${c('cyan', '-h, --help')}               Show this help message
  ${c('cyan', '-v, --version')}            Show version number
  ${c('cyan', '--list-rules')}             List all available rules with codes
  ${c('cyan', '--fix')}                    Automatically fix problems (when possible)
  ${c('cyan', '-q, --quiet')}              Suppress output (only show summary)
  ${c('cyan', '-E, --errors-only')}        Only report errors (ignore warnings)
  ${c('cyan', '-x, --bail')}               Stop after first error (fail-fast mode)

${c('bold', 'RULE SELECTION')}
  ${c('cyan', '-i, --ignore')} <rules>     Ignore specific rules (comma-separated)
  ${c('cyan', '-s, --select')} <rules>     Only check specific rules (comma-separated)
  ${c('cyan', '--show-ignored')}           Show which issues were ignored

${c('bold', 'OUTPUT')}
  ${c('cyan', '-f, --format')} <type>      Output format: stylish, compact, json, tap, junit, ruff
  ${c('cyan', '-o, --output')} <file>      Write report to file
  ${c('cyan', '--max-warnings')} <n>       Exit with error if warnings exceed threshold
  ${c('cyan', '--no-color')}               Disable colored output

${c('bold', 'CONFIGURATION')}
  ${c('cyan', '-c, --config')} <file>      Path to config file (.svglintrc.json)

${c('bold', 'RULE CODES')}
  ${c('red', 'E001-E099')}  Reference errors (broken refs, duplicates)
  ${c('red', 'E100-E199')}  Structure errors (missing attrs, invalid children)
  ${c('red', 'E200-E299')}  Syntax errors (malformed values)
  ${c('yellow', 'W001-W099')}  Reference warnings (invalid attrs, timing)
  ${c('yellow', 'W100-W199')}  Typo/unknown warnings (elements, attributes)
  ${c('yellow', 'W200-W299')}  Style warnings (case, whitespace, colors)

${c('bold', 'EXAMPLES')}
  ${c('dim', '# Lint files')}
  svglinter icon.svg
  svglinter "src/**/*.svg"

  ${c('dim', '# Ignore specific rules')}
  svglinter --ignore E001,W104 *.svg
  svglinter --ignore W1   ${c('dim', '# Ignores all W1xx rules')}

  ${c('dim', '# Only check specific rules')}
  svglinter --select E001,E002 *.svg

  ${c('dim', '# Fix issues automatically')}
  svglinter --fix broken.svg

  ${c('dim', '# CI-friendly output')}
  svglinter --format json --output report.json src/

${c('bold', 'CONFIG FILE')} (.svglintrc.json)
  {
    "ignore": ["W104", "W204"],
    "maxWarnings": 10,
    "fix": false
  }

${c('bold', 'INLINE COMMENTS')}
  <!-- svglint-disable -->           Disable all rules
  <!-- svglint-disable E001,W104 --> Disable specific rules
  <!-- svglint-enable -->            Re-enable rules

${c('bold', 'EXIT CODES')}
  ${c('green', '0')}  No errors found
  ${c('red', '1')}  Errors found or max-warnings exceeded
  ${c('red', '2')}  Fatal error

${c('dim', 'Docs: https://github.com/Emasoft/SVG-MATRIX')}
`);
}

function showVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`svglinter ${pkg.version}`);
  } catch {
    console.log('svglinter (version unknown)');
  }
}

function listRules() {
  console.log(`
${c('bold', 'SVGLINTER RULES')}
${'='.repeat(78)}
`);

  // Group by severity and code range
  const errors = Object.entries(RULES).filter(([code]) => code.startsWith('E'));
  const warnings = Object.entries(RULES).filter(([code]) => code.startsWith('W'));

  console.log(c('bold', c('red', 'ERRORS')) + '\n');
  console.log(`${c('dim', 'Code')}    ${c('dim', 'Fixable')}  ${c('dim', 'Description')}`);
  console.log(`${'-'.repeat(78)}`);

  for (const [code, rule] of errors) {
    const fixable = rule.fixable ? c('green', 'Yes') : c('dim', 'No ');
    console.log(`${c('red', code)}    ${fixable}      ${rule.description}`);
  }

  console.log(`\n${c('bold', c('yellow', 'WARNINGS'))}\n`);
  console.log(`${c('dim', 'Code')}    ${c('dim', 'Fixable')}  ${c('dim', 'Description')}`);
  console.log(`${'-'.repeat(78)}`);

  for (const [code, rule] of warnings) {
    const fixable = rule.fixable ? c('green', 'Yes') : c('dim', 'No ');
    console.log(`${c('yellow', code)}    ${fixable}      ${rule.description}`);
  }

  console.log(`
${c('dim', 'Total:')} ${errors.length} error rules, ${warnings.length} warning rules
${c('dim', 'Fixable:')} ${Object.values(RULES).filter(r => r.fixable).length} rules

${c('bold', 'Usage:')}
  svglinter --ignore E001,W104 file.svg   ${c('dim', '# Ignore specific rules')}
  svglinter --ignore W1 file.svg          ${c('dim', '# Ignore all W1xx rules')}
  svglinter --select E001,E002 file.svg   ${c('dim', '# Only check these rules')}
`);
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

async function expandFiles(patterns) {
  const files = new Set();

  for (const pattern of patterns) {
    if (fs.existsSync(pattern)) {
      const stat = fs.statSync(pattern);
      if (stat.isFile() && pattern.endsWith('.svg')) {
        files.add(path.resolve(pattern));
      } else if (stat.isDirectory()) {
        const dirFiles = await findSvgFiles(pattern);
        dirFiles.forEach(f => files.add(f));
      }
    } else {
      const globFiles = await globPromise(pattern);
      globFiles.filter(f => f.endsWith('.svg')).forEach(f => files.add(path.resolve(f)));
    }
  }

  return Array.from(files).sort();
}

async function findSvgFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const subFiles = await findSvgFiles(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.svg')) {
      results.push(path.resolve(fullPath));
    }
  }

  return results;
}

async function globPromise(pattern) {
  const files = [];

  if (pattern.includes('**')) {
    const baseDir = pattern.split('**')[0] || '.';
    const ext = pattern.split('**')[1]?.replace(/^[/\\]*\*/, '') || '.svg';
    const dirFiles = await findSvgFilesWithExt(baseDir, ext);
    files.push(...dirFiles);
  } else if (pattern.includes('*')) {
    const dir = path.dirname(pattern);
    const filePattern = path.basename(pattern);
    const regex = new RegExp('^' + filePattern.replace(/\*/g, '.*') + '$');

    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (regex.test(entry)) {
          files.push(path.resolve(path.join(dir, entry)));
        }
      }
    }
  }

  return files;
}

async function findSvgFilesWithExt(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const subFiles = await findSvgFilesWithExt(fullPath, ext);
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
 * Check if a rule code should be ignored
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
 * Check if a rule code is selected
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
 * Parse inline disable comments from SVG content
 */
function parseInlineDisables(content) {
  const disabledRanges = [];
  const lines = content.split('\n');

  let currentDisabled = null;
  let disabledRules = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for disable comment
    const disableMatch = line.match(/<!--\s*svglint-disable(?:\s+([A-Z0-9,\s]+))?\s*-->/i);
    if (disableMatch) {
      const rules = disableMatch[1]
        ? disableMatch[1].split(',').map(r => r.trim().toUpperCase())
        : ['*'];
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
    const nextLineMatch = line.match(/<!--\s*svglint-disable-next-line(?:\s+([A-Z0-9,\s]+))?\s*-->/i);
    if (nextLineMatch) {
      const rules = nextLineMatch[1]
        ? nextLineMatch[1].split(',').map(r => r.trim().toUpperCase())
        : ['*'];
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
 * Check if an issue is disabled by inline comments
 */
function isDisabledByInline(issue, disabledRanges) {
  const code = TYPE_TO_CODE[issue.type] || '';
  const line = issue.line || 0;

  for (const range of disabledRanges) {
    if (line >= range.startLine && line <= range.endLine) {
      if (range.rules.has('*') || range.rules.has(code)) {
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

function formatRuleCode(type) {
  return TYPE_TO_CODE[type] || 'W000';
}

function formatSeverity(severity, format = 'stylish') {
  if (format === 'compact' || format === 'ruff') {
    return severity === 'error' ? 'error' : 'warning';
  }

  if (severity === 'error') {
    return c('red', 'error');
  }
  return c('yellow', 'warning');
}

function formatStylish(results, quiet, showIgnored) {
  const lines = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalIgnored = 0;

  for (const result of results) {
    if (result.issues.length === 0 && (!showIgnored || result.ignored === 0)) continue;

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    totalIgnored += result.ignored || 0;

    lines.push('');
    lines.push(c('bold', path.relative(process.cwd(), result.file)));

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const pos = c('dim', `${line}:${column}`.padEnd(8));
      const severity = formatSeverity(issue.severity);
      const code = c('cyan', formatRuleCode(issue.type).padEnd(5));
      const message = issue.reason || issue.type;

      lines.push(`  ${pos} ${severity.padEnd(useColors ? 17 : 7)} ${code} ${message}`);

      if (issue.sourceLine && !quiet) {
        const sourceLine = issue.sourceLine.replace(/\t/g, '  ');
        lines.push(c('dim', `           ${sourceLine.substring(0, 72)}${sourceLine.length > 72 ? '...' : ''}`));
      }
    }

    if (showIgnored && result.ignored > 0) {
      lines.push(c('dim', `  (${result.ignored} issue${result.ignored === 1 ? '' : 's'} ignored)`));
    }
  }

  if (!quiet && (totalErrors > 0 || totalWarnings > 0)) {
    lines.push('');

    const problemCount = totalErrors + totalWarnings;
    const summary = [];

    if (totalErrors > 0) {
      summary.push(c('red', `${totalErrors} error${totalErrors === 1 ? '' : 's'}`));
    }
    if (totalWarnings > 0) {
      summary.push(c('yellow', `${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}`));
    }

    const icon = totalErrors > 0 ? c('red', '\u2716') : c('yellow', '\u26A0');
    lines.push(`${icon} ${problemCount} problem${problemCount === 1 ? '' : 's'} (${summary.join(', ')})`);

    if (totalIgnored > 0) {
      lines.push(c('dim', `  ${totalIgnored} issue${totalIgnored === 1 ? '' : 's'} ignored`));
    }
  }

  return lines.join('\n');
}

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

      lines.push(`${relPath}:${line}:${column}: ${c('cyan', code)} ${message}`);
    }
  }

  return lines.join('\n');
}

function formatCompact(results) {
  const lines = [];

  for (const result of results) {
    const relPath = path.relative(process.cwd(), result.file);

    for (const issue of result.issues) {
      const line = issue.line || 0;
      const column = issue.column || 0;
      const severity = issue.severity === 'error' ? 'error' : 'warning';
      const code = formatRuleCode(issue.type);
      const message = issue.reason || issue.type;

      lines.push(`${relPath}:${line}:${column}: ${severity} [${code}] ${message}`);
    }
  }

  return lines.join('\n');
}

function formatJson(results) {
  const output = results.map(r => ({
    filePath: r.file,
    messages: r.issues.map(issue => ({
      ruleId: formatRuleCode(issue.type),
      severity: issue.severity === 'error' ? 2 : 1,
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

function formatTap(results) {
  const lines = ['TAP version 13'];
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
        lines.push(`not ok ${testNum} - ${relPath}:${line} [${code}] ${message}`);
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
  return lines.join('\n');
}

function formatJunit(results) {
  const escapeXml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

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

    const failures = result.issues.map(issue => {
      const code = formatRuleCode(issue.type);
      const message = escapeXml(issue.reason || issue.type);
      const severity = issue.severity === 'error' ? 'error' : 'failure';
      return `      <${severity} message="[${code}] ${message}" type="${code}">` +
        `${escapeXml(relPath)}:${issue.line || 0}:${issue.column || 0}` +
        `</${severity}>`;
    }).join('\n');

    testSuites.push(`  <testsuite name="${escapeXml(relPath)}" tests="1" failures="${result.warningCount}" errors="${result.errorCount}">
    <testcase name="${escapeXml(relPath)}" classname="svglinter">
${failures || ''}
    </testcase>
  </testsuite>`);
  }

  lines.push(`<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}">`);
  lines.push(testSuites.join('\n'));
  lines.push('</testsuites>');

  return lines.join('\n');
}

function formatResults(results, format, quiet, showIgnored) {
  switch (format) {
    case 'json':
      return formatJson(results);
    case 'compact':
      return formatCompact(results);
    case 'ruff':
      return formatRuff(results);
    case 'tap':
      return formatTap(results);
    case 'junit':
      return formatJunit(results);
    case 'stylish':
    default:
      return formatStylish(results, quiet, showIgnored);
  }
}

// ============================================================================
// MAIN
// ============================================================================

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

  if (args.noColor) {
    useColors = false;
    Object.keys(colors).forEach(key => { colors[key] = ''; });
  }

  // Load config file
  const config = loadConfig(args.config);

  // Merge config with CLI args (CLI takes precedence)
  const ignore = [...config.ignore, ...args.ignore];
  const select = args.select.length > 0 ? args.select : config.select;
  const fix = args.fix || config.fix;
  const quiet = args.quiet || config.quiet;
  const maxWarnings = args.maxWarnings >= 0 ? args.maxWarnings : config.maxWarnings;
  const bail = args.bail || config.bail;

  if (args.files.length === 0) {
    console.error(c('red', 'Error: No files specified'));
    console.error(`Run 'svglinter --help' for usage information.`);
    process.exit(2);
  }

  const files = await expandFiles(args.files);

  if (files.length === 0) {
    console.error(c('red', 'Error: No SVG files found matching the specified patterns'));
    process.exit(2);
  }

  const { validateSvg, fixInvalidSvg } = await import('../src/svg-toolbox.js');

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalIgnored = 0;
  let filesFixed = 0;

  for (const file of files) {
    try {
      // Read file content for inline disable parsing
      const content = fs.readFileSync(file, 'utf8');
      const inlineDisables = parseInlineDisables(content);

      if (fix) {
        const fixResult = await fixInvalidSvg(file, {
          outputFile: file,
          errorsOnly: args.errorsOnly,
        });

        if (fixResult.fixed && fixResult.fixed.length > 0) {
          filesFixed++;
        }
      }

      const result = await validateSvg(file, {
        errorsOnly: args.errorsOnly,
        includeSource: true,
      });

      // Filter issues based on ignore/select and inline disables
      const filteredIssues = [];
      let ignoredCount = 0;

      for (const issue of result.issues) {
        const code = TYPE_TO_CODE[issue.type] || 'W000';

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

        filteredIssues.push(issue);
      }

      const errorCount = filteredIssues.filter(i => i.severity === 'error').length;
      const warningCount = filteredIssues.filter(i => i.severity === 'warning').length;

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
          console.log(c('red', `\n\u2716 Bailing after first error (--bail mode)`));
        }
        break;
      }
    } catch (err) {
      results.push({
        file,
        issues: [{
          type: 'fatal_error',
          severity: 'error',
          reason: `Failed to process file: ${err.message}`,
          line: 0,
          column: 0,
        }],
        errorCount: 1,
        warningCount: 0,
        ignored: 0,
      });
      totalErrors++;

      // Bail on fatal error if requested
      if (bail) {
        if (!quiet) {
          console.log(c('red', `\n\u2716 Bailing after first error (--bail mode)`));
        }
        break;
      }
    }
  }

  // Format and output
  const output = formatResults(results, args.format, quiet, args.showIgnored);

  if (args.outputFile) {
    fs.writeFileSync(args.outputFile, output, 'utf8');
    if (!quiet) {
      console.log(c('green', `Report written to ${args.outputFile}`));
    }
  } else if (output) {
    console.log(output);
  }

  // Show fix summary
  if (fix && filesFixed > 0 && !quiet) {
    console.log('');
    console.log(c('green', `\u2714 Fixed issues in ${filesFixed} file${filesFixed === 1 ? '' : 's'}`));
  }

  // Exit codes
  if (totalErrors > 0) {
    process.exit(1);
  }

  if (maxWarnings >= 0 && totalWarnings > maxWarnings) {
    if (!quiet) {
      console.log('');
      console.log(c('red', `\u2716 Max warnings exceeded: ${totalWarnings} > ${maxWarnings}`));
    }
    process.exit(1);
  }

  if (!quiet && results.length > 0 && totalErrors === 0 && totalWarnings === 0) {
    let msg = `\u2714 ${files.length} file${files.length === 1 ? '' : 's'} checked`;
    if (totalIgnored > 0) {
      msg += ` (${totalIgnored} issue${totalIgnored === 1 ? '' : 's'} ignored)`;
    } else {
      msg += ' - no issues found';
    }
    console.log(c('green', msg));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(c('red', `Fatal error: ${err.message}`));
  process.exit(2);
});
