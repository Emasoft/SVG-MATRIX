/**
 * Pattern Resolver Module - Flatten SVG pattern elements
 *
 * Resolves SVG pattern elements by expanding pattern tiles into
 * concrete geometry with Decimal.js precision.
 *
 * Supports:
 * - patternUnits (userSpaceOnUse, objectBoundingBox)
 * - patternContentUnits (userSpaceOnUse, objectBoundingBox)
 * - patternTransform
 * - viewBox on patterns
 * - Nested patterns (pattern referencing another pattern via href)
 *
 * @module pattern-resolver
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import * as Transforms2D from "./transforms2d.js";
import * as PolygonClip from "./polygon-clip.js";
import * as ClipPathResolver from "./clip-path-resolver.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Parse pattern element to structured data
 *
 * Extracts all relevant attributes from an SVG `<pattern>` element and its children,
 * preparing them for pattern resolution. Handles nested patterns via href references.
 *
 * SVG Pattern Concepts:
 * - **patternUnits**: Defines coordinate system for x, y, width, height
 *   - 'objectBoundingBox' (default): Values are fractions (0-1) of target element bbox
 *   - 'userSpaceOnUse': Values are absolute coordinates in user space
 *
 * - **patternContentUnits**: Defines coordinate system for pattern children
 *   - 'userSpaceOnUse' (default): Children use absolute coordinates
 *   - 'objectBoundingBox': Children coordinates scaled by target bbox
 *
 * - **patternTransform**: Additional transformation applied to the pattern
 *
 * - **viewBox**: Establishes coordinate system for pattern content, allowing
 *   scaling and aspect ratio control independent of pattern tile size
 *
 * @param {Element} patternElement - SVG pattern DOM element to parse
 * @returns {Object} Parsed pattern data containing:
 *   - id {string}: Pattern element ID
 *   - patternUnits {string}: 'objectBoundingBox' or 'userSpaceOnUse'
 *   - patternContentUnits {string}: 'objectBoundingBox' or 'userSpaceOnUse'
 *   - patternTransform {string|null}: Transform attribute string
 *   - x {number}: Pattern tile x offset (default 0)
 *   - y {number}: Pattern tile y offset (default 0)
 *   - width {number}: Pattern tile width
 *   - height {number}: Pattern tile height
 *   - viewBox {string|null}: ViewBox attribute string
 *   - viewBoxParsed {Object|undefined}: Parsed viewBox {x, y, width, height}
 *   - preserveAspectRatio {string}: Aspect ratio preservation mode
 *   - href {string|null}: Reference to another pattern element
 *   - children {Array}: Array of parsed child element data
 *
 * @example
 * const patternEl = document.getElementById('myPattern');
 * const data = parsePatternElement(patternEl);
 * // {
 * //   id: 'myPattern',
 * //   patternUnits: 'objectBoundingBox',
 * //   x: 0, y: 0, width: 0.2, height: 0.2,
 * //   children: [{ type: 'rect', fill: 'blue', ... }]
 * // }
 */
