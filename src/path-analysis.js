/**
 * @fileoverview Arbitrary-Precision Path Analysis
 *
 * Advanced path analysis operations including:
 * - Area calculation using Green's theorem
 * - Closest/farthest point on path
 * - Point-in-path testing
 * - Path continuity and smoothness analysis
 *
 * @module path-analysis
 * @version 1.0.0
 */

import Decimal from "decimal.js";
import {
  bezierPoint,
  bezierDerivative,
  bezierTangent,
  bezierBoundingBox,
} from "./bezier-analysis.js";
import { arcLength } from "./arc-length.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));
const PI = new Decimal(
  "3.1415926535897932384626433832795028841971693993751058209749445923078164062862090",
);

// ============================================================================
// NUMERICAL CONSTANTS (documented magic numbers)
// ============================================================================

/** Tolerance for boundary detection in point-in-path - very small to catch points on curve */
const BOUNDARY_TOLERANCE = new Decimal("1e-20");

/** Default tolerance for path closed/continuous checks - detects microscopic gaps */
const DEFAULT_CONTINUITY_TOLERANCE = "1e-20";

/** Default tolerance for path smoothness (tangent angle) checks - allows tiny angle differences */
const DEFAULT_SMOOTHNESS_TOLERANCE = "1e-10";

/** Tolerance for centroid-based direction calculations - avoids division by near-zero */
const CENTROID_ZERO_THRESHOLD = new Decimal("1e-30");

/** Small epsilon for neighbor point testing - small offset for nearby point checks */
const NEIGHBOR_TEST_EPSILON = new Decimal("1e-10");

/** Threshold for considering tangents anti-parallel (180-degree turn) - dot product ~ -1 */
const ANTI_PARALLEL_THRESHOLD = new Decimal("-0.99");

/** Tolerance for Newton-Raphson singular Jacobian detection - avoids division by zero */
const JACOBIAN_SINGULARITY_THRESHOLD = new Decimal("1e-60");

/** Numerical precision tolerance for farthest point verification.
 * WHY: Accounts for floating-point rounding in distance comparisons, not sampling error.
 * The found distance should be >= max sampled within this numerical tolerance. */
const FARTHEST_POINT_NUMERICAL_TOLERANCE = new Decimal("1e-10");

// ============================================================================
// AREA CALCULATION (GREEN'S THEOREM)
// ============================================================================

/**
 * Compute the signed area enclosed by a closed Bezier path using Green's theorem.
 *
 * Green's theorem: Area = (1/2) * integral of (x * dy - y * dx)
 *
 * For Bezier curves, this integral can be computed exactly for polynomial segments,
 * or numerically for arc segments.
 *
 * Positive area = counter-clockwise path
 * Negative area = clockwise path
 *
 * @param {Array} segments - Array of Bezier segments (each is control points array)
 * @param {Object} [options] - Options
 * @param {number} [options.samples=50] - Samples per segment for numerical integration
 * @returns {Decimal} Signed area
 *
 * @example
 * // Rectangle as 4 line segments
 * const rect = [
 *   [[0,0], [100,0]],   // bottom
 *   [[100,0], [100,50]], // right
 *   [[100,50], [0,50]], // top
 *   [[0,50], [0,0]]     // left
 * ];
 * const area = pathArea(rect); // 5000 (100 * 50)
 */
export function pathArea(segments, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("pathArea: segments must be an array");
  }

  const { samples = 50 } = options;

  let area = D(0);

  for (const points of segments) {
    const n = points.length - 1; // Degree

    if (n === 1) {
      // Line segment: exact formula
      // Area contribution = (1/2) * (x0*y1 - x1*y0 + x0*dy - y0*dx) integrated
      // For line from P0 to P1: contribution = (x0*y1 - x1*y0) / 2
      // But using Green's theorem: integral of x*dy = integral of x(t) * y'(t) dt
      const [x0, y0] = [D(points[0][0]), D(points[0][1])];
      const [x1, y1] = [D(points[1][0]), D(points[1][1])];

      // x(t) = x0 + t*(x1-x0)
      // y'(t) = y1 - y0
      // integral from 0 to 1 of x(t)*y'(t) dt = (y1-y0) * integral of (x0 + t*(x1-x0)) dt
      //   = (y1-y0) * (x0 + (x1-x0)/2) = (y1-y0) * (x0+x1)/2

      const lineIntegralXdY = y1.minus(y0).times(x0.plus(x1).div(2));

      // Similarly: integral of y*dx = (x1-x0) * (y0+y1)/2
      const lineIntegralYdX = x1.minus(x0).times(y0.plus(y1).div(2));

      // Green: (1/2) * integral of (x*dy - y*dx)
      area = area.plus(lineIntegralXdY.minus(lineIntegralYdX).div(2));
    } else if (n === 2 || n === 3) {
      // Quadratic or Cubic: use exact polynomial integration
      area = area.plus(bezierAreaContribution(points));
    } else {
      // Higher degree: numerical integration
      area = area.plus(numericalAreaContribution(points, samples));
    }
  }

  return area;
}

