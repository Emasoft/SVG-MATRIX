/**
 * Path Data Plugins - Individual SVGO-style optimization functions
 *
 * Each function performs ONE specific optimization on path data.
 * This mirrors SVGO's plugin architecture where each plugin does exactly one thing.
 *
 * ALL CURVE CONVERSIONS ARE MATHEMATICALLY VERIFIED:
 * - Curves are sampled at multiple t values (0.1, 0.2, ..., 0.9)
 * - Actual curve points are compared, NOT control points
 * - Conversion only happens if ALL sampled points are within tolerance
 * - This guarantees visual fidelity within the specified tolerance
 *
 * PLUGIN CATEGORIES:
 *
 * ENCODING ONLY (No geometry changes):
 *   - removeLeadingZero     - 0.5 -> .5
 *   - negativeExtraSpace    - uses negative as delimiter
 *   - convertToRelative     - absolute -> relative commands
 *   - convertToAbsolute     - relative -> absolute commands
 *   - lineShorthands        - L -> H/V when horizontal/vertical
 *   - convertToZ            - final L to start -> z
 *   - collapseRepeated      - removes redundant command letters
 *   - floatPrecision        - rounds numbers
 *   - arcShorthands         - normalizes arc angles
 *
 * CURVE SIMPLIFICATION (Verified within tolerance):
 *   - straightCurves          - C -> L when curve is within tolerance of line
 *   - convertCubicToQuadratic - C -> Q when curves match within tolerance
 *   - convertCubicToSmooth    - C -> S when control point is reflection
 *   - convertQuadraticToSmooth - Q -> T when control point is reflection
 *   - removeUselessCommands   - removes zero-length segments
 *
 * @module path-data-plugins
 */

import {
  parsePath,
  serializePath,
  toAbsolute,
  toRelative,
  formatNumber,
} from "./convert-path-data.js";

// ============================================================================
// INPUT VALIDATION HELPERS
// ============================================================================

/**
 * Validate path string input - fail fast on invalid input
 * @param {string} d - Path d attribute to validate
 * @throws {TypeError} If d is not a valid string
 */
function validatePathString(d) {
  if (typeof d !== "string") {
    throw new TypeError("Path d must be a string");
  }
}

/**
 * Validate numeric parameter - fail fast on invalid numbers
 * Reserved for future use - prefixed with underscore to indicate internal/unused status
 * @param {number} value - Numeric value to validate
 * @param {string} name - Parameter name for error message
 * @throws {TypeError} If value is not a finite number
 */
function _validateNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${value}`);
  }
}

/**
 * Validate precision parameter - fail fast on invalid precision
 * @param {number} precision - Precision value to validate
 * @throws {TypeError} If precision is not a valid non-negative finite number
 */
function validatePrecision(precision) {
  if (
    typeof precision !== "number" ||
    !Number.isFinite(precision) ||
    precision < 0
  ) {
    throw new TypeError(
      `Precision must be a finite non-negative number, got ${precision}`,
    );
  }
}

/**
 * Validate tolerance parameter - fail fast on invalid tolerance
 * @param {number} tolerance - Tolerance value to validate
 * @throws {TypeError} If tolerance is not a valid non-negative finite number
 */
function validateTolerance(tolerance) {
  if (
    typeof tolerance !== "number" ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    throw new TypeError(
      `Tolerance must be a finite non-negative number, got ${tolerance}`,
    );
  }
}

/**
 * Validate command object structure - fail fast on invalid commands
 * @param {object} cmd - Command object to validate
 * @param {number} minArgs - Minimum required args length (optional)
 * @throws {TypeError} If command structure is invalid
 */
function validateCommand(cmd, minArgs = 0) {
  if (!cmd || typeof cmd !== "object") {
    throw new TypeError("Command must be an object");
  }
  if (typeof cmd.command !== "string") {
    throw new TypeError("Command must have a string 'command' property");
  }
  if (!Array.isArray(cmd.args)) {
    throw new TypeError("Command must have an array 'args' property");
  }
  if (cmd.args.length < minArgs) {
    throw new TypeError(
      `Command ${cmd.command} requires at least ${minArgs} args, got ${cmd.args.length}`,
    );
  }
  // Validate all args are finite numbers
  for (let i = 0; i < cmd.args.length; i++) {
    if (typeof cmd.args[i] !== "number" || !Number.isFinite(cmd.args[i])) {
      throw new TypeError(
        `Command ${cmd.command} arg[${i}] must be a finite number, got ${cmd.args[i]}`,
      );
    }
  }
}

// ============================================================================
// PLUGIN: removeLeadingZero
// Removes leading zeros from decimal numbers (0.5 -> .5)
// ============================================================================

/**
 * Remove leading zeros from path numbers.
 * Example: "M 0.5 0.25" -> "M .5 .25"
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function removeLeadingZero(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  // Validate all commands have proper structure
  commands.forEach((cmd) => validateCommand(cmd));

  // Format numbers with leading zero removal
  const formatted = commands.map((cmd) => ({
    command: cmd.command,
    args: cmd.args.map((n) => {
      const str = formatNumber(n, precision);
      const parsed = parseFloat(str);
      // Ensure the parsed value is valid - fail fast if corrupted
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric value encountered: ${str}`);
      }
      return parsed;
    }),
  }));

  return serializePath(formatted, precision);
}

