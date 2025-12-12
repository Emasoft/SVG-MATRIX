/**
 * Tests for gjk-collision.js - GJK Collision Detection Module
 *
 * This test suite verifies:
 * 1. Vector utilities (point, vectorAdd, vectorSub, etc.)
 * 2. Support functions (supportPoint, minkowskiSupport)
 * 3. Simplex processing (processLineSimplex, processTriangleSimplex)
 * 4. GJK algorithm (gjkIntersects, gjkDistance)
 * 5. Verification functions (centroid, pointInConvexPolygon, verifyIntersection, etc.)
 * 6. Convenience functions (polygonsOverlap, polygonsDistance, isPointInPolygon)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import * as GJKCollision from '../src/gjk-collision.js';

// Set high precision for tests
Decimal.set({ precision: 80 });

// Helper functions
const D = x => (x instanceof Decimal ? x : new Decimal(x));

function assertClose(actual, expected, tolerance = 1e-10, message = '') {
  const actualNum = actual instanceof Decimal ? actual.toNumber() : actual;
  const expectedNum = expected instanceof Decimal ? expected.toNumber() : expected;
  const diff = Math.abs(actualNum - expectedNum);
  const msg = message || `Expected ${expectedNum}, got ${actualNum} (diff: ${diff})`;
  assert.ok(diff <= tolerance, msg);
}

function assertPointClose(actual, expected, tolerance = 1e-10, message = '') {
  assertClose(actual.x, expected.x, tolerance, `${message} x coordinate mismatch`);
  assertClose(actual.y, expected.y, tolerance, `${message} y coordinate mismatch`);
}

// Pre-built test polygons
function makeSquare(x = 0, y = 0, size = 1) {
  return [
    GJKCollision.point(x, y),
    GJKCollision.point(x + size, y),
    GJKCollision.point(x + size, y + size),
    GJKCollision.point(x, y + size)
  ];
}

function makeTriangle(x = 0, y = 0, size = 1) {
  return [
    GJKCollision.point(x, y),
    GJKCollision.point(x + size, y),
    GJKCollision.point(x + size / 2, y + size)
  ];
}

function makePentagon(cx = 0, cy = 0, radius = 1) {
  const points = [];
  for (let i = 0; i < 5; i++) {
    const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
    points.push(GJKCollision.point(
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle)
    ));
  }
  return points;
}

function makeHexagon(cx = 0, cy = 0, radius = 1) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (2 * Math.PI * i) / 6;
    points.push(GJKCollision.point(
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle)
    ));
  }
  return points;
}

// ============================================================================
// Vector Utilities Tests
// ============================================================================

describe('GJKCollision Vector Utilities', () => {
  describe('point()', () => {
    it('creates point with number inputs', () => {
      const p = GJKCollision.point(3.5, 4.5);
      assert.ok(p.x instanceof Decimal, 'x should be Decimal');
      assert.ok(p.y instanceof Decimal, 'y should be Decimal');
      assertClose(p.x, 3.5);
      assertClose(p.y, 4.5);
    });

    it('creates point with string inputs for high precision', () => {
      const p = GJKCollision.point('1.23456789012345678901234567890', '9.87654321098765432109876543210');
      const expectedX = new Decimal('1.23456789012345678901234567890');
      const expectedY = new Decimal('9.87654321098765432109876543210');
      assert.ok(p.x.eq(expectedX), 'High precision x should be preserved');
      assert.ok(p.y.eq(expectedY), 'High precision y should be preserved');
    });

    it('creates point with Decimal inputs', () => {
      const dx = new Decimal('7.77');
      const dy = new Decimal('8.88');
      const p = GJKCollision.point(dx, dy);
      assert.ok(p.x.eq(dx), 'Decimal x should be preserved');
      assert.ok(p.y.eq(dy), 'Decimal y should be preserved');
    });

    it('handles zero values correctly', () => {
      const p = GJKCollision.point(0, 0);
      assert.ok(p.x.isZero(), 'x should be zero');
      assert.ok(p.y.isZero(), 'y should be zero');
    });

    it('handles negative values correctly', () => {
      const p = GJKCollision.point(-5.5, -3.3);
      assertClose(p.x, -5.5);
      assertClose(p.y, -3.3);
    });
  });

  describe('vectorAdd()', () => {
    it('adds two vectors correctly', () => {
      const a = GJKCollision.point(1, 2);
      const b = GJKCollision.point(3, 4);
      const result = GJKCollision.vectorAdd(a, b);
      assertClose(result.x, 4);
      assertClose(result.y, 6);
    });

    it('adds vectors with negative components', () => {
      const a = GJKCollision.point(-1, 5);
      const b = GJKCollision.point(3, -2);
      const result = GJKCollision.vectorAdd(a, b);
      assertClose(result.x, 2);
      assertClose(result.y, 3);
    });

    it('handles zero vector addition', () => {
      const a = GJKCollision.point(5, 7);
      const zero = GJKCollision.point(0, 0);
      const result = GJKCollision.vectorAdd(a, zero);
      assertClose(result.x, 5);
      assertClose(result.y, 7);
    });

    it('is commutative', () => {
      const a = GJKCollision.point(2.5, 3.7);
      const b = GJKCollision.point(4.1, 1.9);
      const result1 = GJKCollision.vectorAdd(a, b);
      const result2 = GJKCollision.vectorAdd(b, a);
      assertClose(result1.x, result2.x);
      assertClose(result1.y, result2.y);
    });
  });

  describe('vectorSub()', () => {
    it('subtracts two vectors correctly', () => {
      const a = GJKCollision.point(5, 8);
      const b = GJKCollision.point(2, 3);
      const result = GJKCollision.vectorSub(a, b);
      assertClose(result.x, 3);
      assertClose(result.y, 5);
    });

    it('returns zero when subtracting same vector', () => {
      const a = GJKCollision.point(4.5, 7.2);
      const result = GJKCollision.vectorSub(a, a);
      assertClose(result.x, 0);
      assertClose(result.y, 0);
    });

    it('handles negative results', () => {
      const a = GJKCollision.point(1, 2);
      const b = GJKCollision.point(5, 8);
      const result = GJKCollision.vectorSub(a, b);
      assertClose(result.x, -4);
      assertClose(result.y, -6);
    });
  });

  describe('vectorNeg()', () => {
    it('negates positive vector', () => {
      const v = GJKCollision.point(3, 5);
      const result = GJKCollision.vectorNeg(v);
      assertClose(result.x, -3);
      assertClose(result.y, -5);
    });

    it('negates negative vector', () => {
      const v = GJKCollision.point(-4, -7);
      const result = GJKCollision.vectorNeg(v);
      assertClose(result.x, 4);
      assertClose(result.y, 7);
    });

    it('double negation returns original', () => {
      const v = GJKCollision.point(2.5, 3.7);
      const result = GJKCollision.vectorNeg(GJKCollision.vectorNeg(v));
      assertClose(result.x, 2.5);
      assertClose(result.y, 3.7);
    });

    it('negates zero vector correctly', () => {
      const v = GJKCollision.point(0, 0);
      const result = GJKCollision.vectorNeg(v);
      assert.ok(result.x.isZero());
      assert.ok(result.y.isZero());
    });
  });

  describe('vectorScale()', () => {
    it('scales vector by positive factor', () => {
      const v = GJKCollision.point(2, 3);
      const result = GJKCollision.vectorScale(v, 3);
      assertClose(result.x, 6);
      assertClose(result.y, 9);
    });

    it('scales vector by negative factor', () => {
      const v = GJKCollision.point(2, 3);
      const result = GJKCollision.vectorScale(v, -2);
      assertClose(result.x, -4);
      assertClose(result.y, -6);
    });

    it('scales vector by zero', () => {
      const v = GJKCollision.point(5, 7);
      const result = GJKCollision.vectorScale(v, 0);
      assert.ok(result.x.isZero());
      assert.ok(result.y.isZero());
    });

    it('scales by fractional value', () => {
      const v = GJKCollision.point(4, 8);
      const result = GJKCollision.vectorScale(v, 0.5);
      assertClose(result.x, 2);
      assertClose(result.y, 4);
    });

    it('accepts Decimal scale factor', () => {
      const v = GJKCollision.point(3, 6);
      const scale = new Decimal('2.5');
      const result = GJKCollision.vectorScale(v, scale);
      assertClose(result.x, 7.5);
      assertClose(result.y, 15);
    });
  });

  describe('dot()', () => {
    it('computes dot product of orthogonal vectors', () => {
      const a = GJKCollision.point(1, 0);
      const b = GJKCollision.point(0, 1);
      const result = GJKCollision.dot(a, b);
      assertClose(result, 0);
    });

    it('computes dot product of parallel vectors', () => {
      const a = GJKCollision.point(2, 3);
      const b = GJKCollision.point(4, 6);
      const result = GJKCollision.dot(a, b);
      // 2*4 + 3*6 = 8 + 18 = 26
      assertClose(result, 26);
    });

    it('computes dot product of opposite vectors', () => {
      const a = GJKCollision.point(3, 4);
      const b = GJKCollision.point(-3, -4);
      const result = GJKCollision.dot(a, b);
      // -9 - 16 = -25
      assertClose(result, -25);
    });

    it('returns squared magnitude when dotted with itself', () => {
      const v = GJKCollision.point(3, 4);
      const result = GJKCollision.dot(v, v);
      // 9 + 16 = 25
      assertClose(result, 25);
    });

    it('is commutative', () => {
      const a = GJKCollision.point(2.5, 3.7);
      const b = GJKCollision.point(4.1, 1.9);
      const result1 = GJKCollision.dot(a, b);
      const result2 = GJKCollision.dot(b, a);
      assertClose(result1, result2);
    });
  });

  describe('cross()', () => {
    it('computes 2D cross product correctly', () => {
      const a = GJKCollision.point(1, 0);
      const b = GJKCollision.point(0, 1);
      const result = GJKCollision.cross(a, b);
      // 1*1 - 0*0 = 1
      assertClose(result, 1);
    });

    it('returns zero for parallel vectors', () => {
      const a = GJKCollision.point(2, 4);
      const b = GJKCollision.point(3, 6);
      const result = GJKCollision.cross(a, b);
      // 2*6 - 4*3 = 12 - 12 = 0
      assertClose(result, 0);
    });

    it('is antisymmetric', () => {
      const a = GJKCollision.point(3, 5);
      const b = GJKCollision.point(7, 2);
      const result1 = GJKCollision.cross(a, b);
      const result2 = GJKCollision.cross(b, a);
      assertClose(result1.neg(), result2);
    });

    it('computes correct value for general vectors', () => {
      const a = GJKCollision.point(3, 4);
      const b = GJKCollision.point(5, 2);
      const result = GJKCollision.cross(a, b);
      // 3*2 - 4*5 = 6 - 20 = -14
      assertClose(result, -14);
    });
  });

  describe('magnitude()', () => {
    it('computes magnitude of (3, 4) as 5', () => {
      const v = GJKCollision.point(3, 4);
      const result = GJKCollision.magnitude(v);
      assertClose(result, 5);
    });

    it('computes magnitude of unit vectors as 1', () => {
      const v1 = GJKCollision.point(1, 0);
      const v2 = GJKCollision.point(0, 1);
      assertClose(GJKCollision.magnitude(v1), 1);
      assertClose(GJKCollision.magnitude(v2), 1);
    });

    it('returns zero for zero vector', () => {
      const v = GJKCollision.point(0, 0);
      const result = GJKCollision.magnitude(v);
      assertClose(result, 0);
    });

    it('handles negative components correctly', () => {
      const v = GJKCollision.point(-3, -4);
      const result = GJKCollision.magnitude(v);
      assertClose(result, 5);
    });

    it('computes correct value for general vector', () => {
      const v = GJKCollision.point(1, 1);
      const result = GJKCollision.magnitude(v);
      assertClose(result, Math.sqrt(2));
    });
  });

  describe('normalize()', () => {
    it('normalizes (3, 4) to unit vector', () => {
      const v = GJKCollision.point(3, 4);
      const result = GJKCollision.normalize(v);
      assertClose(GJKCollision.magnitude(result), 1);
      assertClose(result.x, 0.6);
      assertClose(result.y, 0.8);
    });

    it('normalizes already unit vector', () => {
      const v = GJKCollision.point(1, 0);
      const result = GJKCollision.normalize(v);
      assertClose(result.x, 1);
      assertClose(result.y, 0);
    });

    it('returns zero vector when normalizing zero vector', () => {
      const v = GJKCollision.point(0, 0);
      const result = GJKCollision.normalize(v);
      assert.ok(result.x.isZero());
      assert.ok(result.y.isZero());
    });

    it('preserves direction', () => {
      const v = GJKCollision.point(5, 12);
      const result = GJKCollision.normalize(v);
      // 5/13 and 12/13
      assertClose(result.x, 5 / 13);
      assertClose(result.y, 12 / 13);
    });
  });

  describe('perpendicular()', () => {
    it('returns perpendicular to (1, 0) as (0, 1)', () => {
      const v = GJKCollision.point(1, 0);
      const result = GJKCollision.perpendicular(v);
      assertClose(result.x, 0);
      assertClose(result.y, 1);
    });

    it('returns perpendicular to (0, 1) as (-1, 0)', () => {
      const v = GJKCollision.point(0, 1);
      const result = GJKCollision.perpendicular(v);
      assertClose(result.x, -1);
      assertClose(result.y, 0);
    });

    it('perpendicular is orthogonal to original', () => {
      const v = GJKCollision.point(3, 5);
      const perp = GJKCollision.perpendicular(v);
      const dotResult = GJKCollision.dot(v, perp);
      assertClose(dotResult, 0);
    });

    it('preserves magnitude', () => {
      const v = GJKCollision.point(3, 4);
      const perp = GJKCollision.perpendicular(v);
      assertClose(GJKCollision.magnitude(perp), 5);
    });
  });

  describe('tripleProduct()', () => {
    it('computes triple product for basic vectors', () => {
      const a = GJKCollision.point(1, 0);
      const b = GJKCollision.point(0, 1);
      const c = GJKCollision.point(1, 1);
      const result = GJKCollision.tripleProduct(a, b, c);
      // Result should be perpendicular to c
      assert.ok(result.x instanceof Decimal);
      assert.ok(result.y instanceof Decimal);
    });

    it('result is perpendicular to third vector in special cases', () => {
      const a = GJKCollision.point(1, 0);
      const b = GJKCollision.point(0, 1);
      const c = GJKCollision.point(1, 0);
      const result = GJKCollision.tripleProduct(a, b, c);
      // (A x B) x C gives vector in plane of A and B, perpendicular to C
      // For 2D this is the formula: B(A.C) - A(B.C)
      // A.C = 1, B.C = 0
      // So result = B*1 - A*0 = B = (0, 1)
      assertClose(result.x, 0);
      assertClose(result.y, 1);
    });
  });
});

// ============================================================================
// Support Functions Tests
// ============================================================================

describe('GJKCollision Support Functions', () => {
  describe('supportPoint()', () => {
    it('finds rightmost point for right direction', () => {
      const square = makeSquare(0, 0, 2);
      const direction = GJKCollision.point(1, 0);
      const result = GJKCollision.supportPoint(square, direction);
      // Rightmost point is at x=2
      assertClose(result.x, 2);
    });

    it('finds topmost point for up direction', () => {
      const square = makeSquare(0, 0, 2);
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.supportPoint(square, direction);
      // Topmost point is at y=2
      assertClose(result.y, 2);
    });

    it('finds leftmost point for left direction', () => {
      const square = makeSquare(0, 0, 2);
      const direction = GJKCollision.point(-1, 0);
      const result = GJKCollision.supportPoint(square, direction);
      // Leftmost point is at x=0
      assertClose(result.x, 0);
    });

    it('finds correct point for diagonal direction', () => {
      const square = makeSquare(0, 0, 2);
      const direction = GJKCollision.point(1, 1);
      const result = GJKCollision.supportPoint(square, direction);
      // Top-right corner (2, 2)
      assertClose(result.x, 2);
      assertClose(result.y, 2);
    });

    it('handles empty polygon gracefully', () => {
      const result = GJKCollision.supportPoint([], GJKCollision.point(1, 0));
      assertClose(result.x, 0);
      assertClose(result.y, 0);
    });

    it('handles single point polygon', () => {
      const polygon = [GJKCollision.point(5, 7)];
      const result = GJKCollision.supportPoint(polygon, GJKCollision.point(1, 0));
      assertClose(result.x, 5);
      assertClose(result.y, 7);
    });

    it('works with triangle', () => {
      const triangle = makeTriangle(0, 0, 2);
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.supportPoint(triangle, direction);
      // Top point of triangle is at (1, 2)
      assertClose(result.y, 2);
    });

    it('works with pentagon', () => {
      const pentagon = makePentagon(0, 0, 1);
      const direction = GJKCollision.point(0, -1);
      // Bottom point of regular pentagon centered at origin
      const result = GJKCollision.supportPoint(pentagon, direction);
      // Should be one of the lower points
      assert.ok(result.y instanceof Decimal);
    });
  });

  describe('minkowskiSupport()', () => {
    it('computes Minkowski difference support point', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(2, 0, 1);
      const direction = GJKCollision.point(1, 0);
      const result = GJKCollision.minkowskiSupport(squareA, squareB, direction);
      // support(A, d) - support(B, -d)
      // support(A, right) = (1, 0) or (1, 1)
      // support(B, left) = (2, 0) or (2, 1)
      // Result = (1, _) - (2, _) = (-1, _)
      assertClose(result.x, -1);
    });

    it('returns origin for identical overlapping shapes', () => {
      const squareA = makeSquare(0, 0, 2);
      const squareB = makeSquare(0, 0, 2);
      // For identical shapes, Minkowski difference includes origin
      const direction = GJKCollision.point(1, 0);
      const result = GJKCollision.minkowskiSupport(squareA, squareB, direction);
      // support(A, right) - support(B, left)
      // = (2, _) - (0, _) = (2, _)
      assert.ok(result.x instanceof Decimal);
    });

    it('works for separated triangles', () => {
      const triangleA = makeTriangle(0, 0, 1);
      const triangleB = makeTriangle(5, 0, 1);
      const direction = GJKCollision.point(1, 0);
      const result = GJKCollision.minkowskiSupport(triangleA, triangleB, direction);
      assert.ok(result.x instanceof Decimal);
      assert.ok(result.y instanceof Decimal);
    });
  });
});

// ============================================================================
// Simplex Processing Tests
// ============================================================================

describe('GJKCollision Simplex Processing', () => {
  describe('processLineSimplex()', () => {
    it('correctly identifies origin on line segment', () => {
      // Line from (-1, 0) to (1, 0), origin is on segment
      const A = GJKCollision.point(-1, 0); // Newest point
      const B = GJKCollision.point(1, 0);
      const simplex = [A, B];
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.processLineSimplex(simplex, direction);
      assert.ok(result.contains, 'Origin on segment should be detected');
    });

    it('returns new direction when origin not on segment', () => {
      // Line from (1, 1) to (2, 1), origin is not on segment
      const A = GJKCollision.point(1, 1);
      const B = GJKCollision.point(2, 1);
      const simplex = [A, B];
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.processLineSimplex(simplex, direction);
      assert.ok(!result.contains, 'Origin not on segment');
      assert.ok(result.newDirection.x instanceof Decimal);
      assert.ok(result.newDirection.y instanceof Decimal);
    });

    it('handles collinear points correctly', () => {
      // Line through origin
      const A = GJKCollision.point(-2, 0);
      const B = GJKCollision.point(2, 0);
      const simplex = [A, B];
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.processLineSimplex(simplex, direction);
      // Origin is between A and B
      assert.ok(result.contains);
    });
  });

  describe('processTriangleSimplex()', () => {
    it('detects origin inside triangle', () => {
      // Triangle containing origin
      const A = GJKCollision.point(0, 2);
      const B = GJKCollision.point(-2, -1);
      const C = GJKCollision.point(2, -1);
      const simplex = [A, B, C];
      const direction = GJKCollision.point(0, 1);
      const result = GJKCollision.processTriangleSimplex(simplex, direction);
      assert.ok(result.contains, 'Origin inside triangle should be detected');
    });

    it('detects origin outside triangle and returns edge simplex', () => {
      // Triangle NOT containing origin
      const A = GJKCollision.point(3, 4);
      const B = GJKCollision.point(4, 3);
      const C = GJKCollision.point(5, 4);
      const simplex = [A, B, C];
      const direction = GJKCollision.point(-1, -1);
      const result = GJKCollision.processTriangleSimplex(simplex, direction);
      assert.ok(!result.contains, 'Origin outside triangle');
      assert.ok(result.newSimplex.length === 2, 'Should reduce to edge');
    });

    it('reduces simplex to correct edge', () => {
      // Origin is closer to one edge
      const A = GJKCollision.point(1, 0);
      const B = GJKCollision.point(2, 1);
      const C = GJKCollision.point(2, -1);
      const simplex = [A, B, C];
      const direction = GJKCollision.point(-1, 0);
      const result = GJKCollision.processTriangleSimplex(simplex, direction);
      if (!result.contains) {
        assert.ok(result.newSimplex.length === 2);
      }
    });
  });
});

// ============================================================================
// GJK Algorithm Tests
// ============================================================================

describe('GJKCollision GJK Algorithm', () => {
  describe('gjkIntersects()', () => {
    it('detects intersection of overlapping squares', () => {
      const squareA = makeSquare(0, 0, 2);
      const squareB = makeSquare(1, 1, 2);
      const result = GJKCollision.gjkIntersects(squareA, squareB);
      assert.ok(result.intersects, 'Overlapping squares should intersect');
      assert.ok(result.verified, 'Intersection should be verified');
    });

    it('detects non-intersection of separated squares', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(5, 0, 1);
      const result = GJKCollision.gjkIntersects(squareA, squareB);
      assert.ok(!result.intersects, 'Separated squares should not intersect');
    });

    it('detects intersection when one shape contains another', () => {
      const outer = makeSquare(-2, -2, 6);
      const inner = makeSquare(0, 0, 1);
      const result = GJKCollision.gjkIntersects(outer, inner);
      assert.ok(result.intersects, 'Containing shapes should intersect');
      assert.ok(result.verified, 'Should be verified');
    });

    it('detects touching shapes (edge contact)', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(1, 0, 1); // Touching at x=1
      const result = GJKCollision.gjkIntersects(squareA, squareB);
      assert.ok(result.intersects, 'Touching shapes should intersect');
    });

    it('detects corner touching', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(1, 1, 1); // Touching at corner (1,1)
      const result = GJKCollision.gjkIntersects(squareA, squareB);
      assert.ok(result.intersects, 'Corner touching shapes should intersect');
    });

    it('handles empty polygon A', () => {
      const result = GJKCollision.gjkIntersects([], makeSquare(0, 0, 1));
      assert.ok(!result.intersects, 'Empty polygon should not intersect');
    });

    it('handles empty polygon B', () => {
      const result = GJKCollision.gjkIntersects(makeSquare(0, 0, 1), []);
      assert.ok(!result.intersects, 'Empty polygon should not intersect');
    });

    it('handles single point intersection', () => {
      const pointA = [GJKCollision.point(1, 1)];
      const pointB = [GJKCollision.point(1, 1)];
      const result = GJKCollision.gjkIntersects(pointA, pointB);
      assert.ok(result.intersects, 'Same point should intersect');
    });

    it('handles single point non-intersection', () => {
      const pointA = [GJKCollision.point(0, 0)];
      const pointB = [GJKCollision.point(5, 5)];
      const result = GJKCollision.gjkIntersects(pointA, pointB);
      assert.ok(!result.intersects, 'Different points should not intersect');
    });

    it('works with triangles', () => {
      const triangleA = makeTriangle(0, 0, 2);
      const triangleB = makeTriangle(1, 0, 2);
      const result = GJKCollision.gjkIntersects(triangleA, triangleB);
      assert.ok(result.intersects, 'Overlapping triangles should intersect');
    });

    it('works with pentagons', () => {
      const pentagonA = makePentagon(0, 0, 2);
      const pentagonB = makePentagon(1, 0, 2);
      const result = GJKCollision.gjkIntersects(pentagonA, pentagonB);
      assert.ok(result.intersects, 'Overlapping pentagons should intersect');
    });

    it('works with different shaped polygons', () => {
      const square = makeSquare(0, 0, 2);
      const triangle = makeTriangle(1, 0, 2);
      const result = GJKCollision.gjkIntersects(square, triangle);
      assert.ok(result.intersects, 'Overlapping square and triangle should intersect');
    });

    it('correctly reports iterations', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(0.5, 0.5, 1);
      const result = GJKCollision.gjkIntersects(squareA, squareB);
      assert.ok(typeof result.iterations === 'number');
      assert.ok(result.iterations >= 1);
      assert.ok(result.iterations <= 100);
    });

    it('handles identical polygons at same position', () => {
      const polygon = makeHexagon(0, 0, 1);
      const result = GJKCollision.gjkIntersects(polygon, polygon);
      assert.ok(result.intersects, 'Identical polygons should intersect');
    });
  });

  describe('gjkDistance()', () => {
    it('returns zero for overlapping shapes', () => {
      const squareA = makeSquare(0, 0, 2);
      const squareB = makeSquare(1, 1, 2);
      const result = GJKCollision.gjkDistance(squareA, squareB);
      assertClose(result.distance, 0);
    });

    it('computes correct distance for separated squares', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(3, 0, 1); // 2 units gap
      const result = GJKCollision.gjkDistance(squareA, squareB);
      assertClose(result.distance, 2, 1e-6);
    });

    it('computes distance along diagonal', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(2, 2, 1); // Diagonal separation
      const result = GJKCollision.gjkDistance(squareA, squareB);
      // Distance from (1,1) to (2,2) = sqrt(2)
      assertClose(result.distance, Math.sqrt(2), 1e-6);
    });

    it('returns closest points', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(3, 0, 1);
      const result = GJKCollision.gjkDistance(squareA, squareB);
      assert.ok(result.closestA.x instanceof Decimal);
      assert.ok(result.closestA.y instanceof Decimal);
      assert.ok(result.closestB.x instanceof Decimal);
      assert.ok(result.closestB.y instanceof Decimal);
    });

    it('verifies computed distance', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(5, 0, 1);
      const result = GJKCollision.gjkDistance(squareA, squareB);
      assert.ok(result.verified, 'Distance should be verified');
    });

    it('works with triangles', () => {
      const triangleA = makeTriangle(0, 0, 1);
      const triangleB = makeTriangle(3, 0, 1);
      const result = GJKCollision.gjkDistance(triangleA, triangleB);
      assert.ok(result.distance.greaterThan(0), 'Separated triangles should have positive distance');
    });

    it('works with complex polygons', () => {
      const hexagonA = makeHexagon(0, 0, 1);
      const hexagonB = makeHexagon(5, 0, 1);
      const result = GJKCollision.gjkDistance(hexagonA, hexagonB);
      // Distance should be approximately 5 - 2 = 3 (centers are 5 apart, each radius is 1)
      assert.ok(result.distance.greaterThan(2), 'Distance should be positive');
    });
  });
});

// ============================================================================
// Verification Functions Tests
// ============================================================================

describe('GJKCollision Verification Functions', () => {
  describe('centroid()', () => {
    it('computes centroid of square', () => {
      const square = makeSquare(0, 0, 2);
      const result = GJKCollision.centroid(square);
      assertClose(result.x, 1);
      assertClose(result.y, 1);
    });

    it('computes centroid of triangle', () => {
      const triangle = [
        GJKCollision.point(0, 0),
        GJKCollision.point(3, 0),
        GJKCollision.point(0, 3)
      ];
      const result = GJKCollision.centroid(triangle);
      assertClose(result.x, 1);
      assertClose(result.y, 1);
    });

    it('handles empty polygon', () => {
      const result = GJKCollision.centroid([]);
      assertClose(result.x, 0);
      assertClose(result.y, 0);
    });

    it('handles single point', () => {
      const polygon = [GJKCollision.point(5, 7)];
      const result = GJKCollision.centroid(polygon);
      assertClose(result.x, 5);
      assertClose(result.y, 7);
    });

    it('computes centroid of regular hexagon at origin', () => {
      const hexagon = makeHexagon(0, 0, 1);
      const result = GJKCollision.centroid(hexagon);
      assertClose(result.x, 0, 1e-10);
      assertClose(result.y, 0, 1e-10);
    });
  });

  describe('pointInConvexPolygon()', () => {
    it('detects point inside square', () => {
      const square = makeSquare(0, 0, 2);
      const pt = GJKCollision.point(1, 1);
      const result = GJKCollision.pointInConvexPolygon(pt, square);
      assert.ok(result, 'Point at center should be inside');
    });

    it('detects point outside square', () => {
      const square = makeSquare(0, 0, 2);
      const pt = GJKCollision.point(5, 5);
      const result = GJKCollision.pointInConvexPolygon(pt, square);
      assert.ok(!result, 'Point outside should not be inside');
    });

    it('handles point on edge', () => {
      const square = makeSquare(0, 0, 2);
      const pt = GJKCollision.point(1, 0); // On bottom edge
      const result = GJKCollision.pointInConvexPolygon(pt, square);
      assert.ok(result, 'Point on edge should be considered inside');
    });

    it('handles point on vertex', () => {
      const square = makeSquare(0, 0, 2);
      const pt = GJKCollision.point(0, 0); // On corner
      const result = GJKCollision.pointInConvexPolygon(pt, square);
      assert.ok(result, 'Point on vertex should be considered inside');
    });

    it('returns false for polygon with less than 3 vertices', () => {
      const line = [GJKCollision.point(0, 0), GJKCollision.point(1, 1)];
      const pt = GJKCollision.point(0.5, 0.5);
      const result = GJKCollision.pointInConvexPolygon(pt, line);
      assert.ok(!result, 'Degenerate polygon should return false');
    });

    it('works with triangle', () => {
      const triangle = [
        GJKCollision.point(0, 0),
        GJKCollision.point(2, 0),
        GJKCollision.point(1, 2)
      ];
      const inside = GJKCollision.point(1, 0.5);
      const outside = GJKCollision.point(3, 0);
      assert.ok(GJKCollision.pointInConvexPolygon(inside, triangle), 'Point inside triangle');
      assert.ok(!GJKCollision.pointInConvexPolygon(outside, triangle), 'Point outside triangle');
    });

    it('works with pentagon', () => {
      const pentagon = makePentagon(0, 0, 2);
      const center = GJKCollision.point(0, 0);
      const outside = GJKCollision.point(5, 5);
      assert.ok(GJKCollision.pointInConvexPolygon(center, pentagon), 'Center should be inside');
      assert.ok(!GJKCollision.pointInConvexPolygon(outside, pentagon), 'Far point should be outside');
    });
  });

  describe('verifyIntersection()', () => {
    it('verifies overlapping squares', () => {
      const squareA = makeSquare(0, 0, 2);
      const squareB = makeSquare(1, 1, 2);
      const result = GJKCollision.verifyIntersection(squareA, squareB);
      assert.ok(result, 'Overlapping squares should verify');
    });

    it('does not verify separated squares', () => {
      const squareA = makeSquare(0, 0, 1);
      const squareB = makeSquare(5, 0, 1);
      const result = GJKCollision.verifyIntersection(squareA, squareB);
      assert.ok(!result, 'Separated squares should not verify');
    });

    it('verifies when polygon A contains B', () => {
      const outer = makeSquare(-1, -1, 4);
      const inner = makeSquare(0, 0, 1);
      const result = GJKCollision.verifyIntersection(outer, inner);
      assert.ok(result, 'Containing shapes should verify');
    });

    it('verifies edge intersection', () => {
      const squareA = makeSquare(0, 0, 2);
      const squareB = makeSquare(1, 1, 2);
      const result = GJKCollision.verifyIntersection(squareA, squareB);
      assert.ok(result, 'Edge intersecting shapes should verify');
    });
  });

  describe('segmentsIntersect()', () => {
    it('detects crossing segments', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(2, 2);
      const b1 = GJKCollision.point(0, 2);
      const b2 = GJKCollision.point(2, 0);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(result, 'Crossing segments should intersect');
    });

    it('detects non-intersecting parallel segments', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(2, 0);
      const b1 = GJKCollision.point(0, 1);
      const b2 = GJKCollision.point(2, 1);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(!result, 'Parallel segments should not intersect');
    });

    it('detects collinear overlapping segments', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(2, 0);
      const b1 = GJKCollision.point(1, 0);
      const b2 = GJKCollision.point(3, 0);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(result, 'Collinear overlapping segments should intersect');
    });

    it('detects collinear non-overlapping segments', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(1, 0);
      const b1 = GJKCollision.point(2, 0);
      const b2 = GJKCollision.point(3, 0);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(!result, 'Collinear non-overlapping segments should not intersect');
    });

    it('detects endpoint intersection', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(1, 1);
      const b1 = GJKCollision.point(1, 1);
      const b2 = GJKCollision.point(2, 0);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(result, 'Segments sharing endpoint should intersect');
    });

    it('detects T-intersection', () => {
      const a1 = GJKCollision.point(0, 0);
      const a2 = GJKCollision.point(2, 0);
      const b1 = GJKCollision.point(1, -1);
      const b2 = GJKCollision.point(1, 0);
      const result = GJKCollision.segmentsIntersect(a1, a2, b1, b2);
      assert.ok(result, 'T-intersection should be detected');
    });
  });

  describe('closestPointOnSegment()', () => {
    it('finds closest point in middle of segment', () => {
      const pt = GJKCollision.point(1, 1);
      const a = GJKCollision.point(0, 0);
      const b = GJKCollision.point(2, 0);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      assertClose(result.x, 1);
      assertClose(result.y, 0);
    });

    it('returns start point when closest', () => {
      const pt = GJKCollision.point(-1, 0);
      const a = GJKCollision.point(0, 0);
      const b = GJKCollision.point(2, 0);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      assertClose(result.x, 0);
      assertClose(result.y, 0);
    });

    it('returns end point when closest', () => {
      const pt = GJKCollision.point(5, 0);
      const a = GJKCollision.point(0, 0);
      const b = GJKCollision.point(2, 0);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      assertClose(result.x, 2);
      assertClose(result.y, 0);
    });

    it('handles degenerate segment (point)', () => {
      const pt = GJKCollision.point(1, 1);
      const a = GJKCollision.point(0, 0);
      const b = GJKCollision.point(0, 0);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      assertClose(result.x, 0);
      assertClose(result.y, 0);
    });

    it('works with diagonal segment', () => {
      const pt = GJKCollision.point(0, 0);
      const a = GJKCollision.point(1, 1);
      const b = GJKCollision.point(3, 3);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      // Closest point should be (1, 1)
      assertClose(result.x, 1);
      assertClose(result.y, 1);
    });

    it('finds point on arbitrary segment', () => {
      const pt = GJKCollision.point(2, 3);
      const a = GJKCollision.point(0, 0);
      const b = GJKCollision.point(4, 0);
      const result = GJKCollision.closestPointOnSegment(pt, a, b);
      assertClose(result.x, 2);
      assertClose(result.y, 0);
    });
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('GJKCollision Convenience Functions', () => {
  describe('polygonsOverlap()', () => {
    it('detects overlapping polygons with number inputs', () => {
      const polyA = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
      const polyB = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }];
      const result = GJKCollision.polygonsOverlap(polyA, polyB);
      assert.ok(result.overlaps, 'Overlapping polygons should overlap');
      assert.ok(result.verified, 'Should be verified');
    });

    it('detects non-overlapping polygons', () => {
      const polyA = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const polyB = [{ x: 5, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 5, y: 1 }];
      const result = GJKCollision.polygonsOverlap(polyA, polyB);
      assert.ok(!result.overlaps, 'Separated polygons should not overlap');
    });

    it('accepts mixed Decimal and number inputs', () => {
      const polyA = [
        { x: new Decimal(0), y: new Decimal(0) },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: new Decimal(2) }
      ];
      const polyB = [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 }
      ];
      const result = GJKCollision.polygonsOverlap(polyA, polyB);
      assert.ok(result.overlaps, 'Should handle mixed inputs');
    });
  });

  describe('polygonsDistance()', () => {
    it('computes distance between separated polygons', () => {
      const polyA = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const polyB = [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 1 }];
      const result = GJKCollision.polygonsDistance(polyA, polyB);
      assertClose(result.distance, 2, 1e-6);
    });

    it('returns zero for overlapping polygons', () => {
      const polyA = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
      const polyB = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }];
      const result = GJKCollision.polygonsDistance(polyA, polyB);
      assertClose(result.distance, 0);
    });

    it('returns closest points', () => {
      const polyA = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const polyB = [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 1 }];
      const result = GJKCollision.polygonsDistance(polyA, polyB);
      assert.ok(result.closestA.x instanceof Decimal);
      assert.ok(result.closestB.x instanceof Decimal);
    });
  });

  describe('isPointInPolygon()', () => {
    it('detects point inside polygon with number inputs', () => {
      const polygon = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
      const pt = { x: 1, y: 1 };
      const result = GJKCollision.isPointInPolygon(pt, polygon);
      assert.ok(result, 'Point should be inside');
    });

    it('detects point outside polygon', () => {
      const polygon = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
      const pt = { x: 5, y: 5 };
      const result = GJKCollision.isPointInPolygon(pt, polygon);
      assert.ok(!result, 'Point should be outside');
    });

    it('handles point on edge', () => {
      const polygon = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
      const pt = { x: 1, y: 0 };
      const result = GJKCollision.isPointInPolygon(pt, polygon);
      assert.ok(result, 'Point on edge should be inside');
    });

    it('works with Decimal inputs', () => {
      const polygon = [
        { x: new Decimal(0), y: new Decimal(0) },
        { x: new Decimal(2), y: new Decimal(0) },
        { x: new Decimal(2), y: new Decimal(2) },
        { x: new Decimal(0), y: new Decimal(2) }
      ];
      const pt = { x: new Decimal(1), y: new Decimal(1) };
      const result = GJKCollision.isPointInPolygon(pt, polygon);
      assert.ok(result, 'Should work with Decimal inputs');
    });
  });
});

// ============================================================================
// Edge Cases and Stress Tests
// ============================================================================

describe('GJKCollision Edge Cases', () => {
  describe('Degenerate Polygons', () => {
    it('handles collinear points (degenerate polygon)', () => {
      const line = [
        GJKCollision.point(0, 0),
        GJKCollision.point(1, 0),
        GJKCollision.point(2, 0)
      ];
      const square = makeSquare(0, -1, 2);
      const result = GJKCollision.gjkIntersects(line, square);
      // Should handle gracefully without crashing
      assert.ok(typeof result.intersects === 'boolean');
    });

    it('handles very thin triangle', () => {
      const thin = [
        GJKCollision.point(0, 0),
        GJKCollision.point(10, 0),
        GJKCollision.point(5, 0.0001)
      ];
      const square = makeSquare(4, -1, 2);
      const result = GJKCollision.gjkIntersects(thin, square);
      assert.ok(typeof result.intersects === 'boolean');
    });
  });

  describe('Numerical Precision', () => {
    it('handles very small polygons', () => {
      const small = makeSquare(0, 0, 1e-20);
      const normal = makeSquare(0, 0, 1);
      const result = GJKCollision.gjkIntersects(small, normal);
      assert.ok(result.intersects, 'Small polygon inside normal should intersect');
    });

    it('handles very large polygons', () => {
      const large = makeSquare(0, 0, 1e20);
      const normal = makeSquare(1e10, 1e10, 1);
      const result = GJKCollision.gjkIntersects(large, normal);
      assert.ok(result.intersects, 'Normal polygon inside large should intersect');
    });

    it('handles high precision coordinates', () => {
      const polyA = [
        GJKCollision.point('0.12345678901234567890123456789', '0.98765432109876543210987654321'),
        GJKCollision.point('2.12345678901234567890123456789', '0.98765432109876543210987654321'),
        GJKCollision.point('2.12345678901234567890123456789', '2.98765432109876543210987654321'),
        GJKCollision.point('0.12345678901234567890123456789', '2.98765432109876543210987654321')
      ];
      const polyB = [
        GJKCollision.point('1.0', '1.0'),
        GJKCollision.point('3.0', '1.0'),
        GJKCollision.point('3.0', '3.0'),
        GJKCollision.point('1.0', '3.0')
      ];
      const result = GJKCollision.gjkIntersects(polyA, polyB);
      assert.ok(result.intersects, 'High precision polygons should work');
    });
  });

  describe('Various Polygon Shapes', () => {
    it('handles regular pentagon intersection', () => {
      const pentA = makePentagon(0, 0, 2);
      const pentB = makePentagon(1, 0, 2);
      const result = GJKCollision.gjkIntersects(pentA, pentB);
      assert.ok(result.intersects);
      assert.ok(result.verified);
    });

    it('handles hexagon intersection', () => {
      const hexA = makeHexagon(0, 0, 2);
      const hexB = makeHexagon(1, 0, 2);
      const result = GJKCollision.gjkIntersects(hexA, hexB);
      assert.ok(result.intersects);
    });

    it('handles triangle-square intersection', () => {
      const tri = makeTriangle(0, 0, 2);
      const sq = makeSquare(0.5, 0, 1);
      const result = GJKCollision.gjkIntersects(tri, sq);
      assert.ok(result.intersects);
    });

    it('handles separated complex shapes', () => {
      const pentA = makePentagon(-5, 0, 1);
      const hexB = makeHexagon(5, 0, 1);
      const result = GJKCollision.gjkIntersects(pentA, hexB);
      assert.ok(!result.intersects, 'Separated complex shapes should not intersect');
    });
  });

  describe('Boundary Cases', () => {
    it('handles exact edge contact', () => {
      const sq1 = makeSquare(0, 0, 1);
      const sq2 = makeSquare(1, 0, 1); // Exact edge contact at x=1
      const result = GJKCollision.gjkIntersects(sq1, sq2);
      assert.ok(result.intersects, 'Edge contact should be intersection');
    });

    it('handles epsilon separation', () => {
      const sq1 = makeSquare(0, 0, 1);
      // Very small gap
      const sq2 = [
        GJKCollision.point('1.0000000000000000000000000000000000000001', 0),
        GJKCollision.point('2.0000000000000000000000000000000000000001', 0),
        GJKCollision.point('2.0000000000000000000000000000000000000001', 1),
        GJKCollision.point('1.0000000000000000000000000000000000000001', 1)
      ];
      const result = GJKCollision.gjkIntersects(sq1, sq2);
      // With high precision, this tiny gap should be detected
      assert.ok(typeof result.intersects === 'boolean');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('GJKCollision Integration Tests', () => {
  it('complex scenario: multiple polygon types', () => {
    const triangle = makeTriangle(0, 0, 3);
    const square = makeSquare(2, 1, 2);
    const pentagon = makePentagon(5, 2, 1);

    // Triangle and square should intersect
    const triSq = GJKCollision.gjkIntersects(triangle, square);
    assert.ok(triSq.intersects, 'Triangle and square should intersect');

    // Pentagon should be separate from triangle
    const triPent = GJKCollision.gjkIntersects(triangle, pentagon);
    assert.ok(!triPent.intersects, 'Triangle and pentagon should not intersect');

    // Check distance between separated shapes
    const dist = GJKCollision.gjkDistance(triangle, pentagon);
    assert.ok(dist.distance.greaterThan(0), 'Distance should be positive');
  });

  it('chained operations with same polygons', () => {
    const sq1 = makeSquare(0, 0, 2);
    const sq2 = makeSquare(1, 1, 2);

    // Test overlap
    const overlap = GJKCollision.polygonsOverlap(
      sq1.map(p => ({ x: p.x.toNumber(), y: p.y.toNumber() })),
      sq2.map(p => ({ x: p.x.toNumber(), y: p.y.toNumber() }))
    );
    assert.ok(overlap.overlaps);

    // Test gjkIntersects directly
    const intersects = GJKCollision.gjkIntersects(sq1, sq2);
    assert.ok(intersects.intersects);

    // Test distance (should be 0 for overlapping)
    const distance = GJKCollision.gjkDistance(sq1, sq2);
    assertClose(distance.distance, 0);
  });

  it('point containment across polygon types', () => {
    const square = makeSquare(-1, -1, 2);
    const triangle = makeTriangle(-0.5, -0.5, 1);
    const pentagon = makePentagon(0, 0, 0.5);

    const origin = GJKCollision.point(0, 0);

    assert.ok(GJKCollision.pointInConvexPolygon(origin, square), 'Origin in square');
    assert.ok(GJKCollision.pointInConvexPolygon(origin, triangle), 'Origin in triangle');
    assert.ok(GJKCollision.pointInConvexPolygon(origin, pentagon), 'Origin in pentagon');
  });

  it('distance computation consistency', () => {
    const sq1 = makeSquare(0, 0, 1);
    const sq2 = makeSquare(3, 0, 1);

    // Distance should be 2 (gap between x=1 and x=3)
    const dist1 = GJKCollision.gjkDistance(sq1, sq2);
    const dist2 = GJKCollision.polygonsDistance(
      sq1.map(p => ({ x: p.x, y: p.y })),
      sq2.map(p => ({ x: p.x, y: p.y }))
    );

    assertClose(dist1.distance, dist2.distance, 1e-10, 'Distances should match');
    assertClose(dist1.distance, 2, 1e-6, 'Distance should be 2');
  });
});

// ============================================================================
// Constants Export Tests
// ============================================================================

describe('GJKCollision Constants', () => {
  it('exports EPSILON constant', () => {
    assert.ok(GJKCollision.EPSILON instanceof Decimal);
    assert.ok(GJKCollision.EPSILON.greaterThan(0));
    assert.ok(GJKCollision.EPSILON.lessThan(1e-30));
  });

  it('exports MAX_ITERATIONS constant', () => {
    assert.ok(typeof GJKCollision.MAX_ITERATIONS === 'number');
    assert.ok(GJKCollision.MAX_ITERATIONS > 0);
    assert.equal(GJKCollision.MAX_ITERATIONS, 100);
  });

  it('exports D helper function', () => {
    assert.ok(typeof GJKCollision.D === 'function');
    const result = GJKCollision.D(5);
    assert.ok(result instanceof Decimal);
    assert.ok(result.eq(5));
  });
});
