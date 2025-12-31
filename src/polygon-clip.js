/**
 * Polygon Boolean Operations with Arbitrary Precision
 *
 * A comprehensive library for 2D polygon operations using arbitrary-precision
 * arithmetic via Decimal.js. Eliminates floating-point errors in geometric
 * computations, making it suitable for CAD, GIS, and other applications
 * requiring exact geometric calculations.
 *
 * ## Key Algorithms Implemented
 *
 * ### Sutherland-Hodgman Clipping
 * Classic O(n) algorithm for clipping a polygon against a convex clipping
 * window. Processes the subject polygon against each edge of the clipping
 * polygon sequentially, outputting vertices that lie inside the half-plane
 * defined by each edge.
 *
 * Reference: Sutherland, I. E., & Hodgman, G. W. (1974). "Reentrant polygon
 * clipping." Communications of the ACM, 17(1), 32-42.
 *
 * ### Graham Scan (Convex Hull)
 * Efficient O(n log n) algorithm for computing the convex hull of a point set.
 * Sorts points by polar angle from a pivot (lowest point), then uses a stack
 * to maintain hull vertices, removing points that create right turns.
 *
 * Reference: Graham, R. L. (1972). "An efficient algorithm for determining
 * the convex hull of a finite planar set." Information Processing Letters, 1(4).
 *
 * ### Winding Number (Point in Polygon)
 * Robust point-in-polygon test using winding number algorithm. Counts how many
 * times the polygon winds around the test point by tracking upward and downward
 * edge crossings of a horizontal ray cast from the point.
 *
 * ### Shoelace Formula (Polygon Area)
 * Also known as surveyor's formula or Gauss's area formula. Computes signed
 * polygon area in O(n) time using only vertex coordinates. Derived from
 * Green's theorem applied to the polygon boundary.
 *
 * ### Boolean Operations
 * Simplified polygon intersection, union, and difference operations. Uses
 * point collection and convex hull for general polygons. For exact results
 * with complex concave polygons, consider full implementations like:
 * - Greiner-Hormann clipping
 * - Martinez-Rueda-Feito algorithm
 * - Vatti clipping algorithm
 *
 * **Important Limitations:**
 * - Self-intersecting polygons are NOT supported and may produce incorrect results
 * - All polygons are assumed to be simple (non-self-intersecting)
 * - Point-in-polygon tests use winding number (unsuitable for self-intersecting polygons)
 *
 * ## Usage Examples
 *
 * @example
 * // Create points with arbitrary precision
 * import { point, polygonArea, polygonIntersection } from './polygon-clip.js';
 *
 * const square = [
 *   point('0', '0'),
 *   point('10', '0'),
 *   point('10', '10'),
 *   point('0', '10')
 * ];
 *
 * // Compute area (returns Decimal with value 100)
 * const area = polygonArea(square);
 *
 * @example
 * // Boolean intersection
 * const square1 = [point(0,0), point(2,0), point(2,2), point(0,2)];
 * const square2 = [point(1,1), point(3,1), point(3,3), point(1,3)];
 * const intersection = polygonIntersection(square1, square2);
 * // Returns [point(1,1), point(2,1), point(2,2), point(1,2)]
 *
 * @example
 * // Convex hull of point cloud
 * const points = [point(0,0), point(2,1), point(1,2), point(1,1)];
 * const hull = convexHull(points);
 * // Returns vertices of minimal convex polygon containing all points
 *
 * ## Precision Configuration
 *
 * This module sets Decimal.js precision to 80 decimal places and uses an
 * EPSILON threshold of 1e-40 for near-zero comparisons. These can be
 * adjusted based on application requirements.
 *
 * ## Coordinate System
 *
 * - Counter-clockwise (CCW) vertex order is considered positive orientation
 * - Cross product > 0 indicates left turn (CCW)
 * - Cross product < 0 indicates right turn (CW)
 * - Y-axis points upward (standard mathematical convention)
 *
 * @module polygon-clip
 */

import Decimal from "decimal.js";

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons
const EPSILON = new Decimal("1e-40");

// ============================================================================
// Point and Vector Primitives
// ============================================================================

/**
 * Create a point with arbitrary-precision Decimal coordinates.
 *
 * This is the fundamental building block for all polygon operations in this library.
 * Accepts numbers, strings, or Decimal instances and converts them to high-precision
 * Decimal coordinates to avoid floating-point errors in geometric calculations.
 *
 * @param {number|string|Decimal} x - The x-coordinate (will be converted to Decimal)
 * @param {number|string|Decimal} y - The y-coordinate (will be converted to Decimal)
 * @returns {{x: Decimal, y: Decimal}} Point object with Decimal coordinates
 *
 * @example
 * // Create a point from numbers
 * const p1 = point(3, 4);
 *
 * @example
 * // Create a point from strings for exact precision
 * const p2 = point('0.1', '0.2'); // Avoids 0.1 + 0.2 != 0.3 issues
 *
 * @example
 * // Create a point from existing Decimals
 * const p3 = point(new Decimal('1.5'), new Decimal('2.5'));
 */
export function point(x, y) {
  // Validate parameters exist
  if (x === null || x === undefined) {
    throw new Error("point: x coordinate is required");
  }
  if (y === null || y === undefined) {
    throw new Error("point: y coordinate is required");
  }
  return { x: D(x), y: D(y) };
}

/**
 * Check if two points are equal within a specified tolerance.
 *
 * Uses the absolute difference between coordinates to determine equality.
 * This is essential for geometric algorithms where exact equality is rarely
 * achievable due to numerical computation.
 *
 * @param {Object} p1 - First point with {x: Decimal, y: Decimal}
 * @param {Object} p2 - Second point with {x: Decimal, y: Decimal}
 * @param {Decimal} [tolerance=EPSILON] - Maximum allowed difference (default: 1e-40)
 * @returns {boolean} True if points are within tolerance of each other
 *
 * @example
 * const p1 = point(1, 2);
 * const p2 = point(1.0000000001, 2.0000000001);
 * pointsEqual(p1, p2); // true (within default tolerance)
 *
 * @example
 * const p1 = point(0, 0);
 * const p2 = point(1, 1);
 * pointsEqual(p1, p2); // false
 */
export function pointsEqual(p1, p2, tolerance = EPSILON) {
  // Validate parameters - check for null/undefined explicitly since Decimal objects are always truthy
  if (
    !p1 ||
    typeof p1 !== "object" ||
    p1.x === null ||
    p1.x === undefined ||
    p1.y === null ||
    p1.y === undefined
  ) {
    throw new Error("pointsEqual: p1 must be a point with x and y properties");
  }
  if (
    !p2 ||
    typeof p2 !== "object" ||
    p2.x === null ||
    p2.x === undefined ||
    p2.y === null ||
    p2.y === undefined
  ) {
    throw new Error("pointsEqual: p2 must be a point with x and y properties");
  }
  if (!tolerance || typeof tolerance.abs !== "function") {
    throw new Error("pointsEqual: tolerance must be a Decimal instance");
  }
  return (
    p1.x.minus(p2.x).abs().lt(tolerance) && p1.y.minus(p2.y).abs().lt(tolerance)
  );
}

/**
 * Compute the 2D cross product (z-component of 3D cross product).
 *
 * The cross product is fundamental for determining orientation and turns in 2D geometry.
 * It computes the signed area of the parallelogram formed by vectors (o→a) and (o→b).
 *
 * Algorithm:
 * - Forms vectors v1 = a - o and v2 = b - o
 * - Returns v1.x * v2.y - v1.y * v2.x
 * - This is equivalent to |v1| * |v2| * sin(θ) where θ is the angle from v1 to v2
 *
 * @param {Object} o - Origin point with {x: Decimal, y: Decimal}
 * @param {Object} a - First point with {x: Decimal, y: Decimal}
 * @param {Object} b - Second point with {x: Decimal, y: Decimal}
 * @returns {Decimal} Positive if b is left of o→a (counter-clockwise turn),
 *                    negative if right (clockwise turn),
 *                    zero if points are collinear
 *
 * @example
 * // Counter-clockwise turn (left turn)
 * const o = point(0, 0);
 * const a = point(1, 0);
 * const b = point(0, 1);
 * cross(o, a, b); // > 0 (CCW)
 *
 * @example
 * // Clockwise turn (right turn)
 * const o = point(0, 0);
 * const a = point(0, 1);
 * const b = point(1, 0);
 * cross(o, a, b); // < 0 (CW)
 *
 * @example
 * // Collinear points
 * const o = point(0, 0);
 * const a = point(1, 1);
 * const b = point(2, 2);
 * cross(o, a, b); // ≈ 0
 */
export function cross(o, a, b) {
  // Validate parameters - check for null/undefined explicitly since Decimal objects are always truthy
  if (
    !o ||
    o.x === null ||
    o.x === undefined ||
    o.y === null ||
    o.y === undefined
  ) {
    throw new Error("cross: origin point o must have x and y properties");
  }
  if (
    !a ||
    a.x === null ||
    a.x === undefined ||
    a.y === null ||
    a.y === undefined
  ) {
    throw new Error("cross: point a must have x and y properties");
  }
  if (
    !b ||
    b.x === null ||
    b.x === undefined ||
    b.y === null ||
    b.y === undefined
  ) {
    throw new Error("cross: point b must have x and y properties");
  }
  const ax = a.x.minus(o.x);
  const ay = a.y.minus(o.y);
  const bx = b.x.minus(o.x);
  const by = b.y.minus(o.y);
  return ax.mul(by).minus(ay.mul(bx));
}

