#!/usr/bin/env node

/**
 * Comprehensive test for removeRasterImages function against W3C SVG test suite
 * Tests all 525+ W3C SVG files and checks for:
 * 1. Successful parsing and processing
 * 2. Raster images removal
 * 3. Broken references after removal
 * 4. XML validity
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { JSDOM } from 'jsdom';
import { removeRasterImages } from '/Users/emanuelesabetta/Code/SVG-MATRIX/src/svg-toolbox.js';

const W3C_SVG_DIR = '/Users/emanuelesabetta/Code/SVG-MATRIX/SVG 1.1 W3C Test Suit/svg';
const LOG_FILE = '/tmp/svg-function-tests/removeRasterImages/test-results.log';
const ERRORS_FILE = '/tmp/svg-function-tests/removeRasterImages/errors.json';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class TestResults {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
    this.warnings = [];
    this.stats = {
      filesWithImages: 0,
      imagesRemoved: 0,
      brokenReferences: 0,
      parseErrors: 0,
      validationErrors: 0
    };
  }

  addError(file, type, message, details = {}) {
    this.errors.push({ file, type, message, details, timestamp: new Date().toISOString() });
    this.failed++;
  }

  addWarning(file, type, message, details = {}) {
    this.warnings.push({ file, type, message, details, timestamp: new Date().toISOString() });
  }

  addPass() {
    this.passed++;
  }

  incrementTotal() {
    this.total++;
  }
}

/**
 * Find all SVG files in the W3C test suite
 */
function findSVGFiles(dir) {
  try {
    const files = readdirSync(dir);
    return files
      .filter(f => f.endsWith('.svg'))
      .map(f => join(dir, f))
      .sort();
  } catch (err) {
    console.error(`${colors.red}Error reading directory ${dir}: ${err.message}${colors.reset}`);
    return [];
  }
}

/**
 * Check for broken references in the SVG document
 * Looks for href/xlink:href attributes that reference removed elements
 */
function checkBrokenReferences(doc, removedImageIds) {
  const brokenRefs = [];

  // Get all elements with href or xlink:href attributes
  const elementsWithRefs = doc.querySelectorAll ?
    doc.querySelectorAll('[href], [xlink\\:href]') :
    [...doc.getElementsByTagName('*')].filter(el =>
      el.getAttribute('href') || el.getAttribute('xlink:href')
    );

  for (const el of elementsWithRefs) {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href');
    if (href && href.startsWith('#')) {
      const refId = href.substring(1);

      // Check if this references a removed image
      if (removedImageIds.has(refId)) {
        brokenRefs.push({
          element: el.tagName,
          href: href,
          referencedId: refId
        });
      }
    }
  }

  return brokenRefs;
}

/**
 * Extract IDs from image elements before removal
 */
function extractImageIds(doc) {
  const imageIds = new Set();
  // Handle both document and element nodes
  const images = doc.querySelectorAll ? doc.querySelectorAll('image') : doc.getElementsByTagName('image');

  for (const img of images) {
    const id = img.getAttribute('id');
    if (id) {
      imageIds.add(id);
    }
  }

  return imageIds;
}

/**
 * Count image elements in document
 */
function countImages(doc) {
  // Handle both document and element nodes
  if (doc.querySelectorAll) {
    return doc.querySelectorAll('image').length;
  } else if (doc.getElementsByTagName) {
    return doc.getElementsByTagName('image').length;
  }
  return 0;
}

/**
 * Validate XML structure
 */
