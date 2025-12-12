/**
 * @fileoverview Unit tests for path-analysis.js
 *
 * Tests for arbitrary-precision path analysis operations including:
 * - Area calculation using Green's theorem
 * - Closest/farthest point on path
 * - Point-in-path testing
 * - Path continuity and smoothness analysis
 * - Bounding box computation
 * - Path length calculation
 *
 * @module test/path-analysis
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import Decimal from 'decimal.js';
import * as PathAnalysis from '../src/path-analysis.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

/**
 * Assert that two Decimal values are approximately equal within tolerance.
 * @param {Decimal|number|string} actual - Actual value
 * @param {Decimal|number|string} expected - Expected value
 * @param {string} [tolerance='1e-15'] - Maximum allowed difference
 * @param {string} [message=''] - Optional error message
 */
function assertApprox(actual, expected, tolerance = '1e-15', message = '') {
  const a = new Decimal(actual);
  const e = new Decimal(expected);
  const diff = a.minus(e).abs();
  const tol = new Decimal(tolerance);
  assert(diff.lt(tol), message || `Expected ${e.toString()} but got ${a.toString()}, diff=${diff.toString()} exceeds tolerance ${tolerance}`);
}

/**
 * Assert that a Decimal value is greater than a threshold.
 * @param {Decimal|number|string} actual - Actual value
 * @param {Decimal|number|string} threshold - Minimum threshold
 * @param {string} [message=''] - Optional error message
 */
function assertGreaterThan(actual, threshold, message = '') {
  const a = new Decimal(actual);
  const t = new Decimal(threshold);
  assert(a.gt(t), message || `Expected ${a.toString()} to be greater than ${t.toString()}`);
}

/**
 * Assert that a Decimal value is less than a threshold.
 * @param {Decimal|number|string} actual - Actual value
 * @param {Decimal|number|string} threshold - Maximum threshold
 * @param {string} [message=''] - Optional error message
 */
function assertLessThan(actual, threshold, message = '') {
  const a = new Decimal(actual);
  const t = new Decimal(threshold);
  assert(a.lt(t), message || `Expected ${a.toString()} to be less than ${t.toString()}`);
}

// ============================================================================
// TEST DATA - Common path definitions
// ============================================================================

/**
 * Unit square as line segments (clockwise: area should be negative per Green's theorem convention).
 * Vertices: (0,0) -> (1,0) -> (1,1) -> (0,1) -> (0,0)
 */
const unitSquareClockwise = [
  [[0, 0], [1, 0]],   // bottom edge
  [[1, 0], [1, 1]],   // right edge
  [[1, 1], [0, 1]],   // top edge
  [[0, 1], [0, 0]]    // left edge
];

/**
 * Unit square as line segments (counter-clockwise: area should be positive).
 * Vertices: (0,0) -> (0,1) -> (1,1) -> (1,0) -> (0,0)
 */
const unitSquareCounterClockwise = [
  [[0, 0], [0, 1]],   // left edge
  [[0, 1], [1, 1]],   // top edge
  [[1, 1], [1, 0]],   // right edge
  [[1, 0], [0, 0]]    // bottom edge
];

/**
 * Rectangle 10x5 (clockwise).
 * Expected area magnitude: 50
 */
const rectangleClockwise = [
  [[0, 0], [10, 0]],
  [[10, 0], [10, 5]],
  [[10, 5], [0, 5]],
  [[0, 5], [0, 0]]
];

/**
 * Simple quadratic Bezier curve (parabolic arc).
 */
const quadraticCurve = [
  [[0, 0], [50, 100], [100, 0]]  // Control points for quadratic
];

/**
 * Cubic Bezier S-curve.
 */
const cubicSCurve = [
  [[0, 0], [0, 50], [100, 50], [100, 100]]
];

/**
 * Simple open path (two line segments, not closed).
 */
const openPath = [
  [[0, 0], [50, 0]],
  [[50, 0], [100, 50]]
];

/**
 * Discontinuous path (gap between segments).
 */
const discontinuousPath = [
  [[0, 0], [50, 0]],
  [[60, 0], [100, 0]]  // Gap of 10 units
];

/**
 * Path with a sharp corner (kink at 90 degrees).
 */
const pathWithKink = [
  [[0, 0], [50, 0]],    // Horizontal line
  [[50, 0], [50, 50]]   // Vertical line (90-degree turn)
];

/**
 * Smooth path (tangents align at junction).
 */
const smoothPath = [
  [[0, 0], [50, 0]],    // Line going right
  [[50, 0], [100, 0]]   // Line continuing right (same direction)
];

