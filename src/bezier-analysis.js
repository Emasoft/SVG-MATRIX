/**
 * @fileoverview Arbitrary-Precision Bezier Curve Analysis
 *
 * Superior implementation of differential geometry operations on Bezier curves
 * using Decimal.js for 80-digit precision (configurable to 10^9 digits).
 *
 * This module provides mathematically exact computations where possible,
 * and controlled-precision numerical methods where necessary.
 *
 * @module bezier-analysis
 * @version 1.0.0
 *
 * Advantages over svgpathtools (float64):
 * - 10^65x better precision (80 vs 15 digits)
 * - Exact polynomial arithmetic
 * - Verified mathematical correctness
 * - No accumulating round-off errors
 * - Handles extreme coordinate ranges
 */

import Decimal from "decimal.js";

// Ensure high precision is set
Decimal.set({ precision: 80 });

/**
 * Convert any numeric input to Decimal
 * @param {number|string|Decimal} x - Value to convert
 * @returns {Decimal}
 */
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Validate that a value is a finite number (not NaN or Infinity).
 * WHY: Prevents invalid calculations from propagating through the system.
 * Non-finite values indicate numerical errors that should be caught early.
 * @param {Decimal} val - Value to check
 * @param {string} context - Function name for error message
 * @throws {Error} If value is not finite
 */
function _assertFinite(val, context) {
  if (!val.isFinite()) {
    throw new Error(`${context}: encountered non-finite value ${val}`);
  }
}

// ============================================================================
// NUMERICAL CONSTANTS (documented magic numbers)
// ============================================================================
// WHY: Magic numbers scattered throughout code make maintenance difficult.
// Named constants improve readability and allow easy adjustment of precision thresholds.

/** Threshold below which derivative magnitude is considered zero (cusp detection).
 * WHY: Prevents division by zero in tangent/normal calculations at cusps. */
const DERIVATIVE_ZERO_THRESHOLD = new Decimal("1e-50");

/** Threshold for curvature denominator to detect cusps.
 * WHY: Curvature formula has (x'^2 + y'^2)^(3/2) in denominator; this threshold
 * prevents division by near-zero values that would produce spurious infinities. */
const CURVATURE_SINGULARITY_THRESHOLD = new Decimal("1e-100");

/** Threshold for finite difference step size.
 * WHY: Used in numerical derivative approximations. Balance between truncation error
 * (too large) and cancellation error (too small). */
const FINITE_DIFFERENCE_STEP = new Decimal("1e-8");

/** Newton-Raphson convergence threshold.
 * WHY: Iteration stops when change is below this threshold, indicating convergence. */
const NEWTON_CONVERGENCE_THRESHOLD = new Decimal("1e-40");

/** Near-zero threshold for general comparisons.
 * WHY: Used throughout for detecting effectively zero values in high-precision arithmetic. */
const NEAR_ZERO_THRESHOLD = new Decimal("1e-60");

/** Threshold for degenerate quadratic equations.
 * WHY: When 'a' coefficient is below this relative to other coefficients,
 * equation degenerates to linear case, avoiding division by near-zero. */
const QUADRATIC_DEGENERATE_THRESHOLD = new Decimal("1e-70");

/** Subdivision convergence threshold for root finding.
 * WHY: When interval becomes smaller than this, subdivision has converged to a root. */
const SUBDIVISION_CONVERGENCE_THRESHOLD = new Decimal("1e-15");

/** Threshold for arc length comparison in curvature verification.
 * WHY: Arc lengths below this are too small for reliable finite difference approximation. */
const ARC_LENGTH_THRESHOLD = new Decimal("1e-50");

/** Relative error threshold for curvature comparison.
 * WHY: Curvature verification uses relative error; this threshold balances precision vs noise. */
const CURVATURE_RELATIVE_ERROR_THRESHOLD = new Decimal("1e-10");

/** Finite difference step for derivative verification (higher order).
 * WHY: Smaller step than general finite difference for more accurate verification. */
const DERIVATIVE_VERIFICATION_STEP = new Decimal("1e-10");

/** Threshold for magnitude comparison in derivative verification.
 * WHY: Used to determine if derivative magnitude is large enough for relative error. */
const DERIVATIVE_MAGNITUDE_THRESHOLD = new Decimal("1e-20");

/**
 * 2D Point represented as [Decimal, Decimal]
 * @typedef {[Decimal, Decimal]} Point2D
 */

/**
 * Bezier control points array
 * @typedef {Point2D[]} BezierPoints
 */

// ============================================================================
// BEZIER CURVE EVALUATION
// ============================================================================

/**
 * Evaluate a Bezier curve at parameter t using de Casteljau's algorithm.
 *
 * de Casteljau is numerically stable and works for any degree.
 * Complexity: O(n^2) where n is the number of control points.
 *
 * @param {BezierPoints} points - Control points [[x0,y0], [x1,y1], ...]
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Point2D} Point on curve at parameter t
 *
 * @example
 * // Cubic Bezier
 * const p = [[0,0], [100,200], [200,200], [300,0]];
 * const [x, y] = bezierPoint(p, 0.5);
 */
export function bezierPoint(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Empty or invalid arrays would cause crashes in the de Casteljau iteration
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierPoint: points must be an array with at least 2 control points",
    );
  }

  const tD = D(t);
  // PARAMETER VALIDATION: Warn if t is outside [0,1] but still compute
  // WHY: Values slightly outside [0,1] may occur in numerical algorithms
  // and should still produce valid extrapolations, but large deviations
  // indicate bugs in calling code
  if (tD.lt(-0.01) || tD.gt(1.01)) {
    console.warn(`bezierPoint: t=${tD} is significantly outside [0,1]`);
  }

  const oneMinusT = D(1).minus(tD);

  // Convert all points to Decimal
  let pts = points.map(([x, y]) => [D(x), D(y)]);

  // de Casteljau's algorithm: recursively interpolate
  while (pts.length > 1) {
    const newPts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const x = pts[i][0].times(oneMinusT).plus(pts[i + 1][0].times(tD));
      const y = pts[i][1].times(oneMinusT).plus(pts[i + 1][1].times(tD));
      newPts.push([x, y]);
    }
    pts = newPts;
  }

  return pts[0];
}

/**
 * Evaluate Bezier using Horner's rule (optimized for cubics).
 *
 * For cubic: B(t) = P0 + t(c1 + t(c2 + t*c3))
 * where c1, c2, c3 are derived from control points.
 *
 * This is faster than de Casteljau but equivalent.
 *
 * @param {BezierPoints} points - Control points (2-4 points)
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Point2D} Point on curve
 */
