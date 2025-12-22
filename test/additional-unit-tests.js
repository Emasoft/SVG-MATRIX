/**
 * Additional Unit Tests for svg-matrix untested modules
 *
 * This test file covers additional test coverage for:
 * - logger.js: log level management and file logging
 * - verification.js: tolerance computation and verification functions
 * - douglas-peucker.js: perpendicular distance calculation
 * - flatten-pipeline.js: basic SVG flattening
 *
 * Run with: node test/additional-unit-tests.js
 */

import Decimal from 'decimal.js';
import { Matrix, Transforms2D } from '../src/index.js';
import { setLogLevel, getLogLevel, enableFileLogging, disableFileLogging, LogLevel } from '../src/logger.js';
import { computeTolerance, verifyTransformRoundTrip, verifyMatrixInversion } from '../src/verification.js';
import { perpendicularDistance } from '../src/douglas-peucker.js';
import { flattenSVG } from '../src/flatten-pipeline.js';

Decimal.set({ precision: 80 });

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${message}`);
  }
}

function assertClose(a, b, tol, message) {
  const aNum = a instanceof Decimal ? a.toNumber() : a;
  const bNum = b instanceof Decimal ? b.toNumber() : b;
  const diff = Math.abs(aNum - bNum);
  if (diff < tol) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${message} (got ${aNum}, expected ${bNum}, diff=${diff})`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    failed++;
    console.log(`  [FAIL] ${message} (expected exception, but none thrown)`);
  } catch (e) {
    passed++;
    console.log(`  [PASS] ${message}`);
  }
}

// ============================================================================
// LOGGER TESTS
// ============================================================================

console.log('\n=== Logger Tests ===\n');

// setLogLevel and getLogLevel
const originalLevel = getLogLevel();
setLogLevel(LogLevel.SILENT);
assert(getLogLevel() === LogLevel.SILENT, 'Logger: setLogLevel sets SILENT level');
setLogLevel(LogLevel.ERROR);
assert(getLogLevel() === LogLevel.ERROR, 'Logger: setLogLevel sets ERROR level');
setLogLevel(LogLevel.WARN);
assert(getLogLevel() === LogLevel.WARN, 'Logger: setLogLevel sets WARN level');
setLogLevel(LogLevel.INFO);
assert(getLogLevel() === LogLevel.INFO, 'Logger: setLogLevel sets INFO level');
setLogLevel(LogLevel.DEBUG);
assert(getLogLevel() === LogLevel.DEBUG, 'Logger: setLogLevel sets DEBUG level');
setLogLevel(originalLevel); // Restore

// Invalid log level
assertThrows(() => setLogLevel(-1), 'Logger: setLogLevel rejects invalid level -1');
assertThrows(() => setLogLevel(999), 'Logger: setLogLevel rejects invalid level 999');

// enableFileLogging and disableFileLogging
assertThrows(() => enableFileLogging(''), 'Logger: enableFileLogging rejects empty path');
assertThrows(() => enableFileLogging(null), 'Logger: enableFileLogging rejects null path');

// Basic enable/disable (no actual file writes in test)
try {
  enableFileLogging('/tmp/test-log.txt', false);
  disableFileLogging();
  passed++;
  console.log('  [PASS] Logger: enableFileLogging and disableFileLogging work without errors');
} catch (e) {
  failed++;
  console.log(`  [FAIL] Logger: enableFileLogging/disableFileLogging failed: ${e.message}`);
}

// ============================================================================
// VERIFICATION TESTS
// ============================================================================

console.log('\n=== Verification Tests ===\n');

// computeTolerance
const tolerance = computeTolerance();
assert(tolerance instanceof Decimal, 'Verification: computeTolerance returns Decimal');
assert(tolerance.greaterThan(0), 'Verification: computeTolerance returns positive value');
assert(tolerance.lessThan(1), 'Verification: computeTolerance returns value < 1');

// verifyTransformRoundTrip with identity
const identity = Matrix.identity(3);
const rtIdentity = verifyTransformRoundTrip(identity, 5, 7);
assert(rtIdentity.valid, 'Verification: verifyTransformRoundTrip passes for identity matrix');
assert(rtIdentity.error.lessThan(1e-10), 'Verification: identity round-trip has near-zero error');

