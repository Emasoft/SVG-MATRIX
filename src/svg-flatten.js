/**
 * SVG Transform Flattening Utility
 *
 * Parses SVG transform attributes, builds CTM (Current Transform Matrix) for each element,
 * and can flatten all transforms by applying them directly to coordinates.
 *
 * @module svg-flatten
 */

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import * as Transforms2D from './transforms2d.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// ============================================================================
// viewBox and preserveAspectRatio Parsing
// ============================================================================

/**
 * Parse an SVG viewBox attribute.
 *
 * @param {string} viewBoxStr - viewBox attribute value "minX minY width height"
 * @returns {{minX: Decimal, minY: Decimal, width: Decimal, height: Decimal}|null}
 */
export function parseViewBox(viewBoxStr) {
  if (!viewBoxStr || viewBoxStr.trim() === '') {
    return null;
  }

  const parts = viewBoxStr.trim().split(/[\s,]+/).map(s => new Decimal(s));
  if (parts.length !== 4) {
    console.warn(`Invalid viewBox: ${viewBoxStr}`);
    return null;
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3]
  };
}

/**
 * Parse an SVG preserveAspectRatio attribute.
 * Format: "[defer] <align> [<meetOrSlice>]"
 *
 * @param {string} parStr - preserveAspectRatio attribute value
 * @returns {{defer: boolean, align: string, meetOrSlice: string}}
 */
export function parsePreserveAspectRatio(parStr) {
  const result = {
    defer: false,
    align: 'xMidYMid',  // default
    meetOrSlice: 'meet' // default
  };

  if (!parStr || parStr.trim() === '') {
    return result;
  }

  const parts = parStr.trim().split(/\s+/);
  let idx = 0;

  // Check for 'defer' (only applies to <image>)
  if (parts[idx] === 'defer') {
    result.defer = true;
    idx++;
  }

  // Alignment value
  if (parts[idx]) {
    result.align = parts[idx];
    idx++;
  }

  // meetOrSlice
  if (parts[idx]) {
    result.meetOrSlice = parts[idx].toLowerCase();
  }

  return result;
}

/**
 * Compute the transformation matrix from viewBox coordinates to viewport.
 * Implements the SVG 2 algorithm for viewBox + preserveAspectRatio.
 *
 * @param {Object} viewBox - Parsed viewBox {minX, minY, width, height}
 * @param {number|Decimal} viewportWidth - Viewport width in pixels
 * @param {number|Decimal} viewportHeight - Viewport height in pixels
 * @param {Object} par - Parsed preserveAspectRatio {align, meetOrSlice}
 * @returns {Matrix} 3x3 transformation matrix
 */
export function computeViewBoxTransform(viewBox, viewportWidth, viewportHeight, par = null) {
  const D = x => new Decimal(x);

  if (!viewBox) {
    return Matrix.identity(3);
  }

  const vbX = viewBox.minX;
  const vbY = viewBox.minY;
  const vbW = viewBox.width;
  const vbH = viewBox.height;
  const vpW = D(viewportWidth);
  const vpH = D(viewportHeight);

  // Default preserveAspectRatio
  if (!par) {
    par = { align: 'xMidYMid', meetOrSlice: 'meet' };
  }

  // Handle 'none' - stretch to fill
  if (par.align === 'none') {
    const scaleX = vpW.div(vbW);
    const scaleY = vpH.div(vbH);
    // translate(-minX, -minY) then scale
    const translateM = Transforms2D.translation(vbX.neg(), vbY.neg());
    const scaleM = Transforms2D.scale(scaleX, scaleY);
    return scaleM.mul(translateM);
  }

  // Compute uniform scale factor
  let scaleX = vpW.div(vbW);
  let scaleY = vpH.div(vbH);
  let scale;

  if (par.meetOrSlice === 'slice') {
    // Use larger scale (content may overflow)
    scale = Decimal.max(scaleX, scaleY);
  } else {
    // 'meet' - use smaller scale (content fits entirely)
    scale = Decimal.min(scaleX, scaleY);
  }

  // Compute translation for alignment
  const scaledW = vbW.mul(scale);
  const scaledH = vbH.mul(scale);

  let translateX = D(0);
  let translateY = D(0);

  // Parse alignment string (e.g., 'xMidYMid', 'xMinYMax')
  const align = par.align;

  // X alignment
  if (align.includes('xMid')) {
    translateX = vpW.minus(scaledW).div(2);
  } else if (align.includes('xMax')) {
    translateX = vpW.minus(scaledW);
  }
  // xMin is default (translateX = 0)

  // Y alignment
  if (align.includes('YMid')) {
    translateY = vpH.minus(scaledH).div(2);
  } else if (align.includes('YMax')) {
    translateY = vpH.minus(scaledH);
  }
  // YMin is default (translateY = 0)

  // Build the transform: translate(translateX, translateY) scale(scale) translate(-minX, -minY)
  // Applied right-to-left: first translate by -minX,-minY, then scale, then translate for alignment
  const translateMinM = Transforms2D.translation(vbX.neg(), vbY.neg());
  const scaleM = Transforms2D.scale(scale, scale);
  const translateAlignM = Transforms2D.translation(translateX, translateY);

  return translateAlignM.mul(scaleM).mul(translateMinM);
}

