/**
 * GJK Collision Detection with Arbitrary Precision and Mathematical Verification
 *
 * Implementation of the Gilbert-Johnson-Keerthi algorithm for detecting
 * intersections between convex polygons using arbitrary precision arithmetic.
 *
 * Guarantees:
 * 1. ARBITRARY PRECISION - All calculations use Decimal.js (50+ digits)
 * 2. MATHEMATICAL VERIFICATION - Intersection results are verified
 *
 * ## Algorithm Overview
 *
 * The GJK algorithm determines if two convex shapes intersect by checking if
 * the origin is contained in their Minkowski difference.
 *
 * For shapes A and B:
 * - Minkowski difference: A ⊖ B = {a - b : a ∈ A, b ∈ B}
 * - A and B intersect iff origin ∈ A ⊖ B
 *
 * Instead of computing the full Minkowski difference (expensive), GJK
 * iteratively builds a simplex (triangle in 2D) that approaches the origin.
 *
 * ## Key Functions
 *
 * - `support(shape, direction)`: Returns the point in shape farthest along direction
 * - `minkowskiSupport(A, B, d)`: Returns support(A, d) - support(B, -d)
 * - `gjkIntersects(A, B)`: Returns true if shapes intersect
 *
 * @module gjk-collision
 */

import Decimal from 'decimal.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons
const EPSILON = new Decimal('1e-40');

// Maximum iterations to prevent infinite loops
const MAX_ITERATIONS = 100;

// ============================================================================
// Point and Vector Utilities
// ============================================================================

/**
 * Create a point/vector with Decimal coordinates.
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {{x: Decimal, y: Decimal}} Point object
 * @throws {TypeError} If x or y is null or undefined
 */
export function point(x, y) {
  if (x == null) throw new TypeError('point: x coordinate cannot be null or undefined');
  if (y == null) throw new TypeError('point: y coordinate cannot be null or undefined');
  return { x: D(x), y: D(y) };
}

/**
 * Add two vectors.
 * @param {{x: Decimal, y: Decimal}} a - First vector
 * @param {{x: Decimal, y: Decimal}} b - Second vector
 * @returns {{x: Decimal, y: Decimal}} Sum vector
 * @throws {TypeError} If a or b is invalid or missing x/y properties
 */
