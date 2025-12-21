/**
 * Test processing of W3C paths-data-20-f.svg
 * This file contains intentionally malformed arc commands to test error handling
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { optimizePaths } from '../src/svg-toolbox.js';

// Compute paths relative to this file's location for portability
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const testFile = path.join(PROJECT_ROOT, 'SVG 1.1 W3C Test Suit', 'svg', 'paths-data-20-f.svg');

console.log('Testing W3C paths-data-20-f.svg...\n');

// Check if W3C test suite exists
if (!fs.existsSync(testFile)) {
  console.log('W3C SVG Test Suite not found - skipping test.');
  console.log(`Expected file: ${testFile}`);
  console.log('This is optional and requires downloading the W3C SVG 1.1 Test Suite.');
  process.exit(0);
}

try {
  // Read the test file
  const content = fs.readFileSync(testFile, 'utf8');
  console.log(`✅ Read file: ${testFile}`);
  console.log(`   File size: ${content.length} bytes\n`);

  // Parse the SVG
  const doc = parseSVG(content);
  console.log('✅ Parsed SVG successfully\n');

  // Count paths before
  const pathsBefore = doc.getElementsByTagName('path').length;
  console.log(`   Paths found: ${pathsBefore}\n`);

  // Apply optimizePaths
  console.log('Running optimizePaths...');
  optimizePaths(doc, {
    floatPrecision: 3,
    straightCurves: true,
    lineShorthands: true,
    convertToZ: true,
    utilizeAbsolute: true,
    straightTolerance: 0.5
  });
  console.log('✅ optimizePaths completed successfully\n');

  // Count paths after
  const pathsAfter = doc.getElementsByTagName('path').length;
  console.log(`   Paths after: ${pathsAfter}`);

  if (pathsBefore === pathsAfter) {
    console.log('   ✅ Path count preserved\n');
  } else {
    console.log(`   ⚠️  Path count changed: ${pathsBefore} -> ${pathsAfter}\n`);
  }

  // Serialize the result
  const optimized = serializeSVG(doc);
  console.log('✅ Serialized optimized SVG\n');
  console.log(`   Original size: ${content.length} bytes`);
  console.log(`   Optimized size: ${optimized.length} bytes`);
  console.log(`   Savings: ${content.length - optimized.length} bytes (${((content.length - optimized.length) / content.length * 100).toFixed(2)}%)\n`);

  // Save the optimized version
  const outputFile = '/tmp/paths-data-20-f-optimized.svg';
  fs.writeFileSync(outputFile, optimized, 'utf8');
  console.log(`✅ Saved optimized file: ${outputFile}\n`);

  console.log('═══════════════════════════════════════════════');
  console.log('✅ TEST PASSED: paths-data-20-f.svg processed successfully');
  console.log('   Malformed arc flags were handled gracefully!');
  console.log('═══════════════════════════════════════════════');

  process.exit(0);

} catch (err) {
  console.error('❌ TEST FAILED');
  console.error(`   Error: ${err.message}`);
  console.error(`   Stack: ${err.stack}`);
  process.exit(1);
}
