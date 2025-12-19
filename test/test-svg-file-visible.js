/**
 * SVG File Protocol Visible Browser Test
 *
 * Opens the SVG file directly via file:// protocol in VISIBLE Chrome
 * to capture the exact same errors a user sees when opening the file.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function testFileVisible(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG File Protocol - VISIBLE Browser Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  // Convert to file:// URL
  const fileUrl = `file://${svgPath}`;
  console.log(`File URL: ${fileUrl}`);

  // Check headless mode
  const headless = process.env.HEADLESS !== 'false';
  console.log(`\nMode: ${headless ? 'Headless' : 'VISIBLE (non-headless)'}`);

  // Launch browser
  const browser = await chromium.launch({
    headless: headless,
    args: [
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-logging=stderr',
      '--v=1',
      '--log-level=0',
    ],
  });

  const context = await browser.newContext({
    bypassCSP: true,
  });

  const page = await context.newPage();
  const allMessages = [];

  // Setup CDP session BEFORE navigation
  const client = await page.context().newCDPSession(page);

  // Enable all logging domains
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Runtime.enable');

  try {
    await client.send('Audits.enable');
    console.log('[CDP] Audits domain enabled');
  } catch (e) {
    console.log('[CDP] Audits domain not available');
  }

  // Capture ALL types of messages
  client.on('Log.entryAdded', (params) => {
    const entry = params.entry;
    const msg = {
      type: 'CDP_Log',
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      line: entry.lineNumber,
    };
    allMessages.push(msg);
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

  client.on('Audits.issueAdded', (params) => {
    const issue = params.issue;
    allMessages.push({
      type: 'CDP_Audit',
      code: issue.code,
      details: JSON.stringify(issue.details),
    });
    console.log(`[AUDIT] ${issue.code}`);
  });

  page.on('console', msg => {
    if (!allMessages.some(m => m.text === msg.text())) {
      allMessages.push({
        type: 'PW_Console',
        level: msg.type(),
        text: msg.text(),
      });
      console.log(`[PW_${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    allMessages.push({ type: 'PW_PageError', text: error.message });
    console.log(`[PAGE_ERROR] ${error.message}`);
  });

  console.log('\n--- Loading SVG via file:// protocol ---');

  try {
    await page.goto(fileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Give time for all warnings to appear
    console.log('\n--- Waiting for console messages (15 seconds) ---');
    await page.waitForTimeout(15000);

    // Check SVG info
    const svgInfo = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return { error: 'No SVG found' };

      return {
        elementCount: svg.querySelectorAll('*').length,
        animateCount: svg.querySelectorAll('animate, animateTransform').length,
        useCount: svg.querySelectorAll('use').length,
        audioCount: svg.querySelectorAll('audio').length,
        foreignObjectCount: svg.querySelectorAll('foreignObject').length,
      };
    });

    console.log('\nSVG Info:', JSON.stringify(svgInfo, null, 2));

  } catch (e) {
    console.log(`[ERROR] ${e.message}`);
    allMessages.push({ type: 'NavigationError', text: e.message });
  }

  // If visible, wait longer
  if (!headless) {
    console.log('\n>>> Browser is visible. Waiting 30 seconds for you to inspect...');
    console.log('>>> Open DevTools (F12) and check the Console tab.');
    await page.waitForTimeout(30000);
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('CAPTURED MESSAGES');
  console.log('='.repeat(70));

  if (allMessages.length === 0) {
    console.log('No messages captured!');
    console.log('\nIf you see errors in the real Chrome DevTools that are not');
    console.log('appearing here, please note the exact error text so we can');
    console.log('search for the cause in the SVG source file.');
  } else {
    for (const msg of allMessages) {
      console.log(`[${msg.type}] ${msg.text || msg.code}`);
    }
  }

  return allMessages;
}

testFileVisible(SVG_PATH)
  .then(msgs => {
    const errors = msgs.filter(m => m.level === 'error' || m.type.includes('Error') || m.type.includes('Exception'));
    console.log(`\nTotal: ${msgs.length} messages, ${errors.length} errors`);
    process.exit(errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
