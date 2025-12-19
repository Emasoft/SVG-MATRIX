# CLAUDE.local.md - SVG-MATRIX Testing Instructions

AI Agent instructions for testing SVG-MATRIX library functions.

## Purpose

This file provides instructions for AI agents testing SVG-MATRIX library functions against W3C SVG test suites. All functions must pass rigorous validation with zero tolerance for data corruption.

## Test Infrastructure

### Test Runner

Universal test runner for all svg-toolbox functions:
- **Location**: `/tests/utils/svg-function-test-runner.mjs`
- **Language**: Node.js ESM
- **Purpose**: Tests any function against SVG 1.1 or SVG 2.0 suites with comprehensive validation

### Test Suites

**SVG 1.1 W3C Suite**:
- **Location**: `/tests/samples/svg11_w3c/`
- **Count**: 525 SVG files
- **Source**: W3C SVG 1.1 Test Suite
- **Results**: `/tests/results/svg11/<functionName>/`

**SVG 2.0 Suite**:
- **Location**: `/tests/samples/svg2/`
- **Count**: 39 SVG files
- **Source**: SVG 2.0 Test Suite
- **Results**: `/tests/results/svg2/<functionName>/`

### Results Structure

```
tests/results/
├── svg11/
│   └── <functionName>/
│       ├── passed/          # Successfully processed files
│       ├── failed/          # Failed files + .errors.txt
│       └── test-report.json # JSON test report
└── svg2/
    └── <functionName>/
        ├── passed/
        ├── failed/
        └── test-report.json
```

### Test Report Format

```json
{
  "timestamp": "2025-12-13T14:59:00.000Z",
  "function": "optimize",
  "suite": "SVG 2.0",
  "total": 39,
  "passed": 39,
  "failed": 0,
  "skipped": 0,
  "errors": [],
  "validationFailures": [],
  "stats": {
    "avgProcessingTime": 42.5,
    "totalProcessingTime": 1657.5,
    "totalDuration": 2134
  }
}
```

## How to Test Functions

### Single Function Test

```bash
# Test against SVG 1.1 suite (default, 525 files)
node tests/utils/svg-function-test-runner.mjs <functionName>

# Test against SVG 2.0 suite (39 files)
node tests/utils/svg-function-test-runner.mjs <functionName> --suite svg2

# Test against both suites (564 files total)
node tests/utils/svg-function-test-runner.mjs <functionName> --suite all
```

### Examples

```bash
# Test optimize function against all suites
node tests/utils/svg-function-test-runner.mjs optimize --suite all

# Test cleanupIds against SVG 1.1 only
node tests/utils/svg-function-test-runner.mjs cleanupIds

# Test convertColors against SVG 2.0 only
node tests/utils/svg-function-test-runner.mjs convertColors --suite svg2
```

## ZERO TOLERANCE Validation Policy

Every test applies strict validation with ZERO TOLERANCE for:

### 1. Data Corruption (CRITICAL)
- **0% "undefined" introduction**: No `undefined` strings in output
- **0% "null" introduction**: No `null` values in attributes or text
- **0% "NaN" introduction**: No `NaN` in numeric attributes
- **Violation**: Automatic FAIL

### 2. Reference Integrity (CRITICAL)
- **0% broken references created**: All `url(#id)`, `href="#id"`, `xlink:href="#id"` must resolve
- **Pre-existing broken refs**: Allowed (but warned)
- **New broken refs**: Automatic FAIL

### 3. XML Structure (CRITICAL)
- **0% XML structure degradation**: Tag balance must not worsen
- **0% namespace loss**: SVG namespace must be preserved
- **0% xlink corruption**: xlink namespace required if xlink: attributes present
- **Violation**: Automatic FAIL

### 4. Document Integrity
- **SVG root element**: Must be preserved
- **Empty output**: Output < 50 bytes triggers FAIL
- **Size validation**: Reasonable output size expected

### Validation Checks Applied

The test runner validates each output:

```javascript
// 1. Check for undefined/null/NaN corruption
if (processed.includes('undefined') && !original.includes('undefined')) {
  FAIL('Introduced "undefined"');
}

// 2. XML structure validation
const openTags = count('<tag>');
const closeTags = count('</tag>');
if (balance(processed) > balance(original)) {
  FAIL('XML structure degraded');
}

// 3. SVG namespace preservation
if (!processed.includes('xmlns="http://www.w3.org/2000/svg"')) {
  FAIL('Lost SVG namespace');
}

// 4. Reference integrity
const brokenRefs = findBrokenReferences(processed);
const newBroken = brokenRefs.filter(notInOriginal);
if (newBroken.length > 0) {
  FAIL(`Created broken references: ${newBroken.join(', ')}`);
}

// 5. xlink namespace check
if (hasXlinkAttributes(processed) && !hasXlinkNamespace(processed)) {
  FAIL('xlink: attributes without xmlns:xlink');
}

// 6. SVG root element
if (!processed.match(/<svg[\s>]/i)) {
  FAIL('SVG root element missing');
}

// 7. Empty output check
if (processed.trim().length < 50) {
  FAIL(`Output too small: ${processed.length} bytes`);
}
```

## All 71 Functions to Test

### Removal Functions (15)
- `removeComments` - Remove XML comments
- `removeDoctype` - Remove DOCTYPE declarations
- `removeXMLProcInst` - Remove XML processing instructions
- `removeMetadata` - Remove `<metadata>` elements
- `removeTitle` - Remove `<title>` elements
- `removeDesc` - Remove `<desc>` elements
- `removeEditorsNSData` - Remove editor namespace data
- `removeEmptyText` - Remove empty text nodes
- `removeEmptyAttrs` - Remove empty attributes
- `removeEmptyContainers` - Remove empty `<g>`, `<defs>`, etc.
- `removeViewBox` - Remove viewBox attribute
- `removeXMLNS` - Remove xmlns declarations
- `removeHiddenElements` - Remove elements with display:none or visibility:hidden
- `removeRasterImages` - Remove `<image>` elements
- `removeScriptElement` - Remove `<script>` elements

### Conversion Functions (9)
- `convertColors` - Convert colors to optimal format (hex/rgb/named)
- `convertPathData` - Convert path data to compact format
- `convertShapesToPath` - Convert shapes (rect, circle, etc.) to paths
- `convertTransform` - Convert transform attributes
- `convertStyleToAttrs` - Convert inline styles to attributes
- `convertEllipseToCircle` - Convert ellipses to circles where possible
- `convertEllipseToPath` - Convert ellipses to path elements
- `convertCircleToPath` - Convert circles to path elements
- `convertRectToPath` - Convert rectangles to path elements

### Optimization Functions (12)
- `optimize` - Main optimization pipeline (preset-based)
- `optimizePaths` - Optimize path data (precision, commands)
- `simplifyPath` - Simplify path using Douglas-Peucker
- `simplifyPaths` - Simplify all paths in document
- `mergePaths` - Merge adjacent paths with same styles
- `reusePaths` - Extract reusable paths to `<defs>`
- `removeOffCanvasPath` - Remove paths outside canvas
- `collapseGroups` - Collapse unnecessary `<g>` elements
- `minifyStyles` - Minify CSS in `<style>` elements
- `inlineStyles` - Inline CSS rules to elements
- `optimizeAnimationTiming` - Optimize animation timing functions
- `decomposeTransform` - Decompose transforms to primitive operations

### Cleanup Functions (7)
- `cleanupIds` - Clean up ID attributes (remove unused, shorten)
- `cleanupNumericValues` - Clean up numeric precision
- `cleanupListOfValues` - Clean up space-separated numeric lists
- `cleanupAttributes` - Clean up attributes (defaults, duplicates)
- `cleanupEnableBackground` - Clean up enable-background attributes
- `removeUnknownsAndDefaults` - Remove unknown/default attributes
- `removeNonInheritableGroupAttrs` - Remove non-inheritable group attrs