/**
 * Compute the dot product of vectors (o→a) and (o→b).
 *
 * The dot product measures how much two vectors point in the same direction.
 * It's used for angle calculations and projections.
 *
 * Algorithm:
 * - Forms vectors v1 = a - o and v2 = b - o
 * - Returns v1.x * v2.x + v1.y * v2.y
 * - This is equivalent to |v1| * |v2| * cos(θ) where θ is the angle between vectors
 *
 * @param {Object} o - Origin point with {x: Decimal, y: Decimal}
 * @param {Object} a - First point with {x: Decimal, y: Decimal}
 * @param {Object} b - Second point with {x: Decimal, y: Decimal}
 * @returns {Decimal} Dot product value
 *                    Positive if angle < 90°,
 *                    zero if perpendicular,
 *                    negative if angle > 90°
 *
 * @example
 * // Parallel vectors (same direction)
 * const o = point(0, 0);
 * const a = point(1, 0);
 * const b = point(2, 0);
 * dot(o, a, b); // > 0
 *
 * @example
 * // Perpendicular vectors
 * const o = point(0, 0);
 * const a = point(1, 0);
 * const b = point(0, 1);
 * dot(o, a, b); // = 0
 *
 * @example
 * // Opposite direction vectors
 * const o = point(0, 0);
 * const a = point(1, 0);
 * const b = point(-1, 0);
 * dot(o, a, b); // < 0
 */
export function dot(o, a, b) {
  // Validate parameters - check for null/undefined explicitly since Decimal objects are always truthy
  if (
    !o ||
    o.x === null ||
    o.x === undefined ||
    o.y === null ||
    o.y === undefined
  ) {
    throw new Error("dot: origin point o must have x and y properties");
  }
  if (
    !a ||
    a.x === null ||
    a.x === undefined ||
    a.y === null ||
    a.y === undefined
  ) {
    throw new Error("dot: point a must have x and y properties");
  }
  if (
    !b ||
    b.x === null ||
    b.x === undefined ||
    b.y === null ||
    b.y === undefined
  ) {
    throw new Error("dot: point b must have x and y properties");
  }
  const ax = a.x.minus(o.x);
  const ay = a.y.minus(o.y);
  const bx = b.x.minus(o.x);
  const by = b.y.minus(o.y);
  return ax.mul(bx).plus(ay.mul(by));
}

/**
 * Determine the sign of a value with tolerance.
 *
 * Returns -1, 0, or 1 to indicate negative, near-zero, or positive values.
 * Uses EPSILON threshold to treat very small values as zero, avoiding
 * numerical precision issues in geometric tests.
 *
 * @param {Decimal} val - Value to test
 * @returns {number} -1 if val < -EPSILON,
 *                    0 if |val| <= EPSILON,
 *                    1 if val > EPSILON
 *
 * @example
 * sign(new Decimal('-5')); // -1
 * sign(new Decimal('1e-50')); // 0 (within tolerance)
 * sign(new Decimal('5')); // 1
 */
export function sign(val) {
  // Validate parameter is a Decimal - check null/undefined first
  if (val === null || val === undefined || typeof val.abs !== "function") {
    throw new Error("sign: val must be a Decimal instance");
  }
  if (val.abs().lt(EPSILON)) return 0;
  return val.lt(0) ? -1 : 1;
}

// ============================================================================
// Segment Intersection
// ============================================================================

/**
 * Compute the intersection point of two line segments using parametric form.
 *
 * Algorithm:
 * - Represents segments parametrically:
 *   Segment 1: P(t) = a + t(b - a) for t ∈ [0, 1]
 *   Segment 2: Q(s) = c + s(d - c) for s ∈ [0, 1]
 * - Solves P(t) = Q(s) for parameters t and s
 * - Uses Cramer's rule with determinant denom = (b-a) × (d-c)
 * - Returns null if segments are parallel (denom ≈ 0)
 * - Returns null if t or s are outside [0, 1] (intersection beyond segment endpoints)
 *
 * @param {Object} a - Start point of first segment with {x: Decimal, y: Decimal}
 * @param {Object} b - End point of first segment with {x: Decimal, y: Decimal}
 * @param {Object} c - Start point of second segment with {x: Decimal, y: Decimal}
 * @param {Object} d - End point of second segment with {x: Decimal, y: Decimal}
 * @returns {Object|null} Intersection point {x: Decimal, y: Decimal, t: Decimal, s: Decimal}
 *                        where t is parameter on first segment, s on second segment,
 *                        or null if segments don't intersect
 *
 * @example
 * // Intersecting segments
 * const a = point(0, 0);
 * const b = point(2, 2);
 * const c = point(0, 2);
 * const d = point(2, 0);
 * const intersection = segmentIntersection(a, b, c, d);
 * // Returns {x: 1, y: 1, t: 0.5, s: 0.5}
 *
 * @example
 * // Non-intersecting segments
 * const a = point(0, 0);
 * const b = point(1, 0);
 * const c = point(0, 1);
 * const d = point(1, 1);
 * segmentIntersection(a, b, c, d); // null
 *
 * @example
 * // Parallel segments
 * const a = point(0, 0);
 * const b = point(1, 0);
 * const c = point(0, 1);
 * const d = point(1, 1);
 * segmentIntersection(a, b, c, d); // null
 */
export function segmentIntersection(a, b, c, d) {
  // Validate all segment endpoints - check for null/undefined explicitly
  if (
    !a ||
    a.x === null ||
    a.x === undefined ||
    a.y === null ||
    a.y === undefined
  ) {
    throw new Error(
      "segmentIntersection: point a must have x and y properties",
    );
  }
  if (
    !b ||
    b.x === null ||
    b.x === undefined ||
    b.y === null ||
    b.y === undefined
  ) {
    throw new Error(
      "segmentIntersection: point b must have x and y properties",
    );
  }
  if (
    !c ||
    c.x === null ||
    c.x === undefined ||
    c.y === null ||
    c.y === undefined
  ) {
    throw new Error(
      "segmentIntersection: point c must have x and y properties",
    );
  }
  if (
    !d ||
    d.x === null ||
    d.x === undefined ||
    d.y === null ||
    d.y === undefined
  ) {
    throw new Error(
      "segmentIntersection: point d must have x and y properties",
    );
  }

  // Direction vectors
  const dx1 = b.x.minus(a.x);
  const dy1 = b.y.minus(a.y);
  const dx2 = d.x.minus(c.x);
  const dy2 = d.y.minus(c.y);

  // Cross product of directions (determinant)
  const denom = dx1.mul(dy2).minus(dy1.mul(dx2));

  // Check if lines are parallel or collinear
  if (denom.abs().lt(EPSILON)) {
    // Note: Returns null for both parallel and collinear segments
    // Collinear overlapping segments are not handled (no single intersection point exists)
    return null;
  }

  // Vector from a to c
  const dx3 = c.x.minus(a.x);
  const dy3 = c.y.minus(a.y);

  // Parametric values
  const t = dx3.mul(dy2).minus(dy3.mul(dx2)).div(denom);
  const s = dx3.mul(dy1).minus(dy3.mul(dx1)).div(denom);

  // Check if intersection is within both segments [0, 1]
  const zero = D(0);
  const one = D(1);

  if (t.gte(zero) && t.lte(one) && s.gte(zero) && s.lte(one)) {
    return {
      x: a.x.plus(dx1.mul(t)),
      y: a.y.plus(dy1.mul(t)),
      t: t,
      s: s,
    };
  }

  return null;
}

/**
 * Compute intersection of an infinite line with a finite segment.
 *
 * Unlike segmentIntersection, this treats the first input as an infinite line
 * (extending beyond lineA and lineB) while the second input is a bounded segment.
 * Used primarily in clipping algorithms where edges define infinite half-planes.
 *
 * Algorithm:
 * - Line defined by two points: extends infinitely through lineA and lineB
 * - Segment bounded: only between segA and segB
 * - Computes parameter s ∈ [0, 1] for the segment
 * - Returns intersection if s is valid, null otherwise
 *
 * @param {Object} lineA - First point defining the infinite line
 * @param {Object} lineB - Second point defining the infinite line
 * @param {Object} segA - Start point of the bounded segment
 * @param {Object} segB - End point of the bounded segment
 * @returns {Object|null} Intersection point {x: Decimal, y: Decimal, s: Decimal}
 *                        where s is the parameter on the segment,
 *                        or null if no intersection exists
 *
 * @example
 * // Line intersects segment
 * const lineA = point(0, 0);
 * const lineB = point(1, 1);
 * const segA = point(0, 1);
 * const segB = point(1, 0);
 * lineSegmentIntersection(lineA, lineB, segA, segB);
 * // Returns intersection point
 *
 * @example
 * // Line parallel to segment
 * const lineA = point(0, 0);
 * const lineB = point(1, 0);
 * const segA = point(0, 1);
 * const segB = point(1, 1);
 * lineSegmentIntersection(lineA, lineB, segA, segB); // null
 */
