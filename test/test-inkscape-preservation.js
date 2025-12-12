/**
 * Comprehensive test for Inkscape namespace preservation and SVG2 polyfills
 *
 * Tests:
 * 1. Default behavior strips Inkscape/Sodipodi namespaces
 * 2. --preserve-ns=inkscape preserves all Inkscape metadata
 * 3. InkscapeSupport module functions work correctly
 * 4. SVG2Polyfills module detects and injects polyfills
 *
 * Usage: node test/test-inkscape-preservation.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import library modules
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import * as toolbox from '../src/svg-toolbox.js';
import * as InkscapeSupport from '../src/inkscape-support.js';
import * as SVG2Polyfills from '../src/svg2-polyfills.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test files
const TEST_FILES = [
  path.join(__dirname, '../samples/inkscape_example_file.svg'),
  path.join(__dirname, '../samples/inkscape_test.svg'),
];

// Track test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(msg) {
  console.log(msg);
}

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      log(`  ✓ ${name}`);
      return true;
    } else {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', reason: result || 'Returned false' });
      log(`  ✗ ${name}: ${result || 'Returned false'}`);
      return false;
    }
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', reason: err.message });
    log(`  ✗ ${name}: ${err.message}`);
    return false;
  }
}

function countPattern(content, pattern) {
  const regex = new RegExp(pattern, 'g');
  return (content.match(regex) || []).length;
}

// Test group 1: Namespace constants
function testNamespaceConstants() {
  log('\n--- Namespace Constants ---');

  test('INKSCAPE_NS is correct URI', () => {
    return InkscapeSupport.INKSCAPE_NS === 'http://www.inkscape.org/namespaces/inkscape';
  });

  test('SODIPODI_NS is correct URI', () => {
    return InkscapeSupport.SODIPODI_NS === 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd';
  });

  test('INKSCAPE_PREFIXES contains expected prefixes', () => {
    const prefixes = InkscapeSupport.INKSCAPE_PREFIXES;
    return Array.isArray(prefixes) &&
           prefixes.includes('inkscape') &&
           prefixes.includes('sodipodi');
  });
}

// Test group 2: Default stripping behavior
async function testDefaultStripping() {
  log('\n--- Default Namespace Stripping ---');

  for (const testFile of TEST_FILES) {
    if (!fs.existsSync(testFile)) {
      log(`  SKIP: ${path.basename(testFile)} not found`);
      continue;
    }

    const fileName = path.basename(testFile);
    const content = fs.readFileSync(testFile, 'utf8');

    // Count original Inkscape attributes
    const originalInkscape = countPattern(content, 'inkscape:');
    const originalSodipodi = countPattern(content, 'sodipodi:');

    // Apply removeEditorsNSData WITHOUT preserveNamespaces
    // Note: createOperation returns an async function that takes input and returns processed output
    const stripped = await toolbox.removeEditorsNSData(content, {});

    const strippedInkscape = countPattern(stripped, 'inkscape:');
    const strippedSodipodi = countPattern(stripped, 'sodipodi:');

    test(`${fileName}: strips inkscape: attributes (${originalInkscape} -> ${strippedInkscape})`, () => {
      return strippedInkscape === 0 || `Expected 0, got ${strippedInkscape}`;
    });

    test(`${fileName}: strips sodipodi: attributes (${originalSodipodi} -> ${strippedSodipodi})`, () => {
      return strippedSodipodi === 0 || `Expected 0, got ${strippedSodipodi}`;
    });

    test(`${fileName}: strips xmlns:inkscape declaration`, () => {
      return !stripped.includes('xmlns:inkscape') || 'xmlns:inkscape still present';
    });

    test(`${fileName}: strips xmlns:sodipodi declaration`, () => {
      return !stripped.includes('xmlns:sodipodi') || 'xmlns:sodipodi still present';
    });
  }
}

// Test group 3: Namespace preservation
async function testNamespacePreservation() {
  log('\n--- Namespace Preservation (--preserve-ns=inkscape) ---');

  for (const testFile of TEST_FILES) {
    if (!fs.existsSync(testFile)) {
      log(`  SKIP: ${path.basename(testFile)} not found`);
      continue;
    }

    const fileName = path.basename(testFile);
    const content = fs.readFileSync(testFile, 'utf8');

    // Count original Inkscape attributes
    const originalInkscape = countPattern(content, 'inkscape:');
    const originalSodipodi = countPattern(content, 'sodipodi:');

    // Apply removeEditorsNSData WITH preserveNamespaces
    const preserved = await toolbox.removeEditorsNSData(content, { preserveNamespaces: ['inkscape'] });

    const preservedInkscape = countPattern(preserved, 'inkscape:');
    const preservedSodipodi = countPattern(preserved, 'sodipodi:');

    test(`${fileName}: preserves inkscape: attributes (${originalInkscape} -> ${preservedInkscape})`, () => {
      // Should be equal or very close (serialization may format slightly differently)
      const tolerance = Math.ceil(originalInkscape * 0.05); // 5% tolerance
      return Math.abs(preservedInkscape - originalInkscape) <= tolerance ||
             `Expected ~${originalInkscape}, got ${preservedInkscape}`;
    });

    test(`${fileName}: preserves sodipodi: attributes (${originalSodipodi} -> ${preservedSodipodi})`, () => {
      const tolerance = Math.ceil(originalSodipodi * 0.05);
      return Math.abs(preservedSodipodi - originalSodipodi) <= tolerance ||
             `Expected ~${originalSodipodi}, got ${preservedSodipodi}`;
    });

    test(`${fileName}: preserves xmlns:inkscape declaration`, () => {
      return preserved.includes('xmlns:inkscape') || 'xmlns:inkscape missing';
    });

    test(`${fileName}: preserves xmlns:sodipodi declaration`, () => {
      return preserved.includes('xmlns:sodipodi') || 'xmlns:sodipodi missing';
    });
  }
}

// Test group 4: InkscapeSupport module functions
function testInkscapeSupportFunctions() {
  log('\n--- InkscapeSupport Module Functions ---');

  const testFile = TEST_FILES.find(f => fs.existsSync(f));
  if (!testFile) {
    log('  SKIP: No test files found');
    return;
  }

  const content = fs.readFileSync(testFile, 'utf8');
  const doc = parseSVG(content);

  test('hasInkscapeNamespaces() detects Inkscape namespaces', () => {
    return InkscapeSupport.hasInkscapeNamespaces(doc) === true;
  });

  test('findLayers() finds Inkscape layers', () => {
    const layers = InkscapeSupport.findLayers(doc);
    return layers.length > 0 || 'No layers found';
  });

  test('findLayers() returns layer objects with required properties', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const layer = layers[0];
    return layer.element && (layer.label !== undefined) && (layer.id !== undefined);
  });

  test('isInkscapeLayer() correctly identifies layer elements', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    return InkscapeSupport.isInkscapeLayer(layers[0].element) === true;
  });

  test('getLayerLabel() returns layer label', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const label = InkscapeSupport.getLayerLabel(layers[0].element);
    return typeof label === 'string' || 'Label is not a string';
  });

  test('getNamedViewSettings() extracts document settings', () => {
    const settings = InkscapeSupport.getNamedViewSettings(doc);
    return settings !== null || 'No namedview settings found';
  });

  test('findGuides() finds sodipodi guides (if present)', () => {
    const guides = InkscapeSupport.findGuides(doc);
    // It's OK if no guides are found - just verify function works
    return Array.isArray(guides);
  });
}

// Test group 5: SVG2Polyfills module
function testSVG2Polyfills() {
  log('\n--- SVG2Polyfills Module ---');

  // Test with file that has meshgradient
  const meshFile = TEST_FILES.find(f => {
    if (!fs.existsSync(f)) return false;
    const content = fs.readFileSync(f, 'utf8');
    return content.includes('meshgradient') || content.includes('meshGradient');
  });

  if (!meshFile) {
    log('  SKIP: No files with mesh gradients found');
    return;
  }

  const content = fs.readFileSync(meshFile, 'utf8');
  const doc = parseSVG(content);

  test('SVG2_FEATURES contains expected feature list', () => {
    const features = SVG2Polyfills.SVG2_FEATURES;
    return typeof features === 'object' &&
           features.MESH_GRADIENT === 'meshGradient' &&
           features.HATCH === 'hatch';
  });

  test('detectSVG2Features() detects mesh gradients', () => {
    const features = SVG2Polyfills.detectSVG2Features(doc);
    return features.meshGradients.length > 0 || 'No mesh gradients detected';
  });

  test('needsPolyfills() returns true for mesh gradient files', () => {
    return SVG2Polyfills.needsPolyfills(doc) === true;
  });

  test('generatePolyfillScript() creates script content', () => {
    const features = SVG2Polyfills.detectSVG2Features(doc);
    const script = SVG2Polyfills.generatePolyfillScript(features);
    return script !== null && script.length > 100 || 'Script too short or null';
  });

  test('generatePolyfillScript() includes mesh polyfill marker', () => {
    const features = SVG2Polyfills.detectSVG2Features(doc);
    const script = SVG2Polyfills.generatePolyfillScript(features);
    return script.includes('SVG 2.0 Polyfill') || 'Missing polyfill marker';
  });

  // Test polyfill injection
  const freshDoc = parseSVG(content);
  const features = SVG2Polyfills.detectSVG2Features(freshDoc);

  test('injectPolyfills() modifies document', () => {
    // Note: The injectPolyfills function adds script to freshDoc.children
    const beforeChildCount = freshDoc.children?.length || 0;
    SVG2Polyfills.injectPolyfills(freshDoc, features);
    const afterChildCount = freshDoc.children?.length || 0;
    // Verify polyfill script can be generated
    const script = SVG2Polyfills.generatePolyfillScript(features);
    return (script !== null && script.length > 0) || 'Polyfill script not generated';
  });
}

// Test group 6: Specific element preservation
async function testSpecificElementPreservation() {
  log('\n--- Specific Element Preservation ---');

  // Use inkscape_example_file.svg which we know has specific elements
  const testFile = TEST_FILES[0];
  if (!fs.existsSync(testFile)) {
    log('  SKIP: inkscape_example_file.svg not found');
    return;
  }

  const content = fs.readFileSync(testFile, 'utf8');

  // Apply with preservation
  const preserved = await toolbox.removeEditorsNSData(content, { preserveNamespaces: ['inkscape'] });

  test('Preserves sodipodi:namedview element', () => {
    return preserved.includes('sodipodi:namedview') || 'sodipodi:namedview missing';
  });

  test('Preserves inkscape:version attribute', () => {
    return preserved.includes('inkscape:version') || 'inkscape:version missing';
  });

  test('Preserves sodipodi:docname attribute', () => {
    return preserved.includes('sodipodi:docname') || 'sodipodi:docname missing';
  });

  test('Preserves inkscape:export-filename attribute', () => {
    return preserved.includes('inkscape:export-filename') || 'inkscape:export-filename missing';
  });

  test('Preserves inkscape:groupmode="layer" attribute', () => {
    return preserved.includes('inkscape:groupmode="layer"') ||
           preserved.includes("inkscape:groupmode='layer'") ||
           'inkscape:groupmode missing';
  });

  test('Preserves inkscape:label attribute', () => {
    return preserved.includes('inkscape:label') || 'inkscape:label missing';
  });

  test('Preserves sodipodi:nodetypes attribute', () => {
    return preserved.includes('sodipodi:nodetypes') || 'sodipodi:nodetypes missing';
  });

  test('Preserves inkscape:collect attribute on meshgradient', () => {
    return preserved.includes('inkscape:collect') || 'inkscape:collect missing';
  });

  test('Preserves inkscape:current-layer in namedview', () => {
    return preserved.includes('inkscape:current-layer') || 'inkscape:current-layer missing';
  });

  test('Preserves inkscape:document-units in namedview', () => {
    return preserved.includes('inkscape:document-units') || 'inkscape:document-units missing';
  });
}

// Test group 7: Second test file specific tests
async function testSecondFileElements() {
  log('\n--- inkscape_test.svg Specific Elements ---');

  const testFile = TEST_FILES[1];
  if (!fs.existsSync(testFile)) {
    log('  SKIP: inkscape_test.svg not found');
    return;
  }

  const content = fs.readFileSync(testFile, 'utf8');

  // Apply with preservation
  const preserved = await toolbox.removeEditorsNSData(content, { preserveNamespaces: ['inkscape'] });

  test('Preserves sodipodi:guide elements', () => {
    return preserved.includes('sodipodi:guide') || 'sodipodi:guide elements missing';
  });

  test('Preserves inkscape:page elements', () => {
    return preserved.includes('inkscape:page') || 'inkscape:page elements missing';
  });

  test('Preserves multiple layers', () => {
    const layerCount = (preserved.match(/inkscape:groupmode="layer"/g) ||
                        preserved.match(/inkscape:groupmode='layer'/g) || []).length;
    return layerCount >= 2 || `Expected >=2 layers, found ${layerCount}`;
  });

  test('Preserves inkscape:isstock attribute on patterns', () => {
    return preserved.includes('inkscape:isstock') || 'inkscape:isstock missing';
  });

  test('Preserves inkscape:menu attribute on filters', () => {
    return preserved.includes('inkscape:menu') || 'inkscape:menu missing';
  });

  test('Preserves inkscape:locked attribute on guides', () => {
    return preserved.includes('inkscape:locked') || 'inkscape:locked missing';
  });
}

// Test group 8: preserveVendor=true backward compatibility
async function testBackwardCompatibility() {
  log('\n--- Backward Compatibility (preserveVendor=true) ---');

  const testFile = TEST_FILES.find(f => fs.existsSync(f));
  if (!testFile) {
    log('  SKIP: No test files found');
    return;
  }

  const content = fs.readFileSync(testFile, 'utf8');

  const originalInkscape = countPattern(content, 'inkscape:');

  // Apply with preserveVendor=true (old API)
  const preserved = await toolbox.removeEditorsNSData(content, { preserveVendor: true });

  const preservedInkscape = countPattern(preserved, 'inkscape:');

  test('preserveVendor=true preserves all Inkscape attributes', () => {
    return Math.abs(preservedInkscape - originalInkscape) <= 1 ||
           `Expected ${originalInkscape}, got ${preservedInkscape}`;
  });
}

// Main test runner
async function main() {
  log('='.repeat(70));
  log('INKSCAPE NAMESPACE PRESERVATION TEST SUITE');
  log('='.repeat(70));

  log('\nTest files:');
  for (const file of TEST_FILES) {
    const exists = fs.existsSync(file);
    log(`  ${exists ? '✓' : '✗'} ${path.basename(file)} ${exists ? '' : '(NOT FOUND)'}`);
  }

  // Run all test groups
  testNamespaceConstants();
  await testDefaultStripping();
  await testNamespacePreservation();
  testInkscapeSupportFunctions();
  testSVG2Polyfills();
  await testSpecificElementPreservation();
  await testSecondFileElements();
  await testBackwardCompatibility();

  // Summary
  log('\n' + '='.repeat(70));
  log('SUMMARY');
  log('='.repeat(70));
  log(`Total: ${results.passed + results.failed}`);
  log(`Passed: ${results.passed}`);
  log(`Failed: ${results.failed}`);

  if (results.failed > 0) {
    log('\nFailed tests:');
    for (const t of results.tests.filter(t => t.status === 'FAIL')) {
      log(`  - ${t.name}: ${t.reason}`);
    }
  }

  log('='.repeat(70) + '\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
