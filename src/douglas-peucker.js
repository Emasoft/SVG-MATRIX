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
  const points = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  for (const { command, args } of commands) {
    switch (command) {
      case 'M':
        cx = args[0]; cy = args[1];
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'm':
        cx += args[0]; cy += args[1];
        startX = cx; startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'L':
        cx = args[0]; cy = args[1];
        points.push({ x: cx, y: cy });
        break;
      case 'l':
        cx += args[0]; cy += args[1];
        points.push({ x: cx, y: cy });
        break;
      case 'H':
        cx = args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'h':
        cx += args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'V':
        cy = args[0];
        points.push({ x: cx, y: cy });
        break;
      case 'v':
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
        cx = args[4]; cy = args[5]; break;
      case 'c':
        cx += args[4]; cy += args[5]; break;
      case 'S': case 'Q':
        cx = args[2]; cy = args[3]; break;
      case 's': case 'q':
        cx += args[2]; cy += args[3]; break;
      case 'T':
        cx = args[0]; cy = args[1]; break;
      case 't':
        cx += args[0]; cy += args[1]; break;
      case 'A':
        cx = args[5]; cy = args[6]; break;
      case 'a':
        cx += args[5]; cy += args[6]; break;
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
  if (points.length === 0) return [];

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
  const polylineCommands = new Set(['M', 'm', 'L', 'l', 'H', 'h', 'V', 'v', 'Z', 'z']);
  return commands.every(cmd => polylineCommands.has(cmd.command));
}

/**
 * Simplify a path if it's a pure polyline.
 * @param {Array<{command: string, args: number[]}>} commands - Path commands
 * @param {number} tolerance - Simplification tolerance
 * @param {string} algorithm - Algorithm to use
 * @returns {{commands: Array<{command: string, args: number[]}>, simplified: boolean, originalPoints: number, simplifiedPoints: number}}
 */
export function simplifyPath(commands, tolerance, algorithm = 'douglas-peucker') {
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
