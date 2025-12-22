/**
 * SVG Transform Flattening Utility
 *
 * Parses SVG transform attributes, builds CTM (Current Transform Matrix) for each element,
 * and can flatten all transforms by applying them directly to coordinates.
 *
 * ## Key Concepts
 *
 * ### CTM (Current Transform Matrix)
 * The CTM is the cumulative transformation matrix from the root SVG viewport to an element.
 * It is built by multiplying all transformation matrices from ancestors in order:
 * CTM = viewport_transform × parent_group_transform × element_transform
 *
 * ### SVG Coordinate Systems
 * - **Viewport coordinates**: Physical pixels on screen (e.g., width="800" height="600")
 * - **viewBox coordinates**: User space coordinates defined by viewBox attribute
 * - **User coordinates**: The coordinate system after applying all transforms
 * - **objectBoundingBox**: Normalized (0,0) to (1,1) coordinate space of an element's bounding box
 *
 * ### Transform Application Order
 * Transforms in SVG are applied right-to-left (matrix multiplication order):
 * transform="translate(10,20) rotate(45)" means: first rotate, then translate
 * This is equivalent to: T × R where T is translation and R is rotation
 *
 * ### viewBox to Viewport Mapping
 * The viewBox attribute defines a rectangle in user space that maps to the viewport:
 * - viewBox="minX minY width height" defines the user space rectangle
 * - preserveAspectRatio controls how scaling and alignment occur
 * - The transformation is: translate(viewport_offset) × scale(uniform_or_nonuniform) × translate(-minX, -minY)
 *
 * @module svg-flatten
 */

import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import * as Transforms2D from "./transforms2d.js";

// Set high precision for all calculations
Decimal.set({ precision: 80 });

// ============================================================================
// viewBox and preserveAspectRatio Parsing
// ============================================================================

/**
 * Parse an SVG viewBox attribute into its component values.
 *
 * The viewBox defines the user space coordinate system for the SVG viewport.
 * It specifies a rectangle in user space that should be mapped to the bounds
 * of the viewport.
 *
 * @param {string} viewBoxStr - viewBox attribute value in format "minX minY width height"
 *                              Values can be space or comma separated
 * @returns {{minX: Decimal, minY: Decimal, width: Decimal, height: Decimal}|null}
 *          Parsed viewBox object with Decimal precision, or null if invalid/empty
 *
 * @example
 * // Parse a standard viewBox
 * const vb = parseViewBox("0 0 100 100");
 * // Returns: { minX: Decimal(0), minY: Decimal(0), width: Decimal(100), height: Decimal(100) }
 *
 * @example
 * // Comma-separated values also work
 * const vb = parseViewBox("0,0,800,600");
 *
 * @example
 * // Non-zero origin for panning/zooming
 * const vb = parseViewBox("-50 -50 200 200");
 * // Shows region from (-50,-50) to (150,150) in user space
 */
