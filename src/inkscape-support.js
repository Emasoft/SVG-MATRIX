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

// ============================================================================
// COMPLETE INKSCAPE NAMESPACE SCHEMA
// Sources:
//   - https://gitlab.com/inkscape/inkscape/-/blob/master/src/attributes.cpp
//   - https://github.com/validator/validator/blob/main/schema/svg11/inkscape-draft.rnc
//   - https://github.com/validator/validator/blob/main/schema/svg11/inkscape.rnc
//   - https://wiki.inkscape.org/wiki/Inkscape-specific_XML_attributes
// ============================================================================

/**
 * Complete list of valid inkscape: namespace attributes.
 * Organized by category for documentation and validation.
 */
export const INKSCAPE_ATTRIBUTES = {
  // Layer and grouping
  groupmode: { type: "string", values: ["layer"], description: "Identifies a group as a layer" },
  label: { type: "string", description: "Human-readable label for objects/layers" },
  expanded: { type: "boolean", description: "UI state - whether group is expanded in layers panel" },

  // Document and version info
  version: { type: "string", description: "Inkscape version that created/edited the file" },
  "document-units": { type: "string", values: ["px", "pt", "pc", "mm", "cm", "in"], description: "Default document units" },

  // View state (stored in sodipodi:namedview)
  zoom: { type: "number", description: "Current zoom level" },
  rotation: { type: "number", description: "Current view rotation in degrees" },
  cx: { type: "number", description: "View center X coordinate" },
  cy: { type: "number", description: "View center Y coordinate" },
  "window-width": { type: "number", description: "Window width in pixels" },
  "window-height": { type: "number", description: "Window height in pixels" },
  "window-x": { type: "number", description: "Window X position" },
  "window-y": { type: "number", description: "Window Y position" },
  "window-maximized": { type: "boolean", description: "Whether window is maximized" },
  "current-layer": { type: "string", description: "ID of the currently active layer" },

  // Page and desk appearance
  pageopacity: { type: "number", min: 0, max: 1, description: "Page opacity" },
  pageshadow: { type: "number", description: "Page shadow intensity" },
  showpageshadow: { type: "boolean", description: "Whether to show page shadow" },
  deskcolor: { type: "color", description: "Desk (canvas background) color" },
  deskopacity: { type: "number", min: 0, max: 1, description: "Desk opacity" },
  pagecheckerboard: { type: "boolean", description: "Show checkerboard pattern for transparency" },
  // Alternate hyphenated forms also accepted by Inkscape
  "desk-color": { type: "color", description: "Desk (canvas background) color (alternate form)" },
  "desk-opacity": { type: "number", min: 0, max: 1, description: "Desk opacity (alternate form)" },
  "desk-checkerboard": { type: "boolean", description: "Show checkerboard pattern (alternate form)" },
  "clip-to-page": { type: "boolean", description: "Clip rendering to page bounds" },
  "clip-to-page-rendering": { type: "boolean", description: "Clip rendering to page bounds (rendering mode)" },
  "antialias-rendering": { type: "boolean", description: "Enable antialiasing in rendering" },

  // Page dimensions
  margin: { type: "string", description: "Page margin (CSS-like format)" },
  bleed: { type: "string", description: "Page bleed area" },
  "page-size": { type: "string", description: "Named page size (A4, Letter, etc.)" },
  "svg-dpi": { type: "number", description: "DPI for SVG export" },
  "origin-correction": { type: "string", description: "Origin correction for page positioning" },
  "y-axis-down": { type: "boolean", description: "Y axis direction (true=down, false=up)" },

  // Guides
  lockguides: { type: "boolean", description: "Lock all guides from editing" },
  color: { type: "color", description: "Guide color" },

  // Object state
  locked: { type: "boolean", description: "Object is locked from editing" },
  pinned: { type: "boolean", description: "Object is pinned in place" },
  collect: { type: "string", values: ["always", "never"], description: "Garbage collection behavior for defs" },
  "highlight-color": { type: "color", description: "Highlight color for object selection" },
  swatch: { type: "boolean", description: "Gradient is a color swatch" },

  // Transform
  "transform-center-x": { type: "number", description: "Custom rotation center X offset" },
  "transform-center-y": { type: "number", description: "Custom rotation center Y offset" },

  // Live Path Effects (LPE)
  "path-effect": { type: "string", description: "Reference to inkscape:path-effect element (#id or #id;#id2)" },
  "original-d": { type: "string", description: "Original path data before LPE application" },
  original: { type: "string", description: "Original element reference" },

  // Connectors
  "connector-type": { type: "string", values: ["polyline", "orthogonal"], description: "Connector line type" },
  "connector-curvature": { type: "number", description: "Connector curve amount" },
  "connector-spacing": { type: "number", description: "Spacing around connectors" },
  "connector-avoid": { type: "boolean", description: "Other connectors avoid this object" },
  "connection-points": { type: "string", description: "Custom connection point definitions" },
  "connection-start": { type: "string", description: "Start connection point reference" },
  "connection-end": { type: "string", description: "End connection point reference" },
  "connection-start-point": { type: "string", description: "Child-object reference for start connection" },
  "connection-end-point": { type: "string", description: "Child-object reference for end connection" },

  // 3D Box and Perspective
  perspectiveID: { type: "string", description: "Reference to perspective element" },
  "box3d-perspectiveID": { type: "string", description: "Reference to perspective element (3D box alternate)" },
  "box3d-perspective-id": { type: "string", description: "Reference to perspective element (hyphenated form)" },
  corner0: { type: "string", description: "3D box corner 0 coordinates" },
  corner7: { type: "string", description: "3D box corner 7 coordinates" },
  box3dsidetype: { type: "string", description: "3D box side type" },
  persp3d: { type: "string", description: "3D perspective definition" },
  vp_x: { type: "string", description: "X vanishing point" },
  vp_y: { type: "string", description: "Y vanishing point" },
  vp_z: { type: "string", description: "Z vanishing point" },
  "persp3d-origin": { type: "string", description: "Perspective origin point" },

  // Star/Polygon shapes
  flatsided: { type: "boolean", description: "Polygon has flat sides (not star)" },
  rounded: { type: "number", description: "Corner rounding amount" },
  randomized: { type: "number", description: "Random vertex displacement" },
  radius: { type: "number", description: "Shape radius" },

  // References
  href: { type: "string", description: "Inkscape-specific href reference" },

  // Font and text
  "font-specification": { type: "string", description: "Full font specification string (fontconfig format)" },
  "font-spec": { type: "string", description: "Full font specification (alternate form)" },

  // Text flow (SVG 1.2 draft)
  srcNoMarkup: { type: "string", description: "Text source without markup" },
  srcPango: { type: "string", description: "Text source in Pango markup" },
  dstShape: { type: "string", description: "Text flow destination shape" },
  dstPath: { type: "string", description: "Text flow destination path" },
  dstBox: { type: "string", description: "Text flow destination box" },
  dstColumn: { type: "string", description: "Text flow column settings" },
  excludeShape: { type: "string", description: "Shapes to exclude from text flow" },
  layoutOptions: { type: "string", description: "Text layout options" },
  "auto-region": { type: "boolean", description: "Auto-create text flow region" },

  // Export
  "export-filename": { type: "string", description: "Default export filename" },
  "export-xdpi": { type: "number", description: "Export X DPI" },
  "export-ydpi": { type: "number", description: "Export Y DPI" },

  // Spray tool
  "spray-origin": { type: "string", description: "Spray tool origin reference" },

  // Tiled clones
  "tiled-clone-of": { type: "string", description: "Source element for tiled clone" },
  "tile-cx": { type: "number", description: "Tile clone center X" },
  "tile-cy": { type: "number", description: "Tile clone center Y" },
  "tile-w": { type: "number", description: "Tile clone width" },
  "tile-h": { type: "number", description: "Tile clone height" },
  "tile-x0": { type: "number", description: "Tile origin X coordinate" },
  "tile-y0": { type: "number", description: "Tile origin Y coordinate" },

  // Grid and guide display (from inkscape-draft.rnc)
  "grid-bbox": { type: "boolean", description: "Show grid bounding box" },
  "grid-points": { type: "boolean", description: "Show grid points" },
  "guide-bbox": { type: "boolean", description: "Show guide bounding box" },
  "guide-points": { type: "boolean", description: "Show guide points" },
  "object-bbox": { type: "boolean", description: "Show object bounding box" },
  "object-nodes": { type: "boolean", description: "Show object nodes" },
  "object-paths": { type: "boolean", description: "Show object paths" },
  "object-points": { type: "boolean", description: "Show object points" },

  // Markers and stock resources
  marker: { type: "string", description: "Marker reference" },
  stockid: { type: "string", description: "Stock marker/pattern ID" },
  isstock: { type: "boolean", description: "Element is a stock resource (pattern, symbol, etc.)" },
  menu: { type: "string", description: "Menu category for stock resources" },
  "menu-tooltip": { type: "string", description: "Tooltip text for stock resource menu item" },

  // Data handling
  dataloss: { type: "boolean", description: "Indicates data loss on save" },
  "has_abs_tolerance": { type: "boolean", description: "Has absolute tolerance" },
  "output_extension": { type: "string", description: "Output extension ID" },

  // Offset path
  offset: { type: "number", description: "Offset distance for offset paths" },

  // Stroke extensions (CSS-like)
  "-inkscape-stroke": { type: "string", values: ["hairline"], description: "Inkscape stroke rendering mode" },
};

