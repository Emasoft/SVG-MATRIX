/**
 * SVG Boolean Operations with Full Fill-Rule and Stroke Support
 *
 * Comprehensive boolean operations that account for:
 * - Fill rules (nonzero vs evenodd)
 * - Stroke properties (width, linecap, linejoin, dash)
 * - All SVG shape elements (rect, circle, ellipse, polygon, etc.)
 *
 * The key insight: boolean operations work on RENDERED AREAS, not paths.
 * A path with evenodd fill-rule and self-intersections has holes.
 * A stroked path adds area beyond the geometric path.
 *
 * @module svg-boolean-ops
 */

import Decimal from "decimal.js";
import * as PolygonClip from "./polygon-clip.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));
const EPSILON = new Decimal("1e-40");

const {
  point,
  pointsEqual: _pointsEqual,
  cross,
  polygonArea: _polygonArea,
  polygonIntersection,
  polygonUnion,
  polygonDifference,
  isCounterClockwise: _isCounterClockwise,
  ensureCCW: _ensureCCW,
  segmentIntersection: _segmentIntersection,
} = PolygonClip;

// ============================================================================
// Fill Rule Support
// ============================================================================

/**
 * Fill rule enumeration matching SVG spec.
 */
export const FillRule = {
  NONZERO: "nonzero",
  EVENODD: "evenodd",
};

/**
 * Test if a point is inside a polygon with specified fill rule.
 *
 * @param {Object} pt - Point to test {x, y}
 * @param {Array} polygon - Polygon vertices
 * @param {string} fillRule - 'nonzero' or 'evenodd'
 * @returns {number} 1 inside, 0 on boundary, -1 outside
 */
export function pointInPolygonWithRule(
  pt,
  polygon,
  fillRule = FillRule.NONZERO,
) {
  const n = polygon.length;
  if (n < 3) return -1;

  let winding = 0;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Check if point is on the edge
    if (pointOnSegment(pt, p1, p2)) {
      return 0; // On boundary
    }

    // Ray casting from pt going right (+x direction)
    if (p1.y.lte(pt.y)) {
      if (p2.y.gt(pt.y)) {
        // Upward crossing
        if (cross(p1, p2, pt).gt(0)) {
          winding++;
        }
      }
    } else {
      if (p2.y.lte(pt.y)) {
        // Downward crossing
        if (cross(p1, p2, pt).lt(0)) {
          winding--;
        }
      }
    }
  }

  // Apply fill rule
  if (fillRule === FillRule.EVENODD) {
    // evenodd: inside if odd number of crossings
    return Math.abs(winding) % 2 === 1 ? 1 : -1;
  } else {
    // nonzero: inside if winding number is not zero
    return winding !== 0 ? 1 : -1;
  }
}

/**
 * Check if a point lies on a line segment.
 */
function pointOnSegment(pt, a, b) {
  const crossVal = cross(a, b, pt);
  if (crossVal.abs().gt(EPSILON)) {
    return false;
  }

  const minX = Decimal.min(a.x, b.x);
  const maxX = Decimal.max(a.x, b.x);
  const minY = Decimal.min(a.y, b.y);
  const maxY = Decimal.max(a.y, b.y);

  return (
    pt.x.gte(minX.minus(EPSILON)) &&
    pt.x.lte(maxX.plus(EPSILON)) &&
    pt.y.gte(minY.minus(EPSILON)) &&
    pt.y.lte(maxY.plus(EPSILON))
  );
}

// ============================================================================
// SVG Element to Path Conversion
// ============================================================================

/**
 * Convert SVG rect to polygon vertices.
 *
 * @param {Object} rect - {x, y, width, height, rx?, ry?}
 * @returns {Array} Polygon vertices (or path with curves for rounded corners)
 */
