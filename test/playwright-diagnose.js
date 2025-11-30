/**
 * Playwright Installation Diagnostics
 *
 * Tests to verify Playwright is correctly installed and can launch browsers.
 * Detects OS platform and provides diagnostic information for troubleshooting.
 *
 * Run with: node test/playwright-diagnose.js
 */

import { platform, arch, release, homedir, tmpdir, freemem, totalmem } from 'os';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const OK = `${colors.green}✓${colors.reset}`;
const FAIL = `${colors.red}✗${colors.reset}`;
const WARN = `${colors.yellow}⚠${colors.reset}`;
const INFO = `${colors.blue}ℹ${colors.reset}`;

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

/**
 * Run a command safely using execFileSync (no shell injection)
 */
function runCommand(cmd, args = []) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

/**
 * Detect OS platform details
 */
function detectPlatform() {
  const info = {
    platform: platform(),
    arch: arch(),
    release: release(),
    nodeVersion: process.version,
    npmVersion: runCommand('npm', ['--version']),
    homeDir: homedir(),
    tmpDir: tmpdir(),
    freeMemory: formatBytes(freemem()),
    totalMemory: formatBytes(totalmem()),
  };

  // Platform-specific details
  if (info.platform === 'darwin') {
    info.osName = 'macOS';
    info.osVersion = runCommand('sw_vers', ['-productVersion']);
    info.xcodeCLT = runCommand('xcode-select', ['-p']) ? 'installed' : 'not installed';
  } else if (info.platform === 'linux') {
    info.osName = 'Linux';
    // Read /etc/os-release directly instead of using shell
    try {
      const osRelease = require('fs').readFileSync('/etc/os-release', 'utf8');
      const prettyName = osRelease.match(/PRETTY_NAME="([^"]+)"/);
      const distroId = osRelease.match(/^ID=(.+)$/m);
      info.osVersion = prettyName ? prettyName[1] : 'unknown';
      info.distro = distroId ? distroId[1] : 'unknown';
    } catch {
      info.osVersion = 'unknown';
    }
  } else if (info.platform === 'win32') {
    info.osName = 'Windows';
    info.osVersion = release();
  }

  return info;
}

/**
 * Check if Playwright package is installed
 */
async function checkPlaywrightPackage() {
  const results = {
    installed: false,
    version: null,
    path: null,
    error: null,
  };

  try {
    const playwright = await import('playwright');
    results.installed = true;
    results.version = playwright.default?.version || 'unknown';

    // Find package path
    const possiblePaths = [
      join(process.cwd(), 'node_modules', 'playwright'),
      join(process.cwd(), 'node_modules', 'playwright-core'),
    ];
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        results.path = p;
        break;
      }
    }
  } catch (err) {
    results.error = err.message;
  }

  return results;
}

/**
 * Check if browser binaries are installed
 */
function checkBrowserBinaries() {
  const results = {
    chromium: { installed: false, path: null },
    firefox: { installed: false, path: null },
    webkit: { installed: false, path: null },
  };

  // Playwright stores browsers in ~/.cache/ms-playwright (Linux/macOS) or %LOCALAPPDATA%\ms-playwright (Windows)
  const cacheDir = platform() === 'win32'
    ? join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : join(homedir(), '.cache', 'ms-playwright');

  if (existsSync(cacheDir)) {
    // Check for browser directories
    const browsers = ['chromium', 'firefox', 'webkit'];
    try {
      const entries = readdirSync(cacheDir);
      for (const browser of browsers) {
        const browserDir = entries.find(e => e.startsWith(browser));
        if (browserDir) {
          const fullPath = join(cacheDir, browserDir);
          results[browser].installed = true;
          results[browser].path = fullPath;
        }
      }
    } catch {
      // Directory not readable
    }
  }

  results.cacheDir = cacheDir;
  results.cacheDirExists = existsSync(cacheDir);

  return results;
}

/**
 * Try to launch Chromium browser
 */
async function testBrowserLaunch() {
  const results = {
    canLaunch: false,
    headless: null,
    headed: null,
    error: null,
    timing: null,
  };

  try {
    const { chromium } = await import('playwright');

    // Test headless launch
    const startTime = Date.now();
    const browser = await chromium.launch({ headless: true, timeout: 30000 });
    results.timing = Date.now() - startTime;
    results.canLaunch = true;
    results.headless = true;

    // Get browser version
    results.browserVersion = browser.version();

    // Test creating a page
    const context = await browser.newContext();
    const page = await context.newPage();
    results.canCreatePage = true;

    // Test basic navigation
    await page.setContent('<html><body><div id="test">Hello</div></body></html>');
    const text = await page.locator('#test').textContent();
    results.canRenderContent = text === 'Hello';

    await browser.close();
  } catch (err) {
    results.error = err.message;

    // Diagnose common errors
    if (err.message.includes('Executable doesn\'t exist')) {
      results.diagnosis = 'Browser binaries not installed. Run: npx playwright install chromium';
    } else if (err.message.includes('ECONNREFUSED')) {
      results.diagnosis = 'Browser process failed to start. Check system resources.';
    } else if (err.message.includes('Target closed')) {
      results.diagnosis = 'Browser crashed on startup. May need system dependencies.';
    } else if (err.message.includes('Browser was not installed')) {
      results.diagnosis = 'Browser binaries not found. Run: npx playwright install';
    }
  }

  return results;
}

