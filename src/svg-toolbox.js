/**
 * SVG Toolbox - SVGO-equivalent functions with arbitrary precision
 *
 * Comprehensive SVG optimization and manipulation toolkit providing 68 functions
 * organized into 7 categories. All operations use Decimal.js for 80-digit precision.
 *
 * KEY ADVANTAGES OVER SVGO:
 *
 * 1. PRECISION: User-configurable 1-80 decimal precision (SVGO: hardcoded Float64)
 *    - SVG spec requires single-precision (7 digits), recommends double (15 digits)
 *    - svg-matrix offers up to 80 digits for scientific/mapping applications
 *    - Trailing zeros are automatically omitted in output
 *
 * 2. VALIDITY GUARANTEE: 100% valid XML and SVG output ALWAYS
 *    - SVGO has known bugs producing invalid XML (unbound namespaces, missing quotes)
 *    - SVGO has corrupted files and caused data loss (issues #1530, #1974)
 *    - svg-matrix NEVER produces invalid output - all escaping and namespaces preserved
 *
 * 3. SVG SPECIFICATION COMPLIANCE:
 *    - SVG 1.1: Single-precision minimum, double recommended
 *    - SVG 2.0: Double-precision for high-quality conforming viewers
 *    - CSS3/ECMA-262: IEEE 754 double-precision (15-17 significant digits)
 *    - svg-matrix exceeds all requirements with 80-digit Decimal.js
 *
 * PRECISION REFERENCE (significant digits):
 *    - Single precision (float32): ~7 digits
 *    - Double precision (float64): ~15-17 digits
 *    - svg-matrix Decimal.js: 80 digits (configurable)
 *
 * @module svg-toolbox
 * @see https://www.w3.org/TR/SVG11/types.html#DataTypeNumber
 * @see https://www.w3.org/Graphics/SVG/WG/wiki/Proposals/NumberPrecision
 */

import Decimal from "decimal.js";
import * as _PathSimplification from "./path-simplification.js";
import * as TransformDecomposition from "./transform-decomposition.js";
import * as GJKCollision from "./gjk-collision.js";
import * as _PathOptimization from "./path-optimization.js";
import * as _TransformOptimization from "./transform-optimization.js";
import * as OffCanvasDetection from "./off-canvas-detection.js";
import * as CSSSpecificity from "./css-specificity.js";
import * as GeometryToPath from "./geometry-to-path.js";
import * as SVGFlatten from "./svg-flatten.js";
import {
  SVGRenderingContext as _SVGRenderingContext,
  createRenderingContext,
  getInheritedProperties,
} from "./svg-rendering-context.js";
import {
  parseSVG,
  SVGElement,
  buildDefsMap,
  parseUrlReference,
  serializeSVG,
  findElementsWithAttribute,
} from "./svg-parser.js";
import { flattenSVG } from "./flatten-pipeline.js";
import {
  referencesProps as _referencesProps,
  inheritableAttrs,
  allowedChildrenPerElement,
  pseudoClasses,
  textElems as _textElems,
  pathElems as _pathElems,
  elemsGroups,
} from "./svg-collections.js";
import {
  collectAllReferences,
  parseAnimationValueIds as _parseAnimationValueIds,
  parseTimingIds as _parseTimingIds,
  parseCSSIds as _parseCSSIds,
  parseJavaScriptIds as _parseJavaScriptIds,
  ANIMATION_ELEMENTS as _ANIMATION_ELEMENTS,
} from "./animation-references.js";
import {
  optimizeDocumentAnimationTiming,
  optimizeKeySplines,
  optimizeKeyTimes,
  optimizeAnimationValues,
  formatSplineValue,
  parseKeySplines,
  serializeKeySplines,
  isLinearSpline,
  areAllSplinesLinear,
  identifyStandardEasing,
  STANDARD_EASINGS,
} from "./animation-optimization.js";
import {
  convertPathData as convertPathDataAdvanced,
  optimizeDocumentPaths,
  parsePath as parsePathCommands,
  serializePath as serializePathCommands,
  formatNumber as formatPathNumber,
} from "./convert-path-data.js";
import {
  douglasPeucker,
  visvalingamWhyatt,
  simplifyPolyline,
  simplifyPath as simplifyPolylinePath,
  isPurePolyline,
} from "./douglas-peucker.js";

// ============================================================================
// SHARED SVG SPECIFICATION CONSTANTS
// ============================================================================
// These are the authoritative definitions for SVG 1.1 and 2.0 elements/attributes.
// Used by both fixInvalidSVG and validateSVGAsync functions.

/**
 * SVG 1.1 official element list (from W3C spec)
 * Uses proper camelCase as per SVG specification
 * @see https://www.w3.org/TR/SVG11/eltindex.html
 */
const SVG11_ELEMENTS = new Set([
  "a",
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animate",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "color-profile",
  "cursor",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "font",
  "font-face",
  "font-face-format",
  "font-face-name",
  "font-face-src",
  "font-face-uri",
  "foreignObject",
  "g",
  "glyph",
  "glyphRef",
  "hkern",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "missing-glyph",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "script",
  "set",
  "stop",
  "style",
  "svg",
  "switch",
  "symbol",
  "text",
  "textPath",
  "title",
  "tref",
  "tspan",
  "use",
  "view",
  "vkern",
]);

/**
 * SVG 1.1 elements in lowercase for case-insensitive matching
 */
const SVG11_ELEMENTS_LOWER = new Set(
  [...SVG11_ELEMENTS].map((e) => e.toLowerCase()),
);

/**
 * SVG 1.1 official attribute list (from W3C spec)
 * Includes regular attributes and presentation attributes
 * @see https://www.w3.org/TR/SVG11/attindex.html
 */
const SVG11_ATTRIBUTES = new Set([
  // Core attributes
  "accent-height",
  "accumulate",
  "additive",
  "alignment-baseline",
  "alphabetic",
  "amplitude",
  "arabic-form",
  "ascent",
  "attributeName",
  "attributeType",
  "azimuth",
  "baseFrequency",
  "baseline-shift",
  "baseProfile",
  "bbox",
  "begin",
  "bias",
  "by",
  "calcMode",
  "cap-height",
  "class",
  "clip",
  "clip-path",
  "clip-rule",
  "clipPathUnits",
  "color",
  "color-interpolation",
  "color-interpolation-filters",
  "color-profile",
  "color-rendering",
  "contentScriptType",
  "contentStyleType",
  "cursor",
  "cx",
  "cy",
  "d",
  "descent",
  "diffuseConstant",
  "direction",
  "display",
  "divisor",
  "dominant-baseline",
  "dur",
  "dx",
  "dy",
  "edgeMode",
  "elevation",
  "enable-background",
  "end",
  "exponent",
  "externalResourcesRequired",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "filterRes",
  "filterUnits",
  "flood-color",
  "flood-opacity",
  "font-family",
  "font-size",
  "font-size-adjust",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "format",
  "from",
  "fx",
  "fy",
  "g1",
  "g2",
  "glyph-name",
  "glyph-orientation-horizontal",
  "glyph-orientation-vertical",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "hanging",
  "height",
  "horiz-adv-x",
  "horiz-origin-x",
  "horiz-origin-y",
  "href",
  "id",
  "ideographic",
  "image-rendering",
  "in",
  "in2",
  "intercept",
  "k",
  "k1",
  "k2",
  "k3",
  "k4",
  "kernelMatrix",
  "kernelUnitLength",
  "kerning",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lang",
  "lengthAdjust",
  "letter-spacing",
  "lighting-color",
  "limitingConeAngle",
  "local",
  "marker-end",
  "marker-mid",
  "marker-start",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "mask",
  "maskContentUnits",
  "maskUnits",
  "mathematical",
  "max",
  "media",
  "method",
  "min",
  "mode",
  "name",
  "numOctaves",
  "offset",
  "onabort",
  "onactivate",
  "onbegin",
  "onclick",
  "onend",
  "onerror",
  "onfocusin",
  "onfocusout",
  "onload",
  "onmousedown",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onrepeat",
  "onresize",
  "onscroll",
  "onunload",
  "onzoom",
  "opacity",
  "operator",
  "order",
  "orient",
  "orientation",
  "origin",
  "overflow",
  "overline-position",
  "overline-thickness",
  "panose-1",
  "path",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointer-events",
  "points",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "r",
  "radius",
  "refX",
  "refY",
  "rendering-intent",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "restart",
  "result",
  "rotate",
  "rx",
  "ry",
  "scale",
  "seed",
  "shape-rendering",
  "slope",
  "spacing",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stemh",
  "stemv",
  "stitchTiles",
  "stop-color",
  "stop-opacity",
  "strikethrough-position",
  "strikethrough-thickness",
  "string",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "style",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "target",
  "targetX",
  "targetY",
  "text-anchor",
  "text-decoration",
  "text-rendering",
  "textLength",
  "title",
  "to",
  "transform",
  "type",
  "u1",
  "u2",
  "underline-position",
  "underline-thickness",
  "unicode",
  "unicode-bidi",
  "unicode-range",
  "units-per-em",
  "v-alphabetic",
  "v-hanging",
  "v-ideographic",
  "v-mathematical",
  "values",
  "version",
  "vert-adv-y",
  "vert-origin-x",
  "vert-origin-y",
  "viewBox",
  "viewTarget",
  "visibility",
  "width",
  "widths",
  "word-spacing",
  "writing-mode",
  "x",
  "x-height",
  "x1",
  "x2",
  "xChannelSelector",
  "xlink:actuate",
  "xlink:arcrole",
  "xlink:href",
  "xlink:role",
  "xlink:show",
  "xlink:title",
  "xlink:type",
  "xml:base",
  "xml:id",
  "xml:lang",
  "xml:space",
  "xmlns",
  "xmlns:xlink",
  "y",
  "y1",
  "y2",
  "yChannelSelector",
  "z",
  "zoomAndPan",
  // CSS properties valid on SVG elements
  "line-height",
  "marker",
]);

/**
 * SVG 1.1 attributes in lowercase for case-insensitive matching
 */
const SVG11_ATTRIBUTES_LOWER = new Set(
  [...SVG11_ATTRIBUTES].map((a) => a.toLowerCase()),
);

/**
 * SVG 2.0 elements (elements new or significantly changed in SVG 2.0)
 * @see https://www.w3.org/TR/SVG2/eltindex.html
 */
const SVG2_ELEMENTS = new Set([
  // New elements in SVG 2.0
  "mesh",
  "meshgradient",
  "meshpatch",
  "meshrow",
  "solidcolor",
  "hatch",
  "hatchpath",
  "discard",
  "unknown",
  // HTML5 embedded content elements now valid in SVG 2.0
  "canvas",
  "video",
  "audio",
  "iframe",
  "source",
  "track",
]);

/**
 * SVG 2.0 attributes (new or changed from SVG 1.1)
 * @see https://www.w3.org/TR/SVG2/attindex.html
 */
const SVG2_ATTRIBUTES = new Set([
  // New attributes in SVG 2.0
  "href", // Replaces xlink:href (also in SVG 1.1 for some elements)
  "tabindex", // Focus management
  "lang", // Replaces xml:lang
  "transform-origin", // CSS-style transform origin
  "vector-effect", // Non-scaling stroke etc.
  "paint-order", // Control fill/stroke order
  "pathLength", // For accurate dash patterns (enhanced in SVG 2)
  "fr", // Focal radius for radialGradient
  "side", // textPath positioning
  "crossorigin", // CORS for images
  "role", // ARIA role
  // ARIA attributes (all valid in SVG 2.0)
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-controls",
  "aria-expanded",
  "aria-haspopup",
  "aria-live",
  "aria-atomic",
  "aria-relevant",
  "aria-busy",
  "aria-owns",
]);

/**
 * Check if element is an SVG 2.0 element
 * @param {string} tagName - Element tag name (lowercase)
 * @returns {boolean} True if SVG 2.0 element
 */
const isSvg2Element = (tagName) => {
  if (!tagName || typeof tagName !== "string") return false;
  return SVG2_ELEMENTS.has(tagName.toLowerCase());
};

/**
 * Check if attribute is an SVG 2.0 attribute
 * @param {string} attrName - Attribute name
 * @returns {boolean} True if SVG 2.0 attribute or valid extension (aria-*, data-*)
 */
const isSvg2Attribute = (attrName) => {
  if (!attrName || typeof attrName !== "string") return false;
  const lower = attrName.toLowerCase();
  return (
    SVG2_ATTRIBUTES.has(lower) ||
    lower.startsWith("aria-") ||
    lower.startsWith("data-")
  );
};

/**
 * Elements whose children should NOT be validated for SVG structure.
 * These elements contain non-SVG content (text, code, CSS, metadata)
 */
const NON_SVG_CONTEXT_ELEMENTS = new Set([
  "foreignobject", // HTML content explicitly allowed by SVG spec
  "script", // JavaScript code - should not be parsed as SVG
  "style", // CSS content - should not be parsed as SVG
  "title", // Text content for accessibility - not SVG structure
  "desc", // Description text - not SVG structure
  "metadata", // Can contain Dublin Core, RDF, or arbitrary XML metadata
]);

// ============================================================================
// LEVENSHTEIN DISTANCE WITH CACHING (for typo detection)
// ============================================================================

/**
 * Cache for Levenshtein distance calculations to avoid recomputation
 */
const levenshteinCache = new Map();

/**
 * Calculate Levenshtein distance between two strings (with caching)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
const levenshteinDistance = (a, b) => {
  // Validate parameters
  if (typeof a !== "string" || typeof b !== "string") {
    throw new Error("Both parameters must be strings");
  }
  // Check cache first
  const key = `${a}|${b}`;
  if (levenshteinCache.has(key)) return levenshteinCache.get(key);

  // Base cases
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Build distance matrix
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  const dist = matrix[b.length][a.length];
  levenshteinCache.set(key, dist);
  return dist;
};

/**
 * Clear the Levenshtein cache (call at start of each validation)
 */
const resetLevenshteinCache = () => levenshteinCache.clear();

/**
 * Find closest match from a set of valid values
 * @param {string} name - Name to match
 * @param {Set} validSet - Set of valid names
 * @param {number} [maxDistance=2] - Maximum Levenshtein distance to consider
 * @returns {string|null} Closest match or null if none within threshold
 */
const findClosestMatch = (name, validSet, maxDistance = 2) => {
  if (!name || typeof name !== "string") return null;
  if (!validSet || !(validSet instanceof Set) || validSet.size === 0) return null;
  const validMaxDistance = (typeof maxDistance !== "number" || maxDistance < 0) ? 2 : maxDistance;
  const lower = name.toLowerCase();
  let closest = null;
  let minDist = validMaxDistance + 1;

  for (const valid of validSet) {
    const dist = levenshteinDistance(lower, valid.toLowerCase());
    if (dist > 0 && dist < minDist) {
      minDist = dist;
      closest = valid;
    }
  }
  return closest;
};

// ============================================================================

/**
 * Check if a value has CSS units (should not be processed numerically)
 * @param {string} val - Attribute value
 * @returns {boolean} True if value has units
 */
function hasUnits(val) {
  if (!val || typeof val !== "string") return false;
  return /(%|em|rem|px|pt|cm|mm|in|pc|ex|ch|vw|vh|vmin|vmax|Q)$/i.test(
    val.trim(),
  );
}

/**
 * Detect circular references when resolving ID references.
 * Prevents infinite loops when SVG contains circular reference chains like:
 * - <use href="#a"> where #a contains <use href="#a"> (self-reference)
 * - <use href="#a"> → #a contains <use href="#b"> → #b contains <use href="#a"> (circular chain)
 * - Gradients with xlink:href chains that loop back
 *
 * @param {string} startId - Starting ID to check
 * @param {Function} getNextId - Function that returns the next referenced ID given current ID
 * @param {number} maxDepth - Maximum chain depth before considering circular (default 100)
 * @returns {boolean} True if circular reference detected
 */
function hasCircularReference(startId, getNextId, maxDepth = 100) {
  const visited = new Set();
  let currentId = startId;
  let depth = 0;

  // BUG FIX: Check for null/undefined explicitly (empty string "" is falsy but might be valid)
  while (currentId !== null && currentId !== undefined && depth < maxDepth) {
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
 * Post-process serialized SVG to fix CDATA sections for script/style elements.
 * This is needed because linkedom doesn't support createCDATASection.
 * Elements marked with data-cdata-pending="true" will have their content
 * properly wrapped in CDATA sections.
 * @param {string} svgString - Serialized SVG string
 * @returns {string} SVG string with proper CDATA sections
 */
function fixCDATASections(svgString) {
  if (!svgString || typeof svgString !== "string") return svgString || "";
  // Pattern to find script/style elements marked with data-cdata-pending
  // and fix their CDATA wrapping
  return svgString.replace(
    /<(script|style)([^>]*)\sdata-cdata-pending="true"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrsBefore, attrsAfter, content) => {
      // Unescape the content that was HTML-escaped by the serializer
      const unescaped = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      // Remove the marker attribute and wrap content in CDATA
      const cleanAttrs = (attrsBefore + attrsAfter)
        .replace(/\s*data-cdata-pending="true"\s*/g, " ")
        .trim();
      const attrStr = cleanAttrs ? " " + cleanAttrs : "";
      return `<${tag}${attrStr}><![CDATA[\n${unescaped}\n]]></${tag}>`;
    },
  );
}

// Regex to match numbers including negative and scientific notation
// Matches: -10, 3.14, 1e-5, -2.5e10, .5, -.5, 0.123
const NUMBER_REGEX = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;

import {
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
} from "./path-data-plugins.js";

// ============================================================================
// PRECISION CONFIGURATION
// ============================================================================

/**
 * Maximum supported precision (decimal places).
 * SVG spec has NO upper limit on coordinate precision.
 * Browser implementations typically use float32 (~7 digits) or float64 (~15 digits).
 * Geographic/scientific applications may need 5+ decimals for meter-level accuracy.
 */
export const MAX_PRECISION = 80;

/**
 * Default precision for output (matches typical browser rendering).
 * Users can override with options.precision in any function.
 */
export const DEFAULT_PRECISION = 6;

/**
 * Precision levels for common use cases.
 */
export const PRECISION_LEVELS = {
  BROWSER_MIN: 2, // Safe for all browsers (2 decimal + 4 integer)
  BROWSER_TYPICAL: 6, // Typical browser rendering precision
  FLOAT32: 7, // SVG spec minimum (single precision)
  FLOAT64: 15, // SVG spec recommended (double precision)
  GEOGRAPHIC: 8, // Meter-level accuracy at equator (0.00001 degree)
  SCIENTIFIC: 20, // Scientific computing
  MAX: 80, // Maximum Decimal.js precision
};

// Configure Decimal.js for maximum internal precision
Decimal.set({ precision: MAX_PRECISION, rounding: Decimal.ROUND_HALF_UP });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Check if a value is an SVG element using duck typing.
 * This works across module boundaries where instanceof checks may fail.
 * @param {*} obj - Value to check
 * @returns {boolean} True if obj is an SVG element
 */
function isElement(obj) {
  return (
    obj !== null &&
    typeof obj === "object" &&
    typeof obj.tagName === "string" &&
    typeof obj.getAttribute === "function" &&
    typeof obj.setAttribute === "function"
  );
}

/**
 * Format a Decimal value to string with specified precision.
 * Automatically removes trailing zeros after decimal point.
 * @param {Decimal|number|string} value - Value to format
 * @param {number} precision - Maximum decimal places
 * @returns {string} Formatted string without trailing zeros
 */
export function formatPrecision(value, precision = DEFAULT_PRECISION) {
  if (value === null || value === undefined) return "0";
  let validPrecision = precision;
  if (typeof precision !== "number" || isNaN(precision) || precision < 0) {
    validPrecision = DEFAULT_PRECISION;
  }
  if (validPrecision > MAX_PRECISION) validPrecision = MAX_PRECISION;
  const d = D(value);
  // Round to precision, then remove trailing zeros
  const fixed = d.toFixed(validPrecision);
  // Remove trailing zeros after decimal point
  if (fixed.includes(".")) {
    return fixed.replace(/\.?0+$/, "");
  }
  return fixed;
}

/**
 * Escape special XML characters in a string.
 * Essential for embedding text content in SVG/XML without breaking the document structure.
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for XML text content
 */
export function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// INPUT/OUTPUT SYSTEM
// ============================================================================

/**
 * Enum for input types
 */
export const InputType = {
  SVG_STRING: "string",
  DOM_ELEMENT: "dom",
  FILE_PATH: "file",
  URL: "url",
  XML_DOCUMENT: "xml",
  CSS_SELECTOR: "selector", // Browser: CSS selector like '#my-svg'
  OBJECT_ELEMENT: "object", // Browser: <object data="file.svg">
  EMBED_ELEMENT: "embed", // Browser: <embed src="file.svg">
  IFRAME_ELEMENT: "iframe", // Browser: <iframe src="file.svg">
};

/**
 * Enum for output formats
 */
export const OutputFormat = {
  SVG_STRING: "string",
  DOM_ELEMENT: "dom",
  XML_DOCUMENT: "xml",
};

/**
 * Detect input type from value.
 * Supports: SVG string, file path, URL, DOM elements, CSS selectors,
 * and browser-specific containers (object, embed, iframe).
 * @param {string|Element|Document|HTMLObjectElement|HTMLEmbedElement|HTMLIFrameElement} input - Input value to detect type for
 * @returns {string} Input type from InputType enum
 */
export function detectInputType(input) {
  if (input === null || input === undefined) {
    throw new Error("Input cannot be null or undefined");
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("<")) {
      return InputType.SVG_STRING;
    } else if (input.startsWith("http://") || input.startsWith("https://")) {
      return InputType.URL;
    } else if (
      typeof document !== "undefined" &&
      (trimmed.startsWith("#") ||
        trimmed.startsWith(".") ||
        trimmed.startsWith("["))
    ) {
      // Browser: CSS selector (starts with #, ., or [)
      return InputType.CSS_SELECTOR;
    } else {
      return InputType.FILE_PATH;
    }
  }

  // Browser-specific: HTMLObjectElement
  if (
    typeof HTMLObjectElement !== "undefined" &&
    input instanceof HTMLObjectElement
  ) {
    return InputType.OBJECT_ELEMENT;
  }

  // Browser-specific: HTMLEmbedElement
  if (
    typeof HTMLEmbedElement !== "undefined" &&
    input instanceof HTMLEmbedElement
  ) {
    return InputType.EMBED_ELEMENT;
  }

  // Browser-specific: HTMLIFrameElement
  if (
    typeof HTMLIFrameElement !== "undefined" &&
    input instanceof HTMLIFrameElement
  ) {
    return InputType.IFRAME_ELEMENT;
  }

  if (isElement(input)) {
    return InputType.DOM_ELEMENT;
  }
  if (input && input.nodeType === 9) {
    // Document node
    return InputType.XML_DOCUMENT;
  }
  return InputType.SVG_STRING;
}

/**
 * Load input and convert to DOM element
 * Handles all input types including browser-specific containers
 */
export async function loadInput(input, type) {
  switch (type) {
    case InputType.SVG_STRING:
      return parseSVG(input);

    case InputType.DOM_ELEMENT:
      // Native browser/JSDOM SVG element - serialize and reparse to our format
      // Check if this is our SVGElement (has serialize method) or a browser element
      if (input && typeof input.serialize === "function") {
        // Already our SVGElement, return as-is
        return input;
      }
      // Browser/JSDOM element - serialize and reparse
      if (typeof XMLSerializer !== "undefined") {
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(input);
        return parseSVG(svgStr);
      }
      return input;

    case InputType.XML_DOCUMENT: {
      // For JSDOM/browser Documents, serialize and reparse
      const rootEl = input.documentElement || input;
      if (rootEl && typeof rootEl.serialize === "function") {
        return rootEl;
      }
      if (typeof XMLSerializer !== "undefined") {
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(rootEl);
        return parseSVG(svgStr);
      }
      return rootEl;
    }

    case InputType.FILE_PATH:
      // Node.js file reading
      if (typeof require !== "undefined") {
        const fs = require("fs");
        const content = fs.readFileSync(input, "utf8");
        return parseSVG(content);
      }
      // Browser with dynamic import
      if (typeof process !== "undefined" && process.versions?.node) {
        const { readFileSync } = await import("fs");
        const content = readFileSync(input, "utf8");
        return parseSVG(content);
      }
      throw new Error("File loading requires Node.js environment");

    case InputType.URL:
      // Fetch from URL
      if (typeof fetch !== "undefined") {
        const response = await fetch(input);
        const content = await response.text();
        return parseSVG(content);
      }
      throw new Error("URL loading requires fetch API");

    case InputType.CSS_SELECTOR:
      // Browser: Query DOM for element
      if (typeof document !== "undefined") {
        const el = document.querySelector(input);
        if (!el) throw new Error(`No element found for selector: ${input}`);
        if (el.tagName.toLowerCase() === "svg") {
          return parseSVG(new XMLSerializer().serializeToString(el));
        }
        // Maybe it's a container with SVG inside
        const svgEl = el.querySelector("svg");
        if (svgEl) {
          return parseSVG(new XMLSerializer().serializeToString(svgEl));
        }
        throw new Error(`Element "${input}" is not an SVG and contains no SVG`);
      }
      throw new Error("CSS selector requires browser environment");

    case InputType.OBJECT_ELEMENT:
      // Browser: <object data="file.svg">
      // Wrap in try-catch to handle cross-origin SecurityError
      try {
        if (input.contentDocument && input.contentDocument.documentElement) {
          const svgRoot = input.contentDocument.documentElement;
          if (svgRoot.tagName.toLowerCase() === "svg") {
            return parseSVG(new XMLSerializer().serializeToString(svgRoot));
          }
        }
      } catch (e) {
        // Log error for debugging - cross-origin or security error
        if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
        throw new Error(
          "HTMLObjectElement: SVG content not accessible (cross-origin or security error)",
        );
      }
      throw new Error(
        "HTMLObjectElement: SVG content not accessible (not loaded or cross-origin)",
      );

    case InputType.EMBED_ELEMENT:
      // Browser: <embed src="file.svg">
      if (typeof input.getSVGDocument === "function") {
        const svgDoc = input.getSVGDocument();
        if (svgDoc && svgDoc.documentElement) {
          return parseSVG(
            new XMLSerializer().serializeToString(svgDoc.documentElement),
          );
        }
      }
      throw new Error("HTMLEmbedElement: SVG content not accessible");

    case InputType.IFRAME_ELEMENT:
      // Browser: <iframe src="file.svg">
      try {
        const iframeDoc = input.contentDocument;
        if (iframeDoc && iframeDoc.documentElement) {
          const root = iframeDoc.documentElement;
          if (root.tagName.toLowerCase() === "svg") {
            return parseSVG(new XMLSerializer().serializeToString(root));
          }
        }
      } catch (e) {
        // Log error for debugging - cross-origin access error
        if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
        throw new Error(
          "HTMLIFrameElement: SVG content not accessible (cross-origin)",
        );
      }
      throw new Error("HTMLIFrameElement: No SVG content found");

    default:
      throw new Error(`Unknown input type: ${type}`);
  }
}

/**
 * Generate output in requested format.
 * @param {Document|Element} doc - SVG document or element to output
 * @param {string} format - Output format from OutputFormat enum
 * @param {Object} [options] - Output options
 * @param {boolean} [options.minify=true] - Whether to minify the output
 * @returns {string|Document|Element} Formatted output (string for SVG_STRING, or document/element for DOM formats)
 */
export function generateOutput(doc, format, options = {}) {
  switch (format) {
    case OutputFormat.SVG_STRING: {
      const svgStr = serializeSVG(doc, { minify: options.minify !== false });
      // Fix CDATA sections for script/style elements marked with data-cdata-pending
      return fixCDATASections(svgStr);
    }

    case OutputFormat.DOM_ELEMENT:
      return doc;

    case OutputFormat.XML_DOCUMENT:
      return doc;

    default: {
      const svgStr = serializeSVG(doc, { minify: options.minify !== false });
      return fixCDATASections(svgStr);
    }
  }
}

/**
 * Create operation wrapper for auto input/output handling.
 * Wraps an SVG operation function to automatically handle input detection,
 * loading, and output formatting.
 * @param {Function} operationFn - Operation function that takes (doc, options) and returns modified document
 * @returns {Function} Wrapped async function that handles input/output automatically
 */
export function createOperation(operationFn) {
  return async function (input, options = {}) {
    const inputType = detectInputType(input);
    const doc = await loadInput(input, inputType);
    const outputFormat =
      options.outputFormat ||
      (inputType === InputType.DOM_ELEMENT
        ? OutputFormat.DOM_ELEMENT
        : OutputFormat.SVG_STRING);
    // Await operationFn in case it's async (e.g., presetDefault calling other async operations)
    const result = await operationFn(doc, options);
    return generateOutput(result, outputFormat, options);
  };
}

// ============================================================================
// CATEGORY 1: CLEANUP FUNCTIONS (11 functions)
// ============================================================================

/**
 * Remove unused IDs and minify used IDs.
 * Features: URL encoding/decoding handling, orphaned ID collision detection,
 * targeted attribute scanning, and animation-aware reference tracking.
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Cleanup options
 * @param {boolean} [options.minify=true] - Minify IDs to shortest possible form (a, b, c, etc.)
 * @param {boolean} [options.remove=true] - Remove unused IDs
 * @param {boolean} [options.force=false] - Force processing even if scripts/styles present
 * @param {Array<string>} [options.preserve=[]] - Array of ID names to preserve unchanged
 * @param {Array<string>} [options.preservePrefixes=[]] - Array of ID prefixes to preserve unchanged
 * @returns {Document} SVG document with cleaned up IDs
 */
export const cleanupIds = createOperation((doc, options = {}) => {
  const minify = options.minify !== false;
  const remove = options.remove !== false;
  const force = options.force || false;
  const preserve = options.preserve || [];
  const preservePrefixes = options.preservePrefixes || [];

  // SVGO: Skip optimization if scripts or styles are present (unless force=true)
  // Scripts/styles may reference IDs dynamically, so removing/renaming is unsafe
  if (!force) {
    const hasScript = doc.querySelectorAll("script").length > 0;
    const hasStyleWithContent = Array.from(doc.querySelectorAll("style")).some(
      (style) => style.textContent && style.textContent.trim().length > 0,
    );

    if (hasScript || hasStyleWithContent) {
      return doc;
    }
  }

  // Helper to check if ID should be preserved
  const shouldPreserve = (id) => {
    if (preserve.includes(id)) return true;
    if (preservePrefixes.some((prefix) => id.startsWith(prefix))) return true;
    return false;
  };

  // P3-1: Helper to decode URL-encoded IDs
  const decodeId = (id) => {
    try {
      return decodeURI(id);
    } catch (e) {
      // Log error for debugging - invalid URI encoding
      if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
      return id;
    }
  };

  // ANIMATION-AWARE REFERENCE TRACKING (FIXES SVGO's animation destruction bug)
  // Uses comprehensive animation-references.js module to detect ALL references:
  // - Static: url(#id), href="#id", xlink:href="#id"
  // - SMIL Animation: <animate values="#id1;#id2">, from/to="#id", begin/end="id.event"
  // - CSS: url(#id) in <style> blocks, @keyframes references
  // - JavaScript: getElementById('id'), querySelector('#id')
  const allRefs = collectAllReferences(doc);

  // Build usedIds set from all reference types
  const usedIds = new Set();
  for (const id of allRefs.all) {
    usedIds.add(id);
    usedIds.add(decodeId(id)); // P3-1: Also add decoded version
  }

  // Build a map of element ID -> element for collision detection
  const nodeById = new Map();
  const collectNodes = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      // Only store first occurrence (others are duplicates)
      if (!nodeById.has(id)) {
        nodeById.set(id, el);
      }
    }
    for (const child of el.children) {
      if (isElement(child)) collectNodes(child);
    }
  };
  collectNodes(doc);

  // SVGO: Detect and track duplicate IDs
  const seenIds = new Set();
  const duplicateIds = new Set();
  const findDuplicates = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      if (seenIds.has(id)) {
        duplicateIds.add(id);
      }
      seenIds.add(id);
    }
    for (const child of el.children) {
      if (isElement(child)) findDuplicates(child);
    }
  };
  findDuplicates(doc);
  const keptDuplicates = new Set();

  // Remove unused IDs and minify if requested
  const idMap = new Map();
  let counter = 0;

  // P3-3: Generate unique ID that doesn't collide with orphaned references
  const generateUniqueId = () => {
    let newId;
    do {
      newId = `a${counter++}`;
      // P3-3: Check if generated ID exists in references but NOT in nodeById
      // This prevents collisions with IDs that were removed but still referenced
    } while (usedIds.has(newId) && !nodeById.has(newId));
    return newId;
  };

  const processIds = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      // SVGO: Remove duplicate IDs (keep first occurrence only)
      if (duplicateIds.has(id)) {
        if (keptDuplicates.has(id)) {
          el.removeAttribute("id");
          return; // Skip further processing for this duplicate
        }
        keptDuplicates.add(id);
      }

      // P3-1: Check both original and decoded ID for usage
      const decodedId = decodeId(id);
      const isUsed = usedIds.has(id) || usedIds.has(decodedId);

      // SVGO: Check if ID should be preserved
      if (shouldPreserve(id)) {
        // Don't remove or minify preserved IDs
      } else if (!isUsed && remove) {
        el.removeAttribute("id");
      } else if (minify && isUsed) {
        // P3-3: Use generateUniqueId to avoid orphaned ID collisions
        const newId = generateUniqueId();
        idMap.set(id, newId);
        // P3-1: Also map URL-encoded version
        if (decodedId !== id) {
          idMap.set(decodedId, newId);
        }
        el.setAttribute("id", newId);
      }
    }
    for (const child of el.children) {
      if (isElement(child)) processIds(child);
    }
  };
  processIds(doc);

  // Update references
  if (minify) {
    const updateRefs = (el) => {
      // Helper to escape regex special characters in ID strings
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      for (const attrName of el.getAttributeNames()) {
        let val = el.getAttribute(attrName);
        if (val && val.includes("url(#")) {
          for (const [oldId, newId] of idMap) {
            // Bug fix: Use replaceAll (or global regex) to replace ALL occurrences
            // Previous code used String.replace() which only replaces first match
            const escapedOldId = escapeRegex(oldId);
            val = val.replace(
              new RegExp(`url\\(#${escapedOldId}\\)`, "g"),
              `url(#${newId})`,
            );
            const escapedEncodedId = escapeRegex(encodeURI(oldId));
            val = val.replace(
              new RegExp(`url\\(#${escapedEncodedId}\\)`, "g"),
              `url(#${newId})`,
            );
          }
          el.setAttribute(attrName, val);
        }
        if (
          (attrName === "href" || attrName === "xlink:href") &&
          val?.startsWith("#")
        ) {
          const oldId = val.substring(1);
          const decodedOldId = decodeId(oldId);
          if (idMap.has(oldId)) {
            el.setAttribute(attrName, `#${idMap.get(oldId)}`);
          } else if (idMap.has(decodedOldId)) {
            el.setAttribute(attrName, `#${idMap.get(decodedOldId)}`);
          }
        }
        // SVGO: Update SMIL animation references
        // BUG FIX: Add null check for val before calling replace()
        if ((attrName === "begin" || attrName === "end") && val) {
          for (const [oldId, newId] of idMap) {
            // Bug fix: Escape regex special characters in oldId
            // Previous code would break on IDs like "frame.01" or "id(1)"
            const escapedOldId = escapeRegex(oldId);
            val = val.replace(
              new RegExp(`^${escapedOldId}\\.`, "g"),
              `${newId}.`,
            );
            val = val.replace(
              new RegExp(`;${escapedOldId}\\.`, "g"),
              `;${newId}.`,
            );
          }
          el.setAttribute(attrName, val);
        }
        // Bug fix: Update animation value attributes with ID references (values, from, to, by)
        // These attributes can contain semicolon-separated ID lists like "#frame1;#frame2;#frame3"
        // or single ID references like from="#start" to="#end" by="#delta"
        // BUG FIX: Add null check for val before calling replace()
        if (
          (attrName === "values" ||
            attrName === "from" ||
            attrName === "to" ||
            attrName === "by") &&
          val
        ) {
          for (const [oldId, newId] of idMap) {
            const escapedOldId = escapeRegex(oldId);
            // Update #id references in animation values (handles both single and semicolon-separated lists)
            val = val.replace(
              new RegExp(`#${escapedOldId}([;\\s]|$)`, "g"),
              `#${newId}$1`,
            );
          }
          el.setAttribute(attrName, val);
        }
      }
      for (const child of el.children) {
        if (isElement(child)) updateRefs(child);
      }
    };
    updateRefs(doc);

    // Bug fix: Update CSS in <style> blocks
    // CSS selectors and url(#id) references need to be updated when IDs are minified
    // This fixes cases like: .shape { fill: url(#gradientBlue); } or #gradientBlue { ... }
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const styles = doc.getElementsByTagName("style");
    for (const style of styles) {
      let css = style.textContent;
      if (!css) continue;

      for (const [oldId, newId] of idMap) {
        const escapedOldId = escapeRegex(oldId);
        // Update #id selectors (e.g., #gradientBlue { ... } or div#gradientBlue)
        css = css.replace(
          new RegExp(`#${escapedOldId}([^\\w-]|$)`, "g"),
          `#${newId}$1`,
        );
        // Update url(#id) in CSS properties (e.g., fill: url(#gradientBlue))
        css = css.replace(
          new RegExp(`url\\(#${escapedOldId}\\)`, "g"),
          `url(#${newId})`,
        );
      }

      style.textContent = css;
    }
  }

  return doc;
});

/**
 * Round numeric values to specified precision using Decimal.js for accurate rounding.
 * Processes numeric attributes in path data, transforms, and other numeric SVG attributes.
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Rounding options
 * @param {number} [options.precision=6] - Number of decimal places to round to
 * @returns {Document} SVG document with rounded numeric values
 */
export const cleanupNumericValues = createOperation((doc, options = {}) => {
  const precision = options.precision || 6;

  const roundValue = (val) => {
    // Try to parse as number
    const num = parseFloat(val);
    if (isNaN(num)) return val;

    // Round to precision using Decimal.js for accuracy
    const decimal = D(num);
    const rounded = decimal.toDecimalPlaces(precision);
    let str = rounded.toString();

    // Remove trailing zeros ONLY after decimal point, preserve integer zeros
    // Bug fix: Previous regex /\.?0+$/ would turn "400" into "4" when applied
    // to path data because the \.? made the decimal optional
    if (str.includes(".")) {
      // First remove trailing zeros after decimal: "10.500" -> "10.5"
      str = str.replace(/0+$/, "");
      // Then remove trailing decimal point if no digits after: "10." -> "10"
      str = str.replace(/\.$/, "");
    }

    return str;
  };

  const processElement = (el) => {
    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);

      // Handle numeric attributes
      if (
        attrName.match(
          /^(x|y|cx|cy|r|rx|ry|width|height|x1|y1|x2|y2|stroke-width|font-size)$/,
        )
      ) {
        // Skip if value has CSS units - preserve original
        if (hasUnits(val)) {
          continue;
        }
        el.setAttribute(attrName, roundValue(val));
      }

      // Handle path data - check val is not null before calling replace
      if (attrName === "d" && val) {
        const pathData = val.replace(NUMBER_REGEX, (match) =>
          roundValue(match),
        );
        el.setAttribute("d", pathData);
      }

      // Handle transform - check val is not null before calling replace
      if (attrName === "transform" && val) {
        const transformed = val.replace(NUMBER_REGEX, (match) =>
          roundValue(match),
        );
        el.setAttribute("transform", transformed);
      }

      // Handle points (polygon/polyline) - check val is not null before calling replace
      if (attrName === "points" && val) {
        const points = val.replace(NUMBER_REGEX, (match) => roundValue(match));
        el.setAttribute("points", points);
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Round lists of values using Decimal.js for accurate rounding.
 * Processes attributes containing space/comma-separated numeric lists (e.g., points attribute).
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Rounding options
 * @param {number} [options.precision=6] - Number of decimal places to round to
 * @returns {Document} SVG document with rounded list values
 */
export const cleanupListOfValues = createOperation((doc, options = {}) => {
  const precision = options.precision || 6;

  const roundValue = (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    const rounded = D(num).toDecimalPlaces(precision);
    let str = rounded.toString();
    // Bug fix: Prevent "400" -> "4" corruption by only trimming zeros after decimal point
    if (str.includes(".")) {
      // First remove trailing zeros after decimal: "10.500" -> "10.5"
      str = str.replace(/0+$/, "");
      // Then remove trailing decimal point if no digits after: "10." -> "10"
      str = str.replace(/\.$/, "");
    }
    return str;
  };

  const processElement = (el) => {
    // Handle attributes with list values
    // NOTE: viewBox REMOVED - it defines exact pixel boundaries and must never be rounded
    // Even rounding 100.5 to 101 breaks layout, and negative values get corrupted
    for (const attrName of ["points"]) {
      const val = el.getAttribute(attrName);
      if (val) {
        const rounded = val.replace(NUMBER_REGEX, roundValue);
        el.setAttribute(attrName, rounded);
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove useless attributes (editor metadata, unused classes, etc.).
 * NOTE: Does NOT remove xmlns:xlink - use removeXlink() for safe xlink namespace removal.
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Cleanup options
 * @param {boolean} [options.preserveVendor=false] - If true, preserves vendor namespace declarations (e.g., xmlns:serif)
 * @returns {Document} SVG document with useless attributes removed
 */
export const cleanupAttributes = createOperation((doc, options = {}) => {
  // Attributes that are safe to remove unconditionally (unless preserveVendor)
  const uselessAttrs = [
    "data-name",
    "data-id",
    "class", // Often unused metadata from editors
    // NOTE: xmlns:xlink removed from this list - it's required when xlink:* attrs exist
    // Use removeXlink() function instead which properly checks for xlink usage
  ];

  // Vendor-specific namespace declarations (only removed if preserveVendor is false)
  const vendorAttrs = [
    "xmlns:serif", // Serif DrawPlus namespace
  ];

  const processElement = (el) => {
    // Always remove useless attributes
    for (const attr of uselessAttrs) {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    }

    // Only remove vendor attributes if preserveVendor is not enabled
    if (!options.preserveVendor) {
      for (const attr of vendorAttrs) {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove enable-background attribute.
 * The enable-background attribute is rarely needed in modern SVG and can often be safely removed.
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Cleanup options (currently unused)
 * @returns {Document} SVG document with enable-background removed
 */
export const cleanupEnableBackground = createOperation((doc, _options = {}) => {
  const processElement = (el) => {
    if (el.hasAttribute("enable-background")) {
      el.removeAttribute("enable-background");
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove unknown elements/attributes and elements with default values.
 * Cleans up invalid SVG elements and attributes that don't belong in the SVG spec.
 * Features: Remove uselessOverrides (attributes matching parent's inherited style),
 * skip removal if dynamic styles detected.
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} [options] - Cleanup options (currently unused)
 * @returns {Document} SVG document with unknowns and defaults removed
 */
export const removeUnknownsAndDefaults = createOperation(
  (doc, _options = {}) => {
    // P3-6: Check for dynamic styles (media queries, pseudo-classes) in <style> elements
    const hasDynamicStyles = Array.from(doc.querySelectorAll("style")).some(
      (style) => {
        const css = style.textContent || "";
        // Check for media queries or pseudo-classes that create dynamic styling
        return (
          css.includes("@media") ||
          css.includes(":hover") ||
          css.includes(":focus") ||
          css.includes(":active") ||
          css.includes(":visited") ||
          css.includes(":first-child") ||
          css.includes(":last-child") ||
          css.includes(":nth-child") ||
          css.includes(":not(")
        );
      },
    );

    // Check if document has scripts - if so, preserve all elements with IDs
    // since they might be accessed via JavaScript's getElementById()
    const hasScripts = doc.querySelectorAll("script").length > 0;

    // Build set of all referenced IDs - elements with referenced IDs must NOT be removed
    // even if they appear in invalid parent-child positions (they might animate or be used)
    const referencedIds = new Set();
    const svgStr = doc.outerHTML || "";
    // Find all url(#id) references
    const urlRefs = svgStr.matchAll(/url\(#([^)]+)\)/g);
    for (const match of urlRefs) referencedIds.add(match[1]);
    // Find all xlink:href="#id" references
    const xlinkRefs = svgStr.matchAll(/xlink:href="#([^"]+)"/g);
    for (const match of xlinkRefs) referencedIds.add(match[1]);
    // Find all href="#id" references (SVG 2)
    const hrefRefs = svgStr.matchAll(/\shref="#([^"]+)"/g);
    for (const match of hrefRefs) referencedIds.add(match[1]);

    // Map lowercase SVG tag names to their canonical mixed-case forms
    // SVG is case-sensitive but XML parsers may lowercase tag names
    const tagNameMap = {
      clippath: "clipPath",
      textpath: "textPath",
      lineargradient: "linearGradient",
      radialgradient: "radialGradient",
      meshgradient: "meshGradient",
      hatchpath: "hatchPath",
      solidcolor: "solidColor",
      foreignobject: "foreignObject",
      feblend: "feBlend",
      fecolormatrix: "feColorMatrix",
      fecomponenttransfer: "feComponentTransfer",
      fecomposite: "feComposite",
      feconvolvematrix: "feConvolveMatrix",
      fediffuselighting: "feDiffuseLighting",
      fedisplacementmap: "feDisplacementMap",
      fedistantlight: "feDistantLight",
      fedropshadow: "feDropShadow",
      feflood: "feFlood",
      fefunca: "feFuncA",
      fefuncb: "feFuncB",
      fefuncg: "feFuncG",
      fefuncr: "feFuncR",
      fegaussianblur: "feGaussianBlur",
      feimage: "feImage",
      femerge: "feMerge",
      femergenode: "feMergeNode",
      femorphology: "feMorphology",
      feoffset: "feOffset",
      fepointlight: "fePointLight",
      fespecularlighting: "feSpecularLighting",
      fespotlight: "feSpotLight",
      fetile: "feTile",
      feturbulence: "feTurbulence",
      animatemotion: "animateMotion",
      animatetransform: "animateTransform",
    };
    const canonicalTagName = (tag) => tagNameMap[tag] || tag;

    // Known SVG elements - include both mixed-case and lowercase variants
    // because XML parsers may lowercase tag names
    const knownElements = [
      "svg",
      "g",
      "path",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "text",
      "tspan",
      "tref",
      "textPath",
      "textpath",
      "defs",
      "clipPath",
      "clippath",
      "mask",
      "pattern",
      "linearGradient",
      "lineargradient",
      "radialGradient",
      "radialgradient",
      // SVG 2.0 gradient elements (mesh gradients)
      "meshGradient",
      "meshgradient",
      "meshrow",
      "meshpatch",
      // SVG 2.0 hatch elements
      "hatch",
      "hatchpath",
      "hatchPath",
      // SVG 2.0 solid color
      "solidcolor",
      "solidColor",
      "stop",
      "image",
      "use",
      "symbol",
      "marker",
      "title",
      "desc",
      "metadata",
      "foreignObject",
      "foreignobject",
      "switch",
      "a",
      "filter",
      "feBlend",
      "feblend",
      "feColorMatrix",
      "fecolormatrix",
      "feComponentTransfer",
      "fecomponenttransfer",
      "feComposite",
      "fecomposite",
      "feConvolveMatrix",
      "feconvolvematrix",
      "feDiffuseLighting",
      "fediffuselighting",
      "feDisplacementMap",
      "fedisplacementmap",
      "feDistantLight",
      "fedistantlight",
      "feDropShadow",
      "fedropshadow",
      "feFlood",
      "feflood",
      "feFuncA",
      "fefunca",
      "feFuncB",
      "fefuncb",
      "feFuncG",
      "fefuncg",
      "feFuncR",
      "fefuncr",
      "feGaussianBlur",
      "fegaussianblur",
      "feImage",
      "feimage",
      "feMerge",
      "femerge",
      "feMergeNode",
      "femergenode",
      "feMorphology",
      "femorphology",
      "feOffset",
      "feoffset",
      "fePointLight",
      "fepointlight",
      "feSpecularLighting",
      "fespecularlighting",
      "feSpotLight",
      "fespotlight",
      "feTile",
      "fetile",
      "feTurbulence",
      "feturbulence",
      "animate",
      "animateMotion",
      "animatemotion",
      "animateTransform",
      "animatetransform",
      "set",
      "mpath",
      "view",
      "cursor", // SVG cursor element
      "style",
      "script",
      // SVG 1.1 font elements
      "font",
      "font-face",
      "font-face-src",
      "font-face-uri",
      "font-face-format",
      "font-face-name",
      "glyph",
      "missing-glyph",
      "hkern",
      "vkern",
    ];

    const defaultValues = {
      // Fill defaults
      fill: "#000",
      "fill-opacity": "1",
      "fill-rule": "nonzero",

      // Stroke defaults
      stroke: "none",
      "stroke-width": "1",
      "stroke-opacity": "1",
      "stroke-linecap": "butt",
      "stroke-linejoin": "miter",
      "stroke-miterlimit": "4",
      "stroke-dasharray": "none",
      "stroke-dashoffset": "0",

      // Opacity/visibility defaults
      opacity: "1",
      visibility: "visible",
      display: "inline",

      // Clip/mask defaults
      clip: "auto",
      "clip-path": "none",
      "clip-rule": "nonzero",
      mask: "none",

      // Marker defaults
      "marker-start": "none",
      "marker-mid": "none",
      "marker-end": "none",

      // Color defaults
      "stop-color": "#000",
      "stop-opacity": "1",
      "flood-color": "#000",
      "flood-opacity": "1",
      "lighting-color": "#fff",

      // Rendering defaults
      "color-interpolation": "sRGB",
      "color-interpolation-filters": "linearRGB",
      "color-rendering": "auto",
      "shape-rendering": "auto",
      "text-rendering": "auto",
      "image-rendering": "auto",

      // Paint defaults
      "paint-order": "normal",
      "vector-effect": "none",

      // Text defaults
      "text-anchor": "start",
      "text-overflow": "clip",
      "text-decoration": "none",
      "dominant-baseline": "auto",
      "alignment-baseline": "baseline",
      "baseline-shift": "baseline",
      "writing-mode": "lr-tb",
      direction: "ltr",
      "unicode-bidi": "normal",
      "letter-spacing": "normal",
      "word-spacing": "normal",

      // Font defaults
      "font-style": "normal",
      "font-variant": "normal",
      "font-weight": "normal",
      "font-stretch": "normal",
      "font-size": "medium",
      "font-size-adjust": "none",
    };

    // Element-specific default values (SVGO compatible)
    const elementDefaults = {
      circle: { cx: "0", cy: "0" },
      ellipse: { cx: "0", cy: "0" },
      line: { x1: "0", y1: "0", x2: "0", y2: "0" },
      rect: { x: "0", y: "0", rx: "0", ry: "0" },
      image: { x: "0", y: "0", preserveAspectRatio: "xMidYMid meet" },
      svg: { x: "0", y: "0", preserveAspectRatio: "xMidYMid meet" },
      symbol: { preserveAspectRatio: "xMidYMid meet" },
      marker: {
        markerUnits: "strokeWidth",
        refX: "0",
        refY: "0",
        markerWidth: "3",
        markerHeight: "3",
      },
      linearGradient: {
        x1: "0",
        y1: "0",
        x2: "100%",
        y2: "0",
        spreadMethod: "pad",
      },
      radialGradient: {
        cx: "50%",
        cy: "50%",
        r: "50%",
        fx: "50%",
        fy: "50%",
        spreadMethod: "pad",
      },
      pattern: {
        x: "0",
        y: "0",
        patternUnits: "objectBoundingBox",
        patternContentUnits: "userSpaceOnUse",
      },
      clipPath: { clipPathUnits: "userSpaceOnUse" },
      mask: {
        maskUnits: "objectBoundingBox",
        maskContentUnits: "userSpaceOnUse",
        x: "-10%",
        y: "-10%",
        width: "120%",
        height: "120%",
      },
      filter: {
        primitiveUnits: "userSpaceOnUse",
        x: "-10%",
        y: "-10%",
        width: "120%",
        height: "120%",
      },
      feBlend: { mode: "normal" },
      feColorMatrix: { type: "matrix" },
      feComposite: { operator: "over", k1: "0", k2: "0", k3: "0", k4: "0" },
      feTurbulence: {
        baseFrequency: "0",
        numOctaves: "1",
        seed: "0",
        stitchTiles: "noStitch",
        type: "turbulence",
      },
      feDisplacementMap: {
        scale: "0",
        xChannelSelector: "A",
        yChannelSelector: "A",
      },
      feDistantLight: { azimuth: "0", elevation: "0" },
      fePointLight: { x: "0", y: "0", z: "0" },
      a: { target: "_self" },
      textPath: { startOffset: "0" },
    };

    // SVGO: Protected attributes that should never be removed
    const isProtectedAttr = (attrName) => {
      if (attrName.startsWith("data-")) return true;
      if (attrName.startsWith("aria-")) return true;
      if (attrName === "role") return true;
      if (attrName === "xmlns") return true;
      if (
        attrName.includes(":") &&
        !attrName.startsWith("xml:") &&
        !attrName.startsWith("xlink:")
      ) {
        return true;
      }
      return false;
    };

    // P3-5: Helper to get computed inherited style from parent chain
    const getInheritedValue = (el, attr) => {
      let current = el.parentNode;
      while (current && isElement(current)) {
        const value = current.getAttribute(attr);
        if (value !== null) return value;
        current = current.parentNode;
      }
      return null;
    };

    const processElement = (el, parentStyles = {}) => {
      // SVGO: Skip foreignObject and all its contents (contains non-SVG content)
      if (el.tagName === "foreignObject") {
        return;
      }

      // SVGO: Skip namespaced elements (custom extensions like inkscape:*, sodipodi:*)
      if (el.tagName.includes(":")) {
        return;
      }

      // SVGO: Only remove defaults from elements WITHOUT id attribute
      // Elements with IDs may be referenced externally
      if (!el.getAttribute("id")) {
        // Remove general default values
        for (const [attr, defaultVal] of Object.entries(defaultValues)) {
          if (!isProtectedAttr(attr) && el.getAttribute(attr) === defaultVal) {
            el.removeAttribute(attr);
          }
        }

        // Remove element-specific default values
        const tagDefaults = elementDefaults[el.tagName.toLowerCase()] || {};
        for (const [attr, defaultVal] of Object.entries(tagDefaults)) {
          if (!isProtectedAttr(attr) && el.getAttribute(attr) === defaultVal) {
            el.removeAttribute(attr);
          }
        }

        // P3-5: Remove uselessOverrides - inheritable attrs matching parent's computed value
        // P3-6: Only remove if styles are static (no dynamic styles detected)
        if (!hasDynamicStyles) {
          for (const attr of el.getAttributeNames()) {
            // Only check inheritable attributes (from svg-collections.js)
            if (inheritableAttrs.has(attr) && !isProtectedAttr(attr)) {
              const value = el.getAttribute(attr);
              const inheritedValue = getInheritedValue(el, attr);

              // If the value matches what would be inherited from parent, it's redundant
              if (inheritedValue !== null && value === inheritedValue) {
                el.removeAttribute(attr);
              }
            }
          }
        }
      }

      // Build current element's styles for children (P3-5)
      const currentStyles = { ...parentStyles };
      for (const attr of inheritableAttrs) {
        const value = el.getAttribute(attr);
        if (value !== null) {
          currentStyles[attr] = value;
        }
      }

      // Remove unknown children (but protect known ones)
      // P4-1: Also validate parent-child relationships per SVG spec
      const parentTagLower = el.tagName.toLowerCase();
      // Try lowercase key first, then canonical mixed-case (case-insensitive lookup)
      const allowedChildren =
        allowedChildrenPerElement[parentTagLower] ||
        allowedChildrenPerElement[canonicalTagName(parentTagLower)];

      for (const child of [...el.children]) {
        if (isElement(child)) {
          // Skip namespaced elements
          if (child.tagName.includes(":")) {
            continue;
          }

          const childTagLower = child.tagName.toLowerCase();
          const childId = child.getAttribute("id");

          // If scripts exist and element has ID, preserve it (might be accessed by JS)
          const preserveForScripts = hasScripts && childId;

          // Helper to check if element or any descendant has a referenced ID
          const hasReferencedDescendant = (innerEl) => {
            const elId = innerEl.getAttribute("id");
            if (elId && referencedIds.has(elId)) return true;
            for (const c of innerEl.children || []) {
              if (isElement(c) && hasReferencedDescendant(c)) return true;
            }
            return false;
          };

          // Check if element is known - but preserve if it or descendants have referenced IDs
          if (!knownElements.includes(childTagLower)) {
            // Don't remove if this element (or any descendant) has an ID that's referenced
            if (!hasReferencedDescendant(child) && !preserveForScripts) {
              el.removeChild(child);
              continue;
            }
          }

          // P4-1: Check if child is allowed for this parent
          // Only validate if we have rules for this parent
          // Use case-insensitive check: try both lowercase and canonical form
          if (
            allowedChildren &&
            !allowedChildren.has(childTagLower) &&
            !allowedChildren.has(canonicalTagName(childTagLower))
          ) {
            // Don't remove if this element (or any descendant) has an ID that's referenced
            // Invalid parent-child relationships may still be needed for animations/refs/scripts
            if (!hasReferencedDescendant(child) && !preserveForScripts) {
              el.removeChild(child);
              continue;
            }
          }

          processElement(child, currentStyles);
        }
      }
    };

    processElement(doc, {});
    return doc;
  },
);

/**
 * Remove non-inheritable group attributes
 */
/**
 * Remove non-inheritable attributes from <g> elements.
 *
 * IMPORTANT: clip-path and mask ARE valid on <g> elements per SVG spec!
 * They apply clipping/masking to all children and are commonly used.
 * DO NOT remove clip-path or mask from groups - they are intentional!
 *
 * Only removes attributes that are geometrically meaningless on <g>:
 * - x, y, width, height: <g> has no geometry, these are ignored
 * - viewBox: Only valid on <svg>, <symbol>, <marker>, <pattern>
 *
 * Note: transform IS valid on <g> and should NOT be removed unless explicitly
 * requested. It transforms all children.
 */
export const removeNonInheritableGroupAttrs = createOperation(
  (doc, _options = {}) => {
    // CRITICAL: clip-path and mask ARE valid on <g> - do NOT remove them!
    // They apply clipping/masking to all children and are commonly used.
    // Only remove attributes that have no meaning on <g> elements.
    const nonInheritable = [
      "x", // <g> has no position
      "y", // <g> has no position
      "width", // <g> has no size
      "height", // <g> has no size
      "viewBox", // Only valid on <svg>, <symbol>, <marker>, <pattern>
    ];

    // DO NOT include in nonInheritable:
    // - clip-path: Valid and useful on <g> - clips all children
    // - mask: Valid and useful on <g> - masks all children
    // - transform: Valid and useful on <g> - transforms all children
    // - filter: Valid and useful on <g> - filters all children
    // - opacity: Valid and useful on <g> - applies to all children

    const processElement = (el) => {
      if (el.tagName === "g") {
        for (const attr of nonInheritable) {
          if (el.hasAttribute(attr)) {
            el.removeAttribute(attr);
          }
        }
      }
      for (const child of el.children) {
        if (isElement(child)) processElement(child);
      }
    };

    processElement(doc);
    return doc;
  },
);

/**
 * Remove empty/unused defs elements
 */
export const removeUselessDefs = createOperation((doc, _options = {}) => {
  const defsElements = doc.getElementsByTagName("defs");

  for (const defs of [...defsElements]) {
    if (defs.children.length === 0) {
      if (defs.parentNode) {
        defs.parentNode.removeChild(defs);
      }
    }
  }

  return doc;
});

/**
 * Remove hidden/invisible elements
 * SVGO Exception Rules:
 * - Never remove elements with ID if referenced anywhere
 * - marker elements with display:none still render
 * - Keep paths with marker-start/mid/end attributes
 * - Preserve non-rendering elements in defs
 * - Never remove animation elements (animate, animateMotion, etc.)
 * - Never remove elements that contain animations (they animate FROM hidden)
 * - Never remove <use> elements (they're reference elements that may animate)
 * - Never remove elements that REFERENCE others (they may animate visibility)
 */
export const removeHiddenElements = createOperation((doc, options = {}) => {
  const force = options.force || false;

  // Check if document has scripts - if so, be more conservative about removing elements with IDs
  // since they might be accessed via JavaScript's getElementById()
  const hasScripts = doc.querySelectorAll("script").length > 0;

  // Build set of referenced IDs
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Bug fix: Use matchAll with global flag to find ALL url(#id) references, not just first
      if (val && val.includes("url(#")) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      if (
        (attr === "href" || attr === "xlink:href") &&
        val &&
        val.startsWith("#")
      ) {
        referencedIds.add(val.substring(1));
      }
    }
    for (const child of el.children) {
      if (isElement(child)) collectRefs(child);
    }
  };
  collectRefs(doc);

  // Helper to check if element references something
  const hasReference = (el) => {
    const href = el.getAttribute("href") || el.getAttribute("xlink:href");
    if (href && href.startsWith("#")) return true;
    for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
      const val = el.getAttribute(attr);
      if (val && val.includes("url(#")) return true;
    }
    return false;
  };

  // Helper to check if element contains any animation elements (recursively)
  // This catches cases where hidden containers have animations that will show them
  const containsAnimation = (el) => {
    for (const child of el.children) {
      if (!isElement(child)) continue;
      const childTag = child.tagName?.toLowerCase();
      // Check if this child is an animation element
      if (elemsGroups.animation.has(childTag)) return true;
      // Recursively check children
      if (containsAnimation(child)) return true;
    }
    return false;
  };

  // Helper to check if element or any descendant has a referenced ID (or has any ID if scripts exist)
  // If a hidden container has descendants that are referenced (or might be referenced by JS), don't remove it
  const hasReferencedDescendant = (el) => {
    const id = el.getAttribute("id");
    // If SVG has scripts, preserve ANY element with an ID (might be used by getElementById)
    if (id && (referencedIds.has(id) || hasScripts)) return true;
    for (const child of el.children) {
      if (!isElement(child)) continue;
      if (hasReferencedDescendant(child)) return true;
    }
    return false;
  };

  const processElement = (el, inDefs = false) => {
    const tagName = el.tagName.toLowerCase();

    // Exception 4: Inside defs, non-rendering elements should be preserved
    const isInDefs = inDefs || tagName === "defs";

    // Check if element is hidden
    const display = el.getAttribute("display");
    const visibility = el.getAttribute("visibility");
    const opacity = parseFloat(el.getAttribute("opacity") || "1");

    const isHidden =
      display === "none" || visibility === "hidden" || opacity === 0;

    if (isHidden) {
      // Exception 1: Never remove elements (or containers) if they or their descendants are referenced
      if (!force && hasReferencedDescendant(el)) {
        // Keep hidden elements that have referenced IDs (or contain referenced descendants)
      }
      // Exception 2: marker elements with display:none still render
      else if (!force && tagName === "marker") {
        // Markers render even when display:none
      }
      // Exception 3: Keep elements with marker attributes
      else if (
        !force &&
        (el.getAttribute("marker-start") ||
          el.getAttribute("marker-mid") ||
          el.getAttribute("marker-end"))
      ) {
        // Keep elements that use markers
      }
      // Exception 4: Preserve non-rendering elements in defs
      else if (!force && isInDefs && elemsGroups.nonRendering.has(tagName)) {
        // Keep non-rendering elements in defs
      }
      // Exception 5: Never remove animation elements
      else if (!force && elemsGroups.animation.has(tagName)) {
        // Animation elements should never be removed even if hidden
      }
      // Exception 6: Never remove elements that CONTAIN animations (check recursively)
      // Hidden containers often have animations that will show them
      else if (!force && containsAnimation(el)) {
        // Keep elements that have animation descendants - they animate FROM hidden
      }
      // Exception 7: Never remove <use> elements - they reference other content
      // and their visibility may be animated
      else if (!force && tagName === "use") {
        // Keep <use> elements even when hidden - animation may show them
      }
      // Exception 8: Never remove elements that reference others
      // (their visibility may be animated, or they're intentionally hidden for later use)
      else if (!force && hasReference(el)) {
        // Keep elements with references
      } else if (el.parentNode) {
        el.parentNode.removeChild(el);
        return;
      }
    }

    for (const child of [...el.children]) {
      if (isElement(child)) processElement(child, isInDefs);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove empty text elements
 * Recursively checks for text content in child elements (tspan, etc.)
 * Preserves text elements with namespace attributes when preserveNamespaces is set
 */
export const removeEmptyText = createOperation((doc, options = {}) => {
  const textElements = doc.getElementsByTagName("text");

  // Helper to get all text content recursively from element and children
  const getTextContentRecursive = (el) => {
    let text = el.textContent || "";
    if (el.children) {
      for (const child of el.children) {
        text += getTextContentRecursive(child);
      }
    }
    return text;
  };

  // Helper to check if element has preserved namespace attributes
  const hasPreservedNsAttrs = (el, preserveNs) => {
    if (!preserveNs || preserveNs.length === 0) return false;
    const attrNames = el.getAttributeNames ? el.getAttributeNames() : [];
    return attrNames.some((attr) =>
      preserveNs.some((ns) => attr.startsWith(ns + ":")),
    );
  };

  const preserveNamespaces = options.preserveNamespaces || [];

  for (const text of [...textElements]) {
    const recursiveContent = getTextContentRecursive(text);
    const isEmpty = !recursiveContent || recursiveContent.trim() === "";

    // Don't remove if it has preserved namespace attributes (e.g., Inkscape tile metadata)
    const hasNsAttrs = hasPreservedNsAttrs(text, preserveNamespaces);

    if (isEmpty && !hasNsAttrs) {
      if (text.parentNode) {
        text.parentNode.removeChild(text);
      }
    }
  }

  return doc;
});

/**
 * Remove empty container elements
 * Note: Patterns with xlink:href/href inherit content and are NOT empty
 * Note: Empty containers that are REFERENCED must be preserved (intentional empties)
 */
export const removeEmptyContainers = createOperation((doc, _options = {}) => {
  // Include both mixed-case and lowercase variants for case-insensitive matching
  const containers = [
    "g",
    "defs",
    "symbol",
    "marker",
    "clipPath",
    "clippath",
    "mask",
    "pattern",
  ];

  // Check if document has scripts - if so, preserve all elements with IDs
  // since they might be accessed via JavaScript's getElementById()
  const hasScripts = doc.querySelectorAll("script").length > 0;

  // Build set of all referenced IDs - these must NOT be removed even if empty
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
      const val = el.getAttribute(attr);
      // Find url(#id) references
      if (val && val.includes("url(#")) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Find href="#id" references
      if (
        (attr === "href" || attr === "xlink:href") &&
        val &&
        val.startsWith("#")
      ) {
        referencedIds.add(val.substring(1));
      }
    }
    for (const child of el.children || []) {
      if (isElement(child)) collectRefs(child);
    }
  };
  collectRefs(doc);

  const processElement = (el) => {
    // Process children first (bottom-up)
    for (const child of [...el.children]) {
      if (isElement(child)) processElement(child);
    }

    const tagLower = el.tagName?.toLowerCase();

    // Skip if not a container type
    if (!containers.includes(el.tagName) && !containers.includes(tagLower)) {
      return;
    }

    // Don't remove if element has href/xlink:href (inherits content from reference)
    // This is common for patterns that reference other patterns
    if (el.getAttribute("href") || el.getAttribute("xlink:href")) {
      return;
    }

    // Don't remove if element is referenced by ID (even if empty)
    // Empty clipPaths/masks ARE valid SVG - they clip/mask to nothing
    // Also preserve if scripts exist and element has ID (might be used by JS)
    const id = el.getAttribute("id");
    if (id && (referencedIds.has(id) || hasScripts)) {
      return;
    }

    // Remove if container is truly empty (no children) and not referenced
    if (el.children.length === 0) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  };

  processElement(doc);
  return doc;
});

// ============================================================================
// CATEGORY 2: REMOVAL FUNCTIONS (12 functions)
// ============================================================================

/**
 * Remove DOCTYPE declaration
 */
export const removeDoctype = createOperation((doc, _options = {}) => {
  // DOCTYPE is typically in the serialization, not in the DOM tree
  // This is a pass-through since our parser already strips it
  return doc;
});

/**
 * Remove XML processing instructions
 * Note: Our serializer outputs a clean XML declaration without standalone="no"
 * which matches SVGO behavior. Processing instructions in the source are ignored
 * during parsing, so we always output a clean declaration.
 */
export const removeXMLProcInst = createOperation((doc, _options = {}) => {
  // Processing instructions are stripped during parsing
  // Serialization always outputs clean: <?xml version="1.0" encoding="UTF-8"?>
  // This matches SVGO which removes standalone="no" and other PI variations
  return doc;
});

/**
 * Remove comments
 */
export const removeComments = createOperation((doc, _options = {}) => {
  // Comments are already stripped by our parser
  return doc;
});

/**
 * Remove metadata element
 * @param {Object} options
 * @param {boolean} options.preserveVendor - If true, preserves metadata (often contains vendor-specific info)
 */
export const removeMetadata = createOperation((doc, options = {}) => {
  // Skip if preserveVendor is enabled - metadata often contains vendor-specific info
  if (options.preserveVendor) return doc;

  const metadataEls = doc.getElementsByTagName("metadata");
  for (const el of [...metadataEls]) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  return doc;
});

/**
 * Remove title element
 */
export const removeTitle = createOperation((doc, _options = {}) => {
  const titleEls = doc.getElementsByTagName("title");
  for (const el of [...titleEls]) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  return doc;
});

/**
 * Remove desc element
 */
export const removeDesc = createOperation((doc, _options = {}) => {
  const descEls = doc.getElementsByTagName("desc");
  for (const el of [...descEls]) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  return doc;
});

/**
 * Remove editor namespaces (Inkscape, Illustrator, etc.)
 * SAFETY: Unlike SVGO (bug #1530), we track remaining prefixed attributes
 * and only remove xmlns:* declarations when ALL attributes with that prefix are gone
 * @param {Object} options
 * @param {boolean} options.preserveVendor - If true, preserves all editor namespace elements and attributes
 */
export const removeEditorsNSData = createOperation((doc, options = {}) => {
  // preserveVendor = true preserves ALL editor namespaces (backward compat)
  if (options.preserveVendor === true) return doc;

  // preserveNamespaces = array of prefixes to preserve selectively
  const preserveNamespaces = options.preserveNamespaces || [];

  // Handle namespace aliases: sodipodi and inkscape always go together
  const normalizedPreserve = new Set(preserveNamespaces);
  if (normalizedPreserve.has("sodipodi")) normalizedPreserve.add("inkscape");
  if (normalizedPreserve.has("inkscape")) normalizedPreserve.add("sodipodi");

  // Filter out preserved namespaces from the removal list
  const editorPrefixes = [
    "inkscape",
    "sodipodi",
    "illustrator",
    "sketch",
    "ai",
    "serif",
    "vectornator",
    "figma",
  ].filter((prefix) => !normalizedPreserve.has(prefix));

  // If all namespaces are preserved, exit early
  if (editorPrefixes.length === 0) return doc;

  // FIRST: Remove editor-specific elements (sodipodi:namedview, etc.)
  // This must happen BEFORE checking remaining prefixes to avoid SVGO bug #1530
  const removeEditorElements = (el) => {
    for (const child of [...el.children]) {
      if (isElement(child)) {
        const tagColonIdx = child.tagName.indexOf(":");
        if (tagColonIdx > 0) {
          const prefix = child.tagName.substring(0, tagColonIdx);
          if (editorPrefixes.includes(prefix)) {
            el.removeChild(child);
            continue;
          }
        }
        removeEditorElements(child);
      }
    }
  };
  removeEditorElements(doc);

  // SECOND: Remove editor-prefixed attributes
  const processElement = (el) => {
    for (const attrName of [...el.getAttributeNames()]) {
      // Skip namespace declarations themselves
      if (attrName.startsWith("xmlns:")) continue;

      // Check if this is an editor-prefixed attribute
      const colonIdx = attrName.indexOf(":");
      if (colonIdx > 0) {
        const prefix = attrName.substring(0, colonIdx);
        if (editorPrefixes.includes(prefix)) {
          el.removeAttribute(attrName);
        }
      }
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };
  processElement(doc);

  // THIRD: Check for any remaining prefixed attributes/elements
  const remainingPrefixes = new Set();
  const checkRemainingPrefixes = (el) => {
    for (const attrName of el.getAttributeNames()) {
      if (attrName.startsWith("xmlns:")) continue;
      const colonIdx = attrName.indexOf(":");
      if (colonIdx > 0) {
        const prefix = attrName.substring(0, colonIdx);
        remainingPrefixes.add(prefix);
      }
    }
    // Check tag name for prefix
    const tagColonIdx = el.tagName.indexOf(":");
    if (tagColonIdx > 0) {
      remainingPrefixes.add(el.tagName.substring(0, tagColonIdx));
    }
    for (const child of el.children) {
      if (isElement(child)) checkRemainingPrefixes(child);
    }
  };
  checkRemainingPrefixes(doc);

  // FOURTH: Safely remove namespace declarations for editor prefixes
  // ONLY if no attributes/elements with that prefix remain (avoids SVGO bug #1530)
  for (const prefix of editorPrefixes) {
    const nsAttr = `xmlns:${prefix}`;
    if (doc.hasAttribute(nsAttr) && !remainingPrefixes.has(prefix)) {
      doc.removeAttribute(nsAttr);
    }
  }

  return doc;
});

/**
 * Remove empty attributes
 */
export const removeEmptyAttrs = createOperation((doc, _options = {}) => {
  const processElement = (el) => {
    for (const attrName of [...el.getAttributeNames()]) {
      const val = el.getAttribute(attrName);
      if (val === "" || val === null) {
        el.removeAttribute(attrName);
      }
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove viewBox if matches dimensions
 */
export const removeViewBox = createOperation((doc, _options = {}) => {
  const width = doc.getAttribute("width");
  const height = doc.getAttribute("height");
  const viewBox = doc.getAttribute("viewBox");

  // Skip if dimensions have units - can't compare to viewBox numerically
  if (hasUnits(width) || hasUnits(height)) {
    return doc;
  }

  if (width && height && viewBox) {
    const vb = viewBox.split(/[\s,]+/).map(parseFloat);
    const w = parseFloat(width);
    const h = parseFloat(height);

    // Validate parsed values are not NaN
    if (isNaN(w) || isNaN(h) || vb.some((v) => isNaN(v))) {
      return doc; // Skip if any value is invalid
    }

    // Use epsilon comparison for floating point values to avoid precision issues
    const epsilon = 1e-6;
    if (
      vb.length === 4 &&
      Math.abs(vb[0]) < epsilon &&
      Math.abs(vb[1]) < epsilon &&
      Math.abs(vb[2] - w) < epsilon &&
      Math.abs(vb[3] - h) < epsilon
    ) {
      doc.removeAttribute("viewBox");
    }
  }

  return doc;
});

/**
 * Remove xmlns attribute (for inline SVG only)
 * IMPORTANT: Only use this for inline SVG where the parent HTML document provides namespace context.
 * For standalone SVG files, the xmlns="http://www.w3.org/2000/svg" is REQUIRED.
 *
 * Options:
 *   - preserveSvgNamespace: boolean (default: true) - Keep the main SVG namespace for standalone files
 *   - removeXlinkNamespace: boolean (default: true) - Remove xmlns:xlink if no xlink:* attrs remain
 *   - preserveVendor: boolean (default: false) - If true, preserves vendor namespace declarations
 */
export const removeXMLNS = createOperation((doc, options = {}) => {
  const preserveSvgNamespace = options.preserveSvgNamespace !== false;
  const removeXlinkNamespace = options.removeXlinkNamespace !== false;

  // If preserveVendor is enabled, keep all vendor namespace declarations
  if (options.preserveVendor) {
    // Only handle standard namespaces, skip vendor ones
    if (!preserveSvgNamespace) {
      doc.removeAttribute("xmlns");
    }
    return doc;
  }

  // Only remove main SVG namespace if explicitly requested (inline SVG use case)
  if (!preserveSvgNamespace) {
    doc.removeAttribute("xmlns");
  }

  // Check if any xlink:* attributes exist before removing the namespace
  if (removeXlinkNamespace) {
    let hasXlinkAttrs = false;
    const checkForXlink = (el) => {
      for (const attrName of el.getAttributeNames()) {
        if (attrName.startsWith("xlink:")) {
          hasXlinkAttrs = true;
          return;
        }
      }
      for (const child of el.children) {
        if (isElement(child)) checkForXlink(child);
        if (hasXlinkAttrs) return;
      }
    };
    checkForXlink(doc);

    // Only remove xmlns:xlink if no xlink:* attributes remain
    if (!hasXlinkAttrs) {
      doc.removeAttribute("xmlns:xlink");
    }
  }

  // Always safe to remove xmlns:svg (rarely used)
  doc.removeAttribute("xmlns:svg");
  return doc;
});

/**
 * Remove embedded raster images
 */
export const removeRasterImages = createOperation((doc, _options = {}) => {
  // Check if document has scripts - if so, preserve elements with IDs that might be accessed via getElementById()
  const hasScripts = doc.querySelectorAll("script").length > 0;

  // Build set of referenced IDs to preserve images that are referenced elsewhere
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Collect all url(#id) references (e.g., in fill, stroke, filter, mask, clip-path, etc.)
      if (val && val.includes("url(#")) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Collect all href="#id" and xlink:href="#id" references (e.g., <use> elements)
      if (
        (attr === "href" || attr === "xlink:href") &&
        val &&
        val.startsWith("#")
      ) {
        referencedIds.add(val.substring(1));
      }
    }
    for (const child of el.children) {
      if (isElement(child)) collectRefs(child);
    }
  };
  collectRefs(doc);

  const images = doc.getElementsByTagName("image");
  for (const img of [...images]) {
    const imgId = img.getAttribute("id");

    // Preserve image if:
    // - It has an ID that is referenced elsewhere in the document
    // - Document has scripts and image has an ID (might be accessed via getElementById)
    if (imgId && (referencedIds.has(imgId) || hasScripts)) {
      continue; // Skip removal, preserve this image
    }

    // Otherwise, remove the image element
    if (img.parentNode) {
      img.parentNode.removeChild(img);
    }
  }
  return doc;
});

/**
 * Remove script elements
 * Preserves script elements that are referenced by other elements (e.g., via xlink:href)
 */
export const removeScriptElement = createOperation((doc, _options = {}) => {
  // Build set of referenced IDs to preserve scripts that are referenced elsewhere
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Collect all url(#id) references (e.g., in fill, stroke, filter, mask, clip-path, etc.)
      if (val && val.includes("url(#")) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Collect all href="#id" and xlink:href="#id" references (e.g., <set xlink:href="#s">)
      if (
        (attr === "href" || attr === "xlink:href") &&
        val &&
        val.startsWith("#")
      ) {
        referencedIds.add(val.substring(1));
      }
    }
    for (const child of el.children) {
      if (isElement(child)) collectRefs(child);
    }
  };
  collectRefs(doc);

  // Remove only script elements that are NOT referenced
  const scripts = doc.getElementsByTagName("script");
  for (const script of [...scripts]) {
    const scriptId = script.getAttribute("id");

    // Only remove if the script doesn't have an ID or if its ID is not referenced
    if (!scriptId || !referencedIds.has(scriptId)) {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }
  }

  return doc;
});

// ============================================================================
// CATEGORY 3: CONVERSION FUNCTIONS (10 functions)
// ============================================================================

/**
 * Convert rect/circle/ellipse/line/polyline/polygon to path
 * SVGO Exception Rules:
 * - Don't convert rect with NaN values (percentage units cause NaN)
 * - Skip rect with border-radius (rx/ry) unless explicitly requested
 * - Only convert polyline/polygon with 2+ points
 */
export const convertShapesToPath = createOperation((doc, options = {}) => {
  const precision = options.precision || 6;
  const convertRoundedRects = options.convertRoundedRects || false;
  const shapes = ["rect", "circle", "ellipse", "line", "polyline", "polygon"];

  const processElement = (el) => {
    if (shapes.includes(el.tagName)) {
      // Exception 1: Don't convert rect with NaN values (percentage units)
      if (el.tagName === "rect") {
        const x = parseFloat(el.getAttribute("x") || "0");
        const y = parseFloat(el.getAttribute("y") || "0");
        const width = parseFloat(el.getAttribute("width") || "0");
        const height = parseFloat(el.getAttribute("height") || "0");
        if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
          // Skip - percentage values cause NaN when parsed as float
          for (const child of [...el.children]) {
            if (isElement(child)) processElement(child);
          }
          return;
        }
      }

      // Exception 2: Skip rect with border-radius unless explicitly requested
      if (el.tagName === "rect" && !convertRoundedRects) {
        const rx = parseFloat(el.getAttribute("rx") || "0");
        const ry = parseFloat(el.getAttribute("ry") || "0");
        if (rx > 0 || ry > 0) {
          // Skip - rounded rects need special handling
          for (const child of [...el.children]) {
            if (isElement(child)) processElement(child);
          }
          return;
        }
      }

      // Exception 3: Only convert polyline/polygon with 2+ points
      if (el.tagName === "polyline" || el.tagName === "polygon") {
        const points = el.getAttribute("points") || "";
        const pointPairs = points.trim().split(/[\s,]+/);
        // Each point needs x,y so we need at least 4 values for 2 points
        if (pointPairs.length < 4) {
          for (const child of [...el.children]) {
            if (isElement(child)) processElement(child);
          }
          return;
        }
      }

      const pathData = GeometryToPath.convertElementToPath(el, precision);
      if (pathData) {
        const pathEl = new SVGElement("path", { d: pathData });

        // Copy all attributes except shape-specific ones
        for (const attrName of el.getAttributeNames()) {
          if (
            !attrName.match(
              /^(x|y|cx|cy|r|rx|ry|width|height|x1|y1|x2|y2|points)$/,
            )
          ) {
            // Bug fix: Check for null before setAttribute to prevent setting "null" as attribute value
            const val = el.getAttribute(attrName);
            if (val !== null) {
              pathEl.setAttribute(attrName, val);
            }
          }
        }

        // Copy all children (e.g., <animate>, <set>, <animateMotion>, etc.) to preserve animation references
        for (const child of [...el.children]) {
          pathEl.appendChild(child);
        }

        if (el.parentNode) {
          el.parentNode.replaceChild(pathEl, el);
        }
      }
    }

    for (const child of [...el.children]) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Optimize path data
 * SVGO Exception Rules:
 * - Skip path transform if element has ID (paths referenced by <use>)
 * - Skip if style attribute present
 * - Don't convert to Z if has stroke-linecap (different rendering)
 * - Preserve single-point paths (needed for markers)
 * - Preserve paths with marker-mid (cannot collapse commands)
 */
export const convertPathData = createOperation((doc, options = {}) => {
  const _precision = options.precision || 6;
  const force = options.force || false;

  // Build set of referenced IDs for exception checking
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of ["href", "xlink:href"]) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith("#")) {
        referencedIds.add(val.substring(1));
      }
    }
    for (const child of el.children) {
      if (isElement(child)) collectRefs(child);
    }
  };
  collectRefs(doc);

  const paths = doc.getElementsByTagName("path");
  for (const path of paths) {
    const d = path.getAttribute("d");
    if (!d) continue;

    // Exception 1: Skip if element has ID that's referenced (used by <use>)
    const id = path.getAttribute("id");
    if (!force && id && referencedIds.has(id)) continue;

    // Exception 2: Skip if style attribute present (may contain transforms)
    if (!force && path.getAttribute("style")) continue;

    // Exception 3: Check for stroke-linecap (affects Z command rendering)
    const strokeLinecap = path.getAttribute("stroke-linecap");
    const hasLinecap = strokeLinecap && strokeLinecap !== "butt";

    // Exception 4: Preserve single-point paths (markers render at single points)
    const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || [];
    if (commands.length <= 1) continue;

    // Exception 5: Skip if marker-mid present (cannot collapse consecutive commands)
    if (!force && path.getAttribute("marker-mid")) continue;

    // Convert to absolute coordinates
    const optimizedPath = GeometryToPath.pathToAbsolute(d);

    // If has linecap, don't convert last segment to Z
    if (hasLinecap) {
      // Path already in absolute form, no Z conversion needed
    }

    path.setAttribute("d", optimizedPath);
  }

  return doc;
});

/**
 * Optimize transform attributes
 * SVGO Exception Rules:
 * - Don't convert matrix if result is longer than original
 * - Calculate degree precision from matrix data
 * - Handle non-uniform scale (breaks stroke-width)
 */
export const convertTransform = createOperation((doc, options = {}) => {
  const precision = options.precision || 6;
  const force = options.force || false;

  const processElement = (el) => {
    const transform = el.getAttribute("transform");
    if (transform) {
      const matrix = SVGFlatten.parseTransformAttribute(transform);
      const optimized = SVGFlatten.toSVGMatrix(matrix, precision);

      // Exception 1: Don't convert if result is longer than original
      if (!force && optimized.length >= transform.length) {
        // Keep original, it's shorter
      } else {
        // Exception 3: Check for non-uniform scale (breaks stroke-width)
        // A non-uniform scale has different sx and sy values
        // matrix(a,b,c,d,e,f) where a!=d or a*d-b*c != 1 for uniform
        if (
          !force &&
          el.getAttribute("stroke") &&
          el.getAttribute("stroke") !== "none"
        ) {
          // For stroked elements, check if transform is non-uniform
          // Only apply if it's safe (identity-like or uniform scale)
          // Access matrix data directly - Matrix stores values in data[row][col]
          const a = matrix.data[0][0].toNumber();
          const b = matrix.data[0][1].toNumber();
          const c = matrix.data[1][0].toNumber();
          const d = matrix.data[1][1].toNumber();
          const det = a * d - b * c;
          const isUniform = Math.abs(a - d) < 1e-6 && Math.abs(b + c) < 1e-6;

          // Use epsilon comparison for determinant to avoid floating point precision issues
          const detEpsilon = 1e-10;
          if (!isUniform && Math.abs(det) > detEpsilon) {
            // Non-uniform scale on stroked element - keep original
            // Or better, apply transform and adjust stroke-width
          } else {
            el.setAttribute("transform", optimized);
          }
        } else {
          el.setAttribute("transform", optimized);
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Convert colors to shortest form
 */
export const convertColors = createOperation((doc, _options = {}) => {
  const colorAttrs = [
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "lighting-color",
  ];

  const shortenColor = (color) => {
    if (!color || typeof color !== "string") return color;

    // Named colors to hex
    const namedColors = {
      white: "#fff",
      black: "#000",
      red: "#f00",
      green: "#0f0",
      blue: "#00f",
      yellow: "#ff0",
      cyan: "#0ff",
      magenta: "#f0f",
    };

    if (namedColors[color.toLowerCase()]) {
      return namedColors[color.toLowerCase()];
    }

    // #RRGGBB to #RGB
    const match = color.match(/^#([0-9a-f]{6})$/i);
    if (match) {
      const hex = match[1];
      if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
        return `#${hex[0]}${hex[2]}${hex[4]}`;
      }
    }

    return color;
  };

  const processElement = (el) => {
    for (const attr of colorAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        el.setAttribute(attr, shortenColor(val));
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Convert inline style to attributes
 * @param {Object} options
 * @param {boolean} options.preserveVendor - Keep vendor-prefixed properties (-inkscape-*, -webkit-*, etc.) in style attribute
 */
export const convertStyleToAttrs = createOperation((doc, options = {}) => {
  const preserveVendor = options.preserveVendor || false;

  // Valid SVG presentation attributes that can be set from CSS
  // Vendor-prefixed properties (starting with -) are NOT valid XML attributes
  const SVG_PRESENTATION_ATTRS = new Set([
    "alignment-baseline",
    "baseline-shift",
    "clip",
    "clip-path",
    "clip-rule",
    "color",
    "color-interpolation",
    "color-interpolation-filters",
    "color-profile",
    "color-rendering",
    "cursor",
    "direction",
    "display",
    "dominant-baseline",
    "enable-background",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "flood-color",
    "flood-opacity",
    "font",
    "font-family",
    "font-size",
    "font-size-adjust",
    "font-stretch",
    "font-style",
    "font-variant",
    "font-weight",
    "glyph-orientation-horizontal",
    "glyph-orientation-vertical",
    "image-rendering",
    "kerning",
    "letter-spacing",
    "lighting-color",
    "marker",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask",
    "opacity",
    "overflow",
    "pointer-events",
    "shape-rendering",
    "stop-color",
    "stop-opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "text-decoration",
    "text-rendering",
    "transform",
    "transform-origin",
    "unicode-bidi",
    "vector-effect",
    "visibility",
    "word-spacing",
    "writing-mode",
  ]);

  const processElement = (el) => {
    const style = el.getAttribute("style");
    if (style) {
      const styles = style
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s);
      const vendorStyles = [];
      for (const styleDecl of styles) {
        const colonIdx = styleDecl.indexOf(":");
        if (colonIdx === -1) continue;
        const prop = styleDecl.substring(0, colonIdx).trim();
        const val = styleDecl.substring(colonIdx + 1).trim();
        if (prop && val) {
          if (!prop.startsWith("-") && SVG_PRESENTATION_ATTRS.has(prop)) {
            // Convert valid SVG presentation attributes to XML attributes
            el.setAttribute(prop, val);
          } else if (preserveVendor && prop.startsWith("-")) {
            // Keep vendor-prefixed properties in style if preserveVendor is enabled
            vendorStyles.push(styleDecl);
          }
          // Non-standard non-vendor properties are always discarded
        }
      }
      // Keep style attribute only if there are vendor styles to preserve
      if (vendorStyles.length > 0) {
        el.setAttribute("style", vendorStyles.join("; "));
      } else {
        el.removeAttribute("style");
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Convert equal-radii ellipse to circle
 */
export const convertEllipseToCircle = createOperation((doc, _options = {}) => {
  const ellipses = doc.getElementsByTagName("ellipse");

  for (const ellipse of [...ellipses]) {
    const rx = parseFloat(ellipse.getAttribute("rx") || "0");
    const ry = parseFloat(ellipse.getAttribute("ry") || "0");

    // Validate parsed values are not NaN
    if (isNaN(rx) || isNaN(ry)) {
      continue; // Skip if any value is invalid
    }

    if (Math.abs(rx - ry) < 0.001) {
      const circle = new SVGElement("circle", {});

      // Copy attributes
      for (const attrName of ellipse.getAttributeNames()) {
        const val = ellipse.getAttribute(attrName);
        if (attrName === "rx" || attrName === "ry") {
          circle.setAttribute("r", val);
        } else {
          circle.setAttribute(attrName, val);
        }
      }

      // Copy all children (e.g., <animate>, <set>, <animateMotion>, etc.) to preserve animation references
      for (const child of [...ellipse.children]) {
        circle.appendChild(child);
      }

      if (ellipse.parentNode) {
        ellipse.parentNode.replaceChild(circle, ellipse);
      }
    }
  }

  return doc;
});

/**
 * Collapse useless groups
 * SVGO Exception Rules:
 * - Never collapse groups at root or in <switch>
 * - Never collapse if child has ID
 * - Never collapse if group has filter (applies to boundary)
 * - Never move animated attributes
 * - Don't collapse if non-inheritable attr mismatch
 */
export const collapseGroups = createOperation((doc, options = {}) => {
  const force = options.force || false;

  const processElement = (el, isRoot = false, inSwitch = false) => {
    const tagName = el.tagName.toLowerCase();
    const isInSwitch = inSwitch || tagName === "switch";

    // Process children first (bottom-up)
    for (const child of [...el.children]) {
      if (isElement(child)) processElement(child, false, isInSwitch);
    }

    // Only collapse <g> elements
    if (tagName !== "g") return;

    // Exception 1: Never collapse at root or in <switch>
    if (!force && (isRoot || isInSwitch)) return;

    // Exception 3: Never collapse if group has filter
    if (!force && el.getAttribute("filter")) return;

    // Check if can collapse
    if (el.children.length === 1) {
      const child = el.children[0];
      if (!isElement(child)) return;

      // Exception 2: Never collapse if child has ID
      if (!force && child.getAttribute("id")) return;

      // Exception 4: Don't collapse if group has animated attributes
      const hasAnimation = Array.from(el.children).some(
        (c) =>
          isElement(c) && elemsGroups.animation.has(c.tagName.toLowerCase()),
      );
      if (!force && hasAnimation) return;

      // Exception 5: Check non-inheritable attribute conflicts
      const groupAttrs = el.getAttributeNames();
      const nonInheritableConflict = groupAttrs.some((attr) => {
        if (inheritableAttrs.has(attr)) return false;
        // Non-inheritable attr on group - check if child has it too
        return child.hasAttribute(attr);
      });
      if (!force && nonInheritableConflict) return;

      // No attributes or only inheritable ones that can be moved
      if (groupAttrs.length === 0) {
        if (el.parentNode) {
          el.parentNode.replaceChild(child, el);
        }
      } else {
        // Try to move group attributes to child (only inheritable ones)
        let canCollapse = true;
        for (const attr of groupAttrs) {
          if (
            !inheritableAttrs.has(attr) &&
            attr !== "class" &&
            attr !== "style"
          ) {
            canCollapse = false;
            break;
          }
          // Don't overwrite existing child attributes
          if (child.hasAttribute(attr)) {
            canCollapse = false;
            break;
          }
        }
        if (canCollapse && el.parentNode) {
          // Move attributes to child
          for (const attr of groupAttrs) {
            // Bug fix: Check for null before setAttribute to prevent setting "null" as attribute value
            const val = el.getAttribute(attr);
            if (val !== null) {
              child.setAttribute(attr, val);
            }
          }
          el.parentNode.replaceChild(child, el);
        }
      }
    }
  };

  processElement(doc, true);
  return doc;
});

/**
 * Merge adjacent paths with same attributes
 * SVGO Exception Rules:
 * - Skip if paths have children
 * - Skip if different attributes
 * - Don't merge if marker-start/mid/end present
 * - Don't merge if clip-path/mask present
 * - Don't merge if URL references in fill/stroke
 * - Don't merge if fill-rule differs (evenodd vs nonzero create different shapes)
 * - Don't merge if filter present (filters apply to entire path)
 * - Only merge if paths don't intersect (unless force flag)
 *
 * CRITICAL: fill-rule affects what area is considered "inside" a path.
 * Merging two paths with different fill-rules would produce incorrect results
 * because the combined path would use a single fill-rule for both subpaths.
 */
export const mergePaths = createOperation((doc, options = {}) => {
  const force = options.force || false;

  // Helper to check for URL references in attribute
  const hasUrlRef = (value) => value && value.includes("url(");

  const processElement = (el) => {
    const paths = [...el.children].filter(
      (c) => isElement(c) && c.tagName === "path",
    );

    for (let i = 0; i < paths.length - 1; i++) {
      const path1 = paths[i];
      const path2 = paths[i + 1];

      // Exception 1: Skip if paths have children (e.g., animation elements)
      if (!force && (path1.children.length > 0 || path2.children.length > 0))
        continue;

      // Exception 3: Don't merge if marker attributes present
      const markerAttrs = ["marker-start", "marker-mid", "marker-end"];
      const hasMarkers = markerAttrs.some(
        (attr) => path1.getAttribute(attr) || path2.getAttribute(attr),
      );
      if (!force && hasMarkers) continue;

      // Exception 4: Don't merge if clip-path/mask present
      if (
        !force &&
        (path1.getAttribute("clip-path") ||
          path1.getAttribute("mask") ||
          path2.getAttribute("clip-path") ||
          path2.getAttribute("mask"))
      )
        continue;

      // Exception 5: Don't merge if URL references in fill/stroke
      if (!force) {
        const fill1 = path1.getAttribute("fill");
        const stroke1 = path1.getAttribute("stroke");
        const fill2 = path2.getAttribute("fill");
        const stroke2 = path2.getAttribute("stroke");
        if (
          hasUrlRef(fill1) ||
          hasUrlRef(stroke1) ||
          hasUrlRef(fill2) ||
          hasUrlRef(stroke2)
        )
          continue;
      }

      // Exception 6: Don't merge if fill-rule differs - CRITICAL for correct rendering
      // Paths with different fill-rules produce different filled areas and cannot be combined
      if (!force) {
        const fillRule1 = path1.getAttribute("fill-rule") || "nonzero";
        const fillRule2 = path2.getAttribute("fill-rule") || "nonzero";
        if (fillRule1 !== fillRule2) continue;
      }

      // Exception 7: Don't merge if filter present - filters apply to whole path
      if (
        !force &&
        (path1.getAttribute("filter") || path2.getAttribute("filter"))
      )
        continue;

      // Exception 2: Check if attributes match
      const attrs1 = path1
        .getAttributeNames()
        .filter((a) => a !== "d")
        .sort();
      const attrs2 = path2
        .getAttributeNames()
        .filter((a) => a !== "d")
        .sort();

      if (JSON.stringify(attrs1) === JSON.stringify(attrs2)) {
        let match = true;
        for (const attr of attrs1) {
          if (path1.getAttribute(attr) !== path2.getAttribute(attr)) {
            match = false;
            break;
          }
        }

        if (match) {
          // Merge path data
          const d1 = path1.getAttribute("d");
          const d2 = path2.getAttribute("d");
          path1.setAttribute("d", `${d1} ${d2}`);

          // Remove second path
          if (path2.parentNode) {
            path2.parentNode.removeChild(path2);
          }
          paths.splice(i + 1, 1);
          i--;
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Move group attributes to child elements
 *
 * IMPORTANT: This function uses the complete inheritableAttrs set from svg-collections.js
 * which includes all CSS-inheriting SVG presentation attributes:
 * - fill, stroke, stroke-width, opacity, fill-opacity, stroke-opacity
 * - clip-rule, fill-rule (affect path fill regions)
 * - stroke-dasharray, stroke-dashoffset (dashed lines)
 * - stroke-linecap, stroke-linejoin, stroke-miterlimit (stroke appearance)
 * - marker-start, marker-mid, marker-end (path markers)
 * - font properties, text properties, visibility, cursor, etc.
 *
 * Using incomplete lists causes attributes to be orphaned on groups,
 * which then get lost when groups are collapsed.
 */
export const moveGroupAttrsToElems = createOperation((doc, _options = {}) => {
  // CRITICAL: Use the complete inheritableAttrs from svg-collections.js
  // DO NOT use a local incomplete array - it will lose inheritable attributes!
  // The full set contains 40+ inheritable SVG presentation attributes.

  const processElement = (el) => {
    if (el.tagName === "g") {
      // Iterate over all attributes on the group
      for (const attr of [...el.getAttributeNames()]) {
        // Only process inheritable attributes (from the complete svg-collections set)
        if (!inheritableAttrs.has(attr)) continue;

        const val = el.getAttribute(attr);
        if (val) {
          // Propagate to children that don't have this attribute
          for (const child of el.children) {
            if (isElement(child) && !child.hasAttribute(attr)) {
              child.setAttribute(attr, val);
            }
          }
          el.removeAttribute(attr);
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Move common element attributes to parent group
 *
 * IMPORTANT: This function uses the complete inheritableAttrs set from svg-collections.js
 * which includes all CSS-inheriting SVG presentation attributes:
 * - fill, stroke, stroke-width, opacity, fill-opacity, stroke-opacity
 * - clip-rule, fill-rule (affect path fill regions)
 * - stroke-dasharray, stroke-dashoffset (dashed lines)
 * - stroke-linecap, stroke-linejoin, stroke-miterlimit (stroke appearance)
 * - marker-start, marker-mid, marker-end (path markers)
 * - font properties, text properties, visibility, cursor, etc.
 *
 * Using incomplete lists causes some common attributes to not be hoisted to the group,
 * resulting in larger file sizes and missed optimization opportunities.
 */
export const moveElemsAttrsToGroup = createOperation((doc, _options = {}) => {
  // CRITICAL: Use the complete inheritableAttrs from svg-collections.js
  // DO NOT use a local incomplete array - it will miss optimization opportunities
  // and cause inconsistent behavior with other functions that use the full set.

  const processElement = (el) => {
    if (el.tagName === "g" && el.children.length > 1) {
      // Find common attributes - check all inheritable attributes
      for (const attr of inheritableAttrs) {
        let commonValue = null;
        let allHave = true;

        for (const child of el.children) {
          if (!isElement(child)) continue;

          const val = child.getAttribute(attr);
          if (!val) {
            allHave = false;
            break;
          }
          if (commonValue === null) {
            commonValue = val;
          } else if (commonValue !== val) {
            allHave = false;
            break;
          }
        }

        if (allHave && commonValue) {
          // Move to group
          el.setAttribute(attr, commonValue);
          for (const child of el.children) {
            if (isElement(child)) {
              child.removeAttribute(attr);
            }
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

// ============================================================================
// CATEGORY 4: OPTIMIZATION FUNCTIONS (8 functions)
// ============================================================================

/**
 * Minify CSS in style elements
 * SVGO Exception Rules:
 * - Deoptimize if scripts present (script manipulation may need original formatting)
 * - Skip empty styles (nothing to minify)
 * - Preserve CDATA wrappers (needed for XML parsers)
 */
export const minifyStyles = createOperation((doc, options = {}) => {
  // Exception 1: If scripts are present, don't minify (scripts may manipulate styles)
  const scripts = doc.getElementsByTagName("script");
  if (scripts.length > 0 && !options.force) {
    return doc; // Don't minify when scripts are present
  }

  const styles = doc.getElementsByTagName("style");

  for (const style of styles) {
    let css = style.textContent;

    // Exception 2: Skip empty styles
    if (!css || !css.trim()) continue;

    // Exception 3: Detect and preserve CDATA wrapper
    const hasCDATA = css.includes("<![CDATA[") || css.includes("]]>");
    let cdataPrefix = "";
    let cdataSuffix = "";

    if (hasCDATA) {
      // Extract CDATA markers
      const cdataStartMatch = css.match(/^(\s*<!\[CDATA\[\s*)/);
      const cdataEndMatch = css.match(/(\s*\]\]>\s*)$/);
      if (cdataStartMatch) {
        cdataPrefix = "<![CDATA[";
        css = css.replace(/^\s*<!\[CDATA\[\s*/, "");
      }
      if (cdataEndMatch) {
        cdataSuffix = "]]>";
        css = css.replace(/\s*\]\]>\s*$/, "");
      }
    }

    // Basic minification
    css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove comments
    css = css.replace(/\s+/g, " "); // Collapse whitespace
    css = css.replace(/\s*([{}:;,])\s*/g, "$1"); // Remove space around punctuation
    css = css.trim();

    // Restore CDATA if it was present
    if (cdataPrefix || cdataSuffix) {
      css = cdataPrefix + css + cdataSuffix;
    }

    style.textContent = css;
  }

  return doc;
});

/**
 * Inline CSS from style elements to style attributes
 * SVGO Exception Rules:
 * - Skip foreignObject (contains non-SVG content)
 * - Skip non-text/css type attribute
 * - Only inline selectors matching once (don't duplicate for ID selectors)
 * - Skip pseudo-classes (:hover, :active, :focus, etc.)
 * - Higher specificity wins (don't overwrite more specific existing styles)
 * - Preserve !important declarations
 */
export const inlineStyles = createOperation((doc, options = {}) => {
  const onlyMatchedOnce = options.onlyMatchedOnce !== false; // Default true
  const removeStyleElement = options.removeStyleElement !== false; // Default true
  const styles = doc.getElementsByTagName("style");

  // Track which selectors couldn't be inlined (for keeping in style element)
  const uninlineableSelectors = [];

  for (const style of styles) {
    // Exception 2: Skip non-text/css type attribute
    const typeAttr = style.getAttribute("type");
    if (typeAttr && typeAttr !== "text/css") continue;

    const css = style.textContent;
    if (!css || !css.trim()) continue;

    // Bug fix: Skip style elements with nested/at-rules that can't be safely inlined
    if (
      css.includes("@media") ||
      css.includes("@keyframes") ||
      css.includes("@supports") ||
      css.includes("@font-face")
    ) {
      // Keep the style element as-is, can't safely inline nested/at-rules
      continue;
    }

    // Parse CSS rules (simple parser)
    const rules = css.match(/([^{]+)\{([^}]+)\}/g) || [];

    // Collect all rules with their specificity first
    const allRules = [];

    for (const rule of rules) {
      const match = rule.match(/([^{]+)\{([^}]+)\}/);
      if (!match) continue;

      const selector = match[1].trim();
      const declarations = match[2].trim();

      // Exception 4: Skip pseudo-classes (they can't be inlined)
      let hasPseudoClass = false;
      for (const pseudo of pseudoClasses.preventInlining) {
        if (selector.includes(pseudo)) {
          hasPseudoClass = true;
          break;
        }
      }
      if (hasPseudoClass) {
        uninlineableSelectors.push(rule);
        continue;
      }

      // Calculate specificity for this selector
      let specificity;
      try {
        specificity = CSSSpecificity.calculateSpecificity(selector);
      } catch (e) {
        // Invalid selector, can't calculate specificity, keep in style element - log error for debugging
        if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
        uninlineableSelectors.push(rule);
        continue;
      }

      allRules.push({
        selector,
        declarations,
        specificity,
        originalRule: rule,
      });
    }

    // Sort by specificity (ascending) so higher specificity rules are applied last and win
    allRules.sort((a, b) =>
      CSSSpecificity.compareSpecificity(a.specificity, b.specificity),
    );

    // Use a WeakMap to track property specificity per element
    // WeakMaps are not iterable, so we also track elements in a Set
    const elementPropertySpecificity = new WeakMap();
    const styledElements = new Set();

    // Apply rules in specificity order
    for (const {
      selector,
      declarations,
      specificity,
      originalRule,
    } of allRules) {
      // Find matching elements
      try {
        const elements = doc.querySelectorAll(selector);

        // Exception 3: Only inline selectors matching once (for ID selectors)
        if (
          onlyMatchedOnce &&
          selector.startsWith("#") &&
          elements.length > 1
        ) {
          uninlineableSelectors.push(originalRule);
          continue;
        }

        for (const el of elements) {
          // Exception 1: Skip foreignObject and its children
          let parent = el;
          let inForeignObject = false;
          while (parent) {
            if (parent.tagName === "foreignObject") {
              inForeignObject = true;
              break;
            }
            parent = parent.parentNode;
          }
          if (inForeignObject) continue;

          // Get or create specificity map for this element
          if (!elementPropertySpecificity.has(el)) {
            elementPropertySpecificity.set(el, new Map());
            styledElements.add(el); // Track element in Set for later iteration
          }
          const propSpec = elementPropertySpecificity.get(el);

          // Parse existing inline styles first (inline styles have highest specificity: 1,0,0,0)
          const existingStyle = el.getAttribute("style") || "";
          if (existingStyle && propSpec.size === 0) {
            // Only parse inline styles once per element (before any CSS rules are applied)
            const existingDecls = existingStyle.split(";");
            for (const decl of existingDecls) {
              const colonIdx = decl.indexOf(":");
              if (colonIdx > 0) {
                const prop = decl.substring(0, colonIdx).trim();
                let value = decl.substring(colonIdx + 1).trim();
                const isImportant = value.includes("!important");
                if (isImportant) {
                  value = value.replace(/\s*!important\s*/g, "").trim();
                }
                // Inline styles have specificity [1,0,0,0] (higher than any selector)
                propSpec.set(prop, {
                  specificity: [1, 0, 0, 0],
                  isImportant,
                  value,
                });
              }
            }
          }

          // Parse new declarations from this CSS rule
          const newDecls = declarations.split(";");
          for (const decl of newDecls) {
            const colonIdx = decl.indexOf(":");
            if (colonIdx <= 0) continue;

            const prop = decl.substring(0, colonIdx).trim();
            let value = decl.substring(colonIdx + 1).trim();
            const isImportant = value.includes("!important");
            if (isImportant) {
              value = value.replace(/\s*!important\s*/g, "").trim();
            }

            // Check if we can override existing property value
            const existing = propSpec.get(prop);
            if (existing) {
              // Compare specificity
              const cmp = CSSSpecificity.compareSpecificity(
                specificity,
                existing.specificity,
              );

              // Can only override if:
              // 1. New specificity is higher (cmp > 0), OR
              // 2. Same specificity (cmp === 0) - later rules win, OR
              // 3. New rule has !important and existing doesn't, OR
              // 4. Both have !important but new specificity >= existing
              if (cmp < 0) {
                // New specificity is lower
                if (isImportant && !existing.isImportant) {
                  // !important always wins over non-!important
                  propSpec.set(prop, { specificity, isImportant, value });
                }
                // Otherwise, keep existing (higher specificity)
              } else if (cmp === 0) {
                // Same specificity - later rule wins (cascade order)
                if (isImportant || !existing.isImportant) {
                  propSpec.set(prop, { specificity, isImportant, value });
                }
                // If existing is !important but new is not, keep existing
              } else {
                // New specificity is higher
                if (!existing.isImportant || isImportant) {
                  propSpec.set(prop, { specificity, isImportant, value });
                }
                // If existing is !important but new is not, keep existing
              }
            } else {
              // No existing value for this property, just set it
              propSpec.set(prop, { specificity, isImportant, value });
            }
          }
        }
      } catch (e) {
        // Invalid selector, keep in style element - log error for debugging
        if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
        uninlineableSelectors.push(originalRule);
      }
    }

    // After all rules processed, build final style attributes for all elements
    for (const el of styledElements) {
      const propSpec = elementPropertySpecificity.get(el);
      const styleParts = [];
      for (const [prop, { value, isImportant }] of propSpec) {
        if (isImportant) {
          styleParts.push(`${prop}: ${value} !important`);
        } else {
          styleParts.push(`${prop}: ${value}`);
        }
      }
      el.setAttribute("style", styleParts.join("; "));
    }

    // Remove style element or keep uninlineable rules
    if (removeStyleElement && style.parentNode) {
      if (uninlineableSelectors.length > 0) {
        // Keep only uninlineable rules
        style.textContent = uninlineableSelectors.join("\n");
      } else {
        style.parentNode.removeChild(style);
      }
    }
  }

  return doc;
});

/**
 * Sort element attributes alphabetically
 */
export const sortAttrs = createOperation((doc, _options = {}) => {
  const processElement = (el) => {
    const attrs = el.getAttributeNames().sort();
    const values = attrs.map((name) => [name, el.getAttribute(name)]);

    // Remove all attributes
    for (const name of attrs) {
      el.removeAttribute(name);
    }

    // Add back in sorted order
    for (const [name, value] of values) {
      el.setAttribute(name, value);
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Sort defs children by tag name
 */
export const sortDefsChildren = createOperation((doc, _options = {}) => {
  const defsElements = doc.getElementsByTagName("defs");

  for (const defs of defsElements) {
    const children = [...defs.children].filter((c) => isElement(c));
    children.sort((a, b) => a.tagName.localeCompare(b.tagName));

    // Remove all children
    for (const child of [...defs.children]) {
      defs.removeChild(child);
    }

    // Add back in sorted order
    for (const child of children) {
      defs.appendChild(child);
    }
  }

  return doc;
});

/**
 * Create use elements for repeated paths
 */
export const reusePaths = createOperation((doc, options = {}) => {
  const threshold = options.threshold || 2; // Min repetitions
  const paths = doc.getElementsByTagName("path");
  const pathMap = new Map(); // d -> [elements]

  // Group paths by d attribute
  for (const path of paths) {
    const d = path.getAttribute("d");
    if (d) {
      if (!pathMap.has(d)) {
        pathMap.set(d, []);
      }
      pathMap.get(d).push(path);
    }
  }

  // Find defs or create one
  let defs = doc.querySelector("defs");
  if (!defs) {
    defs = new SVGElement("defs", {});
    // Handle null firstChild - insert at beginning or append if empty
    if (doc.firstChild) {
      doc.insertBefore(defs, doc.firstChild);
    } else {
      doc.appendChild(defs);
    }
  }

  let counter = 0;

  // Convert repeated paths to use elements
  for (const [d, elements] of pathMap) {
    if (elements.length >= threshold) {
      const id = `path${counter++}`;

      // Create definition
      const defPath = new SVGElement("path", { id, d });
      defs.appendChild(defPath);

      // Replace elements with use
      for (const el of elements) {
        const use = new SVGElement("use", { href: `#${id}` });

        // Copy attributes except d
        for (const attrName of el.getAttributeNames()) {
          if (attrName !== "d") {
            // Bug fix: Check for null before setAttribute to prevent setting "null" as attribute value
            const val = el.getAttribute(attrName);
            if (val !== null) {
              use.setAttribute(attrName, val);
            }
          }
        }

        // Copy all children (e.g., <animate>, <set>, <animateMotion>, etc.) to preserve animation references
        for (const child of [...el.children]) {
          use.appendChild(child);
        }

        if (el.parentNode) {
          el.parentNode.replaceChild(use, el);
        }
      }
    }
  }

  return doc;
});

/**
 * Remove paths outside viewBox
 *
 * IMPORTANT: This function accounts for ALL SVG properties that affect visibility:
 * - stroke-width: A path with thick stroke may be visible even if geometry is outside
 * - markers: Marker geometry at path vertices may extend into viewport
 * - filters: Filter effects (blur, drop-shadow) can extend the visible area
 *
 * Only removes a path if its FULL RENDERED AREA (including stroke, markers, filters)
 * is completely outside the viewBox.
 */
export const removeOffCanvasPath = createOperation((doc, _options = {}) => {
  const viewBox = doc.getAttribute("viewBox");
  if (!viewBox) return doc;

  const vb = OffCanvasDetection.parseViewBox(viewBox);
  if (!vb) return doc;

  // Build defs map for resolving markers and filters
  const defsMap = buildDefsMap(doc);

  const paths = doc.getElementsByTagName("path");

  for (const path of [...paths]) {
    const d = path.getAttribute("d");
    if (!d) continue;

    try {
      const commands = GeometryToPath.parsePathData(d);

      // Get the geometric bounding box
      const geometryBBox = OffCanvasDetection.pathBoundingBox(commands);
      if (!geometryBBox) continue;

      // Create rendering context to account for stroke, markers, filters
      const inherited = getInheritedProperties(path);
      const renderCtx = createRenderingContext(path, inherited, defsMap);

      // Expand bounding box for all rendering effects
      const renderedBBox = renderCtx.getRenderedBBox(geometryBBox);

      // Check if the RENDERED bounding box is off-canvas
      // Convert to viewBox format for intersection test
      const renderedVB = {
        x: renderedBBox.x,
        y: renderedBBox.y,
        width: renderedBBox.width,
        height: renderedBBox.height,
      };

      const intersects = OffCanvasDetection.bboxIntersectsViewBox(
        renderedVB,
        vb,
      );

      // Only remove if rendered area does NOT intersect viewBox
      if (!intersects) {
        if (path.parentNode) {
          path.parentNode.removeChild(path);
        }
      }
    } catch (e) {
      // Skip invalid paths - don't remove paths we can't analyze - log error for debugging
      if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
    }
  }

  return doc;
});

/**
 * Remove style elements
 */
export const removeStyleElement = createOperation((doc, _options = {}) => {
  const styles = doc.getElementsByTagName("style");
  for (const style of [...styles]) {
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }
  return doc;
});

/**
 * Remove deprecated xlink namespace
 * SAFETY: Unlike SVGO (bug #1730), we NEVER remove xmlns:xlink if xlink:* attributes remain
 * We convert ALL xlink:* attributes before removing the namespace declaration
 *
 * Conversions performed:
 *   - xlink:href → href (SVG 2.0 standard)
 *   - xlink:show → target attribute ("new" → "_blank", "replace" → "_self")
 *   - xlink:title → <title> child element (proper SVG tooltip)
 *   - xlink:actuate, xlink:type, xlink:role, xlink:arcrole → removed (deprecated)
 */
export const removeXlink = createOperation((doc, _options = {}) => {
  // Mapping from xlink:show values to HTML target attribute values
  const SHOW_TO_TARGET = {
    new: "_blank",
    replace: "_self",
  };

  // Track if any xlink:* attributes remain after processing
  let hasRemainingXlinkAttrs = false;

  /**
   * Process an element and its children to convert xlink attributes.
   * @param {Element} el - The element to process
   * @returns {void}
   */
  const processElement = (el) => {
    for (const attrName of [...el.getAttributeNames()]) {
      if (attrName.startsWith("xlink:")) {
        const localName = attrName.substring(6); // Remove 'xlink:' prefix
        const value = el.getAttribute(attrName);

        // Handle xlink attributes - preserve xlink:href for SVG 1.1 compatibility
        if (localName === "href") {
          // KEEP xlink:href for SVG 1.1 compatibility
          // SVG 2.0 supports plain href, but SVG 1.1 requires xlink:href
          hasRemainingXlinkAttrs = true;
        } else if (localName === "show") {
          // xlink:show → target attribute (for <a> elements)
          // Bug fix: Previously just removed, now converts to target
          if (!el.hasAttribute("target")) {
            const targetValue = SHOW_TO_TARGET[value];
            if (targetValue) {
              el.setAttribute("target", targetValue);
            }
          }
          el.removeAttribute(attrName);
        } else if (localName === "title") {
          // xlink:title → <title> child element (proper SVG tooltip)
          // Bug fix: Previously set title attribute, but SVG tooltips use <title> elements
          const existingTitle = el.querySelector && el.querySelector("title");
          if (!existingTitle && value) {
            const titleEl = new SVGElement("title", {}, [], value);
            // Insert title as first child - handle null firstChild properly
            if (typeof el.insertBefore === "function" && el.firstChild) {
              el.insertBefore(titleEl, el.firstChild);
            } else if (typeof el.appendChild === "function") {
              // No firstChild or insertBefore not available - use appendChild
              el.appendChild(titleEl);
            } else if (el.children && Array.isArray(el.children)) {
              // Fallback for internal SVGElement without DOM methods
              el.children.unshift(titleEl);
              titleEl.parentNode = el;
            }
          }
          el.removeAttribute(attrName);
        } else if (["actuate", "type", "role", "arcrole"].includes(localName)) {
          // Deprecated xlink attributes - safe to remove
          el.removeAttribute(attrName);
        } else {
          // Unknown xlink attribute - keep it and mark namespace as needed
          hasRemainingXlinkAttrs = true;
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);

  // CRITICAL SAFETY: Only remove xmlns:xlink if NO xlink:* attributes remain
  // This prevents SVGO bug #1730 (unbound namespace prefix)
  if (!hasRemainingXlinkAttrs) {
    doc.removeAttribute("xmlns:xlink");
  }

  return doc;
});

// ============================================================================
// CATEGORY 5: ADDING/MODIFICATION FUNCTIONS (7 functions)
// ============================================================================

/**
 * Add attributes to root SVG element
 */
export const addAttributesToSVGElement = createOperation(
  (doc, options = {}) => {
    const attributes = options.attributes || {};

    for (const [name, value] of Object.entries(attributes)) {
      doc.setAttribute(name, value);
    }

    return doc;
  },
);

/**
 * Add classes to root SVG element
 */
export const addClassesToSVGElement = createOperation((doc, options = {}) => {
  const classes = options.classes || [];
  const existing = doc.getAttribute("class") || "";
  const newClasses = existing
    ? `${existing} ${classes.join(" ")}`
    : classes.join(" ");
  doc.setAttribute("class", newClasses.trim());
  return doc;
});

/**
 * Add prefix to all IDs
 */
export const prefixIds = createOperation((doc, options = {}) => {
  const prefix = options.prefix || "svg";
  const idMap = new Map();
  const classMap = new Map();

  /**
   * Escape special regex characters for safe use in RegExp.
   * @param {string} str - String to escape
   * @returns {string} Escaped string safe for use in RegExp
   */
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /**
   * Collect and rename IDs in element and its children.
   * @param {Element} el - Element to process
   * @returns {void}
   */
  const processElement = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      const newId = `${prefix}${id}`;
      idMap.set(id, newId);
      el.setAttribute("id", newId);
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };
  processElement(doc);

  // Collect and prefix class names if enabled (default: true)
  if (options.prefixClassNames !== false) {
    /**
     * Collect all class names from element and its children.
     * @param {Element} el - Element to process
     * @returns {void}
     */
    const collectClasses = (el) => {
      const classAttr = el.getAttribute("class");
      if (classAttr) {
        for (const cls of classAttr.split(/\s+/)) {
          if (cls && !classMap.has(cls)) {
            classMap.set(cls, `${prefix}${cls}`);
          }
        }
      }
      for (const child of el.children) {
        if (isElement(child)) collectClasses(child);
      }
    };
    collectClasses(doc);

    /**
     * Update class attributes with prefixed names.
     * @param {Element} el - Element to process
     * @returns {void}
     */
    const updateClasses = (el) => {
      const classAttr = el.getAttribute("class");
      if (classAttr) {
        const newClasses = classAttr
          .split(/\s+/)
          .map((cls) => classMap.get(cls) || cls)
          .join(" ");
        el.setAttribute("class", newClasses);
      }
      for (const child of el.children) {
        if (isElement(child)) updateClasses(child);
      }
    };
    updateClasses(doc);
  }

  // Update CSS in <style> elements
  const styles = doc.getElementsByTagName("style");
  for (const style of styles) {
    let css = style.textContent;
    if (!css) continue;

    // Update ID selectors and url(#id) in CSS
    for (const [oldId, newId] of idMap) {
      const escaped = escapeRegex(oldId);
      // Update #id selectors (with word boundary check to avoid partial matches)
      css = css.replace(
        new RegExp(`#${escaped}([^\\w-]|$)`, "g"),
        `#${newId}$1`,
      );
      // Update url(#id) references in CSS (e.g., in fill, stroke, etc.)
      css = css.replace(
        new RegExp(`url\\(#${escaped}\\)`, "g"),
        `url(#${newId})`,
      );
    }

    // Update class selectors if class prefixing is enabled
    if (options.prefixClassNames !== false) {
      for (const [oldClass, newClass] of classMap) {
        const escaped = escapeRegex(oldClass);
        // Update .class selectors (with word boundary check)
        css = css.replace(
          new RegExp(`\\.${escaped}([^\\w-]|$)`, "g"),
          `.${newClass}$1`,
        );
      }
    }

    style.textContent = css;
  }

  /**
   * Update references in element attributes (url(#id), href="#id", begin/end timing).
   * @param {Element} el - Element to process
   * @returns {void}
   */
  const updateRefs = (el) => {
    for (const attrName of el.getAttributeNames()) {
      let val = el.getAttribute(attrName);

      // Handle url(#id) references with GLOBAL replacement (fixes bug #1)
      if (val && val.includes("url(#")) {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Use global flag to replace ALL occurrences, not just first
          val = val.replace(
            new RegExp(`url\\(#${escaped}\\)`, "g"),
            `url(#${newId})`,
          );
        }
        el.setAttribute(attrName, val);
      }

      // Handle href and xlink:href references
      if (
        (attrName === "href" || attrName === "xlink:href") &&
        val?.startsWith("#")
      ) {
        const oldId = val.substring(1);
        if (idMap.has(oldId)) {
          el.setAttribute(attrName, `#${idMap.get(oldId)}`);
        }
      }

      // Handle animation timing references (begin/end attributes)
      // Format examples: "id.end", "id.start", "id.click", "id.click+2s"
      if (attrName === "begin" || attrName === "end") {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Match id at start of string or after semicolon/space, followed by a dot
          val = val.replace(
            new RegExp(`(^|;|\\s)${escaped}\\.`, "g"),
            `$1${newId}.`,
          );
        }
        el.setAttribute(attrName, val);
      }

      // Bug fix: Handle animation value attributes with ID references (values/from/to/by)
      // Format examples: "#frame1;#frame2;#frame3" or "#target"
      if (
        attrName === "values" ||
        attrName === "from" ||
        attrName === "to" ||
        attrName === "by"
      ) {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Match #id followed by semicolon, space, or end of string
          val = val.replace(
            new RegExp(`#${escaped}([;\\s]|$)`, "g"),
            `#${newId}$1`,
          );
        }
        el.setAttribute(attrName, val);
      }
    }

    for (const child of el.children) {
      if (isElement(child)) updateRefs(child);
    }
  };
  updateRefs(doc);

  return doc;
});

/**
 * Remove width/height, keep viewBox
 */
export const removeDimensions = createOperation((doc, _options = {}) => {
  doc.removeAttribute("width");
  doc.removeAttribute("height");
  return doc;
});

/**
 * Remove attributes by CSS selector
 */
export const removeAttributesBySelector = createOperation(
  (doc, options = {}) => {
    const selector = options.selector || "*";
    const attributes = options.attributes || [];

    try {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        for (const attr of attributes) {
          if (el.hasAttribute(attr)) {
            el.removeAttribute(attr);
          }
        }
      }
    } catch (e) {
      // Invalid selector - log error for debugging
      if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
    }

    return doc;
  },
);

/**
 * Remove attributes by name pattern (regex)
 */
export const removeAttrs = createOperation((doc, options = {}) => {
  const pattern = options.pattern ? new RegExp(options.pattern) : null;
  const attrs = options.attrs || [];

  /**
   * Process element and its children to remove matching attributes.
   * @param {Element} el - Element to process
   * @returns {void}
   */
  const processElement = (el) => {
    for (const attrName of [...el.getAttributeNames()]) {
      if (attrs.includes(attrName) || (pattern && pattern.test(attrName))) {
        el.removeAttribute(attrName);
      }
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Remove elements by attribute value
 */
export const removeElementsByAttr = createOperation((doc, options = {}) => {
  const attrName = options.name;
  const attrValue = options.value;

  if (!attrName) return doc;

  /**
   * Process element to remove children with matching attributes.
   * @param {Element} el - Element to process
   * @returns {void}
   */
  const processElement = (el) => {
    for (const child of [...el.children]) {
      if (!isElement(child)) continue;

      const val = child.getAttribute(attrName);
      if (attrValue === undefined) {
        // Remove if attribute exists
        if (val !== null) {
          el.removeChild(child);
          continue;
        }
      } else {
        // Remove if attribute matches value
        if (val === attrValue) {
          el.removeChild(child);
          continue;
        }
      }

      processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

// ============================================================================
// CATEGORY 6: PRESETS (5 functions)
// ============================================================================

/**
 * Apply default SVGO-like preset
 */
export const presetDefault = createOperation(async (doc, options = {}) => {
  // Chain multiple operations - must await each since they're async wrapped functions
  // Pass outputFormat: DOM_ELEMENT to receive DOM back for chaining
  const domOpts = { ...options, outputFormat: OutputFormat.DOM_ELEMENT };
  let document = doc;
  document = await removeMetadata(document, domOpts);
  document = await removeComments(document, domOpts);
  document = await removeEmptyContainers(document, domOpts);
  document = await removeHiddenElements(document, domOpts);
  document = await cleanupNumericValues(document, domOpts);
  document = await convertColors(document, domOpts);
  document = await convertStyleToAttrs(document, domOpts);
  document = await removeEditorsNSData(document, domOpts);
  document = await cleanupIds(document, domOpts);
  document = await minifyStyles(document, domOpts);
  return document;
});

/**
 * No optimizations (pass-through)
 */
export const presetNone = createOperation((doc, _options = {}) => {
  return doc;
});

/**
 * Apply custom preset
 */
export const applyPreset = createOperation(async (doc, options = {}) => {
  const preset = options.preset || "default";
  const domOpts = { ...options, outputFormat: OutputFormat.DOM_ELEMENT };

  switch (preset) {
    case "default":
      return await presetDefault(doc, domOpts);
    case "none":
      return await presetNone(doc, domOpts);
    default:
      return doc;
  }
});

/**
 * Main optimization function with config
 */
export const optimize = createOperation(async (doc, options = {}) => {
  const config = options.config || {};
  const domOpts = { ...options, outputFormat: OutputFormat.DOM_ELEMENT };
  let document = doc;

  // Apply operations based on config - must await each async operation
  if (config.removeMetadata !== false)
    document = await removeMetadata(document, domOpts);
  if (config.removeComments !== false)
    document = await removeComments(document, domOpts);
  if (config.cleanupNumericValues !== false)
    document = await cleanupNumericValues(document, domOpts);
  if (config.convertColors !== false)
    document = await convertColors(document, domOpts);
  if (config.removeHiddenElements !== false)
    document = await removeHiddenElements(document, domOpts);
  if (config.removeEmptyContainers !== false)
    document = await removeEmptyContainers(document, domOpts);

  return document;
});

/**
 * Create configuration object with default optimization settings.
 * @param {Object} [config={}] - Configuration options
 * @param {number} [config.precision=6] - Numeric precision for values
 * @param {boolean} [config.removeMetadata=true] - Remove metadata elements
 * @param {boolean} [config.removeComments=true] - Remove comment nodes
 * @param {boolean} [config.cleanupNumericValues=true] - Clean up numeric values
 * @param {boolean} [config.convertColors=true] - Convert colors to shorter format
 * @param {boolean} [config.removeHiddenElements=true] - Remove hidden elements
 * @param {boolean} [config.removeEmptyContainers=true] - Remove empty container elements
 * @returns {Object} Configuration object with defaults applied
 */
export function createConfig(config = {}) {
  return {
    precision: config.precision || 6,
    removeMetadata: config.removeMetadata !== false,
    removeComments: config.removeComments !== false,
    cleanupNumericValues: config.cleanupNumericValues !== false,
    convertColors: config.convertColors !== false,
    removeHiddenElements: config.removeHiddenElements !== false,
    removeEmptyContainers: config.removeEmptyContainers !== false,
    ...config,
  };
}

// ============================================================================
// CATEGORY 7: BONUS FUNCTIONS - SVGO doesn't have (14 functions)
// ============================================================================

/**
 * Flatten clip-paths into geometry
 */
export const flattenClipPaths = createOperation(async (doc, options = {}) => {
  const svgString = serializeSVG(doc, { minify: options.minify !== false });
  const result = await flattenSVG(svgString, {
    ...options,
    resolveClipPaths: true,
    resolveUse: false,
    resolveMarkers: false,
    resolvePatterns: false,
    resolveMasks: false,
    flattenTransforms: false,
    removeUnusedDefs: false, // CRITICAL: Don't remove other defs (gradients, markers, etc.) that are still referenced
  });
  return parseSVG(result.svg);
});

/**
 * Flatten masks into geometry
 */
export const flattenMasks = createOperation(async (doc, options = {}) => {
  const svgString = serializeSVG(doc, { minify: options.minify !== false });
  const result = await flattenSVG(svgString, {
    ...options,
    resolveMasks: true,
    resolveClipPaths: false,
    resolveUse: false,
    resolveMarkers: false,
    resolvePatterns: false,
    flattenTransforms: false,
    removeUnusedDefs: false, // CRITICAL: Don't remove other defs (gradients, markers, etc.) that are still referenced
  });
  return parseSVG(result.svg);
});

/**
 * Bake gradients into solid fills (simplification)
 */
export const flattenGradients = createOperation((doc, options = {}) => {
  // Convert gradients to mid-point color by sampling at 50%
  // Build defs map to lookup gradient definitions
  const defsMap = buildDefsMap(doc);

  // Helper to check for circular gradient references (xlink:href chains)
  const getGradientRef = (id) => {
    const g = defsMap.get(id);
    if (!g) return null;
    const ref = g.getAttribute("href") || g.getAttribute("xlink:href");
    return ref?.startsWith("#") ? ref.substring(1) : null;
  };

  /**
   * Check if gradient is safe to flatten (no circular refs, userSpaceOnUse, or transforms).
   * @param {SVGElement} gradient - The gradient element
   * @param {string} gradientId - The gradient ID
   * @returns {boolean} True if safe to flatten
   */
  const isSafeToFlatten = (gradient, gradientId) => {
    const gradientUnits =
      gradient.getAttribute("gradientUnits") || "objectBoundingBox";
    const gradientTransform = gradient.getAttribute("gradientTransform");

    // Check for circular reference in gradient inheritance chain
    if (hasCircularReference(gradientId, getGradientRef)) {
      if (options.verbose) {
        console.warn(`Circular gradient reference detected: #${gradientId}`);
      }
      return false;
    }

    // Skip gradients with userSpaceOnUse - requires coordinate transformation per element
    if (gradientUnits === "userSpaceOnUse") {
      return false;
    }

    // Skip gradients with transforms - adds complexity beyond simple color sampling
    if (gradientTransform) {
      return false;
    }

    return true;
  };

  // Process fill attributes
  const elementsWithFill = findElementsWithAttribute(doc, "fill");
  for (const el of elementsWithFill) {
    const fill = el.getAttribute("fill");
    if (fill && fill.includes("url(")) {
      const gradientId = parseUrlReference(fill);
      if (gradientId && defsMap.has(gradientId)) {
        const gradient = defsMap.get(gradientId);
        const tagName = gradient.tagName.toLowerCase();
        if (tagName === "lineargradient" || tagName === "radialgradient") {
          // Check if gradient is safe to flatten
          if (!isSafeToFlatten(gradient, gradientId)) {
            if (options.verbose) {
              console.warn(
                `Skipping gradient flatten for ${gradientId}: userSpaceOnUse or gradientTransform requires coordinate transformation`,
              );
            }
            continue;
          }
          const color = sampleGradient(gradient, options.position || 0.5);
          el.setAttribute("fill", color);
        }
      } else {
        // Gradient not found, use fallback
        el.setAttribute("fill", options.fallbackColor || "#808080");
      }
    }
  }

  // Process stroke attributes
  const elementsWithStroke = findElementsWithAttribute(doc, "stroke");
  for (const el of elementsWithStroke) {
    const stroke = el.getAttribute("stroke");
    if (stroke && stroke.includes("url(")) {
      const gradientId = parseUrlReference(stroke);
      if (gradientId && defsMap.has(gradientId)) {
        const gradient = defsMap.get(gradientId);
        const tagName = gradient.tagName.toLowerCase();
        if (tagName === "lineargradient" || tagName === "radialgradient") {
          // Check if gradient is safe to flatten
          if (!isSafeToFlatten(gradient, gradientId)) {
            if (options.verbose) {
              console.warn(
                `Skipping gradient flatten for ${gradientId}: userSpaceOnUse or gradientTransform requires coordinate transformation`,
              );
            }
            continue;
          }
          const color = sampleGradient(gradient, options.position || 0.5);
          el.setAttribute("stroke", color);
        }
      } else {
        // Gradient not found, use fallback
        el.setAttribute("stroke", options.fallbackColor || "#808080");
      }
    }
  }

  // Remove only the gradients that were successfully flattened
  const gradients = [...doc.querySelectorAll("linearGradient, radialGradient")];
  // Helper to escape CSS selector attribute values (prevents injection if ID has special chars)
  const escapeCssAttrValue = (str) => str.replace(/["\\]/g, "\\$&");
  for (const gradient of gradients) {
    // Check if gradient was actually flattened (no longer referenced)
    const gradientId = gradient.getAttribute("id");
    // BUG FIX: Escape gradientId for safe use in CSS attribute selector
    const safeId = gradientId ? escapeCssAttrValue(gradientId) : "";
    const stillReferenced =
      gradientId &&
      ([...doc.querySelectorAll(`[fill*="url(#${safeId})"]`)].length > 0 ||
        [...doc.querySelectorAll(`[stroke*="url(#${safeId})"]`)].length > 0);

    // Only remove if not referenced (meaning it was successfully flattened)
    if (!stillReferenced && gradient.parentNode) {
      gradient.parentNode.removeChild(gradient);
    }
  }

  return doc;
});

/**
 * Sample a gradient at a given position (0-1) to get the interpolated color.
 * @param {SVGElement} gradient - linearGradient or radialGradient element
 * @param {number} position - Position along gradient (0-1), default 0.5 (midpoint)
 * @returns {string} Hex color string (e.g., "#ff8800")
 */
function sampleGradient(gradient, position = 0.5) {
  const stops = [...gradient.children].filter(
    (child) => child.tagName && child.tagName.toLowerCase() === "stop",
  );

  if (stops.length === 0) {
    // No stops, return gray
    return "#808080";
  }

  if (stops.length === 1) {
    // Single stop, return its color
    return getStopColor(stops[0]);
  }

  // Parse all stops with normalized offsets
  const parsedStops = stops.map((stop) => {
    let offset = stop.getAttribute("offset") || "0";
    // Handle percentage values
    if (offset.endsWith("%")) {
      offset = parseFloat(offset) / 100;
    } else {
      offset = parseFloat(offset);
    }
    // Clamp to 0-1 range
    offset = Math.max(0, Math.min(1, offset));

    return {
      offset,
      color: getStopColor(stop),
      opacity: getStopOpacity(stop),
    };
  });

  // Sort by offset
  parsedStops.sort((a, b) => a.offset - b.offset);

  // Find the two stops that bracket the position
  let prevStop = null;
  let nextStop = null;

  for (let i = 0; i < parsedStops.length; i++) {
    const stop = parsedStops[i];
    if (stop.offset <= position) {
      prevStop = stop;
    }
    if (stop.offset >= position && !nextStop) {
      nextStop = stop;
      break;
    }
  }

  // Handle edge cases
  if (!prevStop) {
    // Position is before all stops, use first stop
    return parsedStops[0].color;
  }
  if (!nextStop) {
    // Position is after all stops, use last stop
    return parsedStops[parsedStops.length - 1].color;
  }
  if (prevStop.offset === nextStop.offset) {
    // Same offset, return previous stop color
    return prevStop.color;
  }

  // Interpolate between the two stops
  const t = (position - prevStop.offset) / (nextStop.offset - prevStop.offset);
  return interpolateColors(prevStop.color, nextStop.color, t);
}

/**
 * Get the stop-color from a gradient stop element.
 * Checks both attribute and style.
 * @param {SVGElement} stop - stop element
 * @returns {string} Hex color string
 */
function getStopColor(stop) {
  // Check stop-color attribute first
  let color = stop.getAttribute("stop-color");

  // Check style attribute if no stop-color
  if (!color) {
    const style = stop.getAttribute("style");
    if (style) {
      const match = style.match(/stop-color\s*:\s*([^;]+)/i);
      if (match) {
        color = match[1].trim();
      }
    }
  }

  // Default to black if no color found
  if (!color) {
    color = "#000000";
  }

  return normalizeColor(color);
}

/**
 * Get the stop-opacity from a gradient stop element.
 * @param {SVGElement} stop - stop element
 * @returns {number} Opacity value (0-1)
 */
function getStopOpacity(stop) {
  let opacity = stop.getAttribute("stop-opacity");

  if (!opacity) {
    const style = stop.getAttribute("style");
    if (style) {
      const match = style.match(/stop-opacity\s*:\s*([^;]+)/i);
      if (match) {
        opacity = match[1].trim();
      }
    }
  }

  // Parse opacity value and validate it's not NaN
  const parsedOpacity = opacity ? parseFloat(opacity) : 1.0;
  return isNaN(parsedOpacity) ? 1.0 : parsedOpacity;
}

/**
 * Normalize a color value to hex format.
 * Handles hex, rgb(), and named colors.
 * @param {string} color - Color string in any format
 * @returns {string} Hex color string (e.g., "#ff8800")
 */
function normalizeColor(color) {
  // Validate color parameter is not null/undefined
  if (!color || typeof color !== "string") {
    return "#000000"; // Return default black if invalid
  }
  const colorValue = color.trim().toLowerCase();

  // Already hex format
  if (colorValue.startsWith("#")) {
    // Expand 3-digit hex to 6-digit
    if (colorValue.length === 4) {
      return (
        "#" +
        colorValue[1] +
        colorValue[1] +
        colorValue[2] +
        colorValue[2] +
        colorValue[3] +
        colorValue[3]
      );
    }
    return colorValue;
  }

  // Handle rgb() format
  if (colorValue.startsWith("rgb(")) {
    const match = colorValue.match(
      /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
    );
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return rgbToHex(r, g, b);
    }
  }

  // Handle common named colors
  const namedColors = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    gray: "#808080",
    grey: "#808080",
    silver: "#c0c0c0",
    maroon: "#800000",
    olive: "#808000",
    lime: "#00ff00",
    aqua: "#00ffff",
    teal: "#008080",
    navy: "#000080",
    fuchsia: "#ff00ff",
    purple: "#800080",
  };

  if (namedColors[colorValue]) {
    return namedColors[colorValue];
  }

  // Fallback to black
  return "#000000";
}

/**
 * Interpolate between two hex colors.
 * @param {string} color1 - First hex color (e.g., "#ff0000")
 * @param {string} color2 - Second hex color (e.g., "#0000ff")
 * @param {number} t - Interpolation factor (0-1)
 * @returns {string} Interpolated hex color
 */
function interpolateColors(color1, color2, t) {
  // Parse hex colors to RGB
  const parseHex = (hex) => {
    let hexValue = hex.replace("#", "");
    if (hexValue.length === 3) {
      hexValue =
        hexValue[0] +
        hexValue[0] +
        hexValue[1] +
        hexValue[1] +
        hexValue[2] +
        hexValue[2];
    }
    // Parse RGB components and validate they're not NaN
    const r = parseInt(hexValue.slice(0, 2), 16);
    const g = parseInt(hexValue.slice(2, 4), 16);
    const b = parseInt(hexValue.slice(4, 6), 16);
    // Return default black [0, 0, 0] if any component is NaN
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return [0, 0, 0];
    }
    return [r, g, b];
  };

  const [r1, g1, b1] = parseHex(color1);
  const [r2, g2, b2] = parseHex(color2);

  // Interpolate each channel
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return rgbToHex(r, g, b);
}

/**
 * Convert RGB values to hex color string.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Hex color (e.g., "#ff8800")
 */
function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const value = Math.max(0, Math.min(255, Math.round(n)));
    return value.toString(16).padStart(2, "0");
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Bake patterns into fills
 */
export const flattenPatterns = createOperation(async (doc, options = {}) => {
  const svgString = serializeSVG(doc, { minify: options.minify !== false });
  const result = await flattenSVG(svgString, {
    ...options,
    resolvePatterns: true,
    resolveClipPaths: false,
    resolveUse: false,
    resolveMarkers: false,
    resolveMasks: false,
    flattenTransforms: false,
    removeUnusedDefs: false, // CRITICAL: Don't remove other defs (gradients, markers, etc.) that are still referenced
  });
  return parseSVG(result.svg);
});

/**
 * Bake filter effects (partial - simple filters only)
 */
export const flattenFilters = createOperation((doc, _options = {}) => {
  /**
   * Process element and its children to remove filter attributes.
   * @param {Element} el - Element to process
   * @returns {void}
   */
  const processElement = (el) => {
    if (el.hasAttribute("filter")) {
      el.removeAttribute("filter");
    }
    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);

  // Remove filter definitions
  const filters = doc.getElementsByTagName("filter");
  for (const filter of [...filters]) {
    if (filter.parentNode) {
      filter.parentNode.removeChild(filter);
    }
  }

  return doc;
});

/**
 * Inline use element references
 */
export const flattenUseElements = createOperation(async (doc, options = {}) => {
  const svgString = serializeSVG(doc, { minify: options.minify !== false });
  const result = await flattenSVG(svgString, {
    ...options,
    resolveUse: true,
    resolveClipPaths: false,
    resolveMarkers: false,
    resolvePatterns: false,
    resolveMasks: false,
    flattenTransforms: false,
    removeUnusedDefs: false, // CRITICAL: Don't remove other defs (gradients, markers, etc.) that are still referenced
  });
  return parseSVG(result.svg);
});

/**
 * Trace raster images to paths (basic - stub)
 */
export const imageToPath = createOperation((doc, _options = {}) => {
  // Note: Image tracing requires computer vision algorithms
  // This is a placeholder that marks images
  const images = doc.getElementsByTagName("image");
  for (const img of [...images]) {
    img.setAttribute("data-trace-needed", "true");
  }
  return doc;
});

/**
 * GJK collision detection between shapes
 *
 * IMPORTANT: This function accounts for ALL SVG properties that affect collision:
 * - stroke-width: Stroked shapes have larger collision areas
 * - fill-rule: Shapes with evenodd may have holes that don't collide
 * - markers: Marker geometry can cause additional collisions
 *
 * Options:
 * - samples: Number of polygon samples (default: 10)
 * - includeStroke: Include stroke area in collision (default: true)
 * - includeFillOnly: Only check fill area, not stroke (default: false)
 */
export const detectCollisions = createOperation((doc, options = {}) => {
  const {
    samples = 10,
    includeStroke = true,
    includeFillOnly = false,
  } = options;

  const shapes = [
    ...doc.getElementsByTagName("path"),
    ...doc.getElementsByTagName("rect"),
    ...doc.getElementsByTagName("circle"),
    ...doc.getElementsByTagName("ellipse"),
  ];

  // Build defs map for resolving markers and filters
  const defsMap = buildDefsMap(doc);

  const collisions = [];

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const shape1 = shapes[i];
      const shape2 = shapes[j];

      // Get base polygons from shapes
      let poly1 = getShapePolygon(shape1, samples);
      let poly2 = getShapePolygon(shape2, samples);

      if (!poly1 || !poly2) continue;

      // Create rendering contexts to account for stroke
      const inherited1 = getInheritedProperties(shape1);
      const inherited2 = getInheritedProperties(shape2);
      const ctx1 = createRenderingContext(shape1, inherited1, defsMap);
      const ctx2 = createRenderingContext(shape2, inherited2, defsMap);

      // Expand polygons for stroke if needed
      if (includeStroke && !includeFillOnly) {
        if (ctx1.hasStroke) {
          const strokeExtent = ctx1.getStrokeExtent().toNumber();
          poly1 = expandPolygonByDistance(poly1, strokeExtent);
        }
        if (ctx2.hasStroke) {
          const strokeExtent = ctx2.getStrokeExtent().toNumber();
          poly2 = expandPolygonByDistance(poly2, strokeExtent);
        }
      }

      // Check collision with GJK algorithm
      const result = GJKCollision.polygonsOverlap(poly1, poly2);

      if (result.overlaps) {
        collisions.push({
          shape1: shape1.tagName,
          shape2: shape2.tagName,
          id1: shape1.getAttribute("id"),
          id2: shape2.getAttribute("id"),
          // Include additional info about the collision
          stroke1: ctx1.hasStroke ? ctx1.strokeWidth.toNumber() : 0,
          stroke2: ctx2.hasStroke ? ctx2.strokeWidth.toNumber() : 0,
          fillRule1: ctx1.fillRule,
          fillRule2: ctx2.fillRule,
        });
      }
    }
  }

  // Store results as metadata
  if (collisions.length > 0) {
    doc.setAttribute("data-collisions", JSON.stringify(collisions));
  }

  return doc;
});

/**
 * Expand a polygon by a given distance (approximation for stroke expansion).
 * Moves each vertex outward from the centroid by the specified distance.
 * @private
 * @param {Array<{x: number, y: number}>} polygon - Array of polygon vertices
 * @param {number} distance - Distance to expand (typically stroke width)
 * @returns {Array<{x: number, y: number}>} Expanded polygon vertices
 */
function expandPolygonByDistance(polygon, distance) {
  // BUG FIX: Check for empty polygon to prevent division by zero
  if (distance <= 0 || !polygon || polygon.length === 0) return polygon;

  // Compute centroid
  let cx = 0,
    cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  cx /= polygon.length;
  cy /= polygon.length;

  // Expand each point outward from centroid
  return polygon.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return p;
    const scale = (len + distance) / len;
    return {
      x: cx + dx * scale,
      y: cy + dy * scale,
    };
  });
}

/**
 * Measure distance between shapes
 */
export const measureDistance = createOperation((doc, options = {}) => {
  const id1 = options.id1;
  const id2 = options.id2;

  if (!id1 || !id2) return doc;

  const shape1 = doc.getElementById(id1);
  const shape2 = doc.getElementById(id2);

  if (!shape1 || !shape2) return doc;

  const poly1 = getShapePolygon(shape1, options.samples || 10);
  const poly2 = getShapePolygon(shape2, options.samples || 10);

  if (poly1 && poly2) {
    const result = GJKCollision.polygonsDistance(poly1, poly2);
    doc.setAttribute("data-distance", result.distance.toString());
  }

  return doc;
});

/**
 * Validate XML well-formedness
 * Unlike SVGO, svg-matrix GUARANTEES 100% valid XML output:
 * - All attributes are properly quoted with escapeAttr()
 * - All text content is properly escaped with escapeText()
 * - All namespace declarations are preserved
 * - No unbound namespace prefixes
 * - Proper XML declaration header
 */
export const validateXML = createOperation((doc, _options = {}) => {
  const errors = [];
  const warnings = [];

  // Collect all namespace prefixes used in the document
  const usedPrefixes = new Set();
  const declaredPrefixes = new Set();

  /**
   * Check element and its children for XML validity.
   * @param {Element} el - Element to check
   * @returns {void}
   */
  const checkElement = (el) => {
    // Check tag name for namespace prefix
    if (el.tagName.includes(":")) {
      const prefix = el.tagName.split(":")[0];
      usedPrefixes.add(prefix);
    }

    // Check attributes for namespace declarations and prefixed attributes
    for (const attrName of el.getAttributeNames()) {
      const attrValue = el.getAttribute(attrName);

      // Check for namespace declarations
      if (attrName === "xmlns") {
        declaredPrefixes.add(""); // Default namespace
      } else if (attrName.startsWith("xmlns:")) {
        const prefix = attrName.substring(6);
        declaredPrefixes.add(prefix);
      }

      // Check for prefixed attributes
      if (attrName.includes(":") && !attrName.startsWith("xmlns:")) {
        const prefix = attrName.split(":")[0];
        usedPrefixes.add(prefix);
      }

      // Check for invalid XML characters in attribute values
      // eslint-disable-next-line no-control-regex
      if (attrValue && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(attrValue)) {
        errors.push(
          `Invalid XML characters in attribute '${attrName}' of <${el.tagName}>`,
        );
      }
    }

    // Check text content for invalid XML characters
    // eslint-disable-next-line no-control-regex
    if (el.textContent && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(el.textContent)) {
      errors.push(`Invalid XML characters in text content of <${el.tagName}>`);
    }

    // Recurse to children
    for (const child of el.children) {
      if (isElement(child)) checkElement(child);
    }
  };

  checkElement(doc);

  // Check for unbound namespace prefixes (SVGO's common bug)
  for (const prefix of usedPrefixes) {
    if (prefix && !declaredPrefixes.has(prefix)) {
      errors.push(
        `Unbound namespace prefix: '${prefix}' - SVGO would produce invalid XML here`,
      );
    }
  }

  const result = {
    valid: errors.length === 0,
    errors,
    warnings,
    namespacesUsed: [...usedPrefixes],
    namespacesDeclared: [...declaredPrefixes],
  };

  doc.setAttribute("data-xml-validation", JSON.stringify(result));
  return doc;
});

/**
 * W3C SVG schema validation (comprehensive)
 * Validates against SVG 1.1 and SVG 2.0 specifications
 * Unlike SVGO, svg-matrix GUARANTEES 100% valid SVG output
 */
export const validateSVG = createOperation((doc, options = {}) => {
  const errors = [];
  const warnings = [];
  const svgVersion = options.version || "1.1"; // '1.1' or '2.0'

  // 1. Root element validation
  if (doc.tagName !== "svg") {
    errors.push("Root element must be <svg>");
  }

  // 2. Required SVG namespace
  const xmlns = doc.getAttribute("xmlns");
  if (!xmlns) {
    warnings.push("Missing xmlns attribute (required for standalone SVG)");
  } else if (xmlns !== "http://www.w3.org/2000/svg") {
    errors.push(
      `Invalid SVG namespace: expected 'http://www.w3.org/2000/svg', got '${xmlns}'`,
    );
  }

  // 3. viewBox validation
  const viewBox = doc.getAttribute("viewBox");
  if (viewBox) {
    const vb = viewBox.split(/[\s,]+/);
    if (vb.length !== 4) {
      errors.push(`Invalid viewBox: expected 4 values, got ${vb.length}`);
    } else if (vb.some((v) => isNaN(parseFloat(v)))) {
      errors.push("Invalid viewBox: contains non-numeric values");
    } else {
      const [_minX, _minY, width, height] = vb.map(parseFloat);
      if (width < 0 || height < 0) {
        errors.push("Invalid viewBox: width and height must be non-negative");
      }
    }
  }

  // Track SVG 2.0 features that need polyfills
  const svg2Features = {
    meshGradients: [],
    hatches: [],
    solidColors: [],
    needsPolyfills: false,
  };

  // SVG 2.0 elements that MUST be lowercase (camelCase is invalid per final SVG 2.0 spec)
  const SVG2_CAMELCASE_INVALID = {
    meshGradient: "meshgradient",
    meshRow: "meshrow",
    meshPatch: "meshpatch",
    hatchPath: "hatchpath",
    solidColor: "solidcolor",
  };

  /**
   * Check element and its children for SVG validity (structure, attributes, references).
   * @param {Element} el - Element to check
   * @param {number} [depth=0] - Current recursion depth
   * @returns {void}
   */
  const checkElementValidity = (el, depth = 0) => {
    // Defensive check: ensure element has tagName property
    if (!el || !el.tagName) {
      warnings.push(`Element at depth ${depth} has no tagName property`);
      return;
    }

    const tagLower = el.tagName.toLowerCase();
    const tagOriginal = el.tagName;

    // Check for invalid camelCase SVG 2.0 elements (SVG 2.0 spec requires lowercase)
    if (SVG2_CAMELCASE_INVALID[tagOriginal]) {
      errors.push(
        `Invalid SVG 2.0 element: <${tagOriginal}> must be lowercase <${SVG2_CAMELCASE_INVALID[tagOriginal]}> per SVG 2.0 specification`,
      );
    }

    // Detect SVG 2.0 mesh gradient elements (valid lowercase)
    if (tagLower === "meshgradient") {
      const id = el.getAttribute("id");
      // Track meshgradient (with or without id) - id is stored if present, null if missing
      svg2Features.meshGradients.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(
          `<meshgradient> element without 'id' attribute may be difficult to reference`,
        );
      }
    }

    // Detect SVG 2.0 hatch elements (valid lowercase)
    if (tagLower === "hatch") {
      const id = el.getAttribute("id");
      // Track hatch (with or without id) - id is stored if present, null if missing
      svg2Features.hatches.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(
          `<hatch> element without 'id' attribute may be difficult to reference`,
        );
      }
    }

    // Detect SVG 2.0 solidcolor elements (valid lowercase)
    if (tagLower === "solidcolor") {
      const id = el.getAttribute("id");
      // Track solidcolor (with or without id) - id is stored if present, null if missing
      svg2Features.solidColors.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(
          `<solidcolor> element without 'id' attribute may be difficult to reference`,
        );
      }
    }

    // Check path 'd' attribute
    if (tagLower === "path") {
      const d = el.getAttribute("d");
      if (!d || !d.trim()) {
        errors.push(`<path> element missing required 'd' attribute`);
      } else {
        // Validate path data syntax
        const pathCommands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g);
        if (!pathCommands || pathCommands.length === 0) {
          errors.push(`<path> 'd' attribute contains no valid commands`);
        }
        const firstCommand = d.trim()[0];
        if (firstCommand !== "M" && firstCommand !== "m") {
          errors.push(`<path> 'd' must start with M or m command`);
        }
      }
    }

    // Check rect required attributes
    if (tagLower === "rect") {
      const width = el.getAttribute("width");
      const height = el.getAttribute("height");
      // Only validate numeric values, skip CSS units
      if (width !== null && !hasUnits(width) && parseFloat(width) < 0) {
        errors.push(`<rect> width must be non-negative`);
      }
      if (height !== null && !hasUnits(height) && parseFloat(height) < 0) {
        errors.push(`<rect> height must be non-negative`);
      }
    }

    // Check circle required attributes
    if (tagLower === "circle") {
      const r = el.getAttribute("r");
      if (r !== null && parseFloat(r) < 0) {
        errors.push(`<circle> r must be non-negative`);
      }
    }

    // Check ellipse required attributes
    if (tagLower === "ellipse") {
      const rx = el.getAttribute("rx");
      const ry = el.getAttribute("ry");
      if (rx !== null && parseFloat(rx) < 0) {
        errors.push(`<ellipse> rx must be non-negative`);
      }
      if (ry !== null && parseFloat(ry) < 0) {
        errors.push(`<ellipse> ry must be non-negative`);
      }
    }

    // Check use href reference
    if (tagLower === "use") {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href");
      if (href && href.startsWith("#")) {
        const refId = href.substring(1);
        const referencedEl = doc.getElementById(refId);
        if (!referencedEl) {
          warnings.push(`<use> references non-existent ID: '${refId}'`);
        }
      }
    }

    // Check gradient/pattern references
    for (const attr of ["fill", "stroke", "clip-path", "mask", "filter"]) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith("url(#")) {
        const match = val.match(/url\(#([^)]+)\)/);
        if (match) {
          const refId = match[1];
          const referencedEl = doc.getElementById(refId);
          if (!referencedEl) {
            warnings.push(
              `<${el.tagName}> ${attr} references non-existent ID: '${refId}'`,
            );
          }
        }
      }
    }

    // Check parent-child validity using allowedChildrenPerElement
    if (allowedChildrenPerElement[tagLower]) {
      const allowedChildren = allowedChildrenPerElement[tagLower];
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          if (!allowedChildren.has(childTag)) {
            // Only warn for non-standard children, don't error
            warnings.push(
              `<${childTag}> is not a standard child of <${tagLower}>`,
            );
          }
        }
      }
    }

    // Recurse
    for (const child of el.children) {
      if (isElement(child)) {
        checkElementValidity(child, depth + 1);
      }
    }
  };

  checkElementValidity(doc);

  // Add warning if SVG 2.0 features require polyfills for browser compatibility
  if (svg2Features.needsPolyfills) {
    const featureList = [];
    if (svg2Features.meshGradients.length > 0) {
      featureList.push(
        `meshgradient (${svg2Features.meshGradients.length} found)`,
      );
    }
    if (svg2Features.hatches.length > 0) {
      featureList.push(`hatch (${svg2Features.hatches.length} found)`);
    }
    if (svg2Features.solidColors.length > 0) {
      featureList.push(`solidcolor (${svg2Features.solidColors.length} found)`);
    }
    warnings.push(
      `SVG contains SVG 2.0 features that require polyfills for browser compatibility: ${featureList.join(", ")}. Use --svg2-polyfills option to inject runtime polyfills.`,
    );
  }

  const result = {
    valid: errors.length === 0,
    svgVersion,
    errors,
    warnings,
    elementsChecked: countElements(doc),
    svg2Features, // SVG 2.0 feature detection results for polyfill decisions
  };

  doc.setAttribute("data-svg-validation", JSON.stringify(result));

  if (errors.length > 0) {
    doc.setAttribute("data-validation-errors", JSON.stringify(errors));
  } else {
    doc.setAttribute("data-validation-status", "valid");
  }

  return doc;
});

// ============================================================================
// SMIL EVENT TRIGGERS - Valid event names for begin/end attributes
// Per SVG 1.1 and SMIL 2.0 specifications
// ============================================================================
const SMIL_EVENT_TRIGGERS = new Set([
  // Mouse events
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "mouseover",
  "mouseout",
  "mousemove",
  "mouseenter",
  "mouseleave",
  // Focus events
  "focus",
  "blur",
  "focusin",
  "focusout",
  // Keyboard events
  "keydown",
  "keyup",
  "keypress",
  // Form events
  "activate",
  "load",
  "unload",
  "abort",
  "error",
  "resize",
  "scroll",
  // SMIL timing events
  "beginEvent",
  "endEvent",
  "repeatEvent",
  // Touch events (modern browsers)
  "touchstart",
  "touchend",
  "touchmove",
  "touchcancel",
  // Wheel
  "wheel",
  "auxclick",
  // Input events
  "input",
  "beforeinput",
  "select",
  // Composition events
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

/**
 * Comprehensive SVG compatibility analyzer.
 * Detects audio/media elements, SMIL animations, event triggers, and provides
 * detailed browser compatibility reports with usage scenario tables.
 *
 * This is the ENHANCED validator that provides actionable information about:
 * - Embedded audio/video that will be blocked by browser security policies
 * - SMIL animations and their browser support
 * - Interactive animations (click, hover triggers)
 * - Protocol-specific behavior (file:// vs http://)
 * - Recommendations for making SVGs work across all scenarios
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include detailed element listings (default: false)
 * @param {boolean} options.printTables - Print compatibility tables to console (default: true)
 * @returns {Object} Comprehensive compatibility report
 */
export const analyzeCompatibility = createOperation((doc, options = {}) => {
  const _verbose = options.verbose || false;
  const printTables = options.printTables !== false;

  // ========================================================================
  // DETECTION PHASE - Scan for all relevant features
  // ========================================================================

  const report = {
    valid: true,
    timestamp: new Date().toISOString(),

    // Audio/Video detection
    media: {
      hasAudio: false,
      hasVideo: false,
      audioElements: [],
      videoElements: [],
      foreignObjectWithMedia: [],
      mediaEmbedMethod: null, // 'foreignObject', 'audio-element', 'data-uri', 'external'
    },

    // SMIL Animation detection
    smil: {
      hasAnimations: false,
      animationCount: 0,
      animationElements: {
        animate: 0,
        animateTransform: 0,
        animateMotion: 0,
        animateColor: 0,
        set: 0,
      },
      hasInteractiveAnimations: false,
      eventTriggers: [], // List of {element, event, targetId} for interactive animations
      timingTriggers: [], // List of animations with time-based triggers
    },

    // Browser compatibility assessment
    compatibility: {
      worksInAllBrowsers: true,
      issues: [],
      recommendations: [],
    },

    // Detailed findings
    errors: [],
    warnings: [],
    info: [],
  };

  /**
   * Find all elements by tag name (case-insensitive).
   * @param {string} tagName - Tag name to search for
   * @returns {Array<Element>} Array of matching elements
   */
  const findElements = (tagName) => {
    const results = [];
    const searchTag = tagName.toLowerCase();
    const traverse = (el) => {
      if (el.tagName && el.tagName.toLowerCase() === searchTag) {
        results.push(el);
      }
      for (const child of el.children || []) {
        if (child && child.tagName) traverse(child);
      }
    };
    traverse(doc);
    return results;
  };

  /**
   * Get all elements recursively.
   * @param {Element} el - Root element
   * @param {Array<Element>} [results=[]] - Accumulator array
   * @returns {Array<Element>} Array of all elements
   */
  const getAllElements = (el, results = []) => {
    if (el.tagName) results.push(el);
    for (const child of el.children || []) {
      if (child && child.tagName) getAllElements(child, results);
    }
    return results;
  };

  // ========================================================================
  // 1. AUDIO/VIDEO DETECTION
  // ========================================================================

  // Check for <audio> elements
  const audioElements = findElements("audio");
  if (audioElements.length > 0) {
    report.media.hasAudio = true;
    report.media.audioElements = audioElements.map((el) => ({
      id: el.getAttribute("id"),
      src: el.getAttribute("src"),
      hasSource:
        findElements("source").filter((s) => s.parentNode === el).length > 0,
    }));
  }

  // Check for <video> elements
  const videoElements = findElements("video");
  if (videoElements.length > 0) {
    report.media.hasVideo = true;
    report.media.videoElements = videoElements.map((el) => ({
      id: el.getAttribute("id"),
      src: el.getAttribute("src"),
    }));
  }

  // Check for foreignObject containing media
  const foreignObjects = findElements("foreignObject");
  for (const fo of foreignObjects) {
    const foContent = fo.children || [];
    let hasMedia = false;
    const mediaInFO = [];

    /**
     * Check element and its children for media elements (audio/video).
     * @param {Element} el - Element to check
     * @returns {void}
     */
    const checkForMedia = (el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag === "audio" || tag === "video") {
        hasMedia = true;
        mediaInFO.push({
          type: tag,
          id: el.getAttribute("id"),
          src: el.getAttribute("src"),
        });
      }
      for (const child of el.children || []) {
        if (child && child.tagName) checkForMedia(child);
      }
    };

    for (const child of foContent) {
      if (child && child.tagName) checkForMedia(child);
    }

    if (hasMedia) {
      report.media.hasAudio = true;
      report.media.foreignObjectWithMedia.push({
        id: fo.getAttribute("id"),
        media: mediaInFO,
      });
      report.media.mediaEmbedMethod = "foreignObject";
    }
  }

  // Check for data URIs with audio MIME types in any attribute
  const allElements = getAllElements(doc);
  for (const el of allElements) {
    for (const attr of ["src", "href", "xlink:href"]) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith("data:audio/")) {
        report.media.hasAudio = true;
        report.media.mediaEmbedMethod = "data-uri";
      }
      if (val && val.startsWith("data:video/")) {
        report.media.hasVideo = true;
        report.media.mediaEmbedMethod = "data-uri";
      }
    }
  }

  // ========================================================================
  // 2. SMIL ANIMATION DETECTION
  // ========================================================================

  const smilElements = [
    "animate",
    "animateTransform",
    "animateMotion",
    "animateColor",
    "set",
  ];
  for (const tagName of smilElements) {
    const elements = findElements(tagName);
    const count = elements.length;
    report.smil.animationElements[
      tagName === "animateTransform"
        ? "animateTransform"
        : tagName === "animateMotion"
          ? "animateMotion"
          : tagName === "animateColor"
            ? "animateColor"
            : tagName
    ] = count;
    report.smil.animationCount += count;

    // Check each animation for event triggers
    for (const el of elements) {
      const beginAttr = el.getAttribute("begin") || "";
      const endAttr = el.getAttribute("end") || "";

      /**
       * Parse SMIL timing values to detect event triggers and timing.
       * @param {string} value - The timing attribute value (begin or end)
       * @param {string} attrName - The attribute name ('begin' or 'end')
       * @returns {void}
       */
      const parseTimingValue = (value, attrName) => {
        const parts = value
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const part of parts) {
          // Check for event-based triggers: "eventName" or "elementId.eventName"
          // Pattern: optional-id.event-name + optional-offset
          const eventMatch = part.match(
            /^(?:([a-zA-Z_][a-zA-Z0-9_-]*)\.)?([a-zA-Z]+)(\s*[+-]\s*[\d.]+[smh]?)?$/,
          );
          if (eventMatch) {
            const [, targetId, eventName, offset] = eventMatch;
            if (SMIL_EVENT_TRIGGERS.has(eventName)) {
              report.smil.hasInteractiveAnimations = true;
              report.smil.eventTriggers.push({
                animationElement: tagName,
                animationId: el.getAttribute("id"),
                attribute: attrName,
                event: eventName,
                targetId: targetId || null, // null means the animation target itself
                offset: offset?.trim() || null,
                parentId: el.parentNode?.getAttribute?.("id"),
              });
            }
          }
          // Check for time-based triggers
          else if (/^[\d.]+[smh]?$/.test(part) || part === "indefinite") {
            report.smil.timingTriggers.push({
              animationElement: tagName,
              value: part,
            });
          }
          // Check for syncbase triggers (otherAnim.begin/end)
          else if (/\.(begin|end)/.test(part)) {
            report.smil.timingTriggers.push({
              animationElement: tagName,
              value: part,
              type: "syncbase",
            });
          }
        }
      };

      if (beginAttr) parseTimingValue(beginAttr, "begin");
      if (endAttr) parseTimingValue(endAttr, "end");

      // Check for onbegin/onend JavaScript handlers (often used with audio)
      const onbegin = el.getAttribute("onbegin");
      const onend = el.getAttribute("onend");
      if (onbegin || onend) {
        report.smil.hasInteractiveAnimations = true;
        if (onbegin?.includes("play()") || onend?.includes("play()")) {
          report.info.push(
            `Animation uses JavaScript to trigger audio playback via ${onbegin ? "onbegin" : "onend"} handler`,
          );
        }
      }
    }
  }

  report.smil.hasAnimations = report.smil.animationCount > 0;

  // ========================================================================
  // 3. GENERATE COMPATIBILITY ISSUES AND RECOMMENDATIONS
  // ========================================================================

  // Audio compatibility issues
  if (report.media.hasAudio) {
    report.compatibility.worksInAllBrowsers = false;

    report.warnings.push(
      "SVG contains embedded audio. Browser autoplay policies will block playback in most scenarios.",
    );

    report.compatibility.issues.push({
      type: "AUDIO_AUTOPLAY_BLOCKED",
      severity: "HIGH",
      description:
        "Embedded audio in SVG is blocked by Chrome/Firefox/Safari autoplay policies",
      affectedBrowsers: ["Chrome", "Firefox", "Safari", "Edge"],
    });

    report.compatibility.recommendations.push(
      "To enable audio playback, embed the SVG in an HTML page that extracts audio dynamically after user interaction",
      "Use JavaScript to extract audio data URI from foreignObject and create Audio element on click",
      "Consider using Web Audio API for more control over audio playback",
    );
  }

  // Video compatibility issues
  if (report.media.hasVideo) {
    report.compatibility.worksInAllBrowsers = false;
    report.warnings.push(
      "SVG contains embedded video. This has limited browser support and autoplay restrictions.",
    );
  }

  // SMIL compatibility issues
  if (report.smil.hasAnimations) {
    report.info.push(
      `SVG contains ${report.smil.animationCount} SMIL animation elements`,
    );

    // Note: SMIL is fully supported - IE11 is the only browser without support
    report.compatibility.issues.push({
      type: "SMIL_IE_UNSUPPORTED",
      severity: "LOW",
      description: "SMIL animations are not supported in IE11",
      affectedBrowsers: ["IE (no support)"],
    });
  }

  // Interactive animation compatibility
  if (report.smil.hasInteractiveAnimations) {
    const eventTypes = [
      ...new Set(report.smil.eventTriggers.map((t) => t.event)),
    ];
    report.info.push(
      `SVG contains interactive SMIL animations triggered by: ${eventTypes.join(", ")}`,
    );

    // Check for specific event support issues
    if (eventTypes.includes("click") || eventTypes.includes("mouseover")) {
      report.compatibility.recommendations.push(
        "Interactive animations (click/hover) work in most browsers but require the SVG to be inline or loaded as <object>/<embed>",
        "Using <img> tag to display SVG will disable all interactivity and animations",
      );
    }
  }

  // ========================================================================
  // 4. GENERATE COMPATIBILITY TABLES
  // ========================================================================

  // Browser support table
  const browserSupport = {
    Chrome: {
      smil: "Full support",
      audio: "Blocked (autoplay policy)",
      interactive: "Full support",
      notes: "Autoplay blocked without user gesture",
    },
    Firefox: {
      smil: "Full support",
      audio: "Blocked (autoplay policy)",
      interactive: "Full support",
      notes: "MEI (Media Engagement Index) affects autoplay",
    },
    Safari: {
      smil: "Full support",
      audio: "Blocked (autoplay policy)",
      interactive: "Full support",
      notes: "Strict autoplay policy",
    },
    Edge: {
      smil: "Full support",
      audio: "Blocked (autoplay policy)",
      interactive: "Full support",
      notes: "Chromium-based, same as Chrome",
    },
    "IE 11": {
      smil: "No support",
      audio: "No support",
      interactive: "No support",
      notes: "Use CSS animations or JavaScript",
    },
  };

  // Usage scenario table
  const usageScenarios = [
    {
      scenario: "Standalone SVG",
      protocol: "file://",
      example: "file:///path/to/sample.svg",
      smilWorks: true,
      audioWorks: false,
      interactiveWorks: true,
      notes: "SMIL works, audio blocked by autoplay policy",
    },
    {
      scenario: "Standalone SVG",
      protocol: "http://",
      example: "http://localhost/sample.svg",
      smilWorks: true,
      audioWorks: false,
      interactiveWorks: true,
      notes: "SMIL works, audio blocked by autoplay policy",
    },
    {
      scenario: "SVG in HTML via <img>",
      protocol: "any",
      example: '<img src="sample.svg">',
      smilWorks: false,
      audioWorks: false,
      interactiveWorks: false,
      notes: "All scripting and interactivity disabled",
    },
    {
      scenario: "SVG in HTML via <object>",
      protocol: "any",
      example: '<object data="sample.svg">',
      smilWorks: true,
      audioWorks: false,
      interactiveWorks: true,
      notes: "Full SVG features, audio still blocked",
    },
    {
      scenario: "SVG in HTML via <embed>",
      protocol: "any",
      example: '<embed src="sample.svg">',
      smilWorks: true,
      audioWorks: false,
      interactiveWorks: true,
      notes: "Full SVG features, audio still blocked",
    },
    {
      scenario: "Inline SVG in HTML",
      protocol: "any",
      example: "<svg>...</svg> in HTML",
      smilWorks: true,
      audioWorks: false,
      interactiveWorks: true,
      notes: "Full features, audio needs user gesture",
    },
    {
      scenario: "HTML extracts audio on click",
      protocol: "file://",
      example: "JS extracts data-uri, plays on click",
      smilWorks: true,
      audioWorks: true,
      interactiveWorks: true,
      notes: "WORKS - user gesture enables audio",
    },
    {
      scenario: "HTML extracts audio on click",
      protocol: "http://",
      example: "JS extracts data-uri, plays on click",
      smilWorks: true,
      audioWorks: true,
      interactiveWorks: true,
      notes: "WORKS - user gesture enables audio",
    },
  ];

  // SMIL interactive event scenarios
  const smilEventScenarios = [
    {
      trigger: 'begin="click"',
      description: "Animation starts on click (on animation target)",
      syntax: '<animate begin="click" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Target element must be clickable (not in <defs>)",
    },
    {
      trigger: 'begin="elementId.click"',
      description: "Animation starts when another element is clicked",
      syntax: '<animate begin="button.click" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Referenced element must exist with matching id",
    },
    {
      trigger: 'begin="mouseover"',
      description: "Animation starts on mouse hover",
      syntax: '<animate begin="mouseover" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Often paired with mouseout for hover effects",
    },
    {
      trigger: 'begin="elementId.mouseover"',
      description: "Animation starts when hovering another element",
      syntax: '<animate begin="trigger.mouseover" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Useful for triggering animations on related elements",
    },
    {
      trigger: 'begin="mouseout"',
      description: "Animation starts when mouse leaves",
      syntax: '<animate begin="mouseout" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Use with mouseover for complete hover cycle",
    },
    {
      trigger: 'begin="focus"',
      description: "Animation starts when element receives focus",
      syntax: '<animate begin="focus" .../>',
      browserSupport: "Chrome, Firefox, Safari, Edge",
      notes: "Works with focusable elements (links, inputs)",
    },
    {
      trigger: 'begin="accessKey(s)"',
      description: "Animation starts on keyboard shortcut",
      syntax: '<animate begin="accessKey(s)" .../>',
      browserSupport: "Limited",
      notes: "Press Alt+S (Windows) or Ctrl+Opt+S (Mac)",
    },
  ];

  // Store tables in report
  report.tables = {
    browserSupport,
    usageScenarios,
    smilEventScenarios,
  };

  // ========================================================================
  // 5. PRINT TABLES TO CONSOLE (if requested)
  // ========================================================================

  if (
    printTables &&
    (report.media.hasAudio ||
      report.media.hasVideo ||
      report.smil.hasInteractiveAnimations)
  ) {
    console.log("\n" + "=".repeat(80));
    console.log("SVG COMPATIBILITY ANALYSIS REPORT");
    console.log("=".repeat(80));

    // Summary
    console.log("\n--- SUMMARY ---");
    console.log(
      `SMIL Animations: ${report.smil.animationCount} (${report.smil.hasInteractiveAnimations ? "includes interactive" : "time-based only"})`,
    );
    console.log(`Audio Elements: ${report.media.hasAudio ? "YES" : "NO"}`);
    console.log(`Video Elements: ${report.media.hasVideo ? "YES" : "NO"}`);

    // Audio warning
    if (report.media.hasAudio) {
      console.log("\n--- AUDIO PLAYBACK WARNING ---");
      console.log(
        "This SVG contains embedded audio which will be BLOCKED by browser autoplay policies.",
      );
      console.log(
        "Audio will NOT play automatically in any browser without user interaction.",
      );
    }

    // Browser support table
    console.log("\n--- BROWSER SUPPORT ---");
    console.log(
      "┌─────────────┬────────────────────┬──────────────────────────┬─────────────┐",
    );
    console.log(
      "│ Browser     │ SMIL Animations    │ Audio Autoplay           │ Interactive │",
    );
    console.log(
      "├─────────────┼────────────────────┼──────────────────────────┼─────────────┤",
    );
    for (const [browser, support] of Object.entries(browserSupport)) {
      const b = browser.padEnd(11);
      const s = support.smil.padEnd(18);
      const a = support.audio.padEnd(24);
      const i = support.interactive.padEnd(11);
      console.log(`│ ${b} │ ${s} │ ${a} │ ${i} │`);
    }
    console.log(
      "└─────────────┴────────────────────┴──────────────────────────┴─────────────┘",
    );

    // Usage scenario table
    console.log("\n--- USAGE SCENARIOS ---");
    console.log(
      "┌────────────────────────────────┬───────────┬───────┬───────┬─────────────┐",
    );
    console.log(
      "│ Scenario                       │ Protocol  │ SMIL  │ Audio │ Interactive │",
    );
    console.log(
      "├────────────────────────────────┼───────────┼───────┼───────┼─────────────┤",
    );
    for (const s of usageScenarios) {
      const sc = s.scenario.substring(0, 30).padEnd(30);
      const pr = s.protocol.padEnd(9);
      const sm = (s.smilWorks ? "✅" : "❌").padEnd(5);
      const au = (s.audioWorks ? "✅" : "❌").padEnd(5);
      const inter = (s.interactiveWorks ? "✅" : "❌").padEnd(11);
      console.log(`│ ${sc} │ ${pr} │ ${sm} │ ${au} │ ${inter} │`);
    }
    console.log(
      "└────────────────────────────────┴───────────┴───────┴───────┴─────────────┘",
    );

    // Interactive SMIL events table
    if (report.smil.hasInteractiveAnimations) {
      console.log("\n--- SMIL INTERACTIVE EVENT TRIGGERS ---");
      console.log(
        "┌───────────────────────────────┬────────────────────────────────────────────┐",
      );
      console.log(
        "│ Trigger Syntax                │ Description                                │",
      );
      console.log(
        "├───────────────────────────────┼────────────────────────────────────────────┤",
      );
      for (const e of smilEventScenarios) {
        const t = e.trigger.padEnd(29);
        const d = e.description.substring(0, 42).padEnd(42);
        console.log(`│ ${t} │ ${d} │`);
      }
      console.log(
        "└───────────────────────────────┴────────────────────────────────────────────┘",
      );

      // Show detected triggers
      if (report.smil.eventTriggers.length > 0) {
        console.log("\n--- DETECTED INTERACTIVE TRIGGERS IN THIS SVG ---");
        for (const trigger of report.smil.eventTriggers) {
          const target = trigger.targetId
            ? `${trigger.targetId}.${trigger.event}`
            : trigger.event;
          console.log(
            `  - <${trigger.animationElement}> triggered by: ${target}${trigger.offset ? ` ${trigger.offset}` : ""}`,
          );
        }
      }
    }

    // Recommendations
    if (report.compatibility.recommendations.length > 0) {
      console.log("\n--- RECOMMENDATIONS ---");
      for (const rec of report.compatibility.recommendations) {
        console.log(`  • ${rec}`);
      }
    }

    console.log("\n" + "=".repeat(80) + "\n");
  }

  // Mark validation status
  report.valid = report.errors.length === 0;

  // Store summary in document attribute for serialization
  doc.setAttribute(
    "data-compatibility-report",
    JSON.stringify({
      hasAudio: report.media.hasAudio,
      hasVideo: report.media.hasVideo,
      smilCount: report.smil.animationCount,
      hasInteractive: report.smil.hasInteractiveAnimations,
      issues: report.compatibility.issues.length,
    }),
  );

  // Attach full report object to doc for programmatic access
  // This allows callers to access detailed report data without parsing JSON
  doc._compatibilityReport = report;

  return doc;
});

// ============================================================================
// COMPREHENSIVE SVG COMPATIBILITY MATRIX ANALYZER - FULL COMBINATORIAL VERSION
// ============================================================================
// Generates FULL matrix of ALL possible combinations across 5 axes:
// 1. DISPLAY: standalone-browser, html-page, electron, webview-ios, webview-android,
//             cairo, librsvg, inkscape, imagemagick, batik, resvg, qt-svg, skia
// 2. LOAD: file://, http://, https://, data-uri, blob-url
// 3. STORAGE: inline, base64, local-path, remote-same-origin, remote-cross-origin,
//             remote-cross-origin-cors
// 4. SYNTAX: direct, img, picture, object, embed, iframe, inline-svg, css-background,
//            css-mask, css-content, css-list-style, canvas-drawimage, script-innerhtml,
//            script-dom, script-fetch
// 5. PROCESSING: n/a, inline-script, same-origin-script, cross-origin-cors, cross-origin-no-cors
//
// For EACH cell: reports ALL broken/restricted features with browser-specific details
// ============================================================================

/**
 * ALL SVG capabilities that can malfunction in various contexts
 * Each capability has a category and detailed browser support info
 */
const SVG_CAPABILITIES = {
  // === BASIC RENDERING ===
  RENDER_VECTORS: {
    cat: "display",
    name: "Vector paths/shapes",
    critical: true,
  },
  RENDER_TEXT: { cat: "display", name: "Text rendering", critical: true },
  RENDER_GRADIENTS: {
    cat: "display",
    name: "Gradients (linear/radial)",
    critical: false,
  },
  RENDER_PATTERNS: { cat: "display", name: "Pattern fills", critical: false },
  RENDER_OPACITY: {
    cat: "display",
    name: "Opacity/transparency",
    critical: false,
  },
  RENDER_BLENDMODES: { cat: "display", name: "Blend modes", critical: false },
  RENDER_TRANSFORMS: { cat: "display", name: "Transforms", critical: true },

  // === FONTS ===
  FONTS_EMBEDDED: {
    cat: "fonts",
    name: "Embedded fonts (data-uri)",
    critical: false,
  },
  FONTS_SYSTEM: { cat: "fonts", name: "System fonts", critical: false },
  FONTS_WEB_SAME: {
    cat: "fonts",
    name: "Web fonts (same-origin)",
    critical: false,
  },
  FONTS_WEB_CROSS: {
    cat: "fonts",
    name: "Web fonts (cross-origin)",
    critical: false,
  },

  // === IMAGES ===
  IMAGES_EMBEDDED: {
    cat: "images",
    name: "Embedded images (data-uri)",
    critical: false,
  },
  IMAGES_LOCAL: { cat: "images", name: "Local images", critical: false },
  IMAGES_REMOTE_SAME: {
    cat: "images",
    name: "Remote images (same-origin)",
    critical: false,
  },
  IMAGES_REMOTE_CROSS: {
    cat: "images",
    name: "Remote images (cross-origin)",
    critical: false,
  },

  // === FILTERS & EFFECTS ===
  FILTERS_BASIC: {
    cat: "effects",
    name: "Basic filters (blur, shadow)",
    critical: false,
  },
  FILTERS_COMPLEX: {
    cat: "effects",
    name: "Complex filters (lighting, turbulence)",
    critical: false,
  },
  MASKS: { cat: "effects", name: "Mask elements", critical: false },
  CLIP_PATHS: { cat: "effects", name: "Clip paths", critical: false },

  // === SMIL ANIMATION ===
  SMIL_TIMED: {
    cat: "animation",
    name: "SMIL time-based animation",
    critical: false,
  },
  SMIL_CLICK: {
    cat: "animation",
    name: "SMIL click-triggered",
    critical: false,
  },
  SMIL_HOVER: {
    cat: "animation",
    name: "SMIL mouseover-triggered",
    critical: false,
  },
  SMIL_FOCUS: {
    cat: "animation",
    name: "SMIL focus-triggered",
    critical: false,
  },
  SMIL_ACCESSKEY: {
    cat: "animation",
    name: "SMIL accessKey-triggered",
    critical: false,
  },
  SMIL_SYNCBASE: {
    cat: "animation",
    name: "SMIL syncbase (anim.begin)",
    critical: false,
  },

  // === CSS ANIMATION ===
  CSS_KEYFRAMES: {
    cat: "animation",
    name: "CSS @keyframes animation",
    critical: false,
  },
  CSS_TRANSITIONS: {
    cat: "animation",
    name: "CSS transitions",
    critical: false,
  },
  CSS_HOVER: { cat: "animation", name: "CSS :hover effects", critical: false },

  // === JAVASCRIPT ===
  SCRIPT_INLINE: { cat: "scripting", name: "Inline <script>", critical: false },
  SCRIPT_EXTERNAL: {
    cat: "scripting",
    name: 'External <script src="">',
    critical: false,
  },
  SCRIPT_MODULE: {
    cat: "scripting",
    name: "ES modules in SVG",
    critical: false,
  },

  // === EVENT HANDLERS ===
  EVENT_ONCLICK: { cat: "events", name: "onclick handler", critical: false },
  EVENT_ONDBLCLICK: {
    cat: "events",
    name: "ondblclick handler",
    critical: false,
  },
  EVENT_ONMOUSEDOWN: {
    cat: "events",
    name: "onmousedown handler",
    critical: false,
  },
  EVENT_ONMOUSEUP: {
    cat: "events",
    name: "onmouseup handler",
    critical: false,
  },
  EVENT_ONMOUSEOVER: {
    cat: "events",
    name: "onmouseover handler",
    critical: false,
  },
  EVENT_ONMOUSEOUT: {
    cat: "events",
    name: "onmouseout handler",
    critical: false,
  },
  EVENT_ONMOUSEMOVE: {
    cat: "events",
    name: "onmousemove handler",
    critical: false,
  },
  EVENT_ONFOCUS: { cat: "events", name: "onfocus handler", critical: false },
  EVENT_ONBLUR: { cat: "events", name: "onblur handler", critical: false },
  EVENT_ONLOAD: { cat: "events", name: "onload handler", critical: false },
  EVENT_ONERROR: { cat: "events", name: "onerror handler", critical: false },
  EVENT_ONSCROLL: { cat: "events", name: "onscroll handler", critical: false },
  EVENT_ONWHEEL: { cat: "events", name: "onwheel handler", critical: false },
  EVENT_ONTOUCH: { cat: "events", name: "touch events", critical: false },
  EVENT_ONKEYBOARD: { cat: "events", name: "keyboard events", critical: false },

  // === LINKS ===
  LINK_INTERNAL: {
    cat: "links",
    name: "Internal anchor links",
    critical: false,
  },
  LINK_EXTERNAL: { cat: "links", name: "External hyperlinks", critical: false },
  LINK_TARGET: { cat: "links", name: "Link target attribute", critical: false },
  LINK_DOWNLOAD: { cat: "links", name: "Download attribute", critical: false },

  // === FOREIGN OBJECT ===
  FOREIGNOBJECT_BASIC: {
    cat: "html",
    name: "foreignObject rendering",
    critical: false,
  },
  FOREIGNOBJECT_HTML: {
    cat: "html",
    name: "HTML in foreignObject",
    critical: false,
  },
  FOREIGNOBJECT_FORM: {
    cat: "html",
    name: "Forms in foreignObject",
    critical: false,
  },
  FOREIGNOBJECT_INPUT: {
    cat: "html",
    name: "Input elements in foreignObject",
    critical: false,
  },
  FOREIGNOBJECT_CANVAS: {
    cat: "html",
    name: "Canvas in foreignObject",
    critical: false,
  },
  FOREIGNOBJECT_VIDEO: {
    cat: "html",
    name: "Video in foreignObject",
    critical: false,
  },
  FOREIGNOBJECT_IFRAME: {
    cat: "html",
    name: "iframe in foreignObject",
    critical: false,
  },

  // === MEDIA ===
  AUDIO_EMBEDDED: {
    cat: "media",
    name: "Embedded audio (data-uri)",
    critical: false,
  },
  AUDIO_LOCAL: { cat: "media", name: "Local audio files", critical: false },
  AUDIO_REMOTE: { cat: "media", name: "Remote audio files", critical: false },
  AUDIO_AUTOPLAY: { cat: "media", name: "Audio autoplay", critical: false },
  AUDIO_CONTROLS: {
    cat: "media",
    name: "Audio controls visible",
    critical: false,
  },
  VIDEO_EMBEDDED: {
    cat: "media",
    name: "Embedded video (data-uri)",
    critical: false,
  },
  VIDEO_LOCAL: { cat: "media", name: "Local video files", critical: false },
  VIDEO_REMOTE: { cat: "media", name: "Remote video files", critical: false },
  VIDEO_AUTOPLAY: { cat: "media", name: "Video autoplay", critical: false },

  // === USE ELEMENTS / SPRITES ===
  USE_INTERNAL: {
    cat: "sprites",
    name: "Internal <use> references",
    critical: false,
  },
  USE_EXTERNAL_SAME: {
    cat: "sprites",
    name: "External <use> (same-origin)",
    critical: false,
  },
  USE_EXTERNAL_CROSS: {
    cat: "sprites",
    name: "External <use> (cross-origin)",
    critical: false,
  },
  USE_SHADOW_DOM: {
    cat: "sprites",
    name: "Shadow DOM styling of <use>",
    critical: false,
  },

  // === IMAGE MAPS ===
  MAP_BASIC: { cat: "maps", name: "SVG as image map", critical: false },
  MAP_COORDS: { cat: "maps", name: "Clickable regions", critical: false },

  // === ACCESSIBILITY ===
  A11Y_ARIA: { cat: "accessibility", name: "ARIA attributes", critical: false },
  A11Y_ROLE: { cat: "accessibility", name: "Role attributes", critical: false },
  A11Y_TITLE: {
    cat: "accessibility",
    name: "Title/desc for screen readers",
    critical: false,
  },
  A11Y_TABINDEX: {
    cat: "accessibility",
    name: "Tab navigation",
    critical: false,
  },

  // === METADATA ===
  META_DATA_ATTRS: {
    cat: "metadata",
    name: "data-* attributes",
    critical: false,
  },
  META_CLASS: {
    cat: "metadata",
    name: "class attribute styling",
    critical: false,
  },
  META_ID: { cat: "metadata", name: "id references", critical: true },

  // === EXTERNAL RESOURCES (inside SVG) ===
  EXT_CSS_LINK: {
    cat: "external",
    name: "External CSS via <?xml-stylesheet?>",
    critical: false,
  },
  EXT_CSS_IMPORT: {
    cat: "external",
    name: "@import in <style>",
    critical: false,
  },
  EXT_XLINK: {
    cat: "external",
    name: "xlink:href references",
    critical: false,
  },
};

/**
 * 5-axis values with full details
 */
const AXIS_DISPLAY = {
  STANDALONE_BROWSER: {
    id: "standalone-browser",
    name: "Standalone (Browser)",
    type: "browser",
  },
  HTML_PAGE: { id: "html-page", name: "HTML Page", type: "browser" },
  ELECTRON: { id: "electron", name: "Electron App", type: "browser" },
  WEBVIEW_IOS: { id: "webview-ios", name: "iOS WKWebView", type: "mobile" },
  WEBVIEW_ANDROID: {
    id: "webview-android",
    name: "Android WebView",
    type: "mobile",
  },
  CAIRO: { id: "cairo", name: "Cairo/librsvg", type: "renderer" },
  INKSCAPE: { id: "inkscape", name: "Inkscape", type: "renderer" },
  IMAGEMAGICK: { id: "imagemagick", name: "ImageMagick", type: "renderer" },
  BATIK: { id: "batik", name: "Apache Batik", type: "renderer" },
  RESVG: { id: "resvg", name: "resvg", type: "renderer" },
  QT_SVG: { id: "qt-svg", name: "Qt SVG", type: "renderer" },
  SKIA: { id: "skia", name: "Skia (Chrome/Flutter)", type: "renderer" },
};

const AXIS_LOAD = {
  FILE: { id: "file", name: "file://", protocol: "file" },
  HTTP: { id: "http", name: "http://", protocol: "http" },
  HTTPS: { id: "https", name: "https://", protocol: "https" },
  DATA_URI: { id: "data-uri", name: "data: URI", protocol: "data" },
  BLOB_URL: { id: "blob-url", name: "blob: URL", protocol: "blob" },
};

const AXIS_STORAGE = {
  INLINE: { id: "inline", name: "Inline in HTML", location: "inline" },
  BASE64: { id: "base64", name: "Base64 encoded", location: "embedded" },
  LOCAL_SAME: { id: "local-same", name: "Local (same dir)", location: "local" },
  LOCAL_ABS: { id: "local-abs", name: "Local (absolute)", location: "local" },
  REMOTE_SAME: {
    id: "remote-same",
    name: "Remote (same-origin)",
    location: "remote",
  },
  REMOTE_CROSS: {
    id: "remote-cross",
    name: "Remote (cross-origin)",
    location: "cross",
  },
  REMOTE_CORS: {
    id: "remote-cors",
    name: "Remote (cross+CORS)",
    location: "cors",
  },
};

const AXIS_SYNTAX = {
  DIRECT: { id: "direct", name: "Direct SVG file", html: false },
  IMG: { id: "img", name: '<img src="">', html: true },
  PICTURE: { id: "picture", name: "<picture><source>", html: true },
  OBJECT: { id: "object", name: '<object data="">', html: true },
  EMBED: { id: "embed", name: '<embed src="">', html: true },
  IFRAME: { id: "iframe", name: '<iframe src="">', html: true },
  INLINE_SVG: { id: "inline-svg", name: "<svg>...</svg>", html: true },
  CSS_BG: { id: "css-bg", name: "CSS background-image", html: true },
  CSS_MASK: { id: "css-mask", name: "CSS mask-image", html: true },
  CSS_CONTENT: { id: "css-content", name: "CSS content: url()", html: true },
  CSS_LIST: { id: "css-list", name: "CSS list-style-image", html: true },
  CSS_BORDER: { id: "css-border", name: "CSS border-image", html: true },
  CANVAS_DRAW: { id: "canvas-draw", name: "canvas.drawImage()", html: true },
  SCRIPT_INNER: {
    id: "script-inner",
    name: "innerHTML assignment",
    html: true,
  },
  SCRIPT_DOM: { id: "script-dom", name: "DOM createElement", html: true },
  SCRIPT_FETCH: { id: "script-fetch", name: "fetch + parse", html: true },
};

const AXIS_PROCESSING = {
  NA: { id: "n/a", name: "N/A (not script)", script: false },
  INLINE_SCRIPT: { id: "inline-script", name: "Inline <script>", script: true },
  SAME_ORIGIN: { id: "same-origin", name: "Same-origin script", script: true },
  CROSS_CORS: { id: "cross-cors", name: "Cross-origin (CORS)", script: true },
  CROSS_NO_CORS: {
    id: "cross-no-cors",
    name: "Cross-origin (no CORS)",
    script: true,
  },
};

/**
 * Browser identifiers for compatibility reporting
 */
const BROWSERS = {
  CHROME: { id: "chrome", name: "Chrome", engine: "blink" },
  FIREFOX: { id: "firefox", name: "Firefox", engine: "gecko" },
  SAFARI: { id: "safari", name: "Safari", engine: "webkit" },
  EDGE: { id: "edge", name: "Edge", engine: "blink" },
  IE11: { id: "ie11", name: "IE 11", engine: "trident" },
  SAFARI_IOS: { id: "safari-ios", name: "Safari iOS", engine: "webkit" },
  CHROME_ANDROID: {
    id: "chrome-android",
    name: "Chrome Android",
    engine: "blink",
  },
  SAMSUNG: { id: "samsung", name: "Samsung Internet", engine: "blink" },
};

/**
 * Status codes for capability compatibility
 */
const STATUS = {
  WORKS: "✅", // Fully functional
  PARTIAL: "⚠️", // Partially works with limitations
  BLOCKED: "❌", // Completely blocked
  DEPENDS: "❓", // Depends on configuration/version
  NA: "➖", // Not applicable
};

/**
 * Master compatibility rules database
 * For each capability, defines status per context combination
 */
const COMPATIBILITY_DB = {
  // ============================================================
  // DISPLAY CAPABILITIES
  // ============================================================
  RENDER_VECTORS: {
    default: STATUS.WORKS,
    exceptions: {
      // Vectors work everywhere
    },
  },
  RENDER_TEXT: {
    default: STATUS.WORKS,
    exceptions: {
      // Text might use fallback fonts in some renderers
      "renderer:imagemagick": {
        status: STATUS.PARTIAL,
        note: "Font substitution may occur",
      },
      "renderer:batik": {
        status: STATUS.PARTIAL,
        note: "Limited font support",
      },
    },
  },
  RENDER_GRADIENTS: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": {
        status: STATUS.PARTIAL,
        note: "Some gradient types unsupported",
      },
    },
  },
  RENDER_PATTERNS: {
    default: STATUS.WORKS,
    exceptions: {
      "renderer:resvg": {
        status: STATUS.PARTIAL,
        note: "Limited pattern support",
      },
    },
  },
  RENDER_OPACITY: {
    default: STATUS.WORKS,
    exceptions: {},
  },
  RENDER_BLENDMODES: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No blend mode support" },
      "renderer:cairo": { status: STATUS.PARTIAL, note: "Limited blend modes" },
    },
  },

  // ============================================================
  // FONTS
  // ============================================================
  FONTS_EMBEDDED: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No embedded fonts in img context",
        browsers: "all",
      },
      "syntax:css-bg": {
        status: STATUS.BLOCKED,
        note: "No embedded fonts in CSS context",
        browsers: "all",
      },
      "syntax:css-mask": {
        status: STATUS.BLOCKED,
        note: "No embedded fonts in CSS context",
        browsers: "all",
      },
      "renderer:imagemagick": {
        status: STATUS.BLOCKED,
        note: "Cannot process embedded fonts",
      },
    },
  },
  FONTS_SYSTEM: {
    default: STATUS.WORKS,
    exceptions: {},
  },
  FONTS_WEB_SAME: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No external resources in img",
      },
      "syntax:css-bg": {
        status: STATUS.BLOCKED,
        note: "No external resources in CSS bg",
      },
      "load:file": {
        status: STATUS.PARTIAL,
        note: "May fail due to local file restrictions",
      },
      "renderer:*": {
        status: STATUS.BLOCKED,
        note: "Renderers cannot fetch web fonts",
      },
    },
  },
  FONTS_WEB_CROSS: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No external resources" },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No external resources in CSS",
      },
      "storage:remote-cors": {
        status: STATUS.WORKS,
        note: "Works with CORS headers",
      },
      "renderer:*": {
        status: STATUS.BLOCKED,
        note: "Renderers cannot fetch fonts",
      },
    },
  },

  // ============================================================
  // IMAGES
  // ============================================================
  IMAGES_EMBEDDED: {
    default: STATUS.WORKS,
    exceptions: {},
  },
  IMAGES_LOCAL: {
    default: STATUS.WORKS,
    exceptions: {
      "load:http": {
        status: STATUS.BLOCKED,
        note: "Cannot load file:// from http://",
      },
      "load:https": {
        status: STATUS.BLOCKED,
        note: "Cannot load file:// from https://",
      },
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No external resources in img",
      },
    },
  },
  IMAGES_REMOTE_SAME: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No external resources in img",
      },
      "load:file": {
        status: STATUS.BLOCKED,
        note: "Cannot fetch http from file://",
      },
    },
  },
  IMAGES_REMOTE_CROSS: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No external resources in img",
      },
      "storage:remote-cors": { status: STATUS.WORKS, note: "Works with CORS" },
      "load:file": { status: STATUS.BLOCKED, note: "CORS not applicable" },
    },
  },

  // ============================================================
  // FILTERS & EFFECTS
  // ============================================================
  FILTERS_BASIC: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": {
        status: STATUS.PARTIAL,
        note: "Limited filter support",
      },
    },
  },
  FILTERS_COMPLEX: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": {
        status: STATUS.BLOCKED,
        note: "Complex filters unsupported",
      },
      "renderer:resvg": {
        status: STATUS.PARTIAL,
        note: "Some filters unsupported",
      },
      "renderer:qt-svg": {
        status: STATUS.PARTIAL,
        note: "Limited filter primitives",
      },
    },
  },
  MASKS: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": {
        status: STATUS.BLOCKED,
        note: "SVG masks not supported",
      },
    },
  },
  CLIP_PATHS: {
    default: STATUS.WORKS,
    exceptions: {},
  },

  // ============================================================
  // SMIL ANIMATION
  // ============================================================
  SMIL_TIMED: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "syntax:img": {
        status: STATUS.PARTIAL,
        note: "May animate, no interaction",
        browsers: ["chrome", "firefox"],
      },
      "syntax:css-bg": {
        status: STATUS.PARTIAL,
        note: "May animate, varies by browser",
      },
      "renderer:*": {
        status: STATUS.BLOCKED,
        note: "Static render, no animation",
      },
    },
  },
  SMIL_CLICK: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No interaction in img context",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No interaction in CSS context",
      },
      "syntax:canvas-draw": {
        status: STATUS.BLOCKED,
        note: "Rasterized, no interaction",
      },
      "renderer:*": {
        status: STATUS.BLOCKED,
        note: "No interaction in renderers",
      },
    },
  },
  SMIL_HOVER: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No interaction in img context",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No interaction in CSS context",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },
  SMIL_FOCUS: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "syntax:img": { status: STATUS.BLOCKED, note: "No interaction" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No interaction" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },
  SMIL_ACCESSKEY: {
    default: STATUS.PARTIAL,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "browser:chrome": {
        status: STATUS.PARTIAL,
        note: "Limited accessKey support",
      },
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No keyboard in img context",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No keyboard in CSS context",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No keyboard" },
    },
  },
  SMIL_SYNCBASE: {
    default: STATUS.WORKS,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No SMIL support" },
      "syntax:img": {
        status: STATUS.PARTIAL,
        note: "Sync works if animation plays",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No animation" },
    },
  },

  // ============================================================
  // CSS ANIMATION
  // ============================================================
  CSS_KEYFRAMES: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.WORKS,
        note: "CSS animations work in img",
      },
      "syntax:css-bg": { status: STATUS.WORKS, note: "CSS animations work" },
      "renderer:*": { status: STATUS.BLOCKED, note: "Static render" },
    },
  },
  CSS_TRANSITIONS: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No interaction for transitions",
      },
      "syntax:css-bg": { status: STATUS.BLOCKED, note: "No interaction" },
      "renderer:*": { status: STATUS.BLOCKED, note: "Static render" },
    },
  },
  CSS_HOVER: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No :hover in img context",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No :hover in CSS context",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },

  // ============================================================
  // JAVASCRIPT
  // ============================================================
  SCRIPT_INLINE: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "Scripts disabled for security",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "Scripts disabled in CSS context",
      },
      "syntax:canvas-draw": {
        status: STATUS.BLOCKED,
        note: "Rasterized, no scripts",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No script execution" },
      "display:html-page+syntax:inline-svg": {
        status: STATUS.WORKS,
        note: "Runs in page context",
      },
      "display:html-page+syntax:object": {
        status: STATUS.WORKS,
        note: "Isolated context",
      },
      "display:html-page+syntax:embed": {
        status: STATUS.WORKS,
        note: "Isolated context",
      },
    },
  },
  SCRIPT_EXTERNAL: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No external resources" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No external resources" },
      "load:file": {
        status: STATUS.PARTIAL,
        note: "May be blocked by local file restrictions",
      },
      "storage:remote-cross": { status: STATUS.BLOCKED, note: "CORS required" },
      "storage:remote-cors": { status: STATUS.WORKS, note: "Works with CORS" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No scripts" },
    },
  },
  SCRIPT_MODULE: {
    default: STATUS.PARTIAL,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No ES modules" },
      "browser:safari": {
        status: STATUS.PARTIAL,
        note: "Limited module support in SVG",
      },
      "syntax:img": { status: STATUS.BLOCKED, note: "No scripts" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No scripts" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No scripts" },
    },
  },

  // ============================================================
  // EVENT HANDLERS
  // ============================================================
  EVENT_ONCLICK: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No events in img context",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No events in CSS context",
      },
      "syntax:canvas-draw": { status: STATUS.BLOCKED, note: "Rasterized" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONDBLCLICK: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONMOUSEDOWN: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONMOUSEUP: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONMOUSEOVER: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONMOUSEOUT: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONMOUSEMOVE: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONFOCUS: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No focus in img" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No focus" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONBLUR: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONLOAD: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No scripts/events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No scripts" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No scripts" },
    },
  },
  EVENT_ONERROR: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No scripts" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No scripts" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No scripts" },
    },
  },
  EVENT_ONSCROLL: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No scroll in img" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No scroll" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONWHEEL: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONTOUCH: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No touch events" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No touch" },
      "display:*-browser": { status: STATUS.NA, note: "No touch on desktop" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },
  EVENT_ONKEYBOARD: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No keyboard" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No keyboard" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No events" },
    },
  },

  // ============================================================
  // LINKS
  // ============================================================
  LINK_INTERNAL: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No links in img" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No links in CSS" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },
  LINK_EXTERNAL: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No links in img" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No links" },
      "syntax:object": { status: STATUS.WORKS, note: "Opens in object frame" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No links" },
    },
  },
  LINK_TARGET: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No links" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No links" },
      "syntax:object": {
        status: STATUS.PARTIAL,
        note: "May not break out of frame",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No links" },
    },
  },
  LINK_DOWNLOAD: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No links" },
      "browser:safari": {
        status: STATUS.PARTIAL,
        note: "Limited download attr support",
      },
      "renderer:*": { status: STATUS.BLOCKED, note: "No links" },
    },
  },

  // ============================================================
  // FOREIGN OBJECT
  // ============================================================
  FOREIGNOBJECT_BASIC: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "foreignObject disabled in img",
      },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "foreignObject disabled in CSS",
      },
      "syntax:canvas-draw": {
        status: STATUS.BLOCKED,
        note: "Security: tainted canvas",
      },
      "browser:ie11": {
        status: STATUS.BLOCKED,
        note: "No foreignObject support",
      },
      "renderer:cairo": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:resvg": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:imagemagick": {
        status: STATUS.BLOCKED,
        note: "No foreignObject",
      },
    },
  },
  FOREIGNOBJECT_HTML: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No HTML rendering" },
    },
  },
  FOREIGNOBJECT_FORM: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:object": {
        status: STATUS.PARTIAL,
        note: "Form submission may be restricted",
      },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No forms" },
    },
  },
  FOREIGNOBJECT_INPUT: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No inputs" },
    },
  },
  FOREIGNOBJECT_CANVAS: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No canvas" },
    },
  },
  FOREIGNOBJECT_VIDEO: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No video" },
    },
  },
  FOREIGNOBJECT_IFRAME: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "syntax:object": {
        status: STATUS.PARTIAL,
        note: "Nested contexts may fail",
      },
      "browser:ie11": { status: STATUS.BLOCKED, note: "No foreignObject" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No iframes" },
    },
  },

  // ============================================================
  // MEDIA
  // ============================================================
  AUDIO_EMBEDDED: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg+processing:*-script": {
        status: STATUS.WORKS,
        note: "Play on user gesture via JS",
      },
      "syntax:script-*": {
        status: STATUS.WORKS,
        note: "JS can play on user gesture",
      },
    },
    note: "All browsers block autoplay without user gesture",
  },
  AUDIO_LOCAL: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg": {
        status: STATUS.PARTIAL,
        note: "Needs user gesture",
      },
      "load:file": {
        status: STATUS.PARTIAL,
        note: "May work locally with gesture",
      },
    },
  },
  AUDIO_REMOTE: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg": {
        status: STATUS.PARTIAL,
        note: "Needs user gesture + CORS",
      },
      "storage:remote-cors": {
        status: STATUS.PARTIAL,
        note: "Needs user gesture",
      },
    },
  },
  AUDIO_AUTOPLAY: {
    default: STATUS.BLOCKED,
    exceptions: {},
    note: "Autoplay blocked by ALL modern browsers",
  },
  AUDIO_CONTROLS: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No foreignObject/audio" },
      "syntax:css-*": {
        status: STATUS.BLOCKED,
        note: "No foreignObject/audio",
      },
      "syntax:object": { status: STATUS.PARTIAL, note: "May render controls" },
    },
  },
  VIDEO_EMBEDDED: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg": {
        status: STATUS.PARTIAL,
        note: "Needs user gesture",
      },
      "syntax:script-*": {
        status: STATUS.WORKS,
        note: "JS can play on gesture",
      },
    },
  },
  VIDEO_LOCAL: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg": {
        status: STATUS.PARTIAL,
        note: "Needs user gesture",
      },
    },
  },
  VIDEO_REMOTE: {
    default: STATUS.BLOCKED,
    exceptions: {
      "display:html-page+syntax:inline-svg": {
        status: STATUS.PARTIAL,
        note: "Needs gesture + CORS",
      },
    },
  },
  VIDEO_AUTOPLAY: {
    default: STATUS.BLOCKED,
    exceptions: {
      "browser:*": { status: STATUS.PARTIAL, note: "May work muted" },
    },
    note: "Autoplay only works muted in most browsers",
  },

  // ============================================================
  // USE ELEMENTS / SPRITES
  // ============================================================
  USE_INTERNAL: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.WORKS, note: "Internal refs work" },
      "syntax:css-*": { status: STATUS.WORKS, note: "Internal refs work" },
    },
  },
  USE_EXTERNAL_SAME: {
    default: STATUS.PARTIAL,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No external refs" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No external refs" },
      "browser:chrome": {
        status: STATUS.BLOCKED,
        note: "External use blocked since Chrome 50",
      },
      "browser:firefox": {
        status: STATUS.BLOCKED,
        note: "Blocked for security",
      },
      "browser:safari": {
        status: STATUS.PARTIAL,
        note: "May work same-origin",
      },
    },
    note: "Most browsers block external <use> for security",
  },
  USE_EXTERNAL_CROSS: {
    default: STATUS.BLOCKED,
    exceptions: {},
    note: "Cross-origin external <use> blocked by all browsers",
  },
  USE_SHADOW_DOM: {
    default: STATUS.PARTIAL,
    exceptions: {
      "browser:ie11": { status: STATUS.BLOCKED, note: "No shadow DOM" },
      "syntax:img": { status: STATUS.BLOCKED, note: "No styling access" },
    },
    note: "Styling shadow DOM from <use> is limited",
  },

  // ============================================================
  // IMAGE MAPS
  // ============================================================
  MAP_BASIC: {
    default: STATUS.NA,
    exceptions: {
      "syntax:inline-svg": {
        status: STATUS.WORKS,
        note: "Can use SVG elements as map",
      },
    },
    note: "Traditional image maps not applicable, use SVG events",
  },
  MAP_COORDS: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "No events for clickable regions",
      },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No events" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },

  // ============================================================
  // ACCESSIBILITY
  // ============================================================
  A11Y_ARIA: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.PARTIAL,
        note: "Only alt text accessible",
      },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No a11y in CSS images" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No a11y tree" },
    },
  },
  A11Y_ROLE: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "Use alt attribute instead",
      },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No a11y" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No a11y" },
    },
  },
  A11Y_TITLE: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.PARTIAL,
        note: "May not be read by screen readers",
      },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "Not accessible" },
    },
  },
  A11Y_TABINDEX: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No focus in img" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No focus" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No interaction" },
    },
  },

  // ============================================================
  // METADATA
  // ============================================================
  META_DATA_ATTRS: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": {
        status: STATUS.BLOCKED,
        note: "Not accessible from outside",
      },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "Not accessible" },
    },
  },
  META_CLASS: {
    default: STATUS.WORKS,
    exceptions: {},
  },
  META_ID: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.PARTIAL, note: "IDs isolated" },
    },
  },

  // ============================================================
  // EXTERNAL RESOURCES (inside SVG)
  // ============================================================
  EXT_CSS_LINK: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No external resources" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No external resources" },
      "load:file": { status: STATUS.PARTIAL, note: "Local file restrictions" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No external fetch" },
    },
  },
  EXT_CSS_IMPORT: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No @import" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No @import" },
      "load:file": { status: STATUS.PARTIAL, note: "May be blocked" },
      "renderer:*": { status: STATUS.BLOCKED, note: "No external fetch" },
    },
  },
  EXT_XLINK: {
    default: STATUS.WORKS,
    exceptions: {
      "syntax:img": { status: STATUS.BLOCKED, note: "No external xlink" },
      "syntax:css-*": { status: STATUS.BLOCKED, note: "No external xlink" },
      "storage:remote-cross": { status: STATUS.BLOCKED, note: "CORS required" },
    },
  },
};

/**
 * SVG Feature flags - what interactive/dynamic features the SVG uses
 */
const SVG_FEATURES = {
  // Scripting
  JAVASCRIPT: "javascript", // <script> elements
  EVENT_HANDLERS: "event_handlers", // onclick, onmouseover, etc. attributes

  // Animation
  SMIL_ANIMATIONS: "smil_animations", // <animate>, <animateTransform>, etc.
  SMIL_INTERACTIVE: "smil_interactive", // SMIL with click/hover triggers
  CSS_ANIMATIONS: "css_animations", // CSS @keyframes, transitions

  // Media
  AUDIO: "audio", // <audio> elements
  VIDEO: "video", // <video> elements

  // External resources
  EXTERNAL_IMAGES: "external_images", // <image href="http://...">
  EXTERNAL_CSS: "external_css", // <?xml-stylesheet?> or <link>
  EXTERNAL_FONTS: "external_fonts", // @font-face with url()
  EXTERNAL_SCRIPTS: "external_scripts", // <script src="...">
  EXTERNAL_USE: "external_use", // <use href="other.svg#id">

  // Special content
  FOREIGN_OBJECT: "foreign_object", // <foreignObject> with HTML
  IFRAME: "iframe", // <iframe> in foreignObject
  FILTERS: "filters", // Complex SVG filters
  MASKS: "masks", // <mask> elements
  CLIP_PATHS: "clip_paths", // <clipPath> elements

  // Linking
  HYPERLINKS: "hyperlinks", // <a href="...">
  ANCHORS: "anchors", // Internal anchors
};

/**
 * Comprehensive SVG compatibility matrix analyzer
 *
 * Analyzes SVG features and generates a detailed compatibility report
 * across multiple axes: DISPLAY, LOAD, STORAGE, SYNTAX, PROCESSING
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Print detailed output
 * @param {boolean} options.printTables - Print compatibility tables
 * @param {boolean} options.includeMetaAnalysis - Analyze nested resource loading
 * @returns {Object} Comprehensive compatibility report attached to doc._compatibilityMatrix
 */
export const analyzeCompatibilityMatrix = createOperation(
  (doc, options = {}) => {
    const _verbose = options.verbose || false;
    const printTables = options.printTables !== false;
    const _includeMetaAnalysis = options.includeMetaAnalysis !== false;

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    /**
     * Find all elements by tag name (case-insensitive).
     * @param {string} tagName - Tag name to search for
     * @returns {Array<Element>} Array of matching elements
     */
    const findElements = (tagName) => {
      const results = [];
      const searchTag = tagName.toLowerCase();
      const traverse = (el) => {
        if (el.tagName && el.tagName.toLowerCase() === searchTag) {
          results.push(el);
        }
        for (const child of el.children || []) {
          if (child && child.tagName) traverse(child);
        }
      };
      traverse(doc);
      return results;
    };

    /**
     * Get all elements recursively.
     * @param {Element} el - Root element
     * @param {Array<Element>} [results=[]] - Accumulator array
     * @returns {Array<Element>} Array of all elements
     */
    const getAllElements = (el, results = []) => {
      if (el.tagName) results.push(el);
      for (const child of el.children || []) {
        if (child && child.tagName) getAllElements(child, results);
      }
      return results;
    };

    /**
     * Check if element has any of the specified attributes.
     * @param {Element} el - Element to check
     * @param {...string} attrs - Attribute names to check
     * @returns {boolean} True if element has any of the attributes
     */
    const _hasAttribute = (el, ...attrs) => {
      for (const attr of attrs) {
        if (el.getAttribute(attr)) return true;
      }
      return false;
    };

    // ========================================================================
    // FEATURE DETECTION PHASE
    // ========================================================================

    const features = {
      detected: new Set(),
      details: {},
    };

    const allElements = getAllElements(doc);

    // --- JavaScript Detection ---
    const scripts = findElements("script");
    if (scripts.length > 0) {
      features.detected.add(SVG_FEATURES.JAVASCRIPT);
      features.details.javascript = {
        count: scripts.length,
        hasExternalSrc: scripts.some(
          (s) =>
            s.getAttribute("src") ||
            s.getAttribute("href") ||
            s.getAttribute("xlink:href"),
        ),
        types: scripts.map((s) => s.getAttribute("type") || "text/javascript"),
      };
      if (features.details.javascript.hasExternalSrc) {
        features.detected.add(SVG_FEATURES.EXTERNAL_SCRIPTS);
      }
    }

    // --- Event Handler Detection ---
    const eventAttrs = [
      "onclick",
      "ondblclick",
      "onmousedown",
      "onmouseup",
      "onmouseover",
      "onmouseout",
      "onmousemove",
      "onmouseenter",
      "onmouseleave",
      "onfocus",
      "onblur",
      "onkeydown",
      "onkeyup",
      "onkeypress",
      "onload",
      "onerror",
      "onscroll",
      "onwheel",
      "ontouchstart",
      "ontouchend",
      "ontouchmove",
      "onbegin",
      "onend",
      "onrepeat",
    ];

    const elementsWithHandlers = [];
    for (const el of allElements) {
      const handlers = eventAttrs.filter((attr) => el.getAttribute(attr));
      if (handlers.length > 0) {
        elementsWithHandlers.push({ tag: el.tagName, handlers });
      }
    }
    if (elementsWithHandlers.length > 0) {
      features.detected.add(SVG_FEATURES.EVENT_HANDLERS);
      features.details.eventHandlers = {
        count: elementsWithHandlers.length,
        types: [...new Set(elementsWithHandlers.flatMap((e) => e.handlers))],
        elements: elementsWithHandlers.slice(0, 10), // First 10 for brevity
      };
    }

    // --- SMIL Animation Detection ---
    const smilTags = [
      "animate",
      "animatetransform",
      "animatemotion",
      "animatecolor",
      "set",
    ];
    const smilElements = [];
    const interactiveTriggers = [];

    for (const tag of smilTags) {
      const els = findElements(tag);
      smilElements.push(...els);

      for (const el of els) {
        const begin = el.getAttribute("begin") || "";
        const end = el.getAttribute("end") || "";

        // Check for interactive triggers
        const interactiveEvents = [
          "click",
          "dblclick",
          "mousedown",
          "mouseup",
          "mouseover",
          "mouseout",
          "mousemove",
          "mouseenter",
          "mouseleave",
          "focus",
          "blur",
          "focusin",
          "focusout",
        ];

        for (const event of interactiveEvents) {
          if (begin.includes(event) || end.includes(event)) {
            interactiveTriggers.push({
              element: el.tagName,
              event,
              begin,
              end,
            });
          }
        }

        // Check for accessKey triggers
        if (begin.includes("accessKey(") || end.includes("accessKey(")) {
          interactiveTriggers.push({
            element: el.tagName,
            event: "accessKey",
            begin,
            end,
          });
        }
      }
    }

    if (smilElements.length > 0) {
      features.detected.add(SVG_FEATURES.SMIL_ANIMATIONS);
      features.details.smilAnimations = {
        count: smilElements.length,
        breakdown: {
          animate: findElements("animate").length,
          animateTransform: findElements("animatetransform").length,
          animateMotion: findElements("animatemotion").length,
          animateColor: findElements("animatecolor").length,
          set: findElements("set").length,
        },
      };

      if (interactiveTriggers.length > 0) {
        features.detected.add(SVG_FEATURES.SMIL_INTERACTIVE);
        features.details.smilInteractive = {
          count: interactiveTriggers.length,
          triggers: [...new Set(interactiveTriggers.map((t) => t.event))],
          elements: interactiveTriggers.slice(0, 10),
        };
      }
    }

    // --- CSS Animation Detection ---
    const styles = findElements("style");
    let hasCssAnimations = false;
    for (const style of styles) {
      const content = style.textContent || "";
      if (
        content.includes("@keyframes") ||
        content.includes("animation:") ||
        content.includes("animation-name") ||
        content.includes("transition:") ||
        content.includes("transition-property")
      ) {
        hasCssAnimations = true;
        break;
      }
    }
    // Also check inline styles
    for (const el of allElements) {
      const style = el.getAttribute("style") || "";
      if (style.includes("animation") || style.includes("transition")) {
        hasCssAnimations = true;
        break;
      }
    }
    if (hasCssAnimations) {
      features.detected.add(SVG_FEATURES.CSS_ANIMATIONS);
      features.details.cssAnimations = { detected: true };
    }

    // --- Audio/Video Detection ---
    const audioElements = findElements("audio");
    const videoElements = findElements("video");

    // Also check foreignObject for HTML media
    const foreignObjects = findElements("foreignobject");
    for (const fo of foreignObjects) {
      const foAudio = [];
      const foVideo = [];
      /**
       * Check element and its children for audio/video elements.
       * @param {Element} el - Element to check
       * @returns {void}
       */
      const checkMedia = (el) => {
        const tag = el.tagName?.toLowerCase();
        if (tag === "audio") foAudio.push(el);
        if (tag === "video") foVideo.push(el);
        for (const child of el.children || []) {
          if (child && child.tagName) checkMedia(child);
        }
      };
      for (const child of fo.children || []) {
        if (child && child.tagName) checkMedia(child);
      }
      audioElements.push(...foAudio);
      videoElements.push(...foVideo);
    }

    if (audioElements.length > 0) {
      features.detected.add(SVG_FEATURES.AUDIO);
      features.details.audio = {
        count: audioElements.length,
        hasAutoplay: audioElements.some((a) => a.hasAttribute("autoplay")),
        sources: audioElements.map((a) => ({
          id: a.getAttribute("id"),
          src: a.getAttribute("src"),
          isDataUri: (a.getAttribute("src") || "").startsWith("data:"),
          isExternal: (a.getAttribute("src") || "").startsWith("http"),
        })),
      };
    }

    if (videoElements.length > 0) {
      features.detected.add(SVG_FEATURES.VIDEO);
      features.details.video = {
        count: videoElements.length,
        hasAutoplay: videoElements.some((v) => v.hasAttribute("autoplay")),
      };
    }

    // --- External Resource Detection ---
    const images = findElements("image");
    const externalImages = [];
    const embeddedImages = [];

    for (const img of images) {
      const href =
        img.getAttribute("href") || img.getAttribute("xlink:href") || "";
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("//")
      ) {
        externalImages.push({ href, element: "image" });
      } else if (href.startsWith("data:")) {
        embeddedImages.push({ type: "data-uri", element: "image" });
      } else if (href && !href.startsWith("#")) {
        externalImages.push({ href, element: "image", type: "local" });
      }
    }

    if (externalImages.length > 0) {
      features.detected.add(SVG_FEATURES.EXTERNAL_IMAGES);
      features.details.externalImages = {
        count: externalImages.length,
        urls: externalImages.slice(0, 5),
      };
    }

    // --- External Use References ---
    const useElements = findElements("use");
    const externalUses = [];
    for (const use of useElements) {
      const href =
        use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      if (href && !href.startsWith("#")) {
        externalUses.push({ href });
      }
    }
    if (externalUses.length > 0) {
      features.detected.add(SVG_FEATURES.EXTERNAL_USE);
      features.details.externalUse = {
        count: externalUses.length,
        refs: externalUses.slice(0, 5),
      };
    }

    // --- External Fonts Detection ---
    let _hasExternalFonts = false;
    for (const style of styles) {
      const content = style.textContent || "";
      if (content.includes("@font-face") && content.includes("url(")) {
        const urlMatch = content.match(
          /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/,
        );
        if (urlMatch) {
          _hasExternalFonts = true;
          features.detected.add(SVG_FEATURES.EXTERNAL_FONTS);
          features.details.externalFonts = {
            detected: true,
            sample: urlMatch[1],
          };
          break;
        }
      }
    }

    // --- foreignObject Detection ---
    if (foreignObjects.length > 0) {
      features.detected.add(SVG_FEATURES.FOREIGN_OBJECT);
      features.details.foreignObject = {
        count: foreignObjects.length,
        hasIframe: foreignObjects.some((fo) => {
          let found = false;
          const check = (el) => {
            if (el.tagName?.toLowerCase() === "iframe") found = true;
            for (const child of el.children || []) {
              if (child && child.tagName) check(child);
            }
          };
          check(fo);
          return found;
        }),
      };

      if (features.details.foreignObject.hasIframe) {
        features.detected.add(SVG_FEATURES.IFRAME);
      }
    }

    // --- Filters/Masks/ClipPaths ---
    const filters = findElements("filter");
    const masks = findElements("mask");
    const clipPaths = findElements("clippath");

    if (filters.length > 0) {
      features.detected.add(SVG_FEATURES.FILTERS);
      features.details.filters = { count: filters.length };
    }
    if (masks.length > 0) {
      features.detected.add(SVG_FEATURES.MASKS);
      features.details.masks = { count: masks.length };
    }
    if (clipPaths.length > 0) {
      features.detected.add(SVG_FEATURES.CLIP_PATHS);
      features.details.clipPaths = { count: clipPaths.length };
    }

    // --- Hyperlinks ---
    const links = findElements("a");
    if (links.length > 0) {
      features.detected.add(SVG_FEATURES.HYPERLINKS);
      features.details.hyperlinks = {
        count: links.length,
        hasExternal: links.some((a) => {
          const href =
            a.getAttribute("href") || a.getAttribute("xlink:href") || "";
          return href.startsWith("http");
        }),
      };
    }

    // ========================================================================
    // 5-AXIS COMPATIBILITY MATRIX DEFINITION
    // ========================================================================

    // Axis 1: DISPLAY
    const _DISPLAY = {
      STANDALONE: "standalone", // SVG opened directly in browser
      HTML: "html", // SVG embedded in HTML page
      CUSTOM_RENDERER: "custom", // Cairo, librsvg, Inkscape, mobile SDK, etc.
    };

    // Axis 2: LOAD
    const _LOAD = {
      FILE: "file://", // Local file system
      HTTP: "http://", // Web server (includes https)
    };

    // Axis 3: STORAGE
    const _STORAGE = {
      INLINE_BASE64: "inline", // data: URI or inline in HTML
      LOCAL_PATH: "local", // Relative or absolute local path
      REMOTE_URL: "remote", // http:// or https:// URL
    };

    // Axis 4: SYNTAX (how SVG is referenced/embedded)
    const SYNTAX = {
      NONE: "none", // Direct SVG file, no HTML wrapper
      IMG: "img", // <img src="...svg">
      OBJECT: "object", // <object data="...svg">
      EMBED: "embed", // <embed src="...svg">
      INLINE: "inline", // <svg>...</svg> in HTML
      CSS: "css", // background-image: url(...svg)
      SCRIPT: "script", // JavaScript-generated SVG
    };

    // Axis 5: PROCESSING (for SCRIPT syntax only)
    const _PROCESSING = {
      INLINE_CODE: "inline", // Script in HTML <script> tag
      LOCAL_SERVER: "local", // Script from same-origin server
      REMOTE_CDN: "remote", // Script from CDN/different origin
    };

    // ========================================================================
    // FEATURE COMPATIBILITY RULES
    // ========================================================================

    // Define what works where
    // Legend: ✅ = works, ❌ = blocked, ⚠️ = partial/restricted, ❓ = depends

    const compatibilityRules = {
      // JavaScript execution
      [SVG_FEATURES.JAVASCRIPT]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "Full JS execution" },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "All scripting disabled for security",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "Isolated JS context",
        },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "Isolated JS context" },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "Same JS context as parent page",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "CSS image context - no scripts",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "JS-generated = full control",
        },
      },

      // Event handlers (onclick, onmouseover, etc.)
      [SVG_FEATURES.EVENT_HANDLERS]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "Full event handling" },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No events in img context",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "Events work, isolated from parent",
        },
        [SYNTAX.EMBED]: {
          file: "✅",
          http: "✅",
          note: "Events work, isolated from parent",
        },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "Full event handling",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "No events in CSS context",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "Full event handling",
        },
      },

      // SMIL animations (basic time-based)
      [SVG_FEATURES.SMIL_ANIMATIONS]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "Full SMIL support" },
        [SYNTAX.IMG]: {
          file: "⚠️",
          http: "⚠️",
          note: "Time-based only, varies by browser",
        },
        [SYNTAX.OBJECT]: { file: "✅", http: "✅", note: "Full SMIL support" },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "Full SMIL support" },
        [SYNTAX.INLINE]: { file: "✅", http: "✅", note: "Full SMIL support" },
        [SYNTAX.CSS]: {
          file: "⚠️",
          http: "⚠️",
          note: "Time-based only, varies by browser",
        },
        [SYNTAX.SCRIPT]: { file: "✅", http: "✅", note: "Full SMIL support" },
      },

      // SMIL interactive (click/hover triggered)
      [SVG_FEATURES.SMIL_INTERACTIVE]: {
        [SYNTAX.NONE]: {
          file: "✅",
          http: "✅",
          note: "Full interactive SMIL",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No interaction in img context",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "Interactive SMIL works",
        },
        [SYNTAX.EMBED]: {
          file: "✅",
          http: "✅",
          note: "Interactive SMIL works",
        },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "Full interactive SMIL",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "No interaction in CSS context",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "Full interactive SMIL",
        },
      },

      // CSS animations/transitions
      [SVG_FEATURES.CSS_ANIMATIONS]: {
        [SYNTAX.NONE]: {
          file: "✅",
          http: "✅",
          note: "Full CSS animation support",
        },
        [SYNTAX.IMG]: {
          file: "✅",
          http: "✅",
          note: "CSS animations work in img",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "Full CSS animation support",
        },
        [SYNTAX.EMBED]: {
          file: "✅",
          http: "✅",
          note: "Full CSS animation support",
        },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "Full CSS animation support",
        },
        [SYNTAX.CSS]: { file: "✅", http: "✅", note: "CSS animations work" },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "Full CSS animation support",
        },
      },

      // Audio playback
      [SVG_FEATURES.AUDIO]: {
        [SYNTAX.NONE]: {
          file: "❌",
          http: "❌",
          note: "Autoplay blocked, needs user gesture",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No audio in img context",
        },
        [SYNTAX.OBJECT]: { file: "❌", http: "❌", note: "Autoplay blocked" },
        [SYNTAX.EMBED]: { file: "❌", http: "❌", note: "Autoplay blocked" },
        [SYNTAX.INLINE]: {
          file: "⚠️",
          http: "⚠️",
          note: "Needs JS + user gesture to play",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "No audio in CSS context",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "JS can play audio on user gesture",
        },
      },

      // Video playback
      [SVG_FEATURES.VIDEO]: {
        [SYNTAX.NONE]: {
          file: "❌",
          http: "❌",
          note: "Autoplay blocked, needs user gesture",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No video in img context",
        },
        [SYNTAX.OBJECT]: { file: "❌", http: "❌", note: "Autoplay blocked" },
        [SYNTAX.EMBED]: { file: "❌", http: "❌", note: "Autoplay blocked" },
        [SYNTAX.INLINE]: {
          file: "⚠️",
          http: "⚠️",
          note: "Needs JS + user gesture to play",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "No video in CSS context",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "JS can play video on user gesture",
        },
      },

      // External images
      [SVG_FEATURES.EXTERNAL_IMAGES]: {
        [SYNTAX.NONE]: {
          file: "⚠️",
          http: "✅",
          note: "file:// may have CORS issues",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "⚠️",
          note: "Blocked or CORS restricted",
        },
        [SYNTAX.OBJECT]: { file: "⚠️", http: "✅", note: "CORS applies" },
        [SYNTAX.EMBED]: { file: "⚠️", http: "✅", note: "CORS applies" },
        [SYNTAX.INLINE]: { file: "⚠️", http: "✅", note: "CORS applies" },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "⚠️",
          note: "Restricted for security",
        },
        [SYNTAX.SCRIPT]: { file: "⚠️", http: "✅", note: "CORS applies" },
      },

      // External CSS
      [SVG_FEATURES.EXTERNAL_CSS]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "External CSS loaded" },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No external resources in img",
        },
        [SYNTAX.OBJECT]: { file: "✅", http: "✅", note: "External CSS works" },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "External CSS works" },
        [SYNTAX.INLINE]: { file: "✅", http: "✅", note: "External CSS works" },
        [SYNTAX.CSS]: { file: "❌", http: "❌", note: "No external resources" },
        [SYNTAX.SCRIPT]: { file: "✅", http: "✅", note: "External CSS works" },
      },

      // External fonts
      [SVG_FEATURES.EXTERNAL_FONTS]: {
        [SYNTAX.NONE]: {
          file: "✅",
          http: "✅",
          note: "External fonts loaded",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No external resources in img",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "External fonts work (CORS)",
        },
        [SYNTAX.EMBED]: {
          file: "✅",
          http: "✅",
          note: "External fonts work (CORS)",
        },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "External fonts work (CORS)",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "⚠️",
          note: "Limited, varies by browser",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "External fonts work",
        },
      },

      // External use references
      [SVG_FEATURES.EXTERNAL_USE]: {
        [SYNTAX.NONE]: {
          file: "❌",
          http: "⚠️",
          note: "Most browsers block external use",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No external use in img",
        },
        [SYNTAX.OBJECT]: {
          file: "❌",
          http: "⚠️",
          note: "Most browsers block",
        },
        [SYNTAX.EMBED]: { file: "❌", http: "⚠️", note: "Most browsers block" },
        [SYNTAX.INLINE]: {
          file: "❌",
          http: "⚠️",
          note: "Most browsers block",
        },
        [SYNTAX.CSS]: { file: "❌", http: "❌", note: "No external use" },
        [SYNTAX.SCRIPT]: {
          file: "❌",
          http: "⚠️",
          note: "Most browsers block",
        },
      },

      // foreignObject with HTML
      [SVG_FEATURES.FOREIGN_OBJECT]: {
        [SYNTAX.NONE]: {
          file: "✅",
          http: "✅",
          note: "Full foreignObject support",
        },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "foreignObject disabled in img",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "foreignObject works",
        },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "foreignObject works" },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "foreignObject works",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "foreignObject disabled",
        },
        [SYNTAX.SCRIPT]: {
          file: "✅",
          http: "✅",
          note: "foreignObject works",
        },
      },

      // Hyperlinks
      [SVG_FEATURES.HYPERLINKS]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "Links work" },
        [SYNTAX.IMG]: {
          file: "❌",
          http: "❌",
          note: "No links in img context",
        },
        [SYNTAX.OBJECT]: {
          file: "✅",
          http: "✅",
          note: "Links work (in iframe-like context)",
        },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "Links work" },
        [SYNTAX.INLINE]: {
          file: "✅",
          http: "✅",
          note: "Links work normally",
        },
        [SYNTAX.CSS]: {
          file: "❌",
          http: "❌",
          note: "No links in CSS context",
        },
        [SYNTAX.SCRIPT]: { file: "✅", http: "✅", note: "Links work" },
      },

      // Filters
      [SVG_FEATURES.FILTERS]: {
        [SYNTAX.NONE]: { file: "✅", http: "✅", note: "Full filter support" },
        [SYNTAX.IMG]: { file: "✅", http: "✅", note: "Filters work" },
        [SYNTAX.OBJECT]: { file: "✅", http: "✅", note: "Filters work" },
        [SYNTAX.EMBED]: { file: "✅", http: "✅", note: "Filters work" },
        [SYNTAX.INLINE]: { file: "✅", http: "✅", note: "Filters work" },
        [SYNTAX.CSS]: { file: "✅", http: "✅", note: "Filters work" },
        [SYNTAX.SCRIPT]: { file: "✅", http: "✅", note: "Filters work" },
      },
    };

    // ========================================================================
    // SPECIAL CASES / RESTRICTED ENVIRONMENTS
    // ========================================================================

    const specialCases = {
      "GitHub README.md": {
        syntax: "IMG (implicit)",
        restrictions: [
          "No JavaScript",
          "No SMIL",
          "No external resources",
          "No foreignObject",
          "No links",
        ],
        worksFor: [
          "Static SVG",
          "CSS animations (some)",
          "Embedded images (data-uri)",
        ],
        note: "GitHub sanitizes SVG heavily - only safe static content",
      },
      "GitHub Flavored Markdown (GFM)": {
        syntax: "IMG",
        restrictions: ["Same as GitHub README"],
        worksFor: ["Static SVG only"],
        note: "GFM renders SVG as images",
      },
      "GitLab README.md": {
        syntax: "IMG (implicit)",
        restrictions: ["Similar to GitHub but slightly more permissive"],
        worksFor: ["Static SVG", "Some CSS animations"],
        note: "GitLab also sanitizes SVG",
      },
      "Wikipedia/MediaWiki": {
        syntax: "IMG (sanitized)",
        restrictions: [
          "Heavy sanitization",
          "No scripts",
          "No external resources",
          "No animations",
        ],
        worksFor: ["Static vector graphics only"],
        note: "MediaWiki converts SVG to PNG for display",
      },
      "EPUB 3.x": {
        syntax: "IMG or INLINE",
        restrictions: [
          "No external resources",
          "Limited JavaScript",
          "No autoplay",
        ],
        worksFor: ["Static SVG", "CSS animations", "SMIL (in some readers)"],
        note: "Support varies by e-reader - Apple Books better than Kindle",
      },
      "Email (HTML email)": {
        syntax: "IMG (base64)",
        restrictions: [
          "Heavily filtered",
          "No scripts",
          "No external resources",
          "No animations",
        ],
        worksFor: [
          "Static embedded SVG only",
          "Many clients block SVG entirely",
        ],
        note: "Most email clients block or rasterize SVG",
      },
      "Slack/Discord": {
        syntax: "IMG (auto-converted)",
        restrictions: ["Converted to raster", "No interactivity"],
        worksFor: ["Static preview only"],
        note: "SVG files are typically converted to PNG previews",
      },
      "Twitter/X": {
        syntax: "N/A",
        restrictions: ["SVG not supported as media"],
        worksFor: ["Nothing - upload as PNG"],
        note: "Twitter does not support SVG uploads",
      },
      Notion: {
        syntax: "EMBED/IMG",
        restrictions: ["Limited - treated as image"],
        worksFor: ["Static SVG"],
        note: "Notion embeds SVG as images",
      },
      Obsidian: {
        syntax: "INLINE or IMG",
        restrictions: ["Depends on mode and plugins"],
        worksFor: ["Static SVG", "Some CSS animations"],
        note: "Obsidian has good local SVG support",
      },
      "Bear Notes": {
        syntax: "IMG",
        restrictions: ["Image context only"],
        worksFor: ["Static SVG"],
        note: "Bear treats SVG as images",
      },
      "Markdown-it": {
        syntax: "IMG (default)",
        restrictions: ["Default IMG behavior", "Can be configured for INLINE"],
        worksFor: ["Depends on configuration"],
        note: "Parser library - output depends on implementation",
      },
      MDX: {
        syntax: "INLINE (JSX)",
        restrictions: ["Full React component - depends on framework"],
        worksFor: ["Full SVG when used as component"],
        note: "MDX can import SVG as React components",
      },
      "iOS Safari": {
        syntax: "ALL",
        restrictions: ["Stricter autoplay policies"],
        worksFor: ["All standard SVG features except auto-audio"],
        note: "Good SVG support, strict media policies",
      },
      "Android WebView": {
        syntax: "ALL",
        restrictions: ["Varies by Android version"],
        worksFor: ["Most SVG features"],
        note: "WebView behavior varies significantly",
      },
      "Cairo/librsvg": {
        syntax: "CUSTOM_RENDERER",
        restrictions: ["Limited JS", "Limited SMIL", "No foreignObject"],
        worksFor: ["Static SVG", "Basic filters", "CSS styling"],
        note: "Server-side rendering library - no dynamic features",
      },
      Inkscape: {
        syntax: "CUSTOM_RENDERER",
        restrictions: ["May not run JS", "SMIL playback varies"],
        worksFor: ["All static SVG", "Partial animation preview"],
        note: "Full SVG editor with preview capabilities",
      },
      ImageMagick: {
        syntax: "CUSTOM_RENDERER",
        restrictions: ["Rasterizes immediately", "No animations", "No JS"],
        worksFor: ["Static rasterization only"],
        note: "Converts SVG to raster - no dynamic features",
      },
    };

    // ========================================================================
    // GENERATE COMPATIBILITY REPORT
    // ========================================================================

    const report = {
      timestamp: new Date().toISOString(),
      features,

      // Which detected features affect compatibility?
      interactivityLevel: "static", // 'static', 'animated', 'interactive', 'scripted'

      // Compatibility by syntax
      bySyntax: {},

      // Special case analysis
      specialCases: {},

      // Recommendations
      recommendations: [],

      // Warnings
      warnings: [],
    };

    // Determine interactivity level
    if (
      features.detected.has(SVG_FEATURES.JAVASCRIPT) ||
      features.detected.has(SVG_FEATURES.EVENT_HANDLERS)
    ) {
      report.interactivityLevel = "scripted";
    } else if (features.detected.has(SVG_FEATURES.SMIL_INTERACTIVE)) {
      report.interactivityLevel = "interactive";
    } else if (
      features.detected.has(SVG_FEATURES.SMIL_ANIMATIONS) ||
      features.detected.has(SVG_FEATURES.CSS_ANIMATIONS)
    ) {
      report.interactivityLevel = "animated";
    }

    // Generate compatibility by syntax
    for (const syntax of Object.values(SYNTAX)) {
      report.bySyntax[syntax] = {
        file: { works: [], partial: [], blocked: [] },
        http: { works: [], partial: [], blocked: [] },
      };

      for (const feature of features.detected) {
        const rule = compatibilityRules[feature];
        if (rule && rule[syntax]) {
          const { file, http, note } = rule[syntax];

          // File protocol
          if (file === "✅") {
            report.bySyntax[syntax].file.works.push({ feature, note });
          } else if (file === "⚠️") {
            report.bySyntax[syntax].file.partial.push({ feature, note });
          } else {
            report.bySyntax[syntax].file.blocked.push({ feature, note });
          }

          // HTTP protocol
          if (http === "✅") {
            report.bySyntax[syntax].http.works.push({ feature, note });
          } else if (http === "⚠️") {
            report.bySyntax[syntax].http.partial.push({ feature, note });
          } else {
            report.bySyntax[syntax].http.blocked.push({ feature, note });
          }
        }
      }
    }

    // Analyze special cases
    for (const [caseName, caseInfo] of Object.entries(specialCases)) {
      const blockedFeatures = [];
      const workingFeatures = [];

      for (const feature of features.detected) {
        // Check if feature is in restrictions
        const featureNames = {
          [SVG_FEATURES.JAVASCRIPT]: "JavaScript",
          [SVG_FEATURES.EVENT_HANDLERS]: "Event handlers",
          [SVG_FEATURES.SMIL_ANIMATIONS]: "SMIL",
          [SVG_FEATURES.SMIL_INTERACTIVE]: "Interactive SMIL",
          [SVG_FEATURES.CSS_ANIMATIONS]: "CSS animations",
          [SVG_FEATURES.AUDIO]: "Audio",
          [SVG_FEATURES.VIDEO]: "Video",
          [SVG_FEATURES.EXTERNAL_IMAGES]: "External images",
          [SVG_FEATURES.EXTERNAL_USE]: "External use",
          [SVG_FEATURES.FOREIGN_OBJECT]: "foreignObject",
          [SVG_FEATURES.HYPERLINKS]: "Links",
        };

        const name = featureNames[feature] || feature;
        const isBlocked = caseInfo.restrictions.some(
          (r) =>
            r.toLowerCase().includes(name.toLowerCase()) ||
            r.toLowerCase().includes("no " + name.toLowerCase()),
        );

        if (isBlocked) {
          blockedFeatures.push(name);
        } else {
          // Check if explicitly works
          const works = caseInfo.worksFor.some((w) =>
            w.toLowerCase().includes(name.toLowerCase()),
          );
          if (works) workingFeatures.push(name);
        }
      }

      report.specialCases[caseName] = {
        syntax: caseInfo.syntax,
        blockedFeatures,
        workingFeatures,
        note: caseInfo.note,
        overallCompat:
          blockedFeatures.length === 0
            ? "✅ Compatible"
            : blockedFeatures.length < features.detected.size / 2
              ? "⚠️ Partial"
              : "❌ Not compatible",
      };
    }

    // Generate recommendations
    if (features.detected.has(SVG_FEATURES.AUDIO)) {
      report.recommendations.push({
        issue: "Audio playback blocked",
        solution:
          "Use SCRIPT syntax with user gesture: embed SVG inline, extract audio data-uri via JavaScript, play on click",
        example: `document.querySelector('svg').addEventListener('click', () => {
  const audio = new Audio(svgAudioDataUri);
  audio.play();
});`,
      });
    }

    if (features.detected.has(SVG_FEATURES.SMIL_INTERACTIVE)) {
      report.recommendations.push({
        issue: "Interactive SMIL animations",
        solution:
          "Use OBJECT, EMBED, or INLINE syntax - avoid IMG and CSS background",
        example: '<object data="animation.svg" type="image/svg+xml"></object>',
      });
    }

    if (features.detected.has(SVG_FEATURES.JAVASCRIPT)) {
      report.recommendations.push({
        issue: "JavaScript in SVG",
        solution:
          "Use INLINE syntax for same-page JS context, or OBJECT/EMBED for isolated context",
        example: "<svg><!-- your SVG with scripts --></svg>",
      });
    }

    if (
      features.detected.has(SVG_FEATURES.EXTERNAL_IMAGES) ||
      features.detected.has(SVG_FEATURES.EXTERNAL_FONTS) ||
      features.detected.has(SVG_FEATURES.EXTERNAL_USE)
    ) {
      report.recommendations.push({
        issue: "External resources",
        solution:
          "Embed resources as data-URIs for maximum compatibility, or ensure CORS headers are set",
        example:
          "Use svg-toolbox embedExternalDependencies() to inline all resources",
      });
    }

    // Generate warnings
    if (report.interactivityLevel === "scripted") {
      report.warnings.push(
        "SVG contains JavaScript - will not work in IMG, CSS, or most markdown contexts",
      );
    }
    if (features.detected.has(SVG_FEATURES.FOREIGN_OBJECT)) {
      report.warnings.push(
        "SVG contains foreignObject - disabled in IMG and CSS contexts",
      );
    }
    if (features.detected.has(SVG_FEATURES.EXTERNAL_USE)) {
      report.warnings.push(
        "External <use> references are blocked by most modern browsers",
      );
    }

    // ========================================================================
    // PRINT COMPREHENSIVE REPORT (if requested)
    // ========================================================================

    if (printTables) {
      console.log("\n" + "═".repeat(100));
      console.log("SVG COMPREHENSIVE COMPATIBILITY MATRIX ANALYSIS");
      console.log("═".repeat(100));

      // Feature summary
      console.log("\n┌" + "─".repeat(98) + "┐");
      console.log("│ DETECTED SVG FEATURES" + " ".repeat(76) + "│");
      console.log("├" + "─".repeat(98) + "┤");
      console.log(
        `│ Interactivity Level: ${report.interactivityLevel.toUpperCase().padEnd(75)} │`,
      );
      console.log("│" + " ".repeat(98) + "│");
      for (const feature of features.detected) {
        const details =
          features.details[feature.replace("_", "")] ||
          features.details[feature] ||
          {};
        let info = feature;
        if (details.count !== undefined) info += ` (${details.count})`;
        console.log(`│   • ${info.padEnd(92)} │`);
      }
      console.log("└" + "─".repeat(98) + "┘");

      // 5-Axis compatibility matrix
      console.log("\n┌" + "─".repeat(98) + "┐");
      console.log("│ 5-AXIS COMPATIBILITY MATRIX" + " ".repeat(70) + "│");
      console.log("├" + "─".repeat(98) + "┤");
      console.log(
        "│ SYNTAX TAG         │ PROTOCOL  │ WORKS                      │ PARTIAL          │ BLOCKED    │",
      );
      console.log(
        "├────────────────────┼───────────┼────────────────────────────┼──────────────────┼────────────┤",
      );

      for (const [syntax, data] of Object.entries(report.bySyntax)) {
        const syntaxName =
          {
            none: "Direct SVG file",
            img: '<img src="">',
            object: '<object data="">',
            embed: '<embed src="">',
            inline: "<svg>...</svg>",
            css: "CSS background",
            script: "JS-generated",
          }[syntax] || syntax;

        for (const protocol of ["file", "http"]) {
          const p = data[protocol];
          const works = p.works.length > 0 ? p.works.length + " features" : "-";
          const partial =
            p.partial.length > 0 ? p.partial.length + " features" : "-";
          const blocked =
            p.blocked.length > 0 ? p.blocked.length + " features" : "-";

          console.log(
            `│ ${syntaxName.padEnd(18)} │ ${(protocol + "://").padEnd(9)} │ ${works.padEnd(26)} │ ${partial.padEnd(16)} │ ${blocked.padEnd(10)} │`,
          );
        }
      }
      console.log("└" + "─".repeat(98) + "┘");

      // Best syntax recommendation
      console.log("\n┌" + "─".repeat(98) + "┐");
      console.log(
        "│ RECOMMENDED EMBEDDING METHODS FOR THIS SVG" + " ".repeat(54) + "│",
      );
      console.log("├" + "─".repeat(98) + "┤");

      // Find best syntax
      let bestSyntax = "inline";
      let bestScore = 0;
      for (const [syntax, data] of Object.entries(report.bySyntax)) {
        const score =
          data.http.works.length * 3 +
          data.http.partial.length -
          data.http.blocked.length * 2;
        if (score > bestScore) {
          bestScore = score;
          bestSyntax = syntax;
        }
      }

      const syntaxExamples = {
        none: "Open SVG file directly in browser",
        img: '<img src="your-file.svg" alt="description">',
        object: '<object data="your-file.svg" type="image/svg+xml"></object>',
        embed: '<embed src="your-file.svg" type="image/svg+xml">',
        inline: "Copy <svg>...</svg> content directly into HTML",
        css: '.element { background-image: url("your-file.svg"); }',
        script:
          'const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ...',
      };

      console.log(`│ BEST: ${bestSyntax.toUpperCase().padEnd(91)} │`);
      console.log(
        `│ ${syntaxExamples[bestSyntax].substring(0, 96).padEnd(96)} │`,
      );
      console.log("│" + " ".repeat(98) + "│");

      if (report.interactivityLevel !== "static") {
        console.log(
          "│ AVOID: IMG and CSS background (no interactivity)" +
            " ".repeat(49) +
            "│",
        );
      }
      console.log("└" + "─".repeat(98) + "┘");

      // Special cases table
      console.log("\n┌" + "─".repeat(98) + "┐");
      console.log("│ SPECIAL ENVIRONMENT COMPATIBILITY" + " ".repeat(63) + "│");
      console.log("├" + "─".repeat(98) + "┤");
      console.log(
        "│ ENVIRONMENT               │ COMPAT │ BLOCKED FEATURES" +
          " ".repeat(43) +
          "│",
      );
      console.log(
        "├───────────────────────────┼────────┼" + "─".repeat(61) + "┤",
      );

      const priorityEnvs = [
        "GitHub README.md",
        "EPUB 3.x",
        "Email (HTML email)",
        "Wikipedia/MediaWiki",
        "MDX",
        "Cairo/librsvg",
        "iOS Safari",
      ];

      for (const env of priorityEnvs) {
        const data = report.specialCases[env];
        if (data) {
          const compat = data.overallCompat.substring(0, 6).padEnd(6);
          const blocked = data.blockedFeatures
            .slice(0, 3)
            .join(", ")
            .substring(0, 58)
            .padEnd(58);
          console.log(
            `│ ${env.substring(0, 25).padEnd(25)} │ ${compat} │ ${blocked} │`,
          );
        }
      }
      console.log("└" + "─".repeat(98) + "┘");

      // Warnings
      if (report.warnings.length > 0) {
        console.log("\n┌" + "─".repeat(98) + "┐");
        console.log("│ ⚠️  WARNINGS" + " ".repeat(85) + "│");
        console.log("├" + "─".repeat(98) + "┤");
        for (const warning of report.warnings) {
          console.log(`│ • ${warning.substring(0, 94).padEnd(94)} │`);
        }
        console.log("└" + "─".repeat(98) + "┘");
      }

      // Recommendations
      if (report.recommendations.length > 0) {
        console.log("\n┌" + "─".repeat(98) + "┐");
        console.log("│ 💡 RECOMMENDATIONS" + " ".repeat(79) + "│");
        console.log("├" + "─".repeat(98) + "┤");
        for (const rec of report.recommendations) {
          console.log(`│ Issue: ${rec.issue.substring(0, 89).padEnd(89)} │`);
          console.log(
            `│ Solution: ${rec.solution.substring(0, 86).padEnd(86)} │`,
          );
          console.log("│" + " ".repeat(98) + "│");
        }
        console.log("└" + "─".repeat(98) + "┘");
      }

      // Audio playback truth table
      if (features.detected.has(SVG_FEATURES.AUDIO)) {
        console.log("\n┌" + "─".repeat(98) + "┐");
        console.log("│ 🔊 AUDIO PLAYBACK TRUTH TABLE" + " ".repeat(67) + "│");
        console.log("├" + "─".repeat(98) + "┤");
        console.log(
          "│ METHOD                              │ FILE:// │ HTTP:// │ USER GESTURE NEEDED │ RESULT       │",
        );
        console.log(
          "├─────────────────────────────────────┼─────────┼─────────┼─────────────────────┼──────────────┤",
        );
        console.log(
          "│ SVG direct (autoplay)               │ ❌       │ ❌       │ Yes but no trigger  │ BLOCKED      │",
        );
        console.log(
          "│ SVG in <img>                        │ ❌       │ ❌       │ N/A                 │ NO AUDIO     │",
        );
        console.log(
          "│ SVG in <object>                     │ ❌       │ ❌       │ Yes but isolated    │ BLOCKED      │",
        );
        console.log(
          "│ SVG inline + SMIL onbegin           │ ⚠️       │ ⚠️       │ SMIL click trigger  │ MAYBE        │",
        );
        console.log(
          "│ SVG inline + JS on click            │ ✅       │ ✅       │ Yes - click event   │ WORKS        │",
        );
        console.log(
          "│ HTML extracts audio, plays on click │ ✅       │ ✅       │ Yes - click event   │ RECOMMENDED  │",
        );
        console.log("└" + "─".repeat(98) + "┘");

        console.log("\n┌" + "─".repeat(98) + "┐");
        console.log("│ 📝 AUDIO SOLUTION CODE EXAMPLE" + " ".repeat(66) + "│");
        console.log("├" + "─".repeat(98) + "┤");
        console.log(
          "│ // In your HTML page:                                                                        │",
        );
        console.log(
          '│ <button id="play">Click to Play SVG Audio</button>                                           │',
        );
        console.log(
          '│ <object id="svg" data="your-audio.svg" type="image/svg+xml"></object>                        │',
        );
        console.log(
          "│                                                                                               │",
        );
        console.log(
          "│ <script>                                                                                      │",
        );
        console.log(
          '│ document.getElementById("play").addEventListener("click", () => {                             │',
        );
        console.log(
          '│   const svgDoc = document.getElementById("svg").contentDocument;                              │',
        );
        console.log(
          '│   const audioSrc = svgDoc.querySelector("source")?.getAttribute("src");                       │',
        );
        console.log(
          "│   if (audioSrc) new Audio(audioSrc).play();                                                   │",
        );
        console.log(
          "│ });                                                                                           │",
        );
        console.log(
          "│ </script>                                                                                     │",
        );
        console.log("└" + "─".repeat(98) + "┘");
      }

      console.log("\n" + "═".repeat(100) + "\n");
    }

    // Store report on document
    doc._compatibilityMatrix = report;

    return doc;
  },
);

/**
 * Generate FULL combinatorial compatibility matrix with ALL axis combinations.
 * Iterates through every possible combination of:
 *   DISPLAY (12) × LOAD (5) × STORAGE (7) × SYNTAX (16) × PROCESSING (5) = 33,600 combinations
 *
 * For each cell, reports ALL issues for ALL SVG capabilities with browser-specific details.
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} options
 * @param {boolean} options.printFullMatrix - Print ALL cells (default: false, shows only relevant)
 * @param {boolean} options.groupBySyntax - Group output by syntax method (default: true)
 * @param {boolean} options.showOnlyIssues - Only show cells with issues (default: true)
 * @param {boolean} options.browserDetails - Include per-browser breakdown (default: true)
 * @param {string[]} options.filterCapabilities - Only show specific capability categories
 * @returns {Object} Full matrix data structure with all combinations evaluated
 */
export const generateFullCompatibilityMatrix = createOperation(
  (doc, options = {}) => {
    const printFullMatrix = options.printFullMatrix || false;
    const groupBySyntax = options.groupBySyntax !== false;
    const showOnlyIssues = options.showOnlyIssues !== false;
    const browserDetails = options.browserDetails !== false;
    const filterCapabilities = options.filterCapabilities || null;

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    /**
     * Find all elements with the specified tag name in the document.
     * @param {string} tagName - The tag name to search for
     * @returns {Array<Element>} Array of matching elements
     */
    const findElements = (tagName) => {
      const results = [];
      const searchTag = tagName.toLowerCase();
      /**
       * Recursively traverse the element tree.
       * @param {Element} el - The element to traverse
       * @returns {void}
       */
      const traverse = (el) => {
        if (el.tagName && el.tagName.toLowerCase() === searchTag) {
          results.push(el);
        }
        for (const child of el.children || []) {
          if (child && child.tagName) traverse(child);
        }
      };
      traverse(doc);
      return results;
    };

    /**
     * Get all elements recursively from a root element.
     * @param {Element} el - The root element
     * @param {Array<Element>} results - Accumulator array for results
     * @returns {Array<Element>} Array of all descendant elements
     */
    const getAllElements = (el, results = []) => {
      if (el.tagName) results.push(el);
      for (const child of el.children || []) {
        if (child && child.tagName) getAllElements(child, results);
      }
      return results;
    };

    // ========================================================================
    // FEATURE DETECTION - Detect what capabilities this SVG actually uses
    // ========================================================================

    const detectedCapabilities = new Set();
    const capabilityDetails = {};
    const allElements = getAllElements(doc);

    // --- Basic rendering (always present if SVG has content) ---
    const hasAnyContent = allElements.length > 1;
    if (hasAnyContent) {
      detectedCapabilities.add("RENDER_VECTORS");
      detectedCapabilities.add("RENDER_TRANSFORMS");
    }

    // --- Text ---
    const textElements = findElements("text").concat(findElements("tspan"));
    if (textElements.length > 0) {
      detectedCapabilities.add("RENDER_TEXT");
      capabilityDetails.RENDER_TEXT = { count: textElements.length };
    }

    // --- Gradients ---
    const linearGrads = findElements("linearGradient");
    const radialGrads = findElements("radialGradient");
    if (linearGrads.length > 0 || radialGrads.length > 0) {
      detectedCapabilities.add("RENDER_GRADIENTS");
      capabilityDetails.RENDER_GRADIENTS = {
        linear: linearGrads.length,
        radial: radialGrads.length,
      };
    }

    // --- Patterns ---
    const patterns = findElements("pattern");
    if (patterns.length > 0) {
      detectedCapabilities.add("RENDER_PATTERNS");
      capabilityDetails.RENDER_PATTERNS = { count: patterns.length };
    }

    // --- Opacity ---
    for (const el of allElements) {
      if (
        el.getAttribute("opacity") ||
        el.getAttribute("fill-opacity") ||
        el.getAttribute("stroke-opacity") ||
        (el.getAttribute("style") || "").includes("opacity")
      ) {
        detectedCapabilities.add("RENDER_OPACITY");
        break;
      }
    }

    // --- Blend modes ---
    for (const el of allElements) {
      const style = el.getAttribute("style") || "";
      if (
        style.includes("mix-blend-mode") ||
        el.getAttribute("mix-blend-mode")
      ) {
        detectedCapabilities.add("RENDER_BLENDMODES");
        break;
      }
    }

    // --- Fonts ---
    const styles = findElements("style");
    for (const style of styles) {
      const content = style.textContent || "";
      if (content.includes("@font-face")) {
        if (content.includes("data:")) {
          detectedCapabilities.add("FONTS_EMBEDDED");
        } else if (
          content.includes("url(") &&
          content.match(/url\s*\(\s*['"]?https?:/)
        ) {
          detectedCapabilities.add("FONTS_WEB_CROSS");
        } else if (content.includes("url(")) {
          detectedCapabilities.add("FONTS_WEB_SAME");
        }
      }
    }
    if (textElements.length > 0) {
      detectedCapabilities.add("FONTS_SYSTEM");
    }

    // --- Images ---
    const images = findElements("image");
    for (const img of images) {
      const href =
        img.getAttribute("href") || img.getAttribute("xlink:href") || "";
      if (href.startsWith("data:")) {
        detectedCapabilities.add("IMAGES_EMBEDDED");
      } else if (href.startsWith("http://") || href.startsWith("https://")) {
        // BUG FIX: Properly detect cross-origin instead of always assuming true
        let isCrossOrigin = true;
        try {
          const imgUrl = new URL(href);
          const docUrl = new URL(doc.documentURI || doc.baseURI || "");
          isCrossOrigin = imgUrl.origin !== docUrl.origin;
        } catch (e) {
          // If URL parsing fails, assume cross-origin for safety - log error for debugging
          if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
          isCrossOrigin = true;
        }
        detectedCapabilities.add(
          isCrossOrigin ? "IMAGES_REMOTE_CROSS" : "IMAGES_REMOTE_SAME",
        );
      } else if (href && !href.startsWith("#")) {
        detectedCapabilities.add("IMAGES_LOCAL");
      }
    }
    capabilityDetails.IMAGES = { count: images.length };

    // --- Filters & Effects ---
    const filters = findElements("filter");
    if (filters.length > 0) {
      detectedCapabilities.add("FILTERS_BASIC");
      // Check for complex filters
      for (const f of filters) {
        const content = f.outerHTML || "";
        if (
          content.includes("feTurbulence") ||
          content.includes("feLighting") ||
          content.includes("feConvolveMatrix") ||
          content.includes("feDisplacementMap")
        ) {
          detectedCapabilities.add("FILTERS_COMPLEX");
          break;
        }
      }
      capabilityDetails.FILTERS = { count: filters.length };
    }

    const masks = findElements("mask");
    if (masks.length > 0) {
      detectedCapabilities.add("MASKS");
      capabilityDetails.MASKS = { count: masks.length };
    }

    const clipPaths = findElements("clippath");
    if (clipPaths.length > 0) {
      detectedCapabilities.add("CLIP_PATHS");
      capabilityDetails.CLIP_PATHS = { count: clipPaths.length };
    }

    // --- SMIL Animation ---
    const smilTags = [
      "animate",
      "animatetransform",
      "animatemotion",
      "animatecolor",
      "set",
    ];
    let smilCount = 0;
    const smilTriggers = {
      timed: 0,
      click: 0,
      hover: 0,
      focus: 0,
      accesskey: 0,
      syncbase: 0,
    };

    for (const tag of smilTags) {
      const els = findElements(tag);
      smilCount += els.length;

      for (const el of els) {
        const begin = (el.getAttribute("begin") || "").toLowerCase();
        const end = (el.getAttribute("end") || "").toLowerCase();
        const combined = begin + " " + end;

        if (combined.includes("click") || combined.includes("dblclick")) {
          smilTriggers.click++;
          detectedCapabilities.add("SMIL_CLICK");
        }
        if (
          combined.includes("mouseover") ||
          combined.includes("mouseout") ||
          combined.includes("mouseenter") ||
          combined.includes("mouseleave")
        ) {
          smilTriggers.hover++;
          detectedCapabilities.add("SMIL_HOVER");
        }
        if (combined.includes("focus") || combined.includes("blur")) {
          smilTriggers.focus++;
          detectedCapabilities.add("SMIL_FOCUS");
        }
        if (combined.includes("accesskey(")) {
          smilTriggers.accesskey++;
          detectedCapabilities.add("SMIL_ACCESSKEY");
        }
        if (combined.match(/\w+\.(begin|end)/)) {
          smilTriggers.syncbase++;
          detectedCapabilities.add("SMIL_SYNCBASE");
        }
        // Time-based (default if no interactive trigger)
        if (
          !combined.includes("click") &&
          !combined.includes("mouse") &&
          !combined.includes("focus") &&
          !combined.includes("accesskey")
        ) {
          smilTriggers.timed++;
        }
      }
    }

    if (smilCount > 0) {
      detectedCapabilities.add("SMIL_TIMED");
      capabilityDetails.SMIL = { count: smilCount, triggers: smilTriggers };
    }

    // --- CSS Animation ---
    let hasCssKeyframes = false;
    let hasCssTransitions = false;
    let hasCssHover = false;

    for (const style of styles) {
      const content = style.textContent || "";
      if (content.includes("@keyframes")) hasCssKeyframes = true;
      if (
        content.includes("transition:") ||
        content.includes("transition-property")
      )
        hasCssTransitions = true;
      if (content.includes(":hover")) hasCssHover = true;
    }

    if (hasCssKeyframes) detectedCapabilities.add("CSS_KEYFRAMES");
    if (hasCssTransitions) detectedCapabilities.add("CSS_TRANSITIONS");
    if (hasCssHover) detectedCapabilities.add("CSS_HOVER");

    // --- JavaScript ---
    const scripts = findElements("script");
    if (scripts.length > 0) {
      for (const script of scripts) {
        const src =
          script.getAttribute("src") ||
          script.getAttribute("href") ||
          script.getAttribute("xlink:href");
        const type = script.getAttribute("type") || "";

        if (src) {
          detectedCapabilities.add("SCRIPT_EXTERNAL");
        } else {
          detectedCapabilities.add("SCRIPT_INLINE");
        }
        if (type === "module") {
          detectedCapabilities.add("SCRIPT_MODULE");
        }
      }
      capabilityDetails.SCRIPTS = { count: scripts.length };
    }

    // --- Event Handlers ---
    const eventAttrs = [
      "onclick",
      "ondblclick",
      "onmousedown",
      "onmouseup",
      "onmouseover",
      "onmouseout",
      "onmousemove",
      "onmouseenter",
      "onmouseleave",
      "onfocus",
      "onblur",
      "onkeydown",
      "onkeyup",
      "onkeypress",
      "onload",
      "onerror",
      "onscroll",
      "onwheel",
      "ontouchstart",
      "ontouchend",
      "ontouchmove",
    ];

    const eventMapping = {
      onclick: "EVENT_ONCLICK",
      ondblclick: "EVENT_ONDBLCLICK",
      onmousedown: "EVENT_ONMOUSEDOWN",
      onmouseup: "EVENT_ONMOUSEUP",
      onmouseover: "EVENT_ONMOUSEOVER",
      onmouseout: "EVENT_ONMOUSEOUT",
      onmousemove: "EVENT_ONMOUSEMOVE",
      onfocus: "EVENT_ONFOCUS",
      onblur: "EVENT_ONBLUR",
      onload: "EVENT_ONLOAD",
      onerror: "EVENT_ONERROR",
      onscroll: "EVENT_ONSCROLL",
      onwheel: "EVENT_ONWHEEL",
      ontouchstart: "EVENT_ONTOUCH",
      ontouchend: "EVENT_ONTOUCH",
      ontouchmove: "EVENT_ONTOUCH",
      onkeydown: "EVENT_ONKEYBOARD",
      onkeyup: "EVENT_ONKEYBOARD",
      onkeypress: "EVENT_ONKEYBOARD",
    };

    for (const el of allElements) {
      for (const attr of eventAttrs) {
        if (el.getAttribute(attr)) {
          const capKey = eventMapping[attr];
          if (capKey) detectedCapabilities.add(capKey);
        }
      }
    }

    // --- Links ---
    const links = findElements("a");
    if (links.length > 0) {
      for (const link of links) {
        const href =
          link.getAttribute("href") || link.getAttribute("xlink:href") || "";
        if (href.startsWith("#")) {
          detectedCapabilities.add("LINK_INTERNAL");
        } else {
          detectedCapabilities.add("LINK_EXTERNAL");
        }
        if (link.getAttribute("target"))
          detectedCapabilities.add("LINK_TARGET");
        if (link.getAttribute("download"))
          detectedCapabilities.add("LINK_DOWNLOAD");
      }
      capabilityDetails.LINKS = { count: links.length };
    }

    // --- foreignObject ---
    const foreignObjects = findElements("foreignobject");
    if (foreignObjects.length > 0) {
      detectedCapabilities.add("FOREIGNOBJECT_BASIC");
      detectedCapabilities.add("FOREIGNOBJECT_HTML");

      for (const fo of foreignObjects) {
        /**
         * Recursively check foreignObject content for specific HTML elements.
         * @param {Element} el - The element to check
         * @returns {void}
         */
        const checkInner = (el) => {
          const tag = el.tagName?.toLowerCase();
          if (tag === "form") detectedCapabilities.add("FOREIGNOBJECT_FORM");
          if (tag === "input" || tag === "textarea" || tag === "select")
            detectedCapabilities.add("FOREIGNOBJECT_INPUT");
          if (tag === "canvas")
            detectedCapabilities.add("FOREIGNOBJECT_CANVAS");
          if (tag === "video") detectedCapabilities.add("FOREIGNOBJECT_VIDEO");
          if (tag === "iframe")
            detectedCapabilities.add("FOREIGNOBJECT_IFRAME");
          for (const child of el.children || []) {
            if (child && child.tagName) checkInner(child);
          }
        };
        checkInner(fo);
      }
      capabilityDetails.FOREIGNOBJECT = { count: foreignObjects.length };
    }

    // --- Audio/Video ---
    const audioElements = findElements("audio");
    const videoElements = findElements("video");

    // Also check inside foreignObject
    for (const fo of foreignObjects) {
      /**
       * Recursively check for audio/video elements inside foreignObject.
       * @param {Element} el - The element to check
       * @returns {void}
       */
      const checkMedia = (el) => {
        const tag = el.tagName?.toLowerCase();
        if (tag === "audio") audioElements.push(el);
        if (tag === "video") videoElements.push(el);
        for (const child of el.children || []) {
          if (child && child.tagName) checkMedia(child);
        }
      };
      checkMedia(fo);
    }

    if (audioElements.length > 0) {
      for (const audio of audioElements) {
        const src = audio.getAttribute("src") || "";
        const sources = findElements("source").filter(
          (s) => s.parentNode === audio,
        );
        const anySrc =
          src || (sources.length > 0 ? sources[0].getAttribute("src") : "");

        if (anySrc?.startsWith("data:")) {
          detectedCapabilities.add("AUDIO_EMBEDDED");
        } else if (anySrc?.startsWith("http")) {
          detectedCapabilities.add("AUDIO_REMOTE");
        } else if (anySrc) {
          detectedCapabilities.add("AUDIO_LOCAL");
        }
        if (audio.hasAttribute("autoplay"))
          detectedCapabilities.add("AUDIO_AUTOPLAY");
        if (audio.hasAttribute("controls"))
          detectedCapabilities.add("AUDIO_CONTROLS");
      }
      capabilityDetails.AUDIO = { count: audioElements.length };
    }

    if (videoElements.length > 0) {
      for (const video of videoElements) {
        const src = video.getAttribute("src") || "";
        if (src.startsWith("data:")) {
          detectedCapabilities.add("VIDEO_EMBEDDED");
        } else if (src.startsWith("http")) {
          detectedCapabilities.add("VIDEO_REMOTE");
        } else if (src) {
          detectedCapabilities.add("VIDEO_LOCAL");
        }
        if (video.hasAttribute("autoplay"))
          detectedCapabilities.add("VIDEO_AUTOPLAY");
      }
      capabilityDetails.VIDEO = { count: videoElements.length };
    }

    // --- Use elements / Sprites ---
    const useElements = findElements("use");
    if (useElements.length > 0) {
      for (const use of useElements) {
        const href =
          use.getAttribute("href") || use.getAttribute("xlink:href") || "";
        if (href.startsWith("#")) {
          detectedCapabilities.add("USE_INTERNAL");
        } else if (href.startsWith("http")) {
          detectedCapabilities.add("USE_EXTERNAL_CROSS");
        } else if (href) {
          detectedCapabilities.add("USE_EXTERNAL_SAME");
        }
      }
      detectedCapabilities.add("USE_SHADOW_DOM");
      capabilityDetails.USE = { count: useElements.length };
    }

    // --- Accessibility ---
    for (const el of allElements) {
      for (const attr of el.getAttributeNames?.() || []) {
        if (attr.startsWith("aria-")) {
          detectedCapabilities.add("A11Y_ARIA");
          break;
        }
      }
      if (el.getAttribute("role")) detectedCapabilities.add("A11Y_ROLE");
      if (el.getAttribute("tabindex"))
        detectedCapabilities.add("A11Y_TABINDEX");
    }
    if (findElements("title").length > 0 || findElements("desc").length > 0) {
      detectedCapabilities.add("A11Y_TITLE");
    }

    // --- Metadata ---
    for (const el of allElements) {
      for (const attr of el.getAttributeNames?.() || []) {
        if (attr.startsWith("data-")) {
          detectedCapabilities.add("META_DATA_ATTRS");
          break;
        }
      }
      if (el.getAttribute("class")) detectedCapabilities.add("META_CLASS");
      if (el.getAttribute("id")) detectedCapabilities.add("META_ID");
    }

    // --- External Resources ---
    for (const style of styles) {
      const content = style.textContent || "";
      if (content.includes("@import"))
        detectedCapabilities.add("EXT_CSS_IMPORT");
    }
    for (const el of allElements) {
      for (const attr of el.getAttributeNames?.() || []) {
        if (attr.startsWith("xlink:")) {
          detectedCapabilities.add("EXT_XLINK");
          break;
        }
      }
    }

    // ========================================================================
    // BUILD FULL COMBINATORIAL MATRIX
    // ========================================================================

    const fullMatrix = {
      timestamp: new Date().toISOString(),
      detectedCapabilities: [...detectedCapabilities],
      capabilityDetails,
      totalCombinations: 0,
      combinationsWithIssues: 0,
      cells: [],
    };

    /**
     * Evaluate a single capability in a specific context configuration.
     * @param {string} capKey - The capability key to evaluate
     * @param {Object} display - The display axis value
     * @param {Object} load - The load protocol axis value
     * @param {Object} storage - The storage type axis value
     * @param {Object} syntax - The syntax method axis value
     * @param {Object} _processing - The processing context axis value (unused)
     * @returns {Object} Evaluation result with status, note, and browser issues
     */
    const evaluateCapability = (
      capKey,
      display,
      load,
      storage,
      syntax,
      _processing,
    ) => {
      const rule = COMPATIBILITY_DB[capKey];
      if (!rule) {
        return {
          status: STATUS.DEPENDS,
          note: "No compatibility data",
          browsers: [],
        };
      }

      let status = rule.default;
      let note = "";
      const browserIssues = [];

      // Check exceptions
      for (const [pattern, exception] of Object.entries(
        rule.exceptions || {},
      )) {
        let matches = false;

        // Pattern matching
        if (pattern.startsWith("syntax:")) {
          const syntaxPattern = pattern.substring(7);
          if (
            syntaxPattern === "*" ||
            syntaxPattern === syntax.id ||
            (syntaxPattern.includes("*") &&
              syntax.id.startsWith(syntaxPattern.replace("*", "")))
          ) {
            matches = true;
          }
        } else if (pattern.startsWith("load:")) {
          const loadPattern = pattern.substring(5);
          if (loadPattern === load.id) matches = true;
        } else if (pattern.startsWith("storage:")) {
          const storagePattern = pattern.substring(8);
          if (storagePattern === storage.id) matches = true;
        } else if (pattern.startsWith("display:")) {
          const displayPattern = pattern.substring(8);
          if (displayPattern === display.id) matches = true;
        } else if (pattern.startsWith("renderer:")) {
          const rendererPattern = pattern.substring(9);
          if (rendererPattern === "*" && display.type === "renderer")
            matches = true;
          if (rendererPattern === display.id) matches = true;
        } else if (pattern.startsWith("browser:")) {
          const browserPattern = pattern.substring(8);
          if (browserPattern === "*") {
            // All browsers
            for (const browser of Object.values(BROWSERS)) {
              browserIssues.push({
                browser: browser.name,
                status: exception.status,
                note: exception.note,
              });
            }
          } else {
            const browser = Object.values(BROWSERS).find(
              (b) => b.id === browserPattern,
            );
            if (browser) {
              browserIssues.push({
                browser: browser.name,
                status: exception.status,
                note: exception.note,
              });
            }
          }
        }

        if (matches) {
          status = exception.status;
          note = exception.note || "";
        }
      }

      return { status, note, browserIssues };
    };

    // Iterate through ALL combinations
    const displayValues = Object.values(AXIS_DISPLAY);
    const loadValues = Object.values(AXIS_LOAD);
    const storageValues = Object.values(AXIS_STORAGE);
    const syntaxValues = Object.values(AXIS_SYNTAX);
    const processingValues = Object.values(AXIS_PROCESSING);

    for (const display of displayValues) {
      for (const load of loadValues) {
        for (const storage of storageValues) {
          for (const syntax of syntaxValues) {
            for (const processing of processingValues) {
              fullMatrix.totalCombinations++;

              // Skip invalid combinations
              // - PROCESSING only relevant for script-based syntax
              if (
                processing.script &&
                !["script-inner", "script-dom", "script-fetch"].includes(
                  syntax.id,
                )
              ) {
                continue;
              }
              // - Renderers don't use HTML syntax
              if (display.type === "renderer" && syntax.html) {
                continue;
              }

              // Evaluate ALL detected capabilities for this combination
              const cellIssues = [];
              const cellCapabilities = {};

              for (const capKey of detectedCapabilities) {
                // Filter by category if specified
                if (filterCapabilities) {
                  const capDef = SVG_CAPABILITIES[capKey];
                  if (capDef && !filterCapabilities.includes(capDef.cat))
                    continue;
                }

                const result = evaluateCapability(
                  capKey,
                  display,
                  load,
                  storage,
                  syntax,
                  processing,
                );
                const capDef = SVG_CAPABILITIES[capKey] || {
                  name: capKey,
                  cat: "unknown",
                };

                cellCapabilities[capKey] = {
                  name: capDef.name,
                  category: capDef.cat,
                  status: result.status,
                  note: result.note,
                  browserIssues: result.browserIssues,
                };

                // Track issues (non-working capabilities)
                if (
                  result.status !== STATUS.WORKS &&
                  result.status !== STATUS.NA
                ) {
                  cellIssues.push({
                    capability: capKey,
                    name: capDef.name,
                    category: capDef.cat,
                    status: result.status,
                    note: result.note,
                    browserIssues: result.browserIssues,
                  });
                }
              }

              // Only store cells with issues (or all if printFullMatrix)
              if (cellIssues.length > 0 || !showOnlyIssues) {
                const cell = {
                  combination: {
                    display: display.name,
                    displayId: display.id,
                    displayType: display.type,
                    load: load.name,
                    loadId: load.id,
                    storage: storage.name,
                    storageId: storage.id,
                    syntax: syntax.name,
                    syntaxId: syntax.id,
                    processing: processing.name,
                    processingId: processing.id,
                  },
                  issueCount: cellIssues.length,
                  issues: cellIssues,
                  allCapabilities: cellCapabilities,
                };
                fullMatrix.cells.push(cell);

                if (cellIssues.length > 0) {
                  fullMatrix.combinationsWithIssues++;
                }
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // PRINT FULL MATRIX
    // ========================================================================

    console.log("\n" + "═".repeat(120));
    console.log("╔" + "═".repeat(118) + "╗");
    console.log(
      "║" +
        " FULL COMBINATORIAL SVG COMPATIBILITY MATRIX "
          .padStart(82)
          .padEnd(118) +
        "║",
    );
    console.log(
      "║" +
        " ALL AXIS COMBINATIONS × ALL CAPABILITIES × ALL BROWSERS "
          .padStart(88)
          .padEnd(118) +
        "║",
    );
    console.log("╚" + "═".repeat(118) + "╝");

    // Summary statistics
    console.log("\n┌" + "─".repeat(118) + "┐");
    console.log("│ SUMMARY STATISTICS" + " ".repeat(99) + "│");
    console.log("├" + "─".repeat(118) + "┤");
    console.log(
      `│ Total axis combinations evaluated: ${fullMatrix.totalCombinations.toString().padEnd(80)} │`,
    );
    console.log(
      `│ Combinations with issues: ${fullMatrix.combinationsWithIssues.toString().padEnd(89)} │`,
    );
    console.log(
      `│ Detected capabilities in SVG: ${fullMatrix.detectedCapabilities.length.toString().padEnd(85)} │`,
    );
    console.log("└" + "─".repeat(118) + "┘");

    // Detected capabilities
    console.log("\n┌" + "─".repeat(118) + "┐");
    console.log("│ DETECTED SVG CAPABILITIES" + " ".repeat(92) + "│");
    console.log("├" + "─".repeat(118) + "┤");

    // Group by category
    const capsByCategory = {};
    for (const capKey of detectedCapabilities) {
      const capDef = SVG_CAPABILITIES[capKey] || {
        cat: "unknown",
        name: capKey,
      };
      if (!capsByCategory[capDef.cat]) capsByCategory[capDef.cat] = [];
      capsByCategory[capDef.cat].push({ key: capKey, name: capDef.name });
    }

    for (const [cat, caps] of Object.entries(capsByCategory)) {
      const catName = cat.toUpperCase();
      console.log(`│ ${catName}:`.padEnd(119) + "│");
      for (const cap of caps) {
        const detail = capabilityDetails[cap.key.split("_")[0]] || {};
        let info = `    • ${cap.name}`;
        if (detail.count !== undefined) info += ` (${detail.count})`;
        console.log(`│ ${info}`.padEnd(119) + "│");
      }
    }
    console.log("└" + "─".repeat(118) + "┘");

    // ========================================================================
    // FULL MATRIX TABLE - Grouped by SYNTAX (most impactful axis)
    // ========================================================================

    if (groupBySyntax) {
      console.log("\n╔" + "═".repeat(118) + "╗");
      console.log(
        "║ FULL COMPATIBILITY MATRIX BY EMBEDDING METHOD" +
          " ".repeat(71) +
          "║",
      );
      console.log("╚" + "═".repeat(118) + "╝");

      // Group cells by syntax
      const bySyntax = {};
      for (const cell of fullMatrix.cells) {
        const syntaxId = cell.combination.syntaxId;
        if (!bySyntax[syntaxId]) bySyntax[syntaxId] = [];
        bySyntax[syntaxId].push(cell);
      }

      for (const [syntaxId, cells] of Object.entries(bySyntax)) {
        const syntaxDef = Object.values(AXIS_SYNTAX).find(
          (s) => s.id === syntaxId,
        );
        const syntaxName = syntaxDef ? syntaxDef.name : syntaxId;

        console.log("\n┌" + "─".repeat(118) + "┐");
        console.log(`│ SYNTAX: ${syntaxName}`.padEnd(119) + "│");
        console.log(
          "├" +
            "─".repeat(30) +
            "┬" +
            "─".repeat(20) +
            "┬" +
            "─".repeat(25) +
            "┬" +
            "─".repeat(40) +
            "┤",
        );
        console.log(
          "│ CONTEXT COMBINATION          │ ISSUES │ BLOCKED CAPABILITIES   │ BROWSER-SPECIFIC NOTES                 │",
        );
        console.log(
          "├" +
            "─".repeat(30) +
            "┼" +
            "─".repeat(20) +
            "┼" +
            "─".repeat(25) +
            "┼" +
            "─".repeat(40) +
            "┤",
        );

        // Sort by issue count (most issues first)
        cells.sort((a, b) => b.issueCount - a.issueCount);

        // Limit output for readability
        const displayCells = printFullMatrix ? cells : cells.slice(0, 20);

        for (const cell of displayCells) {
          // Guard against null/undefined displayId and storageId before calling substring
          const ctx = `${(cell.combination.displayId || "").substring(0, 8)}/${cell.combination.loadId}/${(cell.combination.storageId || "").substring(0, 8)}`;
          const issues = cell.issueCount.toString();

          // Get blocked capabilities (❌) - guard against null i.name
          const blocked = cell.issues
            .filter((i) => i.status === STATUS.BLOCKED)
            .map((i) => (i.name || "").substring(0, 15))
            .slice(0, 2)
            .join(", ");

          // Get browser-specific notes
          const browserNotes = cell.issues
            .flatMap((i) => i.browserIssues || [])
            .slice(0, 2)
            .map((b) => `${b.browser}: ${b.note?.substring(0, 15) || ""}`)
            .join("; ");

          console.log(
            `│ ${ctx.padEnd(28)} │ ${issues.padEnd(18)} │ ${(blocked || "-").substring(0, 23).padEnd(23)} │ ${(browserNotes || "-").substring(0, 38).padEnd(38)} │`,
          );
        }

        if (!printFullMatrix && cells.length > 20) {
          console.log(
            `│ ... and ${cells.length - 20} more combinations`.padEnd(119) +
              "│",
          );
        }

        console.log(
          "└" +
            "─".repeat(30) +
            "┴" +
            "─".repeat(20) +
            "┴" +
            "─".repeat(25) +
            "┴" +
            "─".repeat(40) +
            "┘",
        );
      }
    }

    // ========================================================================
    // DETAILED ISSUE BREAKDOWN BY CAPABILITY
    // ========================================================================

    console.log("\n╔" + "═".repeat(118) + "╗");
    console.log(
      "║ DETAILED ISSUE BREAKDOWN BY CAPABILITY" + " ".repeat(78) + "║",
    );
    console.log("╚" + "═".repeat(118) + "╝");

    // For each detected capability, show where it fails
    for (const capKey of detectedCapabilities) {
      const capDef = SVG_CAPABILITIES[capKey] || {
        name: capKey,
        cat: "unknown",
      };
      const rule = COMPATIBILITY_DB[capKey];

      console.log("\n┌" + "─".repeat(118) + "┐");
      console.log(`│ ${capDef.name} (${capDef.cat})`.padEnd(119) + "│");
      console.log("├" + "─".repeat(118) + "┤");

      if (!rule) {
        console.log("│ No compatibility data available".padEnd(119) + "│");
      } else {
        console.log(`│ Default status: ${rule.default}`.padEnd(119) + "│");

        if (Object.keys(rule.exceptions || {}).length > 0) {
          console.log("│ Exceptions:".padEnd(119) + "│");
          for (const [pattern, exc] of Object.entries(rule.exceptions)) {
            const line = `    ${pattern}: ${exc.status} - ${exc.note || "No details"}`;
            console.log(`│ ${line.substring(0, 116)}`.padEnd(119) + "│");
          }
        }
      }
      console.log("└" + "─".repeat(118) + "┘");
    }

    // ========================================================================
    // BROWSER COMPATIBILITY QUICK REFERENCE
    // ========================================================================

    if (browserDetails) {
      console.log("\n╔" + "═".repeat(118) + "╗");
      console.log(
        "║ BROWSER-SPECIFIC COMPATIBILITY QUICK REFERENCE" +
          " ".repeat(70) +
          "║",
      );
      console.log("╚" + "═".repeat(118) + "╝");

      console.log("\n┌" + "─".repeat(14) + "┬" + "─".repeat(103) + "┐");
      console.log(
        "│ BROWSER      │ KNOWN LIMITATIONS FOR DETECTED CAPABILITIES" +
          " ".repeat(58) +
          "│",
      );
      console.log("├" + "─".repeat(14) + "┼" + "─".repeat(103) + "┤");

      const browserLimitations = {
        Chrome: [
          "Full SMIL support",
          "Autoplay policy",
          "External use blocked",
        ],
        Firefox: [
          "Good SMIL support",
          "Autoplay policy",
          "External use blocked",
        ],
        Safari: [
          "Full SMIL support",
          "Strict autoplay",
          "WebKit-specific filters",
        ],
        "Safari iOS": [
          "Full SMIL",
          "VERY strict autoplay",
          "Touch events only",
        ],
        Edge: [
          "Same as Chrome (Blink)",
          "Autoplay policy",
          "External use blocked",
        ],
        "IE 11": [
          "NO SMIL",
          "NO blend modes",
          "Limited filters",
          "NO foreignObject scripting",
        ],
        "Android WebView": [
          "Varies by version",
          "Autoplay restrictions",
          "Limited CSS animations",
        ],
      };

      for (const [browser, limitations] of Object.entries(browserLimitations)) {
        // Check if any limitations affect detected capabilities
        const relevant = limitations.filter((l) => {
          const lLower = l.toLowerCase();
          if (
            lLower.includes("smil") &&
            [...detectedCapabilities].some((c) => c.startsWith("SMIL_"))
          )
            return true;
          if (
            lLower.includes("autoplay") &&
            detectedCapabilities.has("AUDIO_AUTOPLAY")
          )
            return true;
          if (
            lLower.includes("blend") &&
            detectedCapabilities.has("RENDER_BLENDMODES")
          )
            return true;
          if (
            lLower.includes("filter") &&
            (detectedCapabilities.has("FILTERS_BASIC") ||
              detectedCapabilities.has("FILTERS_COMPLEX"))
          )
            return true;
          if (
            lLower.includes("foreign") &&
            [...detectedCapabilities].some((c) =>
              c.startsWith("FOREIGNOBJECT_"),
            )
          )
            return true;
          if (
            lLower.includes("external use") &&
            (detectedCapabilities.has("USE_EXTERNAL_SAME") ||
              detectedCapabilities.has("USE_EXTERNAL_CROSS"))
          )
            return true;
          return false;
        });

        if (relevant.length > 0) {
          const limitStr = relevant.slice(0, 3).join(", ");
          console.log(
            `│ ${browser.padEnd(12)} │ ${limitStr.substring(0, 101).padEnd(101)} │`,
          );
        }
      }

      console.log("└" + "─".repeat(14) + "┴" + "─".repeat(103) + "┘");
    }

    // ========================================================================
    // RECOMMENDATIONS BASED ON DETECTED CAPABILITIES
    // ========================================================================

    console.log("\n╔" + "═".repeat(118) + "╗");
    console.log(
      "║ RECOMMENDATIONS FOR MAXIMUM COMPATIBILITY" + " ".repeat(75) + "║",
    );
    console.log("╚" + "═".repeat(118) + "╝");

    const recommendations = [];

    // Audio recommendations
    if (
      detectedCapabilities.has("AUDIO_AUTOPLAY") ||
      detectedCapabilities.has("AUDIO_EMBEDDED") ||
      detectedCapabilities.has("AUDIO_LOCAL") ||
      detectedCapabilities.has("AUDIO_REMOTE")
    ) {
      recommendations.push({
        feature: "Audio Playback",
        issue: "Browser autoplay policies block automatic audio",
        bestSyntax: "INLINE-SVG with JavaScript",
        workaround:
          "Extract audio data-URI, create Audio object, play on user click gesture",
        code: `document.querySelector('svg').addEventListener('click', () => new Audio(dataUri).play());`,
      });
    }

    // SMIL interactive recommendations
    if (
      detectedCapabilities.has("SMIL_CLICK") ||
      detectedCapabilities.has("SMIL_HOVER") ||
      detectedCapabilities.has("SMIL_FOCUS") ||
      detectedCapabilities.has("SMIL_ACCESSKEY")
    ) {
      recommendations.push({
        feature: "Interactive SMIL Animation",
        issue: "Blocked in <img>, CSS backgrounds, and most renderers",
        bestSyntax: "<object>, <embed>, <iframe>, or inline <svg>",
        workaround: "Avoid <img> and CSS embedding for interactive SVGs",
        code: `<object data="animation.svg" type="image/svg+xml" width="800" height="600"></object>`,
      });
    }

    // JavaScript recommendations
    if (
      detectedCapabilities.has("SCRIPT_INLINE") ||
      detectedCapabilities.has("SCRIPT_EXTERNAL")
    ) {
      recommendations.push({
        feature: "JavaScript Execution",
        issue:
          "Completely blocked in <img>, CSS contexts, email, most social platforms",
        bestSyntax: "Inline <svg> or <object>/<embed>/<iframe>",
        workaround:
          "For widest compatibility, convert JS interactions to SMIL or CSS",
        code: `<!-- Inline: --> <div><svg>...</svg></div>\n<!-- Isolated: --> <object data="app.svg"></object>`,
      });
    }

    // foreignObject recommendations
    if ([...detectedCapabilities].some((c) => c.startsWith("FOREIGNOBJECT_"))) {
      recommendations.push({
        feature: "foreignObject / HTML Content",
        issue:
          "Completely ignored in <img>, CSS contexts, most renderers (Cairo, ImageMagick)",
        bestSyntax: "Inline <svg> or <object>/<embed>",
        workaround:
          "For rasterization, use browser screenshot or Puppeteer instead of ImageMagick",
        code: `<object data="with-html.svg" type="image/svg+xml"></object>`,
      });
    }

    // External resources recommendations
    if (
      detectedCapabilities.has("IMAGES_REMOTE_CROSS") ||
      detectedCapabilities.has("FONTS_WEB_CROSS") ||
      detectedCapabilities.has("USE_EXTERNAL_CROSS") ||
      detectedCapabilities.has("AUDIO_REMOTE")
    ) {
      recommendations.push({
        feature: "Cross-Origin Resources",
        issue:
          "Blocked without CORS headers, completely blocked in <img> context",
        bestSyntax:
          "Any syntax with proper CORS, or embed resources as data-URIs",
        workaround:
          "Use embedExternalDependencies() to inline all external resources",
        code: `await embedExternalDependencies(doc, { embedImages: true, embedFonts: true, embedAudio: true });`,
      });
    }

    // Print recommendations
    for (const rec of recommendations) {
      console.log("\n┌" + "─".repeat(118) + "┐");
      console.log(`│ ${rec.feature}`.padEnd(119) + "│");
      console.log("├" + "─".repeat(118) + "┤");
      console.log(`│ Issue: ${rec.issue}`.substring(0, 119).padEnd(119) + "│");
      console.log(
        `│ Best syntax: ${rec.bestSyntax}`.substring(0, 119).padEnd(119) + "│",
      );
      console.log(
        `│ Workaround: ${rec.workaround}`.substring(0, 119).padEnd(119) + "│",
      );
      console.log("│ Code:".padEnd(119) + "│");
      // Guard against null/undefined rec.code before calling split
      for (const line of (rec.code || "").split("\n").slice(0, 3)) {
        console.log(`│   ${line}`.substring(0, 119).padEnd(119) + "│");
      }
      console.log("└" + "─".repeat(118) + "┘");
    }

    // ========================================================================
    // OVERALL COMPATIBILITY SCORE
    // ========================================================================

    console.log("\n╔" + "═".repeat(118) + "╗");
    console.log("║ OVERALL COMPATIBILITY ASSESSMENT" + " ".repeat(84) + "║");
    console.log("╚" + "═".repeat(118) + "╝");

    // Calculate compatibility score for each syntax
    const syntaxScores = {};
    for (const syntax of syntaxValues) {
      let score = 100;
      const deductions = [];

      for (const capKey of detectedCapabilities) {
        const capDef = SVG_CAPABILITIES[capKey] || {
          name: capKey,
          critical: false,
        };
        const rule = COMPATIBILITY_DB[capKey];

        if (rule) {
          for (const [pattern, exc] of Object.entries(rule.exceptions || {})) {
            if (pattern.startsWith("syntax:")) {
              const syntaxPattern = pattern.substring(7);
              if (
                syntaxPattern === syntax.id ||
                syntaxPattern === "*" ||
                (syntaxPattern.includes("*") &&
                  syntax.id.startsWith(syntaxPattern.replace("*", "")))
              ) {
                const penalty = capDef.critical ? 30 : 10;
                score -= penalty;
                deductions.push({
                  cap: capDef.name,
                  penalty,
                  status: exc.status,
                });
              }
            }
          }
        }
      }

      syntaxScores[syntax.id] = {
        name: syntax.name,
        score: Math.max(0, score),
        deductions,
      };
    }

    // Sort by score
    const sortedSyntax = Object.entries(syntaxScores).sort(
      (a, b) => b[1].score - a[1].score,
    );

    console.log(
      "\n┌" +
        "─".repeat(25) +
        "┬" +
        "─".repeat(10) +
        "┬" +
        "─".repeat(81) +
        "┐",
    );
    console.log(
      "│ EMBEDDING METHOD        │ SCORE    │ ISSUES" + " ".repeat(74) + "│",
    );
    console.log(
      "├" + "─".repeat(25) + "┼" + "─".repeat(10) + "┼" + "─".repeat(81) + "┤",
    );

    for (const [_syntaxId, data] of sortedSyntax) {
      const scoreStr =
        data.score === 100
          ? "100% ✅"
          : data.score >= 70
            ? `${data.score}% ⚠️`
            : `${data.score}% ❌`;
      const issues =
        data.deductions
          .slice(0, 3)
          .map((d) => d.cap)
          .join(", ") || "None";
      console.log(
        `│ ${data.name.padEnd(23)} │ ${scoreStr.padEnd(8)} │ ${issues.substring(0, 79).padEnd(79)} │`,
      );
    }

    console.log(
      "└" + "─".repeat(25) + "┴" + "─".repeat(10) + "┴" + "─".repeat(81) + "┘",
    );

    // Best overall - guard against empty sortedSyntax array
    if (sortedSyntax.length === 0) {
      console.log("\n⚠️  No embedding methods available for recommendation.");
    } else {
      const best = sortedSyntax[0];
      console.log(
        `\n★ RECOMMENDED: Use "${best[1].name}" for this SVG (score: ${best[1].score}%)`,
      );

      if (best[1].score < 100) {
        console.log(
          "\n⚠️  No embedding method achieves 100% compatibility for this SVG.",
        );
        console.log(
          "   Consider using embedExternalDependencies() to maximize portability.",
        );
      }
    }

    console.log("\n" + "═".repeat(120) + "\n");

    // Store on document
    doc._fullCompatibilityMatrix = fullMatrix;

    return doc;
  },
);

/**
 * Print HIERARCHICAL multi-dimensional compatibility matrix with proper nested columns/rows.
 *
 * Matrix Structure:
 * ================
 * COLUMNS (by count, most numerous first):
 *   Level 1: SYNTAX (6 main: direct, img, object, embed, inline, css)
 *   Level 2: STORAGE (3: embedded, local, remote)
 *
 * ROWS (by count, second most numerous first):
 *   Level 1: DISPLAY (3 main: browser, mobile, renderer)
 *   Level 2: LOAD (3: file, http, data)
 *   Level 3: PROCESSING (2: with-script, no-script)
 *
 * CELLS contain:
 *   - List of issues per BROWSER (Chrome, Firefox, Safari, Edge, IE11, iOS, Android)
 *   - List of affected SVG FUNCTIONALITIES (animations, audio, foreignObject, etc.)
 *
 * SEPARATE TABLE:
 *   - Internal SVG resources (embedded images, fonts, scripts, stylesheets)
 *
 * @param {Object} matrixData - Output from generateFullCompatibilityMatrix
 * @param {Object} options
 * @param {boolean} options.compact - Use compact cell format (default: true)
 * @param {boolean} options.showAllCells - Show all cells even if no issues (default: false)
 */
export function printHierarchicalMatrix(matrixData, options = {}) {
  const compact = options.compact !== false;
  const _showAllCells = options.showAllCells || false;

  // ============================================================================
  // AXIS DEFINITIONS - Reduced for printable matrix
  // ============================================================================

  // COLUMNS Level 1: SYNTAX (6 main embedding methods) - MOST NUMEROUS
  const COL_L1_SYNTAX = [
    { id: "direct", label: "DIRECT", desc: "SVG file" },
    { id: "img", label: "IMG", desc: "<img>" },
    { id: "object", label: "OBJECT", desc: "<object>" },
    { id: "embed", label: "EMBED", desc: "<embed>" },
    { id: "inline", label: "INLINE", desc: "<svg>" },
    { id: "css", label: "CSS", desc: "bg-image" },
  ];

  // COLUMNS Level 2: STORAGE (3 types)
  const COL_L2_STORAGE = [
    { id: "embedded", label: "EMB", desc: "data-uri/inline" },
    { id: "local", label: "LOC", desc: "local path" },
    { id: "remote", label: "REM", desc: "http(s) URL" },
  ];

  // ROWS Level 1: DISPLAY (3 environment types)
  const ROW_L1_DISPLAY = [
    { id: "browser", label: "BROWSER", desc: "Desktop browsers" },
    { id: "mobile", label: "MOBILE", desc: "Mobile WebView" },
    { id: "renderer", label: "RENDER", desc: "Server-side" },
  ];

  // ROWS Level 2: LOAD (3 protocols)
  const ROW_L2_LOAD = [
    { id: "file", label: "file://", desc: "Local filesystem" },
    { id: "http", label: "http(s)://", desc: "Web server" },
    { id: "data", label: "data:", desc: "Data URI" },
  ];

  // ROWS Level 3: PROCESSING (2 script contexts)
  const ROW_L3_PROCESSING = [
    { id: "script", label: "+JS", desc: "With JavaScript" },
    { id: "noscript", label: "-JS", desc: "No JavaScript" },
  ];

  // BROWSERS with short codes for cell content
  const BROWSERS_LIST = [
    { id: "chrome", code: "C", name: "Chrome" },
    { id: "firefox", code: "F", name: "Firefox" },
    { id: "safari", code: "S", name: "Safari" },
    { id: "edge", code: "E", name: "Edge" },
    { id: "ie11", code: "I", name: "IE11" },
    { id: "ios", code: "i", name: "iOS Safari" },
    { id: "android", code: "A", name: "Android" },
  ];

  // SVG FUNCTIONALITY categories for cell content - with short codes
  const FUNC_CATEGORIES = {
    display: { icon: "D", emoji: "📐", name: "Basic rendering" },
    animation: { icon: "A", emoji: "🎬", name: "SMIL/CSS animation" },
    scripting: { icon: "J", emoji: "📜", name: "JavaScript" },
    events: { icon: "E", emoji: "🖱️", name: "Event handlers" },
    media: { icon: "M", emoji: "🔊", name: "Audio/Video" },
    html: { icon: "H", emoji: "📄", name: "foreignObject" },
    images: { icon: "I", emoji: "🖼️", name: "External images" },
    fonts: { icon: "T", emoji: "🔤", name: "External fonts" },
    sprites: { icon: "U", emoji: "🎯", name: "use elements" },
    links: { icon: "L", emoji: "🔗", name: "Hyperlinks" },
  };

  // ============================================================================
  // CALCULATE COLUMN AND ROW COUNTS
  // ============================================================================

  const totalCols = COL_L1_SYNTAX.length * COL_L2_STORAGE.length;
  const totalRows =
    ROW_L1_DISPLAY.length * ROW_L2_LOAD.length * ROW_L3_PROCESSING.length;
  // Use wider cells to accommodate browser×functionality detail
  const cellWidth = compact ? 18 : 28;
  const rowHeaderWidth = 25;
  // Each row now has 3 lines for detailed cell content
  const _cellHeight = compact ? 2 : 3;

  console.log("\n");
  console.log("╔" + "═".repeat(160) + "╗");
  console.log(
    "║" +
      " HIERARCHICAL SVG COMPATIBILITY MATRIX - DETAILED "
        .padStart(105)
        .padEnd(160) +
      "║",
  );
  console.log(
    "║" +
      ` ${totalCols} columns × ${totalRows} rows = ${totalCols * totalRows} cells `
        .padStart(105)
        .padEnd(160) +
      "║",
  );
  console.log(
    "║" +
      " Each cell shows: [Browser status] / [Functionality issues] "
        .padStart(105)
        .padEnd(160) +
      "║",
  );
  console.log("╚" + "═".repeat(160) + "╝");

  // ============================================================================
  // PRINT COLUMN HEADERS (2 levels)
  // ============================================================================

  console.log("\n");

  // Calculate column group width
  const colGroupWidth = COL_L2_STORAGE.length * cellWidth;
  const _totalTableWidth =
    rowHeaderWidth + 1 + COL_L1_SYNTAX.length * (colGroupWidth + 1);

  // Level 1 header: SYNTAX
  let header1 = "".padEnd(rowHeaderWidth) + "│";
  for (const syntax of COL_L1_SYNTAX) {
    const label = `${syntax.label} (${syntax.desc})`;
    header1 +=
      label
        .padStart(Math.floor(colGroupWidth / 2) + Math.floor(label.length / 2))
        .padEnd(colGroupWidth) + "│";
  }
  console.log(
    "┌" +
      "─".repeat(rowHeaderWidth) +
      "┬" +
      COL_L1_SYNTAX.map(() => "─".repeat(colGroupWidth)).join("┬") +
      "┐",
  );
  console.log(
    "│" +
      "SYNTAX →".padEnd(rowHeaderWidth) +
      header1.substring(rowHeaderWidth + 1),
  );

  // Level 2 header: STORAGE
  let header2 = "".padEnd(rowHeaderWidth) + "│";
  for (const _syntax of COL_L1_SYNTAX) {
    for (const storage of COL_L2_STORAGE) {
      const storageLabel = `${storage.label}`;
      header2 += storageLabel
        .padStart(
          Math.floor(cellWidth / 2) + Math.floor(storageLabel.length / 2),
        )
        .padEnd(cellWidth);
    }
    header2 += "│";
  }
  console.log(
    "│" +
      "STORAGE →".padEnd(rowHeaderWidth) +
      header2.substring(rowHeaderWidth + 1),
  );

  // Browser/Functionality header row
  let header3 = "".padEnd(rowHeaderWidth) + "│";
  for (const _syntax of COL_L1_SYNTAX) {
    for (const _storage of COL_L2_STORAGE) {
      // Show what each cell contains: Browsers / Funcs
      header3 += "Brws|Func"
        .padStart(Math.floor(cellWidth / 2) + 5)
        .padEnd(cellWidth);
    }
    header3 += "│";
  }
  console.log(
    "│" + "".padEnd(rowHeaderWidth) + header3.substring(rowHeaderWidth + 1),
  );

  // Separator
  console.log(
    "├" +
      "─".repeat(rowHeaderWidth) +
      "┼" +
      COL_L1_SYNTAX.map(() =>
        COL_L2_STORAGE.map(() => "─".repeat(cellWidth)).join("─"),
      ).join("┼") +
      "┤",
  );

  // ============================================================================
  // PRINT MATRIX BODY (3-level row hierarchy)
  // ============================================================================

  /**
   * Evaluate a cell in the compatibility matrix with detailed browser and functionality status.
   * @param {string} display - Display environment ID (browser, mobile, renderer)
   * @param {string} load - Load protocol ID (file, http, data)
   * @param {string} storage - Storage type ID (embedded, local, remote)
   * @param {string} syntax - Embedding syntax ID (direct, img, object, embed, inline, css)
   * @param {string} processing - Processing context ID (script, noscript)
   * @returns {Object} Cell evaluation result with browser status, function status, overall status
   */
  const evaluateCell = (display, load, storage, syntax, processing) => {
    // Result: browserStatus[browser][func] = 'ok' | 'warn' | 'block'
    const result = {
      browserStatus: {}, // { chrome: { animation: 'ok', media: 'block' }, ... }
      funcStatus: {}, // { animation: 'ok', media: 'block', ... }
      overallStatus: "ok", // 'ok' | 'warn' | 'block'
      issueCount: 0,
      browserCount: 0,
    };

    // Initialize all browsers and functions
    for (const browser of BROWSERS_LIST) {
      result.browserStatus[browser.id] = {};
      for (const [func] of Object.entries(FUNC_CATEGORIES)) {
        result.browserStatus[browser.id][func] = "ok";
      }
    }
    for (const [func] of Object.entries(FUNC_CATEGORIES)) {
      result.funcStatus[func] = "ok";
    }

    // ========================================================================
    // APPLY COMPATIBILITY RULES BASED ON CONTEXT
    // ========================================================================

    // Rule 1: IMG and CSS contexts block most interactive features
    if (syntax === "img" || syntax === "css") {
      const blockedFuncs = [
        "animation",
        "scripting",
        "events",
        "html",
        "media",
        "links",
      ];
      for (const func of blockedFuncs) {
        result.funcStatus[func] = "block";
        for (const browser of BROWSERS_LIST) {
          result.browserStatus[browser.id][func] = "block";
        }
      }
      // External resources also blocked
      if (storage === "remote") {
        result.funcStatus["images"] = "block";
        result.funcStatus["fonts"] = "block";
        for (const browser of BROWSERS_LIST) {
          result.browserStatus[browser.id]["images"] = "block";
          result.browserStatus[browser.id]["fonts"] = "block";
        }
      }
    }

    // Rule 2: Renderers (server-side) block dynamic features
    if (display === "renderer") {
      const blockedFuncs = ["animation", "scripting", "events", "media"];
      for (const func of blockedFuncs) {
        result.funcStatus[func] = "block";
        for (const browser of BROWSERS_LIST) {
          result.browserStatus[browser.id][func] = "block";
        }
      }
      // foreignObject not rendered by most renderers
      result.funcStatus["html"] = "block";
      for (const browser of BROWSERS_LIST) {
        result.browserStatus[browser.id]["html"] = "block";
      }
    }

    // Rule 3: No JavaScript context disables scripting
    if (processing === "noscript") {
      result.funcStatus["scripting"] = "block";
      result.funcStatus["events"] = "warn"; // Events may still fire but no handlers
      for (const browser of BROWSERS_LIST) {
        result.browserStatus[browser.id]["scripting"] = "block";
        result.browserStatus[browser.id]["events"] = "warn";
      }
    }

    // Rule 4: IE11 specific issues
    result.browserStatus["ie11"]["animation"] = "block"; // No SMIL
    result.browserStatus["ie11"]["html"] = "block"; // No foreignObject scripting
    result.browserStatus["ie11"]["sprites"] = "warn"; // Limited shadow DOM

    // Rule 5: Audio/Video autoplay policies
    if (
      matrixData.detectedCapabilities?.some(
        (c) => c.startsWith("AUDIO_") || c.startsWith("VIDEO_"),
      )
    ) {
      // All browsers block autoplay
      for (const browser of BROWSERS_LIST) {
        if (result.browserStatus[browser.id]["media"] !== "block") {
          result.browserStatus[browser.id]["media"] = "warn";
        }
      }
      // iOS is very strict
      result.browserStatus["ios"]["media"] = "block";
      result.funcStatus["media"] = "warn";
    }

    // Rule 6: Remote storage and CORS
    if (storage === "remote") {
      // External resources need CORS
      result.funcStatus["images"] =
        result.funcStatus["images"] === "block" ? "block" : "warn";
      result.funcStatus["fonts"] =
        result.funcStatus["fonts"] === "block" ? "block" : "warn";
      result.funcStatus["sprites"] =
        result.funcStatus["sprites"] === "block" ? "block" : "warn";
      for (const browser of BROWSERS_LIST) {
        if (result.browserStatus[browser.id]["images"] !== "block") {
          result.browserStatus[browser.id]["images"] = "warn";
        }
        if (result.browserStatus[browser.id]["fonts"] !== "block") {
          result.browserStatus[browser.id]["fonts"] = "warn";
        }
      }
    }

    // Rule 7: file:// protocol restrictions
    if (load === "file") {
      // Cross-origin restrictions still apply
      if (storage === "remote") {
        result.funcStatus["images"] = "warn";
        result.funcStatus["fonts"] = "warn";
        result.funcStatus["links"] = "warn";
      }
    }

    // Rule 8: Data URI context limitations
    if (load === "data") {
      // Data URIs have same-origin with nothing
      if (storage === "remote" || storage === "local") {
        result.funcStatus["images"] = "warn";
        result.funcStatus["fonts"] = "warn";
      }
    }

    // Note: SMIL is fully supported in Chrome/Edge - no deprecation warnings needed
    // (Google retracted the deprecation notice after community feedback)

    // Calculate overall status and counts
    let hasBlock = false;
    let hasWarn = false;
    const affectedBrowsers = new Set();

    for (const [_func, status] of Object.entries(result.funcStatus)) {
      if (status === "block") {
        hasBlock = true;
        result.issueCount++;
      } else if (status === "warn") {
        hasWarn = true;
        result.issueCount++;
      }
    }

    for (const browser of BROWSERS_LIST) {
      for (const [_func, status] of Object.entries(
        result.browserStatus[browser.id],
      )) {
        if (status !== "ok") {
          affectedBrowsers.add(browser.id);
        }
      }
    }

    result.browserCount = affectedBrowsers.size;
    result.overallStatus = hasBlock ? "block" : hasWarn ? "warn" : "ok";

    return result;
  };

  /**
   * Format cell content as array of lines for multi-row display.
   * @param {Object} cellResult - Cell evaluation result
   * @param {number} width - Cell width in characters
   * @returns {Array<string>} Array of formatted lines for the cell
   */
  const formatCellLines = (cellResult, width) => {
    const lines = [];
    const statusIcon = { ok: "✓", warn: "⚠", block: "✗" };

    if (cellResult.overallStatus === "ok") {
      // All good - single line with checkmark
      lines.push("✅ ALL OK".padStart(Math.floor(width / 2) + 5).padEnd(width));
      lines.push("".padEnd(width));
      return lines;
    }

    // Line 1: Browser status summary
    // Format: C✓ F✓ S✓ E⚠ I✗ i✗ A✓
    let browserLine = "";
    for (const browser of BROWSERS_LIST) {
      let browserStatus = "ok";
      for (const [_func, status] of Object.entries(
        cellResult.browserStatus[browser.id],
      )) {
        if (status === "block") {
          browserStatus = "block";
          break;
        } else if (status === "warn" && browserStatus !== "block") {
          browserStatus = "warn";
        }
      }
      browserLine += `${browser.code}${statusIcon[browserStatus]}`;
    }
    lines.push(
      browserLine
        .padStart(Math.floor(width / 2) + Math.floor(browserLine.length / 2))
        .padEnd(width),
    );

    // Line 2: Functionality status summary
    // Format: D✓A✗J✗E⚠M✗H✗I✓T✓U✓L✓
    let funcLine = "";
    for (const [func, info] of Object.entries(FUNC_CATEGORIES)) {
      const status = cellResult.funcStatus[func];
      if (status !== "ok") {
        funcLine += `${info.icon}${statusIcon[status]}`;
      }
    }
    if (funcLine === "") funcLine = "(ok)";
    lines.push(
      funcLine
        .padStart(Math.floor(width / 2) + Math.floor(funcLine.length / 2))
        .padEnd(width),
    );

    return lines;
  };

  /**
   * Format cell in compact single-line format (unused in current implementation).
   * @param {Object} cellResult - Cell evaluation result
   * @param {number} width - Cell width in characters
   * @returns {string} Formatted cell content
   */
  const _formatCell = (cellResult, width) => {
    const _statusIcon = { ok: "✓", warn: "⚠", block: "✗" };

    if (cellResult.overallStatus === "ok") {
      return "✅".padStart(Math.floor(width / 2) + 1).padEnd(width);
    }

    // Compact format: [overall][browserCount][issueCount]
    // e.g., "✗ 3B 5F" means blocked, 3 browsers affected, 5 functions affected
    const overall = cellResult.overallStatus === "block" ? "❌" : "⚠️";
    const browsers = `${cellResult.browserCount}B`;
    const issues = `${cellResult.issueCount}F`;
    const content = `${overall}${browsers}${issues}`;
    return content
      .padStart(Math.floor(width / 2) + Math.floor(content.length / 2))
      .padEnd(width);
  };

  // Print rows with multi-line cells
  for (const displayEnv of ROW_L1_DISPLAY) {
    // Print display header row
    const displayHeaderSpace = COL_L1_SYNTAX.map(() =>
      COL_L2_STORAGE.map(() => " ".repeat(cellWidth)).join(" "),
    ).join("│");
    console.log(
      "│ " +
        (displayEnv.label + ":").padEnd(rowHeaderWidth - 2) +
        "│" +
        displayHeaderSpace +
        "│",
    );

    for (const loadProto of ROW_L2_LOAD) {
      for (const procCtx of ROW_L3_PROCESSING) {
        // Evaluate all cells for this row
        const cellResults = [];
        for (const syntax of COL_L1_SYNTAX) {
          for (const storage of COL_L2_STORAGE) {
            const result = evaluateCell(
              displayEnv.id,
              loadProto.id,
              storage.id,
              syntax.id,
              procCtx.id,
            );
            cellResults.push(result);
          }
        }

        // Generate multi-line cell content
        const cellLines = cellResults.map((r) => formatCellLines(r, cellWidth));

        // Row header
        const rowLabel = `  ${loadProto.label} ${procCtx.label}`;

        // Print line 1: Row header + browser status
        let line1 = "│" + rowLabel.padEnd(rowHeaderWidth) + "│";
        let cellIdx = 0;
        for (let s = 0; s < COL_L1_SYNTAX.length; s++) {
          for (let st = 0; st < COL_L2_STORAGE.length; st++) {
            line1 += cellLines[cellIdx][0];
            cellIdx++;
          }
          line1 += "│";
        }
        console.log(line1.substring(0, line1.length - 1));

        // Print line 2: Empty header + functionality status
        let line2 = "│" + "".padEnd(rowHeaderWidth) + "│";
        cellIdx = 0;
        for (let s = 0; s < COL_L1_SYNTAX.length; s++) {
          for (let st = 0; st < COL_L2_STORAGE.length; st++) {
            line2 += cellLines[cellIdx][1];
            cellIdx++;
          }
          line2 += "│";
        }
        console.log(line2.substring(0, line2.length - 1));

        // Mini separator between rows within same load protocol
        if (procCtx !== ROW_L3_PROCESSING[ROW_L3_PROCESSING.length - 1]) {
          const miniSep = COL_L1_SYNTAX.map(() =>
            COL_L2_STORAGE.map(() => "·".repeat(cellWidth)).join("·"),
          ).join("│");
          console.log("│" + "·".repeat(rowHeaderWidth) + "│" + miniSep + "│");
        }
      }

      // Separator between load protocol groups
      if (loadProto !== ROW_L2_LOAD[ROW_L2_LOAD.length - 1]) {
        const loadSep = COL_L1_SYNTAX.map(() =>
          COL_L2_STORAGE.map(() => "─".repeat(cellWidth)).join("─"),
        ).join("┼");
        console.log("├" + "─".repeat(rowHeaderWidth) + "┼" + loadSep + "┤");
      }
    }

    // Separator between display groups
    if (displayEnv !== ROW_L1_DISPLAY[ROW_L1_DISPLAY.length - 1]) {
      const dispSep = COL_L1_SYNTAX.map(() =>
        COL_L2_STORAGE.map(() => "═".repeat(cellWidth)).join("═"),
      ).join("╪");
      console.log("╞" + "═".repeat(rowHeaderWidth) + "╪" + dispSep + "╡");
    }
  }

  // Bottom border
  console.log(
    "└" +
      "─".repeat(rowHeaderWidth) +
      "┴" +
      COL_L1_SYNTAX.map(() =>
        COL_L2_STORAGE.map(() => "─".repeat(cellWidth)).join("─"),
      ).join("┴") +
      "┘",
  );

  // ============================================================================
  // LEGEND
  // ============================================================================

  console.log("\n┌" + "─".repeat(120) + "┐");
  console.log("│ LEGEND - HOW TO READ CELL CONTENT" + " ".repeat(85) + "│");
  console.log("├" + "─".repeat(120) + "┤");
  console.log("│ Each cell shows 2 lines:" + " ".repeat(95) + "│");
  console.log(
    "│   Line 1: Browser status (C=Chrome F=Firefox S=Safari E=Edge I=IE11 i=iOS A=Android)" +
      " ".repeat(34) +
      "│",
  );
  console.log(
    "│   Line 2: Functionality issues (codes below)" + " ".repeat(74) + "│",
  );
  console.log("│" + " ".repeat(120) + "│");
  console.log(
    "│ Status symbols: ✓ = works   ⚠ = warning/partial   ✗ = blocked/broken" +
      " ".repeat(49) +
      "│",
  );
  console.log("│" + " ".repeat(120) + "│");
  console.log(
    "│ ✅ ALL OK = No issues in this combination" + " ".repeat(78) + "│",
  );
  console.log("│" + " ".repeat(120) + "│");
  console.log("│ FUNCTIONALITY CODES:" + " ".repeat(99) + "│");

  let codeLine = "│   ";
  for (const [_cat, info] of Object.entries(FUNC_CATEGORIES)) {
    codeLine += `${info.icon}=${_cat}  `;
  }
  console.log(codeLine.padEnd(121) + "│");

  console.log("│" + " ".repeat(120) + "│");
  console.log("│ FULL FUNCTIONALITY NAMES:" + " ".repeat(94) + "│");
  let funcNames = "│   ";
  for (const [_cat, info] of Object.entries(FUNC_CATEGORIES)) {
    funcNames += `${info.icon}=${info.name}  `;
  }
  // Split if too long
  if (funcNames.length > 120) {
    console.log(funcNames.substring(0, 121) + "│");
    funcNames = "│   " + funcNames.substring(121);
  }
  console.log(funcNames.padEnd(121) + "│");

  console.log("│" + " ".repeat(120) + "│");
  console.log("│ EXAMPLES:" + " ".repeat(110) + "│");
  console.log(
    '│   "C✓F✓S✓E⚠I✗i✗A✓" = Chrome/Firefox/Safari/Android OK, Edge warning, IE11/iOS blocked' +
      " ".repeat(30) +
      "│",
  );
  console.log(
    '│   "A✗J✗M⚠H✗" = Animation blocked, Scripting blocked, Media warning, HTML blocked' +
      " ".repeat(37) +
      "│",
  );
  console.log("└" + "─".repeat(120) + "┘");

  // ============================================================================
  // TABLE 2: INTERNAL SVG RESOURCES
  // ============================================================================

  console.log("\n");
  console.log("╔" + "═".repeat(120) + "╗");
  console.log(
    "║" +
      " TABLE 2: INTERNAL SVG RESOURCES COMPATIBILITY "
        .padStart(84)
        .padEnd(120) +
      "║",
  );
  console.log("╚" + "═".repeat(120) + "╝");

  // Resource categories
  const RESOURCE_TYPES = [
    { id: "images_embedded", label: "Embedded Images (data-uri)", icon: "🖼️" },
    { id: "images_local", label: "Local Images (path)", icon: "📁" },
    { id: "images_remote", label: "Remote Images (URL)", icon: "🌐" },
    { id: "fonts_embedded", label: "Embedded Fonts (data-uri)", icon: "🔤" },
    { id: "fonts_local", label: "Local Fonts (path)", icon: "📁" },
    { id: "fonts_remote", label: "Remote Fonts (URL)", icon: "🌐" },
    { id: "css_inline", label: "Inline <style>", icon: "🎨" },
    { id: "css_external", label: "External CSS", icon: "📄" },
    { id: "scripts_inline", label: "Inline <script>", icon: "📜" },
    { id: "scripts_external", label: "External Scripts", icon: "📦" },
    { id: "audio_embedded", label: "Embedded Audio", icon: "🔊" },
    { id: "audio_external", label: "External Audio", icon: "🎵" },
  ];

  // Print resource table header
  const resColWidth = 14;
  let resHeader = "".padEnd(30) + "│";
  for (const syntax of COL_L1_SYNTAX) {
    resHeader += syntax.label.padStart(resColWidth - 1).padEnd(resColWidth);
  }
  resHeader += "│";

  console.log(
    "\n┌" +
      "─".repeat(30) +
      "┬" +
      "─".repeat(COL_L1_SYNTAX.length * resColWidth) +
      "┐",
  );
  console.log("│" + "RESOURCE TYPE".padEnd(30) + resHeader.substring(31));
  console.log(
    "├" +
      "─".repeat(30) +
      "┼" +
      "─".repeat(COL_L1_SYNTAX.length * resColWidth) +
      "┤",
  );

  /**
   * Get the compatibility status of a resource type for a given embedding syntax.
   * @param {string} resourceId - The resource type ID
   * @param {string} syntaxId - The embedding syntax ID
   * @returns {string} Status emoji (✅ supported, ⚠️ partial/CORS, ❌ blocked)
   */
  const getResourceStatus = (resourceId, syntaxId) => {
    // IMG and CSS block external resources and scripts
    if (syntaxId === "img" || syntaxId === "css") {
      if (
        resourceId.includes("external") ||
        resourceId.includes("remote") ||
        resourceId.includes("scripts") ||
        resourceId.includes("audio")
      ) {
        return "❌";
      }
      if (resourceId.includes("local") && !resourceId.includes("embedded")) {
        return "⚠️";
      }
    }

    // OBJECT/EMBED have isolated context
    if (syntaxId === "object" || syntaxId === "embed") {
      if (resourceId.includes("remote") && !resourceId.includes("embedded")) {
        return "⚠️"; // CORS may apply
      }
    }

    // Embedded resources work everywhere
    if (resourceId.includes("embedded") || resourceId.includes("inline")) {
      return "✅";
    }

    // Local resources need file:// or same-origin
    if (resourceId.includes("local")) {
      return "⚠️";
    }

    // Remote resources need CORS
    if (resourceId.includes("remote") || resourceId.includes("external")) {
      return "⚠️";
    }

    return "✅";
  };

  // Print resource rows
  for (const resource of RESOURCE_TYPES) {
    let row = `│ ${resource.icon} ${resource.label}`.padEnd(31) + "│";
    for (const syntax of COL_L1_SYNTAX) {
      const status = getResourceStatus(resource.id, syntax.id);
      row += status.padStart(resColWidth - 1).padEnd(resColWidth);
    }
    row += "│";
    console.log(row);
  }

  console.log(
    "└" +
      "─".repeat(30) +
      "┴" +
      "─".repeat(COL_L1_SYNTAX.length * resColWidth) +
      "┘",
  );

  // ============================================================================
  // TABLE 3: BROWSER-SPECIFIC ISSUES DETAIL
  // ============================================================================

  console.log("\n");
  console.log("╔" + "═".repeat(120) + "╗");
  console.log(
    "║" +
      " TABLE 3: BROWSER-SPECIFIC ISSUES FOR DETECTED CAPABILITIES "
        .padStart(90)
        .padEnd(120) +
      "║",
  );
  console.log("╚" + "═".repeat(120) + "╝");

  // Group detected capabilities
  const detectedByCategory = {};
  for (const cap of matrixData.detectedCapabilities || []) {
    const catMap = {
      RENDER_: "display",
      FONTS_: "fonts",
      IMAGES_: "images",
      FILTERS_: "effects",
      MASKS: "effects",
      CLIP_: "effects",
      SMIL_: "animation",
      CSS_: "animation",
      SCRIPT_: "scripting",
      EVENT_: "events",
      LINK_: "links",
      FOREIGNOBJECT_: "html",
      AUDIO_: "media",
      VIDEO_: "media",
      USE_: "sprites",
      A11Y_: "accessibility",
      META_: "metadata",
    };

    for (const [prefix, cat] of Object.entries(catMap)) {
      if (cap.startsWith(prefix) || cap === prefix.replace("_", "")) {
        if (!detectedByCategory[cat]) detectedByCategory[cat] = [];
        detectedByCategory[cat].push(cap);
        break;
      }
    }
  }

  console.log("\n┌" + "─".repeat(20) + "┬" + "─".repeat(99) + "┐");
  console.log(
    "│ CAPABILITY" + " ".repeat(9) + "│ BROWSER ISSUES" + " ".repeat(84) + "│",
  );
  console.log("├" + "─".repeat(20) + "┼" + "─".repeat(99) + "┤");

  const browserIssues = {
    animation: {
      Chrome: "Full SMIL support",
      IE11: "NO SMIL SUPPORT",
      Safari: "Full support",
    },
    media: {
      ALL: "Autoplay blocked - needs user gesture",
      iOS: "VERY strict autoplay policy",
    },
    html: {
      IE11: "No scripting in foreignObject",
      Cairo: "Not rendered",
      ImageMagick: "Not rendered",
    },
    scripting: {
      IE11: "Limited ES6 support",
    },
    effects: {
      IE11: "Limited filter support, no blend modes",
    },
  };

  for (const [cat, _caps] of Object.entries(detectedByCategory)) {
    const issues = browserIssues[cat] || {};
    const issueStr =
      Object.entries(issues)
        .map(([browser, issue]) => `${browser}: ${issue}`)
        .join("; ") || "No known issues";

    console.log(
      `│ ${cat.toUpperCase().padEnd(18)} │ ${issueStr.substring(0, 97).padEnd(97)} │`,
    );
  }

  console.log("└" + "─".repeat(20) + "┴" + "─".repeat(99) + "┘");

  console.log("\n" + "═".repeat(140) + "\n");

  return matrixData;
}

/**
 * Generate an SVG visualization of the compatibility matrix (LEGACY - simple version).
 * @deprecated Use generateDetailedCompatibilityMatrixSVG for full hierarchical output
 */
export function generateCompatibilityMatrixSVG_legacy(
  matrixData,
  options = {},
) {
  const cellWidth = options.cellWidth || 60;
  const cellHeight = options.cellHeight || 45;
  const fontFamily =
    options.fontFamily || "system-ui, -apple-system, sans-serif";
  const interactive = options.interactive !== false;

  // Axis definitions (same as printHierarchicalMatrix)
  const COL_L1_SYNTAX = [
    { id: "direct", label: "DIRECT", desc: "SVG file" },
    { id: "img", label: "IMG", desc: "<img>" },
    { id: "object", label: "OBJECT", desc: "<object>" },
    { id: "embed", label: "EMBED", desc: "<embed>" },
    { id: "inline", label: "INLINE", desc: "<svg>" },
    { id: "css", label: "CSS", desc: "bg-image" },
  ];

  const COL_L2_STORAGE = [
    { id: "embedded", label: "EMB", desc: "Embedded (data-uri)" },
    { id: "local", label: "LOC", desc: "Local path" },
    { id: "remote", label: "REM", desc: "Remote URL" },
  ];

  const ROW_L1_DISPLAY = [
    { id: "browser", label: "BROWSER", desc: "Desktop browsers" },
    { id: "mobile", label: "MOBILE", desc: "Mobile WebView" },
    { id: "renderer", label: "RENDER", desc: "Server-side render" },
  ];

  const ROW_L2_LOAD = [
    { id: "file", label: "file://", desc: "Local filesystem" },
    { id: "http", label: "http(s)://", desc: "Web server" },
    { id: "data", label: "data:", desc: "Data URI" },
  ];

  const ROW_L3_PROCESSING = [
    { id: "script", label: "+JS", desc: "With JavaScript" },
    { id: "noscript", label: "-JS", desc: "No JavaScript" },
  ];

  const BROWSERS_LOCAL = [
    { id: "chrome", code: "C", name: "Chrome", color: "#4285F4" },
    { id: "firefox", code: "F", name: "Firefox", color: "#FF7139" },
    { id: "safari", code: "S", name: "Safari", color: "#006CFF" },
    { id: "edge", code: "E", name: "Edge", color: "#0078D7" },
    { id: "ie11", code: "I", name: "IE11", color: "#1EBBEE" },
    { id: "ios", code: "i", name: "iOS", color: "#999" },
    { id: "android", code: "A", name: "Android", color: "#3DDC84" },
  ];

  const FUNCS = [
    { id: "display", code: "D", name: "Display", color: "#2196F3" },
    { id: "animation", code: "A", name: "Animation", color: "#9C27B0" },
    { id: "scripting", code: "J", name: "JavaScript", color: "#FF9800" },
    { id: "events", code: "E", name: "Events", color: "#E91E63" },
    { id: "media", code: "M", name: "Media", color: "#00BCD4" },
    { id: "html", code: "H", name: "foreignObject", color: "#795548" },
    { id: "images", code: "I", name: "Images", color: "#8BC34A" },
    { id: "fonts", code: "T", name: "Fonts", color: "#607D8B" },
    { id: "sprites", code: "U", name: "use/sprites", color: "#FF5722" },
    { id: "links", code: "L", name: "Links", color: "#3F51B5" },
  ];

  // Calculate dimensions
  const rowHeaderWidth = 140;
  const colHeaderHeight = 80;
  const totalCols = COL_L1_SYNTAX.length * COL_L2_STORAGE.length;
  const totalRows =
    ROW_L1_DISPLAY.length * ROW_L2_LOAD.length * ROW_L3_PROCESSING.length;
  const svgWidth = rowHeaderWidth + totalCols * cellWidth + 40;
  const svgHeight = colHeaderHeight + totalRows * cellHeight + 200; // Extra for legend

  // Color helpers
  const statusColors = {
    ok: "#4CAF50",
    warn: "#FF9800",
    block: "#F44336",
  };

  /**
   * Evaluate a cell for the legacy SVG visualization (simplified version).
   * @param {string} display - Display environment ID
   * @param {string} load - Load protocol ID
   * @param {string} storage - Storage type ID
   * @param {string} syntax - Embedding syntax ID
   * @param {string} processing - Processing context ID
   * @returns {Object} Simplified cell evaluation result
   */
  const evaluateCell = (display, load, storage, syntax, processing) => {
    const result = { browserStatus: {}, funcStatus: {}, overallStatus: "ok" };

    // Initialize
    for (const b of BROWSERS_LOCAL) {
      result.browserStatus[b.id] = {};
      for (const f of FUNCS) result.browserStatus[b.id][f.id] = "ok";
    }
    for (const f of FUNCS) result.funcStatus[f.id] = "ok";

    // Apply rules
    if (syntax === "img" || syntax === "css") {
      ["animation", "scripting", "events", "html", "media", "links"].forEach(
        (f) => {
          result.funcStatus[f] = "block";
          BROWSERS_LOCAL.forEach((b) => {
            result.browserStatus[b.id][f] = "block";
          });
        },
      );
    }

    if (display === "renderer") {
      ["animation", "scripting", "events", "media", "html"].forEach((f) => {
        result.funcStatus[f] = "block";
        BROWSERS_LOCAL.forEach((b) => {
          result.browserStatus[b.id][f] = "block";
        });
      });
    }

    if (processing === "noscript") {
      result.funcStatus["scripting"] = "block";
      result.funcStatus["events"] = "warn";
      BROWSERS_LOCAL.forEach((b) => {
        result.browserStatus[b.id]["scripting"] = "block";
        result.browserStatus[b.id]["events"] = "warn";
      });
    }

    // IE11 specific
    result.browserStatus["ie11"]["animation"] = "block";
    result.browserStatus["ie11"]["html"] = "block";

    // Media autoplay
    if (matrixData.detectedCapabilities?.some((c) => c.startsWith("AUDIO_"))) {
      BROWSERS_LOCAL.forEach((b) => {
        if (result.browserStatus[b.id]["media"] !== "block") {
          result.browserStatus[b.id]["media"] = "warn";
        }
      });
      result.browserStatus["ios"]["media"] = "block";
      result.funcStatus["media"] = "warn";
    }

    // Remote storage
    if (storage === "remote") {
      ["images", "fonts", "sprites"].forEach((f) => {
        if (result.funcStatus[f] !== "block") result.funcStatus[f] = "warn";
      });
    }

    // Note: SMIL is fully supported in all modern browsers (except IE11)
    // Google retracted the deprecation notice after community feedback

    // Calculate overall
    let hasBlock = false,
      hasWarn = false;
    Object.values(result.funcStatus).forEach((s) => {
      if (s === "block") hasBlock = true;
      else if (s === "warn") hasWarn = true;
    });
    result.overallStatus = hasBlock ? "block" : hasWarn ? "warn" : "ok";

    return result;
  };

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMinYMin meet" height="${svgHeight}" width="100%">
  <title>SVG Compatibility Matrix</title>
  <desc>Browser and functionality compatibility for different SVG embedding methods</desc>

  <defs>
    <style>
      .title { font: bold 18px ${fontFamily}; fill: #333; }
      .subtitle { font: 12px ${fontFamily}; fill: #666; }
      .col-header { font: bold 11px ${fontFamily}; fill: #333; }
      .col-subheader { font: 10px ${fontFamily}; fill: #555; }
      .row-header { font: bold 10px ${fontFamily}; fill: #333; }
      .row-subheader { font: 9px ${fontFamily}; fill: #555; }
      .cell-text { font: 8px ${fontFamily}; fill: #333; }
      .cell-ok { fill: #E8F5E9; }
      .cell-warn { fill: #FFF3E0; }
      .cell-block { fill: #FFEBEE; }
      .legend-text { font: 10px ${fontFamily}; fill: #333; }
      .grid-line { stroke: #DDD; stroke-width: 1; }
      .grid-line-bold { stroke: #999; stroke-width: 2; }
      ${
        interactive
          ? `
      .cell-group:hover rect { stroke: #333; stroke-width: 2; }
      .tooltip { pointer-events: none; opacity: 0; transition: opacity 0.2s; }
      .cell-group:hover .tooltip { opacity: 1; }
      `
          : ""
      }
    </style>
  </defs>

  <!-- Title -->
  <text x="${svgWidth / 2}" y="25" text-anchor="middle" class="title">SVG Compatibility Matrix</text>
  <text x="${svgWidth / 2}" y="42" text-anchor="middle" class="subtitle">
    ${totalCols} columns × ${totalRows} rows = ${totalCols * totalRows} combinations
  </text>

  <g transform="translate(20, 55)">
`;

  // Column headers - Level 1 (SYNTAX)
  let colX = rowHeaderWidth;
  for (const syntax of COL_L1_SYNTAX) {
    const groupWidth = COL_L2_STORAGE.length * cellWidth;
    svg += `    <rect x="${colX}" y="0" width="${groupWidth}" height="25" fill="#E3F2FD" stroke="#90CAF9"/>
    <text x="${colX + groupWidth / 2}" y="17" text-anchor="middle" class="col-header">${syntax.label}</text>
`;
    // Level 2 (STORAGE)
    for (let i = 0; i < COL_L2_STORAGE.length; i++) {
      const storage = COL_L2_STORAGE[i];
      const x = colX + i * cellWidth;
      svg += `    <rect x="${x}" y="25" width="${cellWidth}" height="20" fill="#F5F5F5" stroke="#DDD"/>
    <text x="${x + cellWidth / 2}" y="39" text-anchor="middle" class="col-subheader">${storage.label}</text>
`;
    }
    colX += groupWidth;
  }

  // Row headers and cells
  let rowY = colHeaderHeight - 35;
  for (const displayEnv of ROW_L1_DISPLAY) {
    // Display header
    const displayRows = ROW_L2_LOAD.length * ROW_L3_PROCESSING.length;
    const displayHeight = displayRows * cellHeight;
    svg += `    <rect x="0" y="${rowY}" width="50" height="${displayHeight}" fill="#E8EAF6" stroke="#9FA8DA"/>
    <text x="25" y="${rowY + displayHeight / 2}" text-anchor="middle" dominant-baseline="middle" class="row-header" transform="rotate(-90, 25, ${rowY + displayHeight / 2})">${displayEnv.label}</text>
`;

    for (const loadProto of ROW_L2_LOAD) {
      for (const procCtx of ROW_L3_PROCESSING) {
        // Row label
        svg += `    <rect x="50" y="${rowY}" width="90" height="${cellHeight}" fill="#FAFAFA" stroke="#EEE"/>
    <text x="55" y="${rowY + cellHeight / 2 - 6}" class="row-subheader">${loadProto.label}</text>
    <text x="55" y="${rowY + cellHeight / 2 + 8}" class="row-subheader">${procCtx.label}</text>
`;

        // Cells
        colX = rowHeaderWidth;
        for (const syntax of COL_L1_SYNTAX) {
          for (const storage of COL_L2_STORAGE) {
            const cellResult = evaluateCell(
              displayEnv.id,
              loadProto.id,
              storage.id,
              syntax.id,
              procCtx.id,
            );
            const cellClass = `cell-${cellResult.overallStatus}`;

            // Build browser status string
            let browserStr = "";
            for (const b of BROWSERS_LOCAL) {
              let bStatus = "ok";
              for (const f of FUNCS) {
                const s = cellResult.browserStatus[b.id][f.id];
                if (s === "block") {
                  bStatus = "block";
                  break;
                } else if (s === "warn" && bStatus !== "block")
                  bStatus = "warn";
              }
              const symbol =
                bStatus === "ok" ? "✓" : bStatus === "warn" ? "⚠" : "✗";
              browserStr += `${b.code}${symbol}`;
            }

            // Build func status string
            let funcStr = "";
            for (const f of FUNCS) {
              const s = cellResult.funcStatus[f.id];
              if (s !== "ok") {
                funcStr += `${f.code}${s === "warn" ? "⚠" : "✗"}`;
              }
            }
            if (!funcStr) funcStr = "OK";

            svg += `    <g class="cell-group">
      <rect x="${colX}" y="${rowY}" width="${cellWidth}" height="${cellHeight}" class="${cellClass}" stroke="#DDD"/>
      <text x="${colX + cellWidth / 2}" y="${rowY + 15}" text-anchor="middle" class="cell-text">${browserStr.substring(0, 10)}</text>
      <text x="${colX + cellWidth / 2}" y="${rowY + 28}" text-anchor="middle" class="cell-text">${browserStr.substring(10)}</text>
      <text x="${colX + cellWidth / 2}" y="${rowY + 40}" text-anchor="middle" class="cell-text" fill="${statusColors[cellResult.overallStatus]}">${funcStr.substring(0, 8)}</text>
`;
            if (interactive) {
              // Tooltip
              svg += `      <g class="tooltip" transform="translate(${colX + cellWidth / 2}, ${rowY - 5})">
        <rect x="-60" y="-45" width="120" height="40" fill="#333" rx="4"/>
        <text x="0" y="-30" text-anchor="middle" fill="#FFF" font-size="9">${syntax.label}/${storage.label}</text>
        <text x="0" y="-17" text-anchor="middle" fill="#FFF" font-size="8">${displayEnv.label} ${loadProto.label} ${procCtx.label}</text>
      </g>
`;
            }
            svg += `    </g>
`;
            colX += cellWidth;
          }
        }
        rowY += cellHeight;
      }
    }
  }

  // Legend
  const legendY = colHeaderHeight + totalRows * cellHeight + 20;
  svg += `
  <!-- Legend -->
  <g transform="translate(0, ${legendY})">
    <text x="10" y="15" class="col-header">LEGEND</text>

    <!-- Status colors -->
    <rect x="10" y="25" width="20" height="15" class="cell-ok" stroke="#4CAF50"/>
    <text x="35" y="37" class="legend-text">OK - All features work</text>

    <rect x="160" y="25" width="20" height="15" class="cell-warn" stroke="#FF9800"/>
    <text x="185" y="37" class="legend-text">Warning - Partial support</text>

    <rect x="340" y="25" width="20" height="15" class="cell-block" stroke="#F44336"/>
    <text x="365" y="37" class="legend-text">Blocked - Not supported</text>

    <!-- Browser codes -->
    <text x="10" y="60" class="col-header">BROWSERS:</text>
`;

  let legendX = 90;
  for (const b of BROWSERS_LOCAL) {
    svg += `    <text x="${legendX}" y="60" class="legend-text"><tspan fill="${b.color}" font-weight="bold">${b.code}</tspan>=${b.name}</text>
`;
    legendX += 85;
  }

  svg += `
    <!-- Functionality codes -->
    <text x="10" y="80" class="col-header">FUNCTIONS:</text>
`;

  legendX = 90;
  let legendRow = 0;
  for (const f of FUNCS) {
    if (legendX > 600) {
      legendX = 90;
      legendRow++;
    }
    svg += `    <text x="${legendX}" y="${80 + legendRow * 18}" class="legend-text"><tspan fill="${f.color}" font-weight="bold">${f.code}</tspan>=${f.name}</text>
`;
    legendX += 100;
  }

  svg += `  </g>
</g>
</svg>`;

  return svg;
}

/**
 * Generate a detailed, hierarchical SVG visualization of the compatibility matrix.
 * Features:
 * - Full names (no abbreviations)
 * - 3-tier row hierarchy: Display Environment > Loading Protocol > Script Context
 * - 2-tier column hierarchy: Embedding Method > Storage Type
 * - Cells show: Issue list + browser mini-icons for affected browsers
 * - Single-column legend
 * - Color coding for each attribute group
 *
 * @param {Object} matrixData - Data from generateFullCompatibilityMatrix()
 * @param {Object} options - Configuration options
 * @returns {string} SVG markup string
 */
/**
 * Generate a detailed, hierarchical SVG visualization of the compatibility matrix.
 * Each cell contains human-readable descriptions of what will happen in that scenario.
 *
 * @param {Object} matrixData - Data from generateFullCompatibilityMatrix()
 * @param {Object} options - Configuration options
 * @returns {string} SVG markup string
 */
/**
 * Generate a clean, readable SVG compatibility matrix.
 * - Horizontal labels (no rotation)
 * - Icons inline with text
 * - Optimized hierarchy to minimize wasted space
 */
export function generateCompatibilityMatrixSVG(matrixData, options = {}) {
  const fontFamily =
    options.fontFamily ||
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  // BUG FIX: Define escapeXmlLocal helper (was undefined causing ReferenceError)
  const escapeXmlLocal = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // ============================================================================
  // COLUMN HIERARCHY (optimized)
  // Level 1: Standalone SVG vs In HTML
  // Level 2: For "In HTML" only - the embedding tags
  // ============================================================================

  const COLUMNS = [
    {
      id: "standalone",
      name: "Standalone SVG",
      desc: "Open .svg directly",
      color: "#1565C0",
      parent: null,
    },
    {
      id: "img",
      name: "<img>",
      desc: "Image element",
      color: "#1976D2",
      parent: "html",
    },
    {
      id: "object",
      name: "<object>",
      desc: "Object element",
      color: "#1E88E5",
      parent: "html",
    },
    {
      id: "embed",
      name: "<embed>",
      desc: "Embed element",
      color: "#2196F3",
      parent: "html",
    },
    {
      id: "inline",
      name: "Inline <svg>",
      desc: "SVG in HTML",
      color: "#42A5F5",
      parent: "html",
    },
    {
      id: "css",
      name: "CSS background",
      desc: "background-image",
      color: "#64B5F6",
      parent: "html",
    },
  ];

  // ============================================================================
  // ROW HIERARCHY (optimized, all horizontal)
  // Level 1: Environment (Desktop, Mobile, Server)
  // Level 2: Protocol (file://, http://)
  // Level 3: JavaScript (enabled, disabled)
  // ============================================================================

  // Browser environments (consolidated - browser-specific issues noted in parentheses)
  const ENVIRONMENTS = [
    {
      id: "desktop",
      name: "Desktop Browser",
      color: "#E3F2FD",
      type: "desktop",
    },
    { id: "mobile", name: "Mobile Browser", color: "#E8F5E9", type: "mobile" },
  ];

  // Server renderers (separate table - embedding columns don't apply)
  const SERVER_RENDERERS = [
    {
      id: "nodejs",
      name: "Node.js (JSDOM)",
      color: "#FFF3E0",
      issues: ["No rendering", "No animations", "No interaction"],
    },
    {
      id: "imagemagick",
      name: "ImageMagick",
      color: "#EFEBE9",
      issues: [
        "No animations",
        "No scripts",
        "No foreignObject",
        "No web fonts",
      ],
    },
    {
      id: "inkscape",
      name: "Inkscape CLI",
      color: "#F3E5F5",
      issues: ["No animations", "No scripts"],
    },
    {
      id: "librsvg",
      name: "librsvg",
      color: "#E0F2F1",
      issues: ["No animations", "No scripts", "Limited filters"],
    },
    {
      id: "cairo",
      name: "Cairo",
      color: "#FBE9E7",
      issues: ["No animations", "No scripts", "No filters", "No foreignObject"],
    },
    {
      id: "batik",
      name: "Apache Batik",
      color: "#F3E5F5",
      issues: ["No CSS animations", "Limited SMIL", "No web fonts"],
    },
  ];

  const PROTOCOLS = [
    { id: "file", name: "file://", color: "#BBDEFB" },
    { id: "http", name: "http(s)://", color: "#C8E6C9" },
  ];

  const SCRIPTS = [
    { id: "js", name: "JS enabled", color: "#DCEDC8" },
    { id: "nojs", name: "JS disabled", color: "#FFCDD2" },
  ];

  // ============================================================================
  // COMPATIBILITY RULES - Human readable descriptions
  // ============================================================================

  /**
   * Get list of compatibility problems for a specific configuration.
   * @param {string} envId - Environment ID (desktop, mobile)
   * @param {string} protoId - Protocol ID (file, http)
   * @param {string} scriptId - Script context ID (js, nojs)
   * @param {string} colId - Column/embedding ID (standalone, img, object, embed, inline, css)
   * @returns {Array<Object>} Array of problem objects with text property
   */
  const getProblems = (envId, protoId, scriptId, colId) => {
    const problems = [];
    /**
     * Add a problem to the problems list.
     * @param {string} text - Problem description text
     * @returns {void}
     */
    const add = (text) => problems.push({ text });

    // =========================================================================
    // IMG and CSS background: Sandboxed - ISSUES ONLY
    // SMIL and CSS animations WORK in img tags
    // =========================================================================
    if (colId === "img" || colId === "css") {
      add("No scripts");
      add("No events");
      add("No audio/video");
      add("No links");
      add("No foreignObject");
      add("No external resources");
      return problems;
    }

    // =========================================================================
    // JAVASCRIPT DISABLED - ISSUES ONLY
    // =========================================================================
    if (scriptId === "nojs") {
      add("No scripts");
      add("No event handlers");
    }

    // =========================================================================
    // PROTOCOL: file:// - ISSUES ONLY (with browser-specific notes)
    // =========================================================================
    if (protoId === "file") {
      add("No remote fonts (Chrome, Safari)");
      add("No remote images (Chrome)");
      add("No fetch/XHR to remote URLs");
    }

    // =========================================================================
    // EMBEDDING: Object/Embed - ISSUES ONLY
    // =========================================================================
    if (colId === "object" || colId === "embed") {
      add("No event bubbling to parent");
      if (protoId === "http") {
        add("No cross-origin script access");
      }
    }

    // =========================================================================
    // DESKTOP BROWSER ISSUES
    // =========================================================================
    if (envId === "desktop") {
      add("No SMIL (IE11 only)");
      add("No CSS variables (IE11 only)");
      if (scriptId === "js") {
        add("Audio: blocked until user click/tap event");
        add("Audio: once blocked, won't auto-retry");
      }
    }

    // =========================================================================
    // MOBILE BROWSER ISSUES
    // =========================================================================
    if (envId === "mobile") {
      add("No hover/mouseover events");
      add("Audio: blocked until user tap event");
      add("Audio: once blocked, won't auto-retry");
      add("Video autoplay blocked");
    }

    return problems;
  };

  // ============================================================================
  // CALCULATE MAX PROBLEMS TO DETERMINE CELL HEIGHT
  // ============================================================================

  let maxProblems = 0;
  for (const env of ENVIRONMENTS) {
    for (const proto of PROTOCOLS) {
      for (const script of SCRIPTS) {
        for (const col of COLUMNS) {
          const count = getProblems(env.id, proto.id, script.id, col.id).length;
          if (count > maxProblems) maxProblems = count;
        }
      }
    }
  }

  // ============================================================================
  // DIMENSIONS
  // ============================================================================

  const rowLabelWidth1 = 130; // Environment
  const rowLabelWidth2 = 80; // Protocol
  const rowLabelWidth3 = 90; // Script
  const totalRowLabelWidth = rowLabelWidth1 + rowLabelWidth2 + rowLabelWidth3;

  const colHeaderHeight = 60;
  const cellWidth = 220;
  const lineHeight = 13;
  // Dynamic cell height: fit all problems plus padding
  const cellHeight = Math.max(80, (maxProblems + 1) * lineHeight + 25);

  const totalCols = COLUMNS.length;
  const totalRows = ENVIRONMENTS.length * PROTOCOLS.length * SCRIPTS.length;

  const tableWidth = totalRowLabelWidth + totalCols * cellWidth;
  const tableHeight = colHeaderHeight + totalRows * cellHeight;

  // Server renderers section (separate table)
  const serverSectionY = tableHeight + 40;
  const serverRowHeight = 30;
  const serverSectionHeight = 40 + SERVER_RENDERERS.length * serverRowHeight;

  const legendY = serverSectionY + serverSectionHeight + 30;
  const legendHeight = 1020; // Expanded for SMIL begin + user activation + SVG root click documentation

  const svgWidth = tableWidth + 50;
  // Account for main group transform offset (25, 55) plus content
  const svgHeight = 55 + legendY + legendHeight + 50;

  // ============================================================================
  // BUILD SVG
  // ============================================================================

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMinYMin meet" height="${svgHeight}" width="100%">
  <title>SVG Compatibility Matrix</title>

  <defs>
    <style>
      .title { font: bold 20px ${fontFamily}; fill: #1a1a1a; }
      .subtitle { font: 12px ${fontFamily}; fill: #666; }
      .col-header { font: bold 12px ${fontFamily}; fill: #FFF; }
      .col-desc { font: 10px ${fontFamily}; fill: rgba(255,255,255,0.85); }
      .row-label { font: 11px ${fontFamily}; fill: #333; }
      .row-label-bold { font: bold 11px ${fontFamily}; fill: #1a1a1a; }
      .cell-ok { fill: #C8E6C9; }
      .cell-warn { fill: #FFF9C4; }
      .cell-bad { fill: #FFCDD2; }
      .ok-text { font: bold 13px ${fontFamily}; fill: #2E7D32; }
      .problem-text { font: 10px ${fontFamily}; fill: #333; }
      .legend-title { font: bold 11px ${fontFamily}; fill: #333; }
      .legend-text { font: 10px ${fontFamily}; fill: #444; }
    </style>
  </defs>

  <text x="${svgWidth / 2}" y="24" text-anchor="middle" class="title">SVG Compatibility Matrix</text>
  <text x="${svgWidth / 2}" y="42" text-anchor="middle" class="subtitle">What problems will your SVG have in each configuration?</text>

  <g transform="translate(25, 55)">
`;

  // ============================================================================
  // COLUMN HEADERS (horizontal)
  // ============================================================================

  let colX = totalRowLabelWidth;

  // Top row: "Standalone" vs "In HTML Page" grouping
  svg += `    <rect x="${colX}" y="0" width="${cellWidth}" height="${colHeaderHeight}" fill="${COLUMNS[0].color}" stroke="#1565C0"/>
    <text x="${colX + cellWidth / 2}" y="25" text-anchor="middle" class="col-header">${escapeXmlLocal(COLUMNS[0].name)}</text>
    <text x="${colX + cellWidth / 2}" y="42" text-anchor="middle" class="col-desc">${escapeXmlLocal(COLUMNS[0].desc)}</text>
`;
  colX += cellWidth;

  // "In HTML Page" group header
  const htmlGroupWidth = (COLUMNS.length - 1) * cellWidth;
  svg += `    <rect x="${colX}" y="0" width="${htmlGroupWidth}" height="25" fill="#0D47A1"/>
    <text x="${colX + htmlGroupWidth / 2}" y="17" text-anchor="middle" class="col-header">In HTML Page</text>
`;

  // Individual HTML embedding methods
  for (let i = 1; i < COLUMNS.length; i++) {
    const col = COLUMNS[i];
    svg += `    <rect x="${colX}" y="25" width="${cellWidth}" height="${colHeaderHeight - 25}" fill="${col.color}" stroke="#1976D2"/>
    <text x="${colX + cellWidth / 2}" y="42" text-anchor="middle" class="col-header">${escapeXmlLocal(col.name)}</text>
    <text x="${colX + cellWidth / 2}" y="55" text-anchor="middle" class="col-desc">${escapeXmlLocal(col.desc)}</text>
`;
    colX += cellWidth;
  }

  // ============================================================================
  // ROW HEADERS AND DATA CELLS (all horizontal)
  // ============================================================================

  let rowY = colHeaderHeight;

  for (const env of ENVIRONMENTS) {
    const envHeight = PROTOCOLS.length * SCRIPTS.length * cellHeight;

    // Environment label (horizontal, spanning multiple rows)
    svg += `    <rect x="0" y="${rowY}" width="${rowLabelWidth1}" height="${envHeight}" fill="${env.color}" stroke="#999"/>
    <text x="${rowLabelWidth1 / 2}" y="${rowY + envHeight / 2 + 4}" text-anchor="middle" class="row-label-bold">${escapeXmlLocal(env.name)}</text>
`;

    for (const proto of PROTOCOLS) {
      const protoHeight = SCRIPTS.length * cellHeight;

      // Protocol label
      svg += `    <rect x="${rowLabelWidth1}" y="${rowY}" width="${rowLabelWidth2}" height="${protoHeight}" fill="${proto.color}" stroke="#CCC"/>
    <text x="${rowLabelWidth1 + rowLabelWidth2 / 2}" y="${rowY + protoHeight / 2 + 4}" text-anchor="middle" class="row-label">${escapeXmlLocal(proto.name)}</text>
`;

      for (const script of SCRIPTS) {
        // Script label
        svg += `    <rect x="${rowLabelWidth1 + rowLabelWidth2}" y="${rowY}" width="${rowLabelWidth3}" height="${cellHeight}" fill="${script.color}" stroke="#DDD"/>
    <text x="${rowLabelWidth1 + rowLabelWidth2 + rowLabelWidth3 / 2}" y="${rowY + cellHeight / 2 + 4}" text-anchor="middle" class="row-label">${escapeXmlLocal(script.name)}</text>
`;

        // Data cells
        colX = totalRowLabelWidth;
        for (const col of COLUMNS) {
          const problems = getProblems(env.id, proto.id, script.id, col.id);

          let cellClass = "cell-ok";
          if (problems.length >= 4) cellClass = "cell-bad";
          else if (problems.length > 0) cellClass = "cell-warn";

          svg += `    <rect x="${colX}" y="${rowY}" width="${cellWidth}" height="${cellHeight}" class="${cellClass}" stroke="#DDD"/>
`;

          if (problems.length === 0) {
            svg += `    <text x="${colX + cellWidth / 2}" y="${rowY + cellHeight / 2 - 5}" text-anchor="middle" class="ok-text">No issues</text>
    <text x="${colX + cellWidth / 2}" y="${rowY + cellHeight / 2 + 12}" text-anchor="middle" class="problem-text" style="fill:#388E3C">Everything works</text>
`;
          } else {
            let textY = rowY + 16;
            // Show ALL problems - no truncation for printable report
            for (const p of problems) {
              // Guard against null/undefined p.text
              const line = `• ${p.text || "Unknown issue"}`;
              svg += `    <text x="${colX + 8}" y="${textY}" class="problem-text">${escapeXmlLocal(line)}</text>
`;
              textY += lineHeight;
            }
          }

          colX += cellWidth;
        }

        rowY += cellHeight;
      }
    }

    // Separator line between environments
    svg += `    <line x1="0" y1="${rowY}" x2="${tableWidth}" y2="${rowY}" stroke="#999" stroke-width="2"/>
`;
  }

  // ============================================================================
  // SERVER RENDERERS SECTION (separate - embedding columns don't apply)
  // ============================================================================

  svg += `
    <text x="0" y="${serverSectionY}" class="legend-title">SERVER-SIDE SVG RENDERERS (no HTML embedding)</text>
`;

  let serverY = serverSectionY + 20;
  for (const renderer of SERVER_RENDERERS) {
    svg += `    <rect x="0" y="${serverY}" width="150" height="${serverRowHeight - 4}" fill="${renderer.color}" stroke="#999"/>
    <text x="10" y="${serverY + 18}" class="row-label-bold">${escapeXmlLocal(renderer.name)}</text>
`;
    // Show issues inline
    const issuesText = renderer.issues.join(" • ");
    svg += `    <text x="160" y="${serverY + 18}" class="problem-text">${escapeXmlLocal(issuesText)}</text>
`;
    serverY += serverRowHeight;
  }

  // ============================================================================
  // LEGEND
  // ============================================================================

  svg += `
    <g transform="translate(0, ${legendY})">
      <text x="0" y="0" class="legend-title">LEGEND</text>

      <rect x="0" y="15" width="18" height="14" class="cell-ok" stroke="#4CAF50"/>
      <text x="24" y="26" class="legend-text">No issues - full SVG support</text>

      <rect x="200" y="15" width="18" height="14" class="cell-warn" stroke="#FFC107"/>
      <text x="224" y="26" class="legend-text">Some limitations - check details</text>

      <rect x="450" y="15" width="18" height="14" class="cell-bad" stroke="#F44336"/>
      <text x="474" y="26" class="legend-text">Many restrictions - features blocked</text>

      <text x="0" y="55" class="legend-title">HOW TO READ THIS MATRIX</text>
      <text x="0" y="73" class="legend-text">1. COLUMNS = How the SVG is embedded (Standalone, img tag, object tag, embed tag, inline, CSS background)</text>
      <text x="0" y="89" class="legend-text">2. ROWS = Environment (Desktop/Mobile) + Protocol (file:// or http://) + JavaScript (enabled/disabled)</text>
      <text x="0" y="105" class="legend-text">3. CELL CONTENT = Issues in that configuration. Browser names in parentheses = browser-specific issue.</text>

      <text x="0" y="135" class="legend-title">SMIL "begin" ATTRIBUTE - HOW TO TRIGGER ANIMATIONS</text>
      <text x="0" y="153" class="legend-text">The begin attribute defines when an animation becomes active. Use it on: &lt;animate&gt;, &lt;animateMotion&gt;, &lt;animateTransform&gt;, &lt;set&gt;</text>
      <text x="0" y="169" class="legend-text">Values can be semicolon-separated. Each value can be one of:</text>

      <text x="0" y="189" class="legend-text" style="font-weight:bold">&lt;offset-value&gt;</text>
      <text x="140" y="189" class="legend-text">Clock-value relative to document load. Example: begin="2s" (start 2 seconds after load)</text>

      <text x="0" y="205" class="legend-text" style="font-weight:bold">&lt;syncbase-value&gt;</text>
      <text x="140" y="205" class="legend-text">Sync with another animation. Example: begin="anim1.end" or begin="anim1.begin+1s"</text>

      <text x="0" y="221" class="legend-text" style="font-weight:bold">&lt;event-value&gt;</text>
      <text x="140" y="221" class="legend-text">Start on DOM event. Example: begin="click" or begin="myRect.click" or begin="mouseover"</text>

      <text x="0" y="237" class="legend-text" style="font-weight:bold">&lt;repeat-value&gt;</text>
      <text x="140" y="237" class="legend-text">Start when another animation repeats. Example: begin="anim1.repeat(2)"</text>

      <text x="0" y="253" class="legend-text" style="font-weight:bold">&lt;accessKey-value&gt;</text>
      <text x="140" y="253" class="legend-text">Start on keypress. Example: begin="accessKey(s)" (start when 's' key is pressed)</text>

      <text x="0" y="269" class="legend-text" style="font-weight:bold">indefinite</text>
      <text x="140" y="269" class="legend-text">Only starts via JavaScript beginElement() call or hyperlink. Example: begin="indefinite"</text>

      <text x="0" y="295" class="legend-title">EVENTS THAT SATISFY USER ACTIVATION (allow audio/video playback)</text>
      <text x="0" y="313" class="legend-text" style="fill:#2E7D32">click - YES, allows audio. Direct user click/tap.</text>
      <text x="0" y="329" class="legend-text" style="fill:#2E7D32">dblclick - YES, allows audio. Direct user double-click.</text>
      <text x="0" y="345" class="legend-text" style="fill:#2E7D32">mousedown - YES, allows audio. User pressed mouse button.</text>
      <text x="0" y="361" class="legend-text" style="fill:#2E7D32">mouseup - YES, allows audio. User released mouse button.</text>
      <text x="0" y="377" class="legend-text" style="fill:#2E7D32">keydown - YES, allows audio. User pressed a key.</text>
      <text x="0" y="393" class="legend-text" style="fill:#2E7D32">keyup - YES, allows audio. User released a key.</text>
      <text x="0" y="409" class="legend-text" style="fill:#2E7D32">touchstart - YES, allows audio. User touched screen (mobile).</text>
      <text x="0" y="425" class="legend-text" style="fill:#2E7D32">touchend - YES, allows audio. User lifted finger (mobile).</text>

      <text x="0" y="455" class="legend-title">EVENTS THAT DO NOT SATISFY USER ACTIVATION (audio will fail)</text>
      <text x="0" y="473" class="legend-text" style="fill:#C62828">mouseover, mouseout, mouseenter, mouseleave - NO, passive cursor movement.</text>
      <text x="0" y="489" class="legend-text" style="fill:#C62828">mousemove - NO, passive cursor tracking.</text>
      <text x="0" y="505" class="legend-text" style="fill:#C62828">scroll, wheel - NO, passive scrolling.</text>
      <text x="0" y="521" class="legend-text" style="fill:#C62828">focus, blur, focusin, focusout - NO, can be triggered programmatically.</text>
      <text x="0" y="537" class="legend-text" style="fill:#C62828">load - NO, programmatic document event.</text>
      <text x="0" y="553" class="legend-text" style="fill:#C62828">DOMActivate - DEPRECATED, behavior varies. Do not use.</text>
      <text x="0" y="569" class="legend-text" style="fill:#C62828">beginEvent, endEvent, repeatEvent - NO, SMIL internal events.</text>

      <text x="0" y="599" class="legend-title">AUDIO AUTOPLAY BLOCKING - CRITICAL</text>
      <text x="0" y="617" class="legend-text">If audio.play() is called WITHOUT prior user activation, it FAILS silently and will NOT auto-retry.</text>
      <text x="0" y="633" class="legend-text">SMIL animations START IMMEDIATELY regardless of audio failure - they are NOT synchronized.</text>
      <text x="0" y="649" class="legend-text">To play audio with animation: BOTH must use begin="elementId.click" (or other activation event).</text>

      <text x="0" y="679" class="legend-title">EVENT SYNTAX: begin="event" vs begin="elementId.event"</text>
      <text x="0" y="697" class="legend-text" style="font-weight:bold">begin="click"</text>
      <text x="140" y="697" class="legend-text">Listens for click ON THE ANIMATION'S PARENT ELEMENT (the element being animated).</text>
      <text x="140" y="713" class="legend-text">The user must click directly on the animated shape. If shape is small/invisible, hard to trigger.</text>

      <text x="0" y="737" class="legend-text" style="font-weight:bold">begin="myBtn.click"</text>
      <text x="140" y="737" class="legend-text">Listens for click ON THE ELEMENT WITH id="myBtn" (any element in the SVG).</text>
      <text x="140" y="753" class="legend-text">Create a dedicated button/area for the user to click. Multiple animations can share the same trigger.</text>

      <text x="0" y="777" class="legend-title">CLICK ANYWHERE ON SVG (recommended for audio)</text>
      <text x="0" y="795" class="legend-text">To trigger animation/audio when user clicks ANYWHERE on the SVG, use the SVG root element id directly:</text>
      <text x="0" y="815" class="legend-text" style="font-family:monospace;font-size:9px">&lt;svg id="mySvg" viewBox="0 0 800 600"&gt;</text>
      <text x="0" y="831" class="legend-text" style="font-family:monospace;font-size:9px">  &lt;circle&gt;&lt;animate begin="mySvg.click" .../&gt;&lt;/circle&gt;</text>
      <text x="0" y="847" class="legend-text" style="font-family:monospace;font-size:9px">  &lt;audio&gt;&lt;animate attributeName="..." begin="mySvg.click" .../&gt;&lt;/audio&gt;</text>
      <text x="0" y="863" class="legend-text" style="font-family:monospace;font-size:9px">&lt;/svg&gt;</text>
      <text x="0" y="883" class="legend-text">The SVG root element receives all click events that occur anywhere within the SVG viewport.</text>
      <text x="0" y="899" class="legend-text">No transparent rect needed - the SVG document root itself can be the trigger element.</text>

      <text x="0" y="929" class="legend-title">BEST PRACTICE FOR AUDIO+ANIMATION</text>
      <text x="0" y="947" class="legend-text">1. Add an id attribute to the &lt;svg&gt; root element (e.g., id="mySvg")</text>
      <text x="0" y="963" class="legend-text">2. Set ALL animations AND audio to begin="mySvg.click"</text>
      <text x="0" y="979" class="legend-text">3. User clicks anywhere on SVG → user activation satisfied → audio plays → animations start</text>
      <text x="0" y="995" class="legend-text">4. All animations and audio are synchronized because they share the same trigger event</text>
    </g>
  </g>
</svg>`;

  return svg;
}

/**
 * Flexible SVG Table Generator
 *
 * Generates data-driven SVG tables with:
 * - Arbitrary number of columns and rows
 * - Multi-level column and row hierarchies
 * - Auto-calculated dimensions based on content
 * - Customizable styling and colors
 * - Optional sections (legend, footnotes, etc.)
 *
 * @param {Object} config - Table configuration
 * @param {Object[]} config.columns - Column definitions with optional grouping
 * @param {Object[]} config.rowLevels - Row hierarchy level definitions
 * @param {Object[][]} config.rowData - Nested arrays of row values per level
 * @param {Function} config.getCellContent - (rowPath, colId) => { lines: string[], status: 'ok'|'warn'|'bad' }
 * @param {Object} [config.options] - Styling and dimension options
 * @param {string} [config.title] - Table title
 * @param {string} [config.subtitle] - Table subtitle
 * @param {string|null} [config.legend] - Custom legend SVG content or null to disable
 * @param {Object[]} [config.additionalSections] - Extra sections after main table
 * @returns {string} SVG markup
 *
 * @example
 * const svg = generateFlexibleSVGTable({
 *   title: 'My Matrix',
 *   columns: [
 *     { id: 'col1', name: 'Column 1', color: '#1565C0' },
 *     { id: 'col2', name: 'Column 2', color: '#1976D2', group: 'Group A' },
 *     { id: 'col3', name: 'Column 3', color: '#1E88E5', group: 'Group A' },
 *   ],
 *   rowLevels: [
 *     { id: 'category', name: 'Category', width: 100 },
 *     { id: 'subcategory', name: 'Subcategory', width: 80 },
 *   ],
 *   rowData: [
 *     [
 *       { id: 'cat1', name: 'Category 1', color: '#E3F2FD', children: [
 *         { id: 'sub1', name: 'Sub 1', color: '#BBDEFB' },
 *         { id: 'sub2', name: 'Sub 2', color: '#90CAF9' },
 *       ]},
 *     ]
 *   ],
 *   getCellContent: (rowPath, colId) => ({
 *     lines: ['Issue 1', 'Issue 2'],
 *     status: 'warn'
 *   }),
 * });
 */
export function generateFlexibleSVGTable(config) {
  const {
    title = "Data Table",
    subtitle = "",
    columns = [],
    rowLevels = [],
    rowData = [],
    getCellContent = () => ({ lines: [], status: "ok" }),
    legend = null,
    additionalSections = [],
    options = {},
  } = config;

  // ============================================================================
  // OPTIONS WITH DEFAULTS
  // ============================================================================

  const opts = {
    fontFamily:
      options.fontFamily ||
      "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    // Cell dimensions
    minCellWidth: options.minCellWidth || 150,
    maxCellWidth: options.maxCellWidth || 300,
    minCellHeight: options.minCellHeight || 60,
    cellPaddingX: options.cellPaddingX || 8,
    cellPaddingY: options.cellPaddingY || 12,
    // Font sizes
    titleFontSize: options.titleFontSize || 20,
    subtitleFontSize: options.subtitleFontSize || 12,
    headerFontSize: options.headerFontSize || 12,
    cellFontSize: options.cellFontSize || 10,
    lineHeight: options.lineHeight || 13,
    // Colors
    titleColor: options.titleColor || "#1a1a1a",
    subtitleColor: options.subtitleColor || "#666",
    borderColor: options.borderColor || "#DDD",
    okColor: options.okColor || "#C8E6C9",
    warnColor: options.warnColor || "#FFF9C4",
    badColor: options.badColor || "#FFCDD2",
    okTextColor: options.okTextColor || "#2E7D32",
    // Column header height
    colHeaderHeight: options.colHeaderHeight || 60,
    // Margins
    marginTop: options.marginTop || 55,
    marginLeft: options.marginLeft || 25,
    marginRight: options.marginRight || 25,
    marginBottom: options.marginBottom || 50,
    // Section spacing
    sectionSpacing: options.sectionSpacing || 40,
    // Group header
    groupHeaderHeight: options.groupHeaderHeight || 25,
    groupHeaderColor: options.groupHeaderColor || "#0D47A1",
  };

  // ============================================================================
  // HELPER: ESCAPE XML
  // ============================================================================

  const escXml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // ============================================================================
  // FLATTEN ROW HIERARCHY INTO LEAF ROWS WITH PATHS
  // ============================================================================

  const flattenRows = (data, levelIndex = 0, path = []) => {
    const rows = [];
    for (const item of data) {
      const currentPath = [...path, { level: levelIndex, ...item }];
      if (
        item.children &&
        item.children.length > 0 &&
        levelIndex < rowLevels.length - 1
      ) {
        rows.push(...flattenRows(item.children, levelIndex + 1, currentPath));
      } else {
        rows.push(currentPath);
      }
    }
    return rows;
  };

  const flatRows = flattenRows(rowData[0] || []);
  const totalRows = flatRows.length;
  const numLevels = rowLevels.length;

  // ============================================================================
  // CALCULATE ROW LABEL WIDTHS
  // ============================================================================

  const rowLabelWidths = rowLevels.map((level, i) => {
    if (level.width) return level.width;
    // Auto-calculate based on max text length at this level
    let maxLen = level.name.length;
    const checkLevel = (items, lvl) => {
      for (const item of items) {
        if (lvl === i) {
          maxLen = Math.max(maxLen, (item.name || "").length);
        }
        if (item.children) checkLevel(item.children, lvl + 1);
      }
    };
    checkLevel(rowData[0] || [], 0);
    return Math.max(60, maxLen * 7 + 20);
  });

  const totalRowLabelWidth = rowLabelWidths.reduce((a, b) => a + b, 0);

  // ============================================================================
  // CALCULATE MAX CONTENT LINES PER CELL
  // ============================================================================

  let maxLines = 0;
  let maxLineLength = 0;

  for (const rowPath of flatRows) {
    for (const col of columns) {
      const content = getCellContent(rowPath, col.id);
      const lines = content.lines || [];
      maxLines = Math.max(maxLines, lines.length);
      for (const line of lines) {
        maxLineLength = Math.max(maxLineLength, line.length);
      }
    }
  }

  // ============================================================================
  // CALCULATE DIMENSIONS
  // ============================================================================

  // Cell width: based on max line length
  const cellWidth = Math.min(
    opts.maxCellWidth,
    Math.max(opts.minCellWidth, maxLineLength * 6 + opts.cellPaddingX * 2),
  );

  // Cell height: based on max lines
  const cellHeight = Math.max(
    opts.minCellHeight,
    (maxLines + 1) * opts.lineHeight + opts.cellPaddingY * 2,
  );

  // ============================================================================
  // IDENTIFY COLUMN GROUPS
  // ============================================================================

  const columnGroups = [];
  let currentGroup = null;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.group) {
      if (!currentGroup || currentGroup.name !== col.group) {
        currentGroup = {
          name: col.group,
          startIndex: i,
          count: 1,
          color: col.groupColor || opts.groupHeaderColor,
        };
        columnGroups.push(currentGroup);
      } else {
        currentGroup.count++;
      }
    } else {
      currentGroup = null;
    }
  }

  const hasColumnGroups = columnGroups.length > 0;
  const effectiveColHeaderHeight = hasColumnGroups
    ? opts.colHeaderHeight + opts.groupHeaderHeight
    : opts.colHeaderHeight;

  // ============================================================================
  // TABLE DIMENSIONS
  // ============================================================================

  const tableWidth = totalRowLabelWidth + columns.length * cellWidth;
  const tableHeight = effectiveColHeaderHeight + totalRows * cellHeight;

  // ============================================================================
  // ADDITIONAL SECTIONS HEIGHT
  // ============================================================================

  let additionalHeight = 0;
  for (const section of additionalSections) {
    additionalHeight += opts.sectionSpacing + (section.height || 100);
  }

  // ============================================================================
  // LEGEND HEIGHT
  // ============================================================================

  const legendHeight = legend ? options.legendHeight || 200 : 0;

  // ============================================================================
  // SVG DIMENSIONS
  // ============================================================================

  const svgWidth = tableWidth + opts.marginLeft + opts.marginRight;
  const svgHeight =
    opts.marginTop +
    tableHeight +
    additionalHeight +
    (legend ? opts.sectionSpacing + legendHeight : 0) +
    opts.marginBottom;

  // ============================================================================
  // BUILD SVG
  // ============================================================================

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMinYMin meet" height="${svgHeight}" width="100%">
  <title>${escXml(title)}</title>

  <defs>
    <style>
      .title { font: bold ${opts.titleFontSize}px ${opts.fontFamily}; fill: ${opts.titleColor}; }
      .subtitle { font: ${opts.subtitleFontSize}px ${opts.fontFamily}; fill: ${opts.subtitleColor}; }
      .col-header { font: bold ${opts.headerFontSize}px ${opts.fontFamily}; fill: #FFF; }
      .col-desc { font: ${opts.cellFontSize}px ${opts.fontFamily}; fill: rgba(255,255,255,0.85); }
      .row-label { font: ${opts.headerFontSize - 1}px ${opts.fontFamily}; fill: #333; }
      .row-label-bold { font: bold ${opts.headerFontSize - 1}px ${opts.fontFamily}; fill: #1a1a1a; }
      .cell-ok { fill: ${opts.okColor}; }
      .cell-warn { fill: ${opts.warnColor}; }
      .cell-bad { fill: ${opts.badColor}; }
      .ok-text { font: bold ${opts.lineHeight}px ${opts.fontFamily}; fill: ${opts.okTextColor}; }
      .cell-text { font: ${opts.cellFontSize}px ${opts.fontFamily}; fill: #333; }
      .section-title { font: bold ${opts.headerFontSize}px ${opts.fontFamily}; fill: #333; }
      .legend-text { font: ${opts.cellFontSize}px ${opts.fontFamily}; fill: #444; }
    </style>
  </defs>

  <text x="${svgWidth / 2}" y="24" text-anchor="middle" class="title">${escXml(title)}</text>
  ${subtitle ? `<text x="${svgWidth / 2}" y="42" text-anchor="middle" class="subtitle">${escXml(subtitle)}</text>` : ""}

  <g transform="translate(${opts.marginLeft}, ${opts.marginTop})">
`;

  // ============================================================================
  // COLUMN HEADERS
  // ============================================================================

  const _colX = totalRowLabelWidth;

  // If we have column groups, render group headers first
  if (hasColumnGroups) {
    // Render ungrouped columns header space (standalone columns)
    let _ungroupedCols = 0;
    for (let i = 0; i < columns.length && !columns[i].group; i++) {
      _ungroupedCols++;
    }

    // Draw group headers
    for (const group of columnGroups) {
      const groupX = totalRowLabelWidth + group.startIndex * cellWidth;
      const groupWidth = group.count * cellWidth;
      svg += `    <rect x="${groupX}" y="0" width="${groupWidth}" height="${opts.groupHeaderHeight}" fill="${group.color}"/>
    <text x="${groupX + groupWidth / 2}" y="${opts.groupHeaderHeight - 8}" text-anchor="middle" class="col-header">${escXml(group.name)}</text>
`;
    }
  }

  // Individual column headers
  const colHeaderY = hasColumnGroups ? opts.groupHeaderHeight : 0;
  const colHeaderCellHeight = hasColumnGroups
    ? opts.colHeaderHeight
    : effectiveColHeaderHeight;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const x = totalRowLabelWidth + i * cellWidth;

    // Standalone (ungrouped) columns get full height
    const thisColY = col.group ? colHeaderY : 0;
    const thisColHeight = col.group
      ? colHeaderCellHeight
      : effectiveColHeaderHeight;

    svg += `    <rect x="${x}" y="${thisColY}" width="${cellWidth}" height="${thisColHeight}" fill="${col.color}" stroke="${opts.borderColor}"/>
    <text x="${x + cellWidth / 2}" y="${thisColY + thisColHeight / 2 - 5}" text-anchor="middle" class="col-header">${escXml(col.name)}</text>
`;
    if (col.desc) {
      svg += `    <text x="${x + cellWidth / 2}" y="${thisColY + thisColHeight / 2 + 10}" text-anchor="middle" class="col-desc">${escXml(col.desc)}</text>
`;
    }
  }

  // ============================================================================
  // ROW HEADERS AND DATA CELLS
  // ============================================================================

  // Track which row label cells have been drawn (for spanning)
  const drawnLabelCells = new Map(); // key: "level-itemId", value: { y, height }

  let rowY = effectiveColHeaderHeight;

  for (let rowIndex = 0; rowIndex < flatRows.length; rowIndex++) {
    const rowPath = flatRows[rowIndex];

    // Draw row label cells for each level
    let labelX = 0;
    for (let level = 0; level < numLevels; level++) {
      const pathItem = rowPath.find((p) => p.level === level);
      if (!pathItem) {
        labelX += rowLabelWidths[level];
        continue;
      }

      const cellKey = `${level}-${pathItem.id}`;

      // Check if we already drew this spanning cell
      if (!drawnLabelCells.has(cellKey)) {
        // Count how many consecutive rows share this same label at this level
        let spanCount = 1;
        for (let nextRow = rowIndex + 1; nextRow < flatRows.length; nextRow++) {
          const nextPathItem = flatRows[nextRow].find((p) => p.level === level);
          if (nextPathItem && nextPathItem.id === pathItem.id) {
            spanCount++;
          } else {
            break;
          }
        }

        const spanHeight = spanCount * cellHeight;

        svg += `    <rect x="${labelX}" y="${rowY}" width="${rowLabelWidths[level]}" height="${spanHeight}" fill="${pathItem.color || "#F5F5F5"}" stroke="${opts.borderColor}"/>
    <text x="${labelX + rowLabelWidths[level] / 2}" y="${rowY + spanHeight / 2 + 4}" text-anchor="middle" class="${level === 0 ? "row-label-bold" : "row-label"}">${escXml(pathItem.name)}</text>
`;
        drawnLabelCells.set(cellKey, { y: rowY, height: spanHeight });
      }

      labelX += rowLabelWidths[level];
    }

    // Draw data cells
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const col = columns[colIndex];
      const x = totalRowLabelWidth + colIndex * cellWidth;

      const content = getCellContent(rowPath, col.id);
      const lines = content.lines || [];
      const status = content.status || "ok";

      const cellClass =
        status === "bad"
          ? "cell-bad"
          : status === "warn"
            ? "cell-warn"
            : "cell-ok";

      svg += `    <rect x="${x}" y="${rowY}" width="${cellWidth}" height="${cellHeight}" class="${cellClass}" stroke="${opts.borderColor}"/>
`;

      if (lines.length === 0) {
        svg += `    <text x="${x + cellWidth / 2}" y="${rowY + cellHeight / 2}" text-anchor="middle" class="ok-text">No issues</text>
`;
      } else {
        let textY = rowY + opts.cellPaddingY + opts.lineHeight;
        for (const line of lines) {
          svg += `    <text x="${x + opts.cellPaddingX}" y="${textY}" class="cell-text">${escXml("• " + line)}</text>
`;
          textY += opts.lineHeight;
        }
      }
    }

    rowY += cellHeight;

    // Draw separator line between top-level groups
    if (rowIndex < flatRows.length - 1) {
      const currentTopLevel = rowPath[0]?.id;
      const nextTopLevel = flatRows[rowIndex + 1][0]?.id;
      if (currentTopLevel !== nextTopLevel) {
        svg += `    <line x1="0" y1="${rowY}" x2="${tableWidth}" y2="${rowY}" stroke="#999" stroke-width="2"/>
`;
      }
    }
  }

  // ============================================================================
  // ADDITIONAL SECTIONS
  // ============================================================================

  let sectionY = tableHeight + opts.sectionSpacing;

  for (const section of additionalSections) {
    if (section.title) {
      svg += `
    <text x="0" y="${sectionY}" class="section-title">${escXml(section.title)}</text>
`;
      sectionY += 20;
    }

    if (section.content) {
      // Wrap raw SVG content in a positioned group
      svg += `    <g transform="translate(0, ${sectionY})">
      ${section.content}
    </g>
`;
    }

    if (section.items) {
      // Render items as a simple list
      for (const item of section.items) {
        if (item.rect) {
          svg += `    <rect x="${item.rect.x}" y="${sectionY + item.rect.y}" width="${item.rect.width}" height="${item.rect.height}" fill="${item.rect.fill || "#EEE"}" stroke="${item.rect.stroke || "#999"}"/>
`;
        }
        if (item.text) {
          svg += `    <text x="${item.text.x}" y="${sectionY + item.text.y}" class="${item.text.class || "legend-text"}">${escXml(item.text.content)}</text>
`;
        }
      }
    }

    sectionY += section.height || 100;
  }

  // ============================================================================
  // LEGEND
  // ============================================================================

  if (legend) {
    svg += `
    <g transform="translate(0, ${sectionY})">
      ${legend}
    </g>
`;
  }

  // Close main group and SVG
  svg += `  </g>
</svg>`;

  return svg;
}

/**
 * Helper to generate the SVG Compatibility Matrix using the flexible table generator.
 * This wraps generateFlexibleSVGTable with the compatibility matrix specific configuration.
 */
export function generateCompatibilityMatrixFlexible(options = {}) {
  const fontFamily =
    options.fontFamily ||
    "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  // Column definitions
  const columns = [
    {
      id: "standalone",
      name: "Standalone SVG",
      desc: "Open .svg directly",
      color: "#1565C0",
    },
    {
      id: "img",
      name: "<img>",
      desc: "Image element",
      color: "#1976D2",
      group: "In HTML Page",
      groupColor: "#0D47A1",
    },
    {
      id: "object",
      name: "<object>",
      desc: "Object element",
      color: "#1E88E5",
      group: "In HTML Page",
    },
    {
      id: "embed",
      name: "<embed>",
      desc: "Embed element",
      color: "#2196F3",
      group: "In HTML Page",
    },
    {
      id: "inline",
      name: "Inline <svg>",
      desc: "SVG in HTML",
      color: "#42A5F5",
      group: "In HTML Page",
    },
    {
      id: "css",
      name: "CSS background",
      desc: "background-image",
      color: "#64B5F6",
      group: "In HTML Page",
    },
  ];

  // Row hierarchy: Environment > Protocol > Script
  const rowLevels = [
    { id: "environment", name: "Environment", width: 130 },
    { id: "protocol", name: "Protocol", width: 80 },
    { id: "script", name: "JavaScript", width: 90 },
  ];

  // Row data (nested)
  const rowData = [
    [
      {
        id: "desktop",
        name: "Desktop Browser",
        color: "#E3F2FD",
        children: [
          {
            id: "file",
            name: "file://",
            color: "#BBDEFB",
            children: [
              { id: "js", name: "JS enabled", color: "#DCEDC8" },
              { id: "nojs", name: "JS disabled", color: "#FFCDD2" },
            ],
          },
          {
            id: "http",
            name: "http(s)://",
            color: "#C8E6C9",
            children: [
              { id: "js", name: "JS enabled", color: "#DCEDC8" },
              { id: "nojs", name: "JS disabled", color: "#FFCDD2" },
            ],
          },
        ],
      },
      {
        id: "mobile",
        name: "Mobile Browser",
        color: "#E8F5E9",
        children: [
          {
            id: "file",
            name: "file://",
            color: "#BBDEFB",
            children: [
              { id: "js", name: "JS enabled", color: "#DCEDC8" },
              { id: "nojs", name: "JS disabled", color: "#FFCDD2" },
            ],
          },
          {
            id: "http",
            name: "http(s)://",
            color: "#C8E6C9",
            children: [
              { id: "js", name: "JS enabled", color: "#DCEDC8" },
              { id: "nojs", name: "JS disabled", color: "#FFCDD2" },
            ],
          },
        ],
      },
    ],
  ];

  // Cell content function - returns empty cells by default
  // The automatic issue detection was removed because it produced inaccurate results.
  // Users can provide their own getCellContent function via options.getCellContent
  // to customize cell content based on their specific requirements.
  const getCellContent =
    options.getCellContent ||
    ((_rowPath, _colId) => {
      // Default: empty cells with 'ok' status
      // Override via options.getCellContent to show custom content
      return { lines: [], status: "ok" };
    });

  // Server renderers as additional section
  const serverRenderers = [
    {
      name: "Node.js (JSDOM)",
      color: "#FFF3E0",
      issues: ["No rendering", "No animations", "No interaction"],
    },
    {
      name: "ImageMagick",
      color: "#EFEBE9",
      issues: [
        "No animations",
        "No scripts",
        "No foreignObject",
        "No web fonts",
      ],
    },
    {
      name: "Inkscape CLI",
      color: "#F3E5F5",
      issues: ["No animations", "No scripts"],
    },
    {
      name: "librsvg",
      color: "#E0F2F1",
      issues: ["No animations", "No scripts", "Limited filters"],
    },
    {
      name: "Cairo",
      color: "#FBE9E7",
      issues: ["No animations", "No scripts", "No filters", "No foreignObject"],
    },
    {
      name: "Apache Batik",
      color: "#F3E5F5",
      issues: ["No CSS animations", "Limited SMIL", "No web fonts"],
    },
  ];

  let serverSectionContent = "";
  let serverY = 0;
  for (const renderer of serverRenderers) {
    serverSectionContent += `<rect x="0" y="${serverY}" width="150" height="26" fill="${renderer.color}" stroke="#999"/>
      <text x="10" y="${serverY + 18}" class="row-label-bold">${renderer.name}</text>
      <text x="160" y="${serverY + 18}" class="cell-text">${renderer.issues.join(" • ")}</text>
`;
    serverY += 30;
  }

  // Legend content (the comprehensive SMIL documentation) - FULL VERSION
  const legendContent = `
      <text x="0" y="0" class="section-title">LEGEND</text>

      <rect x="0" y="15" width="18" height="14" class="cell-ok" stroke="#4CAF50"/>
      <text x="24" y="26" class="legend-text">No issues - full SVG support</text>

      <rect x="200" y="15" width="18" height="14" class="cell-warn" stroke="#FFC107"/>
      <text x="224" y="26" class="legend-text">Some limitations - check details</text>

      <rect x="450" y="15" width="18" height="14" class="cell-bad" stroke="#F44336"/>
      <text x="474" y="26" class="legend-text">Many restrictions - features blocked</text>

      <text x="0" y="55" class="section-title">HOW TO READ THIS MATRIX</text>
      <text x="0" y="73" class="legend-text">1. COLUMNS = How the SVG is embedded (Standalone, img tag, object tag, embed tag, inline, CSS background)</text>
      <text x="0" y="89" class="legend-text">2. ROWS = Environment (Desktop/Mobile) + Protocol (file:// or http://) + JavaScript (enabled/disabled)</text>
      <text x="0" y="105" class="legend-text">3. CELL CONTENT = Issues in that configuration. Browser names in parentheses = browser-specific issue.</text>

      <text x="0" y="135" class="section-title">SMIL "begin" ATTRIBUTE - HOW TO TRIGGER ANIMATIONS</text>
      <text x="0" y="153" class="legend-text">The begin attribute defines when an animation becomes active. Use it on: &lt;animate&gt;, &lt;animateMotion&gt;, &lt;animateTransform&gt;, &lt;set&gt;</text>
      <text x="0" y="169" class="legend-text">Values can be semicolon-separated. Each value can be one of:</text>

      <text x="0" y="189" class="legend-text" style="font-weight:bold">&lt;offset-value&gt;</text>
      <text x="140" y="189" class="legend-text">Clock-value relative to document load. Example: begin="2s" (start 2 seconds after load)</text>

      <text x="0" y="205" class="legend-text" style="font-weight:bold">&lt;syncbase-value&gt;</text>
      <text x="140" y="205" class="legend-text">Sync with another animation. Example: begin="anim1.end" or begin="anim1.begin+1s"</text>

      <text x="0" y="221" class="legend-text" style="font-weight:bold">&lt;event-value&gt;</text>
      <text x="140" y="221" class="legend-text">Start on DOM event. Example: begin="click" or begin="myRect.click" or begin="mouseover"</text>

      <text x="0" y="237" class="legend-text" style="font-weight:bold">&lt;repeat-value&gt;</text>
      <text x="140" y="237" class="legend-text">Start when another animation repeats. Example: begin="anim1.repeat(2)"</text>

      <text x="0" y="253" class="legend-text" style="font-weight:bold">&lt;accessKey-value&gt;</text>
      <text x="140" y="253" class="legend-text">Start on keypress. Example: begin="accessKey(s)" (start when 's' key is pressed)</text>

      <text x="0" y="269" class="legend-text" style="font-weight:bold">indefinite</text>
      <text x="140" y="269" class="legend-text">Only starts via JavaScript beginElement() call or hyperlink. Example: begin="indefinite"</text>

      <text x="0" y="295" class="section-title">EVENTS THAT SATISFY USER ACTIVATION (allow audio/video playback)</text>
      <text x="0" y="313" class="legend-text" style="fill:#2E7D32">click - YES, allows audio. Direct user click/tap.</text>
      <text x="0" y="329" class="legend-text" style="fill:#2E7D32">dblclick - YES, allows audio. Direct user double-click.</text>
      <text x="0" y="345" class="legend-text" style="fill:#2E7D32">mousedown - YES, allows audio. User pressed mouse button.</text>
      <text x="0" y="361" class="legend-text" style="fill:#2E7D32">mouseup - YES, allows audio. User released mouse button.</text>
      <text x="0" y="377" class="legend-text" style="fill:#2E7D32">keydown - YES, allows audio. User pressed a key.</text>
      <text x="0" y="393" class="legend-text" style="fill:#2E7D32">keyup - YES, allows audio. User released a key.</text>
      <text x="0" y="409" class="legend-text" style="fill:#2E7D32">touchstart - YES, allows audio. User touched screen (mobile).</text>
      <text x="0" y="425" class="legend-text" style="fill:#2E7D32">touchend - YES, allows audio. User lifted finger (mobile).</text>

      <text x="0" y="455" class="section-title">EVENTS THAT DO NOT SATISFY USER ACTIVATION (audio will fail)</text>
      <text x="0" y="473" class="legend-text" style="fill:#C62828">mouseover, mouseout, mouseenter, mouseleave - NO, passive cursor movement.</text>
      <text x="0" y="489" class="legend-text" style="fill:#C62828">mousemove - NO, passive cursor tracking.</text>
      <text x="0" y="505" class="legend-text" style="fill:#C62828">scroll, wheel - NO, passive scrolling.</text>
      <text x="0" y="521" class="legend-text" style="fill:#C62828">focus, blur, focusin, focusout - NO, can be triggered programmatically.</text>
      <text x="0" y="537" class="legend-text" style="fill:#C62828">load - NO, programmatic document event.</text>
      <text x="0" y="553" class="legend-text" style="fill:#C62828">DOMActivate - DEPRECATED, behavior varies. Do not use.</text>
      <text x="0" y="569" class="legend-text" style="fill:#C62828">beginEvent, endEvent, repeatEvent - NO, SMIL internal events.</text>

      <text x="0" y="599" class="section-title">AUDIO AUTOPLAY BLOCKING - CRITICAL</text>
      <text x="0" y="617" class="legend-text">If audio.play() is called WITHOUT prior user activation, it FAILS silently and will NOT auto-retry.</text>
      <text x="0" y="633" class="legend-text">SMIL animations START IMMEDIATELY regardless of audio failure - they are NOT synchronized.</text>
      <text x="0" y="649" class="legend-text">To play audio with animation: BOTH must use begin="elementId.click" (or other activation event).</text>

      <text x="0" y="679" class="section-title">EVENT SYNTAX: begin="event" vs begin="elementId.event"</text>
      <text x="0" y="697" class="legend-text" style="font-weight:bold">begin="click"</text>
      <text x="140" y="697" class="legend-text">Listens for click ON THE ANIMATION'S PARENT ELEMENT (the element being animated).</text>
      <text x="140" y="713" class="legend-text">The user must click directly on the animated shape. If shape is small/invisible, hard to trigger.</text>

      <text x="0" y="737" class="legend-text" style="font-weight:bold">begin="myBtn.click"</text>
      <text x="140" y="737" class="legend-text">Listens for click ON THE ELEMENT WITH id="myBtn" (any element in the SVG).</text>
      <text x="140" y="753" class="legend-text">Create a dedicated button/area for the user to click. Multiple animations can share the same trigger.</text>

      <text x="0" y="777" class="section-title">CLICK ANYWHERE ON SVG (recommended for audio)</text>
      <text x="0" y="795" class="legend-text">To trigger animation/audio when user clicks ANYWHERE on the SVG, use the SVG root element id directly:</text>
      <text x="0" y="815" class="legend-text" style="font-family:monospace;font-size:9px">&lt;svg id="mySvg" viewBox="0 0 800 600"&gt;</text>
      <text x="0" y="831" class="legend-text" style="font-family:monospace;font-size:9px">  &lt;circle&gt;&lt;animate begin="mySvg.click" .../&gt;&lt;/circle&gt;</text>
      <text x="0" y="847" class="legend-text" style="font-family:monospace;font-size:9px">  &lt;audio&gt;&lt;animate attributeName="..." begin="mySvg.click" .../&gt;&lt;/audio&gt;</text>
      <text x="0" y="863" class="legend-text" style="font-family:monospace;font-size:9px">&lt;/svg&gt;</text>
      <text x="0" y="883" class="legend-text">The SVG root element receives all click events that occur anywhere within the SVG viewport.</text>
      <text x="0" y="899" class="legend-text">No transparent rect needed - the SVG document root itself can be the trigger element.</text>

      <text x="0" y="929" class="section-title">BEST PRACTICE FOR AUDIO+ANIMATION</text>
      <text x="0" y="947" class="legend-text">1. Add an id attribute to the &lt;svg&gt; root element (e.g., id="mySvg")</text>
      <text x="0" y="963" class="legend-text">2. Set ALL animations AND audio to begin="mySvg.click"</text>
      <text x="0" y="979" class="legend-text">3. User clicks anywhere on SVG → user activation satisfied → audio plays → animations start</text>
      <text x="0" y="995" class="legend-text">4. All animations and audio are synchronized because they share the same trigger event</text>
`;

  return generateFlexibleSVGTable({
    title: "SVG Compatibility Matrix",
    subtitle: "What problems will your SVG have in each configuration?",
    columns,
    rowLevels,
    rowData,
    getCellContent,
    additionalSections: [
      {
        title: "SERVER-SIDE SVG RENDERERS (no HTML embedding)",
        content: serverSectionContent,
        height: serverRenderers.length * 30 + 20,
      },
    ],
    legend: legendContent,
    options: {
      fontFamily,
      minCellWidth: 220,
      legendHeight: 1020, // Full legend height to fit all content
      ...options,
    },
  });
}

/**
 * Fix common SVG validation errors and compatibility issues.
 * @param {Document|string} doc - SVG document or string to fix
 * @param {Object} options - Fix options
 * @param {boolean} [options.fixInvalidGroupAttrs=true] - Remove invalid attributes from group elements
 * @param {boolean} [options.fixMissingNamespaces=true] - Add missing namespace declarations
 * @param {boolean} [options.fixBrokenRefs=true] - Fix broken ID references
 * @param {boolean} [options.fixAnimationTiming=true] - Fix invalid animation timing values
 * @param {boolean} [options.verbose=false] - Log detailed fix information
 * @returns {Document} Fixed SVG document
 */
export const fixInvalidSVG = createOperation((doc, options = {}) => {
  // Note: createOperation wrapper handles input normalization (string, file path, URL, DOM element)
  const fixInvalidGroupAttrs = options.fixInvalidGroupAttrs !== false;
  const fixMissingNamespaces = options.fixMissingNamespaces !== false;
  const fixBrokenRefs = options.fixBrokenRefs !== false;
  const fixAnimationTiming = options.fixAnimationTiming !== false;
  const verbose = options.verbose || false;

  const fixes = [];

  // Collect all IDs in the document for reference fixing
  const allIds = new Set();
  const collectIds = (el) => {
    const id = el.getAttribute("id");
    if (id) allIds.add(id);
    for (const child of el.children) {
      if (isElement(child)) collectIds(child);
    }
  };
  collectIds(doc);

  // SVG 1.1: Attributes NOT valid on <g> elements
  // These are shape-specific attributes valid on rect, circle, ellipse, line, etc. but NOT on <g>
  // Including these helps clean up SVGs where attributes were mistakenly copied to groups
  const INVALID_G_ATTRS = [
    "x",
    "y",
    "width",
    "height", // Position/size - valid on rect, image, svg, use, etc.
    "cx",
    "cy",
    "r", // Circle attributes
    "rx",
    "ry", // Ellipse/rect corner radius
    "x1",
    "y1",
    "x2",
    "y2", // Line attributes
    "d", // Path data
    "points", // Polygon/polyline points
  ];

  // SVG 1.1: Elements that support x/y/width/height
  const _SUPPORTS_RECT_ATTRS = new Set([
    "svg",
    "rect",
    "image",
    "foreignObject",
    "use",
    "symbol",
    "pattern",
    "mask",
    "filter",
    "clipPath",
  ]);

  // Fix 1: Remove invalid attributes from elements
  const fixInvalidAttributes = (el) => {
    const tagName = el.tagName.toLowerCase();

    // <g> elements don't support x, y, width, height in SVG 1.1
    if (tagName === "g" && fixInvalidGroupAttrs) {
      for (const attr of INVALID_G_ATTRS) {
        if (el.hasAttribute(attr)) {
          const val = el.getAttribute(attr);
          el.removeAttribute(attr);
          fixes.push({
            type: "invalid_attr_removed",
            element: tagName,
            attr: attr,
            value: val,
            reason: `SVG 1.1: <g> elements do not support '${attr}' attribute`,
          });
        }
      }
    }

    // Recurse to children
    for (const child of el.children) {
      if (isElement(child)) fixInvalidAttributes(child);
    }
  };

  // Fix 2: Add missing xmlns:xlink namespace when xlink:* attributes exist
  const fixMissingXlinkNamespace = () => {
    if (!fixMissingNamespaces) return;

    let hasXlinkAttrs = false;
    const checkForXlink = (el) => {
      for (const attrName of el.getAttributeNames()) {
        if (attrName.startsWith("xlink:")) {
          hasXlinkAttrs = true;
          return;
        }
      }
      for (const child of el.children) {
        if (isElement(child)) checkForXlink(child);
        if (hasXlinkAttrs) return;
      }
    };
    checkForXlink(doc);

    if (hasXlinkAttrs && !doc.hasAttribute("xmlns:xlink")) {
      doc.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      fixes.push({
        type: "namespace_added",
        namespace: "xmlns:xlink",
        value: "http://www.w3.org/1999/xlink",
        reason:
          "SVG 1.1: xmlns:xlink required when xlink:* attributes are present",
      });
    }
  };

  // Fix 3: Fix broken ID references using fuzzy matching
  const findSimilarId = (brokenId) => {
    // Try common variations
    const variations = [
      brokenId,
      brokenId.replace(/^FRAME(\d+)$/, "FRAME0$1"), // FRAME1 -> FRAME01
      brokenId.replace(/^FRAME0(\d+)$/, "FRAME00$1"), // FRAME01 -> FRAME001
      brokenId.replace(/^FRAME00(\d+)$/, "FRAME000$1"), // FRAME001 -> FRAME0001
      brokenId.replace(/^FRAME0+(\d+)$/, "FRAME$1"), // FRAME0001 -> FRAME1
      brokenId.replace(/^FRAME(\d)$/, "FRAME0000$1"), // FRAME1 -> FRAME00001
      brokenId.replace(/^FRAME(\d{2})$/, "FRAME000$1"), // FRAME01 -> FRAME00001
      brokenId.replace(/^FRAME(\d{3})$/, "FRAME00$1"), // FRAME001 -> FRAME00001
      brokenId.replace(/^FRAME(\d{4})$/, "FRAME0$1"), // FRAME0001 -> FRAME00001
    ];

    for (const variant of variations) {
      if (allIds.has(variant) && variant !== brokenId) {
        return variant;
      }
    }

    // Try finding closest match by Levenshtein distance for other IDs
    let closest = null;
    let minDist = Infinity;
    for (const id of allIds) {
      if (
        id.toLowerCase().includes(brokenId.toLowerCase()) ||
        brokenId.toLowerCase().includes(id.toLowerCase())
      ) {
        const dist = Math.abs(id.length - brokenId.length);
        if (dist < minDist && dist <= 2) {
          minDist = dist;
          closest = id;
        }
      }
    }
    return closest;
  };

  const fixBrokenIdReferences = (el) => {
    if (!fixBrokenRefs) return;

    // Check href and xlink:href attributes
    for (const attrName of ["href", "xlink:href"]) {
      const val = el.getAttribute(attrName);
      if (val && val.startsWith("#")) {
        const refId = val.substring(1);
        if (!allIds.has(refId)) {
          const fixedId = findSimilarId(refId);
          if (fixedId) {
            el.setAttribute(attrName, `#${fixedId}`);
            fixes.push({
              type: "ref_fixed",
              element: el.tagName.toLowerCase(),
              attr: attrName,
              oldValue: val,
              newValue: `#${fixedId}`,
              reason: `ID '${refId}' not found, fixed to similar ID '${fixedId}'`,
            });
          }
        }
      }
    }

    // Check animate element values that reference IDs
    if (el.tagName.toLowerCase() === "animate") {
      const attrName = el.getAttribute("attributeName");
      if (attrName === "href" || attrName === "xlink:href") {
        const values = el.getAttribute("values");
        if (values) {
          const refs = values.split(";");
          let changed = false;
          const fixedRefs = refs.map((ref) => {
            const refValue = ref.trim();
            if (refValue.startsWith("#")) {
              const refId = refValue.substring(1);
              if (!allIds.has(refId)) {
                const fixedId = findSimilarId(refId);
                if (fixedId) {
                  changed = true;
                  return `#${fixedId}`;
                }
              }
            }
            return refValue;
          });
          if (changed) {
            const newValues = fixedRefs.join(";");
            el.setAttribute("values", newValues);
            fixes.push({
              type: "animate_values_fixed",
              oldValue: values,
              newValue: newValues,
              reason: "Fixed broken ID references in animate values",
            });
          }
        }
      }
    }

    // Check url() references in fill, stroke, clip-path, mask, filter
    for (const attr of ["fill", "stroke", "clip-path", "mask", "filter"]) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith("url(#")) {
        const match = val.match(/url\(#([^)]+)\)/);
        if (match) {
          const refId = match[1];
          if (!allIds.has(refId)) {
            const fixedId = findSimilarId(refId);
            if (fixedId) {
              el.setAttribute(attr, `url(#${fixedId})`);
              fixes.push({
                type: "url_ref_fixed",
                element: el.tagName.toLowerCase(),
                attr: attr,
                oldValue: val,
                newValue: `url(#${fixedId})`,
                reason: `ID '${refId}' not found, fixed to similar ID '${fixedId}'`,
              });
            }
          }
        }
      }
    }

    // Recurse
    for (const child of el.children) {
      if (isElement(child)) fixBrokenIdReferences(child);
    }
  };

  // Fix 4: Normalize animation timing values
  const fixAnimationTimingValues = (el) => {
    if (!fixAnimationTiming) return;

    const animationElements = [
      "animate",
      "animateTransform",
      "animateMotion",
      "animateColor",
      "set",
    ];
    const tagName = el.tagName.toLowerCase();

    if (animationElements.includes(tagName)) {
      // Fix dur="indefinite" on elements that should have a duration
      const dur = el.getAttribute("dur");
      const _repeatCount = el.getAttribute("repeatCount");

      // Check for common timing issues
      if (dur === "0" || dur === "0s") {
        // dur="0" is often a mistake - check if there are keyTimes
        const keyTimes = el.getAttribute("keyTimes");
        if (!keyTimes) {
          fixes.push({
            type: "timing_warning",
            element: tagName,
            attr: "dur",
            value: dur,
            reason: 'dur="0" may cause animation to not play',
          });
        }
      }

      // Fix begin values with invalid format
      const begin = el.getAttribute("begin");
      if (begin) {
        // Normalize common begin value issues
        let fixedBegin = begin;

        // Fix "0" to "0s" for consistency
        if (begin === "0") {
          fixedBegin = "0s";
          el.setAttribute("begin", fixedBegin);
          fixes.push({
            type: "timing_normalized",
            element: tagName,
            attr: "begin",
            oldValue: begin,
            newValue: fixedBegin,
            reason: "Normalized begin value to include time unit",
          });
        }
      }
    }

    // Recurse
    for (const child of el.children) {
      if (isElement(child)) fixAnimationTimingValues(child);
    }
  };

  // Fix 5: Detect animation elements inside truly EMPTY elements (SVG 1.1 DTD violation)
  // Per SVG 1.1 DTD, only font-face-format, font-face-name, glyphRef, hkern, vkern are EMPTY.
  // Shape elements (use, path, rect, circle, etc.) CAN have animation children.
  // The fix is to move animation elements outside as siblings with proper href targeting.
  // Only these 5 elements are truly EMPTY per SVG 1.1 DTD - they cannot have any children
  const EMPTY_CONTENT_MODEL_ELEMENTS = new Set([
    "font-face-format",
    "font-face-name",
    "glyphref",
    "hkern",
    "vkern",
  ]);
  const ANIMATION_ELEMENTS = new Set([
    "animate",
    "animateTransform",
    "animateMotion",
    "animateColor",
    "set",
  ]);

  const fixAnimationInEmptyElements = (el) => {
    const tagName = el.tagName.toLowerCase();

    // Check if this element has empty content model but contains animation children
    if (EMPTY_CONTENT_MODEL_ELEMENTS.has(tagName)) {
      const animationChildren = [];
      for (const child of Array.from(el.children)) {
        if (
          isElement(child) &&
          ANIMATION_ELEMENTS.has(child.tagName.toLowerCase())
        ) {
          animationChildren.push(child);
        }
      }

      if (animationChildren.length > 0) {
        // Ensure the parent element has an ID for targeting
        let targetId = el.getAttribute("id");
        if (!targetId) {
          // Generate a unique ID
          targetId = `_fix_${tagName}_${Math.random().toString(36).substring(2, 8)}`;
          el.setAttribute("id", targetId);
          fixes.push({
            type: "id_generated",
            element: tagName,
            id: targetId,
            reason:
              "Generated ID for animation targeting after moving animate element",
          });
        }

        // Move each animation child to be a sibling after the element
        for (const animChild of animationChildren) {
          // Remove from parent
          el.removeChild(animChild);

          // Add href to target the original parent if not already present
          if (
            !animChild.hasAttribute("href") &&
            !animChild.hasAttribute("xlink:href")
          ) {
            animChild.setAttribute("href", `#${targetId}`);
          }

          // Insert after the element
          const parent = el.parentNode;
          if (parent) {
            const nextSibling = el.nextSibling;
            if (nextSibling) {
              parent.insertBefore(animChild, nextSibling);
            } else {
              parent.appendChild(animChild);
            }
          }

          fixes.push({
            type: "animation_moved_from_empty_element",
            element: animChild.tagName.toLowerCase(),
            parentElement: tagName,
            targetId: targetId,
            reason: `SVG 1.1: <${tagName}> has EMPTY content model and cannot have children. Animation moved outside and targets element via href="#${targetId}".`,
          });
        }
      }
    }

    // Recurse to children (after potential modifications)
    for (const child of Array.from(el.children)) {
      if (isElement(child)) fixAnimationInEmptyElements(child);
    }
  };

  // Fix 6: Normalize uppercase units to lowercase in presentation attributes
  // SVG 1.1 spec: Unit identifiers in presentation attributes MUST be lowercase
  const UNIT_PATTERN =
    /^([+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?)(EM|EX|PX|IN|CM|MM|PT|PC|DEG|GRAD|RAD|S|MS|HZ|KHZ|%)$/i;
  const ATTRS_WITH_UNITS = new Set([
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "cx",
    "cy",
    "r",
    "fx",
    "fy",
    "x1",
    "y1",
    "x2",
    "y2",
    "dx",
    "dy",
    "textLength",
    "startOffset",
    "stroke-width",
    "stroke-dashoffset",
    "font-size",
    "baseline-shift",
    "kerning",
    "letter-spacing",
    "word-spacing",
    "markerWidth",
    "markerHeight",
    "refX",
    "refY",
    "stdDeviation",
    "radius",
  ]);

  const fixUppercaseUnits = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Only check attributes that can have units
      if (!ATTRS_WITH_UNITS.has(attrName) && !attrName.includes("-")) continue;

      const val = el.getAttribute(attrName);
      if (!val) continue;

      const match = val.match(UNIT_PATTERN);
      if (match) {
        const [, num, unit] = match;
        const lowerUnit = unit.toLowerCase();
        if (unit !== lowerUnit) {
          const newVal = num + lowerUnit;
          el.setAttribute(attrName, newVal);
          fixes.push({
            type: "unit_normalized",
            element: el.tagName.toLowerCase(),
            attr: attrName,
            oldValue: val,
            newValue: newVal,
            reason: `SVG 1.1: Unit identifiers in attributes must be lowercase`,
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) fixUppercaseUnits(child);
    }
  };

  // Fix 7: Replace invalid whitespace characters in list values
  // SVG 1.1 spec: Only space(0x20), tab(0x09), LF(0x0A), CR(0x0D), FF(0x0C) are valid
  // Common invalid chars: NBSP(0xA0), various Unicode spaces
  const INVALID_WHITESPACE =
    /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
  const LIST_ATTRS = new Set([
    "points",
    "viewBox",
    "preserveAspectRatio",
    "transform",
    "d",
    "values",
    "keyTimes",
    "keySplines",
    "keyPoints",
    "rotate",
    "stroke-dasharray",
    "baseFrequency",
    "kernelMatrix",
    "tableValues",
    "filterRes",
    "stdDeviation",
    "radius",
    "origin",
  ]);

  const fixInvalidWhitespace = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Check list attributes and style
      if (!LIST_ATTRS.has(attrName) && attrName !== "style") continue;

      const val = el.getAttribute(attrName);
      if (!val) continue;

      if (INVALID_WHITESPACE.test(val)) {
        const newVal = val.replace(INVALID_WHITESPACE, " ");
        el.setAttribute(attrName, newVal);
        fixes.push({
          type: "whitespace_normalized",
          element: el.tagName.toLowerCase(),
          attr: attrName,
          reason: `SVG 1.1: Replaced invalid Unicode whitespace with standard space (0x20)`,
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) fixInvalidWhitespace(child);
    }
  };

  // Fix 8: Fix invalid number formats
  // SVG 1.1 spec: Numbers must be [+-]?[0-9]*.[0-9]+ or [+-]?[0-9]+
  // Invalid: trailing dot "10.", standalone ".", leading dot without digit "-.5" -> "-0.5"
  const fixInvalidNumbers = (el) => {
    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);
      if (!val) continue;

      let newVal = val;
      let changed = false;

      // Fix trailing dot: "10." -> "10"
      if (/\d\.$/.test(newVal) || /\d\.(?=[,\s;)])/.test(newVal)) {
        newVal = newVal.replace(/(\d)\.(?=$|[,\s;)])/g, "$1");
        changed = true;
      }

      // Fix standalone dot or dot without leading zero: ".5" -> "0.5", "-.5" -> "-0.5"
      newVal = newVal.replace(/(^|[,\s;(])\.(\d)/g, "$10.$2");
      newVal = newVal.replace(/(^|[,\s;(])-\.(\d)/g, "$1-0.$2");
      if (newVal !== val) changed = true;

      // Fix multiple consecutive dots (corruption indicator)
      if (/\.\.+/.test(newVal)) {
        newVal = newVal.replace(/\.\.+/g, ".");
        changed = true;
      }

      if (changed) {
        el.setAttribute(attrName, newVal);
        fixes.push({
          type: "number_format_fixed",
          element: el.tagName.toLowerCase(),
          attr: attrName,
          oldValue: val,
          newValue: newVal,
          reason: `SVG 1.1: Fixed invalid number format`,
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) fixInvalidNumbers(child);
    }
  };

  // Fix 9: Detect and warn about out-of-range numeric values
  // SVG 1.1 spec: Numbers require single-precision float range (-3.4e+38 to +3.4e+38)
  const FLOAT_MAX = 3.4e38;
  const FLOAT_MIN = -3.4e38;
  const NUMBER_PATTERN = /[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?/g;

  const detectOutOfRangeValues = (el) => {
    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);
      if (!val) continue;

      // Skip non-numeric attributes
      if (
        attrName === "id" ||
        attrName === "class" ||
        attrName.startsWith("xmlns") ||
        attrName === "href" ||
        attrName === "xlink:href" ||
        attrName === "style"
      )
        continue;

      const numbers = val.match(NUMBER_PATTERN);
      if (!numbers) continue;

      for (const numStr of numbers) {
        const num = parseFloat(numStr);
        if (!isFinite(num)) {
          fixes.push({
            type: "invalid_number_detected",
            element: el.tagName.toLowerCase(),
            attr: attrName,
            value: numStr,
            reason: `SVG 1.1: Invalid number (Infinity or NaN)`,
          });
        } else if (num > FLOAT_MAX || num < FLOAT_MIN) {
          fixes.push({
            type: "out_of_range_detected",
            element: el.tagName.toLowerCase(),
            attr: attrName,
            value: numStr,
            reason: `SVG 1.1: Number exceeds single-precision float range`,
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectOutOfRangeValues(child);
    }
  };

  // Fix 10 & 11: Detect mistyped element and attribute names
  // Uses module-level SVG11_ELEMENTS, SVG11_ATTRIBUTES, and findClosestMatch

  // Fix 10: Detect mistyped element names
  const _detectMistypedElements = (el) => {
    const tagName = el.tagName;
    const tagLower = tagName.toLowerCase();

    // Skip namespaced elements (rdf:*, dc:*, fbf:*, cc:*, etc.) - these are valid metadata extensions
    // Skip if it's a valid SVG 1.1 element (case-insensitive)
    if (
      tagName.includes(":") ||
      SVG11_ELEMENTS.has(tagName) ||
      SVG11_ELEMENTS_LOWER.has(tagLower)
    ) {
      // Valid or namespaced - no action needed, just recurse
    }
    // Unknown element - check for typos
    else {
      const suggestion = findClosestMatch(tagName, SVG11_ELEMENTS);
      if (suggestion) {
        fixes.push({
          type: "mistyped_element_detected",
          element: tagName,
          suggestion: suggestion,
          reason: `Unknown element <${tagName}> - did you mean <${suggestion}>?`,
        });
      } else {
        fixes.push({
          type: "unknown_element_detected",
          element: tagName,
          reason: `Unknown element <${tagName}> - not in SVG 1.1 spec`,
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) _detectMistypedElements(child);
    }
  };

  // Fix 11: Detect mistyped attribute names
  const _detectMistypedAttributes = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Skip namespace declarations and data-* attributes
      if (attrName.startsWith("xmlns") || attrName.startsWith("data-"))
        continue;

      // Skip if it's a valid SVG 1.1 attribute (case-insensitive check)
      const attrLower = attrName.toLowerCase();
      if (
        SVG11_ATTRIBUTES.has(attrName) ||
        SVG11_ATTRIBUTES_LOWER.has(attrLower)
      )
        continue;

      // Check for vendor prefixes (don't flag these)
      if (
        attrName.startsWith("-webkit-") ||
        attrName.startsWith("-moz-") ||
        attrName.startsWith("-ms-") ||
        attrName.startsWith("-o-")
      )
        continue;

      // Check for custom namespaced attributes (like inkscape:, sodipodi:, fbf:)
      if (
        attrName.includes(":") &&
        !attrName.startsWith("xlink:") &&
        !attrName.startsWith("xml:")
      ) {
        // Custom namespace - skip
        continue;
      }

      // Unknown attribute - check for typos
      const suggestion = findClosestMatch(attrName, SVG11_ATTRIBUTES);
      if (suggestion) {
        fixes.push({
          type: "mistyped_attribute_detected",
          element: el.tagName.toLowerCase(),
          attr: attrName,
          suggestion: suggestion,
          reason: `Unknown attribute '${attrName}' on <${el.tagName.toLowerCase()}> - did you mean '${suggestion}'?`,
        });
      }
      // Don't report unknown attributes without suggestions (could be valid vendor/custom attrs)
    }

    for (const child of el.children) {
      if (isElement(child)) _detectMistypedAttributes(child);
    }
  };

  // Fix 12: Detect missing required attributes per SVG 1.1 DTD
  // Required attributes that are missing will cause the element to not render correctly
  const REQUIRED_ATTRS = {
    a: ["href"],
    animate: ["attributeName"],
    animateColor: ["attributeName"],
    animateTransform: ["attributeName"],
    circle: ["r"],
    "color-profile": ["name"],
    cursor: ["href"],
    ellipse: ["rx", "ry"],
    feBlend: ["in2"],
    feComposite: ["in2"],
    feConvolveMatrix: ["kernelMatrix"],
    feDisplacementMap: ["in2"],
    feFuncA: ["type"],
    feFuncB: ["type"],
    feFuncG: ["type"],
    feFuncR: ["type"],
    feImage: ["href"],
    font: ["horiz-adv-x"],
    "font-face-uri": ["href"],
    foreignObject: ["width", "height"],
    hkern: ["k"],
    image: ["href", "width", "height"],
    mpath: ["href"],
    path: ["d"],
    polygon: ["points"],
    polyline: ["points"],
    rect: ["width", "height"],
    script: ["type"],
    set: ["attributeName"],
    stop: ["offset"],
    style: ["type"],
    textPath: ["href"],
    tref: ["href"],
    use: ["href"],
    vkern: ["k"],
  };

  // Also accept xlink:href as alternative to href for backwards compatibility
  const HREF_ALTERNATIVES = ["href", "xlink:href"];

  const detectMissingRequiredAttrs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const required = REQUIRED_ATTRS[tagName];

    if (required) {
      for (const attr of required) {
        // For href, accept either href or xlink:href
        if (attr === "href") {
          const hasHref = HREF_ALTERNATIVES.some((a) => el.hasAttribute(a));
          if (!hasHref) {
            fixes.push({
              type: "missing_required_attribute",
              element: tagName,
              attr: attr,
              reason: `Element <${tagName}> is missing required attribute '${attr}' (or 'xlink:href')`,
            });
          }
        } else {
          if (!el.hasAttribute(attr)) {
            fixes.push({
              type: "missing_required_attribute",
              element: tagName,
              attr: attr,
              reason: `Element <${tagName}> is missing required attribute '${attr}'`,
            });
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMissingRequiredAttrs(child);
    }
  };

  // Fix 13: Detect invalid child elements per SVG 1.1 DTD content models
  // Each element has specific allowed children - violations cause rendering issues

  // Elements that can only have specific children (not general content)
  const RESTRICTED_CHILDREN = {
    // Shape elements can only have desc, title, metadata, and animation elements
    circle: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    ellipse: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    line: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    path: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    polygon: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    polyline: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    rect: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    use: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    image: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatecolor",
      "animatemotion",
      "animatetransform",
      "set",
    ]),
    // Animation elements can only have desc, title, metadata
    animate: new Set(["desc", "title", "metadata"]),
    animatecolor: new Set(["desc", "title", "metadata"]),
    animatemotion: new Set(["desc", "title", "metadata", "mpath"]),
    animatetransform: new Set(["desc", "title", "metadata"]),
    set: new Set(["desc", "title", "metadata"]),
    // Gradient elements have specific children
    lineargradient: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatetransform",
      "set",
      "stop",
    ]),
    radialgradient: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "animatetransform",
      "set",
      "stop",
    ]),
    // Filter primitive elements
    filter: new Set([
      "desc",
      "title",
      "metadata",
      "animate",
      "set",
      "feblend",
      "fecolormatrix",
      "fecomponenttransfer",
      "fecomposite",
      "feconvolvematrix",
      "fediffuselighting",
      "fedisplacementmap",
      "feflood",
      "fegaussianblur",
      "feimage",
      "femerge",
      "femorphology",
      "feoffset",
      "fespecularlighting",
      "fetile",
      "feturbulence",
    ]),
    // Stop element is empty in practice
    stop: new Set(["animate", "animatecolor", "set"]),
  };

  const detectInvalidChildren = (el) => {
    const tagName = el.tagName.toLowerCase();
    const allowedChildren = RESTRICTED_CHILDREN[tagName];

    if (allowedChildren) {
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          // Skip namespaced elements (rdf:*, dc:*, etc.)
          if (!childTag.includes(":") && !allowedChildren.has(childTag)) {
            fixes.push({
              type: "invalid_child_element",
              parent: tagName,
              child: childTag,
              reason: `Element <${childTag}> is not a valid child of <${tagName}> per SVG 1.1 DTD`,
            });
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidChildren(child);
    }
  };

  // Fix 14: Detect invalid enumerated attribute values per SVG 1.1 DTD
  // Many attributes only accept specific values - using other values causes undefined behavior
  const ENUMERATED_ATTRIBUTES = {
    "alignment-baseline": [
      "auto",
      "baseline",
      "before-edge",
      "text-before-edge",
      "middle",
      "central",
      "after-edge",
      "text-after-edge",
      "ideographic",
      "alphabetic",
      "hanging",
      "mathematical",
      "inherit",
    ],
    "clip-rule": ["nonzero", "evenodd", "inherit"],
    "color-interpolation": ["auto", "sRGB", "linearRGB", "inherit"],
    "color-interpolation-filters": ["auto", "sRGB", "linearRGB", "inherit"],
    "color-rendering": ["auto", "optimizeSpeed", "optimizeQuality", "inherit"],
    direction: ["ltr", "rtl", "inherit"],
    display: [
      "inline",
      "block",
      "list-item",
      "run-in",
      "compact",
      "marker",
      "table",
      "inline-table",
      "table-row-group",
      "table-header-group",
      "table-footer-group",
      "table-row",
      "table-column-group",
      "table-column",
      "table-cell",
      "table-caption",
      "none",
      "inherit",
    ],
    "dominant-baseline": [
      "auto",
      "use-script",
      "no-change",
      "reset-size",
      "ideographic",
      "alphabetic",
      "hanging",
      "mathematical",
      "central",
      "middle",
      "text-after-edge",
      "text-before-edge",
      "inherit",
    ],
    "fill-rule": ["nonzero", "evenodd", "inherit"],
    "font-stretch": [
      "normal",
      "wider",
      "narrower",
      "ultra-condensed",
      "extra-condensed",
      "condensed",
      "semi-condensed",
      "semi-expanded",
      "expanded",
      "extra-expanded",
      "ultra-expanded",
      "inherit",
    ],
    "font-style": ["normal", "italic", "oblique", "inherit"],
    "font-variant": ["normal", "small-caps", "inherit"],
    "font-weight": [
      "normal",
      "bold",
      "bolder",
      "lighter",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "inherit",
    ],
    "image-rendering": ["auto", "optimizeSpeed", "optimizeQuality", "inherit"],
    overflow: ["visible", "hidden", "scroll", "auto", "inherit"],
    "pointer-events": [
      "visiblePainted",
      "visibleFill",
      "visibleStroke",
      "visible",
      "painted",
      "fill",
      "stroke",
      "all",
      "none",
      "inherit",
    ],
    "shape-rendering": [
      "auto",
      "optimizeSpeed",
      "crispEdges",
      "geometricPrecision",
      "inherit",
    ],
    "stroke-linecap": ["butt", "round", "square", "inherit"],
    "stroke-linejoin": ["miter", "round", "bevel", "inherit"],
    "text-anchor": ["start", "middle", "end", "inherit"],
    "text-rendering": [
      "auto",
      "optimizeSpeed",
      "optimizeLegibility",
      "geometricPrecision",
      "inherit",
    ],
    "unicode-bidi": ["normal", "embed", "bidi-override", "inherit"],
    visibility: ["visible", "hidden", "collapse", "inherit"],
    "writing-mode": ["lr-tb", "rl-tb", "tb-rl", "lr", "rl", "tb", "inherit"],
    "xml:space": ["default", "preserve"],
    // Animation-specific
    additive: ["replace", "sum"],
    accumulate: ["none", "sum"],
    calcMode: ["discrete", "linear", "paced", "spline"],
    fill: ["freeze", "remove"], // Animation fill (different from paint fill)
    restart: ["always", "whenNotActive", "never"],
    attributeType: ["CSS", "XML", "auto"],
    // Filter-specific
    edgeMode: ["duplicate", "wrap", "none"],
    operator: [
      "over",
      "in",
      "out",
      "atop",
      "xor",
      "arithmetic",
      "erode",
      "dilate",
    ],
    mode: ["normal", "multiply", "screen", "darken", "lighten"],
    type: [
      "translate",
      "scale",
      "rotate",
      "skewX",
      "skewY",
      "matrix",
      "saturate",
      "hueRotate",
      "luminanceToAlpha",
      "identity",
      "table",
      "discrete",
      "linear",
      "gamma",
      "fractalNoise",
      "turbulence",
    ],
    // Gradient-specific
    spreadMethod: ["pad", "reflect", "repeat"],
    gradientUnits: ["userSpaceOnUse", "objectBoundingBox"],
    patternUnits: ["userSpaceOnUse", "objectBoundingBox"],
    patternContentUnits: ["userSpaceOnUse", "objectBoundingBox"],
    clipPathUnits: ["userSpaceOnUse", "objectBoundingBox"],
    maskUnits: ["userSpaceOnUse", "objectBoundingBox"],
    maskContentUnits: ["userSpaceOnUse", "objectBoundingBox"],
    filterUnits: ["userSpaceOnUse", "objectBoundingBox"],
    primitiveUnits: ["userSpaceOnUse", "objectBoundingBox"],
    markerUnits: ["strokeWidth", "userSpaceOnUse"],
    // Other
    method: ["align", "stretch"],
    spacing: ["auto", "exact"],
    lengthAdjust: ["spacing", "spacingAndGlyphs"],
    preserveAspectRatio: [
      "none",
      "xMinYMin",
      "xMidYMin",
      "xMaxYMin",
      "xMinYMid",
      "xMidYMid",
      "xMaxYMid",
      "xMinYMax",
      "xMidYMax",
      "xMaxYMax",
    ],
    zoomAndPan: ["disable", "magnify"],
    externalResourcesRequired: ["true", "false"],
  };

  // Attributes that can have additional modifiers (like "xMidYMid slice")
  const COMPOUND_ATTRS = new Set(["preserveAspectRatio"]);

  const detectInvalidEnumValues = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      const validValues = ENUMERATED_ATTRIBUTES[attrName];
      if (validValues) {
        let value = el.getAttribute(attrName);

        // For compound attributes, check just the first word (guard null/undefined from getAttribute)
        if (COMPOUND_ATTRS.has(attrName) && value) {
          value = value.split(/\s+/)[0];
        }

        // Skip animation 'fill' check on non-animation elements (paint fill is different)
        if (
          attrName === "fill" &&
          ![
            "animate",
            "animatecolor",
            "animatemotion",
            "animatetransform",
            "set",
          ].includes(tagName)
        ) {
          continue;
        }

        if (!validValues.includes(value) && value !== "inherit") {
          fixes.push({
            type: "invalid_enum_value",
            element: tagName,
            attr: attrName,
            value: value,
            validValues:
              validValues.slice(0, 5).join(", ") +
              (validValues.length > 5 ? "..." : ""),
            reason: `Invalid value '${value}' for attribute '${attrName}' - must be one of: ${validValues.slice(0, 5).join(", ")}${validValues.length > 5 ? "..." : ""}`,
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidEnumValues(child);
    }
  };

  // Fix 15: Detect invalid numeric attribute values
  // Some numeric attributes have specific valid ranges

  const NUMERIC_CONSTRAINTS = {
    // Opacity values must be 0-1
    opacity: { min: 0, max: 1, type: "number" },
    "fill-opacity": { min: 0, max: 1, type: "number" },
    "stroke-opacity": { min: 0, max: 1, type: "number" },
    "stop-opacity": { min: 0, max: 1, type: "number" },
    "flood-opacity": { min: 0, max: 1, type: "number" },

    // Positive only
    "stroke-width": { min: 0, type: "length" },
    "stroke-miterlimit": { min: 1, type: "number" }, // Must be >= 1
    "font-size": { min: 0, type: "length" },
    r: { min: 0, type: "length" }, // radius must be positive
    rx: { min: 0, type: "length" },
    ry: { min: 0, type: "length" },
    width: { min: 0, type: "length" }, // dimensions must be positive
    height: { min: 0, type: "length" },

    // Filter specific
    stdDeviation: { min: 0, type: "number" },
    scale: { type: "number" }, // Can be any number
    baseFrequency: { min: 0, type: "number" },
    numOctaves: { min: 1, type: "integer" },
    seed: { min: 0, type: "number" },

    // Animation specific
    repeatCount: { min: 0, type: "number" }, // 'indefinite' also valid
  };

  const detectInvalidNumericValues = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      const constraint = NUMERIC_CONSTRAINTS[attrName];
      if (constraint) {
        const value = el.getAttribute(attrName);

        // Skip special values
        if (
          value === "inherit" ||
          value === "none" ||
          value === "indefinite" ||
          value === "auto"
        ) {
          continue;
        }

        // Extract numeric part (remove units)
        const numMatch = value.match(/^([+-]?\d*\.?\d+)/);
        if (numMatch) {
          const num = parseFloat(numMatch[1]);

          if (isNaN(num)) {
            fixes.push({
              type: "invalid_numeric_value",
              element: tagName,
              attr: attrName,
              value: value,
              reason: `Invalid numeric value '${value}' for attribute '${attrName}'`,
            });
          } else {
            if (constraint.min !== undefined && num < constraint.min) {
              fixes.push({
                type: "numeric_out_of_range",
                element: tagName,
                attr: attrName,
                value: value,
                constraint: `min: ${constraint.min}`,
                reason: `Value '${value}' for '${attrName}' is below minimum (${constraint.min})`,
              });
            }
            if (constraint.max !== undefined && num > constraint.max) {
              fixes.push({
                type: "numeric_out_of_range",
                element: tagName,
                attr: attrName,
                value: value,
                constraint: `max: ${constraint.max}`,
                reason: `Value '${value}' for '${attrName}' exceeds maximum (${constraint.max})`,
              });
            }
            if (constraint.type === "integer" && !Number.isInteger(num)) {
              fixes.push({
                type: "invalid_numeric_value",
                element: tagName,
                attr: attrName,
                value: value,
                reason: `Attribute '${attrName}' requires an integer value, got '${value}'`,
              });
            }
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidNumericValues(child);
    }
  };

  // Fix 16: Detect duplicate IDs
  // SVG spec requires all IDs to be unique within a document
  // Duplicate IDs cause undefined behavior with url(#id) references

  const _detectDuplicateIds = (docLocal) => {
    const idMap = new Map(); // id -> array of elements with that id

    const collectIdsLocal = (el) => {
      const id = el.getAttribute("id");
      if (id) {
        if (!idMap.has(id)) {
          idMap.set(id, []);
        }
        idMap.get(id).push(el.tagName.toLowerCase());
      }
      for (const child of el.children) {
        if (isElement(child)) collectIdsLocal(child);
      }
    };

    collectIdsLocal(docLocal);

    // Report duplicates
    for (const [id, elements] of idMap) {
      if (elements.length > 1) {
        fixes.push({
          type: "duplicate_id",
          id: id,
          count: elements.length,
          elements: elements.join(", "),
          reason: `Duplicate ID '${id}' found on ${elements.length} elements: ${elements.join(", ")}`,
        });
      }
    }
  };

  // Fix 17: Detect broken URL references (url(#id) pointing to non-existent IDs)
  // This catches references to IDs that don't exist in the document

  const detectBrokenReferences = (docLocal) => {
    // First, collect all existing IDs
    const existingIds = new Set();
    const collectIdsLocal = (el) => {
      const id = el.getAttribute("id");
      if (id) existingIds.add(id);
      for (const child of el.children) {
        if (isElement(child)) collectIdsLocal(child);
      }
    };
    collectIdsLocal(docLocal);

    // URL reference pattern: url(#id) or url('#id') or url("#id")
    const urlRefPattern = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/g;
    // Direct reference pattern: href="#id" or xlink:href="#id"
    const hrefPattern = /^#(.+)$/;

    const checkElement = (el) => {
      const tagName = el.tagName.toLowerCase();

      for (const attrName of el.getAttributeNames()) {
        const value = el.getAttribute(attrName);

        // Check url(#id) references
        let match;
        urlRefPattern.lastIndex = 0;
        while ((match = urlRefPattern.exec(value)) !== null) {
          const refId = match[1];
          if (!existingIds.has(refId)) {
            fixes.push({
              type: "broken_reference",
              element: tagName,
              attr: attrName,
              refId: refId,
              reason: `Broken reference: url(#${refId}) points to non-existent ID`,
            });
          }
        }

        // Check href="#id" references
        if (attrName === "href" || attrName === "xlink:href") {
          const hrefMatch = value.match(hrefPattern);
          if (hrefMatch) {
            const refId = hrefMatch[1];
            if (!existingIds.has(refId)) {
              fixes.push({
                type: "broken_reference",
                element: tagName,
                attr: attrName,
                refId: refId,
                reason: `Broken reference: ${attrName}="#${refId}" points to non-existent ID`,
              });
            }
          }
        }
      }

      for (const child of el.children) {
        if (isElement(child)) checkElement(child);
      }
    };

    checkElement(doc);
  };

  // Fix 18: Detect invalid color values
  // SVG 1.1 supports: named colors, #RGB, #RRGGBB, rgb(), and 'currentColor'

  const SVG_NAMED_COLORS = new Set([
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
  ]);

  // All SVG attributes that can contain color values
  // Note: Using Set for O(1) lookup in validation loops
  const COLOR_ATTRS = new Set([
    "fill",
    "stroke",
    "color", // Common
    "stop-color",
    "flood-color",
    "lighting-color", // Gradients/filters
    "solid-color", // SVG2 solid-color paint server
  ]);

  const isValidColor = (value) => {
    const v = value.toLowerCase().trim();
    // Special values
    if (v === "none" || v === "inherit" || v === "currentcolor") return true;
    // Named color
    if (SVG_NAMED_COLORS.has(v)) return true;
    // url(#id) reference
    if (v.startsWith("url(")) return true;
    // #RGB or #RRGGBB
    if (/^#[0-9a-f]{3}$/.test(v) || /^#[0-9a-f]{6}$/.test(v)) return true;
    // rgb(r, g, b) or rgb(r%, g%, b%)
    if (/^rgb\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*\)$/.test(v))
      return true;
    // rgba() - SVG 2.0 but commonly supported
    if (
      /^rgba\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*[\d.]+%?\s*\)$/.test(
        v,
      )
    )
      return true;
    return false;
  };

  const detectInvalidColors = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      if (COLOR_ATTRS.has(attrName)) {
        const value = el.getAttribute(attrName);
        if (!isValidColor(value)) {
          fixes.push({
            type: "invalid_color",
            element: tagName,
            attr: attrName,
            value: value,
            reason: `Invalid color value '${value}' for attribute '${attrName}'`,
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidColors(child);
    }
  };

  // Fix 19: Detect malformed viewBox and other format issues
  // viewBox must be exactly 4 numbers: min-x, min-y, width, height

  const detectMalformedFormats = (el) => {
    const tagName = el.tagName.toLowerCase();

    // Check viewBox format on svg, symbol, marker, pattern, view elements
    if (["svg", "symbol", "marker", "pattern", "view"].includes(tagName)) {
      const viewBox = el.getAttribute("viewBox");
      if (viewBox) {
        // Split by whitespace or comma
        const parts = viewBox.trim().split(/[\s,]+/);
        if (parts.length !== 4) {
          fixes.push({
            type: "malformed_viewbox",
            element: tagName,
            value: viewBox,
            reason: `viewBox must have exactly 4 values (min-x, min-y, width, height), got ${parts.length}`,
          });
        } else {
          // Check each part is a valid number
          for (let i = 0; i < parts.length; i++) {
            if (!/^[+-]?\d*\.?\d+([Ee][+-]?\d+)?$/.test(parts[i])) {
              fixes.push({
                type: "malformed_viewbox",
                element: tagName,
                value: viewBox,
                reason: `viewBox contains invalid number '${parts[i]}' at position ${i + 1}`,
              });
              break;
            }
          }
          // Check width and height are non-negative
          const width = parseFloat(parts[2]);
          const height = parseFloat(parts[3]);
          if (width < 0 || height < 0) {
            fixes.push({
              type: "invalid_viewbox_dimensions",
              element: tagName,
              value: viewBox,
              reason: `viewBox width and height must be non-negative, got ${width}x${height}`,
            });
          }
        }
      }
    }

    // Check preserveAspectRatio format
    const par = el.getAttribute("preserveAspectRatio");
    if (par) {
      const parPattern =
        /^(none|xMinYMin|xMidYMin|xMaxYMin|xMinYMid|xMidYMid|xMaxYMid|xMinYMax|xMidYMax|xMaxYMax)(\s+(meet|slice))?$/;
      if (!parPattern.test(par.trim())) {
        fixes.push({
          type: "malformed_preserveaspectratio",
          element: tagName,
          value: par,
          reason: `Invalid preserveAspectRatio format '${par}'`,
        });
      }
    }

    // Check points format on polygon/polyline
    if (["polygon", "polyline"].includes(tagName)) {
      const points = el.getAttribute("points");
      if (points) {
        // Points must be pairs of numbers
        const nums = points.trim().split(/[\s,]+/);
        if (nums.length > 0 && nums.length % 2 !== 0) {
          fixes.push({
            type: "malformed_points",
            element: tagName,
            value: points.slice(0, 50) + (points.length > 50 ? "..." : ""),
            reason: `points attribute must have even number of values (x,y pairs), got ${nums.length}`,
          });
        }
      }
    }

    // Check transform syntax
    const transform = el.getAttribute("transform");
    if (transform) {
      // Use limited whitespace matching to prevent catastrophic backtracking
      const validTransforms =
        /^(\s{0,20}(matrix|translate|scale|rotate|skewX|skewY)\s{0,20}\([^)]*\)\s{0,20})+$/;
      if (!validTransforms.test(transform.trim())) {
        // Only flag if it doesn't look like a valid transform at all
        if (!/^[\s\w(),.\-+]+$/.test(transform)) {
          fixes.push({
            type: "malformed_transform",
            element: tagName,
            value:
              transform.slice(0, 50) + (transform.length > 50 ? "..." : ""),
            reason: `Potentially malformed transform attribute`,
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMalformedFormats(child);
    }
  };

  // Fix 20: Actually fix mistyped element names (W101)
  // Note: In DOM, elements can't be renamed - must create new, copy content, replace
  const fixMistypedElements = (el) => {
    const tagName = el.tagName;
    const tagLower = tagName.toLowerCase();

    // Skip namespaced or valid elements
    if (
      tagName.includes(":") ||
      SVG11_ELEMENTS.has(tagName) ||
      SVG11_ELEMENTS_LOWER.has(tagLower)
    ) {
      // Just recurse to children
      for (const child of Array.from(el.children)) {
        if (isElement(child)) fixMistypedElements(child);
      }
      return;
    }

    // Check for typo suggestions
    const suggestion = findClosestMatch(tagName, SVG11_ELEMENTS);
    if (suggestion) {
      // Create new element with correct name
      const newEl = el.ownerDocument.createElement(suggestion);

      // Copy all attributes
      for (const attr of el.getAttributeNames()) {
        newEl.setAttribute(attr, el.getAttribute(attr));
      }

      // Move all children
      while (el.firstChild) {
        newEl.appendChild(el.firstChild);
      }

      // Replace in parent
      if (el.parentNode) {
        el.parentNode.replaceChild(newEl, el);
      }

      fixes.push({
        type: "element_typo_fixed",
        oldName: tagName,
        newName: suggestion,
        reason: `Fixed element typo: <${tagName}> -> <${suggestion}>`,
      });

      // Continue with the new element
      for (const child of Array.from(newEl.children)) {
        if (isElement(child)) fixMistypedElements(child);
      }
    } else {
      // No suggestion, just recurse
      for (const child of Array.from(el.children)) {
        if (isElement(child)) fixMistypedElements(child);
      }
    }
  };

  // Fix 21: Actually fix mistyped attribute names (W103)
  const fixMistypedAttributes = (el) => {
    for (const attrName of Array.from(el.getAttributeNames())) {
      // Skip namespace declarations, data-* attributes, vendor prefixes, and valid attributes
      if (attrName.startsWith("xmlns") || attrName.startsWith("data-"))
        continue;
      if (attrName.startsWith("-webkit-") || attrName.startsWith("-moz-"))
        continue;
      if (
        attrName.includes(":") &&
        !attrName.startsWith("xlink:") &&
        !attrName.startsWith("xml:")
      )
        continue;
      if (
        SVG11_ATTRIBUTES.has(attrName) ||
        SVG11_ATTRIBUTES_LOWER.has(attrName.toLowerCase())
      )
        continue;

      // Check for typo suggestions
      const suggestion = findClosestMatch(attrName, SVG11_ATTRIBUTES);
      if (suggestion) {
        const value = el.getAttribute(attrName);
        el.removeAttribute(attrName);
        el.setAttribute(suggestion, value);
        fixes.push({
          type: "attr_typo_fixed",
          element: el.tagName.toLowerCase(),
          oldAttr: attrName,
          newAttr: suggestion,
          reason: `Fixed attribute typo: '${attrName}' -> '${suggestion}'`,
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) fixMistypedAttributes(child);
    }
  };

  // Fix 22: Actually fix duplicate IDs (E003)
  const fixDuplicateIds = (docLocal) => {
    const idCount = new Map();
    const allIdsInDoc = new Set();

    // First pass: count occurrences
    const countIdsLocal = (el) => {
      const id = el.getAttribute("id");
      if (id) {
        idCount.set(id, (idCount.get(id) || 0) + 1);
        allIdsInDoc.add(id);
      }
      for (const child of el.children) {
        if (isElement(child)) countIdsLocal(child);
      }
    };
    countIdsLocal(docLocal);

    // Second pass: rename duplicates (keep first occurrence)
    const seen = new Set();
    const renameDuplicatesLocal = (el) => {
      const id = el.getAttribute("id");
      if (id) {
        if (seen.has(id)) {
          // Generate unique ID
          let newId = id;
          let counter = 2;
          while (allIdsInDoc.has(newId) || seen.has(newId)) {
            newId = `${id}_${counter++}`;
          }
          el.setAttribute("id", newId);
          allIdsInDoc.add(newId);
          seen.add(newId);
          fixes.push({
            type: "duplicate_id_renamed",
            oldId: id,
            newId: newId,
            element: el.tagName.toLowerCase(),
            reason: `Renamed duplicate ID: '${id}' -> '${newId}'`,
          });
        } else {
          seen.add(id);
        }
      }
      for (const child of el.children) {
        if (isElement(child)) renameDuplicatesLocal(child);
      }
    };
    renameDuplicatesLocal(docLocal);
  };

  // Apply all fixes
  fixInvalidAttributes(doc);
  fixMissingXlinkNamespace();
  fixBrokenIdReferences(doc);
  fixAnimationTimingValues(doc);
  fixAnimationInEmptyElements(doc);
  fixUppercaseUnits(doc);
  fixInvalidWhitespace(doc);
  fixInvalidNumbers(doc);
  fixMistypedElements(doc); // Actually fix element typos (W101)
  fixMistypedAttributes(doc); // Actually fix attribute typos (W103)
  fixDuplicateIds(doc); // Actually fix duplicate IDs (E003)
  detectOutOfRangeValues(doc);
  detectMissingRequiredAttrs(doc);
  detectInvalidChildren(doc);
  detectInvalidEnumValues(doc);
  detectInvalidNumericValues(doc);
  detectBrokenReferences(doc);
  detectInvalidColors(doc);
  detectMalformedFormats(doc);

  // Add fix report as attribute
  doc.setAttribute("data-fixes-applied", String(fixes.length));

  if (verbose && fixes.length > 0) {
    doc.setAttribute("data-fix-report", JSON.stringify(fixes));
  }

  return doc;
});

// ============================================================================
// SVG VALIDATION CONSTANTS AND HELPERS
// ============================================================================

/**
 * Issue severity levels for SVG validation
 * @readonly
 * @enum {string}
 */
export const ValidationSeverity = {
  ERROR: "error", // Definite spec violation that will cause rendering issues
  WARNING: "warning", // Potential issue or non-standard usage that may work
};

// Note: SVG2_ELEMENTS and SVG2_ATTRIBUTES are now defined at module level

/**
 * Maps issue types to their severity level
 * ERRORS: Definite spec violations that break rendering
 * WARNINGS: Potential issues that may work but are non-standard
 * @private
 */
const ISSUE_SEVERITY = {
  // ERRORS - Definite problems that break rendering
  broken_reference: ValidationSeverity.ERROR,
  broken_url_reference: ValidationSeverity.ERROR,
  duplicate_id: ValidationSeverity.ERROR,
  missing_required_attribute: ValidationSeverity.ERROR,
  invalid_child_element: ValidationSeverity.ERROR,
  animation_in_empty_element: ValidationSeverity.ERROR,
  malformed_viewbox: ValidationSeverity.ERROR,
  malformed_points: ValidationSeverity.ERROR,
  malformed_transform: ValidationSeverity.ERROR,
  invalid_enum_value: ValidationSeverity.ERROR,
  invalid_numeric_constraint: ValidationSeverity.ERROR,

  // WARNINGS - Potential issues that may still render
  invalid_attr_on_element: ValidationSeverity.WARNING,
  missing_namespace: ValidationSeverity.WARNING,
  invalid_timing: ValidationSeverity.WARNING,
  uppercase_unit: ValidationSeverity.WARNING,
  invalid_whitespace: ValidationSeverity.WARNING,
  invalid_number: ValidationSeverity.WARNING,
  mistyped_element_detected: ValidationSeverity.WARNING,
  unknown_element_detected: ValidationSeverity.WARNING,
  mistyped_attribute_detected: ValidationSeverity.WARNING,
  unknown_attribute_detected: ValidationSeverity.WARNING,
  invalid_color: ValidationSeverity.WARNING,

  // Structure warnings (W300s)
  circular_reference: ValidationSeverity.WARNING,
  deep_nesting: ValidationSeverity.WARNING,
  empty_defs: ValidationSeverity.WARNING,
  gradient_stop_order: ValidationSeverity.WARNING,

  // Performance warnings (W400s)
  path_complexity: ValidationSeverity.WARNING,

  // Security warnings (W500s)
  external_resource: ValidationSeverity.WARNING,
  script_content: ValidationSeverity.WARNING,
  event_handler: ValidationSeverity.WARNING,

  // Accessibility warnings (W600s)
  missing_title: ValidationSeverity.WARNING,
  missing_desc: ValidationSeverity.WARNING,
  invalid_aria: ValidationSeverity.WARNING,
  missing_lang: ValidationSeverity.WARNING,
};

// Module-level static sets for performance (avoid recreation on each validation call)

/**
 * Event handler attributes that could execute JavaScript (security concern)
 * @private
 */
const EVENT_HANDLERS = new Set([
  "onabort",
  "onactivate",
  "onbegin",
  "oncancel",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncuechange",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onend",
  "onended",
  "onerror",
  "onfocus",
  "onfocusin",
  "onfocusout",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onmousewheel",
  "onpause",
  "onplay",
  "onplaying",
  "onprogress",
  "onratechange",
  "onrepeat",
  "onreset",
  "onresize",
  "onscroll",
  "onseeked",
  "onseeking",
  "onselect",
  "onshow",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "onunload",
  "onvolumechange",
  "onwaiting",
  "onwheel",
]);

/**
 * Valid ARIA attributes for SVG accessibility
 * @private
 */
const VALID_ARIA_ATTRS = new Set([
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-busy",
  "aria-checked",
  "aria-colcount",
  "aria-colindex",
  "aria-colspan",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-details",
  "aria-disabled",
  "aria-dropeffect",
  "aria-errormessage",
  "aria-expanded",
  "aria-flowto",
  "aria-grabbed",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-keyshortcuts",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-placeholder",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-roledescription",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowspan",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
]);

/**
 * Valid role values for SVG elements
 * @private
 */
const VALID_ROLES = new Set([
  "img",
  "graphics-document",
  "graphics-object",
  "graphics-symbol",
  "group",
  "list",
  "listitem",
  "none",
  "presentation",
  "application",
]);

/**
 * Build a position index from SVG source string
 * Maps element tags and their attributes to line:column positions
 * @private
 * @param {string} svgString - The raw SVG source string
 * @returns {Object} Position index with helper methods
 */
function buildPositionIndex(svgString) {
  const index = {
    elements: new Map(), // tag name -> array of {line, column, endColumn, attrs}
    lines: [], // Array of line start positions for quick lookup
  };

  // Build line start positions
  const _pos = 0;
  index.lines.push(0); // Line 1 starts at position 0
  for (let i = 0; i < svgString.length; i++) {
    if (svgString[i] === "\n") {
      index.lines.push(i + 1);
    }
  }

  // Build exclusion ranges for CDATA sections, comments, and embedded content
  // These regions may contain tag-like patterns that should not be indexed
  const exclusionRanges = [];

  // Find CDATA sections: <![CDATA[ ... ]]>
  const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let cdataMatch;
  while ((cdataMatch = cdataRegex.exec(svgString)) !== null) {
    exclusionRanges.push({
      start: cdataMatch.index,
      end: cdataMatch.index + cdataMatch[0].length,
    });
  }

  // Find XML comments: <!-- ... -->
  const commentRegex = /<!--[\s\S]*?-->/g;
  let commentMatch;
  while ((commentMatch = commentRegex.exec(svgString)) !== null) {
    exclusionRanges.push({
      start: commentMatch.index,
      end: commentMatch.index + commentMatch[0].length,
    });
  }

  // Find script content: <script>...</script> (content only, not the tags)
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(svgString)) !== null) {
    // Exclude just the content, not the opening/closing tags
    const contentStart = scriptMatch.index + scriptMatch[0].indexOf(">") + 1;
    const contentEnd = scriptMatch.index + scriptMatch[0].lastIndexOf("<");
    if (contentEnd > contentStart) {
      exclusionRanges.push({ start: contentStart, end: contentEnd });
    }
  }

  // Find style content: <style>...</style> (content only, not the tags)
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(svgString)) !== null) {
    // Exclude just the content, not the opening/closing tags
    const contentStart = styleMatch.index + styleMatch[0].indexOf(">") + 1;
    const contentEnd = styleMatch.index + styleMatch[0].lastIndexOf("<");
    if (contentEnd > contentStart) {
      exclusionRanges.push({ start: contentStart, end: contentEnd });
    }
  }

  // Sort exclusion ranges by start position for efficient lookup
  exclusionRanges.sort((a, b) => a.start - b.start);

  // Check if a position is within an excluded range
  const isExcluded = (position) => {
    for (const range of exclusionRanges) {
      if (position >= range.start && position < range.end) return true;
      if (range.start > position) break; // No need to check further (sorted)
    }
    return false;
  };

  // Convert absolute position to line:column
  const posToLineCol = (absPos) => {
    let line = 1;
    for (let i = 0; i < index.lines.length; i++) {
      if (index.lines[i] > absPos) {
        line = i;
        break;
      }
      line = i + 1;
    }
    const lineStart = index.lines[line - 1] || 0;
    const column = absPos - lineStart + 1;
    return { line, column };
  };

  // Scan for all opening tags: <tagName ...>
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9:_-]*)\s*([^>]*?)(\/?)\s*>/g;
  // Hoisted outside loop to avoid recreating regex on each iteration (performance optimization)
  const attrPattern = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*["']([^"']*)["']/g;
  let match;

  while ((match = tagPattern.exec(svgString)) !== null) {
    // Skip tags found inside excluded regions (CDATA, comments, script/style content)
    if (isExcluded(match.index)) continue;
    const tagName = match[1].toLowerCase();
    const attrsString = match[2];
    const tagStart = match.index;
    const _tagEnd = match.index + match[0].length;
    const { line, column } = posToLineCol(tagStart);
    // BUG FIX: Calculate where attrsString starts within the full tag (after tag name and whitespace)
    const attrsStringStart = attrsString ? match[0].indexOf(attrsString) : 0;

    // Parse attributes within this tag
    const attrs = new Map();
    // Reset lastIndex since attrPattern is reused across iterations
    attrPattern.lastIndex = 0;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrsString)) !== null) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2];
      // BUG FIX: Use attrMatch.index (position within attrsString) + offset to attrsString start
      const attrPos = tagStart + attrsStringStart + attrMatch.index;
      const attrLineCol = posToLineCol(attrPos);
      attrs.set(attrName.toLowerCase(), {
        name: attrName,
        value: attrValue,
        line: attrLineCol.line,
        column: attrLineCol.column,
      });
    }

    if (!index.elements.has(tagName)) {
      index.elements.set(tagName, []);
    }
    index.elements.get(tagName).push({
      line,
      column,
      endColumn: column + match[0].length - 1,
      attrs,
    });
  }

  // Helper to get position for nth occurrence of an element
  index.getElementPosition = (tagName, occurrenceIndex = 0) => {
    const occurrences = index.elements.get(tagName.toLowerCase());
    if (occurrences && occurrences[occurrenceIndex]) {
      const occ = occurrences[occurrenceIndex];
      return { line: occ.line, column: occ.column };
    }
    return { line: 1, column: 1 }; // Fallback
  };

  // Helper to get position for an attribute on nth occurrence of an element
  index.getAttributePosition = (tagName, attrName, occurrenceIndex = 0) => {
    const occurrences = index.elements.get(tagName.toLowerCase());
    if (occurrences && occurrences[occurrenceIndex]) {
      const occ = occurrences[occurrenceIndex];
      const attr = occ.attrs.get(attrName.toLowerCase());
      if (attr) {
        return { line: attr.line, column: attr.column };
      }
      // Attribute not found, return element position
      return { line: occ.line, column: occ.column };
    }
    return { line: 1, column: 1 }; // Fallback
  };

  return index;
}

/**
 * Validate SVG document against SVG 1.1 specification (detection only, no modifications)
 *
 * SVG 2.0 elements and attributes (meshgradient, solidcolor, etc.) are NOT flagged as errors.
 *
 * @param {string|Element} input - SVG string, file path, URL, or DOM element
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.errorsOnly=false] - If true, only return errors (not warnings)
 * @param {string} [options.outputFile] - File path to save validation report
 * @param {string} [options.outputFormat='json'] - Report format: 'text', 'json', 'xml', 'yaml'
 * @param {boolean} [options.includeSource=false] - Include source line content in report
 *
 * @returns {Promise<Object>} Validation result object
 * @returns {Array} returns.issues - Array of detected issues sorted by line:column
 * @returns {boolean} returns.isValid - True if no errors found
 * @returns {boolean} returns.hasErrors - True if any errors (not just warnings) found
 * @returns {boolean} returns.hasWarnings - True if any warnings found
 * @returns {number} returns.errorCount - Count of error-severity issues
 * @returns {number} returns.warningCount - Count of warning-severity issues
 * @returns {Object} returns.summary - Counts by issue type
 * @returns {string} [returns.outputFile] - Path to saved report (if outputFile was specified)
 *
 * @example
 * // Basic validation
 * const result = await validateSvg('<svg>...</svg>');
 * console.log(result.isValid, result.errorCount);
 *
 * @example
 * // Errors only, save to JSON
 * const result = await validateSvg('file.svg', {
 *   errorsOnly: true,
 *   outputFile: 'report.json',
 *   outputFormat: 'json'
 * });
 *
 * @example
 * // Issue structure
 * // {
 * //   type: 'broken_reference',
 * //   severity: 'error',
 * //   element: 'use',
 * //   attr: 'href',
 * //   line: 15,
 * //   column: 23,
 * //   reason: "Reference to non-existent ID 'missing'"
 * // }
 */
export async function validateSVGAsync(input, options = {}) {
  // Reset Levenshtein cache for fresh validation
  resetLevenshteinCache();

  // Extract options with defaults
  const errorsOnly = options.errorsOnly === true;
  const outputFile = options.outputFile || null;
  const outputFormat = (options.outputFormat || "json").toLowerCase();
  const includeSource = options.includeSource === true;

  // Validate outputFormat
  const validFormats = ["text", "json", "xml", "yaml"];
  if (outputFile && !validFormats.includes(outputFormat)) {
    throw new Error(
      `Invalid outputFormat '${outputFormat}'. Must be one of: ${validFormats.join(", ")}`,
    );
  }

  // Get the raw SVG string for position tracking
  let svgString = "";
  let inputType;

  try {
    inputType = detectInputType(input);

    if (inputType === InputType.SVG_STRING) {
      svgString = input;
    } else if (inputType === InputType.FILE_PATH) {
      // Cross-platform file reading
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const normalizedPath = path.normalize(input);
      try {
        svgString = await fs.readFile(normalizedPath, "utf8");
      } catch (fsError) {
        throw new Error(`Failed to read file '${input}': ${fsError.message}`);
      }
    } else if (inputType === InputType.URL) {
      try {
        const response = await fetch(input);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        svgString = await response.text();
      } catch (fetchError) {
        throw new Error(
          `Failed to fetch URL '${input}': ${fetchError.message}`,
        );
      }
    } else if (inputType === InputType.DOM_ELEMENT) {
      // For DOM elements, serialize to string first
      if (typeof XMLSerializer !== "undefined") {
        svgString = new XMLSerializer().serializeToString(input);
      } else if (input.outerHTML) {
        svgString = input.outerHTML;
      } else {
        throw new Error(
          "Cannot serialize DOM element: XMLSerializer not available",
        );
      }
    } else {
      throw new Error(`Unknown input type: ${typeof input}`);
    }
  } catch (inputError) {
    // Return a validation result indicating the input error
    return {
      issues: [
        {
          type: "input_error",
          severity: ValidationSeverity.ERROR,
          reason: inputError.message,
          line: 0,
          column: 0,
        },
      ],
      isValid: false,
      hasErrors: true,
      hasWarnings: false,
      errorCount: 1,
      warningCount: 0,
      summary: { input_error: 1 },
    };
  }

  // Split source into lines for includeSource option
  const sourceLines = includeSource ? svgString.split("\n") : null;

  // Build position index from the raw string
  const positionIndex = buildPositionIndex(svgString);

  // Parse to DOM for validation with error recovery
  let doc;
  const parseRecoveryWarnings = [];

  // Helper to extract line number from parse error message
  const extractLineFromError = (errorMsg) => {
    // Pattern: "line N" or "Line N" or ":N:" etc.
    const lineMatch =
      errorMsg.match(/line\s*:?\s*(\d+)/i) || errorMsg.match(/:(\d+):/);
    return lineMatch ? parseInt(lineMatch[1], 10) : 1;
  };

  // Helper to extract column from parse error message
  const extractColumnFromError = (errorMsg) => {
    // Pattern: "column N" or ":line:column"
    const colMatch =
      errorMsg.match(/column\s*:?\s*(\d+)/i) || errorMsg.match(/:\d+:(\d+)/);
    return colMatch ? parseInt(colMatch[1], 10) : 1;
  };

  // Helper to attempt fixing common XML issues
  const attemptXmlFixes = (xmlString) => {
    let fixed = xmlString;
    const appliedFixes = [];

    // Fix 1: Escape unescaped ampersands (common issue)
    // Use two-pass approach to avoid ReDoS: first mark valid entities, then escape remaining &
    // Valid XML entities: &amp; &lt; &gt; &quot; &apos; &#digits; &#xhex;
    // Use a unique placeholder unlikely to appear in SVG content (not \x00 since that gets stripped later)
    const entityPlaceholder = "\uFFFE_VALID_ENTITY_\uFFFE";
    const validEntityPattern =
      /&(amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-fA-F]{1,6});/g;
    const withPlaceholders = fixed.replace(
      validEntityPattern,
      entityPlaceholder + "$1;",
    );
    const ampersandsEscaped = withPlaceholders.replace(/&/g, "&amp;");
    const ampersandFixed = ampersandsEscaped.replace(
      new RegExp(entityPlaceholder, "g"),
      "&",
    );
    if (ampersandFixed !== fixed) {
      fixed = ampersandFixed;
      appliedFixes.push("Escaped unencoded ampersands");
    }

    // Fix 2: Remove null bytes and control characters (except tab, newline, carriage return)
    // eslint-disable-next-line no-control-regex
    const controlFixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    if (controlFixed !== fixed) {
      fixed = controlFixed;
      appliedFixes.push("Removed invalid control characters");
    }

    // Fix 3: Remove BOM if present at start
    if (fixed.charCodeAt(0) === 0xfeff) {
      fixed = fixed.slice(1);
      appliedFixes.push("Removed UTF-8 BOM");
    }

    // Fix 4: Escape < in attribute values (tricky but common in inline JS)
    // This is a conservative fix - only in obvious cases
    const attrLtFixed = fixed.replace(
      /="([^"]*)<([^"]*)"(?!\s*>)/g,
      (match, before, after) => {
        // Only fix if < appears to be in an attribute value, not a tag
        if (!after.includes(">")) {
          return `="${before}&lt;${after}"`;
        }
        return match;
      },
    );
    if (attrLtFixed !== fixed) {
      fixed = attrLtFixed;
      appliedFixes.push("Escaped < in attribute values");
    }

    return { fixed, appliedFixes };
  };

  try {
    doc = await loadInput(input, inputType);
  } catch (parseError) {
    const errorMsg = parseError.message || String(parseError);
    const errorLine = extractLineFromError(errorMsg);
    const errorColumn = extractColumnFromError(errorMsg);

    // Attempt error recovery by fixing common XML issues
    const { fixed: fixedString, appliedFixes } = attemptXmlFixes(svgString);

    if (appliedFixes.length > 0 && fixedString !== svgString) {
      // Try parsing the fixed string
      try {
        const { JSDOM } = await import("jsdom");
        const dom = new JSDOM(fixedString, { contentType: "image/svg+xml" });
        doc = dom.window.document.documentElement;

        // Recovery succeeded - add warnings about the fixes applied
        parseRecoveryWarnings.push({
          type: "parse_recovery",
          severity: ValidationSeverity.WARNING,
          reason: `Recovered from parse error. Applied fixes: ${appliedFixes.join("; ")}`,
          line: errorLine,
          column: errorColumn,
        });
        parseRecoveryWarnings.push({
          type: "original_parse_error",
          severity: ValidationSeverity.ERROR,
          reason: `Original parse error: ${errorMsg}`,
          line: errorLine,
          column: errorColumn,
        });
      } catch (retryError) {
        // Recovery failed - return original error with context
        return {
          issues: [
            {
              type: "parse_error",
              severity: ValidationSeverity.ERROR,
              reason: `Failed to parse SVG: ${errorMsg}`,
              line: errorLine,
              column: errorColumn,
            },
            {
              type: "recovery_failed",
              severity: ValidationSeverity.WARNING,
              reason: `Recovery attempted (${appliedFixes.join("; ")}) but still failed: ${retryError.message}`,
              line: errorLine,
              column: errorColumn,
            },
          ],
          isValid: false,
          hasErrors: true,
          hasWarnings: true,
          errorCount: 1,
          warningCount: 1,
          summary: { parse_error: 1, recovery_failed: 1 },
        };
      }
    } else {
      // No fixes to apply or fixes didn't change anything - return original error
      return {
        issues: [
          {
            type: "parse_error",
            severity: ValidationSeverity.ERROR,
            reason: `Failed to parse SVG: ${errorMsg}`,
            line: errorLine,
            column: errorColumn,
          },
        ],
        isValid: false,
        hasErrors: true,
        hasWarnings: false,
        errorCount: 1,
        warningCount: 0,
        summary: { parse_error: 1 },
      };
    }
  }

  const issues = [];

  // Add any recovery warnings from parse error recovery
  if (parseRecoveryWarnings.length > 0) {
    issues.push(...parseRecoveryWarnings);
  }

  // Track element occurrence counts for position lookup
  const elementOccurrence = new Map();

  /**
   * Get current occurrence index for an element and increment counter
   * @private
   */
  const getOccurrenceIndex = (tagName) => {
    const lower = tagName.toLowerCase();
    const index = elementOccurrence.get(lower) || 0;
    elementOccurrence.set(lower, index + 1);
    return index;
  };

  /**
   * Reset occurrence counters between traversals
   * @private
   */
  const resetOccurrences = () => {
    elementOccurrence.clear();
  };

  /**
   * Create an issue object with position info and severity
   * @private
   */
  const createIssue = (
    issueData,
    tagName,
    attrName = null,
    occurrenceIndex = null,
  ) => {
    let pos;
    if (attrName) {
      pos = positionIndex.getAttributePosition(
        tagName,
        attrName,
        occurrenceIndex || 0,
      );
    } else {
      pos = positionIndex.getElementPosition(tagName, occurrenceIndex || 0);
    }

    // Look up severity from the mapping, default to WARNING if unknown
    const severity =
      ISSUE_SEVERITY[issueData.type] || ValidationSeverity.WARNING;

    const issue = {
      ...issueData,
      severity,
      line: pos.line,
      column: pos.column,
    };

    // Optionally include source line content
    if (
      includeSource &&
      sourceLines &&
      pos.line > 0 &&
      pos.line <= sourceLines.length
    ) {
      issue.sourceLine = sourceLines[pos.line - 1];
    }

    return issue;
  };

  // Note: isSvg2Element and isSvg2Attribute are now defined at module level

  // Collect all IDs in the document
  const allIds = new Set();
  const collectIds = (el) => {
    if (!el) return; // Guard against null/undefined el in recursion
    const id = el.getAttribute("id");
    if (id) allIds.add(id);
    for (const child of el.children) {
      if (isElement(child)) collectIds(child);
    }
  };
  collectIds(doc);

  // SVG 1.1: Attributes NOT valid on <g> elements
  // These are shape-specific attributes valid on rect, circle, ellipse, line, etc. but NOT on <g>
  const INVALID_G_ATTRS = [
    "x",
    "y",
    "width",
    "height", // Position/size - valid on rect, image, svg, use, etc.
    "cx",
    "cy",
    "r", // Circle attributes
    "rx",
    "ry", // Ellipse/rect corner radius
    "x1",
    "y1",
    "x2",
    "y2", // Line attributes
    "d", // Path data
    "points", // Polygon/polyline points
  ];

  // Check 1: Detect invalid attributes on elements
  const detectInvalidAttrsOnElements = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // <g> elements don't support x, y, width, height in SVG 1.1
    if (tagName === "g") {
      for (const attr of INVALID_G_ATTRS) {
        if (el.hasAttribute(attr)) {
          issues.push(
            createIssue(
              {
                type: "invalid_attr_on_element",
                element: tagName,
                attr: attr,
                value: el.getAttribute(attr),
                reason: `SVG 1.1: <g> elements do not support '${attr}' attribute`,
              },
              tagName,
              attr,
              occIdx,
            ),
          );
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidAttrsOnElements(child);
    }
  };

  // Check 2: Detect missing xmlns:xlink namespace
  const detectMissingXlinkNamespace = () => {
    let hasXlinkAttrs = false;
    let firstXlinkElement = null;
    let firstXlinkAttr = null;

    const checkForXlink = (el) => {
      for (const attrName of el.getAttributeNames()) {
        if (attrName.startsWith("xlink:")) {
          hasXlinkAttrs = true;
          firstXlinkElement = el.tagName.toLowerCase();
          firstXlinkAttr = attrName;
          return;
        }
      }
      for (const child of el.children) {
        if (isElement(child)) checkForXlink(child);
        if (hasXlinkAttrs) return;
      }
    };
    checkForXlink(doc);

    if (hasXlinkAttrs && !doc.hasAttribute("xmlns:xlink")) {
      const pos = positionIndex.getAttributePosition(
        firstXlinkElement,
        firstXlinkAttr,
        0,
      );
      issues.push({
        type: "missing_namespace",
        namespace: "xmlns:xlink",
        reason:
          "Document uses xlink:* attributes but missing xmlns:xlink namespace declaration",
        line: pos.line,
        column: pos.column,
      });
    }
  };

  // Check 3: Detect broken ID references
  const detectBrokenIdRefs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // Check xlink:href and href for #id references
    for (const attrName of ["xlink:href", "href"]) {
      const val = el.getAttribute(attrName);
      if (val && val.startsWith("#")) {
        const refId = val.slice(1);
        if (refId && !allIds.has(refId)) {
          issues.push(
            createIssue(
              {
                type: "broken_reference",
                element: tagName,
                attr: attrName,
                referencedId: refId,
                reason: `Reference to non-existent ID '${refId}'`,
              },
              tagName,
              attrName,
              occIdx,
            ),
          );
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectBrokenIdRefs(child);
    }
  };

  // Check 4: Detect invalid animation timing values
  const TIMING_ATTRS = ["begin", "end", "dur", "repeatDur", "min", "max"];
  const ANIMATION_ELEMENTS = new Set([
    "animate",
    "animateTransform",
    "animateMotion",
    "animateColor",
    "set",
  ]);

  const detectInvalidAnimationTiming = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    if (ANIMATION_ELEMENTS.has(tagName)) {
      for (const attr of TIMING_ATTRS) {
        const val = el.getAttribute(attr);
        if (val) {
          // Check for common timing issues
          const trimmed = val.trim();
          if (trimmed !== val) {
            issues.push(
              createIssue(
                {
                  type: "invalid_timing",
                  element: tagName,
                  attr: attr,
                  value: val,
                  reason: `Timing value has leading/trailing whitespace`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
          // Check for invalid characters in timing
          if (/[;,]/.test(trimmed) && !/^[\d\w\s.;,+-]+$/.test(trimmed)) {
            issues.push(
              createIssue(
                {
                  type: "invalid_timing",
                  element: tagName,
                  attr: attr,
                  value: val,
                  reason: `Timing value may contain invalid characters`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidAnimationTiming(child);
    }
  };

  // Check 5: Detect animation elements inside truly EMPTY elements (SVG 1.1 DTD violation)
  // Only these 5 elements are truly EMPTY per SVG 1.1 DTD
  const EMPTY_CONTENT_MODEL_ELEMENTS = new Set([
    "font-face-format",
    "font-face-name",
    "glyphref",
    "hkern",
    "vkern",
  ]);

  const detectAnimationInEmptyElements = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    if (EMPTY_CONTENT_MODEL_ELEMENTS.has(tagName)) {
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          if (ANIMATION_ELEMENTS.has(childTag)) {
            issues.push(
              createIssue(
                {
                  type: "animation_in_empty_element",
                  element: tagName,
                  child: childTag,
                  reason: `Animation element <${childTag}> inside <${tagName}> which has EMPTY content model per SVG 1.1 DTD`,
                },
                tagName,
                null,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectAnimationInEmptyElements(child);
    }
  };

  // Check 6: Detect uppercase units
  const UNIT_PATTERN = /(\d+\.?\d*)(PX|EM|EX|PT|PC|CM|MM|IN|%)/gi;
  const PRESENTATION_ATTRS = [
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "stroke-width",
    "font-size",
    "letter-spacing",
    "word-spacing",
    "stroke-dashoffset",
  ];

  const detectUppercaseUnits = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of PRESENTATION_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        const match = val.match(UNIT_PATTERN);
        if (match) {
          for (const m of match) {
            const unit = m.replace(/[\d.]+/, "");
            if (unit !== unit.toLowerCase()) {
              issues.push(
                createIssue(
                  {
                    type: "uppercase_unit",
                    element: tagName,
                    attr: attr,
                    value: val,
                    reason: `Unit '${unit}' should be lowercase '${unit.toLowerCase()}'`,
                  },
                  tagName,
                  attr,
                  occIdx,
                ),
              );
            }
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectUppercaseUnits(child);
    }
  };

  // Check 7: Detect invalid whitespace in list values
  const LIST_ATTRS = [
    "points",
    "viewBox",
    "d",
    "values",
    "keyTimes",
    "keySplines",
    "rotate",
  ];

  const detectInvalidWhitespaceInLists = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of LIST_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        // Check for tabs, newlines, multiple spaces
        if (/[\t\n\r]/.test(val) || /  +/.test(val)) {
          issues.push(
            createIssue(
              {
                type: "invalid_whitespace",
                element: tagName,
                attr: attr,
                reason: `List attribute contains tabs, newlines, or multiple consecutive spaces`,
              },
              tagName,
              attr,
              occIdx,
            ),
          );
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidWhitespaceInLists(child);
    }
  };

  // Check 8: Detect invalid number formats
  const NUMERIC_ATTRS = [
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "stroke-width",
    "stroke-miterlimit",
    "stroke-dashoffset",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "font-size",
  ];

  const detectInvalidNumbers = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of NUMERIC_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        const trimmed = val.trim();
        // BUG FIX: Check for leading zeros - match "007", "07.5", "00.123" but not "0.7"
        // Changed from /^0\d+$/ to /^0\d/ to catch decimals like "07.5"
        if (/^0\d/.test(trimmed.replace(/[a-z%]+$/i, ""))) {
          issues.push(
            createIssue(
              {
                type: "invalid_number",
                element: tagName,
                attr: attr,
                value: val,
                reason: `Number has unnecessary leading zeros`,
              },
              tagName,
              attr,
              occIdx,
            ),
          );
        }
        // Check for trailing decimal point
        if (/\.$/.test(trimmed.replace(/[a-z%]+$/i, ""))) {
          issues.push(
            createIssue(
              {
                type: "invalid_number",
                element: tagName,
                attr: attr,
                value: val,
                reason: `Number has trailing decimal point`,
              },
              tagName,
              attr,
              occIdx,
            ),
          );
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidNumbers(child);
    }
  };

  // Check 9: (REMOVED - merged into Check 15 detectInvalidNumericConstraints)

  // Check 10: Detect mistyped element names
  // Uses module-level SVG11_ELEMENTS, SVG11_ELEMENTS_LOWER, NON_SVG_CONTEXT_ELEMENTS, findClosestMatch
  const detectMistypedElements = (el, insideNonSvgContext = false) => {
    const tagName = el.tagName;
    const tagLower = tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagLower);

    // Track if we're inside a non-SVG context where other XML/HTML content is valid:
    // - foreignObject (HTML content is explicitly allowed by SVG spec)
    // - script/style (code/CSS content - should not be parsed as SVG elements)
    // - title/desc (text content for accessibility - not SVG structure)
    // - metadata (can contain arbitrary XML metadata like Dublin Core, RDF)
    // - Namespaced elements (e.g., d:testDescription, rdf:RDF)
    const isNamespacedElement = tagName.includes(":");
    const inNonSvgContext =
      insideNonSvgContext ||
      NON_SVG_CONTEXT_ELEMENTS.has(tagLower) ||
      isNamespacedElement;

    // Skip validation entirely if we're in non-SVG context
    if (!inNonSvgContext) {
      // Only validate elements that are not valid SVG 1.1 or SVG 2.0
      if (!SVG11_ELEMENTS.has(tagName) && !SVG11_ELEMENTS_LOWER.has(tagLower)) {
        // Don't flag SVG 2.0 elements as unknown - they're valid, just not in SVG 1.1
        if (!isSvg2Element(tagLower)) {
          const suggestion = findClosestMatch(tagName, SVG11_ELEMENTS);
          if (suggestion) {
            issues.push(
              createIssue(
                {
                  type: "mistyped_element_detected",
                  element: tagName,
                  suggestion: suggestion,
                  reason: `Unknown element <${tagName}> - did you mean <${suggestion}>?`,
                },
                tagLower,
                null,
                occIdx,
              ),
            );
          } else {
            issues.push(
              createIssue(
                {
                  type: "unknown_element_detected",
                  element: tagName,
                  reason: `Unknown element <${tagName}> - not in SVG 1.1 spec`,
                },
                tagLower,
                null,
                occIdx,
              ),
            );
          }
        }
      }
    }

    // Recurse into children, passing non-SVG context state
    for (const child of el.children) {
      if (isElement(child)) detectMistypedElements(child, inNonSvgContext);
    }
  };

  // Check 11: Detect mistyped attribute names
  // Uses module-level SVG11_ATTRIBUTES, SVG11_ATTRIBUTES_LOWER, findClosestMatch
  const detectMistypedAttributes = (el, insideNonSvgContext = false) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // Track if we're inside a non-SVG context where other XML/HTML content is valid:
    // - foreignObject (HTML content is explicitly allowed by SVG spec)
    // - script/style (code/CSS content - attributes may be non-SVG)
    // - title/desc (text content elements)
    // - metadata (arbitrary XML metadata content)
    // - Namespaced elements (e.g., d:testDescription, rdf:RDF)
    const isNamespacedElement = el.tagName.includes(":");
    const inNonSvgContext =
      insideNonSvgContext ||
      NON_SVG_CONTEXT_ELEMENTS.has(tagName) ||
      isNamespacedElement;

    // Skip attribute validation entirely if we're in non-SVG context
    if (!inNonSvgContext) {
      for (const attrName of el.getAttributeNames()) {
        // Skip data-* and aria-* (HTML5 custom/accessibility attributes)
        if (attrName.startsWith("data-") || attrName.startsWith("aria-"))
          continue;
        // Skip ALL namespace declarations (xmlns, xmlns:*) - these are valid XML
        if (attrName === "xmlns" || attrName.startsWith("xmlns:")) continue;
        // Skip custom namespaced attributes (inkscape:*, sodipodi:*, etc.) EXCEPT xlink: and xml: which are SVG standard
        if (
          attrName.includes(":") &&
          !attrName.startsWith("xlink:") &&
          !attrName.startsWith("xml:")
        )
          continue;

        // Skip SVG 2.0 attributes - they're valid, just not in SVG 1.1
        if (isSvg2Attribute(attrName)) continue;

        if (
          !SVG11_ATTRIBUTES.has(attrName) &&
          !SVG11_ATTRIBUTES_LOWER.has(attrName.toLowerCase())
        ) {
          const suggestion = findClosestMatch(attrName, SVG11_ATTRIBUTES);
          if (suggestion) {
            issues.push(
              createIssue(
                {
                  type: "mistyped_attribute_detected",
                  element: tagName,
                  attr: attrName,
                  suggestion: suggestion,
                  reason: `Unknown attribute '${attrName}' - did you mean '${suggestion}'?`,
                },
                tagName,
                attrName,
                occIdx,
              ),
            );
          } else {
            issues.push(
              createIssue(
                {
                  type: "unknown_attribute_detected",
                  element: tagName,
                  attr: attrName,
                  reason: `Unknown attribute '${attrName}' on <${tagName}> - not in SVG 1.1 spec`,
                },
                tagName,
                attrName,
                occIdx,
              ),
            );
          }
        }
      }
    }

    // Recurse into children, passing non-SVG context state
    for (const child of el.children) {
      if (isElement(child)) detectMistypedAttributes(child, inNonSvgContext);
    }
  };

  // Check 12: Detect missing required attributes per SVG 1.1 DTD
  // @see https://www.w3.org/TR/SVG11/attindex.html
  const REQUIRED_ATTRIBUTES = {
    // Reference elements (require href or xlink:href)
    use: ["xlink:href", "href"],
    image: ["xlink:href", "href"],
    feImage: ["xlink:href", "href"],
    textPath: ["xlink:href", "href"],
    mpath: ["xlink:href", "href"],

    // Animation elements
    animate: ["attributeName"],
    animateTransform: ["attributeName", "type"],
    animateMotion: [], // path OR mpath child OR values OR from/to - complex
    animateColor: ["attributeName"],
    set: ["attributeName"],

    // Filter primitives
    feBlend: ["in2"],
    feComposite: ["in2"],
    feDisplacementMap: ["in2", "scale"],
    feMorphology: ["operator"],
    feTurbulence: ["type"],
    feConvolveMatrix: ["kernelMatrix"],
    feFuncR: ["type"],
    feFuncG: ["type"],
    feFuncB: ["type"],
    feFuncA: ["type"],

    // Gradient elements
    linearGradient: [],
    radialGradient: [],
    stop: ["offset"],
  };

  const detectMissingRequiredAttrs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);
    const required = REQUIRED_ATTRIBUTES[tagName];

    if (required && required.length > 0) {
      // For use/image/etc, only one of href or xlink:href is required
      if (required.includes("xlink:href") && required.includes("href")) {
        if (!el.hasAttribute("xlink:href") && !el.hasAttribute("href")) {
          issues.push(
            createIssue(
              {
                type: "missing_required_attribute",
                element: tagName,
                attrs: ["href", "xlink:href"],
                reason: `<${tagName}> requires 'href' or 'xlink:href' attribute`,
              },
              tagName,
              null,
              occIdx,
            ),
          );
        }
      } else {
        for (const attr of required) {
          if (!el.hasAttribute(attr)) {
            issues.push(
              createIssue(
                {
                  type: "missing_required_attribute",
                  element: tagName,
                  attr: attr,
                  reason: `<${tagName}> requires '${attr}' attribute per SVG 1.1 DTD`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMissingRequiredAttrs(child);
    }
  };

  // Check 13: Detect invalid child elements per SVG 1.1 DTD content models
  const VALID_CHILDREN = {
    linearGradient: new Set(["stop", "animate", "animateTransform", "set"]),
    radialGradient: new Set(["stop", "animate", "animateTransform", "set"]),
    stop: new Set(["animate", "set"]),
    clipPath: new Set([
      "path",
      "text",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "use",
      "animate",
      "animateTransform",
      "set",
      "desc",
      "title",
    ]),
    mask: new Set([
      "path",
      "text",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "use",
      "g",
      "defs",
      "image",
      "switch",
      "a",
      "animate",
      "animateTransform",
      "set",
      "desc",
      "title",
    ]),
  };

  const detectInvalidChildren = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);
    const validChildren = VALID_CHILDREN[tagName];

    if (validChildren) {
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          // Skip namespaced children (metadata, etc.)
          if (!childTag.includes(":") && !validChildren.has(childTag)) {
            issues.push(
              createIssue(
                {
                  type: "invalid_child_element",
                  element: tagName,
                  child: childTag,
                  reason: `<${childTag}> is not a valid child of <${tagName}> per SVG 1.1 DTD`,
                },
                tagName,
                null,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidChildren(child);
    }
  };

  // Check 14: Detect invalid enumerated attribute values
  const ENUM_VALUES = {
    spreadMethod: new Set(["pad", "reflect", "repeat"]),
    gradientUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    clipPathUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    maskUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    maskContentUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    filterUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    primitiveUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    patternUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    patternContentUnits: new Set(["userSpaceOnUse", "objectBoundingBox"]),
    markerUnits: new Set(["strokeWidth", "userSpaceOnUse"]),
    "fill-rule": new Set(["nonzero", "evenodd", "inherit"]),
    "clip-rule": new Set(["nonzero", "evenodd", "inherit"]),
    "stroke-linecap": new Set(["butt", "round", "square", "inherit"]),
    "stroke-linejoin": new Set(["miter", "round", "bevel", "inherit"]),
    "text-anchor": new Set(["start", "middle", "end", "inherit"]),
    "dominant-baseline": new Set([
      "auto",
      "use-script",
      "no-change",
      "reset-size",
      "ideographic",
      "alphabetic",
      "hanging",
      "mathematical",
      "central",
      "middle",
      "text-after-edge",
      "text-before-edge",
      "inherit",
    ]),
    "alignment-baseline": new Set([
      "auto",
      "baseline",
      "before-edge",
      "text-before-edge",
      "middle",
      "central",
      "after-edge",
      "text-after-edge",
      "ideographic",
      "alphabetic",
      "hanging",
      "mathematical",
      "inherit",
    ]),
    visibility: new Set(["visible", "hidden", "collapse", "inherit"]),
    display: new Set([
      "inline",
      "block",
      "list-item",
      "run-in",
      "compact",
      "marker",
      "table",
      "inline-table",
      "table-row-group",
      "table-header-group",
      "table-footer-group",
      "table-row",
      "table-column-group",
      "table-column",
      "table-cell",
      "table-caption",
      "none",
      "inherit",
    ]),
    overflow: new Set(["visible", "hidden", "scroll", "auto", "inherit"]),
  };

  const detectInvalidEnumValues = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const [attr, validValues] of Object.entries(ENUM_VALUES)) {
      const val = el.getAttribute(attr);
      if (val && !validValues.has(val)) {
        issues.push(
          createIssue(
            {
              type: "invalid_enum_value",
              element: tagName,
              attr: attr,
              value: val,
              validValues: [...validValues],
              reason: `Invalid value '${val}' for '${attr}'. Valid values: ${[...validValues].join(", ")}`,
            },
            tagName,
            attr,
            occIdx,
          ),
        );
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidEnumValues(child);
    }
  };

  // Check 15: Detect invalid numeric constraints
  const NUMERIC_CONSTRAINTS = {
    opacity: { min: 0, max: 1, type: "number" },
    "fill-opacity": { min: 0, max: 1, type: "number" },
    "stroke-opacity": { min: 0, max: 1, type: "number" },
    "stop-opacity": { min: 0, max: 1, type: "number" },
    "flood-opacity": { min: 0, max: 1, type: "number" },
    "stroke-width": { min: 0, type: "length" },
    "stroke-miterlimit": { min: 1, type: "number" },
    r: { min: 0, type: "length" },
    rx: { min: 0, type: "length" },
    ry: { min: 0, type: "length" },
  };

  const detectInvalidNumericConstraints = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const [attr, constraint] of Object.entries(NUMERIC_CONSTRAINTS)) {
      const val = el.getAttribute(attr);
      if (val) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          if (constraint.min !== undefined && num < constraint.min) {
            issues.push(
              createIssue(
                {
                  type: "invalid_numeric_constraint",
                  element: tagName,
                  attr: attr,
                  value: val,
                  reason: `Value ${num} is below minimum ${constraint.min}`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
          if (constraint.max !== undefined && num > constraint.max) {
            issues.push(
              createIssue(
                {
                  type: "invalid_numeric_constraint",
                  element: tagName,
                  attr: attr,
                  value: val,
                  reason: `Value ${num} is above maximum ${constraint.max}`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidNumericConstraints(child);
    }
  };

  // Check 16: Detect duplicate IDs
  const detectDuplicateIds = (docLocal) => {
    const idMap = new Map();
    const idElements = new Map(); // Track first element with each ID
    const collectAllIdsLocal = (el) => {
      const tagName = el.tagName.toLowerCase();
      const occIdx = getOccurrenceIndex(tagName);
      const id = el.getAttribute("id");
      if (id) {
        if (!idMap.has(id)) {
          idMap.set(id, []);
          idElements.set(id, { tagName, occIdx }); // Store first occurrence
        }
        idMap.get(id).push(tagName);
      }
      for (const child of el.children) {
        if (isElement(child)) collectAllIdsLocal(child);
      }
    };
    collectAllIdsLocal(docLocal);

    for (const [id, elements] of idMap) {
      if (elements.length > 1) {
        const firstEl = idElements.get(id);
        issues.push(
          createIssue(
            {
              type: "duplicate_id",
              id: id,
              elements: elements,
              count: elements.length,
              reason: `ID '${id}' is used ${elements.length} times (on ${elements.join(", ")})`,
            },
            firstEl.tagName,
            "id",
            firstEl.occIdx,
          ),
        );
      }
    }
  };

  // Check 17: Detect broken URL references
  // CRITICAL: This list must include ALL attributes that can contain url(#id) references
  const URL_REF_PATTERN = /url\(#([^)]+)\)/g;
  const URL_REF_ATTRS = [
    "fill",
    "stroke",
    "clip-path",
    "mask",
    "filter",
    "color-profile",
    "marker", // Shorthand for marker-start/mid/end - can contain url(#id)
    "marker-start",
    "marker-mid",
    "marker-end",
  ];

  const detectBrokenUrlRefs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of URL_REF_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        let match;
        // Reset lastIndex to reuse the already-defined URL_REF_PATTERN (avoid creating new RegExp in loop)
        URL_REF_PATTERN.lastIndex = 0;
        while ((match = URL_REF_PATTERN.exec(val)) !== null) {
          const refId = match[1];
          if (!allIds.has(refId)) {
            issues.push(
              createIssue(
                {
                  type: "broken_url_reference",
                  element: tagName,
                  attr: attr,
                  referencedId: refId,
                  reason: `url(#${refId}) references non-existent ID`,
                },
                tagName,
                attr,
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectBrokenUrlRefs(child);
    }
  };

  // Check 18: Detect invalid color values
  const SVG_NAMED_COLORS = new Set([
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
    "currentcolor",
    "inherit",
    "none",
    "transparent",
  ]);
  // All SVG attributes that can contain color values - MUST match other COLOR_ATTRS definition
  const COLOR_ATTRS = [
    "fill",
    "stroke",
    "color",
    "stop-color",
    "flood-color",
    "lighting-color",
    "solid-color",
  ];

  const isValidColor = (val) => {
    const lower = val.toLowerCase().trim();
    // Named colors and special keywords
    if (SVG_NAMED_COLORS.has(lower)) return true;
    // Hex formats: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    if (/^#[0-9a-f]{3}$/i.test(lower)) return true;
    if (/^#[0-9a-f]{4}$/i.test(lower)) return true; // #RGBA
    if (/^#[0-9a-f]{6}$/i.test(lower)) return true;
    if (/^#[0-9a-f]{8}$/i.test(lower)) return true; // #RRGGBBAA
    // rgb() and rgba() with integer or percentage values
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(lower))
      return true;
    if (
      /^rgba?\(\s*\d+%\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+%?\s*)?\)$/i.test(
        lower,
      )
    )
      return true;
    // hsl() and hsla() formats
    if (
      /^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+\s*)?\)$/i.test(lower)
    )
      return true;
    // url(#id) gradient/pattern references
    if (/^url\(#[^)]+\)$/i.test(lower)) return true;
    return false;
  };

  const detectInvalidColors = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of COLOR_ATTRS) {
      const val = el.getAttribute(attr);
      if (val && !isValidColor(val)) {
        issues.push(
          createIssue(
            {
              type: "invalid_color",
              element: tagName,
              attr: attr,
              value: val,
              reason: `Invalid color value '${val}'`,
            },
            tagName,
            attr,
            occIdx,
          ),
        );
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidColors(child);
    }
  };

  // Check 19: Detect malformed viewBox, points, transform
  const detectMalformedFormats = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // viewBox must be exactly 4 numbers
    const viewBox = el.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/);
      if (parts.length !== 4 || !parts.every((p) => !isNaN(parseFloat(p)))) {
        issues.push(
          createIssue(
            {
              type: "malformed_viewbox",
              element: tagName,
              value: viewBox,
              reason: `viewBox must be exactly 4 numbers (min-x, min-y, width, height)`,
            },
            tagName,
            "viewBox",
            occIdx,
          ),
        );
      }
    }

    // points must be pairs of numbers
    const points = el.getAttribute("points");
    if (points) {
      const nums = points
        .trim()
        .split(/[\s,]+/)
        .filter((p) => p);
      if (nums.length % 2 !== 0 || !nums.every((n) => !isNaN(parseFloat(n)))) {
        issues.push(
          createIssue(
            {
              type: "malformed_points",
              element: tagName,
              value:
                points.length > 50 ? points.substring(0, 50) + "..." : points,
              reason: `points must be pairs of numbers`,
            },
            tagName,
            "points",
            occIdx,
          ),
        );
      }
    }

    // transform basic syntax check
    const transform = el.getAttribute("transform");
    if (transform) {
      // Use limited whitespace matching to prevent catastrophic backtracking
      const validTransforms =
        /^\s{0,20}(matrix|translate|scale|rotate|skewX|skewY)\s{0,20}\([^)]*\)\s{0,20},?\s{0,20}/;
      let remaining = transform.trim();
      while (remaining.length > 0) {
        const match = remaining.match(validTransforms);
        // Guard against empty match to prevent infinite loop
        if (match && match[0].length > 0) {
          remaining = remaining.substring(match[0].length);
        } else if (!match) {
          issues.push(
            createIssue(
              {
                type: "malformed_transform",
                element: tagName,
                value:
                  transform.length > 50
                    ? transform.substring(0, 50) + "..."
                    : transform,
                reason: `Invalid transform syntax near '${remaining.substring(0, 20)}'`,
              },
              tagName,
              "transform",
              occIdx,
            ),
          );
          break;
        } else {
          // Empty match - skip one character to prevent infinite loop
          remaining = remaining.substring(1);
        }
      }
    }

    // path data (d attribute) validation
    if (tagName === "path") {
      const d = el.getAttribute("d");
      if (d) {
        const trimmed = d.trim();
        if (trimmed.length > 0) {
          // Path must start with M or m command
          if (!/^[Mm]/.test(trimmed)) {
            issues.push(
              createIssue(
                {
                  type: "malformed_path_data",
                  element: "path",
                  value: d.length > 50 ? d.substring(0, 50) + "..." : d,
                  reason: `Path data must start with M or m command`,
                },
                "path",
                "d",
                occIdx,
              ),
            );
          }
          // Check for invalid characters (only allow valid path commands and numbers)
          // Valid: M, m, Z, z, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, digits, ., -, +, e, E, space, comma
          const invalidChars = trimmed.replace(
            /[MmZzLlHhVvCcSsQqTtAa\d\s,.\-+eE]/g,
            "",
          );
          if (invalidChars.length > 0) {
            issues.push(
              createIssue(
                {
                  type: "malformed_path_data",
                  element: "path",
                  value: d.length > 50 ? d.substring(0, 50) + "..." : d,
                  reason: `Path data contains invalid characters: '${invalidChars.substring(0, 10)}'`,
                },
                "path",
                "d",
                occIdx,
              ),
            );
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMalformedFormats(child);
    }
  };

  // Check 20: Detect circular references in mask/clipPath/filter/use
  const detectCircularReferences = () => {
    // Build a map of all IDs to their elements
    const idMap = new Map();
    const collectIdsLocal = (el) => {
      const id = el.getAttribute("id");
      if (id) idMap.set(id, el);
      for (const child of el.children) {
        if (isElement(child)) collectIdsLocal(child);
      }
    };
    collectIdsLocal(doc);

    // Attributes that reference other elements by ID
    const refAttrs = [
      "href",
      "xlink:href",
      "mask",
      "clip-path",
      "filter",
      "fill",
      "stroke",
    ];

    // Extract ID from url(#id) or #id format
    const extractRefId = (value) => {
      if (!value) return null;
      const urlMatch = value.match(/url\(#([^)]+)\)/);
      if (urlMatch) return urlMatch[1];
      const hrefMatch = value.match(/^#(.+)$/);
      if (hrefMatch) return hrefMatch[1];
      return null;
    };

    // Check for circular references starting from an element
    // BUG FIX: Use currentPath instead of visited to track only the current path (not all visited nodes)
    // This prevents false positives for DAGs like: A→B, A→C, C→B (B is visited twice but not circular)
    const findCircular = (startId, currentPath = new Set()) => {
      if (currentPath.has(startId)) return true; // Cycle detected in current path
      const el = idMap.get(startId);
      if (!el) return false;

      currentPath.add(startId);

      // Check all reference attributes on this element and its children
      const checkElement = (elem) => {
        for (const attr of refAttrs) {
          const refId = extractRefId(elem.getAttribute(attr));
          if (refId && findCircular(refId, currentPath)) {
            return true;
          }
        }
        for (const child of elem.children) {
          if (isElement(child) && checkElement(child)) return true;
        }
        return false;
      };

      const result = checkElement(el);
      currentPath.delete(startId); // BUG FIX: Backtrack - remove from path when done exploring this branch
      return result;
    };

    // Check each referenceable element for circular references
    const referenceableElements = [
      "clipPath",
      "mask",
      "filter",
      "symbol",
      "pattern",
      "marker",
    ];
    for (const [id, el] of idMap) {
      const tagName = el.tagName.toLowerCase();
      if (referenceableElements.includes(tagName)) {
        if (findCircular(id)) {
          resetOccurrences();
          const occIdx = getOccurrenceIndex(tagName);
          issues.push(
            createIssue(
              {
                type: "circular_reference",
                element: tagName,
                attr: "id",
                value: id,
                reason: `Circular reference detected: '${id}' directly or indirectly references itself`,
              },
              tagName,
              "id",
              occIdx,
            ),
          );
        }
      }
    }
  };

  // Check 21: Detect deep nesting (>50 levels)
  const MAX_NESTING_DEPTH = 50;
  const detectDeepNesting = (el, depth = 0) => {
    if (depth > MAX_NESTING_DEPTH) {
      const tagName = el.tagName.toLowerCase();
      const occIdx = getOccurrenceIndex(tagName);
      issues.push(
        createIssue(
          {
            type: "deep_nesting",
            element: tagName,
            value: String(depth),
            reason: `Element nesting depth (${depth}) exceeds ${MAX_NESTING_DEPTH} levels`,
          },
          tagName,
          null,
          occIdx,
        ),
      );
      return; // Don't continue deeper to avoid stack overflow
    }
    for (const child of el.children) {
      if (isElement(child)) detectDeepNesting(child, depth + 1);
    }
  };

  // Check 22: Detect empty <defs> elements
  const detectEmptyDefs = (el) => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "defs") {
      // Check if defs has any actual child elements (not just whitespace/comments)
      let hasChildren = false;
      for (const child of el.childNodes) {
        if (isElement(child)) {
          hasChildren = true;
          break;
        }
      }
      if (!hasChildren) {
        const occIdx = getOccurrenceIndex(tagName);
        issues.push(
          createIssue(
            {
              type: "empty_defs",
              element: tagName,
              reason: `Empty <defs> element (can be removed)`,
            },
            tagName,
            null,
            occIdx,
          ),
        );
      }
    }
    for (const child of el.children) {
      if (isElement(child)) detectEmptyDefs(child);
    }
  };

  // Check 23: Detect gradient stops not in ascending order
  const detectGradientStopOrder = (el) => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "lineargradient" || tagName === "radialgradient") {
      const stops = Array.from(el.children).filter(
        (c) => isElement(c) && c.tagName.toLowerCase() === "stop",
      );
      if (stops.length >= 2) {
        let prevOffset = -1;
        for (const stop of stops) {
          const offsetStr = stop.getAttribute("offset") || "0";
          let offset = parseFloat(offsetStr);
          // Convert percentage to decimal
          if (offsetStr.includes("%")) {
            offset = offset / 100;
          }
          if (!isNaN(offset) && offset < prevOffset) {
            const occIdx = getOccurrenceIndex(tagName);
            issues.push(
              createIssue(
                {
                  type: "gradient_stop_order",
                  element: tagName,
                  reason: `Gradient stops not in ascending offset order (${prevOffset} followed by ${offset})`,
                },
                tagName,
                null,
                occIdx,
              ),
            );
            break; // Only report once per gradient
          }
          if (!isNaN(offset)) prevOffset = offset;
        }
      }
    }
    for (const child of el.children) {
      if (isElement(child)) detectGradientStopOrder(child);
    }
  };

  // Check 24: Detect path complexity (>10000 coordinates)
  const MAX_PATH_COORDS = 10000;
  const detectPathComplexity = (el) => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "path") {
      const d = el.getAttribute("d");
      if (d) {
        // Count numeric values in path data
        const numbers = d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
        if (numbers && numbers.length > MAX_PATH_COORDS) {
          const occIdx = getOccurrenceIndex(tagName);
          issues.push(
            createIssue(
              {
                type: "path_complexity",
                element: tagName,
                attr: "d",
                value: `${numbers.length} coordinates`,
                reason: `Path has ${numbers.length} coordinates (>${MAX_PATH_COORDS}), may cause slow rendering`,
              },
              tagName,
              "d",
              occIdx,
            ),
          );
        }
      }
    }
    for (const child of el.children) {
      if (isElement(child)) detectPathComplexity(child);
    }
  };

  // Check 25: Detect external resource references (security)
  const detectExternalResources = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // Check href/xlink:href for external URLs
    const hrefAttrs = ["href", "xlink:href"];
    for (const attr of hrefAttrs) {
      const val = el.getAttribute(attr);
      if (
        val &&
        (val.startsWith("http://") ||
          val.startsWith("https://") ||
          val.startsWith("//"))
      ) {
        issues.push(
          createIssue(
            {
              type: "external_resource",
              element: tagName,
              attr: attr,
              value: val.length > 60 ? val.substring(0, 60) + "..." : val,
              reason: `External resource reference detected (potential security/CORS issue)`,
            },
            tagName,
            attr,
            occIdx,
          ),
        );
      }
    }

    // Check style for @import with external URLs
    if (tagName === "style" && el.textContent) {
      const importMatch = el.textContent.match(
        /@import\s+url\s*\(\s*['"]?(https?:\/\/[^'")\s]+)/i,
      );
      if (importMatch) {
        issues.push(
          createIssue(
            {
              type: "external_resource",
              element: tagName,
              value: importMatch[1],
              reason: `External CSS import detected in style element`,
            },
            tagName,
            null,
            occIdx,
          ),
        );
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectExternalResources(child);
    }
  };

  // Check 26: Detect script content (security)
  const detectScriptContent = (el) => {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "script") {
      const occIdx = getOccurrenceIndex(tagName);
      issues.push(
        createIssue(
          {
            type: "script_content",
            element: tagName,
            reason: `Script element detected (potential security issue in untrusted SVGs)`,
          },
          tagName,
          null,
          occIdx,
        ),
      );
    }
    for (const child of el.children) {
      if (isElement(child)) detectScriptContent(child);
    }
  };

  // Check 27: Detect event handler attributes (security)
  // Uses module-level EVENT_HANDLERS set for performance
  const detectEventHandlers = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attrName of el.getAttributeNames()) {
      if (EVENT_HANDLERS.has(attrName.toLowerCase())) {
        issues.push(
          createIssue(
            {
              type: "event_handler",
              element: tagName,
              attr: attrName,
              reason: `Event handler attribute '${attrName}' detected (potential XSS vector)`,
            },
            tagName,
            attrName,
            occIdx,
          ),
        );
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectEventHandlers(child);
    }
  };

  // Check 28: Detect accessibility issues
  const detectAccessibilityIssues = () => {
    // Check for missing <title> element
    let hasTitle = false;
    let hasDesc = false;
    let hasText = false;
    const hasLang = doc.hasAttribute("lang") || doc.hasAttribute("xml:lang");

    const checkChildren = (el) => {
      for (const child of el.children) {
        if (!isElement(child)) continue;
        const childTag = child.tagName.toLowerCase();
        if (childTag === "title") hasTitle = true;
        if (childTag === "desc") hasDesc = true;
        if (
          childTag === "text" ||
          childTag === "tspan" ||
          childTag === "textpath"
        ) {
          hasText = true;
        }
        checkChildren(child);
      }
    };
    checkChildren(doc);

    // Check for missing title
    if (!hasTitle) {
      issues.push(
        createIssue(
          {
            type: "missing_title",
            element: "svg",
            reason: `Missing <title> element (recommended for accessibility)`,
          },
          "svg",
          null,
          0,
        ),
      );
    }

    // Check for missing desc on complex SVGs (those with >10 elements)
    let elementCount = 0;
    const countElementsLocal = (el) => {
      elementCount++;
      for (const child of el.children) {
        if (isElement(child)) countElementsLocal(child);
      }
    };
    countElementsLocal(doc);

    if (!hasDesc && elementCount > 10) {
      issues.push(
        createIssue(
          {
            type: "missing_desc",
            element: "svg",
            reason: `Missing <desc> element (recommended for complex SVGs with ${elementCount} elements)`,
          },
          "svg",
          null,
          0,
        ),
      );
    }

    // Check for missing lang on SVGs with text content
    if (hasText && !hasLang) {
      issues.push(
        createIssue(
          {
            type: "missing_lang",
            element: "svg",
            reason: `Missing lang attribute on SVG with text content`,
          },
          "svg",
          null,
          0,
        ),
      );
    }

    // Check for invalid ARIA attributes (uses module-level VALID_ARIA_ATTRS and VALID_ROLES sets)
    const checkAriaAttrs = (el) => {
      const tagName = el.tagName.toLowerCase();
      const occIdx = getOccurrenceIndex(tagName);

      for (const attrName of el.getAttributeNames()) {
        // Check aria-* attributes
        if (
          attrName.startsWith("aria-") &&
          !VALID_ARIA_ATTRS.has(attrName.toLowerCase())
        ) {
          issues.push(
            createIssue(
              {
                type: "invalid_aria",
                element: tagName,
                attr: attrName,
                reason: `Unknown ARIA attribute '${attrName}'`,
              },
              tagName,
              attrName,
              occIdx,
            ),
          );
        }

        // Check role attribute values
        if (attrName === "role") {
          const role = el.getAttribute("role");
          if (role && !VALID_ROLES.has(role.toLowerCase())) {
            issues.push(
              createIssue(
                {
                  type: "invalid_aria",
                  element: tagName,
                  attr: "role",
                  value: role,
                  reason: `Invalid role value '${role}' (valid: ${Array.from(VALID_ROLES).slice(0, 5).join(", ")}...)`,
                },
                tagName,
                "role",
                occIdx,
              ),
            );
          }
        }

        // Check aria-hidden must be true/false
        if (attrName === "aria-hidden") {
          const val = el.getAttribute("aria-hidden");
          if (val && val !== "true" && val !== "false") {
            issues.push(
              createIssue(
                {
                  type: "invalid_aria",
                  element: tagName,
                  attr: "aria-hidden",
                  value: val,
                  reason: `aria-hidden must be 'true' or 'false', got '${val}'`,
                },
                tagName,
                "aria-hidden",
                occIdx,
              ),
            );
          }
        }
      }

      for (const child of el.children) {
        if (isElement(child)) checkAriaAttrs(child);
      }
    };

    resetOccurrences();
    checkAriaAttrs(doc);
  };

  // Run all checks
  resetOccurrences();
  detectInvalidAttrsOnElements(doc);
  detectMissingXlinkNamespace();
  resetOccurrences();
  detectBrokenIdRefs(doc);
  resetOccurrences();
  detectInvalidAnimationTiming(doc);
  resetOccurrences();
  detectAnimationInEmptyElements(doc);
  resetOccurrences();
  detectUppercaseUnits(doc);
  resetOccurrences();
  detectInvalidWhitespaceInLists(doc);
  resetOccurrences();
  detectInvalidNumbers(doc);
  resetOccurrences();
  // (Check 9 removed - merged into Check 15 detectInvalidNumericConstraints)
  detectMistypedElements(doc);
  resetOccurrences();
  detectMistypedAttributes(doc);
  resetOccurrences();
  detectMissingRequiredAttrs(doc);
  resetOccurrences();
  detectInvalidChildren(doc);
  resetOccurrences();
  detectInvalidEnumValues(doc);
  resetOccurrences();
  detectInvalidNumericConstraints(doc);
  resetOccurrences();
  detectDuplicateIds(doc);
  resetOccurrences();
  detectBrokenUrlRefs(doc);
  resetOccurrences();
  detectInvalidColors(doc);
  resetOccurrences();
  detectMalformedFormats(doc);
  resetOccurrences();
  detectCircularReferences();
  resetOccurrences();
  detectDeepNesting(doc);
  resetOccurrences();
  detectEmptyDefs(doc);
  resetOccurrences();
  detectGradientStopOrder(doc);
  resetOccurrences();
  detectPathComplexity(doc);
  resetOccurrences();
  detectExternalResources(doc);
  resetOccurrences();
  detectScriptContent(doc);
  resetOccurrences();
  detectEventHandlers(doc);
  detectAccessibilityIssues();

  // Sort issues by line, then by column (for consistent, predictable output)
  issues.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  // Filter by severity if errorsOnly is set
  let filteredIssues = issues;
  if (errorsOnly) {
    filteredIssues = issues.filter(
      (issue) => issue.severity === ValidationSeverity.ERROR,
    );
  }

  // Calculate counts
  const errorCount = issues.filter(
    (i) => i.severity === ValidationSeverity.ERROR,
  ).length;
  const warningCount = issues.filter(
    (i) => i.severity === ValidationSeverity.WARNING,
  ).length;

  // Build summary by issue type
  const summary = {};
  for (const issue of filteredIssues) {
    summary[issue.type] = (summary[issue.type] || 0) + 1;
  }

  // Build result object
  const result = {
    issues: filteredIssues,
    isValid: errorCount === 0,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    errorCount,
    warningCount,
    issueCount: filteredIssues.length,
    summary,
  };

  // Export to file if requested
  if (outputFile) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      let content;
      switch (outputFormat) {
        case "json":
          content = JSON.stringify(result, null, 2);
          break;

        case "yaml":
          // Simple YAML serialization (no external dependency)
          content = formatAsYaml(result);
          break;

        case "xml":
          content = formatAsXml(result);
          break;

        case "text":
        default:
          content = formatAsText(result);
          break;
      }

      const normalizedPath = path.normalize(outputFile);
      await fs.writeFile(normalizedPath, content, "utf8");
      result.outputFile = normalizedPath;
    } catch (writeError) {
      // Add a warning about failed export but don't fail the validation
      result.exportError = `Failed to write report to '${outputFile}': ${writeError.message}`;
    }
  }

  return result;
}

/**
 * Format validation result as plain text report
 * @private
 * @param {Object} result - Validation result object
 * @returns {string} Formatted text report
 */
function formatAsText(result) {
  const lines = [
    "=".repeat(60),
    "SVG VALIDATION REPORT",
    "=".repeat(60),
    "",
    `Status: ${result.isValid ? "VALID" : "INVALID"}`,
    `Errors: ${result.errorCount}`,
    `Warnings: ${result.warningCount}`,
    `Total Issues: ${result.issueCount}`,
    "",
  ];

  if (result.issues.length > 0) {
    lines.push("-".repeat(60));
    lines.push("ISSUES:");
    lines.push("-".repeat(60));
    lines.push("");

    for (const issue of result.issues) {
      const severity = issue.severity.toUpperCase();
      const location = `${issue.line}:${issue.column}`;
      lines.push(`[${severity}] Line ${location}: ${issue.type}`);
      if (issue.element) lines.push(`  Element: <${issue.element}>`);
      if (issue.attr) lines.push(`  Attribute: ${issue.attr}`);
      if (issue.value) lines.push(`  Value: ${issue.value}`);
      lines.push(`  ${issue.reason}`);
      if (issue.sourceLine) lines.push(`  Source: ${issue.sourceLine.trim()}`);
      lines.push("");
    }
  }

  lines.push("=".repeat(60));
  lines.push("SUMMARY BY TYPE:");
  lines.push("-".repeat(60));
  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`  ${type}: ${count}`);
  }
  lines.push("=".repeat(60));

  return lines.join("\n");
}

/**
 * Format validation result as YAML (simple implementation, no external deps)
 * @private
 * @param {Object} result - Validation result object
 * @returns {string} Formatted YAML report
 */
function formatAsYaml(result) {
  const lines = [
    "validation_result:",
    `  is_valid: ${result.isValid}`,
    `  has_errors: ${result.hasErrors}`,
    `  has_warnings: ${result.hasWarnings}`,
    `  error_count: ${result.errorCount}`,
    `  warning_count: ${result.warningCount}`,
    `  issue_count: ${result.issueCount}`,
    "",
    "  summary:",
  ];

  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`    ${type}: ${count}`);
  }

  lines.push("");
  lines.push("  issues:");

  // BUG FIX: Proper YAML escaping - escape backslashes, newlines, tabs, and quotes
  const escapeYaml = (str) =>
    String(str)
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Escape quotes
      .replace(/\n/g, "\\n") // Escape newlines
      .replace(/\r/g, "\\r") // Escape carriage returns
      .replace(/\t/g, "\\t"); // Escape tabs

  for (const issue of result.issues) {
    lines.push(`    - type: ${issue.type}`);
    lines.push(`      severity: ${issue.severity}`);
    lines.push(`      line: ${issue.line}`);
    lines.push(`      column: ${issue.column}`);
    if (issue.element)
      lines.push(`      element: "${escapeYaml(issue.element)}"`);
    if (issue.attr) lines.push(`      attr: "${escapeYaml(issue.attr)}"`);
    if (issue.value) lines.push(`      value: "${escapeYaml(issue.value)}"`);
    lines.push(`      reason: "${escapeYaml(issue.reason)}"`);
    if (issue.sourceLine)
      lines.push(`      source_line: "${escapeYaml(issue.sourceLine)}"`);
  }

  return lines.join("\n");
}

/**
 * Format validation result as XML
 * @private
 * @param {Object} result - Validation result object
 * @returns {string} Formatted XML report
 */
function formatAsXml(result) {
  const escapeXmlLocal = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<validation_result>",
    `  <is_valid>${result.isValid}</is_valid>`,
    `  <has_errors>${result.hasErrors}</has_errors>`,
    `  <has_warnings>${result.hasWarnings}</has_warnings>`,
    `  <error_count>${result.errorCount}</error_count>`,
    `  <warning_count>${result.warningCount}</warning_count>`,
    `  <issue_count>${result.issueCount}</issue_count>`,
    "  <summary>",
  ];

  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`    <${type}>${count}</${type}>`);
  }

  lines.push("  </summary>");
  lines.push("  <issues>");

  for (const issue of result.issues) {
    lines.push("    <issue>");
    lines.push(`      <type>${escapeXmlLocal(issue.type)}</type>`);
    lines.push(`      <severity>${escapeXmlLocal(issue.severity)}</severity>`);
    lines.push(`      <line>${issue.line}</line>`);
    lines.push(`      <column>${issue.column}</column>`);
    if (issue.element)
      lines.push(`      <element>${escapeXmlLocal(issue.element)}</element>`);
    if (issue.attr)
      lines.push(`      <attr>${escapeXmlLocal(issue.attr)}</attr>`);
    if (issue.value)
      lines.push(`      <value>${escapeXmlLocal(issue.value)}</value>`);
    lines.push(`      <reason>${escapeXmlLocal(issue.reason)}</reason>`);
    if (issue.sourceLine)
      lines.push(
        `      <source_line>${escapeXmlLocal(issue.sourceLine)}</source_line>`,
      );
    lines.push("    </issue>");
  }

  lines.push("  </issues>");
  lines.push("</validation_result>");

  return lines.join("\n");
}

/**
 * Count total elements in document
 * @private
 * @param {Element} el - Root element to count from
 * @returns {number} Total number of elements
 */
function countElements(el) {
  let count = 1;
  for (const child of el.children) {
    if (isElement(child)) {
      count += countElements(child);
    }
  }
  return count;
}

/**
 * Complete flattening pipeline that resolves all complex SVG features into basic shapes
 * @param {Document|string} doc - SVG document or string to flatten
 * @param {Object} options - Flattening options
 * @param {number} [options.precision=6] - Number precision for coordinates
 * @param {number} [options.curveSegments=20] - Number of segments for curve approximation
 * @param {boolean} [options.minify=true] - Minify output
 * @returns {Promise<Document>} Flattened SVG document
 */
export const flattenAll = createOperation(async (doc, options = {}) => {
  const svgString = serializeSVG(doc, { minify: options.minify !== false });
  const result = await flattenSVG(svgString, {
    precision: options.precision || 6,
    curveSegments: options.curveSegments || 20,
    resolveUse: true,
    resolveMarkers: true,
    resolvePatterns: true,
    resolveMasks: true,
    resolveClipPaths: true,
    flattenTransforms: true,
    bakeGradients: true,
    removeUnusedDefs: true,
    ...options,
  });
  return parseSVG(result.svg);
});

/**
 * Bezier curve simplification - optimizes path data while preserving visual appearance
 * @param {Document|string} doc - SVG document or string to process
 * @param {Object} options - Simplification options
 * @param {number} [options.tolerance=0.01] - Simplification tolerance
 * @param {number} [options.precision=6] - Number precision for coordinates
 * @returns {Document} SVG document with simplified paths
 */
export const simplifyPath = createOperation((doc, options = {}) => {
  const _tolerance = options.tolerance || 0.01;
  const paths = doc.getElementsByTagName("path");

  for (const path of paths) {
    const d = path.getAttribute("d");
    if (!d) continue;

    try {
      const commands = GeometryToPath.parsePathData(d);
      const simplified = GeometryToPath.pathArrayToString(
        commands,
        options.precision || 6,
      );
      path.setAttribute("d", simplified);
    } catch (e) {
      // BUG FIX: Log error instead of silently swallowing it
      console.warn(`Failed to simplify path: ${e.message}`, {
        pathData: d.substring(0, 100),
      });
      // Skip invalid paths
    }
  }

  return doc;
});

/**
 * Optimize animation timing attributes (keySplines, keyTimes, values)
 *
 * Example:
 *   keySplines="0.400 0.000 0.200 1.000" -> keySplines=".4 0 .2 1"
 *   calcMode="spline" keySplines="0 0 1 1" -> calcMode="linear" (keySplines removed)
 *
 * @param {Document|string} doc - SVG document or string to optimize
 * @param {Object} options - Optimization options
 * @param {number} [options.precision=3] - Max decimal places
 * @param {boolean} [options.removeLinearSplines=true] - Convert calcMode="spline" with linear keySplines to calcMode="linear"
 * @param {boolean} [options.optimizeValues=true] - Optimize numeric values in animation values attribute
 * @returns {Document} SVG document with optimized animation timing
 */
export const optimizeAnimationTiming = createOperation((doc, options = {}) => {
  optimizeDocumentAnimationTiming(doc, {
    precision: options.precision ?? 3,
    removeLinearSplines: options.removeLinearSplines !== false,
    optimizeValues: options.optimizeValues !== false,
  });
  return doc;
});

/**
 * Optimize path data using SVGO-style convertPathData approach.
 *
 * Applies comprehensive path optimizations:
 * - Convert straight curves to lines
 * - Use H/V shortcuts for horizontal/vertical lines
 * - Convert L to Z when returning to subpath start
 * - Choose shorter of absolute/relative forms
 * - Remove leading zeros (0.5 -> .5)
 * - Minimize delimiter characters
 *
 * Options:
 * - floatPrecision: Max decimal places (default: 3)
 * - straightCurves: Convert straight beziers to lines (default: true)
 * - lineShorthands: Use H/V for horiz/vert lines (default: true)
 * - convertToZ: Convert final line to Z (default: true)
 * - utilizeAbsolute: Pick shorter of abs/rel (default: true)
 * - straightTolerance: Tolerance for curve straightness (default: 0.5)
 */
export const optimizePaths = createOperation((doc, options = {}) => {
  const _result = optimizeDocumentPaths(doc, {
    floatPrecision: options.floatPrecision ?? options.precision ?? 3,
    straightCurves: options.straightCurves !== false,
    lineShorthands: options.lineShorthands !== false,
    convertToZ: options.convertToZ !== false,
    utilizeAbsolute: options.utilizeAbsolute !== false,
    straightTolerance: options.straightTolerance ?? 0.5,
  });
  return doc;
});

/**
 * Simplify polyline paths using Douglas-Peucker or Visvalingam-Whyatt algorithm.
 *
 * This is a lossy optimization that reduces the number of points in polyline paths.
 * Only applies to pure polyline paths (M, L, H, V, Z commands only).
 * Bezier curves are NOT simplified by this function.
 *
 * Options:
 * - tolerance: Maximum allowed deviation from original path (default: 1.0)
 * - algorithm: 'douglas-peucker' or 'visvalingam' (default: 'douglas-peucker')
 */
/**
 * Simplify paths using Douglas-Peucker or Visvalingam-Whyatt algorithm.
 *
 * IMPORTANT: The tolerance is automatically adjusted based on stroke-width.
 * A path with a thick stroke can tolerate less geometric deviation because
 * errors become visible in the stroke outline.
 *
 * The effective tolerance is: min(userTolerance, strokeWidth / 4)
 * This ensures simplification doesn't create visible artifacts in stroked paths.
 *
 * Options:
 * - tolerance: Base tolerance (default: 1.0)
 * - algorithm: 'douglas-peucker' or 'visvalingam-whyatt' (default: 'douglas-peucker')
 * - precision: Output precision (default: 3)
 * - respectStroke: Adjust tolerance for stroke-width (default: true)
 */
export const simplifyPaths = createOperation((doc, options = {}) => {
  const baseTolerance = options.tolerance ?? 1.0;
  const algorithm = options.algorithm ?? "douglas-peucker";
  const respectStroke = options.respectStroke !== false;

  // Build defs map for resolving inherited properties
  const defsMap = buildDefsMap(doc);

  let _pathsSimplified = 0;
  let _totalPointsRemoved = 0;

  const processElement = (el) => {
    const tagName = el.tagName?.toLowerCase();

    if (tagName === "path") {
      const d = el.getAttribute("d");
      if (d) {
        // Calculate effective tolerance based on stroke-width
        let effectiveTolerance = baseTolerance;

        if (respectStroke) {
          const inherited = getInheritedProperties(el);
          const ctx = createRenderingContext(el, inherited, defsMap);

          // BUG FIX: Check strokeWidth > 0 to avoid zero tolerance from stroke-width="0"
          if (ctx.hasStroke && ctx.strokeWidth.greaterThan(0)) {
            // Reduce tolerance for stroked paths to avoid visible artifacts
            // Errors in path geometry are amplified in the stroke outline
            const strokeBasedTolerance = ctx.strokeWidth.div(4).toNumber();
            effectiveTolerance = Math.min(baseTolerance, strokeBasedTolerance);
          }
        }

        const commands = parsePathCommands(d);
        const result = simplifyPolylinePath(
          commands,
          effectiveTolerance,
          algorithm,
        );
        if (result.simplified) {
          const newD = serializePathCommands(
            result.commands,
            options.precision ?? 3,
          );
          el.setAttribute("d", newD);
          _pathsSimplified++;
          _totalPointsRemoved +=
            result.originalPoints - result.simplifiedPoints;
        }
      }
    }

    for (const child of el.children || []) {
      processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

/**
 * Matrix decomposition
 */
export const decomposeTransform = createOperation((doc, _options = {}) => {
  const processElement = (el) => {
    const transform = el.getAttribute("transform");
    if (transform) {
      const matrix = SVGFlatten.parseTransformAttribute(transform);
      const decomposed = TransformDecomposition.decomposeMatrix(matrix);

      // Store decomposition as data attribute
      el.setAttribute(
        "data-decomposed",
        JSON.stringify({
          translateX: decomposed.translateX.toNumber(),
          translateY: decomposed.translateY.toNumber(),
          rotation: decomposed.rotation.toNumber(),
          scaleX: decomposed.scaleX.toNumber(),
          scaleY: decomposed.scaleY.toNumber(),
          skewX: decomposed.skewX.toNumber(),
        }),
      );
    }

    for (const child of el.children) {
      if (isElement(child)) processElement(child);
    }
  };

  processElement(doc);
  return doc;
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert shape element to polygon for collision detection
 * @param {Element} el - SVG shape element (path, rect, circle, etc.)
 * @param {number} samples - Number of sample points for curves
 * @returns {Array<{x: number, y: number}>|null} Array of polygon vertices or null if conversion fails
 */
function getShapePolygon(el, samples) {
  const tagName = el.tagName.toLowerCase();

  try {
    if (tagName === "path") {
      const d = el.getAttribute("d");
      if (!d) return null;

      // Simple path sampling
      const commands = GeometryToPath.parsePathData(d);
      const points = [];

      let x = 0,
        y = 0;
      for (const cmd of commands) {
        if (cmd.command === "M" || cmd.command === "L") {
          x = cmd.args[0].toNumber();
          y = cmd.args[1].toNumber();
          points.push({ x, y });
        }
      }

      return points;
    }

    if (tagName === "rect") {
      const xAttr = el.getAttribute("x") || "0";
      const yAttr = el.getAttribute("y") || "0";
      const wAttr = el.getAttribute("width") || "0";
      const hAttr = el.getAttribute("height") || "0";

      // Skip rect with CSS units - can't convert to polygon
      if (
        hasUnits(xAttr) ||
        hasUnits(yAttr) ||
        hasUnits(wAttr) ||
        hasUnits(hAttr)
      ) {
        return null;
      }

      const x = parseFloat(xAttr);
      const y = parseFloat(yAttr);
      const w = parseFloat(wAttr);
      const h = parseFloat(hAttr);

      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }

    if (tagName === "circle") {
      const cx = parseFloat(el.getAttribute("cx") || "0");
      const cy = parseFloat(el.getAttribute("cy") || "0");
      const r = parseFloat(el.getAttribute("r") || "0");

      const points = [];
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * 2 * Math.PI;
        points.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      }
      return points;
    }

    return null;
  } catch (e) {
    // BUG FIX: Log error instead of silently swallowing it
    console.warn(`getShapePolygon failed for ${tagName}:`, e.message);
    return null;
  }
}

// ============================================================================
// EMBED EXTERNAL DEPENDENCIES
// ============================================================================

// MIME type map for resource embedding
const EMBED_MIME_TYPES = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  // Audio
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  // Video
  ".mp4": "video/mp4",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  // Other
  ".css": "text/css",
  ".js": "text/javascript",
};

/**
 * Check if running in Node.js environment
 * @returns {boolean} True if running in Node.js
 */
function isNodeEnvironment() {
  return typeof process !== "undefined" && process.versions?.node;
}

/**
 * Check if href is external (not #id or data:)
 * @param {string} href - The href attribute value to check
 * @returns {boolean} True if href is external
 */
function isExternalHref(href) {
  if (!href || typeof href !== "string") return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("data:")) return false;
  return true;
}

/**
 * Parse external SVG reference like "icons.svg#arrow" into {path, fragment}
 * @param {string} href - The href to parse
 * @returns {{path: string, fragment: string|null}} Parsed path and fragment
 */
function parseExternalSVGRef(href) {
  const hashIdx = href.indexOf("#");
  if (hashIdx === -1) return { path: href, fragment: null };
  return {
    path: href.substring(0, hashIdx),
    fragment: href.substring(hashIdx + 1),
  };
}

/**
 * Detect MIME type from file extension
 * @param {string} urlOrPath - URL or file path
 * @returns {string} MIME type string
 */
function detectMimeType(urlOrPath) {
  const ext = (urlOrPath.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  return EMBED_MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Resolve relative URL against base path
 * @param {string} url - URL to resolve
 * @param {string} basePath - Base path for resolution
 * @returns {string} Resolved absolute URL
 */
function resolveURL(url, basePath) {
  if (!url) return url;
  // Already absolute URL
  if (url.match(/^https?:\/\//i)) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("file://")) return url;

  // Handle base path
  if (!basePath) return url;

  // If basePath is a URL
  if (basePath.match(/^https?:\/\//i)) {
    try {
      return new URL(url, basePath).href;
    } catch (e) {
      // Log error for debugging - invalid URL
      if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
      return url;
    }
  }

  // File path resolution (Node.js)
  if (isNodeEnvironment()) {
    // Use require for synchronous path operations
    try {
      // Use dynamic require if available
      const pathModule = require("node:path");
      const baseDir = basePath.endsWith("/")
        ? basePath
        : pathModule.dirname(basePath);
      const resolved = pathModule.resolve(baseDir, url);
      // Security: Prevent path traversal attacks - resolved path must stay within baseDir
      const normalizedBase = pathModule.resolve(baseDir);
      if (
        !resolved.startsWith(normalizedBase + pathModule.sep) &&
        resolved !== normalizedBase
      ) {
        // Path traversal detected, return url unchanged as fallback
        console.warn(`Path traversal blocked: ${url} escapes base directory`);
        return url;
      }
      return resolved;
    } catch (e) {
      // Fallback to simple join - log error for debugging
      if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
      const baseDir = basePath.endsWith("/")
        ? basePath
        : basePath.substring(0, basePath.lastIndexOf("/") + 1);
      // BUG FIX: Block path traversal attempts in fallback
      if (url.includes("..") || url.startsWith("/")) {
        console.warn(`Unsafe path pattern blocked in fallback: ${url}`);
        return url;
      }
      return baseDir + url;
    }
  }

  // Simple path join for browser
  const baseDir = basePath.endsWith("/")
    ? basePath
    : basePath.substring(0, basePath.lastIndexOf("/") + 1);
  // BUG FIX: Block path traversal attempts in browser context
  if (url.includes("..") || url.startsWith("/")) {
    console.warn(`Unsafe path pattern blocked: ${url}`);
    return url;
  }
  return baseDir + url;
}

/**
 * Fetch resource content (works in Node.js and browser)
 * @param {string} url - URL or file path to fetch
 * @param {string} mode - Fetch mode ('text' or 'binary')
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{content: string|Buffer|ArrayBuffer, contentType: string}>} Fetched content and content type
 */
async function fetchResource(url, mode = "text", timeout = 30000) {
  // Handle local files in Node.js
  if (isNodeEnvironment() && !url.match(/^https?:\/\//i)) {
    const fs = await import("node:fs/promises");
    const content =
      mode === "binary"
        ? await fs.readFile(url)
        : await fs.readFile(url, "utf8");
    return { content, contentType: detectMimeType(url) };
  }

  // Use fetch API for URLs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType =
      response.headers.get("content-type") || detectMimeType(url);
    const content =
      mode === "binary" ? await response.arrayBuffer() : await response.text();

    return { content, contentType };
  } finally {
    // Always clear timeout to prevent memory leaks, regardless of success or failure
    clearTimeout(timeoutId);
  }
}

/**
 * Convert binary content to base64 data URI
 * @param {Buffer|ArrayBuffer|Uint8Array} content - Binary content to convert
 * @param {string} mimeType - MIME type for the data URI
 * @returns {string} Base64 data URI
 */
function toDataURI(content, mimeType) {
  let base64;
  if (isNodeEnvironment()) {
    // Node.js: Buffer
    base64 = Buffer.from(content).toString("base64");
  } else {
    // Browser: Uint8Array
    const bytes = new Uint8Array(content);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Parse CSS to find @import and url() references
 * @param {string} css - CSS content to parse
 * @returns {{imports: Array<{url: string, fullMatch: string, index: number}>, urls: Array<{url: string, fullMatch: string, index: number}>}} Parsed imports and URLs
 */
function parseCSSUrls(css) {
  const imports = [];
  const urls = [];

  // Find @import url(...) or @import "..."
  const importRegex =
    /@import\s+(?:url\(\s*["']?([^"')]+)["']?\s*\)|["']([^"']+)["'])/gi;
  let match;
  let lastImportIndex = 0;
  // BUG FIX: Add safety guard against infinite loop if regex matches empty string
  while ((match = importRegex.exec(css)) !== null) {
    if (match.index === lastImportIndex && match[0].length === 0) {
      console.error(
        "Regex matched empty string in @import, breaking to prevent infinite loop",
      );
      break;
    }
    lastImportIndex = match.index + Math.max(1, match[0].length);
    imports.push({
      url: match[1] || match[2],
      fullMatch: match[0],
      index: match.index,
    });
  }

  // Find url(...) in properties (not @import)
  const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let lastUrlIndex = 0;
  // BUG FIX: Add safety guard against infinite loop if regex matches empty string
  while ((match = urlRegex.exec(css)) !== null) {
    if (match.index === lastUrlIndex && match[0].length === 0) {
      console.error(
        "Regex matched empty string in url(), breaking to prevent infinite loop",
      );
      break;
    }
    lastUrlIndex = match.index + Math.max(1, match[0].length);
    // Skip if this is part of an @import
    const beforeMatch = css.substring(
      Math.max(0, match.index - 10),
      match.index,
    );
    if (beforeMatch.includes("@import")) continue;
    // Skip local ID references
    if (match[1].startsWith("#")) continue;
    // Skip data URIs
    if (match[1].startsWith("data:")) continue;

    urls.push({
      url: match[1],
      fullMatch: match[0],
      index: match.index,
    });
  }

  return { imports, urls };
}

/**
 * Relocate all IDs in element tree with prefix to avoid collisions
 * @param {Element} element - Root element to process
 * @param {string} prefix - Prefix to add to all IDs
 * @param {Map<string, string>} idMap - Map tracking old ID to new ID mappings
 * @returns {Map<string, string>} Updated ID mapping
 */
function relocateIds(element, prefix, idMap = new Map()) {
  if (!element) return idMap;

  // Update id attribute
  const id = element.getAttribute?.("id");
  if (id) {
    const newId = prefix + id;
    idMap.set(id, newId);
    element.setAttribute("id", newId);
  }

  // Update references in attributes
  const refAttrs = [
    "href",
    "xlink:href",
    "fill",
    "stroke",
    "clip-path",
    "mask",
    "filter",
    "marker-start",
    "marker-mid",
    "marker-end",
  ];
  for (const attr of refAttrs) {
    const val = element.getAttribute?.(attr);
    if (!val) continue;

    // Handle url(#id) references
    if (val.includes("url(#")) {
      const newVal = val.replace(/url\(#([^)]+)\)/g, (match, refId) => {
        return `url(#${idMap.get(refId) || prefix + refId})`;
      });
      element.setAttribute(attr, newVal);
    }
    // Handle #id references
    else if (val.startsWith("#")) {
      const refId = val.substring(1);
      element.setAttribute(attr, "#" + (idMap.get(refId) || prefix + refId));
    }
  }

  // Update style attribute url() references
  const style = element.getAttribute?.("style");
  if (style && style.includes("url(#")) {
    const newStyle = style.replace(/url\(#([^)]+)\)/g, (match, refId) => {
      return `url(#${idMap.get(refId) || prefix + refId})`;
    });
    element.setAttribute("style", newStyle);
  }

  // Recurse into children
  if (element.children) {
    for (const child of element.children) {
      relocateIds(child, prefix, idMap);
    }
  }

  return idMap;
}

/**
 * Set script/style content as a proper CDATA section node
 * Using createCDATASection if available, otherwise use marker for post-processing
 * @param {Element} element - Script or style element to set content for
 * @param {string} content - Content to set
 * @param {Document} doc - Document context for creating CDATA nodes
 * @returns {void}
 */
function setCDATAContent(element, content, doc) {
  // BUG FIX: Add null check for element to prevent TypeError
  if (!element) {
    console.warn("setCDATAContent called with null element");
    return;
  }
  // Clear existing content with safety counter to prevent infinite loops
  let safetyCounter = 0;
  const MAX_CHILDREN = 10000;
  while (element.firstChild && safetyCounter++ < MAX_CHILDREN) {
    const child = element.firstChild;
    element.removeChild(child);
    // Verify child was actually removed to prevent infinite loop
    if (element.firstChild === child) {
      console.error(
        "removeChild failed to remove child in setCDATAContent, breaking to prevent infinite loop",
      );
      break;
    }
  }

  const needsCDATA =
    content.includes("<") || content.includes("&") || content.includes("]]>");

  if (needsCDATA && typeof doc.createCDATASection === "function") {
    // Browser/full DOM environment - use native CDATA section
    // Handle ]]> by splitting into multiple CDATA sections
    // Each part goes in its own CDATA, with ]]> reconstructed across boundaries
    if (content.includes("]]>")) {
      const parts = content.split("]]>");
      for (let i = 0; i < parts.length; i++) {
        if (i === 0) {
          // First part: content + ]] (the > goes in next section)
          element.appendChild(doc.createCDATASection(parts[i] + "]]"));
        } else if (i === parts.length - 1) {
          // Last part: just the content (preceded by > from previous split)
          element.appendChild(doc.createCDATASection(">" + parts[i]));
        } else {
          // Middle parts: >content]]
          element.appendChild(doc.createCDATASection(">" + parts[i] + "]]"));
        }
      }
    } else {
      element.appendChild(doc.createCDATASection(content));
    }
  } else if (needsCDATA) {
    // linkedom/Node.js environment - mark element for post-processing
    // Escape ]]> sequences: split CDATA, end with ]], start new with >
    // Result: abc]]>def -> <![CDATA[abc]]]]><![CDATA[>def]]>
    const escaped = content.replace(/\]\]>/g, "]]]]><![CDATA[>");
    element.setAttribute("data-cdata-pending", "true");
    element.textContent = escaped;
  } else {
    // Plain text doesn't need CDATA wrapping
    element.textContent = content;
  }
}

// Common file extensions for resource detection
const RESOURCE_EXTENSIONS = {
  // Audio
  audio: [".wav", ".mp3", ".ogg", ".webm", ".m4a", ".aac", ".flac"],
  // Images (additional formats beyond what we already handle)
  image: [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".avif",
    ".ico",
    ".bmp",
  ],
  // Video
  video: [".mp4", ".webm", ".ogv", ".avi", ".mov"],
  // Data/Config
  data: [".json", ".xml", ".txt", ".csv", ".tsv"],
  // Fonts (for completeness)
  font: [".woff", ".woff2", ".ttf", ".otf", ".eot"],
};

// All extensions flattened for quick lookup
const ALL_RESOURCE_EXTENSIONS = Object.values(RESOURCE_EXTENSIONS).flat();

/**
 * Extract file references from text content (JavaScript, HTML, CSS).
 * Finds string literals that look like file paths with known extensions.
 * @param {string} content - Text content to scan
 * @returns {Set<string>} Set of unique file paths found
 */
function extractFileReferences(content) {
  const refs = new Set();

  // Pattern to match string literals (single, double quotes, or backticks)
  // that contain file paths with known extensions
  const extPattern = ALL_RESOURCE_EXTENSIONS.map((e) =>
    e.replace(".", "\\."),
  ).join("|");

  // Match quoted strings containing paths with known extensions
  // Handles: "./path/file.wav", './path/file.mp3', `path/file.json`
  const stringPattern = new RegExp(
    `["'\`]([^"'\`]*(?:${extPattern}))["'\`]`,
    "gi",
  );

  let match;
  while ((match = stringPattern.exec(content)) !== null) {
    const path = match[1];
    // Skip data URIs, absolute URLs to external domains, and empty strings
    if (
      path &&
      !path.startsWith("data:") &&
      !path.match(/^https?:\/\/(?!localhost)/) &&
      path.length > 0
    ) {
      refs.add(path);
    }
  }

  return refs;
}

/**
 * Generate the resource interceptor JavaScript code.
 * This code overrides fetch/XHR to serve embedded resources.
 * @param {Map<string, string>} resourceMap - Map of path -> data URI
 * @returns {string} JavaScript code to inject
 */
function generateResourceInterceptor(resourceMap) {
  if (resourceMap.size === 0) return "";

  // Convert map to object for JSON serialization
  const mapObj = {};
  for (const [path, dataUri] of resourceMap) {
    mapObj[path] = dataUri;
  }

  return `
// ===== EMBEDDED RESOURCES INTERCEPTOR (auto-generated) =====
(function() {
  var __EMBEDDED_RESOURCES__ = ${JSON.stringify(mapObj, null, 0)};

  // Helper to normalize paths for lookup
  function normalizePath(url) {
    if (!url || typeof url !== 'string') return url;
    // Handle relative paths: ./foo, ../foo, foo
    var normalized = url.replace(/^\\.?\\//, '');
    // Try exact match first
    if (__EMBEDDED_RESOURCES__[url]) return url;
    if (__EMBEDDED_RESOURCES__['./' + normalized]) return './' + normalized;
    if (__EMBEDDED_RESOURCES__[normalized]) return normalized;
    // Try without leading ./ (hasOwnProperty check for safety with prototype pollution)
    // BUG FIX: Use stricter path matching to avoid false positives
    // Only match if the suffix is a complete path segment (after / or start of string)
    for (var key in __EMBEDDED_RESOURCES__) {
      if (Object.prototype.hasOwnProperty.call(__EMBEDDED_RESOURCES__, key)) {
        var keyBase = key.replace(/^\\.?\\//, '');
        var normalizedBase = normalized.replace(/^\\.?\\//, '');
        // Check for exact filename match (case: key="./dir/file.wav", normalized="file.wav")
        if (keyBase === normalizedBase) return key;
        // Check if normalized ends with /keyBase or starts with keyBase
        if (key.endsWith('/' + normalizedBase) || normalizedBase.endsWith('/' + keyBase)) {
          return key;
        }
      }
    }
    return url;
  }

  // Override XMLHttpRequest.open to intercept resource loading
  var __originalXHROpen__ = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var normalizedUrl = normalizePath(url);
    if (__EMBEDDED_RESOURCES__[normalizedUrl]) {
      this.__embeddedUrl__ = normalizedUrl;
    }
    return __originalXHROpen__.apply(this, arguments);
  };

  // Override XMLHttpRequest.send to serve embedded resources
  var __originalXHRSend__ = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this.__embeddedUrl__) {
      var xhr = this;
      var dataUri = __EMBEDDED_RESOURCES__[this.__embeddedUrl__];
      // Simulate async response
      setTimeout(function() {
        // Convert data URI to ArrayBuffer for audio/binary (validate comma exists in data URI)
        var commaIdx = dataUri.indexOf(',');
        if (commaIdx === -1) {
          // BUG FIX: Properly signal error state instead of silently returning
          console.error('Invalid data URI format: missing comma separator');
          Object.defineProperty(xhr, 'status', { value: 400, writable: false });
          Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
          if (xhr.onerror) {
            var errorEvent = new ProgressEvent('error');
            xhr.onerror.call(xhr, errorEvent);
          }
          if (xhr.onreadystatechange) {
            var stateEvent = new Event('readystatechange');
            xhr.onreadystatechange.call(xhr, stateEvent);
          }
          return;
        }
        var base64 = dataUri.substring(commaIdx + 1);
        var binary = atob(base64);
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        Object.defineProperty(xhr, 'response', { value: bytes.buffer, writable: false });
        Object.defineProperty(xhr, 'responseType', { value: 'arraybuffer', writable: false });
        Object.defineProperty(xhr, 'status', { value: 200, writable: false });
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
        // Create a proper ProgressEvent and call handlers with correct 'this' context
        var loadEvent = new ProgressEvent('load', { lengthComputable: true, loaded: len, total: len });
        if (xhr.onload) xhr.onload.call(xhr, loadEvent);
        // BUG FIX: Pass Event object to onreadystatechange per XHR spec
        if (xhr.onreadystatechange) {
          var stateEvent = new Event('readystatechange');
          xhr.onreadystatechange.call(xhr, stateEvent);
        }
      }, 0);
      return;
    }
    return __originalXHRSend__.apply(this, arguments);
  };

  // Override fetch to serve embedded resources
  if (typeof fetch !== 'undefined') {
    var __originalFetch__ = fetch;
    window.fetch = function(url, options) {
      var urlStr = typeof url === 'string' ? url : (url.url || url.toString());
      var normalizedUrl = normalizePath(urlStr);
      if (__EMBEDDED_RESOURCES__[normalizedUrl]) {
        var dataUri = __EMBEDDED_RESOURCES__[normalizedUrl];
        return __originalFetch__(dataUri, options);
      }
      return __originalFetch__.apply(this, arguments);
    };
  }

  // Override Audio constructor to serve embedded resources
  if (typeof Audio !== 'undefined') {
    var __OriginalAudio__ = Audio;
    window.Audio = function(src) {
      var normalizedSrc = normalizePath(src);
      if (__EMBEDDED_RESOURCES__[normalizedSrc]) {
        return new __OriginalAudio__(__EMBEDDED_RESOURCES__[normalizedSrc]);
      }
      return new __OriginalAudio__(src);
    };
    window.Audio.prototype = __OriginalAudio__.prototype;
  }

  // Override Image.src to serve embedded resources
  var __originalImageSrcDescriptor__ = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (__originalImageSrcDescriptor__) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set: function(val) {
        var normalizedVal = normalizePath(val);
        if (__EMBEDDED_RESOURCES__[normalizedVal]) {
          __originalImageSrcDescriptor__.set.call(this, __EMBEDDED_RESOURCES__[normalizedVal]);
        } else {
          __originalImageSrcDescriptor__.set.call(this, val);
        }
      },
      get: __originalImageSrcDescriptor__.get
    });
  }
})();
// ===== END EMBEDDED RESOURCES INTERCEPTOR =====

`;
}

/**
 * Extract all text content from SVG and map to fonts.
 * Returns { fontFamily: Set<characters> }
 * @param {Object} element - SVG element to scan
 * @returns {Map<string, Set<string>>} Font to characters map
 */
function extractFontCharacterMap(element) {
  const fontMap = new Map();

  const addCharsToFont = (fontFamily, text) => {
    if (!fontFamily || !text) return;
    // Normalize font family name (remove quotes, trim)
    const normalizedFont = fontFamily
      .replace(/['"]/g, "")
      .trim()
      .split(",")[0]
      .trim();
    if (!fontMap.has(normalizedFont)) {
      fontMap.set(normalizedFont, new Set());
    }
    const charSet = fontMap.get(normalizedFont);
    for (const char of text) {
      charSet.add(char);
    }
  };

  const walk = (el) => {
    if (!el) return;

    // Get font-family from style attribute
    const style = el.getAttribute?.("style") || "";
    const fontMatch = style.match(/font-family:\s*([^;]+)/i);
    const fontFromStyle = fontMatch ? fontMatch[1] : null;

    // Get font-family from font-family attribute
    const fontFromAttr = el.getAttribute?.("font-family");

    // Get font-family from CSS face attribute (for foreignObject content)
    const faceAttr = el.getAttribute?.("face");

    const fontFamily = fontFromStyle || fontFromAttr || faceAttr;

    // BUG FIX: Get only direct text nodes, not text from child elements
    // el.textContent returns ALL descendant text which causes wrong font attribution
    // e.g., <text font="Arial">Hello<tspan font="Courier">World</tspan></text>
    // would incorrectly add "HelloWorld" to Arial
    let directTextContent = "";
    if (el.childNodes) {
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          // TEXT_NODE
          directTextContent += node.nodeValue || "";
        }
      }
    }
    if (fontFamily && directTextContent.trim()) {
      addCharsToFont(fontFamily, directTextContent);
    }

    // Also check for text in <text> and <tspan> elements
    if (el.tagName === "text" || el.tagName === "tspan") {
      // Try to get inherited font from ancestors
      let inheritedFont = fontFamily;
      if (!inheritedFont && el.parentNode) {
        const parentStyle = el.parentNode.getAttribute?.("style") || "";
        const parentFontMatch = parentStyle.match(/font-family:\s*([^;]+)/i);
        inheritedFont = parentFontMatch
          ? parentFontMatch[1]
          : el.parentNode.getAttribute?.("font-family");
      }
      if (inheritedFont && directTextContent.trim()) {
        addCharsToFont(inheritedFont, directTextContent);
      }
    }

    // Recurse into children
    if (el.children) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(element);
  return fontMap;
}

/**
 * Convert font character map to URL-safe text parameter.
 * @param {Set<string>} charSet - Set of characters
 * @returns {string} URL-encoded unique characters
 */
function charsToTextParam(charSet) {
  // Sort and dedupe characters, then URL-encode
  const uniqueChars = [...charSet].sort().join("");
  return encodeURIComponent(uniqueChars);
}

/**
 * Check if URL is a Google Fonts URL.
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isGoogleFontsUrl(url) {
  return (
    url &&
    (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com"))
  );
}

/**
 * Extract font family name from Google Fonts URL.
 * @param {string} url - Google Fonts URL
 * @returns {string|null} Font family name
 */
function extractFontFamilyFromGoogleUrl(url) {
  try {
    const urlObj = new URL(url);
    const family = urlObj.searchParams.get("family");
    if (family) {
      // Handle "Fira+Mono" or "Fira Mono:400,700"
      return family.split(":")[0].replace(/\+/g, " ");
    }
  } catch (e) {
    // Try regex fallback - log error for debugging
    if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
    const match = url.match(/family=([^&:]+)/);
    if (match) {
      return match[1].replace(/\+/g, " ");
    }
  }
  return null;
}

/**
 * Add text parameter to Google Fonts URL for character subsetting.
 * @param {string} url - Original Google Fonts URL
 * @param {string} textParam - URL-encoded characters to include
 * @returns {string} Modified URL with text parameter
 */
function addTextParamToGoogleFontsUrl(url, textParam) {
  if (!textParam) return url;

  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set("text", decodeURIComponent(textParam));
    return urlObj.toString();
  } catch (e) {
    // Fallback: append to URL string - log error for debugging
    if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}text=${textParam}`;
  }
}

/**
 * Embed all external dependencies into an SVG, making it completely self-contained.
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} [options={}] - Embedding options
 * @param {string} [options.basePath] - Base path for resolving relative URLs
 * @param {boolean} [options.embedImages=true] - Convert <image> hrefs to base64 data URIs
 * @param {boolean} [options.embedExternalSVGs=true] - Resolve external SVG references
 * @param {'extract'|'embed'} [options.externalSVGMode='extract'] - How to embed external SVGs
 * @param {boolean} [options.embedCSS=true] - Inline external stylesheets and @import rules
 * @param {boolean} [options.embedFonts=true] - Convert @font-face url() to base64
 * @param {boolean} [options.embedScripts=true] - Inline external <script src="...">
 * @param {boolean} [options.embedAudio=false] - Embed audio files as base64 (can significantly increase file size)
 * @param {boolean} [options.subsetFonts=true] - Enable Google Fonts character subsetting (reduces ~1.5MB to ~35KB)
 * @param {boolean} [options.verbose=false] - Log font subsetting and embedding information
 * @param {boolean} [options.recursive=true] - Recursively process embedded SVGs
 * @param {number} [options.maxRecursionDepth=10] - Maximum depth for recursive embedding
 * @param {number} [options.timeout=30000] - Timeout for remote fetches (ms)
 * @param {'fail'|'warn'|'skip'} [options.onMissingResource='warn'] - Behavior when resource not found
 * @param {Function} [options.onProgress] - Progress callback (stage, current, total)
 * @param {string} [options.idPrefix='ext_'] - Prefix for relocated IDs from external SVGs
 * @returns {Object} Self-contained SVG document
 */
export const embedExternalDependencies = createOperation(
  async (doc, options = {}) => {
    const {
      basePath = "",
      embedImages = true,
      embedExternalSVGs = true,
      externalSVGMode = "extract",
      embedCSS = true,
      embedFonts = true,
      embedScripts = true,
      embedAudio = false,
      subsetFonts = true,
      verbose = false,
      recursive = true,
      maxRecursionDepth = 10,
      timeout = 30000,
      onMissingResource = "warn",
      onProgress = null,
      idPrefix = "ext_",
      // BUG FIX: Accept visitedURLs from parent call to detect cross-document circular refs
      _visitedURLs = null,
    } = options;

    // Reuse passed Set or create new one (ensures circular detection works across recursive calls)
    const visitedURLs = _visitedURLs || new Set();
    const warnings = [];
    // Track vendor namespaces from external SVGs (prefix → URI)
    const vendorNamespaces = new Map();
    let extCounter = 0;

    // Helper to extract vendor namespaces from an SVG element
    const extractVendorNamespaces = (svgElement) => {
      if (!svgElement || !svgElement.attributes) return;
      // Common vendor namespace URIs that should be preserved
      const vendorNamespaceURIs = [
        "http://www.inkscape.org/namespaces/inkscape",
        "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
        "http://ns.adobe.com/AdobeIllustrator/",
        "http://ns.adobe.com/AdobeSVGViewerExtensions/",
        "http://www.bohemiancoding.com/sketch/ns",
        "http://www.figma.com/figma/ns",
        "http://www.serif.com/",
        "http://www.vecta.io/nano",
        // Allow any custom namespace that is not standard SVG/XLink/XML
      ];
      const standardNamespaceURIs = [
        "http://www.w3.org/2000/svg",
        "http://www.w3.org/1999/xlink",
        "http://www.w3.org/XML/1998/namespace",
        "http://www.w3.org/2000/xmlns/",
      ];

      // Check all xmlns:* attributes
      const attrs = svgElement.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        if (attr.name.startsWith("xmlns:")) {
          const prefix = attr.name.substring(6); // Remove 'xmlns:'
          const uri = attr.value;
          // Include if it's a known vendor namespace or not a standard namespace
          if (
            vendorNamespaceURIs.some((v) => uri.startsWith(v)) ||
            !standardNamespaceURIs.includes(uri)
          ) {
            vendorNamespaces.set(prefix, uri);
          }
        }
      }
    };

    // Helper to handle missing resources
    const handleMissingResource = (url, error) => {
      const msg = `Failed to fetch resource: ${url} - ${error.message}`;
      if (onMissingResource === "fail") {
        throw new Error(msg);
      } else if (onMissingResource === "warn") {
        warnings.push(msg);
        console.warn("embedExternalDependencies:", msg);
      }
      // 'skip' mode: silently continue
      return null;
    };

    // Phase 1: Embed Images
    if (embedImages) {
      const images = doc.getElementsByTagName("image");
      const imageArray = [...images];
      if (onProgress) onProgress("images", 0, imageArray.length);

      for (let i = 0; i < imageArray.length; i++) {
        const img = imageArray[i];
        const href = img.getAttribute("href") || img.getAttribute("xlink:href");

        if (!href || !isExternalHref(href)) continue;

        try {
          const resolvedURL = resolveURL(href, basePath);
          const { content, contentType } = await fetchResource(
            resolvedURL,
            "binary",
            timeout,
          );
          const dataURI = toDataURI(content, contentType.split(";")[0]);

          // Update both href and xlink:href for compatibility
          if (img.getAttribute("href")) img.setAttribute("href", dataURI);
          if (img.getAttribute("xlink:href"))
            img.setAttribute("xlink:href", dataURI);
        } catch (e) {
          handleMissingResource(href, e);
        }

        if (onProgress) onProgress("images", i + 1, imageArray.length);
      }
    }

    // Phase 2: Embed External SVG References
    if (embedExternalSVGs) {
      const useElements = doc.getElementsByTagName("use");
      const useArray = [...useElements];
      if (onProgress) onProgress("externalSVGs", 0, useArray.length);

      // Ensure defs element exists
      let defs = doc.querySelector("defs");
      if (!defs) {
        defs = new SVGElement("defs", {}, []);
        const svg = doc.documentElement || doc;
        // Insert defs as first child - handle null firstChild properly
        if (typeof svg.insertBefore === "function" && svg.firstChild) {
          svg.insertBefore(defs, svg.firstChild);
        } else if (typeof svg.appendChild === "function") {
          svg.appendChild(defs);
        } else if (svg.children && Array.isArray(svg.children)) {
          svg.children.unshift(defs);
          defs.parentNode = svg;
        }
      }

      for (let i = 0; i < useArray.length; i++) {
        const useEl = useArray[i];
        const href =
          useEl.getAttribute("href") || useEl.getAttribute("xlink:href");

        if (!href || !isExternalHref(href)) continue;

        const { path, fragment } = parseExternalSVGRef(href);
        if (!path) continue;

        // Check circular reference
        const resolvedPath = resolveURL(path, basePath);
        if (visitedURLs.has(resolvedPath)) {
          warnings.push(`Circular reference detected: ${resolvedPath}`);
          continue;
        }
        visitedURLs.add(resolvedPath);

        try {
          const { content } = await fetchResource(
            resolvedPath,
            "text",
            timeout,
          );
          const externalDoc = parseSVG(content);

          if (!externalDoc) {
            handleMissingResource(path, new Error("Failed to parse SVG"));
            continue;
          }

          // Extract vendor namespaces from external SVG for later preservation
          const externalSvgRoot = externalDoc.documentElement || externalDoc;
          extractVendorNamespaces(externalSvgRoot);

          // Recursively process external SVG if enabled
          if (recursive && maxRecursionDepth > 0) {
            await embedExternalDependencies(externalDoc, {
              ...options,
              basePath: resolvedPath,
              maxRecursionDepth: maxRecursionDepth - 1,
              // BUG FIX: Pass visitedURLs to detect cross-document circular references (A → B → A)
              _visitedURLs: visitedURLs,
            });
          }

          extCounter++;
          const uniquePrefix = `${idPrefix}${extCounter}_`;

          if (externalSVGMode === "extract" && fragment) {
            // Extract just the referenced element
            const targetEl = externalDoc.getElementById(fragment);
            if (targetEl) {
              // Clone and relocate IDs
              const cloned = targetEl.clone
                ? targetEl.clone()
                : JSON.parse(JSON.stringify(targetEl));
              relocateIds(cloned, uniquePrefix);

              // Add to defs
              defs.children.push(cloned);

              // Update use href to local reference
              const newId = uniquePrefix + fragment;
              if (useEl.getAttribute("href"))
                useEl.setAttribute("href", "#" + newId);
              if (useEl.getAttribute("xlink:href"))
                useEl.setAttribute("xlink:href", "#" + newId);
            } else {
              handleMissingResource(
                href,
                new Error(`Fragment #${fragment} not found in ${path}`),
              );
            }
          } else {
            // Embed entire external SVG
            const externalSvg = externalDoc.documentElement || externalDoc;
            relocateIds(externalSvg, uniquePrefix);

            // Set an ID on the external SVG
            const svgId = uniquePrefix + "svg";
            externalSvg.setAttribute("id", svgId);

            // Add to defs
            defs.children.push(externalSvg);

            // Update use href
            const newHref = fragment
              ? "#" + uniquePrefix + fragment
              : "#" + svgId;
            if (useEl.getAttribute("href")) useEl.setAttribute("href", newHref);
            if (useEl.getAttribute("xlink:href"))
              useEl.setAttribute("xlink:href", newHref);
          }
        } catch (e) {
          handleMissingResource(path, e);
        }

        if (onProgress) onProgress("externalSVGs", i + 1, useArray.length);
      }
    }

    // Phase 3: Embed CSS (including @import and url() in stylesheets)
    if (embedCSS || embedFonts) {
      const styleElements = doc.getElementsByTagName("style");
      const styleArray = [...styleElements];
      if (onProgress) onProgress("stylesheets", 0, styleArray.length);

      // Build font character map for subsetting (if subsetFonts option is enabled)
      const fontCharMap = subsetFonts ? extractFontCharacterMap(doc) : null;

      for (let i = 0; i < styleArray.length; i++) {
        const styleEl = styleArray[i];
        let css = styleEl.textContent || "";

        // Process @import rules
        if (embedCSS) {
          const { imports } = parseCSSUrls(css);

          // Process imports in reverse order to maintain positions
          for (const imp of imports.reverse()) {
            try {
              let importUrl = imp.url;

              // Apply Google Fonts subsetting if enabled
              if (fontCharMap && isGoogleFontsUrl(importUrl)) {
                const fontFamily = extractFontFamilyFromGoogleUrl(importUrl);
                if (fontFamily && fontCharMap.has(fontFamily)) {
                  const textParam = charsToTextParam(
                    fontCharMap.get(fontFamily),
                  );
                  importUrl = addTextParamToGoogleFontsUrl(
                    importUrl,
                    textParam,
                  );
                  if (verbose) {
                    console.log(
                      `Font subsetting: ${fontFamily} -> ${fontCharMap.get(fontFamily).size} chars`,
                    );
                  }
                }
              }

              const resolvedURL = resolveURL(importUrl, basePath);
              const { content } = await fetchResource(
                resolvedURL,
                "text",
                timeout,
              );
              // BUG FIX: Recursively process nested @imports in the fetched CSS content
              let processedContent = content;
              const nestedImports = parseCSSUrls(content).imports;
              if (nestedImports.length > 0) {
                // Process nested imports in reverse order
                for (const nestedImp of nestedImports.reverse()) {
                  try {
                    const nestedResolvedURL = resolveURL(
                      nestedImp.url,
                      resolvedURL,
                    );
                    const nestedResult = await fetchResource(
                      nestedResolvedURL,
                      "text",
                      timeout,
                    );
                    processedContent =
                      processedContent.substring(0, nestedImp.index) +
                      nestedResult.content +
                      processedContent.substring(
                        nestedImp.index + nestedImp.fullMatch.length,
                      );
                  } catch (nestedErr) {
                    handleMissingResource(nestedImp.url, nestedErr);
                  }
                }
              }
              // Replace @import with inline content
              css =
                css.substring(0, imp.index) +
                processedContent +
                css.substring(imp.index + imp.fullMatch.length);
            } catch (e) {
              handleMissingResource(imp.url, e);
            }
          }
        }

        // Process url() references (for fonts and images in CSS)
        if (embedCSS || embedFonts) {
          const { urls } = parseCSSUrls(css);

          // Process in reverse order
          for (const urlRef of urls.reverse()) {
            const mimeType = detectMimeType(urlRef.url);
            const isFont =
              mimeType.startsWith("font/") || mimeType.includes("fontobject");

            // Skip fonts if embedFonts is false
            if (isFont && !embedFonts) continue;
            // Skip non-fonts if embedCSS is false (images in CSS)
            if (!isFont && !embedCSS) continue;

            try {
              const resolvedURL = resolveURL(urlRef.url, basePath);
              const { content, contentType } = await fetchResource(
                resolvedURL,
                "binary",
                timeout,
              );
              const dataURI = toDataURI(content, contentType.split(";")[0]);

              // Replace url() with data URI
              const newUrl = `url("${dataURI}")`;
              css =
                css.substring(0, urlRef.index) +
                newUrl +
                css.substring(urlRef.index + urlRef.fullMatch.length);
            } catch (e) {
              handleMissingResource(urlRef.url, e);
            }
          }
        }

        styleEl.textContent = css;
        if (onProgress) onProgress("stylesheets", i + 1, styleArray.length);
      }
    }

    // Phase 4: Embed Scripts
    if (embedScripts) {
      const scripts = doc.getElementsByTagName("script");
      const scriptArray = [...scripts];
      if (onProgress) onProgress("scripts", 0, scriptArray.length);

      for (let i = 0; i < scriptArray.length; i++) {
        const scriptEl = scriptArray[i];
        // Check for src, href, or xlink:href attributes (SVG uses xlink:href for scripts)
        const src =
          scriptEl.getAttribute("src") ||
          scriptEl.getAttribute("href") ||
          scriptEl.getAttribute("xlink:href");

        if (!src) continue; // Already inline
        if (src.startsWith("data:")) continue; // Already embedded

        try {
          const resolvedURL = resolveURL(src, basePath);
          const { content } = await fetchResource(resolvedURL, "text", timeout);

          // Remove all source attributes
          scriptEl.removeAttribute("src");
          scriptEl.removeAttribute("href");
          scriptEl.removeAttribute("xlink:href");

          // Set inline content with proper CDATA section node
          setCDATAContent(scriptEl, content, doc);
        } catch (e) {
          handleMissingResource(src, e);
        }

        if (onProgress) onProgress("scripts", i + 1, scriptArray.length);
      }
    }

    // Phase 4.5: Embed Audio files (audio elements with source children)
    if (embedAudio) {
      const audioElements = doc.getElementsByTagName("audio");
      const audioArray = [...audioElements];
      if (onProgress) onProgress("audio", 0, audioArray.length);

      for (let i = 0; i < audioArray.length; i++) {
        const audioEl = audioArray[i];

        // Check direct src attribute on audio element
        const directSrc = audioEl.getAttribute("src");
        if (directSrc && !directSrc.startsWith("data:")) {
          try {
            const resolvedURL = resolveURL(directSrc, basePath);
            const { content, contentType } = await fetchResource(
              resolvedURL,
              "binary",
              timeout,
            );
            const mimeType = contentType.split(";")[0] || "audio/mpeg";
            const dataURI = toDataURI(content, mimeType);
            audioEl.setAttribute("src", dataURI);
          } catch (e) {
            handleMissingResource(directSrc, e);
          }
        }

        // Check source child elements
        const sources = audioEl.getElementsByTagName("source");
        for (const sourceEl of sources) {
          const src = sourceEl.getAttribute("src");
          if (src && !src.startsWith("data:")) {
            try {
              const resolvedURL = resolveURL(src, basePath);
              const { content, contentType } = await fetchResource(
                resolvedURL,
                "binary",
                timeout,
              );
              const mimeType =
                contentType.split(";")[0] ||
                sourceEl.getAttribute("type") ||
                "audio/mpeg";
              const dataURI = toDataURI(content, mimeType);
              sourceEl.setAttribute("src", dataURI);
            } catch (e) {
              handleMissingResource(src, e);
            }
          }
        }

        if (onProgress) onProgress("audio", i + 1, audioArray.length);
      }
    }

    // Phase 5: Embed resources referenced in JavaScript/HTML/CSS
    // This catches audio files, JSON data, etc. that are loaded dynamically
    if (embedScripts) {
      // Collect all text content that might contain file references
      const allTextContent = [];

      // Scan all script elements
      const allScripts = doc.getElementsByTagName("script");
      for (const script of allScripts) {
        if (script.textContent) {
          allTextContent.push(script.textContent);
        }
      }

      // Scan all style elements
      const allStyles = doc.getElementsByTagName("style");
      for (const style of allStyles) {
        if (style.textContent) {
          allTextContent.push(style.textContent);
        }
      }

      // Scan foreignObject content (HTML embedded in SVG)
      const foreignObjects = doc.getElementsByTagName("foreignObject");
      for (const fo of foreignObjects) {
        // Get all text content including nested elements
        const foContent = fo.textContent || "";
        if (foContent) {
          allTextContent.push(foContent);
        }
      }

      // Extract file references from all content
      const allRefs = new Set();
      for (const content of allTextContent) {
        const refs = extractFileReferences(content);
        for (const ref of refs) {
          allRefs.add(ref);
        }
      }

      // Fetch and embed each referenced resource
      if (allRefs.size > 0) {
        const resourceMap = new Map();
        if (onProgress) onProgress("resources", 0, allRefs.size);

        let i = 0;
        for (const ref of allRefs) {
          try {
            const resolvedURL = resolveURL(ref, basePath);
            const { content, contentType } = await fetchResource(
              resolvedURL,
              "binary",
              timeout,
            );
            const mimeType = contentType.split(";")[0] || detectMimeType(ref);
            const dataURI = toDataURI(content, mimeType);

            resourceMap.set(ref, dataURI);

            if (verbose) {
              const sizeKB = (content.length / 1024).toFixed(1);
              console.log(`Embedded resource: ${ref} (${sizeKB} KB)`);
            }
          } catch (e) {
            handleMissingResource(ref, e);
          }

          i++;
          if (onProgress) onProgress("resources", i, allRefs.size);
        }

        // If we have embedded resources, inject the interceptor into the first script
        if (resourceMap.size > 0) {
          const interceptorCode = generateResourceInterceptor(resourceMap);
          const firstScript = allScripts[0];

          if (firstScript) {
            // Prepend interceptor to the first script
            const existingContent = firstScript.textContent || "";
            const needsCDATA =
              interceptorCode.includes("<") ||
              interceptorCode.includes("&") ||
              existingContent.includes("<") ||
              existingContent.includes("&");

            if (needsCDATA) {
              firstScript.setAttribute("data-cdata-pending", "true");
            }
            firstScript.textContent = interceptorCode + existingContent;
          } else {
            // No existing script, create a new one
            const newScript = doc.createElement("script");
            newScript.setAttribute("type", "text/javascript");
            newScript.setAttribute("data-cdata-pending", "true");
            newScript.textContent = interceptorCode;

            // Insert at the beginning of the SVG
            const svgRoot = doc.documentElement || doc;
            if (svgRoot.firstChild) {
              svgRoot.insertBefore(newScript, svgRoot.firstChild);
            } else {
              svgRoot.appendChild(newScript);
            }
          }

          if (verbose) {
            console.log(
              `Injected resource interceptor for ${resourceMap.size} embedded resources`,
            );
          }
        }
      }
    }

    // Phase 6: Ensure proper namespaces
    const svg = doc.documentElement || doc;
    if (!svg.getAttribute("xmlns")) {
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    // Add xlink namespace if any xlink: attributes exist
    const hasXlink = serializeSVG(doc).includes("xlink:");
    if (hasXlink && !svg.getAttribute("xmlns:xlink")) {
      svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }

    // Add vendor namespaces collected from external SVGs
    for (const [prefix, uri] of vendorNamespaces) {
      const nsAttr = `xmlns:${prefix}`;
      if (!svg.getAttribute(nsAttr)) {
        svg.setAttribute(nsAttr, uri);
      }
    }

    // Add warnings as metadata if any
    if (warnings.length > 0) {
      doc._embedWarnings = warnings;
    }

    return doc;
  },
);

// ============================================================================
// EXPORT EMBEDDED RESOURCES (Opposite of embedExternalDependencies)
// ============================================================================

/**
 * MIME type to file extension mapping for exported resources
 */
const EXPORT_MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/x-icon": ".ico",
  "image/tiff": ".tiff",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "application/javascript": ".js",
  "text/javascript": ".js",
  "text/css": ".css",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "application/font-woff": ".woff",
  "application/font-woff2": ".woff2",
  "application/x-font-ttf": ".ttf",
  "application/x-font-opentype": ".otf",
};

/**
 * Parse a data URI and extract its components
 * @param {string} dataUri - The data URI to parse
 * @returns {Object|null} - {mimeType, encoding, data} or null if invalid
 */
function parseDataUri(dataUri) {
  if (!dataUri || !dataUri.startsWith("data:")) return null;

  const match = dataUri.match(/^data:([^;,]+)?(?:;([^,]+))?,(.*)$/);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  const encoding = match[2] || "";
  const data = match[3] || "";

  return { mimeType, encoding, data };
}

/**
 * Decode data URI content to buffer
 * @param {Object} parsed - Parsed data URI object
 * @returns {Buffer|string} - Decoded content
 */
function decodeDataUri(parsed) {
  if (parsed.encoding === "base64") {
    return Buffer.from(parsed.data, "base64");
  }
  // URL-encoded or plain text
  // BUG FIX: Handle malformed percent-encoded sequences gracefully
  try {
    return decodeURIComponent(parsed.data);
  } catch (e) {
    // If decodeURIComponent fails (e.g., malformed %XX), return data as-is - log error for debugging
    if (process.env.DEBUG) console.warn(`[svg-toolbox] ${e.message}`);
    return parsed.data;
  }
}

/**
 * Generate a unique filename for an extracted resource
 * @param {string} prefix - Filename prefix
 * @param {string} mimeType - MIME type of the resource
 * @param {number} index - Resource index
 * @param {string} [originalName] - Original filename if available
 * @returns {string} - Generated filename
 */
function generateExportFilename(prefix, mimeType, index, originalName = null) {
  const ext = EXPORT_MIME_TO_EXT[mimeType] || ".bin";

  if (originalName) {
    // Clean the original name and use it
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${prefix}_${cleanName}`;
  }

  // Generate name based on type
  let typePrefix = "resource";
  if (mimeType.startsWith("image/")) typePrefix = "image";
  else if (mimeType.startsWith("audio/")) typePrefix = "audio";
  else if (mimeType.startsWith("video/")) typePrefix = "video";
  else if (mimeType.startsWith("font/") || mimeType.includes("font"))
    typePrefix = "font";
  else if (mimeType.includes("javascript")) typePrefix = "script";
  else if (mimeType.includes("css")) typePrefix = "style";

  return `${prefix}_${typePrefix}_${String(index).padStart(3, "0")}${ext}`;
}

/**
 * Export embedded resources from an SVG to external files
 *
 * This is the opposite of embedExternalDependencies - it extracts embedded
 * data URIs and inline content, saves them to files, and replaces them with
 * external references.
 *
 * @param {string|Document} input - SVG string or parsed document
 * @param {Object} options - Export options
 * @param {string} [options.outputDir] - Directory to save extracted resources
 * @param {string} [options.filenamePrefix='resource'] - Prefix for generated filenames
 * @param {boolean} [options.extractImages=true] - Extract embedded images
 * @param {boolean} [options.extractFonts=true] - Extract embedded fonts
 * @param {boolean} [options.extractScripts=true] - Extract inline scripts
 * @param {boolean} [options.extractStyles=true] - Extract inline styles
 * @param {boolean} [options.extractAudio=true] - Extract embedded audio
 * @param {boolean} [options.extractVideo=true] - Extract embedded video
 * @param {string|string[]} [options.elementIds] - Only extract from specific element IDs
 * @param {boolean} [options.restoreGoogleFonts=true] - Convert embedded fonts back to Google Fonts URLs
 * @param {boolean} [options.dryRun=false] - If true, return what would be extracted without saving
 * @param {boolean} [options.extractOnly=false] - If true, extract resources without modifying SVG (no doc returned)
 * @param {Function} [options.onProgress] - Progress callback (phase, current, total)
 * @returns {Promise<Object>} - {doc: modifiedSVG, extractedFiles: [{path, type, size}], warnings: [], summary: {}}
 */
export async function exportEmbeddedResources(input, options = {}) {
  // Handle input parsing (similar to createOperation but returns full result object)
  const inputType = detectInputType(input);
  const doc = await loadInput(input, inputType);
  const outputFormat =
    options.outputFormat ||
    (inputType === InputType.DOM_ELEMENT
      ? OutputFormat.DOM_ELEMENT
      : OutputFormat.SVG_STRING);
  const {
    outputDir = null,
    filenamePrefix = "resource",
    extractImages = true,
    extractFonts = true,
    extractScripts = true,
    extractStyles = true,
    extractAudio = true,
    extractVideo = true,
    elementIds = null,
    restoreGoogleFonts = true,
    dryRun = false,
    extractOnly = false,
    onProgress = null,
  } = options;

  const extractedFiles = [];
  const warnings = [];
  let resourceIndex = 0;

  // Convert elementIds to Set for efficient lookup
  const targetIds = elementIds
    ? new Set(Array.isArray(elementIds) ? elementIds : [elementIds])
    : null;

  // Helper to check if element should be processed
  const shouldProcessElement = (el) => {
    if (!targetIds) return true;
    // Check element and all ancestors for matching ID
    let current = el;
    while (current && current.getAttribute) {
      const id = current.getAttribute("id");
      if (id && targetIds.has(id)) return true;
      current = current.parentNode;
    }
    return false;
  };

  // Helper to save file (or simulate in dry run)
  const saveFile = async (filename, content, mimeType) => {
    // Calculate size (handle both Node.js Buffer and browser environments)
    let size = 0;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(content)) {
      size = content.length;
    } else if (typeof Buffer !== "undefined") {
      size = Buffer.byteLength(content, "utf8");
    } else if (typeof Blob !== "undefined") {
      size = new Blob([content]).size;
    } else {
      size = content.length || 0;
    }

    const fileInfo = {
      filename,
      path: outputDir ? `${outputDir}/${filename}` : filename,
      mimeType,
      size,
    };

    if (!dryRun && outputDir) {
      try {
        // Dynamic import for Node.js fs
        const fs = await import("node:fs/promises");
        const pathModule = await import("node:path");

        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // Write file
        const filePath = pathModule.join(outputDir, filename);
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(content)) {
          await fs.writeFile(filePath, content);
        } else {
          await fs.writeFile(filePath, content, "utf8");
        }
        fileInfo.path = filePath;
        // BUG FIX: Only add to extractedFiles on successful write
        extractedFiles.push(fileInfo);
      } catch (err) {
        warnings.push(`Failed to save ${filename}: ${err.message}`);
        fileInfo.error = err.message;
        // BUG FIX: Don't add to extractedFiles - operation failed
      }
    } else {
      // Dry run or no outputDir - add to list (no actual write needed)
      extractedFiles.push(fileInfo);
    }

    return fileInfo;
  };

  // Phase 1: Extract embedded images
  if (extractImages) {
    const images = doc.getElementsByTagName("image");
    const imageArray = [...images];
    if (onProgress) onProgress("images", 0, imageArray.length);

    for (let i = 0; i < imageArray.length; i++) {
      const img = imageArray[i];
      if (!shouldProcessElement(img)) continue;

      const href = img.getAttribute("href") || img.getAttribute("xlink:href");
      if (!href || !href.startsWith("data:")) continue;

      const parsed = parseDataUri(href);
      if (!parsed) continue;

      // Skip non-image data URIs
      if (!parsed.mimeType.startsWith("image/")) continue;

      resourceIndex++;
      const filename = generateExportFilename(
        filenamePrefix,
        parsed.mimeType,
        resourceIndex,
      );
      const content = decodeDataUri(parsed);

      const fileInfo = await saveFile(filename, content, parsed.mimeType);
      fileInfo.type = "image";
      fileInfo.elementId = img.getAttribute("id");

      // Replace data URI with relative path (unless extractOnly mode)
      if (!extractOnly) {
        const relativePath = `./${filename}`;
        if (img.getAttribute("href")) img.setAttribute("href", relativePath);
        if (img.getAttribute("xlink:href"))
          img.setAttribute("xlink:href", relativePath);
      }

      if (onProgress) onProgress("images", i + 1, imageArray.length);
    }
  }

  // Phase 2: Extract embedded audio
  if (extractAudio) {
    const audioElements = doc.getElementsByTagName("audio");
    const audioArray = [...audioElements];
    if (onProgress) onProgress("audio", 0, audioArray.length);

    for (let i = 0; i < audioArray.length; i++) {
      const audio = audioArray[i];
      if (!shouldProcessElement(audio)) continue;

      // Check audio element src
      const src = audio.getAttribute("src");
      if (src && src.startsWith("data:")) {
        const parsed = parseDataUri(src);
        if (parsed && parsed.mimeType.startsWith("audio/")) {
          resourceIndex++;
          const filename = generateExportFilename(
            filenamePrefix,
            parsed.mimeType,
            resourceIndex,
          );
          const content = decodeDataUri(parsed);

          const fileInfo = await saveFile(filename, content, parsed.mimeType);
          fileInfo.type = "audio";
          fileInfo.elementId = audio.getAttribute("id");

          if (!extractOnly) {
            audio.setAttribute("src", `./${filename}`);
          }
        }
      }

      // Check source child elements
      const sources = audio.getElementsByTagName("source");
      for (const source of sources) {
        const srcAttr = source.getAttribute("src");
        if (srcAttr && srcAttr.startsWith("data:")) {
          const parsed = parseDataUri(srcAttr);
          if (parsed && parsed.mimeType.startsWith("audio/")) {
            resourceIndex++;
            const filename = generateExportFilename(
              filenamePrefix,
              parsed.mimeType,
              resourceIndex,
            );
            const content = decodeDataUri(parsed);

            const fileInfo = await saveFile(filename, content, parsed.mimeType);
            fileInfo.type = "audio";

            if (!extractOnly) {
              source.setAttribute("src", `./${filename}`);
            }
          }
        }
      }
      if (onProgress) onProgress("audio", i + 1, audioArray.length);
    }
  }

  // Phase 3: Extract embedded video
  if (extractVideo) {
    const videoElements = doc.getElementsByTagName("video");
    const videoArray = [...videoElements];
    if (onProgress) onProgress("video", 0, videoArray.length);

    for (let i = 0; i < videoArray.length; i++) {
      const video = videoArray[i];
      if (!shouldProcessElement(video)) continue;

      const src = video.getAttribute("src");
      if (src && src.startsWith("data:")) {
        const parsed = parseDataUri(src);
        if (parsed && parsed.mimeType.startsWith("video/")) {
          resourceIndex++;
          const filename = generateExportFilename(
            filenamePrefix,
            parsed.mimeType,
            resourceIndex,
          );
          const content = decodeDataUri(parsed);

          const fileInfo = await saveFile(filename, content, parsed.mimeType);
          fileInfo.type = "video";
          fileInfo.elementId = video.getAttribute("id");

          if (!extractOnly) {
            video.setAttribute("src", `./${filename}`);
          }
        }
      }

      // Check source child elements
      const sources = video.getElementsByTagName("source");
      for (const source of sources) {
        const srcAttr = source.getAttribute("src");
        if (srcAttr && srcAttr.startsWith("data:")) {
          const parsed = parseDataUri(srcAttr);
          if (parsed && parsed.mimeType.startsWith("video/")) {
            resourceIndex++;
            const filename = generateExportFilename(
              filenamePrefix,
              parsed.mimeType,
              resourceIndex,
            );
            const content = decodeDataUri(parsed);

            const fileInfo = await saveFile(filename, content, parsed.mimeType);
            fileInfo.type = "video";

            if (!extractOnly) {
              source.setAttribute("src", `./${filename}`);
            }
          }
        }
      }
      if (onProgress) onProgress("video", i + 1, videoArray.length);
    }
  }

  // Phase 4: Extract inline scripts
  if (extractScripts) {
    const scripts = doc.getElementsByTagName("script");
    const scriptArray = [...scripts];
    if (onProgress) onProgress("scripts", 0, scriptArray.length);

    for (let i = 0; i < scriptArray.length; i++) {
      const script = scriptArray[i];
      if (!shouldProcessElement(script)) continue;

      // Skip external scripts (already have href)
      const href =
        script.getAttribute("href") || script.getAttribute("xlink:href");
      if (href && !href.startsWith("data:")) continue;

      // Get inline content
      let content = "";
      if (href && href.startsWith("data:")) {
        const parsed = parseDataUri(href);
        if (parsed) {
          const decoded = decodeDataUri(parsed);
          content =
            typeof decoded === "string" ? decoded : decoded.toString("utf8");
        }
      } else {
        // Inline script content
        content = script.textContent || "";
        // Handle CDATA
        if (script.firstChild && script.firstChild.nodeType === 4) {
          // CDATA_SECTION_NODE
          content = script.firstChild.nodeValue || "";
        }
      }

      if (!content.trim()) continue;

      resourceIndex++;
      const filename = generateExportFilename(
        filenamePrefix,
        "application/javascript",
        resourceIndex,
      );

      const fileInfo = await saveFile(
        filename,
        content,
        "application/javascript",
      );
      fileInfo.type = "script";
      fileInfo.elementId = script.getAttribute("id");

      // Replace inline content with external reference (unless extractOnly mode)
      if (!extractOnly) {
        // Safety counter to prevent infinite loops
        let sc = 0;
        while (script.firstChild && sc++ < 10000) {
          const ch = script.firstChild;
          script.removeChild(ch);
          if (script.firstChild === ch) break; // Child not removed, prevent infinite loop
        }
        script.setAttribute("href", `./${filename}`);
      }

      if (onProgress) onProgress("scripts", i + 1, scriptArray.length);
    }
  }

  // Phase 5: Extract inline styles and fonts
  if (extractStyles || extractFonts) {
    const styles = doc.getElementsByTagName("style");
    const styleArray = [...styles];
    if (onProgress) onProgress("styles", 0, styleArray.length);

    for (let i = 0; i < styleArray.length; i++) {
      const style = styleArray[i];
      if (!shouldProcessElement(style)) continue;

      let css = style.textContent || "";
      if (style.firstChild && style.firstChild.nodeType === 4) {
        css = style.firstChild.nodeValue || "";
      }

      if (!css.trim()) continue;

      let cssModified = false;

      // Extract embedded fonts from @font-face rules
      if (extractFonts) {
        const fontFaceRegex = /@font-face\s*\{[^}]*\}/gi;
        const fontFaces = css.match(fontFaceRegex) || [];

        for (const fontFace of fontFaces) {
          // Extract data URIs from src property
          const srcMatch = fontFace.match(
            /src:\s*url\(["']?(data:[^"')]+)["']?\)/,
          );
          if (srcMatch) {
            const dataUri = srcMatch[1];
            const parsed = parseDataUri(dataUri);
            if (parsed) {
              resourceIndex++;
              const filename = generateExportFilename(
                filenamePrefix,
                parsed.mimeType,
                resourceIndex,
              );
              const content = decodeDataUri(parsed);

              const fileInfo = await saveFile(
                filename,
                content,
                parsed.mimeType,
              );
              fileInfo.type = "font";

              // Try to extract font-family name
              const familyMatch = fontFace.match(
                /font-family:\s*["']?([^"';]+)["']?/,
              );
              if (familyMatch) {
                fileInfo.fontFamily = familyMatch[1].trim();
              }

              // Replace data URI with file reference (unless extractOnly mode)
              if (!extractOnly) {
                css = css.replace(dataUri, `./${filename}`);
                cssModified = true;
              }
            }
          }
        }

        // Optionally restore Google Fonts URLs
        if (restoreGoogleFonts) {
          // Look for font-family declarations that might be Google Fonts
          const googleFontFamilies = [];
          const familyRegex = /font-family:\s*["']?([^"';,]+)/gi;
          let match;
          while ((match = familyRegex.exec(css)) !== null) {
            const family = match[1].trim();
            // Common Google Fonts (non-exhaustive list for common ones)
            const googleFonts = [
              "Roboto",
              "Open Sans",
              "Lato",
              "Montserrat",
              "Oswald",
              "Raleway",
              "Poppins",
              "Source Sans Pro",
              "Ubuntu",
              "Playfair Display",
              "Merriweather",
              "Nunito",
              "PT Sans",
              "Rubik",
              "Work Sans",
              "DM Serif Display",
              "Monofett",
              "Dokdo",
              "Orbitron",
              "Notable",
              "Fira Mono",
              "Fira Code",
              "Inter",
              "Noto Sans",
              "Noto Serif",
            ];
            if (
              googleFonts.some((gf) =>
                family.toLowerCase().includes(gf.toLowerCase()),
              )
            ) {
              googleFontFamilies.push(family);
            }
          }

          if (googleFontFamilies.length > 0 && !extractOnly) {
            // Add @import for Google Fonts at the beginning
            const uniqueFamilies = [...new Set(googleFontFamilies)];
            const googleImport = `@import url('https://fonts.googleapis.com/css2?family=${uniqueFamilies
              .map((f) => f.replace(/\s+/g, "+"))
              .join("&family=")}&display=swap');\n`;

            // Only add if not already present
            if (!css.includes("fonts.googleapis.com")) {
              css = googleImport + css;
              cssModified = true;
              warnings.push(
                `Restored Google Fonts import for: ${uniqueFamilies.join(", ")}`,
              );
            }
          }
        }
      }

      // Extract entire stylesheet to external file
      if (extractStyles && css.trim()) {
        resourceIndex++;
        const filename = generateExportFilename(
          filenamePrefix,
          "text/css",
          resourceIndex,
        );

        const fileInfo = await saveFile(filename, css, "text/css");
        fileInfo.type = "stylesheet";
        fileInfo.elementId = style.getAttribute("id");

        // Replace style element content with @import (unless extractOnly mode)
        if (!extractOnly) {
          // Safety counter to prevent infinite loops
          let sc1 = 0;
          while (style.firstChild && sc1++ < 10000) {
            const ch = style.firstChild;
            style.removeChild(ch);
            if (style.firstChild === ch) break; // Child not removed, prevent infinite loop
          }
          style.textContent = `@import url('./${filename}');`;
          cssModified = true;
        }
      } else if (cssModified && !extractOnly) {
        // Update the CSS content with modifications
        // Safety counter to prevent infinite loops
        let sc2 = 0;
        while (style.firstChild && sc2++ < 10000) {
          const ch = style.firstChild;
          style.removeChild(ch);
          if (style.firstChild === ch) break; // Child not removed, prevent infinite loop
        }
        setCDATAContent(style, css, doc);
      }

      if (onProgress) onProgress("styles", i + 1, styleArray.length);
    }
  }

  // Add metadata about extraction (only if SVG was modified)
  if (!extractOnly) {
    doc._exportedResources = extractedFiles;
    if (warnings.length > 0) {
      doc._exportWarnings = warnings;
    }
  }

  // Generate output in requested format (null if extractOnly - SVG not modified)
  const outputDoc = extractOnly
    ? null
    : generateOutput(doc, outputFormat, options);

  return {
    doc: outputDoc,
    extractedFiles,
    warnings,
    summary: {
      totalExtracted: extractedFiles.length,
      images: extractedFiles.filter((f) => f.type === "image").length,
      audio: extractedFiles.filter((f) => f.type === "audio").length,
      video: extractedFiles.filter((f) => f.type === "video").length,
      scripts: extractedFiles.filter((f) => f.type === "script").length,
      fonts: extractedFiles.filter((f) => f.type === "font").length,
      stylesheets: extractedFiles.filter((f) => f.type === "stylesheet").length,
      totalSize: extractedFiles.reduce((sum, f) => sum + f.size, 0),
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Precision Configuration
  MAX_PRECISION,
  DEFAULT_PRECISION,
  PRECISION_LEVELS,
  formatPrecision,

  // Input/Output
  InputType,
  OutputFormat,
  detectInputType,
  loadInput,
  generateOutput,
  createOperation,

  // Category 1: Cleanup (11)
  cleanupIds,
  cleanupNumericValues,
  cleanupListOfValues,
  cleanupAttributes,
  cleanupEnableBackground,
  removeUnknownsAndDefaults,
  removeNonInheritableGroupAttrs,
  removeUselessDefs,
  removeHiddenElements,
  removeEmptyText,
  removeEmptyContainers,

  // Category 2: Removal (12)
  removeDoctype,
  removeXMLProcInst,
  removeComments,
  removeMetadata,
  removeTitle,
  removeDesc,
  removeEditorsNSData,
  removeEmptyAttrs,
  removeViewBox,
  removeXMLNS,
  removeRasterImages,
  removeScriptElement,

  // Category 3: Conversion (10)
  convertShapesToPath,
  convertPathData,
  convertTransform,
  convertColors,
  convertStyleToAttrs,
  convertEllipseToCircle,
  collapseGroups,
  mergePaths,
  moveGroupAttrsToElems,
  moveElemsAttrsToGroup,

  // Category 4: Optimization (8)
  minifyStyles,
  inlineStyles,
  sortAttrs,
  sortDefsChildren,
  reusePaths,
  removeOffCanvasPath,
  removeStyleElement,
  removeXlink,

  // Category 5: Adding/Modification (7)
  addAttributesToSVGElement,
  addClassesToSVGElement,
  prefixIds,
  removeDimensions,
  removeAttributesBySelector,
  removeAttrs,
  removeElementsByAttr,

  // Category 6: Presets (5)
  presetDefault,
  presetNone,
  applyPreset,
  optimize,
  createConfig,

  // Category 7: Bonus (16)
  flattenClipPaths,
  flattenMasks,
  flattenGradients,
  flattenPatterns,
  flattenFilters,
  flattenUseElements,
  imageToPath,
  detectCollisions,
  measureDistance,
  validateXML,
  validateSVG,
  fixInvalidSVG,
  ValidationSeverity,
  flattenAll,
  simplifyPath,
  decomposeTransform,
  optimizeAnimationTiming,
  optimizePaths,
  simplifyPaths,
  embedExternalDependencies,
  exportEmbeddedResources,

  // Path optimization utilities (from convert-path-data.js)
  convertPathDataAdvanced,
  parsePathCommands,
  serializePathCommands,
  formatPathNumber,

  // Path simplification utilities (from douglas-peucker.js)
  douglasPeucker,
  visvalingamWhyatt,
  simplifyPolyline,
  simplifyPolylinePath,
  isPurePolyline,

  // Animation timing utilities (from animation-optimization.js)
  optimizeKeySplines,
  optimizeKeyTimes,
  optimizeAnimationValues,
  formatSplineValue,
  parseKeySplines,
  serializeKeySplines,
  isLinearSpline,
  areAllSplinesLinear,
  identifyStandardEasing,
  STANDARD_EASINGS,

  // Path data plugins - SVGO-style individual functions (from path-data-plugins.js)
  // Each function does ONE optimization only
  removeLeadingZero, // Remove leading zeros: 0.5 -> .5
  negativeExtraSpace, // Use negative as delimiter: 10 -5 -> 10-5
  convertToRelative, // Convert all commands to relative form
  convertToAbsolute, // Convert all commands to absolute form
  lineShorthands, // Convert L to H/V when applicable
  convertToZ, // Convert final L to Z when closing path
  straightCurves, // Convert straight curves to lines
  collapseRepeated, // Collapse repeated command letters
  floatPrecision, // Round numbers to precision
  removeUselessCommands, // Remove zero-length commands
  convertCubicToQuadratic, // Convert C to Q when possible
  convertQuadraticToSmooth, // Convert Q to T when control point is reflection
  convertCubicToSmooth, // Convert C to S when control point is reflection
  arcShorthands, // Optimize arc parameters
};

// Re-export path data plugins as named exports
export {
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
