/**
 * Example 01: Introduction to Matrix and Vector Classes
 *
 * This example demonstrates the fundamental operations of the svg-matrix library:
 * - Creating matrices and vectors with arbitrary precision using Decimal
 * - Basic arithmetic operations (add, subtract, multiply)
 * - Linear algebra operations (determinant, inverse, solve)
 * - Demonstrating precision advantages over floating-point arithmetic
 *
 * The svg-matrix library uses decimal.js for arbitrary-precision arithmetic,
 * which eliminates floating-point rounding errors that plague standard JavaScript
 * number operations. This is crucial for accurate geometric calculations in SVG.
 */

import Decimal from 'decimal.js';
import { Matrix, Vector } from '../src/index.js';

// Set precision for all Decimal operations (default is 20, we'll use 50 for demonstration)
Decimal.set({ precision: 50 });

console.log('='.repeat(80));
console.log('BASIC MATRIX AND VECTOR OPERATIONS');
console.log('='.repeat(80));
console.log();

// ============================================================================
// CREATING MATRICES
// ============================================================================

console.log('1. Creating Matrices\n' + '-'.repeat(40));

// Create a 2x2 matrix from a nested array
// You can use numbers, strings, or Decimal instances
const M1 = Matrix.from([
  [1, 2],
  [3, 4]
]);
console.log('Matrix M1 (2x2):');
console.log(M1.toArrayOfStrings());
console.log();

// Create a 3x3 identity matrix (1s on diagonal, 0s elsewhere)
const I3 = Matrix.identity(3);
console.log('Identity matrix I3 (3x3):');
console.log(I3.toArrayOfStrings());
console.log();

// Create a zero matrix (all zeros)
const Z = Matrix.zeros(2, 3);
console.log('Zero matrix Z (2x3):');
console.log(Z.toArrayOfStrings());
console.log();

// Create a matrix with high-precision decimal values
// Using strings preserves exact values without floating-point rounding
const M2 = Matrix.from([
  ['1.123456789012345678901234567890', '2.0'],
  ['3.5', '4.999999999999999999999999999']
]);
console.log('High-precision matrix M2:');
console.log(M2.toArrayOfStrings());
console.log();

// ============================================================================
// MATRIX OPERATIONS
// ============================================================================

console.log('2. Matrix Arithmetic\n' + '-'.repeat(40));

// Matrix addition
const A = Matrix.from([[1, 2], [3, 4]]);
const B = Matrix.from([[5, 6], [7, 8]]);
const sum = A.add(B);
console.log('A + B =');
console.log(sum.toArrayOfStrings());
console.log();

// Matrix subtraction
const diff = A.sub(B);
console.log('A - B =');
console.log(diff.toArrayOfStrings());
console.log();

// Matrix multiplication (note: not element-wise, but matrix product)
const product = A.mul(B);
console.log('A × B =');
console.log(product.toArrayOfStrings());
console.log('Explanation: Result[i,j] = sum of A[i,k] × B[k,j] for all k');
console.log('For example: Result[0,0] = 1×5 + 2×7 = 19');
console.log();

// Scalar operations
const scaled = A.mul(2.5);
console.log('A × 2.5 (scalar multiplication) =');
console.log(scaled.toArrayOfStrings());
console.log();

const addScalar = A.add(10);
console.log('A + 10 (add scalar to all elements) =');
console.log(addScalar.toArrayOfStrings());
console.log();

// Transpose (swap rows and columns)
const AT = A.transpose();
console.log('A^T (transpose) =');
console.log(AT.toArrayOfStrings());
console.log('Notice: rows become columns, columns become rows');
console.log();

// Negation (multiply all elements by -1)
const negA = A.negate();
console.log('-A (negate) =');
console.log(negA.toArrayOfStrings());
console.log();

// ============================================================================
// LINEAR ALGEBRA OPERATIONS
// ============================================================================

console.log('3. Linear Algebra\n' + '-'.repeat(40));

// Determinant (only for square matrices)
// The determinant measures how much the matrix scales area/volume
const det = A.determinant();
console.log('Determinant of A:');
console.log(det.toString());
console.log('Geometric meaning: A transforms unit square into shape with area |det| = 2');
console.log();

// Trace (sum of diagonal elements)
const tr = A.trace();
console.log('Trace of A (sum of diagonal):');
console.log(tr.toString());
console.log('= 1 + 4 = 5');
console.log();