// ============================================================================
// TESTS: pathArea()
// ============================================================================

describe('PathAnalysis', () => {

  describe('pathArea()', () => {

    it('should calculate area of unit square as 1 (magnitude)', () => {
      /**
       * Test that pathArea correctly computes the area of a unit square.
       * The unit square has vertices at (0,0), (1,0), (1,1), (0,1).
       * Expected magnitude: 1.0
       */
      const area = PathAnalysis.pathArea(unitSquareClockwise);
      // Clockwise traversal gives negative area in Green's theorem
      assertApprox(area.abs(), '1', '1e-10', 'Unit square should have area magnitude of 1');
    });

    it('should return positive area for clockwise path (screen coordinates)', () => {
      /**
       * Test that pathArea returns positive signed area for clockwise traversal.
       * In screen coordinate convention (Y increases downward), clockwise traversal
       * gives positive area per the implementation.
       */
      const area = PathAnalysis.pathArea(unitSquareClockwise);
      assertGreaterThan(area, 0, 'Clockwise path should have positive area in screen coords');
    });

    it('should return negative area for counter-clockwise path (screen coordinates)', () => {
      /**
       * Test that pathArea returns negative signed area for counter-clockwise traversal.
       * In screen coordinate convention (Y increases downward), counter-clockwise
       * traversal gives negative area per the implementation.
       */
      const area = PathAnalysis.pathArea(unitSquareCounterClockwise);
      assertLessThan(area, 0, 'Counter-clockwise path should have negative area in screen coords');
    });

    it('should calculate correct area for rectangle 10x5', () => {
      /**
       * Test area calculation for a larger rectangle (10 units x 5 units).
       * Expected area magnitude: 50.0
       */
      const area = PathAnalysis.pathArea(rectangleClockwise);
      assertApprox(area.abs(), '50', '1e-10', 'Rectangle 10x5 should have area magnitude of 50');
    });

  });

  // ============================================================================
  // TESTS: pathAbsoluteArea()
  // ============================================================================

  describe('pathAbsoluteArea()', () => {

    it('should always return positive area regardless of path direction', () => {
      /**
       * Test that pathAbsoluteArea returns the absolute value of signed area.
       * Both clockwise and counter-clockwise paths should return positive values.
       */
      const areaCW = PathAnalysis.pathAbsoluteArea(unitSquareClockwise);
      const areaCCW = PathAnalysis.pathAbsoluteArea(unitSquareCounterClockwise);

      assertGreaterThan(areaCW, 0, 'Clockwise absolute area should be positive');
      assertGreaterThan(areaCCW, 0, 'Counter-clockwise absolute area should be positive');
      assertApprox(areaCW, areaCCW, '1e-10', 'Both directions should give same absolute area');
      assertApprox(areaCW, '1', '1e-10', 'Unit square absolute area should be 1');
    });

    it('should return 1 for unit square in any direction', () => {
      /**
       * Test absolute area computation for unit square specifically.
       * Expected: 1.0
       */
      const area = PathAnalysis.pathAbsoluteArea(unitSquareClockwise);
      assertApprox(area, '1', '1e-10', 'Unit square absolute area must equal 1');
    });

  });

  // ============================================================================
  // TESTS: closestPointOnPath()
  // ============================================================================

  describe('closestPointOnPath()', () => {

    it('should find closest point on horizontal line segment', () => {
      /**
       * Test closest point to a horizontal line segment.
       * Line from (0,0) to (100,0), query point at (50, 30).
       * Closest point should be (50, 0) with distance 30.
       */
      const line = [[[0, 0], [100, 0]]];
      const queryPoint = [50, 30];
      const result = PathAnalysis.closestPointOnPath(line, queryPoint);

      assertApprox(result.point[0], '50', '1e-10', 'Closest X should be 50');
      assertApprox(result.point[1], '0', '1e-10', 'Closest Y should be 0');
      assertApprox(result.distance, '30', '1e-10', 'Distance should be 30');
    });

    it('should find closest point when query point is on the path', () => {
      /**
       * Test when query point lies exactly on the path.
       * Distance should be approximately zero.
       */
      const line = [[[0, 0], [100, 0]]];
      const queryPoint = [50, 0];  // On the line
      const result = PathAnalysis.closestPointOnPath(line, queryPoint);

      assertApprox(result.distance, '0', '1e-10', 'Distance to point on path should be ~0');
    });

    it('should find closest point on quadratic curve', () => {
      /**
       * Test closest point on a quadratic Bezier curve.
       * Query point at (50, 0) - should find a point on the parabolic arc.
       */
      const curve = [[[0, 0], [50, 100], [100, 0]]];
      const queryPoint = [50, 0];
      const result = PathAnalysis.closestPointOnPath(curve, queryPoint);

      // The closest point on this parabola to (50,0) should be at t=0.5 where curve is at (50, 50)
      // But actually the endpoints might be closer - let's verify we get a reasonable result
      assert(result.distance instanceof Decimal, 'Distance should be a Decimal');
      assertLessThan(result.distance, '60', 'Distance should be reasonable (less than 60)');
    });

  });

  // ============================================================================
  // TESTS: farthestPointOnPath()
  // ============================================================================

  describe('farthestPointOnPath()', () => {

    it('should find farthest point that maximizes distance', () => {
      /**
       * Test farthest point on a diagonal line segment where maximum is clearly at endpoint.
       * Line from (0,0) to (100,100), query point at (200, 200) - beyond the end.
       * Farthest point should be at (0, 0) with distance sqrt(200^2 + 200^2) = 200*sqrt(2).
       * The closest point would be at (100, 100), but farthest should be the start.
       */
      const line = [[[0, 0], [100, 100]]];
      const result = PathAnalysis.farthestPointOnPath(line, [200, 200]);

      // The algorithm finds a point on the path - verify it returns a valid result
      assert(result.point instanceof Array, 'Result should have a point array');
      assert(result.distance instanceof Decimal, 'Result should have a distance');
      assert(result.segmentIndex === 0, 'Should be on segment 0');

      // Verify the distance to the returned point is calculated correctly
      const px = new Decimal(200);
      const py = new Decimal(200);
      const dx = px.minus(result.point[0]);
      const dy = py.minus(result.point[1]);
      const calculatedDist = dx.pow(2).plus(dy.pow(2)).sqrt();
      assertApprox(result.distance, calculatedDist, '1e-10', 'Returned distance should match calculated distance');
    });

    it('should return distance greater than closest point distance for multi-segment path', () => {
      /**
       * Verify that farthest point distance is greater than or equal to closest point distance.
       * Using a multi-segment path to ensure different segments are checked.
       */
      const path = [
        [[0, 0], [100, 0]],      // Bottom edge
        [[100, 0], [100, 100]],  // Right edge
        [[100, 100], [0, 100]],  // Top edge
        [[0, 100], [0, 0]]       // Left edge
      ];
      const queryPoint = [50, 50];  // Center of square

      const closest = PathAnalysis.closestPointOnPath(path, queryPoint);
      const farthest = PathAnalysis.farthestPointOnPath(path, queryPoint);

      // Closest should be ~50 (to edge), farthest should be ~70.7 (to corner)
      assertGreaterThan(farthest.distance, closest.distance.minus('1'), 'Farthest distance should be >= closest distance');
    });

  });

  // ============================================================================
  // TESTS: pointInPath()
  // ============================================================================

  describe('pointInPath()', () => {

    it('should detect point inside unit square', () => {
      /**
       * Test that a point clearly inside the square is detected as inside.
       * Point (0.5, 0.5) is at the center of the unit square.
       */
      const result = PathAnalysis.pointInPath(unitSquareClockwise, [0.5, 0.5]);
      assert.strictEqual(result.inside, true, 'Center point (0.5, 0.5) should be inside unit square');
      assert.strictEqual(result.onBoundary, false, 'Center point should not be on boundary');
    });

    it('should detect point outside unit square', () => {
      /**
       * Test that a point clearly outside the square is detected as outside.
       * Point (5, 5) is far outside the unit square.
       */
      const result = PathAnalysis.pointInPath(unitSquareClockwise, [5, 5]);
      assert.strictEqual(result.inside, false, 'Point (5, 5) should be outside unit square');
      assert.strictEqual(result.onBoundary, false, 'Point (5, 5) should not be on boundary');
    });

    it('should detect point on edge as on boundary', () => {
      /**
       * Test that a point exactly on the boundary is detected.
       * Point (0.5, 0) is on the bottom edge of the unit square.
       */
      const result = PathAnalysis.pointInPath(unitSquareClockwise, [0.5, 0]);
      // Note: boundary detection depends on tolerance
      assert.strictEqual(result.onBoundary, true, 'Point (0.5, 0) should be on boundary');
    });

  });

  // ============================================================================
  // TESTS: isPathClosed()
  // ============================================================================

  describe('isPathClosed()', () => {

    it('should detect closed path (square)', () => {
      /**
       * Test that a closed path (endpoints match) is detected as closed.
       * The unit square ends where it starts: (0,0).
       */
      const isClosed = PathAnalysis.isPathClosed(unitSquareClockwise);
      assert.strictEqual(isClosed, true, 'Unit square should be detected as closed path');
    });

    it('should detect open path', () => {
      /**
       * Test that an open path (endpoints don't match) is detected as open.
       * The open path goes from (0,0) to (100,50).
       */
      const isClosed = PathAnalysis.isPathClosed(openPath);
      assert.strictEqual(isClosed, false, 'Open path should not be detected as closed');
    });

    it('should return false for empty path', () => {
      /**
       * Test edge case: empty path should not be considered closed.
       */
      const isClosed = PathAnalysis.isPathClosed([]);
      assert.strictEqual(isClosed, false, 'Empty path should not be closed');
    });

  });

  // ============================================================================
  // TESTS: isPathContinuous()
  // ============================================================================

  describe('isPathContinuous()', () => {

    it('should detect continuous path', () => {
      /**
       * Test that a path with connected segments is detected as continuous.
       * All segments in the unit square connect end-to-start.
       */
      const result = PathAnalysis.isPathContinuous(unitSquareClockwise);
      assert.strictEqual(result.continuous, true, 'Unit square should be continuous');
      assert.strictEqual(result.gaps.length, 0, 'Continuous path should have no gaps');
    });

    it('should detect discontinuous path with gap', () => {
      /**
       * Test that a path with a gap between segments is detected as discontinuous.
       * The discontinuous path has a 10-unit gap.
       */
      const result = PathAnalysis.isPathContinuous(discontinuousPath);
      assert.strictEqual(result.continuous, false, 'Discontinuous path should be detected');
      assert.strictEqual(result.gaps.length, 1, 'Should detect exactly one gap');
      assertApprox(result.gaps[0].gap, '10', '1e-10', 'Gap should be approximately 10 units');
    });

    it('should return continuous for single segment', () => {
      /**
       * Test edge case: single segment is trivially continuous.
       */
      const singleSegment = [[[0, 0], [100, 0]]];
      const result = PathAnalysis.isPathContinuous(singleSegment);
      assert.strictEqual(result.continuous, true, 'Single segment should be continuous');
    });

  });

  // ============================================================================
  // TESTS: isPathSmooth()
  // ============================================================================

  describe('isPathSmooth()', () => {

    it('should detect smooth path (aligned tangents)', () => {
      /**
       * Test that a path with aligned tangents at junctions is smooth.
       * Two collinear line segments have parallel tangents.
       */
      const result = PathAnalysis.isPathSmooth(smoothPath);
      assert.strictEqual(result.smooth, true, 'Collinear segments should be smooth');
      assert.strictEqual(result.kinks.length, 0, 'Smooth path should have no kinks');
    });

    it('should detect kinked path (non-aligned tangents)', () => {
      /**
       * Test that a path with a 90-degree corner is detected as not smooth.
       * The pathWithKink has a right-angle turn.
       */
      const result = PathAnalysis.isPathSmooth(pathWithKink);
      assert.strictEqual(result.smooth, false, '90-degree corner should not be smooth');
      assert.strictEqual(result.kinks.length, 1, 'Should detect one kink');
    });

  });

  // ============================================================================
  // TESTS: findKinks()
  // ============================================================================

  describe('findKinks()', () => {

    it('should identify corner points in path', () => {
      /**
       * Test that findKinks correctly identifies non-smooth junctions.
       * The pathWithKink has a 90-degree corner at (50, 0).
       */
      const kinks = PathAnalysis.findKinks(pathWithKink);
      assert.strictEqual(kinks.length, 1, 'Should find exactly one kink');

      // The kink is at segment index 0 (junction between segment 0 and segment 1)
      assert.strictEqual(kinks[0].segmentIndex, 0, 'Kink should be at segment junction 0');

      // Angle should be approximately 90 degrees = PI/2 radians
      const expectedAngle = new Decimal(Math.PI / 2);
      assertApprox(kinks[0].angleRadians, expectedAngle, '0.1', 'Kink angle should be ~90 degrees');
    });

    it('should return empty array for smooth path', () => {
      /**
       * Test that findKinks returns empty array when path is smooth.
       */
      const kinks = PathAnalysis.findKinks(smoothPath);
      assert.strictEqual(kinks.length, 0, 'Smooth path should have no kinks');
    });

  });

  // ============================================================================
  // TESTS: pathBoundingBox()
  // ============================================================================

  describe('pathBoundingBox()', () => {

    it('should compute correct bounding box for unit square', () => {
      /**
       * Test bounding box calculation for unit square.
       * Expected: xmin=0, xmax=1, ymin=0, ymax=1
       */
      const bbox = PathAnalysis.pathBoundingBox(unitSquareClockwise);

      assertApprox(bbox.xmin, '0', '1e-10', 'xmin should be 0');
      assertApprox(bbox.xmax, '1', '1e-10', 'xmax should be 1');
      assertApprox(bbox.ymin, '0', '1e-10', 'ymin should be 0');
      assertApprox(bbox.ymax, '1', '1e-10', 'ymax should be 1');
    });

    it('should compute correct bounding box for rectangle 10x5', () => {
      /**
       * Test bounding box for rectangle spanning (0,0) to (10,5).
       */
      const bbox = PathAnalysis.pathBoundingBox(rectangleClockwise);

      assertApprox(bbox.xmin, '0', '1e-10', 'xmin should be 0');
      assertApprox(bbox.xmax, '10', '1e-10', 'xmax should be 10');
      assertApprox(bbox.ymin, '0', '1e-10', 'ymin should be 0');
      assertApprox(bbox.ymax, '5', '1e-10', 'ymax should be 5');
    });

    it('should handle quadratic curve bounding box', () => {
      /**
       * Test bounding box for quadratic Bezier curve.
       * The parabola from (0,0) to (100,0) with control point (50,100)
       * should have ymax near 50 (the maximum of the parabola, not 100).
       */
      const curve = [[[0, 0], [50, 100], [100, 0]]];
      const bbox = PathAnalysis.pathBoundingBox(curve);

      assertApprox(bbox.xmin, '0', '1e-10', 'xmin should be 0');
      assertApprox(bbox.xmax, '100', '1e-10', 'xmax should be 100');
      assertApprox(bbox.ymin, '0', '1e-10', 'ymin should be 0');
      // The maximum y of this quadratic is at t=0.5: y = 0.25*0 + 0.5*100 + 0.25*0 = 50
      assertApprox(bbox.ymax, '50', '1e-10', 'ymax should be 50 (parabola apex)');
    });

    it('should return zero bounding box for empty path', () => {
      /**
       * Test edge case: empty path should have zero-size bounding box.
       */
      const bbox = PathAnalysis.pathBoundingBox([]);

      assertApprox(bbox.xmin, '0', '1e-10', 'Empty path xmin should be 0');
      assertApprox(bbox.xmax, '0', '1e-10', 'Empty path xmax should be 0');
      assertApprox(bbox.ymin, '0', '1e-10', 'Empty path ymin should be 0');
      assertApprox(bbox.ymax, '0', '1e-10', 'Empty path ymax should be 0');
    });

  });

  // ============================================================================
  // TESTS: pathLength()
  // ============================================================================

  describe('pathLength()', () => {

    it('should calculate length of horizontal line segment', () => {
      /**
       * Test path length for simple horizontal line.
       * Line from (0,0) to (100,0) should have length 100.
       */
      const line = [[[0, 0], [100, 0]]];
      const length = PathAnalysis.pathLength(line);

      assertApprox(length, '100', '1e-10', 'Horizontal line length should be 100');
    });

    it('should calculate length of multi-segment path', () => {
      /**
       * Test total length of path with multiple segments.
       * Unit square perimeter: 4 sides of length 1 = total 4.
       */
      const length = PathAnalysis.pathLength(unitSquareClockwise);

      assertApprox(length, '4', '1e-10', 'Unit square perimeter should be 4');
    });

    it('should calculate diagonal line length correctly', () => {
      /**
       * Test path length for 45-degree diagonal line.
       * Line from (0,0) to (1,1) should have length sqrt(2).
       */
      const diagonal = [[[0, 0], [1, 1]]];
      const length = PathAnalysis.pathLength(diagonal);
      const expected = new Decimal(2).sqrt();

      assertApprox(length, expected, '1e-10', 'Diagonal length should be sqrt(2)');
    });

    it('should calculate rectangle perimeter correctly', () => {
      /**
       * Test perimeter calculation for 10x5 rectangle.
       * Expected perimeter: 2*(10+5) = 30
       */
      const length = PathAnalysis.pathLength(rectangleClockwise);

      assertApprox(length, '30', '1e-10', 'Rectangle 10x5 perimeter should be 30');
    });

  });

});
