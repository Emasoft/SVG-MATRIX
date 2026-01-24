/**
 * @emasoft/svg-matrix - Arbitrary-precision matrix, vector and affine transformation library.
 *
 * A comprehensive toolkit for high-precision geometry and vector manipulation,
 * SVG path conversion, and 2D/3D affine transformations using Decimal.js.
 *
 * @module @emasoft/svg-matrix
 * @version 1.3.4
 * @license MIT
 *
 * @example
 * // ES Module import - Core functionality
 * import { Decimal, Matrix, Vector, Transforms2D, GeometryToPath } from '@emasoft/svg-matrix';
 *
 * // SVG2 Polyfills - Detect and inject polyfills for mesh gradients and hatches
 * import { detectSVG2Features, injectPolyfills } from '@emasoft/svg-matrix';
 *
 * // Inkscape Support - Extract layers and preserve Inkscape metadata
 * import { findLayers, extractLayer, extractAllLayers } from '@emasoft/svg-matrix';
 *
 * // Precision is already set to 80 by default (max is 1e9)
 * // You can increase it further if needed:
 * // Decimal.set({ precision: 200 });
 *
 * // Create and compose 2D transforms
 * const M = Transforms2D.translation(2, 3)
 *   .mul(Transforms2D.rotate(Math.PI / 4))
 *   .mul(Transforms2D.scale(1.5));
 *
 * // Apply to a point
 * const [x, y] = Transforms2D.applyTransform(M, 1, 0);
 *
 * // Convert SVG shapes to paths with arbitrary precision
 * const path = GeometryToPath.circleToPathData(100, 100, 50, 15);
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import { Vector } from "./vector.js";
import * as Transforms2D from "./transforms2d.js";
import * as Transforms3D from "./transforms3d.js";
import * as GeometryToPath from "./geometry-to-path.js";
import * as PolygonClip from "./polygon-clip.js";
import * as SVGFlatten from "./svg-flatten.js";
import * as BrowserVerify from "./browser-verify.js";
import * as ClipPathResolver from "./clip-path-resolver.js";
import * as MaskResolver from "./mask-resolver.js";
import * as PatternResolver from "./pattern-resolver.js";
import * as UseSymbolResolver from "./use-symbol-resolver.js";
import * as MarkerResolver from "./marker-resolver.js";
import * as MeshGradient from "./mesh-gradient.js";
import * as SVGParser from "./svg-parser.js";
import * as FlattenPipeline from "./flatten-pipeline.js";
import * as Verification from "./verification.js";
import * as InkscapeSupport from "./inkscape-support.js";
import {
  INKSCAPE_NS,
  SODIPODI_NS,
  INKSCAPE_PREFIXES,
  isInkscapeLayer,
  getLayerLabel,
  findLayers,
  getNamedViewSettings,
  findGuides,
  getArcParameters,
  getNodeTypes,
  getExportSettings,
  isTiledClone,
  getTiledCloneSource,
  hasInkscapeNamespaces,
  ensureInkscapeNamespaces,
  findReferencedIds,
  buildDefsMapFromDefs,
  resolveDefsDependencies,
  cloneElement,
  extractLayer,
  extractAllLayers,
  analyzeLayerDependencies,
} from "./inkscape-support.js";

import * as SVG2Polyfills from "./svg2-polyfills.js";
import {
  setPolyfillMinification,
  SVG2_FEATURES,
  detectSVG2Features,
  needsPolyfills,
  generatePolyfillScript,
  injectPolyfills,
  removePolyfills,
} from "./svg2-polyfills.js";

import {
  Logger,
  LogLevel,
  setLogLevel,
  getLogLevel,
  enableFileLogging,
  disableFileLogging,
} from "./logger.js";

// SVGO-inspired precision modules
import * as PathSimplification from "./path-simplification.js";
import * as TransformDecomposition from "./transform-decomposition.js";
import * as GJKCollision from "./gjk-collision.js";
import * as PathOptimization from "./path-optimization.js";
import * as TransformOptimization from "./transform-optimization.js";
import * as OffCanvasDetection from "./off-canvas-detection.js";
import * as CSSSpecificity from "./css-specificity.js";

// Animation-aware reference tracking (FIXES SVGO's animation destruction bug)
import * as AnimationReferences from "./animation-references.js";

// SVG Toolbox - SVGO-equivalent functions with simple API
import * as SVGToolbox from "./svg-toolbox.js";

// Bezier Curve Analysis - svgpathtools-equivalent with 80-digit arbitrary precision
// These modules provide superior precision compared to Python's float64 svgpathtools
import * as BezierAnalysis from "./bezier-analysis.js";
import * as ArcLength from "./arc-length.js";
import * as PathAnalysis from "./path-analysis.js";
import * as BezierIntersections from "./bezier-intersections.js";

// SVG Boolean Operations - fill-rule and stroke-aware geometric operations
import * as SVGBooleanOps from "./svg-boolean-ops.js";

// SVG Rendering Context - tracks ALL SVG properties affecting rendered geometry
import * as SVGRenderingContext from "./svg-rendering-context.js";

// Set high-precision default (80 significant digits) on module load
// This is the same precision used internally by all svg-matrix modules
// Users can increase further with setPrecision() or Decimal.set() - max is 1e9
Decimal.set({ precision: 80 });

/**
 * Library version
 * @constant {string}
 */