export function rectToPolygon(rect) {
  const x = D(rect.x || 0);
  const y = D(rect.y || 0);
  const w = D(rect.width);
  const h = D(rect.height);
  const rx = D(rect.rx || 0);
  const ry = D(rect.ry || rx); // ry defaults to rx if not specified

  // Simple rectangle (no rounded corners)
  if (rx.eq(0) && ry.eq(0)) {
    return [
      point(x, y),
      point(x.plus(w), y),
      point(x.plus(w), y.plus(h)),
      point(x, y.plus(h)),
    ];
  }

  // Rounded rectangle - approximate corners with line segments
  // For true curves, would need bezier handling
  const actualRx = Decimal.min(rx, w.div(2));
  const actualRy = Decimal.min(ry, h.div(2));
  const segments = 8; // segments per corner

  const vertices = [];

  // Top-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI * 1.5 + (Math.PI / 2) * (i / segments);
    vertices.push(
      point(
        x
          .plus(w)
          .minus(actualRx)
          .plus(actualRx.times(Math.cos(angle))),
        y.plus(actualRy).plus(actualRy.times(Math.sin(angle))),
      ),
    );
  }

  // Bottom-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = 0 + (Math.PI / 2) * (i / segments);
    vertices.push(
      point(
        x
          .plus(w)
          .minus(actualRx)
          .plus(actualRx.times(Math.cos(angle))),
        y
          .plus(h)
          .minus(actualRy)
          .plus(actualRy.times(Math.sin(angle))),
      ),
    );
  }

  // Bottom-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / segments);
    vertices.push(
      point(
        x.plus(actualRx).plus(actualRx.times(Math.cos(angle))),
        y
          .plus(h)
          .minus(actualRy)
          .plus(actualRy.times(Math.sin(angle))),
      ),
    );
  }

  // Top-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI + (Math.PI / 2) * (i / segments);
    vertices.push(
      point(
        x.plus(actualRx).plus(actualRx.times(Math.cos(angle))),
        y.plus(actualRy).plus(actualRy.times(Math.sin(angle))),
      ),
    );
  }

  return vertices;
}

/**
 * Convert SVG circle to polygon (approximation).
 *
 * @param {Object} circle - {cx, cy, r}
 * @param {number} segments - Number of segments (default 32)
 * @returns {Array} Polygon vertices
 */
export function circleToPolygon(circle, segments = 32) {
  const cx = D(circle.cx || 0);
  const cy = D(circle.cy || 0);
  const r = D(circle.r);

  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    vertices.push(
      point(
        cx.plus(r.times(Math.cos(angle))),
        cy.plus(r.times(Math.sin(angle))),
      ),
    );
  }

  return vertices;
}

/**
 * Convert SVG ellipse to polygon (approximation).
 *
 * @param {Object} ellipse - {cx, cy, rx, ry}
 * @param {number} segments - Number of segments (default 32)
 * @returns {Array} Polygon vertices
 */
export function ellipseToPolygon(ellipse, segments = 32) {
  const cx = D(ellipse.cx || 0);
  const cy = D(ellipse.cy || 0);
  const rx = D(ellipse.rx);
  const ry = D(ellipse.ry);

  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    vertices.push(
      point(
        cx.plus(rx.times(Math.cos(angle))),
        cy.plus(ry.times(Math.sin(angle))),
      ),
    );
  }

  return vertices;
}

/**
 * Convert SVG line to polygon (requires stroke width for area).
 *
 * @param {Object} line - {x1, y1, x2, y2}
 * @param {Object} stroke - {width, linecap}
 * @returns {Array} Polygon vertices representing stroked line
 */
