# @emasoft/svg-matrix

Arbitrary-precision matrix, vector and affine transformation library for JavaScript using decimal.js.

## Features

- **Decimal-backed** Matrix and Vector classes for high-precision geometry
- **2D transforms** (3x3 homogeneous matrices): translation, rotation, scale, skew, reflection
- **3D transforms** (4x4 homogeneous matrices): translation, rotation (X/Y/Z axis), scale, reflection
- **SVG transform flattening**: parse transform attributes, build CTMs, flatten nested hierarchies
- **Linear algebra**: LU/QR decomposition, determinant, inverse, solve, matrix exponential
- **10^77 times better precision** than JavaScript floats for round-trip transforms
- Works in **Node.js** and **browsers** (via CDN)

## Installation

### npm

```bash
npm install @emasoft/svg-matrix
```

```js
import { Decimal, Matrix, Vector, Transforms2D, Transforms3D, SVGFlatten } from '@emasoft/svg-matrix';
```

### CDN (Browser)

Using esm.sh (recommended - auto-resolves dependencies):

```html
<script type="module">
  import { Decimal, Matrix, Vector, Transforms2D, Transforms3D, SVGFlatten } from 'https://esm.sh/@emasoft/svg-matrix';

  Decimal.set({ precision: 80 });

  // Create and compose 2D transforms
  const M = Transforms2D.translation(2, 3)
    .mul(Transforms2D.rotate(Math.PI / 4))
    .mul(Transforms2D.scale(1.5));

  // Apply to a point
  const [x, y] = Transforms2D.applyTransform(M, 1, 0);
  console.log('Transformed:', x.toString(), y.toString());
</script>
```

Using Skypack:

```html
<script type="module">
  import { Matrix, Vector } from 'https://cdn.skypack.dev/@emasoft/svg-matrix';
</script>
```

Using import maps:

```html
<script type="importmap">
{
  "imports": {
    "@emasoft/svg-matrix": "https://esm.sh/@emasoft/svg-matrix"
  }
}
</script>
<script type="module">
  import { Matrix, Vector, Transforms2D } from '@emasoft/svg-matrix';
</script>
```

## Usage Examples

### Vector Operations

```js
import { Vector, Decimal } from '@emasoft/svg-matrix';

Decimal.set({ precision: 80 });

const v = Vector.from([1, 2, 3]);
const w = Vector.from([4, 5, 6]);

// Basic operations
console.log('Add:', v.add(w).toNumberArray());       // [5, 7, 9]
console.log('Scale:', v.scale(2).toNumberArray());   // [2, 4, 6]
console.log('Dot:', v.dot(w).toString());            // 32
console.log('Cross:', v.cross(w).toNumberArray());   // [-3, 6, -3]

// Geometry
console.log('Norm:', v.norm().toString());           // 3.7416...
console.log('Normalized:', v.normalize().toNumberArray());
console.log('Angle:', v.angleBetween(w).toString()); // radians

// Projection
const proj = v.projectOnto(w);
console.log('Projection:', proj.toNumberArray());
```

### Matrix Operations

```js
import { Matrix } from '@emasoft/svg-matrix';

const A = Matrix.from([[1, 2], [3, 4]]);
const B = Matrix.from([[5, 6], [7, 8]]);

// Basic operations
console.log('Multiply:', A.mul(B).toNumberArray());
console.log('Transpose:', A.transpose().toNumberArray());
console.log('Determinant:', A.determinant().toString());  // -2
console.log('Trace:', A.trace().toString());              // 5

// Linear algebra
const inv = A.inverse();
console.log('Inverse:', inv.toNumberArray());

// Solve Ax = b
const x = A.solve([1, 1]);
console.log('Solution:', x.toNumberArray());

// Decompositions
const { L, U, P } = A.lu();
const { Q, R } = A.qr();

// Matrix exponential
const expA = A.exp();
```

### 2D Transforms