export function parsePatternElement(patternElement) {
  // Validate patternElement is a DOM element with getAttribute method
  if (!patternElement)
    throw new Error("parsePatternElement: patternElement is required");
  if (typeof patternElement.getAttribute !== "function") {
    throw new Error(
      "parsePatternElement: patternElement must be a DOM element with getAttribute method",
    );
  }

  const data = {
    id: patternElement.getAttribute("id") || "",
    patternUnits:
      patternElement.getAttribute("patternUnits") || "objectBoundingBox",
    patternContentUnits:
      patternElement.getAttribute("patternContentUnits") || "userSpaceOnUse",
    patternTransform: patternElement.getAttribute("patternTransform") || null,
    x: patternElement.getAttribute("x"),
    y: patternElement.getAttribute("y"),
    width: patternElement.getAttribute("width"),
    height: patternElement.getAttribute("height"),
    viewBox: patternElement.getAttribute("viewBox") || null,
    preserveAspectRatio:
      patternElement.getAttribute("preserveAspectRatio") || "xMidYMid meet",
    href:
      patternElement.getAttribute("href") ||
      patternElement.getAttribute("xlink:href") ||
      null,
    children: [],
  };

  // Helper to parse numeric values with NaN validation
  const parseValidFloat = (val, defaultVal) => {
    if (val === null || val === undefined) return defaultVal;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
  };

  // Parse numeric values
  data.x = parseValidFloat(data.x, 0);
  data.y = parseValidFloat(data.y, 0);
  data.width = parseValidFloat(data.width, 0);
  data.height = parseValidFloat(data.height, 0);

  // Parse viewBox if present
  if (data.viewBox) {
    const parts = data.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    // Validate all parts are valid numbers
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && isFinite(p))) {
      data.viewBoxParsed = {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  // Parse child elements - validate children exists and is iterable
  if (
    patternElement.children &&
    typeof patternElement.children[Symbol.iterator] === "function"
  ) {
    for (const child of patternElement.children) {
      // Validate child is an Element before accessing properties
      if (!child || typeof child.getAttribute !== "function") continue;

      const tagName = child.tagName ? child.tagName.toLowerCase() : "";
      if (!tagName) continue;

      const childData = {
        type: tagName,
        fill: child.getAttribute("fill") || "black",
        stroke: child.getAttribute("stroke") || "none",
        strokeWidth: parseValidFloat(child.getAttribute("stroke-width"), 1),
        opacity: parseValidFloat(child.getAttribute("opacity"), 1),
        transform: child.getAttribute("transform") || null,
      };

      // Parse shape-specific attributes
      switch (tagName) {
        case "rect":
          childData.x = parseValidFloat(child.getAttribute("x"), 0);
          childData.y = parseValidFloat(child.getAttribute("y"), 0);
          childData.width = parseValidFloat(child.getAttribute("width"), 0);
          childData.height = parseValidFloat(child.getAttribute("height"), 0);
          childData.rx = parseValidFloat(child.getAttribute("rx"), 0);
          childData.ry = parseValidFloat(child.getAttribute("ry"), 0);
          break;
        case "circle":
          childData.cx = parseValidFloat(child.getAttribute("cx"), 0);
          childData.cy = parseValidFloat(child.getAttribute("cy"), 0);
          childData.r = parseValidFloat(child.getAttribute("r"), 0);
          break;
        case "ellipse":
          childData.cx = parseValidFloat(child.getAttribute("cx"), 0);
          childData.cy = parseValidFloat(child.getAttribute("cy"), 0);
          childData.rx = parseValidFloat(child.getAttribute("rx"), 0);
          childData.ry = parseValidFloat(child.getAttribute("ry"), 0);
          break;
        case "path":
          childData.d = child.getAttribute("d") || "";
          break;
        case "polygon":
          childData.points = child.getAttribute("points") || "";
          break;
        case "polyline":
          childData.points = child.getAttribute("points") || "";
          break;
        case "line":
          childData.x1 = parseValidFloat(child.getAttribute("x1"), 0);
          childData.y1 = parseValidFloat(child.getAttribute("y1"), 0);
          childData.x2 = parseValidFloat(child.getAttribute("x2"), 0);
          childData.y2 = parseValidFloat(child.getAttribute("y2"), 0);
          break;
        case "use":
          childData.href =
            child.getAttribute("href") ||
            child.getAttribute("xlink:href") ||
            "";
          childData.x = parseValidFloat(child.getAttribute("x"), 0);
          childData.y = parseValidFloat(child.getAttribute("y"), 0);
          break;
        case "g":
          // Groups can contain nested shapes - validate children exists
          childData.children = [];
          if (
            child.children &&
            typeof child.children[Symbol.iterator] === "function"
          ) {
            for (const gc of child.children) {
              if (gc && gc.tagName && typeof gc.getAttribute === "function") {
                childData.children.push({
                  type: gc.tagName.toLowerCase(),
                  fill: gc.getAttribute("fill") || "inherit",
                });
              }
            }
          }
          break;
        default:
          break;
      }

      data.children.push(childData);
    }
  }

  return data;
}

/**
 * Calculate the pattern tile dimensions in user space
 *
 * Converts pattern tile coordinates from patternUnits space to absolute user space
 * coordinates. The tile defines the repeating unit of the pattern.
 *
 * Pattern Tiling Mechanics:
 * - Pattern tiles repeat infinitely in both x and y directions
 * - The tile origin (x, y) defines where the first tile is positioned
 * - Tiles are placed at (x + n*width, y + m*height) for all integers n, m
 * - When patternUnits='objectBoundingBox', dimensions are fractions of target bbox
 * - When patternUnits='userSpaceOnUse', dimensions are absolute coordinates
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} patternData.patternUnits - 'objectBoundingBox' or 'userSpaceOnUse'
 * @param {number} patternData.x - Pattern tile x offset
 * @param {number} patternData.y - Pattern tile y offset
 * @param {number} patternData.width - Pattern tile width
 * @param {number} patternData.height - Pattern tile height
 * @param {Object} targetBBox - Target element bounding box in user space
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @returns {Object} Tile dimensions in user space containing:
 *   - x {Decimal}: Tile x origin in user space
 *   - y {Decimal}: Tile y origin in user space
 *   - width {Decimal}: Tile width in user space
 *   - height {Decimal}: Tile height in user space
 *
 * @example
 * // objectBoundingBox pattern (default)
 * const data = { patternUnits: 'objectBoundingBox', x: 0, y: 0, width: 0.25, height: 0.25 };
 * const bbox = { x: 100, y: 200, width: 400, height: 300 };
 * const tile = getPatternTile(data, bbox);
 * // Result: { x: 100, y: 200, width: 100, height: 75 }
 * // Tile is 25% of target width and height
 *
 * @example
 * // userSpaceOnUse pattern
 * const data = { patternUnits: 'userSpaceOnUse', x: 10, y: 20, width: 50, height: 50 };
 * const bbox = { x: 100, y: 200, width: 400, height: 300 };
 * const tile = getPatternTile(data, bbox);
 * // Result: { x: 10, y: 20, width: 50, height: 50 }
 * // Tile uses absolute coordinates, bbox is ignored
 */
export function getPatternTile(patternData, targetBBox) {
  // Validate parameters
  if (!patternData) {
    throw new Error("getPatternTile: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("getPatternTile: targetBBox is required");
  }
  // Validate targetBBox has required numeric properties
  if (
    typeof targetBBox.x !== "number" ||
    typeof targetBBox.y !== "number" ||
    typeof targetBBox.width !== "number" ||
    typeof targetBBox.height !== "number"
  ) {
    throw new Error(
      "getPatternTile: targetBBox must have numeric x, y, width, and height properties",
    );
  }
  // Validate patternData has required numeric properties
  if (
    typeof patternData.x !== "number" ||
    typeof patternData.y !== "number" ||
    typeof patternData.width !== "number" ||
    typeof patternData.height !== "number"
  ) {
    throw new Error(
      "getPatternTile: patternData must have numeric x, y, width, and height properties",
    );
  }

  if (patternData.patternUnits === "objectBoundingBox") {
    // Dimensions are fractions of target bbox
    return {
      x: D(targetBBox.x).plus(D(patternData.x).mul(targetBBox.width)),
      y: D(targetBBox.y).plus(D(patternData.y).mul(targetBBox.height)),
      width: D(patternData.width).mul(targetBBox.width),
      height: D(patternData.height).mul(targetBBox.height),
    };
  }

  // userSpaceOnUse - use values directly
  return {
    x: D(patternData.x),
    y: D(patternData.y),
    width: D(patternData.width),
    height: D(patternData.height),
  };
}

/**
 * Calculate transform matrix for pattern content
 *
 * Builds the transformation matrix that positions and scales pattern children
 * within each pattern tile. Handles viewBox scaling and patternContentUnits.
 *
 * Transform Chain:
 * 1. If viewBox is present: scale and translate to fit viewBox into tile
 * 2. If patternContentUnits='objectBoundingBox': scale by target bbox dimensions
 *
 * ViewBox Handling:
 * - viewBox establishes a coordinate system independent of tile size
 * - Content in viewBox coordinates is scaled to fit tile dimensions
 * - preserveAspectRatio controls scaling (default 'xMidYMid meet' uses uniform scale)
 * - Content is centered within tile when aspect ratios differ
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} patternData.patternContentUnits - 'objectBoundingBox' or 'userSpaceOnUse'
 * @param {Object} [patternData.viewBoxParsed] - Parsed viewBox {x, y, width, height}
 * @param {string} [patternData.preserveAspectRatio] - Aspect ratio mode (default 'xMidYMid meet')
 * @param {Object} tile - Pattern tile dimensions from getPatternTile()
 * @param {Decimal} tile.x - Tile x origin
 * @param {Decimal} tile.y - Tile y origin
 * @param {Decimal} tile.width - Tile width
 * @param {Decimal} tile.height - Tile height
 * @param {Object} targetBBox - Target element bounding box in user space
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @returns {Matrix} 3x3 transformation matrix for pattern content
 *
 * @example
 * // Pattern with viewBox
 * const data = {
 *   patternContentUnits: 'userSpaceOnUse',
 *   viewBoxParsed: { x: 0, y: 0, width: 100, height: 100 },
 *   preserveAspectRatio: 'xMidYMid meet'
 * };
 * const tile = { x: D(0), y: D(0), width: D(50), height: D(50) };
 * const bbox = { x: 0, y: 0, width: 200, height: 200 };
 * const M = getPatternContentTransform(data, tile, bbox);
 * // M scales viewBox (100x100) to fit tile (50x50), scale = 0.5
 *
 * @example
 * // Pattern with objectBoundingBox content units
 * const data = {
 *   patternContentUnits: 'objectBoundingBox',
 *   viewBoxParsed: null
 * };
 * const tile = { x: D(0), y: D(0), width: D(100), height: D(100) };
 * const bbox = { x: 50, y: 50, width: 400, height: 300 };
 * const M = getPatternContentTransform(data, tile, bbox);
 * // M translates to bbox origin and scales by bbox dimensions
 */
export function getPatternContentTransform(patternData, tile, targetBBox) {
  // Validate parameters
  if (!patternData) {
    throw new Error("getPatternContentTransform: patternData is required");
  }
  if (!tile) {
    throw new Error("getPatternContentTransform: tile is required");
  }
  if (!targetBBox) {
    throw new Error("getPatternContentTransform: targetBBox is required");
  }
  // Validate tile has required properties
  if (!tile.width || !tile.height) {
    throw new Error(
      "getPatternContentTransform: tile must have width and height properties",
    );
  }
  // Validate targetBBox has required numeric properties
  if (
    typeof targetBBox.x !== "number" ||
    typeof targetBBox.y !== "number" ||
    typeof targetBBox.width !== "number" ||
    typeof targetBBox.height !== "number"
  ) {
    throw new Error(
      "getPatternContentTransform: targetBBox must have numeric x, y, width, and height properties",
    );
  }

  let M = Matrix.identity(3);

  // Apply viewBox transform if present
  if (patternData.viewBoxParsed) {
    const vb = patternData.viewBoxParsed;
    // Validate viewBox has required numeric properties
    if (
      typeof vb.x !== "number" ||
      typeof vb.y !== "number" ||
      typeof vb.width !== "number" ||
      typeof vb.height !== "number"
    ) {
      throw new Error(
        "getPatternContentTransform: viewBoxParsed must have numeric x, y, width, and height properties",
      );
    }

    const tileWidth = Number(tile.width);
    const tileHeight = Number(tile.height);

    // Check for division by zero in viewBox dimensions
    if (vb.width === 0 || vb.height === 0) {
      throw new Error(
        "getPatternContentTransform: viewBox width and height must be non-zero",
      );
    }

    // Scale from viewBox to tile
    const scaleX = tileWidth / vb.width;
    const scaleY = tileHeight / vb.height;

    // For 'xMidYMid meet', use uniform scale
    const scale = Math.min(scaleX, scaleY);

    // Validate scale is finite
    if (!isFinite(scale)) {
      throw new Error(
        "getPatternContentTransform: computed scale is not finite",
      );
    }

    // Center the content
    const offsetX = (tileWidth - vb.width * scale) / 2;
    const offsetY = (tileHeight - vb.height * scale) / 2;

    M = M.mul(
      Transforms2D.translation(offsetX - vb.x * scale, offsetY - vb.y * scale),
    );
    M = M.mul(Transforms2D.scale(scale, scale));
  }

  // Apply objectBoundingBox scaling if needed
  if (patternData.patternContentUnits === "objectBoundingBox") {
    M = M.mul(Transforms2D.translation(targetBBox.x, targetBBox.y));
    M = M.mul(Transforms2D.scale(targetBBox.width, targetBBox.height));
  }

  return M;
}

/**
 * Convert pattern child element to polygon representation
 *
 * Transforms a pattern's child shape (rect, circle, path, etc.) into a polygon
 * by applying the appropriate transformation matrix. Uses sampling for curves.
 *
 * @param {Object} child - Pattern child element data from parsePatternElement()
 * @param {string} child.type - Element type ('rect', 'circle', 'ellipse', 'path', etc.)
 * @param {string} [child.transform] - Element's transform attribute
 * @param {Matrix} [transform=null] - Additional transform matrix to apply (e.g., tile position + content transform)
 * @param {number} [samples=20] - Number of samples for approximating curves as line segments
 * @returns {Array<{x: number, y: number}>} Array of polygon vertices in user space
 *
 * @example
 * const child = {
 *   type: 'rect',
 *   x: 0, y: 0,
 *   width: 10, height: 10,
 *   fill: 'red'
 * };
 * const M = Transforms2D.translation(100, 50);
 * const polygon = patternChildToPolygon(child, M);
 * // Returns rectangle vertices translated to (100, 50)
 */
export function patternChildToPolygon(child, transform = null, samples = 20) {
  // Validate child parameter
  if (!child) {
    throw new Error("patternChildToPolygon: child is required");
  }
  if (!child.type) {
    throw new Error("patternChildToPolygon: child must have a type property");
  }
  // Validate samples is a positive number
  if (typeof samples !== "number" || samples <= 0 || !isFinite(samples)) {
    throw new Error(
      "patternChildToPolygon: samples must be a positive finite number",
    );
  }

  // Create element-like object for ClipPathResolver
  const element = {
    type: child.type,
    ...child,
    transform: child.transform,
  };

  // Get polygon using ClipPathResolver
  let polygon = ClipPathResolver.shapeToPolygon(element, null, samples);

  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    return [];
  }

  // Apply additional transform if provided
  if (transform && polygon.length > 0) {
    polygon = polygon.map((p) => {
      // Validate point has x and y properties
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") {
        throw new Error(
          "patternChildToPolygon: invalid polygon point - must have numeric x and y properties",
        );
      }
      const [x, y] = Transforms2D.applyTransform(transform, p.x, p.y);
      return { x, y };
    });
  }

  return polygon;
}

