/**
 * Comprehensive W3C SVG Test Suite Matrix
 *
 * Tests ALL 525 SVG files from W3C SVG 1.1 test suite
 * against svg-matrix parsing and serialization operations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SUITE_PATH = path.join(__dirname, '../tests/samples/svg11_w3c');
const REPORT_PATH = path.join(__dirname, '../docs_dev/W3C_MATRIX_RESULTS.md');

// Get category from filename (e.g., animate-dom-01-f.svg -> animate)
function getCategory(filename) {
  const match = filename.match(/^([a-z]+)-/);
  return match ? match[1] : 'other';
}

// Test single SVG file
async function testFile(filename) {
  const filepath = path.join(TEST_SUITE_PATH, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const category = getCategory(filename);

  const result = {
    filename,
    category,
    success: true,
    error: null,
    stats: {
      fileSize: content.length,
      hasViewBox: false,
      elementCount: 0
    }
  };

  try {
    // Parse SVG - returns root SVGElement directly
    const svg = parseSVG(content);
    if (!svg) {
      throw new Error('parseSVG returned null/undefined');
    }

    // Verify it's an SVG element
    if (svg.tagName.toLowerCase() !== 'svg') {
      throw new Error(`Expected svg root, got ${svg.tagName}`);
    }

    // Collect stats
    result.stats.hasViewBox = !!svg.getAttribute('viewBox');
    result.stats.elementCount = svg.getElementsByTagName('*').length;

    // Serialize back
    const serialized = serializeSVG(svg);
    if (!serialized || serialized.length === 0) {
      throw new Error('serializeSVG returned empty string');
    }

    // Re-parse to verify round-trip
    const svg2 = parseSVG(serialized);
    if (!svg2) {
      throw new Error('Round-trip parse failed');
    }

    const elementCount2 = svg2.getElementsByTagName('*').length;

    // Allow some variation in element count (whitespace handling)
    if (Math.abs(result.stats.elementCount - elementCount2) > 5) {
      throw new Error(`Element count mismatch: ${result.stats.elementCount} -> ${elementCount2}`);
    }

  } catch (err) {
    result.success = false;
    result.error = err.message;
  }

  return result;
}

async function runAllTests() {
  console.log('\n=== W3C SVG Test Suite Matrix ===\n');

  // Get all SVG files
  const files = fs.readdirSync(TEST_SUITE_PATH)
    .filter(f => f.endsWith('.svg'))
    .sort();

  console.log(`Testing ${files.length} SVG files...\n`);

  const results = [];
  const categoryStats = {};
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const result = await testFile(file);
    results.push(result);

    // Track category stats
    if (!categoryStats[result.category]) {
      categoryStats[result.category] = { total: 0, passed: 0, failed: 0 };
    }
    categoryStats[result.category].total++;

    if (result.success) {
      passed++;
      categoryStats[result.category].passed++;
      process.stdout.write('.');
    } else {
      failed++;
      categoryStats[result.category].failed++;
      process.stdout.write('X');
    }

    // Newline every 50
    if ((passed + failed) % 50 === 0) {
      console.log(` ${passed + failed}/${files.length}`);
    }
  }

  console.log('\n');

  // Generate report
  const failedResults = results.filter(r => !r.success);
  const report = generateReport(files.length, passed, failed, categoryStats, failedResults);

  // Write report
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report);

  // Console summary
  console.log('=== Summary ===\n');
  console.log(`Total: ${files.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nReport written to: ${REPORT_PATH}`);

  // Exit with error if failures
  if (failed > 0) {
    process.exit(1);
  }
}

function generateReport(total, passed, failed, categoryStats, failedResults) {
  const timestamp = new Date().toISOString();

  let report = `# W3C SVG Test Suite Matrix Results

**Generated**: ${timestamp}

## Summary

| Metric | Value |
|--------|-------|
| Total SVGs tested | ${total} |
| Passed | ${passed} |
| Failed | ${failed} |
| Pass Rate | ${((passed/total)*100).toFixed(1)}% |

## Categories Breakdown

| Category | Total | Passed | Failed | Pass Rate |
|----------|-------|--------|--------|-----------|
`;

  // Sort categories by total count descending
  const sortedCategories = Object.entries(categoryStats)
    .sort((a, b) => b[1].total - a[1].total);

  for (const [cat, stats] of sortedCategories) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(1);
    report += `| ${cat} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${rate}% |\n`;
  }

  if (failedResults.length > 0) {
    report += `\n## Failed SVGs (${failedResults.length})\n\n`;
    report += `| File | Category | Error |\n`;
    report += `|------|----------|-------|\n`;

    for (const r of failedResults) {
      const escapedError = (r.error || 'Unknown error').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      report += `| ${r.filename} | ${r.category} | ${escapedError} |\n`;
    }
  } else {
    report += `\n## All SVGs Passed!\n\nNo validation failures detected.\n`;
  }

  report += `\n## Test Details\n\n`;
  report += `- **Test Suite**: W3C SVG 1.1 Test Suite\n`;
  report += `- **Test Location**: tests/samples/svg11_w3c/\n`;
  report += `- **Validation**: Parse -> Serialize -> Re-parse round-trip\n`;
  report += `- **Tolerance**: Element count variation <= 5 (whitespace handling)\n`;

  return report;
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
