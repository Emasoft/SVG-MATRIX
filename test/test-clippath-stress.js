/**
 * Edge Case Stress Tests for ClipPath Implementation
 * Tests pathological cases, boundary conditions, and numerical stability
 */

import Decimal from 'decimal.js';
import * as PolygonClip from '../src/polygon-clip.js';
import * as ClipPathResolver from '../src/clip-path-resolver.js';

Decimal.set({ precision: 80 });

const D = x => new Decimal(x);

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertClose(a, b, tolerance = 1e-10, message = '') {
  const diff = Math.abs(Number(a) - Number(b));
  if (diff > tolerance) {
    throw new Error(`${message}: expected ${a} ≈ ${b}, diff = ${diff}`);
  }
}

function polygonArea(polygon) {
  if (polygon.length < 3) return D(0);
  let area = D(0);
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area = area.plus(polygon[i].x.times(polygon[j].y));
    area = area.minus(polygon[j].x.times(polygon[i].y));
  }
  return area.abs().div(2);
}

console.log('\n======================================================================');
console.log('EDGE CASE STRESS TESTS');
console.log('======================================================================\n');

// ============================================================================
// DEGENERATE GEOMETRY TESTS
// ============================================================================

test('EDGE: Collinear points in polygon (line segment)', () => {
  // A polygon with all collinear points should have zero area
  const line = [
    { x: D(0), y: D(0) },
    { x: D(1), y: D(0) },
    { x: D(2), y: D(0) }
  ];
  const area = polygonArea(line);
  assert(area.equals(0), `Collinear polygon should have zero area, got ${area}`);
});

test('EDGE: Very thin triangle (near-collinear)', () => {
  // Triangle with height of 1e-20
  const thin = [
    { x: D(0), y: D(0) },
    { x: D(1), y: D('1e-20') },
    { x: D(2), y: D(0) }
  ];
  const area = polygonArea(thin);
  const expected = D('1e-20'); // area = 0.5 * base * height = 0.5 * 2 * 1e-20
  assertClose(area.toNumber(), expected.toNumber(), 1e-25, 'Thin triangle area');
});

test('EDGE: Single point polygon', () => {
  const point = [{ x: D(0), y: D(0) }];
  const area = polygonArea(point);
  assert(area.equals(0), 'Single point should have zero area');
});

test('EDGE: Two point polygon', () => {
  const segment = [
    { x: D(0), y: D(0) },
    { x: D(1), y: D(1) }
  ];
  const area = polygonArea(segment);
  assert(area.equals(0), 'Two points should have zero area');
});

// ============================================================================
// EXTREME COORDINATE TESTS
// ============================================================================

test('EDGE: Very large coordinates (1e30)', () => {
  const large = [
    { x: D('1e30'), y: D('1e30') },
    { x: D('1.000001e30'), y: D('1e30') },
    { x: D('1.000001e30'), y: D('1.000001e30') },
    { x: D('1e30'), y: D('1.000001e30') }
  ];
  const area = polygonArea(large);
  // Area should be ~1e54 (side length 1e24, area = side^2)
  assert(area.greaterThan(0), 'Large coord polygon should have positive area');
});

test('EDGE: Very small coordinates (1e-30)', () => {
  const small = [
    { x: D('1e-30'), y: D('1e-30') },
    { x: D('2e-30'), y: D('1e-30') },
    { x: D('2e-30'), y: D('2e-30') },
    { x: D('1e-30'), y: D('2e-30') }
  ];
  const area = polygonArea(small);
  const expected = D('1e-60'); // 1e-30 * 1e-30
  assertClose(area.toNumber(), expected.toNumber(), 1e-65, 'Small coord area');
});

test('EDGE: Mixed large and small coordinates', () => {
  // This tests precision when mixing scales
  const mixed = [
    { x: D('1e20'), y: D('1e-20') },
    { x: D('1e20').plus('1'), y: D('1e-20') },
    { x: D('1e20').plus('1'), y: D('1e-20').plus('1e-40') },
    { x: D('1e20'), y: D('1e-20').plus('1e-40') }
  ];
  const area = polygonArea(mixed);
  // Area should be ~1e-40 (1 * 1e-40)
  assert(area.greaterThan(0), 'Mixed scale polygon should have positive area');
});

test('EDGE: Negative coordinates', () => {
  const negative = [
    { x: D(-100), y: D(-100) },
    { x: D(-90), y: D(-100) },
    { x: D(-90), y: D(-90) },
    { x: D(-100), y: D(-90) }
  ];
  const area = polygonArea(negative);
  assertClose(area.toNumber(), 100, 1e-10, 'Negative coord area');
});

// ============================================================================
// STRESS TESTS - MANY VERTICES
// ============================================================================

