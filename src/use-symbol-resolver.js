/**
 * Use/Symbol Resolver Module - Expand use elements and symbols
 *
 * Resolves SVG <use> elements by inlining their referenced content
 * with proper transforms, viewBox handling, and style inheritance.
 *
 * Supports:
 * - <use> referencing any element by id
 * - <symbol> with viewBox and preserveAspectRatio
 * - x, y, width, height on use elements
 * - Recursive use resolution
 * - Style inheritance
 *
 * @module use-symbol-resolver
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import * as Transforms2D from "./transforms2d.js";
import * as PolygonClip from "./polygon-clip.js";
import * as ClipPathResolver from "./clip-path-resolver.js";
import { parseTransformAttribute } from "./svg-flatten.js";

Decimal.set({ precision: 80 });

/**
 * Detect circular references when resolving use/symbol references.
 * Prevents infinite loops when SVG contains circular reference chains like:
 * - <use href="#a"> where #a contains <use href="#a"> (self-reference)
 * - <use href="#a"> → #a contains <use href="#b"> → #b contains <use href="#a"> (circular chain)
 *
 * @param {string} startId - Starting ID to check
 * @param {Function} getNextId - Function that returns the next referenced ID given current ID
 * @param {number} maxDepth - Maximum chain depth before considering circular (default 100)
 * @returns {boolean} True if circular reference detected
 */
function hasCircularReference(startId, getNextId, maxDepth = 100) {
  // Parameter validation: startId must be a non-empty string
  if (!startId || typeof startId !== 'string') {
    throw new Error('hasCircularReference: startId must be a non-empty string');
  }
  // Parameter validation: getNextId must be a function
  if (typeof getNextId !== 'function') {
    throw new Error('hasCircularReference: getNextId must be a function');
  }
  // Parameter validation: maxDepth must be a positive finite number
  if (typeof maxDepth !== 'number' || maxDepth <= 0 || !isFinite(maxDepth)) {
    throw new Error('hasCircularReference: maxDepth must be a positive finite number');
  }

  const visited = new Set();
  let currentId = startId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    if (visited.has(currentId)) {
      return true; // Circular reference detected!
    }
    visited.add(currentId);
    currentId = getNextId(currentId);
    depth++;
  }

  return depth >= maxDepth; // Too deep = likely circular
}

/**
 * Parse SVG <use> element to structured data.
 *
 * SVG <use> elements reference other elements via href/xlink:href and can apply
 * additional transforms and positioning. The x,y attributes translate the referenced
 * content. When referencing a <symbol>, width/height establish the viewport for
 * viewBox calculations.
 *
 * Handles both modern href and legacy xlink:href attributes, preferring href.
 * The '#' prefix is stripped from internal references to get the target id.
 *
 * @param {Element} useElement - SVG <use> DOM element to parse
 * @returns {Object} Parsed use data with the following properties:
 *   - href {string} - Target element id (without '#' prefix)
 *   - x {number} - Horizontal translation offset (default: 0)
 *   - y {number} - Vertical translation offset (default: 0)
 *   - width {number|null} - Viewport width for symbol references (null if not specified)
 *   - height {number|null} - Viewport height for symbol references (null if not specified)
 *   - transform {string|null} - Additional transform attribute (null if not specified)
 *   - style {Object} - Extracted style attributes that inherit to referenced content
 *
 * @example
 * // Parse a use element referencing a symbol with positioning
 * const useEl = document.querySelector('use');
 * // <use href="#icon" x="10" y="20" width="100" height="100" fill="red"/>
 * const parsed = parseUseElement(useEl);
 * // {
 * //   href: 'icon',
 * //   x: 10, y: 20,
 * //   width: 100, height: 100,
 * //   transform: null,
 * //   style: { fill: 'red', stroke: null, ... }
 * // }
 */
export function parseUseElement(useElement) {
  // Parameter validation: useElement must be defined
  if (!useElement) throw new Error('parseUseElement: useElement is required');

  const href =
    useElement.getAttribute("href") ||
    useElement.getAttribute("xlink:href") ||
    "";

  const parsedHref = href.startsWith("#") ? href.slice(1) : href;

  // Parse numeric attributes and validate for NaN
  const x = parseFloat(useElement.getAttribute("x") || "0");
  const y = parseFloat(useElement.getAttribute("y") || "0");

  // Validate that x and y are not NaN
  if (isNaN(x) || isNaN(y)) {
    throw new Error('parseUseElement: x and y attributes must be valid numbers');
  }

  // Parse width and height if present, validate for NaN
  let width = null;
  let height = null;

  if (useElement.getAttribute("width")) {
    width = parseFloat(useElement.getAttribute("width"));
    if (isNaN(width)) {
      throw new Error('parseUseElement: width attribute must be a valid number');
    }
  }

  if (useElement.getAttribute("height")) {
    height = parseFloat(useElement.getAttribute("height"));
    if (isNaN(height)) {
      throw new Error('parseUseElement: height attribute must be a valid number');
    }
  }

  return {
    href: parsedHref,
    x,
    y,
    width,
    height,
    transform: useElement.getAttribute("transform") || null,
    style: extractStyleAttributes(useElement),
  };
}

/**
 * Parse SVG <symbol> element to structured data.
 *
 * SVG <symbol> elements are container elements typically defined in <defs> and
 * instantiated via <use>. They support viewBox for coordinate system control
 * and preserveAspectRatio for scaling behavior.
 *
 * The viewBox defines the symbol's internal coordinate system (minX minY width height).
 * When a <use> references a symbol with width/height, the viewBox is mapped to that
 * viewport according to preserveAspectRatio rules.
 *
 * refX/refY provide an optional reference point for alignment (similar to markers).
 *
 * @param {Element} symbolElement - SVG <symbol> DOM element to parse
 * @returns {Object} Parsed symbol data with the following properties:
 *   - id {string} - Symbol's id attribute
 *   - viewBox {string|null} - Raw viewBox attribute string
 *   - viewBoxParsed {Object|undefined} - Parsed viewBox with x, y, width, height (only if valid)
 *   - preserveAspectRatio {string} - How to scale/align viewBox (default: 'xMidYMid meet')
 *   - children {Array} - Parsed child elements
 *   - refX {number} - Reference point X coordinate (default: 0)
 *   - refY {number} - Reference point Y coordinate (default: 0)
 *
 * @example
 * // Parse a symbol with viewBox
 * const symbolEl = document.querySelector('symbol');
 * // <symbol id="icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
 * //   <circle cx="12" cy="12" r="10"/>
 * // </symbol>
 * const parsed = parseSymbolElement(symbolEl);
 * // {
 * //   id: 'icon',
 * //   viewBox: '0 0 24 24',
 * //   viewBoxParsed: { x: 0, y: 0, width: 24, height: 24 },
 * //   preserveAspectRatio: 'xMidYMid meet',
 * //   children: [{ type: 'circle', cx: 12, cy: 12, r: 10, ... }],
 * //   refX: 0, refY: 0
 * // }
 */
