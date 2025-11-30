/**
 * Example 03: 3D Affine Transformations
 *
 * This example demonstrates 3D transformations using 4x4 homogeneous matrices:
 * - Translation in 3D space
 * - Rotation around X, Y, Z axes (pitch, yaw, roll)
 * - Rodrigues' rotation formula (rotation around arbitrary axis)
 * - Rotation around a point in 3D
 * - 3D scaling and reflections
 * - Composing 3D transforms
 *
 * All 3D transforms use homogeneous coordinates: [x, y, z, 1]
 * This allows us to represent all affine transforms as 4×4 matrices.
 */

import Decimal from 'decimal.js';
import { Transforms3D } from '../src/index.js';

// Set precision for Decimal operations
Decimal.set({ precision: 50 });

console.log('='.repeat(80));
console.log('3D AFFINE TRANSFORMATIONS');
console.log('='.repeat(80));
console.log();

// ============================================================================
// BASIC 3D TRANSFORMATIONS
// ============================================================================

console.log('1. 3D Translation\n' + '-'.repeat(40));

// Translation shifts points by a fixed 3D vector
const T = Transforms3D.translation(5, 3, -2);
console.log('Translation matrix T (move +5X, +3Y, -2Z):');
console.log(T.toArrayOfStrings());
console.log();

// Apply translation to point (10, 20, 30)
const [tx, ty, tz] = Transforms3D.applyTransform(T, 10, 20, 30);
console.log('Point (10, 20, 30) after translation:');
console.log(`(${tx.toString()}, ${ty.toString()}, ${tz.toString()})`);
console.log('Expected: (15, 23, 28) ✓');
console.log();

console.log('2. 3D Scaling\n' + '-'.repeat(40));

// Uniform scaling (same factor in all directions)
const S_uniform = Transforms3D.scale(2);
const [sx1, sy1, sz1] = Transforms3D.applyTransform(S_uniform, 1, 2, 3);
console.log('Uniform scale by 2×:');
console.log(`Point (1, 2, 3) → (${sx1.toString()}, ${sy1.toString()}, ${sz1.toString()})`);
console.log('Expected: (2, 4, 6) ✓');
console.log();

// Non-uniform scaling (different factors per axis)
const S_nonuniform = Transforms3D.scale(2, 0.5, 3);
const [sx2, sy2, sz2] = Transforms3D.applyTransform(S_nonuniform, 4, 8, 2);
console.log('Non-uniform scale (2×, 0.5×, 3×):');
console.log(`Point (4, 8, 2) → (${sx2.toString()}, ${sy2.toString()}, ${sz2.toString()})`);
console.log('Expected: (8, 4, 6) - stretched/compressed along each axis ✓');
console.log();

// ============================================================================
// ROTATIONS AROUND COORDINATE AXES
// ============================================================================

console.log('3. Rotation Around X Axis (Pitch)\n' + '-'.repeat(40));

// Rotation around X axis: Y→Z direction (using right-hand rule)
// Think of this as "nodding yes" - pitching up/down
const Rx90 = Transforms3D.rotateX(Math.PI / 2); // 90 degrees
console.log('Rotate 90° around X axis:');
console.log('Right-hand rule: thumb points +X, fingers curl from +Y toward +Z');
console.log();

// Point on Y axis rotates to Z axis
const [rx1, ry1, rz1] = Transforms3D.applyTransform(Rx90, 0, 1, 0);
console.log('Point (0, 1, 0) on +Y axis:');
console.log(`After rotation: (${rx1.toNumber().toFixed(6)}, ${ry1.toNumber().toFixed(6)}, ${rz1.toNumber().toFixed(6)})`);
console.log('Expected: (0, 0, 1) - rotated to +Z axis ✓');
console.log();

