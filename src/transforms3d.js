import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";

/**
 * Helper to convert any numeric input to Decimal.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 */
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * 3D Affine Transforms using 4x4 homogeneous matrices.
 *
 * ## Mathematical Foundation
 *
 * In 3D computer graphics, affine transformations (translation, rotation, scaling, reflection)
 * are represented using 4x4 matrices in homogeneous coordinates. A 3D point (x, y, z) is
 * represented as a 4D vector [x, y, z, 1]ᵀ, where the extra 1 enables translation via
 * matrix multiplication.
 *
 * The general form of a 4x4 affine transformation matrix is:
 *
 * ```
 * | a  b  c  tx |
 * | d  e  f  ty |
 * | g  h  i  tz |
 * | 0  0  0  1  |
 * ```
 *
 * Where the 3x3 upper-left submatrix handles rotation/scaling/shear, and the rightmost
 * column (tx, ty, tz) handles translation.
 *
 * ## Transform Composition
 *
 * All transforms return 4x4 Matrix objects that can be composed via multiplication.
 * **IMPORTANT**: Transform composition is right-to-left: `T.mul(R).mul(S)` applies S first,
 * then R, then T. This follows standard matrix multiplication order.
 *
 * Example: To rotate then translate:
 * ```js
 * const M = translation(10, 0, 0).mul(rotateZ(Math.PI/4));
 * // Applies rotation first, then translation
 * ```
 *
 * ## Rotation Convention
 *
 * Rotation matrices use the right-hand rule: positive angles rotate counterclockwise
 * when looking down the axis toward the origin. This means:
 * - rotateX: Y→Z (thumb points +X, fingers curl Y toward Z)
 * - rotateY: Z→X (thumb points +Y, fingers curl Z toward X)
 * - rotateZ: X→Y (thumb points +Z, fingers curl X toward Y)
 *
 * @module Transforms3D
 */

/**
 * Create a 3D translation matrix.
 *
 * Produces a 4x4 matrix that translates points by the vector (tx, ty, tz).
 * Translation matrices have the form:
 *
 * ```
 * | 1  0  0  tx |
 * | 0  1  0  ty |
 * | 0  0  1  tz |
 * | 0  0  0  1  |
 * ```
 *
 * When applied to a point P = [x, y, z, 1]ᵀ, the result is [x+tx, y+ty, z+tz, 1]ᵀ.
 *
 * @param {number|string|Decimal} tx - Translation distance in X direction (right/left)
 * @param {number|string|Decimal} ty - Translation distance in Y direction (up/down)
 * @param {number|string|Decimal} tz - Translation distance in Z direction (forward/back)
 * @returns {Matrix} 4x4 translation matrix with arbitrary precision
 *
 * @example
 * // Move point 5 units right, 3 units up, 2 units forward
 * const T = translation(5, 3, 2);
 * const [x, y, z] = applyTransform(T, 0, 0, 0);
 * // Result: x=5, y=3, z=2
 *
 * @example
 * // Compose with rotation: translate then rotate
 * const M = rotateZ(Math.PI/4).mul(translation(10, 0, 0));
 * // First translates by (10,0,0), then rotates around Z
 */
export function translation(tx, ty, tz) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), new Decimal(0), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1), D(tz)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a 3D scaling matrix.
 *
 * Produces a 4x4 matrix that scales points by factors (sx, sy, sz) along each axis.
 * Scaling matrices have the form:
 *
 * ```
 * | sx  0   0   0 |
 * | 0   sy  0   0 |
 * | 0   0   sz  0 |
 * | 0   0   0   1 |
 * ```
 *
 * When applied to a point P = [x, y, z, 1]ᵀ, the result is [sx·x, sy·y, sz·z, 1]ᵀ.
 * Uniform scaling occurs when sx = sy = sz. Non-uniform scaling stretches/compresses
 * along individual axes.
 *
 * @param {number|string|Decimal} sx - Scale factor in X direction (width multiplier)
 * @param {number|string|Decimal} [sy=sx] - Scale factor in Y direction (height multiplier, defaults to sx for uniform scaling)
 * @param {number|string|Decimal} [sz=sx] - Scale factor in Z direction (depth multiplier, defaults to sx for uniform scaling)
 * @returns {Matrix} 4x4 scaling matrix with arbitrary precision
 *
 * @example
 * // Uniform scaling: double size in all dimensions
 * const S1 = scale(2);
 * // Equivalent to scale(2, 2, 2)
 *
 * @example
 * // Non-uniform scaling: stretch X by 2, compress Y by 0.5, keep Z unchanged
 * const S2 = scale(2, 0.5, 1);
 * const [x, y, z] = applyTransform(S2, 1, 1, 1);
 * // Result: x=2, y=0.5, z=1
 *
 * @example
 * // Negative scale factors create reflections
 * const mirror = scale(-1, 1, 1); // Flip X axis
 */
