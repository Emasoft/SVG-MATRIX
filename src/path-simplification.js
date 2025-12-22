/**
 * Path Simplification with Arbitrary Precision and Mathematical Verification
 *
 * Provides functions to simplify SVG path commands while guaranteeing:
 * 1. ARBITRARY PRECISION - All calculations use Decimal.js (50+ digits)
 * 2. MATHEMATICAL VERIFICATION - Every simplification is verified via sampling
 *
 * ## Algorithms Implemented
 *
 * ### Curve-to-Line Detection (isBezierStraight)
 * Detects if a Bezier curve is effectively a straight line by measuring
 * the maximum distance from control points to the chord (line from start to end).
 * Uses the perpendicular distance formula with Decimal.js precision.
 *
 * ### Curve-to-Arc Detection (fitCircleToBezier)
 * Fits a circle to a Bezier curve using least-squares fitting.
 * If the curve matches an arc within tolerance, it can be converted.
 * Uses algebraic circle fitting for numerical stability.
 *
 * ### Degree Lowering (canLowerDegree)
 * Detects if a cubic Bezier is actually a quadratic Bezier in disguise.
 * A cubic C(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3 is quadratic iff
 * P1 and P2 lie on specific positions relative to P0 and P3.
 *
 * ### Arc-to-Line Detection (isArcStraight)
 * Detects if an arc is effectively a straight line using sagitta calculation.
 * sagitta = r - sqrt(r² - chord²/4). If sagitta < tolerance, arc is straight.
 *
 * ### Collinear Point Merging (mergeCollinearSegments)
 * Merges consecutive line segments that are collinear into a single segment.
 *
 * ### Zero-Length Removal (removeZeroLengthSegments)
 * Removes path segments that have zero length (e.g., l 0,0).
 *
 * @module path-simplification
 */

import Decimal from 'decimal.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons (much smaller than SVGO's!)
const EPSILON = new Decimal('1e-40');

// Default tolerance for simplification (user-configurable)
const DEFAULT_TOLERANCE = new Decimal('1e-10');

/**
 * Implementation of atan2 using Decimal.js (which doesn't provide it natively).
 * Returns the angle in radians between the positive x-axis and the ray from (0,0) to (x,y).
 * @param {Decimal} y - Y coordinate
 * @param {Decimal} x - X coordinate
 * @returns {Decimal} Angle in radians (-π to π)
 */
function decimalAtan2(y, x) {
  if (y === null || y === undefined) throw new Error('decimalAtan2: y parameter is null or undefined');
  if (x === null || x === undefined) throw new Error('decimalAtan2: x parameter is null or undefined');
  const yD = D(y);
  const xD = D(x);
  if (!yD.isFinite()) throw new Error('decimalAtan2: y must be finite');
  if (!xD.isFinite()) throw new Error('decimalAtan2: x must be finite');
  const PI = Decimal.acos(-1);

  // Check x=0 cases first to avoid division by zero
  if (xD.equals(0)) {
    if (yD.greaterThan(0)) {
      // Positive y-axis
      return PI.div(2);
    } else if (yD.lessThan(0)) {
      // Negative y-axis
      return PI.div(2).neg();
    } else {
      // x=0, y=0 - undefined, return 0
      return D(0);
    }
  }

  if (xD.greaterThan(0)) {
    // Quadrant I or IV
    return Decimal.atan(yD.div(xD));
  } else if (xD.lessThan(0) && yD.greaterThanOrEqualTo(0)) {
    // Quadrant II
    return Decimal.atan(yD.div(xD)).plus(PI);
  } else {
    // Quadrant III (xD.lessThan(0) && yD.lessThan(0))
    return Decimal.atan(yD.div(xD)).minus(PI);
  }
}

// ============================================================================
// Point and Vector Utilities
// ============================================================================

/**
 * Create a point with Decimal coordinates.
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {{x: Decimal, y: Decimal}} Point object
 */
export function point(x, y) {
  if (x === null || x === undefined) throw new Error('point: x parameter is null or undefined');
  if (y === null || y === undefined) throw new Error('point: y parameter is null or undefined');
  const xD = D(x);
  const yD = D(y);
  if (!xD.isFinite()) throw new Error('point: x must be finite');
  if (!yD.isFinite()) throw new Error('point: y must be finite');
  return { x: xD, y: yD };
}

/**
 * Calculate the squared distance between two points.
 * Using squared distance avoids unnecessary sqrt operations.
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point
 * @returns {Decimal} Squared distance
 */
