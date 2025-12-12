/**
 * SVG Boolean Operations with Fill-Rule and Stroke Support Example
 *
 * Demonstrates:
 * 1. Fill-rule differences (nonzero vs evenodd)
 * 2. Stroked paths adding area
 * 3. Dash arrays reducing stroke area
 * 4. Different SVG elements converted to paths
 * 5. Mixed fill-rule boolean operations
 *
 * Run with: node test/svg-boolean-ops-example.js
 */

import {
  FillRule,
  pointInPolygonWithRule,
  rectToPolygon,
  circleToPolygon,
  ellipseToPolygon,
  lineToPolygon,
  offsetPolygon,
  strokeToFilledPolygon,
  applyDashArray,
  SVGRegion,
  regionIntersection,
  regionUnion,
  regionDifference,
  regionXOR
} from '../src/svg-boolean-ops.js';

import { PolygonClip } from '../src/index.js';
import { writeFileSync } from 'fs';
import Decimal from 'decimal.js';

Decimal.set({ precision: 80 });

const { point, polygonArea } = PolygonClip;

// Helper to format numbers
const fmt = (d, digits = 2) => {
  if (d instanceof Decimal) return d.toNumber().toFixed(digits);
  return Number(d).toFixed(digits);
};

// Helper to convert polygon to SVG path
function polygonToPath(polygon) {
  if (!polygon || polygon.length < 3) return '';
  const pts = polygon.map(p => fmt(p.x, 2) + ',' + fmt(p.y, 2));
  return 'M ' + pts.join(' L ') + ' Z';
}

console.log('='.repeat(80));
console.log('  SVG Boolean Operations with Fill-Rule and Stroke Support');
console.log('='.repeat(80));

// ============================================================================
// TEST 1: Fill Rule Differences
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST 1: Fill Rule Differences (nonzero vs evenodd)');
console.log('='.repeat(80));

// Create a self-intersecting "bowtie" polygon
// This shape creates a figure-8 that shows fill rule differences
const bowtie = [
  point(0, 0),
  point(100, 100),
  point(100, 0),
  point(0, 100)
];

// Test point in the center (where paths cross)
const centerPoint = point(50, 50);

const insideNonzero = pointInPolygonWithRule(centerPoint, bowtie, FillRule.NONZERO);
const insideEvenodd = pointInPolygonWithRule(centerPoint, bowtie, FillRule.EVENODD);

console.log('\n  Self-intersecting "bowtie" polygon:');
console.log('    Vertices: (0,0) -> (100,100) -> (100,0) -> (0,100)');
console.log('\n  Point (50, 50) at center:');
console.log('    With nonzero: ' + (insideNonzero >= 0 ? 'INSIDE' : 'OUTSIDE') + ' (winding adds up)');
console.log('    With evenodd: ' + (insideEvenodd >= 0 ? 'INSIDE' : 'OUTSIDE') + ' (crossings cancel out)');
console.log('\n  This demonstrates why fill-rule matters for boolean operations!');

// ============================================================================
// TEST 2: Stroke Adding Area
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST 2: Stroke Adding Area to a Shape');
console.log('='.repeat(80));

// A simple square
const square = rectToPolygon({ x: 50, y: 50, width: 100, height: 100 });
const squareArea = polygonArea(square);

// Add stroke width of 20 (10 on each side)
const strokedSquare = strokeToFilledPolygon(square, {
  width: 20,
  linejoin: 'miter',
  miterLimit: 4
});
const strokedArea = polygonArea(strokedSquare);

console.log('\n  Original square: 100x100 at (50,50)');
console.log('    Fill area: ' + fmt(squareArea) + ' sq units');
console.log('\n  With stroke-width: 20 (miter join)');
console.log('    Stroke outline area: ' + fmt(strokedArea) + ' sq units');
console.log('    Area increase: ' + fmt(strokedArea.minus(squareArea)) + ' sq units');
console.log('\n  The stroke adds ~' + fmt(strokedArea.div(squareArea).minus(1).times(100)) + '% more area!');

// ============================================================================
// TEST 3: Dash Array Reducing Stroke Area
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST 3: Dash Array Reducing Stroke Area');
console.log('='.repeat(80));

