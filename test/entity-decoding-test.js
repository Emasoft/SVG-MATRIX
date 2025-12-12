/**
 * Test entity decoding in svg-parser.js
 * Verifies that numeric entities (decimal and hex) and named entities work correctly.
 */

import { parseSVG } from '../src/svg-parser.js';

console.log('=== Entity Decoding Tests ===\n');

let passed = 0;
let failed = 0;

function test(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.log(`  ✗ ${description}`);
    failed++;
  }
}

// Test 1: Decimal numeric entities in attributes
const svg1 = '<svg><text id="&#65;&#66;&#67;">Test</text></svg>';
const root1 = parseSVG(svg1);
const text1 = root1.getElementsByTagName('text')[0];
test('Decimal entities in attributes: &#65;&#66;&#67; -> ABC', text1.getAttribute('id') === 'ABC');

// Test 2: Hex numeric entities in attributes
const svg2 = '<svg><text id="&#x41;&#x42;&#x43;">Test</text></svg>';
const root2 = parseSVG(svg2);
const text2 = root2.getElementsByTagName('text')[0];
test('Hex entities in attributes: &#x41;&#x42;&#x43; -> ABC', text2.getAttribute('id') === 'ABC');

// Test 3: Mixed entities in attributes
const svg3 = '<svg><text value="&#65;&amp;&#x42;&lt;&#67;">Test</text></svg>';
const root3 = parseSVG(svg3);
const text3 = root3.getElementsByTagName('text')[0];
test('Mixed entities in attributes: &#65;&amp;&#x42;&lt;&#67; -> A&B<C', text3.getAttribute('value') === 'A&B<C');

// Test 4: Decimal numeric entities in text content
const svg4 = '<svg><text>&#65;&#66;&#67;</text></svg>';
const root4 = parseSVG(svg4);
const text4 = root4.getElementsByTagName('text')[0];
test('Decimal entities in text content: &#65;&#66;&#67; -> ABC', text4.textContent === 'ABC');

// Test 5: Hex numeric entities in text content
const svg5 = '<svg><text>&#x41;&#x42;&#x43;</text></svg>';
const root5 = parseSVG(svg5);
const text5 = root5.getElementsByTagName('text')[0];
test('Hex entities in text content: &#x41;&#x42;&#x43; -> ABC', text5.textContent === 'ABC');

// Test 6: Mixed entities in text content
const svg6 = '<svg><text>&#65;&amp;&#x42;&lt;&#67;</text></svg>';
const root6 = parseSVG(svg6);
const text6 = root6.getElementsByTagName('text')[0];
test('Mixed entities in text content: &#65;&amp;&#x42;&lt;&#67; -> A&B<C', text6.textContent === 'A&B<C');

// Test 7: Named entities in attributes
const svg7 = '<svg><text value="&lt;&gt;&amp;&quot;&apos;">Test</text></svg>';
const root7 = parseSVG(svg7);
const text7 = root7.getElementsByTagName('text')[0];
test('Named entities in attributes: &lt;&gt;&amp;&quot;&apos; -> <>&"\'', text7.getAttribute('value') === '<>&"\'');

// Test 8: Named entities in text content
const svg8 = '<svg><text>&lt;&gt;&amp;</text></svg>';
const root8 = parseSVG(svg8);
const text8 = root8.getElementsByTagName('text')[0];
test('Named entities in text content: &lt;&gt;&amp; -> <>&', text8.textContent === '<>&');

// Test 9: DOCTYPE with internal subset (brackets)
const svg9 = `<!DOCTYPE svg [
  <!ENTITY myEntity "value">
]>
<svg><text>Test</text></svg>`;
try {
  const root9 = parseSVG(svg9);
  const text9 = root9.getElementsByTagName('text')[0];
  test('DOCTYPE with internal subset (brackets) parsed successfully', text9.textContent === 'Test');
} catch (e) {
  test('DOCTYPE with internal subset (brackets) parsed successfully', false);
}

// Test 10: Complex DOCTYPE with nested brackets
const svg10 = `<!DOCTYPE svg [
  <!ENTITY myEntity1 "value1">
  <!ENTITY myEntity2 "value2">
  <!NOTATION myNotation SYSTEM "notation.dtd">
]>
<svg><circle r="10"/></svg>`;
try {
  const root10 = parseSVG(svg10);
  const circle10 = root10.getElementsByTagName('circle')[0];
  test('Complex DOCTYPE with multiple entities parsed successfully', circle10.getAttribute('r') === '10');
} catch (e) {
  test('Complex DOCTYPE with multiple entities parsed successfully', false);
}

// Test 11: Unicode characters via hex entities
const svg11 = '<svg><text>&#x2665;&#x2764;&#x1F600;</text></svg>';
const root11 = parseSVG(svg11);
const text11 = root11.getElementsByTagName('text')[0];
test('Unicode characters via hex entities: &#x2665;&#x2764; -> ♥❤', text11.textContent.includes('♥') && text11.textContent.includes('❤'));

// Test 12: Case-insensitive hex entities
const svg12 = '<svg><text id="&#X41;&#x42;&#X43;">Test</text></svg>';
const root12 = parseSVG(svg12);
const text12 = root12.getElementsByTagName('text')[0];
test('Case-insensitive hex entities: &#X41;&#x42;&#X43; -> ABC', text12.getAttribute('id') === 'ABC');

// Test 13: Empty string handling
const svg13 = '<svg><text id="">Test</text></svg>';
const root13 = parseSVG(svg13);
const text13 = root13.getElementsByTagName('text')[0];
test('Empty attribute value handled correctly', text13.getAttribute('id') === '');

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
