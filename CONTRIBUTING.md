# Contributing to SVG-MATRIX

Thank you for your interest in contributing to SVG-MATRIX. This document provides guidelines and requirements for contributions. Following these conventions ensures consistency across the codebase and makes code review efficient.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Code Style Requirements](#code-style-requirements)
3. [Naming Conventions](#naming-conventions)
4. [Formatting Rules](#formatting-rules)
5. [Documentation Requirements](#documentation-requirements)
6. [Testing Requirements](#testing-requirements)
7. [SVG-Toolbox Testing Matrix](#svg-toolbox-testing-matrix)
   - [Matrix Concept](#matrix-concept)
   - [Adding a New Function (New ROW)](#mandatory-adding-a-new-function-new-row)
   - [Modifying an Existing Function](#mandatory-modifying-an-existing-function)
   - [Adding a New SVG Sample (New COLUMN)](#mandatory-adding-a-new-svg-sample-file-new-column)
   - [Modifying an Existing SVG Sample](#mandatory-modifying-an-existing-svg-sample-file)
   - [Automated Testing with Claude Agent](#automated-testing-with-claude-agent)
   - [PUBLISHING GATE: Zero Tolerance Policy](#publishing-gate-zero-tolerance-policy)
   - [Handling Matrix Failures](#handling-matrix-failures)
8. [Commit Message Format](#commit-message-format)
9. [Pull Request Process](#pull-request-process)
10. [Review Criteria](#review-criteria)

---

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+ or pnpm
- Git

### Setup

```bash
git clone https://github.com/Emasoft/svg-matrix.git
cd svg-matrix
npm install
npm test
```

### Project Structure

```
svg-matrix/
├── src/                    # Source modules
│   ├── index.js            # Main export aggregator
│   ├── svg-toolbox.js      # SVG processing operations
│   ├── svg-parser.js       # SVG parsing utilities
│   ├── matrix.js           # Matrix class
│   ├── vector.js           # Vector class
│   ├── transforms2d.js     # 2D transform helpers
│   ├── transforms3d.js     # 3D transform helpers
│   └── ...
├── bin/                    # CLI executables
│   ├── svgm.js             # SVGO-compatible CLI
│   └── svg-matrix.js       # Full flattening CLI
├── test/                   # Test files
│   └── examples.js         # Main test suite
└── docs/                   # Documentation
```

---

## Code Style Requirements

### Language

- ES Modules (`import`/`export`) only
- No CommonJS (`require`/`module.exports`)
- Target: Node.js 18+ (use modern syntax freely)

### Strict Mode

All files must work in strict mode. Do not add `"use strict"` directives (ES modules are strict by default).

### No Semicolons Exception

This project uses semicolons. Every statement must end with a semicolon.

```javascript
// CORRECT
const x = 10;
const y = 20;

// WRONG
const x = 10
const y = 20
```

### Quotes

Use single quotes for strings. Use template literals only when interpolation is needed.

```javascript
// CORRECT
const name = 'svg-matrix';
const message = `Processing ${count} files`;

// WRONG
const name = "svg-matrix";
const message = "Processing " + count + " files";
```

### Trailing Commas

Use trailing commas in multiline arrays, objects, and function parameters.

```javascript
// CORRECT
const options = {
  precision: 6,
  recursive: true,
  quiet: false,
};

const colors = [
  'red',
  'green',
  'blue',
];

// WRONG
const options = {
  precision: 6,
  recursive: true,
  quiet: false
};
```

### Line Length

Maximum line length: 100 characters. Break long lines logically.

```javascript
// CORRECT
const result = someVeryLongFunctionName(
  firstArgument,
  secondArgument,
  thirdArgument
);

// WRONG
const result = someVeryLongFunctionName(firstArgument, secondArgument, thirdArgument);
```

---

## Naming Conventions

### Summary Table

| Type | Convention | Example |
|------|------------|---------|
| Modules/Classes | PascalCase | `Matrix`, `SVGParser`, `Transforms2D` |
| Functions | camelCase | `parsePath`, `convertColors` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_PRECISION`, `MAX_DEPTH` |
| Variables | camelCase | `inputFile`, `parsedPath` |
| Private/Internal | leading underscore | `_internalHelper` |
| CLI Options | kebab-case | `--preserve-ns`, `--dry-run` |
| Config Properties | camelCase | `preserveNamespaces`, `dryRun` |

### Abbreviation Rules

**SVG and other acronyms in identifiers:**

- In PascalCase names: Keep uppercase (`SVGParser`, `XMLValidator`)
- In camelCase names: Keep uppercase for SVG (`validateSVG`, `parseSVG`)
- Exception: Never use `Svg` - always use `SVG`

```javascript
// CORRECT
export function validateSVG(input) { }
export function parseSVG(content) { }
export class SVGElement { }
export const addClassesToSVGElement = () => { };

// WRONG
export function validateSvg(input) { }  // Svg should be SVG
export function parseSvg(content) { }   // Svg should be SVG
```

### Function Naming Patterns

Use consistent verb prefixes for function categories:

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `parse*` | Convert string/input to structured data | `parsePath`, `parseSVG` |
| `serialize*` | Convert structured data to string | `serializePath`, `serializeSVG` |
| `convert*` | Transform between formats | `convertColors`, `convertTransform` |
| `remove*` | Delete elements/attributes | `removeComments`, `removeMetadata` |
| `cleanup*` | Normalize/fix values | `cleanupIds`, `cleanupNumericValues` |
| `flatten*` | Expand/inline references | `flattenGradients`, `flattenUseElements` |
| `validate*` | Check correctness | `validateSVG`, `validateXML` |
| `fix*` | Auto-repair issues | `fixInvalidSVG`, `fixBrokenRefs` |
| `create*` | Factory functions | `createConfig`, `createOperation` |
| `get*` | Retrieve values | `getElementBBox`, `getTransform` |
| `set*` | Assign values | `setPrecision`, `setLogLevel` |
| `is*` / `has*` | Boolean checks | `isElement`, `hasAttribute` |
| `add*` | Append/insert | `addClassesToSVGElement` |
| `move*` | Relocate | `moveGroupAttrsToElems` |
| `sort*` | Reorder | `sortAttrs`, `sortDefsChildren` |
| `optimize*` | Improve efficiency | `optimizePaths`, `optimizeAnimationTiming` |
| `simplify*` | Reduce complexity | `simplifyPath`, `simplifyPaths` |

### Presets and Constants

Presets use camelCase with `preset` prefix:

```javascript
// CORRECT
export const presetDefault = createOperation(...);
export const presetNone = createOperation(...);

// WRONG
export const preset_default = createOperation(...);  // No snake_case
export const PRESET_DEFAULT = createOperation(...);  // Not a constant
```

### CLI to Config Mapping

CLI options use kebab-case; internal config uses camelCase:

```javascript
// CLI parsing
case '--preserve-ns':
  config.preserveNamespaces = args[++i].split(',');
  break;
case '--dry-run':
  config.dryRun = true;
  break;
case '--final-newline':
  config.finalNewline = true;
  break;
```

---

## Formatting Rules

These rules ensure consistent diffs and easy code review.

### Indentation

- 2 spaces (no tabs)
- No mixed indentation

### Braces

Opening brace on same line. Always use braces for control structures.

```javascript
// CORRECT
if (condition) {
  doSomething();
}

function process(input) {
  return input.trim();
}

// WRONG
if (condition)
  doSomething();

if (condition) doSomething();

function process(input)
{
  return input.trim();
}
```

### Object/Array Formatting

One property per line for objects with 3+ properties:

```javascript
// CORRECT (1-2 properties)
const point = { x: 10, y: 20 };

// CORRECT (3+ properties)
const options = {
  precision: 6,
  recursive: true,
  quiet: false,
  overwrite: true,
};

// WRONG
const options = { precision: 6, recursive: true, quiet: false, overwrite: true };
```

### Function Declarations

Named functions for exports; arrow functions for callbacks and internal helpers:

```javascript
// CORRECT - exported functions
export function parsePath(d) {
  return parsePathCommands(d);
}

export const validateSVG = createOperation((doc, options = {}) => {
  // implementation
});

// CORRECT - callbacks
array.map((item) => item.value);
array.filter((x) => x > 0);

// CORRECT - internal helpers
const processItem = (item) => {
  return item.trim();
};
```

### Import Order

Group imports in this order, with blank lines between groups:

1. Node.js built-ins
2. External dependencies
3. Internal modules (absolute paths)
4. Internal modules (relative paths)

```javascript
// 1. Node.js built-ins
import fs from 'node:fs';
import path from 'node:path';

// 2. External dependencies
import Decimal from 'decimal.js';

// 3. Internal modules
import { Matrix } from './matrix.js';
import { Vector } from './vector.js';
import * as Transforms2D from './transforms2d.js';
```

### Export Order

At end of file, group exports by category with comments:

```javascript
export {
  // Category 1: Cleanup (5)
  cleanupIds,
  cleanupNumericValues,
  cleanupListOfValues,
  cleanupAttributes,
  cleanupEnableBackground,

  // Category 2: Remove (25)
  removeComments,
  removeMetadata,
  // ...

  // Category 3: Convert (6)
  convertColors,
  convertTransform,
  // ...
};
```

### Blank Lines

- 2 blank lines between top-level declarations (functions, classes, exports)
- 1 blank line between logical sections within functions
- No trailing blank lines at end of file
- No multiple consecutive blank lines

```javascript
// CORRECT
export function firstFunction() {
  const x = 10;

  if (x > 5) {
    return true;
  }

  return false;
}


export function secondFunction() {
  return 42;
}
```

### Comments

Use JSDoc for all exported functions. Use `//` for inline comments.

```javascript
/**
 * Parse SVG path data string to command array.
 *
 * @param {string} d - Path data string (e.g., "M0 0 L10 10")
 * @param {Object} [options] - Parsing options
 * @param {number} [options.precision=6] - Decimal precision
 * @returns {Array<Object>} Array of path command objects
 *
 * @example
 * const commands = parsePath('M0 0 L10 10 Z');
 * // [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 10 }, { type: 'Z' }]
 */
export function parsePath(d, options = {}) {
  // Normalize whitespace before parsing
  const normalized = d.trim();

  // Parse into tokens
  const tokens = tokenize(normalized);

  return tokens;
}
```

---

## Documentation Requirements

### JSDoc for All Exports

Every exported function, class, and constant must have JSDoc:

```javascript
/**
 * Short description (one line).
 *
 * Longer description if needed. Explain what the function does,
 * not how it does it. Document edge cases and special behavior.
 *
 * @param {Type} paramName - Parameter description
 * @param {Object} [options] - Optional parameters object
 * @param {number} [options.precision=6] - Description with default
 * @returns {ReturnType} Description of return value
 * @throws {Error} When and why errors are thrown
 *
 * @example
 * // Basic usage
 * const result = functionName(input);
 *
 * @example
 * // With options
 * const result = functionName(input, { precision: 3 });
 */
```

### README Updates

If your change adds or modifies public API:

1. Update the relevant section in README.md
2. Add usage examples
3. Document any breaking changes

---

## Testing Requirements

### All PRs Must Pass Tests

```bash
npm test
```

### Test Coverage

- New functions: Add tests covering normal cases and edge cases
- Bug fixes: Add regression test that would have caught the bug
- Refactors: Existing tests must continue to pass

### Test File Location

Tests go in `test/` directory. Name test files to match source:

```
src/svg-parser.js     -> test/svg-parser.test.js
src/matrix.js         -> test/matrix.test.js
```

### Test Structure

```javascript
// Group related tests
console.log('\n=== FunctionName Tests ===\n');

// Individual test with clear description
const result = functionName(input);
assert(result === expected, 'functionName: handles normal input');

// Test edge cases
assert(functionName('') === null, 'functionName: returns null for empty string');
assert(functionName(null) === null, 'functionName: returns null for null input');
```

---

## SVG-Toolbox Testing Matrix

The **svg-toolbox testing matrix** is a mandatory comprehensive test framework that validates all svg-toolbox functions against all SVG sample files. This matrix ensures that every function works correctly across diverse real-world SVG content.

### Matrix Concept

The testing matrix is a grid where:
- **ROWS** = svg-toolbox functions (currently 69 functions across 8 categories)
- **COLUMNS** = SVG sample files (pre-embed and post-embed variants)
- **CELLS** = Individual test results (function applied to SVG file)

```
                    SVG Sample Files (COLUMNS)
                    +-----------+-----------+-----------+
                    | 8bits-pre | 8bits-post| future... |
    +---------------+-----------+-----------+-----------+
    | cleanupIds    |   PASS    |   PASS    |    ...    |
F   +---------------+-----------+-----------+-----------+
U   | removeDoctype |   PASS    |   PASS    |    ...    |
N   +---------------+-----------+-----------+-----------+
C   | convertColors |   PASS    |   PASS    |    ...    |
T   +---------------+-----------+-----------+-----------+
I   | flattenAll    |   PASS    |   PASS    |    ...    |
O   +---------------+-----------+-----------+-----------+
N   | embedExternal |   PASS    |   PASS    |    ...    |
S   +---------------+-----------+-----------+-----------+
    | ... (69 rows) |    ...    |    ...    |    ...    |
(ROWS)
```

### MANDATORY: Adding a New Function (New ROW)

When you add a new function to `src/svg-toolbox.js`, you **MUST** complete ALL of the following steps:

#### Step 1: Add Function to Test Matrix Configuration

Edit `test/test-toolbox-matrix-8bits.js` and add your function to the appropriate category in `TOOLBOX_FUNCTIONS`:

```javascript
const TOOLBOX_FUNCTIONS = {
  'Category 1: Cleanup': [
    'cleanupIds',
    // ... existing functions ...
    'yourNewCleanupFunction',  // <-- ADD HERE if cleanup function
  ],
  'Category 2: Removal': [
    // ... existing functions ...
    'yourNewRemovalFunction',  // <-- ADD HERE if removal function
  ],
  // ... other categories ...
};
```

#### Step 2: Add Special Parameters (If Required)

If your function requires specific parameters for testing, add them to `SPECIAL_PARAMS`:

```javascript
const SPECIAL_PARAMS = {
  // Existing entries...
  yourNewFunction: {
    parameterName: 'value',
    anotherParam: true,
  },
};
```

#### Step 3: Handle Data-Returning Functions

If your function returns data instead of modifying the SVG document, add it to `DATA_RETURNING_FUNCTIONS`:

```javascript
const DATA_RETURNING_FUNCTIONS = [
  'validateXML',
  'validateSVG',
  // ... existing entries ...
  'yourNewDataFunction',  // <-- ADD if returns data
];
```

#### Step 4: Add Special Test Handling (If Required)

If your function needs custom test logic, add handling in the `testFunction()` function:

```javascript
// Handle special case for yourNewFunction
if (funcName === 'yourNewFunction') {
  const result = await func(svgString, params);
  // Custom validation logic
  return { status: 'passed', result: 'Description of result' };
}
```

#### Step 5: Run the Complete Matrix Test

```bash
node test/test-toolbox-matrix-8bits.js
```

#### Step 6: Verify ALL Cells Pass

Your new function (row) must pass on ALL SVG sample files (columns):

```
Category X: YourCategory
----------------------------------------
  ✅ yourNewFunction
```

**ALL cells in the new row MUST pass before your PR can be merged.**

### MANDATORY: Modifying an Existing Function

When you modify ANY existing function in `src/svg-toolbox.js`, even for minor changes, you **MUST**:

#### Step 1: Run the Complete Matrix Test

```bash
node test/test-toolbox-matrix-8bits.js
```

#### Step 2: Verify the Modified Function's Row

Check that ALL cells in the function's row still pass:

```
✅ yourModifiedFunction  (Pre-Embed SVG)
✅ yourModifiedFunction  (Post-Embed SVG)
```

#### Step 3: Check for Regressions

Ensure your change did not break any other functions. The entire matrix must remain green.

**If ANY cell fails, you must fix the issue before your PR can be merged.**

### MANDATORY: Adding a New SVG Sample File (New COLUMN)

When you add a new SVG sample file to the test suite, you **MUST**:

#### Step 1: Add the SVG File

Place your SVG file in the appropriate directory:

```bash
# For external dependency samples
samples/SVG_WITH_EXTERNAL_DEPENDENCIES/your-new-sample.svg

# For W3C conformance tests
tests/samples/svg11_w3c/your-test-file.svg

# For SVG 2.0 feature tests
tests/samples/svg2/your-svg2-feature.svg
```

#### Step 2: Update the Matrix Test Configuration

Edit `test/test-toolbox-matrix-8bits.js` to include the new file:

```javascript
// Add new SVG path
const NEW_SAMPLE_PATH = path.join(SAMPLE_DIR, 'your-new-sample.svg');

// Add results tracking
const results = {
  preEmbed: { passed: 0, failed: 0, skipped: 0, errors: [] },
  postEmbed: { passed: 0, failed: 0, skipped: 0, errors: [] },
  newSample: { passed: 0, failed: 0, skipped: 0, errors: [] },  // <-- ADD
};

// Add test execution in runTests()
const newSampleSvg = await fs.readFile(NEW_SAMPLE_PATH, 'utf8');
const newSampleResults = await testAllFunctionsOnSVG(
  newSampleSvg,
  'newSample',
  'your-new-sample.svg (NEW SAMPLE)'
);
```

#### Step 3: Run the Complete Matrix Test

```bash
node test/test-toolbox-matrix-8bits.js
```

#### Step 4: Verify ALL Cells in the New Column Pass

All 69 functions must pass on your new SVG file:

```
Testing your-new-sample.svg (NEW SAMPLE)
============================================================

Category 1: Cleanup
----------------------------------------
  ✅ cleanupIds
  ✅ cleanupNumericValues
  ... (all must show ✅)
```

**ALL 69 cells in the new column MUST pass before your PR can be merged.**

### MANDATORY: Modifying an Existing SVG Sample File

When you modify ANY existing SVG sample file, even for minor changes, you **MUST**:

#### Step 1: Run the Complete Matrix Test

```bash
node test/test-toolbox-matrix-8bits.js
```

#### Step 2: Verify the Modified File's Column

Check that ALL 69 functions still pass on the modified SVG file.

#### Step 3: Check for Regressions

Ensure your change did not break tests that previously passed.

**If ANY cell fails, you must revert or fix your changes before your PR can be merged.**

### Current Matrix Categories (69 Functions)

| Category | Count | Functions |
|----------|-------|-----------|
| 1: Cleanup | 11 | cleanupIds, cleanupNumericValues, cleanupListOfValues, cleanupAttributes, cleanupEnableBackground, removeUnknownsAndDefaults, removeNonInheritableGroupAttrs, removeUselessDefs, removeHiddenElements, removeEmptyText, removeEmptyContainers |
| 2: Removal | 12 | removeDoctype, removeXMLProcInst, removeComments, removeMetadata, removeTitle, removeDesc, removeEditorsNSData, removeEmptyAttrs, removeViewBox, removeXMLNS, removeRasterImages, removeScriptElement |
| 3: Conversion | 10 | convertShapesToPath, convertPathData, convertTransform, convertColors, convertStyleToAttrs, convertEllipseToCircle, collapseGroups, mergePaths, moveGroupAttrsToElems, moveElemsAttrsToGroup |
| 4: Optimization | 8 | minifyStyles, inlineStyles, sortAttrs, sortDefsChildren, reusePaths, removeOffCanvasPath, removeStyleElement, removeXlink |
| 5: Adding/Modification | 7 | addAttributesToSVGElement, addClassesToSVGElement, prefixIds, removeDimensions, removeAttributesBySelector, removeAttrs, removeElementsByAttr |
| 6: Presets | 4 | presetDefault, presetNone, applyPreset, optimize |
| 7: Bonus | 15 | flattenClipPaths, flattenMasks, flattenGradients, flattenPatterns, flattenFilters, flattenUseElements, flattenAll, validateXML, validateSVG, fixInvalidSVG, simplifyPath, decomposeTransform, optimizeAnimationTiming, optimizePaths, simplifyPaths |
| 8: Embedding | 2 | embedExternalDependencies, exportEmbeddedResources |

### Current SVG Sample Files (2 Columns)

| File | Description | Size |
|------|-------------|------|
| 8bitsdrummachine+fonts.svg | Complex SVG with external dependencies (fonts, images, CSS) | ~150KB |
| 8bitsdrummachine-embedded.svg | Self-contained SVG with all resources embedded inline | ~2MB |

### Running the Matrix Test

```bash
# Full matrix test (69 functions x 2 SVG files = 138 cells)
node test/test-toolbox-matrix-8bits.js

# Results are written to:
# test/output/toolbox-matrix-8bits-results.json
```

### Matrix Test Output Format

```
======================================================================
Comprehensive Toolbox Function Matrix Test
Testing ALL functions on 8bitsdrummachine SVG (pre and post embed)
======================================================================

Loaded pre-embed SVG: 150.2 KB
Loaded post-embed SVG: 2048.5 KB

Testing 69 functions on each SVG...

Testing 8bitsdrummachine+fonts.svg (PRE-EMBED)
============================================================

Category 1: Cleanup
----------------------------------------
  ✅ cleanupIds
  ✅ cleanupNumericValues
  ...

Category 2: Removal
----------------------------------------
  ✅ removeDoctype
  ...

[... all 8 categories ...]

======================================================================
TEST SUMMARY
======================================================================

Pre-Embed SVG Results:
  Passed:  69
  Failed:  0
  Skipped: 0

Post-Embed SVG Results:
  Passed:  69
  Failed:  0
  Skipped: 0

Total time: 45.23s

ALL TESTS PASSED
```

### Success Criteria

The matrix test is **successful** only when:

1. **ALL 138 cells pass** (69 functions x 2 SVG files)
2. **Zero failures** in any category
3. **Zero errors or exceptions**
4. Exit code is `0`

### Failure Handling

If any cell fails:

1. **Read the error message** - The test output shows which function failed and why
2. **Check the function implementation** - Review `src/svg-toolbox.js`
3. **Check SPECIAL_PARAMS** - Verify the function has correct test parameters
4. **Check DATA_RETURNING_FUNCTIONS** - Ensure functions are correctly categorized
5. **Fix the issue** - Make necessary corrections
6. **Re-run the matrix test** - Repeat until ALL cells pass

### PR Checklist for svg-toolbox Changes

Before submitting a PR that touches `src/svg-toolbox.js`:

- [ ] Ran `node test/test-toolbox-matrix-8bits.js`
- [ ] ALL 138 cells show PASS
- [ ] Zero failures in output
- [ ] Results JSON at `test/output/toolbox-matrix-8bits-results.json` shows 0 failures
- [ ] If adding new function: Added to `TOOLBOX_FUNCTIONS` in correct category
- [ ] If adding new function: Added to `SPECIAL_PARAMS` if needed
- [ ] If adding new function: Added to `DATA_RETURNING_FUNCTIONS` if needed
- [ ] If adding new SVG: Updated matrix test to include new column
- [ ] If adding new SVG: ALL 69 functions pass on new SVG

**PRs that fail the matrix test will be automatically rejected.**

### Automated Testing with Claude Agent

This project includes a specialized **svg-toolbox-matrix-tester** Claude Agent that automates the complete matrix testing process. The agent is located at `.claude/agents/svg-toolbox-matrix-tester.md`.

#### When to Use the Agent

The matrix tester agent **MUST** be invoked:

1. **After adding a new function** to `src/svg-toolbox.js`
2. **After modifying any existing function** in `src/svg-toolbox.js`
3. **After adding a new SVG sample file** to the test suite
4. **After modifying any existing SVG sample file**
5. **Before creating any PR** that touches svg-toolbox.js
6. **Before any release or publish** of the SVG-MATRIX library

#### How to Invoke the Agent

When working with Claude Code, request the matrix test by asking:

```
Run the svg-toolbox testing matrix
```

Or explicitly invoke the agent:

```
Use the svg-toolbox-matrix-tester agent to validate all functions
```

The agent will:
1. Execute `node test/test-toolbox-matrix-8bits.js`
2. Analyze the results from all 138 cells (69 functions x 2 SVG files)
3. Report the status of each category
4. Identify any failures with detailed error messages
5. Provide guidance on fixing failures

#### Agent Output Format

The agent reports results in a standardized matrix format:

```
SVG-Toolbox Testing Matrix Results
==================================

| Category                | Functions | Pre-Embed | Post-Embed |
|-------------------------|-----------|-----------|------------|
| 1: Cleanup              | 11        | 11/11     | 11/11      |
| 2: Removal              | 12        | 12/12     | 12/12      |
| 3: Conversion           | 10        | 10/10     | 10/10      |
| 4: Optimization         | 8         | 8/8       | 8/8        |
| 5: Adding/Modification  | 7         | 7/7       | 7/7        |
| 6: Presets              | 4         | 4/4       | 4/4        |
| 7: Bonus                | 15        | 15/15     | 15/15      |
| 8: Embedding            | 2         | 2/2       | 2/2        |
| **TOTAL**               | **69**    | **69/69** | **69/69**  |

Total Cells: 138 (69 functions x 2 SVG files)
Passed: 138
Failed: 0

Status: ALL PASS ✓
```

### PUBLISHING GATE: Zero Tolerance Policy

**The SVG-MATRIX library MUST NOT be published unless the testing matrix is fully green.**

#### Absolute Requirements Before Publishing

| Requirement | Status Required |
|-------------|-----------------|
| Total matrix cells | ALL must be PASS |
| Failed cells | ZERO allowed |
| WIP (Work In Progress) cells | ZERO allowed |
| Skipped cells | Must be justified and documented |
| Error cells | ZERO allowed |
| Exit code | Must be `0` |

#### Publishing Blockers

The following conditions **BLOCK** any release or npm publish:

1. **ANY failed cell** - Even a single failure blocks publishing
2. **ANY WIP cell** - Incomplete implementations block publishing
3. **ANY error during testing** - Exceptions or crashes block publishing
4. **Missing function in matrix** - All exported functions must be tested
5. **Missing SVG sample column** - All sample files must be tested

#### Pre-Release Checklist

Before running `npm publish` or creating a release tag:

- [ ] Run the svg-toolbox-matrix-tester agent
- [ ] Verify output shows "Status: ALL PASS"
- [ ] Verify "Failed: 0" in summary
- [ ] Verify exit code is `0`
- [ ] Check `test/output/toolbox-matrix-8bits-results.json` shows zero failures
- [ ] All new functions have been added to `TOOLBOX_FUNCTIONS`
- [ ] All new SVG samples have been added as columns
- [ ] No cells are marked as WIP or TODO

#### Enforcement

```bash
# This command MUST succeed with exit code 0 before any publish
node test/test-toolbox-matrix-8bits.js

# Check exit code
echo $?  # Must be 0

# Verify JSON results
cat test/output/toolbox-matrix-8bits-results.json | grep '"failed"'
# Must show: "failed": 0 for both preEmbed and postEmbed
```

#### CI/CD Integration

The matrix test is integrated into the CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
jobs:
  matrix-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Run SVG-Toolbox Testing Matrix
        run: node test/test-toolbox-matrix-8bits.js
      # Publishing only happens if matrix test passes

  publish:
    needs: matrix-test  # Depends on matrix-test success
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - run: npm publish
```

**No exceptions. No workarounds. No partial passes. The matrix must be 100% green.**

### Handling Matrix Failures

When the agent reports failures:

#### Step 1: Identify the Failing Cell

```
Category 3: Conversion
----------------------------------------
  ✅ convertShapesToPath
  ✅ convertPathData
  ❌ convertColors: Cannot read property 'getAttribute' of null
  ✅ convertStyleToAttrs
```

#### Step 2: Reproduce Locally

```bash
# Run the full matrix test
node test/test-toolbox-matrix-8bits.js

# Check the specific error in output
```

#### Step 3: Debug the Function

```javascript
// In src/svg-toolbox.js, find the failing function
export const convertColors = createOperation((doc, options = {}) => {
  // Add debugging or fix the issue
});
```

#### Step 4: Re-run Until Green

```bash
# After fixing, re-run the matrix test
node test/test-toolbox-matrix-8bits.js

# Verify the cell now passes
# ✅ convertColors
```

#### Step 5: Verify Full Matrix

Even after fixing one cell, ensure ALL other cells still pass. Never assume a fix doesn't have side effects.

### Matrix Test File Locations

| File | Purpose |
|------|---------|
| `test/test-toolbox-matrix-8bits.js` | Main matrix test runner |
| `test/output/toolbox-matrix-8bits-results.json` | JSON results output |
| `.claude/agents/svg-toolbox-matrix-tester.md` | Claude Agent instructions |
| `samples/SVG_WITH_EXTERNAL_DEPENDENCIES/` | SVG sample files |

---

## Commit Message Format

### Structure

```
<type>: <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes bug nor adds feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |

### Subject Rules

- Imperative mood ("add" not "added" or "adds")
- No capitalization of first letter
- No period at end
- Max 50 characters

### Examples

```
feat: add flattenUseElements function

fix: resolve WeakMap iteration error in inlineStyles

docs: update API naming conventions in CONTRIBUTING.md

refactor: rename preset_default to presetDefault

test: add regression test for arc serialization bug
```

---

## Pull Request Process

### Before Submitting

1. **Fork and branch**: Create feature branch from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Follow conventions**: Apply all style and naming rules

3. **Run tests**: Ensure all tests pass
   ```bash
   npm test
   ```

4. **Update docs**: Add JSDoc, update README if needed

5. **Self-review**: Check your diff for:
   - Naming convention compliance
   - Proper formatting
   - No debug code or console.logs
   - No commented-out code

### PR Title Format

Same as commit message format:

```
feat: add support for SVG 2.0 mesh gradients
fix: correct transform composition order
docs: add examples for flatten pipeline
```

### PR Description Template

```markdown
## Summary

Brief description of changes (2-3 sentences).

## Changes

- List specific changes
- One item per change
- Use imperative mood

## Testing

- [ ] All existing tests pass
- [ ] Added tests for new functionality
- [ ] Tested manually with sample files

## Breaking Changes

None / List any breaking changes

## Related Issues

Fixes #123
Related to #456
```

### After Submitting

1. Respond to review feedback promptly
2. Push fixes as new commits (don't force-push during review)
3. Squash commits when approved (if requested)

---

## Review Criteria

PRs are evaluated on:

### Must Have

- [ ] All tests pass
- [ ] Follows naming conventions exactly
- [ ] Follows formatting rules exactly
- [ ] Has JSDoc for all exports
- [ ] No linting errors
- [ ] Commit messages follow format

### Should Have

- [ ] Adds tests for new code
- [ ] Updates relevant documentation
- [ ] Clean, readable diff
- [ ] No unrelated changes

### Automatic Rejection

PRs will be rejected if:

- Tests fail
- Naming conventions violated (e.g., `validateSvg` instead of `validateSVG`)
- Snake_case used in JavaScript (e.g., `preset_default`)
- Missing JSDoc on exports
- Contains `console.log` debugging statements
- Contains commented-out code
- Mixes tabs and spaces

---

## Questions?

Open an issue with the `question` label or reach out to maintainers.

---

*Last updated: 2025-12-15*
