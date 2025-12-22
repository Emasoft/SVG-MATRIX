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
 * @throws {TypeError} If tx or ty is null or undefined
 */
export function translationMatrix(tx, ty) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (tx == null)
    throw new TypeError("translationMatrix: tx parameter is required");
  if (ty == null)
    throw new TypeError("translationMatrix: ty parameter is required");
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
 * @throws {TypeError} If angle is null or undefined
 */
export function rotationMatrix(angle) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (angle == null)
    throw new TypeError("rotationMatrix: angle parameter is required");
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
 * @throws {TypeError} If sx or sy is null or undefined
 */
export function scaleMatrix(sx, sy) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (sx == null) throw new TypeError("scaleMatrix: sx parameter is required");
  if (sy == null) throw new TypeError("scaleMatrix: sy parameter is required");
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
 * @throws {TypeError} If angle is null or undefined
 */
export function skewXMatrix(angle) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (angle == null)
    throw new TypeError("skewXMatrix: angle parameter is required");
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
 * @throws {TypeError} If angle is null or undefined
 */
export function skewYMatrix(angle) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (angle == null)
    throw new TypeError("skewYMatrix: angle parameter is required");
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
 * @throws {TypeError} If matrix is null or undefined
 * @throws {RangeError} If matrix is not at least 2x2
 */
