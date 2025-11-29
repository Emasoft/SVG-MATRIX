/**
 * Browser CTM Verification Test using Playwright
 *
 * Verifies SVGFlatten.computeViewBoxTransform() against the browser's native getCTM()
 * This is the authoritative test since browsers implement the W3C SVG2 spec.
 */

import { chromium } from 'playwright';
import { Decimal, SVGFlatten } from '../src/index.js';

Decimal.set({ precision: 80 });

const testCases = [
  // Cases from W3C SVG WG issue #215
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'none', name: 'Issue #215: none' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMinYMin meet', name: 'Issue #215: xMinYMin meet' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMidYMid meet', name: 'Issue #215: xMidYMid meet' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMaxYMax meet', name: 'Issue #215: xMaxYMax meet' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMinYMin slice', name: 'Issue #215: xMinYMin slice' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMidYMid slice', name: 'Issue #215: xMidYMid slice' },
  { width: 21, height: 10, viewBox: '11 13 3 2', par: 'xMaxYMax slice', name: 'Issue #215: xMaxYMax slice' },

  // Standard viewBox cases
  { width: 200, height: 200, viewBox: '0 0 100 100', par: 'xMidYMid meet', name: 'Square 2x scale' },
  { width: 100, height: 100, viewBox: '0 0 100 100', par: 'xMidYMid meet', name: '1:1 identity' },
  { width: 400, height: 200, viewBox: '0 0 100 100', par: 'xMidYMid meet', name: 'Wide viewport' },
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMidYMid meet', name: 'Tall viewport' },
  { width: 400, height: 200, viewBox: '0 0 100 100', par: 'xMinYMin meet', name: 'Wide, top-left' },
  { width: 400, height: 200, viewBox: '0 0 100 100', par: 'xMaxYMax meet', name: 'Wide, bottom-right' },
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMinYMin meet', name: 'Tall, top-left' },
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMaxYMax meet', name: 'Tall, bottom-right' },

  // Non-zero viewBox origin
  { width: 300, height: 200, viewBox: '50 50 100 100', par: 'xMidYMid meet', name: 'Offset origin' },
  { width: 300, height: 200, viewBox: '-50 -50 200 200', par: 'xMidYMid meet', name: 'Negative origin' },
  { width: 400, height: 300, viewBox: '100 200 50 25', par: 'xMidYMid meet', name: 'Large offset' },

  // Stretch (none)
  { width: 200, height: 100, viewBox: '0 0 100 100', par: 'none', name: 'Stretch non-uniform' },
  { width: 300, height: 200, viewBox: '10 20 30 40', par: 'none', name: 'Stretch with offset' },

  // Slice modes
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMidYMid slice', name: 'Tall slice centered' },
  { width: 400, height: 200, viewBox: '0 0 100 100', par: 'xMidYMid slice', name: 'Wide slice centered' },
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMinYMin slice', name: 'Tall slice top-left' },
  { width: 200, height: 400, viewBox: '0 0 100 100', par: 'xMaxYMax slice', name: 'Tall slice bottom-right' },

  // Edge cases
  { width: 1000, height: 1, viewBox: '0 0 10 10', par: 'xMidYMid meet', name: 'Extreme aspect 1000:1' },
  { width: 1, height: 1000, viewBox: '0 0 10 10', par: 'xMidYMid meet', name: 'Extreme aspect 1:1000' },
  { width: 800, height: 600, viewBox: '0 0 400 300', par: 'xMinYMin meet', name: 'Common 800x600' },
  { width: 1920, height: 1080, viewBox: '0 0 1920 1080', par: 'xMidYMid meet', name: 'Full HD 1:1' },
];

async function runTests() {
  console.log('\n=== Browser CTM Verification (Playwright) ===\n');
  console.log('Comparing SVGFlatten.computeViewBoxTransform() vs browser getCTM()\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const tc of testCases) {
    // Get browser's native CTM
    const browserCTM = await page.evaluate(({ width, height, viewBox, par }) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', viewBox);
      svg.setAttribute('preserveAspectRatio', par);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '10');
      rect.setAttribute('height', '10');
      svg.appendChild(rect);

      document.body.appendChild(svg);
      const ctm = rect.getCTM();
      document.body.removeChild(svg);

      return { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f };
    }, tc);

    // Compute with our library
    const vb = SVGFlatten.parseViewBox(tc.viewBox);
    const par = SVGFlatten.parsePreserveAspectRatio(tc.par);
    const ourMatrix = SVGFlatten.computeViewBoxTransform(vb, tc.width, tc.height, par);

    const ourCTM = {
      a: ourMatrix.data[0][0].toNumber(),
      b: ourMatrix.data[1][0].toNumber(),
      c: ourMatrix.data[0][1].toNumber(),
      d: ourMatrix.data[1][1].toNumber(),
      e: ourMatrix.data[0][2].toNumber(),
      f: ourMatrix.data[1][2].toNumber(),
    };

    // Compare with tolerance
    const tolerance = 1e-10;
    const matches = {
      a: Math.abs(browserCTM.a - ourCTM.a) < tolerance,
      b: Math.abs(browserCTM.b - ourCTM.b) < tolerance,
      c: Math.abs(browserCTM.c - ourCTM.c) < tolerance,
      d: Math.abs(browserCTM.d - ourCTM.d) < tolerance,
      e: Math.abs(browserCTM.e - ourCTM.e) < tolerance,
      f: Math.abs(browserCTM.f - ourCTM.f) < tolerance,
    };

    const allMatch = Object.values(matches).every(v => v);

    if (allMatch) {
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${tc.name}`);
    } else {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${tc.name}`);
      failures.push({
        name: tc.name,
        config: `width=${tc.width} height=${tc.height} viewBox="${tc.viewBox}" par="${tc.par}"`,
        browser: browserCTM,
        library: ourCTM,
        matches
      });
    }
  }

  await browser.close();

  // Print summary
  console.log('\n' + '─'.repeat(60));
  if (failed === 0) {
    console.log(`\x1b[32m\nAll ${passed} tests PASSED!\x1b[0m`);
    console.log('\nOur formula matches browser\'s native getCTM() implementation.');
    console.log('This confirms compliance with W3C SVG2 specification.\n');
  } else {
    console.log(`\x1b[31m\n${failed} tests FAILED\x1b[0m, ${passed} passed\n`);

    for (const f of failures) {
      console.log(`\n--- ${f.name} ---`);
      console.log(`Config: ${f.config}`);
      console.log('Browser CTM:', f.browser);
      console.log('Library CTM:', f.library);
      console.log('Mismatches:', Object.entries(f.matches).filter(([k, v]) => !v).map(([k]) => k).join(', '));
    }
  }

  // Print matrix format legend
  console.log('\nMatrix format: matrix(a, b, c, d, e, f) where:');
  console.log('  | a c e |   transforms point (x,y) to:');
  console.log('  | b d f |   x\' = a*x + c*y + e');
  console.log('  | 0 0 1 |   y\' = b*x + d*y + f\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
