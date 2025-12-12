/**
 * Detailed serialization test - trace through exact output
 */

import { parsePath, serializePath, formatNumber, serializeCommand } from '../src/convert-path-data.js';

console.log('\n=== Detailed Serialization Test ===\n');

// Test case: the first path from the SVG
const original = 'M425.3 382 c0 -2.5 0.2 -3.5 0.4 -2.2 0.2 1.2 0.2 3.2 0 4.5 -0.2 1.2 -0.4 0.2 -0.4 -2.3z';

console.log('Original:', original);
console.log('');

const commands = parsePath(original);
console.log('Parsed commands:');
for (const cmd of commands) {
  console.log(`  ${cmd.command}: [${cmd.args.join(', ')}]`);
}
console.log('');

// Test formatNumber on specific values
console.log('formatNumber tests:');
const testNums = [0, -2.5, 0.2, -3.5, 0.4, -2.2, 1.2, 3.2, 4.5, -0.2, -0.4, -2.3, 425.3, 382];
for (const n of testNums) {
  console.log(`  formatNumber(${n}, 6) = "${formatNumber(n, 6)}"`);
}
console.log('');

// Test serializeCommand step by step (now returns {str, lastArgHadDecimal})
console.log('serializeCommand step by step:');
let prevCommand = null;
let prevLastArgHadDecimal = false;
for (const cmd of commands) {
  const result = serializeCommand(cmd, prevCommand, 6, prevLastArgHadDecimal);
  console.log(`  serializeCommand({${cmd.command}: [${cmd.args.join(', ')}]}, "${prevCommand}", 6, ${prevLastArgHadDecimal}) = "${result.str}"`);
  prevCommand = cmd.command;
  prevLastArgHadDecimal = result.lastArgHadDecimal;
}
console.log('');

// Full serialization
const serialized = serializePath(commands, 6);
console.log('Full serializePath output:');
console.log(serialized);
console.log('');

// Now test the problematic sequence: -2.2 followed by 0.2
console.log('=== Testing specific delimiter case: -2.2 followed by 0.2 ===');
const testCmd = { command: 'c', args: [0.4, -2.2, 0.2, 1.2, 0.2, 3.2] };
console.log('Command:', JSON.stringify(testCmd));
const testResult = serializeCommand(testCmd, 'c', 6, true); // prevLastArgHadDecimal = true
console.log('Serialized (with prevLastArgHadDecimal=true):', testResult.str);
console.log('');

// Manually trace through the args
console.log('Manual trace of args serialization:');
const precision = 6;
const formattedArgs = testCmd.args.map(n => formatNumber(n, precision));
console.log('Formatted args:', formattedArgs);

let argsStr = '';
for (let i = 0; i < formattedArgs.length; i++) {
  const arg = formattedArgs[i];
  if (i === 0) {
    argsStr = arg;
    console.log(`  [${i}] First arg: "${arg}" -> argsStr = "${argsStr}"`);
  } else {
    const prevArg = formattedArgs[i - 1];
    const prevHasDecimal = prevArg.includes('.');

    console.log(`  [${i}] arg="${arg}", prevArg="${prevArg}", prevHasDecimal=${prevHasDecimal}`);

    if (arg.startsWith('-')) {
      argsStr += arg;
      console.log(`      -> Negative sign delimiter, argsStr = "${argsStr}"`);
    } else if (arg.startsWith('.') && prevHasDecimal) {
      argsStr += arg;
      console.log(`      -> Decimal delimiter (prev has decimal), argsStr = "${argsStr}"`);
    } else {
      argsStr += ' ' + arg;
      console.log(`      -> Space delimiter needed, argsStr = "${argsStr}"`);
    }
  }
}
console.log('');
console.log('Final argsStr:', argsStr);

console.log('\n=== Done ===\n');