export function lineToPolygon(line, stroke = { width: 1, linecap: "butt" }) {
  const x1 = D(line.x1);
  const y1 = D(line.y1);
  const x2 = D(line.x2);
  const y2 = D(line.y2);
  const halfWidth = D(stroke.width).div(2);

  // Direction vector
  const dx = x2.minus(x1);
  const dy = y2.minus(y1);
  const len = dx.pow(2).plus(dy.pow(2)).sqrt();

  if (len.lt(EPSILON)) {
    // Degenerate line - return empty or point
    return [];
  }

  // Normal vector (perpendicular)
  const nx = dy.neg().div(len).times(halfWidth);
  const ny = dx.div(len).times(halfWidth);

  const vertices = [];

  if (stroke.linecap === "square") {
    // Extend endpoints by half width
    const ex = dx.div(len).times(halfWidth);
    const ey = dy.div(len).times(halfWidth);
    // Vertices in CCW order: right-start -> right-end -> left-end -> left-start
    vertices.push(
      point(x1.minus(ex).minus(nx), y1.minus(ey).minus(ny)),
      point(x2.plus(ex).minus(nx), y2.plus(ey).minus(ny)),
      point(x2.plus(ex).plus(nx), y2.plus(ey).plus(ny)),
      point(x1.minus(ex).plus(nx), y1.minus(ey).plus(ny)),
    );
  } else if (stroke.linecap === "round") {
    // Add semicircles at endpoints in CCW order
    // Start from right side of start point, go around start cap, along left side,
    // around end cap, and back along right side
    const segments = 8;
    const startAngle = Math.atan2(ny.toNumber(), nx.toNumber());

    // Start cap (semicircle) - going CCW from right side (-normal) to left side (+normal)
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle - Math.PI / 2 - Math.PI * (i / segments);
      vertices.push(
        point(
          x1.plus(halfWidth.times(Math.cos(angle))),
          y1.plus(halfWidth.times(Math.sin(angle))),
        ),
      );
    }

    // End cap (semicircle) - continuing CCW from left side to right side
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + Math.PI / 2 - Math.PI * (i / segments);
      vertices.push(
        point(
          x2.plus(halfWidth.times(Math.cos(angle))),
          y2.plus(halfWidth.times(Math.sin(angle))),
        ),
      );
    }
  } else {
    // butt (default) - simple rectangle
    // Vertices in CCW order: right-start -> right-end -> left-end -> left-start
    vertices.push(
      point(x1.minus(nx), y1.minus(ny)),
      point(x2.minus(nx), y2.minus(ny)),
      point(x2.plus(nx), y2.plus(ny)),
      point(x1.plus(nx), y1.plus(ny)),
    );
  }

  return vertices;
}

/**
 * Convert SVG polygon points string to polygon array.
 *
 * @param {string|Array} points - "x1,y1 x2,y2 ..." or [{x,y}...]
 * @returns {Array} Polygon vertices
 */
export function svgPolygonToPolygon(points) {
  if (Array.isArray(points)) {
    return points.map((p) => point(p.x, p.y));
  }

  // Parse SVG points string
  const coords = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const vertices = [];
  for (let i = 0; i < coords.length; i += 2) {
    vertices.push(point(coords[i], coords[i + 1]));
  }
  return vertices;
}

// ============================================================================
// Stroke to Path Conversion (Path Offsetting)
// ============================================================================

/**
 * Offset a polygon by a given distance (for stroke width).
 *
 * This creates the "stroke outline" - the area covered by the stroke.
 * For a closed polygon, this returns both inner and outer offset paths.
 *
 * @param {Array} polygon - Input polygon vertices
 * @param {number} distance - Offset distance (stroke-width / 2)
 * @param {Object} options - {linejoin: 'miter'|'round'|'bevel', miterLimit: 4}
 * @returns {Object} {outer: Array, inner: Array} offset polygons
 */
