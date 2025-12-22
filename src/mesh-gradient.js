/**
 * Mesh Gradient Module - SVG 2.0 meshGradient support with Decimal.js precision
 *
 * Implements parsing, evaluation, and rasterization of Coons patch mesh gradients.
 * Supports both bilinear and bicubic (Coons) interpolation types.
 *
 * @module mesh-gradient
 */

import Decimal from "decimal.js";
import { Matrix as _Matrix } from "./matrix.js";
import * as _Transforms2D from "./transforms2d.js";
import * as PolygonClip from "./polygon-clip.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// Default samples per patch edge for rasterization
const DEFAULT_PATCH_SAMPLES = 16;

// Subdivision threshold for adaptive rendering
const SUBDIVISION_THRESHOLD = 2;

/**
 * Create a point with Decimal coordinates.
 *
 * Points are the fundamental building blocks for Coons patches and Bezier curves,
 * using arbitrary-precision Decimal values for accurate geometric calculations.
 *
 * @param {number|string|Decimal} x - The x-coordinate (converted to Decimal)
 * @param {number|string|Decimal} y - The y-coordinate (converted to Decimal)
 * @returns {{x: Decimal, y: Decimal}} Point object with Decimal coordinates
 *
 * @example
 * // Create a point at (10.5, 20.75)
 * const p = point(10.5, 20.75);
 * console.log(p.x.toString()); // "10.5"
 *
 * @example
 * // Using high-precision strings
 * const p = point("3.14159265358979323846", "2.71828182845904523536");
 */
export function point(x, y) {
  if (x === null || x === undefined)
    throw new Error("point: x parameter is required");
  if (y === null || y === undefined)
    throw new Error("point: y parameter is required");
  const dx = D(x);
  const dy = D(y);
  if (!dx.isFinite()) throw new Error(`point: x must be finite, got ${x}`);
  if (!dy.isFinite()) throw new Error(`point: y must be finite, got ${y}`);
  return { x: dx, y: dy };
}

/**
 * Create an RGBA color object with values in the range 0-255.
 *
 * All components are rounded to integers. This represents colors in sRGB color space,
 * which is the standard for SVG and web graphics.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @param {number} [a=255] - Alpha component (0-255, default is fully opaque)
 * @returns {{r: number, g: number, b: number, a: number}} Color object with integer RGBA values
 *
 * @example
 * // Create opaque red
 * const red = color(255, 0, 0);
 *
 * @example
 * // Create semi-transparent blue
 * const blue = color(0, 0, 255, 128);
 */
export function color(r, g, b, a = 255) {
  if (r === null || r === undefined)
    throw new Error("color: r parameter is required");
  if (g === null || g === undefined)
    throw new Error("color: g parameter is required");
  if (b === null || b === undefined)
    throw new Error("color: b parameter is required");
  if (!Number.isFinite(r)) throw new Error(`color: r must be finite, got ${r}`);
  if (!Number.isFinite(g)) throw new Error(`color: g must be finite, got ${g}`);
  if (!Number.isFinite(b)) throw new Error(`color: b must be finite, got ${b}`);
  if (!Number.isFinite(a)) throw new Error(`color: a must be finite, got ${a}`);

  const rVal = Math.round(r);
  const gVal = Math.round(g);
  const bVal = Math.round(b);
  const aVal = Math.round(a);

  if (rVal < 0 || rVal > 255)
    throw new Error(`color: r must be 0-255, got ${rVal}`);
  if (gVal < 0 || gVal > 255)
    throw new Error(`color: g must be 0-255, got ${gVal}`);
  if (bVal < 0 || bVal > 255)
    throw new Error(`color: b must be 0-255, got ${bVal}`);
  if (aVal < 0 || aVal > 255)
    throw new Error(`color: a must be 0-255, got ${aVal}`);

  return { r: rVal, g: gVal, b: bVal, a: aVal };
}

/**
 * Parse a CSS color string into an RGBA color object.
 *
 * Supports multiple CSS color formats:
 * - rgb(r, g, b) and rgba(r, g, b, a)
 * - Hex colors: #RGB, #RRGGBB, #RRGGBBAA
 * - Named colors: black, white, red, green, blue, yellow, cyan, magenta, transparent
 *
 * The opacity parameter multiplies the alpha channel, useful for applying
 * SVG stop-opacity attributes.
 *
 * @param {string} colorStr - CSS color string (rgb(), rgba(), hex, or named color)
 * @param {number} [opacity=1] - Optional opacity multiplier (0-1)
 * @returns {{r: number, g: number, b: number, a: number}} RGBA color with values 0-255
 *
 * @example
 * // Parse hex color
 * const c1 = parseColor("#ff0000");
 * // {r: 255, g: 0, b: 0, a: 255}
 *
 * @example
 * // Parse rgba with opacity modifier
 * const c2 = parseColor("rgba(128, 128, 128, 0.5)", 0.8);
 * // Alpha = 0.5 * 0.8 * 255 = 102
 *
 * @example
 * // Parse named color
 * const c3 = parseColor("cyan");
 * // {r: 0, g: 255, b: 255, a: 255}
 */
export function parseColor(colorStr, opacity = 1) {
  if (!colorStr || typeof colorStr !== "string") return color(0, 0, 0, 255);
  if (!Number.isFinite(opacity))
    throw new Error(`parseColor: opacity must be finite, got ${opacity}`);
  if (opacity < 0 || opacity > 1)
    throw new Error(`parseColor: opacity must be 0-1, got ${opacity}`);

  // Handle rgb() and rgba()
  const rgbMatch = colorStr.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return color(0, 0, 0, 255 * opacity);
    }
    const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
    if (!Number.isFinite(a)) return color(r, g, b, 255 * opacity);
    return color(r, g, b, Math.min(255, a * 255 * opacity));
  }

  // Handle hex colors
  const hexMatch = colorStr.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return color(
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        255 * opacity,
      );
    } else if (hex.length === 6) {
      return color(
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255 * opacity,
      );
    } else if (hex.length === 8) {
      return color(
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16) * opacity,
      );
    }
  }

  // Named colors (subset for common ones)
  const namedColors = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    transparent: [0, 0, 0, 0],
  };
  const named = namedColors[colorStr.toLowerCase()];
  if (named) {
    return color(named[0], named[1], named[2], (named[3] ?? 255) * opacity);
  }

  return color(0, 0, 0, 255 * opacity);
}