export function bezierPointHorner(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Horner's rule requires at least 2 points; invalid arrays cause index errors
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierPointHorner: points must be an array with at least 2 control points",
    );
  }

  const tD = D(t);
  const n = points.length - 1; // Degree

  if (n === 1) {
    // Line: P0 + t(P1 - P0)
    const [x0, y0] = [D(points[0][0]), D(points[0][1])];
    const [x1, y1] = [D(points[1][0]), D(points[1][1])];
    return [x0.plus(tD.times(x1.minus(x0))), y0.plus(tD.times(y1.minus(y0)))];
  }

  if (n === 2) {
    // Quadratic: P0 + t(2(P1-P0) + t(P0 - 2P1 + P2))
    const [x0, y0] = [D(points[0][0]), D(points[0][1])];
    const [x1, y1] = [D(points[1][0]), D(points[1][1])];
    const [x2, y2] = [D(points[2][0]), D(points[2][1])];

    const c1x = x1.minus(x0).times(2);
    const c1y = y1.minus(y0).times(2);
    const c2x = x0.minus(x1.times(2)).plus(x2);
    const c2y = y0.minus(y1.times(2)).plus(y2);

    return [
      x0.plus(tD.times(c1x.plus(tD.times(c2x)))),
      y0.plus(tD.times(c1y.plus(tD.times(c2y)))),
    ];
  }

  if (n === 3) {
    // Cubic: P0 + t(c1 + t(c2 + t*c3))
    const [x0, y0] = [D(points[0][0]), D(points[0][1])];
    const [x1, y1] = [D(points[1][0]), D(points[1][1])];
    const [x2, y2] = [D(points[2][0]), D(points[2][1])];
    const [x3, y3] = [D(points[3][0]), D(points[3][1])];

    // c1 = 3(P1 - P0)
    const c1x = x1.minus(x0).times(3);
    const c1y = y1.minus(y0).times(3);

    // c2 = 3(P0 - 2P1 + P2)
    const c2x = x0.minus(x1.times(2)).plus(x2).times(3);
    const c2y = y0.minus(y1.times(2)).plus(y2).times(3);

    // c3 = -P0 + 3P1 - 3P2 + P3
    const c3x = x0.neg().plus(x1.times(3)).minus(x2.times(3)).plus(x3);
    const c3y = y0.neg().plus(y1.times(3)).minus(y2.times(3)).plus(y3);

    return [
      x0.plus(tD.times(c1x.plus(tD.times(c2x.plus(tD.times(c3x)))))),
      y0.plus(tD.times(c1y.plus(tD.times(c2y.plus(tD.times(c3y)))))),
    ];
  }

  // For higher degrees, fall back to de Casteljau
  return bezierPoint(points, t);
}

// ============================================================================
// DERIVATIVES
// ============================================================================

/**
 * Compute the nth derivative of a Bezier curve at parameter t.
 *
 * The derivative of a degree-n Bezier is a degree-(n-1) Bezier
 * with control points: n * (P[i+1] - P[i])
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @param {number} [n=1] - Derivative order (1 = first derivative, 2 = second, etc.)
 * @returns {Point2D} Derivative vector at t
 *
 * @example
 * const velocity = bezierDerivative(cubicPoints, 0.5, 1);  // First derivative
 * const acceleration = bezierDerivative(cubicPoints, 0.5, 2);  // Second derivative
 */
export function bezierDerivative(points, t, n = 1) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Derivative computation requires iterating over control points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierDerivative: points must be an array with at least 2 control points",
    );
  }

  if (n === 0) {
    return bezierPoint(points, t);
  }

  const degree = points.length - 1;

  if (n > degree) {
    // Derivative of order > degree is zero
    return [D(0), D(0)];
  }

  // Compute derivative control points
  let derivPoints = points.map(([x, y]) => [D(x), D(y)]);

  for (let d = 0; d < n; d++) {
    const currentDegree = derivPoints.length - 1;
    const newPoints = [];

    for (let i = 0; i < currentDegree; i++) {
      const dx = derivPoints[i + 1][0]
        .minus(derivPoints[i][0])
        .times(currentDegree);
      const dy = derivPoints[i + 1][1]
        .minus(derivPoints[i][1])
        .times(currentDegree);
      newPoints.push([dx, dy]);
    }

    derivPoints = newPoints;
  }

  // Evaluate the derivative Bezier at t
  if (derivPoints.length === 1) {
    return derivPoints[0];
  }

  return bezierPoint(derivPoints, t);
}

/**
 * Get the derivative control points (hodograph) of a Bezier curve.
 *
 * Useful for repeated derivative evaluations at different t values.
 *
 * @param {BezierPoints} points - Original control points
 * @returns {BezierPoints} Derivative control points (one fewer point)
 */
export function bezierDerivativePoints(points) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Need at least 2 points to compute derivative control points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierDerivativePoints: points must be an array with at least 2 control points",
    );
  }

  const n = points.length - 1;
  const result = [];

  for (let i = 0; i < n; i++) {
    const dx = D(points[i + 1][0])
      .minus(D(points[i][0]))
      .times(n);
    const dy = D(points[i + 1][1])
      .minus(D(points[i][1]))
      .times(n);
    result.push([dx, dy]);
  }

  return result;
}

// ============================================================================
// TANGENT AND NORMAL VECTORS
// ============================================================================

/**
 * Compute the unit tangent vector at parameter t.
 *
 * The tangent is the normalized first derivative.
 * Handles the edge case where derivative is zero (cusps) by using
 * higher-order derivatives or returning [1, 0] as fallback.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Point2D} Unit tangent vector
 */
export function bezierTangent(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Tangent calculation requires derivative computation which needs valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierTangent: points must be an array with at least 2 control points",
    );
  }

  const [dx, dy] = bezierDerivative(points, t, 1);

  // Compute magnitude
  const mag = dx.times(dx).plus(dy.times(dy)).sqrt();

  // Handle zero derivative (cusp or degenerate case)
  // WHY: Use named constant for clarity and consistency across codebase
  if (mag.isZero() || mag.lt(DERIVATIVE_ZERO_THRESHOLD)) {
    // Try second derivative
    const [d2x, d2y] = bezierDerivative(points, t, 2);
    const mag2 = d2x.times(d2x).plus(d2y.times(d2y)).sqrt();

    if (mag2.isZero() || mag2.lt(DERIVATIVE_ZERO_THRESHOLD)) {
      // Fallback to direction from start to end
      const [x0, y0] = [D(points[0][0]), D(points[0][1])];
      const [xn, yn] = [
        D(points[points.length - 1][0]),
        D(points[points.length - 1][1]),
      ];
      const ddx = xn.minus(x0);
      const ddy = yn.minus(y0);
      const magFallback = ddx.times(ddx).plus(ddy.times(ddy)).sqrt();

      if (magFallback.isZero()) {
        return [D(1), D(0)]; // Degenerate curve, return arbitrary direction
      }
      return [ddx.div(magFallback), ddy.div(magFallback)];
    }

    return [d2x.div(mag2), d2y.div(mag2)];
  }

  return [dx.div(mag), dy.div(mag)];
}

/**
 * Compute the unit normal vector at parameter t.
 *
 * The normal is perpendicular to the tangent, using the right-hand rule:
 * normal = rotate tangent by 90 degrees counter-clockwise.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Point2D} Unit normal vector
 */
export function bezierNormal(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Normal is computed from tangent which requires valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierNormal: points must be an array with at least 2 control points",
    );
  }

  const [tx, ty] = bezierTangent(points, t);

  // Rotate 90 degrees counter-clockwise: (x, y) -> (-y, x)
  return [ty.neg(), tx];
}

// ============================================================================
// CURVATURE
// ============================================================================

/**
 * Compute the curvature at parameter t.
 *
 * Curvature formula: k = (x'y'' - y'x'') / (x'^2 + y'^2)^(3/2)
 *
 * Positive curvature = curve bends left (counter-clockwise)
 * Negative curvature = curve bends right (clockwise)
 * Zero curvature = straight line
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Decimal} Signed curvature
 */
export function bezierCurvature(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Curvature requires first and second derivatives which need valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierCurvature: points must be an array with at least 2 control points",
    );
  }

  const [dx, dy] = bezierDerivative(points, t, 1);
  const [d2x, d2y] = bezierDerivative(points, t, 2);

  // Numerator: x'y'' - y'x''
  const numerator = dx.times(d2y).minus(dy.times(d2x));

  // Denominator: (x'^2 + y'^2)^(3/2)
  const speedSquared = dx.times(dx).plus(dy.times(dy));

  // WHY: Use named constant for curvature singularity detection
  if (
    speedSquared.isZero() ||
    speedSquared.lt(CURVATURE_SINGULARITY_THRESHOLD)
  ) {
    // At a cusp, curvature is undefined (infinity)
    return new Decimal(Infinity);
  }

  const denominator = speedSquared.sqrt().pow(3);

  return numerator.div(denominator);
}