### Flatten Functions (6)
- `flattenAll` - Flatten all defs (clips, masks, gradients, patterns, filters, use)
- `flattenClipPaths` - Inline clip-path definitions
- `flattenMasks` - Inline mask definitions
- `flattenGradients` - Inline gradient definitions
- `flattenPatterns` - Inline pattern definitions
- `flattenFilters` - Inline filter definitions
- `flattenUseElements` - Inline `<use>` element references

### Structure Manipulation Functions (6)
- `moveGroupAttrsToElems` - Move group attributes to child elements
- `moveElemsAttrsToGroup` - Move common element attributes to parent group
- `sortAttrs` - Sort attributes alphabetically
- `sortDefsChildren` - Sort `<defs>` children by usage
- `removeUselessDefs` - Remove unused definitions
- `removeDimensions` - Remove width/height from root `<svg>`

### Style Functions (2)
- `removeStyleElement` - Remove `<style>` elements
- `removeXlink` - Remove xlink namespace (SVG 2.0 upgrade)

### Modification Functions (5)
- `addAttributesToSVGElement` - Add attributes to root `<svg>`
- `addClassesToSVGElement` - Add classes to root `<svg>`
- `prefixIds` - Prefix all IDs with string
- `removeAttributesBySelector` - Remove attributes by CSS selector
- `removeAttrs` - Remove specific attributes
- `removeElementsByAttr` - Remove elements by attribute presence/value

### Preset Functions (3)
- `presetDefault` - Apply default optimization preset
- `presetNone` - Apply no optimizations
- `applyPreset` - Apply custom preset configuration

### Validation Functions (4)
- `validateXML` - Validate XML well-formedness
- `validateSVG` - Validate SVG spec compliance
- `validateSVGAsync` - Async version of validateSVG
- `fixInvalidSVG` - Attempt to fix invalid SVG

### Analysis Functions (3)
- `imageToPath` - Convert embedded images to path outlines
- `detectCollisions` - Detect element bounding box collisions
- `measureDistance` - Measure distances between elements

## Batch Testing All Functions

### Test All Functions Against SVG 1.1

```bash
#!/bin/bash
# Test all 71 functions against SVG 1.1 suite (525 files each)

FUNCTIONS=(
  # Removal (15)
  removeComments removeDoctype removeXMLProcInst removeMetadata
  removeTitle removeDesc removeEditorsNSData removeEmptyText
  removeEmptyAttrs removeEmptyContainers removeViewBox removeXMLNS
  removeHiddenElements removeRasterImages removeScriptElement

  # Conversion (9)
  convertColors convertPathData convertShapesToPath convertTransform
  convertStyleToAttrs convertEllipseToCircle

  # Optimization (12)
  optimize optimizePaths simplifyPath simplifyPaths mergePaths
  reusePaths removeOffCanvasPath collapseGroups minifyStyles
  inlineStyles optimizeAnimationTiming decomposeTransform

  # Cleanup (7)
  cleanupIds cleanupNumericValues cleanupListOfValues cleanupAttributes
  cleanupEnableBackground removeUnknownsAndDefaults removeNonInheritableGroupAttrs

  # Flatten (6)
  flattenAll flattenClipPaths flattenMasks flattenGradients
  flattenPatterns flattenFilters flattenUseElements

  # Structure (6)
  moveGroupAttrsToElems moveElemsAttrsToGroup sortAttrs
  sortDefsChildren removeUselessDefs removeDimensions

  # Style (2)
  removeStyleElement removeXlink

  # Modification (5)
  addAttributesToSVGElement addClassesToSVGElement prefixIds
  removeAttributesBySelector removeAttrs removeElementsByAttr

  # Presets (3)
  presetDefault presetNone applyPreset

  # Validation (4)
  validateXML validateSVG validateSVGAsync fixInvalidSVG

  # Analysis (3)
  imageToPath detectCollisions measureDistance
)

for func in "${FUNCTIONS[@]}"; do
  echo "Testing $func..."
  node tests/utils/svg-function-test-runner.mjs "$func" --suite svg11
  if [ $? -ne 0 ]; then
    echo "FAILED: $func"
  fi
done
```

### Test All Functions Against Both Suites

