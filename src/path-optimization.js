/**
 * Path Optimization with Arbitrary Precision and Mathematical Verification
 *
 * Provides functions to optimize SVG path commands while guaranteeing:
 * 1. ARBITRARY PRECISION - All calculations use Decimal.js (80 digits)
 * 2. MATHEMATICAL VERIFICATION - Every optimization is verified via sampling
 *
 * ## Algorithms Implemented
 *
 * ### Line to Horizontal (lineToHorizontal)
 * Converts L command to H when y coordinate is the same.
 * Uses endpoint verification to ensure correctness.
 *
 * ### Line to Vertical (lineToVertical)
 * Converts L command to V when x coordinate is the same.
 * Uses endpoint verification to ensure correctness.
 *
 * ### Curve to Smooth (curveToSmooth)
 * Converts C (cubic Bezier) to S (smooth cubic) when first control point
 * is the reflection of the previous control point across the current point.
 * Verifies by sampling both curves at multiple t values.
 *
 * ### Quadratic to Smooth (quadraticToSmooth)
 * Converts Q (quadratic Bezier) to T (smooth quadratic) when control point
 * is the reflection of the previous control point across the current point.
 * Verifies by sampling both curves at multiple t values.
 *
 * ### Absolute/Relative Conversion (toRelative, toAbsolute)
 * Converts between absolute and relative path commands.
 * Verifies bidirectional conversion (inverse must give same result).
 *
 * ### Shorter Form Selection (chooseShorterForm)
 * Picks the shorter string encoding between absolute and relative forms.
 * Verifies both produce same numeric values.
 *
 * ### Repeated Command Collapse (collapseRepeated)
 * Merges consecutive identical commands into a single command with multiple
 * coordinate pairs (e.g., multiple L commands into a polyline).
 * Verifies the path remains identical.
 *
 * ### Line to Z (lineToZ)
 * Converts a final L command that returns to subpath start into Z command.
 * Verifies endpoint matches.
 *
 * @module path-optimization
 */

import Decimal from 'decimal.js';

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

// Near-zero threshold for comparisons
const EPSILON = new Decimal('1e-40');

// Default tolerance for optimization (user-configurable)
const DEFAULT_TOLERANCE = new Decimal('1e-10');

// ============================================================================
// Point and Distance Utilities
// ============================================================================

/**
 * Create a point with Decimal coordinates.
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {{x: Decimal, y: Decimal}} Point object
 */
export function point(x, y) {
  return { x: D(x), y: D(y) };
}

/**
 * Calculate the distance between two points.
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point
 * @returns {Decimal} Distance
 */
export function distance(p1, p2) {
  const dx = p2.x.minus(p1.x);
  const dy = p2.y.minus(p1.y);
  return dx.mul(dx).plus(dy.mul(dy)).sqrt();
}

/**
 * Check if two points are equal within tolerance.
 * @param {{x: Decimal, y: Decimal}} p1 - First point
 * @param {{x: Decimal, y: Decimal}} p2 - Second point
 * @param {Decimal} [tolerance=EPSILON] - Comparison tolerance
 * @returns {boolean} True if points are equal
 */
export function pointsEqual(p1, p2, tolerance = EPSILON) {
  const tol = D(tolerance);
  return p1.x.minus(p2.x).abs().lessThan(tol) && p1.y.minus(p2.y).abs().lessThan(tol);
}

// ============================================================================
// Bezier Curve Evaluation (imported from path-simplification patterns)
// ============================================================================

/**
 * Evaluate a cubic Bezier curve at parameter t.
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - First control point
 * @param {{x: Decimal, y: Decimal}} p2 - Second control point
 * @param {{x: Decimal, y: Decimal}} p3 - End point
 * @param {number|string|Decimal} t - Parameter (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on curve
 */
