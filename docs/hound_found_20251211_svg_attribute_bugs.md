# SVG Attribute Handling - Exhaustive Bug Analysis Report

**Search Date:** 2025-12-11
**Search Scope:** /Users/emanuelesabetta/Code/SVG-MATRIX/src
**Total Critical Findings:** 12 (3 BUGGY, 6 SUSPICIOUS, 3 SAFE)

---

## BUGGY: Critical Issues Requiring Immediate Fix

### BUGGY-1: Missing Marker Attribute in URL_REF_ATTRS (svg-toolbox.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Lines:** 6595, 6601

### Content:
```javascript
const URL_REF_ATTRS = ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end'];
```

### Issue Status: **BUGGY**

### Why It's Buggy:
This array is used for detecting broken URL references in attributes. While it correctly includes `'marker-start'`, `'marker-mid'`, and `'marker-end'`, these are NOT url() references - they reference marker elements with simple id syntax like `url(#markerId)`. However, the critical issue is that the `'marker'` shorthand attribute is **COMPLETELY MISSING**. Per SVG spec, `marker` is a valid shorthand that references the same way as `marker-start`, but this function won't validate it.

Additionally, `'color-profile'` is missing - it can contain url() references but is omitted.

### Consequence:
- Broken `marker="url(#id)"` attributes won't be detected during validation
- Broken `color-profile="url(#id)"` attributes won't be detected
- Silent rendering failures with uncaught broken references

### Recommended Fix:
```javascript
const URL_REF_ATTRS = [
  'fill', 'stroke', 'clip-path', 'mask', 'filter', 'color-profile',
  'marker', 'marker-start', 'marker-mid', 'marker-end'  // Added 'marker'
];
```

---

### BUGGY-2: Missing Critical SVG Attributes in extractPresentationAttrs (flatten-pipeline.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/flatten-pipeline.js`
**Lines:** 1051-1068

### Content:
```javascript
function extractPresentationAttrs(el) {
  const presentationAttrs = [
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
    'fill-opacity', 'opacity', 'fill-rule', 'clip-rule', 'visibility', 'display',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'class', 'style'
  ];
  // ... copies these attributes only
}
```

### Issue Status: **BUGGY**

### Why It's Buggy:
This function extracts presentation attributes when converting shapes to paths or moving elements. However, it's critically incomplete. **Missing attributes include:**

1. **Stroke-related:** `stroke-dasharray`, `stroke-dashoffset` are included BUT `vector-effect` is missing (affects stroke rendering)
2. **Clipping/Masking:** `clip-path` and `mask` are **NOT included** - these are NOT inheritable but ARE critical presentation attributes that MUST be preserved
3. **Filter:** `filter` is **NOT included** - critical for visual effects
4. **Opacity chain:** Only `opacity`, `fill-opacity`, `stroke-opacity` - but `paint-order` is missing
5. **Marker attributes:** `marker`, `marker-start`, `marker-mid`, `marker-end` are **COMPLETELY MISSING**
6. **Text properties:** Missing `letter-spacing`, `word-spacing`, `text-decoration`
7. **Rendering:** Missing `shape-rendering`, `text-rendering`, `image-rendering`, `color-rendering`

### Consequence:
When shapes are converted to paths or elements are cloned:
- **clip-path is lost** → geometry renders UNCLIPPED
- **mask is lost** → transparency masking removed
- **filter is lost** → visual effects disappear
- **marker attributes are lost** → arrows/dots vanish from paths
- **paint-order is lost** → rendering order incorrect
- Attributes in the new element are missing, causing SILENT RENDERING BUGS

