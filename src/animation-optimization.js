/**
 * Animation Timing Optimization for SVG
 *
 * Optimizes SMIL animation timing attributes without breaking animations:
 *
 * 1. keySplines optimization:
 *    - Remove leading zeros (0.4 -> .4)
 *    - Remove trailing zeros (0.500 -> .5)
 *    - Precision reduction with configurable decimal places
 *    - Detect linear splines (0 0 1 1) and simplify calcMode
 *
 * 2. keyTimes optimization:
 *    - Remove redundant precision
 *    - Normalize separator spacing
 *
 * 3. values optimization:
 *    - Numeric precision reduction for numeric values
 *    - Preserve ID references (#frame1;#frame2) exactly
 *
 * @module animation-optimization
 */

import Decimal from 'decimal.js';

// Configure Decimal for high precision internally
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Standard easing curves that can be recognized
 * Format: [x1, y1, x2, y2] control points
 */
export const STANDARD_EASINGS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/**
 * Format a number with optimal precision (no trailing zeros, no leading zero for decimals < 1)
 * @param {number|string} value - Number to format
 * @param {number} precision - Maximum decimal places (default: 3)
 * @returns {string} Optimized number string
 */
export function formatSplineValue(value, precision = 3) {
  // Validate value parameter
  if (value === null || value === undefined) {
    throw new Error('formatSplineValue: value parameter is required');
  }

  // Validate precision parameter
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('formatSplineValue: precision must be a non-negative finite number');
  }

  // Check for NaN/Infinity before creating Decimal
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(numValue)) {
    throw new Error(`formatSplineValue: value must be a finite number, got ${value}`);
  }

  const num = new Decimal(value);

  // Round to precision
  const rounded = num.toDecimalPlaces(precision);

  // Convert to string
  let str = rounded.toString();

  // Remove trailing zeros after decimal point
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }

  // Remove leading zero for values between -1 and 1 (exclusive)
  if (str.startsWith('0.')) {
    str = str.substring(1); // "0.5" -> ".5"
  } else if (str.startsWith('-0.')) {
    str = '-' + str.substring(2); // "-0.5" -> "-.5"
  }

  // Handle edge case: ".0" should be "0"
  if (str === '' || str === '.') str = '0';

  return str;
}

/**
 * Parse a keySplines attribute value into array of spline arrays
 * Each spline has 4 values: [x1, y1, x2, y2]
 * @param {string} keySplines - keySplines attribute value
 * @returns {number[][]} Array of [x1, y1, x2, y2] arrays
 */
export function parseKeySplines(keySplines) {
  if (!keySplines || typeof keySplines !== 'string') return [];

  // Split by semicolon to get individual splines
  const splines = keySplines.split(';').map(s => s.trim()).filter(s => s);

  return splines
    .map(spline => {
      // Split by whitespace or comma to get control points
      const values = spline.split(/[\s,]+/)
        .map(v => parseFloat(v))
        .filter(v => Number.isFinite(v)); // Filter out NaN and Infinity

      // Each spline must have exactly 4 control points
      if (values.length !== 4) {
        throw new Error(`parseKeySplines: invalid spline "${spline}", expected 4 values, got ${values.length}`);
      }

      return values;
    });
}

/**
 * Serialize splines array back to keySplines attribute format
 * @param {number[][]} splines - Array of [x1, y1, x2, y2] arrays
 * @param {number} precision - Maximum decimal places
 * @returns {string} keySplines attribute value
 */
export function serializeKeySplines(splines, precision = 3) {
  // Validate splines parameter
  if (!Array.isArray(splines)) {
    throw new Error('serializeKeySplines: splines must be an array');
  }

  // Validate precision parameter
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('serializeKeySplines: precision must be a non-negative finite number');
  }

  return splines.map((spline, index) => {
    // Validate each spline is an array with 4 values
    if (!Array.isArray(spline)) {
      throw new Error(`serializeKeySplines: spline at index ${index} must be an array`);
    }
    if (spline.length !== 4) {
      throw new Error(`serializeKeySplines: spline at index ${index} must have exactly 4 values, got ${spline.length}`);
    }

    return spline.map(v => formatSplineValue(v, precision)).join(' ');
  }).join('; ');
}