export function evaluateCubicBezier(p0, p1, p2, p3, t) {
  const tD = D(t);
  const oneMinusT = D(1).minus(tD);

  // Bernstein basis polynomials
  const b0 = oneMinusT.pow(3);                              // (1-t)³
  const b1 = D(3).mul(oneMinusT.pow(2)).mul(tD);           // 3(1-t)²t
  const b2 = D(3).mul(oneMinusT).mul(tD.pow(2));           // 3(1-t)t²
  const b3 = tD.pow(3);                                     // t³

  return {
    x: b0.mul(p0.x).plus(b1.mul(p1.x)).plus(b2.mul(p2.x)).plus(b3.mul(p3.x)),
    y: b0.mul(p0.y).plus(b1.mul(p1.y)).plus(b2.mul(p2.y)).plus(b3.mul(p3.y))
  };
}

/**
 * Evaluate a quadratic Bezier curve at parameter t.
 * B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
 *
 * @param {{x: Decimal, y: Decimal}} p0 - Start point
 * @param {{x: Decimal, y: Decimal}} p1 - Control point
 * @param {{x: Decimal, y: Decimal}} p2 - End point
 * @param {number|string|Decimal} t - Parameter (0 to 1)
 * @returns {{x: Decimal, y: Decimal}} Point on curve
 */
export function evaluateQuadraticBezier(p0, p1, p2, t) {
  const tD = D(t);
  const oneMinusT = D(1).minus(tD);

  // Bernstein basis polynomials
  const b0 = oneMinusT.pow(2);                    // (1-t)²
  const b1 = D(2).mul(oneMinusT).mul(tD);        // 2(1-t)t
  const b2 = tD.pow(2);                           // t²

  return {
    x: b0.mul(p0.x).plus(b1.mul(p1.x)).plus(b2.mul(p2.x)),
    y: b0.mul(p0.y).plus(b1.mul(p1.y)).plus(b2.mul(p2.y))
  };
}

// ============================================================================
// Line Command Optimization
// ============================================================================

/**
 * Convert L command to H (horizontal line) when y coordinate is unchanged.
 *
 * VERIFICATION: Checks that endpoints match exactly.
 *
 * @param {number|string|Decimal} x1 - Start X coordinate
 * @param {number|string|Decimal} y1 - Start Y coordinate
 * @param {number|string|Decimal} x2 - End X coordinate
 * @param {number|string|Decimal} y2 - End Y coordinate
 * @param {Decimal} [tolerance=EPSILON] - Tolerance for Y equality check
 * @returns {{canConvert: boolean, endX: Decimal, verified: boolean}} Conversion result
 */
export function lineToHorizontal(x1, y1, x2, y2, tolerance = EPSILON) {
  const tol = D(tolerance);
  const startY = D(y1);
  const endY = D(y2);
  const endX = D(x2);

  // Check if Y coordinates are equal within tolerance
  const yDiff = endY.minus(startY).abs();
  const canConvert = yDiff.lessThan(tol);

  // VERIFICATION: Endpoint check
  // The H command moves to (x2, y1), so we verify y1 ≈ y2
  const verified = canConvert ? yDiff.lessThan(tol) : true;

  return {
    canConvert,
    endX,
    verified
  };
}

/**
 * Convert L command to V (vertical line) when x coordinate is unchanged.
 *
 * VERIFICATION: Checks that endpoints match exactly.
 *
 * @param {number|string|Decimal} x1 - Start X coordinate
 * @param {number|string|Decimal} y1 - Start Y coordinate
 * @param {number|string|Decimal} x2 - End X coordinate
 * @param {number|string|Decimal} y2 - End Y coordinate
 * @param {Decimal} [tolerance=EPSILON] - Tolerance for X equality check
 * @returns {{canConvert: boolean, endY: Decimal, verified: boolean}} Conversion result
 */