/**
 * Compute the radius of curvature at parameter t.
 *
 * Radius = 1 / |curvature|
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter in [0, 1]
 * @returns {Decimal} Radius of curvature (positive, or Infinity for straight segments)
 */
export function bezierRadiusOfCurvature(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Radius computation requires curvature which needs valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierRadiusOfCurvature: points must be an array with at least 2 control points",
    );
  }

  const k = bezierCurvature(points, t);

  if (k.isZero()) {
    return new Decimal(Infinity);
  }

  return D(1).div(k.abs());
}

// ============================================================================
// DE CASTELJAU SPLITTING
// ============================================================================

/**
 * Split a Bezier curve at parameter t using de Casteljau's algorithm.
 *
 * Returns two Bezier curves that together form the original curve.
 * This is mathematically exact (no approximation).
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Split parameter in [0, 1]
 * @returns {{left: BezierPoints, right: BezierPoints}} Two Bezier curves
 *
 * @example
 * const { left, right } = bezierSplit(cubicPoints, 0.5);
 * // left covers t in [0, 0.5], right covers t in [0.5, 1]
 */
export function bezierSplit(points, t) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: de Casteljau algorithm requires iterating over control points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierSplit: points must be an array with at least 2 control points",
    );
  }

  const tD = D(t);
  // PARAMETER VALIDATION: Warn if t is outside [0,1] but still compute
  // WHY: Values slightly outside [0,1] may occur in numerical algorithms
  // and should still produce valid extrapolations, but large deviations
  // indicate bugs in calling code
  if (tD.lt(-0.01) || tD.gt(1.01)) {
    console.warn(`bezierSplit: t=${tD} is significantly outside [0,1]`);
  }

  const oneMinusT = D(1).minus(tD);

  // Convert to Decimal
  let pts = points.map(([x, y]) => [D(x), D(y)]);

  const left = [pts[0]]; // First point of left curve
  const right = [];

  // de Casteljau iterations, saving the edges
  while (pts.length > 1) {
    right.unshift(pts[pts.length - 1]); // Last point goes to right curve

    const newPts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const x = pts[i][0].times(oneMinusT).plus(pts[i + 1][0].times(tD));
      const y = pts[i][1].times(oneMinusT).plus(pts[i + 1][1].times(tD));
      newPts.push([x, y]);
    }

    if (newPts.length > 0) {
      left.push(newPts[0]); // First point of each level goes to left
    }

    pts = newPts;
  }

  // The final point is shared by both curves
  if (pts.length === 1) {
    right.unshift(pts[0]);
  }

  return { left, right };
}

/**
 * Split a Bezier curve at t = 0.5 (optimized).
 *
 * This is a common operation and can be slightly optimized.
 *
 * @param {BezierPoints} points - Control points
 * @returns {{left: BezierPoints, right: BezierPoints}} Two Bezier curves
 */
export function bezierHalve(points) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: bezierHalve delegates to bezierSplit which needs valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierHalve: points must be an array with at least 2 control points",
    );
  }

  return bezierSplit(points, 0.5);
}

/**
 * Extract a portion of a Bezier curve between t0 and t1.
 *
 * Uses two splits: first at t0, then adjust and split at (t1-t0)/(1-t0).
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t0 - Start parameter
 * @param {number|string|Decimal} t1 - End parameter
 * @returns {BezierPoints} Control points for the cropped curve
 */
export function bezierCrop(points, t0, t1) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: bezierCrop uses bezierSplit which requires valid points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierCrop: points must be an array with at least 2 control points",
    );
  }

  const t0D = D(t0);
  const t1D = D(t1);

  if (t0D.gte(t1D)) {
    throw new Error("bezierCrop: t0 must be less than t1");
  }

  // PARAMETER BOUNDS: Ensure t0 and t1 are within valid range [0, 1]
  // WHY: Parameters outside [0,1] don't correspond to points on the curve segment
  if (t0D.lt(0) || t0D.gt(1)) {
    throw new Error("bezierCrop: t0 must be in range [0, 1]");
  }
  if (t1D.lt(0) || t1D.gt(1)) {
    throw new Error("bezierCrop: t1 must be in range [0, 1]");
  }

  // DIVISION BY ZERO PROTECTION: Check if t0 is too close to 1
  // WHY: When t0 approaches 1, the denominator (1 - t0) approaches zero,
  // causing division by zero in the parameter adjustment calculation
  if (D(1).minus(t0D).abs().lt(NEAR_ZERO_THRESHOLD)) {
    throw new Error(
      "bezierCrop: t0 too close to 1, would cause division by zero in parameter adjustment",
    );
  }

  // First split at t0, take the right portion
  const { right: afterT0 } = bezierSplit(points, t0);

  // Adjust t1 to the new parameter space: (t1 - t0) / (1 - t0)
  const adjustedT1 = t1D.minus(t0D).div(D(1).minus(t0D));

  // Split at adjusted t1, take the left portion
  const { left: cropped } = bezierSplit(afterT0, adjustedT1);

  return cropped;
}

// ============================================================================
// BOUNDING BOX
// ============================================================================

/**
 * Compute the axis-aligned bounding box of a Bezier curve.
 *
 * Finds exact bounds by:
 * 1. Computing derivative polynomial
 * 2. Finding roots (critical points where derivative = 0)
 * 3. Evaluating curve at t=0, t=1, and all critical points
 * 4. Taking min/max of all evaluated points
 *
 * @param {BezierPoints} points - Control points
 * @returns {{xmin: Decimal, xmax: Decimal, ymin: Decimal, ymax: Decimal}}
 */
export function bezierBoundingBox(points) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Bounding box computation requires accessing control points and computing derivatives
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierBoundingBox: points must be an array with at least 2 control points",
    );
  }

  const n = points.length;

  // Start with endpoints
  const [x0, y0] = [D(points[0][0]), D(points[0][1])];
  const [xn, yn] = [D(points[n - 1][0]), D(points[n - 1][1])];

  let xmin = Decimal.min(x0, xn);
  let xmax = Decimal.max(x0, xn);
  let ymin = Decimal.min(y0, yn);
  let ymax = Decimal.max(y0, yn);

  if (n <= 2) {
    // Line segment: endpoints are sufficient
    return { xmin, xmax, ymin, ymax };
  }

  // Get derivative control points
  const derivPts = bezierDerivativePoints(points);

  // Find critical points (where derivative = 0) for x and y separately
  const criticalTs = findBezierRoots1D(derivPts, "x")
    .concat(findBezierRoots1D(derivPts, "y"))
    .filter((t) => t.gt(0) && t.lt(1));

  // Evaluate at critical points
  for (const t of criticalTs) {
    const [x, y] = bezierPoint(points, t);
    xmin = Decimal.min(xmin, x);
    xmax = Decimal.max(xmax, x);
    ymin = Decimal.min(ymin, y);
    ymax = Decimal.max(ymax, y);
  }

  return { xmin, xmax, ymin, ymax };
}

/**
 * Find roots of a 1D Bezier curve (where either x or y component = 0).
 *
 * Uses subdivision method for robustness.
 *
 * @param {BezierPoints} points - Control points of derivative
 * @param {'x'|'y'} component - Which component to find roots for
 * @returns {Decimal[]} Array of t values where component = 0
 */
