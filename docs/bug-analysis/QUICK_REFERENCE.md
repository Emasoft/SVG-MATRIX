# SVG Hidden Issues - Quick Reference

## Issues Found: 3

### Critical Issue 1: Seagull Undefined Frame Reference

**File:** `seagull.bug.fbf.svg`
**Line:** 190
**Severity:** CRITICAL

```xml
<!-- WRONG (target doesn't exist) -->
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME0001">

<!-- CORRECT (target exists) -->
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME00001">
```

**Why it fails:** Initial frame `#FRAME0001` is not defined. Actual frames are `#FRAME00001`-`#FRAME00010`. Animation will start with blank frame.

---

### High-Priority Issue 1: Trombone Invalid Group Attributes

**File:** `trombone.bug.fbf.svg`
**Lines:** 41, 44
**Severity:** HIGH

```xml
<!-- WRONG (<g> doesn't support these attributes) -->
<g id="ANIMATION_BACKDROP" x="0px" y="0px" width="7770.0px" height="4641.0px">
<g id="ANIMATION_STAGE" x="0px" y="0px" width="7770.0px" height="4641.0px">

<!-- CORRECT -->
<g id="ANIMATION_BACKDROP">
<g id="ANIMATION_STAGE">
```

**Why it fails:** SVG 1.1 doesn't support x, y, width, height on `<g>` elements. These are silently ignored, causing positioning problems.

---

### High-Priority Issue 2: Trombone Frame Naming Violation

**File:** `trombone.bug.fbf.svg`
**Lines:** 48, 799, 804, 809, 814
**Severity:** HIGH

```xml
<!-- WRONG (violates FBF.SVG spec) -->
values="#FRAME01;#FRAME02;#FRAME03;#FRAME04"
<g id="FRAME01">...</g>
<g id="FRAME02">...</g>
<g id="FRAME03">...</g>
<g id="FRAME04">...</g>

<!-- CORRECT (FBF.SVG standard format) -->
values="#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004"
<g id="FRAME0001">...</g>
<g id="FRAME0002">...</g>
<g id="FRAME0003">...</g>
<g id="FRAME0004">...</g>
```

**Why it fails:** FBF.SVG spec (stated in file itself) requires zero-padded frame IDs like `FRAME0001`. Format `FRAME01` is not allowed.

---

## Validation Results

| Category | Status | Details |
|----------|--------|---------|
| Namespaces | PASS | All required namespaces correctly declared |
| Animation Timing | PASS | begin, dur, repeatCount all valid |
| calcMode | PASS | discrete is correct for frame animation |
| Invalid Attributes | FAIL | <g> elements with x,y,width,height |
| Undefined References | FAIL | seagull.bug.fbf.svg line 190 |
| FBF.SVG Format | FAIL | trombone.bug.fbf.svg frame naming |

---

## Fixes in 90 Seconds

### Seagull Fix (30 seconds)
- Line 190: Change `#FRAME0001` to `#FRAME00001`
- Test: Save and reload

### Trombone Fix Part 1 (30 seconds)
- Line 41: Remove `x="0px" y="0px" width="7770.0px" height="4641.0px"`
- Line 44: Remove `x="0px" y="0px" width="7770.0px" height="4641.0px"`
- Test: Save and reload

### Trombone Fix Part 2 (30 seconds)
- Line 48: Update values to `#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004`
- Lines 799+: Rename `FRAME01` to `FRAME0001`, `FRAME02` to `FRAME0002`, etc.
- Test: Save and reload

---

## Silent Failure Modes

| Symptom | Root Cause |
|---------|-----------|
| Animation starts with blank frame | Undefined initial xlink:href |
| Animation positioned incorrectly | Invalid x, y, width, height on <g> |
| FBF.SVG validators reject file | Frame ID format violation |
| Animation works in browser but fails in validators | All of the above |

---

## Tools to Verify Fixes

```bash
# Check for undefined references
grep -o 'xlink:href="#[^"]*"' seagull.bug.fbf.svg | sort -u > refs.txt
grep -o 'id="[^"]*"' seagull.bug.fbf.svg | sed 's/id="/xlink:href="#/' | sort -u > defs.txt
comm -23 refs.txt defs.txt  # Should be empty

# Check for invalid group attributes
grep '<g[^>]*\sx=' trombone.bug.fbf.svg  # Should find nothing after fix

# Check frame naming format
grep 'id="FRAME' trombone.bug.fbf.svg  # Should show FRAME0001, etc.
```

---

## Files to Review

1. **SVG_VIOLATIONS_ANALYSIS.md** - Complete technical analysis
2. **FIX_IMPLEMENTATIONS.md** - Exact code changes with before/after
3. **SVG_1.1_RULES_REFERENCE.md** - Full SVG 1.1 specification guide
4. **ANALYSIS_SUMMARY.txt** - Full detailed report

---

## Key Takeaways

1. Invalid attributes on `<g>` elements are silently ignored by browsers
2. Undefined element references cause silent rendering failures
3. FBF.SVG specification violations prevent file validation
4. These issues don't break animations entirely, they cause subtle glitches
5. Always validate element IDs before referencing them
6. Always use correct attribute names per SVG 1.1 spec
7. Follow FBF.SVG format strictly if that's your target format