### Recommended Fix:
Use the complete `inheritableAttrs` and `nonInheritableAttrs` from svg-collections.js, or at minimum include:
```javascript
const presentationAttrs = [
  // Original (keep these)
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'fill-opacity', 'opacity', 'fill-rule', 'clip-rule', 'visibility', 'display',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'class', 'style',

  // CRITICAL ADDITIONS (missing)
  'clip-path',          // NON-INHERITABLE - clips geometry
  'mask',               // NON-INHERITABLE - masks transparency
  'filter',             // NON-INHERITABLE - visual effects
  'vector-effect',      // Affects stroke rendering
  'paint-order',        // Rendering order (fill/stroke/markers)
  'marker',             // Shorthand for marker-start/mid/end
  'marker-start',       // Path markers
  'marker-mid',         // Path markers
  'marker-end',         // Path markers
  'letter-spacing',     // Text spacing
  'word-spacing',       // Text spacing
  'text-decoration',    // Underline/overline/strikethrough
  'shape-rendering',    // Rendering hint
  'text-rendering',     // Rendering hint
  'image-rendering',    // Rendering hint
  'color-rendering',    // Rendering hint
  'pointer-events',     // Event handling (visual)
  'cursor',             // Visual feedback
];
```

---

### BUGGY-3: Hardcoded COLOR_ATTRS Missing 'stroke' in One Location (svg-toolbox.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Lines:** 5320 vs 6652 - INCONSISTENT DEFINITIONS

### Content:
**Location 1 (Line 5320):**
```javascript
const COLOR_ATTRS = new Set(['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color']);
```

**Location 2 (Line 6652):**
```javascript
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];
```

### Issue Status: **BUGGY**

### Why It's Buggy:
1. **Inconsistent data structures:** Location 1 uses `Set`, Location 2 uses array - different APIs
2. **Different ordering:** Suggests copy-paste errors
3. **Both missing critical attributes:**
   - `'marker-start'`, `'marker-mid'`, `'marker-end'` can reference colors (marker fill)
   - `'caret-color'` (CSS but used in SVG)
   - `'border-color'` (if used in foreignObject)

### Consequence:
Color validation or transformation functions might miss certain attributes, leading to:
- Colors not being validated properly
- Color optimization skipped for marker colors
- Inconsistent application of color fixes across the codebase

---

## SUSPICIOUS: Potential Issues Requiring Careful Review

### SUSPICIOUS-1: removeAttribute('clip-path') Without Verification (flatten-pipeline.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/flatten-pipeline.js`
**Lines:** 629

### Content:
```javascript
el.removeAttribute('clip-path');
count++;
```

### Context (Lines 610-631):
```javascript
if (clippedPolygon && clippedPolygon.length > 2) {
  const clippedPath = ClipPathResolver.polygonToPathData(clippedPolygon, opts.precision);

  // Update element
  if (el.tagName === 'path') {
    el.setAttribute('d', clippedPath);
  } else {
    // Convert shape to path
    const newPath = new SVGElement('path', {
      d: clippedPath,
      ...extractPresentationAttrs(el)  // PROBLEM: extractPresentationAttrs doesn't include clip-path!
    });

    if (el.parentNode) {
      el.parentNode.replaceChild(newPath, el);
    }
  }

  el.removeAttribute('clip-path');  // Line 629
  count++;
}
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
This code correctly removes the `clip-path` attribute AFTER applying the clip operation, BUT:
1. If `el.tagName !== 'path'`, the element is replaced with a NEW path (line 625)
2. Then it tries to remove the attribute from the OLD element (line 629)
3. **The OLD element is already disconnected from the DOM** - this removeAttribute is pointless
4. More critically, the NEW path element never had `clip-path` set anyway (it wasn't included by `extractPresentationAttrs`)

### Consequence:
- Dead code (harmless but indicates confused logic)
- BUT the underlying issue is real: if the clip geometry is applied to the path but the clip-path attribute isn't on the new element, a later refinement/validation might try to re-apply clipping

### Recommendation:
Apply `removeAttribute('clip-path')` to the `newPath` element BEFORE replacing:
```javascript
} else {
  const newPath = new SVGElement('path', {
    d: clippedPath,
    ...extractPresentationAttrs(el)
  });
  newPath.removeAttribute('clip-path');  // Ensure it's not there
  if (el.parentNode) {
    el.parentNode.replaceChild(newPath, el);
  }
}
```

---

### SUSPICIOUS-2: removeAttribute('mask') Without Verification (flatten-pipeline.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/flatten-pipeline.js`
**Lines:** 466

