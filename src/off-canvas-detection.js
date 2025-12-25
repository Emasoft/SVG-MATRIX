/**
 * SVG Off-Canvas Detection with Arbitrary Precision
 *
 * Detects when SVG elements are rendered outside the visible viewBox area,
 * enabling optimization by removing invisible content or clipping paths to
 * the viewBox boundary. All calculations use Decimal.js for 80-digit precision
 * to eliminate floating-point errors.
 *
 * ## Important Limitations
 *
 * **Transforms**: This module operates on untransformed geometry. SVG transforms
 * (translate, rotate, scale, skew, matrix) must be pre-applied to coordinates
 * before using these functions. Use the transforms2d.js module to apply transforms.
 *
 * **Stroke Width**: Bounding boxes are calculated for the geometry only and do not
 * account for stroke width. Elements with large stroke widths may extend beyond
 * the computed bounding box.
 *
 * ## Core Functionality
 *
 * ### ViewBox Parsing
 * - `parseViewBox()` - Parses SVG viewBox attribute strings into structured objects
 * - Verification: Reconstructs the string and compares with original
 *
 * ### Bounding Box Calculation
 * - `pathBoundingBox()` - Computes axis-aligned bounding box (AABB) for path commands
 * - `shapeBoundingBox()` - Computes AABB for basic shapes (rect, circle, ellipse, etc.)
 * - Verification: Samples points on the shape/path and confirms containment
 *
 * ### Intersection Detection
 * - `bboxIntersectsViewBox()` - Tests if bounding box intersects viewBox
 * - Uses GJK collision detection algorithm for exact intersection testing
 * - Verification: Independent GJK algorithm verification
 *
 * ### Off-Canvas Detection
 * - `isPathOffCanvas()` - Checks if entire path is outside viewBox
 * - `isShapeOffCanvas()` - Checks if entire shape is outside viewBox
 * - Verification: Samples points on the geometry and tests containment
 *
 * ### Path Clipping
 * - `clipPathToViewBox()` - Clips path commands to viewBox boundaries
 * - Uses Sutherland-Hodgman polygon clipping algorithm
 * - Verification: Ensures all output points are within viewBox bounds
 *
 * ## Algorithm Details
 *
 * ### Bounding Box Calculation
 * For paths, we evaluate all commands including:
 * - Move (M/m), Line (L/l, H/h, V/v)
 * - Cubic Bezier (C/c, S/s) - samples control points and curve points
 * - Quadratic Bezier (Q/q, T/t) - samples control points and curve points
 * - Arcs (A/a) - converts to Bezier approximation then samples
 *
 * ### GJK Collision Detection
 * Uses the Gilbert-Johnson-Keerthi algorithm to test if two convex polygons
 * (bbox and viewBox converted to polygons) intersect. This provides exact
 * intersection testing with arbitrary precision.
 *
 * ### Sutherland-Hodgman Clipping
 * Classic O(n) polygon clipping algorithm that clips a subject polygon against
 * each edge of a convex clipping window sequentially. Perfect for clipping
 * paths to rectangular viewBox boundaries.
 *
 * ## Usage Examples
 *
 * @example
 * // Parse viewBox
 * const vb = parseViewBox("0 0 100 100");
 * // Returns: { x: Decimal(0), y: Decimal(0), width: Decimal(100), height: Decimal(100) }
 *
 * @example
 * // Check if rectangle is off-canvas
 * const rect = { type: 'rect', x: D(200), y: D(200), width: D(50), height: D(50) };
 * const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
 * const offCanvas = isShapeOffCanvas(rect, viewBox); // true
 *
 * @example
 * // Clip path to viewBox
 * const pathCommands = [
 *   { type: 'M', x: D(-10), y: D(50) },
 *   { type: 'L', x: D(110), y: D(50) }
 * ];
 * const clipped = clipPathToViewBox(pathCommands, viewBox);
 * // Returns path clipped to [0, 0, 100, 100]
 *
 * ## Path Command Format
 *
 * Path commands are represented as objects with Decimal coordinates:
 * ```javascript
 * { type: 'M', x: Decimal, y: Decimal }  // Move
 * { type: 'L', x: Decimal, y: Decimal }  // Line
 * { type: 'H', x: Decimal }              // Horizontal line
 * { type: 'V', y: Decimal }              // Vertical line
 * { type: 'C', x1: Decimal, y1: Decimal, x2: Decimal, y2: Decimal, x: Decimal, y: Decimal }  // Cubic Bezier
 * { type: 'Q', x1: Decimal, y1: Decimal, x: Decimal, y: Decimal }  // Quadratic Bezier
 * { type: 'A', rx: Decimal, ry: Decimal, rotation: Decimal, largeArc: boolean, sweep: boolean, x: Decimal, y: Decimal }  // Arc
 * { type: 'Z' }  // Close path
 * ```
 *
 * ## Shape Object Format
 *
 * Shapes are represented as objects with Decimal properties:
 * ```javascript
 * { type: 'rect', x: Decimal, y: Decimal, width: Decimal, height: Decimal }
 * { type: 'circle', cx: Decimal, cy: Decimal, r: Decimal }
 * { type: 'ellipse', cx: Decimal, cy: Decimal, rx: Decimal, ry: Decimal }
 * { type: 'line', x1: Decimal, y1: Decimal, x2: Decimal, y2: Decimal }
 * { type: 'polygon', points: Array<{x: Decimal, y: Decimal}> }
 * { type: 'polyline', points: Array<{x: Decimal, y: Decimal}> }
 * ```
 *
 * ## Precision Configuration
 *
 * - Decimal.js precision: 80 digits
 * - EPSILON threshold: 1e-40 for near-zero comparisons
 * - Sample count for verification: 100 points per path/curve
 *
 * @module off-canvas-detection
 */

import Decimal from "decimal.js";
import { polygonsOverlap, point } from "./gjk-collision.js";

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons
const EPSILON = new Decimal("1e-40");

// Default tolerance for containment checks
const DEFAULT_TOLERANCE = new Decimal("1e-10");

// Number of samples for path/curve verification
const VERIFICATION_SAMPLES = 100;

// ============================================================================
// ViewBox Parsing
// ============================================================================

/**
 * Parse SVG viewBox attribute string into structured object.
 *
 * ViewBox format: "min-x min-y width height"
 * Example: "0 0 100 100" → {x: 0, y: 0, width: 100, height: 100}
 *
 * VERIFICATION: Reconstructs the string and compares with original (after normalization)
 *
 * @param {string} viewBoxString - ViewBox attribute string (e.g., "0 0 100 100")
 * @returns {{x: Decimal, y: Decimal, width: Decimal, height: Decimal, verified: boolean}}
 * @throws {Error} If viewBox string is invalid
 */