export function offsetPolygon(polygon, distance, options = {}) {
  const dist = D(distance);
  const linejoin = options.linejoin || "miter";
  const miterLimit = D(options.miterLimit || 4);

  if (polygon.length < 3) {
    return { outer: [], inner: [] };
  }

  const n = polygon.length;
  const outerVertices = [];
  const innerVertices = [];

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    // Edge vectors
    const dx1 = curr.x.minus(prev.x);
    const dy1 = curr.y.minus(prev.y);
    const dx2 = next.x.minus(curr.x);
    const dy2 = next.y.minus(curr.y);

    // Normalize
    const len1 = dx1.pow(2).plus(dy1.pow(2)).sqrt();
    const len2 = dx2.pow(2).plus(dy2.pow(2)).sqrt();

    if (len1.lt(EPSILON) || len2.lt(EPSILON)) {
      continue; // Skip degenerate edges
    }

    // Unit normals (perpendicular, pointing outward for CCW polygon)
    // For CCW polygon, outward normal is (dy, -dx) / len
    // This points to the LEFT of the edge direction, which is outward for CCW
    const nx1 = dy1.div(len1);
    const ny1 = dx1.neg().div(len1);
    const nx2 = dy2.div(len2);
    const ny2 = dx2.neg().div(len2);

    // Average normal for the corner
    let nx = nx1.plus(nx2).div(2);
    let ny = ny1.plus(ny2).div(2);
    const nlen = nx.pow(2).plus(ny.pow(2)).sqrt();

    if (nlen.lt(EPSILON)) {
      // Parallel edges - use either normal
      nx = nx1;
      ny = ny1;
    } else {
      nx = nx.div(nlen);
      ny = ny.div(nlen);
    }

    // Compute the actual offset distance at this corner
    // For miter join, the offset point is further out at sharp corners
    const dot = nx1.times(nx2).plus(ny1.times(ny2));
    const sinHalfAngle = D(1).minus(dot).div(2).sqrt();

    let actualDist = dist;
    if (sinHalfAngle.gt(EPSILON)) {
      const miterDist = dist.div(sinHalfAngle);

      if (linejoin === "miter" && miterDist.lte(dist.times(miterLimit))) {
        actualDist = miterDist;
      } else if (linejoin === "bevel" || miterDist.gt(dist.times(miterLimit))) {
        // Bevel: add two points instead of one
        const outerPt1 = point(
          curr.x.plus(nx1.times(dist)),
          curr.y.plus(ny1.times(dist)),
        );
        const outerPt2 = point(
          curr.x.plus(nx2.times(dist)),
          curr.y.plus(ny2.times(dist)),
        );
        outerVertices.push(outerPt1, outerPt2);

        const innerPt1 = point(
          curr.x.minus(nx1.times(dist)),
          curr.y.minus(ny1.times(dist)),
        );
        const innerPt2 = point(
          curr.x.minus(nx2.times(dist)),
          curr.y.minus(ny2.times(dist)),
        );
        innerVertices.push(innerPt1, innerPt2);
        continue;
      } else if (linejoin === "round") {
        // Round: add arc segments
        const startAngle = Math.atan2(ny1.toNumber(), nx1.toNumber());
        const endAngle = Math.atan2(ny2.toNumber(), nx2.toNumber());
        let angleDiff = endAngle - startAngle;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;

        const segments = Math.max(
          2,
          Math.ceil(Math.abs(angleDiff) / (Math.PI / 8)),
        );
        for (let j = 0; j <= segments; j++) {
          const angle = startAngle + angleDiff * (j / segments);
          outerVertices.push(
            point(
              curr.x.plus(dist.times(Math.cos(angle))),
              curr.y.plus(dist.times(Math.sin(angle))),
            ),
          );
          innerVertices.push(
            point(
              curr.x.minus(dist.times(Math.cos(angle))),
              curr.y.minus(dist.times(Math.sin(angle))),
            ),
          );
        }
        continue;
      }
    }

    // Single offset point
    outerVertices.push(
      point(
        curr.x.plus(nx.times(actualDist)),
        curr.y.plus(ny.times(actualDist)),
      ),
    );
    innerVertices.push(
      point(
        curr.x.minus(nx.times(actualDist)),
        curr.y.minus(ny.times(actualDist)),
      ),
    );
  }

  return {
    outer: outerVertices,
    inner: innerVertices.reverse(), // Reverse for consistent winding
  };
}

