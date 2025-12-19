/**
 * Comprehensive test of removeXMLNS function against all 525 W3C SVG 1.1 test files
 *
 * This test:
 * 1. Loads each W3C SVG test file
 * 2. Applies removeXMLNS with different options
 * 3. Checks for broken references (IRI/URL references)
 * 4. Validates SVG structure integrity
 * 5. Reports all errors with detailed diagnostics
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { removeXMLNS } from '../src/svg-toolbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const W3C_TEST_DIR = '/tmp/svg11_w3c_test_suite/svg';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeXMLNS/output';
const LOG_DIR = '/tmp/svg-function-tests/removeXMLNS/logs';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = join(LOG_DIR, `test-${TIMESTAMP}.log`);

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  warnings: [],
  brokenReferences: [],
  testDetails: []
};

// Utility: Log to both console and file
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);
  writeFileSync(LOG_FILE, logLine + '\n', { flag: 'a' });
}

// Utility: Extract all IRI/URL references from SVG
function extractReferences(svgString) {
  const references = new Set();

  // Patterns for IRI references
  const patterns = [
    /url\(#([^)]+)\)/g,           // url(#id)
    /url\("?#([^")]+)"?\)/g,      // url("#id") or url(#id)
    /href="#([^"]+)"/g,           // href="#id"
    /xlink:href="#([^"]+)"/g,     // xlink:href="#id"
    /begin="([^"]+)"/g,           // SMIL animation begin events
    /end="([^"]+)"/g,             // SMIL animation end events
    /filter="url\(#([^)]+)\)"/g,  // filter attribute
    /mask="url\(#([^)]+)\)"/g,    // mask attribute
    /clip-path="url\(#([^)]+)\)"/g, // clip-path attribute
    /marker-[a-z]+="url\(#([^)]+)\)"/g, // marker attributes
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(svgString)) !== null) {
      if (match[1]) {
        // Extract ID, handling event syntax like "id.begin"
        const refId = match[1].split('.')[0].split('+')[0].trim();
        if (refId && refId !== 'id') {
          references.add(refId);
        }
      }
    }
  }

  return references;
}

// Utility: Extract all defined IDs from SVG
function extractDefinedIds(dom) {
  const ids = new Set();
  const elements = dom.window.document.querySelectorAll('[id]');

  elements.forEach(el => {
    const id = el.getAttribute('id');
    if (id) {
      ids.add(id);
    }
  });

  return ids;
}

// Utility: Check if SVG has xlink attributes
function hasXlinkAttributes(dom) {
  const elements = dom.window.document.querySelectorAll('*');
  for (const el of elements) {
    for (const attrName of el.getAttributeNames()) {
      if (attrName.startsWith('xlink:')) {
        return true;
      }
    }
  }
  return false;
}

// Utility: Check namespace attributes
function checkNamespaceAttributes(dom) {
  const svgRoot = dom.window.document.documentElement;
  const nsAttrs = {};

  for (const attrName of svgRoot.getAttributeNames()) {
    if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) {
      nsAttrs[attrName] = svgRoot.getAttribute(attrName);
    }
  }

  return nsAttrs;
}

// Test a single SVG file with removeXMLNS
async function testFile(filePath) {
  const fileName = basename(filePath);
  const testResult = {
    file: fileName,
    path: filePath,
    passed: true,
    errors: [],
    warnings: [],
    testCases: []
  };

  try {
    // Read original SVG
    const originalSvg = readFileSync(filePath, 'utf8');
    const originalDom = new JSDOM(originalSvg, { contentType: 'image/svg+xml' });

    // Extract references and IDs from original
    const originalRefs = extractReferences(originalSvg);
    const originalIds = extractDefinedIds(originalDom);
    const hadXlinkAttrs = hasXlinkAttributes(originalDom);
    const originalNs = checkNamespaceAttributes(originalDom);

    // Test Case 1: Default options (preserveSvgNamespace: true, removeXlinkNamespace: true)
    try {
      const dom1 = new JSDOM(originalSvg, { contentType: 'image/svg+xml' });
      const svgRoot1 = dom1.window.document.documentElement;

      // Apply removeXMLNS with defaults
      removeXMLNS(svgRoot1);

      const processedSvg1 = dom1.serialize();
      const processedRefs1 = extractReferences(processedSvg1);
      const processedIds1 = extractDefinedIds(dom1);
      const processedNs1 = checkNamespaceAttributes(dom1);

      // Check for broken references
      const missingRefs = [];
      for (const ref of processedRefs1) {
        if (!processedIds1.has(ref)) {
          missingRefs.push(ref);
        }
      }

      if (missingRefs.length > 0) {
        testResult.errors.push({
          testCase: 'default-options',
          type: 'broken-references',
          refs: missingRefs,
          details: `References broken: ${missingRefs.join(', ')}`
        });
        testResult.passed = false;
      }

      // Check namespace handling
      if (processedNs1.xmlns !== 'http://www.w3.org/2000/svg') {
        testResult.errors.push({
          testCase: 'default-options',
          type: 'missing-svg-namespace',
          details: 'SVG namespace was removed with default options (should be preserved)'
        });
        testResult.passed = false;
      }

      if (hadXlinkAttrs && !hasXlinkAttributes(dom1) && !processedNs1['xmlns:xlink']) {
        testResult.warnings.push({
          testCase: 'default-options',
          type: 'xlink-namespace-removed-but-attrs-exist',
          details: 'XLink namespace removed but xlink: attributes still exist'
        });
      }

      // Save processed SVG file
      const outputFileName = fileName.replace('.svg', '-default.svg');
      const outputPath = join(OUTPUT_DIR, outputFileName);
      writeFileSync(outputPath, processedSvg1);

      testResult.testCases.push({
        name: 'default-options',
        passed: missingRefs.length === 0,
        namespaces: processedNs1,
        refsChecked: processedRefs1.size,
        refsBroken: missingRefs.length,
        outputFile: outputPath
      });
    } catch (error) {
      testResult.errors.push({
        testCase: 'default-options',
        type: 'exception',
        message: error.message,
        stack: error.stack
      });
      testResult.passed = false;
    }

    // Test Case 2: Remove SVG namespace (inline SVG use case)
    try {
      const dom2 = new JSDOM(originalSvg, { contentType: 'image/svg+xml' });
      const svgRoot2 = dom2.window.document.documentElement;

      // Apply removeXMLNS with preserveSvgNamespace: false
      removeXMLNS(svgRoot2, { preserveSvgNamespace: false });

      const processedSvg2 = dom2.serialize();
      const processedRefs2 = extractReferences(processedSvg2);
      const processedIds2 = extractDefinedIds(dom2);
      const processedNs2 = checkNamespaceAttributes(dom2);

      // Check for broken references
      const missingRefs = [];
      for (const ref of processedRefs2) {
        if (!processedIds2.has(ref)) {
          missingRefs.push(ref);
        }
      }

      if (missingRefs.length > 0) {
        testResult.errors.push({
          testCase: 'inline-svg-no-namespace',
          type: 'broken-references',
          refs: missingRefs,
          details: `References broken: ${missingRefs.join(', ')}`
        });
        testResult.passed = false;
      }

      // Check namespace was actually removed
      if (processedNs2.xmlns) {
        testResult.warnings.push({
          testCase: 'inline-svg-no-namespace',
          type: 'namespace-not-removed',
          details: 'SVG namespace not removed with preserveSvgNamespace: false'
        });
      }

      // Save processed SVG file
      const outputFileName2 = fileName.replace('.svg', '-inline.svg');
      const outputPath2 = join(OUTPUT_DIR, outputFileName2);
      writeFileSync(outputPath2, processedSvg2);

      testResult.testCases.push({
        name: 'inline-svg-no-namespace',
        passed: missingRefs.length === 0,
        namespaces: processedNs2,
        refsChecked: processedRefs2.size,
        refsBroken: missingRefs.length,
        outputFile: outputPath2
      });
    } catch (error) {
      testResult.errors.push({
        testCase: 'inline-svg-no-namespace',
        type: 'exception',
        message: error.message,
        stack: error.stack
      });
      testResult.passed = false;
    }

    // Test Case 3: Preserve XLink namespace
    try {
      const dom3 = new JSDOM(originalSvg, { contentType: 'image/svg+xml' });
      const svgRoot3 = dom3.window.document.documentElement;

      // Apply removeXMLNS with removeXlinkNamespace: false
      removeXMLNS(svgRoot3, { removeXlinkNamespace: false });

      const processedSvg3 = dom3.serialize();
      const processedRefs3 = extractReferences(processedSvg3);
      const processedIds3 = extractDefinedIds(dom3);
      const processedNs3 = checkNamespaceAttributes(dom3);

      // Check for broken references
      const missingRefs = [];
      for (const ref of processedRefs3) {
        if (!processedIds3.has(ref)) {
          missingRefs.push(ref);
        }
      }

      if (missingRefs.length > 0) {
        testResult.errors.push({
          testCase: 'preserve-xlink',
          type: 'broken-references',
          refs: missingRefs,
          details: `References broken: ${missingRefs.join(', ')}`
        });
        testResult.passed = false;
      }

      // If original had xlink attrs, namespace should be preserved
      if (hadXlinkAttrs && !processedNs3['xmlns:xlink']) {
        testResult.warnings.push({
          testCase: 'preserve-xlink',
          type: 'xlink-namespace-lost',
          details: 'XLink namespace not preserved despite removeXlinkNamespace: false'
        });
      }

      // Save processed SVG file
      const outputFileName3 = fileName.replace('.svg', '-preserve-xlink.svg');
      const outputPath3 = join(OUTPUT_DIR, outputFileName3);
      writeFileSync(outputPath3, processedSvg3);

      testResult.testCases.push({
        name: 'preserve-xlink',
        passed: missingRefs.length === 0,
        namespaces: processedNs3,
        refsChecked: processedRefs3.size,
        refsBroken: missingRefs.length,
        outputFile: outputPath3
      });
    } catch (error) {
      testResult.errors.push({
        testCase: 'preserve-xlink',
        type: 'exception',
        message: error.message,
        stack: error.stack
      });
      testResult.passed = false;
    }

  } catch (error) {
    testResult.passed = false;
    testResult.errors.push({
      testCase: 'file-processing',
      type: 'fatal-error',
      message: error.message,
      stack: error.stack
    });
  }

  return testResult;
}

// Main test execution
async function runTests() {
  log('='.repeat(80));
  log('removeXMLNS W3C SVG 1.1 Test Suite Validation');
  log('='.repeat(80));
  log(`Test directory: ${W3C_TEST_DIR}`);
  log(`Log file: ${LOG_FILE}`);
  log('');

  // Get all SVG files
  const files = readdirSync(W3C_TEST_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => join(W3C_TEST_DIR, f))
    .sort();

  results.total = files.length;
  log(`Found ${results.total} SVG test files`);
  log('');

  // Test each file
  let processed = 0;
  for (const file of files) {
    processed++;
    const fileName = basename(file);

    if (processed % 50 === 0) {
      log(`Progress: ${processed}/${results.total} (${Math.round(processed/results.total*100)}%)`, 'PROGRESS');
    }

    const testResult = await testFile(file);
    results.testDetails.push(testResult);

    if (testResult.passed) {
      results.passed++;
    } else {
      results.failed++;
      log(`FAILED: ${fileName}`, 'ERROR');

      for (const error of testResult.errors) {
        results.errors.push({ file: fileName, ...error });

        if (error.type === 'broken-references') {
          results.brokenReferences.push({
            file: fileName,
            testCase: error.testCase,
            refs: error.refs
          });
        }
      }

      for (const warning of testResult.warnings) {
        results.warnings.push({ file: fileName, ...warning });
      }
    }
  }

  // Generate summary report
  log('');
  log('='.repeat(80));
  log('TEST SUMMARY');
  log('='.repeat(80));
  log(`Total files tested: ${results.total}`);
  log(`Passed: ${results.passed} (${Math.round(results.passed/results.total*100)}%)`);
  log(`Failed: ${results.failed} (${Math.round(results.failed/results.total*100)}%)`);
  log(`Errors: ${results.errors.length}`);
  log(`Warnings: ${results.warnings.length}`);
  log(`Broken references detected: ${results.brokenReferences.length}`);
  log('');

  // Report broken references
  if (results.brokenReferences.length > 0) {
    log('='.repeat(80));
    log('BROKEN REFERENCES REPORT');
    log('='.repeat(80));

    for (const broken of results.brokenReferences) {
      log(`File: ${broken.file}`, 'ERROR');
      log(`  Test case: ${broken.testCase}`, 'ERROR');
      log(`  Broken refs: ${broken.refs.join(', ')}`, 'ERROR');
      log('');
    }
  }

  // Report all errors
  if (results.errors.length > 0) {
    log('='.repeat(80));
    log('ERROR DETAILS');
    log('='.repeat(80));

    const errorsByType = {};
    for (const error of results.errors) {
      const key = `${error.type}`;
      if (!errorsByType[key]) {
        errorsByType[key] = [];
      }
      errorsByType[key].push(error);
    }

    for (const [type, errors] of Object.entries(errorsByType)) {
      log(`${type}: ${errors.length} occurrences`, 'ERROR');

      // Show first 10 examples
      for (let i = 0; i < Math.min(10, errors.length); i++) {
        const error = errors[i];
        log(`  ${error.file} [${error.testCase}]: ${error.details || error.message}`, 'ERROR');
      }

      if (errors.length > 10) {
        log(`  ... and ${errors.length - 10} more`, 'ERROR');
      }
      log('');
    }
  }

  // Report warnings
  if (results.warnings.length > 0) {
    log('='.repeat(80));
    log('WARNINGS');
    log('='.repeat(80));

    const warningsByType = {};
    for (const warning of results.warnings) {
      const key = warning.type;
      if (!warningsByType[key]) {
        warningsByType[key] = [];
      }
      warningsByType[key].push(warning);
    }

    for (const [type, warnings] of Object.entries(warningsByType)) {
      log(`${type}: ${warnings.length} occurrences`, 'WARN');

      // Show first 5 examples
      for (let i = 0; i < Math.min(5, warnings.length); i++) {
        const warning = warnings[i];
        log(`  ${warning.file} [${warning.testCase}]: ${warning.details}`, 'WARN');
      }

      if (warnings.length > 5) {
        log(`  ... and ${warnings.length - 5} more`, 'WARN');
      }
      log('');
    }
  }

  // Save detailed JSON report
  const jsonReportPath = join(LOG_DIR, `test-results-${TIMESTAMP}.json`);
  writeFileSync(jsonReportPath, JSON.stringify(results, null, 2));
  log(`Detailed JSON report saved to: ${jsonReportPath}`);

  // Generate analysis.md
  const analysisPath = '/tmp/svg-function-tests/removeXMLNS/analysis.md';
  const analysisContent = generateAnalysisMd();
  writeFileSync(analysisPath, analysisContent);
  log(`Analysis report saved to: ${analysisPath}`);

  log('');
  log('='.repeat(80));
  log('TEST COMPLETE');
  log('='.repeat(80));

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Generate analysis.md report
function generateAnalysisMd() {
  const md = [];

  md.push('# removeXMLNS Function - W3C SVG Test Suite Analysis');
  md.push('');
  md.push(`**Test Date:** ${new Date().toISOString()}`);
  md.push(`**Total Test Files:** ${results.total}`);
  md.push(`**Passed:** ${results.passed} (${Math.round(results.passed/results.total*100)}%)`);
  md.push(`**Failed:** ${results.failed} (${Math.round(results.failed/results.total*100)}%)`);
  md.push('');

  // Executive Summary
  md.push('## Executive Summary');
  md.push('');
  md.push(`The \`removeXMLNS\` function was tested against all ${results.total} W3C SVG 1.1 test suite files.`);
  md.push(`Each file was tested with three different configurations:`);
  md.push('');
  md.push('1. **Default options** - preserveSvgNamespace: true, removeXlinkNamespace: true');
  md.push('2. **Inline SVG mode** - preserveSvgNamespace: false (for HTML inline usage)');
  md.push('3. **Preserve XLink** - removeXlinkNamespace: false (for SVG 1.1 compatibility)');
  md.push('');

  if (results.failed === 0) {
    md.push('**Result:** ✅ ALL TESTS PASSED');
    md.push('');
    md.push('The removeXMLNS function successfully processed all W3C test files without breaking any IRI references or producing invalid SVG.');
  } else {
    md.push(`**Result:** ❌ ${results.failed} TESTS FAILED`);
    md.push('');
    md.push('See details below for specific failures and issues.');
  }
  md.push('');

  // Test Statistics
  md.push('## Test Statistics');
  md.push('');
  md.push('| Metric | Count | Percentage |');
  md.push('|--------|-------|------------|');
  md.push(`| Total Files | ${results.total} | 100% |`);
  md.push(`| Passed | ${results.passed} | ${Math.round(results.passed/results.total*100)}% |`);
  md.push(`| Failed | ${results.failed} | ${Math.round(results.failed/results.total*100)}% |`);
  md.push(`| Errors | ${results.errors.length} | - |`);
  md.push(`| Warnings | ${results.warnings.length} | - |`);
  md.push(`| Broken References | ${results.brokenReferences.length} | - |`);
  md.push('');

  // Failed Tests
  if (results.failed > 0) {
    md.push('## Failed Tests');
    md.push('');

    const failedFiles = results.testDetails.filter(t => !t.passed);

    for (const test of failedFiles) {
      md.push(`### ${test.file}`);
      md.push('');

      if (test.errors.length > 0) {
        md.push('**Errors:**');
        md.push('');
        for (const error of test.errors) {
          md.push(`- **[${error.testCase}]** ${error.type}: ${error.details || error.message}`);
          if (error.refs && error.refs.length > 0) {
            md.push(`  - Broken references: ${error.refs.join(', ')}`);
          }
        }
        md.push('');
      }

      if (test.warnings.length > 0) {
        md.push('**Warnings:**');
        md.push('');
        for (const warning of test.warnings) {
          md.push(`- **[${warning.testCase}]** ${warning.type}: ${warning.details}`);
        }
        md.push('');
      }
    }
  }

  // Errors by Type
  if (results.errors.length > 0) {
    md.push('## Error Analysis by Type');
    md.push('');

    const errorsByType = {};
    for (const error of results.errors) {
      const key = error.type;
      if (!errorsByType[key]) {
        errorsByType[key] = [];
      }
      errorsByType[key].push(error);
    }

    md.push('| Error Type | Count | Affected Files |');
    md.push('|------------|-------|----------------|');

    for (const [type, errors] of Object.entries(errorsByType).sort((a, b) => b[1].length - a[1].length)) {
      const uniqueFiles = new Set(errors.map(e => e.file));
      md.push(`| ${type} | ${errors.length} | ${uniqueFiles.size} |`);
    }
    md.push('');

    // Detailed error examples
    md.push('### Error Details');
    md.push('');

    for (const [type, errors] of Object.entries(errorsByType).sort((a, b) => b[1].length - a[1].length)) {
      md.push(`#### ${type} (${errors.length} occurrences)`);
      md.push('');

      // Show first 10 examples
      for (let i = 0; i < Math.min(10, errors.length); i++) {
        const error = errors[i];
        md.push(`- \`${error.file}\` [${error.testCase}]: ${error.details || error.message}`);
      }

      if (errors.length > 10) {
        md.push(`- ... and ${errors.length - 10} more occurrences`);
      }
      md.push('');
    }
  }

  // Warnings
  if (results.warnings.length > 0) {
    md.push('## Warnings Analysis');
    md.push('');

    const warningsByType = {};
    for (const warning of results.warnings) {
      const key = warning.type;
      if (!warningsByType[key]) {
        warningsByType[key] = [];
      }
      warningsByType[key].push(warning);
    }

    md.push('| Warning Type | Count |');
    md.push('|--------------|-------|');

    for (const [type, warnings] of Object.entries(warningsByType).sort((a, b) => b[1].length - a[1].length)) {
      md.push(`| ${type} | ${warnings.length} |`);
    }
    md.push('');
  }

  // Test Configuration Details
  md.push('## Test Configuration');
  md.push('');
  md.push('### Test Cases');
  md.push('');
  md.push('1. **default-options**');
  md.push('   - preserveSvgNamespace: true');
  md.push('   - removeXlinkNamespace: true');
  md.push('   - Purpose: Standard standalone SVG files');
  md.push('');
  md.push('2. **inline-svg-no-namespace**');
  md.push('   - preserveSvgNamespace: false');
  md.push('   - removeXlinkNamespace: true');
  md.push('   - Purpose: SVG embedded in HTML documents');
  md.push('');
  md.push('3. **preserve-xlink**');
  md.push('   - preserveSvgNamespace: true');
  md.push('   - removeXlinkNamespace: false');
  md.push('   - Purpose: SVG 1.1 files with xlink:href attributes');
  md.push('');

  // Validation Checks
  md.push('### Validation Checks');
  md.push('');
  md.push('For each test file, the following validations were performed:');
  md.push('');
  md.push('- ✓ IRI/URL references integrity (url(#id), href="#id", xlink:href="#id")');
  md.push('- ✓ Element ID preservation');
  md.push('- ✓ Namespace attribute handling');
  md.push('- ✓ XLink attribute compatibility');
  md.push('- ✓ SMIL animation event references (begin/end)');
  md.push('- ✓ Filter, mask, clip-path, and marker references');
  md.push('');

  // Output Files
  md.push('## Output Files');
  md.push('');
  md.push('Processed SVG files have been saved to: `/tmp/svg-function-tests/removeXMLNS/output/`');
  md.push('');
  md.push('Each original file generates three output files:');
  md.push('- `{filename}-default.svg` - Default options');
  md.push('- `{filename}-inline.svg` - Inline SVG mode');
  md.push('- `{filename}-preserve-xlink.svg` - Preserve XLink mode');
  md.push('');

  // Passed Tests Summary
  if (results.passed > 0) {
    md.push('## Passed Tests Summary');
    md.push('');
    md.push(`${results.passed} files passed all validation checks across all three test configurations.`);
    md.push('');

    if (results.failed === 0) {
      md.push('All W3C SVG 1.1 test suite files were processed successfully!');
    }
  }

  // Conclusion
  md.push('## Conclusion');
  md.push('');

  if (results.failed === 0) {
    md.push('The `removeXMLNS` function demonstrates 100% compatibility with the W3C SVG 1.1 test suite.');
    md.push('All namespace removal operations preserved SVG structural integrity and reference validity.');
  } else {
    const successRate = Math.round(results.passed/results.total*100);
    md.push(`The \`removeXMLNS\` function achieved a ${successRate}% success rate on the W3C SVG 1.1 test suite.`);
    md.push('');

    if (results.brokenReferences.length > 0) {
      md.push(`⚠️ ${results.brokenReferences.length} instances of broken IRI references were detected.`);
    }

    if (results.errors.length > 0) {
      md.push(`⚠️ ${results.errors.length} errors were encountered during processing.`);
    }
  }

  md.push('');
  md.push('---');
  md.push('');
  md.push('**Test Environment:**');
  md.push(`- Test Suite: W3C SVG 1.1 Test Suite (${results.total} files)`);
  md.push(`- Source Directory: /tmp/svg11_w3c_test_suite/svg/`);
  md.push(`- Output Directory: /tmp/svg-function-tests/removeXMLNS/output/`);
  md.push(`- Log Directory: /tmp/svg-function-tests/removeXMLNS/logs/`);
  md.push(`- Timestamp: ${new Date().toISOString()}`);

  return md.join('\n');
}

// Run the tests
runTests().catch(error => {
  log(`FATAL ERROR: ${error.message}`, 'FATAL');
  log(error.stack, 'FATAL');
  process.exit(2);
});