/**
 * Check if a spline is effectively linear (0 0 1 1)
 * @param {number[]} spline - [x1, y1, x2, y2] control points
 * @param {number} tolerance - Comparison tolerance (default: 0.001)
 * @returns {boolean} True if spline is linear
 */
export function isLinearSpline(spline, tolerance = 0.001) {
  // Validate spline parameter
  if (!Array.isArray(spline) || spline.length !== 4) return false;

  // Validate tolerance parameter
  if (typeof tolerance !== 'number' || tolerance < 0 || !Number.isFinite(tolerance)) {
    throw new Error('isLinearSpline: tolerance must be a non-negative finite number');
  }

  const [x1, y1, x2, y2] = spline;

  // Check for NaN values in spline
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return false;
  }

  return (
    Math.abs(x1) < tolerance &&
    Math.abs(y1) < tolerance &&
    Math.abs(x2 - 1) < tolerance &&
    Math.abs(y2 - 1) < tolerance
  );
}

/**
 * Check if all splines in a keySplines value are linear
 * @param {string} keySplines - keySplines attribute value
 * @returns {boolean} True if all splines are linear
 */
export function areAllSplinesLinear(keySplines) {
  const splines = parseKeySplines(keySplines);
  if (splines.length === 0) return false;
  // Must wrap in arrow function to avoid .every() passing index as tolerance
  return splines.every(s => isLinearSpline(s));
}

/**
 * Identify if a spline matches a standard CSS easing
 * @param {number[]} spline - [x1, y1, x2, y2] control points
 * @param {number} tolerance - Comparison tolerance
 * @returns {string|null} Easing name or null if not standard
 */
export function identifyStandardEasing(spline, tolerance = 0.01) {
  // Validate spline parameter
  if (!Array.isArray(spline) || spline.length !== 4) return null;

  // Validate tolerance parameter
  if (typeof tolerance !== 'number' || tolerance < 0 || !Number.isFinite(tolerance)) {
    throw new Error('identifyStandardEasing: tolerance must be a non-negative finite number');
  }

  // Check for NaN values in spline
  if (!spline.every(val => Number.isFinite(val))) return null;

  for (const [name, standard] of Object.entries(STANDARD_EASINGS)) {
    const matches = spline.every((val, i) => Math.abs(val - standard[i]) < tolerance);
    if (matches) return name;
  }
  return null;
}

/**
 * Optimize a keySplines attribute value
 * @param {string} keySplines - Original keySplines value
 * @param {Object} options - Optimization options
 * @param {number} options.precision - Max decimal places (default: 3)
 * @param {boolean} options.removeLinear - If true and all splines are linear, return null (default: true)
 * @returns {{value: string|null, allLinear: boolean, standardEasings: string[]}}
 */
export function optimizeKeySplines(keySplines, options = {}) {
  const precision = options.precision ?? 3;
  const removeLinear = options.removeLinear !== false;

  const splines = parseKeySplines(keySplines);

  if (splines.length === 0) {
    return { value: null, allLinear: false, standardEasings: [] };
  }

  // Check for all linear splines (wrap to avoid .every() passing index as tolerance)
  const allLinear = splines.every(s => isLinearSpline(s));

  // Identify standard easings
  const standardEasings = splines.map(s => identifyStandardEasing(s)).filter(Boolean);

  // If all linear and removeLinear is true, suggest removing keySplines
  if (allLinear && removeLinear) {
    return { value: null, allLinear: true, standardEasings };
  }

  // Optimize each spline value with precision
  const optimized = serializeKeySplines(splines, precision);

  return { value: optimized, allLinear, standardEasings };
}

/**
 * Parse keyTimes attribute value
 * @param {string} keyTimes - keyTimes attribute value
 * @returns {number[]} Array of time values
 */
