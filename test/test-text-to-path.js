/**
 * Test suite for Text-to-Path Module
 * Tests text measurement, conversion, and clipping
 */

import Decimal from 'decimal.js';
import * as TextToPath from '../src/text-to-path.js';
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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertClose(a, b, tolerance = 1e-10, message = '') {
  const diff = Math.abs(Number(a) - Number(b));
  if (diff > tolerance) {
    throw new Error(`${message}: expected ${a} ~ ${b}, diff = ${diff}`);
  }
}

console.log('\n======================================================================');
console.log('TEXT-TO-PATH TESTS');
console.log('======================================================================\n');

// ============================================================================
// Font Size Parsing Tests
// ============================================================================

test('parseFontSize: pixels', () => {
  assert(TextToPath.parseFontSize('16px') === 16, '16px should be 16');
  assert(TextToPath.parseFontSize('24px') === 24, '24px should be 24');
});

test('parseFontSize: points', () => {
  assertClose(TextToPath.parseFontSize('12pt'), 15.996, 0.01, '12pt');
});

test('parseFontSize: em units', () => {
  assert(TextToPath.parseFontSize('2em') === 32, '2em should be 32');
  assert(TextToPath.parseFontSize('1.5em') === 24, '1.5em should be 24');
});

test('parseFontSize: percentage', () => {
  assert(TextToPath.parseFontSize('100%') === 16, '100% should be 16');
  assert(TextToPath.parseFontSize('200%') === 32, '200% should be 32');
});

test('parseFontSize: no unit defaults to px', () => {
  assert(TextToPath.parseFontSize('20') === 20, '20 should be 20');
});

test('parseFontSize: invalid returns default', () => {
  assert(TextToPath.parseFontSize('invalid') === 16, 'invalid should return 16');
  assert(TextToPath.parseFontSize(null) === 16, 'null should return 16');
  assert(TextToPath.parseFontSize('') === 16, 'empty should return 16');
});

// ============================================================================
// Text Measurement Tests
// ============================================================================

test('measureText: returns width, height, ascent, descent', () => {
  const metrics = TextToPath.measureText('Hello', { fontSize: '16px' });
  assert(metrics.width instanceof Decimal, 'width should be Decimal');
  assert(metrics.height instanceof Decimal, 'height should be Decimal');
  assert(metrics.ascent instanceof Decimal, 'ascent should be Decimal');
  assert(metrics.descent instanceof Decimal, 'descent should be Decimal');
});

test('measureText: longer text has larger width', () => {
  const short = TextToPath.measureText('Hi', { fontSize: '16px' });
  const long = TextToPath.measureText('Hello World', { fontSize: '16px' });
  assert(long.width.gt(short.width), 'Longer text should be wider');
});

test('measureText: larger font has larger metrics', () => {
  const small = TextToPath.measureText('Test', { fontSize: '12px' });
  const large = TextToPath.measureText('Test', { fontSize: '24px' });
  assert(large.height.gt(small.height), 'Larger font should be taller');
});

test('measureText: empty string has zero width', () => {
  const metrics = TextToPath.measureText('', { fontSize: '16px' });
  assert(metrics.width.equals(0), 'Empty string width should be 0');
});

// ============================================================================
// Text to Path Conversion Tests
// ============================================================================

test('textToPath: returns path data string', () => {
  const path = TextToPath.textToPath('A', { x: 0, y: 20, fontSize: 16 });
  assert(typeof path === 'string', 'Should return string');
  assert(path.length > 0, 'Should not be empty');
});

test('textToPath: empty text returns empty string', () => {
  const path = TextToPath.textToPath('', { x: 0, y: 20, fontSize: 16 });
  assert(path === '', 'Empty text should return empty path');
});

test('textToPath: path starts with M command', () => {
  const path = TextToPath.textToPath('X', { x: 10, y: 20, fontSize: 16 });
  assert(path.startsWith('M'), 'Path should start with M command');
});

test('textToPath: multiple characters produce multiple paths', () => {
  const path = TextToPath.textToPath('ABC', { x: 0, y: 20, fontSize: 16 });
  const mCount = (path.match(/M/g) || []).length;
  assert(mCount >= 3, 'Should have at least 3 M commands for 3 characters');
});

test('textToPath: text-anchor start (default)', () => {
  const path = TextToPath.textToPath('Test', {
    x: 100,
    y: 50,
    fontSize: 16,
    textAnchor: TextToPath.TextAnchor.START
  });
  // First M command should be near x=100
  const match = path.match(/M([\d.]+)/);
  assert(match, 'Should have M command');
  assertClose(parseFloat(match[1]), 100, 1, 'Start anchor x position');
});