export function parseSymbolElement(symbolElement) {
  // Parameter validation: symbolElement must be defined
  if (!symbolElement) throw new Error('parseSymbolElement: symbolElement is required');

  // Parse refX and refY with NaN validation
  const refX = parseFloat(symbolElement.getAttribute("refX") || "0");
  const refY = parseFloat(symbolElement.getAttribute("refY") || "0");

  if (isNaN(refX) || isNaN(refY)) {
    throw new Error('parseSymbolElement: refX and refY must be valid numbers');
  }

  const data = {
    id: symbolElement.getAttribute("id") || "",
    viewBox: symbolElement.getAttribute("viewBox") || null,
    preserveAspectRatio:
      symbolElement.getAttribute("preserveAspectRatio") || "xMidYMid meet",
    children: [],
    refX,
    refY,
  };

  // Parse viewBox
  if (data.viewBox) {
    const parts = data.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    // Validate viewBox has exactly 4 parts and all are valid numbers
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && isFinite(p))) {
      data.viewBoxParsed = {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  // Parse children
  for (const child of symbolElement.children) {
    data.children.push(parseChildElement(child));
  }

  return data;
}

/**
 * Parse any SVG element to structured data for use/symbol resolution.
 *
 * Recursively parses SVG elements extracting geometry-specific attributes
 * based on element type (rect, circle, path, etc.). Used to build a structured
 * representation of symbol contents and referenced elements.
 *
 * Handles:
 * - Shape elements (rect, circle, ellipse, line, path, polygon, polyline)
 * - Container elements (g - group)
 * - Reference elements (use - for nested use resolution)
 * - Common attributes (id, transform, style)
 *
 * @param {Element} element - SVG DOM element to parse
 * @returns {Object} Parsed element data with the following base properties:
 *   - type {string} - Element tag name (lowercase)
 *   - id {string|null} - Element's id attribute
 *   - transform {string|null} - Element's transform attribute
 *   - style {Object} - Extracted style attributes (fill, stroke, etc.)
 *   Plus element-specific geometry properties:
 *   - rect: x, y, width, height, rx, ry
 *   - circle: cx, cy, r
 *   - ellipse: cx, cy, rx, ry
 *   - path: d
 *   - polygon/polyline: points
 *   - line: x1, y1, x2, y2
 *   - g: children (array of parsed child elements)
 *   - use: href, x, y, width, height
 *
 * @example
 * // Parse a circle element
 * const circleEl = document.querySelector('circle');
 * // <circle id="c1" cx="50" cy="50" r="20" fill="blue" transform="rotate(45)"/>
 * const parsed = parseChildElement(circleEl);
 * // {
 * //   type: 'circle',
 * //   id: 'c1',
 * //   cx: 50, cy: 50, r: 20,
 * //   transform: 'rotate(45)',
 * //   style: { fill: 'blue', ... }
 * // }
 *
 * @example
 * // Parse a group with nested elements
 * const groupEl = document.querySelector('g');
 * // <g id="group1" transform="translate(10, 20)">
 * //   <rect x="0" y="0" width="50" height="50"/>
 * //   <circle cx="25" cy="25" r="10"/>
 * // </g>
 * const parsed = parseChildElement(groupEl);
 * // {
 * //   type: 'g',
 * //   id: 'group1',
 * //   transform: 'translate(10, 20)',
 * //   children: [
 * //     { type: 'rect', x: 0, y: 0, width: 50, height: 50, ... },
 * //     { type: 'circle', cx: 25, cy: 25, r: 10, ... }
 * //   ],
 * //   style: { ... }
 * // }
 */
export function parseChildElement(element) {
  // Parameter validation: element must be defined and have a tagName
  if (!element || !element.tagName) {
    throw new Error('parseChildElement: element with tagName is required');
  }

  const tagName = element.tagName.toLowerCase();

  const data = {
    type: tagName,
    id: element.getAttribute("id") || null,
    transform: element.getAttribute("transform") || null,
    style: extractStyleAttributes(element),
  };

  // Helper to safely parse float with NaN check
  const safeParseFloat = (attrName, defaultValue = "0") => {
    const value = parseFloat(element.getAttribute(attrName) || defaultValue);
    if (isNaN(value)) {
      throw new Error(`parseChildElement: ${attrName} must be a valid number in ${tagName} element`);
    }
    return value;
  };

  switch (tagName) {
    case "rect":
      data.x = safeParseFloat("x");
      data.y = safeParseFloat("y");
      data.width = safeParseFloat("width");
      data.height = safeParseFloat("height");
      data.rx = safeParseFloat("rx");
      data.ry = safeParseFloat("ry");
      break;
    case "circle":
      data.cx = safeParseFloat("cx");
      data.cy = safeParseFloat("cy");
      data.r = safeParseFloat("r");
      break;
    case "ellipse":
      data.cx = safeParseFloat("cx");
      data.cy = safeParseFloat("cy");
      data.rx = safeParseFloat("rx");
      data.ry = safeParseFloat("ry");
      break;
    case "path":
      data.d = element.getAttribute("d") || "";
      break;
    case "polygon":
      data.points = element.getAttribute("points") || "";
      break;
    case "polyline":
      data.points = element.getAttribute("points") || "";
      break;
    case "line":
      data.x1 = safeParseFloat("x1");
      data.y1 = safeParseFloat("y1");
      data.x2 = safeParseFloat("x2");
      data.y2 = safeParseFloat("y2");
      break;
    case "g":
      data.children = [];
      for (const child of element.children) {
        data.children.push(parseChildElement(child));
      }
      break;
    case "use":
      data.href = (
        element.getAttribute("href") ||
        element.getAttribute("xlink:href") ||
        ""
      ).replace("#", "");
      data.x = safeParseFloat("x");
      data.y = safeParseFloat("y");
      // Width and height can be null
      data.width = element.getAttribute("width")
        ? safeParseFloat("width")
        : null;
      data.height = element.getAttribute("height")
        ? safeParseFloat("height")
        : null;
      break;
    default:
      break;
  }

  return data;
}

/**
 * Extract presentation style attributes from an SVG element.
 *
 * Extracts paint and display properties that can be inherited from <use>
 * elements to their referenced content. These attributes participate in
 * the CSS cascade and inheritance model.
 *
 * When a <use> element has fill="red", that fill inherits to the referenced
 * content unless the content has its own fill attribute.
 *
 * @param {Element} element - SVG element to extract styles from
 * @returns {Object} Style attributes object with the following properties:
 *   - fill {string|null} - Fill color/paint server
 *   - stroke {string|null} - Stroke color/paint server
 *   - strokeWidth {string|null} - Stroke width
 *   - opacity {string|null} - Overall opacity (0-1)
 *   - fillOpacity {string|null} - Fill opacity (0-1)
 *   - strokeOpacity {string|null} - Stroke opacity (0-1)
 *   - visibility {string|null} - Visibility ('visible', 'hidden', 'collapse')
 *   - display {string|null} - Display property ('none', 'inline', etc.)
 *   All properties are null if attribute is not present.
 *
 * @example
 * // Extract styles from a use element
 * const useEl = document.querySelector('use');
 * // <use href="#icon" fill="red" stroke="blue" stroke-width="2" opacity="0.8"/>
 * const styles = extractStyleAttributes(useEl);
 * // {
 * //   fill: 'red',
 * //   stroke: 'blue',
 * //   strokeWidth: '2',
 * //   opacity: '0.8',
 * //   fillOpacity: null,
 * //   strokeOpacity: null,
 * //   visibility: null,
 * //   display: null
 * // }
 */
export function extractStyleAttributes(element) {
  // Parameter validation: element must be defined
  if (!element) {
    throw new Error('extractStyleAttributes: element is required');
  }

  return {
    fill: element.getAttribute("fill"),
    stroke: element.getAttribute("stroke"),
    strokeWidth: element.getAttribute("stroke-width"),
    opacity: element.getAttribute("opacity"),
    fillOpacity: element.getAttribute("fill-opacity"),
    strokeOpacity: element.getAttribute("stroke-opacity"),
    visibility: element.getAttribute("visibility"),
    display: element.getAttribute("display"),
  };
}

/**
 * Calculate the transform matrix to map a viewBox to a target viewport.
 *
 * This implements the SVG viewBox mapping algorithm that scales and aligns
 * the viewBox coordinate system to fit within the target width/height according
 * to the preserveAspectRatio specification.
 *
 * The viewBox defines a rectangle in user space (minX, minY, width, height) that
 * should be mapped to the viewport rectangle (0, 0, targetWidth, targetHeight).
 *
 * preserveAspectRatio controls:
 * - Alignment: where to position the viewBox within viewport (xMin/xMid/xMax, YMin/YMid/YMax)
 * - Scaling: 'meet' (fit inside, letterbox) or 'slice' (cover, crop)
 * - 'none' allows non-uniform scaling (stretch/squash)
 *
 * @param {Object} viewBox - Parsed viewBox with the following properties:
 *   - x {number} - Minimum X of viewBox coordinate system
 *   - y {number} - Minimum Y of viewBox coordinate system
 *   - width {number} - Width of viewBox rectangle
 *   - height {number} - Height of viewBox rectangle
 * @param {number} targetWidth - Target viewport width in user units
 * @param {number} targetHeight - Target viewport height in user units
 * @param {string} [preserveAspectRatio='xMidYMid meet'] - Aspect ratio preservation mode
 *   Format: '[none|align] [meet|slice]'
 *   Align values: xMinYMin, xMidYMin, xMaxYMin, xMinYMid, xMidYMid, xMaxYMid, xMinYMax, xMidYMax, xMaxYMax
 * @returns {Matrix} 3x3 affine transform matrix mapping viewBox to viewport
 *
 * @example
 * // Symbol with viewBox="0 0 100 100" used with width=200, height=150
 * const viewBox = { x: 0, y: 0, width: 100, height: 100 };
 * const transform = calculateViewBoxTransform(viewBox, 200, 150, 'xMidYMid meet');
 * // Result: uniform scale of 1.5 (min of 200/100, 150/100)
 * // Centered in 200x150 viewport: translate(25, 0) then scale(1.5, 1.5)
 *
 * @example
 * // Non-uniform scaling with 'none'
 * const viewBox = { x: 0, y: 0, width: 100, height: 50 };
 * const transform = calculateViewBoxTransform(viewBox, 200, 200, 'none');
 * // Result: scale(2, 4) - stretches to fill viewport
 *
 * @example
 * // 'slice' mode crops to fill viewport
 * const viewBox = { x: 0, y: 0, width: 100, height: 100 };
 * const transform = calculateViewBoxTransform(viewBox, 200, 150, 'xMidYMid slice');
 * // Result: uniform scale of 2.0 (max of 200/100, 150/100)
 * // Centered: translate(0, -25) then scale(2, 2) - height extends beyond viewport
 */
export function calculateViewBoxTransform(
  viewBox,
  targetWidth,
  targetHeight,
  preserveAspectRatio = "xMidYMid meet",
) {
  // Parameter validation: viewBox must have required properties
  if (!viewBox || !targetWidth || !targetHeight) {
    return Matrix.identity(3);
  }

  // Validate targetWidth and targetHeight are finite positive numbers
  if (!isFinite(targetWidth) || !isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    return Matrix.identity(3);
  }

  const vbW = viewBox.width;
  const vbH = viewBox.height;
  const vbX = viewBox.x;
  const vbY = viewBox.y;

  // Validate viewBox dimensions are finite and positive
  if (!isFinite(vbW) || !isFinite(vbH) || !isFinite(vbX) || !isFinite(vbY) || vbW <= 0 || vbH <= 0) {
    return Matrix.identity(3);
  }

  // Parse preserveAspectRatio
  const parts = preserveAspectRatio.trim().split(/\s+/);
  const align = parts[0] || "xMidYMid";
  const meetOrSlice = parts[1] || "meet";

  if (align === "none") {
    // Non-uniform scaling
    const scaleX = targetWidth / vbW;
    const scaleY = targetHeight / vbH;
    return Transforms2D.translation(-vbX * scaleX, -vbY * scaleY).mul(
      Transforms2D.scale(scaleX, scaleY),
    );
  }

  // Uniform scaling
  const scaleX = targetWidth / vbW;
  const scaleY = targetHeight / vbH;
  let scale;

  if (meetOrSlice === "slice") {
    scale = Math.max(scaleX, scaleY);
  } else {
    scale = Math.min(scaleX, scaleY);
  }

  // Calculate alignment offsets
  let tx = -vbX * scale;
  let ty = -vbY * scale;

  const scaledWidth = vbW * scale;
  const scaledHeight = vbH * scale;

  // X alignment
  if (align.includes("xMid")) {
    tx += (targetWidth - scaledWidth) / 2;
  } else if (align.includes("xMax")) {
    tx += targetWidth - scaledWidth;
  }

  // Y alignment
  if (align.includes("YMid")) {
    ty += (targetHeight - scaledHeight) / 2;
  } else if (align.includes("YMax")) {
    ty += targetHeight - scaledHeight;
  }

  return Transforms2D.translation(tx, ty).mul(Transforms2D.scale(scale, scale));
}

/**
 * Resolve a <use> element by expanding its referenced content with transforms.
 *
 * This is the core use/symbol resolution algorithm. It:
 * 1. Looks up the target element by id (can be symbol, shape, group, or nested use)
 * 2. Composes transforms: use's transform → translation from x,y → viewBox mapping
 * 3. Recursively resolves nested <use> elements (with depth limit)
 * 4. Propagates style inheritance from <use> to referenced content
 *
 * Transform composition order (right-to-left multiplication):
 * - First: apply use element's transform attribute
 * - Second: translate by (x, y) to position the reference
 * - Third: apply viewBox→viewport mapping (symbols only)
 *
 * For symbols with viewBox, if <use> specifies width/height, those establish the
 * viewport; otherwise the symbol's viewBox width/height is used.
 *
 * @param {Object} useData - Parsed <use> element data from parseUseElement()
 * @param {Object} defs - Map of element id → parsed element data (from buildDefsMap())
 * @param {Object} [options={}] - Resolution options
 * @param {number} [options.maxDepth=10] - Maximum nesting depth for recursive use resolution
 *   Prevents infinite recursion from circular references
 * @returns {Object|null} Resolved use data with the following structure:
 *   - element {Object} - The referenced target element (symbol, shape, group, etc.)
 *   - transform {Matrix} - Composed 3x3 transform matrix to apply to all children
 *   - children {Array} - Array of resolved child objects, each with:
 *     - element {Object} - Child element data
 *     - transform {Matrix} - Child's local transform
 *     - children {Array} - (if child is nested use) Recursively resolved children
 *   - inheritedStyle {Object} - Style attributes from <use> that cascade to children
 *   Returns null if target not found or max depth exceeded.
 *
 * @example
 * // Simple shape reference
 * const defs = {
 *   'myCircle': { type: 'circle', cx: 0, cy: 0, r: 10 }
 * };
 * const useData = { href: 'myCircle', x: 100, y: 50, style: { fill: 'red' } };
 * const resolved = resolveUse(useData, defs);
 * // {
 * //   element: { type: 'circle', cx: 0, cy: 0, r: 10 },
 * //   transform: Matrix(translate(100, 50)),
 * //   children: [{ element: {...}, transform: identity }],
 * //   inheritedStyle: { fill: 'red' }
 * // }
 *
 * @example
 * // Symbol with viewBox
 * const defs = {
 * 'icon': {
 *     type: 'symbol',
 *     viewBoxParsed: { x: 0, y: 0, width: 24, height: 24 },
 *     preserveAspectRatio: 'xMidYMid meet',
 *     children: [{ type: 'path', d: 'M...' }]
 *   }
 * };
 * const useData = { href: 'icon', x: 10, y: 20, width: 48, height: 48 };
 * const resolved = resolveUse(useData, defs);
 * // transform composes: translate(10,20) → viewBox mapping (scale 2x)
 *
 * @example
 * // Nested use (use referencing another use)
 * const defs = {
 *   'shape': { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
 *   'ref1': { type: 'use', href: 'shape', x: 5, y: 5 }
 * };
 * const useData = { href: 'ref1', x: 100, y: 100 };
 * const resolved = resolveUse(useData, defs);
 * // Recursively resolves ref1 → shape, composing transforms
 */
export function resolveUse(useData, defs, options = {}) {
  // Parameter validation: useData must be defined with href property
  if (!useData || !useData.href) {
    throw new Error('resolveUse: useData with href property is required');
  }

  // Parameter validation: defs must be defined
  if (!defs) {
    throw new Error('resolveUse: defs map is required');
  }

  const { maxDepth = 10 } = options;

  // Depth limit check
  if (maxDepth <= 0) {
    return null; // Prevent infinite recursion
  }

  const target = defs[useData.href];
  if (!target) {
    return null; // Target element not found
  }

  // CORRECT ORDER per SVG spec:
  // 1. Apply use element's transform attribute first
  // 2. Then apply translate(x, y) for use element's x/y attributes
  // 3. Then apply viewBox transform (for symbols)
  //
  // Matrix multiplication order: rightmost transform is applied first
  // So to apply transforms in order 1→2→3, we build: 3.mul(2).mul(1)

  // Start with x,y translation (step 2)
  let transform = Transforms2D.translation(useData.x, useData.y);

  // Pre-multiply by use element's transform if present (step 1)
  // This makes useTransform apply FIRST, then translation
  if (useData.transform) {
    const useTransform = parseTransformAttribute(useData.transform);
    transform = transform.mul(useTransform);
  }

  // Handle symbol with viewBox (step 3)
  // ViewBox transform applies LAST (after translation and useTransform)
  if (target.type === "symbol" && target.viewBoxParsed) {
    const width = useData.width || target.viewBoxParsed.width;
    const height = useData.height || target.viewBoxParsed.height;

    const viewBoxTransform = calculateViewBoxTransform(
      target.viewBoxParsed,
      width,
      height,
      target.preserveAspectRatio,
    );

    // ViewBox transform is applied LAST, so it's the leftmost in multiplication
    transform = viewBoxTransform.mul(transform);
  }

  // Resolve children
  const resolvedChildren = [];
  const children = target.children || [target];

  for (const child of children) {
    if (child.type === "use") {
      // Recursive resolution
      const resolved = resolveUse(child, defs, { maxDepth: maxDepth - 1 });
      if (resolved) {
        resolvedChildren.push(resolved);
      }
    } else {
      resolvedChildren.push({
        element: child,
        transform: Matrix.identity(3),
      });
    }
  }

  return {
    element: target,
    transform,
    children: resolvedChildren,
    inheritedStyle: useData.style,
  };
}

/**
 * Flatten a resolved <use> element tree to an array of transformed polygons.
 *
 * Recursively traverses the resolved use element hierarchy, converting all
 * shapes to polygons and applying accumulated transforms. This produces a
 * flat list of polygons ready for rendering, clipping, or geometric operations.
 *
 * Each shape element (rect, circle, path, etc.) is converted to a polygon
 * approximation with the specified number of curve samples. Transforms are
 * composed from parent to child.
 *
 * Style attributes are merged during flattening, combining inherited styles
 * from <use> elements with element-specific styles (element styles take precedence).
 *
 * @param {Object} resolved - Resolved use data from resolveUse(), with structure:
 *   - transform {Matrix} - Transform to apply to all children
 *   - children {Array} - Child elements or nested resolved uses
 *   - inheritedStyle {Object} - Style attributes to cascade to children
 * @param {number} [samples=20] - Number of samples for curve approximation
 *   Higher values produce smoother polygons for curved shapes (circles, arcs, etc.)
 * @returns {Array<Object>} Array of polygon objects, each with:
 *   - polygon {Array<{x, y}>} - Array of transformed vertex points
 *   - style {Object} - Merged style attributes (inherited + element-specific)
 *
 * @example
 * // Flatten a simple resolved use
 * const defs = { 'c': { type: 'circle', cx: 10, cy: 10, r: 5, style: { fill: 'blue' } } };
 * const useData = { href: 'c', x: 100, y: 50, style: { stroke: 'red' } };
 * const resolved = resolveUse(useData, defs);
 * const polygons = flattenResolvedUse(resolved, 20);
 * // [
 * //   {
 * //     polygon: [{x: 115, y: 50}, {x: 114.9, y: 51.5}, ...], // 20 points approximating circle
 * //     style: { fill: 'blue', stroke: 'red', ... } // merged styles
 * //   }
 * // ]
 *
 * @example
 * // Flatten nested uses with composed transforms
 * const resolved = { // Complex nested structure
 *   transform: Matrix(translate(10, 20)),
 *   children: [
 *     {
 *       element: { type: 'rect', x: 0, y: 0, width: 50, height: 30 },
 *       transform: Matrix(rotate(45))
 *     }
 *   ],
 *   inheritedStyle: { fill: 'green' }
 * };
 * const polygons = flattenResolvedUse(resolved);
 * // Rectangle converted to 4-point polygon, transformed by translate→rotate
 */
export function flattenResolvedUse(resolved, samples = 20) {
  const results = [];

  // Edge case: resolved is null or undefined
  if (!resolved) return results;

  // Parameter validation: samples must be a positive number
  if (typeof samples !== 'number' || samples <= 0 || !isFinite(samples)) {
    throw new Error('flattenResolvedUse: samples must be a positive finite number');
  }

  // Validate required properties exist
  if (!resolved.children || !resolved.transform) {
    return results;
  }

  for (const child of resolved.children) {
    // Validate child has required properties
    if (!child || !child.transform) {
      continue;
    }

    const childTransform = resolved.transform.mul(child.transform);
    const element = child.element;

    if (child.children) {
      // Recursive flattening
      const nested = flattenResolvedUse(child, samples);
      for (const n of nested) {
        n.polygon = n.polygon.map((p) => {
          const [x, y] = Transforms2D.applyTransform(
            resolved.transform,
            p.x,
            p.y,
          );
          return { x, y };
        });
        results.push(n);
      }
    } else {
      // Convert element to polygon
      const polygon = elementToPolygon(element, childTransform, samples);
      if (polygon.length >= 3) {
        results.push({
          polygon,
          style: mergeStyles(resolved.inheritedStyle, element.style),
        });
      }
    }
  }

  return results;
}

/**
 * Convert an SVG element to a transformed polygon approximation.
 *
 * Delegates to ClipPathResolver.shapeToPolygon() for the element→polygon
 * conversion, then applies the transform matrix to all vertices.
 *
 * Supports all standard SVG shapes:
 * - rect, circle, ellipse: converted to polygons with curved edges sampled
 * - path: parsed and sampled (curves approximated)
 * - polygon, polyline: parsed directly
 * - line: converted to 2-point polygon
 *
 * @param {Object} element - Parsed element data from parseChildElement()
 *   Must have 'type' property and geometry attributes (x, y, cx, cy, d, points, etc.)
 * @param {Matrix} transform - 3x3 affine transform matrix to apply to vertices
 * @param {number} [samples=20] - Number of samples for curve approximation
 *   Used for circles, ellipses, path curves, rounded rect corners, etc.
 * @returns {Array<{x, y}>} Array of transformed polygon vertices
 *   Empty array if element cannot be converted to polygon.
 *
 * @example
 * // Convert circle to transformed polygon
 * const element = { type: 'circle', cx: 10, cy: 10, r: 5 };
 * const transform = Transforms2D.translation(100, 50).mul(Transforms2D.scale(2, 2));
 * const polygon = elementToPolygon(element, transform, 16);
 * // Returns 16 points approximating circle at (10,10) r=5, then scaled 2x and translated to (100,50)
 *
 * @example
 * // Convert rectangle (becomes 4-point polygon)
 * const element = { type: 'rect', x: 0, y: 0, width: 50, height: 30, rx: 0, ry: 0 };
 * const transform = Matrix.identity(3);
 * const polygon = elementToPolygon(element, transform);
 * // [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 0, y: 30 }]
 */
export function elementToPolygon(element, transform, samples = 20) {
  // Parameter validation: element must be defined
  if (!element) {
    throw new Error('elementToPolygon: element is required');
  }

  // Parameter validation: samples must be a positive finite number
  if (typeof samples !== 'number' || samples <= 0 || !isFinite(samples)) {
    throw new Error('elementToPolygon: samples must be a positive finite number');
  }

  // Use ClipPathResolver's shapeToPolygon
  let polygon = ClipPathResolver.shapeToPolygon(element, null, samples);

  // Apply transform if provided and polygon is not empty
  if (transform && polygon.length > 0) {
    polygon = polygon.map((p) => {
      const [x, y] = Transforms2D.applyTransform(transform, p.x, p.y);
      return { x, y };
    });
  }

  return polygon;
}

/**
 * Merge inherited styles from <use> with element-specific styles.
 *
 * Implements the SVG style inheritance cascade where <use> element styles
 * propagate to referenced content, but element-specific styles take precedence.
 *
 * This follows the CSS cascade model:
 * - Element's own attributes have highest priority
 * - Inherited attributes from <use> fill in gaps
 * - null/undefined element values allow inheritance
 * - Explicit element values (even if same as inherited) prevent inheritance
 *
 * Example: <use fill="red" href="#shape"/> references <circle fill="blue"/>
 * Result: circle gets fill="blue" (element's own style wins)
 *
 * Example: <use fill="red" href="#shape"/> references <circle/>
 * Result: circle gets fill="red" (inherits from use)
 *
 * @param {Object} inherited - Style attributes from <use> element (from extractStyleAttributes)
 *   May be null or undefined. Properties with null values are not inherited.
 * @param {Object} element - Element's own style attributes (from extractStyleAttributes)
 *   Properties with non-null values take precedence over inherited values.
 * @returns {Object} Merged style object where:
 *   - Element properties are preserved if not null/undefined
 *   - Inherited properties fill in where element has null/undefined
 *   - Result contains all properties from both objects
 *
 * @example
 * // Element style overrides inherited
 * const inherited = { fill: 'red', stroke: 'blue', opacity: '0.5' };
 * const element = { fill: 'green', stroke: null, strokeWidth: '2' };
 * const merged = mergeStyles(inherited, element);
 * // {
 * //   fill: 'green',        // element overrides
 * //   stroke: 'blue',       // inherited (element was null)
 * //   opacity: '0.5',       // inherited (element didn't have it)
 * //   strokeWidth: '2'      // from element
 * // }
 *
 * @example
 * // No inherited styles
 * const merged = mergeStyles(null, { fill: 'blue' });
 * // { fill: 'blue' }
 */
export function mergeStyles(inherited, element) {
  // Parameter validation: element must be defined (inherited can be null)
  if (!element || typeof element !== 'object') {
    throw new Error('mergeStyles: element must be a valid object');
  }

  const result = { ...element };

  // Inherited can be null/undefined, handle gracefully
  for (const [key, value] of Object.entries(inherited || {})) {
    // Inherit if value is not null and element doesn't have a value (null or undefined)
    if (value !== null && (result[key] === null || result[key] === undefined)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Calculate the axis-aligned bounding box of a resolved <use> element.
 *
 * Flattens the entire use/symbol hierarchy to polygons, then computes
 * the minimum rectangle that contains all transformed vertices.
 *
 * This is useful for:
 * - Determining the rendered extent of a use element
 * - Layout calculations
 * - Viewport fitting
 * - Collision detection
 *
 * The bounding box is axis-aligned (edges parallel to X/Y axes) in the
 * final coordinate space after all transforms have been applied.
 *
 * @param {Object} resolved - Resolved use data from resolveUse()
 *   Contains the element tree with composed transforms
 * @param {number} [samples=20] - Number of samples for curve approximation
 *   Higher values give tighter bounds for curved shapes
 * @returns {Object} Bounding box with properties:
 *   - x {number} - Minimum X coordinate (left edge)
 *   - y {number} - Minimum Y coordinate (top edge)
 *   - width {number} - Width of bounding box
 *   - height {number} - Height of bounding box
 *   Returns {x:0, y:0, width:0, height:0} if no polygons or resolved is null.
 *
 * @example
 * // Get bbox of a circle use element
 * const defs = { 'c': { type: 'circle', cx: 0, cy: 0, r: 10 } };
 * const useData = { href: 'c', x: 100, y: 50, style: {} };
 * const resolved = resolveUse(useData, defs);
 * const bbox = getResolvedBBox(resolved, 20);
 * // { x: 90, y: 40, width: 20, height: 20 }
 * // Circle at (0,0) r=10, translated to (100,50), bounds from 90 to 110, 40 to 60
 *
 * @example
 * // Get bbox of rotated rectangle
 * const defs = { 'r': { type: 'rect', x: 0, y: 0, width: 100, height: 50, transform: 'rotate(45)' } };
 * const useData = { href: 'r', x: 0, y: 0 };
 * const resolved = resolveUse(useData, defs);
 * const bbox = getResolvedBBox(resolved);
 * // Axis-aligned bbox enclosing the rotated rectangle (wider than original)
 */
export function getResolvedBBox(resolved, samples = 20) {
  // Parameter validation: samples must be a positive finite number
  if (typeof samples !== 'number' || samples <= 0 || !isFinite(samples)) {
    throw new Error('getResolvedBBox: samples must be a positive finite number');
  }

  const polygons = flattenResolvedUse(resolved, samples);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { polygon } of polygons) {
    for (const p of polygon) {
      const x = Number(p.x);
      const y = Number(p.y);

      // Skip NaN values to prevent corrupting bounding box
      if (isNaN(x) || isNaN(y)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  // Return empty bbox if no valid points found
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
 * Apply a clipping polygon to a resolved <use> element.
 *
 * Flattens the use element to polygons, then computes the intersection
 * of each polygon with the clip polygon using the Sutherland-Hodgman
 * algorithm. This implements SVG clipPath functionality.
 *
 * The clip polygon should be in the same coordinate space as the
 * resolved use element (i.e., after all transforms have been applied).
 *
 * Clipping can produce multiple output polygons per input polygon if
 * the clip path splits a shape into disjoint regions.
 *
 * Degenerate results (< 3 vertices) are filtered out automatically.
 *
 * @param {Object} resolved - Resolved use data from resolveUse()
 *   Contains the element tree with composed transforms
 * @param {Array<{x, y}>} clipPolygon - Clipping polygon vertices
 *   Must be a closed polygon (clockwise or counter-clockwise)
 * @param {number} [samples=20] - Number of samples for curve approximation
 *   Affects the input polygons (curves in the use element)
 * @returns {Array<Object>} Array of clipped polygon objects, each with:
 *   - polygon {Array<{x, y}>} - Clipped polygon vertices (intersection result)
 *   - style {Object} - Preserved style attributes from original polygon
 *   Only polygons with ≥3 vertices are included.
 *
 * @example
 * // Clip a circle to a rectangular region
 * const defs = { 'c': { type: 'circle', cx: 50, cy: 50, r: 30 } };
 * const useData = { href: 'c', x: 0, y: 0, style: { fill: 'blue' } };
 * const resolved = resolveUse(useData, defs);
 * const clipRect = [
 *   { x: 40, y: 40 },
 *   { x: 80, y: 40 },
 *   { x: 80, y: 80 },
 *   { x: 40, y: 80 }
 * ];
 * const clipped = clipResolvedUse(resolved, clipRect, 20);
 * // Returns polygons representing the quarter-circle intersection
 * // [{ polygon: [...], style: { fill: 'blue', ... } }]
 *
 * @example
 * // Complex clip that may split shapes
 * const clipPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]; // Triangle
 * const clipped = clipResolvedUse(resolved, clipPath);
 * // May produce multiple disjoint polygons if use element spans outside triangle
 */
export function clipResolvedUse(resolved, clipPolygon, samples = 20) {
  // Parameter validation: clipPolygon must be defined and be an array
  if (!clipPolygon || !Array.isArray(clipPolygon)) {
    throw new Error('clipResolvedUse: clipPolygon must be a valid array');
  }

  // Validate clipPolygon has at least 3 points
  if (clipPolygon.length < 3) {
    throw new Error('clipResolvedUse: clipPolygon must have at least 3 vertices');
  }

  // Parameter validation: samples must be a positive finite number
  if (typeof samples !== 'number' || samples <= 0 || !isFinite(samples)) {
    throw new Error('clipResolvedUse: samples must be a positive finite number');
  }

  const polygons = flattenResolvedUse(resolved, samples);
  const result = [];

  for (const { polygon, style } of polygons) {
    const clipped = PolygonClip.polygonIntersection(polygon, clipPolygon);

    for (const clippedPoly of clipped) {
      if (clippedPoly.length >= 3) {
        result.push({
          polygon: clippedPoly,
          style,
        });
      }
    }
  }

  return result;
}

/**
 * Convert a resolved <use> element to SVG path data string.
 *
 * Flattens the use element hierarchy to polygons, then generates
 * combined SVG path data using M (moveto), L (lineto), and Z (closepath)
 * commands. All curves are approximated as polylines.
 *
 * The resulting path data can be used to:
 * - Create a <path> element representing the expanded use
 * - Export to other formats
 * - Perform path-based operations
 *
 * Multiple shapes produce a compound path with multiple M commands.
 * Coordinates are formatted to 6 decimal places for precision.
 *
 * @param {Object} resolved - Resolved use data from resolveUse()
 *   Contains the element tree with composed transforms
 * @param {number} [samples=20] - Number of samples for curve approximation
 *   Higher values produce smoother paths but longer data strings
 * @returns {string} SVG path data string with M, L, Z commands
 *   Multiple polygons are concatenated with spaces.
 *   Returns empty string if no valid polygons.
 *
 * @example
 * // Convert circle use to path data
 * const defs = { 'c': { type: 'circle', cx: 10, cy: 10, r: 5 } };
 * const useData = { href: 'c', x: 100, y: 50 };
 * const resolved = resolveUse(useData, defs);
 * const pathData = resolvedUseToPathData(resolved, 8);
 * // "M 115.000000 50.000000 L 114.619... L 113.535... ... Z"
 * // 8-point approximation of circle, moved to (110, 60)
 *
 * @example
 * // Multiple shapes produce compound path
 * const defs = {
 *   'icon': {
 *     type: 'symbol',
 *     children: [
 *       { type: 'rect', x: 0, y: 0, width: 10, height: 10 },
 *       { type: 'circle', cx: 15, cy: 5, r: 3 }
 *     ]
 *   }
 * };
 * const useData = { href: 'icon', x: 0, y: 0 };
 * const resolved = resolveUse(useData, defs);
 * const pathData = resolvedUseToPathData(resolved);
 * // "M 0.000000 0.000000 L 10.000000 0.000000 ... Z M 18.000000 5.000000 L ... Z"
 * // Two closed subpaths (rectangle + circle)
 */
export function resolvedUseToPathData(resolved, samples = 20) {
  // Parameter validation: samples must be a positive finite number
  if (typeof samples !== 'number' || samples <= 0 || !isFinite(samples)) {
    throw new Error('resolvedUseToPathData: samples must be a positive finite number');
  }

  const polygons = flattenResolvedUse(resolved, samples);
  const paths = [];

  for (const { polygon } of polygons) {
    if (polygon.length >= 3) {
      let d = "";
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const x = Number(p.x);
        const y = Number(p.y);

        // Skip invalid points with NaN coordinates
        if (isNaN(x) || isNaN(y)) {
          continue;
        }

        d += i === 0 ? `M ${x.toFixed(6)} ${y.toFixed(6)}` : ` L ${x.toFixed(6)} ${y.toFixed(6)}`;
      }
      d += " Z";
      paths.push(d);
    }
  }

  return paths.join(" ");
}

/**
 * Build a definitions map from an SVG document for use/symbol resolution.
 *
 * Scans the entire SVG document for elements with id attributes and parses
 * them into a lookup table. This map is used by resolveUse() to find
 * referenced elements.
 *
 * Elements can be in <defs>, <symbol>, or anywhere in the document.
 * The SVG spec allows <use> to reference any element with an id, not just
 * those in <defs>.
 *
 * Special handling for <symbol> elements: they are parsed with viewBox
 * and preserveAspectRatio support via parseSymbolElement(). All other
 * elements use parseChildElement().
 *
 * @param {Element} svgRoot - SVG root element or any container element
 *   Typically the <svg> element, but can be any parent to search within
 * @returns {Object} Map object where:
 *   - Keys are element id strings
 *   - Values are parsed element data objects with:
 *     - type {string} - Element tag name
 *     - Geometry properties specific to element type
 *     - children {Array} - For symbols and groups
 *     - viewBoxParsed {Object} - For symbols with viewBox
 *     - All other properties from parseSymbolElement() or parseChildElement()
 *
 * @example
 * // Build defs map from SVG document
 * const svg = document.querySelector('svg');
 * // <svg>
 * //   <defs>
 * //     <symbol id="icon" viewBox="0 0 24 24">
 * //       <circle cx="12" cy="12" r="10"/>
 * //     </symbol>
 * //     <circle id="dot" cx="0" cy="0" r="5"/>
 * //   </defs>
 * //   <rect id="bg" x="0" y="0" width="100" height="100"/>
 * // </svg>
 * const defs = buildDefsMap(svg);
 * // {
 * //   'icon': { type: 'symbol', viewBoxParsed: {...}, children: [...], ... },
 * //   'dot': { type: 'circle', cx: 0, cy: 0, r: 5, ... },
 * //   'bg': { type: 'rect', x: 0, y: 0, width: 100, height: 100, ... }
 * // }
 *
 * @example
 * // Use the defs map for resolution
 * const defs = buildDefsMap(svg);
 * const useData = parseUseElement(useElement);
 * const resolved = resolveUse(useData, defs);
 */
export function buildDefsMap(svgRoot) {
  // Parameter validation: svgRoot must be defined and have querySelectorAll method
  if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') {
    throw new Error('buildDefsMap: svgRoot must be a valid DOM element');
  }

  const defs = {};

  // Find all elements with id
  const elementsWithId = svgRoot.querySelectorAll("[id]");

  for (const element of elementsWithId) {
    const id = element.getAttribute("id");

    // Skip elements without a valid id
    if (!id) {
      continue;
    }

    // Validate element has tagName
    if (!element.tagName) {
      continue;
    }

    const tagName = element.tagName.toLowerCase();

    if (tagName === "symbol") {
      defs[id] = parseSymbolElement(element);
      defs[id].type = "symbol";
    } else {
      defs[id] = parseChildElement(element);
    }
  }

  return defs;
}

/**
 * Resolve all <use> elements in an SVG document.
 *
 * This is a convenience function that:
 * 1. Builds the definitions map from the document
 * 2. Finds all <use> elements
 * 3. Resolves each one individually
 * 4. Returns an array of results with original DOM element, parsed data, and resolution
 *
 * Useful for batch processing an entire SVG document, such as:
 * - Expanding all uses for rendering
 * - Converting uses to inline elements
 * - Analyzing use element usage
 * - Generating expanded SVG output
 *
 * Failed resolutions (target not found, max depth exceeded) are filtered out.
 *
 * @param {Element} svgRoot - SVG root element to search within
 *   Typically the <svg> element. All <use> elements within will be resolved.
 * @param {Object} [options={}] - Resolution options passed to resolveUse()
 * @param {number} [options.maxDepth=10] - Maximum nesting depth for recursive use resolution
 * @returns {Array<Object>} Array of successfully resolved use elements, each with:
 *   - original {Element} - The original <use> DOM element
 *   - useData {Object} - Parsed use element data from parseUseElement()
 *   - resolved {Object} - Resolved structure from resolveUse() with:
 *     - element {Object} - Referenced target element
 *     - transform {Matrix} - Composed transform matrix
 *     - children {Array} - Resolved children
 *     - inheritedStyle {Object} - Inherited style attributes
 *
 * @example
 * // Resolve all uses in an SVG document
 * const svg = document.querySelector('svg');
 * // <svg>
 * //   <defs>
 * //     <circle id="dot" r="5"/>
 * //   </defs>
 * //   <use href="#dot" x="10" y="20" fill="red"/>
 * //   <use href="#dot" x="30" y="40" fill="blue"/>
 * // </svg>
 * const allResolved = resolveAllUses(svg);
 * // [
 * //   {
 * //     original: <use> element,
 * //     useData: { href: 'dot', x: 10, y: 20, style: { fill: 'red' }, ... },
 * //     resolved: { element: {...}, transform: Matrix(...), ... }
 * //   },
 * //   {
 * //     original: <use> element,
 * //     useData: { href: 'dot', x: 30, y: 40, style: { fill: 'blue' }, ... },
 * //     resolved: { element: {...}, transform: Matrix(...), ... }
 * //   }
 * // ]
 *
 * @example
 * // Convert all uses to inline paths
 * const resolved = resolveAllUses(svg);
 * for (const { original, resolved: result } of resolved) {
 *   const pathData = resolvedUseToPathData(result);
 *   const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
 *   path.setAttribute('d', pathData);
 *   original.parentNode.replaceChild(path, original);
 * }
 */
export function resolveAllUses(svgRoot, options = {}) {
  // Parameter validation: svgRoot must be defined and have querySelectorAll method
  if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') {
    throw new Error('resolveAllUses: svgRoot must be a valid DOM element');
  }

  const defs = buildDefsMap(svgRoot);
  const useElements = svgRoot.querySelectorAll("use");
  const resolved = [];

  // Helper to get the next use reference from a definition
  const getUseRef = (id) => {
    // Validate id parameter
    if (!id || typeof id !== 'string') {
      return null;
    }

    const target = defs[id];
    if (!target) return null;

    // Check if target is itself a use element
    if (target.type === "use") {
      return target.href;
    }

    // Check if target contains use elements in its children
    if (target.children && target.children.length > 0) {
      for (const child of target.children) {
        if (child.type === "use") {
          return child.href;
        }
      }
    }

    return null;
  };

  for (const useEl of useElements) {
    const useData = parseUseElement(useEl);

    // Skip use elements without valid href
    if (!useData.href) {
      continue;
    }

    // Check for circular reference before attempting to resolve
    if (hasCircularReference(useData.href, getUseRef)) {
      console.warn(
        `Circular use reference detected: #${useData.href}, skipping resolution`,
      );
      continue;
    }

    const result = resolveUse(useData, defs, options);
    if (result) {
      resolved.push({
        original: useEl,
        useData,
        resolved: result,
      });
    }
  }

  return resolved;
}

export default {
  parseUseElement,
  parseSymbolElement,
  parseChildElement,
  extractStyleAttributes,
  calculateViewBoxTransform,
  resolveUse,
  flattenResolvedUse,
  elementToPolygon,
  mergeStyles,
  getResolvedBBox,
  clipResolvedUse,
  resolvedUseToPathData,
  buildDefsMap,
  resolveAllUses,
};
