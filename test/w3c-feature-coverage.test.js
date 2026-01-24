/**
 * W3C SVG 1.1 Test Suite - Animation Feature Coverage Analysis
 *
 * Analyzes ALL animation SVG files from the W3C test suite to ensure
 * svg-matrix operations preserve animation features correctly.
 *
 * This test:
 * 1. Loads each animation SVG file from the W3C test suite
 * 2. Processes through svg-matrix operations (parseSVG, cleanupIds, optimizeAnimationTiming, serializeSVG)
 * 3. Compares before/after to detect ANY changes to animation elements and attributes
 * 4. Catalogs ALL unique animation patterns found
 * 5. Flags files with unexpected modifications
 * 6. Generates detailed report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { cleanupIds, optimizeAnimationTiming } from '../src/svg-toolbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SUITE_PATH = path.join(__dirname, '../SVG 1.1 W3C Test Suit/svg/');

// Animation elements to track
const ANIMATION_ELEMENTS = ['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set'];

// Animation attributes to track
const ANIMATION_ATTRIBUTES = [
  'href', 'xlink:href',
  'begin', 'end', 'dur', 'repeatCount', 'repeatDur', 'fill',
  'calcMode', 'keySplines', 'keyTimes', 'keyPoints', 'values',
  'from', 'to', 'by',
  'additive', 'accumulate',
  'attributeName', 'attributeType',
  'restart', 'min', 'max',
  'type' // for animateTransform
];

// Motion path elements
const MOTION_PATH_ELEMENTS = ['mpath'];

/**
 * Find all animation SVG files in test suite
 * Returns null if test suite is not available
 */
function findAnimationFiles() {
  if (!fs.existsSync(TEST_SUITE_PATH)) {
    return null; // Signal that test suite is missing
  }

  const files = fs.readdirSync(TEST_SUITE_PATH)
    .filter(f => f.endsWith('.svg') && f.toLowerCase().includes('anim'))
    .map(f => path.join(TEST_SUITE_PATH, f))
    .sort();

  return files;
}

/**
 * Extract animation info from an SVG element tree
 */
function extractAnimationInfo(element, info = {
  elements: {},
  attributes: {},
  patterns: new Set(),
  targets: new Set(),
  timing: new Set()
}) {
  if (!element) return info;

  const tagName = element.tagName?.toLowerCase() || '';

  // Track animation elements
  if (ANIMATION_ELEMENTS.includes(tagName)) {
    if (!info.elements[tagName]) {
      info.elements[tagName] = 0;
    }
    info.elements[tagName]++;

    // Extract all attributes from animation element
    const attrs = {};
    for (const attrName of element.getAttributeNames()) {
      attrs[attrName] = element.getAttribute(attrName);
    }

    // Track animation attributes
    for (const attrName of ANIMATION_ATTRIBUTES) {
      const value = element.getAttribute(attrName);
      if (value !== null) {
        if (!info.attributes[attrName]) {
          info.attributes[attrName] = new Set();
        }
        info.attributes[attrName].add(value);
      }
    }

    // Track animation patterns
    const pattern = {
      element: tagName,
      attributeName: element.getAttribute('attributeName'),
      calcMode: element.getAttribute('calcMode'),
      hasValues: element.hasAttribute('values'),
      hasFrom: element.hasAttribute('from'),
      hasTo: element.hasAttribute('to'),
      hasBy: element.hasAttribute('by'),
      hasKeyTimes: element.hasAttribute('keyTimes'),
      hasKeySplines: element.hasAttribute('keySplines'),
      hasKeyPoints: element.hasAttribute('keyPoints'),
      type: element.getAttribute('type') // for animateTransform
    };
    info.patterns.add(JSON.stringify(pattern));

    // Track animation targets
    const targetAttr = element.getAttribute('attributeName');
    if (targetAttr) {
      info.targets.add(targetAttr);
    }

    // Track timing patterns
    const begin = element.getAttribute('begin');
    const end = element.getAttribute('end');
    if (begin) info.timing.add(`begin: ${begin}`);
    if (end) info.timing.add(`end: ${end}`);
  }

  // Track mpath elements
  if (MOTION_PATH_ELEMENTS.includes(tagName)) {
    if (!info.elements[tagName]) {
      info.elements[tagName] = 0;
    }
    info.elements[tagName]++;

    // Track mpath href
    const href = element.getAttribute('href') || element.getAttribute('xlink:href');
    if (href) {
      if (!info.attributes['mpath-href']) {
        info.attributes['mpath-href'] = new Set();
      }
      info.attributes['mpath-href'].add(href);
    }
  }

  // Recurse to children
  for (const child of element.children || []) {
    extractAnimationInfo(child, info);
  }

  return info;
}

/**
 * Compare two animation info objects
 */
