/**
 * Test with SAFE serialization - always use spaces, no shortcuts
 */

import fs from 'fs';
import { parsePath } from '../src/convert-path-data.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.test.safe-serialize.svg';

/**
 * SAFE serialization - always use spaces between numbers
 */
function safeSerializePath(commands, precision = 6) {
  if (commands.length === 0) return '';

  const fmt = (n) => {
    const rounded = Math.round(n * 1e6) / 1e6;
    return rounded.toString();
  };

  let result = '';

  for (const cmd of commands) {
    if (cmd.command === 'Z' || cmd.command === 'z') {
      result += 'z';
    } else {
      // Always output the command letter
      result += cmd.command;
      // Always use spaces between all numbers
      result += cmd.args.map(fmt).join(' ');
    }
  }

  return result;
}

console.log('\n=== Test: SAFE serialization (always spaces) ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

console.log('Paths:', paths.length);

// Show first path comparison
const firstPath = paths[0];
const originalD = firstPath.getAttribute('d');
console.log('\nOriginal:');
console.log(originalD);

const commands = parsePath(originalD);
const safeD = safeSerializePath(commands);
console.log('\nSafe serialized:');
console.log(safeD);

// Apply to all paths
for (const path of paths) {
  const d = path.getAttribute('d');
  if (d) {
    const cmds = parsePath(d);
    path.setAttribute('d', safeSerializePath(cmds));
  }
}

const output = serializeSVG(doc);
fs.writeFileSync(OUTPUT_FILE, output);

console.log('\nSaved to:', OUTPUT_FILE);
console.log('Size:', (Buffer.byteLength(output) / 1024 / 1024).toFixed(2), 'MB');
console.log('\n=== If still broken, bug is in parsePath ===\n');
