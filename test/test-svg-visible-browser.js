/**
 * SVG Visible Browser Test
 *
 * Opens the SVG in a VISIBLE (non-headless) Chrome browser
 * and captures all console messages including verbose ones.
 *
 * This test attempts to replicate what the user sees when they
 * open the SVG file directly in Chrome.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function testVisibleBrowser(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG Visible Browser Test (Non-Headless)');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Check if we should run headless or visible
  const headless = process.env.HEADLESS !== 'false';
  console.log(`Running in ${headless ? 'headless' : 'VISIBLE'} mode`);
  console.log('(Set HEADLESS=false to see the browser window)');

  // Create HTTP server
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

  // Launch browser with all possible logging enabled
  const browser = await chromium.launch({
    headless: headless,
    args: [
      '--enable-logging=stderr',
      '--v=1',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-logging',
      '--log-level=0',  // Verbose
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const allMessages = [];

  // Set up CDP session BEFORE navigation
  const client = await page.context().newCDPSession(page);

  // Enable ALL CDP domains that might capture messages
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  // Also enable Performance domain to catch timing issues
  try {
    await client.send('Performance.enable');
  } catch (e) {
    // Might not be available
  }

  // Capture ALL log entry types
  client.on('Log.entryAdded', (params) => {
    const entry = params.entry;
    const msg = {
      type: 'CDP_Log',
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      line: entry.lineNumber,
      timestamp: entry.timestamp,
    };
    allMessages.push(msg);
    console.log(`[${entry.level.toUpperCase()}] (${entry.source}) ${entry.text}`);
    if (entry.url) {
      console.log(`  at ${entry.url}:${entry.lineNumber || 0}`);
    }
  });

  // Capture console API calls
  client.on('Runtime.consoleAPICalled', (params) => {
    const args = params.args.map(a => {
      if (a.value !== undefined) return String(a.value);
      if (a.description) return a.description;
      if (a.preview) return JSON.stringify(a.preview);
      return '[object]';
    }).join(' ');

    const msg = {
      type: 'CDP_Console',
      level: params.type,
      text: args,
      stackTrace: params.stackTrace,
    };
    allMessages.push(msg);
    console.log(`[CONSOLE.${params.type}] ${args}`);
  });

  // Capture exceptions
  client.on('Runtime.exceptionThrown', (params) => {
    const ex = params.exceptionDetails;
    const msg = {
      type: 'CDP_Exception',
      text: ex.text,
      description: ex.exception?.description,
      stackTrace: ex.stackTrace,
    };
    allMessages.push(msg);
    console.log(`[EXCEPTION] ${ex.text}`);
    if (ex.exception?.description) {
      console.log(`  ${ex.exception.description}`);
    }
  });

  // Standard Playwright handlers
  page.on('console', msg => {
    const entry = {
      type: 'Playwright_Console',
      level: msg.type(),
      text: msg.text(),
      location: msg.location(),
    };
    // Only log if not already captured by CDP
    if (!allMessages.some(m => m.text === msg.text())) {
      allMessages.push(entry);
      console.log(`[PW_${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    const entry = {
      type: 'Playwright_PageError',
      text: error.message,
      stack: error.stack,
    };
    allMessages.push(entry);
    console.log(`[PAGE_ERROR] ${error.message}`);
  });

  // Network errors
  page.on('requestfailed', req => {
    console.log(`[REQUEST_FAILED] ${req.url()} - ${req.failure()?.errorText}`);
    allMessages.push({
      type: 'RequestFailed',
      url: req.url(),
      error: req.failure()?.errorText,
    });
  });

  console.log('\n--- LOADING SVG ---');
  console.log('Watching for console messages...\n');

  try {
    await page.goto(svgUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  } catch (e) {
    console.log(`[NAVIGATION_ERROR] ${e.message}`);
  }

  // Wait for any delayed messages
  console.log('\n--- Waiting for delayed messages (10 seconds) ---');
  await page.waitForTimeout(10000);

  // If visible, wait for user to close or press Enter
  if (!headless) {
    console.log('\n>>> Browser is visible. Press Ctrl+C to close or wait 30 seconds...');
    await page.waitForTimeout(30000);
  }

  await browser.close();
  server.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('ALL CAPTURED MESSAGES');
  console.log('='.repeat(70));

  if (allMessages.length === 0) {
    console.log('NO MESSAGES CAPTURED');
    console.log('\nPossible reasons:');
    console.log('1. The error only appears in the real Chrome DevTools console');
    console.log('2. The error is at "verbose" level which CDP does not capture by default');
    console.log('3. The error is shown by a Chrome extension');
    console.log('4. The error appears when loading via file:// protocol only');
  } else {
    for (const msg of allMessages) {
      console.log(`[${msg.type}/${msg.level || 'N/A'}] ${msg.text || msg.error || 'no text'}`);
    }
  }

  // Group by type/level
  const grouped = {};
  for (const msg of allMessages) {
    const key = `${msg.type}/${msg.level || 'N/A'}`;
    grouped[key] = (grouped[key] || 0) + 1;
  }

  console.log('\n--- Message Summary ---');
  for (const [key, count] of Object.entries(grouped)) {
    console.log(`  ${key}: ${count}`);
  }

  const errors = allMessages.filter(m =>
    m.level === 'error' ||
    m.type === 'CDP_Exception' ||
    m.type === 'Playwright_PageError'
  );

  console.log(`\nTotal: ${allMessages.length} messages, ${errors.length} errors`);

  return { allMessages, errors };
}

testVisibleBrowser(SVG_PATH)
  .then(result => {
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