### Content:
```javascript
el.removeAttribute('mask');
count++;
```

### Context (Lines 450-470):
```javascript
if (clipPathData) {
  // Get original element's path data
  const origPathData = getElementPathData(el, opts.precision);

  if (origPathData) {
    // Perform boolean intersection
    const origPolygon = ClipPathResolver.pathToPolygon(origPathData, opts.curveSegments);
    const clipPolygon = ClipPathResolver.pathToPolygon(clipPathData, opts.curveSegments);

    // Apply clip (intersection)
    const clippedPolygon = intersectPolygons(origPolygon, clipPolygon);

    if (clippedPolygon && clippedPolygon.length > 2) {
      const clippedPath = ClipPathResolver.polygonToPathData(clippedPolygon, opts.precision);
      el.setAttribute('d', clippedPath);
      el.removeAttribute('mask');  // Line 466
      count++;
    }
  }
}
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
1. This is inside the `resolveAllMasks` function - it correctly removes the mask AFTER converting it to clip geometry
2. However, the logic is incomplete:
   - `maskPathData` is generated from the mask geometry (line 446)
   - But `maskToPathData` is called with `opacityThreshold: 0.5` (line 448)
   - This **loses precision** - opacity values are quantized to binary (visible/invisible)
   - The result is NOT geometrically equivalent to the original mask
   - BUT the code still removes the mask attribute as if the conversion was perfect

3. **Silent correctness loss:** If the SVG renderer later needs the exact mask (with gradual opacity), it will find it removed and the quantized path instead

### Consequence:
- Masks with partial opacity (gradient masks) are converted to binary paths, losing smoothness
- No warning is logged about this quality loss
- Optimization produces "valid" but visually incorrect SVG

### Recommendation:
Only remove mask if conversion preserves sufficient fidelity:
```javascript
// Estimate fidelity loss
const fidelityOk = maskEl.children.every(child => {
  const opacity = child.getAttribute('opacity') || '1';
  return opacity === '0' || opacity === '1' || parseFloat(opacity) === parseFloat(opacity);
});

if (fidelityOk) {
  el.removeAttribute('mask');
}
```

---

### SUSPICIOUS-3: removeAttribute('marker-*') Without Verification of Edge Cases (flatten-pipeline.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/flatten-pipeline.js`
**Lines:** 304-307

### Content:
```javascript
// Remove marker attributes from original element
for (const attr of markerAttrs) {
  el.removeAttribute(attr);
}
```

