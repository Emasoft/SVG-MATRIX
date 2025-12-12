/**
 * Path-only optimization for anime_girl.fbf.svg
 * No ID cleanup, no metadata removal - only path data optimization
 */

import fs from 'fs';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { optimizePaths } from '../src/svg-toolbox.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.fbf.paths-optimized.svg';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runOptimization() {
  console.log('\n=== Path-Only Optimization ===\n');
  console.log('Input:', INPUT_FILE);

  // Read original file
  const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const originalSize = Buffer.byteLength(originalContent, 'utf8');
  console.log('Original size:', formatSize(originalSize));

  // Parse
  const doc = parseSVG(originalContent);
  const pathsBefore = doc.getElementsByTagName('path').length;
  console.log('Paths:', pathsBefore);

  // Only apply path optimization
  console.log('\nOptimizing paths (precision: 2)...');
  const startTime = Date.now();
  await optimizePaths(doc, { floatPrecision: 2, straightTolerance: 0.5 });
  const elapsed = Date.now() - startTime;
  console.log('Time:', elapsed, 'ms');

  // Serialize
  const optimizedContent = serializeSVG(doc);
  const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');

  // Verify paths preserved
  const pathsAfter = doc.getElementsByTagName('path').length;

  // Calculate savings
  const savings = originalSize - optimizedSize;
  const percentReduction = ((savings / originalSize) * 100).toFixed(1);

  console.log('\n=== Results ===');
  console.log('Original:', formatSize(originalSize));
  console.log('Optimized:', formatSize(optimizedSize));
  console.log('Reduction:', percentReduction + '%');
  console.log('Saved:', formatSize(savings));
  console.log('Paths preserved:', pathsAfter + '/' + pathsBefore);

  // Save
  fs.writeFileSync(OUTPUT_FILE, optimizedContent);
  console.log('\nSaved to:', OUTPUT_FILE);
  console.log('\n=== Done ===\n');
}

runOptimization().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
