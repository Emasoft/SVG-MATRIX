/**
 * SVG-Matrix - High Precision Math Library
 *
 * Universal library for arbitrary-precision matrix, vector, and affine transformations.
 * Works in both Node.js and browser environments.
 *
 * @module svg-matrix-lib
 * @version 1.3.5
 * @license MIT
 *
 * @example Browser usage:
 * <script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.min.js"></script>
 * <script>
 *   // Note: Uses SVGMatrixLib to avoid conflict with native browser SVGMatrix
 *   const { Matrix, Vector, Transforms2D } = SVGMatrixLib;
 *   const M = Transforms2D.translation(10, 20).mul(Transforms2D.rotate(Math.PI / 4));
 * </script>
 *
 * @example ES Module usage:
 * import { Matrix, Vector, Transforms2D, Transforms3D } from '@emasoft/svg-matrix/svg-matrix-lib';
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import { Vector } from "./vector.js";
import * as Transforms2D from "./transforms2d.js";
import * as Transforms3D from "./transforms3d.js";

// Set high precision for all calculations
Decimal.set({ precision: 80 });

/**
 * Library version
 */
export const VERSION = "1.3.5";

// Export core classes
export { Decimal, Matrix, Vector };

// Export transform modules
export { Transforms2D, Transforms3D };

// Convenience functions for common 2D operations
export const translate2D = Transforms2D.translation;
export const rotate2D = Transforms2D.rotate;
export const scale2D = Transforms2D.scale;
export const skew2D = Transforms2D.skew;
export const applyTransform2D = Transforms2D.applyTransform;

// Convenience functions for common 3D operations
export const translate3D = Transforms3D.translation;
export const rotateX = Transforms3D.rotateX;
export const rotateY = Transforms3D.rotateY;
export const rotateZ = Transforms3D.rotateZ;
export const scale3D = Transforms3D.scale;
export const applyTransform3D = Transforms3D.applyTransform;

/**
 * Default export for browser global (window.SVGMatrixLib)
 * Note: Named SVGMatrixLib to avoid conflict with native browser SVGMatrix
 */
const SVGMatrix = {
  VERSION,
  Decimal,
  Matrix,
  Vector,
  Transforms2D,
  Transforms3D,
  // Convenience functions
  translate2D,
  rotate2D,
  scale2D,
  skew2D,
  applyTransform2D,
  translate3D,
  rotateX,
  rotateY,
  rotateZ,
  scale3D,
  applyTransform3D,
};

export default SVGMatrix;

// Browser global assignment
// Note: Using SVGMatrixLib to avoid conflict with native browser SVGMatrix (DOMMatrix alias)
if (typeof window !== "undefined") {
  window.SVGMatrixLib = SVGMatrix;
}
