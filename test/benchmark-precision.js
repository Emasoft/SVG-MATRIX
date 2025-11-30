/**
 * Precision and Performance Benchmark
 * Compares JavaScript floats vs Decimal.js for SVG coordinate transformations
 *
 * This benchmark demonstrates precision differences in realistic SVG scenarios.
 */

import Decimal from 'decimal.js';
import { Matrix } from '../src/matrix.js';
import * as Transforms2D from '../src/transforms2d.js';

// Set high precision for Decimal.js
Decimal.set({ precision: 80 });

// ============================================================================
// FLOAT-BASED IMPLEMENTATION (Standard JavaScript)
// ============================================================================

function floatTranslation(tx, ty) {
  return [[1, 0, tx], [0, 1, ty], [0, 0, 1]];
}

function floatRotate(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function floatScale(sx, sy) {
  return [[sx, 0, 0], [0, sy, 0], [0, 0, 1]];
}

function floatMultiply(A, B) {
  const result = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function floatInverse(M) {
  const [[a, b, c], [d, e, f], [g, h, i]] = M;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-15) throw new Error('Singular matrix');
  const invDet = 1 / det;
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet]
  ];
}

function floatApply(M, x, y) {
  const w = M[2][0] * x + M[2][1] * y + M[2][2];
  return [
    (M[0][0] * x + M[0][1] * y + M[0][2]) / w,
    (M[1][0] * x + M[1][1] * y + M[1][2]) / w
  ];
}

// ============================================================================
// BENCHMARK
// ============================================================================

console.log('');
console.log('================================================================================');
console.log('PRECISION BENCHMARK: JavaScript Floats vs Decimal.js (80-digit precision)');
console.log('================================================================================');

const deg2rad = Math.PI / 180;

// ============================================================================
// TEST 1: Large Coordinate Values (CAD/GIS scenario)
// ============================================================================

console.log('');
console.log('--------------------------------------------------------------------------------');
console.log('TEST 1: Large Coordinate Values (CAD/GIS scenario)');
console.log('--------------------------------------------------------------------------------');
console.log('');
console.log('  Scenario: Working with map coordinates at city scale (1,000,000+ units)');
console.log('  This is common in GIS applications where coordinates are in meters.');
console.log('');

// Float version
const f_ctm1 = floatMultiply(
  floatMultiply(
    floatScale(1e6, 1e6),
    floatRotate(45 * deg2rad)
  ),
  floatTranslation(1e9, 1e9)
);
const [f_vx1, f_vy1] = floatApply(f_ctm1, 10, 10);
const [f_rx1, f_ry1] = floatApply(floatInverse(f_ctm1), f_vx1, f_vy1);
const f_error1 = Math.sqrt((f_rx1 - 10) ** 2 + (f_ry1 - 10) ** 2);

// Decimal version
const d_ctm1 = Transforms2D.scale('1e6', '1e6')
  .mul(Transforms2D.rotate(new Decimal('45').mul(Decimal.acos(-1)).div('180')))
  .mul(Transforms2D.translation('1e9', '1e9'));
const [d_vx1, d_vy1] = Transforms2D.applyTransform(d_ctm1, '10', '10');
const [d_rx1, d_ry1] = Transforms2D.applyTransform(d_ctm1.inverse(), d_vx1, d_vy1);
const d_error1 = d_rx1.minus('10').pow(2).plus(d_ry1.minus('10').pow(2)).sqrt();

console.log('  JavaScript Float:');
console.log(`    Recovered: (${f_rx1.toFixed(10)}, ${f_ry1.toFixed(10)})`);
console.log(`    Error:     ${f_error1.toExponential(2)}`);
console.log('');
console.log('  Decimal.js (80-digit):');
console.log(`    Recovered: (${d_rx1.toFixed(20)}, ${d_ry1.toFixed(20)})`);
console.log(`    Error:     ${d_error1.toExponential()}`);

// ============================================================================
// TEST 2: Deep SVG Hierarchy (6 levels from real Inkscape file)
// ============================================================================

console.log('');
console.log('--------------------------------------------------------------------------------');
console.log('TEST 2: Deep SVG Hierarchy (from real Inkscape document)');
console.log('--------------------------------------------------------------------------------');
console.log('');
console.log('  Transform stack from samples/test.svg:');
console.log('    Level 0: scale(1.5)                     - viewBox');
console.log('    Level 1: translate(-13.613145, -10.21)  - group');
console.log('    Level 2: translate(-1144.8563, 517.65)  - group');
console.log('    Level 3: rotate(15)                     - group');
console.log('    Level 4: scale(1.2, 0.8)                - group');
console.log('    Level 5: matrix(0.716, 0, 0, 1.397)     - element');
console.log('');

