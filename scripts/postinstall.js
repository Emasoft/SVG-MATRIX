#!/usr/bin/env node
/**
 * @fileoverview Post-install welcome message for @emasoft/svg-matrix
 * Displays a summary of CLI commands and API functions after npm install.
 *
 * @module scripts/postinstall
 * @license MIT
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function getVersion() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function shouldDisableColors() {
  if (process.env.NO_COLOR !== undefined) return true;
  if (process.platform === 'win32') {
    return !(process.env.WT_SESSION || process.env.ConEmuANSI === 'ON' ||
             process.env.TERM_PROGRAM || process.env.ANSICON);
  }
  return false;
}

function getColors(disabled) {
  if (disabled) {
    return { reset: '', bright: '', dim: '', cyan: '', green: '',
             yellow: '', magenta: '', blue: '', white: '' };
  }
  return {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
    magenta: '\x1b[35m', blue: '\x1b[34m', white: '\x1b[37m',
  };
}

function supportsUnicode() {
  if (process.platform === 'win32') {
    return !!(process.env.WT_SESSION || process.env.CHCP === '65001' ||
              process.env.ConEmuANSI === 'ON' || process.env.TERM_PROGRAM);
  }
  return true;
}

function isCI() {
  return !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION ||
            process.env.GITHUB_ACTIONS || process.env.GITLAB_CI ||
            process.env.CIRCLECI || process.env.TRAVIS ||
            process.env.JENKINS_URL || process.env.BUILD_ID);
}

// Strip ANSI escape codes for accurate length calculation
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Pad string to width W (accounting for ANSI codes)
function pad(s, w) {
  const visible = stripAnsi(s).length;
  return s + ' '.repeat(Math.max(0, w - visible));
}

function showWelcome() {
  if (isCI()) process.exit(0);
  if (!process.stdout.isTTY) process.exit(0);

  const version = getVersion();
  const c = getColors(shouldDisableColors());
  const u = supportsUnicode();

  const B = u
    ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', dot: '•' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', dot: '*' };

  const W = 66;
  const hr = B.h.repeat(W);
  const R = (s) => pad(s, W);

  console.log(`
${c.cyan}${B.tl}${hr}${B.tr}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.bright}@emasoft/svg-matrix${c.reset} v${version}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.dim}Arbitrary-precision SVG transforms with decimal.js${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${hr}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.yellow}CLI Commands:${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}svg-matrix flatten${c.reset} input.svg -o output.svg`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}Bake all transforms into path coordinates${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}Options:${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}--precision N${c.reset}       Output decimal places (default: 6)`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}--clip-segments N${c.reset}   Polygon sampling for clips (default: 64)`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}--bezier-arcs N${c.reset}     Bezier arcs for curves (default: 8)`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}--e2e-tolerance N${c.reset}   Verification tolerance (default: 1e-10)`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`    ${c.dim}--verbose${c.reset}           Show processing details`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${hr}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.yellow}JavaScript API:${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.magenta}import${c.reset} { Matrix, Vector, Transforms2D } ${c.magenta}from${c.reset} '@emasoft/svg-matrix'`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot} Matrix${c.reset}        Arbitrary-precision matrix operations`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot} Vector${c.reset}        High-precision vector math`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot} Transforms2D${c.reset}  rotate, scale, translate, skew, reflect`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot} Transforms3D${c.reset}  3D affine transformations`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${hr}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.yellow}New in v1.0.13:${c.reset}`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot}${c.reset} High-precision Bezier circle/ellipse approximation`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot}${c.reset} E2E verification for clip-path operations`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R(`  ${c.green}${B.dot}${c.reset} Configurable: --clip-segments, --bezier-arcs, --e2e-tolerance`)}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.v}${c.reset}${R('')}${c.cyan}${B.v}${c.reset}
${c.cyan}${B.bl}${hr}${B.br}${c.reset}

  ${c.blue}Docs:${c.reset} https://github.com/Emasoft/SVG-MATRIX#readme
  ${c.blue}Help:${c.reset} svg-matrix --help
`);
}

try {
  showWelcome();
} catch {
  process.exit(0);
}
