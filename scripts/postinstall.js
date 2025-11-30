#!/usr/bin/env node
/**
 * @fileoverview Post-install welcome message for @emasoft/svg-matrix
 * Displays a compact summary of available features after npm install.
 *
 * Design principles:
 * - Fail silently: npm install must never fail because of postinstall.
 *   Any error is caught and swallowed with exit(0).
 * - Be respectful of terminal real estate: Keep the message compact.
 *   Users want to continue working, not read documentation.
 * - Cross-platform: Handle Windows legacy terminals that don't support ANSI.
 * - Standards-compliant: Respect NO_COLOR environment variable.
 *
 * @module scripts/postinstall
 * @license MIT
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================================================
// VERSION DETECTION
// ============================================================================
/**
 * Read version from package.json dynamically.
 *
 * Why dynamic reading instead of hardcoding:
 * - Avoids version mismatch bugs where postinstall shows wrong version.
 * - Single source of truth in package.json.
 *
 * Why wrapped in try-catch:
 * - postinstall scripts must NEVER fail - this would break npm install.
 * - Return 'unknown' gracefully if file read fails for any reason.
 *
 * @returns {string} Version string or 'unknown' on error
 */
function getVersion() {
  try {
    // Why: ESM doesn't have __dirname, must derive from import.meta.url
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Why: Go up one level because this script is in scripts/ subfolder
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    // Why: Return safe default - never throw from postinstall
    return 'unknown';
  }
}

// ============================================================================
// COLOR SUPPORT DETECTION
// ============================================================================
/**
 * Check if colors should be disabled.
 *
 * Why this function:
 * - Not all terminals support ANSI escape codes.
 * - Showing raw escape codes is worse than no colors.
 * - NO_COLOR is an emerging standard: https://no-color.org
 *
 * @returns {boolean} True if colors should be disabled
 */
function shouldDisableColors() {
  // Why: NO_COLOR standard - presence (any value) means disable colors
  // Check for presence, not truthiness, per spec
  if (process.env.NO_COLOR !== undefined) {
    return true;
  }

  // Why: Windows cmd.exe (not PowerShell/Terminal) doesn't support ANSI by default
  // Check for known ANSI-capable Windows terminals
  if (process.platform === 'win32') {
    const supportsAnsi =
      process.env.WT_SESSION ||           // Windows Terminal sets this
      process.env.ConEmuANSI === 'ON' ||  // ConEmu explicitly signals support
      process.env.TERM_PROGRAM ||         // VS Code, Hyper, etc. set this
      process.env.ANSICON;                // ANSICON utility for legacy cmd
    // Why: Disable colors unless we detect ANSI support
    return !supportsAnsi;
  }

  // Why: Unix terminals generally support ANSI, so enable by default
  return false;
}

/**
 * ANSI color codes for terminal output.
 *
 * Why function instead of constant:
 * - Need to check color support at runtime, not module load time.
 * - Environment variables may change between import and execution.
 *
 * @param {boolean} disabled - Whether colors are disabled
 * @returns {Object} Color code object
 */
function getColors(disabled) {
  // Why: Return empty strings instead of undefined to avoid string concat issues
  if (disabled) {
    return {
      reset: '', bright: '', dim: '',
      cyan: '', green: '', yellow: '',
      magenta: '', blue: '', white: '',
    };
  }
  // Why: Use standard ANSI SGR (Select Graphic Rendition) codes
  // Format: ESC[<code>m where ESC is \x1b
  return {
    reset: '\x1b[0m',      // Reset all attributes
    bright: '\x1b[1m',     // Bold/bright
    dim: '\x1b[2m',        // Dim/faint
    cyan: '\x1b[36m',      // Cyan foreground
    green: '\x1b[32m',     // Green foreground
    yellow: '\x1b[33m',    // Yellow foreground
    magenta: '\x1b[35m',   // Magenta foreground
    blue: '\x1b[34m',      // Blue foreground
    white: '\x1b[37m',     // White foreground
  };
}

// ============================================================================
// UNICODE SUPPORT DETECTION
// ============================================================================
/**
 * Check if terminal likely supports Unicode box drawing characters.
 *
 * Why this check:
 * - Some older terminals or SSH sessions may not render Unicode correctly.
 * - Windows cmd.exe before Windows 10 has limited Unicode support.
 * - Better to show ASCII fallback than broken box characters.
 *
 * @returns {boolean} True if Unicode is likely supported
 */
