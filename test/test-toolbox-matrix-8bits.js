/**
 * Comprehensive Toolbox Function Matrix Test
 *
 * Tests ALL svg-toolbox functions on both:
 * 1. Pre-embedded 8bitsdrummachine+fonts.svg (with external dependencies)
 * 2. Post-embedded 8bitsdrummachine-embedded.svg (self-contained)
 *
 * This validates that all functions work correctly on complex real-world SVGs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import toolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_DIR = path.join(__dirname, '../samples/SVG_WITH_EXTERNAL_DEPENDENCIES');
const OUTPUT_DIR = path.join(__dirname, 'output');

// All testable functions from svg-toolbox.js organized by category
const TOOLBOX_FUNCTIONS = {
  'Category 1: Cleanup': [
    'cleanupIds',
    'cleanupNumericValues',
    'cleanupListOfValues',
    'cleanupAttributes',
    'cleanupEnableBackground',
    'removeUnknownsAndDefaults',
    'removeNonInheritableGroupAttrs',
    'removeUselessDefs',
    'removeHiddenElements',
    'removeEmptyText',
    'removeEmptyContainers',
  ],
  'Category 2: Removal': [
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
  ],
  'Category 3: Conversion': [
    'convertShapesToPath',
    'convertPathData',
    'convertTransform',
    'convertColors',
    'convertStyleToAttrs',
    'convertEllipseToCircle',
    'collapseGroups',
    'mergePaths',
    'moveGroupAttrsToElems',
    'moveElemsAttrsToGroup',
  ],
  'Category 4: Optimization': [
    'minifyStyles',
    'inlineStyles',
    'sortAttrs',
    'sortDefsChildren',
    'reusePaths',
    'removeOffCanvasPath',
    'removeStyleElement',
    'removeXlink',
  ],
  'Category 5: Adding/Modification': [
    'addAttributesToSVGElement',
    'addClassesToSVGElement',
    'prefixIds',
    'removeDimensions',
    'removeAttributesBySelector',
    'removeAttrs',
    'removeElementsByAttr',
  ],
  'Category 6: Presets': [
    'presetDefault',
    'presetNone',
    'applyPreset',
    'optimize',
    'createConfig',
  ],
  'Category 7: Bonus': [
    'flattenClipPaths',
    'flattenMasks',
    'flattenGradients',
    'flattenPatterns',
    'flattenFilters',
    'flattenUseElements',
    'flattenAll',
    'validateXML',
    'validateSVG',
    'fixInvalidSVG',
    'simplifyPath',
    'decomposeTransform',
    'optimizeAnimationTiming',
    'optimizePaths',
    'simplifyPaths',
  ],
  'Category 8: Embedding': [
    'embedExternalDependencies',
    'exportEmbeddedResources',
  ],
};

// Functions that need special handling or parameters
const SPECIAL_PARAMS = {
  addAttributesToSVGElement: { attributes: { 'data-test': 'true' } },
  addClassesToSVGElement: { classNames: ['test-class'] },
  prefixIds: { prefix: 'test_' },
  removeAttributesBySelector: { selector: '[data-nonexistent]', attrs: ['data-nonexistent'] },
  removeAttrs: { attrs: ['data-nonexistent'] },
  removeElementsByAttr: { attrs: ['data-nonexistent'] },
  applyPreset: { preset: 'default' },
  optimize: {}, // Uses default options
  simplifyPath: { tolerance: 0.5 },
  simplifyPaths: { tolerance: 0.5 },
  embedExternalDependencies: {
    embedImages: true,
    embedFonts: false,
    embedCSS: false,
    embedScripts: false,
    embedAudio: false,
    onMissingResource: 'skip',
    timeout: 5000,
  },
  exportEmbeddedResources: {
    dryRun: true,  // Don't write files during test
    extractImages: true,
    extractAudio: false,
    extractVideo: false,
    extractScripts: false,
    extractStyles: false,
    extractFonts: false,
  },
};

// Functions that return data instead of modifying SVG
const DATA_RETURNING_FUNCTIONS = [
  'validateXML',
  'validateSVG',
  'presetDefault',
  'presetNone',
  'exportEmbeddedResources',
  'createConfig',
];

// Functions that might fail on certain inputs (not errors, just expected behavior)
const EXPECTED_FAILURES = [
  'imageToPath', // Requires raster image data
  'detectCollisions', // Requires specific element setup
  'measureDistance', // Requires specific element setup
];

// Results tracking
const results = {
  preEmbed: { passed: 0, failed: 0, skipped: 0, errors: [] },
  postEmbed: { passed: 0, failed: 0, skipped: 0, errors: [] },
};

/**
 * Test a single function on an SVG
 */
