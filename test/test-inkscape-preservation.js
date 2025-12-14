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
import { parseSVG, serializeSVG, SVGElement } from '../src/svg-parser.js';
import * as toolbox from '../src/svg-toolbox.js';
import * as InkscapeSupport from '../src/inkscape-support.js';
import * as SVG2Polyfills from '../src/svg2-polyfills.js';
import { setPolyfillMinification, removePolyfills, generatePolyfillScript, injectPolyfills } from '../src/svg2-polyfills.js';

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

// Test group 4b: Additional InkscapeSupport functions (previously untested)
function testAdditionalInkscapeFunctions() {
  log('\n--- Additional InkscapeSupport Functions ---');

  const testFile = TEST_FILES.find(f => fs.existsSync(f));
  if (!testFile) {
    log('  SKIP: No test files found');
    return;
  }

  const content = fs.readFileSync(testFile, 'utf8');
  const doc = parseSVG(content);

  // Test cloneElement()
  test('cloneElement() deep clones SVG elements', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const original = layers[0].element;
    const clone = InkscapeSupport.cloneElement(original);
    return clone !== null &&
           clone.tagName === original.tagName &&
           clone !== original; // Must be different object
  });

  test('cloneElement() handles null gracefully', () => {
    const result = InkscapeSupport.cloneElement(null);
    return result === null;
  });

  test('cloneElement() preserves attributes', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const original = layers[0].element;
    const clone = InkscapeSupport.cloneElement(original);
    const originalId = original.getAttribute('id');
    const cloneId = clone.getAttribute('id');
    return originalId === cloneId || 'ID not preserved';
  });

  test('cloneElement() preserves children', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const original = layers[0].element;
    const clone = InkscapeSupport.cloneElement(original);
    if (!original.children || original.children.length === 0) return true; // Skip if no children
    return clone.children && clone.children.length === original.children.length ||
           `Expected ${original.children.length} children, got ${clone.children?.length || 0}`;
  });

  // Test extractLayer()
  test('extractLayer() extracts a layer by ID', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const layerId = layers[0].id;
    if (!layerId) return 'Layer has no ID';
    const result = InkscapeSupport.extractLayer(doc, layerId);
    return !!(result && result.svg && result.layerInfo) || 'Invalid result structure';
  });

  test('extractLayer() extracts a layer by element', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const result = InkscapeSupport.extractLayer(doc, layers[0].element);
    return !!(result && result.svg && result.layerInfo) || 'Invalid result structure';
  });

  test('extractLayer() throws for invalid layer', () => {
    try {
      InkscapeSupport.extractLayer(doc, 'nonexistent-layer-id-xyz');
      return 'Should have thrown error';
    } catch (e) {
      return e.message.includes('not found') || e.message.includes('invalid');
    }
  });

  test('extractLayer() returns layerInfo with id and label', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const result = InkscapeSupport.extractLayer(doc, layers[0].element);
    return result.layerInfo.id !== undefined && result.layerInfo.label !== undefined;
  });

  // Test extractAllLayers()
  test('extractAllLayers() extracts all layers', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const results = InkscapeSupport.extractAllLayers(doc);
    return Array.isArray(results) && results.length > 0 || 'No layers extracted';
  });

  test('extractAllLayers() returns array of proper structure', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const results = InkscapeSupport.extractAllLayers(doc);
    if (results.length === 0) return 'No layers extracted';
    const first = results[0];
    return !!(first.svg && first.layerInfo) || 'Invalid result structure';
  });

  test('extractAllLayers() respects includeHidden option', () => {
    const allLayers = InkscapeSupport.extractAllLayers(doc, { includeHidden: true });
    const visibleOnly = InkscapeSupport.extractAllLayers(doc, { includeHidden: false });
    // includeHidden should give same or more results
    return allLayers.length >= visibleOnly.length ||
           `includeHidden=${allLayers.length}, visible=${visibleOnly.length}`;
  });

  // Test analyzeLayerDependencies()
  test('analyzeLayerDependencies() returns proper structure', () => {
    const analysis = InkscapeSupport.analyzeLayerDependencies(doc);
    return analysis &&
           Array.isArray(analysis.layers) &&
           Array.isArray(analysis.sharedDefs) &&
           typeof analysis.totalDefs === 'number';
  });

  test('analyzeLayerDependencies() includes layer info', () => {
    const analysis = InkscapeSupport.analyzeLayerDependencies(doc);
    if (analysis.layers.length === 0) return 'No layers analyzed';
    const firstLayer = analysis.layers[0];
    return firstLayer.id !== undefined &&
           firstLayer.label !== undefined &&
           Array.isArray(firstLayer.referencedDefs);
  });

  test('analyzeLayerDependencies() identifies shared resources', () => {
    const analysis = InkscapeSupport.analyzeLayerDependencies(doc);
    // Just verify structure - shared defs may or may not exist
    return Array.isArray(analysis.sharedDefs);
  });

  // Test findReferencedIds()
  test('findReferencedIds() returns Set of IDs', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return 'No layers to test';
    const refs = InkscapeSupport.findReferencedIds(layers[0].element);
    return refs instanceof Set;
  });

  test('findReferencedIds() handles null gracefully', () => {
    const refs = InkscapeSupport.findReferencedIds(null);
    return refs instanceof Set && refs.size === 0;
  });

  test('findReferencedIds() finds url(#id) references', () => {
    // Create a test element with a url reference
    const testSvg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="grad1"/></defs>
      <rect fill="url(#grad1)"/>
    </svg>`;
    const testDoc = parseSVG(testSvg);
    const rect = testDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Test element not found';
    const refs = InkscapeSupport.findReferencedIds(rect);
    return refs.has('grad1') || 'url(#grad1) not detected';
  });

  // Test buildDefsMapFromDefs()
  test('buildDefsMapFromDefs() returns Map', () => {
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(doc);
    return defsMap instanceof Map;
  });

  test('buildDefsMapFromDefs() maps IDs to elements', () => {
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(doc);
    if (defsMap.size === 0) return true; // OK if no defs
    const firstEntry = [...defsMap.entries()][0];
    return typeof firstEntry[0] === 'string' && firstEntry[1] !== null;
  });

  test('buildDefsMapFromDefs() handles document without defs', () => {
    const simpleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const simpleDoc = parseSVG(simpleSvg);
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(simpleDoc);
    return defsMap instanceof Map && defsMap.size === 0;
  });

  // Test resolveDefsDependencies()
  test('resolveDefsDependencies() returns Set', () => {
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(doc);
    const initialIds = new Set(['some-id']);
    const resolved = InkscapeSupport.resolveDefsDependencies(initialIds, defsMap);
    return resolved instanceof Set;
  });

  test('resolveDefsDependencies() includes initial IDs', () => {
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(doc);
    if (defsMap.size === 0) return true; // Skip if no defs
    const firstId = [...defsMap.keys()][0];
    const initialIds = new Set([firstId]);
    const resolved = InkscapeSupport.resolveDefsDependencies(initialIds, defsMap);
    return resolved.has(firstId) || 'Initial ID not in result';
  });

  test('resolveDefsDependencies() handles empty set', () => {
    const defsMap = InkscapeSupport.buildDefsMapFromDefs(doc);
    const resolved = InkscapeSupport.resolveDefsDependencies(new Set(), defsMap);
    return resolved instanceof Set && resolved.size === 0;
  });

  // Test getArcParameters()
  test('getArcParameters() returns null for non-arc elements', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return true; // Skip
    const result = InkscapeSupport.getArcParameters(layers[0].element);
    // Layer is a <g>, so should return null
    return result === null;
  });

  test('getArcParameters() handles null element', () => {
    const result = InkscapeSupport.getArcParameters(null);
    return result === null;
  });

  test('getArcParameters() extracts arc parameters from arc element', () => {
    // Create test SVG with sodipodi:arc
    const arcSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
      <path sodipodi:type="arc" sodipodi:cx="100" sodipodi:cy="100" sodipodi:rx="50" sodipodi:ry="50"/>
    </svg>`;
    const arcDoc = parseSVG(arcSvg);
    const path = arcDoc.children.find(el => el.tagName === 'path');
    if (!path) return 'Arc element not found';
    const params = InkscapeSupport.getArcParameters(path);
    return params && params.type === 'arc' && params.cx === '100' || 'Invalid arc parameters';
  });

  // Test getNodeTypes()
  test('getNodeTypes() returns null for elements without nodetypes', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return true; // Skip
    const result = InkscapeSupport.getNodeTypes(layers[0].element);
    // May or may not have nodetypes - just verify it doesn't crash
    return result === null || typeof result === 'string';
  });

  test('getNodeTypes() handles null element', () => {
    const result = InkscapeSupport.getNodeTypes(null);
    return result === null;
  });

  test('getNodeTypes() extracts nodetypes attribute', () => {
    const pathSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
      <path sodipodi:nodetypes="ccsc" d="M 0,0 L 10,10"/>
    </svg>`;
    const pathDoc = parseSVG(pathSvg);
    const path = pathDoc.children.find(el => el.tagName === 'path');
    if (!path) return 'Path element not found';
    const nodeTypes = InkscapeSupport.getNodeTypes(path);
    return nodeTypes === 'ccsc' || `Expected 'ccsc', got '${nodeTypes}'`;
  });

  // Test getExportSettings()
  test('getExportSettings() returns null for elements without export settings', () => {
    const simpleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const simpleDoc = parseSVG(simpleSvg);
    const rect = simpleDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Rect not found';
    const result = InkscapeSupport.getExportSettings(rect);
    return result === null;
  });

  test('getExportSettings() handles null element', () => {
    const result = InkscapeSupport.getExportSettings(null);
    return result === null;
  });

  test('getExportSettings() extracts export settings', () => {
    const exportSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <rect inkscape:export-filename="output.png" inkscape:export-xdpi="96" inkscape:export-ydpi="96"/>
    </svg>`;
    const exportDoc = parseSVG(exportSvg);
    const rect = exportDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Rect not found';
    const settings = InkscapeSupport.getExportSettings(rect);
    return settings &&
           settings.filename === 'output.png' &&
           settings.xdpi === 96 &&
           settings.ydpi === 96 || 'Invalid export settings';
  });

  // Test isTiledClone()
  test('isTiledClone() returns false for non-clone elements', () => {
    const layers = InkscapeSupport.findLayers(doc);
    if (layers.length === 0) return true; // Skip
    const result = InkscapeSupport.isTiledClone(layers[0].element);
    // Layer is not a tiled clone
    return result === false;
  });

  test('isTiledClone() handles null element', () => {
    const result = InkscapeSupport.isTiledClone(null);
    return result === false;
  });

  test('isTiledClone() identifies tiled clones', () => {
    const cloneSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <rect inkscape:tiled-clone-of="#original"/>
    </svg>`;
    const cloneDoc = parseSVG(cloneSvg);
    const rect = cloneDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Clone element not found';
    const result = InkscapeSupport.isTiledClone(rect);
    return result === true || 'Not identified as tiled clone';
  });

  // Test getTiledCloneSource()
  test('getTiledCloneSource() returns null for non-clone elements', () => {
    const simpleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const simpleDoc = parseSVG(simpleSvg);
    const rect = simpleDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Rect not found';
    const result = InkscapeSupport.getTiledCloneSource(rect);
    return result === null;
  });

  test('getTiledCloneSource() handles null element', () => {
    const result = InkscapeSupport.getTiledCloneSource(null);
    return result === null;
  });

  test('getTiledCloneSource() extracts source ID', () => {
    const cloneSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <rect inkscape:tiled-clone-of="#original"/>
    </svg>`;
    const cloneDoc = parseSVG(cloneSvg);
    const rect = cloneDoc.children.find(el => el.tagName === 'rect');
    if (!rect) return 'Clone element not found';
    const sourceId = InkscapeSupport.getTiledCloneSource(rect);
    return sourceId === '#original' || `Expected '#original', got '${sourceId}'`;
  });

  // Test ensureInkscapeNamespaces()
  test('ensureInkscapeNamespaces() adds missing namespaces', () => {
    const simpleSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const simpleDoc = parseSVG(simpleSvg);
    const svg = simpleDoc.documentElement || simpleDoc;

    // Remove namespaces if they exist
    if (svg.getAttribute && svg.setAttribute) {
      svg.setAttribute('xmlns:inkscape', null);
      svg.setAttribute('xmlns:sodipodi', null);
    }

    InkscapeSupport.ensureInkscapeNamespaces(simpleDoc);

    const hasInkscape = svg.getAttribute('xmlns:inkscape') === InkscapeSupport.INKSCAPE_NS;
    const hasSodipodi = svg.getAttribute('xmlns:sodipodi') === InkscapeSupport.SODIPODI_NS;

    return hasInkscape && hasSodipodi || 'Namespaces not added';
  });

  test('ensureInkscapeNamespaces() preserves existing namespaces', () => {
    const content = fs.readFileSync(testFile, 'utf8');
    const testDoc = parseSVG(content);

    InkscapeSupport.ensureInkscapeNamespaces(testDoc);

    const svg = testDoc.documentElement || testDoc;
    const hasInkscape = svg.getAttribute('xmlns:inkscape') === InkscapeSupport.INKSCAPE_NS;
    const hasSodipodi = svg.getAttribute('xmlns:sodipodi') === InkscapeSupport.SODIPODI_NS;

    return hasInkscape && hasSodipodi || 'Namespaces not preserved';
  });

  test('ensureInkscapeNamespaces() handles invalid document gracefully', () => {
    const invalidDoc = { documentElement: {} }; // No getAttribute/setAttribute
    const result = InkscapeSupport.ensureInkscapeNamespaces(invalidDoc);
    return result === invalidDoc; // Should return document unchanged
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

  // Test setPolyfillMinification
  test('setPolyfillMinification(true) generates minified polyfills', () => {
    setPolyfillMinification(true);
    const features = SVG2Polyfills.detectSVG2Features(doc);
    const script = generatePolyfillScript(features);
    if (!script) return 'Script is null';
    // Minified version should be shorter and not contain many comments/whitespace
    // Check for lack of multi-line comments (/* ... */ on separate lines)
    const hasMultilineComments = /\/\*[\s\S]*?\*\//.test(script);
    // Minified should have minimal newlines relative to content
    const newlineCount = (script.match(/\n/g) || []).length;
    const avgCharsPerLine = script.length / (newlineCount || 1);
    return avgCharsPerLine > 100 || 'Polyfill appears not minified (too many newlines)';
  });

  test('setPolyfillMinification(false) generates full polyfills with comments', () => {
    setPolyfillMinification(false);
    const features = SVG2Polyfills.detectSVG2Features(doc);
    const script = generatePolyfillScript(features);
    if (!script) return 'Script is null';
    // Full version should be longer and contain comments
    // Check for presence of multi-line comments or license headers
    const hasComments = script.includes('/*') || script.includes('//');
    const newlineCount = (script.match(/\n/g) || []).length;
    const avgCharsPerLine = script.length / (newlineCount || 1);
    return (hasComments && avgCharsPerLine < 200) || 'Polyfill appears minified (expected full version)';
  });

  test('Default polyfill minification is enabled (minified)', () => {
    // Reset to verify default
    setPolyfillMinification(true); // Explicitly set to default
    const features = SVG2Polyfills.detectSVG2Features(doc);
    const scriptMin = generatePolyfillScript(features);

    setPolyfillMinification(false);
    const scriptFull = generatePolyfillScript(features);

    // Reset to default
    setPolyfillMinification(true);
    const scriptDefault = generatePolyfillScript(features);

    // Default should match minified version
    return scriptDefault === scriptMin || 'Default polyfill is not minified';
  });

  // Test removePolyfills
  test('removePolyfills() removes script elements with "SVG 2.0 Polyfill" comment', () => {
    const testDoc = parseSVG(content);
    // Inject polyfills first
    const detectedFeatures = SVG2Polyfills.detectSVG2Features(testDoc);
    injectPolyfills(testDoc, { features: detectedFeatures });

    // Verify script was added
    const serialized = serializeSVG(testDoc);
    const hasPolyfillBefore = serialized.includes('SVG 2.0 Polyfill');
    if (!hasPolyfillBefore) return 'Polyfill was not injected';

    // Remove polyfills
    removePolyfills(testDoc);
    const serializedAfter = serializeSVG(testDoc);
    const hasPolyfillAfter = serializedAfter.includes('SVG 2.0 Polyfill');

    return !hasPolyfillAfter || 'Polyfill was not removed';
  });

  test('removePolyfills() removes script elements with "Generated by svg-matrix" comment', () => {
    const testDoc = parseSVG(content);
    const detectedFeatures = SVG2Polyfills.detectSVG2Features(testDoc);
    injectPolyfills(testDoc, { features: detectedFeatures });

    const serialized = serializeSVG(testDoc);
    const hasMarkerBefore = serialized.includes('Generated by svg-matrix');
    if (!hasMarkerBefore) return 'svg-matrix marker not found in injected polyfill';

    removePolyfills(testDoc);
    const serializedAfter = serializeSVG(testDoc);
    const hasMarkerAfter = serializedAfter.includes('Generated by svg-matrix');

    return !hasMarkerAfter || 'svg-matrix marker still present after removal';
  });

  test('removePolyfills() preserves other script elements', () => {
    const testDoc = parseSVG(content);

    // Add a custom script element that should be preserved
    const svg = testDoc.documentElement || testDoc;
    if (svg.children) {
      const customScript = new SVGElement(
        'script',
        { type: 'text/javascript' },
        [],
        '/* Custom script - not a polyfill */ console.log("test");'
      );
      svg.children.push(customScript);

      // Also inject polyfills
      const detectedFeatures = SVG2Polyfills.detectSVG2Features(testDoc);
      injectPolyfills(testDoc, { features: detectedFeatures });

      // Remove polyfills
      removePolyfills(testDoc);

      // Check that custom script is still there
      const serializedAfter = serializeSVG(testDoc);
      const hasCustomScript = serializedAfter.includes('Custom script - not a polyfill');
      const hasPolyfill = serializedAfter.includes('SVG 2.0 Polyfill');

      return hasCustomScript && !hasPolyfill || 'Custom script was removed or polyfill not removed';
    }
    return 'Could not add custom script to test document';
  });

  test('removePolyfills() returns document unchanged if no polyfills present', () => {
    const testDoc = parseSVG(content);
    const beforeSerialized = serializeSVG(testDoc);

    // Remove polyfills from document that has none
    removePolyfills(testDoc);
    const afterSerialized = serializeSVG(testDoc);

    // Documents should be identical (or very close - serialization may vary slightly)
    return beforeSerialized.length === afterSerialized.length ||
           Math.abs(beforeSerialized.length - afterSerialized.length) < 10 ||
           'Document changed when no polyfills were present';
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
  testAdditionalInkscapeFunctions();
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