export const VERSION = "1.3.4";

/**
 * Default precision for path output (decimal places)
 * @constant {number}
 */
export const DEFAULT_PRECISION = 6;

// ============================================================================
// CORE: Arbitrary-Precision Primitives
// ============================================================================

export { Decimal, Matrix, Vector };

// ============================================================================
// TRANSFORMS: 2D and 3D Affine Transformations
// ============================================================================

export { Transforms2D, Transforms3D };

// ============================================================================
// GEOMETRY: Shape Conversion and Path Manipulation
// ============================================================================

export { GeometryToPath, PolygonClip };

// ============================================================================
// SVG: Document Processing and Element Resolution
// ============================================================================

export { SVGFlatten, BrowserVerify };
export { ClipPathResolver, MaskResolver, PatternResolver };
export { UseSymbolResolver, MarkerResolver };
export { MeshGradient };
export { SVGParser, FlattenPipeline, Verification };
export { InkscapeSupport, SVG2Polyfills };

// ============================================================================
// SVGO-INSPIRED PRECISION MODULES
// ============================================================================

export { PathSimplification, TransformDecomposition, GJKCollision };
export { PathOptimization, TransformOptimization };
export { OffCanvasDetection, CSSSpecificity };

// Animation-aware reference tracking (FIXES SVGO's animation destruction)
export { AnimationReferences };

// ============================================================================
// SVG TOOLBOX: SVGO-Equivalent Functions with Simple API
// ============================================================================

export { SVGToolbox };

// ============================================================================
// BEZIER CURVE ANALYSIS: svgpathtools-equivalent with 80-digit precision
// Superior to Python's float64 svgpathtools - exact mathematical verification
// ============================================================================

export { BezierAnalysis, ArcLength, PathAnalysis, BezierIntersections };

// ============================================================================
// SVG BOOLEAN OPERATIONS: Fill-rule and stroke-aware geometric operations
// ============================================================================

export { SVGBooleanOps };

// ============================================================================
// SVG RENDERING CONTEXT: Tracks ALL SVG properties affecting geometry
// Critical for off-canvas detection, collision, merging, simplification
// ============================================================================

export { SVGRenderingContext };

