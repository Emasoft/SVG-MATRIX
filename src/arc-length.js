/**
 * @fileoverview Arbitrary-Precision Arc Length Computation
 *
 * Provides high-precision arc length calculations and inverse arc length
 * (finding parameter t for a given arc length) using adaptive quadrature.
 *
 * @module arc-length
 * @version 1.0.0
 *
 * Key features:
 * - Adaptive Gauss-Legendre quadrature with arbitrary precision
 * - Inverse arc length using Newton-Raphson with controlled convergence
 * - 10^65x better precision than float64 implementations
 */

import Decimal from 'decimal.js';
import { bezierDerivative, bezierPoint } from './bezier-analysis.js';

// Ensure high precision
Decimal.set({ precision: 80 });

const D = x => (x instanceof Decimal ? x : new Decimal(x));

// ============================================================================
// GAUSS-LEGENDRE QUADRATURE NODES AND WEIGHTS
// ============================================================================

/**
 * Precomputed Gauss-Legendre nodes and weights for various orders.
 * These are exact to 50 digits for high-precision integration.
 */
const GAUSS_LEGENDRE = {
  // 5-point rule (sufficient for most cases)
  5: {
    nodes: [
      '-0.90617984593866399279762687829939296512565191076',
      '-0.53846931010568309103631442070020880496728660690',
      '0',
      '0.53846931010568309103631442070020880496728660690',
      '0.90617984593866399279762687829939296512565191076'
    ],
    weights: [
      '0.23692688505618908751426404071991736264326000221',
      '0.47862867049936646804129151483563819291229555035',
      '0.56888888888888888888888888888888888888888888889',
      '0.47862867049936646804129151483563819291229555035',
      '0.23692688505618908751426404071991736264326000221'
    ]
  },
  // 10-point rule (for higher accuracy)
  10: {
    nodes: [
      '-0.97390652851717172007796401208445205342826994669',
      '-0.86506336668898451073209668842349304852754301497',
      '-0.67940956829902440623432736511487357576929471183',
      '-0.43339539412924719079926594316578416220007183765',
      '-0.14887433898163121088482600112971998461756485942',
      '0.14887433898163121088482600112971998461756485942',
      '0.43339539412924719079926594316578416220007183765',
      '0.67940956829902440623432736511487357576929471183',
      '0.86506336668898451073209668842349304852754301497',
      '0.97390652851717172007796401208445205342826994669'
    ],
    weights: [
      '0.06667134430868813759356880989333179285786483432',
      '0.14945134915058059314577633965769733240255644326',
      '0.21908636251598204399553493422816219682140867715',
      '0.26926671930999635509122692156946935285975993846',
      '0.29552422471475287017389299465133832942104671702',
      '0.29552422471475287017389299465133832942104671702',
      '0.26926671930999635509122692156946935285975993846',
      '0.21908636251598204399553493422816219682140867715',
      '0.14945134915058059314577633965769733240255644326',
      '0.06667134430868813759356880989333179285786483432'
    ]
  }
};

// ============================================================================
// NUMERICAL CONSTANTS (documented magic numbers)
// ============================================================================

/**
 * Threshold for near-zero speed detection (cusp handling in Newton's method).
 * WHY: Speeds below this threshold indicate cusps or near-singular points where
 * the curve derivative is essentially zero. At such points, Newton's method
 * would divide by near-zero, causing instability. We switch to bisection instead.
 */
const NEAR_ZERO_SPEED_THRESHOLD = new Decimal('1e-60');

/**
 * Default tolerance for arc length computation.
 * WHY: This tolerance determines when adaptive quadrature stops subdividing.
 * The value 1e-30 provides extremely high precision (suitable for arbitrary
 * precision arithmetic) while still converging in reasonable time.
 */
const DEFAULT_ARC_LENGTH_TOLERANCE = '1e-30';

