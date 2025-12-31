#!/usr/bin/env bun
/**
 * Bun Build Script for SVG-Matrix Universal Libraries
 *
 * Builds minified browser bundles for:
 * - svg-matrix.min.js (math library)
 * - svg-toolbox.min.js (SVG manipulation)
 * - svgm.min.js (complete library)
 *
 * Usage:
 *   bun run build.js
 *   bun run build.js --watch
 *
 * @module build
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const distDir = "./dist";
const isWatch = process.argv.includes("--watch");
const isDev = process.argv.includes("--dev");

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

console.log("Building SVG-Matrix universal libraries...\n");

// Common build options
const commonOptions = {
  minify: !isDev,
  sourcemap: isDev ? "inline" : "none",
  target: "browser",
  format: "esm",
  define: {
    "process.env.NODE_ENV": isDev ? '"development"' : '"production"',
  },
};

async function build() {
  const startTime = Date.now();

  try {
    // Build 1: SVG-Matrix (math library only)
    const mathResult = await Bun.build({
      ...commonOptions,
      entrypoints: ["./src/svg-matrix-lib.js"],
      outdir: distDir,
      naming: "svg-matrix.min.js",
      external: [], // Bundle everything including decimal.js
    });

    if (!mathResult.success) {
      console.error("svg-matrix build failed:");
      mathResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svg-matrix.min.js");

    // Build 2: SVG-Toolbox (SVG manipulation)
    // Note: This excludes Node.js-only modules for browser compatibility
    const toolboxResult = await Bun.build({
      ...commonOptions,
      entrypoints: ["./src/svg-toolbox-lib.js"],
      outdir: distDir,
      naming: "svg-toolbox.min.js",
      external: ["fs", "path", "jsdom"], // These are Node.js only
    });

    if (!toolboxResult.success) {
      console.error("svg-toolbox build failed:");
      toolboxResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svg-toolbox.min.js");

    // Build 3: SVGM (complete library)
    const svgmResult = await Bun.build({
      ...commonOptions,
      entrypoints: ["./src/svgm-lib.js"],
      outdir: distDir,
      naming: "svgm.min.js",
      external: ["fs", "path", "jsdom"], // These are Node.js only
    });

    if (!svgmResult.success) {
      console.error("svgm build failed:");
      svgmResult.logs.forEach((log) => console.error(log));
      process.exit(1);
    }
    console.log("  svgm.min.js");

    // Get file sizes
    const files = ["svg-matrix.min.js", "svg-toolbox.min.js", "svgm.min.js"];
    console.log("\nBundle sizes:");
    console.log("─".repeat(40));

    for (const file of files) {
      const path = join(distDir, file);
      if (existsSync(path)) {
        const content = readFileSync(path);
        const sizeKB = (content.length / 1024).toFixed(1);
        console.log(`  ${file.padEnd(25)} ${sizeKB} KB`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log("─".repeat(40));
    console.log(`\nBuild completed in ${elapsed}ms`);

    // Generate version file
    const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
    const versionInfo = {
      version: pkg.version,
      buildTime: new Date().toISOString(),
      files: files.map((f) => ({
        name: f,
        size: existsSync(join(distDir, f))
          ? readFileSync(join(distDir, f)).length
          : 0,
      })),
    };
    writeFileSync(
      join(distDir, "version.json"),
      JSON.stringify(versionInfo, null, 2),
    );
    console.log("\nGenerated dist/version.json");
  } catch (error) {
    console.error("Build error:", error);
    process.exit(1);
  }
}

// Run build
await build();

// Watch mode
if (isWatch) {
  console.log("\nWatching for changes...");
  const watcher = Bun.file("./src").watch();
  for await (const _event of watcher) {
    console.log("\nRebuilding...");
    await build();
  }
}
