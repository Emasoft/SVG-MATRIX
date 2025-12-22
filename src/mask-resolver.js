/**
 * Mask Resolver Module - Flatten SVG mask elements
 *
 * Resolves SVG mask elements by converting them to clipping operations
 * or alpha channel modifications with Decimal.js precision.
 *
 * SVG Mask Concepts:
 *
 * 1. Mask Types (mask-type CSS property):
 *    - 'luminance' (default): Uses the luminance of the mask content to determine opacity.
 *      The luminance is calculated using the sRGB formula: 0.2126*R + 0.7152*G + 0.0722*B.
 *      White (luminance=1) means fully opaque, black (luminance=0) means fully transparent.
 *
 *    - 'alpha': Uses only the alpha channel of the mask content to determine opacity.
 *      The RGB color values are ignored, only the alpha/opacity values matter.
 *
 * 2. Coordinate Systems (maskUnits and maskContentUnits):
 *    - 'objectBoundingBox': Coordinates are relative to the bounding box of the element
 *      being masked. Values are typically 0-1 representing fractions of the bbox dimensions.
 *      Default for maskUnits.
 *
 *    - 'userSpaceOnUse': Coordinates are in the current user coordinate system (absolute).
 *      Default for maskContentUnits.
 *
 * 3. Default Mask Region:
 *    Per SVG spec, the default mask region extends from -10% to 120% in both dimensions
 *    relative to the object bounding box, giving a 20% margin around the masked element.
 *
 * 4. Mesh Gradient Integration:
 *    Mesh gradients can be used as mask fills. When a mask child references a mesh gradient,
 *    the gradient's color values are sampled and converted to opacity values based on the
 *    mask type (luminance or alpha). The mesh's Coons patch boundaries can also be used
 *    for purely geometric clipping operations.
 *
 * Supports:
 * - Luminance masks (default)
 * - Alpha masks (mask-type="alpha")
 * - maskUnits (userSpaceOnUse, objectBoundingBox)
 * - maskContentUnits (userSpaceOnUse, objectBoundingBox)
 * - Mesh gradient fills in mask content
 * - Shape-based clipping using mesh gradient boundaries
 *
 * @module mask-resolver
 */

import Decimal from "decimal.js";
import { Matrix as _Matrix } from "./matrix.js";
import * as _Transforms2D from "./transforms2d.js";
import * as PolygonClip from "./polygon-clip.js";
import * as ClipPathResolver from "./clip-path-resolver.js";
import * as MeshGradient from "./mesh-gradient.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// Default mask bounds (SVG spec: -10% to 120% in each dimension)
const DEFAULT_MASK_X = -0.1;
const DEFAULT_MASK_Y = -0.1;
const DEFAULT_MASK_WIDTH = 1.2;
const DEFAULT_MASK_HEIGHT = 1.2;

/**
 * Mask type enumeration
 *
 * Defines the two standard SVG mask types as specified by the mask-type CSS property.
 *
 * @enum {string}
 * @property {string} LUMINANCE - Uses the luminance of mask content (default). Formula: 0.2126*R + 0.7152*G + 0.0722*B
 * @property {string} ALPHA - Uses only the alpha channel of mask content, ignoring color values
 *
 * @example
 * // Create a luminance-based mask
 * const maskData = {
 *   maskType: MaskType.LUMINANCE,
 *   // ... other properties
 * };
 *
 * @example
 * // Create an alpha-based mask
 * const maskData = {
 *   maskType: MaskType.ALPHA,
 *   // ... other properties
 * };
 */
export const MaskType = {
  LUMINANCE: "luminance",
  ALPHA: "alpha",
};

/**
 * Parse SVG mask element to structured data
 *
 * Extracts all relevant attributes from an SVG <mask> element and its children,
 * converting them to a standardized data structure for further processing.
 *
 * Handles maskUnits and maskContentUnits coordinate systems, applies default values
 * per SVG specification, and recursively parses child elements (shapes, groups, etc.).
 *
 * @param {Element} maskElement - SVG mask DOM element to parse
 * @returns {Object} Parsed mask data structure containing:
 *   - {string} id - Mask element ID
 *   - {string} maskUnits - Coordinate system for mask region ('objectBoundingBox' | 'userSpaceOnUse')
 *   - {string} maskContentUnits - Coordinate system for mask content ('objectBoundingBox' | 'userSpaceOnUse')
 *   - {string} maskType - Mask compositing mode ('luminance' | 'alpha')
 *   - {number|null} x - Mask region x coordinate (null for userSpaceOnUse without explicit value)
 *   - {number|null} y - Mask region y coordinate
 *   - {number|null} width - Mask region width
 *   - {number|null} height - Mask region height
 *   - {string|null} transform - Transform attribute value
 *   - {Array<Object>} children - Parsed child elements with shape-specific attributes
 *
 * @example
 * // Parse a basic mask element
 * const maskEl = document.querySelector('#myMask');
 * const maskData = parseMaskElement(maskEl);
 * // Result: {
 * //   id: 'myMask',
 * //   maskUnits: 'objectBoundingBox',
 * //   maskContentUnits: 'userSpaceOnUse',
 * //   maskType: 'luminance',
 * //   x: -0.1, y: -0.1, width: 1.2, height: 1.2,
 * //   transform: null,
 * //   children: [...]
 * // }
 *
 * @example
 * // Parse a mask with custom bounds
 * const maskData = parseMaskElement(maskElement);
 * console.log(`Mask type: ${maskData.maskType}`); // 'luminance' or 'alpha'
 * console.log(`Number of shapes: ${maskData.children.length}`);
 */
