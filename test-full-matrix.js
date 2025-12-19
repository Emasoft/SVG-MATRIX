import { parseSVG } from './src/svg-parser.js';
import { generateFullCompatibilityMatrix, printHierarchicalMatrix, generateCompatibilityMatrixSVG } from './src/svg-toolbox.js';
import fs from 'fs';

const svgPath = './samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio_READONLY.svg';

async function testFullMatrix() {
  console.log('Loading SVG:', svgPath);
  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  console.log('\nParsing SVG...');
  const doc = parseSVG(svgContent);

  console.log('\nGenerating full compatibility matrix data...\n');

  const result = await generateFullCompatibilityMatrix(doc, {
    printFullMatrix: false,
    groupBySyntax: false,  // Skip the old output
    showOnlyIssues: true,
    browserDetails: false  // Skip old browser table
  });

  const matrix = result._fullCompatibilityMatrix;

  console.log('\n\n========================================');
  console.log('HIERARCHICAL MATRIX OUTPUT (TERMINAL):');
  console.log('========================================\n');

  // Print the new hierarchical matrix to terminal
  printHierarchicalMatrix(matrix, {
    compact: true,
    showAllCells: false
  });

  // Generate SVG version of the matrix
  console.log('\n\n========================================');
  console.log('GENERATING SVG MATRIX VISUALIZATION...');
  console.log('========================================\n');

  const svgMatrix = generateCompatibilityMatrixSVG(matrix, {
    cellWidth: 65,
    cellHeight: 48,
    interactive: true
  });

  // Save SVG to file
  const outputPath = './test/output/compatibility-matrix.svg';
  fs.mkdirSync('./test/output', { recursive: true });
  fs.writeFileSync(outputPath, svgMatrix, 'utf-8');
  console.log(`SVG matrix saved to: ${outputPath}`);
  console.log(`File size: ${(svgMatrix.length / 1024).toFixed(1)} KB`);

  // Also create an HTML wrapper for better viewing
  const htmlWrapper = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SVG Compatibility Matrix</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      font-family: system-ui, sans-serif;
    }
    .container {
      max-width: 100%;
      overflow-x: auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .info {
      text-align: center;
      color: #666;
      margin-bottom: 20px;
    }
    svg {
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SVG Compatibility Matrix</h1>
    <p class="info">
      Generated from: ${svgPath}<br>
      Hover over cells for details
    </p>
    ${svgMatrix}
  </div>
</body>
</html>`;

  const htmlPath = './test/output/compatibility-matrix.html';
  fs.writeFileSync(htmlPath, htmlWrapper, 'utf-8');
  console.log(`HTML viewer saved to: ${htmlPath}`);

  console.log('\n=== TEST COMPLETE ===');
  console.log('\nOpen the pure SVG file in a browser:');
  console.log(`  open ${outputPath}`);
  console.log('\nOr open the HTML wrapper for a styled view:');
  console.log(`  open ${htmlPath}`);
}

testFullMatrix().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
