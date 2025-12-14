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
import * as PathSimplification from "./path-simplification.js";
import * as TransformDecomposition from "./transform-decomposition.js";
import * as GJKCollision from "./gjk-collision.js";
import * as PathOptimization from "./path-optimization.js";
import * as TransformOptimization from "./transform-optimization.js";
import * as OffCanvasDetection from "./off-canvas-detection.js";
import * as CSSSpecificity from "./css-specificity.js";
import * as GeometryToPath from "./geometry-to-path.js";
import * as SVGFlatten from "./svg-flatten.js";
import {
  SVGRenderingContext,
  createRenderingContext,
  getInheritedProperties
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
  referencesProps,
  inheritableAttrs,
  allowedChildrenPerElement,
  pseudoClasses,
  textElems,
  pathElems,
  elemsGroups,
} from "./svg-collections.js";
import {
  collectAllReferences,
  parseAnimationValueIds,
  parseTimingIds,
  parseCSSIds,
  parseJavaScriptIds,
  ANIMATION_ELEMENTS,
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

/**
 * Check if a value has CSS units (should not be processed numerically)
 * @param {string} val - Attribute value
 * @returns {boolean} True if value has units
 */
function hasUnits(val) {
  if (!val || typeof val !== 'string') return false;
  return /(%|em|rem|px|pt|cm|mm|in|pc|ex|ch|vw|vh|vmin|vmax|Q)$/i.test(val.trim());
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
 * Post-process serialized SVG to fix CDATA sections for script/style elements.
 * This is needed because linkedom doesn't support createCDATASection.
 * Elements marked with data-cdata-pending="true" will have their content
 * properly wrapped in CDATA sections.
 * @param {string} svgString - Serialized SVG string
 * @returns {string} SVG string with proper CDATA sections
 */
function fixCDATASections(svgString) {
  // Pattern to find script/style elements marked with data-cdata-pending
  // and fix their CDATA wrapping
  return svgString.replace(
    /<(script|style)([^>]*)\sdata-cdata-pending="true"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrsBefore, attrsAfter, content) => {
      // Unescape the content that was HTML-escaped by the serializer
      const unescaped = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      // Remove the marker attribute and wrap content in CDATA
      const cleanAttrs = (attrsBefore + attrsAfter).replace(/\s*data-cdata-pending="true"\s*/g, ' ').trim();
      const attrStr = cleanAttrs ? ' ' + cleanAttrs : '';
      return `<${tag}${attrStr}><![CDATA[\n${unescaped}\n]]></${tag}>`;
    }
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
  BROWSER_MIN: 2,      // Safe for all browsers (2 decimal + 4 integer)
  BROWSER_TYPICAL: 6,  // Typical browser rendering precision
  FLOAT32: 7,          // SVG spec minimum (single precision)
  FLOAT64: 15,         // SVG spec recommended (double precision)
  GEOGRAPHIC: 8,       // Meter-level accuracy at equator (0.00001 degree)
  SCIENTIFIC: 20,      // Scientific computing
  MAX: 80,             // Maximum Decimal.js precision
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
  return obj !== null &&
         typeof obj === 'object' &&
         typeof obj.tagName === 'string' &&
         typeof obj.getAttribute === 'function' &&
         typeof obj.setAttribute === 'function';
}

/**
 * Format a Decimal value to string with specified precision.
 * Automatically removes trailing zeros after decimal point.
 * @param {Decimal|number|string} value - Value to format
 * @param {number} precision - Maximum decimal places
 * @returns {string} Formatted string without trailing zeros
 */
export function formatPrecision(value, precision = DEFAULT_PRECISION) {
  const d = D(value);
  // Round to precision, then remove trailing zeros
  const fixed = d.toFixed(precision);
  // Remove trailing zeros after decimal point
  if (fixed.includes('.')) {
    return fixed.replace(/\.?0+$/, '');
  }
  return fixed;
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
  CSS_SELECTOR: "selector",        // Browser: CSS selector like '#my-svg'
  OBJECT_ELEMENT: "object",        // Browser: <object data="file.svg">
  EMBED_ELEMENT: "embed",          // Browser: <embed src="file.svg">
  IFRAME_ELEMENT: "iframe",        // Browser: <iframe src="file.svg">
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
 * Detect input type from value
 * Supports: SVG string, file path, URL, DOM elements, CSS selectors,
 * and browser-specific containers (object, embed, iframe)
 */
export function detectInputType(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("<")) {
      return InputType.SVG_STRING;
    } else if (input.startsWith("http://") || input.startsWith("https://")) {
      return InputType.URL;
    } else if (typeof document !== "undefined" && (trimmed.startsWith("#") || trimmed.startsWith(".") || trimmed.startsWith("["))) {
      // Browser: CSS selector (starts with #, ., or [)
      return InputType.CSS_SELECTOR;
    } else {
      return InputType.FILE_PATH;
    }
  }

  // Browser-specific: HTMLObjectElement
  if (typeof HTMLObjectElement !== "undefined" && input instanceof HTMLObjectElement) {
    return InputType.OBJECT_ELEMENT;
  }

  // Browser-specific: HTMLEmbedElement
  if (typeof HTMLEmbedElement !== "undefined" && input instanceof HTMLEmbedElement) {
    return InputType.EMBED_ELEMENT;
  }

  // Browser-specific: HTMLIFrameElement
  if (typeof HTMLIFrameElement !== "undefined" && input instanceof HTMLIFrameElement) {
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
      if (input && typeof input.serialize === 'function') {
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

    case InputType.XML_DOCUMENT:
      // For JSDOM/browser Documents, serialize and reparse
      const rootEl = input.documentElement || input;
      if (rootEl && typeof rootEl.serialize === 'function') {
        return rootEl;
      }
      if (typeof XMLSerializer !== "undefined") {
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(rootEl);
        return parseSVG(svgStr);
      }
      return rootEl;

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
      if (input.contentDocument && input.contentDocument.documentElement) {
        const svgRoot = input.contentDocument.documentElement;
        if (svgRoot.tagName.toLowerCase() === "svg") {
          return parseSVG(new XMLSerializer().serializeToString(svgRoot));
        }
      }
      throw new Error("HTMLObjectElement: SVG content not accessible (not loaded or cross-origin)");

    case InputType.EMBED_ELEMENT:
      // Browser: <embed src="file.svg">
      if (typeof input.getSVGDocument === "function") {
        const svgDoc = input.getSVGDocument();
        if (svgDoc && svgDoc.documentElement) {
          return parseSVG(new XMLSerializer().serializeToString(svgDoc.documentElement));
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
        throw new Error("HTMLIFrameElement: SVG content not accessible (cross-origin)");
      }
      throw new Error("HTMLIFrameElement: No SVG content found");

    default:
      throw new Error(`Unknown input type: ${type}`);
  }
}

/**
 * Generate output in requested format
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
 * Create operation wrapper for auto input/output handling
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
 * Remove unused IDs, minify used IDs
 * P3-1: URL encoding/decoding handling
 * P3-3: Orphaned ID collision detection
 * P3-4: Use referencesProps for targeted attribute scanning
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
    const hasScript = doc.querySelectorAll('script').length > 0;
    const hasStyleWithContent = Array.from(doc.querySelectorAll('style'))
      .some(style => style.textContent && style.textContent.trim().length > 0);

    if (hasScript || hasStyleWithContent) {
      return doc;
    }
  }

  // Helper to check if ID should be preserved
  const shouldPreserve = (id) => {
    if (preserve.includes(id)) return true;
    if (preservePrefixes.some(prefix => id.startsWith(prefix))) return true;
    return false;
  };

  // P3-1: Helper to decode URL-encoded IDs
  const decodeId = (id) => {
    try {
      return decodeURI(id);
    } catch (e) {
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
    usedIds.add(decodeId(id));  // P3-1: Also add decoded version
  }

  // Build a map of element ID -> element for collision detection
  const nodeById = new Map();
  const collectNodes = (el) => {
    const id = el.getAttribute('id');
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
    const id = el.getAttribute('id');
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
          return;  // Skip further processing for this duplicate
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
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      for (const attrName of el.getAttributeNames()) {
        let val = el.getAttribute(attrName);
        if (val && val.includes("url(#")) {
          for (const [oldId, newId] of idMap) {
            // Bug fix: Use replaceAll (or global regex) to replace ALL occurrences
            // Previous code used String.replace() which only replaces first match
            const escapedOldId = escapeRegex(oldId);
            val = val.replace(new RegExp(`url\\(#${escapedOldId}\\)`, 'g'), `url(#${newId})`);
            const escapedEncodedId = escapeRegex(encodeURI(oldId));
            val = val.replace(new RegExp(`url\\(#${escapedEncodedId}\\)`, 'g'), `url(#${newId})`);
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
        if (attrName === "begin" || attrName === "end") {
          for (const [oldId, newId] of idMap) {
            // Bug fix: Escape regex special characters in oldId
            // Previous code would break on IDs like "frame.01" or "id(1)"
            const escapedOldId = escapeRegex(oldId);
            val = val.replace(new RegExp(`^${escapedOldId}\\.`, 'g'), `${newId}.`);
            val = val.replace(new RegExp(`;${escapedOldId}\\.`, 'g'), `;${newId}.`);
          }
          el.setAttribute(attrName, val);
        }
        // Bug fix: Update animation value attributes with ID references (values, from, to, by)
        // These attributes can contain semicolon-separated ID lists like "#frame1;#frame2;#frame3"
        // or single ID references like from="#start" to="#end" by="#delta"
        if (attrName === "values" || attrName === "from" || attrName === "to" || attrName === "by") {
          for (const [oldId, newId] of idMap) {
            const escapedOldId = escapeRegex(oldId);
            // Update #id references in animation values (handles both single and semicolon-separated lists)
            val = val.replace(new RegExp(`#${escapedOldId}([;\\s]|$)`, 'g'), `#${newId}$1`);
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
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const styles = doc.getElementsByTagName('style');
    for (const style of styles) {
      let css = style.textContent;
      if (!css) continue;

      for (const [oldId, newId] of idMap) {
        const escapedOldId = escapeRegex(oldId);
        // Update #id selectors (e.g., #gradientBlue { ... } or div#gradientBlue)
        css = css.replace(new RegExp(`#${escapedOldId}([^\\w-]|$)`, 'g'), `#${newId}$1`);
        // Update url(#id) in CSS properties (e.g., fill: url(#gradientBlue))
        css = css.replace(new RegExp(`url\\(#${escapedOldId}\\)`, 'g'), `url(#${newId})`);
      }

      style.textContent = css;
    }
  }

  return doc;
});

/**
 * Round numeric values to precision using Decimal.js
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
    if (str.includes('.')) {
      // First remove trailing zeros after decimal: "10.500" -> "10.5"
      str = str.replace(/0+$/, '');
      // Then remove trailing decimal point if no digits after: "10." -> "10"
      str = str.replace(/\.$/, '');
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

      // Handle path data
      if (attrName === "d") {
        const pathData = val.replace(NUMBER_REGEX, (match) => roundValue(match));
        el.setAttribute("d", pathData);
      }

      // Handle transform
      if (attrName === "transform") {
        const transformed = val.replace(NUMBER_REGEX, (match) =>
          roundValue(match),
        );
        el.setAttribute("transform", transformed);
      }

      // Handle points (polygon/polyline)
      if (attrName === "points") {
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
 * Round lists of values using Decimal.js
 */
export const cleanupListOfValues = createOperation((doc, options = {}) => {
  const precision = options.precision || 6;

  const roundValue = (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    const rounded = D(num).toDecimalPlaces(precision);
    let str = rounded.toString();
    // Bug fix: Prevent "400" -> "4" corruption by only trimming zeros after decimal point
    if (str.includes('.')) {
      // First remove trailing zeros after decimal: "10.500" -> "10.5"
      str = str.replace(/0+$/, '');
      // Then remove trailing decimal point if no digits after: "10." -> "10"
      str = str.replace(/\.$/, '');
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
 * Remove useless attributes (editor metadata, unused classes, etc.)
 * NOTE: Does NOT remove xmlns:xlink - use removeXlink() for safe xlink namespace removal
 * @param {Object} options
 * @param {boolean} options.preserveVendor - If true, preserves vendor namespace declarations (e.g., xmlns:serif)
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
 * Remove enable-background attribute
 */
export const cleanupEnableBackground = createOperation((doc, options = {}) => {
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
 * Remove unknown elements and default values
 * P3-5: Remove uselessOverrides (attributes matching parent's inherited style)
 * P3-6: Skip removal if dynamic styles detected
 */
export const removeUnknownsAndDefaults = createOperation(
  (doc, options = {}) => {
    // P3-6: Check for dynamic styles (media queries, pseudo-classes) in <style> elements
    const hasDynamicStyles = Array.from(doc.querySelectorAll('style')).some(style => {
      const css = style.textContent || '';
      // Check for media queries or pseudo-classes that create dynamic styling
      return css.includes('@media') ||
             css.includes(':hover') ||
             css.includes(':focus') ||
             css.includes(':active') ||
             css.includes(':visited') ||
             css.includes(':first-child') ||
             css.includes(':last-child') ||
             css.includes(':nth-child') ||
             css.includes(':not(');
    });

    // Check if document has scripts - if so, preserve all elements with IDs
    // since they might be accessed via JavaScript's getElementById()
    const hasScripts = doc.querySelectorAll('script').length > 0;

    // Build set of all referenced IDs - elements with referenced IDs must NOT be removed
    // even if they appear in invalid parent-child positions (they might animate or be used)
    const referencedIds = new Set();
    const svgStr = doc.outerHTML || '';
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
      'clippath': 'clipPath',
      'textpath': 'textPath',
      'lineargradient': 'linearGradient',
      'radialgradient': 'radialGradient',
      'meshgradient': 'meshGradient',
      'hatchpath': 'hatchPath',
      'solidcolor': 'solidColor',
      'foreignobject': 'foreignObject',
      'feblend': 'feBlend',
      'fecolormatrix': 'feColorMatrix',
      'fecomponenttransfer': 'feComponentTransfer',
      'fecomposite': 'feComposite',
      'feconvolvematrix': 'feConvolveMatrix',
      'fediffuselighting': 'feDiffuseLighting',
      'fedisplacementmap': 'feDisplacementMap',
      'fedistantlight': 'feDistantLight',
      'fedropshadow': 'feDropShadow',
      'feflood': 'feFlood',
      'fefunca': 'feFuncA',
      'fefuncb': 'feFuncB',
      'fefuncg': 'feFuncG',
      'fefuncr': 'feFuncR',
      'fegaussianblur': 'feGaussianBlur',
      'feimage': 'feImage',
      'femerge': 'feMerge',
      'femergenode': 'feMergeNode',
      'femorphology': 'feMorphology',
      'feoffset': 'feOffset',
      'fepointlight': 'fePointLight',
      'fespecularlighting': 'feSpecularLighting',
      'fespotlight': 'feSpotLight',
      'fetile': 'feTile',
      'feturbulence': 'feTurbulence',
      'animatemotion': 'animateMotion',
      'animatetransform': 'animateTransform',
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
      "textPath", "textpath",
      "defs",
      "clipPath", "clippath",
      "mask",
      "pattern",
      "linearGradient", "lineargradient",
      "radialGradient", "radialgradient",
      // SVG 2.0 gradient elements (mesh gradients)
      "meshGradient", "meshgradient",
      "meshrow",
      "meshpatch",
      // SVG 2.0 hatch elements
      "hatch",
      "hatchpath", "hatchPath",
      // SVG 2.0 solid color
      "solidcolor", "solidColor",
      "stop",
      "image",
      "use",
      "symbol",
      "marker",
      "title",
      "desc",
      "metadata",
      "foreignObject", "foreignobject",
      "switch",
      "a",
      "filter",
      "feBlend", "feblend",
      "feColorMatrix", "fecolormatrix",
      "feComponentTransfer", "fecomponenttransfer",
      "feComposite", "fecomposite",
      "feConvolveMatrix", "feconvolvematrix",
      "feDiffuseLighting", "fediffuselighting",
      "feDisplacementMap", "fedisplacementmap",
      "feDistantLight", "fedistantlight",
      "feDropShadow", "fedropshadow",
      "feFlood", "feflood",
      "feFuncA", "fefunca",
      "feFuncB", "fefuncb",
      "feFuncG", "fefuncg",
      "feFuncR", "fefuncr",
      "feGaussianBlur", "fegaussianblur",
      "feImage", "feimage",
      "feMerge", "femerge",
      "feMergeNode", "femergenode",
      "feMorphology", "femorphology",
      "feOffset", "feoffset",
      "fePointLight", "fepointlight",
      "feSpecularLighting", "fespecularlighting",
      "feSpotLight", "fespotlight",
      "feTile", "fetile",
      "feTurbulence", "feturbulence",
      "animate",
      "animateMotion", "animatemotion",
      "animateTransform", "animatetransform",
      "set",
      "mpath",
      "view",
      "cursor",  // SVG cursor element
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
      'fill': '#000',
      'fill-opacity': '1',
      'fill-rule': 'nonzero',

      // Stroke defaults
      'stroke': 'none',
      'stroke-width': '1',
      'stroke-opacity': '1',
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'miter',
      'stroke-miterlimit': '4',
      'stroke-dasharray': 'none',
      'stroke-dashoffset': '0',

      // Opacity/visibility defaults
      'opacity': '1',
      'visibility': 'visible',
      'display': 'inline',

      // Clip/mask defaults
      'clip': 'auto',
      'clip-path': 'none',
      'clip-rule': 'nonzero',
      'mask': 'none',

      // Marker defaults
      'marker-start': 'none',
      'marker-mid': 'none',
      'marker-end': 'none',

      // Color defaults
      'stop-color': '#000',
      'stop-opacity': '1',
      'flood-color': '#000',
      'flood-opacity': '1',
      'lighting-color': '#fff',

      // Rendering defaults
      'color-interpolation': 'sRGB',
      'color-interpolation-filters': 'linearRGB',
      'color-rendering': 'auto',
      'shape-rendering': 'auto',
      'text-rendering': 'auto',
      'image-rendering': 'auto',

      // Paint defaults
      'paint-order': 'normal',
      'vector-effect': 'none',

      // Text defaults
      'text-anchor': 'start',
      'text-overflow': 'clip',
      'text-decoration': 'none',
      'dominant-baseline': 'auto',
      'alignment-baseline': 'baseline',
      'baseline-shift': 'baseline',
      'writing-mode': 'lr-tb',
      'direction': 'ltr',
      'unicode-bidi': 'normal',
      'letter-spacing': 'normal',
      'word-spacing': 'normal',

      // Font defaults
      'font-style': 'normal',
      'font-variant': 'normal',
      'font-weight': 'normal',
      'font-stretch': 'normal',
      'font-size': 'medium',
      'font-size-adjust': 'none',
    };

    // Element-specific default values (SVGO compatible)
    const elementDefaults = {
      'circle': { 'cx': '0', 'cy': '0' },
      'ellipse': { 'cx': '0', 'cy': '0' },
      'line': { 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '0' },
      'rect': { 'x': '0', 'y': '0', 'rx': '0', 'ry': '0' },
      'image': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
      'svg': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
      'symbol': { 'preserveAspectRatio': 'xMidYMid meet' },
      'marker': { 'markerUnits': 'strokeWidth', 'refX': '0', 'refY': '0', 'markerWidth': '3', 'markerHeight': '3' },
      'linearGradient': { 'x1': '0', 'y1': '0', 'x2': '100%', 'y2': '0', 'spreadMethod': 'pad' },
      'radialGradient': { 'cx': '50%', 'cy': '50%', 'r': '50%', 'fx': '50%', 'fy': '50%', 'spreadMethod': 'pad' },
      'pattern': { 'x': '0', 'y': '0', 'patternUnits': 'objectBoundingBox', 'patternContentUnits': 'userSpaceOnUse' },
      'clipPath': { 'clipPathUnits': 'userSpaceOnUse' },
      'mask': { 'maskUnits': 'objectBoundingBox', 'maskContentUnits': 'userSpaceOnUse', 'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%' },
      'filter': { 'primitiveUnits': 'userSpaceOnUse', 'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%' },
      'feBlend': { 'mode': 'normal' },
      'feColorMatrix': { 'type': 'matrix' },
      'feComposite': { 'operator': 'over', 'k1': '0', 'k2': '0', 'k3': '0', 'k4': '0' },
      'feTurbulence': { 'baseFrequency': '0', 'numOctaves': '1', 'seed': '0', 'stitchTiles': 'noStitch', 'type': 'turbulence' },
      'feDisplacementMap': { 'scale': '0', 'xChannelSelector': 'A', 'yChannelSelector': 'A' },
      'feDistantLight': { 'azimuth': '0', 'elevation': '0' },
      'fePointLight': { 'x': '0', 'y': '0', 'z': '0' },
      'a': { 'target': '_self' },
      'textPath': { 'startOffset': '0' },
    };

    // SVGO: Protected attributes that should never be removed
    const isProtectedAttr = (attrName) => {
      if (attrName.startsWith('data-')) return true;
      if (attrName.startsWith('aria-')) return true;
      if (attrName === 'role') return true;
      if (attrName === 'xmlns') return true;
      if (attrName.includes(':') && !attrName.startsWith('xml:') && !attrName.startsWith('xlink:')) {
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
      if (el.tagName === 'foreignObject') {
        return;
      }

      // SVGO: Skip namespaced elements (custom extensions like inkscape:*, sodipodi:*)
      if (el.tagName.includes(':')) {
        return;
      }

      // SVGO: Only remove defaults from elements WITHOUT id attribute
      // Elements with IDs may be referenced externally
      if (!el.getAttribute('id')) {
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
      const allowedChildren = allowedChildrenPerElement[parentTagLower] ||
                              allowedChildrenPerElement[canonicalTagName(parentTagLower)];

      for (const child of [...el.children]) {
        if (isElement(child)) {
          // Skip namespaced elements
          if (child.tagName.includes(':')) {
            continue;
          }

          const childTagLower = child.tagName.toLowerCase();
          const childId = child.getAttribute('id');

          // If scripts exist and element has ID, preserve it (might be accessed by JS)
          const preserveForScripts = hasScripts && childId;

          // Helper to check if element or any descendant has a referenced ID
          const hasReferencedDescendant = (el) => {
            const elId = el.getAttribute('id');
            if (elId && referencedIds.has(elId)) return true;
            for (const c of el.children || []) {
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
          if (allowedChildren &&
              !allowedChildren.has(childTagLower) &&
              !allowedChildren.has(canonicalTagName(childTagLower))) {
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
  (doc, options = {}) => {
    // CRITICAL: clip-path and mask ARE valid on <g> - do NOT remove them!
    // They apply clipping/masking to all children and are commonly used.
    // Only remove attributes that have no meaning on <g> elements.
    const nonInheritable = [
      "x",       // <g> has no position
      "y",       // <g> has no position
      "width",   // <g> has no size
      "height",  // <g> has no size
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
export const removeUselessDefs = createOperation((doc, options = {}) => {
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
  const hasScripts = doc.querySelectorAll('script').length > 0;

  // Build set of referenced IDs
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Bug fix: Use matchAll with global flag to find ALL url(#id) references, not just first
      if (val && val.includes('url(#')) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      if ((attr === 'href' || attr === 'xlink:href') && val && val.startsWith('#')) {
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
    const href = el.getAttribute('href') || el.getAttribute('xlink:href');
    if (href && href.startsWith('#')) return true;
    for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
      const val = el.getAttribute(attr);
      if (val && val.includes('url(#')) return true;
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
    const id = el.getAttribute('id');
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
    const isInDefs = inDefs || tagName === 'defs';

    // Check if element is hidden
    const display = el.getAttribute("display");
    const visibility = el.getAttribute("visibility");
    const opacity = parseFloat(el.getAttribute("opacity") || "1");

    const isHidden = display === "none" || visibility === "hidden" || opacity === 0;

    if (isHidden) {
      // Exception 1: Never remove elements (or containers) if they or their descendants are referenced
      if (!force && hasReferencedDescendant(el)) {
        // Keep hidden elements that have referenced IDs (or contain referenced descendants)
      }
      // Exception 2: marker elements with display:none still render
      else if (!force && tagName === 'marker') {
        // Markers render even when display:none
      }
      // Exception 3: Keep elements with marker attributes
      else if (!force && (el.getAttribute('marker-start') || el.getAttribute('marker-mid') || el.getAttribute('marker-end'))) {
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
      else if (!force && tagName === 'use') {
        // Keep <use> elements even when hidden - animation may show them
      }
      // Exception 8: Never remove elements that reference others
      // (their visibility may be animated, or they're intentionally hidden for later use)
      else if (!force && hasReference(el)) {
        // Keep elements with references
      }
      else if (el.parentNode) {
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
    let text = el.textContent || '';
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
    return attrNames.some(attr =>
      preserveNs.some(ns => attr.startsWith(ns + ':'))
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
export const removeEmptyContainers = createOperation((doc, options = {}) => {
  // Include both mixed-case and lowercase variants for case-insensitive matching
  const containers = [
    "g",
    "defs",
    "symbol",
    "marker",
    "clipPath", "clippath",
    "mask",
    "pattern",
  ];

  // Check if document has scripts - if so, preserve all elements with IDs
  // since they might be accessed via JavaScript's getElementById()
  const hasScripts = doc.querySelectorAll('script').length > 0;

  // Build set of all referenced IDs - these must NOT be removed even if empty
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
      const val = el.getAttribute(attr);
      // Find url(#id) references
      if (val && val.includes('url(#')) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Find href="#id" references
      if ((attr === 'href' || attr === 'xlink:href') && val && val.startsWith('#')) {
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
    if (el.getAttribute('href') || el.getAttribute('xlink:href')) {
      return;
    }

    // Don't remove if element is referenced by ID (even if empty)
    // Empty clipPaths/masks ARE valid SVG - they clip/mask to nothing
    // Also preserve if scripts exist and element has ID (might be used by JS)
    const id = el.getAttribute('id');
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
export const removeDoctype = createOperation((doc, options = {}) => {
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
export const removeXMLProcInst = createOperation((doc, options = {}) => {
  // Processing instructions are stripped during parsing
  // Serialization always outputs clean: <?xml version="1.0" encoding="UTF-8"?>
  // This matches SVGO which removes standalone="no" and other PI variations
  return doc;
});

/**
 * Remove comments
 */
export const removeComments = createOperation((doc, options = {}) => {
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
export const removeTitle = createOperation((doc, options = {}) => {
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
export const removeDesc = createOperation((doc, options = {}) => {
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
  if (normalizedPreserve.has('sodipodi')) normalizedPreserve.add('inkscape');
  if (normalizedPreserve.has('inkscape')) normalizedPreserve.add('sodipodi');

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
  ].filter(prefix => !normalizedPreserve.has(prefix));

  // If all namespaces are preserved, exit early
  if (editorPrefixes.length === 0) return doc;

  // FIRST: Remove editor-specific elements (sodipodi:namedview, etc.)
  // This must happen BEFORE checking remaining prefixes to avoid SVGO bug #1530
  const removeEditorElements = (el) => {
    for (const child of [...el.children]) {
      if (isElement(child)) {
        const tagColonIdx = child.tagName.indexOf(':');
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
      if (attrName.startsWith('xmlns:')) continue;

      // Check if this is an editor-prefixed attribute
      const colonIdx = attrName.indexOf(':');
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
      if (attrName.startsWith('xmlns:')) continue;
      const colonIdx = attrName.indexOf(':');
      if (colonIdx > 0) {
        const prefix = attrName.substring(0, colonIdx);
        remainingPrefixes.add(prefix);
      }
    }
    // Check tag name for prefix
    const tagColonIdx = el.tagName.indexOf(':');
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
export const removeEmptyAttrs = createOperation((doc, options = {}) => {
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
export const removeViewBox = createOperation((doc, options = {}) => {
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

    if (
      vb.length === 4 &&
      vb[0] === 0 &&
      vb[1] === 0 &&
      vb[2] === w &&
      vb[3] === h
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
        if (attrName.startsWith('xlink:')) {
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
export const removeRasterImages = createOperation((doc, options = {}) => {
  // Check if document has scripts - if so, preserve elements with IDs that might be accessed via getElementById()
  const hasScripts = doc.querySelectorAll('script').length > 0;

  // Build set of referenced IDs to preserve images that are referenced elsewhere
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Collect all url(#id) references (e.g., in fill, stroke, filter, mask, clip-path, etc.)
      if (val && val.includes('url(#')) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Collect all href="#id" and xlink:href="#id" references (e.g., <use> elements)
      if ((attr === 'href' || attr === 'xlink:href') && val && val.startsWith('#')) {
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
    const imgId = img.getAttribute('id');

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
export const removeScriptElement = createOperation((doc, options = {}) => {
  // Build set of referenced IDs to preserve scripts that are referenced elsewhere
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      // Collect all url(#id) references (e.g., in fill, stroke, filter, mask, clip-path, etc.)
      if (val && val.includes('url(#')) {
        const matches = val.matchAll(/url\(#([^)]+)\)/g);
        for (const match of matches) {
          referencedIds.add(match[1]);
        }
      }
      // Collect all href="#id" and xlink:href="#id" references (e.g., <set xlink:href="#s">)
      if ((attr === 'href' || attr === 'xlink:href') && val && val.startsWith('#')) {
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
  const precision = options.precision || 6;
  const force = options.force || false;

  // Build set of referenced IDs for exception checking
  const referencedIds = new Set();
  const collectRefs = (el) => {
    for (const attr of ['href', 'xlink:href']) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith('#')) {
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
    const id = path.getAttribute('id');
    if (!force && id && referencedIds.has(id)) continue;

    // Exception 2: Skip if style attribute present (may contain transforms)
    if (!force && path.getAttribute('style')) continue;

    // Exception 3: Check for stroke-linecap (affects Z command rendering)
    const strokeLinecap = path.getAttribute('stroke-linecap');
    const hasLinecap = strokeLinecap && strokeLinecap !== 'butt';

    // Exception 4: Preserve single-point paths (markers render at single points)
    const commands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || [];
    if (commands.length <= 1) continue;

    // Exception 5: Skip if marker-mid present (cannot collapse consecutive commands)
    if (!force && path.getAttribute('marker-mid')) continue;

    // Convert to absolute coordinates
    let optimizedPath = GeometryToPath.pathToAbsolute(d);

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
        if (!force && el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
          // For stroked elements, check if transform is non-uniform
          // Only apply if it's safe (identity-like or uniform scale)
          // Access matrix data directly - Matrix stores values in data[row][col]
          const a = matrix.data[0][0].toNumber();
          const b = matrix.data[0][1].toNumber();
          const c = matrix.data[1][0].toNumber();
          const d = matrix.data[1][1].toNumber();
          const det = a * d - b * c;
          const isUniform = Math.abs(a - d) < 1e-6 && Math.abs(b + c) < 1e-6;

          if (!isUniform && det !== 0) {
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
export const convertColors = createOperation((doc, options = {}) => {
  const colorAttrs = [
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "lighting-color",
  ];

  const shortenColor = (color) => {
    if (!color) return color;

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
    'alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule',
    'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile',
    'color-rendering', 'cursor', 'direction', 'display', 'dominant-baseline',
    'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter',
    'flood-color', 'flood-opacity', 'font', 'font-family', 'font-size',
    'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
    'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering',
    'kerning', 'letter-spacing', 'lighting-color', 'marker', 'marker-end',
    'marker-mid', 'marker-start', 'mask', 'opacity', 'overflow', 'pointer-events',
    'shape-rendering', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'stroke-opacity', 'stroke-width', 'text-anchor', 'text-decoration',
    'text-rendering', 'transform', 'transform-origin', 'unicode-bidi', 'vector-effect',
    'visibility', 'word-spacing', 'writing-mode'
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
        const colonIdx = styleDecl.indexOf(':');
        if (colonIdx === -1) continue;
        const prop = styleDecl.substring(0, colonIdx).trim();
        const val = styleDecl.substring(colonIdx + 1).trim();
        if (prop && val) {
          if (!prop.startsWith('-') && SVG_PRESENTATION_ATTRS.has(prop)) {
            // Convert valid SVG presentation attributes to XML attributes
            el.setAttribute(prop, val);
          } else if (preserveVendor && prop.startsWith('-')) {
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
export const convertEllipseToCircle = createOperation((doc, options = {}) => {
  const ellipses = doc.getElementsByTagName("ellipse");

  for (const ellipse of [...ellipses]) {
    const rx = parseFloat(ellipse.getAttribute("rx") || "0");
    const ry = parseFloat(ellipse.getAttribute("ry") || "0");

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
    const isInSwitch = inSwitch || tagName === 'switch';

    // Process children first (bottom-up)
    for (const child of [...el.children]) {
      if (isElement(child)) processElement(child, false, isInSwitch);
    }

    // Only collapse <g> elements
    if (tagName !== 'g') return;

    // Exception 1: Never collapse at root or in <switch>
    if (!force && (isRoot || isInSwitch)) return;

    // Exception 3: Never collapse if group has filter
    if (!force && el.getAttribute('filter')) return;

    // Check if can collapse
    if (el.children.length === 1) {
      const child = el.children[0];
      if (!(isElement(child))) return;

      // Exception 2: Never collapse if child has ID
      if (!force && child.getAttribute('id')) return;

      // Exception 4: Don't collapse if group has animated attributes
      const hasAnimation = Array.from(el.children).some(c =>
        isElement(c) && elemsGroups.animation.has(c.tagName.toLowerCase())
      );
      if (!force && hasAnimation) return;

      // Exception 5: Check non-inheritable attribute conflicts
      const groupAttrs = el.getAttributeNames();
      const nonInheritableConflict = groupAttrs.some(attr => {
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
          if (!inheritableAttrs.has(attr) && attr !== 'class' && attr !== 'style') {
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
  const hasUrlRef = (value) => value && value.includes('url(');

  const processElement = (el) => {
    const paths = [...el.children].filter(
      (c) => isElement(c) && c.tagName === "path",
    );

    for (let i = 0; i < paths.length - 1; i++) {
      const path1 = paths[i];
      const path2 = paths[i + 1];

      // Exception 1: Skip if paths have children (e.g., animation elements)
      if (!force && (path1.children.length > 0 || path2.children.length > 0)) continue;

      // Exception 3: Don't merge if marker attributes present
      const markerAttrs = ['marker-start', 'marker-mid', 'marker-end'];
      const hasMarkers = markerAttrs.some(attr =>
        path1.getAttribute(attr) || path2.getAttribute(attr)
      );
      if (!force && hasMarkers) continue;

      // Exception 4: Don't merge if clip-path/mask present
      if (!force && (path1.getAttribute('clip-path') || path1.getAttribute('mask') ||
                     path2.getAttribute('clip-path') || path2.getAttribute('mask'))) continue;

      // Exception 5: Don't merge if URL references in fill/stroke
      if (!force) {
        const fill1 = path1.getAttribute('fill');
        const stroke1 = path1.getAttribute('stroke');
        const fill2 = path2.getAttribute('fill');
        const stroke2 = path2.getAttribute('stroke');
        if (hasUrlRef(fill1) || hasUrlRef(stroke1) || hasUrlRef(fill2) || hasUrlRef(stroke2)) continue;
      }

      // Exception 6: Don't merge if fill-rule differs - CRITICAL for correct rendering
      // Paths with different fill-rules produce different filled areas and cannot be combined
      if (!force) {
        const fillRule1 = path1.getAttribute('fill-rule') || 'nonzero';
        const fillRule2 = path2.getAttribute('fill-rule') || 'nonzero';
        if (fillRule1 !== fillRule2) continue;
      }

      // Exception 7: Don't merge if filter present - filters apply to whole path
      if (!force && (path1.getAttribute('filter') || path2.getAttribute('filter'))) continue;

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
export const moveGroupAttrsToElems = createOperation((doc, options = {}) => {
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
export const moveElemsAttrsToGroup = createOperation((doc, options = {}) => {
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
          if (!(isElement(child))) continue;

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
    const hasCDATA = css.includes('<![CDATA[') || css.includes(']]>');
    let cdataPrefix = '';
    let cdataSuffix = '';

    if (hasCDATA) {
      // Extract CDATA markers
      const cdataStartMatch = css.match(/^(\s*<!\[CDATA\[\s*)/);
      const cdataEndMatch = css.match(/(\s*\]\]>\s*)$/);
      if (cdataStartMatch) {
        cdataPrefix = '<![CDATA[';
        css = css.replace(/^\s*<!\[CDATA\[\s*/, '');
      }
      if (cdataEndMatch) {
        cdataSuffix = ']]>';
        css = css.replace(/\s*\]\]>\s*$/, '');
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
    if (css.includes('@media') || css.includes('@keyframes') || css.includes('@supports') || css.includes('@font-face')) {
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
        // Invalid selector, can't calculate specificity, keep in style element
        uninlineableSelectors.push(rule);
        continue;
      }

      allRules.push({ selector, declarations, specificity, originalRule: rule });
    }

    // Sort by specificity (ascending) so higher specificity rules are applied last and win
    allRules.sort((a, b) => CSSSpecificity.compareSpecificity(a.specificity, b.specificity));

    // Use a WeakMap to track property specificity per element
    // WeakMaps are not iterable, so we also track elements in a Set
    const elementPropertySpecificity = new WeakMap();
    const styledElements = new Set();

    // Apply rules in specificity order
    for (const { selector, declarations, specificity, originalRule } of allRules) {
      // Find matching elements
      try {
        const elements = doc.querySelectorAll(selector);

        // Exception 3: Only inline selectors matching once (for ID selectors)
        if (onlyMatchedOnce && selector.startsWith('#') && elements.length > 1) {
          uninlineableSelectors.push(originalRule);
          continue;
        }

        for (const el of elements) {
          // Exception 1: Skip foreignObject and its children
          let parent = el;
          let inForeignObject = false;
          while (parent) {
            if (parent.tagName === 'foreignObject') {
              inForeignObject = true;
              break;
            }
            parent = parent.parentNode;
          }
          if (inForeignObject) continue;

          // Get or create specificity map for this element
          if (!elementPropertySpecificity.has(el)) {
            elementPropertySpecificity.set(el, new Map());
            styledElements.add(el);  // Track element in Set for later iteration
          }
          const propSpec = elementPropertySpecificity.get(el);

          // Parse existing inline styles first (inline styles have highest specificity: 1,0,0,0)
          const existingStyle = el.getAttribute("style") || "";
          if (existingStyle && propSpec.size === 0) {
            // Only parse inline styles once per element (before any CSS rules are applied)
            const existingDecls = existingStyle.split(';');
            for (const decl of existingDecls) {
              const colonIdx = decl.indexOf(':');
              if (colonIdx > 0) {
                const prop = decl.substring(0, colonIdx).trim();
                let value = decl.substring(colonIdx + 1).trim();
                const isImportant = value.includes('!important');
                if (isImportant) {
                  value = value.replace(/\s*!important\s*/g, '').trim();
                }
                // Inline styles have specificity [1,0,0,0] (higher than any selector)
                propSpec.set(prop, { specificity: [1, 0, 0, 0], isImportant, value });
              }
            }
          }

          // Parse new declarations from this CSS rule
          const newDecls = declarations.split(';');
          for (const decl of newDecls) {
            const colonIdx = decl.indexOf(':');
            if (colonIdx <= 0) continue;

            const prop = decl.substring(0, colonIdx).trim();
            let value = decl.substring(colonIdx + 1).trim();
            const isImportant = value.includes('!important');
            if (isImportant) {
              value = value.replace(/\s*!important\s*/g, '').trim();
            }

            // Check if we can override existing property value
            const existing = propSpec.get(prop);
            if (existing) {
              // Compare specificity
              const cmp = CSSSpecificity.compareSpecificity(specificity, existing.specificity);

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
        // Invalid selector, keep in style element
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
      el.setAttribute("style", styleParts.join('; '));
    }

    // Remove style element or keep uninlineable rules
    if (removeStyleElement && style.parentNode) {
      if (uninlineableSelectors.length > 0) {
        // Keep only uninlineable rules
        style.textContent = uninlineableSelectors.join('\n');
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
export const sortAttrs = createOperation((doc, options = {}) => {
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
export const sortDefsChildren = createOperation((doc, options = {}) => {
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
    doc.insertBefore(defs, doc.firstChild);
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
export const removeOffCanvasPath = createOperation((doc, options = {}) => {
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
        height: renderedBBox.height
      };

      const intersects = OffCanvasDetection.bboxIntersectsViewBox(renderedVB, vb);

      // Only remove if rendered area does NOT intersect viewBox
      if (!intersects) {
        if (path.parentNode) {
          path.parentNode.removeChild(path);
        }
      }
    } catch (e) {
      // Skip invalid paths - don't remove paths we can't analyze
    }
  }

  return doc;
});

/**
 * Remove style elements
 */
export const removeStyleElement = createOperation((doc, options = {}) => {
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
export const removeXlink = createOperation((doc, options = {}) => {
  // Mapping from xlink:show values to HTML target attribute values
  const SHOW_TO_TARGET = {
    'new': '_blank',
    'replace': '_self'
  };

  // Track if any xlink:* attributes remain after processing
  let hasRemainingXlinkAttrs = false;

  const processElement = (el) => {
    for (const attrName of [...el.getAttributeNames()]) {
      if (attrName.startsWith('xlink:')) {
        const localName = attrName.substring(6); // Remove 'xlink:' prefix
        const value = el.getAttribute(attrName);

        // Handle xlink attributes - preserve xlink:href for SVG 1.1 compatibility
        if (localName === 'href') {
          // KEEP xlink:href for SVG 1.1 compatibility
          // SVG 2.0 supports plain href, but SVG 1.1 requires xlink:href
          hasRemainingXlinkAttrs = true;
        } else if (localName === 'show') {
          // xlink:show → target attribute (for <a> elements)
          // Bug fix: Previously just removed, now converts to target
          if (!el.hasAttribute('target')) {
            const targetValue = SHOW_TO_TARGET[value];
            if (targetValue) {
              el.setAttribute('target', targetValue);
            }
          }
          el.removeAttribute(attrName);
        } else if (localName === 'title') {
          // xlink:title → <title> child element (proper SVG tooltip)
          // Bug fix: Previously set title attribute, but SVG tooltips use <title> elements
          const existingTitle = el.querySelector && el.querySelector('title');
          if (!existingTitle && value) {
            const titleEl = new SVGElement('title', {}, [], value);
            el.children.unshift(titleEl); // Add as first child
          }
          el.removeAttribute(attrName);
        } else if (['actuate', 'type', 'role', 'arcrole'].includes(localName)) {
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

  // Helper: Escape special regex characters for safe use in RegExp
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Collect and rename IDs
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

    // Update class attributes with prefixed names
    const updateClasses = (el) => {
      const classAttr = el.getAttribute("class");
      if (classAttr) {
        const newClasses = classAttr.split(/\s+/).map(cls => classMap.get(cls) || cls).join(' ');
        el.setAttribute("class", newClasses);
      }
      for (const child of el.children) {
        if (isElement(child)) updateClasses(child);
      }
    };
    updateClasses(doc);
  }

  // Update CSS in <style> elements
  const styles = doc.getElementsByTagName('style');
  for (const style of styles) {
    let css = style.textContent;
    if (!css) continue;

    // Update ID selectors and url(#id) in CSS
    for (const [oldId, newId] of idMap) {
      const escaped = escapeRegex(oldId);
      // Update #id selectors (with word boundary check to avoid partial matches)
      css = css.replace(new RegExp(`#${escaped}([^\\w-]|$)`, 'g'), `#${newId}$1`);
      // Update url(#id) references in CSS (e.g., in fill, stroke, etc.)
      css = css.replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${newId})`);
    }

    // Update class selectors if class prefixing is enabled
    if (options.prefixClassNames !== false) {
      for (const [oldClass, newClass] of classMap) {
        const escaped = escapeRegex(oldClass);
        // Update .class selectors (with word boundary check)
        css = css.replace(new RegExp(`\\.${escaped}([^\\w-]|$)`, 'g'), `.${newClass}$1`);
      }
    }

    style.textContent = css;
  }

  // Update references in element attributes
  const updateRefs = (el) => {
    for (const attrName of el.getAttributeNames()) {
      let val = el.getAttribute(attrName);

      // Handle url(#id) references with GLOBAL replacement (fixes bug #1)
      if (val && val.includes("url(#")) {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Use global flag to replace ALL occurrences, not just first
          val = val.replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${newId})`);
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
      if (attrName === 'begin' || attrName === 'end') {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Match id at start of string or after semicolon/space, followed by a dot
          val = val.replace(new RegExp(`(^|;|\\s)${escaped}\\.`, 'g'), `$1${newId}.`);
        }
        el.setAttribute(attrName, val);
      }

      // Bug fix: Handle animation value attributes with ID references (values/from/to/by)
      // Format examples: "#frame1;#frame2;#frame3" or "#target"
      if (attrName === 'values' || attrName === 'from' || attrName === 'to' || attrName === 'by') {
        for (const [oldId, newId] of idMap) {
          const escaped = escapeRegex(oldId);
          // Match #id followed by semicolon, space, or end of string
          val = val.replace(new RegExp(`#${escaped}([;\\s]|$)`, 'g'), `#${newId}$1`);
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
export const removeDimensions = createOperation((doc, options = {}) => {
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
      // Invalid selector
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

  const processElement = (el) => {
    for (const child of [...el.children]) {
      if (!(isElement(child))) continue;

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
  doc = await removeMetadata(doc, domOpts);
  doc = await removeComments(doc, domOpts);
  doc = await removeEmptyContainers(doc, domOpts);
  doc = await removeHiddenElements(doc, domOpts);
  doc = await cleanupNumericValues(doc, domOpts);
  doc = await convertColors(doc, domOpts);
  doc = await convertStyleToAttrs(doc, domOpts);
  doc = await removeEditorsNSData(doc, domOpts);
  doc = await cleanupIds(doc, domOpts);
  doc = await minifyStyles(doc, domOpts);
  return doc;
});

/**
 * No optimizations (pass-through)
 */
export const presetNone = createOperation((doc, options = {}) => {
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

  // Apply operations based on config - must await each async operation
  if (config.removeMetadata !== false) doc = await removeMetadata(doc, domOpts);
  if (config.removeComments !== false) doc = await removeComments(doc, domOpts);
  if (config.cleanupNumericValues !== false)
    doc = await cleanupNumericValues(doc, domOpts);
  if (config.convertColors !== false) doc = await convertColors(doc, domOpts);
  if (config.removeHiddenElements !== false) doc = await removeHiddenElements(doc, domOpts);
  if (config.removeEmptyContainers !== false) doc = await removeEmptyContainers(doc, domOpts);

  return doc;
});

/**
 * Create configuration object
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
    const ref = g.getAttribute('href') || g.getAttribute('xlink:href');
    return ref?.startsWith('#') ? ref.substring(1) : null;
  };

  // Helper to check if gradient is safe to flatten
  const isSafeToFlatten = (gradient, gradientId) => {
    const gradientUnits = gradient.getAttribute('gradientUnits') || 'objectBoundingBox';
    const gradientTransform = gradient.getAttribute('gradientTransform');

    // Check for circular reference in gradient inheritance chain
    if (hasCircularReference(gradientId, getGradientRef)) {
      if (options.verbose) {
        console.warn(`Circular gradient reference detected: #${gradientId}`);
      }
      return false;
    }

    // Skip gradients with userSpaceOnUse - requires coordinate transformation per element
    if (gradientUnits === 'userSpaceOnUse') {
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
        if (tagName === 'lineargradient' || tagName === 'radialgradient') {
          // Check if gradient is safe to flatten
          if (!isSafeToFlatten(gradient, gradientId)) {
            if (options.verbose) {
              console.warn(`Skipping gradient flatten for ${gradientId}: userSpaceOnUse or gradientTransform requires coordinate transformation`);
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
        if (tagName === 'lineargradient' || tagName === 'radialgradient') {
          // Check if gradient is safe to flatten
          if (!isSafeToFlatten(gradient, gradientId)) {
            if (options.verbose) {
              console.warn(`Skipping gradient flatten for ${gradientId}: userSpaceOnUse or gradientTransform requires coordinate transformation`);
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
  const gradients = [...doc.querySelectorAll('linearGradient, radialGradient')];
  for (const gradient of gradients) {
    // Check if gradient was actually flattened (no longer referenced)
    const gradientId = gradient.getAttribute('id');
    const stillReferenced = gradientId && (
      [...doc.querySelectorAll(`[fill*="url(#${gradientId})"]`)].length > 0 ||
      [...doc.querySelectorAll(`[stroke*="url(#${gradientId})"]`)].length > 0
    );

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
    child => child.tagName && child.tagName.toLowerCase() === 'stop'
  );

  if (stops.length === 0) {
    // No stops, return gray
    return '#808080';
  }

  if (stops.length === 1) {
    // Single stop, return its color
    return getStopColor(stops[0]);
  }

  // Parse all stops with normalized offsets
  const parsedStops = stops.map(stop => {
    let offset = stop.getAttribute('offset') || '0';
    // Handle percentage values
    if (offset.endsWith('%')) {
      offset = parseFloat(offset) / 100;
    } else {
      offset = parseFloat(offset);
    }
    // Clamp to 0-1 range
    offset = Math.max(0, Math.min(1, offset));

    return {
      offset,
      color: getStopColor(stop),
      opacity: getStopOpacity(stop)
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
  let color = stop.getAttribute('stop-color');

  // Check style attribute if no stop-color
  if (!color) {
    const style = stop.getAttribute('style');
    if (style) {
      const match = style.match(/stop-color\s*:\s*([^;]+)/i);
      if (match) {
        color = match[1].trim();
      }
    }
  }

  // Default to black if no color found
  if (!color) {
    color = '#000000';
  }

  return normalizeColor(color);
}

/**
 * Get the stop-opacity from a gradient stop element.
 * @param {SVGElement} stop - stop element
 * @returns {number} Opacity value (0-1)
 */
function getStopOpacity(stop) {
  let opacity = stop.getAttribute('stop-opacity');

  if (!opacity) {
    const style = stop.getAttribute('style');
    if (style) {
      const match = style.match(/stop-opacity\s*:\s*([^;]+)/i);
      if (match) {
        opacity = match[1].trim();
      }
    }
  }

  return opacity ? parseFloat(opacity) : 1.0;
}

/**
 * Normalize a color value to hex format.
 * Handles hex, rgb(), and named colors.
 * @param {string} color - Color string in any format
 * @returns {string} Hex color string (e.g., "#ff8800")
 */
function normalizeColor(color) {
  color = color.trim().toLowerCase();

  // Already hex format
  if (color.startsWith('#')) {
    // Expand 3-digit hex to 6-digit
    if (color.length === 4) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return color;
  }

  // Handle rgb() format
  if (color.startsWith('rgb(')) {
    const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return rgbToHex(r, g, b);
    }
  }

  // Handle common named colors
  const namedColors = {
    'black': '#000000',
    'white': '#ffffff',
    'red': '#ff0000',
    'green': '#008000',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'cyan': '#00ffff',
    'magenta': '#ff00ff',
    'gray': '#808080',
    'grey': '#808080',
    'silver': '#c0c0c0',
    'maroon': '#800000',
    'olive': '#808000',
    'lime': '#00ff00',
    'aqua': '#00ffff',
    'teal': '#008080',
    'navy': '#000080',
    'fuchsia': '#ff00ff',
    'purple': '#800080',
  };

  if (namedColors[color]) {
    return namedColors[color];
  }

  // Fallback to black
  return '#000000';
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
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
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
    n = Math.max(0, Math.min(255, Math.round(n)));
    return n.toString(16).padStart(2, '0');
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
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
export const flattenFilters = createOperation((doc, options = {}) => {
  // Remove filter references (cannot fully flatten without rendering)
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
export const imageToPath = createOperation((doc, options = {}) => {
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
    includeFillOnly = false
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
          fillRule2: ctx2.fillRule
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
 * Expand a polygon by a given distance (approximation for stroke expansion)
 * @private
 */
function expandPolygonByDistance(polygon, distance) {
  if (distance <= 0) return polygon;

  // Compute centroid
  let cx = 0, cy = 0;
  for (const p of polygon) {
    cx += p.x;
    cy += p.y;
  }
  cx /= polygon.length;
  cy /= polygon.length;

  // Expand each point outward from centroid
  return polygon.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return p;
    const scale = (len + distance) / len;
    return {
      x: cx + dx * scale,
      y: cy + dy * scale
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
export const validateXML = createOperation((doc, options = {}) => {
  const errors = [];
  const warnings = [];

  // Collect all namespace prefixes used in the document
  const usedPrefixes = new Set();
  const declaredPrefixes = new Set();

  const checkElement = (el) => {
    // Check tag name for namespace prefix
    if (el.tagName.includes(':')) {
      const prefix = el.tagName.split(':')[0];
      usedPrefixes.add(prefix);
    }

    // Check attributes for namespace declarations and prefixed attributes
    for (const attrName of el.getAttributeNames()) {
      const attrValue = el.getAttribute(attrName);

      // Check for namespace declarations
      if (attrName === 'xmlns') {
        declaredPrefixes.add(''); // Default namespace
      } else if (attrName.startsWith('xmlns:')) {
        const prefix = attrName.substring(6);
        declaredPrefixes.add(prefix);
      }

      // Check for prefixed attributes
      if (attrName.includes(':') && !attrName.startsWith('xmlns:')) {
        const prefix = attrName.split(':')[0];
        usedPrefixes.add(prefix);
      }

      // Check for invalid XML characters in attribute values
      if (attrValue && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(attrValue)) {
        errors.push(`Invalid XML characters in attribute '${attrName}' of <${el.tagName}>`);
      }
    }

    // Check text content for invalid XML characters
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
      errors.push(`Unbound namespace prefix: '${prefix}' - SVGO would produce invalid XML here`);
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
  const svgVersion = options.version || '1.1'; // '1.1' or '2.0'

  // 1. Root element validation
  if (doc.tagName !== "svg") {
    errors.push("Root element must be <svg>");
  }

  // 2. Required SVG namespace
  const xmlns = doc.getAttribute("xmlns");
  if (!xmlns) {
    warnings.push("Missing xmlns attribute (required for standalone SVG)");
  } else if (xmlns !== "http://www.w3.org/2000/svg") {
    errors.push(`Invalid SVG namespace: expected 'http://www.w3.org/2000/svg', got '${xmlns}'`);
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
      const [minX, minY, width, height] = vb.map(parseFloat);
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
    needsPolyfills: false
  };

  // SVG 2.0 elements that MUST be lowercase (camelCase is invalid per final SVG 2.0 spec)
  const SVG2_CAMELCASE_INVALID = {
    'meshGradient': 'meshgradient',
    'meshRow': 'meshrow',
    'meshPatch': 'meshpatch',
    'hatchPath': 'hatchpath',
    'solidColor': 'solidcolor'
  };

  // 4. Check all elements against allowed children
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
      errors.push(`Invalid SVG 2.0 element: <${tagOriginal}> must be lowercase <${SVG2_CAMELCASE_INVALID[tagOriginal]}> per SVG 2.0 specification`);
    }

    // Detect SVG 2.0 mesh gradient elements (valid lowercase)
    if (tagLower === 'meshgradient') {
      const id = el.getAttribute('id');
      // Track meshgradient (with or without id) - id is stored if present, null if missing
      svg2Features.meshGradients.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(`<meshgradient> element without 'id' attribute may be difficult to reference`);
      }
    }

    // Detect SVG 2.0 hatch elements (valid lowercase)
    if (tagLower === 'hatch') {
      const id = el.getAttribute('id');
      // Track hatch (with or without id) - id is stored if present, null if missing
      svg2Features.hatches.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(`<hatch> element without 'id' attribute may be difficult to reference`);
      }
    }

    // Detect SVG 2.0 solidcolor elements (valid lowercase)
    if (tagLower === 'solidcolor') {
      const id = el.getAttribute('id');
      // Track solidcolor (with or without id) - id is stored if present, null if missing
      svg2Features.solidColors.push(id || null);
      svg2Features.needsPolyfills = true;
      if (!id) {
        warnings.push(`<solidcolor> element without 'id' attribute may be difficult to reference`);
      }
    }

    // Check path 'd' attribute
    if (tagLower === 'path') {
      const d = el.getAttribute('d');
      if (!d || !d.trim()) {
        errors.push(`<path> element missing required 'd' attribute`);
      } else {
        // Validate path data syntax
        const pathCommands = d.match(/[MmLlHhVvCcSsQqTtAaZz]/g);
        if (!pathCommands || pathCommands.length === 0) {
          errors.push(`<path> 'd' attribute contains no valid commands`);
        }
        const firstCommand = d.trim()[0];
        if (firstCommand !== 'M' && firstCommand !== 'm') {
          errors.push(`<path> 'd' must start with M or m command`);
        }
      }
    }

    // Check rect required attributes
    if (tagLower === 'rect') {
      const width = el.getAttribute('width');
      const height = el.getAttribute('height');
      // Only validate numeric values, skip CSS units
      if (width !== null && !hasUnits(width) && parseFloat(width) < 0) {
        errors.push(`<rect> width must be non-negative`);
      }
      if (height !== null && !hasUnits(height) && parseFloat(height) < 0) {
        errors.push(`<rect> height must be non-negative`);
      }
    }

    // Check circle required attributes
    if (tagLower === 'circle') {
      const r = el.getAttribute('r');
      if (r !== null && parseFloat(r) < 0) {
        errors.push(`<circle> r must be non-negative`);
      }
    }

    // Check ellipse required attributes
    if (tagLower === 'ellipse') {
      const rx = el.getAttribute('rx');
      const ry = el.getAttribute('ry');
      if (rx !== null && parseFloat(rx) < 0) {
        errors.push(`<ellipse> rx must be non-negative`);
      }
      if (ry !== null && parseFloat(ry) < 0) {
        errors.push(`<ellipse> ry must be non-negative`);
      }
    }

    // Check use href reference
    if (tagLower === 'use') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href && href.startsWith('#')) {
        const refId = href.substring(1);
        const referencedEl = doc.getElementById(refId);
        if (!referencedEl) {
          warnings.push(`<use> references non-existent ID: '${refId}'`);
        }
      }
    }

    // Check gradient/pattern references
    for (const attr of ['fill', 'stroke', 'clip-path', 'mask', 'filter']) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith('url(#')) {
        const match = val.match(/url\(#([^)]+)\)/);
        if (match) {
          const refId = match[1];
          const referencedEl = doc.getElementById(refId);
          if (!referencedEl) {
            warnings.push(`<${el.tagName}> ${attr} references non-existent ID: '${refId}'`);
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
            warnings.push(`<${childTag}> is not a standard child of <${tagLower}>`);
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
      featureList.push(`meshgradient (${svg2Features.meshGradients.length} found)`);
    }
    if (svg2Features.hatches.length > 0) {
      featureList.push(`hatch (${svg2Features.hatches.length} found)`);
    }
    if (svg2Features.solidColors.length > 0) {
      featureList.push(`solidcolor (${svg2Features.solidColors.length} found)`);
    }
    warnings.push(`SVG contains SVG 2.0 features that require polyfills for browser compatibility: ${featureList.join(', ')}. Use --svg2-polyfills option to inject runtime polyfills.`);
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

/**
 * Fix invalid SVG elements and attributes according to SVG 1.1 specification.
 * This function corrects silent errors that browsers ignore but can cause issues
 * with animations, rendering, or standards compliance.
 *
 * Accepts multiple input types for browser compatibility:
 * - String: SVG markup to parse
 * - Parsed document object (from parseSVG)
 * - Native DOM SVGElement or SVGSVGElement (browser)
 * - HTMLObjectElement: extracts SVG from contentDocument
 * - HTMLEmbedElement: extracts SVG via getSVGDocument()
 * - HTMLImageElement: extracts src URL (external SVGs only, fetches if possible)
 * - CSS selector string (e.g., '#my-svg', '.svg-icon'): queries DOM for element
 *
 * Fixes applied:
 * 1. Removes invalid attributes from elements (e.g., x/y/width/height on <g>)
 * 2. Adds missing xmlns:xlink declaration when xlink:* attributes are present
 * 3. Fixes broken ID references when similar IDs exist (fuzzy matching)
 * 4. Normalizes animation timing values
 * 5. Moves animation elements out of elements with EMPTY content model (<use>, <image>, etc.)
 * 6. Normalizes uppercase units to lowercase (SVG 1.1: units MUST be lowercase in attributes)
 * 7. Replaces invalid Unicode whitespace with standard space (0x20)
 * 8. Fixes invalid number formats (trailing dots, missing leading zeros)
 * 9. Detects out-of-range numeric values (beyond single-precision float range)
 *
 * @param {string|Object|Element} input - SVG input (string, parsed doc, DOM element, selector, or container)
 * @param {Object} options
 * @param {boolean} options.fixInvalidGroupAttrs - Remove invalid x/y/width/height from <g> elements (default: true)
 * @param {boolean} options.fixMissingNamespaces - Add missing xmlns:xlink when needed (default: true)
 * @param {boolean} options.fixBrokenRefs - Try to fix broken ID references with fuzzy matching (default: true)
 * @param {boolean} options.fixAnimationTiming - Normalize animation timing values (default: true)
 * @param {boolean} options.verbose - Include detailed fix report in data-fix-report attribute (default: false)
 * @returns {Object} The fixed SVG document with data-fixes-applied attribute
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
    const id = el.getAttribute('id');
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
    'x', 'y', 'width', 'height',       // Position/size - valid on rect, image, svg, use, etc.
    'cx', 'cy', 'r',                   // Circle attributes
    'rx', 'ry',                        // Ellipse/rect corner radius
    'x1', 'y1', 'x2', 'y2',            // Line attributes
    'd',                               // Path data
    'points',                          // Polygon/polyline points
  ];

  // SVG 1.1: Elements that support x/y/width/height
  const SUPPORTS_RECT_ATTRS = new Set([
    'svg', 'rect', 'image', 'foreignObject', 'use', 'symbol', 'pattern',
    'mask', 'filter', 'clipPath'
  ]);

  // Fix 1: Remove invalid attributes from elements
  const fixInvalidAttributes = (el) => {
    const tagName = el.tagName.toLowerCase();

    // <g> elements don't support x, y, width, height in SVG 1.1
    if (tagName === 'g' && fixInvalidGroupAttrs) {
      for (const attr of INVALID_G_ATTRS) {
        if (el.hasAttribute(attr)) {
          const val = el.getAttribute(attr);
          el.removeAttribute(attr);
          fixes.push({
            type: 'invalid_attr_removed',
            element: tagName,
            attr: attr,
            value: val,
            reason: `SVG 1.1: <g> elements do not support '${attr}' attribute`
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
        if (attrName.startsWith('xlink:')) {
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

    if (hasXlinkAttrs && !doc.hasAttribute('xmlns:xlink')) {
      doc.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      fixes.push({
        type: 'namespace_added',
        namespace: 'xmlns:xlink',
        value: 'http://www.w3.org/1999/xlink',
        reason: 'SVG 1.1: xmlns:xlink required when xlink:* attributes are present'
      });
    }
  };

  // Fix 3: Fix broken ID references using fuzzy matching
  const findSimilarId = (brokenId) => {
    // Try common variations
    const variations = [
      brokenId,
      brokenId.replace(/^FRAME(\d+)$/, 'FRAME0$1'),      // FRAME1 -> FRAME01
      brokenId.replace(/^FRAME0(\d+)$/, 'FRAME00$1'),    // FRAME01 -> FRAME001
      brokenId.replace(/^FRAME00(\d+)$/, 'FRAME000$1'),  // FRAME001 -> FRAME0001
      brokenId.replace(/^FRAME0+(\d+)$/, 'FRAME$1'),     // FRAME0001 -> FRAME1
      brokenId.replace(/^FRAME(\d)$/, 'FRAME0000$1'),    // FRAME1 -> FRAME00001
      brokenId.replace(/^FRAME(\d{2})$/, 'FRAME000$1'),  // FRAME01 -> FRAME00001
      brokenId.replace(/^FRAME(\d{3})$/, 'FRAME00$1'),   // FRAME001 -> FRAME00001
      brokenId.replace(/^FRAME(\d{4})$/, 'FRAME0$1'),    // FRAME0001 -> FRAME00001
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
      if (id.toLowerCase().includes(brokenId.toLowerCase()) ||
          brokenId.toLowerCase().includes(id.toLowerCase())) {
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
    for (const attrName of ['href', 'xlink:href']) {
      const val = el.getAttribute(attrName);
      if (val && val.startsWith('#')) {
        const refId = val.substring(1);
        if (!allIds.has(refId)) {
          const fixedId = findSimilarId(refId);
          if (fixedId) {
            el.setAttribute(attrName, `#${fixedId}`);
            fixes.push({
              type: 'ref_fixed',
              element: el.tagName.toLowerCase(),
              attr: attrName,
              oldValue: val,
              newValue: `#${fixedId}`,
              reason: `ID '${refId}' not found, fixed to similar ID '${fixedId}'`
            });
          }
        }
      }
    }

    // Check animate element values that reference IDs
    if (el.tagName.toLowerCase() === 'animate') {
      const attrName = el.getAttribute('attributeName');
      if (attrName === 'href' || attrName === 'xlink:href') {
        const values = el.getAttribute('values');
        if (values) {
          const refs = values.split(';');
          let changed = false;
          const fixedRefs = refs.map(ref => {
            ref = ref.trim();
            if (ref.startsWith('#')) {
              const refId = ref.substring(1);
              if (!allIds.has(refId)) {
                const fixedId = findSimilarId(refId);
                if (fixedId) {
                  changed = true;
                  return `#${fixedId}`;
                }
              }
            }
            return ref;
          });
          if (changed) {
            const newValues = fixedRefs.join(';');
            el.setAttribute('values', newValues);
            fixes.push({
              type: 'animate_values_fixed',
              oldValue: values,
              newValue: newValues,
              reason: 'Fixed broken ID references in animate values'
            });
          }
        }
      }
    }

    // Check url() references in fill, stroke, clip-path, mask, filter
    for (const attr of ['fill', 'stroke', 'clip-path', 'mask', 'filter']) {
      const val = el.getAttribute(attr);
      if (val && val.startsWith('url(#')) {
        const match = val.match(/url\(#([^)]+)\)/);
        if (match) {
          const refId = match[1];
          if (!allIds.has(refId)) {
            const fixedId = findSimilarId(refId);
            if (fixedId) {
              el.setAttribute(attr, `url(#${fixedId})`);
              fixes.push({
                type: 'url_ref_fixed',
                element: el.tagName.toLowerCase(),
                attr: attr,
                oldValue: val,
                newValue: `url(#${fixedId})`,
                reason: `ID '${refId}' not found, fixed to similar ID '${fixedId}'`
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

    const animationElements = ['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set'];
    const tagName = el.tagName.toLowerCase();

    if (animationElements.includes(tagName)) {
      // Fix dur="indefinite" on elements that should have a duration
      const dur = el.getAttribute('dur');
      const repeatCount = el.getAttribute('repeatCount');

      // Check for common timing issues
      if (dur === '0' || dur === '0s') {
        // dur="0" is often a mistake - check if there are keyTimes
        const keyTimes = el.getAttribute('keyTimes');
        if (!keyTimes) {
          fixes.push({
            type: 'timing_warning',
            element: tagName,
            attr: 'dur',
            value: dur,
            reason: 'dur="0" may cause animation to not play'
          });
        }
      }

      // Fix begin values with invalid format
      const begin = el.getAttribute('begin');
      if (begin) {
        // Normalize common begin value issues
        let fixedBegin = begin;

        // Fix "0" to "0s" for consistency
        if (begin === '0') {
          fixedBegin = '0s';
          el.setAttribute('begin', fixedBegin);
          fixes.push({
            type: 'timing_normalized',
            element: tagName,
            attr: 'begin',
            oldValue: begin,
            newValue: fixedBegin,
            reason: 'Normalized begin value to include time unit'
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
  const EMPTY_CONTENT_MODEL_ELEMENTS = new Set(['font-face-format', 'font-face-name', 'glyphref', 'hkern', 'vkern']);
  const ANIMATION_ELEMENTS = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

  const fixAnimationInEmptyElements = (el) => {
    const tagName = el.tagName.toLowerCase();

    // Check if this element has empty content model but contains animation children
    if (EMPTY_CONTENT_MODEL_ELEMENTS.has(tagName)) {
      const animationChildren = [];
      for (const child of Array.from(el.children)) {
        if (isElement(child) && ANIMATION_ELEMENTS.has(child.tagName.toLowerCase())) {
          animationChildren.push(child);
        }
      }

      if (animationChildren.length > 0) {
        // Ensure the parent element has an ID for targeting
        let targetId = el.getAttribute('id');
        if (!targetId) {
          // Generate a unique ID
          targetId = `_fix_${tagName}_${Math.random().toString(36).substring(2, 8)}`;
          el.setAttribute('id', targetId);
          fixes.push({
            type: 'id_generated',
            element: tagName,
            id: targetId,
            reason: 'Generated ID for animation targeting after moving animate element'
          });
        }

        // Move each animation child to be a sibling after the element
        for (const animChild of animationChildren) {
          // Remove from parent
          el.removeChild(animChild);

          // Add href to target the original parent if not already present
          if (!animChild.hasAttribute('href') && !animChild.hasAttribute('xlink:href')) {
            animChild.setAttribute('href', `#${targetId}`);
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
            type: 'animation_moved_from_empty_element',
            element: animChild.tagName.toLowerCase(),
            parentElement: tagName,
            targetId: targetId,
            reason: `SVG 1.1: <${tagName}> has EMPTY content model and cannot have children. Animation moved outside and targets element via href="#${targetId}".`
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
  const UNIT_PATTERN = /^([+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?)(EM|EX|PX|IN|CM|MM|PT|PC|DEG|GRAD|RAD|S|MS|HZ|KHZ|%)$/i;
  const ATTRS_WITH_UNITS = new Set([
    'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy',
    'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'textLength', 'startOffset',
    'stroke-width', 'stroke-dashoffset', 'font-size', 'baseline-shift',
    'kerning', 'letter-spacing', 'word-spacing', 'markerWidth', 'markerHeight',
    'refX', 'refY', 'stdDeviation', 'radius'
  ]);

  const fixUppercaseUnits = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Only check attributes that can have units
      if (!ATTRS_WITH_UNITS.has(attrName) && !attrName.includes('-')) continue;

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
            type: 'unit_normalized',
            element: el.tagName.toLowerCase(),
            attr: attrName,
            oldValue: val,
            newValue: newVal,
            reason: `SVG 1.1: Unit identifiers in attributes must be lowercase`
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
  const INVALID_WHITESPACE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
  const LIST_ATTRS = new Set([
    'points', 'viewBox', 'preserveAspectRatio', 'transform', 'd',
    'values', 'keyTimes', 'keySplines', 'keyPoints', 'rotate',
    'stroke-dasharray', 'baseFrequency', 'kernelMatrix', 'tableValues',
    'filterRes', 'stdDeviation', 'radius', 'origin'
  ]);

  const fixInvalidWhitespace = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Check list attributes and style
      if (!LIST_ATTRS.has(attrName) && attrName !== 'style') continue;

      const val = el.getAttribute(attrName);
      if (!val) continue;

      if (INVALID_WHITESPACE.test(val)) {
        const newVal = val.replace(INVALID_WHITESPACE, ' ');
        el.setAttribute(attrName, newVal);
        fixes.push({
          type: 'whitespace_normalized',
          element: el.tagName.toLowerCase(),
          attr: attrName,
          reason: `SVG 1.1: Replaced invalid Unicode whitespace with standard space (0x20)`
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
        newVal = newVal.replace(/(\d)\.(?=$|[,\s;)])/g, '$1');
        changed = true;
      }

      // Fix standalone dot or dot without leading zero: ".5" -> "0.5", "-.5" -> "-0.5"
      newVal = newVal.replace(/(^|[,\s;(])\.(\d)/g, '$10.$2');
      newVal = newVal.replace(/(^|[,\s;(])-\.(\d)/g, '$1-0.$2');
      if (newVal !== val) changed = true;

      // Fix multiple consecutive dots (corruption indicator)
      if (/\.\.+/.test(newVal)) {
        newVal = newVal.replace(/\.\.+/g, '.');
        changed = true;
      }

      if (changed) {
        el.setAttribute(attrName, newVal);
        fixes.push({
          type: 'number_format_fixed',
          element: el.tagName.toLowerCase(),
          attr: attrName,
          oldValue: val,
          newValue: newVal,
          reason: `SVG 1.1: Fixed invalid number format`
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) fixInvalidNumbers(child);
    }
  };

  // Fix 9: Detect and warn about out-of-range numeric values
  // SVG 1.1 spec: Numbers require single-precision float range (-3.4e+38 to +3.4e+38)
  const FLOAT_MAX = 3.4e+38;
  const FLOAT_MIN = -3.4e+38;
  const NUMBER_PATTERN = /[+-]?\d*\.?\d+(?:[Ee][+-]?\d+)?/g;

  const detectOutOfRangeValues = (el) => {
    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);
      if (!val) continue;

      // Skip non-numeric attributes
      if (attrName === 'id' || attrName === 'class' || attrName.startsWith('xmlns') ||
          attrName === 'href' || attrName === 'xlink:href' || attrName === 'style') continue;

      const numbers = val.match(NUMBER_PATTERN);
      if (!numbers) continue;

      for (const numStr of numbers) {
        const num = parseFloat(numStr);
        if (!isFinite(num)) {
          fixes.push({
            type: 'invalid_number_detected',
            element: el.tagName.toLowerCase(),
            attr: attrName,
            value: numStr,
            reason: `SVG 1.1: Invalid number (Infinity or NaN)`
          });
        } else if (num > FLOAT_MAX || num < FLOAT_MIN) {
          fixes.push({
            type: 'out_of_range_detected',
            element: el.tagName.toLowerCase(),
            attr: attrName,
            value: numStr,
            reason: `SVG 1.1: Number exceeds single-precision float range`
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectOutOfRangeValues(child);
    }
  };

  // Fix 10 & 11: Detect mistyped element and attribute names
  // SVG 1.1 official element list (from W3C spec)
  const SVG11_ELEMENTS = new Set([
    'a', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
    'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
    'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
    'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
    'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
    'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
    'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
    'feTile', 'feTurbulence', 'filter', 'font', 'font-face', 'font-face-format',
    'font-face-name', 'font-face-src', 'font-face-uri', 'foreignObject', 'g',
    'glyph', 'glyphRef', 'hkern', 'image', 'line', 'linearGradient', 'marker',
    'mask', 'metadata', 'missing-glyph', 'mpath', 'path', 'pattern', 'polygon',
    'polyline', 'radialGradient', 'rect', 'script', 'set', 'stop', 'style',
    'svg', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref', 'tspan',
    'use', 'view', 'vkern'
  ]);

  // SVG 1.1 official attribute list (from W3C spec)
  const SVG11_ATTRIBUTES = new Set([
    // Regular attributes
    'accent-height', 'accumulate', 'additive', 'alphabetic', 'amplitude',
    'arabic-form', 'ascent', 'attributeName', 'attributeType', 'azimuth',
    'baseFrequency', 'baseProfile', 'bbox', 'begin', 'bias', 'by', 'calcMode',
    'cap-height', 'class', 'clipPathUnits', 'contentScriptType', 'contentStyleType',
    'cx', 'cy', 'd', 'descent', 'diffuseConstant', 'divisor', 'dur', 'dx', 'dy',
    'edgeMode', 'elevation', 'end', 'exponent', 'externalResourcesRequired',
    'fill', 'filterRes', 'filterUnits', 'font-family', 'font-size', 'font-stretch',
    'font-style', 'font-variant', 'font-weight', 'format', 'from', 'fx', 'fy',
    'g1', 'g2', 'glyph-name', 'glyphRef', 'gradientTransform', 'gradientUnits',
    'hanging', 'height', 'horiz-adv-x', 'horiz-origin-x', 'horiz-origin-y', 'href',
    'id', 'ideographic', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4',
    'kernelMatrix', 'kernelUnitLength', 'keyPoints', 'keySplines', 'keyTimes',
    'lang', 'lengthAdjust', 'limitingConeAngle', 'local', 'markerHeight',
    'markerUnits', 'markerWidth', 'maskContentUnits', 'maskUnits', 'mathematical',
    'max', 'media', 'method', 'min', 'mode', 'name', 'numOctaves', 'offset',
    'onabort', 'onactivate', 'onbegin', 'onclick', 'onend', 'onerror', 'onfocusin',
    'onfocusout', 'onload', 'onmousedown', 'onmousemove', 'onmouseout',
    'onmouseover', 'onmouseup', 'onrepeat', 'onresize', 'onscroll', 'onunload',
    'onzoom', 'operator', 'order', 'orient', 'orientation', 'origin',
    'overline-position', 'overline-thickness', 'panose-1', 'path', 'pathLength',
    'patternContentUnits', 'patternTransform', 'patternUnits', 'points',
    'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio',
    'primitiveUnits', 'r', 'radius', 'refX', 'refY', 'rendering-intent',
    'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures',
    'restart', 'result', 'rotate', 'rx', 'ry', 'scale', 'seed', 'slope',
    'spacing', 'specularConstant', 'specularExponent', 'spreadMethod',
    'startOffset', 'stdDeviation', 'stemh', 'stemv', 'stitchTiles',
    'strikethrough-position', 'strikethrough-thickness', 'string', 'style',
    'surfaceScale', 'systemLanguage', 'tableValues', 'target', 'targetX',
    'targetY', 'textLength', 'title', 'to', 'transform', 'type', 'u1', 'u2',
    'underline-position', 'underline-thickness', 'unicode', 'unicode-range',
    'units-per-em', 'v-alphabetic', 'v-hanging', 'v-ideographic', 'v-mathematical',
    'values', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'viewBox',
    'viewTarget', 'width', 'widths', 'x', 'x-height', 'x1', 'x2', 'xChannelSelector',
    'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role', 'xlink:show',
    'xlink:title', 'xlink:type', 'xml:base', 'xml:lang', 'xml:space', 'y', 'y1',
    'y2', 'yChannelSelector', 'z', 'zoomAndPan',
    // Presentation attributes
    'alignment-baseline', 'baseline-shift', 'clip-path', 'clip-rule', 'clip',
    'color-interpolation-filters', 'color-interpolation', 'color-profile',
    'color-rendering', 'color', 'cursor', 'direction', 'display',
    'dominant-baseline', 'enable-background', 'fill-opacity', 'fill-rule',
    'filter', 'flood-color', 'flood-opacity', 'font-size-adjust',
    'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering',
    'kerning', 'letter-spacing', 'lighting-color', 'marker-end', 'marker-mid',
    'marker-start', 'mask', 'opacity', 'overflow', 'pointer-events',
    'shape-rendering', 'stop-color', 'stop-opacity', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'stroke-opacity', 'stroke-width', 'stroke', 'text-anchor', 'text-decoration',
    'text-rendering', 'unicode-bidi', 'visibility', 'word-spacing', 'writing-mode',
    // Additional valid attributes
    'xml:id', 'line-height', 'marker'
  ]);

  // Calculate Levenshtein distance for typo detection
  const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return matrix[b.length][a.length];
  };

  // Find closest match with distance <= 2
  const findClosestMatch = (name, validSet) => {
    let closest = null;
    let minDist = 3; // Only consider matches with distance <= 2
    for (const valid of validSet) {
      const dist = levenshtein(name.toLowerCase(), valid.toLowerCase());
      if (dist > 0 && dist < minDist) {
        minDist = dist;
        closest = valid;
      }
    }
    return closest;
  };

  // Create lowercase lookup for case-insensitive matching
  const SVG11_ELEMENTS_LOWER = new Set([...SVG11_ELEMENTS].map(e => e.toLowerCase()));
  const SVG11_ATTRIBUTES_LOWER = new Set([...SVG11_ATTRIBUTES].map(a => a.toLowerCase()));

  // Fix 10: Detect mistyped element names
  const detectMistypedElements = (el) => {
    const tagName = el.tagName;
    const tagLower = tagName.toLowerCase();

    // Skip namespaced elements (rdf:*, dc:*, fbf:*, cc:*, etc.) - these are valid metadata extensions
    // Skip if it's a valid SVG 1.1 element (case-insensitive)
    if (tagName.includes(':') || SVG11_ELEMENTS.has(tagName) || SVG11_ELEMENTS_LOWER.has(tagLower)) {
      // Valid or namespaced - no action needed, just recurse
    }
    // Unknown element - check for typos
    else {
      const suggestion = findClosestMatch(tagName, SVG11_ELEMENTS);
      if (suggestion) {
        fixes.push({
          type: 'mistyped_element_detected',
          element: tagName,
          suggestion: suggestion,
          reason: `Unknown element <${tagName}> - did you mean <${suggestion}>?`
        });
      } else {
        fixes.push({
          type: 'unknown_element_detected',
          element: tagName,
          reason: `Unknown element <${tagName}> - not in SVG 1.1 spec`
        });
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMistypedElements(child);
    }
  };

  // Fix 11: Detect mistyped attribute names
  const detectMistypedAttributes = (el) => {
    for (const attrName of el.getAttributeNames()) {
      // Skip namespace declarations and data-* attributes
      if (attrName.startsWith('xmlns') || attrName.startsWith('data-')) continue;

      // Skip if it's a valid SVG 1.1 attribute (case-insensitive check)
      const attrLower = attrName.toLowerCase();
      if (SVG11_ATTRIBUTES.has(attrName) || SVG11_ATTRIBUTES_LOWER.has(attrLower)) continue;

      // Check for vendor prefixes (don't flag these)
      if (attrName.startsWith('-webkit-') || attrName.startsWith('-moz-') ||
          attrName.startsWith('-ms-') || attrName.startsWith('-o-')) continue;

      // Check for custom namespaced attributes (like inkscape:, sodipodi:, fbf:)
      if (attrName.includes(':') && !attrName.startsWith('xlink:') && !attrName.startsWith('xml:')) {
        // Custom namespace - skip
        continue;
      }

      // Unknown attribute - check for typos
      const suggestion = findClosestMatch(attrName, SVG11_ATTRIBUTES);
      if (suggestion) {
        fixes.push({
          type: 'mistyped_attribute_detected',
          element: el.tagName.toLowerCase(),
          attr: attrName,
          suggestion: suggestion,
          reason: `Unknown attribute '${attrName}' on <${el.tagName.toLowerCase()}> - did you mean '${suggestion}'?`
        });
      }
      // Don't report unknown attributes without suggestions (could be valid vendor/custom attrs)
    }

    for (const child of el.children) {
      if (isElement(child)) detectMistypedAttributes(child);
    }
  };

  // Fix 12: Detect missing required attributes per SVG 1.1 DTD
  // Required attributes that are missing will cause the element to not render correctly
  const REQUIRED_ATTRS = {
    'a': ['href'],
    'animate': ['attributeName'],
    'animateColor': ['attributeName'],
    'animateTransform': ['attributeName'],
    'circle': ['r'],
    'color-profile': ['name'],
    'cursor': ['href'],
    'ellipse': ['rx', 'ry'],
    'feBlend': ['in2'],
    'feComposite': ['in2'],
    'feConvolveMatrix': ['kernelMatrix'],
    'feDisplacementMap': ['in2'],
    'feFuncA': ['type'],
    'feFuncB': ['type'],
    'feFuncG': ['type'],
    'feFuncR': ['type'],
    'feImage': ['href'],
    'font': ['horiz-adv-x'],
    'font-face-uri': ['href'],
    'foreignObject': ['width', 'height'],
    'hkern': ['k'],
    'image': ['href', 'width', 'height'],
    'mpath': ['href'],
    'path': ['d'],
    'polygon': ['points'],
    'polyline': ['points'],
    'rect': ['width', 'height'],
    'script': ['type'],
    'set': ['attributeName'],
    'stop': ['offset'],
    'style': ['type'],
    'textPath': ['href'],
    'tref': ['href'],
    'use': ['href'],
    'vkern': ['k']
  };

  // Also accept xlink:href as alternative to href for backwards compatibility
  const HREF_ALTERNATIVES = ['href', 'xlink:href'];

  const detectMissingRequiredAttrs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const required = REQUIRED_ATTRS[tagName];

    if (required) {
      for (const attr of required) {
        // For href, accept either href or xlink:href
        if (attr === 'href') {
          const hasHref = HREF_ALTERNATIVES.some(a => el.hasAttribute(a));
          if (!hasHref) {
            fixes.push({
              type: 'missing_required_attribute',
              element: tagName,
              attr: attr,
              reason: `Element <${tagName}> is missing required attribute '${attr}' (or 'xlink:href')`
            });
          }
        } else {
          if (!el.hasAttribute(attr)) {
            fixes.push({
              type: 'missing_required_attribute',
              element: tagName,
              attr: attr,
              reason: `Element <${tagName}> is missing required attribute '${attr}'`
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
    'circle': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'ellipse': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'line': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'path': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'polygon': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'polyline': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'rect': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'use': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    'image': new Set(['desc', 'title', 'metadata', 'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set']),
    // Animation elements can only have desc, title, metadata
    'animate': new Set(['desc', 'title', 'metadata']),
    'animatecolor': new Set(['desc', 'title', 'metadata']),
    'animatemotion': new Set(['desc', 'title', 'metadata', 'mpath']),
    'animatetransform': new Set(['desc', 'title', 'metadata']),
    'set': new Set(['desc', 'title', 'metadata']),
    // Gradient elements have specific children
    'lineargradient': new Set(['desc', 'title', 'metadata', 'animate', 'animatetransform', 'set', 'stop']),
    'radialgradient': new Set(['desc', 'title', 'metadata', 'animate', 'animatetransform', 'set', 'stop']),
    // Filter primitive elements
    'filter': new Set(['desc', 'title', 'metadata', 'animate', 'set', 'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feconvolvematrix', 'fediffuselighting', 'fedisplacementmap', 'feflood', 'fegaussianblur', 'feimage', 'femerge', 'femorphology', 'feoffset', 'fespecularlighting', 'fetile', 'feturbulence']),
    // Stop element is empty in practice
    'stop': new Set(['animate', 'animatecolor', 'set'])
  };

  const detectInvalidChildren = (el) => {
    const tagName = el.tagName.toLowerCase();
    const allowedChildren = RESTRICTED_CHILDREN[tagName];

    if (allowedChildren) {
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          // Skip namespaced elements (rdf:*, dc:*, etc.)
          if (!childTag.includes(':') && !allowedChildren.has(childTag)) {
            fixes.push({
              type: 'invalid_child_element',
              parent: tagName,
              child: childTag,
              reason: `Element <${childTag}> is not a valid child of <${tagName}> per SVG 1.1 DTD`
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
    'alignment-baseline': ['auto', 'baseline', 'before-edge', 'text-before-edge', 'middle', 'central', 'after-edge', 'text-after-edge', 'ideographic', 'alphabetic', 'hanging', 'mathematical', 'inherit'],
    'clip-rule': ['nonzero', 'evenodd', 'inherit'],
    'color-interpolation': ['auto', 'sRGB', 'linearRGB', 'inherit'],
    'color-interpolation-filters': ['auto', 'sRGB', 'linearRGB', 'inherit'],
    'color-rendering': ['auto', 'optimizeSpeed', 'optimizeQuality', 'inherit'],
    'direction': ['ltr', 'rtl', 'inherit'],
    'display': ['inline', 'block', 'list-item', 'run-in', 'compact', 'marker', 'table', 'inline-table', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-row', 'table-column-group', 'table-column', 'table-cell', 'table-caption', 'none', 'inherit'],
    'dominant-baseline': ['auto', 'use-script', 'no-change', 'reset-size', 'ideographic', 'alphabetic', 'hanging', 'mathematical', 'central', 'middle', 'text-after-edge', 'text-before-edge', 'inherit'],
    'fill-rule': ['nonzero', 'evenodd', 'inherit'],
    'font-stretch': ['normal', 'wider', 'narrower', 'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded', 'inherit'],
    'font-style': ['normal', 'italic', 'oblique', 'inherit'],
    'font-variant': ['normal', 'small-caps', 'inherit'],
    'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900', 'inherit'],
    'image-rendering': ['auto', 'optimizeSpeed', 'optimizeQuality', 'inherit'],
    'overflow': ['visible', 'hidden', 'scroll', 'auto', 'inherit'],
    'pointer-events': ['visiblePainted', 'visibleFill', 'visibleStroke', 'visible', 'painted', 'fill', 'stroke', 'all', 'none', 'inherit'],
    'shape-rendering': ['auto', 'optimizeSpeed', 'crispEdges', 'geometricPrecision', 'inherit'],
    'stroke-linecap': ['butt', 'round', 'square', 'inherit'],
    'stroke-linejoin': ['miter', 'round', 'bevel', 'inherit'],
    'text-anchor': ['start', 'middle', 'end', 'inherit'],
    'text-rendering': ['auto', 'optimizeSpeed', 'optimizeLegibility', 'geometricPrecision', 'inherit'],
    'unicode-bidi': ['normal', 'embed', 'bidi-override', 'inherit'],
    'visibility': ['visible', 'hidden', 'collapse', 'inherit'],
    'writing-mode': ['lr-tb', 'rl-tb', 'tb-rl', 'lr', 'rl', 'tb', 'inherit'],
    'xml:space': ['default', 'preserve'],
    // Animation-specific
    'additive': ['replace', 'sum'],
    'accumulate': ['none', 'sum'],
    'calcMode': ['discrete', 'linear', 'paced', 'spline'],
    'fill': ['freeze', 'remove'],  // Animation fill (different from paint fill)
    'restart': ['always', 'whenNotActive', 'never'],
    'attributeType': ['CSS', 'XML', 'auto'],
    // Filter-specific
    'edgeMode': ['duplicate', 'wrap', 'none'],
    'operator': ['over', 'in', 'out', 'atop', 'xor', 'arithmetic', 'erode', 'dilate'],
    'mode': ['normal', 'multiply', 'screen', 'darken', 'lighten'],
    'type': ['translate', 'scale', 'rotate', 'skewX', 'skewY', 'matrix', 'saturate', 'hueRotate', 'luminanceToAlpha', 'identity', 'table', 'discrete', 'linear', 'gamma', 'fractalNoise', 'turbulence'],
    // Gradient-specific
    'spreadMethod': ['pad', 'reflect', 'repeat'],
    'gradientUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'patternUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'patternContentUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'clipPathUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'maskUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'maskContentUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'filterUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'primitiveUnits': ['userSpaceOnUse', 'objectBoundingBox'],
    'markerUnits': ['strokeWidth', 'userSpaceOnUse'],
    // Other
    'method': ['align', 'stretch'],
    'spacing': ['auto', 'exact'],
    'lengthAdjust': ['spacing', 'spacingAndGlyphs'],
    'preserveAspectRatio': ['none', 'xMinYMin', 'xMidYMin', 'xMaxYMin', 'xMinYMid', 'xMidYMid', 'xMaxYMid', 'xMinYMax', 'xMidYMax', 'xMaxYMax'],
    'zoomAndPan': ['disable', 'magnify'],
    'externalResourcesRequired': ['true', 'false']
  };

  // Attributes that can have additional modifiers (like "xMidYMid slice")
  const COMPOUND_ATTRS = new Set(['preserveAspectRatio']);

  const detectInvalidEnumValues = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      const validValues = ENUMERATED_ATTRIBUTES[attrName];
      if (validValues) {
        let value = el.getAttribute(attrName);

        // For compound attributes, check just the first word
        if (COMPOUND_ATTRS.has(attrName)) {
          value = value.split(/\s+/)[0];
        }

        // Skip animation 'fill' check on non-animation elements (paint fill is different)
        if (attrName === 'fill' && !['animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set'].includes(tagName)) {
          continue;
        }

        if (!validValues.includes(value) && value !== 'inherit') {
          fixes.push({
            type: 'invalid_enum_value',
            element: tagName,
            attr: attrName,
            value: value,
            validValues: validValues.slice(0, 5).join(', ') + (validValues.length > 5 ? '...' : ''),
            reason: `Invalid value '${value}' for attribute '${attrName}' - must be one of: ${validValues.slice(0, 5).join(', ')}${validValues.length > 5 ? '...' : ''}`
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
    'opacity': { min: 0, max: 1, type: 'number' },
    'fill-opacity': { min: 0, max: 1, type: 'number' },
    'stroke-opacity': { min: 0, max: 1, type: 'number' },
    'stop-opacity': { min: 0, max: 1, type: 'number' },
    'flood-opacity': { min: 0, max: 1, type: 'number' },

    // Positive only
    'stroke-width': { min: 0, type: 'length' },
    'stroke-miterlimit': { min: 1, type: 'number' },  // Must be >= 1
    'font-size': { min: 0, type: 'length' },
    'r': { min: 0, type: 'length' },  // radius must be positive
    'rx': { min: 0, type: 'length' },
    'ry': { min: 0, type: 'length' },
    'width': { min: 0, type: 'length' },  // dimensions must be positive
    'height': { min: 0, type: 'length' },

    // Filter specific
    'stdDeviation': { min: 0, type: 'number' },
    'scale': { type: 'number' },  // Can be any number
    'baseFrequency': { min: 0, type: 'number' },
    'numOctaves': { min: 1, type: 'integer' },
    'seed': { min: 0, type: 'number' },

    // Animation specific
    'repeatCount': { min: 0, type: 'number' },  // 'indefinite' also valid
  };

  const detectInvalidNumericValues = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      const constraint = NUMERIC_CONSTRAINTS[attrName];
      if (constraint) {
        const value = el.getAttribute(attrName);

        // Skip special values
        if (value === 'inherit' || value === 'none' || value === 'indefinite' || value === 'auto') {
          continue;
        }

        // Extract numeric part (remove units)
        const numMatch = value.match(/^([+-]?\d*\.?\d+)/);
        if (numMatch) {
          const num = parseFloat(numMatch[1]);

          if (isNaN(num)) {
            fixes.push({
              type: 'invalid_numeric_value',
              element: tagName,
              attr: attrName,
              value: value,
              reason: `Invalid numeric value '${value}' for attribute '${attrName}'`
            });
          } else {
            if (constraint.min !== undefined && num < constraint.min) {
              fixes.push({
                type: 'numeric_out_of_range',
                element: tagName,
                attr: attrName,
                value: value,
                constraint: `min: ${constraint.min}`,
                reason: `Value '${value}' for '${attrName}' is below minimum (${constraint.min})`
              });
            }
            if (constraint.max !== undefined && num > constraint.max) {
              fixes.push({
                type: 'numeric_out_of_range',
                element: tagName,
                attr: attrName,
                value: value,
                constraint: `max: ${constraint.max}`,
                reason: `Value '${value}' for '${attrName}' exceeds maximum (${constraint.max})`
              });
            }
            if (constraint.type === 'integer' && !Number.isInteger(num)) {
              fixes.push({
                type: 'invalid_numeric_value',
                element: tagName,
                attr: attrName,
                value: value,
                reason: `Attribute '${attrName}' requires an integer value, got '${value}'`
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

  const detectDuplicateIds = (doc) => {
    const idMap = new Map(); // id -> array of elements with that id

    const collectIds = (el) => {
      const id = el.getAttribute('id');
      if (id) {
        if (!idMap.has(id)) {
          idMap.set(id, []);
        }
        idMap.get(id).push(el.tagName.toLowerCase());
      }
      for (const child of el.children) {
        if (isElement(child)) collectIds(child);
      }
    };

    collectIds(doc);

    // Report duplicates
    for (const [id, elements] of idMap) {
      if (elements.length > 1) {
        fixes.push({
          type: 'duplicate_id',
          id: id,
          count: elements.length,
          elements: elements.join(', '),
          reason: `Duplicate ID '${id}' found on ${elements.length} elements: ${elements.join(', ')}`
        });
      }
    }
  };

  // Fix 17: Detect broken URL references (url(#id) pointing to non-existent IDs)
  // This catches references to IDs that don't exist in the document

  const detectBrokenReferences = (doc) => {
    // First, collect all existing IDs
    const existingIds = new Set();
    const collectIds = (el) => {
      const id = el.getAttribute('id');
      if (id) existingIds.add(id);
      for (const child of el.children) {
        if (isElement(child)) collectIds(child);
      }
    };
    collectIds(doc);

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
              type: 'broken_reference',
              element: tagName,
              attr: attrName,
              refId: refId,
              reason: `Broken reference: url(#${refId}) points to non-existent ID`
            });
          }
        }

        // Check href="#id" references
        if (attrName === 'href' || attrName === 'xlink:href') {
          const hrefMatch = value.match(hrefPattern);
          if (hrefMatch) {
            const refId = hrefMatch[1];
            if (!existingIds.has(refId)) {
              fixes.push({
                type: 'broken_reference',
                element: tagName,
                attr: attrName,
                refId: refId,
                reason: `Broken reference: ${attrName}="#${refId}" points to non-existent ID`
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
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
    'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
    'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
    'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
    'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
    'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
    'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
    'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
    'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
    'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
    'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
    'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
    'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue',
    'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
    'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue',
    'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
    'yellow', 'yellowgreen'
  ]);

  // All SVG attributes that can contain color values
  // Note: Using Set for O(1) lookup in validation loops
  const COLOR_ATTRS = new Set([
    'fill', 'stroke', 'color',                              // Common
    'stop-color', 'flood-color', 'lighting-color',          // Gradients/filters
    'solid-color',                                          // SVG2 solid-color paint server
  ]);

  const isValidColor = (value) => {
    const v = value.toLowerCase().trim();
    // Special values
    if (v === 'none' || v === 'inherit' || v === 'currentcolor') return true;
    // Named color
    if (SVG_NAMED_COLORS.has(v)) return true;
    // url(#id) reference
    if (v.startsWith('url(')) return true;
    // #RGB or #RRGGBB
    if (/^#[0-9a-f]{3}$/.test(v) || /^#[0-9a-f]{6}$/.test(v)) return true;
    // rgb(r, g, b) or rgb(r%, g%, b%)
    if (/^rgb\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*\)$/.test(v)) return true;
    // rgba() - SVG 2.0 but commonly supported
    if (/^rgba\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*[\d.]+%?\s*\)$/.test(v)) return true;
    return false;
  };

  const detectInvalidColors = (el) => {
    const tagName = el.tagName.toLowerCase();

    for (const attrName of el.getAttributeNames()) {
      if (COLOR_ATTRS.has(attrName)) {
        const value = el.getAttribute(attrName);
        if (!isValidColor(value)) {
          fixes.push({
            type: 'invalid_color',
            element: tagName,
            attr: attrName,
            value: value,
            reason: `Invalid color value '${value}' for attribute '${attrName}'`
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
    if (['svg', 'symbol', 'marker', 'pattern', 'view'].includes(tagName)) {
      const viewBox = el.getAttribute('viewBox');
      if (viewBox) {
        // Split by whitespace or comma
        const parts = viewBox.trim().split(/[\s,]+/);
        if (parts.length !== 4) {
          fixes.push({
            type: 'malformed_viewbox',
            element: tagName,
            value: viewBox,
            reason: `viewBox must have exactly 4 values (min-x, min-y, width, height), got ${parts.length}`
          });
        } else {
          // Check each part is a valid number
          for (let i = 0; i < parts.length; i++) {
            if (!/^[+-]?\d*\.?\d+([Ee][+-]?\d+)?$/.test(parts[i])) {
              fixes.push({
                type: 'malformed_viewbox',
                element: tagName,
                value: viewBox,
                reason: `viewBox contains invalid number '${parts[i]}' at position ${i + 1}`
              });
              break;
            }
          }
          // Check width and height are non-negative
          const width = parseFloat(parts[2]);
          const height = parseFloat(parts[3]);
          if (width < 0 || height < 0) {
            fixes.push({
              type: 'invalid_viewbox_dimensions',
              element: tagName,
              value: viewBox,
              reason: `viewBox width and height must be non-negative, got ${width}x${height}`
            });
          }
        }
      }
    }

    // Check preserveAspectRatio format
    const par = el.getAttribute('preserveAspectRatio');
    if (par) {
      const parPattern = /^(none|xMinYMin|xMidYMin|xMaxYMin|xMinYMid|xMidYMid|xMaxYMid|xMinYMax|xMidYMax|xMaxYMax)(\s+(meet|slice))?$/;
      if (!parPattern.test(par.trim())) {
        fixes.push({
          type: 'malformed_preserveaspectratio',
          element: tagName,
          value: par,
          reason: `Invalid preserveAspectRatio format '${par}'`
        });
      }
    }

    // Check points format on polygon/polyline
    if (['polygon', 'polyline'].includes(tagName)) {
      const points = el.getAttribute('points');
      if (points) {
        // Points must be pairs of numbers
        const nums = points.trim().split(/[\s,]+/);
        if (nums.length > 0 && nums.length % 2 !== 0) {
          fixes.push({
            type: 'malformed_points',
            element: tagName,
            value: points.slice(0, 50) + (points.length > 50 ? '...' : ''),
            reason: `points attribute must have even number of values (x,y pairs), got ${nums.length}`
          });
        }
      }
    }

    // Check transform syntax
    const transform = el.getAttribute('transform');
    if (transform) {
      const validTransforms = /^(\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)\s*)+$/;
      if (!validTransforms.test(transform.trim())) {
        // Only flag if it doesn't look like a valid transform at all
        if (!/^[\s\w(),.\-+]+$/.test(transform)) {
          fixes.push({
            type: 'malformed_transform',
            element: tagName,
            value: transform.slice(0, 50) + (transform.length > 50 ? '...' : ''),
            reason: `Potentially malformed transform attribute`
          });
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMalformedFormats(child);
    }
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
  detectOutOfRangeValues(doc);
  detectMistypedElements(doc);
  detectMistypedAttributes(doc);
  detectMissingRequiredAttrs(doc);
  detectInvalidChildren(doc);
  detectInvalidEnumValues(doc);
  detectInvalidNumericValues(doc);
  detectDuplicateIds(doc);
  detectBrokenReferences(doc);
  detectInvalidColors(doc);
  detectMalformedFormats(doc);

  // Add fix report as attribute
  doc.setAttribute('data-fixes-applied', String(fixes.length));

  if (verbose && fixes.length > 0) {
    doc.setAttribute('data-fix-report', JSON.stringify(fixes));
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
  ERROR: 'error',    // Definite spec violation that will cause rendering issues
  WARNING: 'warning' // Potential issue or non-standard usage that may work
};

/**
 * SVG 2.0 elements - these are valid but not part of SVG 1.1
 * We don't flag these as errors, just skip validation for them
 * @private
 */
const SVG2_ELEMENTS = new Set([
  'mesh', 'meshgradient', 'meshpatch', 'meshrow',
  'solidcolor', 'hatch', 'hatchpath',
  'discard', 'unknown', 'canvas', 'video', 'audio', 'iframe', 'source', 'track'
]);

/**
 * SVG 2.0 attributes - valid in SVG 2.0 but not SVG 1.1
 * @private
 */
const SVG2_ATTRIBUTES = new Set([
  'href', 'tabindex', 'lang', 'autofocus', 'nonce',
  'slot', 'part', 'exportparts', 'contenteditable',
  'inputmode', 'enterkeyhint', 'is', 'itemid', 'itemprop',
  'itemref', 'itemscope', 'itemtype', 'translate', 'autocapitalize'
]);

/**
 * Maps issue types to their severity level
 * ERRORS: Definite spec violations that break rendering
 * WARNINGS: Potential issues that may work but are non-standard
 * @private
 */
const ISSUE_SEVERITY = {
  // ERRORS - Definite problems that break rendering
  'broken_reference': ValidationSeverity.ERROR,
  'broken_url_reference': ValidationSeverity.ERROR,
  'duplicate_id': ValidationSeverity.ERROR,
  'missing_required_attribute': ValidationSeverity.ERROR,
  'invalid_child_element': ValidationSeverity.ERROR,
  'animation_in_empty_element': ValidationSeverity.ERROR,
  'malformed_viewbox': ValidationSeverity.ERROR,
  'malformed_points': ValidationSeverity.ERROR,
  'malformed_transform': ValidationSeverity.ERROR,
  'invalid_enum_value': ValidationSeverity.ERROR,
  'invalid_numeric_constraint': ValidationSeverity.ERROR,

  // WARNINGS - Potential issues that may still render
  'invalid_attr_on_element': ValidationSeverity.WARNING,
  'missing_namespace': ValidationSeverity.WARNING,
  'invalid_timing': ValidationSeverity.WARNING,
  'uppercase_unit': ValidationSeverity.WARNING,
  'invalid_whitespace': ValidationSeverity.WARNING,
  'invalid_number': ValidationSeverity.WARNING,
  'mistyped_element_detected': ValidationSeverity.WARNING,
  'unknown_element_detected': ValidationSeverity.WARNING,
  'mistyped_attribute_detected': ValidationSeverity.WARNING,
  'unknown_attribute_detected': ValidationSeverity.WARNING,
  'invalid_color': ValidationSeverity.WARNING
};

/**
 * Build a position index from SVG source string
 * Maps element tags and their attributes to line:column positions
 * @private
 * @param {string} svgString - The raw SVG source string
 * @returns {Object} Position index with helper methods
 */
function buildPositionIndex(svgString) {
  const index = {
    elements: new Map(),  // tag name -> array of {line, column, endColumn, attrs}
    lines: [],            // Array of line start positions for quick lookup
  };

  // Build line start positions
  let pos = 0;
  index.lines.push(0);  // Line 1 starts at position 0
  for (let i = 0; i < svgString.length; i++) {
    if (svgString[i] === '\n') {
      index.lines.push(i + 1);
    }
  }

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
  let match;

  while ((match = tagPattern.exec(svgString)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrsString = match[2];
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;
    const { line, column } = posToLineCol(tagStart);

    // Parse attributes within this tag
    const attrs = new Map();
    const attrPattern = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrsString)) !== null) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2];
      const attrPos = tagStart + match[0].indexOf(attrMatch[0]);
      const attrLineCol = posToLineCol(attrPos);
      attrs.set(attrName.toLowerCase(), {
        name: attrName,
        value: attrValue,
        line: attrLineCol.line,
        column: attrLineCol.column
      });
    }

    if (!index.elements.has(tagName)) {
      index.elements.set(tagName, []);
    }
    index.elements.get(tagName).push({
      line,
      column,
      endColumn: column + match[0].length - 1,
      attrs
    });
  }

  // Helper to get position for nth occurrence of an element
  index.getElementPosition = (tagName, occurrenceIndex = 0) => {
    const occurrences = index.elements.get(tagName.toLowerCase());
    if (occurrences && occurrences[occurrenceIndex]) {
      const occ = occurrences[occurrenceIndex];
      return { line: occ.line, column: occ.column };
    }
    return { line: 1, column: 1 };  // Fallback
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
    return { line: 1, column: 1 };  // Fallback
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
  // Extract options with defaults
  const errorsOnly = options.errorsOnly === true;
  const outputFile = options.outputFile || null;
  const outputFormat = (options.outputFormat || 'json').toLowerCase();
  const includeSource = options.includeSource === true;

  // Validate outputFormat
  const validFormats = ['text', 'json', 'xml', 'yaml'];
  if (outputFile && !validFormats.includes(outputFormat)) {
    throw new Error(`Invalid outputFormat '${outputFormat}'. Must be one of: ${validFormats.join(', ')}`);
  }

  // Get the raw SVG string for position tracking
  let svgString = '';
  let inputType;

  try {
    inputType = detectInputType(input);

    if (inputType === InputType.SVG_STRING) {
      svgString = input;
    } else if (inputType === InputType.FILE_PATH) {
      // Cross-platform file reading
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const normalizedPath = path.normalize(input);
      try {
        svgString = await fs.readFile(normalizedPath, 'utf8');
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
        throw new Error(`Failed to fetch URL '${input}': ${fetchError.message}`);
      }
    } else if (inputType === InputType.DOM_ELEMENT) {
      // For DOM elements, serialize to string first
      if (typeof XMLSerializer !== 'undefined') {
        svgString = new XMLSerializer().serializeToString(input);
      } else if (input.outerHTML) {
        svgString = input.outerHTML;
      } else {
        throw new Error('Cannot serialize DOM element: XMLSerializer not available');
      }
    } else {
      throw new Error(`Unknown input type: ${typeof input}`);
    }
  } catch (inputError) {
    // Return a validation result indicating the input error
    return {
      issues: [{
        type: 'input_error',
        severity: ValidationSeverity.ERROR,
        reason: inputError.message,
        line: 0,
        column: 0
      }],
      isValid: false,
      hasErrors: true,
      hasWarnings: false,
      errorCount: 1,
      warningCount: 0,
      summary: { input_error: 1 }
    };
  }

  // Split source into lines for includeSource option
  const sourceLines = includeSource ? svgString.split('\n') : null;

  // Build position index from the raw string
  const positionIndex = buildPositionIndex(svgString);

  // Parse to DOM for validation
  let doc;
  try {
    doc = await loadInput(input, inputType);
  } catch (parseError) {
    return {
      issues: [{
        type: 'parse_error',
        severity: ValidationSeverity.ERROR,
        reason: `Failed to parse SVG: ${parseError.message}`,
        line: 0,
        column: 0
      }],
      isValid: false,
      hasErrors: true,
      hasWarnings: false,
      errorCount: 1,
      warningCount: 0,
      summary: { parse_error: 1 }
    };
  }

  const issues = [];

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
  const createIssue = (issueData, tagName, attrName = null, occurrenceIndex = null) => {
    let pos;
    if (attrName) {
      pos = positionIndex.getAttributePosition(tagName, attrName, occurrenceIndex || 0);
    } else {
      pos = positionIndex.getElementPosition(tagName, occurrenceIndex || 0);
    }

    // Look up severity from the mapping, default to WARNING if unknown
    const severity = ISSUE_SEVERITY[issueData.type] || ValidationSeverity.WARNING;

    const issue = {
      ...issueData,
      severity,
      line: pos.line,
      column: pos.column
    };

    // Optionally include source line content
    if (includeSource && sourceLines && pos.line > 0 && pos.line <= sourceLines.length) {
      issue.sourceLine = sourceLines[pos.line - 1];
    }

    return issue;
  };

  /**
   * Check if an element is an SVG 2.0 element (should be skipped, not flagged)
   * @private
   */
  const isSvg2Element = (tagName) => {
    return SVG2_ELEMENTS.has(tagName.toLowerCase());
  };

  /**
   * Check if an attribute is an SVG 2.0 attribute (should be skipped, not flagged)
   * @private
   */
  const isSvg2Attribute = (attrName) => {
    return SVG2_ATTRIBUTES.has(attrName.toLowerCase());
  };

  // Collect all IDs in the document
  const allIds = new Set();
  const collectIds = (el) => {
    const id = el.getAttribute('id');
    if (id) allIds.add(id);
    for (const child of el.children) {
      if (isElement(child)) collectIds(child);
    }
  };
  collectIds(doc);

  // SVG 1.1: Attributes NOT valid on <g> elements
  // These are shape-specific attributes valid on rect, circle, ellipse, line, etc. but NOT on <g>
  const INVALID_G_ATTRS = [
    'x', 'y', 'width', 'height',       // Position/size - valid on rect, image, svg, use, etc.
    'cx', 'cy', 'r',                   // Circle attributes
    'rx', 'ry',                        // Ellipse/rect corner radius
    'x1', 'y1', 'x2', 'y2',            // Line attributes
    'd',                               // Path data
    'points',                          // Polygon/polyline points
  ];

  // Check 1: Detect invalid attributes on elements
  const detectInvalidAttrsOnElements = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // <g> elements don't support x, y, width, height in SVG 1.1
    if (tagName === 'g') {
      for (const attr of INVALID_G_ATTRS) {
        if (el.hasAttribute(attr)) {
          issues.push(createIssue({
            type: 'invalid_attr_on_element',
            element: tagName,
            attr: attr,
            value: el.getAttribute(attr),
            reason: `SVG 1.1: <g> elements do not support '${attr}' attribute`
          }, tagName, attr, occIdx));
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
        if (attrName.startsWith('xlink:')) {
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

    if (hasXlinkAttrs && !doc.hasAttribute('xmlns:xlink')) {
      const pos = positionIndex.getAttributePosition(firstXlinkElement, firstXlinkAttr, 0);
      issues.push({
        type: 'missing_namespace',
        namespace: 'xmlns:xlink',
        reason: 'Document uses xlink:* attributes but missing xmlns:xlink namespace declaration',
        line: pos.line,
        column: pos.column
      });
    }
  };

  // Check 3: Detect broken ID references
  const detectBrokenIdRefs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // Check xlink:href and href for #id references
    for (const attrName of ['xlink:href', 'href']) {
      const val = el.getAttribute(attrName);
      if (val && val.startsWith('#')) {
        const refId = val.slice(1);
        if (refId && !allIds.has(refId)) {
          issues.push(createIssue({
            type: 'broken_reference',
            element: tagName,
            attr: attrName,
            referencedId: refId,
            reason: `Reference to non-existent ID '${refId}'`
          }, tagName, attrName, occIdx));
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectBrokenIdRefs(child);
    }
  };

  // Check 4: Detect invalid animation timing values
  const TIMING_ATTRS = ['begin', 'end', 'dur', 'repeatDur', 'min', 'max'];
  const ANIMATION_ELEMENTS = new Set(['animate', 'animateTransform', 'animateMotion', 'animateColor', 'set']);

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
            issues.push(createIssue({
              type: 'invalid_timing',
              element: tagName,
              attr: attr,
              value: val,
              reason: `Timing value has leading/trailing whitespace`
            }, tagName, attr, occIdx));
          }
          // Check for invalid characters in timing
          if (/[;,]/.test(trimmed) && !/^[\d\w\s.;,+-]+$/.test(trimmed)) {
            issues.push(createIssue({
              type: 'invalid_timing',
              element: tagName,
              attr: attr,
              value: val,
              reason: `Timing value may contain invalid characters`
            }, tagName, attr, occIdx));
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
  const EMPTY_CONTENT_MODEL_ELEMENTS = new Set(['font-face-format', 'font-face-name', 'glyphref', 'hkern', 'vkern']);

  const detectAnimationInEmptyElements = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    if (EMPTY_CONTENT_MODEL_ELEMENTS.has(tagName)) {
      for (const child of el.children) {
        if (isElement(child)) {
          const childTag = child.tagName.toLowerCase();
          if (ANIMATION_ELEMENTS.has(childTag)) {
            issues.push(createIssue({
              type: 'animation_in_empty_element',
              element: tagName,
              child: childTag,
              reason: `Animation element <${childTag}> inside <${tagName}> which has EMPTY content model per SVG 1.1 DTD`
            }, tagName, null, occIdx));
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
    'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'stroke-width', 'font-size', 'letter-spacing', 'word-spacing', 'stroke-dashoffset'
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
            const unit = m.replace(/[\d.]+/, '');
            if (unit !== unit.toLowerCase()) {
              issues.push(createIssue({
                type: 'uppercase_unit',
                element: tagName,
                attr: attr,
                value: val,
                reason: `Unit '${unit}' should be lowercase '${unit.toLowerCase()}'`
              }, tagName, attr, occIdx));
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
  const LIST_ATTRS = ['points', 'viewBox', 'd', 'values', 'keyTimes', 'keySplines', 'rotate'];

  const detectInvalidWhitespaceInLists = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of LIST_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        // Check for tabs, newlines, multiple spaces
        if (/[\t\n\r]/.test(val) || /  +/.test(val)) {
          issues.push(createIssue({
            type: 'invalid_whitespace',
            element: tagName,
            attr: attr,
            reason: `List attribute contains tabs, newlines, or multiple consecutive spaces`
          }, tagName, attr, occIdx));
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidWhitespaceInLists(child);
    }
  };

  // Check 8: Detect invalid number formats
  const NUMERIC_ATTRS = [
    'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'stroke-width', 'stroke-miterlimit', 'stroke-dashoffset', 'opacity', 'fill-opacity',
    'stroke-opacity', 'font-size'
  ];

  const detectInvalidNumbers = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of NUMERIC_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        const trimmed = val.trim();
        // Check for leading zeros that are problematic (e.g., "007" but not "0.7")
        if (/^0\d+$/.test(trimmed.replace(/[a-z%]+$/i, ''))) {
          issues.push(createIssue({
            type: 'invalid_number',
            element: tagName,
            attr: attr,
            value: val,
            reason: `Number has unnecessary leading zeros`
          }, tagName, attr, occIdx));
        }
        // Check for trailing decimal point
        if (/\.$/.test(trimmed.replace(/[a-z%]+$/i, ''))) {
          issues.push(createIssue({
            type: 'invalid_number',
            element: tagName,
            attr: attr,
            value: val,
            reason: `Number has trailing decimal point`
          }, tagName, attr, occIdx));
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidNumbers(child);
    }
  };

  // Check 9: (REMOVED - merged into Check 15 detectInvalidNumericConstraints)

  // Check 10: Detect mistyped element names (using SVG 1.1 element set)
  const SVG11_ELEMENTS = new Set([
    'a', 'altglyph', 'altglyphdef', 'altglyphitem', 'animate', 'animatecolor',
    'animatemotion', 'animatetransform', 'circle', 'clippath', 'color-profile',
    'cursor', 'defs', 'desc', 'ellipse', 'feblend', 'fecolormatrix',
    'fecomponenttransfer', 'fecomposite', 'feconvolvematrix', 'fediffuselighting',
    'fedisplacementmap', 'fedistantlight', 'feflood', 'fefunca', 'fefuncb',
    'fefuncg', 'fefuncr', 'fegaussianblur', 'feimage', 'femerge', 'femergenode',
    'femorphology', 'feoffset', 'fepointlight', 'fespecularlighting', 'fespotlight',
    'fetile', 'feturbulence', 'filter', 'font', 'font-face', 'font-face-format',
    'font-face-name', 'font-face-src', 'font-face-uri', 'foreignobject', 'g',
    'glyph', 'glyphref', 'hkern', 'image', 'line', 'lineargradient', 'marker',
    'mask', 'metadata', 'missing-glyph', 'mpath', 'path', 'pattern', 'polygon',
    'polyline', 'radialgradient', 'rect', 'script', 'set', 'stop', 'style',
    'svg', 'switch', 'symbol', 'text', 'textpath', 'title', 'tref', 'tspan',
    'use', 'view', 'vkern'
  ]);
  const SVG11_ELEMENTS_LOWER = new Set([...SVG11_ELEMENTS].map(e => e.toLowerCase()));

  // Levenshtein distance for typo detection
  const levenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  };

  const findClosestElement = (name) => {
    const lower = name.toLowerCase();
    let closest = null;
    let minDist = Infinity;
    for (const el of SVG11_ELEMENTS) {
      const dist = levenshteinDistance(lower, el.toLowerCase());
      if (dist < minDist && dist <= 2) {
        minDist = dist;
        closest = el;
      }
    }
    return closest;
  };

  const detectMistypedElements = (el, insideNonSvgContext = false) => {
    const tagName = el.tagName;
    const tagLower = tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagLower);

    // Track if we're inside a non-SVG context where other XML/HTML content is valid:
    // - foreignObject (HTML content is explicitly allowed by SVG spec)
    // - Namespaced elements (e.g., d:testDescription, metadata content)
    const isNamespacedElement = tagName.includes(':');
    const inNonSvgContext = insideNonSvgContext || tagLower === 'foreignobject' || isNamespacedElement;

    // Skip validation entirely if we're in non-SVG context
    if (!inNonSvgContext) {
      // Only validate elements that are not valid SVG 1.1 or SVG 2.0
      if (!SVG11_ELEMENTS.has(tagName) && !SVG11_ELEMENTS_LOWER.has(tagLower)) {
        // Don't flag SVG 2.0 elements as unknown - they're valid, just not in SVG 1.1
        if (!isSvg2Element(tagLower)) {
          const suggestion = findClosestElement(tagName);
          if (suggestion) {
            issues.push(createIssue({
              type: 'mistyped_element_detected',
              element: tagName,
              suggestion: suggestion,
              reason: `Unknown element <${tagName}> - did you mean <${suggestion}>?`
            }, tagLower, null, occIdx));
          } else {
            issues.push(createIssue({
              type: 'unknown_element_detected',
              element: tagName,
              reason: `Unknown element <${tagName}> - not in SVG 1.1 spec`
            }, tagLower, null, occIdx));
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
  const SVG11_ATTRIBUTES = new Set([
    'accent-height', 'accumulate', 'additive', 'alignment-baseline', 'alphabetic',
    'amplitude', 'arabic-form', 'ascent', 'attributeName', 'attributeType', 'azimuth',
    'baseFrequency', 'baseline-shift', 'baseProfile', 'bbox', 'begin', 'bias',
    'by', 'calcMode', 'cap-height', 'class', 'clip', 'clip-path', 'clip-rule',
    'clipPathUnits', 'color', 'color-interpolation', 'color-interpolation-filters',
    'color-profile', 'color-rendering', 'contentScriptType', 'contentStyleType',
    'cursor', 'cx', 'cy', 'd', 'descent', 'diffuseConstant', 'direction',
    'display', 'divisor', 'dominant-baseline', 'dur', 'dx', 'dy', 'edgeMode',
    'elevation', 'enable-background', 'end', 'exponent', 'externalResourcesRequired',
    'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterRes', 'filterUnits',
    'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust',
    'font-stretch', 'font-style', 'font-variant', 'font-weight', 'format', 'from',
    'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyph-orientation-horizontal',
    'glyph-orientation-vertical', 'glyphRef', 'gradientTransform', 'gradientUnits',
    'hanging', 'height', 'horiz-adv-x', 'horiz-origin-x', 'horiz-origin-y', 'href',
    'id', 'ideographic', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1',
    'k2', 'k3', 'k4', 'kernelMatrix', 'kernelUnitLength', 'kerning', 'keyPoints',
    'keySplines', 'keyTimes', 'lang', 'lengthAdjust', 'letter-spacing',
    'lighting-color', 'limitingConeAngle', 'local', 'marker-end', 'marker-mid',
    'marker-start', 'markerHeight', 'markerUnits', 'markerWidth', 'mask',
    'maskContentUnits', 'maskUnits', 'mathematical', 'max', 'media', 'method',
    'min', 'mode', 'name', 'numOctaves', 'offset', 'onabort', 'onactivate',
    'onbegin', 'onclick', 'onend', 'onerror', 'onfocusin', 'onfocusout', 'onload',
    'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup',
    'onrepeat', 'onresize', 'onscroll', 'onunload', 'onzoom', 'opacity', 'operator',
    'order', 'orient', 'orientation', 'origin', 'overflow', 'overline-position',
    'overline-thickness', 'panose-1', 'path', 'pathLength', 'patternContentUnits',
    'patternTransform', 'patternUnits', 'pointer-events', 'points',
    'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio',
    'primitiveUnits', 'r', 'radius', 'refX', 'refY', 'rendering-intent', 'repeatCount',
    'repeatDur', 'requiredExtensions', 'requiredFeatures', 'restart', 'result',
    'rotate', 'rx', 'ry', 'scale', 'seed', 'shape-rendering', 'slope', 'spacing',
    'specularConstant', 'specularExponent', 'spreadMethod', 'startOffset',
    'stdDeviation', 'stemh', 'stemv', 'stitchTiles', 'stop-color', 'stop-opacity',
    'strikethrough-position', 'strikethrough-thickness', 'string', 'stroke',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'style', 'surfaceScale',
    'systemLanguage', 'tableValues', 'target', 'targetX', 'targetY', 'text-anchor',
    'text-decoration', 'text-rendering', 'textLength', 'title', 'to', 'transform',
    'type', 'u1', 'u2', 'underline-position', 'underline-thickness', 'unicode',
    'unicode-bidi', 'unicode-range', 'units-per-em', 'v-alphabetic', 'v-hanging',
    'v-ideographic', 'v-mathematical', 'values', 'version', 'vert-adv-y',
    'vert-origin-x', 'vert-origin-y', 'viewBox', 'viewTarget', 'visibility',
    'width', 'widths', 'word-spacing', 'writing-mode', 'x', 'x-height', 'x1', 'x2',
    'xChannelSelector', 'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
    'xlink:show', 'xlink:title', 'xlink:type', 'xml:base', 'xml:id', 'xml:lang', 'xml:space',
    'xmlns', 'xmlns:xlink', 'y', 'y1', 'y2', 'yChannelSelector', 'z', 'zoomAndPan',
    // CSS properties valid on SVG elements
    'line-height', 'marker'
  ]);
  const SVG11_ATTRIBUTES_LOWER = new Set([...SVG11_ATTRIBUTES].map(a => a.toLowerCase()));

  const findClosestAttribute = (name) => {
    const lower = name.toLowerCase();
    let closest = null;
    let minDist = Infinity;
    for (const attr of SVG11_ATTRIBUTES) {
      const dist = levenshteinDistance(lower, attr.toLowerCase());
      if (dist < minDist && dist <= 2) {
        minDist = dist;
        closest = attr;
      }
    }
    return closest;
  };

  const detectMistypedAttributes = (el, insideNonSvgContext = false) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    // Track if we're inside a non-SVG context where other XML/HTML content is valid:
    // - foreignObject (HTML content is explicitly allowed by SVG spec)
    // - Namespaced elements (e.g., d:testDescription, metadata content)
    const isNamespacedElement = el.tagName.includes(':');
    const inNonSvgContext = insideNonSvgContext || tagName === 'foreignobject' || isNamespacedElement;

    // Skip attribute validation entirely if we're in non-SVG context
    if (!inNonSvgContext) {
      for (const attrName of el.getAttributeNames()) {
        // Skip data-* and aria-* (HTML5 custom/accessibility attributes)
        if (attrName.startsWith('data-') || attrName.startsWith('aria-')) continue;
        // Skip ALL namespace declarations (xmlns, xmlns:*) - these are valid XML
        if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) continue;
        // Skip custom namespaced attributes (inkscape:*, sodipodi:*, etc.) EXCEPT xlink: and xml: which are SVG standard
        if (attrName.includes(':') && !attrName.startsWith('xlink:') && !attrName.startsWith('xml:')) continue;

        // Skip SVG 2.0 attributes - they're valid, just not in SVG 1.1
        if (isSvg2Attribute(attrName)) continue;

        if (!SVG11_ATTRIBUTES.has(attrName) && !SVG11_ATTRIBUTES_LOWER.has(attrName.toLowerCase())) {
          const suggestion = findClosestAttribute(attrName);
          if (suggestion) {
            issues.push(createIssue({
              type: 'mistyped_attribute_detected',
              element: tagName,
              attr: attrName,
              suggestion: suggestion,
              reason: `Unknown attribute '${attrName}' - did you mean '${suggestion}'?`
            }, tagName, attrName, occIdx));
          } else {
            issues.push(createIssue({
              type: 'unknown_attribute_detected',
              element: tagName,
              attr: attrName,
              reason: `Unknown attribute '${attrName}' on <${tagName}> - not in SVG 1.1 spec`
            }, tagName, attrName, occIdx));
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
  const REQUIRED_ATTRIBUTES = {
    'use': ['xlink:href', 'href'],  // One of these is required
    'image': ['xlink:href', 'href'],
    'feImage': ['xlink:href', 'href'],
    'textPath': ['xlink:href', 'href'],
    'animate': ['attributeName'],
    'animateTransform': ['attributeName', 'type'],
    'animateMotion': [],  // path OR mpath child OR values OR from/to
    'animateColor': ['attributeName'],
    'set': ['attributeName'],
    'linearGradient': [],
    'radialGradient': [],
    'stop': ['offset']
  };

  const detectMissingRequiredAttrs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);
    const required = REQUIRED_ATTRIBUTES[tagName];

    if (required && required.length > 0) {
      // For use/image/etc, only one of href or xlink:href is required
      if (required.includes('xlink:href') && required.includes('href')) {
        if (!el.hasAttribute('xlink:href') && !el.hasAttribute('href')) {
          issues.push(createIssue({
            type: 'missing_required_attribute',
            element: tagName,
            attrs: ['href', 'xlink:href'],
            reason: `<${tagName}> requires 'href' or 'xlink:href' attribute`
          }, tagName, null, occIdx));
        }
      } else {
        for (const attr of required) {
          if (!el.hasAttribute(attr)) {
            issues.push(createIssue({
              type: 'missing_required_attribute',
              element: tagName,
              attr: attr,
              reason: `<${tagName}> requires '${attr}' attribute per SVG 1.1 DTD`
            }, tagName, attr, occIdx));
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
    'linearGradient': new Set(['stop', 'animate', 'animateTransform', 'set']),
    'radialGradient': new Set(['stop', 'animate', 'animateTransform', 'set']),
    'stop': new Set(['animate', 'set']),
    'clipPath': new Set(['path', 'text', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'animate', 'animateTransform', 'set', 'desc', 'title']),
    'mask': new Set(['path', 'text', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'g', 'defs', 'image', 'switch', 'a', 'animate', 'animateTransform', 'set', 'desc', 'title'])
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
          if (!childTag.includes(':') && !validChildren.has(childTag)) {
            issues.push(createIssue({
              type: 'invalid_child_element',
              element: tagName,
              child: childTag,
              reason: `<${childTag}> is not a valid child of <${tagName}> per SVG 1.1 DTD`
            }, tagName, null, occIdx));
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
    'spreadMethod': new Set(['pad', 'reflect', 'repeat']),
    'gradientUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'clipPathUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'maskUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'maskContentUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'filterUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'primitiveUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'patternUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'patternContentUnits': new Set(['userSpaceOnUse', 'objectBoundingBox']),
    'markerUnits': new Set(['strokeWidth', 'userSpaceOnUse']),
    'fill-rule': new Set(['nonzero', 'evenodd', 'inherit']),
    'clip-rule': new Set(['nonzero', 'evenodd', 'inherit']),
    'stroke-linecap': new Set(['butt', 'round', 'square', 'inherit']),
    'stroke-linejoin': new Set(['miter', 'round', 'bevel', 'inherit']),
    'text-anchor': new Set(['start', 'middle', 'end', 'inherit']),
    'dominant-baseline': new Set(['auto', 'use-script', 'no-change', 'reset-size', 'ideographic', 'alphabetic', 'hanging', 'mathematical', 'central', 'middle', 'text-after-edge', 'text-before-edge', 'inherit']),
    'alignment-baseline': new Set(['auto', 'baseline', 'before-edge', 'text-before-edge', 'middle', 'central', 'after-edge', 'text-after-edge', 'ideographic', 'alphabetic', 'hanging', 'mathematical', 'inherit']),
    'visibility': new Set(['visible', 'hidden', 'collapse', 'inherit']),
    'display': new Set(['inline', 'block', 'list-item', 'run-in', 'compact', 'marker', 'table', 'inline-table', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-row', 'table-column-group', 'table-column', 'table-cell', 'table-caption', 'none', 'inherit']),
    'overflow': new Set(['visible', 'hidden', 'scroll', 'auto', 'inherit'])
  };

  const detectInvalidEnumValues = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const [attr, validValues] of Object.entries(ENUM_VALUES)) {
      const val = el.getAttribute(attr);
      if (val && !validValues.has(val)) {
        issues.push(createIssue({
          type: 'invalid_enum_value',
          element: tagName,
          attr: attr,
          value: val,
          validValues: [...validValues],
          reason: `Invalid value '${val}' for '${attr}'. Valid values: ${[...validValues].join(', ')}`
        }, tagName, attr, occIdx));
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidEnumValues(child);
    }
  };

  // Check 15: Detect invalid numeric constraints
  const NUMERIC_CONSTRAINTS = {
    'opacity': { min: 0, max: 1, type: 'number' },
    'fill-opacity': { min: 0, max: 1, type: 'number' },
    'stroke-opacity': { min: 0, max: 1, type: 'number' },
    'stop-opacity': { min: 0, max: 1, type: 'number' },
    'flood-opacity': { min: 0, max: 1, type: 'number' },
    'stroke-width': { min: 0, type: 'length' },
    'stroke-miterlimit': { min: 1, type: 'number' },
    'r': { min: 0, type: 'length' },
    'rx': { min: 0, type: 'length' },
    'ry': { min: 0, type: 'length' }
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
            issues.push(createIssue({
              type: 'invalid_numeric_constraint',
              element: tagName,
              attr: attr,
              value: val,
              reason: `Value ${num} is below minimum ${constraint.min}`
            }, tagName, attr, occIdx));
          }
          if (constraint.max !== undefined && num > constraint.max) {
            issues.push(createIssue({
              type: 'invalid_numeric_constraint',
              element: tagName,
              attr: attr,
              value: val,
              reason: `Value ${num} is above maximum ${constraint.max}`
            }, tagName, attr, occIdx));
          }
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectInvalidNumericConstraints(child);
    }
  };

  // Check 16: Detect duplicate IDs
  const detectDuplicateIds = (doc) => {
    const idMap = new Map();
    const idElements = new Map(); // Track first element with each ID
    const collectAllIds = (el) => {
      const tagName = el.tagName.toLowerCase();
      const occIdx = getOccurrenceIndex(tagName);
      const id = el.getAttribute('id');
      if (id) {
        if (!idMap.has(id)) {
          idMap.set(id, []);
          idElements.set(id, { tagName, occIdx }); // Store first occurrence
        }
        idMap.get(id).push(tagName);
      }
      for (const child of el.children) {
        if (isElement(child)) collectAllIds(child);
      }
    };
    collectAllIds(doc);

    for (const [id, elements] of idMap) {
      if (elements.length > 1) {
        const firstEl = idElements.get(id);
        issues.push(createIssue({
          type: 'duplicate_id',
          id: id,
          elements: elements,
          count: elements.length,
          reason: `ID '${id}' is used ${elements.length} times (on ${elements.join(', ')})`
        }, firstEl.tagName, 'id', firstEl.occIdx));
      }
    }
  };

  // Check 17: Detect broken URL references
  // CRITICAL: This list must include ALL attributes that can contain url(#id) references
  const URL_REF_PATTERN = /url\(#([^)]+)\)/g;
  const URL_REF_ATTRS = [
    'fill', 'stroke', 'clip-path', 'mask', 'filter', 'color-profile',
    'marker',         // Shorthand for marker-start/mid/end - can contain url(#id)
    'marker-start', 'marker-mid', 'marker-end'
  ];

  const detectBrokenUrlRefs = (el) => {
    const tagName = el.tagName.toLowerCase();
    const occIdx = getOccurrenceIndex(tagName);

    for (const attr of URL_REF_ATTRS) {
      const val = el.getAttribute(attr);
      if (val) {
        let match;
        const regex = new RegExp(URL_REF_PATTERN);
        while ((match = regex.exec(val)) !== null) {
          const refId = match[1];
          if (!allIds.has(refId)) {
            issues.push(createIssue({
              type: 'broken_url_reference',
              element: tagName,
              attr: attr,
              referencedId: refId,
              reason: `url(#${refId}) references non-existent ID`
            }, tagName, attr, occIdx));
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
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
    'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
    'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
    'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
    'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
    'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
    'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
    'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
    'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
    'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
    'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
    'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
    'plum', 'powderblue', 'purple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
    'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
    'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
    'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
    'currentcolor', 'inherit', 'none', 'transparent'
  ]);
  // All SVG attributes that can contain color values - MUST match other COLOR_ATTRS definition
  const COLOR_ATTRS = ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color', 'solid-color'];

  const isValidColor = (val) => {
    const lower = val.toLowerCase().trim();
    // Named colors and special keywords
    if (SVG_NAMED_COLORS.has(lower)) return true;
    // Hex formats: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    if (/^#[0-9a-f]{3}$/i.test(lower)) return true;
    if (/^#[0-9a-f]{4}$/i.test(lower)) return true;  // #RGBA
    if (/^#[0-9a-f]{6}$/i.test(lower)) return true;
    if (/^#[0-9a-f]{8}$/i.test(lower)) return true;  // #RRGGBBAA
    // rgb() and rgba() with integer or percentage values
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(lower)) return true;
    if (/^rgba?\(\s*\d+%\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+%?\s*)?\)$/i.test(lower)) return true;
    // hsl() and hsla() formats
    if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+\s*)?\)$/i.test(lower)) return true;
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
        issues.push(createIssue({
          type: 'invalid_color',
          element: tagName,
          attr: attr,
          value: val,
          reason: `Invalid color value '${val}'`
        }, tagName, attr, occIdx));
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
    const viewBox = el.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/);
      if (parts.length !== 4 || !parts.every(p => !isNaN(parseFloat(p)))) {
        issues.push(createIssue({
          type: 'malformed_viewbox',
          element: tagName,
          value: viewBox,
          reason: `viewBox must be exactly 4 numbers (min-x, min-y, width, height)`
        }, tagName, 'viewBox', occIdx));
      }
    }

    // points must be pairs of numbers
    const points = el.getAttribute('points');
    if (points) {
      const nums = points.trim().split(/[\s,]+/).filter(p => p);
      if (nums.length % 2 !== 0 || !nums.every(n => !isNaN(parseFloat(n)))) {
        issues.push(createIssue({
          type: 'malformed_points',
          element: tagName,
          value: points.length > 50 ? points.substring(0, 50) + '...' : points,
          reason: `points must be pairs of numbers`
        }, tagName, 'points', occIdx));
      }
    }

    // transform basic syntax check
    const transform = el.getAttribute('transform');
    if (transform) {
      const validTransforms = /^[\s]*(matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)[\s,]*/;
      let remaining = transform.trim();
      while (remaining.length > 0) {
        const match = remaining.match(validTransforms);
        if (match) {
          remaining = remaining.substring(match[0].length);
        } else {
          issues.push(createIssue({
            type: 'malformed_transform',
            element: tagName,
            value: transform.length > 50 ? transform.substring(0, 50) + '...' : transform,
            reason: `Invalid transform syntax near '${remaining.substring(0, 20)}'`
          }, tagName, 'transform', occIdx));
          break;
        }
      }
    }

    for (const child of el.children) {
      if (isElement(child)) detectMalformedFormats(child);
    }
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

  // Sort issues by line, then by column (for consistent, predictable output)
  issues.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  // Filter by severity if errorsOnly is set
  let filteredIssues = issues;
  if (errorsOnly) {
    filteredIssues = issues.filter(issue => issue.severity === ValidationSeverity.ERROR);
  }

  // Calculate counts
  const errorCount = issues.filter(i => i.severity === ValidationSeverity.ERROR).length;
  const warningCount = issues.filter(i => i.severity === ValidationSeverity.WARNING).length;

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
    summary
  };

  // Export to file if requested
  if (outputFile) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      let content;
      switch (outputFormat) {
        case 'json':
          content = JSON.stringify(result, null, 2);
          break;

        case 'yaml':
          // Simple YAML serialization (no external dependency)
          content = formatAsYaml(result);
          break;

        case 'xml':
          content = formatAsXml(result);
          break;

        case 'text':
        default:
          content = formatAsText(result);
          break;
      }

      const normalizedPath = path.normalize(outputFile);
      await fs.writeFile(normalizedPath, content, 'utf8');
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
 */
function formatAsText(result) {
  const lines = [
    '='.repeat(60),
    'SVG VALIDATION REPORT',
    '='.repeat(60),
    '',
    `Status: ${result.isValid ? 'VALID' : 'INVALID'}`,
    `Errors: ${result.errorCount}`,
    `Warnings: ${result.warningCount}`,
    `Total Issues: ${result.issueCount}`,
    '',
  ];

  if (result.issues.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('ISSUES:');
    lines.push('-'.repeat(60));
    lines.push('');

    for (const issue of result.issues) {
      const severity = issue.severity.toUpperCase();
      const location = `${issue.line}:${issue.column}`;
      lines.push(`[${severity}] Line ${location}: ${issue.type}`);
      if (issue.element) lines.push(`  Element: <${issue.element}>`);
      if (issue.attr) lines.push(`  Attribute: ${issue.attr}`);
      if (issue.value) lines.push(`  Value: ${issue.value}`);
      lines.push(`  ${issue.reason}`);
      if (issue.sourceLine) lines.push(`  Source: ${issue.sourceLine.trim()}`);
      lines.push('');
    }
  }

  lines.push('='.repeat(60));
  lines.push('SUMMARY BY TYPE:');
  lines.push('-'.repeat(60));
  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`  ${type}: ${count}`);
  }
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Format validation result as YAML (simple implementation, no external deps)
 * @private
 */
function formatAsYaml(result) {
  const lines = [
    'validation_result:',
    `  is_valid: ${result.isValid}`,
    `  has_errors: ${result.hasErrors}`,
    `  has_warnings: ${result.hasWarnings}`,
    `  error_count: ${result.errorCount}`,
    `  warning_count: ${result.warningCount}`,
    `  issue_count: ${result.issueCount}`,
    '',
    '  summary:',
  ];

  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`    ${type}: ${count}`);
  }

  lines.push('');
  lines.push('  issues:');

  for (const issue of result.issues) {
    lines.push(`    - type: ${issue.type}`);
    lines.push(`      severity: ${issue.severity}`);
    lines.push(`      line: ${issue.line}`);
    lines.push(`      column: ${issue.column}`);
    if (issue.element) lines.push(`      element: "${issue.element}"`);
    if (issue.attr) lines.push(`      attr: "${issue.attr}"`);
    if (issue.value) lines.push(`      value: "${String(issue.value).replace(/"/g, '\\"')}"`);
    lines.push(`      reason: "${issue.reason.replace(/"/g, '\\"')}"`);
    if (issue.sourceLine) lines.push(`      source_line: "${issue.sourceLine.replace(/"/g, '\\"')}"`);
  }

  return lines.join('\n');
}

/**
 * Format validation result as XML
 * @private
 */
function formatAsXml(result) {
  const escapeXml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<validation_result>',
    `  <is_valid>${result.isValid}</is_valid>`,
    `  <has_errors>${result.hasErrors}</has_errors>`,
    `  <has_warnings>${result.hasWarnings}</has_warnings>`,
    `  <error_count>${result.errorCount}</error_count>`,
    `  <warning_count>${result.warningCount}</warning_count>`,
    `  <issue_count>${result.issueCount}</issue_count>`,
    '  <summary>',
  ];

  for (const [type, count] of Object.entries(result.summary)) {
    lines.push(`    <${type}>${count}</${type}>`);
  }

  lines.push('  </summary>');
  lines.push('  <issues>');

  for (const issue of result.issues) {
    lines.push('    <issue>');
    lines.push(`      <type>${escapeXml(issue.type)}</type>`);
    lines.push(`      <severity>${escapeXml(issue.severity)}</severity>`);
    lines.push(`      <line>${issue.line}</line>`);
    lines.push(`      <column>${issue.column}</column>`);
    if (issue.element) lines.push(`      <element>${escapeXml(issue.element)}</element>`);
    if (issue.attr) lines.push(`      <attr>${escapeXml(issue.attr)}</attr>`);
    if (issue.value) lines.push(`      <value>${escapeXml(issue.value)}</value>`);
    lines.push(`      <reason>${escapeXml(issue.reason)}</reason>`);
    if (issue.sourceLine) lines.push(`      <source_line>${escapeXml(issue.sourceLine)}</source_line>`);
    lines.push('    </issue>');
  }

  lines.push('  </issues>');
  lines.push('</validation_result>');

  return lines.join('\n');
}

/**
 * Count total elements in document
 * @private
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
 * Complete flattening pipeline
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
 * Bezier curve simplification
 */
export const simplifyPath = createOperation((doc, options = {}) => {
  const tolerance = options.tolerance || 0.01;
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
      // Skip invalid paths
    }
  }

  return doc;
});

/**
 * Optimize animation timing attributes (keySplines, keyTimes, values)
 *
 * Options:
 * - precision: Max decimal places (default: 3)
 * - removeLinearSplines: Convert calcMode="spline" with linear keySplines to calcMode="linear" (default: true)
 * - optimizeValues: Optimize numeric values in animation values attribute (default: true)
 *
 * Example:
 *   keySplines="0.400 0.000 0.200 1.000" -> keySplines=".4 0 .2 1"
 *   calcMode="spline" keySplines="0 0 1 1" -> calcMode="linear" (keySplines removed)
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
  const result = optimizeDocumentPaths(doc, {
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
  const algorithm = options.algorithm ?? 'douglas-peucker';
  const respectStroke = options.respectStroke !== false;

  // Build defs map for resolving inherited properties
  const defsMap = buildDefsMap(doc);

  let pathsSimplified = 0;
  let totalPointsRemoved = 0;

  const processElement = (el) => {
    const tagName = el.tagName?.toLowerCase();

    if (tagName === 'path') {
      const d = el.getAttribute('d');
      if (d) {
        // Calculate effective tolerance based on stroke-width
        let effectiveTolerance = baseTolerance;

        if (respectStroke) {
          const inherited = getInheritedProperties(el);
          const ctx = createRenderingContext(el, inherited, defsMap);

          if (ctx.hasStroke) {
            // Reduce tolerance for stroked paths to avoid visible artifacts
            // Errors in path geometry are amplified in the stroke outline
            const strokeBasedTolerance = ctx.strokeWidth.div(4).toNumber();
            effectiveTolerance = Math.min(baseTolerance, strokeBasedTolerance);
          }
        }

        const commands = parsePathCommands(d);
        const result = simplifyPolylinePath(commands, effectiveTolerance, algorithm);
        if (result.simplified) {
          const newD = serializePathCommands(result.commands, options.precision ?? 3);
          el.setAttribute('d', newD);
          pathsSimplified++;
          totalPointsRemoved += result.originalPoints - result.simplifiedPoints;
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
export const decomposeTransform = createOperation((doc, options = {}) => {
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
      if (hasUnits(xAttr) || hasUnits(yAttr) || hasUnits(wAttr) || hasUnits(hAttr)) {
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
    return null;
  }
}

// ============================================================================
// EMBED EXTERNAL DEPENDENCIES
// ============================================================================

// MIME type map for resource embedding
const EMBED_MIME_TYPES = {
  // Images
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  // Fonts
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  // Audio
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  // Other
  '.css': 'text/css', '.js': 'text/javascript'
};

// Check if running in Node.js environment
function isNodeEnvironment() {
  return typeof process !== 'undefined' && process.versions?.node;
}

// Check if href is external (not #id or data:)
function isExternalHref(href) {
  if (!href || typeof href !== 'string') return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('data:')) return false;
  return true;
}

// Parse external SVG reference like "icons.svg#arrow" into {path, fragment}
function parseExternalSVGRef(href) {
  const hashIdx = href.indexOf('#');
  if (hashIdx === -1) return { path: href, fragment: null };
  return {
    path: href.substring(0, hashIdx),
    fragment: href.substring(hashIdx + 1)
  };
}

// Detect MIME type from file extension
function detectMimeType(urlOrPath) {
  const ext = (urlOrPath.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  return EMBED_MIME_TYPES[ext] || 'application/octet-stream';
}

// Resolve relative URL against base path
function resolveURL(url, basePath) {
  if (!url) return url;
  // Already absolute URL
  if (url.match(/^https?:\/\//i)) return url;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('file://')) return url;

  // Handle base path
  if (!basePath) return url;

  // If basePath is a URL
  if (basePath.match(/^https?:\/\//i)) {
    try {
      return new URL(url, basePath).href;
    } catch (e) {
      return url;
    }
  }

  // File path resolution (Node.js)
  if (isNodeEnvironment()) {
    // Use require for synchronous path operations
    try {
      // Use dynamic require if available
      const pathModule = require('node:path');
      const baseDir = basePath.endsWith('/') ? basePath : pathModule.dirname(basePath);
      return pathModule.resolve(baseDir, url);
    } catch (e) {
      // Fallback to simple join
      const baseDir = basePath.endsWith('/') ? basePath : basePath.substring(0, basePath.lastIndexOf('/') + 1);
      return baseDir + url;
    }
  }

  // Simple path join for browser
  const baseDir = basePath.endsWith('/') ? basePath : basePath.substring(0, basePath.lastIndexOf('/') + 1);
  return baseDir + url;
}

// Fetch resource content (works in Node.js and browser)
async function fetchResource(url, mode = 'text', timeout = 30000) {
  // Handle local files in Node.js
  if (isNodeEnvironment() && !url.match(/^https?:\/\//i)) {
    const fs = await import('node:fs/promises');
    const content = mode === 'binary'
      ? await fs.readFile(url)
      : await fs.readFile(url, 'utf8');
    return { content, contentType: detectMimeType(url) };
  }

  // Use fetch API for URLs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || detectMimeType(url);
    const content = mode === 'binary'
      ? await response.arrayBuffer()
      : await response.text();

    return { content, contentType };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Convert binary content to base64 data URI
function toDataURI(content, mimeType) {
  let base64;
  if (isNodeEnvironment()) {
    // Node.js: Buffer
    base64 = Buffer.from(content).toString('base64');
  } else {
    // Browser: Uint8Array
    const bytes = new Uint8Array(content);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return `data:${mimeType};base64,${base64}`;
}

// Parse CSS to find @import and url() references
function parseCSSUrls(css) {
  const imports = [];
  const urls = [];

  // Find @import url(...) or @import "..."
  const importRegex = /@import\s+(?:url\(\s*["']?([^"')]+)["']?\s*\)|["']([^"']+)["'])/gi;
  let match;
  while ((match = importRegex.exec(css)) !== null) {
    imports.push({
      url: match[1] || match[2],
      fullMatch: match[0],
      index: match.index
    });
  }

  // Find url(...) in properties (not @import)
  const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((match = urlRegex.exec(css)) !== null) {
    // Skip if this is part of an @import
    const beforeMatch = css.substring(Math.max(0, match.index - 10), match.index);
    if (beforeMatch.includes('@import')) continue;
    // Skip local ID references
    if (match[1].startsWith('#')) continue;
    // Skip data URIs
    if (match[1].startsWith('data:')) continue;

    urls.push({
      url: match[1],
      fullMatch: match[0],
      index: match.index
    });
  }

  return { imports, urls };
}

// Relocate all IDs in element tree with prefix to avoid collisions
function relocateIds(element, prefix, idMap = new Map()) {
  if (!element) return idMap;

  // Update id attribute
  const id = element.getAttribute?.('id');
  if (id) {
    const newId = prefix + id;
    idMap.set(id, newId);
    element.setAttribute('id', newId);
  }

  // Update references in attributes
  const refAttrs = ['href', 'xlink:href', 'fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end'];
  for (const attr of refAttrs) {
    const val = element.getAttribute?.(attr);
    if (!val) continue;

    // Handle url(#id) references
    if (val.includes('url(#')) {
      const newVal = val.replace(/url\(#([^)]+)\)/g, (match, refId) => {
        return `url(#${idMap.get(refId) || prefix + refId})`;
      });
      element.setAttribute(attr, newVal);
    }
    // Handle #id references
    else if (val.startsWith('#')) {
      const refId = val.substring(1);
      element.setAttribute(attr, '#' + (idMap.get(refId) || prefix + refId));
    }
  }

  // Update style attribute url() references
  const style = element.getAttribute?.('style');
  if (style && style.includes('url(#')) {
    const newStyle = style.replace(/url\(#([^)]+)\)/g, (match, refId) => {
      return `url(#${idMap.get(refId) || prefix + refId})`;
    });
    element.setAttribute('style', newStyle);
  }

  // Recurse into children
  if (element.children) {
    for (const child of element.children) {
      relocateIds(child, prefix, idMap);
    }
  }

  return idMap;
}

// Set script/style content as a proper CDATA section node
// Using createCDATASection if available, otherwise use marker for post-processing
function setCDATAContent(element, content, doc) {
  // Escape any existing ]]> sequences within the content
  const escaped = content.replace(/\]\]>/g, ']]]]><![CDATA[>');

  // Clear existing content
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }

  const needsCDATA = content.includes('<') || content.includes('&') || content.includes(']]>');

  if (needsCDATA && typeof doc.createCDATASection === 'function') {
    // Browser/full DOM environment - use native CDATA section
    const cdataNode = doc.createCDATASection(escaped);
    element.appendChild(cdataNode);
  } else if (needsCDATA) {
    // linkedom/Node.js environment - mark element for post-processing
    // Use a unique marker that won't appear in normal content
    element.setAttribute('data-cdata-pending', 'true');
    element.textContent = escaped;
  } else {
    // Plain text doesn't need CDATA wrapping
    element.textContent = content;
  }
}

// Common file extensions for resource detection
const RESOURCE_EXTENSIONS = {
  // Audio
  audio: ['.wav', '.mp3', '.ogg', '.webm', '.m4a', '.aac', '.flac'],
  // Images (additional formats beyond what we already handle)
  image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp'],
  // Video
  video: ['.mp4', '.webm', '.ogv', '.avi', '.mov'],
  // Data/Config
  data: ['.json', '.xml', '.txt', '.csv', '.tsv'],
  // Fonts (for completeness)
  font: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
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
  const extPattern = ALL_RESOURCE_EXTENSIONS.map(e => e.replace('.', '\\.')).join('|');

  // Match quoted strings containing paths with known extensions
  // Handles: "./path/file.wav", './path/file.mp3', `path/file.json`
  const stringPattern = new RegExp(
    `["'\`]([^"'\`]*(?:${extPattern}))["'\`]`,
    'gi'
  );

  let match;
  while ((match = stringPattern.exec(content)) !== null) {
    const path = match[1];
    // Skip data URIs, absolute URLs to external domains, and empty strings
    if (path &&
        !path.startsWith('data:') &&
        !path.match(/^https?:\/\/(?!localhost)/) &&
        path.length > 0) {
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
  if (resourceMap.size === 0) return '';

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
    // Try without leading ./
    for (var key in __EMBEDDED_RESOURCES__) {
      if (key.endsWith(normalized) || normalized.endsWith(key.replace(/^\\.?\\//, ''))) {
        return key;
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
        // Convert data URI to ArrayBuffer for audio/binary
        var base64 = dataUri.split(',')[1];
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
        if (xhr.onreadystatechange) xhr.onreadystatechange.call(xhr);
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
    const normalizedFont = fontFamily.replace(/['"]/g, '').trim().split(',')[0].trim();
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
    const style = el.getAttribute?.('style') || '';
    const fontMatch = style.match(/font-family:\s*([^;]+)/i);
    const fontFromStyle = fontMatch ? fontMatch[1] : null;

    // Get font-family from font-family attribute
    const fontFromAttr = el.getAttribute?.('font-family');

    // Get font-family from CSS face attribute (for foreignObject content)
    const faceAttr = el.getAttribute?.('face');

    const fontFamily = fontFromStyle || fontFromAttr || faceAttr;

    // Get text content from this element (direct text, not children)
    const textContent = el.textContent || '';
    if (fontFamily && textContent.trim()) {
      addCharsToFont(fontFamily, textContent);
    }

    // Also check for text in <text> and <tspan> elements
    if (el.tagName === 'text' || el.tagName === 'tspan') {
      // Try to get inherited font from ancestors
      let inheritedFont = fontFamily;
      if (!inheritedFont && el.parentNode) {
        const parentStyle = el.parentNode.getAttribute?.('style') || '';
        const parentFontMatch = parentStyle.match(/font-family:\s*([^;]+)/i);
        inheritedFont = parentFontMatch ? parentFontMatch[1] : el.parentNode.getAttribute?.('font-family');
      }
      if (inheritedFont && textContent.trim()) {
        addCharsToFont(inheritedFont, textContent);
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
  const uniqueChars = [...charSet].sort().join('');
  return encodeURIComponent(uniqueChars);
}

/**
 * Check if URL is a Google Fonts URL.
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isGoogleFontsUrl(url) {
  return url && (
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
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
    const family = urlObj.searchParams.get('family');
    if (family) {
      // Handle "Fira+Mono" or "Fira Mono:400,700"
      return family.split(':')[0].replace(/\+/g, ' ');
    }
  } catch (e) {
    // Try regex fallback
    const match = url.match(/family=([^&:]+)/);
    if (match) {
      return match[1].replace(/\+/g, ' ');
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
    urlObj.searchParams.set('text', decodeURIComponent(textParam));
    return urlObj.toString();
  } catch (e) {
    // Fallback: append to URL string
    const separator = url.includes('?') ? '&' : '?';
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
export const embedExternalDependencies = createOperation(async (doc, options = {}) => {
  const {
    basePath = '',
    embedImages = true,
    embedExternalSVGs = true,
    externalSVGMode = 'extract',
    embedCSS = true,
    embedFonts = true,
    embedScripts = true,
    embedAudio = false,
    subsetFonts = true,
    verbose = false,
    recursive = true,
    maxRecursionDepth = 10,
    timeout = 30000,
    onMissingResource = 'warn',
    onProgress = null,
    idPrefix = 'ext_'
  } = options;

  const visitedURLs = new Set();
  const warnings = [];
  let extCounter = 0;

  // Helper to handle missing resources
  const handleMissingResource = (url, error) => {
    const msg = `Failed to fetch resource: ${url} - ${error.message}`;
    if (onMissingResource === 'fail') {
      throw new Error(msg);
    } else if (onMissingResource === 'warn') {
      warnings.push(msg);
      console.warn('embedExternalDependencies:', msg);
    }
    // 'skip' mode: silently continue
    return null;
  };

  // Phase 1: Embed Images
  if (embedImages) {
    const images = doc.getElementsByTagName('image');
    const imageArray = [...images];
    if (onProgress) onProgress('images', 0, imageArray.length);

    for (let i = 0; i < imageArray.length; i++) {
      const img = imageArray[i];
      const href = img.getAttribute('href') || img.getAttribute('xlink:href');

      if (!href || !isExternalHref(href)) continue;

      try {
        const resolvedURL = resolveURL(href, basePath);
        const { content, contentType } = await fetchResource(resolvedURL, 'binary', timeout);
        const dataURI = toDataURI(content, contentType.split(';')[0]);

        // Update both href and xlink:href for compatibility
        if (img.getAttribute('href')) img.setAttribute('href', dataURI);
        if (img.getAttribute('xlink:href')) img.setAttribute('xlink:href', dataURI);
      } catch (e) {
        handleMissingResource(href, e);
      }

      if (onProgress) onProgress('images', i + 1, imageArray.length);
    }
  }

  // Phase 2: Embed External SVG References
  if (embedExternalSVGs) {
    const useElements = doc.getElementsByTagName('use');
    const useArray = [...useElements];
    if (onProgress) onProgress('externalSVGs', 0, useArray.length);

    // Ensure defs element exists
    let defs = doc.querySelector('defs');
    if (!defs) {
      defs = new SVGElement('defs', {}, []);
      const svg = doc.documentElement || doc;
      if (svg.children) {
        svg.children.unshift(defs);
      }
    }

    for (let i = 0; i < useArray.length; i++) {
      const useEl = useArray[i];
      const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');

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
        const { content } = await fetchResource(resolvedPath, 'text', timeout);
        const externalDoc = parseSVG(content);

        if (!externalDoc) {
          handleMissingResource(path, new Error('Failed to parse SVG'));
          continue;
        }

        // Recursively process external SVG if enabled
        if (recursive && maxRecursionDepth > 0) {
          await embedExternalDependencies(externalDoc, {
            ...options,
            basePath: resolvedPath,
            maxRecursionDepth: maxRecursionDepth - 1
          });
        }

        extCounter++;
        const uniquePrefix = `${idPrefix}${extCounter}_`;

        if (externalSVGMode === 'extract' && fragment) {
          // Extract just the referenced element
          const targetEl = externalDoc.getElementById(fragment);
          if (targetEl) {
            // Clone and relocate IDs
            const cloned = targetEl.clone ? targetEl.clone() : JSON.parse(JSON.stringify(targetEl));
            relocateIds(cloned, uniquePrefix);

            // Add to defs
            defs.children.push(cloned);

            // Update use href to local reference
            const newId = uniquePrefix + fragment;
            if (useEl.getAttribute('href')) useEl.setAttribute('href', '#' + newId);
            if (useEl.getAttribute('xlink:href')) useEl.setAttribute('xlink:href', '#' + newId);
          } else {
            handleMissingResource(href, new Error(`Fragment #${fragment} not found in ${path}`));
          }
        } else {
          // Embed entire external SVG
          const externalSvg = externalDoc.documentElement || externalDoc;
          relocateIds(externalSvg, uniquePrefix);

          // Set an ID on the external SVG
          const svgId = uniquePrefix + 'svg';
          externalSvg.setAttribute('id', svgId);

          // Add to defs
          defs.children.push(externalSvg);

          // Update use href
          const newHref = fragment ? '#' + uniquePrefix + fragment : '#' + svgId;
          if (useEl.getAttribute('href')) useEl.setAttribute('href', newHref);
          if (useEl.getAttribute('xlink:href')) useEl.setAttribute('xlink:href', newHref);
        }
      } catch (e) {
        handleMissingResource(path, e);
      }

      if (onProgress) onProgress('externalSVGs', i + 1, useArray.length);
    }
  }

  // Phase 3: Embed CSS (including @import and url() in stylesheets)
  if (embedCSS || embedFonts) {
    const styleElements = doc.getElementsByTagName('style');
    const styleArray = [...styleElements];
    if (onProgress) onProgress('stylesheets', 0, styleArray.length);

    // Build font character map for subsetting (if subsetFonts option is enabled)
    const fontCharMap = subsetFonts ? extractFontCharacterMap(doc) : null;

    for (let i = 0; i < styleArray.length; i++) {
      const styleEl = styleArray[i];
      let css = styleEl.textContent || '';

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
                const textParam = charsToTextParam(fontCharMap.get(fontFamily));
                importUrl = addTextParamToGoogleFontsUrl(importUrl, textParam);
                if (verbose) {
                  console.log(`Font subsetting: ${fontFamily} -> ${fontCharMap.get(fontFamily).size} chars`);
                }
              }
            }

            const resolvedURL = resolveURL(importUrl, basePath);
            const { content } = await fetchResource(resolvedURL, 'text', timeout);
            // Replace @import with inline content
            css = css.substring(0, imp.index) + content + css.substring(imp.index + imp.fullMatch.length);
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
          const isFont = mimeType.startsWith('font/') || mimeType.includes('fontobject');

          // Skip fonts if embedFonts is false
          if (isFont && !embedFonts) continue;
          // Skip non-fonts if embedCSS is false (images in CSS)
          if (!isFont && !embedCSS) continue;

          try {
            const resolvedURL = resolveURL(urlRef.url, basePath);
            const { content, contentType } = await fetchResource(resolvedURL, 'binary', timeout);
            const dataURI = toDataURI(content, contentType.split(';')[0]);

            // Replace url() with data URI
            const newUrl = `url("${dataURI}")`;
            css = css.substring(0, urlRef.index) + newUrl + css.substring(urlRef.index + urlRef.fullMatch.length);
          } catch (e) {
            handleMissingResource(urlRef.url, e);
          }
        }
      }

      styleEl.textContent = css;
      if (onProgress) onProgress('stylesheets', i + 1, styleArray.length);
    }
  }

  // Phase 4: Embed Scripts
  if (embedScripts) {
    const scripts = doc.getElementsByTagName('script');
    const scriptArray = [...scripts];
    if (onProgress) onProgress('scripts', 0, scriptArray.length);

    for (let i = 0; i < scriptArray.length; i++) {
      const scriptEl = scriptArray[i];
      // Check for src, href, or xlink:href attributes (SVG uses xlink:href for scripts)
      const src = scriptEl.getAttribute('src') ||
                  scriptEl.getAttribute('href') ||
                  scriptEl.getAttribute('xlink:href');

      if (!src) continue; // Already inline
      if (src.startsWith('data:')) continue; // Already embedded

      try {
        const resolvedURL = resolveURL(src, basePath);
        const { content } = await fetchResource(resolvedURL, 'text', timeout);

        // Remove all source attributes
        scriptEl.removeAttribute('src');
        scriptEl.removeAttribute('href');
        scriptEl.removeAttribute('xlink:href');

        // Set inline content with proper CDATA section node
        setCDATAContent(scriptEl, content, doc);
      } catch (e) {
        handleMissingResource(src, e);
      }

      if (onProgress) onProgress('scripts', i + 1, scriptArray.length);
    }
  }

  // Phase 5: Embed resources referenced in JavaScript/HTML/CSS
  // This catches audio files, JSON data, etc. that are loaded dynamically
  if (embedScripts) {
    // Collect all text content that might contain file references
    const allTextContent = [];

    // Scan all script elements
    const allScripts = doc.getElementsByTagName('script');
    for (const script of allScripts) {
      if (script.textContent) {
        allTextContent.push(script.textContent);
      }
    }

    // Scan all style elements
    const allStyles = doc.getElementsByTagName('style');
    for (const style of allStyles) {
      if (style.textContent) {
        allTextContent.push(style.textContent);
      }
    }

    // Scan foreignObject content (HTML embedded in SVG)
    const foreignObjects = doc.getElementsByTagName('foreignObject');
    for (const fo of foreignObjects) {
      // Get all text content including nested elements
      const foContent = fo.textContent || '';
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
      if (onProgress) onProgress('resources', 0, allRefs.size);

      let i = 0;
      for (const ref of allRefs) {
        try {
          const resolvedURL = resolveURL(ref, basePath);
          const { content, contentType } = await fetchResource(resolvedURL, 'binary', timeout);
          const mimeType = contentType.split(';')[0] || detectMimeType(ref);
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
        if (onProgress) onProgress('resources', i, allRefs.size);
      }

      // If we have embedded resources, inject the interceptor into the first script
      if (resourceMap.size > 0) {
        const interceptorCode = generateResourceInterceptor(resourceMap);
        const firstScript = allScripts[0];

        if (firstScript) {
          // Prepend interceptor to the first script
          const existingContent = firstScript.textContent || '';
          const needsCDATA = interceptorCode.includes('<') || interceptorCode.includes('&') ||
                            existingContent.includes('<') || existingContent.includes('&');

          if (needsCDATA) {
            firstScript.setAttribute('data-cdata-pending', 'true');
          }
          firstScript.textContent = interceptorCode + existingContent;
        } else {
          // No existing script, create a new one
          const newScript = doc.createElement('script');
          newScript.setAttribute('type', 'text/javascript');
          newScript.setAttribute('data-cdata-pending', 'true');
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
          console.log(`Injected resource interceptor for ${resourceMap.size} embedded resources`);
        }
      }
    }
  }

  // Phase 6: Ensure proper namespaces
  const svg = doc.documentElement || doc;
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  // Add xlink namespace if any xlink: attributes exist
  const hasXlink = serializeSVG(doc).includes('xlink:');
  if (hasXlink && !svg.getAttribute('xmlns:xlink')) {
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }

  // Add warnings as metadata if any
  if (warnings.length > 0) {
    doc._embedWarnings = warnings;
  }

  return doc;
});

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
  removeLeadingZero,       // Remove leading zeros: 0.5 -> .5
  negativeExtraSpace,      // Use negative as delimiter: 10 -5 -> 10-5
  convertToRelative,       // Convert all commands to relative form
  convertToAbsolute,       // Convert all commands to absolute form
  lineShorthands,          // Convert L to H/V when applicable
  convertToZ,              // Convert final L to Z when closing path
  straightCurves,          // Convert straight curves to lines
  collapseRepeated,        // Collapse repeated command letters
  floatPrecision,          // Round numbers to precision
  removeUselessCommands,   // Remove zero-length commands
  convertCubicToQuadratic, // Convert C to Q when possible
  convertQuadraticToSmooth,// Convert Q to T when control point is reflection
  convertCubicToSmooth,    // Convert C to S when control point is reflection
  arcShorthands,           // Optimize arc parameters
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
