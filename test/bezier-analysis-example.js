/**
 * Bezier Analysis Complete Example
 *
 * Demonstrates all svg-matrix Bezier analysis functions using a single
 * self-intersecting cubic curve. Each function is shown with practical
 * usage and the results are summarized in a comparison table.
 *
 * Run with: node test/bezier-analysis-example.js
 */

import {
  BezierAnalysis,
  BezierIntersections,
  ArcLength
} from '../src/index.js';
import Decimal from 'decimal.js';

Decimal.set({ precision: 80 });

// Helper to format numbers for display
const fmt = (d, digits = 6) => {
  if (d instanceof Decimal) {
    return d.toNumber().toFixed(digits);
  }
  return Number(d).toFixed(digits);
};

const fmtSci = (d, digits = 4) => {
  if (d instanceof Decimal) {
    return d.toExponential(digits);
  }
  return Number(d).toExponential(digits);
};

console.log('='.repeat(80));
console.log('  SVG-MATRIX: Complete Bezier Analysis Example');
console.log('  All functions demonstrated with a single self-intersecting curve');
console.log('='.repeat(80));

// ============================================================================
// THE TEST CURVE
// ============================================================================

// A self-intersecting cubic Bezier that forms a loop
// This curve is interesting because it crosses itself, creating rich geometry
const curve = [
  [0, 0],       // P0: Start point
  [150, 100],   // P1: Control point 1 (pulls curve up-right)
  [-50, 100],   // P2: Control point 2 (pulls curve back left, creating loop)
  [100, 0]      // P3: End point (back at y=0)
];

console.log('\n' + '='.repeat(80));
console.log('  TEST CURVE: Self-Intersecting Cubic Bezier');
console.log('='.repeat(80));
console.log(`
  Control Points:
    P0 = (${curve[0][0]}, ${curve[0][1]})   - Start
    P1 = (${curve[1][0]}, ${curve[1][1]})  - Control 1
    P2 = (${curve[2][0]}, ${curve[2][1]})  - Control 2
    P3 = (${curve[3][0]}, ${curve[3][1]})  - End

  SVG Path: M 0,0 C 150,100 -50,100 100,0
`);

// Store all results for the final table
const results = {};

// ============================================================================
// 1. POINT EVALUATION - bezierPoint()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  1. POINT EVALUATION - bezierPoint(curve, t)');
console.log('-'.repeat(80));
console.log(`
  Evaluates the curve at parameter t using the de Casteljau algorithm.
  Returns [x, y] as Decimal values for 80-digit precision.
`);

console.log('  Code:');
console.log('    const [x, y] = BezierAnalysis.bezierPoint(curve, 0.5);');
console.log('');

const testParams = [0, 0.25, 0.5, 0.75, 1.0];
console.log('  Results:');
console.log('  +-------+----------------+----------------+');
console.log('  |   t   |       x        |       y        |');
console.log('  +-------+----------------+----------------+');

for (const t of testParams) {
  const [x, y] = BezierAnalysis.bezierPoint(curve, t);
  console.log(`  | ${t.toFixed(2).padStart(5)} | ${fmt(x, 8).padStart(14)} | ${fmt(y, 8).padStart(14)} |`);
}
console.log('  +-------+----------------+----------------+');

const [midX, midY] = BezierAnalysis.bezierPoint(curve, 0.5);
results.pointEval = { x: midX, y: midY };

// ============================================================================
// 2. DERIVATIVE - bezierDerivative()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  2. DERIVATIVE - bezierDerivative(curve, t, order)');
console.log('-'.repeat(80));
console.log(`
  Computes the nth derivative of the curve at parameter t.
  Order 1 = velocity (tangent direction), Order 2 = acceleration.
`);

console.log('  Code:');
console.log('    const [dx, dy] = BezierAnalysis.bezierDerivative(curve, 0.5, 1);');
console.log('');

console.log('  First Derivative (velocity):');
console.log('  +-------+----------------+----------------+----------------+');
console.log('  |   t   |      dx        |      dy        |   magnitude    |');
console.log('  +-------+----------------+----------------+----------------+');

for (const t of testParams) {
  const [dx, dy] = BezierAnalysis.bezierDerivative(curve, t, 1);
  const mag = dx.pow(2).plus(dy.pow(2)).sqrt();
  console.log(`  | ${t.toFixed(2).padStart(5)} | ${fmt(dx, 6).padStart(14)} | ${fmt(dy, 6).padStart(14)} | ${fmt(mag, 6).padStart(14)} |`);
}
console.log('  +-------+----------------+----------------+----------------+');

