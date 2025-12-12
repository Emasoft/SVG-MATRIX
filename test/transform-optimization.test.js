/**
 * Unit tests for transform-optimization.js
 *
 * Tests all transform optimization functions including:
 * - Matrix utilities (identity, translation, rotation, scale)
 * - Transform merging (mergeTranslations, mergeRotations, mergeScales)
 * - Matrix to transform conversion (matrixToTranslate, matrixToRotate, matrixToScale)
 * - Transform list optimization (removeIdentityTransforms, shortRotate, optimizeTransformList)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import * as TransformOpt from '../src/transform-optimization.js';
import { Matrix } from '../src/matrix.js';

// Set precision for tests
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

describe('TransformOptimization', () => {

  describe('matrix utilities', () => {
    describe('identityMatrix', () => {
      it('should create 3x3 identity matrix', () => {
        const I = TransformOpt.identityMatrix();
        assert.equal(I.rows, 3, 'should have 3 rows');
        assert.equal(I.cols, 3, 'should have 3 cols');
        assert.ok(I.data[0][0].equals(1), '[0][0] = 1');
        assert.ok(I.data[1][1].equals(1), '[1][1] = 1');
        assert.ok(I.data[2][2].equals(1), '[2][2] = 1');
        assert.ok(I.data[0][1].isZero(), '[0][1] = 0');
        assert.ok(I.data[1][0].isZero(), '[1][0] = 0');
      });
    });

    describe('translationMatrix', () => {
      it('should create translation matrix', () => {
        const T = TransformOpt.translationMatrix(10, 20);
        assert.ok(T.data[0][2].equals(10), 'tx = 10');
        assert.ok(T.data[1][2].equals(20), 'ty = 20');
        assert.ok(T.data[0][0].equals(1), 'linear part is identity');
        assert.ok(T.data[1][1].equals(1), 'linear part is identity');
      });

      it('should handle negative translations', () => {
        const T = TransformOpt.translationMatrix(-5, -15);
        assert.ok(T.data[0][2].equals(-5), 'tx = -5');
        assert.ok(T.data[1][2].equals(-15), 'ty = -15');
      });

      it('should handle high precision values', () => {
        const tx = '10.123456789012345678901234567890';
        const T = TransformOpt.translationMatrix(tx, 0);
        assert.ok(T.data[0][2].toString().includes('123456789012345678901234'), 'preserves precision');
      });
    });

    describe('rotationMatrix', () => {
      it('should create rotation matrix for 0 degrees', () => {
        const R = TransformOpt.rotationMatrix(0);
        assert.ok(R.data[0][0].minus(1).abs().lessThan(D('1e-40')), 'cos(0) = 1');
        assert.ok(R.data[0][1].abs().lessThan(D('1e-40')), 'sin(0) = 0');
      });

      it('should create rotation matrix for 90 degrees', () => {
        const R = TransformOpt.rotationMatrix(Math.PI / 2);
        assert.ok(R.data[0][0].abs().lessThan(D('1e-10')), 'cos(90) ~ 0');
        assert.ok(R.data[1][0].minus(1).abs().lessThan(D('1e-10')), 'sin(90) ~ 1');
      });

      it('should create rotation matrix for 180 degrees', () => {
        const R = TransformOpt.rotationMatrix(Math.PI);
        assert.ok(R.data[0][0].plus(1).abs().lessThan(D('1e-10')), 'cos(180) ~ -1');
        assert.ok(R.data[0][1].abs().lessThan(D('1e-10')), 'sin(180) ~ 0');
      });

      it('should have no translation component', () => {
        const R = TransformOpt.rotationMatrix(Math.PI / 4);
        assert.ok(R.data[0][2].isZero(), 'tx = 0');
        assert.ok(R.data[1][2].isZero(), 'ty = 0');
      });
    });

    describe('rotationMatrixAroundPoint', () => {
      it('should rotate around origin same as rotationMatrix', () => {
        const R1 = TransformOpt.rotationMatrix(Math.PI / 4);
        const R2 = TransformOpt.rotationMatrixAroundPoint(Math.PI / 4, 0, 0);
        assert.ok(TransformOpt.matricesEqual(R1, R2, D('1e-30')), 'should match');
      });

      it('should rotate around non-origin point', () => {
        const R = TransformOpt.rotationMatrixAroundPoint(Math.PI / 2, 5, 5);
        // The matrix should be: T(5,5) * R(90) * T(-5,-5)
        // Point (5, 5) should map to itself
        const pt = [D(5), D(5), D(1)];
        const result = [
          R.data[0][0].mul(pt[0]).plus(R.data[0][1].mul(pt[1])).plus(R.data[0][2]),
          R.data[1][0].mul(pt[0]).plus(R.data[1][1].mul(pt[1])).plus(R.data[1][2])
        ];
        assert.ok(result[0].minus(5).abs().lessThan(D('1e-10')), 'center x unchanged');
        assert.ok(result[1].minus(5).abs().lessThan(D('1e-10')), 'center y unchanged');
      });
    });

    describe('scaleMatrix', () => {
      it('should create scale matrix', () => {
        const S = TransformOpt.scaleMatrix(2, 3);
        assert.ok(S.data[0][0].equals(2), 'sx = 2');
        assert.ok(S.data[1][1].equals(3), 'sy = 3');
        assert.ok(S.data[0][1].isZero(), 'off-diagonal = 0');
        assert.ok(S.data[1][0].isZero(), 'off-diagonal = 0');
      });

      it('should handle negative scales (reflection)', () => {
        const S = TransformOpt.scaleMatrix(-1, 1);
        assert.ok(S.data[0][0].equals(-1), 'sx = -1 (horizontal flip)');
        assert.ok(S.data[1][1].equals(1), 'sy = 1');
      });

      it('should have no translation component', () => {
        const S = TransformOpt.scaleMatrix(2, 2);
        assert.ok(S.data[0][2].isZero(), 'tx = 0');
        assert.ok(S.data[1][2].isZero(), 'ty = 0');
      });
    });

    describe('matrixMaxDifference', () => {
      it('should return 0 for identical matrices', () => {
        const M = TransformOpt.translationMatrix(5, 10);
        const diff = TransformOpt.matrixMaxDifference(M, M);
        assert.ok(diff.isZero(), 'difference should be 0');
      });

      it('should return max element difference', () => {
        const M1 = TransformOpt.translationMatrix(5, 10);
        const M2 = TransformOpt.translationMatrix(8, 10);
        const diff = TransformOpt.matrixMaxDifference(M1, M2);
        assert.ok(diff.equals(3), 'max difference is 3');
      });
    });

    describe('matricesEqual', () => {
      it('should return true for identical matrices', () => {
        const M = TransformOpt.rotationMatrix(Math.PI / 6);
        assert.ok(TransformOpt.matricesEqual(M, M), 'matrix equals itself');
      });

      it('should return true for matrices within tolerance', () => {
        const M1 = TransformOpt.translationMatrix(5, 10);
        const M2 = TransformOpt.translationMatrix(5.0000000001, 10);
        assert.ok(TransformOpt.matricesEqual(M1, M2, D('1e-9')), 'within tolerance');
      });

      it('should return false for different matrices', () => {
        const M1 = TransformOpt.translationMatrix(5, 10);
        const M2 = TransformOpt.rotationMatrix(Math.PI / 4);
        assert.ok(!TransformOpt.matricesEqual(M1, M2), 'different matrices');
      });
    });
  });

  describe('mergeTranslations', () => {
    it('should merge two translations by adding components', () => {
      const t1 = { tx: 10, ty: 20 };
      const t2 = { tx: 5, ty: -5 };
      const result = TransformOpt.mergeTranslations(t1, t2);

      assert.ok(result.tx.equals(15), 'tx = 10 + 5 = 15');
      assert.ok(result.ty.equals(15), 'ty = 20 + (-5) = 15');
      assert.ok(result.verified, 'should be verified');
    });

    it('should verify through matrix multiplication', () => {
      const t1 = { tx: 100, ty: 50 };
      const t2 = { tx: -30, ty: 20 };
      const result = TransformOpt.mergeTranslations(t1, t2);

      assert.ok(result.verified, 'matrix verification passed');
      assert.ok(result.maxError.lessThan(D('1e-30')), 'error should be tiny');
    });

    it('should handle high precision values', () => {
      const t1 = { tx: '10.12345678901234567890', ty: '20.98765432109876543210' };
      const t2 = { tx: '5.11111111111111111111', ty: '5.22222222222222222222' };
      const result = TransformOpt.mergeTranslations(t1, t2);

      assert.ok(result.verified, 'should be verified with high precision');
    });
  });

  describe('mergeRotations', () => {
    it('should merge two rotations by adding angles', () => {
      const r1 = { angle: Math.PI / 4 }; // 45 degrees
      const r2 = { angle: Math.PI / 4 }; // 45 degrees
      const result = TransformOpt.mergeRotations(r1, r2);

      // 45 + 45 = 90 degrees = PI/2
      assert.ok(result.angle.minus(Math.PI / 2).abs().lessThan(D('1e-10')), 'angle = 90 degrees');
      assert.ok(result.verified, 'should be verified');
    });

    it('should normalize angle to [-PI, PI]', () => {
      const r1 = { angle: Math.PI * 0.9 };
      const r2 = { angle: Math.PI * 0.9 };
      const result = TransformOpt.mergeRotations(r1, r2);

      // 0.9*PI + 0.9*PI = 1.8*PI, normalized to 1.8*PI - 2*PI = -0.2*PI
      const expected = D(Math.PI * -0.2);
      assert.ok(result.angle.minus(expected).abs().lessThan(D('1e-10')), 'angle normalized');
      assert.ok(result.verified, 'should be verified');
    });

    it('should verify through matrix multiplication', () => {
      const r1 = { angle: 0.5 };
      const r2 = { angle: 0.7 };
      const result = TransformOpt.mergeRotations(r1, r2);

      assert.ok(result.verified, 'matrix verification passed');
      assert.ok(result.maxError.lessThan(D('1e-20')), 'error should be small');
    });
  });

  describe('mergeScales', () => {
    it('should merge two scales by multiplying components', () => {
      const s1 = { sx: 2, sy: 3 };
      const s2 = { sx: 1.5, sy: 0.5 };
      const result = TransformOpt.mergeScales(s1, s2);

      assert.ok(result.sx.equals(3), 'sx = 2 * 1.5 = 3');
      assert.ok(result.sy.equals(1.5), 'sy = 3 * 0.5 = 1.5');
      assert.ok(result.verified, 'should be verified');
    });

    it('should handle negative scales', () => {
      const s1 = { sx: -1, sy: 1 };
      const s2 = { sx: 2, sy: 2 };
      const result = TransformOpt.mergeScales(s1, s2);

      assert.ok(result.sx.equals(-2), 'sx = -1 * 2 = -2');
      assert.ok(result.sy.equals(2), 'sy = 1 * 2 = 2');
      assert.ok(result.verified, 'should be verified');
    });

    it('should verify through matrix multiplication', () => {
      const s1 = { sx: 2, sy: 3 };
      const s2 = { sx: 4, sy: 5 };
      const result = TransformOpt.mergeScales(s1, s2);

      assert.ok(result.verified, 'matrix verification passed');
      assert.ok(result.maxError.lessThan(D('1e-30')), 'error should be tiny');
    });
  });

  describe('matrixToTranslate', () => {
    it('should detect pure translation matrix', () => {
      const T = TransformOpt.translationMatrix(15, 25);
      const result = TransformOpt.matrixToTranslate(T);

      assert.ok(result.isTranslation, 'should be detected as translation');
      assert.ok(result.tx.equals(15), 'tx = 15');
      assert.ok(result.ty.equals(25), 'ty = 25');
      assert.ok(result.verified, 'should be verified');
    });

    it('should reject rotation matrix', () => {
      const R = TransformOpt.rotationMatrix(Math.PI / 4);
      const result = TransformOpt.matrixToTranslate(R);

      assert.ok(!result.isTranslation, 'rotation is not translation');
    });

    it('should reject scale matrix', () => {
      const S = TransformOpt.scaleMatrix(2, 3);
      const result = TransformOpt.matrixToTranslate(S);

      assert.ok(!result.isTranslation, 'scale is not translation');
    });

    it('should detect identity as translation(0,0)', () => {
      const I = TransformOpt.identityMatrix();
      const result = TransformOpt.matrixToTranslate(I);

      assert.ok(result.isTranslation, 'identity is translation(0,0)');
      assert.ok(result.tx.isZero(), 'tx = 0');
      assert.ok(result.ty.isZero(), 'ty = 0');
    });
  });

  describe('matrixToRotate', () => {
    it('should detect pure rotation matrix', () => {
      const angle = Math.PI / 6; // 30 degrees
      const R = TransformOpt.rotationMatrix(angle);
      const result = TransformOpt.matrixToRotate(R);

      assert.ok(result.isRotation, 'should be detected as rotation');
      assert.ok(result.angle.minus(angle).abs().lessThan(D('1e-10')), 'angle correct');
      assert.ok(result.verified, 'should be verified');
    });

    it('should reject translation matrix', () => {
      const T = TransformOpt.translationMatrix(10, 20);
      const result = TransformOpt.matrixToRotate(T);

      assert.ok(!result.isRotation, 'translation is not rotation');
    });

    it('should reject non-uniform scale matrix', () => {
      const S = TransformOpt.scaleMatrix(2, 3);
      const result = TransformOpt.matrixToRotate(S);

      assert.ok(!result.isRotation, 'non-uniform scale is not rotation');
    });

    it('should reject scale matrix even if uniform', () => {
      const S = TransformOpt.scaleMatrix(2, 2);
      const result = TransformOpt.matrixToRotate(S);

      // Uniform scale has det = 4, not 1, so not a rotation
      assert.ok(!result.isRotation, 'uniform scale is not rotation');
    });

    it('should detect 0-degree rotation (identity linear part)', () => {
      const R = TransformOpt.rotationMatrix(0);
      const result = TransformOpt.matrixToRotate(R);

      assert.ok(result.isRotation, 'zero rotation is still a rotation');
      assert.ok(result.angle.abs().lessThan(D('1e-10')), 'angle ~ 0');
    });
  });

  describe('matrixToScale', () => {
    it('should detect pure scale matrix', () => {
      const S = TransformOpt.scaleMatrix(2, 3);
      const result = TransformOpt.matrixToScale(S);

      assert.ok(result.isScale, 'should be detected as scale');
      assert.ok(result.sx.equals(2), 'sx = 2');
      assert.ok(result.sy.equals(3), 'sy = 3');
      assert.ok(!result.isUniform, 'not uniform scale');
      assert.ok(result.verified, 'should be verified');
    });

    it('should detect uniform scale', () => {
      const S = TransformOpt.scaleMatrix(2, 2);
      const result = TransformOpt.matrixToScale(S);

      assert.ok(result.isScale, 'should be detected as scale');
      assert.ok(result.isUniform, 'is uniform scale');
    });

    it('should reject translation matrix', () => {
      const T = TransformOpt.translationMatrix(10, 20);
      const result = TransformOpt.matrixToScale(T);

      assert.ok(!result.isScale, 'translation is not scale');
    });

    it('should reject rotation matrix', () => {
      const R = TransformOpt.rotationMatrix(Math.PI / 4);
      const result = TransformOpt.matrixToScale(R);

      assert.ok(!result.isScale, 'rotation is not scale');
    });

    it('should detect identity as scale(1,1)', () => {
      const I = TransformOpt.identityMatrix();
      const result = TransformOpt.matrixToScale(I);

      assert.ok(result.isScale, 'identity is scale(1,1)');
      assert.ok(result.sx.equals(1), 'sx = 1');
      assert.ok(result.sy.equals(1), 'sy = 1');
      assert.ok(result.isUniform, 'is uniform');
    });
  });

  describe('removeIdentityTransforms', () => {
    it('should remove translate(0,0)', () => {
      const transforms = [
        { type: 'translate', params: { tx: 0, ty: 0 } },
        { type: 'translate', params: { tx: 5, ty: 10 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 1, 'one transform removed');
      assert.equal(result.removedCount, 1, 'removedCount = 1');
      assert.ok(result.transforms[0].params.tx.toNumber !== undefined ||
        result.transforms[0].params.tx === 5, 'remaining is non-identity');
    });

    it('should remove rotate(0)', () => {
      const transforms = [
        { type: 'rotate', params: { angle: 0 } },
        { type: 'rotate', params: { angle: Math.PI / 4 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 1, 'one transform removed');
      assert.equal(result.removedCount, 1, 'removedCount = 1');
    });

    it('should remove rotate(2*PI)', () => {
      // Use Decimal-computed TWO_PI for exact comparison
      const PI = Decimal.acos(-1);
      const TWO_PI = PI.mul(2);
      const transforms = [
        { type: 'rotate', params: { angle: TWO_PI } },
        { type: 'translate', params: { tx: 10, ty: 0 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 1, 'rotation removed');
    });

    it('should remove scale(1,1)', () => {
      const transforms = [
        { type: 'scale', params: { sx: 1, sy: 1 } },
        { type: 'scale', params: { sx: 2, sy: 2 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 1, 'one transform removed');
      assert.equal(result.removedCount, 1, 'removedCount = 1');
    });

    it('should remove identity matrix', () => {
      const transforms = [
        { type: 'matrix', params: { matrix: TransformOpt.identityMatrix() } },
        { type: 'translate', params: { tx: 5, ty: 5 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 1, 'identity matrix removed');
    });

    it('should keep all non-identity transforms', () => {
      const transforms = [
        { type: 'translate', params: { tx: 5, ty: 10 } },
        { type: 'rotate', params: { angle: 0.5 } },
        { type: 'scale', params: { sx: 2, sy: 3 } }
      ];
      const result = TransformOpt.removeIdentityTransforms(transforms);

      assert.equal(result.transforms.length, 3, 'all kept');
      assert.equal(result.removedCount, 0, 'none removed');
    });

    it('should handle empty array', () => {
      const result = TransformOpt.removeIdentityTransforms([]);
      assert.equal(result.transforms.length, 0, 'empty array unchanged');
      assert.equal(result.removedCount, 0, 'none removed');
    });
  });

  describe('shortRotate', () => {
    it('should convert translate-rotate-translate to rotate around point', () => {
      const tx = 100;
      const ty = 50;
      const angle = Math.PI / 4;

      const result = TransformOpt.shortRotate(tx, ty, angle, tx, ty);

      assert.ok(result.angle.minus(angle).abs().lessThan(D('1e-10')), 'angle preserved');
      assert.ok(result.cx.equals(tx), 'cx = tx');
      assert.ok(result.cy.equals(ty), 'cy = ty');
      assert.ok(result.verified, 'should be verified');
    });

    it('should verify through matrix comparison', () => {
      const result = TransformOpt.shortRotate(25, 75, Math.PI / 6, 25, 75);

      assert.ok(result.verified, 'matrix verification passed');
      assert.ok(result.maxError.lessThan(D('1e-20')), 'error should be small');
    });

    it('should handle origin rotation', () => {
      const result = TransformOpt.shortRotate(0, 0, Math.PI / 3, 0, 0);

      assert.ok(result.verified, 'origin rotation verified');
      assert.ok(result.cx.isZero(), 'cx = 0');
      assert.ok(result.cy.isZero(), 'cy = 0');
    });
  });

  describe('optimizeTransformList', () => {
    it('should merge consecutive translations', () => {
      const transforms = [
        { type: 'translate', params: { tx: 10, ty: 20 } },
        { type: 'translate', params: { tx: 5, ty: -10 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'merged to 1 transform');
      assert.equal(result.transforms[0].type, 'translate', 'type is translate');
      assert.ok(result.transforms[0].params.tx.equals(15), 'tx = 15');
      assert.ok(result.transforms[0].params.ty.equals(10), 'ty = 10');
      assert.ok(result.verified, 'should be verified');
    });

    it('should merge consecutive rotations around origin', () => {
      const transforms = [
        { type: 'rotate', params: { angle: 0.3 } },
        { type: 'rotate', params: { angle: 0.4 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'merged to 1 transform');
      assert.equal(result.transforms[0].type, 'rotate', 'type is rotate');
      assert.ok(result.transforms[0].params.angle.minus(0.7).abs().lessThan(D('1e-10')), 'angle = 0.7');
      assert.ok(result.verified, 'should be verified');
    });

    it('should merge consecutive scales', () => {
      const transforms = [
        { type: 'scale', params: { sx: 2, sy: 3 } },
        { type: 'scale', params: { sx: 0.5, sy: 2 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'merged to 1 transform');
      assert.equal(result.transforms[0].type, 'scale', 'type is scale');
      assert.ok(result.transforms[0].params.sx.equals(1), 'sx = 1');
      assert.ok(result.transforms[0].params.sy.equals(6), 'sy = 6');
      assert.ok(result.verified, 'should be verified');
    });

    it('should remove identity transforms', () => {
      const transforms = [
        { type: 'translate', params: { tx: 0, ty: 0 } },
        { type: 'scale', params: { sx: 2, sy: 2 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'identity removed');
      assert.equal(result.transforms[0].type, 'scale', 'only scale remains');
      assert.ok(result.optimizationCount > 0, 'some optimization happened');
    });

    it('should detect translate-rotate-translate pattern', () => {
      const transforms = [
        { type: 'translate', params: { tx: 50, ty: 50 } },
        { type: 'rotate', params: { angle: Math.PI / 2 } },
        { type: 'translate', params: { tx: -50, ty: -50 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'collapsed to 1 transform');
      assert.equal(result.transforms[0].type, 'rotate', 'type is rotate');
      assert.ok(result.transforms[0].params.cx !== undefined, 'has center x');
      assert.ok(result.transforms[0].params.cy !== undefined, 'has center y');
      assert.ok(result.verified, 'should be verified');
    });

    it('should convert matrix to translate when possible', () => {
      const transforms = [
        { type: 'matrix', params: { matrix: TransformOpt.translationMatrix(10, 20) } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'still 1 transform');
      assert.equal(result.transforms[0].type, 'translate', 'converted to translate');
      assert.ok(result.verified, 'should be verified');
    });

    it('should convert matrix to rotate when possible', () => {
      const transforms = [
        { type: 'matrix', params: { matrix: TransformOpt.rotationMatrix(0.5) } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'still 1 transform');
      assert.equal(result.transforms[0].type, 'rotate', 'converted to rotate');
      assert.ok(result.verified, 'should be verified');
    });

    it('should convert matrix to scale when possible', () => {
      const transforms = [
        { type: 'matrix', params: { matrix: TransformOpt.scaleMatrix(2, 3) } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.equal(result.transforms.length, 1, 'still 1 transform');
      assert.equal(result.transforms[0].type, 'scale', 'converted to scale');
      assert.ok(result.verified, 'should be verified');
    });

    it('should preserve overall transformation matrix', () => {
      const transforms = [
        { type: 'translate', params: { tx: 10, ty: 20 } },
        { type: 'rotate', params: { angle: 0.5 } },
        { type: 'translate', params: { tx: 5, ty: 5 } }
      ];
      const result = TransformOpt.optimizeTransformList(transforms);

      assert.ok(result.verified, 'overall matrix preserved');
      assert.ok(result.maxError.lessThan(D('1e-20')), 'error is minimal');
    });

    it('should handle empty array', () => {
      const result = TransformOpt.optimizeTransformList([]);

      assert.equal(result.transforms.length, 0, 'empty result');
      assert.equal(result.optimizationCount, 0, 'no optimizations');
      assert.ok(result.verified, 'should be verified');
    });
  });

  describe('constants exported', () => {
    it('should export EPSILON constant', () => {
      assert.ok(TransformOpt.EPSILON instanceof Decimal, 'EPSILON should be Decimal');
      assert.ok(TransformOpt.EPSILON.lessThan(D('1e-30')), 'EPSILON should be small');
    });

    it('should export VERIFICATION_TOLERANCE constant', () => {
      assert.ok(TransformOpt.VERIFICATION_TOLERANCE instanceof Decimal, 'VERIFICATION_TOLERANCE should be Decimal');
      assert.ok(TransformOpt.VERIFICATION_TOLERANCE.greaterThan(TransformOpt.EPSILON), 'VERIFICATION_TOLERANCE > EPSILON');
    });

    it('should export D helper function', () => {
      assert.ok(typeof TransformOpt.D === 'function', 'D should be a function');
      assert.ok(TransformOpt.D(5) instanceof Decimal, 'D should return Decimal');
    });
  });

  describe('precision preservation', () => {
    it('should preserve high precision in matrix operations', () => {
      const highPrecAngle = '0.12345678901234567890123456789012345678901234567890';
      const R = TransformOpt.rotationMatrix(highPrecAngle);

      // The cos/sin calculations should use high precision
      assert.ok(R.data[0][0] instanceof Decimal, 'matrix elements are Decimal');
    });

    it('should preserve precision through merge operations', () => {
      const t1 = { tx: '10.12345678901234567890', ty: '20.98765432109876543210' };
      const t2 = { tx: '5.11111111111111111111', ty: '5.22222222222222222222' };
      const result = TransformOpt.mergeTranslations(t1, t2);

      // Check that precision is maintained - result is Decimal with high precision
      // 10.12345678901234567890 + 5.11111111111111111111 = 15.23456790012345679001
      // 20.98765432109876543210 + 5.22222222222222222222 = 26.20987654332098765432
      assert.ok(result.tx instanceof Decimal, 'tx is Decimal');
      assert.ok(result.ty instanceof Decimal, 'ty is Decimal');
      // Verify the sum is correct with high precision
      assert.equal(result.tx.toString(), '15.23456790012345679001', 'tx sum correct');
      assert.equal(result.ty.toString(), '26.20987654332098765432', 'ty sum correct');
    });
  });
});
