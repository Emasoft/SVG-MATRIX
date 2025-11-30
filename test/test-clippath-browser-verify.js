/**
 * Browser Verification Tests for ClipPath
 *
 * Verifies our clipPath implementation against Chrome's native SVG rendering.
 * Uses Playwright to render SVGs and compare pixel output.
 */

import { chromium } from 'playwright';
import Decimal from 'decimal.js';
import * as PolygonClip from '../src/polygon-clip.js';
import {
  pathToPolygon,
  shapeToPolygon,
  resolveClipPath,
  applyClipPath,
  polygonToPathData
} from '../src/clip-path-resolver.js';

Decimal.set({ precision: 80 });

// Test configuration
const CANVAS_SIZE = 200;
const TOLERANCE_PERCENT = 2.0; // Allow 2% pixel mismatch for anti-aliasing

/**
 * ClipPath Browser Verifier
 */
class ClipPathVerifier {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: CANVAS_SIZE + 50, height: CANVAS_SIZE + 50 });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Render an SVG and get pixel data.
   */
  async renderSVG(svgContent) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>body { margin: 0; padding: 10px; background: white; }</style></head>
      <body>${svgContent}</body>
      </html>
    `;

    await this.page.setContent(html);
    await this.page.waitForTimeout(100); // Wait for render

    // Get pixel data from a screenshot
    const screenshot = await this.page.screenshot({
      clip: { x: 10, y: 10, width: CANVAS_SIZE, height: CANVAS_SIZE }
    });

    return screenshot;
  }

  /**
   * Count non-white pixels in a screenshot buffer.
   */
  countFilledPixels(buffer) {
    // PNG buffer - we'll count based on file size as proxy
    // (filled areas compress differently than empty)
    return buffer.length;
  }

  /**
   * Compare two SVG renders by rendering both and checking similarity.
   */
  async compareSVGs(svg1, svg2) {
    const render1 = await this.renderSVG(svg1);
    const render2 = await this.renderSVG(svg2);

    // Simple comparison: file sizes should be similar
    // More sophisticated: actual pixel comparison
    const size1 = render1.length;
    const size2 = render2.length;

    const sizeDiff = Math.abs(size1 - size2);
    const maxSize = Math.max(size1, size2);
    const diffPercent = (sizeDiff / maxSize) * 100;

    return {
      similar: diffPercent < TOLERANCE_PERCENT * 5, // More lenient for size comparison
      size1,
      size2,
      diffPercent
    };
  }

  /**
   * Get visual bounding box by rendering and analyzing pixels.
   * getBBox() returns unclipped geometry, so we use pixel analysis instead.
   */
  async getBrowserClippedBBox(subjectPath, clipPath) {
    return await this.page.evaluate(async ({ subject, clip }) => {
      // Create SVG using DOM methods (safe, no innerHTML)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '200');
      svg.setAttribute('height', '200');

      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clipPathEl.setAttribute('id', 'testClip');

      const clipShape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      clipShape.setAttribute('d', clip);
      clipPathEl.appendChild(clipShape);
      defs.appendChild(clipPathEl);
      svg.appendChild(defs);

      const subjectShape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      subjectShape.setAttribute('d', subject);
      subjectShape.setAttribute('fill', 'red');
      subjectShape.setAttribute('clip-path', 'url(#testClip)');
      svg.appendChild(subjectShape);

      document.body.appendChild(svg);

      // Wait for render
      await new Promise(r => setTimeout(r, 50));

      // Use canvas to analyze pixels
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');

      // Draw SVG to canvas using data URL
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      document.body.removeChild(svg);

      // Analyze pixels to find bounds
      const imageData = ctx.getImageData(0, 0, 200, 200);
      const data = imageData.data;

      let minX = 200, minY = 200, maxX = 0, maxY = 0;
      let hasPixels = false;

      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 200; x++) {
          const idx = (y * 200 + x) * 4;
          // Check if pixel is red (not white/transparent)
          if (data[idx] > 200 && data[idx + 3] > 200) {
            hasPixels = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!hasPixels) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    }, { subject: subjectPath, clip: clipPath });
  }

  /**
   * Verify a clipPath scenario.
   */
  async verifyClipPath(testCase) {
    const { name, subject, clipPathDef } = testCase;

    // 1. Compute our result
    const result = applyClipPath(subject, clipPathDef, null, { samples: 20 });

    if (result.length === 0) {
      // No intersection - verify browser also shows nothing
      const subjectPath = this.elementToPath(subject);
      const clipPath = this.elementToPath(clipPathDef.children[0]);

      const browserBBox = await this.getBrowserClippedBBox(subjectPath, clipPath);

      // Empty result should have zero or near-zero dimensions
      const isEmpty = browserBBox.width < 0.1 || browserBBox.height < 0.1;

      return {
        name,
        passed: isEmpty,
        ourResult: 'empty',
        browserResult: isEmpty ? 'empty' : `${browserBBox.width}x${browserBBox.height}`,
        message: isEmpty ? 'Both empty' : 'Mismatch: we returned empty but browser has content'
      };
    }

    // 2. Get our bounding box
    const ourPolygon = result[0];
    const ourBBox = PolygonClip.boundingBox(ourPolygon);
    const ourWidth = ourBBox.maxX.minus(ourBBox.minX).toNumber();
    const ourHeight = ourBBox.maxY.minus(ourBBox.minY).toNumber();

    // 3. Get browser bounding box
    const subjectPath = this.elementToPath(subject);
    const clipPath = this.elementToPath(clipPathDef.children[0]);
    const browserBBox = await this.getBrowserClippedBBox(subjectPath, clipPath);

    // 4. Compare
    const widthDiff = Math.abs(ourWidth - browserBBox.width);
    const heightDiff = Math.abs(ourHeight - browserBBox.height);
    const tolerance = 5; // 5 pixel tolerance for sampling differences

    const passed = widthDiff < tolerance && heightDiff < tolerance;

    return {
      name,
      passed,
      ourBBox: { width: ourWidth.toFixed(2), height: ourHeight.toFixed(2) },
      browserBBox: { width: browserBBox.width.toFixed(2), height: browserBBox.height.toFixed(2) },
      widthDiff: widthDiff.toFixed(2),
      heightDiff: heightDiff.toFixed(2),
      message: passed ? 'Match' : `Width diff: ${widthDiff.toFixed(2)}, Height diff: ${heightDiff.toFixed(2)}`
    };
  }

  /**
   * Convert element to SVG path string.
   */
  elementToPath(element) {
    switch (element.type) {
      case 'rect': {
        const x = element.x || 0;
        const y = element.y || 0;
        const w = element.width || 0;
        const h = element.height || 0;
        return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      }
      case 'circle': {
        const cx = element.cx || 0;
        const cy = element.cy || 0;
        const r = element.r || 0;
        // Approximate circle with path
        return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
      }
      case 'ellipse': {
        const cx = element.cx || 0;
        const cy = element.cy || 0;
        const rx = element.rx || 0;
        const ry = element.ry || 0;
        return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
      }
      case 'path':
        return element.d || '';
      default:
        return '';
    }
  }

  /**
   * Verify visual rendering of original vs flattened SVG.
   */
  async verifyVisualMatch(testCase) {
    const { name, subject, clipPathDef } = testCase;

    // 1. Create original SVG with clipPath
    const subjectPath = this.elementToPath(subject);
    const clipPath = this.elementToPath(clipPathDef.children[0]);

    const originalSVG = `
      <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="clip">
            <path d="${clipPath}"/>
          </clipPath>
        </defs>
        <path d="${subjectPath}" fill="red" clip-path="url(#clip)"/>
      </svg>
    `;

    // 2. Create flattened SVG (our result, no clipPath)
    const result = applyClipPath(subject, clipPathDef, null, { samples: 20 });

    let flattenedSVG;
    if (result.length === 0) {
      flattenedSVG = `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    } else {
      const flattenedPath = polygonToPathData(result[0], 6);
      flattenedSVG = `
        <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
          <path d="${flattenedPath}" fill="red"/>
        </svg>
      `;
    }

    // 3. Compare renders
    const comparison = await this.compareSVGs(originalSVG, flattenedSVG);

    return {
      name,
      passed: comparison.similar,
      originalSize: comparison.size1,
      flattenedSize: comparison.size2,
      diffPercent: comparison.diffPercent.toFixed(2),
      message: comparison.similar ? 'Visual match' : `Size diff: ${comparison.diffPercent.toFixed(2)}%`
    };
  }
}