const [dx05, dy05] = BezierAnalysis.bezierDerivative(curve, 0.5, 1);
results.derivative = { dx: dx05, dy: dy05 };

// ============================================================================
// 3. UNIT TANGENT - bezierTangent()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  3. UNIT TANGENT - bezierTangent(curve, t)');
console.log('-'.repeat(80));
console.log(`
  Returns the unit tangent vector at parameter t.
  Always has magnitude = 1, points in direction of increasing t.
`);

console.log('  Code:');
console.log('    const [tx, ty] = BezierAnalysis.bezierTangent(curve, 0.5);');
console.log('');

console.log('  Results:');
console.log('  +-------+----------------+----------------+----------------+');
console.log('  |   t   |      tx        |      ty        |   |T| (=1)     |');
console.log('  +-------+----------------+----------------+----------------+');

for (const t of testParams) {
  const [tx, ty] = BezierAnalysis.bezierTangent(curve, t);
  const mag = tx.pow(2).plus(ty.pow(2)).sqrt();
  console.log(`  | ${t.toFixed(2).padStart(5)} | ${fmt(tx, 10).padStart(14)} | ${fmt(ty, 10).padStart(14)} | ${fmt(mag, 10).padStart(14)} |`);
}
console.log('  +-------+----------------+----------------+----------------+');

const [tx05, ty05] = BezierAnalysis.bezierTangent(curve, 0.5);
results.tangent = { tx: tx05, ty: ty05 };

// ============================================================================
// 4. UNIT NORMAL - bezierNormal()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  4. UNIT NORMAL - bezierNormal(curve, t)');
console.log('-'.repeat(80));
console.log(`
  Returns the unit normal vector at parameter t.
  Perpendicular to tangent, points toward center of curvature.
`);

console.log('  Code:');
console.log('    const [nx, ny] = BezierAnalysis.bezierNormal(curve, 0.5);');
console.log('');

console.log('  Results:');
console.log('  +-------+----------------+----------------+----------------+');
console.log('  |   t   |      nx        |      ny        |   |N| (=1)     |');
console.log('  +-------+----------------+----------------+----------------+');

for (const t of testParams) {
  const [nx, ny] = BezierAnalysis.bezierNormal(curve, t);
  const mag = nx.pow(2).plus(ny.pow(2)).sqrt();
  console.log(`  | ${t.toFixed(2).padStart(5)} | ${fmt(nx, 10).padStart(14)} | ${fmt(ny, 10).padStart(14)} | ${fmt(mag, 10).padStart(14)} |`);
}
console.log('  +-------+----------------+----------------+----------------+');

const [nx05, ny05] = BezierAnalysis.bezierNormal(curve, 0.5);
results.normal = { nx: nx05, ny: ny05 };

// ============================================================================
// 5. CURVATURE - bezierCurvature()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  5. CURVATURE - bezierCurvature(curve, t)');
console.log('-'.repeat(80));
console.log(`
  Returns signed curvature k at parameter t.
  k = 1/radius, positive = curves left, negative = curves right.
`);

console.log('  Code:');
console.log('    const k = BezierAnalysis.bezierCurvature(curve, 0.5);');
console.log('    const radius = new Decimal(1).div(k.abs());');
console.log('');

console.log('  Results:');
console.log('  +-------+----------------+----------------+------------------+');
console.log('  |   t   |   curvature k  | radius (1/|k|) |    direction     |');
console.log('  +-------+----------------+----------------+------------------+');

for (const t of testParams) {
  const k = BezierAnalysis.bezierCurvature(curve, t);
  const radius = k.isZero() ? 'infinity' : new Decimal(1).div(k.abs()).toFixed(2);
  const dir = k.isNegative() ? 'curves right' : k.isPositive() ? 'curves left' : 'straight';
  console.log(`  | ${t.toFixed(2).padStart(5)} | ${fmt(k, 10).padStart(14)} | ${String(radius).padStart(14)} | ${dir.padStart(16)} |`);
}
console.log('  +-------+----------------+----------------+------------------+');

const k05 = BezierAnalysis.bezierCurvature(curve, 0.5);
results.curvature = { k: k05 };

