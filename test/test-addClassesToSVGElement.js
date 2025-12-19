#!/usr/bin/env node

/**
 * Test script for addClassesToSVGElement function
 * Tests against all 525 W3C SVG test files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSvg } from '../svgo_shallow/lib/parser.js';
import { stringifySvg } from '../svgo_shallow/lib/stringifier.js';
import { fn as addClassesToSVGElement } from '../svgo_shallow/plugins/addClassesToSVGElement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SVG_INPUT_DIR = path.join(__dirname, '..', 'SVG 1.1 W3C Test Suit', 'svg');
const OUTPUT_DIR = '/tmp/svg-function-tests/addClassesToSVGElement';
const TEST_CLASSES = ['test-class', 'processed'];
const LOG_FILE = path.join(OUTPUT_DIR, 'test-execution.log');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'test-results.json');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Initialize log file
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  logStream.write(logMessage);
  console.log(message);
}

/**
 * Apply the addClassesToSVGElement plugin to an AST
 */
function applyPlugin(ast, classes) {
  const params = { classNames: classes };
  const info = {};

  // Get the plugin visitor
  const visitor = addClassesToSVGElement(ast, params, info);

  if (!visitor) {
    throw new Error('Plugin returned null - invalid parameters');
  }

  // Apply the visitor to all elements
  function traverse(node, parent) {
    if (node.type === 'element') {
      if (visitor.element && visitor.element.enter) {
        visitor.element.enter(node, parent || { type: 'root' });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, node);
      }
    }
  }

  traverse(ast);
  return ast;
}

/**
 * Validate that SVG is well-formed after processing
 */
