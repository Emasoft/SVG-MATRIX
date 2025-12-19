#!/usr/bin/env node

/**
 * Comprehensive test runner for optimizeAnimationTiming function
 * Tests against all 525 W3C SVG 1.1 test suite files
 *
 * Features:
 * - Parse each SVG file
 * - Apply optimizeAnimationTiming function
 * - Validate output is well-formed XML
 * - Categorize results (PASS/FAIL/ERROR)
 * - Generate detailed analysis report
 * - Save all processed outputs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { JSDOM } from 'jsdom';

// Import the function to test
import { optimizeAnimationTiming } from '../src/svg-toolbox.js';

const SVG_INPUT_DIR = '/tmp/svg11_w3c_test_suite/svg';
const OUTPUT_DIR = '/tmp/svg-function-tests/optimizeAnimationTiming';
const PASSED_DIR = join(OUTPUT_DIR, 'passed');
const FAILED_DIR = join(OUTPUT_DIR, 'failed');
const ERRORS_DIR = join(OUTPUT_DIR, 'errors');

// Ensure directories exist
try {
  mkdirSync(PASSED_DIR, { recursive: true });
  mkdirSync(FAILED_DIR, { recursive: true });
  mkdirSync(ERRORS_DIR, { recursive: true });
} catch (e) {
  // Directories may already exist
}

// Test statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  animationFiles: 0,
  nonAnimationFiles: 0,
  details: []
};

/**
 * Check if SVG contains animation elements
 */
function hasAnimationElements(svgContent) {
  const animationTags = [
    'animate', 'animateTransform', 'animateMotion', 'animateColor',
    'set', 'keySplines', 'keyTimes'
  ];
  return animationTags.some(tag => svgContent.includes(`<${tag}`) || svgContent.includes(tag));
}

/**
 * Validate that output is well-formed XML
 */
function isWellFormedXML(xmlString) {
  try {
    const dom = new JSDOM(xmlString, { contentType: "text/xml" });
    const parseError = dom.window.document.querySelector('parsererror');
    return !parseError;
  } catch (error) {
    return false;
  }
}

/**
 * Extract animation-related attributes for comparison
 */
function extractAnimationAttributes(svgString) {
  const attrs = {
    keySplines: [],
    keyTimes: [],
    values: [],
    calcMode: []
  };

  // Match keySplines attributes
  const keySplineMatches = svgString.matchAll(/keySplines="([^"]*)"/g);
  for (const match of keySplineMatches) {
    attrs.keySplines.push(match[1]);
  }

  // Match keyTimes attributes
  const keyTimeMatches = svgString.matchAll(/keyTimes="([^"]*)"/g);
  for (const match of keyTimeMatches) {
    attrs.keyTimes.push(match[1]);
  }

  // Match values attributes
  const valueMatches = svgString.matchAll(/values="([^"]*)"/g);
  for (const match of valueMatches) {
    attrs.values.push(match[1]);
  }

  // Match calcMode attributes
  const calcModeMatches = svgString.matchAll(/calcMode="([^"]*)"/g);
  for (const match of calcModeMatches) {
    attrs.calcMode.push(match[1]);
  }

  return attrs;
}

/**
 * Test a single SVG file
 */