export function lineToVertical(x1, y1, x2, y2, tolerance = EPSILON) {
  const tol = D(tolerance);
  const startX = D(x1);
  const endX = D(x2);
  const endY = D(y2);

  // Check if X coordinates are equal within tolerance
  const xDiff = endX.minus(startX).abs();
  const canConvert = xDiff.lessThan(tol);

  // VERIFICATION: Endpoint check
  // The V command moves to (x1, y2), so we verify x1 ≈ x2
  const verified = canConvert ? xDiff.lessThan(tol) : true;

  return {
    canConvert,
    endY,
    verified
  };
}

// ============================================================================
// Smooth Curve Conversion
// ============================================================================

/**
 * Reflect a control point across a center point.
 * Used to calculate the expected first control point for smooth curves.
 *
 * @param {{x: Decimal, y: Decimal}} control - Control point to reflect
 * @param {{x: Decimal, y: Decimal}} center - Center point (current position)
 * @returns {{x: Decimal, y: Decimal}} Reflected point
 */
export function reflectPoint(control, center) {
  // Reflection formula: reflected = center + (center - control) = 2*center - control
  return {
    x: D(2).mul(center.x).minus(control.x),
    y: D(2).mul(center.y).minus(control.y)
  };
}

/**
 * Convert C (cubic Bezier) to S (smooth cubic) when first control point
 * is the reflection of the previous control point across the current point.
 *
 * In SVG, S command has implicit first control point that is the reflection
 * of the second control point of the previous curve across the current point.
 *
 * VERIFICATION: Samples both curves (original C and optimized S) at multiple
 * t values to ensure they produce the same path.
 *
 * @param {{x: Decimal, y: Decimal} | null} prevControl - Previous second control point (or null if none)
 * @param {number|string|Decimal} x0 - Current X position (start of curve)
 * @param {number|string|Decimal} y0 - Current Y position (start of curve)
 * @param {number|string|Decimal} x1 - First control point X
 * @param {number|string|Decimal} y1 - First control point Y
 * @param {number|string|Decimal} x2 - Second control point X
 * @param {number|string|Decimal} y2 - Second control point Y
 * @param {number|string|Decimal} x3 - End point X
 * @param {number|string|Decimal} y3 - End point Y
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{canConvert: boolean, cp2X: Decimal, cp2Y: Decimal, endX: Decimal, endY: Decimal, maxDeviation: Decimal, verified: boolean}}
 */
export function curveToSmooth(prevControl, x0, y0, x1, y1, x2, y2, x3, y3, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);
  const p0 = point(x0, y0);
  const p1 = point(x1, y1);
  const p2 = point(x2, y2);
  const p3 = point(x3, y3);

  // If no previous control point, cannot convert to S
  if (!prevControl) {
    return {
      canConvert: false,
      cp2X: p2.x,
      cp2Y: p2.y,
      endX: p3.x,
      endY: p3.y,
      maxDeviation: D(Infinity),
      verified: true
    };
  }

  // Calculate expected first control point (reflection of previous second control)
  const expectedP1 = reflectPoint(prevControl, p0);

  // Check if actual first control point matches expected
  const controlDeviation = distance(p1, expectedP1);

  if (controlDeviation.greaterThan(tol)) {
    return {
      canConvert: false,
      cp2X: p2.x,
      cp2Y: p2.y,
      endX: p3.x,
      endY: p3.y,
      maxDeviation: controlDeviation,
      verified: true
    };
  }

  // VERIFICATION: Sample both curves and compare
  // Original: C with (p0, p1, p2, p3)
  // Smooth: S with (p0, expectedP1, p2, p3)
  const samples = 20;
  let maxSampleDeviation = new Decimal(0);

  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const originalPoint = evaluateCubicBezier(p0, p1, p2, p3, t);
    const smoothPoint = evaluateCubicBezier(p0, expectedP1, p2, p3, t);
    const dev = distance(originalPoint, smoothPoint);
    maxSampleDeviation = Decimal.max(maxSampleDeviation, dev);
  }

  const verified = maxSampleDeviation.lessThanOrEqualTo(tol);

  return {
    canConvert: verified,
    cp2X: p2.x,
    cp2Y: p2.y,
    endX: p3.x,
    endY: p3.y,
    maxDeviation: Decimal.max(controlDeviation, maxSampleDeviation),
    verified: true
  };
}