/**
 * Generate pattern tile positions that cover a bounding box
 *
 * Calculates all tile origin positions needed to cover the target area.
 * Tiles are arranged in a grid, with each tile positioned at:
 *   (tile.x + i * tile.width, tile.y + j * tile.height)
 * for integer indices i, j.
 *
 * Pattern Tile Generation:
 * - Determines which tile indices (i, j) are needed to cover coverBBox
 * - Generates positions for all tiles that overlap or touch the bbox
 * - Returns array of tile origins in user space coordinates
 * - Used by resolvePattern() to instantiate pattern content across target
 *
 * @param {Object} tile - Pattern tile dimensions from getPatternTile()
 * @param {Decimal} tile.x - Tile x origin
 * @param {Decimal} tile.y - Tile y origin
 * @param {Decimal} tile.width - Tile width (must be > 0)
 * @param {Decimal} tile.height - Tile height (must be > 0)
 * @param {Object} coverBBox - Bounding box area to cover with tiles
 * @param {number} coverBBox.x - Area x coordinate
 * @param {number} coverBBox.y - Area y coordinate
 * @param {number} coverBBox.width - Area width
 * @param {number} coverBBox.height - Area height
 * @returns {Array<{x: Decimal, y: Decimal}>} Array of tile origin positions in user space
 *
 * @example
 * const tile = { x: D(0), y: D(0), width: D(50), height: D(50) };
 * const bbox = { x: 25, y: 25, width: 150, height: 100 };
 * const positions = getTilePositions(tile, bbox);
 * // Returns positions for tiles covering the bbox:
 * // [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 0 },
 * //  { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 50 }]
 */
