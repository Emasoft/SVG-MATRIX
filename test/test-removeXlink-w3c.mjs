/**
 * Comprehensive test of removeXlink function against all 525 W3C SVG 1.1 test files
 *
 * This test:
 * 1. Loads each W3C SVG test file
 * 2. Applies removeXlink function
 * 3. Validates that xlink:href attributes are preserved (SVG 1.1 compatibility)
 * 4. Validates that deprecated xlink attributes are properly converted/removed
 * 5. Checks for broken references (IRI/URL references)
 * 6. Validates SVG structure integrity and XML validity
 * 7. Saves processed files to output directory
 * 8. Reports all errors with detailed diagnostics
 *
 * Function behavior being tested:
 * - xlink:href → PRESERVED (SVG 1.1 compatibility requirement)
 * - xlink:show → converted to target attribute ("new" → "_blank", "replace" → "_self")
 * - xlink:title → converted to <title> child element (proper SVG tooltip)
 * - xlink:actuate, xlink:type, xlink:role, xlink:arcrole → removed (deprecated)
 * - xmlns:xlink namespace → removed ONLY if no xlink:* attributes remain
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { removeXlink } from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const W3C_TEST_DIR = '/tmp/svg11_w3c_test_suite/svg';
const OUTPUT_DIR = '/tmp/svg-function-tests/removeXlink/output';
const LOG_DIR = '/tmp/svg-function-tests/removeXlink/logs';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = join(LOG_DIR, `test-${TIMESTAMP}.log`);

// Ensure directories exist
try {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  // Directories may already exist
}

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  warnings: [],
  brokenReferences: [],
  xlinkAttributeStats: {
    totalXlinkHref: 0,
    totalXlinkShow: 0,
    totalXlinkTitle: 0,
    totalXlinkActuate: 0,
    totalXlinkType: 0,
    totalXlinkRole: 0,
    totalXlinkArcrole: 0,
    preservedXlinkHref: 0,
    convertedXlinkShow: 0,
    convertedXlinkTitle: 0,
    removedDeprecated: 0
  },
  namespaceStats: {
    hadXlinkNamespace: 0,
    removedXlinkNamespace: 0,
    preservedXlinkNamespace: 0
  },
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

  // Patterns for IRI references (only url() and href patterns, NOT timing values)
  const patterns = [
    /url\(#([^)]+)\)/g,           // url(#id)
    /url\("?#([^")]+)"?\)/g,      // url("#id") or url(#id)
    /href="#([^"]+)"/g,           // href="#id"
    /xlink:href="#([^"]+)"/g,     // xlink:href="#id"
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
        const refId = match[1].split('.')[0].split('+')[0].split(';')[0].trim();
        if (refId && refId !== 'id' && !refId.match(/^\d+[sm]?$/)) { // Skip timing values like "0s", "1s", "100"
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

// Utility: Count xlink attributes by type
function countXlinkAttributes(dom) {
  const counts = {
    'xlink:href': 0,
    'xlink:show': 0,
    'xlink:title': 0,
    'xlink:actuate': 0,
    'xlink:type': 0,
    'xlink:role': 0,
    'xlink:arcrole': 0
  };

  const elements = dom.window.document.querySelectorAll('*');
  for (const el of elements) {
    for (const attrName of el.getAttributeNames()) {
      if (counts.hasOwnProperty(attrName)) {
        counts[attrName]++;
      }
    }
  }

  return counts;
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

// Utility: Validate XML structure
function validateXMLStructure(svgString, dom) {
  const errors = [];

  // Check for unbound namespace prefixes
  const xlinkUsage = /xlink:/g;
  const xlinkNamespace = /xmlns:xlink=/;

  if (xlinkUsage.test(svgString) && !xlinkNamespace.test(svgString)) {
    errors.push('Unbound namespace prefix: xlink:* attributes exist without xmlns:xlink declaration');
  }

  // Check if JSDOM detected parsing errors
  const parserErrors = dom.window.document.getElementsByTagName('parsererror');
  if (parserErrors.length > 0) {
    errors.push('XML parsing error detected by JSDOM');
  }

  return errors;
}

// Utility: Check for converted xlink:show to target attribute
function checkXlinkShowConversion(originalDom, processedDom) {
  const conversions = [];
  const originalElements = originalDom.window.document.querySelectorAll('[xlink\\:show]');

  originalElements.forEach(el => {
    const xlinkShow = el.getAttribute('xlink:show');
    const id = el.getAttribute('id') || el.tagName;

    // Find corresponding element in processed DOM
    let processedEl;
    if (el.getAttribute('id')) {
      processedEl = processedDom.window.document.getElementById(el.getAttribute('id'));
    } else {
      // Match by position if no id
      const originalIndex = Array.from(originalDom.window.document.querySelectorAll(el.tagName)).indexOf(el);
      processedEl = processedDom.window.document.querySelectorAll(el.tagName)[originalIndex];
    }

    if (processedEl) {
      const hasXlinkShow = processedEl.hasAttribute('xlink:show');
      const targetValue = processedEl.getAttribute('target');

      conversions.push({
        element: id,
        originalXlinkShow: xlinkShow,
        removedXlinkShow: !hasXlinkShow,
        targetValue: targetValue,
        expectedTarget: xlinkShow === 'new' ? '_blank' : xlinkShow === 'replace' ? '_self' : null,
        converted: !hasXlinkShow && (
          (xlinkShow === 'new' && targetValue === '_blank') ||
          (xlinkShow === 'replace' && targetValue === '_self')
        )
      });
    }
  });

  return conversions;
}

// Utility: Check for converted xlink:title to <title> element
function checkXlinkTitleConversion(originalDom, processedDom) {
  const conversions = [];
  const originalElements = originalDom.window.document.querySelectorAll('[xlink\\:title]');

  originalElements.forEach(el => {
    const xlinkTitle = el.getAttribute('xlink:title');
    const id = el.getAttribute('id') || el.tagName;

    // Find corresponding element in processed DOM
    let processedEl;
    if (el.getAttribute('id')) {
      processedEl = processedDom.window.document.getElementById(el.getAttribute('id'));
    } else {
      // Match by position if no id
      const originalIndex = Array.from(originalDom.window.document.querySelectorAll(el.tagName)).indexOf(el);
      processedEl = processedDom.window.document.querySelectorAll(el.tagName)[originalIndex];
    }

    if (processedEl) {
      const hasXlinkTitle = processedEl.hasAttribute('xlink:title');
      const titleEl = processedEl.querySelector && processedEl.querySelector('title');
      const titleText = titleEl ? titleEl.textContent : null;

      conversions.push({
        element: id,
        originalXlinkTitle: xlinkTitle,
        removedXlinkTitle: !hasXlinkTitle,
        titleElement: titleEl !== null,
        titleText: titleText,
        converted: !hasXlinkTitle && titleText === xlinkTitle
      });
    }
  });

  return conversions;
}

// Test a single SVG file with removeXlink
async function testFile(filePath) {
  const fileName = basename(filePath);
  const testResult = {
    file: fileName,
    path: filePath,
    passed: true,
    errors: [],
    warnings: [],
    xlinkStats: {
      before: {},
      after: {},
      conversions: {}
    }
  };

  try {
    // Read original SVG
    const originalSvg = readFileSync(filePath, 'utf8');
    const originalDom = new JSDOM(originalSvg, { contentType: 'image/svg+xml' });

    // Extract references and IDs from original
    const originalRefs = extractReferences(originalSvg);
    const originalIds = extractDefinedIds(originalDom);
    const originalXlinkCounts = countXlinkAttributes(originalDom);
    const hadXlinkAttrs = hasXlinkAttributes(originalDom);
    const originalNs = checkNamespaceAttributes(originalDom);

    // Update global stats
    results.xlinkAttributeStats.totalXlinkHref += originalXlinkCounts['xlink:href'];
    results.xlinkAttributeStats.totalXlinkShow += originalXlinkCounts['xlink:show'];
    results.xlinkAttributeStats.totalXlinkTitle += originalXlinkCounts['xlink:title'];
    results.xlinkAttributeStats.totalXlinkActuate += originalXlinkCounts['xlink:actuate'];
    results.xlinkAttributeStats.totalXlinkType += originalXlinkCounts['xlink:type'];
    results.xlinkAttributeStats.totalXlinkRole += originalXlinkCounts['xlink:role'];
    results.xlinkAttributeStats.totalXlinkArcrole += originalXlinkCounts['xlink:arcrole'];

    if (originalNs['xmlns:xlink']) {
      results.namespaceStats.hadXlinkNamespace++;
    }

    testResult.xlinkStats.before = originalXlinkCounts;

    // Apply removeXlink function using svg-matrix parser
    let processedSvg;
    let processedDom;

    try {
      // Parse using svg-matrix parser
      const svgDoc = parseSVG(originalSvg);

      // Apply removeXlink
      removeXlink(svgDoc);

      // Serialize back to string
      processedSvg = serializeSVG(svgDoc);

      // Parse with JSDOM for validation
      processedDom = new JSDOM(processedSvg, { contentType: 'image/svg+xml' });
    } catch (error) {
      testResult.errors.push({
        type: 'processing-error',
        message: error.message,
        stack: error.stack
      });
      testResult.passed = false;
      return testResult;
    }

    // Extract data from processed SVG
    const processedRefs = extractReferences(processedSvg);
    const processedIds = extractDefinedIds(processedDom);
    const processedXlinkCounts = countXlinkAttributes(processedDom);
    const hasXlinkAttrsAfter = hasXlinkAttributes(processedDom);
    const processedNs = checkNamespaceAttributes(processedDom);

    testResult.xlinkStats.after = processedXlinkCounts;

    // Validate XML structure
    const xmlErrors = validateXMLStructure(processedSvg, processedDom);
    if (xmlErrors.length > 0) {
      testResult.errors.push({
        type: 'xml-validity',
        details: xmlErrors.join('; ')
      });
      testResult.passed = false;
    }

    // Check for broken references
    const missingRefs = [];
    for (const ref of processedRefs) {
      if (!processedIds.has(ref)) {
        missingRefs.push(ref);
      }
    }

    if (missingRefs.length > 0) {
      testResult.errors.push({
        type: 'broken-references',
        refs: missingRefs,
        details: `References broken: ${missingRefs.join(', ')}`
      });
      testResult.passed = false;

      results.brokenReferences.push({
        file: fileName,
        refs: missingRefs
      });
    }

    // Verify xlink:href preservation (CRITICAL: SVG 1.1 compatibility)
    if (originalXlinkCounts['xlink:href'] > 0) {
      if (processedXlinkCounts['xlink:href'] !== originalXlinkCounts['xlink:href']) {
        testResult.errors.push({
          type: 'xlink-href-not-preserved',
          details: `xlink:href count changed: ${originalXlinkCounts['xlink:href']} → ${processedXlinkCounts['xlink:href']} (should be preserved for SVG 1.1 compatibility)`
        });
        testResult.passed = false;
      } else {
        results.xlinkAttributeStats.preservedXlinkHref += processedXlinkCounts['xlink:href'];
      }
    }

    // Check xlink:show conversions
    if (originalXlinkCounts['xlink:show'] > 0) {
      const showConversions = checkXlinkShowConversion(originalDom, processedDom);
      testResult.xlinkStats.conversions.show = showConversions;

      const successfulConversions = showConversions.filter(c => c.converted).length;
      results.xlinkAttributeStats.convertedXlinkShow += successfulConversions;

      const failedConversions = showConversions.filter(c => !c.converted && c.expectedTarget);
      if (failedConversions.length > 0) {
        testResult.warnings.push({
          type: 'xlink-show-conversion-incomplete',
          details: `${failedConversions.length} xlink:show attributes not properly converted to target`
        });
      }
    }

    // Check xlink:title conversions
    if (originalXlinkCounts['xlink:title'] > 0) {
      const titleConversions = checkXlinkTitleConversion(originalDom, processedDom);
      testResult.xlinkStats.conversions.title = titleConversions;

      const successfulConversions = titleConversions.filter(c => c.converted).length;
      results.xlinkAttributeStats.convertedXlinkTitle += successfulConversions;

      const failedConversions = titleConversions.filter(c => !c.converted);
      if (failedConversions.length > 0) {
        testResult.warnings.push({
          type: 'xlink-title-conversion-incomplete',
          details: `${failedConversions.length} xlink:title attributes not properly converted to <title> elements`
        });
      }
    }

    // Check deprecated xlink attributes removal
    const deprecatedAttrs = ['xlink:actuate', 'xlink:type', 'xlink:role', 'xlink:arcrole'];
    let deprecatedRemoved = 0;
    for (const attr of deprecatedAttrs) {
      const attrKey = attr.replace('xlink:', 'xlink:');
      if (originalXlinkCounts[attrKey] > 0) {
        if (processedXlinkCounts[attrKey] > 0) {
          testResult.warnings.push({
            type: 'deprecated-xlink-not-removed',
            details: `${attr} still present (${processedXlinkCounts[attrKey]} occurrences)`
          });
        } else {
          deprecatedRemoved += originalXlinkCounts[attrKey];
        }
      }
    }
    results.xlinkAttributeStats.removedDeprecated += deprecatedRemoved;

    // Check namespace handling
    if (hasXlinkAttrsAfter && !processedNs['xmlns:xlink']) {
      testResult.errors.push({
        type: 'unbound-namespace-prefix',
        details: 'xlink:* attributes exist but xmlns:xlink namespace declaration was removed'
      });
      testResult.passed = false;
    }

    if (!hasXlinkAttrsAfter && processedNs['xmlns:xlink']) {
      testResult.warnings.push({
        type: 'unnecessary-namespace',
        details: 'xmlns:xlink namespace preserved but no xlink:* attributes remain'
      });
    }

    // Update namespace stats
    if (hadXlinkAttrs && originalNs['xmlns:xlink']) {
      if (!processedNs['xmlns:xlink']) {
        results.namespaceStats.removedXlinkNamespace++;
      } else {
        results.namespaceStats.preservedXlinkNamespace++;
      }
    }

    // Save processed SVG to output directory
    const outputPath = join(OUTPUT_DIR, fileName);
    writeFileSync(outputPath, processedSvg, 'utf8');

  } catch (error) {
    testResult.passed = false;
    testResult.errors.push({
      type: 'fatal-error',
      message: error.message,
      stack: error.stack
    });
  }

  return testResult;
}

// Generate markdown analysis report
function generateAnalysisReport() {
  const lines = [];

  lines.push('# removeXlink Function Test Results');
  lines.push('');
  lines.push(`**Test Date:** ${new Date().toISOString()}`);
  lines.push(`**Test Suite:** W3C SVG 1.1 Test Suite (525 files)`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count | Percentage |`);
  lines.push(`|--------|-------|------------|`);
  lines.push(`| Total Files Tested | ${results.total} | 100% |`);
  lines.push(`| Passed | ${results.passed} | ${Math.round(results.passed/results.total*100)}% |`);
  lines.push(`| Failed | ${results.failed} | ${Math.round(results.failed/results.total*100)}% |`);
  lines.push(`| Errors | ${results.errors.length} | - |`);
  lines.push(`| Warnings | ${results.warnings.length} | - |`);
  lines.push('');

  lines.push('## XLink Attribute Statistics');
  lines.push('');
  lines.push('### Original Files');
  lines.push(`- Total \`xlink:href\` attributes: ${results.xlinkAttributeStats.totalXlinkHref}`);
  lines.push(`- Total \`xlink:show\` attributes: ${results.xlinkAttributeStats.totalXlinkShow}`);
  lines.push(`- Total \`xlink:title\` attributes: ${results.xlinkAttributeStats.totalXlinkTitle}`);
  lines.push(`- Total deprecated xlink attributes: ${results.xlinkAttributeStats.totalXlinkActuate + results.xlinkAttributeStats.totalXlinkType + results.xlinkAttributeStats.totalXlinkRole + results.xlinkAttributeStats.totalXlinkArcrole}`);
  lines.push('');

  lines.push('### Processing Results');
  lines.push(`- \`xlink:href\` preserved (SVG 1.1 compatibility): ${results.xlinkAttributeStats.preservedXlinkHref} / ${results.xlinkAttributeStats.totalXlinkHref}`);
  lines.push(`- \`xlink:show\` converted to \`target\`: ${results.xlinkAttributeStats.convertedXlinkShow} / ${results.xlinkAttributeStats.totalXlinkShow}`);
  lines.push(`- \`xlink:title\` converted to \`<title>\`: ${results.xlinkAttributeStats.convertedXlinkTitle} / ${results.xlinkAttributeStats.totalXlinkTitle}`);
  lines.push(`- Deprecated attributes removed: ${results.xlinkAttributeStats.removedDeprecated}`);
  lines.push('');

  lines.push('## Namespace Handling');
  lines.push('');
  lines.push(`- Files with \`xmlns:xlink\` namespace: ${results.namespaceStats.hadXlinkNamespace}`);
  lines.push(`- Namespace removed (no xlink attrs remaining): ${results.namespaceStats.removedXlinkNamespace}`);
  lines.push(`- Namespace preserved (xlink:href present): ${results.namespaceStats.preservedXlinkNamespace}`);
  lines.push('');

  if (results.brokenReferences.length > 0) {
    lines.push('## Broken References');
    lines.push('');
    lines.push(`**⚠️ Warning: ${results.brokenReferences.length} files have broken references**`);
    lines.push('');
    for (const broken of results.brokenReferences.slice(0, 20)) {
      lines.push(`- **${broken.file}**: ${broken.refs.join(', ')}`);
    }
    if (results.brokenReferences.length > 20) {
      lines.push(`- ... and ${results.brokenReferences.length - 20} more`);
    }
    lines.push('');
  }

  if (results.errors.length > 0) {
    lines.push('## Errors by Type');
    lines.push('');

    const errorsByType = {};
    for (const error of results.errors) {
      if (!errorsByType[error.type]) {
        errorsByType[error.type] = [];
      }
      errorsByType[error.type].push(error);
    }

    for (const [type, errors] of Object.entries(errorsByType)) {
      lines.push(`### ${type} (${errors.length} occurrences)`);
      lines.push('');
      for (let i = 0; i < Math.min(10, errors.length); i++) {
        const error = errors[i];
        lines.push(`- **${error.file}**: ${error.details || error.message || 'No details'}`);
      }
      if (errors.length > 10) {
        lines.push(`- ... and ${errors.length - 10} more`);
      }
      lines.push('');
    }
  }

  if (results.warnings.length > 0) {
    lines.push('## Warnings by Type');
    lines.push('');

    const warningsByType = {};
    for (const warning of results.warnings) {
      if (!warningsByType[warning.type]) {
        warningsByType[warning.type] = [];
      }
      warningsByType[warning.type].push(warning);
    }

    for (const [type, warnings] of Object.entries(warningsByType)) {
      lines.push(`### ${type} (${warnings.length} occurrences)`);
      lines.push('');
      for (let i = 0; i < Math.min(5, warnings.length); i++) {
        const warning = warnings[i];
        lines.push(`- **${warning.file}**: ${warning.details}`);
      }
      if (warnings.length > 5) {
        lines.push(`- ... and ${warnings.length - 5} more`);
      }
      lines.push('');
    }
  }

  lines.push('## Function Behavior Validation');
  lines.push('');
  lines.push('### ✅ Expected Behavior');
  lines.push('');
  lines.push('1. **xlink:href preservation**: MUST be preserved for SVG 1.1 compatibility');
  lines.push('2. **xlink:show conversion**: Should convert to target attribute');
  lines.push('   - `xlink:show="new"` → `target="_blank"`');
  lines.push('   - `xlink:show="replace"` → `target="_self"`');
  lines.push('3. **xlink:title conversion**: Should convert to `<title>` child element');
  lines.push('4. **Deprecated attributes**: Should remove xlink:actuate, xlink:type, xlink:role, xlink:arcrole');
  lines.push('5. **Namespace handling**: Remove `xmlns:xlink` ONLY if no xlink:* attributes remain');
  lines.push('');

  // Overall assessment
  lines.push('## Overall Assessment');
  lines.push('');

  const passRate = Math.round(results.passed / results.total * 100);
  const criticalErrors = results.errors.filter(e =>
    e.type === 'xlink-href-not-preserved' ||
    e.type === 'unbound-namespace-prefix' ||
    e.type === 'xml-validity'
  ).length;

  if (passRate === 100 && criticalErrors === 0) {
    lines.push('✅ **PASS**: All tests passed with no critical errors');
  } else if (passRate >= 95 && criticalErrors === 0) {
    lines.push('⚠️ **MOSTLY PASS**: Most tests passed, minor issues only');
  } else if (criticalErrors > 0) {
    lines.push(`❌ **FAIL**: ${criticalErrors} critical errors detected`);
  } else {
    lines.push(`⚠️ **PARTIAL PASS**: ${passRate}% pass rate`);
  }
  lines.push('');

  lines.push('## Test Configuration');
  lines.push('');
  lines.push(`- **Input Directory**: ${W3C_TEST_DIR}`);
  lines.push(`- **Output Directory**: ${OUTPUT_DIR}`);
  lines.push(`- **Log File**: ${LOG_FILE}`);
  lines.push(`- **Detailed Results**: test-results-${TIMESTAMP}.json`);
  lines.push('');

  return lines.join('\n');
}

// Main test execution
async function runTests() {
  log('='.repeat(80));
  log('removeXlink W3C SVG 1.1 Test Suite Validation');
  log('='.repeat(80));
  log(`Test directory: ${W3C_TEST_DIR}`);
  log(`Output directory: ${OUTPUT_DIR}`);
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
      }
    }

    for (const warning of testResult.warnings) {
      results.warnings.push({ file: fileName, ...warning });
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
  log('');

  // XLink statistics
  log('='.repeat(80));
  log('XLINK ATTRIBUTE STATISTICS');
  log('='.repeat(80));
  log(`Total xlink:href found: ${results.xlinkAttributeStats.totalXlinkHref}`);
  log(`xlink:href preserved: ${results.xlinkAttributeStats.preservedXlinkHref}`);
  log(`xlink:show converted: ${results.xlinkAttributeStats.convertedXlinkShow} / ${results.xlinkAttributeStats.totalXlinkShow}`);
  log(`xlink:title converted: ${results.xlinkAttributeStats.convertedXlinkTitle} / ${results.xlinkAttributeStats.totalXlinkTitle}`);
  log(`Deprecated attrs removed: ${results.xlinkAttributeStats.removedDeprecated}`);
  log('');

  // Save detailed JSON report
  const jsonReportPath = join(LOG_DIR, `test-results-${TIMESTAMP}.json`);
  writeFileSync(jsonReportPath, JSON.stringify(results, null, 2));
  log(`Detailed JSON report saved to: ${jsonReportPath}`);

  // Generate and save markdown analysis
  const analysisReport = generateAnalysisReport();
  const analysisPath = '/tmp/svg-function-tests/removeXlink/analysis.md';
  writeFileSync(analysisPath, analysisReport);
  log(`Analysis report saved to: ${analysisPath}`);

  log('');
  log('='.repeat(80));
  log('TEST COMPLETE');
  log('='.repeat(80));

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  log(`FATAL ERROR: ${error.message}`, 'FATAL');
  log(error.stack, 'FATAL');
  process.exit(2);
});