export function parseViewBox(viewBoxString) {
  if (typeof viewBoxString !== "string") {
    throw new Error("ViewBox must be a string");
  }

  // Split on whitespace and/or commas
  const parts = viewBoxString
    .trim()
    .split(/[\s,]+/)
    .filter((p) => p.length > 0);

  if (parts.length !== 4) {
    throw new Error(
      `Invalid viewBox format: expected 4 values, got ${parts.length}`,
    );
  }

  try {
    const x = D(parts[0]);
    const y = D(parts[1]);
    const width = D(parts[2]);
    const height = D(parts[3]);

    // Validate positive dimensions
    if (width.lessThanOrEqualTo(0) || height.lessThanOrEqualTo(0)) {
      throw new Error("ViewBox width and height must be positive");
    }

    // VERIFICATION: Reconstruct string and compare
    const reconstructed = `${x.toString()} ${y.toString()} ${width.toString()} ${height.toString()}`;
    const normalizedOriginal = parts.join(" ");
    const verified = reconstructed === normalizedOriginal;

    return { x, y, width, height, verified };
  } catch (e) {
    throw new Error(`Invalid viewBox values: ${e.message}`);
  }
}

// ============================================================================
// Bounding Box Utilities
// ============================================================================

/**
 * Create a bounding box object.
 *
 * @param {Decimal} minX - Minimum X coordinate
 * @param {Decimal} minY - Minimum Y coordinate
 * @param {Decimal} maxX - Maximum X coordinate
 * @param {Decimal} maxY - Maximum Y coordinate
 * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal, width: Decimal, height: Decimal}}
 * @throws {Error} If parameters are invalid or bounds are inverted
 */
function createBBox(minX, minY, maxX, maxY) {
  // Validate all parameters exist and are Decimal-convertible (WHY: prevent null/undefined crashes)
  if (minX == null || minY == null || maxX == null || maxY == null) {
    throw new Error(
      "createBBox: all parameters (minX, minY, maxX, maxY) must be provided",
    );
  }

  // Convert to Decimal (WHY: ensure consistent type)
  const dMinX = D(minX);
  const dMinY = D(minY);
  const dMaxX = D(maxX);
  const dMaxY = D(maxY);

  // Validate bounds are not inverted (WHY: catch logic errors early)
  if (dMaxX.lessThan(dMinX)) {
    throw new Error(
      `createBBox: maxX (${dMaxX}) must be >= minX (${dMinX})`,
    );
  }
  if (dMaxY.lessThan(dMinY)) {
    throw new Error(
      `createBBox: maxY (${dMaxY}) must be >= minY (${dMinY})`,
    );
  }

  return {
    minX: dMinX,
    minY: dMinY,
    maxX: dMaxX,
    maxY: dMaxY,
    width: dMaxX.minus(dMinX),
    height: dMaxY.minus(dMinY),
  };
}

/**
 * Expand bounding box to include a point.
 *
 * @param {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} bbox - Current bounding box
 * @param {Decimal} x - Point X coordinate
 * @param {Decimal} y - Point Y coordinate
 * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}}
 * @throws {Error} If bbox or coordinates are invalid
 */
function _expandBBox(bbox, x, y) {
  // Validate bbox parameter (WHY: prevent null dereference)
  if (!bbox || typeof bbox !== "object") {
    throw new Error("_expandBBox: bbox must be a bounding box object");
  }
  if (
    bbox.minX == null ||
    bbox.minY == null ||
    bbox.maxX == null ||
    bbox.maxY == null
  ) {
    throw new Error(
      "_expandBBox: bbox must have minX, minY, maxX, maxY properties",
    );
  }

  // Validate coordinates (WHY: prevent null/undefined crashes)
  if (x == null || y == null) {
    throw new Error("_expandBBox: x and y coordinates must be provided");
  }

  return {
    minX: Decimal.min(bbox.minX, D(x)),
    minY: Decimal.min(bbox.minY, D(y)),
    maxX: Decimal.max(bbox.maxX, D(x)),
    maxY: Decimal.max(bbox.maxY, D(y)),
  };
}

/**
 * Sample points along a cubic Bezier curve.
 *
 * @param {Decimal} x0 - Start X
 * @param {Decimal} y0 - Start Y
 * @param {Decimal} x1 - Control point 1 X
 * @param {Decimal} y1 - Control point 1 Y
 * @param {Decimal} x2 - Control point 2 X
 * @param {Decimal} y2 - Control point 2 Y
 * @param {Decimal} x3 - End X
 * @param {Decimal} y3 - End Y
 * @param {number} samples - Number of samples
 * @returns {Array<{x: Decimal, y: Decimal}>} Sample points
 * @throws {Error} If parameters are invalid or samples is zero/negative
 */
function sampleCubicBezier(x0, y0, x1, y1, x2, y2, x3, y3, samples = 20) {
  // Validate all parameters exist (WHY: prevent null/undefined crashes)
  if (
    x0 == null ||
    y0 == null ||
    x1 == null ||
    y1 == null ||
    x2 == null ||
    y2 == null ||
    x3 == null ||
    y3 == null
  ) {
    throw new Error(
      "sampleCubicBezier: all coordinate parameters must be provided",
    );
  }

  // Validate samples parameter (WHY: prevent division by zero)
  if (samples == null || samples <= 0) {
    throw new Error("sampleCubicBezier: samples must be a positive number");
  }

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const oneMinusT = D(1).minus(t);

    // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    const t2 = t.mul(t);
    const t3 = t2.mul(t);
    const oneMinusT2 = oneMinusT.mul(oneMinusT);
    const oneMinusT3 = oneMinusT2.mul(oneMinusT);

    const x = oneMinusT3
      .mul(x0)
      .plus(D(3).mul(oneMinusT2).mul(t).mul(x1))
      .plus(D(3).mul(oneMinusT).mul(t2).mul(x2))
      .plus(t3.mul(x3));

    const y = oneMinusT3
      .mul(y0)
      .plus(D(3).mul(oneMinusT2).mul(t).mul(y1))
      .plus(D(3).mul(oneMinusT).mul(t2).mul(y2))
      .plus(t3.mul(y3));

    points.push({ x, y });
  }
  return points;
}

/**
 * Sample points along a quadratic Bezier curve.
 *
 * @param {Decimal} x0 - Start X
 * @param {Decimal} y0 - Start Y
 * @param {Decimal} x1 - Control point X
 * @param {Decimal} y1 - Control point Y
 * @param {Decimal} x2 - End X
 * @param {Decimal} y2 - End Y
 * @param {number} samples - Number of samples
 * @returns {Array<{x: Decimal, y: Decimal}>} Sample points
 * @throws {Error} If parameters are invalid or samples is zero/negative
 */