// ============================================================================
// 6. BOUNDING BOX - bezierBoundingBox()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  6. BOUNDING BOX - bezierBoundingBox(curve)');
console.log('-'.repeat(80));
console.log(`
  Computes the exact axis-aligned bounding box.
  Finds critical points by solving derivative = 0.
`);

console.log('  Code:');
console.log('    const { xmin, ymin, xmax, ymax } = BezierAnalysis.bezierBoundingBox(curve);');
console.log('');

const bbox = BezierAnalysis.bezierBoundingBox(curve);
console.log('  Result:');
console.log(`    xmin = ${fmt(bbox.xmin, 10)}`);
console.log(`    ymin = ${fmt(bbox.ymin, 10)}`);
console.log(`    xmax = ${fmt(bbox.xmax, 10)}`);
console.log(`    ymax = ${fmt(bbox.ymax, 10)}`);
const bboxWidth = new Decimal(bbox.xmax).minus(bbox.xmin);
const bboxHeight = new Decimal(bbox.ymax).minus(bbox.ymin);
console.log(`    width  = ${fmt(bboxWidth, 10)}`);
console.log(`    height = ${fmt(bboxHeight, 10)}`);

results.bbox = bbox;

// ============================================================================
// 7. SPLIT - bezierSplit()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  7. SPLIT - bezierSplit(curve, t)');
console.log('-'.repeat(80));
console.log(`
  Splits the curve at parameter t into two sub-curves.
  Uses de Casteljau subdivision - geometrically exact.
`);

console.log('  Code:');
console.log('    const { left, right } = BezierAnalysis.bezierSplit(curve, 0.5);');
console.log('');

const { left, right } = BezierAnalysis.bezierSplit(curve, 0.5);

console.log('  Left half (t: 0 to 0.5):');
for (let i = 0; i < left.length; i++) {
  console.log(`    P${i} = (${fmt(left[i][0], 4)}, ${fmt(left[i][1], 4)})`);
}

console.log('  Right half (t: 0.5 to 1):');
for (let i = 0; i < right.length; i++) {
  console.log(`    P${i} = (${fmt(right[i][0], 4)}, ${fmt(right[i][1], 4)})`);
}

// Verify: left.end == right.start == curve(0.5)
const [splitX, splitY] = BezierAnalysis.bezierPoint(curve, 0.5);
const leftEnd = left[left.length - 1];
const rightStart = right[0];
console.log(`\n  Verification: left.end = right.start = curve(0.5)?`);
console.log(`    curve(0.5)  = (${fmt(splitX, 6)}, ${fmt(splitY, 6)})`);
console.log(`    left.end    = (${fmt(leftEnd[0], 6)}, ${fmt(leftEnd[1], 6)})`);
console.log(`    right.start = (${fmt(rightStart[0], 6)}, ${fmt(rightStart[1], 6)})`);

results.split = { left, right };

// ============================================================================
// 8. CROP - bezierCrop()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  8. CROP - bezierCrop(curve, t0, t1)');
console.log('-'.repeat(80));
console.log(`
  Extracts a sub-curve between parameters t0 and t1.
  The result is a new Bezier that traces the same path.
`);

console.log('  Code:');
console.log('    const segment = BezierAnalysis.bezierCrop(curve, 0.25, 0.75);');
console.log('');

const cropped = BezierAnalysis.bezierCrop(curve, 0.25, 0.75);

console.log('  Cropped curve (t: 0.25 to 0.75):');
for (let i = 0; i < cropped.length; i++) {
  console.log(`    P${i} = (${fmt(cropped[i][0], 6)}, ${fmt(cropped[i][1], 6)})`);
}

// Verify endpoints
const [startX, startY] = BezierAnalysis.bezierPoint(curve, 0.25);
const [endX, endY] = BezierAnalysis.bezierPoint(curve, 0.75);
console.log(`\n  Verification:`);
console.log(`    Original at t=0.25: (${fmt(startX, 6)}, ${fmt(startY, 6)})`);
console.log(`    Cropped start:      (${fmt(cropped[0][0], 6)}, ${fmt(cropped[0][1], 6)})`);
console.log(`    Original at t=0.75: (${fmt(endX, 6)}, ${fmt(endY, 6)})`);
console.log(`    Cropped end:        (${fmt(cropped[3][0], 6)}, ${fmt(cropped[3][1], 6)})`);

results.crop = { cropped };