/**
 * Linearly interpolate between two colors.
 *
 * Performs component-wise linear interpolation in sRGB color space:
 * result = c1 * (1 - t) + c2 * t
 *
 * For physically accurate color interpolation, colors should ideally be
 * converted to linear RGB space first, but this implementation uses
 * sRGB directly for simplicity and compatibility with SVG standards.
 *
 * @param {{r: number, g: number, b: number, a: number}} c1 - First color (at t=0)
 * @param {{r: number, g: number, b: number, a: number}} c2 - Second color (at t=1)
 * @param {number|Decimal} t - Interpolation factor (0 = c1, 1 = c2)
 * @returns {{r: number, g: number, b: number, a: number}} Interpolated color
 *
 * @example
 * // Interpolate from red to blue
 * const red = color(255, 0, 0);
 * const blue = color(0, 0, 255);
 * const purple = lerpColor(red, blue, 0.5);
 * // {r: 128, g: 0, b: 128, a: 255}
 *
 * @example
 * // Fade from opaque to transparent
 * const opaque = color(100, 150, 200, 255);
 * const trans = color(100, 150, 200, 0);
 * const semi = lerpColor(opaque, trans, 0.75);
 * // {r: 100, g: 150, b: 200, a: 64}
 */
export function lerpColor(c1, c2, t) {
  if (!c1 || !c2) throw new Error("lerpColor: c1 and c2 are required");
  if (!("r" in c1 && "g" in c1 && "b" in c1 && "a" in c1))
    throw new Error("lerpColor: c1 must have r, g, b, a properties");
  if (!("r" in c2 && "g" in c2 && "b" in c2 && "a" in c2))
    throw new Error("lerpColor: c2 must have r, g, b, a properties");
  if (t === null || t === undefined)
    throw new Error("lerpColor: t parameter is required");

  const tNum = Number(t);
  if (!Number.isFinite(tNum))
    throw new Error(`lerpColor: t must be finite, got ${t}`);

  const mt = 1 - tNum;
  return color(
    c1.r * mt + c2.r * tNum,
    c1.g * mt + c2.g * tNum,
    c1.b * mt + c2.b * tNum,
    c1.a * mt + c2.a * tNum,
  );
}

/**
 * Bilinear color interpolation for a quadrilateral.
 *
 * Interpolates color across a quad defined by four corner colors using
 * bilinear interpolation in parameter space (u, v):
 *
 * color(u,v) = (1-u)(1-v)·c00 + u(1-v)·c10 + (1-u)v·c01 + uv·c11
 *
 * This ensures smooth color transitions across the quad, with the color
 * at each corner matching the specified corner color exactly.
 *
 * @param {{r: number, g: number, b: number, a: number}} c00 - Color at corner (u=0, v=0)
 * @param {{r: number, g: number, b: number, a: number}} c10 - Color at corner (u=1, v=0)
 * @param {{r: number, g: number, b: number, a: number}} c01 - Color at corner (u=0, v=1)
 * @param {{r: number, g: number, b: number, a: number}} c11 - Color at corner (u=1, v=1)
 * @param {number|Decimal} u - U parameter (0 to 1)
 * @param {number|Decimal} v - V parameter (0 to 1)
 * @returns {{r: number, g: number, b: number, a: number}} Interpolated color
 *
 * @example
 * // Interpolate in center of quad
 * const red = color(255, 0, 0);
 * const green = color(0, 255, 0);
 * const blue = color(0, 0, 255);
 * const yellow = color(255, 255, 0);
 * const center = bilinearColor(red, green, blue, yellow, 0.5, 0.5);
 * // Average of all four corners
 */
export function bilinearColor(c00, c10, c01, c11, u, v) {
  if (!c00 || !c10 || !c01 || !c11)
    throw new Error("bilinearColor: all corner colors are required");
  if (!("r" in c00 && "g" in c00 && "b" in c00 && "a" in c00))
    throw new Error("bilinearColor: c00 must have r, g, b, a properties");
  if (!("r" in c10 && "g" in c10 && "b" in c10 && "a" in c10))
    throw new Error("bilinearColor: c10 must have r, g, b, a properties");
  if (!("r" in c01 && "g" in c01 && "b" in c01 && "a" in c01))
    throw new Error("bilinearColor: c01 must have r, g, b, a properties");
  if (!("r" in c11 && "g" in c11 && "b" in c11 && "a" in c11))
    throw new Error("bilinearColor: c11 must have r, g, b, a properties");
  if (u === null || u === undefined)
    throw new Error("bilinearColor: u parameter is required");
  if (v === null || v === undefined)
    throw new Error("bilinearColor: v parameter is required");

  const uNum = Number(u);
  const vNum = Number(v);
  if (!Number.isFinite(uNum))
    throw new Error(`bilinearColor: u must be finite, got ${u}`);
  if (!Number.isFinite(vNum))
    throw new Error(`bilinearColor: v must be finite, got ${v}`);

  const mu = 1 - uNum;
  const mv = 1 - vNum;

  return color(
    mu * mv * c00.r +
      uNum * mv * c10.r +
      mu * vNum * c01.r +
      uNum * vNum * c11.r,
    mu * mv * c00.g +
      uNum * mv * c10.g +
      mu * vNum * c01.g +
      uNum * vNum * c11.g,
    mu * mv * c00.b +
      uNum * mv * c10.b +
      mu * vNum * c01.b +
      uNum * vNum * c11.b,
    mu * mv * c00.a +
      uNum * mv * c10.a +
      mu * vNum * c01.a +
      uNum * vNum * c11.a,
  );
}

// ============================================================================
// Bezier Curve Evaluation
// ============================================================================

/**
 * Evaluate a cubic Bezier curve at parameter t using the Bernstein polynomial.
 *
 * The cubic Bezier curve is defined by the parametric equation:
 *
 * B(t) = (1-t)³·p0 + 3(1-t)²t·p1 + 3(1-t)t²·p2 + t³·p3
 *
 * where t ∈ [0,1]. This is the standard cubic Bezier formulation used in
 * SVG path data and meshGradient definitions.
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point (at t=0)
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point (at t=1)
 * @param {Decimal} t - Parameter value (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on the curve at parameter t
 *
 * @example
 * // Evaluate curve at midpoint
 * const p0 = point(0, 0);
 * const p1 = point(50, 100);
 * const p2 = point(150, 100);
 * const p3 = point(200, 0);
 * const mid = evalCubicBezier(p0, p1, p2, p3, D(0.5));
 * // Returns point on smooth S-curve
 *
 * @example
 * // Sample curve at multiple points
 * for (let i = 0; i <= 10; i++) {
 *   const t = D(i).div(10);
 *   const pt = evalCubicBezier(p0, p1, p2, p3, t);
 *   console.log(`t=${i/10}: (${pt.x}, ${pt.y})`);
 * }
 */
export function evalCubicBezier(p0, p1, p2, p3, t) {
  if (!p0 || !p1 || !p2 || !p3)
    throw new Error("evalCubicBezier: all points are required");
  if (!("x" in p0 && "y" in p0))
    throw new Error("evalCubicBezier: p0 must have x, y properties");
  if (!("x" in p1 && "y" in p1))
    throw new Error("evalCubicBezier: p1 must have x, y properties");
  if (!("x" in p2 && "y" in p2))
    throw new Error("evalCubicBezier: p2 must have x, y properties");
  if (!("x" in p3 && "y" in p3))
    throw new Error("evalCubicBezier: p3 must have x, y properties");
  if (t === null || t === undefined)
    throw new Error("evalCubicBezier: t parameter is required");

  const mt = D(1).minus(t);
  const mt2 = mt.mul(mt);
  const mt3 = mt2.mul(mt);
  const t2 = t.mul(t);
  const t3 = t2.mul(t);

  return {
    x: mt3
      .mul(p0.x)
      .plus(D(3).mul(mt2).mul(t).mul(p1.x))
      .plus(D(3).mul(mt).mul(t2).mul(p2.x))
      .plus(t3.mul(p3.x)),
    y: mt3
      .mul(p0.y)
      .plus(D(3).mul(mt2).mul(t).mul(p1.y))
      .plus(D(3).mul(mt).mul(t2).mul(p2.y))
      .plus(t3.mul(p3.y)),
  };
}