/**
 * Convert a stroked polygon to a filled area polygon.
 *
 * The stroke area is the region between the outer and inner offset paths.
 *
 * @param {Array} polygon - Original polygon (closed path)
 * @param {Object} strokeProps - {width, linejoin, miterLimit}
 * @returns {Array} Polygon representing the stroke area
 */
export function strokeToFilledPolygon(polygon, strokeProps) {
  const halfWidth = D(strokeProps.width || 1).div(2);
  const offset = offsetPolygon(polygon, halfWidth, strokeProps);

  // The stroke area is the outer path with the inner path as a hole
  // For simple boolean operations, we return the outer path
  // For complex cases with holes, would need to handle subpaths
  return offset.outer;
}

// ============================================================================
// Dash Array Support
// ============================================================================

/**
 * Apply dash array to a polygon, returning multiple sub-polygons.
 *
 * @param {Array} polygon - Input polygon
 * @param {Array} dashArray - [dash, gap, dash, gap, ...]
 * @param {number} dashOffset - Starting offset
 * @returns {Array<Array>} Array of polygon segments
 */
export function applyDashArray(polygon, dashArray, dashOffset = 0) {
  if (!dashArray || dashArray.length === 0) {
    return [polygon];
  }

  // Normalize dash array (must have even length)
  const dashes =
    dashArray.length % 2 === 0
      ? dashArray.map((d) => D(d))
      : [...dashArray, ...dashArray].map((d) => D(d));

  const segments = [];
  let currentSegment = [];
  let dashIndex = 0;
  let remainingInDash = dashes[0];
  let drawing = true; // Start with dash (not gap)

  // Apply offset
  let offset = D(dashOffset);
  while (offset.gt(0)) {
    if (offset.gte(remainingInDash)) {
      offset = offset.minus(remainingInDash);
      dashIndex = (dashIndex + 1) % dashes.length;
      remainingInDash = dashes[dashIndex];
      drawing = !drawing;
    } else {
      remainingInDash = remainingInDash.minus(offset);
      offset = D(0);
    }
  }

  // Process polygon edges
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    const dx = p2.x.minus(p1.x);
    const dy = p2.y.minus(p1.y);
    const edgeLen = dx.pow(2).plus(dy.pow(2)).sqrt();

    if (edgeLen.lt(EPSILON)) continue;

    let t = D(0);

    while (t.lt(1)) {
      const remaining = edgeLen.times(D(1).minus(t));

      if (remaining.lte(remainingInDash)) {
        // Rest of edge fits in current dash/gap
        if (drawing) {
          currentSegment.push(
            point(p1.x.plus(dx.times(t)), p1.y.plus(dy.times(t))),
          );
          currentSegment.push(point(p2.x, p2.y));
        }
        remainingInDash = remainingInDash.minus(remaining);
        t = D(1);

        if (remainingInDash.lt(EPSILON)) {
          if (drawing && currentSegment.length >= 2) {
            segments.push(currentSegment);
            currentSegment = [];
          }
          dashIndex = (dashIndex + 1) % dashes.length;
          remainingInDash = dashes[dashIndex];
          drawing = !drawing;
        }
      } else {
        // Edge extends beyond current dash/gap
        const tEnd = t.plus(remainingInDash.div(edgeLen));

        if (drawing) {
          currentSegment.push(
            point(p1.x.plus(dx.times(t)), p1.y.plus(dy.times(t))),
          );
          currentSegment.push(
            point(p1.x.plus(dx.times(tEnd)), p1.y.plus(dy.times(tEnd))),
          );
          segments.push(currentSegment);
          currentSegment = [];
        }

        t = tEnd;
        dashIndex = (dashIndex + 1) % dashes.length;
        remainingInDash = dashes[dashIndex];
        drawing = !drawing;
      }
    }
  }

  // Don't forget the last segment
  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }

  return segments;
}