// ============================================================================
// PLUGIN: negativeExtraSpace
// Uses negative sign as delimiter (saves space between numbers)
// ============================================================================

/**
 * Use negative sign as delimiter between numbers.
 * Example: "M 10 -5" -> "M10-5"
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function negativeExtraSpace(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  // serializePath already handles this optimization
  return serializePath(commands, precision);
}

// ============================================================================
// PLUGIN: convertToRelative
// Converts all commands to relative form
// ============================================================================

/**
 * Convert all path commands to relative form.
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Path with relative commands
 */
export function convertToRelative(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    validateCommand(cmd);

    // Convert to relative
    const rel = toRelative(cmd, cx, cy);
    validateCommand(rel);
    result.push(rel);

    // Update position using absolute form
    const abs = toAbsolute(cmd, cx, cy);
    validateCommand(abs);
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: convertToAbsolute
// Converts all commands to absolute form
// ============================================================================

/**
 * Convert all path commands to absolute form.
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Path with absolute commands
 */
export function convertToAbsolute(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    // Convert to absolute
    const abs = toAbsolute(cmd, cx, cy);
    result.push(abs);

    // Update position
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: lineShorthands
// Converts L commands to H or V when applicable
// ============================================================================

/**
 * Convert L commands to H (horizontal) or V (vertical) when applicable.
 * Example: "L 100 50" when y unchanged -> "H 100"
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Tolerance for detecting horizontal/vertical
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function lineShorthands(d, tolerance = 1e-6, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    let newCmd = cmd;

    if (cmd.command === "L" || cmd.command === "l") {
      const isAbs = cmd.command === "L";
      const endX = isAbs ? cmd.args[0] : cx + cmd.args[0];
      const endY = isAbs ? cmd.args[1] : cy + cmd.args[1];

      if (Math.abs(endY - cy) < tolerance) {
        // Horizontal line
        newCmd = isAbs
          ? { command: "H", args: [endX] }
          : { command: "h", args: [endX - cx] };
      } else if (Math.abs(endX - cx) < tolerance) {
        // Vertical line
        newCmd = isAbs
          ? { command: "V", args: [endY] }
          : { command: "v", args: [endY - cy] };
      }
    }

    result.push(newCmd);

    // Update position
    const abs = toAbsolute(newCmd, cx, cy);
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: convertToZ
// Converts final L command to Z when it returns to subpath start
// ============================================================================

/**
 * Convert final line command to Z when it closes the path.
 * Example: "M 0 0 L 10 10 L 0 0" -> "M 0 0 L 10 10 z"
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Tolerance for detecting closure
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function convertToZ(d, tolerance = 1e-6, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    let newCmd = cmd;

    // Check if this L command goes back to start
    if (cmd.command === "L" || cmd.command === "l") {
      const isAbs = cmd.command === "L";
      const endX = isAbs ? cmd.args[0] : cx + cmd.args[0];
      const endY = isAbs ? cmd.args[1] : cy + cmd.args[1];

      if (
        Math.abs(endX - startX) < tolerance &&
        Math.abs(endY - startY) < tolerance
      ) {
        // This line closes the path
        newCmd = { command: "z", args: [] };
      }
    }

    result.push(newCmd);

    // Update position
    const abs = toAbsolute(newCmd, cx, cy);
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// BEZIER CURVE UTILITIES - Proper mathematical evaluation and distance
// ============================================================================

/**
 * Validate that all coordinate parameters are finite numbers
 * @param {...number} coords - Coordinate values to validate
 * @throws {TypeError} If any coordinate is not a finite number
 */
function validateCoordinates(...coords) {
  for (let i = 0; i < coords.length; i++) {
    if (typeof coords[i] !== "number" || !Number.isFinite(coords[i])) {
      throw new TypeError(
        `Coordinate at position ${i} must be a finite number, got ${coords[i]}`,
      );
    }
  }
}

/**
 * Validate t parameter is in valid range [0, 1]
 * @param {number} t - Parameter value to validate
 * @throws {TypeError} If t is not a valid number
 * @throws {RangeError} If t is outside [0, 1] range
 */
function validateT(t) {
  if (typeof t !== "number" || !Number.isFinite(t)) {
    throw new TypeError(`Parameter t must be a finite number, got ${t}`);
  }
  if (t < 0 || t > 1) {
    throw new RangeError(`Parameter t must be in range [0, 1], got ${t}`);
  }
}

/**
 * Evaluate a cubic Bezier curve at parameter t.
 * B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
 * @param {number} t - Parameter value (0 to 1)
 * @param {number} p0x - Start point X coordinate
 * @param {number} p0y - Start point Y coordinate
 * @param {number} p1x - First control point X coordinate
 * @param {number} p1y - First control point Y coordinate
 * @param {number} p2x - Second control point X coordinate
 * @param {number} p2y - Second control point Y coordinate
 * @param {number} p3x - End point X coordinate
 * @param {number} p3y - End point Y coordinate
 * @returns {{x: number, y: number}} Point on curve
 */
function cubicBezierPoint(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
  // Validate all inputs - fail fast on invalid data
  validateT(t);
  validateCoordinates(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * p3x,
    y: mt3 * p0y + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * p3y,
  };
}

/**
 * First derivative of cubic Bezier at t.
 * B'(t) = 3(1-t)^2(P1-P0) + 6(1-t)t(P2-P1) + 3t^2(P3-P2)
 * @param {number} t - Parameter value (0 to 1)
 * @param {number} p0x - Start point X coordinate
 * @param {number} p0y - Start point Y coordinate
 * @param {number} p1x - First control point X coordinate
 * @param {number} p1y - First control point Y coordinate
 * @param {number} p2x - Second control point X coordinate
 * @param {number} p2y - Second control point Y coordinate
 * @param {number} p3x - End point X coordinate
 * @param {number} p3y - End point Y coordinate
 * @returns {{x: number, y: number}} First derivative vector
 */
function cubicBezierDeriv1(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
  // Validate all inputs - fail fast on invalid data
  validateT(t);
  validateCoordinates(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);

  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: 3 * mt2 * (p1x - p0x) + 6 * mt * t * (p2x - p1x) + 3 * t2 * (p3x - p2x),
    y: 3 * mt2 * (p1y - p0y) + 6 * mt * t * (p2y - p1y) + 3 * t2 * (p3y - p2y),
  };
}

/**
 * Second derivative of cubic Bezier at t.
 * B''(t) = 6(1-t)(P2-2P1+P0) + 6t(P3-2P2+P1)
 * @param {number} t - Parameter value (0 to 1)
 * @param {number} p0x - Start point X coordinate
 * @param {number} p0y - Start point Y coordinate
 * @param {number} p1x - First control point X coordinate
 * @param {number} p1y - First control point Y coordinate
 * @param {number} p2x - Second control point X coordinate
 * @param {number} p2y - Second control point Y coordinate
 * @param {number} p3x - End point X coordinate
 * @param {number} p3y - End point Y coordinate
 * @returns {{x: number, y: number}} Second derivative vector
 */
function cubicBezierDeriv2(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
  // Validate all inputs - fail fast on invalid data
  validateT(t);
  validateCoordinates(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);

  const mt = 1 - t;
  return {
    x: 6 * mt * (p2x - 2 * p1x + p0x) + 6 * t * (p3x - 2 * p2x + p1x),
    y: 6 * mt * (p2y - 2 * p1y + p0y) + 6 * t * (p3y - 2 * p2y + p1y),
  };
}

/**
 * Find closest t on cubic Bezier to point p using Newton's method.
 * Minimizes |B(t) - p|^2 by finding root of d/dt |B(t)-p|^2 = 2(B(t)-p)·B'(t) = 0
 * @param {number} px - Query point X coordinate
 * @param {number} py - Query point Y coordinate
 * @param {number} p0x - Bezier start point X
 * @param {number} p0y - Bezier start point Y
 * @param {number} p1x - Bezier first control point X
 * @param {number} p1y - Bezier first control point Y
 * @param {number} p2x - Bezier second control point X
 * @param {number} p2y - Bezier second control point Y
 * @param {number} p3x - Bezier end point X
 * @param {number} p3y - Bezier end point Y
 * @param {number} tInit - Initial t value for Newton iteration
 * @returns {number} Closest parameter t (0 to 1)
 */
function _closestTOnCubicBezier(
  px,
  py,
  p0x,
  p0y,
  p1x,
  p1y,
  p2x,
  p2y,
  p3x,
  p3y,
  tInit = 0.5,
) {
  // Validate all coordinate inputs - fail fast on invalid data
  validateCoordinates(px, py, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);
  // Note: tInit is clamped below so no need to strictly validate it

  let t = Math.max(0, Math.min(1, tInit));

  for (let iter = 0; iter < 10; iter++) {
    // Note: t is always clamped to [0,1] so cubicBezierPoint validation won't fail
    const Q = cubicBezierPoint(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);
    const Q1 = cubicBezierDeriv1(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);
    const Q2 = cubicBezierDeriv2(t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y);

    const diffX = Q.x - px;
    const diffY = Q.y - py;

    // f(t) = (B(t) - p) · B'(t)
    const f = diffX * Q1.x + diffY * Q1.y;
    // f'(t) = B'(t)·B'(t) + (B(t)-p)·B''(t)
    const fp = Q1.x * Q1.x + Q1.y * Q1.y + diffX * Q2.x + diffY * Q2.y;

    // Division by zero check - fail fast if derivative is zero
    if (Math.abs(fp) < 1e-12) break;

    const tNext = Math.max(0, Math.min(1, t - f / fp));
    if (Math.abs(tNext - t) < 1e-9) {
      t = tNext;
      break;
    }
    t = tNext;
  }

  return t;
}

/**
 * Calculate distance from point to line segment (for straight curve check).
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} x0 - Line segment start X
 * @param {number} y0 - Line segment start Y
 * @param {number} x1 - Line segment end X
 * @param {number} y1 - Line segment end Y
 * @returns {number} Distance from point to line segment
 */
function pointToLineDistance(px, py, x0, y0, x1, y1) {
  // Validate all coordinate inputs - fail fast on invalid data
  validateCoordinates(px, py, x0, y0, x1, y1);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;

  // Handle degenerate case where line segment is a point
  if (lengthSq < 1e-10) {
    return Math.sqrt((px - x0) ** 2 + (py - y0) ** 2);
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSq),
  );
  const projX = x0 + t * dx;
  const projY = y0 + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Compute maximum error between cubic Bezier and a line segment.
 * Uses Newton's method to find closest points + midpoint checks to catch bulges.
 * @param {number} p0x - Bezier start point X
 * @param {number} p0y - Bezier start point Y
 * @param {number} cp1x - First control point X
 * @param {number} cp1y - First control point Y
 * @param {number} cp2x - Second control point X
 * @param {number} cp2y - Second control point Y
 * @param {number} p3x - Bezier end point X
 * @param {number} p3y - Bezier end point Y
 * @returns {number} Maximum distance from any curve point to the line
 */
function maxErrorCurveToLine(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y) {
  // Validate all coordinate inputs - fail fast on invalid data
  validateCoordinates(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y);

  let maxErr = 0;

  // Sample at regular t intervals and find closest point on line
  const samples = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  for (const t of samples) {
    const pt = cubicBezierPoint(t, p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y);
    const dist = pointToLineDistance(pt.x, pt.y, p0x, p0y, p3x, p3y);
    if (dist > maxErr) maxErr = dist;
  }

  // Check midpoints between samples to catch bulges
  for (let i = 0; i < samples.length - 1; i++) {
    const tMid = (samples[i] + samples[i + 1]) / 2;
    const pt = cubicBezierPoint(
      tMid,
      p0x,
      p0y,
      cp1x,
      cp1y,
      cp2x,
      cp2y,
      p3x,
      p3y,
    );
    const dist = pointToLineDistance(pt.x, pt.y, p0x, p0y, p3x, p3y);
    if (dist > maxErr) maxErr = dist;
  }

  // Also check t=0.05 and t=0.95 (near endpoints where bulges can hide)
  for (const t of [0.05, 0.95]) {
    const pt = cubicBezierPoint(t, p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y);
    const dist = pointToLineDistance(pt.x, pt.y, p0x, p0y, p3x, p3y);
    if (dist > maxErr) maxErr = dist;
  }

  return maxErr;
}

// ============================================================================
// PLUGIN: straightCurves
// Converts cubic bezier curves to lines when effectively straight
// ============================================================================

/**
 * Check if a cubic bezier is effectively a straight line.
 * Uses comprehensive sampling + midpoint checks to find actual max deviation.
 * @param {number} x0 - Bezier start point X
 * @param {number} y0 - Bezier start point Y
 * @param {number} cp1x - First control point X
 * @param {number} cp1y - First control point Y
 * @param {number} cp2x - Second control point X
 * @param {number} cp2y - Second control point Y
 * @param {number} x3 - Bezier end point X
 * @param {number} y3 - Bezier end point Y
 * @param {number} tolerance - Maximum deviation to consider straight
 * @returns {boolean} True if curve is effectively straight
 */
function isCurveStraight(x0, y0, cp1x, cp1y, cp2x, cp2y, x3, y3, tolerance) {
  const maxError = maxErrorCurveToLine(x0, y0, cp1x, cp1y, cp2x, cp2y, x3, y3);
  return maxError <= tolerance;
}

/**
 * Convert cubic bezier curves to lines when effectively straight.
 * Example: "C 0 0 10 10 10 10" -> "L 10 10" if control points are on the line
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Maximum deviation to consider straight
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function straightCurves(d, tolerance = 0.5, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    let newCmd = cmd;

    if (cmd.command === "C" || cmd.command === "c") {
      const isAbs = cmd.command === "C";
      const cp1x = isAbs ? cmd.args[0] : cx + cmd.args[0];
      const cp1y = isAbs ? cmd.args[1] : cy + cmd.args[1];
      const cp2x = isAbs ? cmd.args[2] : cx + cmd.args[2];
      const cp2y = isAbs ? cmd.args[3] : cy + cmd.args[3];
      const endX = isAbs ? cmd.args[4] : cx + cmd.args[4];
      const endY = isAbs ? cmd.args[5] : cy + cmd.args[5];

      if (
        isCurveStraight(cx, cy, cp1x, cp1y, cp2x, cp2y, endX, endY, tolerance)
      ) {
        newCmd = isAbs
          ? { command: "L", args: [endX, endY] }
          : { command: "l", args: [endX - cx, endY - cy] };
      }
    }

    result.push(newCmd);

    // Update position
    const abs = toAbsolute(newCmd, cx, cy);
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: collapseRepeated
// Removes redundant command letters when same command repeats
// ============================================================================

/**
 * Collapse repeated command letters.
 * Example: "L 10 10 L 20 20" -> "L 10 10 20 20"
 * Note: This is handled by serializePath internally.
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function collapseRepeated(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  // serializePath already collapses repeated commands
  return serializePath(commands, precision);
}

// ============================================================================
// PLUGIN: floatPrecision
// Rounds all numbers to specified precision
// ============================================================================

/**
 * Round all path numbers to specified precision.
 * Example (precision=2): "M 10.12345 20.6789" -> "M 10.12 20.68"
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal places to keep
 * @returns {string} Path with rounded numbers
 */
export function floatPrecision(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  // Ensure precision is reasonable to avoid overflow
  if (precision > 15) {
    throw new RangeError(`Precision ${precision} is too large (max 15)`);
  }

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  const factor = Math.pow(10, precision);
  const rounded = commands.map((cmd) => ({
    command: cmd.command,
    args: cmd.args.map((n) => Math.round(n * factor) / factor),
  }));

  return serializePath(rounded, precision);
}

// ============================================================================
// PLUGIN: removeUselessCommands
// Removes commands that have no effect (zero-length lines, etc.)
// ============================================================================

/**
 * Remove commands that have no visual effect.
 * Example: "M 10 10 L 10 10" -> "M 10 10" (removes zero-length line)
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Tolerance for detecting zero-length
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function removeUselessCommands(d, tolerance = 1e-6, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    const abs = toAbsolute(cmd, cx, cy);
    let keep = true;

    // Check for zero-length commands
    switch (abs.command) {
      case "L":
      case "T":
        if (
          Math.abs(abs.args[0] - cx) < tolerance &&
          Math.abs(abs.args[1] - cy) < tolerance
        ) {
          keep = false;
        }
        break;
      case "H":
        if (Math.abs(abs.args[0] - cx) < tolerance) {
          keep = false;
        }
        break;
      case "V":
        if (Math.abs(abs.args[0] - cy) < tolerance) {
          keep = false;
        }
        break;
      case "C":
        // Zero-length curve where all points are the same
        if (
          Math.abs(abs.args[4] - cx) < tolerance &&
          Math.abs(abs.args[5] - cy) < tolerance &&
          Math.abs(abs.args[0] - cx) < tolerance &&
          Math.abs(abs.args[1] - cy) < tolerance &&
          Math.abs(abs.args[2] - cx) < tolerance &&
          Math.abs(abs.args[3] - cy) < tolerance
        ) {
          keep = false;
        }
        break;
      default:
        break;
    }

    if (keep) {
      result.push(cmd);

      // Update position
      switch (abs.command) {
        case "M":
          cx = abs.args[0];
          cy = abs.args[1];
          startX = cx;
          startY = cy;
          break;
        case "L":
        case "T":
          cx = abs.args[0];
          cy = abs.args[1];
          break;
        case "H":
          cx = abs.args[0];
          break;
        case "V":
          cy = abs.args[0];
          break;
        case "C":
          cx = abs.args[4];
          cy = abs.args[5];
          break;
        case "S":
        case "Q":
          cx = abs.args[2];
          cy = abs.args[3];
          break;
        case "A":
          cx = abs.args[5];
          cy = abs.args[6];
          break;
        case "Z":
          cx = startX;
          cy = startY;
          break;
        default:
          break;
      }
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: convertCubicToQuadratic
// Converts cubic bezier to quadratic when possible (saves 2 parameters)
// ============================================================================

/**
 * Evaluate a quadratic Bezier curve at parameter t.
 * B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
 * @param {number} t - Parameter value (0 to 1)
 * @param {number} p0x - Start point X coordinate
 * @param {number} p0y - Start point Y coordinate
 * @param {number} p1x - Control point X coordinate
 * @param {number} p1y - Control point Y coordinate
 * @param {number} p2x - End point X coordinate
 * @param {number} p2y - End point Y coordinate
 * @returns {{x: number, y: number}} Point on curve
 */
function quadraticBezierPoint(t, p0x, p0y, p1x, p1y, p2x, p2y) {
  // Validate all inputs - fail fast on invalid data
  validateT(t);
  validateCoordinates(p0x, p0y, p1x, p1y, p2x, p2y);

  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * p0x + 2 * mt * t * p1x + t2 * p2x,
    y: mt2 * p0y + 2 * mt * t * p1y + t2 * p2y,
  };
}