export function parseMaskElement(maskElement) {
  if (!maskElement) throw new Error('parseMaskElement: maskElement is required');
  const data = {
    id: maskElement.getAttribute("id") || "",
    maskUnits: maskElement.getAttribute("maskUnits") || "objectBoundingBox",
    maskContentUnits:
      maskElement.getAttribute("maskContentUnits") || "userSpaceOnUse",
    maskType:
      maskElement.getAttribute("mask-type") ||
      maskElement.style?.maskType ||
      "luminance",
    x: maskElement.getAttribute("x"),
    y: maskElement.getAttribute("y"),
    width: maskElement.getAttribute("width"),
    height: maskElement.getAttribute("height"),
    transform: maskElement.getAttribute("transform") || null,
    children: [],
  };

  // Set defaults based on maskUnits
  if (data.maskUnits === "objectBoundingBox") {
    data.x = data.x !== null ? parseFloat(data.x) : DEFAULT_MASK_X;
    data.y = data.y !== null ? parseFloat(data.y) : DEFAULT_MASK_Y;
    data.width =
      data.width !== null ? parseFloat(data.width) : DEFAULT_MASK_WIDTH;
    data.height =
      data.height !== null ? parseFloat(data.height) : DEFAULT_MASK_HEIGHT;
  } else {
    data.x = data.x !== null ? parseFloat(data.x) : null;
    data.y = data.y !== null ? parseFloat(data.y) : null;
    data.width = data.width !== null ? parseFloat(data.width) : null;
    data.height = data.height !== null ? parseFloat(data.height) : null;
  }

  // Parse child elements
  for (const child of maskElement.children) {
    const tagName = child.tagName.toLowerCase();
    const childData = {
      type: tagName,
      fill: child.getAttribute("fill") || child.style?.fill || "black",
      fillOpacity: parseFloat(
        child.getAttribute("fill-opacity") || child.style?.fillOpacity || "1",
      ),
      opacity: parseFloat(
        child.getAttribute("opacity") || child.style?.opacity || "1",
      ),
      transform: child.getAttribute("transform") || null,
    };

    // Parse shape-specific attributes
    switch (tagName) {
      case "rect":
        childData.x = parseFloat(child.getAttribute("x") || "0");
        childData.y = parseFloat(child.getAttribute("y") || "0");
        childData.width = parseFloat(child.getAttribute("width") || "0");
        childData.height = parseFloat(child.getAttribute("height") || "0");
        childData.rx = parseFloat(child.getAttribute("rx") || "0");
        childData.ry = parseFloat(child.getAttribute("ry") || "0");
        break;
      case "circle":
        childData.cx = parseFloat(child.getAttribute("cx") || "0");
        childData.cy = parseFloat(child.getAttribute("cy") || "0");
        childData.r = parseFloat(child.getAttribute("r") || "0");
        break;
      case "ellipse":
        childData.cx = parseFloat(child.getAttribute("cx") || "0");
        childData.cy = parseFloat(child.getAttribute("cy") || "0");
        childData.rx = parseFloat(child.getAttribute("rx") || "0");
        childData.ry = parseFloat(child.getAttribute("ry") || "0");
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
      case "g":
        // Recursively parse group children
        childData.children = [];
        for (const gc of child.children) {
          // Simplified - just store the tag and basic info
          childData.children.push({
            type: gc.tagName.toLowerCase(),
            fill: gc.getAttribute("fill") || "inherit",
          });
        }
        break;
    }

    data.children.push(childData);
  }

  return data;
}

/**
 * Get the effective mask region in user coordinate space
 *
 * Computes the actual mask region by applying the appropriate coordinate system
 * transformation based on maskUnits. If maskUnits is 'objectBoundingBox', the mask
 * coordinates are treated as fractions of the target element's bounding box.
 *
 * SVG Spec: Default mask region is -10% to 120% in each dimension when using
 * objectBoundingBox units, providing a 20% margin around the masked element.
 *
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box with properties:
 *   - {number} x - Bounding box x coordinate
 *   - {number} y - Bounding box y coordinate
 *   - {number} width - Bounding box width
 *   - {number} height - Bounding box height
 * @returns {Object} Computed mask region in user coordinates with Decimal precision:
 *   - {Decimal} x - Mask region x coordinate
 *   - {Decimal} y - Mask region y coordinate
 *   - {Decimal} width - Mask region width
 *   - {Decimal} height - Mask region height
 *
 * @example
 * // Get mask region for objectBoundingBox units
 * const maskData = {
 *   maskUnits: 'objectBoundingBox',
 *   x: -0.1, y: -0.1, width: 1.2, height: 1.2
 * };
 * const targetBBox = { x: 100, y: 50, width: 200, height: 150 };
 * const region = getMaskRegion(maskData, targetBBox);
 * // region.x = 100 + (-0.1 * 200) = 80
 * // region.y = 50 + (-0.1 * 150) = 35
 * // region.width = 1.2 * 200 = 240
 * // region.height = 1.2 * 150 = 180
 *
 * @example
 * // Get mask region for userSpaceOnUse units
 * const maskData = {
 *   maskUnits: 'userSpaceOnUse',
 *   x: 50, y: 50, width: 300, height: 200
 * };
 * const region = getMaskRegion(maskData, targetBBox);
 * // region.x = 50 (absolute)
 * // region.y = 50 (absolute)
 */
export function getMaskRegion(maskData, targetBBox) {
  if (maskData.maskUnits === "objectBoundingBox") {
    // Coordinates are relative to target bounding box
    return {
      x: D(targetBBox.x).plus(D(maskData.x).mul(targetBBox.width)),
      y: D(targetBBox.y).plus(D(maskData.y).mul(targetBBox.height)),
      width: D(maskData.width).mul(targetBBox.width),
      height: D(maskData.height).mul(targetBBox.height),
    };
  }

  // userSpaceOnUse - use values directly (or defaults if null)
  return {
    x:
      maskData.x !== null
        ? D(maskData.x)
        : D(targetBBox.x).minus(D(targetBBox.width).mul(0.1)),
    y:
      maskData.y !== null
        ? D(maskData.y)
        : D(targetBBox.y).minus(D(targetBBox.height).mul(0.1)),
    width:
      maskData.width !== null
        ? D(maskData.width)
        : D(targetBBox.width).mul(1.2),
    height:
      maskData.height !== null
        ? D(maskData.height)
        : D(targetBBox.height).mul(1.2),
  };
}

/**
 * Convert a mask child element to a polygon representation
 *
 * Transforms mask content (rectangles, circles, paths, etc.) into polygon vertices
 * using the clip-path-resolver's shape conversion. Handles coordinate system
 * transformations based on maskContentUnits.
 *
 * When maskContentUnits is 'objectBoundingBox', the polygon coordinates are scaled
 * and translated relative to the target element's bounding box. When 'userSpaceOnUse',
 * coordinates remain in absolute user space.
 *
 * @param {Object} child - Mask child element data (from parseMaskElement)
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {string} contentUnits - maskContentUnits value ('objectBoundingBox' | 'userSpaceOnUse')
 * @param {number} [samples=20] - Number of samples for curve approximation in paths/circles
 * @returns {Array<{x: Decimal, y: Decimal}>} Polygon vertices with Decimal precision
 *
 * @example
 * // Convert a rectangle in objectBoundingBox units
 * const child = { type: 'rect', x: 0, y: 0, width: 1, height: 1 };
 * const bbox = { x: 100, y: 50, width: 200, height: 150 };
 * const polygon = maskChildToPolygon(child, bbox, 'objectBoundingBox');
 * // Result: vertices at (100,50), (300,50), (300,200), (100,200)
 *
 * @example
 * // Convert a circle in userSpaceOnUse
 * const child = { type: 'circle', cx: 150, cy: 100, r: 50 };
 * const polygon = maskChildToPolygon(child, bbox, 'userSpaceOnUse', 32);
 * // Result: 32-sided polygon approximating the circle
 */