export function lineSegmentIntersection(lineA, lineB, segA, segB) {
  // Validate all points - check for null/undefined explicitly
  if (
    !lineA ||
    lineA.x === null ||
    lineA.x === undefined ||
    lineA.y === null ||
    lineA.y === undefined
  ) {
    throw new Error(
      "lineSegmentIntersection: lineA must have x and y properties",
    );
  }
  if (
    !lineB ||
    lineB.x === null ||
    lineB.x === undefined ||
    lineB.y === null ||
    lineB.y === undefined
  ) {
    throw new Error(
      "lineSegmentIntersection: lineB must have x and y properties",
    );
  }
  if (
    !segA ||
    segA.x === null ||
    segA.x === undefined ||
    segA.y === null ||
    segA.y === undefined
  ) {
    throw new Error(
      "lineSegmentIntersection: segA must have x and y properties",
    );
  }
  if (
    !segB ||
    segB.x === null ||
    segB.x === undefined ||
    segB.y === null ||
    segB.y === undefined
  ) {
    throw new Error(
      "lineSegmentIntersection: segB must have x and y properties",
    );
  }

  const dx1 = lineB.x.minus(lineA.x);
  const dy1 = lineB.y.minus(lineA.y);
  const dx2 = segB.x.minus(segA.x);
  const dy2 = segB.y.minus(segA.y);

  const denom = dx1.mul(dy2).minus(dy1.mul(dx2));

  if (denom.abs().lt(EPSILON)) {
    return null;
  }

  const dx3 = segA.x.minus(lineA.x);
  const dy3 = segA.y.minus(lineA.y);

  const s = dx3.mul(dy1).minus(dy3.mul(dx1)).div(denom);

  if (s.gte(0) && s.lte(1)) {
    return {
      x: segA.x.plus(dx2.mul(s)),
      y: segA.y.plus(dy2.mul(s)),
      s: s,
    };
  }

  return null;
}

// ============================================================================
// Point in Polygon (Ray Casting)
// ============================================================================

/**
 * Test if a point is inside a polygon using the winding number algorithm.
 *
 * This implementation uses a modified ray casting approach that computes the
 * winding number - the number of times the polygon winds around the point.
 * For simple (non-self-intersecting) polygons:
 * - winding = 0 means outside
 * - winding ≠ 0 means inside
 *
 * Algorithm (Winding Number):
 * 1. Cast a horizontal ray from the test point to the right (+x direction)
 * 2. Count upward edge crossings as +1
 * 3. Count downward edge crossings as -1
 * 4. Use cross product to determine if crossing is left of the point
 * 5. Return winding number (non-zero = inside, zero = outside)
 *
 * This is more robust than even-odd ray casting for complex polygons.
 *
 * @param {Object} pt - Point to test with {x: Decimal, y: Decimal}
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {number} 1 if point is strictly inside,
 *                   0 if point is on the boundary,
 *                   -1 if point is strictly outside
 *
 * @example
 * // Point inside square
 * const square = [point(0,0), point(2,0), point(2,2), point(0,2)];
 * pointInPolygon(point(1, 1), square); // 1 (inside)
 *
 * @example
 * // Point outside square
 * pointInPolygon(point(3, 3), square); // -1 (outside)
 *
 * @example
 * // Point on edge
 * pointInPolygon(point(1, 0), square); // 0 (on boundary)
 *
 * @example
 * // Concave polygon
 * const concave = [point(0,0), point(4,0), point(4,4), point(2,2), point(0,4)];
 * pointInPolygon(point(3, 2), concave); // 1 (inside concave region)
 */
export function pointInPolygon(pt, polygon) {
  // Validate point parameter - check for null/undefined explicitly
  if (
    !pt ||
    pt.x === null ||
    pt.x === undefined ||
    pt.y === null ||
    pt.y === undefined
  ) {
    throw new Error("pointInPolygon: pt must have x and y properties");
  }
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("pointInPolygon: polygon must be an array");
  }

  const n = polygon.length;
  // Degenerate polygon: point, line segment, or empty cannot contain a point
  if (n < 3) return -1;

  // Validate polygon elements have x and y properties
  for (let i = 0; i < n; i++) {
    if (
      !polygon[i] ||
      polygon[i].x === null ||
      polygon[i].x === undefined ||
      polygon[i].y === null ||
      polygon[i].y === undefined
    ) {
      throw new Error(
        `pointInPolygon: polygon[${i}] must have x and y properties`,
      );
    }
  }

  let winding = 0;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Check if point is on the edge
    if (pointOnSegment(pt, p1, p2)) {
      return 0; // On boundary
    }

    // Ray casting from pt going right (+x direction)
    if (p1.y.lte(pt.y)) {
      if (p2.y.gt(pt.y)) {
        // Upward crossing
        if (cross(p1, p2, pt).gt(0)) {
          winding++;
        }
      }
    } else {
      if (p2.y.lte(pt.y)) {
        // Downward crossing
        if (cross(p1, p2, pt).lt(0)) {
          winding--;
        }
      }
    }
  }

  return winding !== 0 ? 1 : -1;
}

/**
 * Check if a point lies on a line segment.
 *
 * Uses two tests:
 * 1. Collinearity: cross product must be near zero
 * 2. Bounding box: point must be within segment's axis-aligned bounding box
 *
 * Algorithm:
 * - Compute cross product to test collinearity
 * - If collinear, check if point is between segment endpoints
 * - Uses bounding box test for efficiency
 *
 * @param {Object} pt - Point to test with {x: Decimal, y: Decimal}
 * @param {Object} a - Segment start point with {x: Decimal, y: Decimal}
 * @param {Object} b - Segment end point with {x: Decimal, y: Decimal}
 * @returns {boolean} True if point lies on the segment (within EPSILON tolerance)
 *
 * @example
 * // Point on segment
 * const a = point(0, 0);
 * const b = point(2, 2);
 * const pt = point(1, 1);
 * pointOnSegment(pt, a, b); // true
 *
 * @example
 * // Point on line but not segment
 * const pt2 = point(3, 3);
 * pointOnSegment(pt2, a, b); // false (beyond endpoint)
 *
 * @example
 * // Point not on line
 * const pt3 = point(1, 2);
 * pointOnSegment(pt3, a, b); // false (not collinear)
 */
export function pointOnSegment(pt, a, b) {
  // Validate all points - check for null/undefined explicitly
  if (
    !pt ||
    pt.x === null ||
    pt.x === undefined ||
    pt.y === null ||
    pt.y === undefined
  ) {
    throw new Error("pointOnSegment: pt must have x and y properties");
  }
  if (
    !a ||
    a.x === null ||
    a.x === undefined ||
    a.y === null ||
    a.y === undefined
  ) {
    throw new Error(
      "pointOnSegment: segment point a must have x and y properties",
    );
  }
  if (
    !b ||
    b.x === null ||
    b.x === undefined ||
    b.y === null ||
    b.y === undefined
  ) {
    throw new Error(
      "pointOnSegment: segment point b must have x and y properties",
    );
  }

  // Check collinearity using cross product
  // Note: Using EPSILON tolerance handles numerical precision issues
  // where a point should be on a segment but floating-point errors prevent exact zero
  const crossVal = cross(a, b, pt);
  if (crossVal.abs().gt(EPSILON)) {
    return false; // Not collinear
  }

  // Check if pt is between a and b
  const minX = Decimal.min(a.x, b.x);
  const maxX = Decimal.max(a.x, b.x);
  const minY = Decimal.min(a.y, b.y);
  const maxY = Decimal.max(a.y, b.y);

  return (
    pt.x.gte(minX.minus(EPSILON)) &&
    pt.x.lte(maxX.plus(EPSILON)) &&
    pt.y.gte(minY.minus(EPSILON)) &&
    pt.y.lte(maxY.plus(EPSILON))
  );
}

// ============================================================================
// Sutherland-Hodgman Algorithm (Convex Polygon Clipping)
// ============================================================================

/**
 * Clip a polygon against a convex clipping polygon using the Sutherland-Hodgman algorithm.
 *
 * The Sutherland-Hodgman algorithm is a classic polygon clipping technique that works
 * efficiently for convex clipping windows. It processes the subject polygon against
 * each edge of the clipping polygon sequentially.
 *
 * Algorithm (Sutherland-Hodgman):
 * 1. Initialize output with subject polygon vertices
 * 2. For each edge of the clipping polygon:
 *    a. Create a temporary input list from current output
 *    b. Clear output list
 *    c. For each edge in the input polygon:
 *       - If current vertex is inside: output it (and intersection if entering)
 *       - If current vertex is outside but previous was inside: output intersection
 *    d. Replace output with new list
 * 3. Return final output polygon
 *
 * "Inside" is defined as being on the left side (or on) the directed clipping edge
 * for counter-clockwise oriented polygons.
 *
 * Limitations:
 * - Clipping polygon MUST be convex (automatically enforced to be CCW)
 * - Does not handle holes or self-intersecting polygons
 * - Self-intersecting subject or clip polygons will produce incorrect results
 *
 * @param {Array} subject - Subject polygon vertices [{x, y}, ...] (can be convex or concave)
 * @param {Array} clip - Clipping polygon vertices (MUST be convex, will be converted to CCW)
 * @returns {Array} Clipped polygon vertices in CCW order, or empty array if no intersection
 *
 * @example
 * // Clip a square against a triangle
 * const subject = [point(0,0), point(4,0), point(4,4), point(0,4)];
 * const clip = [point(1,1), point(5,1), point(1,5)];
 * const result = clipPolygonSH(subject, clip);
 * // Returns clipped polygon vertices
 *
 * @example
 * // No intersection case
 * const subject = [point(0,0), point(1,0), point(1,1), point(0,1)];
 * const clip = [point(10,10), point(11,10), point(11,11), point(10,11)];
 * clipPolygonSH(subject, clip); // []
 */
