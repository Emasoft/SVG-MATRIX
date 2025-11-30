/**
 * Tests for polygon-clip.js - Decimal.js polygon boolean operations
 */

import Decimal from 'decimal.js';
import {
  point,
  pointsEqual,
  cross,
  dot,
  sign,
  segmentIntersection,
  lineSegmentIntersection,
  pointInPolygon,
  pointOnSegment,
  clipPolygonSH,
  polygonArea,
  isCounterClockwise,
  reversePolygon,
  ensureCCW,
  isConvex,
  convexHull,
  boundingBox,
  bboxIntersects,
  polygonIntersection,
  polygonUnion,
  polygonDifference
} from '../src/polygon-clip.js';

Decimal.set({ precision: 80 });

// Helper to convert Decimal points to readable format
function formatPoint(p) {
  return `(${p.x.toFixed(4)}, ${p.y.toFixed(4)})`;
}

function formatPolygon(poly) {
  return poly.map(formatPoint).join(' -> ');
}

// Test results tracking
const results = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    passed++;
  } catch (e) {
    results.push({ name, status: 'FAIL', error: e.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertClose(actual, expected, tolerance = 1e-10, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(message || `Expected ${expected}, got ${actual} (diff: ${diff})`);
  }
}

// ============================================================================
// Point and Vector Primitives Tests
// ============================================================================

test('point() creates Decimal coordinates', () => {
  const p = point(3.5, 4.5);
  assert(p.x instanceof Decimal, 'x should be Decimal');
  assert(p.y instanceof Decimal, 'y should be Decimal');
  assertClose(p.x.toNumber(), 3.5);
  assertClose(p.y.toNumber(), 4.5);
});

test('point() handles string input with high precision', () => {
  const p = point('1.23456789012345678901234567890', '9.87654321098765432109876543210');
  // Decimal.js trims trailing zeros, so we compare numerically
  const expected = new Decimal('1.23456789012345678901234567890');
  assert(p.x.eq(expected), `High precision should be preserved: ${p.x} vs ${expected}`);
});

test('pointsEqual() detects identical points', () => {
  const p1 = point(1, 2);
  const p2 = point(1, 2);
  assert(pointsEqual(p1, p2), 'Identical points should be equal');
});

test('pointsEqual() detects different points', () => {
  const p1 = point(1, 2);
  const p2 = point(1.001, 2);
  assert(!pointsEqual(p1, p2), 'Different points should not be equal');
});

test('cross() computes correct value for CCW', () => {
  const o = point(0, 0);
  const a = point(1, 0);
  const b = point(0, 1);
  // Cross product of (1,0) and (0,1) from origin should be positive (CCW)
  const c = cross(o, a, b);
  assert(c.gt(0), `Cross product should be positive for CCW, got ${c}`);
});

test('cross() computes correct value for CW', () => {
  const o = point(0, 0);
  const a = point(0, 1);
  const b = point(1, 0);
  // Cross product in CW order should be negative
  const c = cross(o, a, b);
  assert(c.lt(0), `Cross product should be negative for CW, got ${c}`);
});

test('cross() detects collinear points', () => {
  const o = point(0, 0);
  const a = point(1, 1);
  const b = point(2, 2);
  const c = cross(o, a, b);
  assertClose(c.toNumber(), 0, 1e-40, 'Collinear points should have zero cross product');
});

test('dot() computes correct value', () => {
  const o = point(0, 0);
  const a = point(3, 4);
  const b = point(1, 0);
  // Dot product of (3,4) and (1,0) should be 3
  const d = dot(o, a, b);
  assertClose(d.toNumber(), 3);
});

// ============================================================================
// Segment Intersection Tests
// ============================================================================

test('segmentIntersection() finds crossing segments', () => {
  const a = point(0, 0);
  const b = point(2, 2);
  const c = point(0, 2);
  const d = point(2, 0);
  const intersection = segmentIntersection(a, b, c, d);
  assert(intersection !== null, 'Should find intersection');
  assertClose(intersection.x.toNumber(), 1);
  assertClose(intersection.y.toNumber(), 1);
});

test('segmentIntersection() returns null for parallel segments', () => {
  const a = point(0, 0);
  const b = point(1, 0);
  const c = point(0, 1);
  const d = point(1, 1);
  const intersection = segmentIntersection(a, b, c, d);
  assert(intersection === null, 'Parallel segments should not intersect');
});

test('segmentIntersection() returns null for non-intersecting segments', () => {
  const a = point(0, 0);
  const b = point(1, 0);
  const c = point(2, 0);
  const d = point(3, 0);
  const intersection = segmentIntersection(a, b, c, d);
  assert(intersection === null, 'Non-overlapping segments should not intersect');
});

test('segmentIntersection() finds T-intersection', () => {
  const a = point(0, 0);
  const b = point(2, 0);
  const c = point(1, -1);
  const d = point(1, 1);
  const intersection = segmentIntersection(a, b, c, d);
  assert(intersection !== null, 'T-intersection should be found');
  assertClose(intersection.x.toNumber(), 1);
  assertClose(intersection.y.toNumber(), 0);
});

// ============================================================================
// Point in Polygon Tests
// ============================================================================

test('pointInPolygon() detects point inside square', () => {
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const inside = point(1, 1);
  assert(pointInPolygon(inside, square) === 1, 'Point should be inside');
});

test('pointInPolygon() detects point outside square', () => {
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const outside = point(3, 3);
  assert(pointInPolygon(outside, square) === -1, 'Point should be outside');
});

test('pointInPolygon() detects point on boundary', () => {
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const onEdge = point(1, 0);
  assert(pointInPolygon(onEdge, square) === 0, 'Point should be on boundary');
});

test('pointInPolygon() detects point at vertex', () => {
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const atVertex = point(0, 0);
  assert(pointInPolygon(atVertex, square) === 0, 'Point at vertex should be on boundary');
});

test('pointInPolygon() works with concave polygon', () => {
  // L-shaped polygon
  const lShape = [
    point(0, 0), point(2, 0), point(2, 1),
    point(1, 1), point(1, 2), point(0, 2)
  ];
  const inside = point(0.5, 0.5);
  const inHole = point(1.5, 1.5);
  assert(pointInPolygon(inside, lShape) === 1, 'Point should be inside L-shape');
  assert(pointInPolygon(inHole, lShape) === -1, 'Point in concave area should be outside');
});

// ============================================================================
// Sutherland-Hodgman Clipping Tests
// ============================================================================

test('clipPolygonSH() clips triangle with square', () => {
  const triangle = [point(1, 1), point(3, 1), point(2, 3)];
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const result = clipPolygonSH(triangle, square);
  assert(result.length >= 3, `Should produce valid polygon, got ${result.length} vertices`);
});

test('clipPolygonSH() handles non-overlapping polygons', () => {
  const poly1 = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  const poly2 = [point(5, 5), point(6, 5), point(6, 6), point(5, 6)];
  const result = clipPolygonSH(poly1, poly2);
  assert(result.length === 0, 'Non-overlapping should produce empty result');
});

test('clipPolygonSH() clips overlapping squares', () => {
  const square1 = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const square2 = [point(1, 1), point(3, 1), point(3, 3), point(1, 3)];
  const result = clipPolygonSH(square1, square2);
  assert(result.length === 4, `Overlapping squares should produce 4-vertex result, got ${result.length}`);
  // Result should be the intersection: (1,1)-(2,1)-(2,2)-(1,2)
  const area = polygonArea(result).abs().toNumber();
  assertClose(area, 1, 0.0001, `Intersection area should be 1, got ${area}`);
});

// ============================================================================
// Polygon Area Tests
// ============================================================================

test('polygonArea() computes correct area for unit square', () => {
  const square = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  const area = polygonArea(square);
  assertClose(area.toNumber(), 1, 1e-10, 'Unit square area should be 1');
});

test('polygonArea() returns positive for CCW polygon', () => {
  const ccwSquare = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  const area = polygonArea(ccwSquare);
  assert(area.gt(0), 'CCW polygon should have positive area');
});

test('polygonArea() returns negative for CW polygon', () => {
  const cwSquare = [point(0, 0), point(0, 1), point(1, 1), point(1, 0)];
  const area = polygonArea(cwSquare);
  assert(area.lt(0), 'CW polygon should have negative area');
});

test('polygonArea() handles triangle correctly', () => {
  const triangle = [point(0, 0), point(4, 0), point(2, 3)];
  const area = polygonArea(triangle).abs().toNumber();
  assertClose(area, 6, 1e-10, 'Triangle area should be 6');
});

// ============================================================================
// Convexity Tests
// ============================================================================

test('isConvex() returns true for square', () => {
  const square = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  assert(isConvex(square), 'Square should be convex');
});

test('isConvex() returns true for triangle', () => {
  const triangle = [point(0, 0), point(1, 0), point(0.5, 1)];
  assert(isConvex(triangle), 'Triangle should be convex');
});

test('isConvex() returns false for L-shape', () => {
  const lShape = [
    point(0, 0), point(2, 0), point(2, 1),
    point(1, 1), point(1, 2), point(0, 2)
  ];
  assert(!isConvex(lShape), 'L-shape should not be convex');
});

test('isConvex() returns false for star shape', () => {
  const star = [
    point(0, 1), point(0.2, 0.2), point(1, 0),
    point(0.2, -0.2), point(0, -1), point(-0.2, -0.2),
    point(-1, 0), point(-0.2, 0.2)
  ];
  assert(!isConvex(star), 'Star should not be convex');
});

// ============================================================================
// Convex Hull Tests
// ============================================================================

test('convexHull() computes hull for scattered points', () => {
  const points = [
    point(0, 0), point(1, 0), point(2, 0),
    point(0, 1), point(1, 1), point(2, 1),
    point(0, 2), point(1, 2), point(2, 2)
  ];
  const hull = convexHull(points);
  assert(hull.length === 4, `Hull should have 4 vertices (square corners), got ${hull.length}`);
});

test('convexHull() handles collinear points', () => {
  const points = [point(0, 0), point(1, 0), point(2, 0), point(3, 0)];
  const hull = convexHull(points);
  // Collinear points form a degenerate polygon
  assert(hull.length >= 2, 'Hull should have at least start and end points');
});

test('convexHull() preserves already convex polygon', () => {
  const square = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const hull = convexHull(square);
  assert(hull.length === 4, 'Hull of square should have 4 vertices');
});

// ============================================================================
// Bounding Box Tests
// ============================================================================

test('boundingBox() computes correct bounds', () => {
  const polygon = [point(1, 2), point(4, 5), point(2, 8), point(-1, 3)];
  const bb = boundingBox(polygon);
  assertClose(bb.minX.toNumber(), -1);
  assertClose(bb.minY.toNumber(), 2);
  assertClose(bb.maxX.toNumber(), 4);
  assertClose(bb.maxY.toNumber(), 8);
});

test('bboxIntersects() detects overlapping boxes', () => {
  const bb1 = { minX: new Decimal(0), minY: new Decimal(0), maxX: new Decimal(2), maxY: new Decimal(2) };
  const bb2 = { minX: new Decimal(1), minY: new Decimal(1), maxX: new Decimal(3), maxY: new Decimal(3) };
  assert(bboxIntersects(bb1, bb2), 'Overlapping boxes should intersect');
});

test('bboxIntersects() detects non-overlapping boxes', () => {
  const bb1 = { minX: new Decimal(0), minY: new Decimal(0), maxX: new Decimal(1), maxY: new Decimal(1) };
  const bb2 = { minX: new Decimal(2), minY: new Decimal(2), maxX: new Decimal(3), maxY: new Decimal(3) };
  assert(!bboxIntersects(bb1, bb2), 'Non-overlapping boxes should not intersect');
});

// ============================================================================
// Boolean Operations Tests
// ============================================================================

test('polygonIntersection() finds overlap of two squares', () => {
  const square1 = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const square2 = [point(1, 1), point(3, 1), point(3, 3), point(1, 3)];
  const result = polygonIntersection(square1, square2);
  assert(result.length > 0, 'Should find intersection');
  assert(result[0].length >= 3, 'Intersection should be valid polygon');
});

test('polygonIntersection() returns empty for non-overlapping', () => {
  const square1 = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  const square2 = [point(5, 5), point(6, 5), point(6, 6), point(5, 6)];
  const result = polygonIntersection(square1, square2);
  assert(result.length === 0, 'Non-overlapping polygons should have empty intersection');
});

test('polygonUnion() combines overlapping squares', () => {
  const square1 = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const square2 = [point(1, 1), point(3, 1), point(3, 3), point(1, 3)];
  const result = polygonUnion(square1, square2);
  assert(result.length > 0, 'Union should produce result');
  // Union should have area larger than either input
  const area1 = polygonArea(square1).abs().toNumber();
  const area2 = polygonArea(square2).abs().toNumber();
  const unionArea = polygonArea(result[0]).abs().toNumber();
  assert(unionArea >= Math.max(area1, area2), 'Union area should be >= larger input');
});

test('polygonDifference() subtracts overlapping square', () => {
  const square1 = [point(0, 0), point(2, 0), point(2, 2), point(0, 2)];
  const square2 = [point(1, 1), point(3, 1), point(3, 3), point(1, 3)];
  const result = polygonDifference(square1, square2);
  assert(result.length > 0, 'Difference should produce result');
  // Difference area should be less than original
  const area1 = polygonArea(square1).abs().toNumber();
  const diffArea = polygonArea(result[0]).abs().toNumber();
  assert(diffArea < area1, 'Difference area should be less than original');
});

test('polygonDifference() returns original for non-overlapping', () => {
  const square1 = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
  const square2 = [point(5, 5), point(6, 5), point(6, 6), point(5, 6)];
  const result = polygonDifference(square1, square2);
  assert(result.length > 0, 'Should return original polygon');
  const area1 = polygonArea(square1).abs().toNumber();
  const diffArea = polygonArea(result[0]).abs().toNumber();
  assertClose(diffArea, area1, 0.0001, 'Non-overlapping difference should equal original');
});

// ============================================================================
// High Precision Tests
// ============================================================================

test('Decimal precision is maintained in calculations', () => {
  // Use very precise values that would lose precision with IEEE 754
  const p1 = point('0.123456789012345678901234567890', '0.987654321098765432109876543210');
  const p2 = point('0.123456789012345678901234567891', '0.987654321098765432109876543211');

  // These should NOT be equal even though the difference is tiny
  assert(!pointsEqual(p1, p2, new Decimal('1e-50')), 'Should detect tiny differences');

  // But with a larger tolerance they should be equal
  assert(pointsEqual(p1, p2, new Decimal('1e-20')), 'Should be equal with larger tolerance');
});

test('segment intersection maintains precision', () => {
  // Create segments that intersect at a point requiring high precision
  const a = point('0', '0');
  const b = point('0.333333333333333333333333333333', '0.333333333333333333333333333333');
  const c = point('0.333333333333333333333333333333', '0');
  const d = point('0', '0.333333333333333333333333333333');

  const intersection = segmentIntersection(a, b, c, d);
  assert(intersection !== null, 'Should find intersection');

  // The intersection should be at approximately (1/6, 1/6)
  const expectedX = new Decimal('0.333333333333333333333333333333').div(2);
  const diff = intersection.x.minus(expectedX).abs();
  assert(diff.lt('1e-30'), `Precision should be maintained, diff: ${diff}`);
});

// ============================================================================
// Run all tests and report
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('POLYGON-CLIP.JS TEST RESULTS');
console.log('='.repeat(70) + '\n');

// Print results table
const nameWidth = 55;
const statusWidth = 8;

console.log('\u250C' + '\u2500'.repeat(nameWidth + 2) + '\u252C' + '\u2500'.repeat(statusWidth + 2) + '\u2510');
console.log('\u2502 ' + 'Test Name'.padEnd(nameWidth) + ' \u2502 ' + 'Status'.padEnd(statusWidth) + ' \u2502');
console.log('\u251C' + '\u2500'.repeat(nameWidth + 2) + '\u253C' + '\u2500'.repeat(statusWidth + 2) + '\u2524');

for (const result of results) {
  const name = result.name.length > nameWidth ? result.name.substring(0, nameWidth - 3) + '...' : result.name;
  const status = result.status === 'PASS' ? '\x1b[32mPASS\x1b[0m    ' : '\x1b[31mFAIL\x1b[0m    ';
  console.log('\u2502 ' + name.padEnd(nameWidth) + ' \u2502 ' + status + ' \u2502');
  if (result.error) {
    console.log('\u2502   \x1b[33m' + result.error.substring(0, nameWidth - 3).padEnd(nameWidth - 2) + '\x1b[0m \u2502          \u2502');
  }
}

console.log('\u2514' + '\u2500'.repeat(nameWidth + 2) + '\u2534' + '\u2500'.repeat(statusWidth + 2) + '\u2518');

console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

// Exit with error if any tests failed
if (failed > 0) {
  process.exit(1);
}
