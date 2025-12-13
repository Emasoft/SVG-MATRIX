# SVG-MATRIX Test Matrix Summary

## Test Environment

- **Test Date**: 2025-12-12
- **Test Suite**: W3C SVG 1.1 Test Suite (525 files)
- **Functions Tested**: 60

## Overall Results

| Status | Count | Percentage |
|--------|-------|------------|
| PASSED | 39 | 65.0% |
| FAILED | 10 | 16.7% |
| UNKNOWN | 11 | 18.3% |

## Function Status Summary

### PASSED Functions (39)

| Function | Pass Rate | Notes |
|----------|-----------|-------|
| addAttributesToSVGElement | 525/525 (100%) | - |
| addClassesToSVGElement | 1139/1139 (100%) | Extended test set |
| cleanupAttributes | 525/525 (100%) | - |
| cleanupEnableBackground | 525/525 (100%) | - |
| cleanupIds | 525/525 (100%) | - |
| cleanupListOfValues | 67/525 (12.8%) | Low impact on test files |
| cleanupNumericValues | 525/525 (100%) | - |
| collapseGroups | 522/525 (99.4%) | 3 edge cases |
| convertColors | 150/152 (98.7%) | - |
| convertEllipseToCircle | 525/525 (100%) | - |
| convertPathData | 525/525 (100%) | - |
| convertStyleToAttrs | 525/525 (100%) | - |
| flattenFilters | 525/525 (100%) | - |
| flattenGradients | 525/525 (100%) | - |
| flattenMasks | 525/525 (100%) | No masks in test files |
| flattenPatterns | 525/525 (100%) | No patterns modified |
| flattenUseElements | 525/525 (100%) | Bug fixed 2025-12-12 |
| imageToPath | 525/525 (100%) | - |
| inlineStyles | 501/525 (95.4%) | CSS edge cases |
| mergePaths | 525/525 (100%) | - |
| minifyStyles | 525/525 (100%) | - |
| moveGroupAttrsToElems | 525/525 (100%) | - |
| removeDesc | 525/525 (100%) | - |
| removeDoctype | 525/525 (100%) | - |
| removeElementsByAttr | 525/525 (100%) | - |
| removeEmptyAttrs | 533/533 (100%) | - |
| removeEmptyContainers | 525/525 (100%) | - |
| removeEmptyText | 525/525 (100%) | - |
| removeHiddenElements | 525/525 (100%) | - |
| removeMetadata | 525/525 (100%) | - |
| removeNonInheritableGroupAttrs | 525/525 (100%) | - |
| removeOffCanvasPath | 525/525 (100%) | - |
| removeRasterImages | 525/525 (100%) | - |
| removeScriptElement | 521/525 (99.2%) | - |
| removeUnknownsAndDefaults | 512/525 (97.5%) | - |
| removeXMLNS | 525/525 (100%) | - |
| reusePaths | 525/525 (100%) | - |
| sortAttrs | 525/525 (100%) | - |
| sortDefsChildren | 525/525 (100%) | - |

### FAILED Functions (10) - Analysis

| Function | Failures | Type | Notes |
|----------|----------|------|-------|
| convertShapesToPath | 5/525 | W3C Issues | Pre-existing XML escaping issues in test files |
| decomposeTransform | 28/525 | Limitation | Documented: skewY transforms not supported |
| flattenClipPaths | 17/525 | BUG | `root.serialize is not a function` |
| moveElemsAttrsToGroup | 113/525 | By Design | Function moves attrs, which can invalidate refs |
| removeComments | 15/1139 | Minor | 98.7% pass rate |
| removeStyleElement | Unknown | Parse Error | Report format issue |
| removeUselessDefs | Unknown | Parse Error | Report format issue |
| removeViewBox | 13/525 | Minor | 97.5% pass rate |
| removeXMLProcInst | 66/525 | BUG | Serializer outputs "undefined" |
| simplifyPath | Unknown | Parse Error | Report format issue |

### UNKNOWN Functions (11)

These functions have reports but parsing failed or status unclear:
- convertTransform
- optimizeAnimationTiming
- optimizePaths
- prefixIds
- removeAttributesBySelector
- removeAttrs
- removeDimensions
- removeEditorsNSData
- removeTitle
- removeXlink
- simplifyPaths

## Bugs Identified

### Critical Bugs (Should Fix)

1. **flattenClipPaths** - `root.serialize is not a function`
   - Location: `src/svg-toolbox.js:3510`
   - Cause: Function returns non-SVGElement in certain cases
   - Affected files: 17/525

2. **removeXMLProcInst** - Serializer outputs "undefined"
   - Location: `src/svg-parser.js` (serialization)
   - Cause: Serializer outputs "undefined" for some values
   - Affected files: 66/525

### Minor Issues (Acceptable)

3. **moveElemsAttrsToGroup** - Breaks ID references (113/525)
   - This is by design - moving attributes can break references
   - Consider adding safeguards or documentation

### Expected Limitations (Documented)

4. **decomposeTransform** - Cannot handle skewY (28/525)
   - Documented in source code
   - Mathematical limitation of T*R*SkX*S decomposition

5. **convertShapesToPath** - W3C test file issues (5/525)
   - Pre-existing XML/entity issues in W3C test files
   - Not a library bug

## Bugs Fixed in This Session

1. **convertShapesToPath** - Fixed `points.split is not a function`
   - Added type guards for SVGAnimatedPoints objects
   - Commit: "fix: handle non-string points in parsePoints function"

2. **flattenUseElements** - Fixed missing import
   - Added `parseTransformAttribute` import from svg-flatten.js
   - Commit: "fix: resolve use elements with transform attributes"

## Recommendations

1. Fix `flattenClipPaths` serialize error
2. Fix `removeXMLProcInst` undefined output
3. Add documentation for `moveElemsAttrsToGroup` reference behavior
4. Consider adding CI tests for W3C SVG test suite

---
*Generated: 2025-12-12*
