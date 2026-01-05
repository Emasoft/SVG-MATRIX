/**
 * Fuzz Testing for SVG Path Parsing
 *
 * Tests the robustness of parsePath() against malformed, random, and edge-case inputs.
 * The parser should NEVER crash - it should either return valid parsed data or empty array.
 */

import { parsePath, serializePath } from "../src/convert-path-data.js";

const COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Test helper - ensures parser doesn't crash and returns array
 */
function testNocrash(description, input) {
  try {
    const result = parsePath(input);
    if (!Array.isArray(result)) {
      failed++;
      failures.push({ description, input, error: "Result is not an array" });
      return false;
    }
    passed++;
    return true;
  } catch (e) {
    failed++;
    failures.push({ description, input, error: e.message });
    return false;
  }
}

/**
 * Test helper - expects specific result
 */
function testExpect(description, input, expectedLength) {
  try {
    const result = parsePath(input);
    if (!Array.isArray(result)) {
      failed++;
      failures.push({ description, input, error: "Result is not an array" });
      return false;
    }
    if (result.length !== expectedLength) {
      failed++;
      failures.push({
        description,
        input,
        error: `Expected ${expectedLength} commands, got ${result.length}`,
      });
      return false;
    }
    passed++;
    return true;
  } catch (e) {
    failed++;
    failures.push({ description, input, error: e.message });
    return false;
  }
}

/**
 * Generate random number string
 */
function randomNum() {
  const sign = Math.random() > 0.5 ? "" : "-";
  const intPart = Math.floor(Math.random() * 1000);
  const decPart = Math.random() > 0.5 ? `.${Math.floor(Math.random() * 1000)}` : "";
  const expPart = Math.random() > 0.9 ? `e${Math.random() > 0.5 ? "+" : "-"}${Math.floor(Math.random() * 10)}` : "";
  return `${sign}${intPart}${decPart}${expPart}`;
}

/**
 * Generate random path command
 */
function randomCommand() {
  const commands = "MmLlHhVvCcSsQqTtAaZz";
  return commands[Math.floor(Math.random() * commands.length)];
}

/**
 * Generate random garbage string
 */
