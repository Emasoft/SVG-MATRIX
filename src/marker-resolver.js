/**
 * Marker Resolver Module - Resolve and apply SVG markers to paths
 *
 * Resolves SVG marker elements and applies them to path endpoints and vertices.
 * Markers are symbols placed at vertices of paths, lines, polylines, and polygons.
 *
 * Supports:
 * - marker-start, marker-mid, marker-end attributes
 * - markerWidth, markerHeight, refX, refY
 * - orient (auto, auto-start-reverse, fixed angles)
 * - markerUnits (strokeWidth, userSpaceOnUse)
 * - viewBox and preserveAspectRatio
 * - Transform calculation and application
 *
 * @module marker-resolver
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import * as Transforms2D from "./transforms2d.js";

Decimal.set({ precision: 80 });

/**
 * Parse an SVG marker element to extract all marker properties.
 *
 * SVG markers are symbols that can be attached to the vertices of paths, lines,
 * polylines, and polygons. The marker element defines the appearance and how
 * the marker should be positioned and oriented at each vertex.
 *
 * The refX and refY attributes define the reference point within the marker
 * coordinate system that should be aligned with the path vertex.
 *
 * The orient attribute controls marker rotation:
 * - "auto": Marker is rotated to align with the path direction at the vertex
 * - "auto-start-reverse": Like "auto" but rotated 180° for start markers
 * - Angle value (e.g., "45"): Fixed rotation angle in degrees
 *
 * @param {Element} markerElement - SVG marker DOM element
 * @returns {Object} Parsed marker definition with properties:
 *   - id {string} - Marker element id
 *   - markerWidth {number} - Marker viewport width (default: 3)
 *   - markerHeight {number} - Marker viewport height (default: 3)
 *   - refX {number} - Reference point X coordinate (default: 0)
 *   - refY {number} - Reference point Y coordinate (default: 0)
 *   - orient {string|number} - Orientation: "auto", "auto-start-reverse", or angle in degrees
 *   - markerUnits {string} - Coordinate system: "strokeWidth" or "userSpaceOnUse" (default: "strokeWidth")
 *   - viewBox {Object|null} - Parsed viewBox {x, y, width, height} or null
 *   - preserveAspectRatio {string} - preserveAspectRatio value (default: "xMidYMid meet")
 *   - children {Array} - Array of child element data
 *
 * @example
 * // Parse an arrow marker
 * const marker = document.querySelector('marker#arrow');
 * // <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
 * //   <path d="M 0 0 L 10 5 L 0 10 z" fill="black"/>
 * // </marker>
 * const parsed = parseMarkerElement(marker);
 * // {
 * //   id: 'arrow',
 * //   markerWidth: 10, markerHeight: 10,
 * //   refX: 5, refY: 5,
 * //   orient: 'auto',
 * //   markerUnits: 'strokeWidth',
 * //   viewBox: null,
 * //   preserveAspectRatio: 'xMidYMid meet',
 * //   children: [{ type: 'path', d: 'M 0 0 L 10 5 L 0 10 z', ... }]
 * // }
 */
