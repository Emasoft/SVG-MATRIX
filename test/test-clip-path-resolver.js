/**
 * Tests for clip-path-resolver.js - ClipPath flattening with Decimal.js precision
 */

import Decimal from 'decimal.js';
import * as PolygonClip from '../src/polygon-clip.js';
import {
  pathToPolygon,
  shapeToPolygon,
  resolveClipPath,
  applyClipPath,
  polygonToPathData,
  resolveNestedClipPath
} from '../src/clip-path-resolver.js';

Decimal.set({ precision: 80 });

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

function assertClose(actual, expected, tolerance = 1e-6, message) {
  const a = actual instanceof Decimal ? actual.toNumber() : actual;
  const e = expected instanceof Decimal ? expected.toNumber() : expected;
  const diff = Math.abs(a - e);
  if (diff > tolerance) {
    throw new Error(message || `Expected ${e}, got ${a} (diff: ${diff})`);
  }
}

// ============================================================================
// pathToPolygon Tests
// ============================================================================

test('pathToPolygon: simple rect path', () => {
  const path = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
  const polygon = pathToPolygon(path, 1);
  assert(polygon.length === 4, `Expected 4 vertices, got ${polygon.length}`);
  assertClose(polygon[0].x, 0);
  assertClose(polygon[0].y, 0);
  assertClose(polygon[1].x, 10);
  assertClose(polygon[1].y, 0);
  assertClose(polygon[2].x, 10);
  assertClose(polygon[2].y, 10);
  assertClose(polygon[3].x, 0);
  assertClose(polygon[3].y, 10);
});

test('pathToPolygon: relative commands', () => {
  const path = 'M 0 0 l 10 0 l 0 10 l -10 0 z';
  const polygon = pathToPolygon(path, 1);
  assert(polygon.length === 4, `Expected 4 vertices, got ${polygon.length}`);
  assertClose(polygon[2].x, 10);
  assertClose(polygon[2].y, 10);
});

test('pathToPolygon: horizontal/vertical lines', () => {
  const path = 'M 0 0 H 10 V 10 H 0 Z';
  const polygon = pathToPolygon(path, 1);
  assert(polygon.length === 4, `Expected 4 vertices, got ${polygon.length}`);
});

test('pathToPolygon: cubic bezier sampling', () => {
  const path = 'M 0 0 C 10 0 10 10 0 10';
  const polygon = pathToPolygon(path, 10);
  assert(polygon.length === 11, `Expected 11 vertices (1 start + 10 samples), got ${polygon.length}`);
  // Start point
  assertClose(polygon[0].x, 0);
  assertClose(polygon[0].y, 0);
  // End point
  assertClose(polygon[10].x, 0, 0.01);
  assertClose(polygon[10].y, 10, 0.01);
});

test('pathToPolygon: quadratic bezier sampling', () => {
  const path = 'M 0 0 Q 10 5 0 10';
  const polygon = pathToPolygon(path, 10);
  assert(polygon.length === 11, `Expected 11 vertices, got ${polygon.length}`);
});

test('pathToPolygon: arc command', () => {
  const path = 'M 0 10 A 10 10 0 0 1 20 10';
  const polygon = pathToPolygon(path, 10);
  assert(polygon.length === 11, `Expected 11 vertices, got ${polygon.length}`);
  // End point should be at (20, 10)
  assertClose(polygon[10].x, 20, 0.01);
  assertClose(polygon[10].y, 10, 0.01);
});

test('pathToPolygon: mixed commands', () => {
  const path = 'M 0 0 L 50 0 Q 100 0 100 50 L 100 100 C 100 150 50 150 0 100 Z';
  const polygon = pathToPolygon(path, 5);
  assert(polygon.length >= 10, `Should have many vertices from curves`);
});

// ============================================================================
// shapeToPolygon Tests
// ============================================================================

