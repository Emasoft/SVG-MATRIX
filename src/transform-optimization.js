/**
 * Transform Optimization with Arbitrary Precision and Mathematical Verification
 *
 * Optimizes sequences of 2D affine transformations by merging compatible transforms,
 * removing redundancies, and converting matrices to simpler forms when possible.
 *
 * Guarantees:
 * 1. ARBITRARY PRECISION - All calculations use Decimal.js (80 digits)
 * 2. MATHEMATICAL VERIFICATION - Every optimization verifies that the result is equivalent
 *
 * ## Optimization Strategies
 *
 * 1. **Merge Adjacent Transforms**: Combine consecutive transforms of the same type
 *    - translate + translate → single translate
 *    - rotate + rotate (same center) → single rotate
 *    - scale + scale → single scale
 *
 * 2. **Remove Identity Transforms**: Remove transforms that have no effect
 *    - translate(0, 0)
 *    - rotate(0) or rotate(2π)
 *    - scale(1, 1)
 *
 * 3. **Matrix Simplification**: Convert general matrices to simpler forms
 *    - Pure translation matrix → translate()
 *    - Pure rotation matrix → rotate()
 *    - Pure scale matrix → scale()
 *
 * 4. **Shorthand Notation**: Combine translate-rotate-translate sequences
 *    - translate + rotate + translate⁻¹ → rotate(angle, cx, cy)
 *
 * @module transform-optimization
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons
const EPSILON = new Decimal("1e-40");

// Verification tolerance (larger than EPSILON for practical use)
const VERIFICATION_TOLERANCE = new Decimal("1e-30");

// ============================================================================
// Matrix Utilities (imported patterns)
// ============================================================================

/**
 * Create a 3x3 identity matrix with Decimal values.
 * @returns {Matrix} 3x3 identity matrix
 */
export function identityMatrix() {
  return Matrix.identity(3);
}

/**
 * Create a 2D translation matrix.
 * @param {number|string|Decimal} tx - X translation
 * @param {number|string|Decimal} ty - Y translation
 * @returns {Matrix} 3x3 translation matrix
 * @throws {Error} If tx or ty is null or undefined
 */
export function translationMatrix(tx, ty) {
  if (tx === null || tx === undefined) {
    throw new Error("translationMatrix: tx parameter is required");
  }
  if (ty === null || ty === undefined) {
    throw new Error("translationMatrix: ty parameter is required");
  }
  return Matrix.from([
    [1, 0, D(tx)],
    [0, 1, D(ty)],
    [0, 0, 1],
  ]);
}

/**
 * Create a 2D rotation matrix.
 * @param {number|string|Decimal} angle - Rotation angle in radians
 * @returns {Matrix} 3x3 rotation matrix
 * @throws {Error} If angle is null or undefined
 */
export function rotationMatrix(angle) {
  if (angle === null || angle === undefined) {
    throw new Error("rotationMatrix: angle parameter is required");
  }
  const theta = D(angle);
  const cos = Decimal.cos(theta);
  const sin = Decimal.sin(theta);
  return Matrix.from([
    [cos, sin.neg(), 0],
    [sin, cos, 0],
    [0, 0, 1],
  ]);
}

/**
 * Create a 2D rotation matrix around a specific point.
 * @param {number|string|Decimal} angle - Rotation angle in radians
 * @param {number|string|Decimal} cx - X coordinate of rotation center
 * @param {number|string|Decimal} cy - Y coordinate of rotation center
 * @returns {Matrix} 3x3 rotation matrix around point (cx, cy)
 * @throws {Error} If angle, cx, or cy is null or undefined
 */
export function rotationMatrixAroundPoint(angle, cx, cy) {
  if (angle === null || angle === undefined) {
    throw new Error("rotationMatrixAroundPoint: angle parameter is required");
  }
  if (cx === null || cx === undefined) {
    throw new Error("rotationMatrixAroundPoint: cx parameter is required");
  }
  if (cy === null || cy === undefined) {
    throw new Error("rotationMatrixAroundPoint: cy parameter is required");
  }
  const cxD = D(cx);
  const cyD = D(cy);
  const T1 = translationMatrix(cxD.neg(), cyD.neg());
  const R = rotationMatrix(angle);
  const T2 = translationMatrix(cxD, cyD);
  return T2.mul(R).mul(T1);
}

/**
 * Create a 2D scale matrix.
 * @param {number|string|Decimal} sx - X scale factor
 * @param {number|string|Decimal} sy - Y scale factor
 * @returns {Matrix} 3x3 scale matrix
 * @throws {Error} If sx or sy is null or undefined
 */
export function scaleMatrix(sx, sy) {
  if (sx === null || sx === undefined) {
    throw new Error("scaleMatrix: sx parameter is required");
  }
  if (sy === null || sy === undefined) {
    throw new Error("scaleMatrix: sy parameter is required");
  }
  return Matrix.from([
    [D(sx), 0, 0],
    [0, D(sy), 0],
    [0, 0, 1],
  ]);
}

