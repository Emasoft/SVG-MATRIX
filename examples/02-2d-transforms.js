/**
 * Example 02: 2D Affine Transformations
 *
 * This example demonstrates 2D transformations using 3x3 homogeneous matrices:
 * - Translation (moving points)
 * - Rotation (around origin and arbitrary points)
 * - Scaling (uniform and non-uniform)
 * - Reflection (mirroring)
 * - Skewing (shearing)
 * - Transform composition (combining multiple transforms)
 * - Understanding transform order (right-to-left multiplication)
 *
 * All 2D transforms use homogeneous coordinates: [x, y, 1]
 * This allows us to represent translation as matrix multiplication.
 */

import Decimal from 'decimal.js';
import { Transforms2D } from '../src/index.js';

// Set precision for Decimal operations
Decimal.set({ precision: 50 });

console.log('='.repeat(80));
console.log('2D AFFINE TRANSFORMATIONS');
console.log('='.repeat(80));
console.log();

// ============================================================================
// BASIC TRANSFORMATIONS
// ============================================================================

console.log('1. Translation (Moving Points)\n' + '-'.repeat(40));

// Translation shifts points by a fixed offset
const T = Transforms2D.translation(5, 3);
console.log('Translation matrix T (move 5 right, 3 down):');
console.log(T.toArrayOfStrings());
console.log();

// Apply translation to a point (10, 20)
const [tx, ty] = Transforms2D.applyTransform(T, 10, 20);
console.log('Point (10, 20) after translation:');
console.log(`(${tx.toString()}, ${ty.toString()})`);
console.log('Expected: (15, 23) ✓');
console.log();

console.log('2. Rotation (Around Origin)\n' + '-'.repeat(40));

// Rotation rotates points counterclockwise around origin
// Angle is in radians (π/2 = 90°, π = 180°, 2π = 360°)
const R90 = Transforms2D.rotate(Math.PI / 2); // 90 degrees
console.log('Rotation matrix R90 (90° counterclockwise):');
console.log(R90.toArrayOfStrings());
console.log();

// Rotate point (1, 0) by 90 degrees
const [rx1, ry1] = Transforms2D.applyTransform(R90, 1, 0);
console.log('Point (1, 0) after 90° rotation:');
console.log(`(${rx1.toNumber().toFixed(6)}, ${ry1.toNumber().toFixed(6)})`);
console.log('Expected: (0, 1) ✓');
console.log();

// Rotate by 45 degrees
const R45 = Transforms2D.rotate(Math.PI / 4);
const [rx2, ry2] = Transforms2D.applyTransform(R45, 1, 0);
console.log('Point (1, 0) after 45° rotation:');
console.log(`(${rx2.toNumber().toFixed(6)}, ${ry2.toNumber().toFixed(6)})`);
console.log('Expected: (√2/2, √2/2) ≈ (0.707107, 0.707107) ✓');
console.log();

console.log('3. Rotation Around a Point\n' + '-'.repeat(40));

// Rotate around a specific point (pivot) instead of origin
// This is done by: translate to origin → rotate → translate back
const pivot_x = 100;
const pivot_y = 50;
const R_pivot = Transforms2D.rotateAroundPoint(Math.PI / 4, pivot_x, pivot_y);

console.log(`Rotate 45° around point (${pivot_x}, ${pivot_y}):`);
// The pivot point itself should not move
const [px, py] = Transforms2D.applyTransform(R_pivot, pivot_x, pivot_y);
console.log(`Pivot after transform: (${px.toString()}, ${py.toString()})`);
console.log(`Expected: (${pivot_x}, ${pivot_y}) - pivot stays fixed ✓`);
console.log();

// A point offset from the pivot
const [rx3, ry3] = Transforms2D.applyTransform(R_pivot, pivot_x + 10, pivot_y);
console.log(`Point (${pivot_x + 10}, ${pivot_y}) after rotation around pivot:`);
console.log(`(${rx3.toNumber().toFixed(3)}, ${ry3.toNumber().toFixed(3)})`);
console.log('Point rotates 45° around the pivot');
console.log();

console.log('4. Scaling\n' + '-'.repeat(40));

