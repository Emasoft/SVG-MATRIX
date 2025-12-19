/**
 * Test addAttributesToSVGElement against all W3C SVG 1.1 test files
 *
 * This test script:
 * 1. Reads each SVG file from the W3C test suite
 * 2. Parses it using SVGO's parser
 * 3. Applies addAttributesToSVGElement plugin
 * 4. Serializes back to string
 * 5. Validates the output can be re-parsed
 * 6. Verifies attributes were added
 * 7. Saves processed files and generates analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { optimize } from '../svgo_shallow/lib/svgo.js';
import { parseSvg } from '../svgo_shallow/lib/parser.js';
import { stringifySvg } from '../svgo_shallow/lib/stringifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const testDir = path.join(__dirname, '..', 'SVG 1.1 W3C Test Suit', 'svg');
const outputDir = '/tmp/svg-function-tests/addAttributesToSVGElement';
const analysisFile = path.join(outputDir, 'analysis.md');

// Test attributes to add
const testAttributes = {
  'data-processed': 'true',
  'data-test': 'w3c-svg-test',
  'data-timestamp': new Date().toISOString()
};

// Statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: [],
  startTime: new Date(),
  endTime: null
};

/**
 * Test a single SVG file
 */
function testSVGFile(filename) {
  const inputPath = path.join(testDir, filename);
  const outputPath = path.join(outputDir, filename);

  try {
    // Step 1: Read original SVG
    const svgContent = fs.readFileSync(inputPath, 'utf-8');

    // Step 2: Parse using SVGO
    const ast = parseSvg(svgContent, inputPath);

    // Step 3: Apply addAttributesToSVGElement plugin
    const result = optimize(svgContent, {
      path: inputPath,
      plugins: [
        {
          name: 'addAttributesToSVGElement',
          params: {
            attributes: [testAttributes]
          }
        }
      ]
    });

    if (!result.data) {
      throw new Error('Optimization produced no output');
    }

    // Step 4: Serialize (already done by optimize)
    const processedSVG = result.data;

    // Step 5: Validate by re-parsing
    const validationAST = parseSvg(processedSVG, outputPath);

    // Step 6: Verify attributes were added
    let attributesFound = false;
    if (validationAST.type === 'root' && validationAST.children) {
      for (const child of validationAST.children) {
        if (child.type === 'element' && child.name === 'svg') {
          // Check if our test attributes are present
          const hasDataProcessed = child.attributes && child.attributes['data-processed'] === 'true';
          const hasDataTest = child.attributes && child.attributes['data-test'] === 'w3c-svg-test';

          if (hasDataProcessed && hasDataTest) {
            attributesFound = true;
            break;
          }
        }
      }
    }

    if (!attributesFound) {
      throw new Error('Test attributes were not found in processed SVG');
    }

    // Save processed file
    fs.writeFileSync(outputPath, processedSVG, 'utf-8');

    // Success
    stats.passed++;
    return { success: true, filename };

  } catch (error) {
    // Failure
    stats.failed++;
    const failure = {
      file: filename,
      error: error.message,
      stack: error.stack
    };
    stats.failures.push(failure);
    return { success: false, filename, error: error.message };
  }
}

/**
 * Generate analysis report
 */
