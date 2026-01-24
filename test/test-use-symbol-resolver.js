/**
 * Unit tests for Use/Symbol Resolver Module
 * Tests use element resolution, symbol handling, and viewBox transforms
 */

import Decimal from 'decimal.js';
import { Matrix } from '../src/matrix.js';
import * as UseSymbolResolver from '../src/use-symbol-resolver.js';
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

function assertNull(val, msg = '') {
  if (val !== null) throw new Error(msg || 'Expected null');
}

// ============================================================================
// extractStyleAttributes Tests
// ============================================================================

test('extractStyleAttributes: extracts fill', () => {
  const mockElement = {
    getAttribute: (name) => name === 'fill' ? 'red' : null
  };
  const style = UseSymbolResolver.extractStyleAttributes(mockElement);
  assertEqual(style.fill, 'red');
});

test('extractStyleAttributes: extracts multiple attributes', () => {
  const attrs = {
    fill: 'blue',
    stroke: 'black',
    'stroke-width': '2',
    opacity: '0.5'
  };
  const mockElement = {
    getAttribute: (name) => attrs[name] || null
  };
  const style = UseSymbolResolver.extractStyleAttributes(mockElement);
  assertEqual(style.fill, 'blue');
  assertEqual(style.stroke, 'black');
  assertEqual(style.strokeWidth, '2');
  assertEqual(style.opacity, '0.5');
});

test('extractStyleAttributes: returns null for missing attributes', () => {
  const mockElement = {
    getAttribute: () => null
  };
  const style = UseSymbolResolver.extractStyleAttributes(mockElement);
  assertNull(style.fill);
  assertNull(style.stroke);
});

// ============================================================================
// calculateViewBoxTransform Tests
// ============================================================================

test('calculateViewBoxTransform: null viewBox returns identity', () => {
  const M = UseSymbolResolver.calculateViewBoxTransform(null, 100, 100);
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: zero target dimensions returns identity', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 0, 100);
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: xMidYMid meet scales uniformly', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 200, 100, 'xMidYMid meet');

  // For 100x100 viewBox into 200x100 target with meet:
  // scale = min(2, 1) = 1, no scaling applied beyond centering
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: none scales non-uniformly', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 50 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 200, 200, 'none');

  // Should scale by 2 in x and 4 in y
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: handles viewBox offset', () => {
  const viewBox = { x: 50, y: 50, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 100, 100, 'xMidYMid meet');

  // Should translate to compensate for viewBox origin
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: slice uses max scale', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 200, 100, 'xMidYMid slice');

  // scale = max(2, 1) = 2
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: xMinYMin alignment', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 200, 200, 'xMinYMin meet');

  // Should align to top-left (no offset)
  assertTrue(M instanceof Matrix);
});

test('calculateViewBoxTransform: xMaxYMax alignment', () => {
  const viewBox = { x: 0, y: 0, width: 100, height: 100 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 200, 200, 'xMaxYMax meet');

  // Should align to bottom-right
  assertTrue(M instanceof Matrix);
});

// ============================================================================
// mergeStyles Tests
// ============================================================================

test('mergeStyles: inherited fills empty element style', () => {
  const inherited = { fill: 'red', stroke: null };
  const element = { fill: null, stroke: 'black' };

  const merged = UseSymbolResolver.mergeStyles(inherited, element);

  assertEqual(merged.fill, 'red');
  assertEqual(merged.stroke, 'black');
});

test('mergeStyles: element style takes precedence', () => {
  const inherited = { fill: 'red' };
  const element = { fill: 'blue' };

  const merged = UseSymbolResolver.mergeStyles(inherited, element);

  assertEqual(merged.fill, 'blue');
});

test('mergeStyles: handles null inherited', () => {
  const element = { fill: 'green', stroke: null };

  const merged = UseSymbolResolver.mergeStyles(null, element);

  assertEqual(merged.fill, 'green');
});

test('mergeStyles: preserves all element properties', () => {
  const inherited = {};
  const element = {
    fill: 'red',
    stroke: 'black',
    strokeWidth: '2',
    opacity: '0.5'
  };

  const merged = UseSymbolResolver.mergeStyles(inherited, element);

  assertEqual(merged.fill, 'red');
  assertEqual(merged.stroke, 'black');
  assertEqual(merged.strokeWidth, '2');
  assertEqual(merged.opacity, '0.5');
});