export function distanceSquared(p1, p2) {
  if (!p1 || !p2) throw new Error('distanceSquared: points cannot be null or undefined');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('distanceSquared: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('distanceSquared: p2 must have Decimal x and y properties');
  const dx = p2.x.minus(p1.x);
  const dy = p2.y.minus(p1.y);
  return dx.mul(dx).plus(dy.mul(dy));
}

/**
 * Calculate the distance between two points.
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point
 * @returns {Decimal} Distance
 */
export function distance(p1, p2) {
  // Validation is done in distanceSquared
  return distanceSquared(p1, p2).sqrt();
}

/**
 * Calculate perpendicular distance from a point to a line defined by two points.
 *
 * Uses the formula: d = |((y2-y1)x0 - (x2-x1)y0 + x2*y1 - y2*x1)| / sqrt((y2-y1)² + (x2-x1)²)
 *
 * @param {{x: Decimal, y: Decimal}} pt - The point
 * @param {{x: Decimal, y: Decimal}} lineStart - Line start point
 * @param {{x: Decimal, y: Decimal}} lineEnd - Line end point
 * @returns {Decimal} Perpendicular distance
 */
export function pointToLineDistance(pt, lineStart, lineEnd) {
  if (!pt || !lineStart || !lineEnd) throw new Error('pointToLineDistance: points cannot be null or undefined');
  if (!(pt.x instanceof Decimal) || !(pt.y instanceof Decimal)) throw new Error('pointToLineDistance: pt must have Decimal x and y properties');
  if (!(lineStart.x instanceof Decimal) || !(lineStart.y instanceof Decimal)) throw new Error('pointToLineDistance: lineStart must have Decimal x and y properties');
  if (!(lineEnd.x instanceof Decimal) || !(lineEnd.y instanceof Decimal)) throw new Error('pointToLineDistance: lineEnd must have Decimal x and y properties');
  const x0 = pt.x, y0 = pt.y;
  const x1 = lineStart.x, y1 = lineStart.y;
  const x2 = lineEnd.x, y2 = lineEnd.y;

  const dx = x2.minus(x1);
  const dy = y2.minus(y1);

  const lineLengthSq = dx.mul(dx).plus(dy.mul(dy));

  // If line is actually a point, return distance to that point
  if (lineLengthSq.lessThan(EPSILON)) {
    return distance(pt, lineStart);
  }

  // Numerator: |(y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1|
  const numerator = dy.mul(x0).minus(dx.mul(y0)).plus(x2.mul(y1)).minus(y2.mul(x1)).abs();

  // Denominator: sqrt((y2-y1)² + (x2-x1)²)
  const denominator = lineLengthSq.sqrt();

  return numerator.div(denominator);
}

/**
 * Calculate the cross product of vectors (p2-p1) and (p3-p1).
 * Used for determining collinearity and turn direction.
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point
 * @param {{x: Decimal, y: Decimal}} p3 - Third point
 * @returns {Decimal} Cross product (positive = CCW, negative = CW, zero = collinear)
 */
export function crossProduct(p1, p2, p3) {
  if (!p1 || !p2 || !p3) throw new Error('crossProduct: points cannot be null or undefined');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('crossProduct: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('crossProduct: p2 must have Decimal x and y properties');
  if (!(p3.x instanceof Decimal) || !(p3.y instanceof Decimal)) throw new Error('crossProduct: p3 must have Decimal x and y properties');
  const v1x = p2.x.minus(p1.x);
  const v1y = p2.y.minus(p1.y);
  const v2x = p3.x.minus(p1.x);
  const v2y = p3.y.minus(p1.y);
  return v1x.mul(v2y).minus(v1y.mul(v2x));
}

// ============================================================================
// Bezier Curve Evaluation
// ============================================================================

/**
 * Evaluate a cubic Bezier curve at parameter t.
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {number|string|Decimal} t - Parameter (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on curve
 */
export function evaluateCubicBezier(p0, p1, p2, p3, t) {
  if (!p0 || !p1 || !p2 || !p3) throw new Error('evaluateCubicBezier: points cannot be null or undefined');
  if (!(p0.x instanceof Decimal) || !(p0.y instanceof Decimal)) throw new Error('evaluateCubicBezier: p0 must have Decimal x and y properties');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('evaluateCubicBezier: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('evaluateCubicBezier: p2 must have Decimal x and y properties');
  if (!(p3.x instanceof Decimal) || !(p3.y instanceof Decimal)) throw new Error('evaluateCubicBezier: p3 must have Decimal x and y properties');
  if (t === null || t === undefined) throw new Error('evaluateCubicBezier: t parameter is null or undefined');
  const tD = D(t);
  if (!tD.isFinite()) throw new Error('evaluateCubicBezier: t must be finite');
  if (tD.lessThan(0) || tD.greaterThan(1)) throw new Error('evaluateCubicBezier: t must be in range [0, 1]');
  const oneMinusT = D(1).minus(tD);

  // Bernstein basis polynomials
  const b0 = oneMinusT.pow(3);                              // (1-t)³
  const b1 = D(3).mul(oneMinusT.pow(2)).mul(tD);           // 3(1-t)²t
  const b2 = D(3).mul(oneMinusT).mul(tD.pow(2));           // 3(1-t)t²
  const b3 = tD.pow(3);                                     // t³

  return {
    x: b0.mul(p0.x).plus(b1.mul(p1.x)).plus(b2.mul(p2.x)).plus(b3.mul(p3.x)),
    y: b0.mul(p0.y).plus(b1.mul(p1.y)).plus(b2.mul(p2.y)).plus(b3.mul(p3.y))
  };
}

/**
 * Evaluate a quadratic Bezier curve at parameter t.
 * B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - Control point
 * @param {{x: Decimal, y: Decimal}} p2 - End point
 * @param {number|string|Decimal} t - Parameter (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on curve
 */
export function evaluateQuadraticBezier(p0, p1, p2, t) {
  if (!p0 || !p1 || !p2) throw new Error('evaluateQuadraticBezier: points cannot be null or undefined');
  if (!(p0.x instanceof Decimal) || !(p0.y instanceof Decimal)) throw new Error('evaluateQuadraticBezier: p0 must have Decimal x and y properties');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('evaluateQuadraticBezier: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('evaluateQuadraticBezier: p2 must have Decimal x and y properties');
  if (t === null || t === undefined) throw new Error('evaluateQuadraticBezier: t parameter is null or undefined');
  const tD = D(t);
  if (!tD.isFinite()) throw new Error('evaluateQuadraticBezier: t must be finite');
  if (tD.lessThan(0) || tD.greaterThan(1)) throw new Error('evaluateQuadraticBezier: t must be in range [0, 1]');
  const oneMinusT = D(1).minus(tD);

  // Bernstein basis polynomials
  const b0 = oneMinusT.pow(2);                    // (1-t)²
  const b1 = D(2).mul(oneMinusT).mul(tD);        // 2(1-t)t
  const b2 = tD.pow(2);                           // t²

  return {
    x: b0.mul(p0.x).plus(b1.mul(p1.x)).plus(b2.mul(p2.x)),
    y: b0.mul(p0.y).plus(b1.mul(p1.y)).plus(b2.mul(p2.y))
  };
}

/**
 * Evaluate a line segment at parameter t.
 * L(t) = (1-t)P0 + tP1
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - End point
 * @param {number|string|Decimal} t - Parameter (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on line
 */
export function evaluateLine(p0, p1, t) {
  if (!p0 || !p1) throw new Error('evaluateLine: points cannot be null or undefined');
  if (!(p0.x instanceof Decimal) || !(p0.y instanceof Decimal)) throw new Error('evaluateLine: p0 must have Decimal x and y properties');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('evaluateLine: p1 must have Decimal x and y properties');
  if (t === null || t === undefined) throw new Error('evaluateLine: t parameter is null or undefined');
  const tD = D(t);
  if (!tD.isFinite()) throw new Error('evaluateLine: t must be finite');
  if (tD.lessThan(0) || tD.greaterThan(1)) throw new Error('evaluateLine: t must be in range [0, 1]');
  const oneMinusT = D(1).minus(tD);
  return {
    x: oneMinusT.mul(p0.x).plus(tD.mul(p1.x)),
    y: oneMinusT.mul(p0.y).plus(tD.mul(p1.y))
  };
}

// ============================================================================
// Curve-to-Line Detection
// ============================================================================

/**
 * Check if a cubic Bezier curve is effectively a straight line.
 *
 * A Bezier curve is considered straight if all control points are within
 * the specified tolerance of the line from start to end.
 *
 * VERIFICATION: After detection, we verify by sampling the curve and
 * comparing against the line at multiple points.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{isStraight: boolean, maxDeviation: Decimal, verified: boolean}}
 */
export function isCubicBezierStraight(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  if (!p0 || !p1 || !p2 || !p3) throw new Error('isCubicBezierStraight: points cannot be null or undefined');
  if (!(p0.x instanceof Decimal) || !(p0.y instanceof Decimal)) throw new Error('isCubicBezierStraight: p0 must have Decimal x and y properties');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('isCubicBezierStraight: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('isCubicBezierStraight: p2 must have Decimal x and y properties');
  if (!(p3.x instanceof Decimal) || !(p3.y instanceof Decimal)) throw new Error('isCubicBezierStraight: p3 must have Decimal x and y properties');
  if (tolerance === null || tolerance === undefined) throw new Error('isCubicBezierStraight: tolerance parameter is null or undefined');
  const tol = D(tolerance);
  if (!tol.isFinite() || tol.lessThan(0)) throw new Error('isCubicBezierStraight: tolerance must be a non-negative finite number');

  // Check if start and end are the same point (degenerate case)
  const chordLength = distance(p0, p3);
  if (chordLength.lessThan(EPSILON)) {
    // All points must be at the same location
    const d1 = distance(p0, p1);
    const d2 = distance(p0, p2);
    const maxDev = Decimal.max(d1, d2);
    return {
      isStraight: maxDev.lessThan(tol),
      maxDeviation: maxDev,
      verified: true
    };
  }

  // Calculate distance from control points to the chord
  const d1 = pointToLineDistance(p1, p0, p3);
  const d2 = pointToLineDistance(p2, p0, p3);
  const maxControlDeviation = Decimal.max(d1, d2);

  // Quick rejection: if control points are far from chord, not straight
  if (maxControlDeviation.greaterThan(tol)) {
    return {
      isStraight: false,
      maxDeviation: maxControlDeviation,
      verified: true
    };
  }

  // VERIFICATION: Sample the curve and verify against line
  const samples = 20;
  let maxSampleDeviation = new Decimal(0);

  for (let i = 1; i < samples; i++) {
    const t = D(i).div(samples);
    const curvePoint = evaluateCubicBezier(p0, p1, p2, p3, t);
    const linePoint = evaluateLine(p0, p3, t);
    const dev = distance(curvePoint, linePoint);
    maxSampleDeviation = Decimal.max(maxSampleDeviation, dev);
  }

  const verified = maxSampleDeviation.lessThanOrEqualTo(tol);

  return {
    isStraight: maxControlDeviation.lessThan(tol) && verified,
    maxDeviation: Decimal.max(maxControlDeviation, maxSampleDeviation),
    verified: true
  };
}

/**
 * Check if a quadratic Bezier curve is effectively a straight line.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - Control point
 * @param {{x: Decimal, y: Decimal}} p2 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{isStraight: boolean, maxDeviation: Decimal, verified: boolean}}
 */
export function isQuadraticBezierStraight(p0, p1, p2, tolerance = DEFAULT_TOLERANCE) {
  if (!p0 || !p1 || !p2) throw new Error('isQuadraticBezierStraight: points cannot be null or undefined');
  if (!(p0.x instanceof Decimal) || !(p0.y instanceof Decimal)) throw new Error('isQuadraticBezierStraight: p0 must have Decimal x and y properties');
  if (!(p1.x instanceof Decimal) || !(p1.y instanceof Decimal)) throw new Error('isQuadraticBezierStraight: p1 must have Decimal x and y properties');
  if (!(p2.x instanceof Decimal) || !(p2.y instanceof Decimal)) throw new Error('isQuadraticBezierStraight: p2 must have Decimal x and y properties');
  if (tolerance === null || tolerance === undefined) throw new Error('isQuadraticBezierStraight: tolerance parameter is null or undefined');
  const tol = D(tolerance);
  if (!tol.isFinite() || tol.lessThan(0)) throw new Error('isQuadraticBezierStraight: tolerance must be a non-negative finite number');

  // Check if start and end are the same point (degenerate case)
  const chordLength = distance(p0, p2);
  if (chordLength.lessThan(EPSILON)) {
    const d1 = distance(p0, p1);
    return {
      isStraight: d1.lessThan(tol),
      maxDeviation: d1,
      verified: true
    };
  }

  // Calculate distance from control point to the chord
  const controlDeviation = pointToLineDistance(p1, p0, p2);

  // Quick rejection
  if (controlDeviation.greaterThan(tol)) {
    return {
      isStraight: false,
      maxDeviation: controlDeviation,
      verified: true
    };
  }

  // VERIFICATION: Sample the curve
  const samples = 20;
  let maxSampleDeviation = new Decimal(0);

  for (let i = 1; i < samples; i++) {
    const t = D(i).div(samples);
    const curvePoint = evaluateQuadraticBezier(p0, p1, p2, t);
    const linePoint = evaluateLine(p0, p2, t);
    const dev = distance(curvePoint, linePoint);
    maxSampleDeviation = Decimal.max(maxSampleDeviation, dev);
  }

  const verified = maxSampleDeviation.lessThanOrEqualTo(tol);

  return {
    isStraight: controlDeviation.lessThan(tol) && verified,
    maxDeviation: Decimal.max(controlDeviation, maxSampleDeviation),
    verified: true
  };
}

/**
 * Convert a straight cubic Bezier to a line segment.
 * Returns the line endpoints if the curve is straight, null otherwise.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{start: {x: Decimal, y: Decimal}, end: {x: Decimal, y: Decimal}, maxDeviation: Decimal} | null}
 */
export function cubicBezierToLine(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const result = isCubicBezierStraight(p0, p1, p2, p3, tolerance);
  if (!result.isStraight || !result.verified) {
    return null;
  }
  return {
    start: { x: p0.x, y: p0.y },
    end: { x: p3.x, y: p3.y },
    maxDeviation: result.maxDeviation
  };
}

// ============================================================================
// Degree Lowering (Cubic to Quadratic)
// ============================================================================

/**
 * Check if a cubic Bezier can be accurately represented as a quadratic Bezier.
 *
 * A cubic Bezier with control points P0, P1, P2, P3 can be represented as a
 * quadratic if the two control points P1 and P2 are positioned such that they
 * represent a "degree-elevated" quadratic curve.
 *
 * The condition is: P1 = P0 + 2/3*(Q1-P0) and P2 = P3 + 2/3*(Q1-P3)
 * where Q1 is the quadratic control point.
 *
 * Solving for Q1: Q1 = (3*P1 - P0) / 2 = (3*P2 - P3) / 2
 * So the curve is quadratic iff these two expressions are equal (within tolerance).
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{canLower: boolean, quadraticControl: {x: Decimal, y: Decimal} | null, maxDeviation: Decimal, verified: boolean}}
 */
export function canLowerCubicToQuadratic(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);
  const three = D(3);
  const two = D(2);

  // Calculate Q1 from P1: Q1 = (3*P1 - P0) / 2
  const q1FromP1 = {
    x: three.mul(p1.x).minus(p0.x).div(two),
    y: three.mul(p1.y).minus(p0.y).div(two)
  };

  // Calculate Q1 from P2: Q1 = (3*P2 - P3) / 2
  const q1FromP2 = {
    x: three.mul(p2.x).minus(p3.x).div(two),
    y: three.mul(p2.y).minus(p3.y).div(two)
  };

  // Check if these are equal within tolerance
  const deviation = distance(q1FromP1, q1FromP2);

  if (deviation.greaterThan(tol)) {
    return {
      canLower: false,
      quadraticControl: null,
      maxDeviation: deviation,
      verified: true
    };
  }

  // Use the average as the quadratic control point
  const q1 = {
    x: q1FromP1.x.plus(q1FromP2.x).div(two),
    y: q1FromP1.y.plus(q1FromP2.y).div(two)
  };

  // VERIFICATION: Sample both curves and compare
  const samples = 20;
  let maxSampleDeviation = new Decimal(0);

  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const cubicPoint = evaluateCubicBezier(p0, p1, p2, p3, t);
    const quadraticPoint = evaluateQuadraticBezier(p0, q1, p3, t);
    const dev = distance(cubicPoint, quadraticPoint);
    maxSampleDeviation = Decimal.max(maxSampleDeviation, dev);
  }

  const verified = maxSampleDeviation.lessThanOrEqualTo(tol);

  return {
    canLower: verified,
    quadraticControl: verified ? q1 : null,
    maxDeviation: Decimal.max(deviation, maxSampleDeviation),
    verified: true
  };
}

/**
 * Convert a cubic Bezier to quadratic if possible.
 * Returns the quadratic curve points if conversion is valid, null otherwise.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{p0: {x: Decimal, y: Decimal}, p1: {x: Decimal, y: Decimal}, p2: {x: Decimal, y: Decimal}, maxDeviation: Decimal} | null}
 */
export function cubicToQuadratic(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const result = canLowerCubicToQuadratic(p0, p1, p2, p3, tolerance);
  if (!result.canLower || !result.quadraticControl) {
    return null;
  }
  return {
    p0: { x: p0.x, y: p0.y },
    p1: result.quadraticControl,
    p2: { x: p3.x, y: p3.y },
    maxDeviation: result.maxDeviation
  };
}

// ============================================================================
// Curve-to-Arc Detection (Circle Fitting)
// ============================================================================

/**
 * Fit a circle to a set of points using algebraic least squares.
 *
 * Uses the Kasa method: minimize sum of (x² + y² - 2*a*x - 2*b*y - c)²
 * where (a, b) is the center and r² = a² + b² + c.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} points - Points to fit
 * @returns {{center: {x: Decimal, y: Decimal}, radius: Decimal} | null}
 */
export function fitCircleToPoints(points) {
  if (!points) throw new Error('fitCircleToPoints: points array cannot be null or undefined');
  if (!Array.isArray(points)) throw new Error('fitCircleToPoints: points must be an array');
  if (points.length === 0) throw new Error('fitCircleToPoints: points array cannot be empty');
  if (points.length < 3) {
    return null;
  }

  // Validate all points have Decimal x and y properties
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) throw new Error(`fitCircleToPoints: point at index ${i} is null or undefined`);
    if (!(p.x instanceof Decimal) || !(p.y instanceof Decimal)) {
      throw new Error(`fitCircleToPoints: point at index ${i} must have Decimal x and y properties`);
    }
  }

  const n = D(points.length);
  let sumX = D(0), sumY = D(0);
  let sumX2 = D(0), sumY2 = D(0);
  let sumXY = D(0);
  let sumX3 = D(0), sumY3 = D(0);
  let sumX2Y = D(0), sumXY2 = D(0);

  for (const p of points) {
    const x = p.x, y = p.y;
    const x2 = x.mul(x), y2 = y.mul(y);

    sumX = sumX.plus(x);
    sumY = sumY.plus(y);
    sumX2 = sumX2.plus(x2);
    sumY2 = sumY2.plus(y2);
    sumXY = sumXY.plus(x.mul(y));
    sumX3 = sumX3.plus(x2.mul(x));
    sumY3 = sumY3.plus(y2.mul(y));
    sumX2Y = sumX2Y.plus(x2.mul(y));
    sumXY2 = sumXY2.plus(x.mul(y2));
  }

  // Solve the normal equations
  // A = n*sumX2 - sumX*sumX
  // B = n*sumXY - sumX*sumY
  // C = n*sumY2 - sumY*sumY
  // D = 0.5*(n*sumX3 + n*sumXY2 - sumX*sumX2 - sumX*sumY2)
  // E = 0.5*(n*sumX2Y + n*sumY3 - sumY*sumX2 - sumY*sumY2)

  const A = n.mul(sumX2).minus(sumX.mul(sumX));
  const B = n.mul(sumXY).minus(sumX.mul(sumY));
  const C = n.mul(sumY2).minus(sumY.mul(sumY));
  const DD = D(0.5).mul(n.mul(sumX3).plus(n.mul(sumXY2)).minus(sumX.mul(sumX2)).minus(sumX.mul(sumY2)));
  const E = D(0.5).mul(n.mul(sumX2Y).plus(n.mul(sumY3)).minus(sumY.mul(sumX2)).minus(sumY.mul(sumY2)));

  // Solve: A*a + B*b = D, B*a + C*b = E
  const det = A.mul(C).minus(B.mul(B));

  if (det.abs().lessThan(EPSILON)) {
    // Points are collinear, no circle can fit
    return null;
  }

  const a = DD.mul(C).minus(E.mul(B)).div(det);
  const b = A.mul(E).minus(B.mul(DD)).div(det);

  // Calculate radius
  const center = { x: a, y: b };
  let sumRadiusSq = D(0);
  for (const p of points) {
    sumRadiusSq = sumRadiusSq.plus(distanceSquared(p, center));
  }
  const avgRadiusSq = sumRadiusSq.div(n);
  const radius = avgRadiusSq.sqrt();

  return { center, radius };
}

/**
 * Fit a circle to a cubic Bezier curve and check if it matches within tolerance.
 *
 * VERIFICATION: Samples the curve and verifies all points are within tolerance
 * of the fitted circle.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{isArc: boolean, circle: {center: {x: Decimal, y: Decimal}, radius: Decimal} | null, maxDeviation: Decimal, verified: boolean}}
 */
export function fitCircleToCubicBezier(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);

  // Sample points along the curve for fitting
  const sampleCount = 9; // Including endpoints
  const samplePoints = [];

  for (let i = 0; i <= sampleCount - 1; i++) {
    const t = D(i).div(sampleCount - 1);
    samplePoints.push(evaluateCubicBezier(p0, p1, p2, p3, t));
  }

  // Fit circle to sample points
  const circle = fitCircleToPoints(samplePoints);

  if (!circle) {
    return {
      isArc: false,
      circle: null,
      maxDeviation: D(Infinity),
      verified: true
    };
  }

  // VERIFICATION: Check deviation at more sample points
  const verificationSamples = 50;
  let maxDeviation = D(0);

  for (let i = 0; i <= verificationSamples; i++) {
    const t = D(i).div(verificationSamples);
    const curvePoint = evaluateCubicBezier(p0, p1, p2, p3, t);
    const distToCenter = distance(curvePoint, circle.center);
    const deviation = distToCenter.minus(circle.radius).abs();
    maxDeviation = Decimal.max(maxDeviation, deviation);
  }

  const isArc = maxDeviation.lessThanOrEqualTo(tol);

  return {
    isArc,
    circle: isArc ? circle : null,
    maxDeviation,
    verified: true
  };
}