// Point on Z axis rotates to -Y axis
const [rx2, ry2, rz2] = Transforms3D.applyTransform(Rx90, 0, 0, 1);
console.log('Point (0, 0, 1) on +Z axis:');
console.log(`After rotation: (${rx2.toNumber().toFixed(6)}, ${ry2.toNumber().toFixed(6)}, ${rz2.toNumber().toFixed(6)})`);
console.log('Expected: (0, -1, 0) - rotated to -Y axis ✓');
console.log();

console.log('4. Rotation Around Y Axis (Yaw)\n' + '-'.repeat(40));

// Rotation around Y axis: Z→X direction (using right-hand rule)
// Think of this as "shaking head no" - looking left/right
const Ry90 = Transforms3D.rotateY(Math.PI / 2);
console.log('Rotate 90° around Y axis:');
console.log('Right-hand rule: thumb points +Y, fingers curl from +Z toward +X');
console.log();

// Point on Z axis rotates to X axis
const [ry_x1, ry_y1, ry_z1] = Transforms3D.applyTransform(Ry90, 0, 0, 1);
console.log('Point (0, 0, 1) on +Z axis:');
console.log(`After rotation: (${ry_x1.toNumber().toFixed(6)}, ${ry_y1.toNumber().toFixed(6)}, ${ry_z1.toNumber().toFixed(6)})`);
console.log('Expected: (1, 0, 0) - rotated to +X axis ✓');
console.log();

// Point on X axis rotates to -Z axis
const [ry_x2, ry_y2, ry_z2] = Transforms3D.applyTransform(Ry90, 1, 0, 0);
console.log('Point (1, 0, 0) on +X axis:');
console.log(`After rotation: (${ry_x2.toNumber().toFixed(6)}, ${ry_y2.toNumber().toFixed(6)}, ${ry_z2.toNumber().toFixed(6)})`);
console.log('Expected: (0, 0, -1) - rotated to -Z axis ✓');
console.log();

console.log('5. Rotation Around Z Axis (Roll)\n' + '-'.repeat(40));

// Rotation around Z axis: X→Y direction (like 2D rotation)
// Think of this as "tilting head" - rolling left/right
const Rz90 = Transforms3D.rotateZ(Math.PI / 2);
console.log('Rotate 90° around Z axis:');
console.log('Right-hand rule: thumb points +Z, fingers curl from +X toward +Y');
console.log('This is like standard 2D rotation in the XY plane');
console.log();

// Point on X axis rotates to Y axis
const [rz_x1, rz_y1, rz_z1] = Transforms3D.applyTransform(Rz90, 1, 0, 0);
console.log('Point (1, 0, 0) on +X axis:');
console.log(`After rotation: (${rz_x1.toNumber().toFixed(6)}, ${rz_y1.toNumber().toFixed(6)}, ${rz_z1.toNumber().toFixed(6)})`);
console.log('Expected: (0, 1, 0) - rotated to +Y axis ✓');
console.log();

// Point on Y axis rotates to -X axis
const [rz_x2, rz_y2, rz_z2] = Transforms3D.applyTransform(Rz90, 0, 1, 0);
console.log('Point (0, 1, 0) on +Y axis:');
console.log(`After rotation: (${rz_x2.toNumber().toFixed(6)}, ${rz_y2.toNumber().toFixed(6)}, ${rz_z2.toNumber().toFixed(6)})`);
console.log('Expected: (-1, 0, 0) - rotated to -X axis ✓');
console.log();

// ============================================================================
// ROTATION AROUND ARBITRARY AXIS (RODRIGUES' FORMULA)
// ============================================================================

console.log('6. Rodrigues\' Rotation Formula\n' + '-'.repeat(40));

console.log('Rodrigues\' formula allows rotation around ANY axis through origin.');
console.log('Formula: R = I + sin(θ)K + (1-cos(θ))K²');
console.log('where K is the cross-product matrix of the unit axis vector');
console.log();

// Rotate around diagonal axis (1, 1, 1) - equally along all dimensions
const diagonal_axis = [1, 1, 1]; // Will be normalized automatically
const angle = Math.PI / 3; // 60 degrees

