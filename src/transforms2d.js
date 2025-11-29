import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';

/**
 * Helper to convert any numeric input to Decimal.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 */
const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * 2D Affine Transforms using 3x3 homogeneous matrices.
 *
 * All transforms return 3x3 Matrix objects that can be composed via multiplication.
 * Transform composition is right-to-left: T.mul(R).mul(S) applies S first, then R, then T.
 *
 * @module Transforms2D
 */

/**
 * Create a 2D translation matrix.
 * @param {number|string|Decimal} tx - Translation in X direction
 * @param {number|string|Decimal} ty - Translation in Y direction
 * @returns {Matrix} 3x3 translation matrix
 */
export function translation(tx, ty) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a 2D scaling matrix.
 * @param {number|string|Decimal} sx - Scale factor in X direction
 * @param {number|string|Decimal} [sy=sx] - Scale factor in Y direction (defaults to sx for uniform scaling)
 * @returns {Matrix} 3x3 scaling matrix
 */
export function scale(sx, sy = null) {
  if (sy === null) sy = sx;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(sy), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a 2D rotation matrix (counterclockwise around origin).
 *
 * Uses standard rotation matrix:
 * | cos(θ)  -sin(θ)  0 |
 * | sin(θ)   cos(θ)  0 |
 * |   0        0     1 |
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @returns {Matrix} 3x3 rotation matrix
 */
export function rotate(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, s.negated(), new Decimal(0)],
    [s, c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a 2D rotation matrix around a specific point.
 * Equivalent to: translate(px, py) × rotate(theta) × translate(-px, -py)
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians
 * @param {number|string|Decimal} px - X coordinate of rotation center
 * @param {number|string|Decimal} py - Y coordinate of rotation center
 * @returns {Matrix} 3x3 rotation matrix around point (px, py)
 */
export function rotateAroundPoint(theta, px, py) {
  const pxD = D(px);
  const pyD = D(py);
  return translation(pxD, pyD).mul(rotate(theta)).mul(translation(pxD.negated(), pyD.negated()));
}

/**
 * Create a 2D skew (shear) matrix.
 *
 * | 1   ax  0 |
 * | ay  1   0 |
 * | 0   0   1 |
 *
 * @param {number|string|Decimal} ax - Skew factor in X direction (affects X based on Y)
 * @param {number|string|Decimal} ay - Skew factor in Y direction (affects Y based on X)
 * @returns {Matrix} 3x3 skew matrix
 */
export function skew(ax, ay) {
  return Matrix.from([
    [new Decimal(1), D(ax), new Decimal(0)],
    [D(ay), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a stretch matrix along a specified axis direction.
 * Stretches by factor k along the unit vector (ux, uy).
 *
 * The axis should be normalized (ux² + uy² = 1), but this is not enforced.
 *
 * @param {number|string|Decimal} ux - X component of axis direction (unit vector)
 * @param {number|string|Decimal} uy - Y component of axis direction (unit vector)
 * @param {number|string|Decimal} k - Stretch factor along the axis
 * @returns {Matrix} 3x3 stretch matrix
 */
export function stretchAlongAxis(ux, uy, k) {
  const uxD = D(ux), uyD = D(uy), kD = D(k);
  const one = new Decimal(1);
  const factor = kD.minus(one);
  const m00 = one.plus(factor.mul(uxD.mul(uxD)));
  const m01 = factor.mul(uxD.mul(uyD));
  const m10 = factor.mul(uyD.mul(uxD));
  const m11 = one.plus(factor.mul(uyD.mul(uyD)));
  return Matrix.from([
    [m00, m01, new Decimal(0)],
    [m10, m11, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Apply a 2D transform matrix to a point.
 * Uses homogeneous coordinates with perspective division.
 *
 * @param {Matrix} M - 3x3 transformation matrix
 * @param {number|string|Decimal} x - X coordinate of point
 * @param {number|string|Decimal} y - Y coordinate of point
 * @returns {Decimal[]} Transformed point as [x', y'] array of Decimals
 */
export function applyTransform(M, x, y) {
  const P = Matrix.from([[D(x)], [D(y)], [new Decimal(1)]]);
  const R = M.mul(P);
  const rx = R.data[0][0], ry = R.data[1][0], rw = R.data[2][0];
  // Perspective division (for affine transforms, rw is always 1)
  return [rx.div(rw), ry.div(rw)];
}

/**
 * Create a reflection matrix across the X axis (flips Y).
 * @returns {Matrix} 3x3 reflection matrix
 */
export function reflectX() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a reflection matrix across the Y axis (flips X).
 * @returns {Matrix} 3x3 reflection matrix
 */
export function reflectY() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}

/**
 * Create a reflection matrix across the origin (flips both X and Y).
 * Equivalent to rotation by π radians.
 * @returns {Matrix} 3x3 reflection matrix
 */
export function reflectOrigin() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)]
  ]);
}