/**
 * Compute maximum error between cubic Bezier and quadratic Bezier.
 * Samples both curves and checks midpoints to find actual max deviation.
 * @param {number} p0x - Bezier start point X
 * @param {number} p0y - Bezier start point Y
 * @param {number} cp1x - Cubic first control point X
 * @param {number} cp1y - Cubic first control point Y
 * @param {number} cp2x - Cubic second control point X
 * @param {number} cp2y - Cubic second control point Y
 * @param {number} p3x - Bezier end point X
 * @param {number} p3y - Bezier end point Y
 * @param {number} qx - Quadratic control point X
 * @param {number} qy - Quadratic control point Y
 * @returns {number} Maximum distance between corresponding points on both curves
 */
function maxErrorCubicToQuadratic(
  p0x,
  p0y,
  cp1x,
  cp1y,
  cp2x,
  cp2y,
  p3x,
  p3y,
  qx,
  qy,
) {
  // Validate all coordinate inputs - fail fast on invalid data
  validateCoordinates(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y, qx, qy);

  let maxErr = 0;

  // Dense sampling including midpoints
  const samples = [
    0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
    0.75, 0.8, 0.85, 0.9, 0.95,
  ];

  for (const t of samples) {
    // Point on original cubic
    const cubic = cubicBezierPoint(
      t,
      p0x,
      p0y,
      cp1x,
      cp1y,
      cp2x,
      cp2y,
      p3x,
      p3y,
    );
    // Point on proposed quadratic
    const quad = quadraticBezierPoint(t, p0x, p0y, qx, qy, p3x, p3y);

    const dist = Math.sqrt((cubic.x - quad.x) ** 2 + (cubic.y - quad.y) ** 2);
    if (dist > maxErr) maxErr = dist;
  }

  return maxErr;
}

