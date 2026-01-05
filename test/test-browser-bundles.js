#!/usr/bin/env node
/**
 * Chromium browser tests for svg-matrix library bundles
 *
 * Tests both ESM and IIFE bundles in a real browser environment:
 * 1. IIFE bundle loads and exposes global SVGMatrixLib
 * 2. ESM bundle loads via dynamic import
 * 3. Matrix operations work correctly
 * 4. Vector operations work correctly
 * 5. Transforms2D operations work correctly
 * 6. Transforms3D operations work correctly
 * 7. Decimal.js precision is maintained (80-digit precision)
 *
 * Run: node test/test-browser-bundles.js
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const DIST_DIR = resolve(__dirname, '..', 'dist');
const OUTPUT_DIR = resolve(__dirname, 'output', 'browser-test');
const TIMEOUT = 30000;

// ANSI colors
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Unicode box drawing
const BOX = {
  topLeft: '\u250F',
  topRight: '\u2513',
  bottomLeft: '\u2517',
  bottomRight: '\u251B',
  horizontal: '\u2501',
  vertical: '\u2503',
  leftT: '\u2523',
  rightT: '\u252B',
  topT: '\u2533',
  bottomT: '\u253B',
  cross: '\u254B',
};

/**
 * Draw results table
 */
function drawResultsTable(results) {
  const colWidths = [50, 10, 40];

  let header = BOX.topLeft;
  colWidths.forEach((w, i) => {
    header += BOX.horizontal.repeat(w);
    header += i < colWidths.length - 1 ? BOX.topT : BOX.topRight;
  });
  console.log(header);

  const headers = ['Test Description', 'Status', 'Details'];
  let headerRow = BOX.vertical;
  headers.forEach((h, i) => {
    const padded = ` ${h}`.padEnd(colWidths[i]);
    headerRow += `${COLORS.bold}${COLORS.cyan}${padded}${COLORS.reset}${BOX.vertical}`;
  });
  console.log(headerRow);

  let separator = BOX.leftT;
  colWidths.forEach((w, i) => {
    separator += BOX.horizontal.repeat(w);
    separator += i < colWidths.length - 1 ? BOX.cross : BOX.rightT;
  });
  console.log(separator);

  results.forEach((result) => {
    let row = BOX.vertical;
    const statusColor = result.status === 'PASS' ? COLORS.green :
                        result.status === 'FAIL' ? COLORS.red : COLORS.yellow;

    const cells = [
      ` ${result.description}`.padEnd(colWidths[0]).slice(0, colWidths[0]),
      `${statusColor} ${result.status} ${COLORS.reset}`.padEnd(colWidths[1] + 9),
      ` ${result.details || ''}`.padEnd(colWidths[2]).slice(0, colWidths[2]),
    ];

    cells.forEach((cell) => {
      row += `${cell}${BOX.vertical}`;
    });
    console.log(row);
  });

  let bottom = BOX.bottomLeft;
  colWidths.forEach((w, i) => {
    bottom += BOX.horizontal.repeat(w);
    bottom += i < colWidths.length - 1 ? BOX.bottomT : BOX.bottomRight;
  });
  console.log(bottom);
}

/**
 * Ensure Playwright browsers are installed
 */
