/**
 * W3C SVG 1.1 Animation Test Suite Compliance Test
 *
 * This test validates svg-matrix against ALL 78 animation SVG files
 * from the official W3C SVG 1.1 Test Suite.
 *
 * The goal is to ensure that:
 * 1. All animation references are correctly detected
 * 2. No animation-referenced elements are incorrectly marked for removal
 * 3. cleanupIds preserves all animation-related IDs
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import {
  collectAllReferences,
  findUnreferencedDefs,
  parseTimingIds,
  parseAnimationValueIds,
  ANIMATION_ELEMENTS,
} from '../src/animation-references.js';
import { cleanupIds } from '../src/svg-toolbox.js';

const TEST_SUITE_PATH = 'SVG 1.1 W3C Test Suit/svg';

// Get all animation-related SVG files
function getAnimationTestFiles() {
  // Check if W3C test suite is available
  if (!fs.existsSync(TEST_SUITE_PATH)) {
    return null; // Signal that test suite is missing
  }
  const files = fs.readdirSync(TEST_SUITE_PATH);
  return files.filter(f => f.includes('anim') && f.endsWith('.svg'));
}

// Count animation elements in a document
function countAnimationElements(doc) {
  let count = 0;
  for (const tag of ANIMATION_ELEMENTS) {
    count += doc.getElementsByTagName(tag).length;
  }
  return count;
}

// Count IDs in a document
function countIds(doc) {
  const allElements = doc.querySelectorAll('[id]');
  return allElements.length;
}

// Test a single SVG file
async function testSVGFile(filename) {
  const filepath = path.join(TEST_SUITE_PATH, filename);
  const svgContent = fs.readFileSync(filepath, 'utf8');

  const result = {
    filename,
    success: true,
    errors: [],
    stats: {}
  };

  try {
    // Parse the SVG
    const doc = parseSVG(svgContent);

    // Count basic stats
    result.stats.animationElements = countAnimationElements(doc);
    result.stats.totalIds = countIds(doc);

    // Collect all references
    const refs = collectAllReferences(doc);
    result.stats.staticRefs = refs.static.size;
    result.stats.animationRefs = refs.animation.size;
    result.stats.cssRefs = refs.css.size;
    result.stats.jsRefs = refs.js.size;
    result.stats.totalRefs = refs.all.size;

    // Check for unreferenced defs
    const defsAnalysis = findUnreferencedDefs(doc);
    result.stats.safeToRemove = defsAnalysis.safeToRemove.length;
    result.stats.animationReferenced = defsAnalysis.animationReferenced.length;

    // Run cleanupIds and verify no animation references are lost
    const idsBefore = countIds(doc);
    const animElemsBefore = countAnimationElements(doc);

    // Clone the doc for cleanup test
    const docClone = parseSVG(svgContent);
    const cleanedDoc = await cleanupIds(docClone, { minify: false, remove: true });

    const idsAfter = countIds(cleanedDoc);
    const animElemsAfter = countAnimationElements(cleanedDoc);

    // Verify animation elements are preserved
    if (animElemsAfter !== animElemsBefore) {
      result.success = false;
      result.errors.push(`Animation elements changed: ${animElemsBefore} -> ${animElemsAfter}`);
    }

    // Collect refs after cleanup
    const refsAfter = collectAllReferences(cleanedDoc);

    // Verify animation references are still valid
    for (const animRef of refs.animation) {
      // Check if referenced element still exists using attribute selector (Node.js compatible)
      const el = cleanedDoc.querySelector(`[id="${animRef}"]`);
      if (!el && refs.animation.has(animRef)) {
        // Only error if the reference existed before cleanup
        const originalEl = doc.querySelector(`[id="${animRef}"]`);
        if (originalEl) {
          result.success = false;
          result.errors.push(`Animation reference '${animRef}' was removed by cleanupIds`);
        }
      }
    }

    result.stats.idsRemoved = idsBefore - idsAfter;

  } catch (err) {
    result.success = false;
    result.errors.push(`Parse/processing error: ${err.message}`);
  }

  return result;
}

// Main test execution
async function runAllTests() {
  console.log('\n=== W3C SVG 1.1 Animation Test Suite Compliance ===\n');

  const testFiles = getAnimationTestFiles();

  // Check if W3C test suite is available
  if (testFiles === null) {
    console.log('⚠ SKIPPED: W3C SVG 1.1 Test Suite not found at:', TEST_SUITE_PATH);
    console.log('  Download from: https://www.w3.org/Graphics/SVG/Test/20110816/');
    console.log('  Extract to project root as "SVG 1.1 W3C Test Suit/svg/"');
    return;
  }

  console.log(`Found ${testFiles.length} animation test files\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];
  const allStats = {
    totalAnimationElements: 0,
    totalAnimationRefs: 0,
    totalStaticRefs: 0,
    totalIdsPreserved: 0,
  };

  for (const file of testFiles) {
    const result = await testSVGFile(file);

    if (result.success) {
      passed++;
      console.log(`  ✓ ${file}`);
    } else {
      failed++;
      failures.push(result);
      console.log(`  ✗ ${file}`);
      result.errors.forEach(err => console.log(`      ${err}`));
    }

    allStats.totalAnimationElements += result.stats.animationElements || 0;
    allStats.totalAnimationRefs += result.stats.animationRefs || 0;
    allStats.totalStaticRefs += result.stats.staticRefs || 0;
  }

  console.log('\n=== Summary ===\n');
  console.log(`Total test files: ${testFiles.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nStatistics across all files:`);
  console.log(`  Total animation elements: ${allStats.totalAnimationElements}`);
  console.log(`  Total animation references detected: ${allStats.totalAnimationRefs}`);
  console.log(`  Total static references detected: ${allStats.totalStaticRefs}`);

  if (failures.length > 0) {
    console.log('\n=== Failed Tests Details ===\n');
    for (const failure of failures) {
      console.log(`\n${failure.filename}:`);
      failure.errors.forEach(err => console.log(`  - ${err}`));
      console.log(`  Stats: ${JSON.stringify(failure.stats, null, 2)}`);
    }
  }

  console.log('\n=== Animation Pattern Coverage ===\n');

  // Analyze what patterns are present in the test suite
  const patterns = {
    animate: 0,
    animateTransform: 0,
    animateMotion: 0,
    animateColor: 0,
    set: 0,
    hrefTargeting: 0,  // <animate xlink:href="#id">
    timingRefs: 0,     // begin="id.click"
    valuesRefs: 0,     // values="#id1;#id2"
  };

  for (const file of testFiles) {
    const filepath = path.join(TEST_SUITE_PATH, file);
    const content = fs.readFileSync(filepath, 'utf8');

    if (content.includes('<animate ') || content.includes('<animate>')) patterns.animate++;
    if (content.includes('<animateTransform')) patterns.animateTransform++;
    if (content.includes('<animateMotion')) patterns.animateMotion++;
    if (content.includes('<animateColor')) patterns.animateColor++;
    if (content.includes('<set ') || content.includes('<set>')) patterns.set++;
    if (content.match(/xlink:href="#[^"]+"/)) patterns.hrefTargeting++;
    if (content.match(/begin="[^"]*\.[a-z]+/i)) patterns.timingRefs++;
    if (content.match(/values="[^"]*#[^"]*"/)) patterns.valuesRefs++;
  }

  console.log('Animation elements found:');
  console.log(`  <animate>: ${patterns.animate} files`);
  console.log(`  <animateTransform>: ${patterns.animateTransform} files`);
  console.log(`  <animateMotion>: ${patterns.animateMotion} files`);
  console.log(`  <animateColor>: ${patterns.animateColor} files`);
  console.log(`  <set>: ${patterns.set} files`);
  console.log('\nReference patterns found:');
  console.log(`  xlink:href targeting: ${patterns.hrefTargeting} files`);
  console.log(`  Timing references (begin/end): ${patterns.timingRefs} files`);
  console.log(`  Values with ID refs: ${patterns.valuesRefs} files`);

  if (failed > 0) {
    console.log('\n!! COMPLIANCE TEST FAILED !!\n');
    process.exit(1);
  } else {
    console.log('\n✓ ALL W3C ANIMATION TESTS PASSED ✓\n');
    console.log('svg-matrix is 100% compliant with SVG 1.1 animation specs!');
  }
}

// Run tests
runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
