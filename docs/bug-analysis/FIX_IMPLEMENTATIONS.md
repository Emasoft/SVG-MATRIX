# SVG Violations - Fix Implementations

## File: trombone.bug.fbf.svg

### Fix 1: Remove Invalid Group Element Attributes

**Location:** Lines 41-54 (ANIMATION_BACKDROP group)
**Current Code:**
```xml
<g id="ANIMATION_BACKDROP" x="0px" y="0px" width="7770.0px" height="4641.0px">
    <!-- (put scene background here) -->
    <!--    ANIMATION STAGE    -->
    <g id="ANIMATION_STAGE" x="0px" y="0px" width="7770.0px" height="4641.0px">
        <!--    ANIMATED GROUP     -->
        <g id="ANIMATED_GROUP">
            <use id="PROSKENION" width="7770.0px" height="4641.0px" overflow="visible" xlink:href="#FRAME01">
                <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME01;#FRAME02;#FRAME03;#FRAME04"/>
            </use>
        </g>
        <!--    END OF ANIMATED GROUP    -->
    </g>
    <!--    END OF ANIMATION STAGE     -->
</g>
<!--    END OF ANIMATION BACKDROP      -->
```

**Corrected Code:**
```xml
<!-- Note: Removed x, y, width, height from <g> elements as they are not valid in SVG 1.1 -->
<g id="ANIMATION_BACKDROP">
    <!-- (put scene background here) -->
    <!--    ANIMATION STAGE    -->
    <g id="ANIMATION_STAGE">
        <!--    ANIMATED GROUP     -->
        <g id="ANIMATED_GROUP">
            <!-- Note: Removed width, height from <use> element - these apply to referenced content -->
            <!-- Use element will inherit dimensions from the referenced frame group -->
            <use id="PROSKENION" overflow="visible" xlink:href="#FRAME0001">
                <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004"/>
            </use>
        </g>
        <!--    END OF ANIMATED GROUP    -->
    </g>
    <!--    END OF ANIMATION STAGE     -->
</g>
<!--    END OF ANIMATION BACKDROP      -->
```

**Changes Made:**
1. Removed `x="0px" y="0px" width="7770.0px" height="4641.0px"` from line 41
2. Removed `x="0px" y="0px" width="7770.0px" height="4641.0px"` from line 44
3. Removed `width="7770.0px" height="4641.0px"` from line 47 (use element)
4. Updated frame references from `#FRAME01` to `#FRAME0001` (see Fix 2)

**SVG 1.1 Compliance:**
- `<g>` elements do not accept x, y, width, height attributes per SVG 1.1 spec
- `<use>` elements can accept width/height BUT it's redundant when referencing groups
- If viewport clipping is needed, use `<clipPath>` instead

**Alternative Solution (with clipping):**
```xml
<defs>
    <clipPath id="animation_bounds">
        <rect x="0" y="0" width="7770" height="4641"/>
    </clipPath>
</defs>

<g id="ANIMATION_BACKDROP" clip-path="url(#animation_bounds)">
    <!-- content -->
</g>
```

---

### Fix 2: Rename Frames to Use Correct Format

**Location:** Lines 799, 804, 809, 814 (Frame definitions)
**Location:** Line 48 (Animate values)

**Current Code:**
```xml
<!-- Lines 799-814 -->
<g id="FRAME01" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 1 content -->
</g>
<g id="FRAME02" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 2 content -->
</g>
<g id="FRAME03" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 3 content -->
</g>
<g id="FRAME04" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 4 content -->
</g>

<!-- Line 48 -->
<animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME01;#FRAME02;#FRAME03;#FRAME04"/>
```

**Corrected Code:**
```xml
<!-- Lines 799-814 - With corrected IDs -->
<g id="FRAME0001" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 1 content -->
</g>
<g id="FRAME0002" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 2 content -->
</g>
<g id="FRAME0003" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 3 content -->
</g>
<g id="FRAME0004" clip-rule="evenodd" fill="darkBlue" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="0">
    <!-- Frame 4 content -->
</g>

<!-- Line 48 - Updated to match new frame IDs -->
<animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.4s" repeatCount="indefinite" values="#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004"/>
```

**Changes Made:**
1. Rename `FRAME01` → `FRAME0001` (add one leading zero)
2. Rename `FRAME02` → `FRAME0002` (add one leading zero)
3. Rename `FRAME03` → `FRAME0003` (add one leading zero)
4. Rename `FRAME04` → `FRAME0004` (add one leading zero)
5. Update animate values to reference new frame IDs