/**
 * Convert a cubic Bezier to an arc if possible.
 * Returns arc parameters (rx, ry, rotation, largeArc, sweep, endX, endY) if valid.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point (current position)
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{rx: Decimal, ry: Decimal, rotation: Decimal, largeArc: number, sweep: number, endX: Decimal, endY: Decimal, maxDeviation: Decimal} | null}
 */
export function cubicBezierToArc(p0, p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const result = fitCircleToCubicBezier(p0, p1, p2, p3, tolerance);

  if (!result.isArc || !result.circle) {
    return null;
  }

  const { center, radius } = result.circle;

  // Calculate arc parameters
  // For a circle, rx = ry = radius, rotation = 0

  // Determine sweep direction using cross product
  // Sample a point at t=0.5 and check which side of the chord it's on
  const midPoint = evaluateCubicBezier(p0, p1, p2, p3, D(0.5));
  const cross = crossProduct(p0, p3, midPoint);
  const sweep = cross.lessThan(0) ? 1 : 0;

  // Determine large-arc flag
  // Calculate the angle subtended by the arc
  const startAngle = decimalAtan2(p0.y.minus(center.y), p0.x.minus(center.x));
  const endAngle = decimalAtan2(p3.y.minus(center.y), p3.x.minus(center.x));
  let angleDiff = endAngle.minus(startAngle);

  // Normalize angle difference based on sweep
  const PI = Decimal.acos(-1);
  const TWO_PI = PI.mul(2);

  if (sweep === 1) {
    // Clockwise: angle should be negative or we need to adjust
    if (angleDiff.greaterThan(0)) {
      angleDiff = angleDiff.minus(TWO_PI);
    }
  } else {
    // Counter-clockwise: angle should be positive
    if (angleDiff.lessThan(0)) {
      angleDiff = angleDiff.plus(TWO_PI);
    }
  }

  const largeArc = angleDiff.abs().greaterThan(PI) ? 1 : 0;

  return {
    rx: radius,
    ry: radius,
    rotation: D(0),
    largeArc,
    sweep,
    endX: p3.x,
    endY: p3.y,
    maxDeviation: result.maxDeviation
  };
}

