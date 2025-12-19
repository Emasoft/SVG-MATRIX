/**
 * Comprehensive Matrix Test for SVG with Embedded Audio and SMIL Animations
 *
 * Tests ALL available SVG-MATRIX functions against a file with:
 * - Embedded audio (foreignObject with base64 MP3)
 * - SMIL animation elements (animate, animateTransform)
 *
 * Reports which functions:
 * 1. Complete successfully
 * 2. Break the SVG structure
 * 3. Remove or corrupt audio elements
 * 4. Remove or corrupt SMIL animation elements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SVGToolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const INPUT_FILE = '/Users/emanuelesabetta/Code/SVG-MATRIX/samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio_READONLY.svg';
const OUTPUT_FILE = '/Users/emanuelesabetta/Code/SVG-MATRIX/samples/SVG_WITH_EMBEDDED_AUDIO/matrix-test-results.txt';

// All functions to test (operations that can be applied to SVG documents)
const FUNCTIONS_TO_TEST = [
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
  'minifyStyles',
  'inlineStyles',
  'sortAttrs',
  'sortDefsChildren',
  'reusePaths',
  'removeOffCanvasPath',
  'removeStyleElement',
  'removeXlink',
  'addAttributesToSVGElement',
  'addClassesToSVGElement',
  'prefixIds',
  'removeDimensions',
  'removeAttributesBySelector',
  'removeAttrs',
  'removeElementsByAttr',
  'flattenClipPaths',
  'flattenMasks',
  'flattenGradients',
  'flattenPatterns',
  'flattenFilters',
  'flattenUseElements',
  'imageToPath',
  'flattenAll',
  'simplifyPath',
  'optimizeAnimationTiming',
  'optimizePaths',
  'simplifyPaths',
  'decomposeTransform',
  'embedExternalDependencies'
];

/**
 * Count specific elements in SVG string
 */
function countElements(svgString) {
  const counts = {
    foreignObject: (svgString.match(/<foreignObject/gi) || []).length,
    audioSource: (svgString.match(/<source[^>]+data:audio/gi) || []).length,
    animate: (svgString.match(/<animate[\s>]/gi) || []).length,
    animateTransform: (svgString.match(/<animateTransform[\s>]/gi) || []).length,
    animateMotion: (svgString.match(/<animateMotion[\s>]/gi) || []).length,
    animateColor: (svgString.match(/<animateColor[\s>]/gi) || []).length,
    set: (svgString.match(/<set[\s>]/gi) || []).length,
  };

  counts.totalAnimations = counts.animate + counts.animateTransform +
                           counts.animateMotion + counts.animateColor + counts.set;

  return counts;
}

/**
 * Check if SVG is valid (can be parsed)
 */