export function parseMarkerElement(markerElement) {
  // Validate required parameter
  if (!markerElement)
    throw new Error("parseMarkerElement: markerElement is required");
  if (typeof markerElement.getAttribute !== "function") {
    throw new Error("parseMarkerElement: markerElement must be a DOM element");
  }

  // Parse numeric attributes with validation - NaN check ensures valid numbers
  const markerWidth = parseFloat(
    markerElement.getAttribute("markerWidth") || "3",
  );
  const markerHeight = parseFloat(
    markerElement.getAttribute("markerHeight") || "3",
  );
  const refX = parseFloat(markerElement.getAttribute("refX") || "0");
  const refY = parseFloat(markerElement.getAttribute("refY") || "0");

  // Validate numeric values to prevent NaN propagation
  if (isNaN(markerWidth) || markerWidth <= 0) {
    throw new Error(
      "parseMarkerElement: markerWidth must be a positive number",
    );
  }
  if (isNaN(markerHeight) || markerHeight <= 0) {
    throw new Error(
      "parseMarkerElement: markerHeight must be a positive number",
    );
  }
  if (isNaN(refX))
    throw new Error("parseMarkerElement: refX must be a valid number");
  if (isNaN(refY))
    throw new Error("parseMarkerElement: refY must be a valid number");

  const data = {
    id: markerElement.getAttribute("id") || "",
    markerWidth,
    markerHeight,
    refX,
    refY,
    orient: markerElement.getAttribute("orient") || "auto",
    markerUnits: markerElement.getAttribute("markerUnits") || "strokeWidth",
    viewBox: null,
    preserveAspectRatio:
      markerElement.getAttribute("preserveAspectRatio") || "xMidYMid meet",
    children: [],
  };

  // Parse viewBox if present
  const viewBoxStr = markerElement.getAttribute("viewBox");
  if (viewBoxStr) {
    const parts = viewBoxStr
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    // Validate viewBox has exactly 4 valid finite numbers
    if (parts.length === 4 && parts.every((n) => !isNaN(n) && isFinite(n))) {
      data.viewBox = {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  // Parse orient attribute
  if (data.orient !== "auto" && data.orient !== "auto-start-reverse") {
    // Parse as angle in degrees
    const angle = parseFloat(data.orient);
    // Validate angle is a finite number
    if (!isNaN(angle) && isFinite(angle)) {
      data.orient = angle;
    } else {
      // Invalid orient value defaults to auto
      data.orient = "auto";
    }
  }

  // Parse child elements with error handling
  if (markerElement.children) {
    for (const child of markerElement.children) {
      try {
        data.children.push(parseMarkerChild(child));
      } catch (error) {
        // Skip invalid children but continue processing
        console.warn(`Failed to parse marker child: ${error.message}`);
      }
    }
  }

  return data;
}

/**
 * Parse a child element within a marker.
 *
 * @param {Element} element - SVG DOM element
 * @returns {Object} Parsed element data
 */
export function parseMarkerChild(element) {
  // Validate required parameter
  if (!element) throw new Error("parseMarkerChild: element is required");
  if (!element.tagName)
    throw new Error("parseMarkerChild: element must have a tagName property");

  const tagName = element.tagName.toLowerCase();
  const data = {
    type: tagName,
    id: element.getAttribute("id") || null,
    transform: element.getAttribute("transform") || null,
    fill: element.getAttribute("fill") || null,
    stroke: element.getAttribute("stroke") || null,
    strokeWidth: element.getAttribute("stroke-width") || null,
    opacity: element.getAttribute("opacity") || null,
  };

  // Helper to parse and validate float attributes
  const parseValidFloat = (value, defaultVal, name) => {
    const parsed = parseFloat(value || String(defaultVal));
    if (isNaN(parsed) || !isFinite(parsed)) {
      throw new Error(
        `parseMarkerChild: ${name} must be a valid finite number`,
      );
    }
    return parsed;
  };

  switch (tagName) {
    case "path":
      data.d = element.getAttribute("d") || "";
      break;
    case "rect":
      // Validate all rect attributes are valid numbers
      data.x = parseValidFloat(element.getAttribute("x"), 0, "x");
      data.y = parseValidFloat(element.getAttribute("y"), 0, "y");
      data.width = parseValidFloat(element.getAttribute("width"), 0, "width");
      data.height = parseValidFloat(
        element.getAttribute("height"),
        0,
        "height",
      );
      break;
    case "circle":
      // Validate all circle attributes are valid numbers
      data.cx = parseValidFloat(element.getAttribute("cx"), 0, "cx");
      data.cy = parseValidFloat(element.getAttribute("cy"), 0, "cy");
      data.r = parseValidFloat(element.getAttribute("r"), 0, "r");
      break;
    case "ellipse":
      // Validate all ellipse attributes are valid numbers
      data.cx = parseValidFloat(element.getAttribute("cx"), 0, "cx");
      data.cy = parseValidFloat(element.getAttribute("cy"), 0, "cy");
      data.rx = parseValidFloat(element.getAttribute("rx"), 0, "rx");
      data.ry = parseValidFloat(element.getAttribute("ry"), 0, "ry");
      break;
    case "line":
      // Validate all line attributes are valid numbers
      data.x1 = parseValidFloat(element.getAttribute("x1"), 0, "x1");
      data.y1 = parseValidFloat(element.getAttribute("y1"), 0, "y1");
      data.x2 = parseValidFloat(element.getAttribute("x2"), 0, "x2");
      data.y2 = parseValidFloat(element.getAttribute("y2"), 0, "y2");
      break;
    case "polygon":
    case "polyline":
      data.points = element.getAttribute("points") || "";
      break;
    default:
      // Store any additional attributes for unknown elements
      data.attributes = {};
      if (element.attributes) {
        for (const attr of element.attributes) {
          data.attributes[attr.name] = attr.value;
        }
      }
  }

  return data;
}

/**
 * Calculate the transformation matrix for a marker instance.
 *
 * The marker transform combines several transformations in order:
 * 1. Translate to the path vertex position
 * 2. Rotate according to orient attribute (auto, auto-start-reverse, or fixed angle)
 * 3. Scale according to markerUnits (strokeWidth or userSpaceOnUse)
 * 4. Apply viewBox transformation if present
 * 5. Translate by -refX, -refY to align the reference point
 *
 * For markerUnits="strokeWidth", the marker is scaled by the stroke width.
 * For markerUnits="userSpaceOnUse", no additional scaling is applied.
 *
 * @param {Object} markerDef - Parsed marker definition from parseMarkerElement
 * @param {Object} position - Vertex position {x, y} in user coordinates
 * @param {number} tangentAngle - Tangent angle at vertex in radians (for orient="auto")
 * @param {number} strokeWidth - Stroke width for scaling (default: 1)
 * @param {boolean} [isStart=false] - Whether this is a start marker (for auto-start-reverse)
 * @returns {Matrix} 3x3 transformation matrix in homogeneous coordinates
 *
 * @example
 * // Calculate transform for an arrow marker at path start
 * const markerDef = parseMarkerElement(markerEl);
 * const position = { x: 100, y: 200 };
 * const tangentAngle = Math.PI / 4; // 45 degrees
 * const strokeWidth = 2;
 * const transform = getMarkerTransform(markerDef, position, tangentAngle, strokeWidth, true);
 */
export function getMarkerTransform(
  markerDef,
  position,
  tangentAngle,
  strokeWidth = 1,
  isStart = false,
) {
  // Validate required parameters
  if (!markerDef) throw new Error("getMarkerTransform: markerDef is required");
  if (
    !position ||
    typeof position.x !== "number" ||
    typeof position.y !== "number"
  ) {
    throw new Error(
      "getMarkerTransform: position must be an object with x and y numeric properties",
    );
  }
  if (
    typeof tangentAngle !== "number" ||
    isNaN(tangentAngle) ||
    !isFinite(tangentAngle)
  ) {
    throw new Error(
      "getMarkerTransform: tangentAngle must be a valid finite number",
    );
  }
  if (
    typeof strokeWidth !== "number" ||
    isNaN(strokeWidth) ||
    strokeWidth <= 0
  ) {
    throw new Error(
      "getMarkerTransform: strokeWidth must be a positive number",
    );
  }

  // Extract markerDef properties with validation
  const {
    markerWidth,
    markerHeight,
    refX,
    refY,
    orient,
    markerUnits,
    viewBox,
  } = markerDef;

  // Validate markerDef has required numeric properties
  if (typeof markerWidth !== "number" || markerWidth <= 0) {
    throw new Error(
      "getMarkerTransform: markerDef.markerWidth must be a positive number",
    );
  }
  if (typeof markerHeight !== "number" || markerHeight <= 0) {
    throw new Error(
      "getMarkerTransform: markerDef.markerHeight must be a positive number",
    );
  }
  if (typeof refX !== "number" || !isFinite(refX)) {
    throw new Error(
      "getMarkerTransform: markerDef.refX must be a finite number",
    );
  }
  if (typeof refY !== "number" || !isFinite(refY)) {
    throw new Error(
      "getMarkerTransform: markerDef.refY must be a finite number",
    );
  }

  // Start with identity matrix
  let transform = Matrix.identity(3);

  // Step 1: Translate to position
  const translateToPosition = Transforms2D.translation(position.x, position.y);
  transform = transform.mul(translateToPosition);

  // Step 2: Calculate rotation angle
  let rotationAngle = 0;
  if (orient === "auto") {
    rotationAngle = tangentAngle;
  } else if (orient === "auto-start-reverse") {
    // auto-start-reverse: reverse at start, auto elsewhere
    rotationAngle = isStart ? tangentAngle + Math.PI : tangentAngle;
  } else if (typeof orient === "number") {
    rotationAngle = orient * (Math.PI / 180); // Convert degrees to radians
  }

  // Apply rotation
  if (rotationAngle !== 0) {
    const rotation = Transforms2D.rotate(rotationAngle);
    transform = transform.mul(rotation);
  }

  // Step 3: Apply markerUnits scaling
  let scaleX = 1;
  let scaleY = 1;
  if (markerUnits === "strokeWidth") {
    scaleX = strokeWidth;
    scaleY = strokeWidth;
  }

  // Step 4: Apply viewBox transformation if present
  if (viewBox) {
    // Calculate scale factors to fit viewBox into marker viewport
    const vbWidth = viewBox.width;
    const vbHeight = viewBox.height;

    // Prevent division by zero
    if (
      vbWidth > 0 &&
      vbHeight > 0 &&
      isFinite(vbWidth) &&
      isFinite(vbHeight)
    ) {
      // Calculate uniform scale factor based on preserveAspectRatio
      const scaleFactorX = markerWidth / vbWidth;
      const scaleFactorY = markerHeight / vbHeight;

      // Validate scale factors are finite
      if (isFinite(scaleFactorX) && isFinite(scaleFactorY)) {
        // For now, use uniform scaling (can be enhanced with full preserveAspectRatio parsing)
        const scaleFactor = Math.min(scaleFactorX, scaleFactorY);

        scaleX *= scaleFactor;
        scaleY *= scaleFactor;

        // Translate to account for viewBox origin
        const viewBoxTranslate = Transforms2D.translation(
          -viewBox.x,
          -viewBox.y,
        );
        transform = transform.mul(viewBoxTranslate);
      }
    }
  }

  // Apply combined scaling
  if (scaleX !== 1 || scaleY !== 1) {
    const scale = Transforms2D.scale(scaleX, scaleY);
    transform = transform.mul(scale);
  }

  // Step 5: Translate by -refX, -refY
  const refTranslate = Transforms2D.translation(-refX, -refY);
  transform = transform.mul(refTranslate);

  return transform;
}

/**
 * Extract vertices and tangent angles from SVG path data.
 *
 * Analyzes path commands to identify all vertices (points where markers can be placed)
 * and calculates the incoming and outgoing tangent angles at each vertex.
 *
 * Vertices are identified at:
 * - M (moveto) commands - path starts
 * - L (lineto) endpoints
 * - C (cubic bezier) endpoints
 * - Q (quadratic bezier) endpoints
 * - A (arc) endpoints
 * - Z (closepath) creates a vertex at the path start
 *
 * For marker-start: use first vertex
 * For marker-end: use last vertex
 * For marker-mid: use all vertices except first and last
 *
 * @param {string} pathData - SVG path d attribute
 * @returns {Array<Object>} Array of vertex objects, each with:
 *   - x {number} - X coordinate
 *   - y {number} - Y coordinate
 *   - tangentIn {number} - Incoming tangent angle in radians
 *   - tangentOut {number} - Outgoing tangent angle in radians
 *   - index {number} - Vertex index in path
 *
 * @example
 * // Extract vertices from a path
 * const vertices = getPathVertices("M 0 0 L 100 0 L 100 100 L 0 100 Z");
 * // Returns 5 vertices (including closing vertex):
 * // [
 * //   { x: 0, y: 0, tangentIn: 0, tangentOut: 0, index: 0 },
 * //   { x: 100, y: 0, tangentIn: 0, tangentOut: Math.PI/2, index: 1 },
 * //   { x: 100, y: 100, tangentIn: Math.PI/2, tangentOut: Math.PI, index: 2 },
 * //   { x: 0, y: 100, tangentIn: Math.PI, tangentOut: -Math.PI/2, index: 3 },
 * //   { x: 0, y: 0, tangentIn: -Math.PI/2, tangentOut: 0, index: 4 }
 * // ]
 */
export function getPathVertices(pathData) {
  // Validate pathData parameter
  if (typeof pathData !== "string") {
    throw new Error("getPathVertices: pathData must be a string");
  }

  const vertices = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  // Parse path commands
  const commands = parsePathCommands(pathData);

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const prevX = currentX;
    const prevY = currentY;

    switch (cmd.type) {
      case "M": // moveto
        currentX = cmd.x;
        currentY = cmd.y;
        startX = currentX;
        startY = currentY;

        // Calculate tangent for previous vertex if exists
        if (vertices.length > 0) {
          const prev = vertices[vertices.length - 1];
          const angle = Math.atan2(currentY - prevY, currentX - prevX);
          prev.tangentOut = angle;
        }

        // Add new vertex (tangents will be calculated later)
        vertices.push({
          x: currentX,
          y: currentY,
          tangentIn: 0,
          tangentOut: 0,
          index: vertices.length,
        });
        break;

      case "L": {
        // lineto
        currentX = cmd.x;
        currentY = cmd.y;

        // Calculate tangent angle (handle zero-length segments)
        const dx = currentX - prevX;
        const dy = currentY - prevY;
        const lineAngle =
          dx === 0 && dy === 0
            ? vertices.length > 0
              ? vertices[vertices.length - 1].tangentOut
              : 0
            : Math.atan2(dy, dx);

        // Update previous vertex's outgoing tangent
        if (vertices.length > 0) {
          vertices[vertices.length - 1].tangentOut = lineAngle;
        }

        // Add new vertex
        vertices.push({
          x: currentX,
          y: currentY,
          tangentIn: lineAngle,
          tangentOut: lineAngle,
          index: vertices.length,
        });
        break;
      }

      case "C": {
        // cubic bezier
        currentX = cmd.x;
        currentY = cmd.y;

        // Calculate tangent at start (direction to first control point)
        // Handle degenerate case: if first control point coincides with start
        const dx1 = cmd.x1 - prevX;
        const dy1 = cmd.y1 - prevY;
        const startTangent =
          dx1 === 0 && dy1 === 0
            ? Math.atan2(cmd.y2 - prevY, cmd.x2 - prevX) // Use second control point
            : Math.atan2(dy1, dx1);

        // Calculate tangent at end (direction from last control point)
        // Handle degenerate case: if last control point coincides with end
        const dx2 = currentX - cmd.x2;
        const dy2 = currentY - cmd.y2;
        const endTangent =
          dx2 === 0 && dy2 === 0
            ? Math.atan2(currentY - cmd.y1, currentX - cmd.x1) // Use first control point
            : Math.atan2(dy2, dx2);

        // Update previous vertex's outgoing tangent
        if (vertices.length > 0) {
          vertices[vertices.length - 1].tangentOut = startTangent;
        }

        // Add new vertex
        vertices.push({
          x: currentX,
          y: currentY,
          tangentIn: endTangent,
          tangentOut: endTangent,
          index: vertices.length,
        });
        break;
      }

      case "Q": {
        // quadratic bezier
        currentX = cmd.x;
        currentY = cmd.y;

        // Calculate tangent at start (handle degenerate case)
        const dxq1 = cmd.x1 - prevX;
        const dyq1 = cmd.y1 - prevY;
        const qStartTangent =
          dxq1 === 0 && dyq1 === 0
            ? Math.atan2(currentY - prevY, currentX - prevX) // Use endpoint
            : Math.atan2(dyq1, dxq1);

        // Calculate tangent at end (handle degenerate case)
        const dxq2 = currentX - cmd.x1;
        const dyq2 = currentY - cmd.y1;
        const qEndTangent =
          dxq2 === 0 && dyq2 === 0
            ? Math.atan2(currentY - prevY, currentX - prevX) // Use startpoint
            : Math.atan2(dyq2, dxq2);

        // Update previous vertex's outgoing tangent
        if (vertices.length > 0) {
          vertices[vertices.length - 1].tangentOut = qStartTangent;
        }

        // Add new vertex
        vertices.push({
          x: currentX,
          y: currentY,
          tangentIn: qEndTangent,
          tangentOut: qEndTangent,
          index: vertices.length,
        });
        break;
      }

      case "A": {
        // arc
        currentX = cmd.x;
        currentY = cmd.y;

        // Simplified tangent calculation (handle zero-length arc)
        const dxa = currentX - prevX;
        const dya = currentY - prevY;
        const arcAngle =
          dxa === 0 && dya === 0
            ? vertices.length > 0
              ? vertices[vertices.length - 1].tangentOut
              : 0
            : Math.atan2(dya, dxa);

        // Update previous vertex's outgoing tangent
        if (vertices.length > 0) {
          vertices[vertices.length - 1].tangentOut = arcAngle;
        }

        // Add new vertex
        vertices.push({
          x: currentX,
          y: currentY,
          tangentIn: arcAngle,
          tangentOut: arcAngle,
          index: vertices.length,
        });
        break;
      }

      case "Z": {
        // closepath
        currentX = startX;
        currentY = startY;

        // Calculate tangent from last point to start (handle zero-length close)
        const dxz = currentX - prevX;
        const dyz = currentY - prevY;
        const closeAngle =
          dxz === 0 && dyz === 0
            ? vertices.length > 0
              ? vertices[vertices.length - 1].tangentOut
              : 0
            : Math.atan2(dyz, dxz);

        // Update previous vertex's outgoing tangent
        if (vertices.length > 0) {
          vertices[vertices.length - 1].tangentOut = closeAngle;
        }

        // Update first vertex's incoming tangent
        if (vertices.length > 0) {
          vertices[0].tangentIn = closeAngle;
        }
        break;
      }
      default:
        break;
    }
  }

  return vertices;
}

/**
 * Parse SVG path data into structured commands.
 *
 * @param {string} pathData - SVG path d attribute
 * @returns {Array<Object>} Array of command objects
 */
export function parsePathCommands(pathData) {
  // Validate pathData parameter
  if (typeof pathData !== "string") {
    throw new Error("parsePathCommands: pathData must be a string");
  }

  const commands = [];

  // Handle empty path data
  if (pathData.trim() === "") {
    return commands;
  }

  // Normalize path data: add spaces around command letters
  const normalized = pathData
    .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, " $1 ")
    .trim();

  // FIX: Use regex to extract tokens (command letters and numbers)
  // Handles implicit negative separators (e.g., "0.8-2.9" -> ["0.8", "-2.9"])
  // Per W3C SVG spec, negative signs can act as delimiters without spaces
  const commandRegex = /[MmLlHhVvCcSsQqTtAaZz]/;
  const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  const tokens = [];

  let pos = 0;
  while (pos < normalized.length) {
    // Skip whitespace and commas
    while (pos < normalized.length && /[\s,]/.test(normalized[pos])) pos++;
    if (pos >= normalized.length) break;

    // Check if it's a command letter
    if (commandRegex.test(normalized[pos])) {
      tokens.push(normalized[pos]);
      pos++;
    } else {
      // Extract number
      numRegex.lastIndex = pos;
      const match = numRegex.exec(normalized);
      if (match && match.index === pos) {
        tokens.push(match[0]);
        pos = numRegex.lastIndex;
      } else {
        pos++; // Skip invalid character
      }
    }
  }

  let i = 0;
  let currentX = 0;
  let currentY = 0;

  // Helper to safely parse token with bounds checking
  const parseToken = (index, name) => {
    if (index >= tokens.length) {
      throw new Error(
        `parsePathCommands: missing ${name} parameter at token ${index}`,
      );
    }
    const value = parseFloat(tokens[index]);
    if (isNaN(value) || !isFinite(value)) {
      throw new Error(
        `parsePathCommands: invalid ${name} value "${tokens[index]}" at token ${index}`,
      );
    }
    return value;
  };

  while (i < tokens.length) {
    const cmdType = tokens[i];

    switch (cmdType.toUpperCase()) {
      case "M": {
        // moveto - requires 2 parameters (x, y)
        const mx = parseToken(i + 1, "M.x");
        const my = parseToken(i + 2, "M.y");
        commands.push({
          type: "M",
          x: cmdType === "M" ? mx : currentX + mx,
          y: cmdType === "M" ? my : currentY + my,
        });
        currentX = commands[commands.length - 1].x;
        currentY = commands[commands.length - 1].y;
        i += 3;
        break;
      }

      case "L": {
        // lineto - requires 2 parameters (x, y)
        const lx = parseToken(i + 1, "L.x");
        const ly = parseToken(i + 2, "L.y");
        commands.push({
          type: "L",
          x: cmdType === "L" ? lx : currentX + lx,
          y: cmdType === "L" ? ly : currentY + ly,
        });
        currentX = commands[commands.length - 1].x;
        currentY = commands[commands.length - 1].y;
        i += 3;
        break;
      }

      case "H": {
        // horizontal lineto - requires 1 parameter (x)
        const hx = parseToken(i + 1, "H.x");
        commands.push({
          type: "L",
          x: cmdType === "H" ? hx : currentX + hx,
          y: currentY,
        });
        currentX = commands[commands.length - 1].x;
        i += 2;
        break;
      }

      case "V": {
        // vertical lineto - requires 1 parameter (y)
        const vy = parseToken(i + 1, "V.y");
        commands.push({
          type: "L",
          x: currentX,
          y: cmdType === "V" ? vy : currentY + vy,
        });
        currentY = commands[commands.length - 1].y;
        i += 2;
        break;
      }

      case "C": {
        // cubic bezier - requires 6 parameters (x1, y1, x2, y2, x, y)
        const c1x = parseToken(i + 1, "C.x1");
        const c1y = parseToken(i + 2, "C.y1");
        const c2x = parseToken(i + 3, "C.x2");
        const c2y = parseToken(i + 4, "C.y2");
        const cx = parseToken(i + 5, "C.x");
        const cy = parseToken(i + 6, "C.y");
        commands.push({
          type: "C",
          x1: cmdType === "C" ? c1x : currentX + c1x,
          y1: cmdType === "C" ? c1y : currentY + c1y,
          x2: cmdType === "C" ? c2x : currentX + c2x,
          y2: cmdType === "C" ? c2y : currentY + c2y,
          x: cmdType === "C" ? cx : currentX + cx,
          y: cmdType === "C" ? cy : currentY + cy,
        });
        currentX = commands[commands.length - 1].x;
        currentY = commands[commands.length - 1].y;
        i += 7;
        break;
      }

      case "Q": {
        // quadratic bezier - requires 4 parameters (x1, y1, x, y)
        const q1x = parseToken(i + 1, "Q.x1");
        const q1y = parseToken(i + 2, "Q.y1");
        const qx = parseToken(i + 3, "Q.x");
        const qy = parseToken(i + 4, "Q.y");
        commands.push({
          type: "Q",
          x1: cmdType === "Q" ? q1x : currentX + q1x,
          y1: cmdType === "Q" ? q1y : currentY + q1y,
          x: cmdType === "Q" ? qx : currentX + qx,
          y: cmdType === "Q" ? qy : currentY + qy,
        });
        currentX = commands[commands.length - 1].x;
        currentY = commands[commands.length - 1].y;
        i += 5;
        break;
      }

      case "A": {
        // arc - requires 7 parameters (rx, ry, rotation, largeArc, sweep, x, y)
        const rx = parseToken(i + 1, "A.rx");
        const ry = parseToken(i + 2, "A.ry");
        const xAxisRotation = parseToken(i + 3, "A.rotation");
        // Flags must be 0 or 1
        if (i + 4 >= tokens.length || i + 5 >= tokens.length) {
          throw new Error(`parsePathCommands: missing arc flag parameters`);
        }
        const largeArcFlag = parseInt(tokens[i + 4], 10);
        const sweepFlag = parseInt(tokens[i + 5], 10);
        if (isNaN(largeArcFlag) || isNaN(sweepFlag)) {
          throw new Error(`parsePathCommands: invalid arc flag values`);
        }
        const ax = parseToken(i + 6, "A.x");
        const ay = parseToken(i + 7, "A.y");
        commands.push({
          type: "A",
          rx,
          ry,
          xAxisRotation,
          largeArcFlag,
          sweepFlag,
          x: cmdType === "A" ? ax : currentX + ax,
          y: cmdType === "A" ? ay : currentY + ay,
        });
        currentX = commands[commands.length - 1].x;
        currentY = commands[commands.length - 1].y;
        i += 8;
        break;
      }

      case "Z": // closepath
        commands.push({ type: "Z" });
        i += 1;
        break;

      default:
        // Skip unknown commands
        i += 1;
    }
  }

  return commands;
}

/**
 * Resolve markers for a path element.
 *
 * Finds marker-start, marker-mid, and marker-end references on the path,
 * extracts path vertices, and creates marker instances with appropriate
 * transforms for each vertex.
 *
 * The defsMap should contain parsed marker definitions keyed by id.
 *
 * @param {Element} pathElement - SVG path DOM element with marker attributes
 * @param {Object} defsMap - Map of marker id to parsed marker definition
 * @returns {Array<Object>} Array of resolved marker instances, each with:
 *   - markerDef {Object} - The marker definition
 *   - position {Object} - Vertex position {x, y}
 *   - transform {Matrix} - Transform matrix for this marker instance
 *   - type {string} - Marker type: "start", "mid", or "end"
 *   - vertex {Object} - Full vertex data with tangent angles
 *
 * @example
 * // Resolve markers on a path
 * const path = document.querySelector('path[marker-end]');
 * const defs = document.querySelector('defs');
 * const defsMap = {};
 * for (const marker of defs.querySelectorAll('marker')) {
 *   const parsed = parseMarkerElement(marker);
 *   defsMap[parsed.id] = parsed;
 * }
 * const instances = resolveMarkers(path, defsMap);
 * // Returns array of marker instances ready to be rendered
 */
export function resolveMarkers(pathElement, defsMap) {
  // Validate required parameters
  if (!pathElement) throw new Error("resolveMarkers: pathElement is required");
  if (!defsMap || typeof defsMap !== "object") {
    throw new Error("resolveMarkers: defsMap must be an object");
  }

  const instances = [];

  // Get marker references
  const markerStart = pathElement.getAttribute("marker-start");
  const markerMid = pathElement.getAttribute("marker-mid");
  const markerEnd = pathElement.getAttribute("marker-end");

  // Get stroke width for scaling with validation
  const strokeWidthStr = pathElement.getAttribute("stroke-width") || "1";
  const strokeWidth = parseFloat(strokeWidthStr);
  // Validate strokeWidth is a positive number
  if (isNaN(strokeWidth) || strokeWidth <= 0) {
    throw new Error("resolveMarkers: stroke-width must be a positive number");
  }

  // Get path data and extract vertices
  const pathData = pathElement.getAttribute("d") || "";
  const vertices = getPathVertices(pathData);

  if (vertices.length === 0) {
    return instances;
  }

  // Helper to extract marker id from url() reference
  const getMarkerId = (markerRef) => {
    if (!markerRef) return null;
    const match = markerRef.match(/url\(#([^)]+)\)/);
    return match ? match[1] : null;
  };

  // Apply marker-start to first vertex
  if (markerStart) {
    const markerId = getMarkerId(markerStart);
    const markerDef = markerId ? defsMap[markerId] : null;

    if (markerDef && vertices.length > 0) {
      const vertex = vertices[0];
      const tangent =
        vertices.length > 1 ? vertex.tangentOut : vertex.tangentIn;

      instances.push({
        markerDef,
        position: { x: vertex.x, y: vertex.y },
        transform: getMarkerTransform(
          markerDef,
          { x: vertex.x, y: vertex.y },
          tangent,
          strokeWidth,
          true,
        ),
        type: "start",
        vertex,
      });
    }
  }

  // Apply marker-mid to all middle vertices
  if (markerMid && vertices.length > 2) {
    const markerId = getMarkerId(markerMid);
    const markerDef = markerId ? defsMap[markerId] : null;

    if (markerDef) {
      for (let i = 1; i < vertices.length - 1; i++) {
        const vertex = vertices[i];
        // Use average of incoming and outgoing tangents for mid markers
        // Handle angle wrapping: normalize to [-π, π] range before averaging
        const tangentIn = vertex.tangentIn;
        const tangentOut = vertex.tangentOut;
        let angleDiff = tangentOut - tangentIn;
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const tangent = tangentIn + angleDiff / 2;

        instances.push({
          markerDef,
          position: { x: vertex.x, y: vertex.y },
          transform: getMarkerTransform(
            markerDef,
            { x: vertex.x, y: vertex.y },
            tangent,
            strokeWidth,
            false,
          ),
          type: "mid",
          vertex,
        });
      }
    }
  }

  // Apply marker-end to last vertex
  if (markerEnd) {
    const markerId = getMarkerId(markerEnd);
    const markerDef = markerId ? defsMap[markerId] : null;

    if (markerDef && vertices.length > 0) {
      const vertex = vertices[vertices.length - 1];
      const tangent = vertex.tangentIn;

      instances.push({
        markerDef,
        position: { x: vertex.x, y: vertex.y },
        transform: getMarkerTransform(
          markerDef,
          { x: vertex.x, y: vertex.y },
          tangent,
          strokeWidth,
          false,
        ),
        type: "end",
        vertex,
      });
    }
  }

  return instances;
}

/**
 * Convert a marker instance to polygon representations.
 *
 * Transforms marker content (paths, shapes) into polygon arrays by:
 * 1. Converting marker children to path commands or polygons
 * 2. Applying the marker transform to all coordinates
 * 3. Returning array of polygons (each polygon is array of {x, y} points)
 *
 * This is useful for rendering markers or performing geometric operations.
 *
 * @param {Object} markerInstance - Marker instance from resolveMarkers()
 * @param {Object} [options={}] - Conversion options
 * @param {number} [options.precision=2] - Decimal precision for coordinates
 * @param {number} [options.curveSegments=10] - Number of segments for curve approximation
 * @returns {Array<Array<Object>>} Array of polygons, each polygon is array of {x, y} points
 *
 * @example
 * // Convert marker to polygons
 * const instances = resolveMarkers(pathEl, defsMap);
 * const polygons = markerToPolygons(instances[0], { precision: 3 });
 * // Returns: [[{x: 100.123, y: 200.456}, ...], ...]
 */
export function markerToPolygons(markerInstance, options = {}) {
  // Validate markerInstance parameter
  if (!markerInstance)
    throw new Error("markerToPolygons: markerInstance is required");
  if (!markerInstance.markerDef)
    throw new Error("markerToPolygons: markerInstance.markerDef is required");
  if (!markerInstance.transform)
    throw new Error("markerToPolygons: markerInstance.transform is required");

  const { precision = 2, curveSegments = 10 } = options;

  // Validate options
  if (typeof precision !== "number" || precision < 0) {
    throw new Error(
      "markerToPolygons: precision must be a non-negative number",
    );
  }
  if (typeof curveSegments !== "number" || curveSegments <= 0) {
    throw new Error(
      "markerToPolygons: curveSegments must be a positive number",
    );
  }

  const polygons = [];
  const { markerDef, transform } = markerInstance;

  // Validate markerDef has children array
  if (!Array.isArray(markerDef.children)) {
    throw new Error("markerToPolygons: markerDef.children must be an array");
  }

  // Process each child element
  for (const child of markerDef.children) {
    let points = [];

    switch (child.type) {
      case "path":
        // Parse path and convert to points
        points = pathToPoints(child.d, curveSegments);
        break;

      case "rect":
        // Convert rect to 4 corner points
        points = [
          { x: child.x, y: child.y },
          { x: child.x + child.width, y: child.y },
          { x: child.x + child.width, y: child.y + child.height },
          { x: child.x, y: child.y + child.height },
        ];
        break;

      case "circle":
        // Approximate circle with polygon
        points = circleToPoints(child.cx, child.cy, child.r, curveSegments * 4);
        break;

      case "ellipse":
        // Approximate ellipse with polygon
        points = ellipseToPoints(
          child.cx,
          child.cy,
          child.rx,
          child.ry,
          curveSegments * 4,
        );
        break;

      case "line":
        points = [
          { x: child.x1, y: child.y1 },
          { x: child.x2, y: child.y2 },
        ];
        break;

      case "polygon":
      case "polyline":
        points = parsePoints(child.points);
        break;
      default:
        break;
    }

    // Apply transform to all points
    if (points.length > 0) {
      const transformedPoints = points.map((p) => {
        const result = Transforms2D.applyTransform(transform, p.x, p.y);
        // result is an array [x, y] with Decimal values
        return {
          x: parseFloat(result[0].toFixed(precision)),
          y: parseFloat(result[1].toFixed(precision)),
        };
      });

      polygons.push(transformedPoints);
    }
  }

  return polygons;
}

/**
 * Convert path data to array of points by linearizing curves.
 *
 * @param {string} pathData - SVG path d attribute
 * @param {number} segments - Number of segments for curve approximation
 * @returns {Array<Object>} Array of {x, y} points
 */
export function pathToPoints(pathData, segments = 10) {
  // Validate parameters
  if (typeof pathData !== "string") {
    throw new Error("pathToPoints: pathData must be a string");
  }
  if (typeof segments !== "number" || segments <= 0) {
    throw new Error("pathToPoints: segments must be a positive number");
  }

  const points = [];
  const commands = parsePathCommands(pathData);
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        currentX = cmd.x;
        currentY = cmd.y;
        points.push({ x: currentX, y: currentY });
        break;

      case "L":
        currentX = cmd.x;
        currentY = cmd.y;
        points.push({ x: currentX, y: currentY });
        break;

      case "C":
        // Approximate cubic bezier with line segments
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const t1 = 1 - t;
          const x =
            t1 * t1 * t1 * currentX +
            3 * t1 * t1 * t * cmd.x1 +
            3 * t1 * t * t * cmd.x2 +
            t * t * t * cmd.x;
          const y =
            t1 * t1 * t1 * currentY +
            3 * t1 * t1 * t * cmd.y1 +
            3 * t1 * t * t * cmd.y2 +
            t * t * t * cmd.y;
          points.push({ x, y });
        }
        currentX = cmd.x;
        currentY = cmd.y;
        break;

      case "Q":
        // Approximate quadratic bezier with line segments
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          const t1 = 1 - t;
          const x = t1 * t1 * currentX + 2 * t1 * t * cmd.x1 + t * t * cmd.x;
          const y = t1 * t1 * currentY + 2 * t1 * t * cmd.y1 + t * t * cmd.y;
          points.push({ x, y });
        }
        currentX = cmd.x;
        currentY = cmd.y;
        break;

      case "A":
        // Simplified arc approximation
        currentX = cmd.x;
        currentY = cmd.y;
        points.push({ x: currentX, y: currentY });
        break;
      default:
        break;
    }
  }

  return points;
}