/**
 * Complete list of valid sodipodi: namespace attributes.
 * Source: https://github.com/validator/validator/blob/main/schema/svg11/inkscape-draft.rnc
 */
export const SODIPODI_ATTRIBUTES = {
  // Document info
  docname: { type: "string", description: "Document filename" },
  docbase: { type: "string", description: "Document base directory (absolute path)" },
  version: { type: "string", description: "Sodipodi version that saved the document" },
  modified: { type: "boolean", description: "Internal: document modified since last save" },

  // Shape type
  type: { type: "string", values: ["arc", "star", "spiral", "inkscape:offset"], description: "Sodipodi shape type" },
  insensitive: { type: "boolean", description: "Object cannot be selected with mouse" },
  nonprintable: { type: "boolean", description: "Object should not be printed" },

  // Arc/Ellipse parameters
  cx: { type: "number", description: "Arc center X" },
  cy: { type: "number", description: "Arc center Y" },
  rx: { type: "number", description: "Arc radius X" },
  ry: { type: "number", description: "Arc radius Y" },
  start: { type: "number", description: "Arc start angle (radians)" },
  end: { type: "number", description: "Arc end angle (radians)" },
  open: { type: "boolean", description: "Arc is open (not closed)" },
  "arc-type": { type: "string", values: ["arc", "slice", "chord"], description: "Arc rendering type" },

  // Star/Polygon parameters
  star: { type: "boolean", description: "Shape is a star (vs polygon)" },
  sides: { type: "number", min: 3, description: "Number of polygon/star sides" },
  r1: { type: "number", description: "Star outer radius" },
  r2: { type: "number", description: "Star inner radius" },
  arg1: { type: "number", description: "Star angle argument 1 (radians)" },
  arg2: { type: "number", description: "Star angle argument 2 (radians)" },

  // Spiral parameters
  spiral: { type: "boolean", description: "Shape is a spiral" },
  expansion: { type: "number", description: "Spiral expansion rate" },
  revolution: { type: "number", description: "Number of spiral revolutions" },
  radius: { type: "number", description: "Spiral radius" },
  argument: { type: "number", description: "Spiral argument (start angle in radians)" },
  t0: { type: "number", min: 0, max: 1, description: "Spiral start parameter (0-1)" },

  // Path and reference
  original: { type: "string", description: "Original path or element reference" },
  nodetypes: { type: "string", pattern: /^[csza]+$/, description: "Path node types (c=corner, s=smooth, z=symmetric, a=auto)" },
  absref: { type: "string", description: "Absolute native path to external resource" },

  // Text
  role: { type: "string", values: ["line"], description: "Text span role (line = separate line)" },
  linespacing: { type: "string", description: "Line spacing (percentage like '125%' or absolute)" },
};

