/**
 * Convert to Plain SVG Tests
 *
 * Tests the convertToPlainSVG function that strips Inkscape-specific content
 * while preserving standard SVG 2 features like mesh gradients and hatches.
 */

import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_MATRIX_DIR = path.resolve(__dirname, "..");

// Import svg-toolbox
const toolbox = await import(path.join(SVG_MATRIX_DIR, "src/svg-toolbox.js"));
const { parseSVG, serializeSVG } = await import(
  path.join(SVG_MATRIX_DIR, "src/svg-parser.js")
);

// Test cases
const testCases = [
  {
    name: "Remove sodipodi:namedview element",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
      <sodipodi:namedview pagecolor="#ffffff" bordercolor="#666666"/>
      <rect width="100" height="100"/>
    </svg>`,
    expectRemoved: ["sodipodi:namedview"],
    expectPresent: ["rect"],
  },
  {
    name: "Remove inkscape:* attributes from elements",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <g inkscape:groupmode="layer" inkscape:label="Layer 1" id="layer1">
        <rect width="100" height="100"/>
      </g>
    </svg>`,
    expectNoAttribute: ["inkscape:groupmode", "inkscape:label"],
    expectAttribute: ["id"],
    expectPresent: ["g", "rect"],
  },
  {
    name: "Remove sodipodi:guide elements",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
      <sodipodi:namedview>
        <sodipodi:guide position="100,0" orientation="0,1"/>
        <sodipodi:guide position="0,100" orientation="1,0"/>
      </sodipodi:namedview>
      <rect width="100" height="100"/>
    </svg>`,
    expectRemoved: ["sodipodi:guide", "sodipodi:namedview"],
    expectPresent: ["rect"],
  },
  {
    name: "Remove inkscape:path-effect elements",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
      <defs>
        <inkscape:path-effect effect="spiro" id="path-effect1"/>
      </defs>
      <path d="M0,0 L100,100"/>
    </svg>`,
    expectRemoved: ["inkscape:path-effect"],
    expectPresent: ["path"],
  },
  {
    name: "Preserve mesh gradients (SVG 2 feature)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <meshgradient id="mg1" x="0" y="0">
          <meshrow>
            <meshpatch>
              <stop path="c 10,0 20,0 30,0" style="stop-color:red"/>
              <stop path="c 0,10 0,20 0,30" style="stop-color:blue"/>
            </meshpatch>
          </meshrow>
        </meshgradient>
      </defs>
      <rect fill="url(#mg1)" width="100" height="100"/>
    </svg>`,
    expectPresent: ["meshgradient", "meshrow", "meshpatch", "stop"],
  },
  {
    name: "Preserve hatch elements (SVG 2 feature)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <hatch id="h1" hatchUnits="userSpaceOnUse">
          <hatchpath d="M0,0 l10,10"/>
        </hatch>
      </defs>
      <rect fill="url(#h1)" width="100" height="100"/>
    </svg>`,
    expectPresent: ["hatch", "hatchpath", "rect"],
  },
  {
    name: "Remove SVG 1.2 flowText elements",
    svg: `<svg xmlns="http://www.w3.org/2000/svg">
      <flowRoot>
        <flowRegion><rect width="100" height="100"/></flowRegion>
        <flowPara>Hello World</flowPara>
      </flowRoot>
      <text x="10" y="10">Keep this text</text>
    </svg>`,
    expectRemoved: ["flowRoot", "flowRegion", "flowPara"],
    expectPresent: ["text"],
  },
  {
    name: "Remove namespace declarations",
    svg: `<svg xmlns="http://www.w3.org/2000/svg"
          xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
          xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
      <rect width="100" height="100"/>
    </svg>`,
    expectNoAttribute: ["xmlns:inkscape", "xmlns:sodipodi"],
    expectAttribute: ["xmlns"],
    expectPresent: ["rect"],
  },
  {
    name: "Mixed content: remove Inkscape, preserve standard SVG",
    svg: `<svg xmlns="http://www.w3.org/2000/svg"
          xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
          xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
          inkscape:version="1.3">
      <sodipodi:namedview pagecolor="#ffffff"/>
      <defs>
        <linearGradient id="lg1">
          <stop offset="0%" style="stop-color:red"/>
          <stop offset="100%" style="stop-color:blue"/>
        </linearGradient>
        <inkscape:path-effect effect="powerstroke" id="pe1"/>
      </defs>
      <g inkscape:groupmode="layer" inkscape:label="Layer 1" id="layer1">
        <rect fill="url(#lg1)" width="100" height="100"/>
      </g>
    </svg>`,
    expectRemoved: ["sodipodi:namedview", "inkscape:path-effect"],
    expectNoAttribute: [
      "inkscape:version",
      "inkscape:groupmode",
      "inkscape:label",
      "xmlns:inkscape",
      "xmlns:sodipodi",
    ],
    expectPresent: ["linearGradient", "stop", "rect", "g"],
    expectAttribute: ["id", "fill"],
  },
];

// Run tests
console.log("=== Convert to Plain SVG Tests ===\n");

let passed = 0;
let failed = 0;

for (const test of testCases) {
  try {
    const doc = parseSVG(test.svg);

    // Debug: Check what we got before conversion
    // console.log(`\n--- ${test.name} ---`);
    // console.log("Before:", serializeSVG(doc).substring(0, 200));

    // Call the function - it returns a Promise because of createOperation wrapper
    const resultDoc = await toolbox.convertToPlainSVG(doc, { removeFlowText: true });

    // The result might be a string or a document
    const result = typeof resultDoc === 'string' ? resultDoc : serializeSVG(resultDoc);

    // Debug: Check what we got after conversion
    // console.log("After:", result.substring(0, 200));

    const errors = [];

    // Check elements that should be removed
    if (test.expectRemoved) {
      for (const el of test.expectRemoved) {
        const regex = new RegExp(`<${el}[\\s>]`, "i");
        if (regex.test(result)) {
          errors.push(`Expected <${el}> to be removed, but it's still present`);
        }
      }
    }

    // Check elements that should be present
    if (test.expectPresent) {
      for (const el of test.expectPresent) {
        const regex = new RegExp(`<${el}[\\s>]`, "i");
        if (!regex.test(result)) {
          errors.push(`Expected <${el}> to be present, but it's missing`);
        }
      }
    }

    // Check attributes that should be removed
    if (test.expectNoAttribute) {
      for (const attr of test.expectNoAttribute) {
        const regex = new RegExp(`${attr}\\s*=`, "i");
        if (regex.test(result)) {
          errors.push(`Expected ${attr} attribute to be removed`);
        }
      }
    }

    // Check attributes that should be present
    if (test.expectAttribute) {
      for (const attr of test.expectAttribute) {
        const regex = new RegExp(`${attr}\\s*=`, "i");
        if (!regex.test(result)) {
          errors.push(`Expected ${attr} attribute to be present`);
        }
      }
    }

    if (errors.length === 0) {
      console.log(`  ✓ ${test.name}`);
      passed++;
    } else {
      console.log(`  ✗ ${test.name}`);
      for (const err of errors) {
        console.log(`    - ${err}`);
      }
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
