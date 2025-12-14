import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';

const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Standard kappa for 90° arcs (4 Bezier curves per circle).
 * kappa = 4/3 * (sqrt(2) - 1) ≈ 0.5522847498
 * Maximum radial error: ~0.027%
 */
export function getKappa() {
  const two = new Decimal(2);
  const three = new Decimal(3);
  const four = new Decimal(4);
  return four.mul(two.sqrt().minus(1)).div(three);
}

/**
 * Compute the optimal Bezier control point distance for any arc angle.
 * Formula: L = (4/3) * tan(theta/4) where theta is in radians
 *
 * This is the generalization of the kappa constant.
 * For 90° (π/2): L = (4/3) * tan(π/8) ≈ 0.5522847498 (standard kappa)
 *
 * References:
 * - Spencer Mortensen's optimal Bezier circle approximation:
 *   https://spencermortensen.com/articles/bezier-circle/
 *   Derives the optimal kappa for minimizing radial error in quarter-circle arcs.
 *
 * - Akhil's ellipse approximation with π/4 step angle:
 *   https://www.blog.akhil.cc/ellipse
 *   Shows that π/4 (45°) is the optimal step angle for Bezier arc approximation,
 *   based on Maisonobe's derivation. This allows precomputing the alpha coefficient.
 *
 * - Math Stack Exchange derivation:
 *   https://math.stackexchange.com/questions/873224
 *   General formula for control point distance for any arc angle.
 *
 * @param {Decimal|number} thetaRadians - Arc angle in radians
 * @returns {Decimal} Control point distance factor (multiply by radius)
 */
export function getKappaForArc(thetaRadians) {
  const theta = D(thetaRadians);
  const four = new Decimal(4);
  const three = new Decimal(3);
  // L = (4/3) * tan(theta/4)
  return four.div(three).mul(Decimal.tan(theta.div(four)));
}

/**
 * High-precision circle to path using N Bezier arcs.
 * More arcs = better approximation of the true circle.
 *
 * IMPORTANT: Arc count should be a multiple of 4 (for symmetry) and ideally
 * a multiple of 8 (for optimal π/4 step angle as per Maisonobe's derivation).
 * Reference: https://www.blog.akhil.cc/ellipse
 *
 * Error analysis (measured):
 * - 4 arcs (90° = π/2 each): ~0.027% max radial error (standard)
 * - 8 arcs (45° = π/4 each): ~0.0004% max radial error (optimal base)
 * - 16 arcs (22.5° = π/8 each): ~0.000007% max radial error
 * - 32 arcs (11.25° = π/16 each): ~0.0000004% max radial error
 * - 64 arcs (5.625° = π/32 each): ~0.00000001% max radial error
 *
 * @param {number|Decimal} cx - Center X
 * @param {number|Decimal} cy - Center Y
 * @param {number|Decimal} r - Radius
 * @param {number} arcs - Number of Bezier arcs (must be multiple of 4; 8, 16, 32, 64 recommended)
 * @param {number} precision - Decimal precision for output
 * @returns {string} SVG path data
 */
export function circleToPathDataHP(cx, cy, r, arcs = 8, precision = 6) {
  return ellipseToPathDataHP(cx, cy, r, r, arcs, precision);
}

/**
 * High-precision ellipse to path using N Bezier arcs.
 * More arcs = better approximation of the true ellipse.
 *
 * Arc count must be a multiple of 4 for proper symmetry.
 * Multiples of 8 are optimal (π/4 step angle per Maisonobe).
 *
 * @param {number|Decimal} cx - Center X
 * @param {number|Decimal} cy - Center Y
 * @param {number|Decimal} rx - Radius X
 * @param {number|Decimal} ry - Radius Y
 * @param {number} arcs - Number of Bezier arcs (must be multiple of 4; 8, 16, 32, 64 recommended)
 * @param {number} precision - Decimal precision for output
 * @returns {string} SVG path data
 */
