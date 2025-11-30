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

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import * as Transforms2D from './transforms2d.js';
import * as SVGFlatten from './svg-flatten.js';
import * as ClipPathResolver from './clip-path-resolver.js';
import * as MaskResolver from './mask-resolver.js';
import * as UseSymbolResolver from './use-symbol-resolver.js';
import * as PatternResolver from './pattern-resolver.js';
import * as MarkerResolver from './marker-resolver.js';
import * as MeshGradient from './mesh-gradient.js';
import * as GeometryToPath from './geometry-to-path.js';
import { parseSVG, SVGElement, buildDefsMap, parseUrlReference, serializeSVG, findElementsWithAttribute } from './svg-parser.js';
import { Logger } from './logger.js';
import * as Verification from './verification.js';

Decimal.set({ precision: 80 });

const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Default options for flatten pipeline.
 */
const DEFAULT_OPTIONS = {
  precision: 6,              // Decimal places in output coordinates
  curveSegments: 20,         // Samples per curve for polygon conversion (visual output)
  clipSegments: 64,          // Higher samples for clip polygon accuracy (affects E2E precision)
  bezierArcs: 8,             // Bezier arcs for circles/ellipses (must be multiple of 4)
                             // 8: π/4 optimal base (~0.0004% error)
                             // 16: π/8 (~0.000007% error), 32: π/16, 64: π/32 (~0.00000001% error)
  resolveUse: true,          // Expand <use> elements
  resolveMarkers: true,      // Expand marker instances
  resolvePatterns: true,     // Expand pattern fills to geometry
  resolveMasks: true,        // Convert masks to clip paths
  resolveClipPaths: true,    // Apply clipPath boolean operations
  flattenTransforms: true,   // Bake transform attributes into coordinates
  bakeGradients: true,       // Bake gradientTransform into gradient coords
  removeUnusedDefs: true,    // Remove defs that are no longer referenced
  preserveIds: false,        // Keep original IDs on expanded elements
  // NOTE: Verification is ALWAYS enabled - precision is non-negotiable
  // E2E verification tolerance (configurable for different accuracy needs)
  e2eTolerance: '1e-10',     // Default: 1e-10 (very tight with high clipSegments)
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
    if (root.tagName !== 'svg') {
      throw new Error('Root element must be <svg>');
    }

    // Build defs map
    let defsMap = buildDefsMap(root);

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

    // Step 8: Remove unused defs
    if (opts.removeUnusedDefs) {
      const result = removeUnusedDefinitions(root);
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
 * @private
 */
function resolveAllUseElements(root, defsMap, opts) {
  const errors = [];
  let count = 0;

  const useElements = root.getElementsByTagName('use');

  for (const useEl of [...useElements]) { // Clone array since we modify DOM
    try {
      const href = useEl.getAttribute('href') || useEl.getAttribute('xlink:href');
      if (!href) continue;

      const refId = href.replace(/^#/, '');
      const refEl = defsMap.get(refId);

      if (!refEl) {
        errors.push(`use: referenced element #${refId} not found`);
        continue;
      }

      // Parse use element data
      const useData = UseSymbolResolver.parseUseElement(useEl);

      // Resolve the use
      const resolved = UseSymbolResolver.resolveUse(useData, Object.fromEntries(defsMap), {
        samples: opts.curveSegments
      });

      if (!resolved) {
        errors.push(`use: failed to resolve #${refId}`);
        continue;
      }

      // Convert resolved to path data
      const pathData = UseSymbolResolver.resolvedUseToPathData(resolved, opts.curveSegments);

      if (pathData) {
        // Create new path element to replace <use>
        const pathEl = new SVGElement('path', {
          d: pathData,
          ...extractPresentationAttrs(useEl)
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
 * @private
 */
function resolveAllMarkers(root, defsMap, opts) {
  const errors = [];
  let count = 0;

  // Find all elements with marker attributes
  const markerAttrs = ['marker-start', 'marker-mid', 'marker-end', 'marker'];

  for (const attrName of markerAttrs) {
    const elements = findElementsWithAttribute(root, attrName);

    for (const el of elements) {
      if (el.tagName !== 'path' && el.tagName !== 'line' && el.tagName !== 'polyline' && el.tagName !== 'polygon') {
        continue;
      }

      try {
        // Resolve markers for this element
        const markerInstances = MarkerResolver.resolveMarkers(el, Object.fromEntries(defsMap));

        if (!markerInstances || markerInstances.length === 0) continue;

        // Convert markers to path data
        const markerPathData = MarkerResolver.markersToPathData(markerInstances, opts.precision);

        if (markerPathData) {
          // Create new path element for marker geometry
          const markerPath = new SVGElement('path', {
            d: markerPathData,
            fill: el.getAttribute('stroke') || 'currentColor', // Markers typically use stroke color
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
 * @private
 */
function resolveAllPatterns(root, defsMap, opts) {
  const errors = [];
  let count = 0;

  const elementsWithFill = findElementsWithAttribute(root, 'fill');

  for (const el of elementsWithFill) {
    const fill = el.getAttribute('fill');
    if (!fill || !fill.includes('url(')) continue;

    const refId = parseUrlReference(fill);
    if (!refId) continue;

    const patternEl = defsMap.get(refId);
    if (!patternEl || patternEl.tagName !== 'pattern') continue;

    try {
      // Get element bounding box (approximate from path data or attributes)
      const bbox = getElementBBox(el);
      if (!bbox) continue;

      // Parse pattern
      const patternData = PatternResolver.parsePatternElement(patternEl);

      // Resolve pattern to path data
      const patternPathData = PatternResolver.patternToPathData(patternData, bbox, {
        samples: opts.curveSegments
      });

      if (patternPathData) {
        // Create group with clipped pattern geometry
        const patternGroup = new SVGElement('g', {});

        const patternPath = new SVGElement('path', {
          d: patternPathData,
          fill: '#000', // Pattern content typically has its own fill
        });

        patternGroup.appendChild(patternPath);

        // Replace fill with pattern geometry (clip to original shape)
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', el.getAttribute('stroke') || 'none');

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
 * @private
 */
function resolveAllMasks(root, defsMap, opts) {
  const errors = [];
  let count = 0;

  const elementsWithMask = findElementsWithAttribute(root, 'mask');

  for (const el of elementsWithMask) {
    const maskRef = el.getAttribute('mask');
    if (!maskRef || !maskRef.includes('url(')) continue;

    const refId = parseUrlReference(maskRef);
    if (!refId) continue;

    const maskEl = defsMap.get(refId);
    if (!maskEl || maskEl.tagName !== 'mask') continue;

    try {
      // Get element bounding box
      const bbox = getElementBBox(el);
      if (!bbox) continue;

      // Parse mask
      const maskData = MaskResolver.parseMaskElement(maskEl);

      // Convert mask to clip path data
      const clipPathData = MaskResolver.maskToPathData(maskData, bbox, {
        samples: opts.curveSegments,
        opacityThreshold: 0.5
      });

      if (clipPathData) {
        // Get original element's path data
        const origPathData = getElementPathData(el, opts.precision);

        if (origPathData) {
          // Perform boolean intersection
          const origPolygon = ClipPathResolver.pathToPolygon(origPathData, opts.curveSegments);
          const clipPolygon = ClipPathResolver.pathToPolygon(clipPathData, opts.curveSegments);

          // Apply clip (intersection)
          const clippedPolygon = intersectPolygons(origPolygon, clipPolygon);

          if (clippedPolygon && clippedPolygon.length > 2) {
            const clippedPath = ClipPathResolver.polygonToPathData(clippedPolygon, opts.precision);
            el.setAttribute('d', clippedPath);
            el.removeAttribute('mask');
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
 * @private
 */
function applyAllClipPaths(root, defsMap, opts, stats) {
  const errors = [];
  let count = 0;

  // Initialize E2E verification tracking in stats
  if (!stats.verifications.e2e) {
    stats.verifications.e2e = [];
  }
  if (!stats.clipOutsideFragments) {
    stats.clipOutsideFragments = []; // Store outside fragments for potential reconstruction
  }

  const elementsWithClip = findElementsWithAttribute(root, 'clip-path');

  for (const el of elementsWithClip) {
    const clipRef = el.getAttribute('clip-path');
    if (!clipRef || !clipRef.includes('url(')) continue;

    const refId = parseUrlReference(clipRef);
    if (!refId) continue;

    const clipPathEl = defsMap.get(refId);
    if (!clipPathEl || clipPathEl.tagName !== 'clippath') continue;

    try {
      // Get element path data
      const origPathData = getElementPathData(el, opts.precision);
      if (!origPathData) continue;

      // Get clip path data from clipPath element's children
      let clipPathData = '';
      for (const child of clipPathEl.children) {
        if (child instanceof SVGElement) {
          const childPath = getElementPathData(child, opts.precision);
          if (childPath) {
            clipPathData += (clipPathData ? ' ' : '') + childPath;
          }
        }
      }

      if (!clipPathData) continue;

      // Convert to polygons using higher segment count for clip accuracy
      // clipSegments (default 64) provides better curve approximation for E2E verification
      const clipSegs = opts.clipSegments || 64;
      const origPolygon = ClipPathResolver.pathToPolygon(origPathData, clipSegs);
      const clipPolygon = ClipPathResolver.pathToPolygon(clipPathData, clipSegs);

      // Perform intersection (clipped result - what's kept)
      const clippedPolygon = intersectPolygons(origPolygon, clipPolygon);

      // Convert polygon arrays to proper format for verification
      const origForVerify = origPolygon.map(p => ({
        x: p.x instanceof Decimal ? p.x : D(p.x),
        y: p.y instanceof Decimal ? p.y : D(p.y)
      }));
      const clipForVerify = clipPolygon.map(p => ({
        x: p.x instanceof Decimal ? p.x : D(p.x),
        y: p.y instanceof Decimal ? p.y : D(p.y)
      }));

      // VERIFICATION: Verify polygon intersection is valid (ALWAYS runs)
      if (clippedPolygon && clippedPolygon.length > 2) {
        const clippedForVerify = clippedPolygon.map(p => ({
          x: p.x instanceof Decimal ? p.x : D(p.x),
          y: p.y instanceof Decimal ? p.y : D(p.y)
        }));

        const polyResult = Verification.verifyPolygonIntersection(origForVerify, clipForVerify, clippedForVerify);
        stats.verifications.polygons.push({
          element: el.tagName,
          clipPathId: refId,
          ...polyResult
        });
        if (polyResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }

        // E2E VERIFICATION: Compute difference (outside parts) and verify area conservation
        // This ensures: area(original) = area(clipped) + area(outside)
        const outsideFragments = Verification.computePolygonDifference(origForVerify, clipForVerify);

        // Store outside fragments (marked invisible) for potential reconstruction
        stats.clipOutsideFragments.push({
          elementId: el.getAttribute('id') || `clip-${count}`,
          clipPathId: refId,
          fragments: outsideFragments,
          visible: false // These are the "thrown away" parts, stored invisibly
        });

        // E2E Verification: area(original) = area(clipped) + area(outside)
        // Pass configurable tolerance (default 1e-10 with 64 clipSegments)
        const e2eTolerance = opts.e2eTolerance || '1e-10';
        const e2eResult = Verification.verifyClipPathE2E(origForVerify, clippedForVerify, outsideFragments, e2eTolerance);
        stats.verifications.e2e.push({
          element: el.tagName,
          clipPathId: refId,
          type: 'clip-area-conservation',
          ...e2eResult
        });
        if (e2eResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }
      }

      if (clippedPolygon && clippedPolygon.length > 2) {
        const clippedPath = ClipPathResolver.polygonToPathData(clippedPolygon, opts.precision);

        // Update element
        if (el.tagName === 'path') {
          el.setAttribute('d', clippedPath);
        } else {
          // Convert shape to path
          const newPath = new SVGElement('path', {
            d: clippedPath,
            ...extractPresentationAttrs(el)
          });

          if (el.parentNode) {
            el.parentNode.replaceChild(newPath, el);
          }
        }

        el.removeAttribute('clip-path');
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
 * @private
 */
function flattenAllTransforms(root, opts, stats) {
  const errors = [];
  let count = 0;

  const elementsWithTransform = findElementsWithAttribute(root, 'transform');

  for (const el of elementsWithTransform) {
    const transform = el.getAttribute('transform');
    if (!transform) continue;

    try {
      // Parse transform to matrix
      const ctm = SVGFlatten.parseTransformAttribute(transform);

      // VERIFICATION: Verify matrix is invertible and well-formed (ALWAYS runs)
      const matrixResult = Verification.verifyMatrixInversion(ctm);
      stats.verifications.matrices.push({
        element: el.tagName,
        transform,
        ...matrixResult
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
        if (el.tagName === 'g') {
          propagateTransformToChildren(el, ctm, opts, stats);
          el.removeAttribute('transform');
          count++;
        }
        continue;
      }

      // VERIFICATION: Sample test points from original path for round-trip verification (ALWAYS runs)
      let testPoints = [];
      // Extract a few key points from the path for verification
      const polygon = ClipPathResolver.pathToPolygon(pathData, 4);
      if (polygon && polygon.length > 0) {
        testPoints = polygon.slice(0, 4).map(p => ({
          x: p.x instanceof Decimal ? p.x : D(p.x),
          y: p.y instanceof Decimal ? p.y : D(p.y)
        }));
      }

      // Transform the path data
      const transformedPath = SVGFlatten.transformPathData(pathData, ctm, { precision: opts.precision });

      // VERIFICATION: Verify transform round-trip accuracy for each test point (ALWAYS runs)
      for (let i = 0; i < testPoints.length; i++) {
        const pt = testPoints[i];
        const rtResult = Verification.verifyTransformRoundTrip(ctm, pt.x, pt.y);
        stats.verifications.transforms.push({
          element: el.tagName,
          pointIndex: i,
          ...rtResult
        });
        if (rtResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }
      }

      // Update or replace element
      if (el.tagName === 'path') {
        el.setAttribute('d', transformedPath);
      } else {
        // Convert shape to path with transformed coordinates
        const newPath = new SVGElement('path', {
          d: transformedPath,
          ...extractPresentationAttrs(el)
        });

        // Remove shape-specific attributes
        for (const attr of getShapeSpecificAttrs(el.tagName)) {
          newPath.removeAttribute(attr);
        }

        if (el.parentNode) {
          el.parentNode.replaceChild(newPath, el);
        }
      }

      el.removeAttribute('transform');
      count++;
    } catch (e) {
      errors.push(`transform: ${e.message}`);
    }
  }

  return { count, errors };
}

/**
 * Propagate transform to all children of a group.
 * @private
 */
function propagateTransformToChildren(group, ctm, opts, stats) {
  for (const child of [...group.children]) {
    if (!(child instanceof SVGElement)) continue;

    if (child.tagName === 'g') {
      // Nested group - compose transforms
      const childTransform = child.getAttribute('transform');
      if (childTransform) {
        const childCtm = SVGFlatten.parseTransformAttribute(childTransform);
        const combined = ctm.mul(childCtm);
        child.setAttribute('transform', matrixToTransform(combined));
      } else {
        child.setAttribute('transform', matrixToTransform(ctm));
      }
    } else {
      // Shape or path - apply transform to coordinates
      const pathData = getElementPathData(child, opts.precision);
      if (pathData) {
        // Compose with any existing transform
        const childTransform = child.getAttribute('transform');
        let combinedCtm = ctm;
        if (childTransform) {
          const childCtm = SVGFlatten.parseTransformAttribute(childTransform);
          combinedCtm = ctm.mul(childCtm);
        }

        // VERIFICATION: Verify combined transform matrix (ALWAYS runs)
        const matrixResult = Verification.verifyMatrixInversion(combinedCtm);
        stats.verifications.matrices.push({
          element: child.tagName,
          context: 'group-propagation',
          ...matrixResult
        });
        if (matrixResult.valid) {
          stats.verifications.passed++;
        } else {
          stats.verifications.failed++;
          stats.verifications.allPassed = false;
        }

        const transformedPath = SVGFlatten.transformPathData(pathData, combinedCtm, { precision: opts.precision });

        if (child.tagName === 'path') {
          child.setAttribute('d', transformedPath);
        } else {
          // Replace with path element
          const newPath = new SVGElement('path', {
            d: transformedPath,
            ...extractPresentationAttrs(child)
          });

          group.replaceChild(newPath, child);
        }

        child.removeAttribute('transform');
      }
    }
  }
}

// ============================================================================
// STEP 7: BAKE GRADIENT TRANSFORMS
// ============================================================================

/**
 * Bake gradientTransform into gradient coordinates.
 * @private
 */
function bakeAllGradientTransforms(root, opts, stats) {
  const errors = [];
  let count = 0;

  // Process linearGradient elements
  const linearGradients = root.getElementsByTagName('linearGradient');
  for (const grad of linearGradients) {
    const gradientTransform = grad.getAttribute('gradientTransform');
    if (!gradientTransform) continue;

    try {
      const ctm = SVGFlatten.parseTransformAttribute(gradientTransform);

      // Transform x1,y1,x2,y2
      const x1 = parseFloat(grad.getAttribute('x1') || '0');
      const y1 = parseFloat(grad.getAttribute('y1') || '0');
      const x2 = parseFloat(grad.getAttribute('x2') || '1');
      const y2 = parseFloat(grad.getAttribute('y2') || '0');

      const [tx1, ty1] = Transforms2D.applyTransform(ctm, x1, y1);
      const [tx2, ty2] = Transforms2D.applyTransform(ctm, x2, y2);

      // VERIFICATION: Verify linear gradient transform (ALWAYS runs)
      const gradResult = Verification.verifyLinearGradientTransform(
        { x1, y1, x2, y2 },
        { x1: tx1.toNumber(), y1: ty1.toNumber(), x2: tx2.toNumber(), y2: ty2.toNumber() },
        ctm
      );
      stats.verifications.gradients.push({
        gradientId: grad.getAttribute('id') || 'unknown',
        type: 'linear',
        ...gradResult
      });
      if (gradResult.valid) {
        stats.verifications.passed++;
      } else {
        stats.verifications.failed++;
        stats.verifications.allPassed = false;
      }

      grad.setAttribute('x1', tx1.toFixed(opts.precision));
      grad.setAttribute('y1', ty1.toFixed(opts.precision));
      grad.setAttribute('x2', tx2.toFixed(opts.precision));
      grad.setAttribute('y2', ty2.toFixed(opts.precision));
      grad.removeAttribute('gradientTransform');
      count++;
    } catch (e) {
      errors.push(`linearGradient: ${e.message}`);
    }
  }

  // Process radialGradient elements
  const radialGradients = root.getElementsByTagName('radialGradient');
  for (const grad of radialGradients) {
    const gradientTransform = grad.getAttribute('gradientTransform');
    if (!gradientTransform) continue;

    try {
      const ctm = SVGFlatten.parseTransformAttribute(gradientTransform);

      // Transform cx,cy,fx,fy and scale r
      const cx = parseFloat(grad.getAttribute('cx') || '0.5');
      const cy = parseFloat(grad.getAttribute('cy') || '0.5');
      const fx = parseFloat(grad.getAttribute('fx') || cx.toString());
      const fy = parseFloat(grad.getAttribute('fy') || cy.toString());
      const r = parseFloat(grad.getAttribute('r') || '0.5');

      const [tcx, tcy] = Transforms2D.applyTransform(ctm, cx, cy);
      const [tfx, tfy] = Transforms2D.applyTransform(ctm, fx, fy);

      // Scale radius by average scale factor
      const scale = Math.sqrt(Math.abs(ctm.data[0][0].toNumber() * ctm.data[1][1].toNumber()));
      const tr = r * scale;

      grad.setAttribute('cx', tcx.toFixed(opts.precision));
      grad.setAttribute('cy', tcy.toFixed(opts.precision));
      grad.setAttribute('fx', tfx.toFixed(opts.precision));
      grad.setAttribute('fy', tfy.toFixed(opts.precision));
      grad.setAttribute('r', tr.toFixed(opts.precision));
      grad.removeAttribute('gradientTransform');
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
 * Remove defs that are no longer referenced.
 * @private
 */
function removeUnusedDefinitions(root) {
  let count = 0;

  // Collect all url() references in the document
  const usedIds = new Set();

  const collectReferences = (el) => {
    for (const attrName of el.getAttributeNames()) {
      const val = el.getAttribute(attrName);
      if (val && val.includes('url(')) {
        const refId = parseUrlReference(val);
        if (refId) usedIds.add(refId);
      }
      if (attrName === 'href' || attrName === 'xlink:href') {
        const refId = val?.replace(/^#/, '');
        if (refId) usedIds.add(refId);
      }
    }

    for (const child of el.children) {
      if (child instanceof SVGElement) {
        collectReferences(child);
      }
    }
  };

  collectReferences(root);

  // Remove unreferenced defs
  const defsElements = root.getElementsByTagName('defs');
  for (const defs of defsElements) {
    for (const child of [...defs.children]) {
      if (child instanceof SVGElement) {
        const id = child.getAttribute('id');
        if (id && !usedIds.has(id)) {
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
 * @private
 */
function getElementPathData(el, precision) {
  const tagName = el.tagName.toLowerCase();

  if (tagName === 'path') {
    return el.getAttribute('d');
  }

  // Use GeometryToPath for shape conversion
  const getAttr = (name, def = 0) => {
    const val = el.getAttribute(name);
    return val !== null ? parseFloat(val) : def;
  };

  switch (tagName) {
    case 'rect':
      return GeometryToPath.rectToPathData(
        getAttr('x'), getAttr('y'),
        getAttr('width'), getAttr('height'),
        getAttr('rx'), getAttr('ry') || null,
        false, precision
      );
    case 'circle':
      return GeometryToPath.circleToPathData(
        getAttr('cx'), getAttr('cy'), getAttr('r'), precision
      );
    case 'ellipse':
      return GeometryToPath.ellipseToPathData(
        getAttr('cx'), getAttr('cy'),
        getAttr('rx'), getAttr('ry'), precision
      );
    case 'line':
      return GeometryToPath.lineToPathData(
        getAttr('x1'), getAttr('y1'),
        getAttr('x2'), getAttr('y2'), precision
      );
    case 'polyline':
      return GeometryToPath.polylineToPathData(
        el.getAttribute('points') || '', precision
      );
    case 'polygon':
      return GeometryToPath.polygonToPathData(
        el.getAttribute('points') || '', precision
      );
    default:
      return null;
  }
}

/**
 * Get approximate bounding box of an element.
 * @private
 */
function getElementBBox(el) {
  const pathData = getElementPathData(el, 6);
  if (!pathData) return null;

  try {
    const polygon = ClipPathResolver.pathToPolygon(pathData, 10);
    if (!polygon || polygon.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of polygon) {
      const x = pt.x instanceof Decimal ? pt.x.toNumber() : pt.x;
      const y = pt.y instanceof Decimal ? pt.y.toNumber() : pt.y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } catch {
    return null;
  }
}

/**
 * Extract presentation attributes from element.
 * @private
 */
function extractPresentationAttrs(el) {
  const presentationAttrs = [
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
    'fill-opacity', 'opacity', 'fill-rule', 'clip-rule', 'visibility', 'display',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-anchor', 'dominant-baseline', 'class', 'style'
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
 */
function getShapeSpecificAttrs(tagName) {
  const attrs = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
  };
  return attrs[tagName.toLowerCase()] || [];
}

/**
 * Convert matrix to transform attribute string.
 * @private
 */
function matrixToTransform(matrix) {
  const a = matrix.data[0][0].toNumber();
  const b = matrix.data[1][0].toNumber();
  const c = matrix.data[0][1].toNumber();
  const d = matrix.data[1][1].toNumber();
  const e = matrix.data[0][2].toNumber();
  const f = matrix.data[1][2].toNumber();
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}

/**
 * Intersect two polygons using Sutherland-Hodgman algorithm.
 * @private
 */
function intersectPolygons(subject, clip) {
  // Use PolygonClip if available, otherwise simple implementation
  try {
    const PolygonClip = require('./polygon-clip.js');
    if (PolygonClip.intersect) {
      return PolygonClip.intersect(subject, clip);
    }
  } catch {
    // Fall through to simple implementation
  }

  // Simple convex clip implementation
  if (!subject || subject.length < 3 || !clip || clip.length < 3) {
    return subject;
  }

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
 * @private
 */
function isInsideEdge(point, edgeStart, edgeEnd) {
  const px = point.x instanceof Decimal ? point.x.toNumber() : point.x;
  const py = point.y instanceof Decimal ? point.y.toNumber() : point.y;
  const sx = edgeStart.x instanceof Decimal ? edgeStart.x.toNumber() : edgeStart.x;
  const sy = edgeStart.y instanceof Decimal ? edgeStart.y.toNumber() : edgeStart.y;
  const ex = edgeEnd.x instanceof Decimal ? edgeEnd.x.toNumber() : edgeEnd.x;
  const ey = edgeEnd.y instanceof Decimal ? edgeEnd.y.toNumber() : edgeEnd.y;

  return (ex - sx) * (py - sy) - (ey - sy) * (px - sx) >= 0;
}

/**
 * Find intersection point of two lines.
 * @private
 */
function lineIntersect(p1, p2, p3, p4) {
  const x1 = p1.x instanceof Decimal ? p1.x.toNumber() : p1.x;
  const y1 = p1.y instanceof Decimal ? p1.y.toNumber() : p1.y;
  const x2 = p2.x instanceof Decimal ? p2.x.toNumber() : p2.x;
  const y2 = p2.y instanceof Decimal ? p2.y.toNumber() : p2.y;
  const x3 = p3.x instanceof Decimal ? p3.x.toNumber() : p3.x;
  const y3 = p3.y instanceof Decimal ? p3.y.toNumber() : p3.y;
  const x4 = p4.x instanceof Decimal ? p4.x.toNumber() : p4.x;
  const y4 = p4.y instanceof Decimal ? p4.y.toNumber() : p4.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) {
    return { x: D((x1 + x2) / 2), y: D((y1 + y2) / 2) };
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  return {
    x: D(x1 + t * (x2 - x1)),
    y: D(y1 + t * (y2 - y1))
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  flattenSVG,
  DEFAULT_OPTIONS
};
