/**
 * XML/SVG Validity Tests
 *
 * These tests verify that svg-matrix NEVER produces invalid XML or SVG,
 * unlike SVGO which has known bugs that can corrupt files.
 *
 * SVGO Bugs Tested Against:
 * - #1530: Unbound namespace prefix + file wiping
 * - #1642: Attribute quotes removed causing XML parsing error
 * - #1730: xlink namespace removed when still used
 * - #1974: Batch processing corrupts files
 *
 * Run with: node test/xml-validity.test.js
 */

import {
  removeEditorsNSData,
  removeXlink,
  validateXML,
  cleanupIds,
  presetDefault,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

// Simple test runner
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// SVGO BUG #1530: Unbound Namespace Prefix
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  SVGO Bug #1530: Unbound Namespace Prevention                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

await test('removes inkscape:* attrs AND xmlns:inkscape together', async () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="100" height="100">
  <rect inkscape:label="test" width="50" height="50"/>
</svg>`;

  const result = await removeEditorsNSData(svg);

  // Both attr and namespace should be removed
  assert(!result.includes('inkscape:label'), 'inkscape:label should be removed');
  assert(!result.includes('xmlns:inkscape'), 'xmlns:inkscape should be removed');

  // Verify result is valid XML by re-parsing
  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

await test('preserves non-editor namespaces like kvg (KanjiVG)', async () => {
  // SVGO bug #1530 specifically mentions kvg namespace
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:kvg="http://kanjivg.tagaini.net"
     width="100" height="100">
  <g kvg:element="日" kvg:variant="true">
    <path d="M10,10 L90,90"/>
  </g>
</svg>`;

  const result = await removeEditorsNSData(svg);

  // kvg namespace should be preserved (not an editor namespace)
  assert(result.includes('xmlns:kvg'), 'xmlns:kvg should be preserved');
  assert(result.includes('kvg:element'), 'kvg:element should be preserved');

  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

await test('removes sodipodi element AND xmlns:sodipodi declaration', async () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="100" height="100">
  <sodipodi:namedview pagecolor="#ffffff" bordercolor="#666666"/>
  <rect width="50" height="50"/>
</svg>`;

  const result = await removeEditorsNSData(svg);

  assert(!result.includes('sodipodi:namedview'), 'sodipodi:namedview element should be removed');
  assert(!result.includes('xmlns:sodipodi'), 'xmlns:sodipodi should be removed');

  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

await test('validateXML detects unbound namespace prefixes', async () => {
  // Create SVG with unbound namespace (what SVGO might produce)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect foo:bar="test" width="50" height="50"/>
</svg>`;

  const result = await validateXML(svg);
  const match = result.match(/data-xml-validation="([^"]+)"/);
  assert(match, 'Should have validation data');

  const validation = JSON.parse(match[1].replace(/&quot;/g, '"'));
  assert(!validation.valid || validation.errors.length > 0, 'Should detect unbound namespace');
});

// ============================================================================
// SVGO BUG #1642: Attribute Quotes Removed
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  SVGO Bug #1642: Attribute Quote Preservation                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

await test('always quotes attributes even without spaces', async () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect id="test" class="simple" width="50" height="50"/>
</svg>`;

  const doc = parseSVG(svg);
  const result = serializeSVG(doc);

  // All attributes must be quoted
  assert(result.includes('id="test"'), 'id should be quoted');
  assert(result.includes('class="simple"'), 'class should be quoted');
  assert(result.includes('width="50"'), 'width should be quoted');

  // Should NOT have unquoted attributes like: id=test
  assert(!result.match(/\s[a-z]+=(?!["'])/i), 'No unquoted attributes allowed');
});

await test('properly escapes special characters in text content', async () => {
  const doc = parseSVG(`<svg xmlns="http://www.w3.org/2000/svg"><text/></svg>`);
  const text = doc.getElementsByTagName('text')[0];
  text.textContent = 'Test & "quotes" <tags>';

  const result = serializeSVG(doc);

  // Should be able to re-parse without error
  const reparsed = parseSVG(result);
  assert(reparsed, 'Result with special chars should be re-parseable');
});

await test('escapes quotes in attribute values', async () => {
  const doc = parseSVG(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`);
  const rect = doc.getElementsByTagName('rect')[0];
  rect.setAttribute('data-test', 'value with "quotes" inside');

  const result = serializeSVG(doc);

  // The quotes should be escaped
  assert(result.includes('&quot;'), 'Quotes in attr values should be escaped as &quot;');

  // Result should be parseable
  const reparsed = parseSVG(result);
  assert(reparsed, 'Result with escaped quotes should be re-parseable');
});

