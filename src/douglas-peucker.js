/**
 * Douglas-Peucker Path Simplification Algorithm
 *
 * Reduces the number of points in a polyline while preserving its shape.
 * The algorithm recursively finds the point furthest from the line segment
 * and keeps it if the distance exceeds the tolerance.
 *
 * Time complexity: O(n^2) worst case, O(n log n) average
 *
 * @module douglas-peucker
 */

/**
 * Calculate perpendicular distance from a point to a line segment.
 * @param {{x: number, y: number}} point - The point
 * @param {{x: number, y: number}} lineStart - Line segment start
 * @param {{x: number, y: number}} lineEnd - Line segment end
 * @returns {number} Perpendicular distance
 */
export function perpendicularDistance(point, lineStart, lineEnd) {
  // Validate parameters to prevent undefined access and ensure numeric properties
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
    throw new TypeError('perpendicularDistance: point must be an object with numeric x and y properties');
  }
  if (!lineStart || typeof lineStart.x !== 'number' || typeof lineStart.y !== 'number') {
    throw new TypeError('perpendicularDistance: lineStart must be an object with numeric x and y properties');
  }
  if (!lineEnd || typeof lineEnd.x !== 'number' || typeof lineEnd.y !== 'number') {
    throw new TypeError('perpendicularDistance: lineEnd must be an object with numeric x and y properties');
  }

  // Check for NaN/Infinity in coordinates to prevent invalid calculations
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      !Number.isFinite(lineStart.x) || !Number.isFinite(lineStart.y) ||
      !Number.isFinite(lineEnd.x) || !Number.isFinite(lineEnd.y)) {
    throw new RangeError('perpendicularDistance: all coordinates must be finite numbers');
  }

  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Handle degenerate case where line segment is a point
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq < 1e-10) {
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  // Calculate perpendicular distance using cross product formula
  // |((y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1)| / sqrt((y2-y1)^2 + (x2-x1)^2)
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.sqrt(lineLengthSq);

  return numerator / denominator;
}

/**
 * Douglas-Peucker simplification algorithm (recursive implementation).
 * @param {Array<{x: number, y: number}>} points - Array of points
 * @param {number} tolerance - Maximum allowed deviation
 * @returns {Array<{x: number, y: number}>} Simplified points
 */
export function douglasPeucker(points, tolerance) {
  // Validate points parameter to prevent crashes on invalid input
  if (!Array.isArray(points)) {
    throw new TypeError('douglasPeucker: points must be an array');
  }
  if (points.length === 0) {
    throw new RangeError('douglasPeucker: points array cannot be empty');
  }

  // Validate tolerance parameter to ensure valid numeric simplification threshold
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance)) {
    throw new TypeError('douglasPeucker: tolerance must be a finite number');
  }
  if (tolerance < 0) {
    throw new RangeError('douglasPeucker: tolerance cannot be negative');
  }

  if (points.length <= 2) {
    return points;
  }

  // Find the point with maximum distance from the line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }

  // If max distance exceeds tolerance, recursively simplify both halves
  if (maxDistance > tolerance) {
    const leftHalf = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const rightHalf = douglasPeucker(points.slice(maxIndex), tolerance);

    // Combine results (remove duplicate point at junction)
    return leftHalf.slice(0, -1).concat(rightHalf);
  } else {
    // All points are within tolerance, keep only endpoints
    return [first, last];
  }
}

/**
 * Visvalingam-Whyatt simplification algorithm.
 * Removes points based on the area of the triangle they form.
 * Better for preserving overall shape character than Douglas-Peucker.
 *
 * Time complexity: O(n log n) with heap, O(n^2) without
 *
 * @param {Array<{x: number, y: number}>} points - Array of points
 * @param {number} minArea - Minimum triangle area to keep
 * @returns {Array<{x: number, y: number}>} Simplified points
 */
