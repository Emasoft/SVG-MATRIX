/**
 * Mesh Gradient Stop Validation Tests
 *
 * Tests that the validator correctly handles the difference between:
 * - Linear/radial gradient stops: require 'offset' attribute (SVG 1.1)
 * - Mesh gradient stops: use 'path' attribute, NOT 'offset' (SVG 2 CR 2016)
 *
 * Reference: https://www.w3.org/TR/2016/CR-SVG2-20160915/pservers.html
 *   "offset - does not apply to mesh gradients"
 *   "path - applies only to mesh gradients"
 */

import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_MATRIX_DIR = path.resolve(__dirname, "..");

// Import svg-toolbox
const toolbox = await import(path.join(SVG_MATRIX_DIR, "src/svg-toolbox.js"));

// Test cases
const testCases = [
  {
    name: "Linear gradient stop WITHOUT offset should be flagged",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg1">
          <stop style="stop-color:red"/>
        </linearGradient>
      </defs>
    </svg>`,
    expectError: true,
    errorType: "missing_required_attribute",
    errorAttr: "offset",
  },
  {
    name: "Linear gradient stop WITH offset should pass",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg1">
          <stop offset="0%" style="stop-color:red"/>
          <stop offset="100%" style="stop-color:blue"/>
        </linearGradient>
      </defs>
    </svg>`,
    expectError: false,
  },
  {
    name: "Radial gradient stop WITHOUT offset should be flagged",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rg1">
          <stop style="stop-color:red"/>
        </radialGradient>
      </defs>
    </svg>`,
    expectError: true,
    errorType: "missing_required_attribute",
    errorAttr: "offset",
  },
  {
    name: "Mesh gradient stop WITH path (no offset) should pass",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <meshgradient id="mg1" x="0" y="0">
          <meshrow>
            <meshpatch>
              <stop path="c 10,0 20,0 30,0" style="stop-color:red"/>
              <stop path="c 0,10 0,20 0,30" style="stop-color:blue"/>
              <stop path="c -10,0 -20,0 -30,0" style="stop-color:green"/>
              <stop path="c 0,-10 0,-20 0,-30" style="stop-color:yellow"/>
            </meshpatch>
          </meshrow>
        </meshgradient>
      </defs>
    </svg>`,
    expectError: false,
  },
  {
    name: "Mesh gradient stop with L path command should pass",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <meshgradient id="mg2" x="0" y="0">
          <meshrow>
            <meshpatch>
              <stop path="L 100 0" style="stop-color:red"/>
              <stop path="L 100 100" style="stop-color:blue"/>
              <stop path="L 0 100" style="stop-color:green"/>
              <stop path="L 0 0" style="stop-color:yellow"/>
            </meshpatch>
          </meshrow>
        </meshgradient>
      </defs>
    </svg>`,
    expectError: false,
  },
  {
    name: "Deeply nested mesh stop (meshgradient > meshrow > meshpatch > stop) should pass",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <meshgradient id="mg3" x="50" y="50">
          <meshrow>
            <meshpatch>
              <stop path="c 14.8,0 29.7,0 44.5,0" style="stop-color:#fff"/>
              <stop path="c 0,14.0 0,28.1 0,42.2" style="stop-color:#fc0"/>
              <stop path="c -14.8,0 -29.7,0 -44.5,0" style="stop-color:#fff"/>
              <stop path="c 0,-14.0 0,-28.1 0,-42.2" style="stop-color:#fc0"/>
            </meshpatch>
          </meshrow>
        </meshgradient>
      </defs>
    </svg>`,
    expectError: false,
  },
  {
    name: "Mixed gradients: linear needs offset, mesh does not",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg">
          <stop offset="0%" style="stop-color:red"/>
          <stop offset="100%" style="stop-color:blue"/>
        </linearGradient>
        <meshgradient id="mg" x="0" y="0">
          <meshrow>
            <meshpatch>
              <stop path="c 10,0 20,0 30,0" style="stop-color:red"/>
              <stop path="c 0,10 0,20 0,30" style="stop-color:blue"/>
            </meshpatch>
          </meshrow>
        </meshgradient>
      </defs>
    </svg>`,
    expectError: false,
  },
];

// Run tests
console.log("=== Mesh Gradient Stop Validation Tests ===\n");
console.log("Reference: SVG 2 CR 2016 - https://www.w3.org/TR/2016/CR-SVG2-20160915/pservers.html");
console.log('  "offset - does not apply to mesh gradients"');
console.log('  "path - applies only to mesh gradients"\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  try {
    const result = await toolbox.validateSVGAsync(test.svg);
    const issues = result.issues || [];

    // Find missing_required_attribute errors for 'offset' on 'stop'
    const offsetErrors = issues.filter(
      (i) => i.type === "missing_required_attribute" && i.element === "stop" && i.attr === "offset",
    );

    const hasError = offsetErrors.length > 0;

    if (test.expectError && hasError) {
      console.log(`  ✓ ${test.name}`);
      passed++;
    } else if (!test.expectError && !hasError) {
      console.log(`  ✓ ${test.name}`);
      passed++;
    } else if (test.expectError && !hasError) {
      console.log(`  ✗ ${test.name}`);
      console.log(`    Expected error for missing offset, but none found`);
      failed++;
    } else {
      console.log(`  ✗ ${test.name}`);
      console.log(`    Unexpected error: ${offsetErrors.map((e) => e.reason).join(", ")}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ ${test.name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

process.exit(failed > 0 ? 1 : 0);
