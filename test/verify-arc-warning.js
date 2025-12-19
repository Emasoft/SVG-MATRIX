/**
 * Verify that console warnings are issued for malformed arc flags
 */

import { parsePath } from '../src/convert-path-data.js';

console.log('Testing console warnings for malformed arc flags...\n');

// Capture console.warn calls
const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => {
  warnings.push(args.join(' '));
  originalWarn(...args);
};

// Parse a path with invalid arc flag
const path = 'M280,120 h25 a25,25 0 6 0 -25,25 z';
console.log(`Parsing path: ${path}\n`);

const commands = parsePath(path);

console.log(`\nParsed commands: ${commands.map(c => c.command).join(' ')}`);
console.log(`\nWarnings captured: ${warnings.length}`);

if (warnings.length > 0) {
  console.log('\nWarning messages:');
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  console.log('\n✅ Warnings were properly issued');
} else {
  console.log('\n❌ No warnings were issued');
}

// Restore console.warn
console.warn = originalWarn;

// Verify the arc was skipped
const hasArc = commands.some(cmd => cmd.command === 'A' || cmd.command === 'a');
if (!hasArc) {
  console.log('✅ Invalid arc was skipped from parsed commands');
} else {
  console.log('❌ Invalid arc was NOT skipped');
}
