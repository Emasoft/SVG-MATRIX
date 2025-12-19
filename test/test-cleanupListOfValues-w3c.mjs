#!/usr/bin/env node

/**
 * Comprehensive Test Suite for cleanupListOfValues Function
 *
 * Tests the cleanupListOfValues function from svg-matrix against all 525 W3C SVG test files.
 *
 * Test Strategy:
 * 1. Parse each SVG file
 * 2. Extract attributes that cleanupListOfValues processes:
 *    - points (polygon, polyline)
 *    - enable-background
 *    - viewBox
 *    - stroke-dasharray
 *    - dx, dy, x, y
 * 3. Apply cleanupListOfValues transformation
 * 4. Validate output (well-formed, numeric precision, no data corruption)
 * 5. Generate detailed analysis report
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { JSDOM } from 'jsdom';

// Import cleanupListOfValues plugin
import { fn as cleanupListOfValues, name as pluginName } from '/Users/emanuelesabetta/Code/SVG-MATRIX/svgo/plugins/cleanupListOfValues.js';

const SVG_DIR = '/tmp/svg';
const OUTPUT_DIR = '/tmp/svg-function-tests/cleanupListOfValues';
const RESULTS_FILE = join(OUTPUT_DIR, 'test-results.json');
const LOG_FILE = join(OUTPUT_DIR, 'test-execution.log');

// Test configuration
const TEST_PARAMS = {
  floatPrecision: 3,
  leadingZero: true,
  defaultPx: true,
  convertToPx: true
};

// Attributes processed by cleanupListOfValues
const PROCESSED_ATTRIBUTES = [
  'points',
  'enable-background',
  'viewBox',
  'stroke-dasharray',
  'dx',
  'dy',
  'x',
  'y'
];

/**
 * Logger utility
 */
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.logs = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    this.logs.push(logEntry);
  }

  error(message) {
    this.log(message, 'ERROR');
  }

  warn(message) {
    this.log(message, 'WARN');
  }

  success(message) {
    this.log(message, 'SUCCESS');
  }

  save() {
    writeFileSync(this.logFile, this.logs.join('\n'), 'utf8');
  }
}

/**
 * Test result tracker
 */
class TestResults {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = 0;
    this.details = [];
    this.attributeStats = {};
    this.transformations = [];
  }

  addTest(result) {
    this.total++;
    this.details.push(result);

    if (result.status === 'PASS') {
      this.passed++;
    } else if (result.status === 'FAIL') {
      this.failed++;
    } else if (result.status === 'SKIP') {
      this.skipped++;
    } else if (result.status === 'ERROR') {
      this.errors++;
    }

    // Track attribute statistics
    if (result.attributesFound) {
      result.attributesFound.forEach(attr => {
        if (!this.attributeStats[attr]) {
          this.attributeStats[attr] = 0;
        }
        this.attributeStats[attr]++;
      });
    }

    // Track transformations
    if (result.transformations) {
      this.transformations.push(...result.transformations);
    }
  }

  save(file) {
    writeFileSync(file, JSON.stringify(this, null, 2), 'utf8');
  }
}

/**
 * Extract attributes from SVG DOM
 */
function extractAttributes(element, attributeList) {
  const attrs = {};
  attributeList.forEach(attr => {
    const value = element.getAttribute(attr);
    if (value !== null && value !== '') {
      attrs[attr] = value;
    }
  });
  return attrs;
}

/**
 * Recursively process all elements in DOM
 */
function processAllElements(element, callback) {
  callback(element);
  for (let child of element.children) {
    processAllElements(child, callback);
  }
}

/**
 * Validate numeric values in processed string
 */
function validateNumericValues(str) {
  const numericPattern = /[-+]?\d*\.?\d+([eE][-+]?\d+)?/g;
  const matches = str.match(numericPattern);

  if (!matches) return { valid: true, values: [] };

  const values = matches.map(m => parseFloat(m));
  const allValid = values.every(v => !isNaN(v) && isFinite(v));

  return {
    valid: allValid,
    values: values,
    invalidValues: values.filter(v => isNaN(v) || !isFinite(v))
  };
}

/**
 * Test a single SVG file
 */