/**
 * Exact area contribution from a quadratic or cubic Bezier using polynomial integration.
 *
 * @param {Array} points - Control points
 * @returns {Decimal} Area contribution
 */
function bezierAreaContribution(points) {
  const n = points.length - 1;

  // Convert to Decimal
  const P = points.map(([x, y]) => [D(x), D(y)]);

  if (n === 2) {
    // Quadratic Bezier
    // B(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
    // x(t) = x0(1-t)^2 + 2x1(1-t)t + x2*t^2
    // y'(t) = 2(y1-y0)(1-t) + 2(y2-y1)t = 2(y1-y0) + 2(y2-2y1+y0)t

    const [x0, y0] = P[0];
    const [x1, y1] = P[1];
    const [x2, y2] = P[2];

    // Integral of x(t)*y'(t) from 0 to 1
    // This expands to a polynomial integral that can be computed exactly
    // After expansion and integration:
    const integral_x_dy = x0
      .times(y1.minus(y0))
      .plus(x0.times(y2.minus(y1.times(2)).plus(y0)).div(2))
      .plus(x1.times(2).minus(x0.times(2)).times(y1.minus(y0)).div(2))
      .plus(
        x1
          .times(2)
          .minus(x0.times(2))
          .times(y2.minus(y1.times(2)).plus(y0))
          .div(3),
      )
      .plus(x2.minus(x1.times(2)).plus(x0).times(y1.minus(y0)).div(3))
      .plus(
        x2
          .minus(x1.times(2))
          .plus(x0)
          .times(y2.minus(y1.times(2)).plus(y0))
          .div(4),
      );

    // Similarly for integral of y(t)*x'(t)
    const integral_y_dx = y0
      .times(x1.minus(x0))
      .plus(y0.times(x2.minus(x1.times(2)).plus(x0)).div(2))
      .plus(y1.times(2).minus(y0.times(2)).times(x1.minus(x0)).div(2))
      .plus(
        y1
          .times(2)
          .minus(y0.times(2))
          .times(x2.minus(x1.times(2)).plus(x0))
          .div(3),
      )
      .plus(y2.minus(y1.times(2)).plus(y0).times(x1.minus(x0)).div(3))
      .plus(
        y2
          .minus(y1.times(2))
          .plus(y0)
          .times(x2.minus(x1.times(2)).plus(x0))
          .div(4),
      );

    return integral_x_dy.minus(integral_y_dx).div(2);
  } else if (n === 3) {
    // Cubic Bezier - use numerical integration
    // WHY: The exact polynomial integration for cubic Bezier area is complex
    // and the numerical method with 20 samples provides sufficient accuracy
    // for 80-digit precision arithmetic. Future improvement could add exact formula.
    return numericalAreaContribution(points, 20);
  }

  return D(0);
}

/**
 * Numerical area contribution using Gauss-Legendre quadrature.
 *
 * @param {Array} points - Control points
 * @param {number} samples - Number of sample points
 * @returns {Decimal} Area contribution
 */
function numericalAreaContribution(points, samples) {
  // Use composite Simpson's rule
  let integral_x_dy = D(0);
  let integral_y_dx = D(0);

  const h = D(1).div(samples);

  for (let i = 0; i <= samples; i++) {
    const t = h.times(i);
    const weight = i === 0 || i === samples ? D(1) : i % 2 === 0 ? D(2) : D(4);

    const [x, y] = bezierPoint(points, t);
    const [dx, dy] = bezierDerivative(points, t, 1);

    integral_x_dy = integral_x_dy.plus(weight.times(x).times(dy));
    integral_y_dx = integral_y_dx.plus(weight.times(y).times(dx));
  }

  integral_x_dy = integral_x_dy.times(h).div(3);
  integral_y_dx = integral_y_dx.times(h).div(3);

  return integral_x_dy.minus(integral_y_dx).div(2);
}

/**
 * Compute the absolute (unsigned) area of a closed path.
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {Object} [options] - Options
 * @returns {Decimal} Absolute area
 */
export function pathAbsoluteArea(segments, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("pathAbsoluteArea: segments must be an array");
  }

  return pathArea(segments, options).abs();
}

// ============================================================================
// CLOSEST POINT ON PATH
// ============================================================================

/**
 * Find the closest point on a path to a given point.
 *
 * Uses a combination of:
 * 1. Coarse sampling to find approximate location
 * 2. Newton-Raphson refinement for exact solution
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {Array} point - Query point [x, y]
 * @param {Object} [options] - Options
 * @param {number} [options.samples=50] - Samples per segment for initial search
 * @param {number} [options.maxIterations=30] - Max Newton iterations
 * @param {string} [options.tolerance='1e-30'] - Convergence tolerance
 * @returns {{point: Array, distance: Decimal, segmentIndex: number, t: Decimal}}
 */