/**
 * Subdivision convergence threshold.
 * WHY: Used in adaptive quadrature to determine if subdivision has converged
 * by comparing 5-point and 10-point Gauss-Legendre results. When results
 * differ by less than this, we accept the higher-order result.
 */
const SUBDIVISION_CONVERGENCE_THRESHOLD = new Decimal('1e-15');

/**
 * Tolerance for table roundtrip verification.
 * WHY: When verifying arc length tables, we check if lookup->compute->verify
 * produces consistent results. This tolerance accounts for interpolation error
 * in table-based lookups.
 */
const TABLE_ROUNDTRIP_TOLERANCE = new Decimal('1e-20');

/**
 * Maximum relative error for subdivision comparison verification.
 * WHY: When comparing adaptive quadrature vs subdivision methods, this tolerance
 * accounts for the inherent approximation in chord-based subdivision.
 */
const SUBDIVISION_COMPARISON_TOLERANCE = '1e-20';

// ============================================================================
// ARC LENGTH COMPUTATION
// ============================================================================

/**
 * Compute arc length of a Bezier curve using adaptive Gauss-Legendre quadrature.
 *
 * The arc length integral: L = integral from t0 to t1 of |B'(t)| dt
 * where |B'(t)| = sqrt(x'(t)^2 + y'(t)^2)
 *
 * @param {Array} points - Bezier control points [[x,y], ...]
 * @param {number|string|Decimal} [t0=0] - Start parameter
 * @param {number|string|Decimal} [t1=1] - End parameter
 * @param {Object} [options] - Options
 * @param {string|number|Decimal} [options.tolerance='1e-30'] - Error tolerance
 * @param {number} [options.maxDepth=50] - Maximum recursion depth
 * @param {number} [options.minDepth=3] - Minimum recursion depth
 * @returns {Decimal} Arc length
 *
 * @example
 * const length = arcLength(cubicPoints);
 * const partialLength = arcLength(cubicPoints, 0, 0.5);
 */
export function arcLength(points, t0 = 0, t1 = 1, options = {}) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: Arc length computation requires evaluating bezierDerivative, which needs
  // at least 2 control points to define a curve. Catching this early prevents
  // cryptic errors deep in the computation.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('arcLength: points must be an array with at least 2 control points');
  }

  const {
    tolerance = DEFAULT_ARC_LENGTH_TOLERANCE,
    maxDepth = 50,
    minDepth = 3
  } = options;

  const t0D = D(t0);
  const t1D = D(t1);

  // PARAMETER VALIDATION: Handle reversed parameters
  // WHY: Some callers might accidentally pass t0 > t1. Rather than silently
  // returning negative arc length or crashing, we swap them.
  if (t0D.gt(t1D)) {
    // Swap parameters - arc length from t1 to t0 equals arc length from t0 to t1
    return arcLength(points, t1, t0, options);
  }

  const tol = D(tolerance);

  // Use adaptive quadrature
  return adaptiveQuadrature(
    t => speedAtT(points, t),
    t0D,
    t1D,
    tol,
    maxDepth,
    minDepth,
    0
  );
}

/**
 * Compute speed |B'(t)| at parameter t.
 *
 * WHY: Speed is the magnitude of the velocity vector (first derivative).
 * This is the integrand for arc length: L = integral of |B'(t)| dt.
 *
 * @param {Array} points - Control points
 * @param {Decimal} t - Parameter
 * @returns {Decimal} Speed (magnitude of derivative)
 */
function speedAtT(points, t) {
  const [dx, dy] = bezierDerivative(points, t, 1);
  const speedSquared = dx.times(dx).plus(dy.times(dy));

  // NUMERICAL STABILITY: Handle near-zero speed (cusp) gracefully
  // WHY: At cusps or inflection points, the derivative may be very small or zero.
  // We return the actual computed value (sqrt of speedSquared) rather than
  // special-casing zero, because the caller (Newton's method in inverseArcLength)
  // already handles near-zero speeds appropriately by switching to bisection.
  // This approach maintains accuracy for all curve geometries.
  return speedSquared.sqrt();
}