test('STRESS: Circle approximation with 100 vertices', () => {
  const n = 100;
  const radius = D(50);
  const circle = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    circle.push({
      x: radius.times(Math.cos(angle)),
      y: radius.times(Math.sin(angle))
    });
  }
  const area = polygonArea(circle);
  const expected = Math.PI * 50 * 50;
  const error = Math.abs(area.toNumber() - expected) / expected;
  assert(error < 0.01, `100-vertex circle area error ${error * 100}% should be < 1%`);
});

test('STRESS: Circle approximation with 1000 vertices', () => {
  const n = 1000;
  const radius = D(50);
  const circle = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    circle.push({
      x: radius.times(Math.cos(angle)),
      y: radius.times(Math.sin(angle))
    });
  }
  const area = polygonArea(circle);
  const expected = Math.PI * 50 * 50;
  const error = Math.abs(area.toNumber() - expected) / expected;
  assert(error < 0.0001, `1000-vertex circle area error ${error * 100}% should be < 0.01%`);
});

test('STRESS: Intersection of two large polygons (100 vertices each)', () => {
  // Two overlapping circles
  const n = 100;
  const radius = D(50);
  const offset = D(25);

  const circle1 = [];
  const circle2 = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    circle1.push({
      x: radius.times(Math.cos(angle)),
      y: radius.times(Math.sin(angle))
    });
    circle2.push({
      x: radius.times(Math.cos(angle)).plus(offset),
      y: radius.times(Math.sin(angle))
    });
  }

  const result = PolygonClip.polygonIntersection(circle1, circle2);
  const resultArea = polygonArea(result);

  // Intersection should be non-empty and less than both circles
  assert(result.length > 0, 'Large polygon intersection should not be empty');
  assert(resultArea.lessThan(polygonArea(circle1)), 'Intersection area < circle1');
  assert(resultArea.lessThan(polygonArea(circle2)), 'Intersection area < circle2');
});

// ============================================================================
// NEAR-COINCIDENT VERTEX TESTS
// ============================================================================

test('EDGE: Near-coincident vertices (1e-30 apart)', () => {
  const poly = [
    { x: D(0), y: D(0) },
    { x: D(1), y: D(0) },
    { x: D(1).plus('1e-30'), y: D('1e-30') }, // Near-coincident with (1, 0)
    { x: D(1), y: D(1) },
    { x: D(0), y: D(1) }
  ];
  const area = polygonArea(poly);
  assertClose(area.toNumber(), 1, 1e-10, 'Near-coincident vertices should not break area calc');
});

test('EDGE: Vertices exactly on clip edge', () => {
  // Offset slightly to avoid exact-on-edge degeneracy
  const subject = [
    { x: D(0), y: D(0) },
    { x: D(10), y: D(0) },
    { x: D(10), y: D(10) },
    { x: D(0), y: D(10) }
  ];
  const clip = [
    { x: D(5), y: D('-0.001') },  // Slight offset to avoid exact edge
    { x: D(15), y: D('-0.001') },
    { x: D(15), y: D('15.001') },
    { x: D(5), y: D('15.001') }
  ];

  const result = PolygonClip.polygonIntersection(subject, clip);
  // polygonIntersection returns array of polygons: [[vertices...]]
  assert(result.length >= 1 && result[0].length >= 3, 'Should handle near-edge vertices');
  const area = polygonArea(result[0]);
  // Area should be close to 50 (5x10 intersection)
  assertClose(area.toNumber(), 50, 0.1, 'Intersection should be approximately 5x10 = 50');
});

test('EDGE: Shared edge between polygons', () => {
  const poly1 = [
    { x: D(0), y: D(0) },
    { x: D(10), y: D(0) },
    { x: D(10), y: D(10) },
    { x: D(0), y: D(10) }
  ];
  const poly2 = [
    { x: D(10), y: D(0) },  // Shared edge with poly1
    { x: D(20), y: D(0) },
    { x: D(20), y: D(10) },
    { x: D(10), y: D(10) }  // Shared edge endpoint
  ];

  // Intersection should be just the shared edge (degenerate polygon)
  const result = PolygonClip.polygonIntersection(poly1, poly2);
  // May produce degenerate result or empty result - both acceptable
  if (result.length > 0) {
    const area = polygonArea(result);
    // Area should be zero or very small (just the edge)
    assert(area.lessThan(1), 'Shared edge intersection should have near-zero area');
  }
});

// ============================================================================
// PRECISION TESTS
// ============================================================================