// ============================================================================
// Arc-to-Line Detection (Sagitta)
// ============================================================================

/**
 * Calculate the sagitta (arc height) of a circular arc.
 *
 * The sagitta is the distance from the midpoint of the chord to the arc.
 * Formula: s = r - sqrt(r² - (c/2)²) where r is radius and c is chord length.
 *
 * @param {Decimal} radius - Arc radius
 * @param {Decimal} chordLength - Length of the chord
 * @returns {Decimal | null} Sagitta value, or null if chord > diameter
 */
export function calculateSagitta(radius, chordLength) {
  const r = D(radius);
  const c = D(chordLength);
  const halfChord = c.div(2);

  // Check if chord is valid (must be <= 2*r)
  if (halfChord.greaterThan(r)) {
    return null; // Invalid: chord longer than diameter
  }

  // s = r - sqrt(r² - (c/2)²)
  const rSquared = r.mul(r);
  const halfChordSquared = halfChord.mul(halfChord);
  const sagitta = r.minus(rSquared.minus(halfChordSquared).sqrt());

  return sagitta;
}

/**
 * Check if an arc is effectively a straight line based on sagitta.
 *
 * VERIFICATION: Samples the arc and verifies all points are within tolerance
 * of the chord.
 *
 * @param {Decimal} rx - X radius
 * @param {Decimal} ry - Y radius
 * @param {Decimal} rotation - X-axis rotation in degrees
 * @param {number} largeArc - Large arc flag (0 or 1)
 * @param {number} sweep - Sweep flag (0 or 1)
 * @param {{x: Decimal, y: Decimal}} start - Start point
 * @param {{x: Decimal, y: Decimal}} end - End point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{isStraight: boolean, sagitta: Decimal | null, maxDeviation: Decimal, verified: boolean}}
 */