// Apply dash array to a line
const line = lineToPolygon(
  { x1: 0, y1: 50, x2: 200, y2: 50 },
  { width: 10, linecap: 'butt' }
);
const lineArea = polygonArea(line);

// With dash array [20, 10] (20px dash, 10px gap)
const dashedSegments = applyDashArray(
  [point(0, 50), point(200, 50)],
  [20, 10],
  0
);

console.log('\n  Solid line: 200px long, stroke-width: 10');
console.log('    Area: ' + fmt(lineArea) + ' sq units (200 x 10 = 2000)');
console.log('\n  With stroke-dasharray: "20 10"');
console.log('    Creates ' + dashedSegments.length + ' dash segments');
console.log('    Each segment is 20px long, 10px gaps between');
console.log('    Effective stroke area reduced by 33%');

// ============================================================================
// TEST 4: SVG Element Conversions
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST 4: SVG Element to Polygon Conversions');
console.log('='.repeat(80));

// Rectangle
const rect = rectToPolygon({ x: 0, y: 0, width: 100, height: 50 });
console.log('\n  <rect x="0" y="0" width="100" height="50"/>');
console.log('    Vertices: ' + rect.length);
console.log('    Area: ' + fmt(polygonArea(rect)) + ' sq units');

// Rounded rectangle
const roundedRect = rectToPolygon({ x: 0, y: 0, width: 100, height: 50, rx: 10, ry: 10 });
console.log('\n  <rect x="0" y="0" width="100" height="50" rx="10" ry="10"/>');
console.log('    Vertices: ' + roundedRect.length + ' (approximated corners)');
console.log('    Area: ' + fmt(polygonArea(roundedRect)) + ' sq units (slightly less due to corners)');

// Circle
const circle = circleToPolygon({ cx: 50, cy: 50, r: 30 }, 32);
console.log('\n  <circle cx="50" cy="50" r="30"/>');
console.log('    Vertices: ' + circle.length + ' (32-segment approximation)');
console.log('    Area: ' + fmt(polygonArea(circle)) + ' sq units (true: ' + fmt(Math.PI * 30 * 30) + ')');

// Ellipse
const ellipse = ellipseToPolygon({ cx: 50, cy: 50, rx: 40, ry: 20 }, 32);
console.log('\n  <ellipse cx="50" cy="50" rx="40" ry="20"/>');
console.log('    Vertices: ' + ellipse.length);
console.log('    Area: ' + fmt(polygonArea(ellipse)) + ' sq units (true: ' + fmt(Math.PI * 40 * 20) + ')');

// ============================================================================
// TEST 5: Mixed Fill-Rule Boolean Operations
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  TEST 5: Boolean Operations with Different Fill Rules');
console.log('='.repeat(80));

// Region A: Simple filled square (nonzero)
const regionA = SVGRegion.fromElement('rect', {
  x: 0, y: 0, width: 100, height: 100
}, {
  fill: 'blue',
  fillRule: FillRule.NONZERO,
  stroke: 'none'
});

// Region B: Circle with stroke (adds area beyond the geometric circle)
const regionB = SVGRegion.fromElement('circle', {
  cx: 80, cy: 80, r: 40
}, {
  fill: 'red',
  fillRule: FillRule.NONZERO,
  stroke: 'black',
  strokeWidth: 10,
  strokeLinejoin: 'round'
});

console.log('\n  Region A: Blue square (0,0) to (100,100)');
console.log('    Fill rule: nonzero');
console.log('    Fill area: 10000 sq units');

console.log('\n  Region B: Red circle at (80,80) radius 40, stroke-width 10');
console.log('    Fill rule: nonzero');
console.log('    Fill area: ~' + fmt(Math.PI * 40 * 40) + ' sq units');
console.log('    Stroke adds area: circle expands to effective radius ~50');

// Compute boolean operations
const intersection = regionIntersection(regionA, regionB);
const union = regionUnion(regionA, regionB);
const difference = regionDifference(regionA, regionB);

console.log('\n  Boolean operation results:');

let totalArea = new Decimal(0);
for (const poly of intersection.getAllPolygons()) {
  totalArea = totalArea.plus(polygonArea(poly).abs());
}
console.log('    A AND B (intersection): ' + fmt(totalArea) + ' sq units');