/**
 * Calculate the maximum absolute difference between two matrices.
 * @param {Matrix} m1 - First matrix
 * @param {Matrix} m2 - Second matrix
 * @returns {Decimal} Maximum absolute difference
 * @throws {Error} If m1 or m2 is null, undefined, or dimensions don't match
 */
export function matrixMaxDifference(m1, m2) {
  if (!m1 || !m2) {
    throw new Error(
      "matrixMaxDifference: both m1 and m2 parameters are required",
    );
  }
  if (!m1.rows || !m1.cols || !m1.data) {
    throw new Error("matrixMaxDifference: m1 must be a valid Matrix object");
  }
  if (!m2.rows || !m2.cols || !m2.data) {
    throw new Error("matrixMaxDifference: m2 must be a valid Matrix object");
  }
  if (m1.rows !== m2.rows || m1.cols !== m2.cols) {
    throw new Error(
      `matrixMaxDifference: matrix dimensions must match (m1: ${m1.rows}x${m1.cols}, m2: ${m2.rows}x${m2.cols})`,
    );
  }

  let maxDiff = D(0);

  for (let i = 0; i < m1.rows; i++) {
    for (let j = 0; j < m1.cols; j++) {
      const diff = m1.data[i][j].minus(m2.data[i][j]).abs();
      if (diff.greaterThan(maxDiff)) {
        maxDiff = diff;
      }
    }
  }

  return maxDiff;
}

/**
 * Check if two matrices are equal within tolerance.
 * @param {Matrix} m1 - First matrix
 * @param {Matrix} m2 - Second matrix
 * @param {Decimal} [tolerance=VERIFICATION_TOLERANCE] - Maximum allowed difference
 * @returns {boolean} True if matrices are equal within tolerance
 */
export function matricesEqual(m1, m2, tolerance = VERIFICATION_TOLERANCE) {
  return matrixMaxDifference(m1, m2).lessThan(D(tolerance));
}

// ============================================================================
// Transform Merging Functions
// ============================================================================

/**
 * Merge two translation transforms into a single translation.
 *
 * Mathematical formula:
 * translate(a, b) × translate(c, d) = translate(a + c, b + d)
 *
 * VERIFICATION: The result matrix must equal the product of the two input matrices.
 *
 * @param {{tx: number|string|Decimal, ty: number|string|Decimal}} t1 - First translation
 * @param {{tx: number|string|Decimal, ty: number|string|Decimal}} t2 - Second translation
 * @returns {{
 *   tx: Decimal,
 *   ty: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Merged translation with verification result
 * @throws {Error} If t1 or t2 is null/undefined or missing required properties
 *
 * @example
 * // Merge translate(5, 10) and translate(3, -2)
 * const result = mergeTranslations({tx: 5, ty: 10}, {tx: 3, ty: -2});
 * // Result: {tx: 8, ty: 8, verified: true}
 */
export function mergeTranslations(t1, t2) {
  if (!t1 || !t2) {
    throw new Error(
      "mergeTranslations: both t1 and t2 parameters are required",
    );
  }
  if (
    t1.tx === null ||
    t1.tx === undefined ||
    t1.ty === null ||
    t1.ty === undefined
  ) {
    throw new Error("mergeTranslations: t1 must have tx and ty properties");
  }
  if (
    t2.tx === null ||
    t2.tx === undefined ||
    t2.ty === null ||
    t2.ty === undefined
  ) {
    throw new Error("mergeTranslations: t2 must have tx and ty properties");
  }

  // Calculate merged translation: sum of components
  const tx = D(t1.tx).plus(D(t2.tx));
  const ty = D(t1.ty).plus(D(t2.ty));

  // VERIFICATION: Matrix multiplication must give same result
  const M1 = translationMatrix(t1.tx, t1.ty);
  const M2 = translationMatrix(t2.tx, t2.ty);
  const product = M1.mul(M2);
  const merged = translationMatrix(tx, ty);

  const maxError = matrixMaxDifference(product, merged);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    tx,
    ty,
    verified,
    maxError,
  };
}

/**
 * Merge two rotation transforms around the origin into a single rotation.
 *
 * Mathematical formula:
 * rotate(a) × rotate(b) = rotate(a + b)
 *
 * Note: This only works for rotations around the SAME point (origin).
 * For rotations around different points, this function should not be used.
 *
 * VERIFICATION: The result matrix must equal the product of the two input matrices.
 *
 * @param {{angle: number|string|Decimal}} r1 - First rotation
 * @param {{angle: number|string|Decimal}} r2 - Second rotation
 * @returns {{
 *   angle: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Merged rotation with verification result
 * @throws {Error} If r1 or r2 is null/undefined or missing angle property
 *
 * @example
 * // Merge rotate(π/4) and rotate(π/4)
 * const result = mergeRotations({angle: Math.PI/4}, {angle: Math.PI/4});
 * // Result: {angle: π/2, verified: true}
 */
