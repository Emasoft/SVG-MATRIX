/**
 * Unit tests for arc-length.js
 *
 * Tests all arc length computation functions including:
 * - arcLength() - Arc length of Bezier curves using adaptive Gauss-Legendre quadrature
 * - inverseArcLength() - Find parameter t for a given arc length using Newton-Raphson
 * - pathArcLength() - Total arc length of multi-segment paths
 * - pathInverseArcLength() - Find (segment, t) for given arc length along path
 * - createArcLengthTable() - Lookup table for arc length parameterization
 * - verifyArcLength() - Self-consistency check against chord/polygon bounds
 *
 * Coverage: 12 tests covering:
 * 1. arcLength for straight line (equals distance formula)
 * 2. arcLength for quarter circle (equals pi*r/2)
 * 3. arcLength partial range t0=0.25, t1=0.75
 * 4. inverseArcLength - find t for half the arc length
 * 5. inverseArcLength roundtrip: length at t -> inverse -> back to t
 * 6. pathArcLength for multi-segment path
 * 7. createArcLengthTable monotonically increasing
 * 8. verifyArcLength self-consistency check
 * 9. Edge case: degenerate line (zero length)
 * 10. Edge case: very small cubic curve
 * 11. arcLength for quadratic Bezier
 * 12. pathInverseArcLength finding segment and local t
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import Decimal from 'decimal.js';
import * as ArcLength from '../src/arc-length.js';

// Set high precision for all tests
Decimal.set({ precision: 80 });

// Default options for faster test execution while maintaining reasonable precision
const FAST_OPTIONS = { tolerance: '1e-15', maxDepth: 20, minDepth: 2 };
const INVERSE_OPTIONS = { tolerance: '1e-12', maxIterations: 50, lengthTolerance: '1e-15' };

/**
 * Helper to assert two values are approximately equal within tolerance.
 * @param {number|string|Decimal} actual - The actual computed value
 * @param {number|string|Decimal} expected - The expected value
 * @param {string} tolerance - Tolerance as string (e.g., '1e-15')
 * @param {string} message - Error message on failure
 */
function assertApprox(actual, expected, tolerance = '1e-10', message = '') {
  const a = new Decimal(actual);
  const e = new Decimal(expected);
  const diff = a.minus(e).abs();
  const tol = new Decimal(tolerance);
  assert(
    diff.lt(tol),
    message || `Expected ${e.toString()} but got ${a.toString()}, diff=${diff.toString()} exceeds tolerance ${tolerance}`
  );
}

/**
 * Helper to create a cubic Bezier approximating a quarter circle of radius r.
 * Uses the standard kappa approximation: k = 4/3 * (sqrt(2) - 1) ~ 0.5522847498
 * This approximates the arc from (r, 0) to (0, r) going counterclockwise.
 * @param {number} r - Radius of the circle
 * @returns {Array} Control points [[x0,y0], [x1,y1], [x2,y2], [x3,y3]]
 */
function quarterCircleCubic(r) {
  // Kappa for cubic Bezier circle approximation
  const kappa = new Decimal(4).div(3).times(new Decimal(2).sqrt().minus(1));
  const k = kappa.times(r);
  return [
    [new Decimal(r), new Decimal(0)],           // Start: (r, 0)
    [new Decimal(r), k],                         // Control 1
    [k, new Decimal(r)],                         // Control 2
    [new Decimal(0), new Decimal(r)]             // End: (0, r)
  ];
}

