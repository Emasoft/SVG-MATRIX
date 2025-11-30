# SVG Element Resolver Architecture

## Overview

This document outlines the architecture for a unified SVG element resolver that handles:
- **clipPath** - Boolean clipping operations
- **mask** - Alpha/luminance masking
- **gradients** - linearGradient, radialGradient
- **effects** - filter primitives
- **meshgradient** - SVG 2.0 mesh gradients
- **nested SVG** - viewBox/viewport clipping
- **use/symbol** - reference resolution with viewport handling
- **pattern** - tiled fill patterns
- **custom dashes** - stroke-dasharray resolution

All operations use **Decimal.js** for arbitrary precision arithmetic.

---

## Core Abstraction: SVGElementResolver

```
                           +-----------------------+
                           |   SVGElementResolver  |
                           +-----------------------+
                           | - precision: Decimal  |
                           | - viewportStack: []   |
                           | - defsMap: Map        |
                           +-----------------------+
                                     |
       +-----------------------------+-----------------------------+
       |                |                |                |        |
  +---------+    +------------+    +-----------+    +---------+  +------+
  | Clipper |    | Masker     |    | Gradients |    | Effects |  | Refs |
  +---------+    +------------+    +-----------+    +---------+  +------+
  | clipPath|    | mask       |    | linear    |    | filter  |  | use  |
  +---------+    | luminance  |    | radial    |    | blur    |  | symbol|
                 | alpha      |    | mesh(2.0) |    | offset  |  | nested|
                 +------------+    +-----------+    +---------+  +------+
```

---

## 1. ClipPath Resolution

### What It Does
Clips rendered shapes to the intersection with a clipping path.

### Mathematical Model
1. **Extract clipping shape** - Convert clipPath children to polygons
2. **Transform to target space** - Apply clipPathUnits (userSpaceOnUse / objectBoundingBox)
3. **Boolean intersection** - Use PolygonClip.polygonIntersection()
4. **Multiple clip paths** - Sequential intersection (A ∩ B ∩ C)

### clipPathUnits Handling

| clipPathUnits      | Transform Required                                   |
|--------------------|------------------------------------------------------|
| userSpaceOnUse     | Apply element's CTM to clipping path                |
| objectBoundingBox  | Scale clipPath coords by element's bounding box     |

### Implementation Strategy

```javascript
export function resolveClipPath(element, clipPathRef, ctm) {
  // 1. Parse clipPath element from defs
  const clipDef = defsMap.get(clipPathRef);

  // 2. Extract all child shapes as polygons
  const clipPolygons = clipDef.children.map(child => {
    const pathData = shapeToPathData(child);
    return pathToPolygon(pathData, SAMPLES_PER_CURVE);
  });

  // 3. Apply clipPathUnits transform
  const unitMatrix = getClipPathUnitsMatrix(clipDef, element);
  const transformedClip = clipPolygons.map(p => transformPolygon(p, unitMatrix.mul(ctm)));

  // 4. Combine multiple clip shapes (union within clipPath)
  const combinedClip = clipPolygons.reduce((acc, p) => polygonUnion(acc, p), []);

  // 5. Intersect with element geometry
  return polygonIntersection(elementPolygon, combinedClip);
}
```

### Nested clipPaths
When clipPath A references clipPath B:
```
result = element ∩ clipA ∩ clipB
```

---

## 2. Mask Resolution

### Types of Masks

| Mask Type   | Formula                                              |
|-------------|------------------------------------------------------|
| luminance   | alpha = 0.2126*R + 0.7152*G + 0.0722*B              |
| alpha       | alpha = source alpha channel                         |

### Mathematical Model
Masks are **rasterized** operations but we can model them geometrically for:
- Solid color masks: treated as clipPath (binary alpha)
- Gradient masks: need alpha sampling at path vertices

### maskContentUnits / maskUnits Handling

| Attribute         | userSpaceOnUse                    | objectBoundingBox                |
|-------------------|-----------------------------------|----------------------------------|
| maskUnits         | mask positioned in user space     | mask scaled to element bbox      |
| maskContentUnits  | mask content in user space        | mask content scaled to element   |

### Geometric Approximation Strategy
For masks with uniform alpha regions:
1. Trace mask alpha contours at threshold levels (0.25, 0.5, 0.75)
2. Create polygons for each alpha level
3. Intersect target geometry with appropriate contour

---

## 3. Gradient Resolution

### LinearGradient

**Coordinate Mapping:**
```
gradientUnits="userSpaceOnUse"  -> (x1,y1) to (x2,y2) in absolute coords
gradientUnits="objectBoundingBox" -> (x1,y1) to (x2,y2) as 0-1 ratios of bbox
```

**Transform Chain:**
```
gradientTransform -> gradientUnits matrix -> CTM
```