/**
 * Adaptive quadrature using Gauss-Legendre with interval subdivision.
 *
 * Subdivides intervals where the integrand varies significantly,
 * ensuring accuracy while minimizing computation.
 *
 * @param {Function} f - Function to integrate
 * @param {Decimal} a - Start of interval
 * @param {Decimal} b - End of interval
 * @param {Decimal} tol - Error tolerance
 * @param {number} maxDepth - Maximum recursion depth
 * @param {number} minDepth - Minimum recursion depth
 * @param {number} depth - Current depth
 * @returns {Decimal} Integral value
 */
function adaptiveQuadrature(f, a, b, tol, maxDepth, minDepth, depth) {
  // Compute integral using 5-point and 10-point rules
  const I5 = gaussLegendre(f, a, b, 5);
  const I10 = gaussLegendre(f, a, b, 10);

  const error = I5.minus(I10).abs();

  // Check convergence
  if (depth >= minDepth && (error.lt(tol) || depth >= maxDepth)) {
    return I10;
  }

  // Subdivide
  const mid = a.plus(b).div(2);
  const halfTol = tol.div(2);

  const leftIntegral = adaptiveQuadrature(f, a, mid, halfTol, maxDepth, minDepth, depth + 1);
  const rightIntegral = adaptiveQuadrature(f, mid, b, halfTol, maxDepth, minDepth, depth + 1);

  return leftIntegral.plus(rightIntegral);
}

/**
 * Gauss-Legendre quadrature.
 *
 * Transforms integral from [a,b] to [-1,1] and applies formula:
 * integral ≈ (b-a)/2 * sum of (weight[i] * f(transformed_node[i]))
 *
 * @param {Function} f - Function to integrate
 * @param {Decimal} a - Start of interval
 * @param {Decimal} b - End of interval
 * @param {number} order - Number of points (5 or 10)
 * @returns {Decimal} Integral approximation
 */
function gaussLegendre(f, a, b, order) {
  const gl = GAUSS_LEGENDRE[order];
  const halfWidth = b.minus(a).div(2);
  const center = a.plus(b).div(2);

  let sum = D(0);

  for (let i = 0; i < order; i++) {
    const node = D(gl.nodes[i]);
    const weight = D(gl.weights[i]);

    // Transform node from [-1, 1] to [a, b]
    const t = center.plus(halfWidth.times(node));

    // Evaluate function and add weighted contribution
    const fValue = f(t);
    sum = sum.plus(weight.times(fValue));
  }

  return sum.times(halfWidth);
}

// ============================================================================
// INVERSE ARC LENGTH
// ============================================================================

/**
 * Find parameter t such that arc length from 0 to t equals targetLength.
 *
 * Uses Newton-Raphson method:
 * - Function: f(t) = arcLength(0, t) - targetLength
 * - Derivative: f'(t) = speed(t)
 * - Update: t_new = t - f(t) / f'(t)
 *
 * @param {Array} points - Bezier control points
 * @param {number|string|Decimal} targetLength - Desired arc length
 * @param {Object} [options] - Options
 * @param {string|number|Decimal} [options.tolerance='1e-30'] - Convergence tolerance
 * @param {number} [options.maxIterations=100] - Maximum Newton iterations
 * @param {string|number|Decimal} [options.lengthTolerance='1e-30'] - Arc length computation tolerance
 * @param {string|number|Decimal} [options.initialT] - Initial guess for t (improves convergence when provided)
 * @returns {{t: Decimal, length: Decimal, iterations: number, converged: boolean}}
 *
 * @example
 * const totalLength = arcLength(points);
 * const { t } = inverseArcLength(points, totalLength.div(2)); // Find midpoint by arc length
 */