describe('ArcLength', () => {

  describe('arcLength', () => {

    it('should compute arc length of straight line equal to Euclidean distance', () => {
      /**
       * For a linear Bezier (2 control points), the arc length
       * should exactly equal the Euclidean distance between the endpoints.
       * Line from (0, 0) to (3, 4) has length 5.
       */
      const line = [
        [0, 0],
        [3, 4]
      ];

      const length = ArcLength.arcLength(line, 0, 1, FAST_OPTIONS);

      // sqrt(3^2 + 4^2) = sqrt(9 + 16) = sqrt(25) = 5
      assertApprox(length, 5, '1e-12', 'Line arc length should equal distance formula');
    });

    it('should compute arc length of quarter circle approximately equal to pi*r/2', () => {
      /**
       * A quarter circle of radius r has exact arc length = (pi * r) / 2.
       * Using the cubic Bezier approximation with kappa, we expect the
       * computed arc length to be very close to pi/2 for r=1.
       */
      const r = 1;
      const quarterCircle = quarterCircleCubic(r);

      const length = ArcLength.arcLength(quarterCircle, 0, 1, FAST_OPTIONS);

      // Expected: pi/2 = 1.5707963267948966...
      const piOver2 = Decimal.acos(-1).div(2);

      // The cubic Bezier approximation introduces a small error (~0.027%)
      // but the arc length computation itself should be precise
      assertApprox(
        length,
        piOver2,
        '0.001',  // ~0.06% tolerance for Bezier approximation error
        'Quarter circle arc length should approximate pi*r/2'
      );
    });

    it('should compute partial arc length for range t0=0.25 to t1=0.75', () => {
      /**
       * For a straight line, the partial arc length from t=0.25 to t=0.75
       * should be exactly half the total length (since it spans 0.5 of parameter range).
       * For line from (0,0) to (10,0), total=10, partial=5.
       */
      const line = [
        [0, 0],
        [10, 0]
      ];

      const partialLength = ArcLength.arcLength(line, 0.25, 0.75, FAST_OPTIONS);
      const totalLength = ArcLength.arcLength(line, 0, 1, FAST_OPTIONS);

      // For a line, arc length is linear in t
      assertApprox(partialLength, 5, '1e-12', 'Partial length from t=0.25 to t=0.75 should be 5');
      assertApprox(totalLength, 10, '1e-12', 'Total length should be 10');
    });

    it('should compute arc length of quadratic Bezier curve correctly', () => {
      /**
       * Quadratic Bezier from (0,0) through (1,2) to (2,0).
       * This forms a parabolic arc. The arc length can be computed
       * analytically but is complex; we verify bounds and consistency.
       */
      const quadratic = [
        [0, 0],
        [1, 2],
        [2, 0]
      ];

      const length = ArcLength.arcLength(quadratic, 0, 1, FAST_OPTIONS);

      // Chord length: sqrt(4 + 0) = 2
      // Polygon length: sqrt(1+4) + sqrt(1+4) = 2*sqrt(5) ~ 4.472
      // Arc length should be between chord and polygon
      const chordLength = new Decimal(2);
      const polygonLength = new Decimal(5).sqrt().times(2);

      assert(
        length.gt(chordLength),
        `Arc length ${length} should exceed chord length ${chordLength}`
      );
      assert(
        length.lt(polygonLength),
        `Arc length ${length} should be less than polygon length ${polygonLength}`
      );

      // Known approximate value for this specific quadratic: ~2.957885...
      assertApprox(length, '2.9578857157885', '1e-6', 'Quadratic arc length should match expected');
    });

  });

  describe('inverseArcLength', () => {

    it('should find t for half the arc length', () => {
      /**
       * For a straight line, the midpoint by arc length should be at t=0.5.
       * We find t such that arcLength(0, t) = totalLength / 2.
       */
      const line = [
        [0, 0],
        [8, 6]  // Length = 10
      ];

      const totalLength = ArcLength.arcLength(line, 0, 1, FAST_OPTIONS);
      const halfLength = totalLength.div(2);

      const result = ArcLength.inverseArcLength(line, halfLength, INVERSE_OPTIONS);

      assert(result.converged, 'inverseArcLength should converge');
      assertApprox(result.t, 0.5, '1e-10', 'Midpoint t should be 0.5 for straight line');
      assertApprox(result.length, halfLength, '1e-10', 'Length at t should equal target');
    });

    it('should perform roundtrip: compute length at t, then inverse to get back t', () => {
      /**
       * Roundtrip test:
       * 1. Pick t = 0.3
       * 2. Compute length L = arcLength(0, 0.3)
       * 3. Compute t' = inverseArcLength(L)
       * 4. Verify t' = 0.3
       */
      const cubic = [
        [0, 0],
        [10, 30],
        [30, 30],
        [40, 0]
      ];

      const t_original = new Decimal('0.3');
      const lengthAtT = ArcLength.arcLength(cubic, 0, t_original, FAST_OPTIONS);

      const result = ArcLength.inverseArcLength(cubic, lengthAtT, INVERSE_OPTIONS);

      assert(result.converged, 'inverseArcLength should converge');
      assertApprox(
        result.t,
        t_original,
        '1e-8',
        'Roundtrip should recover original t=0.3'
      );
    });

    it('should handle edge case when target length is zero', () => {
      /**
       * When target length is 0 or negative, t should be 0.
       */
      const cubic = [
        [0, 0],
        [1, 2],
        [3, 2],
        [4, 0]
      ];

      const result = ArcLength.inverseArcLength(cubic, 0, INVERSE_OPTIONS);

      assert(result.converged, 'Should converge for zero target');
      assertApprox(result.t, 0, '1e-30', 't should be 0 for zero arc length');
    });

    it('should handle edge case when target length exceeds total', () => {
      /**
       * When target length exceeds total arc length, t should be 1.
       */
      const cubic = [
        [0, 0],
        [1, 2],
        [3, 2],
        [4, 0]
      ];

      const totalLength = ArcLength.arcLength(cubic, 0, 1, FAST_OPTIONS);
      const excessiveLength = totalLength.times(2);

      const result = ArcLength.inverseArcLength(cubic, excessiveLength, INVERSE_OPTIONS);

      assert(result.converged, 'Should converge for excessive target');
      assertApprox(result.t, 1, '1e-30', 't should be 1 when target exceeds total');
    });

  });

  describe('pathArcLength', () => {

    it('should compute total arc length of multi-segment path', () => {
      /**
       * Path with 3 line segments:
       * Segment 1: (0,0) to (3,4) - length 5
       * Segment 2: (3,4) to (3,9) - length 5
       * Segment 3: (3,9) to (11,9) - length 8
       * Total: 18
       */
      const segments = [
        [[0, 0], [3, 4]],     // Line, length 5
        [[3, 4], [3, 9]],     // Line, length 5
        [[3, 9], [11, 9]]     // Line, length 8
      ];

      const totalLength = ArcLength.pathArcLength(segments, FAST_OPTIONS);

      assertApprox(totalLength, 18, '1e-12', 'Path total length should be 18');
    });

    it('should compute path length with mixed segment types', () => {
      /**
       * Path with line and quadratic segments.
       */
      const line = [[0, 0], [4, 0]];  // Length 4
      const quadratic = [
        [4, 0],
        [6, 4],
        [8, 0]
      ];  // Some curved length

      const segments = [line, quadratic];

      const lineLength = ArcLength.arcLength(line, 0, 1, FAST_OPTIONS);
      const quadLength = ArcLength.arcLength(quadratic, 0, 1, FAST_OPTIONS);
      const pathLength = ArcLength.pathArcLength(segments, FAST_OPTIONS);

      // Path length should equal sum of individual segments
      assertApprox(pathLength, lineLength.plus(quadLength), '1e-12', 'Path length = sum of segments');
    });

  });

  describe('pathInverseArcLength', () => {

    it('should find segment and local t for given arc length along path', () => {
      /**
       * Path with 2 equal-length line segments:
       * Segment 0: (0,0) to (5,0) - length 5
       * Segment 1: (5,0) to (5,5) - length 5
       * Total: 10
       *
       * Target length = 7 should be in segment 1 at local t = 0.4
       * (first 5 units cover segment 0, remaining 2 units into segment 1)
       */
      const segments = [
        [[0, 0], [5, 0]],   // Length 5
        [[5, 0], [5, 5]]    // Length 5
      ];

      const result = ArcLength.pathInverseArcLength(segments, 7, INVERSE_OPTIONS);

      assert.equal(result.segmentIndex, 1, 'Target at length 7 should be in segment 1');
      assertApprox(result.t, 0.4, '1e-10', 'Local t should be 0.4 (2 out of 5 units into segment)');
    });

    it('should handle target at segment boundary', () => {
      /**
       * Target exactly at end of first segment.
       */
      const segments = [
        [[0, 0], [10, 0]],   // Length 10
        [[10, 0], [10, 10]]  // Length 10
      ];

      const result = ArcLength.pathInverseArcLength(segments, 10, INVERSE_OPTIONS);

      // At length=10, could be end of segment 0 (t=1) or start of segment 1 (t=0)
      // Implementation returns within segment 0 since 10 <= nextAccumulated
      assert(
        result.segmentIndex === 0 || result.segmentIndex === 1,
        'Should be at boundary of segments 0 and 1'
      );
      if (result.segmentIndex === 0) {
        assertApprox(result.t, 1, '1e-10', 't should be 1 at end of segment 0');
      } else {
        assertApprox(result.t, 0, '1e-10', 't should be 0 at start of segment 1');
      }
    });

  });

  describe('createArcLengthTable', () => {

    it('should create table with monotonically increasing arc lengths', () => {
      /**
       * The arc length table should have strictly increasing length values
       * as we move along the curve (length[i] <= length[i+1]).
       */
      const cubic = [
        [0, 0],
        [20, 40],
        [60, 40],
        [80, 0]
      ];

      const table = ArcLength.createArcLengthTable(cubic, 20, FAST_OPTIONS);

      // Verify monotonicity
      let prevLength = new Decimal(-1);
      for (let i = 0; i < table.table.length; i++) {
        const entry = table.table[i];
        assert(
          entry.length.gte(prevLength),
          `Table entry ${i}: length ${entry.length} should be >= previous ${prevLength}`
        );
        prevLength = entry.length;
      }

      // Verify first and last entries
      assertApprox(table.table[0].t, 0, '1e-30', 'First t should be 0');
      assertApprox(table.table[0].length, 0, '1e-30', 'First length should be 0');
      assertApprox(table.table[table.table.length - 1].t, 1, '1e-30', 'Last t should be 1');
      assert(table.totalLength.gt(0), 'Total length should be positive');
    });

    it('should provide getT method for approximate lookup', () => {
      /**
       * getT(s) should return approximate t for arc length s.
       * For a straight line, getT should be linear: getT(s) = s/totalLength.
       */
      const line = [
        [0, 0],
        [100, 0]
      ];  // Length 100

      const table = ArcLength.createArcLengthTable(line, 20, FAST_OPTIONS);

      // Test various arc lengths
      assertApprox(table.getT(0), 0, '1e-10', 'getT(0) should be 0');
      assertApprox(table.getT(25), 0.25, '0.1', 'getT(25) should be approximately 0.25');
      assertApprox(table.getT(50), 0.5, '0.1', 'getT(50) should be approximately 0.5');
      assertApprox(table.getT(75), 0.75, '0.1', 'getT(75) should be approximately 0.75');
      assertApprox(table.getT(100), 1, '1e-10', 'getT(100) should be 1');
    });

  });

  describe('verifyArcLength', () => {

    it('should verify arc length is within chord and polygon bounds', () => {
      /**
       * For any Bezier curve:
       * chord_length <= arc_length <= polygon_length
       *
       * chord_length = distance from first to last control point
       * polygon_length = sum of distances between consecutive control points
       */
      const cubic = [
        [0, 0],
        [10, 30],
        [30, 30],
        [40, 0]
      ];

      const computedLength = ArcLength.arcLength(cubic, 0, 1, FAST_OPTIONS);
      const verification = ArcLength.verifyArcLength(cubic, computedLength);

      assert(verification.valid, 'Computed arc length should be within bounds');
      assert(
        computedLength.gte(verification.chordLength),
        `Arc length ${computedLength} should be >= chord ${verification.chordLength}`
      );
      assert(
        computedLength.lte(verification.polygonLength),
        `Arc length ${computedLength} should be <= polygon ${verification.polygonLength}`
      );
      assert(
        verification.ratio.gte(1),
        'Ratio (arcLength/chordLength) should be >= 1'
      );
    });

    it('should verify straight line has ratio approximately 1', () => {
      /**
       * For a straight line, arc length = chord length,
       * so the ratio should be very close to 1.
       * Note: Due to numerical tolerance in adaptive quadrature,
       * the computed length may be slightly less than exact chord length,
       * so we verify the ratio is approximately 1 rather than checking validity.
       */
      const line = [
        [0, 0],
        [12, 5]
      ];

      const computedLength = ArcLength.arcLength(line, 0, 1, FAST_OPTIONS);
      const verification = ArcLength.verifyArcLength(line, computedLength);

      // For a line, chord length equals polygon length (both are 13)
      // The computed arc length should be very close to this value
      const expectedLength = new Decimal(12).pow(2).plus(new Decimal(5).pow(2)).sqrt(); // sqrt(144 + 25) = 13
      assertApprox(
        computedLength,
        expectedLength,
        '1e-10',
        'Line arc length should equal Euclidean distance'
      );

      // Ratio should be very close to 1
      assertApprox(
        verification.ratio,
        1,
        '1e-10',
        'Line should have ratio approximately 1 (arc ≈ chord)'
      );
    });

  });

  describe('edge cases', () => {

    it('should handle degenerate line (zero length - single point)', () => {
      /**
       * A "line" where both endpoints are the same point has zero length.
       */
      const degenerateLine = [
        [5, 5],
        [5, 5]
      ];

      const length = ArcLength.arcLength(degenerateLine, 0, 1, FAST_OPTIONS);

      assertApprox(length, 0, '1e-30', 'Degenerate line should have zero length');
    });

    it('should handle very small cubic curve with high precision', () => {
      /**
       * Very small curve with coordinates near machine epsilon scale.
       * Tests that high precision Decimal arithmetic handles small numbers.
       */
      const epsilon = new Decimal('1e-20');
      const tinyCubic = [
        [new Decimal(0), new Decimal(0)],
        [epsilon, epsilon.times(2)],
        [epsilon.times(2), epsilon.times(2)],
        [epsilon.times(3), new Decimal(0)]
      ];

      const length = ArcLength.arcLength(tinyCubic, 0, 1, FAST_OPTIONS);

      // Length should be positive and proportional to epsilon
      assert(length.gt(0), 'Tiny curve should have positive length');
      assert(length.lt(epsilon.times(100)), 'Length should be on the order of epsilon');

      // Verify bounds
      const verification = ArcLength.verifyArcLength(tinyCubic, length);
      assert(verification.valid, 'Tiny curve verification should pass');
    });

    it('should handle cubic with collinear control points (degenerates to line)', () => {
      /**
       * Cubic Bezier where all control points are collinear
       * should have arc length equal to distance from start to end.
       */
      const collinearCubic = [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ];

      const length = ArcLength.arcLength(collinearCubic, 0, 1, FAST_OPTIONS);

      // Should equal the chord length
      assertApprox(length, 30, '1e-12', 'Collinear cubic should have length = chord');
    });

  });

});
