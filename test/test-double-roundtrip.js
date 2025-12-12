/**
 * Double roundtrip test: parse -> serialize -> parse -> compare
 * Verifies that serialized output can be parsed back to the same commands
 */

import fs from 'fs';
import { parsePath, serializePath } from '../src/convert-path-data.js';
import { parseSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

console.log('\n=== Double Roundtrip Test ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

console.log('Total paths:', paths.length);

let errors = 0;
let checked = 0;

for (let p = 0; p < paths.length; p++) {
  const originalD = paths[p].getAttribute('d');
  if (!originalD) continue;

  checked++;

  // First roundtrip: parse original
  const commands1 = parsePath(originalD);

  // Serialize
  const serialized = serializePath(commands1, 6);

  // Second roundtrip: parse serialized
  const commands2 = parsePath(serialized);

  // Compare command counts
  if (commands1.length !== commands2.length) {
    console.log(`\nPath ${p}: Command count mismatch!`);
    console.log(`  Original parsed: ${commands1.length} commands`);
    console.log(`  Re-parsed: ${commands2.length} commands`);
    console.log(`  Original d (first 100): ${originalD.substring(0, 100)}`);
    console.log(`  Serialized (first 100): ${serialized.substring(0, 100)}`);
    errors++;
    if (errors >= 10) {
      console.log('... stopping after 10 errors');
      break;
    }
    continue;
  }

  // Compare each command
  for (let i = 0; i < commands1.length; i++) {
    const c1 = commands1[i];
    const c2 = commands2[i];

    // Command letter might differ in case (l vs L) but should be equivalent
    const cmd1 = c1.command.toLowerCase();
    const cmd2 = c2.command.toLowerCase();

    if (cmd1 !== cmd2) {
      console.log(`\nPath ${p}, cmd ${i}: Command letter mismatch: ${c1.command} vs ${c2.command}`);
      errors++;
      if (errors >= 10) break;
      continue;
    }

    // Compare args (with tolerance for floating point)
    if (c1.args.length !== c2.args.length) {
      console.log(`\nPath ${p}, cmd ${i}: Args count mismatch: ${c1.args.length} vs ${c2.args.length}`);
      errors++;
      if (errors >= 10) break;
      continue;
    }

    for (let a = 0; a < c1.args.length; a++) {
      const diff = Math.abs(c1.args[a] - c2.args[a]);
      if (diff > 1e-5) {
        console.log(`\nPath ${p}, cmd ${i}, arg ${a}: Value mismatch: ${c1.args[a]} vs ${c2.args[a]}`);
        console.log(`  Command: ${c1.command}`);
        console.log(`  Full args1: [${c1.args.join(', ')}]`);
        console.log(`  Full args2: [${c2.args.join(', ')}]`);
        console.log(`  Serialized segment: ${serialized.substring(0, 200)}`);
        errors++;
        if (errors >= 10) break;
      }
    }
    if (errors >= 10) break;
  }
  if (errors >= 10) break;

  // Progress indicator
  if (checked % 5000 === 0) {
    console.log(`Checked ${checked} paths...`);
  }
}

console.log(`\nChecked ${checked} paths`);
console.log(`Errors found: ${errors}`);

if (errors === 0) {
  console.log('\n*** SUCCESS: All paths survive double roundtrip! ***\n');
} else {
  console.log('\n*** FAILURES FOUND ***\n');
}
