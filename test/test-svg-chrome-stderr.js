/**
 * SVG Chrome Stderr Capture Test
 *
 * Launches Chrome with extensive logging to stderr to capture
 * browser-internal messages that may not be exposed via CDP.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function testChromeStderr(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG Chrome Stderr Capture Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const fileUrl = `file://${svgPath}`;
  const headless = process.env.HEADLESS !== 'false';

  // Find Chrome executable
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  // Check if Chrome exists
  try {
    await fs.access(chromePath);
    console.log(`Chrome found at: ${chromePath}`);
  } catch {
    console.log('Chrome not found at expected path, using Playwright Chromium');
    // Fall back to Playwright
    return testWithPlaywright(svgPath, fileUrl, headless);
  }

  // Launch Chrome with full logging
  const chromeArgs = [
    '--enable-logging=stderr',
    '--v=1',
    '--log-level=0',
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-extensions',
    headless ? '--headless=new' : '',
    fileUrl,
  ].filter(Boolean);

  console.log('\nLaunching Chrome with stderr logging...');
  console.log(`Args: ${chromeArgs.join(' ').substring(0, 200)}...`);

  const stderrLines = [];
  const chrome = spawn(chromePath, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  chrome.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        stderrLines.push(line);
        // Log lines that look like warnings or errors
        if (line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('warning') ||
            line.toLowerCase().includes('invalid') ||
            line.includes('SVG') ||
            line.includes('svg')) {
          console.log(`[STDERR] ${line}`);
        }
      }
    }
  });

  chrome.stdout.on('data', (data) => {
    console.log(`[STDOUT] ${data.toString()}`);
  });

  // Wait for page to load
  console.log('\n--- Waiting 20 seconds for page load and messages ---');
  await new Promise(resolve => setTimeout(resolve, 20000));

  // Kill Chrome
  chrome.kill('SIGTERM');

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('STDERR ANALYSIS');
  console.log('='.repeat(70));

  // Filter for interesting lines
  const svgRelated = stderrLines.filter(l =>
    l.toLowerCase().includes('svg') ||
    l.toLowerCase().includes('error') ||
    l.toLowerCase().includes('warning') ||
    l.toLowerCase().includes('invalid') ||
    l.toLowerCase().includes('duplicate')
  );

  if (svgRelated.length > 0) {
    console.log(`\nFound ${svgRelated.length} potentially relevant lines:`);
    for (const line of svgRelated.slice(0, 50)) {
      console.log(`  ${line.substring(0, 200)}`);
    }
  } else {
    console.log('No SVG-related or error messages found in stderr');
    console.log(`Total stderr lines: ${stderrLines.length}`);
  }

  return { stderrLines, svgRelated };
}

async function testWithPlaywright(svgPath, fileUrl, headless) {
  console.log('\nFalling back to Playwright Chromium...');

  const browser = await chromium.launch({
    headless: headless,
    args: [
      '--enable-logging=stderr',
      '--v=1',
      '--log-level=0',
      '--allow-file-access-from-files',
      '--disable-web-security',
    ],
  });

  const page = await browser.newPage();
  const messages = [];

  page.on('console', msg => {
    messages.push({ type: msg.type(), text: msg.text() });
    console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  await browser.close();

  return { messages };
}

testChromeStderr(SVG_PATH)
  .then(result => {
    console.log('\nTest complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
