# SVG 1.1 Rules Reference for Animation Quality

## SVG Elements and Valid Attributes

### Container Elements

#### `<g>` Group Element
**Valid attributes:**
- `id`, `class`, `style`
- Transform attributes: `transform`
- Opacity/clipping: `opacity`, `clip-path`, `clip-rule`, `mask`
- Paint attributes: `fill`, `stroke`, `fill-opacity`, `stroke-opacity`, etc.
- Pointer attributes: `pointer-events`, `cursor`, `visibility`, `display`

**INVALID attributes (silently ignored):**
- ~~`x`, `y`, `width`, `height`~~ - These are NOT supported
- ~~`preserveAspectRatio`~~ - Use on `<svg>` or `<image>` instead
- ~~`viewBox`~~ - Use on `<svg>` instead

**Why x, y, width, height don't work on `<g>`:**
- Groups are invisible containers for logical organization
- Groups don't have intrinsic dimensions
- Positioning groups requires using `<transform>` instead

**Correct ways to position groups:**
```xml
<!-- Option 1: Use transform (CORRECT) -->
<g id="my_group" transform="translate(100, 200)">
    <circle cx="0" cy="0" r="50"/>
</g>

<!-- Option 2: Use g inside a positioned rect (rarely needed) -->
<rect x="100" y="200" width="300" height="400" fill="none" pointer-events="none"/>
<g>
    <!-- content -->
</g>

<!-- Option 3: Use clip-path for clipping (if bounds are for clipping) -->
<defs>
    <clipPath id="bounds">
        <rect x="0" y="0" width="7770" height="4641"/>
    </clipPath>
</defs>
<g clip-path="url(#bounds)">
    <!-- content -->
</g>
```

---

#### `<svg>` Root Element
**Valid attributes:**
- `viewBox`, `preserveAspectRatio`
- `width`, `height`, `x`, `y`
- `xmlns` (required), `xmlns:xlink` (if using xlink)
- All standard attributes

**These should be on `<svg>`, NOT on `<g>`:**
```xml
<!-- CORRECT -->
<svg width="100%" height="100%" viewBox="0 0 7770 4641" preserveAspectRatio="xMidYMid meet">
    <g id="content">...</g>
</svg>

<!-- INCORRECT (viewBox, preserveAspectRatio don't belong here) -->
<svg><g viewBox="0 0 7770 4641" preserveAspectRatio="xMidYMid meet">...</g></svg>
```

---

#### `<use>` Element
**Valid attributes:**
- `x`, `y` - Position of the reference
- `width`, `height` - Override size of referenced content (optional)
- `xlink:href` - REQUIRED, must point to valid element
- `href` - Alias for xlink:href (SVG 2, not all browsers support)
- `id`, `class`, `style`, `transform`

**Critical rule:**
- `xlink:href` or `href` MUST point to an element that exists
- Without a valid target, nothing will render
- Some renderers show nothing, others show blank space

```xml
<!-- CORRECT -->
<use xlink:href="#FRAME00001" x="0" y="0"/>

<!-- INCORRECT - target doesn't exist -->
<use xlink:href="#FRAME0001" x="0" y="0"/>
<!-- ^ This will render nothing if #FRAME0001 is not defined -->
```

---

### Animation Elements

#### `<animate>` Element
**Required attributes:**
- `attributeName` - Which attribute to animate
- `from`, `to`, `values` - Animation values (at least one required)