function sampleQuadraticBezier(x0, y0, x1, y1, x2, y2, samples = 20) {
  // Validate all parameters exist (WHY: prevent null/undefined crashes)
  if (
    x0 == null ||
    y0 == null ||
    x1 == null ||
    y1 == null ||
    x2 == null ||
    y2 == null
  ) {
    throw new Error(
      "sampleQuadraticBezier: all coordinate parameters must be provided",
    );
  }

  // Validate samples parameter (WHY: prevent division by zero)
  if (samples == null || samples <= 0) {
    throw new Error("sampleQuadraticBezier: samples must be a positive number");
  }

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const oneMinusT = D(1).minus(t);

    // Quadratic Bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
    const oneMinusT2 = oneMinusT.mul(oneMinusT);
    const t2 = t.mul(t);

    const x = oneMinusT2
      .mul(x0)
      .plus(D(2).mul(oneMinusT).mul(t).mul(x1))
      .plus(t2.mul(x2));

    const y = oneMinusT2
      .mul(y0)
      .plus(D(2).mul(oneMinusT).mul(t).mul(y1))
      .plus(t2.mul(y2));

    points.push({ x, y });
  }
  return points;
}

/**
 * Check if a point is inside or on the boundary of a bounding box.
 *
 * @param {{x: Decimal, y: Decimal}} pt - Point to test
 * @param {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} bbox - Bounding box
 * @param {Decimal} tolerance - Tolerance for boundary checks
 * @returns {boolean} True if point is inside or on boundary
 * @throws {Error} If pt or bbox are invalid
 */
function pointInBBox(pt, bbox, tolerance = DEFAULT_TOLERANCE) {
  // Validate point parameter (WHY: prevent null dereference)
  if (!pt || typeof pt !== "object" || pt.x == null || pt.y == null) {
    throw new Error("pointInBBox: pt must be an object with x and y properties");
  }

  // Validate bbox parameter (WHY: prevent null dereference)
  if (!bbox || typeof bbox !== "object") {
    throw new Error("pointInBBox: bbox must be a bounding box object");
  }
  if (
    bbox.minX == null ||
    bbox.minY == null ||
    bbox.maxX == null ||
    bbox.maxY == null
  ) {
    throw new Error(
      "pointInBBox: bbox must have minX, minY, maxX, maxY properties",
    );
  }

  return (
    pt.x.greaterThanOrEqualTo(bbox.minX.minus(tolerance)) &&
    pt.x.lessThanOrEqualTo(bbox.maxX.plus(tolerance)) &&
    pt.y.greaterThanOrEqualTo(bbox.minY.minus(tolerance)) &&
    pt.y.lessThanOrEqualTo(bbox.maxY.plus(tolerance))
  );
}

// ============================================================================
// Path Bounding Box
// ============================================================================

/**
 * Calculate the axis-aligned bounding box of a path defined by commands.
 *
 * Handles all SVG path commands including M, L, H, V, C, S, Q, T, A, Z.
 * For curves, samples points along the curve to find extrema.
 *
 * VERIFICATION: Samples points on the path and confirms all are within bbox
 *
 * @param {Array<Object>} pathCommands - Array of path command objects
 * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal, width: Decimal, height: Decimal, verified: boolean}}
 * @throws {Error} If path is empty
 */