export function maskChildToPolygon(
  child,
  targetBBox,
  contentUnits,
  samples = 20,
) {
  // Create element-like object for ClipPathResolver
  const element = {
    type: child.type,
    ...child,
    transform: child.transform,
  };

  // Get polygon using ClipPathResolver
  let polygon = ClipPathResolver.shapeToPolygon(element, null, samples);

  // Apply objectBoundingBox scaling if needed
  if (contentUnits === "objectBoundingBox" && polygon.length > 0) {
    polygon = polygon.map((p) => ({
      x: D(targetBBox.x).plus(p.x.mul(targetBBox.width)),
      y: D(targetBBox.y).plus(p.y.mul(targetBBox.height)),
    }));
  }

  return polygon;
}

/**
 * Calculate luminance value for a CSS color string
 *
 * Converts a color to its perceived brightness using the standard sRGB luminance formula:
 * Luminance = 0.2126*R + 0.7152*G + 0.0722*B
 *
 * These coefficients reflect the human eye's different sensitivity to red, green, and blue.
 * Green contributes most to perceived brightness (71.52%), red less (21.26%), and blue
 * least (7.22%).
 *
 * This formula is used in luminance-based SVG masks to determine opacity: white (luminance=1)
 * produces full opacity, black (luminance=0) produces full transparency.
 *
 * @param {string} colorStr - CSS color string in formats:
 *   - Hex: '#rgb', '#rrggbb'
 *   - RGB: 'rgb(r, g, b)'
 *   - Named: 'white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray'/'grey'
 *   - Special: 'none', 'transparent'
 * @returns {number} Luminance value in range 0-1 (0=black, 1=white)
 *
 * @example
 * // Pure colors
 * colorToLuminance('white');   // Returns 1.0
 * colorToLuminance('black');   // Returns 0.0
 * colorToLuminance('red');     // Returns 0.2126
 * colorToLuminance('green');   // Returns 0.7152
 * colorToLuminance('blue');    // Returns 0.0722
 *
 * @example
 * // Hex colors
 * colorToLuminance('#ffffff'); // Returns 1.0 (white)
 * colorToLuminance('#000000'); // Returns 0.0 (black)
 * colorToLuminance('#808080'); // Returns ~0.5 (gray)
 * colorToLuminance('#f00');    // Returns 0.2126 (red, short form)
 *
 * @example
 * // RGB colors
 * colorToLuminance('rgb(255, 0, 0)');     // Returns 0.2126 (red)
 * colorToLuminance('rgb(128, 128, 128)'); // Returns ~0.5 (gray)
 *
 * @example
 * // Use in luminance mask calculation
 * const maskChild = { fill: '#808080', opacity: 0.8 };
 * const luminance = colorToLuminance(maskChild.fill);
 * const effectiveOpacity = luminance * maskChild.opacity; // 0.5 * 0.8 = 0.4
 */
