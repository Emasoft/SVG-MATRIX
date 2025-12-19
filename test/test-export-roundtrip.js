/**
 * Round-Trip Test for embedExternalDependencies and exportEmbeddedResources
 *
 * Test flow:
 * 1. Load original SVG with external dependencies
 * 2. Embed all external dependencies -> embedded.svg
 * 3. Export embedded resources -> extracted files + stripped.svg
 * 4. Re-embed the extracted resources -> re-embedded.svg
 * 5. Compare embedded.svg and re-embedded.svg - they MUST be identical
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import toolbox from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_DIR = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO');
const OUTPUT_DIR = path.join(__dirname, 'output/roundtrip-test');
const ORIGINAL_SVG = path.join(SAMPLE_DIR, 'cartoon_sample_with_audio.svg');

/**
 * Calculate SHA-256 hash of a string
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Normalize SVG for comparison (remove whitespace variations)
 */
function normalizeSVG(svgString) {
  // Parse and re-serialize to normalize formatting
  const doc = parseSVG(svgString);
  if (!doc) return svgString;
  return serializeSVG(doc);
}

/**
 * Deep comparison of two SVG strings
 */
function compareSVGs(svg1, svg2, label1 = 'SVG1', label2 = 'SVG2') {
  const norm1 = normalizeSVG(svg1);
  const norm2 = normalizeSVG(svg2);

  const hash1 = hashContent(norm1);
  const hash2 = hashContent(norm2);

  const identical = hash1 === hash2;

  return {
    identical,
    hash1,
    hash2,
    size1: svg1.length,
    size2: svg2.length,
    normalizedSize1: norm1.length,
    normalizedSize2: norm2.length,
    sizeDiff: Math.abs(svg1.length - svg2.length),
    normalizedSizeDiff: Math.abs(norm1.length - norm2.length),
  };
}

/**
 * Find differences between two strings
 */
function findDifferences(str1, str2, contextLines = 3) {
  const lines1 = str1.split('\n');
  const lines2 = str2.split('\n');
  const diffs = [];

  const maxLines = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 !== line2) {
      diffs.push({
        line: i + 1,
        original: line1.substring(0, 200),
        modified: line2.substring(0, 200),
      });

      if (diffs.length >= 10) {
        diffs.push({ note: `... and ${maxLines - i - 1} more differences` });
        break;
      }
    }
  }

  return diffs;
}

/**
 * Main round-trip test
 *
 * Test flow for SVG with already-embedded resources:
 * 1. Load original SVG (already has embedded audio/images)
 * 2. Export embedded resources -> extracted files + stripped.svg
 * 3. Re-embed the extracted resources -> re-embedded.svg
 * 4. Compare original.svg and re-embedded.svg - they MUST be identical
 */