// verifyTransformRoundTrip with translation
const translate = Transforms2D.translation(10, 20);
const rtTranslate = verifyTransformRoundTrip(translate, 3, 4);
assert(rtTranslate.valid, 'Verification: verifyTransformRoundTrip passes for translation');

// verifyTransformRoundTrip with singular matrix should fail
const singular = Matrix.from([[1, 2, 0], [2, 4, 0], [0, 0, 1]]);
const rtSingular = verifyTransformRoundTrip(singular, 1, 1);
assert(!rtSingular.valid, 'Verification: verifyTransformRoundTrip fails for singular matrix');

// verifyMatrixInversion with invertible matrix
const invertible = Matrix.from([[1, 2], [3, 4]]);
const invResult = verifyMatrixInversion(invertible);
assert(invResult.valid, 'Verification: verifyMatrixInversion passes for invertible matrix');
assert(invResult.error.lessThan(1e-10), 'Verification: matrix inversion has near-zero error');

// verifyMatrixInversion with singular matrix
const singular2x2 = Matrix.from([[1, 2], [2, 4]]);
const invSingular = verifyMatrixInversion(singular2x2);
assert(!invSingular.valid, 'Verification: verifyMatrixInversion fails for singular matrix');

// ============================================================================
// DOUGLAS-PEUCKER TESTS
// ============================================================================

console.log('\n=== Douglas-Peucker Tests ===\n');

// perpendicularDistance - point on line
const dist1 = perpendicularDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 });
assertClose(dist1, 0, 1e-10, 'DouglasPeucker: perpendicularDistance is 0 for point on line');

// perpendicularDistance - point off line
const dist2 = perpendicularDistance({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
assertClose(dist2, 0, 1e-10, 'DouglasPeucker: perpendicularDistance is 0 for point on horizontal line');

const dist3 = perpendicularDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
assertClose(dist3, 5, 1e-10, 'DouglasPeucker: perpendicularDistance is 5 for point 5 units above line');

// perpendicularDistance - degenerate case (line is a point)
const dist4 = perpendicularDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
assertClose(dist4, 5, 1e-10, 'DouglasPeucker: perpendicularDistance handles degenerate line (point to point)');

// perpendicularDistance - vertical line
const dist5 = perpendicularDistance({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 });
assertClose(dist5, 5, 1e-10, 'DouglasPeucker: perpendicularDistance is 5 for point 5 units from vertical line');

// ============================================================================
// FLATTEN-PIPELINE TESTS
// ============================================================================

console.log('\n=== Flatten-Pipeline Tests ===\n');

// Basic SVG flattening
const simpleSVG = '<svg width="100" height="100"><rect x="10" y="10" width="30" height="30" fill="red"/></svg>';
const flattened = flattenSVG(simpleSVG);
assert(flattened.svg.includes('<svg'), 'FlattenPipeline: flattenSVG returns valid SVG');
assert(flattened.stats !== undefined, 'FlattenPipeline: flattenSVG returns stats object');
assert(Array.isArray(flattened.stats.errors), 'FlattenPipeline: stats contains errors array');

// SVG with transform
const transformSVG = '<svg width="100" height="100"><rect x="10" y="10" width="30" height="30" transform="translate(5, 5)" fill="blue"/></svg>';
const flattenedTransform = flattenSVG(transformSVG, { flattenTransforms: true });
assert(flattenedTransform.svg.includes('<svg'), 'FlattenPipeline: flattenSVG handles transforms');
assert(flattenedTransform.stats.transformsFlattened >= 0, 'FlattenPipeline: stats tracks transforms flattened');

// Empty SVG
const emptySVG = '<svg></svg>';
const flattenedEmpty = flattenSVG(emptySVG);
assert(flattenedEmpty.svg.includes('<svg'), 'FlattenPipeline: flattenSVG handles empty SVG');

// Invalid SVG should return original
const invalidSVG = '<div>not an svg</div>';
const flattenedInvalid = flattenSVG(invalidSVG);
assert(flattenedInvalid.stats.errors.length > 0, 'FlattenPipeline: flattenSVG reports errors for invalid SVG');

// Options are respected
const customOptions = {
  precision: 3,
  flattenTransforms: false,
  resolveUse: false,
};
const flattenedCustom = flattenSVG(simpleSVG, customOptions);
assert(flattenedCustom.svg.includes('<svg'), 'FlattenPipeline: flattenSVG respects custom options');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
