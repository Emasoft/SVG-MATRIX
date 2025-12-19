/**
 * SVG DevTools Test
 *
 * Opens the SVG file with Chrome DevTools to capture ALL types of
 * messages including those that only appear in DevTools console.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function testWithDevTools(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG DevTools Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

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

  // Launch with DevTools port
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const allIssues = [];

  // Use CDP to capture all log entries including warnings
  const client = await page.context().newCDPSession(page);

  // Enable various CDP domains
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Runtime.enable');

  // Capture log entries (includes verbose info, warnings, errors)
  client.on('Log.entryAdded', (params) => {
    const entry = params.entry;
    console.log(`[CDP LOG ${entry.level}] ${entry.source}: ${entry.text}`);
    if (entry.url) console.log(`  URL: ${entry.url}:${entry.lineNumber}`);
    allIssues.push({
      type: 'log',
      level: entry.level,
      source: entry.source,
      text: entry.text,
      url: entry.url,
      line: entry.lineNumber,
    });
  });

  // Capture console API calls
  client.on('Runtime.consoleAPICalled', (params) => {
    const args = params.args.map(a => a.value || a.description || '[object]').join(' ');
    console.log(`[CDP CONSOLE ${params.type}] ${args}`);
    allIssues.push({
      type: 'console',
      level: params.type,
      text: args,
    });
  });

  // Capture exceptions
  client.on('Runtime.exceptionThrown', (params) => {
    const ex = params.exceptionDetails;
    console.log(`[CDP EXCEPTION] ${ex.text}`);
    if (ex.exception) {
      console.log(`  ${ex.exception.description || ex.exception.value}`);
    }
    allIssues.push({
      type: 'exception',
      text: ex.text,
      details: ex.exception?.description,
    });
  });

  // Regular Playwright console capture as backup
  page.on('console', msg => {
    console.log(`[PW ${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.log(`[PW PAGE_ERROR] ${error.message}`);
    allIssues.push({ type: 'pageerror', text: error.message });
  });

  console.log('\n--- Loading SVG ---');

  try {
    await page.goto(svgUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }

  // Wait for all messages to appear
  await page.waitForTimeout(5000);

  // Check SMIL animation usage (SMIL is fully supported in modern browsers)
  const smilInfo = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    if (!svg) return { exists: false };

    const animateElements = svg.querySelectorAll('animate, animateTransform, animateMotion, animateColor, set');
    return {
      exists: true,
      smilElementCount: animateElements.length,
      viewBoxAnimations: svg.querySelectorAll('animate[attributeName="viewBox"]').length,
    };
  });

  console.log('\n--- SMIL Animation Info ---');
  console.log(`  SMIL elements: ${smilInfo.smilElementCount}`);
  console.log(`  viewBox animations: ${smilInfo.viewBoxAnimations}`);

  await browser.close();
  server.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('ALL CAPTURED ISSUES');
  console.log('='.repeat(70));

  if (allIssues.length === 0) {
    console.log('No issues captured');
  } else {
    for (const issue of allIssues) {
      console.log(`[${issue.type}/${issue.level || 'N/A'}] ${issue.text}`);
    }
  }

  return allIssues;
}

testWithDevTools(SVG_PATH)
  .then(issues => {
    const errors = issues.filter(i => i.level === 'error' || i.type === 'exception' || i.type === 'pageerror');
    console.log(`\nTotal issues: ${issues.length}, Errors: ${errors.length}`);
    process.exit(errors.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
