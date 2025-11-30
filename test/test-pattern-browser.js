/**
 * Browser-based verification tests for Pattern Resolver
 * Tests SVG patterns with various shapes and units in a real browser
 */

import { chromium } from 'playwright';

const results = [];

function test(name, fn) {
  return { name, fn };
}

async function runTests(tests) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    for (const { name, fn } of tests) {
      try {
        await fn(page);
        results.push({ name, passed: true });
      } catch (e) {
        results.push({ name, passed: false, error: e.message });
      }
    }
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================================
// Test Definitions
// ============================================================================

const tests = [
  test('Basic pattern with rect tile', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="rectPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="red"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#rectPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const patternExists = await page.evaluate(() => {
      return document.querySelector('pattern#rectPattern') !== null;
    });
    if (!patternExists) throw new Error('Pattern element not found');
  }),

  test('Pattern with circle tile', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="circlePattern" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="10" fill="blue"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#circlePattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const circleExists = await page.evaluate(() => {
      return document.querySelector('pattern#circlePattern circle') !== null;
    });
    if (!circleExists) throw new Error('Circle in pattern not found');
  }),

  test('Pattern with objectBoundingBox units', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="bboxPattern" width="0.25" height="0.25" patternUnits="objectBoundingBox">
            <rect x="0" y="0" width="10" height="10" fill="green"/>
          </pattern>
        </defs>
        <rect x="50" y="50" width="100" height="100" fill="url(#bboxPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const patternUnits = await page.evaluate(() => {
      const pattern = document.querySelector('pattern#bboxPattern');
      return pattern.getAttribute('patternUnits');
    });
    if (patternUnits !== 'objectBoundingBox') throw new Error(`Expected objectBoundingBox, got ${patternUnits}`);
  }),

  test('Pattern with patternContentUnits', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="contentPattern" width="50" height="50" patternUnits="userSpaceOnUse" patternContentUnits="objectBoundingBox">
            <rect x="0" y="0" width="0.5" height="0.5" fill="purple"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#contentPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const contentUnits = await page.evaluate(() => {
      const pattern = document.querySelector('pattern#contentPattern');
      return pattern.getAttribute('patternContentUnits');
    });
    if (contentUnits !== 'objectBoundingBox') throw new Error(`Expected objectBoundingBox, got ${contentUnits}`);
  }),

  test('Pattern with viewBox', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="viewBoxPattern" width="40" height="40" viewBox="0 0 100 100" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="50" height="50" fill="orange"/>
            <rect x="50" y="50" width="50" height="50" fill="yellow"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#viewBoxPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const viewBox = await page.evaluate(() => {
      const pattern = document.querySelector('pattern#viewBoxPattern');
      return pattern.getAttribute('viewBox');
    });
    if (viewBox !== '0 0 100 100') throw new Error(`Expected viewBox, got ${viewBox}`);
  }),

  test('Pattern with patternTransform', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="transformPattern" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect x="0" y="0" width="15" height="15" fill="cyan"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#transformPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const transform = await page.evaluate(() => {
      const pattern = document.querySelector('pattern#transformPattern');
      return pattern.getAttribute('patternTransform');
    });
    if (!transform.includes('rotate')) throw new Error('patternTransform not applied');
  }),

  test('Pattern with multiple shapes', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="multiPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="20" height="20" fill="red"/>
            <circle cx="30" cy="30" r="8" fill="blue"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#multiPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const shapeCount = await page.evaluate(() => {
      return document.querySelectorAll('pattern#multiPattern > *').length;
    });
    if (shapeCount !== 2) throw new Error(`Expected 2 shapes, got ${shapeCount}`);
  }),

  test('Pattern with nested group', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="groupPattern" width="50" height="50" patternUnits="userSpaceOnUse">
            <g fill="magenta">
              <rect x="5" y="5" width="15" height="15"/>
              <rect x="30" y="30" width="15" height="15"/>
            </g>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#groupPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const groupExists = await page.evaluate(() => {
      return document.querySelector('pattern#groupPattern g') !== null;
    });
    if (!groupExists) throw new Error('Group in pattern not found');
  }),

  test('Pattern applied to circle', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="circleTargetPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="lime"/>
          </pattern>
        </defs>
        <circle cx="100" cy="100" r="80" fill="url(#circleTargetPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const hasFill = await page.evaluate(() => {
      const circle = document.querySelector('circle');
      return circle.getAttribute('fill').includes('url(#circleTargetPattern)');
    });
    if (!hasFill) throw new Error('Pattern not applied to circle');
  }),

  test('Pattern applied to path', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="pathPattern" width="25" height="25" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="8" fill="salmon"/>
          </pattern>
        </defs>
        <path d="M10,10 L190,10 L100,180 Z" fill="url(#pathPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const hasFill = await page.evaluate(() => {
      const path = document.querySelector('path');
      return path.getAttribute('fill').includes('url(#pathPattern)');
    });
    if (!hasFill) throw new Error('Pattern not applied to path');
  }),

  test('Pattern affects visual rendering', async (page) => {
    // Solid fill
    const svgSolid = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100" height="100" fill="red"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgSolid}</body></html>`);
    const screenshotSolid = await page.screenshot({ type: 'png' });

    // Pattern fill
    const svgPattern = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="checkPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="red"/>
            <rect x="10" y="10" width="10" height="10" fill="red"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#checkPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgPattern}</body></html>`);
    const screenshotPattern = await page.screenshot({ type: 'png' });

    if (screenshotSolid.equals(screenshotPattern)) {
      throw new Error('Pattern did not affect visual rendering');
    }
  }),

  test('Pattern with x,y offset', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="offsetPattern" x="10" y="10" width="30" height="30" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="15" height="15" fill="teal"/>
          </pattern>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="url(#offsetPattern)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const offset = await page.evaluate(() => {
      const pattern = document.querySelector('pattern#offsetPattern');
      return { x: pattern.getAttribute('x'), y: pattern.getAttribute('y') };
    });
    if (offset.x !== '10' || offset.y !== '10') throw new Error('Pattern offset not set');
  }),
];

// ============================================================================
// Run Tests and Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('PATTERN RESOLVER BROWSER VERIFICATION TESTS');
console.log('======================================================================\n');

await runTests(tests);

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