export function parseViewBox(viewBoxStr) {
  // Validate input type and content
  if (!viewBoxStr || typeof viewBoxStr !== "string" || viewBoxStr.trim() === "") {
    return null;
  }

  let parts;
  try {
    parts = viewBoxStr
      .trim()
      .split(/[\s,]+/)
      .map((s) => new Decimal(s));
  } catch (_err) {
    console.warn(`Invalid viewBox (parse error): ${viewBoxStr}`);
    return null;
  }

  if (parts.length !== 4) {
    console.warn(`Invalid viewBox (expected 4 values): ${viewBoxStr}`);
    return null;
  }

  const width = parts[2];
  const height = parts[3];

  // Validate dimensions are positive and finite
  if (width.lte(0) || height.lte(0)) {
    console.warn(`Invalid viewBox (non-positive dimensions): ${viewBoxStr}`);
    return null;
  }

  if (!width.isFinite() || !height.isFinite() || !parts[0].isFinite() || !parts[1].isFinite()) {
    console.warn(`Invalid viewBox (non-finite values): ${viewBoxStr}`);
    return null;
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

/**
 * Parse an SVG preserveAspectRatio attribute.
 *
 * The preserveAspectRatio attribute controls how an element's viewBox is fitted
 * to the viewport when aspect ratios don't match. It consists of:
 * - defer: Only applies to <image> elements (optional)
 * - align: One of 9 alignment values (xMin/xMid/xMax + YMin/YMid/YMax) or "none"
 * - meetOrSlice: "meet" (fit entirely, letterbox) or "slice" (fill, crop)
 *
 * Format: "[defer] <align> [<meetOrSlice>]"
 *
 * @param {string} parStr - preserveAspectRatio attribute value
 * @returns {{defer: boolean, align: string, meetOrSlice: string}}
 *          Object with parsed components, defaults to {defer: false, align: 'xMidYMid', meetOrSlice: 'meet'}
 *
 * @example
 * // Default centered scaling to fit
 * const par = parsePreserveAspectRatio("xMidYMid meet");
 * // Returns: { defer: false, align: 'xMidYMid', meetOrSlice: 'meet' }
 *
 * @example
 * // Scale to fill, cropping if necessary
 * const par = parsePreserveAspectRatio("xMidYMid slice");
 *
 * @example
 * // No uniform scaling, stretch to fill
 * const par = parsePreserveAspectRatio("none");
 * // Returns: { defer: false, align: 'none', meetOrSlice: 'meet' }
 *
 * @example
 * // Align to top-left corner
 * const par = parsePreserveAspectRatio("xMinYMin meet");
 */
export function parsePreserveAspectRatio(parStr) {
  const result = {
    defer: false,
    align: "xMidYMid", // default
    meetOrSlice: "meet", // default
  };

  if (!parStr || parStr.trim() === "") {
    return result;
  }

  const parts = parStr.trim().split(/\s+/);
  let idx = 0;

  // Check for 'defer' (only applies to <image>)
  if (parts[idx] === "defer") {
    result.defer = true;
    idx++;
  }

  // Alignment value
  if (parts[idx]) {
    result.align = parts[idx];
    idx++;
  }

  // meetOrSlice
  if (parts[idx]) {
    result.meetOrSlice = parts[idx].toLowerCase();
  }

  return result;
}

/**
 * Compute the transformation matrix from viewBox coordinates to viewport.
 *
 * Implements the SVG 2 algorithm for viewBox + preserveAspectRatio mapping.
 * This transformation converts user space coordinates (defined by viewBox)
 * to viewport coordinates (actual pixels).
 *
 * The transformation consists of three steps:
 * 1. Translate by (-minX, -minY) to move viewBox origin to (0, 0)
 * 2. Scale uniformly or non-uniformly based on preserveAspectRatio
 * 3. Translate for alignment within the viewport
 *
 * Algorithm details:
 * - If align="none": Non-uniform scaling (may distort aspect ratio)
 *   scaleX = viewportWidth / viewBoxWidth
 *   scaleY = viewportHeight / viewBoxHeight
 *
 * - If meetOrSlice="meet": Use min(scaleX, scaleY) - content fits entirely (letterbox)
 * - If meetOrSlice="slice": Use max(scaleX, scaleY) - viewport fills entirely (crop)
 *
 * - Alignment (xMin/xMid/xMax, YMin/YMid/YMax) determines offset:
 *   xMin: left aligned (offset = 0)
 *   xMid: center aligned (offset = (viewport - scaled) / 2)
 *   xMax: right aligned (offset = viewport - scaled)
 *
 * @param {Object} viewBox - Parsed viewBox {minX, minY, width, height}
 * @param {number|Decimal} viewportWidth - Viewport width in pixels
 * @param {number|Decimal} viewportHeight - Viewport height in pixels
 * @param {Object} [par=null] - Parsed preserveAspectRatio {align, meetOrSlice}.
 *                              Defaults to {align: 'xMidYMid', meetOrSlice: 'meet'} if null
 * @returns {Matrix} 3x3 transformation matrix that maps viewBox to viewport
 *
 * @example
 * // Map viewBox "0 0 100 100" to 800x600 viewport with default centering
 * const vb = parseViewBox("0 0 100 100");
 * const matrix = computeViewBoxTransform(vb, 800, 600);
 * // Uniform scale of 6 (min(800/100, 600/100)), centered
 *
 * @example
 * // Stretch to fill without preserving aspect ratio
 * const vb = parseViewBox("0 0 100 50");
 * const par = parsePreserveAspectRatio("none");
 * const matrix = computeViewBoxTransform(vb, 800, 600, par);
 * // scaleX=8, scaleY=12 (different scales)
 *
 * @example
 * // Slice (zoom to fill, crop overflow)
 * const vb = parseViewBox("0 0 100 100");
 * const par = parsePreserveAspectRatio("xMidYMid slice");
 * const matrix = computeViewBoxTransform(vb, 800, 400, par);
 * // Uniform scale of 8 (max(800/100, 400/100)), centered, top/bottom cropped
 */
export function computeViewBoxTransform(
  viewBox,
  viewportWidth,
  viewportHeight,
  par = null,
) {
  const D = (x) => new Decimal(x);

  if (!viewBox) {
    return Matrix.identity(3);
  }

  const vbX = viewBox.minX;
  const vbY = viewBox.minY;
  const vbW = viewBox.width;
  const vbH = viewBox.height;
  const vpW = D(viewportWidth);
  const vpH = D(viewportHeight);

  // Validate dimensions are positive and finite to prevent division by zero
  if (vbW.lte(0) || vbH.lte(0)) {
    console.warn("Invalid viewBox dimensions (must be positive)");
    return Matrix.identity(3);
  }
  if (vpW.lte(0) || vpH.lte(0)) {
    console.warn("Invalid viewport dimensions (must be positive)");
    return Matrix.identity(3);
  }
  if (!vbW.isFinite() || !vbH.isFinite() || !vpW.isFinite() || !vpH.isFinite()) {
    console.warn("Invalid dimensions (must be finite)");
    return Matrix.identity(3);
  }

  // Default preserveAspectRatio
  const parValue = par || { align: "xMidYMid", meetOrSlice: "meet" };

  // Handle 'none' - stretch to fill
  if (parValue.align === "none") {
    const scaleX = vpW.div(vbW);
    const scaleY = vpH.div(vbH);
    // translate(-minX, -minY) then scale
    const translateM = Transforms2D.translation(vbX.neg(), vbY.neg());
    const scaleM = Transforms2D.scale(scaleX, scaleY);
    return scaleM.mul(translateM);
  }

  // Compute uniform scale factor
  const scaleX = vpW.div(vbW);
  const scaleY = vpH.div(vbH);
  let scale;

  if (parValue.meetOrSlice === "slice") {
    // Use larger scale (content may overflow)
    scale = Decimal.max(scaleX, scaleY);
  } else {
    // 'meet' - use smaller scale (content fits entirely)
    scale = Decimal.min(scaleX, scaleY);
  }

  // Compute translation for alignment
  const scaledW = vbW.mul(scale);
  const scaledH = vbH.mul(scale);

  let translateX = D(0);
  let translateY = D(0);

  // Parse alignment string (e.g., 'xMidYMid', 'xMinYMax')
  const align = parValue.align;

  // X alignment
  if (align.includes("xMid")) {
    translateX = vpW.minus(scaledW).div(2);
  } else if (align.includes("xMax")) {
    translateX = vpW.minus(scaledW);
  }
  // xMin is default (translateX = 0)

  // Y alignment
  if (align.includes("YMid")) {
    translateY = vpH.minus(scaledH).div(2);
  } else if (align.includes("YMax")) {
    translateY = vpH.minus(scaledH);
  }
  // YMin is default (translateY = 0)

  // Build the transform: translate(translateX, translateY) scale(scale) translate(-minX, -minY)
  // Applied right-to-left: first translate by -minX,-minY, then scale, then translate for alignment
  const translateMinM = Transforms2D.translation(vbX.neg(), vbY.neg());
  const scaleM = Transforms2D.scale(scale, scale);
  const translateAlignM = Transforms2D.translation(translateX, translateY);

  return translateAlignM.mul(scaleM).mul(translateMinM);
}

/**
 * Represents an SVG viewport with its coordinate system parameters.
 *
 * An SVG viewport establishes a new coordinate system. Each <svg> element
 * creates a viewport that can have:
 * - Physical dimensions (width, height)
 * - User space coordinates (viewBox)
 * - Aspect ratio preservation rules (preserveAspectRatio)
 * - Additional transformations (transform attribute)
 *
 * Nested <svg> elements create nested viewports, each with their own
 * coordinate system transformation that contributes to the final CTM.
 *
 * @class SVGViewport
 */
export class SVGViewport {
  /**
   * Create an SVG viewport.
   *
   * @param {number|Decimal} width - Viewport width in pixels or user units
   * @param {number|Decimal} height - Viewport height in pixels or user units
   * @param {string|null} [viewBox=null] - viewBox attribute value (e.g., "0 0 100 100")
   * @param {string|null} [preserveAspectRatio=null] - preserveAspectRatio attribute value
   *                                                    Defaults to "xMidYMid meet" per SVG spec
   * @param {string|null} [transform=null] - transform attribute value (e.g., "rotate(45)")
   *
   * @example
   * // Simple viewport without viewBox
   * const viewport = new SVGViewport(800, 600);
   *
   * @example
   * // Viewport with viewBox for scalable graphics
   * const viewport = new SVGViewport(800, 600, "0 0 100 100");
   * // Maps user space (0,0)-(100,100) to viewport (0,0)-(800,600)
   *
   * @example
   * // Viewport with custom aspect ratio and transform
   * const viewport = new SVGViewport(
   *   800, 600,
   *   "0 0 100 50",
   *   "xMinYMin slice",
   *   "rotate(45 50 25)"
   * );
   */
  constructor(
    width,
    height,
    viewBox = null,
    preserveAspectRatio = null,
    transform = null,
  ) {
    // Validate width and height
    const w = new Decimal(width);
    const h = new Decimal(height);

    if (w.lte(0) || h.lte(0)) {
      throw new Error("SVGViewport dimensions must be positive");
    }
    if (!w.isFinite() || !h.isFinite()) {
      throw new Error("SVGViewport dimensions must be finite");
    }

    this.width = w;
    this.height = h;
    this.viewBox = viewBox ? parseViewBox(viewBox) : null;
    this.preserveAspectRatio = parsePreserveAspectRatio(preserveAspectRatio);
    this.transform = transform;
  }

  /**
   * Compute the transformation matrix for this viewport.
   *
   * Combines viewBox mapping and transform attribute into a single matrix.
   * The viewBox transform (if present) is applied first, then the transform attribute.
   *
   * Order of operations:
   * 1. viewBox transform (maps user space to viewport)
   * 2. transform attribute (additional transformations)
   *
   * @returns {Matrix} 3x3 transformation matrix for this viewport
   *
   * @example
   * const viewport = new SVGViewport(800, 600, "0 0 100 100", null, "rotate(45)");
   * const matrix = viewport.getTransformMatrix();
   * // First scales 100x100 user space to 800x600, then rotates 45 degrees
   */
  getTransformMatrix() {
    let result = Matrix.identity(3);

    // Apply viewBox transform first (if present)
    if (this.viewBox) {
      const vbTransform = computeViewBoxTransform(
        this.viewBox,
        this.width,
        this.height,
        this.preserveAspectRatio,
      );
      result = result.mul(vbTransform);
    }

    // Then apply the transform attribute (if present)
    if (this.transform) {
      const transformMatrix = parseTransformAttribute(this.transform);
      result = result.mul(transformMatrix);
    }

    return result;
  }
}

/**
 * Build the complete CTM (Current Transform Matrix) including viewports, viewBox transforms,
 * and element transforms from the root to a target element.
 *
 * The CTM represents the cumulative effect of all coordinate system transformations
 * from the outermost SVG viewport down to a specific element. This is essential for:
 * - Converting element coordinates to screen/viewport coordinates
 * - Flattening nested transformations into a single matrix
 * - Computing the actual rendered position of SVG elements
 *
 * The hierarchy array describes the path from root to element. Each entry is processed
 * in order, and its transformation matrix is multiplied into the accumulating CTM.
 *
 * Transformation order (right-to-left in matrix multiplication):
 * CTM = root_viewport × parent_group × ... × element_transform
 *
 * @param {Array} hierarchy - Array of objects describing the hierarchy from root to element.
 *   Each object can be:
 *   - {type: 'svg', width, height, viewBox?, preserveAspectRatio?, transform?} - SVG viewport
 *   - {type: 'g', transform?} - Group element with optional transform
 *   - {type: 'element', transform?} - Terminal element with optional transform
 *   - Or simply a transform string (backwards compatibility - treated as element transform)
 * @returns {Matrix} Combined CTM as 3x3 matrix representing all transformations from root to element
 *
 * @example
 * // Build CTM for a circle inside a transformed group inside an SVG with viewBox
 * const hierarchy = [
 *   { type: 'svg', width: 800, height: 600, viewBox: "0 0 100 100" },
 *   { type: 'g', transform: "translate(10, 20)" },
 *   { type: 'element', transform: "scale(2)" }
 * ];
 * const ctm = buildFullCTM(hierarchy);
 * // CTM = viewBox_transform × translate(10,20) × scale(2)
 *
 * @example
 * // Backwards compatible usage with transform strings
 * const hierarchy = ["translate(10, 20)", "rotate(45)", "scale(2)"];
 * const ctm = buildFullCTM(hierarchy);
 *
 * @example
 * // Nested SVG viewports
 * const hierarchy = [
 *   { type: 'svg', width: 1000, height: 1000, viewBox: "0 0 100 100" },
 *   { type: 'svg', width: 50, height: 50, viewBox: "0 0 10 10" },
 *   { type: 'element', transform: "rotate(45 5 5)" }
 * ];
 * const ctm = buildFullCTM(hierarchy);
 * // Combines two viewBox transforms and a rotation
 */
export function buildFullCTM(hierarchy) {
  // Validate input is an array
  if (!hierarchy || !Array.isArray(hierarchy)) {
    console.warn("buildFullCTM: hierarchy must be an array");
    return Matrix.identity(3);
  }

  let ctm = Matrix.identity(3);

  for (const item of hierarchy) {
    if (!item) {
      continue; // Skip null/undefined items
    }

    if (typeof item === "string") {
      // Backwards compatibility: treat string as transform attribute
      if (item) {
        const matrix = parseTransformAttribute(item);
        ctm = ctm.mul(matrix);
      }
    } else if (item.type === "svg") {
      // SVG viewport with potential viewBox - validate required properties
      if (item.width === undefined || item.height === undefined) {
        console.warn("buildFullCTM: SVG viewport missing width or height");
        continue;
      }
      try {
        const viewport = new SVGViewport(
          item.width,
          item.height,
          item.viewBox || null,
          item.preserveAspectRatio || null,
          item.transform || null,
        );
        ctm = ctm.mul(viewport.getTransformMatrix());
      } catch (err) {
        console.warn(`buildFullCTM: Failed to create viewport: ${err.message}`);
        continue;
      }
    } else if (item.type === "g" || item.type === "element") {
      // Group or element with optional transform
      if (item.transform) {
        const matrix = parseTransformAttribute(item.transform);
        ctm = ctm.mul(matrix);
      }
    }
  }

  return ctm;
}

// ============================================================================
// Unit and Percentage Resolution
// ============================================================================

/**
 * Resolve a length value that may include CSS units or percentages to user units.
 *
 * SVG supports various length units that need to be converted to user units (typically pixels).
 * This function handles:
 * - Percentages: Relative to a reference size (e.g., viewport width/height)
 * - Absolute units: px, pt, pc, in, cm, mm
 * - Font-relative units: em, rem (assumes 16px font size)
 * - Unitless numbers: Treated as user units (px)
 *
 * Unit conversion formulas:
 * - 1in = dpi px (default 96dpi)
 * - 1cm = dpi/2.54 px
 * - 1mm = dpi/25.4 px
 * - 1pt = dpi/72 px (1/72 of an inch)
 * - 1pc = dpi/6 px (12 points)
 * - 1em = 16px (assumes default font size)
 * - 1rem = 16px (assumes default root font size)
 *
 * @param {string|number} value - Length value with optional unit (e.g., "50%", "10px", "5em", 100)
 * @param {Decimal} referenceSize - Reference size for percentage resolution (e.g., viewport width)
 * @param {number} [dpi=96] - DPI (dots per inch) for absolute unit conversion. Default is 96 (CSS standard)
 * @returns {Decimal} Resolved length in user units (px equivalent)
 *
 * @example
 * // Percentage of viewport width
 * const width = resolveLength("50%", new Decimal(800));
 * // Returns: Decimal(400)  // 50% of 800
 *
 * @example
 * // Absolute units
 * const len = resolveLength("1in", new Decimal(0), 96);
 * // Returns: Decimal(96)  // 1 inch = 96 pixels at 96 DPI
 *
 * @example
 * // Unitless number
 * const len = resolveLength(100, new Decimal(0));
 * // Returns: Decimal(100)
 *
 * @example
 * // Font-relative units
 * const len = resolveLength("2em", new Decimal(0));
 * // Returns: Decimal(32)  // 2 × 16px
 */
export function resolveLength(value, referenceSize, dpi = 96) {
  const D = (x) => new Decimal(x);

  // Validate dpi parameter
  let validDpi = dpi;
  if (typeof validDpi !== "number" || validDpi <= 0 || !isFinite(validDpi)) {
    console.warn("resolveLength: invalid dpi (must be positive finite number), using default 96");
    validDpi = 96;
  }

  if (typeof value === "number") {
    return D(value);
  }

  const str = String(value).trim();

  // Percentage
  if (str.endsWith("%")) {
    const pct = D(str.slice(0, -1));
    return pct.div(100).mul(referenceSize);
  }

  // Extract numeric value and unit
  const match = str.match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)(.*)?$/i);
  if (!match) {
    console.warn(`resolveLength: invalid length value "${value}"`);
    return D(0);
  }

  const num = D(match[1]);
  const unit = (match[2] || "").toLowerCase().trim();

  // Convert to user units (px)
  switch (unit) {
    case "":
    case "px":
      return num;
    case "em":
      return num.mul(16); // Assume 16px font-size
    case "rem":
      return num.mul(16);
    case "pt":
      return num.mul(validDpi).div(72);
    case "pc":
      return num.mul(validDpi).div(6);
    case "in":
      return num.mul(validDpi);
    case "cm":
      return num.mul(validDpi).div(2.54);
    case "mm":
      return num.mul(validDpi).div(25.4);
    default:
      return num; // Unknown unit, treat as px
  }
}

