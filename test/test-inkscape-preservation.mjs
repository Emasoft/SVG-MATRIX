/**
 * Comprehensive Inkscape Metadata Preservation Test
 * Tests all svg-matrix functions to ensure Inkscape metadata is preserved
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_MATRIX_DIR = path.resolve(__dirname, '..');

// Import svg-toolbox
const toolbox = await import(path.join(SVG_MATRIX_DIR, 'src/svg-toolbox.js'));

const INPUT_FILE = path.join(SVG_MATRIX_DIR, 'samples/inkscape_test.svg');
const OUTPUT_DIR = path.join(SVG_MATRIX_DIR, 'test/output/inkscape-test');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read original file
const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');

// Extract Inkscape metadata from content
function extractInkscapeMetadata(content) {
  const metadata = {
    hasInkscapeNs: content.includes('xmlns:inkscape='),
    hasSodipodiNs: content.includes('xmlns:sodipodi='),
    inkscapeVersion: (content.match(/inkscape:version="([^"]+)"/) || [])[1] || null,
    sodipodiDocname: (content.match(/sodipodi:docname="([^"]+)"/) || [])[1] || null,
    namedviewCount: (content.match(/<sodipodi:namedview/g) || []).length,
    guideCount: (content.match(/<sodipodi:guide/g) || []).length,
    inkscapePageCount: (content.match(/<inkscape:page/g) || []).length,
    inkscapeCollectCount: (content.match(/inkscape:collect="/g) || []).length,
    inkscapeLabelCount: (content.match(/inkscape:label="/g) || []).length,
    inkscapeLayerCount: (content.match(/inkscape:groupmode="layer"/g) || []).length,
    patternWithInkscapeCount: (content.match(/<pattern[^>]+inkscape:/g) || []).length,
  };
  return metadata;
}

const originalMeta = extractInkscapeMetadata(originalContent);
console.log('=== Original File Inkscape Metadata ===');
console.log(JSON.stringify(originalMeta, null, 2));

// Test results
const results = [];

// Helper to test a function
async function testFunction(fnName, options = {}) {
  const outputFile = path.join(OUTPUT_DIR, fnName + '-output.svg');
  try {
    const fn = toolbox[fnName];
    if (!fn) {
      return { fnName, status: 'SKIP', reason: 'Function not found' };
    }

    // Call the function - it returns SVG string or document
    const result = await fn(INPUT_FILE, options);

    // Write result to file
    let outputContent;
    if (typeof result === 'string') {
      outputContent = result;
    } else if (result && result.documentElement) {
      // It's a DOM document
      outputContent = toolbox.serializeSVG(result);
    } else if (result && result.output) {
      // Some functions return { doc, output, result }
      outputContent = result.output;
    } else {
      return { fnName, status: 'SKIP', reason: 'Unknown return type: ' + typeof result };
    }

    fs.writeFileSync(outputFile, outputContent);

    const outputMeta = extractInkscapeMetadata(outputContent);

    // Check preservation
    const issues = [];
    if (!outputMeta.hasInkscapeNs) issues.push('Lost xmlns:inkscape');
    if (!outputMeta.hasSodipodiNs) issues.push('Lost xmlns:sodipodi');
    if (outputMeta.inkscapeVersion !== originalMeta.inkscapeVersion) issues.push('Changed inkscape:version');
    if (outputMeta.namedviewCount < originalMeta.namedviewCount) issues.push('Lost sodipodi:namedview');
    if (outputMeta.guideCount < originalMeta.guideCount) issues.push('Lost sodipodi:guide');
    if (outputMeta.inkscapePageCount < originalMeta.inkscapePageCount) issues.push('Lost inkscape:page');

    if (issues.length > 0) {
      return { fnName, status: 'FAIL', issues, outputMeta };
    }
    return { fnName, status: 'PASS', outputMeta };
  } catch (err) {
    return { fnName, status: 'ERROR', error: err.message.substring(0, 150) };
  }
}

// List of functions to test (safe ones that should preserve metadata)
const functionsToTest = [
  'cleanupIds',
  'cleanupNumericValues',
  'cleanupAttributes',
  'removeDoctype',
  'removeComments',
  'removeHiddenElements',
  'removeEmptyContainers',
  'removeEmptyText',
  'collapseGroups',
  'minifyStyles',
  'convertStyleToAttrs',
  'inlineStyles',
  'convertShapesToPath',
  'removeDimensions',
  'addViewBox',
  'normalizeColors',
  'removeUnusedDefs',
  'removeUselessDefs',
  'removeUnusedNamespaces',
  'sortAttrs',
  'sortDefsChildren',
  'prefixIds',
];

console.log('\n=== Testing ' + functionsToTest.length + ' Functions ===');
for (const fnName of functionsToTest) {
  const result = await testFunction(fnName);
  results.push(result);
  const statusSymbol = result.status === 'PASS' ? '✓' : result.status === 'SKIP' ? '○' : '✗';
  let msg = statusSymbol + ' ' + fnName + ': ' + result.status;
  if (result.issues) msg += ' - ' + result.issues.join(', ');
  if (result.error) msg += ' - ' + result.error;
  if (result.reason) msg += ' - ' + result.reason;
  console.log(msg);
}

// Summary
console.log('\n=== Summary ===');
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const skipped = results.filter(r => r.status === 'SKIP').length;
const errored = results.filter(r => r.status === 'ERROR').length;

console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Skipped: ' + skipped);
console.log('Errors: ' + errored);

// Show failed tests in detail
if (failed > 0) {
  console.log('\n=== Failed Tests Details ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log('\n' + r.fnName + ':');
    console.log('  Issues: ' + r.issues.join(', '));
  }
}

// Show error tests in detail
if (errored > 0) {
  console.log('\n=== Error Tests Details ===');
  for (const r of results.filter(r => r.status === 'ERROR')) {
    console.log('\n' + r.fnName + ':');
    console.log('  Error: ' + r.error);
  }
}

process.exit(failed > 0 ? 1 : 0);