/**
 * Check if a cubic bezier can be approximated by a quadratic.
 * VERIFIED by comparing actual curve points with comprehensive sampling.
 * @param {number} x0 - Bezier start point X
 * @param {number} y0 - Bezier start point Y
 * @param {number} cp1x - Cubic first control point X
 * @param {number} cp1y - Cubic first control point Y
 * @param {number} cp2x - Cubic second control point X
 * @param {number} cp2y - Cubic second control point Y
 * @param {number} x3 - Bezier end point X
 * @param {number} y3 - Bezier end point Y
 * @param {number} tolerance - Maximum deviation for conversion
 * @returns {{cpx: number, cpy: number} | null} Quadratic control point or null
 */
function cubicToQuadraticControlPoint(
  x0,
  y0,
  cp1x,
  cp1y,
  cp2x,
  cp2y,
  x3,
  y3,
  tolerance,
) {
  // Validate all coordinate inputs - fail fast on invalid data
  validateCoordinates(x0, y0, cp1x, cp1y, cp2x, cp2y, x3, y3);
  validateTolerance(tolerance);

  // Calculate the best-fit quadratic control point
  // For a cubic to be exactly representable as quadratic:
  // Q = (3*(P1 + P2) - P0 - P3) / 4
  const qx = (3 * (cp1x + cp2x) - x0 - x3) / 4;
  const qy = (3 * (cp1y + cp2y) - y0 - y3) / 4;

  // VERIFY by computing actual max error between the curves
  const maxError = maxErrorCubicToQuadratic(
    x0,
    y0,
    cp1x,
    cp1y,
    cp2x,
    cp2y,
    x3,
    y3,
    qx,
    qy,
  );

  if (maxError <= tolerance) {
    return { cpx: qx, cpy: qy };
  }

  return null; // Curves deviate too much - cannot convert
}