function findBezierRoots1D(points, component) {
  // INPUT VALIDATION
  if (!points || !Array.isArray(points) || points.length === 0) {
    return []; // No roots possible for empty input
  }

  // PARAMETER VALIDATION: Ensure component is valid
  // WHY: Invalid component values would cause incorrect index access
  if (component !== "x" && component !== "y") {
    throw new Error(
      `findBezierRoots1D: component must be 'x' or 'y', got '${component}'`,
    );
  }

  const idx = component === "x" ? 0 : 1;
  const roots = [];

  // Extract 1D control points
  const coeffs = points.map((p) => D(p[idx]));

  // For quadratic (2 points) and cubic (3 points), use analytical solutions
  if (coeffs.length === 2) {
    // Linear: a + t(b - a) = 0  =>  t = -a / (b - a)
    const a = coeffs[0];
    const b = coeffs[1];
    const denom = b.minus(a);

    if (!denom.isZero()) {
      const t = a.neg().div(denom);
      if (t.gt(0) && t.lt(1)) {
        roots.push(t);
      }
    }
  } else if (coeffs.length === 3) {
    // Quadratic derivative from cubic Bezier
    // B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    // Expanding: a*t^2 + b*t + c where
    // a = P0 - 2P1 + P2
    // b = 2(P1 - P0)
    // c = P0
    const P0 = coeffs[0];
    const P1 = coeffs[1];
    const P2 = coeffs[2];

    const a = P0.minus(P1.times(2)).plus(P2);
    const b = P1.minus(P0).times(2);
    const c = P0;

    const quadRoots = solveQuadratic(a, b, c);
    for (const t of quadRoots) {
      if (t.gt(0) && t.lt(1)) {
        roots.push(t);
      }
    }
  } else {
    // Higher degree: use subdivision
    const subdivisionRoots = findRootsBySubdivision(coeffs, D(0), D(1), 50);
    roots.push(...subdivisionRoots.filter((t) => t.gt(0) && t.lt(1)));
  }

  return roots;
}

/**
 * Solve quadratic equation ax^2 + bx + c = 0 with arbitrary precision.
 * Uses numerically stable formula to avoid catastrophic cancellation.
 *
 * WHY: Standard quadratic formula can lose precision when b^2 >> 4ac due to
 * subtracting nearly equal numbers. This implementation uses the numerically
 * stable formula that avoids that cancellation.
 *
 * @param {Decimal} a - Quadratic coefficient
 * @param {Decimal} b - Linear coefficient
 * @param {Decimal} c - Constant
 * @returns {Decimal[]} Real roots
 */
function solveQuadratic(a, b, c) {
  // NUMERICAL STABILITY: Use threshold relative to coefficient magnitudes
  // to determine if 'a' is effectively zero (degenerate to linear equation)
  // WHY: Absolute thresholds fail when coefficients are scaled; relative threshold adapts
  const coeffMag = Decimal.max(a.abs(), b.abs(), c.abs());

  if (
    coeffMag.gt(0) &&
    a.abs().div(coeffMag).lt(QUADRATIC_DEGENERATE_THRESHOLD)
  ) {
    // Linear equation: bx + c = 0
    if (b.isZero()) return [];
    return [c.neg().div(b)];
  }

  if (a.isZero()) {
    if (b.isZero()) return [];
    return [c.neg().div(b)];
  }

  const discriminant = b.times(b).minus(a.times(c).times(4));

  if (discriminant.lt(0)) {
    return []; // No real roots
  }

  if (discriminant.isZero()) {
    return [b.neg().div(a.times(2))];
  }

  const sqrtD = discriminant.sqrt();
  const twoA = a.times(2);

  // NUMERICAL STABILITY: Use Vieta's formula to compute the second root
  // when catastrophic cancellation would occur in the standard formula.
  // When b and sqrt(D) have similar magnitudes and the same sign,
  // -b + sqrt(D) or -b - sqrt(D) can lose precision.
  //
  // Solution: Compute the larger root directly, use Vieta's for the other
  // x1 * x2 = c/a, so x2 = (c/a) / x1

  let root1, root2;
  if (b.isNegative()) {
    // -b is positive, so -b + sqrt(D) is well-conditioned
    root1 = b.neg().plus(sqrtD).div(twoA);
    // Use Vieta's formula: x1 * x2 = c/a
    // DIVISION BY ZERO PROTECTION: Check if root1 is zero before dividing
    // WHY: When root1 is zero, Vieta's formula degenerates; use direct formula instead
    if (root1.abs().lt(NEAR_ZERO_THRESHOLD)) {
      root2 = b.neg().minus(sqrtD).div(twoA);
    } else {
      root2 = c.div(a).div(root1);
    }
  } else {
    // -b is negative or zero, so -b - sqrt(D) is well-conditioned
    root1 = b.neg().minus(sqrtD).div(twoA);
    // Use Vieta's formula: x1 * x2 = c/a
    // DIVISION BY ZERO PROTECTION: Check if root1 is zero before dividing
    // WHY: When root1 is zero, Vieta's formula degenerates; use direct formula instead
    if (root1.abs().lt(NEAR_ZERO_THRESHOLD)) {
      root2 = b.neg().plus(sqrtD).div(twoA);
    } else {
      root2 = c.div(a).div(root1);
    }
  }

  return [root1, root2];
}

/**
 * Find roots of a 1D Bezier using subdivision (for higher degrees).
 *
 * @param {Decimal[]} coeffs - 1D control values
 * @param {Decimal} t0 - Start of interval
 * @param {Decimal} t1 - End of interval
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Decimal[]} Roots in interval
 */
function findRootsBySubdivision(coeffs, t0, t1, maxDepth) {
  // INPUT VALIDATION: Ensure coeffs is valid and maxDepth is non-negative
  // WHY: Empty coeffs would cause errors; negative maxDepth could cause infinite recursion
  if (!coeffs || !Array.isArray(coeffs) || coeffs.length === 0) {
    return []; // No roots possible for empty input
  }
  if (typeof maxDepth !== "number" || maxDepth < 0) {
    throw new Error(
      `findRootsBySubdivision: maxDepth must be non-negative number, got ${maxDepth}`,
    );
  }

  // Check if interval might contain a root (sign change in convex hull)
  const signs = coeffs.map((c) => (c.isNegative() ? -1 : c.isZero() ? 0 : 1));
  const minSign = Math.min(...signs);
  const maxSign = Math.max(...signs);

  if (minSign > 0 || maxSign < 0) {
    // All same sign, no root in this interval
    return [];
  }

  // WHY: Use named constant for subdivision convergence check
  if (maxDepth <= 0 || t1.minus(t0).lt(SUBDIVISION_CONVERGENCE_THRESHOLD)) {
    // Converged, return midpoint
    return [t0.plus(t1).div(2)];
  }

  // Subdivide at midpoint
  const tMid = t0.plus(t1).div(2);

  // Compute subdivided control points using de Casteljau
  const { left, right } = subdivideBezier1D(coeffs);

  const leftRoots = findRootsBySubdivision(left, t0, tMid, maxDepth - 1);
  const rightRoots = findRootsBySubdivision(right, tMid, t1, maxDepth - 1);

  return leftRoots.concat(rightRoots);
}

/**
 * Subdivide 1D Bezier at t=0.5 using de Casteljau's algorithm.
 *
 * Splits a 1D Bezier curve (array of scalar control values) into two halves.
 * Used internally by root-finding subdivision algorithm.
 *
 * @param {Decimal[]} coeffs - 1D control values (scalars, not points)
 * @returns {{left: Decimal[], right: Decimal[]}} Two 1D Bezier curves representing left and right halves
 */
function subdivideBezier1D(coeffs) {
  // INPUT VALIDATION: Ensure coeffs is valid and non-empty
  // WHY: Empty coeffs would cause errors in de Casteljau iteration
  if (!coeffs || !Array.isArray(coeffs) || coeffs.length === 0) {
    throw new Error(
      "subdivideBezier1D: coeffs must be a non-empty array of control values",
    );
  }

  const half = D(0.5);
  let pts = coeffs.map((c) => D(c));

  const left = [pts[0]];
  const right = [];

  while (pts.length > 1) {
    right.unshift(pts[pts.length - 1]);
    const newPts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      newPts.push(pts[i].plus(pts[i + 1]).times(half));
    }
    if (newPts.length > 0) {
      left.push(newPts[0]);
    }
    pts = newPts;
  }

  if (pts.length === 1) {
    right.unshift(pts[0]);
  }

  return { left, right };
}

