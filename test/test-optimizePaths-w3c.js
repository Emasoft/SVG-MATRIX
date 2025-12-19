/**
 * Test optimizePaths function against all 525 W3C SVG test files
 *
 * This script:
 * 1. Processes all SVG files from /tmp/svg11_w3c_test_suite/svg/
 * 2. Applies optimizePaths to each file
 * 3. Validates the output
 * 4. Saves results to /tmp/svg-function-tests/optimizePaths/
 * 5. Generates analysis.md with PASS/FAIL summary
 *
 * Usage: node test/test-optimizePaths-w3c.js
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { optimizePaths } from '../src/svg-toolbox.js';

// Configuration
const INPUT_DIR = '/tmp/svg11_w3c_test_suite/svg/';
const OUTPUT_DIR = '/tmp/svg-function-tests/optimizePaths/';
const OUTPUTS_DIR = path.join(OUTPUT_DIR, 'outputs');
const LOGS_DIR = path.join(OUTPUT_DIR, 'logs');
const ANALYSIS_FILE = path.join(OUTPUT_DIR, 'analysis.md');

// Test options for optimizePaths
const OPTIMIZE_OPTIONS = {
  floatPrecision: 3,
  straightCurves: true,
  lineShorthands: true,
  convertToZ: true,
  utilizeAbsolute: true,
  straightTolerance: 0.5
};

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Validate SVG document structure
 */
function validateSVG(doc, filename) {
  const errors = [];

  try {
    // Check if document exists
    if (!doc) {
      errors.push('Document is null or undefined');
      return errors;
    }

    // Check for root SVG element
    const svgElement = doc.documentElement || doc.querySelector('svg');
    if (!svgElement) {
      errors.push('No SVG root element found');
      return errors;
    }

    // Check if it's actually an SVG element
    if (svgElement.tagName.toLowerCase() !== 'svg') {
      errors.push(`Root element is ${svgElement.tagName}, not svg`);
    }

    // Check for basic structure
    const allElements = doc.getElementsByTagName('*');
    if (allElements.length === 0) {
      errors.push('SVG document is empty');
    }

    // Check for path elements (if any existed before)
    const paths = doc.getElementsByTagName('path');

    // Validate path data if paths exist
    for (let i = 0; i < paths.length; i++) {
      const d = paths[i].getAttribute('d');
      if (d !== null && d !== undefined && d !== '') {
        // Basic validation: check if d attribute has valid path commands
        const hasValidCommands = /[MmLlHhVvCcSsQqTtAaZz]/.test(d);
        if (!hasValidCommands) {
          errors.push(`Path ${i} has invalid d attribute: "${d.substring(0, 50)}..."`);
        }
      }
    }

  } catch (err) {
    errors.push(`Validation error: ${err.message}`);
  }

  return errors;
}

/**
 * Test a single SVG file
 */
