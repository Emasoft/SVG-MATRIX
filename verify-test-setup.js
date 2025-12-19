#!/usr/bin/env node

/**
 * Quick verification that the test setup works correctly
 * Tests simplifyPaths on a few sample SVG files before running full suite
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { simplifyPaths } from './src/svg-toolbox.js';

const SVG_TEST_DIR = '/tmp/svg11_w3c_test_suite/svg/';

console.log('Verification Test for simplifyPaths');
console.log('====================================\n');

// Get first 3 SVG files as samples
const svgFiles = readdirSync(SVG_TEST_DIR)
  .filter(f => f.endsWith('.svg'))
  .slice(0, 3)
  .map(f => join(SVG_TEST_DIR, f));

console.log(`Testing ${svgFiles.length} sample files:\n`);

let passed = 0;
let failed = 0;

async function runTests() {
  for (const svgFile of svgFiles) {
    const fileName = svgFile.split('/').pop();
    console.log(`Testing: ${fileName}`);

    try {
      // Read SVG
      const svgContent = readFileSync(svgFile, 'utf-8');
      console.log(`  ✓ Read file (${svgContent.length} bytes)`);

      // Count original paths
      const originalDom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
      const originalPaths = originalDom.window.document.querySelectorAll('path');
      console.log(`  ✓ Found ${originalPaths.length} path elements`);

      // Apply simplifyPaths - it's async and accepts string input
      const result = await simplifyPaths(svgContent, {
        tolerance: 1.0,
        algorithm: 'douglas-peucker',
        precision: 3,
        respectStroke: true,
      });
      console.log(`  ✓ simplifyPaths executed`);
      console.log(`  ✓ Output length: ${result.length} bytes`);

      // Validate output is well-formed XML
      const outputDom = new JSDOM(result, { contentType: 'image/svg+xml' });
      const outputDoc = outputDom.window.document;
      const parserError = outputDoc.querySelector('parsererror');

      if (parserError) {
        console.log(`  ✗ FAIL: Parser error in output`);
        console.log(`    ${parserError.textContent.substring(0, 100)}`);
        failed++;
      } else {
        console.log(`  ✓ Output is valid XML`);
        const resultPaths = outputDoc.querySelectorAll('path');
        console.log(`  ✓ Result has ${resultPaths.length} path elements`);
        console.log(`  ✓ PASS\n`);
        passed++;
      }

    } catch (error) {
      console.log(`  ✗ ERROR: ${error.message}`);
      console.log(`    ${error.stack}\n`);
      failed++;
    }
  }

  console.log('====================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('====================================\n');

  if (failed === 0) {
    console.log('✅ Verification successful! Ready to run full test suite.\n');
    process.exit(0);
  } else {
    console.log('❌ Verification failed. Check errors above.\n');
    process.exit(1);
  }
}

runTests();