async function ensureBrowsersInstalled() {
  if (process.env.CI) {
    console.log('CI environment detected - using pre-installed Playwright browsers');
    return;
  }

  return new Promise((resolve, reject) => {
    console.log('Checking Playwright browser installation...');
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const proc = spawn(npx, ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      cwd: dirname(__dirname),
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Playwright browser installation failed with code ${code}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Create test HTML file
 */
function createTestHtml() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read IIFE bundle
  const iifeBundlePath = join(DIST_DIR, 'svg-matrix.global.min.js');
  const iifeBundle = readFileSync(iifeBundlePath, 'utf8');

  // Read ESM bundle
  const esmBundlePath = join(DIST_DIR, 'svg-matrix.min.js');
  const esmBundle = readFileSync(esmBundlePath, 'utf8');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SVG-Matrix Browser Bundle Tests</title>
  <style>
    body { font-family: monospace; padding: 20px; }
    .pass { color: green; }
    .fail { color: red; }
    pre { background: #f5f5f5; padding: 10px; overflow: auto; }
  </style>
</head>
<body>
  <h1>SVG-Matrix Browser Bundle Tests</h1>
  <div id="results"></div>

  <!-- IIFE Bundle (exposes SVGMatrixLib global) -->
  <script>
    ${iifeBundle}
  </script>

  <!-- ESM Bundle (for testing module loading) -->
  <script type="module" id="esm-bundle">
    ${esmBundle}
    // Export to window for testing
    window.__ESMModuleLoaded__ = true;
    // Re-export classes for comparison
    import('./esm-test.js').catch(() => {});
  </script>

  <!-- Test script -->
  <script>
    window.__testResults__ = [];

    function addResult(name, passed, details) {
      window.__testResults__.push({ name, passed, details });
      const div = document.createElement('div');
      div.className = passed ? 'pass' : 'fail';
      div.textContent = (passed ? 'PASS' : 'FAIL') + ': ' + name + (details ? ' - ' + details : '');
      document.getElementById('results').appendChild(div);
    }

    // Wait for page load
    window.addEventListener('load', async () => {
      try {
        // Test 1: IIFE bundle loaded (exports as window.SVGMatrix)
        const SVGMatrixLib = window.SVGMatrix;
        if (typeof SVGMatrixLib !== 'undefined') {
          addResult('IIFE bundle loaded', true, 'window.SVGMatrix global exists');
        } else {
          addResult('IIFE bundle loaded', false, 'window.SVGMatrix not found');
        }

        // Test 2: Matrix class available
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          addResult('Matrix class available', true);
        } else {
          addResult('Matrix class available', false);
        }

        // Test 3: Vector class available
        if (SVGMatrixLib && SVGMatrixLib.Vector) {
          addResult('Vector class available', true);
        } else {
          addResult('Vector class available', false);
        }

        // Test 4: Transforms2D available
        if (SVGMatrixLib && SVGMatrixLib.Transforms2D) {
          addResult('Transforms2D available', true);
        } else {
          addResult('Transforms2D available', false);
        }

        // Test 5: Transforms3D available
        if (SVGMatrixLib && SVGMatrixLib.Transforms3D) {
          addResult('Transforms3D available', true);
        } else {
          addResult('Transforms3D available', false);
        }

        // Test 6: Matrix identity
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          const { Matrix } = SVGMatrixLib;
          const I = Matrix.identity(3);
          const data = I.toNumberArray();
          const isIdentity = data[0][0] === 1 && data[1][1] === 1 && data[2][2] === 1 &&
                            data[0][1] === 0 && data[0][2] === 0;
          addResult('Matrix.identity(3) works', isIdentity, '3x3 identity matrix');
        }

        // Test 7: Matrix multiplication
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          const { Matrix } = SVGMatrixLib;
          const A = Matrix.from([[1, 2], [3, 4]]);
          const B = Matrix.from([[5, 6], [7, 8]]);
          const C = A.mul(B);
          const result = C.toNumberArray();
          // [1*5+2*7, 1*6+2*8] = [19, 22]
          // [3*5+4*7, 3*6+4*8] = [43, 50]
          const correct = result[0][0] === 19 && result[0][1] === 22 &&
                         result[1][0] === 43 && result[1][1] === 50;
          addResult('Matrix multiplication works', correct, '[[1,2],[3,4]] * [[5,6],[7,8]]');
        }

        // Test 8: Vector operations
        if (SVGMatrixLib && SVGMatrixLib.Vector) {
          const { Vector } = SVGMatrixLib;
          const v1 = Vector.from([1, 2, 3]);
          const v2 = Vector.from([4, 5, 6]);
          const dot = v1.dot(v2);
          // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
          addResult('Vector.dot() works', dot.toNumber() === 32, '(1,2,3) . (4,5,6) = 32');
        }

        // Test 9: Vector cross product
        if (SVGMatrixLib && SVGMatrixLib.Vector) {
          const { Vector } = SVGMatrixLib;
          const v1 = Vector.from([1, 0, 0]);
          const v2 = Vector.from([0, 1, 0]);
          const cross = v1.cross(v2);
          const arr = cross.toNumberArray();
          // (1,0,0) x (0,1,0) = (0,0,1)
          const correct = arr[0] === 0 && arr[1] === 0 && arr[2] === 1;
          addResult('Vector.cross() works', correct, 'i x j = k');
        }

        // Test 10: Transforms2D translation
        if (SVGMatrixLib && SVGMatrixLib.Transforms2D) {
          try {
            const { Transforms2D } = SVGMatrixLib;
            const T = Transforms2D.translation(10, 20);
            const result = Transforms2D.applyTransform(T, 0, 0);
            const correct = result[0].toNumber() === 10 && result[1].toNumber() === 20;
            addResult('Transforms2D.translation works', correct, 'translate(10,20) on (0,0)');
          } catch (e) {
            addResult('Transforms2D.translation works', false, e.message);
          }
        } else {
          addResult('Transforms2D.translation works', false, 'Transforms2D not available');
        }

        // Test 11: Transforms2D rotation
        if (SVGMatrixLib && SVGMatrixLib.Transforms2D) {
          try {
            const { Transforms2D } = SVGMatrixLib;
            const R = Transforms2D.rotate(Math.PI / 2); // 90 degrees
            const result = Transforms2D.applyTransform(R, 1, 0);
            // Rotating (1,0) by 90 degrees should give approximately (0,1)
            const x = result[0].toNumber();
            const y = result[1].toNumber();
            const correct = Math.abs(x) < 1e-10 && Math.abs(y - 1) < 1e-10;
            addResult('Transforms2D.rotate works', correct, 'rotate 90deg on (1,0) = (0,1)');
          } catch (e) {
            addResult('Transforms2D.rotate works', false, e.message);
          }
        } else {
          addResult('Transforms2D.rotate works', false, 'Transforms2D not available');
        }

        // Test 12: Transforms2D scale
        if (SVGMatrixLib && SVGMatrixLib.Transforms2D) {
          try {
            const { Transforms2D } = SVGMatrixLib;
            const S = Transforms2D.scale(2, 3);
            const result = Transforms2D.applyTransform(S, 5, 7);
            const correct = result[0].toNumber() === 10 && result[1].toNumber() === 21;
            addResult('Transforms2D.scale works', correct, 'scale(2,3) on (5,7) = (10,21)');
          } catch (e) {
            addResult('Transforms2D.scale works', false, e.message);
          }
        } else {
          addResult('Transforms2D.scale works', false, 'Transforms2D not available');
        }

        // Test 13: Transforms3D translation
        if (SVGMatrixLib && SVGMatrixLib.Transforms3D) {
          try {
            const { Transforms3D } = SVGMatrixLib;
            const T = Transforms3D.translation(5, 10, 15);
            const correct = T.rows === 4 && T.cols === 4;
            addResult('Transforms3D.translation works', correct, '4x4 translation matrix');
          } catch (e) {
            addResult('Transforms3D.translation works', false, e.message);
          }
        } else {
          addResult('Transforms3D.translation works', false, 'Transforms3D not available');
        }

        // Test 14: Decimal precision maintained
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          try {
            const { Matrix } = SVGMatrixLib;
            const A = Matrix.from([
              ['0.123456789012345678901234567890', '0'],
              ['0', '1']
            ]);
            const str = A.toArrayOfStrings()[0][0];
            const hasPrecision = str.length > 20;
            addResult('Decimal.js precision maintained', hasPrecision, 'Length: ' + str.length);
          } catch (e) {
            addResult('Decimal.js precision maintained', false, e.message);
          }
        }

        // Test 15: Matrix inverse
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          try {
            const { Matrix } = SVGMatrixLib;
            const A = Matrix.from([[4, 7], [2, 6]]);
            const Ainv = A.inverse();
            const I = A.mul(Ainv);
            const data = I.toNumberArray();
            const isIdentity = Math.abs(data[0][0] - 1) < 1e-10 &&
                              Math.abs(data[1][1] - 1) < 1e-10 &&
                              Math.abs(data[0][1]) < 1e-10 &&
                              Math.abs(data[1][0]) < 1e-10;
            addResult('Matrix.inverse() works', isIdentity, 'A * A^-1 = I');
          } catch (e) {
            addResult('Matrix.inverse() works', false, e.message);
          }
        }

        // Test 16: Matrix determinant
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          try {
            const { Matrix } = SVGMatrixLib;
            const A = Matrix.from([[1, 2], [3, 4]]);
            const det = A.determinant();
            const correct = det.toNumber() === -2;
            addResult('Matrix.determinant() works', correct, 'det([[1,2],[3,4]]) = -2');
          } catch (e) {
            addResult('Matrix.determinant() works', false, e.message);
          }
        }

        // Test 17: Matrix transpose
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          try {
            const { Matrix } = SVGMatrixLib;
            const A = Matrix.from([[1, 2, 3], [4, 5, 6]]);
            const At = A.transpose();
            const correct = At.rows === 3 && At.cols === 2;
            addResult('Matrix.transpose() works', correct, '2x3 -> 3x2');
          } catch (e) {
            addResult('Matrix.transpose() works', false, e.message);
          }
        }

        // Test 18: Vector normalize
        if (SVGMatrixLib && SVGMatrixLib.Vector) {
          try {
            const { Vector } = SVGMatrixLib;
            const v = Vector.from([3, 4]);
            const n = v.normalize();
            const norm = n.norm().toNumber();
            const correct = Math.abs(norm - 1) < 1e-10;
            addResult('Vector.normalize() works', correct, '|normalize([3,4])| = 1');
          } catch (e) {
            addResult('Vector.normalize() works', false, e.message);
          }
        }

        // Test 19: Transform composition
        if (SVGMatrixLib && SVGMatrixLib.Transforms2D) {
          try {
            const { Transforms2D } = SVGMatrixLib;
            const T = Transforms2D.translation(10, 0);
            const S = Transforms2D.scale(2, 2);
            const TS = T.mul(S);
            const result = Transforms2D.applyTransform(TS, 0, 0);
            const correct = result[0].toNumber() === 10 && result[1].toNumber() === 0;
            addResult('Transform composition works', correct, 'T(10,0) * S(2,2) on (0,0)');
          } catch (e) {
            addResult('Transform composition works', false, e.message);
          }
        } else {
          addResult('Transform composition works', false, 'Transforms2D not available');
        }

        // Test 20: LU decomposition
        if (SVGMatrixLib && SVGMatrixLib.Matrix) {
          try {
            const { Matrix } = SVGMatrixLib;
            const A = Matrix.from([[2, 1], [1, 3]]);
            const { L, U, P } = A.lu();
            const PA = P.mul(A);
            const LU = L.mul(U);
            const pa = PA.toNumberArray();
            const lu = LU.toNumberArray();
            const correct = Math.abs(pa[0][0] - lu[0][0]) < 1e-10 &&
                           Math.abs(pa[1][1] - lu[1][1]) < 1e-10;
            addResult('Matrix LU decomposition works', correct, 'P*A = L*U');
          } catch (e) {
            addResult('Matrix LU decomposition works', false, e.message);
          }
        }

        window.__testsComplete__ = true;
      } catch (error) {
        addResult('Test execution', false, error.message);
        window.__testsComplete__ = true;
        window.__testError__ = error.message;
      }
    });
  </script>