function validateXML(svgString) {
  try {
    // Basic XML validation - check for balanced tags and well-formedness
    const dom = new JSDOM(svgString, { contentType: 'image/svg+xml' });
    const parseErrors = dom.window.document.querySelector('parsererror');

    if (parseErrors) {
      return {
        valid: false,
        error: parseErrors.textContent
      };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}

/**
 * Test a single SVG file
 */
async function testSVGFile(filePath, results) {
  const fileName = basename(filePath);

  try {
    // Read the original SVG file
    const svgContent = readFileSync(filePath, 'utf-8');

    // Parse with JSDOM
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const doc = dom.window.document.documentElement;

    // Check for parse errors in original
    const parseErrors = dom.window.document.querySelector('parsererror');
    if (parseErrors) {
      results.addError(fileName, 'parse_error', 'Failed to parse original SVG', {
        error: parseErrors.textContent
      });
      results.stats.parseErrors++;
      return;
    }

    // Count images before removal
    const imagesBefore = countImages(doc);

    // Extract image IDs before removal
    const imageIds = extractImageIds(doc);

    // Apply removeRasterImages
    let processedDoc;
    try {
      processedDoc = await removeRasterImages(doc);
    } catch (err) {
      results.addError(fileName, 'processing_error', 'removeRasterImages threw an error', {
        error: err.message,
        stack: err.stack
      });
      return;
    }

    // Count images after removal
    const imagesAfter = countImages(processedDoc);

    // Update statistics
    if (imagesBefore > 0) {
      results.stats.filesWithImages++;
      results.stats.imagesRemoved += (imagesBefore - imagesAfter);
    }

    // Check if all images were removed
    if (imagesAfter > 0) {
      results.addWarning(fileName, 'incomplete_removal',
        `Not all images were removed (${imagesBefore} -> ${imagesAfter})`, {
        imagesBefore,
        imagesAfter
      });
    }

    // Check for broken references
    const brokenRefs = checkBrokenReferences(processedDoc, imageIds);
    if (brokenRefs.length > 0) {
      results.addError(fileName, 'broken_references',
        `Found ${brokenRefs.length} broken reference(s) to removed images`, {
        brokenReferences: brokenRefs,
        removedImageIds: Array.from(imageIds)
      });
      results.stats.brokenReferences += brokenRefs.length;
    }

    // Serialize and validate XML
    const serializer = new dom.window.XMLSerializer();
    const outputSVG = serializer.serializeToString(processedDoc);

    const validation = validateXML(outputSVG);
    if (!validation.valid) {
      results.addError(fileName, 'validation_error',
        'Output SVG is not valid XML', {
        error: validation.error
      });
      results.stats.validationErrors++;
    }

    // If no errors were added for this file, mark as passed
    const currentErrorCount = results.errors.filter(e => e.file === fileName).length;
    if (currentErrorCount === 0) {
      results.addPass();
    }

  } catch (err) {
    results.addError(fileName, 'test_error', 'Unexpected error during test', {
      error: err.message,
      stack: err.stack
    });
  }

  results.incrementTotal();
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}removeRasterImages W3C Test Suite${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  const results = new TestResults();
  const startTime = Date.now();

  // Find all SVG files
  console.log(`${colors.blue}Scanning for SVG files in: ${W3C_SVG_DIR}${colors.reset}`);
  const svgFiles = findSVGFiles(W3C_SVG_DIR);
  console.log(`${colors.green}Found ${svgFiles.length} SVG files${colors.reset}\n`);

  if (svgFiles.length === 0) {
    console.error(`${colors.red}No SVG files found. Exiting.${colors.reset}`);
    process.exit(1);
  }

  // Process each file
  console.log(`${colors.blue}Processing files...${colors.reset}\n`);

  let processedCount = 0;
  for (const file of svgFiles) {
    processedCount++;

    // Show progress every 50 files
    if (processedCount % 50 === 0) {
      console.log(`${colors.yellow}Progress: ${processedCount}/${svgFiles.length} files processed...${colors.reset}`);
    }

    await testSVGFile(file, results);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print results
  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Test Results${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  console.log(`${colors.bright}Total files tested:${colors.reset} ${results.total}`);
  console.log(`${colors.green}Passed:${colors.reset} ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset} ${results.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings.length}`);
  console.log(`${colors.blue}Duration:${colors.reset} ${duration}s\n`);

  console.log(`${colors.bright}Statistics:${colors.reset}`);
  console.log(`  Files with images: ${results.stats.filesWithImages}`);
  console.log(`  Images removed: ${results.stats.imagesRemoved}`);
  console.log(`  Broken references: ${results.stats.brokenReferences}`);
  console.log(`  Parse errors: ${results.stats.parseErrors}`);
  console.log(`  Validation errors: ${results.stats.validationErrors}\n`);

  // Print errors
  if (results.errors.length > 0) {
    console.log(`${colors.red}${colors.bright}Errors (${results.errors.length}):${colors.reset}`);

    // Group errors by type
    const errorsByType = {};
    for (const error of results.errors) {
      if (!errorsByType[error.type]) {
        errorsByType[error.type] = [];
      }
      errorsByType[error.type].push(error);
    }

    for (const [type, errors] of Object.entries(errorsByType)) {
      console.log(`\n  ${colors.yellow}${type} (${errors.length}):${colors.reset}`);
      for (const error of errors.slice(0, 10)) {
        console.log(`    ${colors.red}✗${colors.reset} ${error.file}: ${error.message}`);
        if (error.details && Object.keys(error.details).length > 0) {
          console.log(`      ${colors.cyan}Details:${colors.reset} ${JSON.stringify(error.details, null, 2).split('\n').slice(0, 5).join('\n      ')}`);
        }
      }
      if (errors.length > 10) {
        console.log(`    ${colors.yellow}... and ${errors.length - 10} more${colors.reset}`);
      }
    }
  }

  // Print warnings
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}${colors.bright}Warnings (${results.warnings.length}):${colors.reset}`);
    for (const warning of results.warnings.slice(0, 20)) {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${warning.file}: ${warning.message}`);
    }
    if (results.warnings.length > 20) {
      console.log(`  ${colors.yellow}... and ${results.warnings.length - 20} more${colors.reset}`);
    }
  }

  // Save detailed results to files
  const logContent = `
removeRasterImages W3C Test Suite Results
==========================================
Generated: ${new Date().toISOString()}
Duration: ${duration}s

Summary:
--------
Total files: ${results.total}
Passed: ${results.passed}
Failed: ${results.failed}
Warnings: ${results.warnings.length}

Statistics:
-----------
Files with images: ${results.stats.filesWithImages}
Images removed: ${results.stats.imagesRemoved}
Broken references: ${results.stats.brokenReferences}
Parse errors: ${results.stats.parseErrors}
Validation errors: ${results.stats.validationErrors}

Errors:
-------
${results.errors.map(e => `
File: ${e.file}
Type: ${e.type}
Message: ${e.message}
Details: ${JSON.stringify(e.details, null, 2)}
Time: ${e.timestamp}
`).join('\n---\n')}

Warnings:
---------
${results.warnings.map(w => `
File: ${w.file}
Type: ${w.type}
Message: ${w.message}
Details: ${JSON.stringify(w.details, null, 2)}
Time: ${w.timestamp}
`).join('\n---\n')}
`;

  writeFileSync(LOG_FILE, logContent);
  console.log(`\n${colors.blue}Detailed log saved to: ${LOG_FILE}${colors.reset}`);

  writeFileSync(ERRORS_FILE, JSON.stringify({
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings.length,
      duration: duration
    },
    stats: results.stats,
    errors: results.errors,
    warnings: results.warnings
  }, null, 2));
  console.log(`${colors.blue}Error details saved to: ${ERRORS_FILE}${colors.reset}`);

  console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  console.error(err.stack);
  process.exit(1);
});