/**
 * Split a cubic Bezier curve at t=0.5 using De Casteljau's algorithm.
 *
 * De Casteljau's algorithm recursively subdivides the curve by computing
 * midpoints at each level:
 *
 * Level 0: p0, p1, p2, p3 (original control points)
 * Level 1: q0 = mid(p0,p1), q1 = mid(p1,p2), q2 = mid(p2,p3)
 * Level 2: r0 = mid(q0,q1), r1 = mid(q1,q2)
 * Level 3: s = mid(r0,r1) (point on curve at t=0.5)
 *
 * The two resulting curves share the point s and maintain C² continuity.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} curve - Array of 4 control points [p0, p1, p2, p3]
 * @returns {Array<Array<{x: Decimal, y: Decimal}>>} Two curves: [[q0,q1,q2,q3], [r0,r1,r2,r3]]
 *
 * @example
 * // Split a curve for adaptive subdivision
 * const curve = [
 *   point(0, 0),
 *   point(100, 200),
 *   point(200, 200),
 *   point(300, 0)
 * ];
 * const [left, right] = splitBezier(curve);
 * // left and right are two Bezier curves that together equal the original
 *
 * @example
 * // Recursive subdivision for adaptive sampling
 * function subdivideCurve(curve, maxDepth) {
 *   if (maxDepth === 0) return [curve];
 *   const [left, right] = splitBezier(curve);
 *   return [...subdivideCurve(left, maxDepth-1), ...subdivideCurve(right, maxDepth-1)];
 * }
 */
export function splitBezier(curve) {
  if (!Array.isArray(curve))
    throw new Error("splitBezier: curve must be an array");
  if (curve.length !== 4)
    throw new Error(
      `splitBezier: curve must have exactly 4 points, got ${curve.length}`,
    );

  const [p0, p1, p2, p3] = curve;
  if (!p0 || !p1 || !p2 || !p3)
    throw new Error("splitBezier: all curve points must be defined");
  if (!("x" in p0 && "y" in p0))
    throw new Error("splitBezier: p0 must have x, y properties");
  if (!("x" in p1 && "y" in p1))
    throw new Error("splitBezier: p1 must have x, y properties");
  if (!("x" in p2 && "y" in p2))
    throw new Error("splitBezier: p2 must have x, y properties");
  if (!("x" in p3 && "y" in p3))
    throw new Error("splitBezier: p3 must have x, y properties");

  // De Casteljau subdivision at t=0.5
  const mid = (a, b) => ({
    x: a.x.plus(b.x).div(2),
    y: a.y.plus(b.y).div(2),
  });

  const q0 = p0;
  const q1 = mid(p0, p1);
  const q2 = mid(mid(p0, p1), mid(p1, p2));
  const q3 = mid(mid(mid(p0, p1), mid(p1, p2)), mid(mid(p1, p2), mid(p2, p3)));

  const r0 = q3;
  const r1 = mid(mid(p1, p2), mid(p2, p3));
  const r2 = mid(p2, p3);
  const r3 = p3;

  return [
    [q0, q1, q2, q3],
    [r0, r1, r2, r3],
  ];
}

// ============================================================================
// Coons Patch Evaluation
// ============================================================================

/**
 * A Coons patch representing a bicubic surface defined by four boundary curves.
 *
 * Coons patches are used in SVG 2.0 meshGradient elements to create smooth
 * color gradients across curved surfaces. Each patch is bounded by four
 * cubic Bezier curves and interpolates both geometry and color.
 *
 * The Coons patch formula creates a bicubic surface S(u,v) that interpolates
 * the four boundary curves using bilinearly blended interpolation:
 *
 * S(u,v) = Lc(u,v) + Ld(u,v) - B(u,v)
 *
 * where:
 * - Lc(u,v) = (1-v)·C(u) + v·D(u) (ruled surface in u direction)
 * - Ld(u,v) = (1-u)·A(v) + u·B(v) (ruled surface in v direction)
 * - B(u,v) = bilinear interpolation of corner points
 * - C(u), D(u), A(v), B(v) are the four boundary curves
 *
 * @class
 */
export class CoonsPatch {
  /**
   * Create a Coons patch from four boundary curves and corner colors.
   *
   * The boundary curves must form a closed loop:
   * - top[3] should equal right[0] (top-right corner)
   * - right[3] should equal bottom[3] (bottom-right corner)
   * - bottom[0] should equal left[3] (bottom-left corner)
   * - left[0] should equal top[0] (top-left corner)
   *
   * @param {Array<{x: Decimal, y: Decimal}>} top - Top boundary curve [p0, p1, p2, p3], left to right
   * @param {Array<{x: Decimal, y: Decimal}>} right - Right boundary curve [p0, p1, p2, p3], top to bottom
   * @param {Array<{x: Decimal, y: Decimal}>} bottom - Bottom boundary curve [p0, p1, p2, p3], left to right
   * @param {Array<{x: Decimal, y: Decimal}>} left - Left boundary curve [p0, p1, p2, p3], top to bottom
   * @param {Array<Array<{r: number, g: number, b: number, a: number}>>} colors - 2x2 array of corner colors [[c00, c10], [c01, c11]]
   *
   * @example
   * // Create a simple rectangular patch
   * const patch = new CoonsPatch(
   *   [point(0,0), point(33,0), point(67,0), point(100,0)],  // top
   *   [point(100,0), point(100,33), point(100,67), point(100,100)],  // right
   *   [point(0,100), point(33,100), point(67,100), point(100,100)],  // bottom
   *   [point(0,0), point(0,33), point(0,67), point(0,100)],  // left
   *   [[color(255,0,0), color(0,255,0)],  // top-left red, top-right green
   *    [color(0,0,255), color(255,255,0)]]  // bottom-left blue, bottom-right yellow
   * );
   */
  constructor(top, right, bottom, left, colors) {
    if (!Array.isArray(top) || top.length !== 4)
      throw new Error("CoonsPatch: top must be an array of 4 points");
    if (!Array.isArray(right) || right.length !== 4)
      throw new Error("CoonsPatch: right must be an array of 4 points");
    if (!Array.isArray(bottom) || bottom.length !== 4)
      throw new Error("CoonsPatch: bottom must be an array of 4 points");
    if (!Array.isArray(left) || left.length !== 4)
      throw new Error("CoonsPatch: left must be an array of 4 points");
    if (
      !Array.isArray(colors) ||
      colors.length !== 2 ||
      !Array.isArray(colors[0]) ||
      colors[0].length !== 2 ||
      !Array.isArray(colors[1]) ||
      colors[1].length !== 2
    ) {
      throw new Error("CoonsPatch: colors must be a 2x2 array");
    }

    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.left = left;
    this.colors = colors;
  }