async function testSVGFile(filename) {
  const testResult = {
    filename,
    status: 'UNKNOWN',
    hasAnimations: false,
    inputSize: 0,
    outputSize: 0,
    error: null,
    changes: {
      keySplines: { before: 0, after: 0 },
      keyTimes: { before: 0, after: 0 },
      values: { before: 0, after: 0 },
      calcMode: { before: 0, after: 0 }
    }
  };

  try {
    // Read input SVG
    const inputPath = join(SVG_INPUT_DIR, filename);
    const inputSVG = readFileSync(inputPath, 'utf-8');
    testResult.inputSize = inputSVG.length;

    // Check if file contains animations
    testResult.hasAnimations = hasAnimationElements(inputSVG);
    if (testResult.hasAnimations) {
      stats.animationFiles++;
    } else {
      stats.nonAnimationFiles++;
    }

    // Extract animation attributes before processing
    const beforeAttrs = extractAnimationAttributes(inputSVG);
    testResult.changes.keySplines.before = beforeAttrs.keySplines.length;
    testResult.changes.keyTimes.before = beforeAttrs.keyTimes.length;
    testResult.changes.values.before = beforeAttrs.values.length;
    testResult.changes.calcMode.before = beforeAttrs.calcMode.length;

    // Apply optimizeAnimationTiming function
    // Note: optimizeAnimationTiming is wrapped with createOperation which handles
    // parsing and serialization internally, returning an SVG string
    let outputSVG;
    try {
      outputSVG = await optimizeAnimationTiming(inputSVG, {
        precision: 3,
        removeLinearSplines: true,
        optimizeValues: true
      });
    } catch (optimizeError) {
      testResult.status = 'ERROR';
      testResult.error = `Optimization failed: ${optimizeError.message}`;
      stats.errors++;

      // Save to errors directory
      writeFileSync(
        join(ERRORS_DIR, filename),
        inputSVG
      );

      return testResult;
    }

    testResult.outputSize = outputSVG.length;

    // Extract animation attributes after processing
    const afterAttrs = extractAnimationAttributes(outputSVG);
    testResult.changes.keySplines.after = afterAttrs.keySplines.length;
    testResult.changes.keyTimes.after = afterAttrs.keyTimes.length;
    testResult.changes.values.after = afterAttrs.values.length;
    testResult.changes.calcMode.after = afterAttrs.calcMode.length;

    // Validate output is well-formed XML
    if (!isWellFormedXML(outputSVG)) {
      testResult.status = 'FAILED';
      testResult.error = 'Output is not well-formed XML';
      stats.failed++;

      // Save to failed directory
      writeFileSync(
        join(FAILED_DIR, filename),
        outputSVG
      );
      writeFileSync(
        join(FAILED_DIR, `${filename}.original`),
        inputSVG
      );

      return testResult;
    }

    // Test PASSED
    testResult.status = 'PASSED';
    stats.passed++;

    // Save to passed directory
    writeFileSync(
      join(PASSED_DIR, filename),
      outputSVG
    );

  } catch (error) {
    testResult.status = 'ERROR';
    testResult.error = `Unexpected error: ${error.message}`;
    stats.errors++;

    try {
      const inputPath = join(SVG_INPUT_DIR, filename);
      const inputSVG = readFileSync(inputPath, 'utf-8');
      writeFileSync(
        join(ERRORS_DIR, filename),
        inputSVG
      );
    } catch (saveError) {
      // Ignore save errors
    }
  }

  return testResult;
}

/**
 * Generate markdown analysis report
 */
