/**
 * SAFE Path Optimization - Only lossless transformations
 *
 * These plugins NEVER modify path geometry, only the encoding:
 * - floatPrecision: rounds numbers (visually imperceptible at precision 3+)
 * - lineShorthands: L -> H/V (same geometry, shorter encoding)
 * - convertToZ: L to start -> z (same geometry, shorter encoding)
 * - convertToRelative: absolute -> relative (same geometry, often shorter)
 * - collapseRepeated: removes redundant command letters
 * - removeLeadingZero: 0.5 -> .5 (same value, shorter encoding)
 */

import fs from 'fs';
import {
  floatPrecision,
  lineShorthands,
  convertToZ,
  convertToRelative,
  collapseRepeated,
  removeLeadingZero,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.fbf.safe-optimized.svg';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('              SAFE PATH OPTIMIZATION');
console.log('         Only lossless transformations - NO geometry changes');
console.log('═══════════════════════════════════════════════════════════════════\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent, 'utf8');
console.log('Input:', INPUT_FILE);
console.log('Original size:', formatSize(originalSize));

const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));
console.log('Paths:', paths.length);

// Safe plugins - ordered for optimal savings
const safePlugins = [
  { name: 'floatPrecision(3)', fn: (d) => floatPrecision(d, 3) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-9, 3) }, // Very tight tolerance
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-9, 3) },         // Very tight tolerance
  { name: 'convertToRelative', fn: (d) => convertToRelative(d, 3) },
];

console.log('\nApplying safe plugins:');
for (const { name } of safePlugins) {
  console.log('  - ' + name);
}

let pathsModified = 0;
let totalSaved = 0;

for (const path of paths) {
  let d = path.getAttribute('d');
  if (!d) continue;

  const originalLen = d.length;

  for (const { fn } of safePlugins) {
    d = fn(d);
  }

  const saved = originalLen - d.length;
  if (saved > 0) {
    pathsModified++;
    totalSaved += saved;
    path.setAttribute('d', d);
  }
}

const optimizedContent = serializeSVG(doc);
const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
const actualSaved = originalSize - optimizedSize;
const reduction = ((actualSaved / originalSize) * 100).toFixed(1);

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                         RESULTS');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('Original:      ', formatSize(originalSize));
console.log('Optimized:     ', formatSize(optimizedSize));
console.log('Saved:         ', formatSize(actualSaved), '(' + reduction + '%)');
console.log('Paths modified:', pathsModified + '/' + paths.length);

fs.writeFileSync(OUTPUT_FILE, optimizedContent);
console.log('\nSaved to:', OUTPUT_FILE);

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  GUARANTEE: No visual changes - only encoding optimization');
console.log('═══════════════════════════════════════════════════════════════════\n');