**Optional attributes with defaults:**
- `begin="0s"` - When to start (default: immediately)
- `dur` - Duration (no default, animation won't run if missing)
- `end` - When to stop
- `repeatCount` - How many times to repeat
- `repeatDur` - Total duration to repeat for
- `calcMode="linear"` - Interpolation mode (linear, discrete, paced, spline)

**Valid `begin` values:**
```svg
begin="0s"           <!-- Start immediately -->
begin="1s"           <!-- Start after 1 second -->
begin="1s;2.5s"      <!-- Start at 1s and 2.5s -->
begin="click"        <!-- Start on click -->
begin="foo.begin"    <!-- Start when #foo starts -->
```

**Valid `dur` values:**
```svg
dur="1s"             <!-- 1 second -->
dur="0.5s"           <!-- 0.5 seconds (500ms) -->
dur="indefinite"     <!-- Forever (if used with repeatCount) -->
```

**Valid `repeatCount` values:**
```svg
repeatCount="1"      <!-- Play once (default) -->
repeatCount="3"      <!-- Play 3 times -->
repeatCount="indefinite"  <!-- Loop forever -->
```

**Valid `calcMode` values:**
```svg
calcMode="linear"    <!-- Smooth interpolation -->
calcMode="discrete"  <!-- Jump to next value (for frame-by-frame) -->
calcMode="paced"     <!-- Constant speed -->
calcMode="spline"    <!-- With control points -->
```

**Critical for animations:**
```xml
<!-- CORRECT - Frame-by-frame animation -->
<animate
    attributeName="xlink:href"
    begin="0s"
    dur="0.8333s"
    calcMode="discrete"
    repeatCount="indefinite"
    values="#FRAME1;#FRAME2;#FRAME3"/>

<!-- WRONG - calcMode should be discrete for frame switching -->
<animate
    attributeName="xlink:href"
    begin="0s"
    dur="0.8333s"
    calcMode="linear"    <!-- Won't work for href! -->
    repeatCount="indefinite"
    values="#FRAME1;#FRAME2;#FRAME3"/>
```

---

#### `<animateTransform>` Element
Used for animating transformation attributes (transform, scale, rotate, etc.)

```xml
<animateTransform
    attributeName="transform"
    type="rotate"
    from="0 100 100"
    to="360 100 100"
    dur="2s"
    repeatCount="indefinite"/>
```

---

#### `<animateMotion>` Element
Used for moving elements along paths

```xml
<animateMotion dur="3s" repeatCount="indefinite">
    <mpath xlink:href="#myPath"/>
</animateMotion>
```

---

#### `<set>` Element
Used for setting attribute values at specific times

```xml
<set
    attributeName="visibility"
    to="hidden"
    begin="2s"/>
```

---

## Namespace Requirements

### Minimum Required Namespaces
```xml
<svg xmlns="http://www.w3.org/2000/svg">
    <!-- Basic SVG only -->
</svg>
```

### For XLink References (href, etc.)
```xml
<svg
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink">
    <use xlink:href="#myElement"/>
</svg>
```

### For Metadata and CC Licensing
```xml
<svg
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:cc="http://creativecommons.org/ns#">

    <metadata>
        <rdf:RDF>
            <cc:Work>
                <dc:title>My Animation</dc:title>
            </cc:Work>
        </rdf:RDF>
    </metadata>
</svg>
```

**Common issue:** Missing namespace declaration:
```xml
<!-- WRONG - xlink prefix not declared -->
<svg xmlns="http://www.w3.org/2000/svg">
    <use xlink:href="#myElement"/>  <!-- Will fail! -->
</svg>

<!-- CORRECT -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <use xlink:href="#myElement"/>
</svg>
```

---

## ID Format and Reference Rules

### ID Naming Rules
- IDs must be unique within the document
- IDs must start with a letter (a-z, A-Z) or underscore (_)
- IDs can contain letters, digits, hyphens, periods, underscores
- IDs are case-sensitive

```xml
<!-- VALID IDs -->
<g id="Frame1"/>           ✓
<g id="frame_1"/>          ✓
<g id="FRAME0001"/>        ✓
<g id="Shape-A"/>          ✓

<!-- INVALID IDs -->
<g id="1Frame"/>           ✗ (starts with digit)
<g id="Frame 1"/>          ✗ (contains space)
<g id="Frame@1"/>          ✗ (@ not allowed)
```

### Reference Rules
**All these must reference existing IDs:**
- `href="#id"` - In use, image, etc.
- `xlink:href="#id"` - Older XLink syntax
- `clip-path="url(#id)"` - In clip-path
- `mask="url(#id)"` - In mask
- `fill="url(#id)"` - In fill (for gradients, patterns)
- `stroke="url(#id)"` - In stroke
- `filter="url(#id)"` - In filter

**What happens if ID is undefined:**
- Element renders as empty/transparent
- No error message in most browsers
- Animation might fail silently
- Different renderers behave differently

---

## Frame-Based Animation Best Practices

### Proper Structure
```xml
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

    <!-- The animated element -->
    <use id="animation" xlink:href="#Frame1">
        <animate
            attributeName="xlink:href"
            begin="0s"
            dur="1.0s"
            calcMode="discrete"
            repeatCount="indefinite"
            values="#Frame1;#Frame2;#Frame3;#Frame4"/>
    </use>

    <!-- Frame definitions -->
    <defs>
        <g id="Frame1"><!-- frame content --></g>
        <g id="Frame2"><!-- frame content --></g>
        <g id="Frame3"><!-- frame content --></g>
        <g id="Frame4"><!-- frame content --></g>
    </defs>
</svg>
```

### Timing Calculation
```
dur = (1 / fps) * frameCount

For 12 fps with 10 frames:
dur = (1 / 12) * 10 = 0.8333 seconds

For 24 fps with 10 frames:
dur = (1 / 24) * 10 = 0.4166 seconds

For 60 fps with 10 frames:
dur = (1 / 60) * 10 = 0.1666 seconds
```

### Frame ID Naming
**FBF.SVG Convention (recommended for frame-based formats):**
- Use format: `FRAME00...1` with zero-padding
- Always include extra leading zero
- For 4 frames: `FRAME0001`, `FRAME0002`, `FRAME0003`, `FRAME0004`
- For 100+ frames: `FRAME0001` through `FRAME0100`

**Why zero-padding matters:**
- Sorting works correctly (alphanumeric): FRAME0001, FRAME0002, ..., FRAME0010
- Without padding: FRAME1, FRAME10, FRAME2 (wrong order!)
- Consistent with animation format standards
- Tools expecting this format will fail without it

---

## Common Silent Failures in Animations

| Issue | Symptom | Fix |
|-------|---------|-----|
| Invalid group attributes | Positioning lost, renders wrong | Remove x, y, width, height from `<g>` |
| Undefined href | Nothing renders on first frame | Verify all IDs exist |
| Wrong calcMode for href | Jumps between values oddly | Use `calcMode="discrete"` |
| Missing dur attribute | Animation doesn't run | Add `dur="Xs"` |
| Mismatched frame IDs | Animation skips first/last | Ensure animate values match frame IDs |
| Missing namespace | XLink references fail | Add `xmlns:xlink` |
| Duplicate IDs | Last definition wins silently | Ensure each ID is unique |
| Animation element outside `<defs>` | Works but breaks on serialization | Put `<g>` frames in `<defs>` |

---

## Validation Tools

### Command-line validation
```bash
# Check for undefined references
grep -o 'href="#[^"]*"' file.svg | sort -u > refs.txt
grep -o 'id="[^"]*"' file.svg | sed 's/id="/href="#/' | sort -u > defs.txt
comm -23 refs.txt defs.txt  # Shows undefined

# Check for invalid group attributes
grep -E '<g[^>]*\s(x|y|width|height)=' file.svg

# Check namespace declarations
grep 'xmlns' file.svg
```

### Online validators
- W3C SVG Validator: https://www.w3.org/2011/svg-in-html5-check/
- SVG Linter: Various npm packages available

### Browser console
```javascript
// In browser DevTools console
document.querySelectorAll('use').forEach(el => {
    const href = el.getAttribute('xlink:href') || el.getAttribute('href');
    const target = document.querySelector(href);
    if (!target) console.warn('Undefined reference:', href);
});
```

---

## FBF.SVG Format Specific Rules

FBF.SVG (Frame-By-Frame SVG) is a stricter subset of SVG 1.1:

1. **No external resources** - All files must be embedded (base64)
2. **No CSS or JavaScript** - Only inline SVG
3. **Strict structure:**
   ```
   <svg>
       <metadata>...</metadata>
       <desc>...</desc>
       <ANIMATION_BACKDROP>
           <ANIMATION_STAGE>
               <ANIMATED_GROUP>
                   <use id="PROSKENION" xlink:href="#FRAME00001">
                       <animate values="#FRAME00001;#FRAME00002;..."/>
                   </use>
               </ANIMATED_GROUP>
           </ANIMATION_STAGE>
       </ANIMATION_BACKDROP>
       <defs>...</defs>
   </svg>
   ```

4. **Frame naming:** Must be `FRAME00001` (4-digit padding minimum)
5. **Animation format:** Only `<animate>` on `attributeName="xlink:href"`
6. **Timing:** `begin="0s"`, `calcMode="discrete"`, `repeatCount="indefinite"`

Any violation of these rules will cause parsers expecting FBF.SVG to reject the file.