// Matrix inverse (A × A^-1 = I)
// Only exists when determinant is non-zero
const Ainv = A.inverse();
console.log('A inverse (A^-1):');
console.log(Ainv.toArrayOfStrings());
console.log();

// Verify: A × A^-1 should give identity matrix
const shouldBeI = A.mul(Ainv);
console.log('A × A^-1 (should be identity):');
console.log(shouldBeI.toArrayOfStrings());
console.log();

// LU decomposition: A = P × L × U
// P = permutation, L = lower triangular, U = upper triangular
const { L, U, P } = A.lu();
console.log('LU Decomposition of A:');
console.log('L (lower triangular):');
console.log(L.toArrayOfStrings());
console.log('U (upper triangular):');
console.log(U.toArrayOfStrings());
console.log('P (permutation):');
console.log(P.toArrayOfStrings());
console.log('Verify: P × A should equal L × U');
console.log();

// QR decomposition: A = Q × R
// Q = orthogonal matrix, R = upper triangular
const { Q, R } = A.qr();
console.log('QR Decomposition of A:');
console.log('Q (orthogonal):');
console.log(Q.toArrayOfStrings());
console.log('R (upper triangular):');
console.log(R.toArrayOfStrings());
console.log();

// Solving linear systems: Ax = b
// Find x such that A × x = b
const b = Vector.from([5, 11]);
const x = A.solve(b);
console.log('Solving A × x = b where b = [5, 11]:');
console.log('Solution x =', x.toStringArray());
console.log('Verify: A × x =', A.applyToVector(x).toStringArray());
console.log('Expected: [5, 11]');
console.log();

// ============================================================================
// CREATING VECTORS
// ============================================================================

console.log('4. Vector Operations\n' + '-'.repeat(40));

// Create vectors from arrays
const v1 = Vector.from([1, 2, 3]);
const v2 = Vector.from([4, 5, 6]);
console.log('Vector v1:', v1.toStringArray());
console.log('Vector v2:', v2.toStringArray());
console.log();

// Vector addition and subtraction
const vsum = v1.add(v2);
const vdiff = v1.sub(v2);
console.log('v1 + v2 =', vsum.toStringArray());
console.log('v1 - v2 =', vdiff.toStringArray());
console.log();

// Scalar multiplication
const vscaled = v1.scale(2.5);
console.log('v1 × 2.5 =', vscaled.toStringArray());
console.log();

// Dot product (inner product): v1 · v2 = sum of element-wise products
const dotProd = v1.dot(v2);
console.log('v1 · v2 (dot product) =', dotProd.toString());
console.log('= 1×4 + 2×5 + 3×6 = 4 + 10 + 18 = 32');
console.log();

// Cross product (only for 3D vectors)
// Result is perpendicular to both input vectors
const crossProd = v1.cross(v2);
console.log('v1 × v2 (cross product) =', crossProd.toStringArray());
console.log('Result is perpendicular to both v1 and v2');
console.log('Verify: (v1 × v2) · v1 =', crossProd.dot(v1).toString(), '(should be ~0)');
console.log('Verify: (v1 × v2) · v2 =', crossProd.dot(v2).toString(), '(should be ~0)');
console.log();

// Vector magnitude (length)
const mag = v1.norm();
console.log('||v1|| (magnitude) =', mag.toString());
console.log('= √(1² + 2² + 3²) = √14');
console.log();

// Normalization (create unit vector in same direction)
const normalized = v1.normalize();
console.log('v1 normalized (unit vector) =', normalized.toStringArray());
console.log('Magnitude:', normalized.norm().toString(), '(should be 1)');
console.log();

// Angle between vectors (in radians)
const angle = v1.angleBetween(v2);
console.log('Angle between v1 and v2:', angle.toString(), 'radians');
console.log('In degrees:', angle.mul(180).div(Math.PI).toString(), '°');
console.log();

// Vector projection (project v1 onto v2)
const proj = v1.projectOnto(v2);
console.log('v1 projected onto v2 =', proj.toStringArray());
console.log('This is the component of v1 in the direction of v2');
console.log();

// Orthogonal vector (perpendicular)
const v2d = Vector.from([3, 4]);
const ortho = v2d.orthogonal();
console.log('For 2D vector', v2d.toStringArray());
console.log('Orthogonal vector:', ortho.toStringArray());
console.log('Verify dot product:', v2d.dot(ortho).toString(), '(should be ~0)');
console.log();