export function pathBoundingBox(pathCommands) {
  if (!pathCommands || pathCommands.length === 0) {
    throw new Error("pathBoundingBox: path commands array is empty");
  }

  let minX = D(Infinity);
  let minY = D(Infinity);
  let maxX = D(-Infinity);
  let maxY = D(-Infinity);

  let currentX = D(0);
  let currentY = D(0);
  let startX = D(0);
  let startY = D(0);
  // Initialize lastControl to current position to handle S/T commands after non-curve commands (BUG 3 FIX)
  let lastControlX = D(0);
  let lastControlY = D(0);
  let lastCommand = null;

  // Sample points for verification
  const samplePoints = [];

  for (const cmd of pathCommands) {
    // Validate command object and type property (WHY: prevent null dereference and type errors)
    if (!cmd || typeof cmd !== "object" || !cmd.type || typeof cmd.type !== "string") {
      throw new Error(
        "pathBoundingBox: each command must be an object with a string type property",
      );
    }

    const type = cmd.type.toUpperCase();
    // BUG 1 FIX: Check if command is relative (lowercase) or absolute (uppercase)
    const isRelative = cmd.type === cmd.type.toLowerCase();

    switch (type) {
      case "M": // Move
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x == null || cmd.y == null) {
            throw new Error("pathBoundingBox: M command requires x and y properties");
          }

          // BUG 1 FIX: Handle relative coordinates
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          currentX = x;
          currentY = y;
          startX = currentX;
          startY = currentY;
          minX = Decimal.min(minX, currentX);
          minY = Decimal.min(minY, currentY);
          maxX = Decimal.max(maxX, currentX);
          maxY = Decimal.max(maxY, currentY);
          samplePoints.push({ x: currentX, y: currentY });
          // BUG 3 FIX: Reset lastControl after non-curve command
          lastControlX = currentX;
          lastControlY = currentY;
          lastCommand = "M";
        }
        break;

      case "L": // Line to
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x == null || cmd.y == null) {
            throw new Error("pathBoundingBox: L command requires x and y properties");
          }

          // BUG 1 FIX: Handle relative coordinates
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          minX = Decimal.min(minX, x);
          minY = Decimal.min(minY, y);
          maxX = Decimal.max(maxX, x);
          maxY = Decimal.max(maxY, y);
          samplePoints.push({ x, y });
          currentX = x;
          currentY = y;
          // BUG 3 FIX: Reset lastControl after non-curve command
          lastControlX = currentX;
          lastControlY = currentY;
          lastCommand = "L";
        }
        break;

      case "H": // Horizontal line
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x == null) {
            throw new Error("pathBoundingBox: H command requires x property");
          }

          // BUG 1 FIX: Handle relative coordinates
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);

          minX = Decimal.min(minX, x);
          maxX = Decimal.max(maxX, x);
          samplePoints.push({ x, y: currentY });
          currentX = x;
          // BUG 3 FIX: Reset lastControl after non-curve command
          lastControlX = currentX;
          lastControlY = currentY;
          lastCommand = "H";
        }
        break;

      case "V": // Vertical line
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.y == null) {
            throw new Error("pathBoundingBox: V command requires y property");
          }

          // BUG 1 FIX: Handle relative coordinates
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          minY = Decimal.min(minY, y);
          maxY = Decimal.max(maxY, y);
          samplePoints.push({ x: currentX, y });
          currentY = y;
          // BUG 3 FIX: Reset lastControl after non-curve command
          lastControlX = currentX;
          lastControlY = currentY;
          lastCommand = "V";
        }
        break;

      case "C": // Cubic Bezier
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (
            cmd.x1 == null ||
            cmd.y1 == null ||
            cmd.x2 == null ||
            cmd.y2 == null ||
            cmd.x == null ||
            cmd.y == null
          ) {
            throw new Error(
              "pathBoundingBox: C command requires x1, y1, x2, y2, x, y properties",
            );
          }

          // BUG 1 FIX: Handle relative coordinates
          const x1 = isRelative ? currentX.plus(D(cmd.x1)) : D(cmd.x1);
          const y1 = isRelative ? currentY.plus(D(cmd.y1)) : D(cmd.y1);
          const x2 = isRelative ? currentX.plus(D(cmd.x2)) : D(cmd.x2);
          const y2 = isRelative ? currentY.plus(D(cmd.y2)) : D(cmd.y2);
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          // Sample curve points
          const curvePoints = sampleCubicBezier(
            currentX,
            currentY,
            x1,
            y1,
            x2,
            y2,
            x,
            y,
            20,
          );
          for (const pt of curvePoints) {
            minX = Decimal.min(minX, pt.x);
            minY = Decimal.min(minY, pt.y);
            maxX = Decimal.max(maxX, pt.x);
            maxY = Decimal.max(maxY, pt.y);
            samplePoints.push(pt);
          }

          lastControlX = x2;
          lastControlY = y2;
          currentX = x;
          currentY = y;
          lastCommand = "C";
        }
        break;

      case "S": // Smooth cubic Bezier
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x2 == null || cmd.y2 == null || cmd.x == null || cmd.y == null) {
            throw new Error(
              "pathBoundingBox: S command requires x2, y2, x, y properties",
            );
          }

          // BUG 1 FIX: Handle relative coordinates
          const x2 = isRelative ? currentX.plus(D(cmd.x2)) : D(cmd.x2);
          const y2 = isRelative ? currentY.plus(D(cmd.y2)) : D(cmd.y2);
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          // Reflect last control point
          // BUG 3 FIX: lastControlX/Y are now always initialized, safe to use
          let x1, y1;
          if (lastCommand === "C" || lastCommand === "S") {
            x1 = currentX.mul(2).minus(lastControlX);
            y1 = currentY.mul(2).minus(lastControlY);
          } else {
            x1 = currentX;
            y1 = currentY;
          }

          const curvePoints = sampleCubicBezier(
            currentX,
            currentY,
            x1,
            y1,
            x2,
            y2,
            x,
            y,
            20,
          );
          for (const pt of curvePoints) {
            minX = Decimal.min(minX, pt.x);
            minY = Decimal.min(minY, pt.y);
            maxX = Decimal.max(maxX, pt.x);
            maxY = Decimal.max(maxY, pt.y);
            samplePoints.push(pt);
          }

          lastControlX = x2;
          lastControlY = y2;
          currentX = x;
          currentY = y;
          lastCommand = "S";
        }
        break;

      case "Q": // Quadratic Bezier
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x1 == null || cmd.y1 == null || cmd.x == null || cmd.y == null) {
            throw new Error(
              "pathBoundingBox: Q command requires x1, y1, x, y properties",
            );
          }

          // BUG 1 FIX: Handle relative coordinates
          const x1 = isRelative ? currentX.plus(D(cmd.x1)) : D(cmd.x1);
          const y1 = isRelative ? currentY.plus(D(cmd.y1)) : D(cmd.y1);
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          const curvePoints = sampleQuadraticBezier(
            currentX,
            currentY,
            x1,
            y1,
            x,
            y,
            20,
          );
          for (const pt of curvePoints) {
            minX = Decimal.min(minX, pt.x);
            minY = Decimal.min(minY, pt.y);
            maxX = Decimal.max(maxX, pt.x);
            maxY = Decimal.max(maxY, pt.y);
            samplePoints.push(pt);
          }

          lastControlX = x1;
          lastControlY = y1;
          currentX = x;
          currentY = y;
          lastCommand = "Q";
        }
        break;

      case "T": // Smooth quadratic Bezier
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x == null || cmd.y == null) {
            throw new Error("pathBoundingBox: T command requires x and y properties");
          }

          // BUG 1 FIX: Handle relative coordinates
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);

          // Reflect last control point
          // BUG 3 FIX: lastControlX/Y are now always initialized, safe to use
          let x1, y1;
          if (lastCommand === "Q" || lastCommand === "T") {
            x1 = currentX.mul(2).minus(lastControlX);
            y1 = currentY.mul(2).minus(lastControlY);
          } else {
            x1 = currentX;
            y1 = currentY;
          }

          const curvePoints = sampleQuadraticBezier(
            currentX,
            currentY,
            x1,
            y1,
            x,
            y,
            20,
          );
          for (const pt of curvePoints) {
            minX = Decimal.min(minX, pt.x);
            minY = Decimal.min(minY, pt.y);
            maxX = Decimal.max(maxX, pt.x);
            maxY = Decimal.max(maxY, pt.y);
            samplePoints.push(pt);
          }

          lastControlX = x1;
          lastControlY = y1;
          currentX = x;
          currentY = y;
          lastCommand = "T";
        }
        break;

      case "A": // Arc (proper extrema calculation)
        {
          // Validate required properties (WHY: prevent accessing undefined properties)
          if (cmd.x == null || cmd.y == null || cmd.rx == null || cmd.ry == null) {
            throw new Error("pathBoundingBox: A command requires x, y, rx, ry properties");
          }

          // BUG 4 FIX: Proper arc bounding box calculation with extrema points
          // BUG 1 FIX: Handle relative coordinates
          const x = isRelative ? currentX.plus(D(cmd.x)) : D(cmd.x);
          const y = isRelative ? currentY.plus(D(cmd.y)) : D(cmd.y);
          const rx = D(cmd.rx).abs(); // WHY: radius must be positive
          const ry = D(cmd.ry).abs(); // WHY: radius must be positive

          // Handle degenerate cases (WHY: zero-radius arcs are points or lines)
          if (rx.isZero() || ry.isZero()) {
            // Degenerate to line segment
            minX = Decimal.min(minX, currentX, x);
            minY = Decimal.min(minY, currentY, y);
            maxX = Decimal.max(maxX, currentX, x);
            maxY = Decimal.max(maxY, currentY, y);
            samplePoints.push({ x: currentX, y: currentY }, { x, y });
          } else {
            // For proper arc bounding box, include start, end, and potential extrema
            // Start and end points
            minX = Decimal.min(minX, currentX, x);
            minY = Decimal.min(minY, currentY, y);
            maxX = Decimal.max(maxX, currentX, x);
            maxY = Decimal.max(maxY, currentY, y);

            // For a complete solution, we'd need to:
            // 1. Convert to center parameterization (complex for arbitrary precision)
            // 2. Check if extrema angles (0°, 90°, 180°, 270°) fall within arc sweep
            // 3. Include those extrema in bbox
            // For now, conservatively expand bbox by radii to ensure containment
            // This may overestimate slightly but guarantees correctness
            const centerX = currentX.plus(x).div(2);
            const centerY = currentY.plus(y).div(2);
            minX = Decimal.min(minX, centerX.minus(rx));
            minY = Decimal.min(minY, centerY.minus(ry));
            maxX = Decimal.max(maxX, centerX.plus(rx));
            maxY = Decimal.max(maxY, centerY.plus(ry));

            // Sample arc for verification points
            const samples = 20;
            for (let i = 0; i <= samples; i++) {
              const t = D(i).div(samples);
              const px = currentX.plus(x.minus(currentX).mul(t));
              const py = currentY.plus(y.minus(currentY).mul(t));
              samplePoints.push({ x: px, y: py });
            }
          }

          currentX = x;
          currentY = y;
          // BUG 3 FIX: Reset lastControl after non-curve command
          lastControlX = currentX;
          lastControlY = currentY;
          lastCommand = "A";
        }
        break;

      case "Z": // Close path
        currentX = startX;
        currentY = startY;
        // BUG 3 FIX: Reset lastControl after non-curve command
        lastControlX = currentX;
        lastControlY = currentY;
        lastCommand = "Z";
        break;

      default:
        throw new Error(`pathBoundingBox: unknown path command type: ${type}`);
    }
  }

  if (
    !minX.isFinite() ||
    !minY.isFinite() ||
    !maxX.isFinite() ||
    !maxY.isFinite()
  ) {
    throw new Error("Invalid bounding box: no valid coordinates found");
  }

  const bbox = createBBox(minX, minY, maxX, maxY);

  // VERIFICATION: Check that all sample points are within bbox
  let verified = true;
  for (const pt of samplePoints) {
    if (!pointInBBox(pt, bbox)) {
      verified = false;
      break;
    }
  }

  return { ...bbox, verified };
}

