# @emasoft/svg-matrix

Arbitrary-precision matrix, vector and affine transformation library for JavaScript using decimal.js.

## Features

- **Decimal-backed** Matrix and Vector classes for high-precision geometry
- **2D transforms** (3x3 homogeneous matrices): translation, rotation, scale, skew, reflection
- **3D transforms** (4x4 homogeneous matrices): translation, rotation (X/Y/Z axis), scale, reflection
- **Linear algebra**: LU/QR decomposition, determinant, inverse, solve, matrix exponential
- Works in **Node.js** and **browsers** (via CDN)

## Installation

### npm

```bash
npm install @emasoft/svg-matrix
```

```js
import { Decimal, Matrix, Vector, Transforms2D, Transforms3D } from '@emasoft/svg-matrix';
```

### CDN (Browser)

Using esm.sh (recommended - auto-resolves dependencies):

```html
<script type="module">
  import { Decimal, Matrix, Vector, Transforms2D, Transforms3D } from 'https://esm.sh/@emasoft/svg-matrix';

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

## License

MIT