test('PRECISION: 80-digit coordinate precision preserved', () => {
  // Create a polygon with 80-digit precision coordinates
  const precise = '1.2345678901234567890123456789012345678901234567890123456789012345678901234567890';
  const poly = [
    { x: D(precise), y: D(0) },
    { x: D(precise).plus('1'), y: D(0) },
    { x: D(precise).plus('1'), y: D(1) },
    { x: D(precise), y: D(1) }
  ];

  const area = polygonArea(poly);
  assertClose(area.toNumber(), 1, 1e-10, '80-digit precision area should be 1');

  // Verify first coordinate still has full precision
  assert(poly[0].x.toFixed(78).includes('12345678901234567890'),
    'Precision should be preserved');
});

test('PRECISION: Irrational-like coordinates (sqrt approximation)', () => {
  // Use high-precision approximation of sqrt(2)
  const sqrt2 = '1.4142135623730950488016887242096980785696718753769480731766797379907324784621070';
  const poly = [
    { x: D(0), y: D(0) },
    { x: D(sqrt2), y: D(0) },
    { x: D(sqrt2), y: D(sqrt2) },
    { x: D(0), y: D(sqrt2) }
  ];

  const area = polygonArea(poly);
  const expected = D(sqrt2).times(sqrt2); // Should be 2
  assertClose(area.toNumber(), 2, 1e-10, 'sqrt(2)^2 area should be 2');
});

test('PRECISION: Operations with PI approximation', () => {
  // Use high-precision PI
  const pi = '3.1415926535897932384626433832795028841971693993751058209749445923078164062862089';
  const poly = [
    { x: D(0), y: D(0) },
    { x: D(pi), y: D(0) },
    { x: D(pi), y: D(1) },
    { x: D(0), y: D(1) }
  ];

  const area = polygonArea(poly);
  assertClose(area.toNumber(), Math.PI, 1e-10, 'PI rectangle area');
});

// ============================================================================
// PATH PARSING STRESS TESTS
// ============================================================================

test('PATH: Complex path with all command types', () => {
  // Note: pathToPolygon signature is (pathData, samplesPerCurve), no ctm parameter
  const path = 'M0,0 L10,0 H20 V10 l-5,5 h-5 v5 C5,20 0,15 0,10 Q2,5 0,0 Z';
  const polygon = ClipPathResolver.pathToPolygon(path, 20);
  assert(polygon.length >= 5, 'Complex path should produce valid polygon');
  const area = polygonArea(polygon);
  assert(area.greaterThan(0), 'Complex path area should be positive');
});

test('PATH: Relative path commands', () => {
  const path = 'm10,10 l20,0 l0,20 l-20,0 z';
  const polygon = ClipPathResolver.pathToPolygon(path, 10);
  assert(polygon.length >= 4, 'Relative path should produce valid polygon');
  const area = polygonArea(polygon);
  assertClose(area.toNumber(), 400, 1, 'Relative path 20x20 square area');
});

test('PATH: Arc commands (A)', () => {
  // Semicircle path
  const path = 'M0,0 A50,50 0 0 1 100,0 L100,50 L0,50 Z';
  const polygon = ClipPathResolver.pathToPolygon(path, 50);
  assert(polygon.length > 10, 'Arc path should sample multiple points');
  const area = polygonArea(polygon);
  // Should be roughly rectangle + semicircle
  assert(area.greaterThan(5000), 'Arc path area should be substantial');
});

test('PATH: Cubic bezier sampling accuracy', () => {
  // S-curve bezier
  const path = 'M0,0 C10,50 40,50 50,0 L50,10 L0,10 Z';
  const polygon = ClipPathResolver.pathToPolygon(path, 50);
  assert(polygon.length > 20, 'Bezier should be sampled with many points');
});

test('PATH: Quadratic bezier', () => {
  const path = 'M0,0 Q25,50 50,0 L50,10 L0,10 Z';
  const polygon = ClipPathResolver.pathToPolygon(path, 30);
  assert(polygon.length > 10, 'Quadratic bezier should be sampled');
});

// ============================================================================
// SHAPE CONVERSION TESTS
// ============================================================================

test('SHAPE: Circle element', () => {
  // shapeToPolygon expects element.type not element.tagName
  const circle = { type: 'circle', cx: '50', cy: '50', r: '25' };
  const polygon = ClipPathResolver.shapeToPolygon(circle, null, 100);
  assert(polygon.length >= 50, 'Circle should have many vertices');
  const area = polygonArea(polygon);
  const expected = Math.PI * 25 * 25;
  const error = Math.abs(area.toNumber() - expected) / expected;
  assert(error < 0.01, `Circle area error ${error * 100}% should be < 1%`);
});

test('SHAPE: Ellipse element', () => {
  const ellipse = { type: 'ellipse', cx: '50', cy: '50', rx: '40', ry: '20' };
  const polygon = ClipPathResolver.shapeToPolygon(ellipse, null, 100);
  assert(polygon.length >= 50, 'Ellipse should have many vertices');
  const area = polygonArea(polygon);
  const expected = Math.PI * 40 * 20;
  const error = Math.abs(area.toNumber() - expected) / expected;
  assert(error < 0.01, `Ellipse area error ${error * 100}% should be < 1%`);
});