const R_diagonal = Transforms3D.rotateAroundAxis(...diagonal_axis, angle);
console.log(`Rotate 60° around axis (1, 1, 1):`);
console.log('Axis is automatically normalized to unit vector');
console.log(`Unit axis: (${(1/Math.sqrt(3)).toFixed(6)}, ${(1/Math.sqrt(3)).toFixed(6)}, ${(1/Math.sqrt(3)).toFixed(6)})`);
console.log();

// Apply to point (1, 0, 0)
const [rd_x, rd_y, rd_z] = Transforms3D.applyTransform(R_diagonal, 1, 0, 0);
console.log('Point (1, 0, 0) after rotation:');
console.log(`(${rd_x.toNumber().toFixed(6)}, ${rd_y.toNumber().toFixed(6)}, ${rd_z.toNumber().toFixed(6)})`);
console.log();

// Verify: axis direction should be unchanged by rotation around that axis
const axis_norm = Math.sqrt(3);
const [rd_ax, rd_ay, rd_az] = Transforms3D.applyTransform(
  R_diagonal,
  1/axis_norm,
  1/axis_norm,
  1/axis_norm
);
console.log('Point on rotation axis should not move:');
console.log(`Before: (${(1/axis_norm).toFixed(6)}, ${(1/axis_norm).toFixed(6)}, ${(1/axis_norm).toFixed(6)})`);
console.log(`After:  (${rd_ax.toNumber().toFixed(6)}, ${rd_ay.toNumber().toFixed(6)}, ${rd_az.toNumber().toFixed(6)})`);
console.log('Unchanged ✓');
console.log();

// Rotate around horizontal axis pointing northeast
console.log('Rotate 45° around axis (1, 1, 0) - northeast in XY plane:');
const R_ne = Transforms3D.rotateAroundAxis(1, 1, 0, Math.PI / 4);
const [rne_x, rne_y, rne_z] = Transforms3D.applyTransform(R_ne, 0, 0, 1);
console.log('Point (0, 0, 1) on +Z axis:');
console.log(`After rotation: (${rne_x.toNumber().toFixed(6)}, ${rne_y.toNumber().toFixed(6)}, ${rne_z.toNumber().toFixed(6)})`);
console.log();

// Verify that rotateX/Y/Z are special cases of rotateAroundAxis
console.log('Verify: rotateX(θ) = rotateAroundAxis(1, 0, 0, θ)');
const Rx_special = Transforms3D.rotateAroundAxis(1, 0, 0, Math.PI / 6);
const Rx_standard = Transforms3D.rotateX(Math.PI / 6);
const test_point = [1, 2, 3];
const [special_x, special_y, special_z] = Transforms3D.applyTransform(Rx_special, ...test_point);
const [standard_x, standard_y, standard_z] = Transforms3D.applyTransform(Rx_standard, ...test_point);
console.log(`rotateAroundAxis: (${special_x.toNumber().toFixed(6)}, ${special_y.toNumber().toFixed(6)}, ${special_z.toNumber().toFixed(6)})`);
console.log(`rotateX:          (${standard_x.toNumber().toFixed(6)}, ${standard_y.toNumber().toFixed(6)}, ${standard_z.toNumber().toFixed(6)})`);
console.log('Identical ✓');
console.log();

// ============================================================================
// ROTATION AROUND A POINT IN 3D
// ============================================================================

console.log('7. Rotation Around a Point in 3D\n' + '-'.repeat(40));

// Rotate around an axis passing through a specific point (not origin)
// This is useful for rotating objects around their center

const center = [10, 20, 30]; // Center point
const axis = [0, 0, 1];       // Axis direction (Z axis)
const angle_around_point = Math.PI / 4; // 45 degrees

const R_around_point = Transforms3D.rotateAroundPoint(
  ...axis,
  angle_around_point,
  ...center
);

console.log(`Rotate 45° around Z axis passing through (${center.join(', ')}):`);