// Re-export all svg-toolbox functions for direct access
// Note: DEFAULT_PRECISION is NOT re-exported from svg-toolbox to avoid conflict
// with the module-level DEFAULT_PRECISION constant defined above
export {
  // Constants
  MAX_PRECISION,
  PRECISION_LEVELS,
  // Utility functions
  formatPrecision,
  escapeXml,
  createOperation,
  // Input/Output types
  InputType,
  OutputFormat,
  detectInputType,
  loadInput,
  generateOutput,
  // Cleanup functions
  cleanupIds,
  cleanupNumericValues,
  cleanupListOfValues,
  cleanupAttributes,
  cleanupEnableBackground,
  removeUnknownsAndDefaults,
  removeNonInheritableGroupAttrs,
  removeUselessDefs,
  removeHiddenElements,
  removeEmptyText,
  removeEmptyContainers,
  // Removal functions
  removeDoctype,
  removeXMLProcInst,
  removeComments,
  removeMetadata,
  removeTitle,
  removeDesc,
  removeEditorsNSData,
  removeEmptyAttrs,
  removeViewBox,
  removeXMLNS,
  removeRasterImages,
  removeScriptElement,
  // Conversion functions
  convertShapesToPath,
  convertPathData,
  convertTransform,
  convertColors,
  convertStyleToAttrs,
  convertEllipseToCircle,
  collapseGroups,
  mergePaths,
  moveGroupAttrsToElems,
  moveElemsAttrsToGroup,
  // Optimization functions
  minifyStyles,
  inlineStyles,
  sortAttrs,
  sortDefsChildren,
  reusePaths,
  removeOffCanvasPath,
  removeStyleElement,
  removeXlink,
  // Adding/Modification functions
  addAttributesToSVGElement,
  addClassesToSVGElement,
  prefixIds,
  removeDimensions,
  removeAttributesBySelector,
  removeAttrs,
  removeElementsByAttr,
  // Presets
  presetDefault,
  presetNone,
  applyPreset,
  optimize,
  createConfig,
  // Bonus functions (SVGO doesn't have these)
  flattenClipPaths,
  flattenMasks,
  flattenGradients,
  flattenPatterns,
  flattenFilters,
  flattenUseElements,
  imageToPath,
  detectCollisions,
  measureDistance,
  validateXML,
  validateSVG,
  validateSVGAsync,
  fixInvalidSVG,
  ValidationSeverity,
  flattenAll,
  simplifyPath,
  optimizeAnimationTiming,
  optimizePaths,
  simplifyPaths,
  decomposeTransform,
  embedExternalDependencies,
  exportEmbeddedResources,
  // Compatibility analysis functions
  analyzeCompatibility,
  analyzeCompatibilityMatrix,
  generateFullCompatibilityMatrix,
  printHierarchicalMatrix,
  generateCompatibilityMatrixSVG,
  generateFlexibleSVGTable,
  generateCompatibilityMatrixFlexible,
} from "./svg-toolbox.js";

// Re-export all svg2-polyfills functions for direct access
export {
  setPolyfillMinification,
  SVG2_FEATURES,
  detectSVG2Features,
  needsPolyfills,
  generatePolyfillScript,
  injectPolyfills,
  removePolyfills,
} from "./svg2-polyfills.js";

// Re-export all inkscape-support functions for direct access
export {
  INKSCAPE_NS,
  SODIPODI_NS,
  INKSCAPE_PREFIXES,
  isInkscapeLayer,
  getLayerLabel,
  findLayers,
  getNamedViewSettings,
  findGuides,
  getArcParameters,
  getNodeTypes,
  getExportSettings,
  isTiledClone,
  getTiledCloneSource,
  hasInkscapeNamespaces,
  ensureInkscapeNamespaces,
  findReferencedIds,
  buildDefsMapFromDefs,
  resolveDefsDependencies,
  cloneElement,
  extractLayer,
  extractAllLayers,
  analyzeLayerDependencies,
} from "./inkscape-support.js";

// ============================================================================
// LOGGING: Configurable logging control
// ============================================================================

export {
  Logger,
  LogLevel,
  setLogLevel,
  getLogLevel,
  enableFileLogging,
  disableFileLogging,
};

// ============================================================================
// CONVENIENCE FUNCTIONS: Quick access to common operations
// ============================================================================

/**
 * Create a 2D translation matrix.
 * Convenience wrapper for Transforms2D.translation().
 * @param {number|string|Decimal} tx - X translation
 * @param {number|string|Decimal} ty - Y translation
 * @returns {Matrix} 3x3 translation matrix
 * @throws {TypeError} If tx or ty is null or undefined
 */