function compareAnimationInfo(before, after, filename) {
  const differences = [];

  // Compare element counts
  const allElements = new Set([
    ...Object.keys(before.elements),
    ...Object.keys(after.elements)
  ]);

  for (const elem of allElements) {
    const beforeCount = before.elements[elem] || 0;
    const afterCount = after.elements[elem] || 0;
    if (beforeCount !== afterCount) {
      differences.push({
        type: 'element-count',
        element: elem,
        before: beforeCount,
        after: afterCount,
        severity: 'CRITICAL'
      });
    }
  }

  // Compare attributes
  const allAttrs = new Set([
    ...Object.keys(before.attributes),
    ...Object.keys(after.attributes)
  ]);

  for (const attr of allAttrs) {
    const beforeValues = before.attributes[attr] || new Set();
    const afterValues = after.attributes[attr] || new Set();

    // Check for removed values
    for (const val of beforeValues) {
      if (!afterValues.has(val)) {
        differences.push({
          type: 'attribute-removed',
          attribute: attr,
          value: val,
          severity: 'HIGH'
        });
      }
    }

    // Check for added values (could be normalization)
    for (const val of afterValues) {
      if (!beforeValues.has(val)) {
        // Check if this is just normalization (e.g., "0.5" -> ".5")
        const isNormalization = Array.from(beforeValues).some(beforeVal => {
          return normalizeValue(beforeVal) === normalizeValue(val);
        });

        differences.push({
          type: 'attribute-modified',
          attribute: attr,
          value: val,
          severity: isNormalization ? 'LOW' : 'MEDIUM'
        });
      }
    }
  }

  return differences;
}

/**
 * Normalize a value for comparison (handles numeric formatting differences)
 */
function normalizeValue(val) {
  if (typeof val !== 'string') return val;

  // Try to parse as number
  const num = parseFloat(val);
  if (!isNaN(num)) {
    return num.toString();
  }

  // For semicolon-separated lists, normalize each part
  if (val.includes(';')) {
    return val.split(';').map(p => p.trim()).join(';');
  }

  return val.trim();
}

/**
 * Test a single SVG file
 */