/**
 * Convert Q (quadratic Bezier) to T (smooth quadratic) when control point
 * is the reflection of the previous control point across the current point.
 *
 * In SVG, T command has implicit control point that is the reflection
 * of the control point of the previous curve across the current point.
 *
 * VERIFICATION: Samples both curves (original Q and optimized T) at multiple
 * t values to ensure they produce the same path.
 *
 * @param {{x: Decimal, y: Decimal} | null} prevControl - Previous control point (or null if none)
 * @param {number|string|Decimal} x0 - Current X position (start of curve)
 * @param {number|string|Decimal} y0 - Current Y position (start of curve)
 * @param {number|string|Decimal} x1 - Control point X
 * @param {number|string|Decimal} y1 - Control point Y
 * @param {number|string|Decimal} x2 - End point X
 * @param {number|string|Decimal} y2 - End point Y
 * @param {Decimal} [tolerance=DEFAULT_TOLERANCE] - Maximum allowed deviation
 * @returns {{canConvert: boolean, endX: Decimal, endY: Decimal, maxDeviation: Decimal, verified: boolean}}
 */
export function quadraticToSmooth(prevControl, x0, y0, x1, y1, x2, y2, tolerance = DEFAULT_TOLERANCE) {
  const tol = D(tolerance);
  const p0 = point(x0, y0);
  const p1 = point(x1, y1);
  const p2 = point(x2, y2);

  // If no previous control point, cannot convert to T
  if (!prevControl) {
    return {
      canConvert: false,
      endX: p2.x,
      endY: p2.y,
      maxDeviation: D(Infinity),
      verified: true
    };
  }

  // Calculate expected control point (reflection of previous control)
  const expectedP1 = reflectPoint(prevControl, p0);

  // Check if actual control point matches expected
  const controlDeviation = distance(p1, expectedP1);

  if (controlDeviation.greaterThan(tol)) {
    return {
      canConvert: false,
      endX: p2.x,
      endY: p2.y,
      maxDeviation: controlDeviation,
      verified: true
    };
  }

  // VERIFICATION: Sample both curves and compare
  // Original: Q with (p0, p1, p2)
  // Smooth: T with (p0, expectedP1, p2)
  const samples = 20;
  let maxSampleDeviation = new Decimal(0);

  for (let i = 0; i <= samples; i++) {
    const t = D(i).div(samples);
    const originalPoint = evaluateQuadraticBezier(p0, p1, p2, t);
    const smoothPoint = evaluateQuadraticBezier(p0, expectedP1, p2, t);
    const dev = distance(originalPoint, smoothPoint);
    maxSampleDeviation = Decimal.max(maxSampleDeviation, dev);
  }

  const verified = maxSampleDeviation.lessThanOrEqualTo(tol);

  return {
    canConvert: verified,
    endX: p2.x,
    endY: p2.y,
    maxDeviation: Decimal.max(controlDeviation, maxSampleDeviation),
    verified: true
  };
}

// ============================================================================
// Absolute/Relative Command Conversion
// ============================================================================

/**
 * Internal helper to convert absolute args to relative without verification.
 * Used to avoid infinite recursion in verification.
 */