export function mergeRotations(r1, r2) {
  if (!r1 || !r2) {
    throw new Error("mergeRotations: both r1 and r2 parameters are required");
  }
  if (r1.angle === null || r1.angle === undefined) {
    throw new Error("mergeRotations: r1 must have angle property");
  }
  if (r2.angle === null || r2.angle === undefined) {
    throw new Error("mergeRotations: r2 must have angle property");
  }

  // Calculate merged rotation: sum of angles
  const angle = D(r1.angle).plus(D(r2.angle));

  // Normalize angle to (-π, π]
  // Note: angle.mod(TWO_PI) returns [0, 2π), so the second branch is unreachable
  const PI = Decimal.acos(-1);
  const TWO_PI = PI.mul(2);
  let normalizedAngle = angle.mod(TWO_PI);
  if (normalizedAngle.greaterThan(PI)) {
    normalizedAngle = normalizedAngle.minus(TWO_PI);
  }
  // Second condition removed: after mod [0, 2π), we can never have values < -π

  // VERIFICATION: Matrix multiplication must give same result
  const M1 = rotationMatrix(r1.angle);
  const M2 = rotationMatrix(r2.angle);
  const product = M1.mul(M2);
  const merged = rotationMatrix(normalizedAngle);

  const maxError = matrixMaxDifference(product, merged);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    angle: normalizedAngle,
    verified,
    maxError,
  };
}

/**
 * Merge two scale transforms into a single scale.
 *
 * Mathematical formula:
 * scale(a, b) × scale(c, d) = scale(a × c, b × d)
 *
 * VERIFICATION: The result matrix must equal the product of the two input matrices.
 *
 * @param {{sx: number|string|Decimal, sy: number|string|Decimal}} s1 - First scale
 * @param {{sx: number|string|Decimal, sy: number|string|Decimal}} s2 - Second scale
 * @returns {{
 *   sx: Decimal,
 *   sy: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Merged scale with verification result
 * @throws {Error} If s1 or s2 is null/undefined or missing required properties
 *
 * @example
 * // Merge scale(2, 3) and scale(1.5, 0.5)
 * const result = mergeScales({sx: 2, sy: 3}, {sx: 1.5, sy: 0.5});
 * // Result: {sx: 3, sy: 1.5, verified: true}
 */
export function mergeScales(s1, s2) {
  if (!s1 || !s2) {
    throw new Error("mergeScales: both s1 and s2 parameters are required");
  }
  if (
    s1.sx === null ||
    s1.sx === undefined ||
    s1.sy === null ||
    s1.sy === undefined
  ) {
    throw new Error("mergeScales: s1 must have sx and sy properties");
  }
  if (
    s2.sx === null ||
    s2.sx === undefined ||
    s2.sy === null ||
    s2.sy === undefined
  ) {
    throw new Error("mergeScales: s2 must have sx and sy properties");
  }

  // Calculate merged scale: product of components
  const sx = D(s1.sx).mul(D(s2.sx));
  const sy = D(s1.sy).mul(D(s2.sy));

  // VERIFICATION: Matrix multiplication must give same result
  const M1 = scaleMatrix(s1.sx, s1.sy);
  const M2 = scaleMatrix(s2.sx, s2.sy);
  const product = M1.mul(M2);
  const merged = scaleMatrix(sx, sy);

  const maxError = matrixMaxDifference(product, merged);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    sx,
    sy,
    verified,
    maxError,
  };
}

// ============================================================================
// Matrix to Transform Conversion Functions
// ============================================================================

/**
 * Convert a matrix to a translate transform if it represents a pure translation.
 *
 * A pure translation matrix has the form:
 * [1  0  tx]
 * [0  1  ty]
 * [0  0   1]
 *
 * VERIFICATION: The matrices must be equal.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{
 *   isTranslation: boolean,
 *   tx: Decimal|null,
 *   ty: Decimal|null,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Translation parameters if matrix is pure translation
 * @throws {Error} If matrix is null, undefined, or not 3x3
 *
 * @example
 * // Check if a matrix is a pure translation
 * const M = translationMatrix(5, 10);
 * const result = matrixToTranslate(M);
 * // Result: {isTranslation: true, tx: 5, ty: 10, verified: true}
 */
export function matrixToTranslate(matrix) {
  if (!matrix) {
    throw new Error("matrixToTranslate: matrix parameter is required");
  }
  if (!matrix.data || !matrix.rows || !matrix.cols) {
    throw new Error("matrixToTranslate: matrix must be a valid Matrix object");
  }
  if (matrix.rows !== 3 || matrix.cols !== 3) {
    throw new Error(
      `matrixToTranslate: matrix must be 3x3 (got ${matrix.rows}x${matrix.cols})`,
    );
  }

  const data = matrix.data;

  // Check if linear part is identity
  const isIdentityLinear =
    data[0][0].minus(1).abs().lessThan(EPSILON) &&
    data[0][1].abs().lessThan(EPSILON) &&
    data[1][0].abs().lessThan(EPSILON) &&
    data[1][1].minus(1).abs().lessThan(EPSILON);

  if (!isIdentityLinear) {
    return {
      isTranslation: false,
      tx: null,
      ty: null,
      verified: false,
      maxError: D(0),
    };
  }

  // Extract translation
  const tx = data[0][2];
  const ty = data[1][2];

  // VERIFICATION: Matrices must be equal
  const reconstructed = translationMatrix(tx, ty);
  const maxError = matrixMaxDifference(matrix, reconstructed);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    isTranslation: true,
    tx,
    ty,
    verified,
    maxError,
  };
}