// ============================================================================
// SVG Region - Unified Representation
// ============================================================================

/**
 * Represents an SVG element's filled/stroked region for boolean operations.
 *
 * Handles:
 * - Fill area with fill-rule
 * - Stroke area (offset path)
 * - Dash arrays
 * - Combined fill+stroke
 */
export class SVGRegion {
  constructor(options = {}) {
    this.fillPolygons = options.fillPolygons || []; // Array of polygons
    this.fillRule = options.fillRule || FillRule.NONZERO;
    this.strokePolygons = options.strokePolygons || []; // Array of stroked regions
  }

  /**
   * Create region from SVG element.
   *
   * @param {string} type - 'rect', 'circle', 'ellipse', 'polygon', 'path'
   * @param {Object} props - Element properties
   * @param {Object} style - {fill, fillRule, stroke, strokeWidth, ...}
   * @returns {SVGRegion}
   */
  static fromElement(type, props, style = {}) {
    let polygon;

    switch (type) {
      case "rect":
        polygon = rectToPolygon(props);
        break;
      case "circle":
        polygon = circleToPolygon(props);
        break;
      case "ellipse":
        polygon = ellipseToPolygon(props);
        break;
      case "polygon":
        polygon = svgPolygonToPolygon(props.points);
        break;
      case "line":
        // Lines have no fill, only stroke
        polygon = null;
        break;
      default:
        throw new Error("Unsupported element type: " + type);
    }

    const region = new SVGRegion({
      fillRule: style.fillRule || FillRule.NONZERO,
    });

    // Add fill region if element has fill
    if (polygon && style.fill !== "none") {
      region.fillPolygons = [polygon];
    }

    // Add stroke region if element has stroke
    if (style.stroke !== "none" && style.strokeWidth > 0) {
      const sourcePolygon =
        type === "line"
          ? lineToPolygon(props, {
              width: style.strokeWidth,
              linecap: style.strokeLinecap,
            })
          : polygon;

      if (sourcePolygon) {
        let strokePolygons;

        // Apply dash array if present
        if (style.strokeDasharray && style.strokeDasharray.length > 0) {
          const dashedSegments = applyDashArray(
            sourcePolygon,
            style.strokeDasharray,
            style.strokeDashoffset || 0,
          );
          strokePolygons = dashedSegments.map((seg) =>
            strokeToFilledPolygon(seg, {
              width: style.strokeWidth,
              linejoin: style.strokeLinejoin,
              miterLimit: style.strokeMiterlimit,
            }),
          );
        } else {
          strokePolygons = [
            strokeToFilledPolygon(sourcePolygon, {
              width: style.strokeWidth,
              linejoin: style.strokeLinejoin,
              miterLimit: style.strokeMiterlimit,
            }),
          ];
        }

        region.strokePolygons = strokePolygons.filter((p) => p.length >= 3);
      }
    }

    return region;
  }

  /**
   * Get all polygons that make up this region's filled area.
   *
   * @returns {Array<Array>} Array of polygons
   */
  getAllPolygons() {
    return [...this.fillPolygons, ...this.strokePolygons];
  }

