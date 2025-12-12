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

// Simple test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff < tolerance) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got ${actual}, expected ${expected}, diff=${diff})`);
  }
}

function assertNotClose(actual, notExpected, tolerance, message) {
  const diff = Math.abs(actual - notExpected);
  if (diff >= tolerance) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got ${actual}, should NOT be ${notExpected}, diff=${diff})`);
  }
}

// Setup DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.Element = dom.window.Element;

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

console.log('\n=== Use Element Transform Order Tests ===\n');

// Test 1: use with both transform and x/y applies transform first
{
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

  assertClose(x, 70, 1e-6, 'use with transform + x/y: point x should be 70 (not 120)');
  assertClose(y, 70, 1e-6, 'use with transform + x/y: point y should be 70 (not 120)');
}

// Test 2: use with only x/y applies translation
{
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

  assertClose(x, 60, 1e-6, 'use with only x/y: point x should be 60');
  assertClose(y, 60, 1e-6, 'use with only x/y: point y should be 60');
}

// Test 3: use with only transform applies transform
{
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

  assertClose(x, 20, 1e-6, 'use with only transform: point x should be 20');
  assertClose(y, 20, 1e-6, 'use with only transform: point y should be 20');
}

// Test 4: use with rotate transform and x/y translation
{
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
  const [x, y] = Transforms2D.applyTransform(transform, 10, 0);

  assertClose(x, 100, 1e-5, 'use with rotate + x/y: point x should be 100');
  assertClose(y, 10, 1e-5, 'use with rotate + x/y: point y should be 10');
}

// Test 5: symbol with viewBox - transform order with scale
{
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
  const [x, y] = Transforms2D.applyTransform(transform, 12, 12);

  assertClose(x, 148, 1e-3, 'symbol with viewBox + scale: point x should be 148');
  assertClose(y, 148, 1e-3, 'symbol with viewBox + scale: point y should be 148');
}

// Test 6: complex transform composition
{
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
  const [x, y] = Transforms2D.applyTransform(transform, 0, 0);

  const cos45 = Math.cos(45 * Math.PI / 180);
  const sin45 = Math.sin(45 * Math.PI / 180);
  const expectedX = 20 * cos45 - 30 * sin45 + 100;
  const expectedY = 20 * sin45 + 30 * cos45 + 100;

  assertClose(x, expectedX, 1e-5, 'complex transform: point x correct');
  assertClose(y, expectedY, 1e-5, 'complex transform: point y correct');
}

// Test 7: OLD INCORRECT BEHAVIOR - verify we fixed the bug
{
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

  assertNotClose(x, 120, 1e-6, 'bug fix verification: x should NOT be 120 (old bug)');
  assertNotClose(y, 120, 1e-6, 'bug fix verification: y should NOT be 120 (old bug)');
  assertClose(x, 70, 1e-6, 'bug fix verification: x should be 70 (correct)');
  assertClose(y, 70, 1e-6, 'bug fix verification: y should be 70 (correct)');
}

// Summary
console.log('\n=== Transform Order Test Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
}