function randomGarbage(len) {
  const chars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~\\\n\t\r ";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

console.log("=".repeat(70));
console.log("SVG Path Parser Fuzz Tests");
console.log("=".repeat(70));
console.log();

// ============================================================================
// Test Category 1: Null/Empty/Undefined inputs
// ============================================================================
console.log(`${COLORS.cyan}=== Category 1: Null/Empty/Undefined Inputs ===${COLORS.reset}`);

testExpect("null input", null, 0);
testExpect("undefined input", undefined, 0);
testExpect("empty string", "", 0);
testExpect("whitespace only", "   \t\n\r  ", 0);
testExpect("number (not string)", 123, 0);
testExpect("object (not string)", {}, 0);
testExpect("array (not string)", [], 0);
testExpect("boolean true", true, 0);
testExpect("boolean false", false, 0);

// ============================================================================
// Test Category 2: Valid simple paths
// ============================================================================
console.log(`${COLORS.cyan}=== Category 2: Valid Simple Paths ===${COLORS.reset}`);

testExpect("simple move", "M0,0", 1);
testExpect("move and line", "M0,0 L10,10", 2);
testExpect("move, line, close", "M0,0 L10,10 Z", 3);
testExpect("relative commands", "m0,0 l10,10 z", 3);
testExpect("horizontal line", "M0,0 H10", 2);
testExpect("vertical line", "M0,0 V10", 2);
testExpect("cubic bezier", "M0,0 C10,10 20,20 30,30", 2);
testExpect("quadratic bezier", "M0,0 Q10,10 20,20", 2);
testExpect("smooth cubic", "M0,0 S10,10 20,20", 2);
testExpect("smooth quadratic", "M0,0 T10,10", 2);
testExpect("arc command", "M0,0 A10,10 0 0,1 20,20", 2);

// ============================================================================
// Test Category 3: Malformed paths (should not crash)
// ============================================================================
console.log(`${COLORS.cyan}=== Category 3: Malformed Paths ===${COLORS.reset}`);

testNocrash("command without numbers", "M");
testNocrash("command with partial args", "M10");
testNocrash("multiple commands no args", "MLCQAZ");
testNocrash("just numbers no command", "10,20,30,40");
testNocrash("numbers before command", "10,20 M30,40");
testNocrash("invalid command letter", "X10,10");
testNocrash("mixed invalid commands", "M0,0 X10 Y20 Z");
testNocrash("incomplete arc", "M0,0 A10,10");
testNocrash("arc with wrong flag values", "M0,0 A10,10 0 2,3 20,20");
testNocrash("arc with negative flags", "M0,0 A10,10 0 -1,-1 20,20");
testNocrash("command case mixed", "m0,0L10,10z");
testNocrash("double decimal points", "M0..5,1..2");
testNocrash("missing comma", "M10 20 L30 40");
testNocrash("extra commas", "M10,,20 L30,,,40");
testNocrash("trailing comma", "M10,20,");
testNocrash("leading comma", ",M10,20");

// ============================================================================
// Test Category 4: Edge case numbers
// ============================================================================
console.log(`${COLORS.cyan}=== Category 4: Edge Case Numbers ===${COLORS.reset}`);

testNocrash("very large numbers", "M1e308,1e308 L1e308,1e308");
testNocrash("very small numbers", "M1e-308,1e-308 L1e-308,1e-308");
testNocrash("negative zero", "M-0,-0 L-0,-0");
testNocrash("infinity string", "M Infinity,Infinity");
testNocrash("NaN string", "M NaN,NaN");
testNocrash("hex numbers", "M0x10,0x20");
testNocrash("octal numbers", "M010,020");
testNocrash("binary numbers", "M0b10,0b11");
testNocrash("mixed exponents", "M1e+10,1E-10 L1e10,1E10");
testNocrash("decimal only", "M.5,.5 L.1,.1");
testNocrash("negative decimals", "M-.5,-.5 L-.1,-.1");

// ============================================================================
// Test Category 5: Special characters and unicode
// ============================================================================
console.log(`${COLORS.cyan}=== Category 5: Special Characters ===${COLORS.reset}`);

testNocrash("newlines in path", "M0,0\nL10,10\nZ");
testNocrash("tabs in path", "M0,0\tL10,10\tZ");
testNocrash("carriage returns", "M0,0\r\nL10,10\r\nZ");
testNocrash("unicode spaces", "M0,0\u00A0L10,10");
testNocrash("null character", "M0,0\0L10,10");
testNocrash("unicode numbers", "M\u0030,\u0031 L\u0032,\u0033");
testNocrash("emoji in path", "M0,0 L10😀10");
testNocrash("chinese characters", "M0,0 L十,二十");
testNocrash("arabic numerals", "M٠,١ L٢,٣");
testNocrash("html entities", "M&lt;,&gt;");
testNocrash("backslash sequences", "M0\\,0 L10\\n10");

// ============================================================================
// Test Category 6: Arc command edge cases
// ============================================================================
console.log(`${COLORS.cyan}=== Category 6: Arc Command Edge Cases ===${COLORS.reset}`);

testNocrash("arc zero radii", "M0,0 A0,0 0 0,0 10,10");
testNocrash("arc negative radii", "M0,0 A-10,-10 0 0,0 10,10");
testNocrash("arc large rotation", "M0,0 A10,10 720 0,0 10,10");
testNocrash("arc negative rotation", "M0,0 A10,10 -45 0,0 10,10");
testNocrash("arc same start/end", "M0,0 A10,10 0 0,0 0,0");
testNocrash("multiple arcs", "M0,0 A10,10 0 0,0 10,10 A10,10 0 1,1 20,20");
testNocrash("arc flags run together", "M0,0 A10 10 0 01 20,20");
testNocrash("arc all params negative", "M0,0 A-10,-10 -45 0,0 -20,-20");

// ============================================================================
// Test Category 7: Repeated/chained commands
// ============================================================================
console.log(`${COLORS.cyan}=== Category 7: Repeated Commands ===${COLORS.reset}`);

testNocrash("many moves", "M0,0 M10,10 M20,20 M30,30 M40,40");
testNocrash("implicit lineto after M", "M0,0 10,10 20,20 30,30");
testNocrash("many Z commands", "M0,0 L10,10 Z Z Z Z Z");
testNocrash("alternating Z and M", "M0,0 Z M10,10 Z M20,20 Z");
testNocrash("1000 moves", Array(1000).fill("M0,0").join(" "));
testNocrash("deeply nested path", "M0,0" + " L1,1".repeat(500) + " Z");

// ============================================================================
// Test Category 8: Random fuzz testing
// ============================================================================
console.log(`${COLORS.cyan}=== Category 8: Random Fuzz (100 iterations) ===${COLORS.reset}`);

for (let i = 0; i < 100; i++) {
  // Random valid-ish path
  let path = "";
  const cmdCount = Math.floor(Math.random() * 20) + 1;
  for (let j = 0; j < cmdCount; j++) {
    path += randomCommand();
    const argCount = Math.floor(Math.random() * 10);
    for (let k = 0; k < argCount; k++) {
      path += (k > 0 ? "," : "") + randomNum();
    }
    path += " ";
  }
  testNocrash(`random path ${i + 1}`, path);
}

// ============================================================================
// Test Category 9: Random garbage testing
// ============================================================================
console.log(`${COLORS.cyan}=== Category 9: Random Garbage (50 iterations) ===${COLORS.reset}`);

for (let i = 0; i < 50; i++) {
  const garbage = randomGarbage(Math.floor(Math.random() * 200) + 10);
  testNocrash(`random garbage ${i + 1}`, garbage);
}

// ============================================================================
// Test Category 10: Round-trip stability
// ============================================================================
console.log(`${COLORS.cyan}=== Category 10: Round-Trip Stability ===${COLORS.reset}`);

const roundTripPaths = [
  "M0,0 L10,10 Z",
  "M0,0 C10,0 10,10 0,10 Z",
  "M0,0 Q5,10 10,0 Z",
  "M0,0 A10,10 0 0,1 20,0 Z",
  "M0,0 H10 V10 H0 Z",
  "m0,0 l10,10 z",
  "M100,100 L200,100 L200,200 L100,200 Z",
];

for (const path of roundTripPaths) {
  try {
    const parsed1 = parsePath(path);
    const serialized = serializePath(parsed1);
    const parsed2 = parsePath(serialized);

    if (parsed1.length !== parsed2.length) {
      failed++;
      failures.push({
        description: `Round-trip: ${path.slice(0, 30)}...`,
        input: path,
        error: `Command count changed: ${parsed1.length} -> ${parsed2.length}`,
      });
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    failures.push({
      description: `Round-trip: ${path.slice(0, 30)}...`,
      input: path,
      error: e.message,
    });
  }
}

// ============================================================================
// Results
// ============================================================================
console.log();
console.log("=".repeat(70));
console.log("FUZZ TEST RESULTS");
console.log("=".repeat(70));
console.log();

if (failures.length > 0) {
  console.log(`${COLORS.red}Failures:${COLORS.reset}`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  ${COLORS.red}FAIL${COLORS.reset}: ${f.description}`);
    console.log(`        Input: ${JSON.stringify(f.input).slice(0, 60)}...`);
    console.log(`        Error: ${f.error}`);
  }
  if (failures.length > 20) {
    console.log(`  ... and ${failures.length - 20} more failures`);
  }
  console.log();
}

console.log(`${COLORS.green}Passed: ${passed}${COLORS.reset}`);
console.log(`${COLORS.red}Failed: ${failed}${COLORS.reset}`);
console.log(`Total: ${passed + failed}`);
console.log();

if (failed > 0) {
  console.log(`${COLORS.red}FUZZ TESTS FAILED${COLORS.reset}`);
  process.exit(1);
} else {
  console.log(`${COLORS.green}ALL FUZZ TESTS PASSED${COLORS.reset}`);
}