/**
 * Convert cubic bezier curves to quadratic when possible.
 * Example: "C 6.67 0 13.33 10 20 10" -> "Q 10 5 20 10" (if approximation valid)
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Maximum deviation for conversion
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function convertCubicToQuadratic(d, tolerance = 0.5, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  const result = [];

  for (const cmd of commands) {
    let newCmd = cmd;

    if (cmd.command === "C" || cmd.command === "c") {
      const isAbs = cmd.command === "C";
      const cp1x = isAbs ? cmd.args[0] : cx + cmd.args[0];
      const cp1y = isAbs ? cmd.args[1] : cy + cmd.args[1];
      const cp2x = isAbs ? cmd.args[2] : cx + cmd.args[2];
      const cp2y = isAbs ? cmd.args[3] : cy + cmd.args[3];
      const endX = isAbs ? cmd.args[4] : cx + cmd.args[4];
      const endY = isAbs ? cmd.args[5] : cy + cmd.args[5];

      const quadCP = cubicToQuadraticControlPoint(
        cx,
        cy,
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        endX,
        endY,
        tolerance,
      );

      if (quadCP) {
        newCmd = isAbs
          ? { command: "Q", args: [quadCP.cpx, quadCP.cpy, endX, endY] }
          : {
              command: "q",
              args: [quadCP.cpx - cx, quadCP.cpy - cy, endX - cx, endY - cy],
            };
      }
    }

    result.push(newCmd);

    // Update position
    const abs = toAbsolute(newCmd, cx, cy);
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: convertQuadraticToSmooth
// Converts Q commands to T when control point is reflection of previous
// ============================================================================

/**
 * Convert quadratic bezier to smooth shorthand (T) when possible.
 * Example: "Q 10 5 20 10 Q 30 15 40 10" -> "Q 10 5 20 10 T 40 10" (if cp is reflection)
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Tolerance for detecting reflection
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function convertQuadraticToSmooth(d, tolerance = 1e-6, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  let lastQcpX = null,
    lastQcpY = null;
  const result = [];

  for (const cmd of commands) {
    let newCmd = cmd;
    const abs = toAbsolute(cmd, cx, cy);

    if (abs.command === "Q" && lastQcpX !== null) {
      // Calculate reflected control point
      const reflectedCpX = 2 * cx - lastQcpX;
      const reflectedCpY = 2 * cy - lastQcpY;

      // Check if current control point matches reflection
      if (
        Math.abs(abs.args[0] - reflectedCpX) < tolerance &&
        Math.abs(abs.args[1] - reflectedCpY) < tolerance
      ) {
        // Can use T command
        const isAbs = cmd.command === "Q";
        newCmd = isAbs
          ? { command: "T", args: [abs.args[2], abs.args[3]] }
          : { command: "t", args: [abs.args[2] - cx, abs.args[3] - cy] };
      }
    }

    result.push(newCmd);

    // Track control points for reflection
    if (abs.command === "Q") {
      lastQcpX = abs.args[0];
      lastQcpY = abs.args[1];
    } else if (abs.command === "T") {
      // T uses reflected control point - only valid if previous was Q or T
      if (lastQcpX !== null) {
        lastQcpX = 2 * cx - lastQcpX;
        lastQcpY = 2 * cy - lastQcpY;
      } else {
        // T after non-Q command - control point is current position (no reflection)
        lastQcpX = cx;
        lastQcpY = cy;
      }
    } else {
      lastQcpX = null;
      lastQcpY = null;
    }

    // Update position
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: convertCubicToSmooth
// Converts C commands to S when first control point is reflection of previous
// ============================================================================

/**
 * Convert cubic bezier to smooth shorthand (S) when possible.
 * Example: "C 0 10 10 10 20 0 C 30 -10 40 0 50 0" -> "C 0 10 10 10 20 0 S 40 0 50 0"
 * @param {string} d - Path d attribute
 * @param {number} tolerance - Tolerance for detecting reflection
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function convertCubicToSmooth(d, tolerance = 1e-6, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validateTolerance(tolerance);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  let lastCcp2X = null,
    lastCcp2Y = null;
  const result = [];

  for (const cmd of commands) {
    let newCmd = cmd;
    const abs = toAbsolute(cmd, cx, cy);

    if (abs.command === "C" && lastCcp2X !== null) {
      // Calculate reflected control point
      const reflectedCpX = 2 * cx - lastCcp2X;
      const reflectedCpY = 2 * cy - lastCcp2Y;

      // Check if first control point matches reflection
      if (
        Math.abs(abs.args[0] - reflectedCpX) < tolerance &&
        Math.abs(abs.args[1] - reflectedCpY) < tolerance
      ) {
        // Can use S command
        const isAbs = cmd.command === "C";
        newCmd = isAbs
          ? {
              command: "S",
              args: [abs.args[2], abs.args[3], abs.args[4], abs.args[5]],
            }
          : {
              command: "s",
              args: [
                abs.args[2] - cx,
                abs.args[3] - cy,
                abs.args[4] - cx,
                abs.args[5] - cy,
              ],
            };
      }
    }

    result.push(newCmd);

    // Track control points for reflection
    if (abs.command === "C") {
      lastCcp2X = abs.args[2];
      lastCcp2Y = abs.args[3];
    } else if (abs.command === "S") {
      // S uses its control point as the second cubic control point
      // This is always valid since S command provides explicit control point
      lastCcp2X = abs.args[0];
      lastCcp2Y = abs.args[1];
    } else {
      lastCcp2X = null;
      lastCcp2Y = null;
    }

    // Update position
    switch (abs.command) {
      case "M":
        cx = abs.args[0];
        cy = abs.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = abs.args[0];
        cy = abs.args[1];
        break;
      case "H":
        cx = abs.args[0];
        break;
      case "V":
        cy = abs.args[0];
        break;
      case "C":
        cx = abs.args[4];
        cy = abs.args[5];
        break;
      case "S":
      case "Q":
        cx = abs.args[2];
        cy = abs.args[3];
        break;
      case "A":
        cx = abs.args[5];
        cy = abs.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
      default:
        break;
    }
  }

  return serializePath(result, precision);
}

// ============================================================================
// PLUGIN: arcShorthands
// Optimizes arc parameters (flag compression, etc.)
// ============================================================================

/**
 * Optimize arc command parameters.
 * - Normalize angle to 0-360 range
 * - Use smaller arc when equivalent
 * @param {string} d - Path d attribute
 * @param {number} precision - Decimal precision
 * @returns {string} Optimized path
 */