async function runRoundTripTest() {
  console.log('='.repeat(70));
  console.log('Round-Trip Test: export -> re-embed (for pre-embedded SVG)');
  console.log('='.repeat(70));
  console.log();

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Step 1: Load original SVG (already has embedded content)
  console.log('Step 1: Loading original SVG with embedded content...');
  const originalSvg = await fs.readFile(ORIGINAL_SVG, 'utf8');
  console.log(`  Original size: ${(originalSvg.length / 1024).toFixed(2)} KB`);
  console.log(`  Path: ${ORIGINAL_SVG}`);

  // Check what embedded content exists
  const hasEmbeddedAudio = originalSvg.includes('data:audio/');
  const hasEmbeddedImages = originalSvg.includes('data:image/');
  console.log(`  Has embedded audio: ${hasEmbeddedAudio}`);
  console.log(`  Has embedded images: ${hasEmbeddedImages}`);

  // Save a copy of original for comparison
  const originalCopyPath = path.join(OUTPUT_DIR, '0-original.svg');
  await fs.writeFile(originalCopyPath, originalSvg);

  // Step 2: Export embedded resources
  // NOTE: Export to same directory as stripped SVG so relative paths (./filename) resolve correctly
  console.log('\nStep 2: Exporting embedded resources...');

  const exportResult = await toolbox.exportEmbeddedResources(originalSvg, {
    outputDir: OUTPUT_DIR,  // Same directory as stripped SVG for correct relative path resolution
    dryRun: false,
    extractImages: true,
    extractAudio: true,
    extractVideo: true,
    extractScripts: true,
    extractStyles: false,  // Keep styles inline for comparison
    extractFonts: true,
  });

  const strippedSvg = serializeSVG(exportResult.doc);
  const strippedPath = path.join(OUTPUT_DIR, '1-stripped.svg');
  await fs.writeFile(strippedPath, strippedSvg);

  console.log(`  Extracted ${exportResult.extractedFiles?.length || 0} resources`);
  console.log(`  Stripped SVG size: ${(strippedSvg.length / 1024).toFixed(2)} KB`);
  console.log(`  Size reduction: ${((1 - strippedSvg.length / originalSvg.length) * 100).toFixed(1)}%`);
  console.log(`  Saved to: ${strippedPath}`);

  if (exportResult.extractedFiles?.length > 0) {
    console.log('  Extracted files:');
    for (const file of exportResult.extractedFiles) {
      console.log(`    - ${file.filename} (${file.type}, ${(file.size / 1024).toFixed(2)} KB)`);
    }
  }

  // Step 3: Re-embed the extracted resources
  console.log('\nStep 3: Re-embedding extracted resources...');
  const reembeddedSvg = await toolbox.embedExternalDependencies(strippedSvg, {
    basePath: strippedPath,
    embedImages: true,
    embedExternalSVGs: true,
    embedCSS: true,
    embedFonts: true,
    embedScripts: true,
    embedAudio: true,
    subsetFonts: false,
    onMissingResource: 'warn',
    timeout: 60000,
  });

  const reembeddedPath = path.join(OUTPUT_DIR, '2-reembedded.svg');
  await fs.writeFile(reembeddedPath, reembeddedSvg);
  console.log(`  Re-embedded size: ${(reembeddedSvg.length / 1024).toFixed(2)} KB`);
  console.log(`  Saved to: ${reembeddedPath}`);

  // Step 4: Compare original and re-embedded SVGs
  console.log('\nStep 4: Comparing original vs re-embedded...');
  const comparison = compareSVGs(originalSvg, reembeddedSvg, 'Original', 'Re-embedded');

  console.log(`  Embedded hash:     ${comparison.hash1}`);
  console.log(`  Re-embedded hash:  ${comparison.hash2}`);
  console.log(`  Size difference:   ${comparison.sizeDiff} bytes`);
  console.log(`  Normalized diff:   ${comparison.normalizedSizeDiff} bytes`);

  if (comparison.identical) {
    console.log('\n  ✅ SUCCESS: Files are IDENTICAL');
  } else {
    console.log('\n  ❌ FAILURE: Files are DIFFERENT');

    // Find and report differences
    const norm1 = normalizeSVG(originalSvg);
    const norm2 = normalizeSVG(reembeddedSvg);
    const diffs = findDifferences(norm1, norm2);

    if (diffs.length > 0) {
      console.log('\n  Differences found:');
      for (const diff of diffs) {
        if (diff.note) {
          console.log(`    ${diff.note}`);
        } else {
          console.log(`    Line ${diff.line}:`);
          console.log(`      - ${diff.original.substring(0, 80)}...`);
          console.log(`      + ${diff.modified.substring(0, 80)}...`);
        }
      }
    }

    // Save diff report
    const diffReport = {
      timestamp: new Date().toISOString(),
      result: 'DIFFERENT',
      comparison,
      differences: diffs,
    };
    const diffPath = path.join(OUTPUT_DIR, 'diff-report.json');
    await fs.writeFile(diffPath, JSON.stringify(diffReport, null, 2));
    console.log(`\n  Diff report saved to: ${diffPath}`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('ROUND-TRIP TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Original:     ${(originalSvg.length / 1024).toFixed(2)} KB (with embedded content)`);
  console.log(`Stripped:     ${(strippedSvg.length / 1024).toFixed(2)} KB (external references)`);
  console.log(`Re-embedded:  ${(reembeddedSvg.length / 1024).toFixed(2)} KB (restored)`);
  console.log(`Files match:  ${comparison.identical ? 'YES ✅' : 'NO ❌'}`);
  console.log('='.repeat(70));

  // Write full results
  const results = {
    timestamp: new Date().toISOString(),
    success: comparison.identical,
    files: {
      original: { path: ORIGINAL_SVG, size: originalSvg.length, hash: comparison.hash1 },
      stripped: { path: strippedPath, size: strippedSvg.length },
      reembedded: { path: reembeddedPath, size: reembeddedSvg.length, hash: comparison.hash2 },
    },
    extractedFiles: exportResult.extractedFiles || [],
    comparison,
  };

  const resultsPath = path.join(OUTPUT_DIR, 'roundtrip-results.json');
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  return comparison.identical;
}

// Run the test
runRoundTripTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Round-trip test failed with error:', err);
    process.exit(1);
  });
