/**
 * Unit Tests for svg-matrix core modules
 *
 * This test file covers edge cases, error handling, and additional
 * test coverage for: Vector, Matrix, Transforms2D, and Transforms3D.
 *
 * Run with: node test/unit-tests.js
 */

import Decimal from 'decimal.js';
import { Matrix, Vector, Transforms2D, Transforms3D } from '../src/index.js';

Decimal.set({ precision: 80 });

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${message}`);
  }
}

function assertClose(a, b, tol, message) {
  const aNum = a instanceof Decimal ? a.toNumber() : a;
  const bNum = b instanceof Decimal ? b.toNumber() : b;
  const diff = Math.abs(aNum - bNum);
  if (diff < tol) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${message} (got ${aNum}, expected ${bNum}, diff=${diff})`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    failed++;
    console.log(`  [FAIL] ${message} (expected exception, but none thrown)`);
  } catch (e) {
    passed++;
    console.log(`  [PASS] ${message}`);
  }
}

// ============================================================================
// VECTOR TESTS - Edge Cases and Error Handling
// ============================================================================

console.log('\n=== Vector Edge Case Tests ===\n');

// Vector creation edge cases
assert(Vector.from([0]).length === 1, 'Vector: single element vector');
assert(Vector.from([0, 0, 0, 0, 0]).length === 5, 'Vector: 5D vector');

// Zero vector operations
const zeroVec = Vector.from([0, 0, 0]);
assert(zeroVec.norm().isZero(), 'Vector: zero vector has zero norm');
assertThrows(() => zeroVec.normalize(), 'Vector: cannot normalize zero vector');

// Negate zero vector
const zeroNeg = zeroVec.negate();
assert(zeroNeg.norm().isZero(), 'Vector: negate zero vector is still zero');

// Scale by zero
const v1 = Vector.from([1, 2, 3]);
const v1ScaledZero = v1.scale(0);
assert(v1ScaledZero.norm().isZero(), 'Vector: scale by zero produces zero vector');

// Scale by negative
const v1ScaledNeg = v1.scale(-1);
assert(v1ScaledNeg.equals(v1.negate()), 'Vector: scale by -1 equals negate');

// Dot product with zero vector
assert(v1.dot(zeroVec).isZero(), 'Vector: dot product with zero vector is zero');

// Cross product with zero vector
const crossZero = v1.cross(zeroVec);
assert(crossZero.norm().isZero(), 'Vector: cross product with zero vector is zero');

// Cross product with self
const crossSelf = v1.cross(v1);
assert(crossSelf.norm().isZero(), 'Vector: cross product with self is zero');

// Error handling for mismatched dimensions
const v2d = Vector.from([1, 2]);
const v3d = Vector.from([1, 2, 3]);
assertThrows(() => v2d.add(v3d), 'Vector: add throws on dimension mismatch');
assertThrows(() => v2d.sub(v3d), 'Vector: sub throws on dimension mismatch');
assertThrows(() => v2d.dot(v3d), 'Vector: dot throws on dimension mismatch');
assertThrows(() => v2d.cross(v3d), 'Vector: cross throws on non-3D vectors');

// Cross product for 2D should throw
assertThrows(() => v2d.cross(v2d), 'Vector: cross throws for 2D vectors');

// angleBetween with zero vector
assertThrows(() => v1.angleBetween(zeroVec), 'Vector: angleBetween with zero vector throws');
assertThrows(() => zeroVec.angleBetween(v1), 'Vector: angleBetween from zero vector throws');

// projectOnto zero vector
assertThrows(() => v1.projectOnto(zeroVec), 'Vector: projectOnto zero vector throws');

// isOrthogonalTo
const orthVec = Vector.from([1, 0, 0]);
const orthVec2 = Vector.from([0, 1, 0]);
assert(orthVec.isOrthogonalTo(orthVec2), 'Vector: orthogonal vectors detected');
assert(!orthVec.isOrthogonalTo(v1), 'Vector: non-orthogonal vectors detected');

// Distance to self is zero
assertClose(v1.distance(v1).toNumber(), 0, 1e-15, 'Vector: distance to self is zero');

// equals with tolerance
const v1Approx = Vector.from(['1.00000000001', '2', '3']);  // Use strings for precise control
assert(!v1.equals(v1Approx, 0), 'Vector: not equal with zero tolerance');
assert(v1.equals(v1Approx, 1e-10), 'Vector: equal with 1e-10 tolerance');