test('shapeToPolygon: rect', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 50 };
  const polygon = shapeToPolygon(element, null, 1);
  assert(polygon.length === 4, `Expected 4 vertices, got ${polygon.length}`);
  const bbox = PolygonClip.boundingBox(polygon);
  assertClose(bbox.minX, 0);
  assertClose(bbox.minY, 0);
  assertClose(bbox.maxX, 100);
  assertClose(bbox.maxY, 50);
});

test('shapeToPolygon: circle', () => {
  const element = { type: 'circle', cx: 50, cy: 50, r: 25 };
  const polygon = shapeToPolygon(element, null, 20);
  // Circle is approximated with 4 bezier curves, each sampled 20 times = 80 points
  assert(polygon.length >= 40, `Circle should have many vertices`);
  // All points should be ~25 units from center
  for (const p of polygon) {
    const dist = p.x.minus(50).pow(2).plus(p.y.minus(50).pow(2)).sqrt();
    assertClose(dist, 25, 1, 'Point should be on circle');
  }
});

test('shapeToPolygon: ellipse', () => {
  const element = { type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 };
  const polygon = shapeToPolygon(element, null, 20);
  assert(polygon.length >= 40, `Ellipse should have many vertices`);
  const bbox = PolygonClip.boundingBox(polygon);
  assertClose(bbox.minX, 20, 1);
  assertClose(bbox.maxX, 80, 1);
  assertClose(bbox.minY, 30, 1);
  assertClose(bbox.maxY, 70, 1);
});

test('shapeToPolygon: polygon element', () => {
  const element = { type: 'polygon', points: '0,0 100,0 50,100' };
  const polygon = shapeToPolygon(element, null, 1);
  assert(polygon.length === 3, `Expected 3 vertices, got ${polygon.length}`);
});

test('shapeToPolygon: line (degenerate)', () => {
  const element = { type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 };
  const polygon = shapeToPolygon(element, null, 1);
  // Lines don't form valid polygons
  assert(polygon.length === 2, `Line has 2 points`);
});

test('shapeToPolygon: path element', () => {
  const element = { type: 'path', d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' };
  const polygon = shapeToPolygon(element, null, 1);
  assert(polygon.length === 4, `Expected 4 vertices`);
});

// ============================================================================
// resolveClipPath Tests
// ============================================================================

test('resolveClipPath: single rect child', () => {
  const clipPathDef = {
    children: [{ type: 'rect', x: 10, y: 10, width: 80, height: 80 }]
  };
  const result = resolveClipPath(clipPathDef, null, null, { samples: 1 });
  assert(result.length === 4, `Expected 4 vertices`);
  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX, 10);
  assertClose(bbox.minY, 10);
  assertClose(bbox.maxX, 90);
  assertClose(bbox.maxY, 90);
});

test('resolveClipPath: multiple children (union)', () => {
  const clipPathDef = {
    children: [
      { type: 'rect', x: 0, y: 0, width: 50, height: 100 },
      { type: 'rect', x: 50, y: 0, width: 50, height: 100 }
    ]
  };
  const result = resolveClipPath(clipPathDef, null, null, { samples: 1 });
  // Union of two adjacent rects should cover 0-100
  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX, 0);
  assertClose(bbox.maxX, 100);
});

test('resolveClipPath: empty clipPath', () => {
  const clipPathDef = { children: [] };
  const result = resolveClipPath(clipPathDef, null, null);
  assert(result.length === 0, `Empty clipPath should return empty polygon`);
});

test('resolveClipPath: objectBoundingBox units', () => {
  const clipPathDef = {
    clipPathUnits: 'objectBoundingBox',
    children: [{ type: 'rect', x: 0.25, y: 0.25, width: 0.5, height: 0.5 }]
  };
  const targetElement = { type: 'rect', x: 100, y: 100, width: 200, height: 200 };
  const result = resolveClipPath(clipPathDef, targetElement, null, { samples: 1 });

  // Clip should be at 25%-75% of element bbox
  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX, 150, 1);  // 100 + 0.25*200
  assertClose(bbox.minY, 150, 1);
  assertClose(bbox.maxX, 250, 1);  // 100 + 0.75*200
  assertClose(bbox.maxY, 250, 1);
});