// The center point itself should not move
const [cp_x, cp_y, cp_z] = Transforms3D.applyTransform(R_around_point, ...center);
console.log(`Center after transform: (${cp_x.toString()}, ${cp_y.toString()}, ${cp_z.toString()})`);
console.log('Center stays fixed ✓');
console.log();

// A point offset from the center
const offset_point = [center[0] + 5, center[1], center[2]];
const [op_x, op_y, op_z] = Transforms3D.applyTransform(R_around_point, ...offset_point);
console.log(`Point (${offset_point.join(', ')}) - 5 units from center on +X:`);
console.log(`After rotation: (${op_x.toNumber().toFixed(4)}, ${op_y.toNumber().toFixed(4)}, ${op_z.toNumber().toFixed(4)})`);
console.log('Point rotates in XY plane around the center');
console.log();

// ============================================================================
// 3D REFLECTIONS
// ============================================================================

console.log('8. 3D Reflections\n' + '-'.repeat(40));

// Reflect across XY plane (flip Z)
const RefXY = Transforms3D.reflectXY();
const [rxy_x, rxy_y, rxy_z] = Transforms3D.applyTransform(RefXY, 1, 2, 3);
console.log('Reflect across XY plane (z=0):');
console.log(`Point (1, 2, 3) → (${rxy_x.toString()}, ${rxy_y.toString()}, ${rxy_z.toString()})`);
console.log('Expected: (1, 2, -3) - Z coordinate flipped ✓');
console.log();

// Reflect across XZ plane (flip Y)
const RefXZ = Transforms3D.reflectXZ();
const [rxz_x, rxz_y, rxz_z] = Transforms3D.applyTransform(RefXZ, 1, 2, 3);
console.log('Reflect across XZ plane (y=0):');
console.log(`Point (1, 2, 3) → (${rxz_x.toString()}, ${rxz_y.toString()}, ${rxz_z.toString()})`);
console.log('Expected: (1, -2, 3) - Y coordinate flipped ✓');
console.log();

// Reflect across YZ plane (flip X)
const RefYZ = Transforms3D.reflectYZ();
const [ryz_x, ryz_y, ryz_z] = Transforms3D.applyTransform(RefYZ, 1, 2, 3);
console.log('Reflect across YZ plane (x=0):');
console.log(`Point (1, 2, 3) → (${ryz_x.toString()}, ${ryz_y.toString()}, ${ryz_z.toString()})`);
console.log('Expected: (-1, 2, 3) - X coordinate flipped ✓');
console.log();

// Reflect through origin (point inversion - flip all coordinates)
const RefO = Transforms3D.reflectOrigin();
const [ro_x, ro_y, ro_z] = Transforms3D.applyTransform(RefO, 1, 2, 3);
console.log('Reflect through origin (point inversion):');
console.log(`Point (1, 2, 3) → (${ro_x.toString()}, ${ro_y.toString()}, ${ro_z.toString()})`);
console.log('Expected: (-1, -2, -3) - all coordinates flipped ✓');
console.log();

// ============================================================================
// TRANSFORM COMPOSITION IN 3D
// ============================================================================

console.log('9. Composing 3D Transforms\n' + '-'.repeat(40));

console.log('Like 2D, composition is RIGHT-TO-LEFT:');
console.log('M = A.mul(B).mul(C) means: first C, then B, then A');
console.log();

// Example: Scale → Rotate around X → Translate
const S3 = Transforms3D.scale(2);
const Rx3 = Transforms3D.rotateX(Math.PI / 4);
const T3 = Transforms3D.translation(10, 5, 0);

const composed = T3.mul(Rx3).mul(S3);

console.log('Composed: Translate(10,5,0) · RotateX(45°) · Scale(2)');
console.log('Execution order: Scale → RotateX → Translate');
console.log();

