import { validateSvg, ValidationSeverity } from '../src/svg-toolbox.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';

// Compute paths relative to this file's location for portability
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

async function findSvgFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findSvgFiles(fullPath, files);
    } else if (entry.name.endsWith('.svg')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function testFalsePositives() {
  console.log('='.repeat(70));
  console.log('VALIDATESVG FALSE POSITIVE TEST');
  console.log('='.repeat(70));
  console.log();

  // Key test directories - these should be well-formed SVGs (using relative paths)
  const testDirs = [
    path.join(PROJECT_ROOT, 'samples', 'toolbox-tests')
  ];

  // Specific files to test (known good files - using relative paths)
  const specificFiles = [
    path.join(PROJECT_ROOT, 'samples', 'test.svg'),
    path.join(PROJECT_ROOT, 'samples', 'meshgradient_polyfill_example.svg'),
    path.join(PROJECT_ROOT, 'samples', 'anime_girl.fbf.svg'),
    path.join(PROJECT_ROOT, 'samples', 'panther_bird_header.fbf.svg')
  ];

  let allFiles = [...specificFiles];

  for (const dir of testDirs) {
    try {
      const files = await findSvgFiles(dir);
      allFiles.push(...files);
    } catch (e) {
      console.log(`Could not scan ${dir}: ${e.message}`);
    }
  }

  // Remove duplicates
  allFiles = [...new Set(allFiles)];

  console.log(`Testing ${allFiles.length} SVG files for false positives...\n`);

  const results = {
    total: 0,
    clean: 0,
    withErrors: 0,
    withWarningsOnly: 0,
    falsePositives: []
  };

  // Known issue types that are likely false positives if flagged on known-good SVGs
  const likelyFalsePositiveTypes = new Set([
    'mistyped_element_detected',
    'unknown_element_detected',
    'mistyped_attribute_detected',
    'unknown_attribute_detected'
  ]);

  for (const file of allFiles) {
    try {
      const result = await validateSvg(file);
      results.total++;

      if (result.issues.length === 0) {
        results.clean++;
      } else if (result.errorCount > 0) {
        results.withErrors++;
      } else {
        results.withWarningsOnly++;
      }

      // Check for likely false positives
      for (const issue of result.issues) {
        if (likelyFalsePositiveTypes.has(issue.type)) {
          results.falsePositives.push({
            file: path.basename(file),
            issue
          });
        }
      }

    } catch (e) {
      console.log(`ERROR testing ${path.basename(file)}: ${e.message}`);
    }
  }

  console.log('-'.repeat(70));
  console.log('SUMMARY');
  console.log('-'.repeat(70));
  console.log(`Total files tested: ${results.total}`);
  console.log(`Clean (no issues): ${results.clean}`);
  console.log(`With errors: ${results.withErrors}`);
  console.log(`With warnings only: ${results.withWarningsOnly}`);
  console.log();

  if (results.falsePositives.length > 0) {
    console.log('-'.repeat(70));
    console.log('POTENTIAL FALSE POSITIVES (unknown/mistyped elements/attributes):');
    console.log('-'.repeat(70));
    for (const fp of results.falsePositives) {
      console.log(`  ${fp.file}: [${fp.issue.severity}] ${fp.issue.type}`);
      console.log(`    Element: ${fp.issue.element || 'N/A'}, Attr: ${fp.issue.attr || 'N/A'}`);
      console.log(`    Reason: ${fp.issue.reason}`);
      console.log();
    }
  } else {
    console.log('NO FALSE POSITIVES DETECTED for unknown/mistyped elements/attributes!');
  }

  console.log('='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

testFalsePositives().catch(console.error);
