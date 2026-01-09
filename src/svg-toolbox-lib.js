/**
 * SVG-Toolbox - Universal SVG Manipulation Library
 *
 * Complete SVG processing toolkit that works in both Node.js and browser.
 * Provides 69+ operations for cleaning, optimizing, and transforming SVG files.
 *
 * @module svg-toolbox-lib
 * @version 1.3.1
 * @license MIT
 *
 * @example Browser usage:
 * <script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-toolbox.min.js"></script>
 * <script>
 *   // Load from DOM element
 *   const svg = await SVGToolbox.loadInput('#my-svg');
 *
 *   // Apply optimizations
 *   const optimized = await SVGToolbox.optimize(svg);
 *
 *   // Save back to DOM or get string
 *   await SVGToolbox.saveOutput(optimized, '#my-svg');
 * </script>
 *
 * @example ES Module usage:
 * import { loadInput, saveOutput, optimize, cleanupIds } from '@emasoft/svg-matrix/svg-toolbox-lib';
 */

// Re-export everything from svg-toolbox.js
export * from "./svg-toolbox.js";

// Import for default export
import * as SVGToolboxModule from "./svg-toolbox.js";

/**
 * Library version
 */
export const VERSION = "1.3.1";

/**
 * Default export for browser global (window.SVGToolbox)
 */
const SVGToolbox = {
  VERSION,
  ...SVGToolboxModule,
};

export default SVGToolbox;

// Browser global assignment
if (typeof window !== "undefined") {
  window.SVGToolbox = SVGToolbox;
}
