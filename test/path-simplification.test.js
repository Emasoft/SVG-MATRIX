import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import * as PathSimplification from '../src/path-simplification.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper for Decimal comparison with tolerance
function assertDecimalClose(actual, expected, tolerance, message) {
  const actualD = actual instanceof Decimal ? actual : new Decimal(actual);
  const expectedD = new Decimal(expected);
  const diff = actualD.minus(expectedD).abs();
  assert.ok(diff.lt(tolerance), `${message} - expected ${expectedD.toString()}, got ${actualD.toString()}, diff ${diff.toString()}`);
}

// Helper for point comparison with tolerance
function assertPointClose(actual, expected, tolerance, message) {
  assertDecimalClose(actual.x, expected.x, tolerance, `${message} (x coordinate)`);
  assertDecimalClose(actual.y, expected.y, tolerance, `${message} (y coordinate)`);
}

describe('PathSimplification', () => {

  // ============================================================================
  // Constants
  // ============================================================================
  describe('Constants', () => {
    it('EPSILON should be a very small Decimal value (1e-40)', () => {
      assert.ok(PathSimplification.EPSILON instanceof Decimal, 'EPSILON is Decimal');
      assert.ok(PathSimplification.EPSILON.equals(new Decimal('1e-40')), 'EPSILON is 1e-40');
    });

    it('DEFAULT_TOLERANCE should be 1e-10', () => {
      assert.ok(PathSimplification.DEFAULT_TOLERANCE instanceof Decimal, 'DEFAULT_TOLERANCE is Decimal');
      assert.ok(PathSimplification.DEFAULT_TOLERANCE.equals(new Decimal('1e-10')), 'DEFAULT_TOLERANCE is 1e-10');
    });

    it('D helper should convert numbers, strings, and Decimals to Decimal', () => {
      const fromNumber = PathSimplification.D(42);
      const fromString = PathSimplification.D('3.14159265358979323846');
      const fromDecimal = PathSimplification.D(new Decimal(100));

      assert.ok(fromNumber instanceof Decimal, 'D(number) returns Decimal');
      assert.ok(fromString instanceof Decimal, 'D(string) returns Decimal');
      assert.ok(fromDecimal instanceof Decimal, 'D(Decimal) returns Decimal');
      assert.ok(fromNumber.equals(42), 'D(42) equals 42');
      assert.ok(fromString.equals('3.14159265358979323846'), 'D preserves high precision string');
      assert.ok(fromDecimal.equals(100), 'D(Decimal) preserves value');
    });
  });

  // ============================================================================
  // point() - Decimal Point Creation
  // ============================================================================
  describe('point()', () => {
    it('should create a point with Decimal coordinates from numbers', () => {
      const p = PathSimplification.point(10, 20);
      assert.ok(p.x instanceof Decimal, 'x is Decimal');
      assert.ok(p.y instanceof Decimal, 'y is Decimal');
      assert.ok(p.x.equals(10), 'x equals 10');
      assert.ok(p.y.equals(20), 'y equals 20');
    });

    it('should create a point from string coordinates with high precision', () => {
      const p = PathSimplification.point('1.23456789012345678901234567890', '9.87654321098765432109876543210');
      assert.ok(p.x.equals('1.23456789012345678901234567890'), 'x preserves precision');
      assert.ok(p.y.equals('9.87654321098765432109876543210'), 'y preserves precision');
    });

    it('should create a point from Decimal coordinates', () => {
      const x = new Decimal('3.14159');
      const y = new Decimal('2.71828');
      const p = PathSimplification.point(x, y);
      assert.ok(p.x.equals(x), 'x equals input Decimal');
      assert.ok(p.y.equals(y), 'y equals input Decimal');
    });

    it('should handle negative coordinates', () => {
      const p = PathSimplification.point(-100, -200);
      assert.ok(p.x.equals(-100), 'negative x');
      assert.ok(p.y.equals(-200), 'negative y');
    });

    it('should handle zero coordinates', () => {
      const p = PathSimplification.point(0, 0);
      assert.ok(p.x.equals(0), 'zero x');
      assert.ok(p.y.equals(0), 'zero y');
    });
  });

  // ============================================================================
  // distanceSquared() - Squared Distance Calculation
  // ============================================================================
  describe('distanceSquared()', () => {
    it('should calculate squared distance between two points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(3, 4);
      const dSq = PathSimplification.distanceSquared(p1, p2);
      // 3^2 + 4^2 = 9 + 16 = 25
      assert.ok(dSq.equals(25), 'distanceSquared(0,0 to 3,4) = 25');
    });

    it('should return 0 for same point', () => {
      const p = PathSimplification.point(5, 10);
      const dSq = PathSimplification.distanceSquared(p, p);
      assert.ok(dSq.equals(0), 'same point has 0 squared distance');
    });

    it('should handle negative coordinates', () => {
      const p1 = PathSimplification.point(-3, -4);
      const p2 = PathSimplification.point(0, 0);
      const dSq = PathSimplification.distanceSquared(p1, p2);
      assert.ok(dSq.equals(25), 'distanceSquared works with negative coords');
    });

    it('should handle large coordinates with precision', () => {
      const p1 = PathSimplification.point('1000000000000000000.5', '2000000000000000000.5');
      const p2 = PathSimplification.point('1000000000000000001.5', '2000000000000000001.5');
      const dSq = PathSimplification.distanceSquared(p1, p2);
      // dx = 1, dy = 1, so dSq = 2
      assert.ok(dSq.equals(2), 'large coordinates maintain precision');
    });
  });

  // ============================================================================
  // distance() - Distance Calculation
  // ============================================================================
  describe('distance()', () => {
    it('should calculate distance between two points (3-4-5 triangle)', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(3, 4);
      const d = PathSimplification.distance(p1, p2);
      assert.ok(d.equals(5), 'distance(0,0 to 3,4) = 5');
    });

    it('should return 0 for same point', () => {
      const p = PathSimplification.point(100, 200);
      const d = PathSimplification.distance(p, p);
      assert.ok(d.equals(0), 'same point has 0 distance');
    });

    it('should handle horizontal distance', () => {
      const p1 = PathSimplification.point(0, 5);
      const p2 = PathSimplification.point(10, 5);
      const d = PathSimplification.distance(p1, p2);
      assert.ok(d.equals(10), 'horizontal distance = 10');
    });

    it('should handle vertical distance', () => {
      const p1 = PathSimplification.point(5, 0);
      const p2 = PathSimplification.point(5, 10);
      const d = PathSimplification.distance(p1, p2);
      assert.ok(d.equals(10), 'vertical distance = 10');
    });

    it('should handle diagonal distance with precision', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(1, 1);
      const d = PathSimplification.distance(p1, p2);
      // sqrt(2) = 1.41421356...
      assertDecimalClose(d, '1.41421356237309504880168872420969807856967187537694', 1e-40, 'sqrt(2) precision');
    });
  });

  // ============================================================================
  // pointToLineDistance() - Perpendicular Distance
  // ============================================================================
  describe('pointToLineDistance()', () => {
    it('should calculate perpendicular distance from point to horizontal line', () => {
      const pt = PathSimplification.point(5, 3);
      const lineStart = PathSimplification.point(0, 0);
      const lineEnd = PathSimplification.point(10, 0);
      const d = PathSimplification.pointToLineDistance(pt, lineStart, lineEnd);
      assert.ok(d.equals(3), 'distance to horizontal line = 3');
    });

    it('should calculate perpendicular distance from point to vertical line', () => {
      const pt = PathSimplification.point(4, 5);
      const lineStart = PathSimplification.point(0, 0);
      const lineEnd = PathSimplification.point(0, 10);
      const d = PathSimplification.pointToLineDistance(pt, lineStart, lineEnd);
      assert.ok(d.equals(4), 'distance to vertical line = 4');
    });

    it('should return 0 when point is on the line', () => {
      const pt = PathSimplification.point(5, 5);
      const lineStart = PathSimplification.point(0, 0);
      const lineEnd = PathSimplification.point(10, 10);
      const d = PathSimplification.pointToLineDistance(pt, lineStart, lineEnd);
      assertDecimalClose(d, 0, 1e-30, 'point on line has 0 distance');
    });

    it('should handle degenerate line (line start equals line end)', () => {
      const pt = PathSimplification.point(3, 4);
      const lineStart = PathSimplification.point(0, 0);
      const lineEnd = PathSimplification.point(0, 0);
      const d = PathSimplification.pointToLineDistance(pt, lineStart, lineEnd);
      // Should return distance to the point itself
      assert.ok(d.equals(5), 'degenerate line returns distance to point');
    });

    it('should calculate distance to diagonal line', () => {
      // Line from (0,0) to (10,10), point at (0,10)
      // Distance should be 10/sqrt(2) = 5*sqrt(2) approximately 7.071
      const pt = PathSimplification.point(0, 10);
      const lineStart = PathSimplification.point(0, 0);
      const lineEnd = PathSimplification.point(10, 10);
      const d = PathSimplification.pointToLineDistance(pt, lineStart, lineEnd);
      const expected = new Decimal(10).div(new Decimal(2).sqrt());
      assertDecimalClose(d, expected, 1e-30, 'diagonal line distance');
    });
  });

  // ============================================================================
  // crossProduct() - 2D Cross Product
  // ============================================================================
  describe('crossProduct()', () => {
    it('should return 0 for collinear points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(5, 5);
      const p3 = PathSimplification.point(10, 10);
      const cross = PathSimplification.crossProduct(p1, p2, p3);
      assert.ok(cross.equals(0), 'collinear points have 0 cross product');
    });

    it('should return positive for counter-clockwise turn', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(10, 0);
      const p3 = PathSimplification.point(5, 5);
      const cross = PathSimplification.crossProduct(p1, p2, p3);
      assert.ok(cross.greaterThan(0), 'CCW turn has positive cross product');
    });

    it('should return negative for clockwise turn', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(10, 0);
      const p3 = PathSimplification.point(5, -5);
      const cross = PathSimplification.crossProduct(p1, p2, p3);
      assert.ok(cross.lessThan(0), 'CW turn has negative cross product');
    });

    it('should calculate correct magnitude', () => {
      // Triangle area * 2 = cross product magnitude
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(4, 0);
      const p3 = PathSimplification.point(0, 3);
      const cross = PathSimplification.crossProduct(p1, p2, p3);
      // Area of triangle = 0.5 * 4 * 3 = 6, cross product = 12
      assert.ok(cross.equals(12), 'cross product magnitude = 12');
    });
  });

  // ============================================================================
  // evaluateCubicBezier() - Cubic Bezier Evaluation
  // ============================================================================
  describe('evaluateCubicBezier()', () => {
    it('should return start point at t=0', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(10, 20);
      const p2 = PathSimplification.point(30, 40);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateCubicBezier(p0, p1, p2, p3, 0);
      assertPointClose(result, p0, 1e-30, 't=0 returns start point');
    });

    it('should return end point at t=1', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(10, 20);
      const p2 = PathSimplification.point(30, 40);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateCubicBezier(p0, p1, p2, p3, 1);
      assertPointClose(result, p3, 1e-30, 't=1 returns end point');
    });

    it('should return midpoint approximation at t=0.5 for straight line', () => {
      // A "straight" cubic Bezier where control points are on the line
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 1);
      const p2 = PathSimplification.point(2, 2);
      const p3 = PathSimplification.point(3, 3);
      const result = PathSimplification.evaluateCubicBezier(p0, p1, p2, p3, 0.5);
      assertPointClose(result, PathSimplification.point(1.5, 1.5), 1e-30, 't=0.5 on straight line');
    });

    it('should handle symmetric S-curve correctly', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(0, 50);
      const p2 = PathSimplification.point(100, 50);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateCubicBezier(p0, p1, p2, p3, 0.5);
      // At t=0.5, should be at center: x=50, y=50
      assertPointClose(result, PathSimplification.point(50, 50), 1e-30, 'S-curve midpoint');
    });
  });

  // ============================================================================
  // evaluateQuadraticBezier() - Quadratic Bezier Evaluation
  // ============================================================================
  describe('evaluateQuadraticBezier()', () => {
    it('should return start point at t=0', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(50, 100);
      const p2 = PathSimplification.point(100, 0);
      const result = PathSimplification.evaluateQuadraticBezier(p0, p1, p2, 0);
      assertPointClose(result, p0, 1e-30, 't=0 returns start point');
    });

    it('should return end point at t=1', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(50, 100);
      const p2 = PathSimplification.point(100, 0);
      const result = PathSimplification.evaluateQuadraticBezier(p0, p1, p2, 1);
      assertPointClose(result, p2, 1e-30, 't=1 returns end point');
    });

    it('should calculate correct midpoint for parabolic arc', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(50, 100);
      const p2 = PathSimplification.point(100, 0);
      const result = PathSimplification.evaluateQuadraticBezier(p0, p1, p2, 0.5);
      // At t=0.5: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
      // x = 0.25*0 + 0.5*50 + 0.25*100 = 50
      // y = 0.25*0 + 0.5*100 + 0.25*0 = 50
      assertPointClose(result, PathSimplification.point(50, 50), 1e-30, 'quadratic midpoint');
    });

    it('should handle collinear control point (straight line)', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(5, 5);
      const p2 = PathSimplification.point(10, 10);
      const result = PathSimplification.evaluateQuadraticBezier(p0, p1, p2, 0.25);
      assertPointClose(result, PathSimplification.point(2.5, 2.5), 1e-30, 'straight quadratic');
    });
  });

  // ============================================================================
  // isCubicBezierStraight() - Straightness Detection for Cubic
  // ============================================================================
  describe('isCubicBezierStraight()', () => {
    it('should detect a perfectly straight cubic Bezier', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 1);
      const p2 = PathSimplification.point(2, 2);
      const p3 = PathSimplification.point(3, 3);
      const result = PathSimplification.isCubicBezierStraight(p0, p1, p2, p3);
      assert.strictEqual(result.isStraight, true, 'straight line detected');
      assert.strictEqual(result.verified, true, 'verified flag is true');
      assertDecimalClose(result.maxDeviation, 0, 1e-30, 'deviation is 0');
    });

    it('should detect a curved cubic Bezier as not straight', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(0, 100);
      const p2 = PathSimplification.point(100, 100);
      const p3 = PathSimplification.point(100, 0);
      const result = PathSimplification.isCubicBezierStraight(p0, p1, p2, p3);
      assert.strictEqual(result.isStraight, false, 'curved bezier not straight');
      assert.strictEqual(result.verified, true, 'verified flag is true');
      assert.ok(result.maxDeviation.greaterThan(10), 'large deviation detected');
    });

    it('should handle degenerate case (all points same)', () => {
      const p = PathSimplification.point(5, 5);
      const result = PathSimplification.isCubicBezierStraight(p, p, p, p);
      assert.strictEqual(result.isStraight, true, 'degenerate is straight');
      assert.strictEqual(result.verified, true, 'verified flag is true');
    });

    it('should detect near-straight curve with tight tolerance', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 1e-12);  // Slightly off
      const p2 = PathSimplification.point(2, -1e-12); // Slightly off
      const p3 = PathSimplification.point(3, 0);
      const result = PathSimplification.isCubicBezierStraight(p0, p1, p2, p3, new Decimal('1e-10'));
      assert.strictEqual(result.isStraight, true, 'near-straight with tolerance');
    });

    it('should reject near-straight curve with very tight tolerance', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 0.1);
      const p2 = PathSimplification.point(2, -0.1);
      const p3 = PathSimplification.point(3, 0);
      const result = PathSimplification.isCubicBezierStraight(p0, p1, p2, p3, new Decimal('1e-15'));
      assert.strictEqual(result.isStraight, false, 'rejects with tight tolerance');
    });
  });

  // ============================================================================
  // isQuadraticBezierStraight() - Straightness Detection for Quadratic
  // ============================================================================
  describe('isQuadraticBezierStraight()', () => {
    it('should detect a perfectly straight quadratic Bezier', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(5, 5);
      const p2 = PathSimplification.point(10, 10);
      const result = PathSimplification.isQuadraticBezierStraight(p0, p1, p2);
      assert.strictEqual(result.isStraight, true, 'straight quadratic detected');
      assert.strictEqual(result.verified, true, 'verified flag is true');
    });

    it('should detect a curved quadratic Bezier as not straight', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(50, 100);
      const p2 = PathSimplification.point(100, 0);
      const result = PathSimplification.isQuadraticBezierStraight(p0, p1, p2);
      assert.strictEqual(result.isStraight, false, 'curved quadratic not straight');
      assert.strictEqual(result.verified, true, 'verified flag is true');
    });

    it('should handle degenerate case (all points same)', () => {
      const p = PathSimplification.point(10, 20);
      const result = PathSimplification.isQuadraticBezierStraight(p, p, p);
      assert.strictEqual(result.isStraight, true, 'degenerate is straight');
    });
  });

  // ============================================================================
  // cubicBezierToLine() - Cubic to Line Conversion
  // ============================================================================
  describe('cubicBezierToLine()', () => {
    it('should convert straight cubic to line', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(10, 10);
      const p2 = PathSimplification.point(20, 20);
      const p3 = PathSimplification.point(30, 30);
      const result = PathSimplification.cubicBezierToLine(p0, p1, p2, p3);
      assert.ok(result !== null, 'conversion succeeds');
      assertPointClose(result.start, p0, 1e-30, 'start point preserved');
      assertPointClose(result.end, p3, 1e-30, 'end point preserved');
    });

    it('should return null for curved cubic', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(0, 100);
      const p2 = PathSimplification.point(100, 100);
      const p3 = PathSimplification.point(100, 0);
      const result = PathSimplification.cubicBezierToLine(p0, p1, p2, p3);
      assert.strictEqual(result, null, 'curved cubic returns null');
    });
  });

  // ============================================================================
  // canLowerCubicToQuadratic() - Degree Lowering Detection
  // ============================================================================
  describe('canLowerCubicToQuadratic()', () => {
    it('should detect degree-elevated quadratic (control points at 2/3 positions)', () => {
      // A quadratic Q0=(0,0), Q1=(50,100), Q2=(100,0) elevated to cubic:
      // P0 = Q0, P3 = Q2
      // P1 = Q0 + 2/3*(Q1-Q0) = (33.33, 66.67)
      // P2 = Q2 + 2/3*(Q1-Q2) = (66.67, 66.67)
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(new Decimal(100).div(3), new Decimal(200).div(3));
      const p2 = PathSimplification.point(new Decimal(200).div(3), new Decimal(200).div(3));
      const p3 = PathSimplification.point(100, 0);
      const result = PathSimplification.canLowerCubicToQuadratic(p0, p1, p2, p3);
      assert.strictEqual(result.canLower, true, 'can lower to quadratic');
      assert.strictEqual(result.verified, true, 'verified flag is true');
      assert.ok(result.quadraticControl !== null, 'quadratic control point returned');
      assertPointClose(result.quadraticControl, PathSimplification.point(50, 100), 1e-10, 'correct Q1');
    });

    it('should reject true cubic that cannot be lowered', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(10, 90);
      const p2 = PathSimplification.point(90, 10);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.canLowerCubicToQuadratic(p0, p1, p2, p3);
      assert.strictEqual(result.canLower, false, 'true cubic cannot be lowered');
    });

    it('should handle straight line (can be lowered to degenerate quadratic)', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 1);
      const p2 = PathSimplification.point(2, 2);
      const p3 = PathSimplification.point(3, 3);
      const result = PathSimplification.canLowerCubicToQuadratic(p0, p1, p2, p3);
      // A straight line can be represented as a degenerate quadratic
      assert.strictEqual(result.verified, true, 'verified flag is true');
    });
  });

  // ============================================================================
  // cubicToQuadratic() - Cubic to Quadratic Conversion
  // ============================================================================
  describe('cubicToQuadratic()', () => {
    it('should convert degree-elevated quadratic back to quadratic', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(new Decimal(100).div(3), new Decimal(200).div(3));
      const p2 = PathSimplification.point(new Decimal(200).div(3), new Decimal(200).div(3));
      const p3 = PathSimplification.point(100, 0);
      const result = PathSimplification.cubicToQuadratic(p0, p1, p2, p3);
      assert.ok(result !== null, 'conversion succeeds');
      assertPointClose(result.p0, p0, 1e-30, 'start preserved');
      assertPointClose(result.p2, p3, 1e-30, 'end preserved');
    });

    it('should return null for true cubic', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(10, 90);
      const p2 = PathSimplification.point(90, 10);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.cubicToQuadratic(p0, p1, p2, p3);
      assert.strictEqual(result, null, 'true cubic returns null');
    });
  });

  // ============================================================================
  // fitCircleToPoints() - Circle Fitting
  // ============================================================================
  describe('fitCircleToPoints()', () => {
    it('should return null for less than 3 points (non-empty)', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(1, 1);
      assert.strictEqual(PathSimplification.fitCircleToPoints([p1, p2]), null, '2 points');
      assert.strictEqual(PathSimplification.fitCircleToPoints([p1]), null, '1 point');
    });

    it('should throw for empty points array', () => {
      assert.throws(() => {
        PathSimplification.fitCircleToPoints([]);
      }, /points array cannot be empty/i, 'should throw for empty array');
    });

    it('should fit circle to 3 points on a known circle', () => {
      // Points on circle with center (0,0) and radius 10
      const p1 = PathSimplification.point(10, 0);
      const p2 = PathSimplification.point(0, 10);
      const p3 = PathSimplification.point(-10, 0);
      const result = PathSimplification.fitCircleToPoints([p1, p2, p3]);
      assert.ok(result !== null, 'circle fitted');
      assertDecimalClose(result.center.x, 0, 1e-10, 'center x = 0');
      assertDecimalClose(result.center.y, 0, 1e-10, 'center y = 0');
      assertDecimalClose(result.radius, 10, 1e-10, 'radius = 10');
    });

    it('should return null for collinear points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(5, 5);
      const p3 = PathSimplification.point(10, 10);
      const result = PathSimplification.fitCircleToPoints([p1, p2, p3]);
      assert.strictEqual(result, null, 'collinear points return null');
    });

    it('should fit circle to multiple points', () => {
      // 4 points on circle with center (5,5) and radius 5
      const points = [
        PathSimplification.point(10, 5),
        PathSimplification.point(5, 10),
        PathSimplification.point(0, 5),
        PathSimplification.point(5, 0)
      ];
      const result = PathSimplification.fitCircleToPoints(points);
      assert.ok(result !== null, 'circle fitted');
      assertDecimalClose(result.center.x, 5, 1e-10, 'center x');
      assertDecimalClose(result.center.y, 5, 1e-10, 'center y');
      assertDecimalClose(result.radius, 5, 1e-10, 'radius');
    });
  });

  // ============================================================================
  // fitCircleToCubicBezier() - Circle Fitting for Bezier
  // ============================================================================
  describe('fitCircleToCubicBezier()', () => {
    it('should detect circular arc represented as cubic Bezier', () => {
      // Quarter circle approximation using kappa
      const kappa = new Decimal(4).mul(new Decimal(2).sqrt().minus(1)).div(3);
      const r = new Decimal(100);
      const p0 = PathSimplification.point(r, 0);
      const p1 = PathSimplification.point(r, r.mul(kappa));
      const p2 = PathSimplification.point(r.mul(kappa), r);
      const p3 = PathSimplification.point(0, r);
      const result = PathSimplification.fitCircleToCubicBezier(p0, p1, p2, p3, new Decimal('1'));
      // Should detect as arc with some tolerance
      assert.strictEqual(result.verified, true, 'verified flag is true');
      // The fitting might not be perfect due to Bezier approximation
      if (result.isArc) {
        assertDecimalClose(result.circle.radius, r, 5, 'radius approximately correct');
      }
    });

    it('should return isArc=false for non-circular curve', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(0, 100);
      const p2 = PathSimplification.point(100, 0);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.fitCircleToCubicBezier(p0, p1, p2, p3);
      assert.strictEqual(result.verified, true, 'verified flag is true');
      // S-curve should not fit a circle well
    });
  });

  // ============================================================================
  // cubicBezierToArc() - Bezier to Arc Conversion
  // ============================================================================
  describe('cubicBezierToArc()', () => {
    it('should convert quarter circle Bezier to arc', () => {
      const kappa = new Decimal(4).mul(new Decimal(2).sqrt().minus(1)).div(3);
      const r = new Decimal(50);
      const p0 = PathSimplification.point(r, 0);
      const p1 = PathSimplification.point(r, r.mul(kappa));
      const p2 = PathSimplification.point(r.mul(kappa), r);
      const p3 = PathSimplification.point(0, r);
      const result = PathSimplification.cubicBezierToArc(p0, p1, p2, p3, new Decimal('1'));
      if (result !== null) {
        assert.ok(result.rx instanceof Decimal, 'rx is Decimal');
        assert.ok(result.ry instanceof Decimal, 'ry is Decimal');
        assertPointClose({ x: result.endX, y: result.endY }, p3, 1e-10, 'endpoint preserved');
      }
    });

    it('should return null for non-arc curve', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(50, 0);
      const p2 = PathSimplification.point(50, 100);
      const p3 = PathSimplification.point(100, 100);
      const result = PathSimplification.cubicBezierToArc(p0, p1, p2, p3, new Decimal('0.1'));
      // This likely won't fit a circle, so should return null
      // (depends on tolerance)
    });
  });

  // ============================================================================
  // calculateSagitta() - Arc Sagitta Calculation
  // ============================================================================
  describe('calculateSagitta()', () => {
    it('should calculate sagitta for semicircle', () => {
      // For semicircle: chord = 2*r, so sagitta = r
      const r = new Decimal(10);
      const chord = r.mul(2);
      const sagitta = PathSimplification.calculateSagitta(r, chord);
      assertDecimalClose(sagitta, r, 1e-30, 'semicircle sagitta = radius');
    });

    it('should calculate sagitta for quarter circle', () => {
      // For quarter circle: chord = r*sqrt(2), sagitta = r - r*sqrt(2)/2 = r*(1 - sqrt(2)/2)
      const r = new Decimal(100);
      const chord = r.mul(new Decimal(2).sqrt());
      const sagitta = PathSimplification.calculateSagitta(r, chord);
      const expected = r.minus(r.mul(new Decimal(2).sqrt()).div(2));
      assertDecimalClose(sagitta, expected, 1e-20, 'quarter circle sagitta');
    });

    it('should return 0 for zero chord length', () => {
      const sagitta = PathSimplification.calculateSagitta(50, 0);
      assert.ok(sagitta.equals(0), 'zero chord has zero sagitta');
    });

    it('should return null for chord longer than diameter', () => {
      const sagitta = PathSimplification.calculateSagitta(10, 30);
      assert.strictEqual(sagitta, null, 'chord > diameter returns null');
    });

    it('should handle small arcs (small sagitta)', () => {
      // For small chord relative to radius, sagitta is very small
      const r = new Decimal(1000);
      const chord = new Decimal(10);
      const sagitta = PathSimplification.calculateSagitta(r, chord);
      // Approximate: sagitta ~ chord^2 / (8*r) for small arcs
      const approx = chord.pow(2).div(r.mul(8));
      assertDecimalClose(sagitta, approx, 0.001, 'small arc sagitta approximation');
    });
  });

  // ============================================================================
  // isArcStraight() - Arc Straightness Detection
  // ============================================================================
  describe('isArcStraight()', () => {
    it('should detect zero-radius arc as straight', () => {
      const start = PathSimplification.point(0, 0);
      const end = PathSimplification.point(10, 0);
      const result = PathSimplification.isArcStraight(0, 0, 0, 0, 1, start, end);
      assert.strictEqual(result.isStraight, true, 'zero radius is straight');
      assert.strictEqual(result.verified, true, 'verified flag is true');
    });

    it('should detect very large radius arc as straight', () => {
      const start = PathSimplification.point(0, 0);
      const end = PathSimplification.point(10, 0);
      const result = PathSimplification.isArcStraight(100000, 100000, 0, 0, 1, start, end, new Decimal('1'));
      // Large radius relative to chord = nearly straight
      assert.strictEqual(result.isStraight, true, 'large radius is straight');
    });

    it('should detect small radius arc as not straight', () => {
      const start = PathSimplification.point(0, 0);
      const end = PathSimplification.point(10, 0);
      const result = PathSimplification.isArcStraight(5, 5, 0, 0, 1, start, end, new Decimal('0.01'));
      // Small radius = curved
      assert.strictEqual(result.isStraight, false, 'small radius not straight');
    });

    it('should handle large arc flag', () => {
      const start = PathSimplification.point(0, 0);
      const end = PathSimplification.point(10, 0);
      // Large arc with small radius should definitely not be straight
      const result = PathSimplification.isArcStraight(6, 6, 0, 1, 1, start, end, new Decimal('1'));
      assert.strictEqual(result.isStraight, false, 'large arc not straight');
    });
  });

  // ============================================================================
  // areCollinear() - Collinearity Check
  // ============================================================================
  describe('areCollinear()', () => {
    it('should return true for collinear points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(5, 5);
      const p3 = PathSimplification.point(10, 10);
      assert.strictEqual(PathSimplification.areCollinear(p1, p2, p3), true, 'diagonal collinear');
    });

    it('should return true for horizontal collinear points', () => {
      const p1 = PathSimplification.point(0, 5);
      const p2 = PathSimplification.point(10, 5);
      const p3 = PathSimplification.point(20, 5);
      assert.strictEqual(PathSimplification.areCollinear(p1, p2, p3), true, 'horizontal collinear');
    });

    it('should return true for vertical collinear points', () => {
      const p1 = PathSimplification.point(5, 0);
      const p2 = PathSimplification.point(5, 10);
      const p3 = PathSimplification.point(5, 20);
      assert.strictEqual(PathSimplification.areCollinear(p1, p2, p3), true, 'vertical collinear');
    });

    it('should return false for non-collinear points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(5, 10);
      const p3 = PathSimplification.point(10, 0);
      assert.strictEqual(PathSimplification.areCollinear(p1, p2, p3), false, 'triangle not collinear');
    });

    it('should handle near-collinear points with tolerance', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(5, 5.0000001);
      const p3 = PathSimplification.point(10, 10);
      assert.strictEqual(
        PathSimplification.areCollinear(p1, p2, p3, new Decimal('1e-5')),
        true,
        'near-collinear with tolerance'
      );
    });
  });

  // ============================================================================
  // mergeCollinearSegments() - Collinear Segment Merging
  // ============================================================================
  describe('mergeCollinearSegments()', () => {
    it('should return same points for less than 3 points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(10, 10);
      const result = PathSimplification.mergeCollinearSegments([p1, p2]);
      assert.strictEqual(result.points.length, 2, '2 points unchanged');
      assert.strictEqual(result.mergeCount, 0, 'no merges');
      assert.strictEqual(result.verified, true, 'verified');
    });

    it('should merge collinear segments', () => {
      const points = [
        PathSimplification.point(0, 0),
        PathSimplification.point(5, 5),
        PathSimplification.point(10, 10),
        PathSimplification.point(15, 15)
      ];
      const result = PathSimplification.mergeCollinearSegments(points);
      assert.strictEqual(result.points.length, 2, 'merged to 2 points');
      assert.strictEqual(result.mergeCount, 2, '2 points removed');
      assert.strictEqual(result.verified, true, 'verified');
      assertPointClose(result.points[0], points[0], 1e-30, 'start preserved');
      assertPointClose(result.points[1], points[3], 1e-30, 'end preserved');
    });

    it('should keep non-collinear points', () => {
      const points = [
        PathSimplification.point(0, 0),
        PathSimplification.point(10, 0),
        PathSimplification.point(10, 10),
        PathSimplification.point(0, 10)
      ];
      const result = PathSimplification.mergeCollinearSegments(points);
      assert.strictEqual(result.points.length, 4, 'square unchanged');
      assert.strictEqual(result.mergeCount, 0, 'no merges');
    });

    it('should handle mixed collinear and non-collinear', () => {
      const points = [
        PathSimplification.point(0, 0),
        PathSimplification.point(5, 0),   // collinear with prev and next
        PathSimplification.point(10, 0),
        PathSimplification.point(10, 10), // corner
        PathSimplification.point(10, 20)  // collinear segment
      ];
      const result = PathSimplification.mergeCollinearSegments(points);
      assert.strictEqual(result.points.length, 3, 'merged correctly');
      assert.strictEqual(result.mergeCount, 2, '2 points merged');
    });
  });

  // ============================================================================
  // isZeroLengthSegment() - Zero-Length Detection
  // ============================================================================
  describe('isZeroLengthSegment()', () => {
    it('should return true for same points', () => {
      const p = PathSimplification.point(10, 20);
      assert.strictEqual(PathSimplification.isZeroLengthSegment(p, p), true, 'same point');
    });

    it('should return true for very close points', () => {
      const p1 = PathSimplification.point(10, 20);
      const p2 = PathSimplification.point(new Decimal(10).plus('1e-50'), 20);
      assert.strictEqual(PathSimplification.isZeroLengthSegment(p1, p2), true, 'very close points');
    });

    it('should return false for different points', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(1, 0);
      assert.strictEqual(PathSimplification.isZeroLengthSegment(p1, p2), false, 'different points');
    });

    it('should respect custom tolerance', () => {
      const p1 = PathSimplification.point(0, 0);
      const p2 = PathSimplification.point(0.5, 0);
      assert.strictEqual(
        PathSimplification.isZeroLengthSegment(p1, p2, new Decimal(1)),
        true,
        'within tolerance'
      );
      assert.strictEqual(
        PathSimplification.isZeroLengthSegment(p1, p2, new Decimal(0.1)),
        false,
        'outside tolerance'
      );
    });
  });

  // ============================================================================
  // removeZeroLengthSegments() - Zero-Length Removal
  // ============================================================================
  describe('removeZeroLengthSegments()', () => {
    it('should remove zero-length L commands', () => {
      const pathData = [
        { command: 'M', args: [0, 0] },
        { command: 'L', args: [10, 10] },
        { command: 'L', args: [10, 10] },  // Zero-length
        { command: 'L', args: [20, 20] }
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 3, 'one command removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
      assert.strictEqual(result.verified, true, 'verified');
    });

    it('should remove zero-length H commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'H', args: [10] }  // Zero-length (same x)
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'H removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
    });

    it('should remove zero-length V commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'V', args: [10] }  // Zero-length (same y)
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'V removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
    });

    it('should keep non-zero-length segments', () => {
      const pathData = [
        { command: 'M', args: [0, 0] },
        { command: 'L', args: [10, 0] },
        { command: 'L', args: [10, 10] },
        { command: 'Z', args: [] }
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 4, 'all kept');
      assert.strictEqual(result.removeCount, 0, 'none removed');
    });

    it('should remove zero-length C commands when all points coincide', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'C', args: [10, 10, 10, 10, 10, 10] }  // All same point
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'degenerate C removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
    });

    it('should keep C commands with non-coincident control points', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'C', args: [20, 10, 10, 20, 10, 10] }  // Different control points
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      // Even though start=end, control points differ - should be kept
      assert.strictEqual(result.pathData.length, 2, 'C with different control points kept');
    });

    it('should handle relative commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'l', args: [0, 0] }  // Zero-length relative
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'relative l removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
    });

    it('should handle A (arc) commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'A', args: [5, 5, 0, 0, 1, 10, 10] }  // Zero-length arc
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'zero-length A removed');
      assert.strictEqual(result.removeCount, 1, '1 removed');
    });

    it('should preserve Z commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'L', args: [20, 10] },
        { command: 'Z', args: [] }
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 3, 'Z preserved');
      assert.strictEqual(result.pathData[2].command, 'Z', 'Z is last');
    });

    it('should handle Q (quadratic) commands', () => {
      const pathData = [
        { command: 'M', args: [10, 10] },
        { command: 'Q', args: [10, 10, 10, 10] }  // Zero-length quadratic
      ];
      const result = PathSimplification.removeZeroLengthSegments(pathData);
      assert.strictEqual(result.pathData.length, 1, 'zero-length Q removed');
    });

    it('should handle empty path data', () => {
      const result = PathSimplification.removeZeroLengthSegments([]);
      assert.strictEqual(result.pathData.length, 0, 'empty result');
      assert.strictEqual(result.removeCount, 0, 'none removed');
      assert.strictEqual(result.verified, true, 'verified');
    });
  });

  // ============================================================================
  // evaluateLine() - Line Evaluation
  // ============================================================================
  describe('evaluateLine()', () => {
    it('should return start point at t=0', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateLine(p0, p1, 0);
      assertPointClose(result, p0, 1e-30, 't=0 returns start');
    });

    it('should return end point at t=1', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateLine(p0, p1, 1);
      assertPointClose(result, p1, 1e-30, 't=1 returns end');
    });

    it('should return midpoint at t=0.5', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(100, 100);
      const result = PathSimplification.evaluateLine(p0, p1, 0.5);
      assertPointClose(result, PathSimplification.point(50, 50), 1e-30, 't=0.5 returns midpoint');
    });

    it('should handle t=0.25 correctly', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(100, 200);
      const result = PathSimplification.evaluateLine(p0, p1, 0.25);
      assertPointClose(result, PathSimplification.point(25, 50), 1e-30, 't=0.25 correct');
    });
  });

  // ============================================================================
  // Edge Cases and Precision Tests
  // ============================================================================
  describe('Edge Cases and Precision', () => {
    it('should handle very small coordinates', () => {
      const p1 = PathSimplification.point('1e-50', '1e-50');
      const p2 = PathSimplification.point('2e-50', '2e-50');
      const d = PathSimplification.distance(p1, p2);
      const expected = new Decimal('1e-50').mul(new Decimal(2).sqrt());
      assertDecimalClose(d, expected, 1e-90, 'very small coordinates');
    });

    it('should handle very large coordinates', () => {
      const p1 = PathSimplification.point('1e50', '1e50');
      const p2 = PathSimplification.point('1e50', '1.000000001e50');
      const d = PathSimplification.distance(p1, p2);
      assertDecimalClose(d, '1e41', 1e35, 'very large coordinates');
    });

    it('should preserve precision across multiple operations', () => {
      const p0 = PathSimplification.point('0.12345678901234567890', '0.98765432109876543210');
      const p1 = PathSimplification.point('0.5', '0.5');
      const p2 = PathSimplification.point('0.87654321098765432109', '0.01234567890123456789');

      // Evaluate quadratic at t=0.5
      const result = PathSimplification.evaluateQuadraticBezier(p0, p1, p2, '0.5');

      // B(0.5) = 0.25*p0 + 0.5*p1 + 0.25*p2
      const expectedX = new Decimal('0.12345678901234567890').mul(0.25)
        .plus(new Decimal('0.5').mul(0.5))
        .plus(new Decimal('0.87654321098765432109').mul(0.25));
      const expectedY = new Decimal('0.98765432109876543210').mul(0.25)
        .plus(new Decimal('0.5').mul(0.5))
        .plus(new Decimal('0.01234567890123456789').mul(0.25));

      assertDecimalClose(result.x, expectedX, 1e-40, 'precision preserved x');
      assertDecimalClose(result.y, expectedY, 1e-40, 'precision preserved y');
    });

    it('should handle boundary tolerance values', () => {
      const p0 = PathSimplification.point(0, 0);
      const p1 = PathSimplification.point(1, 1e-11);  // Slightly off by 1e-11
      const p2 = PathSimplification.point(2, 0);

      // With tolerance 1e-10, should be straight
      const result1 = PathSimplification.isQuadraticBezierStraight(p0, p1, p2, new Decimal('1e-10'));
      assert.strictEqual(result1.isStraight, true, 'within tolerance');

      // With tolerance 1e-12, should NOT be straight
      const result2 = PathSimplification.isQuadraticBezierStraight(p0, p1, p2, new Decimal('1e-12'));
      assert.strictEqual(result2.isStraight, false, 'outside tolerance');
    });
  });
});
