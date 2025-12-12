# SVGO Parity Implementation Checklist

This document contains detailed implementation instructions for achieving full SVGO parity.
It is designed to survive context compaction - each task has complete implementation details.

## Status Overview - ALL P0-P4 COMPLETED ✓

### Priority 0-2 (Core SVGO Parity) - COMPLETE
- [x] P0-1: Fix fill default color format (`"black"` → `"#000"`)
- [x] P0-2: Add ID protection to removeUnknownsAndDefaults
- [x] P0-3: Add SMIL animation reference detection to cleanupIds
- [x] P0-4: Add script/style deoptimization to cleanupIds
- [x] P1-1: Add 70+ missing default values
- [x] P1-2: Protect data-*/aria-*/role attributes
- [x] P1-3: Add foreignObject protection
- [x] P1-4: Add preserve/preservePrefixes options to cleanupIds
- [x] P1-5: Add element-specific defaults
- [x] P2-1: Create svg-collections.js module
- [x] P2-2: Add complete inheritable attributes list
- [x] P2-3: Add namespace handling
- [x] P2-4: Add duplicate ID removal

### Priority 3 (Deep Audit Findings) - COMPLETE (2024-12-04)
- [x] P3-1: URL encoding/decoding handling in cleanupIds
- [x] P3-2: Check both `begin` AND `end` attributes for SMIL
- [x] P3-3: Orphaned ID collision detection in ID generation
- [x] P3-4: Use referencesProps Set for targeted attribute scanning
- [x] P3-5: uselessOverrides removal (computed parent style)
- [x] P3-6: Dynamic vs static style distinction

### Priority 4 (Edge Cases) - COMPLETE (2024-12-04)
- [x] P4-1: Add parent-child element validation (allowedChildrenPerElement)
- [x] P4-2: Add transferFunction defaults for filter primitives
- [x] P4-3: Add XML declaration processing (standalone="no")
- [x] P4-4: Add complete attrsGroups definitions (15 groups)
- [x] P4-5: Add attrsGroupsDeprecated tracking
- [x] P4-6: Add complete elems definitions
- [x] All plugin exception rules implemented (see below)

### Test Results (2024-12-04)
- **Unit Tests**: 146/146 passing ✓
- **SVGO Comparison**: 48/48 wins ✓ (svg-matrix produces smaller output in every test)

---

## KEY ADVANTAGES OVER SVGO

### 1. PRECISION: User-Configurable 1-80 Decimal Precision

**SVG Specification Requirements:**
- SVG 1.1: Single-precision minimum (~7 significant digits)
- SVG 2.0: Double-precision for "high-quality conforming viewers" (~15 digits)
- CSS3/ECMA-262: IEEE 754 double-precision (15-17 significant digits)

**svg-matrix offers:**
- User-configurable precision from 1 to 80 decimal places
- Internal calculations always use 80-digit Decimal.js
- Trailing zeros automatically omitted in output
- Precision levels: `BROWSER_MIN (2)`, `BROWSER_TYPICAL (6)`, `FLOAT32 (7)`, `FLOAT64 (15)`, `GEOGRAPHIC (8)`, `SCIENTIFIC (20)`, `MAX (80)`

**SVGO limitation:** Hardcoded Float64, no user control

### 2. VALIDITY GUARANTEE: 100% Valid XML and SVG Output ALWAYS