export function scale(sx, sy = null, sz = null) {
  const syValue = sy === null ? sx : sy;
  const szValue = sz === null ? sx : sz;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(syValue), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), D(szValue), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a rotation matrix around the X axis.
 *
 * Rotates points counterclockwise around the X axis (right-hand rule: thumb points +X,
 * fingers curl from +Y toward +Z). This rotates the YZ plane while leaving X coordinates
 * unchanged.
 *
 * Matrix form:
 * ```
 * | 1    0        0     0 |
 * | 0  cos(θ)  -sin(θ)  0 |
 * | 0  sin(θ)   cos(θ)  0 |
 * | 0    0        0     1 |
 * ```
 *
 * The rotation is applied in the YZ plane: Y' = Y·cos(θ) - Z·sin(θ), Z' = Y·sin(θ) + Z·cos(θ)
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians. Positive angles rotate
 *                                        counterclockwise when looking down +X toward origin.
 * @returns {Matrix} 4x4 rotation matrix with arbitrary precision
 *
 * @example
 * // Rotate 90° around X axis: Y→Z, Z→-Y
 * const R = rotateX(Math.PI / 2);
 * const [x, y, z] = applyTransform(R, 0, 1, 0);
 * // Result: x≈0, y≈0, z≈1 (point on +Y axis moves to +Z axis)
 *
 * @example
 * // Pitch rotation in 3D graphics (nodding head up/down)
 * const pitch = rotateX(-0.1); // Slight downward tilt
 */
