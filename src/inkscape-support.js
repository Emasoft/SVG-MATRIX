/**
 * Inkscape/Sodipodi Support Module
 *
 * Provides utilities for preserving and manipulating Inkscape-specific SVG features
 * including layers, guides, document settings, and arc parameters.
 *
 * @module inkscape-support
 */

// Inkscape namespace URIs
export const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';
export const SODIPODI_NS = 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd';

// Inkscape-specific element and attribute prefixes
export const INKSCAPE_PREFIXES = ['inkscape', 'sodipodi'];

/**
 * Check if an element is an Inkscape layer.
 * Inkscape uses `<g inkscape:groupmode="layer">` for layers.
 *
 * @param {Object} element - SVG element to check
 * @returns {boolean} True if the element is an Inkscape layer
 */
export function isInkscapeLayer(element) {
  if (!element || element.tagName !== 'g') return false;
  return element.getAttribute('inkscape:groupmode') === 'layer';
}

/**
 * Get the label of an Inkscape layer.
 *
 * @param {Object} element - Inkscape layer element
 * @returns {string|null} Layer label or null if not set
 */
export function getLayerLabel(element) {
  return element?.getAttribute('inkscape:label') || null;
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
        id: el.getAttribute('id')
      });
    }
    for (const child of el.children) {
      walk(child);
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
  // Find namedview element - may be direct child or nested
  let namedview = null;

  const findNamedview = (el) => {
    if (!el) return;
    if (el.tagName === 'sodipodi:namedview') {
      namedview = el;
      return;
    }
    if (el.children) {
      for (const child of el.children) {
        findNamedview(child);
        if (namedview) return;
      }
    }
  };

  findNamedview(doc);
  if (!namedview) return null;

  return {
    pagecolor: namedview.getAttribute('pagecolor'),
    bordercolor: namedview.getAttribute('bordercolor'),
    borderopacity: namedview.getAttribute('borderopacity'),
    showgrid: namedview.getAttribute('showgrid'),
    showguides: namedview.getAttribute('showguides'),
    guidetolerance: namedview.getAttribute('guidetolerance'),
    inkscapeZoom: namedview.getAttribute('inkscape:zoom'),
    inkscapeCx: namedview.getAttribute('inkscape:cx'),
    inkscapeCy: namedview.getAttribute('inkscape:cy'),
    inkscapeWindowWidth: namedview.getAttribute('inkscape:window-width'),
    inkscapeWindowHeight: namedview.getAttribute('inkscape:window-height'),
    inkscapeCurrentLayer: namedview.getAttribute('inkscape:current-layer')
  };
}

/**
 * Find all sodipodi:guide elements (guidelines).
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Array<{position: string, orientation: string, id: string|null}>} Array of guide info
 */
export function findGuides(doc) {
  const guides = [];

  const walk = (el) => {
    if (!el || !el.children) return;
    if (el.tagName === 'sodipodi:guide') {
      guides.push({
        position: el.getAttribute('position'),
        orientation: el.getAttribute('orientation'),
        id: el.getAttribute('id'),
        inkscapeColor: el.getAttribute('inkscape:color'),
        inkscapeLabel: el.getAttribute('inkscape:label')
      });
    }
    for (const child of el.children) {
      walk(child);
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
  if (!element) return null;

  const type = element.getAttribute('sodipodi:type');
  if (type !== 'arc') return null;

  return {
    type: 'arc',
    cx: element.getAttribute('sodipodi:cx'),
    cy: element.getAttribute('sodipodi:cy'),
    rx: element.getAttribute('sodipodi:rx'),
    ry: element.getAttribute('sodipodi:ry'),
    start: element.getAttribute('sodipodi:start'),
    end: element.getAttribute('sodipodi:end'),
    open: element.getAttribute('sodipodi:open')
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
  return element?.getAttribute('sodipodi:nodetypes') || null;
}

/**
 * Get export settings from an element.
 *
 * @param {Object} element - SVG element
 * @returns {Object|null} Export settings or null if not set
 */
export function getExportSettings(element) {
  if (!element) return null;

  const filename = element.getAttribute('inkscape:export-filename');
  const xdpi = element.getAttribute('inkscape:export-xdpi');
  const ydpi = element.getAttribute('inkscape:export-ydpi');

  if (!filename && !xdpi && !ydpi) return null;

  return {
    filename,
    xdpi: xdpi ? parseFloat(xdpi) : null,
    ydpi: ydpi ? parseFloat(ydpi) : null
  };
}

/**
 * Check if element is part of a tiled clone.
 *
 * @param {Object} element - SVG element
 * @returns {boolean} True if element is a tiled clone
 */
export function isTiledClone(element) {
  return element?.hasAttribute('inkscape:tiled-clone-of') || false;
}

/**
 * Get tiled clone source ID.
 *
 * @param {Object} element - SVG element
 * @returns {string|null} Source element ID or null
 */
export function getTiledCloneSource(element) {
  return element?.getAttribute('inkscape:tiled-clone-of') || null;
}

/**
 * Check if document has Inkscape namespaces declared.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {boolean} True if Inkscape namespaces are present
 */
export function hasInkscapeNamespaces(doc) {
  const svg = doc.documentElement || doc;
  const hasInkscape = svg.getAttribute('xmlns:inkscape') === INKSCAPE_NS;
  const hasSodipodi = svg.getAttribute('xmlns:sodipodi') === SODIPODI_NS;
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
  const svg = doc.documentElement || doc;

  if (!svg.getAttribute('xmlns:inkscape')) {
    svg.setAttribute('xmlns:inkscape', INKSCAPE_NS);
  }
  if (!svg.getAttribute('xmlns:sodipodi')) {
    svg.setAttribute('xmlns:sodipodi', SODIPODI_NS);
  }

  return doc;
}
