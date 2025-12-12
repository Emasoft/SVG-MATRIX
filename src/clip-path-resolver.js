/**
 * ClipPath Resolver - Flatten clipPath operations with arbitrary precision
 *
 * This module resolves SVG clipPath elements by performing boolean intersection
 * operations using Decimal.js-backed polygon clipping.
 *
 * ## SVG clipPath Coordinate Systems
 *
 * SVG clipPath elements support two coordinate systems via the `clipPathUnits` attribute:
 *
 * - **userSpaceOnUse** (default): The clipPath coordinates are in the same coordinate
 *   system as the element being clipped. This is the user coordinate system established
 *   by the viewport.
 *
 * - **objectBoundingBox**: The clipPath coordinates are expressed as fractions (0-1)
 *   of the bounding box of the element being clipped. A point (0.5, 0.5) would be
 *   the center of the target element's bounding box.
 *
 * ## Clipping Process
 *
 * 1. Convert clipPath shapes to polygons by sampling curves (Bezier, arcs)
 * 2. Apply transforms (element transform, CTM, and coordinate system transforms)
 * 3. Perform boolean union of multiple clipPath children into unified clip polygon
 * 4. Intersect target element polygon with clip polygon to get final clipped geometry
 * 5. Handle nested clipPaths by recursively resolving and intersecting
 *
 * @module clip-path-resolver
 */

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import * as Transforms2D from './transforms2d.js';
import * as PolygonClip from './polygon-clip.js';
import {
  circleToPath,
  ellipseToPath,
  rectToPath,
  lineToPath,
  polygonToPath,
  polylineToPath,
  parseTransformAttribute,
  transformPathData
} from './svg-flatten.js';
import {
  circleToPathDataHP,
  ellipseToPathDataHP
} from './geometry-to-path.js';
import { Logger } from './logger.js';
import { FillRule, pointInPolygonWithRule } from './svg-boolean-ops.js';

// Alias for cleaner code
const parseTransform = parseTransformAttribute;

Decimal.set({ precision: 80 });

/**
 * Helper function to convert a value to Decimal.
 * @private
 * @param {number|string|Decimal} x - Value to convert
 * @returns {Decimal} Decimal instance
 */
const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Default number of sample points per curve segment (for Bezier curves and arcs).
 * Higher values produce smoother polygons but increase computation time.
 * @constant {number}
 */
const DEFAULT_CURVE_SAMPLES = 20;

/**
 * Convert SVG path data to a polygon (array of points) by sampling curves.
 *
 * This function parses SVG path commands and converts curves (cubic Bezier, quadratic
 * Bezier, and elliptical arcs) into polyline segments by sampling points along the curve.
 * Straight line commands (M, L, H, V) are converted directly to polygon vertices.
 *
 * All numeric values are converted to Decimal for arbitrary precision.
 *
 * @param {string} pathData - SVG path d attribute string (e.g., "M 0 0 L 100 0 L 100 100 Z")
 * @param {number} [samplesPerCurve=20] - Number of sample points to generate per curve segment.
 *        Higher values produce smoother approximations of curves but increase vertex count.
 * @returns {Array<{x: Decimal, y: Decimal}>} Array of polygon vertices with Decimal coordinates.
 *          Consecutive duplicate points are removed.
 *
 * @example
 * // Convert a simple path to polygon
 * const polygon = pathToPolygon("M 0 0 L 100 0 L 100 100 L 0 100 Z");
 * // Returns: [{x: Decimal(0), y: Decimal(0)}, {x: Decimal(100), y: Decimal(0)}, ...]
 *
 * @example
 * // Convert a path with curves using custom sampling
 * const smoothPolygon = pathToPolygon("M 0 0 C 50 0 50 100 100 100", 50);
 * // Higher sampling (50 points) creates smoother curve approximation
 */