export function visvalingamWhyatt(points, minArea) {
  // Validate points parameter to prevent crashes on invalid input
  if (!Array.isArray(points)) {
    throw new TypeError('visvalingamWhyatt: points must be an array');
  }
  if (points.length === 0) {
    throw new RangeError('visvalingamWhyatt: points array cannot be empty');
  }

  // Validate each point has x and y properties with finite numeric values
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || typeof p !== 'object') {
      throw new TypeError(`visvalingamWhyatt: point at index ${i} must be an object`);
    }
    if (typeof p.x !== 'number' || !Number.isFinite(p.x)) {
      throw new TypeError(`visvalingamWhyatt: point at index ${i} must have a finite numeric x property`);
    }
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) {
      throw new TypeError(`visvalingamWhyatt: point at index ${i} must have a finite numeric y property`);
    }
  }

  // Validate minArea parameter to ensure valid numeric threshold
  if (typeof minArea !== 'number' || !Number.isFinite(minArea)) {
    throw new TypeError('visvalingamWhyatt: minArea must be a finite number');
  }
  if (minArea < 0) {
    throw new RangeError('visvalingamWhyatt: minArea cannot be negative');
  }

  if (points.length <= 2) {
    return points;
  }

  // Calculate triangle area for three points
  const triangleArea = (p1, p2, p3) => {
    return Math.abs(
      (p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)
    ) / 2;
  };

  // Create a copy with area information
  const pts = points.map((p, i) => ({ ...p, index: i }));

  // Calculate initial areas
  const areas = new Array(pts.length).fill(Infinity);
  for (let i = 1; i < pts.length - 1; i++) {
    areas[i] = triangleArea(pts[i - 1], pts[i], pts[i + 1]);
  }

  // Repeatedly remove the point with smallest area
  const kept = new Array(pts.length).fill(true);
  let remaining = pts.length;

  while (remaining > 2) {
    // Find point with minimum area
    let minAreaValue = Infinity;
    let minIndex = -1;

    for (let i = 1; i < pts.length - 1; i++) {
      if (kept[i] && areas[i] < minAreaValue) {
        minAreaValue = areas[i];
        minIndex = i;
      }
    }

    // Stop if minimum area exceeds threshold
    if (minAreaValue >= minArea || minIndex === -1) {
      break;
    }

    // Remove this point
    kept[minIndex] = false;
    remaining--;

    // Update areas of neighbors
    let prevIndex = minIndex - 1;
    while (prevIndex >= 0 && !kept[prevIndex]) prevIndex--;

    let nextIndex = minIndex + 1;
    while (nextIndex < pts.length && !kept[nextIndex]) nextIndex++;

    if (prevIndex > 0) {
      let prevPrevIndex = prevIndex - 1;
      while (prevPrevIndex >= 0 && !kept[prevPrevIndex]) prevPrevIndex--;
      if (prevPrevIndex >= 0 && nextIndex < pts.length) {
        areas[prevIndex] = triangleArea(pts[prevPrevIndex], pts[prevIndex], pts[nextIndex]);
      }
    }

    if (nextIndex < pts.length - 1) {
      let nextNextIndex = nextIndex + 1;
      while (nextNextIndex < pts.length && !kept[nextNextIndex]) nextNextIndex++;
      if (nextNextIndex < pts.length && prevIndex >= 0) {
        areas[nextIndex] = triangleArea(pts[prevIndex], pts[nextIndex], pts[nextNextIndex]);
      }
    }
  }

  // Collect kept points
  return pts.filter((_, i) => kept[i]);
}

/**
 * Simplify a polyline using the specified algorithm.
 * @param {Array<{x: number, y: number}>} points - Array of points
 * @param {number} tolerance - Simplification tolerance
 * @param {'douglas-peucker' | 'visvalingam'} algorithm - Algorithm to use
 * @returns {Array<{x: number, y: number}>} Simplified points
 */
export function simplifyPolyline(points, tolerance, algorithm = 'douglas-peucker') {
  // Validate points parameter to prevent crashes on invalid input
  if (!Array.isArray(points)) {
    throw new TypeError('simplifyPolyline: points must be an array');
  }
  if (points.length === 0) {
    throw new RangeError('simplifyPolyline: points array cannot be empty');
  }

  // Validate tolerance parameter to ensure valid numeric threshold
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance)) {
    throw new TypeError('simplifyPolyline: tolerance must be a finite number');
  }
  if (tolerance < 0) {
    throw new RangeError('simplifyPolyline: tolerance cannot be negative');
  }

  // Validate algorithm parameter to ensure only valid algorithms are used
  if (typeof algorithm !== 'string') {
    throw new TypeError('simplifyPolyline: algorithm must be a string');
  }
  const validAlgorithms = ['douglas-peucker', 'visvalingam'];
  if (!validAlgorithms.includes(algorithm)) {
    throw new RangeError(`simplifyPolyline: algorithm must be one of: ${validAlgorithms.join(', ')}`);
  }

  if (algorithm === 'visvalingam') {
    // For Visvalingam, tolerance is the minimum triangle area
    return visvalingamWhyatt(points, tolerance * tolerance);
  }
  return douglasPeucker(points, tolerance);
}