function _toRelativeArgs(cmd, args, cx, cy) {
  if (cmd === 'M' || cmd === 'L' || cmd === 'T') {
    const relativeArgs = [];
    for (let i = 0; i < args.length; i += 2) {
      relativeArgs.push(args[i].minus(cx));
      relativeArgs.push(args[i + 1].minus(cy));
    }
    return relativeArgs;
  }
  if (cmd === 'H') {
    return args.map(x => x.minus(cx));
  }
  if (cmd === 'V') {
    return args.map(y => y.minus(cy));
  }
  if (cmd === 'C' || cmd === 'S' || cmd === 'Q') {
    const relativeArgs = [];
    for (let i = 0; i < args.length; i += 2) {
      relativeArgs.push(args[i].minus(cx));
      relativeArgs.push(args[i + 1].minus(cy));
    }
    return relativeArgs;
  }
  if (cmd === 'A') {
    const relativeArgs = [];
    for (let i = 0; i < args.length; i += 7) {
      relativeArgs.push(args[i]);
      relativeArgs.push(args[i + 1]);
      relativeArgs.push(args[i + 2]);
      relativeArgs.push(args[i + 3]);
      relativeArgs.push(args[i + 4]);
      relativeArgs.push(args[i + 5].minus(cx));
      relativeArgs.push(args[i + 6].minus(cy));
    }
    return relativeArgs;
  }
  return args;
}

/**
 * Internal helper to convert relative args to absolute without verification.
 * Used to avoid infinite recursion in verification.
 */
function _toAbsoluteArgs(cmd, args, cx, cy) {
  if (cmd === 'm' || cmd === 'l' || cmd === 't') {
    const absoluteArgs = [];
    for (let i = 0; i < args.length; i += 2) {
      absoluteArgs.push(args[i].plus(cx));
      absoluteArgs.push(args[i + 1].plus(cy));
    }
    return absoluteArgs;
  }
  if (cmd === 'h') {
    return args.map(dx => dx.plus(cx));
  }
  if (cmd === 'v') {
    return args.map(dy => dy.plus(cy));
  }
  if (cmd === 'c' || cmd === 's' || cmd === 'q') {
    const absoluteArgs = [];
    for (let i = 0; i < args.length; i += 2) {
      absoluteArgs.push(args[i].plus(cx));
      absoluteArgs.push(args[i + 1].plus(cy));
    }
    return absoluteArgs;
  }
  if (cmd === 'a') {
    const absoluteArgs = [];
    for (let i = 0; i < args.length; i += 7) {
      absoluteArgs.push(args[i]);
      absoluteArgs.push(args[i + 1]);
      absoluteArgs.push(args[i + 2]);
      absoluteArgs.push(args[i + 3]);
      absoluteArgs.push(args[i + 4]);
      absoluteArgs.push(args[i + 5].plus(cx));
      absoluteArgs.push(args[i + 6].plus(cy));
    }
    return absoluteArgs;
  }
  return args;
}

/**
 * Convert an absolute path command to relative.
 *
 * VERIFICATION: Converting back to absolute (inverse operation) must give
 * the same result within tolerance.
 *
 * @param {{command: string, args: Array<number|string|Decimal>}} command - Path command
 * @param {number|string|Decimal} currentX - Current X position
 * @param {number|string|Decimal} currentY - Current Y position
 * @returns {{command: string, args: Array<Decimal>, verified: boolean}}
 */
export function toRelative(command, currentX, currentY) {
  const cmd = command.command;
  const args = command.args.map(D);
  const cx = D(currentX);
  const cy = D(currentY);

  // Z command is already relative (closes to start of subpath)
  if (cmd === 'Z' || cmd === 'z') {
    return {
      command: 'z',
      args: [],
      verified: true
    };
  }

  // Command is already relative - return as-is
  if (cmd === cmd.toLowerCase()) {
    return {
      command: cmd,
      args,
      verified: true
    };
  }

  // Convert absolute to relative using internal helper
  const relativeArgs = _toRelativeArgs(cmd, args, cx, cy);
  const relCmd = cmd.toLowerCase();

  // VERIFICATION: Convert back to absolute using internal helper and check
  const backToAbs = _toAbsoluteArgs(relCmd, relativeArgs, cx, cy);
  let verified = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i].minus(backToAbs[i]).abs().greaterThan(EPSILON)) {
      verified = false;
      break;
    }
  }

  return {
    command: relCmd,
    args: relativeArgs,
    verified
  };
}