  /**
   * Evaluate the Coons patch at parametric coordinates (u, v).
   *
   * Computes both the geometric position and interpolated color at the
   * given parameter values using the bilinearly blended Coons formula:
   *
   * Position:
   * S(u,v) = Sc(u,v) + Sd(u,v) - B(u,v)
   *
   * where:
   * - Sc(u,v) = (1-v)·top(u) + v·bottom(u) (interpolate between top/bottom edges)
   * - Sd(u,v) = (1-u)·left(v) + u·right(v) (interpolate between left/right edges)
   * - B(u,v) = (1-u)(1-v)·P00 + u(1-v)·P10 + (1-u)v·P01 + uv·P11 (bilinear blend of corners)
   *
   * The Coons formula ensures that S(u,v) exactly matches the boundary
   * curves when u or v equals 0 or 1.
   *
   * Color is computed using bilinear interpolation of the four corner colors.
   *
   * @param {Decimal} u - U parameter (0 = left edge, 1 = right edge)
   * @param {Decimal} v - V parameter (0 = top edge, 1 = bottom edge)
   * @returns {{point: {x: Decimal, y: Decimal}, color: {r: number, g: number, b: number, a: number}}} Evaluated point and color
   *
   * @example
   * // Evaluate at center of patch
   * const result = patch.evaluate(D(0.5), D(0.5));
   * console.log(`Center point: (${result.point.x}, ${result.point.y})`);
   * console.log(`Center color: rgb(${result.color.r}, ${result.color.g}, ${result.color.b})`);
   *
   * @example
   * // Sample a grid of points
   * for (let i = 0; i <= 10; i++) {
   *   for (let j = 0; j <= 10; j++) {
   *     const u = D(i).div(10);
   *     const v = D(j).div(10);
   *     const {point, color} = patch.evaluate(u, v);
   *     // Use point and color for rendering
   *   }
   * }
   */
  evaluate(u, v) {
    if (u === null || u === undefined)
      throw new Error("CoonsPatch.evaluate: u parameter is required");
    if (v === null || v === undefined)
      throw new Error("CoonsPatch.evaluate: v parameter is required");

    // Boundary curves
    const Lc = evalCubicBezier(...this.top, u); // L_c(u,0)
    const Ld = evalCubicBezier(...this.bottom, u); // L_d(u,1)
    const La = evalCubicBezier(...this.left, v); // L_a(0,v)
    const Lb = evalCubicBezier(...this.right, v); // L_b(1,v)

    // Corner points
    const P00 = this.top[0];
    const P10 = this.top[3];
    const P01 = this.bottom[0];
    const P11 = this.bottom[3];

    // Coons patch formula: S(u,v) = Lc(u) + Ld(u) - B(u,v)
    // where B is bilinear interpolation of corners
    const mu = D(1).minus(u);
    const mv = D(1).minus(v);

    // Ruled surface in u direction
    const Sc_x = mv.mul(Lc.x).plus(v.mul(Ld.x));
    const Sc_y = mv.mul(Lc.y).plus(v.mul(Ld.y));

    // Ruled surface in v direction
    const Sd_x = mu.mul(La.x).plus(u.mul(Lb.x));
    const Sd_y = mu.mul(La.y).plus(u.mul(Lb.y));

    // Bilinear interpolation of corners
    const B_x = mu
      .mul(mv)
      .mul(P00.x)
      .plus(u.mul(mv).mul(P10.x))
      .plus(mu.mul(v).mul(P01.x))
      .plus(u.mul(v).mul(P11.x));
    const B_y = mu
      .mul(mv)
      .mul(P00.y)
      .plus(u.mul(mv).mul(P10.y))
      .plus(mu.mul(v).mul(P01.y))
      .plus(u.mul(v).mul(P11.y));

    // Coons formula: Sc + Sd - B
    const pt = {
      x: Sc_x.plus(Sd_x).minus(B_x),
      y: Sc_y.plus(Sd_y).minus(B_y),
    };

    // Color interpolation (bilinear)
    const col = bilinearColor(
      this.colors[0][0],
      this.colors[0][1],
      this.colors[1][0],
      this.colors[1][1],
      u,
      v,
    );

    return { point: pt, color: col };
  }

  /**
   * Subdivide this patch into four sub-patches for adaptive rendering.
   *
   * Splits the patch at u=0.5 and v=0.5, creating four smaller patches that
   * together exactly reproduce the original patch. This is used for adaptive
   * subdivision when rendering curved patches with high accuracy.
   *
   * Each boundary curve is split using De Casteljau's algorithm. The center
   * point and mid-edge points are computed by evaluating the patch at the
   * subdivision parameters. Interior curves connecting these points are
   * approximated as linear (degenerate Bezier curves) for simplicity.
   *
   * The subdivision maintains color continuity by evaluating colors at the
   * subdivision points.
   *
   * @returns {Array<CoonsPatch>} Array of 4 sub-patches: [top-left, top-right, bottom-left, bottom-right]
   *
   * @example
   * // Adaptive subdivision until patches are flat enough
   * function subdividePatch(patch, maxDepth = 5) {
   *   if (patch.isFlat() || maxDepth === 0) {
   *     return [patch];
   *   }
   *   const subPatches = patch.subdivide();
   *   return subPatches.flatMap(sp => subdividePatch(sp, maxDepth - 1));
   * }
   *
   * @example
   * // Subdivide once for finer rendering
   * const patch = new CoonsPatch(top, right, bottom, left, colors);
   * const [tl, tr, bl, br] = patch.subdivide();
   * // Render each sub-patch separately
   */
  subdivide() {
    // Split each boundary curve
    const [topL, topR] = splitBezier(this.top);
    const [rightT, rightB] = splitBezier(this.right);
    const [bottomL, bottomR] = splitBezier(this.bottom);
    const [leftT, leftB] = splitBezier(this.left);

    // Compute center point and mid-edge points
    const center = this.evaluate(D(0.5), D(0.5));
    const midTop = this.evaluate(D(0.5), D(0));
    const midBottom = this.evaluate(D(0.5), D(1));
    const midLeft = this.evaluate(D(0), D(0.5));
    const midRight = this.evaluate(D(1), D(0.5));

    // Interior curves (linear for simplicity - could be improved)
    const midH = [midLeft.point, midLeft.point, center.point, center.point];
    const midH2 = [center.point, center.point, midRight.point, midRight.point];
    const midV = [midTop.point, midTop.point, center.point, center.point];
    const midV2 = [
      center.point,
      center.point,
      midBottom.point,
      midBottom.point,
    ];

    // Colors at subdivided corners
    const c00 = this.colors[0][0];
    const c10 = this.colors[0][1];
    const c01 = this.colors[1][0];
    const c11 = this.colors[1][1];
    const cMid = center.color;
    const cTop = midTop.color;
    const cBottom = midBottom.color;
    const cLeft = midLeft.color;
    const cRight = midRight.color;

    return [
      // Top-left
      new CoonsPatch(topL, midV, midH, leftT, [
        [c00, cTop],
        [cLeft, cMid],
      ]),
      // Top-right
      new CoonsPatch(topR, rightT, midH2, midV, [
        [cTop, c10],
        [cMid, cRight],
      ]),
      // Bottom-left
      new CoonsPatch(midH, midV2, bottomL, leftB, [
        [cLeft, cMid],
        [c01, cBottom],
      ]),
      // Bottom-right
      new CoonsPatch(midH2, rightB, bottomR, midV2, [
        [cMid, cRight],
        [cBottom, c11],
      ]),
    ];
  }