export function parseKeyTimes(keyTimes) {
  if (!keyTimes || typeof keyTimes !== 'string') return [];
  return keyTimes.split(';').map(s => parseFloat(s.trim())).filter(v => Number.isFinite(v));
}

/**
 * Serialize keyTimes array back to attribute format
 * @param {number[]} times - Array of time values
 * @param {number} precision - Maximum decimal places
 * @returns {string} keyTimes attribute value
 */
export function serializeKeyTimes(times, precision = 3) {
  // Validate times parameter
  if (!Array.isArray(times)) {
    throw new Error('serializeKeyTimes: times must be an array');
  }

  // Validate precision parameter
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('serializeKeyTimes: precision must be a non-negative finite number');
  }

  // Return empty string for empty array
  if (times.length === 0) return '';

  return times.map(t => formatSplineValue(t, precision)).join('; ');
}

/**
 * Optimize keyTimes attribute value
 * @param {string} keyTimes - Original keyTimes value
 * @param {number} precision - Max decimal places (default: 3)
 * @returns {string} Optimized keyTimes value
 */
export function optimizeKeyTimes(keyTimes, precision = 3) {
  // Validate keyTimes parameter
  if (keyTimes === null || keyTimes === undefined) {
    throw new Error('optimizeKeyTimes: keyTimes parameter is required');
  }

  // Validate precision parameter
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('optimizeKeyTimes: precision must be a non-negative finite number');
  }

  const times = parseKeyTimes(keyTimes);
  if (times.length === 0) return keyTimes;
  return serializeKeyTimes(times, precision);
}

/**
 * Optimize numeric values in animation values attribute
 * Preserves ID references (#id) exactly
 * @param {string} values - values attribute
 * @param {number} precision - Max decimal places for numbers
 * @returns {string} Optimized values
 */
export function optimizeAnimationValues(values, precision = 3) {
  if (!values || typeof values !== 'string') return values;

  // Validate precision parameter
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('optimizeAnimationValues: precision must be a non-negative finite number');
  }

  // Split by semicolon
  const parts = values.split(';');

  // Handle empty values string
  if (parts.length === 0) return values;

  const optimized = parts.map(part => {
    const trimmed = part.trim();

    // Preserve ID references exactly
    if (trimmed.startsWith('#') || trimmed.includes('url(')) {
      return trimmed;
    }

    // Try to parse as numbers (could be space-separated like "0 0" for translate)
    const nums = trimmed.split(/[\s,]+/).filter(n => n); // Filter empty strings
    const optimizedNums = nums.map(n => {
      const num = parseFloat(n);
      if (!Number.isFinite(num)) return n; // Not a finite number, preserve as-is
      return formatSplineValue(num, precision);
    });

    return optimizedNums.join(' ');
  });

  return optimized.join('; ');
}

/**
 * Optimize all animation timing attributes on an element
 * @param {Element} el - SVG element (animate, animateTransform, etc.)
 * @param {Object} options - Optimization options
 * @returns {{modified: boolean, changes: string[]}}
 */