export function extractLinearPart(matrix) {
  // Parameter validation: why - accessing matrix.data without validation will crash on null
  if (!matrix)
    throw new TypeError("extractLinearPart: matrix parameter is required");
  if (!matrix.data)
    throw new TypeError("extractLinearPart: matrix must have data property");
  // Bounds checking: why - accessing out of bounds indices will return undefined causing errors
  if (matrix.rows < 2 || matrix.cols < 2) {
    throw new RangeError("extractLinearPart: matrix must be at least 2x2");
  }
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
 * @throws {TypeError} If matrix is null or undefined
 * @throws {RangeError} If matrix is not at least 2x3
 */
export function extractTranslation(matrix) {
  // Parameter validation: why - accessing matrix.data without validation will crash on null
  if (!matrix)
    throw new TypeError("extractTranslation: matrix parameter is required");
  if (!matrix.data)
    throw new TypeError("extractTranslation: matrix must have data property");
  // Bounds checking: why - accessing out of bounds indices will return undefined causing errors
  if (matrix.rows < 2 || matrix.cols < 3) {
    throw new RangeError("extractTranslation: matrix must be at least 2x3");
  }
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
 * @throws {TypeError} If matrix is null or undefined
 */
export function decomposeMatrix(matrix) {
  // Parameter validation: why - extractLinearPart/extractTranslation will validate, but we document it here
  if (!matrix)
    throw new TypeError("decomposeMatrix: matrix parameter is required");

  const { a, b, c, d } = extractLinearPart(matrix);
  const { tx, ty } = extractTranslation(matrix);

  // Calculate determinant to detect reflection
  const det = a.mul(d).minus(b.mul(c));

  // Calculate scale factors using column norms
  let scaleX = a.mul(a).plus(b.mul(b)).sqrt();

  // Check for singular matrix (scaleX = 0) before division: why - prevents division by zero
  if (scaleX.abs().lessThan(EPSILON)) {
    // Handle degenerate/singular matrix case (e.g., scale(0, y))
    return {
      translateX: tx, // BUG FIX: preserve translation from input matrix, not zero
      translateY: ty, // BUG FIX: preserve translation from input matrix, not zero
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

  // Handle reflection (negative determinant): why - negative determinant means reflection
  // We put the reflection in scaleX
  if (det.lessThan(0)) {
    scaleX = scaleX.neg();
  }

  // Calculate rotation angle from first column
  const rotation = Decimal.atan2(b, a);

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

  // Rotate back to get the scale+skew matrix: why - separates rotation from scale+skew
  const aPrime = a.mul(cosTheta).plus(b.mul(sinTheta));
  const cPrime = c.mul(cosTheta).plus(d.mul(sinTheta));
  // Note: bPrime and dPrime are not used in this decomposition approach

  // Now [aPrime cPrime] should be [scaleX, scaleX*tan(skewX)]
  //     [bPrime dPrime]           [0,      scaleY           ]

  // Calculate skewX from tan(skewX) = cPrime/aPrime
  let skewX;
  if (aPrime.abs().greaterThan(EPSILON)) {
    // skewX = atan(cPrime/aPrime) because tan(skewX) = cPrime/aPrime
    skewX = Decimal.atan(cPrime.div(aPrime));
  } else {
    // If aPrime is near zero, skewX is undefined or π/2
    skewX = D(0);
  }

  // LIMITATION: This decomposition order (T * R * SkX * S) can only handle skewX.
  // A matrix with both skewX and skewY cannot be uniquely decomposed into this form.
  // To decompose matrices with skewY, a different decomposition order would be needed
  // (e.g., T * R * SkY * SkX * S), but that would change the semantic meaning.
  // For standard 2D affine transforms, skewY is typically 0.
  const skewY = D(0);

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
 * @throws {TypeError} If matrix is null or undefined
 */
export function decomposeMatrixNoSkew(matrix) {
  // Parameter validation: why - extractLinearPart/extractTranslation will validate, but we document it here
  if (!matrix)
    throw new TypeError("decomposeMatrixNoSkew: matrix parameter is required");

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
 * @throws {TypeError} If components is null or missing required properties
 */
export function composeTransform(components) {
  // Parameter validation: why - accessing properties of null/undefined will crash
  if (!components)
    throw new TypeError("composeTransform: components parameter is required");
  if (components.translateX == null)
    throw new TypeError("composeTransform: components.translateX is required");
  if (components.translateY == null)
    throw new TypeError("composeTransform: components.translateY is required");
  if (components.rotation == null)
    throw new TypeError("composeTransform: components.rotation is required");
  if (components.scaleX == null)
    throw new TypeError("composeTransform: components.scaleX is required");
  if (components.scaleY == null)
    throw new TypeError("composeTransform: components.scaleY is required");
  if (components.skewX == null)
    throw new TypeError("composeTransform: components.skewX is required");

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
 * @throws {TypeError} If components is null or missing required properties
 */
export function composeTransformNoSkew(components) {
  // Parameter validation: why - accessing properties of null/undefined will crash
  if (!components)
    throw new TypeError(
      "composeTransformNoSkew: components parameter is required",
    );
  if (components.translateX == null)
    throw new TypeError(
      "composeTransformNoSkew: components.translateX is required",
    );
  if (components.translateY == null)
    throw new TypeError(
      "composeTransformNoSkew: components.translateY is required",
    );
  if (components.rotation == null)
    throw new TypeError(
      "composeTransformNoSkew: components.rotation is required",
    );
  if (components.scaleX == null)
    throw new TypeError(
      "composeTransformNoSkew: components.scaleX is required",
    );
  if (components.scaleY == null)
    throw new TypeError(
      "composeTransformNoSkew: components.scaleY is required",
    );

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
 * @throws {TypeError} If m1 or m2 is null or undefined
 * @throws {RangeError} If matrices have different dimensions
 */
export function matrixMaxDifference(m1, m2) {
  // Parameter validation: why - accessing properties of null/undefined will crash
  if (!m1) throw new TypeError("matrixMaxDifference: m1 parameter is required");
  if (!m2) throw new TypeError("matrixMaxDifference: m2 parameter is required");
  if (!m1.data)
    throw new TypeError("matrixMaxDifference: m1 must have data property");
  if (!m2.data)
    throw new TypeError("matrixMaxDifference: m2 must have data property");
  // Dimension validation: why - comparing different sized matrices makes no sense
  if (m1.rows !== m2.rows || m1.cols !== m2.cols) {
    throw new RangeError(
      `matrixMaxDifference: matrices must have same dimensions (${m1.rows}x${m1.cols} vs ${m2.rows}x${m2.cols})`,
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
 * @throws {TypeError} If original or decomposition is null or undefined
 */
export function verifyDecomposition(original, decomposition) {
  // Parameter validation: why - prevents crashes when accessing properties
  if (!original)
    throw new TypeError("verifyDecomposition: original parameter is required");
  if (!decomposition)
    throw new TypeError(
      "verifyDecomposition: decomposition parameter is required",
    );

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
 * @throws {TypeError} If any parameter is null or undefined
 */
export function matrixFromSVGValues(a, b, c, d, e, f) {
  // Parameter validation: why - D() cannot convert null/undefined to meaningful values
  if (a == null)
    throw new TypeError("matrixFromSVGValues: a parameter is required");
  if (b == null)
    throw new TypeError("matrixFromSVGValues: b parameter is required");
  if (c == null)
    throw new TypeError("matrixFromSVGValues: c parameter is required");
  if (d == null)
    throw new TypeError("matrixFromSVGValues: d parameter is required");
  if (e == null)
    throw new TypeError("matrixFromSVGValues: e parameter is required");
  if (f == null)
    throw new TypeError("matrixFromSVGValues: f parameter is required");

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
 * @throws {TypeError} If matrix is null or undefined
 * @throws {RangeError} If matrix is not at least 2x3 or precision is negative
 */
export function matrixToSVGValues(matrix, precision = 6) {
  // Parameter validation: why - accessing matrix.data without validation will crash on null
  if (!matrix)
    throw new TypeError("matrixToSVGValues: matrix parameter is required");
  if (!matrix.data)
    throw new TypeError("matrixToSVGValues: matrix must have data property");
  // Bounds checking: why - accessing out of bounds indices will return undefined causing errors
  if (matrix.rows < 2 || matrix.cols < 3) {
    throw new RangeError("matrixToSVGValues: matrix must be at least 2x3");
  }
  // Precision validation: why - negative precision makes no sense
  if (precision < 0 || !Number.isInteger(precision)) {
    throw new RangeError(
      "matrixToSVGValues: precision must be a non-negative integer",
    );
  }

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
 * @throws {TypeError} If decomposition is null or missing required properties
 * @throws {RangeError} If precision is negative
 */
export function decompositionToSVGString(decomposition, precision = 6) {
  // Parameter validation: why - accessing properties of null/undefined will crash
  if (!decomposition)
    throw new TypeError(
      "decompositionToSVGString: decomposition parameter is required",
    );
  if (decomposition.translateX == null)
    throw new TypeError(
      "decompositionToSVGString: decomposition.translateX is required",
    );
  if (decomposition.translateY == null)
    throw new TypeError(
      "decompositionToSVGString: decomposition.translateY is required",
    );
  if (decomposition.rotation == null)
    throw new TypeError(
      "decompositionToSVGString: decomposition.rotation is required",
    );
  if (decomposition.scaleX == null)
    throw new TypeError(
      "decompositionToSVGString: decomposition.scaleX is required",
    );
  if (decomposition.scaleY == null)
    throw new TypeError(
      "decompositionToSVGString: decomposition.scaleY is required",
    );
  // Precision validation: why - negative precision makes no sense
  if (precision < 0 || !Number.isInteger(precision)) {
    throw new RangeError(
      "decompositionToSVGString: precision must be a non-negative integer",
    );
  }

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
 * @throws {TypeError} If matrix is null or undefined
 * @throws {RangeError} If precision is negative
 */
export function matrixToMinimalSVGTransform(matrix, precision = 6) {
  // Parameter validation: why - prevents crashes when accessing properties
  if (!matrix)
    throw new TypeError(
      "matrixToMinimalSVGTransform: matrix parameter is required",
    );
  // Precision validation: why - negative precision makes no sense
  if (precision < 0 || !Number.isInteger(precision)) {
    throw new RangeError(
      "matrixToMinimalSVGTransform: precision must be a non-negative integer",
    );
  }

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
 * @throws {TypeError} If matrix is null or undefined
 */
export function isPureTranslation(matrix) {
  // Parameter validation: why - extractLinearPart/extractTranslation will validate, but we document it here
  if (!matrix)
    throw new TypeError("isPureTranslation: matrix parameter is required");

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
 * @throws {TypeError} If matrix is null or undefined
 */
export function isPureRotation(matrix) {
  // Parameter validation: why - extractLinearPart/extractTranslation will validate, but we document it here
  if (!matrix)
    throw new TypeError("isPureRotation: matrix parameter is required");

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
 * @throws {TypeError} If matrix is null or undefined
 */
export function isPureScale(matrix) {
  // Parameter validation: why - extractLinearPart/extractTranslation will validate, but we document it here
  if (!matrix) throw new TypeError("isPureScale: matrix parameter is required");

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
 * @throws {TypeError} If matrix is null or undefined
 */
export function isIdentityMatrix(matrix) {
  // Parameter validation: why - matricesEqual will validate, but we document it here
  if (!matrix)
    throw new TypeError("isIdentityMatrix: matrix parameter is required");

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