export function rotateX(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), c, s.negated(), new Decimal(0)],
    [new Decimal(0), s, c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a rotation matrix around the Y axis.
 *
 * Rotates points counterclockwise around the Y axis (right-hand rule: thumb points +Y,
 * fingers curl from +Z toward +X). This rotates the XZ plane while leaving Y coordinates
 * unchanged.
 *
 * Matrix form:
 * ```
 * |  cos(θ)  0  sin(θ)  0 |
 * |    0     1    0     0 |
 * | -sin(θ)  0  cos(θ)  0 |
 * |    0     0    0     1 |
 * ```
 *
 * The rotation is applied in the XZ plane: X' = X·cos(θ) + Z·sin(θ), Z' = -X·sin(θ) + Z·cos(θ)
 * Note the sign pattern differs from rotateX/rotateZ due to maintaining right-hand rule consistency.
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians. Positive angles rotate
 *                                        counterclockwise when looking down +Y toward origin.
 * @returns {Matrix} 4x4 rotation matrix with arbitrary precision
 *
 * @example
 * // Rotate 90° around Y axis: Z→X, X→-Z
 * const R = rotateY(Math.PI / 2);
 * const [x, y, z] = applyTransform(R, 0, 0, 1);
 * // Result: x≈1, y≈0, z≈0 (point on +Z axis moves to +X axis)
 *
 * @example
 * // Yaw rotation in 3D graphics (turning head left/right)
 * const yaw = rotateY(0.5); // Turn right by ~28.6°
 */
export function rotateY(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, new Decimal(0), s, new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [s.negated(), new Decimal(0), c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a rotation matrix around the Z axis.
 *
 * Rotates points counterclockwise around the Z axis (right-hand rule: thumb points +Z,
 * fingers curl from +X toward +Y). This rotates the XY plane while leaving Z coordinates
 * unchanged. This is the most common rotation in 2D graphics extended to 3D.
 *
 * Matrix form:
 * ```
 * | cos(θ)  -sin(θ)  0  0 |
 * | sin(θ)   cos(θ)  0  0 |
 * |   0        0     1  0 |
 * |   0        0     0  1 |
 * ```
 *
 * The rotation is applied in the XY plane: X' = X·cos(θ) - Y·sin(θ), Y' = X·sin(θ) + Y·cos(θ)
 * This is identical to the standard 2D rotation extended with Z and W components.
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians. Positive angles rotate
 *                                        counterclockwise when looking down +Z toward origin
 *                                        (standard 2D counterclockwise from above).
 * @returns {Matrix} 4x4 rotation matrix with arbitrary precision
 *
 * @example
 * // Rotate 90° around Z axis: X→Y, Y→-X
 * const R = rotateZ(Math.PI / 2);
 * const [x, y, z] = applyTransform(R, 1, 0, 0);
 * // Result: x≈0, y≈1, z≈0 (point on +X axis moves to +Y axis)
 *
 * @example
 * // Roll rotation in 3D graphics (tilting head left/right)
 * const roll = rotateZ(0.2); // Slight clockwise tilt from viewer perspective
 */
export function rotateZ(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, s.negated(), new Decimal(0), new Decimal(0)],
    [s, c, new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a rotation matrix around an arbitrary axis through the origin.
 *
 * Uses Rodrigues' rotation formula to construct a rotation matrix for any axis direction.
 * This is the general form of 3D rotation - rotateX, rotateY, and rotateZ are special cases
 * where the axis is aligned with a coordinate axis.
 *
 * ## Rodrigues' Rotation Formula
 *
 * For a unit axis vector **u** = (ux, uy, uz) and angle θ, the rotation matrix is:
 *
 * **R** = **I** + sin(θ)**K** + (1 - cos(θ))**K**²
 *
 * where **K** is the cross-product matrix of **u**:
 * ```
 * K = |  0   -uz   uy |
 *     |  uz   0   -ux |
 *     | -uy   ux   0  |
 * ```
 *
 * Alternatively, in component form:
 * ```
 * R_ij = cos(θ)δ_ij + (1-cos(θ))u_i·u_j + sin(θ)ε_ijk·u_k
 * ```
 *
 * where δ_ij is Kronecker delta and ε_ijk is Levi-Civita symbol.
 *
 * The axis vector (ux, uy, uz) is automatically normalized to unit length before use.
 * The rotation follows the right-hand rule: positive angles rotate counterclockwise when
 * looking down the axis toward the origin.
 *
 * @param {number|string|Decimal} ux - X component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} uy - Y component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} uz - Z component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 4x4 rotation matrix with arbitrary precision
 * @throws {Error} If axis is zero vector (undefined rotation)
 *
 * @example
 * // Rotate 45° around the diagonal axis (1,1,1)
 * const R = rotateAroundAxis(1, 1, 1, Math.PI / 4);
 * // The axis is automatically normalized to (1/√3, 1/√3, 1/√3)
 *
 * @example
 * // Rotate around arbitrary axis pointing northeast and up
 * const axis = [1, 1, 2]; // Not normalized
 * const angle = Math.PI / 3; // 60 degrees
 * const R = rotateAroundAxis(...axis, angle);
 *
 * @example
 * // Reproducing rotateX using arbitrary axis
 * const Rx = rotateAroundAxis(1, 0, 0, Math.PI / 2);
 * // Equivalent to rotateX(Math.PI / 2)
 */
export function rotateAroundAxis(ux, uy, uz, theta) {
  const u = [D(ux), D(uy), D(uz)];
  const norm = u[0].mul(u[0]).plus(u[1].mul(u[1])).plus(u[2].mul(u[2])).sqrt();
  if (norm.isZero()) throw new Error("Rotation axis cannot be zero vector");
  // Normalize axis
  u[0] = u[0].div(norm);
  u[1] = u[1].div(norm);
  u[2] = u[2].div(norm);

  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  const one = new Decimal(1);

  // Rodrigues' rotation formula components
  const ux2 = u[0].mul(u[0]),
    uy2 = u[1].mul(u[1]),
    uz2 = u[2].mul(u[2]);
  const m00 = ux2.plus(c.mul(one.minus(ux2)));
  const m01 = u[0].mul(u[1]).mul(one.minus(c)).minus(u[2].mul(s));
  const m02 = u[0].mul(u[2]).mul(one.minus(c)).plus(u[1].mul(s));
  const m10 = u[1].mul(u[0]).mul(one.minus(c)).plus(u[2].mul(s));
  const m11 = uy2.plus(c.mul(one.minus(uy2)));
  const m12 = u[1].mul(u[2]).mul(one.minus(c)).minus(u[0].mul(s));
  const m20 = u[2].mul(u[0]).mul(one.minus(c)).minus(u[1].mul(s));
  const m21 = u[2].mul(u[1]).mul(one.minus(c)).plus(u[0].mul(s));
  const m22 = uz2.plus(c.mul(one.minus(uz2)));

  return Matrix.from([
    [m00, m01, m02, new Decimal(0)],
    [m10, m11, m12, new Decimal(0)],
    [m20, m21, m22, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a rotation matrix around an arbitrary axis through a specific point.
 *
 * By default, rotateAroundAxis rotates around an axis passing through the origin.
 * This function rotates around an axis passing through an arbitrary point (px, py, pz).
 *
 * The transformation is mathematically equivalent to:
 * 1. Translate the pivot point to origin: T(-px, -py, -pz)
 * 2. Perform rotation around axis through origin: R(axis, θ)
 * 3. Translate back: T(px, py, pz)
 *
 * Matrix composition: **M** = T(p) · R(u,θ) · T(-p)
 *
 * This is essential for rotating objects around their center or any specific point
 * rather than around the world origin.
 *
 * @param {number|string|Decimal} ux - X component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} uy - Y component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} uz - Z component of rotation axis (need not be normalized)
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @param {number|string|Decimal} px - X coordinate of pivot point on rotation axis
 * @param {number|string|Decimal} py - Y coordinate of pivot point on rotation axis
 * @param {number|string|Decimal} pz - Z coordinate of pivot point on rotation axis
 * @returns {Matrix} 4x4 rotation matrix around axis through point (px, py, pz)
 *
 * @example
 * // Rotate a cube around its center at (5, 5, 5) instead of world origin
 * const center = [5, 5, 5];
 * const R = rotateAroundPoint(0, 0, 1, Math.PI/4, ...center);
 * // Rotates 45° around Z axis passing through (5,5,5)
 *
 * @example
 * // Swing a pendulum: rotate around pivot point at top
 * const pivot = [0, 10, 0]; // Pivot 10 units above origin
 * const swing = rotateAroundPoint(0, 0, 1, 0.3, ...pivot);
 * // Rotates around Z axis through (0,10,0)
 *
 * @example
 * // Rotate around diagonal axis through a specific point
 * const R = rotateAroundPoint(1, 1, 1, Math.PI/2, 10, 20, 30);
 * // Complex rotation around axis (1,1,1) passing through (10,20,30)
 */
export function rotateAroundPoint(ux, uy, uz, theta, px, py, pz) {
  const pxD = D(px),
    pyD = D(py),
    pzD = D(pz);
  return translation(pxD, pyD, pzD)
    .mul(rotateAroundAxis(ux, uy, uz, theta))
    .mul(translation(pxD.negated(), pyD.negated(), pzD.negated()));
}

/**
 * Apply a 3D transformation matrix to a point.
 *
 * Converts the 3D point (x, y, z) to homogeneous coordinates [x, y, z, 1]ᵀ,
 * multiplies by the transformation matrix M, then converts back to 3D via
 * perspective division.
 *
 * ## Homogeneous Coordinates
 *
 * A 3D point P = (x, y, z) is represented as a 4D vector [x, y, z, 1]ᵀ.
 * After transformation: P' = M · P = [x', y', z', w']ᵀ
 *
 * The final 3D point is obtained by perspective division:
 * ```
 * result = (x'/w', y'/w', z'/w')
 * ```
 *
 * For affine transformations (translation, rotation, scaling), w' is always 1,
 * so division has no effect. For perspective projections, w' varies and creates
 * the perspective effect.
 *
 * @param {Matrix} M - 4x4 transformation matrix to apply
 * @param {number|string|Decimal} x - X coordinate of input point
 * @param {number|string|Decimal} y - Y coordinate of input point
 * @param {number|string|Decimal} z - Z coordinate of input point
 * @returns {Decimal[]} Transformed point as [x', y', z'] array of Decimal values
 *
 * @example
 * // Translate a point
 * const T = translation(10, 5, 3);
 * const [x, y, z] = applyTransform(T, 0, 0, 0);
 * // Result: x=10, y=5, z=3
 *
 * @example
 * // Apply composed transformation
 * const M = translation(5, 0, 0).mul(rotateZ(Math.PI/4)).mul(scale(2));
 * const [x, y, z] = applyTransform(M, 1, 0, 0);
 * // First scales (2,0,0), then rotates, then translates
 *
 * @example
 * // Transform multiple points in a loop
 * const R = rotateY(Math.PI / 6);
 * const vertices = [[1,0,0], [0,1,0], [0,0,1]];
 * const transformed = vertices.map(([x,y,z]) => applyTransform(R, x, y, z));
 */
export function applyTransform(M, x, y, z) {
  const P = Matrix.from([[D(x)], [D(y)], [D(z)], [new Decimal(1)]]);
  const R = M.mul(P);
  const rx = R.data[0][0],
    ry = R.data[1][0],
    rz = R.data[2][0],
    rw = R.data[3][0];
  // Perspective division (for affine transforms, rw is always 1)
  return [rx.div(rw), ry.div(rw), rz.div(rw)];
}

/**
 * Create a reflection matrix across the XY plane.
 *
 * Reflects points across the XY plane (the plane where z=0), effectively flipping
 * the Z coordinate while leaving X and Y unchanged. This is equivalent to scaling
 * by (1, 1, -1).
 *
 * Matrix form:
 * ```
 * | 1   0   0  0 |
 * | 0   1   0  0 |
 * | 0   0  -1  0 |
 * | 0   0   0  1 |
 * ```
 *
 * Transformation: (x, y, z) → (x, y, -z)
 *
 * @returns {Matrix} 4x4 reflection matrix with determinant -1
 *
 * @example
 * // Mirror a point across XY plane
 * const M = reflectXY();
 * const [x, y, z] = applyTransform(M, 1, 2, 3);
 * // Result: x=1, y=2, z=-3
 *
 * @example
 * // Create symmetric geometry above and below XY plane
 * const original = [2, 3, 5];
 * const mirrored = applyTransform(reflectXY(), ...original);
 * // mirrored = [2, 3, -5]
 */
export function reflectXY() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a reflection matrix across the XZ plane.
 *
 * Reflects points across the XZ plane (the plane where y=0), effectively flipping
 * the Y coordinate while leaving X and Z unchanged. This is equivalent to scaling
 * by (1, -1, 1).
 *
 * Matrix form:
 * ```
 * | 1   0   0  0 |
 * | 0  -1   0  0 |
 * | 0   0   1  0 |
 * | 0   0   0  1 |
 * ```
 *
 * Transformation: (x, y, z) → (x, -y, z)
 *
 * @returns {Matrix} 4x4 reflection matrix with determinant -1
 *
 * @example
 * // Mirror a point across XZ plane
 * const M = reflectXZ();
 * const [x, y, z] = applyTransform(M, 1, 2, 3);
 * // Result: x=1, y=-2, z=3
 *
 * @example
 * // Create left-right symmetry in horizontal plane
 * const M = reflectXZ();
 * // Useful for mirroring floor plans or terrain
 */
export function reflectXZ() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a reflection matrix across the YZ plane.
 *
 * Reflects points across the YZ plane (the plane where x=0), effectively flipping
 * the X coordinate while leaving Y and Z unchanged. This is equivalent to scaling
 * by (-1, 1, 1).
 *
 * Matrix form:
 * ```
 * | -1  0   0  0 |
 * |  0  1   0  0 |
 * |  0  0   1  0 |
 * |  0  0   0  1 |
 * ```
 *
 * Transformation: (x, y, z) → (-x, y, z)
 *
 * @returns {Matrix} 4x4 reflection matrix with determinant -1
 *
 * @example
 * // Mirror a point across YZ plane
 * const M = reflectYZ();
 * const [x, y, z] = applyTransform(M, 1, 2, 3);
 * // Result: x=-1, y=2, z=3
 *
 * @example
 * // Create front-back symmetry
 * const M = reflectYZ();
 * // Useful for mirroring left/right halves of models
 */
export function reflectYZ() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a reflection matrix through the origin (point inversion).
 *
 * Reflects all points through the origin, effectively flipping all three coordinates.
 * This is equivalent to scaling by (-1, -1, -1), or a 180° rotation around any axis
 * through the origin. Also known as central inversion or point reflection.
 *
 * Matrix form:
 * ```
 * | -1  0   0  0 |
 * |  0 -1   0  0 |
 * |  0  0  -1  0 |
 * |  0  0   0  1 |
 * ```
 *
 * Transformation: (x, y, z) → (-x, -y, -z)
 *
 * This transformation has determinant -1 and is its own inverse (applying it twice
 * returns to the original position).
 *
 * @returns {Matrix} 4x4 reflection matrix with determinant -1
 *
 * @example
 * // Invert a point through origin
 * const M = reflectOrigin();
 * const [x, y, z] = applyTransform(M, 1, 2, 3);
 * // Result: x=-1, y=-2, z=-3
 *
 * @example
 * // Create antipodal symmetry (opposite sides)
 * const M = reflectOrigin();
 * const point = [5, 3, -2];
 * const opposite = applyTransform(M, ...point);
 * // opposite = [-5, -3, 2]
 *
 * @example
 * // Inversion is self-inverse: applying twice returns original
 * const M = reflectOrigin();
 * const M2 = M.mul(M);
 * // M2 equals identity matrix
 */
export function reflectOrigin() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}
