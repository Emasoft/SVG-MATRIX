/**
 * Comprehensive audit test for removeEditorsNSData function
 * Tests edge cases, error handling, and feature correctness
 *
 * Usage: node test/test-removeEditorsNSData-audit.js
 */

import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { removeEditorsNSData } from '../src/svg-toolbox.js';

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

async function test(name, fn) {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      console.log(`  ✓ ${name}`);
      return true;
    } else {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', reason: result || 'Returned false' });
      console.log(`  ✗ ${name}: ${result || 'Returned false'}`);
      return false;
    }
  } catch (err) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', reason: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
    return false;
  }
}

// Helper to count patterns
function countPattern(content, pattern) {
  const regex = new RegExp(pattern, 'g');
  return (content.match(regex) || []).length;
}

// Test SVG with multiple editor namespaces
const testSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     xmlns:illustrator="http://ns.adobe.com/AdobeIllustrator/10.0/"
     xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"
     viewBox="0 0 100 100">
  <sodipodi:namedview id="base"/>
  <g inkscape:groupmode="layer" inkscape:label="Layer 1">
    <rect width="50" height="50" fill="red"
          inkscape:export-filename="test.png"
          sodipodi:nodetypes="cccc"/>
  </g>
  <path d="M 0,0 L 100,100" illustrator:type="path" sketch:id="test"/>
</svg>`;

async function runTests() {
  console.log('='.repeat(70));
  console.log('AUDIT: removeEditorsNSData Function');
  console.log('='.repeat(70));

  // ============================================================================
  // TEST GROUP 1: Edge Cases - preserveNamespaces option
  // ============================================================================
  console.log('\n--- Edge Case: preserveNamespaces Handling ---');

await test('undefined preserveNamespaces removes all namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: undefined });
  return !result.includes('inkscape:') && !result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('null preserveNamespaces removes all namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: null });
  return !result.includes('inkscape:') && !result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('empty array preserveNamespaces removes all namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: [] });
  return !result.includes('inkscape:') && !result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('preserveNamespaces with invalid values is handled gracefully', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['nonexistent', 'fake'] });
  // Should still remove all known editor namespaces
  return !result.includes('inkscape:') && !result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('preserveNamespaces with mixed valid/invalid values', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape', 'fake', 'nonexistent'] });
  // Should preserve inkscape and sodipodi (alias), remove others
  return result.includes('inkscape:') && result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('preserveNamespaces with case sensitivity (lowercase)', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape'] });
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

await test('preserveNamespaces with case sensitivity (uppercase should fail)', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['INKSCAPE'] });
  // Uppercase shouldn't match - should remove all
  return !result.includes('inkscape:') && !result.includes('sodipodi:');
});

await test('preserveNamespaces with whitespace is NOT trimmed by function (CLI responsibility)', async () => {
  // Note: CLI trims whitespace, but function itself doesn't
  // This test confirms the function expects pre-trimmed values
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: [' inkscape ', 'sodipodi'] });
  // Whitespace in array won't match "inkscape", so inkscape should be removed
  // But "sodipodi" (without whitespace) should preserve both due to alias
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

// ============================================================================
// TEST GROUP 2: Alias Handling - sodipodi/inkscape
// ============================================================================
console.log('\n--- Alias Handling: sodipodi/inkscape ---');

await test('preserving "inkscape" also preserves "sodipodi"', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape'] });
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

await test('preserving "sodipodi" also preserves "inkscape"', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['sodipodi'] });
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

await test('preserving both "inkscape" and "sodipodi" works correctly', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape', 'sodipodi'] });
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

await test('alias preservation removes non-aliased namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape'] });
  return result.includes('inkscape:') && result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

// ============================================================================
// TEST GROUP 3: Backward Compatibility - preserveVendor
// ============================================================================
console.log('\n--- Backward Compatibility: preserveVendor ---');

await test('preserveVendor=true preserves ALL editor namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveVendor: true });
  return result.includes('inkscape:') && result.includes('sodipodi:') &&
         result.includes('illustrator:') && result.includes('sketch:');
});

await test('preserveVendor=false removes all namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, { preserveVendor: false });
  return !result.includes('inkscape:') && !result.includes('sodipodi:') &&
         !result.includes('illustrator:') && !result.includes('sketch:');
});

await test('preserveVendor=true takes precedence over preserveNamespaces', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveVendor: true,
    preserveNamespaces: [] // Empty array should remove all, but preserveVendor overrides
  });
  return result.includes('inkscape:') && result.includes('sodipodi:') &&
         result.includes('illustrator:') && result.includes('sketch:');
});

await test('preserveVendor undefined with preserveNamespaces works', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveVendor: undefined,
    preserveNamespaces: ['inkscape']
  });
  return result.includes('inkscape:') && result.includes('sodipodi:');
});

// ============================================================================
// TEST GROUP 4: 4-Stage Removal Process
// ============================================================================
console.log('\n--- 4-Stage Removal Process ---');

// Stage 1: Remove editor-specific elements
await test('Stage 1: Removes sodipodi:namedview element', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('sodipodi:namedview');
});

// Stage 2: Remove editor-prefixed attributes
await test('Stage 2: Removes inkscape:export-filename attribute', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('inkscape:export-filename');
});

await test('Stage 2: Removes sodipodi:nodetypes attribute', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('sodipodi:nodetypes');
});

await test('Stage 2: Removes illustrator:type attribute', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('illustrator:type');
});

// Stage 3: Check for remaining prefixes
// Stage 4: Remove namespace declarations
await test('Stage 4: Removes xmlns:inkscape declaration', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('xmlns:inkscape');
});

await test('Stage 4: Removes xmlns:sodipodi declaration', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('xmlns:sodipodi');
});

await test('Stage 4: Removes xmlns:illustrator declaration', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('xmlns:illustrator');
});

await test('Stage 4: Removes xmlns:sketch declaration', async () => {
  const result = await removeEditorsNSData(testSVG, {});
  return !result.includes('xmlns:sketch');
});

// ============================================================================
// TEST GROUP 5: Namespace Declaration Safety (SVGO Bug #1530)
// ============================================================================
console.log('\n--- Namespace Declaration Safety (Bug #1530) ---');

// Test case: If we preserve some attributes but remove elements
const partialRemovalSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     viewBox="0 0 100 100">
  <sodipodi:namedview id="base"/>
  <rect width="50" height="50" fill="red" inkscape:label="test"/>
</svg>`;

