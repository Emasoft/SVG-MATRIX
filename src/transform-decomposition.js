/**
 * Transform Decomposition with Arbitrary Precision and Mathematical Verification
 *
 * Decomposes 2D affine transformation matrices into their geometric components:
 * translation, rotation, scale, and skew.
 *
 * Guarantees:
 * 1. ARBITRARY PRECISION - All calculations use Decimal.js (50+ digits)
 * 2. MATHEMATICAL VERIFICATION - Recomposition must match original matrix
 *
 * ## Mathematical Background
 *
 * A 2D affine transformation matrix has the form:
 * | a  c  e |
 * | b  d  f |
 * | 0  0  1 |
 *
 * This can be decomposed into:
 * M = T * R * Sk * S
 *
 * Where:
 * - T = translation(e, f)
 * - R = rotation(theta)
 * - Sk = skewX(skewAngle)
 * - S = scale(sx, sy)
 *
 * The decomposition uses QR-like factorization:
 * 1. Translation (e, f) is directly from the matrix
 * 2. The 2x2 submatrix [[a,c],[b,d]] is decomposed via polar decomposition
 *
 * @module transform-decomposition
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
// Matrix Utilities
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
 */
export function translationMatrix(tx, ty) {
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
 */
export function rotationMatrix(angle) {
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
 * Create a 2D scale matrix.
 * @param {number|string|Decimal} sx - X scale factor
 * @param {number|string|Decimal} sy - Y scale factor
 * @returns {Matrix} 3x3 scale matrix
 */
export function scaleMatrix(sx, sy) {
  return Matrix.from([
    [D(sx), 0, 0],
    [0, D(sy), 0],
    [0, 0, 1],
  ]);
}

/**
 * Create a 2D skewX matrix.
 * @param {number|string|Decimal} angle - Skew angle in radians
 * @returns {Matrix} 3x3 skewX matrix
 */
export function skewXMatrix(angle) {
  const tan = Decimal.tan(D(angle));
  return Matrix.from([
    [1, tan, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
}

/**
 * Create a 2D skewY matrix.
 * @param {number|string|Decimal} angle - Skew angle in radians
 * @returns {Matrix} 3x3 skewY matrix
 */
export function skewYMatrix(angle) {
  const tan = Decimal.tan(D(angle));
  return Matrix.from([
    [1, 0, 0],
    [tan, 1, 0],
    [0, 0, 1],
  ]);
}

/**
 * Extract the 2x2 linear transformation submatrix from a 3x3 affine matrix.
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {{a: Decimal, b: Decimal, c: Decimal, d: Decimal}}
 */
export function extractLinearPart(matrix) {
  const data = matrix.data;
  return {
    a: data[0][0],
    b: data[1][0],
    c: data[0][1],
    d: data[1][1],
  };
}

/**
 * Extract the translation from a 3x3 affine matrix.
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {{tx: Decimal, ty: Decimal}}
 */
export function extractTranslation(matrix) {
  const data = matrix.data;
  return {
    tx: data[0][2],
    ty: data[1][2],
  };
}

// ============================================================================
// Matrix Decomposition
// ============================================================================

/**
 * Decompose a 2D affine transformation matrix into geometric components.
 *
 * Uses QR decomposition approach:
 * M = T * R * Sk * S
 *
 * Where T=translation, R=rotation, Sk=skewX, S=scale
 *
 * VERIFICATION: After decomposition, recompose and verify it matches original.
 *
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {{
 *   translateX: Decimal,
 *   translateY: Decimal,
 *   rotation: Decimal,
 *   scaleX: Decimal,
 *   scaleY: Decimal,
 *   skewX: Decimal,
 *   skewY: Decimal,
 *   verified: boolean,
 *   maxError?: Decimal,
 *   verificationError?: Decimal,
 *   singular?: boolean
 * }}
 */
export function decomposeMatrix(matrix) {
  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  // Calculate determinant to detect reflection
  const det = a.mul(d).minus(b.mul(c));

  // Calculate scale factors using column norms
  let scaleX = a.mul(a).plus(b.mul(b)).sqrt();

  // BUG FIX 1: Check for singular matrix (scaleX = 0) before division
  if (scaleX.abs().lessThan(EPSILON)) {
    // Handle degenerate/singular matrix case (e.g., scale(0, y))
    return {
      translateX: D(0),
      translateY: D(0),
      rotation: D(0),
      scaleX: D(0),
      scaleY: D(0),
      skewX: D(0),
      skewY: D(0),
      verified: false,
      verificationError: D("Infinity"),
      singular: true, // Flag to indicate singular matrix
    };
  }

  const scaleY = det.div(scaleX);

  // Handle reflection (negative determinant)
  // We put the reflection in scaleX
  if (det.lessThan(0)) {
    scaleX = scaleX.neg();
  }

  // Calculate rotation angle
  // theta = atan2(b, a) for the first column after normalization
  let rotation;
  if (scaleX.abs().lessThan(EPSILON)) {
    // Degenerate case: first column is zero
    rotation = Decimal.atan2(d, c);
  } else {
    rotation = Decimal.atan2(b, a);
  }

  // Calculate skew
  // After removing rotation and scale, we get the skew
  // The skew is: skewX = atan((a*c + b*d) / (a*d - b*c))
  // But we need to be careful about the decomposition order

  // Alternative approach: use the fact that
  // [a c] = [cos -sin] [sx  0 ] [1 tan(skewX)]
  // [b d]   [sin  cos] [0  sy ] [0     1     ]

  // After rotation by -theta:
  // [a' c'] = [a*cos+b*sin  c*cos+d*sin]
  // [b' d']   [-a*sin+b*cos -c*sin+d*cos]

  const cosTheta = Decimal.cos(rotation);
  const sinTheta = Decimal.sin(rotation);

  // Rotate back to get the scale+skew matrix
  const aPrime = a.mul(cosTheta).plus(b.mul(sinTheta));
  const _bPrime = a.neg().mul(sinTheta).plus(b.mul(cosTheta));
  const cPrime = c.mul(cosTheta).plus(d.mul(sinTheta));
  const _dPrime = c.neg().mul(sinTheta).plus(d.mul(cosTheta));

  // Now [aPrime cPrime] should be [scaleX, scaleX*tan(skewX)]
  //     [bPrime dPrime]           [0,      scaleY           ]

  // BUG FIX 2: Calculate skewX from tan(skewX) = cPrime/aPrime
  // Note: atan2 gives the angle of a vector, but we need atan of the ratio
  let skewX;
  if (aPrime.abs().greaterThan(EPSILON)) {
    // skewX = atan(cPrime/aPrime) because tan(skewX) = cPrime/aPrime
    skewX = Decimal.atan(cPrime.div(aPrime));
  } else {
    // If aPrime is near zero, skewX is undefined or π/2
    skewX = D(0);
  }

  // BUG FIX 3: Document skewY limitation
  // LIMITATION: This decomposition order (T * R * SkX * S) can only handle skewX.
  // A matrix with both skewX and skewY cannot be uniquely decomposed into this form.
  // To decompose matrices with skewY, a different decomposition order would be needed
  // (e.g., T * R * SkY * SkX * S), but that would change the semantic meaning.
  // For standard 2D affine transforms, skewY is typically 0.
  const skewY = D(0);

  // Recalculate scaleY from dPrime
  // dPrime should equal scaleY after removing skew
  const cosSkewX = Decimal.cos(skewX);
  if (cosSkewX.abs().greaterThan(EPSILON)) {
    // scaleY = dPrime / cos(skewX) - but we already have it from det/scaleX
  }

  // VERIFICATION: Recompose and compare
  const recomposed = composeTransform({
    translateX: tx,
    translateY: ty,
    rotation,
    scaleX,
    scaleY,
    skewX,
    skewY: D(0),
  });

  const maxError = matrixMaxDifference(matrix, recomposed);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    translateX: tx,
    translateY: ty,
    rotation,
    scaleX,
    scaleY,
    skewX,
    skewY,
    verified,
    maxError,
  };
}

/**
 * Alternative decomposition: Decompose into translate, rotate, scaleX, scaleY only (no skew).
 *
 * This is a simpler decomposition that ignores skew.
 * Useful when you know the transform doesn't have skew.
 *
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {{
 *   translateX: Decimal,
 *   translateY: Decimal,
 *   rotation: Decimal,
 *   scaleX: Decimal,
 *   scaleY: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }}
 */
export function decomposeMatrixNoSkew(matrix) {
  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  // Calculate determinant
  const det = a.mul(d).minus(b.mul(c));

  // Calculate rotation from the first column
  const rotation = Decimal.atan2(b, a);

  // Calculate scales
  const scaleX = a.mul(a).plus(b.mul(b)).sqrt();
  let scaleY = c.mul(c).plus(d.mul(d)).sqrt();

  // Adjust scaleY sign based on determinant
  if (det.lessThan(0)) {
    scaleY = scaleY.neg();
  }

  // VERIFICATION
  const recomposed = composeTransformNoSkew({
    translateX: tx,
    translateY: ty,
    rotation,
    scaleX,
    scaleY,
  });

  const maxError = matrixMaxDifference(matrix, recomposed);
  const verified = maxError.lessThan(VERIFICATION_TOLERANCE);

  return {
    translateX: tx,
    translateY: ty,
    rotation,
    scaleX,
    scaleY,
    verified,
    maxError,
  };
}

/**
 * Decompose using CSS-style decomposition order.
 *
 * CSS transforms are applied right-to-left:
 * transform: translate(tx, ty) rotate(r) skewX(sk) scale(sx, sy)
 *
 * This means: M = T * R * Sk * S
 *
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {{
 *   translateX: Decimal,
 *   translateY: Decimal,
 *   rotation: Decimal,
 *   scaleX: Decimal,
 *   scaleY: Decimal,
 *   skewX: Decimal,
 *   verified: boolean,
 *   maxError: Decimal
 * }}
 */
export function decomposeMatrixCSS(matrix) {
  // This is the same as decomposeMatrix but named for clarity
  return decomposeMatrix(matrix);
}

/**
 * Decompose using SVG-style decomposition.
 *
 * SVG transforms are also applied right-to-left, same as CSS.
 *
 * @param {Matrix} matrix - 3x3 affine transformation matrix
 * @returns {Object} Decomposition result
 */
export function decomposeMatrixSVG(matrix) {
  return decomposeMatrix(matrix);
}

// ============================================================================
// Matrix Composition
// ============================================================================

/**
 * Compose a transformation matrix from geometric components.
 *
 * Order: T * R * SkX * S (translate, then rotate, then skew, then scale)
 *
 * @param {{
 *   translateX: number|string|Decimal,
 *   translateY: number|string|Decimal,
 *   rotation: number|string|Decimal,
 *   scaleX: number|string|Decimal,
 *   scaleY: number|string|Decimal,
 *   skewX: number|string|Decimal,
 *   skewY?: number|string|Decimal
 * }} components - Transform components
 * @returns {Matrix} 3x3 transformation matrix
 */
export function composeTransform(components) {
  const {
    translateX,
    translateY,
    rotation,
    scaleX,
    scaleY,
    skewX,
    skewY = 0,
  } = components;

  // Build matrices
  const T = translationMatrix(translateX, translateY);
  const R = rotationMatrix(rotation);
  const SkX = skewXMatrix(skewX);
  const SkY = skewYMatrix(skewY);
  const S = scaleMatrix(scaleX, scaleY);

  // Compose: T * R * SkY * SkX * S
  // Note: Matrix.mul does right multiplication, so we chain left-to-right
  return T.mul(R).mul(SkY).mul(SkX).mul(S);
}

/**
 * Compose a transformation matrix without skew.
 *
 * @param {{
 *   translateX: number|string|Decimal,
 *   translateY: number|string|Decimal,
 *   rotation: number|string|Decimal,
 *   scaleX: number|string|Decimal,
 *   scaleY: number|string|Decimal
 * }} components - Transform components
 * @returns {Matrix} 3x3 transformation matrix
 */
export function composeTransformNoSkew(components) {
  const { translateX, translateY, rotation, scaleX, scaleY } = components;

  const T = translationMatrix(translateX, translateY);
  const R = rotationMatrix(rotation);
  const S = scaleMatrix(scaleX, scaleY);

  return T.mul(R).mul(S);
}

// ============================================================================
// Verification Utilities
// ============================================================================

/**
 * Calculate the maximum absolute difference between two matrices.
 *
 * @param {Matrix} m1 - First matrix
 * @param {Matrix} m2 - Second matrix
 * @returns {Decimal} Maximum absolute difference
 */
export function matrixMaxDifference(m1, m2) {
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
 *
 * @param {Matrix} m1 - First matrix
 * @param {Matrix} m2 - Second matrix
 * @param {Decimal} [tolerance=VERIFICATION_TOLERANCE] - Maximum allowed difference
 * @returns {boolean} True if matrices are equal within tolerance
 */
export function matricesEqual(m1, m2, tolerance = VERIFICATION_TOLERANCE) {
  return matrixMaxDifference(m1, m2).lessThan(D(tolerance));
}

/**
 * Verify a decomposition by recomposing and comparing to original.
 *
 * @param {Matrix} original - Original matrix
 * @param {Object} decomposition - Decomposition result from decomposeMatrix
 * @returns {{verified: boolean, maxError: Decimal}}
 */
export function verifyDecomposition(original, decomposition) {
  const recomposed = composeTransform(decomposition);
  const maxError = matrixMaxDifference(original, recomposed);
  return {
    verified: maxError.lessThan(VERIFICATION_TOLERANCE),
    maxError,
  };
}

// ============================================================================
// SVG Transform String Parsing/Generation
// ============================================================================

/**
 * Create a matrix from SVG transform string values [a, b, c, d, e, f].
 *
 * SVG matrix(a, b, c, d, e, f) corresponds to:
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 *
 * @param {number|string|Decimal} a - Scale X
 * @param {number|string|Decimal} b - Skew Y
 * @param {number|string|Decimal} c - Skew X
 * @param {number|string|Decimal} d - Scale Y
 * @param {number|string|Decimal} e - Translate X
 * @param {number|string|Decimal} f - Translate Y
 * @returns {Matrix} 3x3 transformation matrix
 */
export function matrixFromSVGValues(a, b, c, d, e, f) {
  return Matrix.from([
    [D(a), D(c), D(e)],
    [D(b), D(d), D(f)],
    [0, 0, 1],
  ]);
}

/**
 * Convert a matrix to SVG transform string values [a, b, c, d, e, f].
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @param {number} [precision=6] - Decimal places for output
 * @returns {{a: string, b: string, c: string, d: string, e: string, f: string}}
 */
export function matrixToSVGValues(matrix, precision = 6) {
  const data = matrix.data;
  return {
    a: data[0][0].toFixed(precision),
    b: data[1][0].toFixed(precision),
    c: data[0][1].toFixed(precision),
    d: data[1][1].toFixed(precision),
    e: data[0][2].toFixed(precision),
    f: data[1][2].toFixed(precision),
  };
}

/**
 * Convert decomposition to SVG transform string.
 *
 * @param {Object} decomposition - Decomposition result
 * @param {number} [precision=6] - Decimal places for output
 * @returns {string} SVG transform string
 */
export function decompositionToSVGString(decomposition, precision = 6) {
  const { translateX, translateY, rotation, scaleX, scaleY, skewX, skewY } =
    decomposition;

  const parts = [];

  // Add translate if non-zero
  if (
    !D(translateX).abs().lessThan(EPSILON) ||
    !D(translateY).abs().lessThan(EPSILON)
  ) {
    parts.push(
      `translate(${D(translateX).toFixed(precision)}, ${D(translateY).toFixed(precision)})`,
    );
  }

  // Add rotate if non-zero
  const PI = Decimal.acos(-1);
  const rotationDegrees = D(rotation).mul(180).div(PI);
  if (!rotationDegrees.abs().lessThan(EPSILON)) {
    parts.push(`rotate(${rotationDegrees.toFixed(precision)})`);
  }

  // Add skewX if non-zero
  if (skewX && !D(skewX).abs().lessThan(EPSILON)) {
    const skewXDegrees = D(skewX).mul(180).div(PI);
    parts.push(`skewX(${skewXDegrees.toFixed(precision)})`);
  }

  // Add skewY if non-zero
  if (skewY && !D(skewY).abs().lessThan(EPSILON)) {
    const skewYDegrees = D(skewY).mul(180).div(PI);
    parts.push(`skewY(${skewYDegrees.toFixed(precision)})`);
  }

  // Add scale if not identity
  const sxIsOne = D(scaleX).minus(1).abs().lessThan(EPSILON);
  const syIsOne = D(scaleY).minus(1).abs().lessThan(EPSILON);

  if (!sxIsOne || !syIsOne) {
    if (D(scaleX).minus(D(scaleY)).abs().lessThan(EPSILON)) {
      parts.push(`scale(${D(scaleX).toFixed(precision)})`);
    } else {
      parts.push(
        `scale(${D(scaleX).toFixed(precision)}, ${D(scaleY).toFixed(precision)})`,
      );
    }
  }

  return parts.length > 0 ? parts.join(" ") : "";
}

/**
 * Convert matrix to minimal SVG transform string.
 *
 * Decomposes the matrix and outputs the shortest valid representation.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @param {number} [precision=6] - Decimal places for output
 * @returns {{transform: string, isIdentity: boolean, verified: boolean}}
 */
export function matrixToMinimalSVGTransform(matrix, precision = 6) {
  // Check if identity
  const identity = Matrix.identity(3);
  if (matricesEqual(matrix, identity, EPSILON)) {
    return { transform: "", isIdentity: true, verified: true };
  }

  // Decompose
  const decomposition = decomposeMatrix(matrix);

  // Generate string
  const transform = decompositionToSVGString(decomposition, precision);

  return {
    transform,
    isIdentity: false,
    verified: decomposition.verified,
  };
}

// ============================================================================
// Special Cases
// ============================================================================

/**
 * Check if a matrix represents a pure translation.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{isTranslation: boolean, tx: Decimal, ty: Decimal}}
 */
export function isPureTranslation(matrix) {
  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  const isIdentityLinear =
    a.minus(1).abs().lessThan(EPSILON) &&
    b.abs().lessThan(EPSILON) &&
    c.abs().lessThan(EPSILON) &&
    d.minus(1).abs().lessThan(EPSILON);

  return {
    isTranslation: isIdentityLinear,
    tx,
    ty,
  };
}

/**
 * Check if a matrix represents a pure rotation (around origin).
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{isRotation: boolean, angle: Decimal}}
 */
export function isPureRotation(matrix) {
  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  // Check no translation
  if (!tx.abs().lessThan(EPSILON) || !ty.abs().lessThan(EPSILON)) {
    return { isRotation: false, angle: D(0) };
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

  if (orthogonal && unitNorm && detOne) {
    const angle = Decimal.atan2(b, a);
    return { isRotation: true, angle };
  }

  return { isRotation: false, angle: D(0) };
}

/**
 * Check if a matrix represents a pure scale (uniform or non-uniform).
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {{isScale: boolean, scaleX: Decimal, scaleY: Decimal, isUniform: boolean}}
 */
export function isPureScale(matrix) {
  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  // Check no translation
  if (!tx.abs().lessThan(EPSILON) || !ty.abs().lessThan(EPSILON)) {
    return { isScale: false, scaleX: D(1), scaleY: D(1), isUniform: false };
  }

  // Check diagonal: b = 0, c = 0
  if (!b.abs().lessThan(EPSILON) || !c.abs().lessThan(EPSILON)) {
    return { isScale: false, scaleX: D(1), scaleY: D(1), isUniform: false };
  }

  const isUniform = a.minus(d).abs().lessThan(EPSILON);

  return {
    isScale: true,
    scaleX: a,
    scaleY: d,
    isUniform,
  };
}

/**
 * Check if a matrix is the identity matrix.
 *
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @returns {boolean} True if identity
 */
export function isIdentityMatrix(matrix) {
  const identity = Matrix.identity(3);
  return matricesEqual(matrix, identity, EPSILON);
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
  scaleMatrix,
  skewXMatrix,
  skewYMatrix,
  extractLinearPart,
  extractTranslation,

  // Decomposition
  decomposeMatrix,
  decomposeMatrixNoSkew,
  decomposeMatrixCSS,
  decomposeMatrixSVG,

  // Composition
  composeTransform,
  composeTransformNoSkew,

  // Verification
  matrixMaxDifference,
  matricesEqual,
  verifyDecomposition,

  // SVG utilities
  matrixFromSVGValues,
  matrixToSVGValues,
  decompositionToSVGString,
  matrixToMinimalSVGTransform,

  // Special cases
  isPureTranslation,
  isPureRotation,
  isPureScale,
  isIdentityMatrix,

  // Constants
  EPSILON,
  VERIFICATION_TOLERANCE,
};
