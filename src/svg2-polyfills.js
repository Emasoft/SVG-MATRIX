/**
 * SVG 2.0 Polyfill Generator
 *
 * Detects SVG 2.0 features (mesh gradients, hatches) and generates inline
 * JavaScript polyfills for browser compatibility.
 *
 * Uses the Inkscape mesh.js polyfill by Tavmjong Bah for mesh gradient support.
 * The mesh polyfill is licensed under GPLv3 - see src/vendor/inkscape-mesh-polyfill.js
 * Hatch polyfills use a simplified MIT-licensed implementation.
 *
 * All polyfills are embedded inline in the SVG for self-contained output.
 *
 * @module svg2-polyfills
 */

import { SVGElement } from './svg-parser.js';

// Environment detection
const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;
const IS_BROWSER = typeof window !== 'undefined';

// Load Inkscape polyfills at module initialization (minified + full versions)
let INKSCAPE_MESH_POLYFILL_MIN = '';
let INKSCAPE_MESH_POLYFILL_FULL = '';
let INKSCAPE_HATCH_POLYFILL_MIN = '';
let INKSCAPE_HATCH_POLYFILL_FULL = '';

// In Node.js, load polyfills from filesystem
if (IS_NODE) {
  try {
    // Dynamic imports for Node.js-only modules
    const fs = await import('fs');
    const url = await import('url');
    const path = await import('path');

    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Load mesh gradient polyfills (GPLv3 by Tavmjong Bah)
    // Minified version (default, ~16KB)
    INKSCAPE_MESH_POLYFILL_MIN = fs.readFileSync(
      path.join(__dirname, 'vendor', 'inkscape-mesh-polyfill.min.js'),
      'utf-8'
    );
    // Full version (~35KB, for debugging or when --no-minify-polyfills is used)
    INKSCAPE_MESH_POLYFILL_FULL = fs.readFileSync(
      path.join(__dirname, 'vendor', 'inkscape-mesh-polyfill.js'),
      'utf-8'
    );

    // Load hatch polyfills (CC0/Public Domain by Valentin Ionita)
    // Minified version (default, ~5KB)
    INKSCAPE_HATCH_POLYFILL_MIN = fs.readFileSync(
      path.join(__dirname, 'vendor', 'inkscape-hatch-polyfill.min.js'),
      'utf-8'
    );
    // Full version (~10KB, for debugging)
    INKSCAPE_HATCH_POLYFILL_FULL = fs.readFileSync(
      path.join(__dirname, 'vendor', 'inkscape-hatch-polyfill.js'),
      'utf-8'
    );
  } catch (e) {
    throw new Error(`Failed to load SVG2 polyfill files from vendor/ directory: ${e.message}. Ensure all vendor files are present.`);
  }
} else if (IS_BROWSER) {
  // In browser, polyfills must be set via setPolyfillContent() or loaded separately
  console.warn('SVG2 polyfills: Running in browser mode. Use setPolyfillContent() to provide polyfill scripts.');
}

// Module-level option for minification (default: true)
let useMinifiedPolyfills = true;

/**
 * Set whether to use minified polyfills.
 * @param {boolean} minify - True to use minified (default), false for full version
 */
export function setPolyfillMinification(minify) {
  if (typeof minify !== 'boolean') {
    throw new Error('setPolyfillMinification: minify parameter must be a boolean');
  }
  useMinifiedPolyfills = minify;
}

/**
 * Set polyfill content programmatically (for browser environments).
 * @param {Object} polyfills - Object with polyfill content
 * @param {string} [polyfills.meshMin] - Minified mesh gradient polyfill
 * @param {string} [polyfills.meshFull] - Full mesh gradient polyfill
 * @param {string} [polyfills.hatchMin] - Minified hatch polyfill
 * @param {string} [polyfills.hatchFull] - Full hatch polyfill
 */
export function setPolyfillContent(polyfills) {
  if (polyfills.meshMin) INKSCAPE_MESH_POLYFILL_MIN = polyfills.meshMin;
  if (polyfills.meshFull) INKSCAPE_MESH_POLYFILL_FULL = polyfills.meshFull;
  if (polyfills.hatchMin) INKSCAPE_HATCH_POLYFILL_MIN = polyfills.hatchMin;
  if (polyfills.hatchFull) INKSCAPE_HATCH_POLYFILL_FULL = polyfills.hatchFull;
}

/**
 * SVG 2.0 features that can be polyfilled
 */
export const SVG2_FEATURES = {
  MESH_GRADIENT: 'meshGradient',
  HATCH: 'hatch',
  CONTEXT_PAINT: 'context-paint',
  AUTO_START_REVERSE: 'auto-start-reverse'
};

/**
 * Detect SVG 2.0 features that need polyfills in a document.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {{meshGradients: string[], hatches: string[], contextPaint: boolean, autoStartReverse: boolean}} Detected features
 */
