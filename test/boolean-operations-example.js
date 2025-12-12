/**
 * Boolean Operations on Closed Paths Example
 *
 * Demonstrates polygon boolean operations:
 * - Intersection (A AND B)
 * - Union (A OR B)
 * - Difference (A - B, B - A)
 * - XOR (A XOR B)
 *
 * Generates an SVG file showing all operations visually.
 *
 * Run with: node test/boolean-operations-example.js
 */

import {
  PolygonClip
} from '../src/index.js';
import { writeFileSync } from 'fs';
import Decimal from 'decimal.js';

Decimal.set({ precision: 80 });

const { point, polygonArea, polygonIntersection, polygonUnion, polygonDifference,
        pointInPolygon, boundingBox, isConvex, convexHull } = PolygonClip;

// Helper to format Decimal numbers
const fmt = (d, digits = 2) => {
  if (d instanceof Decimal) return d.toNumber().toFixed(digits);
  return Number(d).toFixed(digits);
};

console.log('='.repeat(80));
console.log('  SVG-MATRIX: Boolean Operations on Closed Paths');
console.log('  Intersection, Union, Difference with 80-digit precision');
console.log('='.repeat(80));

// ============================================================================
// CREATE TWO OVERLAPPING POLYGONS
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  INPUT SHAPES: Two Overlapping Squares');
console.log('='.repeat(80));

// Polygon A: Square at origin (0,0) to (100,100)
const squareA = [
  point(0, 0),
  point(100, 0),
  point(100, 100),
  point(0, 100)
];

// Polygon B: Square offset (50,50) to (150,150)
const squareB = [
  point(50, 50),
  point(150, 50),
  point(150, 150),
  point(50, 150)
];

console.log(`
  Polygon A (Blue Square):
    Vertices: (0,0) -> (100,0) -> (100,100) -> (0,100)
    Area: ${fmt(polygonArea(squareA))} sq units

  Polygon B (Red Square):
    Vertices: (50,50) -> (150,50) -> (150,150) -> (50,150)
    Area: ${fmt(polygonArea(squareB))} sq units

  Overlap region: (50,50) to (100,100) = 2500 sq units expected
`);

// ============================================================================
// PERFORM BOOLEAN OPERATIONS
// ============================================================================

console.log('-'.repeat(80));
console.log('  BOOLEAN OPERATIONS');
console.log('-'.repeat(80));

// 1. INTERSECTION (A AND B)
console.log('\n  1. INTERSECTION (A AND B):');
const intersection = polygonIntersection(squareA, squareB);
if (intersection.length > 0) {
  const intersectPoly = intersection[0];
  const intersectArea = polygonArea(intersectPoly);
  console.log(`     Result: ${intersectPoly.length} vertices`);
  console.log(`     Area: ${fmt(intersectArea)} sq units (expected: 2500)`);
  console.log('     Vertices:');
  for (const p of intersectPoly) {
    console.log(`       (${fmt(p.x)}, ${fmt(p.y)})`);
  }
} else {
  console.log('     Result: No intersection');
}

// 2. UNION (A OR B)
console.log('\n  2. UNION (A OR B):');
const union = polygonUnion(squareA, squareB);
if (union.length > 0) {
  const unionPoly = union[0];
  const unionArea = polygonArea(unionPoly);
  // Expected: 10000 + 10000 - 2500 = 17500
  console.log(`     Result: ${unionPoly.length} vertices`);
  console.log(`     Area: ${fmt(unionArea)} sq units (expected: 17500)`);
} else {
  console.log('     Result: Empty union');
}

// 3. DIFFERENCE (A - B)
console.log('\n  3. DIFFERENCE (A - B):');
const diffAB = polygonDifference(squareA, squareB);
if (diffAB.length > 0) {
  const diffABPoly = diffAB[0];
  const diffABArea = polygonArea(diffABPoly);
  // Expected: 10000 - 2500 = 7500
  console.log(`     Result: ${diffABPoly.length} vertices`);
  console.log(`     Area: ${fmt(diffABArea)} sq units (expected: 7500)`);
} else {
  console.log('     Result: Empty difference');
}

// 4. DIFFERENCE (B - A)
console.log('\n  4. DIFFERENCE (B - A):');
const diffBA = polygonDifference(squareB, squareA);
if (diffBA.length > 0) {
  const diffBAPoly = diffBA[0];
  const diffBAArea = polygonArea(diffBAPoly);
  // Expected: 10000 - 2500 = 7500
  console.log(`     Result: ${diffBAPoly.length} vertices`);
  console.log(`     Area: ${fmt(diffBAArea)} sq units (expected: 7500)`);
} else {
  console.log('     Result: Empty difference');
}

// ============================================================================
// ALSO TEST WITH MORE COMPLEX SHAPES
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  COMPLEX SHAPES: Pentagon and Hexagon');
console.log('='.repeat(80));

