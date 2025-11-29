/**
 * Browser Verification Module
 *
 * Provides functions to verify SVG coordinate transformations against
 * Chrome's native implementation using Playwright.
 *
 * This is the authoritative way to verify correctness since browsers
 * implement the W3C SVG2 specification.
 *
 * @module browser-verify
 */

import { chromium } from 'playwright';
import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import * as SVGFlatten from './svg-flatten.js';

// Set high precision
Decimal.set({ precision: 80 });

/**
 * Browser verification session.
 * Manages a Chromium browser instance for CTM verification.
 */
export class BrowserVerifier {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize the browser session.
   * Must be called before using verification methods.
   *
   * @param {Object} options - Playwright launch options
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    this.browser = await chromium.launch(options);
    this.page = await this.browser.newPage();
  }

  /**
   * Close the browser session.
   * Should be called when done with verification.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Get the browser's native CTM for an SVG element configuration.
   *
   * @param {Object} config - SVG configuration
   * @param {number} config.width - Viewport width
   * @param {number} config.height - Viewport height
   * @param {string} [config.viewBox] - viewBox attribute
   * @param {string} [config.preserveAspectRatio] - preserveAspectRatio attribute
   * @param {string} [config.transform] - transform attribute on child element
   * @returns {Promise<{a: number, b: number, c: number, d: number, e: number, f: number}>}
   */
  async getBrowserCTM(config) {
    if (!this.page) {
      throw new Error('BrowserVerifier not initialized. Call init() first.');
    }

    return await this.page.evaluate((cfg) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', cfg.width);
      svg.setAttribute('height', cfg.height);
      if (cfg.viewBox) svg.setAttribute('viewBox', cfg.viewBox);
      if (cfg.preserveAspectRatio) svg.setAttribute('preserveAspectRatio', cfg.preserveAspectRatio);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '10');
      rect.setAttribute('height', '10');
      if (cfg.transform) rect.setAttribute('transform', cfg.transform);
      svg.appendChild(rect);

      document.body.appendChild(svg);
      const ctm = rect.getCTM();
      document.body.removeChild(svg);

      return { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f };
    }, config);
  }

  /**
   * Get the browser's screen CTM (includes page scroll/zoom).
   *
   * @param {Object} config - SVG configuration (same as getBrowserCTM)
   * @returns {Promise<{a: number, b: number, c: number, d: number, e: number, f: number}>}
   */
  async getBrowserScreenCTM(config) {
    if (!this.page) {
      throw new Error('BrowserVerifier not initialized. Call init() first.');
    }

    return await this.page.evaluate((cfg) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', cfg.width);
      svg.setAttribute('height', cfg.height);
      if (cfg.viewBox) svg.setAttribute('viewBox', cfg.viewBox);
      if (cfg.preserveAspectRatio) svg.setAttribute('preserveAspectRatio', cfg.preserveAspectRatio);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '10');
      rect.setAttribute('height', '10');
      if (cfg.transform) rect.setAttribute('transform', cfg.transform);
      svg.appendChild(rect);

      document.body.appendChild(svg);
      const ctm = rect.getScreenCTM();
      document.body.removeChild(svg);

      return { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f };
    }, config);
  }

  /**
   * Transform a point using the browser's native SVG transformation.
   *
   * @param {Object} config - SVG configuration
   * @param {number} x - X coordinate in local space
   * @param {number} y - Y coordinate in local space
   * @returns {Promise<{x: number, y: number}>} Transformed point
   */
  async transformPoint(config, x, y) {
    if (!this.page) {
      throw new Error('BrowserVerifier not initialized. Call init() first.');
    }

    return await this.page.evaluate(({ cfg, px, py }) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', cfg.width);
      svg.setAttribute('height', cfg.height);
      if (cfg.viewBox) svg.setAttribute('viewBox', cfg.viewBox);
      if (cfg.preserveAspectRatio) svg.setAttribute('preserveAspectRatio', cfg.preserveAspectRatio);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      if (cfg.transform) rect.setAttribute('transform', cfg.transform);
      svg.appendChild(rect);

      document.body.appendChild(svg);

      const ctm = rect.getCTM();
      const point = svg.createSVGPoint();
      point.x = px;
      point.y = py;
      const transformed = point.matrixTransform(ctm);

      document.body.removeChild(svg);

      return { x: transformed.x, y: transformed.y };
    }, { cfg: config, px: x, py: y });
  }

  /**
   * Verify a matrix against the browser's CTM.
   *
   * @param {Matrix} matrix - Our computed matrix
   * @param {Object} config - SVG configuration to compare against
   * @param {number} [tolerance=1e-10] - Tolerance for comparison
   * @returns {Promise<{matches: boolean, browserCTM: Object, libraryCTM: Object, differences: Object}>}
   */
  async verifyMatrix(matrix, config, tolerance = 1e-10) {
    const browserCTM = await this.getBrowserCTM(config);

    const libraryCTM = {
      a: matrix.data[0][0].toNumber(),
      b: matrix.data[1][0].toNumber(),
      c: matrix.data[0][1].toNumber(),
      d: matrix.data[1][1].toNumber(),
      e: matrix.data[0][2].toNumber(),
      f: matrix.data[1][2].toNumber(),
    };

    const differences = {
      a: Math.abs(browserCTM.a - libraryCTM.a),
      b: Math.abs(browserCTM.b - libraryCTM.b),
      c: Math.abs(browserCTM.c - libraryCTM.c),
      d: Math.abs(browserCTM.d - libraryCTM.d),
      e: Math.abs(browserCTM.e - libraryCTM.e),
      f: Math.abs(browserCTM.f - libraryCTM.f),
    };

    const matches = Object.values(differences).every(d => d < tolerance);

    return { matches, browserCTM, libraryCTM, differences };
  }

  /**
   * Verify a viewBox transform computation.
   *
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {string} viewBox - viewBox attribute
   * @param {string} [preserveAspectRatio='xMidYMid meet'] - preserveAspectRatio
   * @param {number} [tolerance=1e-10] - Tolerance for comparison
   * @returns {Promise<{matches: boolean, browserCTM: Object, libraryCTM: Object, differences: Object}>}
   */
  async verifyViewBoxTransform(width, height, viewBox, preserveAspectRatio = 'xMidYMid meet', tolerance = 1e-10) {
    const vb = SVGFlatten.parseViewBox(viewBox);
    const par = SVGFlatten.parsePreserveAspectRatio(preserveAspectRatio);
    const matrix = SVGFlatten.computeViewBoxTransform(vb, width, height, par);

    return await this.verifyMatrix(matrix, {
      width,
      height,
      viewBox,
      preserveAspectRatio
    }, tolerance);
  }

  /**
   * Verify a transform attribute parsing.
   *
   * @param {string} transform - SVG transform attribute string
   * @param {number} [tolerance=1e-10] - Tolerance for comparison
   * @returns {Promise<{matches: boolean, browserCTM: Object, libraryCTM: Object, differences: Object}>}
   */
  async verifyTransformAttribute(transform, tolerance = 1e-10) {
    const matrix = SVGFlatten.parseTransformAttribute(transform);

    // Use a simple 100x100 SVG without viewBox to test just the transform
    return await this.verifyMatrix(matrix, {
      width: 100,
      height: 100,
      transform
    }, tolerance);
  }

  /**
   * Verify a point transformation.
   *
   * @param {Matrix} matrix - Our computed matrix
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {Object} config - SVG configuration
   * @param {number} [tolerance=1e-10] - Tolerance for comparison
   * @returns {Promise<{matches: boolean, browserPoint: Object, libraryPoint: Object, difference: number}>}
   */
  async verifyPointTransform(matrix, x, y, config, tolerance = 1e-10) {
    const browserPoint = await this.transformPoint(config, x, y);
    const libraryPoint = SVGFlatten.applyToPoint(matrix, x, y);

    const libPt = {
      x: libraryPoint.x.toNumber(),
      y: libraryPoint.y.toNumber()
    };

    const difference = Math.sqrt(
      Math.pow(browserPoint.x - libPt.x, 2) +
      Math.pow(browserPoint.y - libPt.y, 2)
    );

    return {
      matches: difference < tolerance,
      browserPoint,
      libraryPoint: libPt,
      difference
    };
  }

  /**
   * Run a batch of verification tests.
   *
   * @param {Array<Object>} testCases - Array of test configurations
   * @param {number} [tolerance=1e-10] - Tolerance for comparison
   * @returns {Promise<{passed: number, failed: number, results: Array}>}
   */
  async runBatch(testCases, tolerance = 1e-10) {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const tc of testCases) {
      const result = await this.verifyViewBoxTransform(
        tc.width,
        tc.height,
        tc.viewBox,
        tc.preserveAspectRatio || 'xMidYMid meet',
        tolerance
      );

      results.push({
        name: tc.name || `${tc.width}x${tc.height} viewBox="${tc.viewBox}"`,
        ...result
      });

      if (result.matches) passed++;
      else failed++;
    }

    return { passed, failed, results };
  }
}

