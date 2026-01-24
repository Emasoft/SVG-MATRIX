/**
 * Test: Marker behavior with non-zero viewBox origin
 *
 * This test verifies that markers with viewBox="10 20 100 100" (non-zero origin)
 * correctly position the reference point.
 *
 * Key formula being tested:
 * When viewBox has origin (vbX, vbY), the transform should:
 * 1. Translate by -vbX, -vbY to shift viewBox origin to 0,0
 * 2. Apply scale factor (markerWidth/viewBoxWidth)
 * 3. Then translate by -refX, -refY (in scaled coordinates)
 *
 * Expected: The marker's refX,refY point should land exactly at the path endpoint.
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Decimal from 'decimal.js';
import * as MarkerResolver from '../src/marker-resolver.js';
import * as Transforms2D from '../src/transforms2d.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

Decimal.set({ precision: 80 });

// Test utilities
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${message}`);
    results.push({ status: 'PASS', message });
  } else {
    failed++;
    console.log(`  \u2717 ${message}`);
    results.push({ status: 'FAIL', message });
  }
}

function assertClose(a, b, tol, message) {
  const aNum = a instanceof Decimal ? a.toNumber() : a;
  const bNum = b instanceof Decimal ? b.toNumber() : b;
  const diff = Math.abs(aNum - bNum);
  if (diff < tol) {
    passed++;
    console.log(`  \u2713 ${message}`);
    results.push({ status: 'PASS', message, actual: aNum, expected: bNum });
  } else {
    failed++;
    console.log(`  \u2717 ${message} (got ${aNum}, expected ${bNum}, diff=${diff})`);
    results.push({ status: 'FAIL', message, actual: aNum, expected: bNum, diff });
  }
}

console.log('\n=== Marker ViewBox Offset Test ===\n');

// Load the test SVG
const svgPath = path.join(__dirname, 'fixtures', 'marker-viewbox-offset.svg');
const svgContent = fs.readFileSync(svgPath, 'utf-8');
const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
const document = dom.window.document;

// ============================================================================
// Test 1: Parse marker with non-zero viewBox origin
// ============================================================================
console.log('\n--- Test 1: Parse marker with non-zero viewBox origin ---\n');

const centerMarker = document.getElementById('centerMarker');
assert(centerMarker !== null, 'centerMarker element found');

const parsedMarker = MarkerResolver.parseMarkerElement(centerMarker);

assert(parsedMarker.viewBox !== null, 'viewBox was parsed');
assertClose(parsedMarker.viewBox.x, 10, 0.001, 'viewBox.x = 10');
assertClose(parsedMarker.viewBox.y, 20, 0.001, 'viewBox.y = 20');
assertClose(parsedMarker.viewBox.width, 100, 0.001, 'viewBox.width = 100');
assertClose(parsedMarker.viewBox.height, 100, 0.001, 'viewBox.height = 100');
assertClose(parsedMarker.refX, 60, 0.001, 'refX = 60');
assertClose(parsedMarker.refY, 70, 0.001, 'refY = 70');
assertClose(parsedMarker.markerWidth, 20, 0.001, 'markerWidth = 20');
assertClose(parsedMarker.markerHeight, 20, 0.001, 'markerHeight = 20');

// ============================================================================
// Test 2: Verify transform calculation for offset viewBox
// ============================================================================
console.log('\n--- Test 2: Transform calculation for offset viewBox ---\n');

// Path endpoint is at (200, 100)
const position = { x: 200, y: 100 };
const tangentAngle = 0; // Horizontal path
const strokeWidth = 1;

const transform = MarkerResolver.getMarkerTransform(
  parsedMarker,
  position,
  tangentAngle,
  strokeWidth,
  false // isStart
);

// The reference point (60, 70) in viewBox coords should map to (200, 100)
// Apply transform to (60, 70) and verify it lands at (200, 100)
const refPoint = Transforms2D.applyTransform(transform, 60, 70);
const refX = refPoint[0] instanceof Decimal ? refPoint[0].toNumber() : refPoint[0];
const refY = refPoint[1] instanceof Decimal ? refPoint[1].toNumber() : refPoint[1];

console.log(`  Reference point (60,70) transformed to: (${refX.toFixed(2)}, ${refY.toFixed(2)})`);
console.log(`  Expected position: (200, 100)`);

assertClose(refX, 200, 0.01, 'Transformed refX should be at path endpoint X (200)');
assertClose(refY, 100, 0.01, 'Transformed refY should be at path endpoint Y (100)');

// ============================================================================
// Test 3: Compare with origin-based viewBox marker
// ============================================================================
console.log('\n--- Test 3: Compare with origin-based viewBox marker ---\n');

const originMarker = document.getElementById('originMarker');
assert(originMarker !== null, 'originMarker element found');

const parsedOriginMarker = MarkerResolver.parseMarkerElement(originMarker);

assertClose(parsedOriginMarker.viewBox.x, 0, 0.001, 'origin viewBox.x = 0');
assertClose(parsedOriginMarker.viewBox.y, 0, 0.001, 'origin viewBox.y = 0');
assertClose(parsedOriginMarker.refX, 50, 0.001, 'origin refX = 50 (center)');
assertClose(parsedOriginMarker.refY, 50, 0.001, 'origin refY = 50 (center)');

// Position for origin marker is (200, 200)
const originPosition = { x: 200, y: 200 };
const originTransform = MarkerResolver.getMarkerTransform(
  parsedOriginMarker,
  originPosition,
  tangentAngle,
  strokeWidth,
  false
);

// The reference point (50, 50) should map to (200, 200)
const originRefPoint = Transforms2D.applyTransform(originTransform, 50, 50);
const originRefX = originRefPoint[0] instanceof Decimal ? originRefPoint[0].toNumber() : originRefPoint[0];
const originRefY = originRefPoint[1] instanceof Decimal ? originRefPoint[1].toNumber() : originRefPoint[1];

console.log(`  Origin marker ref (50,50) transformed to: (${originRefX.toFixed(2)}, ${originRefY.toFixed(2)})`);
console.log(`  Expected position: (200, 200)`);

assertClose(originRefX, 200, 0.01, 'Origin marker refX should be at endpoint X (200)');
assertClose(originRefY, 200, 0.01, 'Origin marker refY should be at endpoint Y (200)');

// ============================================================================
// Test 4: Resolve markers using resolveMarkers()
// ============================================================================
console.log('\n--- Test 4: Resolve markers using resolveMarkers() ---\n');

const testPath = document.getElementById('testPath');
assert(testPath !== null, 'testPath element found');

// Build defsMap
const defsMap = {};
defsMap['centerMarker'] = parsedMarker;
defsMap['originMarker'] = parsedOriginMarker;

const instances = MarkerResolver.resolveMarkers(testPath, defsMap);
assert(instances.length === 1, 'One marker instance resolved (marker-end)');
assert(instances[0].type === 'end', 'Marker type is "end"');

// Verify the instance transform places refPoint correctly
const instanceTransform = instances[0].transform;
const instanceRefPoint = Transforms2D.applyTransform(instanceTransform, 60, 70);
const instRefX = instanceRefPoint[0] instanceof Decimal ? instanceRefPoint[0].toNumber() : instanceRefPoint[0];
const instRefY = instanceRefPoint[1] instanceof Decimal ? instanceRefPoint[1].toNumber() : instanceRefPoint[1];

console.log(`  Resolved instance refPoint transformed to: (${instRefX.toFixed(2)}, ${instRefY.toFixed(2)})`);

assertClose(instRefX, 200, 0.01, 'Resolved marker refX at endpoint (200)');
assertClose(instRefY, 100, 0.01, 'Resolved marker refY at endpoint (100)');

// ============================================================================
// Test 5: Edge case - verify viewBox origin is subtracted correctly
// ============================================================================
console.log('\n--- Test 5: Verify viewBox origin subtraction ---\n');

// The viewBox origin (10, 20) should be subtracted from coordinates
// A point at (10, 20) in viewBox coords should become (0, 0) in local coords
// Then scaled by 0.2 (20/100) and translated by -refX*scale, -refY*scale

// Test with the viewBox origin point itself (10, 20)
const vbOriginTransformed = Transforms2D.applyTransform(transform, 10, 20);
const vbOriginX = vbOriginTransformed[0] instanceof Decimal ? vbOriginTransformed[0].toNumber() : vbOriginTransformed[0];
const vbOriginY = vbOriginTransformed[1] instanceof Decimal ? vbOriginTransformed[1].toNumber() : vbOriginTransformed[1];

console.log(`  ViewBox origin (10,20) transformed to: (${vbOriginX.toFixed(2)}, ${vbOriginY.toFixed(2)})`);

// The viewBox origin (10,20) is at relative coords (0,0) after viewBox shift
// refX=60 means ref is 50 units from viewBox left edge
// refY=70 means ref is 50 units from viewBox top edge
// So viewBox origin should be at position - (ref offset * scale)
// position.x - (60-10)*0.2 = 200 - 50*0.2 = 200 - 10 = 190
// position.y - (70-20)*0.2 = 100 - 50*0.2 = 100 - 10 = 90
const expectedVbX = 200 - 50 * 0.2; // 190
const expectedVbY = 100 - 50 * 0.2; // 90

assertClose(vbOriginX, expectedVbX, 0.01, `ViewBox origin X should be ${expectedVbX}`);
assertClose(vbOriginY, expectedVbY, 0.01, `ViewBox origin Y should be ${expectedVbY}`);

// ============================================================================
// Test 6: Verify marker content is correctly positioned
// ============================================================================
console.log('\n--- Test 6: Verify marker content positioning ---\n');

// The blue circle in the marker is at (60, 70) with radius 40
// After transform, its center should be at (200, 100)
// And its radius should be scaled to 40 * 0.2 = 8

// Circle edge at (100, 70) - rightmost point
const circleRightEdge = Transforms2D.applyTransform(transform, 100, 70);
const circleRightX = circleRightEdge[0] instanceof Decimal ? circleRightEdge[0].toNumber() : circleRightEdge[0];
const circleRightY = circleRightEdge[1] instanceof Decimal ? circleRightEdge[1].toNumber() : circleRightEdge[1];

console.log(`  Circle right edge (100,70) transformed to: (${circleRightX.toFixed(2)}, ${circleRightY.toFixed(2)})`);

// Right edge should be at center + scaled radius = 200 + 8 = 208
assertClose(circleRightX, 208, 0.01, 'Circle right edge at 200 + 8 = 208');
assertClose(circleRightY, 100, 0.01, 'Circle right edge Y at 100');

// ============================================================================
// Summary
// ============================================================================
console.log('\n========================================');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('========================================\n');

// Write results to report
const reportPath = path.join(__dirname, '..', 'docs_dev', 'TEST_marker-viewbox-offset.md');
const reportDir = path.dirname(reportPath);
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const report = `# Test Report: Marker ViewBox Offset

**Date**: ${new Date().toISOString()}
**Status**: ${failed === 0 ? 'PASS' : 'FAIL'}

## Summary

- Total tests: ${passed + failed}
- Passed: ${passed}
- Failed: ${failed}

## Test Results

| # | Status | Test |
|---|--------|------|
${results.map((r, i) => `| ${i + 1} | ${r.status === 'PASS' ? 'PASS' : 'FAIL'} | ${r.message} |`).join('\n')}

## Analysis

### Current Behavior

The test verifies that markers with non-zero viewBox origins correctly position
their reference points. The key transformation order is:

1. Translate to path vertex position
2. Apply rotation (if orient != 0)
3. Apply viewBox origin translation (-viewBox.x, -viewBox.y)
4. Apply scale (markerWidth/viewBoxWidth)
5. Translate by -refX, -refY

### Expected vs Actual

${failed > 0 ? results.filter(r => r.status === 'FAIL').map(r =>
  `- **${r.message}**: Expected ${r.expected}, got ${r.actual} (diff: ${r.diff})`
).join('\n') : 'All tests passed - viewBox offset handling is correct.'}

## Conclusion

${failed === 0 ?
  'The marker resolver correctly handles non-zero viewBox origins. The reference point lands exactly where expected.' :
  'There are issues with viewBox offset handling. See failed tests above for details.'}
`;

fs.writeFileSync(reportPath, report);
console.log(`Report written to: ${reportPath}`);

// Exit with error code if any tests failed
if (failed > 0) {
  process.exit(1);
}