/**
 * Valid sodipodi: namespace elements.
 */
export const SODIPODI_ELEMENTS = ["namedview", "guide"];

/**
 * Valid inkscape: namespace elements.
 */
export const INKSCAPE_ELEMENTS = [
  "path-effect",   // Live Path Effects
  "perspective",   // 3D perspective definitions
  "page",          // Multi-page document support
  "clipboard",     // Clipboard data container
  "grid",          // Grid definitions
  "box3dside",     // 3D box side element
];

/**
 * SVG 1.2 draft elements used by Inkscape for flowed text.
 * These are in the SVG namespace but are Inkscape-specific features.
 */
export const FLOW_TEXT_ELEMENTS = ["flowRoot", "flowPara", "flowRegion", "flowSpan", "flowDiv", "flowLine"];

/**
 * SVG 2 features requiring browser polyfills.
 * Source: https://gitlab.com/inkscape/inkscape/-/blob/master/src/extension/internal/polyfill/README.md
 *
 * Note on Mesh Gradients (SVG 2 CR 2016 §13.8):
 * Stop elements inside meshpatch use 'path' attribute instead of 'offset'.
 * Reference: https://www.w3.org/TR/2016/CR-SVG2-20160915/pservers.html
 *   - "offset - does not apply to mesh gradients"
 *   - "path - applies only to mesh gradients"
 * The 'path' attribute contains a single c/C/l/L bezier command defining one
 * edge of the Coons patch quadrilateral. Mesh gradients were later removed
 * from the SVG 2 Recommendation but Inkscape still supports them.
 */