export function colorToLuminance(colorStr) {
  if (!colorStr || colorStr === "none" || colorStr === "transparent") {
    return 0;
  }

  // Parse RGB values
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Parse hex colors
  const hexMatch = colorStr.match(/^#([0-9a-f]{3,6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Named colors (common ones)
  const namedColors = {
    white: 1,
    black: 0,
    red: 0.2126,
    green: 0.7152,
    blue: 0.0722,
    yellow: 0.9278,
    cyan: 0.7874,
    magenta: 0.2848,
    gray: 0.5,
    grey: 0.5,
  };

  const lower = colorStr.toLowerCase();
  if (namedColors[lower] !== undefined) {
    return namedColors[lower];
  }

  // Default to 1 (white/opaque) if unknown
  return 1;
}

/**
 * Calculate effective opacity for a mask child element
 *
 * Combines fill-opacity and opacity attributes, and applies luminance calculation
 * for luminance-based masks. The result determines how much the mask child
 * contributes to masking the target element.
 *
 * For luminance masks: opacity = fill-opacity × opacity × luminance(fill-color)
 * For alpha masks: opacity = fill-opacity × opacity (color is ignored)
 *
 * @param {Object} child - Mask child data with properties:
 *   - {string} fill - Fill color
 *   - {number} fillOpacity - Fill opacity (0-1)
 *   - {number} opacity - Element opacity (0-1)
 * @param {string} maskType - Mask type: 'luminance' or 'alpha'
 * @returns {number} Effective opacity value in range 0-1
 *
 * @example
 * // Alpha mask - color is ignored
 * const child = { fill: 'red', fillOpacity: 0.8, opacity: 0.5 };
 * const opacity = getMaskChildOpacity(child, MaskType.ALPHA);
 * // Returns: 0.8 × 0.5 = 0.4
 *
 * @example
 * // Luminance mask - white fill
 * const child = { fill: 'white', fillOpacity: 0.8, opacity: 0.5 };
 * const opacity = getMaskChildOpacity(child, MaskType.LUMINANCE);
 * // Returns: 0.8 × 0.5 × 1.0 = 0.4
 *
 * @example
 * // Luminance mask - gray fill
 * const child = { fill: '#808080', fillOpacity: 1.0, opacity: 1.0 };
 * const opacity = getMaskChildOpacity(child, MaskType.LUMINANCE);
 * // Returns: 1.0 × 1.0 × 0.5 = 0.5 (gray has ~50% luminance)
 *
 * @example
 * // Luminance mask - black fill
 * const child = { fill: 'black', fillOpacity: 1.0, opacity: 1.0 };
 * const opacity = getMaskChildOpacity(child, MaskType.LUMINANCE);
 * // Returns: 1.0 × 1.0 × 0.0 = 0.0 (black = fully transparent in luminance mask)
 */
export function getMaskChildOpacity(child, maskType) {
  const fillOpacity = child.fillOpacity || 1;
  const opacity = child.opacity || 1;
  const baseOpacity = fillOpacity * opacity;

  if (maskType === MaskType.ALPHA) {
    return baseOpacity;
  }

  // Luminance mask: multiply by luminance of fill color
  const luminance = colorToLuminance(child.fill);
  return baseOpacity * luminance;
}

/**
 * Resolve mask to a set of weighted clipping polygons
 *
 * Converts all mask child elements into polygon representations with associated
 * opacity values. Each child element becomes one or more polygons that define
 * regions with specific opacity levels for masking.
 *
 * This is the core mask resolution function that processes mask content into
 * a format suitable for clipping operations or alpha compositing.
 *
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {Object} [options={}] - Resolution options:
 *   - {number} samples - Number of curve samples for path approximation (default: 20)
 * @returns {Array<{polygon: Array, opacity: number}>} Array of mask regions, each containing:
 *   - polygon: Array of {x: Decimal, y: Decimal} vertices
 *   - opacity: Effective opacity value (0-1) for this region
 *
 * @example
 * // Resolve a simple mask with a white rectangle
 * const maskData = {
 *   maskType: 'luminance',
 *   maskContentUnits: 'userSpaceOnUse',
 *   children: [{
 *     type: 'rect',
 *     x: 0, y: 0, width: 100, height: 100,
 *     fill: 'white',
 *     opacity: 1.0
 *   }]
 * };
 * const bbox = { x: 0, y: 0, width: 200, height: 200 };
 * const regions = resolveMask(maskData, bbox);
 * // Returns: [{ polygon: [...4 vertices...], opacity: 1.0 }]
 *
 * @example
 * // Resolve mask with multiple children
 * const regions = resolveMask(maskData, bbox, { samples: 32 });
 * regions.forEach(({ polygon, opacity }) => {
 *   console.log(`Region with ${polygon.length} vertices, opacity: ${opacity}`);
 * });
 */
export function resolveMask(maskData, targetBBox, options = {}) {
  const { samples = 20 } = options;
  const maskType = maskData.maskType || MaskType.LUMINANCE;
  const result = [];

  for (const child of maskData.children) {
    const polygon = maskChildToPolygon(
      child,
      targetBBox,
      maskData.maskContentUnits,
      samples,
    );

    if (polygon.length >= 3) {
      const opacity = getMaskChildOpacity(child, maskType);
      result.push({ polygon, opacity });
    }
  }

  return result;
}

/**
 * Apply mask to a target polygon
 *
 * Computes the intersection of a target polygon with mask regions, producing
 * a set of clipped polygons each with associated opacity values. This is used
 * to apply SVG masks to geometric shapes.
 *
 * The function:
 * 1. Resolves the mask into opacity-weighted regions
 * 2. Computes the geometric intersection of each mask region with the target
 * 3. Returns only non-zero opacity intersections
 *
 * The result can be used for rendering semi-transparent regions or for further
 * compositing operations.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} targetPolygon - Target polygon vertices to be masked
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {Object} [options={}] - Options passed to resolveMask():
 *   - {number} samples - Curve sampling resolution (default: 20)
 * @returns {Array<{polygon: Array, opacity: number}>} Array of masked regions:
 *   - polygon: Clipped polygon vertices
 *   - opacity: Mask opacity for this region (0-1)
 *
 * @example
 * // Apply a circular mask to a rectangle
 * const targetPolygon = [
 *   { x: D(0), y: D(0) },
 *   { x: D(100), y: D(0) },
 *   { x: D(100), y: D(100) },
 *   { x: D(0), y: D(100) }
 * ];
 * const maskData = {
 *   maskType: 'luminance',
 *   maskContentUnits: 'userSpaceOnUse',
 *   children: [{
 *     type: 'circle',
 *     cx: 50, cy: 50, r: 40,
 *     fill: 'white',
 *     opacity: 0.8
 *   }]
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const result = applyMask(targetPolygon, maskData, bbox);
 * // Returns: [{ polygon: [...circle-rect intersection...], opacity: 0.8 }]
 *
 * @example
 * // Handle multiple mask regions
 * const result = applyMask(targetPolygon, maskData, bbox);
 * result.forEach(({ polygon, opacity }) => {
 *   // Render polygon with opacity
 *   console.log(`Render ${polygon.length}-sided polygon at ${opacity * 100}% opacity`);
 * });
 */
export function applyMask(targetPolygon, maskData, targetBBox, options = {}) {
  const maskRegions = resolveMask(maskData, targetBBox, options);
  const result = [];

  for (const { polygon: maskPoly, opacity } of maskRegions) {
    if (opacity <= 0) continue;

    const intersection = PolygonClip.polygonIntersection(
      targetPolygon,
      maskPoly,
    );

    for (const clippedPoly of intersection) {
      if (clippedPoly.length >= 3) {
        result.push({ polygon: clippedPoly, opacity });
      }
    }
  }

  return result;
}

/**
 * Flatten mask to simple clipPath (binary opacity)
 *
 * Converts a mask with potentially multiple opacity levels into a single binary
 * clipping polygon. All mask regions with opacity above the threshold are combined
 * (unioned) into one shape; regions below threshold are discarded.
 *
 * This is useful when you need simple geometric clipping without opacity gradations,
 * such as when the rendering system doesn't support partial transparency or when
 * simplification is desired for performance.
 *
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {number} [opacityThreshold=0.5] - Minimum opacity to include (0-1).
 *   Regions with opacity >= threshold become part of the clip path;
 *   regions below threshold are excluded.
 * @param {Object} [options={}] - Options passed to resolveMask():
 *   - {number} samples - Curve sampling resolution (default: 20)
 * @returns {Array<{x: Decimal, y: Decimal}>} Combined clipping polygon vertices,
 *   or empty array if no regions meet the threshold
 *
 * @example
 * // Convert a multi-region mask to binary clipPath
 * const maskData = {
 *   maskType: 'luminance',
 *   children: [
 *     { type: 'circle', cx: 30, cy: 30, r: 20, fill: 'white', opacity: 0.8 },
 *     { type: 'circle', cx: 70, cy: 70, r: 20, fill: '#808080', opacity: 1.0 }
 *   ]
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const clipPath = maskToClipPath(maskData, bbox, 0.5);
 * // First circle: opacity 0.8 >= 0.5 ✓ (included)
 * // Second circle: opacity ~0.5 >= 0.5 ✓ (included, gray has 50% luminance)
 * // Result: union of both circles
 *
 * @example
 * // Use strict threshold to exclude semi-transparent regions
 * const clipPath = maskToClipPath(maskData, bbox, 0.9);
 * // Only regions with opacity >= 0.9 are included
 *
 * @example
 * // Convert to SVG path
 * const polygon = maskToClipPath(maskData, bbox);
 * const pathData = polygon.map((p, i) =>
 *   `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
 * ).join(' ') + ' Z';
 */
export function maskToClipPath(
  maskData,
  targetBBox,
  opacityThreshold = 0.5,
  options = {},
) {
  const maskRegions = resolveMask(maskData, targetBBox, options);

  // Union all regions above threshold
  let result = [];

  for (const { polygon, opacity } of maskRegions) {
    if (opacity >= opacityThreshold && polygon.length >= 3) {
      if (result.length === 0) {
        result = polygon;
      } else {
        // Union with existing result
        const unionResult = PolygonClip.polygonUnion(result, polygon);
        if (unionResult.length > 0 && unionResult[0].length >= 3) {
          result = unionResult[0];
        }
      }
    }
  }

  return result;
}

/**
 * Generate SVG path data string for mask as clipPath
 *
 * Converts a mask to a binary clipping polygon and formats it as an SVG path
 * data string (d attribute). This is useful for creating <clipPath> elements
 * from mask definitions.
 *
 * Uses default opacity threshold of 0.5 to determine which mask regions to include.
 *
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {Object} [options={}] - Options passed to maskToClipPath():
 *   - {number} samples - Curve sampling resolution (default: 20)
 * @returns {string} SVG path data string (e.g., "M 10 20 L 30 40 L 50 20 Z"),
 *   or empty string if no valid mask regions
 *
 * @example
 * // Generate clipPath from mask
 * const maskData = {
 *   maskType: 'luminance',
 *   children: [{
 *     type: 'rect',
 *     x: 10, y: 10, width: 80, height: 80,
 *     fill: 'white'
 *   }]
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const pathData = maskToPathData(maskData, bbox);
 * // Returns: "M 10.000000 10.000000 L 90.000000 10.000000 L 90.000000 90.000000 L 10.000000 90.000000 Z"
 *
 * @example
 * // Use in SVG clipPath element
 * const pathData = maskToPathData(maskData, bbox, { samples: 32 });
 * const clipPathSVG = `
 *   <clipPath id="converted-mask">
 *     <path d="${pathData}" />
 *   </clipPath>
 * `;
 */
export function maskToPathData(maskData, targetBBox, options = {}) {
  const polygon = maskToClipPath(maskData, targetBBox, 0.5, options);

  if (polygon.length < 3) return "";

  let d = "";
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const x = Number(p.x).toFixed(6);
    const y = Number(p.y).toFixed(6);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  d += " Z";

  return d;
}

// ============================================================================
// Mesh Gradient Mask Support
// ============================================================================

/**
 * Check if fill attribute references a gradient
 *
 * Parses CSS fill values to detect gradient references in the url(#id) format.
 * This is used to identify when mask content uses gradients (including mesh
 * gradients) as fills rather than solid colors.
 *
 * @param {string} fill - Fill attribute value (e.g., "url(#gradient1)", "red", "#fff")
 * @returns {string|null} Gradient ID if reference found, null otherwise
 *
 * @example
 * // Detect gradient reference
 * parseGradientReference('url(#myGradient)');  // Returns: 'myGradient'
 * parseGradientReference('url( #mesh-1 )');    // Returns: 'mesh-1' (whitespace ignored)
 *
 * @example
 * // Solid colors return null
 * parseGradientReference('red');      // Returns: null
 * parseGradientReference('#ff0000');  // Returns: null
 * parseGradientReference('none');     // Returns: null
 *
 * @example
 * // Use in mask processing
 * const child = { fill: 'url(#meshGradient1)' };
 * const gradientId = parseGradientReference(child.fill);
 * if (gradientId) {
 *   const gradientData = gradientDefs[gradientId];
 *   // Process gradient-based mask
 * }
 */
export function parseGradientReference(fill) {
  if (!fill || typeof fill !== "string") return null;

  const match = fill.match(/url\s*\(\s*#([^)\s]+)\s*\)/i);
  return match ? match[1] : null;
}

/**
 * Calculate luminance from RGB color object
 *
 * Converts an RGB color with 0-255 channel values to luminance using the
 * standard sRGB formula. This is a variant of colorToLuminance() that accepts
 * color objects instead of CSS strings.
 *
 * Used primarily for mesh gradient color conversion where colors are stored
 * as numeric RGB components.
 *
 * @param {Object} color - RGB color object with properties:
 *   - {number} r - Red channel (0-255)
 *   - {number} g - Green channel (0-255)
 *   - {number} b - Blue channel (0-255)
 * @returns {number} Luminance value in range 0-1 using formula: 0.2126*R + 0.7152*G + 0.0722*B
 *
 * @example
 * // Pure colors
 * rgbToLuminance({ r: 255, g: 255, b: 255 }); // Returns: 1.0 (white)
 * rgbToLuminance({ r: 0, g: 0, b: 0 });       // Returns: 0.0 (black)
 * rgbToLuminance({ r: 255, g: 0, b: 0 });     // Returns: 0.2126 (red)
 * rgbToLuminance({ r: 0, g: 255, b: 0 });     // Returns: 0.7152 (green)
 * rgbToLuminance({ r: 0, g: 0, b: 255 });     // Returns: 0.0722 (blue)
 *
 * @example
 * // Gray scale
 * rgbToLuminance({ r: 128, g: 128, b: 128 }); // Returns: ~0.5 (50% gray)
 *
 * @example
 * // Use with mesh gradient colors
 * const meshColor = { r: 200, g: 150, b: 100 };
 * const luminance = rgbToLuminance(meshColor);
 * const maskOpacity = luminance; // For luminance-based masks
 */
export function rgbToLuminance(color) {
  if (!color) return 0;
  const r = (color.r || 0) / 255;
  const g = (color.g || 0) / 255;
  const b = (color.b || 0) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Sample mesh gradient to create luminance-based mask regions
 *
 * Subdivides Coons patch mesh gradient into small polygonal regions, each with
 * an opacity value derived from the gradient's color at that location. This
 * converts a continuous color gradient into discrete opacity regions suitable
 * for masking operations.
 *
 * The mesh gradient's Coons patches are tessellated into triangles or quads,
 * and each patch's color is converted to an opacity value based on the mask type:
 * - Luminance masks: Use sRGB luminance formula on RGB values
 * - Alpha masks: Use the alpha channel directly
 *
 * This enables using mesh gradients as sophisticated variable-opacity masks.
 *
 * @param {Object} meshData - Parsed mesh gradient data with properties:
 *   - {Array} patches - Array of Coons patch definitions
 * @param {Object} shapeBBox - Bounding box of the shape using the gradient {x, y, width, height}
 * @param {string} [maskType='luminance'] - Mask type: 'luminance' or 'alpha'
 * @param {Object} [options={}] - Sampling options:
 *   - {number} subdivisions - Number of subdivisions per patch (default: 4)
 * @returns {Array<{polygon: Array, opacity: number}>} Array of mask regions:
 *   - polygon: Tessellated patch polygon vertices
 *   - opacity: Opacity derived from gradient color (0-1)
 *
 * @example
 * // Sample mesh gradient for luminance mask
 * const meshData = {
 *   patches: [
 *     // Coons patch with white-to-black gradient
 *     { corners: [...], colors: [{r:255,g:255,b:255}, {r:0,g:0,b:0}, ...] }
 *   ]
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const regions = sampleMeshGradientForMask(meshData, bbox, 'luminance', { subdivisions: 8 });
 * // Returns: Array of small polygons with opacity values from 0.0 (black) to 1.0 (white)
 *
 * @example
 * // Sample mesh gradient for alpha mask
 * const regions = sampleMeshGradientForMask(meshData, bbox, 'alpha', { subdivisions: 4 });
 * // Opacity derived from alpha channel, RGB colors ignored
 *
 * @example
 * // Use in complex mask
 * const regions = sampleMeshGradientForMask(meshData, bbox, 'luminance');
 * regions.forEach(({ polygon, opacity }) => {
 *   console.log(`Region with ${polygon.length} vertices, opacity: ${opacity.toFixed(2)}`);
 * });
 */
export function sampleMeshGradientForMask(
  meshData,
  shapeBBox,
  maskType = "luminance",
  options = {},
) {
  const { subdivisions = 4 } = options;
  const result = [];

  // Get mesh gradient polygons with colors
  const meshPolygons = MeshGradient.meshGradientToPolygons(meshData, {
    subdivisions,
  });

  for (const { polygon, color } of meshPolygons) {
    if (polygon.length < 3) continue;

    let opacity;
    if (maskType === MaskType.ALPHA) {
      // Alpha mask: use alpha channel
      opacity = (color.a || 255) / 255;
    } else {
      // Luminance mask: calculate from RGB
      opacity = rgbToLuminance(color);
    }

    if (opacity > 0) {
      result.push({ polygon, opacity });
    }
  }

  return result;
}

/**
 * Apply mesh gradient as a mask to a target polygon
 *
 * Combines a mesh gradient with a target polygon to produce variable-opacity
 * masking. The target polygon is clipped against each tessellated region of
 * the mesh gradient, inheriting the opacity from the gradient's color values.
 *
 * This creates sophisticated effects where different parts of the target shape
 * have different opacity levels based on the mesh gradient's color variation.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} targetPolygon - Target polygon vertices to be masked
 * @param {Object} meshData - Parsed mesh gradient data with Coons patches
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {string} [maskType='luminance'] - Mask type: 'luminance' or 'alpha'
 * @param {Object} [options={}] - Options:
 *   - {number} subdivisions - Mesh patch subdivisions (default: 4)
 * @returns {Array<{polygon: Array, opacity: number}>} Array of clipped regions:
 *   - polygon: Intersection of target with mesh region
 *   - opacity: Opacity from mesh gradient color (0-1)
 *
 * @example
 * // Apply radial-like mesh gradient mask to rectangle
 * const targetPolygon = [
 *   { x: D(0), y: D(0) },
 *   { x: D(100), y: D(0) },
 *   { x: D(100), y: D(100) },
 *   { x: D(0), y: D(100) }
 * ];
 * const meshData = {
 *   patches: [] // white center fading to black edges
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const result = applyMeshGradientMask(targetPolygon, meshData, bbox, 'luminance');
 * // Returns: Multiple polygon fragments with varying opacity (center bright, edges dark)
 *
 * @example
 * // Render masked result
 * const maskedRegions = applyMeshGradientMask(targetPolygon, meshData, bbox, 'luminance', {
 *   subdivisions: 8
 * });
 * maskedRegions.forEach(({ polygon, opacity }) => {
 *   // Render each polygon fragment with its specific opacity
 *   renderPolygon(polygon, { fillOpacity: opacity });
 * });
 */
export function applyMeshGradientMask(
  targetPolygon,
  meshData,
  targetBBox,
  maskType = "luminance",
  options = {},
) {
  const meshMaskRegions = sampleMeshGradientForMask(
    meshData,
    targetBBox,
    maskType,
    options,
  );
  const result = [];

  for (const { polygon: maskPoly, opacity } of meshMaskRegions) {
    if (opacity <= 0) continue;

    const intersection = PolygonClip.polygonIntersection(
      targetPolygon,
      maskPoly,
    );

    for (const clippedPoly of intersection) {
      if (clippedPoly.length >= 3) {
        result.push({ polygon: clippedPoly, opacity });
      }
    }
  }

  return result;
}

/**
 * Enhanced mask resolution with gradient fill support
 *
 * Extends the basic resolveMask() function to handle mask children that use
 * gradient fills (especially mesh gradients) instead of solid colors. When a
 * mask child's fill references a gradient, the gradient is sampled and converted
 * to opacity regions based on the mask type.
 *
 * This enables complex masking effects where:
 * - Mesh gradients define variable opacity across the mask shape
 * - The mask shape (rect, circle, path) clips the gradient sampling
 * - Multiple gradient-filled shapes combine to form the complete mask
 *
 * @param {Object} maskData - Parsed mask data from parseMaskElement()
 * @param {Object} targetBBox - Target element bounding box {x, y, width, height}
 * @param {Object} [gradientDefs={}] - Map of gradient ID to parsed gradient data:
 *   - Key: gradient ID string (from url(#id))
 *   - Value: gradient data object (must have .type property)
 * @param {Object} [options={}] - Resolution options:
 *   - {number} samples - Path curve sampling (default: 20)
 *   - {number} subdivisions - Mesh gradient subdivisions (default: 4)
 * @returns {Array<{polygon: Array, opacity: number}>} Array of mask regions with gradients applied
 *
 * @example
 * // Mask with mesh gradient fill
 * const maskData = {
 *   maskType: 'luminance',
 *   children: [{
 *     type: 'rect',
 *     x: 0, y: 0, width: 100, height: 100,
 *     fill: 'url(#meshGrad1)',
 *     opacity: 1.0
 *   }]
 * };
 * const gradientDefs = {
 *   meshGrad1: {
 *     type: 'meshgradient',
 *     patches: [] // Coons patches
 *   }
 * };
 * const bbox = { x: 0, y: 0, width: 100, height: 100 };
 * const regions = resolveMaskWithGradients(maskData, bbox, gradientDefs);
 * // Returns: Array of small polygons (from mesh subdivision) with luminance-based opacity
 *
 * @example
 * // Mix of solid and gradient fills
 * const maskData = {
 *   maskType: 'alpha',
 *   children: [
 *     { type: 'circle', fill: 'white', opacity: 1.0, cx: 25, cy: 25, r: 20 },
 *     { type: 'rect', fill: 'url(#meshGrad1)', opacity: 0.8, x: 50, y: 50, width: 50, height: 50 }
 *   ]
 * };
 * const regions = resolveMaskWithGradients(maskData, bbox, gradientDefs, { subdivisions: 8 });
 * // Returns: Solid circle region + mesh-sampled rectangle regions
 *
 * @example
 * // Gradient clipped by mask shape
 * // The mesh gradient is sampled only within the circle's boundary
 * const regions = resolveMaskWithGradients(maskData, bbox, gradientDefs);
 * regions.forEach(({ polygon, opacity }) => {
 *   // Each polygon is a piece of the gradient, clipped by the mask child shape
 * });
 */
export function resolveMaskWithGradients(
  maskData,
  targetBBox,
  gradientDefs = {},
  options = {},
) {
  const { samples = 20, subdivisions = 4 } = options;
  const maskType = maskData.maskType || MaskType.LUMINANCE;
  const result = [];

  for (const child of maskData.children) {
    // Check if fill references a gradient
    const gradientId = parseGradientReference(child.fill);

    if (gradientId && gradientDefs[gradientId]) {
      const gradientData = gradientDefs[gradientId];

      // Get the shape polygon first
      const shapePolygon = maskChildToPolygon(
        child,
        targetBBox,
        maskData.maskContentUnits,
        samples,
      );

      if (shapePolygon.length < 3) continue;

      // Check if it's a mesh gradient
      if (gradientData.type === "meshgradient" || gradientData.patches) {
        // Sample mesh gradient within the shape
        const meshMaskRegions = sampleMeshGradientForMask(
          gradientData,
          targetBBox,
          maskType,
          { subdivisions },
        );

        // Clip mesh regions to the shape
        for (const {
          polygon: meshPoly,
          opacity: meshOpacity,
        } of meshMaskRegions) {
          const clipped = PolygonClip.polygonIntersection(
            shapePolygon,
            meshPoly,
          );

          for (const clippedPoly of clipped) {
            if (clippedPoly.length >= 3) {
              // Combine mesh opacity with child opacity
              const combinedOpacity =
                meshOpacity * (child.opacity || 1) * (child.fillOpacity || 1);
              if (combinedOpacity > 0) {
                result.push({ polygon: clippedPoly, opacity: combinedOpacity });
              }
            }
          }
        }
      }
      // Could add support for linearGradient/radialGradient here
    } else {
      // Solid fill - use standard resolution
      const polygon = maskChildToPolygon(
        child,
        targetBBox,
        maskData.maskContentUnits,
        samples,
      );

      if (polygon.length >= 3) {
        const opacity = getMaskChildOpacity(child, maskType);
        if (opacity > 0) {
          result.push({ polygon, opacity });
        }
      }
    }
  }

  return result;
}

/**
 * Create a mesh gradient mask from scratch
 *
 * Generates a complete mask data structure where a mesh gradient directly
 * defines the opacity distribution across a region. Unlike using a mesh gradient
 * as a fill within a mask child, this creates a standalone mask entirely from
 * the gradient.
 *
 * The result is a mask object that can be used in rendering systems that
 * support variable-opacity regions, such as rasterizers or vector renderers
 * with gradient mesh support.
 *
 * @param {Object} meshData - Parsed mesh gradient data with Coons patches
 * @param {Object} bounds - Mask region bounds:
 *   - {number} x - Mask region x coordinate
 *   - {number} y - Mask region y coordinate
 *   - {number} width - Mask region width
 *   - {number} height - Mask region height
 * @param {string} [maskType='luminance'] - Mask type: 'luminance' or 'alpha'
 * @param {Object} [options={}] - Options:
 *   - {number} subdivisions - Mesh patch subdivisions (default: 4)
 * @returns {Object} Mask data structure:
 *   - {string} type - Always 'meshGradientMask'
 *   - {Object} bounds - The provided bounds
 *   - {string} maskType - The mask type
 *   - {Array} regions - Array of {polygon, opacity} from mesh sampling
 *
 * @example
 * // Create a standalone mesh gradient mask
 * const meshData = {
 *   patches: [
 *     // Coons patch creating radial-like fade
 *     {}  // patch definition
 *   ]
 * };
 * const bounds = { x: 0, y: 0, width: 200, height: 200 };
 * const mask = createMeshGradientMask(meshData, bounds, 'luminance', { subdivisions: 8 });
 * // Result: {
 * //   type: 'meshGradientMask',
 * //   bounds: { x: 0, y: 0, width: 200, height: 200 },
 * //   maskType: 'luminance',
 * //   regions: [{ polygon: [...], opacity: 0.8 }, ...]
 * // }
 *
 * @example
 * // Apply to target
 * const mask = createMeshGradientMask(meshData, bounds, 'alpha');
 * mask.regions.forEach(({ polygon, opacity }) => {
 *   // Apply region to rendering pipeline
 * });
 */
export function createMeshGradientMask(
  meshData,
  bounds,
  maskType = "luminance",
  options = {},
) {
  const regions = sampleMeshGradientForMask(
    meshData,
    bounds,
    maskType,
    options,
  );

  return {
    type: "meshGradientMask",
    bounds,
    maskType,
    regions,
  };
}

/**
 * Get the outer boundary of a mesh gradient as a clipping polygon
 *
 * Extracts the geometric shape defined by the mesh gradient's Coons patch
 * boundaries, completely ignoring color information. This treats the mesh
 * gradient purely as a shape defined by its patch edges.
 *
 * The function samples all edges of all patches and collects them into a
 * boundary polygon. For simple meshes, this gives the outline; for complex
 * meshes, it returns all sampled edge points which can be used for convex
 * hull computation or other boundary extraction.
 *
 * Useful when you want to use a mesh gradient's geometric shape for clipping
 * without considering its color/opacity values.
 *
 * @param {Object} meshData - Parsed mesh gradient data with properties:
 *   - {Array} patches - Array of Coons patch definitions with edge curves
 * @param {Object} [options={}] - Options:
 *   - {number} samples - Number of samples per edge curve (default: 20)
 * @returns {Array<{x: Decimal, y: Decimal}>} Boundary polygon vertices from
 *   sampled patch edges, or empty array if no patches
 *
 * @example
 * // Get boundary of single-patch mesh
 * const meshData = {
 *   patches: [{
 *     top: [] // bezier curve points,
 *     right: [] // bezier curve points,
 *     bottom: [] // bezier curve points,
 *     left: [] // bezier curve points
 *   }]
 * };
 * const boundary = getMeshGradientBoundary(meshData, { samples: 32 });
 * // Returns: ~128 points (4 edges × 32 samples) forming the patch outline
 *
 * @example
 * // Use as clip path shape
 * const boundary = getMeshGradientBoundary(meshData);
 * const clipped = PolygonClip.polygonIntersection(targetPolygon, boundary);
 * // Clips target using only the mesh's geometric shape, ignoring colors
 *
 * @example
 * // High-resolution boundary sampling
 * const boundary = getMeshGradientBoundary(meshData, { samples: 64 });
 * console.log(`Boundary has ${boundary.length} vertices`);
 */
export function getMeshGradientBoundary(meshData, options = {}) {
  const { samples = 20 } = options;

  if (!meshData.patches || meshData.patches.length === 0) {
    return [];
  }

  // Collect all boundary curves from the mesh
  // The outer boundary is formed by the external edges of the patch grid
  const allPoints = [];

  for (const patch of meshData.patches) {
    // Sample each edge of the patch
    if (patch.top) {
      const topPoints = MeshGradient.sampleBezierCurve(patch.top, samples);
      allPoints.push(...topPoints);
    }
    if (patch.right) {
      const rightPoints = MeshGradient.sampleBezierCurve(patch.right, samples);
      allPoints.push(...rightPoints);
    }
    if (patch.bottom) {
      const bottomPoints = MeshGradient.sampleBezierCurve(
        patch.bottom,
        samples,
      );
      allPoints.push(...bottomPoints);
    }
    if (patch.left) {
      const leftPoints = MeshGradient.sampleBezierCurve(patch.left, samples);
      allPoints.push(...leftPoints);
    }
  }

  if (allPoints.length < 3) {
    return [];
  }

  // Compute convex hull or use all points as boundary
  // For a simple mesh, we return the outline
  return allPoints;
}

/**
 * Clip a target polygon using a mesh gradient's shape (geometry-only)
 *
 * Uses the mesh gradient purely as a geometric clipping boundary, completely
 * ignoring all color and opacity information. The Coons patch curves define
 * the shape, which is tessellated and used for polygon intersection.
 *
 * This is useful when you want the organic, curved shapes that mesh gradients
 * can define, but don't need the color variation for masking. The result is
 * binary clipping (inside/outside) rather than variable opacity.
 *
 * The function:
 * 1. Tessellates all Coons patches into polygons
 * 2. Unions them into a single shape
 * 3. Clips the target polygon against this shape
 *
 * @param {Array<{x: Decimal, y: Decimal}>} targetPolygon - Target polygon vertices to clip
 * @param {Object} meshData - Parsed mesh gradient data with Coons patches
 * @param {Object} [options={}] - Options:
 *   - {number} subdivisions - Patch tessellation subdivisions (default: 4)
 * @returns {Array<Array>} Array of clipped polygon(s), each as array of vertices.
 *   Returns empty array if no intersection.
 *
 * @example
 * // Clip rectangle using mesh gradient shape
 * const targetPolygon = [
 *   { x: D(0), y: D(0) },
 *   { x: D(200), y: D(0) },
 *   { x: D(200), y: D(200) },
 *   { x: D(0), y: D(200) }
 * ];
 * const meshData = {
 *   patches: [
 *     // Organic curved shape defined by Coons patch
 *     {}  // patch with curved edges
 *   ]
 * };
 * const clipped = clipWithMeshGradientShape(targetPolygon, meshData, { subdivisions: 8 });
 * // Returns: Rectangle clipped to the curved mesh shape
 *
 * @example
 * // Use mesh gradient as complex clipPath
 * const clipped = clipWithMeshGradientShape(targetPolygon, meshData);
 * if (clipped.length > 0) {
 *   // Render each clipped polygon fragment
 *   clipped.forEach(poly => renderPolygon(poly));
 * }
 *
 * @example
 * // Multiple patches create complex shape
 * const meshData = {
 *   patches: [] // 3x3 grid of patches forming rounded shape
 * };
 * const clipped = clipWithMeshGradientShape(targetPolygon, meshData, { subdivisions: 6 });
 * // All patches unioned into one shape before clipping
 */
export function clipWithMeshGradientShape(
  targetPolygon,
  meshData,
  options = {},
) {
  const { subdivisions = 4 } = options;

  // Get all patch polygons (ignoring colors)
  const meshPolygons = MeshGradient.meshGradientToPolygons(meshData, {
    subdivisions,
  });

  if (meshPolygons.length === 0) {
    return [];
  }

  // Union all patch polygons to get the complete mesh shape
  let meshShape = meshPolygons[0].polygon;

  for (let i = 1; i < meshPolygons.length; i++) {
    const unionResult = PolygonClip.polygonUnion(
      meshShape,
      meshPolygons[i].polygon,
    );
    if (unionResult.length > 0 && unionResult[0].length >= 3) {
      meshShape = unionResult[0];
    }
  }

  // Clip target with the mesh shape
  return PolygonClip.polygonIntersection(targetPolygon, meshShape);
}

/**
 * Convert mesh gradient to a simple clip path polygon
 *
 * Tessellates all Coons patches and unions them into a single polygon shape
 * that represents the mesh gradient's geometric boundary. This is the geometry-only
 * equivalent of the gradient, suitable for use in <clipPath> elements or
 * binary clipping operations.
 *
 * All color information is discarded; only the shape defined by the patch
 * boundaries is preserved.
 *
 * @param {Object} meshData - Parsed mesh gradient data with Coons patches
 * @param {Object} [options={}] - Options:
 *   - {number} subdivisions - Patch tessellation subdivisions (default: 4)
 * @returns {Array<{x: Decimal, y: Decimal}>} Unified clip path polygon vertices,
 *   or empty array if no patches
 *
 * @example
 * // Convert single-patch mesh to clipPath
 * const meshData = {
 *   patches: [{
 *     top: [p1, p2, p3, p4], // Bezier curve points
 *     right: [p1, p2, p3, p4],
 *     bottom: [p1, p2, p3, p4],
 *     left: [p1, p2, p3, p4]
 *   }]
 * };
 * const clipPath = meshGradientToClipPath(meshData, { subdivisions: 8 });
 * // Returns: Polygon approximating the patch's curved boundary
 *
 * @example
 * // Multi-patch mesh becomes single shape
 * const meshData = {
 *   patches: [patch1, patch2, patch3]
 * };
 * const clipPath = meshGradientToClipPath(meshData);
 * // Returns: Union of all three patches as one polygon
 *
 * @example
 * // Use in SVG clipPath element
 * const polygon = meshGradientToClipPath(meshData, { subdivisions: 6 });
 * const pathData = polygon.map((p, i) =>
 *   `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
 * ).join(' ') + ' Z';
 * const svgClipPath = `<clipPath id="mesh-shape"><path d="${pathData}"/></clipPath>`;
 */
export function meshGradientToClipPath(meshData, options = {}) {
  const { subdivisions = 4 } = options;

  const meshPolygons = MeshGradient.meshGradientToPolygons(meshData, {
    subdivisions,
  });

  if (meshPolygons.length === 0) {
    return [];
  }

  // Union all patches into one shape
  let result = meshPolygons[0].polygon;

  for (let i = 1; i < meshPolygons.length; i++) {
    const poly = meshPolygons[i].polygon;
    if (poly.length >= 3) {
      const unionResult = PolygonClip.polygonUnion(result, poly);
      if (unionResult.length > 0 && unionResult[0].length >= 3) {
        result = unionResult[0];
      }
    }
  }

  return result;
}

export default {
  MaskType,
  parseMaskElement,
  getMaskRegion,
  maskChildToPolygon,
  colorToLuminance,
  getMaskChildOpacity,
  resolveMask,
  applyMask,
  maskToClipPath,
  maskToPathData,
  parseGradientReference,
  rgbToLuminance,
  sampleMeshGradientForMask,
  applyMeshGradientMask,
  resolveMaskWithGradients,
  createMeshGradientMask,
  getMeshGradientBoundary,
  clipWithMeshGradientShape,
  meshGradientToClipPath,
};
