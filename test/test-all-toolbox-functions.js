/**
 * Comprehensive test of all svg-toolbox functions on anime_girl.fbf.svg
 * Each function is tested individually to identify which ones produce broken output
 *
 * Usage: node test/test-all-toolbox-functions.js
 * Output: samples/toolbox-tests/ directory with individual test files
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import * as toolbox from '../src/svg-toolbox.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_DIR = 'samples/toolbox-tests';

// All testable functions from svg-toolbox.js
// Organized by category for clarity
const FUNCTIONS_TO_TEST = {
  // Cleanup functions
  cleanup: [
    'cleanupIds',
    'cleanupNumericValues',
    'cleanupListOfValues',
    'cleanupAttributes',
    'cleanupEnableBackground',
  ],

  // Remove functions
  remove: [
    'removeUnknownsAndDefaults',
    'removeNonInheritableGroupAttrs',
    'removeUselessDefs',
    'removeHiddenElements',
    'removeEmptyText',
    'removeEmptyContainers',
    'removeDoctype',
    'removeXMLProcInst',
    'removeComments',
    'removeMetadata',
    'removeTitle',
    'removeDesc',
    'removeEditorsNSData',
    'removeEmptyAttrs',
    'removeViewBox',
    'removeXMLNS',
    'removeRasterImages',
    'removeScriptElement',
    'removeStyleElement',
    'removeXlink',
    'removeDimensions',
    'removeAttrs',
    'removeElementsByAttr',
    'removeAttributesBySelector',
    'removeOffCanvasPath',
  ],

  // Convert functions
  convert: [
    'convertShapesToPath',
    'convertPathData',
    'convertTransform',
    'convertColors',
    'convertStyleToAttrs',
    'convertEllipseToCircle',
  ],

  // Collapse/Merge functions
  collapse: [
    'collapseGroups',
    'mergePaths',
  ],

  // Move functions
  move: [
    'moveGroupAttrsToElems',
    'moveElemsAttrsToGroup',
  ],

  // Style functions
  style: [
    'minifyStyles',
    'inlineStyles',
  ],

  // Sort functions
  sort: [
    'sortAttrs',
    'sortDefsChildren',
  ],

  // Path optimization functions
  pathOptimization: [
    'optimizePaths',
    'simplifyPaths',
    'simplifyPath',
    'reusePaths',
  ],

  // Flatten functions
  flatten: [
    'flattenClipPaths',
    'flattenMasks',
    'flattenGradients',
    'flattenPatterns',
    'flattenFilters',
    'flattenUseElements',
    'flattenAll',
  ],

  // Transform functions
  transform: [
    'decomposeTransform',
  ],

  // Other functions
  other: [
    'addAttributesToSVGElement',
    'addClassesToSVGElement',
    'prefixIds',
    'optimizeAnimationTiming',
  ],

  // Validation functions (these don't modify, just validate)
  validation: [
    'validateXML',
    'validateSVG',
  ],

  // Detection functions (these don't modify, just detect)
  detection: [
    'detectCollisions',
    'measureDistance',
  ],
};

// Functions to skip (not applicable or require special handling)
const SKIP_FUNCTIONS = [
  'textToPath',        // Requires font rendering
  'imageToPath',       // Requires image processing
  'detectCollisions',  // O(n^2) - too slow for large files
  'measureDistance',   // O(n^2) - too slow for large files
];

async function testFunction(fnName, originalContent, originalSize) {
  const result = {
    name: fnName,
    status: 'unknown',
    outputSize: 0,
    sizeDiff: 0,
    sizeDiffPercent: 0,
    error: null,
    outputFile: null,
  };

  try {
    // Get the function from toolbox
    const fn = toolbox[fnName];
    if (!fn) {
      result.status = 'not_found';
      result.error = `Function "${fnName}" not found in svg-toolbox`;
      return result;
    }

    if (SKIP_FUNCTIONS.includes(fnName)) {
      result.status = 'skipped';
      result.error = 'Requires special handling';
      return result;
    }

    // Parse fresh copy
    const doc = parseSVG(originalContent);

    // Apply the function
    const fnResult = await fn(doc, {});

    // Serialize the result
    const output = serializeSVG(doc);
    const outputSize = Buffer.byteLength(output);

    // Save to file
    const outputFile = path.join(OUTPUT_DIR, `${fnName}.svg`);
    fs.writeFileSync(outputFile, output);

    result.status = 'success';
    result.outputSize = outputSize;
    result.sizeDiff = outputSize - originalSize;
    result.sizeDiffPercent = ((outputSize - originalSize) / originalSize * 100).toFixed(1);
    result.outputFile = outputFile;

    // Check if output is valid (basic sanity check)
    if (output.length < 100) {
      result.status = 'warning';
      result.error = 'Output suspiciously small';
    }

  } catch (err) {
    result.status = 'error';
    result.error = err.message;
  }

  return result;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('SVG-TOOLBOX COMPREHENSIVE FUNCTION TEST');
  console.log('='.repeat(70) + '\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load original
  const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const originalSize = Buffer.byteLength(originalContent);

  console.log(`Input file: ${INPUT_FILE}`);
  console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Output directory: ${OUTPUT_DIR}/`);
  console.log('');

  const allResults = [];
  let totalFunctions = 0;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  // Test each category
  for (const [category, functions] of Object.entries(FUNCTIONS_TO_TEST)) {
    console.log(`\n--- ${category.toUpperCase()} ---`);

    for (const fnName of functions) {
      totalFunctions++;
      process.stdout.write(`  Testing ${fnName}... `);

      const result = await testFunction(fnName, originalContent, originalSize);
      allResults.push({ category, ...result });

      if (result.status === 'success') {
        successCount++;
        const sizeStr = result.sizeDiff >= 0 ? `+${result.sizeDiffPercent}%` : `${result.sizeDiffPercent}%`;
        console.log(`OK (${sizeStr})`);
      } else if (result.status === 'skipped') {
        skippedCount++;
        console.log(`SKIPPED: ${result.error}`);
      } else if (result.status === 'not_found') {
        skippedCount++;
        console.log(`NOT FOUND`);
      } else if (result.status === 'warning') {
        successCount++;
        console.log(`WARNING: ${result.error}`);
      } else {
        errorCount++;
        console.log(`ERROR: ${result.error}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total functions tested: ${totalFunctions}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Skipped: ${skippedCount}`);

  // Size comparison table
  console.log('\n' + '-'.repeat(70));
  console.log('SIZE COMPARISON (sorted by size reduction)');
  console.log('-'.repeat(70));

  const successResults = allResults
    .filter(r => r.status === 'success' || r.status === 'warning')
    .sort((a, b) => a.sizeDiff - b.sizeDiff);

  console.log('\nFunction                              Output Size    Diff');
  console.log('-'.repeat(60));

  for (const r of successResults) {
    const name = r.name.padEnd(38);
    const size = ((r.outputSize / 1024 / 1024).toFixed(2) + ' MB').padStart(10);
    const diff = (r.sizeDiff >= 0 ? '+' : '') + r.sizeDiffPercent + '%';
    console.log(`${name} ${size}    ${diff}`);
  }

  // Error details
  if (errorCount > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('ERROR DETAILS');
    console.log('-'.repeat(70));

    for (const r of allResults.filter(r => r.status === 'error')) {
      console.log(`\n${r.name}:`);
      console.log(`  ${r.error}`);
    }
  }

  // Save results to JSON for future reference
  const jsonResults = {
    timestamp: new Date().toISOString(),
    inputFile: INPUT_FILE,
    originalSize,
    results: allResults,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '_test-results.json'),
    JSON.stringify(jsonResults, null, 2)
  );

  console.log('\n' + '='.repeat(70));
  console.log(`Results saved to: ${OUTPUT_DIR}/_test-results.json`);
  console.log('Check each .svg file visually to verify correctness');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