```js
import { Transforms2D } from '@emasoft/svg-matrix';

// Basic transforms
const T = Transforms2D.translation(10, 20);
const R = Transforms2D.rotate(Math.PI / 4);        // 45 degrees
const S = Transforms2D.scale(2, 3);                // non-uniform
const Su = Transforms2D.scale(2);                  // uniform

// Rotation around a point
const Rp = Transforms2D.rotateAroundPoint(Math.PI / 2, 5, 5);

// Skew and stretch
const Sk = Transforms2D.skew(0.5, 0);
const St = Transforms2D.stretchAlongAxis(1, 0, 2); // stretch 2x along X

// Reflections
const Rx = Transforms2D.reflectX();      // flip Y
const Ry = Transforms2D.reflectY();      // flip X
const Ro = Transforms2D.reflectOrigin(); // flip both

// Compose transforms (right-to-left: S first, then R, then T)
const M = T.mul(R).mul(S);

// Apply to point
const [x, y] = Transforms2D.applyTransform(M, 1, 0);

// Inverse transform
const Minv = M.inverse();
const [xBack, yBack] = Transforms2D.applyTransform(Minv, x, y);
```

### 3D Transforms

```js
import { Transforms3D } from '@emasoft/svg-matrix';

// Basic transforms
const T = Transforms3D.translation(1, 2, 3);
const S = Transforms3D.scale(2, 2, 2);

// Axis rotations (radians, right-hand rule)
const Rx = Transforms3D.rotateX(Math.PI / 2);
const Ry = Transforms3D.rotateY(Math.PI / 4);
const Rz = Transforms3D.rotateZ(Math.PI / 6);

// Rotation around arbitrary axis
const Raxis = Transforms3D.rotateAroundAxis(1, 1, 0, Math.PI / 3);

// Rotation around a point
const Rpt = Transforms3D.rotateAroundPoint(0, 0, 1, Math.PI / 2, 5, 5, 0);

// Reflections
const RfXY = Transforms3D.reflectXY();     // flip Z
const RfXZ = Transforms3D.reflectXZ();     // flip Y
const RfYZ = Transforms3D.reflectYZ();     // flip X
const RfO = Transforms3D.reflectOrigin();  // flip all

// Compose and apply
const M = T.mul(Rx).mul(S);
const [x, y, z] = Transforms3D.applyTransform(M, 1, 0, 0);
```

## API Reference

### Vector

| Method | Description |
|--------|-------------|
| `Vector.from(arr)` | Create vector from array |
| `add(v)` | Element-wise addition |
| `sub(v)` | Element-wise subtraction |
| `scale(s)` | Scalar multiplication |
| `negate()` | Negate all components |
| `dot(v)` | Dot product |
| `cross(v)` | Cross product (3D only) |
| `outer(v)` | Outer product (returns 2D array) |
| `norm()` | Euclidean length |
| `normalize()` | Unit vector |
| `angleBetween(v)` | Angle in radians |
| `projectOnto(v)` | Vector projection |
| `orthogonal()` | Perpendicular vector |
| `distance(v)` | Euclidean distance |
| `equals(v, tol?)` | Equality check with optional tolerance |
| `toArray()` | Get Decimal array |
| `toNumberArray()` | Get number array |
| `toStringArray()` | Get string array |

### Matrix

| Method | Description |
|--------|-------------|
| `Matrix.from(arr)` | Create from 2D array |
| `Matrix.zeros(r, c)` | Zero matrix |
| `Matrix.identity(n)` | Identity matrix |
| `add(M)` | Element-wise addition |
| `sub(M)` | Element-wise subtraction |
| `mul(M)` | Matrix multiplication |
| `div(s)` | Scalar division |
| `negate()` | Negate all elements |
| `transpose()` | Transpose |
| `trace()` | Sum of diagonal |
| `determinant()` | Determinant |
| `inverse()` | Matrix inverse |
| `solve(b)` | Solve Ax = b |
| `lu()` | LU decomposition |
| `qr()` | QR decomposition |
| `exp()` | Matrix exponential |
| `applyToVector(v)` | Matrix-vector product |
| `equals(M, tol?)` | Equality check |
| `isSquare()` | Check if square |
| `toNumberArray()` | Get number 2D array |
| `toArrayOfStrings()` | Get string 2D array |