// Uniform scaling (same factor for X and Y)
const S_uniform = Transforms2D.scale(2);
console.log('Uniform scale by 2× matrix:');
console.log(S_uniform.toArrayOfStrings());
console.log();

const [sx1, sy1] = Transforms2D.applyTransform(S_uniform, 5, 10);
console.log('Point (5, 10) scaled uniformly by 2×:');
console.log(`(${sx1.toString()}, ${sy1.toString()})`);
console.log('Expected: (10, 20) ✓');
console.log();

// Non-uniform scaling (different factors for X and Y)
const S_nonuniform = Transforms2D.scale(3, 0.5);
const [sx2, sy2] = Transforms2D.applyTransform(S_nonuniform, 4, 8);
console.log('Point (4, 8) scaled by (3×, 0.5×):');
console.log(`(${sx2.toString()}, ${sy2.toString()})`);
console.log('Expected: (12, 4) - stretched horizontally, compressed vertically ✓');
console.log();

// Negative scaling creates reflection
const S_reflect = Transforms2D.scale(-1, 1);
const [sx3, sy3] = Transforms2D.applyTransform(S_reflect, 5, 3);
console.log('Point (5, 3) scaled by (-1, 1):');
console.log(`(${sx3.toString()}, ${sy3.toString()})`);
console.log('Expected: (-5, 3) - reflected across Y axis ✓');
console.log();

console.log('5. Reflection (Mirroring)\n' + '-'.repeat(40));

// Reflect across X axis (flip vertically)
const RefX = Transforms2D.reflectX();
const [refx1, refy1] = Transforms2D.applyTransform(RefX, 10, 5);
console.log('Point (10, 5) reflected across X axis:');
console.log(`(${refx1.toString()}, ${refy1.toString()})`);
console.log('Expected: (10, -5) - Y coordinate negated ✓');
console.log();

// Reflect across Y axis (flip horizontally)
const RefY = Transforms2D.reflectY();
const [refx2, refy2] = Transforms2D.applyTransform(RefY, 10, 5);
console.log('Point (10, 5) reflected across Y axis:');
console.log(`(${refx2.toString()}, ${refy2.toString()})`);
console.log('Expected: (-10, 5) - X coordinate negated ✓');
console.log();

// Reflect through origin (point inversion)
const RefO = Transforms2D.reflectOrigin();
const [refx3, refy3] = Transforms2D.applyTransform(RefO, 10, 5);
console.log('Point (10, 5) reflected through origin:');
console.log(`(${refx3.toString()}, ${refy3.toString()})`);
console.log('Expected: (-10, -5) - both coordinates negated ✓');
console.log();

console.log('6. Skewing (Shearing)\n' + '-'.repeat(40));

// Skew transforms create "slanted" or "italic" effects
// ax: horizontal skew (X shifts based on Y)
// ay: vertical skew (Y shifts based on X)

const Skew_horizontal = Transforms2D.skew(0.5, 0);
console.log('Horizontal skew matrix (ax=0.5, ay=0):');
console.log(Skew_horizontal.toArrayOfStrings());
console.log();

const [skx1, sky1] = Transforms2D.applyTransform(Skew_horizontal, 10, 20);
console.log('Point (10, 20) with horizontal skew:');
console.log(`(${skx1.toString()}, ${sky1.toString()})`);
console.log('Expected: (10 + 0.5×20, 20) = (20, 20)');
console.log('Points at higher Y are shifted more to the right');
console.log();

// Create italic text effect (typical skew angle ~15-20°)
const italic_angle = 15 * Math.PI / 180; // 15 degrees in radians
const Skew_italic = Transforms2D.skew(Math.tan(italic_angle), 0);
const [skx2, sky2] = Transforms2D.applyTransform(Skew_italic, 0, 100);
console.log('Creating italic effect (15° slant):');
console.log(`Point (0, 100) becomes (${skx2.toNumber().toFixed(2)}, ${sky2.toString()})`);
console.log('The top of text (high Y) shifts right, creating slant');
console.log();

console.log('7. Directional Stretching\n' + '-'.repeat(40));

// Stretch along an arbitrary axis direction
// This is more general than axis-aligned scaling