  /**
   * Check if this patch is flat enough for direct rendering without subdivision.
   *
   * A patch is considered flat when all four boundary curves are approximately
   * linear, meaning the control points lie close to the straight line between
   * the curve endpoints.
   *
   * Flatness is tested by computing the perpendicular distance from each
   * control point to the line connecting the curve's start and end points.
   * If these distances are below SUBDIVISION_THRESHOLD (typically 2 pixels),
   * the curve is considered flat.
   *
   * This test is used to determine when adaptive subdivision can stop,
   * allowing flat patches to be rendered directly as simple quads.
   *
   * @returns {boolean} true if all boundary curves are nearly linear
   *
   * @example
   * // Adaptive rendering with flatness test
   * function renderPatch(patch) {
   *   if (patch.isFlat()) {
   *     // Render as simple quad
   *     renderQuad(patch);
   *   } else {
   *     // Subdivide further
   *     patch.subdivide().forEach(renderPatch);
   *   }
   * }
   */
  isFlat() {
    // Check if all boundary curves are nearly linear
    const curveFlat = (curve) => {
      const [p0, p1, p2, p3] = curve;
      // Distance from control points to line p0-p3
      const dx = p3.x.minus(p0.x);
      const dy = p3.y.minus(p0.y);
      const len2 = dx.mul(dx).plus(dy.mul(dy));
      if (len2.lt(1e-10)) return true;

      const dist1 = dx
        .mul(p1.y.minus(p0.y))
        .minus(dy.mul(p1.x.minus(p0.x)))
        .abs();
      const dist2 = dx
        .mul(p2.y.minus(p0.y))
        .minus(dy.mul(p2.x.minus(p0.x)))
        .abs();

      return (
        dist1.div(len2.sqrt()).lt(SUBDIVISION_THRESHOLD) &&
        dist2.div(len2.sqrt()).lt(SUBDIVISION_THRESHOLD)
      );
    };

    return (
      curveFlat(this.top) &&
      curveFlat(this.right) &&
      curveFlat(this.bottom) &&
      curveFlat(this.left)
    );
  }

  /**
   * Get the axis-aligned bounding box of this patch.
   *
   * Computes the bounding box by examining all control points of the four
   * boundary curves. Note that this may be a conservative estimate since
   * the actual curve may not reach the control points. For tighter bounds,
   * the curves' extrema would need to be computed.
   *
   * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} Bounding box with Decimal coordinates
   *
   * @example
   * // Get bounding box for clipping
   * const bbox = patch.getBBox();
   * console.log(`Patch bounds: (${bbox.minX}, ${bbox.minY}) to (${bbox.maxX}, ${bbox.maxY})`);
   *
   * @example
   * // Check if patch intersects viewport
   * const bbox = patch.getBBox();
   * const visible = bbox.maxX >= 0 && bbox.minX <= viewportWidth &&
   *                 bbox.maxY >= 0 && bbox.minY <= viewportHeight;
   */
  getBBox() {
    const allPoints = [
      ...this.top,
      ...this.right,
      ...this.bottom,
      ...this.left,
    ];

    if (allPoints.length === 0)
      throw new Error("CoonsPatch.getBBox: no points in patch");

    let minX = allPoints[0].x,
      maxX = allPoints[0].x;
    let minY = allPoints[0].y,
      maxY = allPoints[0].y;

    for (const p of allPoints) {
      if (!p || !("x" in p) || !("y" in p))
        throw new Error("CoonsPatch.getBBox: invalid point in patch");
      if (p.x.lt(minX)) minX = p.x;
      if (p.x.gt(maxX)) maxX = p.x;
      if (p.y.lt(minY)) minY = p.y;
      if (p.y.gt(maxY)) maxY = p.y;
    }

    return { minX, minY, maxX, maxY };
  }
}

// ============================================================================
// Mesh Gradient Parsing
// ============================================================================

/**
 * Parse a mesh gradient definition into an array of Coons patches.
 *
 * Converts an SVG 2.0 meshGradient structure (with meshrows, meshpatches, and stops)
 * into a computational representation using CoonsPatch objects. Each meshpatch in
 * the SVG becomes one CoonsPatch with four boundary curves and corner colors.
 *
 * The SVG meshGradient structure:
 * ```xml
 * <meshgradient x="0" y="0" type="bilinear">
 *   <meshrow>
 *     <meshpatch>
 *       <stop path="c 100,0 100,0 100,0" stop-color="red"/>
 *       <stop path="c 0,100 0,100 0,100" stop-color="green"/>
 *       <stop path="c -100,0 -100,0 -100,0" stop-color="blue"/>
 *       <stop path="c 0,-100 0,-100 0,-100" stop-color="yellow"/>
 *     </meshpatch>
 *   </meshrow>
 * </meshgradient>
 * ```
 *
 * @param {Object} meshGradientDef - Mesh gradient definition object with meshrows, type, etc.
 * @param {number} [meshGradientDef.x=0] - X coordinate of gradient origin
 * @param {number} [meshGradientDef.y=0] - Y coordinate of gradient origin
 * @param {string} [meshGradientDef.type='bilinear'] - Interpolation type ('bilinear' or 'bicubic')
 * @param {string} [meshGradientDef.gradientUnits='userSpaceOnUse'] - Coordinate system
 * @param {string} [meshGradientDef.gradientTransform] - Transform matrix
 * @param {Array} meshGradientDef.meshrows - Array of mesh rows
 * @returns {{patches: Array<CoonsPatch>, type: string, gradientUnits: string, gradientTransform: string|null, x: number, y: number}} Parsed mesh data
 *
 * @example
 * // Parse a simple mesh gradient
 * const meshDef = {
 *   x: 0, y: 0,
 *   type: 'bilinear',
 *   meshrows: [
 *     {
 *       meshpatches: [
 *         {
 *           stops: [
 *             { path: 'c 100,0 100,0 100,0', color: 'red' },
 *             { path: 'c 0,100 0,100 0,100', color: 'green' },
 *             { path: 'c -100,0 -100,0 -100,0', color: 'blue' },
 *             { path: 'c 0,-100 0,-100 0,-100', color: 'yellow' }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * };
 * const meshData = parseMeshGradient(meshDef);
 * console.log(`Parsed ${meshData.patches.length} patches`);
 */