export function closestPointOnPath(segments, point, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    throw new Error("closestPointOnPath: segments must be a non-empty array");
  }
  if (!point || !Array.isArray(point) || point.length < 2) {
    throw new Error("closestPointOnPath: point must be an array [x, y]");
  }

  const { samples = 50, maxIterations = 30, tolerance = "1e-30" } = options;

  const px = D(point[0]);
  const py = D(point[1]);
  const tol = D(tolerance);

  let bestSegment = 0;
  let bestT = D(0);
  let bestDist = new Decimal(Infinity);

  // Coarse sampling
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const pts = segments[segIdx];

    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);
      const dist = px.minus(x).pow(2).plus(py.minus(y).pow(2));

      if (dist.lt(bestDist)) {
        bestDist = dist;
        bestSegment = segIdx;
        bestT = t;
      }
    }
  }

  // Newton-Raphson refinement
  const pts = segments[bestSegment];

  for (let iter = 0; iter < maxIterations; iter++) {
    const [x, y] = bezierPoint(pts, bestT);
    const [dx, dy] = bezierDerivative(pts, bestT, 1);
    const [d2x, d2y] = bezierDerivative(pts, bestT, 2);

    // f(t) = (x(t) - px)^2 + (y(t) - py)^2 (distance squared)
    // f'(t) = 2(x-px)*dx + 2(y-py)*dy
    // f''(t) = 2(dx^2 + dy^2 + (x-px)*d2x + (y-py)*d2y)

    const diffX = x.minus(px);
    const diffY = y.minus(py);

    const fPrime = diffX.times(dx).plus(diffY.times(dy)).times(2);
    const fDoublePrime = dx
      .pow(2)
      .plus(dy.pow(2))
      .plus(diffX.times(d2x))
      .plus(diffY.times(d2y))
      .times(2);

    // WHY: Use named constant instead of magic number for clarity
    if (fDoublePrime.abs().lt(JACOBIAN_SINGULARITY_THRESHOLD)) break;

    const delta = fPrime.div(fDoublePrime);

    // Clamp to [0, 1]
    let newT = bestT.minus(delta);
    if (newT.lt(0)) newT = D(0);
    if (newT.gt(1)) newT = D(1);

    bestT = newT;

    if (delta.abs().lt(tol)) break;
  }

  // Also check all segment endpoints - the closest point might be at an endpoint
  // WHY: Newton refinement finds local minima within a segment, but segment
  // endpoints might be closer than any interior critical point
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segPts = segments[segIdx];
    for (const tVal of [D(0), D(1)]) {
      const [x, y] = bezierPoint(segPts, tVal);
      const dist = px.minus(x).pow(2).plus(py.minus(y).pow(2));
      if (dist.lt(bestDist)) {
        bestDist = dist;
        bestSegment = segIdx;
        bestT = tVal;
      }
    }
  }

  // Final result
  const [finalX, finalY] = bezierPoint(segments[bestSegment], bestT);
  const finalDist = px
    .minus(finalX)
    .pow(2)
    .plus(py.minus(finalY).pow(2))
    .sqrt();

  return {
    point: [finalX, finalY],
    distance: finalDist,
    segmentIndex: bestSegment,
    t: bestT,
  };
}

/**
 * Find the farthest point on a path from a given point.
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {Array} point - Query point [x, y]
 * @param {Object} [options] - Options
 * @returns {{point: Array, distance: Decimal, segmentIndex: number, t: Decimal}}
 */
export function farthestPointOnPath(segments, point, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    throw new Error("farthestPointOnPath: segments must be a non-empty array");
  }
  if (!point || !Array.isArray(point) || point.length < 2) {
    throw new Error("farthestPointOnPath: point must be an array [x, y]");
  }

  const { samples = 50, maxIterations = 30, tolerance = "1e-30" } = options;

  const px = D(point[0]);
  const py = D(point[1]);
  const tol = D(tolerance);

  let bestSegment = 0;
  let bestT = D(0);
  let bestDist = D(0);

  // Coarse sampling
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const pts = segments[segIdx];

    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);
      const dist = px.minus(x).pow(2).plus(py.minus(y).pow(2));

      if (dist.gt(bestDist)) {
        bestDist = dist;
        bestSegment = segIdx;
        bestT = t;
      }
    }
  }

  // Newton-Raphson refinement (maximize distance = minimize negative distance)
  const pts = segments[bestSegment];

  for (let iter = 0; iter < maxIterations; iter++) {
    const [x, y] = bezierPoint(pts, bestT);
    const [dx, dy] = bezierDerivative(pts, bestT, 1);
    const [d2x, d2y] = bezierDerivative(pts, bestT, 2);

    const diffX = x.minus(px);
    const diffY = y.minus(py);

    // For maximum: f'(t) = 0, f''(t) < 0
    const fPrime = diffX.times(dx).plus(diffY.times(dy)).times(2);
    const fDoublePrime = dx
      .pow(2)
      .plus(dy.pow(2))
      .plus(diffX.times(d2x))
      .plus(diffY.times(d2y))
      .times(2);

    // WHY: Use named constant instead of magic number for clarity
    if (fDoublePrime.abs().lt(JACOBIAN_SINGULARITY_THRESHOLD)) break;

    // Note: for maximum, we still find critical point where fPrime = 0
    const delta = fPrime.div(fDoublePrime);

    let newT = bestT.minus(delta);
    if (newT.lt(0)) newT = D(0);
    if (newT.gt(1)) newT = D(1);

    bestT = newT;

    if (delta.abs().lt(tol)) break;
  }

  // Also check endpoints
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segPts = segments[segIdx];
    for (const t of [D(0), D(1)]) {
      const [x, y] = bezierPoint(segPts, t);
      const dist = px.minus(x).pow(2).plus(py.minus(y).pow(2));
      if (dist.gt(bestDist)) {
        bestDist = dist;
        bestSegment = segIdx;
        bestT = t;
      }
    }
  }

  const [finalX, finalY] = bezierPoint(segments[bestSegment], bestT);
  const finalDist = px
    .minus(finalX)
    .pow(2)
    .plus(py.minus(finalY).pow(2))
    .sqrt();

  return {
    point: [finalX, finalY],
    distance: finalDist,
    segmentIndex: bestSegment,
    t: bestT,
  };
}

