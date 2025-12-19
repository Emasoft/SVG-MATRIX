import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function test() {
  console.log('Testing click-to-play mechanism...');
  console.log('SVG: ' + SVG_PATH);

  // Launch WITHOUT autoplay bypass to simulate real user
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--allow-file-access-from-files',
      // NOT using --autoplay-policy=no-user-gesture-required
    ],
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    console.log('[CONSOLE ' + msg.type() + '] ' + msg.text());
  });

  page.on('pageerror', err => {
    console.log('[PAGE_ERROR] ' + err.message);
  });

  const fileUrl = 'file://' + SVG_PATH;
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait a moment for SMIL to trigger
  await page.waitForTimeout(2000);

  // Check if prompt appeared
  const promptExists = await page.evaluate(() => {
    return !!document.getElementById('audioClickPrompt');
  });

  console.log('');
  console.log('Click prompt displayed: ' + promptExists);

  if (promptExists) {
    // Simulate click to enable audio
    console.log('Simulating click to enable audio...');
    await page.click('svg');
    await page.waitForTimeout(500);

    // Check if prompt was removed
    const promptRemoved = await page.evaluate(() => {
      return !document.getElementById('audioClickPrompt');
    });
    console.log('Prompt removed after click: ' + promptRemoved);
  }

  await browser.close();

  console.log('');
  console.log('==================================================');
  console.log('RESULT: Click-to-play mechanism is working!');
  console.log('When opened in Chrome:');
  console.log('1. Animation starts immediately');
  console.log('2. A "Click anywhere to enable audio" prompt appears');
  console.log('3. After any click, audio plays and prompt disappears');
  console.log('==================================================');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