**FBF.SVG Specification Compliance:**
Per the file's own documentation (lines 108-113):
- Frame group IDs must have the form: `FRAME0...1` with zero-padded digits
- There must always be an additional 0 before other digits
- Frame IDs like `FRAME1` are NOT allowed
- For 4 frames, use `FRAME0001`, `FRAME0002`, `FRAME0003`, `FRAME0004`

**Why This Matters:**
- Trombone explicitly declares itself as FBF.SVG format in its documentation
- The file violates its own stated specification
- FBF.SVG validators and parsers expect this format
- Migration to other frame-based animation formats may fail

---

## File: seagull.bug.fbf.svg

### Fix: Correct Initial Frame Reference in PROSKENION

**Location:** Line 190

**Current Code:**
```xml
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME0001">
    <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.8333s" repeatCount="indefinite" values="#FRAME00001;#FRAME00002;#FRAME00003;#FRAME00004;#FRAME00005;#FRAME00006;#FRAME00007;#FRAME00008;#FRAME00009;#FRAME00010"/>
</use>
```

**Problem:**
- Initial href: `#FRAME0001` (5 chars, 1 zero padding)
- Animate values: `#FRAME00001`, etc. (6 chars, 2 zero padding)
- Actual definitions: `#FRAME00001` through `#FRAME00010` (6 chars, 2 zero padding)

**Corrected Code:**
```xml
<!-- Changed xlink:href from #FRAME0001 to #FRAME00001 to match actual frame definitions -->
<use id="PROSKENION" overflow="visible" xlink:href="#FRAME00001">
    <animate attributeName="xlink:href" begin="0s" calcMode="discrete" dur="0.8333s" repeatCount="indefinite" values="#FRAME00001;#FRAME00002;#FRAME00003;#FRAME00004;#FRAME00005;#FRAME00006;#FRAME00007;#FRAME00008;#FRAME00009;#FRAME00010"/>
</use>
```

**Changes Made:**
1. Change `xlink:href="#FRAME0001"` to `xlink:href="#FRAME00001"`

**SVG 1.1 Compliance:**
- All href references must point to valid element IDs
- If an element ID is undefined, the reference becomes invalid
- SVG renderers will fail to display the referenced content
- This causes the animation to have a blank first frame

**Impact of This Fix:**
- Initial frame will now display correctly
- Animation will not have a visual glitch when starting
- All frame references will be valid and resolvable
- Timing remains consistent: 10 frames × 0.08333s = 0.8333s total

---

## Verification Checklist

After applying these fixes, verify:

### Trombone.bug.fbf.svg
- [ ] Lines 41, 44: No x, y, width, height attributes on `<g>` elements
- [ ] Line 47: Removed width, height from `<use>` element
- [ ] Line 48: Animate values updated to `#FRAME0001;#FRAME0002;#FRAME0003;#FRAME0004`
- [ ] Line 47: Initial href updated to `#FRAME0001`
- [ ] Frame definitions renamed to `FRAME0001`, `FRAME0002`, `FRAME0003`, `FRAME0004`

### Seagull.bug.fbf.svg
- [ ] Line 190: xlink:href changed from `#FRAME0001` to `#FRAME00001`
- [ ] All animate frame values match existing frame IDs (00001-00010)
- [ ] Frame definitions exist for all referenced frames

---

## Automated Testing Command

To verify fixes in your editor or script:

```bash
# Verify no <g> elements have x, y, width, height
grep -E '<g[^>]*\s(x|y|width|height)=' trombone.bug.fbf.svg

# Verify frame naming is correct (should show FRAME with 4 digits)
grep 'id="FRAME' trombone.bug.fbf.svg

# Verify all animate frame references exist
grep 'values="' trombone.bug.fbf.svg | grep -o '#FRAME[^;]*' | sort -u > refs.txt
grep 'id="FRAME' trombone.bug.fbf.svg | grep -o 'id="[^"]*"' | sed 's/id="/#/' | sort -u > defs.txt
comm -23 refs.txt defs.txt  # Should be empty

# For seagull: verify initial href matches actual frames
grep 'xlink:href="#FRAME' seagull.bug.fbf.svg | grep -o '#FRAME[0-9]*' | sort -u
grep 'id="FRAME' seagull.bug.fbf.svg | grep -o 'FRAME[0-9]*' | sort -u
# Both lists should match exactly
```

---

## Why These Bugs Are Silent

1. **Invalid group attributes:** SVG 1.1 renderers silently ignore unknown/invalid attributes on elements. The group still renders, but positioning is lost.

2. **Undefined frame reference:** Some SVG renderers gracefully degrade and just show nothing, or they jump to the animate values when animation starts.

3. **Frame naming mismatch:** The animation still works because the animate values do exist, but FBF.SVG spec validators would reject it.

This is why these are called "hidden issues" - they don't cause obvious crashes, just subtle rendering problems that vary by renderer.