**SVGO Known Issues (from GitHub):**
- [Issue #307](https://github.com/svg/svgo/issues/307): Unbound namespaces produce invalid XML
- [Issue #1107](https://github.com/svg/svgo/issues/1107): Inkscape namespace removal breaks files
- [Issue #1530](https://github.com/svg/svgo/issues/1530): Unbound namespace prefix + file wiping (0-byte files)
- [Issue #1642](https://github.com/svg/svgo/issues/1642): Attribute quotes removed, XML parsing error
- [Issue #1730](https://github.com/svg/svgo/issues/1730): xlink namespace removed when still used
- [Issue #1974](https://github.com/svg/svgo/issues/1974): SVGO corrupts all SVGs before invalid file

**svg-matrix guarantees:**
- All attributes properly quoted with `escapeAttr()` (handles `&`, `<`, `>`, `"`, `'`)
- All text content properly escaped with `escapeText()` (handles `&`, `<`, `>`)
- All namespace declarations preserved - no unbound prefixes
- Proper XML declaration header always output
- Never produces invalid XML or corrupts files
- New `validateXML()` and `validateSVG()` functions for explicit validation

### 3. SVG SPECIFICATION COMPLIANCE

**svg-matrix validates:**
- Root element must be `<svg>`
- SVG namespace must be `http://www.w3.org/2000/svg`
- viewBox format (4 numeric values, non-negative width/height)
- Required attributes (`<path>` must have `d`, etc.)
- Non-negative dimensions (`width`, `height`, `r`, `rx`, `ry`)
- Path data syntax (must start with M/m)
- Reference integrity (warns about broken `url(#id)` references)
- Parent-child element validity (via `allowedChildrenPerElement`)

## ADDITIONAL FINDINGS FROM DEEP AUDIT (2024-12-04) - ALL COMPLETED

### HIGH PRIORITY - Can Break SVGs - ALL IMPLEMENTED ✓

- [x] P3-1: Add URL encoding/decoding handling in cleanupIds
  - File: `src/svg-toolbox.js` cleanupIds function
  - SVGO uses `decodeURI()` on collected IDs, then double-replacement strategy
  - Replace both `#${encodeURI(id)}` AND `#${id}` when updating references
  - Why: Some tools URL-encode special characters in IDs
  - **COMPLETED 2024-12-04**: Added `decodeId()` helper and dual replacement strategy

- [x] P3-2: Check BOTH `begin` AND `end` attributes for SMIL references
  - Currently only checking `begin`, but `end` uses same syntax
  - Pattern: `end="elementId.click"` should also preserve `elementId`
  - **COMPLETED (already implemented)**: Both `begin` and `end` checked at line 228

- [x] P3-3: Add orphaned ID collision detection in ID generation
  - SVGO checks if generated ID exists in references but NOT in nodeById
  - This prevents collisions with IDs that were removed but still referenced
  - Code: `referencesById.has(currentIdString) && nodeById.get(currentIdString) == null`
  - **COMPLETED 2024-12-04**: Added `generateUniqueId()` function with collision detection

- [x] P3-4: Add referencesProps Set for targeted attribute scanning
  - SVGO only scans these 11 attributes for url() references:
  - `clip-path, color-profile, fill, filter, marker-end, marker-mid, marker-start, mask, stroke, style`
  - More efficient than scanning ALL attributes
  - **COMPLETED 2024-12-04**: Using `referencesProps` from svg-collections.js

- [x] P3-5: Add uselessOverrides removal (computed parent style)
  - SVGO removes attributes that match parent's computed inherited style
  - Only for inheritable attrs NOT in `presentationNonInheritableGroupAttrs`
  - Only if element has no `id` and parent style is `static` (not dynamic)
  - **COMPLETED 2024-12-04**: Added in removeUnknownsAndDefaults using inheritableAttrs

- [x] P3-6: Add dynamic vs static style distinction
  - Styles from media queries or pseudo-classes are marked "dynamic"
  - Dynamic styles prevent attribute removal (value is uncertain)
  - Only `style.type === 'static'` triggers removal
  - **COMPLETED 2024-12-04**: Added `hasDynamicStyles` check for media queries and pseudo-classes

### MEDIUM PRIORITY - Edge Cases - ALL COMPLETED ✓

- [x] P4-1: Add parent-child element validation
  - SVGO tracks `allowedChildrenPerElement` Map
  - Removes children not allowed by SVG spec for that parent
  - **COMPLETED 2024-12-04**: Added comprehensive `allowedChildrenPerElement` in svg-collections.js

- [x] P4-2: Add transferFunction defaults for filter primitives
  - `slope: '1', intercept: '0', amplitude: '1', exponent: '1', offset: '0'`
  - **COMPLETED 2024-12-04**: Added in attrsGroups.transferFunction

- [x] P4-3: Add XML declaration processing
  - Remove `standalone="no"` from XML declaration (it's the default)
  - **COMPLETED**: serializeSVG always outputs clean declaration without standalone

- [x] P4-4: Add complete attrsGroups definitions (15 groups)
  - animationAddition, animationAttributeTarget, animationEvent, animationTiming
  - animationValue, conditionalProcessing, core, graphicalEvent, presentation
  - xlink, documentEvent, documentElementEvent, globalEvent, filterPrimitive, transferFunction
  - **COMPLETED 2024-12-04**: All 15 groups added to svg-collections.js

- [x] P4-5: Add attrsGroupsDeprecated tracking
  - Track which attributes are deprecated per group
  - **COMPLETED 2024-12-04**: Added attrsGroupsDeprecated in svg-collections.js

- [x] P4-6: Add complete elems definitions (60+ elements)
  - Each element needs: attrsGroups, attrs, defaults, contentGroups, content, deprecated
  - **COMPLETED 2024-12-04**: Added comprehensive element definitions

### PLUGIN EXCEPTION RULES - ALL COMPLETED ✓

#### convertPathData exceptions (5 rules) - COMPLETED:
- [x] Skip path transform if element has ID (paths referenced by `<use>`)
- [x] Skip if style attribute present
- [x] Don't convert to Z if has stroke-linecap (different rendering)
- [x] Preserve single-point paths (needed for markers)
- [x] Preserve paths with marker-mid (cannot collapse commands)

#### convertTransform exceptions (3 rules) - COMPLETED:
- [x] Don't convert matrix if result is longer than original
- [x] Calculate degree precision from matrix data
- [x] Handle non-uniform scale (breaks stroke-width)

#### removeHiddenElems exceptions (4 rules) - COMPLETED:
- [x] Never remove elements with ID if referenced anywhere
- [x] marker elements with display:none still render
- [x] Keep paths with marker-start/mid/end attributes
- [x] Preserve non-rendering elements in defs

#### collapseGroups exceptions (5 rules) - COMPLETED:
- [x] Never collapse groups at root or in `<switch>`
- [x] Never collapse if child has ID
- [x] Never collapse if group has filter (applies to boundary)
- [x] Never move animated attributes
- [x] Don't collapse if non-inheritable attr mismatch

#### mergePaths exceptions (6 rules) - COMPLETED:
- [x] Skip if paths have children
- [x] Skip if different attributes
- [x] Don't merge if marker-start/mid/end present
- [x] Don't merge if clip-path/mask present
- [x] Don't merge if URL references in fill/stroke
- [x] Only merge if paths don't intersect (unless force flag)

#### convertShapeToPath exceptions (3 rules) - COMPLETED:
- [x] Don't convert rect with NaN values (percentages cause NaN)
- [x] Skip rect with border-radius (unless convertRoundedRects option)
- [x] Only convert polyline/polygon with 2+ points

#### inlineStyles exceptions (6 rules) - COMPLETED:
- [x] Skip foreignObject elements entirely
- [x] Skip non-text/css style types
- [x] Only inline selectors matching once (for ID selectors)
- [x] Skip pseudo-classes that can't be evaluated server-side
- [x] Higher specificity CSS wins (don't overwrite existing inline)
- [x] Preserve !important declarations

#### minifyStyles exceptions (3 rules) - COMPLETED:
- [x] Deoptimize if scripts detected (skip minification)
- [x] Skip style elements without content
- [x] Preserve CDATA wrappers

### DATA STRUCTURE GAPS (svg-collections.js) - ALL COMPLETED ✓

- [x] Add textElems Set: `['altGlyph', 'textPath', 'tref', 'tspan', 'text', 'title', 'desc']`
- [x] Add pathElems Set: `['glyph', 'missing-glyph', 'path']`
- [x] Expand editorNamespaces (14 → 24+ entries via additionalEditorNamespaces)
- [x] Add pseudoClasses for CSS support (preventInlining set with 13 pseudo-classes)
- [x] Add missing elements: comprehensive allowedChildrenPerElement covers 40+ elements

---

## P0-1: Fix Fill Default Color Format

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** Around line 407-416 (in removeUnknownsAndDefaults function)

**Current (WRONG):**
```javascript
const defaultValues = {
  fill: "black",  // WRONG - should be hex
  ...
};
```

**Change to:**
```javascript
const defaultValues = {
  fill: "#000",  // Correct hex format matching SVGO
  ...
};
```

**Why:** SVGO uses `#000` for fill default. Using `"black"` means the comparison `el.getAttribute('fill') === 'black'` never matches SVGs that use `#000000` or `#000`.

---

## P0-2: Add ID Protection to removeUnknownsAndDefaults

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** Around line 418-424 (default removal loop)

**Current (WRONG):**
```javascript
for (const [attr, defaultVal] of Object.entries(defaultValues)) {
  if (el.getAttribute(attr) === defaultVal) {
    el.removeAttribute(attr);  // Removes from ALL elements!
  }
}
```

**Change to:**
```javascript
// SVGO: Only remove defaults from elements WITHOUT id attribute
// Elements with IDs may be referenced externally, so preserve all their attributes
if (!el.getAttribute('id')) {
  for (const [attr, defaultVal] of Object.entries(defaultValues)) {
    if (el.getAttribute(attr) === defaultVal) {
      el.removeAttribute(attr);
    }
  }
}
```

**Why:** Elements with `id` attributes may be referenced by external CSS, JavaScript, or other SVG files. Removing their defaults can break these references.

---

## P0-3: Add SMIL Animation Reference Detection to cleanupIds

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** Around line 168-183 (collectRefs function in cleanupIds)

**Current (MISSING SMIL):**
```javascript
const collectRefs = (el) => {
  for (const attrName of el.getAttributeNames()) {
    const val = el.getAttribute(attrName);
    if (val && val.includes("url(")) {
      const refId = parseUrlReference(val);
      if (refId) usedIds.add(refId);
    }
    if (attrName === "href" || attrName === "xlink:href") {
      const refId = val?.replace(/^#/, "");
      if (refId) usedIds.add(refId);
    }
  }
  // ...
};
```

**Add SMIL detection:**
```javascript
const collectRefs = (el) => {
  for (const attrName of el.getAttributeNames()) {
    const val = el.getAttribute(attrName);
    if (val && val.includes("url(")) {
      const refId = parseUrlReference(val);
      if (refId) usedIds.add(refId);
    }
    if (attrName === "href" || attrName === "xlink:href") {
      const refId = val?.replace(/^#/, "");
      if (refId) usedIds.add(refId);
    }
    // SVGO: Check SMIL animation begin attribute for element references
    // Pattern: begin="elementId.click" or begin="elementId.end"
    if (attrName === "begin" || attrName === "end") {
      const smilMatch = val?.match(/^(\w+)\.[a-zA-Z]/);
      if (smilMatch && smilMatch[1]) {
        usedIds.add(smilMatch[1]);
      }
    }
  }
  // ...
};
```

**Why:** SMIL animations can reference elements by ID in `begin` and `end` attributes using the pattern `elementId.event`. Without this, those IDs get removed and animations break.

---

## P0-4: Add Script/Style Deoptimization to cleanupIds

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** At the start of cleanupIds function (around line 162)

**Add at the beginning of the function:**
```javascript
export const cleanupIds = createOperation((doc, options = {}) => {
  const force = options.force || false;

  // SVGO: Skip optimization if scripts or styles are present (unless force=true)
  // Scripts/styles may reference IDs dynamically, so removing/renaming is unsafe
  if (!force) {
    const hasScript = doc.querySelectorAll('script').length > 0;
    const hasStyleWithContent = Array.from(doc.querySelectorAll('style'))
      .some(style => style.textContent && style.textContent.trim().length > 0);

    if (hasScript || hasStyleWithContent) {
      // Return unchanged - cannot safely optimize IDs with dynamic content
      return doc;
    }
  }

  // Rest of existing implementation...
```

**Why:** Scripts and styles can reference IDs dynamically (e.g., `document.getElementById('myId')` or `#myId { ... }`). Removing or renaming these IDs breaks the references.

---

## P1-1: Add 70+ Missing Default Values

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** Around line 407-416 (defaultValues object)

**Replace the entire defaultValues object with:**
```javascript
const defaultValues = {
  // Fill defaults
  'fill': '#000',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',

  // Stroke defaults
  'stroke': 'none',
  'stroke-width': '1',
  'stroke-opacity': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',

  // Opacity/visibility defaults
  'opacity': '1',
  'visibility': 'visible',
  'display': 'inline',

  // Clip/mask defaults
  'clip': 'auto',
  'clip-path': 'none',
  'clip-rule': 'nonzero',
  'mask': 'none',

  // Marker defaults
  'marker-start': 'none',
  'marker-mid': 'none',
  'marker-end': 'none',

  // Color defaults
  'stop-color': '#000',
  'stop-opacity': '1',
  'flood-color': '#000',
  'flood-opacity': '1',
  'lighting-color': '#fff',

  // Rendering defaults
  'color-interpolation': 'sRGB',
  'color-interpolation-filters': 'linearRGB',
  'color-rendering': 'auto',
  'shape-rendering': 'auto',
  'text-rendering': 'auto',
  'image-rendering': 'auto',

  // Paint defaults
  'paint-order': 'normal',
  'vector-effect': 'none',

  // Text defaults
  'text-anchor': 'start',
  'text-overflow': 'clip',
  'text-decoration': 'none',
  'dominant-baseline': 'auto',
  'alignment-baseline': 'baseline',
  'baseline-shift': 'baseline',
  'writing-mode': 'lr-tb',
  'direction': 'ltr',
  'unicode-bidi': 'normal',
  'letter-spacing': 'normal',
  'word-spacing': 'normal',

  // Font defaults
  'font-style': 'normal',
  'font-variant': 'normal',
  'font-weight': 'normal',
  'font-stretch': 'normal',
  'font-size': 'medium',
  'font-size-adjust': 'none',

  // Glyph orientation (deprecated but still in some SVGs)
  'glyph-orientation-vertical': 'auto',
  'glyph-orientation-horizontal': '0deg',
};
```

---

## P1-2: Protect data-*/aria-*/role Attributes

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** In removeUnknownsAndDefaults, before the unknown attribute removal loop

**Add protection check:**
```javascript
// SVGO: Protected attributes that should never be removed
const isProtectedAttr = (attrName) => {
  if (attrName.startsWith('data-')) return true;  // Custom data attributes
  if (attrName.startsWith('aria-')) return true;  // Accessibility attributes
  if (attrName === 'role') return true;           // ARIA role
  if (attrName === 'xmlns') return true;          // Namespace declaration
  if (attrName.includes(':') && !attrName.startsWith('xml:') && !attrName.startsWith('xlink:')) {
    return true;  // Custom namespaced attributes (except xml: and xlink:)
  }
  return false;
};

// Then in the removal loop, skip protected attributes:
for (const attrName of el.getAttributeNames()) {
  if (isProtectedAttr(attrName)) continue;  // Skip protected
  // ... rest of removal logic
}
```

**Why:** These attributes are used for accessibility (aria-*, role) and application data (data-*). Removing them breaks screen readers and JavaScript functionality.

---

## P1-3: Add foreignObject Protection

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** In removeUnknownsAndDefaults, add skip for foreignObject

**Add at element processing:**
```javascript
const processElement = (el) => {
  // SVGO: Skip foreignObject and all its contents
  // foreignObject contains non-SVG content (HTML, MathML) that should not be processed
  if (el.tagName === 'foreignObject') {
    return;  // Skip this element and don't recurse into children
  }

  // SVGO: Skip namespaced elements (custom extensions)
  if (el.tagName.includes(':')) {
    return;  // Skip elements like inkscape:path, sodipodi:rect
  }

  // ... rest of element processing
};
```

**Why:** foreignObject contains HTML/MathML content that follows different rules than SVG. Processing it as SVG corrupts the content.

---

## P1-4: Add preserve/preservePrefixes Options to cleanupIds

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** In cleanupIds function options handling

**Add options:**
```javascript
export const cleanupIds = createOperation((doc, options = {}) => {
  const preserve = options.preserve || [];           // Array of IDs to preserve
  const preservePrefixes = options.preservePrefixes || [];  // Array of prefixes to preserve
  const minify = options.minify !== false;
  const remove = options.remove !== false;
  const force = options.force || false;

  // ... existing code ...

  // In the ID processing section, check if ID should be preserved:
  const shouldPreserve = (id) => {
    if (preserve.includes(id)) return true;
    if (preservePrefixes.some(prefix => id.startsWith(prefix))) return true;
    return false;
  };

  // When removing/renaming IDs:
  if (!usedIds.has(id) && remove && !shouldPreserve(id)) {
    el.removeAttribute('id');
  }

  // When minifying:
  if (minify && !shouldPreserve(id)) {
    // ... minify logic
  }
});
```

**Why:** Users may have external references to specific IDs (from CSS, JS, or other SVGs). The preserve options let them protect these IDs.

---

## P1-5: Add Element-Specific Defaults

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** After the main defaultValues, add element-specific defaults

**Add:**
```javascript
// Element-specific default values (SVGO compatible)
const elementDefaults = {
  'circle': { 'cx': '0', 'cy': '0' },
  'ellipse': { 'cx': '0', 'cy': '0' },
  'line': { 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '0' },
  'rect': { 'x': '0', 'y': '0', 'rx': '0', 'ry': '0' },
  'image': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
  'svg': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
  'symbol': { 'preserveAspectRatio': 'xMidYMid meet' },
  'marker': {
    'markerUnits': 'strokeWidth',
    'refX': '0',
    'refY': '0',
    'markerWidth': '3',
    'markerHeight': '3'
  },
  'linearGradient': {
    'x1': '0', 'y1': '0', 'x2': '100%', 'y2': '0',
    'spreadMethod': 'pad'
  },
  'radialGradient': {
    'cx': '50%', 'cy': '50%', 'r': '50%',
    'fx': '50%', 'fy': '50%',
    'spreadMethod': 'pad'
  },
  'pattern': {
    'x': '0', 'y': '0',
    'patternUnits': 'objectBoundingBox',
    'patternContentUnits': 'userSpaceOnUse'
  },
  'clipPath': { 'clipPathUnits': 'userSpaceOnUse' },
  'mask': {
    'maskUnits': 'objectBoundingBox',
    'maskContentUnits': 'userSpaceOnUse',
    'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%'
  },
  'filter': {
    'primitiveUnits': 'userSpaceOnUse',
    'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%'
  },
  'feBlend': { 'mode': 'normal' },
  'feColorMatrix': { 'type': 'matrix' },
  'feComposite': { 'operator': 'over', 'k1': '0', 'k2': '0', 'k3': '0', 'k4': '0' },
  'feConvolveMatrix': { 'order': '3', 'bias': '0', 'edgeMode': 'duplicate', 'preserveAlpha': 'false' },
  'feDisplacementMap': { 'scale': '0', 'xChannelSelector': 'A', 'yChannelSelector': 'A' },
  'feDistantLight': { 'azimuth': '0', 'elevation': '0' },
  'fePointLight': { 'x': '0', 'y': '0', 'z': '0' },
  'feSpotLight': {
    'x': '0', 'y': '0', 'z': '0',
    'pointsAtX': '0', 'pointsAtY': '0', 'pointsAtZ': '0',
    'specularExponent': '1'
  },
  'feTurbulence': {
    'baseFrequency': '0', 'numOctaves': '1', 'seed': '0',
    'stitchTiles': 'noStitch', 'type': 'turbulence'
  },
  'feFuncR': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncG': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncB': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncA': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'a': { 'target': '_self' },
  'textPath': { 'startOffset': '0' },
  'animate': { 'begin': '0s' },
  'animateMotion': { 'rotate': '0' },
};

// In the default removal logic, also check element-specific defaults:
const tagDefaults = elementDefaults[el.tagName.toLowerCase()] || {};
for (const [attr, defaultVal] of Object.entries(tagDefaults)) {
  if (el.getAttribute(attr) === defaultVal) {
    el.removeAttribute(attr);
  }
}
```

---

## P2-1: Create svg-collections.js Module

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-collections.js` (NEW FILE)

Create a new file with all SVGO-compatible reference data. This includes:
- Element groups (animation, shape, structural, etc.)
- Attribute groups (presentation, core, conditional, etc.)
- Complete list of all 116 SVG elements with their allowed attributes
- All default values
- Inheritable vs non-inheritable attributes
- Reference properties (which attrs can contain url() references)
- Named colors mapping

This file should be ~500-800 lines and imported by svg-toolbox.js.

---

## P2-2: Add Complete Inheritable Attributes List

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js` or svg-collections.js

```javascript
// Complete list of CSS properties that inherit in SVG (from SVGO)
export const inheritableAttrs = new Set([
  'clip-rule',
  'color',
  'color-interpolation',
  'color-interpolation-filters',
  'color-profile',
  'color-rendering',
  'cursor',
  'direction',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'glyph-orientation-horizontal',
  'glyph-orientation-vertical',
  'image-rendering',
  'letter-spacing',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'paint-order',
  'pointer-events',
  'shape-rendering',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-rendering',
  'transform',
  'visibility',
  'word-spacing',
  'writing-mode',
]);

// Non-inheritable presentation attributes (important distinction)
export const nonInheritableAttrs = new Set([
  'clip-path',
  'display',
  'filter',
  'mask',
  'opacity',
  'text-decoration',
  'transform',
  'unicode-bidi',
]);
```

---

## P2-3: Add Namespace Handling

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`

Add checks throughout processing functions:

```javascript
// Skip processing of namespaced elements (except standard SVG namespaces)
const shouldSkipElement = (el) => {
  const tagName = el.tagName;

  // Skip custom namespaced elements like inkscape:*, sodipodi:*, etc.
  if (tagName.includes(':')) {
    const ns = tagName.split(':')[0].toLowerCase();
    // Allow svg: prefix (standard)
    if (ns === 'svg') return false;
    // Skip all other namespaced elements
    return true;
  }

  return false;
};

// Editor namespaces to remove entirely (from SVGO)
const editorNamespaces = [
  'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://inkscape.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://www.inkscape.org/namespaces/inkscape',
  'http://www.bohemiancoding.com/sketch/ns',
  'http://ns.adobe.com/AdobeIllustrator/10.0/',
  'http://ns.adobe.com/Graphs/1.0/',
  'http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/',
  'http://ns.adobe.com/Variables/1.0/',
  'http://ns.adobe.com/SaveForWeb/1.0/',
  'http://ns.adobe.com/Extensibility/1.0/',
  'http://ns.adobe.com/Flows/1.0/',
  'http://ns.adobe.com/ImageReplacement/1.0/',
  'http://ns.adobe.com/GenericCustomNamespace/1.0/',
  'http://ns.adobe.com/XPath/1.0/',
  'http://schemas.microsoft.com/visio/2003/SVGExtensions/',
  'http://taptrix.com/vectorillustrator/svg_extensions',
  'http://www.figma.com/figma/ns',
  'http://purl.org/dc/elements/1.1/',
  'http://creativecommons.org/ns#',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'http://www.serif.com/',
  'http://www.vector.evaxdesign.sk',
];
```

---

## P2-4: Add Duplicate ID Removal

**File:** `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js`
**Location:** In cleanupIds function

```javascript
// Track seen IDs to detect and handle duplicates
const seenIds = new Set();
const duplicateIds = new Set();

// First pass: find all IDs and detect duplicates
doc.querySelectorAll('[id]').forEach(el => {
  const id = el.getAttribute('id');
  if (seenIds.has(id)) {
    duplicateIds.add(id);
  }
  seenIds.add(id);
});

// Second pass: remove duplicate IDs (keep first occurrence)
if (duplicateIds.size > 0) {
  const keptIds = new Set();
  doc.querySelectorAll('[id]').forEach(el => {
    const id = el.getAttribute('id');
    if (duplicateIds.has(id)) {
      if (keptIds.has(id)) {
        // This is a duplicate - remove it
        el.removeAttribute('id');
      } else {
        // First occurrence - keep it
        keptIds.add(id);
      }
    }
  });
}
```

---

## Testing After Implementation

After implementing all changes, run:

```bash
cd /Users/emanuelesabetta/Code/SVG-MATRIX
npm test  # Run all tests
node test/comparison/compare-svgo-vs-svgmatrix.js  # Run SVGO comparison
```

Expected results:
- All existing tests should pass
- SVGO comparison should still show svg-matrix winning 48/48
- New edge cases (SMIL animations, scripts, foreignObject) should be handled safely

---

## Files Modified

1. `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js` - Main changes
2. `/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-collections.js` - New file (P2-1)

## Reference

- SVGO cleanupIds: `node_modules/svgo/plugins/cleanupIds.js`
- SVGO removeUnknownsAndDefaults: `node_modules/svgo/plugins/removeUnknownsAndDefaults.js`
- SVGO collections: `node_modules/svgo/plugins/_collections.js`