// clone creates independent copy
const v1Clone = v1.clone();
assert(v1.equals(v1Clone), 'Vector: clone equals original');
assert(v1 !== v1Clone, 'Vector: clone is different object');

// Outer product dimensions
const v4d = Vector.from([1, 2, 3, 4]);
const outer = v1.outer(v4d);
assert(outer.length === 3 && outer[0].length === 4, 'Vector: outer product has correct dimensions (3x4)');

// Conversion methods
const strArr = v1.toStringArray();
assert(strArr[0] === '1' && strArr[1] === '2' && strArr[2] === '3', 'Vector: toStringArray correct');
const numArr = v1.toNumberArray();
assert(numArr[0] === 1 && numArr[1] === 2 && numArr[2] === 3, 'Vector: toNumberArray correct');

console.log('\n=== Matrix Edge Case Tests ===\n');

// ============================================================================
// MATRIX TESTS - Edge Cases and Error Handling
// ============================================================================

// Matrix creation edge cases
assertThrows(() => new Matrix([]), 'Matrix: empty array throws');
assertThrows(() => new Matrix([[1, 2], [3]]), 'Matrix: inconsistent row lengths throws');

// 1x1 matrix
const m1x1 = Matrix.from([[5]]);
assert(m1x1.rows === 1 && m1x1.cols === 1, 'Matrix: 1x1 matrix dimensions');
assert(m1x1.isSquare(), 'Matrix: 1x1 matrix is square');
assertClose(m1x1.determinant().toNumber(), 5, 1e-15, 'Matrix: 1x1 determinant');
assertClose(m1x1.trace().toNumber(), 5, 1e-15, 'Matrix: 1x1 trace');

// Non-square matrix operations
const rect = Matrix.from([[1, 2, 3], [4, 5, 6]]);
assert(!rect.isSquare(), 'Matrix: 2x3 matrix not square');
assertThrows(() => rect.determinant(), 'Matrix: determinant throws for non-square');
assertThrows(() => rect.trace(), 'Matrix: trace throws for non-square');
assertThrows(() => rect.inverse(), 'Matrix: inverse throws for non-square');
assertThrows(() => rect.lu(), 'Matrix: LU throws for non-square');

// Transpose of non-square
const rectT = rect.transpose();
assert(rectT.rows === 3 && rectT.cols === 2, 'Matrix: transpose swaps dimensions');

// Zero matrix
const zero3x3 = Matrix.zeros(3, 3);
assert(zero3x3.data[0][0].isZero() && zero3x3.data[2][2].isZero(), 'Matrix: zeros creates zero matrix');

// Identity matrix
const ident3 = Matrix.identity(3);
assert(ident3.data[0][0].equals(1) && ident3.data[1][0].isZero(), 'Matrix: identity correct');
assertClose(ident3.determinant().toNumber(), 1, 1e-15, 'Matrix: identity determinant is 1');

// Singular matrix - LU decomposition fails (zero pivot encountered)
const singular = Matrix.from([[1, 2], [2, 4]]);
assertThrows(() => singular.determinant(), 'Matrix: determinant of singular matrix throws (zero pivot)');
assertThrows(() => singular.inverse(), 'Matrix: inverse of singular matrix throws');

// Near-singular matrix (very small but non-zero determinant)
const nearSingular = Matrix.from([[1, 2], [2, 4.00001]]);
const nearSingularDet = nearSingular.determinant();
assertClose(nearSingularDet.toNumber(), 0.00001, 1e-10, 'Matrix: near-singular matrix has small determinant');

// Division by zero
const m2x2 = Matrix.from([[1, 2], [3, 4]]);
assertThrows(() => m2x2.div(0), 'Matrix: div by zero throws');

// Negate
const mNeg = m2x2.negate();
assert(mNeg.data[0][0].equals(-1) && mNeg.data[1][1].equals(-4), 'Matrix: negate correct');