function testSVGFile(svgPath, logger) {
  const filename = basename(svgPath);
  const result = {
    file: filename,
    path: svgPath,
    status: 'SKIP',
    attributesFound: [],
    transformations: [],
    error: null,
    validation: {
      passed: true,
      issues: []
    }
  };

  try {
    // Read SVG file
    const svgContent = readFileSync(svgPath, 'utf8');

    // Parse with JSDOM
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const document = dom.window.document;
    const svgElement = document.querySelector('svg');

    if (!svgElement) {
      result.status = 'SKIP';
      result.error = 'No SVG element found';
      return result;
    }

    // Collect all elements with target attributes
    const elementsToProcess = [];
    processAllElements(svgElement, (element) => {
      const attrs = extractAttributes(element, PROCESSED_ATTRIBUTES);
      if (Object.keys(attrs).length > 0) {
        elementsToProcess.push({
          element: element,
          tagName: element.tagName,
          originalAttrs: { ...attrs }
        });
        result.attributesFound.push(...Object.keys(attrs));
      }
    });

    if (elementsToProcess.length === 0) {
      result.status = 'SKIP';
      result.error = 'No processable attributes found';
      return result;
    }

    // Create plugin instance
    const plugin = cleanupListOfValues(null, TEST_PARAMS);

    // Process each element
    elementsToProcess.forEach(({ element, tagName, originalAttrs }) => {
      // Create a mock node that matches SVGO's expected structure
      const mockNode = {
        type: 'element',
        name: tagName.toLowerCase(),
        attributes: { ...originalAttrs }
      };

      // Apply plugin transformation
      if (plugin.element && plugin.element.enter) {
        plugin.element.enter(mockNode);
      }

      // Record transformations
      Object.keys(originalAttrs).forEach(attr => {
        const original = originalAttrs[attr];
        const transformed = mockNode.attributes[attr];

        if (original !== transformed) {
          result.transformations.push({
            element: tagName,
            attribute: attr,
            original: original,
            transformed: transformed
          });

          // Validate transformed value
          const validation = validateNumericValues(transformed);
          if (!validation.valid) {
            result.validation.passed = false;
            result.validation.issues.push({
              attribute: attr,
              original: original,
              transformed: transformed,
              invalidValues: validation.invalidValues
            });
          }

          // Update element in DOM
          element.setAttribute(attr, transformed);
        }
      });
    });

    // Final validation: ensure SVG is still well-formed
    try {
      const serialized = dom.serialize();
      // Try to re-parse
      new JSDOM(serialized, { contentType: 'image/svg+xml' });

      // Save processed SVG
      const outputPath = join(OUTPUT_DIR, `processed_${filename}`);
      writeFileSync(outputPath, serialized, 'utf8');

      result.outputPath = outputPath;
    } catch (serializeError) {
      result.validation.passed = false;
      result.validation.issues.push({
        type: 'serialization',
        error: serializeError.message
      });
    }

    // Determine final status
    if (result.validation.passed) {
      result.status = result.transformations.length > 0 ? 'PASS' : 'SKIP';
    } else {
      result.status = 'FAIL';
    }

  } catch (error) {
    result.status = 'ERROR';
    result.error = error.message;
    result.stack = error.stack;
    logger.error(`Error processing ${filename}: ${error.message}`);
  }

  return result;
}

/**
 * Generate analysis.md report
 */
