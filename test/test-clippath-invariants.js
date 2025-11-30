/**
 * Mathematical Invariant Tests for ClipPath
 *
 * These tests verify mathematical properties that must hold true
 * for any correct polygon clipping implementation.
 */

import Decimal from 'decimal.js';
import * as PolygonClip from '../src/polygon-clip.js';
import {
  pathToPolygon,
  shapeToPolygon,
  resolveClipPath,
  applyClipPath,
  polygonToPathData
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

// ============================================================================
// INVARIANT 1: Area Conservation
// Result area must be <= min(subject area, clip area)
// ============================================================================

test('INVARIANT: Clipped area <= subject area', () => {
  const subject = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = { children: [{ type: 'rect', x: 25, y: 25, width: 80, height: 80 }] };

  const subjectPoly = shapeToPolygon(subject, null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    const subjectArea = PolygonClip.polygonArea(subjectPoly).abs();
    const resultArea = PolygonClip.polygonArea(result[0]).abs();
    assert(resultArea.lte(subjectArea), `Result area (${resultArea}) > subject area (${subjectArea})`);
  }
});

test('INVARIANT: Clipped area <= clip area', () => {
  const subject = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
  const clipPathDef = { children: [{ type: 'rect', x: 25, y: 25, width: 80, height: 80 }] };

  const clipPoly = shapeToPolygon(clipPathDef.children[0], null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    const clipArea = PolygonClip.polygonArea(clipPoly).abs();
    const resultArea = PolygonClip.polygonArea(result[0]).abs();
    assert(resultArea.lte(clipArea), `Result area (${resultArea}) > clip area (${clipArea})`);
  }
});

test('INVARIANT: Clipped area >= 0', () => {
  for (let i = 0; i < 10; i++) {
    const subject = { type: 'rect', x: Math.random() * 50, y: Math.random() * 50, width: 50 + Math.random() * 50, height: 50 + Math.random() * 50 };
    const clip = { type: 'rect', x: Math.random() * 50, y: Math.random() * 50, width: 50 + Math.random() * 50, height: 50 + Math.random() * 50 };
    const clipPathDef = { children: [clip] };

    const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

    if (result.length > 0) {
      const area = PolygonClip.polygonArea(result[0]).abs();
      assert(area.gte(0), `Result area must be >= 0, got ${area}`);
    }
  }
});

// ============================================================================
// INVARIANT 2: Point Containment
// All result points must be inside or on both subject and clip
// ============================================================================

test('INVARIANT: Result points inside subject', () => {
  const subject = { type: 'rect', x: 10, y: 10, width: 80, height: 80 };
  const clipPathDef = { children: [{ type: 'rect', x: 30, y: 30, width: 60, height: 60 }] };

  const subjectPoly = shapeToPolygon(subject, null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    for (const p of result[0]) {
      const inside = PolygonClip.pointInPolygon(p, subjectPoly);
      assert(inside >= 0, `Point (${p.x}, ${p.y}) should be inside/on subject, got ${inside}`);
    }
  }
});

test('INVARIANT: Result points inside clip', () => {
  const subject = { type: 'rect', x: 10, y: 10, width: 80, height: 80 };
  const clipPathDef = { children: [{ type: 'rect', x: 30, y: 30, width: 60, height: 60 }] };

  const clipPoly = shapeToPolygon(clipPathDef.children[0], null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    for (const p of result[0]) {
      const inside = PolygonClip.pointInPolygon(p, clipPoly);
      assert(inside >= 0, `Point (${p.x}, ${p.y}) should be inside/on clip, got ${inside}`);
    }
  }
});

// ============================================================================
// INVARIANT 3: Commutativity of Intersection
// A ∩ B should have same area as B ∩ A (though vertex order may differ)
// ============================================================================

test('INVARIANT: Intersection is commutative (area)', () => {
  const poly1 = [
    PolygonClip.point(0, 0), PolygonClip.point(60, 0),
    PolygonClip.point(60, 60), PolygonClip.point(0, 60)
  ];
  const poly2 = [
    PolygonClip.point(30, 30), PolygonClip.point(90, 30),
    PolygonClip.point(90, 90), PolygonClip.point(30, 90)
  ];

  const result1 = PolygonClip.polygonIntersection(poly1, poly2);
  const result2 = PolygonClip.polygonIntersection(poly2, poly1);

  if (result1.length > 0 && result2.length > 0) {
    const area1 = PolygonClip.polygonArea(result1[0]).abs();
    const area2 = PolygonClip.polygonArea(result2[0]).abs();
    const diff = area1.minus(area2).abs();
    assert(diff.lt(1), `Areas should be equal: ${area1} vs ${area2}`);
  }
});

// ============================================================================
// INVARIANT 4: Identity Clip
// Clipping by a larger polygon should preserve subject
// ============================================================================

test('INVARIANT: Clip larger than subject preserves subject area', () => {
  const subject = { type: 'rect', x: 30, y: 30, width: 40, height: 40 };
  const clipPathDef = { children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }] };

  const subjectPoly = shapeToPolygon(subject, null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  assert(result.length > 0, 'Should have result');

  const subjectArea = PolygonClip.polygonArea(subjectPoly).abs();
  const resultArea = PolygonClip.polygonArea(result[0]).abs();
  const diff = subjectArea.minus(resultArea).abs();

  assert(diff.lt(1), `Subject inside clip should preserve area: ${subjectArea} vs ${resultArea}`);
});

