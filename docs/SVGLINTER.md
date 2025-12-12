# svglinter - SVG Validation CLI Tool

A comprehensive linter for SVG files with ESLint/Ruff-style output. Validates SVG files against the SVG 1.1 and SVG 2.0 specifications.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Rule Reference](#rule-reference)
- [Configuration](#configuration)
- [Inline Comments](#inline-comments)
- [Output Formats](#output-formats)
- [Exit Codes](#exit-codes)
- [Examples](#examples)
- [Integration](#integration)

---

## Installation

svglinter is included with the `@emasoft/svg-matrix` package:

```bash
# Install globally
npm install -g @emasoft/svg-matrix

# Or use with npx
npx @emasoft/svg-matrix svglinter --help
```

After installation, the `svglinter` command is available:

```bash
svglinter --version
svglinter --help
```

---

## Quick Start

```bash
# Lint a single file
svglinter icon.svg

# Lint multiple files
svglinter icon.svg logo.svg banner.svg

# Lint a directory recursively
svglinter src/icons/

# Lint with glob pattern
svglinter "src/**/*.svg"

# Fix issues automatically
svglinter --fix broken.svg

# Ignore specific rules
svglinter --ignore W104,W204 *.svg

# Show only errors (no warnings)
svglinter --errors-only *.svg

# Stop on first error
svglinter --bail *.svg
```

---

## Usage

```
svglinter [options] <file|dir|glob...>
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help message |
| `--version` | `-v` | Show version number |
| `--list-rules` | | List all available rules with codes |
| `--fix` | | Automatically fix problems (when possible) |
| `--quiet` | `-q` | Suppress output (only show summary) |
| `--errors-only` | `-E` | Only report errors (ignore warnings) |
| `--bail` | `-x` | Stop after first error (fail-fast mode) |

### Rule Selection

| Option | Short | Description |
|--------|-------|-------------|
| `--ignore <rules>` | `-i` | Ignore specific rules (comma-separated) |
| `--select <rules>` | `-s` | Only check specific rules (comma-separated) |
| `--show-ignored` | | Show which issues were ignored |

### Output Options

| Option | Short | Description |
|--------|-------|-------------|
| `--format <type>` | `-f` | Output format (see [Output Formats](#output-formats)) |
| `--output <file>` | `-o` | Write report to file |
| `--max-warnings <n>` | | Exit with error if warnings exceed threshold |
| `--no-color` | | Disable colored output |

### Configuration

| Option | Short | Description |
|--------|-------|-------------|
| `--config <file>` | `-c` | Path to config file (.svglintrc.json) |

---

## Rule Reference

svglinter includes 22 rules organized into categories. Each rule has a unique code for easy reference.

### Error Rules (E###)

Errors indicate serious issues that will likely cause problems when the SVG is rendered or processed.

#### Reference Errors (E001-E099)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **E001** | broken_reference | Reference to non-existent ID via `url(#id)` or `xlink:href="#id"` | No |
| **E002** | broken_url_reference | Broken URL reference in `href` or `xlink:href` attribute | No |
| **E003** | duplicate_id | Duplicate ID attribute (IDs must be unique per document) | Yes |

#### Structure Errors (E100-E199)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **E101** | missing_required_attribute | Required attribute is missing on element | No |
| **E102** | invalid_child_element | Invalid child element (not allowed by SVG spec) | No |
| **E103** | animation_in_empty_element | Animation element inside empty element (no valid target) | No |

#### Syntax Errors (E200-E299)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **E201** | malformed_viewbox | Malformed viewBox attribute (requires exactly 4 numbers) | No |
| **E202** | malformed_points | Malformed points attribute on polygon/polyline | No |
| **E203** | malformed_transform | Malformed transform attribute | No |
| **E204** | invalid_enum_value | Invalid enumeration value for attribute | No |
| **E205** | invalid_numeric_constraint | Numeric value violates constraint (e.g., negative where positive required) | No |

### Warning Rules (W###)

Warnings indicate potential issues or non-standard usage that may not cause rendering problems but should be reviewed.

#### Reference Warnings (W001-W099)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **W001** | invalid_attr_on_element | Attribute not valid on this element type | No |
| **W002** | missing_namespace | Missing xmlns namespace declaration on root SVG | Yes |
| **W003** | invalid_timing | Invalid timing value in animation element | No |

#### Typo/Unknown Warnings (W100-W199)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **W101** | mistyped_element_detected | Possible typo in element name (similar to valid SVG element) | Yes |
| **W102** | unknown_element_detected | Unknown element (not in SVG 1.1 or SVG 2.0 spec) | No |
| **W103** | mistyped_attribute_detected | Possible typo in attribute name (similar to valid SVG attribute) | Yes |
| **W104** | unknown_attribute_detected | Unknown attribute (not in SVG 1.1 spec) | No |

#### Style Warnings (W200-W299)

| Code | Rule | Description | Fixable |
|------|------|-------------|---------|
| **W201** | uppercase_unit | Uppercase unit (should be lowercase: px, em, etc.) | Yes |
| **W202** | invalid_whitespace | Invalid whitespace in attribute value | Yes |
| **W203** | invalid_number | Invalid number format in attribute value | No |
| **W204** | invalid_color | Invalid color value (not a valid CSS color or SVG color keyword) | No |

### Rule Selection Patterns

You can select or ignore rules using various patterns:

```bash
# Exact rule code
svglinter --ignore E001 *.svg

# Multiple rules
svglinter --ignore E001,W104,W204 *.svg

# Rule prefix (all rules starting with W1)
svglinter --ignore W1 *.svg        # Ignores W101, W102, W103, W104

# Category (all errors or all warnings)
svglinter --ignore E *.svg         # Ignores all errors
svglinter --ignore W *.svg         # Ignores all warnings

# Select specific rules only
svglinter --select E001,E002,E003 *.svg
```

---

## Configuration

### Config File

Create a `.svglintrc.json` or `svglint.config.json` in your project root:

```json
{
  "ignore": ["W104", "W204"],
  "select": [],
  "fix": false,
  "quiet": false,
  "format": "stylish",
  "maxWarnings": -1,
  "bail": false
}
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignore` | string[] | `[]` | Array of rule codes to ignore |
| `select` | string[] | `[]` | Array of rule codes to check (empty = all) |
| `fix` | boolean | `false` | Automatically fix problems |
| `quiet` | boolean | `false` | Suppress output |
| `format` | string | `"stylish"` | Output format |
| `maxWarnings` | number | `-1` | Max warnings before exit 1 (-1 = unlimited) |
| `bail` | boolean | `false` | Stop after first error |

### Config File Search Order

svglinter searches for config files in this order:

1. Path specified with `--config`
2. `.svglintrc` (JSON)
3. `.svglintrc.json`
4. `svglint.config.json`

### CLI Override

CLI arguments override config file settings:

```bash
# Config says fix: false, but CLI enables it
svglinter --fix *.svg
```

---

## Inline Comments

Disable rules for specific sections of your SVG using inline comments:

### Disable All Rules

```svg
<!-- svglint-disable -->
<rect foo="bar"/>
<circle baz="qux"/>
<!-- svglint-enable -->
```

### Disable Specific Rules

```svg
<!-- svglint-disable W104 -->
<rect custom-attr="value"/>
<!-- svglint-enable -->
```

### Disable Multiple Rules

```svg
<!-- svglint-disable E001, W104, W204 -->
<rect fill="url(#missing)" custom="value"/>
<!-- svglint-enable -->
```

### Disable for Next Line

```svg
<!-- svglint-disable-next-line W104 -->
<rect data-custom="value"/>
```

### Disable Until End of File

```svg
<!-- svglint-disable W104 -->
<rect custom1="value"/>
<rect custom2="value"/>
<!-- No need for svglint-enable - disabled until EOF -->
```

---

## Output Formats

### stylish (default)

ESLint-style output with colors and source context:

```
src/icons/icon.svg
  12:5     error   E001  url(#gradient) references non-existent ID
           <rect fill="url(#gradient)"/>

  24:10    warning W104  Unknown attribute 'data-custom' on <path>
           <path data-custom="value" d="M0 0"/>

✖ 2 problems (1 error, 1 warning)
```

### compact

One line per issue (good for grep and scripting):

```
src/icons/icon.svg:12:5: error [E001] url(#gradient) references non-existent ID
src/icons/icon.svg:24:10: warning [W104] Unknown attribute 'data-custom' on <path>
```

### ruff

Ruff-style format (minimal, code-first):

```
src/icons/icon.svg:12:5: E001 url(#gradient) references non-existent ID
src/icons/icon.svg:24:10: W104 Unknown attribute 'data-custom' on <path>
```

### json

Machine-readable JSON output:

```json
[
  {
    "filePath": "/path/to/icon.svg",
    "messages": [
      {
        "ruleId": "E001",
        "severity": 2,
        "message": "url(#gradient) references non-existent ID",
        "line": 12,
        "column": 5,
        "element": "rect",
        "attribute": "fill"
      }
    ],
    "errorCount": 1,
    "warningCount": 0,
    "ignoredCount": 0
  }
]
```

### tap

TAP (Test Anything Protocol) format:

```
TAP version 13
not ok 1 - src/icons/icon.svg:12 [E001] url(#gradient) references non-existent ID
  ---
  ruleId: E001
  severity: error
  element: rect
  ...
1..1
```

### junit

JUnit XML format for CI integration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="0" errors="1">
  <testsuite name="src/icons/icon.svg" tests="1" failures="0" errors="1">
    <testcase name="src/icons/icon.svg" classname="svglinter">
      <error message="[E001] url(#gradient) references non-existent ID" type="E001">
        src/icons/icon.svg:12:5
      </error>
    </testcase>
  </testsuite>
</testsuites>
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| **0** | Success - no errors found |
| **1** | Errors found or max-warnings exceeded |
| **2** | Fatal error (invalid arguments, file not found, etc.) |

---

## Examples

### Basic Usage

```bash
# Lint single file
svglinter icon.svg

# Lint directory
svglinter src/assets/icons/

# Lint with glob
svglinter "src/**/*.svg"
```

### Fixing Issues

```bash
# Auto-fix what can be fixed
svglinter --fix icons/

# Fix and show what remains
svglinter --fix --show-ignored icons/
```

### CI/CD Integration

```bash
# Strict mode - no warnings allowed
svglinter --max-warnings 0 src/

# JSON report for processing
svglinter --format json --output lint-report.json src/

# JUnit for CI systems
svglinter --format junit --output test-results.xml src/

# Fail fast in CI
svglinter --bail --errors-only src/
```

### Ignoring Rules

```bash
# Ignore unknown attributes (common with data-* attributes)
svglinter --ignore W104 *.svg

# Ignore all typo warnings
svglinter --ignore W1 *.svg

# Ignore specific set of rules
svglinter --ignore E003,W104,W204 *.svg
```

### Checking Specific Rules

```bash
# Only check for broken references
svglinter --select E001,E002 *.svg

# Only check errors, no warnings
svglinter --select E *.svg
```

### Quiet and Verbose Modes

```bash
# Quiet - only errors, no source context
svglinter --quiet src/

# Show what was ignored
svglinter --ignore W1 --show-ignored src/

# Errors only
svglinter --errors-only src/
```

---

## Integration

### npm Scripts

```json
{
  "scripts": {
    "lint:svg": "svglinter src/",
    "lint:svg:fix": "svglinter --fix src/",
    "lint:svg:ci": "svglinter --format junit --output reports/svg-lint.xml src/"
  }
}
```

### Pre-commit Hook

Using [husky](https://github.com/typicode/husky):

```bash
# .husky/pre-commit
#!/bin/sh
npx svglinter --bail $(git diff --cached --name-only --diff-filter=ACM | grep '\.svg$')
```

### GitHub Actions

```yaml
name: Lint SVG
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm install -g @emasoft/svg-matrix
      - run: svglinter --format junit --output reports/svg-lint.xml src/
      - uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: 'reports/*.xml'
```

### VS Code Integration

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Lint SVG",
      "type": "shell",
      "command": "npx svglinter ${file}",
      "problemMatcher": {
        "owner": "svglinter",
        "pattern": {
          "regexp": "^(.+):(\\d+):(\\d+):\\s+(error|warning)\\s+\\[([A-Z]\\d+)\\]\\s+(.+)$",
          "file": 1,
          "line": 2,
          "column": 3,
          "severity": 4,
          "code": 5,
          "message": 6
        }
      }
    }
  ]
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NO_COLOR` | Disable colored output |
| `FORCE_COLOR` | Force colored output even if not a TTY |
| `SVGLINT_NO_COLOR` | Disable colored output (svglinter-specific) |
| `SVGLINT_FORCE_COLOR` | Force colored output (svglinter-specific) |

---

## Related

- [svg-matrix CLI](../README.md#cli) - Main CLI for SVG processing
- [validateSvg() / fixInvalidSvg() API](../README.md#validatesvg--fixinvalidsvg) - Programmatic validation and fix API
