# @emasoft/svg-matrix API Reference

**Version 1.0.1**

A comprehensive arbitrary-precision matrix, vector, and affine transformation library for JavaScript. Built on [decimal.js](https://github.com/MikeMcl/decimal.js/) for calculations that require precision beyond IEEE 754 floating-point.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Classes](#core-classes)
  - [Decimal](#decimal)
  - [Matrix](#matrix)
  - [Vector](#vector)
- [2D Transforms](#2d-transforms)
- [3D Transforms](#3d-transforms)
- [Geometry to Path](#geometry-to-path)
- [Polygon Operations](#polygon-operations)
- [SVG Element Resolvers](#svg-element-resolvers)
- [SVG Attribute Handling](#svg-attribute-handling)
- [Convenience Functions](#convenience-functions)
- [Precision Control](#precision-control)
- [Browser/CDN Usage](#browsercdn-usage)

---

## Installation

```bash
# npm
npm install @emasoft/svg-matrix

# pnpm
pnpm add @emasoft/svg-matrix

# yarn
yarn add @emasoft/svg-matrix
```

---

## Quick Start

### ES Modules

```javascript
import {
  Decimal, Matrix, Vector,
  Transforms2D, GeometryToPath,
  circleToPath, setPrecision
} from '@emasoft/svg-matrix';

// Set precision to 80 significant digits
setPrecision(80);

// Create a rotation matrix (45 degrees)
const R = Transforms2D.rotate(Math.PI / 4);

// Apply to a point
const [x, y] = Transforms2D.applyTransform(R, 1, 0);
console.log(x.toString(), y.toString());
// Output: 0.7071... 0.7071...

// Convert circle to SVG path with 15 decimal precision
const path = circleToPath(100, 100, 50, 15);
console.log(path);
// Output: M 150.000000000000000 100.000000000000000 C ...
```

### Browser/CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.umd.js"></script>
<script>
  const { Matrix, circleToPath, setPrecision } = SVGMatrix;
  setPrecision(50);
  const path = SVGMatrix.circleToPath(100, 100, 50, 10);
  console.log(path);
</script>
```

---

## Core Classes

### Decimal

Re-exported from [decimal.js](https://mikemcl.github.io/decimal.js/). All numeric operations in this library use `Decimal` for arbitrary precision.

```javascript
import { Decimal } from '@emasoft/svg-matrix';

// Set global precision (1 to 1e9 significant digits)
Decimal.set({ precision: 100 });

// Create Decimal values
const a = new Decimal('0.1');
const b = new Decimal('0.2');
const sum = a.plus(b);
console.log(sum.toString()); // "0.3" (exact, unlike 0.1 + 0.2 in JS)

// Trigonometric functions
const angle = new Decimal(Math.PI / 4);
const sin = Decimal.sin(angle);
const cos = Decimal.cos(angle);
```

**Key Methods:**
- `plus(x)`, `minus(x)`, `mul(x)`, `div(x)` - Arithmetic
- `sqrt()`, `pow(n)`, `abs()`, `neg()` - Power/absolute
- `sin(x)`, `cos(x)`, `tan(x)`, `atan2(y, x)` - Trigonometric (static)
- `toFixed(dp)`, `toDecimalPlaces(dp)`, `toString()` - Formatting

---

### Matrix

Arbitrary-precision matrix class with comprehensive linear algebra operations.

#### Creation

```javascript
import { Matrix, mat, identity, zeros } from '@emasoft/svg-matrix';

// From 2D array
const A = Matrix.from([
  [1, 2, 3],
  [4, 5, 6]
]);

// Convenience function
const B = mat([[1, 2], [3, 4]]);

// Identity matrix
const I = Matrix.identity(3);  // 3x3 identity
const I2 = identity(3);        // Same, convenience function

// Zero matrix
const Z = Matrix.zeros(2, 3);  // 2x3 zeros
const Z2 = zeros(2, 3);        // Same, convenience function
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `rows` | `number` | Number of rows |
| `cols` | `number` | Number of columns |
| `data` | `Decimal[][]` | Raw 2D array of Decimal values |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `clone()` | `Matrix` | Deep copy |
| `add(other)` | `Matrix` | Element-wise addition |
| `sub(other)` | `Matrix` | Element-wise subtraction |
| `mul(other)` | `Matrix` | Matrix multiplication (or scalar) |
| `div(scalar)` | `Matrix` | Scalar division |
| `transpose()` | `Matrix` | Transpose |
| `inverse()` | `Matrix` | Inverse (throws if singular) |
| `determinant()` | `Decimal` | Determinant (square matrices) |
| `lu()` | `{L, U, P}` | LU decomposition with pivoting |
| `qr()` | `{Q, R}` | QR decomposition (Householder) |
| `solve(b)` | `Vector` | Solve Ax = b |
| `exp()` | `Matrix` | Matrix exponential |
| `applyToVector(v)` | `Vector` | Matrix-vector product |
| `isSquare()` | `boolean` | Check if square |
| `toNumberArray()` | `number[][]` | Convert to JS numbers |
| `toArrayOfStrings()` | `string[][]` | Convert to strings |

#### Example: Matrix Operations

```javascript
const A = mat([[1, 2], [3, 4]]);
const B = mat([[5, 6], [7, 8]]);

// Multiplication
const C = A.mul(B);
console.log(C.toNumberArray());
// [[19, 22], [43, 50]]

// Inverse
const Ainv = A.inverse();
console.log(A.mul(Ainv).toNumberArray());
// [[1, 0], [0, 1]] (identity)

// Solve linear system Ax = b
const b = vec([5, 11]);
const x = A.solve(b);
console.log(x.toNumberArray()); // [1, 2]
```

---

### Vector

Arbitrary-precision vector class for geometric and linear algebra operations.

#### Creation

```javascript
import { Vector, vec } from '@emasoft/svg-matrix';

const v1 = Vector.from([1, 2, 3]);
const v2 = vec([4, 5, 6]);  // Convenience function
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `length` | `number` | Number of components |
| `data` | `Decimal[]` | Array of Decimal values |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `clone()` | `Vector` | Deep copy |
| `add(other)` | `Vector` | Vector addition |
| `sub(other)` | `Vector` | Vector subtraction |
| `scale(scalar)` | `Vector` | Scalar multiplication |
| `negate()` | `Vector` | Negate all components |
| `dot(other)` | `Decimal` | Dot product |
| `cross(other)` | `Vector` | Cross product (3D only) |
| `outer(other)` | `Matrix` | Outer product |
| `norm()` | `Decimal` | Euclidean length |
| `normalize()` | `Vector` | Unit vector |
| `angleBetween(other)` | `Decimal` | Angle in radians |
| `projectOnto(other)` | `Vector` | Projection onto other |
| `orthogonal()` | `Vector` | Perpendicular vector (2D/3D) |
| `toArray()` | `Decimal[]` | Get Decimal array |
| `toNumberArray()` | `number[]` | Convert to JS numbers |
| `toStringArray()` | `string[]` | Convert to strings |

#### Example: Vector Operations

```javascript
const v1 = vec([1, 0, 0]);
const v2 = vec([0, 1, 0]);

// Cross product
const cross = v1.cross(v2);
console.log(cross.toNumberArray()); // [0, 0, 1]

// Normalize
const v3 = vec([3, 4]);
const unit = v3.normalize();
console.log(unit.norm().toNumber()); // 1

// Angle between vectors
const angle = v1.angleBetween(v2);
console.log(angle.toNumber()); // ~1.5708 (PI/2)
```

---

## 2D Transforms

Module: `Transforms2D`

Creates 3x3 homogeneous transformation matrices for 2D affine operations.

### Functions

| Function | Description |
|----------|-------------|
| `translation(tx, ty)` | Translation matrix |
| `scale(sx, [sy])` | Scale matrix (uniform if sy omitted) |
| `rotate(theta)` | Rotation matrix (radians) |
| `rotateAroundPoint(theta, px, py)` | Rotation around point |
| `skew(ax, ay)` | Skew/shear matrix |
| `stretchAlongAxis(ux, uy, k)` | Stretch along unit vector |
| `reflectX()` | Reflect across X-axis |
| `reflectY()` | Reflect across Y-axis |
| `reflectOrigin()` | Reflect through origin |
| `applyTransform(M, x, y)` | Apply matrix to point |

### Example: Composing Transforms

```javascript
import { Transforms2D } from '@emasoft/svg-matrix';

// Create individual transforms
const T = Transforms2D.translation(100, 50);
const R = Transforms2D.rotate(Math.PI / 4);
const S = Transforms2D.scale(2, 1.5);

// Compose: translate, then rotate, then scale
// Note: right-to-left multiplication order
const M = S.mul(R).mul(T);

// Apply to a point
const [x, y] = Transforms2D.applyTransform(M, 10, 20);
console.log(x.toString(), y.toString());
```

### Transform Composition Order

Transforms compose right-to-left: `C = A.mul(B)` means B is applied first, then A.

```javascript
// To translate then rotate:
const translateThenRotate = R.mul(T);  // T first, then R

// To rotate then translate:
const rotateThenTranslate = T.mul(R);  // R first, then T
```

---

## 3D Transforms

Module: `Transforms3D`

Creates 4x4 homogeneous transformation matrices for 3D affine operations.

### Functions

| Function | Description |
|----------|-------------|
| `translation(tx, ty, tz)` | Translation matrix |
| `scale(sx, [sy], [sz])` | Scale matrix |
| `rotateX(theta)` | Rotation around X-axis |
| `rotateY(theta)` | Rotation around Y-axis |
| `rotateZ(theta)` | Rotation around Z-axis |
| `rotateAroundAxis(ux, uy, uz, theta)` | Rotation around arbitrary axis |
| `rotateAroundPoint(ux, uy, uz, theta, px, py, pz)` | Rotation around axis through point |
| `reflectXY()` | Reflect across XY-plane |
| `reflectXZ()` | Reflect across XZ-plane |
| `reflectYZ()` | Reflect across YZ-plane |
| `reflectOrigin()` | Reflect through origin |
| `applyTransform(M, x, y, z)` | Apply matrix to 3D point |

### Example

```javascript
import { Transforms3D } from '@emasoft/svg-matrix';

// Rotate 45 degrees around the Z-axis
const R = Transforms3D.rotateZ(Math.PI / 4);

// Rotate around arbitrary axis (1, 1, 1) normalized
const axis = Math.sqrt(3);
const R2 = Transforms3D.rotateAroundAxis(1/axis, 1/axis, 1/axis, Math.PI / 3);

// Apply to point
const [x, y, z] = Transforms3D.applyTransform(R, 1, 0, 0);
```

---

## Geometry to Path

Module: `GeometryToPath`

Converts SVG geometry elements to path data strings with arbitrary precision.

### Shape Conversion Functions

| Function | Description |
|----------|-------------|
| `circleToPathData(cx, cy, r, precision)` | Circle to cubic Beziers |
| `ellipseToPathData(cx, cy, rx, ry, precision)` | Ellipse to cubic Beziers |
| `rectToPathData(x, y, w, h, rx, ry, useArcs, precision)` | Rectangle (rounded optional) |
| `lineToPathData(x1, y1, x2, y2, precision)` | Line segment |
| `polylineToPathData(points, precision)` | Polyline from points |
| `polygonToPathData(points, precision)` | Closed polygon |
| `convertElementToPath(element, precision)` | Auto-detect element type |

### Path Manipulation Functions

| Function | Description |
|----------|-------------|
| `parsePathData(pathData)` | Parse path string to commands |
| `pathArrayToString(commands, precision)` | Commands to path string |
| `pathToAbsolute(pathData)` | Convert relative to absolute |
| `pathToCubics(pathData)` | Convert all commands to cubic Beziers |
| `transformPathData(pathData, matrix, precision)` | Transform path with matrix |
| `transformArcParams(rx, ry, rot, large, sweep, x, y, matrix)` | Transform arc parameters |

### Utility Functions

| Function | Description |
|----------|-------------|
| `getKappa()` | Get exact Bezier circle constant |

### The Kappa Constant

The library uses the exact kappa constant for approximating circles/arcs with cubic Bezier curves:

```
kappa = 4 * (sqrt(2) - 1) / 3
     = 0.5522847498307933984022516322795974380928958338...
```

This provides the optimal control point distance for quarter-circle arcs.

### Example: High-Precision Circle

```javascript
import { GeometryToPath, getKappa } from '@emasoft/svg-matrix';

// Get the exact kappa constant
const kappa = getKappa();
console.log(kappa.toString());
// 0.55228474983079339840225163227959743809289583383593...

// Create a circle path with 20 decimal places
const path = GeometryToPath.circleToPathData(100, 100, 50, 20);
console.log(path);
// M 150.00000000000000000000 100.00000000000000000000 C ...
```

### Example: Transform a Path

```javascript
import { GeometryToPath, Transforms2D } from '@emasoft/svg-matrix';

const original = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';

// Create scale transform
const S = Transforms2D.scale(2, 0.5);

// Transform the path
const transformed = GeometryToPath.transformPathData(original, S, 6);
console.log(transformed);
// M 0.000000 0.000000 L 200.000000 0.000000 L 200.000000 50.000000 ...
```

---

## Polygon Operations

Module: `PolygonClip`

Sutherland-Hodgman polygon clipping and related geometric operations.

### Functions

| Function | Description |
|----------|-------------|
| `clipPolygonSH(subject, clip)` | Clip polygon against convex clip polygon |
| `boundingBox(polygon)` | Get bounding box |
| `bboxIntersects(bb1, bb2)` | Check bounding box intersection |
| `isConvex(polygon)` | Check if polygon is convex |
| `isCounterClockwise(polygon)` | Check winding order |
| `ensureCCW(polygon)` | Ensure counter-clockwise winding |
| `reversePolygon(polygon)` | Reverse winding order |
| `convexHull(points)` | Compute convex hull |
| `segmentIntersection(a, b, c, d)` | Line segment intersection |
| `lineSegmentIntersection(lineA, lineB, segA, segB)` | Line-segment intersection |

### Polygon Format

Polygons are arrays of `[x, y]` coordinate pairs (can be numbers, strings, or Decimals):

```javascript
const triangle = [[0, 0], [100, 0], [50, 100]];
const square = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100]
];
```

### Example: Clipping

```javascript
import { PolygonClip } from '@emasoft/svg-matrix';

const subject = [[10, 10], [90, 10], [90, 90], [10, 90]];
const clip = [[0, 0], [50, 0], [50, 100], [0, 100]];

const result = PolygonClip.clipPolygonSH(subject, clip);
// Result: clipped polygon vertices
```

---

## SVG Element Resolvers

These modules handle complex SVG features by resolving references and computing final geometry.

### ClipPathResolver

Resolves `<clipPath>` elements and applies clipping to shapes.

```javascript
import { ClipPathResolver } from '@emasoft/svg-matrix';

// Resolve clip path definition
const clipPolygon = ClipPathResolver.resolveClipPath(clipPathDef, targetElement, ctm);

// Apply clip to element
const clipped = ClipPathResolver.applyClipPath(element, clipPathDef, ctm, options);
```

### MaskResolver

Handles `<mask>` elements including luminance and alpha mask types.

```javascript
import { MaskResolver } from '@emasoft/svg-matrix';

// Parse mask element
const maskData = MaskResolver.parseMaskElement(maskElement);

// Get mask region
const region = MaskResolver.getMaskRegion(maskData, targetBBox);

// Convert mask to clip path
const clipPath = MaskResolver.maskToClipPath(maskData, targetBBox, threshold);
```

### PatternResolver

Resolves `<pattern>` elements for fill patterns.

```javascript
import { PatternResolver } from '@emasoft/svg-matrix';

// Get pattern tile
const tile = PatternResolver.getPatternTile(patternData, targetBBox);

// Get tile positions for coverage
const positions = PatternResolver.getTilePositions(tile, coverBBox);
```

### UseSymbolResolver

Handles `<use>` and `<symbol>` elements.

```javascript
import { UseSymbolResolver } from '@emasoft/svg-matrix';

// Resolve use element
const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

// Get bounding box
const bbox = UseSymbolResolver.getResolvedBBox(resolved);

// Convert to path data
const pathData = UseSymbolResolver.resolvedUseToPathData(resolved);
```

### MarkerResolver

Resolves `marker-start`, `marker-mid`, and `marker-end` on paths.

```javascript
import { MarkerResolver } from '@emasoft/svg-matrix';

// Parse marker element
const markerDef = MarkerResolver.parseMarkerElement(markerElement);

// Resolve markers on a path
const instances = MarkerResolver.resolveMarkers(pathElement, defsMap);

// Convert to path data
const markerPath = MarkerResolver.markersToPathData(instances);
```

### MeshGradient

SVG 2.0 mesh gradient support (Coons patches).

```javascript
import { MeshGradient } from '@emasoft/svg-matrix';

// Parse mesh gradient
const meshData = MeshGradient.parseMeshGradient(meshGradientDef);

// Convert to polygons for rendering
const polygons = MeshGradient.meshGradientToPolygons(meshData);
```

### TextToPath

Convert text elements to path outlines.

```javascript
import { TextToPath } from '@emasoft/svg-matrix';

// Convert text to path
const pathData = TextToPath.textToPath(text, options);

// Measure text
const metrics = TextToPath.measureText(text, style, font);
```

---

## SVG Attribute Handling

The library provides comprehensive attribute handling during shape-to-path conversion and transform flattening operations. This ensures that all visual properties are preserved and validated.

### Presentation Attribute Preservation

When converting shapes to paths or flattening transforms, **all presentation attributes are automatically preserved**. This prevents silent rendering bugs that would otherwise occur when geometric shape elements are converted to path elements.

**Preserved Attribute Categories:**

#### Stroke Properties
- `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`
- `stroke-dasharray`, `stroke-dashoffset`, `stroke-miterlimit`, `stroke-opacity`
- `vector-effect` (affects stroke rendering, e.g., `non-scaling-stroke`)

#### Fill Properties
- `fill`, `fill-opacity`, `fill-rule`

#### Non-Inheritable Effects (Critical)
- `clip-path` - Clips geometry; must not be lost during conversion
- `mask` - Masks transparency; must not be lost during conversion
- `filter` - Visual effects; must not be lost during conversion
- `opacity` - Element opacity
- `clip-rule` - Clipping fill rule

#### Marker Properties
- `marker` - Shorthand for all markers
- `marker-start` - Start of path (arrows, dots)
- `marker-mid` - Path vertices
- `marker-end` - End of path

#### Visibility
- `visibility`, `display`

#### Text Properties
- `font-family`, `font-size`, `font-weight`, `font-style`
- `text-anchor`, `dominant-baseline`, `alignment-baseline`
- `letter-spacing`, `word-spacing`, `text-decoration`

#### Rendering Hints
- `shape-rendering`, `text-rendering`, `image-rendering`, `color-rendering`

#### Visual Effects
- `paint-order` - Controls stroke/fill/marker rendering order
- `pointer-events`, `cursor` - Event handling and visual feedback

#### Targeting
- `class`, `style`, `id` - Preserved for CSS targeting and references

### URL Reference Validation

The library validates all `url(#id)` references to ensure they point to existing elements in the document. This prevents broken references that would cause rendering failures.

**Validated in Attributes:**

- `fill`, `stroke` - Gradient or pattern references
- `clip-path` - Clipping path references
- `mask` - Mask element references
- `filter` - Filter effect references
- `color-profile` - Color profile references
- `marker`, `marker-start`, `marker-mid`, `marker-end` - Marker references

**Validated in Direct References:**

- `href`, `xlink:href` - Element references in `<use>`, `<image>`, etc.

**Detection:**

```javascript
import { validateSvg } from '@emasoft/svg-matrix';

// Validate SVG and detect broken references
const issues = await validateSvg(svgString);

// Issues will include entries like:
// {
//   type: 'broken_reference',
//   severity: 'error',
//   element: 'rect',
//   attr: 'fill',
//   refId: 'gradientMissing',
//   reason: "Broken reference: url(#gradientMissing) points to non-existent ID"
// }
```

### Color Attribute Validation

The library validates color values in color-related attributes to ensure they conform to SVG specifications.

**Validated Attributes:**

- `fill`, `stroke`, `color` - Primary color attributes
- `stop-color` - Gradient stop colors
- `flood-color` - Filter flood colors
- `lighting-color` - Filter lighting colors
- `solid-color` - Solid color paint servers

**Supported Color Formats:**

- Named colors: `red`, `blue`, `aliceblue`, etc. (case-insensitive)
- Hex colors: `#RGB`, `#RRGGBB`
- RGB functions: `rgb(255, 0, 0)`, `rgb(100%, 0%, 0%)`
- RGBA functions: `rgba(255, 0, 0, 0.5)` (SVG 2.0, widely supported)
- Special values: `none`, `inherit`, `currentColor`
- URL references: `url(#gradientId)`

**Example:**

```javascript
import { validateSvg } from '@emasoft/svg-matrix';

// Validate colors
const issues = await validateSvg(svgString);

// Invalid colors will be reported:
// {
//   type: 'invalid_color',
//   severity: 'warning',
//   element: 'rect',
//   attr: 'fill',
//   value: 'reds',
//   reason: "Invalid color value 'reds' for attribute 'fill'"
// }
```

### Automatic Preservation During Conversion

All attribute preservation happens automatically during shape conversion:

```javascript
import { GeometryToPath } from '@emasoft/svg-matrix';

// Original circle element with presentation attributes
const circle = document.querySelector('circle');
// <circle cx="100" cy="100" r="50"
//         fill="red" stroke="blue" stroke-width="2"
//         opacity="0.5" clip-path="url(#clip1)" />

// Convert to path - all attributes automatically preserved
const pathData = GeometryToPath.convertElementToPath(circle, 6);

// Result: <path d="M 150 100 C ..."
//               fill="red" stroke="blue" stroke-width="2"
//               opacity="0.5" clip-path="url(#clip1)" />
```

---

## Convenience Functions

Top-level shortcuts for common operations:

### Transform Shortcuts

```javascript
import { translate2D, rotate2D, scale2D, transform2D } from '@emasoft/svg-matrix';

const T = translate2D(10, 20);
const R = rotate2D(Math.PI / 4);
const S = scale2D(2);

const M = S.mul(R).mul(T);
const [x, y] = transform2D(M, 5, 5);
```

### Geometry Shortcuts

```javascript
import {
  circleToPath, ellipseToPath, rectToPath,
  lineToPath, polygonToPath, polylineToPath,
  parsePath, pathToString, pathToAbsolute, pathToCubics, transformPath
} from '@emasoft/svg-matrix';

// Convert shapes
const circle = circleToPath(100, 100, 50, 10);
const rect = rectToPath(0, 0, 100, 50, 5, 5, 8);

// Parse and transform
const parsed = parsePath('M 0 0 L 100 100');
const absolute = pathToAbsolute('M 10 10 l 20 20');
const cubics = pathToCubics('M 0 0 Q 50 100 100 0');
```

### Matrix/Vector Shortcuts

```javascript
import { mat, vec, identity, zeros } from '@emasoft/svg-matrix';

const A = mat([[1, 2], [3, 4]]);
const v = vec([1, 2, 3]);
const I = identity(4);
const Z = zeros(3, 3);
```

---

## Precision Control

### Setting Global Precision

```javascript
import { Decimal, setPrecision, getPrecision } from '@emasoft/svg-matrix';

// Set precision (significant digits, not decimal places)
setPrecision(100);  // 100 significant digits
console.log(getPrecision()); // 100

// Or use Decimal directly
Decimal.set({
  precision: 80,      // Significant digits
  rounding: 4,        // ROUND_HALF_UP
  toExpNeg: -9e15,    // Threshold for exponential notation
  toExpPos: 9e15
});
```

### Output Precision

Path output precision (decimal places) is controlled per-function:

```javascript
import { circleToPath } from '@emasoft/svg-matrix';

// 6 decimal places (default)
const path6 = circleToPath(100, 100, 50);
// M 150.000000 100.000000 C ...

// 15 decimal places
const path15 = circleToPath(100, 100, 50, 15);
// M 150.000000000000000 100.000000000000000 C ...

// 2 decimal places
const path2 = circleToPath(100, 100, 50, 2);
// M 150.00 100.00 C ...
```

---

## Browser/CDN Usage

### UMD Bundle

```html
<script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.umd.js"></script>
<script>
  // All exports available on SVGMatrix global
  const { Matrix, Vector, Transforms2D, circleToPath, setPrecision } = SVGMatrix;

  // Or use the namespace directly
  SVGMatrix.setPrecision(50);
  const path = SVGMatrix.circleToPath(100, 100, 50, 10);

  // Create matrices and vectors
  const M = SVGMatrix.mat([[1, 0, 10], [0, 1, 20], [0, 0, 1]]);
  const v = SVGMatrix.vec([5, 10]);
</script>
```

### ES Module (Modern Browsers)

```html
<script type="module">
  import SVGMatrix from 'https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/+esm';

  const { circleToPath, Matrix } = SVGMatrix;
  console.log(circleToPath(100, 100, 50));
</script>
```

### Complete Browser Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>SVG Matrix Demo</title>
</head>
<body>
  <svg id="canvas" width="400" height="400"></svg>

  <script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.umd.js"></script>
  <script>
    const { circleToPath, Transforms2D, transformPath, setPrecision } = SVGMatrix;

    // Set high precision
    setPrecision(50);

    // Create a circle path
    const circlePath = circleToPath(200, 200, 80, 8);

    // Create rotation transform
    const R = Transforms2D.rotate(Math.PI / 6);

    // Transform the path
    const rotatedPath = transformPath(circlePath, R, 4);

    // Add to SVG
    const svg = document.getElementById('canvas');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', rotatedPath);
    path.setAttribute('fill', 'steelblue');
    path.setAttribute('stroke', 'navy');
    svg.appendChild(path);
  </script>
</body>
</html>
```

---

## Module Reference

| Module | Description |
|--------|-------------|
| `Decimal` | Arbitrary-precision decimal (from decimal.js) |
| `Matrix` | Matrix class with linear algebra |
| `Vector` | Vector class with geometric operations |
| `Transforms2D` | 3x3 affine 2D transforms |
| `Transforms3D` | 4x4 affine 3D transforms |
| `GeometryToPath` | Shape to SVG path conversion |
| `PolygonClip` | Polygon clipping operations |
| `SVGFlatten` | Flatten SVG documents |
| `BrowserVerify` | Verify against browser rendering |
| `ClipPathResolver` | Resolve clip-path elements |
| `MaskResolver` | Resolve mask elements |
| `PatternResolver` | Resolve pattern elements |
| `UseSymbolResolver` | Resolve use/symbol elements |
| `MarkerResolver` | Resolve marker elements |
| `MeshGradient` | SVG 2.0 mesh gradients |
| `TextToPath` | Text to path conversion |

---

## License

MIT License - see LICENSE file for details.