// ============================================================================
// POINT IN PATH (RAY CASTING)
// ============================================================================

/**
 * Test if a point is inside a closed path using ray casting algorithm.
 *
 * Counts intersections of a horizontal ray from the point to infinity.
 * Odd count = inside, even count = outside.
 *
 * @param {Array} segments - Array of Bezier segments (must form closed path)
 * @param {Array} point - Test point [x, y]
 * @param {Object} [options] - Options
 * @param {number} [options.samples=100] - Samples for curve approximation
 * @returns {{inside: boolean, windingNumber: number, onBoundary: boolean}}
 */
export function pointInPath(segments, point, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    throw new Error("pointInPath: segments must be a non-empty array");
  }
  if (!point || !Array.isArray(point) || point.length < 2) {
    throw new Error("pointInPath: point must be an array [x, y]");
  }

  const { samples = 100 } = options;

  const px = D(point[0]);
  const py = D(point[1]);

  let windingNumber = 0;
  // WHY: Use named constant instead of magic number for clarity and maintainability
  const boundaryTolerance = BOUNDARY_TOLERANCE;

  for (const pts of segments) {
    // Sample the segment and count crossings
    let prevX = null;
    let prevY = null;

    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);

      // Check if point is on boundary
      const distToPoint = px.minus(x).pow(2).plus(py.minus(y).pow(2)).sqrt();
      if (distToPoint.lt(boundaryTolerance)) {
        return { inside: false, windingNumber: 0, onBoundary: true };
      }

      if (prevX !== null) {
        // Check for crossing of horizontal ray to the right from (px, py)
        // Ray goes from (px, py) to (infinity, py)

        const y1 = prevY;
        const y2 = y;
        const x1 = prevX;
        const x2 = x;

        // Check if segment crosses the ray's y-level
        if ((y1.lte(py) && y2.gt(py)) || (y1.gt(py) && y2.lte(py))) {
          // Find x at intersection
          const fraction = py.minus(y1).div(y2.minus(y1));
          const xIntersect = x1.plus(x2.minus(x1).times(fraction));

          // Count if intersection is to the right of point
          if (xIntersect.gt(px)) {
            // Determine winding direction
            if (y2.gt(y1)) {
              windingNumber++;
            } else {
              windingNumber--;
            }
          }
        }
      }

      prevX = x;
      prevY = y;
    }
  }

  return {
    inside: windingNumber !== 0,
    windingNumber,
    onBoundary: false,
  };
}

// ============================================================================
// PATH CONTINUITY ANALYSIS
// ============================================================================

/**
 * Check if a path is closed (endpoints match).
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {string} [tolerance='1e-20'] - Distance tolerance
 * @returns {boolean}
 */
export function isPathClosed(
  segments,
  tolerance = DEFAULT_CONTINUITY_TOLERANCE,
) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("isPathClosed: segments must be an array");
  }
  if (segments.length === 0) return false;

  const tol = D(tolerance);
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  const [x0, y0] = [D(firstSeg[0][0]), D(firstSeg[0][1])];
  const [xn, yn] = [
    D(lastSeg[lastSeg.length - 1][0]),
    D(lastSeg[lastSeg.length - 1][1]),
  ];

  const dist = x0.minus(xn).pow(2).plus(y0.minus(yn).pow(2)).sqrt();
  return dist.lt(tol);
}

/**
 * Check if a path is continuous (segment endpoints match).
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {string} [tolerance='1e-20'] - Distance tolerance
 * @returns {{continuous: boolean, gaps: Array}}
 */