### Transforms2D

| Function | Description |
|----------|-------------|
| `translation(tx, ty)` | Translation matrix |
| `scale(sx, sy?)` | Scale matrix (uniform if sy omitted) |
| `rotate(theta)` | Rotation matrix (radians) |
| `rotateAroundPoint(theta, px, py)` | Rotation around point |
| `skew(ax, ay)` | Skew/shear matrix |
| `stretchAlongAxis(ux, uy, k)` | Stretch along direction |
| `reflectX()` | Reflect across X axis |
| `reflectY()` | Reflect across Y axis |
| `reflectOrigin()` | Reflect through origin |
| `applyTransform(M, x, y)` | Apply matrix to point |

### Transforms3D

| Function | Description |
|----------|-------------|
| `translation(tx, ty, tz)` | Translation matrix |
| `scale(sx, sy?, sz?)` | Scale matrix |
| `rotateX(theta)` | Rotation around X axis |
| `rotateY(theta)` | Rotation around Y axis |
| `rotateZ(theta)` | Rotation around Z axis |
| `rotateAroundAxis(ux, uy, uz, theta)` | Rotation around arbitrary axis |
| `rotateAroundPoint(ux, uy, uz, theta, px, py, pz)` | Rotation around point |
| `reflectXY()` | Reflect across XY plane |
| `reflectXZ()` | Reflect across XZ plane |
| `reflectYZ()` | Reflect across YZ plane |
| `reflectOrigin()` | Reflect through origin |
| `applyTransform(M, x, y, z)` | Apply matrix to point |

### SVGFlatten

| Function | Description |
|----------|-------------|
| **viewBox & Viewport** | |
| `parseViewBox(str)` | Parse viewBox attribute "minX minY width height" |
| `parsePreserveAspectRatio(str)` | Parse preserveAspectRatio (align, meet/slice) |
| `computeViewBoxTransform(vb, vpW, vpH, par)` | Compute viewBox to viewport matrix |
| `SVGViewport` class | Represents viewport with viewBox + preserveAspectRatio |
| `buildFullCTM(hierarchy)` | Build CTM from SVG/group/element hierarchy |
| **Units & Percentages** | |
| `resolveLength(value, ref, dpi?)` | Resolve px, %, em, pt, in, cm, mm, pc units |
| `resolvePercentages(x, y, vpW, vpH)` | Resolve x/y percentages to viewport |
| `normalizedDiagonal(w, h)` | Compute sqrt(w^2+h^2)/sqrt(2) for percentages |
| **Object Bounding Box** | |
| `objectBoundingBoxTransform(x, y, w, h)` | Transform for objectBoundingBox units |
| **Transform Parsing** | |
| `parseTransformFunction(func, args)` | Parse a single SVG transform function |
| `parseTransformAttribute(str)` | Parse a full SVG transform attribute string |
| `buildCTM(transformStack)` | Build CTM from array of transform strings |
| `applyToPoint(ctm, x, y)` | Apply CTM to a 2D point |
| `toSVGMatrix(ctm, precision?)` | Convert CTM back to SVG matrix() notation |
| `isIdentity(m, tolerance?)` | Check if matrix is effectively identity |
| `transformPathData(pathD, ctm)` | Transform path data coordinates |
| `PRECISION_INFO` | Object with precision comparison data |

## SVG Transform Flattening

The `SVGFlatten` module provides tools for parsing SVG transform attributes, building CTMs (Current Transform Matrices), and flattening nested transforms with arbitrary precision.

### Why Use SVGFlatten?

SVG elements can have deeply nested transforms through parent groups. When coordinates are transformed from local space to viewport and back using JavaScript's native 64-bit floats, precision is lost:

```
Original coordinates:     (10, 10)
After round-trip (float): (9.9857, 9.9857)  // Error: 0.0143
```

With `@emasoft/svg-matrix` using 80-digit Decimal precision:

