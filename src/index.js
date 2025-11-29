/**
 * @emasoft/svg-matrix - Arbitrary-precision matrix, vector and affine transformation library.
 *
 * This library provides Decimal-backed Matrix and Vector classes along with
 * 2D (3x3) and 3D (4x4) transform helpers for geometry operations requiring high precision.
 *
 * @module @emasoft/svg-matrix
 *
 * @example
 * import { Decimal, Matrix, Vector, Transforms2D, Transforms3D, GeometryToPath, BrowserVerify } from '@emasoft/svg-matrix';
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
 *
 * // Convert SVG geometry to path with high precision
 * const circlePath = GeometryToPath.circleToPathData(100, 100, 50, 15);
 * console.log('Circle path:', circlePath);
 *
 * // Verify against browser's native implementation
 * const result = await BrowserVerify.verifyViewBox(200, 100, '0 0 100 50');
 * console.log('Matches browser:', result.matches);
 */

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import { Vector } from './vector.js';
import * as Transforms2D from './transforms2d.js';
import * as Transforms3D from './transforms3d.js';
import * as SVGFlatten from './svg-flatten.js';
import * as BrowserVerify from './browser-verify.js';
import * as PolygonClip from './polygon-clip.js';
import * as ClipPathResolver from './clip-path-resolver.js';
import * as MeshGradient from './mesh-gradient.js';
import * as TextToPath from './text-to-path.js';
import * as MaskResolver from './mask-resolver.js';
import * as PatternResolver from './pattern-resolver.js';
import * as UseSymbolResolver from './use-symbol-resolver.js';
import * as MarkerResolver from './marker-resolver.js';
import * as GeometryToPath from './geometry-to-path.js';

export { Decimal, Matrix, Vector, Transforms2D, Transforms3D, SVGFlatten, BrowserVerify, PolygonClip, ClipPathResolver, MeshGradient, TextToPath, MaskResolver, PatternResolver, UseSymbolResolver, MarkerResolver, GeometryToPath };