// Float version
let f_ctm2 = floatScale(1.5, 1.5);
f_ctm2 = floatMultiply(f_ctm2, floatTranslation(-13.613145, -10.209854));
f_ctm2 = floatMultiply(f_ctm2, floatTranslation(-1144.8563, 517.64642));
f_ctm2 = floatMultiply(f_ctm2, floatRotate(15 * deg2rad));
f_ctm2 = floatMultiply(f_ctm2, floatScale(1.2, 0.8));
f_ctm2 = floatMultiply(f_ctm2, [[0.71577068, 0, 0], [0, 1.3970955, 0], [0, 0, 1]]);

const [f_vx2, f_vy2] = floatApply(f_ctm2, 10, 10);
const [f_rx2, f_ry2] = floatApply(floatInverse(f_ctm2), f_vx2, f_vy2);
const f_error2 = Math.sqrt((f_rx2 - 10) ** 2 + (f_ry2 - 10) ** 2);

// Decimal version
const d_ctm2 = Transforms2D.scale('1.5')
  .mul(Transforms2D.translation('-13.613145', '-10.209854'))
  .mul(Transforms2D.translation('-1144.8563', '517.64642'))
  .mul(Transforms2D.rotate(new Decimal('15').mul(Decimal.acos(-1)).div('180')))
  .mul(Transforms2D.scale('1.2', '0.8'))
  .mul(Matrix.from([
    [new Decimal('0.71577068'), new Decimal('0'), new Decimal('0')],
    [new Decimal('0'), new Decimal('1.3970955'), new Decimal('0')],
    [new Decimal('0'), new Decimal('0'), new Decimal('1')]
  ]));

const [d_vx2, d_vy2] = Transforms2D.applyTransform(d_ctm2, '10', '10');
const [d_rx2, d_ry2] = Transforms2D.applyTransform(d_ctm2.inverse(), d_vx2, d_vy2);
const d_error2 = d_rx2.minus('10').pow(2).plus(d_ry2.minus('10').pow(2)).sqrt();

console.log('  JavaScript Float:');
console.log(`    Viewport:  (${f_vx2.toFixed(6)}, ${f_vy2.toFixed(6)})`);
console.log(`    Recovered: (${f_rx2.toFixed(15)}, ${f_ry2.toFixed(15)})`);
console.log(`    Error:     ${f_error2.toExponential(2)}`);
console.log('');
console.log('  Decimal.js (80-digit):');
console.log(`    Viewport:  (${d_vx2.toFixed(20)}, ${d_vy2.toFixed(20)})`);
console.log(`    Recovered: (${d_rx2.toFixed(40)}, ${d_ry2.toFixed(40)})`);
console.log(`    Error:     ${d_error2.toExponential()}`);

// ============================================================================
// TEST 3: Accumulated Operations (1000 round-trips)
// ============================================================================

console.log('');
console.log('--------------------------------------------------------------------------------');
console.log('TEST 3: Accumulated Operations (1000 round-trips)');
console.log('--------------------------------------------------------------------------------');
console.log('');
console.log('  Scenario: Repeated forward/inverse transform application');
console.log('  This simulates heavy interactive editing with undo/redo.');
console.log('');

const ITERATIONS = 1000;

// Float version
let f_ctm3 = floatScale(1.5, 1.5);
f_ctm3 = floatMultiply(f_ctm3, floatTranslation(50, 30));
f_ctm3 = floatMultiply(f_ctm3, floatRotate(17 * deg2rad));
f_ctm3 = floatMultiply(f_ctm3, floatScale(1.2, 0.8));
const f_inv3 = floatInverse(f_ctm3);

let f_x3 = 10, f_y3 = 10;
for (let i = 0; i < ITERATIONS; i++) {
  [f_x3, f_y3] = floatApply(f_ctm3, f_x3, f_y3);
  [f_x3, f_y3] = floatApply(f_inv3, f_x3, f_y3);
}
const f_error3 = Math.sqrt((f_x3 - 10) ** 2 + (f_y3 - 10) ** 2);

// Decimal version
const d_ctm3 = Transforms2D.scale('1.5')
  .mul(Transforms2D.translation('50', '30'))
  .mul(Transforms2D.rotate(new Decimal('17').mul(Decimal.acos(-1)).div('180')))
  .mul(Transforms2D.scale('1.2', '0.8'));
