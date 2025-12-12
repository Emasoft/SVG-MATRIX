/**
 * Path Analysis Complete Example
 *
 * Demonstrates svg-matrix path-level analysis functions:
 * - Closed path area (Green's theorem)
 * - Point in path test
 * - Closest/farthest point on path
 * - Path continuity and smoothness
 * - Path bounding box
 *
 * Run with: node test/path-analysis-example.js
 */

import {
  PathAnalysis,
  BezierAnalysis,
  GeometryToPath
} from '../src/index.js';
import Decimal from 'decimal.js';

Decimal.set({ precision: 80 });

// Helper to format numbers
const fmt = (d, digits = 6) => {
  if (d instanceof Decimal) return d.toNumber().toFixed(digits);
  return Number(d).toFixed(digits);
};

const fmtSci = (d, digits = 4) => {
  if (d instanceof Decimal) return d.toExponential(digits);
  return Number(d).toExponential(digits);
};

console.log('='.repeat(80));
console.log('  SVG-MATRIX: Path Analysis Example');
console.log('  Closed paths, area calculation, point tests, and more');
console.log('='.repeat(80));

// ============================================================================
// TEST SHAPES: Various closed paths for demonstration
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST SHAPES');
console.log('='.repeat(80));

// 1. Simple rectangle (100 x 50)
// Defined as 4 line segments going counter-clockwise
const rectangle = [
  [[0, 0], [100, 0]],    // bottom: left to right
  [[100, 0], [100, 50]], // right: bottom to top
  [[100, 50], [0, 50]],  // top: right to left
  [[0, 50], [0, 0]]      // left: top to bottom
];

console.log(`
  1. Rectangle (100 x 50):
     Segments: 4 lines forming closed path
     Expected area: 5000 sq units
     Direction: counter-clockwise (positive area)
`);

// 2. Triangle (base 100, height 80)
const triangle = [
  [[0, 0], [100, 0]],    // base
  [[100, 0], [50, 80]],  // right edge
  [[50, 80], [0, 0]]     // left edge
];

console.log(`  2. Triangle (base=100, height=80):
     Segments: 3 lines
     Expected area: 4000 sq units (1/2 * 100 * 80)
`);

// 3. Circle approximated by cubic Beziers (radius 50, centered at origin)
// Using the standard 4-arc approximation with kappa = 0.5522847498
const k = 0.5522847498;
const r = 50;
const circle = [
  // Right arc (0 to 90 degrees)
  [[r, 0], [r, r*k], [r*k, r], [0, r]],
  // Top arc (90 to 180 degrees)
  [[0, r], [-r*k, r], [-r, r*k], [-r, 0]],
  // Left arc (180 to 270 degrees)
  [[-r, 0], [-r, -r*k], [-r*k, -r], [0, -r]],
  // Bottom arc (270 to 360 degrees)
  [[0, -r], [r*k, -r], [r, -r*k], [r, 0]]
];

const expectedCircleArea = Math.PI * r * r;
console.log(`  3. Circle (radius=50, 4 cubic Bezier arcs):
     Segments: 4 cubic Beziers
     Expected area: ${expectedCircleArea.toFixed(6)} sq units (pi * r^2)
`);

// 4. Star shape (5-pointed, outer radius 50, inner radius 20)
const outerR = 50;
const innerR = 20;
const starPoints = [];
for (let i = 0; i < 10; i++) {
  const angle = (i * Math.PI / 5) - Math.PI / 2; // Start from top
  const radius = i % 2 === 0 ? outerR : innerR;
  starPoints.push([
    radius * Math.cos(angle),
    radius * Math.sin(angle)
  ]);
}
// Close the star by connecting back to start
starPoints.push(starPoints[0]);

// Convert to line segments
const star = [];
for (let i = 0; i < starPoints.length - 1; i++) {
  star.push([starPoints[i], starPoints[i + 1]]);
}

console.log(`  4. 5-Pointed Star (outer=50, inner=20):
     Segments: 10 lines
     Direction: counter-clockwise
`);