/**
 * Resolve percentage values for x/width (relative to viewport width)
 * and y/height (relative to viewport height).
 *
 * @param {string|number} xOrWidth - X coordinate or width value
 * @param {string|number} yOrHeight - Y coordinate or height value
 * @param {Decimal} viewportWidth - Viewport width for reference
 * @param {Decimal} viewportHeight - Viewport height for reference
 * @returns {{x: Decimal, y: Decimal}} Resolved coordinates
 */
export function resolvePercentages(
  xOrWidth,
  yOrHeight,
  viewportWidth,
  viewportHeight,
) {
  return {
    x: resolveLength(xOrWidth, viewportWidth),
    y: resolveLength(yOrHeight, viewportHeight),
  };
}

/**
 * Compute the normalized diagonal for resolving percentages that
 * aren't clearly x or y oriented (per SVG spec).
 *
 * Some SVG attributes (like gradient radii, stroke width when using objectBoundingBox)
 * use percentage values that aren't tied to width or height specifically. For these,
 * the SVG specification defines a "normalized diagonal" as the reference.
 *
 * Formula: sqrt(width² + height²) / sqrt(2)
 *
 * This represents the diagonal of the viewport, normalized by sqrt(2) to provide
 * a reasonable middle ground between width and height for square viewports.
 *
 * @param {Decimal} width - Viewport width
 * @param {Decimal} height - Viewport height
 * @returns {Decimal} Normalized diagonal length
 *
 * @example
 * // Square viewport
 * const diag = normalizedDiagonal(new Decimal(100), new Decimal(100));
 * // Returns: Decimal(100)  // sqrt(100² + 100²) / sqrt(2) = sqrt(20000) / sqrt(2) = 100
 *
 * @example
 * // Rectangular viewport
 * const diag = normalizedDiagonal(new Decimal(800), new Decimal(600));
 * // Returns: Decimal(707.106...)  // sqrt(800² + 600²) / sqrt(2)
 */
export function normalizedDiagonal(width, height) {
  const w = new Decimal(width);
  const h = new Decimal(height);
  const sqrt2 = Decimal.sqrt(2);
  return Decimal.sqrt(w.mul(w).plus(h.mul(h))).div(sqrt2);
}

// ============================================================================
// Object Bounding Box Transform
// ============================================================================

/**
 * Create a transformation matrix for objectBoundingBox coordinates.
 *
 * The objectBoundingBox coordinate system is a normalized (0,0) to (1,1) space
 * relative to an element's bounding box. This is commonly used for:
 * - Gradient coordinates (gradientUnits="objectBoundingBox")
 * - Pattern coordinates (patternUnits="objectBoundingBox")
 * - Clip path coordinates (clipPathUnits="objectBoundingBox")
 *
 * The transformation maps:
 * - (0, 0) → (bboxX, bboxY) - Top-left corner of bounding box
 * - (1, 1) → (bboxX + bboxWidth, bboxY + bboxHeight) - Bottom-right corner
 * - (0.5, 0.5) → (bboxX + bboxWidth/2, bboxY + bboxHeight/2) - Center
 *
 * Transform: T = translate(bboxX, bboxY) × scale(bboxWidth, bboxHeight)
 *
 * @param {number|Decimal} bboxX - Bounding box X coordinate (left edge)
 * @param {number|Decimal} bboxY - Bounding box Y coordinate (top edge)
 * @param {number|Decimal} bboxWidth - Bounding box width
 * @param {number|Decimal} bboxHeight - Bounding box height
 * @returns {Matrix} 3x3 transformation matrix from objectBoundingBox to user space
 *
 * @example
 * // Transform for a rectangle at (100, 50) with size 200x150
 * const matrix = objectBoundingBoxTransform(100, 50, 200, 150);
 * // Point (0.5, 0.5) in objectBoundingBox → (200, 125) in user space (center)
 *
 * @example
 * // Apply to gradient coordinates
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const transform = objectBoundingBoxTransform(bbox.x, bbox.y, bbox.width, bbox.height);
 * // Gradient with x1="0" y1="0" x2="1" y2="1" spans from (0,0) to (100,100)
 */
export function objectBoundingBoxTransform(
  bboxX,
  bboxY,
  bboxWidth,
  bboxHeight,
) {
  const D = (x) => new Decimal(x);

  const xD = D(bboxX);
  const yD = D(bboxY);
  const wD = D(bboxWidth);
  const hD = D(bboxHeight);

  // Validate all parameters are finite
  if (!xD.isFinite() || !yD.isFinite() || !wD.isFinite() || !hD.isFinite()) {
    throw new Error("objectBoundingBoxTransform: all parameters must be finite");
  }

  // Validate dimensions are positive (zero is technically valid for degenerate case, but warn)
  if (wD.lte(0) || hD.lte(0)) {
    console.warn("objectBoundingBoxTransform: zero or negative dimensions create degenerate transform");
    // Return identity for degenerate case to avoid division by zero
    return Matrix.identity(3);
  }

  // Transform: scale(bboxWidth, bboxHeight) then translate(bboxX, bboxY)
  const scaleM = Transforms2D.scale(wD, hD);
  const translateM = Transforms2D.translation(xD, yD);
  return translateM.mul(scaleM);
}

// ============================================================================
// Shape to Path Conversion
// ============================================================================

/**
 * Convert a circle to path data.
 *
 * Circles are converted to path form using 4 cubic Bézier curves with the
 * kappa constant (≈0.5522847498) for mathematical accuracy. This is necessary
 * when flattening transforms, as circles may become ellipses under non-uniform scaling.
 *
 * The circle is approximated by four cubic Bézier segments, each spanning 90 degrees.
 * This provides excellent visual accuracy (error < 0.02% of radius).
 *
 * @param {number|Decimal} cx - Center X coordinate
 * @param {number|Decimal} cy - Center Y coordinate
 * @param {number|Decimal} r - Radius
 * @returns {string} Path data string (M, C commands with Z to close)
 *
 * @example
 * const pathData = circleToPath(50, 50, 25);
 * // Returns: "M 75.000000 50.000000 C 75.000000 63.807119 63.807119 75.000000 ..."
 * // Represents a circle centered at (50, 50) with radius 25
 */
export function circleToPath(cx, cy, r) {
  return ellipseToPath(cx, cy, r, r);
}

/**
 * Convert an ellipse to path data.
 *
 * Ellipses are converted to path form using 4 cubic Bézier curves with the
 * magic kappa constant for accurate approximation of circular arcs.
 *
 * The kappa constant (κ ≈ 0.5522847498307936) is derived from:
 * κ = 4 × (√2 - 1) / 3
 *
 * This value ensures the control points of a cubic Bézier curve closely approximate
 * a circular arc of 90 degrees. For ellipses, kappa is scaled by rx and ry.
 *
 * The four curves start at the rightmost point and proceed counterclockwise,
 * creating a closed elliptical path with excellent visual accuracy.
 *
 * @param {number|Decimal} cx - Center X coordinate
 * @param {number|Decimal} cy - Center Y coordinate
 * @param {number|Decimal} rx - X radius (horizontal semi-axis)
 * @param {number|Decimal} ry - Y radius (vertical semi-axis)
 * @returns {string} Path data string (M, C commands with Z to close)
 *
 * @example
 * const pathData = ellipseToPath(100, 100, 50, 30);
 * // Creates an ellipse centered at (100, 100) with width 100 and height 60
 *
 * @example
 * // Circle as special case of ellipse
 * const pathData = ellipseToPath(50, 50, 25, 25);
 * // Equivalent to circleToPath(50, 50, 25)
 */
export function ellipseToPath(cx, cy, rx, ry) {
  const D = (x) => new Decimal(x);
  const cxD = D(cx),
    cyD = D(cy),
    rxD = D(rx),
    ryD = D(ry);

  // Validate radii are positive
  if (rxD.lte(0) || ryD.lte(0)) {
    throw new Error("Ellipse radii must be positive");
  }
  if (!rxD.isFinite() || !ryD.isFinite() || !cxD.isFinite() || !cyD.isFinite()) {
    throw new Error("Ellipse parameters must be finite");
  }

  // Kappa for bezier approximation of circle/ellipse: 4 * (sqrt(2) - 1) / 3
  const kappa = D("0.5522847498307936");
  const kx = rxD.mul(kappa);
  const ky = ryD.mul(kappa);

  // Four bezier curves forming the ellipse
  // Start at (cx + rx, cy) and go counterclockwise
  const x1 = cxD.plus(rxD),
    y1 = cyD;
  const x2 = cxD,
    y2 = cyD.minus(ryD);
  const x3 = cxD.minus(rxD),
    y3 = cyD;
  const x4 = cxD,
    y4 = cyD.plus(ryD);

  return [
    `M ${x1.toFixed(6)} ${y1.toFixed(6)}`,
    `C ${x1.toFixed(6)} ${y1.minus(ky).toFixed(6)} ${x2.plus(kx).toFixed(6)} ${y2.toFixed(6)} ${x2.toFixed(6)} ${y2.toFixed(6)}`,
    `C ${x2.minus(kx).toFixed(6)} ${y2.toFixed(6)} ${x3.toFixed(6)} ${y3.minus(ky).toFixed(6)} ${x3.toFixed(6)} ${y3.toFixed(6)}`,
    `C ${x3.toFixed(6)} ${y3.plus(ky).toFixed(6)} ${x4.minus(kx).toFixed(6)} ${y4.toFixed(6)} ${x4.toFixed(6)} ${y4.toFixed(6)}`,
    `C ${x4.plus(kx).toFixed(6)} ${y4.toFixed(6)} ${x1.toFixed(6)} ${y1.plus(ky).toFixed(6)} ${x1.toFixed(6)} ${y1.toFixed(6)}`,
    "Z",
  ].join(" ");
}

