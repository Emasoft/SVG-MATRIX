/**
 * Test that malformed arc flags are handled gracefully
 *
 * This test verifies BUG FIX #5:
 * - Invalid arc flags (values other than 0 or 1) should be skipped
 * - Processing should continue with remaining path commands
 * - No error should be thrown
 */

import { parsePath, convertPathData } from '../src/convert-path-data.js';

console.log('Testing malformed arc flag handling...\n');

// Test cases from W3C paths-data-20-f.svg
const testCases = [
  {
    name: 'Out of range large-arc-flag (6)',
    input: 'M280,120 h25 a25,25 0 6 0 -25,25 z',
    shouldSkip: true,
    description: 'Arc with flag=6 should be skipped'
  },
  {
    name: 'Negative sweep-flag (-1)',
    input: 'M360,120 h-25 a25,25 0 1 -1 25,25 z',
    shouldSkip: true,
    description: 'Arc with flag=-1 should be skipped'
  },
  {
    name: 'Out of range sweep-flag (7)',
    input: 'M280,200 h25 a25 25 0 1 7 -25 -25 z',
    shouldSkip: true,
    description: 'Arc with flag=7 should be skipped'
  },
  {
    name: 'Negative large-arc-flag (-1)',
    input: 'M360,200 h-25 a25,25 0 -1 0 25,-25 z',
    shouldSkip: true,
    description: 'Arc with flag=-1 should be skipped'
  },
  {
    name: 'Valid arc flags (0 and 1)',
    input: 'M100,100 h25 a25,25 0 1 0 -25,25 z',
    shouldSkip: false,
    description: 'Valid arc should be preserved'
  }
];

let totalTests = 0;
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  totalTests++;
  console.log(`Test ${totalTests}: ${testCase.name}`);
  console.log(`  Input: ${testCase.input}`);

  try {
    // Parse the path
    const commands = parsePath(testCase.input);

    // Check if arc was skipped or preserved
    const hasArcCommand = commands.some(cmd => cmd.command === 'A' || cmd.command === 'a');

    if (testCase.shouldSkip) {
      // Invalid arc should be skipped
      if (!hasArcCommand) {
        console.log(`  ✅ PASS: Invalid arc was skipped`);
        console.log(`  Parsed commands: ${commands.map(c => c.command).join(' ')}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: Invalid arc was NOT skipped`);
        console.log(`  Parsed commands: ${JSON.stringify(commands, null, 2)}`);
        failed++;
      }
    } else {
      // Valid arc should be preserved
      if (hasArcCommand) {
        console.log(`  ✅ PASS: Valid arc was preserved`);
        console.log(`  Parsed commands: ${commands.map(c => c.command).join(' ')}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: Valid arc was incorrectly skipped`);
        console.log(`  Parsed commands: ${commands.map(c => c.command).join(' ')}`);
        failed++;
      }
    }

    // Also test with convertPathData to ensure optimization doesn't crash
    const result = convertPathData(testCase.input);
    console.log(`  Optimized: ${result.d}`);

  } catch (err) {
    console.log(`  ❌ FAIL: Unexpected error: ${err.message}`);
    failed++;
  }

  console.log();
}

// Summary
console.log('═══════════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`Total tests: ${totalTests}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log();

if (failed === 0) {
  console.log('✅ ALL TESTS PASSED!');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
}
