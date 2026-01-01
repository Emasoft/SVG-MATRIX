/**
 * SVGM - Complete SVG Processing Library
 *
 * Universal library combining high-precision math (SVGMatrix) with
 * comprehensive SVG manipulation (SVGToolbox). Works in Node.js and browser.
 *
 * @module svgm-lib
 * @version 1.2.1
 * @license MIT
 *
 * @example Browser usage:
 * <script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svgm.min.js"></script>
 * <script>
 *   // Load, optimize, and save
 *   const result = await SVGM.process('#my-svg', {
 *     preset: 'default',
 *     output: '#my-svg'
 *   });
 *
 *   // Or use individual tools
 *   const { Matrix, Vector, Transforms2D } = SVGM;
 *   const { optimize, cleanupIds } = SVGM;
 * </script>
 *
 * @example ES Module usage:
 * import SVGM from '@emasoft/svg-matrix/svgm-lib';
 * // Or destructure what you need:
 * import { Matrix, Vector, optimize, loadInput, saveOutput } from '@emasoft/svg-matrix/svgm-lib';
 */

// Import core math library
import Decimal from "decimal.js";
import { Matrix } from "./matrix.js";
import { Vector } from "./vector.js";
import * as Transforms2D from "./transforms2d.js";
import * as Transforms3D from "./transforms3d.js";

// Import all SVG toolbox functions
import * as SVGToolbox from "./svg-toolbox.js";

// Import additional utilities
import * as GeometryToPath from "./geometry-to-path.js";
import * as SVGParser from "./svg-parser.js";
import * as SVG2Polyfills from "./svg2-polyfills.js";

// Set high precision
Decimal.set({ precision: 80 });

/**
 * Library version
 */
export const VERSION = "1.2.1";

// Export math classes
export { Decimal, Matrix, Vector };
export { Transforms2D, Transforms3D };
export { GeometryToPath };

// Export SVG toolbox (all functions)
export * from "./svg-toolbox.js";

// Export SVG parser
export const { parseSVG, serializeSVG } = SVGParser;

// Export polyfills
export const {
  detectSVG2Features,
  injectPolyfills,
  setPolyfillMinification,
  setPolyfillContent,
} = SVG2Polyfills;

/**
 * High-level process function - load, optimize, save in one call.
 * @param {string|Element} input - Input source (file path, URL, DOM selector, SVG string)
 * @param {Object} [options] - Processing options
 * @param {string} [options.preset='default'] - Optimization preset
 * @param {string|Element} [options.output] - Output target (file path, DOM selector, null for string)
 * @param {boolean} [options.minify=true] - Minify output
 * @param {number} [options.precision=6] - Number precision
 * @returns {Promise<string|void>} Processed SVG string if no output target, void otherwise
 */
export async function process(input, options = {}) {
  const { loadInput, saveOutput, optimize } = SVGToolbox;

  // Load input - detectInputType determines how to parse the input source
  const inputType = SVGToolbox.detectInputType(input);
  const doc = await loadInput(input, inputType);

  // Apply optimization
  const optimized = await optimize(doc, {
    precision: options.precision || 6,
    ...options,
  });

  // Save or return
  if (options.output) {
    return saveOutput(optimized, options.output, options);
  }
  return saveOutput(optimized, null, options);
}

/**
 * Default export for browser global (window.SVGM)
 */
const SVGM = {
  VERSION,
  // Math library
  Decimal,
  Matrix,
  Vector,
  Transforms2D,
  Transforms3D,
  GeometryToPath,
  // SVG Toolbox (all functions)
  ...SVGToolbox,
  // Parser
  parseSVG: SVGParser.parseSVG,
  serializeSVG: SVGParser.serializeSVG,
  // Polyfills
  detectSVG2Features: SVG2Polyfills.detectSVG2Features,
  injectPolyfills: SVG2Polyfills.injectPolyfills,
  setPolyfillMinification: SVG2Polyfills.setPolyfillMinification,
  setPolyfillContent: SVG2Polyfills.setPolyfillContent,
  // High-level API
  process,
};

export default SVGM;

// Browser global assignment
if (typeof window !== "undefined") {
  window.SVGM = SVGM;
}