/**
 * Represents an SVG viewport with its coordinate system parameters.
 * Used for building the full CTM through nested viewports.
 */
export class SVGViewport {
  /**
   * @param {number|Decimal} width - Viewport width
   * @param {number|Decimal} height - Viewport height
   * @param {string|null} viewBox - viewBox attribute value
   * @param {string|null} preserveAspectRatio - preserveAspectRatio attribute value
   * @param {string|null} transform - transform attribute value
   */
  constructor(width, height, viewBox = null, preserveAspectRatio = null, transform = null) {
    this.width = new Decimal(width);
    this.height = new Decimal(height);
    this.viewBox = viewBox ? parseViewBox(viewBox) : null;
    this.preserveAspectRatio = parsePreserveAspectRatio(preserveAspectRatio);
    this.transform = transform;
  }

  /**
   * Compute the transformation matrix for this viewport.
   * @returns {Matrix} 3x3 transformation matrix
   */
  getTransformMatrix() {
    let result = Matrix.identity(3);

    // Apply viewBox transform first (if present)
    if (this.viewBox) {
      const vbTransform = computeViewBoxTransform(
        this.viewBox,
        this.width,
        this.height,
        this.preserveAspectRatio
      );
      result = result.mul(vbTransform);
    }

    // Then apply the transform attribute (if present)
    if (this.transform) {
      const transformMatrix = parseTransformAttribute(this.transform);
      result = result.mul(transformMatrix);
    }

    return result;
  }
}

/**
 * Build the complete CTM including viewports, viewBox transforms, and element transforms.
 *
 * @param {Array} hierarchy - Array of objects describing the hierarchy from root to element.
 *   Each object can be:
 *   - {type: 'svg', width, height, viewBox?, preserveAspectRatio?, transform?}
 *   - {type: 'g', transform?}
 *   - {type: 'element', transform?}
 *   Or simply a transform string for backwards compatibility
 * @returns {Matrix} Combined CTM as 3x3 matrix
 */
export function buildFullCTM(hierarchy) {
  let ctm = Matrix.identity(3);

  for (const item of hierarchy) {
    if (typeof item === 'string') {
      // Backwards compatibility: treat string as transform attribute
      if (item) {
        const matrix = parseTransformAttribute(item);
        ctm = ctm.mul(matrix);
      }
    } else if (item.type === 'svg') {
      // SVG viewport with potential viewBox
      const viewport = new SVGViewport(
        item.width,
        item.height,
        item.viewBox || null,
        item.preserveAspectRatio || null,
        item.transform || null
      );
      ctm = ctm.mul(viewport.getTransformMatrix());
    } else if (item.type === 'g' || item.type === 'element') {
      // Group or element with optional transform
      if (item.transform) {
        const matrix = parseTransformAttribute(item.transform);
        ctm = ctm.mul(matrix);
      }
    }
  }

  return ctm;
}

// ============================================================================
// Unit and Percentage Resolution
// ============================================================================

/**
 * Resolve a length value that may include units or percentages.
 *
 * @param {string|number} value - Length value (e.g., "50%", "10px", "5em", 100)
 * @param {Decimal} referenceSize - Reference size for percentage resolution
 * @param {number} [dpi=96] - DPI for absolute unit conversion
 * @returns {Decimal} Resolved length in user units (px)
 */