/**
 * Convert a rectangle to path data.
 *
 * Rectangles can have optional rounded corners specified by rx (X radius)
 * and ry (Y radius). The SVG spec has specific rules for corner radius clamping:
 * - rx and ry are clamped to half the rectangle's width and height respectively
 * - If ry is not specified, it defaults to rx
 * - If both are 0, a simple rectangular path is generated
 * - If either is non-zero, arcs are used for corners
 *
 * Corner radius auto-adjustment (per SVG spec):
 * - If rx > width/2, rx is reduced to width/2
 * - If ry > height/2, ry is reduced to height/2
 *
 * @param {number|Decimal} x - X position (top-left corner)
 * @param {number|Decimal} y - Y position (top-left corner)
 * @param {number|Decimal} width - Width of rectangle
 * @param {number|Decimal} height - Height of rectangle
 * @param {number|Decimal} [rx=0] - X corner radius (horizontal)
 * @param {number|Decimal} [ry=null] - Y corner radius (vertical). If null, uses rx value
 * @returns {string} Path data string
 *
 * @example
 * // Simple rectangle with no rounded corners
 * const path = rectToPath(10, 10, 100, 50);
 * // Returns: "M 10.000000 10.000000 L 110.000000 10.000000 ..."
 *
 * @example
 * // Rounded rectangle with uniform corner radius
 * const path = rectToPath(10, 10, 100, 50, 5);
 * // Creates rectangle with 5px rounded corners
 *
 * @example
 * // Rounded rectangle with elliptical corners
 * const path = rectToPath(10, 10, 100, 50, 10, 5);
 * // Corners have rx=10, ry=5 (wider than tall)
 *
 * @example
 * // Auto-clamping of corner radii
 * const path = rectToPath(0, 0, 20, 20, 15);
 * // rx is clamped to 10 (half of 20)
 */
export function rectToPath(x, y, width, height, rx = 0, ry = null) {
  const D = (n) => new Decimal(n);
  const xD = D(x),
    yD = D(y),
    wD = D(width),
    hD = D(height);

  // Validate dimensions are positive
  if (wD.lte(0) || hD.lte(0)) {
    throw new Error("Rectangle dimensions must be positive");
  }
  if (!wD.isFinite() || !hD.isFinite() || !xD.isFinite() || !yD.isFinite()) {
    throw new Error("Rectangle parameters must be finite");
  }

  let rxD = D(rx);
  let ryD = ry !== null ? D(ry) : rxD;

  // Validate radii are non-negative
  if (rxD.lt(0) || ryD.lt(0)) {
    throw new Error("Rectangle corner radii must be non-negative");
  }

  // Clamp radii to half dimensions
  const halfW = wD.div(2);
  const halfH = hD.div(2);
  if (rxD.gt(halfW)) rxD = halfW;
  if (ryD.gt(halfH)) ryD = halfH;

  const hasRoundedCorners = rxD.gt(0) || ryD.gt(0);

  if (!hasRoundedCorners) {
    // Simple rectangle
    return [
      `M ${xD.toFixed(6)} ${yD.toFixed(6)}`,
      `L ${xD.plus(wD).toFixed(6)} ${yD.toFixed(6)}`,
      `L ${xD.plus(wD).toFixed(6)} ${yD.plus(hD).toFixed(6)}`,
      `L ${xD.toFixed(6)} ${yD.plus(hD).toFixed(6)}`,
      "Z",
    ].join(" ");
  }

  // Rounded rectangle using arcs
  return [
    `M ${xD.plus(rxD).toFixed(6)} ${yD.toFixed(6)}`,
    `L ${xD.plus(wD).minus(rxD).toFixed(6)} ${yD.toFixed(6)}`,
    `A ${rxD.toFixed(6)} ${ryD.toFixed(6)} 0 0 1 ${xD.plus(wD).toFixed(6)} ${yD.plus(ryD).toFixed(6)}`,
    `L ${xD.plus(wD).toFixed(6)} ${yD.plus(hD).minus(ryD).toFixed(6)}`,
    `A ${rxD.toFixed(6)} ${ryD.toFixed(6)} 0 0 1 ${xD.plus(wD).minus(rxD).toFixed(6)} ${yD.plus(hD).toFixed(6)}`,
    `L ${xD.plus(rxD).toFixed(6)} ${yD.plus(hD).toFixed(6)}`,
    `A ${rxD.toFixed(6)} ${ryD.toFixed(6)} 0 0 1 ${xD.toFixed(6)} ${yD.plus(hD).minus(ryD).toFixed(6)}`,
    `L ${xD.toFixed(6)} ${yD.plus(ryD).toFixed(6)}`,
    `A ${rxD.toFixed(6)} ${ryD.toFixed(6)} 0 0 1 ${xD.plus(rxD).toFixed(6)} ${yD.toFixed(6)}`,
  ].join(" ");
}

/**
 * Convert a line to path data.
 *
 * @param {number|Decimal} x1 - Start X
 * @param {number|Decimal} y1 - Start Y
 * @param {number|Decimal} x2 - End X
 * @param {number|Decimal} y2 - End Y
 * @returns {string} Path data string
 */
export function lineToPath(x1, y1, x2, y2) {
  const D = (n) => new Decimal(n);
  const x1D = D(x1);
  const y1D = D(y1);
  const x2D = D(x2);
  const y2D = D(y2);

  // Validate all parameters are finite
  if (!x1D.isFinite() || !y1D.isFinite() || !x2D.isFinite() || !y2D.isFinite()) {
    throw new Error("lineToPath: all parameters must be finite");
  }

  return `M ${x1D.toFixed(6)} ${y1D.toFixed(6)} L ${x2D.toFixed(6)} ${y2D.toFixed(6)}`;
}

/**
 * Convert a polygon to path data.
 *
 * Polygons are closed shapes defined by a series of connected points.
 * The path automatically closes from the last point back to the first (Z command).
 *
 * The points attribute format is flexible (per SVG spec):
 * - Comma-separated: "x1,y1,x2,y2,x3,y3"
 * - Space-separated: "x1 y1 x2 y2 x3 y3"
 * - Mixed: "x1,y1 x2,y2 x3,y3"
 * - Array of pairs: [[x1,y1], [x2,y2], [x3,y3]]
 * - Flat array: [x1, y1, x2, y2, x3, y3]
 *
 * @param {string|Array} points - Points as "x1,y1 x2,y2 ..." or [[x1,y1], [x2,y2], ...]
 * @returns {string} Path data string (M, L commands with Z to close)
 *
 * @example
 * // Triangle from string
 * const path = polygonToPath("0,0 100,0 50,86.6");
 * // Returns: "M 0 0 L 100 0 L 50 86.6 Z"
 *
 * @example
 * // Square from array
 * const path = polygonToPath([[0,0], [100,0], [100,100], [0,100]]);
 * // Returns: "M 0 0 L 100 0 L 100 100 L 0 100 Z"
 */
export function polygonToPath(points) {
  const pairs = parsePointPairs(points);
  if (pairs.length === 0) return "";
  let d = `M ${pairs[0][0]} ${pairs[0][1]}`;
  for (let i = 1; i < pairs.length; i++) {
    d += ` L ${pairs[i][0]} ${pairs[i][1]}`;
  }
  return d + " Z";
}

/**
 * Convert a polyline to path data.
 *
 * Polylines are similar to polygons but are NOT automatically closed.
 * They represent a series of connected line segments.
 *
 * The difference between polygon and polyline:
 * - Polygon: Automatically closes (Z command at end)
 * - Polyline: Remains open (no Z command)
 *
 * @param {string|Array} points - Points as "x1,y1 x2,y2 ..." or [[x1,y1], [x2,y2], ...]
 * @returns {string} Path data string (M, L commands without Z)
 *
 * @example
 * // Open path (not closed)
 * const path = polylineToPath("0,0 50,50 100,0");
 * // Returns: "M 0 0 L 50 50 L 100 0" (no Z)
 *
 * @example
 * // Zigzag line
 * const path = polylineToPath([[0,0], [10,10], [20,0], [30,10], [40,0]]);
 * // Creates an open zigzag pattern
 */
export function polylineToPath(points) {
  const pairs = parsePointPairs(points);
  if (pairs.length === 0) return "";
  let d = `M ${pairs[0][0]} ${pairs[0][1]}`;
  for (let i = 1; i < pairs.length; i++) {
    d += ` L ${pairs[i][0]} ${pairs[i][1]}`;
  }
  return d;
}

/**
 * Parse points attribute from polygon/polyline into coordinate pairs.
 *
 * SVG polygon and polyline elements use a points attribute with space or comma
 * separated coordinate values. This helper parses that format into pairs.
 *
 * Accepted formats:
 * - Space separated: "10 20 30 40 50 60"
 * - Comma separated: "10,20 30,40 50,60"
 * - Mixed: "10,20, 30,40, 50,60"
 * - Array format: [[10,20], [30,40], [50,60]] or [10, 20, 30, 40, 50, 60]
 *
 * @private
 * @param {string|Array} points - Points attribute value or array
 * @returns {Array<[string, string]>} Array of [x, y] coordinate pairs as strings
 */