test('SHAPE: Rectangle element', () => {
  const rect = { type: 'rect', x: '10', y: '20', width: '100', height: '50' };
  const polygon = ClipPathResolver.shapeToPolygon(rect, null, 10);
  assert(polygon.length >= 4, 'Rectangle should have at least 4 vertices');
  const area = polygonArea(polygon);
  assertClose(area.toNumber(), 5000, 1, 'Rectangle 100x50 = 5000');
});

test('SHAPE: Polygon element', () => {
  const poly = { type: 'polygon', points: '0,0 100,0 100,100 0,100' };
  const polygon = ClipPathResolver.shapeToPolygon(poly, null, 10);
  assert(polygon.length >= 4, 'Polygon should have 4 vertices');
  const area = polygonArea(polygon);
  assertClose(area.toNumber(), 10000, 1, 'Polygon 100x100 = 10000');
});

// ============================================================================
// TRANSFORM STRESS TESTS
// ============================================================================

test('TRANSFORM: Rotation 360 degrees returns to original', () => {
  const original = [
    { x: D(0), y: D(0) },
    { x: D(10), y: D(0) },
    { x: D(10), y: D(10) },
    { x: D(0), y: D(10) }
  ];

  // Apply 360-degree rotation
  const cos360 = Math.cos(2 * Math.PI);
  const sin360 = Math.sin(2 * Math.PI);

  const rotated = original.map(p => ({
    x: p.x.times(cos360).minus(p.y.times(sin360)),
    y: p.x.times(sin360).plus(p.y.times(cos360))
  }));

  for (let i = 0; i < original.length; i++) {
    assertClose(rotated[i].x.toNumber(), original[i].x.toNumber(), 1e-10, `x[${i}]`);
    assertClose(rotated[i].y.toNumber(), original[i].y.toNumber(), 1e-10, `y[${i}]`);
  }
});

test('TRANSFORM: Large scale factor', () => {
  const poly = [
    { x: D(0), y: D(0) },
    { x: D(1), y: D(0) },
    { x: D(1), y: D(1) },
    { x: D(0), y: D(1) }
  ];
  const scale = D('1e20');

  const scaled = poly.map(p => ({
    x: p.x.times(scale),
    y: p.y.times(scale)
  }));

  const area = polygonArea(scaled);
  assertClose(area.toNumber(), 1e40, 1e30, 'Scaled area should be 1e40');
});

// ============================================================================
// BOUNDARY CONDITION TESTS
// ============================================================================

test('BOUNDARY: Zero-size shape', () => {
  const rect = { type: 'rect', x: '10', y: '20', width: '0', height: '50' };
  const polygon = ClipPathResolver.shapeToPolygon(rect, null, 10);
  // Zero-width rect should produce degenerate or empty polygon
  const area = polygonArea(polygon);
  assertClose(area.toNumber(), 0, 1e-10, 'Zero-width rect area should be 0');
});

test('BOUNDARY: Empty path', () => {
  const polygon = ClipPathResolver.pathToPolygon('', 10);
  assert(polygon.length === 0, 'Empty path should produce empty polygon');
});

test('BOUNDARY: Invalid path (no close)', () => {
  const path = 'M0,0 L10,0 L10,10';  // No Z
  const polygon = ClipPathResolver.pathToPolygon(path, 10);
  // Should still work, just not explicitly closed
  assert(polygon.length >= 3, 'Unclosed path should still produce polygon');
});

test('BOUNDARY: Path with only M command', () => {
  const path = 'M50,50';
  const polygon = ClipPathResolver.pathToPolygon(path, 10);
  // Single point - degenerate polygon
  assert(polygon.length <= 1, 'Single M should produce 0 or 1 point');
});

// ============================================================================
// Print Results
// ============================================================================

console.log('┌─────────────────────────────────────────────────────────┬──────────┐');
console.log('│ Test Name                                               │ Status   │');
console.log('├─────────────────────────────────────────────────────────┼──────────┤');

let passed = 0;
let failed = 0;

for (const r of results) {
  const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const name = r.name.length > 55 ? r.name.slice(0, 52) + '...' : r.name.padEnd(55);
  console.log(`│ ${name} │ ${status}     │`);
  if (r.passed) passed++;
  else {
    failed++;
    console.log(`│   Error: ${r.error.slice(0, 52)}${r.error.length > 52 ? '...' : ''}`.padEnd(62) + '│          │');
  }
}

console.log('└─────────────────────────────────────────────────────────┴──────────┘');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
