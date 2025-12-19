/**
 * SVG Feature Preservation Test Suite
 *
 * Tests each svg-toolbox function against the W3C SVG 1.1 Test Suite
 * to ensure NO SVG features are incorrectly removed.
 *
 * This test suite was created after discovering that clipPath, patterns,
 * and other elements were being silently removed due to case sensitivity bugs.
 *
 * Run with: node test/test-svg-feature-preservation.js
 */

import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import * as Toolbox from '../src/svg-toolbox.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// SVG FEATURE DEFINITIONS
// ============================================================================

// All SVG elements that MUST be preserved (case-insensitive)
const SVG_ELEMENTS = [
  // Structure
  'svg', 'g', 'defs', 'symbol', 'use', 'image', 'switch', 'foreignObject',
  // Shapes
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  // Text
  'text', 'tspan', 'tref', 'textPath', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'glyphRef',
  // Gradients and Patterns
  'linearGradient', 'radialGradient', 'stop', 'pattern',
  // Clipping, Masking, Compositing
  'clipPath', 'mask',
  // Filter Effects
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
  // Markers
  'marker',
  // Color
  'color-profile',
  // Animation
  'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'mpath',
  // Fonts
  'font', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
  'glyph', 'hkern', 'missing-glyph', 'vkern',
  // Interactivity
  'a', 'view', 'cursor',
  // Metadata
  'title', 'desc', 'metadata',
  // Scripting and Styling
  'script', 'style',
];

// Attributes that reference other elements (url(#id) or href)
const REFERENCE_ATTRIBUTES = [
  'fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end',
  'href', 'xlink:href',
];

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

/**
 * Extract all SVG features from a document for comparison
 */
function extractFeatures(svgString) {
  const features = {
    elements: {},      // element tag -> count
    attributes: {},    // attribute name -> count
    references: {},    // reference id -> count of uses
    ids: new Set(),    // all element IDs
    namespaces: {},    // namespace prefix -> count
  };

  // Count elements (case-insensitive)
  for (const elem of SVG_ELEMENTS) {
    const regex = new RegExp('<' + elem + '[\\s>/]', 'gi');
    const matches = svgString.match(regex) || [];
    if (matches.length > 0) {
      features.elements[elem.toLowerCase()] = matches.length;
    }
  }

  // Count IDs
  const idMatches = svgString.matchAll(/\bid="([^"]+)"/g);
  for (const match of idMatches) {
    features.ids.add(match[1]);
  }

  // Count URL references
  const urlMatches = svgString.matchAll(/url\(#([^)]+)\)/g);
  for (const match of urlMatches) {
    const id = match[1];
    features.references[id] = (features.references[id] || 0) + 1;
  }

  // Count href references
  const hrefMatches = svgString.matchAll(/(?:xlink:)?href="#([^"]+)"/g);
  for (const match of hrefMatches) {
    const id = match[1];
    features.references[id] = (features.references[id] || 0) + 1;
  }

  // Count namespaced attributes
  const nsMatches = svgString.matchAll(/\b([a-z]+):[a-z]/gi);
  for (const match of nsMatches) {
    const ns = match[1].toLowerCase();
    if (ns !== 'xml' && ns !== 'xmlns') {
      features.namespaces[ns] = (features.namespaces[ns] || 0) + 1;
    }
  }

  return features;
}

/**
 * Compare features and return differences
 */