export function clipPolygonSH(subject, clip) {
  // Validate inputs are arrays
  if (!Array.isArray(subject)) {
    throw new Error("clipPolygonSH: subject must be an array");
  }
  if (!Array.isArray(clip)) {
    throw new Error("clipPolygonSH: clip must be an array");
  }

  if (subject.length < 3 || clip.length < 3) {
    return [];
  }

  // Validate all subject points have x and y properties
  for (let i = 0; i < subject.length; i++) {
    if (
      !subject[i] ||
      subject[i].x === null ||
      subject[i].x === undefined ||
      subject[i].y === null ||
      subject[i].y === undefined
    ) {
      throw new Error(
        `clipPolygonSH: subject[${i}] must have x and y properties`,
      );
    }
  }

  // Validate all clip points have x and y properties
  for (let i = 0; i < clip.length; i++) {
    if (
      !clip[i] ||
      clip[i].x === null ||
      clip[i].x === undefined ||
      clip[i].y === null ||
      clip[i].y === undefined
    ) {
      throw new Error(`clipPolygonSH: clip[${i}] must have x and y properties`);
    }
  }

  // Convert all points to Decimal
  let output = subject.map((p) => point(p.x, p.y));
  let clipPoly = clip.map((p) => point(p.x, p.y));

  // Ensure clip polygon is in counter-clockwise order (required for Sutherland-Hodgman)
  clipPoly = ensureCCW(clipPoly);

  // Clip against each edge of the clipping polygon
  for (let i = 0; i < clipPoly.length; i++) {
    if (output.length === 0) {
      return [];
    }

    const clipEdgeStart = clipPoly[i];
    const clipEdgeEnd = clipPoly[(i + 1) % clipPoly.length];

    const input = output;
    output = [];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const prev = input[(j + input.length - 1) % input.length];

      const currentInside = isInsideEdge(current, clipEdgeStart, clipEdgeEnd);
      const prevInside = isInsideEdge(prev, clipEdgeStart, clipEdgeEnd);

      if (currentInside) {
        if (!prevInside) {
          // Entering: add intersection point
          const intersection = lineIntersection(
            prev,
            current,
            clipEdgeStart,
            clipEdgeEnd,
          );
          if (intersection) {
            output.push(intersection);
          }
        }
        output.push(current);
      } else if (prevInside) {
        // Leaving: add intersection point
        const intersection = lineIntersection(
          prev,
          current,
          clipEdgeStart,
          clipEdgeEnd,
        );
        if (intersection) {
          output.push(intersection);
        }
      }
    }
  }

  return output;
}

/**
 * Check if a point is inside (left of) a directed edge.
 *
 * Used by Sutherland-Hodgman algorithm. For counter-clockwise oriented
 * polygons, "inside" means on the left side of the directed edge.
 *
 * Vertex-on-edge handling: Points exactly on the edge (cross product = 0)
 * are considered inside (>= 0). This ensures consistent behavior when
 * clipping polygons share vertices or edges.
 *
 * @private
 * @param {Object} pt - Point to test
 * @param {Object} edgeStart - Edge start point
 * @param {Object} edgeEnd - Edge end point
 * @returns {boolean} True if point is on left side or exactly on the edge
 */
function isInsideEdge(pt, edgeStart, edgeEnd) {
  // Validate inputs (defensive check for internal function) - check for null/undefined explicitly
  if (
    !pt ||
    pt.x === null ||
    pt.x === undefined ||
    pt.y === null ||
    pt.y === undefined
  ) {
    throw new Error("isInsideEdge: pt must have x and y properties");
  }
  if (
    !edgeStart ||
    edgeStart.x === null ||
    edgeStart.x === undefined ||
    edgeStart.y === null ||
    edgeStart.y === undefined
  ) {
    throw new Error("isInsideEdge: edgeStart must have x and y properties");
  }
  if (
    !edgeEnd ||
    edgeEnd.x === null ||
    edgeEnd.x === undefined ||
    edgeEnd.y === null ||
    edgeEnd.y === undefined
  ) {
    throw new Error("isInsideEdge: edgeEnd must have x and y properties");
  }

  // Point is "inside" if it's on the left side of the edge (CCW polygon)
  // Note: >= 0 treats points ON the edge as inside (important for vertex-on-edge cases)
  return cross(edgeStart, edgeEnd, pt).gte(0);
}

/**
 * Compute intersection of two infinite lines (not segments).
 *
 * Unlike segment intersection, this doesn't check parameter bounds.
 * Used by Sutherland-Hodgman when clipping against infinite half-planes.
 *
 * @private
 * @param {Object} a - First point on first line
 * @param {Object} b - Second point on first line
 * @param {Object} c - First point on second line
 * @param {Object} d - Second point on second line
 * @returns {Object|null} Intersection point {x, y} or null if parallel
 */
function lineIntersection(a, b, c, d) {
  // Validate inputs (defensive check for internal function) - check for null/undefined explicitly
  if (
    !a ||
    a.x === null ||
    a.x === undefined ||
    a.y === null ||
    a.y === undefined
  ) {
    throw new Error("lineIntersection: point a must have x and y properties");
  }
  if (
    !b ||
    b.x === null ||
    b.x === undefined ||
    b.y === null ||
    b.y === undefined
  ) {
    throw new Error("lineIntersection: point b must have x and y properties");
  }
  if (
    !c ||
    c.x === null ||
    c.x === undefined ||
    c.y === null ||
    c.y === undefined
  ) {
    throw new Error("lineIntersection: point c must have x and y properties");
  }
  if (
    !d ||
    d.x === null ||
    d.x === undefined ||
    d.y === null ||
    d.y === undefined
  ) {
    throw new Error("lineIntersection: point d must have x and y properties");
  }

  const dx1 = b.x.minus(a.x);
  const dy1 = b.y.minus(a.y);
  const dx2 = d.x.minus(c.x);
  const dy2 = d.y.minus(c.y);

  const denom = dx1.mul(dy2).minus(dy1.mul(dx2));

  if (denom.abs().lt(EPSILON)) {
    return null;
  }

  const dx3 = c.x.minus(a.x);
  const dy3 = c.y.minus(a.y);

  const t = dx3.mul(dy2).minus(dy3.mul(dx2)).div(denom);

  return {
    x: a.x.plus(dx1.mul(t)),
    y: a.y.plus(dy1.mul(t)),
  };
}

// ============================================================================
// Polygon Area and Orientation
// ============================================================================

/**
 * Compute the signed area of a polygon using the Shoelace formula.
 *
 * The Shoelace formula (also known as surveyor's formula or Gauss's area formula)
 * efficiently computes polygon area using only vertex coordinates. The sign of
 * the area indicates polygon orientation.
 *
 * Algorithm (Shoelace Formula):
 * 1. For each edge (i, i+1), compute: x[i] * y[i+1] - x[i+1] * y[i]
 * 2. Sum all edge contributions
 * 3. Divide by 2 to get signed area
 *
 * The formula comes from Green's theorem applied to the region enclosed by the polygon.
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {Decimal} Signed area of the polygon
 *                    Positive if vertices are in counter-clockwise order
 *                    Negative if vertices are in clockwise order
 *                    Zero if polygon is degenerate (< 3 vertices or collinear)
 *
 * @example
 * // Counter-clockwise square (area = 4)
 * const square = [point(0,0), point(2,0), point(2,2), point(0,2)];
 * polygonArea(square); // 4
 *
 * @example
 * // Clockwise square (area = -4)
 * const squareCW = [point(0,0), point(0,2), point(2,2), point(2,0)];
 * polygonArea(squareCW); // -4
 *
 * @example
 * // Triangle
 * const triangle = [point(0,0), point(3,0), point(0,4)];
 * polygonArea(triangle); // 6
 */
export function polygonArea(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("polygonArea: polygon must be an array");
  }

  const n = polygon.length;
  if (n < 3) return D(0);

  // Validate all polygon points have x and y properties
  for (let i = 0; i < n; i++) {
    if (
      !polygon[i] ||
      polygon[i].x === null ||
      polygon[i].x === undefined ||
      polygon[i].y === null ||
      polygon[i].y === undefined
    ) {
      throw new Error(
        `polygonArea: polygon[${i}] must have x and y properties`,
      );
    }
  }

  let area = D(0);
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    area = area.plus(p1.x.mul(p2.y).minus(p2.x.mul(p1.y)));
  }

  return area.div(2);
}

/**
 * Check if polygon vertices are in counter-clockwise order.
 *
 * Uses the signed area to determine orientation. A positive area indicates
 * counter-clockwise (CCW) orientation, which is the standard for many
 * geometric algorithms.
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {boolean} True if vertices are in counter-clockwise order
 *
 * @example
 * const ccw = [point(0,0), point(1,0), point(0,1)];
 * isCounterClockwise(ccw); // true
 *
 * @example
 * const cw = [point(0,0), point(0,1), point(1,0)];
 * isCounterClockwise(cw); // false
 */
export function isCounterClockwise(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("isCounterClockwise: polygon must be an array");
  }
  return polygonArea(polygon).gt(0);
}

/**
 * Reverse the order of polygon vertices.
 *
 * This effectively flips the orientation from CCW to CW or vice versa.
 * Useful for ensuring consistent winding order in boolean operations.
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {Array} New array with vertices in reverse order
 *
 * @example
 * const poly = [point(0,0), point(1,0), point(1,1)];
 * const reversed = reversePolygon(poly);
 * // reversed = [point(1,1), point(1,0), point(0,0)]
 */
export function reversePolygon(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("reversePolygon: polygon must be an array");
  }
  return [...polygon].reverse();
}

/**
 * Ensure polygon vertices are in counter-clockwise order.
 *
 * Many geometric algorithms require CCW orientation. This function
 * checks the current orientation and reverses if necessary.
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {Array} Polygon with vertices in CCW order (may be a new array or the original)
 *
 * @example
 * const cw = [point(0,0), point(0,1), point(1,0)];
 * const ccw = ensureCCW(cw);
 * isCounterClockwise(ccw); // true
 */