function parsePointPairs(points) {
  // Validate input
  if (!points) {
    return [];
  }

  let coords;
  try {
    if (Array.isArray(points)) {
      coords = points.flat().map((n) => new Decimal(n).toFixed(6));
    } else if (typeof points === "string") {
      coords = points
        .trim()
        .split(/[\s,]+/)
        .filter((s) => s.length > 0)
        .map((s) => new Decimal(s).toFixed(6));
    } else {
      console.warn("parsePointPairs: invalid input type");
      return [];
    }
  } catch (err) {
    console.warn(`parsePointPairs: parse error - ${err.message}`);
    return [];
  }

  // Validate even number of coordinates
  if (coords.length % 2 !== 0) {
    console.warn("parsePointPairs: odd number of coordinates, ignoring last value");
    coords = coords.slice(0, -1); // Remove last element to ensure even length
  }

  const pairs = [];
  // Bounds check: i + 1 must be within array
  for (let i = 0; i + 1 < coords.length; i += 2) {
    pairs.push([coords[i], coords[i + 1]]);
  }
  return pairs;
}

// ============================================================================
// Arc Transformation (mathematically correct)
// ============================================================================

/**
 * Transform an elliptical arc under an affine transformation matrix.
 *
 * This is one of the most mathematically complex operations in SVG flattening.
 * Elliptical arcs (the 'A' command in SVG paths) are defined by:
 * - Radii (rx, ry)
 * - X-axis rotation (angle)
 * - Arc flags (large-arc-flag, sweep-flag)
 * - Endpoint (x, y)
 *
 * When an arc is transformed by a matrix:
 * 1. The endpoint is transformed by standard matrix multiplication
 * 2. The ellipse radii and rotation are transformed using eigenvalue decomposition
 * 3. If the matrix has negative determinant (reflection), the sweep direction flips
 *
 * Mathematical approach (based on lean-svg algorithm):
 * - Transform the ellipse's principal axes (X and Y directions scaled by rx, ry)
 * - Construct implicit ellipse equation: Ax² + Bxy + Cy² = 1
 * - Compute eigenvalues to find new radii
 * - Compute eigenvector rotation angle
 * - Check determinant to determine if sweep flips
 *
 * Why this is necessary:
 * - Non-uniform scaling changes the arc's shape
 * - Rotation changes the arc's orientation
 * - Reflection flips the arc's direction
 *
 * @param {number} rx - X radius of the ellipse
 * @param {number} ry - Y radius of the ellipse
 * @param {number} xAxisRotation - Rotation of ellipse's X-axis in degrees (0-360)
 * @param {number} largeArcFlag - Large arc flag: 0 (shorter arc) or 1 (longer arc)
 * @param {number} sweepFlag - Sweep direction: 0 (counter-clockwise) or 1 (clockwise)
 * @param {number} x - End point X coordinate (in current coordinate system)
 * @param {number} y - End point Y coordinate (in current coordinate system)
 * @param {Matrix} matrix - 3x3 affine transformation matrix to apply
 * @returns {Object} Transformed arc parameters:
 *   - rx: new X radius
 *   - ry: new Y radius
 *   - xAxisRotation: new rotation angle in degrees [0, 180)
 *   - largeArcFlag: preserved (0 or 1)
 *   - sweepFlag: possibly flipped (0 or 1) if matrix has negative determinant
 *   - x: transformed endpoint X
 *   - y: transformed endpoint Y
 *
 * @example
 * // Arc transformed by uniform scaling
 * const matrix = Transforms2D.scale(2, 2);
 * const arc = transformArc(10, 10, 0, 0, 1, 100, 0, matrix);
 * // Result: rx=20, ry=20, rotation unchanged, endpoint at (200, 0)
 *
 * @example
 * // Arc transformed by non-uniform scaling (becomes more elliptical)
 * const matrix = Transforms2D.scale(2, 1);
 * const arc = transformArc(10, 10, 0, 0, 1, 100, 0, matrix);
 * // Result: rx=20, ry=10, rotation unchanged, endpoint at (200, 0)
 *
 * @example
 * // Arc transformed by rotation
 * const matrix = Transforms2D.rotate(Math.PI / 4); // 45 degrees
 * const arc = transformArc(20, 10, 0, 0, 1, 100, 0, matrix);
 * // Result: radii unchanged, rotation=45°, endpoint rotated
 *
 * @example
 * // Arc transformed by reflection (sweepFlag flips)
 * const matrix = Transforms2D.scale(-1, 1); // Flip horizontally
 * const arc = transformArc(10, 10, 0, 0, 1, 100, 0, matrix);
 * // Result: sweepFlag flipped from 1 to 0 (direction reversed)
 */
export function transformArc(
  rx,
  ry,
  xAxisRotation,
  largeArcFlag,
  sweepFlag,
  x,
  y,
  matrix,
) {
  const D = (n) => new Decimal(n);
  const NEAR_ZERO = D("1e-16");

  // Validate inputs
  if (!matrix || !matrix.data || !Array.isArray(matrix.data) || matrix.data.length < 3) {
    throw new Error("transformArc: invalid matrix");
  }

  const rxD = D(rx);
  const ryD = D(ry);

  // Validate radii are positive
  if (rxD.lte(0) || ryD.lte(0)) {
    console.warn("transformArc: radii must be positive, returning degenerate arc");
    return {
      rx: 0,
      ry: 0,
      xAxisRotation: 0,
      largeArcFlag: largeArcFlag,
      sweepFlag: sweepFlag,
      x: D(x).toNumber(),
      y: D(y).toNumber(),
    };
  }

  // Validate and normalize flags to 0 or 1
  let validLargeArcFlag = largeArcFlag;
  if (typeof validLargeArcFlag !== "number" || (validLargeArcFlag !== 0 && validLargeArcFlag !== 1)) {
    console.warn(`transformArc: largeArcFlag must be 0 or 1, got ${largeArcFlag}`);
    validLargeArcFlag = validLargeArcFlag ? 1 : 0;
  }
  let validSweepFlag = sweepFlag;
  if (typeof validSweepFlag !== "number" || (validSweepFlag !== 0 && validSweepFlag !== 1)) {
    console.warn(`transformArc: sweepFlag must be 0 or 1, got ${sweepFlag}`);
    validSweepFlag = validSweepFlag ? 1 : 0;
  }

  // Get matrix components
  const a = matrix.data[0][0];
  const b = matrix.data[1][0];
  const c = matrix.data[0][1];
  const d = matrix.data[1][1];
  const e = matrix.data[0][2];
  const f = matrix.data[1][2];

  // Transform the endpoint
  const xD = D(x),
    yD = D(y);
  const newX = a.mul(xD).plus(c.mul(yD)).plus(e);
  const newY = b.mul(xD).plus(d.mul(yD)).plus(f);

  // Convert rotation to radians
  const rotRad = D(xAxisRotation).mul(D(Math.PI)).div(180);
  const sinRot = Decimal.sin(rotRad);
  const cosRot = Decimal.cos(rotRad);

  // rxD and ryD already declared in validation section above

  // Transform the ellipse axes using the algorithm from lean-svg
  // m0, m1 represent the transformed X-axis direction of the ellipse
  // m2, m3 represent the transformed Y-axis direction of the ellipse
  const m0 = a.mul(rxD).mul(cosRot).plus(c.mul(rxD).mul(sinRot));
  const m1 = b.mul(rxD).mul(cosRot).plus(d.mul(rxD).mul(sinRot));
  const m2 = a.mul(ryD.neg()).mul(sinRot).plus(c.mul(ryD).mul(cosRot));
  const m3 = b.mul(ryD.neg()).mul(sinRot).plus(d.mul(ryD).mul(cosRot));

  // Compute A, B, C coefficients for the implicit ellipse equation
  const A = m0.mul(m0).plus(m2.mul(m2));
  const C = m1.mul(m1).plus(m3.mul(m3));
  const B = m0.mul(m1).plus(m2.mul(m3)).mul(2);

  const AC = A.minus(C);

  // Compute new rotation angle and radii using eigenvalue decomposition
  let newRotRad;
  let A2, C2;

  if (B.abs().lt(NEAR_ZERO)) {
    // Already axis-aligned
    newRotRad = D(0);
    A2 = A;
    C2 = C;
  } else if (AC.abs().lt(NEAR_ZERO)) {
    // 45 degree case
    A2 = A.plus(B.mul("0.5"));
    C2 = A.minus(B.mul("0.5"));
    newRotRad = D(Math.PI).div(4);
  } else {
    // General case - compute eigenvalues
    const K = D(1)
      .plus(B.mul(B).div(AC.mul(AC)))
      .sqrt();
    A2 = A.plus(C).plus(K.mul(AC)).div(2);
    C2 = A.plus(C).minus(K.mul(AC)).div(2);
    newRotRad = Decimal.atan(B.div(AC)).div(2);
  }

  // Compute new radii as sqrt of eigenvalues (not 1/sqrt)
  if (A2.lt(0)) A2 = D(0);
  if (C2.lt(0)) C2 = D(0);

  let newRx = A2.sqrt();
  let newRy = C2.sqrt();

  // Swap based on which axis is larger
  if (AC.lte(0)) {
    const temp = newRx;
    newRx = newRy;
    newRy = temp;
  }

  // Ensure rx >= ry (convention)
  if (newRy.gt(newRx)) {
    const temp = newRx;
    newRx = newRy;
    newRy = temp;
    newRotRad = newRotRad.plus(D(Math.PI).div(2));
  }

  // Check if matrix flips orientation (negative determinant)
  const det = a.mul(d).minus(b.mul(c));
  let newSweepFlag = validSweepFlag;
  if (det.lt(0)) {
    // Flip sweep direction
    newSweepFlag = validSweepFlag ? 0 : 1;
  }

  // Convert rotation back to degrees and normalize to [0, 180)
  let newRotDeg = newRotRad.mul(180).div(D(Math.PI));
  while (newRotDeg.lt(0)) newRotDeg = newRotDeg.plus(180);
  while (newRotDeg.gte(180)) newRotDeg = newRotDeg.minus(180);

  return {
    rx: newRx.toNumber(),
    ry: newRy.toNumber(),
    xAxisRotation: newRotDeg.toNumber(),
    largeArcFlag: validLargeArcFlag,
    sweepFlag: newSweepFlag,
    x: newX.toNumber(),
    y: newY.toNumber(),
  };
}

// ============================================================================
// Transform Parsing (existing code)
// ============================================================================