export const POLYFILL_FEATURES = {
  meshGradient: {
    elements: ["meshgradient", "meshrow", "meshpatch"],
    description: "Bicubic mesh gradients (SVG 2 CR 2016, removed from final spec)",
    polyfill: "inkscape-mesh-polyfill.js",
    browserSupport: "None",
    stopAttribute: "path", // NOT 'offset' - mesh stops define patch edges with bezier commands
  },
  hatchPaint: {
    elements: ["hatch", "hatchpath"],
    description: "Hatch paint server for patterns",
    polyfill: "hatch.js",
    browserSupport: "None",
    limitations: "Relative path support incomplete",
  },
  hairlineStroke: {
    cssProperty: "-inkscape-stroke",
    values: ["hairline"],
    description: "1-device-unit stroke regardless of zoom",
    browserSupport: "None",
  },
};

/**
 * Namespace URIs for validation and serialization.
 */
export const NAMESPACE_URIS = {
  inkscape: INKSCAPE_NS,
  sodipodi: SODIPODI_NS,
  svg: "http://www.w3.org/2000/svg",
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
};

/**
 * Validate an inkscape: attribute value.
 * @param {string} attrName - Attribute name without prefix
 * @param {string} value - Attribute value
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateInkscapeAttribute(attrName, value) {
  const schema = INKSCAPE_ATTRIBUTES[attrName];
  if (!schema) {
    return { valid: true }; // Unknown attributes are allowed (future compatibility)
  }

  if (schema.values && !schema.values.includes(value)) {
    return { valid: false, error: `Invalid value "${value}" for inkscape:${attrName}. Expected: ${schema.values.join(", ")}` };
  }

  if (schema.type === "number") {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: `inkscape:${attrName} must be a number` };
    }
    if (schema.min !== undefined && num < schema.min) {
      return { valid: false, error: `inkscape:${attrName} must be >= ${schema.min}` };
    }
    if (schema.max !== undefined && num > schema.max) {
      return { valid: false, error: `inkscape:${attrName} must be <= ${schema.max}` };
    }
  }

  if (schema.type === "boolean") {
    // Inkscape accepts: "true", "false", or any integer (0=false, non-zero=true)
    if (value === "true" || value === "false") {
      return { valid: true };
    }
    // Check if it's a valid integer
    const intVal = parseInt(value, 10);
    if (isNaN(intVal) || String(intVal) !== value) {
      return { valid: false, error: `inkscape:${attrName} must be a boolean (true/false) or integer` };
    }
  }

  if (schema.pattern && !schema.pattern.test(value)) {
    return { valid: false, error: `inkscape:${attrName} has invalid format` };
  }

  return { valid: true };
}

/**
 * Validate a sodipodi: attribute value.
 * @param {string} attrName - Attribute name without prefix
 * @param {string} value - Attribute value
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateSodipodiAttribute(attrName, value) {
  const schema = SODIPODI_ATTRIBUTES[attrName];
  if (!schema) {
    return { valid: true }; // Unknown attributes are allowed (future compatibility)
  }

  if (schema.values && !schema.values.includes(value)) {
    return { valid: false, error: `Invalid value "${value}" for sodipodi:${attrName}. Expected: ${schema.values.join(", ")}` };
  }

  if (schema.type === "number") {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: `sodipodi:${attrName} must be a number` };
    }
    if (schema.min !== undefined && num < schema.min) {
      return { valid: false, error: `sodipodi:${attrName} must be >= ${schema.min}` };
    }
    if (schema.max !== undefined && num > schema.max) {
      return { valid: false, error: `sodipodi:${attrName} must be <= ${schema.max}` };
    }
  }

  if (schema.pattern && !schema.pattern.test(value)) {
    return { valid: false, error: `sodipodi:${attrName} has invalid format` };
  }

  return { valid: true };
}

/**
 * Check if a document is an Inkscape SVG file.
 * Checks for Inkscape namespaces and version attribute.
 * @param {Object} doc - Parsed SVG document
 * @returns {{isInkscape: boolean, version?: string, hasFlowText: boolean}}
 */