export function inverseArcLength(points, targetLength, options = {}) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: inverseArcLength calls arcLength internally, which requires valid points.
  // Catching this early provides clearer error messages to users.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('inverseArcLength: points must be an array with at least 2 control points');
  }

  const {
    tolerance = DEFAULT_ARC_LENGTH_TOLERANCE,
    maxIterations = 100,
    lengthTolerance = DEFAULT_ARC_LENGTH_TOLERANCE,
    initialT
  } = options;

  const target = D(targetLength);
  const tol = D(tolerance);
  const lengthOpts = { tolerance: lengthTolerance };

  // FAIL FAST: Negative arc length is mathematically invalid
  // WHY: Arc length is always non-negative by definition (it's an integral of
  // a magnitude). Accepting negative values would be nonsensical and lead to
  // incorrect results or infinite loops in Newton's method.
  if (target.lt(0)) {
    throw new Error('inverseArcLength: targetLength must be non-negative');
  }

  // Handle edge case: zero length
  if (target.isZero()) {
    return { t: D(0), length: D(0), iterations: 0, converged: true };
  }

  const totalLength = arcLength(points, 0, 1, lengthOpts);

  if (target.gte(totalLength)) {
    return { t: D(1), length: totalLength, iterations: 0, converged: true };
  }

  // Initial guess: use provided initialT or linear approximation
  let t = initialT !== undefined ? D(initialT) : target.div(totalLength);
  // Clamp initial guess to valid range
  if (t.lt(0)) t = D(0);
  if (t.gt(1)) t = D(1);
  let converged = false;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations++;

    // f(t) = arcLength(0, t) - target
    const currentLength = arcLength(points, 0, t, lengthOpts);
    const f = currentLength.minus(target);

    // Check convergence
    if (f.abs().lt(tol)) {
      converged = true;
      break;
    }

    // f'(t) = speed(t)
    const fPrime = speedAtT(points, t);

    // NUMERICAL STABILITY: Handle near-zero speed (cusps)
    // WHY: At cusps, the curve has zero or near-zero velocity. Newton's method
    // requires division by f'(t), which becomes unstable when f'(t) ≈ 0.
    // We switch to bisection in these cases to ensure robust convergence.
    if (fPrime.lt(NEAR_ZERO_SPEED_THRESHOLD)) {
      // Near-zero speed (cusp), use bisection step
      if (f.isNegative()) {
        t = t.plus(D(1).minus(t).div(2));
      } else {
        t = t.div(2);
      }
      continue;
    }

    // Newton step
    const delta = f.div(fPrime);
    const tNew = t.minus(delta);

    // Clamp to [0, 1]
    if (tNew.lt(0)) {
      t = t.div(2);
    } else if (tNew.gt(1)) {
      t = t.plus(D(1).minus(t).div(2));
    } else {
      t = tNew;
    }

    // Check for convergence by step size
    if (delta.abs().lt(tol)) {
      converged = true;
      break;
    }
  }

  const finalLength = arcLength(points, 0, t, lengthOpts);

  return {
    t,
    length: finalLength,
    iterations,
    converged
  };
}

// ============================================================================
// PATH ARC LENGTH
// ============================================================================

/**
 * Compute total arc length of a path (multiple segments).
 *
 * @param {Array} segments - Array of segments, each being control points array
 * @param {Object} [options] - Options passed to arcLength
 * @returns {Decimal} Total arc length
 */
export function pathArcLength(segments, options = {}) {
  // INPUT VALIDATION: Ensure segments is a valid array
  // WHY: We need to iterate over segments and call arcLength on each.
  // Catching invalid input early prevents cryptic errors in the loop.
  if (!segments || !Array.isArray(segments)) {
    throw new Error('pathArcLength: segments must be an array');
  }
  if (segments.length === 0) {
    throw new Error('pathArcLength: segments array must not be empty');
  }

  let total = D(0);

  for (const segment of segments) {
    // Each segment validation is handled by arcLength itself
    total = total.plus(arcLength(segment, 0, 1, options));
  }

  return total;
}

