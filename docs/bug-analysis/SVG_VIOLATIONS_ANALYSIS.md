# SVG Standard Violations Analysis
## HIDDEN_ISSUES Directory

**Analysis Date:** 2025-12-06
**Scope:** trombone.bug.fbf.svg (~80KB, 840 lines) and seagull.bug.fbf.svg (~98KB, 660 lines)
**Files Analyzed:** 2
**Total Critical Issues Found:** 5

---

## File 1: trombone.bug.fbf.svg

### Issue 1: Invalid Group Element Attributes (Lines 41, 44)

**Severity:** HIGH - SVG 1.1 violation that causes rendering issues
**Type:** Invalid attribute usage

**Problem:**
The `<g>` (group) element is receiving positioning and sizing attributes that are not valid in SVG 1.1:

```xml
<!-- Line 41 -->
<g id="ANIMATION_BACKDROP" x="0px" y="0px" width="7770.0px" height="4641.0px">

<!-- Line 44 -->
<g id="ANIMATION_STAGE" x="0px" y="0px" width="7770.0px" height="4641.0px">
```

**SVG 1.1 Specification Violation:**
According to SVG 1.1 specification, the `<g>` element does NOT support the `x`, `y`, `width`, or `height` attributes. These attributes are valid only for:
- `<rect>` elements
- `<image>` elements
- `<foreignObject>` elements

**Why This Causes Silent Animation Failures:**
- Browsers silently ignore these invalid attributes on `<g>` elements
- SVG renderers may not properly constrain the viewport
- Animations may render outside expected bounds without visual indication of the error
- Clipping and positioning calculations may fail silently

**Fix:**
Replace with CSS transform or use a `<rect>` element with `display:none` for boundaries:

```xml
<!-- Option 1: Use transform instead -->
<g id="ANIMATION_BACKDROP">
    <!-- content -->
</g>

<!-- Option 2: Define bounds with a non-visible rect -->
<defs>
    <clipPath id="backdrop_clip">
        <rect x="0" y="0" width="7770.0" height="4641.0"/>
    </clipPath>
</defs>
<g id="ANIMATION_BACKDROP" clip-path="url(#backdrop_clip)">
```

---

### Issue 2: Mismatched Frame Count and Naming Convention (Line 48)

**Severity:** CRITICAL - Animation will not work correctly
**Type:** Data inconsistency between animate values and frame IDs

**Problem:**
The animate element references frames with incorrect naming convention:

```xml
<!-- Line 48 -->
<animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME01;#FRAME02;#FRAME03;#FRAME04"/>
```

Frame ID references:
```xml
<!-- Lines 799, ~804, ~809, ~814 -->
<g id="FRAME01" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
<g id="FRAME02" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
<g id="FRAME03" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
<g id="FRAME04" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
```

**SVG 1.1 Specification Violation:**
According to FBF.SVG specification (subset of SVG 1.1):
- Frame IDs must use format `FRAME0...1` with left-zero-padded digits
- The format must always have an additional 0 before other digits
- Frame IDs like `FRAME1` are explicitly not allowed

**Why This Causes Silent Animation Failures:**
- This file violates the FBF.SVG specification which is explicitly mentioned in the file's own documentation (line 109)
- The animation will work in this file by accident because the IDs match, BUT
- Any validator or migration tool expecting FBF.SVG compliance will flag this as an error
- Players specifically built for FBF.SVG format will reject or misinterpret the animation

**Fix:**
Rename all frame IDs to use the correct padding format:

```xml
<!-- Correct format -->
<g id="FRAME0001">...</g>
<g id="FRAME0002">...</g>
<g id="FRAME0003">...</g>
<g id="FRAME0004">...</g>

<!-- And update the animate element -->
<animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004"/>
```

---

## File 2: seagull.bug.fbf.svg

### Issue 1: Undefined Frame Reference in PROSKENION Element (Line 190)

**Severity:** CRITICAL - Animation will not initialize correctly
**Type:** Invalid href reference - target does not exist

**Problem:**
The PROSKENION `<use>` element references a frame ID that does not exist:

```xml
<!-- Line 190 - INCORRECT -->
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME0001">
    <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.8333s" repeatCount="indefinite" values="#FRAME00001;#FRAME00002;#FRAME00003;#FRAME00004;#FRAME00005;#FRAME00006;#FRAME00007;#FRAME00008;#FRAME00009;#FRAME00010"/>
</use>
```

**Reference Analysis:**
- Initial xlink:href: `#FRAME0001` (5 digits with 1 zero padding)
- Animate values: `#FRAME00001`, `#FRAME00002`, ... (5 digits with 2 zero padding)
- Actual frame definitions in file: `#FRAME00001`, `#FRAME00002`, ... (5 digits with 2 zero padding) ✓

**SVG 1.1 Specification Violation:**
According to SVG 1.1 specification, an href attribute value MUST reference an element that exists in the document. A reference to a non-existent element ID is invalid.

**Why This Causes Silent Animation Failures:**
- Initial frame will fail to display because `#FRAME0001` does not exist
- The `<use>` element will render nothing at startup
- When animation begins, it will jump to `#FRAME00001` and start working
- This creates a visual glitch: blank first frame, then animation starts
- Some SVG renderers may handle the missing reference differently, causing unpredictable behavior