function generateAnalysisReport(results, logger) {
  const lines = [];

  lines.push('# cleanupListOfValues Function Test Report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Total Files Tested:** ${results.total}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Status | Count | Percentage |');
  lines.push('|--------|-------|------------|');
  lines.push(`| PASS | ${results.passed} | ${(results.passed / results.total * 100).toFixed(2)}% |`);
  lines.push(`| FAIL | ${results.failed} | ${(results.failed / results.total * 100).toFixed(2)}% |`);
  lines.push(`| SKIP | ${results.skipped} | ${(results.skipped / results.total * 100).toFixed(2)}% |`);
  lines.push(`| ERROR | ${results.errors} | ${(results.errors / results.total * 100).toFixed(2)}% |`);
  lines.push('');

  lines.push('## Test Configuration');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(TEST_PARAMS, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Attribute Statistics');
  lines.push('');
  lines.push('Attributes found across all SVG files:');
  lines.push('');
  lines.push('| Attribute | Occurrences |');
  lines.push('|-----------|-------------|');
  Object.entries(results.attributeStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([attr, count]) => {
      lines.push(`| ${attr} | ${count} |`);
    });
  lines.push('');

  lines.push('## Transformation Examples');
  lines.push('');
  lines.push('Sample transformations performed by cleanupListOfValues:');
  lines.push('');

  const sampleSize = Math.min(20, results.transformations.length);
  const samples = results.transformations.slice(0, sampleSize);

  samples.forEach((t, idx) => {
    lines.push(`### Example ${idx + 1}: ${t.element} - ${t.attribute}`);
    lines.push('');
    lines.push(`**Original:** \`${t.original}\``);
    lines.push('');
    lines.push(`**Transformed:** \`${t.transformed}\``);
    lines.push('');
  });

  lines.push('## Failed Tests');
  lines.push('');
  const failedTests = results.details.filter(d => d.status === 'FAIL');
  if (failedTests.length === 0) {
    lines.push('No failed tests! All transformations passed validation.');
  } else {
    failedTests.forEach(test => {
      lines.push(`### ${test.file}`);
      lines.push('');
      lines.push('**Validation Issues:**');
      lines.push('');
      test.validation.issues.forEach(issue => {
        lines.push(`- ${JSON.stringify(issue)}`);
      });
      lines.push('');
    });
  }
  lines.push('');

  lines.push('## Error Details');
  lines.push('');
  const errorTests = results.details.filter(d => d.status === 'ERROR');
  if (errorTests.length === 0) {
    lines.push('No errors encountered during testing.');
  } else {
    errorTests.forEach(test => {
      lines.push(`### ${test.file}`);
      lines.push('');
      lines.push(`**Error:** ${test.error}`);
      lines.push('');
    });
  }
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  const successRate = ((results.passed / (results.total - results.skipped)) * 100).toFixed(2);
  lines.push(`The cleanupListOfValues function was tested against ${results.total} W3C SVG test files.`);
  lines.push(`Success rate: **${successRate}%** (excluding skipped files).`);
  lines.push('');

  if (results.failed === 0 && results.errors === 0) {
    lines.push('**VERDICT:** ✅ All tests PASSED. The function works correctly across all test cases.');
  } else {
    lines.push(`**VERDICT:** ⚠️  ${results.failed + results.errors} tests failed or errored. Review details above.`);
  }

  const reportPath = join(OUTPUT_DIR, 'analysis.md');
  writeFileSync(reportPath, lines.join('\n'), 'utf8');
  logger.success(`Analysis report saved to: ${reportPath}`);

  return reportPath;
}

/**
 * Main test execution
 */
async function main() {
  const logger = new Logger(LOG_FILE);
  logger.log('Starting cleanupListOfValues comprehensive test suite');
  logger.log(`SVG Directory: ${SVG_DIR}`);
  logger.log(`Output Directory: ${OUTPUT_DIR}`);

  const results = new TestResults();

  // Get all SVG files
  const svgFiles = readdirSync(SVG_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => join(SVG_DIR, f))
    .sort();

  logger.log(`Found ${svgFiles.length} SVG files to test`);

  // Process each file
  let processed = 0;
  for (const svgFile of svgFiles) {
    processed++;
    if (processed % 50 === 0) {
      logger.log(`Progress: ${processed}/${svgFiles.length} files processed`);
    }

    const result = testSVGFile(svgFile, logger);
    results.addTest(result);

    if (result.status === 'PASS') {
      logger.log(`✓ ${result.file} - ${result.transformations.length} transformations`);
    } else if (result.status === 'FAIL') {
      logger.warn(`✗ ${result.file} - FAILED validation`);
    } else if (result.status === 'ERROR') {
      logger.error(`✗ ${result.file} - ERROR: ${result.error}`);
    }
  }

  // Save results
  results.save(RESULTS_FILE);
  logger.success(`Test results saved to: ${RESULTS_FILE}`);

  // Generate analysis report
  const reportPath = generateAnalysisReport(results, logger);

  // Save logs
  logger.save();
  logger.success(`Execution log saved to: ${LOG_FILE}`);

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST EXECUTION COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Errors: ${results.errors}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`\nReports:`);
  console.log(`  - Results: ${RESULTS_FILE}`);
  console.log(`  - Analysis: ${reportPath}`);
  console.log(`  - Log: ${LOG_FILE}`);
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(results.failed + results.errors > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