/**
 * Convert a matrix to a rotate transform if it represents a pure rotation around origin.
 *
 * A pure rotation matrix has the form:
 * [cos(θ)  -sin(θ)  0]
 * [sin(θ)   cos(θ)  0]
 * [  0        0     1]
 *
 * Properties:
 * - Orthogonal columns: a·c + b·d = 0
 * - Unit column lengths: a² + b² = 1, c² + d² = 1
 * - Determinant = 1 (no reflection)
 * - No translation: tx = ty = 0
 *
 * VERIFICATION: The matrices must be equal.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{
 *   isRotation: boolean,
 *   angle: Decimal|null,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Rotation angle if matrix is pure rotation
 * @throws {Error} If matrix is null, undefined, or not 3x3
 *
 * @example
 * // Check if a matrix is a pure rotation
 * const M = rotationMatrix(Math.PI / 4);
 * const result = matrixToRotate(M);
 * // Result: {isRotation: true, angle: π/4, verified: true}
 */
export function matrixToRotate(matrix) {
  if (!matrix) {
    throw new Error("matrixToRotate: matrix parameter is required");
  }
  if (!matrix.data || !matrix.rows || !matrix.cols) {
    throw new Error("matrixToRotate: matrix must be a valid Matrix object");
  }
  if (matrix.rows !== 3 || matrix.cols !== 3) {
    throw new Error(
      `matrixToRotate: matrix must be 3x3 (got ${matrix.rows}x${matrix.cols})`,
    );
  }

  const data = matrix.data;

  // Extract components
  const a = data[0][0];
  const b = data[1][0];
  const c = data[0][1];
  const d = data[1][1];
  const tx = data[0][2];
  const ty = data[1][2];

  // Check no translation
  if (!tx.abs().lessThan(EPSILON) || !ty.abs().lessThan(EPSILON)) {
    return {
      isRotation: false,
      angle: null,
      verified: false,
      maxError: D(0),
    };
  }

  // Check orthogonality: a*c + b*d = 0
  const orthogonal = a.mul(c).plus(b.mul(d)).abs().lessThan(EPSILON);

  // Check unit columns: a² + b² = 1, c² + d² = 1
  const col1Norm = a.mul(a).plus(b.mul(b));
  const col2Norm = c.mul(c).plus(d.mul(d));
  const unitNorm =
    col1Norm.minus(1).abs().lessThan(EPSILON) &&
    col2Norm.minus(1).abs().lessThan(EPSILON);

  // Check determinant = 1 (no reflection)
  const det = a.mul(d).minus(b.mul(c));
  const detOne = det.minus(1).abs().lessThan(EPSILON);

  if (!orthogonal || !unitNorm || !detOne) {
    return {
      isRotation: false,
      angle: null,
      verified: false,
      maxError: D(0),
    };
  }

  // Calculate rotation angle
  const angle = Decimal.atan2(b, a);

  // VERIFICATION: Matrices must be equal
  const reconstructed = rotationMatrix(angle);
  const maxError = matrixMaxDifference(matrix, reconstructed);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    isRotation: true,
    angle,
    verified,
    maxError,
  };
}

/**
 * Convert a matrix to a scale transform if it represents a pure scale.
 *
 * A pure scale matrix has the form:
 * [sx  0   0]
 * [0   sy  0]
 * [0   0   1]
 *
 * Properties:
 * - Diagonal matrix in linear part: b = c = 0
 * - No translation: tx = ty = 0
 *
 * VERIFICATION: The matrices must be equal.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{
 *   isScale: boolean,
 *   sx: Decimal|null,
 *   sy: Decimal|null,
 *   isUniform: boolean,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Scale factors if matrix is pure scale
 * @throws {Error} If matrix is null, undefined, or not 3x3
 *
 * @example
 * // Check if a matrix is a pure scale
 * const M = scaleMatrix(2, 2);
 * const result = matrixToScale(M);
 * // Result: {isScale: true, sx: 2, sy: 2, isUniform: true, verified: true}
 */