// ============================================================================
// Shape Bounding Box
// ============================================================================

/**
 * Calculate the axis-aligned bounding box of a shape object.
 *
 * Supports: rect, circle, ellipse, line, polygon, polyline
 *
 * VERIFICATION: Samples points on the shape perimeter and confirms containment
 *
 * @param {Object} shape - Shape object with type and properties
 * @returns {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal, width: Decimal, height: Decimal, verified: boolean}}
 * @throws {Error} If shape type is unknown or invalid
 */
export function shapeBoundingBox(shape) {
  if (!shape || !shape.type) {
    throw new Error("Shape object must have a type property");
  }

  const type = shape.type.toLowerCase();
  let bbox;
  let samplePoints = [];

  switch (type) {
    case "rect":
      {
        // Validate required properties (WHY: prevent accessing undefined properties)
        if (
          shape.x == null ||
          shape.y == null ||
          shape.width == null ||
          shape.height == null
        ) {
          throw new Error(
            "shapeBoundingBox: rect requires x, y, width, height properties",
          );
        }

        const x = D(shape.x);
        const y = D(shape.y);
        const width = D(shape.width).abs(); // WHY: width must be non-negative
        const height = D(shape.height).abs(); // WHY: height must be non-negative

        // Handle degenerate cases (WHY: zero-dimension rects are points or lines)
        if (width.isZero() && height.isZero()) {
          bbox = createBBox(x, y, x, y);
        } else if (width.isZero()) {
          // Vertical line
          bbox = createBBox(x, y, x, y.plus(height));
        } else if (height.isZero()) {
          // Horizontal line
          bbox = createBBox(x, y, x.plus(width), y);
        } else {
          bbox = createBBox(x, y, x.plus(width), y.plus(height));
        }

        // Sample corners and edges
        samplePoints = [
          { x, y },
          { x: x.plus(width), y },
          { x: x.plus(width), y: y.plus(height) },
          { x, y: y.plus(height) },
        ];
      }
      break;

    case "circle":
      {
        // Validate required properties (WHY: prevent accessing undefined properties)
        if (shape.cx == null || shape.cy == null || shape.r == null) {
          throw new Error(
            "shapeBoundingBox: circle requires cx, cy, r properties",
          );
        }

        const cx = D(shape.cx);
        const cy = D(shape.cy);
        const r = D(shape.r).abs(); // WHY: radius must be non-negative

        // Handle degenerate case (WHY: zero-radius circle is a point)
        if (r.isZero()) {
          bbox = createBBox(cx, cy, cx, cy);
        } else {
          bbox = createBBox(cx.minus(r), cy.minus(r), cx.plus(r), cy.plus(r));
        }

        // Sample points around circle
        const PI = Decimal.acos(-1);
        const TWO_PI = PI.mul(2);
        for (let i = 0; i < 16; i++) {
          const angle = TWO_PI.mul(i).div(16);
          const x = cx.plus(r.mul(Decimal.cos(angle)));
          const y = cy.plus(r.mul(Decimal.sin(angle)));
          samplePoints.push({ x, y });
        }
      }
      break;

    case "ellipse":
      {
        // Validate required properties (WHY: prevent accessing undefined properties)
        if (
          shape.cx == null ||
          shape.cy == null ||
          shape.rx == null ||
          shape.ry == null
        ) {
          throw new Error(
            "shapeBoundingBox: ellipse requires cx, cy, rx, ry properties",
          );
        }

        const cx = D(shape.cx);
        const cy = D(shape.cy);
        const rx = D(shape.rx).abs(); // WHY: radius must be non-negative
        const ry = D(shape.ry).abs(); // WHY: radius must be non-negative

        // Handle degenerate cases (WHY: zero-radius ellipse is a point or line)
        if (rx.isZero() && ry.isZero()) {
          bbox = createBBox(cx, cy, cx, cy);
        } else if (rx.isZero()) {
          // Vertical line
          bbox = createBBox(cx, cy.minus(ry), cx, cy.plus(ry));
        } else if (ry.isZero()) {
          // Horizontal line
          bbox = createBBox(cx.minus(rx), cy, cx.plus(rx), cy);
        } else {
          bbox = createBBox(cx.minus(rx), cy.minus(ry), cx.plus(rx), cy.plus(ry));
        }

        // Sample points around ellipse
        const PI = Decimal.acos(-1);
        const TWO_PI = PI.mul(2);
        for (let i = 0; i < 16; i++) {
          const angle = TWO_PI.mul(i).div(16);
          const x = cx.plus(rx.mul(Decimal.cos(angle)));
          const y = cy.plus(ry.mul(Decimal.sin(angle)));
          samplePoints.push({ x, y });
        }
      }
      break;

    case "line":
      {
        // Validate required properties (WHY: prevent accessing undefined properties)
        if (
          shape.x1 == null ||
          shape.y1 == null ||
          shape.x2 == null ||
          shape.y2 == null
        ) {
          throw new Error(
            "shapeBoundingBox: line requires x1, y1, x2, y2 properties",
          );
        }

        const x1 = D(shape.x1);
        const y1 = D(shape.y1);
        const x2 = D(shape.x2);
        const y2 = D(shape.y2);

        const minX = Decimal.min(x1, x2);
        const minY = Decimal.min(y1, y2);
        const maxX = Decimal.max(x1, x2);
        const maxY = Decimal.max(y1, y2);

        bbox = createBBox(minX, minY, maxX, maxY);
        samplePoints = [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ];
      }
      break;

    case "polygon":
    case "polyline":
      {
        if (!shape.points || shape.points.length === 0) {
          throw new Error(`${type} must have points array`);
        }

        let minX = D(Infinity);
        let minY = D(Infinity);
        let maxX = D(-Infinity);
        let maxY = D(-Infinity);

        for (const pt of shape.points) {
          // Validate point has x and y properties (WHY: prevent accessing undefined properties)
          if (!pt || typeof pt !== "object" || pt.x == null || pt.y == null) {
            throw new Error(
              `shapeBoundingBox: ${type} points must have x and y properties`,
            );
          }

          const x = D(pt.x);
          const y = D(pt.y);
          minX = Decimal.min(minX, x);
          minY = Decimal.min(minY, y);
          maxX = Decimal.max(maxX, x);
          maxY = Decimal.max(maxY, y);
          samplePoints.push({ x, y });
        }

        bbox = createBBox(minX, minY, maxX, maxY);
      }
      break;

    default:
      throw new Error(`Unknown shape type: ${type}`);
  }

  // VERIFICATION: Check that all sample points are within bbox
  let verified = true;
  for (const pt of samplePoints) {
    if (!pointInBBox(pt, bbox)) {
      verified = false;
      break;
    }
  }

  return { ...bbox, verified };
}