export function getTilePositions(tile, coverBBox) {
  // Validate parameters
  if (!tile) {
    throw new Error("getTilePositions: tile is required");
  }
  if (!coverBBox) {
    throw new Error("getTilePositions: coverBBox is required");
  }
  // Validate tile has required properties
  if (!tile.x || !tile.y || !tile.width || !tile.height) {
    throw new Error(
      "getTilePositions: tile must have x, y, width, and height properties",
    );
  }
  // Validate coverBBox has required numeric properties
  if (
    typeof coverBBox.x !== "number" ||
    typeof coverBBox.y !== "number" ||
    typeof coverBBox.width !== "number" ||
    typeof coverBBox.height !== "number"
  ) {
    throw new Error(
      "getTilePositions: coverBBox must have numeric x, y, width, and height properties",
    );
  }

  const positions = [];

  const tileX = Number(tile.x);
  const tileY = Number(tile.y);
  const tileW = Number(tile.width);
  const tileH = Number(tile.height);

  // Validate tile dimensions are finite
  if (
    !isFinite(tileX) ||
    !isFinite(tileY) ||
    !isFinite(tileW) ||
    !isFinite(tileH)
  ) {
    throw new Error("getTilePositions: tile dimensions must be finite numbers");
  }

  // Return empty array if tile dimensions are not positive
  if (tileW <= 0 || tileH <= 0) return positions;

  // Calculate start and end indices
  const startI = Math.floor((coverBBox.x - tileX) / tileW);
  const endI = Math.ceil((coverBBox.x + coverBBox.width - tileX) / tileW);
  const startJ = Math.floor((coverBBox.y - tileY) / tileH);
  const endJ = Math.ceil((coverBBox.y + coverBBox.height - tileY) / tileH);

  // Validate indices are finite
  if (
    !isFinite(startI) ||
    !isFinite(endI) ||
    !isFinite(startJ) ||
    !isFinite(endJ)
  ) {
    throw new Error("getTilePositions: computed tile indices are not finite");
  }

  for (let i = startI; i < endI; i++) {
    for (let j = startJ; j < endJ; j++) {
      positions.push({
        x: D(tileX).plus(D(tileW).mul(i)),
        y: D(tileY).plus(D(tileH).mul(j)),
      });
    }
  }

  return positions;
}