export function matrixToScale(matrix) {
  if (!matrix) {
    throw new Error("matrixToScale: matrix parameter is required");
  }
  if (!matrix.data || !matrix.rows || !matrix.cols) {
    throw new Error("matrixToScale: matrix must be a valid Matrix object");
  }
  if (matrix.rows !== 3 || matrix.cols !== 3) {
    throw new Error(
      `matrixToScale: matrix must be 3x3 (got ${matrix.rows}x${matrix.cols})`,
    );
  }

  const data = matrix.data;

  // Extract components
  const a = data[0][0];
  const b = data[1][0];
  const c = data[0][1];
  const d = data[1][1];
  const tx = data[0][2];
  const ty = data[1][2];

  // Check no translation
  if (!tx.abs().lessThan(EPSILON) || !ty.abs().lessThan(EPSILON)) {
    return {
      isScale: false,
      sx: null,
      sy: null,
      isUniform: false,
      verified: false,
      maxError: D(0),
    };
  }

  // Check diagonal: b = 0, c = 0
  if (!b.abs().lessThan(EPSILON) || !c.abs().lessThan(EPSILON)) {
    return {
      isScale: false,
      sx: null,
      sy: null,
      isUniform: false,
      verified: false,
      maxError: D(0),
    };
  }

  // Extract scale factors
  const sx = a;
  const sy = d;

  // Check if uniform
  const isUniform = sx.minus(sy).abs().lessThan(EPSILON);

  // VERIFICATION: Matrices must be equal
  const reconstructed = scaleMatrix(sx, sy);
  const maxError = matrixMaxDifference(matrix, reconstructed);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    isScale: true,
    sx,
    sy,
    isUniform,
    verified,
    maxError,
  };
}

// ============================================================================
// Transform List Optimization Functions
// ============================================================================

/**
 * Remove identity transforms from a transform list.
 *
 * Identity transforms are those that have no effect:
 * - translate(0, 0)
 * - rotate(0) or rotate(2πn) for integer n
 * - scale(1, 1)
 *
 * This function does NOT perform verification (it only removes transforms).
 *
 * @param {Array<{type: string, params: Object}>} transforms - Array of transform objects
 * @returns {{
 *   transforms: Array<{type: string, params: Object}>,
 *   removedCount: number
 * }} Filtered transform list
 * @throws {Error} If transforms is null, undefined, or not an array
 *
 * @example
 * // Remove identity transforms
 * const transforms = [
 *   {type: 'translate', params: {tx: 5, ty: 10}},
 *   {type: 'rotate', params: {angle: 0}},
 *   {type: 'scale', params: {sx: 1, sy: 1}},
 *   {type: 'translate', params: {tx: 0, ty: 0}}
 * ];
 * const result = removeIdentityTransforms(transforms);
 * // Result: {transforms: [{type: 'translate', params: {tx: 5, ty: 10}}], removedCount: 3}
 */
export function removeIdentityTransforms(transforms) {
  if (!transforms) {
    throw new Error(
      "removeIdentityTransforms: transforms parameter is required",
    );
  }
  if (!Array.isArray(transforms)) {
    throw new Error("removeIdentityTransforms: transforms must be an array");
  }

  const PI = Decimal.acos(-1);
  const TWO_PI = PI.mul(2);

  const filtered = transforms.filter((t) => {
    // Validate transform object structure
    if (!t || typeof t !== "object") {
      return true; // Keep malformed transforms for debugging
    }
    if (!t.type || !t.params || typeof t.params !== "object") {
      return true; // Keep malformed transforms for debugging
    }

    switch (t.type) {
      case "translate": {
        if (
          t.params.tx === null ||
          t.params.tx === undefined ||
          t.params.ty === null ||
          t.params.ty === undefined
        ) {
          return true; // Keep transforms with missing params for debugging
        }
        const tx = D(t.params.tx);
        const ty = D(t.params.ty);
        return !tx.abs().lessThan(EPSILON) || !ty.abs().lessThan(EPSILON);
      }

      case "rotate": {
        if (t.params.angle === null || t.params.angle === undefined) {
          return true; // Keep transforms with missing params for debugging
        }
        const angle = D(t.params.angle);
        // Normalize angle to [0, 2π) and check if near 0 or near 2π (both represent identity rotation)
        const normalized = angle.mod(TWO_PI);
        // Identity rotation: angle ≈ 0 or angle ≈ 2π (within EPSILON), regardless of center point
        const isNearZero = normalized.abs().lessThan(EPSILON);
        const isNearTwoPi = normalized.minus(TWO_PI).abs().lessThan(EPSILON);
        return !isNearZero && !isNearTwoPi;
      }

      case "scale": {
        if (
          t.params.sx === null ||
          t.params.sx === undefined ||
          t.params.sy === null ||
          t.params.sy === undefined
        ) {
          return true; // Keep transforms with missing params for debugging
        }
        const sx = D(t.params.sx);
        const sy = D(t.params.sy);
        return (
          !sx.minus(1).abs().lessThan(EPSILON) ||
          !sy.minus(1).abs().lessThan(EPSILON)
        );
      }

      case "matrix": {
        if (!t.params.matrix) {
          return true; // Keep transforms with missing matrix for debugging
        }
        // Check if matrix is identity
        const m = t.params.matrix;
        const identity = identityMatrix();
        return !matricesEqual(m, identity, EPSILON);
      }

      default:
        // Keep unknown transform types
        return true;
    }
  });

  return {
    transforms: filtered,
    removedCount: transforms.length - filtered.length,
  };
}