totalArea = new Decimal(0);
for (const poly of union.getAllPolygons()) {
  totalArea = totalArea.plus(polygonArea(poly).abs());
}
console.log('    A OR B (union): ' + fmt(totalArea) + ' sq units');

totalArea = new Decimal(0);
for (const poly of difference.getAllPolygons()) {
  totalArea = totalArea.plus(polygonArea(poly).abs());
}
console.log('    A - B (difference): ' + fmt(totalArea) + ' sq units');

// ============================================================================
// GENERATE SVG OUTPUT
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  GENERATING SVG OUTPUT');
console.log('='.repeat(80));

const svgContent = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 700 500" width="700" height="500">\n' +
'  <title>SVG Boolean Operations with Fill-Rule and Stroke</title>\n' +
'  <style>\n' +
'    text { font-family: monospace; font-size: 12px; }\n' +
'    .label { font-weight: bold; }\n' +
'  </style>\n' +
'  <rect x="-20" y="-20" width="700" height="500" fill="#f5f5f5"/>\n' +
'\n' +
'  <!-- TEST 1: Fill Rule Differences -->\n' +
'  <g transform="translate(0, 0)">\n' +
'    <text x="60" y="15" class="label">Fill Rule: nonzero</text>\n' +
'    <path d="M 0,30 L 100,130 L 100,30 L 0,130 Z"\n' +
'          fill="blue" fill-opacity="0.5" fill-rule="nonzero"\n' +
'          stroke="blue" stroke-width="2"/>\n' +
'    <circle cx="50" cy="80" r="5" fill="' + (insideNonzero >= 0 ? 'green' : 'red') + '"/>\n' +
'    <text x="60" y="155">Center: ' + (insideNonzero >= 0 ? 'INSIDE' : 'OUTSIDE') + '</text>\n' +
'  </g>\n' +
'\n' +
'  <g transform="translate(150, 0)">\n' +
'    <text x="60" y="15" class="label">Fill Rule: evenodd</text>\n' +
'    <path d="M 0,30 L 100,130 L 100,30 L 0,130 Z"\n' +
'          fill="blue" fill-opacity="0.5" fill-rule="evenodd"\n' +
'          stroke="blue" stroke-width="2"/>\n' +
'    <circle cx="50" cy="80" r="5" fill="' + (insideEvenodd >= 0 ? 'green' : 'red') + '"/>\n' +
'    <text x="60" y="155">Center: ' + (insideEvenodd >= 0 ? 'INSIDE' : 'OUTSIDE') + '</text>\n' +
'  </g>\n' +
'\n' +
'  <!-- TEST 2: Stroke Adding Area -->\n' +
'  <g transform="translate(320, 0)">\n' +
'    <text x="80" y="15" class="label">Stroke Adds Area</text>\n' +
'    <!-- Original square outline -->\n' +
'    <rect x="30" y="30" width="100" height="100"\n' +
'          fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="4"/>\n' +
'    <!-- Stroked square -->\n' +
'    <path d="' + polygonToPath(strokedSquare) + '"\n' +
'          fill="rgba(255,100,100,0.5)" stroke="red" stroke-width="1"/>\n' +
'    <text x="30" y="155">Original: 10000 sq</text>\n' +
'    <text x="30" y="170">With stroke: ' + fmt(strokedArea) + ' sq</text>\n' +
'  </g>\n' +
'\n' +
'  <!-- TEST 3: Different Elements -->\n' +
'  <g transform="translate(500, 0)">\n' +
'    <text x="60" y="15" class="label">Element Types</text>\n' +
'    <path d="' + polygonToPath(rect) + '" transform="translate(10, 30)"\n' +
'          fill="rgba(100,100,255,0.5)" stroke="blue"/>\n' +
'    <path d="' + polygonToPath(circle) + '" transform="translate(10, 50)"\n' +
'          fill="rgba(100,255,100,0.5)" stroke="green"/>\n' +
'  </g>\n' +
'\n' +
'  <!-- TEST 4: Boolean Operations -->\n' +
'  <g transform="translate(0, 200)">\n' +
'    <text x="80" y="15" class="label">Input Shapes</text>\n' +
'    <rect x="0" y="30" width="100" height="100"\n' +
'          fill="rgba(59, 130, 246, 0.4)" stroke="#3b82f6" stroke-width="2"/>\n' +
'    <circle cx="80" cy="110" r="40"\n' +
'            fill="rgba(239, 68, 68, 0.4)" stroke="#ef4444" stroke-width="2"/>\n' +
'    <circle cx="80" cy="110" r="50"\n' +
'            fill="none" stroke="#ef4444" stroke-width="1" stroke-dasharray="4"/>\n' +
'    <text x="0" y="180">Square + Circle (with stroke)</text>\n' +
'  </g>\n' +
'\n' +
'  <g transform="translate(170, 200)">\n' +
'    <text x="60" y="15" class="label">Intersection</text>\n' +
intersection.getAllPolygons().map(poly =>
'    <path d="' + polygonToPath(poly) + '" transform="translate(0, 30)"\n' +
'          fill="rgba(34, 197, 94, 0.6)" stroke="#16a34a" stroke-width="2"/>\n'
).join('') +
'  </g>\n' +
'\n' +
'  <g transform="translate(340, 200)">\n' +
'    <text x="60" y="15" class="label">Union</text>\n' +
union.getAllPolygons().map(poly =>
'    <path d="' + polygonToPath(poly) + '" transform="translate(0, 30)"\n' +
'          fill="rgba(168, 85, 247, 0.5)" stroke="#9333ea" stroke-width="2"/>\n'
).join('') +
'  </g>\n' +
'\n' +
'  <g transform="translate(510, 200)">\n' +
'    <text x="60" y="15" class="label">Difference</text>\n' +
difference.getAllPolygons().map(poly =>
'    <path d="' + polygonToPath(poly) + '" transform="translate(0, 30)"\n' +
'          fill="rgba(251, 146, 60, 0.6)" stroke="#f97316" stroke-width="2"/>\n'
).join('') +
'  </g>\n' +
'\n' +
'  <!-- Legend -->\n' +
'  <g transform="translate(500, 380)">\n' +
'    <rect x="0" y="0" width="180" height="80" fill="white" stroke="#ccc" rx="5"/>\n' +
'    <text x="90" y="15" text-anchor="middle" class="label">Fill Rules Matter!</text>\n' +
'    <text x="10" y="35" font-size="10">nonzero: winding != 0</text>\n' +
'    <text x="10" y="50" font-size="10">evenodd: crossings % 2 == 1</text>\n' +
'    <text x="10" y="65" font-size="10">Stroke adds area beyond path</text>\n' +
'  </g>\n' +
'</svg>';

