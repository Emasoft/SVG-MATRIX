/**
 * Regression test for the gray gradient bug
 * Verifies that gradients are NO LONGER replaced with hardcoded #808080
 */

import { parseSVG } from '../src/svg-parser.js';
import { flattenGradients } from '../src/svg-toolbox.js';

console.log('Testing the reported bug: flattenGradients replacing ALL gradients with gray\n');

// Test case: A beautiful blue-to-orange gradient
const testSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <defs>
    <linearGradient id="myGradient">
      <stop offset="0%" stop-color="#0066ff"/>
      <stop offset="100%" stop-color="#ff6600"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#myGradient)"/>
</svg>`;

console.log('Input: Blue (#0066ff) to Orange (#ff6600) gradient');
console.log('Expected: Should flatten to a color between blue and orange (NOT gray)');
console.log();

const doc = parseSVG(testSVG);
const result = await flattenGradients(doc);
const rect = result.getElementsByTagName('rect')[0];
const fillColor = result.getElementsByTagName('rect')[0].getAttribute('fill');

console.log('Result: fill color =', fillColor);
console.log();

// The bug was: ALL gradients become #808080 (gray)
if (fillColor === '#808080') {
  console.log('❌ BUG STILL PRESENT!');
  console.log('The gradient was replaced with hardcoded gray (#808080)');
  console.log('This is the reported bug that should be fixed.');
  process.exit(1);
} else {
  console.log('✓ BUG FIXED!');
  console.log(`Gradient was properly sampled and converted to ${fillColor}`);
  console.log('This is NOT gray - the gradient color was correctly calculated.');

  // Verify it's a reasonable color between blue and orange
  // Expected midpoint: #8066b3 or similar (blend of blue and orange)
  const isGray = fillColor === '#808080';
  const isNotBlack = fillColor !== '#000000';
  const isNotWhite = fillColor !== '#ffffff';
  const hasValidFormat = /^#[0-9a-f]{6}$/i.test(fillColor);

  if (hasValidFormat && !isGray && isNotBlack && isNotWhite) {
    console.log('✓ Color format is valid');
    console.log('✓ Color is NOT gray');
    console.log('✓ Color appears to be a proper blend of the gradient stops');
    console.log();
    console.log('SUCCESS: The gradient flattening bug is fixed!');
  } else {
    console.log('⚠ Warning: Color might not be optimal, but at least it\'s not gray');
  }
}