```
Original coordinates:     (10, 10)
After round-trip:         (10.00000000000000000000000000000000000000,
                           9.999999999999999999999999999999999999999999999999999999999999999999999999999999998)
Round-trip error:         X=0, Y=2e-79
```

**Improvement: 10^77 times better precision than JavaScript floats.**

### Parsing SVG Transforms

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

// Parse individual transforms
const m1 = SVGFlatten.parseTransformAttribute('translate(10, 20)');
const m2 = SVGFlatten.parseTransformAttribute('rotate(45)');
const m3 = SVGFlatten.parseTransformAttribute('scale(2, 0.5)');
const m4 = SVGFlatten.parseTransformAttribute('skewX(15)');
const m5 = SVGFlatten.parseTransformAttribute('matrix(0.866, 0.5, -0.5, 0.866, 0, 0)');

// Parse chained transforms
const combined = SVGFlatten.parseTransformAttribute('translate(50,50) rotate(45) scale(2)');
```

### Building CTM from Nested Elements

```js
import { Decimal, SVGFlatten } from '@emasoft/svg-matrix';

Decimal.set({ precision: 80 });

// Simulate a 6-level SVG hierarchy:
// <svg viewBox="...">                              <!-- viewBox scaling -->
//   <g transform="translate(-13.6,-10.2)">         <!-- g1 -->
//     <g transform="translate(-1144.8,517.6)">     <!-- g2 -->
//       <g transform="rotate(15)">                 <!-- g3 -->
//         <g transform="scale(1.2, 0.8)">          <!-- g4 -->
//           <path transform="matrix(...)"/>       <!-- element -->

const transformStack = [
  'scale(1.5)',                                    // viewBox scaling
  'translate(-13.613145,-10.209854)',              // g1
  'translate(-1144.8563,517.64642)',               // g2
  'rotate(15)',                                    // g3
  'scale(1.2, 0.8)',                               // g4
  'matrix(0.71577068,0,0,1.3970955,0,0)'          // element
];

// Build combined CTM
const ctm = SVGFlatten.buildCTM(transformStack);

// Transform a point from local to viewport coordinates
const local = { x: new Decimal('10'), y: new Decimal('10') };
const viewport = SVGFlatten.applyToPoint(ctm, local.x, local.y);

// Transform back to local coordinates
const inverseCTM = ctm.inverse();
const recovered = SVGFlatten.applyToPoint(inverseCTM, viewport.x, viewport.y);

// Verify precision
const errorX = recovered.x.minus(local.x).abs();
const errorY = recovered.y.minus(local.y).abs();
console.log('Round-trip error X:', errorX.toString()); // 0
console.log('Round-trip error Y:', errorY.toString()); // ~2e-79
```

### Transforming Path Data

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

const pathD = 'M 100 100 L 200 100 L 200 200 L 100 200 Z';
const ctm = SVGFlatten.parseTransformAttribute('translate(50, 50) scale(2)');
const transformed = SVGFlatten.transformPathData(pathD, ctm);

console.log(transformed);
// M 250.000000 250.000000 L 450.000000 250.000000 L 450.000000 450.000000 L 250.000000 450.000000 Z
```

### Flattening All Transforms

To flatten an SVG (remove all transform attributes and apply them directly to coordinates):

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

// 1. For each element, collect transforms from root to element
// 2. Build CTM: const ctm = SVGFlatten.buildCTM(transformStack);
// 3. Transform path data: const newD = SVGFlatten.transformPathData(d, ctm);
// 4. Remove transform attribute, update path d attribute
// 5. Convert CTM back to SVG: SVGFlatten.toSVGMatrix(ctm, 6)
```

### viewBox and preserveAspectRatio

Per the [SVG 2 specification](https://www.w3.org/TR/SVG2/coords.html), the viewBox establishes a new coordinate system that maps to the viewport:

```js
import { Decimal, SVGFlatten } from '@emasoft/svg-matrix';

Decimal.set({ precision: 80 });

// Parse viewBox and preserveAspectRatio
const viewBox = SVGFlatten.parseViewBox('0 0 100 100');
const par = SVGFlatten.parsePreserveAspectRatio('xMidYMid meet');