```bash
#!/bin/bash
# Test all 71 functions against both SVG 1.1 (525) and SVG 2.0 (39) suites
# Total: 71 functions x 564 files = 40,044 test cases

FUNCTIONS=(
  removeComments removeDoctype removeXMLProcInst removeMetadata
  removeTitle removeDesc removeEditorsNSData removeEmptyText
  removeEmptyAttrs removeEmptyContainers removeViewBox removeXMLNS
  removeHiddenElements removeRasterImages removeScriptElement
  convertColors convertPathData convertShapesToPath convertTransform
  convertStyleToAttrs convertEllipseToCircle
  optimize optimizePaths simplifyPath simplifyPaths mergePaths
  reusePaths removeOffCanvasPath collapseGroups minifyStyles
  inlineStyles optimizeAnimationTiming decomposeTransform
  cleanupIds cleanupNumericValues cleanupListOfValues cleanupAttributes
  cleanupEnableBackground removeUnknownsAndDefaults removeNonInheritableGroupAttrs
  flattenAll flattenClipPaths flattenMasks flattenGradients
  flattenPatterns flattenFilters flattenUseElements
  moveGroupAttrsToElems moveElemsAttrsToGroup sortAttrs
  sortDefsChildren removeUselessDefs removeDimensions
  removeStyleElement removeXlink
  addAttributesToSVGElement addClassesToSVGElement prefixIds
  removeAttributesBySelector removeAttrs removeElementsByAttr
  presetDefault presetNone applyPreset
  validateXML validateSVG validateSVGAsync fixInvalidSVG
  imageToPath detectCollisions measureDistance
)

TOTAL=${#FUNCTIONS[@]}
PASSED=0
FAILED=0

echo "========================================="
echo "Testing ${TOTAL} functions against both suites"
echo "Total test cases: $((TOTAL * 564))"
echo "========================================="

for func in "${FUNCTIONS[@]}"; do
  echo ""
  echo "[$((PASSED + FAILED + 1))/${TOTAL}] Testing $func..."

  if node tests/utils/svg-function-test-runner.mjs "$func" --suite all; then
    PASSED=$((PASSED + 1))
    echo "PASS: $func"
  else
    FAILED=$((FAILED + 1))
    echo "FAIL: $func"
  fi
done

echo ""
echo "========================================="
echo "FINAL RESULTS"
echo "========================================="
echo "Total functions: ${TOTAL}"
echo "Passed: ${PASSED}"
echo "Failed: ${FAILED}"
echo "Success rate: $(awk "BEGIN {printf \"%.2f\", ($PASSED/$TOTAL)*100}")%"
echo "========================================="
```

### Collect Results Summary

```bash
#!/bin/bash
# Collect and summarize all test results

echo "Test Results Summary"
echo "===================="
echo ""

for suite in svg11 svg2; do
  echo "$suite Results:"
  echo "---"

  for report in tests/results/$suite/*/test-report.json; do
    if [ -f "$report" ]; then
      func=$(basename $(dirname "$report"))
      passed=$(jq -r '.passed' "$report")
      total=$(jq -r '.total' "$report")
      pct=$(awk "BEGIN {printf \"%.1f\", ($passed/$total)*100}")

      if [ "$passed" -eq "$total" ]; then
        echo "PASS $func: $passed/$total ($pct%)"
      else
        echo "FAIL $func: $passed/$total ($pct%)"
      fi
    fi
  done
  echo ""
done
```

## Reading Test Reports

### Command-Line Report

```bash
# View JSON report
cat tests/results/svg11/optimize/test-report.json | jq

# Check pass/fail
jq -r '"\(.function): \(.passed)/\(.total) (\(.passed/.total*100|floor)%)"' \
  tests/results/svg11/optimize/test-report.json

# List validation failures
jq -r '.validationFailures[] | "\(.file): \(.errors | join(", "))"' \
  tests/results/svg11/optimize/test-report.json

# List errors
jq -r '.errors[] | "\(.file): \(.message)"' \
  tests/results/svg11/optimize/test-report.json
```

### Understanding Results

