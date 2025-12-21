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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load Inkscape polyfills at module initialization (minified + full versions)
let INKSCAPE_MESH_POLYFILL_MIN = '';
let INKSCAPE_MESH_POLYFILL_FULL = '';
let INKSCAPE_HATCH_POLYFILL_MIN = '';
let INKSCAPE_HATCH_POLYFILL_FULL = '';

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Load mesh gradient polyfills (GPLv3 by Tavmjong Bah)
  // Minified version (default, ~16KB)
  INKSCAPE_MESH_POLYFILL_MIN = readFileSync(
    join(__dirname, 'vendor', 'inkscape-mesh-polyfill.min.js'),
    'utf-8'
  );
  // Full version (~35KB, for debugging or when --no-minify-polyfills is used)
  INKSCAPE_MESH_POLYFILL_FULL = readFileSync(
    join(__dirname, 'vendor', 'inkscape-mesh-polyfill.js'),
    'utf-8'
  );

  // Load hatch polyfills (CC0/Public Domain by Valentin Ionita)
  // Minified version (default, ~5KB)
  INKSCAPE_HATCH_POLYFILL_MIN = readFileSync(
    join(__dirname, 'vendor', 'inkscape-hatch-polyfill.min.js'),
    'utf-8'
  );
  // Full version (~10KB, for debugging)
  INKSCAPE_HATCH_POLYFILL_FULL = readFileSync(
    join(__dirname, 'vendor', 'inkscape-hatch-polyfill.js'),
    'utf-8'
  );
} catch (e) {
  throw new Error(`Failed to load SVG2 polyfill files from vendor/ directory: ${e.message}. Ensure all vendor files are present.`);
}

// Module-level option for minification (default: true)
let useMinifiedPolyfills = true;

/**
 * Set whether to use minified polyfills.
 * @param {boolean} minify - True to use minified (default), false for full version
 */
export function setPolyfillMinification(minify) {
  useMinifiedPolyfills = minify;
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
  if (!doc) return { meshGradients: [], hatches: [], contextPaint: false, autoStartReverse: false };

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
      if (id) features.meshGradients.push(id);
    }

    // Check for hatch element
    if (tagName === 'hatch') {
      const id = el.getAttribute('id');
      if (id) features.hatches.push(id);
    }

    // Check for context-paint in fill/stroke
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    if (fill === 'context-fill' || fill === 'context-stroke' ||
        stroke === 'context-fill' || stroke === 'context-stroke') {
      features.contextPaint = true;
    }

    // Check for auto-start-reverse in markers
    const orient = el.getAttribute('orient');
    if (orient === 'auto-start-reverse') {
      features.autoStartReverse = true;
    }

    // Recurse into children
    if (el.children) {
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
  if (polyfill) {
    return polyfill;
  }
  // Fallback: return empty string if polyfill couldn't be loaded
  console.warn('svg2-polyfills: Inkscape mesh polyfill not available');
  return '';
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
  if (polyfill) {
    return polyfill;
  }
  // Fallback: return empty string if polyfill couldn't be loaded
  console.warn('svg2-polyfills: Inkscape hatch polyfill not available');
  return '';
}

/**
 * Generate complete polyfill script based on detected features.
 *
 * @param {{meshGradients: string[], hatches: string[], contextPaint: boolean, autoStartReverse: boolean}} features - Detected features
 * @returns {string|null} Complete polyfill script or null if none needed
 */
export function generatePolyfillScript(features) {
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

  // Create a proper SVGElement for the script
  // The script content uses CDATA to avoid XML escaping issues
  const scriptEl = new SVGElement('script', {
    type: 'text/javascript',
    id: 'svg-matrix-polyfill'
  }, [], script);

  // Insert script at beginning of SVG (after defs if present, else at start)
  if (svg.children && svg.children.length > 0) {
    // Find first non-defs element to insert before
    let insertIdx = 0;
    for (let i = 0; i < svg.children.length; i++) {
      if (svg.children[i].tagName === 'defs') {
        insertIdx = i + 1;
        break;
      }
    }
    svg.children.splice(insertIdx, 0, scriptEl);
  } else if (svg.children) {
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
    if (!el || !el.children) return;

    // Remove script elements that are svg-matrix polyfills
    el.children = el.children.filter(child => {
      if (child.tagName === 'script') {
        const content = child.textContent || '';
        if (content.includes('SVG 2.0 Polyfill') ||
            content.includes('Generated by svg-matrix')) {
          return false;
        }
      }
      return true;
    });

    // Recurse
    for (const child of el.children) {
      walk(child);
    }
  };

  walk(doc);
  return doc;
}