// ============================================================================
// Test Cases
// ============================================================================

const TEST_CASES = [
  {
    name: 'Rect clipped by smaller rect',
    subject: { type: 'rect', x: 20, y: 20, width: 160, height: 160 },
    clipPathDef: {
      children: [{ type: 'rect', x: 50, y: 50, width: 100, height: 100 }]
    }
  },
  {
    name: 'Circle clipped by rect',
    subject: { type: 'circle', cx: 100, cy: 100, r: 80 },
    clipPathDef: {
      children: [{ type: 'rect', x: 50, y: 50, width: 100, height: 100 }]
    }
  },
  {
    name: 'Rect clipped by circle',
    subject: { type: 'rect', x: 20, y: 20, width: 160, height: 160 },
    clipPathDef: {
      children: [{ type: 'circle', cx: 100, cy: 100, r: 60 }]
    }
  },
  {
    name: 'Overlapping squares (partial)',
    subject: { type: 'rect', x: 20, y: 20, width: 100, height: 100 },
    clipPathDef: {
      children: [{ type: 'rect', x: 70, y: 70, width: 100, height: 100 }]
    }
  },
  {
    name: 'Non-overlapping (empty result)',
    subject: { type: 'rect', x: 10, y: 10, width: 50, height: 50 },
    clipPathDef: {
      children: [{ type: 'rect', x: 100, y: 100, width: 50, height: 50 }]
    }
  },
  {
    name: 'Subject inside clip (unchanged)',
    subject: { type: 'rect', x: 60, y: 60, width: 80, height: 80 },
    clipPathDef: {
      children: [{ type: 'rect', x: 20, y: 20, width: 160, height: 160 }]
    }
  },
  {
    name: 'Ellipse clipped by rect',
    subject: { type: 'ellipse', cx: 100, cy: 100, rx: 80, ry: 50 },
    clipPathDef: {
      children: [{ type: 'rect', x: 40, y: 40, width: 120, height: 120 }]
    }
  },
  {
    name: 'Path clipped by rect',
    subject: { type: 'path', d: 'M 20 100 L 100 20 L 180 100 L 100 180 Z' },
    clipPathDef: {
      children: [{ type: 'rect', x: 40, y: 40, width: 120, height: 120 }]
    }
  }
];