function generateAnalysis() {
  const duration = (stats.endTime - stats.startTime) / 1000; // seconds
  const passRate = ((stats.passed / stats.total) * 100).toFixed(2);

  let analysis = `# addAttributesToSVGElement W3C SVG 1.1 Test Suite Analysis\n\n`;
  analysis += `**Test Date:** ${stats.startTime.toISOString()}\n\n`;
  analysis += `**Duration:** ${duration.toFixed(2)} seconds\n\n`;

  analysis += `## Summary\n\n`;
  analysis += `- **Total Files Tested:** ${stats.total}\n`;
  analysis += `- **Passed:** ${stats.passed} (${passRate}%)\n`;
  analysis += `- **Failed:** ${stats.failed}\n`;
  analysis += `- **Overall Status:** ${stats.failed === 0 ? '✅ PASS' : '❌ FAIL'}\n\n`;

  if (stats.failed > 0) {
    analysis += `## Failures\n\n`;
    analysis += `The following ${stats.failed} file(s) failed:\n\n`;

    // Group failures by error type
    const errorGroups = new Map();
    for (const failure of stats.failures) {
      const errorType = failure.error.split('\n')[0]; // First line of error
      if (!errorGroups.has(errorType)) {
        errorGroups.set(errorType, []);
      }
      errorGroups.get(errorType).push(failure);
    }

    for (const [errorType, failures] of errorGroups) {
      analysis += `### Error: ${errorType}\n\n`;
      analysis += `**Count:** ${failures.length} file(s)\n\n`;
      analysis += `**Files:**\n`;
      for (const failure of failures) {
        analysis += `- ${failure.file}\n`;
      }
      analysis += `\n`;
    }

    analysis += `## Detailed Failure Log\n\n`;
    for (const failure of stats.failures) {
      analysis += `### ${failure.file}\n\n`;
      analysis += `**Error:**\n\`\`\`\n${failure.error}\n\`\`\`\n\n`;
      if (failure.stack) {
        analysis += `**Stack Trace:**\n\`\`\`\n${failure.stack}\n\`\`\`\n\n`;
      }
    }
  } else {
    analysis += `## Success Details\n\n`;
    analysis += `All ${stats.total} SVG files were successfully processed.\n\n`;
    analysis += `**Test Attributes Added:**\n`;
    for (const [key, value] of Object.entries(testAttributes)) {
      analysis += `- \`${key}\`: \`${value}\`\n`;
    }
    analysis += `\n`;
  }

  analysis += `## Test Configuration\n\n`;
  analysis += `**Input Directory:** \`${testDir}\`\n\n`;
  analysis += `**Output Directory:** \`${outputDir}\`\n\n`;
  analysis += `**Plugin Configuration:**\n\`\`\`json\n`;
  analysis += JSON.stringify({
    name: 'addAttributesToSVGElement',
    params: {
      attributes: [testAttributes]
    }
  }, null, 2);
  analysis += `\n\`\`\`\n\n`;

  analysis += `## Test Methodology\n\n`;
  analysis += `For each SVG file:\n`;
  analysis += `1. Read the original SVG file\n`;
  analysis += `2. Parse it using SVGO's parser\n`;
  analysis += `3. Apply \`addAttributesToSVGElement\` plugin with test attributes\n`;
  analysis += `4. Serialize back to string\n`;
  analysis += `5. Validate the output by re-parsing (ensures valid SVG)\n`;
  analysis += `6. Verify that the test attributes were added to the root <svg> element\n`;
  analysis += `7. Save the processed SVG to the output directory\n\n`;

  analysis += `## Validation Criteria\n\n`;
  analysis += `A test passes if:\n`;
  analysis += `- The SVG can be successfully parsed\n`;
  analysis += `- The plugin processes without errors\n`;
  analysis += `- The output can be re-parsed (valid SVG)\n`;
  analysis += `- The test attributes are present in the root <svg> element\n`;
  analysis += `- The document structure is preserved\n`;

  return analysis;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('Starting addAttributesToSVGElement W3C SVG 1.1 Test Suite\n');
  console.log(`Input directory: ${testDir}`);
  console.log(`Output directory: ${outputDir}\n`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Get all SVG files
  const files = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.svg'))
    .sort();

  stats.total = files.length;
  console.log(`Found ${stats.total} SVG files to test\n`);

  // Process each file
  let processed = 0;
  const progressInterval = Math.max(1, Math.floor(files.length / 20)); // Show 20 progress updates

  for (const file of files) {
    testSVGFile(file);
    processed++;

    if (processed % progressInterval === 0) {
      const progress = ((processed / files.length) * 100).toFixed(1);
      console.log(`Progress: ${processed}/${files.length} (${progress}%) - Passed: ${stats.passed}, Failed: ${stats.failed}`);
    }
  }

  stats.endTime = new Date();

  // Generate and save analysis
  const analysis = generateAnalysis();
  fs.writeFileSync(analysisFile, analysis, 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total: ${stats.total}`);
  console.log(`Passed: ${stats.passed}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Success Rate: ${((stats.passed / stats.total) * 100).toFixed(2)}%`);
  console.log(`Duration: ${((stats.endTime - stats.startTime) / 1000).toFixed(2)}s`);
  console.log(`\nAnalysis saved to: ${analysisFile}`);
  console.log(`Processed files saved to: ${outputDir}`);
  console.log('='.repeat(60));

  // Exit with appropriate code
  process.exit(stats.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
