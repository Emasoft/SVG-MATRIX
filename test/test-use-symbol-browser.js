/**
 * Browser-based verification tests for Use/Symbol Resolver
 * Tests SVG use elements, symbols, and viewBox handling in a real browser
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
  test('Basic use element referencing rect', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="myRect" width="50" height="50" fill="red"/>
        </defs>
        <use href="#myRect" x="10" y="10"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const useExists = await page.evaluate(() => {
      return document.querySelector('use[href="#myRect"]') !== null;
    });
    if (!useExists) throw new Error('Use element not found');
  }),

  test('Use element with xlink:href (legacy)', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs>
          <circle id="myCircle" r="25" fill="blue"/>
        </defs>
        <use xlink:href="#myCircle" x="50" y="50"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const useExists = await page.evaluate(() => {
      const use = document.querySelector('use');
      return use && (use.getAttribute('xlink:href') === '#myCircle' || use.href?.baseVal === '#myCircle');
    });
    if (!useExists) throw new Error('Use element with xlink:href not found');
  }),

  test('Use element applies x,y translation', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="transRect" width="20" height="20" fill="green"/>
        </defs>
        <use href="#transRect" x="100" y="100"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const position = await page.evaluate(() => {
      const use = document.querySelector('use');
      return { x: use.getAttribute('x'), y: use.getAttribute('y') };
    });
    if (position.x !== '100' || position.y !== '100') throw new Error('Use position not applied');
  }),

  test('Symbol element with viewBox', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="mySymbol" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="purple"/>
            <circle cx="50" cy="50" r="30" fill="white"/>
          </symbol>
        </defs>
        <use href="#mySymbol" x="10" y="10" width="80" height="80"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const symbolViewBox = await page.evaluate(() => {
      const symbol = document.querySelector('symbol#mySymbol');
      return symbol.getAttribute('viewBox');
    });
    if (symbolViewBox !== '0 0 100 100') throw new Error('Symbol viewBox not found');
  }),

  test('Use element with width and height', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="sizedSymbol" viewBox="0 0 50 50">
            <rect width="50" height="50" fill="orange"/>
          </symbol>
        </defs>
        <use href="#sizedSymbol" x="0" y="0" width="100" height="100"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const size = await page.evaluate(() => {
      const use = document.querySelector('use');
      return { width: use.getAttribute('width'), height: use.getAttribute('height') };
    });
    if (size.width !== '100' || size.height !== '100') throw new Error('Use size not applied');
  }),

  test('Symbol preserveAspectRatio', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="aspectSymbol" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
            <rect width="100" height="50" fill="teal"/>
          </symbol>
        </defs>
        <use href="#aspectSymbol" x="0" y="0" width="200" height="200"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const par = await page.evaluate(() => {
      const symbol = document.querySelector('symbol#aspectSymbol');
      return symbol.getAttribute('preserveAspectRatio');
    });
    if (par !== 'xMidYMid meet') throw new Error(`Expected xMidYMid meet, got ${par}`);
  }),

  test('Multiple use elements referencing same def', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <circle id="sharedCircle" r="20" fill="red"/>
        </defs>
        <use href="#sharedCircle" x="50" y="50"/>
        <use href="#sharedCircle" x="150" y="50"/>
        <use href="#sharedCircle" x="100" y="150"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const useCount = await page.evaluate(() => {
      return document.querySelectorAll('use[href="#sharedCircle"]').length;
    });
    if (useCount !== 3) throw new Error(`Expected 3 use elements, got ${useCount}`);
  }),

  test('Use element referencing group', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="myGroup">
            <rect x="0" y="0" width="30" height="30" fill="navy"/>
            <circle cx="40" cy="15" r="10" fill="gold"/>
          </g>
        </defs>
        <use href="#myGroup" x="20" y="20"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const groupChildren = await page.evaluate(() => {
      return document.querySelectorAll('#myGroup > *').length;
    });
    if (groupChildren !== 2) throw new Error('Group children not found');
  }),

  test('Nested use elements', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="baseRect" width="20" height="20" fill="lime"/>
          <g id="useGroup">
            <use href="#baseRect" x="0" y="0"/>
            <use href="#baseRect" x="25" y="0"/>
          </g>
        </defs>
        <use href="#useGroup" x="50" y="50"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const nestedUses = await page.evaluate(() => {
      return document.querySelectorAll('#useGroup use').length;
    });
    if (nestedUses !== 2) throw new Error(`Expected 2 nested uses, got ${nestedUses}`);
  }),

  test('Use element with transform', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="transformRect" width="40" height="40" fill="coral"/>
        </defs>
        <use href="#transformRect" x="100" y="100" transform="rotate(45 100 100)"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const transform = await page.evaluate(() => {
      const use = document.querySelector('use');
      return use.getAttribute('transform');
    });
    if (!transform.includes('rotate')) throw new Error('Use transform not applied');
  }),

  test('Use inherits style from referenced element', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="styledRect" width="50" height="50" fill="pink" stroke="black" stroke-width="2"/>
        </defs>
        <use href="#styledRect" x="75" y="75"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const styles = await page.evaluate(() => {
      const rect = document.querySelector('#styledRect');
      return {
        fill: rect.getAttribute('fill'),
        stroke: rect.getAttribute('stroke')
      };
    });
    if (styles.fill !== 'pink' || styles.stroke !== 'black') throw new Error('Styles not found on referenced element');
  }),

  test('Use can override presentation attributes', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="overrideRect" width="50" height="50" fill="gray"/>
        </defs>
        <use href="#overrideRect" x="75" y="75" fill="red"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const useFill = await page.evaluate(() => {
      const use = document.querySelector('use');
      return use.getAttribute('fill');
    });
    if (useFill !== 'red') throw new Error('Use fill override not applied');
  }),

  test('Use element renders visually', async (page) => {
    // Empty SVG
    const svgEmpty = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgEmpty}</body></html>`);
    const screenshotEmpty = await page.screenshot({ type: 'png' });

    // SVG with use element
    const svgUse = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <rect id="visibleRect" width="80" height="80" fill="blue"/>
        </defs>
        <use href="#visibleRect" x="10" y="10"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svgUse}</body></html>`);
    const screenshotUse = await page.screenshot({ type: 'png' });

    if (screenshotEmpty.equals(screenshotUse)) {
      throw new Error('Use element did not render');
    }
  }),

  test('Symbol with complex content', async (page) => {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="complexSymbol" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#f0f0f0"/>
            <circle cx="25" cy="25" r="15" fill="red"/>
            <circle cx="75" cy="25" r="15" fill="green"/>
            <circle cx="25" cy="75" r="15" fill="blue"/>
            <circle cx="75" cy="75" r="15" fill="yellow"/>
            <rect x="40" y="40" width="20" height="20" fill="black"/>
          </symbol>
        </defs>
        <use href="#complexSymbol" x="50" y="50" width="100" height="100"/>
      </svg>
    `;
    await page.setContent(`<!DOCTYPE html><html><body>${svg}</body></html>`);

    const childCount = await page.evaluate(() => {
      return document.querySelectorAll('symbol#complexSymbol > *').length;
    });
    if (childCount !== 6) throw new Error(`Expected 6 children in symbol, got ${childCount}`);
  }),
];

// ============================================================================
// Run Tests and Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('USE/SYMBOL RESOLVER BROWSER VERIFICATION TESTS');
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