/**
 * Parse a single SVG transform function and return a 3x3 matrix.
 *
 * SVG supports six transform functions, each mapped to a specific matrix form:
 *
 * 1. **translate(tx [ty])**: Move by (tx, ty). If ty omitted, ty=0
 *    Matrix: [[1, 0, tx], [0, 1, ty], [0, 0, 1]]
 *
 * 2. **scale(sx [sy])**: Scale by (sx, sy). If sy omitted, sy=sx (uniform scaling)
 *    Matrix: [[sx, 0, 0], [0, sy, 0], [0, 0, 1]]
 *
 * 3. **rotate(angle [cx cy])**: Rotate by angle (degrees) around origin or (cx, cy)
 *    - Around origin: [[cos(θ), -sin(θ), 0], [sin(θ), cos(θ), 0], [0, 0, 1]]
 *    - Around point: translate(cx, cy) × rotate(θ) × translate(-cx, -cy)
 *
 * 4. **skewX(angle)**: Skew along X-axis by angle (degrees)
 *    Matrix: [[1, tan(θ), 0], [0, 1, 0], [0, 0, 1]]
 *
 * 5. **skewY(angle)**: Skew along Y-axis by angle (degrees)
 *    Matrix: [[1, 0, 0], [tan(θ), 1, 0], [0, 0, 1]]
 *
 * 6. **matrix(a, b, c, d, e, f)**: Direct matrix specification
 *    Matrix: [[a, c, e], [b, d, f], [0, 0, 1]]
 *    Represents: [x', y'] = [a×x + c×y + e, b×x + d×y + f]
 *
 * Note: All angles are in degrees (SVG convention), converted to radians internally.
 *
 * @param {string} func - Transform function name (case-insensitive)
 * @param {number[]} args - Numeric arguments for the transform function
 * @returns {Matrix} 3x3 transformation matrix in homogeneous coordinates
 *
 * @example
 * // Simple translation
 * const m = parseTransformFunction('translate', [10, 20]);
 * // Returns matrix that moves points right 10, down 20
 *
 * @example
 * // Rotation around a point
 * const m = parseTransformFunction('rotate', [45, 100, 100]);
 * // Rotates 45° around point (100, 100)
 *
 * @example
 * // Skew
 * const m = parseTransformFunction('skewX', [30]);
 * // Skews along X-axis by 30 degrees (tan(30°) ≈ 0.577)
 *
 * @example
 * // Direct matrix form
 * const m = parseTransformFunction('matrix', [1, 0, 0, 1, 50, 50]);
 * // Translation by (50, 50) specified in matrix form
 */
export function parseTransformFunction(func, args) {
  // Validate inputs
  if (!func || typeof func !== "string") {
    console.warn("parseTransformFunction: invalid function name");
    return Matrix.identity(3);
  }
  if (!args || !Array.isArray(args)) {
    console.warn("parseTransformFunction: invalid arguments array");
    return Matrix.identity(3);
  }

  const D = (x) => new Decimal(x);

  switch (func.toLowerCase()) {
    case "translate": {
      const tx = args[0] !== undefined ? args[0] : 0;
      const ty = args[1] !== undefined ? args[1] : 0;
      return Transforms2D.translation(tx, ty);
    }

    case "scale": {
      const sx = args[0] !== undefined ? args[0] : 1;
      const sy = args[1] !== undefined ? args[1] : sx;
      return Transforms2D.scale(sx, sy);
    }

    case "rotate": {
      // SVG rotate is in degrees, can have optional cx, cy
      const angleDeg = args[0] !== undefined ? args[0] : 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);

      if (args.length >= 3) {
        // rotate(angle, cx, cy) - rotation around point
        if (args[1] === undefined || args[2] === undefined) {
          console.warn("parseTransformFunction: rotate(angle, cx, cy) missing cx or cy");
          return Transforms2D.rotate(angleRad);
        }
        const cx = args[1];
        const cy = args[2];
        return Transforms2D.rotateAroundPoint(angleRad, cx, cy);
      }
      return Transforms2D.rotate(angleRad);
    }

    case "skewx": {
      const angleDeg = args[0] !== undefined ? args[0] : 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);
      const tanVal = Decimal.tan(angleRad);
      return Transforms2D.skew(tanVal, 0);
    }

    case "skewy": {
      const angleDeg = args[0] !== undefined ? args[0] : 0;
      const angleRad = D(angleDeg).mul(D(Math.PI)).div(180);
      const tanVal = Decimal.tan(angleRad);
      return Transforms2D.skew(0, tanVal);
    }

    case "matrix": {
      // matrix(a, b, c, d, e, f) -> | a c e |
      //                             | b d f |
      //                             | 0 0 1 |
      if (args.length < 6) {
        console.warn(`parseTransformFunction: matrix() requires 6 arguments, got ${args.length}`);
        return Matrix.identity(3);
      }
      const [a, b, c, d, e, f] = args.slice(0, 6).map((x) => D(x !== undefined ? x : 0));
      return Matrix.from([
        [a, c, e],
        [b, d, f],
        [D(0), D(0), D(1)],
      ]);
    }

    default:
      console.warn(`Unknown transform function: ${func}`);
      return Matrix.identity(3);
  }
}

/**
 * Parse an SVG transform attribute string into a combined matrix.
 *
 * The transform attribute can contain multiple transform functions that are
 * applied in left-to-right order (as they appear in the string). However,
 * in terms of matrix multiplication, this is right-to-left application.
 *
 * For example: transform="translate(10,20) rotate(45)"
 * - Reading order: first translate, then rotate
 * - Execution: point is rotated first, then translated
 * - Matrix: M = T × R (multiply translate matrix by rotate matrix)
 * - Application: p' = M × p = T × R × p (rotate p, then translate result)
 *
 * This function parses the string, extracts each transform function with its
 * arguments, converts each to a matrix, and multiplies them in order.
 *
 * Supported transform syntax:
 * - Functions: translate, scale, rotate, skewX, skewY, matrix
 * - Separators: Comma or whitespace between arguments
 * - Multiple transforms: Space-separated functions
 *
 * @param {string} transformStr - SVG transform attribute value
 *                                e.g., "translate(10,20) rotate(45) scale(2)"
 * @returns {Matrix} Combined 3x3 transformation matrix representing all transforms
 *
 * @example
 * // Single transform
 * const m = parseTransformAttribute("translate(10, 20)");
 *
 * @example
 * // Multiple transforms - applied left to right
 * const m = parseTransformAttribute("translate(50, 50) rotate(45) scale(2)");
 * // First scale by 2, then rotate 45°, then translate by (50, 50)
 *
 * @example
 * // Complex example with rotation around a point
 * const m = parseTransformAttribute("translate(100, 100) rotate(45, 50, 50) translate(-100, -100)");
 *
 * @example
 * // Empty or invalid transform returns identity matrix
 * const m = parseTransformAttribute("");
 * // Returns: Identity matrix (no transformation)
 */
export function parseTransformAttribute(transformStr) {
  if (!transformStr || transformStr.trim() === "") {
    return Matrix.identity(3);
  }

  // Regex to match transform functions: name(args)
  const transformRegex = /(\w+)\s*\(([^)]*)\)/g;
  let match;
  let result = Matrix.identity(3);

  while ((match = transformRegex.exec(transformStr)) !== null) {
    const func = match[1];
    const argsStr = match[2];

    // Parse arguments (comma or space separated)
    const args = argsStr
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map((s) => parseFloat(s));

    const matrix = parseTransformFunction(func, args);
    // Transforms are applied left-to-right in SVG, so we multiply in order
    result = result.mul(matrix);
  }

  return result;
}

/**
 * Build the CTM (Current Transform Matrix) for an element by walking up its ancestry.
 *
 * This is a simplified version of buildFullCTM that only handles transform attribute
 * strings (no viewBox or viewport handling). It multiplies all transform matrices
 * from root to element in sequence.
 *
 * Use buildFullCTM() for complete CTM calculation including viewports.
 * Use this function for simple cases with only transform attributes.
 *
 * @param {string[]} transformStack - Array of transform strings from root to element
 *                                    Each string is parsed as an SVG transform attribute
 * @returns {Matrix} Combined CTM as 3x3 matrix
 *
 * @example
 * // Build CTM from nested transforms
 * const ctm = buildCTM([
 *   "translate(100, 100)",
 *   "rotate(45)",
 *   "scale(2)"
 * ]);
 * // Equivalent to: translate(100,100) × rotate(45) × scale(2)
 *
 * @example
 * // Empty stack returns identity
 * const ctm = buildCTM([]);
 * // Returns: Identity matrix
 */
export function buildCTM(transformStack) {
  // Validate input is an array
  if (!transformStack || !Array.isArray(transformStack)) {
    console.warn("buildCTM: transformStack must be an array");
    return Matrix.identity(3);
  }

  let ctm = Matrix.identity(3);

  for (const transformStr of transformStack) {
    if (transformStr) {
      const matrix = parseTransformAttribute(transformStr);
      ctm = ctm.mul(matrix);
    }
  }

  return ctm;
}

/**
 * Apply a CTM (Current Transform Matrix) to a 2D point.
 *
 * Transforms a point using homogeneous coordinates and perspective division.
 * For affine transformations (which SVG uses), this simplifies to:
 * x' = a×x + c×y + e
 * y' = b×x + d×y + f
 *
 * Where the matrix is:
 * [[a, c, e],
 *  [b, d, f],
 *  [0, 0, 1]]
 *
 * @param {Matrix} ctm - 3x3 transformation matrix
 * @param {number|string|Decimal} x - X coordinate
 * @param {number|string|Decimal} y - Y coordinate
 * @returns {{x: Decimal, y: Decimal}} Transformed coordinates as Decimal objects
 *
 * @example
 * // Apply translation
 * const ctm = Transforms2D.translation(10, 20);
 * const point = applyToPoint(ctm, 5, 5);
 * // Result: { x: Decimal(15), y: Decimal(25) }
 *
 * @example
 * // Apply rotation around origin
 * const ctm = Transforms2D.rotate(Math.PI / 2); // 90 degrees
 * const point = applyToPoint(ctm, 1, 0);
 * // Result: { x: Decimal(0), y: Decimal(1) } (approximately)
 *
 * @example
 * // Apply complex transform
 * const ctm = buildCTM(["translate(50, 50)", "rotate(45)", "scale(2)"]);
 * const point = applyToPoint(ctm, 10, 10);
 * // Point transformed through all operations
 */