export function translate2D(tx, ty) {
  if (tx == null) {
    throw new TypeError("translate2D: tx cannot be null or undefined");
  }
  if (ty == null) {
    throw new TypeError("translate2D: ty cannot be null or undefined");
  }
  return Transforms2D.translation(tx, ty);
}

/**
 * Create a 2D rotation matrix.
 * Convenience wrapper for Transforms2D.rotate().
 * @param {number|string|Decimal} angle - Rotation angle in radians
 * @returns {Matrix} 3x3 rotation matrix
 * @throws {TypeError} If angle is null or undefined
 */
export function rotate2D(angle) {
  if (angle == null) {
    throw new TypeError("rotate2D: angle cannot be null or undefined");
  }
  return Transforms2D.rotate(angle);
}

/**
 * Create a 2D scale matrix.
 * Convenience wrapper for Transforms2D.scale().
 * @param {number|string|Decimal} sx - X scale factor
 * @param {number|string|Decimal} [sy=sx] - Y scale factor (defaults to sx for uniform scaling)
 * @returns {Matrix} 3x3 scale matrix
 * @throws {TypeError} If sx is null or undefined
 */
export function scale2D(sx, sy = null) {
  if (sx == null) {
    throw new TypeError("scale2D: sx cannot be null or undefined");
  }
  return Transforms2D.scale(sx, sy);
}

/**
 * Apply a 2D transformation matrix to a point.
 * Convenience wrapper for Transforms2D.applyTransform().
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {[Decimal, Decimal]} Transformed [x, y] coordinates
 * @throws {TypeError} If matrix, x, or y is null or undefined
 */
export function transform2D(matrix, x, y) {
  if (matrix == null) {
    throw new TypeError("transform2D: matrix cannot be null or undefined");
  }
  if (x == null) {
    throw new TypeError("transform2D: x cannot be null or undefined");
  }
  if (y == null) {
    throw new TypeError("transform2D: y cannot be null or undefined");
  }
  return Transforms2D.applyTransform(matrix, x, y);
}

/**
 * Create a 3D translation matrix.
 * Convenience wrapper for Transforms3D.translation().
 * @param {number|string|Decimal} tx - X translation
 * @param {number|string|Decimal} ty - Y translation
 * @param {number|string|Decimal} tz - Z translation
 * @returns {Matrix} 4x4 translation matrix
 * @throws {TypeError} If tx, ty, or tz is null or undefined
 */
export function translate3D(tx, ty, tz) {
  if (tx == null) {
    throw new TypeError("translate3D: tx cannot be null or undefined");
  }
  if (ty == null) {
    throw new TypeError("translate3D: ty cannot be null or undefined");
  }
  if (tz == null) {
    throw new TypeError("translate3D: tz cannot be null or undefined");
  }
  return Transforms3D.translation(tx, ty, tz);
}

/**
 * Create a 3D scale matrix.
 * Convenience wrapper for Transforms3D.scale().
 * @param {number|string|Decimal} sx - X scale factor
 * @param {number|string|Decimal} [sy=sx] - Y scale factor
 * @param {number|string|Decimal} [sz=sx] - Z scale factor
 * @returns {Matrix} 4x4 scale matrix
 * @throws {TypeError} If sx is null or undefined
 */
export function scale3D(sx, sy = null, sz = null) {
  if (sx == null) {
    throw new TypeError("scale3D: sx cannot be null or undefined");
  }
  return Transforms3D.scale(sx, sy, sz);
}

/**
 * Apply a 3D transformation matrix to a point.
 * Convenience wrapper for Transforms3D.applyTransform().
 * @param {Matrix} matrix - 4x4 transformation matrix
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @param {number|string|Decimal} z - Z coordinate
 * @returns {[Decimal, Decimal, Decimal]} Transformed [x, y, z] coordinates
 * @throws {TypeError} If matrix, x, y, or z is null or undefined
 */
