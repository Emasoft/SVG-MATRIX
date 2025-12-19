/**
 * Comprehensive test of removeTitle function against all W3C SVG 1.1 test suite files
 *
 * Tests the removeTitle function from svg-toolbox.js against all 525 W3C SVG test files
 * to ensure it correctly removes title elements without breaking the SVG structure.
 *
 * Usage: node test/test-removeTitle-w3c.js
 *
 * Output:
 * - Processed SVG files: /tmp/svg-function-tests/removeTitle/
 * - Analysis report: /tmp/svg-function-tests/removeTitle/analysis.md
 */

import fs from 'fs';
import path from 'path';
import { removeTitle } from '../src/svg-toolbox.js';

const INPUT_DIR = '/tmp/svg11_w3c_test_suite/svg/';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeTitle/';
const ANALYSIS_FILE = path.join(OUTPUT_DIR, 'analysis.md');

// Test result tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

/**
 * Validate that output is well-formed XML
 */
function validateXML(xmlString, filename) {
  try {
    // Check for basic XML structure
    if (!xmlString || xmlString.trim().length === 0) {
      return { valid: false, error: 'Empty output' };
    }

    // Check for XML declaration
    if (!xmlString.includes('<?xml')) {
      return { valid: false, error: 'Missing XML declaration' };
    }

    // Check for SVG root element
    if (!xmlString.includes('<svg')) {
      return { valid: false, error: 'Missing SVG root element' };
    }

    // Check for balanced tags (basic check)
    const openTags = (xmlString.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (xmlString.match(/<\/[^>]+>/g) || []).length;
    const selfClosing = (xmlString.match(/<[^>]+\/>/g) || []).length;

    // This is a simplified check - not perfect but catches major issues
    const expectedCloseTags = openTags - selfClosing;
    if (closeTags !== expectedCloseTags && Math.abs(closeTags - expectedCloseTags) > 5) {
      return {
        valid: false,
        error: `Unbalanced tags: ${openTags} open, ${closeTags} close, ${selfClosing} self-closing`
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Check if title elements were actually removed
 */
function verifyTitleRemoval(xmlString) {
  // Count title elements in output
  const titleMatches = xmlString.match(/<title[^>]*>.*?<\/title>/gs) || [];
  return {
    removed: titleMatches.length === 0,
    remaining: titleMatches.length,
    titles: titleMatches
  };
}

/**
 * Test a single SVG file
 */
async function testFile(filename) {
  const inputPath = path.join(INPUT_DIR, filename);
  const outputPath = path.join(OUTPUT_DIR, filename);

  const result = {
    filename,
    status: 'PASS',
    error: null,
    warnings: [],
    inputSize: 0,
    outputSize: 0,
    titlesRemoved: 0,
    titlesRemaining: 0
  };

  try {
    // Read input file
    const inputSVG = fs.readFileSync(inputPath, 'utf8');
    result.inputSize = inputSVG.length;

    // Count original title elements
    const originalTitles = (inputSVG.match(/<title[^>]*>.*?<\/title>/gs) || []).length;
    result.titlesRemoved = originalTitles;

    // Apply removeTitle function (it handles parsing and serialization internally)
    let outputSVG;
    try {
      outputSVG = await removeTitle(inputSVG);
      result.outputSize = outputSVG.length;
    } catch (processError) {
      result.status = 'FAIL';
      result.error = `Processing error: ${processError.message}`;
      return result;
    }

    // Validate output XML
    const validation = validateXML(outputSVG, filename);
    if (!validation.valid) {
      result.status = 'FAIL';
      result.error = `Validation error: ${validation.error}`;
      return result;
    }

    // Verify title removal
    const titleCheck = verifyTitleRemoval(outputSVG);
    result.titlesRemaining = titleCheck.remaining;

    if (!titleCheck.removed) {
      result.status = 'FAIL';
      result.error = `Title removal incomplete: ${titleCheck.remaining} title(s) remaining`;
      result.warnings.push(`Remaining titles: ${titleCheck.titles.join(', ')}`);
      return result;
    }

    // Check for significant size changes (potential data loss)
    const sizeChange = ((result.outputSize - result.inputSize) / result.inputSize) * 100;
    if (sizeChange < -50) {
      result.warnings.push(`Large size reduction: ${sizeChange.toFixed(2)}% (potential data loss)`);
    }

    // Write output file
    fs.writeFileSync(outputPath, outputSVG, 'utf8');

    // Success!
    result.status = 'PASS';

  } catch (error) {
    result.status = 'FAIL';
    result.error = `Unexpected error: ${error.message}`;
  }

  return result;
}

/**
 * Generate markdown analysis report
 */
function generateAnalysis() {
  const timestamp = new Date().toISOString();

  let md = `# removeTitle Function Test Report\n\n`;
  md += `**Test Date:** ${timestamp}\n`;
  md += `**Test Suite:** W3C SVG 1.1 Test Suite\n`;
  md += `**Function:** removeTitle from svg-toolbox.js\n`;
  md += `**Input Directory:** ${INPUT_DIR}\n`;
  md += `**Output Directory:** ${OUTPUT_DIR}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count | Percentage |\n`;
  md += `|--------|-------|------------|\n`;
  md += `| Total Files | ${results.total} | 100% |\n`;
  md += `| Passed | ${results.passed} | ${((results.passed/results.total)*100).toFixed(2)}% |\n`;
  md += `| Failed | ${results.failed} | ${((results.failed/results.total)*100).toFixed(2)}% |\n\n`;

  // Statistics
  const totalTitlesRemoved = results.details.reduce((sum, r) => sum + r.titlesRemoved, 0);
  const filesWithTitles = results.details.filter(r => r.titlesRemoved > 0).length;
  const avgInputSize = results.details.reduce((sum, r) => sum + r.inputSize, 0) / results.total;
  const avgOutputSize = results.details.reduce((sum, r) => sum + r.outputSize, 0) / results.total;

  md += `## Statistics\n\n`;
  md += `- Total title elements removed: ${totalTitlesRemoved}\n`;
  md += `- Files containing title elements: ${filesWithTitles} (${((filesWithTitles/results.total)*100).toFixed(2)}%)\n`;
  md += `- Average input file size: ${avgInputSize.toFixed(0)} bytes\n`;
  md += `- Average output file size: ${avgOutputSize.toFixed(0)} bytes\n`;
  md += `- Average size reduction: ${((avgInputSize - avgOutputSize) / avgInputSize * 100).toFixed(2)}%\n\n`;

  // Failed tests
  if (results.failed > 0) {
    md += `## Failed Tests (${results.failed})\n\n`;
    md += `| Filename | Error | Warnings |\n`;
    md += `|----------|-------|----------|\n`;

    results.details
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        const warnings = r.warnings.length > 0 ? r.warnings.join('; ') : '-';
        md += `| ${r.filename} | ${r.error || '-'} | ${warnings} |\n`;
      });
    md += `\n`;
  }

  // Warnings
  const resultsWithWarnings = results.details.filter(r => r.warnings.length > 0);
  if (resultsWithWarnings.length > 0) {
    md += `## Tests with Warnings (${resultsWithWarnings.length})\n\n`;
    md += `| Filename | Status | Warnings |\n`;
    md += `|----------|--------|----------|\n`;

    resultsWithWarnings.forEach(r => {
      const warnings = r.warnings.join('; ');
      md += `| ${r.filename} | ${r.status} | ${warnings} |\n`;
    });
    md += `\n`;
  }

  // Title removal statistics
  md += `## Title Removal Details\n\n`;
  md += `| Titles in Input | File Count |\n`;
  md += `|-----------------|------------|\n`;

  const titleCounts = {};
  results.details.forEach(r => {
    const count = r.titlesRemoved;
    titleCounts[count] = (titleCounts[count] || 0) + 1;
  });

  Object.keys(titleCounts)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(count => {
      md += `| ${count} | ${titleCounts[count]} |\n`;
    });
  md += `\n`;

  // Full results table
  md += `## Detailed Results\n\n`;
  md += `| # | Filename | Status | Input Size | Output Size | Titles Removed | Error |\n`;
  md += `|---|----------|--------|------------|-------------|----------------|-------|\n`;

  results.details.forEach((r, idx) => {
    const sizeChange = r.inputSize > 0 ? ((r.outputSize - r.inputSize) / r.inputSize * 100).toFixed(1) : '0';
    const sizeChangeStr = `${r.outputSize} (${sizeChange >= 0 ? '+' : ''}${sizeChange}%)`;
    md += `| ${idx + 1} | ${r.filename} | ${r.status} | ${r.inputSize} | ${sizeChangeStr} | ${r.titlesRemoved} | ${r.error || '-'} |\n`;
  });

  return md;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('removeTitle Function Test Suite');
  console.log('================================\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}\n`);
  }

  // Get all SVG files
  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.endsWith('.svg'))
    .sort();

  results.total = files.length;
  console.log(`Found ${results.total} SVG files to test\n`);

  // Test each file
  let processed = 0;
  const startTime = Date.now();

  for (const file of files) {
    processed++;
    const result = await testFile(file);
    results.details.push(result);

    if (result.status === 'PASS') {
      results.passed++;
    } else {
      results.failed++;
    }

    // Progress indicator
    if (processed % 50 === 0 || processed === results.total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`Progress: ${processed}/${results.total} (${((processed/results.total)*100).toFixed(1)}%) - ${rate} files/sec - ${elapsed}s elapsed`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================');
  console.log('Test Results:');
  console.log(`  Total:  ${results.total}`);
  console.log(`  Passed: ${results.passed} (${((results.passed/results.total)*100).toFixed(2)}%)`);
  console.log(`  Failed: ${results.failed} (${((results.failed/results.total)*100).toFixed(2)}%)`);
  console.log(`  Time:   ${totalTime}s`);
  console.log('================================\n');

  // Generate analysis report
  const analysis = generateAnalysis();
  fs.writeFileSync(ANALYSIS_FILE, analysis, 'utf8');
  console.log(`Analysis report written to: ${ANALYSIS_FILE}\n`);

  // Show failed tests if any
  if (results.failed > 0) {
    console.log('Failed tests:');
    results.details
      .filter(r => r.status === 'FAIL')
      .slice(0, 10)
      .forEach(r => {
        console.log(`  - ${r.filename}: ${r.error}`);
      });
    if (results.failed > 10) {
      console.log(`  ... and ${results.failed - 10} more (see analysis.md)`);
    }
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
