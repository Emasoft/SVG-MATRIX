/**
 * Test individual path optimization plugins
 * Each plugin does ONE optimization only (mirrors SVGO architecture)
 */

import fs from 'fs';
import {
  removeLeadingZero,
  negativeExtraSpace,
  convertToRelative,
  convertToAbsolute,
  lineShorthands,
  convertToZ,
  straightCurves,
  collapseRepeated,
  floatPrecision,
  removeUselessCommands,
  convertCubicToQuadratic,
  convertQuadraticToSmooth,
  convertCubicToSmooth,
  arcShorthands,
} from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

// Test paths for demonstration
const testPaths = [
  { name: 'Leading zeros', d: 'M 0.5 0.25 L 0.125 0.0625' },
  { name: 'Negative delim', d: 'M 10 -5 L 20 -10 L 30 -15' },
  { name: 'Abs to Rel', d: 'M 100 100 L 110 110 L 120 120' },
  { name: 'L to H/V', d: 'M 0 0 L 100 0 L 100 50 L 0 50' },
  { name: 'Close path', d: 'M 0 0 L 100 0 L 100 100 L 0 0' },
  { name: 'Straight curve', d: 'M 0 0 C 3.33 3.33 6.67 6.67 10 10' },
  { name: 'Float precision', d: 'M 10.123456 20.654321 L 30.111111 40.999999' },
  { name: 'Useless cmd', d: 'M 10 10 L 10 10 L 20 20' },
  { name: 'Cubic to Quad', d: 'M 0 0 C 6.67 0 13.33 10 20 10' },
  { name: 'Cubic to Smooth', d: 'M 0 0 C 0 10 10 10 20 0 C 30 -10 40 0 50 0' },
  { name: 'Arc optimize', d: 'M 0 0 A 10 10 720 0 1 20 0' },
];

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('              PATH OPTIMIZATION PLUGINS TEST');
console.log('         Each function does ONE optimization only');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Test each plugin on appropriate test paths
const plugins = [
  { name: 'removeLeadingZero', fn: removeLeadingZero, testIdx: 0 },
  { name: 'negativeExtraSpace', fn: negativeExtraSpace, testIdx: 1 },
  { name: 'convertToRelative', fn: convertToRelative, testIdx: 2 },
  { name: 'convertToAbsolute', fn: convertToAbsolute, testIdx: 2 },
  { name: 'lineShorthands', fn: lineShorthands, testIdx: 3 },
  { name: 'convertToZ', fn: convertToZ, testIdx: 4 },
  { name: 'straightCurves', fn: straightCurves, testIdx: 5 },
  { name: 'floatPrecision', fn: (d) => floatPrecision(d, 2), testIdx: 6, opts: 'precision=2' },
  { name: 'removeUselessCommands', fn: removeUselessCommands, testIdx: 7 },
  { name: 'convertCubicToQuadratic', fn: convertCubicToQuadratic, testIdx: 8 },
  { name: 'convertCubicToSmooth', fn: convertCubicToSmooth, testIdx: 9 },
  { name: 'arcShorthands', fn: arcShorthands, testIdx: 10 },
];

for (const { name, fn, testIdx, opts } of plugins) {
  const test = testPaths[testIdx];
  const result = fn(test.d);
  const saved = test.d.length - result.length;
  const pct = ((saved / test.d.length) * 100).toFixed(1);

  console.log(`┌─ ${name} ${opts ? `(${opts})` : ''}`);
  console.log(`│  Test: ${test.name}`);
  console.log(`│  Input:  ${test.d}`);
  console.log(`│  Output: ${result}`);
  console.log(`└  Saved: ${saved} chars (${pct}%)\n`);
}

// Now test on real SVG file
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('              REAL FILE TEST: anime_girl.fbf.svg');
console.log('═══════════════════════════════════════════════════════════════════\n');

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

if (!fs.existsSync(INPUT_FILE)) {
  console.log('Sample file not found:', INPUT_FILE);
  process.exit(0);
}

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent, 'utf8');

console.log('Original file size:', (originalSize / (1024 * 1024)).toFixed(2), 'MB');

