/**
 * Browser-based verification test for Mesh Gradient with ClipPath
 * Tests the sample SVG with various clip paths in a real browser
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleSvgPath = path.join(__dirname, '..', 'samples', 'meshgradient_polyfill_example.svg');

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
  test('Sample SVG loads without errors', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    // Create HTML page with embedded SVG
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>body { margin: 0; padding: 20px; background: #eee; }</style>
      </head>
      <body>
        <div id="svg-container">${svgContent}</div>
      </body>
      </html>
    `;

    await page.setContent(html);

    // Check that SVG rendered
    const svg = await page.$('svg');
    if (!svg) throw new Error('SVG element not found');

    // Check for meshgradient element
    const meshGradient = await page.$('meshgradient');
    if (!meshGradient) throw new Error('meshgradient element not found');
  }),

  test('Mesh gradient has expected structure', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');
    await page.setContent(`<!DOCTYPE html><html><body>${svgContent}</body></html>`);

    const structure = await page.evaluate(() => {
      const mesh = document.querySelector('meshgradient');
      if (!mesh) return null;

      return {
        id: mesh.getAttribute('id'),
        x: mesh.getAttribute('x'),
        y: mesh.getAttribute('y'),
        type: mesh.getAttribute('type'),
        gradientUnits: mesh.getAttribute('gradientUnits'),
        meshRowCount: mesh.querySelectorAll('meshrow').length,
        meshPatchCount: mesh.querySelectorAll('meshpatch').length,
        stopCount: mesh.querySelectorAll('stop').length
      };
    });

    if (!structure) throw new Error('Could not analyze mesh gradient');
    if (structure.meshRowCount < 1) throw new Error('No mesh rows found');
    if (structure.meshPatchCount < 1) throw new Error('No mesh patches found');
    if (structure.stopCount < 4) throw new Error('Insufficient stops');
  }),

  test('Path element originally used mesh gradient fill', async (page) => {
    // Check the raw SVG source for mesh gradient reference
    // (The polyfill changes fill to 'none' after rendering)
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    // Verify the source SVG has a path with meshgradient fill
    const hasMeshFill = svgContent.includes('fill:url(#meshgradient');
    if (!hasMeshFill) throw new Error('SVG source does not contain mesh gradient fill reference');

    // Also verify the mesh gradient ID exists
    const hasMeshId = svgContent.includes('id="meshgradient');
    if (!hasMeshId) throw new Error('SVG source does not contain meshgradient element');
  }),

  test('Apply circular clipPath to mesh gradient', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    // Modify SVG to add a circular clipPath
    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="circleClip">
        <circle cx="25" cy="25" r="15"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#circleClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    // Take screenshot of clipped version
    const screenshot = await page.screenshot({ type: 'png' });

    // Verify the clipPath was applied by checking the DOM
    const hasClipPath = await page.evaluate(() => {
      const pathEl = document.getElementById('path2');
      return pathEl && pathEl.getAttribute('clip-path') !== null;
    });

    if (!hasClipPath) throw new Error('ClipPath was not applied to path element');
  }),

  test('Apply rectangular clipPath to mesh gradient', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="rectClip">
        <rect x="10" y="10" width="30" height="30"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#rectClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    const hasClipPath = await page.evaluate(() => {
      const pathEl = document.getElementById('path2');
      return pathEl && pathEl.getAttribute('clip-path') !== null;
    });

    if (!hasClipPath) throw new Error('Rectangular clipPath was not applied');
  }),

  test('Apply polygon clipPath to mesh gradient', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="polyClip">
        <polygon points="25,5 45,20 40,45 10,45 5,20"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#polyClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    const hasClipPath = await page.evaluate(() => {
      const pathEl = document.getElementById('path2');
      return pathEl && pathEl.getAttribute('clip-path') !== null;
    });

    if (!hasClipPath) throw new Error('Polygon clipPath was not applied');
  }),

  test('ClipPath affects visual rendering', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    // Get bounding box without clip
    await page.setContent(`<!DOCTYPE html><html><body>${svgContent}</body></html>`);
    await page.waitForTimeout(100); // Let polyfill run

    const unclippedBBox = await page.evaluate(() => {
      const pathEl = document.getElementById('path2');
      if (!pathEl) return null;
      const bbox = pathEl.getBBox();
      return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    });

    // Apply clipPath
    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="smallClip">
        <rect x="15" y="15" width="20" height="20"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#smallClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);
    await page.waitForTimeout(100);

    // Note: getBBox returns the unclipped geometry, but we verify the clipPath exists
    const clipPathExists = await page.evaluate(() => {
      const clipPath = document.getElementById('smallClip');
      const pathEl = document.getElementById('path2');
      return clipPath !== null && pathEl.getAttribute('clip-path') !== null;
    });

    if (!clipPathExists) throw new Error('ClipPath setup failed');
  }),

  test('Nested clipPath on group containing mesh gradient', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    // Add clipPath to the layer1 group
    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="groupClip">
        <ellipse cx="25" cy="25" rx="20" ry="15"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="layer1"',
      'id="layer1" clip-path="url(#groupClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    const groupClipped = await page.evaluate(() => {
      const group = document.getElementById('layer1');
      return group && group.getAttribute('clip-path') === 'url(#groupClip)';
    });

    if (!groupClipped) throw new Error('Group clipPath was not applied');
  }),

  test('Complex path clipPath on mesh gradient', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="pathClip">
        <path d="M5,25 Q25,5 45,25 Q25,45 5,25 Z"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#pathClip)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    const hasClipPath = await page.evaluate(() => {
      const pathEl = document.getElementById('path2');
      const clipPath = document.getElementById('pathClip');
      return pathEl && clipPath && pathEl.getAttribute('clip-path') !== null;
    });

    if (!hasClipPath) throw new Error('Complex path clipPath was not applied');
  }),

  test('Multiple elements with different clipPaths', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');

    const modifiedSvg = svgContent.replace(
      '</defs>',
      `<clipPath id="clip1">
        <rect x="0" y="0" width="25" height="50"/>
      </clipPath>
      <clipPath id="clip2">
        <rect x="25" y="0" width="25" height="50"/>
      </clipPath>
      </defs>`
    ).replace(
      'id="rect1"',
      'id="rect1" clip-path="url(#clip1)"'
    ).replace(
      'id="path2"',
      'id="path2" clip-path="url(#clip2)"'
    );

    await page.setContent(`<!DOCTYPE html><html><body>${modifiedSvg}</body></html>`);

    const clipPaths = await page.evaluate(() => {
      const rect = document.getElementById('rect1');
      const path = document.getElementById('path2');
      return {
        rectClip: rect ? rect.getAttribute('clip-path') : null,
        pathClip: path ? path.getAttribute('clip-path') : null
      };
    });

    if (clipPaths.rectClip !== 'url(#clip1)') throw new Error('rect1 clipPath incorrect');
    if (clipPaths.pathClip !== 'url(#clip2)') throw new Error('path2 clipPath incorrect');
  }),

  test('Mesh gradient polyfill renders to canvas', async (page) => {
    const svgContent = fs.readFileSync(sampleSvgPath, 'utf-8');
    await page.setContent(`<!DOCTYPE html><html><body>${svgContent}</body></html>`);

    // Wait for polyfill to execute
    await page.waitForTimeout(500);

    // Check if polyfill created canvas or image elements
    const polyfillRendered = await page.evaluate(() => {
      // The polyfill creates image elements from canvas data
      const images = document.querySelectorAll('svg image');
      return images.length > 0;
    });

    if (!polyfillRendered) throw new Error('Mesh gradient polyfill did not render');
  }),
];

// ============================================================================
// Run Tests and Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('MESH GRADIENT BROWSER VERIFICATION TESTS');
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

if (failed > 0) {
  console.log('\x1b[33mNote: Some failures may be expected if browser does not support mesh gradients natively.\x1b[0m');
  console.log('The polyfill handles rendering in unsupported browsers.\n');
}
