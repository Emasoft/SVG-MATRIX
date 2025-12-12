/**
 * Test: Transform accumulation order in use-symbol-resolver
 *
 * This test verifies that the transform application order for <use> elements
 * follows the SVG specification:
 * 1. Apply use element's transform attribute
 * 2. Apply translate(x, y) for use element's x/y attributes
 * 3. Apply viewBox transform (for symbols)
 */

import { JSDOM } from 'jsdom';
import * as UseSymbolResolver from '../src/use-symbol-resolver.js';
import * as Transforms2D from '../src/transforms2d.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function setupDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  return dom;
}

function teardownDOM() {
  delete global.document;
  delete global.Element;
}

function createRect(id, x, y, width, height) {
  const rect = document.createElementNS(SVG_NS, 'rect');
  if (id) rect.setAttribute('id', id);
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  return rect;
}

function createUse(href, x, y, transform, width, height) {
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', href);
  if (x !== undefined) use.setAttribute('x', x);
  if (y !== undefined) use.setAttribute('y', y);
  if (transform) use.setAttribute('transform', transform);
  if (width !== undefined) use.setAttribute('width', width);
  if (height !== undefined) use.setAttribute('height', height);
  return use;
}

function createSymbol(id, viewBox) {
  const symbol = document.createElementNS(SVG_NS, 'symbol');
  symbol.setAttribute('id', id);
  if (viewBox) symbol.setAttribute('viewBox', viewBox);
  return symbol;
}

function createCircle(cx, cy, r) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', cx);
  circle.setAttribute('cy', cy);
  circle.setAttribute('r', r);
  return circle;
}

describe('Use Element Transform Order', () => {
  beforeEach(() => {
    setupDOM();
  });

  afterEach(() => {
    teardownDOM();
  });

  test('use with both transform and x/y applies transform first', () => {
    // Test case: <use href="#r" x="50" y="50" transform="scale(2)"/>
    // Expected: scale(2) applied first, THEN translate(50, 50)
    // Result: shape should be at (50, 50) with 2x scale, NOT at (100, 100)

    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 50, 50, 'scale(2)');

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    // Get the composed transform
    const transform = resolved.transform;

    // Test point: (10, 10) - corner of the original rect
    // Expected transformation:
    // 1. scale(2): (10, 10) → (20, 20)
    // 2. translate(50, 50): (20, 20) → (70, 70)
    const [x, y] = Transforms2D.applyTransform(transform, 10, 10);

    expect(x).toBeCloseTo(70, 6); // Should be 70, not 120
    expect(y).toBeCloseTo(70, 6); // Should be 70, not 120
  });

  test('use with only x/y applies translation', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 50, 50);

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;
    const [x, y] = Transforms2D.applyTransform(transform, 10, 10);

    expect(x).toBeCloseTo(60, 6); // 10 + 50
    expect(y).toBeCloseTo(60, 6); // 10 + 50
  });

  test('use with only transform applies transform', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 0, 0, 'scale(2)');

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;
    const [x, y] = Transforms2D.applyTransform(transform, 10, 10);

    expect(x).toBeCloseTo(20, 6); // 10 * 2
    expect(y).toBeCloseTo(20, 6); // 10 * 2
  });

  test('use with rotate transform and x/y translation', () => {
    // Rotate 90 degrees, then translate
    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 100, 0, 'rotate(90)');

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;

    // Point (10, 0) - right edge of rect
    // Expected:
    // 1. rotate(90): (10, 0) → (0, 10)
    // 2. translate(100, 0): (0, 10) → (100, 10)
    const [x, y] = Transforms2D.applyTransform(transform, 10, 0);

    expect(x).toBeCloseTo(100, 5); // Should be at x=100
    expect(y).toBeCloseTo(10, 5); // Should be at y=10
  });

  test('symbol with viewBox - transform order with scale', () => {
    // Symbol with viewBox, use with scale and translation
    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const symbol = createSymbol('icon', '0 0 24 24');
    const circle = createCircle(12, 12, 10);
    const use = createUse('#icon', 50, 50, 'scale(2)', 48, 48);

    symbol.appendChild(circle);
    defs.appendChild(symbol);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;

    // Center point of symbol's circle (12, 12 in viewBox coordinates)
    // Expected transformation:
    // 1. scale(2) from use transform: (12, 12) → (24, 24)
    // 2. translate(50, 50) from x/y: (24, 24) → (74, 74)
    // 3. viewBox transform scales 24x24 → 48x48: (74, 74) → (148, 148)
    const [x, y] = Transforms2D.applyTransform(transform, 12, 12);

    // With viewBox 0 0 24 24 → viewport 48x48, scale is 2
    // So final: scale(2) → translate(50,50) → scale(2 from viewBox)
    // (12, 12) → (24, 24) → (74, 74) → (148, 148)
    expect(x).toBeCloseTo(148, 3);
    expect(y).toBeCloseTo(148, 3);
  });

  test('complex transform composition: translate + rotate + x/y', () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 100, 100, 'translate(20, 30) rotate(45)');

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;

    // Test origin point (0, 0)
    // Expected:
    // 1. translate(20, 30): (0, 0) → (20, 30)
    // 2. rotate(45): (20, 30) → (20*cos45 - 30*sin45, 20*sin45 + 30*cos45)
    // 3. translate(100, 100): add (100, 100)
    const [x, y] = Transforms2D.applyTransform(transform, 0, 0);

    const cos45 = Math.cos(45 * Math.PI / 180);
    const sin45 = Math.sin(45 * Math.PI / 180);
    const expectedX = 20 * cos45 - 30 * sin45 + 100;
    const expectedY = 20 * sin45 + 30 * cos45 + 100;

    expect(x).toBeCloseTo(expectedX, 5);
    expect(y).toBeCloseTo(expectedY, 5);
  });

  test('OLD INCORRECT BEHAVIOR: verify we are not doing translate then scale', () => {
    // This test verifies we fixed the bug where the OLD code did:
    // translate(x, y) THEN scale
    // Which would give WRONG result: (100, 100) instead of (70, 70)

    const svg = document.createElementNS(SVG_NS, 'svg');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const rect = createRect('r', 0, 0, 10, 10);
    const use = createUse('#r', 50, 50, 'scale(2)');

    defs.appendChild(rect);
    svg.appendChild(defs);
    svg.appendChild(use);

    const defsMap = UseSymbolResolver.buildDefsMap(svg);
    const useData = UseSymbolResolver.parseUseElement(use);
    const resolved = UseSymbolResolver.resolveUse(useData, defsMap);

    const transform = resolved.transform;
    const [x, y] = Transforms2D.applyTransform(transform, 10, 10);

    // OLD INCORRECT ORDER: translate(50,50) then scale(2)
    // (10, 10) → (60, 60) → (120, 120) ❌ WRONG!

    // NEW CORRECT ORDER: scale(2) then translate(50,50)
    // (10, 10) → (20, 20) → (70, 70) ✓ CORRECT!

    expect(x).not.toBeCloseTo(120, 6); // Should NOT be 120 (old bug)
    expect(y).not.toBeCloseTo(120, 6); // Should NOT be 120 (old bug)
    expect(x).toBeCloseTo(70, 6); // Should be 70 (correct)
    expect(y).toBeCloseTo(70, 6); // Should be 70 (correct)
  });
});