await test('Preserves xmlns when attributes remain (inkscape)', async () => {
  const result = await removeEditorsNSData(partialRemovalSVG, { preserveNamespaces: ['inkscape'] });
  // Should keep xmlns:inkscape because inkscape:label attribute remains
  return result.includes('xmlns:inkscape') && result.includes('inkscape:label');
});

await test('Preserves xmlns when attributes remain (sodipodi)', async () => {
  const result = await removeEditorsNSData(partialRemovalSVG, { preserveNamespaces: ['inkscape'] });
  // Should keep xmlns:sodipodi because of alias with inkscape
  return result.includes('xmlns:sodipodi');
});

await test('Removes xmlns when no attributes remain', async () => {
  const cleanSVG = `<svg xmlns="http://www.w3.org/2000/svg"
                         xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
    <rect width="50" height="50" fill="red"/>
  </svg>`;
  const result = await removeEditorsNSData(cleanSVG, {});
  // No inkscape: attributes exist, so xmlns:inkscape should be removed
  return !result.includes('xmlns:inkscape');
});

// ============================================================================
// TEST GROUP 6: Multiple Namespace Preservation
// ============================================================================
console.log('\n--- Multiple Namespace Preservation ---');

await test('Preserves multiple selected namespaces', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveNamespaces: ['inkscape', 'illustrator']
  });
  return result.includes('inkscape:') && result.includes('illustrator:') &&
         !result.includes('sketch:');
});

await test('Preserves all namespaces when all specified', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveNamespaces: ['inkscape', 'sodipodi', 'illustrator', 'sketch']
  });
  return result.includes('inkscape:') && result.includes('sodipodi:') &&
         result.includes('illustrator:') && result.includes('sketch:');
});

// ============================================================================
// TEST GROUP 7: Logic Error Detection
// ============================================================================
console.log('\n--- Logic Error Detection ---');

await test('Early exit when all namespaces preserved (editorPrefixes.length === 0)', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveNamespaces: ['inkscape', 'sodipodi', 'illustrator', 'sketch', 'ai', 'serif', 'vectornator', 'figma']
  });
  // Should exit early and preserve everything
  return result.includes('inkscape:') && result.includes('illustrator:');
});

await test('Filter correctly excludes preserved namespaces from removal list', async () => {
  const result = await removeEditorsNSData(testSVG, {
    preserveNamespaces: ['sketch']
  });
  // sketch should be preserved, others removed
  return result.includes('sketch:') && !result.includes('inkscape:') && !result.includes('illustrator:');
});

// Test that normalizedPreserve Set correctly handles aliases
await test('Normalized preserve set includes both sodipodi and inkscape when either specified', async () => {
  const result1 = await removeEditorsNSData(testSVG, { preserveNamespaces: ['sodipodi'] });
  const result2 = await removeEditorsNSData(testSVG, { preserveNamespaces: ['inkscape'] });

  const has1 = result1.includes('sodipodi:') && result1.includes('inkscape:');
  const has2 = result2.includes('sodipodi:') && result2.includes('inkscape:');

  return has1 && has2 || `sodipodi preserve: ${has1}, inkscape preserve: ${has2}`;
});

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    for (const t of results.tests.filter(t => t.status === 'FAIL')) {
      console.log(`  - ${t.name}: ${t.reason}`);
    }
  }

  console.log('='.repeat(70) + '\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
