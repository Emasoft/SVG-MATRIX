import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';

/**
 * Helper to convert any numeric input to Decimal.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 */
const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * 3D Affine Transforms using 4x4 homogeneous matrices.
 *
 * All transforms return 4x4 Matrix objects that can be composed via multiplication.
 * Transform composition is right-to-left: T.mul(R).mul(S) applies S first, then R, then T.
 *
 * Rotation matrices use the right-hand rule: positive angles rotate counterclockwise
 * when looking down the axis toward the origin.
 *
 * @module Transforms3D
 */

/**
 * Create a 3D translation matrix.
 * @param {number|string|Decimal} tx - Translation in X direction
 * @param {number|string|Decimal} ty - Translation in Y direction
 * @param {number|string|Decimal} tz - Translation in Z direction
 * @returns {Matrix} 4x4 translation matrix
 */
export function translation(tx, ty, tz) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), new Decimal(0), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1), D(tz)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a 3D scaling matrix.
 * @param {number|string|Decimal} sx - Scale factor in X direction
 * @param {number|string|Decimal} [sy=sx] - Scale factor in Y direction (defaults to sx)
 * @param {number|string|Decimal} [sz=sx] - Scale factor in Z direction (defaults to sx)
 * @returns {Matrix} 4x4 scaling matrix
 */
export function scale(sx, sy = null, sz = null) {
  if (sy === null) sy = sx;
  if (sz === null) sz = sx;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(sy), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), D(sz), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a rotation matrix around the X axis.
 *
 * | 1    0        0     0 |
 * | 0  cos(θ)  -sin(θ)  0 |
 * | 0  sin(θ)   cos(θ)  0 |
 * | 0    0        0     1 |
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 4x4 rotation matrix
 */
export function rotateX(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), c, s.negated(), new Decimal(0)],
    [new Decimal(0), s, c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a rotation matrix around the Y axis.
 *
 * |  cos(θ)  0  sin(θ)  0 |
 * |    0     1    0     0 |
 * | -sin(θ)  0  cos(θ)  0 |
 * |    0     0    0     1 |
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 4x4 rotation matrix
 */
export function rotateY(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, new Decimal(0), s, new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [s.negated(), new Decimal(0), c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a rotation matrix around the Z axis.
 *
 * | cos(θ)  -sin(θ)  0  0 |
 * | sin(θ)   cos(θ)  0  0 |
 * |   0        0     1  0 |
 * |   0        0     0  1 |
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 4x4 rotation matrix
 */
export function rotateZ(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, s.negated(), new Decimal(0), new Decimal(0)],
    [s, c, new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a rotation matrix around an arbitrary axis through the origin.
 * Uses Rodrigues' rotation formula.
 *
 * The axis vector (ux, uy, uz) is automatically normalized.
 *
 * @param {number|string|Decimal} ux - X component of rotation axis
 * @param {number|string|Decimal} uy - Y component of rotation axis
 * @param {number|string|Decimal} uz - Z component of rotation axis
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 4x4 rotation matrix
 * @throws {Error} If axis is zero vector
 */
export function rotateAroundAxis(ux, uy, uz, theta) {
  const u = [D(ux), D(uy), D(uz)];
  let norm = u[0].mul(u[0]).plus(u[1].mul(u[1])).plus(u[2].mul(u[2])).sqrt();
  if (norm.isZero()) throw new Error('Rotation axis cannot be zero vector');
  // Normalize axis
  u[0] = u[0].div(norm);
  u[1] = u[1].div(norm);
  u[2] = u[2].div(norm);

  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  const one = new Decimal(1);

  // Rodrigues' rotation formula components
  const ux2 = u[0].mul(u[0]), uy2 = u[1].mul(u[1]), uz2 = u[2].mul(u[2]);
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
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a rotation matrix around an arbitrary axis through a specific point.
 * Equivalent to: translate(px, py, pz) × rotateAroundAxis(...) × translate(-px, -py, -pz)
 *
 * @param {number|string|Decimal} ux - X component of rotation axis
 * @param {number|string|Decimal} uy - Y component of rotation axis
 * @param {number|string|Decimal} uz - Z component of rotation axis
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @param {number|string|Decimal} px - X coordinate of rotation center
 * @param {number|string|Decimal} py - Y coordinate of rotation center
 * @param {number|string|Decimal} pz - Z coordinate of rotation center
 * @returns {Matrix} 4x4 rotation matrix around point (px, py, pz)
 */
export function rotateAroundPoint(ux, uy, uz, theta, px, py, pz) {
  const pxD = D(px), pyD = D(py), pzD = D(pz);
  return translation(pxD, pyD, pzD)
    .mul(rotateAroundAxis(ux, uy, uz, theta))
    .mul(translation(pxD.negated(), pyD.negated(), pzD.negated()));
}

/**
 * Apply a 3D transform matrix to a point.
 * Uses homogeneous coordinates with perspective division.
 *
 * @param {Matrix} M - 4x4 transformation matrix
 * @param {number|string|Decimal} x - X coordinate of point
 * @param {number|string|Decimal} y - Y coordinate of point
 * @param {number|string|Decimal} z - Z coordinate of point
 * @returns {Decimal[]} Transformed point as [x', y', z'] array of Decimals
 */
export function applyTransform(M, x, y, z) {
  const P = Matrix.from([[D(x)], [D(y)], [D(z)], [new Decimal(1)]]);
  const R = M.mul(P);
  const rx = R.data[0][0], ry = R.data[1][0], rz = R.data[2][0], rw = R.data[3][0];
  // Perspective division (for affine transforms, rw is always 1)
  return [rx.div(rw), ry.div(rw), rz.div(rw)];
}

/**
 * Create a reflection matrix across the XY plane (flips Z).
 * @returns {Matrix} 4x4 reflection matrix
 */
export function reflectXY() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a reflection matrix across the XZ plane (flips Y).
 * @returns {Matrix} 4x4 reflection matrix
 */
export function reflectXZ() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a reflection matrix across the YZ plane (flips X).
 * @returns {Matrix} 4x4 reflection matrix
 */
export function reflectYZ() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a reflection matrix across the origin (flips X, Y, and Z).
 * @returns {Matrix} 4x4 reflection matrix
 */
export function reflectOrigin() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}