export function detectSVG2Features(doc) {
  // WHY: Validate doc is an object before attempting to traverse it
  if (!doc || typeof doc !== 'object') {
    return { meshGradients: [], hatches: [], contextPaint: false, autoStartReverse: false };
  }

  const features = {
    meshGradients: [],
    hatches: [],
    contextPaint: false,
    autoStartReverse: false
  };

  const walk = (el) => {
    if (!el) return;

    // Check tag name for mesh gradient (case-insensitive)
    const tagName = el.tagName?.toLowerCase();
    if (tagName === 'meshgradient') {
      const id = el.getAttribute('id');
      // WHY: Validate ID is non-empty string and not already in array to prevent duplicates
      if (id && typeof id === 'string' && id.trim() && !features.meshGradients.includes(id)) {
        features.meshGradients.push(id);
      }
    }

    // Check for hatch element
    if (tagName === 'hatch') {
      const id = el.getAttribute('id');
      // WHY: Validate ID is non-empty string and not already in array to prevent duplicates
      if (id && typeof id === 'string' && id.trim() && !features.hatches.includes(id)) {
        features.hatches.push(id);
      }
    }

    // Check for context-paint in fill/stroke attributes and style attribute
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    const style = el.getAttribute('style');
    // WHY: context-paint can appear in style attribute, not just fill/stroke attributes
    if (fill === 'context-fill' || fill === 'context-stroke' ||
        stroke === 'context-fill' || stroke === 'context-stroke' ||
        (style && (style.includes('context-fill') || style.includes('context-stroke')))) {
      features.contextPaint = true;
    }

    // WHY: Check <style> elements for context-paint in CSS rules
    if (tagName === 'style' && el.textContent) {
      if (el.textContent.includes('context-fill') || el.textContent.includes('context-stroke')) {
        features.contextPaint = true;
      }
    }

    // Check for auto-start-reverse in markers
    const orient = el.getAttribute('orient');
    if (orient === 'auto-start-reverse') {
      features.autoStartReverse = true;
    }

    // Recurse into children
    if (el.children && Array.isArray(el.children)) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(doc);
  return features;
}

/**
 * Check if document needs any SVG 2 polyfills.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {boolean} True if polyfills are needed
 */
export function needsPolyfills(doc) {
  if (!doc) return false;

  const features = detectSVG2Features(doc);
  return features.meshGradients.length > 0 ||
         features.hatches.length > 0 ||
         features.contextPaint ||
         features.autoStartReverse;
}

/**
 * Generate the mesh gradient polyfill code.
 * Uses the Inkscape mesh.js polyfill by Tavmjong Bah (GPLv3).
 * This polyfill renders mesh gradients to canvas and uses them as image fills.
 *
 * Features:
 * - Multi-patch grid support
 * - Bezier curve edge parsing (l, L, c, C commands)
 * - Adaptive tessellation via de Casteljau subdivision
 * - gradientTransform support
 * - Proper shape clipping
 *
 * @returns {string} JavaScript polyfill code
 */
function generateMeshPolyfillCode() {
  // Return minified or full Inkscape mesh.js polyfill based on setting
  const polyfill = useMinifiedPolyfills ? INKSCAPE_MESH_POLYFILL_MIN : INKSCAPE_MESH_POLYFILL_FULL;
  // WHY: Throw error instead of silently returning empty string to prevent broken SVG output
  if (!polyfill || polyfill.trim() === '') {
    throw new Error('svg2-polyfills: Inkscape mesh polyfill not available. Ensure vendor/inkscape-mesh-polyfill files are present.');
  }
  return polyfill;
}

/**
 * Generate the hatch pattern polyfill code.
 * Uses the Inkscape hatch polyfill by Valentin Ionita (CC0/Public Domain).
 * Converts SVG 2 hatch elements to SVG 1.1 pattern elements.
 *
 * Features:
 * - Full SVG path command support (M, L, C, S, Q, A, etc.)
 * - Proper coordinate system handling (objectBoundingBox, userSpaceOnUse)
 * - Hatch rotation and transform support
 * - Multiple hatchpath elements with offset values
 *
 * @returns {string} JavaScript polyfill code
 */
function generateHatchPolyfillCode() {
  // Return minified or full Inkscape hatch polyfill based on setting
  const polyfill = useMinifiedPolyfills ? INKSCAPE_HATCH_POLYFILL_MIN : INKSCAPE_HATCH_POLYFILL_FULL;
  // WHY: Throw error instead of silently returning empty string to prevent broken SVG output
  if (!polyfill || polyfill.trim() === '') {
    throw new Error('svg2-polyfills: Inkscape hatch polyfill not available. Ensure vendor/inkscape-hatch-polyfill files are present.');
  }
  return polyfill;
}

/**
 * Generate complete polyfill script based on detected features.
 *
 * @param {{meshGradients: string[], hatches: string[], contextPaint: boolean, autoStartReverse: boolean}} features - Detected features
 * @returns {string|null} Complete polyfill script or null if none needed
 */
export function generatePolyfillScript(features) {
  // WHY: Explicit null check before typeof check prevents null passing as object
  if (!features || typeof features !== 'object') {
    throw new Error('generatePolyfillScript: features parameter must be an object');
  }
  if (!Array.isArray(features.meshGradients)) {
    throw new Error('generatePolyfillScript: features.meshGradients must be an array');
  }
  if (!Array.isArray(features.hatches)) {
    throw new Error('generatePolyfillScript: features.hatches must be an array');
  }
  // WHY: Validate array contents are all strings to prevent type errors
  if (!features.meshGradients.every(id => typeof id === 'string')) {
    throw new Error('generatePolyfillScript: features.meshGradients must contain only strings');
  }
  if (!features.hatches.every(id => typeof id === 'string')) {
    throw new Error('generatePolyfillScript: features.hatches must contain only strings');
  }
  // WHY: Validate boolean properties to prevent undefined/wrong type usage
  if (typeof features.contextPaint !== 'boolean') {
    throw new Error('generatePolyfillScript: features.contextPaint must be a boolean');
  }
  if (typeof features.autoStartReverse !== 'boolean') {
    throw new Error('generatePolyfillScript: features.autoStartReverse must be a boolean');
  }

  const parts = [];

  parts.push('/* SVG 2.0 Polyfills - Generated by svg-matrix */');

  if (features.meshGradients.length > 0) {
    parts.push(generateMeshPolyfillCode());
  }

  if (features.hatches.length > 0) {
    parts.push(generateHatchPolyfillCode());
  }

  if (parts.length === 1) {
    return null; // Only header, no actual polyfills
  }

  return parts.join('\n');
}

/**
 * Inject polyfill script into SVG document.
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} [options] - Options
 * @param {boolean} [options.force=false] - Force injection even if no features detected
 * @param {Object} [options.features] - Pre-detected features (use instead of re-detecting)
 * @returns {Object} The document (modified in place)
 */
export function injectPolyfills(doc, options = {}) {
  if (!doc) return doc;

  // Use pre-detected features if provided (for when pipeline has removed SVG2 elements)
  const features = options.features || detectSVG2Features(doc);

  // Check if polyfills are needed
  if (!options.force &&
      features.meshGradients.length === 0 &&
      features.hatches.length === 0) {
    return doc;
  }

  const script = generatePolyfillScript(features);
  if (!script) return doc;

  // Find or create the SVG root
  const svg = doc.documentElement || doc;

  // WHY: Wrap script in CDATA to prevent XML parsing issues with special characters
  // CDATA prevents < > & from being interpreted as XML, which breaks JavaScript
  const wrappedScript = `\n// <![CDATA[\n${script}\n// ]]>\n`;

  // Create a proper SVGElement for the script
  const scriptEl = new SVGElement('script', {
    type: 'text/javascript',
    id: 'svg-matrix-polyfill'
  }, [], wrappedScript);

  // Insert script at beginning of SVG (after defs if present, else at start)
  if (!Array.isArray(svg.children)) {
    // Initialize children array if missing
    svg.children = [];
  }

  if (svg.children.length > 0) {
    // Find position after the last defs element to insert the script
    let insertIdx = 0;
    for (let i = 0; i < svg.children.length; i++) {
      // WHY: Optional chaining prevents errors if array contains null/undefined elements
      if (svg.children[i]?.tagName === 'defs') {
        insertIdx = i + 1; // Position after this defs (don't break - continue to find last defs)
      }
    }
    svg.children.splice(insertIdx, 0, scriptEl);
  } else {
    svg.children.push(scriptEl);
  }

  return doc;
}

/**
 * Remove polyfill scripts from SVG document.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {Object} The document (modified in place)
 */
export function removePolyfills(doc) {
  if (!doc) return doc;

  const walk = (el) => {
    if (!el || !el.children || !Array.isArray(el.children)) return;

    // Remove script elements that are svg-matrix polyfills
    el.children = el.children.filter(child => {
      // WHY: Optional chaining prevents errors if child is null/undefined
      if (child?.tagName === 'script') {
        // WHY: Check id attribute first (more reliable), then fallback to content check
        const id = child.getAttribute?.('id');
        if (id === 'svg-matrix-polyfill') {
          return false;
        }
        // WHY: Fallback for older polyfills without id attribute
        const content = child.textContent || '';
        if (content.includes('SVG 2.0 Polyfills - Generated by svg-matrix')) {
          return false;
        }
      }
      return true;
    });

    // Recurse - filter out null/undefined before recursing
    for (const child of el.children) {
      if (child) walk(child);
    }
  };

  walk(doc);
  return doc;
}