export function ensureCCW(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("ensureCCW: polygon must be an array");
  }
  if (!isCounterClockwise(polygon)) {
    return reversePolygon(polygon);
  }
  return polygon;
}

// ============================================================================
// Convex Hull (Graham Scan)
// ============================================================================

/**
 * Compute the convex hull of a set of points using the Graham scan algorithm.
 *
 * The Graham scan is an efficient O(n log n) algorithm for computing the convex hull
 * of a point set. The convex hull is the smallest convex polygon containing all points.
 *
 * Algorithm (Graham Scan):
 * 1. Find the lowest point (leftmost if tie) - this is the pivot
 * 2. Sort all other points by polar angle with respect to the pivot
 * 3. For ties in angle, sort by distance (closer points first)
 * 4. Initialize stack with pivot point
 * 5. For each sorted point:
 *    a. While stack has 2+ points and last 3 points make a right turn (CW):
 *       - Pop from stack (this point is interior, not on hull)
 *    b. Push current point onto stack
 * 6. Stack contains convex hull vertices in CCW order
 *
 * The cross product test determines turns:
 * - cross > 0: left turn (CCW) - keep the point
 * - cross ≤ 0: right turn (CW) or collinear - remove previous point
 *
 * @param {Array} points - Array of input points [{x, y}, ...]
 * @returns {Array} Convex hull vertices in counter-clockwise order
 *
 * @example
 * // Square with interior point
 * const points = [
 *   point(0,0), point(2,0), point(2,2), point(0,2),
 *   point(1,1) // interior point
 * ];
 * const hull = convexHull(points);
 * // Returns [point(0,0), point(2,0), point(2,2), point(0,2)]
 *
 * @example
 * // Collinear points
 * const collinear = [point(0,0), point(1,1), point(2,2), point(3,3)];
 * const hull = convexHull(collinear);
 * // Returns [point(0,0), point(3,3)] (or similar minimal hull)
 *
 * @example
 * // Random point cloud
 * const cloud = [point(1,1), point(3,2), point(0,0), point(2,4), point(4,0)];
 * const hull = convexHull(cloud);
 * // Returns vertices of convex boundary in CCW order
 */
export function convexHull(points) {
  // Validate points is an array
  if (!Array.isArray(points)) {
    throw new Error("convexHull: points must be an array");
  }

  if (points.length < 3) {
    // Validate and convert points
    for (let i = 0; i < points.length; i++) {
      if (
        !points[i] ||
        points[i].x === null ||
        points[i].x === undefined ||
        points[i].y === null ||
        points[i].y === undefined
      ) {
        throw new Error(
          `convexHull: points[${i}] must have x and y properties`,
        );
      }
    }
    return points.map((p) => point(p.x, p.y));
  }

  // Validate all points have x and y properties before converting
  for (let i = 0; i < points.length; i++) {
    if (
      !points[i] ||
      points[i].x === null ||
      points[i].x === undefined ||
      points[i].y === null ||
      points[i].y === undefined
    ) {
      throw new Error(`convexHull: points[${i}] must have x and y properties`);
    }
  }

  // Convert to Decimal points
  const pts = points.map((p) => point(p.x, p.y));

  // Find the lowest point (and leftmost if tie)
  let lowest = 0;
  for (let i = 1; i < pts.length; i++) {
    if (
      pts[i].y.lt(pts[lowest].y) ||
      (pts[i].y.eq(pts[lowest].y) && pts[i].x.lt(pts[lowest].x))
    ) {
      lowest = i;
    }
  }

  // Swap lowest to front
  [pts[0], pts[lowest]] = [pts[lowest], pts[0]];
  const pivot = pts[0];

  // Sort by polar angle with pivot
  const sorted = pts.slice(1).sort((a, b) => {
    const crossVal = cross(pivot, a, b);
    if (crossVal.abs().lt(EPSILON)) {
      // Collinear: sort by distance (using Decimal comparison to preserve precision)
      const distA = a.x.minus(pivot.x).pow(2).plus(a.y.minus(pivot.y).pow(2));
      const distB = b.x.minus(pivot.x).pow(2).plus(b.y.minus(pivot.y).pow(2));
      const diff = distA.minus(distB);
      // Return -1, 0, or 1 to avoid precision loss from toNumber()
      if (diff.abs().lt(EPSILON)) return 0;
      return diff.lt(0) ? -1 : 1;
    }
    // Use sign comparison instead of toNumber() to preserve precision
    const crossSign = sign(crossVal);
    return -crossSign; // CCW order (negate because we want CCW)
  });

  // Build hull
  const hull = [pivot];

  for (const pt of sorted) {
    while (
      hull.length > 1 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], pt).lte(0)
    ) {
      hull.pop();
    }
    hull.push(pt);
  }

  return hull;
}

// ============================================================================
// Bounding Box Operations
// ============================================================================

/**
 * Compute the axis-aligned bounding box (AABB) of a polygon.
 *
 * The bounding box is the smallest axis-aligned rectangle that contains
 * all vertices of the polygon. Used for quick intersection tests and
 * spatial queries.
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}|null}
 *          Bounding box with min/max coordinates, or null if polygon is empty
 *
 * @example
 * const triangle = [point(1,1), point(4,2), point(2,5)];
 * const bbox = boundingBox(triangle);
 * // {minX: 1, minY: 1, maxX: 4, maxY: 5}
 *
 * @example
 * const empty = [];
 * boundingBox(empty); // null
 */
export function boundingBox(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("boundingBox: polygon must be an array");
  }

  if (polygon.length === 0) {
    return null;
  }

  // Validate first point has x and y properties
  if (
    !polygon[0] ||
    polygon[0].x === null ||
    polygon[0].x === undefined ||
    polygon[0].y === null ||
    polygon[0].y === undefined
  ) {
    throw new Error("boundingBox: polygon[0] must have x and y properties");
  }

  let minX = D(polygon[0].x);
  let minY = D(polygon[0].y);
  let maxX = D(polygon[0].x);
  let maxY = D(polygon[0].y);

  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    // Validate each point has x and y properties
    if (
      !p ||
      p.x === null ||
      p.x === undefined ||
      p.y === null ||
      p.y === undefined
    ) {
      throw new Error(
        `boundingBox: polygon[${i}] must have x and y properties`,
      );
    }
    const x = D(p.x);
    const y = D(p.y);
    if (x.lt(minX)) minX = x;
    if (y.lt(minY)) minY = y;
    if (x.gt(maxX)) maxX = x;
    if (y.gt(maxY)) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if two axis-aligned bounding boxes intersect.
 *
 * Two AABBs intersect if they overlap in both x and y dimensions.
 * This is a fast O(1) test used to quickly reject non-intersecting polygons
 * before performing more expensive exact intersection tests.
 *
 * Algorithm:
 * - Boxes DO NOT intersect if:
 *   - bb1's right edge is left of bb2's left edge, OR
 *   - bb2's right edge is left of bb1's left edge, OR
 *   - bb1's top edge is below bb2's bottom edge, OR
 *   - bb2's top edge is below bb1's bottom edge
 * - Otherwise they intersect (or touch)
 *
 * @param {Object} bb1 - First bounding box {minX, minY, maxX, maxY}
 * @param {Object} bb2 - Second bounding box {minX, minY, maxX, maxY}
 * @returns {boolean} True if bounding boxes overlap or touch
 *
 * @example
 * const bb1 = {minX: D(0), minY: D(0), maxX: D(2), maxY: D(2)};
 * const bb2 = {minX: D(1), minY: D(1), maxX: D(3), maxY: D(3)};
 * bboxIntersects(bb1, bb2); // true (overlapping)
 *
 * @example
 * const bb3 = {minX: D(5), minY: D(5), maxX: D(7), maxY: D(7)};
 * bboxIntersects(bb1, bb3); // false (separate)
 */
export function bboxIntersects(bb1, bb2) {
  // Check if bounding boxes are null
  if (!bb1 || !bb2) return false;

  // Validate bounding boxes have required properties - check for null/undefined explicitly
  if (
    bb1.minX === null ||
    bb1.minX === undefined ||
    bb1.minY === null ||
    bb1.minY === undefined ||
    bb1.maxX === null ||
    bb1.maxX === undefined ||
    bb1.maxY === null ||
    bb1.maxY === undefined
  ) {
    throw new Error(
      "bboxIntersects: bb1 must have minX, minY, maxX, maxY properties",
    );
  }
  if (
    bb2.minX === null ||
    bb2.minX === undefined ||
    bb2.minY === null ||
    bb2.minY === undefined ||
    bb2.maxX === null ||
    bb2.maxX === undefined ||
    bb2.maxY === null ||
    bb2.maxY === undefined
  ) {
    throw new Error(
      "bboxIntersects: bb2 must have minX, minY, maxX, maxY properties",
    );
  }

  return !(
    bb1.maxX.lt(bb2.minX) ||
    bb2.maxX.lt(bb1.minX) ||
    bb1.maxY.lt(bb2.minY) ||
    bb2.maxY.lt(bb1.minY)
  );
}

// ============================================================================
// General Polygon Intersection (Weiler-Atherton based)
// ============================================================================