/**
 * Convert circle to array of points.
 *
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} r - Radius
 * @param {number} segments - Number of segments
 * @returns {Array<Object>} Array of {x, y} points
 */
export function circleToPoints(cx, cy, r, segments = 32) {
  // Validate parameters
  if (typeof cx !== "number" || !isFinite(cx)) {
    throw new Error("circleToPoints: cx must be a finite number");
  }
  if (typeof cy !== "number" || !isFinite(cy)) {
    throw new Error("circleToPoints: cy must be a finite number");
  }
  if (typeof r !== "number" || !isFinite(r) || r < 0) {
    throw new Error("circleToPoints: r must be a non-negative finite number");
  }
  if (typeof segments !== "number" || segments <= 0) {
    throw new Error("circleToPoints: segments must be a positive number");
  }

  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Convert ellipse to array of points.
 *
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} rx - X radius
 * @param {number} ry - Y radius
 * @param {number} segments - Number of segments
 * @returns {Array<Object>} Array of {x, y} points
 */
export function ellipseToPoints(cx, cy, rx, ry, segments = 32) {
  // Validate parameters
  if (typeof cx !== "number" || !isFinite(cx)) {
    throw new Error("ellipseToPoints: cx must be a finite number");
  }
  if (typeof cy !== "number" || !isFinite(cy)) {
    throw new Error("ellipseToPoints: cy must be a finite number");
  }
  if (typeof rx !== "number" || !isFinite(rx) || rx < 0) {
    throw new Error("ellipseToPoints: rx must be a non-negative finite number");
  }
  if (typeof ry !== "number" || !isFinite(ry) || ry < 0) {
    throw new Error("ellipseToPoints: ry must be a non-negative finite number");
  }
  if (typeof segments !== "number" || segments <= 0) {
    throw new Error("ellipseToPoints: segments must be a positive number");
  }

  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    points.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Parse SVG points attribute (for polygon/polyline).
 *
 * @param {string} pointsStr - Points attribute value
 * @returns {Array<Object>} Array of {x, y} points
 */
export function parsePoints(pointsStr) {
  // Validate parameter
  if (typeof pointsStr !== "string") {
    throw new Error("parsePoints: pointsStr must be a string");
  }

  const points = [];
  const coords = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n) && isFinite(n)); // Filter out invalid numbers

  // Ensure we have an even number of coordinates
  if (coords.length % 2 !== 0) {
    throw new Error(
      "parsePoints: pointsStr must contain an even number of valid coordinates",
    );
  }

  for (let i = 0; i < coords.length; i += 2) {
    points.push({ x: coords[i], y: coords[i + 1] });
  }

  return points;
}

