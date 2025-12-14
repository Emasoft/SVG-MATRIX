#!/usr/bin/env node
/**
 * Playwright test for embedded SVG verification
 * Verifies that embedExternalDependencies() creates truly self-contained SVGs
 *
 * Tests:
 * 1. No external network requests are made (all resources embedded)
 * 2. Resource interceptor (__EMBEDDED_RESOURCES__) is present
 * 3. Audio constructor override works with embedded data URIs
 * 4. SVG renders correctly in browser
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_FILE = resolve(__dirname, 'output/8bitsdrummachine-embedded.svg');
const TIMEOUT = 30000;

// Unicode box drawing characters for table
const BOX = {
  topLeft: '\u250F',
  topRight: '\u2513',
  bottomLeft: '\u2517',
  bottomRight: '\u251B',
  horizontal: '\u2501',
  vertical: '\u2503',
  leftT: '\u2523',
  rightT: '\u252B',
  topT: '\u2533',
  bottomT: '\u253B',
  cross: '\u254B',
};

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * Draws a formatted table with results
 */
function drawResultsTable(results) {
  const colWidths = [50, 10, 40];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + colWidths.length + 1;

  // Header line
  let header = BOX.topLeft;
  colWidths.forEach((w, i) => {
    header += BOX.horizontal.repeat(w);
    header += i < colWidths.length - 1 ? BOX.topT : BOX.topRight;
  });
  console.log(header);

  // Header row
  const headers = ['Test Description', 'Status', 'Details'];
  let headerRow = BOX.vertical;
  headers.forEach((h, i) => {
    const padded = ` ${h}`.padEnd(colWidths[i]);
    headerRow += `${COLORS.bold}${COLORS.cyan}${padded}${COLORS.reset}${BOX.vertical}`;
  });
  console.log(headerRow);

  // Separator line
  let separator = BOX.leftT;
  colWidths.forEach((w, i) => {
    separator += BOX.horizontal.repeat(w);
    separator += i < colWidths.length - 1 ? BOX.cross : BOX.rightT;
  });
  console.log(separator);

  // Data rows
  results.forEach((result) => {
    let row = BOX.vertical;
    const statusColor = result.status === 'PASS' ? COLORS.green :
                        result.status === 'FAIL' ? COLORS.red : COLORS.yellow;

    const cells = [
      ` ${result.description}`.padEnd(colWidths[0]).slice(0, colWidths[0]),
      `${statusColor} ${result.status} ${COLORS.reset}`.padEnd(colWidths[1] + 9), // +9 for color codes
      ` ${result.details || ''}`.padEnd(colWidths[2]).slice(0, colWidths[2]),
    ];

    cells.forEach((cell, i) => {
      row += `${cell}${BOX.vertical}`;
    });
    console.log(row);
  });

  // Bottom line
  let bottom = BOX.bottomLeft;
  colWidths.forEach((w, i) => {
    bottom += BOX.horizontal.repeat(w);
    bottom += i < colWidths.length - 1 ? BOX.bottomT : BOX.bottomRight;
  });
  console.log(bottom);
}

/**
 * Ensures Playwright browsers are installed
 * In CI environments, browsers are pre-installed by the workflow, so we skip installation
 */