// Compute the viewBox-to-viewport transform
const vbTransform = SVGFlatten.computeViewBoxTransform(viewBox, 800, 600, par);

// Point (50, 50) in viewBox coords maps to viewport
const point = SVGFlatten.applyToPoint(vbTransform, 50, 50);
console.log('Viewport coords:', point.x.toFixed(2), point.y.toFixed(2));
```

### Full CTM with viewBox and Nested Elements

Use `buildFullCTM` for complete SVG hierarchies including viewBox transforms:

```js
import { Decimal, SVGFlatten } from '@emasoft/svg-matrix';

Decimal.set({ precision: 80 });

// Real SVG structure with viewBox and nested transforms
const hierarchy = [
  { type: 'svg', width: 800, height: 600, viewBox: '0 0 400 300', preserveAspectRatio: 'xMidYMid meet' },
  { type: 'g', transform: 'translate(50, 50)' },
  { type: 'g', transform: 'rotate(45)' },
  { type: 'element', transform: 'scale(2)' }
];

const ctm = SVGFlatten.buildFullCTM(hierarchy);
const local = { x: new Decimal('10'), y: new Decimal('10') };
const viewport = SVGFlatten.applyToPoint(ctm, local.x, local.y);

// Round-trip with perfect precision
const inverse = ctm.inverse();
const recovered = SVGFlatten.applyToPoint(inverse, viewport.x, viewport.y);
// Error: X=2e-78, Y=2e-78
```

### Nested SVG Viewports

Handle deeply nested `<svg>` elements, each with its own viewBox:

```js
const nestedHierarchy = [
  { type: 'svg', width: 1000, height: 800, viewBox: '0 0 500 400' },
  { type: 'g', transform: 'translate(100, 100)' },
  { type: 'svg', width: 200, height: 150, viewBox: '0 0 100 75' },
  { type: 'element' }
];

const ctm = SVGFlatten.buildFullCTM(nestedHierarchy);
// Point (10, 10) in innermost viewBox -> (240, 240) in outer viewport
```

### Unit and Percentage Resolution

Resolve SVG length values with units or percentages:

```js
import { Decimal, SVGFlatten } from '@emasoft/svg-matrix';

const viewportWidth = new Decimal(800);

// Percentages resolve relative to reference size
SVGFlatten.resolveLength('50%', viewportWidth);   // -> 400
SVGFlatten.resolveLength('25%', viewportWidth);   // -> 200

// Absolute units (at 96 DPI)
SVGFlatten.resolveLength('1in', viewportWidth);   // -> 96
SVGFlatten.resolveLength('2.54cm', viewportWidth);// -> 96 (1 inch)
SVGFlatten.resolveLength('72pt', viewportWidth);  // -> 96 (1 inch)
SVGFlatten.resolveLength('6pc', viewportWidth);   // -> 96 (1 inch)

// Font-relative units (assumes 16px base)
SVGFlatten.resolveLength('2em', viewportWidth);   // -> 32

// Normalized diagonal for non-directional percentages
const diag = SVGFlatten.normalizedDiagonal(800, 600); // -> 707.1
```

### Object Bounding Box Transform

For gradients/patterns with `objectBoundingBox` units:

```js
// Element bounding box: x=100, y=50, width=200, height=100
const bboxTransform = SVGFlatten.objectBoundingBoxTransform(100, 50, 200, 100);

// (0, 0) in bbox -> (100, 50) in user space
// (1, 1) in bbox -> (300, 150) in user space
// (0.5, 0.5) in bbox -> (200, 100) in user space (center)
```

### CDN Usage

```html
<script type="module">
  import { Decimal, SVGFlatten } from 'https://esm.sh/@emasoft/svg-matrix';

  Decimal.set({ precision: 80 });

  const ctm = SVGFlatten.parseTransformAttribute('rotate(45, 100, 100)');
  const point = SVGFlatten.applyToPoint(ctm, 50, 50);
  console.log('Transformed:', point.x.toFixed(6), point.y.toFixed(6));
</script>
```

## License

MIT