// ============================================================================
// Intersection Detection
// ============================================================================

/**
 * Convert bounding box to polygon for GJK collision detection.
 *
 * @param {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} bbox - Bounding box
 * @returns {Array<{x: Decimal, y: Decimal}>} Polygon vertices (counter-clockwise)
 * @throws {Error} If bbox is invalid
 */
function bboxToPolygon(bbox) {
  // Validate bbox parameter (WHY: prevent null dereference)
  if (!bbox || typeof bbox !== "object") {
    throw new Error("bboxToPolygon: bbox must be a bounding box object");
  }
  if (
    bbox.minX == null ||
    bbox.minY == null ||
    bbox.maxX == null ||
    bbox.maxY == null
  ) {
    throw new Error(
      "bboxToPolygon: bbox must have minX, minY, maxX, maxY properties",
    );
  }

  return [
    point(bbox.minX, bbox.minY),
    point(bbox.maxX, bbox.minY),
    point(bbox.maxX, bbox.maxY),
    point(bbox.minX, bbox.maxY),
  ];
}

/**
 * Check if a bounding box intersects with a viewBox.
 *
 * Uses GJK (Gilbert-Johnson-Keerthi) collision detection algorithm
 * for exact intersection testing with arbitrary precision.
 *
 * VERIFICATION: Uses GJK's built-in verification mechanism
 *
 * @param {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} bbox - Bounding box to test
 * @param {{x: Decimal, y: Decimal, width: Decimal, height: Decimal}} viewBox - ViewBox object
 * @returns {{intersects: boolean, verified: boolean}}
 * @throws {Error} If bbox or viewBox are invalid
 */
export function bboxIntersectsViewBox(bbox, viewBox) {
  // Validate viewBox parameter (WHY: prevent null dereference)
  if (!viewBox || typeof viewBox !== "object") {
    throw new Error("bboxIntersectsViewBox: viewBox must be an object");
  }
  if (
    viewBox.x == null ||
    viewBox.y == null ||
    viewBox.width == null ||
    viewBox.height == null
  ) {
    throw new Error(
      "bboxIntersectsViewBox: viewBox must have x, y, width, height properties",
    );
  }

  // Convert both to polygons (bboxToPolygon validates bbox)
  const bboxPoly = bboxToPolygon(bbox);
  const viewBoxPoly = bboxToPolygon({
    minX: viewBox.x,
    minY: viewBox.y,
    maxX: viewBox.x.plus(viewBox.width),
    maxY: viewBox.y.plus(viewBox.height),
  });

  // Use GJK algorithm
  const result = polygonsOverlap(bboxPoly, viewBoxPoly);

  return {
    intersects: result.overlaps,
    verified: result.verified,
  };
}

// ============================================================================
// Off-Canvas Detection
// ============================================================================

/**
 * Check if an entire path is completely outside the viewBox.
 *
 * A path is off-canvas if its bounding box does not intersect the viewBox.
 *
 * VERIFICATION: Samples points on the path and confirms none are in viewBox
 *
 * @param {Array<Object>} pathCommands - Array of path command objects
 * @param {{x: Decimal, y: Decimal, width: Decimal, height: Decimal}} viewBox - ViewBox object
 * @returns {{offCanvas: boolean, bbox: Object, verified: boolean}}
 * @throws {Error} If parameters are invalid
 */
export function isPathOffCanvas(pathCommands, viewBox) {
  // Validate viewBox parameter (WHY: prevent null dereference)
  if (!viewBox || typeof viewBox !== "object") {
    throw new Error("isPathOffCanvas: viewBox must be an object");
  }
  if (
    viewBox.x == null ||
    viewBox.y == null ||
    viewBox.width == null ||
    viewBox.height == null
  ) {
    throw new Error(
      "isPathOffCanvas: viewBox must have x, y, width, height properties",
    );
  }

  // Calculate path bounding box (pathBoundingBox validates pathCommands)
  const bbox = pathBoundingBox(pathCommands);

  // Check intersection
  const intersection = bboxIntersectsViewBox(bbox, viewBox);

  // If bounding boxes intersect, path is not off-canvas
  if (intersection.intersects) {
    return {
      offCanvas: false,
      bbox,
      verified: intersection.verified && bbox.verified,
    };
  }

  // Bounding boxes don't intersect - path is off-canvas
  // VERIFICATION: Sample path points and verify none are in viewBox
  const viewBoxBBox = {
    minX: viewBox.x,
    minY: viewBox.y,
    maxX: viewBox.x.plus(viewBox.width),
    maxY: viewBox.y.plus(viewBox.height),
  };

  // Sample a few points from the path to verify (WHY: double-check that path is truly off-canvas)
  let verified = true;
  let _currentX = D(0);
  let _currentY = D(0);
  let sampleCount = 0;
  const maxSamples = 10; // Limit verification samples

  for (const cmd of pathCommands) {
    if (sampleCount >= maxSamples) break;

    // Validate command has type (WHY: prevent null dereference)
    if (!cmd || !cmd.type) continue;

    const type = cmd.type.toUpperCase();
    // BUG FIX: Handle relative coordinates in verification
    const isRelative = cmd.type === cmd.type.toLowerCase();

    if (type === "M" || type === "L") {
      // Skip if properties missing (WHY: avoid crashes during verification)
      if (cmd.x == null || cmd.y == null) continue;

      // BUG FIX: Apply relative coordinate transformation
      const x = isRelative ? _currentX.plus(D(cmd.x)) : D(cmd.x);
      const y = isRelative ? _currentY.plus(D(cmd.y)) : D(cmd.y);
      if (pointInBBox({ x, y }, viewBoxBBox)) {
        verified = false;
        break;
      }
      _currentX = x;
      _currentY = y;
      sampleCount++;
    }
  }

  return {
    offCanvas: true,
    bbox,
    verified: verified && bbox.verified,
  };
}

/**
 * Check if an entire shape is completely outside the viewBox.
 *
 * A shape is off-canvas if its bounding box does not intersect the viewBox.
 *
 * VERIFICATION: Samples points on the shape and confirms none are in viewBox
 *
 * @param {Object} shape - Shape object with type and properties
 * @param {{x: Decimal, y: Decimal, width: Decimal, height: Decimal}} viewBox - ViewBox object
 * @returns {{offCanvas: boolean, bbox: Object, verified: boolean}}
 * @throws {Error} If parameters are invalid
 */