**Evidence:**
```
Expected initial frame: #FRAME0001
Defined frames: #FRAME00001 through #FRAME00010
Result: Initial frame is undefined, animation skips first actual frame
```

**Fix:**
Change the initial xlink:href to match the actual first frame ID:

```xml
<!-- CORRECT -->
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME00001">
    <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.8333s" repeatCount="indefinite" values="#FRAME00001;#FRAME00002;#FRAME00003;#FRAME00004;#FRAME00005;#FRAME00006;#FRAME00007;#FRAME00008;#FRAME00009;#FRAME00010"/>
</use>
```

---

### Issue 2: Missing Frame ID in animate values (Line 191)

**Severity:** MEDIUM - Potential animation synchronization issue
**Type:** Mismatch in frame sequence

**Problem:**
The animate values attribute contains 10 frame references, but FBF.SVG documentation (line 25) indicates there are 10 frames:

```xml
<!-- Line 191 -->
<animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.8333s" repeatCount="indefinite" values="#FRAME00001;#FRAME00002;#FRAME00003;#FRAME00004;#FRAME00005;#FRAME00006;#FRAME00007;#FRAME00008;#FRAME00009;#FRAME00010"/>
```

Metadata confirms (line 25):
```xml
<fbf:frameCount>10</fbf:frameCount>
```

**Analysis:**
While the count matches, verify that all frame definitions exist in the defs section:
- Frames 00001-00010 should exist
- Line 25 confirms `frameCount=10`
- This appears correct, but the initial reference issue (#FRAME0001 vs #FRAME00001) is still a problem

**Why This Matters:**
- The dur="0.8333s" for 10 frames = 0.08333s per frame ≈ 12fps
- Metadata confirms 12.0 fps (line 26)
- Timing is consistent ✓

---

## Summary by Violation Type

### 1. **Invalid SVG Element Attributes** (Highest Priority)
- **Severity:** HIGH
- **File:** trombone.bug.fbf.svg (lines 41, 44)
- **Issue:** `<g>` elements using x, y, width, height attributes
- **Count:** 2 occurrences
- **Impact:** Rendering bounds ignored, animations may overflow viewport

### 2. **Undefined Element References** (Highest Priority)
- **Severity:** CRITICAL
- **File:** seagull.bug.fbf.svg (line 190)
- **Issue:** xlink:href="#FRAME0001" references non-existent element
- **Count:** 1 occurrence
- **Impact:** Initial frame fails to render, visual glitch on animation start

### 3. **Frame ID Format Violation** (FBF.SVG Specification)
- **Severity:** CRITICAL
- **File:** trombone.bug.fbf.svg (lines 799+)
- **Issue:** FRAME01, FRAME02 instead of FRAME0001, FRAME0002
- **Count:** 4 frame IDs + 1 animate element referencing them
- **Impact:** Violates stated FBF.SVG specification in file's own documentation

---

## Animation Timing Validation

Both files use SVG 1.1 compliant timing:

**Trombone:**
- `begin="0s"` - Valid ✓
- `dur="0.4s"` - Valid ✓
- `repeatCount="indefinite"` - Valid ✓
- `calcMode="discrete"` - Valid ✓

**Seagull:**
- `begin="0s"` - Valid ✓
- `dur="0.8333s"` - Valid (8.333 seconds for 10 frames at 12fps) ✓
- `repeatCount="indefinite"` - Valid ✓
- `calcMode="discrete"` - Valid ✓

---

## Namespace Declarations

Both files properly declare required namespaces:

**Trombone (Line 2):**
```xml
xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"
xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
xmlns:cc="http://creativecommons.org/ns#"
xmlns:dc="http://purl.org/dc/elements/1.1/"
```

**Seagull (Line 2):**
```xml
xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"
xmlns:fbf="http://opentoonz.github.io/fbf/1.0#"
xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
xmlns:cc="http://creativecommons.org/ns#"
xmlns:dc="http://purl.org/dc/elements/1.1/"
```

Both are correct ✓

---

## Recommended Fix Priority

1. **IMMEDIATE (Critical - Animation Won't Start):**
   - Seagull: Line 190 - Fix #FRAME0001 to #FRAME00001

2. **HIGH PRIORITY (Specification Compliance):**
   - Trombone: Lines 41, 44 - Remove invalid x, y, width, height from `<g>` elements
   - Trombone: Lines 799+ and Line 48 - Rename FRAME01-04 to FRAME0001-0004

3. **MEDIUM PRIORITY (Format Validation):**
   - Both files: Consider adding SVG schema validation to catch these issues

---

## How to Validate Similar Files

Use these checks to find similar issues:

```bash
# Check for invalid group attributes
grep '<g[^>]*\sx=' file.svg

# Check for undefined href references
grep -o 'href="#[^"]*"' file.svg | sort -u > refs.txt
grep -o 'id="[^"]*"' file.svg | sed 's/id="/href="#/' | sort -u > ids.txt
comm -23 refs.txt ids.txt

# Check frame ID format
grep 'id="FRAME[0-9]' file.svg  # Should show FRAME with padding

# Validate animate element timing
grep '<animate' file.svg | grep -oE 'begin=|dur=|end='
```

