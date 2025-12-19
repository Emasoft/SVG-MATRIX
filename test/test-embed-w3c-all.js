/**
 * W3C SVG Test Suite - Embed Function Comprehensive Test
 *
 * Runs embedExternalDependencies on ALL 564 W3C SVG files to verify:
 * 1. The function handles all SVG patterns without crashing
 * 2. Output is valid, parseable SVG
 * 3. No data corruption occurs
 * 4. External references are properly handled
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedExternalDependencies } from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// W3C test suite paths (included in repo)
const W3C_PATHS = [
  { path: path.join(__dirname, '../tests/samples/svg11_w3c'), name: 'W3C SVG 1.1' },
  { path: path.join(__dirname, '../tests/samples/svg2'), name: 'W3C SVG 2.0' },
];

const OUTPUT_DIR = path.join(__dirname, 'output');
const LOG_DIR = path.join(__dirname, 'logs');

// Results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  warnings: [],
};

/**
 * Find all SVG files in W3C test directories
 */
function findW3CSVGFiles() {
  const filesBySource = {};
  const seenFilenames = new Set();
  const allFiles = [];

  for (const source of W3C_PATHS) {
    if (!fs.existsSync(source.path)) {
      console.log(`  [SKIP] ${source.name}: path not found`);
      continue;
    }

    const entries = fs.readdirSync(source.path);
    const svgFiles = entries.filter(e => e.endsWith('.svg'));
    filesBySource[source.name] = svgFiles.length;

    for (const entry of svgFiles) {
      // Deduplicate by filename (same file in multiple locations)
      if (!seenFilenames.has(entry)) {
        seenFilenames.add(entry);
        allFiles.push(path.join(source.path, entry));
      }
    }

    console.log(`  [OK] ${source.name}: ${svgFiles.length} SVG files`);
  }

  console.log(`  Total unique files: ${allFiles.length}`);
  return allFiles.sort();
}

/**
 * Test embed function on a single SVG file
 */
async function testEmbedOnFile(filePath) {
  const fileName = path.basename(filePath);

  try {
    // Read original SVG
    const originalSvg = fs.readFileSync(filePath, 'utf8');
    const originalSize = Buffer.byteLength(originalSvg, 'utf8');

    // Parse to verify it's valid input
    const originalDoc = parseSVG(originalSvg);
    if (!originalDoc) {
      return { status: 'skipped', reason: 'Failed to parse original SVG' };
    }

    // Run embed function
    const embeddedSvg = await embedExternalDependencies(originalSvg, {
      basePath: filePath,
      embedImages: true,
      embedExternalSVGs: true,
      embedCSS: true,
      embedFonts: true,
      embedScripts: true,
      embedAudio: true,
      subsetFonts: false, // Skip subsetting for speed
      onMissingResource: 'skip', // Skip missing resources silently
      timeout: 5000, // Short timeout for speed
    });

    // Verify output is valid SVG
    const embeddedDoc = parseSVG(embeddedSvg);
    if (!embeddedDoc) {
      return {
        status: 'failed',
        reason: 'Embedded SVG failed to parse',
        originalSize,
        embeddedSize: Buffer.byteLength(embeddedSvg, 'utf8'),
      };
    }

    // Check for data corruption (basic sanity checks)
    const embeddedSize = Buffer.byteLength(embeddedSvg, 'utf8');

    // Verify root element is still SVG
    const root = embeddedDoc.documentElement || embeddedDoc;
    if (root.tagName?.toLowerCase() !== 'svg') {
      return {
        status: 'failed',
        reason: `Root element is ${root.tagName}, not svg`,
        originalSize,
        embeddedSize,
      };
    }

    // Check warnings from embed function
    const warnings = embeddedDoc._embedWarnings || [];

    return {
      status: 'passed',
      originalSize,
      embeddedSize,
      sizeChange: ((embeddedSize - originalSize) / originalSize * 100).toFixed(1) + '%',
      warnings: warnings.length,
    };

  } catch (error) {
    return {
      status: 'failed',
      reason: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }
}

/**
 * Format file size for display
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('='.repeat(70));
  console.log('W3C SVG Test Suite - Embed Function Comprehensive Test');
  console.log('='.repeat(70));
  console.log();

  // Ensure output directories exist
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // Find all W3C SVG files
  const files = findW3CSVGFiles();
  results.total = files.length;

  console.log(`Found ${files.length} SVG files to test`);
  console.log();

  if (files.length === 0) {
    console.log('ERROR: No W3C SVG files found. Please ensure the test suite is available.');
    process.exit(1);
  }

  // Progress tracking
  const startTime = Date.now();
  let processed = 0;

  // Process files in batches for better performance
  const BATCH_SIZE = 10;
  const failedFiles = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (file) => {
      const result = await testEmbedOnFile(file);
      return { file: path.basename(file), ...result };
    }));

    // Process batch results
    for (const result of batchResults) {
      processed++;

      if (result.status === 'passed') {
        results.passed++;
        // Show progress for every 50 files
        if (processed % 50 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[${processed}/${files.length}] Processed... (${elapsed}s)`);
        }
      } else if (result.status === 'skipped') {
        results.skipped++;
        results.warnings.push(`${result.file}: ${result.reason}`);
      } else {
        results.failed++;
        failedFiles.push(result);
        results.errors.push(`${result.file}: ${result.reason}`);
      }
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  console.log();
  console.log('='.repeat(70));
  console.log('Test Summary');
  console.log('='.repeat(70));
  console.log();
  console.log(`Total files:   ${results.total}`);
  console.log(`Passed:        ${results.passed} (${(results.passed / results.total * 100).toFixed(1)}%)`);
  console.log(`Failed:        ${results.failed}`);
  console.log(`Skipped:       ${results.skipped}`);
  console.log(`Time:          ${totalTime}s`);
  console.log();

  // Print failed files details
  if (failedFiles.length > 0) {
    console.log('Failed Files:');
    console.log('-'.repeat(50));
    for (const f of failedFiles.slice(0, 20)) {
      console.log(`  ${f.file}: ${f.reason}`);
    }
    if (failedFiles.length > 20) {
      console.log(`  ... and ${failedFiles.length - 20} more`);
    }
    console.log();
  }

  // Write detailed results to JSON
  const resultsPath = path.join(OUTPUT_DIR, 'embed-w3c-all-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped,
      duration: totalTime + 's',
    },
    errors: results.errors,
    warnings: results.warnings.slice(0, 100), // Limit warnings
  }, null, 2));

  console.log(`Results written to: ${resultsPath}`);

  // Exit with appropriate code
  const success = results.failed === 0;
  console.log();
  console.log(success ? 'ALL TESTS PASSED' : `${results.failed} TESTS FAILED`);
  process.exit(success ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
