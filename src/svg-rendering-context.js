/**
 * SVG Rendering Context - Tracks ALL SVG properties affecting rendered geometry
 *
 * This module provides a comprehensive representation of SVG rendering properties
 * that affect the actual visible/filled area of an element. Every function that
 * operates on SVG geometry MUST use this context to account for:
 *
 * 1. Fill properties (fill-rule, fill-opacity)
 * 2. Stroke properties (width, linecap, linejoin, miterlimit, dasharray, dashoffset)
 * 3. Markers (marker-start, marker-mid, marker-end)
 * 4. Paint order (fill, stroke, markers rendering order)
 * 5. Clipping (clip-path, clip-rule)
 * 6. Masking (mask, mask-type)
 * 7. Opacity (opacity, fill-opacity, stroke-opacity)
 * 8. Transforms (transform, vector-effect)
 * 9. Filters (filter)
 *
 * ## Critical Insight
 *
 * SVG boolean operations, collision detection, off-canvas detection, and path
 * merging must ALL account for the RENDERED AREA, not just path geometry.
 *
 * A path with stroke-width: 50 extends 25 units beyond its geometric boundary.
 * A path with markers has additional geometry at vertices.
 * A path with evenodd fill-rule may have holes that don't participate in collisions.
 *
 * @module svg-rendering-context
 */

import Decimal from 'decimal.js';
import { FillRule, pointInPolygonWithRule, offsetPolygon, strokeToFilledPolygon } from './svg-boolean-ops.js';
import * as PolygonClip from './polygon-clip.js';

Decimal.set({ precision: 80 });

const D = x => (x instanceof Decimal ? x : new Decimal(x));

/**
 * Default SVG property values per SVG 1.1/2.0 specification
 */
export const SVG_DEFAULTS = {
  // Fill properties
  fill: 'black',
  'fill-rule': 'nonzero',
  'fill-opacity': 1,

  // Stroke properties
  stroke: 'none',
  'stroke-width': 1,
  'stroke-linecap': 'butt',      // butt | round | square
  'stroke-linejoin': 'miter',    // miter | round | bevel
  'stroke-miterlimit': 4,
  'stroke-dasharray': 'none',
  'stroke-dashoffset': 0,
  'stroke-opacity': 1,

  // Markers
  'marker-start': 'none',
  'marker-mid': 'none',
  'marker-end': 'none',

  // Paint order (SVG 2)
  'paint-order': 'normal',       // normal = fill stroke markers

  // Clipping
  'clip-path': 'none',
  'clip-rule': 'nonzero',

  // Masking
  'mask': 'none',
  'mask-type': 'luminance',      // luminance | alpha

  // Opacity
  'opacity': 1,

  // Transform
  'transform': 'none',
  'vector-effect': 'none',       // none | non-scaling-stroke

  // Filter
  'filter': 'none'
};

/**
 * Properties that affect the geometric extent of an element
 */
export const GEOMETRY_AFFECTING_PROPERTIES = [
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'marker-start',
  'marker-mid',
  'marker-end',
  'filter',
  'transform'
];

/**
 * Properties that affect what's considered "inside" a shape
 */
export const FILL_AFFECTING_PROPERTIES = [
  'fill-rule',
  'clip-rule'
];

/**
 * SVG Rendering Context class
 *
 * Extracts and stores all rendering properties from an SVG element,
 * providing methods to compute the actual rendered geometry.
 */
export class SVGRenderingContext {
  /**
   * Create a rendering context from an SVG element
   * @param {Object} element - SVG element (from svg-parser.js)
   * @param {Object} inherited - Inherited properties from parent elements
   * @param {Map} defsMap - Map of definitions (gradients, markers, clipPaths, etc.)
   */
  constructor(element, inherited = {}, defsMap = null) {
    this.element = element;
    this.defsMap = defsMap || new Map();

    // Extract all properties with inheritance
    this.properties = this._extractProperties(element, inherited);

    // Parse stroke-dasharray into array
    this.dashArray = this._parseDashArray(this.properties['stroke-dasharray']);
    this.dashOffset = D(this.properties['stroke-dashoffset'] || 0);

    // Parse marker references
    this.markers = {
      start: this._parseMarkerRef(this.properties['marker-start']),
      mid: this._parseMarkerRef(this.properties['marker-mid']),
      end: this._parseMarkerRef(this.properties['marker-end'])
    };

    // Determine if element has visible fill
    this.hasFill = this.properties.fill !== 'none' &&
                   this.properties['fill-opacity'] > 0;

    // Determine if element has visible stroke
    this.hasStroke = this.properties.stroke !== 'none' &&
                     D(this.properties['stroke-width']).gt(0) &&
                     this.properties['stroke-opacity'] > 0;

    // Determine if element has markers
    this.hasMarkers = this.markers.start || this.markers.mid || this.markers.end;
  }

