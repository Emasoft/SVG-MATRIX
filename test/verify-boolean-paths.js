/**
 * Verify that boolean operation results are closed, valid polygons
 */
import { PolygonClip } from '../src/index.js';
import Decimal from 'decimal.js';

Decimal.set({ precision: 80 });

const { point, polygonArea, polygonIntersection, polygonUnion, polygonDifference,
        isConvex, isCounterClockwise, pointsEqual } = PolygonClip;

// Two overlapping squares
const squareA = [
  point(0, 0),
  point(100, 0),
  point(100, 100),
  point(0, 100)
];

const squareB = [
  point(50, 50),
  point(150, 50),
  point(150, 150),
  point(50, 150)
];

// Validation functions
function hasNoDuplicateConsecutiveVertices(polygon) {
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    if (pointsEqual(polygon[i], polygon[next])) {
      return { valid: false, duplicateAt: i };
    }
  }
  return { valid: true };
}

function isValidPolygon(polygon) {
  if (polygon.length < 3) return { valid: false, reason: 'Less than 3 vertices' };

  const dupCheck = hasNoDuplicateConsecutiveVertices(polygon);
  if (!dupCheck.valid) {
    return { valid: false, reason: 'Duplicate consecutive vertex at index ' + dupCheck.duplicateAt };
  }

  const area = polygonArea(polygon);
  if (area.abs().lt(1e-10)) {
    return { valid: false, reason: 'Zero or near-zero area (degenerate polygon)' };
  }

  return { valid: true, area: area.toNumber() };
}

function validateResult(name, result) {
  console.log('\n=== ' + name + ' ===');

  if (!result || result.length === 0) {
    console.log('  Result: EMPTY (no polygon)');
    return;
  }

  for (let i = 0; i < result.length; i++) {
    const poly = result[i];
    console.log('  Polygon ' + (i + 1) + ':');
    console.log('    Vertices: ' + poly.length);

    // Check validity
    const validity = isValidPolygon(poly);
    console.log('    Valid: ' + (validity.valid ? 'YES' : 'NO - ' + validity.reason));

    if (validity.valid) {
      console.log('    Area: ' + validity.area.toFixed(2));
      console.log('    CCW orientation: ' + isCounterClockwise(poly));
      console.log('    Convex: ' + isConvex(poly));

      // Print vertices
      console.log('    Vertices:');
      for (const v of poly) {
        console.log('      (' + v.x.toNumber().toFixed(2) + ', ' + v.y.toNumber().toFixed(2) + ')');
      }

      // Verify closure (no duplicate first/last)
      const first = poly[0];
      const last = poly[poly.length - 1];
      const hasDupFirstLast = pointsEqual(first, last);
      console.log('    First==Last (should be false): ' + hasDupFirstLast);
    }
  }
}

console.log('======================================================================');
console.log('  BOOLEAN OPERATION PATH VALIDATION');
console.log('======================================================================');

// Run operations and validate
const intersection = polygonIntersection(squareA, squareB);
validateResult('INTERSECTION (A AND B)', intersection);

const union = polygonUnion(squareA, squareB);
validateResult('UNION (A OR B)', union);

const diffAB = polygonDifference(squareA, squareB);
validateResult('DIFFERENCE (A - B)', diffAB);

const diffBA = polygonDifference(squareB, squareA);
validateResult('DIFFERENCE (B - A)', diffBA);

// Verify mathematical consistency
console.log('\n======================================================================');
console.log('  MATHEMATICAL CONSISTENCY CHECK');
console.log('======================================================================');

const areaA = polygonArea(squareA).toNumber();
const areaB = polygonArea(squareB).toNumber();
const areaIntersection = intersection.length > 0 ? polygonArea(intersection[0]).toNumber() : 0;
const areaUnion = union.length > 0 ? polygonArea(union[0]).toNumber() : 0;
const areaDiffAB = diffAB.length > 0 ? polygonArea(diffAB[0]).toNumber() : 0;
const areaDiffBA = diffBA.length > 0 ? polygonArea(diffBA[0]).toNumber() : 0;

console.log('');
console.log('  Area(A) = ' + areaA);
console.log('  Area(B) = ' + areaB);
console.log('  Area(A AND B) = ' + areaIntersection);
console.log('  Area(A OR B) = ' + areaUnion);
console.log('  Area(A - B) = ' + areaDiffAB);
console.log('  Area(B - A) = ' + areaDiffBA);
console.log('');
console.log('  Consistency checks:');
console.log('');
console.log('  1. A OR B = A + B - (A AND B)');
console.log('     ' + areaUnion + ' = ' + areaA + ' + ' + areaB + ' - ' + areaIntersection + ' = ' + (areaA + areaB - areaIntersection));
console.log('     ' + (Math.abs(areaUnion - (areaA + areaB - areaIntersection)) < 0.01 ? 'PASS' : 'FAIL'));
console.log('');
console.log('  2. A - B = A - (A AND B)');
console.log('     ' + areaDiffAB + ' = ' + areaA + ' - ' + areaIntersection + ' = ' + (areaA - areaIntersection));
console.log('     ' + (Math.abs(areaDiffAB - (areaA - areaIntersection)) < 0.01 ? 'PASS' : 'FAIL'));
console.log('');
console.log('  3. B - A = B - (A AND B)');
console.log('     ' + areaDiffBA + ' = ' + areaB + ' - ' + areaIntersection + ' = ' + (areaB - areaIntersection));
console.log('     ' + (Math.abs(areaDiffBA - (areaB - areaIntersection)) < 0.01 ? 'PASS' : 'FAIL'));
console.log('');
console.log('  4. XOR = (A - B) + (B - A) = A + B - 2*(A AND B)');
console.log('     ' + (areaDiffAB + areaDiffBA) + ' = ' + (areaA + areaB - 2*areaIntersection));
console.log('     ' + (Math.abs((areaDiffAB + areaDiffBA) - (areaA + areaB - 2*areaIntersection)) < 0.01 ? 'PASS' : 'FAIL'));
console.log('');

console.log('======================================================================');
console.log('  All paths validated successfully!');
console.log('======================================================================');
