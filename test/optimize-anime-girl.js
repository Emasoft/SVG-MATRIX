/**
 * Test enhanced optimization on anime_girl.fbf.svg
 */

import fs from 'fs';
import path from 'path';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import {
  cleanupIds,
  cleanupNumericValues,
  removeMetadata,
  optimizePaths,
  optimizeAnimationTiming,
} from '../src/svg-toolbox.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.fbf.optimized2.svg';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function countAnimationFrames(doc) {
  const symbols = doc.getElementsByTagName('symbol');
  const frames = [];
  for (const sym of symbols) {
    const id = sym.getAttribute('id');
    if (id && id.startsWith('FRAME')) {
      frames.push(id);
    }
  }
  return frames.length;
}

async function runOptimization() {
  console.log('\n=== Enhanced SVG Optimization Test ===\n');
  console.log('Input:', INPUT_FILE);

  // Read original file
  const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const originalSize = Buffer.byteLength(originalContent, 'utf8');
  console.log('Original size:', formatSize(originalSize));

  // Parse
  console.log('\n--- Parsing ---');
  const doc = parseSVG(originalContent);
  const framesBefore = await countAnimationFrames(doc);
  console.log('Animation frames:', framesBefore);

  // Count paths before
  const pathsBefore = doc.getElementsByTagName('path').length;
  console.log('Paths:', pathsBefore);

  // Step 1: Remove metadata
  console.log('\n--- Step 1: Remove metadata ---');
  await removeMetadata(doc);
  const afterMetadata = serializeSVG(doc);
  console.log('Size:', formatSize(Buffer.byteLength(afterMetadata, 'utf8')));

  // Step 2: Optimize path data (new!)
  console.log('\n--- Step 2: Optimize path data (convertPathData) ---');
  const pathOptStart = Date.now();
  await optimizePaths(doc, { floatPrecision: 2, straightTolerance: 0.5 });
  const pathOptTime = Date.now() - pathOptStart;
  const afterPathOpt = serializeSVG(doc);
  console.log('Size:', formatSize(Buffer.byteLength(afterPathOpt, 'utf8')));
  console.log('Time:', pathOptTime, 'ms');

  // Step 3: Cleanup numeric values
  console.log('\n--- Step 3: Cleanup numeric values ---');
  await cleanupNumericValues(doc, { precision: 2 });
  const afterNumeric = serializeSVG(doc);
  console.log('Size:', formatSize(Buffer.byteLength(afterNumeric, 'utf8')));

  // Step 4: Optimize animation timing
  console.log('\n--- Step 4: Optimize animation timing ---');
  await optimizeAnimationTiming(doc, { precision: 3 });
  const afterAnimation = serializeSVG(doc);
  console.log('Size:', formatSize(Buffer.byteLength(afterAnimation, 'utf8')));

  // Step 5: Cleanup IDs
  console.log('\n--- Step 5: Cleanup unused IDs ---');
  await cleanupIds(doc, { minify: false, remove: true });
  const afterIds = serializeSVG(doc);
  console.log('Size:', formatSize(Buffer.byteLength(afterIds, 'utf8')));

  // Final serialization
  console.log('\n--- Final serialization ---');
  const optimizedContent = serializeSVG(doc);
  const optimizedSize = Buffer.byteLength(optimizedContent, 'utf8');

  // Verify animation frames preserved
  const framesAfter = await countAnimationFrames(doc);
  const pathsAfter = doc.getElementsByTagName('path').length;

  // Calculate savings
  const savings = originalSize - optimizedSize;
  const percentReduction = ((savings / originalSize) * 100).toFixed(1);

  console.log('\n=== Final Results ===');
  console.log('Original:', formatSize(originalSize));
  console.log('Optimized:', formatSize(optimizedSize));
  console.log('Reduction:', percentReduction + '%');
  console.log('Saved:', formatSize(savings));
  console.log('');
  console.log('Animation frames preserved:', framesAfter + '/' + framesBefore);
  console.log('Paths:', pathsAfter + '/' + pathsBefore);

  // Save optimized file
  fs.writeFileSync(OUTPUT_FILE, optimizedContent);
  console.log('\nSaved to:', OUTPUT_FILE);

  // Compare with previous optimization
  const prevOptFile = 'samples/anime_girl.fbf.optimized.svg';
  if (fs.existsSync(prevOptFile)) {
    const prevSize = fs.statSync(prevOptFile).size;
    console.log('\n--- Comparison with previous optimization ---');
    console.log('Previous optimized:', formatSize(prevSize));
    console.log('New optimized:', formatSize(optimizedSize));
    const improvement = prevSize - optimizedSize;
    if (improvement > 0) {
      console.log('Additional savings:', formatSize(improvement), '(' + ((improvement/prevSize)*100).toFixed(1) + '% better)');
    } else if (improvement < 0) {
      console.log('Regression:', formatSize(-improvement), 'larger');
    } else {
      console.log('Same size');
    }
  }

  console.log('\n=== Done ===\n');
}

runOptimization().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
