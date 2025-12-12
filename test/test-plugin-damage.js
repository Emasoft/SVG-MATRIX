/**
 * Test which plugin is causing the visual corruption
 * Run each plugin individually and save output for inspection
 */

import fs from 'fs';
import {
  floatPrecision,
  straightCurves,
  lineShorthands,
  convertToZ,
  removeUselessCommands,
  convertCubicToSmooth,
  convertCubicToQuadratic,
  convertToRelative,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

console.log('\n=== Testing individual plugin impact ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent, 'utf8');

// Test each plugin in isolation
const plugins = [
  { name: 'floatPrecision-2', fn: (d) => floatPrecision(d, 2) },
  { name: 'floatPrecision-3', fn: (d) => floatPrecision(d, 3) },
  { name: 'straightCurves-0.5', fn: (d) => straightCurves(d, 0.5, 3) },
  { name: 'straightCurves-0.1', fn: (d) => straightCurves(d, 0.1, 3) },
  { name: 'straightCurves-0.01', fn: (d) => straightCurves(d, 0.01, 3) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-6, 3) },
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-6, 3) },
  { name: 'removeUselessCommands', fn: (d) => removeUselessCommands(d, 1e-6, 3) },
  { name: 'convertCubicToSmooth', fn: (d) => convertCubicToSmooth(d, 1e-6, 3) },
  { name: 'convertCubicToQuadratic-0.5', fn: (d) => convertCubicToQuadratic(d, 0.5, 3) },
  { name: 'convertCubicToQuadratic-0.1', fn: (d) => convertCubicToQuadratic(d, 0.1, 3) },
  { name: 'convertToRelative', fn: (d) => convertToRelative(d, 3) },
];

for (const { name, fn } of plugins) {
  const doc = parseSVG(originalContent);
  const paths = Array.from(doc.getElementsByTagName('path'));

  let totalSaved = 0;
  let pathsModified = 0;

  for (const path of paths) {
    const d = path.getAttribute('d');
    if (!d) continue;

    const optimized = fn(d);
    const saved = d.length - optimized.length;
    if (saved !== 0) {
      totalSaved += saved;
      pathsModified++;
      path.setAttribute('d', optimized);
    }
  }

  const optimizedContent = serializeSVG(doc);
  const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
  const reduction = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);

  // Save each version
  const outputFile = `samples/anime_girl.test.${name}.svg`;
  fs.writeFileSync(outputFile, optimizedContent);

  console.log(`${name.padEnd(30)} ${reduction}% reduction -> ${outputFile}`);
}

console.log('\n=== SAFE plugins only ===\n');

// Test with only safe plugins (no curve modifications)
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

const safePlugins = [
  { name: 'floatPrecision', fn: (d) => floatPrecision(d, 3) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-6, 3) },
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-6, 3) },
  { name: 'convertToRelative', fn: (d) => convertToRelative(d, 3) },
];

for (const path of paths) {
  let d = path.getAttribute('d');
  if (!d) continue;

  for (const { fn } of safePlugins) {
    d = fn(d);
  }

  path.setAttribute('d', d);
}

const safeContent = serializeSVG(doc);
const safeSize = Buffer.byteLength(safeContent, 'utf8');
const safeReduction = ((originalSize - safeSize) / originalSize * 100).toFixed(1);

fs.writeFileSync('samples/anime_girl.test.SAFE-ONLY.svg', safeContent);
console.log(`SAFE plugins only: ${safeReduction}% reduction`);
console.log('Saved to: samples/anime_girl.test.SAFE-ONLY.svg');

console.log('\nDone. Please visually inspect the generated SVG files to identify which plugin causes corruption.\n');
