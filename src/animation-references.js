/**
 * Animation-Aware Reference Tracking for SVG
 *
 * Unlike SVGO (which destroys animations by removing "unused" defs),
 * this module tracks ALL references including:
 *
 * 1. STATIC REFERENCES:
 *    - href="#id", xlink:href="#id"
 *    - url(#id) in fill, stroke, clip-path, mask, filter, marker-*
 *    - CSS url() references in style attributes and <style> blocks
 *
 * 2. SMIL ANIMATION REFERENCES:
 *    - <animate values="#id1;#id2;#id3"> (frame-by-frame animation)
 *    - <animate from="#id1" to="#id2">
 *    - <set to="#id">
 *    - begin="id.click", begin="id.end", begin="id.begin+1s"
 *    - end="id.click", end="id.end"
 *    - <animateMotion><mpath xlink:href="#path"/></animateMotion>
 *
 * 3. CSS ANIMATION REFERENCES:
 *    - @keyframes names referenced by animation-name
 *    - url(#id) in @keyframes rules
 *
 * 4. JAVASCRIPT PATTERN DETECTION (best-effort):
 *    - getElementById('id') patterns
 *    - querySelector('#id') patterns
 *
 * @module animation-references
 */

import { SVGElement } from "./svg-parser.js";

// Animation elements that can reference other elements
const ANIMATION_ELEMENTS = [
  "animate",
  "animateTransform",
  "animateMotion",
  "animateColor",
  "set",
];

// Attributes that can contain ID references
const HREF_ATTRIBUTES = ["href", "xlink:href"];

// Attributes that use url(#id) syntax
const URL_ATTRIBUTES = [
  "fill",
  "stroke",
  "clip-path",
  "mask",
  "filter",
  "marker-start",
  "marker-mid",
  "marker-end",
  "cursor",
  "color-profile",
];

// Animation timing attributes that can reference other elements by ID
const TIMING_ATTRIBUTES = ["begin", "end"];

// Animation value attributes that can contain ID references
const VALUE_ATTRIBUTES = ["values", "from", "to", "by"];

/**
 * Parse ID from url(#id) or url("#id") syntax
 * @param {string} value - Attribute value
 * @returns {string|null} Parsed ID or null
 */
export function parseUrlId(value) {
  if (!value || typeof value !== "string") return null;

  // Match url(#id) or url("#id") or url('#id') with optional whitespace
  const match = value.match(/url\(\s*["']?#([^"')\s]+)\s*["']?\s*\)/);
  return match ? match[1] : null;
}

/**
 * Parse ID from href="#id" or xlink:href="#id" syntax
 * @param {string} value - Attribute value
 * @returns {string|null} Parsed ID or null
 */
export function parseHrefId(value) {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("#")) {
    return value.substring(1);
  }
  return null;
}

/**
 * Parse IDs from animation values attribute (semicolon-separated)
 * Example: values="#FRAME001;#FRAME002;#FRAME003"
 * @param {string} value - Values attribute
 * @returns {string[]} Array of parsed IDs
 */
export function parseAnimationValueIds(value) {
  if (!value || typeof value !== "string") return [];

  const ids = [];
  // Split by semicolon and find #id references
  const parts = value.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("#")) {
      ids.push(trimmed.substring(1));
    }
    // Also check for url(#id) within values
    const urlId = parseUrlId(trimmed);
    if (urlId) ids.push(urlId);
  }
  return ids;
}

/**
 * Parse IDs from timing attributes (begin, end)
 * Examples:
 *   - "button.click" -> "button"
 *   - "anim1.end" -> "anim1"
 *   - "anim1.begin+1s" -> "anim1"
 *   - "click" -> null (no ID reference)
 *   - "3s;button.click" -> "button"
 * @param {string} value - Timing attribute value
 * @returns {string[]} Array of parsed IDs
 */
