/**
 * Test arc command parsing specifically
 * Arc format: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
 * Flags are ALWAYS 0 or 1 - they can merge with adjacent numbers
 */

import fs from 'fs';
import { parsePath } from '../src/convert-path-data.js';
import { parseSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';

console.log('\n=== Arc Command Parsing Test ===\n');

// First, let's find all arc commands in the file
const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');

// Find all 'd' attributes that contain arc commands
const arcRegex = /d="[^"]*[Aa][^"]*"/g;
const arcMatches = originalContent.match(arcRegex) || [];

console.log('Paths with arc commands:', arcMatches.length);

// Extract actual arc commands
const arcCmdRegex = /[Aa][-\d\s.,]+/g;
const allArcs = [];
for (const match of arcMatches) {
  const d = match.slice(3, -1); // Remove 'd="' and '"'
  const arcs = d.match(arcCmdRegex) || [];
  allArcs.push(...arcs);
}

console.log('Total arc command segments:', allArcs.length);
console.log('\nFirst 10 arc commands from original:');
for (let i = 0; i < Math.min(10, allArcs.length); i++) {
  console.log(`  ${i}: "${allArcs[i].substring(0, 60)}..."`);
}

// Now test parsing of a known tricky arc
console.log('\n=== Testing tricky arc patterns ===\n');

const testCases = [
  // Standard format
  'M0 0 A 10 10 0 0 1 20 20',
  // Compressed - flags touch each other
  'M0 0 A10 10 0 01 20 20',
  // Very compressed - flag touches next number
  'M0 0 A10 10 0 0120 20',
  // Multiple arcs implicit
  'M0 0 A10 10 0 0 1 20 20 10 10 0 1 0 40 40',
];

for (const testD of testCases) {
  console.log('Input:', testD);
  const commands = parsePath(testD);
  for (const cmd of commands) {
    if (cmd.command === 'A' || cmd.command === 'a') {
      console.log('  Parsed A:', JSON.stringify(cmd.args));
      // Check if args make sense
      if (cmd.args.length !== 7) {
        console.log('  ERROR: Arc should have 7 args!');
      }
      if (cmd.args[3] !== 0 && cmd.args[3] !== 1) {
        console.log('  ERROR: large-arc-flag should be 0 or 1, got:', cmd.args[3]);
      }
      if (cmd.args[4] !== 0 && cmd.args[4] !== 1) {
        console.log('  ERROR: sweep-flag should be 0 or 1, got:', cmd.args[4]);
      }
    }
  }
  console.log('');
}

// Now parse actual arcs from the SVG
console.log('\n=== Parsing actual arcs from SVG ===\n');

const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));

let arcPathsChecked = 0;
let arcErrors = 0;

for (const path of paths) {
  const d = path.getAttribute('d');
  if (!d || !d.match(/[Aa]/)) continue;

  arcPathsChecked++;
  const commands = parsePath(d);

  for (const cmd of commands) {
    if (cmd.command === 'A' || cmd.command === 'a') {
      if (cmd.args.length !== 7) {
        console.log('ERROR: Arc with wrong args count:', cmd.args.length);
        console.log('  Path d (first 100 chars):', d.substring(0, 100));
        arcErrors++;
      }
      // Check flags are 0 or 1
      const largeArc = cmd.args[3];
      const sweep = cmd.args[4];
      if ((largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)) {
        console.log('ERROR: Invalid arc flags:', largeArc, sweep);
        console.log('  Full args:', cmd.args);
        console.log('  Path d (first 100 chars):', d.substring(0, 100));
        arcErrors++;
      }
    }
  }

  if (arcPathsChecked >= 20 && arcErrors === 0) {
    console.log('First 20 arc paths parsed OK...');
    break;
  }
}

console.log('\nArc paths checked:', arcPathsChecked);
console.log('Arc parsing errors:', arcErrors);

console.log('\n=== Done ===\n');