export function transform3D(matrix, x, y, z) {
  if (matrix == null) {
    throw new TypeError("transform3D: matrix cannot be null or undefined");
  }
  if (x == null) {
    throw new TypeError("transform3D: x cannot be null or undefined");
  }
  if (y == null) {
    throw new TypeError("transform3D: y cannot be null or undefined");
  }
  if (z == null) {
    throw new TypeError("transform3D: z cannot be null or undefined");
  }
  return Transforms3D.applyTransform(matrix, x, y, z);
}

/**
 * Convert a circle to SVG path data with arbitrary precision.
 * Uses the exact kappa constant: 4 * (sqrt(2) - 1) / 3.
 * @param {number|string|Decimal} cx - Center X coordinate
 * @param {number|string|Decimal} cy - Center Y coordinate
 * @param {number|string|Decimal} r - Radius
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string
 * @throws {TypeError} If cx, cy, or r is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function circleToPath(cx, cy, r, precision = DEFAULT_PRECISION) {
  if (cx == null) {
    throw new TypeError("circleToPath: cx cannot be null or undefined");
  }
  if (cy == null) {
    throw new TypeError("circleToPath: cy cannot be null or undefined");
  }
  if (r == null) {
    throw new TypeError("circleToPath: r cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `circleToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `circleToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.circleToPathData(cx, cy, r, precision);
}

/**
 * Convert an ellipse to SVG path data with arbitrary precision.
 * @param {number|string|Decimal} cx - Center X coordinate
 * @param {number|string|Decimal} cy - Center Y coordinate
 * @param {number|string|Decimal} rx - X-axis radius
 * @param {number|string|Decimal} ry - Y-axis radius
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string
 * @throws {TypeError} If cx, cy, rx, or ry is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function ellipseToPath(cx, cy, rx, ry, precision = DEFAULT_PRECISION) {
  if (cx == null) {
    throw new TypeError("ellipseToPath: cx cannot be null or undefined");
  }
  if (cy == null) {
    throw new TypeError("ellipseToPath: cy cannot be null or undefined");
  }
  if (rx == null) {
    throw new TypeError("ellipseToPath: rx cannot be null or undefined");
  }
  if (ry == null) {
    throw new TypeError("ellipseToPath: ry cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `ellipseToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `ellipseToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.ellipseToPathData(cx, cy, rx, ry, precision);
}

/**
 * Convert a rectangle to SVG path data with arbitrary precision.
 * @param {number|string|Decimal} x - Top-left X coordinate
 * @param {number|string|Decimal} y - Top-left Y coordinate
 * @param {number|string|Decimal} width - Rectangle width
 * @param {number|string|Decimal} height - Rectangle height
 * @param {number|string|Decimal} [rx=0] - Corner X radius
 * @param {number|string|Decimal} [ry=rx] - Corner Y radius
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string
 * @throws {TypeError} If x, y, width, or height is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function rectToPath(
  x,
  y,
  width,
  height,
  rx = 0,
  ry = null,
  precision = DEFAULT_PRECISION,
) {
  if (x == null) {
    throw new TypeError("rectToPath: x cannot be null or undefined");
  }
  if (y == null) {
    throw new TypeError("rectToPath: y cannot be null or undefined");
  }
  if (width == null) {
    throw new TypeError("rectToPath: width cannot be null or undefined");
  }
  if (height == null) {
    throw new TypeError("rectToPath: height cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `rectToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `rectToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.rectToPathData(
    x,
    y,
    width,
    height,
    rx,
    ry,
    false,
    precision,
  );
}

/**
 * Convert a line to SVG path data with arbitrary precision.
 * @param {number|string|Decimal} x1 - Start X coordinate
 * @param {number|string|Decimal} y1 - Start Y coordinate
 * @param {number|string|Decimal} x2 - End X coordinate
 * @param {number|string|Decimal} y2 - End Y coordinate
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string
 * @throws {TypeError} If x1, y1, x2, or y2 is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function lineToPath(x1, y1, x2, y2, precision = DEFAULT_PRECISION) {
  if (x1 == null) {
    throw new TypeError("lineToPath: x1 cannot be null or undefined");
  }
  if (y1 == null) {
    throw new TypeError("lineToPath: y1 cannot be null or undefined");
  }
  if (x2 == null) {
    throw new TypeError("lineToPath: x2 cannot be null or undefined");
  }
  if (y2 == null) {
    throw new TypeError("lineToPath: y2 cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `lineToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `lineToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.lineToPathData(x1, y1, x2, y2, precision);
}

/**
 * Convert a polygon to SVG path data with arbitrary precision.
 * @param {string|Array<[number, number]>} points - SVG points attribute or array of [x, y] pairs
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string (closed)
 * @throws {TypeError} If points is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function polygonToPath(points, precision = DEFAULT_PRECISION) {
  if (points == null) {
    throw new TypeError("polygonToPath: points cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `polygonToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `polygonToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.polygonToPathData(points, precision);
}

/**
 * Convert a polyline to SVG path data with arbitrary precision.
 * @param {string|Array<[number, number]>} points - SVG points attribute or array of [x, y] pairs
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string (open)
 * @throws {TypeError} If points is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function polylineToPath(points, precision = DEFAULT_PRECISION) {
  if (points == null) {
    throw new TypeError("polylineToPath: points cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `polylineToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `polylineToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.polylineToPathData(points, precision);
}

/**
 * Get the exact kappa constant for Bezier circle approximation.
 * kappa = 4 * (sqrt(2) - 1) / 3 ≈ 0.5522847498307936
 * @returns {Decimal} The kappa constant with full precision
 */
