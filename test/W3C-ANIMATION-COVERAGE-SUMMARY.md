# W3C SVG 1.1 Test Suite - Animation Feature Coverage Report

**Date:** December 4, 2025
**Test Suite:** W3C SVG 1.1 Animation Test Files
**Test Script:** `test/w3c-feature-coverage.test.js`

## Executive Summary

Tested **78 animation SVG files** from the W3C SVG 1.1 Test Suite through svg-matrix operations (parseSVG, cleanupIds, optimizeAnimationTiming, serializeSVG).

### Results Overview

- **Total Files Tested:** 78
- **Successful:** 78 (100%)
- **Failed:** 0
- **Files with CRITICAL issues:** 4 (5.1%)
- **Files with HIGH issues:** 40 (51.3%)
- **Files with MEDIUM issues:** 0
- **Files with LOW issues (normalization):** 0

## Critical Issues (Element Count Changes)

These files lost animation elements during processing:

1. **animate-dom-01-f.svg**
   - Lost 1 `<set>` element (1 → 0)

2. **animate-elem-31-t.svg**
   - Lost 1 `<set>` element (2 → 1)

3. **animate-elem-77-t.svg**
   - Lost 5 `<set>` elements (15 → 10)

4. **animate-interact-pevents-01-t.svg**
   - Lost ALL 60 `<set>` elements (60 → 0)

**SEVERITY:** CRITICAL - These files had animation elements removed entirely.

## High Issues (Attribute Removal)

40 files had animation attributes unexpectedly removed. Key patterns:

### Animation Timing Attributes Removed:
- `begin` attributes with timing references (e.g., "fadein.begin", "r60.mouseover")
- `keyTimes` attributes
- `keySplines` attributes

### Animation Value Attributes Removed:
- `values` attributes (numeric sequences)
- `from` and `to` attributes (color values, data URIs)
- `mpath-href` references

### Affected Files Include:
- animate-elem-07-t.svg (mpath-href removed)
- animate-elem-09-t.svg, 10-t.svg, 11-t.svg (values removed)
- animate-elem-12-t.svg (keySplines + values removed)
- animate-elem-13-t.svg through 19-t.svg (keyTimes/values removed)
- animate-elem-21-t.svg (begin event references removed)
- animate-elem-27-t.svg, 38-t.svg (xlink:href removed)
- animate-elem-30-t.svg (color values removed)
- animate-elem-34-t.svg (complex path animation values removed)
- animate-elem-35-t.svg (keyTimes removed)
- animate-elem-39-t.svg (extensive href/begin timing removed)
- animate-interact-events-01-t.svg through pevents-04-t.svg (event timing removed)

**SEVERITY:** HIGH - Animation behavior will be broken or significantly altered.

## Animation Features Detected

### Element Types Found (3):
- `<animate>` - Standard SMIL animation
- `<set>` - Discrete value setting
- `<mpath>` - Motion path reference

### Animation Attributes Found (22):
- accumulate, additive, attributeName, attributeType
- begin, by, calcMode, dur, end, fill
- from, keySplines, keyTimes, max, min
- mpath-href, repeatCount, repeatDur, restart
- to, values, xlink:href

### Animation Targets (40 different SVG attributes):
- Geometric: x, y, width, height, cx, cy, r, rx, ry, x1, x2, d, points, viewBox
- Visual: fill, stroke, stroke-width, stroke-dasharray, stroke-dashoffset, stroke-linecap, stroke-linejoin, stroke-miterlimit, stop-opacity, fill-opacity, fill-rule, opacity, color
- Text: font-family, font-size, font-style, font-weight, text-anchor
- Display: visibility, display, pointer-events
- References: xlink:href, class, in
- Special: clipPathUnits, preserveAspectRatio, spreadMethod

### Unique Animation Patterns: 98

Sample patterns include:
- Set display with discrete timing
- Animate with linear/paced/spline calcMode
- Animate with keyTimes and keySplines
- Animate with from/to values
- Animate with semicolon-separated values lists
- Event-based timing (begin="element.click")
- Chained timing (begin="anim1.end+2s")

### Timing Patterns Observed:
- Simple time values: "0s", "1s", "2s", "indefinite"
- Event-based: "element.click", "element.mouseover", "element.mouseout"
- Chained: "anim.begin", "anim.end+2s"
- Multiple: "indefinite; 100s; g.click; 1s"

## Root Causes Analysis

### Why `<set>` Elements Are Being Removed

The critical loss of `<set>` elements suggests:

1. **cleanupIds** operation may be removing elements it considers "unused"
2. The animation-aware reference tracking may not be properly protecting `<set>` elements
3. `<set>` elements without `id` attributes may be treated as orphaned

### Why Animation Attributes Are Being Removed

The high rate of attribute removal (51.3% of files) indicates:

1. **optimizeAnimationTiming** is being too aggressive
2. Attributes may be removed if they're considered "default" or "redundant"
3. The optimization logic may not account for all valid animation patterns

## Recommendations

### Immediate Actions Required:

1. **Fix `<set>` Element Removal (CRITICAL)**
   - Investigate why cleanupIds/optimizeAnimationTiming removes `<set>` elements
   - Add explicit protection for all SMIL animation elements
   - Ensure animation-references.js includes `<set>` in ANIMATION_ELEMENTS

2. **Fix Attribute Removal (HIGH PRIORITY)**
   - Review optimizeAnimationTiming logic
   - Ensure `begin`, `values`, `keyTimes`, `keySplines`, `from`, `to`, `href`, `xlink:href` are never removed
   - Add validation that animation attributes are preserved

3. **Add Regression Tests**
   - Add W3C test files with issues to regression suite
   - Ensure future changes don't break these files

### Testing Strategy:

1. Run this test suite before any animation-related code changes
2. Monitor for increases in critical/high issues
3. Validate that attribute counts remain stable
4. Check element counts remain unchanged

## Files Affected

**Full list in:** `test/w3c-animation-coverage-report.json`

### Critical Files (4):
- animate-dom-01-f.svg
- animate-elem-31-t.svg
- animate-elem-77-t.svg
- animate-interact-pevents-01-t.svg

### High Issue Files (40):
See detailed report for complete list.

## Test Execution

```bash
node test/w3c-feature-coverage.test.js
```

**Output:** `test/w3c-animation-coverage-report.json`
**Logs:** `test/w3c-test-output.log`

## Conclusion

svg-matrix has **significant issues** with animation preservation:

1. **5.1% of files** lost animation elements entirely (CRITICAL)
2. **51.3% of files** had animation attributes removed (HIGH)
3. **No files passed** without some form of modification

The animation-aware reference tracking exists but is **not being applied correctly** during optimization passes.

**Status:** FAIL - Major animation preservation issues detected.

**Next Steps:** Fix `<set>` element removal and attribute stripping before svg-matrix can be safely used with animated SVG files.