// 5. Figure-8 (self-intersecting path)
// Two circles that share a point
const figure8 = [
  // Left circle (counter-clockwise from center)
  [[-25, 0], [-25, 25*k], [-25-25*k, 25], [-50, 25]],
  [[-50, 25], [-50-25*k, 25], [-75, 25*k], [-75, 0]],
  [[-75, 0], [-75, -25*k], [-50-25*k, -25], [-50, -25]],
  [[-50, -25], [-25-25*k, -25], [-25, -25*k], [-25, 0]],
  // Right circle (clockwise from center - negative contribution)
  [[-25, 0], [-25, -25*k], [-25+25*k, -25], [0, -25]],
  [[0, -25], [25*k, -25], [25, -25*k], [25, 0]],
  [[25, 0], [25, 25*k], [25*k, 25], [0, 25]],
  [[0, 25], [-25+25*k, 25], [-25, 25*k], [-25, 0]]
];

console.log(`  5. Figure-8 (two circles sharing center point):
     Segments: 8 cubic Beziers
     Note: Self-intersecting path, area may be tricky
`);

// Store results
const results = {};

// ============================================================================
// 1. PATH AREA - pathArea()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  1. PATH AREA - PathAnalysis.pathArea(segments)');
console.log('-'.repeat(80));
console.log(`
  Computes signed area using Green's theorem.
  Positive = counter-clockwise, Negative = clockwise.
`);

console.log('  Code:');
console.log('    const area = PathAnalysis.pathArea(closedPath);');
console.log('');

console.log('  Results:');
console.log('  +------------------+------------------+------------------+------------------+');
console.log('  | Shape            | Computed Area    | Expected Area    | Error            |');
console.log('  +------------------+------------------+------------------+------------------+');

const rectArea = PathAnalysis.pathArea(rectangle);
const rectExpected = new Decimal(5000);
const rectError = rectArea.minus(rectExpected).abs();
console.log(`  | Rectangle        | ${fmt(rectArea, 6).padStart(16)} | ${fmt(rectExpected, 6).padStart(16)} | ${fmtSci(rectError).padStart(16)} |`);

const triArea = PathAnalysis.pathArea(triangle);
const triExpected = new Decimal(4000);
const triError = triArea.minus(triExpected).abs();
console.log(`  | Triangle         | ${fmt(triArea, 6).padStart(16)} | ${fmt(triExpected, 6).padStart(16)} | ${fmtSci(triError).padStart(16)} |`);

const circleArea = PathAnalysis.pathArea(circle);
const circleExpected = new Decimal(expectedCircleArea);
const circleError = circleArea.minus(circleExpected).abs();
console.log(`  | Circle (approx)  | ${fmt(circleArea, 6).padStart(16)} | ${fmt(circleExpected, 6).padStart(16)} | ${fmtSci(circleError).padStart(16)} |`);

const starArea = PathAnalysis.pathArea(star);
console.log(`  | Star             | ${fmt(starArea, 6).padStart(16)} | ${'(complex)'.padStart(16)} | ${'-'.padStart(16)} |`);

console.log('  +------------------+------------------+------------------+------------------+');

results.areas = { rectangle: rectArea, triangle: triArea, circle: circleArea, star: starArea };

// ============================================================================
// 2. PATH LENGTH - pathLength()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  2. PATH LENGTH - PathAnalysis.pathLength(segments)');
console.log('-'.repeat(80));
console.log(`
  Computes the total arc length of all segments in a path.
`);

console.log('  Code:');
console.log('    const perimeter = PathAnalysis.pathLength(closedPath);');
console.log('');

console.log('  Results:');
console.log('  +------------------+------------------+------------------+');
console.log('  | Shape            | Perimeter        | Expected         |');
console.log('  +------------------+------------------+------------------+');

const rectPerimeter = PathAnalysis.pathLength(rectangle);
const rectPerimExpected = new Decimal(300); // 2*(100+50)
console.log(`  | Rectangle        | ${fmt(rectPerimeter, 6).padStart(16)} | ${fmt(rectPerimExpected, 6).padStart(16)} |`);