export function pathToPolygon(pathData, samplesPerCurve = DEFAULT_CURVE_SAMPLES) {
  const points = [];
  let currentX = D(0), currentY = D(0);
  let startX = D(0), startY = D(0);

  const commands = parsePathCommands(pathData);

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M':
        currentX = D(args[0]); currentY = D(args[1]);
        startX = currentX; startY = currentY;
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'm':
        currentX = currentX.plus(args[0]); currentY = currentY.plus(args[1]);
        startX = currentX; startY = currentY;
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'L':
        currentX = D(args[0]); currentY = D(args[1]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'l':
        currentX = currentX.plus(args[0]); currentY = currentY.plus(args[1]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'H':
        currentX = D(args[0]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'h':
        currentX = currentX.plus(args[0]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'V':
        currentY = D(args[0]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'v':
        currentY = currentY.plus(args[0]);
        points.push(PolygonClip.point(currentX, currentY));
        break;
      case 'C':
        sampleCubicBezier(points, currentX, currentY,
          D(args[0]), D(args[1]), D(args[2]), D(args[3]), D(args[4]), D(args[5]),
          samplesPerCurve);
        currentX = D(args[4]); currentY = D(args[5]);
        break;
      case 'c':
        sampleCubicBezier(points, currentX, currentY,
          currentX.plus(args[0]), currentY.plus(args[1]),
          currentX.plus(args[2]), currentY.plus(args[3]),
          currentX.plus(args[4]), currentY.plus(args[5]),
          samplesPerCurve);
        currentX = currentX.plus(args[4]); currentY = currentY.plus(args[5]);
        break;
      case 'Q':
        sampleQuadraticBezier(points, currentX, currentY,
          D(args[0]), D(args[1]), D(args[2]), D(args[3]),
          samplesPerCurve);
        currentX = D(args[2]); currentY = D(args[3]);
        break;
      case 'q':
        sampleQuadraticBezier(points, currentX, currentY,
          currentX.plus(args[0]), currentY.plus(args[1]),
          currentX.plus(args[2]), currentY.plus(args[3]),
          samplesPerCurve);
        currentX = currentX.plus(args[2]); currentY = currentY.plus(args[3]);
        break;
      case 'A':
        sampleArc(points, currentX, currentY,
          D(args[0]), D(args[1]), D(args[2]), args[3], args[4],
          D(args[5]), D(args[6]), samplesPerCurve);
        currentX = D(args[5]); currentY = D(args[6]);
        break;
      case 'a':
        sampleArc(points, currentX, currentY,
          D(args[0]), D(args[1]), D(args[2]), args[3], args[4],
          currentX.plus(args[5]), currentY.plus(args[6]), samplesPerCurve);
        currentX = currentX.plus(args[5]); currentY = currentY.plus(args[6]);
        break;
      case 'Z': case 'z':
        currentX = startX; currentY = startY;
        break;
    }
  }

  return removeDuplicateConsecutive(points);
}

/**
 * Parse SVG path data into individual commands with arguments.
 *
 * Extracts path commands (M, L, C, Q, A, Z, etc.) and their numeric arguments from
 * an SVG path data string.
 *
 * @private
 * @param {string} pathData - SVG path d attribute string
 * @returns {Array<{type: string, args: Array<number>}>} Array of command objects,
 *          each containing a command type (single letter) and array of numeric arguments
 *
 * @example
 * parsePathCommands("M 10 20 L 30 40")
 * // Returns: [{type: 'M', args: [10, 20]}, {type: 'L', args: [30, 40]}]
 */
function parsePathCommands(pathData) {
  const commands = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;
  while ((match = regex.exec(pathData)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();
    const args = argsStr.length > 0
      ? argsStr.split(/[\s,]+/).filter(s => s.length > 0).map(Number)
      : [];
    commands.push({ type, args });
  }
  return commands;
}

/**
 * Sample points along a cubic Bezier curve and append them to the points array.
 *
 * Uses the cubic Bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
 * where t ranges from 0 to 1.
 *
 * @private
 * @param {Array<{x: Decimal, y: Decimal}>} points - Array to append sampled points to
 * @param {Decimal} x0 - Start point x coordinate
 * @param {Decimal} y0 - Start point y coordinate
 * @param {Decimal} x1 - First control point x coordinate
 * @param {Decimal} y1 - First control point y coordinate
 * @param {Decimal} x2 - Second control point x coordinate
 * @param {Decimal} y2 - Second control point y coordinate
 * @param {Decimal} x3 - End point x coordinate
 * @param {Decimal} y3 - End point y coordinate
 * @param {number} samples - Number of points to sample along the curve
 *
 * @example
 * const points = [];
 * sampleCubicBezier(points, D(0), D(0), D(50), D(0), D(50), D(100), D(100), D(100), 20);
 * // points now contains 20 sampled points along the cubic Bezier curve
 */
function sampleCubicBezier(points, x0, y0, x1, y1, x2, y2, x3, y3, samples) {
  for (let i = 1; i <= samples; i++) {
    const t = D(i).div(samples);
    const mt = D(1).minus(t);
    const mt2 = mt.mul(mt), mt3 = mt2.mul(mt);
    const t2 = t.mul(t), t3 = t2.mul(t);
    const x = mt3.mul(x0).plus(D(3).mul(mt2).mul(t).mul(x1))
      .plus(D(3).mul(mt).mul(t2).mul(x2)).plus(t3.mul(x3));
    const y = mt3.mul(y0).plus(D(3).mul(mt2).mul(t).mul(y1))
      .plus(D(3).mul(mt).mul(t2).mul(y2)).plus(t3.mul(y3));
    points.push(PolygonClip.point(x, y));
  }
}

/**
 * Sample points along a quadratic Bezier curve and append them to the points array.
 *
 * Uses the quadratic Bezier formula: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
 * where t ranges from 0 to 1.
 *
 * @private
 * @param {Array<{x: Decimal, y: Decimal}>} points - Array to append sampled points to
 * @param {Decimal} x0 - Start point x coordinate
 * @param {Decimal} y0 - Start point y coordinate
 * @param {Decimal} x1 - Control point x coordinate
 * @param {Decimal} y1 - Control point y coordinate
 * @param {Decimal} x2 - End point x coordinate
 * @param {Decimal} y2 - End point y coordinate
 * @param {number} samples - Number of points to sample along the curve
 *
 * @example
 * const points = [];
 * sampleQuadraticBezier(points, D(0), D(0), D(50), D(50), D(100), D(0), 20);
 * // points now contains 20 sampled points along the quadratic Bezier curve
 */
function sampleQuadraticBezier(points, x0, y0, x1, y1, x2, y2, samples) {
  for (let i = 1; i <= samples; i++) {
    const t = D(i).div(samples);
    const mt = D(1).minus(t);
    const mt2 = mt.mul(mt), t2 = t.mul(t);
    const x = mt2.mul(x0).plus(D(2).mul(mt).mul(t).mul(x1)).plus(t2.mul(x2));
    const y = mt2.mul(y0).plus(D(2).mul(mt).mul(t).mul(y1)).plus(t2.mul(y2));
    points.push(PolygonClip.point(x, y));
  }
}

/**
 * Sample points along an elliptical arc and append them to the points array.
 *
 * Converts SVG arc parameters to center parameterization and samples points along
 * the arc. Implements the SVG arc conversion algorithm from the SVG specification.
 *
 * @private
 * @param {Array<{x: Decimal, y: Decimal}>} points - Array to append sampled points to
 * @param {Decimal} x0 - Start point x coordinate
 * @param {Decimal} y0 - Start point y coordinate
 * @param {Decimal} rx - X-axis radius of the ellipse
 * @param {Decimal} ry - Y-axis radius of the ellipse
 * @param {Decimal} xAxisRotation - Rotation angle of the ellipse x-axis (in degrees)
 * @param {number} largeArc - Large arc flag (0 or 1): whether to take the larger arc
 * @param {number} sweep - Sweep flag (0 or 1): direction of the arc (0=counterclockwise, 1=clockwise)
 * @param {Decimal} x1 - End point x coordinate
 * @param {Decimal} y1 - End point y coordinate
 * @param {number} samples - Number of points to sample along the arc
 *
 * @example
 * const points = [];
 * // Sample an arc from (0,0) to (100,100) with radii 50,50
 * sampleArc(points, D(0), D(0), D(50), D(50), D(0), 0, 1, D(100), D(100), 20);
 */
function sampleArc(points, x0, y0, rx, ry, xAxisRotation, largeArc, sweep, x1, y1, samples) {
  if (rx.eq(0) || ry.eq(0)) { points.push(PolygonClip.point(x1, y1)); return; }
  rx = rx.abs(); ry = ry.abs();

  const phi = xAxisRotation.mul(Math.PI).div(180);
  const cosPhi = phi.cos(), sinPhi = phi.sin();
  const dx = x0.minus(x1).div(2), dy = y0.minus(y1).div(2);
  const x1p = cosPhi.mul(dx).plus(sinPhi.mul(dy));
  const y1p = cosPhi.mul(dy).minus(sinPhi.mul(dx));

  let rx2 = rx.mul(rx), ry2 = ry.mul(ry);
  const x1p2 = x1p.mul(x1p), y1p2 = y1p.mul(y1p);
  const lambda = x1p2.div(rx2).plus(y1p2.div(ry2));
  if (lambda.gt(1)) {
    const sqrtLambda = lambda.sqrt();
    rx = rx.mul(sqrtLambda); ry = ry.mul(sqrtLambda);
    rx2 = rx.mul(rx); ry2 = ry.mul(ry);
  }

  let sq = rx2.mul(ry2).minus(rx2.mul(y1p2)).minus(ry2.mul(x1p2));
  sq = sq.div(rx2.mul(y1p2).plus(ry2.mul(x1p2)));
  if (sq.lt(0)) sq = D(0);
  sq = sq.sqrt();
  if (largeArc === sweep) sq = sq.neg();

  const cxp = sq.mul(rx).mul(y1p).div(ry);
  const cyp = sq.neg().mul(ry).mul(x1p).div(rx);
  const midX = x0.plus(x1).div(2), midY = y0.plus(y1).div(2);
  const cx = cosPhi.mul(cxp).minus(sinPhi.mul(cyp)).plus(midX);
  const cy = sinPhi.mul(cxp).plus(cosPhi.mul(cyp)).plus(midY);

  const ux = x1p.minus(cxp).div(rx), uy = y1p.minus(cyp).div(ry);
  const vx = x1p.neg().minus(cxp).div(rx), vy = y1p.neg().minus(cyp).div(ry);
  const n1 = ux.mul(ux).plus(uy.mul(uy)).sqrt();
  let theta1 = Decimal.acos(ux.div(n1));
  if (uy.lt(0)) theta1 = theta1.neg();

  const n2 = n1.mul(vx.mul(vx).plus(vy.mul(vy)).sqrt());
  let dtheta = Decimal.acos(ux.mul(vx).plus(uy.mul(vy)).div(n2));
  if (ux.mul(vy).minus(uy.mul(vx)).lt(0)) dtheta = dtheta.neg();

  const PI = D(Math.PI), TWO_PI = PI.mul(2);
  if (sweep && dtheta.lt(0)) dtheta = dtheta.plus(TWO_PI);
  else if (!sweep && dtheta.gt(0)) dtheta = dtheta.minus(TWO_PI);

  for (let i = 1; i <= samples; i++) {
    const t = D(i).div(samples);
    const theta = theta1.plus(dtheta.mul(t));
    const cosTheta = theta.cos(), sinTheta = theta.sin();
    const x = cosPhi.mul(rx.mul(cosTheta)).minus(sinPhi.mul(ry.mul(sinTheta))).plus(cx);
    const y = sinPhi.mul(rx.mul(cosTheta)).plus(cosPhi.mul(ry.mul(sinTheta))).plus(cy);
    points.push(PolygonClip.point(x, y));
  }
}

/**
 * Remove consecutive duplicate points from a polygon.
 *
 * Compares each point with the previous point and removes duplicates that appear
 * consecutively. This is necessary because curve sampling may produce identical
 * consecutive points at curve endpoints.
 *
 * @private
 * @param {Array<{x: Decimal, y: Decimal}>} points - Array of polygon vertices
 * @returns {Array<{x: Decimal, y: Decimal}>} Array with consecutive duplicates removed
 *
 * @example
 * const points = [{x: D(0), y: D(0)}, {x: D(0), y: D(0)}, {x: D(1), y: D(1)}];
 * const clean = removeDuplicateConsecutive(points);
 * // Returns: [{x: D(0), y: D(0)}, {x: D(1), y: D(1)}]
 */
function removeDuplicateConsecutive(points) {
  if (points.length < 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (!PolygonClip.pointsEqual(points[i], result[result.length - 1])) {
      result.push(points[i]);
    }
  }
  return result;
}

/**
 * Convert an SVG shape element to a polygon by sampling its geometry.
 *
 * Supports various SVG shape elements (circle, ellipse, rect, line, polygon, polyline, path)
 * and converts them to polygons with Decimal-precision coordinates. Applies element transforms
 * and optional current transformation matrix (CTM).
 *
 * Shape elements are first converted to path data, then transforms are applied, and finally
 * the path is sampled into a polygon.
 *
 * @param {Object} element - SVG element object with properties like type, cx, cy, r, d, etc.
 * @param {Object} element.type - Shape type: 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', or 'path'
 * @param {Matrix|null} [ctm=null] - Current transformation matrix (3x3) to apply to the shape.
 *        If null, no additional transform is applied beyond the element's own transform.
 * @param {number} [samples=20] - Number of sample points per curve segment for path sampling
 * @returns {Array<{x: Decimal, y: Decimal}>} Polygon vertices representing the shape
 *
 * @example
 * // Convert a circle to polygon
 * const circle = { type: 'circle', cx: 50, cy: 50, r: 25 };
 * const polygon = shapeToPolygon(circle);
 *
 * @example
 * // Convert a rect with transform and CTM
 * const rect = { type: 'rect', x: 0, y: 0, width: 100, height: 50, transform: 'rotate(45)' };
 * const ctm = Transforms2D.translation(10, 20);
 * const polygon = shapeToPolygon(rect, ctm, 30);
 */
/**
 * Convert SVG shape to polygon.
 *
 * @param {Object} element - Shape element (circle, ellipse, rect, etc.)
 * @param {Matrix} ctm - Current transform matrix (optional)
 * @param {number} samples - Samples per curve for polygon conversion
 * @param {number} bezierArcs - Number of Bezier arcs for circles/ellipses (4=standard, 16 or 64=HP)
 */
export function shapeToPolygon(element, ctm = null, samples = DEFAULT_CURVE_SAMPLES, bezierArcs = 4) {
  let pathData;
  switch (element.type) {
    case 'circle':
      // Use high-precision Bezier arcs for better curve approximation
      if (bezierArcs > 4) {
        pathData = circleToPathDataHP(element.cx || 0, element.cy || 0, element.r || 0, bezierArcs, 10);
      } else {
        pathData = circleToPath(D(element.cx || 0), D(element.cy || 0), D(element.r || 0));
      }
      break;
    case 'ellipse':
      // Use high-precision Bezier arcs for better curve approximation
      if (bezierArcs > 4) {
        pathData = ellipseToPathDataHP(element.cx || 0, element.cy || 0, element.rx || 0, element.ry || 0, bezierArcs, 10);
      } else {
        pathData = ellipseToPath(D(element.cx || 0), D(element.cy || 0), D(element.rx || 0), D(element.ry || 0));
      }
      break;
    case 'rect':
      pathData = rectToPath(D(element.x || 0), D(element.y || 0), D(element.width || 0), D(element.height || 0),
        D(element.rx || 0), element.ry !== undefined ? D(element.ry) : null);
      break;
    case 'line':
      pathData = lineToPath(D(element.x1 || 0), D(element.y1 || 0), D(element.x2 || 0), D(element.y2 || 0));
      break;
    case 'polygon':
      pathData = polygonToPath(element.points || '');
      break;
    case 'polyline':
      pathData = polylineToPath(element.points || '');
      break;
    case 'path':
      pathData = element.d || '';
      break;
    default:
      return [];
  }

  if (element.transform) {
    const elementTransform = parseTransform(element.transform);
    pathData = transformPathData(pathData, elementTransform);
  }
  if (ctm) {
    pathData = transformPathData(pathData, ctm);
  }

  return pathToPolygon(pathData, samples);
}

/**
 * Resolve a clipPath element into a unified clipping polygon.
 *
 * Takes a clipPath definition and converts all its child shapes into a single polygon
 * by performing boolean union operations. Handles both coordinate systems (userSpaceOnUse
 * and objectBoundingBox) and applies appropriate transforms.
 *
 * ## Coordinate System Handling
 *
 * - **userSpaceOnUse** (default): clipPath coordinates are in the same coordinate system
 *   as the element being clipped. The CTM and clipPath transform are applied directly.
 *
 * - **objectBoundingBox**: clipPath coordinates are fractions (0-1) of the target element's
 *   bounding box. A bounding box transform is computed and applied to scale/translate the
 *   clipPath into the target element's space.
 *
 * ## Transform Application Order
 *
 * 1. Start with CTM (current transformation matrix)
 * 2. Apply clipPath's own transform attribute
 * 3. If objectBoundingBox, apply bounding box scaling/translation
 * 4. Apply to each child shape
 *
 * @param {Object} clipPathDef - clipPath definition object
 * @param {string} [clipPathDef.clipPathUnits='userSpaceOnUse'] - Coordinate system: 'userSpaceOnUse' or 'objectBoundingBox'
 * @param {string} [clipPathDef.transform] - Optional transform attribute for the clipPath
 * @param {Array<Object>} [clipPathDef.children=[]] - Child shape elements to clip with
 * @param {Object|null} targetElement - The element being clipped (needed for objectBoundingBox)
 * @param {Matrix|null} [ctm=null] - Current transformation matrix (3x3)
 * @param {Object} [options={}] - Additional options
 * @param {number} [options.samples=20] - Number of sample points per curve segment
 * @returns {Array<{x: Decimal, y: Decimal}>} Unified clipping polygon (union of all child shapes)
 *
 * @example
 * // Resolve clipPath with userSpaceOnUse (default)
 * const clipDef = {
 *   clipPathUnits: 'userSpaceOnUse',
 *   children: [
 *     { type: 'circle', cx: 50, cy: 50, r: 40 },
 *     { type: 'rect', x: 40, y: 40, width: 20, height: 20 }
 *   ]
 * };
 * const clipPolygon = resolveClipPath(clipDef, null);
 *
 * @example
 * // Resolve clipPath with objectBoundingBox
 * const clipDef = {
 *   clipPathUnits: 'objectBoundingBox',
 *   children: [{ type: 'circle', cx: 0.5, cy: 0.5, r: 0.4 }]
 * };
 * const target = { type: 'rect', x: 0, y: 0, width: 200, height: 100 };
 * const clipPolygon = resolveClipPath(clipDef, target);
 * // Circle will be scaled to bbox: center at (100,50), radius 40 (0.4 * min(200,100))
 */
export function resolveClipPath(clipPathDef, targetElement, ctm = null, options = {}) {
  const { samples = DEFAULT_CURVE_SAMPLES } = options;
  const clipPathUnits = clipPathDef.clipPathUnits || 'userSpaceOnUse';
  let clipTransform = ctm ? ctm.clone() : Matrix.identity(3);

  if (clipPathDef.transform) {
    const clipPathTransformMatrix = parseTransform(clipPathDef.transform);
    clipTransform = clipTransform.mul(clipPathTransformMatrix);
  }

  if (clipPathUnits === 'objectBoundingBox' && targetElement) {
    const bbox = getElementBoundingBox(targetElement);
    if (bbox) {
      const bboxTransform = Transforms2D.translation(bbox.x, bbox.y)
        .mul(Transforms2D.scale(bbox.width, bbox.height));
      clipTransform = clipTransform.mul(bboxTransform);
    }
  }

  const clipPolygons = [];
  for (const child of (clipPathDef.children || [])) {
    const polygon = shapeToPolygon(child, clipTransform, samples);
    if (polygon.length >= 3) clipPolygons.push(polygon);
  }

  if (clipPolygons.length === 0) return [];
  if (clipPolygons.length === 1) return clipPolygons[0];

  let unified = clipPolygons[0];
  for (let i = 1; i < clipPolygons.length; i++) {
    const unionResult = PolygonClip.polygonUnion(unified, clipPolygons[i]);
    if (unionResult.length > 0) unified = unionResult[0];
  }
  return unified;
}

/**
 * Clip a polygon using a clip polygon with clip-rule support.
 *
 * For simple (non-self-intersecting) clip polygons, this is equivalent to
 * polygonIntersection. For self-intersecting clip paths, the clip-rule
 * determines which regions are inside the clip:
 *
 * - 'nonzero': All regions where winding number != 0 are inside
 * - 'evenodd': Only regions with odd crossing count are inside
 *
 * The algorithm:
 * 1. For simple clip polygons, use standard polygon intersection
 * 2. For self-intersecting clip polygons with evenodd rule, we need to
 *    compute which parts of the element polygon are in the "filled" regions
 *    of the clip polygon according to the evenodd rule
 *
 * @private
 * @param {Array} elementPolygon - The polygon to be clipped
 * @param {Array} clipPolygon - The clipping polygon (may be self-intersecting)
 * @param {string} clipRule - 'nonzero' or 'evenodd'
 * @returns {Array} Clipped polygon(s), or array of polygon arrays for multi-region results
 */
function clipPolygonWithRule(elementPolygon, clipPolygon, clipRule) {
  // For nonzero rule, standard intersection works correctly
  // because polygonIntersection uses the winding number test internally
  if (clipRule === 'nonzero') {
    return PolygonClip.polygonIntersection(elementPolygon, clipPolygon);
  }

  // For evenodd rule with self-intersecting clip paths, we need a different approach
  // The idea: filter vertices of the intersection result by the evenodd test
  // First get the standard intersection
  const intersection = PolygonClip.polygonIntersection(elementPolygon, clipPolygon);
  if (intersection.length === 0) return [];

  // For each resulting polygon, check if its centroid is inside according to evenodd
  // This handles the case where the clip path has holes due to evenodd rule
  const result = [];
  for (const poly of intersection) {
    if (poly.length < 3) continue;

    // Compute centroid of the polygon
    const centroid = computeCentroid(poly);

    // Test if centroid is inside the clip polygon according to evenodd rule
    const fillRule = clipRule === 'evenodd' ? FillRule.EVENODD : FillRule.NONZERO;
    const inside = pointInPolygonWithRule(centroid, clipPolygon, fillRule);

    // If centroid is inside (1) or on boundary (0), keep this polygon
    if (inside >= 0) {
      result.push(poly);
    }
  }

  return result.length === 1 ? result[0] : result;
}

/**
 * Compute the centroid (center of mass) of a polygon.
 * @private
 */
function computeCentroid(polygon) {
  let cx = new Decimal(0);
  let cy = new Decimal(0);
  let area = new Decimal(0);

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const cross = p1.x.times(p2.y).minus(p2.x.times(p1.y));
    area = area.plus(cross);
    cx = cx.plus(p1.x.plus(p2.x).times(cross));
    cy = cy.plus(p1.y.plus(p2.y).times(cross));
  }

  area = area.div(2);
  if (area.abs().lt(1e-10)) {
    // Degenerate polygon - return average of vertices
    let sumX = new Decimal(0);
    let sumY = new Decimal(0);
    for (const p of polygon) {
      sumX = sumX.plus(p.x);
      sumY = sumY.plus(p.y);
    }
    return PolygonClip.point(sumX.div(polygon.length), sumY.div(polygon.length));
  }

  const factor = new Decimal(1).div(area.times(6));
  return PolygonClip.point(cx.times(factor), cy.times(factor));
}

/**
 * Apply a clipPath to an element, returning the clipped geometry.
 *
 * Performs the complete clipping operation by:
 * 1. Resolving the clipPath definition into a clipping polygon
 * 2. Converting the target element to a polygon
 * 3. Computing the intersection of the two polygons
 *
 * This is the main function for applying clip paths to elements. The result is a
 * polygon representing the visible portion of the element after clipping.
 *
 * The clip-rule property determines how the clipping region is calculated for
 * self-intersecting paths:
 * - 'nonzero' (default): Uses winding number rule (SVG default)
 * - 'evenodd': Uses even-odd rule (creates holes in self-intersecting paths)
 *
 * @param {Object} element - SVG element to be clipped (rect, circle, path, etc.)
 * @param {Object} clipPathDef - clipPath definition object (see resolveClipPath)
 * @param {Matrix|null} [ctm=null] - Current transformation matrix (3x3) to apply
 * @param {Object} [options={}] - Additional options
 * @param {number} [options.samples=20] - Number of sample points per curve segment
 * @param {string} [options.clipRule='nonzero'] - Clip rule: 'nonzero' or 'evenodd'
 * @returns {Array<{x: Decimal, y: Decimal}>} Clipped polygon representing the intersection
 *          of the element and clipPath. Empty array if no intersection or invalid input.
 *
 * @example
 * // Clip a rectangle with a circular clipPath
 * const rect = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
 * const clipDef = {
 *   children: [{ type: 'circle', cx: 50, cy: 50, r: 40 }]
 * };
 * const clipped = applyClipPath(rect, clipDef);
 * // Returns polygon approximating the intersection (rounded corners of rect)
 *
 * @example
 * // Clip with evenodd rule (creates holes in self-intersecting clip paths)
 * const rect = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
 * const clipDef = {
 *   children: [{ type: 'path', d: 'M 0,0 L 100,100 L 100,0 L 0,100 Z' }] // Self-intersecting
 * };
 * const clipped = applyClipPath(rect, clipDef, null, { clipRule: 'evenodd' });
 * // Center region will NOT be clipped (evenodd creates hole there)
 *
 * @example
 * // Clip with objectBoundingBox coordinate system
 * const ellipse = { type: 'ellipse', cx: 100, cy: 100, rx: 80, ry: 60 };
 * const clipDef = {
 *   clipPathUnits: 'objectBoundingBox',
 *   children: [{ type: 'rect', x: 0.25, y: 0.25, width: 0.5, height: 0.5 }]
 * };
 * const clipped = applyClipPath(ellipse, clipDef, null, { samples: 50 });
 */
export function applyClipPath(element, clipPathDef, ctm = null, options = {}) {
  const { samples = DEFAULT_CURVE_SAMPLES, clipRule = 'nonzero' } = options;
  const clipPolygon = resolveClipPath(clipPathDef, element, ctm, options);
  if (clipPolygon.length < 3) return [];

  const elementPolygon = shapeToPolygon(element, ctm, samples);
  if (elementPolygon.length < 3) return [];

  // Use clip-rule aware intersection for self-intersecting clip paths
  return clipPolygonWithRule(elementPolygon, clipPolygon, clipRule);
}

/**
 * Compute the bounding box of an SVG element.
 *
 * For simple shapes (rect, circle, ellipse), the bounding box is computed analytically.
 * For complex shapes (path, polygon, etc.), the element is converted to a polygon and
 * the bounding box is computed from the polygon vertices.
 *
 * This is used when clipPathUnits='objectBoundingBox' to determine the scaling and
 * translation needed to map fractional coordinates to the element's actual bounds.
 *
 * @private
 * @param {Object} element - SVG element object
 * @returns {Object|null} Bounding box {x, y, width, height} with Decimal values, or null if invalid
 *
 * @example
 * const rect = { type: 'rect', x: 10, y: 20, width: 100, height: 50 };
 * const bbox = getElementBoundingBox(rect);
 * // Returns: {x: Decimal(10), y: Decimal(20), width: Decimal(100), height: Decimal(50)}
 *
 * @example
 * const circle = { type: 'circle', cx: 50, cy: 50, r: 25 };
 * const bbox = getElementBoundingBox(circle);
 * // Returns: {x: Decimal(25), y: Decimal(25), width: Decimal(50), height: Decimal(50)}
 */
function getElementBoundingBox(element) {
  switch (element.type) {
    case 'rect':
      return { x: D(element.x || 0), y: D(element.y || 0),
               width: D(element.width || 0), height: D(element.height || 0) };
    case 'circle': {
      const cx = D(element.cx || 0), cy = D(element.cy || 0), r = D(element.r || 0);
      return { x: cx.minus(r), y: cy.minus(r), width: r.mul(2), height: r.mul(2) };
    }
    case 'ellipse': {
      const cx = D(element.cx || 0), cy = D(element.cy || 0);
      const rx = D(element.rx || 0), ry = D(element.ry || 0);
      return { x: cx.minus(rx), y: cy.minus(ry), width: rx.mul(2), height: ry.mul(2) };
    }
    default: {
      const polygon = shapeToPolygon(element, null, 10);
      if (polygon.length > 0) {
        const bbox = PolygonClip.boundingBox(polygon);
        return { x: bbox.minX, y: bbox.minY,
                 width: bbox.maxX.minus(bbox.minX), height: bbox.maxY.minus(bbox.minY) };
      }
      return null;
    }
  }
}

/**
 * Convert a polygon back to SVG path data string.
 *
 * Takes an array of polygon vertices with Decimal coordinates and generates an SVG
 * path data string (d attribute) representing the closed polygon. Coordinates are
 * formatted with the specified precision and trailing zeros are removed.
 *
 * The generated path starts with M (moveto) to the first point, followed by L (lineto)
 * commands for each subsequent point, and ends with Z (closepath).
 *
 * @param {Array<{x: Decimal, y: Decimal}>} polygon - Array of polygon vertices
 * @param {number} [precision=6] - Number of decimal places for coordinate formatting
 * @returns {string} SVG path data string (e.g., "M 0 0 L 100 0 L 100 100 L 0 100 Z")
 *
 * @example
 * const polygon = [
 *   {x: D(0), y: D(0)},
 *   {x: D(100), y: D(0)},
 *   {x: D(100), y: D(100)},
 *   {x: D(0), y: D(100)}
 * ];
 * const pathData = polygonToPathData(polygon);
 * // Returns: "M 0 0 L 100 0 L 100 100 L 0 100 Z"
 *
 * @example
 * // Higher precision for decimal coordinates
 * const polygon = [{x: D('0.123456789'), y: D('0.987654321')}];
 * const pathData = polygonToPathData(polygon, 8);
 * // Returns: "M 0.12345679 0.98765432 Z"
 */
export function polygonToPathData(polygon, precision = 6) {
  if (polygon.length < 2) return '';
  const fmt = n => (n instanceof Decimal ? n : D(n)).toFixed(precision).replace(/\.?0+$/, '');
  let d = `M ${fmt(polygon[0].x)} ${fmt(polygon[0].y)}`;
  for (let i = 1; i < polygon.length; i++) {
    d += ` L ${fmt(polygon[i].x)} ${fmt(polygon[i].y)}`;
  }
  return d + ' Z';
}

/**
 * Resolve nested clipPaths recursively with cycle detection.
 *
 * SVG allows clipPath elements to reference other clipPaths via the clip-path attribute.
 * This function resolves such nested references by:
 * 1. Resolving the current clipPath into a polygon
 * 2. Checking if this clipPath has a clip-path reference
 * 3. If yes, recursively resolving the referenced clipPath
 * 4. Intersecting the two polygons to get the final clip region
 *
 * Cycle detection prevents infinite recursion if clipPaths reference each other circularly.
 *
 * @param {Object} clipPathDef - clipPath definition object
 * @param {string} [clipPathDef.id] - ID of this clipPath (for cycle detection)
 * @param {string} [clipPathDef['clip-path']] - Reference to another clipPath (e.g., "url(#otherClip)")
 * @param {Map<string, Object>} defsMap - Map of clipPath IDs to their definitions
 * @param {Object|null} targetElement - The element being clipped
 * @param {Matrix|null} [ctm=null] - Current transformation matrix (3x3)
 * @param {Set<string>} [visited=new Set()] - Set of visited clipPath IDs for cycle detection
 * @param {Object} [options={}] - Additional options (see resolveClipPath)
 * @returns {Array<{x: Decimal, y: Decimal}>} Resolved clipping polygon (intersection of nested clips)
 *
 * @example
 * // Define two clipPaths where one references the other
 * const defsMap = new Map([
 *   ['clip1', {
 *     id: 'clip1',
 *     children: [{ type: 'circle', cx: 50, cy: 50, r: 40 }],
 *     'clip-path': 'url(#clip2)'
 *   }],
 *   ['clip2', {
 *     id: 'clip2',
 *     children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
 *   }]
 * ]);
 * const target = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
 * const polygon = resolveNestedClipPath(defsMap.get('clip1'), defsMap, target);
 * // Returns intersection of circle and rect
 *
 * @example
 * // Circular reference detection
 * const defsMap = new Map([
 *   ['clip1', { id: 'clip1', children: [...], 'clip-path': 'url(#clip2)' }],
 *   ['clip2', { id: 'clip2', children: [...], 'clip-path': 'url(#clip1)' }]
 * ]);
 * const polygon = resolveNestedClipPath(defsMap.get('clip1'), defsMap, target);
 * // Logs warning about circular reference and returns clip1 polygon only
 */
export function resolveNestedClipPath(clipPathDef, defsMap, targetElement, ctm = null, visited = new Set(), options = {}) {
  const clipId = clipPathDef.id;
  if (clipId && visited.has(clipId)) {
    Logger.warn(`Circular clipPath reference detected: ${clipId}`);
    return [];
  }
  if (clipId) visited.add(clipId);

  let clipPolygon = resolveClipPath(clipPathDef, targetElement, ctm, options);

  if (clipPathDef['clip-path'] && clipPolygon.length >= 3) {
    const nestedRef = clipPathDef['clip-path'].replace(/^url\(#?|[)'"]/g, '');
    const nestedClipDef = defsMap.get(nestedRef);
    if (nestedClipDef) {
      const nestedClip = resolveNestedClipPath(nestedClipDef, defsMap, targetElement, ctm, visited, options);
      if (nestedClip.length >= 3) {
        const intersection = PolygonClip.polygonIntersection(clipPolygon, nestedClip);
        clipPolygon = intersection.length > 0 ? intersection[0] : [];
      }
    }
  }
  return clipPolygon;
}

export default {
  pathToPolygon, shapeToPolygon, resolveClipPath, applyClipPath,
  polygonToPathData, resolveNestedClipPath, DEFAULT_CURVE_SAMPLES
};