export function ellipseToPathDataHP(cx, cy, rx, ry, arcs = 8, precision = 6) {
  // Enforce multiple of 4 for symmetry
  if (arcs % 4 !== 0) {
    arcs = Math.ceil(arcs / 4) * 4;
  }
  const cxD = D(cx), cyD = D(cy), rxD = D(rx), ryD = D(ry);
  const f = v => formatNumber(v, precision);

  // Angle per arc in radians
  const PI = Decimal.acos(-1);
  const TWO_PI = PI.mul(2);
  const arcAngle = TWO_PI.div(arcs);

  // Control point distance for this arc angle
  const kappa = getKappaForArc(arcAngle);

  // Generate path
  const commands = [];

  for (let i = 0; i < arcs; i++) {
    const startAngle = arcAngle.mul(i);
    const endAngle = arcAngle.mul(i + 1);

    // Start and end points on ellipse
    const cosStart = Decimal.cos(startAngle);
    const sinStart = Decimal.sin(startAngle);
    const cosEnd = Decimal.cos(endAngle);
    const sinEnd = Decimal.sin(endAngle);

    const x0 = cxD.plus(rxD.mul(cosStart));
    const y0 = cyD.plus(ryD.mul(sinStart));
    const x3 = cxD.plus(rxD.mul(cosEnd));
    const y3 = cyD.plus(ryD.mul(sinEnd));

    // Tangent vectors at start and end (perpendicular to radius, scaled by kappa)
    // Tangent at angle θ: (-sin(θ), cos(θ))
    // Control point 1: start + kappa * tangent_at_start * radius
    // Control point 2: end - kappa * tangent_at_end * radius
    const tx0 = sinStart.neg();  // tangent x at start
    const ty0 = cosStart;        // tangent y at start
    const tx3 = sinEnd.neg();    // tangent x at end
    const ty3 = cosEnd;          // tangent y at end

    const x1 = x0.plus(kappa.mul(rxD).mul(tx0));
    const y1 = y0.plus(kappa.mul(ryD).mul(ty0));
    const x2 = x3.minus(kappa.mul(rxD).mul(tx3));
    const y2 = y3.minus(kappa.mul(ryD).mul(ty3));

    if (i === 0) {
      commands.push(`M${f(x0)} ${f(y0)}`);
    }
    commands.push(`C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x3)} ${f(y3)}`);
  }

  commands.push('Z');
  return commands.join(' ');
}

function formatNumber(value, precision = 6) {
  // Format with precision then remove trailing zeros for smaller output
  let str = value.toFixed(precision);
  // Remove trailing zeros after decimal point
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }
  return str;
}

export function circleToPathData(cx, cy, r, precision = 6) {
  const cxD = D(cx), cyD = D(cy), rD = D(r);
  const k = getKappa().mul(rD);
  const x0 = cxD.plus(rD), y0 = cyD;
  const c1x1 = x0, c1y1 = y0.minus(k), c1x2 = cxD.plus(k), c1y2 = cyD.minus(rD), x1 = cxD, y1 = cyD.minus(rD);
  const c2x1 = cxD.minus(k), c2y1 = y1, c2x2 = cxD.minus(rD), c2y2 = cyD.minus(k), x2 = cxD.minus(rD), y2 = cyD;
  const c3x1 = x2, c3y1 = cyD.plus(k), c3x2 = cxD.minus(k), c3y2 = cyD.plus(rD), x3 = cxD, y3 = cyD.plus(rD);
  const c4x1 = cxD.plus(k), c4y1 = y3, c4x2 = x0, c4y2 = cyD.plus(k);
  const f = v => formatNumber(v, precision);
  return `M${f(x0)} ${f(y0)}C${f(c1x1)} ${f(c1y1)} ${f(c1x2)} ${f(c1y2)} ${f(x1)} ${f(y1)}C${f(c2x1)} ${f(c2y1)} ${f(c2x2)} ${f(c2y2)} ${f(x2)} ${f(y2)}C${f(c3x1)} ${f(c3y1)} ${f(c3x2)} ${f(c3y2)} ${f(x3)} ${f(y3)}C${f(c4x1)} ${f(c4y1)} ${f(c4x2)} ${f(c4y2)} ${f(x0)} ${f(y0)}Z`;
}