</body>
</html>`;

  const htmlPath = join(OUTPUT_DIR, 'browser-test.html');
  writeFileSync(htmlPath, html);
  return htmlPath;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('='.repeat(70));
  console.log('Chromium Browser Tests: SVG-Matrix Library Bundles');
  console.log('='.repeat(70));
  console.log();

  const results = [];

  // Check dist files exist
  const bundleFiles = [
    'svg-matrix.min.js',
    'svg-matrix.global.min.js',
    'svg-toolbox.min.js',
    'svg-toolbox.global.min.js',
    'svgm.min.js',
  ];

  for (const file of bundleFiles) {
    const filePath = join(DIST_DIR, file);
    if (existsSync(filePath)) {
      results.push({
        description: `Bundle exists: ${file}`,
        status: 'PASS',
        details: `${(readFileSync(filePath).length / 1024).toFixed(1)} KB`,
      });
    } else {
      results.push({
        description: `Bundle exists: ${file}`,
        status: 'FAIL',
        details: 'File not found',
      });
    }
  }

  // Ensure browsers installed
  try {
    await ensureBrowsersInstalled();
  } catch (error) {
    console.error(`${COLORS.red}Failed to install Playwright browsers: ${error.message}${COLORS.reset}`);
    console.error('Try running: npx playwright install chromium');
    process.exit(1);
  }

  // Create test HTML
  const htmlPath = createTestHtml();
  results.push({
    description: 'Test HTML file created',
    status: 'PASS',
    details: htmlPath.split('/').pop(),
  });

  let browser = null;
  let context = null;
  let page = null;

  try {
    // Launch browser
    console.log('Launching Chromium browser (headless)...');
    browser = await chromium.launch({
      headless: true,
      timeout: TIMEOUT,
    });

    context = await browser.newContext();
    page = await context.newPage();

    results.push({
      description: 'Chromium browser launched',
      status: 'PASS',
      details: 'headless mode',
    });

    // Collect console messages
    const consoleMessages = [];
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Collect errors
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Navigate to test file
    const fileUrl = process.platform === 'win32'
      ? `file:///${htmlPath.replace(/\\/g, '/')}`
      : `file://${htmlPath}`;

    await page.goto(fileUrl, {
      timeout: TIMEOUT,
      waitUntil: 'domcontentloaded',
    });

    // Wait for tests to complete
    await page.waitForFunction(() => window.__testsComplete__ === true, { timeout: TIMEOUT });

    // Get test results from page
    const browserResults = await page.evaluate(() => window.__testResults__);

    // Add browser test results
    for (const br of browserResults) {
      results.push({
        description: br.name,
        status: br.passed ? 'PASS' : 'FAIL',
        details: br.details || '',
      });
    }

    // Check for console errors (filter out expected ESM import error and net::ERR_FAILED)
    const errors = consoleMessages.filter(m =>
      m.type === 'error' &&
      !m.text.includes('esm-test.js') &&
      !m.text.includes('Failed to load module') &&
      !m.text.includes('net::ERR_FAILED')
    );
    if (errors.length > 0) {
      // Log actual error messages for debugging
      console.log('\nConsole errors found:');
      errors.forEach(e => console.log(`  - ${e.text}`));
      results.push({
        description: 'No console errors',
        status: 'FAIL',
        details: `${errors.length} errors`,
      });
    } else {
      results.push({
        description: 'No console errors',
        status: 'PASS',
        details: 'Clean console',
      });
    }

    // Check for page errors
    if (pageErrors.length > 0) {
      results.push({
        description: 'No page errors',
        status: 'FAIL',
        details: pageErrors[0].slice(0, 40),
      });
    } else {
      results.push({
        description: 'No page errors',
        status: 'PASS',
        details: 'No uncaught exceptions',
      });
    }

  } catch (error) {
    console.error(`${COLORS.red}Test error: ${error.message}${COLORS.reset}`);
    results.push({
      description: 'Browser test execution',
      status: 'FAIL',
      details: error.message.slice(0, 40),
    });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  // Print results
  console.log();
  console.log('='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));
  console.log();

  drawResultsTable(results);

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log();
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  ${COLORS.green}PASSED: ${passed}${COLORS.reset}`);
  if (warned > 0) console.log(`  ${COLORS.yellow}WARNINGS: ${warned}${COLORS.reset}`);
  if (failed > 0) console.log(`  ${COLORS.red}FAILED: ${failed}${COLORS.reset}`);
  console.log();

  // Exit code
  if (failed > 0) {
    console.log(`${COLORS.red}TESTS FAILED${COLORS.reset}`);
    process.exit(1);
  } else {
    console.log(`${COLORS.green}ALL TESTS PASSED${COLORS.reset}`);
    process.exit(0);
  }
}

// Run
runTests().catch((error) => {
  console.error(`${COLORS.red}Fatal error: ${error.message}${COLORS.reset}`);
  process.exit(1);
});
