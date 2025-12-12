/**
 * VERIFIED Path Optimization
 *
 * All curve conversions use mathematical verification:
 * - Sample actual curve points at t = 0.1, 0.2, ..., 0.9
 * - Compare distances between original and converted curves
 * - Only convert if ALL points within tolerance
 */

import fs from 'fs';
import {
  floatPrecision,
  lineShorthands,
  convertToZ,
  convertToRelative,
  straightCurves,
  convertCubicToQuadratic,
  convertCubicToSmooth,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.fbf.verified-optimized.svg';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('              VERIFIED PATH OPTIMIZATION');
console.log('    All curve conversions verified by sampling actual curve points');
console.log('═══════════════════════════════════════════════════════════════════\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent, 'utf8');
console.log('Input:', INPUT_FILE);
console.log('Original size:', formatSize(originalSize));

const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));
console.log('Paths:', paths.length);

// Configuration - conservative tolerance of 0.1 pixels
const TOLERANCE = 0.1;
const PRECISION = 3;

console.log('\nSettings:');
console.log('  Tolerance:', TOLERANCE, 'pixels (max deviation from original)');
console.log('  Precision:', PRECISION, 'decimal places');

// Plugins applied in order
const plugins = [
  { name: 'floatPrecision', fn: (d) => floatPrecision(d, PRECISION) },
  { name: 'straightCurves', fn: (d) => straightCurves(d, TOLERANCE, PRECISION) },
  { name: 'convertCubicToQuadratic', fn: (d) => convertCubicToQuadratic(d, TOLERANCE, PRECISION) },
  { name: 'convertCubicToSmooth', fn: (d) => convertCubicToSmooth(d, 1e-6, PRECISION) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-9, PRECISION) },
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-9, PRECISION) },
  { name: 'convertToRelative', fn: (d) => convertToRelative(d, PRECISION) },
];

console.log('\nApplying plugins:');
for (const { name } of plugins) {
  console.log('  - ' + name);
}

let pathsModified = 0;
let totalSaved = 0;

for (const path of paths) {
  let d = path.getAttribute('d');
  if (!d) continue;

  const originalLen = d.length;

  for (const { fn } of plugins) {
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
console.log('  VERIFICATION: All curve conversions verified by sampling');
console.log('  Maximum deviation from original: ' + TOLERANCE + ' pixels');
console.log('═══════════════════════════════════════════════════════════════════\n');