/**
 * Convert translate-rotate-translate sequence to rotate around point shorthand.
 *
 * Detects the pattern:
 * translate(tx, ty) × rotate(angle) × translate(-tx, -ty)
 *
 * And converts it to:
 * rotate(angle, tx, ty)
 *
 * This is a common optimization for rotating around a point other than the origin.
 *
 * VERIFICATION: The matrices must be equal.
 *
 * @param {number|string|Decimal} translateX - First translation X
 * @param {number|string|Decimal} translateY - First translation Y
 * @param {number|string|Decimal} angle - Rotation angle in radians
 * @param {number|string|Decimal} centerX - Expected rotation center X
 * @param {number|string|Decimal} centerY - Expected rotation center Y
 * @returns {{
 *   angle: Decimal,
 *   cx: Decimal,
 *   cy: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Shorthand rotation parameters with verification
 * @throws {Error} If any parameter is null or undefined
 *
 * @example
 * // Convert translate-rotate-translate to rotate around point
 * const result = shortRotate(100, 50, Math.PI/4, 100, 50);
 * // Result: {angle: π/4, cx: 100, cy: 50, verified: true}
 */
export function shortRotate(translateX, translateY, angle, centerX, centerY) {
  if (translateX === null || translateX === undefined) {
    throw new Error("shortRotate: translateX parameter is required");
  }
  if (translateY === null || translateY === undefined) {
    throw new Error("shortRotate: translateY parameter is required");
  }
  if (angle === null || angle === undefined) {
    throw new Error("shortRotate: angle parameter is required");
  }
  if (centerX === null || centerX === undefined) {
    throw new Error("shortRotate: centerX parameter is required");
  }
  if (centerY === null || centerY === undefined) {
    throw new Error("shortRotate: centerY parameter is required");
  }

  const txD = D(translateX);
  const tyD = D(translateY);
  const angleD = D(angle);
  const cxD = D(centerX);
  const cyD = D(centerY);

  // Build the sequence: T(tx, ty) × R(angle) × T(-tx, -ty)
  const T1 = translationMatrix(txD, tyD);
  const R = rotationMatrix(angleD);
  const T2 = translationMatrix(txD.neg(), tyD.neg());
  const sequence = T1.mul(R).mul(T2);

  // Build the shorthand: R(angle, cx, cy)
  const shorthand = rotationMatrixAroundPoint(angleD, cxD, cyD);

  // VERIFICATION: Matrices must be equal
  const maxError = matrixMaxDifference(sequence, shorthand);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    angle: angleD,
    cx: cxD,
    cy: cyD,
    verified,
    maxError,
  };
}

/**
 * Optimize a list of transforms by applying all optimization strategies.
 *
 * Optimization strategies applied:
 * 1. Remove identity transforms
 * 2. Merge consecutive transforms of the same type
 * 3. Detect and convert translate-rotate-translate to rotate around point
 * 4. Convert matrices to simpler forms when possible
 *
 * VERIFICATION: The combined matrix of the optimized list must equal the
 * combined matrix of the original list.
 *
 * @param {Array<{type: string, params: Object}>} transforms - Array of transform objects
 * @returns {{
 *   transforms: Array<{type: string, params: Object}>,
 *   optimizationCount: number,
 *   verified: boolean,
 *   maxError: Decimal
 * }} Optimized transform list with verification
 * @throws {Error} If transforms is null, undefined, or not an array
 *
 * @example
 * // Optimize a transform list
 * const transforms = [
 *   {type: 'translate', params: {tx: 5, ty: 10}},
 *   {type: 'translate', params: {tx: 3, ty: -2}},
 *   {type: 'rotate', params: {angle: 0}},
 *   {type: 'scale', params: {sx: 2, sy: 2}},
 *   {type: 'scale', params: {sx: 0.5, sy: 0.5}}
 * ];
 * const result = optimizeTransformList(transforms);
 * // Result: optimized list with merged translations and scales, identity rotation removed
 */
