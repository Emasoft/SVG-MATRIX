/**
 * Flatten Pipeline - Comprehensive SVG flattening with all transform dependencies resolved
 *
 * A TRUE flattened SVG has:
 * - NO transform attributes anywhere
 * - NO clipPath references (boolean operations pre-applied)
 * - NO mask references (converted to clipped geometry)
 * - NO use/symbol references (instances pre-expanded)
 * - NO pattern fill references (patterns pre-tiled)
 * - NO marker references (markers pre-instantiated)
 * - NO gradient transforms (gradientTransform pre-baked)
 *
 * @module flatten-pipeline
 */

import Decimal from "decimal.js";
import * as Transforms2D from "./transforms2d.js";
import * as SVGFlatten from "./svg-flatten.js";
import * as ClipPathResolver from "./clip-path-resolver.js";
import * as MaskResolver from "./mask-resolver.js";
import * as UseSymbolResolver from "./use-symbol-resolver.js";
import * as PatternResolver from "./pattern-resolver.js";
import * as MarkerResolver from "./marker-resolver.js";
import * as GeometryToPath from "./geometry-to-path.js";
import {
  parseSVG,
  SVGElement,
  buildDefsMap,
  parseUrlReference,
  serializeSVG,
  findElementsWithAttribute,
} from "./svg-parser.js";
import * as Verification from "./verification.js";
import { parseCSSIds } from "./animation-references.js";
import * as PolygonClip from "./polygon-clip.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Default options for flatten pipeline.
 */
const DEFAULT_OPTIONS = {
  precision: 6, // Decimal places in output coordinates
  curveSegments: 20, // Samples per curve for polygon conversion (visual output)
  clipSegments: 64, // Higher samples for clip polygon accuracy (affects E2E precision)
  bezierArcs: 8, // Bezier arcs for circles/ellipses (must be multiple of 4)
  // 8: π/4 optimal base (~0.0004% error)
  // 16: π/8 (~0.000007% error), 32: π/16, 64: π/32 (~0.00000001% error)
  resolveUse: true, // Expand <use> elements
  resolveMarkers: true, // Expand marker instances
  resolvePatterns: true, // Expand pattern fills to geometry
  resolveMasks: true, // Convert masks to clip paths
  resolveClipPaths: true, // Apply clipPath boolean operations
  flattenTransforms: true, // Bake transform attributes into coordinates
  bakeGradients: true, // Bake gradientTransform into gradient coords
  removeUnusedDefs: true, // Remove defs that are no longer referenced
  preserveIds: false, // Keep original IDs on expanded elements
  svg2Polyfills: false, // Apply SVG 2.0 polyfills for backwards compatibility (not yet implemented)
  // NOTE: Verification is ALWAYS enabled - precision is non-negotiable
  // E2E verification tolerance (configurable for different accuracy needs)
  e2eTolerance: "1e-10", // Default: 1e-10 (very tight with high clipSegments)
};

/**
 * Flatten an SVG string completely - no transform dependencies remain.
 *
 * @param {string} svgString - Raw SVG content
 * @param {Object} [options] - Pipeline options
 * @param {number} [options.precision=6] - Decimal places in output
 * @param {number} [options.curveSegments=20] - Samples per curve
 * @param {boolean} [options.resolveUse=true] - Expand use elements
 * @param {boolean} [options.resolveMarkers=true] - Expand markers
 * @param {boolean} [options.resolvePatterns=true] - Expand patterns
 * @param {boolean} [options.resolveMasks=true] - Convert masks to clips
 * @param {boolean} [options.resolveClipPaths=true] - Apply clipPath booleans
 * @param {boolean} [options.flattenTransforms=true] - Bake transforms
 * @param {boolean} [options.bakeGradients=true] - Bake gradient transforms
 * @param {boolean} [options.removeUnusedDefs=true] - Clean up defs
 * @returns {{svg: string, stats: Object}} Flattened SVG and statistics
 */
