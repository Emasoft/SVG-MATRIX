/**
 * Full optimization test - all plugins EXCEPT float precision reduction
 * Preserves original numeric precision while optimizing encoding
 */

import fs from 'fs';
import { parsePath, serializePath, toRelative, toAbsolute, lineToHV, lineToZ } from '../src/convert-path-data.js';
import { parseSVG, serializeSVG } from '../src/svg-parser.js';

const INPUT_FILE = 'samples/anime_girl.fbf.svg';
const OUTPUT_FILE = 'samples/anime_girl.full-optimized.svg';

// High precision to preserve original values
const PRECISION = 6;

/**
 * Optimize a single path with all encoding optimizations (no precision reduction)
 */
function optimizePath(d) {
  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0, cy = 0, startX = 0, startY = 0;
  const optimized = [];

  for (let i = 0; i < commands.length; i++) {
    let cmd = commands[i];

    // 1. Line shorthands (L -> H/V when applicable)
    if (cmd.command === 'L' || cmd.command === 'l') {
      const hvCmd = lineToHV(cmd, cx, cy);
      if (hvCmd) cmd = hvCmd;
    }

    // 2. Line to Z (when line returns to subpath start)
    if (cmd.command === 'L' || cmd.command === 'l') {
      if (lineToZ(cmd, cx, cy, startX, startY)) {
        cmd = { command: 'z', args: [] };
      }
    }

    // 3. Choose shorter form (absolute vs relative)
    if (cmd.command !== 'Z' && cmd.command !== 'z') {
      const abs = toAbsolute(cmd, cx, cy);
      const rel = toRelative(cmd, cx, cy);

      // Serialize both and compare lengths
      const absArgs = abs.args.map(n => formatNum(n)).join(' ');
      const relArgs = rel.args.map(n => formatNum(n)).join(' ');

      // Prefer relative if same length or shorter (relative often compresses better)
      cmd = relArgs.length <= absArgs.length ? rel : abs;
    }

    optimized.push(cmd);

    // Update position
    const finalCmd = toAbsolute(cmd, cx, cy);
    switch (finalCmd.command) {
      case 'M': cx = finalCmd.args[0]; cy = finalCmd.args[1]; startX = cx; startY = cy; break;
      case 'L': case 'T': cx = finalCmd.args[0]; cy = finalCmd.args[1]; break;
      case 'H': cx = finalCmd.args[0]; break;
      case 'V': cy = finalCmd.args[0]; break;
      case 'C': cx = finalCmd.args[4]; cy = finalCmd.args[5]; break;
      case 'S': case 'Q': cx = finalCmd.args[2]; cy = finalCmd.args[3]; break;
      case 'A': cx = finalCmd.args[5]; cy = finalCmd.args[6]; break;
      case 'Z': cx = startX; cy = startY; break;
    }
  }

  return serializePath(optimized, PRECISION);
}

/**
 * Format number preserving precision but removing unnecessary chars
 */
function formatNum(n) {
  if (n === 0) return '0';

  // Use high precision, then clean up
  let str = n.toFixed(6);

  // Remove trailing zeros after decimal
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }

  // Remove leading zero before decimal for small numbers
  if (str.startsWith('0.')) {
    str = str.substring(1);
  } else if (str.startsWith('-0.')) {
    str = '-' + str.substring(2);
  }

  return str || '0';
}

console.log('\n=== Full Optimization (no precision reduction) ===\n');

const originalContent = fs.readFileSync(INPUT_FILE, 'utf8');
const originalSize = Buffer.byteLength(originalContent);
console.log('Original size:', (originalSize / 1024 / 1024).toFixed(2), 'MB');

const doc = parseSVG(originalContent);
const paths = Array.from(doc.getElementsByTagName('path'));
console.log('Paths:', paths.length);

let totalOriginalD = 0;
let totalOptimizedD = 0;
let pathsOptimized = 0;

for (const path of paths) {
  const d = path.getAttribute('d');
  if (d) {
    totalOriginalD += d.length;
    const optimizedD = optimizePath(d);
    totalOptimizedD += optimizedD.length;

    if (optimizedD.length < d.length) {
      pathsOptimized++;
    }

    path.setAttribute('d', optimizedD);
  }
}

const output = serializeSVG(doc);
const outputSize = Buffer.byteLength(output);

fs.writeFileSync(OUTPUT_FILE, output);

console.log('\nPath data optimization:');
console.log('  Original d total:', (totalOriginalD / 1024).toFixed(1), 'KB');
console.log('  Optimized d total:', (totalOptimizedD / 1024).toFixed(1), 'KB');
console.log('  D savings:', ((totalOriginalD - totalOptimizedD) / 1024).toFixed(1), 'KB',
            '(' + ((1 - totalOptimizedD / totalOriginalD) * 100).toFixed(1) + '%)');
console.log('  Paths improved:', pathsOptimized, 'of', paths.length);

console.log('\nFile size:');
console.log('  Original:', (originalSize / 1024 / 1024).toFixed(2), 'MB');
console.log('  Optimized:', (outputSize / 1024 / 1024).toFixed(2), 'MB');
console.log('  Savings:', ((originalSize - outputSize) / 1024).toFixed(1), 'KB',
            '(' + ((1 - outputSize / originalSize) * 100).toFixed(1) + '%)');

console.log('\nSaved to:', OUTPUT_FILE);
console.log('\n=== Done ===\n');