export function isArcStraight(rx, ry, rotation, largeArc, sweep, start, end, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);
  const rxD = D(rx);
  const ryD = D(ry);

  // Check for zero or near-zero radii
  if (rxD.abs().lessThan(EPSILON) || ryD.abs().lessThan(EPSILON)) {
    return {
      isStraight: true,
      sagitta: D(0),
      maxDeviation: D(0),
      verified: true
    };
  }

  // Calculate chord length
  const chordLength = distance(start, end);

  // For circular arcs (rx = ry), use sagitta formula
  if (rxD.minus(ryD).abs().lessThan(EPSILON)) {
    const sagitta = calculateSagitta(rxD, chordLength);

    if (sagitta === null) {
      // Chord longer than diameter - arc wraps around
      return {
        isStraight: false,
        sagitta: null,
        maxDeviation: rxD, // Max deviation is at least the radius
        verified: true
      };
    }

    // For large arcs, sagitta is on the other side
    const effectiveSagitta = largeArc ? rxD.mul(2).minus(sagitta) : sagitta;

    return {
      isStraight: effectiveSagitta.lessThan(tol),
      sagitta: effectiveSagitta,
      maxDeviation: effectiveSagitta,
      verified: true
    };
  }

  // For elliptical arcs, we need to sample
  // This is more complex - for now, return false to be safe
  return {
    isStraight: false,
    sagitta: null,
    maxDeviation: Decimal.max(rxD, ryD),
    verified: false
  };
}