export function ellipseToPathData(cx, cy, rx, ry, precision = 6) {
  const cxD = D(cx), cyD = D(cy), rxD = D(rx), ryD = D(ry);
  const kappa = getKappa(), kx = kappa.mul(rxD), ky = kappa.mul(ryD);
  const x0 = cxD.plus(rxD), y0 = cyD;
  const c1x1 = x0, c1y1 = y0.minus(ky), c1x2 = cxD.plus(kx), c1y2 = cyD.minus(ryD), x1 = cxD, y1 = cyD.minus(ryD);
  const c2x1 = cxD.minus(kx), c2y1 = y1, c2x2 = cxD.minus(rxD), c2y2 = cyD.minus(ky), x2 = cxD.minus(rxD), y2 = cyD;
  const c3x1 = x2, c3y1 = cyD.plus(ky), c3x2 = cxD.minus(kx), c3y2 = cyD.plus(ryD), x3 = cxD, y3 = cyD.plus(ryD);
  const c4x1 = cxD.plus(kx), c4y1 = y3, c4x2 = x0, c4y2 = cyD.plus(ky);
  const f = v => formatNumber(v, precision);
  return `M${f(x0)} ${f(y0)}C${f(c1x1)} ${f(c1y1)} ${f(c1x2)} ${f(c1y2)} ${f(x1)} ${f(y1)}C${f(c2x1)} ${f(c2y1)} ${f(c2x2)} ${f(c2y2)} ${f(x2)} ${f(y2)}C${f(c3x1)} ${f(c3y1)} ${f(c3x2)} ${f(c3y2)} ${f(x3)} ${f(y3)}C${f(c4x1)} ${f(c4y1)} ${f(c4x2)} ${f(c4y2)} ${f(x0)} ${f(y0)}Z`;
}

export function rectToPathData(x, y, width, height, rx = 0, ry = null, useArcs = false, precision = 6) {
  const xD = D(x), yD = D(y), wD = D(width), hD = D(height);
  let rxD = D(rx || 0), ryD = ry !== null ? D(ry) : rxD;
  const halfW = wD.div(2), halfH = hD.div(2);
  if (rxD.gt(halfW)) rxD = halfW;
  if (ryD.gt(halfH)) ryD = halfH;
  const f = v => formatNumber(v, precision);
  if (rxD.isZero() || ryD.isZero()) {
    const x1 = xD.plus(wD), y1 = yD.plus(hD);
    // Use H (horizontal) and V (vertical) commands for smaller output
    return `M${f(xD)} ${f(yD)}H${f(x1)}V${f(y1)}H${f(xD)}Z`;
  }
  const left = xD, right = xD.plus(wD), top = yD, bottom = yD.plus(hD);
  const leftInner = left.plus(rxD), rightInner = right.minus(rxD);
  const topInner = top.plus(ryD), bottomInner = bottom.minus(ryD);
  if (useArcs) {
    return `M${f(leftInner)} ${f(top)}L${f(rightInner)} ${f(top)}A${f(rxD)} ${f(ryD)} 0 0 1 ${f(right)} ${f(topInner)}L${f(right)} ${f(bottomInner)}A${f(rxD)} ${f(ryD)} 0 0 1 ${f(rightInner)} ${f(bottom)}L${f(leftInner)} ${f(bottom)}A${f(rxD)} ${f(ryD)} 0 0 1 ${f(left)} ${f(bottomInner)}L${f(left)} ${f(topInner)}A${f(rxD)} ${f(ryD)} 0 0 1 ${f(leftInner)} ${f(top)}Z`;
  }
  const kappa = getKappa(), kx = kappa.mul(rxD), ky = kappa.mul(ryD);
  // Each corner has two Bezier control points:
  // First control point: offset from start point along the edge tangent
  // Second control point: offset from end point along the edge tangent
  return `M${f(leftInner)} ${f(top)}L${f(rightInner)} ${f(top)}C${f(rightInner.plus(kx))} ${f(top)} ${f(right)} ${f(topInner.minus(ky))} ${f(right)} ${f(topInner)}L${f(right)} ${f(bottomInner)}C${f(right)} ${f(bottomInner.plus(ky))} ${f(rightInner.plus(kx))} ${f(bottom)} ${f(rightInner)} ${f(bottom)}L${f(leftInner)} ${f(bottom)}C${f(leftInner.minus(kx))} ${f(bottom)} ${f(left)} ${f(bottomInner.plus(ky))} ${f(left)} ${f(bottomInner)}L${f(left)} ${f(topInner)}C${f(left)} ${f(topInner.minus(ky))} ${f(leftInner.minus(kx))} ${f(top)} ${f(leftInner)} ${f(top)}Z`;
}