/**
 * Resolve pattern to set of polygons with associated styles
 *
 * Expands a pattern definition into concrete geometry by:
 * 1. Computing tile dimensions based on patternUnits
 * 2. Generating tile positions to cover the target area
 * 3. For each tile, transforming pattern children to polygons
 * 4. Returning all polygons with their fill, stroke, and opacity
 *
 * This is the main pattern resolution function that converts the declarative
 * SVG pattern into explicit polygon geometry suitable for rendering or further
 * processing (e.g., clipping against target shapes).
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Array} patternData.children - Array of child shape data
 * @param {Object} targetBBox - Target element bounding box to fill with pattern
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @param {Object} [options={}] - Resolution options
 * @param {number} [options.samples=20] - Number of samples for curve approximation
 * @param {number} [options.maxTiles=1000] - Maximum number of tiles to generate (performance limit)
 * @returns {Array<Object>} Array of styled polygons, each containing:
 *   - polygon {Array<{x, y}>}: Polygon vertices in user space
 *   - fill {string}: Fill color (e.g., 'red', '#ff0000')
 *   - stroke {string}: Stroke color
 *   - strokeWidth {number}: Stroke width
 *   - opacity {number}: Opacity value (0-1)
 *
 * @example
 * const patternData = parsePatternElement(patternEl);
 * const targetBBox = { x: 0, y: 0, width: 200, height: 200 };
 * const polygons = resolvePattern(patternData, targetBBox);
 * // Returns array of polygons representing the pattern content
 * // Each polygon can be rendered with its associated fill and stroke
 */