**Implementation:**
```javascript
export function resolveLinearGradient(gradientRef, element, ctm) {
  const grad = defsMap.get(gradientRef);

  // Build gradient line in target space
  const unitMatrix = getGradientUnitsMatrix(grad, element);
  const gradMatrix = parseTransform(grad.gradientTransform || '');
  const fullMatrix = ctm.mul(unitMatrix).mul(gradMatrix);

  // Transform gradient endpoints
  const [x1, y1] = applyTransform(fullMatrix, grad.x1, grad.y1);
  const [x2, y2] = applyTransform(fullMatrix, grad.x2, grad.y2);

  return {
    type: 'linearGradient',
    x1, y1, x2, y2,
    stops: grad.stops.map(s => ({
      offset: D(s.offset),
      color: s.color,
      opacity: D(s.opacity)
    }))
  };
}
```

### RadialGradient

**Additional Parameters:**
- `cx, cy` - center of outer circle
- `r` - radius of outer circle
- `fx, fy` - focal point (center of inner circle)
- `fr` - focal radius (SVG 2.0)

**Elliptical Gradients:**
When gradientTransform includes non-uniform scaling, the gradient becomes elliptical.

### MeshGradient (SVG 2.0)

**Structure:**
```xml
<meshgradient x="0" y="0">
  <meshrow>
    <meshpatch>
      <stop path="C c1x c1y c2x c2y x y" stop-color="red"/>
      <stop path="C ..." stop-color="green"/>
      <stop path="C ..." stop-color="blue"/>
      <stop path="C ..." stop-color="yellow"/>
    </meshpatch>
  </meshrow>
</meshgradient>
```

**Resolution Strategy:**
1. Parse Coons patch boundary curves
2. Sample patch at sufficient resolution
3. Interpolate colors using bilinear/bicubic interpolation
4. Store as lookup table for rendering

---

## 4. Pattern Resolution

### Pattern Coordinate System

| Attribute       | Effect                                               |
|-----------------|------------------------------------------------------|
| patternUnits    | Defines how x, y, width, height are interpreted     |
| patternContentUnits | Defines coordinate system for pattern content   |
| patternTransform | Additional transform on the pattern tile           |

### Mathematical Model

```
Pattern tile origin: (x, y) in pattern space
Pattern tile size: (width, height)
Tile transform: patternTransform matrix

For each point P in target shape:
  1. Transform P to pattern space
  2. P' = (P.x mod width, P.y mod height)
  3. Sample pattern content at P'
```

### Viewport Handling
Patterns create a new **viewport** with optional viewBox:
```xml
<pattern id="p1" viewBox="0 0 10 10" width="20" height="20">
  <!-- pattern content uses viewBox coordinates -->
</pattern>
```

This requires computing: `patternTransform * viewBox-to-viewport * patternUnits`

---

## 5. Viewport Elements (SVG, symbol, use)

### Elements That Create Viewports

| Element  | Creates Viewport? | Clipping Behavior                        |
|----------|-------------------|------------------------------------------|
| `<svg>`  | Yes               | Clips to width/height (unless overflow)  |
| `<symbol>`| Yes (via use)    | Clips to viewBox mapped to use size      |
| `<use>`  | Creates instance  | May inherit or define width/height       |
| `<image>`| Yes               | Clips to width/height                    |
| `<foreignObject>` | Yes      | Clips to width/height                    |

### Viewport Resolution Algorithm

```javascript
export function resolveViewport(element, parentCTM) {
  const x = D(element.x || 0);
  const y = D(element.y || 0);
  const width = D(element.width);
  const height = D(element.height);

  // 1. Translation to viewport origin
  const translateM = Transforms2D.translation(x, y);

  // 2. viewBox to viewport mapping (if viewBox exists)
  let viewBoxM = Matrix.identity(3);
  if (element.viewBox) {
    const [vbX, vbY, vbW, vbH] = parseViewBox(element.viewBox);
    const par = element.preserveAspectRatio || 'xMidYMid meet';
    viewBoxM = computeViewBoxMatrix(vbX, vbY, vbW, vbH, width, height, par);
  }

  // 3. Combine with parent CTM
  const ctm = parentCTM.mul(translateM).mul(viewBoxM);

  // 4. Create clipping rectangle
  const clipRect = [
    point(0, 0), point(width, 0),
    point(width, height), point(0, height)
  ];

  return { ctm, clipRect, width, height };
}
```

### preserveAspectRatio Values

| Value        | Alignment X | Alignment Y | Behavior              |
|--------------|-------------|-------------|----------------------|
| xMinYMin     | left        | top         | align to top-left    |
| xMidYMin     | center      | top         | center horizontally  |
| xMaxYMin     | right       | top         | align to top-right   |
| xMinYMid     | left        | middle      | center vertically    |
| xMidYMid     | center      | middle      | center both          |
| xMaxYMid     | right       | middle      | right, center vert   |
| xMinYMax     | left        | bottom      | align to bottom-left |
| xMidYMax     | center      | bottom      | center, bottom       |
| xMaxYMax     | right       | bottom      | align bottom-right   |
| none         | stretch     | stretch     | non-uniform scaling  |

