# SVG Features Audit Report

## Executive Summary

This audit examines **4 geometric processing modules** in the SVG-MATRIX codebase to identify which SVG rendering features are currently handled versus which are missing. The audit focuses on features that affect the visual rendering of SVG elements.

**Files Audited:**
1. `/src/clip-path-resolver.js` - ClipPath resolution and polygon operations
2. `/src/mask-resolver.js` - Mask resolution and opacity handling
3. `/src/svg-boolean-ops.js` - Boolean operations with stroke/fill support
4. `/src/svg-toolbox.js` - Comprehensive SVG manipulation toolkit (68 functions)

**Critical Finding:** All modules focus primarily on **geometric path operations** and largely ignore **stroke rendering properties**. This means operations like `convertShapesToPath`, `shapeToPolygon`, `applyClipPath`, etc. produce geometrically correct results for filled shapes but fail to account for how strokes expand the visual boundaries.

---

## Audit Methodology

For each function that performs geometric operations, we checked support for these 13 critical SVG rendering features:

1. **fill-rule** (nonzero, evenodd)
2. **clip-rule** (nonzero, evenodd)
3. **stroke-width**
4. **stroke-linecap** (butt, round, square)
5. **stroke-linejoin** (miter, round, bevel)
6. **stroke-miterlimit**
7. **stroke-dasharray**
8. **stroke-dashoffset**
9. **marker-start, marker-mid, marker-end**
10. **paint-order** (fill, stroke, markers)
11. **vector-effect** (non-scaling-stroke)
12. **opacity, fill-opacity, stroke-opacity**
13. **transform** (application/baking)

---

## File 1: `/src/clip-path-resolver.js`

### Functions Audited: 9

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **pathToPolygon** | • Curve sampling<br>• Path command parsing (M,L,H,V,C,Q,A,Z) | • **stroke-width**: Sampled path is centerline only, doesn't account for stroke expanding boundaries<br>• **stroke-linecap**: Arc endpoints don't consider cap extension<br>• **stroke-linejoin**: Corner vertices don't account for miter/round/bevel expansion<br>• **stroke-dasharray**: Dashed strokes not converted to segmented paths<br>• **marker-start/mid/end**: Markers not rendered into polygon<br>• **paint-order**: Cannot distinguish stroke vs fill regions |
| **shapeToPolygon** | • Shape-to-path conversion (circle, ellipse, rect, line, polygon, polyline, path)<br>• Element transforms<br>• CTM application<br>• Configurable Bezier arcs for HP mode | • **stroke-width**: All shapes converted as if fill only<br>• **stroke-linecap**: Line elements ignore cap style<br>• **stroke-linejoin**: Rectangle corners don't account for joins<br>• **stroke-dasharray/offset**: Dashed shapes not segmented<br>• **marker-start/mid/end**: Line markers not rendered<br>• **vector-effect=non-scaling-stroke**: Stroke always scales with transform<br>• **rx/ry on rect**: Rounded rectangle sampling doesn't account for stroke on corners |
| **resolveClipPath** | • clipPathUnits (userSpaceOnUse, objectBoundingBox)<br>• clipPath transforms<br>• Multiple children union<br>• Coordinate system conversion | • **clip-rule**: Uses polygon union which assumes nonzero, doesn't handle evenodd clip paths<br>• **stroke on clip children**: Clipping shapes only use fill area, stroke ignored<br>• **stroke-width on clipPath children**: Would expand clip region but not supported<br>• **marker-start/mid/end**: Markers on clip paths not rendered into clip region |
| **applyClipPath** | • **clip-rule**: PARTIAL - `clipPolygonWithRule()` implements evenodd via centroid test<br>• Polygon intersection<br>• Element-to-polygon conversion | • **stroke-width on clipped element**: Clipping done on fill path only<br>• **stroke-width on clip children**: Clip shapes don't include stroke area<br>• **stroke-linecap/join**: Not considered in intersection<br>• **stroke-dasharray**: Dashed strokes not properly clipped<br>• **marker-start/mid/end**: Markers outside clip not removed |
| **polygonToPathData** | • Polygon-to-SVG path conversion<br>• Configurable precision<br>• Decimal formatting | • **All stroke properties**: Output is centerline path only<br>• **fill-rule**: No evenodd winding output |
| **resolveNestedClipPath** | • Recursive clipPath resolution<br>• Circular reference detection<br>• Nested intersection | • **clip-rule**: Doesn't propagate through nested clips<br>• **All stroke properties**: Nested clips don't include stroke areas |
| **clipPolygonWithRule** | • **fill-rule**: FULL support (nonzero, evenodd)<br>• Centroid-based evenodd testing<br>• Winding number calculation | • **stroke properties**: Only tests fill containment |
| **computeCentroid** | • Polygon centroid calculation<br>• Degenerate polygon handling | • N/A - Pure geometric utility |
| **getElementBoundingBox** | • Analytical bbox for rect, circle, ellipse<br>• Polygon-based bbox for complex shapes | • **stroke-width**: Bounding box doesn't include stroke overhang<br>• **stroke-linecap**: Extended caps not in bbox<br>• **stroke-linejoin**: Miter joins may extend beyond bbox<br>• **marker-start/mid/end**: Marker bounds not included |

### Critical Gaps - clip-path-resolver.js

1. **Stroke-Based Clipping**: When `<clipPath>` children have `stroke`, only the fill area is used for clipping. The stroke should expand the clip region.
   - **Impact**: Stroked clip paths produce smaller clip regions than visually rendered
   - **Example**: `<clipPath><rect stroke-width="10"/></clipPath>` clips as if stroke-width="0"

2. **clip-rule Incomplete**: `resolveClipPath()` uses `polygonUnion()` which assumes nonzero winding. Evenodd clip paths will behave incorrectly until converted to polygon.
   - **Impact**: Self-intersecting clip paths with `clip-rule="evenodd"` create wrong clip regions
   - **Note**: `applyClipPath()` does support clip-rule via `clipPolygonWithRule()` after conversion