export function optimizeElementTiming(el, options = {}) {
  // Validate el parameter
  if (!el || typeof el !== 'object') {
    throw new Error('optimizeElementTiming: el parameter must be a valid element');
  }
  if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function' || typeof el.removeAttribute !== 'function') {
    throw new Error('optimizeElementTiming: el parameter must have getAttribute, setAttribute, and removeAttribute methods');
  }

  const precision = options.precision ?? 3;
  const removeLinearSplines = options.removeLinearSplines !== false;
  const optimizeValues = options.optimizeValues !== false;

  // Validate precision from options
  if (typeof precision !== 'number' || precision < 0 || !Number.isFinite(precision)) {
    throw new Error('optimizeElementTiming: options.precision must be a non-negative finite number');
  }

  const changes = [];
  let modified = false;

  // Optimize keySplines
  const keySplines = el.getAttribute('keySplines');
  if (keySplines) {
    const result = optimizeKeySplines(keySplines, { precision, removeLinear: removeLinearSplines });

    if (result.allLinear && removeLinearSplines) {
      // All splines are linear - can simplify to calcMode="linear"
      const calcMode = el.getAttribute('calcMode');
      if (calcMode === 'spline') {
        el.setAttribute('calcMode', 'linear');
        el.removeAttribute('keySplines');
        changes.push('Converted linear splines to calcMode="linear"');
        modified = true;
      }
    } else if (result.value && result.value !== keySplines) {
      el.setAttribute('keySplines', result.value);
      changes.push(`keySplines: "${keySplines}" -> "${result.value}"`);
      modified = true;
    }
  }

  // Optimize keyTimes
  const keyTimes = el.getAttribute('keyTimes');
  if (keyTimes) {
    const optimized = optimizeKeyTimes(keyTimes, precision);
    if (optimized !== keyTimes) {
      el.setAttribute('keyTimes', optimized);
      changes.push(`keyTimes: "${keyTimes}" -> "${optimized}"`);
      modified = true;
    }
  }

  // Optimize values (optimizeAnimationValues internally preserves ID refs)
  if (optimizeValues) {
    const values = el.getAttribute('values');
    if (values) {
      const optimized = optimizeAnimationValues(values, precision);
      if (optimized !== values) {
        el.setAttribute('values', optimized);
        changes.push(`values: "${values}" -> "${optimized}"`);
        modified = true;
      }
    }
  }

  // Optimize from/to/by (optimizeAnimationValues internally preserves ID refs)
  for (const attr of ['from', 'to', 'by']) {
    const val = el.getAttribute(attr);
    if (val) {
      const optimized = optimizeAnimationValues(val, precision);
      if (optimized !== val) {
        el.setAttribute(attr, optimized);
        changes.push(`${attr}: "${val}" -> "${optimized}"`);
        modified = true;
      }
    }
  }

  return { modified, changes };
}

/**
 * Animation elements that can have timing attributes
 * Note: all lowercase to match svg-parser tagName normalization
 */
export const ANIMATION_ELEMENTS = ['animate', 'animatetransform', 'animatemotion', 'animatecolor', 'set'];

/**
 * Optimize all animation timing in an SVG document
 * @param {Element} root - SVG root element
 * @param {Object} options - Optimization options
 * @returns {{elementsModified: number, totalChanges: number, details: Array}}
 */
export function optimizeDocumentAnimationTiming(root, options = {}) {
  // Validate root parameter
  if (!root || typeof root !== 'object') {
    throw new Error('optimizeDocumentAnimationTiming: root parameter must be a valid element');
  }

  let elementsModified = 0;
  let totalChanges = 0;
  const details = [];

  const processElement = (el) => {
    // Skip if not a valid element
    if (!el || typeof el !== 'object') return;

    const tagName = el.tagName?.toLowerCase();

    // Skip if no tagName
    if (!tagName) return;

    if (ANIMATION_ELEMENTS.includes(tagName)) {
      const result = optimizeElementTiming(el, options);
      if (result.modified) {
        elementsModified++;
        totalChanges += result.changes.length;
        details.push({
          element: tagName,
          id: el.getAttribute('id') || null,
          changes: result.changes
        });
      }
    }

    // Process children safely
    const children = el.children || [];
    for (const child of children) {
      processElement(child);
    }
  };

  processElement(root);

  return { elementsModified, totalChanges, details };
}

export default {
  // Core functions
  formatSplineValue,
  parseKeySplines,
  serializeKeySplines,
  parseKeyTimes,
  serializeKeyTimes,

  // Analysis
  isLinearSpline,
  areAllSplinesLinear,
  identifyStandardEasing,
  STANDARD_EASINGS,

  // Optimization
  optimizeKeySplines,
  optimizeKeyTimes,
  optimizeAnimationValues,
  optimizeElementTiming,
  optimizeDocumentAnimationTiming,

  // Constants
  ANIMATION_ELEMENTS,
};