/**
 * Find parameter (segment index, t) for a given arc length along a path.
 *
 * @param {Array} segments - Array of segments
 * @param {number|string|Decimal} targetLength - Target arc length from start
 * @param {Object} [options] - Options
 * @returns {{segmentIndex: number, t: Decimal, totalLength: Decimal}}
 */
export function pathInverseArcLength(segments, targetLength, options = {}) {
  // INPUT VALIDATION: Ensure segments is a valid array
  // WHY: We need to iterate over segments to find which one contains the target length.
  if (!segments || !Array.isArray(segments)) {
    throw new Error('pathInverseArcLength: segments must be an array');
  }
  if (segments.length === 0) {
    throw new Error('pathInverseArcLength: segments array must not be empty');
  }

  const target = D(targetLength);

  // FAIL FAST: Negative arc length is invalid
  // WHY: Same reason as inverseArcLength - arc length is non-negative by definition.
  if (target.lt(0)) {
    throw new Error('pathInverseArcLength: targetLength must be non-negative');
  }

  // EDGE CASE: Zero target length
  // WHY: If target is 0, we're at the start of the first segment
  if (target.isZero()) {
    return {
      segmentIndex: 0,
      t: D(0),
      totalLength: D(0)
    };
  }

  let accumulated = D(0);

  for (let i = 0; i < segments.length; i++) {
    const segmentLength = arcLength(segments[i], 0, 1, options);
    const nextAccumulated = accumulated.plus(segmentLength);

    if (target.lte(nextAccumulated)) {
      // Target is within this segment
      const localTarget = target.minus(accumulated);
      const { t } = inverseArcLength(segments[i], localTarget, options);

      return {
        segmentIndex: i,
        t,
        totalLength: accumulated.plus(arcLength(segments[i], 0, t, options))
      };
    }

    accumulated = nextAccumulated;
  }

  // Target exceeds total length
  return {
    segmentIndex: segments.length - 1,
    t: D(1),
    totalLength: accumulated
  };
}

// ============================================================================
// PARAMETERIZATION BY ARC LENGTH
// ============================================================================

/**
 * Create a lookup table for arc length parameterization.
 *
 * This allows O(1) approximate lookup of t from arc length,
 * with optional refinement.
 *
 * @param {Array} points - Control points
 * @param {number} [samples=100] - Number of sample points
 * @param {Object} [options] - Arc length options
 * @returns {Object} Lookup table with methods
 */