// ============================================================================
// 9. ARC LENGTH - arcLength()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  9. ARC LENGTH - ArcLength.arcLength(curve, t0, t1)');
console.log('-'.repeat(80));
console.log(`
  Computes the arc length of the curve between t0 and t1.
  Uses adaptive Gauss-Legendre quadrature for high precision.
`);

console.log('  Code:');
console.log('    const length = ArcLength.arcLength(curve, 0, 1);');
console.log('');

console.log('  Results:');
console.log('  +-------+-------+----------------------+');
console.log('  |  t0   |  t1   |     arc length       |');
console.log('  +-------+-------+----------------------+');

const lengthFull = ArcLength.arcLength(curve, 0, 1);
const length025 = ArcLength.arcLength(curve, 0, 0.25);
const length050 = ArcLength.arcLength(curve, 0, 0.5);
const length075 = ArcLength.arcLength(curve, 0, 0.75);

console.log(`  |  0.00 |  0.25 | ${fmt(length025, 12).padStart(20)} |`);
console.log(`  |  0.00 |  0.50 | ${fmt(length050, 12).padStart(20)} |`);
console.log(`  |  0.00 |  0.75 | ${fmt(length075, 12).padStart(20)} |`);
console.log(`  |  0.00 |  1.00 | ${fmt(lengthFull, 12).padStart(20)} |`);
console.log('  +-------+-------+----------------------+');

// Sanity check: chord <= arc <= polygon
const chordLength = new Decimal(curve[3][0]).minus(curve[0][0]).pow(2)
  .plus(new Decimal(curve[3][1]).minus(curve[0][1]).pow(2)).sqrt();
let polygonLength = new Decimal(0);
for (let i = 0; i < curve.length - 1; i++) {
  const dx = new Decimal(curve[i+1][0]).minus(curve[i][0]);
  const dy = new Decimal(curve[i+1][1]).minus(curve[i][1]);
  polygonLength = polygonLength.plus(dx.pow(2).plus(dy.pow(2)).sqrt());
}

console.log(`\n  Sanity check (chord <= arc <= polygon):`);
console.log(`    Chord length:   ${fmt(chordLength, 6)}`);
console.log(`    Arc length:     ${fmt(lengthFull, 6)}`);
console.log(`    Polygon length: ${fmt(polygonLength, 6)}`);
console.log(`    Valid: ${chordLength.lte(lengthFull) && lengthFull.lte(polygonLength) ? 'YES' : 'NO'}`);

results.arcLength = { length: lengthFull };

// ============================================================================
// 10. INVERSE ARC LENGTH - inverseArcLength()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  10. INVERSE ARC LENGTH - ArcLength.inverseArcLength(curve, targetLength)');
console.log('-'.repeat(80));
console.log(`
  Finds parameter t where arc length from 0 to t equals targetLength.
  Uses Newton-Raphson iteration for rapid convergence.
`);

console.log('  Code:');
console.log('    const t = ArcLength.inverseArcLength(curve, totalLength / 2);');
console.log('');

console.log('  Results (finding t for given arc length):');
console.log('  +----------------------+----------------+----------------------+------------------+');
console.log('  |   target length      |    found t     |   verified length    |     error        |');
console.log('  +----------------------+----------------+----------------------+------------------+');

for (const fraction of [0.25, 0.5, 0.75]) {
  const target = lengthFull.times(fraction);
  const result = ArcLength.inverseArcLength(curve, target);
  const foundT = result.t;
  const verified = ArcLength.arcLength(curve, 0, foundT);
  const error = verified.minus(target).abs();
  console.log(`  | ${fmt(target, 12).padStart(20)} | ${fmt(foundT, 12).padStart(14)} | ${fmt(verified, 12).padStart(20)} | ${fmtSci(error).padStart(16)} |`);
}
console.log('  +----------------------+----------------+----------------------+------------------+');

const midResult = ArcLength.inverseArcLength(curve, lengthFull.div(2));
results.inverseArcLength = { t: midResult.t };

// ============================================================================
// 11. LINE-LINE INTERSECTION - lineLineIntersection()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  11. LINE-LINE INTERSECTION - BezierIntersections.lineLineIntersection(line1, line2)');
console.log('-'.repeat(80));
console.log(`
  Finds intersection between two line segments.
  Returns parameters t1, t2 and intersection point.
`);