// Add/sub dimension mismatch
const m3x3 = Matrix.from([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
assertThrows(() => m2x2.add(m3x3), 'Matrix: add throws on dimension mismatch');
assertThrows(() => m2x2.sub(m3x3), 'Matrix: sub throws on dimension mismatch');

// Multiply dimension mismatch
const m2x3 = Matrix.from([[1, 2, 3], [4, 5, 6]]);
const m2x2B = Matrix.from([[1, 2], [3, 4]]);
assertThrows(() => m2x3.mul(m2x2B), 'Matrix: mul throws on incompatible dimensions');

// Matrix-vector dimension mismatch
assertThrows(() => m2x2.applyToVector(v1), 'Matrix: applyToVector throws on dimension mismatch');

// Matrix exponential of identity
const identExp = Matrix.identity(2).exp();
assert(identExp.equals(Matrix.from([[Math.E, 0], [0, Math.E]]), 1e-10), 'Matrix: exp(I) = e*I');

// Matrix exponential of zero
const zeroExp = Matrix.zeros(2, 2).exp();
assert(zeroExp.equals(Matrix.identity(2), 1e-10), 'Matrix: exp(0) = I');

// QR decomposition for non-square
const { Q: qRect, R: rRect } = rect.qr();
assert(qRect.rows === 2 && rRect.cols === 3, 'Matrix: QR works for non-square');

// Scalar addition
const mScalarAdd = m2x2.add(10);
assert(mScalarAdd.data[0][0].equals(11) && mScalarAdd.data[1][1].equals(14), 'Matrix: scalar add correct');

// Scalar subtraction
const mScalarSub = m2x2.sub(1);
assert(mScalarSub.data[0][0].equals(0) && mScalarSub.data[1][1].equals(3), 'Matrix: scalar sub correct');

// Clone independence
const mClone = m2x2.clone();
assert(m2x2.equals(mClone), 'Matrix: clone equals original');
mClone.data[0][0] = new Decimal(999);
assert(!m2x2.data[0][0].equals(999), 'Matrix: clone is independent');

// Solve with non-array b
assertThrows(() => m2x2.solve('invalid'), 'Matrix: solve throws with invalid b');

// LU decomposition verification
const { L, U, P } = m2x2.lu();
const LU = L.mul(U);
const PA = P.mul(m2x2);
assert(LU.equals(PA, 1e-20), 'Matrix: LU decomposition verified');

console.log('\n=== Transforms2D Edge Case Tests ===\n');

// ============================================================================
// TRANSFORMS2D TESTS - Edge Cases and Error Handling
// ============================================================================

// Zero translation
const T0 = Transforms2D.translation(0, 0);
const p0 = Transforms2D.applyTransform(T0, 5, 7);
assertClose(p0[0].toNumber(), 5, 1e-15, 'Transforms2D: zero translation x unchanged');
assertClose(p0[1].toNumber(), 7, 1e-15, 'Transforms2D: zero translation y unchanged');

// Zero rotation
const R0 = Transforms2D.rotate(0);
const pr0 = Transforms2D.applyTransform(R0, 3, 4);
assertClose(pr0[0].toNumber(), 3, 1e-15, 'Transforms2D: zero rotation x unchanged');
assertClose(pr0[1].toNumber(), 4, 1e-15, 'Transforms2D: zero rotation y unchanged');

// 360 degree rotation
const R360 = Transforms2D.rotate(2 * Math.PI);
const pr360 = Transforms2D.applyTransform(R360, 3, 4);
assertClose(pr360[0].toNumber(), 3, 1e-10, 'Transforms2D: 360 rotation x returns');
assertClose(pr360[1].toNumber(), 4, 1e-10, 'Transforms2D: 360 rotation y returns');

// 180 degree rotation
const R180 = Transforms2D.rotate(Math.PI);
const pr180 = Transforms2D.applyTransform(R180, 3, 4);
assertClose(pr180[0].toNumber(), -3, 1e-10, 'Transforms2D: 180 rotation x negated');
assertClose(pr180[1].toNumber(), -4, 1e-10, 'Transforms2D: 180 rotation y negated');

// Identity scale
const S1 = Transforms2D.scale(1);
const ps1 = Transforms2D.applyTransform(S1, 3, 4);
assertClose(ps1[0].toNumber(), 3, 1e-15, 'Transforms2D: identity scale x unchanged');
assertClose(ps1[1].toNumber(), 4, 1e-15, 'Transforms2D: identity scale y unchanged');

// Negative scale (flip)
const SNeg = Transforms2D.scale(-1, -1);
const psNeg = Transforms2D.applyTransform(SNeg, 3, 4);
assertClose(psNeg[0].toNumber(), -3, 1e-15, 'Transforms2D: negative scale x flipped');
assertClose(psNeg[1].toNumber(), -4, 1e-15, 'Transforms2D: negative scale y flipped');

// Scale with zero (degenerate) - should throw since zero scale creates singular matrix
try {
  Transforms2D.scale(0, 0);
  assert(false, 'Transforms2D: zero scale should throw an error');
} catch (e) {
  assert(e.message.includes('cannot be zero'), 'Transforms2D: zero scale throws correct error');
}

// rotateAroundPoint - point stays fixed
const Rpt = Transforms2D.rotateAroundPoint(Math.PI / 4, 5, 5);
const pFix = Transforms2D.applyTransform(Rpt, 5, 5);
assertClose(pFix[0].toNumber(), 5, 1e-10, 'Transforms2D: rotateAroundPoint center x stays');
assertClose(pFix[1].toNumber(), 5, 1e-10, 'Transforms2D: rotateAroundPoint center y stays');

// Zero skew
const Sk0 = Transforms2D.skew(0, 0);
const psk0 = Transforms2D.applyTransform(Sk0, 3, 4);
assertClose(psk0[0].toNumber(), 3, 1e-15, 'Transforms2D: zero skew x unchanged');
assertClose(psk0[1].toNumber(), 4, 1e-15, 'Transforms2D: zero skew y unchanged');

// stretchAlongAxis with k=1 (identity)
const St1 = Transforms2D.stretchAlongAxis(1, 0, 1);
const pst1 = Transforms2D.applyTransform(St1, 3, 4);
assertClose(pst1[0].toNumber(), 3, 1e-15, 'Transforms2D: stretchAlongAxis k=1 x unchanged');
assertClose(pst1[1].toNumber(), 4, 1e-15, 'Transforms2D: stretchAlongAxis k=1 y unchanged');

// stretchAlongAxis with k=0 - should throw since it creates singular matrix
try {
  Transforms2D.stretchAlongAxis(1, 0, 0);
  assert(false, 'Transforms2D: stretchAlongAxis k=0 should throw');
} catch (e) {
  assert(e.message.includes('cannot be zero'), 'Transforms2D: stretchAlongAxis k=0 throws correct error');
}

// Reflections are self-inverse
const Rx = Transforms2D.reflectX();
const RxRx = Rx.mul(Rx);
assert(RxRx.equals(Matrix.identity(3), 1e-15), 'Transforms2D: reflectX is self-inverse');

const Ry = Transforms2D.reflectY();
const RyRy = Ry.mul(Ry);
assert(RyRy.equals(Matrix.identity(3), 1e-15), 'Transforms2D: reflectY is self-inverse');

const Ro = Transforms2D.reflectOrigin();
const RoRo = Ro.mul(Ro);
assert(RoRo.equals(Matrix.identity(3), 1e-15), 'Transforms2D: reflectOrigin is self-inverse');

// Transform with Decimal inputs
const TD = Transforms2D.translation(new Decimal('1.5'), new Decimal('2.5'));
const ptD = Transforms2D.applyTransform(TD, new Decimal('0.5'), new Decimal('0.5'));
assertClose(ptD[0].toNumber(), 2, 1e-15, 'Transforms2D: Decimal input translation x');
assertClose(ptD[1].toNumber(), 3, 1e-15, 'Transforms2D: Decimal input translation y');

// Transform with string inputs
const TS = Transforms2D.translation('1.5', '2.5');
const ptS = Transforms2D.applyTransform(TS, '0.5', '0.5');
assertClose(ptS[0].toNumber(), 2, 1e-15, 'Transforms2D: string input translation x');
assertClose(ptS[1].toNumber(), 3, 1e-15, 'Transforms2D: string input translation y');

// Very large values
const Tlarge = Transforms2D.translation(1e15, 1e15);
const ptLarge = Transforms2D.applyTransform(Tlarge, 1, 1);
assertClose(ptLarge[0].toNumber(), 1e15 + 1, 1e5, 'Transforms2D: large translation x');
assertClose(ptLarge[1].toNumber(), 1e15 + 1, 1e5, 'Transforms2D: large translation y');

// Very small values
const Tsmall = Transforms2D.translation(1e-15, 1e-15);
const ptSmall = Transforms2D.applyTransform(Tsmall, 0, 0);
assertClose(ptSmall[0].toNumber(), 1e-15, 1e-20, 'Transforms2D: small translation x');
assertClose(ptSmall[1].toNumber(), 1e-15, 1e-20, 'Transforms2D: small translation y');

console.log('\n=== Transforms3D Edge Case Tests ===\n');

// ============================================================================
// TRANSFORMS3D TESTS - Edge Cases and Error Handling
// ============================================================================

// Zero translation
const T3D0 = Transforms3D.translation(0, 0, 0);
const p3D0 = Transforms3D.applyTransform(T3D0, 1, 2, 3);
assertClose(p3D0[0].toNumber(), 1, 1e-15, 'Transforms3D: zero translation x unchanged');
assertClose(p3D0[1].toNumber(), 2, 1e-15, 'Transforms3D: zero translation y unchanged');
assertClose(p3D0[2].toNumber(), 3, 1e-15, 'Transforms3D: zero translation z unchanged');

// Identity scale
const S3D1 = Transforms3D.scale(1);
const ps3D1 = Transforms3D.applyTransform(S3D1, 1, 2, 3);
assertClose(ps3D1[0].toNumber(), 1, 1e-15, 'Transforms3D: identity scale x unchanged');
assertClose(ps3D1[1].toNumber(), 2, 1e-15, 'Transforms3D: identity scale y unchanged');
assertClose(ps3D1[2].toNumber(), 3, 1e-15, 'Transforms3D: identity scale z unchanged');

// Negative scale
const S3DNeg = Transforms3D.scale(-1, -1, -1);
const ps3DNeg = Transforms3D.applyTransform(S3DNeg, 1, 2, 3);
assertClose(ps3DNeg[0].toNumber(), -1, 1e-15, 'Transforms3D: negative scale x flipped');
assertClose(ps3DNeg[1].toNumber(), -2, 1e-15, 'Transforms3D: negative scale y flipped');
assertClose(ps3DNeg[2].toNumber(), -3, 1e-15, 'Transforms3D: negative scale z flipped');

// Zero rotation around each axis
const Rx0 = Transforms3D.rotateX(0);
const prx0 = Transforms3D.applyTransform(Rx0, 1, 2, 3);
assertClose(prx0[0].toNumber(), 1, 1e-15, 'Transforms3D: zero rotateX unchanged');
assertClose(prx0[1].toNumber(), 2, 1e-15, 'Transforms3D: zero rotateX unchanged');
assertClose(prx0[2].toNumber(), 3, 1e-15, 'Transforms3D: zero rotateX unchanged');

const Ry0 = Transforms3D.rotateY(0);
const pry0 = Transforms3D.applyTransform(Ry0, 1, 2, 3);
assertClose(pry0[0].toNumber(), 1, 1e-15, 'Transforms3D: zero rotateY unchanged');
assertClose(pry0[1].toNumber(), 2, 1e-15, 'Transforms3D: zero rotateY unchanged');
assertClose(pry0[2].toNumber(), 3, 1e-15, 'Transforms3D: zero rotateY unchanged');

const Rz0 = Transforms3D.rotateZ(0);
const prz0 = Transforms3D.applyTransform(Rz0, 1, 2, 3);
assertClose(prz0[0].toNumber(), 1, 1e-15, 'Transforms3D: zero rotateZ unchanged');
assertClose(prz0[1].toNumber(), 2, 1e-15, 'Transforms3D: zero rotateZ unchanged');
assertClose(prz0[2].toNumber(), 3, 1e-15, 'Transforms3D: zero rotateZ unchanged');

// 360 degree rotations
const Rx360 = Transforms3D.rotateX(2 * Math.PI);
const prx360 = Transforms3D.applyTransform(Rx360, 1, 2, 3);
assertClose(prx360[0].toNumber(), 1, 1e-10, 'Transforms3D: 360 rotateX returns to original');
assertClose(prx360[1].toNumber(), 2, 1e-10, 'Transforms3D: 360 rotateX returns to original');
assertClose(prx360[2].toNumber(), 3, 1e-10, 'Transforms3D: 360 rotateX returns to original');

// rotateAroundAxis with zero axis (should throw)
assertThrows(() => Transforms3D.rotateAroundAxis(0, 0, 0, Math.PI / 4),
  'Transforms3D: rotateAroundAxis with zero axis throws');

// rotateAroundAxis matches single-axis rotations
const RxFromAxis = Transforms3D.rotateAroundAxis(1, 0, 0, Math.PI / 2);
const RxDirect = Transforms3D.rotateX(Math.PI / 2);
const prxAxis = Transforms3D.applyTransform(RxFromAxis, 0, 1, 0);
const prxDirect = Transforms3D.applyTransform(RxDirect, 0, 1, 0);
assertClose(prxAxis[0].toNumber(), prxDirect[0].toNumber(), 1e-10,
  'Transforms3D: rotateAroundAxis(1,0,0) matches rotateX - x');
assertClose(prxAxis[1].toNumber(), prxDirect[1].toNumber(), 1e-10,
  'Transforms3D: rotateAroundAxis(1,0,0) matches rotateX - y');
assertClose(prxAxis[2].toNumber(), prxDirect[2].toNumber(), 1e-10,
  'Transforms3D: rotateAroundAxis(1,0,0) matches rotateX - z');

// rotateAroundPoint - point stays fixed
const Rpt3D = Transforms3D.rotateAroundPoint(0, 0, 1, Math.PI / 4, 5, 5, 5);
const pFix3D = Transforms3D.applyTransform(Rpt3D, 5, 5, 5);
assertClose(pFix3D[0].toNumber(), 5, 1e-10, 'Transforms3D: rotateAroundPoint center x stays');
assertClose(pFix3D[1].toNumber(), 5, 1e-10, 'Transforms3D: rotateAroundPoint center y stays');
assertClose(pFix3D[2].toNumber(), 5, 1e-10, 'Transforms3D: rotateAroundPoint center z stays');

// Reflections are self-inverse
const RfXY = Transforms3D.reflectXY();
const RfXYRfXY = RfXY.mul(RfXY);
assert(RfXYRfXY.equals(Matrix.identity(4), 1e-15), 'Transforms3D: reflectXY is self-inverse');

const RfXZ = Transforms3D.reflectXZ();
const RfXZRfXZ = RfXZ.mul(RfXZ);
assert(RfXZRfXZ.equals(Matrix.identity(4), 1e-15), 'Transforms3D: reflectXZ is self-inverse');

const RfYZ = Transforms3D.reflectYZ();
const RfYZRfYZ = RfYZ.mul(RfYZ);
assert(RfYZRfYZ.equals(Matrix.identity(4), 1e-15), 'Transforms3D: reflectYZ is self-inverse');

const RfO3 = Transforms3D.reflectOrigin();
const RfO3RfO3 = RfO3.mul(RfO3);
assert(RfO3RfO3.equals(Matrix.identity(4), 1e-15), 'Transforms3D: reflectOrigin is self-inverse');

// Composition: inverse of composition restores original
const T3 = Transforms3D.translation(10, 20, 30);
const S3 = Transforms3D.scale(2, 3, 4);
const R3 = Transforms3D.rotateZ(Math.PI / 4);
const Composed3 = T3.mul(R3).mul(S3);
const ComposedInv3 = Composed3.inverse();
const pOrig3 = [1, 2, 3];
const pTransformed3 = Transforms3D.applyTransform(Composed3, ...pOrig3);
const pRestored3 = Transforms3D.applyTransform(ComposedInv3, ...pTransformed3);
assertClose(pRestored3[0].toNumber(), 1, 1e-10, 'Transforms3D: inverse composition restores x');
assertClose(pRestored3[1].toNumber(), 2, 1e-10, 'Transforms3D: inverse composition restores y');
assertClose(pRestored3[2].toNumber(), 3, 1e-10, 'Transforms3D: inverse composition restores z');

// Non-uniform scale
const S3NU = Transforms3D.scale(1, 2, 3);
const ps3NU = Transforms3D.applyTransform(S3NU, 1, 1, 1);
assertClose(ps3NU[0].toNumber(), 1, 1e-15, 'Transforms3D: non-uniform scale x');
assertClose(ps3NU[1].toNumber(), 2, 1e-15, 'Transforms3D: non-uniform scale y');
assertClose(ps3NU[2].toNumber(), 3, 1e-15, 'Transforms3D: non-uniform scale z');

// Very large values
const T3Large = Transforms3D.translation(1e15, 1e15, 1e15);
const pt3Large = Transforms3D.applyTransform(T3Large, 0, 0, 0);
assertClose(pt3Large[0].toNumber(), 1e15, 1e5, 'Transforms3D: large translation x');
assertClose(pt3Large[1].toNumber(), 1e15, 1e5, 'Transforms3D: large translation y');
assertClose(pt3Large[2].toNumber(), 1e15, 1e5, 'Transforms3D: large translation z');

console.log('\n=== Additional Vector Math Tests ===\n');

// ============================================================================
// ADDITIONAL VECTOR MATH TESTS
// ============================================================================

// Orthogonal 2D
const v2D = Vector.from([3, 4]);
const orth2D = v2D.orthogonal();
assertClose(v2D.dot(orth2D).toNumber(), 0, 1e-10, 'Vector: 2D orthogonal is perpendicular');
assertClose(orth2D.data[0].toNumber(), -4, 1e-10, 'Vector: 2D orthogonal is [-y, x]');
assertClose(orth2D.data[1].toNumber(), 3, 1e-10, 'Vector: 2D orthogonal is [-y, x]');

// Orthogonal 3D
const v3D = Vector.from([1, 0, 0]);
const orth3D = v3D.orthogonal();
assertClose(v3D.dot(orth3D).toNumber(), 0, 1e-10, 'Vector: 3D orthogonal is perpendicular');
assertClose(orth3D.norm().toNumber(), 1, 1e-10, 'Vector: 3D orthogonal is unit vector');

// Parallel vectors - angle is 0
const vPar1 = Vector.from([1, 2, 3]);
const vPar2 = Vector.from([2, 4, 6]);
assertClose(vPar1.angleBetween(vPar2).toNumber(), 0, 1e-10, 'Vector: parallel vectors have angle 0');

// Anti-parallel vectors - angle is PI
const vAnti = Vector.from([-1, -2, -3]);
assertClose(vPar1.angleBetween(vAnti).toNumber(), Math.PI, 1e-10, 'Vector: anti-parallel vectors have angle PI');

// Perpendicular vectors - angle is PI/2
const vPerpX = Vector.from([1, 0, 0]);
const vPerpY = Vector.from([0, 1, 0]);
assertClose(vPerpX.angleBetween(vPerpY).toNumber(), Math.PI / 2, 1e-10, 'Vector: perpendicular vectors have angle PI/2');

// Project vector onto perpendicular is zero
const projPerp = vPerpX.projectOnto(vPerpY);
assertClose(projPerp.norm().toNumber(), 0, 1e-10, 'Vector: projection onto perpendicular is zero');

// Project vector onto parallel
const projPar = vPar1.projectOnto(vPar2);
assertClose(projPar.distance(vPar1).toNumber(), 0, 1e-10, 'Vector: projection onto parallel equals self');

console.log('\n=== Additional Matrix Math Tests ===\n');

// ============================================================================
// ADDITIONAL MATRIX MATH TESTS
// ============================================================================

// Transpose of transpose is identity
const mSquare = Matrix.from([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
const mTT = mSquare.transpose().transpose();
assert(mSquare.equals(mTT), 'Matrix: transpose of transpose equals original');

// (AB)^T = B^T * A^T
const mA = Matrix.from([[1, 2], [3, 4]]);
const mB = Matrix.from([[5, 6], [7, 8]]);
const mAB = mA.mul(mB);
const mABT = mAB.transpose();
const mBTAT = mB.transpose().mul(mA.transpose());
assert(mABT.equals(mBTAT, 1e-15), 'Matrix: (AB)^T = B^T * A^T');

// det(AB) = det(A) * det(B)
const detAB = mAB.determinant();
const detA = mA.determinant();
const detB = mB.determinant();
assertClose(detAB.toNumber(), detA.mul(detB).toNumber(), 1e-10, 'Matrix: det(AB) = det(A) * det(B)');

// det(A^T) = det(A)
const detAT = mA.transpose().determinant();
assertClose(detAT.toNumber(), detA.toNumber(), 1e-15, 'Matrix: det(A^T) = det(A)');

// Inverse of product: (AB)^-1 = B^-1 * A^-1
const mABInv = mAB.inverse();
const mBInvAInv = mB.inverse().mul(mA.inverse());
assert(mABInv.equals(mBInvAInv, 1e-14), 'Matrix: (AB)^-1 = B^-1 * A^-1');

// Trace of sum: tr(A + B) = tr(A) + tr(B)
const trSum = mA.add(mB).trace();
const sumTr = mA.trace().plus(mB.trace());
assertClose(trSum.toNumber(), sumTr.toNumber(), 1e-15, 'Matrix: tr(A+B) = tr(A) + tr(B)');

// Matrix times identity
const mAI = mA.mul(Matrix.identity(2));
assert(mA.equals(mAI), 'Matrix: A * I = A');

// Identity times matrix
const mIA = Matrix.identity(2).mul(mA);
assert(mA.equals(mIA), 'Matrix: I * A = A');

console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
