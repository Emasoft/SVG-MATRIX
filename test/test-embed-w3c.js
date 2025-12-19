/**
 * W3C-style Embed Function Test Suite
 *
 * Tests embedExternalDependencies against various SVG patterns to ensure:
 * 1. External references are properly embedded
 * 2. Vendor namespaces (inkscape:, sodipodi:, etc.) are preserved
 * 3. CDATA sections are handled correctly
 * 4. The output is valid, self-contained SVG
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedExternalDependencies } from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Test results tracking
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    results.push({ name: testName, status: 'PASS', details });
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push({ name: testName, status: 'FAIL', details });
    console.log(`  ❌ ${testName}`);
    if (details) console.log(`     ${details}`);
  }
}

// SVG test fixtures with various patterns
const TEST_FIXTURES = {
  // Test 1: Vendor namespace preservation
  vendorNamespaces: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="100" height="100"
     inkscape:version="1.3">
  <sodipodi:namedview inkscape:pageopacity="0"/>
  <rect id="rect1" x="10" y="10" width="80" height="80" fill="blue"/>
</svg>`,

  // Test 2: CDATA in script with special characters
  cdataScript: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <script type="text/javascript"><![CDATA[
    function test() {
      if (x < 10 && y > 5) {
        return "special: ]]>" + " end";
      }
    }
  ]]></script>
  <rect x="10" y="10" width="80" height="80" fill="red"/>
</svg>`,

  // Test 3: CDATA in style with special characters
  cdataStyle: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <style type="text/css"><![CDATA[
    .test { fill: blue; }
    /* Comment with < and > and & */
  ]]></style>
  <rect class="test" x="10" y="10" width="80" height="80"/>
</svg>`,

  // Test 4: Multiple vendor namespaces (Inkscape + Illustrator)
  multiVendorNamespaces: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/"
     width="200" height="200">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1"/>
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1"/>
    </linearGradient>
  </defs>
  <sodipodi:namedview inkscape:pageopacity="0.5" inkscape:zoom="1.0"/>
  <rect x="10" y="10" width="180" height="180" fill="url(#grad1)" inkscape:label="main-rect"/>
</svg>`,

  // Test 5: Nested CDATA edge case (]]> inside CDATA)
  nestedCdataEdge: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <script type="text/javascript"><![CDATA[
    var str = "Test ]]>" + " more text";
    var arr = [1, 2, 3];
  ]]></script>
  <circle cx="50" cy="50" r="40" fill="green"/>
</svg>`,

  // Test 6: Valid SVG with use element (internal reference)
  internalUse: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100">
  <defs>
    <rect id="myRect" width="50" height="30" fill="purple"/>
  </defs>
  <use href="#myRect" x="10" y="10"/>
  <use xlink:href="#myRect" x="70" y="10"/>
  <use href="#myRect" x="130" y="10"/>
</svg>`,

  // Test 7: Complex Inkscape document structure
  inkscapeComplex: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="100" height="100"
     inkscape:version="1.3 (0e150ed6c4, 2023-07-21)"
     sodipodi:docname="test.svg">
  <sodipodi:namedview
     id="namedview1"
     pagecolor="#ffffff"
     bordercolor="#000000"
     borderopacity="0.25"
     inkscape:showpageshadow="2"
     inkscape:pageopacity="0.0"
     inkscape:pagecheckerboard="0"
     inkscape:deskcolor="#d1d1d1"
     inkscape:zoom="1.5"
     inkscape:cx="50"
     inkscape:cy="50"
     inkscape:window-width="1920"
     inkscape:window-height="1080"
     inkscape:current-layer="layer1"/>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <rect x="10" y="10" width="80" height="80" fill="#ff0000" inkscape:label="Red Square"/>
  </g>
</svg>`,

  // Test 8: Figma export style
  figmaStyle: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:figma="http://www.figma.com/figma/ns"
     width="100" height="100" viewBox="0 0 100 100">
  <rect figma:layer-id="1:2" x="0" y="0" width="100" height="100" fill="#E5E5E5"/>
  <circle figma:layer-id="1:3" cx="50" cy="50" r="30" fill="#FF5722"/>
</svg>`,
};

/**
 * Verify SVG is well-formed and parseable
 */
