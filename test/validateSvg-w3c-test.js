import { validateSvg, ValidationSeverity } from '../src/svg-toolbox.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const W3C_TEST_SUITE_PATH = 'SVG 1.1 W3C Test Suit/svg';

async function testW3CFalsePositives() {
  console.log('='.repeat(70));
  console.log('W3C SVG 1.1 TEST SUITE - FALSE POSITIVE DETECTION');
  console.log('='.repeat(70));
  console.log('These are AUTHORITATIVE reference files from W3C.');
  console.log('Any unknown element/attribute warnings are FALSE POSITIVES.');
  console.log('='.repeat(70));
  console.log();

  // Get all SVG files from W3C test suite
  const entries = await fs.readdir(W3C_TEST_SUITE_PATH);
  const svgFiles = entries.filter(f => f.endsWith('.svg')).sort();

  console.log(`Testing ${svgFiles.length} W3C SVG 1.1 test files...\n`);

  // Track false positive types
  const falsePositiveTypes = new Set([
    'mistyped_element_detected',
    'unknown_element_detected',
    'mistyped_attribute_detected',
    'unknown_attribute_detected'
  ]);

  const results = {
    total: 0,
    clean: 0,
    withFalsePositives: 0,
    falsePositives: [],
    // Track unique false positive elements/attributes
    unknownElements: new Map(),
    unknownAttributes: new Map()
  };

  for (const file of svgFiles) {
    const filepath = path.join(W3C_TEST_SUITE_PATH, file);
    try {
      const result = await validateSvg(filepath);
      results.total++;

      // Check for false positives (unknown/mistyped element/attribute warnings)
      const fps = result.issues.filter(i => falsePositiveTypes.has(i.type));

      if (fps.length === 0) {
        results.clean++;
      } else {
        results.withFalsePositives++;
        for (const fp of fps) {
          results.falsePositives.push({ file, issue: fp });

          // Track unique elements/attributes being flagged
          if (fp.type.includes('element')) {
            const el = fp.element;
            results.unknownElements.set(el, (results.unknownElements.get(el) || 0) + 1);
          } else if (fp.type.includes('attribute')) {
            const key = `${fp.element}:${fp.attr}`;
            results.unknownAttributes.set(key, (results.unknownAttributes.get(key) || 0) + 1);
          }
        }
      }
    } catch (e) {
      console.log(`ERROR: ${file}: ${e.message}`);
    }
  }

  // Summary
  console.log('-'.repeat(70));
  console.log('SUMMARY');
  console.log('-'.repeat(70));
  console.log(`Total W3C files tested: ${results.total}`);
  console.log(`Clean (no false positives): ${results.clean}`);
  console.log(`With false positives: ${results.withFalsePositives}`);
  console.log(`Total false positives: ${results.falsePositives.length}`);
  console.log();

  // Show unique unknown elements
  if (results.unknownElements.size > 0) {
    console.log('-'.repeat(70));
    console.log('UNKNOWN ELEMENTS (false positives - these ARE valid SVG 1.1):');
    console.log('-'.repeat(70));
    const sortedElements = [...results.unknownElements.entries()].sort((a,b) => b[1] - a[1]);
    for (const [el, count] of sortedElements) {
      console.log(`  <${el}> - flagged ${count} times`);
    }
    console.log();
  }

  // Show unique unknown attributes
  if (results.unknownAttributes.size > 0) {
    console.log('-'.repeat(70));
    console.log('UNKNOWN ATTRIBUTES (false positives - these ARE valid SVG 1.1):');
    console.log('-'.repeat(70));
    const sortedAttrs = [...results.unknownAttributes.entries()].sort((a,b) => b[1] - a[1]);
    for (const [attr, count] of sortedAttrs.slice(0, 30)) {  // Show top 30
      console.log(`  ${attr} - flagged ${count} times`);
    }
    if (sortedAttrs.length > 30) {
      console.log(`  ... and ${sortedAttrs.length - 30} more`);
    }
    console.log();
  }

  // Detailed false positives (first 20)
  if (results.falsePositives.length > 0) {
    console.log('-'.repeat(70));
    console.log('DETAILED FALSE POSITIVES (first 20):');
    console.log('-'.repeat(70));
    for (const fp of results.falsePositives.slice(0, 20)) {
      console.log(`  ${fp.file}:`);
      console.log(`    [${fp.issue.severity}] ${fp.issue.type}`);
      console.log(`    Element: ${fp.issue.element || 'N/A'}, Attr: ${fp.issue.attr || 'N/A'}`);
      console.log(`    Reason: ${fp.issue.reason}`);
      console.log();
    }
  }

  // Final verdict
  console.log('='.repeat(70));
  if (results.falsePositives.length === 0) {
    console.log('SUCCESS: No false positives detected in W3C test suite!');
  } else {
    console.log(`FAILED: ${results.falsePositives.length} false positives found.`);
    console.log('The unknown elements/attributes listed above need to be added to the whitelist.');
  }
  console.log('='.repeat(70));
}

testW3CFalsePositives().catch(console.error);