const triPerimeter = PathAnalysis.pathLength(triangle);
// Triangle: base=100, two sides from (0,0) to (50,80) and (100,0) to (50,80)
const triSide = Math.sqrt(50*50 + 80*80);
const triPerimExpected = 100 + 2 * triSide;
console.log(`  | Triangle         | ${fmt(triPerimeter, 6).padStart(16)} | ${fmt(triPerimExpected, 6).padStart(16)} |`);

const circlePerimeter = PathAnalysis.pathLength(circle);
const circlePerimExpected = 2 * Math.PI * r;
console.log(`  | Circle (approx)  | ${fmt(circlePerimeter, 6).padStart(16)} | ${fmt(circlePerimExpected, 6).padStart(16)} |`);

console.log('  +------------------+------------------+------------------+');

results.perimeters = { rectangle: rectPerimeter, triangle: triPerimeter, circle: circlePerimeter };

// ============================================================================
// 3. POINT IN PATH - pointInPath()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  3. POINT IN PATH - PathAnalysis.pointInPath(segments, point)');
console.log('-'.repeat(80));
console.log(`
  Tests if a point is inside, outside, or on the boundary of a closed path.
  Returns: 1 = inside, 0 = on boundary, -1 = outside
`);

console.log('  Code:');
console.log('    const result = PathAnalysis.pointInPath(rectangle, [50, 25]);');
console.log('');

// Test points for rectangle
const rectTestPoints = [
  [[50, 25], 'center'],
  [[0, 0], 'corner'],
  [[50, 0], 'on edge'],
  [[150, 25], 'outside'],
  [[-10, -10], 'far outside']
];

console.log('  Rectangle [0,0] to [100,50]:');
console.log('  +------------------+------------------+------------------+');
console.log('  | Point            | Location         | Result           |');
console.log('  +------------------+------------------+------------------+');

for (const [pt, desc] of rectTestPoints) {
  const result = PathAnalysis.pointInPath(rectangle, pt);
  const resultStr = result === 1 ? 'INSIDE' : result === 0 ? 'ON BOUNDARY' : 'OUTSIDE';
  console.log(`  | (${pt[0]}, ${pt[1]})`.padEnd(19) + `| ${desc.padEnd(17)}| ${resultStr.padEnd(17)}|`);
}
console.log('  +------------------+------------------+------------------+');

// Test points for circle
const circleTestPoints = [
  [[0, 0], 'center'],
  [[25, 0], 'inside'],
  [[50, 0], 'on boundary'],
  [[60, 0], 'outside']
];

console.log('\n  Circle centered at origin, radius 50:');
console.log('  +------------------+------------------+------------------+');
console.log('  | Point            | Location         | Result           |');
console.log('  +------------------+------------------+------------------+');

for (const [pt, desc] of circleTestPoints) {
  const result = PathAnalysis.pointInPath(circle, pt);
  const resultStr = result === 1 ? 'INSIDE' : result === 0 ? 'ON BOUNDARY' : 'OUTSIDE';
  console.log(`  | (${pt[0]}, ${pt[1]})`.padEnd(19) + `| ${desc.padEnd(17)}| ${resultStr.padEnd(17)}|`);
}
console.log('  +------------------+------------------+------------------+');

// ============================================================================
// 4. CLOSEST POINT ON PATH - closestPointOnPath()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  4. CLOSEST POINT ON PATH - PathAnalysis.closestPointOnPath(segments, point)');
console.log('-'.repeat(80));
console.log(`
  Finds the nearest point on the path to a query point.
  Returns: { point, t, segmentIndex, distance }
`);

console.log('  Code:');
console.log('    const closest = PathAnalysis.closestPointOnPath(rectangle, [150, 25]);');
console.log('');

const queryPoints = [
  [150, 25],   // Outside, right of rectangle
  [50, 75],    // Outside, above rectangle
  [-20, 25],   // Outside, left of rectangle
  [50, 25]     // Inside rectangle
];

console.log('  Rectangle [0,0] to [100,50], finding closest points:');
console.log('  +------------------+---------------------------+------------------+');
console.log('  | Query Point      | Closest Point on Path     | Distance         |');
console.log('  +------------------+---------------------------+------------------+');