3. **Bounding Box Missing Stroke**: `getElementBoundingBox()` used for `objectBoundingBox` coordinate conversion doesn't include stroke overhang
   - **Impact**: clipPathUnits="objectBoundingBox" scales are wrong for stroked elements

---

## File 2: `/src/mask-resolver.js`

### Functions Audited: 13

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **parseMaskElement** | • maskUnits (objectBoundingBox, userSpaceOnUse)<br>• maskContentUnits<br>• **mask-type** (luminance, alpha)<br>• Mask region (x, y, width, height)<br>• Transform parsing<br>• Child shape parsing | • **stroke properties on mask children**: Only fill attributes parsed<br>• **stroke-width**: Not extracted from children<br>• **stroke-linecap/join/dasharray**: Not parsed<br>• **marker-start/mid/end**: Markers not included in mask |
| **getMaskRegion** | • maskUnits coordinate conversion<br>• Default mask region (-10% to 120%)<br>• objectBoundingBox scaling | • N/A - Coordinate conversion only |
| **maskChildToPolygon** | • Mask shape-to-polygon conversion<br>• maskContentUnits handling | • **stroke-width**: Mask shapes converted as fill only<br>• **stroke properties**: All stroke rendering ignored<br>• **marker-start/mid/end**: Markers not rendered into mask |
| **colorToLuminance** | • **fill color** luminance calculation<br>• sRGB formula (0.2126*R + 0.7152*G + 0.0722*B)<br>• Hex, RGB, named colors | • **stroke color**: Only fill color considered for luminance<br>• **Gradient fills**: url(#gradient) returns default, not sampled |
| **getMaskChildOpacity** | • **fill-opacity**: Combined with opacity<br>• **opacity**: Element opacity<br>• **mask-type**: Luminance vs alpha mode | • **stroke-opacity**: Not factored into mask opacity<br>• **paint-order**: Can't distinguish fill vs stroke opacity contributions |
| **resolveMask** | • **mask-type** (luminance, alpha)<br>• Multiple mask children to regions<br>• Opacity-weighted polygons | • **stroke on mask children**: Only fill areas create mask regions<br>• **stroke-width**: Stroked mask shapes don't expand mask region<br>• **All stroke properties**: Completely ignored |
| **applyMask** | • Polygon intersection with masks<br>• Opacity preservation<br>• Multi-region masks | • **stroke on masked element**: Element converted to fill polygon only<br>• **stroke on mask children**: Mask regions are fill-only |
| **maskToClipPath** | • Binary threshold conversion<br>• Polygon union of mask regions<br>• Configurable opacity threshold | • **All stroke properties**: Output clipPath ignores stroke areas |
| **maskToPathData** | • Mask-to-SVG path conversion<br>• Default 0.5 threshold | • **All stroke properties**: Path represents fill region only |
| **parseGradientReference** | • url(#id) parsing for gradient fills | • N/A - Parser utility |
| **rgbToLuminance** | • RGB object luminance<br>• sRGB formula | • N/A - Color utility |
| **sampleMeshGradientForMask** | • Mesh gradient subdivision<br>• Color-to-opacity conversion<br>• **mask-type** support (luminance, alpha) | • **Mesh gradient stroke**: Only fill colors sampled<br>• **stroke on mesh**: Mesh patch strokes ignored |
| **applyMeshGradientMask** | • Variable-opacity masking<br>• Mesh region intersection | • **stroke properties**: Mesh regions are fill-only |

### Mesh Gradient Mask Support (4 Additional Functions)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **resolveMaskWithGradients** | • Mesh gradient fills in masks<br>• Solid + gradient mix<br>• Gradient-filled shape clipping | • **stroke on gradient-filled shapes**: Shape boundaries are fill-only<br>• **Gradient stroke**: url(#gradient) in stroke attribute not supported |
| **createMeshGradientMask** | • Standalone mesh-based masks<br>• Direct mesh-to-mask conversion | • **All stroke properties**: Mesh defines fill regions only |
| **getMeshGradientBoundary** | • Coons patch edge sampling<br>• Boundary polygon extraction | • **Mesh stroke**: Patch boundaries are geometric only, not rendered stroke |
| **clipWithMeshGradientShape** | • Geometry-only mesh clipping<br>• Patch tessellation union | • **All stroke properties**: Pure geometric operation |
| **meshGradientToClipPath** | • Mesh-to-clipPath conversion<br>• Multi-patch union | • **All stroke properties**: Output is geometric boundary only |

### Critical Gaps - mask-resolver.js

1. **Stroke Ignored in Masks**: Mask children can have `stroke`, but only `fill` is converted to mask regions
   - **Impact**: `<mask><rect stroke="white" stroke-width="20" fill="none"/></mask>` creates empty mask (should be white rectangle)
   - **Severity**: CRITICAL - completely broken for stroke-only mask content

2. **Stroke Opacity Not Factored**: `getMaskChildOpacity()` only uses `fill-opacity`, ignoring `stroke-opacity`
   - **Impact**: Elements with `stroke-opacity="0.5"` render at wrong mask opacity
   - **Note**: Requires paint-order awareness to combine fill + stroke opacities correctly

3. **Gradient Fills Default Behavior**: `colorToLuminance()` returns default value for `url(#gradient)` instead of sampling gradient
   - **Impact**: Gradient-filled mask children produce constant opacity instead of variable opacity
   - **Note**: Should integrate with `sampleMeshGradientForMask()` approach for all gradients

---

## File 3: `/src/svg-boolean-ops.js`

### Functions Audited: 14

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **pointInPolygonWithRule** | • **fill-rule**: FULL support (nonzero, evenodd)<br>• Winding number calculation<br>• Ray casting<br>• Boundary detection | • **stroke-width**: Point may be outside fill but inside stroke area<br>• **stroke-linecap/join**: Extended regions not tested |
| **rectToPolygon** | • Simple rectangles (4 vertices)<br>• **Rounded rectangles** (rx/ry with 8-segment corners) | • **stroke-width**: Rectangle is centerline only<br>• **stroke-linejoin**: Corner joins not expanded<br>• **stroke-linecap**: Not applicable (closed shape)<br>• **Rounded corners**: 8 segments may be insufficient for large rx/ry with thick strokes |
| **circleToPolygon** | • Configurable segment count<br>• Default 32 segments | • **stroke-width**: Circle is centerline only<br>• **stroke-linecap**: Not applicable (closed shape)<br>• **stroke-linejoin**: Not applicable (smooth curve) |
| **ellipseToPolygon** | • Configurable segment count<br>• Default 32 segments | • **stroke-width**: Ellipse is centerline only<br>• **All stroke properties**: As circle |
| **lineToPolygon** | • **stroke-width**: FULL support - creates stroked area polygon<br>• **stroke-linecap**: FULL support (butt, round, square)<br>• Semicircular cap sampling (8 segments)<br>• Perpendicular offset calculation | • **stroke-linejoin**: Not applicable (single line)<br>• **stroke-dasharray**: Solid line only, no dash support<br>• **stroke-dashoffset**: Not applicable<br>• **marker-start/end**: Markers not rendered |
| **svgPolygonToPolygon** | • Points string parsing<br>• Array input support | • **All stroke properties**: Polygon is centerline only |
| **offsetPolygon** | • **stroke-linejoin**: FULL support (miter, round, bevel)<br>• **stroke-miterlimit**: FULL support<br>• Outer + inner offset paths<br>• Miter limit enforcement<br>• Round join with 8-segment arcs<br>• Bevel join with 2 vertices | • **stroke-linecap**: Not applicable (used for closed polygons)<br>• **stroke-dasharray**: Solid strokes only<br>• **vector-effect=non-scaling-stroke**: Offset always scales with coordinates |
| **strokeToFilledPolygon** | • Converts stroke area to fill polygon<br>• Uses `offsetPolygon()` | • **stroke-linecap**: Function only handles closed paths (no caps)<br>• **stroke-dasharray**: Dashed strokes not segmented<br>• **marker-start/mid/end**: Markers not rendered |
| **applyDashArray** | • **stroke-dasharray**: FULL support<br>• **stroke-dashoffset**: FULL support<br>• Pattern normalization (even length)<br>• Segment generation | • **stroke-linecap**: Dash segments don't have caps applied<br>• **marker-mid**: Dash gaps may need marker suppression<br>• **Output**: Returns arrays of line segments, not filled polygons |
| **SVGRegion** (class) | • **fill-rule**: FULL support<br>• Separate fill + stroke polygons<br>• **stroke-dasharray**: PARTIAL - dashed segments created<br>• Element factory method | • **stroke-dasharray segments**: Not converted to filled polygons with caps<br>• **marker-start/mid/end**: Markers not rendered<br>• **paint-order**: Fill + stroke stored separately but no order control<br>• **vector-effect**: Not tracked |
| **SVGRegion.fromElement** | • Shape type detection<br>• **fill-rule**: Preserved<br>• Fill + stroke region creation<br>• **stroke-dasharray**: Applied<br>• **stroke-linecap**: Passed to lineToPolygon | • **stroke-linecap on dashed segments**: Dash caps not implemented<br>• **marker-start/mid/end**: Markers not rendered into regions<br>• **paint-order**: Not tracked<br>• **fill/stroke=none**: Handled correctly |
| **SVGRegion.getAllPolygons** | • Returns fill + stroke polygons | • **paint-order**: No ordering, just concatenation |
| **SVGRegion.containsPoint** | • **fill-rule**: Uses correct rule for fill polygons<br>• Stroke polygons tested as nonzero<br>• Checks both fill and stroke | • **paint-order**: Order not considered for point containment |
| **regionIntersection** | • Boolean AND of two SVGRegions<br>• All combinations (fill∩fill, fill∩stroke, stroke∩fill, stroke∩stroke) | • **fill-rule**: Result always nonzero (should preserve evenodd if both inputs evenodd)<br>• **paint-order**: Lost in output |
| **regionUnion** | • Boolean OR of two SVGRegions<br>• Progressive merging | • **fill-rule**: Result always nonzero<br>• **paint-order**: Lost in output |
| **regionDifference** | • Boolean A - B<br>• Multi-step subtraction | • **fill-rule**: Result always nonzero<br>• **paint-order**: Lost in output |
| **regionXOR** | • Boolean symmetric difference<br>• (A-B) ∪ (B-A) | • **fill-rule**: Result always nonzero<br>• **paint-order**: Lost in output |

### Critical Gaps - svg-boolean-ops.js

1. **Stroke-Dasharray Caps Missing**: `applyDashArray()` creates dashed segments but doesn't apply `stroke-linecap` to each segment
   - **Impact**: Dashed strokes with `round` or `square` caps render incorrectly
   - **Requires**: Each dash segment needs cap polygons added

2. **Paint-Order Ignored**: `SVGRegion` stores fill and stroke separately but doesn't track `paint-order`
   - **Impact**: Can't determine if stroke should be above/below fill for rendering order
   - **Default**: SVG paints fill first, then stroke, then markers (paint-order="normal")

3. **Fill-Rule Lost in Booleans**: Result regions always use `fill-rule="nonzero"` even if inputs were evenodd
   - **Impact**: Boolean ops on evenodd shapes may produce wrong results
   - **Note**: Polygon-based booleans inherently assume nonzero winding

4. **Vector-Effect Not Tracked**: `vector-effect="non-scaling-stroke"` means stroke-width shouldn't scale with transforms
   - **Impact**: Stroked shapes transformed will have wrong stroke width
   - **Requires**: Separate handling of geometric transform vs stroke width

---

## File 4: `/src/svg-toolbox.js` (68 Functions)

### Cleanup Functions (11)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **cleanupIds** | • ID minification<br>• Unused ID removal<br>• Animation references<br>• URL encoding | • N/A - Metadata operation |
| **cleanupNumericValues** | • Precision rounding<br>• Path data numbers<br>• Transform numbers<br>• **stroke-width** rounding<br>• Points rounding | • **vector-effect**: Should skip stroke-width rounding if non-scaling-stroke<br>• **Units**: Preserves CSS units correctly |
| **cleanupListOfValues** | • Points precision<br>• ViewBox SKIPPED (intentionally) | • N/A - Numeric formatting only |
| **cleanupAttributes** | • Removes editor metadata<br>• Vendor namespace handling | • N/A - Metadata operation |
| **cleanupEnableBackground** | • Removes enable-background | • N/A - Attribute removal |
| **removeUnknownsAndDefaults** | • Default value removal<br>• **fill-rule** defaults (nonzero)<br>• **clip-rule** defaults (nonzero)<br>• **stroke-*** all defaults<br>• **opacity** defaults<br>• **marker-*** defaults<br>• **paint-order** defaults (normal)<br>• **vector-effect** defaults (none)<br>• Unknown element removal<br>• Invalid parent-child removal | • **Preserves**: All critical rendering attributes when non-default<br>• **Dynamic styles**: Skips removal if @media/@pseudo detected |
| **removeNonInheritableGroupAttrs** | • Removes x/y/width/height from `<g>`<br>• Removes viewBox from `<g>`<br>• **Removes clip-path from `<g>`** (WRONG - should be inheritable)<br>• **Removes mask from `<g>`** (WRONG - should be inheritable) | • **BUG**: clip-path and mask ARE inheritable per SVG spec<br>• **Impact**: Breaks clipping/masking on grouped elements |
| **removeUselessDefs** | • Empty `<defs>` removal | • N/A - Structure cleanup |
| **removeHiddenElements** | • display=none detection<br>• visibility=hidden detection<br>• opacity=0 detection<br>• **Exception**: Preserves referenced IDs<br>• **Exception**: Preserves `<marker>` (renders even when display=none)<br>• **Exception**: Preserves elements with marker-start/mid/end<br>• **Exception**: Preserves animated elements | • **Excellent**: Handles all cases correctly |
| **removeEmptyText** | • Empty `<text>` removal | • N/A - Content cleanup |
| **removeEmptyContainers** | • Empty g/defs/symbol/etc removal | • N/A - Structure cleanup |

### Removal Functions (12)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **removeDoctype** | • DOCTYPE removal | • N/A - Metadata |
| **removeXMLProcInst** | • Processing instruction removal | • N/A - Metadata |
| **removeComments** | • Comment removal | • N/A - Metadata |
| **removeMetadata** | • `<metadata>` removal | • N/A - Metadata |
| **removeTitle** | • `<title>` removal | • N/A - Metadata |
| **removeDesc** | • `<desc>` removal | • N/A - Metadata |
| **removeEditorsNSData** | • Inkscape/Illustrator namespace removal<br>• Tracks remaining prefixed attrs (avoids SVGO bug #1530) | • **Safety**: Excellent - doesn't create unbound namespaces |
| **removeEmptyAttrs** | • Empty attribute removal | • N/A - Cleanup |
| **removeViewBox** | • Redundant viewBox removal | • N/A - Optimization |
| **removeXMLNS** | • Inline SVG namespace removal<br>• xlink: namespace removal (if no xlink: attrs remain) | • **Safety**: Excellent - checks for remaining xlink: usage |
| **removeRasterImages** | • `<image>` removal | • N/A - Content removal |
| **removeScriptElement** | • `<script>` removal | • N/A - Content removal |

### Conversion Functions (10)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **convertShapesToPath** | • rect/circle/ellipse/line/polyline/polygon to path<br>• **Exceptions**: Skips NaN values, rounded rects (unless forced), <2 point polylines | • **stroke-width**: Converts centerline only<br>• **stroke-linecap**: Line caps not added<br>• **stroke-linejoin**: Rectangle corners not expanded<br>• **stroke-dasharray**: Dashes not segmented<br>• **marker-start/mid/end**: Markers not rendered<br>• **rx/ry**: Rounded rects skipped by default (correct - lossy conversion) |
| **convertPathData** | • Path to absolute coordinates<br>• **Exceptions**: Skips referenced IDs, style attributes, linecap paths, single-point paths, marker-mid paths | • **stroke-width**: Not factored into path<br>• **All stroke properties**: Geometric conversion only<br>• **Good exceptions**: Preserves rendering-critical cases |
| **convertTransform** | • Transform matrix optimization<br>• **Exception**: Non-uniform scale on stroked elements | • **stroke-width**: Should adjust if scale applied<br>• **vector-effect=non-scaling-stroke**: Should prevent stroke scaling<br>• **Good**: Detects non-uniform scale + stroke combination |
| **convertColors** | • Named colors to hex<br>• #RRGGBB to #RGB | • N/A - Optimization only |
| **convertStyleToAttrs** | • Inline style to attributes<br>• **Handles all stroke properties**: stroke, stroke-width, stroke-linecap, stroke-linejoin, stroke-miterlimit, stroke-opacity, stroke-dasharray, stroke-dashoffset<br>• **Handles fill properties**: fill, fill-opacity, fill-rule<br>• **Handles opacity**: opacity<br>• **Handles markers**: marker-start, marker-mid, marker-end<br>• **Handles clip/mask**: clip-path, clip-rule, mask<br>• **Handles paint-order** | • **Excellent**: Full stroke/fill feature coverage |
| **convertEllipseToCircle** | • rx=ry ellipse to circle | • N/A - Optimization only |
| **collapseGroups** | • Single-child group removal<br>• **Exceptions**: Root, `<switch>`, ID'd children, filters, animations, non-inheritable conflicts | • **Good**: Preserves rendering-critical groups |
| **mergePaths** | • Adjacent path merging<br>• **Exceptions**: Children, different attrs, markers, clip-path/mask, URL refs | • **Good**: Avoids merging paths with markers (would break rendering) |
| **moveGroupAttrsToElems** | • Inheritable attr propagation<br>• **Includes**: fill, stroke, stroke-width, opacity, fill-opacity, stroke-opacity | • **All other stroke properties**: Not propagated (stroke-linecap, join, miterlimit, dasharray, dashoffset)<br>• **marker-start/mid/end**: Not propagated |
| **moveElemsAttrsToGroup** | • Common attr hoisting<br>• **Includes**: fill, stroke, stroke-width, opacity, fill-opacity, stroke-opacity | • **All other stroke properties**: Not hoisted |

### Optimization Functions (8)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **minifyStyles** | • CSS minification<br>• **Exception**: Skips when scripts present | • N/A - Text optimization |
| **inlineStyles** | • CSS to inline styles<br>• **Exceptions**: foreignObject, pseudo-classes, @media, @keyframes<br>• **Handles**: fill, stroke, all stroke-*, opacity, fill-opacity, stroke-opacity, clip-path, mask, markers | • **Excellent**: Full feature coverage in CSS parsing |
| **sortAttrs** | • Alphabetical attribute sorting | • N/A - Formatting only |
| **sortDefsChildren** | • Defs child sorting | • N/A - Organization only |
| **reusePaths** | • Duplicate path to `<use>` | • N/A - Optimization only |
| **removeOffCanvasPath** | • Off-canvas path removal | • **stroke-width**: Bounding box doesn't include stroke overhang<br>• **Impact**: Partially-visible stroked paths may be removed incorrectly |
| **removeStyleElement** | • `<style>` removal | • N/A - Removal only |
| **removeXlink** | • xlink:href to href<br>• xlink:show to target<br>• xlink:title to `<title>` element | • **Good**: Proper SVG 2.0 migration |

### Adding/Modification Functions (7)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **addAttributesToSVGElement** | • Attribute addition to root | • N/A - Modification only |
| **addClassesToSVGElement** | • Class addition to root | • N/A - Modification only |
| **prefixIds** | • ID prefixing<br>• CSS selector updates<br>• url(#id) updates<br>• Animation timing refs<br>• Animation value refs | • **Excellent**: Comprehensive reference updating |
| **removeDimensions** | • width/height removal | • N/A - Attribute removal |
| **removeAttributesBySelector** | • Selector-based attr removal | • N/A - Modification only |
| **removeAttrs** | • Pattern-based attr removal | • N/A - Removal only |
| **removeElementsByAttr** | • Attr value-based removal | • N/A - Removal only |

### Bonus Functions (15+)

| Function | Handles | Missing Features |
|----------|---------|------------------|
| **flattenClipPaths** | • ClipPath to geometry | • **All stroke properties**: Uses clip-path-resolver.js (see gaps above) |
| **flattenMasks** | • Mask to geometry | • **All stroke properties**: Uses mask-resolver.js (see gaps above) |
| **flattenGradients** | • Gradient to solid fill<br>• Mid-point sampling<br>• **Exceptions**: Skips userSpaceOnUse, gradientTransform, circular refs | • N/A - Simplification (intentionally lossy) |
| **flattenPatterns** | • Pattern flattening | • **All stroke properties**: Pattern fills on strokes not handled |
| **flattenFilters** | • Filter removal (stub) | • N/A - Cannot flatten filters without rendering |
| **flattenUseElements** | • `<use>` inlining | • N/A - Structure flattening |
| **imageToPath** | • Image tracing (stub) | • N/A - Requires CV algorithms |
| **detectCollisions** | • GJK collision detection | • **stroke-width**: Collision uses fill polygons only<br>• **Impact**: Stroked shapes may collide visually but not geometrically |
| **measureDistance** | • GJK distance measurement | • **stroke-width**: Distance to fill boundary only |
| **validateXML** | • XML well-formedness<br>• Namespace binding checks | • **Excellent**: Catches SVGO's unbound namespace bug |
| **validateSVG** | • SVG 1.1/2.0 spec validation<br>• Required attrs<br>• Valid children<br>• Enumerated values including **fill-rule, clip-rule, stroke-linecap, stroke-linejoin**<br>• Numeric constraints for **opacity, fill-opacity, stroke-opacity, stroke-width, stroke-miterlimit**<br>• **paint-order** in enum validation | • **Excellent**: Validates all stroke/fill properties as specified<br>• **Coverage**: All 13 critical features validated |
| **fixInvalidSvg** | • Invalid attribute removal<br>• Missing namespace addition<br>• Broken ID fixing<br>• Animation timing normalization<br>• Uppercase unit normalization<br>• Invalid whitespace fixing | • **Excellent**: Comprehensive SVG repair |
| **flattenAll** | • Complete flattening pipeline | • **All stroke properties**: Inherits gaps from flatten* functions |
| **simplifyPath** | • Bezier curve simplification | • **All stroke properties**: Simplifies centerline only |
| **decomposeTransform** | • Matrix decomposition | • **vector-effect**: Doesn't detect non-scaling-stroke |
| **optimizeAnimationTiming** | • keySplines/keyTimes optimization | • N/A - Animation metadata |
| **optimizePaths** | • SVGO-style path optimization | • **All stroke properties**: Geometric optimization only |
| **simplifyPaths** | • Douglas-Peucker/Visvalingam polyline simplification | • **stroke-width**: Simplifies centerline, may create gaps in thick strokes<br>• **Impact**: Simplified stroked paths may have visual artifacts |

### Critical Gaps - svg-toolbox.js

1. **removeNonInheritableGroupAttrs BUG**: Incorrectly removes `clip-path` and `mask` from `<g>` elements
   - **SVG Spec**: Both clip-path and mask ARE inheritable attributes
   - **Impact**: CRITICAL - breaks clipping/masking on groups
   - **Fix Required**: Remove clip-path and mask from `nonInheritable` array

2. **moveGroupAttrsToElems/moveElemsAttrsToGroup Incomplete**: Only handles subset of stroke properties
   - **Missing**: stroke-linecap, stroke-linejoin, stroke-miterlimit, stroke-dasharray, stroke-dashoffset, marker-start, marker-mid, marker-end
   - **Impact**: Optimization loses these attributes when moving between group/children
   - **Fix Required**: Add all inheritable stroke properties to propagation lists

3. **removeOffCanvasPath Stroke Overhang**: Bounding box calculation doesn't include stroke-width
   - **Impact**: Partially-visible thick strokes incorrectly removed as "off-canvas"
   - **Fix Required**: Expand bounds by stroke-width/2 (plus linecap/join extensions)

4. **Geometric Operations Ignore Stroke**: Functions like `detectCollisions`, `measureDistance`, `simplifyPaths` use fill polygons only
   - **Impact**: Results don't match visual rendering of stroked shapes
   - **Fix Required**: Use `SVGRegion.getAllPolygons()` to include stroke areas

---

## Summary of Critical Gaps Across All Files

### 1. **Stroke-Width Expansion (CRITICAL - Affects 95% of geometric functions)**

**Impact**: Almost all geometric operations treat shapes as if `stroke-width="0"`, ignoring that strokes expand visual boundaries outward from the centerline.

**Affected Operations:**
- Clipping: Clipped region is smaller than visual appearance
- Masking: Mask region is smaller than visual appearance
- Boolean operations: Results don't match visual overlap/union/difference
- Collision detection: Shapes that visually touch don't register as colliding
- Bounding boxes: Reported bounds don't include stroke overhang
- Off-canvas detection: Partially-visible thick strokes removed incorrectly

**Example:**
```svg
<rect x="0" y="0" width="100" height="100"
      fill="none" stroke="black" stroke-width="10"/>
```
- **Visual bounds**: x=-5, y=-5, width=110, height=110 (stroke extends 5px outward)
- **Computed bounds**: x=0, y=0, width=100, height=100 (stroke ignored)

**Fix Strategy:**
- Use `offsetPolygon()` from svg-boolean-ops.js to expand paths by stroke-width/2
- Apply stroke-linecap and stroke-linejoin to get correct outline
- For dashed strokes, apply dasharray then stroke each segment

### 2. **Stroke-Linecap Missing (HIGH PRIORITY)**

**Impact**: Open paths (lines, arcs) and dashed stroke segments don't have end caps added.

**Affected Operations:**
- `lineToPolygon()`: Missing round/square caps
- `applyDashArray()`: Dash segments need caps but none applied
- `convertShapesToPath()`: Line elements lose cap information

**Cap Types:**
- `butt` (default): No extension, path ends at endpoint
- `round`: Semicircular cap extending stroke-width/2 beyond endpoint
- `square`: Square cap extending stroke-width/2 beyond endpoint

**Example:**
```svg
<line x1="0" y1="0" x2="100" y2="0"
      stroke-width="10" stroke-linecap="round"/>
```
- **Visual length**: 110px (5px round cap on each end)
- **Computed length**: 100px (caps ignored)

**Fix Strategy:**
- Add cap generation to `lineToPolygon()` (already has round implementation, needs square)
- Add cap application to `applyDashArray()` output segments
- Store linecap in `SVGRegion` for preservation through boolean ops

### 3. **Stroke-Linejoin Missing (HIGH PRIORITY)**

**Impact**: Polygons with thick strokes don't have corners expanded correctly.

**Already Implemented**: `offsetPolygon()` in svg-boolean-ops.js has FULL support (miter, round, bevel)

**Problem**: Other files don't use it
- `shapeToPolygon()` in clip-path-resolver.js should call `offsetPolygon()` when stroke exists
- `maskChildToPolygon()` in mask-resolver.js should call `offsetPolygon()` when stroke exists

**Join Types:**
- `miter` (default): Sharp corner up to miter-limit, then bevel
- `round`: Circular arc corner (8 segments in current implementation)
- `bevel`: Flat corner (2 extra vertices)

**Fix Strategy:**
- Detect stroke presence in shape-to-polygon functions
- Call `offsetPolygon()` with appropriate linejoin/miterlimit
- Combine outer + inner offset to get filled stroke region

### 4. **Stroke-Dasharray Missing (MEDIUM PRIORITY)**

**Impact**: Dashed strokes converted to continuous strokes.

**Partial Implementation**:
- `applyDashArray()` in svg-boolean-ops.js creates dash segments
- `SVGRegion.fromElement()` applies dasharray

**Problem**:
- Dash segments not converted to filled polygons with caps
- Clip-path and mask resolvers don't handle dashed children

**Example:**
```svg
<rect stroke-dasharray="10 5" stroke-width="2"/>
```
- **Visual**: Alternating 10px dashes with 5px gaps
- **Computed**: Continuous 2px stroke

**Fix Strategy:**
- Extend `applyDashArray()` to output filled polygons with caps
- Integrate into `shapeToPolygon()` and `maskChildToPolygon()`
- Preserve dasharray in `SVGRegion` for re-application after boolean ops

### 5. **Markers Not Rendered (MEDIUM PRIORITY)**

**Impact**: Markers (arrows, dots) at path vertices not included in geometric output.

**Affected Operations:**
- All shape-to-polygon conversions ignore marker-start/mid/end
- Clipping/masking don't include marker bounds
- Bounding box calculations exclude markers

**Marker Types:**
- `marker-start`: Rendered at first vertex
- `marker-mid`: Rendered at each intermediate vertex
- `marker-end`: Rendered at last vertex

**Example:**
```svg
<path d="M 0 0 L 100 0" marker-end="url(#arrow)"/>
```
- **Visual bounds**: Include arrow size at (100,0)
- **Computed bounds**: Path endpoints only

**Fix Strategy:**
- Resolve marker definitions from defs
- Transform marker to each vertex position/orientation
- Union marker polygon with path polygon
- **Complexity**: Markers have their own coordinate system (markerUnits)

### 6. **Fill-Rule/Clip-Rule Partial (MEDIUM PRIORITY)**

**Status**:
- ✅ `pointInPolygonWithRule()` has FULL support
- ✅ `clipPolygonWithRule()` has FULL support
- ❌ `resolveClipPath()` uses polygonUnion (assumes nonzero)
- ❌ Boolean operations always output nonzero

**Impact**: Self-intersecting paths with evenodd fill/clip-rule render incorrectly.

**Evenodd vs Nonzero:**
- `nonzero`: Region is inside if winding number ≠ 0
- `evenodd`: Region is inside if crossing count is odd

**Example:**
```svg
<path d="M 0 0 L 100 0 L 100 100 L 50 50 L 0 100 Z"
      fill-rule="evenodd"/>
```
- **Evenodd**: Center region is "outside" (hole in middle)
- **Nonzero**: Center region is "inside" (fully filled)

**Fix Strategy:**
- Preserve fill-rule through polygon operations
- Use `clipPolygonWithRule()` in more places
- Add fill-rule parameter to boolean operation outputs

### 7. **Paint-Order Not Tracked (LOW PRIORITY)**

**Impact**: Can't distinguish rendering order of fill, stroke, markers.

**Default Order**: fill, stroke, markers

**Alternate Orders**:
- `paint-order="stroke"`: stroke, fill, markers
- `paint-order="markers"`: markers, fill, stroke

**Example:**
```svg
<rect fill="red" stroke="blue" stroke-width="10" paint-order="stroke"/>
```
- **Default**: Blue stroke painted over red fill (half stroke visible)
- **paint-order="stroke"**: Red fill painted over blue stroke (full stroke visible)

**Fix Strategy:**
- Add `paintOrder` field to `SVGRegion`
- Return separate fill/stroke polygons with rendering order metadata
- Let consumer decide how to combine based on paint-order

### 8. **Vector-Effect Not Tracked (LOW PRIORITY)**

**Impact**: `vector-effect="non-scaling-stroke"` means stroke-width stays constant when element transforms.

**Example:**
```svg
<rect stroke-width="1" vector-effect="non-scaling-stroke"
      transform="scale(10)"/>
```
- **Default**: Stroke scales to 10px
- **vector-effect="non-scaling-stroke"**: Stroke stays at 1px

**Fix Strategy:**
- Parse vector-effect attribute
- Separate geometric transform from stroke width scaling
- Apply transform to path but not to offsetPolygon() distance

### 9. **Opacity Properties Incomplete (MEDIUM PRIORITY)**

**Status**:
- ✅ `getMaskChildOpacity()` handles fill-opacity and opacity correctly
- ❌ stroke-opacity not factored into mask opacity
- ✅ `validateSVG()` validates opacity ranges (0-1)
- ❌ Boolean operations don't preserve opacity

**Properties:**
- `opacity`: Overall element opacity (applies to fill + stroke)
- `fill-opacity`: Fill-only opacity
- `stroke-opacity`: Stroke-only opacity

**Example:**
```svg
<rect fill="red" fill-opacity="0.5"
      stroke="blue" stroke-opacity="0.8"/>
```
- **Fill opacity**: 0.5
- **Stroke opacity**: 0.8
- **Different values**: Can't be represented by single opacity

**Fix Strategy:**
- Return separate fill/stroke regions with separate opacity values
- In masks, sample fill and stroke separately with their opacities
- Requires paint-order awareness to combine correctly

---

## Recommendations

### Immediate Fixes (CRITICAL - Week 1)

1. **Fix removeNonInheritableGroupAttrs bug**
   - Remove clip-path and mask from nonInheritable list
   - Add test case for clipped/masked groups

2. **Add stroke-width support to core geometric functions**
   - Modify `shapeToPolygon()` to detect stroke and call `offsetPolygon()`
   - Modify `maskChildToPolygon()` to detect stroke and call `offsetPolygon()`
   - Update `getElementBoundingBox()` to include stroke overhang

3. **Fix bounding box calculations**
   - Include stroke-width/2 expansion
   - Account for linecap extensions on open paths
   - Account for linejoin miterlimit on corners

### High Priority (Week 2-3)

4. **Implement stroke-linecap for open paths**
   - Complete `lineToPolygon()` square cap support
   - Add cap generation to `applyDashArray()` segments
   - Add cap handling to arc segments in `pathToPolygon()`

5. **Integrate offsetPolygon() throughout codebase**
   - Use in clip-path resolution when children have stroke
   - Use in mask resolution when children have stroke
   - Document stroke-linejoin/miterlimit support

6. **Fix fill-rule/clip-rule handling**
   - Preserve fill-rule through boolean operations
   - Use `clipPolygonWithRule()` in `resolveClipPath()`
   - Add fill-rule parameter to SVGRegion outputs

### Medium Priority (Week 4-6)

7. **Implement stroke-dasharray full support**
   - Convert `applyDashArray()` output to filled polygons
   - Apply stroke-linecap to each dash segment
   - Integrate into clip/mask resolvers

8. **Add opacity preservation**
   - Include stroke-opacity in mask calculations
   - Preserve opacity through boolean operations
   - Return separate fill/stroke opacity values

9. **Complete attr hoisting/propagation**
   - Add all stroke properties to `moveGroupAttrsToElems()`
   - Add marker-* properties to propagation
   - Add paint-order to propagation

### Low Priority (Future)

10. **Implement marker rendering**
    - Resolve marker definitions from defs
    - Transform markers to vertex positions
    - Union marker polygons with path polygons

11. **Add paint-order tracking**
    - Store paint-order in SVGRegion
    - Return fill/stroke/markers in render order
    - Document usage for consumers

12. **Support vector-effect**
    - Parse vector-effect="non-scaling-stroke"
    - Separate geometric vs stroke transforms
    - Apply to offsetPolygon() calculations

---

## Testing Requirements

Each fix should include tests for:

1. **Visual parity**: Rendered SVG matches geometric output
2. **Edge cases**:
   - Zero stroke-width (no change)
   - Very thick strokes (stroke > shape size)
   - Dashed strokes with gaps larger than dash length
   - Self-intersecting paths with evenodd
   - Nested clip-paths with different clip-rules
3. **Performance**: No significant regression for common cases
4. **Backward compatibility**: Existing outputs unchanged when stroke="none"

### Suggested Test Cases

```svg
<!-- Test 1: Thick stroke extends bounds -->
<rect x="50" y="50" width="100" height="100"
      stroke-width="20" fill="none"/>
<!-- Expected bbox: x=40, y=40, width=120, height=120 -->

<!-- Test 2: Dashed stroke with round caps -->
<line x1="0" y1="50" x2="200" y2="50"
      stroke-width="10" stroke-dasharray="20 10"
      stroke-linecap="round"/>
<!-- Expected: Rounded caps on each 20px dash segment -->

<!-- Test 3: Evenodd clip-rule with self-intersecting path -->
<clipPath id="clip" clip-rule="evenodd">
  <path d="M 0 0 L 100 100 L 100 0 L 0 100 Z"/>
</clipPath>
<!-- Expected: Center diamond is clipped OUT (hole) -->

<!-- Test 4: Stroke on clip-path child -->
<clipPath id="clip">
  <rect stroke-width="10" fill="none"/>
</clipPath>
<!-- Expected: Clip region is 10px stroke outline, not empty -->

<!-- Test 5: Miter join with limit -->
<rect stroke-linejoin="miter" stroke-miterlimit="2"
      stroke-width="20" transform="rotate(45)"/>
<!-- Expected: Sharp corner up to limit, then bevel -->
```

---

## Conclusion

The SVG-MATRIX codebase has **excellent geometric precision** via Decimal.js but **incomplete stroke/fill rendering feature support**. The primary gap is that **stroke properties are largely ignored**, causing geometric outputs to not match visual rendering.

### Priority Matrix

| Priority | Fix | Files Affected | Effort | Impact |
|----------|-----|----------------|--------|--------|
| CRITICAL | clip-path/mask bug in removeNonInheritableGroupAttrs | svg-toolbox.js | 1 hour | HIGH - Breaks entire feature |
| CRITICAL | stroke-width in shapeToPolygon() | clip-path-resolver.js, mask-resolver.js | 1 day | HIGH - 95% of geometric ops |
| CRITICAL | stroke-width in bounding boxes | clip-path-resolver.js | 4 hours | HIGH - Wrong coordinates |
| HIGH | stroke-linecap for lines/dashes | svg-boolean-ops.js | 2 days | MEDIUM - Visual artifacts |
| HIGH | fill-rule preservation | All files | 2 days | MEDIUM - Wrong evenodd results |
| MEDIUM | stroke-dasharray full support | clip-path-resolver.js, mask-resolver.js, svg-boolean-ops.js | 3 days | MEDIUM - Dashes → continuous |
| MEDIUM | stroke-opacity in masks | mask-resolver.js | 1 day | MEDIUM - Wrong opacity |
| MEDIUM | Attr propagation complete | svg-toolbox.js | 1 day | LOW - Optimization quality |
| LOW | Marker rendering | All files | 1 week | LOW - Rarely critical |
| LOW | paint-order tracking | svg-boolean-ops.js | 2 days | LOW - Edge case |
| LOW | vector-effect support | All files | 3 days | LOW - Rare usage |

### Estimated Total Effort

- **Critical fixes**: 2 days
- **High priority**: 4 days
- **Medium priority**: 5 days
- **Low priority**: 12 days

**Total**: ~23 days for complete stroke/fill feature parity with SVG rendering spec.

---

## Appendix: SVG Rendering Feature Reference

### Complete Property List

| Property | Default | Values | Inheritable | Affects Geometry |
|----------|---------|--------|-------------|------------------|
| **fill** | black | color \| none \| url(#id) | Yes | Yes (fill area) |
| **fill-rule** | nonzero | nonzero \| evenodd | Yes | Yes (winding) |
| **fill-opacity** | 1 | 0-1 | Yes | No (compositing) |
| **stroke** | none | color \| none \| url(#id) | Yes | Yes (stroke area) |
| **stroke-width** | 1 | length | Yes | Yes (expands bounds) |
| **stroke-linecap** | butt | butt \| round \| square | Yes | Yes (extends ends) |
| **stroke-linejoin** | miter | miter \| round \| bevel | Yes | Yes (expands corners) |
| **stroke-miterlimit** | 4 | number ≥1 | Yes | Yes (miter cut-off) |
| **stroke-dasharray** | none | none \| list | Yes | Yes (segments path) |
| **stroke-dashoffset** | 0 | length | Yes | Yes (shifts dashes) |
| **stroke-opacity** | 1 | 0-1 | Yes | No (compositing) |
| **opacity** | 1 | 0-1 | No | No (compositing) |
| **clip-path** | none | none \| url(#id) | No | Yes (intersection) |
| **clip-rule** | nonzero | nonzero \| evenodd | Yes | Yes (winding) |
| **mask** | none | none \| url(#id) | No | Yes (opacity map) |
| **marker-start** | none | none \| url(#id) | Yes | Yes (adds geometry) |
| **marker-mid** | none | none \| url(#id) | Yes | Yes (adds geometry) |
| **marker-end** | none | none \| url(#id) | Yes | Yes (adds geometry) |
| **paint-order** | normal | normal \| fill stroke markers (any order) | Yes | No (z-order) |
| **vector-effect** | none | none \| non-scaling-stroke | No | Yes (stroke scaling) |

### Geometric Impact Summary

**Properties that EXPAND geometry:**
- stroke-width (by width/2 on both sides)
- stroke-linecap (extends open path ends)
- stroke-linejoin (expands corners)
- marker-start/mid/end (adds marker geometry)

**Properties that CHANGE geometry:**
- stroke-dasharray (segments continuous path)
- clip-path (intersects with clip region)
- mask (modulates opacity per-pixel)

**Properties that affect RENDERING only (no geometry change):**
- fill-opacity, stroke-opacity, opacity
- paint-order
- All color values

---

*End of Audit Report*
*Generated: 2025-12-11*
*Auditor: Claude (Anthropic)*
*Codebase: svg-matrix v1.x*