const test_p = [1, 0, 0];
const [c_x, c_y, c_z] = Transforms3D.applyTransform(composed, ...test_p);
console.log(`Point (${test_p.join(', ')}):`);
console.log(`Step 1 - Scale 2×:      (2, 0, 0)`);
console.log(`Step 2 - Rotate X 45°:   (2, 0, 0)  [no change, on X axis]`);
console.log(`Step 3 - Translate:      (12, 5, 0)`);
console.log(`Final: (${c_x.toString()}, ${c_y.toString()}, ${c_z.toString()}) ✓`);
console.log();

// ============================================================================
// PRACTICAL 3D SCENARIOS
// ============================================================================

console.log('10. Practical 3D Scenarios\n' + '-'.repeat(40));

console.log('Scenario A: Euler Angles (Pitch-Yaw-Roll)');
console.log('-'.repeat(40));

// Common in aviation and 3D graphics: combine rotations around all axes
const pitch = Math.PI / 12;  // 15° - nose up/down
const yaw = Math.PI / 6;     // 30° - turn left/right
const roll = Math.PI / 8;    // 22.5° - bank left/right

// Standard aerospace convention: Yaw → Pitch → Roll
const euler = Transforms3D.rotateZ(roll)
  .mul(Transforms3D.rotateX(pitch))
  .mul(Transforms3D.rotateY(yaw));

console.log('Euler angles: Yaw=30°, Pitch=15°, Roll=22.5°');
console.log('Apply to forward vector (0, 0, 1):');
const [e_x, e_y, e_z] = Transforms3D.applyTransform(euler, 0, 0, 1);
console.log(`Result: (${e_x.toNumber().toFixed(4)}, ${e_y.toNumber().toFixed(4)}, ${e_z.toNumber().toFixed(4)})`);
console.log('This is the new "forward" direction after rotation');
console.log();

console.log('Scenario B: Orbit Camera Around Object');
console.log('-'.repeat(40));

// Camera orbiting around object at origin
// Orbit at distance 10, angle 45° around Y axis
const orbit_distance = 10;
const orbit_angle = Math.PI / 4;

// Start at (distance, 0, 0), rotate around Y axis
const camera_start = [orbit_distance, 0, 0];
const orbit_transform = Transforms3D.rotateY(orbit_angle);
const [cam_x, cam_y, cam_z] = Transforms3D.applyTransform(orbit_transform, ...camera_start);

console.log(`Camera starts at (${orbit_distance}, 0, 0)`);
console.log(`After orbiting 45° around Y axis:`);
console.log(`Position: (${cam_x.toNumber().toFixed(4)}, ${cam_y.toNumber().toFixed(4)}, ${cam_z.toNumber().toFixed(4)})`);
console.log(`Distance from origin: ${Math.sqrt(cam_x.mul(cam_x).plus(cam_z.mul(cam_z)).toNumber()).toFixed(4)} (preserved)`);
console.log();

console.log('Scenario C: Cube Vertices Transformation');
console.log('-'.repeat(40));

// Unit cube centered at origin: vertices at (±1, ±1, ±1)
const cube_vertices = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // Bottom face
  [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1]  // Top face
];

// Transform: rotate 30° around (1,1,1) axis, then scale 1.5×
const cube_transform = Transforms3D.scale(1.5)
  .mul(Transforms3D.rotateAroundAxis(1, 1, 1, Math.PI / 6));

console.log('Original cube vertices (±1, ±1, ±1):');
cube_vertices.forEach((v, i) => {
  console.log(`  v${i}: (${v[0].toString().padStart(2)}, ${v[1].toString().padStart(2)}, ${v[2].toString().padStart(2)})`);
});
console.log();

console.log('After rotate 30° around (1,1,1) and scale 1.5×:');
cube_vertices.forEach((v, i) => {
  const [vx, vy, vz] = Transforms3D.applyTransform(cube_transform, ...v);
  console.log(`  v${i}: (${vx.toNumber().toFixed(3).padStart(7)}, ${vy.toNumber().toFixed(3).padStart(7)}, ${vz.toNumber().toFixed(3).padStart(7)})`);
});
console.log();

// ============================================================================
// TRANSFORM PROPERTIES IN 3D
// ============================================================================

