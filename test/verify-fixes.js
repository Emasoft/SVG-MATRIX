/**
 * Quick verification of critical bug fixes
 * NOTE: All toolbox functions are async and must be awaited
 */
import { parsePath, serializePath, convertPathData } from '../src/convert-path-data.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import * as toolbox from '../src/svg-toolbox.js';

async function runTests() {
  console.log('=== Verification of Bug Fixes ===\n');

  // Test 1: cleanupNumericValues - should NOT strip trailing zeros from integers
  console.log('TEST 1: cleanupNumericValues integer preservation');
  const svgWithIntegers = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100"><rect x="10" y="20" width="80" height="60"/></svg>';
  const doc1 = parseSVG(svgWithIntegers);
  await toolbox.cleanupNumericValues(doc1, { precision: 6 });
  const result1 = serializeSVG(doc1);
  const hasCorrectDimensions = result1.includes('width="400"') && result1.includes('height="400"');
  console.log(`  Integer dimensions preserved: ${hasCorrectDimensions ? 'PASS' : 'FAIL'}`);
  if (!hasCorrectDimensions) console.log(`  Result: ${result1.substring(0, 200)}...`);

  // Test 2: convertPathData - object.str.length comparison
  console.log('\nTEST 2: convertPathData absolute vs relative optimization');
  const pathWithLargeCoords = 'M100 100 L150 100 L150 150 L100 150 Z';
  // convertPathData takes a STRING d attribute (not commands array!)
  // returns { d: string, originalLength, optimizedLength, savings }
  const result2 = convertPathData(pathWithLargeCoords, { floatPrecision: 3, utilizeAbsolute: true });
  const serialized = result2.d;
  // Relative should be shorter for these coords
  const usesRelative = serialized.toLowerCase().includes('l50') || serialized.toLowerCase().includes('l0') || serialized.includes('h') || serialized.includes('v');
  console.log(`  Uses relative/shorthands: ${usesRelative ? 'PASS' : 'NEEDS REVIEW'}`);
  console.log(`  Original: ${pathWithLargeCoords} (${pathWithLargeCoords.length} chars)`);
  console.log(`  Optimized: ${serialized} (${serialized.length} chars)`);
  console.log(`  Savings: ${result2.savings} bytes`);

  // Test 3: removeXMLNS - should preserve xmlns by default
  console.log('\nTEST 3: removeXMLNS preserves SVG namespace by default');
  const svgWithNS = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect/></svg>';
  const doc3 = parseSVG(svgWithNS);
  await toolbox.removeXMLNS(doc3, {}); // Default: preserveSvgNamespace = true
  const result3 = serializeSVG(doc3);
  const preservesSvgNS = result3.includes('xmlns="http://www.w3.org/2000/svg"');
  console.log(`  SVG namespace preserved: ${preservesSvgNS ? 'PASS' : 'FAIL'}`);

  // Test 4: cleanupAttributes - should NOT remove xmlns:xlink
  console.log('\nTEST 4: cleanupAttributes preserves xmlns:xlink');
  const svgWithXlink = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#test"/></svg>';
  const doc4 = parseSVG(svgWithXlink);
  await toolbox.cleanupAttributes(doc4, {});
  const result4 = serializeSVG(doc4);
  const preservesXlinkNS = result4.includes('xmlns:xlink');
  console.log(`  xmlns:xlink preserved: ${preservesXlinkNS ? 'PASS' : 'FAIL'}`);

  // Test 5: removeXlink - should convert xlink:show to target
  console.log('\nTEST 5: removeXlink converts xlink:show to target');
  const svgWithXlinkShow = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="http://example.com" xlink:show="new"><rect/></a></svg>';
  const doc5 = parseSVG(svgWithXlinkShow);
  await toolbox.removeXlink(doc5, {});
  const result5 = serializeSVG(doc5);
  const hasTarget = result5.includes('target="_blank"');
  const noXlinkShow = !result5.includes('xlink:show');
  console.log(`  Converted xlink:show to target: ${hasTarget && noXlinkShow ? 'PASS' : 'FAIL'}`);

  // Test 6: Double roundtrip test for path serialization
  console.log('\nTEST 6: Path serialization double roundtrip');
  const complexPath = 'M10 20c0-2.5.2-3.5.4-2.2.2 1.2.2 3.2 0 4.5-.2 1.2-.4.2-.4-2.3z';
  const cmds6 = parsePath(complexPath);
  const serialized6 = serializePath(cmds6, 6);
  const cmds6b = parsePath(serialized6);
  const match = cmds6.length === cmds6b.length;
  console.log(`  Commands count match: ${match ? 'PASS' : 'FAIL'} (${cmds6.length} vs ${cmds6b.length})`);

  console.log('\n=== Verification Complete ===\n');
}

runTests().catch(console.error);