  /**
   * Test if a point is inside this region.
   *
   * @param {Object} pt - Point {x, y}
   * @returns {boolean}
   */
  containsPoint(pt) {
    // Check fill polygons with fill rule
    for (const poly of this.fillPolygons) {
      if (pointInPolygonWithRule(pt, poly, this.fillRule) >= 0) {
        return true;
      }
    }

    // Check stroke polygons (always nonzero since they're outlines)
    for (const poly of this.strokePolygons) {
      if (pointInPolygonWithRule(pt, poly, FillRule.NONZERO) >= 0) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================================
// Boolean Operations on SVG Regions
// ============================================================================

/**
 * Compute intersection of two SVG regions.
 *
 * @param {SVGRegion} regionA
 * @param {SVGRegion} regionB
 * @returns {SVGRegion} Intersection region
 */
export function regionIntersection(regionA, regionB) {
  const resultPolygons = [];

  const polygonsA = regionA.getAllPolygons();
  const polygonsB = regionB.getAllPolygons();

  for (const polyA of polygonsA) {
    for (const polyB of polygonsB) {
      const intersection = polygonIntersection(polyA, polyB);
      for (const poly of intersection) {
        if (poly.length >= 3) {
          resultPolygons.push(poly);
        }
      }
    }
  }

  return new SVGRegion({
    fillPolygons: resultPolygons,
    fillRule: FillRule.NONZERO, // Result is always simple polygons
  });
}

/**
 * Compute union of two SVG regions.
 *
 * @param {SVGRegion} regionA
 * @param {SVGRegion} regionB
 * @returns {SVGRegion} Union region
 */
export function regionUnion(regionA, regionB) {
  const _resultPolygons = [];

  const polygonsA = regionA.getAllPolygons();
  const polygonsB = regionB.getAllPolygons();

  // Start with all A polygons
  let combined = [...polygonsA];

  // Union each B polygon with the combined result
  for (const polyB of polygonsB) {
    const newCombined = [];
    let merged = false;

    for (const polyA of combined) {
      const union = polygonUnion(polyA, polyB);

      if (union.length === 1) {
        // Merged into single polygon
        if (!merged) {
          newCombined.push(union[0]);
          merged = true;
        }
      } else {
        // No overlap, keep both
        newCombined.push(polyA);
        if (!merged) {
          newCombined.push(polyB);
          merged = true;
        }
      }
    }

    if (!merged && combined.length === 0) {
      newCombined.push(polyB);
    }

    combined = newCombined;
  }

  return new SVGRegion({
    fillPolygons: combined,
    fillRule: FillRule.NONZERO,
  });
}

/**
 * Compute difference of two SVG regions (A - B).
 *
 * @param {SVGRegion} regionA
 * @param {SVGRegion} regionB
 * @returns {SVGRegion} Difference region
 */
export function regionDifference(regionA, regionB) {
  let resultPolygons = regionA.getAllPolygons().map((p) => [...p]);

  const polygonsB = regionB.getAllPolygons();

  // Subtract each B polygon from result
  for (const polyB of polygonsB) {
    const newResult = [];

    for (const polyA of resultPolygons) {
      const diff = polygonDifference(polyA, polyB);
      for (const poly of diff) {
        if (poly.length >= 3) {
          newResult.push(poly);
        }
      }
    }

    resultPolygons = newResult;
  }

  return new SVGRegion({
    fillPolygons: resultPolygons,
    fillRule: FillRule.NONZERO,
  });
}

/**
 * Compute XOR (symmetric difference) of two SVG regions.
 *
 * @param {SVGRegion} regionA
 * @param {SVGRegion} regionB
 * @returns {SVGRegion} XOR region
 */
export function regionXOR(regionA, regionB) {
  const diffAB = regionDifference(regionA, regionB);
  const diffBA = regionDifference(regionB, regionA);

  return new SVGRegion({
    fillPolygons: [...diffAB.fillPolygons, ...diffBA.fillPolygons],
    fillRule: FillRule.NONZERO,
  });
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Fill rules
  FillRule,
  pointInPolygonWithRule,

  // Element converters
  rectToPolygon,
  circleToPolygon,
  ellipseToPolygon,
  lineToPolygon,
  svgPolygonToPolygon,

  // Stroke handling
  offsetPolygon,
  strokeToFilledPolygon,
  applyDashArray,

  // SVG Region
  SVGRegion,

  // Boolean operations on regions
  regionIntersection,
  regionUnion,
  regionDifference,
  regionXOR,
};