### Context (Lines 261-315):
```javascript
function resolveAllMarkers(root, defsMap, opts) {
  const errors = [];
  let count = 0;

  // Find all elements with marker attributes
  const markerAttrs = ['marker-start', 'marker-mid', 'marker-end', 'marker'];  // Line 266

  for (const attrName of markerAttrs) {
    const elements = findElementsWithAttribute(root, attrName);

    for (const el of elements) {
      if (el.tagName !== 'path' && el.tagName !== 'line' && el.tagName !== 'polyline' && el.tagName !== 'polygon') {
        continue;
      }

      try {
        // Resolve markers for this element
        const markerInstances = MarkerResolver.resolveMarkers(el, Object.fromEntries(defsMap));

        if (!markerInstances || markerInstances.length === 0) continue;

        // Convert markers to path data
        const markerPathData = MarkerResolver.markersToPathData(markerInstances, opts.precision);

        if (markerPathData) {
          // Create new path element for marker geometry
          const markerPath = new SVGElement('path', {
            d: markerPathData,
            fill: el.getAttribute('stroke') || 'currentColor',
          });

          // Insert after the original element
          if (el.parentNode) {
            const nextSibling = el.nextSibling;
            if (nextSibling) {
              el.parentNode.insertBefore(markerPath, nextSibling);
            } else {
              el.parentNode.appendChild(markerPath);
            }
            count++;
          }
        }

        // Remove marker attributes from original element  // Lines 304-307
        for (const attr of markerAttrs) {
          el.removeAttribute(attr);
        }
      } catch (e) {
        errors.push(`marker: ${e.message}`);
      }
    }
  }

  return { count, errors };
}
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
1. **Incomplete error handling:** If `MarkerResolver.resolveMarkers()` throws AND we're in the try block, the catch CATCHES it, but the marker attributes are STILL REMOVED from the output (line 307 is inside the try block)
2. **Over-removal:** `markerAttrs` includes ALL four attributes, but the outer loop iterates over them. If we resolve `marker-start`, we'll later try to remove it AGAIN when processing `marker-mid`, etc.
3. **No verification:** The code assumes `markersToPathData()` successfully created geometry, but what if it silently returned empty/invalid path data? The marker attributes are still removed.

### Consequence:
- If marker resolution fails with an exception, the original path LOSES its marker attributes but doesn't get the marker geometry
- The error is silently caught and added to errors array, but the user might not notice if they don't check errors
- Result: SVG has paths with no markers and no visual feedback

### Recommendation:
Only remove attributes AFTER successful geometry creation:
```javascript
if (markerPathData) {
  // ... insert path ...

  // Only remove marker attributes if conversion was successful
  for (const attr of markerAttrs) {
    el.removeAttribute(attr);
  }
  count++;
}
// If markerPathData is falsy, keep the attributes as fallback
```

---

### SUSPICIOUS-4: Inconsistent Attribute Validation for GROUP Elements (svg-toolbox.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Lines:** 1178-1197 and 5897-5920 (TWO IDENTICAL IMPLEMENTATIONS)

### Content:
Both locations have identical logic:
```javascript
export const removeNonInheritableGroupAttrs = createOperation(
  (doc, options = {}) => {
    const nonInheritable = [
      "x",       // <g> has no position
      "y",       // <g> has no position
      "width",   // <g> has no size
      "height",  // <g> has no size
      "viewBox", // Only valid on <svg>, <symbol>, <marker>, <pattern>
    ];
    // ... code ...
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
1. **Two identical implementations:** This function exists at BOTH line 1178 and line 5897 - CODE DUPLICATION
2. **Intentional by design but risky:** Comments say "CRITICAL: clip-path and mask ARE valid on <g>" - but they're INTENTIONALLY excluded from removal
3. **However, the list is INCOMPLETE:**
   - `rx` and `ry` (border radius) - not valid on `<g>` - should be removed
   - `cx`, `cy` (center) - not valid on `<g>` - should be removed
   - `r`, `d`, `points` (shape-specific) - not valid on `<g>` - should be removed

### Consequence:
- If someone creates a `<g>` element with `cx="50"` (from erroneously copied circle attributes), it won't be cleaned
- The attributes are silently ignored by renderers but bloat the file
- No consistency check

### Recommendation:
Extend the list:
```javascript
const nonInheritable = [
  "x", "y", "width", "height", "viewBox",  // Current
  "cx", "cy", "r", "rx", "ry",             // Shape attributes
  "d", "points",                             // Path/polygon data
  "x1", "y1", "x2", "y2",                   // Line attributes
];
```

---

### SUSPICIOUS-5: getShapeSpecificAttrs Missing 'image' Element (flatten-pipeline.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/flatten-pipeline.js`
**Lines:** 1074-1084

### Content:
```javascript
function getShapeSpecificAttrs(tagName) {
  const attrs = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
  };
  return attrs[tagName.toLowerCase()] || [];
}
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
1. **`image` element is missing** - it has `x`, `y`, `width`, `height`, `href`, `xlink:href`, `preserveAspectRatio` attributes that are shape-specific
2. The function is called in `flattenAllTransforms` (line 730):
   ```javascript
   for (const attr of getShapeSpecificAttrs(el.tagName)) {
     newPath.removeAttribute(attr);
   }
   ```
3. If an `image` element is converted to a path, its `x`, `y`, `width`, `height` attributes WON'T be removed because they're not in the list
4. Result: The new path element inherits image-specific attributes that have no meaning on paths

### Consequence:
- Converted image→path elements retain `x`, `y`, `width`, `height` attributes (harmless but bloat)
- More critically, if position information is needed elsewhere, having these attributes on a path might cause confusion or incorrect handling

### Recommendation:
```javascript
function getShapeSpecificAttrs(tagName) {
  const attrs = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    image: ['x', 'y', 'width', 'height', 'href', 'xlink:href', 'preserveAspectRatio'],
  };
  return attrs[tagName.toLowerCase()] || [];
}
```

---

### SUSPICIOUS-6: Duplicate INVALID_G_ATTRS Definitions (svg-toolbox.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Lines:** 4177 and 5897 (TWO IDENTICAL DEFINITIONS)

### Content:
Both locations:
```javascript
const INVALID_G_ATTRS = ['x', 'y', 'width', 'height'];
```

### Issue Status: **SUSPICIOUS**

### Why It's Suspicious:
1. **Code duplication** - defined twice in the same file
2. **Incomplete list:**
   - Missing `cx`, `cy` (if a circle was mistakenly created as `<g>`)
   - Missing `r`, `rx`, `ry` (shape attributes)
   - Missing `d`, `points` (path/polygon data)
   - Missing `x1`, `y1`, `x2`, `y2` (line attributes)

### Consequence:
- If a `<g>` element has invalid shape attributes, they won't be removed
- Redundant code makes maintenance harder

### Recommendation:
Define once, reuse:
```javascript
const INVALID_G_ATTRS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'x1', 'y1', 'x2', 'y2'];
export { INVALID_G_ATTRS };  // Export and reuse
```

---

## SAFE: Correct Implementations

### SAFE-1: Comprehensive Attribute Lists in svg-collections.js

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-collections.js`
**Lines:** 16-61, 66-75, 84-97