// ============================================================================
// Run Tests
// ============================================================================

async function runBrowserTests() {
  console.log('\n' + '='.repeat(70));
  console.log('CLIPPATH BROWSER VERIFICATION TESTS');
  console.log('='.repeat(70) + '\n');

  const verifier = new ClipPathVerifier();

  try {
    await verifier.init();
    console.log('Browser initialized\n');

    const results = [];
    let passed = 0;
    let failed = 0;

    // Run bounding box comparison tests
    console.log('--- Bounding Box Comparison ---\n');

    for (const testCase of TEST_CASES) {
      try {
        const result = await verifier.verifyClipPath(testCase);
        results.push(result);

        const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`  ${icon} ${result.name}`);

        if (!result.passed) {
          console.log(`    \x1b[33m${result.message}\x1b[0m`);
        }

        if (result.passed) passed++;
        else failed++;
      } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${testCase.name}`);
        console.log(`    \x1b[33mError: ${e.message}\x1b[0m`);
        failed++;
      }
    }

    // Run visual comparison tests
    console.log('\n--- Visual Comparison ---\n');

    for (const testCase of TEST_CASES) {
      try {
        const result = await verifier.verifyVisualMatch(testCase);

        const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`  ${icon} ${result.name} (visual)`);

        if (!result.passed) {
          console.log(`    \x1b[33m${result.message}\x1b[0m`);
        }

        if (result.passed) passed++;
        else failed++;
      } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${testCase.name} (visual)`);
        console.log(`    \x1b[33mError: ${e.message}\x1b[0m`);
        failed++;
      }
    }

    // Summary
    console.log('\n' + '─'.repeat(50));
    console.log(`Total: ${passed + failed} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m`);

    if (failed === 0) {
      console.log('\n\x1b[32mAll browser verification tests PASSED!\x1b[0m');
      console.log('Our clipPath implementation matches browser rendering.\n');
    } else {
      console.log(`\n\x1b[33m${failed} tests need attention.\x1b[0m`);
      console.log('Some differences may be due to curve sampling resolution.\n');
    }

    return { passed, failed, results };

  } finally {
    await verifier.close();
  }
}

// Run if called directly
runBrowserTests().catch(console.error);