async function testFile(filename) {
  const result = {
    filename,
    status: 'UNKNOWN',
    originalSize: 0,
    optimizedSize: 0,
    pathsBefore: 0,
    pathsAfter: 0,
    timeTaken: 0,
    error: null,
    warnings: [],
    savings: 0,
    percentReduction: 0
  };

  const startTime = Date.now();

  try {
    // Read original file
    const inputPath = path.join(INPUT_DIR, filename);
    const originalContent = fs.readFileSync(inputPath, 'utf8');
    result.originalSize = Buffer.byteLength(originalContent, 'utf8');

    // Parse SVG
    let doc;
    try {
      doc = parseSVG(originalContent);
    } catch (parseErr) {
      result.status = 'FAIL';
      result.error = `Parse error: ${parseErr.message}`;
      return result;
    }

    // Count paths before
    result.pathsBefore = doc.getElementsByTagName('path').length;

    // Validate before optimization
    const beforeErrors = validateSVG(doc, filename);
    if (beforeErrors.length > 0) {
      result.warnings.push(`Pre-optimization validation: ${beforeErrors.join(', ')}`);
    }

    // Apply optimizePaths
    try {
      await optimizePaths(doc, OPTIMIZE_OPTIONS);
    } catch (optimizeErr) {
      result.status = 'FAIL';
      result.error = `Optimization error: ${optimizeErr.message}`;
      result.timeTaken = Date.now() - startTime;
      return result;
    }

    // Count paths after
    result.pathsAfter = doc.getElementsByTagName('path').length;

    // Validate after optimization
    const afterErrors = validateSVG(doc, filename);
    if (afterErrors.length > 0) {
      result.status = 'FAIL';
      result.error = `Post-optimization validation failed: ${afterErrors.join(', ')}`;
      result.timeTaken = Date.now() - startTime;
      return result;
    }

    // Serialize optimized SVG
    let optimizedContent;
    try {
      optimizedContent = serializeSVG(doc);
      result.optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
    } catch (serializeErr) {
      result.status = 'FAIL';
      result.error = `Serialization error: ${serializeErr.message}`;
      result.timeTaken = Date.now() - startTime;
      return result;
    }

    // Calculate savings
    result.savings = result.originalSize - result.optimizedSize;
    if (result.originalSize > 0) {
      result.percentReduction = ((result.savings / result.originalSize) * 100).toFixed(2);
    }

    // Save optimized file
    const outputPath = path.join(OUTPUTS_DIR, filename);
    fs.writeFileSync(outputPath, optimizedContent, 'utf8');

    // Check if paths were preserved
    if (result.pathsBefore !== result.pathsAfter) {
      result.warnings.push(`Path count changed: ${result.pathsBefore} -> ${result.pathsAfter}`);
    }

    // Success!
    result.status = 'PASS';
    result.timeTaken = Date.now() - startTime;

  } catch (err) {
    result.status = 'FAIL';
    result.error = `Unexpected error: ${err.message}\n${err.stack}`;
    result.timeTaken = Date.now() - startTime;
  }

  return result;
}

/**
 * Generate analysis.md report
 */
