/**
 * Unit tests for Pattern Resolver Module
 * Tests pattern parsing, tile generation, and clipping operations
 */

import Decimal from 'decimal.js';
import * as PatternResolver from '../src/pattern-resolver.js';
import * as PolygonClip from '../src/polygon-clip.js';

Decimal.set({ precision: 80 });

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}

function assertEqual(actual, expected, msg = '') {
  const a = actual instanceof Decimal ? Number(actual) : actual;
  const e = expected instanceof Decimal ? Number(expected) : expected;
  if (typeof a === 'number' && typeof e === 'number') {
    if (Math.abs(a - e) > 1e-10) {
      throw new Error(`${msg} Expected ${e}, got ${a}`);
    }
  } else if (a !== e) {
    throw new Error(`${msg} Expected ${e}, got ${a}`);
  }
}

function assertClose(actual, expected, tolerance = 0.01, msg = '') {
  const a = actual instanceof Decimal ? Number(actual) : actual;
  const e = expected instanceof Decimal ? Number(expected) : expected;
  if (Math.abs(a - e) > tolerance) {
    throw new Error(`${msg} Expected ~${e}, got ${a} (tolerance: ${tolerance})`);
  }
}

function assertTrue(val, msg = '') {
  if (!val) throw new Error(msg || 'Expected true');
}

function assertFalse(val, msg = '') {
  if (val) throw new Error(msg || 'Expected false');
}

// ============================================================================
// getPatternTile Tests
// ============================================================================

test('getPatternTile: objectBoundingBox scales to target bbox', () => {
  const patternData = {
    patternUnits: 'objectBoundingBox',
    x: 0,
    y: 0,
    width: 0.25,
    height: 0.25
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 100 };

  const tile = PatternResolver.getPatternTile(patternData, targetBBox);

  assertClose(Number(tile.x), 100, 0.001);
  assertClose(Number(tile.y), 100, 0.001);
  assertClose(Number(tile.width), 50, 0.001); // 0.25 * 200
  assertClose(Number(tile.height), 25, 0.001); // 0.25 * 100
});

test('getPatternTile: objectBoundingBox with offset', () => {
  const patternData = {
    patternUnits: 'objectBoundingBox',
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.5
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const tile = PatternResolver.getPatternTile(patternData, targetBBox);

  assertClose(Number(tile.x), 10, 0.001);
  assertClose(Number(tile.y), 20, 0.001);
  assertClose(Number(tile.width), 50, 0.001);
  assertClose(Number(tile.height), 50, 0.001);
});

test('getPatternTile: userSpaceOnUse uses direct values', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    x: 10,
    y: 20,
    width: 30,
    height: 40
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 200 };

  const tile = PatternResolver.getPatternTile(patternData, targetBBox);

  assertClose(Number(tile.x), 10, 0.001);
  assertClose(Number(tile.y), 20, 0.001);
  assertClose(Number(tile.width), 30, 0.001);
  assertClose(Number(tile.height), 40, 0.001);
});

// ============================================================================
// getTilePositions Tests
// ============================================================================

test('getTilePositions: generates correct positions for simple grid', () => {
  const tile = { x: new Decimal(0), y: new Decimal(0), width: new Decimal(10), height: new Decimal(10) };
  const coverBBox = { x: 0, y: 0, width: 30, height: 20 };

  const positions = PatternResolver.getTilePositions(tile, coverBBox);

  // Should have 3x2 = 6 tiles
  assertEqual(positions.length, 6);
});

test('getTilePositions: handles offset tile start', () => {
  const tile = { x: new Decimal(5), y: new Decimal(5), width: new Decimal(10), height: new Decimal(10) };
  const coverBBox = { x: 0, y: 0, width: 25, height: 25 };

  const positions = PatternResolver.getTilePositions(tile, coverBBox);

  // First tile should start at x=-5, y=-5 to cover from 0
  assertTrue(positions.some(p => Number(p.x) < 5));
});

test('getTilePositions: returns empty for zero-size tile', () => {
  const tile = { x: new Decimal(0), y: new Decimal(0), width: new Decimal(0), height: new Decimal(10) };
  const coverBBox = { x: 0, y: 0, width: 100, height: 100 };

  const positions = PatternResolver.getTilePositions(tile, coverBBox);

  assertEqual(positions.length, 0);
});

test('getTilePositions: covers full area', () => {
  const tile = { x: new Decimal(0), y: new Decimal(0), width: new Decimal(20), height: new Decimal(20) };
  const coverBBox = { x: 10, y: 10, width: 80, height: 80 };

  const positions = PatternResolver.getTilePositions(tile, coverBBox);

  // Should have enough tiles to cover 10-90 in both dimensions
  // Tiles at x: 0, 20, 40, 60, 80 (5 columns)
  // Tiles at y: 0, 20, 40, 60, 80 (5 rows)
  assertTrue(positions.length >= 16); // At least 4x4
});

// ============================================================================
// getPatternTileCount Tests
// ============================================================================