export function detectInkscapeDocument(doc) {
  if (!doc) return { isInkscape: false, hasFlowText: false };

  const svg = doc.documentElement || doc;
  if (!svg || typeof svg.getAttribute !== "function") {
    return { isInkscape: false, hasFlowText: false };
  }

  const hasInkscapeNs = svg.getAttribute("xmlns:inkscape") === INKSCAPE_NS;
  const hasSodipodiNs = svg.getAttribute("xmlns:sodipodi") === SODIPODI_NS;
  const inkscapeVersion = svg.getAttribute("inkscape:version");

  // Check for flowRoot elements (Inkscape flowed text)
  let hasFlowText = false;
  const checkFlowText = (el) => {
    if (!el) return;
    if (FLOW_TEXT_ELEMENTS.includes(el.tagName)) {
      hasFlowText = true;
      return;
    }
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        checkFlowText(child);
        if (hasFlowText) return;
      }
    }
  };
  checkFlowText(svg);

  return {
    isInkscape: hasInkscapeNs || hasSodipodiNs || !!inkscapeVersion,
    version: inkscapeVersion || undefined,
    hasFlowText,
  };
}

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

// ============================================================================
// COMPREHENSIVE INKSCAPE DOCUMENT VALIDATION
// ============================================================================

/**
 * Validation issue severity levels.
 */
export const InkscapeValidationSeverity = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
};

/**
 * Validate all Inkscape/Sodipodi attributes in a document.
 * @param {Object} doc - Parsed SVG document
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.strict=false] - Fail on unknown attributes
 * @param {boolean} [options.warnFlowText=true] - Warn about SVG 1.2 flowText
 * @param {boolean} [options.checkPolyfillNeeds=true] - Check for features needing polyfills
 * @returns {{
 *   isValid: boolean,
 *   isInkscape: boolean,
 *   version?: string,
 *   issues: Array<{severity: string, type: string, element: string, attribute?: string, message: string, line?: number}>,
 *   summary: {errors: number, warnings: number, info: number},
 *   polyfillsNeeded: string[],
 *   hasFlowText: boolean
 * }}
 */
