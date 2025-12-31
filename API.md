# @emasoft/svg-matrix API Reference

**Version 1.1.0**

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
- [SVGToolbox Functions](#svgtoolbox-functions)
  - [Cleanup Functions](#cleanup-functions)
  - [Removal Functions](#removal-functions)
  - [Conversion Functions](#conversion-functions)
  - [Optimization Functions](#optimization-functions)
  - [Modification Functions](#modification-functions)
  - [Validation Functions](#validation-functions)
  - [Embedding Functions](#embedding-functions)
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

## Logger

Module: `Logger`

Configurable logging for the svg-matrix library with buffered file output and console logging.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `Logger` | `Object` | Global logger instance |
| `LogLevel` | `Object` | Log level enumeration |
| `setLogLevel(level)` | `function` | Set global log level |
| `getLogLevel()` | `function` | Get current log level |
| `enableFileLogging(filePath, withTimestamps)` | `function` | Enable file logging |
| `disableFileLogging()` | `function` | Disable file logging |

### LogLevel Enum

```javascript
import { LogLevel } from '@emasoft/svg-matrix';

LogLevel.SILENT  // 0 - Suppress all logging
LogLevel.ERROR   // 1 - Log only errors
LogLevel.WARN    // 2 - Log errors and warnings (default)
LogLevel.INFO    // 3 - Log errors, warnings, and info
LogLevel.DEBUG   // 4 - Log everything including debug
```

### Logger Object

```javascript
import { Logger } from '@emasoft/svg-matrix';

// Logger properties
Logger.level            // Current log level (default: LogLevel.WARN)
Logger.logToFile        // File path for logging (null = disabled)
Logger.timestamps       // Include timestamps (default: false)

// Logger methods
Logger.error(message, ...args)    // Log error (always shown unless SILENT)
Logger.warn(message, ...args)     // Log warning (WARN level and above)
Logger.info(message, ...args)     // Log info (INFO level and above)
Logger.debug(message, ...args)    // Log debug (DEBUG level only)
Logger.flush()                    // Flush buffered messages to file
Logger.shutdown()                 // Cleanup and flush before exit
```

### Example

```javascript
import { Logger, LogLevel, setLogLevel, enableFileLogging } from '@emasoft/svg-matrix';

// Set log level
setLogLevel(LogLevel.DEBUG);

// Enable file logging with timestamps
enableFileLogging('./svg-matrix.log', true);

// Use logger
Logger.debug('Processing SVG...');
Logger.info('Converted 5 shapes to paths');
Logger.warn('Missing gradient reference: #grad1');
Logger.error('Failed to parse transform matrix');

// Cleanup before exit
Logger.shutdown();
```

---

## InkscapeSupport

Module: `InkscapeSupport`

Utilities for preserving and manipulating Inkscape-specific SVG features including layers, guides, document settings, and metadata.

### Constants

```javascript
import { INKSCAPE_NS, SODIPODI_NS, INKSCAPE_PREFIXES } from '@emasoft/svg-matrix';

INKSCAPE_NS           // 'http://www.inkscape.org/namespaces/inkscape'
SODIPODI_NS           // 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd'
INKSCAPE_PREFIXES     // ['inkscape', 'sodipodi']
```

### Layer Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `isInkscapeLayer(element)` | `boolean` | Check if element is an Inkscape layer |
| `getLayerLabel(element)` | `string\|null` | Get layer label |
| `findLayers(doc)` | `Array<Object>` | Find all layers in document |
| `extractLayer(doc, layerId, options)` | `Object` | Extract a single layer as standalone SVG |
| `extractAllLayers(doc, options)` | `Array<Object>` | Extract all layers as separate SVGs |
| `analyzeLayerDependencies(doc)` | `Object` | Analyze shared/exclusive defs usage |

### Document Metadata Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getNamedViewSettings(doc)` | `Object\|null` | Get Inkscape document settings |
| `findGuides(doc)` | `Array<Object>` | Find all guide elements |
| `hasInkscapeNamespaces(doc)` | `boolean` | Check for Inkscape namespace declarations |
| `ensureInkscapeNamespaces(doc)` | `Object` | Add Inkscape namespaces if missing |

### Element Metadata Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getArcParameters(element)` | `Object\|null` | Get sodipodi arc parameters |
| `getNodeTypes(element)` | `string\|null` | Get path node types (c/s/z/a) |
| `getExportSettings(element)` | `Object\|null` | Get export filename and DPI |
| `isTiledClone(element)` | `boolean` | Check if element is tiled clone |
| `getTiledCloneSource(element)` | `string\|null` | Get tiled clone source ID |

### Defs Resolution Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `findReferencedIds(element)` | `Set<string>` | Find all ID references in element |
| `buildDefsMapFromDefs(doc)` | `Map` | Build map of def elements by ID |
| `resolveDefsDependencies(refs, defsMap)` | `Set<string>` | Resolve transitive dependencies |
| `cloneElement(element, idMap, defsMap)` | `Object` | Deep clone element with ID remapping |

### Example

```javascript
import { InkscapeSupport } from '@emasoft/svg-matrix';

// Find all layers
const layers = InkscapeSupport.findLayers(doc);
// [{element, label: 'Background', id: 'layer1'}, ...]

// Extract a specific layer
const layer = InkscapeSupport.extractLayer(doc, 'layer1', {
  includeSharedDefs: true
});

// Analyze dependencies
const deps = InkscapeSupport.analyzeLayerDependencies(doc);
// {layers: [...], sharedDefs: [...], exclusiveDefs: Map}

// Get document settings
const settings = InkscapeSupport.getNamedViewSettings(doc);
// {pagecolor, showgrid, inkscapeZoom, ...}
```

---

## SVG2Polyfills

Module: `SVG2Polyfills`

Detects SVG 2.0 features and generates inline JavaScript polyfills for browser compatibility.

### Constants

```javascript
import { SVG2_FEATURES } from '@emasoft/svg-matrix';

SVG2_FEATURES.MESH_GRADIENT        // 'meshGradient'
SVG2_FEATURES.HATCH                // 'hatch'
SVG2_FEATURES.CONTEXT_PAINT        // 'context-paint'
SVG2_FEATURES.AUTO_START_REVERSE   // 'auto-start-reverse'
```

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `setPolyfillMinification(minify)` | `void` | Use minified polyfills (default: true) |
| `detectSVG2Features(doc)` | `Object` | Detect which SVG 2.0 features are used |
| `needsPolyfills(doc)` | `boolean` | Check if document needs polyfills |
| `generatePolyfillScript(features)` | `string\|null` | Generate polyfill JavaScript code |
| `injectPolyfills(doc, options)` | `Object` | Inject polyfills into document |
| `removePolyfills(doc)` | `Object` | Remove polyfill scripts from document |

### Feature Detection Object

```javascript
{
  meshGradients: ['gradient1', 'gradient2'],  // Array of mesh gradient IDs
  hatches: ['hatch1'],                        // Array of hatch IDs
  contextPaint: false,                        // Uses context-fill/context-stroke
  autoStartReverse: false                     // Uses auto-start-reverse markers
}
```

### Example

```javascript
import { SVG2Polyfills, detectSVG2Features, injectPolyfills } from '@emasoft/svg-matrix';

// Detect features
const features = detectSVG2Features(doc);
// {meshGradients: ['grad1'], hatches: [], ...}

// Check if polyfills needed
if (SVG2Polyfills.needsPolyfills(doc)) {
  // Inject polyfills
  injectPolyfills(doc, { features });
}

// Use full polyfill code for debugging
SVG2Polyfills.setPolyfillMinification(false);
injectPolyfills(doc);

// Remove polyfills
SVG2Polyfills.removePolyfills(doc);
```

---

## SVGParser

Module: `SVGParser`

Lightweight DOM-like SVG parser for Node.js without external dependencies.

### Classes

```javascript
import { SVGElement } from '@emasoft/svg-matrix';

// SVGElement properties
element.tagName              // Element tag name (preserves case)
element.nodeName             // Uppercase tag name
element.children             // Array of child elements
element.textContent          // Text content
element.parentNode           // Parent element reference
element.ownerDocument        // Document reference

// SVGElement methods
element.getAttribute(name)              // Get attribute value
element.setAttribute(name, value)       // Set attribute value
element.hasAttribute(name)              // Check if attribute exists
element.removeAttribute(name)           // Remove attribute
element.querySelector(selector)         // Find first matching descendant
element.querySelectorAll(selector)      // Find all matching descendants
element.getElementsByTagName(tagName)   // Find by tag name
element.serialize(indent, minify)       // Serialize to SVG string
```

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `parseSVG(svgString)` | `SVGElement` | Parse SVG string to element tree |
| `serializeSVG(root, options)` | `string` | Serialize element tree to SVG string |
| `buildDefsMap(root)` | `Map` | Build map of all elements with IDs |
| `findElementsWithAttribute(root, attrName)` | `Array<SVGElement>` | Find elements with attribute |
| `parseUrlReference(urlValue)` | `string\|null` | Extract ID from `url(#id)` |

### Example

```javascript
import { parseSVG, serializeSVG, SVGElement } from '@emasoft/svg-matrix';

// Parse SVG
const doc = parseSVG('<svg><circle cx="50" cy="50" r="25"/></svg>');

// Query elements
const circles = doc.querySelectorAll('circle');
const circle = doc.querySelector('circle');

// Manipulate attributes
circle.setAttribute('fill', 'red');
const cx = circle.getAttribute('cx');  // '50'

// Serialize back to string
const svgString = serializeSVG(doc, { minify: true });
```

---

## Verification

Module: `Verification`

Mathematical verification functions for precision operations using arbitrary precision.

### Tolerance Computation

| Function | Returns | Description |
|----------|---------|-------------|
| `computeTolerance()` | `Decimal` | Compute tolerance based on current precision |

### Transform Verification

| Function | Returns | Description |
|----------|---------|-------------|
| `verifyTransformRoundTrip(matrix, x, y)` | `VerificationResult` | Verify M * M^-1 * p = p |
| `verifyTransformGeometry(matrix, points)` | `VerificationResult` | Verify geometric properties preserved |

### Matrix Verification

| Function | Returns | Description |
|----------|---------|-------------|
| `verifyMatrixInversion(matrix)` | `VerificationResult` | Verify M * M^-1 = I |
| `verifyMultiplicationAssociativity(A, B, C)` | `VerificationResult` | Verify (A*B)*C = A*(B*C) |

### Polygon Verification

| Function | Returns | Description |
|----------|---------|-------------|
| `verifyPolygonContainment(inner, outer, tol)` | `VerificationResult` | Verify inner ⊆ outer |
| `verifyPolygonIntersection(p1, p2, result)` | `VerificationResult` | Verify intersection validity |
| `verifyPolygonUnionArea(polygons, expectedArea)` | `VerificationResult` | Verify union area |
| `computePolygonDifference(subject, clip)` | `Array<Polygon>` | Compute polygon difference |

### Path Conversion Verification

| Function | Returns | Description |
|----------|---------|-------------|
| `verifyCircleToPath(cx, cy, r, pathData)` | `VerificationResult` | Verify circle conversion accuracy |
| `verifyRectToPath(x, y, w, h, pathData)` | `VerificationResult` | Verify rectangle conversion |
| `verifyLinearGradientTransform(orig, baked, M)` | `VerificationResult` | Verify gradient transform |

### E2E Verification

| Function | Returns | Description |
|----------|---------|-------------|
| `verifyClipPathE2E(original, clipped, outside, tol)` | `VerificationResult` | Verify clipping preserves area |
| `verifyPipelineE2E(params)` | `VerificationResult` | Verify full pipeline accuracy |
| `verifyPathTransformation(params)` | `Object` | Run all transform verifications |

### VerificationResult Object

```javascript
{
  valid: boolean,           // Whether verification passed
  error: Decimal,           // Magnitude of error found
  tolerance: Decimal,       // Tolerance used for comparison
  message: string,          // Explanation of result
  details: Object           // Additional verification details
}
```

### Example

```javascript
import { Verification, Transforms2D } from '@emasoft/svg-matrix';

// Create transform
const M = Transforms2D.rotation(Math.PI / 4);

// Verify round-trip
const result = Verification.verifyTransformRoundTrip(M, 10, 20);
console.log(result.valid);     // true
console.log(result.message);   // "Round-trip verified: error 1.2e-75 < tolerance 1e-70"

// Verify matrix inversion
const invResult = Verification.verifyMatrixInversion(M);
console.log(invResult.valid);  // true

// Verify polygon clipping
const original = [[0,0], [100,0], [100,100], [0,100]];
const clipped = [[0,0], [50,0], [50,100], [0,100]];
const clipResult = Verification.verifyClipPathE2E(original, clipped);
console.log(clipResult.valid);  // true
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
| `Logger` | Configurable logging with file output |
| `InkscapeSupport` | Inkscape layer and metadata utilities |
| `SVG2Polyfills` | SVG 2.0 feature detection and polyfills |
| `SVGParser` | Lightweight DOM-like SVG parser |
| `Verification` | Mathematical verification for precision ops |

---

## Bezier Curve Analysis

Module: `BezierAnalysis`

Arbitrary-precision Bezier curve operations using 80-digit precision (10^65x better than float64). Provides mathematically exact computations for differential geometry and curve manipulation.

### Evaluation Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierPoint(points, t)` | `[Decimal, Decimal]` | Evaluate curve at t using de Casteljau |
| `bezierPointHorner(points, t)` | `[Decimal, Decimal]` | Evaluate using Horner's rule (optimized) |

### Derivatives and Tangents

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierDerivative(points, t, n=1)` | `[Decimal, Decimal]` | Compute nth derivative at t |
| `bezierDerivativePoints(points)` | `Array` | Get derivative control points (hodograph) |
| `bezierTangent(points, t)` | `[Decimal, Decimal]` | Unit tangent vector at t |
| `bezierNormal(points, t)` | `[Decimal, Decimal]` | Unit normal vector at t (perpendicular) |

### Curvature Analysis

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierCurvature(points, t)` | `Decimal` | Signed curvature at t |
| `bezierRadiusOfCurvature(points, t)` | `Decimal` | Radius of curvature (1/\|k\|) |

### Curve Subdivision

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierSplit(points, t)` | `{left, right}` | Split curve at t (de Casteljau) |
| `bezierHalve(points)` | `{left, right}` | Split at t=0.5 (optimized) |
| `bezierCrop(points, t0, t1)` | `Array` | Extract curve portion from t0 to t1 |

### Polynomial Conversion

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierToPolynomial(points)` | `{x: Decimal[], y: Decimal[]}` | Convert to polynomial coefficients |
| `polynomialToBezier(xCoeffs, yCoeffs)` | `Array` | Convert from polynomial to Bezier |

### Bounding Box

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierBoundingBox(points)` | `{xmin, xmax, ymin, ymax}` | Exact axis-aligned bounding box |

### Verification Functions

| Function | Description |
|----------|-------------|
| `verifyBezierPoint(points, t, tolerance)` | Verify de Casteljau vs Horner |
| `verifyBezierSplit(points, splitT, tolerance)` | Verify split preserves curve |
| `verifyBezierCrop(points, t0, t1, tolerance)` | Verify crop endpoints |
| `verifyPolynomialConversion(points, tolerance)` | Verify roundtrip conversion |
| `verifyTangentNormal(points, t, tolerance)` | Verify orthogonality and magnitude |
| `verifyCurvature(points, t, tolerance)` | Compare analytic vs finite difference |
| `verifyBoundingBox(points, samples, tolerance)` | Verify bbox contains all points |
| `verifyDerivative(points, t, order, tolerance)` | Compare analytic vs finite difference |
| `verifyPointOnCurve(points, testPoint, tolerance)` | Verify point lies on curve |

---

## Arc Length Computation

Module: `ArcLength`

High-precision arc length calculations using adaptive Gauss-Legendre quadrature with 80-digit precision.

### Arc Length Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `arcLength(points, t0=0, t1=1, options)` | `Decimal` | Arc length between t0 and t1 |
| `inverseArcLength(points, targetLength, options)` | `{t, length, iterations, converged}` | Find t for given arc length (Newton-Raphson) |
| `pathArcLength(segments, options)` | `Decimal` | Total arc length of multi-segment path |
| `pathInverseArcLength(segments, targetLength, options)` | `{segmentIndex, t, totalLength}` | Find position by arc length in path |

**Options for `arcLength`:**
- `tolerance` (default: '1e-30') - Error tolerance
- `maxDepth` (default: 50) - Maximum recursion depth
- `minDepth` (default: 3) - Minimum recursion depth

**Options for `inverseArcLength`:**
- `tolerance` (default: '1e-30') - Convergence tolerance
- `maxIterations` (default: 100) - Maximum Newton iterations
- `lengthTolerance` (default: '1e-30') - Arc length computation tolerance
- `initialT` - Initial guess for t (improves convergence)

### Arc Length Table

| Function | Returns | Description |
|----------|---------|-------------|
| `createArcLengthTable(points, samples=100, options)` | `Object` | Create lookup table for fast parameterization |

**Table Methods:**
- `table.getT(s)` - Get approximate t for arc length s (binary search + interpolation)
- `table.getTRefined(s, opts)` - Get refined t using Newton refinement
- `table.totalLength` - Total curve length
- `table.table` - Array of `{t, length}` entries

### Verification Functions

| Function | Description |
|----------|-------------|
| `verifyArcLength(points, computedLength)` | Verify bounds: chord <= arc <= polygon |
| `verifyInverseArcLength(points, targetLength, tolerance)` | Verify roundtrip: length -> t -> length |
| `verifyArcLengthBySubdivision(points, subdivisions, tolerance)` | Compare quadrature vs subdivision |
| `verifyArcLengthAdditivity(points, t, tolerance)` | Verify L(0,t) + L(t,1) = L(0,1) |
| `verifyArcLengthTable(points, samples)` | Verify table monotonicity and consistency |
| `verifyAllArcLengthFunctions(points, options)` | Run all verification tests |

---

## Path Analysis

Module: `PathAnalysis`

Advanced path analysis operations including area calculation, closest/farthest points, point-in-path testing, and continuity analysis.

### Area Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `pathArea(segments, options)` | `Decimal` | Signed area via Green's theorem (CCW=positive) |
| `pathAbsoluteArea(segments, options)` | `Decimal` | Unsigned area |

**Options:** `samples` (default: 50) - Samples per segment for numerical integration

### Distance Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `closestPointOnPath(segments, point, options)` | `{point, distance, segmentIndex, t}` | Find nearest point on path |
| `farthestPointOnPath(segments, point, options)` | `{point, distance, segmentIndex, t}` | Find farthest point on path |

**Options:**
- `samples` (default: 50) - Samples per segment for initial search
- `maxIterations` (default: 30) - Maximum Newton iterations
- `tolerance` (default: '1e-30') - Convergence tolerance

### Point-in-Path Testing

| Function | Returns | Description |
|----------|---------|-------------|
| `pointInPath(segments, point, options)` | `{inside, windingNumber, onBoundary}` | Ray casting algorithm |

**Options:** `samples` (default: 100) - Samples for curve approximation

### Continuity Analysis

| Function | Returns | Description |
|----------|---------|-------------|
| `isPathClosed(segments, tolerance)` | `boolean` | Check if endpoints match |
| `isPathContinuous(segments, tolerance)` | `{continuous, gaps}` | Check segment connections |
| `isPathSmooth(segments, tolerance)` | `{smooth, kinks}` | Check C1 continuity (tangent matching) |
| `findKinks(segments, tolerance)` | `Array` | Find all non-differentiable points |

**Default tolerances:**
- `isPathClosed`/`isPathContinuous`: '1e-20' (distance)
- `isPathSmooth`/`findKinks`: '1e-10' (angle in radians)

### Bounding Box Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `pathBoundingBox(segments)` | `{xmin, xmax, ymin, ymax}` | Exact bounding box for path |
| `boundingBoxesOverlap(bbox1, bbox2)` | `boolean` | Check if bounding boxes overlap |

### Path Length

| Function | Returns | Description |
|----------|---------|-------------|
| `pathLength(segments, options)` | `Decimal` | Total path length (sum of segment arc lengths) |

### Verification Functions

| Function | Description |
|----------|-------------|
| `verifyPathArea(segments, samples, tolerance)` | Compare Green's theorem vs shoelace formula |
| `verifyClosestPoint(segments, queryPoint, tolerance)` | Verify perpendicularity condition |
| `verifyFarthestPoint(segments, queryPoint, samples)` | Verify distance maximization |
| `verifyPointInPath(segments, testPoint)` | Test consistency with neighbors |
| `verifyPathBoundingBox(segments, samples)` | Verify all points inside bbox |
| `verifyPathContinuity(segments)` | Verify endpoint distances |
| `verifyPathLength(segments)` | Compare arc length vs chord sum |
| `verifyAllPathFunctions(segments, options)` | Run all verification tests |

---

## Bezier Intersections

Module: `BezierIntersections`

Robust intersection detection using Bezier clipping, subdivision, and Newton-Raphson refinement with 80-digit precision.

### Line-Line Intersection

| Function | Returns | Description |
|----------|---------|-------------|
| `lineLineIntersection(line1, line2)` | `Array` | Find intersection between two line segments |

**Parameters:**
- `line1`, `line2` - Line segments: `[[x0,y0], [x1,y1]]`

**Returns:** Array of `{t1, t2, point}` where t1, t2 are parameters and point is `[x, y]`

### Bezier-Line Intersection

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierLineIntersection(bezier, line, options)` | `Array` | Find all intersections between Bezier and line |

**Options:**
- `tolerance` (default: '1e-30') - Root tolerance
- `samplesPerDegree` (default: 20) - Samples per curve degree

**Returns:** Array of `{t1, t2, point}` where t1 is Bezier parameter, t2 is line parameter

### Bezier-Bezier Intersection

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierBezierIntersection(bezier1, bezier2, options)` | `Array` | Find all intersections between two Bezier curves |

**Options:**
- `tolerance` (default: '1e-30') - Intersection tolerance
- `maxDepth` (default: 50) - Maximum recursion depth

**Returns:** Array of `{t1, t2, point, error}` where t1, t2 are parameters on each curve

### Self-Intersection

| Function | Returns | Description |
|----------|---------|-------------|
| `bezierSelfIntersection(bezier, options)` | `Array` | Find where curve intersects itself |

**Options:**
- `tolerance` (default: '1e-30') - Intersection tolerance
- `minSeparation` (default: '0.01') - Minimum parameter separation
- `maxDepth` (default: 30) - Maximum recursion depth

**Returns:** Array of `{t1, t2, point}` where t1 < t2

### Path Intersections

| Function | Returns | Description |
|----------|---------|-------------|
| `pathPathIntersection(path1, path2, options)` | `Array` | Find all intersections between two paths |
| `pathSelfIntersection(path, options)` | `Array` | Find all self-intersections in path |

**Path format:** Array of Bezier segments, where each segment is an array of control points

**Returns:** Array with `{segment1, segment2, t1, t2, point}` (adds segment indices to results)

### Verification Functions

| Function | Description |
|----------|-------------|
| `verifyIntersection(bez1, bez2, intersection, tolerance)` | Verify point lies on both curves |
| `verifyLineLineIntersection(line1, line2, intersection, tolerance)` | Verify parametric and algebraic conditions |
| `verifyBezierLineIntersection(bezier, line, intersection, tolerance)` | Verify point on both Bezier and line |
| `verifyBezierBezierIntersection(bez1, bez2, intersection, tolerance)` | Verify distance minimization and convergence |
| `verifySelfIntersection(bezier, intersection, tolerance, minSeparation)` | Verify parameter separation and stability |
| `verifyPathPathIntersection(path1, path2, intersections, tolerance)` | Verify all path intersection results |
| `verifyAllIntersectionFunctions(tolerance)` | Run all verification tests with sample curves |

### Example: Find Bezier-Bezier Intersections

```javascript
import { BezierIntersections } from '@emasoft/svg-matrix';

const curve1 = [[0, 0], [1, 2], [2, 2], [3, 0]];
const curve2 = [[0, 1], [1, -1], [2, 3], [3, 1]];

const intersections = BezierIntersections.bezierBezierIntersection(curve1, curve2);

for (const isect of intersections) {
  console.log(`Intersection at t1=${isect.t1}, t2=${isect.t2}`);
  console.log(`Point: [${isect.point[0]}, ${isect.point[1]}]`);
  console.log(`Error: ${isect.error}`);
}
```

---

## SVGToolbox Functions

The SVGToolbox module provides 69 functions for comprehensive SVG optimization and manipulation with arbitrary precision. All numeric operations use Decimal.js for configurable 1-80 decimal precision (default: 6).

### Key Advantages

- **Precision**: User-configurable 1-80 decimal precision (vs SVGO's hardcoded Float64)
- **Validity Guarantee**: 100% valid XML and SVG output always (no corrupted files)
- **SVG Compliance**: Exceeds SVG 1.1 (7 digits) and SVG 2.0 (15 digits) requirements

### Cleanup Functions

Remove unused/useless data while preserving visual appearance:

#### `cleanupIds(doc, options)`
Remove unused IDs and minify used IDs.

- `doc` (Document|string) - SVG document or string to process
- `options.minify` (boolean) - Minify IDs to shortest form (default: true)
- `options.remove` (boolean) - Remove unused IDs (default: true)
- `options.force` (boolean) - Force processing even if scripts/styles present (default: false)
- `options.preserve` (Array<string>) - ID names to preserve unchanged
- `options.preservePrefixes` (Array<string>) - ID prefixes to preserve unchanged
- Returns: Document

#### `cleanupNumericValues(doc, options)`
Round numeric values to specified precision using Decimal.js.

- `doc` (Document|string) - SVG document or string to process
- `options.precision` (number) - Decimal places to round to (default: 6)
- Returns: Document

#### `cleanupListOfValues(doc, options)`
Round lists of values using Decimal.js.

- `doc` (Document|string) - SVG document or string to process
- `options.precision` (number) - Decimal places to round to (default: 6)
- Returns: Document

#### `cleanupAttributes(doc, options)`
Remove useless attributes (editor metadata, unused classes, etc.).

- `doc` (Document|string) - SVG document or string to process
- `options.preserveVendor` (boolean) - Preserve vendor namespace declarations (default: false)
- Returns: Document

#### `cleanupEnableBackground(doc, options)`
Remove enable-background attribute.

- `doc` (Document|string) - SVG document or string to process
- Returns: Document

#### `removeUnknownsAndDefaults(doc, options)`
Remove unknown elements/attributes and elements with default values.

- `doc` (Document|string) - SVG document or string to process
- Returns: Document

#### `removeNonInheritableGroupAttrs(doc, options)`
Remove non-inheritable attributes from `<g>` elements.

- Returns: Document

#### `removeUselessDefs(doc, options)`
Remove empty/unused defs elements.

- Returns: Document

#### `removeHiddenElements(doc, options)`
Remove hidden/invisible elements.

- Returns: Document

#### `removeEmptyText(doc, options)`
Remove empty text elements.

- Returns: Document

#### `removeEmptyContainers(doc, options)`
Remove empty container elements.

- Returns: Document

### Removal Functions

Remove specific SVG elements/declarations:

#### `removeDoctype(doc, options)`
Remove DOCTYPE declaration.

- Returns: Document

#### `removeXMLProcInst(doc, options)`
Remove XML processing instructions.

- Returns: Document

#### `removeComments(doc, options)`
Remove comments.

- Returns: Document

#### `removeMetadata(doc, options)`
Remove metadata element.

- `options.preserveVendor` (boolean) - Preserve vendor-specific metadata
- Returns: Document

#### `removeTitle(doc, options)`
Remove title element.

- Returns: Document

#### `removeDesc(doc, options)`
Remove desc element.

- Returns: Document

#### `removeEditorsNSData(doc, options)`
Remove editor namespaces (Inkscape, Illustrator, etc.).

- `options.preserveVendor` (boolean) - Preserve all editor namespace elements/attributes
- Returns: Document

#### `removeEmptyAttrs(doc, options)`
Remove empty attributes.

- Returns: Document

#### `removeViewBox(doc, options)`
Remove viewBox if matches dimensions.

- Returns: Document

#### `removeXMLNS(doc, options)`
Remove xmlns attribute (for inline SVG only).

- Returns: Document

#### `removeRasterImages(doc, options)`
Remove embedded raster images.

- Returns: Document

#### `removeScriptElement(doc, options)`
Remove script elements.

- Returns: Document

### Conversion Functions

Convert between SVG representations:

#### `convertShapesToPath(doc, options)`
Convert rect/circle/ellipse/line/polyline/polygon to path.

- Returns: Document

#### `convertPathData(doc, options)`
Optimize path data.

- Returns: Document

#### `convertTransform(doc, options)`
Optimize transform attributes.

- Returns: Document

#### `convertColors(doc, options)`
Convert colors to shortest form.

- Returns: Document

#### `convertStyleToAttrs(doc, options)`
Convert inline style to attributes.

- `options.preserveVendor` (boolean) - Keep vendor-prefixed properties
- Returns: Document

#### `convertEllipseToCircle(doc, options)`
Convert equal-radii ellipse to circle.

- Returns: Document

#### `collapseGroups(doc, options)`
Collapse useless groups.

- Returns: Document

#### `mergePaths(doc, options)`
Merge adjacent paths with same attributes.

- Returns: Document

#### `moveGroupAttrsToElems(doc, options)`
Move group attributes to child elements.

- Returns: Document

#### `moveElemsAttrsToGroup(doc, options)`
Move common element attributes to parent group.

- Returns: Document

### Optimization Functions

Optimize file size and rendering performance:

#### `minifyStyles(doc, options)`
Minify CSS in style elements.

- Returns: Document

#### `inlineStyles(doc, options)`
Inline CSS from style elements to style attributes.

- Returns: Document

#### `sortAttrs(doc, options)`
Sort element attributes alphabetically.

- Returns: Document

#### `sortDefsChildren(doc, options)`
Sort defs children by tag name.

- Returns: Document

#### `reusePaths(doc, options)`
Create use elements for repeated paths.

- Returns: Document

#### `removeOffCanvasPath(doc, options)`
Remove paths outside viewBox.

- Returns: Document

#### `removeStyleElement(doc, options)`
Remove style elements.

- Returns: Document

#### `removeXlink(doc, options)`
Remove deprecated xlink namespace.

- Returns: Document

### Modification Functions

Add or modify SVG elements/attributes:

#### `addAttributesToSVGElement(doc, options)`
Add attributes to root SVG element.

- Returns: Document

#### `addClassesToSVGElement(doc, options)`
Add classes to root SVG element.

- Returns: Document

#### `prefixIds(doc, options)`
Add prefix to all IDs.

- Returns: Document

#### `removeDimensions(doc, options)`
Remove width/height, keep viewBox.

- Returns: Document

#### `removeAttributesBySelector(doc, options)`
Remove attributes by CSS selector.

- Returns: Document

#### `removeAttrs(doc, options)`
Remove attributes by name pattern (regex).

- Returns: Document

#### `removeElementsByAttr(doc, options)`
Remove elements by attribute value.

- Returns: Document

### Validation Functions

Validate and fix SVG documents:

#### `validateXML(doc, options)`
Validate XML well-formedness.

- Returns: ValidationResult

#### `validateSVG(doc, options)`
W3C SVG schema validation (comprehensive).

- Returns: ValidationResult

#### `validateSVGAsync(input, options)`
Asynchronous SVG validation.

- Returns: Promise<ValidationResult>

#### `fixInvalidSVG(doc, options)`
Fix common SVG validation errors and compatibility issues.

- `doc` (Document|string) - SVG document or string to fix
- `options.fixInvalidGroupAttrs` (boolean) - Remove invalid attributes from groups (default: true)
- `options.fixMissingNamespaces` (boolean) - Add missing namespace declarations (default: true)
- `options.fixBrokenRefs` (boolean) - Fix broken ID references (default: true)
- `options.fixAnimationTiming` (boolean) - Fix invalid animation timing values (default: true)
- `options.verbose` (boolean) - Log detailed fix information (default: false)
- Returns: Document

### Embedding Functions

Embed or extract external resources:

#### `embedExternalDependencies(doc, options)`
Embed all external dependencies into an SVG, making it completely self-contained.

- `doc` (Document) - Parsed SVG document
- `options.basePath` (string) - Base path for resolving relative URLs
- `options.embedImages` (boolean) - Convert image hrefs to base64 data URIs (default: true)
- `options.embedExternalSVGs` (boolean) - Resolve external SVG references (default: true)
- `options.externalSVGMode` ('extract'|'embed') - How to embed external SVGs (default: 'extract')
- `options.embedCSS` (boolean) - Inline external stylesheets and @import rules (default: true)
- `options.embedFonts` (boolean) - Convert @font-face url() to base64 (default: true)
- `options.embedScripts` (boolean) - Inline external script src (default: true)
- `options.embedAudio` (boolean) - Embed audio files as base64 (default: false)
- `options.subsetFonts` (boolean) - Enable Google Fonts subsetting (default: true)
- `options.recursive` (boolean) - Recursively process embedded SVGs (default: true)
- `options.maxRecursionDepth` (number) - Maximum depth for recursive embedding (default: 10)
- `options.timeout` (number) - Timeout for remote fetches in ms (default: 30000)
- `options.onMissingResource` ('fail'|'warn'|'skip') - Behavior when resource not found (default: 'warn')
- `options.idPrefix` (string) - Prefix for relocated IDs from external SVGs (default: 'ext_')
- Returns: Document

#### `exportEmbeddedResources(input, options)`
Export embedded resources from an SVG to external files.

- `input` (string|Document) - SVG string or parsed document
- `options.outputDir` (string) - Directory to save extracted resources
- `options.filenamePrefix` (string) - Prefix for generated filenames (default: 'resource')
- `options.extractImages` (boolean) - Extract embedded images (default: true)
- `options.extractFonts` (boolean) - Extract embedded fonts (default: true)
- `options.extractScripts` (boolean) - Extract inline scripts (default: true)
- `options.extractStyles` (boolean) - Extract inline styles (default: true)
- `options.extractAudio` (boolean) - Extract embedded audio (default: true)
- `options.extractVideo` (boolean) - Extract embedded video (default: true)
- `options.elementIds` (string|string[]) - Only extract from specific element IDs
- `options.restoreGoogleFonts` (boolean) - Convert embedded fonts back to Google Fonts URLs (default: true)
- `options.dryRun` (boolean) - Return what would be extracted without saving (default: false)
- `options.extractOnly` (boolean) - Extract resources without modifying SVG (default: false)
- Returns: Promise<{doc, extractedFiles, warnings, summary}>

### Usage Example

```javascript
import {
  cleanupIds,
  removeComments,
  convertShapesToPath,
  validateSVG,
  embedExternalDependencies
} from '@emasoft/svg-matrix';

// Load SVG
const svgString = fs.readFileSync('input.svg', 'utf8');

// Apply optimizations
let doc = await cleanupIds(svgString, { minify: true });
doc = await removeComments(doc);
doc = await convertShapesToPath(doc);

// Validate
const issues = await validateSVG(doc);
if (issues.length > 0) {
  console.log('Validation issues:', issues);
}

// Embed external resources
doc = await embedExternalDependencies(doc, {
  basePath: './assets',
  embedImages: true,
  embedFonts: true
});

// Save
fs.writeFileSync('output.svg', doc.toString());
```

---

## License

MIT License - see LICENSE file for details.