/**
 * Extract points from SVG path commands (L, l, H, h, V, v only).
 * @param {Array<{command: string, args: number[]}>} commands - Path commands
 * @returns {Array<{x: number, y: number}>} Extracted points
 */
export function extractPolylinePoints(commands) {
  // Validate commands parameter to prevent crashes on invalid input
  if (!Array.isArray(commands)) {
    throw new TypeError('extractPolylinePoints: commands must be an array');
  }

  const points = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  for (const cmd of commands) {
    // Validate each command object to prevent undefined access
    if (!cmd || typeof cmd !== 'object') {
      throw new TypeError('extractPolylinePoints: each command must be an object');
    }
    if (typeof cmd.command !== 'string') {
      throw new TypeError('extractPolylinePoints: each command must have a string "command" property');
    }
    if (!Array.isArray(cmd.args)) {
      throw new TypeError('extractPolylinePoints: each command must have an "args" array');
    }

    const { command, args } = cmd;

    // Helper to validate args length to prevent out-of-bounds access
    const requireArgs = (count) => {
      if (args.length < count) {
        throw new RangeError(`extractPolylinePoints: command "${command}" requires at least ${count} arguments, got ${args.length}`);
      }
    };

    // Helper to validate arg is a finite number to prevent NaN/Infinity in calculations
    const requireFiniteNumber = (index) => {
      if (typeof args[index] !== 'number' || !Number.isFinite(args[index])) {
        throw new TypeError(`extractPolylinePoints: command "${command}" argument at index ${index} must be a finite number, got ${args[index]}`);
      }
    };

    switch (command) {
      case 'M':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx = args[0]; cy = args[1];
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'm':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx += args[0]; cy += args[1];
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'L':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx = args[0]; cy = args[1];
        points.push({ x: cx, y: cy });
        break;
      case 'l':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx += args[0]; cy += args[1];
        points.push({ x: cx, y: cy });
        break;
      case 'H':
        requireArgs(1);
        requireFiniteNumber(0);
        cx = args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'h':
        requireArgs(1);
        requireFiniteNumber(0);
        cx += args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'V':
        requireArgs(1);
        requireFiniteNumber(0);
        cy = args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'v':
        requireArgs(1);
        requireFiniteNumber(0);
        cy += args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'Z':
      case 'z':
        if (cx !== startX || cy !== startY) {
          points.push({ x: startX, y: startY });
        }
        cx = startX; cy = startY;
        break;
      // For curves (C, S, Q, T, A), we just track the endpoint
      case 'C':
        requireArgs(6);
        requireFiniteNumber(4); requireFiniteNumber(5);
        cx = args[4]; cy = args[5]; break;
      case 'c':
        requireArgs(6);
        requireFiniteNumber(4); requireFiniteNumber(5);
        cx += args[4]; cy += args[5]; break;
      case 'S': case 'Q':
        requireArgs(4);
        requireFiniteNumber(2); requireFiniteNumber(3);
        cx = args[2]; cy = args[3]; break;
      case 's': case 'q':
        requireArgs(4);
        requireFiniteNumber(2); requireFiniteNumber(3);
        cx += args[2]; cy += args[3]; break;
      case 'T':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx = args[0]; cy = args[1]; break;
      case 't':
        requireArgs(2);
        requireFiniteNumber(0); requireFiniteNumber(1);
        cx += args[0]; cy += args[1]; break;
      case 'A':
        requireArgs(7);
        requireFiniteNumber(5); requireFiniteNumber(6);
        cx = args[5]; cy = args[6]; break;
      case 'a':
        requireArgs(7);
        requireFiniteNumber(5); requireFiniteNumber(6);
        cx += args[5]; cy += args[6]; break;
      default:
        break;
    }
  }

  return points;
}

/**
 * Rebuild path commands from simplified polyline points.
 * @param {Array<{x: number, y: number}>} points - Simplified points
 * @param {boolean} closed - Whether the path is closed
 * @returns {Array<{command: string, args: number[]}>} Path commands
 */