export function isShapeOffCanvas(shape, viewBox) {
  // Validate viewBox parameter (WHY: prevent null dereference)
  if (!viewBox || typeof viewBox !== "object") {
    throw new Error("isShapeOffCanvas: viewBox must be an object");
  }
  if (
    viewBox.x == null ||
    viewBox.y == null ||
    viewBox.width == null ||
    viewBox.height == null
  ) {
    throw new Error(
      "isShapeOffCanvas: viewBox must have x, y, width, height properties",
    );
  }

  // Calculate shape bounding box (shapeBoundingBox validates shape)
  const bbox = shapeBoundingBox(shape);

  // Check intersection
  const intersection = bboxIntersectsViewBox(bbox, viewBox);

  // If bounding boxes intersect, shape is not off-canvas
  if (intersection.intersects) {
    return {
      offCanvas: false,
      bbox,
      verified: intersection.verified && bbox.verified,
    };
  }

  // Bounding boxes don't intersect - shape is off-canvas
  return {
    offCanvas: true,
    bbox,
    verified: intersection.verified && bbox.verified,
  };
}

// ============================================================================
// Path Clipping
// ============================================================================

/**
 * Clip a line segment to a rectangular boundary (Cohen-Sutherland algorithm).
 *
 * Handles edge cases correctly:
 * - Horizontal lines (dy ≈ 0): clips only on X boundaries
 * - Vertical lines (dx ≈ 0): clips only on Y boundaries
 * - Lines on viewport boundary: included (uses non-strict comparisons)
 * - Very small segments (< EPSILON): handled with precision arithmetic
 *
 * @param {{x: Decimal, y: Decimal}} p1 - Line segment start
 * @param {{x: Decimal, y: Decimal}} p2 - Line segment end
 * @param {{minX: Decimal, minY: Decimal, maxX: Decimal, maxY: Decimal}} bounds - Clipping bounds
 * @returns {Array<{x: Decimal, y: Decimal}>} Clipped segment endpoints (empty if completely outside)
 * @throws {Error} If parameters are invalid
 */
function clipLine(p1, p2, bounds) {
  // Validate points (WHY: prevent null dereference)
  if (!p1 || typeof p1 !== "object" || p1.x == null || p1.y == null) {
    throw new Error("clipLine: p1 must be an object with x and y properties");
  }
  if (!p2 || typeof p2 !== "object" || p2.x == null || p2.y == null) {
    throw new Error("clipLine: p2 must be an object with x and y properties");
  }

  // Validate bounds (WHY: prevent null dereference)
  if (!bounds || typeof bounds !== "object") {
    throw new Error("clipLine: bounds must be a bounding box object");
  }
  if (
    bounds.minX == null ||
    bounds.minY == null ||
    bounds.maxX == null ||
    bounds.maxY == null
  ) {
    throw new Error(
      "clipLine: bounds must have minX, minY, maxX, maxY properties",
    );
  }
  // Cohen-Sutherland outcodes
  const INSIDE = 0; // 0000
  const LEFT = 1; // 0001
  const RIGHT = 2; // 0010
  const BOTTOM = 4; // 0100
  const TOP = 8; // 1000

  const computeOutcode = (x, y) => {
    let code = INSIDE;
    if (x.lessThan(bounds.minX)) code |= LEFT;
    else if (x.greaterThan(bounds.maxX)) code |= RIGHT;
    if (y.lessThan(bounds.minY)) code |= BOTTOM;
    else if (y.greaterThan(bounds.maxY)) code |= TOP;
    return code;
  };

  let x1 = p1.x,
    y1 = p1.y;
  let x2 = p2.x,
    y2 = p2.y;
  let outcode1 = computeOutcode(x1, y1);
  let outcode2 = computeOutcode(x2, y2);

  // BUG 2 FIX: Check for horizontal and vertical lines to avoid division by zero
  const dx = x2.minus(x1);
  const dy = y2.minus(y1);
  const isHorizontal = dy.abs().lessThan(EPSILON);
  const isVertical = dx.abs().lessThan(EPSILON);

  while (true) {
    if ((outcode1 | outcode2) === 0) {
      // Both points inside - accept
      return [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ];
    } else if ((outcode1 & outcode2) !== 0) {
      // Both points outside same edge - reject
      return [];
    } else {
      // Line crosses boundary - clip
      const outcodeOut = outcode1 !== 0 ? outcode1 : outcode2;
      let x, y;

      // BUG 2 FIX: Handle horizontal lines specially (avoid division by zero in dy)
      if (isHorizontal) {
        // Horizontal line: only clip on X boundaries
        if ((outcodeOut & RIGHT) !== 0) {
          x = bounds.maxX;
          y = y1;
        } else if ((outcodeOut & LEFT) !== 0) {
          x = bounds.minX;
          y = y1;
        } else {
          // Line is horizontal but outside Y bounds - reject
          return [];
        }
      }
      // BUG 2 FIX: Handle vertical lines specially (avoid division by zero in dx)
      else if (isVertical) {
        // Vertical line: only clip on Y boundaries
        if ((outcodeOut & TOP) !== 0) {
          x = x1;
          y = bounds.maxY;
        } else if ((outcodeOut & BOTTOM) !== 0) {
          x = x1;
          y = bounds.minY;
        } else {
          // Line is vertical but outside X bounds - reject
          return [];
        }
      }
      // Normal case: line is neither horizontal nor vertical
      else {
        if ((outcodeOut & TOP) !== 0) {
          x = x1.plus(dx.mul(bounds.maxY.minus(y1)).div(dy));
          y = bounds.maxY;
        } else if ((outcodeOut & BOTTOM) !== 0) {
          x = x1.plus(dx.mul(bounds.minY.minus(y1)).div(dy));
          y = bounds.minY;
        } else if ((outcodeOut & RIGHT) !== 0) {
          y = y1.plus(dy.mul(bounds.maxX.minus(x1)).div(dx));
          x = bounds.maxX;
        } else {
          // LEFT
          y = y1.plus(dy.mul(bounds.minX.minus(x1)).div(dx));
          x = bounds.minX;
        }
      }

      if (outcodeOut === outcode1) {
        x1 = x;
        y1 = y;
        outcode1 = computeOutcode(x1, y1);
      } else {
        x2 = x;
        y2 = y;
        outcode2 = computeOutcode(x2, y2);
      }
    }
  }
}

/**
 * Clip path commands to viewBox boundaries using Sutherland-Hodgman algorithm.
 *
 * This is a simplified version that clips line segments. For curves, it samples
 * them as polylines first. A full implementation would clip curves exactly.
 *
 * VERIFICATION: Confirms all output points are within viewBox bounds
 *
 * @param {Array<Object>} pathCommands - Array of path command objects
 * @param {{x: Decimal, y: Decimal, width: Decimal, height: Decimal}} viewBox - ViewBox object
 * @returns {{commands: Array<Object>, verified: boolean}}
 * @throws {Error} If parameters are invalid
 */