/**
 * Quick verification function - creates a temporary browser session.
 * For multiple verifications, use BrowserVerifier class instead.
 *
 * @param {Matrix} matrix - Matrix to verify
 * @param {Object} config - SVG configuration
 * @param {number} [tolerance=1e-10] - Tolerance
 * @returns {Promise<boolean>} True if matrix matches browser's CTM
 */
export async function quickVerify(matrix, config, tolerance = 1e-10) {
  const verifier = new BrowserVerifier();
  await verifier.init({ headless: true });

  try {
    const result = await verifier.verifyMatrix(matrix, config, tolerance);
    return result.matches;
  } finally {
    await verifier.close();
  }
}

/**
 * Verify a viewBox transform with a quick one-off browser session.
 *
 * @param {number} width - Viewport width
 * @param {number} height - Viewport height
 * @param {string} viewBox - viewBox attribute
 * @param {string} [preserveAspectRatio='xMidYMid meet'] - preserveAspectRatio
 * @returns {Promise<{matches: boolean, browserCTM: Object, libraryCTM: Object}>}
 */
export async function verifyViewBox(width, height, viewBox, preserveAspectRatio = 'xMidYMid meet') {
  const verifier = new BrowserVerifier();
  await verifier.init({ headless: true });

  try {
    return await verifier.verifyViewBoxTransform(width, height, viewBox, preserveAspectRatio);
  } finally {
    await verifier.close();
  }
}

