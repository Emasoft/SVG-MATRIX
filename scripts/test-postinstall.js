#!/usr/bin/env node
/**
 * Test script for postinstall.js Unicode and ASCII fallback support.
 * This tests various terminal environment configurations to ensure
 * proper rendering of box characters.
 */

import { spawn } from "child_process";

console.log("\n=== Testing postinstall.js Unicode/ASCII support ===\n");

const tests = [
  {
    name: "Unicode mode (UTF-8 locale)",
    env: { LANG: "en_US.UTF-8" },
    expectUnicode: true,
  },
  {
    name: "ASCII fallback (C locale)",
    env: { LANG: "C" },
    expectUnicode: false,
  },
  {
    name: "UTF-8 in LC_CTYPE",
    env: { LC_CTYPE: "en_US.UTF-8", LANG: "" },
    expectUnicode: true,
  },
];

let passed = 0;
let failed = 0;

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`▸ Testing: ${test.name}`);

    // Prepare environment
    const env = { ...process.env, ...test.env };

    const child = spawn("node", ["scripts/postinstall.js"], {
      env,
      stdio: "pipe",
    });

    let output = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", () => {
      // Check for Unicode or ASCII box characters
      const hasUnicodeBox = /[╭╮╰╯─│]/.test(output);
      const hasAsciiBox = /[+\-|]/.test(output);

      if (test.expectUnicode && hasUnicodeBox) {
        console.log(`  ✓ PASS: Unicode box characters detected\n`);
        resolve(true);
      } else if (!test.expectUnicode && hasAsciiBox && !hasUnicodeBox) {
        console.log(`  ✓ PASS: ASCII fallback characters detected\n`);
        resolve(true);
      } else {
        console.log(
          `  ✗ FAIL: Expected ${test.expectUnicode ? "Unicode" : "ASCII"} but got different output\n`,
        );
        resolve(false);
      }
    });

    child.on("error", (error) => {
      console.log(`  ✗ FAIL: ${error.message}\n`);
      resolve(false);
    });
  });
}

async function runAllTests() {
  for (const test of tests) {
    const result = await runTest(test);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log("=== Test Results ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
