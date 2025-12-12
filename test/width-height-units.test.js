/**
 * Test that width/height with CSS units are preserved, not stripped
 */

import {
  cleanupNumericValues,
  removeViewBox,
  validateSVG,
} from "../src/svg-toolbox.js";

// Test 1: cleanupNumericValues should preserve CSS units
console.log("Test 1: cleanupNumericValues preserves CSS units");
const svg1 = `<svg width="100%" height="50vh" viewBox="0 0 100 100">
  <rect width="80%" height="20em" x="10" y="10"/>
</svg>`;

const result1 = await cleanupNumericValues(svg1, { precision: 6 });

console.log("Input:", svg1);
console.log("Output:", result1);

// Check that units are preserved
if (!result1.includes('width="100%"')) {
  console.error("FAIL: Root width='100%' was stripped!");
  process.exit(1);
}
if (!result1.includes('height="50vh"')) {
  console.error("FAIL: Root height='50vh' was stripped!");
  process.exit(1);
}
if (!result1.includes('width="80%"')) {
  console.error("FAIL: Rect width='80%' was stripped!");
  process.exit(1);
}
if (!result1.includes('height="20em"')) {
  console.error("FAIL: Rect height='20em' was stripped!");
  process.exit(1);
}
console.log("PASS: All CSS units preserved\n");

// Test 2: removeViewBox should skip when dimensions have units
console.log("Test 2: removeViewBox skips when dimensions have units");
const svg2 = `<svg width="100%" height="100%" viewBox="0 0 100 100"></svg>`;
const result2 = await removeViewBox(svg2);

console.log("Input:", svg2);
console.log("Output:", result2);

if (!result2.includes('viewBox="0 0 100 100"')) {
  console.error("FAIL: viewBox was removed even though dimensions have units!");
  process.exit(1);
}
console.log("PASS: viewBox preserved with unit dimensions\n");

// Test 3: removeViewBox should work normally with numeric dimensions
console.log("Test 3: removeViewBox works with numeric dimensions");
const svg3 = `<svg width="100" height="100" viewBox="0 0 100 100"></svg>`;
const result3 = await removeViewBox(svg3);

console.log("Input:", svg3);
console.log("Output:", result3);

if (result3.includes("viewBox")) {
  console.error("FAIL: viewBox should be removed when it matches numeric dimensions!");
  process.exit(1);
}
console.log("PASS: viewBox removed with matching numeric dimensions\n");

// Test 4: validateSVG should not error on rect with unit dimensions
console.log("Test 4: validateSVG accepts rect with CSS units");
const svg4 = `<svg><rect width="100%" height="50vh" x="0" y="0"/></svg>`;
const result4 = await validateSVG(svg4);

console.log("Input:", svg4);
console.log("Output:", result4);

// Extract validation data from the data-svg-validation attribute
if (result4.includes('data-validation-status="valid"')) {
  console.log("PASS: SVG with unit dimensions is valid\n");
} else {
  console.error("FAIL: SVG with unit dimensions should be valid!");
  console.error("Result:", result4);
  process.exit(1);
}

// Test 5: All CSS unit types should be preserved
console.log("Test 5: All CSS unit types preserved");
const unitTypes = ["px", "pt", "cm", "mm", "in", "pc", "em", "rem", "ex", "ch", "vw", "vh", "vmin", "vmax", "%", "Q"];
let allPassed = true;

for (const unit of unitTypes) {
  const svgUnit = `<svg width="100${unit}" height="50${unit}"></svg>`;
  const resultUnit = await cleanupNumericValues(svgUnit, { precision: 6 });

  if (!resultUnit.includes(`100${unit}`) || !resultUnit.includes(`50${unit}`)) {
    console.error(`FAIL: Unit '${unit}' was not preserved!`);
    console.error(`  Input: ${svgUnit}`);
    console.error(`  Output: ${resultUnit}`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log(`PASS: All ${unitTypes.length} CSS unit types preserved\n`);
} else {
  process.exit(1);
}

console.log("All tests passed!");