test('textToPath: text-anchor middle', () => {
  const metrics = TextToPath.measureText('Test', { fontSize: '16px' });
  const path = TextToPath.textToPath('Test', {
    x: 100,
    y: 50,
    fontSize: 16,
    textAnchor: TextToPath.TextAnchor.MIDDLE
  });
  const match = path.match(/M([\d.]+)/);
  assert(match, 'Should have M command');
  // X should be offset by half the width
  const expectedX = 100 - Number(metrics.width) / 2;
  assertClose(parseFloat(match[1]), expectedX, 1, 'Middle anchor x position');
});

test('textToPath: text-anchor end', () => {
  const metrics = TextToPath.measureText('Test', { fontSize: '16px' });
  const path = TextToPath.textToPath('Test', {
    x: 100,
    y: 50,
    fontSize: 16,
    textAnchor: TextToPath.TextAnchor.END
  });
  const match = path.match(/M([\d.]+)/);
  assert(match, 'Should have M command');
  // X should be offset by full width
  const expectedX = 100 - Number(metrics.width);
  assertClose(parseFloat(match[1]), expectedX, 1, 'End anchor x position');
});

// ============================================================================
// Text to Polygon Tests
// ============================================================================

test('textToPolygon: returns 4-vertex polygon', () => {
  const polygon = TextToPath.textToPolygon({
    x: 10,
    y: 20,
    fontSize: 16,
    text: 'Hello'
  });
  assert(polygon.length === 4, 'Bounding box should have 4 vertices');
});

test('textToPolygon: polygon has correct bounds', () => {
  const polygon = TextToPath.textToPolygon({
    x: 10,
    y: 50,
    fontSize: 16,
    text: 'Test'
  });

  // All x values should be >= 10 (starting x)
  for (const p of polygon) {
    assert(Number(p.x) >= 9.9, 'X should be >= starting x');
  }
});

test('textToPolygon: wider text produces wider polygon', () => {
  const short = TextToPath.textToPolygon({ x: 0, y: 50, fontSize: 16, text: 'Hi' });
  const long = TextToPath.textToPolygon({ x: 0, y: 50, fontSize: 16, text: 'Hello World' });

  const shortWidth = Number(short[1].x) - Number(short[0].x);
  const longWidth = Number(long[1].x) - Number(long[0].x);

  assert(longWidth > shortWidth, 'Longer text should produce wider polygon');
});

// ============================================================================
// Text Element Parsing Tests
// ============================================================================

test('parseTextElement: mock element parsing', () => {
  const mockElement = {
    getAttribute: (name) => {
      const attrs = {
        x: '50',
        y: '100',
        dx: '5',
        dy: '2',
        'font-size': '20px',
        'font-family': 'Arial',
        'text-anchor': 'middle',
        'fill': 'red',
        'transform': 'translate(10, 10)'
      };
      return attrs[name] || null;
    },
    childNodes: [
      { nodeType: 3, textContent: 'Hello World' }
    ],
    querySelectorAll: () => []
  };

  const data = TextToPath.parseTextElement(mockElement);

  assert(data.x === 50, 'X should be 50');
  assert(data.y === 100, 'Y should be 100');
  assert(data.dx === 5, 'DX should be 5');
  assert(data.dy === 2, 'DY should be 2');
  assert(data.text === 'Hello World', 'Text should be parsed');
  assert(data.style.fontSize === '20px', 'Font size should be parsed');
  assert(data.style.fontFamily === 'Arial', 'Font family should be parsed');
  assert(data.style.textAnchor === 'middle', 'Text anchor should be parsed');
  assert(data.style.fill === 'red', 'Fill should be parsed');
  assert(data.transform === 'translate(10, 10)', 'Transform should be parsed');
});

test('parseTextElement: with tspans', () => {
  const mockElement = {
    getAttribute: (name) => {
      if (name === 'x') return '10';
      if (name === 'y') return '20';
      return null;
    },
    childNodes: [],
    querySelectorAll: () => [{
      getAttribute: (name) => {
        if (name === 'x') return '30';
        if (name === 'dy') return '15';
        return null;
      },
      textContent: 'Span Text'
    }]
  };

  const data = TextToPath.parseTextElement(mockElement);

  assert(data.tspans.length === 1, 'Should have 1 tspan');
  assert(data.tspans[0].x === 30, 'Tspan x should be 30');
  assert(data.tspans[0].dy === 15, 'Tspan dy should be 15');
  assert(data.tspans[0].text === 'Span Text', 'Tspan text should be parsed');
});

// ============================================================================
// Text Element to Path Conversion Tests
// ============================================================================

test('textElementToPath: produces path data', () => {
  const textData = {
    x: 10,
    y: 50,
    dx: 0,
    dy: 0,
    text: 'Test',
    style: {
      fontSize: '16px',
      fontFamily: 'Arial',
      textAnchor: 'start',
      dominantBaseline: 'auto',
      letterSpacing: '0',
      fill: 'black'
    },
    tspans: [],
    transform: null
  };

  const result = TextToPath.textElementToPath(textData);

  assert(result.d.length > 0, 'Should produce path data');
  assert(result.fill === 'black', 'Should preserve fill');
});