// Outer product (creates a matrix)
const outer = v1.outer(v2);
console.log('v1 ⊗ v2 (outer product):');
console.log(outer.map(row => row.map(d => d.toString())));
console.log('Result is a 3×3 matrix where element [i,j] = v1[i] × v2[j]');
console.log();

// ============================================================================
// MATRIX-VECTOR MULTIPLICATION
// ============================================================================

console.log('5. Matrix-Vector Multiplication\n' + '-'.repeat(40));

const M = Matrix.from([
  [1, 2, 3],
  [4, 5, 6]
]);
const v = Vector.from([1, 2, 3]);

// Apply matrix to vector (matrix-vector product)
const result = M.applyToVector(v);
console.log('Matrix M (2×3):');
console.log(M.toArrayOfStrings());
console.log('Vector v:', v.toStringArray());
console.log('M × v =', result.toStringArray());
console.log('Calculation: [1×1 + 2×2 + 3×3, 4×1 + 5×2 + 6×3] = [14, 32]');
console.log();

// ============================================================================
// PRECISION DEMONSTRATION
// ============================================================================

console.log('6. Precision Advantages\n' + '-'.repeat(40));

// Demonstrate precision loss with native JavaScript numbers
const a_js = 0.1;
const b_js = 0.2;
const sum_js = a_js + b_js; // Should be 0.3, but...
console.log('JavaScript native addition:');
console.log(`${a_js} + ${b_js} = ${sum_js}`);
console.log(`Is equal to 0.3? ${sum_js === 0.3} (floating-point error!)`);
console.log();

// Same calculation with Decimal precision
const a_dec = new Decimal('0.1');
const b_dec = new Decimal('0.2');
const sum_dec = a_dec.plus(b_dec);
console.log('Decimal.js addition:');
console.log(`${a_dec.toString()} + ${b_dec.toString()} = ${sum_dec.toString()}`);
console.log(`Is equal to 0.3? ${sum_dec.equals('0.3')} (exact!)`);
console.log();

// Complex calculation showing cumulative error
console.log('Cumulative precision error demonstration:');
let js_sum = 0;
let dec_sum = new Decimal(0);
for (let i = 0; i < 100; i++) {
  js_sum += 0.1;
  dec_sum = dec_sum.plus('0.1');
}
console.log('Adding 0.1 one hundred times:');
console.log(`JavaScript result: ${js_sum}`);
console.log(`Decimal result:    ${dec_sum.toString()}`);
console.log(`Expected:          10`);
console.log(`JavaScript error:  ${Math.abs(js_sum - 10)}`);
console.log(`Decimal error:     ${dec_sum.minus(10).abs().toString()}`);
console.log();

// ============================================================================
// MATRIX EQUALITY AND TOLERANCE
// ============================================================================

console.log('7. Matrix Equality with Tolerance\n' + '-'.repeat(40));

const M1_test = Matrix.from([[1, 2], [3, 4]]);
const M2_test = Matrix.from([[1.0000001, 2], [3, 4]]);

console.log('M1:', M1_test.toArrayOfStrings());
console.log('M2:', M2_test.toArrayOfStrings());
console.log('M1 equals M2 (exact)?', M1_test.equals(M2_test));
console.log('M1 equals M2 (tolerance=0.001)?', M1_test.equals(M2_test, '0.001'));
console.log();

// ============================================================================
// MATRIX EXPONENTIAL
// ============================================================================

console.log('8. Matrix Exponential\n' + '-'.repeat(40));

// Matrix exponential: exp(M) = I + M + M²/2! + M³/3! + ...
// Used in differential equations, physics simulations, etc.
const smallM = Matrix.from([
  [0, 1],
  [-1, 0]
]);
console.log('Matrix M (rotation generator):');
console.log(smallM.toArrayOfStrings());
console.log();

const expM = smallM.exp({ maxIter: 50, tolerance: '1e-20' });
console.log('exp(M):');
console.log(expM.toArrayOfStrings());
console.log('For this particular matrix (rotation generator),');
console.log('exp(M) approximates a rotation matrix for small angles');
console.log();

console.log('='.repeat(80));
console.log('Example complete! This demonstrates the core Matrix and Vector APIs.');
console.log('='.repeat(80));