function generateAnalysis(results) {
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimizedSize = results.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalSavings = totalOriginalSize - totalOptimizedSize;
  const avgReduction = totalOriginalSize > 0
    ? ((totalSavings / totalOriginalSize) * 100).toFixed(2)
    : 0;
  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  let md = `# optimizePaths W3C SVG Test Suite Analysis\n\n`;
  md += `**Test Date:** ${new Date().toISOString()}\n\n`;
  md += `**Test Suite:** W3C SVG 1.1 Test Suite\n\n`;
  md += `**Function:** \`optimizePaths\`\n\n`;
  md += `**Options:**\n\`\`\`json\n${JSON.stringify(OPTIMIZE_OPTIONS, null, 2)}\n\`\`\`\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Files Tested | ${results.length} |\n`;
  md += `| ✅ Passed | ${passed.length} (${((passed.length / results.length) * 100).toFixed(1)}%) |\n`;
  md += `| ❌ Failed | ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%) |\n`;
  md += `| Original Size | ${formatSize(totalOriginalSize)} |\n`;
  md += `| Optimized Size | ${formatSize(totalOptimizedSize)} |\n`;
  md += `| Total Savings | ${formatSize(totalSavings)} (${avgReduction}%) |\n`;
  md += `| Total Time | ${(totalTime / 1000).toFixed(2)}s |\n`;
  md += `| Avg Time/File | ${(totalTime / results.length).toFixed(0)}ms |\n\n`;

  // Failures
  if (failed.length > 0) {
    md += `## Failures (${failed.length})\n\n`;
    md += `| File | Error | Time |\n`;
    md += `|------|-------|------|\n`;
    failed.forEach(r => {
      const errorMsg = (r.error || 'Unknown error').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md += `| ${r.filename} | ${errorMsg.substring(0, 100)} | ${r.timeTaken}ms |\n`;
    });
    md += `\n`;
  }

  // Warnings
  const withWarnings = results.filter(r => r.warnings.length > 0);
  if (withWarnings.length > 0) {
    md += `## Warnings (${withWarnings.length})\n\n`;
    md += `| File | Status | Warnings |\n`;
    md += `|------|--------|----------|\n`;
    withWarnings.forEach(r => {
      const warnings = r.warnings.join('; ').replace(/\|/g, '\\|');
      md += `| ${r.filename} | ${r.status} | ${warnings} |\n`;
    });
    md += `\n`;
  }

  // Top savings
  const bySavings = [...passed].sort((a, b) => b.savings - a.savings).slice(0, 20);
  if (bySavings.length > 0) {
    md += `## Top 20 Space Savings\n\n`;
    md += `| File | Original | Optimized | Saved | Reduction |\n`;
    md += `|------|----------|-----------|-------|----------|\n`;
    bySavings.forEach(r => {
      md += `| ${r.filename} | ${formatSize(r.originalSize)} | ${formatSize(r.optimizedSize)} | ${formatSize(r.savings)} | ${r.percentReduction}% |\n`;
    });
    md += `\n`;
  }

  // Detailed results
  md += `## All Results\n\n`;
  md += `| File | Status | Original | Optimized | Reduction | Paths | Time |\n`;
  md += `|------|--------|----------|-----------|-----------|-------|------|\n`;
  results.forEach(r => {
    const status = r.status === 'PASS' ? '✅' : '❌';
    md += `| ${r.filename} | ${status} | ${formatSize(r.originalSize)} | ${formatSize(r.optimizedSize)} | ${r.percentReduction}% | ${r.pathsBefore}→${r.pathsAfter} | ${r.timeTaken}ms |\n`;
  });
  md += `\n`;

  // Conclusion
  md += `## Conclusion\n\n`;
  if (failed.length === 0) {
    md += `✅ **ALL TESTS PASSED!** The \`optimizePaths\` function successfully processed all ${results.length} W3C SVG test files.\n\n`;
  } else {
    md += `⚠️ ${failed.length} of ${results.length} tests failed (${((failed.length / results.length) * 100).toFixed(1)}%).\n\n`;
  }

  md += `Average file size reduction: **${avgReduction}%**\n\n`;
  md += `Total processing time: **${(totalTime / 1000).toFixed(2)} seconds**\n\n`;

  return md;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  optimizePaths W3C SVG Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Ensure directories exist
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  // Get all SVG files
  const allFiles = fs.readdirSync(INPUT_DIR)
    .filter(f => f.endsWith('.svg'))
    .sort();

  console.log(`Found ${allFiles.length} SVG files in ${INPUT_DIR}\n`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);
  console.log('Starting tests...\n');

  const results = [];
  const totalFiles = allFiles.length;
  let processed = 0;
  let passed = 0;
  let failed = 0;

  // Process each file
  for (const filename of allFiles) {
    processed++;
    const progress = ((processed / totalFiles) * 100).toFixed(1);

    process.stdout.write(`\r[${progress}%] Testing ${processed}/${totalFiles}: ${filename.padEnd(50).substring(0, 50)}`);

    const result = await testFile(filename);
    results.push(result);

    if (result.status === 'PASS') {
      passed++;
    } else {
      failed++;
      // Log failures immediately
      const logFile = path.join(LOGS_DIR, `${filename}.error.log`);
      fs.writeFileSync(logFile, JSON.stringify(result, null, 2), 'utf8');
    }
  }

  console.log('\n\nTests complete!\n');

  // Generate analysis
  console.log('Generating analysis report...\n');
  const analysis = generateAnalysis(results);
  fs.writeFileSync(ANALYSIS_FILE, analysis, 'utf8');

  // Save detailed results as JSON
  const jsonFile = path.join(OUTPUT_DIR, 'results.json');
  fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2), 'utf8');

  // Print summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total Files:  ${totalFiles}`);
  console.log(`✅ Passed:    ${passed} (${((passed / totalFiles) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed:    ${failed} (${((failed / totalFiles) * 100).toFixed(1)}%)`);
  console.log();
  console.log(`Analysis saved to: ${ANALYSIS_FILE}`);
  console.log(`Detailed JSON:     ${jsonFile}`);
  console.log(`Optimized files:   ${OUTPUTS_DIR}/`);
  console.log(`Error logs:        ${LOGS_DIR}/`);
  console.log();
  console.log('═══════════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error('\n❌ Fatal error:', err);
  console.error(err.stack);
  process.exit(1);
});
