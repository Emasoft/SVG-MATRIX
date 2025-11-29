import Decimal from 'decimal.js';
import { Matrix } from '../src/matrix.js';
import * as GeometryToPath from '../src/geometry-to-path.js';

// Set high precision for tests
Decimal.set({ precision: 80 });

/**
 * Test suite for geometry-to-path module
 * Tests arbitrary-precision SVG geometry to path conversion
 */

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`✓ Test ${testCount}: ${message}`);
  } else {
    failCount++;
    console.error(`✗ Test ${testCount}: ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff < tolerance, `${message} (expected ${expected}, got ${actual}, diff ${diff})`);
}

function assertDecimalApprox(actual, expected, tolerance, message) {
  const actualD = actual instanceof Decimal ? actual : new Decimal(actual);
  const expectedD = new Decimal(expected);
  const diff = actualD.minus(expectedD).abs();
  assert(diff.lt(tolerance), `${message} (expected ${expectedD.toString()}, got ${actualD.toString()})`);
}

console.log('=== Geometry to Path Conversion Tests ===\n');

// ===== Test getKappa =====
console.log('--- getKappa() tests ---');

const kappa = GeometryToPath.getKappa();
assertDecimalApprox(kappa, 0.5522847498307933, 1e-15, 'getKappa returns correct value');
assert(kappa instanceof Decimal, 'getKappa returns Decimal instance');

const kappaComputed = new Decimal(4).mul(new Decimal(2).sqrt().minus(1)).div(3);
assert(kappa.equals(kappaComputed), 'getKappa matches manual calculation');

// ===== Test circleToPathData =====
console.log('\n--- circleToPathData() tests ---');

const circlePath = GeometryToPath.circleToPathData(100, 100, 50, 6);
assert(typeof circlePath === 'string', 'circleToPathData returns string');
assert(circlePath.startsWith('M '), 'Circle path starts with M command');
assert(circlePath.endsWith(' Z'), 'Circle path ends with Z command');
assert(circlePath.includes(' C '), 'Circle path contains C commands');

// Check that circle starts at rightmost point (cx + r, cy)
assert(circlePath.startsWith('M 150 100'), 'Circle starts at rightmost point');

// Test circle with high precision
const circleHP = GeometryToPath.circleToPathData(0, 0, 1, 15);
assert(circleHP.includes('1.000000000000000'), 'High precision circle has correct decimal places');

// Test circle at origin
const circleOrigin = GeometryToPath.circleToPathData(0, 0, 10, 6);
assert(circleOrigin.startsWith('M 10 0'), 'Circle at origin starts at (r, 0)');

// Test circle with Decimal inputs
const circleDecimal = GeometryToPath.circleToPathData(new Decimal(50), new Decimal(50), new Decimal(25), 6);
assert(circleDecimal.startsWith('M 75 50'), 'Circle with Decimal inputs works correctly');

// ===== Test ellipseToPathData =====
console.log('\n--- ellipseToPathData() tests ---');

const ellipsePath = GeometryToPath.ellipseToPathData(100, 100, 50, 30, 6);
assert(typeof ellipsePath === 'string', 'ellipseToPathData returns string');
assert(ellipsePath.startsWith('M 150 100'), 'Ellipse starts at (cx + rx, cy)');
assert(ellipsePath.endsWith(' Z'), 'Ellipse path ends with Z command');

// Test circular ellipse (rx = ry) matches circle
const ellipseCircular = GeometryToPath.ellipseToPathData(100, 100, 50, 50, 6);
const circleEquiv = GeometryToPath.circleToPathData(100, 100, 50, 6);
assert(ellipseCircular === circleEquiv, 'Circular ellipse matches circle');

// Test ellipse with different radii
const ellipseWide = GeometryToPath.ellipseToPathData(0, 0, 100, 50, 6);
assert(ellipseWide.startsWith('M 100 0'), 'Wide ellipse starts at correct point');

// ===== Test rectToPathData =====
console.log('\n--- rectToPathData() tests ---');

// Sharp-cornered rectangle
const rectSharp = GeometryToPath.rectToPathData(10, 10, 100, 50, 0, 0, false, 6);
assert(rectSharp.includes(' L '), 'Sharp rect uses L commands');
assert(rectSharp.endsWith(' Z'), 'Rect path ends with Z');
assert(rectSharp.startsWith('M 10 10'), 'Rect starts at top-left corner');

// Rounded rectangle with Bezier curves
const rectRounded = GeometryToPath.rectToPathData(10, 10, 100, 50, 5, 5, false, 6);
assert(rectRounded.includes(' C '), 'Rounded rect with Bezier uses C commands');
assert(!rectRounded.includes(' A '), 'Rounded rect with Bezier does not use A commands');

// Rounded rectangle with arcs
const rectArc = GeometryToPath.rectToPathData(10, 10, 100, 50, 5, 5, true, 6);
assert(rectArc.includes(' A '), 'Rounded rect with arcs uses A commands');
assert(rectArc.includes(' L '), 'Rounded rect with arcs uses L commands');

// Test rx/ry clamping (rx > width/2)
const rectClamped = GeometryToPath.rectToPathData(0, 0, 100, 50, 60, 30, false, 6);
assert(rectClamped.includes('M 50 0'), 'Rect with clamped rx starts at half width');

// Test ry defaults to rx
const rectDefaultRy = GeometryToPath.rectToPathData(0, 0, 100, 50, 10, null, false, 6);
assert(rectDefaultRy.includes(' C '), 'Rect with rx but no ry creates rounded corners');

// ===== Test lineToPathData =====
console.log('\n--- lineToPathData() tests ---');

const line = GeometryToPath.lineToPathData(10, 20, 50, 80, 6);
assert(line === 'M 10 20 L 50 80', 'Line path has correct format');
assert(!line.includes(' Z'), 'Line path is not closed');

const lineOrigin = GeometryToPath.lineToPathData(0, 0, 100, 100, 6);
assert(lineOrigin === 'M 0 0 L 100 100', 'Diagonal line has correct format');

// ===== Test polylineToPathData =====
console.log('\n--- polylineToPathData() tests ---');

const polyline = GeometryToPath.polylineToPathData('10,10 50,50 90,10', 6);
assert(polyline.startsWith('M 10 10'), 'Polyline starts with M command');
assert(polyline.includes('L 50 50'), 'Polyline includes intermediate points');
assert(!polyline.endsWith(' Z'), 'Polyline is not closed');

// Test with array input
const polylineArray = GeometryToPath.polylineToPathData([[0, 0], [10, 20], [30, 15]], 6);
assert(polylineArray.includes('M 0 0'), 'Polyline from array has correct start');
assert(polylineArray.includes('L 10 20'), 'Polyline from array includes all points');

// Test with space-separated points
const polylineSpaced = GeometryToPath.polylineToPathData('0 0 100 0 100 100', 6);
assert(polylineSpaced === 'M 0 0 L 100 0 L 100 100', 'Space-separated polyline works');

// ===== Test polygonToPathData =====
console.log('\n--- polygonToPathData() tests ---');

const polygon = GeometryToPath.polygonToPathData('0,0 50,100 100,0', 6);
assert(polygon.startsWith('M 0 0'), 'Polygon starts with M command');
assert(polygon.endsWith(' Z'), 'Polygon is closed with Z');
assert(polygon.includes('L 50 100'), 'Polygon includes all vertices');

const square = GeometryToPath.polygonToPathData([[0, 0], [100, 0], [100, 100], [0, 100]], 6);
assert(square.endsWith(' Z'), 'Square polygon is closed');

// ===== Test parsePathData =====
console.log('\n--- parsePathData() tests ---');

const parsed1 = GeometryToPath.parsePathData('M 10 20 L 30 40 Z');
assert(parsed1.length === 3, 'parsePathData returns correct number of commands');
assert(parsed1[0].command === 'M', 'First command is M');
assert(parsed1[0].args.length === 2, 'M command has 2 arguments');
assert(parsed1[0].args[0].equals(10), 'First M argument is 10');
assert(parsed1[2].command === 'Z', 'Last command is Z');
assert(parsed1[2].args.length === 0, 'Z command has no arguments');

const parsed2 = GeometryToPath.parsePathData('M 0 0 C 10 0 20 10 20 20');
assert(parsed2[1].command === 'C', 'Cubic command parsed correctly');
assert(parsed2[1].args.length === 6, 'Cubic command has 6 arguments');

const parsedArc = GeometryToPath.parsePathData('M 0 0 A 50 50 0 0 1 100 0');
assert(parsedArc[1].command === 'A', 'Arc command parsed correctly');
assert(parsedArc[1].args.length === 7, 'Arc command has 7 arguments');

// ===== Test pathArrayToString =====
console.log('\n--- pathArrayToString() tests ---');

const commands = [
  { command: 'M', args: [new Decimal(10), new Decimal(20)] },
  { command: 'L', args: [new Decimal(30), new Decimal(40)] },
  { command: 'Z', args: [] }
];
const pathStr = GeometryToPath.pathArrayToString(commands, 6);
assert(pathStr === 'M 10 20 L 30 40 Z', 'pathArrayToString formats correctly');

// Test with different precision
const pathStrHP = GeometryToPath.pathArrayToString(commands, 2);
assert(pathStrHP === 'M 10 20 L 30 40 Z', 'pathArrayToString with low precision works');

// ===== Test pathToAbsolute =====
console.log('\n--- pathToAbsolute() tests ---');

const relative = 'M 10 10 l 20 0 l 0 20 z';
const absolute = GeometryToPath.pathToAbsolute(relative);
assert(absolute.includes('M 10 10'), 'Absolute path preserves M command');
assert(absolute.includes('L 30 10'), 'Relative l converted to absolute L');
assert(absolute.includes('L 30 30'), 'Chained relative commands work correctly');

const relCurve = 'M 0 0 c 10 0 20 10 20 20';
const absCurve = GeometryToPath.pathToAbsolute(relCurve);
assert(absCurve.includes('C 10 0 20 10 20 20'), 'Relative cubic converted to absolute');

const relH = 'M 10 10 h 50';
const absH = GeometryToPath.pathToAbsolute(relH);
assert(absH.includes('L 60 10'), 'Relative h converted to absolute L');

const relV = 'M 10 10 v 50';
const absV = GeometryToPath.pathToAbsolute(relV);
assert(absV.includes('L 10 60'), 'Relative v converted to absolute L');

// ===== Test pathToCubics =====
console.log('\n--- pathToCubics() tests ---');

const lineToC = GeometryToPath.pathToCubics('M 0 0 L 100 100 Z');
assert(lineToC.includes('C '), 'Line converted to cubic Bezier');
assert(lineToC.includes('C 0 0 100 100 100 100'), 'Line becomes degenerate cubic');

const quadToC = GeometryToPath.pathToCubics('M 0 0 Q 50 100 100 0');
assert(quadToC.includes('C '), 'Quadratic converted to cubic');
assert(!quadToC.includes('Q '), 'No quadratic commands remain');

// ===== Test transformPathData =====
console.log('\n--- transformPathData() tests ---');

// Translation
const T = Matrix.from([[1, 0, 10], [0, 1, 20], [0, 0, 1]]);
const pathOrig = 'M 0 0 L 100 0 L 100 100 Z';
const pathTrans = GeometryToPath.transformPathData(pathOrig, T, 6);
assert(pathTrans.includes('M 10 20'), 'Translation transforms M command correctly');
assert(pathTrans.includes('L 110 20'), 'Translation transforms first L command');
assert(pathTrans.includes('L 110 120'), 'Translation transforms second L command');

// Scaling
const S = Matrix.from([[2, 0, 0], [0, 2, 0], [0, 0, 1]]);
const pathScaled = GeometryToPath.transformPathData('M 10 10 L 20 20', S, 6);
assert(pathScaled.includes('M 20 20'), 'Scaling transforms coordinates correctly');
assert(pathScaled.includes('L 40 40'), 'Scaling applies to all points');

// Test with cubic Bezier
const pathCubic = 'M 0 0 C 10 0 20 10 20 20';
const cubicTrans = GeometryToPath.transformPathData(pathCubic, T, 6);
assert(cubicTrans.includes('C 20 20'), 'Translation transforms control points');

// ===== Test transformArcParams =====
console.log('\n--- transformArcParams() tests ---');

// Identity transformation preserves arc
const I = Matrix.identity(3);
const [rx1, ry1, rot1, large1, sweep1, x1, y1] =
  GeometryToPath.transformArcParams(50, 30, 0, 0, 1, 100, 0, I);
assertDecimalApprox(rx1, 50, 1e-6, 'Identity preserves rx');
assertDecimalApprox(ry1, 30, 1e-6, 'Identity preserves ry');
assertDecimalApprox(x1, 100, 1e-6, 'Identity preserves endpoint x');
assertDecimalApprox(y1, 0, 1e-6, 'Identity preserves endpoint y');

// Scale transformation
const S2 = Matrix.from([[2, 0, 0], [0, 2, 0], [0, 0, 1]]);
const [rx2, ry2, rot2, large2, sweep2, x2, y2] =
  GeometryToPath.transformArcParams(50, 50, 0, 0, 1, 100, 0, S2);
assertDecimalApprox(x2, 200, 1e-6, 'Scale transforms endpoint');
assert(rx2.toNumber() > 90, 'Scale increases radius');

// Mirror transformation flips sweep
const M = Matrix.from([[-1, 0, 0], [0, 1, 0], [0, 0, 1]]);
const [rx3, ry3, rot3, large3, sweep3, x3, y3] =
  GeometryToPath.transformArcParams(50, 50, 0, 0, 1, 100, 0, M);
assert(sweep3 === 0, 'Mirror flips sweep flag from 1 to 0');
assertDecimalApprox(x3, -100, 1e-6, 'Mirror reflects endpoint x');

// ===== Test convertElementToPath =====
console.log('\n--- convertElementToPath() tests ---');

const circleObj = { tagName: 'circle', cx: 100, cy: 100, r: 50 };
const circleConv = GeometryToPath.convertElementToPath(circleObj, 6);
assert(circleConv !== null, 'Circle object converts successfully');
assert(circleConv.includes('M 150 100'), 'Converted circle has correct path');

const rectObj = { tagName: 'rect', x: 10, y: 10, width: 100, height: 50 };
const rectConv = GeometryToPath.convertElementToPath(rectObj, 6);
assert(rectConv !== null, 'Rect object converts successfully');
assert(rectConv.includes('M 10 10'), 'Converted rect starts at correct position');

const lineObj = { tagName: 'line', x1: 0, y1: 0, x2: 100, y2: 100 };
const lineConv = GeometryToPath.convertElementToPath(lineObj, 6);
assert(lineConv === 'M 0 0 L 100 100', 'Line object converts correctly');

const polyObj = { tagName: 'polygon', points: '0,0 100,0 50,100' };
const polyConv = GeometryToPath.convertElementToPath(polyObj, 6);
assert(polyConv.endsWith(' Z'), 'Polygon object creates closed path');

const unknownObj = { tagName: 'unknown' };
const unknownConv = GeometryToPath.convertElementToPath(unknownObj, 6);
assert(unknownConv === null, 'Unknown element returns null');

// ===== Test precision handling =====
console.log('\n--- Precision tests ---');

const circleLowPrec = GeometryToPath.circleToPathData(100, 100, 50, 2);
assert(circleLowPrec.includes('150'), 'Low precision circle has short decimals');
assert(!circleLowPrec.includes('150.000000'), 'Low precision does not over-format');

const circleHighPrec = GeometryToPath.circleToPathData(100, 100, 50, 10);
assert(circleHighPrec.includes('.'), 'High precision circle has decimal points');

// ===== Summary =====
console.log('\n=== Test Summary ===');
console.log(`Total tests: ${testCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.error(`\n✗ ${failCount} test(s) failed`);
  process.exit(1);
}
