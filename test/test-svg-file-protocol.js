/**
 * SVG File Protocol Test
 *
 * Loads the SVG file directly from the filesystem (file:// protocol)
 * just like when a user opens the file in their browser.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function testFileProtocol(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG File Protocol Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  // Convert to file:// URL
  const fileUrl = `file://${svgPath}`;
  console.log(`File URL: ${fileUrl}`);

  // Launch browser with file access enabled
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-logging',
      '--log-level=0',
    ],
  });

  const context = await browser.newContext({
    bypassCSP: true,
  });

  const page = await context.newPage();
  const allMessages = [];

  // CDP session for comprehensive logging
  const client = await page.context().newCDPSession(page);
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Runtime.enable');

  // Also try to capture all message types
  client.on('Log.entryAdded', (params) => {
    const entry = params.entry;
    allMessages.push({
      type: 'CDP_Log',
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      line: entry.lineNumber,
    });
    console.log(`[${entry.level.toUpperCase()}] (${entry.source}) ${entry.text}`);
  });

  client.on('Runtime.consoleAPICalled', (params) => {
    const args = params.args.map(a => a.value || a.description || '[object]').join(' ');
    allMessages.push({
      type: 'CDP_Console',
      level: params.type,
      text: args,
    });
    console.log(`[CONSOLE.${params.type}] ${args}`);
  });

  client.on('Runtime.exceptionThrown', (params) => {
    const ex = params.exceptionDetails;
    allMessages.push({
      type: 'CDP_Exception',
      text: ex.text,
      description: ex.exception?.description,
    });
    console.log(`[EXCEPTION] ${ex.text}`);
  });

  page.on('console', msg => {
    console.log(`[PW ${msg.type()}] ${msg.text()}`);
    allMessages.push({ type: 'pw_console', level: msg.type(), text: msg.text() });
  });

  page.on('pageerror', error => {
    console.log(`[PAGE_ERROR] ${error.message}`);
    allMessages.push({ type: 'pageerror', text: error.message });
  });

  console.log('\n--- Loading SVG via file:// protocol ---');

  try {
    await page.goto(fileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for content to render
    await page.waitForTimeout(5000);

    // Check if there are any visible errors in the document
    const pageContent = await page.content();
    if (pageContent.includes('XML Parsing Error') || pageContent.includes('error')) {
      console.log('\n[DETECTED] Page might contain error message');
    }

    // Try to evaluate some code to check for errors
    const result = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return { error: 'No SVG element found' };

      return {
        svgExists: true,
        elementCount: svg.querySelectorAll('*').length,
        animateCount: svg.querySelectorAll('animate, animateTransform').length,
        useCount: svg.querySelectorAll('use').length,
        audioCount: svg.querySelectorAll('audio').length,
      };
    });

    console.log('\nSVG DOM Info:', JSON.stringify(result, null, 2));

  } catch (e) {
    console.log(`[ERROR] ${e.message}`);
    allMessages.push({ type: 'error', text: e.message });
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('MESSAGES CAPTURED');
  console.log('='.repeat(70));

  if (allMessages.length === 0) {
    console.log('No messages captured via Playwright/CDP');
    console.log('\nNote: Some browser console warnings (like duplicate ID warnings)');
    console.log('may only appear in the actual Chrome DevTools console and are not');
    console.log('exposed via the Chrome DevTools Protocol used by Playwright.');
  } else {
    for (const msg of allMessages) {
      console.log(`[${msg.type}] ${msg.text}`);
    }
  }

  const errors = allMessages.filter(m =>
    m.level === 'error' || m.type === 'pageerror' || m.type === 'CDP_Exception'
  );

  return { allMessages, errors };
}

testFileProtocol(SVG_PATH)
  .then(result => {
    console.log(`\nTotal: ${result.allMessages.length} messages, ${result.errors.length} errors`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