export function parseTimingIds(value) {
  if (!value || typeof value !== "string") return [];

  const ids = [];
  // Split by semicolon for multiple timing values
  const parts = value.split(";");

  for (const part of parts) {
    const trimmed = part.trim();
    // Match patterns like "id.event" or "id.begin" or "id.end"
    // Events: click, mousedown, mouseup, mouseover, mouseout, focusin, focusout, etc.
    const match = trimmed.match(
      /^([a-zA-Z_][a-zA-Z0-9_-]*)\.(begin|end|click|mousedown|mouseup|mouseover|mouseout|mousemove|mouseenter|mouseleave|focusin|focusout|activate|repeat)/,
    );
    if (match) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Parse IDs from CSS content (style attribute or <style> element)
 * @param {string} css - CSS content
 * @returns {string[]} Array of parsed IDs
 */
export function parseCSSIds(css) {
  if (!css || typeof css !== "string") return [];

  const ids = [];

  // Find url(#id) references
  const urlRegex = /url\(\s*["']?#([^"')]+)["']?\s*\)/g;
  let match;
  while ((match = urlRegex.exec(css)) !== null) {
    ids.push(match[1]);
  }

  return ids;
}

/**
 * Parse IDs from JavaScript content (best-effort)
 * @param {string} js - JavaScript content
 * @returns {string[]} Array of parsed IDs
 */
export function parseJavaScriptIds(js) {
  if (!js || typeof js !== "string") return [];

  const ids = [];

  // getElementById('id') or getElementById("id")
  const getByIdRegex = /getElementById\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = getByIdRegex.exec(js)) !== null) {
    ids.push(match[1]);
  }

  // querySelector('#id') or querySelector("#id")
  const querySelectorRegex =
    /querySelector(?:All)?\(\s*["']#([^"'#\s]+)["']\s*\)/g;
  while ((match = querySelectorRegex.exec(js)) !== null) {
    ids.push(match[1]);
  }

  return ids;
}

/**
 * Collect all references from a single element
 * @param {SVGElement} el - SVG element to scan
 * @returns {{static: Set<string>, animation: Set<string>, css: Set<string>, js: Set<string>}}
 */
export function collectElementReferences(el) {
  // Validate input parameter
  if (!el || typeof el !== "object" || !(el instanceof SVGElement)) {
    throw new TypeError(
      "collectElementReferences: el must be a valid SVGElement",
    );
  }

  // Validate element has required methods
  if (typeof el.getAttributeNames !== "function") {
    throw new TypeError(
      "collectElementReferences: el must have getAttributeNames method",
    );
  }

  const refs = {
    static: new Set(),
    animation: new Set(),
    css: new Set(),
    js: new Set(),
  };

  const tagName = el.tagName?.toLowerCase() || "";
  const isAnimationElement = ANIMATION_ELEMENTS.includes(tagName);

  const attributeNames = el.getAttributeNames();
  if (!Array.isArray(attributeNames)) {
    throw new TypeError(
      "collectElementReferences: getAttributeNames must return an array",
    );
  }

  for (const attrName of attributeNames) {
    const value = el.getAttribute(attrName);
    if (!value) continue;

    // Check href attributes
    if (HREF_ATTRIBUTES.includes(attrName)) {
      const id = parseHrefId(value);
      if (id) {
        if (isAnimationElement) {
          refs.animation.add(id);
        } else {
          refs.static.add(id);
        }
      }
    }

    // Check url() attributes
    if (URL_ATTRIBUTES.includes(attrName) || attrName === "style") {
      const id = parseUrlId(value);
      if (id) refs.static.add(id);

      // For style attribute, also parse CSS IDs
      if (attrName === "style") {
        parseCSSIds(value).forEach((cssId) => refs.css.add(cssId));
      }
    }

    // Check animation timing attributes (begin, end)
    if (TIMING_ATTRIBUTES.includes(attrName)) {
      parseTimingIds(value).forEach((id) => refs.animation.add(id));
    }

    // Check animation value attributes (values, from, to, by)
    if (VALUE_ATTRIBUTES.includes(attrName)) {
      parseAnimationValueIds(value).forEach((id) => refs.animation.add(id));
    }

    // Also check for url() in any attribute (some custom attributes may use it)
    if (!URL_ATTRIBUTES.includes(attrName) && value.includes("url(")) {
      const id = parseUrlId(value);
      if (id) refs.static.add(id);
    }
  }

  // Check <mpath> element inside <animateMotion>
  if (tagName === "animatemotion") {
    if (typeof el.getElementsByTagName !== "function") {
      throw new TypeError(
        "collectElementReferences: el must have getElementsByTagName method",
      );
    }
    const mpaths = el.getElementsByTagName("mpath");
    // Validate mpaths is iterable
    if (!mpaths || typeof mpaths[Symbol.iterator] !== "function") {
      throw new TypeError(
        "collectElementReferences: getElementsByTagName must return an iterable",
      );
    }
    for (const mpath of mpaths) {
      // Validate mpath has getAttribute method
      if (!mpath || typeof mpath.getAttribute !== "function") continue;

      for (const attr of HREF_ATTRIBUTES) {
        const value = mpath.getAttribute(attr);
        const id = parseHrefId(value);
        if (id) refs.animation.add(id);
      }
    }
  }

  return refs;
}