export function lineToPathData(x1, y1, x2, y2, precision = 6) {
  const f = v => formatNumber(D(v), precision);
  return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
}

function parsePoints(points) {
  // Handle null/undefined
  if (points == null) return [];
  // Handle arrays
  if (Array.isArray(points)) return points.map(([x, y]) => [D(x), D(y)]);
  // Handle SVGAnimatedPoints or objects with baseVal
  if (typeof points === 'object' && points.baseVal !== undefined) {
    points = points.baseVal;
  }
  // Convert to string if not already a string
  if (typeof points !== 'string') {
    if (typeof points.toString === 'function') {
      points = points.toString();
    } else {
      return [];
    }
  }
  const nums = points.split(/[\s,]+/).filter(s => s.length > 0).map(s => D(s));
  const pairs = [];
  for (let i = 0; i < nums.length; i += 2) {
    if (i + 1 < nums.length) pairs.push([nums[i], nums[i + 1]]);
  }
  return pairs;
}

export function polylineToPathData(points, precision = 6) {
  const pairs = parsePoints(points);
  if (pairs.length === 0) return '';
  const f = v => formatNumber(v, precision);
  const [x0, y0] = pairs[0];
  let path = `M${f(x0)} ${f(y0)}`;
  for (let i = 1; i < pairs.length; i++) {
    const [x, y] = pairs[i];
    path += `L${f(x)} ${f(y)}`;
  }
  return path;
}

export function polygonToPathData(points, precision = 6) {
  const path = polylineToPathData(points, precision);
  return path ? path + ' Z' : '';
}

// Parameter count for each SVG path command
const COMMAND_PARAMS = {
  M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1,
  C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2,
  A: 7, a: 7, Z: 0, z: 0
};