function isValidSVG(svgString) {
  try {
    const doc = parseSVG(svgString);
    return doc !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Check if vendor namespaces are preserved
 */
function hasNamespace(svgString, prefix, uriFragment) {
  const pattern = new RegExp(`xmlns:${prefix}="[^"]*${uriFragment}[^"]*"`, 'i');
  return pattern.test(svgString);
}

/**
 * Check if CDATA sections are properly preserved/escaped
 */
function hasCDATAContent(svgString, contentFragment) {
  // Check for CDATA or properly escaped content
  const hasCDATA = svgString.includes('<![CDATA[') && svgString.includes(contentFragment);
  const hasEscaped = svgString.includes(contentFragment.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  return hasCDATA || hasEscaped;
}

/**
 * Check for broken references (undefined IDs, orphaned use elements)
 */
function checkReferences(svgString) {
  const doc = parseSVG(svgString);
  if (!doc) return { valid: false, issues: ['Failed to parse SVG'] };

  const issues = [];
  const definedIds = new Set();

  // Collect all defined IDs
  const allElements = doc.getElementsByTagName('*');
  for (const el of allElements) {
    const id = el.getAttribute('id');
    if (id) definedIds.add(id);
  }

  // Check use elements for valid references
  const useElements = doc.getElementsByTagName('use');
  for (const use of useElements) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href');
    if (href && href.startsWith('#')) {
      const refId = href.substring(1);
      if (!definedIds.has(refId)) {
        issues.push(`Broken reference: ${href}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('='.repeat(70));
  console.log('W3C-Style Embed Function Test Suite');
  console.log('='.repeat(70));
  console.log();

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Test 1: Vendor Namespace Preservation (Inkscape)
  console.log('Test 1: Vendor Namespace Preservation (Inkscape)');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.vendorNamespaces;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(hasNamespace(output, 'inkscape', 'inkscape.org'), 'Inkscape namespace preserved');
    assert(hasNamespace(output, 'sodipodi', 'sodipodi'), 'Sodipodi namespace preserved');
    assert(output.includes('inkscape:version'), 'Inkscape version attribute preserved');
    assert(output.includes('inkscape:pageopacity'), 'Inkscape-specific attributes preserved');
  }
  console.log();

  // Test 2: CDATA in Script
  console.log('Test 2: CDATA in Script with Special Characters');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.cdataScript;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    // The script content should be preserved (either as CDATA or escaped)
    assert(output.includes('function test()'), 'Script function preserved');
    assert(output.includes('x < 10') || output.includes('x &lt; 10'), 'Less-than comparison preserved');
  }
  console.log();

  // Test 3: CDATA in Style
  console.log('Test 3: CDATA in Style with Special Characters');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.cdataStyle;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(output.includes('.test'), 'CSS class selector preserved');
    assert(output.includes('fill: blue') || output.includes('fill:blue'), 'CSS property preserved');
  }
  console.log();

  // Test 4: Multiple Vendor Namespaces
  console.log('Test 4: Multiple Vendor Namespaces');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.multiVendorNamespaces;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(hasNamespace(output, 'inkscape', 'inkscape.org'), 'Inkscape namespace preserved');
    assert(hasNamespace(output, 'sodipodi', 'sodipodi'), 'Sodipodi namespace preserved');
    assert(hasNamespace(output, 'i', 'adobe.com') || hasNamespace(output, 'i', 'AdobeIllustrator'), 'Illustrator namespace preserved');
    assert(output.includes('inkscape:label'), 'Inkscape label attribute preserved');
  }
  console.log();

  // Test 5: Nested CDATA Edge Case (]]> inside)
  console.log('Test 5: CDATA Edge Case (]]> inside content)');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.nestedCdataEdge;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(output.includes('var str'), 'Script variable declaration preserved');
    // The ]]> should be handled (split CDATA or escaped)
    assert(output.includes('more text'), 'Content after ]]> preserved');
  }
  console.log();

  // Test 6: Internal Use References
  console.log('Test 6: Internal Use References');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.internalUse;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    const refCheck = checkReferences(output);
    assert(refCheck.valid, 'All internal references valid', refCheck.issues.join(', '));
    assert(output.includes('#myRect'), 'Internal reference preserved');
  }
  console.log();

  // Test 7: Complex Inkscape Document
  console.log('Test 7: Complex Inkscape Document Structure');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.inkscapeComplex;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(hasNamespace(output, 'inkscape', 'inkscape.org'), 'Inkscape namespace preserved');
    assert(hasNamespace(output, 'sodipodi', 'sodipodi'), 'Sodipodi namespace preserved');
    assert(output.includes('sodipodi:namedview'), 'Sodipodi namedview element preserved');
    assert(output.includes('inkscape:groupmode'), 'Inkscape groupmode attribute preserved');
    assert(output.includes('inkscape:label="Layer 1"'), 'Layer label preserved');
    assert(output.includes('inkscape:label="Red Square"'), 'Element label preserved');
  }
  console.log();

  // Test 8: Figma Export Style
  console.log('Test 8: Figma Export Style');
  console.log('-'.repeat(50));
  {
    const input = TEST_FIXTURES.figmaStyle;
    const output = await embedExternalDependencies(input, { basePath: __dirname });

    assert(isValidSVG(output), 'Output is valid SVG');
    assert(hasNamespace(output, 'figma', 'figma.com'), 'Figma namespace preserved');
    assert(output.includes('figma:layer-id'), 'Figma layer-id attribute preserved');
  }
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('Test Summary');
  console.log('='.repeat(70));
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log();

  // Write results to JSON
  const resultsPath = path.join(OUTPUT_DIR, 'embed-w3c-results.json');
  await fs.writeFile(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: passed + failed, passed, failed },
    tests: results
  }, null, 2));
  console.log(`Results written to: ${resultsPath}`);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