**PASS Status**: All tests passed, function is working correctly
- `passed === total`
- `failed === 0`
- `errors === []`
- `validationFailures === []`

**FAIL Status**: One or more tests failed validation
- Check `validationFailures` array for details
- Each entry contains:
  - `file`: Which SVG file failed
  - `errors`: Array of validation errors (ZERO TOLERANCE violations)
  - `warnings`: Array of warnings (pre-existing issues)

**ERROR Status**: Function threw an exception
- Check `errors` array for details
- Each entry contains:
  - `file`: Which SVG file caused error
  - `type`: "ERROR"
  - `message`: Exception message
- Error files are saved to `failed/<file>.error.txt` with full stack trace

## Testing Workflow for AI Agents

### 1. Before Testing
```bash
# Ensure test runner exists
ls -la tests/utils/svg-function-test-runner.mjs

# Ensure test suites exist
ls -la tests/samples/svg11_w3c/  # Should show 525 files
ls -la tests/samples/svg2/       # Should show 39 files

# Clean previous results (optional)
rm -rf tests/results/svg11/<functionName>
rm -rf tests/results/svg2/<functionName>
```

### 2. Run Test
```bash
# Test single function
node tests/utils/svg-function-test-runner.mjs <functionName> --suite all
```

### 3. Analyze Results
```bash
# Check reports
cat tests/results/svg11/<functionName>/test-report.json
cat tests/results/svg2/<functionName>/test-report.json

# Review failed files
ls -la tests/results/svg11/<functionName>/failed/
ls -la tests/results/svg2/<functionName>/failed/

# Read error details
cat tests/results/svg11/<functionName>/failed/*.errors.txt
cat tests/results/svg11/<functionName>/failed/*.error.txt
```

### 4. Fix Issues
- If ZERO TOLERANCE violations occur:
  - Read the source code of the function in `src/svg-toolbox.js`
  - Identify where undefined/null/NaN is introduced
  - Fix the code to prevent data corruption
  - Re-run tests

- If reference integrity violations occur:
  - Check ID cleanup/removal logic
  - Ensure IDs are not removed while still referenced
  - Update references if IDs are changed

- If XML structure violations occur:
  - Check element removal logic
  - Ensure closing tags are preserved
  - Validate DOM manipulation code

### 5. Verify Fix
```bash
# Re-run test
node tests/utils/svg-function-test-runner.mjs <functionName> --suite all

# Should see:
# PASS: <functionName>: 525/525 (100%) - SVG 1.1
# PASS: <functionName>: 39/39 (100%) - SVG 2.0
```

## Best Practices for AI Agents

1. **Always test against both suites**: Use `--suite all`
2. **Read error files**: Check `.errors.txt` and `.error.txt` files for details
3. **Fix root causes**: Do not add workarounds, fix the actual bug
4. **Verify namespace preservation**: SVG and xlink namespaces critical
5. **Check reference integrity**: Never create broken url(#id) references
6. **Prevent data corruption**: Zero tolerance for undefined/null/NaN
7. **Maintain XML structure**: Never degrade tag balance
8. **Test after fixes**: Always re-run tests to verify fix
9. **Document failures**: Log all ZERO TOLERANCE violations
10. **No exceptions**: 100% pass rate required for production

## Common Failure Patterns

### Pattern 1: Undefined Introduction
```javascript
// BAD: Can introduce 'undefined' string
element.setAttribute('id', someVariable);

// GOOD: Validate before setting
if (someVariable !== undefined && someVariable !== null) {
  element.setAttribute('id', someVariable);
}
```

### Pattern 2: Broken References
```javascript
// BAD: Remove ID without checking references
if (idUnused(id)) {
  element.removeAttribute('id');
}

// GOOD: Check all references first
const refs = findReferences(id);
if (refs.length === 0) {
  element.removeAttribute('id');
}
```

### Pattern 3: Namespace Loss
```javascript
// BAD: Create new element without namespace
const newSvg = doc.createElement('svg');

// GOOD: Preserve namespace
const newSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
```

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed or error occurred

Use exit code to determine success in automated workflows.