export function getKappa() {
  return GeometryToPath.getKappa();
}

/**
 * Parse SVG path data into an array of commands with Decimal arguments.
 * @param {string} pathData - SVG path data string
 * @returns {Array<{command: string, args: Decimal[]}>} Parsed commands
 * @throws {TypeError} If pathData is null or undefined
 */
export function parsePath(pathData) {
  if (pathData == null) {
    throw new TypeError("parsePath: pathData cannot be null or undefined");
  }
  return GeometryToPath.parsePathData(pathData);
}

/**
 * Convert path commands array back to SVG path data string.
 * @param {Array<{command: string, args: Decimal[]}>} commands - Path commands
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} SVG path data string
 * @throws {TypeError} If commands is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function pathToString(commands, precision = DEFAULT_PRECISION) {
  if (commands == null) {
    throw new TypeError("pathToString: commands cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `pathToString: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `pathToString: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.pathArrayToString(commands, precision);
}

/**
 * Convert relative path commands to absolute.
 * @param {string} pathData - SVG path data (may contain relative commands)
 * @returns {string} SVG path data with only absolute commands
 * @throws {TypeError} If pathData is null or undefined
 */
export function pathToAbsolute(pathData) {
  if (pathData == null) {
    throw new TypeError("pathToAbsolute: pathData cannot be null or undefined");
  }
  return GeometryToPath.pathToAbsolute(pathData);
}

/**
 * Convert all path commands to cubic Bezier curves.
 * Lines become degenerate cubics, quadratics are elevated to cubics.
 * @param {string} pathData - SVG path data
 * @returns {string} SVG path data with only M, C, and Z commands
 * @throws {TypeError} If pathData is null or undefined
 */
export function pathToCubics(pathData) {
  if (pathData == null) {
    throw new TypeError("pathToCubics: pathData cannot be null or undefined");
  }
  return GeometryToPath.pathToCubics(pathData);
}

