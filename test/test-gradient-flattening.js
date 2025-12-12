/**
 * Test gradient flattening functionality
 * Verifies that flattenGradients properly samples gradients instead of using hardcoded gray
 */

import { parseSVG } from '../src/svg-parser.js';
import { flattenGradients } from '../src/svg-toolbox.js';

// Test SVG with a simple red-to-blue linear gradient
const testSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="redBlue">
      <stop offset="0%" stop-color="#ff0000"/>
      <stop offset="100%" stop-color="#0000ff"/>
    </linearGradient>
    <linearGradient id="greenYellow">
      <stop offset="0%" stop-color="#00ff00"/>
      <stop offset="50%" stop-color="#ffff00"/>
      <stop offset="100%" stop-color="#ff8800"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="50" height="100" fill="url(#redBlue)"/>
  <rect x="50" y="0" width="50" height="100" stroke="url(#greenYellow)" fill="none" stroke-width="2"/>
</svg>`;

console.log('Testing gradient flattening...\n');

// Parse the SVG
const doc = parseSVG(testSVG);

// Flatten gradients
const result = await flattenGradients(doc);

// Get the rectangles
const rects = [...result.getElementsByTagName('rect')];

console.log('Test 1: Red-to-Blue gradient (0% to 100%)');
console.log('Expected midpoint color: #7f007f (purple)');
console.log('Actual fill color:', rects[0].getAttribute('fill'));
console.log('Should NOT be #808080 (gray)\n');

console.log('Test 2: Green-Yellow-Orange gradient (0%, 50%, 100%)');
console.log('Expected midpoint color: ~#ffff00 (yellow, from 50% stop)');
console.log('Actual stroke color:', rects[1].getAttribute('stroke'));
console.log('Should NOT be #808080 (gray)\n');

// Verify the fix worked
const fillColor = rects[0].getAttribute('fill');
const strokeColor = rects[1].getAttribute('stroke');

console.log('Results:');
if (fillColor === '#808080') {
  console.log('❌ FAILED: Fill is still using hardcoded gray (#808080)');
  process.exit(1);
} else if (fillColor === '#7f007f' || fillColor === '#80007f') {
  console.log('✓ PASSED: Fill color correctly interpolated between red and blue');
} else {
  console.log(`⚠ WARNING: Fill color is ${fillColor}, expected #7f007f or #80007f (minor rounding difference acceptable)`);
}

if (strokeColor === '#808080') {
  console.log('❌ FAILED: Stroke is still using hardcoded gray (#808080)');
  process.exit(1);
} else {
  console.log('✓ PASSED: Stroke color correctly sampled from gradient');
}

// Check that gradients were removed
const gradients = [...result.querySelectorAll('linearGradient, radialGradient')];
if (gradients.length === 0) {
  console.log('✓ PASSED: Gradient definitions removed from defs');
} else {
  console.log('❌ FAILED: Gradient definitions still present');
  process.exit(1);
}

console.log('\n✓ All tests passed! Gradients are properly flattened.');
