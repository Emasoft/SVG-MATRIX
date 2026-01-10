/**
 * Inkscape/Sodipodi Support Module
 *
 * Provides utilities for preserving and manipulating Inkscape-specific SVG features
 * including layers, guides, document settings, and arc parameters.
 *
 * @module inkscape-support
 */

import { SVGElement } from "./svg-parser.js";

// Inkscape namespace URIs
export const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
export const SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd";

// Inkscape-specific element and attribute prefixes
export const INKSCAPE_PREFIXES = ["inkscape", "sodipodi"];

/**
 * Check if an element is an Inkscape layer.
 * Inkscape uses `<g inkscape:groupmode="layer">` for layers.
 *
 * @param {Object} element - SVG element to check
 * @returns {boolean} True if the element is an Inkscape layer
 */
export function isInkscapeLayer(element) {
  if (!element || element.tagName !== "g") return false;
  // Safety check: ensure getAttribute method exists before calling it
  if (typeof element.getAttribute !== "function") return false;
  return element.getAttribute("inkscape:groupmode") === "layer";
}

/**
 * Get the label of an Inkscape layer.
 *
 * @param {Object} element - Inkscape layer element
 * @returns {string|null} Layer label or null if not set
 */
export function getLayerLabel(element) {
  if (!element || typeof element.getAttribute !== "function") return null;
  return element.getAttribute("inkscape:label") || null;
}

/**
 * Find all Inkscape layers in a document.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Array<{element: Object, label: string|null, id: string|null}>} Array of layer info objects
 */
export function findLayers(doc) {
  const layers = [];

  const walk = (el) => {
    if (!el || !el.children) return;
    if (isInkscapeLayer(el)) {
      layers.push({
        element: el,
        label: getLayerLabel(el),
        id:
          typeof el.getAttribute === "function" ? el.getAttribute("id") : null,
      });
    }
    // Safety check: ensure children is an array before iteration
    if (Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(doc);
  return layers;
}

/**
 * Get sodipodi:namedview document settings.
 * Contains Inkscape document settings like page color, grid, guides.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Object|null} Named view settings or null if not found
 */
export function getNamedViewSettings(doc) {
  // Validate doc parameter
  if (!doc) return null;

  // Find namedview element - may be direct child or nested
  let namedview = null;

  const findNamedview = (el) => {
    if (!el) return;
    if (el.tagName === "sodipodi:namedview") {
      namedview = el;
      return;
    }
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        findNamedview(child);
        if (namedview) return;
      }
    }
  };

  findNamedview(doc);
  if (!namedview || typeof namedview.getAttribute !== "function") return null;

  return {
    pagecolor: namedview.getAttribute("pagecolor"),
    bordercolor: namedview.getAttribute("bordercolor"),
    borderopacity: namedview.getAttribute("borderopacity"),
    showgrid: namedview.getAttribute("showgrid"),
    showguides: namedview.getAttribute("showguides"),
    guidetolerance: namedview.getAttribute("guidetolerance"),
    inkscapeZoom: namedview.getAttribute("inkscape:zoom"),
    inkscapeCx: namedview.getAttribute("inkscape:cx"),
    inkscapeCy: namedview.getAttribute("inkscape:cy"),
    inkscapeWindowWidth: namedview.getAttribute("inkscape:window-width"),
    inkscapeWindowHeight: namedview.getAttribute("inkscape:window-height"),
    inkscapeCurrentLayer: namedview.getAttribute("inkscape:current-layer"),
  };
}

/**
 * Find all sodipodi:guide elements (guidelines).
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Array<{position: string, orientation: string, id: string|null}>} Array of guide info
 */
