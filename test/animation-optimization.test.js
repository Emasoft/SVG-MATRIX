/**
 * Tests for Animation Optimization Module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatSplineValue,
  parseKeySplines,
  serializeKeySplines,
  parseKeyTimes,
  serializeKeyTimes,
  isLinearSpline,
  areAllSplinesLinear,
  identifyStandardEasing,
  optimizeKeySplines,
  optimizeKeyTimes,
  optimizeAnimationValues,
  optimizeDocumentAnimationTiming,
  STANDARD_EASINGS,
} from '../src/animation-optimization.js';
import { parseSVG } from '../src/svg-parser.js';

describe('formatSplineValue', () => {
  it('removes leading zeros', () => {
    assert.strictEqual(formatSplineValue(0.4), '.4');
    assert.strictEqual(formatSplineValue(0.25), '.25');
    assert.strictEqual(formatSplineValue(0.333), '.333');
  });

  it('removes trailing zeros', () => {
    assert.strictEqual(formatSplineValue(0.500), '.5');
    assert.strictEqual(formatSplineValue(0.250), '.25');
    assert.strictEqual(formatSplineValue(1.000), '1');
  });

  it('handles integers', () => {
    assert.strictEqual(formatSplineValue(0), '0');
    assert.strictEqual(formatSplineValue(1), '1');
  });

  it('respects precision', () => {
    assert.strictEqual(formatSplineValue(0.33333333, 2), '.33');
    assert.strictEqual(formatSplineValue(0.66666666, 2), '.67');
  });

  it('handles negative values', () => {
    assert.strictEqual(formatSplineValue(-0.5), '-.5');
    assert.strictEqual(formatSplineValue(-0.25), '-.25');
  });
});

describe('parseKeySplines', () => {
  it('parses single spline', () => {
    const result = parseKeySplines('0.4 0 0.2 1');
    assert.deepStrictEqual(result, [[0.4, 0, 0.2, 1]]);
  });

  it('parses multiple splines separated by semicolon', () => {
    const result = parseKeySplines('0.4 0 0.2 1; 0.5 0 0.5 1');
    assert.deepStrictEqual(result, [[0.4, 0, 0.2, 1], [0.5, 0, 0.5, 1]]);
  });

  it('handles comma separators within spline', () => {
    const result = parseKeySplines('0.4, 0, 0.2, 1');
    assert.deepStrictEqual(result, [[0.4, 0, 0.2, 1]]);
  });

  it('handles mixed spacing', () => {
    const result = parseKeySplines('0.4  0   0.2 1 ;  0.5 0 0.5 1');
    assert.deepStrictEqual(result, [[0.4, 0, 0.2, 1], [0.5, 0, 0.5, 1]]);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(parseKeySplines(''), []);
    assert.deepStrictEqual(parseKeySplines(null), []);
  });
});

describe('serializeKeySplines', () => {
  it('serializes with optimized values', () => {
    const splines = [[0.4, 0, 0.2, 1]];
    const result = serializeKeySplines(splines);
    assert.strictEqual(result, '.4 0 .2 1');
  });

  it('joins multiple splines with semicolon', () => {
    const splines = [[0.4, 0, 0.2, 1], [0.5, 0, 0.5, 1]];
    const result = serializeKeySplines(splines);
    assert.strictEqual(result, '.4 0 .2 1; .5 0 .5 1');
  });
});

describe('parseKeyTimes', () => {
  it('parses keyTimes values', () => {
    const result = parseKeyTimes('0; 0.25; 0.5; 1');
    assert.deepStrictEqual(result, [0, 0.25, 0.5, 1]);
  });

  it('handles no spaces', () => {
    const result = parseKeyTimes('0;.25;.5;1');
    assert.deepStrictEqual(result, [0, 0.25, 0.5, 1]);
  });
});

describe('isLinearSpline', () => {
  it('identifies linear spline (0 0 1 1)', () => {
    assert.strictEqual(isLinearSpline([0, 0, 1, 1]), true);
  });

  it('identifies near-linear spline within tolerance', () => {
    assert.strictEqual(isLinearSpline([0.0001, 0, 0.9999, 1]), true);
  });

  it('rejects non-linear splines', () => {
    assert.strictEqual(isLinearSpline([0.4, 0, 0.2, 1]), false);
    assert.strictEqual(isLinearSpline([0.5, 0, 0.5, 1]), false);
  });

  it('handles invalid input', () => {
    assert.strictEqual(isLinearSpline(null), false);
    assert.strictEqual(isLinearSpline([0, 0]), false);
  });
});

describe('areAllSplinesLinear', () => {
  it('returns true when all splines are linear', () => {
    assert.strictEqual(areAllSplinesLinear('0 0 1 1; 0 0 1 1'), true);
  });

  it('returns false when any spline is not linear', () => {
    assert.strictEqual(areAllSplinesLinear('0 0 1 1; 0.5 0 0.5 1'), false);
  });
});

describe('identifyStandardEasing', () => {
  it('identifies linear', () => {
    assert.strictEqual(identifyStandardEasing([0, 0, 1, 1]), 'linear');
  });

  it('identifies ease', () => {
    assert.strictEqual(identifyStandardEasing([0.25, 0.1, 0.25, 1]), 'ease');
  });

  it('identifies ease-in', () => {
    assert.strictEqual(identifyStandardEasing([0.42, 0, 1, 1]), 'ease-in');
  });

  it('identifies ease-out', () => {
    assert.strictEqual(identifyStandardEasing([0, 0, 0.58, 1]), 'ease-out');
  });

  it('identifies ease-in-out', () => {
    assert.strictEqual(identifyStandardEasing([0.42, 0, 0.58, 1]), 'ease-in-out');
  });

  it('returns null for custom curves', () => {
    assert.strictEqual(identifyStandardEasing([0.4, 0, 0.2, 1]), null);
  });
});

describe('optimizeKeySplines', () => {
  it('optimizes numeric precision', () => {
    const result = optimizeKeySplines('0.400 0.000 0.200 1.000');
    assert.strictEqual(result.value, '.4 0 .2 1');
  });

  it('detects all-linear splines', () => {
    const result = optimizeKeySplines('0 0 1 1; 0 0 1 1', { removeLinear: false });
    assert.strictEqual(result.allLinear, true);
  });

  it('returns null when all linear and removeLinear=true', () => {
    const result = optimizeKeySplines('0 0 1 1; 0 0 1 1', { removeLinear: true });
    assert.strictEqual(result.value, null);
    assert.strictEqual(result.allLinear, true);
  });

  it('identifies standard easings', () => {
    const result = optimizeKeySplines('0.42 0 1 1');
    assert.deepStrictEqual(result.standardEasings, ['ease-in']);
  });
});

describe('optimizeKeyTimes', () => {
  it('optimizes keyTimes precision', () => {
    const result = optimizeKeyTimes('0.000; 0.250; 0.500; 1.000');
    assert.strictEqual(result, '0; .25; .5; 1');
  });

  it('handles decimal values correctly', () => {
    const result = optimizeKeyTimes('0; .25; .5; .75; 1');
    assert.strictEqual(result, '0; .25; .5; .75; 1');
  });
});

describe('optimizeAnimationValues', () => {
  it('optimizes numeric values', () => {
    const result = optimizeAnimationValues('0.000; 30.000; 0.000');
    assert.strictEqual(result, '0; 30; 0');
  });

  it('preserves ID references exactly', () => {
    const result = optimizeAnimationValues('#frame1; #frame2; #frame3');
    assert.strictEqual(result, '#frame1; #frame2; #frame3');
  });

  it('handles space-separated coordinates', () => {
    const result = optimizeAnimationValues('0.000 0.000; 30.000 0.000');
    assert.strictEqual(result, '0 0; 30 0');
  });
});

describe('optimizeDocumentAnimationTiming', () => {
  it('optimizes keySplines in document', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect>
        <animate attributeName="x"
                 calcMode="spline"
                 keySplines="0.400 0.000 0.200 1.000"
                 values="0;100"/>
      </rect>
    </svg>`;

    const doc = parseSVG(svg);
    const result = optimizeDocumentAnimationTiming(doc);

    assert.strictEqual(result.elementsModified, 1);

    const animate = doc.querySelector('animate');
    assert.strictEqual(animate.getAttribute('keySplines'), '.4 0 .2 1');
  });

  it('converts linear splines to calcMode="linear"', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect>
        <animate attributeName="x"
                 calcMode="spline"
                 keySplines="0 0 1 1"
                 values="0;100"/>
      </rect>
    </svg>`;

    const doc = parseSVG(svg);
    const result = optimizeDocumentAnimationTiming(doc);

    const animate = doc.querySelector('animate');
    assert.strictEqual(animate.getAttribute('calcMode'), 'linear');
    assert.strictEqual(animate.getAttribute('keySplines'), null);
  });

  it('preserves non-linear splines', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <circle>
        <animate attributeName="cx"
                 calcMode="spline"
                 keySplines="0.5 0 0.5 1; 0.5 0 0.5 1"
                 keyTimes="0; 0.5; 1"
                 values="60; 110; 60"/>
      </circle>
    </svg>`;

    const doc = parseSVG(svg);
    optimizeDocumentAnimationTiming(doc);

    const animate = doc.querySelector('animate');
    assert.strictEqual(animate.getAttribute('calcMode'), 'spline');
    assert.strictEqual(animate.getAttribute('keySplines'), '.5 0 .5 1; .5 0 .5 1');
  });
});

describe('User example SVGs', () => {
  it('optimizes bounce animation keySplines', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 50 14">
      <rect fill="black" width="6" height="6" x="3" y="0">
        <animateTransform attributeName="transform"
                          begin="0s"
                          dur="2s"
                          type="translate"
                          from="0 0"
                          to="40 0"
                          repeatCount="4"
                          fill="freeze"
                          calcMode="spline"
                          keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
                          values="0;30;0"/>
      </rect>
    </svg>`;

    const doc = parseSVG(svg);
    const result = optimizeDocumentAnimationTiming(doc);

    const animateTransform = doc.querySelector('animateTransform');

    // Should optimize keySplines
    assert.strictEqual(animateTransform.getAttribute('keySplines'), '.4 0 .2 1; .4 0 .2 1');
    // Should preserve calcMode=spline (not linear)
    assert.strictEqual(animateTransform.getAttribute('calcMode'), 'spline');
  });

  it('optimizes circle animation keySplines', async () => {
    const svg = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="10" r="10">
        <animate
          attributeName="cx"
          dur="4s"
          calcMode="spline"
          repeatCount="indefinite"
          values="60; 110; 60; 10; 60"
          keyTimes="0; 0.25; 0.5; 0.75; 1"
          keySplines="0.5 0 0.5 1; 0.5 0 0.5 1; 0.5 0 0.5 1; 0.5 0 0.5 1" />
      </circle>
    </svg>`;

    const doc = parseSVG(svg);
    const result = optimizeDocumentAnimationTiming(doc, { precision: 2 });

    const animate = doc.querySelector('animate');

    // Should optimize keySplines
    assert.strictEqual(animate.getAttribute('keySplines'), '.5 0 .5 1; .5 0 .5 1; .5 0 .5 1; .5 0 .5 1');
    // Should optimize keyTimes
    assert.strictEqual(animate.getAttribute('keyTimes'), '0; .25; .5; .75; 1');
    // Should optimize values
    assert.strictEqual(animate.getAttribute('values'), '60; 110; 60; 10; 60');
  });
});