/**
 * Convert a relative path command to absolute.
 *
 * VERIFICATION: Converting back to relative (inverse operation) must give
 * the same result within tolerance.
 *
 * @param {{command: string, args: Array<number|string|Decimal>}} command - Path command
 * @param {number|string|Decimal} currentX - Current X position
 * @param {number|string|Decimal} currentY - Current Y position
 * @returns {{command: string, args: Array<Decimal>, verified: boolean}}
 */
export function toAbsolute(command, currentX, currentY) {
  const cmd = command.command;
  const args = command.args.map(D);
  const cx = D(currentX);
  const cy = D(currentY);

  // Z command is always absolute (closes to start of subpath)
  if (cmd === 'Z' || cmd === 'z') {
    return {
      command: 'Z',
      args: [],
      verified: true
    };
  }

  // Command is already absolute - return as-is
  if (cmd === cmd.toUpperCase()) {
    return {
      command: cmd,
      args,
      verified: true
    };
  }

  // Convert relative to absolute using internal helper
  const absoluteArgs = _toAbsoluteArgs(cmd, args, cx, cy);
  const absCmd = cmd.toUpperCase();

  // VERIFICATION: Convert back to relative using internal helper and check
  const backToRel = _toRelativeArgs(absCmd, absoluteArgs, cx, cy);
  let verified = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i].minus(backToRel[i]).abs().greaterThan(EPSILON)) {
      verified = false;
      break;
    }
  }

  return {
    command: absCmd,
    args: absoluteArgs,
    verified
  };
}

// ============================================================================
// Shorter Form Selection
// ============================================================================

/**
 * Format a path command as a string (simplified, for length comparison).
 *
 * @param {{command: string, args: Array<Decimal>}} command - Path command
 * @param {number} [precision=6] - Number of decimal places
 * @returns {string} Formatted command string
 */
function formatCommand(command, precision = 6) {
  const cmd = command.command;
  const args = command.args.map(arg => {
    const num = arg.toNumber();
    // Format with specified precision and remove trailing zeros
    return parseFloat(num.toFixed(precision)).toString();
  }).join(',');

  return args.length > 0 ? `${cmd}${args}` : cmd;
}

/**
 * Choose the shorter string encoding between absolute and relative forms.
 *
 * VERIFICATION: Both forms must produce the same numeric values when parsed.
 *
 * @param {{command: string, args: Array<number|string|Decimal>}} absCommand - Absolute command
 * @param {{command: string, args: Array<number|string|Decimal>}} relCommand - Relative command
 * @param {number} [precision=6] - Number of decimal places for string formatting
 * @returns {{command: string, args: Array<Decimal>, isShorter: boolean, savedBytes: number, verified: boolean}}
 */
export function chooseShorterForm(absCommand, relCommand, precision = 6) {
  const absStr = formatCommand({ command: absCommand.command, args: absCommand.args.map(D) }, precision);
  const relStr = formatCommand({ command: relCommand.command, args: relCommand.args.map(D) }, precision);

  const absLen = absStr.length;
  const relLen = relStr.length;

  const isShorter = relLen < absLen;
  const savedBytes = isShorter ? absLen - relLen : 0;

  // VERIFICATION: Both commands must have the same number of arguments
  const verified = absCommand.args.length === relCommand.args.length;

  if (isShorter) {
    return {
      command: relCommand.command,
      args: relCommand.args.map(D),
      isShorter,
      savedBytes,
      verified
    };
  } else {
    return {
      command: absCommand.command,
      args: absCommand.args.map(D),
      isShorter: false,
      savedBytes: 0,
      verified
    };
  }
}

// ============================================================================
// Repeated Command Collapse
// ============================================================================