export function resolveLength(value, referenceSize, dpi = 96) {
  const D = x => new Decimal(x);

  if (typeof value === 'number') {
    return D(value);
  }

  const str = String(value).trim();

  // Percentage
  if (str.endsWith('%')) {
    const pct = D(str.slice(0, -1));
    return pct.div(100).mul(referenceSize);
  }

  // Extract numeric value and unit
  const match = str.match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)(.*)?$/i);
  if (!match) {
    return D(0);
  }

  const num = D(match[1]);
  const unit = (match[2] || '').toLowerCase().trim();

  // Convert to user units (px)
  switch (unit) {
    case '':
    case 'px':
      return num;
    case 'em':
      return num.mul(16); // Assume 16px font-size
    case 'rem':
      return num.mul(16);
    case 'pt':
      return num.mul(dpi).div(72);
    case 'pc':
      return num.mul(dpi).div(6);
    case 'in':
      return num.mul(dpi);
    case 'cm':
      return num.mul(dpi).div(2.54);
    case 'mm':
      return num.mul(dpi).div(25.4);
    default:
      return num; // Unknown unit, treat as px
  }
}

/**
 * Resolve percentage values for x/width (relative to viewport width)
 * and y/height (relative to viewport height).
 *
 * @param {string|number} xOrWidth - X coordinate or width value
 * @param {string|number} yOrHeight - Y coordinate or height value
 * @param {Decimal} viewportWidth - Viewport width for reference
 * @param {Decimal} viewportHeight - Viewport height for reference
 * @returns {{x: Decimal, y: Decimal}} Resolved coordinates
 */
export function resolvePercentages(xOrWidth, yOrHeight, viewportWidth, viewportHeight) {
  return {
    x: resolveLength(xOrWidth, viewportWidth),
    y: resolveLength(yOrHeight, viewportHeight)
  };
}

/**
 * Compute the normalized diagonal for resolving percentages that
 * aren't clearly x or y oriented (per SVG spec).
 * Formula: sqrt(width^2 + height^2) / sqrt(2)
 *
 * @param {Decimal} width - Viewport width
 * @param {Decimal} height - Viewport height
 * @returns {Decimal} Normalized diagonal
 */
export function normalizedDiagonal(width, height) {
  const w = new Decimal(width);
  const h = new Decimal(height);
  const sqrt2 = Decimal.sqrt(2);
  return Decimal.sqrt(w.mul(w).plus(h.mul(h))).div(sqrt2);
}

// ============================================================================
// Object Bounding Box Transform
// ============================================================================

/**
 * Create a transformation matrix for objectBoundingBox coordinates.
 * Maps (0,0) to (bboxX, bboxY) and (1,1) to (bboxX+bboxW, bboxY+bboxH).
 *
 * @param {number|Decimal} bboxX - Bounding box X
 * @param {number|Decimal} bboxY - Bounding box Y
 * @param {number|Decimal} bboxWidth - Bounding box width
 * @param {number|Decimal} bboxHeight - Bounding box height
 * @returns {Matrix} 3x3 transformation matrix
 */
export function objectBoundingBoxTransform(bboxX, bboxY, bboxWidth, bboxHeight) {
  const D = x => new Decimal(x);
  // Transform: scale(bboxWidth, bboxHeight) then translate(bboxX, bboxY)
  const scaleM = Transforms2D.scale(bboxWidth, bboxHeight);
  const translateM = Transforms2D.translation(bboxX, bboxY);
  return translateM.mul(scaleM);
}

// ============================================================================
// Transform Parsing (existing code)
// ============================================================================

/**
 * Parse a single SVG transform function and return a 3x3 matrix.
 * Supports: translate, scale, rotate, skewX, skewY, matrix
 *
 * @param {string} func - Transform function name
 * @param {number[]} args - Numeric arguments
 * @returns {Matrix} 3x3 transformation matrix
 */