function supportsUnicode() {
  // Why: Check common environment indicators for Unicode support

  // Windows legacy cmd.exe typically has codepage issues
  if (process.platform === 'win32') {
    // Modern Windows Terminal supports Unicode
    if (process.env.WT_SESSION) return true;
    // Check for UTF-8 codepage
    if (process.env.CHCP === '65001') return true;
    // ConEmu and other modern terminals
    if (process.env.ConEmuANSI === 'ON') return true;
    if (process.env.TERM_PROGRAM) return true;
    // Default to ASCII on Windows for safety
    return false;
  }

  // Why: Unix terminals generally support Unicode if LANG/LC_CTYPE mentions UTF-8
  const lang = process.env.LANG || process.env.LC_CTYPE || '';
  if (lang.toLowerCase().includes('utf')) return true;

  // Why: Modern terminal emulators typically support Unicode
  if (process.env.TERM_PROGRAM) return true;

  // Default to Unicode on Unix (most modern systems support it)
  return true;
}

// ============================================================================
// CI DETECTION
// ============================================================================
/**
 * Check if running in CI environment.
 *
 * Why skip in CI:
 * - CI logs should be clean and focused on build/test output.
 * - Welcome messages just add noise to CI logs.
 * - CI systems can set CI=true to suppress this and similar messages.
 *
 * @returns {boolean} True if in CI
 */
function isCI() {
  // Why: Check multiple CI indicators since there's no universal standard
  // Each CI system sets different environment variables
  return !!(
    process.env.CI ||                    // GitHub Actions, GitLab CI, CircleCI
    process.env.CONTINUOUS_INTEGRATION || // Travis CI
    process.env.GITHUB_ACTIONS ||        // GitHub Actions (redundant with CI but explicit)
    process.env.GITLAB_CI ||             // GitLab CI
    process.env.CIRCLECI ||              // CircleCI
    process.env.TRAVIS ||                // Travis CI
    process.env.JENKINS_URL ||           // Jenkins
    process.env.BUILD_ID                 // Various CI systems
  );
}

/**
 * Display the welcome message.
 * Main entry point for the postinstall script.
 *
 * Why this design:
 * - Skip silently in CI: CI environments don't need welcome messages, and
 *   they clutter build logs. Most CI systems set CI=true or similar.
 * - Skip in non-TTY: If stdout isn't a terminal (e.g., piped to file),
 *   ANSI codes would be visible as garbage characters.
 * - Compact message: Users just installed the package and want to continue
 *   their work. A brief message with the essentials respects their time.
 *   Full documentation belongs in README, not terminal output.
 */
function showWelcome() {
  // Why: CI builds don't need welcome messages, they just add noise to logs
  if (isCI()) {
    process.exit(0);
  }

  // Why: Non-TTY means output is being piped/redirected - ANSI codes would be garbage
  if (!process.stdout.isTTY) {
    process.exit(0);
  }

  const version = getVersion();
  const colorsDisabled = shouldDisableColors();
  const c = getColors(colorsDisabled);
  const unicode = supportsUnicode();

  // Why: Use ASCII box characters as fallback for terminals without Unicode
  const box = unicode ? {
    tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│'
  } : {
    tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'
  };

  // Why: Keep message compact - users want to continue their work, not read a manual.
  // Link to docs for those who want more. Use box drawing for visual structure.
  const message = `
${c.cyan}${box.tl}${box.h.repeat(45)}${box.tr}${c.reset}
${c.cyan}${box.v}${c.reset} ${c.bright}@emasoft/svg-matrix${c.reset} v${version}              ${c.cyan}${box.v}${c.reset}
${c.cyan}${box.v}${c.reset} High-precision SVG matrix transforms       ${c.cyan}${box.v}${c.reset}
${c.cyan}${box.bl}${box.h.repeat(45)}${box.br}${c.reset}

${c.green}CLI:${c.reset}  npx svg-matrix flatten input.svg -o out.svg
${c.green}API:${c.reset}  import { Matrix, Transforms2D } from '@emasoft/svg-matrix'
${c.green}Docs:${c.reset} ${c.blue}https://github.com/Emasoft/SVG-MATRIX#readme${c.reset}
`;

  console.log(message);
}

// ============================================================================
// MAIN ENTRY
// ============================================================================
// Why try-catch: postinstall scripts must NEVER fail or throw.
// A failed postinstall would break `npm install` for users, which is
// absolutely unacceptable. Catch everything and exit cleanly.
try {
  showWelcome();
} catch {
  // Why: Silent exit - don't break npm install for a welcome message
  process.exit(0);
}