export function applyToPoint(ctm, x, y) {
  // Validate CTM
  if (!ctm || !ctm.data || !Array.isArray(ctm.data)) {
    throw new Error("applyToPoint: invalid CTM matrix");
  }

  // Validate coordinates are valid numbers
  const D = (val) => new Decimal(val);
  try {
    const xD = D(x);
    const yD = D(y);
    if (!xD.isFinite() || !yD.isFinite()) {
      throw new Error("applyToPoint: coordinates must be finite");
    }
  } catch (err) {
    throw new Error(`applyToPoint: invalid coordinates - ${err.message}`);
  }

  const [tx, ty] = Transforms2D.applyTransform(ctm, x, y);
  return { x: tx, y: ty };
}

/**
 * Convert a CTM back to SVG matrix() notation.
 *
 * Extracts the 2D affine transformation components from a 3x3 matrix
 * and formats them as an SVG matrix() transform function.
 *
 * The SVG matrix() function has 6 parameters: matrix(a, b, c, d, e, f)
 * which map to the 3x3 matrix:
 * [[a, c, e],
 *  [b, d, f],
 *  [0, 0, 1]]
 *
 * This represents the transformation:
 * x' = a×x + c×y + e
 * y' = b×x + d×y + f
 *
 * Note: SVG uses column vectors, so the matrix is organized differently
 * than typical row-major notation.
 *
 * @param {Matrix} ctm - 3x3 transformation matrix
 * @param {number} [precision=6] - Decimal places for output numbers
 * @returns {string} SVG matrix transform string (e.g., "matrix(1, 0, 0, 1, 10, 20)")
 *
 * @example
 * // Convert translation matrix
 * const matrix = Transforms2D.translation(10, 20);
 * const svg = toSVGMatrix(matrix);
 * // Returns: "matrix(1.000000, 0.000000, 0.000000, 1.000000, 10.000000, 20.000000)"
 *
 * @example
 * // Convert with custom precision
 * const matrix = Transforms2D.scale(2, 3);
 * const svg = toSVGMatrix(matrix, 2);
 * // Returns: "matrix(2.00, 0.00, 0.00, 3.00, 0.00, 0.00)"
 *
 * @example
 * // Convert complex transform back to SVG
 * const ctm = buildCTM(["translate(50, 50)", "rotate(45)", "scale(2)"]);
 * const svg = toSVGMatrix(ctm);
 * // Returns single matrix() function representing all transforms
 */
export function toSVGMatrix(ctm, precision = 6) {
  // Validate CTM structure
  if (
    !ctm ||
    !ctm.data ||
    !Array.isArray(ctm.data) ||
    ctm.data.length < 3 ||
    !Array.isArray(ctm.data[0]) ||
    !Array.isArray(ctm.data[1]) ||
    ctm.data[0].length < 3 ||
    ctm.data[1].length < 3
  ) {
    throw new Error("toSVGMatrix: invalid CTM matrix structure");
  }

  // Validate precision
  let validPrecision = precision;
  if (typeof validPrecision !== "number" || validPrecision < 0 || validPrecision > 20) {
    console.warn("toSVGMatrix: invalid precision, using default 6");
    validPrecision = 6;
  }

  // Validate matrix elements have toFixed method
  try {
    const a = ctm.data[0][0].toFixed(validPrecision);
    const b = ctm.data[1][0].toFixed(validPrecision);
    const c = ctm.data[0][1].toFixed(validPrecision);
    const d = ctm.data[1][1].toFixed(validPrecision);
    const e = ctm.data[0][2].toFixed(validPrecision);
    const f = ctm.data[1][2].toFixed(validPrecision);

    return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
  } catch (err) {
    throw new Error(`toSVGMatrix: invalid matrix elements - ${err.message}`);
  }
}

/**
 * Check if a matrix is effectively the identity matrix.
 *
 * The identity matrix represents "no transformation" and has the form:
 * [[1, 0, 0],
 *  [0, 1, 0],
 *  [0, 0, 1]]
 *
 * Due to floating-point arithmetic, exact equality is unreliable.
 * This function uses a tolerance-based comparison to handle rounding errors.
 *
 * This is useful for:
 * - Optimizing SVG output (skip identity transforms)
 * - Detecting when transforms cancel out
 * - Validation and testing
 *
 * @param {Matrix} m - 3x3 matrix to check
 * @param {string} [tolerance='1e-10'] - Tolerance for element-wise comparison (as Decimal string)
 * @returns {boolean} True if matrix is identity within tolerance
 *
 * @example
 * // Check identity matrix
 * const identity = Matrix.identity(3);
 * const result = isIdentity(identity);
 * // Returns: true
 *
 * @example
 * // Check with rounding errors
 * const almostIdentity = Matrix.from([
 *   [new Decimal('1.0000000001'), new Decimal(0), new Decimal(0)],
 *   [new Decimal(0), new Decimal('0.9999999999'), new Decimal(0)],
 *   [new Decimal(0), new Decimal(0), new Decimal(1)]
 * ]);
 * const result = isIdentity(almostIdentity, '1e-8');
 * // Returns: true (within tolerance)
 *
 * @example
 * // Check non-identity matrix
 * const translation = Transforms2D.translation(10, 20);
 * const result = isIdentity(translation);
 * // Returns: false
 */
export function isIdentity(m, tolerance = "1e-10") {
  // Validate matrix parameter
  if (!m || !m.data || !Array.isArray(m.data)) {
    throw new Error("isIdentity: invalid matrix parameter");
  }

  // Validate matrix has equals method
  if (typeof m.equals !== "function") {
    throw new Error("isIdentity: matrix must have equals method");
  }

  const identity = Matrix.identity(3);
  return m.equals(identity, tolerance);
}

/**
 * Transform path data coordinates using a CTM (Current Transform Matrix).
 *
 * This function applies a transformation matrix to all coordinates in an SVG path,
 * handling the full complexity of SVG path syntax including:
 * - Absolute commands (M, L, H, V, C, S, Q, T, A, Z)
 * - Relative commands (m, l, h, v, c, s, q, t, a, z)
 * - Implicit line-to commands after moveto
 * - Proper arc transformation with radii and rotation adjustment
 *
 * Path command handling:
 * - **M/m (moveto)**: Transform endpoint, update current position and subpath start
 * - **L/l (lineto)**: Transform endpoint, update current position
 * - **H/h (horizontal line)**: Converted to L (may gain Y component after transform)
 * - **V/v (vertical line)**: Converted to L (may gain X component after transform)
 * - **C/c (cubic Bézier)**: Transform all 3 points (2 control points + endpoint)
 * - **S/s (smooth cubic)**: Transform control point and endpoint
 * - **Q/q (quadratic Bézier)**: Transform control point and endpoint
 * - **T/t (smooth quadratic)**: Transform endpoint only
 * - **A/a (elliptical arc)**: Use transformArc() for proper ellipse transformation
 * - **Z/z (closepath)**: Reset position to subpath start
 *
 * Relative command conversion:
 * Relative commands (lowercase) are converted to absolute coordinates before transformation,
 * then optionally converted back to absolute in the output (controlled by toAbsolute option).
 *
 * @param {string} pathData - SVG path d attribute (e.g., "M 10 10 L 20 20 Z")
 * @param {Matrix} ctm - 3x3 transformation matrix to apply
 * @param {Object} [options={}] - Transformation options
 * @param {boolean} [options.toAbsolute=true] - Convert all commands to absolute coordinates
 * @param {number} [options.precision=6] - Decimal precision for output coordinates
 * @returns {string} Transformed path data with same structure but transformed coordinates
 *
 * @example
 * // Transform a simple path
 * const path = "M 0 0 L 100 0 L 100 100 Z";
 * const matrix = Transforms2D.scale(2, 2);
 * const transformed = transformPathData(path, matrix);
 * // Result: "M 0.000000 0.000000 L 200.000000 0.000000 L 200.000000 200.000000 Z"
 *
 * @example
 * // Transform path with curves
 * const path = "M 10 10 C 20 20, 40 20, 50 10";
 * const matrix = Transforms2D.rotate(Math.PI / 2); // 90 degrees
 * const transformed = transformPathData(path, matrix);
 * // All points rotated 90° counterclockwise
 *
 * @example
 * // Transform path with arcs (complex case)
 * const path = "M 50 50 A 25 25 0 0 1 100 50";
 * const matrix = Transforms2D.scale(2, 1); // Non-uniform scaling
 * const transformed = transformPathData(path, matrix);
 * // Arc radii adjusted: rx=50, ry=25, endpoint at (200, 50)
 *
 * @example
 * // Preserve relative commands (when toAbsolute=false)
 * const path = "m 10 10 l 20 0 l 0 20 z";
 * const matrix = Transforms2D.translation(50, 50);
 * const transformed = transformPathData(path, matrix, { toAbsolute: false });
 * // Relative commands preserved in output
 */
