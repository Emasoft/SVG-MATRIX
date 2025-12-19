#!/usr/bin/env node

/**
 * Comprehensive test suite for svg-matrix removeComments function
 * Tests against all 525 W3C SVG 1.1 test suite files
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { JSDOM } from 'jsdom';
import SVGToolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const { removeComments } = SVGToolbox;

// Configuration
const SVG_TEST_DIR = '/tmp/svg11_w3c_test_suite/svg/';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeComments/output/';
const LOG_FILE = '/tmp/svg-function-tests/removeComments/logs/test-results.json';
const ANALYSIS_FILE = '/tmp/svg-function-tests/removeComments/analysis.md';

// Ensure directories exist
[OUTPUT_DIR, '/tmp/svg-function-tests/removeComments/logs/'].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// Test results storage
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  timestamp: new Date().toISOString(),
  details: []
};

/**
 * Validate SVG structure
 */
function validateSVG(svgContent) {
  try {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const doc = dom.window.document;

    // Check for parser errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return { valid: false, error: 'Parser error: ' + parserError.textContent };
    }

    // Check for SVG root element
    const svgElement = doc.querySelector('svg');
    if (!svgElement) {
      return { valid: false, error: 'No SVG root element found' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Count comments in SVG content
 */
function countComments(svgContent) {
  const commentRegex = /<!--[\s\S]*?-->/g;
  const matches = svgContent.match(commentRegex);
  return matches ? matches.length : 0;
}

/**
 * Test removeComments on a single SVG file
 */
async function testFile(filePath) {
  const filename = basename(filePath);
  const testResult = {
    file: filename,
    status: 'unknown',
    commentsBeforeCount: 0,
    commentsAfterCount: 0,
    inputSize: 0,
    outputSize: 0,
    error: null,
    validationError: null
  };

  try {
    // Read input file
    const inputContent = readFileSync(filePath, 'utf-8');
    testResult.inputSize = inputContent.length;
    testResult.commentsBeforeCount = countComments(inputContent);

    // Parse SVG
    let doc;
    try {
      doc = parseSVG(inputContent);
    } catch (parseError) {
      testResult.status = 'error';
      testResult.error = `Parse error: ${parseError.message}`;
      return testResult;
    }

    // Apply removeComments
    let processedDoc;
    try {
      processedDoc = await removeComments(doc);
    } catch (removeError) {
      testResult.status = 'error';
      testResult.error = `removeComments error: ${removeError.message}`;
      return testResult;
    }

    // Serialize back to string
    let outputContent;
    try {
      outputContent = serializeSVG(processedDoc);
    } catch (serializeError) {
      testResult.status = 'error';
      testResult.error = `Serialize error: ${serializeError.message}`;
      return testResult;
    }

    testResult.outputSize = outputContent.length;
    testResult.commentsAfterCount = countComments(outputContent);

    // Validate output SVG
    const validation = validateSVG(outputContent);
    if (!validation.valid) {
      testResult.status = 'failed';
      testResult.validationError = validation.error;
    } else if (testResult.commentsAfterCount > 0) {
      // If comments still exist after removeComments, that's a failure
      testResult.status = 'failed';
      testResult.error = `Comments still present: ${testResult.commentsAfterCount} comment(s) remaining`;
    } else {
      testResult.status = 'passed';
    }

    // Save output file
    const outputPath = join(OUTPUT_DIR, filename);
    writeFileSync(outputPath, outputContent, 'utf-8');

  } catch (error) {
    testResult.status = 'error';
    testResult.error = error.message;
  }

  return testResult;
}

/**
 * Generate analysis markdown report
 */
function generateAnalysis() {
  const passed = results.details.filter(r => r.status === 'passed');
  const failed = results.details.filter(r => r.status === 'failed');
  const errors = results.details.filter(r => r.status === 'error');

  const passRate = ((results.passed / results.total) * 100).toFixed(2);

  let markdown = `# removeComments Function Test Results\n\n`;
  markdown += `**Test Date:** ${results.timestamp}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `| Metric | Count | Percentage |\n`;
  markdown += `|--------|-------|------------|\n`;
  markdown += `| Total Files | ${results.total} | 100.00% |\n`;
  markdown += `| ✅ PASSED | ${results.passed} | ${passRate}% |\n`;
  markdown += `| ❌ FAILED | ${results.failed} | ${((results.failed / results.total) * 100).toFixed(2)}% |\n`;
  markdown += `| ⚠️ ERRORS | ${results.errors} | ${((results.errors / results.total) * 100).toFixed(2)}% |\n\n`;

  // Statistics on comments removed
  const filesWithComments = results.details.filter(r => r.commentsBeforeCount > 0);
  const totalCommentsRemoved = results.details.reduce((sum, r) => sum + (r.commentsBeforeCount - r.commentsAfterCount), 0);

  markdown += `## Comment Removal Statistics\n\n`;
  markdown += `- Files with comments: ${filesWithComments.length}\n`;
  markdown += `- Total comments in input files: ${results.details.reduce((sum, r) => sum + r.commentsBeforeCount, 0)}\n`;
  markdown += `- Total comments removed: ${totalCommentsRemoved}\n`;
  markdown += `- Average comments per file: ${(results.details.reduce((sum, r) => sum + r.commentsBeforeCount, 0) / results.total).toFixed(2)}\n\n`;

  // File size analysis
  const avgInputSize = results.details.reduce((sum, r) => sum + r.inputSize, 0) / results.total;
  const avgOutputSize = results.details.reduce((sum, r) => sum + r.outputSize, 0) / results.total;
  const avgReduction = avgInputSize - avgOutputSize;

  markdown += `## File Size Analysis\n\n`;
  markdown += `- Average input size: ${avgInputSize.toFixed(0)} bytes\n`;
  markdown += `- Average output size: ${avgOutputSize.toFixed(0)} bytes\n`;
  markdown += `- Average size reduction: ${avgReduction.toFixed(0)} bytes (${((avgReduction / avgInputSize) * 100).toFixed(2)}%)\n\n`;

  if (failed.length > 0) {
    markdown += `## ❌ Failed Tests (${failed.length})\n\n`;
    markdown += `| File | Reason |\n`;
    markdown += `|------|--------|\n`;
    failed.forEach(f => {
      const reason = f.error || f.validationError || 'Unknown';
      markdown += `| ${f.file} | ${reason} |\n`;
    });
    markdown += `\n`;
  }

  if (errors.length > 0) {
    markdown += `## ⚠️ Errors (${errors.length})\n\n`;
    markdown += `| File | Error |\n`;
    markdown += `|------|-------|\n`;
    errors.forEach(e => {
      markdown += `| ${e.file} | ${e.error} |\n`;
    });
    markdown += `\n`;
  }

  markdown += `## ✅ Passed Tests\n\n`;
  markdown += `${passed.length} files successfully processed with all comments removed.\n\n`;

  // Sample of files with most comments removed
  const topCommentRemovals = [...results.details]
    .filter(r => r.status === 'passed' && r.commentsBeforeCount > 0)
    .sort((a, b) => b.commentsBeforeCount - a.commentsBeforeCount)
    .slice(0, 10);

  if (topCommentRemovals.length > 0) {
    markdown += `### Top 10 Files by Comments Removed\n\n`;
    markdown += `| File | Comments Removed | Size Before | Size After | Reduction |\n`;
    markdown += `|------|------------------|-------------|------------|----------|\n`;
    topCommentRemovals.forEach(f => {
      const reduction = f.inputSize - f.outputSize;
      const reductionPct = ((reduction / f.inputSize) * 100).toFixed(2);
      markdown += `| ${f.file} | ${f.commentsBeforeCount} | ${f.inputSize} | ${f.outputSize} | ${reduction} (${reductionPct}%) |\n`;
    });
    markdown += `\n`;
  }

  markdown += `## Test Configuration\n\n`;
  markdown += `- SVG Test Suite: W3C SVG 1.1 Test Suite\n`;
  markdown += `- Input Directory: ${SVG_TEST_DIR}\n`;
  markdown += `- Output Directory: ${OUTPUT_DIR}\n`;
  markdown += `- Function Tested: removeComments from @emasoft/svg-matrix\n\n`;

  markdown += `## Conclusion\n\n`;
  if (results.passed === results.total) {
    markdown += `✅ **ALL TESTS PASSED!** The removeComments function successfully processed all ${results.total} W3C SVG test files.\n`;
  } else if (passRate >= 95) {
    markdown += `✅ **EXCELLENT!** ${passRate}% of tests passed. Minor issues found in ${results.failed + results.errors} files.\n`;
  } else if (passRate >= 90) {
    markdown += `⚠️ **GOOD** ${passRate}% of tests passed. Some issues need attention.\n`;
  } else {
    markdown += `❌ **NEEDS ATTENTION** Only ${passRate}% of tests passed. Significant issues found.\n`;
  }

  return markdown;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('🧪 Starting removeComments function test suite...\n');
  console.log(`📁 SVG Test Directory: ${SVG_TEST_DIR}`);
  console.log(`📁 Output Directory: ${OUTPUT_DIR}\n`);

  // Get all SVG files
  const files = readdirSync(SVG_TEST_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => join(SVG_TEST_DIR, f));

  results.total = files.length;
  console.log(`📊 Found ${files.length} SVG files to test\n`);

  // Process each file
  let processed = 0;
  for (const file of files) {
    const testResult = await testFile(file);
    results.details.push(testResult);

    if (testResult.status === 'passed') results.passed++;
    else if (testResult.status === 'failed') results.failed++;
    else if (testResult.status === 'error') results.errors++;

    processed++;

    // Progress indicator
    if (processed % 50 === 0) {
      console.log(`Progress: ${processed}/${files.length} (${((processed / files.length) * 100).toFixed(1)}%)`);
    }
  }

  console.log(`\n✅ Testing complete!\n`);
  console.log(`Results:`);
  console.log(`  Total: ${results.total}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Errors: ${results.errors}`);
  console.log(`  Pass Rate: ${((results.passed / results.total) * 100).toFixed(2)}%\n`);

  // Save results
  writeFileSync(LOG_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`📝 Detailed results saved to: ${LOG_FILE}`);

  // Generate analysis
  const analysis = generateAnalysis();
  writeFileSync(ANALYSIS_FILE, analysis, 'utf-8');
  console.log(`📊 Analysis report saved to: ${ANALYSIS_FILE}\n`);

  console.log('🎉 Test suite completed!');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
