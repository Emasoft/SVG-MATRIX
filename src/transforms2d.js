import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";

/**
 * Helper to convert any numeric input to Decimal.
 * @param {number|string|Decimal} x - The value to convert
 * @returns {Decimal} The Decimal representation
 */
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * 2D Affine Transforms using 3x3 homogeneous matrices.
 *
 * ## Mathematical Basis
 *
 * 2D affine transformations are represented as 3x3 homogeneous matrices that operate on
 * homogeneous coordinates [x, y, 1]. This allows linear transformations (rotation, scaling,
 * shearing) and translation to be combined in a single matrix multiplication.
 *
 * A point (x, y) is represented in homogeneous coordinates as:
 * ```
 * [x]
 * [y]
 * [1]
 * ```
 *
 * A general 2D affine transformation matrix has the form:
 * ```
 * [a  b  tx]   [linear transformation | translation]
 * [c  d  ty] = [---------------------+------------]
 * [0  0   1]   [      perspective     |   scaling  ]
 * ```
 *
 * Where:
 * - [a b; c d] is the 2x2 linear transformation matrix (rotation, scale, shear)
 * - [tx, ty] is the translation vector
 * - The bottom row [0 0 1] ensures the transformation is affine (preserves parallel lines)
 *
 * ## Transform Composition
 *
 * Transforms are composed using matrix multiplication. The order matters!
 * Matrix multiplication is applied RIGHT-TO-LEFT:
 *
 * ```javascript
 * // To apply: first scale, then rotate, then translate
 * const composed = T.mul(R).mul(S);
 * // This reads right-to-left: S first, then R, then T
 * ```
 *
 * When applying to a point:
 * ```
 * point' = T × R × S × point
 *        = (T × R × S) × point
 *        = composed × point
 * ```
 *
 * ## Homogeneous Coordinates
 *
 * After transformation, we get homogeneous coordinates [x', y', w']. To convert back to
 * Cartesian coordinates, we perform perspective division: (x'/w', y'/w'). For affine
 * transforms, w' is always 1, but the division is performed for generality.
 *
 * @module Transforms2D
 */

/**
 * Create a 2D translation matrix.
 *
 * Translates points by adding (tx, ty) to their coordinates. Translation is the only
 * affine transformation that affects the position without changing orientation or scale.
 *
 * Matrix form:
 * ```
 * [1  0  tx]
 * [0  1  ty]
 * [0  0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = x + tx
 * y' = y + ty
 * ```
 *
 * @param {number|string|Decimal} tx - Translation distance in X direction (positive = right)
 * @param {number|string|Decimal} ty - Translation distance in Y direction (positive = down in screen coords, up in math coords)
 * @returns {Matrix} 3x3 translation matrix
 *
 * @example
 * // Move a point 5 units right and 3 units down
 * const T = translation(5, 3);
 * const [x, y] = applyTransform(T, 10, 20);
 * // Result: x = 15, y = 23
 *
 * @example
 * // Combine with rotation: translate then rotate around new position
 * const transform = rotation(Math.PI / 4).mul(translation(10, 0));
 * // This rotates 45° AFTER translating 10 units right
 */
export function translation(tx, ty) {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), D(tx)],
    [new Decimal(0), new Decimal(1), D(ty)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a 2D scaling matrix.
 *
 * Scales points by multiplying their coordinates by scale factors. The scaling is performed
 * relative to the origin (0, 0). To scale around a different point, combine with translation.
 *
 * Matrix form:
 * ```
 * [sx  0   0]
 * [0   sy  0]
 * [0   0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = x × sx
 * y' = y × sy
 * ```
 *
 * Special cases:
 * - sx = sy = 1: Identity (no change)
 * - sx = sy: Uniform scaling (preserves shape)
 * - sx ≠ sy: Non-uniform scaling (stretches or compresses)
 * - sx < 0 or sy < 0: Reflection combined with scaling
 *
 * @param {number|string|Decimal} sx - Scale factor in X direction (2.0 = double width, 0.5 = half width)
 * @param {number|string|Decimal} [sy=sx] - Scale factor in Y direction (defaults to sx for uniform scaling)
 * @returns {Matrix} 3x3 scaling matrix
 *
 * @example
 * // Uniform scaling: double the size
 * const S = scale(2);
 * const [x, y] = applyTransform(S, 10, 5);
 * // Result: x = 20, y = 10
 *
 * @example
 * // Non-uniform scaling: stretch horizontally, compress vertically
 * const S = scale(2, 0.5);
 * const [x, y] = applyTransform(S, 10, 20);
 * // Result: x = 20, y = 10
 *
 * @example
 * // Scale around a specific point (px, py)
 * const px = 100, py = 50;
 * const S = translation(px, py).mul(scale(2)).mul(translation(-px, -py));
 * // This scales by 2× around point (100, 50) instead of origin
 */
export function scale(sx, sy = null) {
  const syValue = sy === null ? sx : sy;
  return Matrix.from([
    [D(sx), new Decimal(0), new Decimal(0)],
    [new Decimal(0), D(syValue), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a 2D rotation matrix (counterclockwise around origin).
 *
 * Rotates points counterclockwise (in standard mathematical orientation) by angle θ
 * around the origin (0, 0). In screen coordinates (where Y increases downward),
 * this produces clockwise rotation.
 *
 * Matrix form:
 * ```
 * [cos(θ)  -sin(θ)  0]
 * [sin(θ)   cos(θ)  0]
 * [  0        0     1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = x⋅cos(θ) - y⋅sin(θ)
 * y' = x⋅sin(θ) + y⋅cos(θ)
 * ```
 *
 * The rotation preserves:
 * - Distance from origin: ||p'|| = ||p||
 * - Angles between vectors
 * - Areas and shapes (it's an isometry)
 *
 * Common angles:
 * - 0: No rotation
 * - π/4 (45°): Diagonal rotation
 * - π/2 (90°): Quarter turn
 * - π (180°): Half turn (point reflection)
 * - 2π (360°): Full rotation (identity)
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians (positive = counterclockwise in math coords)
 * @returns {Matrix} 3x3 rotation matrix
 *
 * @example
 * // Rotate point 90° counterclockwise (π/2 radians)
 * const R = rotate(Math.PI / 2);
 * const [x, y] = applyTransform(R, 10, 0);
 * // Result: x ≈ 0, y ≈ 10
 *
 * @example
 * // Rotate 45° counterclockwise
 * const R = rotate(Math.PI / 4);
 * const [x, y] = applyTransform(R, 1, 0);
 * // Result: x ≈ 0.707, y ≈ 0.707
 *
 * @example
 * // Rotate around a different point using rotateAroundPoint
 * const R = rotateAroundPoint(Math.PI / 2, 100, 100);
 * // Rotates 90° around point (100, 100)
 */
export function rotate(theta) {
  const t = D(theta);
  const c = new Decimal(Math.cos(t.toNumber()));
  const s = new Decimal(Math.sin(t.toNumber()));
  return Matrix.from([
    [c, s.negated(), new Decimal(0)],
    [s, c, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a 2D rotation matrix around a specific point.
 *
 * Rotates points counterclockwise by angle θ around an arbitrary center point (px, py)
 * instead of the origin. This is accomplished by:
 * 1. Translating the center point to the origin
 * 2. Performing the rotation
 * 3. Translating back to the original center
 *
 * Matrix composition:
 * ```
 * R_point = T(px, py) × R(θ) × T(-px, -py)
 * ```
 *
 * This is equivalent to:
 * ```
 * [cos(θ)  -sin(θ)  px - px⋅cos(θ) + py⋅sin(θ)]
 * [sin(θ)   cos(θ)  py - px⋅sin(θ) - py⋅cos(θ)]
 * [  0        0                    1           ]
 * ```
 *
 * Use cases:
 * - Rotating UI elements around their centers
 * - Rotating objects around pivot points
 * - Orbital motion around a fixed point
 *
 * @param {number|string|Decimal} theta - Rotation angle in radians (positive = counterclockwise)
 * @param {number|string|Decimal} px - X coordinate of rotation center (pivot point)
 * @param {number|string|Decimal} py - Y coordinate of rotation center (pivot point)
 * @returns {Matrix} 3x3 rotation matrix around point (px, py)
 *
 * @example
 * // Rotate a square around its center (50, 50) by 45°
 * const R = rotateAroundPoint(Math.PI / 4, 50, 50);
 * // The center point (50, 50) remains fixed after transformation
 * const [cx, cy] = applyTransform(R, 50, 50);
 * // Result: cx = 50, cy = 50 (center doesn't move)
 *
 * @example
 * // Rotate a point on a circle around center
 * const centerX = 100, centerY = 100;
 * const R = rotateAroundPoint(Math.PI / 6, centerX, centerY); // 30° rotation
 * const [x, y] = applyTransform(R, 110, 100); // Point on circle, 10 units right of center
 * // Result: point moves 30° counterclockwise around the center
 */
export function rotateAroundPoint(theta, px, py) {
  const pxD = D(px);
  const pyD = D(py);
  return translation(pxD, pyD)
    .mul(rotate(theta))
    .mul(translation(pxD.negated(), pyD.negated()));
}

/**
 * Create a 2D skew (shear) matrix.
 *
 * Skewing (or shearing) transforms parallel lines into parallel lines but changes angles
 * between lines. It "slants" the coordinate system. Unlike rotation, skew doesn't preserve
 * angles or distances, only parallelism and ratios of distances along parallel lines.
 *
 * Matrix form:
 * ```
 * [1   ax  0]
 * [ay  1   0]
 * [0   0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = x + ax⋅y    (X shifts based on Y coordinate)
 * y' = ay⋅x + y    (Y shifts based on X coordinate)
 * ```
 *
 * Visual effects:
 * - ax > 0: Shear right for positive Y (top of shape leans right in screen coords)
 * - ax < 0: Shear left for positive Y
 * - ay > 0: Shear up for positive X (right side of shape leans up in screen coords)
 * - ay < 0: Shear down for positive X
 *
 * Common uses:
 * - Creating italic/slanted text effects
 * - Simulating perspective distortion
 * - Parallelogram transformations
 *
 * Note: Skewing changes area by factor |1 - ax⋅ay| (determinant of linear part)
 *
 * @param {number|string|Decimal} ax - Horizontal skew factor (affects X based on Y). tan(angle) for X-axis skew.
 * @param {number|string|Decimal} ay - Vertical skew factor (affects Y based on X). tan(angle) for Y-axis skew.
 * @returns {Matrix} 3x3 skew matrix
 *
 * @example
 * // Skew horizontally (like italic text)
 * const S = skew(0.3, 0);
 * const [x, y] = applyTransform(S, 10, 20);
 * // Result: x = 10 + 0.3×20 = 16, y = 20
 * // Point at height 20 shifts 6 units to the right
 *
 * @example
 * // Skew at 30° angle from vertical
 * const S = skew(Math.tan(30 * Math.PI / 180), 0);
 * // Creates a ~30° slant (like italic text at 30° from vertical)
 *
 * @example
 * // Bi-directional skew (parallelogram transformation)
 * const S = skew(0.5, 0.3);
 * // Both coordinates affect each other, creating complex shearing
 */
export function skew(ax, ay) {
  return Matrix.from([
    [new Decimal(1), D(ax), new Decimal(0)],
    [D(ay), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a stretch matrix along a specified axis direction.
 *
 * Performs directional scaling: stretches (or compresses) space along an arbitrary
 * axis defined by the unit vector (ux, uy), while leaving the perpendicular direction
 * unchanged. This is more general than axis-aligned scaling.
 *
 * Mathematical formula:
 * ```
 * M = I + (k - 1)⋅u⋅u^T
 * where u = [ux, uy] is the unit direction vector
 * ```
 *
 * Matrix form:
 * ```
 * [1 + (k-1)⋅ux²     (k-1)⋅ux⋅uy      0]
 * [(k-1)⋅ux⋅uy      1 + (k-1)⋅uy²     0]
 * [     0                 0            1]
 * ```
 *
 * The stretch is applied only in the direction of (ux, uy). Perpendicular
 * directions remain unchanged. This is a directional scale transformation.
 *
 * Special cases:
 * - k = 1: Identity (no change)
 * - k = 2: Double length along axis
 * - k = 0.5: Half length along axis
 * - k = 0: Collapse onto perpendicular axis (singular matrix)
 * - (ux, uy) = (1, 0): Horizontal stretch (same as scale(k, 1))
 * - (ux, uy) = (0, 1): Vertical stretch (same as scale(1, k))
 *
 * Note: The axis vector should be normalized (ux² + uy² = 1) for correct behavior,
 * though this is not enforced. Non-unit vectors will produce scaled results.
 *
 * @param {number|string|Decimal} ux - X component of stretch axis direction (should be unit vector)
 * @param {number|string|Decimal} uy - Y component of stretch axis direction (should be unit vector)
 * @param {number|string|Decimal} k - Stretch factor along the axis (1 = no change, >1 = stretch, <1 = compress)
 * @returns {Matrix} 3x3 stretch matrix along the specified axis
 *
 * @example
 * // Stretch along 45° diagonal (axis at π/4)
 * const angle = Math.PI / 4;
 * const ux = Math.cos(angle);  // ≈ 0.707
 * const uy = Math.sin(angle);  // ≈ 0.707
 * const S = stretchAlongAxis(ux, uy, 2);
 * // Doubles distances along the diagonal, perpendicular direction unchanged
 *
 * @example
 * // Horizontal stretch (equivalent to scale(2, 1))
 * const S = stretchAlongAxis(1, 0, 2);
 * const [x, y] = applyTransform(S, 10, 5);
 * // Result: x = 20, y = 5
 *
 * @example
 * // Compress along vertical axis by 50%
 * const S = stretchAlongAxis(0, 1, 0.5);
 * const [x, y] = applyTransform(S, 10, 20);
 * // Result: x = 10, y = 10 (Y compressed to half)
 */
export function stretchAlongAxis(ux, uy, k) {
  const uxD = D(ux),
    uyD = D(uy),
    kD = D(k);
  const one = new Decimal(1);
  const factor = kD.minus(one);
  const m00 = one.plus(factor.mul(uxD.mul(uxD)));
  const m01 = factor.mul(uxD.mul(uyD));
  const m10 = factor.mul(uyD.mul(uxD));
  const m11 = one.plus(factor.mul(uyD.mul(uyD)));
  return Matrix.from([
    [m00, m01, new Decimal(0)],
    [m10, m11, new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Apply a 2D transform matrix to a point.
 *
 * Transforms a 2D point (x, y) using a 3x3 transformation matrix by converting the point
 * to homogeneous coordinates [x, y, 1], multiplying by the matrix, and converting back
 * to Cartesian coordinates via perspective division.
 *
 * Mathematical process:
 * ```
 * 1. Convert to homogeneous: P = [x, y, 1]^T
 * 2. Apply transform:        P' = M × P = [x', y', w']^T
 * 3. Perspective division:   (x'/w', y'/w')
 * ```
 *
 * For affine transformations (bottom row is [0, 0, 1]), w' is always 1, so the
 * division has no effect. However, it's performed for generality to support
 * projective transformations.
 *
 * The transformation is:
 * ```
 * [x']   [m00  m01  m02]   [x]   [m00⋅x + m01⋅y + m02]
 * [y'] = [m10  m11  m12] × [y] = [m10⋅x + m11⋅y + m12]
 * [w']   [m20  m21  m22]   [1]   [m20⋅x + m21⋅y + m22]
 *
 * Result: (x'/w', y'/w')
 * ```
 *
 * @param {Matrix} M - 3x3 transformation matrix to apply
 * @param {number|string|Decimal} x - X coordinate of input point
 * @param {number|string|Decimal} y - Y coordinate of input point
 * @returns {Decimal[]} Transformed point as [x', y'] array of Decimal values
 *
 * @example
 * // Apply a translation
 * const T = translation(5, 10);
 * const [x, y] = applyTransform(T, 3, 4);
 * // Result: x = 8, y = 14
 *
 * @example
 * // Apply a rotation by 90°
 * const R = rotate(Math.PI / 2);
 * const [x, y] = applyTransform(R, 1, 0);
 * // Result: x ≈ 0, y ≈ 1
 *
 * @example
 * // Apply composed transformation: scale 2×, then rotate 45°, then translate
 * const composed = translation(10, 20).mul(rotate(Math.PI / 4)).mul(scale(2));
 * const [x, y] = applyTransform(composed, 1, 0);
 * // First scales to (2, 0), then rotates to (√2, √2), then translates
 *
 * @example
 * // Transform multiple points with same matrix
 * const T = rotate(Math.PI / 6);
 * const points = [[0, 1], [1, 0], [1, 1]];
 * const transformed = points.map(([x, y]) => applyTransform(T, x, y));
 * // Efficiently reuses the same transformation matrix
 */
export function applyTransform(M, x, y) {
  const P = Matrix.from([[D(x)], [D(y)], [new Decimal(1)]]);
  const R = M.mul(P);
  const rx = R.data[0][0],
    ry = R.data[1][0],
    rw = R.data[2][0];
  // Perspective division (for affine transforms, rw is always 1)
  return [rx.div(rw), ry.div(rw)];
}

/**
 * Create a reflection matrix across the X axis.
 *
 * Reflects points across the X axis by negating the Y coordinate. This creates
 * a mirror image where the X axis acts as the mirror line. Points above the X
 * axis move below it, and vice versa.
 *
 * Matrix form:
 * ```
 * [1   0   0]
 * [0  -1   0]
 * [0   0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = x
 * y' = -y
 * ```
 *
 * This is equivalent to scale(1, -1) and is a special case of reflection.
 * The transformation is its own inverse: reflecting twice returns to original.
 *
 * @returns {Matrix} 3x3 reflection matrix that flips Y coordinates
 *
 * @example
 * // Reflect a point across the X axis
 * const R = reflectX();
 * const [x, y] = applyTransform(R, 5, 10);
 * // Result: x = 5, y = -10
 *
 * @example
 * // Double reflection returns to original
 * const R = reflectX();
 * const composed = R.mul(R);
 * // composed is the identity matrix (no change)
 *
 * @example
 * // Flip a shape vertically in screen coordinates
 * const R = reflectX();
 * // In screen coords (Y down), this flips the shape upside down
 */
export function reflectX() {
  return Matrix.from([
    [new Decimal(1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a reflection matrix across the Y axis.
 *
 * Reflects points across the Y axis by negating the X coordinate. This creates
 * a mirror image where the Y axis acts as the mirror line. Points to the right
 * of the Y axis move to the left, and vice versa.
 *
 * Matrix form:
 * ```
 * [-1  0   0]
 * [0   1   0]
 * [0   0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = -x
 * y' = y
 * ```
 *
 * This is equivalent to scale(-1, 1) and is a special case of reflection.
 * The transformation is its own inverse: reflecting twice returns to original.
 *
 * @returns {Matrix} 3x3 reflection matrix that flips X coordinates
 *
 * @example
 * // Reflect a point across the Y axis
 * const R = reflectY();
 * const [x, y] = applyTransform(R, 5, 10);
 * // Result: x = -5, y = 10
 *
 * @example
 * // Create a mirror image of a shape
 * const R = reflectY();
 * // Points on the right side move to the left, creating horizontal flip
 *
 * @example
 * // Double reflection returns to original
 * const R = reflectY();
 * const composed = R.mul(R);
 * // composed is the identity matrix (no change)
 */
export function reflectY() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}

/**
 * Create a reflection matrix across the origin (point reflection).
 *
 * Reflects points through the origin by negating both coordinates. This is also
 * known as a point reflection or 180° rotation. Each point (x, y) maps to (-x, -y),
 * which is the point diametrically opposite through the origin.
 *
 * Matrix form:
 * ```
 * [-1  0   0]
 * [0  -1   0]
 * [0   0   1]
 * ```
 *
 * Effect on point (x, y):
 * ```
 * x' = -x
 * y' = -y
 * ```
 *
 * This transformation is equivalent to:
 * - Rotation by π radians (180°): rotate(Math.PI)
 * - Scale by -1 in both directions: scale(-1, -1)
 * - Composition of reflectX() and reflectY()
 *
 * The transformation is its own inverse: reflecting twice returns to original.
 * This is also a central inversion or half-turn rotation.
 *
 * @returns {Matrix} 3x3 reflection matrix that flips both X and Y coordinates
 *
 * @example
 * // Reflect a point through the origin
 * const R = reflectOrigin();
 * const [x, y] = applyTransform(R, 3, 4);
 * // Result: x = -3, y = -4
 *
 * @example
 * // Equivalent to 180° rotation
 * const R1 = reflectOrigin();
 * const R2 = rotate(Math.PI);
 * // R1 and R2 produce the same transformation
 *
 * @example
 * // Double reflection returns to original
 * const R = reflectOrigin();
 * const composed = R.mul(R);
 * // composed is the identity matrix (no change)
 *
 * @example
 * // Equivalent to composing X and Y reflections
 * const R1 = reflectOrigin();
 * const R2 = reflectX().mul(reflectY());
 * // R1 and R2 produce the same transformation
 */
export function reflectOrigin() {
  return Matrix.from([
    [new Decimal(-1), new Decimal(0), new Decimal(0)],
    [new Decimal(0), new Decimal(-1), new Decimal(0)],
    [new Decimal(0), new Decimal(0), new Decimal(1)],
  ]);
}