export function parseTransformFunction(func, args) {
  const D = x => new Decimal(x);

  switch (func.toLowerCase()) {
    case 'translate': {
      const tx = args[0] || 0;
      const ty = args[1] || 0;
      return Transforms2D.translation(tx, ty);
    }

    case 'scale': {
      const sx = args[0] || 1;
      const sy = args[1] !== undefined ? args[1] : sx;
      return Transforms2D.scale(sx, sy);
    }

    case 'rotate': {
      // SVG rotate is in degrees, can have optional cx, cy
      const angleDeg = args[0] || 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);

      if (args.length >= 3) {
        // rotate(angle, cx, cy) - rotation around point
        const cx = args[1];
        const cy = args[2];
        return Transforms2D.rotateAroundPoint(angleRad, cx, cy);
      }
      return Transforms2D.rotate(angleRad);
    }

    case 'skewx': {
      const angleDeg = args[0] || 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);
      const tanVal = Decimal.tan(angleRad);
      return Transforms2D.skew(tanVal, 0);
    }

    case 'skewy': {
      const angleDeg = args[0] || 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);
      const tanVal = Decimal.tan(angleRad);
      return Transforms2D.skew(0, tanVal);
    }

    case 'matrix': {
      // matrix(a, b, c, d, e, f) -> | a c e |
      //                             | b d f |
      //                             | 0 0 1 |
      const [a, b, c, d, e, f] = args.map(x => D(x || 0));
      return Matrix.from([
        [a, c, e],
        [b, d, f],
        [D(0), D(0), D(1)]
      ]);
    }

    default:
      console.warn(`Unknown transform function: ${func}`);
      return Matrix.identity(3);
  }
}

/**
 * Parse an SVG transform attribute string into a combined matrix.
 * Handles multiple transforms: "translate(10,20) rotate(45) scale(2)"
 *
 * @param {string} transformStr - SVG transform attribute value
 * @returns {Matrix} Combined 3x3 transformation matrix
 */
export function parseTransformAttribute(transformStr) {
  if (!transformStr || transformStr.trim() === '') {
    return Matrix.identity(3);
  }

  // Regex to match transform functions: name(args)
  const transformRegex = /(\w+)\s*\(([^)]*)\)/g;
  let match;
  let result = Matrix.identity(3);

  while ((match = transformRegex.exec(transformStr)) !== null) {
    const func = match[1];
    const argsStr = match[2];

    // Parse arguments (comma or space separated)
    const args = argsStr
      .split(/[\s,]+/)
      .filter(s => s.length > 0)
      .map(s => parseFloat(s));

    const matrix = parseTransformFunction(func, args);
    // Transforms are applied left-to-right in SVG, so we multiply in order
    result = result.mul(matrix);
  }

  return result;
}

/**
 * Build the CTM (Current Transform Matrix) for an element by walking up its ancestry.
 *
 * @param {Object[]} transformStack - Array of transform strings from root to element
 * @returns {Matrix} Combined CTM as 3x3 matrix
 */
export function buildCTM(transformStack) {
  let ctm = Matrix.identity(3);

  for (const transformStr of transformStack) {
    if (transformStr) {
      const matrix = parseTransformAttribute(transformStr);
      ctm = ctm.mul(matrix);
    }
  }

  return ctm;
}

/**
 * Apply a CTM to a 2D point.
 *
 * @param {Matrix} ctm - 3x3 transformation matrix
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {{x: Decimal, y: Decimal}} Transformed coordinates
 */
export function applyToPoint(ctm, x, y) {
  const [tx, ty] = Transforms2D.applyTransform(ctm, x, y);
  return { x: tx, y: ty };
}

/**
 * Convert a CTM back to SVG matrix() notation.
 *
 * @param {Matrix} ctm - 3x3 transformation matrix
 * @param {number} [precision=6] - Decimal places for output
 * @returns {string} SVG matrix transform string
 */