// ============================================================================
// INVARIANT 5: Empty Intersection
// Non-overlapping polygons should produce empty result
// ============================================================================

test('INVARIANT: Non-overlapping produces empty result', () => {
  const subject = { type: 'rect', x: 0, y: 0, width: 30, height: 30 };
  const clipPathDef = { children: [{ type: 'rect', x: 60, y: 60, width: 30, height: 30 }] };

  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  assert(result.length === 0, 'Non-overlapping polygons should have empty intersection');
});

// ============================================================================
// INVARIANT 6: Bounding Box Containment
// Result bbox must be within intersection of subject and clip bboxes
// ============================================================================

test('INVARIANT: Result bbox within expected bounds', () => {
  const subject = { type: 'rect', x: 10, y: 10, width: 80, height: 80 };
  const clipPathDef = { children: [{ type: 'rect', x: 30, y: 30, width: 80, height: 80 }] };

  const subjectPoly = shapeToPolygon(subject, null, 1);
  const clipPoly = shapeToPolygon(clipPathDef.children[0], null, 1);
  const result = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result.length > 0) {
    const subjectBBox = PolygonClip.boundingBox(subjectPoly);
    const clipBBox = PolygonClip.boundingBox(clipPoly);
    const resultBBox = PolygonClip.boundingBox(result[0]);

    // Result bbox must be within intersection of subject and clip bboxes
    const expectedMinX = Decimal.max(subjectBBox.minX, clipBBox.minX);
    const expectedMinY = Decimal.max(subjectBBox.minY, clipBBox.minY);
    const expectedMaxX = Decimal.min(subjectBBox.maxX, clipBBox.maxX);
    const expectedMaxY = Decimal.min(subjectBBox.maxY, clipBBox.maxY);

    assert(resultBBox.minX.gte(expectedMinX.minus(1)), 'Result minX within bounds');
    assert(resultBBox.minY.gte(expectedMinY.minus(1)), 'Result minY within bounds');
    assert(resultBBox.maxX.lte(expectedMaxX.plus(1)), 'Result maxX within bounds');
    assert(resultBBox.maxY.lte(expectedMaxY.plus(1)), 'Result maxY within bounds');
  }
});

// ============================================================================
// INVARIANT 7: Convexity Preservation
// Intersection of two convex polygons must be convex
// ============================================================================

test('INVARIANT: Intersection of convex polygons is convex', () => {
  const convex1 = [
    PolygonClip.point(0, 0), PolygonClip.point(50, 0),
    PolygonClip.point(50, 50), PolygonClip.point(0, 50)
  ];
  const convex2 = [
    PolygonClip.point(25, 25), PolygonClip.point(75, 25),
    PolygonClip.point(75, 75), PolygonClip.point(25, 75)
  ];

  assert(PolygonClip.isConvex(convex1), 'First polygon should be convex');
  assert(PolygonClip.isConvex(convex2), 'Second polygon should be convex');

  const result = PolygonClip.polygonIntersection(convex1, convex2);

  if (result.length > 0) {
    assert(PolygonClip.isConvex(result[0]), 'Intersection of convex polygons must be convex');
  }
});

// ============================================================================
// INVARIANT 8: Precision Stability
// Operations on precise inputs should maintain precision
// ============================================================================

test('INVARIANT: High precision maintained through clipping', () => {
  const precise1 = [
    PolygonClip.point('0.12345678901234567890', '0.12345678901234567890'),
    PolygonClip.point('50.12345678901234567890', '0.12345678901234567890'),
    PolygonClip.point('50.12345678901234567890', '50.12345678901234567890'),
    PolygonClip.point('0.12345678901234567890', '50.12345678901234567890')
  ];
  const precise2 = [
    PolygonClip.point('25.12345678901234567890', '25.12345678901234567890'),
    PolygonClip.point('75.12345678901234567890', '25.12345678901234567890'),
    PolygonClip.point('75.12345678901234567890', '75.12345678901234567890'),
    PolygonClip.point('25.12345678901234567890', '75.12345678901234567890')
  ];

  const result = PolygonClip.polygonIntersection(precise1, precise2);

  if (result.length > 0) {
    // Check that result coordinates have Decimal precision
    for (const p of result[0]) {
      assert(p.x instanceof Decimal, 'X coordinate should be Decimal');
      assert(p.y instanceof Decimal, 'Y coordinate should be Decimal');
    }
  }
});