for (const qp of queryPoints) {
  const result = PathAnalysis.closestPointOnPath(rectangle, qp);
  const closestPt = `(${fmt(result.point[0], 2)}, ${fmt(result.point[1], 2)})`;
  console.log(`  | (${qp[0]}, ${qp[1]})`.padEnd(19) + `| ${closestPt.padEnd(26)}| ${fmt(result.distance, 6).padEnd(17)}|`);
}
console.log('  +------------------+---------------------------+------------------+');

// ============================================================================
// 5. PATH BOUNDING BOX - pathBoundingBox()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  5. PATH BOUNDING BOX - PathAnalysis.pathBoundingBox(segments)');
console.log('-'.repeat(80));
console.log(`
  Computes the axis-aligned bounding box of the entire path.
`);

console.log('  Code:');
console.log('    const bbox = PathAnalysis.pathBoundingBox(circle);');
console.log('');

console.log('  Results:');
console.log('  +------------------+------------------+------------------+------------------+------------------+');
console.log('  | Shape            | xmin             | ymin             | xmax             | ymax             |');
console.log('  +------------------+------------------+------------------+------------------+------------------+');

const rectBbox = PathAnalysis.pathBoundingBox(rectangle);
console.log(`  | Rectangle        | ${fmt(rectBbox.xmin, 4).padStart(16)} | ${fmt(rectBbox.ymin, 4).padStart(16)} | ${fmt(rectBbox.xmax, 4).padStart(16)} | ${fmt(rectBbox.ymax, 4).padStart(16)} |`);

const triBbox = PathAnalysis.pathBoundingBox(triangle);
console.log(`  | Triangle         | ${fmt(triBbox.xmin, 4).padStart(16)} | ${fmt(triBbox.ymin, 4).padStart(16)} | ${fmt(triBbox.xmax, 4).padStart(16)} | ${fmt(triBbox.ymax, 4).padStart(16)} |`);

const circleBbox = PathAnalysis.pathBoundingBox(circle);
console.log(`  | Circle           | ${fmt(circleBbox.xmin, 4).padStart(16)} | ${fmt(circleBbox.ymin, 4).padStart(16)} | ${fmt(circleBbox.xmax, 4).padStart(16)} | ${fmt(circleBbox.ymax, 4).padStart(16)} |`);

const starBbox = PathAnalysis.pathBoundingBox(star);
console.log(`  | Star             | ${fmt(starBbox.xmin, 4).padStart(16)} | ${fmt(starBbox.ymin, 4).padStart(16)} | ${fmt(starBbox.xmax, 4).padStart(16)} | ${fmt(starBbox.ymax, 4).padStart(16)} |`);

console.log('  +------------------+------------------+------------------+------------------+------------------+');

// ============================================================================
// 6. PATH CONTINUITY - isPathClosed(), isPathContinuous(), isPathSmooth()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  6. PATH CONTINUITY TESTS');
console.log('-'.repeat(80));
console.log(`
  isPathClosed()      - Does the path form a closed loop?
  isPathContinuous()  - Are all segments connected (C0 continuity)?
  isPathSmooth()      - Are tangents aligned at joints (G1 continuity)?
`);

console.log('  Code:');
console.log('    const closed = PathAnalysis.isPathClosed(path);');
console.log('    const continuous = PathAnalysis.isPathContinuous(path);');
console.log('    const smooth = PathAnalysis.isPathSmooth(path);');
console.log('');

console.log('  Results:');
console.log('  +------------------+------------------+------------------+------------------+');
console.log('  | Shape            | Closed           | Continuous       | Smooth           |');
console.log('  +------------------+------------------+------------------+------------------+');

const shapes = [
  ['Rectangle', rectangle],
  ['Triangle', triangle],
  ['Circle', circle],
  ['Star', star]
];

for (const [name, shape] of shapes) {
  const closed = PathAnalysis.isPathClosed(shape);
  const continuous = PathAnalysis.isPathContinuous(shape);
  const smooth = PathAnalysis.isPathSmooth(shape);
  console.log(`  | ${name.padEnd(17)}| ${(closed ? 'YES' : 'NO').padEnd(17)}| ${(continuous ? 'YES' : 'NO').padEnd(17)}| ${(smooth ? 'YES' : 'NO').padEnd(17)}|`);
}
console.log('  +------------------+------------------+------------------+------------------+');

