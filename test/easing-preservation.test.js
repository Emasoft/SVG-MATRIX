/**
 * Easing Curve Preservation Test
 *
 * Verifies that svg-matrix preserves ALL easing-related attributes:
 * - calcMode: "discrete", "linear", "paced", "spline"
 * - keyTimes: time values (e.g., "0;.25;.5;1")
 * - keySplines: cubic bezier control points (e.g., "0,0,1,1;0,0,1,1")
 * - keyPoints: motion path points
 *
 * SVGO can potentially corrupt these during ID cleanup operations.
 * svg-matrix must preserve them exactly.
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { cleanupIds } from '../src/svg-toolbox.js';

const TEST_SUITE_PATH = 'SVG 1.1 W3C Test Suit/svg';

// Easing-related attributes to verify
const EASING_ATTRS = ['calcMode', 'keyTimes', 'keySplines', 'keyPoints'];

// Get all easing attribute values from a document
function getEasingAttributes(doc) {
  const result = new Map();

  const scanElement = (el) => {
    for (const attr of EASING_ATTRS) {
      const value = el.getAttribute(attr);
      if (value !== null) {
        const key = `${el.tagName}[${attr}]`;
        if (!result.has(key)) result.set(key, []);
        result.get(key).push(value);
      }
    }
    for (const child of el.children) {
      scanElement(child);
    }
  };

  scanElement(doc);
  return result;
}

// Test files known to use easing attributes
const EASING_TEST_FILES = [
  'animate-elem-15-t.svg',  // calcMode="paced"
  'animate-elem-17-t.svg',  // calcMode="spline" + keySplines
  'animate-elem-19-t.svg',  // calcMode="linear" + keyTimes
  'animate-elem-33-t.svg',  // keyPoints + keyTimes
  'animate-elem-92-t.svg',  // calcMode="discrete" + keyTimes
  'animate-elem-34-t.svg',  // multiple easing patterns
  'animate-elem-35-t.svg',  // keySplines variations
];

async function testEasingPreservation() {
  console.log('\n=== Easing Curve Preservation Test ===\n');

  // Check if W3C test suite is available
  if (!fs.existsSync(TEST_SUITE_PATH)) {
    console.log('⚠ SKIPPED: W3C SVG 1.1 Test Suite not found at:', TEST_SUITE_PATH);
    console.log('  Download from: https://www.w3.org/Graphics/SVG/Test/20110816/');
    console.log('  Extract to project root as "SVG 1.1 W3C Test Suit/svg/"');
    return { skipped: true, reason: 'W3C test suite not available' };
  }

  let totalFiles = 0;
  let passed = 0;
  let failed = 0;
  const results = [];

  // Get all animation files
  const files = fs.readdirSync(TEST_SUITE_PATH)
    .filter(f => f.includes('anim') && f.endsWith('.svg'));

  for (const filename of files) {
    const filepath = path.join(TEST_SUITE_PATH, filename);
    const svgContent = fs.readFileSync(filepath, 'utf8');

    // Check if this file has easing attributes
    const hasEasing = EASING_ATTRS.some(attr => svgContent.includes(attr + '='));
    if (!hasEasing) continue;

    totalFiles++;

    try {
      // Parse original
      const docBefore = parseSVG(svgContent);
      const easingBefore = getEasingAttributes(docBefore);

      if (easingBefore.size === 0) continue;

      // Apply cleanupIds
      const docAfter = await cleanupIds(docBefore, { minify: false, remove: true });
      const easingAfter = getEasingAttributes(docAfter);

      // Compare
      let fileOk = true;
      const issues = [];

      for (const [key, valuesBefore] of easingBefore) {
        const valuesAfter = easingAfter.get(key) || [];

        if (valuesBefore.length !== valuesAfter.length) {
          fileOk = false;
          issues.push(`${key}: count changed ${valuesBefore.length} -> ${valuesAfter.length}`);
        } else {
          for (let i = 0; i < valuesBefore.length; i++) {
            if (valuesBefore[i] !== valuesAfter[i]) {
              fileOk = false;
              issues.push(`${key}[${i}]: "${valuesBefore[i]}" -> "${valuesAfter[i]}"`);
            }
          }
        }
      }

      if (fileOk) {
        passed++;
        console.log(`  ✓ ${filename}`);
        results.push({ filename, status: 'pass', attrs: easingBefore.size });
      } else {
        failed++;
        console.log(`  ✗ ${filename}`);
        issues.forEach(i => console.log(`      ${i}`));
        results.push({ filename, status: 'fail', issues });
      }

    } catch (err) {
      failed++;
      console.log(`  ✗ ${filename} - Error: ${err.message}`);
      results.push({ filename, status: 'error', error: err.message });
    }
  }

  console.log('\n=== Summary ===\n');
  console.log(`Files with easing attributes: ${totalFiles}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  // Detailed attribute coverage
  console.log('\n=== Easing Attribute Coverage ===\n');

  const attrCounts = { calcMode: 0, keyTimes: 0, keySplines: 0, keyPoints: 0 };
  const attrValues = { calcMode: new Set(), keyTimes: 0, keySplines: 0, keyPoints: 0 };

  for (const filename of files) {
    const content = fs.readFileSync(path.join(TEST_SUITE_PATH, filename), 'utf8');

    // Count calcMode values
    const calcModeMatch = content.match(/calcMode="([^"]+)"/g);
    if (calcModeMatch) {
      attrCounts.calcMode += calcModeMatch.length;
      calcModeMatch.forEach(m => {
        const val = m.match(/calcMode="([^"]+)"/)[1];
        attrValues.calcMode.add(val);
      });
    }

    if (content.includes('keyTimes=')) attrCounts.keyTimes++;
    if (content.includes('keySplines=')) attrCounts.keySplines++;
    if (content.includes('keyPoints=')) attrCounts.keyPoints++;
  }

  console.log('Attribute usage across W3C test suite:');
  console.log(`  calcMode: ${attrCounts.calcMode} occurrences`);
  console.log(`    Values: ${[...attrValues.calcMode].join(', ')}`);
  console.log(`  keyTimes: ${attrCounts.keyTimes} files`);
  console.log(`  keySplines: ${attrCounts.keySplines} files`);
  console.log(`  keyPoints: ${attrCounts.keyPoints} files`);

  if (failed > 0) {
    console.log('\n!! EASING PRESERVATION TEST FAILED !!\n');
    process.exit(1);
  } else {
    console.log('\n✓ ALL EASING ATTRIBUTES PRESERVED ✓\n');
    console.log('svg-matrix correctly preserves all animation timing/easing data!');
  }
}

testEasingPreservation().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
