#!/usr/bin/env node
/**
 * @fileoverview Version synchronization script for @emasoft/svg-matrix
 * Ensures all version references in the codebase match package.json.
 *
 * This script:
 * 1. Reads the canonical version from package.json
 * 2. Updates src/index.js (VERSION constant and @version jsdoc)
 * 3. Can optionally update package-lock.json
 * 4. Validates that all versions are in sync
 *
 * Usage:
 *   node scripts/version-sync.js          # Sync versions
 *   node scripts/version-sync.js --check  # Check only (exit 1 if mismatch)
 *   node scripts/version-sync.js --help   # Show help
 *
 * @module scripts/version-sync
 * @license MIT
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ANSI colors for output
const colors =
  process.env.NO_COLOR !== undefined
    ? {
        reset: "",
        red: "",
        green: "",
        yellow: "",
        cyan: "",
        dim: "",
        bright: "",
      }
    : {
        reset: "\x1b[0m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        cyan: "\x1b[36m",
        dim: "\x1b[2m",
        bright: "\x1b[1m",
      };

/**
 * Read the canonical version from package.json
 * @returns {string} Version string
 */
function getPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

/**
 * Get version from src/index.js VERSION constant
 * @returns {string|null} Version string or null if not found
 */
function getIndexVersion() {
  const content = readFileSync(join(ROOT, "src", "index.js"), "utf8");
  const match = content.match(/export const VERSION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Get @version from src/index.js jsdoc
 * @returns {string|null} Version string or null if not found
 */
function getIndexJsDocVersion() {
  const content = readFileSync(join(ROOT, "src", "index.js"), "utf8");
  const match = content.match(/@version\s+(\S+)/);
  return match ? match[1] : null;
}

/**
 * Get version from a library entry point file
 * @param {string} filename - Filename relative to src/
 * @returns {string|null} Version string or null if not found
 */
function getLibVersion(filename) {
  try {
    const content = readFileSync(join(ROOT, "src", filename), "utf8");
    const match = content.match(/export const VERSION = ['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Update a library entry point file's VERSION constant and @version jsdoc
 * @param {string} filename - Filename relative to src/
 * @param {string} version - New version
 * @returns {boolean} True if updated
 */
function updateLibVersion(filename, version) {
  const filePath = join(ROOT, "src", filename);
  try {
    let content = readFileSync(filePath, "utf8");
    const original = content;

    // Update VERSION constant
    content = content.replace(
      /export const VERSION = ['"][^'"]+['"]/,
      `export const VERSION = "${version}"`,
    );

    // Update @version in jsdoc
    content = content.replace(/@version\s+\S+/, `@version ${version}`);

    if (content !== original) {
      writeFileSync(filePath, content, "utf8");
      return true;
    }
  } catch {
    // File might not exist
  }
  return false;
}

/**
 * Get version from package-lock.json root
 * @returns {string|null} Version string or null if not found
 */
function getLockfileVersion() {
  try {
    const lock = JSON.parse(
      readFileSync(join(ROOT, "package-lock.json"), "utf8"),
    );
    return lock.version;
  } catch {
    return null;
  }
}

/**
 * Update src/index.js VERSION constant
 * @param {string} version - New version
 * @returns {boolean} True if updated
 */
function updateIndexVersion(version) {
  const filePath = join(ROOT, "src", "index.js");
  let content = readFileSync(filePath, "utf8");
  const original = content;

  // Update VERSION constant
  content = content.replace(
    /export const VERSION = ['"][^'"]+['"]/,
    `export const VERSION = '${version}'`,
  );

  // Update @version in jsdoc
  content = content.replace(/@version\s+\S+/, `@version ${version}`);

  if (content !== original) {
    writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

/**
 * Update package-lock.json version
 * @param {string} version - New version
 * @returns {boolean} True if updated
 */
function updateLockfileVersion(version) {
  const filePath = join(ROOT, "package-lock.json");
  try {
    const lock = JSON.parse(readFileSync(filePath, "utf8"));
    const original = JSON.stringify(lock);

    lock.version = version;
    if (lock.packages && lock.packages[""]) {
      lock.packages[""].version = version;
    }

    const updated = JSON.stringify(lock, null, 2) + "\n";
    if (updated !== original) {
      writeFileSync(filePath, updated, "utf8");
      return true;
    }
  } catch {
    // Lockfile might not exist
  }
  return false;
}

// Library entry points to sync (relative to src/)
const LIB_ENTRY_POINTS = [
  "svg-matrix-lib.js",
  "svg-toolbox-lib.js",
  "svgm-lib.js",
];

/**
 * Check if all versions are in sync
 * @returns {{inSync: boolean, versions: Object}}
 */
function checkVersions() {
  const pkgVersion = getPackageVersion();
  const indexVersion = getIndexVersion();
  const jsDocVersion = getIndexJsDocVersion();
  const lockVersion = getLockfileVersion();

  const versions = {
    "package.json": pkgVersion,
    "src/index.js (VERSION)": indexVersion,
    "src/index.js (@version)": jsDocVersion,
    "package-lock.json": lockVersion,
  };

  // WHY: Check VERSION constants in all library entry points
  let allLibsInSync = true;
  for (const lib of LIB_ENTRY_POINTS) {
    const libVersion = getLibVersion(lib);
    versions[`src/${lib}`] = libVersion;
    if (libVersion !== null && libVersion !== pkgVersion) {
      allLibsInSync = false;
    }
  }

  const inSync =
    indexVersion === pkgVersion &&
    jsDocVersion === pkgVersion &&
    (lockVersion === null || lockVersion === pkgVersion) &&
    allLibsInSync;

  return { inSync, versions, canonical: pkgVersion };
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${colors.bright}version-sync.js${colors.reset} - Synchronize version numbers across the codebase

${colors.cyan}Usage:${colors.reset}
  node scripts/version-sync.js          Sync all versions to package.json
  node scripts/version-sync.js --check  Check only (exit 1 if mismatch)
  node scripts/version-sync.js --help   Show this help

${colors.cyan}Files updated:${colors.reset}
  - src/index.js (VERSION constant and @version jsdoc)
  - src/svg-matrix-lib.js (VERSION constant and @version jsdoc)
  - src/svg-toolbox-lib.js (VERSION constant and @version jsdoc)
  - src/svgm-lib.js (VERSION constant and @version jsdoc)
  - package-lock.json (if present)
`);
    process.exit(0);
  }

  const checkOnly = args.includes("--check");
  const { inSync, versions, canonical } = checkVersions();

  console.log(`${colors.bright}Version Check${colors.reset}`);
  console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}`);

  for (const [file, version] of Object.entries(versions)) {
    const status =
      version === canonical
        ? `${colors.green}OK${colors.reset}`
        : version === null
          ? `${colors.yellow}N/A${colors.reset}`
          : `${colors.red}MISMATCH${colors.reset}`;
    console.log(
      `  ${file.padEnd(30)} ${(version || "N/A").padEnd(12)} ${status}`,
    );
  }

  console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}`);
  console.log(`  Canonical version: ${colors.cyan}${canonical}${colors.reset}`);

  if (inSync) {
    console.log(`\n${colors.green}All versions are in sync.${colors.reset}`);
    process.exit(0);
  }

  if (checkOnly) {
    console.log(`\n${colors.red}Version mismatch detected!${colors.reset}`);
    console.log(
      `Run ${colors.cyan}node scripts/version-sync.js${colors.reset} to fix.`,
    );
    process.exit(1);
  }

  // Sync versions
  console.log(`\n${colors.yellow}Syncing versions...${colors.reset}`);

  let updated = 0;
  if (updateIndexVersion(canonical)) {
    console.log(`  ${colors.green}Updated${colors.reset} src/index.js`);
    updated++;
  }
  if (updateLockfileVersion(canonical)) {
    console.log(`  ${colors.green}Updated${colors.reset} package-lock.json`);
    updated++;
  }

  // WHY: Sync VERSION constants in all library entry points
  for (const lib of LIB_ENTRY_POINTS) {
    if (updateLibVersion(lib, canonical)) {
      console.log(`  ${colors.green}Updated${colors.reset} src/${lib}`);
      updated++;
    }
  }

  if (updated > 0) {
    console.log(
      `\n${colors.green}Synced ${updated} file(s) to version ${canonical}${colors.reset}`,
    );
  } else {
    console.log(`\n${colors.green}All files already in sync.${colors.reset}`);
  }
}

main();