/**
 * Compute the intersection of two simple polygons.
 *
 * Returns the region(s) where both polygons overlap. This implementation
 * handles both convex and concave polygons, though complex cases may produce
 * simplified results (convex hull of intersection points).
 *
 * Algorithm:
 * 1. Quick rejection: check if bounding boxes intersect
 * 2. If clip polygon is convex: use efficient Sutherland-Hodgman algorithm
 * 3. Otherwise: use general point collection method:
 *    a. Find all edge-edge intersection points
 *    b. Find subject vertices inside clip polygon
 *    c. Find clip vertices inside subject polygon
 *    d. Compute convex hull of all collected points
 *
 * Note: For complex concave polygons with multiple intersection regions,
 * this returns a simplified convex hull. Full Weiler-Atherton would be
 * needed for exact results with holes and multiple components.
 *
 * @param {Array} subject - Subject polygon vertices [{x, y}, ...]
 * @param {Array} clip - Clipping polygon vertices [{x, y}, ...]
 * @returns {Array<Array>} Array of result polygons (usually one polygon,
 *                         or empty array if no intersection)
 *
 * @example
 * // Two overlapping squares
 * const square1 = [point(0,0), point(2,0), point(2,2), point(0,2)];
 * const square2 = [point(1,1), point(3,1), point(3,3), point(1,3)];
 * const result = polygonIntersection(square1, square2);
 * // Returns intersection region: [point(1,1), point(2,1), point(2,2), point(1,2)]
 *
 * @example
 * // No intersection
 * const square1 = [point(0,0), point(1,0), point(1,1), point(0,1)];
 * const square2 = [point(5,5), point(6,5), point(6,6), point(5,6)];
 * polygonIntersection(square1, square2); // []
 */
export function polygonIntersection(subject, clip) {
  // Validate inputs are arrays
  if (!Array.isArray(subject)) {
    throw new Error("polygonIntersection: subject must be an array");
  }
  if (!Array.isArray(clip)) {
    throw new Error("polygonIntersection: clip must be an array");
  }

  // Validate all subject points have x and y properties
  for (let i = 0; i < subject.length; i++) {
    if (
      !subject[i] ||
      subject[i].x === null ||
      subject[i].x === undefined ||
      subject[i].y === null ||
      subject[i].y === undefined
    ) {
      throw new Error(
        `polygonIntersection: subject[${i}] must have x and y properties`,
      );
    }
  }

  // Validate all clip points have x and y properties
  for (let i = 0; i < clip.length; i++) {
    if (
      !clip[i] ||
      clip[i].x === null ||
      clip[i].x === undefined ||
      clip[i].y === null ||
      clip[i].y === undefined
    ) {
      throw new Error(
        `polygonIntersection: clip[${i}] must have x and y properties`,
      );
    }
  }

  // Convert to Decimal points
  const subjectPoly = subject.map((p) => point(p.x, p.y));
  const clipPoly = clip.map((p) => point(p.x, p.y));

  // Quick bounding box check
  const bb1 = boundingBox(subjectPoly);
  const bb2 = boundingBox(clipPoly);

  if (!bboxIntersects(bb1, bb2)) {
    return [];
  }

  // For simple cases, use Sutherland-Hodgman if clip is convex
  if (isConvex(clipPoly)) {
    const result = clipPolygonSH(subjectPoly, ensureCCW(clipPoly));
    return result.length >= 3 ? [result] : [];
  }

  // For general case, use point collection approach
  return generalPolygonIntersection(subjectPoly, clipPoly);
}

/**
 * Check if a polygon is convex.
 *
 * A polygon is convex if all interior angles are less than 180°, or equivalently,
 * if all turns along the boundary are in the same direction (all left or all right).
 *
 * Algorithm:
 * 1. For each triple of consecutive vertices (p0, p1, p2):
 *    - Compute cross product at p1
 *    - Determine turn direction (left/right)
 * 2. If all non-zero turns are in the same direction: convex
 * 3. If turns change direction: concave
 *
 * @param {Array} polygon - Array of polygon vertices [{x, y}, ...]
 * @returns {boolean} True if polygon is convex, false if concave or degenerate
 *
 * @example
 * // Convex square
 * const square = [point(0,0), point(1,0), point(1,1), point(0,1)];
 * isConvex(square); // true
 *
 * @example
 * // Concave polygon (L-shape)
 * const lshape = [point(0,0), point(2,0), point(2,1), point(1,1), point(1,2), point(0,2)];
 * isConvex(lshape); // false
 *
 * @example
 * // Triangle (always convex)
 * const triangle = [point(0,0), point(2,0), point(1,2)];
 * isConvex(triangle); // true
 */
export function isConvex(polygon) {
  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    throw new Error("isConvex: polygon must be an array");
  }

  const n = polygon.length;
  if (n < 3) return false;

  // Validate all polygon points have x and y properties
  for (let i = 0; i < n; i++) {
    if (
      !polygon[i] ||
      polygon[i].x === null ||
      polygon[i].x === undefined ||
      polygon[i].y === null ||
      polygon[i].y === undefined
    ) {
      throw new Error(`isConvex: polygon[${i}] must have x and y properties`);
    }
  }

  let crossSign = 0;

  for (let i = 0; i < n; i++) {
    const p0 = polygon[i];
    const p1 = polygon[(i + 1) % n];
    const p2 = polygon[(i + 2) % n];

    const crossVal = cross(p0, p1, p2);
    const currentSign = crossVal.gt(0) ? 1 : crossVal.lt(0) ? -1 : 0;

    if (currentSign !== 0) {
      if (crossSign === 0) {
        crossSign = currentSign;
      } else if (crossSign !== currentSign) {
        return false;
      }
    }
  }

  return true;
}

/**
 * General polygon intersection using point collection method.
 *
 * A simplified approach for general (possibly concave) polygon intersection.
 * Collects all relevant points and computes their convex hull.
 *
 * Algorithm:
 * 1. Find all edge-edge intersection points
 * 2. Find subject vertices inside or on clip polygon
 * 3. Find clip vertices inside or on subject polygon
 * 4. Remove duplicate points
 * 5. Compute convex hull of all collected points
 *
 * Note: Returns convex hull approximation. Not exact for concave results.
 *
 * @private
 * @param {Array} subject - Subject polygon vertices
 * @param {Array} clip - Clipping polygon vertices
 * @returns {Array} Single result polygon or empty array
 */
function generalPolygonIntersection(subject, clip) {
  // Validate inputs are arrays (defensive check for internal function)
  if (!Array.isArray(subject) || !Array.isArray(clip)) {
    throw new Error(
      "generalPolygonIntersection: both arguments must be arrays",
    );
  }

  const intersectionPoints = [];

  // Find all edge intersection points
  for (let i = 0; i < subject.length; i++) {
    const s1 = subject[i];
    const s2 = subject[(i + 1) % subject.length];

    for (let j = 0; j < clip.length; j++) {
      const c1 = clip[j];
      const c2 = clip[(j + 1) % clip.length];

      const intersection = segmentIntersection(s1, s2, c1, c2);
      if (intersection) {
        intersectionPoints.push(point(intersection.x, intersection.y));
      }
    }
  }

  // Find subject vertices inside clip
  const subjectInside = subject.filter((p) => pointInPolygon(p, clip) >= 0);

  // Find clip vertices inside subject
  const clipInside = clip.filter((p) => pointInPolygon(p, subject) >= 0);

  // Collect all points
  const allPoints = [...intersectionPoints, ...subjectInside, ...clipInside];

  if (allPoints.length < 3) {
    return [];
  }

  // Remove duplicates
  const unique = removeDuplicatePoints(allPoints);

  if (unique.length < 3) {
    return [];
  }

  // Sort points to form a valid polygon (convex hull of intersection)
  const hull = convexHull(unique);

  return hull.length >= 3 ? [hull] : [];
}

/**
 * Remove duplicate points from an array using tolerance-based equality.
 *
 * Compares each point against already-accepted points using the
 * pointsEqual function with EPSILON tolerance.
 *
 * @private
 * @param {Array} points - Array of points to deduplicate
 * @returns {Array} Array with duplicates removed
 */
function removeDuplicatePoints(points) {
  // Validate points is an array (defensive check for internal function)
  if (!Array.isArray(points)) {
    throw new Error("removeDuplicatePoints: points must be an array");
  }

  const result = [];

  for (const p of points) {
    let isDuplicate = false;
    for (const r of result) {
      if (pointsEqual(p, r)) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(p);
    }
  }

  return result;
}

// ============================================================================
// Polygon Union
// ============================================================================

/**
 * Compute the union of two simple polygons using boundary tracing.
 *
 * Returns the combined region covered by either or both polygons.
 * Properly traces the outer boundary to produce correct non-convex results.
 *
 * Algorithm (Boundary Tracing):
 * 1. Quick optimization: if bounding boxes don't intersect, return both polygons
 * 2. Insert all edge-edge intersection points into both polygon vertex lists
 * 3. Start from a vertex guaranteed to be on the outer boundary
 * 4. Trace the boundary, always following the "outermost" path at intersections
 * 5. Return the traced polygon
 *
 * @param {Array} polygon1 - First polygon vertices [{x, y}, ...]
 * @param {Array} polygon2 - Second polygon vertices [{x, y}, ...]
 * @returns {Array<Array>} Array of result polygons
 *                         (one polygon if they overlap or are merged,
 *                          two polygons if separate)
 *
 * @example
 * // Two overlapping squares
 * const square1 = [point(0,0), point(2,0), point(2,2), point(0,2)];
 * const square2 = [point(1,1), point(3,1), point(3,3), point(1,3)];
 * const result = polygonUnion(square1, square2);
 * // Returns L-shaped combined region covering both squares
 *
 * @example
 * // Non-overlapping polygons
 * const square1 = [point(0,0), point(1,0), point(1,1), point(0,1)];
 * const square2 = [point(5,5), point(6,5), point(6,6), point(5,6)];
 * polygonUnion(square1, square2); // [square1, square2]
 */