export function resolvePattern(patternData, targetBBox, options = {}) {
  // Validate parameters
  if (!patternData) {
    throw new Error("resolvePattern: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("resolvePattern: targetBBox is required");
  }
  // Validate patternData has children array
  if (!Array.isArray(patternData.children)) {
    throw new Error("resolvePattern: patternData.children must be an array");
  }

  const { samples = 20, maxTiles = 1000 } = options;
  const result = [];

  // Get tile dimensions
  const tile = getPatternTile(patternData, targetBBox);

  if (Number(tile.width) <= 0 || Number(tile.height) <= 0) {
    return result;
  }

  // Get content transform
  const contentTransform = getPatternContentTransform(
    patternData,
    tile,
    targetBBox,
  );

  // Get tile positions
  const positions = getTilePositions(tile, targetBBox);

  // Limit number of tiles
  const limitedPositions = positions.slice(0, maxTiles);

  // Convert each child in each tile
  for (const pos of limitedPositions) {
    const tileTranslate = Transforms2D.translation(pos.x, pos.y);

    for (const child of patternData.children) {
      // Combine transforms: tile position + content transform + child transform
      const M = tileTranslate.mul(contentTransform);

      const polygon = patternChildToPolygon(child, M, samples);

      if (polygon.length >= 3) {
        result.push({
          polygon,
          fill: child.fill,
          stroke: child.stroke,
          strokeWidth: child.strokeWidth,
          opacity: child.opacity,
        });
      }
    }
  }

  return result;
}

/**
 * Apply pattern fill to a target polygon
 *
 * Resolves the pattern and clips it against the target polygon, returning only
 * the visible portions of the pattern. This is the key function for applying
 * patterns to arbitrary shapes.
 *
 * Pattern Application Process:
 * 1. Resolve pattern to polygons using resolvePattern()
 * 2. For each pattern polygon, compute intersection with target polygon
 * 3. Return only the intersecting portions with their styles
 * 4. Results can be directly rendered to visualize the pattern fill
 *
 * @param {Array<{x: number, y: number}>} targetPolygon - Target polygon vertices to fill
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} targetBBox - Target element bounding box
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @param {Object} [options={}] - Resolution options (passed to resolvePattern)
 * @param {number} [options.samples=20] - Curve sampling resolution
 * @param {number} [options.maxTiles=1000] - Maximum tiles to generate
 * @returns {Array<Object>} Array of clipped polygons, each containing:
 *   - polygon {Array<{x, y}>}: Clipped polygon vertices (intersection with target)
 *   - fill {string}: Fill color
 *   - opacity {number}: Opacity value
 *
 * @example
 * // Apply striped pattern to a circle
 * const circlePolygon = [...]; // Circle approximated as polygon
 * const patternData = parsePatternElement(stripesPatternEl);
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const clippedParts = applyPattern(circlePolygon, patternData, bbox);
 * // Returns only the stripe portions visible within the circle
 */
export function applyPattern(
  targetPolygon,
  patternData,
  targetBBox,
  options = {},
) {
  // Validate parameters
  if (!targetPolygon) {
    throw new Error("applyPattern: targetPolygon is required");
  }
  if (!Array.isArray(targetPolygon)) {
    throw new Error("applyPattern: targetPolygon must be an array");
  }
  if (!patternData) {
    throw new Error("applyPattern: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("applyPattern: targetBBox is required");
  }

  const patternPolygons = resolvePattern(patternData, targetBBox, options);
  const result = [];

  for (const { polygon, fill, opacity } of patternPolygons) {
    if (opacity <= 0) continue;

    const intersection = PolygonClip.polygonIntersection(
      targetPolygon,
      polygon,
    );

    // Validate intersection is an array
    if (Array.isArray(intersection)) {
      for (const clippedPoly of intersection) {
        if (clippedPoly.length >= 3) {
          result.push({
            polygon: clippedPoly,
            fill,
            opacity,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Flatten pattern to single combined polygon (union of all shapes)
 *
 * Combines all pattern content into a single unified polygon by computing
 * the union of all shapes. Useful for creating clip paths from patterns or
 * for simplified pattern representations.
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} targetBBox - Target element bounding box
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @param {Object} [options={}] - Resolution options (passed to resolvePattern)
 * @param {number} [options.samples=20] - Curve sampling resolution
 * @param {number} [options.maxTiles=1000] - Maximum tiles to generate
 * @returns {Array<{x: number, y: number}>} Combined polygon vertices representing union of all pattern shapes
 *
 * @example
 * // Create a clip path from a dot pattern
 * const dotPatternData = parsePatternElement(dotPatternEl);
 * const bbox = { x: 0, y: 0, width: 200, height: 200 };
 * const clipPolygon = patternToClipPath(dotPatternData, bbox);
 * // Returns single polygon that is the union of all dots in the pattern
 */
export function patternToClipPath(patternData, targetBBox, options = {}) {
  // Validate parameters
  if (!patternData) {
    throw new Error("patternToClipPath: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("patternToClipPath: targetBBox is required");
  }

  const patternPolygons = resolvePattern(patternData, targetBBox, options);

  // Union all polygons
  let result = [];

  for (const { polygon, opacity } of patternPolygons) {
    if (opacity > 0 && polygon.length >= 3) {
      if (result.length === 0) {
        result = polygon;
      } else {
        const unionResult = PolygonClip.polygonUnion(result, polygon);
        // Validate unionResult is an array
        if (
          Array.isArray(unionResult) &&
          unionResult.length > 0 &&
          Array.isArray(unionResult[0]) &&
          unionResult[0].length >= 3
        ) {
          result = unionResult[0];
        }
      }
    }
  }

  return result;
}

/**
 * Generate SVG path data for pattern content
 *
 * Converts the flattened pattern polygon into SVG path data string that can
 * be used in a `<path>` element's `d` attribute.
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} targetBBox - Target element bounding box
 * @param {number} targetBBox.x - Bounding box x coordinate
 * @param {number} targetBBox.y - Bounding box y coordinate
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @param {Object} [options={}] - Resolution options (passed to patternToClipPath)
 * @param {number} [options.samples=20] - Curve sampling resolution
 * @param {number} [options.maxTiles=1000] - Maximum tiles to generate
 * @returns {string} SVG path data string (e.g., "M 0 0 L 10 0 L 10 10 Z")
 *
 * @example
 * const patternData = parsePatternElement(patternEl);
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const pathData = patternToPathData(patternData, bbox);
 * // Returns: "M 0.000000 0.000000 L 10.000000 0.000000 L 10.000000 10.000000 Z"
 * // Can be used in: <path d={pathData} />
 */
export function patternToPathData(patternData, targetBBox, options = {}) {
  // Validate parameters
  if (!patternData) {
    throw new Error("patternToPathData: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("patternToPathData: targetBBox is required");
  }

  const polygon = patternToClipPath(patternData, targetBBox, options);

  // Validate polygon is an array
  if (!Array.isArray(polygon)) {
    return "";
  }

  if (polygon.length < 3) return "";

  let d = "";
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    // Validate point has x and y properties
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") {
      throw new Error(
        "patternToPathData: invalid polygon point - must have numeric x and y properties",
      );
    }
    // Validate x and y are finite
    if (!isFinite(p.x) || !isFinite(p.y)) {
      throw new Error(
        "patternToPathData: polygon point coordinates must be finite numbers",
      );
    }
    const x = Number(p.x).toFixed(6);
    const y = Number(p.y).toFixed(6);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  d += " Z";

  return d;
}

/**
 * Calculate pattern tile count for a given area
 *
 * Computes how many tiles (columns and rows) are needed to cover the target
 * bounding box. Useful for estimating pattern complexity and performance.
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Object} targetBBox - Target element bounding box to cover
 * @param {number} targetBBox.width - Bounding box width
 * @param {number} targetBBox.height - Bounding box height
 * @returns {Object} Tile count information:
 *   - columns {number}: Number of tile columns needed
 *   - rows {number}: Number of tile rows needed
 *   - total {number}: Total number of tiles (columns * rows)
 *
 * @example
 * const patternData = { width: 0.25, height: 0.25, patternUnits: 'objectBoundingBox' };
 * const bbox = { x: 0, y: 0, width: 400, height: 300 };
 * const tileCount = getPatternTileCount(patternData, bbox);
 * // With 0.25 fraction: tile is 100x75, needs 4 columns and 4 rows
 * // Result: { columns: 4, rows: 4, total: 16 }
 */
export function getPatternTileCount(patternData, targetBBox) {
  // Validate parameters
  if (!patternData) {
    throw new Error("getPatternTileCount: patternData is required");
  }
  if (!targetBBox) {
    throw new Error("getPatternTileCount: targetBBox is required");
  }
  // Validate targetBBox has required numeric properties
  if (
    typeof targetBBox.width !== "number" ||
    typeof targetBBox.height !== "number"
  ) {
    throw new Error(
      "getPatternTileCount: targetBBox must have numeric width and height properties",
    );
  }

  const tile = getPatternTile(patternData, targetBBox);

  const tileW = Number(tile.width);
  const tileH = Number(tile.height);

  // Check for zero or negative dimensions
  if (tileW <= 0 || tileH <= 0) {
    return { columns: 0, rows: 0, total: 0 };
  }

  // Check for zero targetBBox dimensions
  if (targetBBox.width === 0 || targetBBox.height === 0) {
    return { columns: 0, rows: 0, total: 0 };
  }

  const columns = Math.ceil(targetBBox.width / tileW);
  const rows = Math.ceil(targetBBox.height / tileH);

  // Validate computed values are finite
  if (!isFinite(columns) || !isFinite(rows)) {
    throw new Error("getPatternTileCount: computed tile counts are not finite");
  }

  return {
    columns,
    rows,
    total: columns * rows,
  };
}

/**
 * Get bounding box of pattern content
 *
 * Calculates the bounding box that encloses all child shapes within the pattern
 * definition. Analyzes only the intrinsic geometry of children, not their
 * positions after tile/transform application.
 *
 * Supported shape types: rect, circle, ellipse, line
 * (Other shapes like path, polygon return no bbox contribution)
 *
 * @param {Object} patternData - Parsed pattern data from parsePatternElement()
 * @param {Array} patternData.children - Array of child element data
 * @returns {Object} Bounding box of pattern content:
 *   - x {number}: Left edge
 *   - y {number}: Top edge
 *   - width {number}: Width
 *   - height {number}: Height
 *   Returns {x: 0, y: 0, width: 0, height: 0} if no children have computable bbox
 *
 * @example
 * const patternData = {
 *   children: [
 *     { type: 'rect', x: 10, y: 20, width: 50, height: 30 },
 *     { type: 'circle', cx: 80, cy: 50, r: 10 }
 *   ]
 * };
 * const bbox = getPatternContentBBox(patternData);
 * // Result: { x: 10, y: 20, width: 80, height: 40 }
 * // (from x:10 to x:90, y:20 to y:60)
 */
export function getPatternContentBBox(patternData) {
  // Validate parameter
  if (!patternData) {
    throw new Error("getPatternContentBBox: patternData is required");
  }
  // Validate patternData has children array
  if (!Array.isArray(patternData.children)) {
    throw new Error(
      "getPatternContentBBox: patternData.children must be an array",
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of patternData.children) {
    if (!child || !child.type) continue;

    let childBBox = null;

    switch (child.type) {
      case "rect":
        // Validate rect has required numeric properties
        if (
          typeof child.x === "number" &&
          typeof child.y === "number" &&
          typeof child.width === "number" &&
          typeof child.height === "number"
        ) {
          childBBox = {
            x: child.x,
            y: child.y,
            width: child.width,
            height: child.height,
          };
        }
        break;
      case "circle":
        // Validate circle has required numeric properties
        if (
          typeof child.cx === "number" &&
          typeof child.cy === "number" &&
          typeof child.r === "number"
        ) {
          childBBox = {
            x: child.cx - child.r,
            y: child.cy - child.r,
            width: child.r * 2,
            height: child.r * 2,
          };
        }
        break;
      case "ellipse":
        // Validate ellipse has required numeric properties
        if (
          typeof child.cx === "number" &&
          typeof child.cy === "number" &&
          typeof child.rx === "number" &&
          typeof child.ry === "number"
        ) {
          childBBox = {
            x: child.cx - child.rx,
            y: child.cy - child.ry,
            width: child.rx * 2,
            height: child.ry * 2,
          };
        }
        break;
      case "line":
        // Validate line has required numeric properties
        if (
          typeof child.x1 === "number" &&
          typeof child.y1 === "number" &&
          typeof child.x2 === "number" &&
          typeof child.y2 === "number"
        ) {
          childBBox = {
            x: Math.min(child.x1, child.x2),
            y: Math.min(child.y1, child.y2),
            width: Math.abs(child.x2 - child.x1),
            height: Math.abs(child.y2 - child.y1),
          };
        }
        break;
      default:
        break;
    }

    if (childBBox) {
      // Validate bbox values are finite
      if (
        isFinite(childBBox.x) &&
        isFinite(childBBox.y) &&
        isFinite(childBBox.width) &&
        isFinite(childBBox.height)
      ) {
        minX = Math.min(minX, childBBox.x);
        minY = Math.min(minY, childBBox.y);
        maxX = Math.max(maxX, childBBox.x + childBBox.width);
        maxY = Math.max(maxY, childBBox.y + childBBox.height);
      }
    }
  }

  if (minX === Infinity) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Parse patternTransform attribute
 *
 * Converts an SVG transform string (e.g., "rotate(45) translate(10, 20)")
 * into a 3x3 transformation matrix. The patternTransform attribute allows
 * additional transformations to be applied to the entire pattern coordinate system.
 *
 * PatternTransform Attribute:
 * - Applied to the pattern coordinate system before patternUnits scaling
 * - Can contain any SVG transform functions: translate, rotate, scale, skewX, skewY, matrix
 * - Useful for rotating, scaling, or skewing entire patterns
 * - Composed right-to-left (last transform applied first in coordinate chain)
 *
 * @param {string|null} transformStr - SVG transform attribute string
 *   Examples: "rotate(45)", "translate(10, 20) scale(2)", "matrix(1,0,0,1,0,0)"
 * @returns {Matrix} 3x3 transformation matrix (identity matrix if transformStr is null/empty)
 *
 * @example
 * const M = parsePatternTransform("rotate(45)");
 * // Returns 3x3 matrix representing 45-degree rotation
 *
 * @example
 * const M = parsePatternTransform("translate(100, 50) scale(2)");
 * // Returns matrix that first scales by 2, then translates by (100, 50)
 *
 * @example
 * const M = parsePatternTransform(null);
 * // Returns identity matrix (no transformation)
 */
export function parsePatternTransform(transformStr) {
  if (!transformStr) {
    return Matrix.identity(3);
  }

  // Use ClipPathResolver's transform parser
  return ClipPathResolver.parseTransform(transformStr);
}

export default {
  parsePatternElement,
  getPatternTile,
  getPatternContentTransform,
  patternChildToPolygon,
  getTilePositions,
  resolvePattern,
  applyPattern,
  patternToClipPath,
  patternToPathData,
  getPatternTileCount,
  getPatternContentBBox,
  parsePatternTransform,
};