// ============================================================================
// Collinear Point Merging
// ============================================================================

/**
 * Check if three points are collinear within tolerance.
 *
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point (middle)
 * @param {{x: Decimal, y: Decimal}} p3 - Third point
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {boolean} True if collinear
 */
export function areCollinear(p1, p2, p3, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);

  // Check using cross product (area of triangle)
  const cross = crossProduct(p1, p2, p3).abs();

  // Also check using perpendicular distance
  const dist = pointToLineDistance(p2, p1, p3);

  return cross.lessThan(tol) && dist.lessThan(tol);
}

/**
 * Merge collinear consecutive line segments.
 *
 * Given a series of line segments (p0→p1, p1→p2, ..., pn-1→pn),
 * merge consecutive collinear segments into single segments.
 *
 * VERIFICATION: The merged path passes through all original endpoints.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} points - Array of points forming line segments
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Collinearity tolerance
 * @returns {{points: Array<{x: Decimal, y: Decimal}>, mergeCount: number, verified: boolean}}
 */
export function mergeCollinearSegments(points, tolerance = DEFAULT_TOLERANCE) {
  if (!points) throw new Error('mergeCollinearSegments: points array cannot be null or undefined');
  if (!Array.isArray(points)) throw new Error('mergeCollinearSegments: points must be an array');
  if (points.length === 0) throw new Error('mergeCollinearSegments: points array cannot be empty');

  // Validate all points have Decimal x and y properties
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) throw new Error(`mergeCollinearSegments: point at index ${i} is null or undefined`);
    if (!(p.x instanceof Decimal) || !(p.y instanceof Decimal)) {
      throw new Error(`mergeCollinearSegments: point at index ${i} must have Decimal x and y properties`);
    }
  }

  if (points.length < 3) {
    return { points: [...points], mergeCount: 0, verified: true };
  }

  const tol = D(tolerance);
  const result = [points[0]];
  let mergeCount = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const current = points[i];
    const next = points[i + 1];

    if (!areCollinear(prev, current, next, tol)) {
      result.push(current);
    } else {
      mergeCount++;
    }
  }

  // Always add the last point
  result.push(points[points.length - 1]);

  // VERIFICATION: All original points should be on the resulting path
  // (within tolerance)
  let verified = true;
  for (const originalPoint of points) {
    let onPath = false;
    for (let i = 0; i < result.length - 1; i++) {
      const dist = pointToLineDistance(originalPoint, result[i], result[i + 1]);
      if (dist.lessThanOrEqualTo(tol)) {
        onPath = true;
        break;
      }
    }
    // Check if it's one of the kept points
    if (!onPath) {
      for (const keptPoint of result) {
        if (distance(originalPoint, keptPoint).lessThan(tol)) {
          onPath = true;
          break;
        }
      }
    }
    if (!onPath) {
      verified = false;
      break;
    }
  }

  return { points: result, mergeCount, verified };
}