export function parseMeshGradient(meshGradientDef) {
  if (!meshGradientDef || typeof meshGradientDef !== "object") {
    throw new Error("parseMeshGradient: meshGradientDef must be an object");
  }

  const x = D(meshGradientDef.x || 0);
  const y = D(meshGradientDef.y || 0);
  const type = meshGradientDef.type || "bilinear";
  const gradientUnits = meshGradientDef.gradientUnits || "userSpaceOnUse";
  const gradientTransform = meshGradientDef.gradientTransform || null;

  const patches = [];
  const _meshRows = meshGradientDef.meshrows || [];

  // NOTE: This is a stub implementation - full parsing logic needs to be added
  // The current implementation only extracts metadata without building actual patches

  return {
    patches,
    type,
    gradientUnits,
    gradientTransform,
    x: Number(x),
    y: Number(y),
  };
}

/**
 * Parse an SVG meshGradient DOM element into a mesh gradient definition object.
 *
 * Extracts the meshGradient structure from a DOM element, reading all attributes
 * and child elements (meshrow, meshpatch, stop) to create a data structure
 * suitable for parseMeshGradient().
 *
 * Handles:
 * - Gradient attributes (x, y, type, gradientUnits, gradientTransform)
 * - Nested meshrow/meshpatch/stop hierarchy
 * - Stop colors from style attributes (stop-color, stop-opacity)
 * - Path data for Bezier curves
 *
 * @param {Element} element - SVG <meshgradient> DOM element
 * @returns {Object} Mesh gradient definition suitable for parseMeshGradient()
 *
 * @example
 * // Parse from DOM
 * const meshElement = document.querySelector('#myMeshGradient');
 * const meshDef = parseMeshGradientElement(meshElement);
 * const meshData = parseMeshGradient(meshDef);
 *
 * @example
 * // Parse and render
 * const meshElement = document.getElementById('gradient1');
 * const meshDef = parseMeshGradientElement(meshElement);
 * const meshData = parseMeshGradient(meshDef);
 * const imageData = rasterizeMeshGradient(meshData, 800, 600);
 */
export function parseMeshGradientElement(element) {
  if (!element || typeof element !== "object" || !element.getAttribute) {
    throw new Error("parseMeshGradientElement: element must be a DOM element");
  }

  const data = {
    x: element.getAttribute("x") || "0",
    y: element.getAttribute("y") || "0",
    type: element.getAttribute("type") || "bilinear",
    gradientUnits: element.getAttribute("gradientUnits") || "userSpaceOnUse",
    gradientTransform: element.getAttribute("gradientTransform"),
    meshrows: [],
  };

  const meshRows = element.querySelectorAll("meshrow");
  meshRows.forEach((row) => {
    const rowData = { meshpatches: [] };
    const meshPatches = row.querySelectorAll("meshpatch");

    meshPatches.forEach((patch) => {
      const patchData = { stops: [] };
      const stops = patch.querySelectorAll("stop");

      stops.forEach((stop) => {
        const style = stop.getAttribute("style") || "";
        const colorMatch = style.match(/stop-color:\s*([^;]+)/);
        const opacityMatch = style.match(/stop-opacity:\s*([^;]+)/);

        const opacityValue = opacityMatch ? parseFloat(opacityMatch[1]) : 1;
        const validOpacity = Number.isFinite(opacityValue) ? opacityValue : 1;

        patchData.stops.push({
          path: stop.getAttribute("path") || "",
          color: colorMatch ? colorMatch[1].trim() : null,
          opacity: validOpacity,
        });
      });

      rowData.meshpatches.push(patchData);
    });

    data.meshrows.push(rowData);
  });

  return data;
}

// ============================================================================
// Mesh Gradient Rasterization
// ============================================================================

/**
 * Rasterize a mesh gradient to a pixel buffer using adaptive subdivision.
 *
 * Converts a mesh gradient (array of CoonsPatch objects) into a raster image
 * by adaptively subdividing each patch until it's flat enough to render
 * directly. Uses scanline rendering with bilinear color interpolation and
 * alpha blending.
 *
 * The rasterization process:
 * 1. For each patch, check if it's flat using isFlat()
 * 2. If flat, render directly as a colored quad
 * 3. If curved, subdivide into 4 sub-patches and recurse
 * 4. Apply alpha blending for overlapping patches
 *
 * @param {Object} meshData - Parsed mesh gradient data from parseMeshGradient()
 * @param {Array<CoonsPatch>} meshData.patches - Array of Coons patches to render
 * @param {number} width - Output image width in pixels
 * @param {number} height - Output image height in pixels
 * @param {Object} [options={}] - Rasterization options
 * @param {number} [options.samples=16] - Initial samples per patch edge (for non-adaptive methods)
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} Image data compatible with Canvas ImageData
 *
 * @example
 * // Rasterize a mesh gradient to 800x600
 * const meshData = parseMeshGradient(meshDef);
 * const imageData = rasterizeMeshGradient(meshData, 800, 600);
 * // Use with Canvas
 * const canvas = document.createElement('canvas');
 * canvas.width = 800;
 * canvas.height = 600;
 * const ctx = canvas.getContext('2d');
 * ctx.putImageData(new ImageData(imageData.data, 800, 600), 0, 0);
 *
 * @example
 * // High-quality rendering with more samples
 * const imageData = rasterizeMeshGradient(meshData, 1920, 1080, { samples: 32 });
 */
export function rasterizeMeshGradient(meshData, width, height, options = {}) {
  if (!meshData || typeof meshData !== "object") {
    throw new Error("rasterizeMeshGradient: meshData must be an object");
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(
      `rasterizeMeshGradient: width must be a positive integer, got ${width}`,
    );
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(
      `rasterizeMeshGradient: height must be a positive integer, got ${height}`,
    );
  }

  const { samples = DEFAULT_PATCH_SAMPLES } = options;

  // Create image data buffer
  const imageData = new Uint8ClampedArray(width * height * 4);

  // For each patch, rasterize to the buffer
  const patches = meshData.patches || [];
  for (const patch of patches) {
    if (!patch)
      throw new Error("rasterizeMeshGradient: patch is null or undefined");
    rasterizePatch(patch, imageData, width, height, samples);
  }

  return { data: imageData, width, height };
}

/**
 * Rasterize a single Coons patch using adaptive subdivision.
 *
 * Recursively subdivides the patch until each sub-patch is flat enough
 * (determined by isFlat()), then renders it as a simple quad. This adaptive
 * approach ensures smooth rendering of curved patches while avoiding
 * unnecessary subdivision of flat regions.
 *
 * @private
 * @param {CoonsPatch} patch - The patch to rasterize
 * @param {Uint8ClampedArray} imageData - Output pixel buffer (RGBA, 4 bytes per pixel)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {number} samples - Subdivision control parameter (unused in adaptive mode)
 */
