/**
 * Test: Parse and re-serialize WITHOUT any modifications
 * If this produces a broken file, the bug is in the parser/serializer
 */

import fs from 'fs';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.fbf.parse-only.svg';

console.log('\n=== TEST: Parse and Re-serialize (no modifications) ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
console.log('Original size:', (Buffer.byteLength(originalContent) / 1024 / 1024).toFixed(2), 'MB');

// Just parse and serialize - NO changes
const doc = parseSVG(originalContent);
const output = serializeSVG(doc);

console.log('Output size:', (Buffer.byteLength(output) / 1024 / 1024).toFixed(2), 'MB');

fs.writeFileSync(OUTPUT_FILE, output);
console.log('Saved to:', OUTPUT_FILE);

// Compare a sample path before/after
const paths = doc.getElementsByTagName('path');
if (paths.length > 0) {
  const firstPath = paths[0];
  const d = firstPath.getAttribute('d');
  console.log('\nFirst path d attribute (first 200 chars):');
  console.log(d ? d.substring(0, 200) : '(no d attribute)');
}

console.log('\n=== If this file is broken, the bug is in parser/serializer ===\n');