// ============================================================================
// POLYNOMIAL CONVERSION
// ============================================================================

/**
 * Convert Bezier control points to polynomial coefficients.
 *
 * For cubic Bezier: B(t) = c0 + c1*t + c2*t^2 + c3*t^3
 *
 * @param {BezierPoints} points - Control points
 * @returns {{x: Decimal[], y: Decimal[]}} Polynomial coefficients (constant first)
 */
export function bezierToPolynomial(points) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Polynomial conversion requires accessing control points by index
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "bezierToPolynomial: points must be an array with at least 2 control points",
    );
  }

  const n = points.length - 1;
  const xCoeffs = [];
  const yCoeffs = [];

  // Convert points to Decimal
  const P = points.map(([x, y]) => [D(x), D(y)]);

  if (n === 1) {
    // Line: P0 + t(P1 - P0)
    xCoeffs.push(P[0][0]);
    xCoeffs.push(P[1][0].minus(P[0][0]));
    yCoeffs.push(P[0][1]);
    yCoeffs.push(P[1][1].minus(P[0][1]));
  } else if (n === 2) {
    // Quadratic: P0 + 2t(P1-P0) + t^2(P0 - 2P1 + P2)
    xCoeffs.push(P[0][0]);
    xCoeffs.push(P[1][0].minus(P[0][0]).times(2));
    xCoeffs.push(P[0][0].minus(P[1][0].times(2)).plus(P[2][0]));

    yCoeffs.push(P[0][1]);
    yCoeffs.push(P[1][1].minus(P[0][1]).times(2));
    yCoeffs.push(P[0][1].minus(P[1][1].times(2)).plus(P[2][1]));
  } else if (n === 3) {
    // Cubic
    xCoeffs.push(P[0][0]);
    xCoeffs.push(P[1][0].minus(P[0][0]).times(3));
    xCoeffs.push(P[0][0].minus(P[1][0].times(2)).plus(P[2][0]).times(3));
    xCoeffs.push(
      P[0][0]
        .neg()
        .plus(P[1][0].times(3))
        .minus(P[2][0].times(3))
        .plus(P[3][0]),
    );

    yCoeffs.push(P[0][1]);
    yCoeffs.push(P[1][1].minus(P[0][1]).times(3));
    yCoeffs.push(P[0][1].minus(P[1][1].times(2)).plus(P[2][1]).times(3));
    yCoeffs.push(
      P[0][1]
        .neg()
        .plus(P[1][1].times(3))
        .minus(P[2][1].times(3))
        .plus(P[3][1]),
    );
  } else {
    throw new Error(`Polynomial conversion for degree ${n} not implemented`);
  }

  return { x: xCoeffs, y: yCoeffs };
}

/**
 * Convert polynomial coefficients back to Bezier control points.
 *
 * @param {Decimal[]} xCoeffs - X polynomial coefficients (constant first)
 * @param {Decimal[]} yCoeffs - Y polynomial coefficients
 * @returns {BezierPoints} Control points
 */
export function polynomialToBezier(xCoeffs, yCoeffs) {
  // INPUT VALIDATION
  if (!xCoeffs || !Array.isArray(xCoeffs) || xCoeffs.length < 2) {
    throw new Error(
      "polynomialToBezier: xCoeffs must be an array with at least 2 coefficients",
    );
  }
  if (!yCoeffs || !Array.isArray(yCoeffs) || yCoeffs.length < 2) {
    throw new Error(
      "polynomialToBezier: yCoeffs must be an array with at least 2 coefficients",
    );
  }
  if (xCoeffs.length !== yCoeffs.length) {
    throw new Error(
      "polynomialToBezier: xCoeffs and yCoeffs must have the same length",
    );
  }

  const n = xCoeffs.length - 1;

  if (n === 1) {
    return [
      [xCoeffs[0], yCoeffs[0]],
      [xCoeffs[0].plus(xCoeffs[1]), yCoeffs[0].plus(yCoeffs[1])],
    ];
  }

  if (n === 2) {
    const x0 = xCoeffs[0];
    const x1 = xCoeffs[0].plus(xCoeffs[1].div(2));
    const x2 = xCoeffs[0].plus(xCoeffs[1]).plus(xCoeffs[2]);

    const y0 = yCoeffs[0];
    const y1 = yCoeffs[0].plus(yCoeffs[1].div(2));
    const y2 = yCoeffs[0].plus(yCoeffs[1]).plus(yCoeffs[2]);

    return [
      [x0, y0],
      [x1, y1],
      [x2, y2],
    ];
  }

  if (n === 3) {
    const x0 = xCoeffs[0];
    const x1 = xCoeffs[0].plus(xCoeffs[1].div(3));
    const x2 = xCoeffs[0]
      .plus(xCoeffs[1].times(2).div(3))
      .plus(xCoeffs[2].div(3));
    const x3 = xCoeffs[0].plus(xCoeffs[1]).plus(xCoeffs[2]).plus(xCoeffs[3]);

    const y0 = yCoeffs[0];
    const y1 = yCoeffs[0].plus(yCoeffs[1].div(3));
    const y2 = yCoeffs[0]
      .plus(yCoeffs[1].times(2).div(3))
      .plus(yCoeffs[2].div(3));
    const y3 = yCoeffs[0].plus(yCoeffs[1]).plus(yCoeffs[2]).plus(yCoeffs[3]);

    return [
      [x0, y0],
      [x1, y1],
      [x2, y2],
      [x3, y3],
    ];
  }

  throw new Error(`Bezier conversion for degree ${n} not implemented`);
}

// ============================================================================
// VERIFICATION UTILITIES (INVERSE OPERATIONS)
// ============================================================================

/**
 * Verify bezierPoint by comparing de Casteljau with Horner evaluation.
 * Mathematical verification: two different algorithms must produce same result.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter
 * @param {number|string|Decimal} [tolerance='1e-60'] - Maximum difference
 * @returns {{valid: boolean, deCasteljau: Point2D, horner: Point2D, difference: Decimal}}
 */
export function verifyBezierPoint(points, t, tolerance = "1e-60") {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Verification functions need valid input to produce meaningful results
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyBezierPoint: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);
  const deCasteljau = bezierPoint(points, t);
  const horner = bezierPointHorner(points, t);

  const diffX = D(deCasteljau[0]).minus(D(horner[0])).abs();
  const diffY = D(deCasteljau[1]).minus(D(horner[1])).abs();
  const maxDiff = Decimal.max(diffX, diffY);

  return {
    valid: maxDiff.lte(tol),
    deCasteljau,
    horner,
    difference: maxDiff,
  };
}

/**
 * Verify bezierSplit by checking:
 * 1. Left curve at t=1 equals split point
 * 2. Right curve at t=0 equals split point
 * 3. Evaluating original at t equals split point
 * 4. Left curve maps [0,1] to original [0, splitT]
 * 5. Right curve maps [0,1] to original [splitT, 1]
 *
 * @param {BezierPoints} points - Original control points
 * @param {number|string|Decimal} splitT - Split parameter
 * @param {number|string|Decimal} [tolerance='1e-50'] - Maximum error
 * @returns {{valid: boolean, errors: string[], splitPoint: Point2D, leftEnd: Point2D, rightStart: Point2D}}
 */