function generateAnalysisReport() {
  const now = new Date().toISOString();

  let report = `# optimizeAnimationTiming Function Test Report\n\n`;
  report += `**Generated:** ${now}\n`;
  report += `**Test Suite:** W3C SVG 1.1 Test Suite (525 files)\n`;
  report += `**Function:** optimizeAnimationTiming\n`;
  report += `**Source:** /Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js\n\n`;

  report += `## Summary\n\n`;
  report += `| Metric | Count | Percentage |\n`;
  report += `|--------|-------|------------|\n`;
  report += `| **Total Files** | ${stats.total} | 100.00% |\n`;
  report += `| **PASSED** | ${stats.passed} | ${((stats.passed/stats.total)*100).toFixed(2)}% |\n`;
  report += `| **FAILED** | ${stats.failed} | ${((stats.failed/stats.total)*100).toFixed(2)}% |\n`;
  report += `| **ERRORS** | ${stats.errors} | ${((stats.errors/stats.total)*100).toFixed(2)}% |\n`;
  report += `| Files with animations | ${stats.animationFiles} | ${((stats.animationFiles/stats.total)*100).toFixed(2)}% |\n`;
  report += `| Files without animations | ${stats.nonAnimationFiles} | ${((stats.nonAnimationFiles/stats.total)*100).toFixed(2)}% |\n\n`;

  // Animation attribute changes
  const totalKeySplinesBefore = stats.details.reduce((sum, d) => sum + d.changes.keySplines.before, 0);
  const totalKeySplinesAfter = stats.details.reduce((sum, d) => sum + d.changes.keySplines.after, 0);
  const totalKeyTimesBefore = stats.details.reduce((sum, d) => sum + d.changes.keyTimes.before, 0);
  const totalKeyTimesAfter = stats.details.reduce((sum, d) => sum + d.changes.keyTimes.after, 0);
  const totalValuesBefore = stats.details.reduce((sum, d) => sum + d.changes.values.before, 0);
  const totalValuesAfter = stats.details.reduce((sum, d) => sum + d.changes.values.after, 0);

  report += `## Animation Attribute Statistics\n\n`;
  report += `| Attribute | Before | After | Change |\n`;
  report += `|-----------|--------|-------|--------|\n`;
  report += `| keySplines | ${totalKeySplinesBefore} | ${totalKeySplinesAfter} | ${totalKeySplinesAfter - totalKeySplinesBefore} |\n`;
  report += `| keyTimes | ${totalKeyTimesBefore} | ${totalKeyTimesAfter} | ${totalKeyTimesAfter - totalKeyTimesBefore} |\n`;
  report += `| values | ${totalValuesBefore} | ${totalValuesAfter} | ${totalValuesAfter - totalValuesBefore} |\n\n`;

  // Files with animations
  if (stats.animationFiles > 0) {
    report += `## Files with Animation Elements (${stats.animationFiles})\n\n`;
    const animFiles = stats.details.filter(d => d.hasAnimations);
    report += `| Filename | Status | Input Size | Output Size | Reduction |\n`;
    report += `|----------|--------|------------|-------------|----------|\n`;
    animFiles.forEach(detail => {
      const reduction = detail.inputSize > 0
        ? ((1 - detail.outputSize / detail.inputSize) * 100).toFixed(2)
        : '0.00';
      report += `| ${detail.filename} | ${detail.status} | ${detail.inputSize} | ${detail.outputSize} | ${reduction}% |\n`;
    });
    report += `\n`;
  }

  // Failed tests
  if (stats.failed > 0) {
    report += `## Failed Tests (${stats.failed})\n\n`;
    const failedTests = stats.details.filter(d => d.status === 'FAILED');
    report += `| Filename | Error | Has Animations |\n`;
    report += `|----------|-------|----------------|\n`;
    failedTests.forEach(detail => {
      report += `| ${detail.filename} | ${detail.error} | ${detail.hasAnimations ? 'Yes' : 'No'} |\n`;
    });
    report += `\n`;
  }

  // Error tests
  if (stats.errors > 0) {
    report += `## Error Tests (${stats.errors})\n\n`;
    const errorTests = stats.details.filter(d => d.status === 'ERROR');
    report += `| Filename | Error | Has Animations |\n`;
    report += `|----------|-------|----------------|\n`;
    errorTests.forEach(detail => {
      report += `| ${detail.filename} | ${detail.error} | ${detail.hasAnimations ? 'Yes' : 'No'} |\n`;
    });
    report += `\n`;
  }

  // Detailed results for all files
  report += `## Detailed Results (All ${stats.total} Files)\n\n`;
  report += `| # | Filename | Status | Animations | Input | Output | Δ Size |\n`;
  report += `|---|----------|--------|------------|-------|--------|--------|\n`;
  stats.details.forEach((detail, idx) => {
    const sizeChange = detail.outputSize - detail.inputSize;
    const sizeChangeStr = sizeChange > 0 ? `+${sizeChange}` : `${sizeChange}`;
    report += `| ${idx + 1} | ${detail.filename} | ${detail.status} | ${detail.hasAnimations ? 'Yes' : 'No'} | ${detail.inputSize} | ${detail.outputSize} | ${sizeChangeStr} |\n`;
  });
  report += `\n`;

  report += `## Test Configuration\n\n`;
  report += `\`\`\`javascript\n`;
  report += `optimizeAnimationTiming(doc, {\n`;
  report += `  precision: 3,\n`;
  report += `  removeLinearSplines: true,\n`;
  report += `  optimizeValues: true\n`;
  report += `})\n`;
  report += `\`\`\`\n\n`;

  report += `## Output Directories\n\n`;
  report += `- **Passed:** ${PASSED_DIR}\n`;
  report += `- **Failed:** ${FAILED_DIR}\n`;
  report += `- **Errors:** ${ERRORS_DIR}\n\n`;

  report += `## Validation Criteria\n\n`;
  report += `1. **Parse:** Input SVG must be parseable by parseSVG()\n`;
  report += `2. **Optimize:** optimizeAnimationTiming() must execute without errors\n`;
  report += `3. **Serialize:** Output must be serializable by serializeSVG()\n`;
  report += `4. **Well-formed:** Output must be valid XML (validated by JSDOM)\n\n`;

  report += `## Conclusion\n\n`;
  if (stats.failed === 0 && stats.errors === 0) {
    report += `✅ **ALL TESTS PASSED** - The optimizeAnimationTiming function successfully processed all ${stats.total} W3C SVG test files.\n\n`;
  } else {
    const successRate = ((stats.passed / stats.total) * 100).toFixed(2);
    report += `⚠️ **${successRate}% SUCCESS RATE** - ${stats.failed} failures and ${stats.errors} errors were encountered.\n\n`;
  }

  return report;
}