function isValidSVG(svgString) {
  try {
    parseSVG(svgString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Test a single function
 */
async function testFunction(functionName, originalSVG, originalCounts) {
  const result = {
    function: functionName,
    status: 'UNKNOWN',
    validSVG: false,
    audioPreserved: false,
    animationsPreserved: false,
    foreignObjectCount: 0,
    audioSourceCount: 0,
    animationCount: 0,
    error: null
  };

  try {
    // Get the function
    const fn = SVGToolbox[functionName];
    if (!fn) {
      result.status = 'NOT_FOUND';
      result.error = 'Function not found in SVGToolbox';
      return result;
    }

    // Parse the original SVG
    const doc = parseSVG(originalSVG);

    // Apply the function
    let processedDoc;
    try {
      processedDoc = await fn(doc, {});
    } catch (error) {
      result.status = 'ERROR';
      result.error = error.message;
      return result;
    }

    // Serialize the result
    let processedSVG;
    try {
      processedSVG = serializeSVG(processedDoc);
    } catch (error) {
      result.status = 'SERIALIZE_ERROR';
      result.error = error.message;
      return result;
    }

    // Check if it's valid SVG
    result.validSVG = isValidSVG(processedSVG);
    if (!result.validSVG) {
      result.status = 'INVALID_SVG';
      result.error = 'Output is not valid SVG';
      return result;
    }

    // Count elements in processed SVG
    const processedCounts = countElements(processedSVG);
    result.foreignObjectCount = processedCounts.foreignObject;
    result.audioSourceCount = processedCounts.audioSource;
    result.animationCount = processedCounts.totalAnimations;

    // Check preservation
    result.audioPreserved = (processedCounts.foreignObject >= originalCounts.foreignObject) &&
                            (processedCounts.audioSource >= originalCounts.audioSource);
    result.animationsPreserved = processedCounts.totalAnimations >= originalCounts.totalAnimations;

    // Determine overall status
    if (result.audioPreserved && result.animationsPreserved) {
      result.status = 'SUCCESS';
    } else if (!result.audioPreserved && !result.animationsPreserved) {
      result.status = 'REMOVED_BOTH';
    } else if (!result.audioPreserved) {
      result.status = 'REMOVED_AUDIO';
    } else if (!result.animationsPreserved) {
      result.status = 'REMOVED_ANIMATIONS';
    }

  } catch (error) {
    result.status = 'EXCEPTION';
    result.error = error.message;
  }

  return result;
}

/**
 * Generate text table from results
 */
function generateTable(results, originalCounts) {
  const lines = [];

  lines.push('═'.repeat(150));
  lines.push('COMPREHENSIVE SVG-MATRIX FUNCTION TEST - Audio & Animation Preservation');
  lines.push('═'.repeat(150));
  lines.push('');
  lines.push('Original SVG Element Counts:');
  lines.push(`  - foreignObject elements: ${originalCounts.foreignObject}`);
  lines.push(`  - audio source elements:  ${originalCounts.audioSource}`);
  lines.push(`  - animate elements:       ${originalCounts.animate}`);
  lines.push(`  - animateTransform:       ${originalCounts.animateTransform}`);
  lines.push(`  - animateMotion:          ${originalCounts.animateMotion}`);
  lines.push(`  - animateColor:           ${originalCounts.animateColor}`);
  lines.push(`  - set elements:           ${originalCounts.set}`);
  lines.push(`  - TOTAL animations:       ${originalCounts.totalAnimations}`);
  lines.push('');
  lines.push('═'.repeat(150));
  lines.push('');

  // Table header
  const header = `${'FUNCTION'.padEnd(35)} | ${'STATUS'.padEnd(18)} | ${'VALID'.padEnd(6)} | ${'AUDIO'.padEnd(6)} | ${'ANIM'.padEnd(6)} | ${'F.OBJ'.padEnd(6)} | ${'A.SRC'.padEnd(6)} | ${'ANIM#'.padEnd(6)} | ERROR`;
  const separator = '─'.repeat(150);

  lines.push(header);
  lines.push(separator);

  // Group results by status
  const statusOrder = ['SUCCESS', 'REMOVED_ANIMATIONS', 'REMOVED_AUDIO', 'REMOVED_BOTH',
                       'INVALID_SVG', 'ERROR', 'SERIALIZE_ERROR', 'EXCEPTION', 'NOT_FOUND'];

  const grouped = {};
  statusOrder.forEach(status => grouped[status] = []);

  results.forEach(result => {
    if (grouped[result.status]) {
      grouped[result.status].push(result);
    } else {
      grouped['EXCEPTION'] = grouped['EXCEPTION'] || [];
      grouped['EXCEPTION'].push(result);
    }
  });

  // Output results grouped by status
  statusOrder.forEach(status => {
    if (grouped[status].length > 0) {
      grouped[status].forEach(result => {
        const row = [
          result.function.padEnd(35),
          result.status.padEnd(18),
          (result.validSVG ? 'YES' : 'NO').padEnd(6),
          (result.audioPreserved ? 'YES' : 'NO').padEnd(6),
          (result.animationsPreserved ? 'YES' : 'NO').padEnd(6),
          result.foreignObjectCount.toString().padEnd(6),
          result.audioSourceCount.toString().padEnd(6),
          result.animationCount.toString().padEnd(6),
          result.error ? result.error.substring(0, 50) : ''
        ];
        lines.push(row.join(' | '));
      });
    }
  });

  lines.push(separator);
  lines.push('');

  // Summary
  lines.push('SUMMARY:');
  lines.push('─'.repeat(80));
  statusOrder.forEach(status => {
    if (grouped[status].length > 0) {
      lines.push(`  ${status.padEnd(25)}: ${grouped[status].length} functions`);
    }
  });

  lines.push('');
  lines.push('LEGEND:');
  lines.push('  SUCCESS              - Function completed and preserved all elements');
  lines.push('  REMOVED_ANIMATIONS   - Function removed SMIL animation elements');
  lines.push('  REMOVED_AUDIO        - Function removed audio/foreignObject elements');
  lines.push('  REMOVED_BOTH         - Function removed both audio and animations');
  lines.push('  INVALID_SVG          - Output is not valid/parseable SVG');
  lines.push('  ERROR                - Function threw an error during execution');
  lines.push('  SERIALIZE_ERROR      - Error serializing the result');
  lines.push('  EXCEPTION            - Unexpected exception occurred');
  lines.push('  NOT_FOUND            - Function not found in SVGToolbox');
  lines.push('');
  lines.push('═'.repeat(150));

  return lines.join('\n');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('Starting SVG-MATRIX comprehensive test...\n');

  // Read original SVG
  console.log(`Reading input file: ${INPUT_FILE}`);
  const originalSVG = fs.readFileSync(INPUT_FILE, 'utf-8');

  // Count original elements
  console.log('Analyzing original SVG...');
  const originalCounts = countElements(originalSVG);
  console.log(`Found ${originalCounts.foreignObject} foreignObject elements`);
  console.log(`Found ${originalCounts.audioSource} audio sources`);
  console.log(`Found ${originalCounts.totalAnimations} total animation elements\n`);

  // Test each function
  console.log(`Testing ${FUNCTIONS_TO_TEST.length} functions...\n`);
  const results = [];

  for (let i = 0; i < FUNCTIONS_TO_TEST.length; i++) {
    const functionName = FUNCTIONS_TO_TEST[i];
    process.stdout.write(`[${i + 1}/${FUNCTIONS_TO_TEST.length}] Testing ${functionName}... `);

    const result = await testFunction(functionName, originalSVG, originalCounts);
    results.push(result);

    console.log(result.status);
  }

  // Generate report
  console.log('\nGenerating report...');
  const report = generateTable(results, originalCounts);

  // Write to file
  console.log(`Writing results to: ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, report, 'utf-8');

  // Also print to console
  console.log('\n' + report);

  console.log(`\n✓ Test completed. Results saved to: ${OUTPUT_FILE}`);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
