# Test Infrastructure

This directory contains the comprehensive test infrastructure for the SVG-MATRIX library, featuring two extensive test suites with 564 real-world SVG files and automated validation tools.

## Overview

The test infrastructure validates SVG transformation and optimization functions against real-world SVG files from W3C conformance tests and modern SVG 2.0 feature samples. All tests enforce a ZERO TOLERANCE policy for any form of data corruption or structural damage.

The infrastructure currently includes:
- 525 W3C SVG 1.1 conformance test files
- 39 SVG 2.0 feature test files
- 71 tested functions from the SVG Toolbox
- Automated test runners with detailed validation
- Comprehensive logging and reporting

## Directory Structure

```
tests/
├── samples/
│   ├── svg11_w3c/        # 525 W3C SVG 1.1 conformance test files
│   └── svg2/             # 39 SVG 2.0 feature test files
├── results/
│   ├── passed/           # SVG files that passed validation
│   ├── failed/           # SVG files that failed validation
│   └── reports/          # Detailed test reports (JSON)
├── logs/                 # Test execution logs with timestamps
└── utils/
    └── svg-function-test-runner.mjs  # Automated test runner script
```

### Test Samples

**samples/svg11_w3c/** - Contains 525 files from the W3C SVG 1.1 Test Suite covering:
- Basic shapes and paths
- Transforms and gradients
- Filters and animations
- Text rendering and fonts
- Clipping and masking
- Scripting and interactivity
- All edge cases from SVG 1.1 specification

**samples/svg2/** - Contains 39 files testing SVG 2.0 features:
- mesh-gradient.svg - Mesh gradient rendering
- hatch-patterns.svg - Hatch pattern fills
- context-paint.svg - Context-fill and context-stroke
- href-without-xlink.svg - Modern href attribute
- transform-origin.svg - Transform origin property
- paint-order.svg - Paint order control
- text-wrapping.svg - Text wrapping and shaping
- z-index.svg - Z-index layering
- css-variables.svg - CSS custom properties
- data-attributes.svg - Data attribute handling
- And 29 additional modern SVG 2.0 features

## Running Tests

### Basic Usage

Test a single function against the SVG 1.1 suite (default):

```bash
node tests/utils/svg-function-test-runner.mjs optimize
```

### Suite Selection

Test against the SVG 2.0 suite:

```bash
node tests/utils/svg-function-test-runner.mjs optimize --suite svg2
```

Test against both suites:

```bash
node tests/utils/svg-function-test-runner.mjs optimize --suite all
```

### Available Functions

The test runner supports all 71 functions from the SVG Toolbox, including:

**Core Transforms:**
- optimize, cleanPaths, simplifyTransforms, mergeTransforms
- removeRedundantGroups, flattenGroups, inlineStyles

**Precision Operations:**
- roundCoordinates, normalizeViewBox, normalizeColors

**Structural:**
- removeComments, removeMetadata, removeHiddenElements
- sortAttributes, deduplicateGradients

**And 54 more functions** - see `src/svg-toolbox.mjs` for the complete list.

## Validation Criteria

The test infrastructure enforces a ZERO TOLERANCE policy. Every SVG file processed by a function must pass all of the following validation checks:

### 1. Data Integrity

**No undefined/null/NaN corruption:**
- All attribute values must be valid strings or numbers
- No undefined, null, or NaN values anywhere in the output
- All numeric values must be finite and well-formed

**XML structure preserved:**
- Valid XML syntax (balanced tags, proper nesting)
- No malformed attributes or broken elements
- Proper character escaping and entity handling

**SVG namespace preserved:**
- Root svg element must have xmlns="http://www.w3.org/2000/svg"
- Namespace declarations must be preserved
- XLink namespace preserved when xlink: attributes present

### 2. Reference Integrity

All internal references must remain valid after processing:

**url() references:**
- `fill="url(#gradient1)"` must reference existing element with id="gradient1"
- `filter="url(#blur)"` must reference existing filter element
- `clip-path="url(#clipPath)"` must reference existing clipPath element

**href references:**
- `href="#symbol1"` (SVG 2.0 style) must reference existing element
- `xlink:href="#pattern"` (SVG 1.1 style) must reference existing element
- Both styles supported and validated

**ID uniqueness:**
- All id attributes must be unique within the document
- Referenced IDs must exist somewhere in the document

### 3. Structural Validation

**Element hierarchy:**
- Elements must be in valid parent-child relationships per SVG spec
- Required child elements must be present (e.g., gradients need stops)

**Attribute validity:**
- Attribute values must conform to their type (numbers, lengths, colors, etc.)
- Enumerated attributes must use valid values

## Test Results

The test infrastructure has achieved 100% pass rate across all test files:

**SVG 1.1 Suite:**
- 525 files tested
- 71 functions validated
- 37,275 total test executions (525 files x 71 functions)
- 0 failures

**SVG 2.0 Suite:**
- 39 files tested
- 71 functions validated
- 2,769 total test executions (39 files x 71 functions)
- 0 failures

**Combined:**
- 564 total files
- 40,044 total test executions
- 100% pass rate

## Test Output

### Results Directory

**results/passed/** - Contains successfully processed SVG files organized by function name:
```
results/passed/optimize/file1.svg
results/passed/cleanPaths/file1.svg
```

**results/failed/** - Contains failed SVG files with error information:
```
results/failed/functionName/file1.svg
results/failed/functionName/file1.error.txt
```

**results/reports/** - Contains JSON reports with detailed statistics:
```json
{
  "function": "optimize",
  "suite": "svg11_w3c",
  "total": 525,
  "passed": 525,
  "failed": 0,
  "timestamp": "2025-12-13T10:30:00.000Z",
  "failures": []
}
```

### Logs Directory

All test executions write detailed logs to `tests/logs/` with timestamps:

```
tests/logs/test-optimize-svg11_w3c-20251213-103000.log
tests/logs/test-optimize-svg2-20251213-110000.log
```

Logs include:
- Test configuration and parameters
- File-by-file processing results
- Validation check details
- Error messages and stack traces for failures
- Performance metrics (files/second)
- Final summary statistics

## Error Analysis

When a test fails, the infrastructure provides:

1. **Error Classification:**
   - Data corruption (undefined/null/NaN)
   - Structure violation (malformed XML)
   - Reference breakage (broken url/href)
   - Validation failure (invalid attribute values)

2. **Detailed Context:**
   - Exact location of the error (line/column if applicable)
   - Original value vs corrupted value
   - Full element context showing the problem

3. **Reproduction Info:**
   - Original SVG file saved in results/failed/
   - Error details saved in .error.txt file
   - Full stack trace in log file

## Adding New Tests

To add new test files:

1. **SVG 1.1 files:** Add to `tests/samples/svg11_w3c/`
2. **SVG 2.0 files:** Add to `tests/samples/svg2/`

The test runner will automatically pick up new files on the next execution.

To test a new function:

```bash
node tests/utils/svg-function-test-runner.mjs yourNewFunction --suite all
```

The function must be exported from `src/svg-toolbox.mjs`.

## Continuous Integration

The test infrastructure is designed for CI/CD integration:

```bash
# Run all tests with strict validation
npm run ci-test

# Or run test runner for specific validation
node tests/utils/svg-function-test-runner.mjs optimize --suite all
```

Exit codes:
- 0: All tests passed
- 1: One or more tests failed

## Best Practices

1. **Always test against both suites** when developing new features
2. **Check the logs** for detailed error information when tests fail
3. **Preserve failed files** in results/failed/ for debugging
4. **Validate reference integrity** manually for complex transformations
5. **Test edge cases** by adding specific SVG files to the samples directory
6. **Monitor performance** using the files/second metrics in logs

## Known Limitations

- The test runner processes files sequentially (not parallel)
- Very large SVG files (>10MB) may require increased Node.js memory
- Some SVG 2.0 features may not be fully validated (bleeding edge spec)
- Animation elements are validated structurally but not executed

## Support

For issues with the test infrastructure:
1. Check the logs in `tests/logs/` for detailed error information
2. Review failed files in `tests/results/failed/`
3. Consult the validation criteria above
4. Open an issue on GitHub with the log file and failed SVG file

## SVG-Toolbox Testing Matrix

The **svg-toolbox testing matrix** is a comprehensive test structure that ensures all toolbox functions work correctly across all sample SVG files.

### Matrix Structure

```
                    SVG Sample Files (COLUMNS)
                    +-----------+-----------+-----------+-----+
                    | 8bits-pre | 8bits-post| w3c-svg11 | ... |
    +---------------+-----------+-----------+-----------+-----+
    | cleanupIds    |    PASS   |    PASS   |    PASS   | ... |
F   +---------------+-----------+-----------+-----------+-----+
U   | removeDoctype |    PASS   |    PASS   |    PASS   | ... |
N   +---------------+-----------+-----------+-----------+-----+
C   | convertColors |    PASS   |    PASS   |    PASS   | ... |
T   +---------------+-----------+-----------+-----------+-----+
I   | embedExternal |    PASS   |    PASS   |    PASS   | ... |
O   +---------------+-----------+-----------+-----------+-----+
N   | exportEmbed   |    PASS   |    PASS   |    PASS   | ... |
S   +---------------+-----------+-----------+-----------+-----+
    | ...           |    ...    |    ...    |    ...    | ... |
(ROWS)
```

### Matrix Rules

**Adding a New Function (NEW ROW):**
1. Add the function to `svg-toolbox.js` with proper exports
2. Add it to the appropriate category in `test/test-toolbox-matrix-8bits.js`
3. Add any special parameters needed in `SPECIAL_PARAMS`
4. Run the full matrix test: `node test/test-toolbox-matrix-8bits.js`
5. ALL cells in the new row must pass before merging

**Adding a New SVG Sample File (NEW COLUMN):**
1. Add the SVG file to the appropriate samples directory
2. Update the matrix test to include the new file as a test column
3. Run the full matrix test against the new file
4. ALL cells in the new column must pass before merging

### Current Matrix Status

| Category | Functions | Pre-Embed SVG | Post-Embed SVG |
|----------|-----------|---------------|----------------|
| 1: Cleanup | 11 | 11/11 PASS | 11/11 PASS |
| 2: Removal | 12 | 12/12 PASS | 12/12 PASS |
| 3: Conversion | 10 | 10/10 PASS | 10/10 PASS |
| 4: Optimization | 8 | 8/8 PASS | 8/8 PASS |
| 5: Adding/Modification | 7 | 7/7 PASS | 7/7 PASS |
| 6: Presets | 4 | 4/4 PASS | 4/4 PASS |
| 7: Bonus | 15 | 15/15 PASS | 15/15 PASS |
| 8: Embedding | 2 | 2/2 PASS | 2/2 PASS |
| **TOTAL** | **69** | **69/69** | **69/69** |

### Running the Matrix Test

```bash
# Run the complete matrix test
node test/test-toolbox-matrix-8bits.js

# Results are saved to:
# test/output/toolbox-matrix-8bits-results.json
```

### Matrix Test Categories

1. **Category 1: Cleanup** (11 functions)
   - cleanupIds, cleanupNumericValues, cleanupListOfValues, cleanupAttributes
   - cleanupEnableBackground, removeUnknownsAndDefaults, removeNonInheritableGroupAttrs
   - removeUselessDefs, removeHiddenElements, removeEmptyText, removeEmptyContainers

2. **Category 2: Removal** (12 functions)
   - removeDoctype, removeXMLProcInst, removeComments, removeMetadata
   - removeTitle, removeDesc, removeEditorsNSData, removeEmptyAttrs
   - removeViewBox, removeXMLNS, removeRasterImages, removeScriptElement

3. **Category 3: Conversion** (10 functions)
   - convertShapesToPath, convertPathData, convertTransform, convertColors
   - convertStyleToAttrs, convertEllipseToCircle, collapseGroups, mergePaths
   - moveGroupAttrsToElems, moveElemsAttrsToGroup

4. **Category 4: Optimization** (8 functions)
   - minifyStyles, inlineStyles, sortAttrs, sortDefsChildren
   - reusePaths, removeOffCanvasPath, removeStyleElement, removeXlink

5. **Category 5: Adding/Modification** (7 functions)
   - addAttributesToSVGElement, addClassesToSVGElement, prefixIds
   - removeDimensions, removeAttributesBySelector, removeAttrs, removeElementsByAttr

6. **Category 6: Presets** (4 functions)
   - presetDefault, presetNone, applyPreset, optimize

7. **Category 7: Bonus** (15 functions)
   - flattenClipPaths, flattenMasks, flattenGradients, flattenPatterns
   - flattenFilters, flattenUseElements, flattenAll, validateXML, validateSVG
   - fixInvalidSVG, simplifyPath, decomposeTransform, optimizeAnimationTiming
   - optimizePaths, simplifyPaths

8. **Category 8: Embedding** (2 functions)
   - embedExternalDependencies, exportEmbeddedResources

## Version History

- **v1.0.28** - Added svg-toolbox testing matrix with 69 functions, 2 SVG columns
- **v1.0.20** - Initial test infrastructure with 564 files, 71 functions, 100% pass rate
- **v1.0.19** - Added SVG 2.0 test suite
- **v1.0.18** - Integrated W3C SVG 1.1 conformance tests