async function testFunction(funcName, svgString, svgType) {
  const func = toolbox[funcName];

  if (!func) {
    return { status: 'skipped', reason: 'Function not found in exports' };
  }

  if (typeof func !== 'function') {
    return { status: 'skipped', reason: 'Not a function' };
  }

  try {
    // Parse SVG
    const doc = parseSVG(svgString);
    if (!doc) {
      return { status: 'failed', reason: 'Failed to parse input SVG' };
    }

    // Get special parameters if needed
    const params = SPECIAL_PARAMS[funcName] || {};

    // Handle data-returning functions differently
    if (DATA_RETURNING_FUNCTIONS.includes(funcName)) {
      if (funcName === 'presetDefault' || funcName === 'presetNone') {
        const result = func;
        return { status: 'passed', result: 'Preset object available' };
      } else if (funcName === 'createConfig') {
        // createConfig returns a config object
        const result = func({ precision: 5 });
        return { status: 'passed', result: `Config object created with ${Object.keys(result).length} keys` };
      } else if (funcName === 'exportEmbeddedResources') {
        // exportEmbeddedResources takes SVG string and returns {doc, extractedFiles, summary}
        const result = await func(svgString, params);
        const extracted = result.extractedFiles?.length || 0;
        return { status: 'passed', result: `Extracted ${extracted} resources` };
      } else {
        // validateXML, validateSVG
        const result = func(doc);
        return { status: 'passed', result: `Validation returned ${result?.valid !== undefined ? 'valid: ' + result.valid : 'result'}` };
      }
    }

    // Handle embedExternalDependencies (takes string, returns string)
    if (funcName === 'embedExternalDependencies') {
      const result = await func(svgString, params);
      if (!result || result.length === 0) {
        return { status: 'failed', reason: 'Empty output from embed' };
      }
      const reparsed = parseSVG(result);
      if (!reparsed) {
        return { status: 'failed', reason: 'Embedded SVG failed to parse' };
      }
      return {
        status: 'passed',
        inputSize: svgString.length,
        outputSize: result.length,
        sizeChange: ((result.length - svgString.length) / svgString.length * 100).toFixed(1) + '%',
      };
    }

    // Apply function to document
    let result;
    if (funcName === 'applyPreset') {
      result = await func(doc, toolbox.presetDefault);
    } else if (funcName === 'optimize') {
      result = await func(doc, {});
    } else if (Object.keys(params).length > 0) {
      result = await func(doc, params);
    } else {
      result = await func(doc);
    }

    // Serialize result to verify it's still valid SVG
    const outputDoc = result || doc;
    const outputSvg = serializeSVG(outputDoc);

    if (!outputSvg || outputSvg.length === 0) {
      return { status: 'failed', reason: 'Empty output after function application' };
    }

    // Verify output is parseable
    const reparsed = parseSVG(outputSvg);
    if (!reparsed) {
      return { status: 'failed', reason: 'Output SVG failed to re-parse' };
    }

    return {
      status: 'passed',
      inputSize: svgString.length,
      outputSize: outputSvg.length,
      sizeChange: ((outputSvg.length - svgString.length) / svgString.length * 100).toFixed(1) + '%',
    };

  } catch (error) {
    // Check if this is an expected failure
    if (EXPECTED_FAILURES.includes(funcName)) {
      return { status: 'skipped', reason: `Expected: ${error.message}` };
    }

    return {
      status: 'failed',
      reason: error.message,
      stack: error.stack?.split('\n').slice(0, 2).join(' | '),
    };
  }
}

/**
 * Run all function tests on an SVG
 */
async function testAllFunctionsOnSVG(svgString, svgType, svgName) {
  console.log(`\nTesting ${svgName} (${svgType})`);
  console.log('='.repeat(60));

  const testResults = results[svgType];
  const functionResults = [];

  for (const [category, functions] of Object.entries(TOOLBOX_FUNCTIONS)) {
    console.log(`\n${category}`);
    console.log('-'.repeat(40));

    for (const funcName of functions) {
      const result = await testFunction(funcName, svgString, svgType);

      if (result.status === 'passed') {
        testResults.passed++;
        console.log(`  ✅ ${funcName}`);
      } else if (result.status === 'skipped') {
        testResults.skipped++;
        console.log(`  ⏭️  ${funcName}: ${result.reason}`);
      } else {
        testResults.failed++;
        testResults.errors.push({ function: funcName, error: result.reason });
        console.log(`  ❌ ${funcName}: ${result.reason}`);
      }

      functionResults.push({
        function: funcName,
        category,
        ...result,
      });
    }
  }

  return functionResults;
}

/**
 * Generate embedded SVG if it doesn't exist
 */
