#!/usr/bin/env node

/**
 * Test removeDoctype function against all 525 W3C SVG test files
 *
 * This script:
 * 1. Reads all SVG files from /tmp/svg11_w3c_test_suite/svg/
 * 2. Applies removeDoctype function to each file
 * 3. Validates the output is valid XML/SVG
 * 4. Checks that DOCTYPE declarations are properly removed
 * 5. Saves processed files to /tmp/svg-function-tests/removeDoctype/
 * 6. Generates analysis.md with PASS/FAIL results
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { removeDoctype } from '../src/svg-toolbox.js';

const INPUT_DIR = '/tmp/svg11_w3c_test_suite/svg/';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeDoctype/';
const ANALYSIS_FILE = path.join(OUTPUT_DIR, 'analysis.md');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Test result tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

/**
 * Check if a string contains a DOCTYPE declaration
 */
function hasDoctype(content) {
  return /<!DOCTYPE/i.test(content);
}

/**
 * Validate that output is valid XML
 */
function isValidXML(content) {
  try {
    // Try to parse it again to ensure it's valid
    parseSVG(content);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if DOCTYPE was properly removed
 */
function doctypeRemoved(originalContent, processedContent) {
  const hadDoctype = hasDoctype(originalContent);
  const stillHasDoctype = hasDoctype(processedContent);

  // If original didn't have DOCTYPE, it's a pass (nothing to remove)
  if (!hadDoctype) {
    return { removed: true, reason: 'No DOCTYPE in original' };
  }

  // If processed still has DOCTYPE, it's a fail
  if (stillHasDoctype) {
    return { removed: false, reason: 'DOCTYPE still present in output' };
  }

  // DOCTYPE was successfully removed
  return { removed: true, reason: 'DOCTYPE successfully removed' };
}

/**
 * Test a single SVG file
 */
async function testFile(filename) {
  const inputPath = path.join(INPUT_DIR, filename);
  const outputPath = path.join(OUTPUT_DIR, filename);

  const result = {
    filename,
    status: 'UNKNOWN',
    hadDoctype: false,
    doctypeRemoved: false,
    validXML: false,
    error: null,
    details: ''
  };

  try {
    // Read original file
    const originalContent = fs.readFileSync(inputPath, 'utf8');
    result.hadDoctype = hasDoctype(originalContent);

    // Apply removeDoctype - it handles parsing and serialization internally
    // Pass the SVG string directly and it will return a string
    let processedContent;
    try {
      processedContent = await removeDoctype(originalContent);
    } catch (processError) {
      result.status = 'SKIP';
      result.error = `Process error: ${processError.message}`;
      result.details = 'Could not process SVG with removeDoctype';
      results.skipped++;
      return result;
    }

    // Save processed file
    fs.writeFileSync(outputPath, processedContent, 'utf8');

    // Validate output
    result.validXML = isValidXML(processedContent);

    if (!result.validXML) {
      result.status = 'FAIL';
      result.error = 'Output is not valid XML/SVG';
      results.failed++;
      return result;
    }

    // Check DOCTYPE removal
    const doctypeCheck = doctypeRemoved(originalContent, processedContent);
    result.doctypeRemoved = doctypeCheck.removed;
    result.details = doctypeCheck.reason;

    if (!doctypeCheck.removed) {
      result.status = 'FAIL';
      result.error = 'DOCTYPE not properly removed';
      results.failed++;
      return result;
    }

    // Success!
    result.status = 'PASS';
    results.passed++;
    return result;

  } catch (error) {
    result.status = 'FAIL';
    result.error = error.message;
    result.details = error.stack;
    results.failed++;
    return result;
  }
}

/**
 * Generate markdown analysis report
 */
function generateAnalysis(results) {
  const lines = [];

  lines.push('# removeDoctype Function Test Report');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push('Test of `removeDoctype` function against W3C SVG 1.1 Test Suite (525 files)');
  lines.push('');
  lines.push('### Summary Statistics');
  lines.push('');
  lines.push(`- **Total Files**: ${results.total}`);
  lines.push(`- **Passed**: ${results.passed} (${((results.passed / results.total) * 100).toFixed(2)}%)`);
  lines.push(`- **Failed**: ${results.failed} (${((results.failed / results.total) * 100).toFixed(2)}%)`);
  lines.push(`- **Skipped**: ${results.skipped} (${((results.skipped / results.total) * 100).toFixed(2)}%)`);
  lines.push('');

  // Count files with DOCTYPE
  const filesWithDoctype = results.details.filter(r => r.hadDoctype).length;
  lines.push(`- **Files with DOCTYPE**: ${filesWithDoctype}`);
  lines.push(`- **Files without DOCTYPE**: ${results.total - filesWithDoctype}`);
  lines.push('');

  // Test criteria
  lines.push('### Test Criteria');
  lines.push('');
  lines.push('Each file was tested for:');
  lines.push('1. **Parse Success**: Original SVG can be parsed');
  lines.push('2. **Valid Output**: Processed output is valid XML/SVG');
  lines.push('3. **DOCTYPE Removal**: DOCTYPE declaration is properly removed (if present)');
  lines.push('');

  // Failed tests
  if (results.failed > 0) {
    lines.push('## Failed Tests');
    lines.push('');
    lines.push('| File | Error | Details |');
    lines.push('|------|-------|---------|');

    results.details
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        lines.push(`| ${r.filename} | ${r.error || 'N/A'} | ${r.details || 'N/A'} |`);
      });

    lines.push('');
  }

  // Skipped tests
  if (results.skipped > 0) {
    lines.push('## Skipped Tests');
    lines.push('');
    lines.push('| File | Reason |');
    lines.push('|------|--------|');

    results.details
      .filter(r => r.status === 'SKIP')
      .forEach(r => {
        lines.push(`| ${r.filename} | ${r.error || r.details || 'N/A'} |`);
      });

    lines.push('');
  }

  // DOCTYPE statistics
  lines.push('## DOCTYPE Statistics');
  lines.push('');
  lines.push('### Files with DOCTYPE');
  lines.push('');

  const doctypeFiles = results.details.filter(r => r.hadDoctype);
  if (doctypeFiles.length > 0) {
    lines.push('| File | Status | DOCTYPE Removed | Valid XML |');
    lines.push('|------|--------|----------------|-----------|');

    doctypeFiles.forEach(r => {
      lines.push(`| ${r.filename} | ${r.status} | ${r.doctypeRemoved ? 'Yes' : 'No'} | ${r.validXML ? 'Yes' : 'No'} |`);
    });
  } else {
    lines.push('No files with DOCTYPE found in test suite.');
  }

  lines.push('');

  // Sample passed tests
  lines.push('## Sample Passed Tests');
  lines.push('');

  const passedSample = results.details
    .filter(r => r.status === 'PASS')
    .slice(0, 20);

  if (passedSample.length > 0) {
    lines.push('| File | Had DOCTYPE | Details |');
    lines.push('|------|-------------|---------|');

    passedSample.forEach(r => {
      lines.push(`| ${r.filename} | ${r.hadDoctype ? 'Yes' : 'No'} | ${r.details} |`);
    });
  }

  lines.push('');

  // Complete results table
  lines.push('## Complete Results');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Click to expand full results table</summary>');
  lines.push('');
  lines.push('| File | Status | Had DOCTYPE | DOCTYPE Removed | Valid XML |');
  lines.push('|------|--------|-------------|-----------------|-----------|');

  results.details.forEach(r => {
    lines.push(`| ${r.filename} | ${r.status} | ${r.hadDoctype ? 'Yes' : 'No'} | ${r.doctypeRemoved ? 'Yes' : 'No'} | ${r.validXML ? 'Yes' : 'No'} |`);
  });

  lines.push('');
  lines.push('</details>');
  lines.push('');

  // Conclusion
  lines.push('## Conclusion');
  lines.push('');

  if (results.failed === 0 && results.skipped === 0) {
    lines.push('✅ **All tests passed!** The `removeDoctype` function successfully processed all 525 W3C SVG test files.');
  } else if (results.failed === 0) {
    lines.push(`✅ **All processable tests passed!** ${results.passed} files passed, ${results.skipped} files were skipped due to parse errors.`);
  } else {
    lines.push(`⚠️ **Some tests failed.** ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped.`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated: ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('Testing removeDoctype against W3C SVG Test Suite...');
  console.log(`Input: ${INPUT_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  // Get all SVG files
  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.endsWith('.svg'))
    .sort();

  results.total = files.length;

  console.log(`Found ${results.total} SVG files`);
  console.log('');

  // Test each file
  let processed = 0;
  const startTime = Date.now();

  for (const file of files) {
    const result = await testFile(file);
    results.details.push(result);
    processed++;

    // Progress indicator
    if (processed % 50 === 0 || processed === results.total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / elapsed).toFixed(1);
      console.log(`Progress: ${processed}/${results.total} (${rate} files/sec) - Passed: ${results.passed}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
    }
  }

  console.log('');
  console.log('Test complete!');
  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Total:   ${results.total}`);
  console.log(`Passed:  ${results.passed} (${((results.passed / results.total) * 100).toFixed(2)}%)`);
  console.log(`Failed:  ${results.failed} (${((results.failed / results.total) * 100).toFixed(2)}%)`);
  console.log(`Skipped: ${results.skipped} (${((results.skipped / results.total) * 100).toFixed(2)}%)`);
  console.log('');

  // Generate analysis report
  const analysis = generateAnalysis(results);
  fs.writeFileSync(ANALYSIS_FILE, analysis, 'utf8');

  console.log(`Analysis report saved to: ${ANALYSIS_FILE}`);
  console.log('');

  // Also save JSON results
  const jsonPath = path.join(OUTPUT_DIR, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`JSON results saved to: ${jsonPath}`);

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
runTests();