export function polygonUnion(polygon1, polygon2) {
  // Validate inputs are arrays
  if (!Array.isArray(polygon1)) {
    throw new Error("polygonUnion: polygon1 must be an array");
  }
  if (!Array.isArray(polygon2)) {
    throw new Error("polygonUnion: polygon2 must be an array");
  }

  // Validate all polygon1 points have x and y properties
  for (let i = 0; i < polygon1.length; i++) {
    if (
      !polygon1[i] ||
      polygon1[i].x === null ||
      polygon1[i].x === undefined ||
      polygon1[i].y === null ||
      polygon1[i].y === undefined
    ) {
      throw new Error(
        `polygonUnion: polygon1[${i}] must have x and y properties`,
      );
    }
  }

  // Validate all polygon2 points have x and y properties
  for (let i = 0; i < polygon2.length; i++) {
    if (
      !polygon2[i] ||
      polygon2[i].x === null ||
      polygon2[i].x === undefined ||
      polygon2[i].y === null ||
      polygon2[i].y === undefined
    ) {
      throw new Error(
        `polygonUnion: polygon2[${i}] must have x and y properties`,
      );
    }
  }

  const poly1 = polygon1.map((p) => point(p.x, p.y));
  const poly2 = polygon2.map((p) => point(p.x, p.y));

  const bb1 = boundingBox(poly1);
  const bb2 = boundingBox(poly2);

  // If no overlap, return both polygons
  if (!bboxIntersects(bb1, bb2)) {
    return [poly1, poly2];
  }

  // Use boundary tracing for union
  return traceBoundaryUnion(poly1, poly2);
}

/**
 * Trace the outer boundary for polygon union.
 *
 * Uses a simpler approach: for union of two overlapping polygons,
 * trace the boundary staying on the "outside" of the combined shape.
 * At each intersection, switch to the other polygon.
 *
 * @private
 * @param {Array} poly1 - First polygon vertices
 * @param {Array} poly2 - Second polygon vertices
 * @returns {Array} Array containing result polygon(s)
 */