async function ensureEmbeddedSVG() {
  const embeddedPath = path.join(OUTPUT_DIR, '8bitsdrummachine-embedded.svg');

  // Check if embedded version exists
  try {
    await fs.access(embeddedPath);
    console.log('Using existing embedded SVG');
    return embeddedPath;
  } catch {
    // Generate it
    console.log('Generating embedded SVG...');

    const originalPath = path.join(SAMPLE_DIR, '8bitsdrummachine+fonts.svg');
    const originalSvg = await fs.readFile(originalPath, 'utf8');

    const embeddedSvg = await toolbox.embedExternalDependencies(originalSvg, {
      basePath: originalPath,
      embedImages: true,
      embedExternalSVGs: true,
      embedCSS: true,
      embedFonts: true,
      embedScripts: true,
      embedAudio: true,
      subsetFonts: true,
      onMissingResource: 'warn',
      timeout: 60000,
    });

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(embeddedPath, embeddedSvg);
    console.log(`Generated embedded SVG: ${embeddedPath}`);

    return embeddedPath;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('='.repeat(70));
  console.log('Comprehensive Toolbox Function Matrix Test');
  console.log('Testing ALL functions on 8bitsdrummachine SVG (pre and post embed)');
  console.log('='.repeat(70));

  const startTime = Date.now();

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Load pre-embedded SVG
  const preEmbedPath = path.join(SAMPLE_DIR, '8bitsdrummachine+fonts.svg');
  let preEmbedSvg;
  try {
    preEmbedSvg = await fs.readFile(preEmbedPath, 'utf8');
    console.log(`\nLoaded pre-embed SVG: ${(preEmbedSvg.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error(`ERROR: Could not load pre-embed SVG: ${preEmbedPath}`);
    console.error(err.message);
    process.exit(1);
  }

  // Ensure and load post-embedded SVG
  const postEmbedPath = await ensureEmbeddedSVG();
  const postEmbedSvg = await fs.readFile(postEmbedPath, 'utf8');
  console.log(`Loaded post-embed SVG: ${(postEmbedSvg.length / 1024).toFixed(1)} KB`);

  // Count total functions to test
  const totalFunctions = Object.values(TOOLBOX_FUNCTIONS).flat().length;
  console.log(`\nTesting ${totalFunctions} functions on each SVG...`);

  // Test pre-embedded SVG
  const preResults = await testAllFunctionsOnSVG(
    preEmbedSvg,
    'preEmbed',
    '8bitsdrummachine+fonts.svg (PRE-EMBED)'
  );

  // Test post-embedded SVG
  const postResults = await testAllFunctionsOnSVG(
    postEmbedSvg,
    'postEmbed',
    '8bitsdrummachine-embedded.svg (POST-EMBED)'
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));

  console.log('\nPre-Embed SVG Results:');
  console.log(`  Passed:  ${results.preEmbed.passed}`);
  console.log(`  Failed:  ${results.preEmbed.failed}`);
  console.log(`  Skipped: ${results.preEmbed.skipped}`);

  console.log('\nPost-Embed SVG Results:');
  console.log(`  Passed:  ${results.postEmbed.passed}`);
  console.log(`  Failed:  ${results.postEmbed.failed}`);
  console.log(`  Skipped: ${results.postEmbed.skipped}`);

  console.log(`\nTotal time: ${totalTime}s`);

  // Print errors if any
  const allErrors = [...results.preEmbed.errors, ...results.postEmbed.errors];
  if (allErrors.length > 0) {
    console.log('\nErrors:');
    console.log('-'.repeat(50));
    for (const err of allErrors) {
      console.log(`  ${err.function}: ${err.error}`);
    }
  }

  // Write detailed results to JSON
  const resultsPath = path.join(OUTPUT_DIR, 'toolbox-matrix-8bits-results.json');
  await fs.writeFile(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration: totalTime + 's',
    summary: {
      preEmbed: {
        passed: results.preEmbed.passed,
        failed: results.preEmbed.failed,
        skipped: results.preEmbed.skipped,
      },
      postEmbed: {
        passed: results.postEmbed.passed,
        failed: results.postEmbed.failed,
        skipped: results.postEmbed.skipped,
      },
    },
    preEmbedResults: preResults,
    postEmbedResults: postResults,
    errors: allErrors,
  }, null, 2));

  console.log(`\nResults written to: ${resultsPath}`);

  // Determine success
  const totalFailed = results.preEmbed.failed + results.postEmbed.failed;
  const success = totalFailed === 0;

  console.log('\n' + (success ? 'ALL TESTS PASSED' : `${totalFailed} TESTS FAILED`));
  process.exit(success ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