async function testFile(filepath) {
  const filename = path.basename(filepath);

  try {
    const svgContent = fs.readFileSync(filepath, 'utf8');

    // Parse original
    const originalDoc = parseSVG(svgContent);
    const beforeInfo = extractAnimationInfo(originalDoc);

    // Apply svg-matrix operations (they accept string or DOM element)
    // cleanupIds and optimizeAnimationTiming return processed SVG string by default
    let processedContent = svgContent;

    // Apply cleanupIds (async operation)
    processedContent = await cleanupIds(processedContent, { outputFormat: 'svg_string' });

    // Apply optimizeAnimationTiming (async operation)
    processedContent = await optimizeAnimationTiming(processedContent, { outputFormat: 'svg_string' });

    // Parse the serialized result to extract info
    const finalDoc = parseSVG(processedContent);
    const afterInfo = extractAnimationInfo(finalDoc);

    // Compare
    const differences = compareAnimationInfo(beforeInfo, afterInfo, filename);

    return {
      filename,
      success: true,
      beforeInfo,
      afterInfo,
      differences,
      hasCriticalIssues: differences.some(d => d.severity === 'CRITICAL'),
      hasHighIssues: differences.some(d => d.severity === 'HIGH'),
      hasMediumIssues: differences.some(d => d.severity === 'MEDIUM')
    };

  } catch (error) {
    return {
      filename,
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Run tests on all animation files
 */
async function runTests() {
  console.log('🔍 W3C SVG 1.1 Test Suite - Animation Feature Coverage Analysis\n');
  console.log('═'.repeat(80));

  const files = findAnimationFiles();

  // Check if W3C test suite is available
  if (files === null) {
    console.log('\n⚠ SKIPPED: W3C SVG 1.1 Test Suite not found at:', TEST_SUITE_PATH);
    console.log('  Download from: https://www.w3.org/Graphics/SVG/Test/20110816/');
    console.log('  Extract to project root as "SVG 1.1 W3C Test Suit/svg/"');
    return;
  }

  console.log(`\nFound ${files.length} animation test files\n`);

  const results = {
    total: files.length,
    success: 0,
    failed: 0,
    filesWithCriticalIssues: [],
    filesWithHighIssues: [],
    filesWithMediumIssues: [],
    filesWithOnlyLowIssues: [],
    allPatterns: new Set(),
    allTargets: new Set(),
    allTiming: new Set(),
    allElementTypes: new Set(),
    allAttributes: new Set(),
    testResults: []
  };

  // Test each file
  for (const filepath of files) {
    const result = await testFile(filepath);
    results.testResults.push(result);

    if (result.success) {
      results.success++;

      // Collect patterns
      if (result.beforeInfo.patterns) {
        result.beforeInfo.patterns.forEach(p => results.allPatterns.add(p));
      }
      if (result.beforeInfo.targets) {
        result.beforeInfo.targets.forEach(t => results.allTargets.add(t));
      }
      if (result.beforeInfo.timing) {
        result.beforeInfo.timing.forEach(t => results.allTiming.add(t));
      }
      if (result.beforeInfo.elements) {
        Object.keys(result.beforeInfo.elements).forEach(e => results.allElementTypes.add(e));
      }
      if (result.beforeInfo.attributes) {
        Object.keys(result.beforeInfo.attributes).forEach(a => results.allAttributes.add(a));
      }

      // Categorize by issue severity
      if (result.hasCriticalIssues) {
        results.filesWithCriticalIssues.push(result);
      } else if (result.hasHighIssues) {
        results.filesWithHighIssues.push(result);
      } else if (result.hasMediumIssues) {
        results.filesWithMediumIssues.push(result);
      } else if (result.differences.length > 0) {
        results.filesWithOnlyLowIssues.push(result);
      }

    } else {
      results.failed++;
      console.log(`❌ ${result.filename}: ${result.error}`);
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`Total files tested: ${results.total}`);
  console.log(`✅ Successful: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('');
  console.log(`🔴 Files with CRITICAL issues: ${results.filesWithCriticalIssues.length}`);
  console.log(`🟠 Files with HIGH issues: ${results.filesWithHighIssues.length}`);
  console.log(`🟡 Files with MEDIUM issues: ${results.filesWithMediumIssues.length}`);
  console.log(`🟢 Files with only LOW issues (normalization): ${results.filesWithOnlyLowIssues.length}`);
  console.log('');

  // Print critical issues
  if (results.filesWithCriticalIssues.length > 0) {
    console.log('\n' + '═'.repeat(80));
    console.log('\n🔴 CRITICAL ISSUES (Element Count Changes)\n');
    for (const result of results.filesWithCriticalIssues) {
      console.log(`\n${result.filename}:`);
      for (const diff of result.differences.filter(d => d.severity === 'CRITICAL')) {
        console.log(`  - ${diff.element}: ${diff.before} → ${diff.after}`);
      }
    }
  }

  // Print high issues
  if (results.filesWithHighIssues.length > 0) {
    console.log('\n' + '═'.repeat(80));
    console.log('\n🟠 HIGH ISSUES (Attribute Removal)\n');
    for (const result of results.filesWithHighIssues) {
      console.log(`\n${result.filename}:`);
      for (const diff of result.differences.filter(d => d.severity === 'HIGH')) {
        console.log(`  - ${diff.attribute}: "${diff.value}" removed`);
      }
    }
  }

  // Print animation features catalog
  console.log('\n' + '═'.repeat(80));
  console.log('\n📚 ANIMATION FEATURES CATALOG\n');

  console.log('Animation Element Types:');
  console.log('  ' + Array.from(results.allElementTypes).sort().join(', '));
  console.log('');

  console.log('Animation Attributes Found:');
  console.log('  ' + Array.from(results.allAttributes).sort().join(', '));
  console.log('');

  console.log('Animation Targets (attributeName):');
  const targets = Array.from(results.allTargets).sort();
  console.log('  ' + targets.join(', '));
  console.log('');

  console.log(`Unique Animation Patterns: ${results.allPatterns.size}`);
  console.log('Sample patterns:');
  Array.from(results.allPatterns).slice(0, 10).forEach(p => {
    console.log(`  ${p}`);
  });
  console.log('');

  console.log('Timing Patterns (sample):');
  Array.from(results.allTiming).slice(0, 20).forEach(t => {
    console.log(`  ${t}`);
  });

  // Save detailed report
  const reportPath = path.join(__dirname, 'w3c-animation-coverage-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      success: results.success,
      failed: results.failed,
      criticalIssues: results.filesWithCriticalIssues.length,
      highIssues: results.filesWithHighIssues.length,
      mediumIssues: results.filesWithMediumIssues.length,
      lowIssues: results.filesWithOnlyLowIssues.length
    },
    features: {
      elementTypes: Array.from(results.allElementTypes).sort(),
      attributes: Array.from(results.allAttributes).sort(),
      targets: Array.from(results.allTargets).sort(),
      patterns: Array.from(results.allPatterns).map(p => JSON.parse(p)),
      timingPatterns: Array.from(results.allTiming).sort()
    },
    issues: {
      critical: results.filesWithCriticalIssues.map(r => ({
        file: r.filename,
        differences: r.differences.filter(d => d.severity === 'CRITICAL')
      })),
      high: results.filesWithHighIssues.map(r => ({
        file: r.filename,
        differences: r.differences.filter(d => d.severity === 'HIGH')
      })),
      medium: results.filesWithMediumIssues.map(r => ({
        file: r.filename,
        differences: r.differences.filter(d => d.severity === 'MEDIUM')
      }))
    },
    detailedResults: results.testResults
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\n' + '═'.repeat(80));
  console.log(`\n📄 Detailed report saved to: ${reportPath}\n`);

  // Return exit code based on critical/high issues
  const hasProblems = results.filesWithCriticalIssues.length > 0 || results.filesWithHighIssues.length > 0;
  return hasProblems ? 1 : 0;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runTests, testFile, findAnimationFiles, extractAnimationInfo, compareAnimationInfo };