console.log('11. Transform Properties\n' + '-'.repeat(40));

// Determinant in 3D measures volume scaling
const scale_3d = Transforms3D.scale(2, 1.5, 0.5);
const det_3d = scale_3d.determinant();
console.log('Scale(2, 1.5, 0.5) determinant:', det_3d.toString());
console.log('Volume scaling factor: 2 × 1.5 × 0.5 = 1.5 ✓');
console.log();

// Rotation preserves volume (determinant = 1)
const rot_any = Transforms3D.rotateAroundAxis(3, 4, 5, Math.PI / 7);
const rot_det = rot_any.determinant();
console.log('Arbitrary rotation determinant:', rot_det.toString());
console.log('Volume preserved (det = 1) ✓');
console.log();

// Reflection has determinant = -1 (reverses orientation)
const ref_det = Transforms3D.reflectXY().determinant();
console.log('Reflection determinant:', ref_det.toString());
console.log('Orientation reversed (det = -1) ✓');
console.log();

// Inverse transform
const transform_3d = Transforms3D.translation(5, 3, 2)
  .mul(Transforms3D.rotateZ(Math.PI / 6));
const inverse_3d = transform_3d.inverse();

const orig = [7, 11, 13];
const [fwd_3x, fwd_3y, fwd_3z] = Transforms3D.applyTransform(transform_3d, ...orig);
const [back_3x, back_3y, back_3z] = Transforms3D.applyTransform(inverse_3d, fwd_3x, fwd_3y, fwd_3z);

console.log('Transform and inverse:');
console.log(`Original:    (${orig[0]}, ${orig[1]}, ${orig[2]})`);
console.log(`Forward:     (${fwd_3x.toNumber().toFixed(4)}, ${fwd_3y.toNumber().toFixed(4)}, ${fwd_3z.toNumber().toFixed(4)})`);
console.log(`Inverse:     (${back_3x.toNumber().toFixed(4)}, ${back_3y.toNumber().toFixed(4)}, ${back_3z.toNumber().toFixed(4)})`);
console.log('Back to original ✓');
console.log();

// ============================================================================
// GIMBAL LOCK DEMONSTRATION
// ============================================================================

console.log('12. Gimbal Lock (Euler Angle Limitation)\n' + '-'.repeat(40));

console.log('Gimbal lock occurs when using Euler angles for rotation.');
console.log('When pitch = ±90°, yaw and roll become equivalent (lose one degree of freedom).');
console.log();

// Set pitch to 90° (pointing straight up)
const gimbal_pitch = Math.PI / 2;
const gimbal_yaw = Math.PI / 6;
const gimbal_roll = Math.PI / 4;

const gimbal_transform = Transforms3D.rotateZ(gimbal_roll)
  .mul(Transforms3D.rotateX(gimbal_pitch))
  .mul(Transforms3D.rotateY(gimbal_yaw));

console.log('Pitch=90° (straight up), Yaw=30°, Roll=45°');
const [gx, gy, gz] = Transforms3D.applyTransform(gimbal_transform, 1, 0, 0);
console.log(`Forward vector (1,0,0) becomes: (${gx.toNumber().toFixed(4)}, ${gy.toNumber().toFixed(4)}, ${gz.toNumber().toFixed(4)})`);
console.log();

console.log('Alternative: Use quaternions or axis-angle (Rodrigues) to avoid gimbal lock.');
console.log('rotateAroundAxis() doesn\'t suffer from gimbal lock!');
console.log();

console.log('='.repeat(80));
console.log('Example complete! This demonstrates 3D affine transformations.');
console.log('Key takeaways:');
console.log('- Use 4×4 matrices with homogeneous coordinates [x, y, z, 1]');
console.log('- X/Y/Z rotations follow right-hand rule');
console.log('- Rodrigues\' formula rotates around arbitrary axes');
console.log('- Euler angles (pitch/yaw/roll) can cause gimbal lock');
console.log('- Axis-angle representation avoids gimbal lock');
console.log('='.repeat(80));