/**
 * Check system dependencies for Playwright
 */
function checkSystemDependencies() {
  const results = {
    platform: platform(),
    issues: [],
    suggestions: [],
  };

  if (platform() === 'linux') {
    // Check for common missing dependencies on Linux
    const requiredLibs = [
      { name: 'libnss3', check: '/usr/lib/x86_64-linux-gnu/libnss3.so' },
      { name: 'libatk-bridge-2.0', check: '/usr/lib/x86_64-linux-gnu/libatk-bridge-2.0.so.0' },
      { name: 'libdrm', check: '/usr/lib/x86_64-linux-gnu/libdrm.so.2' },
      { name: 'libxkbcommon', check: '/usr/lib/x86_64-linux-gnu/libxkbcommon.so.0' },
      { name: 'libgbm', check: '/usr/lib/x86_64-linux-gnu/libgbm.so.1' },
    ];

    for (const lib of requiredLibs) {
      if (!existsSync(lib.check)) {
        results.issues.push(`Missing library: ${lib.name}`);
      }
    }

    if (results.issues.length > 0) {
      results.suggestions.push('Run: npx playwright install-deps');
      results.suggestions.push('Or install manually: apt-get install libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1');
    }
  } else if (platform() === 'darwin') {
    // macOS with Apple Silicon - Playwright has native ARM builds since 1.18
    // Rosetta is not required for modern Playwright versions
    results.notes = arch() === 'arm64' ? 'Running on Apple Silicon (native ARM support)' : 'Running on Intel Mac';
  }

  return results;
}

/**
 * Test the BrowserVerify module from svg-matrix
 */