function validateSVG(svgString) {
  try {
    // Try to parse it again
    parseSvg(svgString);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Check if classes were added correctly
 */
function checkClassesAdded(ast, expectedClasses) {
  // Find the root SVG element
  for (const child of ast.children) {
    if (child.type === 'element' && child.name === 'svg') {
      const classAttr = child.attributes.class;

      if (!classAttr) {
        return { success: false, reason: 'No class attribute found on SVG element' };
      }

      const classes = classAttr.split(' ').filter(c => c.trim() !== '');
      const hasAllClasses = expectedClasses.every(expectedClass =>
        classes.includes(expectedClass)
      );

      if (!hasAllClasses) {
        return {
          success: false,
          reason: `Missing expected classes. Found: [${classes.join(', ')}], Expected: [${expectedClasses.join(', ')}]`
        };
      }

      return { success: true, classes };
    }
  }

  return { success: false, reason: 'No SVG root element found' };
}

/**
 * Test a single SVG file
 */
function testSVGFile(filePath, fileName) {
  const result = {
    file: fileName,
    status: 'UNKNOWN',
    originalSize: 0,
    processedSize: 0,
    classesAdded: [],
    error: null,
    validationError: null
  };

  try {
    // Read original SVG
    const originalSVG = fs.readFileSync(filePath, 'utf-8');
    result.originalSize = originalSVG.length;

    // Parse SVG
    const ast = parseSvg(originalSVG, filePath);

    // Apply plugin
    const modifiedAst = applyPlugin(ast, TEST_CLASSES);

    // Check if classes were added
    const classCheck = checkClassesAdded(modifiedAst, TEST_CLASSES);
    if (!classCheck.success) {
      result.status = 'FAIL';
      result.error = classCheck.reason;
      log(`  ✗ ${fileName}: ${classCheck.reason}`);
      return result;
    }

    result.classesAdded = classCheck.classes;

    // Serialize back to string
    const processedSVG = stringifySvg(modifiedAst);
    result.processedSize = processedSVG.length;

    // Validate the output is still valid SVG
    const validation = validateSVG(processedSVG);
    if (!validation.valid) {
      result.status = 'FAIL';
      result.validationError = validation.error;
      log(`  ✗ ${fileName}: Output SVG is invalid - ${validation.error}`);
      return result;
    }

    // Save processed SVG
    const outputPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(outputPath, processedSVG);

    result.status = 'PASS';
    log(`  ✓ ${fileName}: PASS (${result.originalSize} → ${result.processedSize} bytes, classes: ${result.classesAdded.join(', ')})`);

  } catch (error) {
    result.status = 'ERROR';
    result.error = error.message;
    log(`  ✗ ${fileName}: ERROR - ${error.message}`);
  }

  return result;
}

/**
 * Main test execution
 */
async function runTests() {
  log('='.repeat(80));
  log('Testing addClassesToSVGElement against W3C SVG Test Suite');
  log('='.repeat(80));
  log(`Input directory: ${SVG_INPUT_DIR}`);
  log(`Output directory: ${OUTPUT_DIR}`);
  log(`Test classes: [${TEST_CLASSES.join(', ')}]`);
  log('');

  // Get all SVG files
  const files = fs.readdirSync(SVG_INPUT_DIR)
    .filter(f => f.endsWith('.svg'))
    .sort();

  log(`Found ${files.length} SVG files to test`);
  log('');

  const results = [];
  const startTime = Date.now();

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(SVG_INPUT_DIR, fileName);

    if ((i + 1) % 50 === 0) {
      log(`Progress: ${i + 1}/${files.length} files processed...`);
    }

    const result = testSVGFile(filePath, fileName);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Calculate statistics
  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    errors: results.filter(r => r.status === 'ERROR').length,
    duration: duration
  };

  log('');
  log('='.repeat(80));
  log('Test Results Summary');
  log('='.repeat(80));
  log(`Total files:     ${stats.total}`);
  log(`Passed:          ${stats.passed} (${((stats.passed / stats.total) * 100).toFixed(2)}%)`);
  log(`Failed:          ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(2)}%)`);
  log(`Errors:          ${stats.errors} (${((stats.errors / stats.total) * 100).toFixed(2)}%)`);
  log(`Duration:        ${stats.duration}s`);
  log('='.repeat(80));

  // Save detailed results to JSON
  const detailedResults = {
    metadata: {
      testDate: new Date().toISOString(),
      svgInputDir: SVG_INPUT_DIR,
      outputDir: OUTPUT_DIR,
      testClasses: TEST_CLASSES,
      duration: stats.duration
    },
    statistics: stats,
    results: results
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(detailedResults, null, 2));
  log(`Detailed results saved to: ${RESULTS_FILE}`);

  // Generate analysis.md
  generateAnalysis(detailedResults);

  logStream.end();

  // Exit with appropriate code
  process.exit(stats.failed + stats.errors > 0 ? 1 : 0);
}

/**
 * Generate analysis.md report
 */
function generateAnalysis(detailedResults) {
  const { metadata, statistics, results } = detailedResults;

  const md = [];

  md.push('# addClassesToSVGElement Function Test Report\n');
  md.push('## Test Overview\n');
  md.push(`- **Test Date**: ${metadata.testDate}`);
  md.push(`- **Test Suite**: W3C SVG 1.1 Test Suite`);
  md.push(`- **Input Directory**: ${metadata.svgInputDir}`);
  md.push(`- **Output Directory**: ${metadata.outputDir}`);
  md.push(`- **Test Classes Applied**: [\`${metadata.testClasses.join('`, `')}\`]`);
  md.push(`- **Duration**: ${metadata.duration}s\n`);

  md.push('## Test Results Summary\n');
  md.push('| Metric | Count | Percentage |');
  md.push('|--------|-------|------------|');
  md.push(`| **Total Files** | ${statistics.total} | 100.00% |`);
  md.push(`| **Passed** | ${statistics.passed} | ${((statistics.passed / statistics.total) * 100).toFixed(2)}% |`);
  md.push(`| **Failed** | ${statistics.failed} | ${((statistics.failed / statistics.total) * 100).toFixed(2)}% |`);
  md.push(`| **Errors** | ${statistics.errors} | ${((statistics.errors / statistics.total) * 100).toFixed(2)}% |\n`);

  // Overall status
  const overallStatus = (statistics.failed + statistics.errors) === 0 ? '✅ **PASS**' : '❌ **FAIL**';
  md.push(`## Overall Status: ${overallStatus}\n`);

  // Failed tests details
  const failedTests = results.filter(r => r.status === 'FAIL');
  if (failedTests.length > 0) {
    md.push('## Failed Tests\n');
    md.push('| File | Reason |');
    md.push('|------|--------|');
    failedTests.forEach(test => {
      md.push(`| ${test.file} | ${test.error || test.validationError || 'Unknown'} |`);
    });
    md.push('');
  }

  // Error tests details
  const errorTests = results.filter(r => r.status === 'ERROR');
  if (errorTests.length > 0) {
    md.push('## Tests with Errors\n');
    md.push('| File | Error |');
    md.push('|------|-------|');
    errorTests.forEach(test => {
      md.push(`| ${test.file} | ${test.error || 'Unknown error'} |`);
    });
    md.push('');
  }

  // Sample of passed tests
  const passedTests = results.filter(r => r.status === 'PASS');
  if (passedTests.length > 0) {
    md.push('## Sample Passed Tests (first 20)\n');
    md.push('| File | Original Size | Processed Size | Classes Added |');
    md.push('|------|---------------|----------------|---------------|');
    passedTests.slice(0, 20).forEach(test => {
      md.push(`| ${test.file} | ${test.originalSize} bytes | ${test.processedSize} bytes | ${test.classesAdded.join(', ')} |`);
    });
    md.push('');
  }

  md.push('## Test Procedure\n');
  md.push('For each SVG file in the W3C test suite:\n');
  md.push('1. Read the original SVG file');
  md.push('2. Parse it using the SVGO parser (`parseSvg`)');
  md.push('3. Apply the `addClassesToSVGElement` plugin with test classes');
  md.push('4. Serialize back to string using the SVGO stringifier (`stringifySvg`)');
  md.push('5. Validate the output is still valid SVG by re-parsing');
  md.push('6. Check that the expected classes were added to the root `<svg>` element');
  md.push('7. Save the processed SVG to the output directory\n');

  md.push('## Function Tested\n');
  md.push('**Plugin**: `addClassesToSVGElement`');
  md.push('**Location**: `/Users/emanuelesabetta/Code/SVG-MATRIX/svgo_shallow/plugins/addClassesToSVGElement.js`');
  md.push('**Purpose**: Adds class names to the outer `<svg>` element\n');

  md.push('## Validation Criteria\n');
  md.push('A test passes if ALL of the following conditions are met:\n');
  md.push('- ✅ The SVG file can be successfully parsed');
  md.push('- ✅ The plugin executes without errors');
  md.push('- ✅ The expected classes are added to the root `<svg>` element');
  md.push('- ✅ The output is valid SVG (can be re-parsed successfully)');
  md.push('- ✅ The processed SVG can be saved to disk\n');

  md.push('## Output Files\n');
  md.push(`- **Processed SVG files**: ${metadata.outputDir}/*.svg`);
  md.push(`- **Detailed JSON results**: ${RESULTS_FILE}`);
  md.push(`- **Execution log**: ${LOG_FILE}`);
  md.push(`- **This analysis**: ${path.join(OUTPUT_DIR, 'analysis.md')}\n`);

  md.push('---\n');
  md.push(`*Generated on ${metadata.testDate}*\n`);

  const analysisPath = path.join(OUTPUT_DIR, 'analysis.md');
  fs.writeFileSync(analysisPath, md.join('\n'));
  log(`Analysis report saved to: ${analysisPath}`);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