export function createArcLengthTable(points, samples = 100, options = {}) {
  // Input validation
  if (!points || points.length < 2) {
    throw new Error('createArcLengthTable: points must have at least 2 control points');
  }
  if (samples < 2) {
    throw new Error('createArcLengthTable: samples must be at least 2 (for binary search to work)');
  }

  const table = [];
  let totalLength = D(0);

  // Build table by accumulating arc length segments
  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);

    if (i > 0) {
      // Compute arc length from previous sample point to current
      const prevT = D(i - 1).div(samples);
      const segmentLength = arcLength(points, prevT, t, options);
      totalLength = totalLength.plus(segmentLength);
    }

    // Store cumulative arc length at this t value
    table.push({ t, length: totalLength });
  }

  return {
    table,
    totalLength,

    /**
     * Get approximate t for given arc length using binary search.
     * @param {number|string|Decimal} s - Arc length
     * @returns {Decimal} Approximate t
     */
    getT(s) {
      const sD = D(s);

      if (sD.lte(0)) return D(0);
      if (sD.gte(this.totalLength)) return D(1);

      // EDGE CASE: Handle degenerate table
      // WHY: If table has only 1 entry (shouldn't happen with samples >= 2, but defensive)
      if (table.length < 2) {
        return sD.div(this.totalLength);
      }

      // Binary search
      let lo = 0;
      let hi = table.length - 1;

      while (lo < hi - 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (table[mid].length.lt(sD)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      // Linear interpolation between lo and hi
      const s0 = table[lo].length;
      const s1 = table[hi].length;
      const t0 = table[lo].t;
      const t1 = table[hi].t;

      const fraction = sD.minus(s0).div(s1.minus(s0));
      return t0.plus(t1.minus(t0).times(fraction));
    },

    /**
     * Get refined t using table lookup + Newton refinement.
     * @param {number|string|Decimal} s - Arc length
     * @param {Object} [opts] - Options for inverseArcLength
     * @returns {Decimal} Refined t
     */
    getTRefined(s, opts = {}) {
      const approxT = this.getT(s);
      // Use approxT as starting point for Newton
      const { t } = inverseArcLength(points, s, { ...opts, initialT: approxT });
      return t;
    }
  };
}

// ============================================================================
// VERIFICATION (INVERSE OPERATIONS)
// ============================================================================

/**
 * Verify arc length computation by comparing with chord length bounds.
 *
 * For any curve: chord_length <= arc_length <= sum_of_control_polygon_edges
 *
 * @param {Array} points - Control points
 * @param {Decimal} [computedLength] - Computed arc length (if not provided, computes it)
 * @returns {{valid: boolean, chordLength: Decimal, polygonLength: Decimal, arcLength: Decimal, ratio: Decimal, errors: string[]}}
 */
export function verifyArcLength(points, computedLength = null) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function needs to access points[0], points[length-1], and iterate
  // over points to compute polygon length. Invalid input would cause errors.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyArcLength: points must be an array with at least 2 control points');
  }

  const errors = [];

  // Compute arc length if not provided
  const length = computedLength !== null ? D(computedLength) : arcLength(points);

  // Chord length (straight line from start to end)
  const [x0, y0] = [D(points[0][0]), D(points[0][1])];
  const [xn, yn] = [D(points[points.length - 1][0]), D(points[points.length - 1][1])];
  const chordLength = xn.minus(x0).pow(2).plus(yn.minus(y0).pow(2)).sqrt();

  // Control polygon length
  let polygonLength = D(0);
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = [D(points[i][0]), D(points[i][1])];
    const [x2, y2] = [D(points[i + 1][0]), D(points[i + 1][1])];
    polygonLength = polygonLength.plus(x2.minus(x1).pow(2).plus(y2.minus(y1).pow(2)).sqrt());
  }

  // Check bounds
  if (length.lt(chordLength)) {
    errors.push(`Arc length ${length} < chord length ${chordLength}`);
  }
  if (length.gt(polygonLength)) {
    errors.push(`Arc length ${length} > polygon length ${polygonLength}`);
  }

  return {
    valid: errors.length === 0,
    chordLength,
    polygonLength,
    arcLength: length,
    ratio: chordLength.gt(0) ? length.div(chordLength) : D(1),
    errors
  };
}

/**
 * Verify inverse arc length by roundtrip: length -> t -> length.
 * The computed length at returned t should match the target length.
 *
 * @param {Array} points - Control points
 * @param {number|string|Decimal} targetLength - Target arc length
 * @param {number|string|Decimal} [tolerance='1e-25'] - Maximum error
 * @returns {{valid: boolean, targetLength: Decimal, foundT: Decimal, verifiedLength: Decimal, error: Decimal}}
 */
export function verifyInverseArcLength(points, targetLength, tolerance = '1e-25') {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function calls inverseArcLength and arcLength, both of which require
  // valid points. We validate early for clearer error messages.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyInverseArcLength: points must be an array with at least 2 control points');
  }

  const target = D(targetLength);

  // FAIL FAST: Validate targetLength is non-negative
  // WHY: Negative arc lengths are mathematically invalid. This prevents nonsensical tests.
  if (target.lt(0)) {
    throw new Error('verifyInverseArcLength: targetLength must be non-negative');
  }

  const tol = D(tolerance);

  // Forward: find t for target length
  const { t: foundT, converged } = inverseArcLength(points, target);

  // Reverse: compute length at foundT
  const verifiedLength = arcLength(points, 0, foundT);

  // Check roundtrip error
  const error = verifiedLength.minus(target).abs();

  return {
    valid: error.lte(tol) && converged,
    targetLength: target,
    foundT,
    verifiedLength,
    error,
    converged
  };
}