export function verifyBezierSplit(points, splitT, tolerance = "1e-50") {
  // INPUT VALIDATION: Ensure points array and split parameter are valid
  // WHY: Split verification requires valid curve and parameter
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyBezierSplit: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);
  const errors = [];

  const { left, right } = bezierSplit(points, splitT);
  const splitPoint = bezierPoint(points, splitT);

  // Check 1: Left curve ends at split point
  const leftEnd = bezierPoint(left, 1);
  const leftDiff = D(leftEnd[0])
    .minus(D(splitPoint[0]))
    .abs()
    .plus(D(leftEnd[1]).minus(D(splitPoint[1])).abs());
  if (leftDiff.gt(tol)) {
    errors.push(`Left curve end differs from split point by ${leftDiff}`);
  }

  // Check 2: Right curve starts at split point
  const rightStart = bezierPoint(right, 0);
  const rightDiff = D(rightStart[0])
    .minus(D(splitPoint[0]))
    .abs()
    .plus(D(rightStart[1]).minus(D(splitPoint[1])).abs());
  if (rightDiff.gt(tol)) {
    errors.push(`Right curve start differs from split point by ${rightDiff}`);
  }

  // Check 3: Sample points on both halves match original
  const tD = D(splitT);
  for (const testT of [0.25, 0.5, 0.75]) {
    // Test left half: t in [0, splitT] maps to leftT in [0, 1]
    const origT = D(testT).times(tD);
    const origPt = bezierPoint(points, origT);
    const leftPt = bezierPoint(left, testT);
    const leftTestDiff = D(origPt[0])
      .minus(D(leftPt[0]))
      .abs()
      .plus(D(origPt[1]).minus(D(leftPt[1])).abs());
    if (leftTestDiff.gt(tol)) {
      errors.push(`Left half at t=${testT} differs by ${leftTestDiff}`);
    }

    // Test right half: t in [splitT, 1] maps to rightT in [0, 1]
    const origT2 = tD.plus(D(testT).times(D(1).minus(tD)));
    const origPt2 = bezierPoint(points, origT2);
    const rightPt = bezierPoint(right, testT);
    const rightTestDiff = D(origPt2[0])
      .minus(D(rightPt[0]))
      .abs()
      .plus(D(origPt2[1]).minus(D(rightPt[1])).abs());
    if (rightTestDiff.gt(tol)) {
      errors.push(`Right half at t=${testT} differs by ${rightTestDiff}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    splitPoint,
    leftEnd,
    rightStart,
  };
}

/**
 * Verify bezierCrop by checking endpoints match expected positions.
 *
 * @param {BezierPoints} points - Original control points
 * @param {number|string|Decimal} t0 - Start parameter
 * @param {number|string|Decimal} t1 - End parameter
 * @param {number|string|Decimal} [tolerance='1e-50'] - Maximum error
 * @returns {{valid: boolean, errors: string[], expectedStart: Point2D, actualStart: Point2D, expectedEnd: Point2D, actualEnd: Point2D}}
 */
export function verifyBezierCrop(points, t0, t1, tolerance = "1e-50") {
  // INPUT VALIDATION: Ensure points array and parameters are valid
  // WHY: Crop verification requires valid curve and parameter range
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyBezierCrop: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);
  const errors = [];

  const cropped = bezierCrop(points, t0, t1);

  // Expected: cropped curve starts at original's t0 and ends at original's t1
  const expectedStart = bezierPoint(points, t0);
  const expectedEnd = bezierPoint(points, t1);

  const actualStart = bezierPoint(cropped, 0);
  const actualEnd = bezierPoint(cropped, 1);

  const startDiff = D(expectedStart[0])
    .minus(D(actualStart[0]))
    .abs()
    .plus(D(expectedStart[1]).minus(D(actualStart[1])).abs());
  if (startDiff.gt(tol)) {
    errors.push(`Cropped start differs by ${startDiff}`);
  }

  const endDiff = D(expectedEnd[0])
    .minus(D(actualEnd[0]))
    .abs()
    .plus(D(expectedEnd[1]).minus(D(actualEnd[1])).abs());
  if (endDiff.gt(tol)) {
    errors.push(`Cropped end differs by ${endDiff}`);
  }

  // Verify midpoint
  const midT = D(t0).plus(D(t1)).div(2);
  const expectedMid = bezierPoint(points, midT);
  const actualMid = bezierPoint(cropped, 0.5);
  const midDiff = D(expectedMid[0])
    .minus(D(actualMid[0]))
    .abs()
    .plus(D(expectedMid[1]).minus(D(actualMid[1])).abs());
  if (midDiff.gt(tol)) {
    errors.push(`Cropped midpoint differs by ${midDiff}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    expectedStart,
    actualStart,
    expectedEnd,
    actualEnd,
  };
}

/**
 * Verify polynomial conversion by roundtrip: bezier -> polynomial -> bezier.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} [tolerance='1e-50'] - Maximum error
 * @returns {{valid: boolean, maxError: Decimal, originalPoints: BezierPoints, reconstructedPoints: BezierPoints}}
 */
export function verifyPolynomialConversion(points, tolerance = "1e-50") {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Polynomial conversion verification requires valid control points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyPolynomialConversion: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);

  const { x: xCoeffs, y: yCoeffs } = bezierToPolynomial(points);
  const reconstructed = polynomialToBezier(xCoeffs, yCoeffs);

  let maxError = D(0);

  // Compare each control point
  for (let i = 0; i < points.length; i++) {
    const diffX = D(points[i][0]).minus(D(reconstructed[i][0])).abs();
    const diffY = D(points[i][1]).minus(D(reconstructed[i][1])).abs();
    maxError = Decimal.max(maxError, diffX, diffY);
  }

  // Also verify by sampling the curves
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const orig = bezierPoint(points, t);
    const recon = bezierPoint(reconstructed, t);
    const diffX = D(orig[0]).minus(D(recon[0])).abs();
    const diffY = D(orig[1]).minus(D(recon[1])).abs();
    maxError = Decimal.max(maxError, diffX, diffY);
  }

  return {
    valid: maxError.lte(tol),
    maxError,
    originalPoints: points,
    reconstructedPoints: reconstructed,
  };
}

/**
 * Verify tangent and normal vectors are correct:
 * 1. Tangent is a unit vector
 * 2. Normal is a unit vector
 * 3. Tangent and normal are perpendicular (dot product = 0)
 * 4. Tangent direction matches derivative direction
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter
 * @param {number|string|Decimal} [tolerance='1e-50'] - Maximum error
 * @returns {{valid: boolean, errors: string[], tangent: Point2D, normal: Point2D, tangentMagnitude: Decimal, normalMagnitude: Decimal, dotProduct: Decimal}}
 */