  /**
   * Extract all rendering properties from element with inheritance
   * @private
   */
  _extractProperties(element, inherited) {
    const props = { ...SVG_DEFAULTS, ...inherited };

    // Get attributes from element
    if (element && element.getAttributeNames) {
      for (const attr of element.getAttributeNames()) {
        const value = element.getAttribute(attr);
        if (value !== null && value !== undefined) {
          props[attr] = value;
        }
      }
    }

    // Parse style attribute
    if (props.style) {
      const styleProps = this._parseStyleAttribute(props.style);
      Object.assign(props, styleProps);
    }

    // Convert numeric properties
    const numericProps = ['stroke-width', 'stroke-miterlimit', 'stroke-dashoffset',
                          'opacity', 'fill-opacity', 'stroke-opacity'];
    for (const prop of numericProps) {
      if (typeof props[prop] === 'string') {
        const parsed = parseFloat(props[prop]);
        if (!isNaN(parsed)) {
          props[prop] = parsed;
        }
      }
    }

    return props;
  }

  /**
   * Parse CSS style attribute into property object
   * @private
   */
  _parseStyleAttribute(style) {
    const props = {};
    if (!style) return props;

    const declarations = style.split(';');
    for (const decl of declarations) {
      const [prop, value] = decl.split(':').map(s => s.trim());
      if (prop && value) {
        props[prop] = value;
      }
    }
    return props;
  }

  /**
   * Parse stroke-dasharray into array of Decimal values
   * @private
   */
  _parseDashArray(dasharray) {
    if (!dasharray || dasharray === 'none') return null;

    const parts = dasharray.toString().split(/[\s,]+/).filter(s => s);
    const values = parts.map(s => D(parseFloat(s)));

    // Per SVG spec, if odd number of values, duplicate the array
    if (values.length % 2 === 1) {
      return [...values, ...values];
    }
    return values;
  }