/**
 * Transform path data by applying an affine matrix.
 * @param {string} pathData - SVG path data
 * @param {Matrix} matrix - 3x3 transformation matrix
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string} Transformed SVG path data
 * @throws {TypeError} If pathData or matrix is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function transformPath(pathData, matrix, precision = DEFAULT_PRECISION) {
  if (pathData == null) {
    throw new TypeError("transformPath: pathData cannot be null or undefined");
  }
  if (matrix == null) {
    throw new TypeError("transformPath: matrix cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `transformPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `transformPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.transformPathData(pathData, matrix, precision);
}

/**
 * Convert any SVG geometry element to path data.
 * Supports: circle, ellipse, rect, line, polyline, polygon.
 * @param {Object|Element} element - SVG element or object with tagName and attributes
 * @param {number} [precision=6] - Number of decimal places in output
 * @returns {string|null} SVG path data string, or null if element type not supported
 * @throws {TypeError} If element is null/undefined, or precision is not a number
 * @throws {RangeError} If precision is negative
 */
export function elementToPath(element, precision = DEFAULT_PRECISION) {
  if (element == null) {
    throw new TypeError("elementToPath: element cannot be null or undefined");
  }
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `elementToPath: precision must be a finite number, got ${typeof precision}`,
    );
  }
  if (precision < 0) {
    throw new RangeError(
      `elementToPath: precision must be non-negative, got ${precision}`,
    );
  }
  return GeometryToPath.convertElementToPath(element, precision);
}

/**
 * Create an identity matrix of the given size.
 * @param {number} n - Matrix dimension (creates n x n identity matrix)
 * @returns {Matrix} Identity matrix
 * @throws {TypeError} If n is not a number
 * @throws {RangeError} If n is not a positive integer
 */
export function identity(n) {
  // Validate n is a number
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new TypeError(`identity: n must be a finite number, got ${typeof n}`);
  }
  // Validate n is a positive integer
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`identity: n must be a positive integer, got ${n}`);
  }
  return Matrix.identity(n);
}

/**
 * Create a zero matrix of the given size.
 * @param {number} rows - Number of rows
 * @param {number} cols - Number of columns
 * @returns {Matrix} Zero matrix
 * @throws {TypeError} If rows or cols is not a number
 * @throws {RangeError} If rows or cols is not a positive integer
 */
export function zeros(rows, cols) {
  // Validate rows is a number
  if (typeof rows !== "number" || !Number.isFinite(rows)) {
    throw new TypeError(
      `zeros: rows must be a finite number, got ${typeof rows}`,
    );
  }
  // Validate cols is a number
  if (typeof cols !== "number" || !Number.isFinite(cols)) {
    throw new TypeError(
      `zeros: cols must be a finite number, got ${typeof cols}`,
    );
  }
  // Validate rows is a positive integer
  if (!Number.isInteger(rows) || rows < 1) {
    throw new RangeError(`zeros: rows must be a positive integer, got ${rows}`);
  }
  // Validate cols is a positive integer
  if (!Number.isInteger(cols) || cols < 1) {
    throw new RangeError(`zeros: cols must be a positive integer, got ${cols}`);
  }
  return Matrix.zeros(rows, cols);
}

/**
 * Create a vector from an array of components.
 * @param {Array<number|string|Decimal>} components - Vector components
 * @returns {Vector} New vector instance
 * @throws {TypeError} If components is null or undefined
 */
export function vec(components) {
  if (components == null) {
    throw new TypeError("vec: components cannot be null or undefined");
  }
  return Vector.from(components);
}

/**
 * Create a matrix from a 2D array.
 * @param {Array<Array<number|string|Decimal>>} data - 2D array of matrix elements
 * @returns {Matrix} New matrix instance
 * @throws {TypeError} If data is null or undefined
 */
export function mat(data) {
  if (data == null) {
    throw new TypeError("mat: data cannot be null or undefined");
  }
  return Matrix.from(data);
}

/**
 * Set the global precision for all Decimal operations.
 * @param {number} precision - Number of significant digits (1 to 1e9)
 * @throws {TypeError} If precision is not a finite number or not an integer
 * @throws {RangeError} If precision is not between 1 and 1e9
 */