test('getPatternTileCount: calculates correct count', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 25,
    height: 25
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const count = PatternResolver.getPatternTileCount(patternData, targetBBox);

  assertEqual(count.columns, 4);
  assertEqual(count.rows, 4);
  assertEqual(count.total, 16);
});

test('getPatternTileCount: handles non-divisible dimensions', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 30,
    height: 40
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const count = PatternResolver.getPatternTileCount(patternData, targetBBox);

  // 100/30 = 3.33 -> 4 columns
  // 100/40 = 2.5 -> 3 rows
  assertEqual(count.columns, 4);
  assertEqual(count.rows, 3);
  assertEqual(count.total, 12);
});

test('getPatternTileCount: returns zero for zero-size pattern', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 0,
    height: 50
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const count = PatternResolver.getPatternTileCount(patternData, targetBBox);

  assertEqual(count.total, 0);
});

// ============================================================================
// getPatternContentBBox Tests
// ============================================================================

test('getPatternContentBBox: rect child', () => {
  const patternData = {
    children: [
      { type: 'rect', x: 10, y: 20, width: 30, height: 40 }
    ]
  };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.x, 10);
  assertEqual(bbox.y, 20);
  assertEqual(bbox.width, 30);
  assertEqual(bbox.height, 40);
});

test('getPatternContentBBox: circle child', () => {
  const patternData = {
    children: [
      { type: 'circle', cx: 50, cy: 50, r: 25 }
    ]
  };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.x, 25);
  assertEqual(bbox.y, 25);
  assertEqual(bbox.width, 50);
  assertEqual(bbox.height, 50);
});

test('getPatternContentBBox: multiple children', () => {
  const patternData = {
    children: [
      { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
      { type: 'rect', x: 50, y: 50, width: 20, height: 20 }
    ]
  };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.x, 0);
  assertEqual(bbox.y, 0);
  assertEqual(bbox.width, 70);
  assertEqual(bbox.height, 70);
});

test('getPatternContentBBox: empty pattern', () => {
  const patternData = { children: [] };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.width, 0);
  assertEqual(bbox.height, 0);
});

test('getPatternContentBBox: line child', () => {
  const patternData = {
    children: [
      { type: 'line', x1: 10, y1: 20, x2: 50, y2: 80 }
    ]
  };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.x, 10);
  assertEqual(bbox.y, 20);
  assertEqual(bbox.width, 40);
  assertEqual(bbox.height, 60);
});

test('getPatternContentBBox: ellipse child', () => {
  const patternData = {
    children: [
      { type: 'ellipse', cx: 50, cy: 50, rx: 30, ry: 20 }
    ]
  };

  const bbox = PatternResolver.getPatternContentBBox(patternData);

  assertEqual(bbox.x, 20);
  assertEqual(bbox.y, 30);
  assertEqual(bbox.width, 60);
  assertEqual(bbox.height, 40);
});

// ============================================================================
// patternChildToPolygon Tests
// ============================================================================

test('patternChildToPolygon: rect to polygon', () => {
  const child = {
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10
  };

  const polygon = PatternResolver.patternChildToPolygon(child, null, 10);

  assertTrue(polygon.length >= 4, 'Rect should have at least 4 vertices');
});

test('patternChildToPolygon: circle to polygon', () => {
  const child = {
    type: 'circle',
    cx: 10,
    cy: 10,
    r: 5
  };

  const polygon = PatternResolver.patternChildToPolygon(child, null, 16);

  assertTrue(polygon.length >= 16, 'Circle should have at least 16 vertices');
});

test('patternChildToPolygon: polygon to polygon', () => {
  const child = {
    type: 'polygon',
    points: '0,0 10,0 10,10 0,10'
  };

  const polygon = PatternResolver.patternChildToPolygon(child, null, 10);

  assertTrue(polygon.length >= 4);
});

// ============================================================================
// resolvePattern Tests
// ============================================================================

test('resolvePattern: single rect pattern', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fill: 'red',
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 40, height: 40 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);

  // 2x2 = 4 tiles, each with 1 rect
  assertTrue(result.length >= 4, 'Should produce multiple polygons');
  assertEqual(result[0].fill, 'red');
  assertEqual(result[0].opacity, 1);
});

test('resolvePattern: pattern with multiple children', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    children: [
      { type: 'rect', x: 0, y: 0, width: 5, height: 5, fill: 'red', opacity: 1 },
      { type: 'circle', cx: 15, cy: 15, r: 3, fill: 'blue', opacity: 0.5 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 20, height: 20 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);

  // 1 tile with 2 children
  assertTrue(result.length >= 2);
  assertTrue(result.some(r => r.fill === 'red'));
  assertTrue(result.some(r => r.fill === 'blue'));
});

test('resolvePattern: respects maxTiles limit', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    children: [
      { type: 'rect', x: 0, y: 0, width: 0.5, height: 0.5, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  // Would produce 10000 tiles without limit
  const result = PatternResolver.resolvePattern(patternData, targetBBox, { maxTiles: 10 });

  assertEqual(result.length, 10);
});

test('resolvePattern: empty pattern returns empty', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    children: []
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);

  assertEqual(result.length, 0);
});