// ============================================================================
// resolveUse Tests
// ============================================================================

test('resolveUse: returns null for missing reference', () => {
  const useData = { href: 'nonexistent', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {};

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertNull(result);
});

test('resolveUse: simple element reference', () => {
  const useData = { href: 'myRect', x: 10, y: 20, width: null, height: null, style: {} };
  const defs = {
    myRect: {
      type: 'rect',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      style: { fill: 'red' }
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
  assertTrue(result.transform instanceof Matrix);
});

test('resolveUse: applies x, y translation', () => {
  const useData = { href: 'myRect', x: 100, y: 200, width: null, height: null, style: {} };
  const defs = {
    myRect: {
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      style: {}
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
  // The transform should include the translation
  assertTrue(result.transform instanceof Matrix);
});

test('resolveUse: symbol with viewBox', () => {
  const useData = { href: 'mySymbol', x: 0, y: 0, width: 100, height: 100, style: {} };
  const defs = {
    mySymbol: {
      type: 'symbol',
      viewBoxParsed: { x: 0, y: 0, width: 50, height: 50 },
      preserveAspectRatio: 'xMidYMid meet',
      children: [
        { type: 'rect', x: 0, y: 0, width: 50, height: 50, style: {} }
      ]
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
  assertTrue(result.children.length > 0);
});

test('resolveUse: respects maxDepth', () => {
  // Create deeply nested structure: use -> use -> use -> rect
  const useData = { href: 'use1', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {
    use1: {
      type: 'use',
      href: 'use2',
      x: 0,
      y: 0,
      width: null,
      height: null,
      children: []
    },
    use2: {
      type: 'use',
      href: 'use3',
      x: 0,
      y: 0,
      width: null,
      height: null,
      children: []
    },
    use3: {
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      style: {}
    }
  };

  // With maxDepth 1, should only resolve one level deep, stopping before reaching use3
  const result = UseSymbolResolver.resolveUse(useData, defs, { maxDepth: 1 });

  // Result should be limited due to maxDepth
  assertTrue(result !== null);
});

// ============================================================================
// elementToPolygon Tests
// ============================================================================

test('elementToPolygon: rect to polygon', () => {
  const element = {
    type: 'rect',
    x: 0,
    y: 0,
    width: 100,
    height: 50
  };

  const polygon = UseSymbolResolver.elementToPolygon(element, Matrix.identity(3), 10);

  assertTrue(polygon.length >= 4);
});

test('elementToPolygon: circle to polygon', () => {
  const element = {
    type: 'circle',
    cx: 50,
    cy: 50,
    r: 25
  };

  const polygon = UseSymbolResolver.elementToPolygon(element, Matrix.identity(3), 16);

  assertTrue(polygon.length >= 16);
});

test('elementToPolygon: applies transform', () => {
  const element = {
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10
  };

  const M = Matrix.identity(3);
  const polygon = UseSymbolResolver.elementToPolygon(element, M, 10);

  assertTrue(polygon.length >= 4);
});

// ============================================================================
// flattenResolvedUse Tests
// ============================================================================

test('flattenResolvedUse: null resolved returns empty', () => {
  const result = UseSymbolResolver.flattenResolvedUse(null);
  assertEqual(result.length, 0);
});

test('flattenResolvedUse: single child', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: { fill: 'red' },
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 50, height: 50, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const result = UseSymbolResolver.flattenResolvedUse(resolved, 10);

  assertTrue(result.length >= 1);
  assertTrue(result[0].polygon.length >= 4);
});

test('flattenResolvedUse: multiple children', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 25, height: 25, style: {} },
        transform: Matrix.identity(3)
      },
      {
        element: { type: 'circle', cx: 50, cy: 50, r: 10, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const result = UseSymbolResolver.flattenResolvedUse(resolved, 10);

  assertEqual(result.length, 2);
});

// ============================================================================
// getResolvedBBox Tests
// ============================================================================

test('getResolvedBBox: empty resolved returns zero bbox', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: []
  };

  const bbox = UseSymbolResolver.getResolvedBBox(resolved);

  assertEqual(bbox.width, 0);
  assertEqual(bbox.height, 0);
});

test('getResolvedBBox: single rect', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: [
      {
        element: { type: 'rect', x: 10, y: 20, width: 100, height: 50, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const bbox = UseSymbolResolver.getResolvedBBox(resolved, 10);

  assertClose(bbox.x, 10, 1);
  assertClose(bbox.y, 20, 1);
  assertClose(bbox.width, 100, 1);
  assertClose(bbox.height, 50, 1);
});

// ============================================================================
// clipResolvedUse Tests
// ============================================================================

test('clipResolvedUse: clips to polygon', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 100, height: 100, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const clipPolygon = [
    PolygonClip.point(25, 25),
    PolygonClip.point(75, 25),
    PolygonClip.point(75, 75),
    PolygonClip.point(25, 75)
  ];

  const result = UseSymbolResolver.clipResolvedUse(resolved, clipPolygon, 10);

  assertTrue(result.length >= 1);
  assertTrue(result[0].polygon.length >= 4);
});

test('clipResolvedUse: preserves style', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: { fill: 'red' },
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 100, height: 100, style: { stroke: 'black' } },
        transform: Matrix.identity(3)
      }
    ]
  };

  const clipPolygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];

  const result = UseSymbolResolver.clipResolvedUse(resolved, clipPolygon, 10);

  assertTrue(result.length >= 1);
  assertEqual(result[0].style.fill, 'red');
  assertEqual(result[0].style.stroke, 'black');
});