export function setPrecision(precision) {
  // Validate precision is a number
  if (typeof precision !== "number" || !Number.isFinite(precision)) {
    throw new TypeError(
      `setPrecision: precision must be a finite number, got ${typeof precision}`,
    );
  }
  // Validate precision is an integer
  if (!Number.isInteger(precision)) {
    throw new TypeError(
      `setPrecision: precision must be an integer, got ${precision}`,
    );
  }
  // Validate precision range (Decimal.js requirement: 1 to 1e9)
  if (precision < 1 || precision > 1e9) {
    throw new RangeError(
      `setPrecision: precision must be between 1 and 1e9, got ${precision}`,
    );
  }
  Decimal.set({ precision });
}

/**
 * Get the current global precision setting.
 * @returns {number} Current precision value
 */
export function getPrecision() {
  return Decimal.precision;
}

// ============================================================================
// DEFAULT EXPORT: Unified namespace for browser/CDN usage
// ============================================================================

/**
 * Default export provides the complete library as a single namespace.
 * Ideal for browser usage via CDN or UMD bundles.
 *
 * @example
 * // Browser usage with CDN
 * <script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.umd.js"></script>
 * <script>
 *   const { Matrix, Vector, Transforms2D, circleToPath } = SVGMatrix;
 *   const path = SVGMatrix.circleToPath(100, 100, 50, 10);
 * </script>
 */
export default {
  // Version
  VERSION,
  DEFAULT_PRECISION,

  // Core primitives
  Decimal,
  Matrix,
  Vector,

  // Transform modules
  Transforms2D,
  Transforms3D,

  // Geometry modules
  GeometryToPath,
  PolygonClip,

  // SVG processing modules
  SVGFlatten,
  BrowserVerify,
  ClipPathResolver,
  MaskResolver,
  PatternResolver,
  UseSymbolResolver,
  MarkerResolver,
  MeshGradient,
  SVGParser,
  FlattenPipeline,
  Verification,
  InkscapeSupport,
  SVG2Polyfills,

  // SVG2 Polyfills - individual exports
  setPolyfillMinification,
  SVG2_FEATURES,
  detectSVG2Features,
  needsPolyfills,
  generatePolyfillScript,
  injectPolyfills,
  removePolyfills,

  // Inkscape Support - individual exports
  INKSCAPE_NS,
  SODIPODI_NS,
  INKSCAPE_PREFIXES,
  isInkscapeLayer,
  getLayerLabel,
  findLayers,
  getNamedViewSettings,
  findGuides,
  getArcParameters,
  getNodeTypes,
  getExportSettings,
  isTiledClone,
  getTiledCloneSource,
  hasInkscapeNamespaces,
  ensureInkscapeNamespaces,
  findReferencedIds,
  buildDefsMapFromDefs,
  resolveDefsDependencies,
  cloneElement,
  extractLayer,
  extractAllLayers,
  analyzeLayerDependencies,

  // Logging
  Logger,
  LogLevel,
  setLogLevel,
  getLogLevel,
  enableFileLogging,
  disableFileLogging,

  // SVGO-inspired precision modules
  PathSimplification,
  TransformDecomposition,
  GJKCollision,
  PathOptimization,
  TransformOptimization,
  OffCanvasDetection,
  CSSSpecificity,

  // Animation-aware reference tracking (FIXES SVGO's animation destruction)
  AnimationReferences,

  // SVG Toolbox (SVGO-equivalent functions)
  SVGToolbox,

  // Bezier Curve Analysis (svgpathtools-equivalent with 80-digit precision)
  BezierAnalysis,
  ArcLength,
  PathAnalysis,
  BezierIntersections,

  // SVG Boolean Operations (fill-rule and stroke-aware)
  SVGBooleanOps,

  // SVG Rendering Context (tracks all SVG properties affecting geometry)
  SVGRenderingContext,

  // Convenience functions
  translate2D,
  rotate2D,
  scale2D,
  transform2D,
  translate3D,
  scale3D,
  transform3D,
  circleToPath,
  ellipseToPath,
  rectToPath,
  lineToPath,
  polygonToPath,
  polylineToPath,
  getKappa,
  parsePath,
  pathToString,
  pathToAbsolute,
  pathToCubics,
  transformPath,
  elementToPath,
  identity,
  zeros,
  vec,
  mat,
  setPrecision,
  getPrecision,
};