test('resolvePattern: zero-size pattern returns empty', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 0,
    height: 20,
    children: [
      { type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);

  assertEqual(result.length, 0);
});

// ============================================================================
// applyPattern Tests
// ============================================================================

test('applyPattern: clips pattern to target', () => {
  const targetPolygon = [
    PolygonClip.point(10, 10),
    PolygonClip.point(30, 10),
    PolygonClip.point(30, 30),
    PolygonClip.point(10, 30)
  ];

  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    children: [
      { type: 'rect', x: 0, y: 0, width: 15, height: 15, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 10, y: 10, width: 20, height: 20 };

  const result = PatternResolver.applyPattern(targetPolygon, patternData, targetBBox);

  assertTrue(result.length >= 1, 'Should produce clipped result');
  assertTrue(result[0].polygon.length >= 3, 'Clipped polygon should have vertices');
});

test('applyPattern: skips zero opacity', () => {
  const targetPolygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];

  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: [
      { type: 'rect', x: 0, y: 0, width: 25, height: 25, fill: 'red', opacity: 0 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = PatternResolver.applyPattern(targetPolygon, patternData, targetBBox);

  assertEqual(result.length, 0, 'Zero opacity should be skipped');
});

// ============================================================================
// patternToClipPath Tests
// ============================================================================

test('patternToClipPath: converts pattern to polygon', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: [
      { type: 'rect', x: 0, y: 0, width: 25, height: 25, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 50, height: 50 };

  const result = PatternResolver.patternToClipPath(patternData, targetBBox);

  assertTrue(result.length >= 4, 'Should produce polygon');
});

test('patternToClipPath: skips zero opacity children', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: [
      { type: 'rect', x: 0, y: 0, width: 25, height: 25, fill: 'red', opacity: 0 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 50, height: 50 };

  const result = PatternResolver.patternToClipPath(patternData, targetBBox);

  assertEqual(result.length, 0);
});

// ============================================================================
// patternToPathData Tests
// ============================================================================

test('patternToPathData: generates valid SVG path', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: [
      { type: 'rect', x: 10, y: 10, width: 30, height: 30, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 50, height: 50 };

  const pathData = PatternResolver.patternToPathData(patternData, targetBBox);

  assertTrue(pathData.startsWith('M'), 'Should start with M');
  assertTrue(pathData.includes('L'), 'Should contain L commands');
  assertTrue(pathData.endsWith('Z'), 'Should end with Z');
});

test('patternToPathData: empty pattern returns empty string', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: []
  };
  const targetBBox = { x: 0, y: 0, width: 50, height: 50 };

  const pathData = PatternResolver.patternToPathData(patternData, targetBBox);

  assertEqual(pathData, '');
});

// ============================================================================
// parsePatternTransform Tests
// ============================================================================

test('parsePatternTransform: null returns identity', () => {
  const M = PatternResolver.parsePatternTransform(null);
  assertTrue(M !== null);
});

test('parsePatternTransform: empty string returns identity', () => {
  const M = PatternResolver.parsePatternTransform('');
  assertTrue(M !== null);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Edge case: very small pattern tile', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 0.01,
    height: 0.01,
    children: [
      { type: 'rect', x: 0, y: 0, width: 0.005, height: 0.005, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 1, height: 1 };

  // Should not throw, respects maxTiles
  const result = PatternResolver.resolvePattern(patternData, targetBBox, { maxTiles: 100 });
  assertTrue(result.length <= 100);
});

test('Edge case: pattern with negative coordinates', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: -10,
    y: -10,
    width: 20,
    height: 20,
    children: [
      { type: 'rect', x: 5, y: 5, width: 10, height: 10, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);
  assertTrue(result.length > 0);
});

test('Edge case: objectBoundingBox with decimal fractions', () => {
  const patternData = {
    patternUnits: 'objectBoundingBox',
    patternContentUnits: 'userSpaceOnUse',
    x: 0.333,
    y: 0.333,
    width: 0.333,
    height: 0.333,
    children: [
      { type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: 'red', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 90, height: 90 };

  const tile = PatternResolver.getPatternTile(patternData, targetBBox);

  assertClose(Number(tile.x), 30, 0.1);
  assertClose(Number(tile.width), 30, 0.1);
});

test('Edge case: pattern covering target exactly once', () => {
  const patternData = {
    patternUnits: 'userSpaceOnUse',
    patternContentUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    children: [
      { type: 'rect', x: 0, y: 0, width: 100, height: 100, fill: 'blue', opacity: 1 }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = PatternResolver.resolvePattern(patternData, targetBBox);

  assertEqual(result.length, 1);
});

// ============================================================================
// Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('PATTERN RESOLVER UNIT TESTS');
console.log('======================================================================\n');

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
    const errMsg = r.error.length > 52 ? r.error.slice(0, 49) + '...' : r.error;
    console.log(`│   Error: ${errMsg.padEnd(47)} │          │`);
  }
}

console.log('└─────────────────────────────────────────────────────────┴──────────┘');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