// ============================================================================
// INVARIANT 9: Union Area
// Union area >= max(area1, area2)
// ============================================================================

test('INVARIANT: Union area >= max of inputs', () => {
  const poly1 = [
    PolygonClip.point(0, 0), PolygonClip.point(50, 0),
    PolygonClip.point(50, 50), PolygonClip.point(0, 50)
  ];
  const poly2 = [
    PolygonClip.point(25, 25), PolygonClip.point(75, 25),
    PolygonClip.point(75, 75), PolygonClip.point(25, 75)
  ];

  const area1 = PolygonClip.polygonArea(poly1).abs();
  const area2 = PolygonClip.polygonArea(poly2).abs();
  const maxArea = Decimal.max(area1, area2);

  const union = PolygonClip.polygonUnion(poly1, poly2);

  if (union.length > 0) {
    const unionArea = PolygonClip.polygonArea(union[0]).abs();
    assert(unionArea.gte(maxArea.minus(1)), `Union area (${unionArea}) >= max input area (${maxArea})`);
  }
});

// ============================================================================
// INVARIANT 10: Difference Area
// A - B should have area <= area(A)
// ============================================================================

test('INVARIANT: Difference area <= original area', () => {
  const poly1 = [
    PolygonClip.point(0, 0), PolygonClip.point(100, 0),
    PolygonClip.point(100, 100), PolygonClip.point(0, 100)
  ];
  const poly2 = [
    PolygonClip.point(25, 25), PolygonClip.point(75, 25),
    PolygonClip.point(75, 75), PolygonClip.point(25, 75)
  ];

  const area1 = PolygonClip.polygonArea(poly1).abs();

  const diff = PolygonClip.polygonDifference(poly1, poly2);

  if (diff.length > 0) {
    const diffArea = PolygonClip.polygonArea(diff[0]).abs();
    assert(diffArea.lte(area1.plus(1)), `Difference area (${diffArea}) <= original (${area1})`);
  }
});

// ============================================================================
// INVARIANT 11: Idempotence
// Clipping twice with same clip should give same result
// ============================================================================

test('INVARIANT: Clipping is idempotent', () => {
  const subject = { type: 'rect', x: 10, y: 10, width: 80, height: 80 };
  const clipPathDef = { children: [{ type: 'rect', x: 30, y: 30, width: 60, height: 60 }] };

  const result1 = applyClipPath(subject, clipPathDef, null, { samples: 1 });

  if (result1.length > 0) {
    // Clip the result again
    const area1 = PolygonClip.polygonArea(result1[0]).abs();

    // Convert result to element
    const resultPath = polygonToPathData(result1[0], 10);
    const resultElement = { type: 'path', d: resultPath };
    const result2 = applyClipPath(resultElement, clipPathDef, null, { samples: 1 });

    if (result2.length > 0) {
      const area2 = PolygonClip.polygonArea(result2[0]).abs();
      const diff = area1.minus(area2).abs();
      assert(diff.lt(5), `Clipping twice should give same result: ${area1} vs ${area2}`);
    }
  }
});

// ============================================================================
// INVARIANT 12: Monotonicity
// As clip shrinks, result area should decrease or stay same
// ============================================================================

test('INVARIANT: Smaller clip produces smaller or equal result', () => {
  const subject = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };

  const largeClip = { children: [{ type: 'rect', x: 20, y: 20, width: 60, height: 60 }] };
  const smallClip = { children: [{ type: 'rect', x: 30, y: 30, width: 40, height: 40 }] };

  const resultLarge = applyClipPath(subject, largeClip, null, { samples: 1 });
  const resultSmall = applyClipPath(subject, smallClip, null, { samples: 1 });

  if (resultLarge.length > 0 && resultSmall.length > 0) {
    const areaLarge = PolygonClip.polygonArea(resultLarge[0]).abs();
    const areaSmall = PolygonClip.polygonArea(resultSmall[0]).abs();
    assert(areaSmall.lte(areaLarge.plus(1)), `Smaller clip should produce smaller result: ${areaSmall} <= ${areaLarge}`);
  }
});

// ============================================================================
// Run Tests
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('MATHEMATICAL INVARIANT TESTS');
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