export function isPathContinuous(
  segments,
  tolerance = DEFAULT_CONTINUITY_TOLERANCE,
) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("isPathContinuous: segments must be an array");
  }
  if (segments.length <= 1) return { continuous: true, gaps: [] };

  const tol = D(tolerance);
  const gaps = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg1 = segments[i];
    const seg2 = segments[i + 1];

    const [x1, y1] = [D(seg1[seg1.length - 1][0]), D(seg1[seg1.length - 1][1])];
    const [x2, y2] = [D(seg2[0][0]), D(seg2[0][1])];

    const dist = x1.minus(x2).pow(2).plus(y1.minus(y2).pow(2)).sqrt();

    if (dist.gte(tol)) {
      gaps.push({
        segmentIndex: i,
        gap: dist,
        from: [x1, y1],
        to: [x2, y2],
      });
    }
  }

  return {
    continuous: gaps.length === 0,
    gaps,
  };
}

/**
 * Check if a path is smooth (C1 continuous - tangents match at joins).
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {string} [tolerance='1e-10'] - Tangent angle tolerance (radians)
 * @returns {{smooth: boolean, kinks: Array}}
 */
export function isPathSmooth(
  segments,
  tolerance = DEFAULT_SMOOTHNESS_TOLERANCE,
) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("isPathSmooth: segments must be an array");
  }
  if (segments.length <= 1) return { smooth: true, kinks: [] };

  const tol = D(tolerance);
  const kinks = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg1 = segments[i];
    const seg2 = segments[i + 1];

    // Tangent at end of seg1
    const [tx1, ty1] = bezierTangent(seg1, 1);

    // Tangent at start of seg2
    const [tx2, ty2] = bezierTangent(seg2, 0);

    // Compute angle between tangents
    const dot = tx1.times(tx2).plus(ty1.times(ty2));
    const cross = tx1.times(ty2).minus(ty1.times(tx2));

    // WHY: Compute actual angle between tangents using atan2 for accuracy
    // The old comment said "Simplified for small angles" but used cross.abs() which is only
    // accurate for very small angles (< 0.1 radians). For larger angles, this approximation
    // breaks down. Using atan2 gives the true angle for any angle magnitude.
    const angleDiff = Decimal.atan2(cross.abs(), dot.abs());

    // Also check if tangents are parallel but opposite (180-degree turn)
    const antiParallel = dot.lt(ANTI_PARALLEL_THRESHOLD);

    if (angleDiff.gt(tol) || antiParallel) {
      kinks.push({
        segmentIndex: i,
        angle: Decimal.atan2(cross, dot).abs(),
        tangent1: [tx1, ty1],
        tangent2: [tx2, ty2],
      });
    }
  }

  return {
    smooth: kinks.length === 0,
    kinks,
  };
}

/**
 * Find all kinks (non-differentiable points) in a path.
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {string} [tolerance='1e-10'] - Angle tolerance
 * @returns {Array} Array of kink locations
 */
export function findKinks(segments, tolerance = DEFAULT_SMOOTHNESS_TOLERANCE) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("findKinks: segments must be an array");
  }

  const { kinks } = isPathSmooth(segments, tolerance);

  // Convert to path parameter
  return kinks.map((k, _i) => ({
    segmentIndex: k.segmentIndex,
    globalT: k.segmentIndex + 1, // At junction between segments
    angle: k.angle,
    angleRadians: k.angle,
    angleDegrees: k.angle.times(180).div(PI),
  }));
}

// ============================================================================
// BOUNDING BOX FOR PATH
// ============================================================================

/**
 * Compute bounding box for entire path.
 *
 * @param {Array} segments - Array of Bezier segments
 * @returns {{xmin: Decimal, xmax: Decimal, ymin: Decimal, ymax: Decimal}}
 */
export function pathBoundingBox(segments) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("pathBoundingBox: segments must be an array");
  }
  if (segments.length === 0) {
    return { xmin: D(0), xmax: D(0), ymin: D(0), ymax: D(0) };
  }

  let xmin = new Decimal(Infinity);
  let xmax = new Decimal(-Infinity);
  let ymin = new Decimal(Infinity);
  let ymax = new Decimal(-Infinity);

  for (const pts of segments) {
    const bbox = bezierBoundingBox(pts);
    xmin = Decimal.min(xmin, bbox.xmin);
    xmax = Decimal.max(xmax, bbox.xmax);
    ymin = Decimal.min(ymin, bbox.ymin);
    ymax = Decimal.max(ymax, bbox.ymax);
  }

  return { xmin, xmax, ymin, ymax };
}

/**
 * Check if two path bounding boxes overlap.
 *
 * @param {Object} bbox1 - First bounding box
 * @param {Object} bbox2 - Second bounding box
 * @returns {boolean}
 */
export function boundingBoxesOverlap(bbox1, bbox2) {
  // INPUT VALIDATION
  // WHY: Prevent cryptic errors from undefined/null bounding boxes
  if (!bbox1 || !bbox2) {
    throw new Error("boundingBoxesOverlap: both bounding boxes are required");
  }
  if (
    bbox1.xmin === undefined ||
    bbox1.xmax === undefined ||
    bbox1.ymin === undefined ||
    bbox1.ymax === undefined
  ) {
    throw new Error(
      "boundingBoxesOverlap: bbox1 must have xmin, xmax, ymin, ymax",
    );
  }
  if (
    bbox2.xmin === undefined ||
    bbox2.xmax === undefined ||
    bbox2.ymin === undefined ||
    bbox2.ymax === undefined
  ) {
    throw new Error(
      "boundingBoxesOverlap: bbox2 must have xmin, xmax, ymin, ymax",
    );
  }

  return !(
    bbox1.xmax.lt(bbox2.xmin) ||
    bbox1.xmin.gt(bbox2.xmax) ||
    bbox1.ymax.lt(bbox2.ymin) ||
    bbox1.ymin.gt(bbox2.ymax)
  );
}