/**
 * Main test execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('W3C SVG Test Suite - optimizeAnimationTiming Function Test');
  console.log('='.repeat(80));
  console.log();

  // Get all SVG files
  const files = readdirSync(SVG_INPUT_DIR)
    .filter(f => f.endsWith('.svg'))
    .sort();

  stats.total = files.length;

  console.log(`Found ${files.length} SVG files in ${SVG_INPUT_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log();
  console.log('Starting tests...\n');

  // Process each file
  let processedCount = 0;
  const startTime = Date.now();

  for (const file of files) {
    processedCount++;
    const progress = ((processedCount / files.length) * 100).toFixed(1);
    process.stdout.write(`\rProcessing [${progress}%] ${processedCount}/${files.length}: ${file.padEnd(50)}`);

    const result = await testSVGFile(file);
    stats.details.push(result);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n\n' + '='.repeat(80));
  console.log('Test Execution Complete');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total files:    ${stats.total}`);
  console.log(`PASSED:         ${stats.passed} (${((stats.passed/stats.total)*100).toFixed(2)}%)`);
  console.log(`FAILED:         ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(2)}%)`);
  console.log(`ERRORS:         ${stats.errors} (${((stats.errors/stats.total)*100).toFixed(2)}%)`);
  console.log();
  console.log(`Animation files:     ${stats.animationFiles}`);
  console.log(`Non-animation files: ${stats.nonAnimationFiles}`);
  console.log();
  console.log(`Duration: ${duration} seconds`);
  console.log();

  // Generate analysis report
  console.log('Generating analysis.md report...');
  const report = generateAnalysisReport();
  writeFileSync(join(OUTPUT_DIR, 'analysis.md'), report);
  console.log(`✓ Report saved to: ${join(OUTPUT_DIR, 'analysis.md')}`);
  console.log();

  // Save detailed JSON results
  console.log('Saving detailed results...');
  writeFileSync(
    join(OUTPUT_DIR, 'results.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log(`✓ Results saved to: ${join(OUTPUT_DIR, 'results.json')}`);
  console.log();

  console.log('='.repeat(80));
  if (stats.failed === 0 && stats.errors === 0) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.log(`⚠️  ${stats.failed} FAILURES, ${stats.errors} ERRORS`);
  }
  console.log('='.repeat(80));

  process.exit(stats.failed + stats.errors > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