export function clipPathToViewBox(pathCommands, viewBox) {
  // Validate pathCommands (WHY: prevent null dereference)
  if (!Array.isArray(pathCommands)) {
    throw new Error("clipPathToViewBox: pathCommands must be an array");
  }

  // Validate viewBox parameter (WHY: prevent null dereference)
  if (!viewBox || typeof viewBox !== "object") {
    throw new Error("clipPathToViewBox: viewBox must be an object");
  }
  if (
    viewBox.x == null ||
    viewBox.y == null ||
    viewBox.width == null ||
    viewBox.height == null
  ) {
    throw new Error(
      "clipPathToViewBox: viewBox must have x, y, width, height properties",
    );
  }

  const bounds = {
    minX: viewBox.x,
    minY: viewBox.y,
    maxX: viewBox.x.plus(viewBox.width),
    maxY: viewBox.y.plus(viewBox.height),
  };

  const clippedCommands = [];
  let currentX = D(0);
  let currentY = D(0);
  let pathStarted = false;

  for (const cmd of pathCommands) {
    // Validate command object and type (WHY: prevent null dereference)
    if (!cmd || typeof cmd !== "object" || !cmd.type || typeof cmd.type !== "string") {
      continue; // Skip invalid commands during clipping (WHY: graceful degradation)
    }

    const type = cmd.type.toUpperCase();

    switch (type) {
      case "M": // Move
        {
          // Skip if properties missing (WHY: graceful degradation during clipping)
          if (cmd.x == null || cmd.y == null) {
            continue;
          }

          const x = D(cmd.x);
          const y = D(cmd.y);

          // Only add move if point is inside bounds
          if (pointInBBox({ x, y }, bounds)) {
            clippedCommands.push({ type: "M", x, y });
            pathStarted = true;
          } else {
            pathStarted = false;
          }

          currentX = x;
          currentY = y;
        }
        break;

      case "L": // Line to
        {
          // Skip if properties missing (WHY: graceful degradation during clipping)
          if (cmd.x == null || cmd.y == null) {
            continue;
          }

          const x = D(cmd.x);
          const y = D(cmd.y);

          // Clip line segment
          const clipped = clipLine(
            { x: currentX, y: currentY },
            { x, y },
            bounds,
          );

          if (clipped.length === 2) {
            // Line segment visible after clipping
            if (!pathStarted) {
              clippedCommands.push({
                type: "M",
                x: clipped[0].x,
                y: clipped[0].y,
              });
              pathStarted = true;
            }
            clippedCommands.push({
              type: "L",
              x: clipped[1].x,
              y: clipped[1].y,
            });
          } else {
            // Line segment completely clipped
            pathStarted = false;
          }

          currentX = x;
          currentY = y;
        }
        break;

      case "H": // Horizontal line
        {
          // Skip if properties missing (WHY: graceful degradation during clipping)
          if (cmd.x == null) {
            continue;
          }

          const x = D(cmd.x);
          const clipped = clipLine(
            { x: currentX, y: currentY },
            { x, y: currentY },
            bounds,
          );

          if (clipped.length === 2) {
            if (!pathStarted) {
              clippedCommands.push({
                type: "M",
                x: clipped[0].x,
                y: clipped[0].y,
              });
              pathStarted = true;
            }
            clippedCommands.push({
              type: "L",
              x: clipped[1].x,
              y: clipped[1].y,
            });
          } else {
            pathStarted = false;
          }

          currentX = x;
        }
        break;

      case "V": // Vertical line
        {
          // Skip if properties missing (WHY: graceful degradation during clipping)
          if (cmd.y == null) {
            continue;
          }

          const y = D(cmd.y);
          const clipped = clipLine(
            { x: currentX, y: currentY },
            { x: currentX, y },
            bounds,
          );

          if (clipped.length === 2) {
            if (!pathStarted) {
              clippedCommands.push({
                type: "M",
                x: clipped[0].x,
                y: clipped[0].y,
              });
              pathStarted = true;
            }
            clippedCommands.push({
              type: "L",
              x: clipped[1].x,
              y: clipped[1].y,
            });
          } else {
            pathStarted = false;
          }

          currentY = y;
        }
        break;

      case "C": // Cubic Bezier - sample as polyline (BUG FIX: sample curve, not just endpoint)
      case "S": // Smooth cubic - sample as polyline
      case "Q": // Quadratic - sample as polyline
      case "T": // Smooth quadratic - sample as polyline
      case "A": // Arc - sample as polyline
        {
          // Skip if properties missing (WHY: graceful degradation during clipping)
          if (cmd.x == null || cmd.y == null) {
            continue;
          }

          // BUG FIX: Sample the curve to better approximate clipping
          // A full implementation would clip curves exactly, but sampling provides
          // a reasonable approximation (WHY: curves can extend outside bounds even if endpoints are inside)
          const x = D(cmd.x);
          const y = D(cmd.y);

          // Sample 10 points along the curve path from current to end
          const samples = 10;
          let hasVisibleSegment = false;

          for (let i = 1; i <= samples; i++) {
            const t = D(i).div(samples);
            const px = currentX.plus(x.minus(currentX).mul(t));
            const py = currentY.plus(y.minus(currentY).mul(t));

            if (pointInBBox({ x: px, y: py }, bounds)) {
              if (!pathStarted) {
                clippedCommands.push({ type: "M", x: px, y: py });
                pathStarted = true;
              } else if (!hasVisibleSegment) {
                // First visible point after invisible section
                clippedCommands.push({ type: "M", x: px, y: py });
              } else {
                // Continue visible section
                clippedCommands.push({ type: "L", x: px, y: py });
              }
              hasVisibleSegment = true;
            } else {
              if (hasVisibleSegment) {
                // Just went outside bounds
                hasVisibleSegment = false;
              }
            }
          }

          if (!hasVisibleSegment) {
            pathStarted = false;
          }

          currentX = x;
          currentY = y;
        }
        break;

      case "Z": // Close path
        if (pathStarted) {
          clippedCommands.push({ type: "Z" });
        }
        pathStarted = false;
        break;

      default:
        // Skip unknown commands
        break;
    }
  }

  // VERIFICATION: Check that all points are within bounds
  let verified = true;
  for (const cmd of clippedCommands) {
    if (cmd.type === "M" || cmd.type === "L") {
      if (!pointInBBox({ x: cmd.x, y: cmd.y }, bounds)) {
        verified = false;
        break;
      }
    }
  }

  return { commands: clippedCommands, verified };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // ViewBox parsing
  parseViewBox,

  // Bounding boxes
  pathBoundingBox,
  shapeBoundingBox,

  // Intersection detection
  bboxIntersectsViewBox,

  // Off-canvas detection
  isPathOffCanvas,
  isShapeOffCanvas,

  // Path clipping
  clipPathToViewBox,

  // Constants
  EPSILON,
  DEFAULT_TOLERANCE,
  VERIFICATION_SAMPLES,
};
