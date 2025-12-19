#!/usr/bin/env node
/**
 * Universal SVG Function Test Runner
 * Tests any svg-toolbox function against W3C SVG 1.1 or SVG 2.0 test suites.
 *
 * Usage:
 *   node tests/utils/svg-function-test-runner.mjs <functionName> [--suite svg11|svg2|all]
 *
 * Examples:
 *   node tests/utils/svg-function-test-runner.mjs optimize
 *   node tests/utils/svg-function-test-runner.mjs optimize --suite svg2
 *   node tests/utils/svg-function-test-runner.mjs optimize --suite all
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Parse arguments
const args = process.argv.slice(2);
const FUNCTION_NAME = args.find(a => !a.startsWith('--'));
const suiteArg = args.find(a => a.startsWith('--suite='))?.split('=')[1] ||
                 (args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'svg11');

if (!FUNCTION_NAME) {
  console.error('Usage: node svg-function-test-runner.mjs <functionName> [--suite svg11|svg2|all]');
  console.error('');
  console.error('Options:');
  console.error('  --suite svg11  Test against W3C SVG 1.1 suite (525 files) [default]');
  console.error('  --suite svg2   Test against SVG 2.0 suite (39 files)');
  console.error('  --suite all    Test against both suites');
  process.exit(1);
}

// Determine test suites to run
const suites = suiteArg === 'all' ? ['svg11', 'svg2'] : [suiteArg];

// Suite configurations
const SUITE_CONFIG = {
  svg11: {
    name: 'W3C SVG 1.1',
    dir: path.join(PROJECT_ROOT, 'tests/samples/svg11_w3c'),
    outputDir: path.join(PROJECT_ROOT, 'tests/results/svg11')
  },
  svg2: {
    name: 'SVG 2.0',
    dir: path.join(PROJECT_ROOT, 'tests/samples/svg2'),
    outputDir: path.join(PROJECT_ROOT, 'tests/results/svg2')
  }
};

// Import the function dynamically
let testFunction, parseSVG, serializeSVG;
try {
  const toolbox = await import(path.join(PROJECT_ROOT, 'src/svg-toolbox.js'));
  const parser = await import(path.join(PROJECT_ROOT, 'src/svg-parser.js'));

  testFunction = toolbox[FUNCTION_NAME];
  parseSVG = parser.parseSVG;
  serializeSVG = parser.serializeSVG;

  if (!testFunction) {
    console.error(`Function "${FUNCTION_NAME}" not found in svg-toolbox.js`);
    const funcs = Object.keys(toolbox).filter(k => typeof toolbox[k] === 'function');
    console.error(`Available functions (${funcs.length}):`, funcs.join(', '));
    process.exit(1);
  }
} catch (e) {
  console.error('Failed to import modules:', e.message);
  process.exit(1);
}

// Validation functions
function extractIds(svg) {
  const ids = new Set();
  const idRegex = /\bid=["']([^"']+)["']/g;
  let match;
  while ((match = idRegex.exec(svg)) !== null) ids.add(match[1]);
  return ids;
}

function extractReferences(svg) {
  const refs = [];
  // url(#id) references
  const urlRegex = /url\(\s*["']?#([^"')]+)["']?\s*\)/g;
  let match;
  while ((match = urlRegex.exec(svg)) !== null) refs.push({ type: 'url', id: match[1] });
  // href="#id" and xlink:href="#id" references
  const hrefRegex = /(?:xlink:)?href=["']#([^"']+)["']/g;
  while ((match = hrefRegex.exec(svg)) !== null) refs.push({ type: 'href', id: match[1] });
  return refs;
}

function validateSVGOutput(original, processed, filename) {
  const errors = [];
  const warnings = [];

  // 1. Check for undefined/null/NaN corruption
  const origHasUndefined = original.includes('undefined');
  const procHasUndefined = processed.includes('undefined');
  if (procHasUndefined && !origHasUndefined) {
    errors.push('CRITICAL: Introduced "undefined" string - ZERO TOLERANCE VIOLATION');
  }

  const origNullPattern = />null<|="null"/gi;
  const procNullPattern = />null<|="null"/gi;
  const origHasNull = origNullPattern.test(original);
  const procHasNull = procNullPattern.test(processed);
  if (procHasNull && !origHasNull) {
    errors.push('CRITICAL: Introduced "null" value - ZERO TOLERANCE VIOLATION');
  }

  const origNaNPattern = /="NaN"|>NaN</;
  const procNaNPattern = /="NaN"|>NaN</;
  if (procNaNPattern.test(processed) && !origNaNPattern.test(original)) {
    errors.push('CRITICAL: Introduced "NaN" value - ZERO TOLERANCE VIOLATION');
  }

  // 2. XML structure check (strip comments/CDATA first)
  const stripNonElements = (str) => str
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  const origStripped = stripNonElements(original);
  const procStripped = stripNonElements(processed);

  const origOpenTags = (origStripped.match(/<[a-zA-Z][^/>]*(?<!\/)\s*>/g) || []).length;
  const origCloseTags = (origStripped.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
  const origBalance = Math.abs(origOpenTags - origCloseTags);

  const procOpenTags = (procStripped.match(/<[a-zA-Z][^/>]*(?<!\/)\s*>/g) || []).length;
  const procCloseTags = (procStripped.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
  const procBalance = Math.abs(procOpenTags - procCloseTags);

  if (procBalance > origBalance) {
    errors.push(`CRITICAL: XML structure degraded (original balance: ${origBalance}, now: ${procBalance})`);
  }

  // 3. Check SVG namespace preservation
  if (!processed.includes('xmlns="http://www.w3.org/2000/svg"') &&
      !processed.includes("xmlns='http://www.w3.org/2000/svg'") &&
      original.includes('xmlns="http://www.w3.org/2000/svg"')) {
    errors.push('Lost SVG namespace declaration');
  }

  // 4. Check xlink namespace if xlink: attributes exist
  if (/xlink:[a-z]+=/i.test(processed) && !processed.includes('xmlns:xlink=')) {
    errors.push('xlink: attributes used but xmlns:xlink not declared');
  }

  // 5. Check reference integrity
  const processedIds = extractIds(processed);
  const processedRefs = extractReferences(processed);
  const originalIds = extractIds(original);
  const originalRefs = extractReferences(original);
  const originalBroken = originalRefs.filter(r => !originalIds.has(r.id));
  const brokenRefs = processedRefs.filter(r => !processedIds.has(r.id));
  const newBrokenRefs = brokenRefs.filter(r => !originalBroken.some(ob => ob.id === r.id));

  if (newBrokenRefs.length > 0) {
    errors.push(`Created broken references: ${newBrokenRefs.map(r => `${r.type}(#${r.id})`).join(', ')}`);
  }

  // 6. Check SVG root element preserved
  if (!/<svg[\s>]/i.test(processed)) {
    errors.push('SVG root element missing');
  }

  // 7. Check for empty output
  if (processed.trim().length < 50) {
    errors.push(`Output suspiciously small: ${processed.length} bytes`);
  }

  // Pre-existing issues in original (warn but don't fail)
  if (originalBroken.length > 0) {
    warnings.push(`Pre-existing broken refs in original: ${originalBroken.map(r => r.id).join(', ')}`);
  }

  return { errors, warnings };
}

async function testFile(filepath, outputDir) {
  const filename = path.basename(filepath);
  const result = {
    filename,
    filepath,
    status: 'unknown',
    errors: [],
    warnings: [],
    processingTime: 0,
    inputSize: 0,
    outputSize: 0
  };

  const startTime = Date.now();

  try {
    const original = fs.readFileSync(filepath, 'utf-8');
    result.inputSize = original.length;

    // Apply function
    const processed = await testFunction(original);

    // Get output string
    let outputStr;
    if (typeof processed === 'string') {
      outputStr = processed;
    } else if (processed && typeof processed.serialize === 'function') {
      outputStr = serializeSVG(processed);
    } else if (processed && processed.documentElement) {
      outputStr = processed.documentElement.outerHTML;
    } else {
      throw new Error(`Unexpected return type: ${typeof processed} (${processed?.constructor?.name})`);
    }

    result.outputSize = outputStr.length;
    result.processingTime = Date.now() - startTime;

    // Validate output
    const validation = validateSVGOutput(original, outputStr, filename);
    result.errors = validation.errors;
    result.warnings = validation.warnings;

    if (validation.errors.length === 0) {
      result.status = 'PASS';
      fs.writeFileSync(path.join(outputDir, 'passed', filename), outputStr);
    } else {
      result.status = 'FAIL';
      fs.writeFileSync(path.join(outputDir, 'failed', filename), outputStr);
      fs.writeFileSync(path.join(outputDir, 'failed', `${filename}.errors.txt`),
        `Validation Errors:\n${validation.errors.join('\n')}\n\nWarnings:\n${validation.warnings.join('\n')}`);
    }
  } catch (error) {
    result.status = 'ERROR';
    result.errors = [error.message];
    result.processingTime = Date.now() - startTime;
    fs.writeFileSync(path.join(outputDir, 'failed', `${filename}.error.txt`),
      `Error: ${error.message}\n\nStack:\n${error.stack}`);
  }

  return result;
}

async function runSuite(suiteName) {
  const config = SUITE_CONFIG[suiteName];
  const outputDir = path.join(config.outputDir, FUNCTION_NAME);

  // Create output directories
  fs.mkdirSync(path.join(outputDir, 'passed'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'failed'), { recursive: true });

  const results = {
    timestamp: new Date().toISOString(),
    function: FUNCTION_NAME,
    suite: config.name,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    validationFailures: [],
    stats: {
      avgProcessingTime: 0,
      totalProcessingTime: 0
    }
  };

  const files = fs.readdirSync(config.dir)
    .filter(f => f.endsWith('.svg') && !f.endsWith('.svgz'))
    .sort();

  results.total = files.length;

  console.log(`\nTesting ${FUNCTION_NAME} against ${config.name} (${files.length} files)...`);

  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await testFile(path.join(config.dir, file), outputDir);

    if (result.status === 'PASS') {
      results.passed++;
    } else if (result.status === 'ERROR') {
      results.failed++;
      results.errors.push({
        file: result.filename,
        type: 'ERROR',
        message: result.errors[0]
      });
    } else {
      results.failed++;
      results.validationFailures.push({
        file: result.filename,
        errors: result.errors,
        warnings: result.warnings
      });
    }

    results.stats.totalProcessingTime += result.processingTime;

    // Progress every 100 files or at end
    if ((i + 1) % 100 === 0 || i === files.length - 1) {
      const pct = ((i + 1) / files.length * 100).toFixed(1);
      process.stdout.write(`\r  [${pct}%] ${results.passed} passed, ${results.failed} failed (${i + 1}/${files.length})`);
    }
  }

  results.stats.avgProcessingTime = results.stats.totalProcessingTime / results.total;
  results.stats.totalDuration = Date.now() - startTime;

  // Write JSON results
  fs.writeFileSync(path.join(outputDir, 'test-report.json'), JSON.stringify(results, null, 2));

  console.log(''); // newline after progress
  const passRate = (results.passed / results.total * 100).toFixed(2);
  console.log(`  Result: ${results.passed}/${results.total} (${passRate}%) - ${results.failed === 0 ? 'PASS' : 'FAIL'}`);

  return results;
}

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SVG-MATRIX Function Tester: ${FUNCTION_NAME}`);
  console.log(`${'='.repeat(70)}`);

  const allResults = [];

  for (const suite of suites) {
    if (!SUITE_CONFIG[suite]) {
      console.error(`Unknown suite: ${suite}. Use 'svg11', 'svg2', or 'all'.`);
      process.exit(1);
    }
    const results = await runSuite(suite);
    allResults.push(results);
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);

  let totalPassed = 0, totalFailed = 0, totalTests = 0;
  for (const r of allResults) {
    console.log(`  ${r.suite}: ${r.passed}/${r.total} (${(r.passed/r.total*100).toFixed(2)}%)`);
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalTests += r.total;
  }

  if (allResults.length > 1) {
    console.log(`  TOTAL: ${totalPassed}/${totalTests} (${(totalPassed/totalTests*100).toFixed(2)}%)`);
  }

  console.log(`${'='.repeat(70)}\n`);

  // Exit with error code if any failed
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