export function toSVGMatrix(ctm, precision = 6) {
  const a = ctm.data[0][0].toFixed(precision);
  const b = ctm.data[1][0].toFixed(precision);
  const c = ctm.data[0][1].toFixed(precision);
  const d = ctm.data[1][1].toFixed(precision);
  const e = ctm.data[0][2].toFixed(precision);
  const f = ctm.data[1][2].toFixed(precision);

  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

/**
 * Check if a matrix is effectively the identity matrix.
 *
 * @param {Matrix} m - 3x3 matrix to check
 * @param {string} [tolerance='1e-10'] - Tolerance for comparison
 * @returns {boolean} True if matrix is identity within tolerance
 */
export function isIdentity(m, tolerance = '1e-10') {
  const identity = Matrix.identity(3);
  return m.equals(identity, tolerance);
}

/**
 * Transform path data coordinates using a CTM.
 * Handles M, L, C, Q, S, T, A, Z commands (absolute only for now).
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Matrix} ctm - 3x3 transformation matrix
 * @returns {string} Transformed path data
 */
export function transformPathData(pathData, ctm) {
  // Simple regex-based path parser for common commands
  const result = [];
  const commandRegex = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;
  let match;

  while ((match = commandRegex.exec(pathData)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const args = argsStr
      .split(/[\s,]+/)
      .filter(s => s.length > 0)
      .map(s => parseFloat(s));

    const cmdUpper = cmd.toUpperCase();

    switch (cmdUpper) {
      case 'M':
      case 'L':
      case 'T': {
        // Pairs of coordinates
        const transformed = [];
        for (let i = 0; i < args.length; i += 2) {
          const { x, y } = applyToPoint(ctm, args[i], args[i + 1]);
          transformed.push(x.toFixed(6), y.toFixed(6));
        }
        result.push(cmd + ' ' + transformed.join(' '));
        break;
      }

      case 'H': {
        // Horizontal line - becomes L after transform
        const { x, y } = applyToPoint(ctm, args[0], 0);
        result.push('L ' + x.toFixed(6) + ' ' + y.toFixed(6));
        break;
      }

      case 'V': {
        // Vertical line - becomes L after transform
        const { x, y } = applyToPoint(ctm, 0, args[0]);
        result.push('L ' + x.toFixed(6) + ' ' + y.toFixed(6));
        break;
      }

      case 'C': {
        // Cubic bezier: 3 pairs of coordinates
        const transformed = [];
        for (let i = 0; i < args.length; i += 2) {
          const { x, y } = applyToPoint(ctm, args[i], args[i + 1]);
          transformed.push(x.toFixed(6), y.toFixed(6));
        }
        result.push('C ' + transformed.join(' '));
        break;
      }

      case 'S': {
        // Smooth cubic: 2 pairs of coordinates
        const transformed = [];
        for (let i = 0; i < args.length; i += 2) {
          const { x, y } = applyToPoint(ctm, args[i], args[i + 1]);
          transformed.push(x.toFixed(6), y.toFixed(6));
        }
        result.push('S ' + transformed.join(' '));
        break;
      }

      case 'Q': {
        // Quadratic bezier: 2 pairs of coordinates
        const transformed = [];
        for (let i = 0; i < args.length; i += 2) {
          const { x, y } = applyToPoint(ctm, args[i], args[i + 1]);
          transformed.push(x.toFixed(6), y.toFixed(6));
        }
        result.push('Q ' + transformed.join(' '));
        break;
      }

      case 'A': {
        // Arc: rx ry x-axis-rotation large-arc-flag sweep-flag x y
        // Transform end point, scale radii (approximate for non-uniform scale)
        const transformed = [];
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          const rotation = args[i + 2];
          const largeArc = args[i + 3];
          const sweep = args[i + 4];
          const x = args[i + 5];
          const y = args[i + 6];

          const { x: tx, y: ty } = applyToPoint(ctm, x, y);

          // Scale radii approximately (doesn't handle rotation correctly for skew)
          const scaleX = ctm.data[0][0].abs().plus(ctm.data[0][1].abs()).div(2);
          const scaleY = ctm.data[1][0].abs().plus(ctm.data[1][1].abs()).div(2);

          transformed.push(
            (rx * scaleX.toNumber()).toFixed(6),
            (ry * scaleY.toNumber()).toFixed(6),
            rotation,
            largeArc,
            sweep,
            tx.toFixed(6),
            ty.toFixed(6)
          );
        }
        result.push('A ' + transformed.join(' '));
        break;
      }

      case 'Z': {
        result.push('Z');
        break;
      }

      default:
        // Keep unknown commands as-is
        result.push(cmd + ' ' + argsStr);
    }
  }

  return result.join(' ');
}

/**
 * Information about precision comparison between float and Decimal.
 */
export const PRECISION_INFO = {
  floatError: 0.0143,  // Typical error: 10 -> 9.9857
  decimalPrecision: 80,
  typicalRoundTripError: '2e-79',
  improvementFactor: '1.43e+77'
};

export default {
  // viewBox and preserveAspectRatio
  parseViewBox,
  parsePreserveAspectRatio,
  computeViewBoxTransform,
  SVGViewport,
  buildFullCTM,
  // Unit resolution
  resolveLength,
  resolvePercentages,
  normalizedDiagonal,
  // Object bounding box
  objectBoundingBoxTransform,
  // Transform parsing
  parseTransformFunction,
  parseTransformAttribute,
  buildCTM,
  applyToPoint,
  toSVGMatrix,
  isIdentity,
  transformPathData,
  PRECISION_INFO
};