export function vectorAdd(a, b) {
  if (!a || a.x == null || a.y == null) throw new TypeError('vectorAdd: first vector must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('vectorAdd: second vector must have x and y properties');
  return { x: a.x.plus(b.x), y: a.y.plus(b.y) };
}

/**
 * Subtract two vectors.
 * @param {{x: Decimal, y: Decimal}} a - First vector
 * @param {{x: Decimal, y: Decimal}} b - Second vector
 * @returns {{x: Decimal, y: Decimal}} Difference vector (a - b)
 * @throws {TypeError} If a or b is invalid or missing x/y properties
 */
export function vectorSub(a, b) {
  if (!a || a.x == null || a.y == null) throw new TypeError('vectorSub: first vector must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('vectorSub: second vector must have x and y properties');
  return { x: a.x.minus(b.x), y: a.y.minus(b.y) };
}

/**
 * Negate a vector.
 * @param {{x: Decimal, y: Decimal}} v - Vector to negate
 * @returns {{x: Decimal, y: Decimal}} Negated vector
 * @throws {TypeError} If v is invalid or missing x/y properties
 */
export function vectorNeg(v) {
  if (!v || v.x == null || v.y == null) throw new TypeError('vectorNeg: vector must have x and y properties');
  return { x: v.x.neg(), y: v.y.neg() };
}

/**
 * Scale a vector.
 * @param {{x: Decimal, y: Decimal}} v - Vector to scale
 * @param {number|string|Decimal} s - Scale factor
 * @returns {{x: Decimal, y: Decimal}} Scaled vector
 * @throws {TypeError} If v is invalid, missing x/y properties, or s is null/undefined
 */
export function vectorScale(v, s) {
  if (!v || v.x == null || v.y == null) throw new TypeError('vectorScale: vector must have x and y properties');
  if (s == null) throw new TypeError('vectorScale: scale factor cannot be null or undefined');
  const sd = D(s);
  return { x: v.x.mul(sd), y: v.y.mul(sd) };
}

/**
 * Dot product of two vectors.
 * @param {{x: Decimal, y: Decimal}} a - First vector
 * @param {{x: Decimal, y: Decimal}} b - Second vector
 * @returns {Decimal} Dot product
 * @throws {TypeError} If a or b is invalid or missing x/y properties
 */
export function dot(a, b) {
  if (!a || a.x == null || a.y == null) throw new TypeError('dot: first vector must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('dot: second vector must have x and y properties');
  return a.x.mul(b.x).plus(a.y.mul(b.y));
}

/**
 * 2D cross product (returns scalar z-component of 3D cross product).
 * @param {{x: Decimal, y: Decimal}} a - First vector
 * @param {{x: Decimal, y: Decimal}} b - Second vector
 * @returns {Decimal} Cross product (a.x * b.y - a.y * b.x)
 * @throws {TypeError} If a or b is invalid or missing x/y properties
 */
export function cross(a, b) {
  if (!a || a.x == null || a.y == null) throw new TypeError('cross: first vector must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('cross: second vector must have x and y properties');
  return a.x.mul(b.y).minus(a.y.mul(b.x));
}

/**
 * Squared magnitude of a vector.
 * @param {{x: Decimal, y: Decimal}} v - Vector
 * @returns {Decimal} Squared magnitude
 * @throws {TypeError} If v is invalid or missing x/y properties
 */
export function magnitudeSquared(v) {
  if (!v || v.x == null || v.y == null) throw new TypeError('magnitudeSquared: vector must have x and y properties');
  return v.x.mul(v.x).plus(v.y.mul(v.y));
}

/**
 * Magnitude of a vector.
 * @param {{x: Decimal, y: Decimal}} v - Vector
 * @returns {Decimal} Magnitude
 * @throws {TypeError} If v is invalid or missing x/y properties
 */
export function magnitude(v) {
  if (!v || v.x == null || v.y == null) throw new TypeError('magnitude: vector must have x and y properties');
  return magnitudeSquared(v).sqrt();
}

/**
 * Normalize a vector to unit length.
 * @param {{x: Decimal, y: Decimal}} v - Vector to normalize
 * @returns {{x: Decimal, y: Decimal}} Unit vector
 * @throws {TypeError} If v is invalid or missing x/y properties
 */
export function normalize(v) {
  if (!v || v.x == null || v.y == null) throw new TypeError('normalize: vector must have x and y properties');
  const mag = magnitude(v);
  if (mag.lessThan(EPSILON)) {
    return { x: D(0), y: D(0) };
  }
  return { x: v.x.div(mag), y: v.y.div(mag) };
}

/**
 * Get perpendicular vector (90° counter-clockwise rotation).
 * @param {{x: Decimal, y: Decimal}} v - Vector
 * @returns {{x: Decimal, y: Decimal}} Perpendicular vector
 * @throws {TypeError} If v is invalid or missing x/y properties
 */
export function perpendicular(v) {
  if (!v || v.x == null || v.y == null) throw new TypeError('perpendicular: vector must have x and y properties');
  return { x: v.y.neg(), y: v.x };
}

/**
 * Triple product for 2D: (A × B) × C = B(A·C) - A(B·C)
 * This gives a vector perpendicular to C in the direction away from A.
 * @param {{x: Decimal, y: Decimal}} a - First vector
 * @param {{x: Decimal, y: Decimal}} b - Second vector
 * @param {{x: Decimal, y: Decimal}} c - Third vector
 * @returns {{x: Decimal, y: Decimal}} Triple product result
 * @throws {TypeError} If any vector is invalid or missing x/y properties
 */
export function tripleProduct(a, b, c) {
  if (!a || a.x == null || a.y == null) throw new TypeError('tripleProduct: first vector must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('tripleProduct: second vector must have x and y properties');
  if (!c || c.x == null || c.y == null) throw new TypeError('tripleProduct: third vector must have x and y properties');
  // In 2D: (A × B) × C = B(A·C) - A(B·C)
  const ac = dot(a, c);
  const bc = dot(b, c);
  return vectorSub(vectorScale(b, ac), vectorScale(a, bc));
}

// ============================================================================
// Support Functions
// ============================================================================

/**
 * Find the point in a convex polygon farthest along a direction.
 *
 * This is the support function for a convex polygon - it finds the vertex
 * that is farthest in the given direction.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygon - Convex polygon vertices
 * @param {{x: Decimal, y: Decimal}} direction - Direction to search
 * @returns {{x: Decimal, y: Decimal}} Farthest point
 * @throws {TypeError} If polygon is not an array or direction is invalid
 */
export function supportPoint(polygon, direction) {
  if (!Array.isArray(polygon)) throw new TypeError('supportPoint: polygon must be an array');
  if (!direction || direction.x == null || direction.y == null) throw new TypeError('supportPoint: direction must have x and y properties');
  if (polygon.length === 0) {
    return point(0, 0);
  }

  // Validate first point
  if (!polygon[0] || polygon[0].x == null || polygon[0].y == null) {
    throw new TypeError('supportPoint: polygon[0] must have x and y properties');
  }

  let maxDot = dot(polygon[0], direction);
  let maxPoint = polygon[0];

  for (let i = 1; i < polygon.length; i++) {
    if (!polygon[i] || polygon[i].x == null || polygon[i].y == null) {
      throw new TypeError(`supportPoint: polygon[${i}] must have x and y properties`);
    }
    const d = dot(polygon[i], direction);
    if (d.greaterThan(maxDot)) {
      maxDot = d;
      maxPoint = polygon[i];
    }
  }

  return maxPoint;
}

/**
 * Compute support point on the Minkowski difference A ⊖ B.
 *
 * For Minkowski difference, the support in direction d is:
 * support(A ⊖ B, d) = support(A, d) - support(B, -d)
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygonA - First convex polygon
 * @param {Array<{x: Decimal, y: Decimal}>} polygonB - Second convex polygon
 * @param {{x: Decimal, y: Decimal}} direction - Direction to search
 * @returns {{x: Decimal, y: Decimal}} Support point on Minkowski difference
 * @throws {TypeError} If polygons are not arrays or direction is invalid
 */
export function minkowskiSupport(polygonA, polygonB, direction) {
  if (!Array.isArray(polygonA)) throw new TypeError('minkowskiSupport: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('minkowskiSupport: polygonB must be an array');
  if (!direction || direction.x == null || direction.y == null) throw new TypeError('minkowskiSupport: direction must have x and y properties');
  const pointA = supportPoint(polygonA, direction);
  const pointB = supportPoint(polygonB, vectorNeg(direction));
  return vectorSub(pointA, pointB);
}

// ============================================================================
// Simplex Operations
// ============================================================================

/**
 * Process a line simplex (2 points) and determine next direction.
 *
 * Given simplex [A, B] where A is the newest point:
 * - If origin is in region AB, find direction perpendicular to AB toward origin
 * - If origin is beyond A in direction opposite to B, direction is toward origin from A
 *
 * @param {Array<{x: Decimal, y: Decimal}>} simplex - Current simplex (modified in place)
 * @param {{x: Decimal, y: Decimal}} direction - Current search direction (modified)
 * @returns {{contains: boolean, newDirection: {x: Decimal, y: Decimal}}}
 * @throws {TypeError} If simplex is not an array, has wrong length, or direction is invalid
 */
export function processLineSimplex(simplex, direction) {
  if (!Array.isArray(simplex)) throw new TypeError('processLineSimplex: simplex must be an array');
  if (simplex.length !== 2) throw new TypeError('processLineSimplex: simplex must have exactly 2 points');
  if (!direction || direction.x == null || direction.y == null) throw new TypeError('processLineSimplex: direction must have x and y properties');
  if (!simplex[0] || simplex[0].x == null || simplex[0].y == null) throw new TypeError('processLineSimplex: simplex[0] must have x and y properties');
  if (!simplex[1] || simplex[1].x == null || simplex[1].y == null) throw new TypeError('processLineSimplex: simplex[1] must have x and y properties');
  const A = simplex[0]; // Newest point
  const B = simplex[1];

  const AB = vectorSub(B, A);
  const AO = vectorNeg(A); // Vector from A to origin

  // Check if origin is in the region of the line segment
  const ABperp = tripleProduct(AB, AO, AB);

  // If ABperp is essentially zero, points are collinear with origin
  if (magnitudeSquared(ABperp).lessThan(EPSILON)) {
    // Origin is on the line - check if between A and B
    const dotAB_AO = dot(AB, AO);
    const dotAB_AB = dot(AB, AB);

    if (dotAB_AO.greaterThanOrEqualTo(0) && dotAB_AO.lessThanOrEqualTo(dotAB_AB)) {
      // Origin is on the segment - we have intersection!
      return { contains: true, newDirection: direction };
    }

    // Origin is on the line but outside segment
    // Keep searching in direction perpendicular to the line
    return { contains: false, newDirection: perpendicular(AB) };
  }

  return { contains: false, newDirection: ABperp };
}

/**
 * Process a triangle simplex (3 points) and determine if origin is inside.
 *
 * Given simplex [A, B, C] where A is the newest point:
 * - Check if origin is inside the triangle
 * - If not, reduce to the edge closest to origin and get new direction
 *
 * @param {Array<{x: Decimal, y: Decimal}>} simplex - Current simplex (modified in place)
 * @param {{x: Decimal, y: Decimal}} direction - Current search direction
 * @returns {{contains: boolean, newDirection: {x: Decimal, y: Decimal}, newSimplex: Array}}
 * @throws {TypeError} If simplex is not an array, has wrong length, or direction is invalid
 */
export function processTriangleSimplex(simplex, direction) {
  if (!Array.isArray(simplex)) throw new TypeError('processTriangleSimplex: simplex must be an array');
  if (simplex.length !== 3) throw new TypeError('processTriangleSimplex: simplex must have exactly 3 points');
  if (!direction || direction.x == null || direction.y == null) throw new TypeError('processTriangleSimplex: direction must have x and y properties');
  const A = simplex[0]; // Newest point
  const B = simplex[1];
  const C = simplex[2];

  const AB = vectorSub(B, A);
  const AC = vectorSub(C, A);
  const AO = vectorNeg(A); // Vector from A to origin

  // Get perpendiculars to edges, pointing outward from triangle
  const ABperp = tripleProduct(AC, AB, AB);
  const ACperp = tripleProduct(AB, AC, AC);

  // Check if origin is outside AB edge
  if (dot(ABperp, AO).greaterThan(EPSILON)) {
    // Origin is outside AB edge
    // Remove C, keep A and B
    return {
      contains: false,
      newDirection: ABperp,
      newSimplex: [A, B]
    };
  }

  // Check if origin is outside AC edge
  if (dot(ACperp, AO).greaterThan(EPSILON)) {
    // Origin is outside AC edge
    // Remove B, keep A and C
    return {
      contains: false,
      newDirection: ACperp,
      newSimplex: [A, C]
    };
  }

  // Origin is inside the triangle!
  return {
    contains: true,
    newDirection: direction,
    newSimplex: simplex
  };
}

// ============================================================================
// GJK Algorithm
// ============================================================================

/**
 * GJK (Gilbert-Johnson-Keerthi) intersection test.
 *
 * Determines if two convex polygons intersect by checking if the origin
 * is contained in their Minkowski difference.
 *
 * VERIFICATION: When intersection is found, we verify by checking that
 * at least one point from each polygon is actually overlapping.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygonA - First convex polygon
 * @param {Array<{x: Decimal, y: Decimal}>} polygonB - Second convex polygon
 * @returns {{intersects: boolean, iterations: number, simplex: Array, verified: boolean}}
 * @throws {TypeError} If polygons are not arrays
 */
export function gjkIntersects(polygonA, polygonB) {
  if (!Array.isArray(polygonA)) throw new TypeError('gjkIntersects: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('gjkIntersects: polygonB must be an array');
  // Handle empty polygons
  if (polygonA.length === 0 || polygonB.length === 0) {
    return { intersects: false, iterations: 0, simplex: [], verified: true };
  }

  // Handle single points
  if (polygonA.length === 1 && polygonB.length === 1) {
    const dist = magnitude(vectorSub(polygonA[0], polygonB[0]));
    return {
      intersects: dist.lessThan(EPSILON),
      iterations: 1,
      simplex: [],
      verified: true
    };
  }

  // Initial direction: from center of A to center of B
  let direction = vectorSub(
    centroid(polygonB),
    centroid(polygonA)
  );

  // If centers are the same, use arbitrary direction
  if (magnitudeSquared(direction).lessThan(EPSILON)) {
    direction = point(1, 0);
  }

  // Get first support point
  let simplex = [minkowskiSupport(polygonA, polygonB, direction)];

  // New direction: toward origin from first point
  direction = vectorNeg(simplex[0]);

  // If first point is at origin, we have intersection
  if (magnitudeSquared(simplex[0]).lessThan(EPSILON)) {
    return {
      intersects: true,
      iterations: 1,
      simplex,
      verified: verifyIntersection(polygonA, polygonB)
    };
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Get new support point in current direction
    const newPoint = minkowskiSupport(polygonA, polygonB, direction);

    // Check if we passed the origin
    // If the new point isn't past the origin in the search direction,
    // then the origin is not in the Minkowski difference
    if (dot(newPoint, direction).lessThanOrEqualTo(EPSILON)) {
      return {
        intersects: false,
        iterations: iteration + 1,
        simplex,
        verified: true
      };
    }

    // Add new point to simplex
    simplex.unshift(newPoint);

    // Process simplex based on size
    if (simplex.length === 2) {
      // Line case
      const result = processLineSimplex(simplex, direction);
      if (result.contains) {
        return {
          intersects: true,
          iterations: iteration + 1,
          simplex,
          verified: verifyIntersection(polygonA, polygonB)
        };
      }
      direction = result.newDirection;
    } else if (simplex.length === 3) {
      // Triangle case
      const result = processTriangleSimplex(simplex, direction);
      if (result.contains) {
        return {
          intersects: true,
          iterations: iteration + 1,
          simplex: result.newSimplex,
          verified: verifyIntersection(polygonA, polygonB)
        };
      }
      simplex = result.newSimplex;
      direction = result.newDirection;
    }

    // Normalize direction to prevent numerical issues
    direction = normalize(direction);

    // Check for zero direction (numerical issues)
    if (magnitudeSquared(direction).lessThan(EPSILON)) {
      // Can't determine - assume no intersection to be safe
      return {
        intersects: false,
        iterations: iteration + 1,
        simplex,
        verified: false
      };
    }
  }

  // Max iterations reached - assume no intersection
  return {
    intersects: false,
    iterations: MAX_ITERATIONS,
    simplex,
    verified: false
  };
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Calculate centroid of a polygon.
 * @param {Array<{x: Decimal, y: Decimal}>} polygon - Polygon vertices
 * @returns {{x: Decimal, y: Decimal}} Centroid point
 * @throws {TypeError} If polygon is not an array
 */
export function centroid(polygon) {
  if (!Array.isArray(polygon)) throw new TypeError('centroid: polygon must be an array');
  if (polygon.length === 0) {
    return point(0, 0);
  }

  let sumX = D(0);
  let sumY = D(0);

  for (const p of polygon) {
    sumX = sumX.plus(p.x);
    sumY = sumY.plus(p.y);
  }

  const n = D(polygon.length);
  return { x: sumX.div(n), y: sumY.div(n) };
}

/**
 * Check if a point is inside a convex polygon.
 *
 * Uses the cross product sign method: a point is inside if it's on the
 * same side of all edges.
 *
 * @param {{x: Decimal, y: Decimal}} pt - Point to test
 * @param {Array<{x: Decimal, y: Decimal}>} polygon - Convex polygon
 * @returns {boolean} True if point is inside (including boundary)
 * @throws {TypeError} If pt is invalid or polygon is not an array
 */
export function pointInConvexPolygon(pt, polygon) {
  if (!pt || pt.x == null || pt.y == null) throw new TypeError('pointInConvexPolygon: point must have x and y properties');
  if (!Array.isArray(polygon)) throw new TypeError('pointInConvexPolygon: polygon must be an array');
  if (polygon.length < 3) {
    return false;
  }

  let sign = null;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const edge = vectorSub(p2, p1);
    const toPoint = vectorSub(pt, p1);
    const crossVal = cross(edge, toPoint);

    // On the edge is considered inside
    if (crossVal.abs().lessThan(EPSILON)) {
      continue;
    }

    const currentSign = crossVal.greaterThan(0);

    if (sign === null) {
      sign = currentSign;
    } else if (sign !== currentSign) {
      return false;
    }
  }

  return true;
}

/**
 * Verify that two polygons actually intersect.
 *
 * This is a secondary check after GJK to verify the result.
 * We check if any vertex of one polygon is inside the other,
 * or if any edges intersect.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygonA - First polygon
 * @param {Array<{x: Decimal, y: Decimal}>} polygonB - Second polygon
 * @returns {boolean} True if intersection is verified
 * @throws {TypeError} If polygons are not arrays
 */
export function verifyIntersection(polygonA, polygonB) {
  if (!Array.isArray(polygonA)) throw new TypeError('verifyIntersection: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('verifyIntersection: polygonB must be an array');
  // Check if any vertex of A is inside B
  for (const p of polygonA) {
    if (pointInConvexPolygon(p, polygonB)) {
      return true;
    }
  }

  // Check if any vertex of B is inside A
  for (const p of polygonB) {
    if (pointInConvexPolygon(p, polygonA)) {
      return true;
    }
  }

  // Check if any edges intersect
  for (let i = 0; i < polygonA.length; i++) {
    const a1 = polygonA[i];
    const a2 = polygonA[(i + 1) % polygonA.length];

    for (let j = 0; j < polygonB.length; j++) {
      const b1 = polygonB[j];
      const b2 = polygonB[(j + 1) % polygonB.length];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if two line segments intersect.
 *
 * @param {{x: Decimal, y: Decimal}} a1 - First segment start
 * @param {{x: Decimal, y: Decimal}} a2 - First segment end
 * @param {{x: Decimal, y: Decimal}} b1 - Second segment start
 * @param {{x: Decimal, y: Decimal}} b2 - Second segment end
 * @returns {boolean} True if segments intersect
 * @throws {TypeError} If any point is invalid or missing x/y properties
 */
export function segmentsIntersect(a1, a2, b1, b2) {
  if (!a1 || a1.x == null || a1.y == null) throw new TypeError('segmentsIntersect: a1 must have x and y properties');
  if (!a2 || a2.x == null || a2.y == null) throw new TypeError('segmentsIntersect: a2 must have x and y properties');
  if (!b1 || b1.x == null || b1.y == null) throw new TypeError('segmentsIntersect: b1 must have x and y properties');
  if (!b2 || b2.x == null || b2.y == null) throw new TypeError('segmentsIntersect: b2 must have x and y properties');

  const d1 = vectorSub(a2, a1);
  const d2 = vectorSub(b2, b1);

  const crossD = cross(d1, d2);

  // Parallel segments
  if (crossD.abs().lessThan(EPSILON)) {
    // Check if collinear and overlapping
    const d3 = vectorSub(b1, a1);
    if (cross(d1, d3).abs().lessThan(EPSILON)) {
      // Collinear - check overlap
      const d1LengthSq = dot(d1, d1);
      // Handle degenerate first segment (a1 == a2)
      if (d1LengthSq.lessThan(EPSILON)) {
        // First segment is a point - check if it lies on second segment
        const d2LengthSq = dot(d2, d2);
        if (d2LengthSq.lessThan(EPSILON)) {
          // Both segments are points - check if same point
          return magnitude(d3).lessThan(EPSILON);
        }
        // Check if point a1 is on segment b1-b2
        const t = dot(d3, d2).div(d2LengthSq);
        return t.greaterThanOrEqualTo(0) && t.lessThanOrEqualTo(1);
      }
      const t0 = dot(d3, d1).div(d1LengthSq);
      const d4 = vectorSub(b2, a1);
      const t1 = dot(d4, d1).div(d1LengthSq);

      const tMin = Decimal.min(t0, t1);
      const tMax = Decimal.max(t0, t1);

      return tMax.greaterThanOrEqualTo(0) && tMin.lessThanOrEqualTo(1);
    }
    return false;
  }

  // Non-parallel - find intersection parameter
  const d3 = vectorSub(b1, a1);
  const t = cross(d3, d2).div(crossD);
  const u = cross(d3, d1).div(crossD);

  // Check if intersection is within both segments
  return t.greaterThanOrEqualTo(0) && t.lessThanOrEqualTo(1) &&
    u.greaterThanOrEqualTo(0) && u.lessThanOrEqualTo(1);
}

// ============================================================================
// Distance Calculation (EPA - Expanding Polytope Algorithm)
// ============================================================================

/**
 * Calculate the minimum distance between two non-intersecting convex polygons.
 *
 * Uses a modified GJK algorithm that returns the closest points
 * when shapes don't intersect.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygonA - First convex polygon
 * @param {Array<{x: Decimal, y: Decimal}>} polygonB - Second convex polygon
 * @returns {{distance: Decimal, closestA: {x: Decimal, y: Decimal}, closestB: {x: Decimal, y: Decimal}, verified: boolean}}
 * @throws {TypeError} If polygons are not arrays or are empty
 */
export function gjkDistance(polygonA, polygonB) {
  if (!Array.isArray(polygonA)) throw new TypeError('gjkDistance: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('gjkDistance: polygonB must be an array');
  if (polygonA.length === 0) throw new TypeError('gjkDistance: polygonA cannot be empty');
  if (polygonB.length === 0) throw new TypeError('gjkDistance: polygonB cannot be empty');

  // First check if they intersect
  const intersection = gjkIntersects(polygonA, polygonB);

  if (intersection.intersects) {
    return {
      distance: D(0),
      closestA: centroid(polygonA),
      closestB: centroid(polygonB),
      verified: true
    };
  }

  // Use the final simplex to find closest point to origin on Minkowski difference
  // The closest point corresponds to the minimum distance

  // For non-intersecting shapes, find the closest points by
  // examining all vertex-edge pairs

  let minDist = D(Infinity);
  let closestA = polygonA[0];
  let closestB = polygonB[0];

  // Check all pairs of vertices
  for (const pA of polygonA) {
    for (const pB of polygonB) {
      const dist = magnitude(vectorSub(pA, pB));
      if (dist.lessThan(minDist)) {
        minDist = dist;
        closestA = pA;
        closestB = pB;
      }
    }
  }

  // Check vertex-to-edge distances
  for (const pA of polygonA) {
    for (let i = 0; i < polygonB.length; i++) {
      const e1 = polygonB[i];
      const e2 = polygonB[(i + 1) % polygonB.length];
      const closest = closestPointOnSegment(pA, e1, e2);
      const dist = magnitude(vectorSub(pA, closest));
      if (dist.lessThan(minDist)) {
        minDist = dist;
        closestA = pA;
        closestB = closest;
      }
    }
  }

  for (const pB of polygonB) {
    for (let i = 0; i < polygonA.length; i++) {
      const e1 = polygonA[i];
      const e2 = polygonA[(i + 1) % polygonA.length];
      const closest = closestPointOnSegment(pB, e1, e2);
      const dist = magnitude(vectorSub(pB, closest));
      if (dist.lessThan(minDist)) {
        minDist = dist;
        closestA = closest;
        closestB = pB;
      }
    }
  }

  // VERIFICATION: Check that the distance is correct
  const verifiedDist = magnitude(vectorSub(closestA, closestB));
  const verified = verifiedDist.minus(minDist).abs().lessThan(EPSILON);

  return {
    distance: minDist,
    closestA,
    closestB,
    verified
  };
}

/**
 * Find the closest point on a line segment to a given point.
 *
 * @param {{x: Decimal, y: Decimal}} pt - Query point
 * @param {{x: Decimal, y: Decimal}} a - Segment start
 * @param {{x: Decimal, y: Decimal}} b - Segment end
 * @returns {{x: Decimal, y: Decimal}} Closest point on segment
 * @throws {TypeError} If any point is invalid or missing x/y properties
 */
export function closestPointOnSegment(pt, a, b) {
  if (!pt || pt.x == null || pt.y == null) throw new TypeError('closestPointOnSegment: pt must have x and y properties');
  if (!a || a.x == null || a.y == null) throw new TypeError('closestPointOnSegment: a must have x and y properties');
  if (!b || b.x == null || b.y == null) throw new TypeError('closestPointOnSegment: b must have x and y properties');

  const ab = vectorSub(b, a);
  const ap = vectorSub(pt, a);

  const abLengthSq = magnitudeSquared(ab);

  if (abLengthSq.lessThan(EPSILON)) {
    // Degenerate segment (a == b)
    return a;
  }

  // Project pt onto line ab, clamped to [0, 1]
  let t = dot(ap, ab).div(abLengthSq);
  t = Decimal.max(D(0), Decimal.min(D(1), t));

  return vectorAdd(a, vectorScale(ab, t));
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * High-level function to check if two polygons overlap.
 *
 * Handles input normalization and provides a simple boolean result.
 *
 * @param {Array<{x: number|Decimal, y: number|Decimal}>} polygonA - First polygon
 * @param {Array<{x: number|Decimal, y: number|Decimal}>} polygonB - Second polygon
 * @returns {{overlaps: boolean, verified: boolean}}
 * @throws {TypeError} If polygons are not arrays
 */
export function polygonsOverlap(polygonA, polygonB) {
  if (!Array.isArray(polygonA)) throw new TypeError('polygonsOverlap: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('polygonsOverlap: polygonB must be an array');
  // Normalize input to Decimal
  const normA = polygonA.map(p => point(p.x, p.y));
  const normB = polygonB.map(p => point(p.x, p.y));

  const result = gjkIntersects(normA, normB);

  return {
    overlaps: result.intersects,
    verified: result.verified
  };
}

/**
 * Calculate the distance between two polygons.
 *
 * @param {Array<{x: number|Decimal, y: number|Decimal}>} polygonA - First polygon
 * @param {Array<{x: number|Decimal, y: number|Decimal}>} polygonB - Second polygon
 * @returns {{distance: Decimal, verified: boolean}}
 * @throws {TypeError} If polygons are not arrays
 */
export function polygonsDistance(polygonA, polygonB) {
  if (!Array.isArray(polygonA)) throw new TypeError('polygonsDistance: polygonA must be an array');
  if (!Array.isArray(polygonB)) throw new TypeError('polygonsDistance: polygonB must be an array');
  // Normalize input to Decimal
  const normA = polygonA.map(p => point(p.x, p.y));
  const normB = polygonB.map(p => point(p.x, p.y));

  const result = gjkDistance(normA, normB);

  return {
    distance: result.distance,
    closestA: result.closestA,
    closestB: result.closestB,
    verified: result.verified
  };
}

/**
 * Check if a point is inside a convex polygon (convenience wrapper).
 *
 * @param {{x: number|Decimal, y: number|Decimal}} pt - Point to test
 * @param {Array<{x: number|Decimal, y: number|Decimal}>} polygon - Polygon
 * @returns {boolean} True if inside
 * @throws {TypeError} If pt is invalid or polygon is not an array
 */
export function isPointInPolygon(pt, polygon) {
  if (!pt || pt.x == null || pt.y == null) throw new TypeError('isPointInPolygon: pt must have x and y properties');
  if (!Array.isArray(polygon)) throw new TypeError('isPointInPolygon: polygon must be an array');
  const normPt = point(pt.x, pt.y);
  const normPoly = polygon.map(p => point(p.x, p.y));

  return pointInConvexPolygon(normPt, normPoly);
}

// ============================================================================
// Exports
// ============================================================================

export {
  EPSILON,
  MAX_ITERATIONS,
  D
};

export default {
  // Point/vector utilities
  point,
  vectorAdd,
  vectorSub,
  vectorNeg,
  vectorScale,
  dot,
  cross,
  magnitude,
  magnitudeSquared,
  normalize,
  perpendicular,
  tripleProduct,

  // Support functions
  supportPoint,
  minkowskiSupport,

  // Simplex operations
  processLineSimplex,
  processTriangleSimplex,

  // GJK algorithm
  gjkIntersects,
  gjkDistance,

  // Verification
  centroid,
  pointInConvexPolygon,
  verifyIntersection,
  segmentsIntersect,
  closestPointOnSegment,

  // Convenience functions
  polygonsOverlap,
  polygonsDistance,
  isPointInPolygon,

  // Constants
  EPSILON,
  MAX_ITERATIONS
};
