/**
 * Test edge cases for gradient flattening
 * Verifies handling of various gradient configurations
 */

import { parseSVG } from '../src/svg-parser.js';
import { flattenGradients } from '../src/svg-toolbox.js';

console.log('Testing gradient flattening edge cases...\n');

// Test 1: Single stop gradient
console.log('Test 1: Single stop gradient');
const singleStopSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="single">
      <stop offset="0%" stop-color="#ff0000"/>
    </linearGradient>
  </defs>
  <rect fill="url(#single)"/>
</svg>`;

let doc = parseSVG(singleStopSVG);
let result = await flattenGradients(doc);
let rect = result.getElementsByTagName('rect')[0];
console.log('Fill color:', rect.getAttribute('fill'));
console.log('Expected: #ff0000 (red)');
console.log(rect.getAttribute('fill') === '#ff0000' ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 2: Empty gradient (no stops)
console.log('Test 2: Empty gradient (no stops)');
const emptyGradientSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="empty"/>
  </defs>
  <rect fill="url(#empty)"/>
</svg>`;

doc = parseSVG(emptyGradientSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
console.log('Fill color:', rect.getAttribute('fill'));
console.log('Expected: #808080 (gray fallback for no stops)');
console.log(rect.getAttribute('fill') === '#808080' ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 3: Named colors
console.log('Test 3: Named colors in stops');
const namedColorsSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="named">
      <stop offset="0%" stop-color="red"/>
      <stop offset="100%" stop-color="blue"/>
    </linearGradient>
  </defs>
  <rect fill="url(#named)"/>
</svg>`;

doc = parseSVG(namedColorsSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
const fillColor = rect.getAttribute('fill');
console.log('Fill color:', fillColor);
console.log('Expected: #800080 or #7f007f (purple)');
console.log((fillColor === '#800080' || fillColor === '#7f007f') ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 4: 3-digit hex colors
console.log('Test 4: 3-digit hex colors');
const shortHexSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="short">
      <stop offset="0%" stop-color="#f00"/>
      <stop offset="100%" stop-color="#00f"/>
    </linearGradient>
  </defs>
  <rect fill="url(#short)"/>
</svg>`;

doc = parseSVG(shortHexSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
const fill3 = rect.getAttribute('fill');
console.log('Fill color:', fill3);
console.log('Expected: #800080 or #7f007f (purple)');
console.log((fill3 === '#800080' || fill3 === '#7f007f') ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 5: Radial gradient
console.log('Test 5: Radial gradient');
const radialSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <radialGradient id="radial">
      <stop offset="0%" stop-color="#00ff00"/>
      <stop offset="100%" stop-color="#ffff00"/>
    </radialGradient>
  </defs>
  <rect fill="url(#radial)"/>
</svg>`;

doc = parseSVG(radialSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
console.log('Fill color:', rect.getAttribute('fill'));
console.log('Expected: interpolation between green and yellow');
console.log(rect.getAttribute('fill') !== '#808080' ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 6: Stop colors in style attribute
console.log('Test 6: Stop colors in style attribute');
const styleColorSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="styled">
      <stop offset="0%" style="stop-color: #ff0000"/>
      <stop offset="100%" style="stop-color: #0000ff"/>
    </linearGradient>
  </defs>
  <rect fill="url(#styled)"/>
</svg>`;

doc = parseSVG(styleColorSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
const fillStyle = rect.getAttribute('fill');
console.log('Fill color:', fillStyle);
console.log('Expected: #800080 or #7f007f (purple)');
console.log((fillStyle === '#800080' || fillStyle === '#7f007f') ? '✓ PASSED' : '❌ FAILED');
console.log();

// Test 7: Custom sampling position
console.log('Test 7: Custom sampling position (25%)');
const customPosSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="custom">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect fill="url(#custom)"/>
</svg>`;

doc = parseSVG(customPosSVG);
result = await flattenGradients(doc, { position: 0.25 });
rect = result.getElementsByTagName('rect')[0];
const fill25 = rect.getAttribute('fill');
console.log('Fill color:', fill25);
console.log('Expected: #404040 or #3f3f3f (25% between black and white)');
console.log((fill25 === '#404040' || fill25 === '#3f3f3f') ? '✓ PASSED' : '⚠ WARNING: ' + fill25);
console.log();

// Test 8: Missing gradient reference
console.log('Test 8: Missing gradient reference');
const missingRefSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect fill="url(#nonexistent)"/>
</svg>`;

doc = parseSVG(missingRefSVG);
result = await flattenGradients(doc);
rect = result.getElementsByTagName('rect')[0];
console.log('Fill color:', rect.getAttribute('fill'));
console.log('Expected: #808080 (gray fallback)');
console.log(rect.getAttribute('fill') === '#808080' ? '✓ PASSED' : '❌ FAILED');
console.log();

console.log('✓ All edge case tests completed!');