function compareFeatures(before, after, options = {}) {
  const differences = {
    elementsLost: {},
    elementsGained: {},
    referencesLost: {},
    idsLost: [],
    namespacesLost: {},
    totalLost: 0,
    totalGained: 0,
  };

  // Compare elements
  for (const [elem, countBefore] of Object.entries(before.elements)) {
    const countAfter = after.elements[elem] || 0;
    if (countAfter < countBefore) {
      differences.elementsLost[elem] = countBefore - countAfter;
      differences.totalLost += countBefore - countAfter;
    } else if (countAfter > countBefore) {
      differences.elementsGained[elem] = countAfter - countBefore;
      differences.totalGained += countAfter - countBefore;
    }
  }

  // Check for broken references (referenced ID no longer exists)
  for (const [refId, refCount] of Object.entries(before.references)) {
    // If the ID existed before and is still referenced, it should still exist
    if (before.ids.has(refId) && !after.ids.has(refId)) {
      // Check if it's still referenced in output
      if (after.references[refId]) {
        differences.referencesLost[refId] = refCount;
        differences.totalLost += 1;
      }
    }
  }

  // Check for lost IDs that were referenced
  for (const id of before.ids) {
    if (!after.ids.has(id)) {
      // Only count as lost if it was referenced
      if (before.references[id]) {
        differences.idsLost.push(id);
      }
    }
  }

  // Compare namespaces (only if preserveNamespaces not set)
  if (!options.preserveNamespaces) {
    // Namespaces are expected to be stripped unless preserved
  } else {
    for (const [ns, countBefore] of Object.entries(before.namespaces)) {
      const preserveNs = options.preserveNamespaces || [];
      if (preserveNs.includes(ns)) {
        const countAfter = after.namespaces[ns] || 0;
        if (countAfter < countBefore) {
          differences.namespacesLost[ns] = countBefore - countAfter;
          differences.totalLost += countBefore - countAfter;
        }
      }
    }
  }

  return differences;
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

// Functions to test - each function that modifies the DOM
const FUNCTIONS_TO_TEST = [
  { name: 'removeUnknownsAndDefaults', fn: Toolbox.removeUnknownsAndDefaults, critical: true },
  { name: 'removeHiddenElements', fn: Toolbox.removeHiddenElements, critical: true },
  { name: 'removeEmptyContainers', fn: Toolbox.removeEmptyContainers, critical: true },
  { name: 'removeEmptyText', fn: Toolbox.removeEmptyText, critical: false },
  { name: 'removeUselessDefs', fn: Toolbox.removeUselessDefs, critical: true },
  { name: 'cleanupIds', fn: Toolbox.cleanupIds, critical: false },  // IDs may be minified
  { name: 'removeEmptyAttrs', fn: Toolbox.removeEmptyAttrs, critical: false },
  { name: 'removeComments', fn: Toolbox.removeComments, critical: false },
  { name: 'removeMetadata', fn: Toolbox.removeMetadata, critical: false },
  { name: 'convertPathData', fn: Toolbox.convertPathData, critical: false },
  { name: 'collapseGroups', fn: Toolbox.collapseGroups, critical: false },
  { name: 'mergePaths', fn: Toolbox.mergePaths, critical: false },
];

// Elements that are CRITICAL - their removal is always a bug
const CRITICAL_ELEMENTS = [
  'clippath', 'mask', 'filter', 'lineargradient', 'radialgradient',
  'pattern', 'marker', 'symbol', 'use',
  'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite',
  'feconvolvematrix', 'fediffuselighting', 'fedisplacementmap',
  'fegaussianblur', 'feimage', 'femerge', 'femorphology', 'feoffset',
  'fespecularlighting', 'fetile', 'feturbulence', 'feflood', 'fedropshadow',
];

/**
 * Test a single function against an SVG file
 */
async function testFunction(funcDef, svgContent, filename, options = {}) {
  const results = {
    passed: true,
    errors: [],
    warnings: [],
  };

  try {
    const doc = parseSVG(svgContent);
    const beforeSvg = serializeSVG(doc);
    const beforeFeatures = extractFeatures(beforeSvg);

    // Apply the function
    const processed = await funcDef.fn(doc, options);
    const afterSvg = serializeSVG(processed);
    const afterFeatures = extractFeatures(afterSvg);

    // Compare
    const diff = compareFeatures(beforeFeatures, afterFeatures, options);

    // Check for critical element loss
    for (const [elem, count] of Object.entries(diff.elementsLost)) {
      if (CRITICAL_ELEMENTS.includes(elem.toLowerCase())) {
        results.passed = false;
        results.errors.push(
          `CRITICAL: ${funcDef.name} removed ${count} <${elem}> element(s) from ${filename}`
        );
      } else if (funcDef.critical) {
        results.warnings.push(
          `WARNING: ${funcDef.name} removed ${count} <${elem}> element(s) from ${filename}`
        );
      }
    }

    // Check for broken references
    if (Object.keys(diff.referencesLost).length > 0) {
      results.passed = false;
      for (const [id, count] of Object.entries(diff.referencesLost)) {
        results.errors.push(
          `BROKEN REF: ${funcDef.name} removed #${id} which is referenced ${count} time(s) in ${filename}`
        );
      }
    }

  } catch (err) {
    results.warnings.push(`PARSE ERROR in ${filename}: ${err.message}`);
  }

  return results;
}

/**
 * Test all functions against an SVG file
 */
async function testAllFunctions(svgContent, filename, options = {}) {
  const results = {
    filename,
    functions: {},
    passed: true,
    totalErrors: 0,
    totalWarnings: 0,
  };

  for (const funcDef of FUNCTIONS_TO_TEST) {
    const funcResult = await testFunction(funcDef, svgContent, filename, options);
    results.functions[funcDef.name] = funcResult;

    if (!funcResult.passed) {
      results.passed = false;
    }
    results.totalErrors += funcResult.errors.length;
    results.totalWarnings += funcResult.warnings.length;
  }

  return results;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runTests() {
  const testSuiteDir = path.join(process.cwd(), 'SVG 1.1 W3C Test Suit', 'svg');

  console.log('SVG FEATURE PRESERVATION TEST SUITE');
  console.log('====================================');
  console.log('Testing each function against W3C SVG 1.1 Test Suite\n');

  // Check if test suite exists
  if (!fs.existsSync(testSuiteDir)) {
    console.error('ERROR: SVG 1.1 W3C Test Suite not found at:', testSuiteDir);
    process.exit(1);
  }

  // Get all SVG files
  const svgFiles = fs.readdirSync(testSuiteDir)
    .filter(f => f.endsWith('.svg'))
    .sort();

  console.log(`Found ${svgFiles.length} SVG test files\n`);

  // Group files by category for better reporting
  const categories = {};
  for (const file of svgFiles) {
    const category = file.split('-').slice(0, 2).join('-');
    if (!categories[category]) categories[category] = [];
    categories[category].push(file);
  }

  // Test statistics
  const stats = {
    totalFiles: svgFiles.length,
    testedFiles: 0,
    passedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    totalErrors: 0,
    totalWarnings: 0,
    errorsByFunction: {},
    errorsByCategory: {},
    criticalErrors: [],
  };

  // Initialize error tracking
  for (const funcDef of FUNCTIONS_TO_TEST) {
    stats.errorsByFunction[funcDef.name] = 0;
  }

  // Process each category
  for (const [category, files] of Object.entries(categories)) {
    process.stdout.write(`Testing ${category} (${files.length} files)... `);

    let categoryErrors = 0;
    let categoryWarnings = 0;

    for (const file of files) {
      const filePath = path.join(testSuiteDir, file);

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const result = await testAllFunctions(content, file);

        stats.testedFiles++;

        if (result.passed) {
          stats.passedFiles++;
        } else {
          stats.failedFiles++;

          // Collect errors
          for (const [funcName, funcResult] of Object.entries(result.functions)) {
            if (funcResult.errors.length > 0) {
              stats.errorsByFunction[funcName] += funcResult.errors.length;
              stats.criticalErrors.push(...funcResult.errors);
            }
          }
        }

        categoryErrors += result.totalErrors;
        categoryWarnings += result.totalWarnings;
        stats.totalErrors += result.totalErrors;
        stats.totalWarnings += result.totalWarnings;

      } catch (err) {
        stats.skippedFiles++;
      }
    }

    stats.errorsByCategory[category] = categoryErrors;

    if (categoryErrors === 0) {
      console.log('\x1b[32mOK\x1b[0m');
    } else {
      console.log(`\x1b[31m${categoryErrors} errors\x1b[0m`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nFiles tested: ${stats.testedFiles}/${stats.totalFiles}`);
  console.log(`  Passed: \x1b[32m${stats.passedFiles}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${stats.failedFiles}\x1b[0m`);
  console.log(`  Skipped: ${stats.skippedFiles}`);

  console.log(`\nTotal errors: \x1b[31m${stats.totalErrors}\x1b[0m`);
  console.log(`Total warnings: \x1b[33m${stats.totalWarnings}\x1b[0m`);

  // Errors by function
  console.log('\nErrors by function:');
  for (const [funcName, count] of Object.entries(stats.errorsByFunction)) {
    const color = count > 0 ? '\x1b[31m' : '\x1b[32m';
    console.log(`  ${funcName}: ${color}${count}\x1b[0m`);
  }

  // Categories with errors
  const categoriesWithErrors = Object.entries(stats.errorsByCategory)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (categoriesWithErrors.length > 0) {
    console.log('\nCategories with errors:');
    for (const [cat, count] of categoriesWithErrors.slice(0, 10)) {
      console.log(`  ${cat}: \x1b[31m${count}\x1b[0m`);
    }
  }

  // Print first 20 critical errors
  if (stats.criticalErrors.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('CRITICAL ERRORS (first 20):');
    console.log('='.repeat(70));
    for (const err of stats.criticalErrors.slice(0, 20)) {
      console.log(`\x1b[31m  ${err}\x1b[0m`);
    }
    if (stats.criticalErrors.length > 20) {
      console.log(`  ... and ${stats.criticalErrors.length - 20} more`);
    }
  }

  console.log('\n' + '='.repeat(70));

  // Exit with error code if tests failed
  if (stats.totalErrors > 0) {
    console.log('\x1b[31mTEST SUITE FAILED\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mALL TESTS PASSED\x1b[0m');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
