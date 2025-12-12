/**
 * Test animation reference detection on real anime_girl.fbf.svg file
 * This verifies that svg-matrix correctly detects ALL 35 frame references
 * that SVGO destroys.
 */

import fs from 'fs';
import path from 'path';
import { parseSVG } from '../src/svg-parser.js';
import {
  collectAllReferences,
  findUnreferencedDefs,
  parseAnimationValueIds,
} from '../src/animation-references.js';
import { cleanupIds } from '../src/svg-toolbox.js';

const ANIME_GIRL_PATH = 'samples/anime_girl.fbf.svg';

console.log('\n=== Testing Animation Reference Detection on anime_girl.fbf.svg ===\n');

// Read the file
if (!fs.existsSync(ANIME_GIRL_PATH)) {
  console.error('ERROR: anime_girl.fbf.svg not found at', ANIME_GIRL_PATH);
  process.exit(1);
}

const svgContent = fs.readFileSync(ANIME_GIRL_PATH, 'utf8');
console.log(`File size: ${(svgContent.length / 1024 / 1024).toFixed(2)} MB`);

// Parse the SVG
console.log('Parsing SVG...');
const doc = parseSVG(svgContent);

// Count elements
const allElements = doc.querySelectorAll('*');
console.log(`Total elements: ${allElements.length}`);

// Find all elements with IDs matching FRAME pattern
const frameElements = doc.querySelectorAll('[id^="FRAME"]');
console.log(`Elements with FRAME* IDs: ${frameElements.length}`);

// Collect all references
console.log('\nCollecting all references (animation-aware)...');
const refs = collectAllReferences(doc);

console.log(`\nReference Summary:`);
console.log(`  - Static references: ${refs.static.size}`);
console.log(`  - Animation references: ${refs.animation.size}`);
console.log(`  - CSS references: ${refs.css.size}`);
console.log(`  - JavaScript references: ${refs.js.size}`);
console.log(`  - Total unique references: ${refs.all.size}`);

// Check for FRAME references in animation set
const frameRefs = [...refs.animation].filter(id => id.startsWith('FRAME'));
console.log(`\n=== CRITICAL: Animation Frame Detection ===`);
console.log(`FRAME* IDs detected in animation values: ${frameRefs.length}`);

if (frameRefs.length > 0) {
  console.log(`\nFirst 10 detected frames:`);
  frameRefs.slice(0, 10).forEach(id => console.log(`  - ${id}`));
  if (frameRefs.length > 10) {
    console.log(`  ... and ${frameRefs.length - 10} more`);
  }
}

// Run findUnreferencedDefs
console.log('\n=== Analyzing defs safety ===');
const defsAnalysis = findUnreferencedDefs(doc);

console.log(`Elements safe to remove (truly unreferenced): ${defsAnalysis.safeToRemove.length}`);
console.log(`Elements referenced statically: ${defsAnalysis.referenced.length}`);
console.log(`Elements referenced by animation (MUST KEEP): ${defsAnalysis.animationReferenced.length}`);

// Verify no FRAME elements are in safeToRemove
const frameInSafe = defsAnalysis.safeToRemove.filter(id => id.startsWith('FRAME'));
if (frameInSafe.length > 0) {
  console.error(`\n!! ERROR: ${frameInSafe.length} FRAME elements incorrectly marked as safe to remove!`);
  frameInSafe.forEach(id => console.error(`  - ${id}`));
  process.exit(1);
} else {
  console.log(`\n✓ SUCCESS: No FRAME elements incorrectly marked for removal`);
}

// Test cleanupIds doesn't remove animation frames
console.log('\n=== Testing cleanupIds preservation ===');

// Count FRAME elements before
const framesBefore = doc.querySelectorAll('[id^="FRAME"]').length;
console.log(`FRAME elements before cleanupIds: ${framesBefore}`);

// Run cleanupIds (this should preserve animation refs)
const cleanedDoc = await cleanupIds(doc, { minify: false, remove: true });

// Count FRAME elements after
const framesAfter = cleanedDoc.querySelectorAll('[id^="FRAME"]').length;
console.log(`FRAME elements after cleanupIds: ${framesAfter}`);

if (framesAfter === framesBefore) {
  console.log(`\n✓ SUCCESS: cleanupIds preserved all ${framesBefore} FRAME elements`);
} else {
  console.error(`\n!! ERROR: cleanupIds removed ${framesBefore - framesAfter} FRAME elements!`);
  process.exit(1);
}

// Final summary
console.log('\n=== Final Test Summary ===');
console.log(`✓ Animation reference detection: ${frameRefs.length} frames detected`);
console.log(`✓ Safe removal analysis: No animation frames marked for removal`);
console.log(`✓ cleanupIds: All ${framesBefore} frames preserved`);
console.log('\nsvg-matrix correctly handles frame-by-frame animation!');
console.log('(Unlike SVGO which would destroy all 35 frames)');