  /**
   * Parse marker reference URL
   * @private
   */
  _parseMarkerRef(value) {
    if (!value || value === 'none') return null;
    const match = value.match(/url\(#?([^)]+)\)/);
    return match ? match[1] : null;
  }

  /**
   * Get the fill rule for this element
   * @returns {string} 'nonzero' or 'evenodd'
   */
  get fillRule() {
    return this.properties['fill-rule'] || 'nonzero';
  }

  /**
   * Get the clip rule for this element
   * @returns {string} 'nonzero' or 'evenodd'
   */
  get clipRule() {
    return this.properties['clip-rule'] || 'nonzero';
  }

  /**
   * Get stroke width as Decimal
   * @returns {Decimal}
   */
  get strokeWidth() {
    return D(this.properties['stroke-width'] || 0);
  }

  /**
   * Get stroke linecap
   * @returns {string} 'butt', 'round', or 'square'
   */
  get strokeLinecap() {
    return this.properties['stroke-linecap'] || 'butt';
  }

  /**
   * Get stroke linejoin
   * @returns {string} 'miter', 'round', or 'bevel'
   */
  get strokeLinejoin() {
    return this.properties['stroke-linejoin'] || 'miter';
  }

  /**
   * Get stroke miterlimit
   * @returns {Decimal}
   */
  get strokeMiterlimit() {
    return D(this.properties['stroke-miterlimit'] || 4);
  }

  /**
   * Calculate the maximum extent that stroke adds to geometry
   *
   * For a path at position (x, y), the stroke can extend up to:
   * - strokeWidth/2 for normal edges
   * - strokeWidth/2 * miterlimit for miter joins (worst case)
   * - strokeWidth/2 for round/bevel joins
   * - strokeWidth/2 + strokeWidth/2 for square linecaps
   *
   * @returns {Decimal} Maximum stroke extent beyond path geometry
   */
  getStrokeExtent() {
    if (!this.hasStroke) return D(0);

    const halfWidth = this.strokeWidth.div(2);
    let extent = halfWidth;

    // Miter joins can extend further
    if (this.strokeLinejoin === 'miter') {
      extent = halfWidth.times(this.strokeMiterlimit);
    }

    // Square linecaps extend by half stroke width beyond endpoints
    if (this.strokeLinecap === 'square') {
      const capExtent = halfWidth;
      if (capExtent.gt(extent)) {
        extent = capExtent;
      }
    }

    return extent;
  }

  /**
   * Expand a bounding box to account for stroke
   *
   * @param {Object} bbox - Bounding box {x, y, width, height} with Decimal values
   * @returns {Object} Expanded bounding box
   */
  expandBBoxForStroke(bbox) {
    if (!this.hasStroke) return bbox;

    const extent = this.getStrokeExtent();

    return {
      x: bbox.x.minus(extent),
      y: bbox.y.minus(extent),
      width: bbox.width.plus(extent.times(2)),
      height: bbox.height.plus(extent.times(2))
    };
  }

  /**
   * Expand a bounding box to account for markers
   *
   * This is an approximation - for exact results, marker geometry must be resolved.
   *
   * @param {Object} bbox - Bounding box {x, y, width, height} with Decimal values
   * @param {Object} markerSizes - Optional {start, mid, end} marker sizes
   * @returns {Object} Expanded bounding box
   */
  expandBBoxForMarkers(bbox, markerSizes = null) {
    if (!this.hasMarkers) return bbox;

    // If marker sizes provided, use them; otherwise estimate from marker definitions
    let maxMarkerSize = D(0);

    if (markerSizes) {
      const sizes = [markerSizes.start, markerSizes.mid, markerSizes.end]
        .filter(s => s)
        .map(s => D(s));
      if (sizes.length > 0) {
        maxMarkerSize = Decimal.max(...sizes);
      }
    } else {
      // Default marker size estimate based on stroke width
      maxMarkerSize = this.strokeWidth.times(3);
    }

    if (maxMarkerSize.lte(0)) return bbox;

    const extent = maxMarkerSize.div(2);

    return {
      x: bbox.x.minus(extent),
      y: bbox.y.minus(extent),
      width: bbox.width.plus(extent.times(2)),
      height: bbox.height.plus(extent.times(2))
    };
  }

  /**
   * Expand a bounding box to account for filter effects
   *
   * SVG filters can extend the rendering area significantly (blur, drop-shadow, etc.)
   *
   * @param {Object} bbox - Bounding box {x, y, width, height} with Decimal values
   * @param {Object} filterDef - Optional filter definition with primitive extents
   * @returns {Object} Expanded bounding box
   */
  expandBBoxForFilter(bbox, filterDef = null) {
    const filterRef = this.properties.filter;
    if (!filterRef || filterRef === 'none') return bbox;

    // Default filter region is 10% larger on each side (per SVG spec)
    // filterUnits="objectBoundingBox" x="-10%" y="-10%" width="120%" height="120%"
    let extentX = bbox.width.times('0.1');
    let extentY = bbox.height.times('0.1');

    // If filter definition provided with explicit bounds, use those
    if (filterDef) {
      if (filterDef.x !== undefined) extentX = D(filterDef.x).abs();
      if (filterDef.y !== undefined) extentY = D(filterDef.y).abs();
    }

    return {
      x: bbox.x.minus(extentX),
      y: bbox.y.minus(extentY),
      width: bbox.width.plus(extentX.times(2)),
      height: bbox.height.plus(extentY.times(2))
    };
  }

  /**
   * Get the full rendered bounding box including all effects
   *
   * @param {Object} geometryBBox - Base geometry bounding box
   * @param {Object} options - Options for marker/filter sizes
   * @returns {Object} Full rendered bounding box
   */
  getRenderedBBox(geometryBBox, options = {}) {
    let bbox = { ...geometryBBox };

    // Expand for stroke
    bbox = this.expandBBoxForStroke(bbox);

    // Expand for markers
    bbox = this.expandBBoxForMarkers(bbox, options.markerSizes);

    // Expand for filter
    bbox = this.expandBBoxForFilter(bbox, options.filterDef);

    return bbox;
  }

  /**
   * Convert path geometry to filled polygon accounting for stroke
   *
   * @param {Array} polygon - Path geometry as polygon vertices
   * @returns {Array} Polygon(s) representing the full rendered area
   */
  getFilledArea(polygon) {
    const areas = [];

    // Add fill area (if filled)
    if (this.hasFill) {
      areas.push({
        polygon: polygon,
        fillRule: this.fillRule,
        type: 'fill'
      });
    }

    // Add stroke area (if stroked)
    if (this.hasStroke) {
      const strokePolygon = strokeToFilledPolygon(polygon, {
        width: this.strokeWidth.toNumber(),
        linecap: this.strokeLinecap,
        linejoin: this.strokeLinejoin,
        miterlimit: this.strokeMiterlimit.toNumber()
      });

      if (strokePolygon && strokePolygon.length > 0) {
        areas.push({
          polygon: strokePolygon,
          fillRule: 'nonzero', // Stroke is always nonzero
          type: 'stroke'
        });
      }
    }

    return areas;
  }

  /**
   * Test if a point is inside the rendered area of this element
   *
   * @param {Object} point - Point {x, y} with Decimal values
   * @param {Array} polygon - Element geometry as polygon
   * @returns {boolean} True if point is inside rendered area
   */
  isPointInRenderedArea(point, polygon) {
    // Check fill area
    if (this.hasFill) {
      const fillRule = this.fillRule === 'evenodd' ? FillRule.EVENODD : FillRule.NONZERO;
      const inFill = pointInPolygonWithRule(point, polygon, fillRule);
      if (inFill >= 0) return true;
    }

    // Check stroke area
    if (this.hasStroke) {
      const strokePolygon = strokeToFilledPolygon(polygon, {
        width: this.strokeWidth.toNumber(),
        linecap: this.strokeLinecap,
        linejoin: this.strokeLinejoin,
        miterlimit: this.strokeMiterlimit.toNumber()
      });

      if (strokePolygon && strokePolygon.length > 0) {
        const inStroke = pointInPolygonWithRule(point, strokePolygon, FillRule.NONZERO);
        if (inStroke >= 0) return true;
      }
    }

    return false;
  }

  /**
   * Check if two elements with contexts can be merged
   *
   * Elements can only be merged if their rendering properties are compatible.
   *
   * @param {SVGRenderingContext} other - Other element's context
   * @returns {Object} {canMerge: boolean, reason: string}
   */
  canMergeWith(other) {
    // Fill rules must match
    if (this.fillRule !== other.fillRule) {
      return { canMerge: false, reason: 'Different fill-rule' };
    }

    // Stroke properties must match if either has stroke
    if (this.hasStroke || other.hasStroke) {
      if (this.hasStroke !== other.hasStroke) {
        return { canMerge: false, reason: 'Different stroke presence' };
      }

      if (!this.strokeWidth.eq(other.strokeWidth)) {
        return { canMerge: false, reason: 'Different stroke-width' };
      }

      if (this.strokeLinecap !== other.strokeLinecap) {
        return { canMerge: false, reason: 'Different stroke-linecap' };
      }

      if (this.strokeLinejoin !== other.strokeLinejoin) {
        return { canMerge: false, reason: 'Different stroke-linejoin' };
      }
    }

    // Neither can have markers (markers break continuity)
    if (this.hasMarkers || other.hasMarkers) {
      return { canMerge: false, reason: 'Has markers' };
    }

    // Neither can have clip-path or mask
    if (this.properties['clip-path'] !== 'none' || other.properties['clip-path'] !== 'none') {
      return { canMerge: false, reason: 'Has clip-path' };
    }

    if (this.properties.mask !== 'none' || other.properties.mask !== 'none') {
      return { canMerge: false, reason: 'Has mask' };
    }

    // Neither can have filter
    if (this.properties.filter !== 'none' || other.properties.filter !== 'none') {
      return { canMerge: false, reason: 'Has filter' };
    }

    return { canMerge: true, reason: null };
  }

  /**
   * Get a summary of this context for debugging
   * @returns {Object}
   */
  toSummary() {
    return {
      hasFill: this.hasFill,
      hasStroke: this.hasStroke,
      hasMarkers: this.hasMarkers,
      fillRule: this.fillRule,
      strokeWidth: this.hasStroke ? this.strokeWidth.toNumber() : 0,
      strokeExtent: this.getStrokeExtent().toNumber(),
      linecap: this.strokeLinecap,
      linejoin: this.strokeLinejoin,
      clipPath: this.properties['clip-path'],
      filter: this.properties.filter
    };
  }
}

/**
 * Create a rendering context from an SVG element
 *
 * @param {Object} element - SVG element
 * @param {Object} inherited - Inherited properties
 * @param {Map} defsMap - Definitions map
 * @returns {SVGRenderingContext}
 */
export function createRenderingContext(element, inherited = {}, defsMap = null) {
  return new SVGRenderingContext(element, inherited, defsMap);
}

/**
 * Get inherited properties from parent chain
 *
 * @param {Object} element - SVG element
 * @returns {Object} Inherited properties
 */
export function getInheritedProperties(element) {
  const inherited = {};

  // Inheritable properties per SVG spec
  const inheritableProps = [
    'fill', 'fill-rule', 'fill-opacity',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
    'marker-start', 'marker-mid', 'marker-end',
    'clip-rule', 'opacity', 'font-family', 'font-size', 'font-style', 'font-weight'
  ];

  let current = element.parentNode;
  while (current && current.tagName) {
    for (const prop of inheritableProps) {
      if (inherited[prop] === undefined) {
        const value = current.getAttribute ? current.getAttribute(prop) : null;
        if (value !== null && value !== undefined) {
          inherited[prop] = value;
        }
      }
    }
    current = current.parentNode;
  }

  return inherited;
}

export default {
  SVGRenderingContext,
  SVG_DEFAULTS,
  GEOMETRY_AFFECTING_PROPERTIES,
  FILL_AFFECTING_PROPERTIES,
  createRenderingContext,
  getInheritedProperties
};