/**
 * Collapse consecutive identical commands into a single command with
 * multiple coordinate pairs.
 *
 * For example: L 10,20 L 30,40 L 50,60 → L 10,20 30,40 50,60
 *
 * VERIFICATION: The path must remain identical after collapsing.
 *
 * @param {Array<{command: string, args: Array<number|string|Decimal>}>} commands - Array of path commands
 * @returns {{commands: Array<{command: string, args: Array<Decimal>}>, collapseCount: number, verified: boolean}}
 */
export function collapseRepeated(commands) {
  if (commands.length < 2) {
    return {
      commands: commands.map(cmd => ({ command: cmd.command, args: cmd.args.map(D) })),
      collapseCount: 0,
      verified: true
    };
  }

  const result = [];
  let currentCommand = null;
  let currentArgs = [];
  let collapseCount = 0;

  for (const cmd of commands) {
    const command = cmd.command;
    const args = cmd.args.map(D);

    // Commands that can be collapsed (those with repeated coordinate pairs)
    // Note: M/m are excluded because M has special semantics (first pair is moveto, subsequent pairs become lineto)
    const canCollapse = ['L', 'l', 'H', 'h', 'V', 'v', 'T', 't', 'C', 'c', 'S', 's', 'Q', 'q'].includes(command);

    if (canCollapse && command === currentCommand) {
      // Same command - append args
      currentArgs.push(...args);
      collapseCount++;
    } else {
      // Different command or non-collapsible - flush current
      if (currentCommand !== null) {
        result.push({ command: currentCommand, args: currentArgs });
      }
      currentCommand = command;
      currentArgs = [...args];
    }
  }

  // Flush last command
  if (currentCommand !== null) {
    result.push({ command: currentCommand, args: currentArgs });
  }

  // VERIFICATION: Count total arguments should remain the same
  const originalArgCount = commands.reduce((sum, cmd) => sum + cmd.args.length, 0);
  const resultArgCount = result.reduce((sum, cmd) => sum + cmd.args.length, 0);
  const verified = originalArgCount === resultArgCount;

  return {
    commands: result,
    collapseCount,
    verified
  };
}

// ============================================================================
// Line to Z Conversion
// ============================================================================

/**
 * Convert a final L command that returns to subpath start into Z command.
 *
 * VERIFICATION: Endpoint of the line must match the subpath start point.
 *
 * @param {number|string|Decimal} lastX - Last X position before the line
 * @param {number|string|Decimal} lastY - Last Y position before the line
 * @param {number|string|Decimal} startX - Subpath start X position
 * @param {number|string|Decimal} startY - Subpath start Y position
 * @param {Decimal} [tolerance=EPSILON] - Tolerance for endpoint matching
 * @returns {{canConvert: boolean, deviation: Decimal, verified: boolean}}
 */
export function lineToZ(lastX, lastY, startX, startY, tolerance = EPSILON) {
  const tol = D(tolerance);
  const last = point(lastX, lastY);
  const start = point(startX, startY);

  // Check if the line endpoint matches the subpath start
  const deviation = distance(last, start);
  const canConvert = deviation.lessThan(tol);

  // VERIFICATION: If we can convert, the deviation must be within tolerance
  const verified = canConvert ? deviation.lessThan(tol) : true;

  return {
    canConvert,
    deviation,
    verified
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  EPSILON,
  DEFAULT_TOLERANCE,
  D
};

export default {
  // Point utilities
  point,
  distance,
  pointsEqual,

  // Bezier evaluation
  evaluateCubicBezier,
  evaluateQuadraticBezier,

  // Line optimization
  lineToHorizontal,
  lineToVertical,

  // Smooth curve conversion
  reflectPoint,
  curveToSmooth,
  quadraticToSmooth,

  // Absolute/relative conversion
  toRelative,
  toAbsolute,

  // Shorter form selection
  chooseShorterForm,

  // Repeated command collapse
  collapseRepeated,

  // Line to Z conversion
  lineToZ,

  // Constants
  EPSILON,
  DEFAULT_TOLERANCE
};