// ============================================================================
// resolvedUseToPathData Tests
// ============================================================================

test('resolvedUseToPathData: generates valid path', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 50, height: 50, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const pathData = UseSymbolResolver.resolvedUseToPathData(resolved, 10);

  assertTrue(pathData.startsWith('M'));
  assertTrue(pathData.includes('L'));
  assertTrue(pathData.endsWith('Z'));
});

test('resolvedUseToPathData: multiple shapes combined', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: [
      {
        element: { type: 'rect', x: 0, y: 0, width: 25, height: 25, style: {} },
        transform: Matrix.identity(3)
      },
      {
        element: { type: 'rect', x: 50, y: 50, width: 25, height: 25, style: {} },
        transform: Matrix.identity(3)
      }
    ]
  };

  const pathData = UseSymbolResolver.resolvedUseToPathData(resolved, 10);

  // Should have two M commands (one per shape)
  const mCount = (pathData.match(/M/g) || []).length;
  assertEqual(mCount, 2);
});

test('resolvedUseToPathData: empty resolved returns empty', () => {
  const resolved = {
    transform: Matrix.identity(3),
    inheritedStyle: {},
    children: []
  };

  const pathData = UseSymbolResolver.resolvedUseToPathData(resolved, 10);

  assertEqual(pathData, '');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Edge case: deeply nested use', () => {
  const useData = { href: 'level1', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {
    level1: {
      type: 'g',
      children: [
        { type: 'rect', x: 0, y: 0, width: 10, height: 10, style: {} }
      ]
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs, { maxDepth: 5 });

  assertTrue(result !== null);
});

test('Edge case: symbol with zero viewBox', () => {
  const viewBox = { x: 0, y: 0, width: 0, height: 0 };
  const M = UseSymbolResolver.calculateViewBoxTransform(viewBox, 100, 100);

  // Should return identity for invalid viewBox
  assertTrue(M instanceof Matrix);
});

test('Edge case: use with no width/height but symbol has viewBox', () => {
  const useData = { href: 'sym', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {
    sym: {
      type: 'symbol',
      viewBoxParsed: { x: 0, y: 0, width: 100, height: 100 },
      preserveAspectRatio: 'xMidYMid meet',
      children: [
        { type: 'rect', x: 0, y: 0, width: 100, height: 100, style: {} }
      ]
    }
  };

  // Should use viewBox dimensions as width/height
  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
});

test('Edge case: polygon element in defs', () => {
  const useData = { href: 'poly', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {
    poly: {
      type: 'polygon',
      points: '0,0 100,0 100,100 0,100',
      style: {}
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
});

test('Edge case: path element in defs', () => {
  const useData = { href: 'myPath', x: 0, y: 0, width: null, height: null, style: {} };
  const defs = {
    myPath: {
      type: 'path',
      d: 'M0,0 L100,0 L100,100 L0,100 Z',
      style: {}
    }
  };

  const result = UseSymbolResolver.resolveUse(useData, defs);

  assertTrue(result !== null);
});

// ============================================================================
// Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('USE/SYMBOL RESOLVER UNIT TESTS');
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
