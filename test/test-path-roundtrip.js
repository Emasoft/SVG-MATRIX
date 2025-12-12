/**
 * Test: Parse path and serialize it back WITHOUT any transformation
 * If this causes corruption, the bug is in parsePath or serializePath
 */

import fs from 'fs';
import { parsePath, serializePath } from '../src/convert-path-data.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.test.path-roundtrip.svg';

console.log('\n=== Test: Path parse/serialize roundtrip (no transformation) ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

console.log('Paths:', paths.length);

// Test on first path - show before/after
const firstPath = paths[0];
const originalD = firstPath.getAttribute('d');
console.log('\nFirst path ORIGINAL:');
console.log(originalD.substring(0, 300));

const commands = parsePath(originalD);
console.log('\nParsed commands count:', commands.length);
console.log('First 3 commands:', JSON.stringify(commands.slice(0, 3), null, 2));

const serialized = serializePath(commands, 6); // High precision
console.log('\nFirst path SERIALIZED:');
console.log(serialized.substring(0, 300));

// Apply to all paths
for (const path of paths) {
  const d = path.getAttribute('d');
  if (d) {
    const cmds = parsePath(d);
    const newD = serializePath(cmds, 6); // High precision to avoid rounding issues
    path.setAttribute('d', newD);
  }
}

const output = serializeSVG(doc);
fs.writeFileSync(OUTPUT_FILE, output);

console.log('\nSaved to:', OUTPUT_FILE);
console.log('\n=== If broken, bug is in parsePath or serializePath ===\n');