export function parsePathData(pathData) {
  const commands = [];
  const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])\s*([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;
  while ((match = commandRegex.exec(pathData)) !== null) {
    const command = match[1];
    const argsStr = match[2].trim();

    // FIX: Use regex to extract numbers, handles implicit negative separators (e.g., "0.8-2.9" -> ["0.8", "-2.9"])
    // Per W3C SVG spec, negative signs can act as delimiters without spaces
    const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
    const allArgs = argsStr.length > 0
      ? Array.from(argsStr.matchAll(numRegex), m => D(m[0]))
      : [];

    const paramCount = COMMAND_PARAMS[command];

    if (paramCount === 0 || allArgs.length === 0) {
      // Z/z command or command with no args
      commands.push({ command, args: [] });
    } else {
      // Split args into groups based on parameter count
      // Handle implicit command repetition per SVG spec
      for (let i = 0; i < allArgs.length; i += paramCount) {
        const args = allArgs.slice(i, i + paramCount);
        if (args.length === paramCount) {
          // For M/m, first group is moveto, subsequent groups become implicit lineto (L/l)
          let effectiveCmd = command;
          if (i > 0 && (command === 'M' || command === 'm')) {
            effectiveCmd = command === 'M' ? 'L' : 'l';
          }
          commands.push({ command: effectiveCmd, args });
        }
        // Incomplete arg groups are silently dropped per SVG error handling
      }
    }
  }
  return commands;
}

export function pathArrayToString(commands, precision = 6) {
  return commands.map(({ command, args }) => {
    const argsStr = args.map(a => formatNumber(a, precision)).join(' ');
    return argsStr.length > 0 ? `${command} ${argsStr}` : command;
  }).join(' ');
}

export function pathToAbsolute(pathData) {
  const commands = parsePathData(pathData);
  const result = [];
  let currentX = new Decimal(0), currentY = new Decimal(0);
  let subpathStartX = new Decimal(0), subpathStartY = new Decimal(0);
  let lastControlX = new Decimal(0), lastControlY = new Decimal(0);
  let lastCommand = '';

  for (const { command, args } of commands) {
    const isRelative = command === command.toLowerCase();
    const upperCmd = command.toUpperCase();
    if (upperCmd === 'M') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      const y = isRelative ? currentY.plus(args[1]) : args[1];
      currentX = x; currentY = y; subpathStartX = x; subpathStartY = y;
      result.push({ command: 'M', args: [x, y] });
      lastCommand = 'M';
    } else if (upperCmd === 'L') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      const y = isRelative ? currentY.plus(args[1]) : args[1];
      currentX = x; currentY = y;
      result.push({ command: 'L', args: [x, y] });
      lastCommand = 'L';
    } else if (upperCmd === 'H') {
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      currentX = x;
      result.push({ command: 'L', args: [x, currentY] });
      lastCommand = 'H';
    } else if (upperCmd === 'V') {
      const y = isRelative ? currentY.plus(args[0]) : args[0];
      currentY = y;
      result.push({ command: 'L', args: [currentX, y] });
      lastCommand = 'V';
    } else if (upperCmd === 'C') {
      const x1 = isRelative ? currentX.plus(args[0]) : args[0];
      const y1 = isRelative ? currentY.plus(args[1]) : args[1];
      const x2 = isRelative ? currentX.plus(args[2]) : args[2];
      const y2 = isRelative ? currentY.plus(args[3]) : args[3];
      const x = isRelative ? currentX.plus(args[4]) : args[4];
      const y = isRelative ? currentY.plus(args[5]) : args[5];
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastCommand = 'C';
    } else if (upperCmd === 'S') {
      // Smooth cubic Bezier: 4 args (x2, y2, x, y)
      // First control point is reflection of previous second control point
      let x1, y1;
      if (lastCommand === 'C' || lastCommand === 'S') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX;
        y1 = currentY;
      }
      const x2 = isRelative ? currentX.plus(args[0]) : args[0];
      const y2 = isRelative ? currentY.plus(args[1]) : args[1];
      const x = isRelative ? currentX.plus(args[2]) : args[2];
      const y = isRelative ? currentY.plus(args[3]) : args[3];
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastCommand = 'S';
    } else if (upperCmd === 'Q') {
      // Quadratic Bezier: 4 args (x1, y1, x, y)
      const x1 = isRelative ? currentX.plus(args[0]) : args[0];
      const y1 = isRelative ? currentY.plus(args[1]) : args[1];
      const x = isRelative ? currentX.plus(args[2]) : args[2];
      const y = isRelative ? currentY.plus(args[3]) : args[3];
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      result.push({ command: 'Q', args: [x1, y1, x, y] });
      lastCommand = 'Q';
    } else if (upperCmd === 'T') {
      // Smooth quadratic Bezier: 2 args (x, y)
      // Control point is reflection of previous control point
      let x1, y1;
      if (lastCommand === 'Q' || lastCommand === 'T') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX;
        y1 = currentY;
      }
      const x = isRelative ? currentX.plus(args[0]) : args[0];
      const y = isRelative ? currentY.plus(args[1]) : args[1];
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      result.push({ command: 'Q', args: [x1, y1, x, y] });
      lastCommand = 'T';
    } else if (upperCmd === 'A') {
      const x = isRelative ? currentX.plus(args[5]) : args[5];
      const y = isRelative ? currentY.plus(args[6]) : args[6];
      currentX = x; currentY = y;
      result.push({ command: 'A', args: [args[0], args[1], args[2], args[3], args[4], x, y] });
      lastCommand = 'A';
    } else if (upperCmd === 'Z') {
      currentX = subpathStartX; currentY = subpathStartY;
      result.push({ command: 'Z', args: [] });
      lastCommand = 'Z';
    } else {
      result.push({ command, args });
      lastCommand = command;
    }
  }
  return pathArrayToString(result);
}

