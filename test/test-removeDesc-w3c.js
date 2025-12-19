/**
 * Comprehensive Test Suite for removeDesc Function
 * Tests against all 525 W3C SVG 1.1 Test Suite files
 *
 * This script:
 * 1. Loads each SVG file from the W3C test suite
 * 2. Applies the removeDesc function
 * 3. Validates the output is well-formed XML
 * 4. Saves processed files to /tmp/svg-function-tests/removeDesc/
 * 5. Generates detailed analysis.md with PASS/FAIL results
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { JSDOM } from 'jsdom';

// Import the removeDesc function from svg-matrix
import { removeDesc, SVGParser } from '@emasoft/svg-matrix';
const { parseSVG, serializeSVG } = SVGParser;

const SVG_TEST_DIR = '/tmp/svg11_w3c_test_suite/svg';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeDesc';
const LOG_FILE = join(OUTPUT_DIR, 'test-log.json');
const ANALYSIS_FILE = join(OUTPUT_DIR, 'analysis.md');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Test result tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  timestamp: new Date().toISOString(),
  tests: []
};

/**
 * Validate that a string is well-formed XML
 */
function isWellFormedXML(xmlString) {
  try {
    const dom = new JSDOM(xmlString, { contentType: 'text/xml' });
    const parseErrors = dom.window.document.querySelectorAll('parsererror');
    return parseErrors.length === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Count desc elements in an SVG string
 */
function countDescElements(svgString) {
  try {
    const dom = new JSDOM(svgString, { contentType: 'text/xml' });
    return dom.window.document.querySelectorAll('desc').length;
  } catch {
    return -1;
  }
}

/**
 * Test a single SVG file
 */
async function testSVGFile(filename) {
  const testResult = {
    filename,
    status: 'UNKNOWN',
    descBefore: 0,
    descAfter: 0,
    sizeBefore: 0,
    sizeAfter: 0,
    error: null,
    validXMLBefore: false,
    validXMLAfter: false,
    timestamp: new Date().toISOString()
  };

  try {
    const inputPath = join(SVG_TEST_DIR, filename);
    const outputPath = join(OUTPUT_DIR, filename);

    // Read input file
    const svgContent = readFileSync(inputPath, 'utf-8');
    testResult.sizeBefore = svgContent.length;
    testResult.validXMLBefore = isWellFormedXML(svgContent);
    testResult.descBefore = countDescElements(svgContent);

    // Apply removeDesc function (it handles parse/serialize internally)
    const processedSVG = await removeDesc(svgContent);

    testResult.sizeAfter = processedSVG.length;
    testResult.validXMLAfter = isWellFormedXML(processedSVG);
    testResult.descAfter = countDescElements(processedSVG);

    // Save processed file
    writeFileSync(outputPath, processedSVG, 'utf-8');

    // Determine test status
    if (!testResult.validXMLBefore) {
      testResult.status = 'SKIP';
      testResult.error = 'Input was not well-formed XML';
    } else if (!testResult.validXMLAfter) {
      testResult.status = 'FAIL';
      testResult.error = 'Output is not well-formed XML';
      results.failed++;
    } else if (testResult.descAfter > 0) {
      testResult.status = 'FAIL';
      testResult.error = `Still contains ${testResult.descAfter} desc element(s)`;
      results.failed++;
    } else {
      testResult.status = 'PASS';
      results.passed++;
    }

  } catch (error) {
    testResult.status = 'ERROR';
    testResult.error = error.message;
    results.errors++;
  }

  return testResult;
}

/**
 * Generate markdown analysis report
 */
function generateAnalysis(results) {
  const passRate = ((results.passed / results.total) * 100).toFixed(2);
  const failRate = ((results.failed / results.total) * 100).toFixed(2);
  const errorRate = ((results.errors / results.total) * 100).toFixed(2);

  let markdown = `# removeDesc Function Test Report

## Summary

**Test Date:** ${results.timestamp}
**Total Tests:** ${results.total}
**Passed:** ${results.passed} (${passRate}%)
**Failed:** ${results.failed} (${failRate}%)
**Errors:** ${results.errors} (${errorRate}%)

## Test Configuration

- **Source Directory:** ${SVG_TEST_DIR}
- **Output Directory:** ${OUTPUT_DIR}
- **Test Suite:** W3C SVG 1.1 Test Suite (525 files)
- **Function Tested:** \`removeDesc\` from @emasoft/svg-matrix

## Test Criteria

A test **PASSES** if:
1. Input SVG is well-formed XML
2. Output SVG is well-formed XML
3. All \`<desc>\` elements are removed from the output

A test **FAILS** if:
1. Output is not well-formed XML
2. Output still contains \`<desc>\` elements

A test **ERRORS** if:
1. Exception occurred during processing

## Results by Category

### Passed Tests (${results.passed})

Files that were successfully processed with all desc elements removed:

`;

  // Group results by status
  const passed = results.tests.filter(t => t.status === 'PASS');
  const failed = results.tests.filter(t => t.status === 'FAIL');
  const errors = results.tests.filter(t => t.status === 'ERROR');
  const skipped = results.tests.filter(t => t.status === 'SKIP');

  // Passed tests table
  if (passed.length > 0) {
    markdown += '| Filename | Desc Before | Size Before | Size After | Reduction |\n';
    markdown += '|----------|-------------|-------------|------------|----------|\n';
    passed.forEach(test => {
      const reduction = ((1 - test.sizeAfter / test.sizeBefore) * 100).toFixed(2);
      markdown += `| ${test.filename} | ${test.descBefore} | ${test.sizeBefore} | ${test.sizeAfter} | ${reduction}% |\n`;
    });
  } else {
    markdown += '_No passed tests_\n';
  }

  // Failed tests
  markdown += `\n### Failed Tests (${results.failed})\n\n`;
  if (failed.length > 0) {
    markdown += '| Filename | Error | Desc Before | Desc After | Valid XML |\n';
    markdown += '|----------|-------|-------------|------------|----------|\n';
    failed.forEach(test => {
      markdown += `| ${test.filename} | ${test.error} | ${test.descBefore} | ${test.descAfter} | ${test.validXMLAfter ? '✓' : '✗'} |\n`;
    });
  } else {
    markdown += '_No failed tests_\n';
  }

  // Error tests
  markdown += `\n### Error Tests (${results.errors})\n\n`;
  if (errors.length > 0) {
    markdown += '| Filename | Error Message |\n';
    markdown += '|----------|---------------|\n';
    errors.forEach(test => {
      markdown += `| ${test.filename} | ${test.error} |\n`;
    });
  } else {
    markdown += '_No errors_\n';
  }

  // Skipped tests
  if (skipped.length > 0) {
    markdown += `\n### Skipped Tests (${skipped.length})\n\n`;
    markdown += '| Filename | Reason |\n';
    markdown += '|----------|--------|\n';
    skipped.forEach(test => {
      markdown += `| ${test.filename} | ${test.error} |\n`;
    });
  }

  // Statistics
  markdown += `\n## Detailed Statistics\n\n`;

  const totalDescRemoved = results.tests.reduce((sum, test) => {
    return sum + Math.max(0, test.descBefore - test.descAfter);
  }, 0);

  const avgSizeBefore = results.tests.reduce((sum, t) => sum + t.sizeBefore, 0) / results.total;
  const avgSizeAfter = results.tests.reduce((sum, t) => sum + t.sizeAfter, 0) / results.total;
  const avgReduction = ((1 - avgSizeAfter / avgSizeBefore) * 100).toFixed(2);

  markdown += `- **Total desc elements removed:** ${totalDescRemoved}\n`;
  markdown += `- **Average file size before:** ${avgSizeBefore.toFixed(0)} bytes\n`;
  markdown += `- **Average file size after:** ${avgSizeAfter.toFixed(0)} bytes\n`;
  markdown += `- **Average size reduction:** ${avgReduction}%\n`;

  // Files with most desc elements
  const filesWithMostDesc = [...results.tests]
    .filter(t => t.descBefore > 0)
    .sort((a, b) => b.descBefore - a.descBefore)
    .slice(0, 10);

  if (filesWithMostDesc.length > 0) {
    markdown += `\n### Top 10 Files with Most desc Elements\n\n`;
    markdown += '| Filename | desc Count | Status |\n';
    markdown += '|----------|-----------|--------|\n';
    filesWithMostDesc.forEach(test => {
      markdown += `| ${test.filename} | ${test.descBefore} | ${test.status} |\n`;
    });
  }

  // Conclusion
  markdown += `\n## Conclusion\n\n`;

  if (results.failed === 0 && results.errors === 0) {
    markdown += `✅ **All tests passed successfully!** The \`removeDesc\` function correctly removed all desc elements from ${results.total} SVG files while maintaining valid XML structure.\n`;
  } else if (results.passed / results.total > 0.95) {
    markdown += `✅ **Excellent performance!** ${passRate}% of tests passed. The function works reliably for the vast majority of SVG files.\n`;
  } else if (results.passed / results.total > 0.8) {
    markdown += `⚠️ **Good performance with some issues.** ${passRate}% of tests passed. Review the failed tests to identify edge cases.\n`;
  } else {
    markdown += `❌ **Significant issues detected.** Only ${passRate}% of tests passed. The function requires debugging and improvements.\n`;
  }

  markdown += `\n---\n_Generated on ${new Date().toISOString()}_\n`;

  return markdown;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  removeDesc Function Test Suite');
  console.log('  W3C SVG 1.1 Test Suite (525 files)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get all SVG files
  const svgFiles = readdirSync(SVG_TEST_DIR).filter(f => f.endsWith('.svg')).sort();
  results.total = svgFiles.length;

  console.log(`Found ${results.total} SVG files to test\n`);

  // Test each file
  let processed = 0;
  for (const filename of svgFiles) {
    processed++;
    const testResult = await testSVGFile(filename);
    results.tests.push(testResult);

    // Progress indicator
    if (processed % 25 === 0 || processed === results.total) {
      const percent = ((processed / results.total) * 100).toFixed(1);
      console.log(`Progress: ${processed}/${results.total} (${percent}%) - P:${results.passed} F:${results.failed} E:${results.errors}`);
    }

    // Log individual failures and errors
    if (testResult.status === 'FAIL' || testResult.status === 'ERROR') {
      console.log(`  ${testResult.status}: ${filename} - ${testResult.error}`);
    }
  }

  // Save detailed log
  writeFileSync(LOG_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✓ Detailed log saved to: ${LOG_FILE}`);

  // Generate and save analysis
  const analysis = generateAnalysis(results);
  writeFileSync(ANALYSIS_FILE, analysis, 'utf-8');
  console.log(`✓ Analysis report saved to: ${ANALYSIS_FILE}\n`);

  // Print summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Tests:  ${results.total}`);
  console.log(`Passed:       ${results.passed} (${((results.passed/results.total)*100).toFixed(2)}%)`);
  console.log(`Failed:       ${results.failed} (${((results.failed/results.total)*100).toFixed(2)}%)`);
  console.log(`Errors:       ${results.errors} (${((results.errors/results.total)*100).toFixed(2)}%)`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  if (results.failed > 0 || results.errors > 0) {
    console.log('❌ Tests completed with failures or errors');
    process.exit(1);
  } else {
    console.log('✅ All tests passed successfully!');
    process.exit(0);
  }
}

// Run the tests
runTests();