### Content:
```javascript
export const inheritableAttrs = new Set([
  'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters',
  'color-profile', 'color-rendering', 'cursor', 'direction', 'dominant-baseline',
  'fill', 'fill-opacity', 'fill-rule', 'font', 'font-family', 'font-size',
  'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
  'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering',
  'letter-spacing', 'marker', 'marker-end', 'marker-mid', 'marker-start',
  'paint-order', 'pointer-events', 'shape-rendering', 'stroke', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-opacity', 'stroke-width', 'text-anchor', 'text-rendering', 'visibility',
  'word-spacing', 'writing-mode',
]);

export const nonInheritableAttrs = new Set([
  'clip-path', 'display', 'filter', 'mask', 'opacity', 'text-decoration',
  'transform', 'unicode-bidi',
]);

export const referencesProps = new Set([
  'clip-path', 'color-profile', 'fill', 'filter', 'href', 'marker-end',
  'marker-mid', 'marker-start', 'mask', 'stroke', 'style', 'xlink:href',
]);
```

### Issue Status: **SAFE**

### Why It's Safe:
1. ✓ Comprehensive - covers 40+ inheritable attributes
2. ✓ Non-inheritable attributes separated - important distinction
3. ✓ Reference properties clearly marked
4. ✓ All marker attributes included (`marker`, `marker-start`, `marker-mid`, `marker-end`)
5. ✓ All critical presentation attributes present
6. ✓ Includes rendering hints (shape-rendering, text-rendering, image-rendering, color-rendering)

### Assessment:
This is the authoritative source for attribute lists. **OTHER PARTS OF THE CODE SHOULD USE THESE INSTEAD OF HARDCODING ARRAYS.**

---

### SAFE-2: Marker Attributes Correctly Used in moveGroupAttrsToElems (svg-toolbox.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Lines:** 2269-2301