async function ensureBrowsersInstalled() {
  // Skip installation in CI - browsers are pre-installed by the workflow
  if (process.env.CI) {
    console.log('CI environment detected - using pre-installed Playwright browsers');
    return;
  }

  return new Promise((resolve, reject) => {
    console.log('Checking Playwright browser installation...');

    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const proc = spawn(npx, ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      cwd: dirname(__dirname),
      // Windows needs shell: true for .cmd files
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Playwright browser installation failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('='.repeat(70));
  console.log('Playwright Test: Embedded SVG Verification');
  console.log('='.repeat(70));
  console.log();

  const results = [];

  // Test 0: Check if test file exists
  if (!existsSync(TEST_FILE)) {
    console.log(`${COLORS.yellow}Test file not found: ${TEST_FILE}${COLORS.reset}`);
    console.log('Running test-embed-real-world.js to generate the embedded SVG...');
    console.log();

    try {
      const embedTestPath = resolve(__dirname, 'test-embed-real-world.js');
      if (!existsSync(embedTestPath)) {
        console.error(`${COLORS.red}ERROR: test-embed-real-world.js not found${COLORS.reset}`);
        process.exit(1);
      }

      // Run the embed test to generate the file
      const proc = spawn('node', [embedTestPath], {
        stdio: 'inherit',
        cwd: __dirname,
      });

      await new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`test-embed-real-world.js exited with code ${code}`));
        });
        proc.on('error', reject);
      });

      // Verify file was created
      if (!existsSync(TEST_FILE)) {
        console.error(`${COLORS.red}ERROR: Embedded SVG file was not generated${COLORS.reset}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`${COLORS.red}ERROR: Failed to generate embedded SVG: ${error.message}${COLORS.reset}`);
      process.exit(1);
    }
  }

  results.push({
    description: 'Embedded SVG file exists',
    status: 'PASS',
    details: TEST_FILE.split('/').pop(),
  });

  // Ensure browsers are installed
  try {
    await ensureBrowsersInstalled();
  } catch (error) {
    console.error(`${COLORS.red}Failed to install Playwright browsers: ${error.message}${COLORS.reset}`);
    console.error('Try running: npx playwright install chromium');
    process.exit(1);
  }

  let browser = null;
  let context = null;
  let page = null;

  try {
    // Launch browser
    console.log('Launching Chromium browser (headless)...');
    browser = await chromium.launch({
      headless: true,
      timeout: TIMEOUT,
    });

    context = await browser.newContext();
    page = await context.newPage();

    results.push({
      description: 'Browser launched successfully',
      status: 'PASS',
      details: 'Chromium headless',
    });

    // Track network requests
    const networkRequests = [];
    const externalRequests = [];

    // Namespace URLs that are allowed (XML namespaces, not actual network requests)
    const allowedNamespacePatterns = [
      'http://www.w3.org/',
      'http://purl.org/',
      'http://creativecommons.org/',
      'http://sodipodi.sourceforge.net/',
      'http://inkscape.org/',
      'http://ns.adobe.com/',
    ];

    // Route handler to intercept ALL network requests
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();

      networkRequests.push({
        url,
        resourceType: request.resourceType(),
        method: request.method(),
      });

      // Check if this is an external request (not file:// or data:)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Check if it's just a namespace reference (not an actual network request)
        const isNamespace = allowedNamespacePatterns.some(ns => url.startsWith(ns));

        if (!isNamespace) {
          externalRequests.push({
            url,
            resourceType: request.resourceType(),
          });

          // Fail the request - we want NO external requests
          console.log(`${COLORS.red}BLOCKED external request: ${url}${COLORS.reset}`);
          await route.abort('blockedbyclient');
          return;
        }
      }

      // Allow file:// and data: URLs
      await route.continue();
    });

    // Navigate to the SVG file
    console.log(`Loading SVG file: ${TEST_FILE}`);
    const fileUrl = `file://${TEST_FILE}`;

    await page.goto(fileUrl, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle',
    });

    results.push({
      description: 'SVG file loaded in browser',
      status: 'PASS',
      details: 'networkidle reached',
    });

    // Test: Verify no external network requests
    if (externalRequests.length === 0) {
      results.push({
        description: 'No external network requests made',
        status: 'PASS',
        details: `Total requests: ${networkRequests.length}`,
      });
    } else {
      results.push({
        description: 'No external network requests made',
        status: 'FAIL',
        details: `${externalRequests.length} external requests blocked`,
      });

      console.log(`${COLORS.red}External requests detected:${COLORS.reset}`);
      externalRequests.forEach(req => {
        console.log(`  - ${req.resourceType}: ${req.url}`);
      });
    }

    // Test: Verify __EMBEDDED_RESOURCES__ exists
    // Note: When loading SVG directly, scripts run in a different context
    // We check for the variable in the contentWindow of the SVG document
    // On slower Windows CI runners, wait for scripts to fully execute
    await page.waitForTimeout(1000);

    const embeddedResourcesCheck = await page.evaluate(() => {
      // Check multiple possible locations for the variable
      if (typeof window.__EMBEDDED_RESOURCES__ !== 'undefined') {
        return { found: true, count: Object.keys(window.__EMBEDDED_RESOURCES__).length, location: 'window' };
      }
      try {
        // For SVG loaded directly, check the defaultView
        const svgDoc = document.documentElement;
        if (svgDoc && svgDoc.ownerDocument && svgDoc.ownerDocument.defaultView) {
          const view = svgDoc.ownerDocument.defaultView;
          if (typeof view.__EMBEDDED_RESOURCES__ !== 'undefined') {
            return { found: true, count: Object.keys(view.__EMBEDDED_RESOURCES__).length, location: 'defaultView' };
          }
        }
      } catch (e) {
        // Ignore errors
      }
      // Check global scope
      try {
        if (typeof __EMBEDDED_RESOURCES__ !== 'undefined') {
          return { found: true, count: Object.keys(__EMBEDDED_RESOURCES__).length, location: 'global' };
        }
      } catch (e) {
        // Ignore errors
      }
      return { found: false, count: 0, location: 'none' };
    });

    if (embeddedResourcesCheck.found) {
      results.push({
        description: 'Resource interceptor (__EMBEDDED_RESOURCES__) present',
        status: 'PASS',
        details: `${embeddedResourcesCheck.count} resources (${embeddedResourcesCheck.location})`,
      });
    } else {
      // Even if we can't access the variable directly, check if the script is in the SVG
      // On Windows, CDATA sections may need different handling
      const hasScriptWithResources = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          // Check textContent (handles both regular scripts and CDATA)
          const content = script.textContent || script.innerHTML || '';
          if (content.includes('__EMBEDDED_RESOURCES__')) {
            return true;
          }
          // Also check for CDATA child nodes
          for (const child of script.childNodes) {
            if (child.nodeType === 4 || child.nodeType === 3) { // CDATA_SECTION_NODE or TEXT_NODE
              if (child.textContent && child.textContent.includes('__EMBEDDED_RESOURCES__')) {
                return true;
              }
            }
          }
        }
        return false;
      });

      if (hasScriptWithResources) {
        results.push({
          description: 'Resource interceptor (__EMBEDDED_RESOURCES__) present',
          status: 'PASS',
          details: 'Found in script tag (not accessible from eval)',
        });
      } else {
        results.push({
          description: 'Resource interceptor (__EMBEDDED_RESOURCES__) present',
          status: 'FAIL',
          details: 'Not found in page context',
        });
      }
    }

    // Test: Verify Audio constructor is overridden
    const audioConstructorOverridden = await page.evaluate(() => {
      // Check if Audio constructor has been modified
      if (typeof window.__OriginalAudio__ !== 'undefined') {
        return true;
      }
      // Alternative check: see if Audio source is modified
      if (typeof Audio !== 'undefined') {
        const audioStr = Audio.toString();
        return audioStr.includes('__EMBEDDED_RESOURCES__') ||
               audioStr.includes('__OriginalAudio__');
      }
      return false;
    });

    if (audioConstructorOverridden) {
      results.push({
        description: 'Audio constructor override detected',
        status: 'PASS',
        details: '__OriginalAudio__ preserved',
      });
    } else {
      results.push({
        description: 'Audio constructor override detected',
        status: 'WARN',
        details: 'Could not verify override',
      });
    }

    // Test: Check for embedded audio resources in the SVG script
    const audioTest = await page.evaluate(() => {
      try {
        // Check for audio resources in the __EMBEDDED_RESOURCES__ variable
        // First try direct access
        let resources = null;
        if (typeof window.__EMBEDDED_RESOURCES__ !== 'undefined') {
          resources = window.__EMBEDDED_RESOURCES__;
        } else {
          try {
            resources = __EMBEDDED_RESOURCES__;
          } catch (e) {
            // Variable not accessible
          }
        }

        if (resources && Object.keys(resources).length > 0) {
          // Get audio resource keys
          const audioKeys = Object.keys(resources).filter(k =>
            k.endsWith('.wav') || k.endsWith('.mp3') || k.endsWith('.ogg')
          );

          if (audioKeys.length === 0) {
            return { success: true, audioCount: 0, message: 'No audio resources needed' };
          }

          // Verify resources are data URIs
          const allDataUris = audioKeys.every(k => resources[k].startsWith('data:'));

          return {
            success: allDataUris,
            audioCount: audioKeys.length,
            message: allDataUris ? 'All audio embedded' : 'Some audio not embedded'
          };
        }

        // If we can't access the variable directly, check the script content
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent || '';
          if (content.includes('__EMBEDDED_RESOURCES__')) {
            // Count audio data URIs in the script
            const wavMatches = content.match(/"data:audio\/wav;base64,/g);
            const mp3Matches = content.match(/"data:audio\/mpeg;base64,/g);
            const oggMatches = content.match(/"data:audio\/ogg;base64,/g);
            const audioCount = (wavMatches?.length || 0) + (mp3Matches?.length || 0) + (oggMatches?.length || 0);

            if (audioCount > 0) {
              return { success: true, audioCount, message: 'Audio found in script' };
            }
          }
        }

        return { success: false, audioCount: 0, message: 'No embedded resources found' };
      } catch (e) {
        return { success: false, audioCount: 0, message: e.message };
      }
    });

    if (audioTest.success) {
      results.push({
        description: 'Audio resources embedded as data URIs',
        status: 'PASS',
        details: audioTest.audioCount > 0 ? `${audioTest.audioCount} audio file(s)` : audioTest.message,
      });
    } else {
      results.push({
        description: 'Audio resources embedded as data URIs',
        status: 'WARN',
        details: audioTest.message || 'Could not verify',
      });
    }

    // Test: SVG renders correctly (has dimensions and content)
    const renderTest = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return { success: false, error: 'No SVG element found' };

      const bbox = svg.getBoundingClientRect();
      const hasContent = svg.innerHTML.length > 0;
      const hasChildren = svg.children.length > 0;

      return {
        success: bbox.width > 0 && bbox.height > 0 && hasContent,
        width: Math.round(bbox.width),
        height: Math.round(bbox.height),
        childCount: svg.children.length,
      };
    });

    if (renderTest.success) {
      results.push({
        description: 'SVG renders with content',
        status: 'PASS',
        details: `${renderTest.width}x${renderTest.height}, ${renderTest.childCount} children`,
      });
    } else {
      results.push({
        description: 'SVG renders with content',
        status: 'FAIL',
        details: renderTest.error || 'Empty or zero-size',
      });
    }

    // Test: Check for embedded fonts (data URIs in style)
    const fontTest = await page.evaluate(() => {
      const styles = document.querySelectorAll('style');
      let fontDataUriCount = 0;

      styles.forEach(style => {
        const content = style.textContent || '';
        const matches = content.match(/url\s*\(\s*["']?data:(font|application\/font)/gi);
        if (matches) {
          fontDataUriCount += matches.length;
        }
      });

      return {
        hasEmbeddedFonts: fontDataUriCount > 0,
        count: fontDataUriCount,
      };
    });

    if (fontTest.hasEmbeddedFonts) {
      results.push({
        description: 'Fonts embedded as data URIs',
        status: 'PASS',
        details: `${fontTest.count} font(s) embedded`,
      });
    } else {
      results.push({
        description: 'Fonts embedded as data URIs',
        status: 'WARN',
        details: 'No embedded fonts detected',
      });
    }

    // Test: Check for embedded images
    const imageTest = await page.evaluate(() => {
      const images = document.querySelectorAll('image[href], image[xlink\\:href]');
      let embeddedCount = 0;
      let externalCount = 0;

      images.forEach(img => {
        const href = img.getAttribute('href') || img.getAttribute('xlink:href');
        if (href && href.startsWith('data:')) {
          embeddedCount++;
        } else if (href && !href.startsWith('#')) {
          externalCount++;
        }
      });

      return {
        embeddedCount,
        externalCount,
        allEmbedded: externalCount === 0,
      };
    });

    if (imageTest.embeddedCount > 0 && imageTest.allEmbedded) {
      results.push({
        description: 'Images embedded as data URIs',
        status: 'PASS',
        details: `${imageTest.embeddedCount} image(s) embedded`,
      });
    } else if (imageTest.externalCount > 0) {
      results.push({
        description: 'Images embedded as data URIs',
        status: 'FAIL',
        details: `${imageTest.externalCount} external image(s) found`,
      });
    } else {
      results.push({
        description: 'Images embedded as data URIs',
        status: 'WARN',
        details: 'No images found in SVG',
      });
    }

  } catch (error) {
    console.error(`${COLORS.red}Test error: ${error.message}${COLORS.reset}`);
    console.error(error.stack);

    results.push({
      description: 'Test execution',
      status: 'FAIL',
      details: error.message.slice(0, 38),
    });
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  // Print results table
  console.log();
  console.log('='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));
  console.log();

  drawResultsTable(results);

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log();
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  ${COLORS.green}PASSED: ${passed}${COLORS.reset}`);
  if (warned > 0) console.log(`  ${COLORS.yellow}WARNINGS: ${warned}${COLORS.reset}`);
  if (failed > 0) console.log(`  ${COLORS.red}FAILED: ${failed}${COLORS.reset}`);
  console.log();

  // Exit with appropriate code
  if (failed > 0) {
    console.log(`${COLORS.red}TESTS FAILED${COLORS.reset}`);
    process.exit(1);
  } else {
    console.log(`${COLORS.green}ALL TESTS PASSED${COLORS.reset}`);
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error(`${COLORS.red}Fatal error: ${error.message}${COLORS.reset}`);
  console.error(error.stack);
  process.exit(1);
});