export function transformArcParams(rx, ry, xAxisRotation, largeArc, sweep, endX, endY, matrix) {
  const rxD = D(rx), ryD = D(ry), rotD = D(xAxisRotation);
  const endXD = D(endX), endYD = D(endY);

  // Transform the endpoint
  const endPoint = Matrix.from([[endXD], [endYD], [new Decimal(1)]]);
  const transformedEnd = matrix.mul(endPoint);
  const newEndX = transformedEnd.data[0][0].div(transformedEnd.data[2][0]);
  const newEndY = transformedEnd.data[1][0].div(transformedEnd.data[2][0]);

  // Extract the 2x2 linear part of the affine transformation
  const a = matrix.data[0][0], b = matrix.data[0][1];
  const c = matrix.data[1][0], d = matrix.data[1][1];

  // Calculate determinant to check for reflection (flips sweep direction)
  const det = a.mul(d).minus(b.mul(c));
  const newSweep = det.isNegative() ? (sweep === 1 ? 0 : 1) : sweep;

  // Transform ellipse radii by applying the 2x2 linear transformation
  // For an ellipse with rotation, we need to compute the transformed ellipse parameters
  // Convert rotation to radians
  const rotRad = rotD.mul(new Decimal(Math.PI)).div(180);
  const cosRot = Decimal.cos(rotRad), sinRot = Decimal.sin(rotRad);

  // Unit ellipse basis vectors (before xAxisRotation)
  // The ellipse can be parameterized as: [rx*cos(t)*cos(rot) - ry*sin(t)*sin(rot), rx*cos(t)*sin(rot) + ry*sin(t)*cos(rot)]
  // We transform the two principal axis vectors and compute new radii from them

  // Vector along major axis (rotated rx direction)
  const v1x = rxD.mul(cosRot);
  const v1y = rxD.mul(sinRot);

  // Vector along minor axis (rotated ry direction, perpendicular to major)
  const v2x = ryD.mul(sinRot).neg();
  const v2y = ryD.mul(cosRot);

  // Apply linear transformation to these vectors
  const t1x = a.mul(v1x).plus(b.mul(v1y));
  const t1y = c.mul(v1x).plus(d.mul(v1y));
  const t2x = a.mul(v2x).plus(b.mul(v2y));
  const t2y = c.mul(v2x).plus(d.mul(v2y));

  // Compute the lengths of transformed vectors (approximate new radii)
  // For a general affine transform, this gives the scale applied to each axis
  const newRx = Decimal.sqrt(t1x.mul(t1x).plus(t1y.mul(t1y)));
  const newRy = Decimal.sqrt(t2x.mul(t2x).plus(t2y.mul(t2y)));

  // Compute new rotation angle from the transformed major axis
  const newRotRad = Decimal.atan2(t1y, t1x);
  const newRot = newRotRad.mul(180).div(new Decimal(Math.PI));

  return [newRx, newRy, newRot, largeArc, newSweep, newEndX, newEndY];
}

export function transformPathData(pathData, matrix, precision = 6) {
  const absPath = pathToAbsolute(pathData);
  const commands = parsePathData(absPath);
  const result = [];
  for (const { command, args } of commands) {
    if (command === 'M' || command === 'L') {
      const pt = Matrix.from([[args[0]], [args[1]], [new Decimal(1)]]);
      const transformed = matrix.mul(pt);
      const x = transformed.data[0][0].div(transformed.data[2][0]);
      const y = transformed.data[1][0].div(transformed.data[2][0]);
      result.push({ command, args: [x, y] });
    } else if (command === 'C') {
      const transformedArgs = [];
      for (let i = 0; i < 6; i += 2) {
        const pt = Matrix.from([[args[i]], [args[i + 1]], [new Decimal(1)]]);
        const transformed = matrix.mul(pt);
        transformedArgs.push(transformed.data[0][0].div(transformed.data[2][0]));
        transformedArgs.push(transformed.data[1][0].div(transformed.data[2][0]));
      }
      result.push({ command, args: transformedArgs });
    } else if (command === 'A') {
      const [newRx, newRy, newRot, newLarge, newSweep, newEndX, newEndY] =
        transformArcParams(args[0], args[1], args[2], args[3], args[4], args[5], args[6], matrix);
      result.push({ command, args: [newRx, newRy, newRot, newLarge, newSweep, newEndX, newEndY] });
    } else {
      result.push({ command, args });
    }
  }
  return pathArrayToString(result, precision);
}

function quadraticToCubic(x0, y0, x1, y1, x2, y2) {
  const twoThirds = new Decimal(2).div(3);
  const cp1x = x0.plus(twoThirds.mul(x1.minus(x0)));
  const cp1y = y0.plus(twoThirds.mul(y1.minus(y0)));
  const cp2x = x2.plus(twoThirds.mul(x1.minus(x2)));
  const cp2y = y2.plus(twoThirds.mul(y1.minus(y2)));
  return [cp1x, cp1y, cp2x, cp2y, x2, y2];
}