// Stretch 2× along 45° diagonal
const angle = Math.PI / 4;
const ux = Math.cos(angle); // Unit vector X component
const uy = Math.sin(angle); // Unit vector Y component
const Stretch = Transforms2D.stretchAlongAxis(ux, uy, 2);

console.log('Stretch 2× along 45° diagonal:');
const [stx1, sty1] = Transforms2D.applyTransform(Stretch, 1, 0);
console.log(`Point (1, 0) becomes (${stx1.toNumber().toFixed(4)}, ${sty1.toNumber().toFixed(4)})`);
console.log();

const [stx2, sty2] = Transforms2D.applyTransform(Stretch, 1, 1);
console.log(`Point (1, 1) becomes (${stx2.toNumber().toFixed(4)}, ${sty2.toNumber().toFixed(4)})`);
console.log('Point on the diagonal stretches away from origin');
console.log();

// ============================================================================
// TRANSFORM COMPOSITION
// ============================================================================

console.log('8. Transform Composition (Combining Transforms)\n' + '-'.repeat(40));

console.log('IMPORTANT: Matrix multiplication is RIGHT-TO-LEFT!');
console.log('M = T.mul(R).mul(S) means: first S, then R, then T');
console.log();

// Example: Scale, then rotate, then translate
// Written: T.mul(R).mul(S)
// Executed: S → R → T (right to left)

const S = Transforms2D.scale(2);           // Scale by 2×
const R = Transforms2D.rotate(Math.PI / 4); // Rotate 45°
const T2 = Transforms2D.translation(10, 5); // Move to (10, 5)

// Compose: translate AFTER rotate AFTER scale
const composed = T2.mul(R).mul(S);

console.log('Composed transform: Translate(10,5) · Rotate(45°) · Scale(2×)');
console.log('Execution order: Scale → Rotate → Translate');
console.log();

// Apply to point (1, 0)
const [cx, cy] = Transforms2D.applyTransform(composed, 1, 0);
console.log('Point (1, 0) through composed transform:');
console.log(`Step 1 - Scale:     (1, 0) → (2, 0)`);
console.log(`Step 2 - Rotate 45°: (2, 0) → (${Math.SQRT2.toFixed(4)}, ${Math.SQRT2.toFixed(4)})`);
console.log(`Step 3 - Translate:  → (${(10 + Math.SQRT2).toFixed(4)}, ${(5 + Math.SQRT2).toFixed(4)})`);
console.log(`Final result: (${cx.toNumber().toFixed(4)}, ${cy.toNumber().toFixed(4)})`);
console.log();

// Compare with different order: scale AFTER rotate AFTER translate
const composed2 = S.mul(R).mul(T2);
const [cx2, cy2] = Transforms2D.applyTransform(composed2, 1, 0);
console.log('Different order: Scale(2×) · Rotate(45°) · Translate(10,5)');
console.log('Execution order: Translate → Rotate → Scale');
console.log(`Result: (${cx2.toNumber().toFixed(4)}, ${cy2.toNumber().toFixed(4)})`);
console.log('DIFFERENT RESULT! Order matters!');
console.log();

// ============================================================================
// PRACTICAL EXAMPLES
// ============================================================================

console.log('9. Practical Transform Scenarios\n' + '-'.repeat(40));

console.log('Scenario A: Rotate a square around its center');
console.log('-'.repeat(40));

// Square with corners at (0,0), (100,0), (100,100), (0,100)
// Center is at (50, 50)
const square_corners = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100]
];

// Rotate 30° around center
const rotate_around_center = Transforms2D.rotateAroundPoint(
  Math.PI / 6,  // 30 degrees
  50,           // center X
  50            // center Y
);

console.log('Original square corners:');
square_corners.forEach(([x, y], i) => {
  console.log(`  Corner ${i}: (${x}, ${y})`);
});
console.log();

console.log('After 30° rotation around center (50, 50):');
square_corners.forEach(([x, y], i) => {
  const [nx, ny] = Transforms2D.applyTransform(rotate_around_center, x, y);
  console.log(`  Corner ${i}: (${nx.toNumber().toFixed(2)}, ${ny.toNumber().toFixed(2)})`);
});
console.log();

console.log('Scenario B: Mirror and scale a shape');
console.log('-'.repeat(40));

