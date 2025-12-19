/**
 * Test a single W3C file with optimizePaths
 */

import fs from 'fs';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';
import { optimizePaths } from '../src/svg-toolbox.js';

const filename = process.argv[2] || 'paths-data-20-f.svg';
const inputPath = `/Users/emanuelesabetta/Code/SVG-MATRIX/SVG 1.1 W3C Test Suit/svg/${filename}`;

console.log(`Testing: ${filename}\n`);

try {
  // Read file
  const content = fs.readFileSync(inputPath, 'utf8');
  const originalSize = Buffer.byteLength(content, 'utf8');
  console.log(`Original size: ${originalSize} bytes`);

  // Parse
  const doc = parseSVG(content);
  console.log('✅ Parsed successfully');

  const pathsBefore = doc.getElementsByTagName('path').length;
  console.log(`Paths before: ${pathsBefore}`);

  // Optimize
  optimizePaths(doc, {
    floatPrecision: 3,
    straightCurves: true,
    lineShorthands: true,
    convertToZ: true,
    utilizeAbsolute: true,
    straightTolerance: 0.5
  });
  console.log('✅ Optimized successfully');

  const pathsAfter = doc.getElementsByTagName('path').length;
  console.log(`Paths after: ${pathsAfter}`);

  // Serialize
  const optimized = serializeSVG(doc);
  const optimizedSize = Buffer.byteLength(optimized, 'utf8');
  console.log(`Optimized size: ${optimizedSize} bytes`);

  const savings = originalSize - optimizedSize;
  const percent = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(2) : 0;
  console.log(`Savings: ${savings} bytes (${percent}%)`);

  console.log('\n✅ SUCCESS - File processed without errors!');
  process.exit(0);

} catch (err) {
  console.error('\n❌ FAILED');
  console.error(`Error: ${err.message}`);
  console.error(`Stack: ${err.stack}`);
  process.exit(1);
}