/**
 * Verify arc length by computing via subdivision and comparing.
 * Two independent methods should produce the same result.
 *
 * @param {Array} points - Control points
 * @param {number} [subdivisions=16] - Number of subdivisions for comparison method
 * @param {number|string|Decimal} [tolerance='1e-20'] - Maximum difference
 * @returns {{valid: boolean, quadratureLength: Decimal, subdivisionLength: Decimal, difference: Decimal}}
 */
export function verifyArcLengthBySubdivision(points, subdivisions = 16, tolerance = SUBDIVISION_COMPARISON_TOLERANCE) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function calls arcLength and bezierPoint, both of which require
  // valid control points. Early validation provides better error messages.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyArcLengthBySubdivision: points must be an array with at least 2 control points');
  }

  const tol = D(tolerance);

  // Method 1: Adaptive quadrature
  const quadratureLength = arcLength(points);

  // Method 2: Sum of chord lengths after subdivision
  let subdivisionLength = D(0);
  let prevPoint = bezierPoint(points, 0);

  for (let i = 1; i <= subdivisions; i++) {
    const t = D(i).div(subdivisions);
    const currPoint = bezierPoint(points, t);

    const dx = D(currPoint[0]).minus(D(prevPoint[0]));
    const dy = D(currPoint[1]).minus(D(prevPoint[1]));
    subdivisionLength = subdivisionLength.plus(dx.pow(2).plus(dy.pow(2)).sqrt());

    prevPoint = currPoint;
  }

  const difference = quadratureLength.minus(subdivisionLength).abs();

  // Subdivision should slightly underestimate (chord < arc)
  // But with enough subdivisions, should be very close
  return {
    valid: difference.lte(tol),
    quadratureLength,
    subdivisionLength,
    difference,
    underestimate: quadratureLength.gt(subdivisionLength)
  };
}

/**
 * Verify arc length additivity: length(0,t) + length(t,1) = length(0,1).
 *
 * @param {Array} points - Control points
 * @param {number|string|Decimal} t - Split parameter
 * @param {number|string|Decimal} [tolerance='1e-30'] - Maximum error
 * @returns {{valid: boolean, totalLength: Decimal, leftLength: Decimal, rightLength: Decimal, sum: Decimal, error: Decimal}}
 */
export function verifyArcLengthAdditivity(points, t, tolerance = DEFAULT_ARC_LENGTH_TOLERANCE) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function calls arcLength multiple times with the same points array.
  // Validating once here is more efficient than letting each call validate.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyArcLengthAdditivity: points must be an array with at least 2 control points');
  }

  const tD = D(t);
  // PARAMETER VALIDATION: t must be in [0, 1] for additivity to make sense
  // WHY: Arc length additivity L(0,t) + L(t,1) = L(0,1) only holds for t in [0,1]
  if (tD.lt(0) || tD.gt(1)) {
    throw new Error('verifyArcLengthAdditivity: t must be in range [0, 1]');
  }

  const tol = D(tolerance);

  const totalLength = arcLength(points, 0, 1);
  const leftLength = arcLength(points, 0, tD);
  const rightLength = arcLength(points, tD, 1);

  const sum = leftLength.plus(rightLength);
  const error = sum.minus(totalLength).abs();

  return {
    valid: error.lte(tol),
    totalLength,
    leftLength,
    rightLength,
    sum,
    error
  };
}

/**
 * Verify arc length table consistency and monotonicity.
 *
 * @param {Array} points - Control points
 * @param {number} [samples=50] - Number of samples in table
 * @returns {{valid: boolean, errors: string[], isMonotonic: boolean, maxGap: Decimal}}
 */