/**
 * Verify a transform attribute parsing with a quick one-off browser session.
 *
 * @param {string} transform - SVG transform attribute string
 * @returns {Promise<{matches: boolean, browserCTM: Object, libraryCTM: Object}>}
 */
export async function verifyTransform(transform) {
  const verifier = new BrowserVerifier();
  await verifier.init({ headless: true });

  try {
    return await verifier.verifyTransformAttribute(transform);
  } finally {
    await verifier.close();
  }
}

/**
 * Run the standard verification test suite.
 * Tests all common viewBox/preserveAspectRatio combinations.
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose=true] - Print results to console
 * @returns {Promise<{passed: number, failed: number, results: Array}>}
 */
export async function runStandardTests(options = { verbose: true }) {
  const testCases = [
    // W3C SVG WG issue #215 cases
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'none', name: 'Issue #215: none' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMinYMin meet', name: 'Issue #215: xMinYMin meet' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMidYMid meet', name: 'Issue #215: xMidYMid meet' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMaxYMax meet', name: 'Issue #215: xMaxYMax meet' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMinYMin slice', name: 'Issue #215: xMinYMin slice' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMidYMid slice', name: 'Issue #215: xMidYMid slice' },
    { width: 21, height: 10, viewBox: '11 13 3 2', preserveAspectRatio: 'xMaxYMax slice', name: 'Issue #215: xMaxYMax slice' },

    // Standard cases
    { width: 200, height: 200, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', name: 'Square 2x scale' },
    { width: 100, height: 100, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', name: '1:1 identity' },
    { width: 400, height: 200, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', name: 'Wide viewport' },
    { width: 200, height: 400, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', name: 'Tall viewport' },

    // Non-zero origins
    { width: 300, height: 200, viewBox: '50 50 100 100', preserveAspectRatio: 'xMidYMid meet', name: 'Offset origin' },
    { width: 300, height: 200, viewBox: '-50 -50 200 200', preserveAspectRatio: 'xMidYMid meet', name: 'Negative origin' },

    // Stretch
    { width: 200, height: 100, viewBox: '0 0 100 100', preserveAspectRatio: 'none', name: 'Stretch non-uniform' },

    // Slice modes
    { width: 200, height: 400, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid slice', name: 'Tall slice' },
    { width: 400, height: 200, viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid slice', name: 'Wide slice' },
  ];

  const verifier = new BrowserVerifier();
  await verifier.init({ headless: true });

  try {
    const { passed, failed, results } = await verifier.runBatch(testCases);

    if (options.verbose) {
      console.log('\n=== SVG-Matrix Browser Verification ===\n');

      for (const r of results) {
        const icon = r.matches ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`  ${icon} ${r.name}`);
      }

      console.log('\n' + '─'.repeat(50));
      if (failed === 0) {
        console.log(`\x1b[32mAll ${passed} tests PASSED!\x1b[0m`);
        console.log('Library matches browser\'s W3C SVG2 implementation.\n');
      } else {
        console.log(`\x1b[31m${failed} tests FAILED\x1b[0m, ${passed} passed\n`);
      }
    }

    return { passed, failed, results };
  } finally {
    await verifier.close();
  }
}

export default {
  BrowserVerifier,
  quickVerify,
  verifyViewBox,
  verifyTransform,
  runStandardTests
};
