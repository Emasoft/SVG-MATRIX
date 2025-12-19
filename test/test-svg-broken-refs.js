/**
 * SVG Broken Reference Check
 *
 * Checks if any url() or href references point to non-existent IDs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_PATH = path.join(__dirname, '../samples/SVG_WITH_EMBEDDED_AUDIO/cartoon_sample_with_audio.svg');

async function checkBrokenRefs(svgPath) {
  console.log('='.repeat(70));
  console.log('SVG Broken Reference Check');
  console.log('='.repeat(70));
  console.log(`\nSVG File: ${svgPath}`);

  const svgContent = await fs.readFile(svgPath, 'utf8');
  console.log(`File size: ${(svgContent.length / 1024).toFixed(2)} KB`);

  // Find all defined IDs
  const definedIds = new Set();
  const idDefRegex = /\bid\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = idDefRegex.exec(svgContent)) !== null) {
    definedIds.add(match[1]);
  }
  console.log(`\nDefined IDs: ${definedIds.size}`);

  // Find all url() references
  const urlRefRegex = /url\s*\(\s*["']?#([^)"']+)["']?\s*\)/g;
  const urlRefs = new Map();
  while ((match = urlRefRegex.exec(svgContent)) !== null) {
    const id = match[1];
    const lineNum = svgContent.substring(0, match.index).split('\n').length;
    if (!urlRefs.has(id)) {
      urlRefs.set(id, []);
    }
    urlRefs.get(id).push(lineNum);
  }

  // Find all href references
  const hrefRegex = /(?:xlink:)?href\s*=\s*["']#([^"']+)["']/g;
  const hrefRefs = new Map();
  while ((match = hrefRegex.exec(svgContent)) !== null) {
    const id = match[1];
    const lineNum = svgContent.substring(0, match.index).split('\n').length;
    if (!hrefRefs.has(id)) {
      hrefRefs.set(id, []);
    }
    hrefRefs.get(id).push(lineNum);
  }

  console.log(`url() references: ${urlRefs.size} unique IDs`);
  console.log(`href references: ${hrefRefs.size} unique IDs`);

  // Check for broken url() references
  const brokenUrlRefs = [];
  for (const [id, lines] of urlRefs) {
    if (!definedIds.has(id)) {
      brokenUrlRefs.push({ id, lines, type: 'url()' });
    }
  }

  // Check for broken href references
  const brokenHrefRefs = [];
  for (const [id, lines] of hrefRefs) {
    if (!definedIds.has(id)) {
      brokenHrefRefs.push({ id, lines, type: 'href' });
    }
  }

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('BROKEN REFERENCES');
  console.log('='.repeat(70));

  if (brokenUrlRefs.length === 0 && brokenHrefRefs.length === 0) {
    console.log('No broken references found.');
  } else {
    if (brokenUrlRefs.length > 0) {
      console.log(`\nBroken url() references (${brokenUrlRefs.length}):`);
      for (const ref of brokenUrlRefs) {
        console.log(`  #${ref.id} - referenced at line(s): ${ref.lines.slice(0, 5).join(', ')}${ref.lines.length > 5 ? '...' : ''}`);
      }
    }

    if (brokenHrefRefs.length > 0) {
      console.log(`\nBroken href references (${brokenHrefRefs.length}):`);
      for (const ref of brokenHrefRefs) {
        console.log(`  #${ref.id} - referenced at line(s): ${ref.lines.slice(0, 5).join(', ')}${ref.lines.length > 5 ? '...' : ''}`);
      }
    }
  }

  // Sample some defined IDs for verification
  console.log('\n--- Sample Defined IDs (first 20) ---');
  const sampleIds = Array.from(definedIds).slice(0, 20);
  console.log(sampleIds.join(', '));

  // Also check for common error patterns
  console.log('\n--- Additional Checks ---');

  // Check for duplicate IDs
  const idCounts = new Map();
  const idDefRegex2 = /\bid\s*=\s*["']([^"']+)["']/g;
  while ((match = idDefRegex2.exec(svgContent)) !== null) {
    const id = match[1];
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const duplicateIds = Array.from(idCounts.entries()).filter(([, count]) => count > 1);
  if (duplicateIds.length > 0) {
    console.log(`\nDuplicate IDs found (${duplicateIds.length}):`);
    for (const [id, count] of duplicateIds.slice(0, 10)) {
      console.log(`  #${id} appears ${count} times`);
    }
    if (duplicateIds.length > 10) {
      console.log(`  ... and ${duplicateIds.length - 10} more`);
    }
  } else {
    console.log('No duplicate IDs found.');
  }

  const totalBroken = brokenUrlRefs.length + brokenHrefRefs.length;
  console.log('\n' + '='.repeat(70));
  console.log(`RESULT: ${totalBroken > 0 ? `${totalBroken} BROKEN REFERENCES FOUND` : 'ALL REFERENCES VALID'}`);
  console.log('='.repeat(70));

  return {
    definedIds: definedIds.size,
    urlRefs: urlRefs.size,
    hrefRefs: hrefRefs.size,
    brokenUrlRefs,
    brokenHrefRefs,
    duplicateIds,
    totalBroken,
  };
}

checkBrokenRefs(SVG_PATH)
  .then(result => {
    process.exit(result.totalBroken > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
  });
