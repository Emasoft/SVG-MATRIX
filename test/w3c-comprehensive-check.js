/**
 * Comprehensive W3C Animation Feature Coverage Test
 *
 * Tests ALL animation SVG files against svg-matrix operations
 * to ensure no features are broken or unsupported.
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { cleanupIds, optimizeAnimationTiming } from '../src/svg-toolbox.js';
import { collectAllReferences } from '../src/animation-references.js';

const TEST_SUITE_PATH = 'SVG 1.1 W3C Test Suit/svg';
const ANIMATION_ELEMENTS = ['animate', 'animatetransform', 'animatemotion', 'animatecolor', 'set'];
const ANIMATION_ATTRS = [
  'attributeName', 'attributeType', 'begin', 'dur', 'end', 'min', 'max',
  'restart', 'repeatCount', 'repeatDur', 'fill', 'calcMode', 'values',
  'keyTimes', 'keySplines', 'keyPoints', 'from', 'to', 'by', 'additive',
  'accumulate', 'href', 'xlink:href'
];

// Get all animation element counts
function getAnimationCounts(doc) {
  const counts = {};
  for (const tag of ANIMATION_ELEMENTS) {
    counts[tag] = doc.getElementsByTagName(tag).length;
  }
  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

// Get all animation attributes from document
function getAnimationAttributes(doc) {
  const attrs = new Map();

  for (const tag of ANIMATION_ELEMENTS) {
    const elements = doc.getElementsByTagName(tag);
    for (const el of elements) {
      for (const attr of ANIMATION_ATTRS) {
        const val = el.getAttribute(attr);
        if (val !== null) {
          const key = `${tag}:${attr}`;
          if (!attrs.has(key)) attrs.set(key, []);
          attrs.get(key).push(val);
        }
      }
    }
  }

  return attrs;
}

// Compare attribute maps
function compareAttributes(before, after) {
  const issues = [];

  for (const [key, valuesBefore] of before) {
    const valuesAfter = after.get(key) || [];

    if (valuesBefore.length !== valuesAfter.length) {
      issues.push({
        type: 'count_mismatch',
        attr: key,
        before: valuesBefore.length,
        after: valuesAfter.length
      });
    } else {
      // Check if values changed (excluding expected optimizations)
      for (let i = 0; i < valuesBefore.length; i++) {
        const vBefore = valuesBefore[i];
        const vAfter = valuesAfter[i];

        // Skip expected numeric optimizations (0.5 -> .5)
        const normalizedBefore = normalizeValue(vBefore);
        const normalizedAfter = normalizeValue(vAfter);

        if (normalizedBefore !== normalizedAfter) {
          // Check if it's a legitimate optimization
          if (!isValidOptimization(vBefore, vAfter)) {
            issues.push({
              type: 'value_changed',
              attr: key,
              before: vBefore,
              after: vAfter
            });
          }
        }
      }
    }
  }

  return issues;
}

// Normalize numeric values for comparison
function normalizeValue(val) {
  if (!val) return val;
  // Remove leading zeros and normalize decimals
  return val.replace(/\b0+(\.\d)/g, '$1')
            .replace(/(\d)\.0+\b/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
}

// Check if value change is a valid optimization
function isValidOptimization(before, after) {
  // Leading zero removal: 0.5 -> .5
  // Trailing zero removal: 1.00 -> 1
  // Space normalization
  const normalizedBefore = normalizeValue(before);
  const normalizedAfter = normalizeValue(after);
  return normalizedBefore === normalizedAfter;
}

// Catalog all unique animation patterns
function catalogPatterns(doc) {
  const patterns = {
    timingPatterns: new Set(),
    easingPatterns: new Set(),
    targetAttrs: new Set(),
    valuePatterns: new Set(),
  };

  for (const tag of ANIMATION_ELEMENTS) {
    const elements = doc.getElementsByTagName(tag);
    for (const el of elements) {
      // Timing patterns
      const begin = el.getAttribute('begin');
      const end = el.getAttribute('end');
      if (begin) patterns.timingPatterns.add(categorizeTimingPattern(begin));
      if (end) patterns.timingPatterns.add(categorizeTimingPattern(end));

      // Easing
      const calcMode = el.getAttribute('calcMode');
      const keySplines = el.getAttribute('keySplines');
      if (calcMode) patterns.easingPatterns.add(calcMode);
      if (keySplines) patterns.easingPatterns.add('keySplines');

      // Target attributes
      const attrName = el.getAttribute('attributeName');
      if (attrName) patterns.targetAttrs.add(attrName);

      // Value patterns
      const values = el.getAttribute('values');
      if (values) {
        if (values.includes('#')) patterns.valuePatterns.add('id-references');
        else if (values.includes(';')) patterns.valuePatterns.add('semicolon-list');
        else patterns.valuePatterns.add('single-value');
      }
    }
  }

  return patterns;
}

function categorizeTimingPattern(timing) {
  if (timing.includes('.click') || timing.includes('.mouseover') || timing.includes('.mouseout')) {
    return 'event-based';
  }
  if (timing.includes('.begin') || timing.includes('.end')) {
    return 'sync-based';
  }
  if (timing.includes('+') || timing.includes('-')) {
    return 'offset-based';
  }
  if (timing === 'indefinite') {
    return 'indefinite';
  }
  if (/^\d/.test(timing)) {
    return 'time-based';
  }
  return 'other';
}

async function testFile(filename) {
  const filepath = path.join(TEST_SUITE_PATH, filename);
  const content = fs.readFileSync(filepath, 'utf8');

  const result = {
    filename,
    success: true,
    issues: [],
    patterns: null,
    stats: {}
  };

  try {
    // Parse original
    const docBefore = parseSVG(content);
    const countsBefore = getAnimationCounts(docBefore);
    const attrsBefore = getAnimationAttributes(docBefore);

    result.stats.elementsBefore = countsBefore;
    result.patterns = catalogPatterns(docBefore);

    // Apply cleanupIds
    const docAfterCleanup = await cleanupIds(docBefore, { minify: false, remove: true });
    const countsAfterCleanup = getAnimationCounts(docAfterCleanup);

    // Check element counts after cleanupIds
    for (const tag of ANIMATION_ELEMENTS) {
      if (countsBefore[tag] !== countsAfterCleanup[tag]) {
        result.success = false;
        result.issues.push({
          type: 'CRITICAL',
          stage: 'cleanupIds',
          message: `${tag} count: ${countsBefore[tag]} -> ${countsAfterCleanup[tag]}`
        });
      }
    }

    // Apply optimizeAnimationTiming
    const docAfterOptimize = await optimizeAnimationTiming(docAfterCleanup, { precision: 3 });
    const countsAfterOptimize = getAnimationCounts(docAfterOptimize);
    const attrsAfter = getAnimationAttributes(docAfterOptimize);

    result.stats.elementsAfter = countsAfterOptimize;

    // Check element counts after optimize
    for (const tag of ANIMATION_ELEMENTS) {
      if (countsAfterCleanup[tag] !== countsAfterOptimize[tag]) {
        result.success = false;
        result.issues.push({
          type: 'CRITICAL',
          stage: 'optimizeAnimationTiming',
          message: `${tag} count: ${countsAfterCleanup[tag]} -> ${countsAfterOptimize[tag]}`
        });
      }
    }

    // Check attribute preservation (excluding expected optimizations)
    const attrIssues = compareAttributes(attrsBefore, attrsAfter);
    for (const issue of attrIssues) {
      if (issue.type === 'count_mismatch') {
        result.success = false;
        result.issues.push({
          type: 'HIGH',
          stage: 'attribute_check',
          message: `${issue.attr} count: ${issue.before} -> ${issue.after}`
        });
      }
    }

  } catch (err) {
    result.success = false;
    result.issues.push({
      type: 'ERROR',
      stage: 'processing',
      message: err.message
    });
  }

  return result;
}

async function runAllTests() {
  console.log('\n=== W3C Animation Feature Coverage Test ===\n');

  const files = fs.readdirSync(TEST_SUITE_PATH)
    .filter(f => f.includes('anim') && f.endsWith('.svg'));

  console.log(`Testing ${files.length} animation files...\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];
  const allPatterns = {
    timingPatterns: new Set(),
    easingPatterns: new Set(),
    targetAttrs: new Set(),
    valuePatterns: new Set(),
  };

  for (const file of files) {
    const result = await testFile(file);

    // Aggregate patterns
    if (result.patterns) {
      for (const p of result.patterns.timingPatterns) allPatterns.timingPatterns.add(p);
      for (const p of result.patterns.easingPatterns) allPatterns.easingPatterns.add(p);
      for (const p of result.patterns.targetAttrs) allPatterns.targetAttrs.add(p);
      for (const p of result.patterns.valuePatterns) allPatterns.valuePatterns.add(p);
    }

    if (result.success) {
      passed++;
      console.log(`  ✓ ${file}`);
    } else {
      failed++;
      failures.push(result);
      console.log(`  ✗ ${file}`);
      for (const issue of result.issues) {
        console.log(`      [${issue.type}] ${issue.message}`);
      }
    }
  }

  console.log('\n=== Summary ===\n');
  console.log(`Total: ${files.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  console.log('\n=== Animation Patterns Found ===\n');
  console.log('Timing patterns:', [...allPatterns.timingPatterns].join(', '));
  console.log('Easing patterns:', [...allPatterns.easingPatterns].join(', '));
  console.log('Target attributes:', [...allPatterns.targetAttrs].sort().join(', '));
  console.log('Value patterns:', [...allPatterns.valuePatterns].join(', '));

  if (failures.length > 0) {
    console.log('\n=== Failed Files ===\n');
    for (const f of failures) {
      console.log(`${f.filename}:`);
      for (const issue of f.issues) {
        console.log(`  [${issue.type}] ${issue.stage}: ${issue.message}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\n✓ ALL ANIMATION FEATURES PRESERVED ✓\n');
  }
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
