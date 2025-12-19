/**
 * Direct SVG Load Test using Playwright
 *
 * Loads the SVG file directly in the browser (not embedded in HTML)
 * to capture native browser validation errors.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function validateSVGDirectLoad(svgPath) {
  console.log('='.repeat(70));
  console.log('Direct SVG Load Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Create a simple HTTP server to serve the SVG file
  const server = http.createServer((req, res) => {
    if (req.url === '/test.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svgContent);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const svgUrl = `http://127.0.0.1:${port}/test.svg`;

  console.log(`\nServing SVG at: ${svgUrl}`);

  console.log('Launching Chrome...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security',
    ]
  });

  const context = await browser.newContext({
    bypassCSP: true,
  });

  const page = await context.newPage();

  const allMessages = [];
  const errors = [];
  const warnings = [];

  // Capture ALL console messages
  page.on('console', msg => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      args: msg.args().map(a => a.toString()),
      location: msg.location(),
    };
    allMessages.push(entry);
    if (msg.type() === 'error') errors.push(entry);
    if (msg.type() === 'warning') warnings.push(entry);
  });

  page.on('pageerror', error => {
    errors.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack,
    });
  });

  // Monitor network requests for any failures
  page.on('requestfailed', req => {
    console.log(`Request failed: ${req.url()} - ${req.failure()?.errorText}`);
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`HTTP Error: ${response.status()} for ${response.url()}`);
    }
  });

  console.log('Loading SVG directly in browser...');
  try {
    await page.goto(svgUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }

  // Wait for any delayed errors
  await page.waitForTimeout(3000);

  // Try to interact with the SVG
  console.log('\nChecking SVG structure in browser...');
  const svgInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    if (!svg) return { error: 'No SVG element found' };

    const info = {
      tagName: svg.tagName,
      viewBox: svg.getAttribute('viewBox'),
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      childCount: svg.children.length,
      defsCount: svg.querySelectorAll('defs').length,
      useCount: svg.querySelectorAll('use').length,
      audioCount: svg.querySelectorAll('audio').length,
      scriptCount: svg.querySelectorAll('script').length,
      foreignObjectCount: svg.querySelectorAll('foreignObject').length,
      errors: [],
    };

    // Check scripts
    const scripts = svg.querySelectorAll('script');
    scripts.forEach((script, i) => {
      try {
        // Check if script has content
        const content = script.textContent;
        info[`script${i}Length`] = content ? content.length : 0;
      } catch (e) {
        info.errors.push(`Script ${i} error: ${e.message}`);
      }
    });

    // Check for any error elements or markers
    const errorElements = svg.querySelectorAll('[*|error], .error, #error');
    if (errorElements.length > 0) {
      info.errorElementCount = errorElements.length;
    }

    return info;
  });

  console.log('SVG Info:', JSON.stringify(svgInfo, null, 2));

  // Now try with an HTML wrapper that shows more errors
  console.log('\n--- Testing with HTML wrapper ---');
  const htmlUrl = `http://127.0.0.1:${port}/`;
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>SVG Test</title>
</head>
<body>
  <h1>SVG Direct Load Test</h1>
  <object id="svgObject" data="/test.svg" type="image/svg+xml" width="800" height="450"></object>
  <embed id="svgEmbed" src="/test.svg" type="image/svg+xml" width="800" height="450">
  <iframe id="svgFrame" src="/test.svg" width="800" height="450"></iframe>
  <img id="svgImg" src="/test.svg" width="800" height="450" onerror="console.error('IMG_ERROR: Failed to load SVG as image')">
  <script>
    // Check object load
    document.getElementById('svgObject').addEventListener('load', () => console.log('Object loaded'));
    document.getElementById('svgObject').addEventListener('error', (e) => console.error('OBJECT_ERROR:', e));

    // Check embed load
    document.getElementById('svgEmbed').addEventListener('load', () => console.log('Embed loaded'));
    document.getElementById('svgEmbed').addEventListener('error', (e) => console.error('EMBED_ERROR:', e));

    // Check iframe load
    document.getElementById('svgFrame').addEventListener('load', () => {
      console.log('IFrame loaded');
      try {
        const iframeDoc = document.getElementById('svgFrame').contentDocument;
        if (iframeDoc) {
          const svg = iframeDoc.querySelector('svg');
          if (svg) {
            console.log('IFrame SVG found, children:', svg.children.length);
          }
        }
      } catch (e) {
        console.error('IFrame access error:', e.message);
      }
    });
    document.getElementById('svgFrame').addEventListener('error', (e) => console.error('IFRAME_ERROR:', e));
  </script>
</body>
</html>
      `);
    } else if (req.url === '/test.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svgContent);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const page2 = await context.newPage();
  page2.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    allMessages.push(entry);
    if (msg.type() === 'error') errors.push(entry);
    if (msg.type() === 'warning') warnings.push(entry);
  });
  page2.on('pageerror', error => {
    errors.push({ type: 'pageerror', text: error.message });
  });

  await page2.goto(htmlUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page2.waitForTimeout(5000);

  await browser.close();
  server.close();

  console.log('\n' + '='.repeat(70));
  console.log('ALL CONSOLE MESSAGES');
  console.log('='.repeat(70));
  for (const msg of allMessages) {
    const prefix = msg.type === 'error' ? '[ERROR]' :
                   msg.type === 'warning' ? '[WARN]' : '[LOG]';
    console.log(`${prefix} ${msg.text}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('ERRORS SUMMARY');
  console.log('='.repeat(70));
  if (errors.length === 0) {
    console.log('No errors detected');
  } else {
    for (const err of errors) {
      console.log(`ERROR: ${err.text}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('WARNINGS SUMMARY');
  console.log('='.repeat(70));
  if (warnings.length === 0) {
    console.log('No warnings detected');
  } else {
    for (const warn of warnings) {
      console.log(`WARNING: ${warn.text}`);
    }
  }

  return { errors, warnings, allMessages };
}

validateSVGDirectLoad(SVG_PATH)
  .then(result => {
    console.log(`\nTotal errors: ${result.errors.length}, warnings: ${result.warnings.length}`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