### Content:
```javascript
export const moveGroupAttrsToElems = createOperation((doc, options = {}) => {
  const processElement = (el) => {
    if (el.tagName === "g") {
      for (const attr of [...el.getAttributeNames()]) {
        // Only process inheritable attributes (from the complete svg-collections set)
        if (!inheritableAttrs.has(attr)) continue;

        const val = el.getAttribute(attr);
        if (val) {
          // Propagate to children that don't have this attribute
          for (const child of el.children) {
            if (isElement(child) && !child.hasAttribute(attr)) {
              child.setAttribute(attr, val);
            }
          }
          el.removeAttribute(attr);
        }
      }
    }
    // ...
  };
});
```

### Issue Status: **SAFE**

### Why It's Safe:
1. ✓ Uses `inheritableAttrs` from svg-collections.js - correct source
2. ✓ Only propagates inheritable attributes - won't move clip-path/mask/filter
3. ✓ Checks `!child.hasAttribute(attr)` - doesn't override child's own values
4. ✓ Removes from group only if successfully moved to all children
5. ✓ Includes marker attributes automatically via inheritableAttrs

### Assessment:
This is a correct pattern that OTHER functions should follow.

---

### SAFE-3: Comprehensive Attribute List in attrsGroups (svg-collections.js)

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-collections.js`
**Lines:** 601-671

### Content (Partial):
```javascript
export const attrsGroups = {
  presentation: new Set([
    'alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule',
    'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile',
    'color-rendering', 'cursor', 'direction', 'display', 'dominant-baseline',
    'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter',
    'flood-color', 'flood-opacity', 'font', 'font-family', 'font-size',
    'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
    'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering',
    'kerning', 'letter-spacing', 'lighting-color', 'marker', 'marker-end',
    'marker-mid', 'marker-start', 'mask', 'opacity', 'overflow', 'paint-order',
    'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor',
    'text-decoration', 'text-rendering', 'transform', 'transform-origin',
    'unicode-bidi', 'vector-effect', 'visibility', 'word-spacing', 'writing-mode'
  ]),
  // ... other groups ...
};
```

### Issue Status: **SAFE**

### Why It's Safe:
1. ✓ Includes ALL presentation attributes mentioned in SVG spec
2. ✓ All marker attributes present
3. ✓ All rendering attributes present
4. ✓ All filter/mask/clip attributes present
5. ✓ Properly categorized by type

### Assessment:
This is the master reference - **svg-toolbox should use this instead of hardcoding local arrays.**

---

## Summary & Recommendations

### Critical Actions Required:

1. **FIX IMMEDIATELY (BUGGY-1, BUGGY-2, BUGGY-3):**
   - Add `'marker'` and `'color-profile'` to URL_REF_ATTRS
   - Fix `extractPresentationAttrs` to include: clip-path, mask, filter, vector-effect, paint-order, marker attributes, and all text/rendering properties
   - Consolidate COLOR_ATTRS definitions and ensure both include all color-capable attributes

2. **REVIEW & TEST (SUSPICIOUS issues):**
   - Remove dead code in flatten-pipeline.js line 629
   - Add fidelity checks before removing mask attributes
   - Fix marker attribute removal to only occur on successful resolution
   - Consolidate duplicate INVALID_G_ATTRS and extend the list
   - Add 'image' to getShapeSpecificAttrs

3. **ADOPT SAFE PATTERNS:**
   - Replace all hardcoded attribute arrays with references to svg-collections.js
   - Use `inheritableAttrs` and `nonInheritableAttrs` throughout
   - Follow the pattern used in moveGroupAttrsToElems and moveElemsAttrsToGroup

### Testing Recommendations:

- Create test SVG with paths that have markers, clips, masks, filters - verify they're preserved through transformations
- Test with `<g>` elements containing clip-path and mask - verify not removed
- Test marker attribute resolution with broken references - verify they're detected
- Test extraction/copying of presentation attributes when converting shapes - verify all attributes transferred

