#!/usr/bin/env bun
/**
 * Bun Build Script for SVG-Matrix Universal Libraries
 *
 * Builds minified browser bundles in two formats:
 *
 * 1. ESM bundles (*.min.js) - For bundlers and Node.js
 *    - Standalone with decimal.js included
 *    - Best for tree-shaking bundlers (webpack, rollup, vite)
 *
 * 2. IIFE bundles (*.global.min.js) - For direct browser use via script tag
 *    - Standalone with decimal.js included
 *    - Exposes globals (SVGMatrixLib, SVGToolbox)
 *
 * Note: Both formats include decimal.js (~54KB minified, ~20KB gzipped) for
 * guaranteed precision. This is by design - decimal.js is essential for
 * the library's correctness guarantees.
 *
 * Usage:
 *   bun run build.js          # Production build
 *   bun run build.js --dev    # Development build (no minify, sourcemaps)
 *   bun run build.js --watch  # Watch mode
 *
 * @module build
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

const distDir = "./dist";
const isWatch = process.argv.includes("--watch");
const isDev = process.argv.includes("--dev");

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

console.log("Building SVG-Matrix universal libraries...\n");
console.log(`Mode: ${isDev ? "development" : "production"}\n`);

// Common build options for ESM (standalone with decimal.js bundled)
const esmOptions = {
  minify: !isDev,
  sourcemap: isDev ? "inline" : "none",
  target: "browser",
  format: "esm",
  define: {
    "process.env.NODE_ENV": isDev ? '"development"' : '"production"',
  },
};

// Common build options for IIFE (expects global Decimal)
const iifeOptions = {
  minify: !isDev,
  sourcemap: isDev ? "inline" : "none",
  target: "browser",
  format: "iife",
  define: {
    "process.env.NODE_ENV": isDev ? '"development"' : '"production"',
  },
};

async function build() {
  const startTime = Date.now();

  try {
    // Read version from package.json
    const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
    const version = pkg.version;

    const esmBanner = `/*! svg-matrix v${version} | MIT License | https://github.com/Emasoft/svg-matrix */`;
    const iifeBanner = `/*! svg-matrix v${version} | MIT License | https://github.com/Emasoft/svg-matrix */`;

    // ========================================================================
    // ESM Builds (standalone, includes decimal.js)
    // ========================================================================
    console.log("Building ESM bundles (standalone)...");

    // Build 1: SVG-Matrix ESM
    const mathEsmResult = await Bun.build({
      ...esmOptions,
      entrypoints: ["./src/svg-matrix-lib.js"],
      outdir: distDir,
      naming: "svg-matrix.min.js",
      external: [],
      banner: esmBanner,
    });

    if (!mathEsmResult.success) {
      console.error("svg-matrix.min.js build failed:");
      mathEsmResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svg-matrix.min.js");

    // Build 2: SVG-Toolbox ESM
    const toolboxEsmResult = await Bun.build({
      ...esmOptions,
      entrypoints: ["./src/svg-toolbox-lib.js"],
      outdir: distDir,
      naming: "svg-toolbox.min.js",
      external: ["fs", "path", "url", "jsdom"],
      banner: esmBanner,
    });

    if (!toolboxEsmResult.success) {
      console.error("svg-toolbox.min.js build failed:");
      toolboxEsmResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svg-toolbox.min.js");

    // Build 3: SVGM ESM
    const svgmEsmResult = await Bun.build({
      ...esmOptions,
      entrypoints: ["./src/svgm-lib.js"],
      outdir: distDir,
      naming: "svgm.min.js",
      external: ["fs", "path", "url", "jsdom"],
      banner: esmBanner,
    });

    if (!svgmEsmResult.success) {
      console.error("svgm.min.js build failed:");
      svgmEsmResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svgm.min.js");

    // ========================================================================
    // IIFE Builds (standalone, includes decimal.js, exposes globals)
    // ========================================================================
    console.log("\nBuilding IIFE bundles (standalone browser globals)...");

    // Build IIFE wrapper for SVG-Matrix
    // Note: decimal.js is bundled (Bun doesn't support externalizing npm packages in IIFE)
    const mathIifeResult = await Bun.build({
      ...iifeOptions,
      entrypoints: ["./src/svg-matrix-lib.js"],
      outdir: distDir,
      naming: "svg-matrix.global.min.js",
      globalName: "SVGMatrixLib",
      banner: iifeBanner,
    });

    if (!mathIifeResult.success) {
      console.error("svg-matrix.global.min.js build failed:");
      mathIifeResult.logs.forEach((log) => console.error(log));
      // Non-fatal for IIFE builds
    } else {
      console.log("  svg-matrix.global.min.js");
    }

    // Build IIFE wrapper for SVG-Toolbox
    // Note: decimal.js is bundled (Bun doesn't support externalizing npm packages in IIFE)
    const toolboxIifeResult = await Bun.build({
      ...iifeOptions,
      entrypoints: ["./src/svg-toolbox-lib.js"],
      outdir: distDir,
      naming: "svg-toolbox.global.min.js",
      external: ["fs", "path", "url", "jsdom"],
      globalName: "SVGToolbox",
      banner: iifeBanner,
    });

    if (!toolboxIifeResult.success) {
      console.error("svg-toolbox.global.min.js build failed:");
      toolboxIifeResult.logs.forEach((log) => console.error(log));
    } else {
      console.log("  svg-toolbox.global.min.js");
    }

    // Note: svgm.global.min.js is NOT built because it uses async imports
    // which are incompatible with IIFE format. Use the ESM bundle instead.
    console.log("  svgm.global.min.js (skipped - use ESM for full library)");

    // ========================================================================
    // Output Summary
    // ========================================================================
    const esmFiles = ["svg-matrix.min.js", "svg-toolbox.min.js", "svgm.min.js"];
    const iifeFiles = [
      "svg-matrix.global.min.js",
      "svg-toolbox.global.min.js",
      "svgm.global.min.js",
    ];
    const allFiles = [...esmFiles, ...iifeFiles];

    console.log("\nBundle sizes:");
    console.log("─".repeat(65));
    console.log("ESM bundles (for bundlers/Node.js):");

    for (const file of esmFiles) {
      const path = join(distDir, file);
      if (existsSync(path)) {
        const content = readFileSync(path);
        const sizeKB = (content.length / 1024).toFixed(1);
        const gzipSize = (gzipSync(content).length / 1024).toFixed(1);
        console.log(`  ${file.padEnd(30)} ${sizeKB.padStart(8)} KB  (${gzipSize} KB gzip)`);
      }
    }

    console.log("\nIIFE bundles (for direct browser use via <script>):");
    for (const file of iifeFiles) {
      const path = join(distDir, file);
      if (existsSync(path)) {
        const content = readFileSync(path);
        const sizeKB = (content.length / 1024).toFixed(1);
        const gzipSize = (gzipSync(content).length / 1024).toFixed(1);
        console.log(`  ${file.padEnd(30)} ${sizeKB.padStart(8)} KB  (${gzipSize} KB gzip)`);
      } else {
        console.log(`  ${file.padEnd(30)} (not built)`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log("─".repeat(65));
    console.log(`\nBuild completed in ${elapsed}ms`);

    // Generate version file
    const versionInfo = {
      version: pkg.version,
      buildTime: new Date().toISOString(),
      bundles: {
        esm: esmFiles.map((f) => {
          const filePath = join(distDir, f);
          const content = existsSync(filePath) ? readFileSync(filePath) : Buffer.from("");
          return {
            name: f,
            size: content.length,
            gzipSize: content.length > 0 ? gzipSync(content).length : 0,
            description: "ESM bundle for bundlers/Node.js (includes decimal.js)",
          };
        }),
        iife: iifeFiles.map((f) => {
          const filePath = join(distDir, f);
          const content = existsSync(filePath) ? readFileSync(filePath) : Buffer.from("");
          return {
            name: f,
            size: content.length,
            gzipSize: content.length > 0 ? gzipSync(content).length : 0,
            description: "IIFE bundle for browsers via <script> (includes decimal.js)",
          };
        }),
      },
    };
    writeFileSync(
      join(distDir, "version.json"),
      JSON.stringify(versionInfo, null, 2),
    );
    console.log("\nGenerated dist/version.json");

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Usage Examples                                                 ║
╠════════════════════════════════════════════════════════════════╣
║  ESM (bundlers/Node.js):                                        ║
║    import { Matrix } from './dist/svg-matrix.min.js';           ║
║                                                                 ║
║  Browser (IIFE via script tag):                                 ║
║    <script src="./dist/svg-matrix.global.min.js"></script>      ║
║    <script>                                                     ║
║      const { Matrix } = SVGMatrixLib;                           ║
║    </script>                                                    ║
║                                                                 ║
║  All bundles include decimal.js for guaranteed precision.       ║
╚════════════════════════════════════════════════════════════════╝
`);
  } catch (error) {
    console.error("Build error:", error);
    process.exit(1);
  }
}

// Run build
await build();

// Watch mode - uses watch() imported at top of file
if (isWatch) {
  console.log("\nWatching for changes in ./src ...");

  watch("./src", { recursive: true }, async (eventType, filename) => {
    if (filename && filename.endsWith(".js")) {
      console.log(`\nFile changed: ${filename}`);
      console.log("Rebuilding...");
      await build();
    }
  });

  process.stdin.resume();
}