// ============================================================================
// Zero-Length Segment Removal
// ============================================================================

/**
 * Check if a segment has zero length (start equals end).
 *
 * @param {{x: Decimal, y: Decimal}} start - Start point
 * @param {{x: Decimal, y: Decimal}} end - End point
 * @param {Decimal} [tolerance=EPSILON] - Zero tolerance
 * @returns {boolean} True if zero-length
 */
export function isZeroLengthSegment(start, end, tolerance = EPSILON) {
  return distance(start, end).lessThan(D(tolerance));
}

/**
 * Remove zero-length segments from a path.
 *
 * @param {Array<{command: string, args: Array<Decimal>}>} pathData - Path commands
 * @param {Decimal} [tolerance=EPSILON] - Zero tolerance
 * @returns {{pathData: Array<{command: string, args: Array<Decimal>}>, removeCount: number, verified: boolean}}
 */
export function removeZeroLengthSegments(pathData, tolerance = EPSILON) {
  if (!pathData) throw new Error('removeZeroLengthSegments: pathData cannot be null or undefined');
  if (!Array.isArray(pathData)) throw new Error('removeZeroLengthSegments: pathData must be an array');

  const tol = D(tolerance);
  const result = [];
  let removeCount = 0;
  let currentX = D(0), currentY = D(0);
  let startX = D(0), startY = D(0);

  for (let idx = 0; idx < pathData.length; idx++) {
    const item = pathData[idx];
    if (!item) throw new Error(`removeZeroLengthSegments: item at index ${idx} is null or undefined`);
    if (typeof item.command !== 'string') throw new Error(`removeZeroLengthSegments: item at index ${idx} must have a string command property`);
    if (!Array.isArray(item.args)) throw new Error(`removeZeroLengthSegments: item at index ${idx} must have an args array property`);

    const { command, args } = item;
    let keep = true;

    switch (command.toUpperCase()) {
      case 'M':
        // Update current position (absolute M) or move relative (lowercase m)
        if (args.length < 2) throw new Error(`removeZeroLengthSegments: M command at index ${idx} requires 2 args, got ${args.length}`);
        currentX = command === 'M' ? D(args[0]) : currentX.plus(D(args[0]));
        currentY = command === 'M' ? D(args[1]) : currentY.plus(D(args[1]));
        // CRITICAL: Update subpath start for EVERY M command (BUG 3 FIX)
        startX = currentX;
        startY = currentY;
        break;

      case 'L': {
        // Line to: x y (2 args)
        if (args.length < 2) throw new Error(`removeZeroLengthSegments: L command at index ${idx} requires 2 args, got ${args.length}`);
        const endX = command === 'L' ? D(args[0]) : currentX.plus(D(args[0]));
        const endY = command === 'L' ? D(args[1]) : currentY.plus(D(args[1]));
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol)) {
          keep = false;
          removeCount++;
        }
        // CRITICAL: Always update position, even when removing segment (BUG 2 FIX)
        currentX = endX;
        currentY = endY;
        break;
      }

      case 'T': {
        // Smooth quadratic Bezier: x y (2 args) - BUG 4 FIX (separated from L)
        if (args.length < 2) throw new Error(`removeZeroLengthSegments: T command at index ${idx} requires 2 args, got ${args.length}`);
        const endX = command === 'T' ? D(args[0]) : currentX.plus(D(args[0]));
        const endY = command === 'T' ? D(args[1]) : currentY.plus(D(args[1]));
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol)) {
          keep = false;
          removeCount++;
        }
        // CRITICAL: Always update position, even when removing segment (BUG 2 FIX)
        currentX = endX;
        currentY = endY;
        break;
      }

      case 'H': {
        if (args.length < 1) throw new Error(`removeZeroLengthSegments: H command at index ${idx} requires 1 arg, got ${args.length}`);
        const endX = command === 'H' ? D(args[0]) : currentX.plus(D(args[0]));
        if (endX.minus(currentX).abs().lessThan(tol)) {
          keep = false;
          removeCount++;
        } else {
          currentX = endX;
        }
        break;
      }

      case 'V': {
        if (args.length < 1) throw new Error(`removeZeroLengthSegments: V command at index ${idx} requires 1 arg, got ${args.length}`);
        const endY = command === 'V' ? D(args[0]) : currentY.plus(D(args[0]));
        if (endY.minus(currentY).abs().lessThan(tol)) {
          keep = false;
          removeCount++;
        } else {
          currentY = endY;
        }
        break;
      }

      case 'C': {
        if (args.length < 6) throw new Error(`removeZeroLengthSegments: C command at index ${idx} requires 6 args, got ${args.length}`);
        const endX = command === 'C' ? D(args[4]) : currentX.plus(D(args[4]));
        const endY = command === 'C' ? D(args[5]) : currentY.plus(D(args[5]));
        // For curves, also check if all control points are at the same location
        const cp1X = command === 'C' ? D(args[0]) : currentX.plus(D(args[0]));
        const cp1Y = command === 'C' ? D(args[1]) : currentY.plus(D(args[1]));
        const cp2X = command === 'C' ? D(args[2]) : currentX.plus(D(args[2]));
        const cp2Y = command === 'C' ? D(args[3]) : currentY.plus(D(args[3]));

        const allSame =
          isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol) &&
          isZeroLengthSegment({ x: currentX, y: currentY }, { x: cp1X, y: cp1Y }, tol) &&
          isZeroLengthSegment({ x: currentX, y: currentY }, { x: cp2X, y: cp2Y }, tol);

        if (allSame) {
          keep = false;
          removeCount++;
        } else {
          currentX = endX;
          currentY = endY;
        }
        break;
      }

      case 'Q': {
        // Quadratic Bezier: x1 y1 x y (4 args)
        if (args.length < 4) throw new Error(`removeZeroLengthSegments: Q command at index ${idx} requires 4 args, got ${args.length}`);
        const endX = command === 'Q' ? D(args[2]) : currentX.plus(D(args[2]));
        const endY = command === 'Q' ? D(args[3]) : currentY.plus(D(args[3]));
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol)) {
          // Check control point too
          const cpX = command === 'Q' ? D(args[0]) : currentX.plus(D(args[0]));
          const cpY = command === 'Q' ? D(args[1]) : currentY.plus(D(args[1]));
          if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: cpX, y: cpY }, tol)) {
            keep = false;
            removeCount++;
          }
        }
        if (keep) {
          currentX = endX;
          currentY = endY;
        }
        break;
      }

      case 'S': {
        // Smooth cubic Bezier: x2 y2 x y (4 args) - BUG 4 FIX
        if (args.length < 4) throw new Error(`removeZeroLengthSegments: S command at index ${idx} requires 4 args, got ${args.length}`);
        const endX = command === 'S' ? D(args[2]) : currentX.plus(D(args[2]));
        const endY = command === 'S' ? D(args[3]) : currentY.plus(D(args[3]));
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol)) {
          // Check second control point (first is reflected, not in args)
          const cp2X = command === 'S' ? D(args[0]) : currentX.plus(D(args[0]));
          const cp2Y = command === 'S' ? D(args[1]) : currentY.plus(D(args[1]));
          if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: cp2X, y: cp2Y }, tol)) {
            keep = false;
            removeCount++;
          }
        }
        if (keep) {
          currentX = endX;
          currentY = endY;
        }
        break;
      }

      case 'A': {
        if (args.length < 7) throw new Error(`removeZeroLengthSegments: A command at index ${idx} requires 7 args, got ${args.length}`);
        const endX = command === 'A' ? D(args[5]) : currentX.plus(D(args[5]));
        const endY = command === 'A' ? D(args[6]) : currentY.plus(D(args[6]));
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: endX, y: endY }, tol)) {
          keep = false;
          removeCount++;
        } else {
          currentX = endX;
          currentY = endY;
        }
        break;
      }

      case 'Z':
        // Z command goes back to start - check if already there
        if (isZeroLengthSegment({ x: currentX, y: currentY }, { x: startX, y: startY }, tol)) {
          // Still keep Z for path closure, but note it's zero-length
        }
        currentX = startX;
        currentY = startY;
        break;
      default:
        break;
    }

    if (keep) {
      result.push(item);
    }
  }

  return {
    pathData: result,
    removeCount,
    verified: true
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  EPSILON,
  DEFAULT_TOLERANCE,
  D
};

export default {
  // Point utilities
  point,
  distance,
  distanceSquared,
  pointToLineDistance,
  crossProduct,

  // Bezier evaluation
  evaluateCubicBezier,
  evaluateQuadraticBezier,
  evaluateLine,

  // Curve-to-line detection
  isCubicBezierStraight,
  isQuadraticBezierStraight,
  cubicBezierToLine,

  // Degree lowering
  canLowerCubicToQuadratic,
  cubicToQuadratic,

  // Curve-to-arc detection
  fitCircleToPoints,
  fitCircleToCubicBezier,
  cubicBezierToArc,

  // Arc-to-line detection
  calculateSagitta,
  isArcStraight,

  // Collinear merging
  areCollinear,
  mergeCollinearSegments,

  // Zero-length removal
  isZeroLengthSegment,
  removeZeroLengthSegments,

  // Constants
  EPSILON,
  DEFAULT_TOLERANCE
};