async function testBrowserVerifyModule() {
  const results = {
    canImport: false,
    canVerify: false,
    error: null,
  };

  try {
    const { BrowserVerify } = await import('../src/index.js');
    results.canImport = true;

    // Try a simple verification
    const verifier = new BrowserVerify.BrowserVerifier();
    await verifier.init({ headless: true });

    const result = await verifier.verifyViewBoxTransform(
      800, 600, '0 0 100 100', 'xMidYMid meet'
    );

    results.canVerify = true;
    results.verificationResult = result.matches ? 'PASS' : 'FAIL';
    results.browserCTM = result.browserCTM;
    results.libraryCTM = result.libraryCTM;

    await verifier.close();
  } catch (err) {
    results.error = err.message;
  }

  return results;
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log(`\n${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║         Playwright Installation Diagnostics                ║${colors.reset}`);
  console.log(`${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // 1. Platform Detection
  console.log(`${colors.cyan}▸ System Information${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  const platformInfo = detectPlatform();
  console.log(`  OS:           ${platformInfo.osName} ${platformInfo.osVersion || platformInfo.release}`);
  console.log(`  Architecture: ${platformInfo.arch}`);
  console.log(`  Node.js:      ${platformInfo.nodeVersion}`);
  console.log(`  npm:          ${platformInfo.npmVersion || 'not found'}`);
  console.log(`  Memory:       ${platformInfo.freeMemory} free / ${platformInfo.totalMemory} total`);
  if (platformInfo.xcodeCLT) {
    console.log(`  Xcode CLT:    ${platformInfo.xcodeCLT}`);
  }
  console.log();

  // 2. Playwright Package Check
  console.log(`${colors.cyan}▸ Playwright Package${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  const pkgResults = await checkPlaywrightPackage();
  if (pkgResults.installed) {
    console.log(`  ${OK} Playwright installed (version: ${pkgResults.version})`);
    if (pkgResults.path) {
      console.log(`     Path: ${pkgResults.path}`);
    }
  } else {
    console.log(`  ${FAIL} Playwright not installed`);
    console.log(`     Error: ${pkgResults.error}`);
    console.log(`  ${INFO} Install with: npm install playwright`);
  }
  console.log();

  // 3. Browser Binaries Check
  console.log(`${colors.cyan}▸ Browser Binaries${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  const binResults = checkBrowserBinaries();
  console.log(`  Cache directory: ${binResults.cacheDir}`);
  console.log(`  Cache exists:    ${binResults.cacheDirExists ? 'yes' : 'no'}`);
  for (const browser of ['chromium', 'firefox', 'webkit']) {
    const status = binResults[browser].installed ? OK : FAIL;
    const path = binResults[browser].path ? ` (${binResults[browser].path})` : '';
    console.log(`  ${status} ${browser}${path}`);
  }
  if (!binResults.chromium.installed) {
    console.log(`  ${INFO} Install browsers: npx playwright install`);
    console.log(`  ${INFO} Or just Chromium: npx playwright install chromium`);
  }
  console.log();

  // 4. System Dependencies Check
  console.log(`${colors.cyan}▸ System Dependencies${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  const depsResults = checkSystemDependencies();
  if (depsResults.issues.length === 0) {
    console.log(`  ${OK} No missing system dependencies detected`);
    if (depsResults.notes) {
      console.log(`  ${INFO} ${depsResults.notes}`);
    }
  } else {
    for (const issue of depsResults.issues) {
      console.log(`  ${FAIL} ${issue}`);
    }
    for (const suggestion of depsResults.suggestions) {
      console.log(`  ${INFO} ${suggestion}`);
    }
  }
  console.log();

  // 5. Browser Launch Test (only if package is installed)
  let launchResults = { canLaunch: false };
  let verifyResults = { canVerify: false };

  if (pkgResults.installed) {
    console.log(`${colors.cyan}▸ Browser Launch Test${colors.reset}`);
    console.log(`${'─'.repeat(60)}`);
    launchResults = await testBrowserLaunch();
    if (launchResults.canLaunch) {
      console.log(`  ${OK} Browser launches successfully (${launchResults.timing}ms)`);
      console.log(`     Browser version: ${launchResults.browserVersion}`);
      console.log(`  ${launchResults.canCreatePage ? OK : FAIL} Can create page`);
      console.log(`  ${launchResults.canRenderContent ? OK : FAIL} Can render content`);
    } else {
      console.log(`  ${FAIL} Browser failed to launch`);
      console.log(`     Error: ${launchResults.error}`);
      if (launchResults.diagnosis) {
        console.log(`  ${INFO} Diagnosis: ${launchResults.diagnosis}`);
      }
    }
    console.log();

    // 6. BrowserVerify Module Test
    console.log(`${colors.cyan}▸ BrowserVerify Module Test${colors.reset}`);
    console.log(`${'─'.repeat(60)}`);
    verifyResults = await testBrowserVerifyModule();
    if (verifyResults.canImport) {
      console.log(`  ${OK} BrowserVerify module imports correctly`);
    } else {
      console.log(`  ${FAIL} Failed to import BrowserVerify`);
    }
    if (verifyResults.canVerify) {
      console.log(`  ${OK} CTM verification works (${verifyResults.verificationResult})`);
    } else if (verifyResults.error) {
      console.log(`  ${FAIL} Verification failed: ${verifyResults.error}`);
    }
    console.log();
  }

  // Summary
  console.log(`${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║                        Summary                             ║${colors.reset}`);
  console.log(`${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}`);

  // Determine success based on actual functionality
  const allTestsPassed = pkgResults.installed && launchResults.canLaunch && verifyResults.canVerify;

  if (allTestsPassed) {
    console.log(`\n  ${OK} ${colors.green}Playwright is correctly installed and working!${colors.reset}`);
    console.log(`     Package installed: ${colors.green}yes${colors.reset}`);
    console.log(`     Browser launches:  ${colors.green}yes${colors.reset} (${launchResults.timing}ms)`);
    console.log(`     BrowserVerify:     ${colors.green}${verifyResults.verificationResult}${colors.reset}\n`);
  } else if (pkgResults.installed && launchResults.canLaunch) {
    console.log(`\n  ${WARN} ${colors.yellow}Playwright works but BrowserVerify has issues.${colors.reset}`);
    console.log(`     Package installed: ${colors.green}yes${colors.reset}`);
    console.log(`     Browser launches:  ${colors.green}yes${colors.reset}`);
    console.log(`     BrowserVerify:     ${colors.red}failed${colors.reset}`);
    if (verifyResults.error) {
      console.log(`     Error: ${verifyResults.error}\n`);
    }
  } else if (pkgResults.installed) {
    console.log(`\n  ${FAIL} ${colors.red}Playwright installed but browser won't launch.${colors.reset}`);
    console.log(`     Package installed: ${colors.green}yes${colors.reset}`);
    console.log(`     Browser launches:  ${colors.red}no${colors.reset}`);
    if (launchResults.diagnosis) {
      console.log(`     Diagnosis: ${launchResults.diagnosis}`);
    }
    console.log(`\n  Quick fix commands:`);
    console.log(`    npx playwright install chromium`);
    if (platformInfo.platform === 'linux') {
      console.log(`    npx playwright install-deps`);
    }
    console.log();
  } else {
    console.log(`\n  ${FAIL} ${colors.red}Playwright not installed.${colors.reset}`);
    console.log(`\n  Quick fix commands:`);
    console.log(`    npm install playwright`);
    console.log(`    npx playwright install chromium`);
    if (platformInfo.platform === 'linux') {
      console.log(`    npx playwright install-deps`);
    }
    console.log();
  }
}

// Run diagnostics
runDiagnostics().catch(err => {
  console.error(`${FAIL} Diagnostic failed:`, err.message);
  process.exit(1);
});