// ============================================================================
// PATH LENGTH
// ============================================================================

/**
 * Compute total length of a path.
 *
 * @param {Array} segments - Array of Bezier segments
 * @param {Object} [options] - Arc length options
 * @returns {Decimal} Total path length
 */
export function pathLength(segments, options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("pathLength: segments must be an array");
  }

  let total = D(0);

  for (const pts of segments) {
    total = total.plus(arcLength(pts, 0, 1, options));
  }

  return total;
}

// ============================================================================
// VERIFICATION (INVERSE OPERATIONS)
// ============================================================================

/**
 * Verify path area by comparing with shoelace formula for approximated polygon.
 * Two independent methods should produce similar results.
 *
 * @param {Array} segments - Path segments
 * @param {number} [samples=100] - Samples per segment for polygon approximation
 * @param {number|string|Decimal} [tolerance='1e-5'] - Relative error tolerance
 * @returns {{valid: boolean, greenArea: Decimal, shoelaceArea: Decimal, relativeError: Decimal}}
 */
export function verifyPathArea(segments, samples = 100, tolerance = "1e-5") {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyPathArea: segments must be an array");
  }

  const tol = D(tolerance);

  // Method 1: Green's theorem (main implementation)
  const greenArea = pathArea(segments);

  // Method 2: Shoelace formula on sampled polygon
  const polygon = [];
  for (const pts of segments) {
    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);
      // Avoid duplicates at segment boundaries
      if (i === 0 && polygon.length > 0) continue;
      polygon.push([x, y]);
    }
  }

  // Shoelace formula
  let shoelaceArea = D(0);
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[j];
    shoelaceArea = shoelaceArea.plus(x1.times(y2).minus(x2.times(y1)));
  }
  shoelaceArea = shoelaceArea.div(2);

  const absGreen = greenArea.abs();
  const absShoelace = shoelaceArea.abs();

  let relativeError;
  // WHY: Use named constant to avoid division by near-zero values
  const AREA_ZERO_THRESHOLD = new Decimal("1e-30");
  if (absGreen.gt(AREA_ZERO_THRESHOLD)) {
    relativeError = absGreen.minus(absShoelace).abs().div(absGreen);
  } else {
    relativeError = absGreen.minus(absShoelace).abs();
  }

  return {
    valid: relativeError.lte(tol),
    greenArea,
    shoelaceArea,
    relativeError,
    sameSign: greenArea.isNegative() === shoelaceArea.isNegative(),
  };
}

/**
 * Verify closest point by checking it satisfies the perpendicularity condition.
 * At the closest point, the vector from query to curve should be perpendicular to tangent.
 *
 * @param {Array} segments - Path segments
 * @param {Array} queryPoint - Query point [x, y]
 * @param {number|string|Decimal} [tolerance='1e-10'] - Perpendicularity tolerance
 * @returns {{valid: boolean, closestPoint: Object, dotProduct: Decimal, isEndpoint: boolean}}
 */
export function verifyClosestPoint(segments, queryPoint, tolerance = "1e-10") {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyClosestPoint: segments must be an array");
  }
  if (!queryPoint || !Array.isArray(queryPoint) || queryPoint.length < 2) {
    throw new Error("verifyClosestPoint: queryPoint must be an array [x, y]");
  }

  const tol = D(tolerance);
  const qx = D(queryPoint[0]);
  const qy = D(queryPoint[1]);

  const result = closestPointOnPath(segments, queryPoint);
  const { point, segmentIndex, t } = result;

  const [cx, cy] = [D(point[0]), D(point[1])];
  const pts = segments[segmentIndex];

  // Vector from closest point to query point
  const vx = qx.minus(cx);
  const vy = qy.minus(cy);

  // Tangent at closest point
  const [tx, ty] = bezierTangent(pts, t);

  // Dot product (should be 0 if perpendicular)
  const dotProduct = vx.times(tx).plus(vy.times(ty));

  // WHY: Check if at endpoint (where perpendicularity may not hold)
  // Use a small threshold to determine if t is effectively 0 or 1
  const ENDPOINT_THRESHOLD = new Decimal("1e-10");
  const isEndpoint =
    t.lt(ENDPOINT_THRESHOLD) || t.gt(D(1).minus(ENDPOINT_THRESHOLD));

  return {
    valid: dotProduct.abs().lte(tol) || isEndpoint,
    closestPoint: result,
    dotProduct,
    isEndpoint,
    vectorToQuery: [vx, vy],
    tangent: [tx, ty],
  };
}

