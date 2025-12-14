/**
 * Real-world test for embedExternalDependencies with the 8bits drum machine SVG.
 * This SVG has:
 * - 6 Google Fonts (@import)
 * - 2 external JavaScript files
 * - 1 external JPEG image
 * - References to 7 WAV audio files
 */

import { embedExternalDependencies } from '../src/svg-toolbox.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_DIR = path.join(__dirname, '../samples/SVG_WITH_EXTERNAL_DEPENDENCIES');
const OUTPUT_DIR = path.join(__dirname, 'output');

async function runTest() {
  console.log('='.repeat(70));
  console.log('Real-World embedExternalDependencies Test');
  console.log('Sample: 8bitsdrummachine+fonts.svg');
  console.log('='.repeat(70));
  console.log();

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Load the original SVG
  const svgPath = path.join(SAMPLE_DIR, '8bitsdrummachine+fonts.svg');
  const originalSvg = await fs.readFile(svgPath, 'utf8');
  const originalSize = Buffer.byteLength(originalSvg, 'utf8');

  console.log(`Original SVG size: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log();

  // Count external references in original
  const externalRefs = {
    googleFontsImports: (originalSvg.match(/@import\s+url\([^)]*fonts\.googleapis[^)]*\)/g) || []).length,
    externalScripts: (originalSvg.match(/<script[^>]*xlink:href=/g) || []).length,
    externalImages: (originalSvg.match(/xlink:href="[^"#][^"]*\.(jpg|png|gif|svg)"/gi) || []).length,
  };

  console.log('External references detected:');
  console.log(`  - Google Fonts @import: ${externalRefs.googleFontsImports}`);
  console.log(`  - External scripts: ${externalRefs.externalScripts}`);
  console.log(`  - External images: ${externalRefs.externalImages}`);
  console.log();

  // Test 1: Embed with font subsetting (default)
  console.log('Test 1: Embedding with font subsetting enabled...');
  console.log('-'.repeat(50));

  let embeddedSize = 0; // Define outside try block for Test 2 access

  try {
    const startTime = Date.now();
    const embeddedSvg = await embedExternalDependencies(originalSvg, {
      basePath: svgPath,
      embedImages: true,
      embedExternalSVGs: true,
      embedCSS: true,
      embedFonts: true,
      embedScripts: true,
      subsetFonts: true,  // Key: enable font subsetting
      verbose: true,      // Log font subsetting info
      onMissingResource: 'warn',  // Warn but continue
      timeout: 60000,     // 60s timeout for font downloads
    });
    const endTime = Date.now();

    embeddedSize = Buffer.byteLength(embeddedSvg, 'utf8'); // Update the outer variable
    console.log();
    console.log(`Embedded SVG size: ${(embeddedSize / 1024).toFixed(2)} KB`);
    console.log(`Processing time: ${(endTime - startTime) / 1000}s`);

    // Verify no external URLs remain (except data: URIs and namespace declarations)
    const remainingExternalUrls = embeddedSvg.match(/(?<!data:)[a-z]+:\/\/[^\s"'<>]+/gi) || [];
    const namespacePatterns = [
      'http://www.w3.org/',
      'http://purl.org/',
      'http://creativecommons.org/',
      'http://sodipodi.sourceforge.net/',
      'http://inkscape.org/'
    ];
    const nonDataUrls = remainingExternalUrls.filter(url =>
      !url.startsWith('data:') &&
      !namespacePatterns.some(ns => url.startsWith(ns))
    );

    console.log();
    if (nonDataUrls.length === 0) {
      console.log('✅ SUCCESS: No external resource URLs remain - SVG is self-contained!');
    } else {
      console.log('⚠️  WARNING: Some external resource URLs remain:');
      nonDataUrls.slice(0, 5).forEach(url => console.log(`    - ${url}`));
      if (nonDataUrls.length > 5) {
        console.log(`    ... and ${nonDataUrls.length - 5} more`);
      }
    }

    // Check for embedded content
    const hasEmbeddedFonts = embeddedSvg.includes('data:font/') || embeddedSvg.includes('data:application/font');
    const hasEmbeddedImages = embeddedSvg.includes('data:image/');

    // Check scripts: look for external script references (xlink:href)
    const externalScriptRefs = embeddedSvg.match(/<script[^>]*xlink:href=/gi) || [];
    const hasExternalScripts = externalScriptRefs.length > 0;
    const scriptTags = embeddedSvg.match(/<script[^>]*>/gi) || [];

    console.log();
    console.log('Embedded content verification:');
    console.log(`  - Fonts embedded as base64: ${hasEmbeddedFonts ? '✅' : '❌'}`);
    console.log(`  - Images embedded as base64: ${hasEmbeddedImages ? '✅' : '❌'}`);
    console.log(`  - Scripts: ${scriptTags.length} tag(s) found, ${externalScriptRefs.length} external ${hasExternalScripts ? '❌ NOT embedded' : '✅ embedded/removed'}`);

    // Calculate size reduction from font subsetting
    const fontSubsetSavings = ((originalSize - embeddedSize) / originalSize * 100);
    console.log();
    console.log(`Size analysis:`);
    console.log(`  - Original: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`  - Embedded (with subsetting): ${(embeddedSize / 1024).toFixed(2)} KB`);
    console.log(`  - Increase: ${((embeddedSize - originalSize) / 1024).toFixed(2)} KB (${((embeddedSize / originalSize - 1) * 100).toFixed(1)}%)`);

    // Save output for manual inspection
    const outputPath = path.join(OUTPUT_DIR, '8bitsdrummachine-embedded.svg');
    await fs.writeFile(outputPath, embeddedSvg, 'utf8');
    console.log();
    console.log(`Output saved to: ${outputPath}`);
    console.log('Open this file in a browser to verify it works without external dependencies.');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
  }

  // Test 2: Compare with font subsetting disabled
  console.log();
  console.log('Test 2: Embedding WITHOUT font subsetting (for comparison)...');
  console.log('-'.repeat(50));

  try {
    const startTime2 = Date.now();
    const embeddedNoSubset = await embedExternalDependencies(originalSvg, {
      basePath: svgPath,
      embedImages: true,
      embedExternalSVGs: true,
      embedCSS: true,
      embedFonts: true,
      embedScripts: true,
      subsetFonts: false,  // Disable font subsetting
      onMissingResource: 'warn',
      timeout: 60000,
    });
    const endTime2 = Date.now();

    const noSubsetSize = Buffer.byteLength(embeddedNoSubset, 'utf8');
    console.log();
    console.log(`Size without subsetting: ${(noSubsetSize / 1024).toFixed(2)} KB`);
    console.log(`Processing time: ${(endTime2 - startTime2) / 1000}s`);

    // Calculate savings from font subsetting
    const savings = noSubsetSize - embeddedSize;
    const savingsPercent = (savings / noSubsetSize * 100);
    console.log();
    console.log(`Font subsetting savings:`);
    console.log(`  - Size reduction: ${(savings / 1024).toFixed(2)} KB (${savingsPercent.toFixed(1)}% smaller)`);

    // Save this version too
    const outputPathNoSubset = path.join(OUTPUT_DIR, '8bitsdrummachine-embedded-no-subset.svg');
    await fs.writeFile(outputPathNoSubset, embeddedNoSubset, 'utf8');
    console.log();
    console.log(`Output saved to: ${outputPathNoSubset}`);

  } catch (error) {
    console.log('⚠️  Could not complete comparison test:', error.message);
  }

  console.log();
  console.log('='.repeat(70));
  console.log('Test complete!');
  console.log('='.repeat(70));
}

// Run the test
runTest().catch(console.error);