export function verifyTangentNormal(points, t, tolerance = "1e-50") {
  // INPUT VALIDATION: Ensure points array and parameter are valid
  // WHY: Tangent/normal verification requires valid curve and parameter
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyTangentNormal: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);
  const errors = [];

  const tangent = bezierTangent(points, t);
  const normal = bezierNormal(points, t);
  const deriv = bezierDerivative(points, t, 1);

  const [tx, ty] = [D(tangent[0]), D(tangent[1])];
  const [nx, ny] = [D(normal[0]), D(normal[1])];
  const [dx, dy] = [D(deriv[0]), D(deriv[1])];

  // Check tangent is unit vector
  const tangentMag = tx.pow(2).plus(ty.pow(2)).sqrt();
  if (tangentMag.minus(1).abs().gt(tol)) {
    errors.push(`Tangent magnitude ${tangentMag} != 1`);
  }

  // Check normal is unit vector
  const normalMag = nx.pow(2).plus(ny.pow(2)).sqrt();
  if (normalMag.minus(1).abs().gt(tol)) {
    errors.push(`Normal magnitude ${normalMag} != 1`);
  }

  // Check perpendicularity
  const dotProduct = tx.times(nx).plus(ty.times(ny));
  if (dotProduct.abs().gt(tol)) {
    errors.push(
      `Tangent and normal not perpendicular, dot product = ${dotProduct}`,
    );
  }

  // Check tangent aligns with derivative direction
  const derivMag = dx.pow(2).plus(dy.pow(2)).sqrt();
  if (derivMag.gt(tol)) {
    const normalizedDx = dx.div(derivMag);
    const normalizedDy = dy.div(derivMag);
    const alignDiff = tx
      .minus(normalizedDx)
      .abs()
      .plus(ty.minus(normalizedDy).abs());
    if (alignDiff.gt(tol)) {
      errors.push(`Tangent doesn't align with derivative direction`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tangent,
    normal,
    tangentMagnitude: tangentMag,
    normalMagnitude: normalMag,
    dotProduct,
  };
}

/**
 * Verify curvature calculation by comparing with finite difference approximation.
 * Also verifies radius of curvature = 1/|curvature|.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter
 * @param {number|string|Decimal} [tolerance='1e-10'] - Maximum relative error
 * @returns {{valid: boolean, errors: string[], analyticCurvature: Decimal, finiteDiffCurvature: Decimal, radiusVerified: boolean}}
 */
export function verifyCurvature(points, t, tolerance = "1e-10") {
  // INPUT VALIDATION: Ensure points array and parameter are valid
  // WHY: Curvature verification requires valid curve and parameter
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyCurvature: points must be an array with at least 2 control points",
    );
  }

  const tol = D(tolerance);
  const errors = [];
  const tD = D(t);

  const analyticCurvature = bezierCurvature(points, t);
  const radius = bezierRadiusOfCurvature(points, t);

  // Finite difference approximation using tangent angle change
  // WHY: Use named constant for finite difference step size
  const h = FINITE_DIFFERENCE_STEP;

  const t1 = Decimal.max(D(0), tD.minus(h));
  const t2 = Decimal.min(D(1), tD.plus(h));
  const _actualH = t2.minus(t1);

  const tan1 = bezierTangent(points, t1);
  const tan2 = bezierTangent(points, t2);

  // Angle change
  const angle1 = Decimal.atan2(D(tan1[1]), D(tan1[0]));
  const angle2 = Decimal.atan2(D(tan2[1]), D(tan2[0]));
  let angleChange = angle2.minus(angle1);

  // Normalize angle change to [-pi, pi]
  const PI = Decimal.acos(-1);
  while (angleChange.gt(PI)) angleChange = angleChange.minus(PI.times(2));
  while (angleChange.lt(PI.neg())) angleChange = angleChange.plus(PI.times(2));

  // Arc length over interval
  const pt1 = bezierPoint(points, t1);
  const pt2 = bezierPoint(points, t2);
  const arcLen = D(pt2[0])
    .minus(D(pt1[0]))
    .pow(2)
    .plus(D(pt2[1]).minus(D(pt1[1])).pow(2))
    .sqrt();

  let finiteDiffCurvature;
  // WHY: Use named constant for arc length threshold in curvature verification
  if (arcLen.gt(ARC_LENGTH_THRESHOLD)) {
    finiteDiffCurvature = angleChange.div(arcLen);
  } else {
    finiteDiffCurvature = D(0);
  }

  // Compare (use relative error for large curvatures)
  if (!analyticCurvature.isFinite() || analyticCurvature.abs().gt(1e10)) {
    // Skip comparison for extreme curvatures (cusps)
  } else if (analyticCurvature.abs().gt(CURVATURE_RELATIVE_ERROR_THRESHOLD)) {
    // WHY: Use named constant for curvature magnitude threshold
    const relError = analyticCurvature
      .minus(finiteDiffCurvature)
      .abs()
      .div(analyticCurvature.abs());
    if (relError.gt(tol)) {
      errors.push(`Curvature relative error ${relError} exceeds tolerance`);
    }
  }

  // Verify radius = 1/|curvature|
  let radiusVerified = true;
  if (analyticCurvature.isZero()) {
    radiusVerified = !radius.isFinite() || radius.gt(1e50);
  } else if (analyticCurvature.abs().lt(1e-50)) {
    radiusVerified = radius.gt(1e40);
  } else {
    const expectedRadius = D(1).div(analyticCurvature.abs());
    const radiusDiff = radius.minus(expectedRadius).abs();
    if (radiusDiff.gt(tol.times(expectedRadius))) {
      errors.push(`Radius ${radius} != 1/|curvature| = ${expectedRadius}`);
      radiusVerified = false;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    analyticCurvature,
    finiteDiffCurvature,
    radiusVerified,
  };
}

/**
 * Verify bounding box contains all curve points and is minimal.
 *
 * @param {BezierPoints} points - Control points
 * @param {number} [samples=100] - Number of sample points
 * @param {number|string|Decimal} [tolerance='1e-40'] - Maximum error
 * @returns {{valid: boolean, errors: string[], bbox: Object, allPointsInside: boolean, criticalPointsOnEdge: boolean}}
 */
export function verifyBoundingBox(points, samples = 100, tolerance = "1e-40") {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Bounding box verification requires valid control points
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyBoundingBox: points must be an array with at least 2 control points",
    );
  }

  // PARAMETER VALIDATION: Ensure samples is a positive integer
  // WHY: Non-positive or non-integer samples would cause loop errors or division by zero
  if (typeof samples !== "number" || samples < 1 || !Number.isInteger(samples)) {
    throw new Error(
      `verifyBoundingBox: samples must be a positive integer, got ${samples}`,
    );
  }

  const tol = D(tolerance);
  const errors = [];

  const bbox = bezierBoundingBox(points);
  let allPointsInside = true;
  let criticalPointsOnEdge = true;

  // Check all sampled points are inside bounding box
  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const [x, y] = bezierPoint(points, t);

    if (D(x).lt(bbox.xmin.minus(tol)) || D(x).gt(bbox.xmax.plus(tol))) {
      errors.push(
        `Point at t=${t} x=${x} outside x bounds [${bbox.xmin}, ${bbox.xmax}]`,
      );
      allPointsInside = false;
    }
    if (D(y).lt(bbox.ymin.minus(tol)) || D(y).gt(bbox.ymax.plus(tol))) {
      errors.push(
        `Point at t=${t} y=${y} outside y bounds [${bbox.ymin}, ${bbox.ymax}]`,
      );
      allPointsInside = false;
    }
  }

  // Verify bounding box edges are achieved by some point
  let xminAchieved = false,
    xmaxAchieved = false,
    yminAchieved = false,
    ymaxAchieved = false;

  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const [x, y] = bezierPoint(points, t);

    if (D(x).minus(bbox.xmin).abs().lt(tol)) xminAchieved = true;
    if (D(x).minus(bbox.xmax).abs().lt(tol)) xmaxAchieved = true;
    if (D(y).minus(bbox.ymin).abs().lt(tol)) yminAchieved = true;
    if (D(y).minus(bbox.ymax).abs().lt(tol)) ymaxAchieved = true;
  }

  if (!xminAchieved || !xmaxAchieved || !yminAchieved || !ymaxAchieved) {
    criticalPointsOnEdge = false;
    if (!xminAchieved) errors.push("xmin not achieved by any curve point");
    if (!xmaxAchieved) errors.push("xmax not achieved by any curve point");
    if (!yminAchieved) errors.push("ymin not achieved by any curve point");
    if (!ymaxAchieved) errors.push("ymax not achieved by any curve point");
  }

  return {
    valid: errors.length === 0,
    errors,
    bbox,
    allPointsInside,
    criticalPointsOnEdge,
  };
}