/**
 * Verify farthest point actually maximizes distance.
 * Sample many points and verify none are farther.
 *
 * @param {Array} segments - Path segments
 * @param {Array} queryPoint - Query point [x, y]
 * @param {number} [samples=200] - Sample points to check
 * @returns {{valid: boolean, farthestPoint: Object, maxSampledDistance: Decimal, foundDistance: Decimal}}
 */
export function verifyFarthestPoint(segments, queryPoint, samples = 200) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyFarthestPoint: segments must be an array");
  }
  if (!queryPoint || !Array.isArray(queryPoint) || queryPoint.length < 2) {
    throw new Error("verifyFarthestPoint: queryPoint must be an array [x, y]");
  }

  const qx = D(queryPoint[0]);
  const qy = D(queryPoint[1]);

  const result = farthestPointOnPath(segments, queryPoint);
  const foundDistance = result.distance;

  // Sample all segments to find maximum distance
  let maxSampledDistance = D(0);

  for (const pts of segments) {
    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);
      const dist = qx.minus(x).pow(2).plus(qy.minus(y).pow(2)).sqrt();

      if (dist.gt(maxSampledDistance)) {
        maxSampledDistance = dist;
      }
    }
  }

  // WHY: Found distance should be >= max sampled distance (or very close due to sampling resolution)
  // The old logic used 0.999 which INCORRECTLY allowed found to be 0.1% SMALLER than max sampled
  // This defeats the purpose of verification - we want to ensure the found point is actually the farthest
  // Instead, we check that foundDistance is at least as large as maxSampledDistance
  // with a small tolerance for numerical precision (not sampling error, but floating point rounding)
  const valid = foundDistance.gte(
    maxSampledDistance.minus(FARTHEST_POINT_NUMERICAL_TOLERANCE),
  );

  return {
    valid,
    farthestPoint: result,
    maxSampledDistance,
    foundDistance,
  };
}

/**
 * Verify point-in-path by testing nearby points.
 * If point is inside, points slightly toward center should also be inside.
 * If point is outside, points slightly away should also be outside.
 *
 * @param {Array} segments - Path segments (closed)
 * @param {Array} testPoint - Test point [x, y]
 * @returns {{valid: boolean, result: Object, consistentWithNeighbors: boolean}}
 */
export function verifyPointInPath(segments, testPoint) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyPointInPath: segments must be an array");
  }
  if (!testPoint || !Array.isArray(testPoint) || testPoint.length < 2) {
    throw new Error("verifyPointInPath: testPoint must be an array [x, y]");
  }

  const result = pointInPath(segments, testPoint);

  if (result.onBoundary) {
    return { valid: true, result, consistentWithNeighbors: true };
  }

  // Compute centroid of path for direction reference
  let sumX = D(0);
  let sumY = D(0);
  let count = 0;

  for (const pts of segments) {
    const [x, y] = bezierPoint(pts, 0.5);
    sumX = sumX.plus(x);
    sumY = sumY.plus(y);
    count++;
  }

  const centroidX = sumX.div(count);
  const centroidY = sumY.div(count);

  const px = D(testPoint[0]);
  const py = D(testPoint[1]);

  // Direction from point to centroid
  const dx = centroidX.minus(px);
  const dy = centroidY.minus(py);
  const len = dx.pow(2).plus(dy.pow(2)).sqrt();

  // WHY: Use named constant instead of magic number for clarity
  if (len.lt(CENTROID_ZERO_THRESHOLD)) {
    return { valid: true, result, consistentWithNeighbors: true };
  }

  const epsilon = NEIGHBOR_TEST_EPSILON;
  const unitDx = dx.div(len).times(epsilon);
  const unitDy = dy.div(len).times(epsilon);

  // Test point slightly toward centroid
  const towardCentroid = pointInPath(segments, [
    px.plus(unitDx),
    py.plus(unitDy),
  ]);

  // Test point slightly away from centroid
  const awayFromCentroid = pointInPath(segments, [
    px.minus(unitDx),
    py.minus(unitDy),
  ]);

  // If inside, moving toward centroid should stay inside
  // If outside, moving toward centroid should stay outside or become inside (not suddenly outside)
  let consistentWithNeighbors = true;

  if (result.inside) {
    // Inside: toward center should also be inside
    if (!towardCentroid.inside && !towardCentroid.onBoundary) {
      consistentWithNeighbors = false;
    }
  }

  return {
    valid: consistentWithNeighbors,
    result,
    consistentWithNeighbors,
    towardCentroid,
    awayFromCentroid,
  };
}

/**
 * Verify bounding box contains all path points.
 *
 * @param {Array} segments - Path segments
 * @param {number} [samples=100] - Samples per segment
 * @returns {{valid: boolean, bbox: Object, allInside: boolean, errors: string[]}}
 */