export function arcShorthands(d, precision = 3) {
  // Validate input parameters - fail fast if invalid
  validatePathString(d);
  validatePrecision(precision);

  const commands = parsePath(d);
  if (commands.length === 0) return d;

  const result = commands.map((cmd) => {
    if (cmd.command === "A" || cmd.command === "a") {
      const args = [...cmd.args];
      // Ensure args array has correct length for arc command
      if (args.length !== 7) {
        throw new Error(`Arc command requires 7 arguments, got ${args.length}`);
      }
      // Normalize rotation angle to 0-360
      args[2] = ((args[2] % 360) + 360) % 360;
      // If rx == ry, rotation doesn't matter, set to 0
      if (Math.abs(args[0] - args[1]) < 1e-6) {
        args[2] = 0;
      }
      return { command: cmd.command, args };
    }
    return cmd;
  });

  return serializePath(result, precision);
}

// ============================================================================
// Export all plugins
// ============================================================================

export default {
  removeLeadingZero,
  negativeExtraSpace,
  convertToRelative,
  convertToAbsolute,
  lineShorthands,
  convertToZ,
  straightCurves,
  collapseRepeated,
  floatPrecision,
  removeUselessCommands,
  convertCubicToQuadratic,
  convertQuadraticToSmooth,
  convertCubicToSmooth,
  arcShorthands,
};