export function flattenSVG(svgString, options = {}) {
  // Validate required parameters
  if (svgString === null || svgString === undefined) {
    throw new Error("flattenSVG: svgString parameter is required");
  }
  if (typeof svgString !== "string") {
    throw new Error(
      `flattenSVG: svgString must be a string, got ${typeof svgString}`,
    );
  }
  if (svgString.trim().length === 0) {
    throw new Error("flattenSVG: svgString cannot be empty");
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const stats = {
    useResolved: 0,
    markersResolved: 0,
    patternsResolved: 0,
    masksResolved: 0,
    clipPathsApplied: 0,
    transformsFlattened: 0,
    gradientsProcessed: 0,
    defsRemoved: 0,
    errors: [],
    // Verification results - ALWAYS enabled (precision is non-negotiable)
    verifications: {
      transforms: [],
      matrices: [],
      polygons: [],
      gradients: [],
      e2e: [], // End-to-end verification: area conservation, union reconstruction
      passed: 0,
      failed: 0,
      allPassed: true,
    },
    // Store outside fragments from clipping for potential reconstruction
    clipOutsideFragments: [],
  };

  try {
    // Parse SVG
    const root = parseSVG(svgString);
    if (root.tagName.toLowerCase() !== "svg") {
      throw new Error("Root element must be <svg>");
    }

    // Build defs map
    let defsMap = buildDefsMap(root);

    // CRITICAL: Collect all ID references BEFORE any processing
    // This ensures we don't remove defs that were referenced before resolution
    const referencedIds = opts.removeUnusedDefs
      ? collectAllReferences(root)
      : null;

    // Step 1: Resolve <use> elements (must be first - creates new geometry)
    if (opts.resolveUse) {
      const result = resolveAllUseElements(root, defsMap, opts);
      stats.useResolved = result.count;
      stats.errors.push(...result.errors);
      defsMap = buildDefsMap(root); // Rebuild after modifications
    }

    // Step 2: Resolve markers (adds geometry to paths)
    if (opts.resolveMarkers) {
      const result = resolveAllMarkers(root, defsMap, opts);
      stats.markersResolved = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 3: Resolve patterns (expand pattern fills)
    if (opts.resolvePatterns) {
      const result = resolveAllPatterns(root, defsMap, opts);
      stats.patternsResolved = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 4: Resolve masks (convert to clip geometry)
    if (opts.resolveMasks) {
      const result = resolveAllMasks(root, defsMap, opts);
      stats.masksResolved = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 5: Apply clipPaths (boolean intersection)
    if (opts.resolveClipPaths) {
      const result = applyAllClipPaths(root, defsMap, opts, stats);
      stats.clipPathsApplied = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 6: Flatten transforms (bake into coordinates)
    if (opts.flattenTransforms) {
      const result = flattenAllTransforms(root, opts, stats);
      stats.transformsFlattened = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 7: Bake gradient transforms
    if (opts.bakeGradients) {
      const result = bakeAllGradientTransforms(root, opts, stats);
      stats.gradientsProcessed = result.count;
      stats.errors.push(...result.errors);
    }

    // Step 8: Remove unused defs (using pre-collected references from before processing)
    if (opts.removeUnusedDefs && referencedIds) {
      const result = removeUnusedDefinitions(root, referencedIds);
      stats.defsRemoved = result.count;
    }

    // Serialize back to SVG
    const svg = serializeSVG(root);

    return { svg, stats };
  } catch (error) {
    stats.errors.push(`Pipeline error: ${error.message}`);
    return { svg: svgString, stats }; // Return original on failure
  }
}

// ============================================================================
// STEP 1: RESOLVE USE ELEMENTS
// ============================================================================

/**
 * Resolve all <use> elements by expanding them inline.
 * Converts use references to concrete geometry or cloned elements with transforms.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Map<string, SVGElement>} defsMap - Map of definition IDs to elements
 * @param {Object} opts - Processing options
 * @returns {{count: number, errors: Array<string>}} Resolution results
 * @private
 */
/**
 * SMIL animation element names that must be preserved during use resolution.
 * Converting these to paths would destroy the animation functionality.
 */
// IMPORTANT: Use lowercase for case-insensitive matching with tagName.toLowerCase()
const SMIL_ANIMATION_ELEMENTS = new Set([
  "animate",
  "animatetransform",
  "animatemotion",
  "animatecolor",
  "set",
]);

/**
 * Elements that must be preserved during flattening (not converted to paths).
 * These elements contain content that cannot be represented as path data.
 * IMPORTANT: Use lowercase for case-insensitive matching with tagName.toLowerCase()
 */
const PRESERVE_ELEMENTS = new Set([
  "foreignobject",
  "audio",
  "video",
  "iframe",
  "script",
  "style",
  ...SMIL_ANIMATION_ELEMENTS,
]);

/**
 * Check if an element or any of its descendants contains elements that must be preserved.
 *
 * @param {SVGElement} el - Element to check
 * @returns {boolean} True if element or descendants contain preserve elements
 * @private
 */
function containsPreserveElements(el) {
  if (!el) return false;

  const tagName = el.tagName?.toLowerCase();
  if (PRESERVE_ELEMENTS.has(tagName)) {
    return true;
  }

  // Check children recursively (use tagName check instead of instanceof)
  for (const child of el.children || []) {
    if (child && child.tagName && containsPreserveElements(child)) {
      return true;
    }
  }

  return false;
}

function resolveAllUseElements(root, defsMap, opts) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("resolveAllUseElements: invalid root element");
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("resolveAllUseElements: defsMap must be a Map");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("resolveAllUseElements: opts must be an object");
  }

  const errors = [];
  let count = 0;

  const useElements = root.getElementsByTagName("use");

  // Convert defsMap from Map<id, SVGElement> to {id: parsedData} format
  // that UseSymbolResolver.resolveUse() expects (objects with .type property)
  const parsedDefs = {};
  for (const [id, el] of defsMap.entries()) {
    const tagName = el.tagName.toLowerCase();
    if (tagName === "symbol") {
      parsedDefs[id] = UseSymbolResolver.parseSymbolElement(el);
      parsedDefs[id].type = "symbol";
    } else {
      parsedDefs[id] = UseSymbolResolver.parseChildElement(el);
    }
  }

  for (const useEl of [...useElements]) {
    // Clone array since we modify DOM
    try {
      const href =
        useEl.getAttribute("href") || useEl.getAttribute("xlink:href");
      if (!href) continue;

      const refId = href.replace(/^#/, "");
      const refEl = defsMap.get(refId);

      if (!refEl) {
        errors.push(`use: referenced element #${refId} not found`);
        continue;
      }

      // CRITICAL: Check if referenced element OR the use element itself contains SMIL animations
      // In SVG, animations can be children of <use> elements (animate the use instance)
      // If so, we must clone instead of converting to path to preserve functionality
      const refHasPreserve = containsPreserveElements(refEl);
      const useHasPreserve = containsPreserveElements(useEl);

      if (refHasPreserve || useHasPreserve) {
        // Clone the referenced element with all children (preserves animations)
        const clonedEl = refEl.cloneNode(true);

        // Get use element positioning and transform
        const useX = parseFloat(useEl.getAttribute("x") || "0");
        const useY = parseFloat(useEl.getAttribute("y") || "0");
        // Validate parseFloat results to prevent NaN propagation
        if (isNaN(useX) || isNaN(useY)) {
          errors.push(`use: invalid x/y coordinates for element #${refId}`);
          continue;
        }
        const useTransform = useEl.getAttribute("transform") || "";

        // Build combined transform: use transform + translation from x/y
        let combinedTransform = "";
        if (useTransform) {
          combinedTransform = useTransform;
        }
        if (useX !== 0 || useY !== 0) {
          const translatePart = `translate(${useX}, ${useY})`;
          combinedTransform = combinedTransform
            ? `${combinedTransform} ${translatePart}`
            : translatePart;
        }

        // Create a group to wrap the cloned content with the transform
        const wrapperGroup = new SVGElement("g", {});
        if (combinedTransform) {
          wrapperGroup.setAttribute("transform", combinedTransform);
        }

        // Copy presentation attributes from use element to wrapper
        const presentationAttrs = extractPresentationAttrs(useEl);
        for (const [key, val] of Object.entries(presentationAttrs)) {
          if (val && !wrapperGroup.hasAttribute(key)) {
            wrapperGroup.setAttribute(key, val);
          }
        }

        // Handle symbol vs regular element
        const refTagName = refEl.tagName.toLowerCase();
        if (refTagName === "symbol") {
          // For symbols, add all children to the wrapper (skip the symbol wrapper)
          // Use tagName check instead of instanceof since cloneNode may not preserve class type
          for (const child of clonedEl.children || []) {
            if (child && child.tagName) {
              wrapperGroup.appendChild(child.cloneNode(true));
            }
          }
        } else {
          // For regular elements, add the cloned element
          // Remove the ID to avoid duplicates
          clonedEl.removeAttribute("id");
          wrapperGroup.appendChild(clonedEl);
        }

        // CRITICAL: Also preserve animation children from the use element itself
        // SMIL animations can be direct children of <use> to animate the instance
        for (const child of useEl.children || []) {
          if (child && child.tagName) {
            const childTagName = child.tagName.toLowerCase();
            if (SMIL_ANIMATION_ELEMENTS.has(childTagName)) {
              // Clone the animation and add to wrapper
              wrapperGroup.appendChild(child.cloneNode(true));
            }
          }
        }

        // Replace use with the wrapper group
        if (useEl.parentNode) {
          useEl.parentNode.replaceChild(wrapperGroup, useEl);
          count++;
        }
        continue;
      }

      // Standard path conversion for elements without preserve elements
      // Parse use element data
      const useData = UseSymbolResolver.parseUseElement(useEl);

      // Resolve the use with properly formatted defs (plain objects with .type)
      const resolved = UseSymbolResolver.resolveUse(useData, parsedDefs, {
        samples: opts.curveSegments,
      });

      if (!resolved) {
        errors.push(`use: failed to resolve #${refId}`);
        continue;
      }

      // Convert resolved to path data
      const pathData = UseSymbolResolver.resolvedUseToPathData(
        resolved,
        opts.curveSegments,
      );

      if (pathData) {
        // Create new path element to replace <use>
        const pathEl = new SVGElement("path", {
          d: pathData,
          ...extractPresentationAttrs(useEl),
        });

        // Copy style attributes from resolved
        if (resolved.style) {
          for (const [key, val] of Object.entries(resolved.style)) {
            if (val && !pathEl.hasAttribute(key)) {
              pathEl.setAttribute(key, val);
            }
          }
        }

        // Replace use with path
        if (useEl.parentNode) {
          useEl.parentNode.replaceChild(pathEl, useEl);
          count++;
        }
      }
    } catch (e) {
      errors.push(`use: ${e.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 2: RESOLVE MARKERS
// ============================================================================

/**
 * Resolve all marker references by instantiating marker geometry.
 * Expands markers into concrete path elements placed at path vertices.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Map<string, SVGElement>} defsMap - Map of definition IDs to elements
 * @param {Object} opts - Processing options
 * @returns {{count: number, errors: Array<string>}} Resolution results
 * @private
 */
function resolveAllMarkers(root, defsMap, opts) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("resolveAllMarkers: invalid root element");
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("resolveAllMarkers: defsMap must be a Map");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("resolveAllMarkers: opts must be an object");
  }

  const errors = [];
  let count = 0;

  // Find all elements with marker attributes
  const markerAttrs = ["marker-start", "marker-mid", "marker-end", "marker"];

  for (const attrName of markerAttrs) {
    const elements = findElementsWithAttribute(root, attrName);

    for (const el of elements) {
      if (
        el.tagName !== "path" &&
        el.tagName !== "line" &&
        el.tagName !== "polyline" &&
        el.tagName !== "polygon"
      ) {
        continue;
      }

      try {
        // Resolve markers for this element
        const markerInstances = MarkerResolver.resolveMarkers(
          el,
          Object.fromEntries(defsMap),
        );

        if (!markerInstances || markerInstances.length === 0) continue;

        // Convert markers to path data
        const markerPathData = MarkerResolver.markersToPathData(
          markerInstances,
          opts.precision,
        );

        if (markerPathData) {
          // Create new path element for marker geometry
          const markerPath = new SVGElement("path", {
            d: markerPathData,
            fill: el.getAttribute("stroke") || "currentColor", // Markers typically use stroke color
          });

          // Insert after the original element
          if (el.parentNode) {
            const nextSibling = el.nextSibling;
            if (nextSibling) {
              el.parentNode.insertBefore(markerPath, nextSibling);
            } else {
              el.parentNode.appendChild(markerPath);
            }
            count++;
          }
        }

        // Remove marker attributes from original element
        for (const attr of markerAttrs) {
          el.removeAttribute(attr);
        }
      } catch (e) {
        errors.push(`marker: ${e.message}`);
      }
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 3: RESOLVE PATTERNS
// ============================================================================

/**
 * Resolve pattern fills by expanding to tiled geometry.
 * Converts pattern fills into concrete geometry elements.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Map<string, SVGElement>} defsMap - Map of definition IDs to elements
 * @param {Object} opts - Processing options
 * @returns {{count: number, errors: Array<string>}} Resolution results
 * @private
 */
function resolveAllPatterns(root, defsMap, opts) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("resolveAllPatterns: invalid root element");
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("resolveAllPatterns: defsMap must be a Map");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("resolveAllPatterns: opts must be an object");
  }

  const errors = [];
  let count = 0;

  const elementsWithFill = findElementsWithAttribute(root, "fill");

  for (const el of elementsWithFill) {
    const fill = el.getAttribute("fill");
    if (!fill || !fill.includes("url(")) continue;

    const refId = parseUrlReference(fill);
    if (!refId) continue;

    const patternEl = defsMap.get(refId);
    if (!patternEl || patternEl.tagName.toLowerCase() !== "pattern") continue;

    try {
      // Check coordinate system units - skip if non-default
      const patternUnits =
        patternEl.getAttribute("patternUnits") || "objectBoundingBox";
      const patternContentUnits =
        patternEl.getAttribute("patternContentUnits") || "userSpaceOnUse";
      const patternTransform = patternEl.getAttribute("patternTransform");

      // PatternResolver handles these cases, but warn about complex patterns
      // that might need special handling or cause issues
      if (patternUnits !== "objectBoundingBox") {
        errors.push(
          `pattern ${refId}: non-default patternUnits="${patternUnits}" may cause rendering issues`,
        );
      }
      if (patternContentUnits !== "userSpaceOnUse") {
        errors.push(
          `pattern ${refId}: non-default patternContentUnits="${patternContentUnits}" may cause rendering issues`,
        );
      }
      if (patternTransform) {
        errors.push(
          `pattern ${refId}: patternTransform present - complex transformation may cause rendering issues`,
        );
      }

      // Get element bounding box (approximate from path data or attributes)
      const bbox = getElementBBox(el);
      if (!bbox) continue;

      // Parse pattern
      const patternData = PatternResolver.parsePatternElement(patternEl);

      // Resolve pattern to path data
      const patternPathData = PatternResolver.patternToPathData(
        patternData,
        bbox,
        {
          samples: opts.curveSegments,
        },
      );

      if (patternPathData) {
        // Create group with clipped pattern geometry
        const patternGroup = new SVGElement("g", {});

        const patternPath = new SVGElement("path", {
          d: patternPathData,
          fill: "#000", // Pattern content typically has its own fill
        });

        patternGroup.appendChild(patternPath);

        // Replace fill with pattern geometry (clip to original shape)
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", el.getAttribute("stroke") || "none");

        if (el.parentNode) {
          el.parentNode.insertBefore(patternGroup, el);
          count++;
        }
      }
    } catch (e) {
      errors.push(`pattern: ${e.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 4: RESOLVE MASKS
// ============================================================================

/**
 * Resolve mask references by converting to clip geometry.
 * Converts mask elements into clipping paths with boolean intersection.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Map<string, SVGElement>} defsMap - Map of definition IDs to elements
 * @param {Object} opts - Processing options
 * @returns {{count: number, errors: Array<string>}} Resolution results
 * @private
 */
function resolveAllMasks(root, defsMap, opts) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("resolveAllMasks: invalid root element");
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("resolveAllMasks: defsMap must be a Map");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("resolveAllMasks: opts must be an object");
  }

  const errors = [];
  let count = 0;

  const elementsWithMask = findElementsWithAttribute(root, "mask");

  for (const el of elementsWithMask) {
    const maskRef = el.getAttribute("mask");
    if (!maskRef || !maskRef.includes("url(")) continue;

    const refId = parseUrlReference(maskRef);
    if (!refId) continue;

    const maskEl = defsMap.get(refId);
    if (!maskEl || maskEl.tagName.toLowerCase() !== "mask") continue;

    try {
      // Check coordinate system units
      const maskUnits = maskEl.getAttribute("maskUnits") || "objectBoundingBox";
      const maskContentUnits =
        maskEl.getAttribute("maskContentUnits") || "userSpaceOnUse";

      // Default for mask is different from clipPath:
      // maskUnits defaults to objectBoundingBox
      // maskContentUnits defaults to userSpaceOnUse
      if (maskUnits !== "objectBoundingBox") {
        errors.push(
          `mask ${refId}: non-default maskUnits="${maskUnits}" may cause rendering issues`,
        );
      }
      if (maskContentUnits !== "userSpaceOnUse") {
        errors.push(
          `mask ${refId}: non-default maskContentUnits="${maskContentUnits}" may cause rendering issues`,
        );
      }

      // Get element bounding box
      const bbox = getElementBBox(el);
      if (!bbox) continue;

      // Parse mask
      const maskData = MaskResolver.parseMaskElement(maskEl);

      // Convert mask to clip path data
      const clipPathData = MaskResolver.maskToPathData(maskData, bbox, {
        samples: opts.curveSegments,
        opacityThreshold: 0.5,
      });

      if (clipPathData) {
        // Get original element's path data
        const origPathData = getElementPathData(el, opts.precision);

        if (origPathData) {
          // Perform boolean intersection
          const origPolygon = ClipPathResolver.pathToPolygon(
            origPathData,
            opts.curveSegments,
          );
          const clipPolygon = ClipPathResolver.pathToPolygon(
            clipPathData,
            opts.curveSegments,
          );

          // Apply clip (intersection)
          const clippedPolygon = intersectPolygons(origPolygon, clipPolygon);

          if (clippedPolygon && clippedPolygon.length > 2) {
            const clippedPath = ClipPathResolver.polygonToPathData(
              clippedPolygon,
              opts.precision,
            );
            el.setAttribute("d", clippedPath);
            el.removeAttribute("mask");
            count++;
          }
        }
      }
    } catch (e) {
      errors.push(`mask: ${e.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 5: APPLY CLIP PATHS
// ============================================================================

/**
 * Apply clipPath references by performing boolean intersection.
 * Also computes the difference (outside parts) and verifies area conservation (E2E).
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Map<string, SVGElement>} defsMap - Map of definition IDs to elements
 * @param {Object} opts - Processing options
 * @param {Object} stats - Statistics object to update with results
 * @returns {{count: number, errors: Array<string>}} Clipping results
 * @private
 */
function applyAllClipPaths(root, defsMap, opts, stats) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("applyAllClipPaths: invalid root element");
  }
  if (!defsMap || !(defsMap instanceof Map)) {
    throw new Error("applyAllClipPaths: defsMap must be a Map");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("applyAllClipPaths: opts must be an object");
  }
  if (!stats || typeof stats !== "object") {
    throw new Error("applyAllClipPaths: stats must be an object");
  }

  const errors = [];
  let count = 0;

  // Initialize E2E verification tracking in stats
  if (!stats.verifications.e2e) {
    stats.verifications.e2e = [];
  }
  if (!stats.clipOutsideFragments) {
    stats.clipOutsideFragments = []; // Store outside fragments for potential reconstruction
  }

  const elementsWithClip = findElementsWithAttribute(root, "clip-path");

  for (const el of elementsWithClip) {
    const clipRef = el.getAttribute("clip-path");
    if (!clipRef || !clipRef.includes("url(")) continue;

    const refId = parseUrlReference(clipRef);
    if (!refId) continue;

    const clipPathEl = defsMap.get(refId);
    // SVG spec uses "clipPath" but parsers may lowercase to "clippath"
    const clipTagName = clipPathEl ? clipPathEl.tagName.toLowerCase() : "";
    if (!clipPathEl || clipTagName !== "clippath") continue;

    try {
      // Check coordinate system units
      const clipPathUnits =
        clipPathEl.getAttribute("clipPathUnits") || "userSpaceOnUse";

      // userSpaceOnUse is the default and normal case for clipPath
      // objectBoundingBox means coordinates are 0-1 relative to bounding box
      if (clipPathUnits === "objectBoundingBox") {
        // This requires transforming clip coordinates based on target element's bbox
        // which is complex - warn about it
        errors.push(
          `clipPath ${refId}: objectBoundingBox units require bbox-relative coordinate transformation`,
        );
        // Note: We continue processing, but results may be incorrect
      }

      // Get element path data
      const origPathData = getElementPathData(el, opts.precision);
      if (!origPathData) continue;

      // Get clip path data from clipPath element's children
      let clipPathData = "";
      if (clipPathEl.children && clipPathEl.children.length > 0) {
        for (const child of clipPathEl.children) {
          // Use tagName check instead of instanceof
          if (child && child.tagName) {
            const childPath = getElementPathData(child, opts.precision);
            if (childPath) {
              clipPathData += (clipPathData ? " " : "") + childPath;
            }
          }
        }
      }

      if (!clipPathData) continue;

      // Convert to polygons using higher segment count for clip accuracy
      // clipSegments (default 64) provides better curve approximation for E2E verification
      const clipSegs = opts.clipSegments || 64;
      const origPolygon = ClipPathResolver.pathToPolygon(
        origPathData,
        clipSegs,
      );
      const clipPolygon = ClipPathResolver.pathToPolygon(
        clipPathData,
        clipSegs,
      );

      // Perform intersection (clipped result - what's kept)
      const clippedPolygon = intersectPolygons(origPolygon, clipPolygon);

      // Convert polygon arrays to proper format for verification
      const origForVerify = origPolygon.map((p) => ({
        x: p.x instanceof Decimal ? p.x : D(p.x),
        y: p.y instanceof Decimal ? p.y : D(p.y),
      }));
      const clipForVerify = clipPolygon.map((p) => ({
        x: p.x instanceof Decimal ? p.x : D(p.x),
        y: p.y instanceof Decimal ? p.y : D(p.y),
      }));

      // VERIFICATION: Verify polygon intersection is valid (ALWAYS runs)
      if (clippedPolygon && clippedPolygon.length > 2) {
        const clippedForVerify = clippedPolygon.map((p) => ({
          x: p.x instanceof Decimal ? p.x : D(p.x),
          y: p.y instanceof Decimal ? p.y : D(p.y),
        }));

        const polyResult = Verification.verifyPolygonIntersection(
          origForVerify,
          clipForVerify,
          clippedForVerify,
        );
        stats.verifications.polygons.push({
          element: el.tagName,
          clipPathId: refId,
          ...polyResult,
        });
        if (polyResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }

        // E2E VERIFICATION: Compute difference (outside parts) and verify area conservation
        // This ensures: area(original) = area(clipped) + area(outside)
        const outsideFragments = Verification.computePolygonDifference(
          origForVerify,
          clipForVerify,
        );

        // Store outside fragments (marked invisible) for potential reconstruction
        stats.clipOutsideFragments.push({
          elementId: el.getAttribute("id") || `clip-${count}`,
          clipPathId: refId,
          fragments: outsideFragments,
          visible: false, // These are the "thrown away" parts, stored invisibly
        });

        // E2E Verification: area(original) = area(clipped) + area(outside)
        // Pass configurable tolerance (default 1e-10 with 64 clipSegments)
        const e2eTolerance = opts.e2eTolerance || "1e-10";
        const e2eResult = Verification.verifyClipPathE2E(
          origForVerify,
          clippedForVerify,
          outsideFragments,
          e2eTolerance,
        );
        stats.verifications.e2e.push({
          element: el.tagName,
          clipPathId: refId,
          type: "clip-area-conservation",
          ...e2eResult,
        });
        if (e2eResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }
      }

      if (clippedPolygon && clippedPolygon.length > 2) {
        const clippedPath = ClipPathResolver.polygonToPathData(
          clippedPolygon,
          opts.precision,
        );

        // Update element and track which element to clean up
        let targetElement = el;
        if (el.tagName === "path") {
          el.setAttribute("d", clippedPath);
        } else {
          // Convert shape to path
          const newPath = new SVGElement("path", {
            d: clippedPath,
            ...extractPresentationAttrs(el),
          });

          if (el.parentNode) {
            el.parentNode.replaceChild(newPath, el);
            targetElement = newPath; // Remove clip-path from the new element in DOM
          }
        }

        targetElement.removeAttribute("clip-path");
        count++;
      }
    } catch (e) {
      errors.push(`clipPath: ${e.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 6: FLATTEN TRANSFORMS
// ============================================================================

/**
 * Flatten all transform attributes by baking into coordinates.
 * Applies transformation matrices directly to path coordinates and removes transform attributes.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Object} opts - Processing options
 * @param {Object} stats - Statistics object to update with results
 * @returns {{count: number, errors: Array<string>}} Flattening results
 * @private
 */
function flattenAllTransforms(root, opts, stats) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("flattenAllTransforms: invalid root element");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("flattenAllTransforms: opts must be an object");
  }
  if (!stats || typeof stats !== "object") {
    throw new Error("flattenAllTransforms: stats must be an object");
  }

  const errors = [];
  let count = 0;

  const elementsWithTransform = findElementsWithAttribute(root, "transform");

  for (const el of elementsWithTransform) {
    const transform = el.getAttribute("transform");
    if (!transform) continue;

    try {
      // Parse transform to matrix
      const ctm = SVGFlatten.parseTransformAttribute(transform);

      // VERIFICATION: Verify matrix is invertible and well-formed (ALWAYS runs)
      const matrixResult = Verification.verifyMatrixInversion(ctm);
      stats.verifications.matrices.push({
        element: el.tagName,
        transform,
        ...matrixResult,
      });
      if (matrixResult.valid) {
        stats.verifications.passed++;
      } else {
        stats.verifications.failed++;
        stats.verifications.allPassed = false;
      }

      // Get element path data
      const pathData = getElementPathData(el, opts.precision);
      if (!pathData) {
        // For groups, propagate transform to children
        if (el.tagName === "g") {
          propagateTransformToChildren(el, ctm, opts, stats);
          el.removeAttribute("transform");
          count++;
        }
        continue;
      }

      // VERIFICATION: Sample test points from original path for round-trip verification (ALWAYS runs)
      let testPoints = [];
      // Extract a few key points from the path for verification
      const polygon = ClipPathResolver.pathToPolygon(pathData, 4);
      if (polygon && polygon.length > 0) {
        testPoints = polygon.slice(0, 4).map((p) => ({
          x: p.x instanceof Decimal ? p.x : D(p.x),
          y: p.y instanceof Decimal ? p.y : D(p.y),
        }));
      }

      // Transform the path data
      const transformedPath = SVGFlatten.transformPathData(pathData, ctm, {
        precision: opts.precision,
      });

      // VERIFICATION: Verify transform round-trip accuracy for each test point (ALWAYS runs)
      for (let i = 0; i < testPoints.length; i++) {
        const pt = testPoints[i];
        const rtResult = Verification.verifyTransformRoundTrip(ctm, pt.x, pt.y);
        stats.verifications.transforms.push({
          element: el.tagName,
          pointIndex: i,
          ...rtResult,
        });
        if (rtResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }
      }

      // Update or replace element and track which element to clean up
      let targetElement = el;
      if (el.tagName === "path") {
        el.setAttribute("d", transformedPath);
      } else {
        // Convert shape to path with transformed coordinates
        const newPath = new SVGElement("path", {
          d: transformedPath,
          ...extractPresentationAttrs(el),
        });

        // Remove shape-specific attributes
        for (const attr of getShapeSpecificAttrs(el.tagName)) {
          newPath.removeAttribute(attr);
        }

        if (el.parentNode) {
          el.parentNode.replaceChild(newPath, el);
          targetElement = newPath; // Remove transform from the new element in DOM
        }
      }

      targetElement.removeAttribute("transform");
      count++;
    } catch (e) {
      errors.push(`transform: ${e.message}`);
    }
  }

  return { count, errors };
}

/**
 * Propagate transform to all children of a group.
 * Applies parent group transform to all child elements recursively.
 *
 * @param {SVGElement} group - Group element with transform
 * @param {Matrix} ctm - Current transformation matrix
 * @param {Object} opts - Processing options
 * @param {Object} stats - Statistics object to update with results
 * @returns {void}
 * @private
 */
function propagateTransformToChildren(group, ctm, opts, stats) {
  // Validate parameters
  if (!group || !group.children) {
    throw new Error("propagateTransformToChildren: invalid group element");
  }
  if (!ctm || !ctm.data) {
    throw new Error("propagateTransformToChildren: invalid matrix");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("propagateTransformToChildren: opts must be an object");
  }
  if (!stats || typeof stats !== "object") {
    throw new Error("propagateTransformToChildren: stats must be an object");
  }

  for (const child of [...group.children]) {
    // Use tagName check instead of instanceof
    if (!(child && child.tagName)) continue;

    if (child.tagName === "g") {
      // Nested group - compose transforms
      const childTransform = child.getAttribute("transform");
      if (childTransform) {
        const childCtm = SVGFlatten.parseTransformAttribute(childTransform);
        const combined = ctm.mul(childCtm);
        child.setAttribute("transform", matrixToTransform(combined));
      } else {
        child.setAttribute("transform", matrixToTransform(ctm));
      }
    } else {
      // Shape or path - apply transform to coordinates
      const pathData = getElementPathData(child, opts.precision);
      if (pathData) {
        // Compose with any existing transform
        const childTransform = child.getAttribute("transform");
        let combinedCtm = ctm;
        if (childTransform) {
          const childCtm = SVGFlatten.parseTransformAttribute(childTransform);
          combinedCtm = ctm.mul(childCtm);
        }

        // VERIFICATION: Verify combined transform matrix (ALWAYS runs)
        const matrixResult = Verification.verifyMatrixInversion(combinedCtm);
        stats.verifications.matrices.push({
          element: child.tagName,
          context: "group-propagation",
          ...matrixResult,
        });
        if (matrixResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }

        const transformedPath = SVGFlatten.transformPathData(
          pathData,
          combinedCtm,
          { precision: opts.precision },
        );

        // Track which element to clean up transform attribute from
        let targetChild = child;
        if (child.tagName === "path") {
          child.setAttribute("d", transformedPath);
        } else {
          // Replace with path element
          const newPath = new SVGElement("path", {
            d: transformedPath,
            ...extractPresentationAttrs(child),
          });

          group.replaceChild(newPath, child);
          targetChild = newPath; // Remove transform from the new element in DOM
        }

        targetChild.removeAttribute("transform");
      }
    }
  }
}

// ============================================================================
// STEP 7: BAKE GRADIENT TRANSFORMS
// ============================================================================

/**
 * Bake gradientTransform into gradient coordinates.
 * Applies gradient transforms directly to gradient coordinate attributes.
 *
 * @param {SVGElement} root - Root SVG element
 * @param {Object} opts - Processing options
 * @param {Object} stats - Statistics object to update with results
 * @returns {{count: number, errors: Array<string>}} Processing results
 * @private
 */
function bakeAllGradientTransforms(root, opts, stats) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("bakeAllGradientTransforms: invalid root element");
  }
  if (!opts || typeof opts !== "object") {
    throw new Error("bakeAllGradientTransforms: opts must be an object");
  }
  if (!stats || typeof stats !== "object") {
    throw new Error("bakeAllGradientTransforms: stats must be an object");
  }

  const errors = [];
  let count = 0;

  // Process linearGradient elements
  const linearGradients = root.getElementsByTagName("linearGradient");
  for (const grad of linearGradients) {
    const gradientTransform = grad.getAttribute("gradientTransform");
    if (!gradientTransform) continue;

    try {
      const ctm = SVGFlatten.parseTransformAttribute(gradientTransform);

      // Transform x1,y1,x2,y2
      const x1 = parseFloat(grad.getAttribute("x1") || "0");
      const y1 = parseFloat(grad.getAttribute("y1") || "0");
      const x2 = parseFloat(grad.getAttribute("x2") || "1");
      const y2 = parseFloat(grad.getAttribute("y2") || "0");

      // Validate parseFloat results to prevent NaN propagation
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
        errors.push(
          `linearGradient: invalid coordinate values for gradient ${grad.getAttribute("id") || "unknown"}`,
        );
        continue;
      }

      const [tx1, ty1] = Transforms2D.applyTransform(ctm, x1, y1);
      const [tx2, ty2] = Transforms2D.applyTransform(ctm, x2, y2);

      // VERIFICATION: Verify linear gradient transform (ALWAYS runs)
      const gradResult = Verification.verifyLinearGradientTransform(
        { x1, y1, x2, y2 },
        {
          x1: tx1.toNumber(),
          y1: ty1.toNumber(),
          x2: tx2.toNumber(),
          y2: ty2.toNumber(),
        },
        ctm,
      );
      stats.verifications.gradients.push({
        gradientId: grad.getAttribute("id") || "unknown",
        type: "linear",
        ...gradResult,
      });
      if (gradResult.valid) {
        stats.verifications.passed++;
      } else {
        stats.verifications.failed++;
        stats.verifications.allPassed = false;
      }

      grad.setAttribute("x1", tx1.toFixed(opts.precision));
      grad.setAttribute("y1", ty1.toFixed(opts.precision));
      grad.setAttribute("x2", tx2.toFixed(opts.precision));
      grad.setAttribute("y2", ty2.toFixed(opts.precision));
      grad.removeAttribute("gradientTransform");
      count++;
    } catch (e) {
      errors.push(`linearGradient: ${e.message}`);
    }
  }

  // Process radialGradient elements
  const radialGradients = root.getElementsByTagName("radialGradient");
  for (const grad of radialGradients) {
    const gradientTransform = grad.getAttribute("gradientTransform");
    if (!gradientTransform) continue;

    try {
      const ctm = SVGFlatten.parseTransformAttribute(gradientTransform);

      // Transform cx,cy,fx,fy and scale r
      const cx = parseFloat(grad.getAttribute("cx") || "0.5");
      const cy = parseFloat(grad.getAttribute("cy") || "0.5");
      const fx = parseFloat(grad.getAttribute("fx") || cx.toString());
      const fy = parseFloat(grad.getAttribute("fy") || cy.toString());
      const r = parseFloat(grad.getAttribute("r") || "0.5");

      // Validate parseFloat results to prevent NaN propagation
      if (isNaN(cx) || isNaN(cy) || isNaN(fx) || isNaN(fy) || isNaN(r)) {
        errors.push(
          `radialGradient: invalid coordinate/radius values for gradient ${grad.getAttribute("id") || "unknown"}`,
        );
        continue;
      }
      if (r <= 0) {
        errors.push(
          `radialGradient: radius must be positive for gradient ${grad.getAttribute("id") || "unknown"}`,
        );
        continue;
      }

      const [tcx, tcy] = Transforms2D.applyTransform(ctm, cx, cy);
      const [tfx, tfy] = Transforms2D.applyTransform(ctm, fx, fy);

      // Scale radius by average scale factor
      const scaleProduct =
        ctm.data[0][0].toNumber() * ctm.data[1][1].toNumber();
      if (Math.abs(scaleProduct) < 1e-10) {
        errors.push(
          `radialGradient: matrix determinant too close to zero (degenerate transform)`,
        );
        continue;
      }
      const scale = Math.sqrt(Math.abs(scaleProduct));
      const tr = r * scale;

      grad.setAttribute("cx", tcx.toFixed(opts.precision));
      grad.setAttribute("cy", tcy.toFixed(opts.precision));
      grad.setAttribute("fx", tfx.toFixed(opts.precision));
      grad.setAttribute("fy", tfy.toFixed(opts.precision));
      grad.setAttribute("r", tr.toFixed(opts.precision));
      grad.removeAttribute("gradientTransform");
      count++;
    } catch (e) {
      errors.push(`radialGradient: ${e.message}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// STEP 8: REMOVE UNUSED DEFS
// ============================================================================

/**
 * Collect all ID references in the document.
 *
 * This must be called BEFORE any processing that removes references (like resolveMarkers).
 * Otherwise, we'll incorrectly remove defs that were just used.
 *
 * IMPORTANT: This function must find ALL referenced elements, including:
 * - Elements directly referenced from the document (fill="url(#grad)", xlink:href="#symbol")
 * - Elements referenced from within <defs> (glyphRef xlink:href="#glyph", gradient xlink:href="#other")
 * - Elements referenced via any attribute (not just url() and href)
 *
 * @private
 */
function collectAllReferences(root) {
  // Validate parameter
  if (!root || !root.getElementsByTagName) {
    throw new Error("collectAllReferences: invalid root element");
  }

  const usedIds = new Set();

  // Collect references from an element and all its children
  const collectReferences = (el) => {
    // Validate element parameter
    if (!el || !el.getAttributeNames) {
      return;
    }
    // Check for <style> elements and parse their CSS content for url(#id) references
    // This is CRITICAL for SVG 2.0 features like shape-inside: url(#textShape)
    if (el.tagName && el.tagName.toLowerCase() === "style") {
      const cssContent = el.textContent || "";
      if (cssContent) {
        // Parse all url(#id) references from CSS (e.g., shape-inside: url(#textShape), fill: url(#grad))
        const cssIds = parseCSSIds(cssContent);
        cssIds.forEach((id) => usedIds.add(id));
      }
    }

    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);
      if (!val) continue;

      // Check for url() references (fill, stroke, clip-path, mask, filter, marker, etc.)
      if (val.includes("url(")) {
        const refId = parseUrlReference(val);
        if (refId) {
          usedIds.add(refId);
        }
      }

      // Check for href/xlink:href references (use, image, altGlyph, glyphRef, etc.)
      if (attrName === "href" || attrName === "xlink:href") {
        const refId = val.replace(/^#/, "");
        if (refId && refId !== val) {
          // Only local refs starting with #
          usedIds.add(refId);
        }
      }
    }

    // Recursively check children (including within <defs>)
    // Use tagName check instead of instanceof
    for (const child of el.children) {
      if (child && child.tagName) {
        collectReferences(child);
      }
    }
  };

  // Collect all references from the entire document
  collectReferences(root);

  return usedIds;
}

/**
 * Remove defs that are not in the referencedIds set.
 *
 * IMPORTANT: An element should NOT be removed if:
 * 1. It has an ID that is referenced, OR
 * 2. It contains (anywhere in its subtree) an element with a referenced ID
 *
 * This handles cases like:
 *   <defs>
 *     <g id="container">  <!-- Not referenced, but contains referenced gradients -->
 *       <linearGradient id="grad1">  <!-- Referenced -->
 *
 * @param {SVGElement} root - The root SVG element
 * @param {Set<string>} referencedIds - Set of IDs that were referenced before processing
 * @private
 */
function removeUnusedDefinitions(root, referencedIds) {
  // Validate parameters
  if (!root || !root.getElementsByTagName) {
    throw new Error("removeUnusedDefinitions: invalid root element");
  }
  if (!referencedIds || !(referencedIds instanceof Set)) {
    throw new Error("removeUnusedDefinitions: referencedIds must be a Set");
  }

  let count = 0;

  // Check if an element or any of its descendants has a referenced ID
  function hasReferencedDescendant(el) {
    // Validate element
    if (!el || !el.getAttribute) {
      return false;
    }

    // Check self
    const id = el.getAttribute("id");
    if (id && referencedIds.has(id)) {
      return true;
    }

    // Check children recursively (use tagName check instead of instanceof)
    for (const child of el.children || []) {
      if (child && child.tagName && hasReferencedDescendant(child)) {
        return true;
      }
    }

    return false;
  }

  // Remove unreferenced elements from <defs>
  const defsElements = root.getElementsByTagName("defs");
  for (const defs of defsElements) {
    for (const child of [...defs.children]) {
      // Use tagName check instead of instanceof
      if (child && child.tagName) {
        // Only remove if neither the element nor any of its descendants are referenced
        // ALSO never remove foreignObject, audio, video (preserve elements)
        const childTagName = child.tagName.toLowerCase();
        if (PRESERVE_ELEMENTS.has(childTagName)) {
          continue; // Never remove preserve elements from defs
        }
        if (!hasReferencedDescendant(child)) {
          defs.removeChild(child);
          count++;
        }
      }
    }
  }

  return { count };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get path data from any shape element.
 * Converts basic shapes (rect, circle, ellipse, etc.) to path data.
 *
 * @param {SVGElement} el - Element to convert
 * @param {number} precision - Decimal precision for coordinates
 * @returns {string|null} Path data string or null if not convertible
 * @private
 */
function getElementPathData(el, precision) {
  // Validate parameters
  if (!el || !el.tagName) {
    return null;
  }
  if (typeof precision !== "number" || isNaN(precision) || precision < 0) {
    throw new Error(
      `getElementPathData: precision must be a non-negative number, got ${precision}`,
    );
  }

  const tagName = el.tagName.toLowerCase();

  if (tagName === "path") {
    return el.getAttribute("d");
  }

  // Use GeometryToPath for shape conversion
  const getAttr = (name, def = 0) => {
    const val = el.getAttribute(name);
    if (val === null) return def;
    const parsed = parseFloat(val);
    // Validate parseFloat result to prevent NaN propagation
    if (isNaN(parsed)) {
      throw new Error(
        `getElementPathData: invalid numeric value "${val}" for attribute "${name}"`,
      );
    }
    return parsed;
  };

  switch (tagName) {
    case "rect": {
      const ry = el.getAttribute("ry");
      // ry can be null (not specified), or a numeric value including 0
      const ryValue = ry !== null ? getAttr("ry") : null;
      return GeometryToPath.rectToPathData(
        getAttr("x"),
        getAttr("y"),
        getAttr("width"),
        getAttr("height"),
        getAttr("rx"),
        ryValue,
        false,
        precision,
      );
    }
    case "circle":
      return GeometryToPath.circleToPathData(
        getAttr("cx"),
        getAttr("cy"),
        getAttr("r"),
        precision,
      );
    case "ellipse":
      return GeometryToPath.ellipseToPathData(
        getAttr("cx"),
        getAttr("cy"),
        getAttr("rx"),
        getAttr("ry"),
        precision,
      );
    case "line":
      return GeometryToPath.lineToPathData(
        getAttr("x1"),
        getAttr("y1"),
        getAttr("x2"),
        getAttr("y2"),
        precision,
      );
    case "polyline":
      return GeometryToPath.polylineToPathData(
        el.getAttribute("points") || "",
        precision,
      );
    case "polygon":
      return GeometryToPath.polygonToPathData(
        el.getAttribute("points") || "",
        precision,
      );
    default:
      return null;
  }
}

/**
 * Get approximate bounding box of an element.
 * Calculates bounding box by sampling points from the element's geometry.
 *
 * @param {SVGElement} el - Element to measure
 * @returns {{x: number, y: number, width: number, height: number}|null} Bounding box or null if calculation fails
 * @private
 */
function getElementBBox(el) {
  // Validate parameter
  if (!el || !el.tagName) {
    return null;
  }

  const pathData = getElementPathData(el, 6);
  if (!pathData) return null;

  try {
    const polygon = ClipPathResolver.pathToPolygon(pathData, 10);
    if (!polygon || polygon.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const pt of polygon) {
      // Validate point has coordinates
      if (!pt || (pt.x === undefined && pt.y === undefined)) continue;

      // Convert to numbers, defaulting to 0 for invalid values
      const x =
        pt.x instanceof Decimal
          ? pt.x.toNumber()
          : typeof pt.x === "number"
            ? pt.x
            : 0;
      const y =
        pt.y instanceof Decimal
          ? pt.y.toNumber()
          : typeof pt.y === "number"
            ? pt.y
            : 0;

      // Skip NaN values
      if (isNaN(x) || isNaN(y)) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    // Validate that we found at least one valid point
    if (
      minX === Infinity ||
      maxX === -Infinity ||
      minY === Infinity ||
      maxY === -Infinity
    ) {
      return null;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } catch {
    return null;
  }
}

/**
 * Extract presentation attributes from element.
 * @private
 *
 * CRITICAL: This function must include ALL SVG presentation attributes
 * that affect visual rendering. Missing attributes will cause SILENT
 * RENDERING BUGS when shapes are converted to paths.
 *
 * Categories:
 * - Stroke properties (width, caps, joins, dashes)
 * - Fill properties (opacity, rule)
 * - Clipping/Masking (clip-path, mask, filter) - NON-INHERITABLE but CRITICAL
 * - Marker properties (marker, marker-start/mid/end)
 * - Text properties (font, spacing, decoration)
 * - Rendering hints (shape-rendering, text-rendering, etc.)
 * - Visual effects (opacity, paint-order, vector-effect)
 */
function extractPresentationAttrs(el) {
  // Validate parameter
  if (!el || !el.getAttribute) {
    return {};
  }

  const presentationAttrs = [
    // Stroke properties
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-miterlimit",
    "stroke-opacity",
    "vector-effect", // Affects stroke rendering (non-scaling-stroke)

    // Fill properties
    "fill",
    "fill-opacity",
    "fill-rule",

    // CRITICAL: Non-inheritable but must be preserved on element
    "clip-path", // Clips geometry - MUST NOT BE LOST
    "mask", // Masks transparency - MUST NOT BE LOST
    "filter", // Visual effects - MUST NOT BE LOST
    "opacity", // Element opacity

    // Clip/fill rules
    "clip-rule",

    // Marker properties - arrows, dots, etc on paths
    "marker", // Shorthand for all markers
    "marker-start", // Start of path
    "marker-mid", // Vertices
    "marker-end", // End of path

    // Visibility
    "visibility",
    "display",

    // Color
    "color",

    // Text properties
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "dominant-baseline",
    "alignment-baseline",
    "letter-spacing",
    "word-spacing",
    "text-decoration",

    // Rendering hints
    "shape-rendering",
    "text-rendering",
    "image-rendering",
    "color-rendering",

    // Paint order (affects stroke/fill/marker rendering order)
    "paint-order",

    // Event handling (visual feedback)
    "pointer-events",
    "cursor",

    // Preserve class and style for CSS targeting
    "class",
    "style",

    // ID must be preserved for references
    "id",
  ];

  const attrs = {};
  for (const name of presentationAttrs) {
    const val = el.getAttribute(name);
    if (val !== null) {
      attrs[name] = val;
    }
  }
  return attrs;
}

/**
 * Get shape-specific attribute names.
 * @private
 *
 * These are attributes specific to each shape element that should NOT be
 * copied when converting to a <path>. The geometry is encoded in the 'd'
 * attribute instead.
 */
function getShapeSpecificAttrs(tagName) {
  // Validate parameter
  if (!tagName || typeof tagName !== "string") {
    return [];
  }

  const attrs = {
    rect: ["x", "y", "width", "height", "rx", "ry"],
    circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"],
    polyline: ["points"],
    polygon: ["points"],
    // Image element has position/size attributes that don't apply to paths
    image: [
      "x",
      "y",
      "width",
      "height",
      "href",
      "xlink:href",
      "preserveAspectRatio",
    ],
  };
  return attrs[tagName.toLowerCase()] || [];
}

/**
 * Convert matrix to transform attribute string.
 * Converts a Matrix object to SVG matrix() transform format.
 *
 * @param {Matrix} matrix - Transformation matrix
 * @returns {string} SVG transform attribute value
 * @private
 */
function matrixToTransform(matrix) {
  // Validate parameter
  if (!matrix || !matrix.data || !Array.isArray(matrix.data)) {
    throw new Error("matrixToTransform: invalid matrix");
  }
  if (
    !matrix.data[0] ||
    !matrix.data[1] ||
    !matrix.data[0][0] ||
    !matrix.data[0][1] ||
    !matrix.data[0][2] ||
    !matrix.data[1][0] ||
    !matrix.data[1][1] ||
    !matrix.data[1][2]
  ) {
    throw new Error("matrixToTransform: matrix is missing required elements");
  }

  const a = matrix.data[0][0].toNumber();
  const b = matrix.data[1][0].toNumber();
  const c = matrix.data[0][1].toNumber();
  const d = matrix.data[1][1].toNumber();
  const e = matrix.data[0][2].toNumber();
  const f = matrix.data[1][2].toNumber();

  // Validate all values are finite numbers
  if (
    !isFinite(a) ||
    !isFinite(b) ||
    !isFinite(c) ||
    !isFinite(d) ||
    !isFinite(e) ||
    !isFinite(f)
  ) {
    throw new Error("matrixToTransform: matrix contains non-finite values");
  }

  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}

/**
 * Intersect two polygons using Sutherland-Hodgman algorithm.
 * Computes the boolean intersection of two polygons.
 *
 * @param {Array<{x: Decimal, y: Decimal}>} subject - Subject polygon vertices
 * @param {Array<{x: Decimal, y: Decimal}>} clip - Clip polygon vertices
 * @returns {Array<{x: Decimal, y: Decimal}>} Intersection polygon vertices
 * @private
 */
function intersectPolygons(subject, clip) {
  // Validate inputs
  if (!subject || subject.length < 3 || !clip || clip.length < 3) {
    return subject;
  }

  // Use advanced polygon intersection from polygon-clip module if available
  // Falls back to simple convex clip implementation
  if (PolygonClip && PolygonClip.polygonIntersection) {
    try {
      return PolygonClip.polygonIntersection(subject, clip);
    } catch (_error) {
      // Fall through to simple implementation on error
      // Error is intentionally not logged to avoid noise from expected edge cases
    }
  }

  // Simple convex clip implementation (Sutherland-Hodgman)

  let output = [...subject];

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) break;

    const input = output;
    output = [];

    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const next = input[(j + 1) % input.length];

      const currentInside = isInsideEdge(current, edgeStart, edgeEnd);
      const nextInside = isInsideEdge(next, edgeStart, edgeEnd);

      if (currentInside) {
        output.push(current);
        if (!nextInside) {
          output.push(lineIntersect(current, next, edgeStart, edgeEnd));
        }
      } else if (nextInside) {
        output.push(lineIntersect(current, next, edgeStart, edgeEnd));
      }
    }
  }

  return output;
}

/**
 * Check if point is inside edge (left side).
 * Uses cross product to determine if point is on the left (inside) of an edge.
 *
 * @param {{x: Decimal|number, y: Decimal|number}} point - Point to test
 * @param {{x: Decimal|number, y: Decimal|number}} edgeStart - Edge start vertex
 * @param {{x: Decimal|number, y: Decimal|number}} edgeEnd - Edge end vertex
 * @returns {boolean} True if point is inside (left of) the edge
 * @private
 */
function isInsideEdge(point, edgeStart, edgeEnd) {
  // Validate parameters
  if (!point || (point.x === undefined && point.y === undefined)) {
    throw new Error("isInsideEdge: invalid point");
  }
  if (!edgeStart || (edgeStart.x === undefined && edgeStart.y === undefined)) {
    throw new Error("isInsideEdge: invalid edgeStart");
  }
  if (!edgeEnd || (edgeEnd.x === undefined && edgeEnd.y === undefined)) {
    throw new Error("isInsideEdge: invalid edgeEnd");
  }

  const px = point.x instanceof Decimal ? point.x.toNumber() : point.x || 0;
  const py = point.y instanceof Decimal ? point.y.toNumber() : point.y || 0;
  const sx =
    edgeStart.x instanceof Decimal ? edgeStart.x.toNumber() : edgeStart.x || 0;
  const sy =
    edgeStart.y instanceof Decimal ? edgeStart.y.toNumber() : edgeStart.y || 0;
  const ex =
    edgeEnd.x instanceof Decimal ? edgeEnd.x.toNumber() : edgeEnd.x || 0;
  const ey =
    edgeEnd.y instanceof Decimal ? edgeEnd.y.toNumber() : edgeEnd.y || 0;

  return (ex - sx) * (py - sy) - (ey - sy) * (px - sx) >= 0;
}

/**
 * Find intersection point of two lines.
 *
 * When lines are nearly parallel (determinant near zero), returns the midpoint
 * of the first line segment as a reasonable fallback.
 *
 * @private
 * @param {Object} p1 - First point of first line
 * @param {Object} p2 - Second point of first line
 * @param {Object} p3 - First point of second line
 * @param {Object} p4 - Second point of second line
 * @returns {Object} Intersection point with x, y as Decimal
 */
function lineIntersect(p1, p2, p3, p4) {
  // Validate parameters
  if (!p1 || (p1.x === undefined && p1.y === undefined)) {
    throw new Error("lineIntersect: invalid p1");
  }
  if (!p2 || (p2.x === undefined && p2.y === undefined)) {
    throw new Error("lineIntersect: invalid p2");
  }
  if (!p3 || (p3.x === undefined && p3.y === undefined)) {
    throw new Error("lineIntersect: invalid p3");
  }
  if (!p4 || (p4.x === undefined && p4.y === undefined)) {
    throw new Error("lineIntersect: invalid p4");
  }

  const x1 = p1.x instanceof Decimal ? p1.x.toNumber() : p1.x || 0;
  const y1 = p1.y instanceof Decimal ? p1.y.toNumber() : p1.y || 0;
  const x2 = p2.x instanceof Decimal ? p2.x.toNumber() : p2.x || 0;
  const y2 = p2.y instanceof Decimal ? p2.y.toNumber() : p2.y || 0;
  const x3 = p3.x instanceof Decimal ? p3.x.toNumber() : p3.x || 0;
  const y3 = p3.y instanceof Decimal ? p3.y.toNumber() : p3.y || 0;
  const x4 = p4.x instanceof Decimal ? p4.x.toNumber() : p4.x || 0;
  const y4 = p4.y instanceof Decimal ? p4.y.toNumber() : p4.y || 0;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Tolerance of 1e-10 chosen to match Decimal precision expectations
  // For nearly-parallel lines, return midpoint of first segment as fallback
  if (Math.abs(denom) < 1e-10) {
    return { x: D((x1 + x2) / 2), y: D((y1 + y2) / 2) };
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  return {
    x: D(x1 + t * (x2 - x1)),
    y: D(y1 + t * (y2 - y1)),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  flattenSVG,
  DEFAULT_OPTIONS,
};
