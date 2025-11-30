# SVG-MATRIX Examples

This directory contains comprehensive examples demonstrating the usage of the `@emasoft/svg-matrix` library.

## Overview

The svg-matrix library provides arbitrary-precision matrix, vector, and affine transformation operations using decimal.js. These examples show how to use the library for:

- Linear algebra operations (Matrix and Vector classes)
- 2D affine transformations (3×3 homogeneous matrices)
- 3D affine transformations (4×4 homogeneous matrices)
- High-precision geometric calculations

## Available Examples

### 01 - Basic Matrix and Vector Operations ✓
**File:** `01-basic-matrix-vector.js`

Demonstrates the fundamental Matrix and Vector classes:
- Creating matrices and vectors with arbitrary precision
- Basic arithmetic (add, subtract, multiply, transpose)
- Linear algebra (determinant, inverse, LU/QR decomposition, solving systems)
- Matrix exponential
- Precision advantages over native JavaScript numbers

**Run:**
```bash
node examples/01-basic-matrix-vector.js
```

**Topics Covered:**
- Matrix creation (from arrays, identity, zeros)
- Matrix operations (add, sub, mul, div, negate, transpose)
- Vector operations (add, sub, scale, dot, cross, norm, normalize)
- Linear algebra (determinant, trace, inverse, LU, QR, solve, exp)
- Matrix-vector multiplication
- Precision demonstration vs. floating-point

### 02 - 2D Affine Transformations ✓
**File:** `02-2d-transforms.js`

Demonstrates 2D transformations using 3×3 homogeneous matrices:
- Translation (moving points in 2D space)
- Rotation (around origin and arbitrary points)
- Scaling (uniform and non-uniform)
- Reflection (mirroring across axes)
- Skewing/Shearing (creating slanted effects)
- Directional stretching along arbitrary axes
- Transform composition (combining multiple transforms)
- Understanding right-to-left multiplication order

**Run:**
```bash
node examples/02-2d-transforms.js
```

**Topics Covered:**
- Homogeneous coordinates [x, y, 1]
- Translation matrices
- Rotation matrices (with angles in radians)
- rotateAroundPoint() for rotating around centers
- Scale matrices (uniform and non-uniform)
- Reflection matrices (across X, Y, and origin)
- Skew matrices for shearing effects
- Transform composition order (RIGHT-TO-LEFT)
- Practical scenarios (SVG transforms, rotating shapes, etc.)

### 03 - 3D Affine Transformations ✓
**File:** `03-3d-transforms.js`

Demonstrates 3D transformations using 4×4 homogeneous matrices:
- Translation in 3D space
- Rotation around X, Y, Z axes (pitch, yaw, roll)
- Rodrigues' rotation formula (arbitrary axis rotation)
- Rotation around a point in 3D
- 3D scaling and reflections
- Euler angles and gimbal lock
- Transform composition in 3D

**Run:**
```bash
node examples/03-3d-transforms.js
```

**Topics Covered:**
- Homogeneous coordinates [x, y, z, 1]
- Translation matrices in 3D
- rotateX/Y/Z (axis-aligned rotations)
- Right-hand rule for rotation directions
- rotateAroundAxis() using Rodrigues' formula
- rotateAroundPoint() for 3D pivot rotations
- 3D reflections (across XY, XZ, YZ planes, and origin)
- Euler angles (pitch, yaw, roll) and gimbal lock
- Practical 3D scenarios (camera orbits, cube transformations)

## SVG-Specific Examples (Conceptual)

The library includes advanced SVG processing modules. While full examples require complex SVG structures, the conceptual outline is:

### 04 - SVG Transform Parsing (Placeholder)
- Parsing SVG transform attributes
- Building Current Transformation Matrix (CTM)
- viewBox and preserveAspectRatio handling
- Shape to path conversion

### 05 - Polygon Clipping (Placeholder)
- Boolean operations on polygons
- Intersection, union, difference
- Point-in-polygon tests
- Convex hull computation

### 06 - ClipPath Resolution (Placeholder)
- Resolving clipPath elements
- Coordinate system transformations
- Applying clip paths to shapes
- Path generation from clips

### 07 - Mesh Gradients (Placeholder)
- SVG 2.0 mesh gradient parsing
- Coons patch evaluation
- Rasterization to canvas
- Polygon approximation for export

### 08 - Masks, Patterns, Use Elements (Placeholder)
- Mask resolution (luminance/alpha)
- Pattern tiling
- Use/symbol resolution
- Nested reference handling

## Key Concepts

### Homogeneous Coordinates

2D points (x, y) are represented as 3D vectors [x, y, 1]
3D points (x, y, z) are represented as 4D vectors [x, y, z, 1]

This allows translation to be represented as matrix multiplication.

### Transform Composition Order

**IMPORTANT:** Matrix multiplication is RIGHT-TO-LEFT!

```javascript
// This code:
const M = T.mul(R).mul(S);

// Executes in this order:
// 1. First apply S (scale)
// 2. Then apply R (rotate)
// 3. Then apply T (translate)
```

When you read `T.mul(R).mul(S)`, think: "S, then R, then T"

### Arbitrary Precision

All operations use decimal.js for arbitrary precision:

```javascript
import Decimal from 'decimal.js';
Decimal.set({ precision: 50 }); // Set precision globally

// No floating-point errors!
const a = new Decimal('0.1');
const b = new Decimal('0.2');
const sum = a.plus(b); // Exactly 0.3 (not 0.30000000000000004)
```

## Running All Examples

```bash
# Run all examples in sequence
for file in examples/0{1,2,3}*.js; do
  echo "Running $file..."
  node "$file"
  echo ""
done
```

## API Reference

For detailed API documentation, see:
- Main library: `src/index.js`
- Matrix class: `src/matrix.js`
- Vector class: `src/vector.js`
- 2D transforms: `src/transforms2d.js`
- 3D transforms: `src/transforms3d.js`

## Dependencies

- **decimal.js** (^11.4.3) - Arbitrary-precision decimal arithmetic

## Further Reading

- [Homogeneous Coordinates](https://en.wikipedia.org/wiki/Homogeneous_coordinates)
- [Affine Transformations](https://en.wikipedia.org/wiki/Affine_transformation)
- [Rodrigues' Rotation Formula](https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula)
- [SVG Transforms](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform)
- [Euler Angles and Gimbal Lock](https://en.wikipedia.org/wiki/Gimbal_lock)

## Contributing

To add new examples:

1. Create a new `.js` file with a descriptive name
2. Add a detailed header comment explaining what the example demonstrates
3. Include inline comments for each step
4. Add console.log statements to show results
5. Ensure the example is runnable with `node examples/your-example.js`
6. Update this README with a description

## License

See main project LICENSE file.