export function validateInkscapeDocument(doc, options = {}) {
  const {
    strict = false,
    warnFlowText = true,
    checkPolyfillNeeds = true,
  } = options;

  const issues = [];
  const polyfillsNeeded = new Set();
  let hasFlowText = false;
  let hasMeshGradient = false;
  let hasHatch = false;

  // Detect if this is an Inkscape document
  const detection = detectInkscapeDocument(doc);
  hasFlowText = detection.hasFlowText;

  // Helper to add issue
  const addIssue = (severity, type, element, attribute, message) => {
    issues.push({ severity, type, element, attribute, message });
  };

  // Check namespace declarations
  const svg = doc.documentElement || doc;
  if (svg && typeof svg.getAttribute === "function") {
    const inkscapeNs = svg.getAttribute("xmlns:inkscape");
    const sodipodiNs = svg.getAttribute("xmlns:sodipodi");

    // Validate namespace URIs are correct
    if (inkscapeNs && inkscapeNs !== INKSCAPE_NS) {
      addIssue(
        InkscapeValidationSeverity.ERROR,
        "invalid_namespace_uri",
        "svg",
        "xmlns:inkscape",
        `Invalid Inkscape namespace URI. Expected: ${INKSCAPE_NS}, got: ${inkscapeNs}`
      );
    }
    if (sodipodiNs && sodipodiNs !== SODIPODI_NS) {
      addIssue(
        InkscapeValidationSeverity.ERROR,
        "invalid_namespace_uri",
        "svg",
        "xmlns:sodipodi",
        `Invalid Sodipodi namespace URI. Expected: ${SODIPODI_NS}, got: ${sodipodiNs}`
      );
    }
  }

  // Walk the document tree and validate attributes
  const walkAndValidate = (el) => {
    if (!el || typeof el.getAttributeNames !== "function") return;

    const tagName = el.tagName || "unknown";

    // Check for elements needing polyfills
    if (checkPolyfillNeeds) {
      const tagLower = tagName.toLowerCase();
      if (tagLower === "meshgradient" || tagLower === "meshrow" || tagLower === "meshpatch") {
        hasMeshGradient = true;
      }
      if (tagLower === "hatch" || tagLower === "hatchpath") {
        hasHatch = true;
      }
      if (FLOW_TEXT_ELEMENTS.includes(tagName)) {
        hasFlowText = true;
      }
    }

    // Check for sodipodi: elements
    if (tagName.startsWith("sodipodi:")) {
      const elementName = tagName.substring(9);
      if (!SODIPODI_ELEMENTS.includes(elementName)) {
        addIssue(
          InkscapeValidationSeverity.ERROR,
          "unknown_sodipodi_element",
          tagName,
          null,
          `Unknown sodipodi element: ${tagName} - not in Sodipodi namespace schema`
        );
      }
    }

    // Check for inkscape: elements
    if (tagName.startsWith("inkscape:")) {
      const elementName = tagName.substring(9);
      if (!INKSCAPE_ELEMENTS.includes(elementName)) {
        addIssue(
          InkscapeValidationSeverity.ERROR,
          "unknown_inkscape_element",
          tagName,
          null,
          `Unknown inkscape element: ${tagName} - not in Inkscape namespace schema`
        );
      }
    }

    // Validate attributes
    for (const attrName of el.getAttributeNames()) {
      const value = el.getAttribute(attrName);

      // Validate inkscape: attributes
      if (attrName.startsWith("inkscape:")) {
        const attrLocalName = attrName.substring(9);
        const validation = validateInkscapeAttribute(attrLocalName, value);
        if (!validation.valid) {
          addIssue(
            InkscapeValidationSeverity.ERROR,
            "invalid_inkscape_attribute",
            tagName,
            attrName,
            validation.error
          );
        } else if (strict && !INKSCAPE_ATTRIBUTES[attrLocalName]) {
          addIssue(
            InkscapeValidationSeverity.ERROR,
            "unknown_inkscape_attribute",
            tagName,
            attrName,
            `Unknown inkscape attribute: ${attrName} - not in Inkscape namespace schema`
          );
        }
      }

      // Validate sodipodi: attributes
      if (attrName.startsWith("sodipodi:")) {
        const attrLocalName = attrName.substring(9);
        const validation = validateSodipodiAttribute(attrLocalName, value);
        if (!validation.valid) {
          addIssue(
            InkscapeValidationSeverity.ERROR,
            "invalid_sodipodi_attribute",
            tagName,
            attrName,
            validation.error
          );
        } else if (strict && !SODIPODI_ATTRIBUTES[attrLocalName]) {
          addIssue(
            InkscapeValidationSeverity.ERROR,
            "unknown_sodipodi_attribute",
            tagName,
            attrName,
            `Unknown sodipodi attribute: ${attrName} - not in Sodipodi namespace schema`
          );
        }
      }

      // Check for -inkscape-stroke CSS property in style
      if (attrName === "style" && value.includes("-inkscape-stroke")) {
        polyfillsNeeded.add("hairlineStroke");
      }
    }

    // Recurse into children
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walkAndValidate(child);
      }
    } else if (el.childNodes) {
      for (const child of el.childNodes) {
        if (child.nodeType === 1) { // Element node
          walkAndValidate(child);
        }
      }
    }
  };

  walkAndValidate(svg);

  // Add polyfill needs
  if (hasMeshGradient) polyfillsNeeded.add("meshGradient");
  if (hasHatch) polyfillsNeeded.add("hatchPaint");
  if (hasFlowText && warnFlowText) {
    addIssue(
      InkscapeValidationSeverity.WARNING,
      "flowtext_compatibility",
      "flowRoot",
      null,
      "SVG contains flowRoot elements (SVG 1.2 draft). These are not supported by browsers and should be converted to regular text."
    );
  }

  // Count issues by severity
  const summary = {
    errors: issues.filter(i => i.severity === InkscapeValidationSeverity.ERROR).length,
    warnings: issues.filter(i => i.severity === InkscapeValidationSeverity.WARNING).length,
    info: issues.filter(i => i.severity === InkscapeValidationSeverity.INFO).length,
  };

  return {
    isValid: summary.errors === 0,
    isInkscape: detection.isInkscape,
    version: detection.version,
    issues,
    summary,
    polyfillsNeeded: [...polyfillsNeeded],
    hasFlowText,
  };
}