| Modifier | Effect                                                  |
|----------|---------------------------------------------------------|
| meet     | Scale uniformly to fit entirely within viewport         |
| slice    | Scale uniformly to cover viewport (may clip)            |

---

## 6. Use Element Resolution

### Reference Types

```xml
<use href="#rectDef"/>           <!-- Local defs -->
<use href="other.svg#shape"/>    <!-- External reference -->
```

### Resolution Algorithm

```javascript
export function resolveUse(useElement, defsMap, parentCTM) {
  const href = useElement.href || useElement['xlink:href'];
  const refId = href.replace('#', '');
  const refElement = defsMap.get(refId);

  // 1. Apply use element's own transform and position
  const x = D(useElement.x || 0);
  const y = D(useElement.y || 0);
  const useTransform = parseTransform(useElement.transform || '');
  const translateM = Transforms2D.translation(x, y);
  const ctm = parentCTM.mul(translateM).mul(useTransform);

  // 2. Handle <symbol> with viewport
  if (refElement.tagName === 'symbol') {
    const width = D(useElement.width || refElement.width);
    const height = D(useElement.height || refElement.height);

    // Create viewport from symbol's viewBox
    const viewport = resolveViewport({
      ...refElement,
      width, height
    }, ctm);

    return {
      type: 'symbol',
      viewport,
      children: refElement.children
    };
  }

  // 3. Regular element reference
  return {
    type: 'reference',
    ctm,
    element: refElement
  };
}
```

---

## 7. Filter Effects Resolution

### Filter Primitives (Geometric Relevance)

| Primitive           | Geometric Impact                                      |
|---------------------|-------------------------------------------------------|
| feOffset           | Translates geometry by dx, dy                         |
| feMorphology       | Erodes/dilates (shrinks/expands) shapes               |
| feDisplacementMap  | Warps geometry based on displacement texture          |
| feGaussianBlur     | Expands bounding box by blur radius                   |
| feDropShadow       | Expands bbox, adds offset copy                        |

### Filter Region
All filters operate within a **filter region**:
```xml
<filter id="f1" x="-10%" y="-10%" width="120%" height="120%">
```

Default: `x="-10%" y="-10%" width="120%" height="120%"` of element bbox.

### Bounding Box Expansion

```javascript
export function getFilterBBoxExpansion(filterElement) {
  let expansion = { left: 0, right: 0, top: 0, bottom: 0 };

  for (const primitive of filterElement.children) {
    switch (primitive.tagName) {
      case 'feGaussianBlur':
        const sigma = D(primitive.stdDeviation);
        const radius = sigma.mul(3); // 3-sigma rule
        expansion.left = Decimal.max(expansion.left, radius);
        expansion.right = Decimal.max(expansion.right, radius);
        expansion.top = Decimal.max(expansion.top, radius);
        expansion.bottom = Decimal.max(expansion.bottom, radius);
        break;

      case 'feOffset':
        const dx = D(primitive.dx || 0);
        const dy = D(primitive.dy || 0);
        if (dx.gt(0)) expansion.right = Decimal.max(expansion.right, dx);
        if (dx.lt(0)) expansion.left = Decimal.max(expansion.left, dx.abs());
        if (dy.gt(0)) expansion.bottom = Decimal.max(expansion.bottom, dy);
        if (dy.lt(0)) expansion.top = Decimal.max(expansion.top, dy.abs());
        break;

      // ... other primitives
    }
  }

  return expansion;
}
```

---

## 8. Stroke-Dasharray Resolution

### Dash Pattern Model

```
stroke-dasharray: d1 d2 d3 d4 ...
stroke-dashoffset: offset
```

**Pattern repeats:** `[dash, gap, dash, gap, ...]`

### Path Length Requirement
To resolve dashes, we need accurate path length:

```javascript
export function resolveStrokeDasharray(pathData, dasharray, dashoffset, ctm) {
  // 1. Flatten path to polyline with high precision
  const polyline = pathToPolyline(pathData, SAMPLES_PER_CURVE);

  // 2. Apply CTM to get actual rendered coordinates
  const transformedPolyline = polyline.map(p => applyTransform(ctm, p.x, p.y));

  // 3. Compute total path length
  let totalLength = D(0);
  for (let i = 1; i < transformedPolyline.length; i++) {
    const dx = transformedPolyline[i][0].minus(transformedPolyline[i-1][0]);
    const dy = transformedPolyline[i][1].minus(transformedPolyline[i-1][1]);
    totalLength = totalLength.plus(dx.pow(2).plus(dy.pow(2)).sqrt());
  }

  // 4. Parse dash array (may need repetition for odd count)
  let dashes = dasharray.split(/[\s,]+/).map(D);
  if (dashes.length % 2 === 1) {
    dashes = [...dashes, ...dashes]; // Repeat to make even
  }

  // 5. Apply offset and generate dash segments
  return generateDashSegments(transformedPolyline, dashes, D(dashoffset));
}
```

