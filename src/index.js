/**
 * @emasoft/svg-matrix - Arbitrary-precision matrix, vector and affine transformation library.
 *
 * This library provides Decimal-backed Matrix and Vector classes along with
 * 2D (3x3) and 3D (4x4) transform helpers for geometry operations requiring high precision.
 *
 * @module @emasoft/svg-matrix
 *
 * @example
 * import { Decimal, Matrix, Vector, Transforms2D, Transforms3D } from '@emasoft/svg-matrix';
 *
 * // Set precision for all operations
 * Decimal.set({ precision: 80 });
 *
 * // Create and compose 2D transforms
 * const M = Transforms2D.translation(2, 3)
 *   .mul(Transforms2D.rotate(Math.PI / 4))
 *   .mul(Transforms2D.scale(1.5));
 *
 * // Apply to a point
 * const [x, y] = Transforms2D.applyTransform(M, 1, 0);
 * console.log('Transformed:', x.toString(), y.toString());
 */

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import { Vector } from './vector.js';
import * as Transforms2D from './transforms2d.js';
import * as Transforms3D from './transforms3d.js';

export { Decimal, Matrix, Vector, Transforms2D, Transforms3D };