/**
 * Convert marker instances to SVG path data.
 *
 * Generates SVG path commands from all marker polygons, useful for
 * exporting markers as standalone paths.
 *
 * @param {Array<Object>} markerInstances - Array of marker instances from resolveMarkers()
 * @param {number} [precision=2] - Decimal precision for coordinates
 * @returns {string} SVG path data (d attribute value)
 *
 * @example
 * // Convert all markers to a single path
 * const instances = resolveMarkers(pathEl, defsMap);
 * const pathData = markersToPathData(instances, 3);
 * // Returns: "M 100.000 200.000 L 105.000 205.000 ... Z M ..."
 */
export function markersToPathData(markerInstances, precision = 2) {
  // Validate parameters
  if (!Array.isArray(markerInstances)) {
    throw new Error("markersToPathData: markerInstances must be an array");
  }
  if (typeof precision !== "number" || precision < 0) {
    throw new Error(
      "markersToPathData: precision must be a non-negative number",
    );
  }

  const pathParts = [];

  for (const instance of markerInstances) {
    const polygons = markerToPolygons(instance, { precision });

    for (const polygon of polygons) {
      if (polygon.length === 0) continue;

      // Start with M (moveto) command
      const first = polygon[0];
      pathParts.push(
        `M ${first.x.toFixed(precision)} ${first.y.toFixed(precision)}`,
      );

      // Add L (lineto) commands for remaining points
      for (let i = 1; i < polygon.length; i++) {
        const pt = polygon[i];
        pathParts.push(
          `L ${pt.x.toFixed(precision)} ${pt.y.toFixed(precision)}`,
        );
      }

      // Close path
      pathParts.push("Z");
    }
  }

  return pathParts.join(" ");
}

export default {
  parseMarkerElement,
  parseMarkerChild,
  getMarkerTransform,
  getPathVertices,
  parsePathCommands,
  resolveMarkers,
  markerToPolygons,
  pathToPoints,
  circleToPoints,
  ellipseToPoints,
  parsePoints,
  markersToPathData,
};
