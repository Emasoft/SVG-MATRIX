/**
 * Visual test for gradient flattening
 * Creates before/after SVG files to visually compare results
 */

import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { flattenGradients } from '../src/svg-toolbox.js';
import fs from 'fs';
import path from 'path';

// Create a visually rich SVG with multiple gradients
const testSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <defs>
    <!-- Sunset gradient: orange to purple -->
    <linearGradient id="sunset" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff6b00"/>
      <stop offset="50%" stop-color="#ff1e56"/>
      <stop offset="100%" stop-color="#8b00ff"/>
    </linearGradient>

    <!-- Ocean gradient: cyan to deep blue -->
    <linearGradient id="ocean" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#003a70"/>
    </linearGradient>

    <!-- Forest gradient: light green to dark green -->
    <radialGradient id="forest" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#90ee90"/>
      <stop offset="100%" stop-color="#006400"/>
    </radialGradient>

    <!-- Fire gradient: red to yellow -->
    <linearGradient id="fire" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#ff0000"/>
      <stop offset="50%" stop-color="#ff8800"/>
      <stop offset="100%" stop-color="#ffff00"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="400" height="300" fill="#1a1a1a"/>

  <!-- Gradient shapes -->
  <rect x="20" y="20" width="160" height="120" fill="url(#sunset)" rx="10"/>
  <circle cx="280" cy="80" r="60" fill="url(#ocean)"/>
  <ellipse cx="100" cy="210" rx="70" ry="50" fill="url(#forest)"/>
  <path d="M 240 160 L 280 240 L 360 240 L 320 160 Z" fill="url(#fire)"/>

  <!-- Text labels -->
  <text x="100" y="155" fill="white" font-family="Arial" font-size="14" text-anchor="middle">Sunset</text>
  <text x="280" y="155" fill="white" font-family="Arial" font-size="14" text-anchor="middle">Ocean</text>
  <text x="100" y="275" fill="white" font-family="Arial" font-size="14" text-anchor="middle">Forest</text>
  <text x="300" y="265" fill="white" font-family="Arial" font-size="14" text-anchor="middle">Fire</text>
</svg>`;

const outputDir = 'samples/toolbox-tests';

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Save original
const originalPath = path.join(outputDir, 'gradient-original.svg');
fs.writeFileSync(originalPath, testSVG);
console.log(`✓ Saved original: ${originalPath}`);

// Test with default position (50%)
const doc1 = parseSVG(testSVG);
const flattened50 = await flattenGradients(doc1);
const result50 = serializeSVG(flattened50);
const path50 = path.join(outputDir, 'gradient-flattened-50.svg');
fs.writeFileSync(path50, result50);
console.log(`✓ Saved 50% sample: ${path50}`);

// Test with 25% position
const doc2 = parseSVG(testSVG);
const flattened25 = await flattenGradients(doc2, { position: 0.25 });
const result25 = serializeSVG(flattened25);
const path25 = path.join(outputDir, 'gradient-flattened-25.svg');
fs.writeFileSync(path25, result25);
console.log(`✓ Saved 25% sample: ${path25}`);

// Test with 75% position
const doc3 = parseSVG(testSVG);
const flattened75 = await flattenGradients(doc3, { position: 0.75 });
const result75 = serializeSVG(flattened75);
const path75 = path.join(outputDir, 'gradient-flattened-75.svg');
fs.writeFileSync(path75, result75);
console.log(`✓ Saved 75% sample: ${path75}`);

// Verify the colors are NOT all gray
console.log('\nColor verification:');
const rects50 = [...flattened50.getElementsByTagName('rect')];
const shapes = [
  ...rects50,
  ...flattened50.getElementsByTagName('circle'),
  ...flattened50.getElementsByTagName('ellipse'),
  ...flattened50.getElementsByTagName('path')
].filter(el => el.getAttribute('fill') && !el.getAttribute('fill').startsWith('white'));

let allGray = true;
let allDifferent = true;
const colors = new Set();

for (const shape of shapes) {
  const fill = shape.getAttribute('fill');
  if (fill && fill !== '#1a1a1a' && fill !== 'white') {
    colors.add(fill);
    if (fill !== '#808080') {
      allGray = false;
    }
  }
}

console.log(`Found ${colors.size} unique colors: ${[...colors].join(', ')}`);
console.log(allGray ? '❌ FAILED: All colors are gray!' : '✓ PASSED: Colors are properly sampled from gradients');
console.log(colors.size > 1 ? '✓ PASSED: Multiple different colors detected' : '❌ FAILED: All shapes have same color');

console.log('\n✓ Visual test files generated successfully!');
console.log('Open the files in a browser to visually verify the gradient flattening.');