/**
 * Collect all ID references from an SVG document tree
 * This is the main function that ensures we never remove animated elements
 *
 * @param {SVGElement} root - Root SVG element
 * @returns {{
 *   all: Set<string>,
 *   static: Set<string>,
 *   animation: Set<string>,
 *   css: Set<string>,
 *   js: Set<string>,
 *   details: Map<string, {sources: string[], type: string}>
 * }}
 */
export function collectAllReferences(root) {
  // Validate input parameter
  if (!root || typeof root !== "object" || !(root instanceof SVGElement)) {
    throw new TypeError(
      "collectAllReferences: root must be a valid SVGElement",
    );
  }

  const result = {
    all: new Set(),
    static: new Set(),
    animation: new Set(),
    css: new Set(),
    js: new Set(),
    details: new Map(), // ID -> { sources: [], type: 'static'|'animation'|'css'|'js' }
  };

  // Type priority: animation > js > css > static
  // Animation is highest priority because SVGO destroys it
  const TYPE_PRIORITY = { animation: 4, js: 3, css: 2, static: 1 };

  const addRef = (id, type, source) => {
    result.all.add(id);
    result[type].add(id);

    if (!result.details.has(id)) {
      result.details.set(id, { sources: [], type });
    } else {
      // Update type if new type has higher priority
      const existing = result.details.get(id);
      if (TYPE_PRIORITY[type] > TYPE_PRIORITY[existing.type]) {
        existing.type = type;
      }
    }
    result.details.get(id).sources.push(source);
  };

  const processElement = (el, path = "") => {
    const tagName = el.tagName?.toLowerCase() || "";
    const currentPath = path ? `${path}>${tagName}` : tagName;
    const elId = el.getAttribute("id");
    const elPath = elId ? `${tagName}#${elId}` : currentPath;

    // Collect element references
    const refs = collectElementReferences(el);

    refs.static.forEach((id) => addRef(id, "static", elPath));
    refs.animation.forEach((id) => addRef(id, "animation", elPath));
    refs.css.forEach((id) => addRef(id, "css", elPath));
    refs.js.forEach((id) => addRef(id, "js", elPath));

    // Process <style> elements
    if (tagName === "style") {
      const cssContent = el.textContent || "";
      parseCSSIds(cssContent).forEach((id) => addRef(id, "css", `<style>`));
    }

    // Process <script> elements
    if (tagName === "script") {
      const jsContent = el.textContent || "";
      parseJavaScriptIds(jsContent).forEach((id) =>
        addRef(id, "js", `<script>`),
      );
    }

    // Recurse to children
    for (const child of el.children) {
      if (child instanceof SVGElement) {
        processElement(child, currentPath);
      }
    }
  };

  processElement(root);

  return result;
}

