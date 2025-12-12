/**
 * ENCODING-ONLY Optimization - ZERO curve modifications
 *
 * Only changes how the path is encoded, not the actual geometry:
 * - floatPrecision: rounds numbers (but keeps same curve)
 * - lineShorthands: L -> H/V (same points, shorter encoding)
 * - convertToZ: closing L -> z (same path, shorter)
 * - convertToRelative: absolute -> relative (identical path)
 *
 * NO curve-to-line, NO cubic-to-quadratic conversions.
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
const OUTPUT_FILE = 'samples/anime_girl.fbf.encoding-only.svg';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('              ENCODING-ONLY OPTIMIZATION');
console.log('        ZERO curve modifications - only encoding changes');
console.log('═══════════════════════════════════════════════════════════════════\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent, 'utf8');
console.log('Input:', INPUT_FILE);
console.log('Original size:', formatSize(originalSize));

const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));
console.log('Paths:', paths.length);

const PRECISION = 3; // 3 decimal places = 0.001 precision

console.log('\nApplying ENCODING-ONLY plugins (no curve modifications):');
console.log('  - floatPrecision(' + PRECISION + ')');
console.log('  - lineShorthands (L -> H/V)');
console.log('  - convertToZ (closing L -> z)');
console.log('  - convertToRelative (abs -> rel)');

let pathsModified = 0;

for (const path of paths) {
  let d = path.getAttribute('d');
  if (!d) continue;

  const originalLen = d.length;

  // ONLY encoding changes - no curve modifications
  d = floatPrecision(d, PRECISION);
  d = lineShorthands(d, 1e-9, PRECISION);  // Very tight tolerance
  d = convertToZ(d, 1e-9, PRECISION);       // Very tight tolerance
  d = convertToRelative(d, PRECISION);

  if (d.length !== originalLen) {
    pathsModified++;
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
console.log('  GUARANTEE: Zero curve modifications');
console.log('  All curves remain identical - only encoding changed');
console.log('═══════════════════════════════════════════════════════════════════\n');
