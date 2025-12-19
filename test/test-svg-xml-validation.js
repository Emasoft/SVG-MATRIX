/**
 * SVG XML Validation Test using Playwright
 *
 * Tests SVG validity by checking for XML parser errors and
 * SVG-specific validation issues like missing required attributes.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function validateSVGXML(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG XML Validation Test');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Pre-check: Look for foreignObject elements without required attributes
  console.log('\n--- Pre-flight Static Analysis ---');
  const foreignObjectRegex = /<foreignObject([^>]*)>/g;
  let match;
  const foreignObjectIssues = [];

  while ((match = foreignObjectRegex.exec(svgContent)) !== null) {
    const attrs = match[1];
    const hasWidth = /\bwidth\s*=/.test(attrs);
    const hasHeight = /\bheight\s*=/.test(attrs);

    if (!hasWidth || !hasHeight) {
      const position = match.index;
      const lineNum = svgContent.substring(0, position).split('\n').length;
      foreignObjectIssues.push({
        line: lineNum,
        hasWidth,
        hasHeight,
        snippet: match[0].substring(0, 100),
      });
    }
  }

  if (foreignObjectIssues.length > 0) {
    console.log(`FOUND ${foreignObjectIssues.length} foreignObject element(s) with missing required attributes:`);
    for (const issue of foreignObjectIssues) {
      console.log(`  Line ${issue.line}: width=${issue.hasWidth}, height=${issue.hasHeight}`);
      console.log(`    ${issue.snippet}...`);
    }
  } else {
    console.log('All foreignObject elements have required width/height attributes.');
  }

  // Create HTTP server to serve SVG with correct MIME type
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
    args: ['--disable-web-security'],
  });

  const context = await browser.newContext({
    bypassCSP: true,
  });

  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  const allMessages = [];

  // Capture console messages
  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    allMessages.push(entry);
    if (msg.type() === 'error') errors.push(entry);
    if (msg.type() === 'warning') warnings.push(entry);
  });

  page.on('pageerror', error => {
    errors.push({ type: 'pageerror', text: error.message });
  });

  // Load SVG directly and check for XML parsing errors
  console.log('\n--- Browser XML Validation ---');

  try {
    const response = await page.goto(svgUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`HTTP Status: ${response.status()}`);
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }

  await page.waitForTimeout(2000);

  // Check if there's an XML parsing error displayed in the page
  const pageContent = await page.content();
  const hasXMLError = pageContent.includes('XML Parsing Error') ||
                      pageContent.includes('error on line') ||
                      pageContent.includes('parsererror');

  if (hasXMLError) {
    console.log('XML PARSING ERROR DETECTED in page content!');
    // Extract error message
    const errorMatch = pageContent.match(/XML Parsing Error[^<]*/);
    if (errorMatch) {
      console.log(`  ${errorMatch[0]}`);
    }
    errors.push({ type: 'xml_parse', text: 'XML Parsing Error detected' });
  }

  // Check the SVG DOM for validation issues
  const domValidation = await page.evaluate(() => {
    const issues = [];

    // Check if SVG element exists
    const svg = document.querySelector('svg');
    if (!svg) {
      issues.push('No SVG element found - possible XML parsing error');
      return { issues, svgExists: false };
    }

    // Check foreignObject elements for required attributes
    const foreignObjects = svg.querySelectorAll('foreignObject');
    foreignObjects.forEach((fo, i) => {
      const width = fo.getAttribute('width');
      const height = fo.getAttribute('height');

      // Per SVG spec, width and height are REQUIRED on foreignObject
      if (!width) {
        issues.push(`foreignObject[${i}] missing REQUIRED 'width' attribute`);
      }
      if (!height) {
        issues.push(`foreignObject[${i}] missing REQUIRED 'height' attribute`);
      }

      // Check if they're zero or invalid
      if (width === '0' || width === '0px') {
        issues.push(`foreignObject[${i}] has zero width - content will not render`);
      }
      if (height === '0' || height === '0px') {
        issues.push(`foreignObject[${i}] has zero height - content will not render`);
      }
    });

    // Check for use elements with broken references
    const useElements = svg.querySelectorAll('use');
    useElements.forEach((use, i) => {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href');
      if (href && href.startsWith('#')) {
        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        if (!target) {
          issues.push(`use[${i}] references non-existent element #${targetId}`);
        }
      }
    });

    // Check audio elements inside foreignObject
    const audioElements = svg.querySelectorAll('foreignObject audio');
    audioElements.forEach((audio, i) => {
      const sources = audio.querySelectorAll('source');
      if (sources.length === 0 && !audio.src) {
        issues.push(`audio[${i}] inside foreignObject has no source`);
      }
    });

    return {
      issues,
      svgExists: true,
      foreignObjectCount: foreignObjects.length,
      useCount: useElements.length,
      audioCount: audioElements.length,
    };
  });

  console.log('\nDOM Validation Results:');
  console.log(`  SVG exists: ${domValidation.svgExists}`);
  if (domValidation.svgExists) {
    console.log(`  foreignObject elements: ${domValidation.foreignObjectCount}`);
    console.log(`  use elements: ${domValidation.useCount}`);
    console.log(`  audio elements in foreignObject: ${domValidation.audioCount}`);
  }

  if (domValidation.issues.length > 0) {
    console.log('\n  VALIDATION ISSUES:');
    for (const issue of domValidation.issues) {
      console.log(`    - ${issue}`);
      errors.push({ type: 'validation', text: issue });
    }
  }

  await browser.close();
  server.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(70));

  const totalIssues = foreignObjectIssues.length + domValidation.issues.length;

  if (totalIssues === 0) {
    console.log('No validation issues found.');
  } else {
    console.log(`Found ${totalIssues} validation issue(s):`);

    if (foreignObjectIssues.length > 0) {
      console.log(`\n  Static Analysis (${foreignObjectIssues.length} issues):`);
      for (const issue of foreignObjectIssues) {
        console.log(`    - Line ${issue.line}: foreignObject missing ${!issue.hasWidth ? 'width' : ''} ${!issue.hasHeight ? 'height' : ''}`);
      }
    }

    if (domValidation.issues.length > 0) {
      console.log(`\n  DOM Validation (${domValidation.issues.length} issues):`);
      for (const issue of domValidation.issues) {
        console.log(`    - ${issue}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`RESULT: ${totalIssues > 0 ? 'VALIDATION FAILED' : 'VALIDATION PASSED'}`);
  console.log('='.repeat(70));

  return {
    staticIssues: foreignObjectIssues,
    domIssues: domValidation.issues,
    totalIssues,
    passed: totalIssues === 0,
  };
}

validateSVGXML(SVG_PATH)
  .then(result => {
    console.log(`\nExit code: ${result.passed ? 0 : 1}`);
    process.exit(result.passed ? 0 : 1);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