export function optimizeTransformList(transforms) {
  if (!transforms) {
    throw new Error("optimizeTransformList: transforms parameter is required");
  }
  if (!Array.isArray(transforms)) {
    throw new Error("optimizeTransformList: transforms must be an array");
  }

  // Calculate original combined matrix for verification
  let originalMatrix = identityMatrix();
  for (const t of transforms) {
    // Validate transform object structure
    if (
      !t ||
      typeof t !== "object" ||
      !t.type ||
      !t.params ||
      typeof t.params !== "object"
    ) {
      continue; // Skip malformed transforms
    }

    let m = null; // Initialize m to null to catch missing assignments
    switch (t.type) {
      case "translate":
        if (
          t.params.tx === null ||
          t.params.tx === undefined ||
          t.params.ty === null ||
          t.params.ty === undefined
        ) {
          continue; // Skip transforms with missing params
        }
        m = translationMatrix(t.params.tx, t.params.ty);
        break;
      case "rotate":
        if (t.params.angle === null || t.params.angle === undefined) {
          continue; // Skip transforms with missing angle
        }
        if (
          t.params.cx !== undefined &&
          t.params.cx !== null &&
          t.params.cy !== undefined &&
          t.params.cy !== null
        ) {
          m = rotationMatrixAroundPoint(
            t.params.angle,
            t.params.cx,
            t.params.cy,
          );
        } else {
          m = rotationMatrix(t.params.angle);
        }
        break;
      case "scale":
        if (
          t.params.sx === null ||
          t.params.sx === undefined ||
          t.params.sy === null ||
          t.params.sy === undefined
        ) {
          continue; // Skip transforms with missing params
        }
        m = scaleMatrix(t.params.sx, t.params.sy);
        break;
      case "matrix":
        if (!t.params.matrix) {
          continue; // Skip transforms with missing matrix
        }
        m = t.params.matrix;
        break;
      default:
        // Skip unknown transform types, but don't try to multiply null matrix
        continue;
    }
    // Only multiply if m was successfully assigned (prevents undefined matrix multiplication)
    if (m !== null) {
      originalMatrix = originalMatrix.mul(m);
    }
  }

  // Step 1: Remove identity transforms
  const { transforms: step1, removedCount: _removedCount } =
    removeIdentityTransforms(transforms);
  const optimized = step1.slice();

  // Step 2: Merge consecutive transforms of the same type
  let i = 0;
  while (i < optimized.length - 1) {
    const current = optimized[i];
    const next = optimized[i + 1];

    // Validate transform objects before processing
    if (
      !current ||
      !current.type ||
      !current.params ||
      !next ||
      !next.type ||
      !next.params
    ) {
      i++;
      continue;
    }

    // Try to merge
    let merged = null;

    if (current.type === "translate" && next.type === "translate") {
      const result = mergeTranslations(current.params, next.params);
      if (result.verified) {
        merged = {
          type: "translate",
          params: { tx: result.tx, ty: result.ty },
        };
      }
    } else if (current.type === "rotate" && next.type === "rotate") {
      // Only merge if both are around origin: cx and cy are undefined/null OR both are ≈0
      const currentCx =
        current.params.cx !== undefined && current.params.cx !== null
          ? D(current.params.cx)
          : null;
      const currentCy =
        current.params.cy !== undefined && current.params.cy !== null
          ? D(current.params.cy)
          : null;
      const nextCx =
        next.params.cx !== undefined && next.params.cx !== null
          ? D(next.params.cx)
          : null;
      const nextCy =
        next.params.cy !== undefined && next.params.cy !== null
          ? D(next.params.cy)
          : null;

      // Check if rotation is effectively around origin
      const currentIsOrigin =
        (currentCx === null && currentCy === null) ||
        (currentCx !== null &&
          currentCy !== null &&
          currentCx.abs().lessThan(EPSILON) &&
          currentCy.abs().lessThan(EPSILON));
      const nextIsOrigin =
        (nextCx === null && nextCy === null) ||
        (nextCx !== null &&
          nextCy !== null &&
          nextCx.abs().lessThan(EPSILON) &&
          nextCy.abs().lessThan(EPSILON));

      if (currentIsOrigin && nextIsOrigin) {
        const result = mergeRotations(current.params, next.params);
        if (result.verified) {
          merged = {
            type: "rotate",
            params: { angle: result.angle },
          };
        }
      }
    } else if (current.type === "scale" && next.type === "scale") {
      const result = mergeScales(current.params, next.params);
      if (result.verified) {
        merged = {
          type: "scale",
          params: { sx: result.sx, sy: result.sy },
        };
      }
    }

    if (merged) {
      // Replace current and next with merged
      optimized.splice(i, 2, merged);
      // Don't increment i, check if we can merge again
    } else {
      i++;
    }
  }

  // Step 3: Detect translate-rotate-translate patterns
  i = 0;
  while (i < optimized.length - 2) {
    const t1 = optimized[i];
    const t2 = optimized[i + 1];
    const t3 = optimized[i + 2];

    // Validate transform objects before processing
    if (
      !t1 ||
      !t1.type ||
      !t1.params ||
      !t2 ||
      !t2.type ||
      !t2.params ||
      !t3 ||
      !t3.type ||
      !t3.params
    ) {
      i++;
      continue;
    }

    if (
      t1.type === "translate" &&
      t2.type === "rotate" &&
      t3.type === "translate"
    ) {
      // Validate required parameters exist
      if (
        t1.params.tx === null ||
        t1.params.tx === undefined ||
        t1.params.ty === null ||
        t1.params.ty === undefined ||
        t2.params.angle === null ||
        t2.params.angle === undefined ||
        t3.params.tx === null ||
        t3.params.tx === undefined ||
        t3.params.ty === null ||
        t3.params.ty === undefined
      ) {
        i++;
        continue;
      }

      // Check if t3 is inverse of t1
      const tx1 = D(t1.params.tx);
      const ty1 = D(t1.params.ty);
      const tx3 = D(t3.params.tx);
      const ty3 = D(t3.params.ty);

      if (
        tx1.plus(tx3).abs().lessThan(EPSILON) &&
        ty1.plus(ty3).abs().lessThan(EPSILON)
      ) {
        // This is a rotate around point pattern
        const result = shortRotate(tx1, ty1, t2.params.angle, tx1, ty1);
        if (result.verified) {
          const merged = {
            type: "rotate",
            params: { angle: result.angle, cx: result.cx, cy: result.cy },
          };
          optimized.splice(i, 3, merged);
          // Don't increment i, might be able to merge more
          continue;
        }
      }
    }

    i++;
  }

  // Step 4: Convert matrices to simpler forms
  for (let j = 0; j < optimized.length; j++) {
    const t = optimized[j];

    // Validate transform object before processing
    if (!t || !t.type || !t.params) {
      continue;
    }

    if (t.type === "matrix") {
      if (!t.params.matrix) {
        continue; // Skip if matrix is missing
      }

      const m = t.params.matrix;

      // Try to convert to simpler forms
      const translateResult = matrixToTranslate(m);
      if (translateResult.isTranslation && translateResult.verified) {
        optimized[j] = {
          type: "translate",
          params: { tx: translateResult.tx, ty: translateResult.ty },
        };
        continue;
      }

      const rotateResult = matrixToRotate(m);
      if (rotateResult.isRotation && rotateResult.verified) {
        optimized[j] = {
          type: "rotate",
          params: { angle: rotateResult.angle },
        };
        continue;
      }

      const scaleResult = matrixToScale(m);
      if (scaleResult.isScale && scaleResult.verified) {
        optimized[j] = {
          type: "scale",
          params: { sx: scaleResult.sx, sy: scaleResult.sy },
        };
        continue;
      }
    }
  }

  // Final removal of any new identity transforms created by optimization
  const { transforms: final } = removeIdentityTransforms(optimized);

  // Calculate optimized combined matrix for verification
  let optimizedMatrix = identityMatrix();
  for (const t of final) {
    // Validate transform object structure
    if (
      !t ||
      typeof t !== "object" ||
      !t.type ||
      !t.params ||
      typeof t.params !== "object"
    ) {
      continue; // Skip malformed transforms
    }

    let m = null; // Initialize m to null to catch missing assignments
    switch (t.type) {
      case "translate":
        if (
          t.params.tx === null ||
          t.params.tx === undefined ||
          t.params.ty === null ||
          t.params.ty === undefined
        ) {
          continue; // Skip transforms with missing params
        }
        m = translationMatrix(t.params.tx, t.params.ty);
        break;
      case "rotate":
        if (t.params.angle === null || t.params.angle === undefined) {
          continue; // Skip transforms with missing angle
        }
        if (
          t.params.cx !== undefined &&
          t.params.cx !== null &&
          t.params.cy !== undefined &&
          t.params.cy !== null
        ) {
          m = rotationMatrixAroundPoint(
            t.params.angle,
            t.params.cx,
            t.params.cy,
          );
        } else {
          m = rotationMatrix(t.params.angle);
        }
        break;
      case "scale":
        if (
          t.params.sx === null ||
          t.params.sx === undefined ||
          t.params.sy === null ||
          t.params.sy === undefined
        ) {
          continue; // Skip transforms with missing params
        }
        m = scaleMatrix(t.params.sx, t.params.sy);
        break;
      case "matrix":
        if (!t.params.matrix) {
          continue; // Skip transforms with missing matrix
        }
        m = t.params.matrix;
        break;
      default:
        // Skip unknown transform types, but don't try to multiply null matrix
        continue;
    }
    // Only multiply if m was successfully assigned (prevents undefined matrix multiplication)
    if (m !== null) {
      optimizedMatrix = optimizedMatrix.mul(m);
    }
  }

  // VERIFICATION: Combined matrices must be equal
  const maxError = matrixMaxDifference(originalMatrix, optimizedMatrix);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    transforms: final,
    optimizationCount: transforms.length - final.length,
    verified,
    maxError,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { EPSILON, VERIFICATION_TOLERANCE, D };

export default {
  // Matrix utilities
  identityMatrix,
  translationMatrix,
  rotationMatrix,
  rotationMatrixAroundPoint,
  scaleMatrix,
  matrixMaxDifference,
  matricesEqual,

  // Transform merging
  mergeTranslations,
  mergeRotations,
  mergeScales,

  // Matrix to transform conversion
  matrixToTranslate,
  matrixToRotate,
  matrixToScale,

  // Transform list optimization
  removeIdentityTransforms,
  shortRotate,
  optimizeTransformList,

  // Constants
  EPSILON,
  VERIFICATION_TOLERANCE,
};