const outputPath = 'test/svg-boolean-ops-result.svg';
writeFileSync(outputPath, svgContent);
console.log('\n  SVG written to: ' + outputPath);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  SUMMARY');
console.log('='.repeat(80));
console.log('\n' +
'  Key insights for SVG boolean operations:\n' +
'\n' +
'  1. FILL RULE affects what area is "inside" a path:\n' +
'     - nonzero: all areas where winding number != 0\n' +
'     - evenodd: areas with odd crossing count (creates holes)\n' +
'\n' +
'  2. STROKE adds area beyond the geometric path:\n' +
'     - stroke-width expands the shape\n' +
'     - linecap affects endpoints (butt/round/square)\n' +
'     - linejoin affects corners (miter/round/bevel)\n' +
'\n' +
'  3. DASH ARRAY reduces stroke area:\n' +
'     - Creates gaps in the stroke\n' +
'     - Each dash segment is a separate filled region\n' +
'\n' +
'  4. BOOLEAN OPERATIONS work on RENDERED AREAS:\n' +
'     - Path A (evenodd, has holes) AND Path B (nonzero, solid)\n' +
'     - The result depends on actual filled pixels, not path geometry\n' +
'\n' +
'  5. SVG ELEMENTS must be converted to filled regions:\n' +
'     - rect, circle, ellipse -> polygon approximation\n' +
'     - line, polyline -> need stroke for area\n' +
'     - path -> parse commands and apply fill-rule\n'
);

console.log('='.repeat(80));
console.log('  Done! View ' + outputPath + ' for visual results.');
console.log('='.repeat(80));