/**
 * Check if an ID is referenced anywhere (static, animation, CSS, or JS)
 * @param {SVGElement} root - Root SVG element
 * @param {string} id - ID to check
 * @returns {boolean} True if the ID is referenced
 */
export function isIdReferenced(root, id) {
  // Validate input parameters
  if (!root || typeof root !== "object" || !(root instanceof SVGElement)) {
    throw new TypeError("isIdReferenced: root must be a valid SVGElement");
  }
  if (!id || typeof id !== "string") {
    throw new TypeError("isIdReferenced: id must be a non-empty string");
  }

  const refs = collectAllReferences(root);
  return refs.all.has(id);
}

/**
 * Get detailed reference information for an ID
 * @param {SVGElement} root - Root SVG element
 * @param {string} id - ID to check
 * @returns {{referenced: boolean, type: string|null, sources: string[]}}
 */
export function getIdReferenceInfo(root, id) {
  // Validate input parameters
  if (!root || typeof root !== "object" || !(root instanceof SVGElement)) {
    throw new TypeError("getIdReferenceInfo: root must be a valid SVGElement");
  }
  if (!id || typeof id !== "string") {
    throw new TypeError("getIdReferenceInfo: id must be a non-empty string");
  }

  const refs = collectAllReferences(root);
  const details = refs.details.get(id);

  return {
    referenced: refs.all.has(id),
    type: details?.type || null,
    sources: details?.sources || [],
  };
}

/**
 * Find unreferenced IDs in defs that are SAFE to remove
 * Unlike SVGO, this properly skips animation-referenced elements
 *
 * @param {SVGElement} root - Root SVG element
 * @returns {{safeToRemove: string[], referenced: string[], animationReferenced: string[]}}
 */
export function findUnreferencedDefs(root) {
  // Validate input parameter
  if (!root || typeof root !== "object" || !(root instanceof SVGElement)) {
    throw new TypeError("findUnreferencedDefs: root must be a valid SVGElement");
  }

  const refs = collectAllReferences(root);

  const safeToRemove = [];
  const referenced = [];
  const animationReferenced = [];

  // Scan all defs
  const defsElements = root.getElementsByTagName("defs");
  for (const defs of defsElements) {
    for (const child of defs.children) {
      if (child instanceof SVGElement) {
        const id = child.getAttribute("id");
        if (!id) continue;

        if (refs.animation.has(id)) {
          animationReferenced.push(id);
        } else if (refs.all.has(id)) {
          referenced.push(id);
        } else {
          safeToRemove.push(id);
        }
      }
    }
  }

  return { safeToRemove, referenced, animationReferenced };
}

/**
 * Remove only truly unreferenced defs (animation-safe version)
 * This is the SAFE alternative to SVGO's aggressive removal
 *
 * @param {SVGElement} root - Root SVG element
 * @returns {{removed: string[], kept: string[], keptForAnimation: string[]}}
 */
export function removeUnreferencedDefsSafe(root) {
  // Validate input parameter
  if (!root || typeof root !== "object" || !(root instanceof SVGElement)) {
    throw new TypeError(
      "removeUnreferencedDefsSafe: root must be a valid SVGElement",
    );
  }

  const { safeToRemove, referenced, animationReferenced } =
    findUnreferencedDefs(root);

  const removed = [];

  // Only remove elements that are truly unreferenced
  const defsElements = root.getElementsByTagName("defs");
  for (const defs of defsElements) {
    for (const child of [...defs.children]) {
      if (child instanceof SVGElement) {
        const id = child.getAttribute("id");
        if (id && safeToRemove.includes(id)) {
          defs.removeChild(child);
          removed.push(id);
        }
      }
    }
  }

  return {
    removed,
    kept: referenced,
    keptForAnimation: animationReferenced,
  };
}

// Named exports for all functions
export {
  ANIMATION_ELEMENTS,
  HREF_ATTRIBUTES,
  URL_ATTRIBUTES,
  TIMING_ATTRIBUTES,
  VALUE_ATTRIBUTES,
};
