/**
 * Debug: Show exact parsed numbers vs original
 */

import fs from 'fs';
import { parsePath } from '../src/convert-path-data.js';
import { parseSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

console.log('\n=== Debug: parsePath extraction ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

console.log('Total paths:', paths.length);

// Check first 5 paths in detail
for (let p = 0; p < Math.min(5, paths.length); p++) {
  const originalD = paths[p].getAttribute('d');
  if (!originalD) continue;

  console.log(`\n=== Path ${p} ===`);
  console.log('Original (first 200 chars):');
  console.log(originalD.substring(0, 200));

  const commands = parsePath(originalD);
  console.log('\nParsed commands:', commands.length);

  // Show first 10 commands in detail
  for (let i = 0; i < Math.min(10, commands.length); i++) {
    const cmd = commands[i];
    console.log(`  [${i}] ${cmd.command}: [${cmd.args.join(', ')}]`);
  }

  // Now manually re-serialize with FULL spaces and check
  let safeD = '';
  for (const cmd of commands) {
    if (cmd.command === 'Z' || cmd.command === 'z') {
      safeD += 'z ';
    } else {
      safeD += cmd.command + ' ' + cmd.args.join(' ') + ' ';
    }
  }
  safeD = safeD.trim();

  console.log('\nSafe re-serialized (first 200 chars):');
  console.log(safeD.substring(0, 200));
}

// Now let's find if there are ANY paths where the number of parsed args
// doesn't match what we'd expect from the original
console.log('\n\n=== Checking for parsing anomalies ===\n');

let anomalies = 0;
for (let p = 0; p < paths.length; p++) {
  const originalD = paths[p].getAttribute('d');
  if (!originalD) continue;

  // Count numbers in original using same regex as parsePath
  const originalNums = originalD.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || [];

  // Parse and count args
  const commands = parsePath(originalD);
  let parsedArgCount = 0;
  for (const cmd of commands) {
    parsedArgCount += cmd.args.length;
  }

  if (originalNums.length !== parsedArgCount) {
    console.log(`Path ${p}: Original has ${originalNums.length} numbers, parsed has ${parsedArgCount} args`);
    anomalies++;
    if (anomalies >= 10) {
      console.log('... (showing first 10 anomalies only)');
      break;
    }
  }
}

if (anomalies === 0) {
  console.log('No anomalies found - number counts match.');
}

console.log('\n=== Done ===\n');