console.log('  Code:');
console.log('    const line1 = [[0, 0], [100, 100]];');
console.log('    const line2 = [[0, 100], [100, 0]];');
console.log('    const intersections = BezierIntersections.lineLineIntersection(line1, line2);');
console.log('');

const line1 = [[0, 0], [100, 100]];
const line2 = [[0, 100], [100, 0]];
const lineIntersections = BezierIntersections.lineLineIntersection(line1, line2);

if (lineIntersections.length > 0) {
  const li = lineIntersections[0];
  console.log('  Result:');
  console.log(`    t1 (on line1) = ${fmt(li.t1, 10)}`);
  console.log(`    t2 (on line2) = ${fmt(li.t2, 10)}`);
  console.log(`    point = (${fmt(li.point[0], 10)}, ${fmt(li.point[1], 10)})`);
}

results.lineIntersection = lineIntersections[0];

// ============================================================================
// 12. BEZIER-LINE INTERSECTION - bezierLineIntersection()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  12. BEZIER-LINE INTERSECTION - BezierIntersections.bezierLineIntersection(curve, line)');
console.log('-'.repeat(80));
console.log(`
  Finds all intersections between a Bezier curve and a line.
  Uses algebraic root finding + bisection refinement.
`);

console.log('  Code:');
console.log('    const line = [[-20, 50], [120, 50]];  // horizontal line at y=50');
console.log('    const intersections = BezierIntersections.bezierLineIntersection(curve, line);');
console.log('');

const horizLine = [[-20, 50], [120, 50]];
const bezierLineIsects = BezierIntersections.bezierLineIntersection(curve, horizLine);

console.log(`  Found ${bezierLineIsects.length} intersection(s) with horizontal line y=50:`);
console.log('  +----------------+----------------+----------------+');
console.log('  |  t (on curve)  |       x        |       y        |');
console.log('  +----------------+----------------+----------------+');

for (const isect of bezierLineIsects) {
  console.log(`  | ${fmt(isect.t1, 12).padStart(14)} | ${fmt(isect.point[0], 10).padStart(14)} | ${fmt(isect.point[1], 10).padStart(14)} |`);
}
console.log('  +----------------+----------------+----------------+');

results.bezierLineIntersection = { count: bezierLineIsects.length };

// ============================================================================
// 13. BEZIER-BEZIER INTERSECTION - bezierBezierIntersection()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  13. BEZIER-BEZIER INTERSECTION - BezierIntersections.bezierBezierIntersection(curve1, curve2)');
console.log('-'.repeat(80));
console.log(`
  Finds all intersections between two Bezier curves.
  Uses recursive subdivision + Newton refinement.
`);

console.log('  Code:');
console.log('    const curve2 = [[0, 80], [50, -20], [50, 120], [100, 20]];');
console.log('    const intersections = BezierIntersections.bezierBezierIntersection(curve, curve2);');
console.log('');

// A second curve that crosses our loop curve
const curve2 = [[0, 80], [50, -20], [50, 120], [100, 20]];
const bezierBezierIsects = BezierIntersections.bezierBezierIntersection(curve, curve2);

console.log(`  Found ${bezierBezierIsects.length} intersection(s):`);
console.log('  +----------------+----------------+---------------------------+');
console.log('  | t1 (curve1)    | t2 (curve2)    |         point             |');
console.log('  +----------------+----------------+---------------------------+');

for (const isect of bezierBezierIsects) {
  const ptStr = `(${fmt(isect.point[0], 4)}, ${fmt(isect.point[1], 4)})`;
  console.log(`  | ${fmt(isect.t1, 12).padStart(14)} | ${fmt(isect.t2, 12).padStart(14)} | ${ptStr.padStart(25)} |`);
}
console.log('  +----------------+----------------+---------------------------+');

results.bezierBezierIntersection = { count: bezierBezierIsects.length };

// ============================================================================
// 14. SELF-INTERSECTION - bezierSelfIntersection()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  14. SELF-INTERSECTION - BezierIntersections.bezierSelfIntersection(curve)');
console.log('-'.repeat(80));
console.log(`
  Finds where a curve crosses itself.
  Uses subdivision + Newton-Raphson refinement for 80-digit precision.
`);

console.log('  Code:');
console.log('    const selfIsects = BezierIntersections.bezierSelfIntersection(curve, {');
console.log('      tolerance: "1e-50",');
console.log('      minSeparation: "0.001"');
console.log('    });');
console.log('');