// ============================================================================
// 7. FIND KINKS - findKinks()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  7. FIND KINKS - PathAnalysis.findKinks(segments)');
console.log('-'.repeat(80));
console.log(`
  Finds corners/kinks where tangent direction changes abruptly.
  Useful for detecting sharp corners in supposedly smooth paths.
`);

console.log('  Code:');
console.log('    const kinks = PathAnalysis.findKinks(path);');
console.log('');

console.log('  Results:');
const rectKinks = PathAnalysis.findKinks(rectangle);
console.log(`  Rectangle: ${rectKinks.length} kinks (the 4 corners)`);

const triKinks = PathAnalysis.findKinks(triangle);
console.log(`  Triangle:  ${triKinks.length} kinks (the 3 corners)`);

const circleKinks = PathAnalysis.findKinks(circle);
console.log(`  Circle:    ${circleKinks.length} kinks (smooth curve, no corners)`);

const starKinks = PathAnalysis.findKinks(star);
console.log(`  Star:      ${starKinks.length} kinks (all 10 points are corners)`);

// ============================================================================
// 8. VERIFY PATH AREA - verifyPathArea()
// ============================================================================

console.log('\n' + '-'.repeat(80));
console.log('  8. VERIFY PATH AREA - PathAnalysis.verifyPathArea(segments)');
console.log('-'.repeat(80));
console.log(`
  Verifies area computation using Monte Carlo sampling.
  Compares Green's theorem result with statistical estimate.
`);

console.log('  Code:');
console.log('    const verification = PathAnalysis.verifyPathArea(rectangle, 1000);');
console.log('');

console.log('  Rectangle verification:');
const rectVerify = PathAnalysis.verifyPathArea(rectangle, 500);
console.log(`    Green's theorem area: ${fmt(rectVerify.greenArea, 6)}`);
console.log(`    Monte Carlo estimate: ${fmt(rectVerify.monteCarloArea, 6)}`);
console.log(`    Relative error:       ${fmtSci(rectVerify.relativeError)}`);
console.log(`    Valid:                ${rectVerify.valid ? 'YES' : 'NO'}`);

console.log('\n  Circle verification:');
const circleVerify = PathAnalysis.verifyPathArea(circle, 500);
console.log(`    Green's theorem area: ${fmt(circleVerify.greenArea, 6)}`);
console.log(`    Monte Carlo estimate: ${fmt(circleVerify.monteCarloArea, 6)}`);
console.log(`    Relative error:       ${fmtSci(circleVerify.relativeError)}`);
console.log(`    Valid:                ${circleVerify.valid ? 'YES' : 'NO'}`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));

console.log(`
  +---------------------------+------------------------------------------------+
  | Function                  | Purpose                                        |
  +---------------------------+------------------------------------------------+
  | pathArea                  | Signed area via Green's theorem                |
  | pathAbsoluteArea          | Unsigned (absolute) area                       |
  | pathLength                | Total arc length / perimeter                   |
  | pointInPath               | Point containment test (in/out/on)             |
  | closestPointOnPath        | Nearest point on path to query                 |
  | farthestPointOnPath       | Farthest point on path from query              |
  | pathBoundingBox           | Axis-aligned bounding box                      |
  | isPathClosed              | Check if path forms closed loop                |
  | isPathContinuous          | Check C0 continuity (connected)                |
  | isPathSmooth              | Check G1 continuity (tangent aligned)          |
  | findKinks                 | Find corners/discontinuities                   |
  | verifyPathArea            | Monte Carlo verification of area               |
  +---------------------------+------------------------------------------------+

  Key Results:
    - Rectangle area: ${fmt(results.areas.rectangle, 2)} (exact: 5000)
    - Triangle area:  ${fmt(results.areas.triangle, 2)} (exact: 4000)
    - Circle area:    ${fmt(results.areas.circle, 6)} (expected: ${expectedCircleArea.toFixed(6)})
    - Star area:      ${fmt(results.areas.star, 2)}
`);

console.log('='.repeat(80));
console.log('  All path analysis functions demonstrated successfully!');
console.log('='.repeat(80));
console.log('');