const d_inv3 = d_ctm3.inverse();

let d_x3 = new Decimal('10'), d_y3 = new Decimal('10');
for (let i = 0; i < ITERATIONS; i++) {
  [d_x3, d_y3] = Transforms2D.applyTransform(d_ctm3, d_x3, d_y3);
  [d_x3, d_y3] = Transforms2D.applyTransform(d_inv3, d_x3, d_y3);
}
const d_error3 = d_x3.minus('10').pow(2).plus(d_y3.minus('10').pow(2)).sqrt();

console.log('  JavaScript Float:');
console.log(`    After ${ITERATIONS} round-trips: (${f_x3.toFixed(15)}, ${f_y3.toFixed(15)})`);
console.log(`    Error: ${f_error3.toExponential(2)}`);
console.log('');
console.log('  Decimal.js (80-digit):');
console.log(`    After ${ITERATIONS} round-trips: (${d_x3.toFixed(40)}, ${d_y3.toFixed(40)})`);
console.log(`    Error: ${d_error3.toExponential()}`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('');
console.log('================================================================================');
console.log('SUMMARY');
console.log('================================================================================');
console.log('');
console.log('  Scenario                    Float Error         Decimal Error       Improvement');
console.log('  --------------------------  ------------------  ------------------  -----------');
console.log(`  Large coordinates (GIS)     ${f_error1.toExponential(2).padStart(18)}  ${d_error1.toExponential().padStart(18)}  ${new Decimal(f_error1).div(d_error1.plus('1e-100')).toExponential(0).padStart(10)}x`);
console.log(`  6-level SVG hierarchy       ${f_error2.toExponential(2).padStart(18)}  ${d_error2.toExponential().padStart(18)}  ${new Decimal(f_error2).div(d_error2.plus('1e-100')).toExponential(0).padStart(10)}x`);
console.log(`  1000 round-trips            ${f_error3.toExponential(2).padStart(18)}  ${d_error3.toExponential().padStart(18)}  ${new Decimal(f_error3).div(d_error3.plus('1e-100')).toExponential(0).padStart(10)}x`);
console.log('');
console.log('  Key insights:');
console.log('');
console.log('  1. For typical SVG hierarchies, float error is ~1e-13 (sub-pixel)');
console.log('  2. For GIS/CAD with large coordinates, float error grows to ~1e-7');
console.log('  3. Decimal.js maintains ~1e-79 error regardless of scale');
console.log('  4. Use high precision for: CAD, GIS, scientific visualization,');
console.log('     or when accumulating many operations.');
console.log('');
console.log('================================================================================');
console.log('');

// ============================================================================
// TIMING BENCHMARK
// ============================================================================

console.log('TIMING BENCHMARK (1000 transforms each):');
console.log('');

// Float timing
const floatBenchStart = performance.now();
for (let i = 0; i < 1000; i++) {
  let ctm = floatScale(1.5, 1.5);
  ctm = floatMultiply(ctm, floatTranslation(50, 30));
  ctm = floatMultiply(ctm, floatRotate(15 * deg2rad));
  const [vx, vy] = floatApply(ctm, 10, 10);
  floatApply(floatInverse(ctm), vx, vy);
}
const floatBenchEnd = performance.now();
const floatAvg = (floatBenchEnd - floatBenchStart) / 1000;

// Decimal timing
const decimalBenchStart = performance.now();
for (let i = 0; i < 1000; i++) {
  let ctm = Transforms2D.scale('1.5');
  ctm = ctm.mul(Transforms2D.translation('50', '30'));
  ctm = ctm.mul(Transforms2D.rotate(new Decimal('15').mul(Decimal.acos(-1)).div('180')));
  const [vx, vy] = Transforms2D.applyTransform(ctm, '10', '10');
  Transforms2D.applyTransform(ctm.inverse(), vx, vy);
}
const decimalBenchEnd = performance.now();
const decimalAvg = (decimalBenchEnd - decimalBenchStart) / 1000;

console.log(`  JavaScript floats:      ${floatAvg.toFixed(4)} ms per transform`);
console.log(`  Decimal.js (80-digit):  ${decimalAvg.toFixed(4)} ms per transform`);
console.log(`  Speed ratio:            ${(decimalAvg / floatAvg).toFixed(1)}x slower`);
console.log('');
console.log('  Trade-off: Decimal.js is slower but guarantees precision.');
console.log('  For most interactive SVG, sub-millisecond overhead is acceptable.');
console.log('');
console.log('================================================================================');
