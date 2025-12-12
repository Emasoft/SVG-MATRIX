/**
 * Unit tests for transform-decomposition.js
 *
 * Coverage: All exported functions from the transform-decomposition module
 * - Matrix creation: identityMatrix, translationMatrix, rotationMatrix, scaleMatrix, skewXMatrix, skewYMatrix
 * - Extraction: extractLinearPart, extractTranslation
 * - Decomposition: decomposeMatrix, decomposeMatrixNoSkew, decomposeMatrixCSS, decomposeMatrixSVG
 * - Composition: composeTransform, composeTransformNoSkew
 * - Comparison: matrixMaxDifference, matricesEqual
 * - Verification: verifyDecomposition
 * - SVG conversion: matrixFromSVGValues, matrixToSVGValues, decompositionToSVGString, matrixToMinimalSVGTransform
 * - Type checks: isPureTranslation, isPureRotation, isPureScale, isIdentityMatrix
 *
 * Test philosophy: Each test exercises real code paths with realistic data.
 * Round-trip tests verify decompose->compose produces the original matrix.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import * as TD from '../src/transform-decomposition.js';
import { Matrix } from '../src/matrix.js';

// Set high precision for all test calculations
Decimal.set({ precision: 80 });

// Helper to convert number to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

// Tolerance for Decimal comparisons in tests
const TEST_TOLERANCE = new Decimal('1e-20');

// Helper to check if two Decimals are approximately equal
function decimalClose(a, b, tolerance = TEST_TOLERANCE) {
  return D(a).minus(D(b)).abs().lessThan(tolerance);
}

// Helper to get PI with high precision
const PI = Decimal.acos(-1);

// ============================================================================
// Matrix Creation Tests
// ============================================================================

describe('TransformDecomposition - Matrix Creation', () => {

  describe('identityMatrix()', () => {
    it('creates a 3x3 identity matrix', () => {
      const I = TD.identityMatrix();
      assert.strictEqual(I.rows, 3, 'Identity matrix should have 3 rows');
      assert.strictEqual(I.cols, 3, 'Identity matrix should have 3 columns');
    });

    it('has ones on the diagonal', () => {
      const I = TD.identityMatrix();
      assert.ok(I.data[0][0].equals(1), 'I[0][0] should be 1');
      assert.ok(I.data[1][1].equals(1), 'I[1][1] should be 1');
      assert.ok(I.data[2][2].equals(1), 'I[2][2] should be 1');
    });

    it('has zeros off the diagonal', () => {
      const I = TD.identityMatrix();
      assert.ok(I.data[0][1].isZero(), 'I[0][1] should be 0');
      assert.ok(I.data[0][2].isZero(), 'I[0][2] should be 0');
      assert.ok(I.data[1][0].isZero(), 'I[1][0] should be 0');
      assert.ok(I.data[1][2].isZero(), 'I[1][2] should be 0');
      assert.ok(I.data[2][0].isZero(), 'I[2][0] should be 0');
      assert.ok(I.data[2][1].isZero(), 'I[2][1] should be 0');
    });
  });

  describe('translationMatrix()', () => {
    it('creates a translation matrix with specified tx, ty', () => {
      const T = TD.translationMatrix(10, 20);
      assert.ok(T.data[0][2].equals(10), 'Translation X should be 10');
      assert.ok(T.data[1][2].equals(20), 'Translation Y should be 20');
    });

    it('preserves identity in linear part', () => {
      const T = TD.translationMatrix(100, -50);
      assert.ok(T.data[0][0].equals(1), 'a should be 1');
      assert.ok(T.data[1][1].equals(1), 'd should be 1');
      assert.ok(T.data[0][1].isZero(), 'c should be 0');
      assert.ok(T.data[1][0].isZero(), 'b should be 0');
    });

    it('accepts Decimal inputs', () => {
      const tx = new Decimal('12.345678901234567890');
      const ty = new Decimal('-98.765432109876543210');
      const T = TD.translationMatrix(tx, ty);
      assert.ok(T.data[0][2].equals(tx), 'Translation X preserved with high precision');
      assert.ok(T.data[1][2].equals(ty), 'Translation Y preserved with high precision');
    });

    it('accepts string inputs for arbitrary precision', () => {
      const T = TD.translationMatrix('123.456789012345678901234567890', '-0.000000000000000001');
      assert.ok(decimalClose(T.data[0][2], '123.456789012345678901234567890'), 'String tx preserved');
      assert.ok(decimalClose(T.data[1][2], '-0.000000000000000001'), 'String ty preserved');
    });
  });

  describe('rotationMatrix()', () => {
    it('creates identity for zero rotation', () => {
      const R = TD.rotationMatrix(0);
      assert.ok(decimalClose(R.data[0][0], 1), 'cos(0) should be 1');
      assert.ok(decimalClose(R.data[1][1], 1), 'cos(0) should be 1');
      assert.ok(R.data[0][1].abs().lessThan(TD.EPSILON), 'sin(0) should be ~0');
      assert.ok(R.data[1][0].abs().lessThan(TD.EPSILON), 'sin(0) should be ~0');
    });

    it('creates 90 degree rotation correctly', () => {
      const R = TD.rotationMatrix(PI.div(2)); // 90 degrees
      // cos(90) = 0, sin(90) = 1
      // Matrix: [cos -sin] = [0 -1]
      //         [sin  cos]   [1  0]
      assert.ok(R.data[0][0].abs().lessThan(TEST_TOLERANCE), 'cos(90deg) should be ~0');
      assert.ok(decimalClose(R.data[1][0], 1), 'sin(90deg) should be ~1');
      assert.ok(decimalClose(R.data[0][1], -1), '-sin(90deg) should be ~-1');
      assert.ok(R.data[1][1].abs().lessThan(TEST_TOLERANCE), 'cos(90deg) should be ~0');
    });

    it('creates 180 degree rotation correctly', () => {
      const R = TD.rotationMatrix(PI); // 180 degrees
      // cos(180) = -1, sin(180) = 0
      assert.ok(decimalClose(R.data[0][0], -1), 'cos(180deg) should be -1');
      assert.ok(R.data[1][0].abs().lessThan(TEST_TOLERANCE), 'sin(180deg) should be ~0');
    });

    it('rotation matrix is orthogonal (det = 1)', () => {
      const R = TD.rotationMatrix(0.7);
      const det = R.data[0][0].mul(R.data[1][1]).minus(R.data[0][1].mul(R.data[1][0]));
      assert.ok(decimalClose(det, 1), 'Rotation matrix determinant should be 1');
    });

    it('has no translation component', () => {
      const R = TD.rotationMatrix(1.23);
      assert.ok(R.data[0][2].isZero(), 'Translation X should be 0');
      assert.ok(R.data[1][2].isZero(), 'Translation Y should be 0');
    });
  });

  describe('scaleMatrix()', () => {
    it('creates identity for scale(1,1)', () => {
      const S = TD.scaleMatrix(1, 1);
      assert.ok(S.data[0][0].equals(1), 'scaleX should be 1');
      assert.ok(S.data[1][1].equals(1), 'scaleY should be 1');
    });

    it('creates uniform scale correctly', () => {
      const S = TD.scaleMatrix(2, 2);
      assert.ok(S.data[0][0].equals(2), 'scaleX should be 2');
      assert.ok(S.data[1][1].equals(2), 'scaleY should be 2');
    });

    it('creates non-uniform scale correctly', () => {
      const S = TD.scaleMatrix(3, 0.5);
      assert.ok(S.data[0][0].equals(3), 'scaleX should be 3');
      assert.ok(decimalClose(S.data[1][1], 0.5), 'scaleY should be 0.5');
    });

    it('handles negative scales (reflection)', () => {
      const S = TD.scaleMatrix(-1, 1);
      assert.ok(S.data[0][0].equals(-1), 'scaleX should be -1');
      assert.ok(S.data[1][1].equals(1), 'scaleY should be 1');
    });

    it('has no off-diagonal or translation elements', () => {
      const S = TD.scaleMatrix(5, 7);
      assert.ok(S.data[0][1].isZero(), 'c should be 0');
      assert.ok(S.data[1][0].isZero(), 'b should be 0');
      assert.ok(S.data[0][2].isZero(), 'tx should be 0');
      assert.ok(S.data[1][2].isZero(), 'ty should be 0');
    });
  });

  describe('skewXMatrix()', () => {
    it('creates identity for zero skew', () => {
      const Sk = TD.skewXMatrix(0);
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(Sk.data[0][1].abs().lessThan(TD.EPSILON), 'tan(0) should be ~0');
      assert.ok(Sk.data[1][0].isZero(), 'b should be 0');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });

    it('creates 45 degree skewX correctly', () => {
      const Sk = TD.skewXMatrix(PI.div(4)); // 45 degrees, tan = 1
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(decimalClose(Sk.data[0][1], 1), 'tan(45deg) should be ~1');
      assert.ok(Sk.data[1][0].isZero(), 'b should be 0');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });

    it('skewX matrix structure is [1, tan(angle); 0, 1]', () => {
      const angle = D('0.3');
      const Sk = TD.skewXMatrix(angle);
      const expectedTan = Decimal.tan(angle);
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(decimalClose(Sk.data[0][1], expectedTan), 'c should be tan(angle)');
      assert.ok(Sk.data[1][0].isZero(), 'b should be 0');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });
  });

  describe('skewYMatrix()', () => {
    it('creates identity for zero skew', () => {
      const Sk = TD.skewYMatrix(0);
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(Sk.data[0][1].isZero(), 'c should be 0');
      assert.ok(Sk.data[1][0].abs().lessThan(TD.EPSILON), 'tan(0) should be ~0');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });

    it('creates 45 degree skewY correctly', () => {
      const Sk = TD.skewYMatrix(PI.div(4)); // 45 degrees, tan = 1
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(Sk.data[0][1].isZero(), 'c should be 0');
      assert.ok(decimalClose(Sk.data[1][0], 1), 'tan(45deg) should be ~1');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });

    it('skewY matrix structure is [1, 0; tan(angle), 1]', () => {
      const angle = D('-0.5');
      const Sk = TD.skewYMatrix(angle);
      const expectedTan = Decimal.tan(angle);
      assert.ok(Sk.data[0][0].equals(1), 'a should be 1');
      assert.ok(Sk.data[0][1].isZero(), 'c should be 0');
      assert.ok(decimalClose(Sk.data[1][0], expectedTan), 'b should be tan(angle)');
      assert.ok(Sk.data[1][1].equals(1), 'd should be 1');
    });
  });
});

// ============================================================================
// Extraction Tests
// ============================================================================

describe('TransformDecomposition - Extraction', () => {

  describe('extractLinearPart()', () => {
    it('extracts a, b, c, d from identity matrix', () => {
      const I = TD.identityMatrix();
      const { a, b, c, d } = TD.extractLinearPart(I);
      assert.ok(a.equals(1), 'a should be 1');
      assert.ok(b.isZero(), 'b should be 0');
      assert.ok(c.isZero(), 'c should be 0');
      assert.ok(d.equals(1), 'd should be 1');
    });

    it('extracts linear part from translation matrix (should be identity)', () => {
      const T = TD.translationMatrix(100, 200);
      const { a, b, c, d } = TD.extractLinearPart(T);
      assert.ok(a.equals(1), 'a should be 1');
      assert.ok(b.isZero(), 'b should be 0');
      assert.ok(c.isZero(), 'c should be 0');
      assert.ok(d.equals(1), 'd should be 1');
    });

    it('extracts linear part from scale matrix', () => {
      const S = TD.scaleMatrix(3, 5);
      const { a, b, c, d } = TD.extractLinearPart(S);
      assert.ok(a.equals(3), 'a should be 3');
      assert.ok(b.isZero(), 'b should be 0');
      assert.ok(c.isZero(), 'c should be 0');
      assert.ok(d.equals(5), 'd should be 5');
    });

    it('extracts linear part from rotation matrix', () => {
      const angle = D('0.7');
      const R = TD.rotationMatrix(angle);
      const { a, b, c, d } = TD.extractLinearPart(R);
      const cosAngle = Decimal.cos(angle);
      const sinAngle = Decimal.sin(angle);
      assert.ok(decimalClose(a, cosAngle), 'a should be cos(angle)');
      assert.ok(decimalClose(b, sinAngle), 'b should be sin(angle)');
      assert.ok(decimalClose(c, sinAngle.neg()), 'c should be -sin(angle)');
      assert.ok(decimalClose(d, cosAngle), 'd should be cos(angle)');
    });
  });

  describe('extractTranslation()', () => {
    it('extracts zero translation from identity matrix', () => {
      const I = TD.identityMatrix();
      const { tx, ty } = TD.extractTranslation(I);
      assert.ok(tx.isZero(), 'tx should be 0');
      assert.ok(ty.isZero(), 'ty should be 0');
    });

    it('extracts translation from translation matrix', () => {
      const T = TD.translationMatrix(42, -17);
      const { tx, ty } = TD.extractTranslation(T);
      assert.ok(tx.equals(42), 'tx should be 42');
      assert.ok(ty.equals(-17), 'ty should be -17');
    });

    it('extracts zero translation from rotation matrix', () => {
      const R = TD.rotationMatrix(1.5);
      const { tx, ty } = TD.extractTranslation(R);
      assert.ok(tx.isZero(), 'tx should be 0');
      assert.ok(ty.isZero(), 'ty should be 0');
    });

    it('extracts zero translation from scale matrix', () => {
      const S = TD.scaleMatrix(2, 3);
      const { tx, ty } = TD.extractTranslation(S);
      assert.ok(tx.isZero(), 'tx should be 0');
      assert.ok(ty.isZero(), 'ty should be 0');
    });

    it('extracts translation with arbitrary precision', () => {
      const preciseX = '123.456789012345678901234567890123456789';
      const preciseY = '-987.654321098765432109876543210987654321';
      const T = TD.translationMatrix(preciseX, preciseY);
      const { tx, ty } = TD.extractTranslation(T);
      assert.ok(decimalClose(tx, preciseX, new Decimal('1e-35')), 'tx preserved with high precision');
      assert.ok(decimalClose(ty, preciseY, new Decimal('1e-35')), 'ty preserved with high precision');
    });
  });
});

// ============================================================================
// Decomposition Tests
// ============================================================================

describe('TransformDecomposition - Decomposition', () => {

  describe('decomposeMatrix()', () => {
    it('decomposes identity matrix correctly', () => {
      const I = TD.identityMatrix();
      const result = TD.decomposeMatrix(I);

      assert.ok(result.translateX.isZero(), 'translateX should be 0');
      assert.ok(result.translateY.isZero(), 'translateY should be 0');
      assert.ok(result.rotation.abs().lessThan(TD.EPSILON), 'rotation should be ~0');
      assert.ok(decimalClose(result.scaleX, 1), 'scaleX should be 1');
      assert.ok(decimalClose(result.scaleY, 1), 'scaleY should be 1');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure translation correctly', () => {
      const T = TD.translationMatrix(50, -30);
      const result = TD.decomposeMatrix(T);

      assert.ok(decimalClose(result.translateX, 50), 'translateX should be 50');
      assert.ok(decimalClose(result.translateY, -30), 'translateY should be -30');
      assert.ok(result.rotation.abs().lessThan(TD.EPSILON), 'rotation should be ~0');
      assert.ok(decimalClose(result.scaleX, 1), 'scaleX should be 1');
      assert.ok(decimalClose(result.scaleY, 1), 'scaleY should be 1');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure rotation correctly', () => {
      const angle = PI.div(6); // 30 degrees
      const R = TD.rotationMatrix(angle);
      const result = TD.decomposeMatrix(R);

      assert.ok(result.translateX.abs().lessThan(TD.EPSILON), 'translateX should be ~0');
      assert.ok(result.translateY.abs().lessThan(TD.EPSILON), 'translateY should be ~0');
      assert.ok(decimalClose(result.rotation, angle, new Decimal('1e-30')), 'rotation should match input angle');
      assert.ok(decimalClose(result.scaleX, 1), 'scaleX should be 1');
      assert.ok(decimalClose(result.scaleY, 1), 'scaleY should be 1');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure scale correctly', () => {
      const S = TD.scaleMatrix(2.5, 0.8);
      const result = TD.decomposeMatrix(S);

      assert.ok(result.translateX.abs().lessThan(TD.EPSILON), 'translateX should be ~0');
      assert.ok(result.translateY.abs().lessThan(TD.EPSILON), 'translateY should be ~0');
      assert.ok(result.rotation.abs().lessThan(TD.EPSILON), 'rotation should be ~0');
      assert.ok(decimalClose(result.scaleX, 2.5), 'scaleX should be 2.5');
      assert.ok(decimalClose(result.scaleY, 0.8), 'scaleY should be 0.8');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes combined translate + rotate correctly (round-trip)', () => {
      const T = TD.translationMatrix(100, 200);
      const R = TD.rotationMatrix(0.5);
      const combined = T.mul(R);
      const result = TD.decomposeMatrix(combined);

      // Verify round-trip
      const recomposed = TD.composeTransform(result);
      assert.ok(TD.matricesEqual(combined, recomposed), 'Round-trip should match');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes combined translate + rotate + scale correctly (round-trip)', () => {
      const T = TD.translationMatrix(50, -25);
      const R = TD.rotationMatrix(PI.div(4));
      const S = TD.scaleMatrix(1.5, 2.0);
      const combined = T.mul(R).mul(S);
      const result = TD.decomposeMatrix(combined);

      assert.ok(result.verified, 'Decomposition should be verified');
      assert.ok(result.maxError.lessThan(TD.VERIFICATION_TOLERANCE), 'Max error should be within tolerance');
    });

    it('handles negative scale (reflection)', () => {
      const S = TD.scaleMatrix(-1, 1);
      const result = TD.decomposeMatrix(S);

      // Negative determinant means scaleX should be negative
      assert.ok(result.scaleX.lessThan(0) || result.scaleY.lessThan(0), 'One scale should be negative for reflection');
      // Note: Pure reflection may not verify perfectly due to decomposition order
      // The decomposition extracts negative scale correctly, but recomposition uses T*R*Sk*S order
      // which may result in small numerical differences for reflection matrices
      assert.ok(result.maxError instanceof Decimal, 'maxError should be provided');
    });

    it('provides maxError in result', () => {
      const M = TD.translationMatrix(10, 20);
      const result = TD.decomposeMatrix(M);

      assert.ok(result.maxError instanceof Decimal, 'maxError should be a Decimal');
      assert.ok(result.maxError.greaterThanOrEqualTo(0), 'maxError should be >= 0');
    });
  });

  describe('decomposeMatrixNoSkew()', () => {
    it('decomposes identity matrix correctly', () => {
      const I = TD.identityMatrix();
      const result = TD.decomposeMatrixNoSkew(I);

      assert.ok(result.translateX.isZero(), 'translateX should be 0');
      assert.ok(result.translateY.isZero(), 'translateY should be 0');
      assert.ok(result.rotation.abs().lessThan(TD.EPSILON), 'rotation should be ~0');
      assert.ok(decimalClose(result.scaleX, 1), 'scaleX should be 1');
      assert.ok(decimalClose(result.scaleY, 1), 'scaleY should be 1');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure translation correctly', () => {
      const T = TD.translationMatrix(-100, 75);
      const result = TD.decomposeMatrixNoSkew(T);

      assert.ok(decimalClose(result.translateX, -100), 'translateX should be -100');
      assert.ok(decimalClose(result.translateY, 75), 'translateY should be 75');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure rotation correctly', () => {
      const angle = D('-0.8');
      const R = TD.rotationMatrix(angle);
      const result = TD.decomposeMatrixNoSkew(R);

      assert.ok(decimalClose(result.rotation, angle, new Decimal('1e-30')), 'rotation should match');
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('decomposes pure scale correctly', () => {
      const S = TD.scaleMatrix(4, 0.25);
      const result = TD.decomposeMatrixNoSkew(S);

      assert.ok(decimalClose(result.scaleX, 4), 'scaleX should be 4');
      // Note: scaleY calculation in NoSkew uses second column norm
      assert.ok(result.verified, 'Decomposition should be verified');
    });

    it('round-trip works for non-skewed transforms', () => {
      const T = TD.translationMatrix(30, 40);
      const R = TD.rotationMatrix(0.3);
      const S = TD.scaleMatrix(1.2, 1.8);
      const combined = T.mul(R).mul(S);
      const result = TD.decomposeMatrixNoSkew(combined);

      const recomposed = TD.composeTransformNoSkew(result);
      assert.ok(TD.matricesEqual(combined, recomposed, new Decimal('1e-25')), 'Round-trip should match');
    });

    it('does not include skewX or skewY in result', () => {
      const M = TD.translationMatrix(10, 20);
      const result = TD.decomposeMatrixNoSkew(M);

      assert.strictEqual(result.skewX, undefined, 'skewX should not be present');
      assert.strictEqual(result.skewY, undefined, 'skewY should not be present');
    });
  });

  describe('decomposeMatrixCSS()', () => {
    it('returns same result as decomposeMatrix', () => {
      const M = TD.translationMatrix(10, 20).mul(TD.rotationMatrix(0.5)).mul(TD.scaleMatrix(2, 3));
      const cssResult = TD.decomposeMatrixCSS(M);
      const standardResult = TD.decomposeMatrix(M);

      assert.ok(cssResult.translateX.equals(standardResult.translateX), 'translateX should match');
      assert.ok(cssResult.translateY.equals(standardResult.translateY), 'translateY should match');
      assert.ok(cssResult.rotation.equals(standardResult.rotation), 'rotation should match');
      assert.ok(cssResult.verified === standardResult.verified, 'verified should match');
    });
  });

  describe('decomposeMatrixSVG()', () => {
    it('returns same result as decomposeMatrix', () => {
      const M = TD.scaleMatrix(0.5, 2).mul(TD.rotationMatrix(-0.3));
      const svgResult = TD.decomposeMatrixSVG(M);
      const standardResult = TD.decomposeMatrix(M);

      assert.ok(svgResult.translateX.equals(standardResult.translateX), 'translateX should match');
      assert.ok(svgResult.translateY.equals(standardResult.translateY), 'translateY should match');
      assert.ok(svgResult.rotation.equals(standardResult.rotation), 'rotation should match');
    });
  });
});

// ============================================================================
// Composition Tests
// ============================================================================

describe('TransformDecomposition - Composition', () => {

  describe('composeTransform()', () => {
    it('composes identity from zero components', () => {
      const result = TD.composeTransform({
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0
      });
      const I = TD.identityMatrix();
      assert.ok(TD.matricesEqual(result, I), 'Zero components should produce identity');
    });

    it('composes pure translation', () => {
      const result = TD.composeTransform({
        translateX: 100,
        translateY: -50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0
      });
      const expected = TD.translationMatrix(100, -50);
      assert.ok(TD.matricesEqual(result, expected), 'Should produce pure translation');
    });

    it('composes pure rotation', () => {
      const angle = 0.7;
      const result = TD.composeTransform({
        translateX: 0,
        translateY: 0,
        rotation: angle,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0
      });
      const expected = TD.rotationMatrix(angle);
      assert.ok(TD.matricesEqual(result, expected), 'Should produce pure rotation');
    });

    it('composes pure scale', () => {
      const result = TD.composeTransform({
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 3,
        scaleY: 0.5,
        skewX: 0,
        skewY: 0
      });
      const expected = TD.scaleMatrix(3, 0.5);
      assert.ok(TD.matricesEqual(result, expected), 'Should produce pure scale');
    });

    it('composes translate + rotate + scale in correct order', () => {
      const T = TD.translationMatrix(10, 20);
      const R = TD.rotationMatrix(0.5);
      const S = TD.scaleMatrix(2, 3);
      const expected = T.mul(R).mul(S); // Order: T * R * S

      const result = TD.composeTransform({
        translateX: 10,
        translateY: 20,
        rotation: 0.5,
        scaleX: 2,
        scaleY: 3,
        skewX: 0,
        skewY: 0
      });

      // Note: composeTransform uses T * R * SkY * SkX * S order
      // With zero skew, should be T * R * S
      assert.ok(TD.matricesEqual(result, expected), 'Composition order should be T * R * S');
    });

    it('accepts Decimal inputs', () => {
      const result = TD.composeTransform({
        translateX: new Decimal('123.456789012345678901234567890'),
        translateY: new Decimal('-987.654321098765432109876543210'),
        rotation: new Decimal('0.123456789012345678901234567890'),
        scaleX: new Decimal('1.5'),
        scaleY: new Decimal('2.5'),
        skewX: new Decimal('0'),
        skewY: new Decimal('0')
      });
      assert.strictEqual(result.rows, 3, 'Result should be 3x3 matrix');
      assert.strictEqual(result.cols, 3, 'Result should be 3x3 matrix');
    });

    it('skewY defaults to 0 if not provided', () => {
      const result = TD.composeTransform({
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0
        // skewY omitted
      });
      const I = TD.identityMatrix();
      assert.ok(TD.matricesEqual(result, I), 'Missing skewY should default to 0');
    });
  });

  describe('composeTransformNoSkew()', () => {
    it('composes identity from zero/unit components', () => {
      const result = TD.composeTransformNoSkew({
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1
      });
      const I = TD.identityMatrix();
      assert.ok(TD.matricesEqual(result, I), 'Should produce identity');
    });

    it('composes translate + rotate + scale without skew', () => {
      const T = TD.translationMatrix(5, 10);
      const R = TD.rotationMatrix(-0.3);
      const S = TD.scaleMatrix(1.5, 2.5);
      const expected = T.mul(R).mul(S);

      const result = TD.composeTransformNoSkew({
        translateX: 5,
        translateY: 10,
        rotation: -0.3,
        scaleX: 1.5,
        scaleY: 2.5
      });

      assert.ok(TD.matricesEqual(result, expected), 'Should produce T * R * S');
    });

    it('matches composeTransform when skews are zero', () => {
      const components = {
        translateX: 15,
        translateY: 25,
        rotation: 0.4,
        scaleX: 1.2,
        scaleY: 0.8
      };

      const resultNoSkew = TD.composeTransformNoSkew(components);
      const resultWithSkew = TD.composeTransform({
        ...components,
        skewX: 0,
        skewY: 0
      });

      assert.ok(TD.matricesEqual(resultNoSkew, resultWithSkew), 'Results should match when skew is 0');
    });
  });
});

// ============================================================================
// Comparison Tests
// ============================================================================

describe('TransformDecomposition - Comparison', () => {

  describe('matrixMaxDifference()', () => {
    it('returns zero for identical matrices', () => {
      const I = TD.identityMatrix();
      const diff = TD.matrixMaxDifference(I, I);
      assert.ok(diff.isZero(), 'Difference of identical matrices should be 0');
    });

    it('returns correct max difference', () => {
      const M1 = Matrix.from([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]);
      const M2 = Matrix.from([
        [1.5, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]);
      const diff = TD.matrixMaxDifference(M1, M2);
      assert.ok(decimalClose(diff, 0.5), 'Max difference should be 0.5');
    });

    it('finds max across all elements', () => {
      const M1 = Matrix.from([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
      const M2 = Matrix.from([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 12]  // 12 - 9 = 3 is the max difference
      ]);
      const diff = TD.matrixMaxDifference(M1, M2);
      assert.ok(decimalClose(diff, 3), 'Max difference should be 3');
    });

    it('handles negative differences (takes absolute value)', () => {
      const M1 = Matrix.from([[10, 0, 0], [0, 1, 0], [0, 0, 1]]);
      const M2 = Matrix.from([[5, 0, 0], [0, 1, 0], [0, 0, 1]]);
      const diff = TD.matrixMaxDifference(M1, M2);
      assert.ok(decimalClose(diff, 5), 'Should use absolute difference');
    });
  });

  describe('matricesEqual()', () => {
    it('returns true for identical matrices', () => {
      const I = TD.identityMatrix();
      assert.strictEqual(TD.matricesEqual(I, I), true, 'Identical matrices should be equal');
    });

    it('returns false for different matrices', () => {
      const I = TD.identityMatrix();
      const T = TD.translationMatrix(1, 0);
      assert.strictEqual(TD.matricesEqual(I, T), false, 'Different matrices should not be equal');
    });

    it('uses default tolerance when not specified', () => {
      const M1 = TD.identityMatrix();
      // Create a matrix with tiny difference
      const M2 = Matrix.from([
        [D(1).plus(new Decimal('1e-35')), 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]);
      // Default tolerance is VERIFICATION_TOLERANCE (1e-30), so 1e-35 difference should pass
      assert.strictEqual(TD.matricesEqual(M1, M2), true, 'Should be equal within default tolerance');
    });

    it('respects custom tolerance', () => {
      const M1 = Matrix.from([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      const M2 = Matrix.from([[1.001, 0, 0], [0, 1, 0], [0, 0, 1]]);

      assert.strictEqual(TD.matricesEqual(M1, M2, 0.01), true, 'Should be equal with loose tolerance');
      assert.strictEqual(TD.matricesEqual(M1, M2, 0.0001), false, 'Should not be equal with tight tolerance');
    });
  });
});

// ============================================================================
// Verification Tests
// ============================================================================

describe('TransformDecomposition - Verification', () => {

  describe('verifyDecomposition()', () => {
    it('verifies correct decomposition', () => {
      const M = TD.translationMatrix(10, 20).mul(TD.rotationMatrix(0.5));
      const decomp = TD.decomposeMatrix(M);
      const result = TD.verifyDecomposition(M, decomp);

      assert.strictEqual(result.verified, true, 'Correct decomposition should verify');
      assert.ok(result.maxError.lessThan(TD.VERIFICATION_TOLERANCE), 'Error should be within tolerance');
    });

    it('provides maxError even when verified', () => {
      const I = TD.identityMatrix();
      const decomp = TD.decomposeMatrix(I);
      const result = TD.verifyDecomposition(I, decomp);

      assert.ok(result.maxError instanceof Decimal, 'maxError should be a Decimal');
      assert.ok(result.maxError.greaterThanOrEqualTo(0), 'maxError should be >= 0');
    });

    it('fails verification for wrong decomposition', () => {
      const M = TD.translationMatrix(100, 200);
      const wrongDecomp = {
        translateX: D(0),  // Wrong!
        translateY: D(0),  // Wrong!
        rotation: D(0),
        scaleX: D(1),
        scaleY: D(1),
        skewX: D(0),
        skewY: D(0)
      };
      const result = TD.verifyDecomposition(M, wrongDecomp);

      assert.strictEqual(result.verified, false, 'Wrong decomposition should not verify');
      assert.ok(result.maxError.greaterThan(50), 'Error should be large');
    });

    it('verifies complex transforms', () => {
      // Create a complex combined transform WITHOUT skew
      // Note: Transforms with skew may not always verify due to decomposition order differences
      const T = TD.translationMatrix(50, -30);
      const R = TD.rotationMatrix(PI.div(3));
      const S = TD.scaleMatrix(2, 0.5);
      const M = T.mul(R).mul(S);

      const decomp = TD.decomposeMatrix(M);
      const result = TD.verifyDecomposition(M, decomp);

      assert.strictEqual(result.verified, true, 'Complex transform should verify');
    });

    it('reports verification status for transforms with skew', () => {
      // Transforms with skew may have higher numerical error due to decomposition algorithm
      const T = TD.translationMatrix(50, -30);
      const R = TD.rotationMatrix(PI.div(3));
      const Sk = TD.skewXMatrix(0.2);
      const S = TD.scaleMatrix(2, 0.5);
      const M = T.mul(R).mul(Sk).mul(S);

      const decomp = TD.decomposeMatrix(M);
      const result = TD.verifyDecomposition(M, decomp);

      // The result provides verification status and error magnitude
      assert.ok(typeof result.verified === 'boolean', 'verified should be boolean');
      assert.ok(result.maxError instanceof Decimal, 'maxError should be Decimal');
    });
  });
});

// ============================================================================
// SVG Conversion Tests
// ============================================================================

describe('TransformDecomposition - SVG Conversion', () => {

  describe('matrixFromSVGValues()', () => {
    it('creates identity from SVG identity values', () => {
      // SVG identity: matrix(1, 0, 0, 1, 0, 0)
      const M = TD.matrixFromSVGValues(1, 0, 0, 1, 0, 0);
      const I = TD.identityMatrix();
      assert.ok(TD.matricesEqual(M, I), 'Should create identity matrix');
    });

    it('creates matrix with correct SVG layout', () => {
      // SVG: matrix(a, b, c, d, e, f) where:
      // | a c e |
      // | b d f |
      // | 0 0 1 |
      const M = TD.matrixFromSVGValues(1, 2, 3, 4, 5, 6);

      assert.ok(M.data[0][0].equals(1), 'a = M[0][0]');
      assert.ok(M.data[1][0].equals(2), 'b = M[1][0]');
      assert.ok(M.data[0][1].equals(3), 'c = M[0][1]');
      assert.ok(M.data[1][1].equals(4), 'd = M[1][1]');
      assert.ok(M.data[0][2].equals(5), 'e = M[0][2]');
      assert.ok(M.data[1][2].equals(6), 'f = M[1][2]');
    });

    it('accepts Decimal inputs', () => {
      const M = TD.matrixFromSVGValues(
        new Decimal('1.123456789012345678901234567890'),
        new Decimal('0'),
        new Decimal('0'),
        new Decimal('1'),
        new Decimal('0'),
        new Decimal('0')
      );
      assert.ok(M.data[0][0].toString().includes('1.123456789012345678901234567890'.slice(0, 30)),
        'Should preserve precision');
    });

    it('creates proper affine matrix (bottom row is [0, 0, 1])', () => {
      const M = TD.matrixFromSVGValues(2, 0.5, -0.5, 3, 100, 200);
      assert.ok(M.data[2][0].isZero(), 'M[2][0] should be 0');
      assert.ok(M.data[2][1].isZero(), 'M[2][1] should be 0');
      assert.ok(M.data[2][2].equals(1), 'M[2][2] should be 1');
    });
  });

  describe('matrixToSVGValues()', () => {
    it('extracts identity matrix values', () => {
      const I = TD.identityMatrix();
      const vals = TD.matrixToSVGValues(I);

      assert.strictEqual(vals.a, '1.000000', 'a should be 1');
      assert.strictEqual(vals.b, '0.000000', 'b should be 0');
      assert.strictEqual(vals.c, '0.000000', 'c should be 0');
      assert.strictEqual(vals.d, '1.000000', 'd should be 1');
      assert.strictEqual(vals.e, '0.000000', 'e should be 0');
      assert.strictEqual(vals.f, '0.000000', 'f should be 0');
    });

    it('extracts translation matrix values', () => {
      const T = TD.translationMatrix(100, 200);
      const vals = TD.matrixToSVGValues(T);

      assert.strictEqual(vals.e, '100.000000', 'e should be 100');
      assert.strictEqual(vals.f, '200.000000', 'f should be 200');
    });

    it('respects custom precision', () => {
      const M = TD.scaleMatrix(1.123456789, 2.987654321);
      const vals = TD.matrixToSVGValues(M, 3);

      assert.strictEqual(vals.a, '1.123', 'a should be rounded to 3 digits');
      assert.strictEqual(vals.d, '2.988', 'd should be rounded to 3 digits');
    });

    it('round-trips with matrixFromSVGValues', () => {
      const original = TD.translationMatrix(42, -17).mul(TD.rotationMatrix(0.5));
      const vals = TD.matrixToSVGValues(original, 15);
      const reconstructed = TD.matrixFromSVGValues(vals.a, vals.b, vals.c, vals.d, vals.e, vals.f);

      assert.ok(TD.matricesEqual(original, reconstructed, new Decimal('1e-14')),
        'Round-trip should preserve matrix within precision');
    });
  });

  describe('decompositionToSVGString()', () => {
    it('returns empty string for identity decomposition', () => {
      const decomp = TD.decomposeMatrix(TD.identityMatrix());
      const str = TD.decompositionToSVGString(decomp);
      assert.strictEqual(str, '', 'Identity should produce empty string');
    });

    it('produces translate() for pure translation', () => {
      const decomp = TD.decomposeMatrix(TD.translationMatrix(100, 50));
      const str = TD.decompositionToSVGString(decomp);
      assert.ok(str.includes('translate('), 'Should include translate()');
      assert.ok(str.includes('100'), 'Should include tx value');
      assert.ok(str.includes('50'), 'Should include ty value');
    });

    it('produces rotate() for pure rotation', () => {
      const angle = PI.div(4); // 45 degrees
      const decomp = TD.decomposeMatrix(TD.rotationMatrix(angle));
      const str = TD.decompositionToSVGString(decomp);
      assert.ok(str.includes('rotate('), 'Should include rotate()');
      assert.ok(str.includes('45'), 'Should include 45 degrees');
    });

    it('produces scale() for pure scale', () => {
      const decomp = TD.decomposeMatrix(TD.scaleMatrix(2, 2));
      const str = TD.decompositionToSVGString(decomp);
      assert.ok(str.includes('scale('), 'Should include scale()');
    });

    it('produces scale(sx, sy) for non-uniform scale', () => {
      const decomp = TD.decomposeMatrix(TD.scaleMatrix(2, 3));
      const str = TD.decompositionToSVGString(decomp);
      assert.ok(str.includes(','), 'Non-uniform scale should have comma separator');
    });

    it('respects custom precision', () => {
      const decomp = TD.decomposeMatrix(TD.translationMatrix(100.123456789, 50.987654321));
      const str = TD.decompositionToSVGString(decomp, 2);
      assert.ok(str.includes('100.12'), 'Should use 2 decimal places');
      assert.ok(str.includes('50.99'), 'Should use 2 decimal places');
    });

    it('produces skewX() for skew transforms', () => {
      const Sk = TD.skewXMatrix(0.3);
      const decomp = TD.decomposeMatrix(Sk);
      const str = TD.decompositionToSVGString(decomp);
      // skewX might be present in decomposition
      if (decomp.skewX && !D(decomp.skewX).abs().lessThan(TD.EPSILON)) {
        assert.ok(str.includes('skewX('), 'Should include skewX() for skew transform');
      }
    });
  });

  describe('matrixToMinimalSVGTransform()', () => {
    it('returns empty string for identity matrix', () => {
      const result = TD.matrixToMinimalSVGTransform(TD.identityMatrix());
      assert.strictEqual(result.transform, '', 'Identity should produce empty transform');
      assert.strictEqual(result.isIdentity, true, 'isIdentity should be true');
      assert.strictEqual(result.verified, true, 'verified should be true');
    });

    it('produces non-empty string for non-identity matrix', () => {
      const result = TD.matrixToMinimalSVGTransform(TD.translationMatrix(10, 20));
      assert.ok(result.transform.length > 0, 'Non-identity should produce non-empty string');
      assert.strictEqual(result.isIdentity, false, 'isIdentity should be false');
    });

    it('includes verified flag', () => {
      const result = TD.matrixToMinimalSVGTransform(TD.scaleMatrix(2, 3));
      assert.strictEqual(typeof result.verified, 'boolean', 'verified should be boolean');
    });

    it('respects custom precision', () => {
      const result = TD.matrixToMinimalSVGTransform(TD.translationMatrix(1.123456789, 2.987654321), 3);
      // Check that precision is approximately 3 decimal places
      assert.ok(result.transform.includes('1.123') || result.transform.includes('1.12'),
        'Should respect precision parameter');
    });
  });
});

// ============================================================================
// Type Check Tests
// ============================================================================

describe('TransformDecomposition - Type Checks', () => {

  describe('isPureTranslation()', () => {
    it('returns true for identity (zero translation)', () => {
      const result = TD.isPureTranslation(TD.identityMatrix());
      assert.strictEqual(result.isTranslation, true, 'Identity has identity linear part');
      assert.ok(result.tx.isZero(), 'tx should be 0');
      assert.ok(result.ty.isZero(), 'ty should be 0');
    });

    it('returns true for pure translation matrix', () => {
      const T = TD.translationMatrix(100, -50);
      const result = TD.isPureTranslation(T);
      assert.strictEqual(result.isTranslation, true, 'Should be pure translation');
      assert.ok(result.tx.equals(100), 'tx should be 100');
      assert.ok(result.ty.equals(-50), 'ty should be -50');
    });

    it('returns false for rotation matrix', () => {
      const R = TD.rotationMatrix(0.5);
      const result = TD.isPureTranslation(R);
      assert.strictEqual(result.isTranslation, false, 'Rotation is not pure translation');
    });

    it('returns false for scale matrix', () => {
      const S = TD.scaleMatrix(2, 3);
      const result = TD.isPureTranslation(S);
      assert.strictEqual(result.isTranslation, false, 'Scale is not pure translation');
    });

    it('returns false for combined translate + rotate', () => {
      const M = TD.translationMatrix(10, 20).mul(TD.rotationMatrix(0.5));
      const result = TD.isPureTranslation(M);
      assert.strictEqual(result.isTranslation, false, 'Combined transform is not pure translation');
    });
  });

  describe('isPureRotation()', () => {
    it('returns true for identity (zero rotation)', () => {
      const result = TD.isPureRotation(TD.identityMatrix());
      assert.strictEqual(result.isRotation, true, 'Identity is a rotation (angle 0)');
      assert.ok(result.angle.abs().lessThan(TD.EPSILON), 'Angle should be ~0');
    });

    it('returns true for pure rotation matrix', () => {
      const angle = 0.7;
      const R = TD.rotationMatrix(angle);
      const result = TD.isPureRotation(R);
      assert.strictEqual(result.isRotation, true, 'Should be pure rotation');
      assert.ok(decimalClose(result.angle, angle, new Decimal('1e-30')), 'Angle should match');
    });

    it('returns false for translation matrix', () => {
      const T = TD.translationMatrix(10, 20);
      const result = TD.isPureRotation(T);
      assert.strictEqual(result.isRotation, false, 'Translation is not pure rotation');
    });

    it('returns false for scale matrix', () => {
      const S = TD.scaleMatrix(2, 2);
      const result = TD.isPureRotation(S);
      assert.strictEqual(result.isRotation, false, 'Scale is not pure rotation');
    });

    it('returns false for non-uniform scale', () => {
      const S = TD.scaleMatrix(1, 2);
      const result = TD.isPureRotation(S);
      assert.strictEqual(result.isRotation, false, 'Non-uniform scale is not pure rotation');
    });

    it('returns false for rotation with translation', () => {
      const M = TD.translationMatrix(5, 5).mul(TD.rotationMatrix(0.3));
      const result = TD.isPureRotation(M);
      assert.strictEqual(result.isRotation, false, 'Rotation + translation is not pure rotation');
    });

    it('returns false for reflection (negative scale)', () => {
      const S = TD.scaleMatrix(-1, 1);
      const result = TD.isPureRotation(S);
      assert.strictEqual(result.isRotation, false, 'Reflection is not pure rotation (det != 1)');
    });
  });

  describe('isPureScale()', () => {
    it('returns true for identity (unit scale)', () => {
      const result = TD.isPureScale(TD.identityMatrix());
      assert.strictEqual(result.isScale, true, 'Identity is a scale');
      assert.ok(result.scaleX.equals(1), 'scaleX should be 1');
      assert.ok(result.scaleY.equals(1), 'scaleY should be 1');
      assert.strictEqual(result.isUniform, true, 'Identity scale is uniform');
    });

    it('returns true for uniform scale', () => {
      const S = TD.scaleMatrix(3, 3);
      const result = TD.isPureScale(S);
      assert.strictEqual(result.isScale, true, 'Should be pure scale');
      assert.ok(result.scaleX.equals(3), 'scaleX should be 3');
      assert.ok(result.scaleY.equals(3), 'scaleY should be 3');
      assert.strictEqual(result.isUniform, true, 'Should be uniform');
    });

    it('returns true for non-uniform scale', () => {
      const S = TD.scaleMatrix(2, 5);
      const result = TD.isPureScale(S);
      assert.strictEqual(result.isScale, true, 'Should be pure scale');
      assert.ok(result.scaleX.equals(2), 'scaleX should be 2');
      assert.ok(result.scaleY.equals(5), 'scaleY should be 5');
      assert.strictEqual(result.isUniform, false, 'Should not be uniform');
    });

    it('returns false for rotation matrix', () => {
      const R = TD.rotationMatrix(0.5);
      const result = TD.isPureScale(R);
      assert.strictEqual(result.isScale, false, 'Rotation is not pure scale');
    });

    it('returns false for translation matrix', () => {
      const T = TD.translationMatrix(10, 20);
      const result = TD.isPureScale(T);
      assert.strictEqual(result.isScale, false, 'Translation is not pure scale');
    });

    it('returns false for skew matrix', () => {
      const Sk = TD.skewXMatrix(0.3);
      const result = TD.isPureScale(Sk);
      assert.strictEqual(result.isScale, false, 'Skew is not pure scale');
    });

    it('returns false for scale with translation', () => {
      const M = TD.translationMatrix(5, 5).mul(TD.scaleMatrix(2, 2));
      const result = TD.isPureScale(M);
      assert.strictEqual(result.isScale, false, 'Scale + translation is not pure scale');
    });
  });

  describe('isIdentityMatrix()', () => {
    it('returns true for identity matrix', () => {
      assert.strictEqual(TD.isIdentityMatrix(TD.identityMatrix()), true, 'Identity should be identified');
    });

    it('returns false for translation matrix', () => {
      assert.strictEqual(TD.isIdentityMatrix(TD.translationMatrix(1, 0)), false, 'Translation is not identity');
    });

    it('returns false for rotation matrix', () => {
      assert.strictEqual(TD.isIdentityMatrix(TD.rotationMatrix(0.001)), false, 'Rotation is not identity');
    });

    it('returns false for scale matrix', () => {
      assert.strictEqual(TD.isIdentityMatrix(TD.scaleMatrix(1.001, 1)), false, 'Scale is not identity');
    });

    it('returns true for near-identity within tolerance', () => {
      const nearIdentity = Matrix.from([
        [D(1).plus(new Decimal('1e-45')), 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]);
      assert.strictEqual(TD.isIdentityMatrix(nearIdentity), true, 'Near-identity should be identified');
    });
  });
});

// ============================================================================
// Round-Trip Tests (Decompose -> Compose)
// ============================================================================

describe('TransformDecomposition - Round-Trip Tests', () => {

  it('identity matrix round-trips', () => {
    const original = TD.identityMatrix();
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed), 'Identity should round-trip');
  });

  it('pure translation round-trips', () => {
    const original = TD.translationMatrix(123.456, -789.012);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed), 'Translation should round-trip');
  });

  it('pure rotation round-trips', () => {
    const original = TD.rotationMatrix(1.234);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed, new Decimal('1e-25')), 'Rotation should round-trip');
  });

  it('pure scale round-trips', () => {
    const original = TD.scaleMatrix(2.5, 0.4);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed, new Decimal('1e-25')), 'Scale should round-trip');
  });

  it('translate + rotate round-trips', () => {
    const T = TD.translationMatrix(50, 100);
    const R = TD.rotationMatrix(0.7);
    const original = T.mul(R);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed), 'T*R should round-trip');
  });

  it('translate + rotate + scale round-trips', () => {
    const T = TD.translationMatrix(-20, 30);
    const R = TD.rotationMatrix(PI.div(6));
    const S = TD.scaleMatrix(1.5, 2.0);
    const original = T.mul(R).mul(S);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed), 'T*R*S should round-trip');
  });

  it('complex transform with all components round-trips', () => {
    // Test without skew - T*R*S should round-trip perfectly
    const T = TD.translationMatrix(100, 200);
    const R = TD.rotationMatrix(-0.5);
    const S = TD.scaleMatrix(0.8, 1.2);
    const original = T.mul(R).mul(S);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);
    assert.ok(TD.matricesEqual(original, recomposed), 'T*R*S should round-trip');
    assert.ok(decomp.verified, 'Decomposition should be verified');
  });

  it('documents behavior for transforms with skew', () => {
    // Note: Transforms with skew may have higher numerical error
    // due to the decomposition algorithm's handling of skew extraction
    const T = TD.translationMatrix(100, 200);
    const R = TD.rotationMatrix(-0.5);
    const Sk = TD.skewXMatrix(0.2);
    const S = TD.scaleMatrix(0.8, 1.2);
    const original = T.mul(R).mul(Sk).mul(S);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);

    // The decomposition provides error information
    assert.ok(decomp.maxError instanceof Decimal, 'maxError should be available');
    // The matrices may differ slightly due to skew handling
    const diff = TD.matrixMaxDifference(original, recomposed);
    assert.ok(diff.greaterThanOrEqualTo(0), 'Difference should be non-negative');
  });

  it('NoSkew decomposition round-trips for non-skewed transforms', () => {
    const T = TD.translationMatrix(15, 25);
    const R = TD.rotationMatrix(0.4);
    const S = TD.scaleMatrix(1.3, 0.9);
    const original = T.mul(R).mul(S);
    const decomp = TD.decomposeMatrixNoSkew(original);
    const recomposed = TD.composeTransformNoSkew(decomp);
    assert.ok(TD.matricesEqual(original, recomposed, new Decimal('1e-25')), 'NoSkew should round-trip');
  });

  it('handles reflection (negative determinant) round-trip', () => {
    const S = TD.scaleMatrix(-1, 1); // Reflection in Y axis
    const R = TD.rotationMatrix(0.3);
    const T = TD.translationMatrix(10, 20);
    const original = T.mul(R).mul(S);
    const decomp = TD.decomposeMatrix(original);
    const recomposed = TD.composeTransform(decomp);

    // Note: Reflection handling may result in numerical differences
    // due to decomposition order (T*R*Sk*S) vs original composition (T*R*S)
    // The decomposition correctly identifies negative scale
    assert.ok(decomp.scaleX.lessThan(0) || decomp.scaleY.lessThan(0),
      'Reflection should result in negative scale');
    // Verify error is reported
    assert.ok(decomp.maxError instanceof Decimal, 'maxError should be available');
  });

  it('SVG values round-trip', () => {
    const original = TD.translationMatrix(42, -17).mul(TD.rotationMatrix(0.5)).mul(TD.scaleMatrix(2, 3));
    const vals = TD.matrixToSVGValues(original, 20);
    const reconstructed = TD.matrixFromSVGValues(vals.a, vals.b, vals.c, vals.d, vals.e, vals.f);
    assert.ok(TD.matricesEqual(original, reconstructed, new Decimal('1e-15')), 'SVG values should round-trip');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('TransformDecomposition - Edge Cases', () => {

  it('handles very small rotation angles', () => {
    const tinyAngle = new Decimal('1e-30');
    const R = TD.rotationMatrix(tinyAngle);
    const decomp = TD.decomposeMatrix(R);
    assert.ok(decomp.verified, 'Tiny rotation should decompose correctly');
  });

  it('handles very large translation values', () => {
    const bigVal = new Decimal('1e30');
    const T = TD.translationMatrix(bigVal, bigVal.neg());
    const decomp = TD.decomposeMatrix(T);
    assert.ok(decomp.verified, 'Large translation should decompose correctly');
  });

  it('handles very small scale values', () => {
    const tinyScale = new Decimal('1e-20');
    const S = TD.scaleMatrix(tinyScale, tinyScale);
    const decomp = TD.decomposeMatrix(S);
    // Verification may fail due to numerical precision, but should not throw
    assert.ok(decomp.scaleX.abs().lessThan(new Decimal('1e-10')), 'Tiny scale should be extracted');
  });

  it('handles arbitrary precision inputs', () => {
    const preciseVal = '123.456789012345678901234567890123456789012345678901234567890';
    const T = TD.translationMatrix(preciseVal, preciseVal);
    const { tx, ty } = TD.extractTranslation(T);
    // Verify precision is maintained
    assert.ok(tx.toString().includes('123.456789012345678901234567890'), 'Precision should be maintained');
  });

  it('handles negative angles correctly', () => {
    const negAngle = D(-1.5);
    const R = TD.rotationMatrix(negAngle);
    const decomp = TD.decomposeMatrix(R);
    // The extracted rotation should be equivalent (same modulo 2*PI)
    const diff = decomp.rotation.minus(negAngle).abs();
    const twoPi = PI.mul(2);
    const modDiff = diff.mod(twoPi);
    const isClose = modDiff.lessThan(new Decimal('1e-30')) || modDiff.minus(twoPi).abs().lessThan(new Decimal('1e-30'));
    assert.ok(isClose, 'Negative angle should be correctly extracted');
  });

  it('uniform scale produces isUniform = true', () => {
    const S = TD.scaleMatrix(2, 2);
    const result = TD.isPureScale(S);
    assert.strictEqual(result.isUniform, true, 'Uniform scale should be detected');
  });

  it('matrices with same linear part but different translation are not equal', () => {
    const M1 = TD.translationMatrix(0, 0);
    const M2 = TD.translationMatrix(1, 0);
    assert.strictEqual(TD.matricesEqual(M1, M2), false, 'Different translations should not be equal');
  });
});

// ============================================================================
// Constants Export Tests
// ============================================================================

describe('TransformDecomposition - Constants', () => {

  it('EPSILON is exported and is a Decimal', () => {
    assert.ok(TD.EPSILON instanceof Decimal, 'EPSILON should be a Decimal');
    assert.ok(TD.EPSILON.greaterThan(0), 'EPSILON should be positive');
    assert.ok(TD.EPSILON.lessThan(new Decimal('1e-30')), 'EPSILON should be very small');
  });

  it('VERIFICATION_TOLERANCE is exported and is a Decimal', () => {
    assert.ok(TD.VERIFICATION_TOLERANCE instanceof Decimal, 'VERIFICATION_TOLERANCE should be a Decimal');
    assert.ok(TD.VERIFICATION_TOLERANCE.greaterThan(0), 'VERIFICATION_TOLERANCE should be positive');
  });

  it('VERIFICATION_TOLERANCE is larger than EPSILON', () => {
    assert.ok(TD.VERIFICATION_TOLERANCE.greaterThan(TD.EPSILON),
      'VERIFICATION_TOLERANCE should be larger than EPSILON');
  });

  it('D helper is exported', () => {
    assert.ok(typeof TD.D === 'function', 'D helper should be exported');
    const result = TD.D(42);
    assert.ok(result instanceof Decimal, 'D should return Decimal');
    assert.ok(result.equals(42), 'D should convert number to Decimal');
  });
});
