/**
 * Browser Validation Test using Playwright
 *
 * Loads SVG files in a real browser and captures all console errors,
 * warnings, and other browser messages to detect validation issues
 * that are invisible to static parsers.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function validateSVGInBrowser(svgPath) {
  console.log('='.repeat(70));
  console.log('Browser SVG Validation Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  // Read SVG file
  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Launch browser
  console.log('\nLaunching headless Chrome...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--allow-file-access-from-files']
  });

  const context = await browser.newContext({
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Collect all browser messages
  const consoleMessages = [];
  const errors = [];
  const warnings = [];
  const pageErrors = [];
  const requestFailures = [];

  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();

    const entry = {
      type,
      text,
      url: location.url,
      line: location.lineNumber,
      column: location.columnNumber,
    };

    consoleMessages.push(entry);

    if (type === 'error') {
      errors.push(entry);
    } else if (type === 'warning') {
      warnings.push(entry);
    }
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  });

  // Capture request failures
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText,
      resourceType: request.resourceType(),
    });
  });

  // Create HTML wrapper to load SVG
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SVG Validation Test</title>
  <style>
    body { margin: 0; padding: 20px; background: #f0f0f0; }
    #svg-container { background: white; padding: 10px; border: 1px solid #ccc; }
    .error { color: red; font-family: monospace; margin: 10px 0; }
  </style>
</head>
<body>
  <h2>SVG Browser Validation Test</h2>
  <div id="svg-container">
    ${svgContent}
  </div>
  <script>
    // Report any errors that occur
    window.onerror = function(msg, url, lineNo, columnNo, error) {
      console.error('JS Error:', msg, 'at', url, ':', lineNo);
      return false;
    };

    // Check for SVG-specific issues
    document.addEventListener('DOMContentLoaded', function() {
      const svg = document.querySelector('svg');
      if (!svg) {
        console.error('SVG_VALIDATION: No SVG element found');
        return;
      }

      console.log('SVG_VALIDATION: SVG element found');
      console.log('SVG_VALIDATION: viewBox =', svg.getAttribute('viewBox'));
      console.log('SVG_VALIDATION: width =', svg.getAttribute('width'));
      console.log('SVG_VALIDATION: height =', svg.getAttribute('height'));

      // Check foreignObject elements
      const foreignObjects = svg.querySelectorAll('foreignObject');
      console.log('SVG_VALIDATION: foreignObject count =', foreignObjects.length);
      foreignObjects.forEach((fo, i) => {
        const width = fo.getAttribute('width');
        const height = fo.getAttribute('height');
        console.log('SVG_VALIDATION: foreignObject[' + i + '] width=' + width + ' height=' + height);
        if (!width || !height) {
          console.error('SVG_VALIDATION: foreignObject[' + i + '] missing required width/height');
        }
      });

      // Check audio elements
      const audioElements = svg.querySelectorAll('audio');
      console.log('SVG_VALIDATION: audio element count =', audioElements.length);
      audioElements.forEach((audio, i) => {
        console.log('SVG_VALIDATION: audio[' + i + '] id=' + audio.id);
        console.log('SVG_VALIDATION: audio[' + i + '] src=' + (audio.src || 'none'));

        // Check source elements
        const sources = audio.querySelectorAll('source');
        sources.forEach((source, j) => {
          const src = source.getAttribute('src');
          const type = source.getAttribute('type');
          console.log('SVG_VALIDATION: audio[' + i + '].source[' + j + '] type=' + type);
          if (src && src.startsWith('data:')) {
            console.log('SVG_VALIDATION: audio[' + i + '].source[' + j + '] has embedded data URI');
          } else {
            console.log('SVG_VALIDATION: audio[' + i + '].source[' + j + '] src=' + src);
          }
        });

        // Try to check if audio can be played
        audio.onerror = function(e) {
          console.error('SVG_VALIDATION: audio[' + i + '] error:', e.message || 'unknown error');
        };
      });

      // Check for broken references
      const elementsWithUrl = svg.querySelectorAll('[fill^="url("], [stroke^="url("], [clip-path^="url("], [mask^="url("], [filter^="url("]');
      console.log('SVG_VALIDATION: elements with url() references =', elementsWithUrl.length);

      // Check use elements
      const useElements = svg.querySelectorAll('use');
      console.log('SVG_VALIDATION: use element count =', useElements.length);
      useElements.forEach((use, i) => {
        const href = use.getAttribute('href') || use.getAttribute('xlink:href');
        if (href && href.startsWith('#')) {
          const targetId = href.substring(1);
          const target = document.getElementById(targetId);
          if (!target) {
            console.error('SVG_VALIDATION: use[' + i + '] broken reference to #' + targetId);
          }
        }
      });

      // Signal completion
      console.log('SVG_VALIDATION: Validation complete');
    });
  </script>
</body>
</html>
`;

  // Load the HTML content
  console.log('Loading SVG in browser...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  // Wait a moment for any async errors to appear
  await page.waitForTimeout(2000);

  // Close browser
  await browser.close();

  // Report results
  console.log('\n' + '='.repeat(70));
  console.log('BROWSER VALIDATION RESULTS');
  console.log('='.repeat(70));

  console.log('\n--- Console Errors (' + errors.length + ') ---');
  if (errors.length === 0) {
    console.log('  (none)');
  } else {
    for (const err of errors) {
      console.log(`  ERROR: ${err.text}`);
      if (err.url) console.log(`         at ${err.url}:${err.line}:${err.column}`);
    }
  }

  console.log('\n--- Console Warnings (' + warnings.length + ') ---');
  if (warnings.length === 0) {
    console.log('  (none)');
  } else {
    for (const warn of warnings) {
      console.log(`  WARNING: ${warn.text}`);
    }
  }

  console.log('\n--- Page Errors (' + pageErrors.length + ') ---');
  if (pageErrors.length === 0) {
    console.log('  (none)');
  } else {
    for (const err of pageErrors) {
      console.log(`  PAGE ERROR: ${err.message}`);
      if (err.stack) console.log(`  Stack: ${err.stack.split('\n')[0]}`);
    }
  }

  console.log('\n--- Request Failures (' + requestFailures.length + ') ---');
  if (requestFailures.length === 0) {
    console.log('  (none)');
  } else {
    for (const fail of requestFailures) {
      console.log(`  FAILED: ${fail.resourceType} - ${fail.url}`);
      console.log(`          ${fail.failure}`);
    }
  }

  console.log('\n--- All Console Messages ---');
  for (const msg of consoleMessages) {
    const prefix = msg.type === 'error' ? '  [ERROR]' :
                   msg.type === 'warning' ? '  [WARN]' :
                   msg.type === 'log' ? '  [LOG]' : `  [${msg.type.toUpperCase()}]`;
    console.log(`${prefix} ${msg.text}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total errors: ${errors.length}`);
  console.log(`Total warnings: ${warnings.length}`);
  console.log(`Page errors: ${pageErrors.length}`);
  console.log(`Request failures: ${requestFailures.length}`);

  const hasIssues = errors.length > 0 || pageErrors.length > 0;
  console.log(`\nValidation: ${hasIssues ? 'ISSUES FOUND' : 'PASSED'}`);

  return {
    errors,
    warnings,
    pageErrors,
    requestFailures,
    allMessages: consoleMessages,
    hasIssues,
  };
}

// Run the test
validateSVGInBrowser(SVG_PATH)
  .then(result => {
    process.exit(result.hasIssues ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed with exception:', err);
    process.exit(1);
  });