/**
 * Get the list of polyfills needed for browser rendering.
 * @param {Object} doc - Parsed SVG document
 * @returns {{
 *   meshGradient: boolean,
 *   hatchPaint: boolean,
 *   hairlineStroke: boolean,
 *   flowText: boolean,
 *   polyfillScripts: string[]
 * }}
 */
export function getPolyfillRequirements(doc) {
  const result = {
    meshGradient: false,
    hatchPaint: false,
    hairlineStroke: false,
    flowText: false,
    polyfillScripts: [],
  };

  const svg = doc.documentElement || doc;
  if (!svg) return result;

  const walk = (el) => {
    if (!el) return;

    const tagName = (el.tagName || "").toLowerCase();

    // Check for mesh gradient elements
    if (tagName === "meshgradient" || tagName === "meshrow" || tagName === "meshpatch") {
      result.meshGradient = true;
    }

    // Check for hatch elements
    if (tagName === "hatch" || tagName === "hatchpath") {
      result.hatchPaint = true;
    }

    // Check for flowText elements
    if (FLOW_TEXT_ELEMENTS.includes(el.tagName)) {
      result.flowText = true;
    }

    // Check for hairline stroke in style
    if (typeof el.getAttribute === "function") {
      const style = el.getAttribute("style");
      if (style && style.includes("-inkscape-stroke")) {
        result.hairlineStroke = true;
      }
    }

    // Recurse
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    } else if (el.childNodes) {
      for (const child of el.childNodes) {
        if (child.nodeType === 1) walk(child);
      }
    }
  };

  walk(svg);

  // Build polyfill script list
  if (result.meshGradient) {
    result.polyfillScripts.push("inkscape-mesh-polyfill.min.js");
  }
  if (result.hatchPaint) {
    result.polyfillScripts.push("inkscape-hatch-polyfill.min.js");
  }

  return result;
}

/**
 * Inject polyfill scripts into an SVG document for browser rendering.
 * @param {Object} doc - Parsed SVG document
 * @param {Object} [options] - Options
 * @param {boolean} [options.minified=true] - Use minified polyfills
 * @param {string} [options.polyfillPath=""] - Base path for polyfill scripts
 * @returns {Object} Modified document with polyfills injected
 */
export function injectInkscapePolyfills(doc, options = {}) {
  const { minified = true, polyfillPath = "" } = options;

  const requirements = getPolyfillRequirements(doc);
  const svg = doc.documentElement || doc;

  if (!svg || typeof svg.appendChild !== "function") {
    return doc;
  }

  // Add polyfill scripts
  for (const script of requirements.polyfillScripts) {
    const scriptName = minified ? script : script.replace(".min.js", ".js");
    const scriptPath = polyfillPath ? `${polyfillPath}/${scriptName}` : scriptName;

    // Create script element - using the SVGElement class if available
    if (typeof SVGElement !== "undefined" && SVGElement.prototype) {
      const scriptEl = new SVGElement("script", {
        type: "text/javascript",
        href: scriptPath,
      }, [], "");

      // Insert at the beginning of SVG
      if (svg.children && svg.children.length > 0) {
        svg.children.unshift(scriptEl);
      } else if (svg.insertBefore) {
        svg.insertBefore(scriptEl, svg.firstChild);
      }
    }
  }

  return doc;
}