---

## 9. Implementation Roadmap

### Phase 1: Core Infrastructure (Current)
- [x] PolygonClip module with Decimal.js
- [x] Path to polygon conversion
- [x] Segment intersection
- [x] Point-in-polygon
- [ ] Path length calculation

### Phase 2: ClipPath
- [ ] clipPathUnits resolution
- [ ] Nested clipPath handling
- [ ] clip-rule (evenodd/nonzero) support
- [ ] Multiple clip shapes (union within clipPath)

### Phase 3: Viewports
- [ ] viewBox/preserveAspectRatio matrix computation
- [ ] Nested SVG viewport stacking
- [ ] Symbol/use viewport handling
- [ ] overflow property handling

### Phase 4: Gradients
- [ ] linearGradient resolution
- [ ] radialGradient resolution
- [ ] gradientTransform handling
- [ ] spreadMethod (pad/reflect/repeat)
- [ ] MeshGradient (SVG 2.0) - optional

### Phase 5: Patterns
- [ ] Pattern viewport resolution
- [ ] patternUnits/patternContentUnits
- [ ] patternTransform
- [ ] Tile coordinate calculation

### Phase 6: Masks
- [ ] Mask region resolution
- [ ] maskUnits/maskContentUnits
- [ ] Luminance extraction
- [ ] Alpha masking

### Phase 7: Filters (Geometric)
- [ ] Filter region calculation
- [ ] BBox expansion for blur/shadow
- [ ] feOffset translation
- [ ] feMorphology erode/dilate

### Phase 8: Stroke Features
- [ ] Accurate path length
- [ ] Dash array resolution
- [ ] Dash offset handling
- [ ] Variable-width stroke (SVG 2.0) - optional

---

## 10. Module Organization

```
src/
  svg-resolver/
    index.js              # Main SVGElementResolver class
    clip-path.js          # ClipPath resolution
    mask.js               # Mask resolution
    gradient.js           # Gradient resolution (linear, radial, mesh)
    pattern.js            # Pattern resolution
    viewport.js           # Viewport/viewBox handling
    use-resolver.js       # <use> and <symbol> resolution
    filter.js             # Filter geometric effects
    stroke.js             # Stroke features (dash, width)
    defs-parser.js        # Parse <defs> and build reference map
```

---

## 11. API Design

```javascript
import { SVGResolver } from '@emasoft/svg-matrix';

const resolver = new SVGResolver({
  precision: 80,          // Decimal.js precision
  curveSamples: 20,       // Samples per bezier curve
  arcSamples: 12          // Samples per arc segment
});

// Parse SVG and build defs map
resolver.loadSVG(svgString);

// Resolve a specific element with all inherited properties
const result = resolver.resolveElement('#myPath', {
  clipPath: true,
  mask: true,
  gradient: true,
  filter: false,
  viewport: true
});

// Result structure
{
  geometry: [/* polygons */],
  fill: { type: 'solid' | 'gradient' | 'pattern', ... },
  stroke: { color, width, dashes: [...] },
  clipRegion: [/* polygon */],
  maskAlpha: [/* alpha values at vertices */],
  ctm: Matrix,
  bbox: { minX, minY, maxX, maxY }
}
```

---

## 12. Key Considerations

### Precision Requirements
- **Segment intersection**: Critical - requires 40+ digit precision for near-parallel lines
- **Point-in-polygon**: Important - ray casting accumulates small errors
- **Gradient sampling**: Moderate - color interpolation tolerates some error
- **Path length**: Important - dash patterns require accurate length

### Performance Trade-offs
- **Curve sampling**: More samples = accuracy, but O(n) complexity
- **Polygon complexity**: Boolean ops are O(n*m) for n and m vertices
- **Nested viewports**: Deep nesting multiplies transform operations

### SVG 2.0 Features
- MeshGradient: Complex Coons patch interpolation
- Variable-width stroke: Requires offset path calculation
- Paint-order: Affects rendering but not geometry
- Marker orient: Tangent calculation at path points

---

## Appendix: Coordinate Space Summary

```
User Space (document coordinates)
    |
    v
[transform] attribute on element
    |
    v
Element Local Space
    |
    v
[clipPathUnits/gradientUnits/etc.]
    |
    v
Effect Space (userSpaceOnUse | objectBoundingBox)
    |
    v
Final Rendered Space
```

Each viewport (svg, symbol, pattern) creates a new coordinate system with its own CTM.