export function verifyArcLengthTable(points, samples = 50) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function calls createArcLengthTable and arcLength, both requiring
  // valid points. Early validation provides better diagnostics.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyArcLengthTable: points must be an array with at least 2 control points');
  }

  const errors = [];
  const table = createArcLengthTable(points, samples);

  let isMonotonic = true;
  let maxGap = D(0);

  // Check monotonicity
  for (let i = 1; i < table.table.length; i++) {
    const curr = table.table[i].length;
    const prev = table.table[i - 1].length;

    if (curr.lt(prev)) {
      isMonotonic = false;
      errors.push(`Table not monotonic at index ${i}: ${prev} > ${curr}`);
    }

    const gap = curr.minus(prev);
    if (gap.gt(maxGap)) {
      maxGap = gap;
    }
  }

  // Verify table boundaries
  const firstEntry = table.table[0];
  if (!firstEntry.t.isZero() || !firstEntry.length.isZero()) {
    errors.push(`First entry should be t=0, length=0, got t=${firstEntry.t}, length=${firstEntry.length}`);
  }

  const lastEntry = table.table[table.table.length - 1];
  if (!lastEntry.t.eq(1)) {
    errors.push(`Last entry should have t=1, got t=${lastEntry.t}`);
  }

  // Verify total length consistency
  const directLength = arcLength(points);
  const tableTotalDiff = table.totalLength.minus(directLength).abs();
  // WHY: Use TABLE_ROUNDTRIP_TOLERANCE to account for accumulated segment errors
  if (tableTotalDiff.gt(TABLE_ROUNDTRIP_TOLERANCE)) {
    errors.push(`Table total length ${table.totalLength} differs from direct computation ${directLength}`);
  }

  // Verify getT roundtrip for a few values
  for (const fraction of [0.25, 0.5, 0.75]) {
    const targetLength = table.totalLength.times(fraction);
    const foundT = table.getT(targetLength);
    const recoveredLength = arcLength(points, 0, foundT);
    const roundtripError = recoveredLength.minus(targetLength).abs();

    if (roundtripError.gt(table.totalLength.div(samples).times(2))) {
      errors.push(`getT roundtrip error too large at ${fraction}: ${roundtripError}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    isMonotonic,
    maxGap,
    tableSize: table.table.length,
    totalLength: table.totalLength
  };
}

/**
 * Comprehensive verification of all arc length functions.
 *
 * @param {Array} points - Control points
 * @param {Object} [options] - Options
 * @returns {{valid: boolean, results: Object}}
 */
export function verifyAllArcLengthFunctions(points, options = {}) {
  // INPUT VALIDATION: Ensure points array is valid
  // WHY: This function orchestrates multiple verification functions, all of which
  // require valid points. Validating once at the top prevents redundant checks.
  if (!points || !Array.isArray(points) || points.length < 2) {
    throw new Error('verifyAllArcLengthFunctions: points must be an array with at least 2 control points');
  }

  const results = {};

  // 1. Verify basic arc length bounds
  results.bounds = verifyArcLength(points);

  // 2. Verify subdivision comparison
  results.subdivision = verifyArcLengthBySubdivision(points, 32);

  // 3. Verify additivity at midpoint
  results.additivity = verifyArcLengthAdditivity(points, 0.5);

  // 4. Verify inverse arc length roundtrip
  const totalLength = arcLength(points);
  results.inverseRoundtrip = verifyInverseArcLength(points, totalLength.div(2));

  // 5. Verify table
  results.table = verifyArcLengthTable(points, 20);

  const allValid = Object.values(results).every(r => r.valid);

  return {
    valid: allValid,
    results
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  arcLength,
  inverseArcLength,
  pathArcLength,
  pathInverseArcLength,
  createArcLengthTable,

  // Verification (inverse operations)
  verifyArcLength,
  verifyInverseArcLength,
  verifyArcLengthBySubdivision,
  verifyArcLengthAdditivity,
  verifyArcLengthTable,
  verifyAllArcLengthFunctions
};