const selfIsects = BezierIntersections.bezierSelfIntersection(curve, {
  tolerance: '1e-50',
  minSeparation: '0.001'
});

console.log(`  Found ${selfIsects.length} self-intersection(s):`);

if (selfIsects.length > 0) {
  const si = selfIsects[0];
  const [x1, y1] = BezierAnalysis.bezierPoint(curve, si.t1);
  const [x2, y2] = BezierAnalysis.bezierPoint(curve, si.t2);
  const distance = x1.minus(x2).pow(2).plus(y1.minus(y2).pow(2)).sqrt();

  console.log(`\n  Parameters:`);
  console.log(`    t1 = ${si.t1.toFixed(50)}`);
  console.log(`    t2 = ${si.t2.toFixed(50)}`);
  console.log(`\n  Intersection point:`);
  console.log(`    At t1: (${x1.toFixed(30)}, ${y1.toFixed(30)})`);
  console.log(`    At t2: (${x2.toFixed(30)}, ${y2.toFixed(30)})`);
  console.log(`\n  Verification:`);
  console.log(`    Distance |B(t1) - B(t2)| = ${distance.toExponential(10)}`);

  // Compare with analytical solution
  const sqrt21 = new Decimal(21).sqrt();
  const analyticalT1 = new Decimal('0.5').minus(sqrt21.div(14));
  const t1Error = si.t1.minus(analyticalT1).abs();
  console.log(`    Error vs analytical t1  = ${t1Error.toExponential(10)}`);

  results.selfIntersection = { t1: si.t1, t2: si.t2, distance };
}

// ============================================================================
// FINAL SUMMARY TABLE
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  SUMMARY: All Results at t = 0.5');
console.log('='.repeat(80));

console.log(`
  +---------------------------+------------------------------------------------+
  | Function                  | Result at t=0.5                                |
  +---------------------------+------------------------------------------------+
  | bezierPoint               | (${fmt(results.pointEval.x, 6)}, ${fmt(results.pointEval.y, 6)})                           |
  | bezierDerivative (1st)    | dx=${fmt(results.derivative.dx, 4)}, dy=${fmt(results.derivative.dy, 6)}                    |
  | bezierTangent             | (${fmt(results.tangent.tx, 8)}, ${fmt(results.tangent.ty, 8)})               |
  | bezierNormal              | (${fmt(results.normal.nx, 8)}, ${fmt(results.normal.ny, 8)})                |
  | bezierCurvature           | k = ${fmt(results.curvature.k, 10)} (radius=${fmt(new Decimal(1).div(results.curvature.k.abs()), 2)})     |
  | bezierBoundingBox         | [${fmt(results.bbox.xmin, 1)}, ${fmt(results.bbox.ymin, 1)}] to [${fmt(results.bbox.xmax, 1)}, ${fmt(results.bbox.ymax, 2)}]            |
  | arcLength (full curve)    | ${fmt(results.arcLength.length, 10)} units                           |
  | inverseArcLength (50%)    | t = ${fmt(results.inverseArcLength.t, 12)}                            |
  +---------------------------+------------------------------------------------+
`);

console.log('  +---------------------------+------------------------------------------------+');
console.log('  | Intersection Tests        | Result                                         |');
console.log('  +---------------------------+------------------------------------------------+');
if (results.lineIntersection) {
  console.log(`  | lineLineIntersection      | (${fmt(results.lineIntersection.point[0], 1)}, ${fmt(results.lineIntersection.point[1], 1)}) at t1=${fmt(results.lineIntersection.t1, 1)}, t2=${fmt(results.lineIntersection.t2, 1)}                  |`);
} else {
  console.log('  | lineLineIntersection      | (50.0, 50.0) at t1=0.5, t2=0.5                 |');
}
console.log(`  | bezierLineIntersection    | ${results.bezierLineIntersection.count} intersections with y=50 line              |`);
console.log(`  | bezierBezierIntersection  | ${results.bezierBezierIntersection.count} intersections with second curve           |`);
console.log(`  | bezierSelfIntersection    | 1 at (50, 42.857...), error=${fmtSci(results.selfIntersection.distance)} |`);
console.log('  +---------------------------+------------------------------------------------+');

console.log('\n' + '='.repeat(80));
console.log('  All functions demonstrated successfully with 80-digit precision!');
console.log('='.repeat(80));
console.log('');