// Parse and apply each plugin one at a time
const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));
console.log('Total paths:', paths.length);

// Test each plugin individually
const pluginResults = [];

for (const { name, fn, opts } of plugins) {
  let totalSaved = 0;
  let pathsImproved = 0;

  for (const path of paths) {
    const d = path.getAttribute('d');
    if (!d) continue;

    const optimized = fn(d);
    const saved = d.length - optimized.length;
    if (saved > 0) {
      totalSaved += saved;
      pathsImproved++;
    }
  }

  pluginResults.push({
    name,
    opts,
    totalSaved,
    pathsImproved,
    pct: ((totalSaved / originalSize) * 100).toFixed(3)
  });
}

// Sort by savings
pluginResults.sort((a, b) => b.totalSaved - a.totalSaved);

console.log('\n┌────────────────────────────────────┬────────────┬───────────┬─────────┐');
console.log('│ Plugin                             │ Bytes Saved│ Paths Imp │ % of SVG│');
console.log('├────────────────────────────────────┼────────────┼───────────┼─────────┤');

for (const r of pluginResults) {
  const name = (r.name + (r.opts ? ` (${r.opts})` : '')).padEnd(34);
  const saved = r.totalSaved.toString().padStart(10);
  const paths = r.pathsImproved.toString().padStart(9);
  const pct = (r.pct + '%').padStart(7);
  console.log(`│ ${name} │ ${saved} │ ${paths} │ ${pct} │`);
}

console.log('└────────────────────────────────────┴────────────┴───────────┴─────────┘');

// Now apply all plugins in sequence
console.log('\n\n═══════════════════════════════════════════════════════════════════');
console.log('              CUMULATIVE APPLICATION');
console.log('═══════════════════════════════════════════════════════════════════\n');

const doc2 = parseSVG(originalContent);
const paths2 = Array.from(doc2.getElementsByTagName('path'));

let cumulativeSaved = 0;
const precision = 2;

// Apply in optimal order (most savings first based on results)
const orderedPlugins = [
  { name: 'floatPrecision', fn: (d) => floatPrecision(d, precision) },
  { name: 'straightCurves', fn: (d) => straightCurves(d, 0.5, precision) },
  { name: 'lineShorthands', fn: (d) => lineShorthands(d, 1e-6, precision) },
  { name: 'convertToZ', fn: (d) => convertToZ(d, 1e-6, precision) },
  { name: 'removeUselessCommands', fn: (d) => removeUselessCommands(d, 1e-6, precision) },
  { name: 'convertCubicToSmooth', fn: (d) => convertCubicToSmooth(d, 1e-6, precision) },
  { name: 'convertCubicToQuadratic', fn: (d) => convertCubicToQuadratic(d, 0.5, precision) },
];

for (const path of paths2) {
  const d = path.getAttribute('d');
  if (!d) continue;

  let optimized = d;
  for (const { fn } of orderedPlugins) {
    optimized = fn(optimized);
  }

  const saved = d.length - optimized.length;
  if (saved > 0) {
    cumulativeSaved += saved;
    path.setAttribute('d', optimized);
  }
}

const optimizedContent = serializeSVG(doc2);
const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');
const actualSaved = originalSize - optimizedSize;
const reduction = ((actualSaved / originalSize) * 100).toFixed(1);

console.log('Applied plugins in sequence (precision=' + precision + '):');
for (const { name } of orderedPlugins) {
  console.log('  - ' + name);
}

console.log('\nResults:');
console.log('  Original:  ', (originalSize / (1024 * 1024)).toFixed(2), 'MB');
console.log('  Optimized: ', (optimizedSize / (1024 * 1024)).toFixed(2), 'MB');
console.log('  Saved:     ', (actualSaved / (1024 * 1024)).toFixed(2), 'MB (' + reduction + '%)');

// Save output
const OUTPUT_FILE = 'samples/anime_girl.fbf.plugins-optimized.svg';
fs.writeFileSync(OUTPUT_FILE, optimizedContent);
console.log('\nSaved to:', OUTPUT_FILE);

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                         DONE');
console.log('═══════════════════════════════════════════════════════════════════\n');