// Pentagon centered at (100, 100), radius 60
const pentagon = [];
for (let i = 0; i < 5; i++) {
  const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
  pentagon.push(point(100 + 60 * Math.cos(angle), 100 + 60 * Math.sin(angle)));
}

// Hexagon centered at (130, 100), radius 50
const hexagon = [];
for (let i = 0; i < 6; i++) {
  const angle = (i * 2 * Math.PI / 6);
  hexagon.push(point(130 + 50 * Math.cos(angle), 100 + 50 * Math.sin(angle)));
}

console.log(`
  Pentagon (centered at 100,100, radius 60):
    Area: ${fmt(polygonArea(pentagon))} sq units
    Convex: ${isConvex(pentagon)}

  Hexagon (centered at 130,100, radius 50):
    Area: ${fmt(polygonArea(hexagon))} sq units
    Convex: ${isConvex(hexagon)}
`);

const pentHexIntersection = polygonIntersection(pentagon, hexagon);
const pentHexUnion = polygonUnion(pentagon, hexagon);

console.log('  Boolean Operations:');
if (pentHexIntersection.length > 0) {
  console.log(`    Intersection: ${pentHexIntersection[0].length} vertices, area=${fmt(polygonArea(pentHexIntersection[0]))}`);
}
if (pentHexUnion.length > 0) {
  console.log(`    Union: ${pentHexUnion[0].length} vertices, area=${fmt(polygonArea(pentHexUnion[0]))}`);
}

// ============================================================================
// GENERATE SVG OUTPUT
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  GENERATING SVG OUTPUT');
console.log('='.repeat(80));

// Helper to convert polygon to SVG path
function polygonToPath(polygon) {
  if (!polygon || polygon.length < 3) return '';
  const pts = polygon.map(p => `${fmt(p.x, 4)},${fmt(p.y, 4)}`);
  return `M ${pts.join(' L ')} Z`;
}