function traceBoundaryUnion(poly1, poly2) {
  // Validate inputs (defensive check for internal function)
  if (!Array.isArray(poly1) || !Array.isArray(poly2)) {
    throw new Error("traceBoundaryUnion: both arguments must be arrays");
  }

  // Find all intersection points with edge indices
  const intersections = findAllIntersections(poly1, poly2);

  // If no intersections, check containment
  if (intersections.length === 0) {
    // Check if one contains the other
    const p1Inside = pointInPolygon(poly1[0], poly2);
    const p2Inside = pointInPolygon(poly2[0], poly1);

    if (p1Inside > 0) {
      // poly1 is inside poly2
      return [poly2];
    } else if (p2Inside > 0) {
      // poly2 is inside poly1
      return [poly1];
    } else {
      // Disjoint - this shouldn't happen if bbox intersects
      // But they might just touch at a point
      return [poly1, poly2];
    }
  }

  // Build augmented polygons with intersection points inserted
  const aug1 = augmentPolygon(
    poly1,
    intersections.map((i) => ({
      edgeIndex: i.edge1,
      t: i.t1,
      point: i.point,
      intersectionId: i.id,
    })),
  );

  const aug2 = augmentPolygon(
    poly2,
    intersections.map((i) => ({
      edgeIndex: i.edge2,
      t: i.t2,
      point: i.point,
      intersectionId: i.id,
    })),
  );

  // Build lookup from intersection ID to indices in both polygons
  const intersectionMap = new Map();
  for (let i = 0; i < aug1.length; i++) {
    if (aug1[i].intersectionId !== undefined) {
      if (!intersectionMap.has(aug1[i].intersectionId)) {
        intersectionMap.set(aug1[i].intersectionId, {});
      }
      intersectionMap.get(aug1[i].intersectionId).idx1 = i;
    }
  }
  for (let i = 0; i < aug2.length; i++) {
    if (aug2[i].intersectionId !== undefined) {
      if (!intersectionMap.has(aug2[i].intersectionId)) {
        intersectionMap.set(aug2[i].intersectionId, {});
      }
      intersectionMap.get(aug2[i].intersectionId).idx2 = i;
    }
  }

  // Find starting point: a vertex that's outside the other polygon (guaranteed to be on outer boundary)
  let startPoly = 1;
  let startIdx = -1;

  for (let i = 0; i < aug1.length; i++) {
    const p = aug1[i];
    if (p.intersectionId === undefined && pointInPolygon(p, poly2) < 0) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // All poly1 vertices are inside poly2, start from poly2
    startPoly = 2;
    for (let i = 0; i < aug2.length; i++) {
      const p = aug2[i];
      if (p.intersectionId === undefined && pointInPolygon(p, poly1) < 0) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) {
    // Edge case: one polygon contains the other entirely
    const area1 = polygonArea(poly1).abs();
    const area2 = polygonArea(poly2).abs();
    return area1.gt(area2) ? [poly1] : [poly2];
  }

  // Trace the outer boundary
  // For union: at each intersection, switch to the other polygon
  // This works because the outer boundary alternates between the two polygons
  const result = [];
  let onPoly1 = startPoly === 1;
  let currentIdx = startIdx;
  const usedIntersections = new Set();
  // Increased iteration limit for complex polygons with many intersections
  const maxIterations = (aug1.length + aug2.length) * 3;
  let iterations = 0;
  const startKey = `${startPoly}-${startIdx}`;

  while (iterations < maxIterations) {
    iterations++;

    const aug = onPoly1 ? aug1 : aug2;
    const otherAug = onPoly1 ? aug2 : aug1;
    const vertex = aug[currentIdx];

    // Add vertex to result (avoid duplicates)
    if (
      result.length === 0 ||
      !pointsEqual(result[result.length - 1], vertex)
    ) {
      result.push(point(vertex.x, vertex.y));
    }

    // Move to next vertex
    const nextIdx = (currentIdx + 1) % aug.length;
    const nextVertex = aug[nextIdx];

    // If next vertex is an intersection we haven't used, switch polygons
    if (
      nextVertex.intersectionId !== undefined &&
      !usedIntersections.has(nextVertex.intersectionId)
    ) {
      // Add the intersection point
      result.push(point(nextVertex.x, nextVertex.y));
      usedIntersections.add(nextVertex.intersectionId);

      // Switch to other polygon
      const mapping = intersectionMap.get(nextVertex.intersectionId);
      const otherIdx = onPoly1 ? mapping.idx2 : mapping.idx1;
      onPoly1 = !onPoly1;
      currentIdx = (otherIdx + 1) % otherAug.length;
    } else {
      currentIdx = nextIdx;
    }

    // Check if we're back at start
    const currentKey = `${onPoly1 ? 1 : 2}-${currentIdx}`;
    if (currentKey === startKey) {
      break;
    }
  }

  // Remove the last point if it's the same as the first (closed polygon)
  if (result.length > 1 && pointsEqual(result[0], result[result.length - 1])) {
    result.pop();
  }

  return result.length >= 3 ? [result] : [];
}

/**
 * Find all intersection points between two polygons.
 *
 * @private
 * @param {Array} poly1 - First polygon
 * @param {Array} poly2 - Second polygon
 * @returns {Array} Array of intersection objects with edge indices and parameters
 */
function findAllIntersections(poly1, poly2) {
  // Validate inputs are arrays (defensive check for internal function)
  if (!Array.isArray(poly1) || !Array.isArray(poly2)) {
    throw new Error("findAllIntersections: both arguments must be arrays");
  }

  const intersections = [];
  let id = 0;

  for (let i = 0; i < poly1.length; i++) {
    const a = poly1[i];
    const b = poly1[(i + 1) % poly1.length];

    for (let j = 0; j < poly2.length; j++) {
      const c = poly2[j];
      const d = poly2[(j + 1) % poly2.length];

      const intersection = segmentIntersection(a, b, c, d);
      if (intersection) {
        intersections.push({
          id: id++,
          point: point(intersection.x, intersection.y),
          edge1: i,
          edge2: j,
          t1: intersection.t,
          t2: intersection.s,
        });
      }
    }
  }

  return intersections;
}

/**
 * Insert intersection points into polygon vertex list.
 *
 * @private
 * @param {Array} polygon - Original polygon vertices
 * @param {Array} insertions - Points to insert with edge index and t parameter
 * @returns {Array} Augmented polygon with intersection points inserted
 */
function augmentPolygon(polygon, insertions) {
  // Validate inputs (defensive check for internal function)
  if (!Array.isArray(polygon)) {
    throw new Error("augmentPolygon: polygon must be an array");
  }
  if (!Array.isArray(insertions)) {
    throw new Error("augmentPolygon: insertions must be an array");
  }

  // Group insertions by edge
  const byEdge = new Map();
  for (const ins of insertions) {
    if (!byEdge.has(ins.edgeIndex)) {
      byEdge.set(ins.edgeIndex, []);
    }
    byEdge.get(ins.edgeIndex).push(ins);
  }

  // Sort each edge's insertions by t parameter
  for (const edgeInsertions of byEdge.values()) {
    edgeInsertions.sort((a, b) => a.t.minus(b.t).toNumber());
  }

  // Build augmented polygon
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    // Add original vertex
    result.push({ ...polygon[i] });

    // Add intersection points for this edge
    if (byEdge.has(i)) {
      for (const ins of byEdge.get(i)) {
        result.push({
          x: ins.point.x,
          y: ins.point.y,
          intersectionId: ins.intersectionId,
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Polygon Difference
// ============================================================================

/**
 * Compute the difference of two polygons (polygon1 - polygon2).
 *
 * Returns the region(s) in polygon1 that are NOT covered by polygon2.
 * This is the "subtraction" operation in polygon boolean algebra.
 *
 * Algorithm (Boundary Tracing):
 * 1. Quick optimization: if bounding boxes don't intersect, return polygon1
 * 2. Insert all edge-edge intersection points into both polygon vertex lists
 * 3. Start from a polygon1 vertex that's outside polygon2
 * 4. Trace polygon1's boundary, switching to polygon2 (reversed) at intersections
 * 5. Return the traced polygon
 *
 * @param {Array} polygon1 - First polygon (subject) [{x, y}, ...]
 * @param {Array} polygon2 - Second polygon (to subtract) [{x, y}, ...]
 * @returns {Array<Array>} Array of result polygons (possibly empty)
 *
 * @example
 * // Subtract overlapping region
 * const square1 = [point(0,0), point(3,0), point(3,3), point(0,3)];
 * const square2 = [point(1,1), point(4,1), point(4,4), point(1,4)];
 * const result = polygonDifference(square1, square2);
 * // Returns L-shaped portion of square1 not covered by square2
 *
 * @example
 * // No overlap - return original
 * const square1 = [point(0,0), point(1,0), point(1,1), point(0,1)];
 * const square2 = [point(5,5), point(6,5), point(6,6), point(5,6)];
 * polygonDifference(square1, square2); // [square1]
 *
 * @example
 * // Complete coverage - return empty
 * const small = [point(1,1), point(2,1), point(2,2), point(1,2)];
 * const large = [point(0,0), point(3,0), point(3,3), point(0,3)];
 * polygonDifference(small, large); // []
 */
export function polygonDifference(polygon1, polygon2) {
  // Validate inputs are arrays
  if (!Array.isArray(polygon1)) {
    throw new Error("polygonDifference: polygon1 must be an array");
  }
  if (!Array.isArray(polygon2)) {
    throw new Error("polygonDifference: polygon2 must be an array");
  }

  // Validate all polygon1 points have x and y properties
  for (let i = 0; i < polygon1.length; i++) {
    if (
      !polygon1[i] ||
      polygon1[i].x === null ||
      polygon1[i].x === undefined ||
      polygon1[i].y === null ||
      polygon1[i].y === undefined
    ) {
      throw new Error(
        `polygonDifference: polygon1[${i}] must have x and y properties`,
      );
    }
  }

  // Validate all polygon2 points have x and y properties
  for (let i = 0; i < polygon2.length; i++) {
    if (
      !polygon2[i] ||
      polygon2[i].x === null ||
      polygon2[i].x === undefined ||
      polygon2[i].y === null ||
      polygon2[i].y === undefined
    ) {
      throw new Error(
        `polygonDifference: polygon2[${i}] must have x and y properties`,
      );
    }
  }

  const poly1 = polygon1.map((p) => point(p.x, p.y));
  const poly2 = polygon2.map((p) => point(p.x, p.y));

  const bb1 = boundingBox(poly1);
  const bb2 = boundingBox(poly2);

  // If no overlap, return original
  if (!bboxIntersects(bb1, bb2)) {
    return [poly1];
  }

  // Use boundary tracing for difference
  return traceBoundaryDifference(poly1, poly2);
}

/**
 * Trace the boundary for polygon difference (poly1 - poly2).
 *
 * Traces poly1's boundary, but when entering poly2, follows poly2's boundary
 * (in reverse) until exiting back to poly1's exterior.
 *
 * @private
 * @param {Array} poly1 - Subject polygon vertices
 * @param {Array} poly2 - Clipping polygon vertices (to subtract)
 * @returns {Array} Array containing result polygon(s)
 */
function traceBoundaryDifference(poly1, poly2) {
  // Validate inputs (defensive check for internal function)
  if (!Array.isArray(poly1) || !Array.isArray(poly2)) {
    throw new Error("traceBoundaryDifference: both arguments must be arrays");
  }

  // Find all intersection points with edge indices
  const intersections = findAllIntersections(poly1, poly2);

  // If no intersections, check containment
  if (intersections.length === 0) {
    // Check if poly1 is entirely inside poly2
    const p1Inside = pointInPolygon(poly1[0], poly2);

    if (p1Inside > 0) {
      // poly1 is completely inside poly2 - nothing remains
      return [];
    } else {
      // poly2 doesn't overlap poly1 - return original
      return [poly1];
    }
  }

  // Build augmented polygons with intersection points inserted
  const aug1 = augmentPolygon(
    poly1,
    intersections.map((i) => ({
      edgeIndex: i.edge1,
      t: i.t1,
      point: i.point,
      intersectionId: i.id,
    })),
  );

  const aug2 = augmentPolygon(
    poly2,
    intersections.map((i) => ({
      edgeIndex: i.edge2,
      t: i.t2,
      point: i.point,
      intersectionId: i.id,
    })),
  );

  // Build lookup from intersection ID to indices in both polygons
  const intersectionMap = new Map();
  for (let i = 0; i < aug1.length; i++) {
    if (aug1[i].intersectionId !== undefined) {
      if (!intersectionMap.has(aug1[i].intersectionId)) {
        intersectionMap.set(aug1[i].intersectionId, {});
      }
      intersectionMap.get(aug1[i].intersectionId).idx1 = i;
    }
  }
  for (let i = 0; i < aug2.length; i++) {
    if (aug2[i].intersectionId !== undefined) {
      if (!intersectionMap.has(aug2[i].intersectionId)) {
        intersectionMap.set(aug2[i].intersectionId, {});
      }
      intersectionMap.get(aug2[i].intersectionId).idx2 = i;
    }
  }

  // Find starting point: a poly1 vertex that's outside poly2
  let startIdx = -1;
  for (let i = 0; i < aug1.length; i++) {
    const p = aug1[i];
    if (p.intersectionId === undefined && pointInPolygon(p, poly2) < 0) {
      startIdx = i;
      break;
    }
  }

  // If all poly1 vertices are inside poly2, no difference remains
  if (startIdx === -1) {
    return [];
  }

  // Trace the difference boundary
  const result = [];
  let onPoly1 = true; // We start on poly1
  let currentIdx = startIdx;
  const visited = new Set();
  // Increased iteration limit for complex polygons with many intersections
  const maxIterations = (aug1.length + aug2.length) * 3;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const poly = onPoly1 ? aug1 : aug2;
    const vertex = poly[currentIdx];

    // Add vertex to result (avoid duplicates)
    if (
      result.length === 0 ||
      !pointsEqual(result[result.length - 1], vertex)
    ) {
      result.push(point(vertex.x, vertex.y));
    }

    // Check if we've completed the loop
    const key = `${onPoly1 ? 1 : 2}-${currentIdx}`;
    if (visited.has(key)) {
      break;
    }
    visited.add(key);

    if (onPoly1) {
      // On poly1, moving forward (CCW)
      const nextIdx = (currentIdx + 1) % aug1.length;
      const nextVertex = aug1[nextIdx];

      if (nextVertex.intersectionId !== undefined) {
        // Hit an intersection - check if we're entering or leaving poly2
        const afterNext = aug1[(nextIdx + 1) % aug1.length];
        const isEntering = pointInPolygon(afterNext, poly2) > 0;

        if (isEntering) {
          // Entering poly2 - switch to poly2 and go backwards (CW)
          const mapping = intersectionMap.get(nextVertex.intersectionId);
          result.push(point(nextVertex.x, nextVertex.y));
          onPoly1 = false;
          // Go backwards on poly2
          currentIdx = (mapping.idx2 - 1 + aug2.length) % aug2.length;
        } else {
          // Leaving poly2 (or just touching) - continue on poly1
          currentIdx = nextIdx;
        }
      } else {
        currentIdx = nextIdx;
      }
    } else {
      // On poly2, moving backward (CW) - this traces the "inside" boundary of the hole
      const nextIdx = (currentIdx - 1 + aug2.length) % aug2.length;
      const nextVertex = aug2[nextIdx];

      if (nextVertex.intersectionId !== undefined) {
        // Hit an intersection - switch back to poly1
        const mapping = intersectionMap.get(nextVertex.intersectionId);
        result.push(point(nextVertex.x, nextVertex.y));
        onPoly1 = true;
        // Continue forward on poly1 from the intersection
        currentIdx = (mapping.idx1 + 1) % aug1.length;
      } else {
        currentIdx = nextIdx;
      }
    }

    // Safety: check if we're back at start
    if (onPoly1 && currentIdx === startIdx) {
      break;
    }
  }

  // Remove the last point if it's the same as the first (closed polygon)
  if (result.length > 1 && pointsEqual(result[0], result[result.length - 1])) {
    result.pop();
  }

  return result.length >= 3 ? [result] : [];
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Primitives
  point,
  pointsEqual,
  cross,
  dot,
  sign,

  // Segment operations
  segmentIntersection,
  lineSegmentIntersection,

  // Point in polygon
  pointInPolygon,
  pointOnSegment,

  // Sutherland-Hodgman clipping
  clipPolygonSH,

  // Polygon properties
  polygonArea,
  isCounterClockwise,
  reversePolygon,
  ensureCCW,
  isConvex,

  // Convex hull
  convexHull,

  // Bounding box
  boundingBox,
  bboxIntersects,

  // Boolean operations
  polygonIntersection,
  polygonUnion,
  polygonDifference,

  // Constants
  EPSILON,
};
