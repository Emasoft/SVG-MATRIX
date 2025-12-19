/**
 * Test suite for exportEmbeddedResources function
 *
 * Tests the extraction of embedded resources from SVGs:
 * - Images (data URIs)
 * - Audio/Video
 * - Scripts
 * - Styles and fonts
 * - Element ID filtering
 * - Dry run mode
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportEmbeddedResources, embedExternalDependencies } from '../src/svg-toolbox.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output/export-test');
const SAMPLE_DIR = path.join(__dirname, '../samples/SVG_WITH_EXTERNAL_DEPENDENCIES');

// Test tracking
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

// Test SVG with embedded image
const SVG_WITH_EMBEDDED_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <image id="img1" x="0" y="0" width="50" height="50"
    href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="/>
  <image id="img2" x="50" y="50" width="50" height="50"
    xlink:href="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="/>
</svg>`;

// Test SVG with inline script
const SVG_WITH_INLINE_SCRIPT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <script type="text/javascript"><![CDATA[
    function onClick() {
      console.log('Clicked!');
    }
  ]]></script>
  <rect x="10" y="10" width="80" height="80" fill="blue" onclick="onClick()"/>
</svg>`;

// Test SVG with inline style
const SVG_WITH_INLINE_STYLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <style type="text/css"><![CDATA[
    .myRect { fill: red; stroke: black; stroke-width: 2; }
    .myCircle { fill: blue; opacity: 0.5; }
  ]]></style>
  <rect class="myRect" x="10" y="10" width="40" height="40"/>
  <circle class="myCircle" cx="70" cy="70" r="20"/>
</svg>`;

// Test SVG with embedded font
const SVG_WITH_EMBEDDED_FONT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <style type="text/css"><![CDATA[
    @font-face {
      font-family: 'CustomFont';
      src: url(data:font/woff2;base64,d09GMgABAAAAAADcAAsAAAAAARAAAACQAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAAghQAEQgKAD) format('woff2');
    }
    .title { font-family: 'CustomFont', sans-serif; font-size: 24px; }
  ]]></style>
  <text class="title" x="10" y="50">Hello World</text>
</svg>`;

// Test SVG with mixed content
const SVG_WITH_MIXED_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200">
  <style type="text/css"><![CDATA[
    .bg { fill: #f0f0f0; }
  ]]></style>
  <script type="text/javascript"><![CDATA[
    var x = 10;
  ]]></script>
  <rect class="bg" x="0" y="0" width="200" height="200"/>
  <g id="icons">
    <image id="icon1" x="10" y="10" width="32" height="32"
      href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="/>
    <image id="icon2" x="50" y="10" width="32" height="32"
      href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAHl6u8AAAAABJRU5ErkJggg=="/>
  </g>
</svg>`;

async function cleanOutputDir() {
  try {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('Export Embedded Resources Test Suite');
  console.log('='.repeat(70));
  console.log();

  await cleanOutputDir();

  // Test 1: Dry run mode
  console.log('Test 1: Dry Run Mode');
  console.log('-'.repeat(50));
  {
    const result = await exportEmbeddedResources(SVG_WITH_EMBEDDED_IMAGE, {
      dryRun: true,
    });

    assert(result.extractedFiles.length === 2, 'Found 2 embedded images');
    assert(result.summary.images === 2, 'Summary shows 2 images');
    assert(result.extractedFiles[0].mimeType === 'image/png', 'First image is PNG');
    assert(result.extractedFiles[1].mimeType === 'image/jpeg', 'Second image is JPEG');
  }
  console.log();

  // Test 2: Extract images to files
  console.log('Test 2: Extract Images to Files');
  console.log('-'.repeat(50));
  {
    const outputDir = path.join(OUTPUT_DIR, 'test2_images');
    const result = await exportEmbeddedResources(SVG_WITH_EMBEDDED_IMAGE, {
      outputDir,
      filenamePrefix: 'img',
    });

    assert(result.extractedFiles.length === 2, 'Extracted 2 images');

    // Verify files were created
    const files = await fs.readdir(outputDir);
    assert(files.length === 2, '2 files created in output directory');
    assert(files.some(f => f.endsWith('.png')), 'PNG file created');
    assert(files.some(f => f.endsWith('.jpg')), 'JPG file created');

    // Verify SVG was modified (result.doc is already a string)
    const svg = result.doc;
    assert(!svg.includes('data:image/'), 'Data URIs removed from SVG');
    assert(svg.includes('./img_'), 'Relative paths added to SVG');
  }
  console.log();

  // Test 3: Extract inline script
  console.log('Test 3: Extract Inline Script');
  console.log('-'.repeat(50));
  {
    const outputDir = path.join(OUTPUT_DIR, 'test3_script');
    const result = await exportEmbeddedResources(SVG_WITH_INLINE_SCRIPT, {
      outputDir,
      filenamePrefix: 'script',
      extractImages: false,
    });

    assert(result.summary.scripts === 1, 'Extracted 1 script');

    // Verify file content
    const files = await fs.readdir(outputDir);
    assert(files.some(f => f.endsWith('.js')), 'JS file created');

    const jsFile = files.find(f => f.endsWith('.js'));
    const jsContent = await fs.readFile(path.join(outputDir, jsFile), 'utf8');
    assert(jsContent.includes('function onClick'), 'Script content preserved');

    // Verify SVG references external script (result.doc is already a string)
    const svg = result.doc;
    assert(svg.includes('href="./'), 'Script element references external file');
  }
  console.log();

  // Test 4: Extract inline styles
  console.log('Test 4: Extract Inline Styles');
  console.log('-'.repeat(50));
  {
    const outputDir = path.join(OUTPUT_DIR, 'test4_styles');
    const result = await exportEmbeddedResources(SVG_WITH_INLINE_STYLE, {
      outputDir,
      filenamePrefix: 'style',
      extractImages: false,
      extractScripts: false,
    });

    assert(result.summary.stylesheets === 1, 'Extracted 1 stylesheet');

    // Verify CSS file content
    const files = await fs.readdir(outputDir);
    const cssFile = files.find(f => f.endsWith('.css'));
    assert(cssFile, 'CSS file created');

    const cssContent = await fs.readFile(path.join(outputDir, cssFile), 'utf8');
    assert(cssContent.includes('.myRect'), 'CSS class preserved');
    assert(cssContent.includes('.myCircle'), 'CSS class preserved');

    // Verify SVG uses @import (result.doc is already a string)
    const svg = result.doc;
    assert(svg.includes('@import'), 'Style element uses @import');
  }
  console.log();

  // Test 5: Extract fonts with Google Fonts restoration
  console.log('Test 5: Extract Fonts');
  console.log('-'.repeat(50));
  {
    const outputDir = path.join(OUTPUT_DIR, 'test5_fonts');
    const result = await exportEmbeddedResources(SVG_WITH_EMBEDDED_FONT, {
      outputDir,
      filenamePrefix: 'font',
      extractImages: false,
      extractScripts: false,
      restoreGoogleFonts: false, // Don't restore for this test
    });

    assert(result.summary.fonts >= 1, 'Extracted at least 1 font');

    const files = await fs.readdir(outputDir);
    assert(files.some(f => f.includes('font')), 'Font file created');
  }
  console.log();

  // Test 6: Element ID filtering
  console.log('Test 6: Element ID Filtering');
  console.log('-'.repeat(50));
  {
    const result = await exportEmbeddedResources(SVG_WITH_MIXED_CONTENT, {
      dryRun: true,
      elementIds: 'icon1', // Only extract from icon1
    });

    assert(result.summary.images === 1, 'Extracted only 1 image (filtered by ID)');
    assert(result.extractedFiles[0].elementId === 'icon1', 'Extracted element has correct ID');
  }
  console.log();

  // Test 7: Multiple element IDs
  console.log('Test 7: Multiple Element IDs');
  console.log('-'.repeat(50));
  {
    const result = await exportEmbeddedResources(SVG_WITH_MIXED_CONTENT, {
      dryRun: true,
      elementIds: ['icon1', 'icon2'],
    });

    assert(result.summary.images === 2, 'Extracted 2 images (both IDs)');
  }
  console.log();

  // Test 8: Parent ID filtering (extract from group)
  console.log('Test 8: Parent ID Filtering');
  console.log('-'.repeat(50));
  {
    const result = await exportEmbeddedResources(SVG_WITH_MIXED_CONTENT, {
      dryRun: true,
      elementIds: 'icons', // Parent group ID
    });

    assert(result.summary.images === 2, 'Extracted 2 images from group');
  }
  console.log();

  // Test 9: Selective extraction (images only)
  console.log('Test 9: Selective Extraction');
  console.log('-'.repeat(50));
  {
    const result = await exportEmbeddedResources(SVG_WITH_MIXED_CONTENT, {
      dryRun: true,
      extractImages: true,
      extractScripts: false,
      extractStyles: false,
      extractFonts: false,
    });

    assert(result.summary.images === 2, 'Extracted 2 images');
    assert(result.summary.scripts === 0, 'No scripts extracted');
    assert(result.summary.stylesheets === 0, 'No stylesheets extracted');
  }
  console.log();

  // Test 10: Extract Only mode (no SVG modification)
  console.log('Test 10: Extract Only Mode');
  console.log('-'.repeat(50));
  {
    const outputDir = path.join(OUTPUT_DIR, 'test10_extractonly');
    const result = await exportEmbeddedResources(SVG_WITH_EMBEDDED_IMAGE, {
      outputDir,
      filenamePrefix: 'extractonly',
      extractOnly: true,
    });

    assert(result.extractedFiles.length === 2, 'Extracted 2 images');
    assert(result.doc === null, 'No SVG document returned (extractOnly mode)');

    // Verify files were created
    const files = await fs.readdir(outputDir);
    assert(files.length === 2, '2 files created in output directory');

    // Verify original SVG is unchanged (parse it again and check data URIs still present)
    const reparsed = parseSVG(SVG_WITH_EMBEDDED_IMAGE);
    const images = reparsed.getElementsByTagName('image');
    const href1 = images[0].getAttribute('href');
    const href2 = images[1].getAttribute('xlink:href');
    assert(href1.startsWith('data:'), 'Original SVG still has data URI (image 1)');
    assert(href2.startsWith('data:'), 'Original SVG still has data URI (image 2)');
  }
  console.log();

  // Test 11: Round-trip with real embedded SVG
  console.log('Test 11: Round-Trip (Embed then Export)');
  console.log('-'.repeat(50));
  {
    // First embed external dependencies
    const originalPath = path.join(SAMPLE_DIR, '8bitsdrummachine+fonts.svg');
    let originalSvg;
    try {
      originalSvg = await fs.readFile(originalPath, 'utf8');
    } catch {
      console.log('  ⏭️  Skipping: Sample file not found');
      console.log();
    }

    if (originalSvg) {
      const embeddedSvg = await embedExternalDependencies(originalSvg, {
        basePath: originalPath,
        embedImages: true,
        embedScripts: true,
        embedFonts: true,
        embedAudio: true,
        subsetFonts: false,
        onMissingResource: 'skip',
        timeout: 30000,
      });

      const embeddedSize = Buffer.byteLength(serializeSVG(embeddedSvg), 'utf8');
      console.log(`  Embedded SVG size: ${(embeddedSize / 1024).toFixed(1)} KB`);

      // Now export the embedded resources
      const outputDir = path.join(OUTPUT_DIR, 'test11_roundtrip');
      const result = await exportEmbeddedResources(embeddedSvg, {
        outputDir,
        filenamePrefix: '8bits',
      });

      const exportedSize = Buffer.byteLength(result.doc, 'utf8');
      console.log(`  Exported SVG size: ${(exportedSize / 1024).toFixed(1)} KB`);
      console.log(`  Extracted files: ${result.extractedFiles.length}`);
      console.log(`  Total extracted size: ${(result.summary.totalSize / 1024).toFixed(1)} KB`);

      assert(result.extractedFiles.length > 0, 'Extracted resources from embedded SVG');
      assert(exportedSize < embeddedSize, 'Exported SVG is smaller than embedded');

      // Verify files were created
      const files = await fs.readdir(outputDir);
      assert(files.length > 0, 'Files created in output directory');
    }
  }
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('Test Summary');
  console.log('='.repeat(70));
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