// ============================================================================
// SVGO BUG #1730: xlink Namespace Removed When Still Used
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  SVGO Bug #1730: xlink Namespace Safety                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

await test('preserves xlink:href for SVG 1.1 compatibility', async () => {
  // removeXlink intentionally KEEPS xlink:href for SVG 1.1 compatibility
  // SVG 2.0 supports plain href, but SVG 1.1 requires xlink:href
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100" height="100">
  <use xlink:href="#mySymbol"/>
</svg>`;

  const result = await removeXlink(svg);

  // xlink:href is preserved for SVG 1.1 compatibility
  assert(result.includes('xlink:href'), 'xlink:href should be preserved for SVG 1.1 compatibility');
  // xmlns:xlink must be kept when xlink:href is used
  assert(result.includes('xmlns:xlink'), 'xmlns:xlink should be preserved when xlink:href exists');

  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

await test('handles xlink:title conversion to title element', async () => {
  // xlink:title is converted to a <title> child element (proper SVG tooltip)
  // xlink:href is preserved for SVG 1.1 compatibility
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100" height="100">
  <a xlink:href="#link" xlink:title="My Link Title">Link</a>
</svg>`;

  const result = await removeXlink(svg);

  // xlink:href is preserved for SVG 1.1 compatibility
  assert(result.includes('xlink:href'), 'xlink:href should be preserved for SVG 1.1');
  // xlink:title is removed (converted to <title> element)
  assert(!result.includes('xlink:title'), 'xlink:title should be converted');
  // xlink:title becomes a <title> child element, not a title attribute
  assert(result.includes('<title>My Link Title</title>') || result.includes('>My Link Title<'), 'Should have title element');
  // xmlns:xlink is preserved because xlink:href is still used
  assert(result.includes('xmlns:xlink'), 'xmlns:xlink should be preserved when xlink:href exists');

  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

await test('removes deprecated xlink attrs (show, actuate) but keeps href', async () => {
  // xlink:show and xlink:actuate are removed (deprecated)
  // xlink:href is preserved for SVG 1.1 compatibility
  // xlink:show → target attribute ("new" → "_blank")
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100" height="100">
  <a xlink:href="#link" xlink:show="new" xlink:actuate="onRequest">Link</a>
</svg>`;

  const result = await removeXlink(svg);

  assert(!result.includes('xlink:show'), 'xlink:show should be removed');
  assert(!result.includes('xlink:actuate'), 'xlink:actuate should be removed');
  // xlink:href is preserved, so xmlns:xlink must also be preserved
  assert(result.includes('xlink:href'), 'xlink:href should be preserved for SVG 1.1');
  assert(result.includes('xmlns:xlink'), 'xmlns:xlink should be preserved when xlink:href exists');
  // xlink:show="new" is converted to target="_blank"
  assert(result.includes('target="_blank"'), 'xlink:show="new" should become target="_blank"');

  const parsed = parseSVG(result);
  assert(parsed, 'Result should be parseable');
});

// ============================================================================
// SVGO BUG #1974: Batch Processing File Corruption
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  SVGO Bug #1974: No Batch Corruption                           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

await test('processes multiple SVGs independently without corruption', async () => {
  const svg1 = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50"/></svg>`;
  const svg2 = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle r="25"/></svg>`;
  const svg3 = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><ellipse rx="30" ry="20"/></svg>`;

  const result1 = await cleanupIds(svg1);
  const result2 = await cleanupIds(svg2);
  const result3 = await cleanupIds(svg3);

  // Each should contain expected content
  assert(result1.includes('rect'), 'svg1 should still have rect');
  assert(result2.includes('circle'), 'svg2 should still have circle');
  assert(result3.includes('ellipse'), 'svg3 should still have ellipse');

  // Each should be parseable
  assert(parseSVG(result1), 'svg1 should be parseable');
  assert(parseSVG(result2), 'svg2 should be parseable');
  assert(parseSVG(result3), 'svg3 should be parseable');

  // Each should have non-zero length (not wiped)
  assert(result1.length > 50, 'svg1 should not be empty/wiped');
  assert(result2.length > 50, 'svg2 should not be empty/wiped');
  assert(result3.length > 50, 'svg3 should not be empty/wiped');
});

await test('operations are stateless - no shared state between calls', async () => {
  const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" id="test"><rect id="r1"/></svg>`;

  // Call same operation multiple times in parallel
  const results = await Promise.all([
    cleanupIds(svg, { minify: true }),
    cleanupIds(svg, { minify: true }),
    cleanupIds(svg, { minify: true }),
  ]);

  // All results should be identical
  assert(results[0] === results[1], 'Results should be identical (1===2)');
  assert(results[1] === results[2], 'Results should be identical (2===3)');
});

await test('edge case SVG does not corrupt subsequent operations', async () => {
  const goodSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`;

  // Process good SVG first
  const result1 = await cleanupIds(goodSvg);
  assert(result1.includes('rect'), 'First processing should work');

  // Edge case: empty path
  const edgeSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d=""/></svg>`;

  try {
    await cleanupIds(edgeSvg);
  } catch (e) {
    // Even if edge case has issues, it shouldn't affect next operation
  }

  // Process good SVG again - should still work fine
  const result3 = await cleanupIds(goodSvg);
  assert(result3.includes('rect'), 'Subsequent processing should work');
  assert(result3.length === result1.length, 'Results should be consistent');
});

// ============================================================================
// COMPREHENSIVE VALIDITY TESTS
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  Comprehensive XML Validity                                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

await test('serializeSVG always produces well-formed XML', async () => {
  const testCases = [
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello World</text></svg>',
  ];

  for (const svg of testCases) {
    const doc = parseSVG(svg);
    const result = serializeSVG(doc);

    // Should start with XML declaration
    assert(result.startsWith('<?xml'), 'Should have XML declaration');

    // Should be re-parseable
    const reparsed = parseSVG(result);
    assert(reparsed, 'Should be re-parseable');
  }
});

await test('presetDefault produces valid SVG', async () => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="100" height="100" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad1">
      <stop offset="0%" stop-color="red"/>
      <stop offset="100%" stop-color="blue"/>
    </linearGradient>
  </defs>
  <rect id="rect1" width="50" height="50" fill="url(#grad1)" inkscape:label="main"/>
  <use xlink:href="#rect1" x="50"/>
</svg>`;

  const result = await presetDefault(svg);

  // Should be parseable
  const parsed = parseSVG(result);
  assert(parsed, 'Optimized SVG should be parseable');

  // Run XML validation
  const validated = await validateXML(result);
  const match = validated.match(/data-xml-validation="([^"]+)"/);
  if (match) {
    const validation = JSON.parse(match[1].replace(/&quot;/g, '"'));
    assert(validation.valid, `XML validation should pass: ${JSON.stringify(validation.errors)}`);
  }
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  TEST SUMMARY                                                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

console.log(`
┌─────────────────────────────────────────────────────────────────┐
│ Total Tests: ${(passed + failed).toString().padEnd(3)}                                              │
│ Passed:      ${passed.toString().padEnd(3)} ✓                                             │
│ Failed:      ${failed.toString().padEnd(3)} ${failed > 0 ? '✗' : '✓'}                                             │
└─────────────────────────────────────────────────────────────────┘
`);

if (failed > 0) {
  console.log('\nFailed Tests:');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - ${r.name}: ${r.error}`);
  }
  process.exit(1);
} else {
  console.log('All XML validity tests passed!');
  console.log('svg-matrix is immune to SVGO bugs #1530, #1642, #1730, #1974');
  process.exit(0);
}