// Generate comprehensive SVG
const svgWidth = 800;
const svgHeight = 600;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <title>Boolean Operations on Closed Paths</title>
  <desc>Demonstrates intersection, union, and difference of polygons using svg-matrix</desc>

  <!-- Background -->
  <rect x="-20" y="-20" width="${svgWidth}" height="${svgHeight}" fill="#f8f9fa"/>

  <!-- Grid -->
  <defs>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e9ecef" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect x="-20" y="-20" width="${svgWidth}" height="${svgHeight}" fill="url(#grid)"/>

  <!-- ============================================ -->
  <!-- ROW 1: Input Shapes -->
  <!-- ============================================ -->
  <g transform="translate(0, 0)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      Input Shapes
    </text>

    <!-- Square A (Blue) -->
    <path d="${polygonToPath(squareA)}"
          fill="rgba(59, 130, 246, 0.4)"
          stroke="#3b82f6"
          stroke-width="2"/>

    <!-- Square B (Red) -->
    <path d="${polygonToPath(squareB)}"
          fill="rgba(239, 68, 68, 0.4)"
          stroke="#ef4444"
          stroke-width="2"/>

    <!-- Labels -->
    <text x="30" y="90" font-size="16" font-weight="bold" fill="#3b82f6">A</text>
    <text x="130" y="140" font-size="16" font-weight="bold" fill="#ef4444">B</text>

    <!-- Area labels -->
    <text x="50" y="180" font-size="10" fill="#666">A = 10000 sq</text>
    <text x="100" y="195" font-size="10" fill="#666">B = 10000 sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 1: Intersection (A AND B) -->
  <!-- ============================================ -->
  <g transform="translate(220, 0)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      A ∩ B (Intersection)
    </text>

    <!-- Ghost outlines of originals -->
    <path d="${polygonToPath(squareA)}"
          fill="none"
          stroke="#ccc"
          stroke-width="1"
          stroke-dasharray="4,4"/>
    <path d="${polygonToPath(squareB)}"
          fill="none"
          stroke="#ccc"
          stroke-width="1"
          stroke-dasharray="4,4"/>

    <!-- Intersection result (Green) -->
    ${intersection.length > 0 ? `
    <path d="${polygonToPath(intersection[0])}"
          fill="rgba(34, 197, 94, 0.6)"
          stroke="#16a34a"
          stroke-width="2"/>
    ` : '<!-- No intersection -->'}

    <text x="75" y="90" font-size="12" fill="#16a34a" font-weight="bold">A ∩ B</text>
    <text x="50" y="180" font-size="10" fill="#666">Area = ${intersection.length > 0 ? fmt(polygonArea(intersection[0])) : 0} sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 1: Union (A OR B) -->
  <!-- ============================================ -->
  <g transform="translate(440, 0)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      A ∪ B (Union)
    </text>

    <!-- Union result (Purple) -->
    ${union.length > 0 ? `
    <path d="${polygonToPath(union[0])}"
          fill="rgba(168, 85, 247, 0.5)"
          stroke="#9333ea"
          stroke-width="2"/>
    ` : '<!-- No union -->'}

    <text x="75" y="90" font-size="12" fill="#9333ea" font-weight="bold">A ∪ B</text>
    <text x="50" y="180" font-size="10" fill="#666">Area = ${union.length > 0 ? fmt(polygonArea(union[0])) : 0} sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 2: Difference A - B -->
  <!-- ============================================ -->
  <g transform="translate(0, 220)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      A - B (Difference)
    </text>

    <!-- Ghost of B -->
    <path d="${polygonToPath(squareB)}"
          fill="none"
          stroke="#ccc"
          stroke-width="1"
          stroke-dasharray="4,4"/>

    <!-- Difference A-B (Blue) -->
    ${diffAB.length > 0 ? `
    <path d="${polygonToPath(diffAB[0])}"
          fill="rgba(59, 130, 246, 0.6)"
          stroke="#3b82f6"
          stroke-width="2"/>
    ` : `
    <!-- Original A when no proper difference available -->
    <path d="${polygonToPath(squareA)}"
          fill="rgba(59, 130, 246, 0.3)"
          stroke="#3b82f6"
          stroke-width="1"/>
    `}

    <text x="30" y="90" font-size="12" fill="#3b82f6" font-weight="bold">A - B</text>
    <text x="50" y="180" font-size="10" fill="#666">Area = ${diffAB.length > 0 ? fmt(polygonArea(diffAB[0])) : 'N/A'} sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 2: Difference B - A -->
  <!-- ============================================ -->
  <g transform="translate(220, 220)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      B - A (Difference)
    </text>

    <!-- Ghost of A -->
    <path d="${polygonToPath(squareA)}"
          fill="none"
          stroke="#ccc"
          stroke-width="1"
          stroke-dasharray="4,4"/>

    <!-- Difference B-A (Red) -->
    ${diffBA.length > 0 ? `
    <path d="${polygonToPath(diffBA[0])}"
          fill="rgba(239, 68, 68, 0.6)"
          stroke="#ef4444"
          stroke-width="2"/>
    ` : `
    <!-- Original B when no proper difference available -->
    <path d="${polygonToPath(squareB)}"
          fill="rgba(239, 68, 68, 0.3)"
          stroke="#ef4444"
          stroke-width="1"/>
    `}

    <text x="130" y="140" font-size="12" fill="#ef4444" font-weight="bold">B - A</text>
    <text x="50" y="180" font-size="10" fill="#666">Area = ${diffBA.length > 0 ? fmt(polygonArea(diffBA[0])) : 'N/A'} sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 2: XOR (Symmetric Difference) -->
  <!-- ============================================ -->
  <g transform="translate(440, 220)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      A ⊕ B (XOR)
    </text>

    <!-- Show both differences as XOR -->
    ${diffAB.length > 0 ? `
    <path d="${polygonToPath(diffAB[0])}"
          fill="rgba(251, 146, 60, 0.6)"
          stroke="#f97316"
          stroke-width="2"/>
    ` : ''}
    ${diffBA.length > 0 ? `
    <path d="${polygonToPath(diffBA[0])}"
          fill="rgba(251, 146, 60, 0.6)"
          stroke="#f97316"
          stroke-width="2"/>
    ` : ''}

    <text x="75" y="90" font-size="12" fill="#f97316" font-weight="bold">XOR</text>
    <text x="50" y="180" font-size="10" fill="#666">Area = ${
      (diffAB.length > 0 ? polygonArea(diffAB[0]).toNumber() : 0) +
      (diffBA.length > 0 ? polygonArea(diffBA[0]).toNumber() : 0)
    } sq</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 3: Pentagon and Hexagon -->
  <!-- ============================================ -->
  <g transform="translate(0, 420)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      Pentagon ∩ Hexagon
    </text>

    <!-- Pentagon (Teal) -->
    <path d="${polygonToPath(pentagon)}"
          fill="rgba(20, 184, 166, 0.4)"
          stroke="#14b8a6"
          stroke-width="2"/>

    <!-- Hexagon (Pink) -->
    <path d="${polygonToPath(hexagon)}"
          fill="rgba(236, 72, 153, 0.4)"
          stroke="#ec4899"
          stroke-width="2"/>

    ${pentHexIntersection.length > 0 ? `
    <path d="${polygonToPath(pentHexIntersection[0])}"
          fill="rgba(34, 197, 94, 0.7)"
          stroke="#16a34a"
          stroke-width="2"/>
    ` : ''}

    <text x="80" y="75" font-size="10" fill="#14b8a6">Pentagon</text>
    <text x="150" y="125" font-size="10" fill="#ec4899">Hexagon</text>
  </g>

  <!-- ============================================ -->
  <!-- ROW 3: Pentagon UNION Hexagon -->
  <!-- ============================================ -->
  <g transform="translate(220, 420)">
    <text x="100" y="20" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
      Pentagon ∪ Hexagon
    </text>

    ${pentHexUnion.length > 0 ? `
    <path d="${polygonToPath(pentHexUnion[0])}"
          fill="rgba(168, 85, 247, 0.5)"
          stroke="#9333ea"
          stroke-width="2"/>
    ` : ''}
  </g>

  <!-- ============================================ -->
  <!-- Legend -->
  <!-- ============================================ -->
  <g transform="translate(500, 420)">
    <rect x="0" y="0" width="260" height="140" fill="white" stroke="#ccc" rx="5"/>
    <text x="130" y="20" font-size="12" font-weight="bold" text-anchor="middle" fill="#333">Legend</text>

    <rect x="10" y="35" width="20" height="15" fill="rgba(59, 130, 246, 0.5)" stroke="#3b82f6"/>
    <text x="35" y="47" font-size="10" fill="#333">Polygon A (Blue)</text>

    <rect x="10" y="55" width="20" height="15" fill="rgba(239, 68, 68, 0.5)" stroke="#ef4444"/>
    <text x="35" y="67" font-size="10" fill="#333">Polygon B (Red)</text>

    <rect x="10" y="75" width="20" height="15" fill="rgba(34, 197, 94, 0.6)" stroke="#16a34a"/>
    <text x="35" y="87" font-size="10" fill="#333">Intersection (Green)</text>

    <rect x="10" y="95" width="20" height="15" fill="rgba(168, 85, 247, 0.5)" stroke="#9333ea"/>
    <text x="35" y="107" font-size="10" fill="#333">Union (Purple)</text>

    <rect x="10" y="115" width="20" height="15" fill="rgba(251, 146, 60, 0.6)" stroke="#f97316"/>
    <text x="35" y="127" font-size="10" fill="#333">XOR (Orange)</text>
  </g>

  <!-- Title -->
  <text x="${svgWidth/2 - 20}" y="-5" font-size="10" fill="#999" text-anchor="middle">
    Generated by svg-matrix boolean operations
  </text>
</svg>
`;

// Write SVG file
const outputPath = 'test/boolean-operations-result.svg';
writeFileSync(outputPath, svg);
console.log(`\n  SVG written to: ${outputPath}`);

// ============================================================================
// SUMMARY TABLE
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('  SUMMARY: Boolean Operation Results');
console.log('='.repeat(80));

console.log(`
  +------------------------+----------------+----------------+----------------+
  | Operation              | Vertices       | Area (sq)      | Expected       |
  +------------------------+----------------+----------------+----------------+
  | Square A               | 4              | 10000.00       | 10000          |
  | Square B               | 4              | 10000.00       | 10000          |
  | A ∩ B (Intersection)   | ${intersection.length > 0 ? String(intersection[0].length).padEnd(14) : 'N/A'.padEnd(14)} | ${intersection.length > 0 ? fmt(polygonArea(intersection[0])).padEnd(14) : 'N/A'.padEnd(14)} | 2500           |
  | A ∪ B (Union)          | ${union.length > 0 ? String(union[0].length).padEnd(14) : 'N/A'.padEnd(14)} | ${union.length > 0 ? fmt(polygonArea(union[0])).padEnd(14) : 'N/A'.padEnd(14)} | 17500          |
  | A - B (Difference)     | ${diffAB.length > 0 ? String(diffAB[0].length).padEnd(14) : 'N/A'.padEnd(14)} | ${diffAB.length > 0 ? fmt(polygonArea(diffAB[0])).padEnd(14) : 'N/A'.padEnd(14)} | 7500           |
  | B - A (Difference)     | ${diffBA.length > 0 ? String(diffBA[0].length).padEnd(14) : 'N/A'.padEnd(14)} | ${diffBA.length > 0 ? fmt(polygonArea(diffBA[0])).padEnd(14) : 'N/A'.padEnd(14)} | 7500           |
  +------------------------+----------------+----------------+----------------+

  Pentagon (r=60):         Area = ${fmt(polygonArea(pentagon))} sq
  Hexagon (r=50):          Area = ${fmt(polygonArea(hexagon))} sq
  Pent ∩ Hex:              Area = ${pentHexIntersection.length > 0 ? fmt(polygonArea(pentHexIntersection[0])) : 'N/A'} sq
  Pent ∪ Hex:              Area = ${pentHexUnion.length > 0 ? fmt(polygonArea(pentHexUnion[0])) : 'N/A'} sq
`);

console.log('='.repeat(80));
console.log('  Boolean operations completed! View the SVG file for visual results.');
console.log('='.repeat(80));
console.log('');
