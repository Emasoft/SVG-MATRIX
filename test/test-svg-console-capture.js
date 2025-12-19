/**
 * Complete Console Capture Test
 *
 * Loads the SVG directly in Chrome and captures EVERY console message,
 * including Chrome DevTools warnings that might not appear in normal tests.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function captureAllConsoleMessages(svgPath) {
  console.log('='.repeat(70));
  console.log('Complete Console Capture Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (req.url === '/test.svg') {
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      });
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

  // Launch Chrome with verbose logging
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-logging=stderr',
      '--v=1',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const allMessages = [];
  const errors = [];
  const warnings = [];

  // Capture ALL console message types
  page.on('console', msg => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      args: [],
    };

    // Try to get argument values
    for (const arg of msg.args()) {
      try {
        entry.args.push(arg.toString());
      } catch {
        entry.args.push('[unreadable]');
      }
    }

    allMessages.push(entry);

    // Categorize
    if (msg.type() === 'error') errors.push(entry);
    if (msg.type() === 'warning') warnings.push(entry);

    // Log immediately
    const prefix = msg.type() === 'error' ? '\x1b[31m[ERROR]\x1b[0m' :
                   msg.type() === 'warning' ? '\x1b[33m[WARN]\x1b[0m' :
                   msg.type() === 'info' ? '\x1b[36m[INFO]\x1b[0m' :
                   `[${msg.type().toUpperCase()}]`;
    console.log(`  ${prefix} ${msg.text()}`);
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', error => {
    console.log(`  \x1b[31m[PAGE_ERROR]\x1b[0m ${error.message}`);
    errors.push({ type: 'pageerror', text: error.message, stack: error.stack });
  });

  // Capture request failures
  page.on('requestfailed', req => {
    console.log(`  \x1b[31m[REQ_FAIL]\x1b[0m ${req.url()} - ${req.failure()?.errorText}`);
    errors.push({ type: 'requestfailed', text: `${req.url()} - ${req.failure()?.errorText}` });
  });

  // Capture response status
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`  \x1b[31m[HTTP ${response.status()}]\x1b[0m ${response.url()}`);
    }
  });

  console.log('\n--- Loading SVG directly in browser ---');
  console.log('Console output (real-time):');

  try {
    // Load the SVG directly
    await page.goto(svgUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for any additional processing
    await page.waitForTimeout(3000);

    // Also try to get any internal browser errors via CDP
    const client = await page.context().newCDPSession(page);

    // Enable log domain to capture additional messages
    await client.send('Log.enable');

    client.on('Log.entryAdded', (entry) => {
      console.log(`  \x1b[35m[CDP_LOG]\x1b[0m ${entry.entry.text}`);
      allMessages.push({ type: 'cdp_log', text: entry.entry.text, level: entry.entry.level });
    });

    // Wait a bit more for any late messages
    await page.waitForTimeout(2000);

    // Check if the page shows any error messages in the DOM
    const pageText = await page.evaluate(() => document.body?.innerText || document.documentElement?.innerText || '');
    if (pageText.includes('error') || pageText.includes('Error') || pageText.includes('invalid')) {
      console.log(`\n  \x1b[33m[PAGE_CONTENT]\x1b[0m Page contains error text:`);
      console.log(`    ${pageText.substring(0, 500)}`);
    }

  } catch (e) {
    console.log(`  \x1b[31m[NAV_ERROR]\x1b[0m ${e.message}`);
    errors.push({ type: 'navigation', text: e.message });
  }

  await browser.close();
  server.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('CAPTURE SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total messages: ${allMessages.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n--- All Errors ---');
    for (const err of errors) {
      console.log(`  ${err.type}: ${err.text}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\n--- All Warnings ---');
    for (const warn of warnings) {
      console.log(`  ${warn.type}: ${warn.text}`);
    }
  }

  console.log('\n' + '='.repeat(70));

  return { errors, warnings, allMessages };
}

captureAllConsoleMessages(SVG_PATH)
  .then(result => {
    console.log(`\nExit: errors=${result.errors.length}, warnings=${result.warnings.length}`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
