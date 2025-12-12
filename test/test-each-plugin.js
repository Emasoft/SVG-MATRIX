/**
 * Test each encoding plugin individually to find which one causes corruption
 */

import fs from 'fs';
import {
  floatPrecision,
  lineShorthands,
  convertToZ,
  convertToRelative,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

console.log('\n=== Testing each plugin individually ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');

const plugins = [
  { name: 'floatPrecision', fn: (d) => floatPrecision(d, 3) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-9, 3) },
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-9, 3) },
  { name: 'convertToRelative', fn: (d) => convertToRelative(d, 3) },
];

for (const { name, fn } of plugins) {
  const doc = parseSVG(originalContent);
  const paths = Array.from(doc.getElementsByTagName('path'));

  for (const path of paths) {
    const d = path.getAttribute('d');
    if (d) {
      path.setAttribute('d', fn(d));
    }
  }

  const output = serializeSVG(doc);
  const outputFile = `samples/anime_girl.test.${name}.svg`;
  fs.writeFileSync(outputFile, output);

  const sizeMB = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
  console.log(`${name.padEnd(20)} -> ${outputFile} (${sizeMB} MB)`);
}

console.log('\n=== Check each file to find which plugin causes corruption ===\n');