test('textElementToPath: with tspans', () => {
  const textData = {
    x: 10,
    y: 50,
    dx: 0,
    dy: 0,
    text: 'Line1',
    style: {
      fontSize: '16px',
      fontFamily: 'Arial',
      textAnchor: 'start',
      dominantBaseline: 'auto',
      letterSpacing: '0',
      fill: 'blue'
    },
    tspans: [{
      x: null,
      y: null,
      dx: 5,
      dy: 20,
      text: 'Line2'
    }],
    transform: 'rotate(45)'
  };

  const result = TextToPath.textElementToPath(textData);

  assert(result.d.length > 0, 'Should produce path data');
  assert(result.transform === 'rotate(45)', 'Should preserve transform');
  // Path should contain data for both texts
  const mCount = (result.d.match(/M/g) || []).length;
  assert(mCount >= 5, 'Should have paths for both text strings');
});

// ============================================================================
// Text Bounding Box Tests
// ============================================================================

test('getTextBBox: returns box with x, y, width, height', () => {
  const textData = {
    x: 10,
    y: 50,
    dx: 5,
    dy: 2,
    text: 'Test',
    style: {
      fontSize: '16px',
      textAnchor: 'start'
    },
    tspans: []
  };

  const bbox = TextToPath.getTextBBox(textData);

  assert(typeof bbox.x === 'number', 'x should be number');
  assert(typeof bbox.y === 'number', 'y should be number');
  assert(typeof bbox.width === 'number', 'width should be number');
  assert(typeof bbox.height === 'number', 'height should be number');
  assert(bbox.width > 0, 'width should be positive');
  assert(bbox.height > 0, 'height should be positive');
});

test('getTextBBox: respects text-anchor', () => {
  const createTextData = (anchor) => ({
    x: 100,
    y: 50,
    dx: 0,
    dy: 0,
    text: 'Test',
    style: { fontSize: '16px', textAnchor: anchor },
    tspans: []
  });

  const startBBox = TextToPath.getTextBBox(createTextData('start'));
  const middleBBox = TextToPath.getTextBBox(createTextData('middle'));
  const endBBox = TextToPath.getTextBBox(createTextData('end'));

  assert(startBBox.x >= 100, 'Start anchor x >= 100');
  assert(middleBBox.x < 100, 'Middle anchor x < 100');
  assert(endBBox.x < middleBBox.x, 'End anchor x < middle anchor x');
});

// ============================================================================
// Text Clipping Tests
// ============================================================================

test('clipText: clips text to rectangle', () => {
  const textData = {
    x: 50,
    y: 50,
    dx: 0,
    dy: 0,
    text: 'Hello World',
    style: {
      fontSize: '16px',
      textAnchor: 'start',
      dominantBaseline: 'auto'
    },
    tspans: []
  };

  const clipPolygon = [
    PolygonClip.point(40, 30),
    PolygonClip.point(100, 30),
    PolygonClip.point(100, 60),
    PolygonClip.point(40, 60)
  ];

  const clipped = TextToPath.clipText(textData, clipPolygon);

  assert(clipped.length >= 0, 'Should return array');
  if (clipped.length > 0) {
    assert(clipped[0].length >= 3, 'Clipped polygon should have >= 3 vertices');
  }
});

test('clipText: non-overlapping returns empty', () => {
  const textData = {
    x: 50,
    y: 50,
    dx: 0,
    dy: 0,
    text: 'Test',
    style: {
      fontSize: '16px',
      textAnchor: 'start',
      dominantBaseline: 'auto'
    },
    tspans: []
  };

  // Clip region far away from text
  const clipPolygon = [
    PolygonClip.point(500, 500),
    PolygonClip.point(600, 500),
    PolygonClip.point(600, 600),
    PolygonClip.point(500, 600)
  ];

  const clipped = TextToPath.clipText(textData, clipPolygon);

  assert(clipped.length === 0, 'Non-overlapping clip should return empty');
});

// ============================================================================
// Constants Tests
// ============================================================================

test('TextAnchor constants defined', () => {
  assert(TextToPath.TextAnchor.START === 'start', 'START');
  assert(TextToPath.TextAnchor.MIDDLE === 'middle', 'MIDDLE');
  assert(TextToPath.TextAnchor.END === 'end', 'END');
});

test('DominantBaseline constants defined', () => {
  assert(TextToPath.DominantBaseline.AUTO === 'auto', 'AUTO');
  assert(TextToPath.DominantBaseline.MIDDLE === 'middle', 'MIDDLE');
  assert(TextToPath.DominantBaseline.HANGING === 'hanging', 'HANGING');
  assert(TextToPath.DominantBaseline.ALPHABETIC === 'alphabetic', 'ALPHABETIC');
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
    const errMsg = r.error.slice(0, 52) + (r.error.length > 52 ? '...' : '');
    console.log(`│   Error: ${errMsg}`.padEnd(60) + '│          │');
  }
}

console.log('└─────────────────────────────────────────────────────────┴──────────┘');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