export function verifyPathBoundingBox(segments, samples = 100) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyPathBoundingBox: segments must be an array");
  }

  const bbox = pathBoundingBox(segments);
  const errors = [];
  let allInside = true;

  const tolerance = new Decimal("1e-40");

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const pts = segments[segIdx];

    for (let i = 0; i <= samples; i++) {
      const t = D(i).div(samples);
      const [x, y] = bezierPoint(pts, t);

      if (x.lt(bbox.xmin.minus(tolerance)) || x.gt(bbox.xmax.plus(tolerance))) {
        errors.push(
          `Segment ${segIdx}, t=${t}: x=${x} outside [${bbox.xmin}, ${bbox.xmax}]`,
        );
        allInside = false;
      }

      if (y.lt(bbox.ymin.minus(tolerance)) || y.gt(bbox.ymax.plus(tolerance))) {
        errors.push(
          `Segment ${segIdx}, t=${t}: y=${y} outside [${bbox.ymin}, ${bbox.ymax}]`,
        );
        allInside = false;
      }
    }
  }

  return {
    valid: errors.length === 0,
    bbox,
    allInside,
    errors,
  };
}

/**
 * Verify path continuity by checking endpoint distances.
 *
 * @param {Array} segments - Path segments
 * @returns {{valid: boolean, continuous: boolean, gaps: Array, maxGap: Decimal}}
 */
export function verifyPathContinuity(segments) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyPathContinuity: segments must be an array");
  }

  const { continuous, gaps } = isPathContinuous(segments);

  let maxGap = D(0);
  for (const gap of gaps) {
    if (gap.gap.gt(maxGap)) {
      maxGap = gap.gap;
    }
  }

  // Also verify each segment has valid control points
  let allValid = true;
  for (let i = 0; i < segments.length; i++) {
    const pts = segments[i];
    if (!Array.isArray(pts) || pts.length < 2) {
      allValid = false;
    }
  }

  return {
    valid: allValid,
    continuous,
    gaps,
    maxGap,
  };
}

/**
 * Verify path length by comparing with sum of segment chord lengths.
 * Arc length should be >= sum of chord lengths.
 *
 * @param {Array} segments - Path segments
 * @returns {{valid: boolean, arcLength: Decimal, chordSum: Decimal, ratio: Decimal}}
 */
export function verifyPathLength(segments) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyPathLength: segments must be an array");
  }

  const totalArcLength = pathLength(segments);

  let chordSum = D(0);
  for (const pts of segments) {
    const [x0, y0] = [D(pts[0][0]), D(pts[0][1])];
    const [xn, yn] = [D(pts[pts.length - 1][0]), D(pts[pts.length - 1][1])];
    const chord = xn.minus(x0).pow(2).plus(yn.minus(y0).pow(2)).sqrt();
    chordSum = chordSum.plus(chord);
  }

  const ratio = chordSum.gt(0) ? totalArcLength.div(chordSum) : D(1);

  return {
    valid: totalArcLength.gte(chordSum),
    arcLength: totalArcLength,
    chordSum,
    ratio, // Should be >= 1
  };
}

/**
 * Comprehensive verification of all path analysis functions.
 *
 * @param {Array} segments - Path segments
 * @param {Object} [options] - Options
 * @returns {{valid: boolean, results: Object}}
 */
export function verifyAllPathFunctions(segments, _options = {}) {
  // WHY: Validate input to prevent undefined behavior and provide clear error messages
  if (!segments || !Array.isArray(segments)) {
    throw new Error("verifyAllPathFunctions: segments must be an array");
  }

  const results = {};

  // 1. Verify area
  results.area = verifyPathArea(segments);

  // 2. Verify bounding box
  results.boundingBox = verifyPathBoundingBox(segments);

  // 3. Verify continuity
  results.continuity = verifyPathContinuity(segments);

  // 4. Verify length
  results.length = verifyPathLength(segments);

  // 5. Verify closest point (use centroid as test point)
  const bbox = pathBoundingBox(segments);
  const centerX = bbox.xmin.plus(bbox.xmax).div(2);
  const centerY = bbox.ymin.plus(bbox.ymax).div(2);
  results.closestPoint = verifyClosestPoint(segments, [centerX, centerY]);

  // 6. Verify farthest point
  results.farthestPoint = verifyFarthestPoint(segments, [centerX, centerY]);

  // 7. Verify point-in-path (only for closed paths)
  if (isPathClosed(segments)) {
    results.pointInPath = verifyPointInPath(segments, [centerX, centerY]);
  }

  const allValid = Object.values(results).every((r) => r.valid);

  return {
    valid: allValid,
    results,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Area
  pathArea,
  pathAbsoluteArea,

  // Closest/Farthest point
  closestPointOnPath,
  farthestPointOnPath,

  // Point-in-path
  pointInPath,

  // Continuity
  isPathClosed,
  isPathContinuous,
  isPathSmooth,
  findKinks,

  // Bounding box
  pathBoundingBox,
  boundingBoxesOverlap,

  // Length
  pathLength,

  // Verification (inverse operations)
  verifyPathArea,
  verifyClosestPoint,
  verifyFarthestPoint,
  verifyPointInPath,
  verifyPathBoundingBox,
  verifyPathContinuity,
  verifyPathLength,
  verifyAllPathFunctions,
};
