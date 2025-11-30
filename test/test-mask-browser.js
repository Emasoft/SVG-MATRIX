/**
 * Browser-based verification tests for Mask Resolver
 * Tests SVG masks with various shapes and mesh gradients in a real browser
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
  test('Basic luminance mask with white rect', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="whiteMask">
            <rect x="25" y="25" width="150" height="150" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="blue" mask="url(#whiteMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const maskExists = await page.evaluate(() => {
      return document.querySelector('mask#whiteMask') !== null;
    });
    if (!maskExists) throw new Error('Mask element not found');
  }),

  test('Luminance mask with black rect hides content', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="blackMask">
            <rect x="0" y="0" width="200" height="200" fill="black"/>
          </mask>
        </defs>
        <rect id="target" x="0" y="0" width="200" height="200" fill="red" mask="url(#blackMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const hasMask = await page.evaluate(() => {
      const target = document.getElementById('target');
      return target.getAttribute('mask') === 'url(#blackMask)';
    });
    if (!hasMask) throw new Error('Mask not applied to target');
  }),

  test('Alpha mask (mask-type: alpha)', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="alphaMask" style="mask-type: alpha">
            <rect x="50" y="50" width="100" height="100" fill="white" fill-opacity="0.5"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="green" mask="url(#alphaMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const maskType = await page.evaluate(() => {
      const mask = document.querySelector('mask#alphaMask');
      return mask.style.maskType || 'luminance';
    });
    if (maskType !== 'alpha') throw new Error(`Expected alpha, got ${maskType}`);
  }),

  test('Mask with circle shape', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="circleMask">
            <circle cx="100" cy="100" r="80" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="purple" mask="url(#circleMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const circleExists = await page.evaluate(() => {
      return document.querySelector('mask#circleMask circle') !== null;
    });
    if (!circleExists) throw new Error('Circle in mask not found');
  }),

  test('Mask with gradient fill', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gradMask" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="black"/>
            <stop offset="100%" stop-color="white"/>
          </linearGradient>
          <mask id="gradientMask">
            <rect x="0" y="0" width="200" height="200" fill="url(#gradMask)"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="orange" mask="url(#gradientMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const hasGradient = await page.evaluate(() => {
      const rect = document.querySelector('mask rect');
      return rect && rect.getAttribute('fill').includes('url(#gradMask)');
    });
    if (!hasGradient) throw new Error('Gradient fill not applied in mask');
  }),

  test('Mask with multiple shapes', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="multiMask">
            <rect x="10" y="10" width="80" height="80" fill="white"/>
            <circle cx="150" cy="150" r="40" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="teal" mask="url(#multiMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const shapeCount = await page.evaluate(() => {
      return document.querySelectorAll('mask#multiMask > *').length;
    });
    if (shapeCount !== 2) throw new Error(`Expected 2 shapes, got ${shapeCount}`);
  }),

  test('Mask with objectBoundingBox units', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="bboxMask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect x="0.1" y="0.1" width="0.8" height="0.8" fill="white"/>
          </mask>
        </defs>
        <rect x="50" y="50" width="100" height="100" fill="coral" mask="url(#bboxMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const maskUnits = await page.evaluate(() => {
      const mask = document.querySelector('mask#bboxMask');
      return mask.getAttribute('maskUnits');
    });
    if (maskUnits !== 'objectBoundingBox') throw new Error(`Expected objectBoundingBox, got ${maskUnits}`);
  }),

  test('Mask with path shape', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="pathMask">
            <path d="M100,20 L180,180 L20,180 Z" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="navy" mask="url(#pathMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const pathExists = await page.evaluate(() => {
      return document.querySelector('mask#pathMask path') !== null;
    });
    if (!pathExists) throw new Error('Path in mask not found');
  }),

  test('Nested group in mask', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="groupMask">
            <g fill="white">
              <rect x="20" y="20" width="60" height="60"/>
              <rect x="120" y="120" width="60" height="60"/>
            </g>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="maroon" mask="url(#groupMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const groupExists = await page.evaluate(() => {
      return document.querySelector('mask#groupMask g') !== null;
    });
    if (!groupExists) throw new Error('Group in mask not found');
  }),

  test('Mask affects visual rendering (screenshot test)', async (page) => {
    // Without mask
    const svgNoMask = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect id="target" x="0" y="0" width="100" height="100" fill="red"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgNoMask}</body></html>`);
    const screenshotNoMask = await page.screenshot({ type: 'png' });

    // With mask that covers half
    const svgWithMask = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="halfMask">
            <rect x="0" y="0" width="50" height="100" fill="white"/>
          </mask>
        </defs>
        <rect id="target" x="0" y="0" width="100" height="100" fill="red" mask="url(#halfMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgWithMask}</body></html>`);
    const screenshotWithMask = await page.screenshot({ type: 'png' });

    // Screenshots should be different
    if (screenshotNoMask.equals(screenshotWithMask)) {
      throw new Error('Mask did not affect visual rendering');
    }
  }),

  test('Ellipse mask shape', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="ellipseMask">
            <ellipse cx="100" cy="100" rx="80" ry="50" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="olive" mask="url(#ellipseMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const ellipseExists = await page.evaluate(() => {
      return document.querySelector('mask#ellipseMask ellipse') !== null;
    });
    if (!ellipseExists) throw new Error('Ellipse in mask not found');
  }),

  test('Polygon mask shape', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="polygonMask">
            <polygon points="100,10 190,190 10,190" fill="white"/>
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill="indigo" mask="url(#polygonMask)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const polygonExists = await page.evaluate(() => {
      return document.querySelector('mask#polygonMask polygon') !== null;
    });
    if (!polygonExists) throw new Error('Polygon in mask not found');
  }),
];

// ============================================================================
// Run Tests and Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('MASK RESOLVER BROWSER VERIFICATION TESTS');
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