export function pathToCubics(pathData) {
  const absPath = pathToAbsolute(pathData);
  const commands = parsePathData(absPath);
  const result = [];
  let currentX = new Decimal(0), currentY = new Decimal(0);
  let lastControlX = new Decimal(0), lastControlY = new Decimal(0);
  let lastCommand = '';
  for (const { command, args } of commands) {
    if (command === 'M') {
      currentX = args[0]; currentY = args[1];
      result.push({ command: 'M', args: [currentX, currentY] });
      lastCommand = 'M';
    } else if (command === 'L') {
      const x = args[0], y = args[1];
      result.push({ command: 'C', args: [currentX, currentY, x, y, x, y] });
      currentX = x; currentY = y;
      lastCommand = 'L';
    } else if (command === 'C') {
      const [x1, y1, x2, y2, x, y] = args;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      lastCommand = 'C';
    } else if (command === 'S') {
      let x1, y1;
      if (lastCommand === 'C' || lastCommand === 'S') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX; y1 = currentY;
      }
      const [x2, y2, x, y] = args;
      result.push({ command: 'C', args: [x1, y1, x2, y2, x, y] });
      lastControlX = x2; lastControlY = y2;
      currentX = x; currentY = y;
      lastCommand = 'S';
    } else if (command === 'Q') {
      const [x1, y1, x, y] = args;
      const cubic = quadraticToCubic(currentX, currentY, x1, y1, x, y);
      result.push({ command: 'C', args: cubic });
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      lastCommand = 'Q';
    } else if (command === 'T') {
      let x1, y1;
      if (lastCommand === 'Q' || lastCommand === 'T') {
        x1 = currentX.mul(2).minus(lastControlX);
        y1 = currentY.mul(2).minus(lastControlY);
      } else {
        x1 = currentX; y1 = currentY;
      }
      const [x, y] = args;
      const cubic = quadraticToCubic(currentX, currentY, x1, y1, x, y);
      result.push({ command: 'C', args: cubic });
      lastControlX = x1; lastControlY = y1;
      currentX = x; currentY = y;
      lastCommand = 'T';
    } else if (command === 'Z') {
      result.push({ command: 'Z', args: [] });
      lastCommand = 'Z';
    } else {
      result.push({ command, args });
      lastCommand = command;
    }
  }
  return pathArrayToString(result);
}

/**
 * Strip CSS units from a value string (e.g., "100px" -> 100, "50%" -> 50, "2em" -> 2)
 * Returns the numeric value or 0 if parsing fails.
 * @param {string|number|Decimal} val - Value to strip units from
 * @returns {number} Numeric value without units
 */
function stripUnits(val) {
  if (typeof val === 'string') {
    return parseFloat(val) || 0;
  }
  return val;
}

export function convertElementToPath(element, precision = 6) {
  const getAttr = (name, defaultValue = 0) => {
    const rawValue = element.getAttribute ? element.getAttribute(name) : element[name];
    const value = rawValue !== undefined && rawValue !== null ? rawValue : defaultValue;
    // Strip CSS units before returning (handles px, em, %, etc.)
    return stripUnits(value);
  };
  const tagName = (element.tagName || element.type || '').toLowerCase();
  if (tagName === 'circle') {
    return circleToPathData(getAttr('cx', 0), getAttr('cy', 0), getAttr('r', 0), precision);
  } else if (tagName === 'ellipse') {
    return ellipseToPathData(getAttr('cx', 0), getAttr('cy', 0), getAttr('rx', 0), getAttr('ry', 0), precision);
  } else if (tagName === 'rect') {
    return rectToPathData(getAttr('x', 0), getAttr('y', 0), getAttr('width', 0), getAttr('height', 0), getAttr('rx', 0), getAttr('ry', null), false, precision);
  } else if (tagName === 'line') {
    return lineToPathData(getAttr('x1', 0), getAttr('y1', 0), getAttr('x2', 0), getAttr('y2', 0), precision);
  } else if (tagName === 'polyline') {
    return polylineToPathData(getAttr('points', ''), precision);
  } else if (tagName === 'polygon') {
    return polygonToPathData(getAttr('points', ''), precision);
  }
  return null;
}