function rasterizePatch(patch, imageData, width, height, _samples) {
  if (
    !patch ||
    typeof patch.isFlat !== "function" ||
    typeof patch.subdivide !== "function"
  ) {
    throw new Error(
      "rasterizePatch: patch must be a valid CoonsPatch instance",
    );
  }
  if (!imageData || !(imageData instanceof Uint8ClampedArray)) {
    throw new Error("rasterizePatch: imageData must be a Uint8ClampedArray");
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(
      `rasterizePatch: width must be a positive integer, got ${width}`,
    );
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(
      `rasterizePatch: height must be a positive integer, got ${height}`,
    );
  }

  // Adaptive subdivision approach
  const stack = [patch];

  while (stack.length > 0) {
    const currentPatch = stack.pop();

    if (currentPatch.isFlat()) {
      // Render as quad
      renderPatchQuad(currentPatch, imageData, width, height);
    } else {
      // Subdivide
      stack.push(...currentPatch.subdivide());
    }
  }
}

/**
 * Render a flat patch as a colored quadrilateral using scanline rasterization.
 *
 * Renders the patch by scanning all pixels in its bounding box and evaluating
 * the patch at each pixel's (u,v) coordinates. Uses bilinear color interpolation
 * from the corner colors.
 *
 * Alpha blending is performed using the Porter-Duff "over" operator:
 * out_α = src_α + dst_α × (1 - src_α)
 * out_rgb = (src_rgb × src_α + dst_rgb × dst_α × (1 - src_α)) / out_α
 *
 * @private
 * @param {CoonsPatch} patch - The flat patch to render
 * @param {Uint8ClampedArray} imageData - Output pixel buffer (RGBA format)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 */
function renderPatchQuad(patch, imageData, width, height) {
  if (
    !patch ||
    typeof patch.getBBox !== "function" ||
    typeof patch.evaluate !== "function"
  ) {
    throw new Error(
      "renderPatchQuad: patch must be a valid CoonsPatch instance",
    );
  }
  if (!imageData || !(imageData instanceof Uint8ClampedArray)) {
    throw new Error("renderPatchQuad: imageData must be a Uint8ClampedArray");
  }
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(
      `renderPatchQuad: width must be a positive integer, got ${width}`,
    );
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(
      `renderPatchQuad: height must be a positive integer, got ${height}`,
    );
  }

  const bbox = patch.getBBox();
  const minX = Math.max(0, Math.floor(Number(bbox.minX)));
  const maxX = Math.min(width - 1, Math.ceil(Number(bbox.maxX)));
  const minY = Math.max(0, Math.floor(Number(bbox.minY)));
  const maxY = Math.min(height - 1, Math.ceil(Number(bbox.maxY)));

  // Simple scan-line fill with bilinear color interpolation
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Convert pixel to patch (u,v) coordinates
      const u = D(x)
        .minus(bbox.minX)
        .div(bbox.maxX.minus(bbox.minX) || D(1));
      const v = D(y)
        .minus(bbox.minY)
        .div(bbox.maxY.minus(bbox.minY) || D(1));

      if (u.gte(0) && u.lte(1) && v.gte(0) && v.lte(1)) {
        const { color: patchColor } = patch.evaluate(u, v);
        const idx = (y * width + x) * 4;

        // Alpha blending
        const srcA = patchColor.a / 255;
        const dstA = imageData[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          imageData[idx] =
            (patchColor.r * srcA + imageData[idx] * dstA * (1 - srcA)) / outA;
          imageData[idx + 1] =
            (patchColor.g * srcA + imageData[idx + 1] * dstA * (1 - srcA)) /
            outA;
          imageData[idx + 2] =
            (patchColor.b * srcA + imageData[idx + 2] * dstA * (1 - srcA)) /
            outA;
          imageData[idx + 3] = outA * 255;
        }
      }
    }
  }
}

// ============================================================================
// Mesh Gradient to Path Approximation
// ============================================================================

/**
 * Approximate a mesh gradient as a collection of filled polygons.
 *
 * Converts each Coons patch into a grid of colored quads by sampling the
 * patch at regular intervals. This is useful for exporting to vector formats
 * that don't support mesh gradients (PDF, PostScript, etc.) or for
 * compatibility with older renderers.
 *
 * Each patch is subdivided into subdivisions × subdivisions quads, with each
 * quad assigned an average color from its four corners. The finer the
 * subdivision, the smoother the gradient approximation, but the more polygons
 * are generated.
 *
 * @param {Object} meshData - Parsed mesh gradient data from parseMeshGradient()
 * @param {Array<CoonsPatch>} meshData.patches - Array of Coons patches
 * @param {Object} [options={}] - Approximation options
 * @param {number} [options.subdivisions=8] - Number of subdivisions per patch edge
 * @returns {Array<{polygon: Array<{x: Decimal, y: Decimal}>, color: {r: number, g: number, b: number, a: number}}>} Array of colored polygons
 *
 * @example
 * // Convert mesh to polygons for PDF export
 * const meshData = parseMeshGradient(meshDef);
 * const polygons = meshGradientToPolygons(meshData, { subdivisions: 16 });
 * // Export each polygon to PDF
 * polygons.forEach(({polygon, color}) => {
 *   pdf.fillColor(color.r, color.g, color.b, color.a / 255);
 *   pdf.polygon(polygon.map(p => [p.x, p.y]));
 *   pdf.fill();
 * });
 *
 * @example
 * // Low-resolution approximation
 * const polygons = meshGradientToPolygons(meshData, { subdivisions: 4 });
 * console.log(`Generated ${polygons.length} polygons`);
 */
export function meshGradientToPolygons(meshData, options = {}) {
  if (!meshData || typeof meshData !== "object") {
    throw new Error("meshGradientToPolygons: meshData must be an object");
  }

  const { subdivisions = 8 } = options;
  const result = [];

  const patches = meshData.patches || [];
  for (const patch of patches) {
    if (!patch)
      throw new Error("meshGradientToPolygons: patch is null or undefined");
    const polys = patchToPolygons(patch, subdivisions);
    result.push(...polys);
  }

  return result;
}

/**
 * Convert a single Coons patch into a grid of filled quadrilaterals.
 *
 * Samples the patch at regular intervals to create a grid of quads. Each quad
 * is assigned a color that's the average of its four corner colors. This
 * provides a piecewise-constant color approximation of the smooth gradient.
 *
 * @private
 * @param {CoonsPatch} patch - The patch to convert
 * @param {number} subdivisions - Number of subdivisions per edge (creates subdivisions² quads)
 * @returns {Array<{polygon: Array, color: Object}>} Array of colored quads
 */