export function findGuides(doc) {
  // Validate doc parameter
  if (!doc) return [];

  const guides = [];

  const walk = (el) => {
    if (!el) return;
    if (el.tagName === "sodipodi:guide") {
      const position = el.getAttribute?.("position") || null;
      const orientation = el.getAttribute?.("orientation") || null;

      // Validate guide has required attributes (position and orientation)
      if (!position || !orientation) {
        // Skip invalid guides that lack required attributes
        if (el.children && Array.isArray(el.children)) {
          for (const child of el.children) {
            walk(child);
          }
        }
        return;
      }

      guides.push({
        position,
        orientation,
        id: el.getAttribute?.("id") || null,
        inkscapeColor: el.getAttribute?.("inkscape:color") || null,
        inkscapeLabel: el.getAttribute?.("inkscape:label") || null,
      });
    }
    // Safety check: ensure children is an array before iteration
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(doc);
  return guides;
}

/**
 * Get sodipodi arc parameters from a path element.
 * Inkscape stores original arc parameters for shapes converted from ellipses.
 *
 * @param {Object} element - SVG element (typically a path)
 * @returns {Object|null} Arc parameters or null if not an arc
 */
export function getArcParameters(element) {
  if (!element || typeof element.getAttribute !== "function") return null;

  const type = element.getAttribute("sodipodi:type");
  if (type !== "arc") return null;

  // Validate that required arc parameters exist
  const cx = element.getAttribute("sodipodi:cx");
  const cy = element.getAttribute("sodipodi:cy");
  const rx = element.getAttribute("sodipodi:rx");
  const ry = element.getAttribute("sodipodi:ry");

  // Arc must have center and radii
  if (!cx || !cy || !rx || !ry) return null;

  return {
    type: "arc",
    cx,
    cy,
    rx,
    ry,
    start: element.getAttribute("sodipodi:start"),
    end: element.getAttribute("sodipodi:end"),
    open: element.getAttribute("sodipodi:open"),
  };
}

/**
 * Get node types from a path element.
 * Inkscape stores node types (corner, smooth, symmetric, auto) for path editing.
 *
 * @param {Object} element - SVG path element
 * @returns {string|null} Node types string (c=corner, s=smooth, z=symmetric, a=auto)
 */
export function getNodeTypes(element) {
  if (!element || typeof element.getAttribute !== "function") return null;

  const nodeTypes = element.getAttribute("sodipodi:nodetypes");
  if (!nodeTypes) return null;

  // Validate format: should only contain c, s, z, a characters (case-sensitive)
  if (!/^[csza]+$/.test(nodeTypes)) return null;

  return nodeTypes;
}

/**
 * Get export settings from an element.
 *
 * @param {Object} element - SVG element
 * @returns {Object|null} Export settings or null if not set
 */
export function getExportSettings(element) {
  if (!element || typeof element.getAttribute !== "function") return null;

  const filename = element.getAttribute("inkscape:export-filename");
  const xdpi = element.getAttribute("inkscape:export-xdpi");
  const ydpi = element.getAttribute("inkscape:export-ydpi");

  if (!filename && !xdpi && !ydpi) return null;

  // Parse DPI values and handle NaN by returning null
  const parsedXdpi = xdpi ? parseFloat(xdpi) : null;
  const parsedYdpi = ydpi ? parseFloat(ydpi) : null;

  return {
    filename,
    xdpi: parsedXdpi !== null && !isNaN(parsedXdpi) ? parsedXdpi : null,
    ydpi: parsedYdpi !== null && !isNaN(parsedYdpi) ? parsedYdpi : null,
  };
}

/**
 * Check if element is part of a tiled clone.
 *
 * @param {Object} element - SVG element
 * @returns {boolean} True if element is a tiled clone
 */
export function isTiledClone(element) {
  if (!element || typeof element.hasAttribute !== "function") return false;
  return element.hasAttribute("inkscape:tiled-clone-of");
}

/**
 * Get tiled clone source ID.
 *
 * @param {Object} element - SVG element
 * @returns {string|null} Source element ID or null
 */
export function getTiledCloneSource(element) {
  if (!element || typeof element.getAttribute !== "function") return null;
  return element.getAttribute("inkscape:tiled-clone-of") || null;
}

/**
 * Check if document has Inkscape namespaces declared.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {boolean} True if Inkscape namespaces are present
 */
export function hasInkscapeNamespaces(doc) {
  if (!doc) return false;

  // Try documentElement first, fall back to doc itself
  const svg = doc.documentElement || doc;
  if (!svg || typeof svg.getAttribute !== "function") return false;

  // Check for exact namespace URI matches
  const inkscapeNs = svg.getAttribute("xmlns:inkscape");
  const sodipodiNs = svg.getAttribute("xmlns:sodipodi");

  const hasInkscape = inkscapeNs === INKSCAPE_NS;
  const hasSodipodi = sodipodiNs === SODIPODI_NS;

  return hasInkscape || hasSodipodi;
}

/**
 * Ensure Inkscape namespace declarations are present.
 * Adds xmlns:inkscape and xmlns:sodipodi if missing.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Object} The document (modified in place)
 */
export function ensureInkscapeNamespaces(doc) {
  // Validate doc parameter
  if (!doc) return doc;

  const svg = doc.documentElement || doc;

  // Safety check: ensure getAttribute and setAttribute methods exist
  if (
    typeof svg.getAttribute !== "function" ||
    typeof svg.setAttribute !== "function"
  ) {
    return doc;
  }

  if (!svg.getAttribute("xmlns:inkscape")) {
    svg.setAttribute("xmlns:inkscape", INKSCAPE_NS);
  }
  if (!svg.getAttribute("xmlns:sodipodi")) {
    svg.setAttribute("xmlns:sodipodi", SODIPODI_NS);
  }

  return doc;
}

// ============================================================================
// LAYER EXTRACTION
// ============================================================================

/**
 * Find all IDs referenced by an element and its descendants.
 * Looks for url(#id) references in fill, stroke, clip-path, mask, marker-*, filter, etc.
 * Also checks xlink:href and href attributes for #id references.
 *
 * @param {Object} element - SVG element to scan
 * @returns {Set<string>} Set of referenced IDs
 */
export function findReferencedIds(element) {
  // Validate element parameter
  if (!element) return new Set();

  const ids = new Set();

  // Attributes that can contain url(#id) references
  const urlRefAttrs = [
    "fill",
    "stroke",
    "clip-path",
    "mask",
    "filter",
    "marker-start",
    "marker-mid",
    "marker-end",
  ];

  // Attributes that can contain #id or url(#id) references
  const hrefAttrs = ["href", "xlink:href"];

  const extractUrlId = (value) => {
    if (!value || typeof value !== "string") return null;
    // Match url(#id) or url("#id")
    const match = value.match(/url\(["']?#([^"')]+)["']?\)/);
    return match ? match[1] : null;
  };

  const extractHrefId = (value) => {
    if (!value || typeof value !== "string") return null;
    // Match #id references
    if (value.startsWith("#")) {
      return value.slice(1);
    }
    return null;
  };

  const walk = (el) => {
    if (!el) return;

    // Check url() references
    for (const attr of urlRefAttrs) {
      const id = extractUrlId(el.getAttribute?.(attr));
      if (id) ids.add(id);
    }

    // Check href references
    for (const attr of hrefAttrs) {
      const id = extractHrefId(el.getAttribute?.(attr));
      if (id) ids.add(id);
    }

    // Check style attribute for url() references
    const style = el.getAttribute?.("style");
    if (style) {
      const urlMatches = style.matchAll(/url\(["']?#([^"')]+)["']?\)/g);
      for (const match of urlMatches) {
        ids.add(match[1]);
      }
    }

    // Recurse into children
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(element);
  return ids;
}

/**
 * Build a map of all defs elements by their ID.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Map<string, Object>} Map of ID to element
 */
export function buildDefsMapFromDefs(doc) {
  // Validate doc parameter
  if (!doc) return new Map();

  const defsMap = new Map();

  const walk = (el) => {
    if (!el) return;

    // If element has an ID, add to map
    const id = el.getAttribute?.("id");
    if (id) {
      defsMap.set(id, el);
    }

    // Recurse
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  // Only scan defs elements for efficiency
  const findDefs = (el) => {
    if (!el) return;
    if (el.tagName === "defs") {
      walk(el);
    }
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        findDefs(child);
      }
    }
  };

  findDefs(doc);
  return defsMap;
}

/**
 * Recursively resolve all dependencies for a set of IDs.
 * Defs elements can reference other defs (e.g., gradient with xlink:href to another gradient).
 *
 * @param {Set<string>} initialIds - Initial set of IDs to resolve
 * @param {Map<string, Object>} defsMap - Map of all defs elements
 * @returns {Set<string>} Complete set of IDs including all nested dependencies
 */
export function resolveDefsDependencies(initialIds, defsMap) {
  // Validate parameters
  if (!initialIds || !(initialIds instanceof Set)) {
    throw new Error(
      "resolveDefsDependencies: initialIds parameter must be a Set",
    );
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("resolveDefsDependencies: defsMap parameter must be a Map");
  }

  const resolved = new Set();
  const toProcess = [...initialIds];

  while (toProcess.length > 0) {
    const id = toProcess.pop();
    if (resolved.has(id)) continue;

    const element = defsMap.get(id);
    if (!element) continue;

    resolved.add(id);

    // Find references within this def element
    const nestedRefs = findReferencedIds(element);
    for (const nestedId of nestedRefs) {
      if (!resolved.has(nestedId) && defsMap.has(nestedId)) {
        toProcess.push(nestedId);
      }
    }
  }

  return resolved;
}

/**
 * Deep clone an SVG element and all its children using proper SVGElement class.
 *
 * @param {Object} element - Element to clone
 * @returns {SVGElement} Cloned element with serialize() method
 */
export function cloneElement(element) {
  if (!element) return null;

  // Get attributes as plain object
  const attrs = {};
  if (element._attributes) {
    Object.assign(attrs, element._attributes);
  } else if (typeof element.getAttributeNames === "function") {
    for (const name of element.getAttributeNames()) {
      attrs[name] = element.getAttribute(name);
    }
  }

  // Clone children recursively
  const clonedChildren = [];
  if (element.children && Array.isArray(element.children)) {
    for (const child of element.children) {
      const clonedChild = cloneElement(child);
      if (clonedChild) {
        clonedChildren.push(clonedChild);
      }
    }
  }

  // Create proper SVGElement with serialize() method
  // Note: SVGElement constructor requires textContent to be a string, not null
  const clone = new SVGElement(
    element.tagName,
    attrs,
    clonedChildren,
    element.textContent || "",
  );

  return clone;
}

/**
 * Extract a single layer as a standalone SVG document.
 * Includes only the defs elements that are referenced by the layer.
 *
 * @param {Object} doc - Source parsed SVG document
 * @param {Object|string} layerOrId - Layer element or layer ID to extract
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeHiddenLayers=false] - Include hidden layers in output
 * @param {boolean} [options.preserveTransform=true] - Preserve layer transform attribute
 * @returns {{svg: SVGElement, layerInfo: {id: string, label: string}}} Extracted SVG and layer info
 */
export function extractLayer(doc, layerOrId, options = {}) {
  // Validate doc parameter
  if (!doc) {
    throw new Error("doc parameter is required");
  }

  const { preserveTransform = true } = options;

  // Find the layer element
  let layer;
  if (typeof layerOrId === "string") {
    const layers = findLayers(doc);
    const found = layers.find(
      (l) => l.id === layerOrId || l.label === layerOrId,
    );
    if (!found) {
      throw new Error(`Layer not found: ${layerOrId}`);
    }
    if (!found.element) {
      throw new Error(`Layer element is invalid for: ${layerOrId}`);
    }
    layer = found.element;
  } else {
    if (!layerOrId) {
      throw new Error("layerOrId parameter is required");
    }
    layer = layerOrId;
  }

  if (!isInkscapeLayer(layer)) {
    throw new Error("Element is not an Inkscape layer");
  }

  // Get SVG root element
  const svgRoot = doc.documentElement || doc;

  // Build defs map from source document
  const defsMap = buildDefsMapFromDefs(doc);

  // Find all IDs referenced by this layer
  const referencedIds = findReferencedIds(layer);

  // Resolve all nested dependencies
  const requiredDefIds = resolveDefsDependencies(referencedIds, defsMap);

  // Get SVG root attributes
  const svgAttrs = {};
  if (svgRoot._attributes) {
    Object.assign(svgAttrs, svgRoot._attributes);
  } else if (typeof svgRoot.getAttributeNames === "function") {
    for (const name of svgRoot.getAttributeNames()) {
      svgAttrs[name] = svgRoot.getAttribute(name);
    }
  }

  // Build children array for new SVG
  const svgChildren = [];

  // Create defs element with required definitions
  if (requiredDefIds.size > 0) {
    const defsChildren = [];
    for (const id of requiredDefIds) {
      const defElement = defsMap.get(id);
      if (defElement) {
        defsChildren.push(cloneElement(defElement));
      }
    }
    if (defsChildren.length > 0) {
      const newDefs = new SVGElement("defs", {}, defsChildren, null);
      svgChildren.push(newDefs);
    }
  }

  // Clone the layer
  const clonedLayer = cloneElement(layer);

  // Optionally remove the transform
  if (!preserveTransform && clonedLayer._attributes) {
    delete clonedLayer._attributes.transform;
  }

  svgChildren.push(clonedLayer);

  // Create new SVG document using SVGElement
  const newSvg = new SVGElement("svg", svgAttrs, svgChildren, null);

  // Get layer info
  const layerInfo = {
    id:
      typeof layer.getAttribute === "function"
        ? layer.getAttribute("id")
        : null,
    label: getLayerLabel(layer),
  };

  return { svg: newSvg, layerInfo };
}

/**
 * Extract all layers from an Inkscape SVG as separate documents.
 *
 * @param {Object} doc - Source parsed SVG document
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeHidden=false] - Include hidden layers (display:none or visibility:hidden)
 * @param {boolean} [options.preserveTransform=true] - Preserve layer transform attributes
 * @returns {Array<{svg: Object, layerInfo: {id: string, label: string}}>} Array of extracted SVGs
 */
export function extractAllLayers(doc, options = {}) {
  // Validate doc parameter
  if (!doc) {
    throw new Error("doc parameter is required");
  }

  const { includeHidden = false } = options;
  const layers = findLayers(doc);
  const results = [];

  for (const layerData of layers) {
    const layer = layerData.element;

    // Skip hidden layers unless requested
    if (!includeHidden) {
      // Validate getAttribute method exists
      if (typeof layer.getAttribute !== "function") continue;

      const style = layer.getAttribute("style") || "";
      const display = layer.getAttribute("display");
      const visibility = layer.getAttribute("visibility");

      // Use regex to avoid partial matches in style attribute
      const hasDisplayNone = /display\s*:\s*none/i.test(style);
      const hasVisibilityHidden = /visibility\s*:\s*hidden/i.test(style);

      if (
        display === "none" ||
        visibility === "hidden" ||
        hasDisplayNone ||
        hasVisibilityHidden
      ) {
        continue;
      }
    }

    try {
      const extracted = extractLayer(doc, layer, options);
      results.push(extracted);
    } catch (e) {
      // Skip layers that fail to extract
      console.warn(
        `Failed to extract layer ${layerData.id || layerData.label}: ${e.message}`,
      );
    }
  }

  return results;
}

/**
 * Get a summary of shared resources between layers.
 * Useful for understanding what defs are shared across layers.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Object} Summary of shared resources
 */
export function analyzeLayerDependencies(doc) {
  // Validate doc parameter
  if (!doc) {
    throw new Error("doc parameter is required");
  }

  const layers = findLayers(doc);
  const defsMap = buildDefsMapFromDefs(doc);
  const layerRefs = new Map(); // layer ID -> Set of referenced def IDs
  const defUsage = new Map(); // def ID -> Set of layer IDs that use it

  for (const layerData of layers) {
    const layer = layerData.element;
    const layerId = layerData.id || layerData.label || "unnamed";

    // Find refs for this layer
    const refs = findReferencedIds(layer);
    const resolved = resolveDefsDependencies(refs, defsMap);

    layerRefs.set(layerId, resolved);

    // Track which defs are used by which layers
    for (const defId of resolved) {
      if (!defUsage.has(defId)) {
        defUsage.set(defId, new Set());
      }
      defUsage.get(defId).add(layerId);
    }
  }

  // Find shared defs (used by more than one layer)
  const sharedDefs = [];
  const exclusiveDefs = new Map(); // layer ID -> defs only used by that layer

  for (const [defId, layerSet] of defUsage) {
    if (layerSet.size > 1) {
      sharedDefs.push({
        id: defId,
        usedBy: [...layerSet],
      });
    } else {
      const layerId = [...layerSet][0];
      if (!exclusiveDefs.has(layerId)) {
        exclusiveDefs.set(layerId, []);
      }
      exclusiveDefs.get(layerId).push(defId);
    }
  }

  return {
    layers: layers.map((l) => ({
      id: l.id,
      label: l.label,
      referencedDefs: [...(layerRefs.get(l.id || l.label || "unnamed") || [])],
    })),
    sharedDefs,
    exclusiveDefs: Object.fromEntries(exclusiveDefs),
    totalDefs: defsMap.size,
  };
}