// ============================================================================
// applyClipPath Tests
// ============================================================================

test('applyClipPath: rect clipped by smaller rect', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 25, y: 25, width: 50, height: 50 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  assert(result.length > 0, 'Should have result');
  const area = PolygonClip.polygonArea(result[0]).abs().toNumber();
  assertClose(area, 2500, 1, 'Clipped area should be 50x50=2500');
});

test('applyClipPath: non-overlapping shapes', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 50, height: 50 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 100, y: 100, width: 50, height: 50 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });
  assert(result.length === 0, 'Non-overlapping should return empty');
});

test('applyClipPath: element inside clip', () => {
  const element = { type: 'rect', x: 25, y: 25, width: 50, height: 50 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  assert(result.length > 0, 'Should have result');
  const area = PolygonClip.polygonArea(result[0]).abs().toNumber();
  assertClose(area, 2500, 100, 'Element inside clip should preserve element area');
});

test('applyClipPath: partial overlap', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 50, y: 50, width: 100, height: 100 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  assert(result.length > 0, 'Should have result');
  const area = PolygonClip.polygonArea(result[0]).abs().toNumber();
  assertClose(area, 2500, 100, 'Partial overlap should give 50x50=2500');
});

// ============================================================================
// polygonToPathData Tests
// ============================================================================

test('polygonToPathData: square polygon', () => {
  const polygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];
  const pathData = polygonToPathData(polygon);
  assert(pathData.startsWith('M 0 0'), `Should start with M 0 0`);
  assert(pathData.includes('L 100 0'), `Should include L 100 0`);
  assert(pathData.endsWith(' Z'), `Should end with Z`);
});

test('polygonToPathData: precision parameter', () => {
  const polygon = [
    PolygonClip.point('1.23456789', '9.87654321'),
    PolygonClip.point('5', '5')
  ];
  const pathData = polygonToPathData(polygon, 3);
  assert(pathData.includes('1.235'), `Should round to 3 decimals`);
});

// ============================================================================
// resolveNestedClipPath Tests
// ============================================================================

test('resolveNestedClipPath: circular reference detection', () => {
  const defsMap = new Map();
  defsMap.set('clip1', {
    id: 'clip1',
    'clip-path': 'url(#clip2)',
    children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
  });
  defsMap.set('clip2', {
    id: 'clip2',
    'clip-path': 'url(#clip1)',
    children: [{ type: 'rect', x: 25, y: 25, width: 50, height: 50 }]
  });

  // Should not infinite loop
  const result = resolveNestedClipPath(defsMap.get('clip1'), defsMap, null, null);
  assert(result !== undefined, 'Should return something');
});

test('resolveNestedClipPath: nested clip intersection', () => {
  const defsMap = new Map();
  defsMap.set('outerClip', {
    id: 'outerClip',
    children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
  });
  defsMap.set('innerClip', {
    id: 'innerClip',
    'clip-path': 'url(#outerClip)',
    children: [{ type: 'rect', x: 25, y: 25, width: 100, height: 100 }]
  });

  const result = resolveNestedClipPath(defsMap.get('innerClip'), defsMap, null, null, new Set(), { samples: 1 });

  // Should be intersection: (25,25)-(100,100)
  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX, 25, 1);
  assertClose(bbox.minY, 25, 1);
  assertClose(bbox.maxX, 100, 1);
  assertClose(bbox.maxY, 100, 1);
});

// ============================================================================
// Mathematical Verification Tests
// ============================================================================

test('Area conservation: clipped area <= both inputs', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 25, y: 25, width: 80, height: 80 }]
  };

  const elementPoly = shapeToPolygon(element, null, 1);
  const clipPoly = shapeToPolygon(clipPathDef.children[0], null, 1);
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    const elementArea = PolygonClip.polygonArea(elementPoly).abs();
    const clipArea = PolygonClip.polygonArea(clipPoly).abs();
    const resultArea = PolygonClip.polygonArea(result[0]).abs();

    assert(resultArea.lte(elementArea), 'Result area <= element area');
    assert(resultArea.lte(clipArea), 'Result area <= clip area');
  }
});