export function rebuildPathFromPoints(points, closed = false) {
  // Validate points parameter to prevent crashes on invalid input
  if (!Array.isArray(points)) {
    throw new TypeError('rebuildPathFromPoints: points must be an array');
  }

  if (points.length === 0) return [];

  // Validate closed parameter to ensure boolean type
  if (typeof closed !== 'boolean') {
    throw new TypeError('rebuildPathFromPoints: closed must be a boolean');
  }

  // Validate each point has x and y properties with finite numeric values
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || typeof p !== 'object') {
      throw new TypeError(`rebuildPathFromPoints: point at index ${i} must be an object`);
    }
    if (typeof p.x !== 'number' || !Number.isFinite(p.x)) {
      throw new TypeError(`rebuildPathFromPoints: point at index ${i} must have a finite numeric x property`);
    }
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) {
      throw new TypeError(`rebuildPathFromPoints: point at index ${i} must have a finite numeric y property`);
    }
  }

  const commands = [];

  // First point is M
  commands.push({ command: 'M', args: [points[0].x, points[0].y] });

  // Remaining points are L
  for (let i = 1; i < points.length; i++) {
    commands.push({ command: 'L', args: [points[i].x, points[i].y] });
  }

  if (closed) {
    commands.push({ command: 'Z', args: [] });
  }

  return commands;
}

/**
 * Check if a path is a pure polyline (only M, L, H, V, Z commands).
 * @param {Array<{command: string, args: number[]}>} commands - Path commands
 * @returns {boolean} True if pure polyline
 */
export function isPurePolyline(commands) {
  // Validate commands parameter to prevent crashes on invalid input
  if (!Array.isArray(commands)) {
    throw new TypeError('isPurePolyline: commands must be an array');
  }

  const polylineCommands = new Set(['M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'Z', 'z']);
  return commands.every(cmd => {
    // Validate each command has the required structure to prevent undefined access
    if (!cmd || typeof cmd !== 'object' || typeof cmd.command !== 'string') {
      return false;
    }
    return polylineCommands.has(cmd.command);
  });
}

/**
 * Simplify a path if it's a pure polyline.
 * @param {Array<{command: string, args: number[]}>} commands - Path commands
 * @param {number} tolerance - Simplification tolerance
 * @param {string} algorithm - Algorithm to use
 * @returns {{commands: Array<{command: string, args: number[]}>, simplified: boolean, originalPoints: number, simplifiedPoints: number}}
 */
export function simplifyPath(commands, tolerance, algorithm = 'douglas-peucker') {
  // Validate commands parameter to prevent crashes on invalid input
  if (!Array.isArray(commands)) {
    throw new TypeError('simplifyPath: commands must be an array');
  }

  // Validate tolerance parameter to ensure valid numeric threshold
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance)) {
    throw new TypeError('simplifyPath: tolerance must be a finite number');
  }
  if (tolerance < 0) {
    throw new RangeError('simplifyPath: tolerance cannot be negative');
  }

  if (!isPurePolyline(commands) || commands.length < 3) {
    return {
      commands,
      simplified: false,
      originalPoints: 0,
      simplifiedPoints: 0
    };
  }

  const points = extractPolylinePoints(commands);
  const originalCount = points.length;

  if (originalCount < 3) {
    return {
      commands,
      simplified: false,
      originalPoints: originalCount,
      simplifiedPoints: originalCount
    };
  }

  // Check if path is closed
  const isClosed = commands[commands.length - 1].command.toLowerCase() === 'z';

  const simplifiedPoints = simplifyPolyline(points, tolerance, algorithm);
  const simplifiedCount = simplifiedPoints.length;

  if (simplifiedCount >= originalCount) {
    return {
      commands,
      simplified: false,
      originalPoints: originalCount,
      simplifiedPoints: originalCount
    };
  }

  const newCommands = rebuildPathFromPoints(simplifiedPoints, isClosed);

  return {
    commands: newCommands,
    simplified: true,
    originalPoints: originalCount,
    simplifiedPoints: simplifiedCount
  };
}

export default {
  perpendicularDistance,
  douglasPeucker,
  visvalingamWhyatt,
  simplifyPolyline,
  extractPolylinePoints,
  rebuildPathFromPoints,
  isPurePolyline,
  simplifyPath
};