function patchToPolygons(patch, subdivisions) {
  if (!patch || typeof patch.evaluate !== "function") {
    throw new Error(
      "patchToPolygons: patch must be a valid CoonsPatch instance",
    );
  }
  if (!Number.isInteger(subdivisions) || subdivisions <= 0) {
    throw new Error(
      `patchToPolygons: subdivisions must be a positive integer, got ${subdivisions}`,
    );
  }

  const result = [];
  const step = D(1).div(subdivisions);

  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions; j++) {
      const u0 = step.mul(i);
      const u1 = step.mul(i + 1);
      const v0 = step.mul(j);
      const v1 = step.mul(j + 1);

      const p00 = patch.evaluate(u0, v0);
      const p10 = patch.evaluate(u1, v0);
      const p01 = patch.evaluate(u0, v1);
      const p11 = patch.evaluate(u1, v1);

      // Average color for this quad
      const avgColor = {
        r: (p00.color.r + p10.color.r + p01.color.r + p11.color.r) / 4,
        g: (p00.color.g + p10.color.g + p01.color.g + p11.color.g) / 4,
        b: (p00.color.b + p10.color.b + p01.color.b + p11.color.b) / 4,
        a: (p00.color.a + p10.color.a + p01.color.a + p11.color.a) / 4,
      };

      result.push({
        polygon: [
          PolygonClip.point(p00.point.x, p00.point.y),
          PolygonClip.point(p10.point.x, p10.point.y),
          PolygonClip.point(p11.point.x, p11.point.y),
          PolygonClip.point(p01.point.x, p01.point.y),
        ],
        color: avgColor,
      });
    }
  }

  return result;
}

// ============================================================================
// Mesh Gradient Clipping
// ============================================================================

/**
 * Apply a clipping path to a mesh gradient.
 *
 * Clips a mesh gradient against an arbitrary polygon using the Sutherland-Hodgman
 * polygon clipping algorithm (via polygon-clip module). The mesh is first
 * approximated as polygons, then each polygon is clipped against the clip path.
 *
 * This is useful for implementing SVG clipPath with mesh gradients or for
 * rendering only the visible portion of a gradient.
 *
 * @param {Object} meshData - Parsed mesh gradient data from parseMeshGradient()
 * @param {Array<CoonsPatch>} meshData.patches - Array of patches to clip
 * @param {Array<{x: Decimal, y: Decimal}>} clipPolygon - Clipping polygon vertices (must be closed)
 * @param {Object} [options={}] - Clipping options
 * @param {number} [options.subdivisions=16] - Mesh subdivision before clipping (higher = more accurate)
 * @returns {Array<{polygon: Array<{x: Decimal, y: Decimal}>, color: {r: number, g: number, b: number, a: number}}>} Clipped polygons with preserved colors
 *
 * @example
 * // Clip mesh to circular region
 * const meshData = parseMeshGradient(meshDef);
 * const circlePolygon = [];
 * for (let i = 0; i < 32; i++) {
 *   const angle = (i / 32) * 2 * Math.PI;
 *   circlePolygon.push(point(
 *     100 + 50 * Math.cos(angle),
 *     100 + 50 * Math.sin(angle)
 *   ));
 * }
 * const clipped = clipMeshGradient(meshData, circlePolygon);
 *
 * @example
 * // Clip to viewport rectangle
 * const viewport = [
 *   point(0, 0), point(800, 0),
 *   point(800, 600), point(0, 600)
 * ];
 * const clipped = clipMeshGradient(meshData, viewport, { subdivisions: 32 });
 */
export function clipMeshGradient(meshData, clipPolygon, options = {}) {
  if (!meshData || typeof meshData !== "object") {
    throw new Error("clipMeshGradient: meshData must be an object");
  }
  if (!Array.isArray(clipPolygon)) {
    throw new Error("clipMeshGradient: clipPolygon must be an array");
  }

  const { subdivisions = 16 } = options;

  // First convert mesh to polygons
  const meshPolygons = meshGradientToPolygons(meshData, { subdivisions });

  // Clip each polygon
  const clippedPolygons = [];

  for (const { polygon, color: polyColor } of meshPolygons) {
    if (!Array.isArray(polygon))
      throw new Error("clipMeshGradient: polygon must be an array");
    const clipped = PolygonClip.polygonIntersection(polygon, clipPolygon);

    for (const clippedPoly of clipped) {
      if (clippedPoly.length >= 3) {
        clippedPolygons.push({ polygon: clippedPoly, color: polyColor });
      }
    }
  }

  return clippedPolygons;
}

/**
 * Generate SVG path elements from clipped mesh gradient polygons.
 *
 * Converts the polygon representation back to SVG path data with fill colors,
 * suitable for embedding in SVG documents. Each polygon becomes a closed path
 * with an rgba() fill color.
 *
 * This is the final step in rendering mesh gradients to SVG when the target
 * doesn't support native meshGradient elements.
 *
 * @param {Array<{polygon: Array<{x: Decimal, y: Decimal}>, color: {r: number, g: number, b: number, a: number}}>} clippedPolygons - Result from clipMeshGradient() or meshGradientToPolygons()
 * @returns {Array<{pathData: string, fill: string}>} Array of SVG path objects with path data and fill color
 *
 * @example
 * // Convert clipped mesh to SVG paths
 * const clipped = clipMeshGradient(meshData, clipPolygon);
 * const svgPaths = clippedMeshToSVG(clipped);
 * svgPaths.forEach(({pathData, fill}) => {
 *   const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
 *   path.setAttribute('d', pathData);
 *   path.setAttribute('fill', fill);
 *   svg.appendChild(path);
 * });
 *
 * @example
 * // Generate SVG string
 * const svgPaths = clippedMeshToSVG(clipped);
 * const svgContent = svgPaths.map(({pathData, fill}) =>
 *   `<path d="${pathData}" fill="${fill}"/>`
 * ).join('\n');
 */
export function clippedMeshToSVG(clippedPolygons) {
  if (!Array.isArray(clippedPolygons)) {
    throw new Error("clippedMeshToSVG: clippedPolygons must be an array");
  }

  return clippedPolygons.map(({ polygon, color: polyColor }) => {
    if (!Array.isArray(polygon))
      throw new Error("clippedMeshToSVG: polygon must be an array");
    if (
      !polyColor ||
      !(
        "r" in polyColor &&
        "g" in polyColor &&
        "b" in polyColor &&
        "a" in polyColor
      )
    ) {
      throw new Error(
        "clippedMeshToSVG: polygon must have color with r, g, b, a properties",
      );
    }

    let pathData = "";
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      if (!p || !("x" in p && "y" in p)) {
        throw new Error(
          `clippedMeshToSVG: point at index ${i} must have x, y properties`,
        );
      }

      if (i === 0) {
        pathData += `M ${Number(p.x).toFixed(6)} ${Number(p.y).toFixed(6)}`;
      } else {
        pathData += ` L ${Number(p.x).toFixed(6)} ${Number(p.y).toFixed(6)}`;
      }
    }
    pathData += " Z";

    const fill = `rgba(${Math.round(polyColor.r)},${Math.round(polyColor.g)},${Math.round(polyColor.b)},${(polyColor.a / 255).toFixed(3)})`;

    return { pathData, fill };
  });
}