test('Point containment: result points inside both polygons', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 25, y: 25, width: 60, height: 60 }]
  };

  const elementPoly = shapeToPolygon(element, null, 1);
  const clipPoly = shapeToPolygon(clipPathDef.children[0], null, 1);
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    for (const p of result[0]) {
      const inElement = PolygonClip.pointInPolygon(p, elementPoly);
      const inClip = PolygonClip.pointInPolygon(p, clipPoly);
      assert(inElement >= 0, 'Result point should be inside/on element');
      assert(inClip >= 0, 'Result point should be inside/on clip');
    }
  }
});

// ============================================================================
// Precision Tests
// ============================================================================

test('High precision coordinates preserved in Decimal operations', () => {
  // Note: Path string parsing uses Number() which is limited to ~15 digits
  // But internal Decimal operations preserve full precision
  const p1 = PolygonClip.point('0.12345678901234567890123456789', '0.98765432109876543210987654321');
  const p2 = PolygonClip.point('0.12345678901234567890123456790', '0.98765432109876543210987654322');

  // The difference is 1e-29, so with 1e-30 tolerance they should NOT be equal
  assert(!PolygonClip.pointsEqual(p1, p2, new Decimal('1e-30')), 'Should detect 1e-29 differences');

  // But with 1e-28 tolerance they ARE equal (diff is smaller)
  assert(PolygonClip.pointsEqual(p1, p2, new Decimal('1e-28')), 'Should be equal within 1e-28');

  // Verify the actual difference
  const diff = p1.x.minus(p2.x).abs();
  assert(diff.eq('1e-29'), 'Difference should be exactly 1e-29');
});

test('Round-trip path conversion with reasonable precision', () => {
  // Path string conversion is limited by Number parsing (~15 digits)
  // Use values that JavaScript Number can represent
  const original = [
    PolygonClip.point('1.234567890123456', '9.876543210987654'),
    PolygonClip.point('5.555555555555555', '4.444444444444444'),
    PolygonClip.point('0', '0')
  ];

  const pathData = polygonToPathData(original, 15);
  const recovered = pathToPolygon(pathData, 1);

  // Compare with JS Number precision tolerance
  for (let i = 0; i < original.length; i++) {
    const diffX = original[i].x.minus(recovered[i].x).abs();
    const diffY = original[i].y.minus(recovered[i].y).abs();
    assert(diffX.lt('1e-10'), `X precision preserved at vertex ${i}`);
    assert(diffY.lt('1e-10'), `Y precision preserved at vertex ${i}`);
  }
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Edge case: zero-size clip', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 50, y: 50, width: 0, height: 0 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });
  // Zero-size clip should produce empty result
  assert(result.length === 0, 'Zero-size clip should produce empty result');
});

test('Edge case: identical polygons', () => {
  const element = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = {
    children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
  };
  const result = applyClipPath(element, clipPathDef, null, { samples: 1 });

  assert(result.length > 0, 'Should have result');
  const area = PolygonClip.polygonArea(result[0]).abs().toNumber();
  assertClose(area, 10000, 100, 'Identical shapes should preserve area');
});

// ============================================================================
// Run all tests and report
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('CLIP-PATH-RESOLVER.JS TEST RESULTS');
console.log('='.repeat(70) + '\n');

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
    const errMsg = result.error.substring(0, nameWidth - 3);
    console.log('\u2502   \x1b[33m' + errMsg.padEnd(nameWidth - 2) + '\x1b[0m \u2502          \u2502');
  }
}

console.log('\u2514' + '\u2500'.repeat(nameWidth + 2) + '\u2534' + '\u2500'.repeat(statusWidth + 2) + '\u2518');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