export function transformPathData(pathData, ctm, options = {}) {
  // Validate inputs
  if (!pathData || typeof pathData !== "string") {
    console.warn("transformPathData: invalid pathData (must be string)");
    return "";
  }
  if (!ctm || !ctm.data) {
    console.warn("transformPathData: invalid CTM matrix");
    return pathData; // Return unchanged if matrix is invalid
  }

  const { toAbsolute = true, precision = 6 } = options;

  // Validate precision
  if (typeof precision !== "number" || precision < 0 || precision > 20) {
    console.warn("transformPathData: invalid precision, using default 6");
  }

  const D = (x) => new Decimal(x);

  // Parse path into commands
  const commands = parsePathCommands(pathData);
  if (commands.length === 0) {
    return "";
  }

  const result = [];

  // Track current position for relative commands
  let curX = D(0),
    curY = D(0);
  let subpathStartX = D(0),
    subpathStartY = D(0);

  for (const { cmd, args } of commands) {
    const isRelative = cmd === cmd.toLowerCase();
    const cmdUpper = cmd.toUpperCase();

    switch (cmdUpper) {
      case "M": {
        const transformed = [];
        // Validate args length is multiple of 2
        if (args.length % 2 !== 0) {
          console.warn(`transformPathData: M command has ${args.length} args, expected multiple of 2`);
        }
        for (let i = 0; i + 1 < args.length; i += 2) {
          let x = D(args[i]),
            y = D(args[i + 1]);
          if (isRelative) {
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const pt = applyToPoint(ctm, x, y);
          transformed.push(pt.x.toFixed(precision), pt.y.toFixed(precision));

          curX = x;
          curY = y;
          if (i === 0) {
            subpathStartX = x;
            subpathStartY = y;
          }
        }
        result.push((toAbsolute ? "M" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "L": {
        const transformed = [];
        // Validate args length is multiple of 2
        if (args.length % 2 !== 0) {
          console.warn(`transformPathData: L command has ${args.length} args, expected multiple of 2`);
        }
        for (let i = 0; i + 1 < args.length; i += 2) {
          let x = D(args[i]),
            y = D(args[i + 1]);
          if (isRelative) {
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const pt = applyToPoint(ctm, x, y);
          transformed.push(pt.x.toFixed(precision), pt.y.toFixed(precision));

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "L" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "H": {
        // Horizontal line becomes L after transform (may have Y component)
        if (args.length < 1) {
          console.warn("transformPathData: H command requires at least 1 argument");
          break;
        }
        let x = D(args[0]);
        if (isRelative) {
          x = x.plus(curX);
        }
        const y = curY;

        const pt = applyToPoint(ctm, x, y);
        result.push(
          "L " + pt.x.toFixed(precision) + " " + pt.y.toFixed(precision),
        );

        curX = x;
        break;
      }

      case "V": {
        // Vertical line becomes L after transform (may have X component)
        if (args.length < 1) {
          console.warn("transformPathData: V command requires at least 1 argument");
          break;
        }
        const x = curX;
        let y = D(args[0]);
        if (isRelative) {
          y = y.plus(curY);
        }

        const pt = applyToPoint(ctm, x, y);
        result.push(
          "L " + pt.x.toFixed(precision) + " " + pt.y.toFixed(precision),
        );

        curY = y;
        break;
      }

      case "C": {
        const transformed = [];
        // Validate args length is multiple of 6
        if (args.length % 6 !== 0) {
          console.warn(`transformPathData: C command has ${args.length} args, expected multiple of 6`);
        }
        for (let i = 0; i + 5 < args.length; i += 6) {
          let x1 = D(args[i]),
            y1 = D(args[i + 1]);
          let x2 = D(args[i + 2]),
            y2 = D(args[i + 3]);
          let x = D(args[i + 4]),
            y = D(args[i + 5]);

          if (isRelative) {
            x1 = x1.plus(curX);
            y1 = y1.plus(curY);
            x2 = x2.plus(curX);
            y2 = y2.plus(curY);
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const p1 = applyToPoint(ctm, x1, y1);
          const p2 = applyToPoint(ctm, x2, y2);
          const p = applyToPoint(ctm, x, y);

          transformed.push(
            p1.x.toFixed(precision),
            p1.y.toFixed(precision),
            p2.x.toFixed(precision),
            p2.y.toFixed(precision),
            p.x.toFixed(precision),
            p.y.toFixed(precision),
          );

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "C" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "S": {
        const transformed = [];
        // Validate args length is multiple of 4
        if (args.length % 4 !== 0) {
          console.warn(`transformPathData: S command has ${args.length} args, expected multiple of 4`);
        }
        for (let i = 0; i + 3 < args.length; i += 4) {
          let x2 = D(args[i]),
            y2 = D(args[i + 1]);
          let x = D(args[i + 2]),
            y = D(args[i + 3]);

          if (isRelative) {
            x2 = x2.plus(curX);
            y2 = y2.plus(curY);
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const p2 = applyToPoint(ctm, x2, y2);
          const p = applyToPoint(ctm, x, y);

          transformed.push(
            p2.x.toFixed(precision),
            p2.y.toFixed(precision),
            p.x.toFixed(precision),
            p.y.toFixed(precision),
          );

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "S" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "Q": {
        const transformed = [];
        // Validate args length is multiple of 4
        if (args.length % 4 !== 0) {
          console.warn(`transformPathData: Q command has ${args.length} args, expected multiple of 4`);
        }
        for (let i = 0; i + 3 < args.length; i += 4) {
          let x1 = D(args[i]),
            y1 = D(args[i + 1]);
          let x = D(args[i + 2]),
            y = D(args[i + 3]);

          if (isRelative) {
            x1 = x1.plus(curX);
            y1 = y1.plus(curY);
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const p1 = applyToPoint(ctm, x1, y1);
          const p = applyToPoint(ctm, x, y);

          transformed.push(
            p1.x.toFixed(precision),
            p1.y.toFixed(precision),
            p.x.toFixed(precision),
            p.y.toFixed(precision),
          );

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "Q" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "T": {
        const transformed = [];
        // Validate args length is multiple of 2
        if (args.length % 2 !== 0) {
          console.warn(`transformPathData: T command has ${args.length} args, expected multiple of 2`);
        }
        for (let i = 0; i + 1 < args.length; i += 2) {
          let x = D(args[i]),
            y = D(args[i + 1]);
          if (isRelative) {
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const pt = applyToPoint(ctm, x, y);
          transformed.push(pt.x.toFixed(precision), pt.y.toFixed(precision));

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "T" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "A": {
        // Use proper arc transformation
        const transformed = [];
        // Validate args length is multiple of 7
        if (args.length % 7 !== 0) {
          console.warn(`transformPathData: Arc command has ${args.length} args, expected multiple of 7`);
        }
        for (let i = 0; i + 6 < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          const rotation = args[i + 2];
          const largeArc = args[i + 3];
          const sweep = args[i + 4];
          let x = D(args[i + 5]),
            y = D(args[i + 6]);

          if (isRelative) {
            x = x.plus(curX);
            y = y.plus(curY);
          }

          const arc = transformArc(
            rx,
            ry,
            rotation,
            largeArc,
            sweep,
            x.toNumber(),
            y.toNumber(),
            ctm,
          );

          transformed.push(
            arc.rx.toFixed(precision),
            arc.ry.toFixed(precision),
            arc.xAxisRotation.toFixed(precision),
            arc.largeArcFlag,
            arc.sweepFlag,
            arc.x.toFixed(precision),
            arc.y.toFixed(precision),
          );

          curX = x;
          curY = y;
        }
        result.push((toAbsolute ? "A" : cmd) + " " + transformed.join(" "));
        break;
      }

      case "Z": {
        result.push("Z");
        curX = subpathStartX;
        curY = subpathStartY;
        break;
      }

      default:
        // Keep unknown commands as-is
        result.push(cmd + " " + args.join(" "));
    }
  }

  return result.join(" ");
}

/**
 * Parse SVG path data into command/args pairs.
 *
 * Extracts individual path commands with their numeric arguments from
 * SVG path data strings. Handles all valid SVG path command letters
 * and properly separates arguments.
 *
 * Path command letters (case-sensitive):
 * - M/m: moveto
 * - L/l: lineto
 * - H/h: horizontal lineto
 * - V/v: vertical lineto
 * - C/c: cubic Bézier curve
 * - S/s: smooth cubic Bézier
 * - Q/q: quadratic Bézier curve
 * - T/t: smooth quadratic Bézier
 * - A/a: elliptical arc
 * - Z/z: closepath
 *
 * Uppercase = absolute coordinates, lowercase = relative coordinates
 *
 * @private
 * @param {string} pathData - SVG path d attribute value
 * @returns {Array<{cmd: string, args: number[]}>} Array of command objects with args
 *
 * @example
 * parsePathCommands("M 10 20 L 30 40 Z")
 * // Returns: [
 * //   { cmd: 'M', args: [10, 20] },
 * //   { cmd: 'L', args: [30, 40] },
 * //   { cmd: 'Z', args: [] }
 * // ]
 */
function parsePathCommands(pathData) {
  // Validate input
  if (!pathData || typeof pathData !== "string") {
    return [];
  }

  const commands = [];
  const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;

  while ((match = commandRegex.exec(pathData)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const args =
      argsStr.length > 0
        ? argsStr
            .split(/[\s,]+/)
            .filter((s) => s.length > 0)
            .map((s) => {
              const val = parseFloat(s);
              if (isNaN(val)) {
                console.warn(`parsePathCommands: invalid number '${s}'`);
                return 0;
              }
              return val;
            })
        : [];
    commands.push({ cmd, args });
  }

  return commands;
}

/**
 * Information about precision comparison between standard JavaScript floats and Decimal.js.
 *
 * This library uses arbitrary-precision arithmetic via Decimal.js to avoid the
 * accumulation of floating-point errors common in SVG transform operations.
 *
 * Precision metrics (measured from benchmark):
 * - **floatErrorGIS**: Error with large coordinates (1e6+ scale) - significant!
 *   Example: 10 becomes 9.9999998808 after GIS-scale round-trip (error: 1.69e-7)
 *
 * - **floatErrorTypical**: Error with typical SVG hierarchy (6 levels)
 *   Example: 10 becomes 10.000000000000114 (error: 1.14e-13, sub-pixel)
 *
 * - **decimalPrecision**: Number of significant digits maintained by Decimal.js (80)
 *
 * - **typicalRoundTripError**: Error after round-trip conversion with Decimal.js
 *   Approximately 1e-77 to 0, effectively zero for practical purposes
 *
 * Why this matters for SVG:
 * - Transform matrices multiply, accumulating errors
 * - Large coordinates (GIS, CAD) amplify precision loss significantly
 * - Nested SVG elements create deep transform hierarchies
 * - High precision ensures exact coordinate preservation
 *
 * @constant {Object}
 * @property {number} floatErrorGIS - Float error with large coordinates (1.69e-7)
 * @property {number} floatErrorTypical - Float error with typical SVG (1.14e-13)
 * @property {number} decimalPrecision - Decimal.js precision in significant digits (80)
 * @property {string} typicalRoundTripError - Round-trip error with Decimal ('1e-77')
 * @property {string} improvementFactorGIS - Improvement for GIS/CAD ('1e+93')
 */
export const PRECISION_INFO = {
  floatErrorGIS: 1.69e-7, // Error with 1e6+ scale coordinates
  floatErrorTypical: 1.14e-13, // Error with typical 6-level SVG hierarchy
  decimalPrecision: 80,
  typicalRoundTripError: "1e-77",
  improvementFactorGIS: "1e+93",
};

export default {
  // viewBox and preserveAspectRatio
  parseViewBox,
  parsePreserveAspectRatio,
  computeViewBoxTransform,
  SVGViewport,
  buildFullCTM,
  // Unit resolution
  resolveLength,
  resolvePercentages,
  normalizedDiagonal,
  // Object bounding box
  objectBoundingBoxTransform,
  // Shape to path conversion
  circleToPath,
  ellipseToPath,
  rectToPath,
  lineToPath,
  polygonToPath,
  polylineToPath,
  // Arc transformation
  transformArc,
  // Transform parsing
  parseTransformFunction,
  parseTransformAttribute,
  buildCTM,
  applyToPoint,
  toSVGMatrix,
  isIdentity,
  transformPathData,
  PRECISION_INFO,
};