// Create transform: reflect across Y axis, then scale by 1.5
const mirror_and_scale = Transforms2D.scale(1.5).mul(Transforms2D.reflectY());

const original_point = [30, 40];
const [mpx, mpy] = Transforms2D.applyTransform(mirror_and_scale, ...original_point);

console.log(`Original point: (${original_point[0]}, ${original_point[1]})`);
console.log(`After reflect Y: (-30, 40)`);
console.log(`After scale 1.5×: (${mpx.toString()}, ${mpy.toString()})`);
console.log('Expected: (-45, 60) ✓');
console.log();

console.log('Scenario C: Create an SVG transform matrix');
console.log('-'.repeat(40));

// SVG uses transform attributes like: transform="matrix(a b c d e f)"
// This represents the 3x3 matrix:
// [a  c  e]
// [b  d  f]
// [0  0  1]

// Create a complex transform
const svg_transform = Transforms2D.translation(20, 30)
  .mul(Transforms2D.rotate(Math.PI / 8))
  .mul(Transforms2D.scale(1.2, 0.8));

console.log('Complex transform matrix:');
const matrix_data = svg_transform.toArrayOfStrings();
console.log(matrix_data);
console.log();

// Extract values for SVG matrix() function
// SVG matrix format: matrix(a, b, c, d, e, f)
// where matrix is [[a,c,e], [b,d,f], [0,0,1]]
const a = svg_transform.data[0][0].toNumber();
const b = svg_transform.data[1][0].toNumber();
const c = svg_transform.data[0][1].toNumber();
const d = svg_transform.data[1][1].toNumber();
const e = svg_transform.data[0][2].toNumber();
const f = svg_transform.data[1][2].toNumber();

console.log('SVG transform attribute:');
console.log(`transform="matrix(${a.toFixed(6)}, ${b.toFixed(6)}, ${c.toFixed(6)}, ${d.toFixed(6)}, ${e.toFixed(6)}, ${f.toFixed(6)})"`);
console.log();

// ============================================================================
// TRANSFORM PROPERTIES
// ============================================================================

console.log('10. Transform Properties\n' + '-'.repeat(40));

// Identity transform (no change)
const I = Transforms2D.translation(0, 0); // Or any transform with no effect
const identity_point = [7, 13];
const [ix, iy] = Transforms2D.applyTransform(I, ...identity_point);
console.log('Identity transform:');
console.log(`(${identity_point[0]}, ${identity_point[1]}) → (${ix.toString()}, ${iy.toString()})`);
console.log('Point unchanged ✓');
console.log();

// Inverse transforms (undo a transformation)
const transform = Transforms2D.translation(5, 3);
const inverse = transform.inverse();

const test_point = [10, 20];
const [fwd_x, fwd_y] = Transforms2D.applyTransform(transform, ...test_point);
const [back_x, back_y] = Transforms2D.applyTransform(inverse, fwd_x, fwd_y);

console.log('Transform and its inverse:');
console.log(`Original: (${test_point[0]}, ${test_point[1]})`);
console.log(`After transform: (${fwd_x.toString()}, ${fwd_y.toString()})`);
console.log(`After inverse: (${back_x.toString()}, ${back_y.toString()})`);
console.log('Back to original ✓');
console.log();

// Determinant tells us about area scaling
const scale_transform = Transforms2D.scale(2, 3);
const det = scale_transform.determinant();
console.log('Scale(2, 3) determinant:', det.toString());
console.log('Geometric meaning: transforms unit square → area of', det.toString());
console.log('(2× wider, 3× taller = 6× area)');
console.log();

// Rotation preserves area (determinant = 1)
const rot_det = Transforms2D.rotate(Math.PI / 3).determinant();
console.log('Rotation determinant:', rot_det.toString());
console.log('Area is preserved (det = 1)');
console.log();

console.log('='.repeat(80));
console.log('Example complete! This demonstrates 2D affine transformations.');
console.log('Key takeaways:');
console.log('- Transforms are 3×3 matrices using homogeneous coordinates');
console.log('- Composition is RIGHT-TO-LEFT: T.mul(R).mul(S) = S then R then T');
console.log('- Order matters! Different orders give different results');
console.log('- Use rotateAroundPoint() to rotate around centers other than origin');
console.log('='.repeat(80));