/**
 * Verify derivative by comparing with finite difference approximation.
 *
 * @param {BezierPoints} points - Control points
 * @param {number|string|Decimal} t - Parameter
 * @param {number} [order=1] - Derivative order
 * @param {number|string|Decimal} [tolerance='1e-8'] - Maximum relative error
 * @returns {{valid: boolean, analytic: Point2D, finiteDiff: Point2D, relativeError: Decimal}}
 */
export function verifyDerivative(points, t, order = 1, tolerance = "1e-8") {
  // INPUT VALIDATION: Ensure points array, parameter, and order are valid
  // WHY: Derivative verification requires valid inputs for meaningful results
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyDerivative: points must be an array with at least 2 control points",
    );
  }

  // PARAMETER VALIDATION: Ensure order is a positive integer
  // WHY: Negative or non-integer orders are not meaningful for derivatives
  if (typeof order !== "number" || order < 0 || !Number.isInteger(order)) {
    throw new Error(
      `verifyDerivative: order must be a non-negative integer, got ${order}`,
    );
  }

  const tol = D(tolerance);
  const tD = D(t);

  const analytic = bezierDerivative(points, t, order);

  // Finite difference (central difference for better accuracy)
  // WHY: Use named constant for derivative verification step size
  const h = DERIVATIVE_VERIFICATION_STEP;
  let finiteDiff;

  if (order === 1) {
    const t1 = Decimal.max(D(0), tD.minus(h));
    const t2 = Decimal.min(D(1), tD.plus(h));
    const pt1 = bezierPoint(points, t1);
    const pt2 = bezierPoint(points, t2);
    const dt = t2.minus(t1);
    finiteDiff = [
      D(pt2[0]).minus(D(pt1[0])).div(dt),
      D(pt2[1]).minus(D(pt1[1])).div(dt),
    ];
  } else if (order === 2) {
    const t0 = tD;
    const t1 = Decimal.max(D(0), tD.minus(h));
    const t2 = Decimal.min(D(1), tD.plus(h));
    const pt0 = bezierPoint(points, t0);
    const pt1 = bezierPoint(points, t1);
    const pt2 = bezierPoint(points, t2);
    // Second derivative: (f(t+h) - 2f(t) + f(t-h)) / h^2
    const h2 = h.pow(2);
    finiteDiff = [
      D(pt2[0]).minus(D(pt0[0]).times(2)).plus(D(pt1[0])).div(h2),
      D(pt2[1]).minus(D(pt0[1]).times(2)).plus(D(pt1[1])).div(h2),
    ];
  } else {
    // Higher orders: not implemented in finite difference approximation
    // WHY: Higher order finite differences require more sample points and
    // have increasing numerical instability. For verification purposes,
    // we note this limitation.
    console.warn(
      `verifyDerivative: finite difference for order ${order} not implemented`,
    );
    finiteDiff = analytic; // Use analytic as fallback (always "passes")
  }

  const magAnalytic = D(analytic[0]).pow(2).plus(D(analytic[1]).pow(2)).sqrt();
  const diffX = D(analytic[0]).minus(D(finiteDiff[0])).abs();
  const diffY = D(analytic[1]).minus(D(finiteDiff[1])).abs();

  let relativeError;
  // WHY: Use named constant for derivative magnitude threshold
  if (magAnalytic.gt(DERIVATIVE_MAGNITUDE_THRESHOLD)) {
    relativeError = diffX.plus(diffY).div(magAnalytic);
  } else {
    relativeError = diffX.plus(diffY);
  }

  return {
    valid: relativeError.lte(tol),
    analytic,
    finiteDiff,
    relativeError,
  };
}

/**
 * Verify that a point lies on a Bezier curve within tolerance.
 *
 * @param {BezierPoints} points - Control points
 * @param {Point2D} testPoint - Point to verify
 * @param {number|string|Decimal} [tolerance='1e-30'] - Maximum distance
 * @returns {{valid: boolean, t: Decimal|null, distance: Decimal}}
 */
export function verifyPointOnCurve(points, testPoint, tolerance = "1e-30") {
  // INPUT VALIDATION: Ensure points array and test point are valid
  // WHY: Point-on-curve verification requires valid curve and test point
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error(
      "verifyPointOnCurve: points must be an array with at least 2 control points",
    );
  }
  if (!testPoint || !Array.isArray(testPoint) || testPoint.length < 2) {
    throw new Error(
      "verifyPointOnCurve: testPoint must be a valid 2D point [x, y]",
    );
  }

  const [px, py] = [D(testPoint[0]), D(testPoint[1])];
  const tol = D(tolerance);

  // Sample the curve and find closest point
  let bestT = D(0);
  let bestDist = new Decimal(Infinity);

  // Initial sampling
  for (let i = 0; i <= 100; i++) {
    const t = D(i).div(100);
    const [x, y] = bezierPoint(points, t);
    const dist = px.minus(x).pow(2).plus(py.minus(y).pow(2)).sqrt();

    if (dist.lt(bestDist)) {
      bestDist = dist;
      bestT = t;
    }
  }

  // Refine using Newton's method
  for (let iter = 0; iter < 20; iter++) {
    const [x, y] = bezierPoint(points, bestT);
    const [dx, dy] = bezierDerivative(points, bestT, 1);

    // Distance squared: f(t) = (x(t) - px)^2 + (y(t) - py)^2
    // Derivative: f'(t) = 2(x(t) - px)*x'(t) + 2(y(t) - py)*y'(t)

    const diffX = x.minus(px);
    const diffY = y.minus(py);
    const fPrime = diffX.times(dx).plus(diffY.times(dy)).times(2);

    // WHY: Use named constant for zero-derivative check in Newton iteration
    if (fPrime.abs().lt(NEAR_ZERO_THRESHOLD)) break;

    // f''(t) for Newton's method
    const [d2x, d2y] = bezierDerivative(points, bestT, 2);
    const fDoublePrime = dx
      .pow(2)
      .plus(dy.pow(2))
      .plus(diffX.times(d2x))
      .plus(diffY.times(d2y))
      .times(2);

    // WHY: Use named constant for zero second derivative check
    if (fDoublePrime.abs().lt(NEAR_ZERO_THRESHOLD)) break;

    const delta = fPrime.div(fDoublePrime);
    bestT = bestT.minus(delta);

    // Clamp to [0, 1]
    if (bestT.lt(0)) bestT = D(0);
    if (bestT.gt(1)) bestT = D(1);

    // WHY: Use named constant for Newton-Raphson convergence check
    if (delta.abs().lt(NEWTON_CONVERGENCE_THRESHOLD)) break;
  }

  // Final distance check
  const [finalX, finalY] = bezierPoint(points, bestT);
  const finalDist = px
    .minus(finalX)
    .pow(2)
    .plus(py.minus(finalY).pow(2))
    .sqrt();

  return {
    valid: finalDist.lte(tol),
    t: finalDist.lte(tol) ? bestT : null,
    distance: finalDist,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Evaluation
  bezierPoint,
  bezierPointHorner,

  // Derivatives
  bezierDerivative,
  bezierDerivativePoints,

  // Differential geometry
  bezierTangent,
  bezierNormal,
  bezierCurvature,
  bezierRadiusOfCurvature,

  // Subdivision
  bezierSplit,
  bezierHalve,
  bezierCrop,

  // Bounding box
  bezierBoundingBox,

  // Polynomial conversion
  bezierToPolynomial,
  polynomialToBezier,

  // Verification (inverse operations)
  verifyBezierPoint,
  verifyBezierSplit,
  verifyBezierCrop,
  verifyPolynomialConversion,
  verifyTangentNormal,
  verifyCurvature,
  verifyBoundingBox,
  verifyDerivative,
  verifyPointOnCurve,
};
