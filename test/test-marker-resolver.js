/**
 * Comprehensive test suite for marker-resolver module
 * Tests all marker functionality including parsing, transforms, and resolution
 */

import Decimal from 'decimal.js';
import { Matrix } from '../src/matrix.js';
import * as Transforms2D from '../src/transforms2d.js';
import * as MarkerResolver from '../src/marker-resolver.js';

Decimal.set({ precision: 80 });

// Test utilities
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

function assertClose(a, b, tol, message) {
  const aNum = a instanceof Decimal ? a.toNumber() : a;
  const bNum = b instanceof Decimal ? b.toNumber() : b;
  const diff = Math.abs(aNum - bNum);
  if (diff < tol) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got ${aNum}, expected ${bNum}, diff=${diff})`);
  }
}

function assertArrayLength(arr, expectedLength, message) {
  if (Array.isArray(arr) && arr.length === expectedLength) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got length ${arr ? arr.length : 'null'}, expected ${expectedLength})`);
  }
}

// Mock DOM element creation
function createMockElement(tagName, attributes = {}) {
  const element = {
    tagName,
    attributes: {},
    children: [],
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };

  for (const [key, value] of Object.entries(attributes)) {
    element.attributes[key] = value;
  }

  return element;
}

console.log('\n=== Marker Resolver Tests ===\n');

// ============================================================================
// Test 1-5: parseMarkerElement
// ============================================================================
console.log('\n--- Marker Element Parsing ---\n');

// Test 1: Basic marker parsing
{
  const marker = createMockElement('marker', {
    id: 'arrow',
    markerWidth: '10',
    markerHeight: '10',
    refX: '5',
    refY: '5',
    orient: 'auto'
  });

  const parsed = MarkerResolver.parseMarkerElement(marker);
  assert(parsed.id === 'arrow', 'Test 1: Marker id parsed correctly');
  assertClose(parsed.markerWidth, 10, 0.001, 'Test 1: markerWidth parsed correctly');
  assertClose(parsed.markerHeight, 10, 0.001, 'Test 1: markerHeight parsed correctly');
  assertClose(parsed.refX, 5, 0.001, 'Test 1: refX parsed correctly');
  assertClose(parsed.refY, 5, 0.001, 'Test 1: refY parsed correctly');
  assert(parsed.orient === 'auto', 'Test 1: orient auto parsed correctly');
}

// Test 2: Marker with default values
{
  const marker = createMockElement('marker', { id: 'simple' });
  const parsed = MarkerResolver.parseMarkerElement(marker);

  assertClose(parsed.markerWidth, 3, 0.001, 'Test 2: Default markerWidth is 3');
  assertClose(parsed.markerHeight, 3, 0.001, 'Test 2: Default markerHeight is 3');
  assertClose(parsed.refX, 0, 0.001, 'Test 2: Default refX is 0');
  assertClose(parsed.refY, 0, 0.001, 'Test 2: Default refY is 0');
  assert(parsed.orient === 'auto', 'Test 2: Default orient is auto');
  assert(parsed.markerUnits === 'strokeWidth', 'Test 2: Default markerUnits is strokeWidth');
}

// Test 3: Marker with fixed angle orientation
{
  const marker = createMockElement('marker', {
    id: 'angled',
    orient: '45'
  });

  const parsed = MarkerResolver.parseMarkerElement(marker);
  assertClose(parsed.orient, 45, 0.001, 'Test 3: Fixed angle orientation parsed as number');
}

// Test 4: Marker with auto-start-reverse
{
  const marker = createMockElement('marker', {
    id: 'reverse',
    orient: 'auto-start-reverse'
  });

  const parsed = MarkerResolver.parseMarkerElement(marker);
  assert(parsed.orient === 'auto-start-reverse', 'Test 4: auto-start-reverse parsed correctly');
}

// Test 5: Marker with viewBox
{
  const marker = createMockElement('marker', {
    id: 'viewbox-marker',
    viewBox: '0 0 10 10'
  });

  const parsed = MarkerResolver.parseMarkerElement(marker);
  assert(parsed.viewBox !== null, 'Test 5: viewBox parsed');
  assertClose(parsed.viewBox.x, 0, 0.001, 'Test 5: viewBox x correct');
  assertClose(parsed.viewBox.y, 0, 0.001, 'Test 5: viewBox y correct');
  assertClose(parsed.viewBox.width, 10, 0.001, 'Test 5: viewBox width correct');
  assertClose(parsed.viewBox.height, 10, 0.001, 'Test 5: viewBox height correct');
}

// ============================================================================
// Test 6-8: parseMarkerChild
// ============================================================================
console.log('\n--- Marker Child Parsing ---\n');

// Test 6: Parse path child
{
  const path = createMockElement('path', {
    d: 'M 0 0 L 10 5 L 0 10 Z',
    fill: 'black'
  });

  const parsed = MarkerResolver.parseMarkerChild(path);
  assert(parsed.type === 'path', 'Test 6: Path type correct');
  assert(parsed.d === 'M 0 0 L 10 5 L 0 10 Z', 'Test 6: Path data preserved');
  assert(parsed.fill === 'black', 'Test 6: Fill attribute parsed');
}

// Test 7: Parse circle child
{
  const circle = createMockElement('circle', {
    cx: '5',
    cy: '5',
    r: '3',
    fill: 'red'
  });

  const parsed = MarkerResolver.parseMarkerChild(circle);
  assert(parsed.type === 'circle', 'Test 7: Circle type correct');
  assertClose(parsed.cx, 5, 0.001, 'Test 7: Circle cx parsed');
  assertClose(parsed.cy, 5, 0.001, 'Test 7: Circle cy parsed');
  assertClose(parsed.r, 3, 0.001, 'Test 7: Circle radius parsed');
}

// Test 8: Parse rect child
{
  const rect = createMockElement('rect', {
    x: '0',
    y: '0',
    width: '10',
    height: '10'
  });

  const parsed = MarkerResolver.parseMarkerChild(rect);
  assert(parsed.type === 'rect', 'Test 8: Rect type correct');
  assertClose(parsed.width, 10, 0.001, 'Test 8: Rect width parsed');
  assertClose(parsed.height, 10, 0.001, 'Test 8: Rect height parsed');
}

// ============================================================================
// Test 9-15: getMarkerTransform
// ============================================================================
console.log('\n--- Marker Transform Calculation ---\n');

// Test 9: Basic transform with orient auto
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null
  };

  const position = { x: 100, y: 200 };
  const tangentAngle = 0; // Horizontal
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, 1, false);

  assert(transform instanceof Matrix, 'Test 9: Transform returns Matrix');
  assert(transform.rows === 3 && transform.cols === 3, 'Test 9: Transform is 3x3 matrix');

  // Check that point (refX, refY) transforms to position
  const result = Transforms2D.applyTransform(transform, 5, 5);
  assertClose(result[0], 100, 0.01, 'Test 9: Transform aligns refX to position.x');
  assertClose(result[1], 200, 0.01, 'Test 9: Transform aligns refY to position.y');
}

// Test 10: Transform with rotation (orient auto)
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null
  };

  const position = { x: 0, y: 0 };
  const tangentAngle = Math.PI / 2; // 90 degrees (pointing up)
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, 1, false);

  // Point (10, 5) should rotate 90 degrees and translate
  const result = Transforms2D.applyTransform(transform, 10, 5);
  // Transform order: translate(-refX, -refY) then rotate(90°) then translate(position)
  // Point (10, 5) -> translate(-0, -5) -> (10, 0) -> rotate 90° -> (0, 10)
  assertClose(result[0], 0, 0.01, 'Test 10: Rotation applied correctly (x)');
  assertClose(result[1], 10, 0.01, 'Test 10: Rotation applied correctly (y)');
}

// Test 11: Transform with fixed angle
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 45, // 45 degrees
    markerUnits: 'userSpaceOnUse',
    viewBox: null
  };

  const position = { x: 0, y: 0 };
  const tangentAngle = 0; // Should be ignored
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, 1, false);

  // Point (1, 0) rotated 45 degrees
  const result = Transforms2D.applyTransform(transform, 1, 0);
  assertClose(result[0], Math.cos(Math.PI / 4), 0.01, 'Test 11: Fixed angle rotation (x)');
  assertClose(result[1], Math.sin(Math.PI / 4), 0.01, 'Test 11: Fixed angle rotation (y)');
}

// Test 12: Transform with strokeWidth scaling
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'strokeWidth',
    viewBox: null
  };

  const position = { x: 0, y: 0 };
  const tangentAngle = 0;
  const strokeWidth = 2;
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, strokeWidth, false);

  // Point (1, 0) should be scaled by strokeWidth
  const result = Transforms2D.applyTransform(transform, 1, 0);
  assertClose(result[0], 2, 0.01, 'Test 12: strokeWidth scaling applied');
}

// Test 13: Transform with auto-start-reverse
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto-start-reverse',
    markerUnits: 'userSpaceOnUse',
    viewBox: null
  };

  const position = { x: 0, y: 0 };
  const tangentAngle = 0; // Horizontal right
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, 1, true);

  // Should add 180 degrees for start marker
  const result = Transforms2D.applyTransform(transform, 1, 0);
  assertClose(result[0], -1, 0.01, 'Test 13: auto-start-reverse adds 180 degrees');
  assertClose(result[1], 0, 0.01, 'Test 13: auto-start-reverse y unchanged');
}

// Test 14: Transform with viewBox
{
  const markerDef = {
    markerWidth: 20,
    markerHeight: 20,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: { x: 0, y: 0, width: 10, height: 10 }
  };

  const position = { x: 0, y: 0 };
  const tangentAngle = 0;
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, 1, false);

  // Point (10, 10) in viewBox should map to (20, 20) in marker viewport
  const result = Transforms2D.applyTransform(transform, 10, 10);
  assertClose(result[0], 20, 0.1, 'Test 14: viewBox scaling x');
  assertClose(result[1], 20, 0.1, 'Test 14: viewBox scaling y');
}

// Test 15: Combined transform (position + rotation + scaling + refPoint)
{
  const markerDef = {
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: 'auto',
    markerUnits: 'strokeWidth',
    viewBox: null
  };

  const position = { x: 100, y: 200 };
  const tangentAngle = Math.PI / 4; // 45 degrees
  const strokeWidth = 2;
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, strokeWidth, false);

  // Verify transform is valid matrix
  assert(transform instanceof Matrix, 'Test 15: Combined transform is Matrix');
  assert(transform.rows === 3, 'Test 15: Combined transform has 3 rows');
  assert(transform.cols === 3, 'Test 15: Combined transform has 3 cols');
}

// ============================================================================
// Test 16-20: parsePathCommands and getPathVertices
// ============================================================================
console.log('\n--- Path Parsing and Vertex Extraction ---\n');

// Test 16: Parse simple line path
{
  const pathData = 'M 0 0 L 100 0 L 100 100';
  const commands = MarkerResolver.parsePathCommands(pathData);

  assertArrayLength(commands, 3, 'Test 16: Correct number of commands');
  assert(commands[0].type === 'M', 'Test 16: First command is M');
  assert(commands[1].type === 'L', 'Test 16: Second command is L');
  assertClose(commands[2].x, 100, 0.001, 'Test 16: Command coordinates parsed');
}

// Test 17: Parse path with relative commands
{
  const pathData = 'M 10 10 l 50 0 l 0 50';
  const commands = MarkerResolver.parsePathCommands(pathData);

  assertArrayLength(commands, 3, 'Test 17: Relative commands parsed');
  assertClose(commands[1].x, 60, 0.001, 'Test 17: Relative l converts to absolute');
  assertClose(commands[2].y, 60, 0.001, 'Test 17: Relative coordinates accumulated');
}

// Test 18: Get vertices from simple path
{
  const pathData = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
  const vertices = MarkerResolver.getPathVertices(pathData);

  assertArrayLength(vertices, 4, 'Test 18: Correct number of vertices');
  assertClose(vertices[0].x, 0, 0.001, 'Test 18: First vertex x');
  assertClose(vertices[0].y, 0, 0.001, 'Test 18: First vertex y');
  assertClose(vertices[3].x, 0, 0.001, 'Test 18: Last vertex x');
  assertClose(vertices[3].y, 100, 0.001, 'Test 18: Last vertex y');
}

// Test 19: Verify tangent angles
{
  const pathData = 'M 0 0 L 100 0 L 100 100';
  const vertices = MarkerResolver.getPathVertices(pathData);

  assertClose(vertices[0].tangentOut, 0, 0.01, 'Test 19: Horizontal tangent is 0');
  assertClose(vertices[1].tangentIn, 0, 0.01, 'Test 19: Incoming tangent correct');
  assertClose(vertices[1].tangentOut, Math.PI / 2, 0.01, 'Test 19: Vertical tangent is π/2');
}

// Test 20: Parse cubic bezier path
{
  const pathData = 'M 0 0 C 50 0 50 100 100 100';
  const commands = MarkerResolver.parsePathCommands(pathData);

  assertArrayLength(commands, 2, 'Test 20: Bezier path has 2 commands');
  assert(commands[1].type === 'C', 'Test 20: Second command is C');
  assertClose(commands[1].x1, 50, 0.001, 'Test 20: Control point 1 x parsed');
  assertClose(commands[1].y2, 100, 0.001, 'Test 20: Control point 2 y parsed');
}

// ============================================================================
// Test 21-25: resolveMarkers
// ============================================================================
console.log('\n--- Marker Resolution ---\n');

// Test 21: Resolve marker-end
{
  const path = createMockElement('path', {
    d: 'M 0 0 L 100 0',
    'marker-end': 'url(#arrow)',
    'stroke-width': '2'
  });

  const markerDef = {
    id: 'arrow',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 5,
    orient: 'auto',
    markerUnits: 'strokeWidth',
    viewBox: null,
    children: []
  };

  const defsMap = { arrow: markerDef };
  const instances = MarkerResolver.resolveMarkers(path, defsMap);

  assertArrayLength(instances, 1, 'Test 21: One marker instance created');
  assert(instances[0].type === 'end', 'Test 21: Marker type is end');
  assertClose(instances[0].position.x, 100, 0.001, 'Test 21: Marker at end position x');
  assertClose(instances[0].position.y, 0, 0.001, 'Test 21: Marker at end position y');
}

// Test 22: Resolve marker-start
{
  const path = createMockElement('path', {
    d: 'M 0 0 L 100 100',
    'marker-start': 'url(#circle)'
  });

  const markerDef = {
    id: 'circle',
    markerWidth: 5,
    markerHeight: 5,
    refX: 2.5,
    refY: 2.5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: []
  };

  const defsMap = { circle: markerDef };
  const instances = MarkerResolver.resolveMarkers(path, defsMap);

  assertArrayLength(instances, 1, 'Test 22: One marker instance created');
  assert(instances[0].type === 'start', 'Test 22: Marker type is start');
  assertClose(instances[0].position.x, 0, 0.001, 'Test 22: Marker at start position');
}

// Test 23: Resolve marker-mid
{
  const path = createMockElement('path', {
    d: 'M 0 0 L 50 50 L 100 0',
    'marker-mid': 'url(#dot)'
  });

  const markerDef = {
    id: 'dot',
    markerWidth: 3,
    markerHeight: 3,
    refX: 1.5,
    refY: 1.5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: []
  };

  const defsMap = { dot: markerDef };
  const instances = MarkerResolver.resolveMarkers(path, defsMap);

  assertArrayLength(instances, 1, 'Test 23: One mid marker created');
  assert(instances[0].type === 'mid', 'Test 23: Marker type is mid');
  assertClose(instances[0].position.x, 50, 0.001, 'Test 23: Mid marker at middle vertex');
}

// Test 24: Resolve all marker types
{
  const path = createMockElement('path', {
    d: 'M 0 0 L 50 0 L 100 0',
    'marker-start': 'url(#start)',
    'marker-mid': 'url(#mid)',
    'marker-end': 'url(#end)'
  });

  const startMarker = { id: 'start', markerWidth: 5, markerHeight: 5, refX: 0, refY: 0, orient: 'auto', markerUnits: 'userSpaceOnUse', viewBox: null, children: [] };
  const midMarker = { id: 'mid', markerWidth: 3, markerHeight: 3, refX: 0, refY: 0, orient: 'auto', markerUnits: 'userSpaceOnUse', viewBox: null, children: [] };
  const endMarker = { id: 'end', markerWidth: 5, markerHeight: 5, refX: 0, refY: 0, orient: 'auto', markerUnits: 'userSpaceOnUse', viewBox: null, children: [] };

  const defsMap = { start: startMarker, mid: midMarker, end: endMarker };
  const instances = MarkerResolver.resolveMarkers(path, defsMap);

  assertArrayLength(instances, 3, 'Test 24: Three markers created (start, mid, end)');
  assert(instances[0].type === 'start', 'Test 24: First marker is start');
  assert(instances[1].type === 'mid', 'Test 24: Second marker is mid');
  assert(instances[2].type === 'end', 'Test 24: Third marker is end');
}

// Test 25: Empty path
{
  const path = createMockElement('path', {
    d: '',
    'marker-end': 'url(#arrow)'
  });

  const markerDef = { id: 'arrow', markerWidth: 10, markerHeight: 10, refX: 0, refY: 0, orient: 'auto', markerUnits: 'userSpaceOnUse', viewBox: null, children: [] };
  const defsMap = { arrow: markerDef };
  const instances = MarkerResolver.resolveMarkers(path, defsMap);

  assertArrayLength(instances, 0, 'Test 25: No markers for empty path');
}

// ============================================================================
// Test 26-30: Helper functions (pathToPoints, circleToPoints, etc.)
// ============================================================================
console.log('\n--- Shape to Points Conversion ---\n');

// Test 26: pathToPoints with lines
{
  const pathData = 'M 0 0 L 10 0 L 10 10';
  const points = MarkerResolver.pathToPoints(pathData, 1);

  assert(points.length >= 3, 'Test 26: Path has at least 3 points');
  assertClose(points[0].x, 0, 0.001, 'Test 26: First point x');
  assertClose(points[1].x, 10, 0.001, 'Test 26: Second point x');
}

// Test 27: circleToPoints
{
  const points = MarkerResolver.circleToPoints(0, 0, 10, 4);

  assertArrayLength(points, 4, 'Test 27: Circle with 4 segments has 4 points');
  assertClose(points[0].x, 10, 0.001, 'Test 27: First point at radius');
  assertClose(points[0].y, 0, 0.001, 'Test 27: First point at angle 0');
  assertClose(points[1].x, 0, 0.001, 'Test 27: Second point at 90 degrees');
  assertClose(points[1].y, 10, 0.001, 'Test 27: Second point at radius');
}

// Test 28: ellipseToPoints
{
  const points = MarkerResolver.ellipseToPoints(0, 0, 10, 5, 4);

  assertArrayLength(points, 4, 'Test 28: Ellipse with 4 segments has 4 points');
  assertClose(points[0].x, 10, 0.001, 'Test 28: First point at rx');
  assertClose(points[1].y, 5, 0.001, 'Test 28: Second point at ry');
}

// Test 29: parsePoints
{
  const pointsStr = '10,20 30,40 50,60';
  const points = MarkerResolver.parsePoints(pointsStr);

  assertArrayLength(points, 3, 'Test 29: Parse 3 points');
  assertClose(points[0].x, 10, 0.001, 'Test 29: First point x');
  assertClose(points[1].y, 40, 0.001, 'Test 29: Second point y');
  assertClose(points[2].x, 50, 0.001, 'Test 29: Third point x');
}

// Test 30: parsePoints with space separation
{
  const pointsStr = '10 20 30 40';
  const points = MarkerResolver.parsePoints(pointsStr);

  assertArrayLength(points, 2, 'Test 30: Parse 2 points with spaces');
  assertClose(points[0].x, 10, 0.001, 'Test 30: First point x');
  assertClose(points[1].y, 40, 0.001, 'Test 30: Second point y');
}

// ============================================================================
// Test 31-35: markerToPolygons
// ============================================================================
console.log('\n--- Marker to Polygons Conversion ---\n');

// Test 31: Convert marker with path child
{
  const markerDef = {
    id: 'arrow',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 10 5 L 0 10 Z' }
    ]
  };

  const transform = Matrix.identity(3);
  const instance = {
    markerDef,
    position: { x: 0, y: 0 },
    transform,
    type: 'end'
  };

  const polygons = MarkerResolver.markerToPolygons(instance, { precision: 2, curveSegments: 5 });

  assert(polygons.length > 0, 'Test 31: Polygons created from path');
  assert(Array.isArray(polygons[0]), 'Test 31: First polygon is array');
  assert(polygons[0].length > 0, 'Test 31: First polygon has points');
}

// Test 32: Convert marker with rect child
{
  const markerDef = {
    id: 'box',
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'rect', x: 0, y: 0, width: 10, height: 10 }
    ]
  };

  const transform = Matrix.identity(3);
  const instance = {
    markerDef,
    position: { x: 0, y: 0 },
    transform,
    type: 'end'
  };

  const polygons = MarkerResolver.markerToPolygons(instance, { precision: 2 });

  assert(polygons.length > 0, 'Test 32: Polygons created from rect');
  assertArrayLength(polygons[0], 4, 'Test 32: Rect converted to 4 points');
}

// Test 33: Convert marker with circle child
{
  const markerDef = {
    id: 'dot',
    markerWidth: 5,
    markerHeight: 5,
    refX: 2.5,
    refY: 2.5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'circle', cx: 2.5, cy: 2.5, r: 2 }
    ]
  };

  const transform = Matrix.identity(3);
  const instance = {
    markerDef,
    position: { x: 0, y: 0 },
    transform,
    type: 'end'
  };

  const polygons = MarkerResolver.markerToPolygons(instance, { precision: 2, curveSegments: 10 });

  assert(polygons.length > 0, 'Test 33: Polygons created from circle');
  assert(polygons[0].length === 40, 'Test 33: Circle approximated with correct segments');
}

// Test 34: Convert marker with multiple children
{
  const markerDef = {
    id: 'complex',
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 5 0 L 5 5 Z' },
      { type: 'circle', cx: 7, cy: 7, r: 2 }
    ]
  };

  const transform = Matrix.identity(3);
  const instance = {
    markerDef,
    position: { x: 0, y: 0 },
    transform,
    type: 'end'
  };

  const polygons = MarkerResolver.markerToPolygons(instance, { precision: 2, curveSegments: 5 });

  assertArrayLength(polygons, 2, 'Test 34: Two polygons from two children');
}

// Test 35: Transform applied to polygon points
{
  const markerDef = {
    id: 'arrow',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 10 0' }
    ]
  };

  const transform = Transforms2D.translation(100, 200);
  const instance = {
    markerDef,
    position: { x: 100, y: 200 },
    transform,
    type: 'end'
  };

  const polygons = MarkerResolver.markerToPolygons(instance, { precision: 1 });

  assert(polygons.length > 0, 'Test 35: Polygon created');
  assert(polygons[0].length > 0, 'Test 35: Polygon has points');
  assertClose(polygons[0][0].x, 100, 0.2, 'Test 35: Transform applied to x');
  assertClose(polygons[0][0].y, 200, 0.2, 'Test 35: Transform applied to y');
}

// ============================================================================
// Test 36-40: markersToPathData
// ============================================================================
console.log('\n--- Markers to Path Data Conversion ---\n');

// Test 36: Single marker to path data
{
  const markerDef = {
    id: 'simple',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 5 0 L 5 5 Z' }
    ]
  };

  const transform = Matrix.identity(3);
  const instances = [{
    markerDef,
    position: { x: 0, y: 0 },
    transform,
    type: 'end'
  }];

  const pathData = MarkerResolver.markersToPathData(instances, 2);

  assert(typeof pathData === 'string', 'Test 36: Path data is string');
  assert(pathData.includes('M'), 'Test 36: Path data contains M command');
  assert(pathData.includes('L'), 'Test 36: Path data contains L command');
  assert(pathData.includes('Z'), 'Test 36: Path data contains Z command');
}

// Test 37: Multiple markers to path data
{
  const markerDef = {
    id: 'dot',
    markerWidth: 5,
    markerHeight: 5,
    refX: 2.5,
    refY: 2.5,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'rect', x: 0, y: 0, width: 5, height: 5 }
    ]
  };

  const instances = [
    {
      markerDef,
      position: { x: 0, y: 0 },
      transform: Transforms2D.translation(0, 0),
      type: 'start'
    },
    {
      markerDef,
      position: { x: 100, y: 100 },
      transform: Transforms2D.translation(100, 100),
      type: 'end'
    }
  ];

  const pathData = MarkerResolver.markersToPathData(instances, 1);

  assert(typeof pathData === 'string', 'Test 37: Path data is string');
  assert(pathData.split('M').length - 1 >= 2, 'Test 37: Multiple M commands for multiple markers');
}

// Test 38: Empty markers array
{
  const pathData = MarkerResolver.markersToPathData([], 2);
  assert(pathData === '', 'Test 38: Empty array produces empty path data');
}

// Test 39: Precision control
{
  const markerDef = {
    id: 'precise',
    markerWidth: 10,
    markerHeight: 10,
    refX: 0,
    refY: 0,
    orient: 'auto',
    markerUnits: 'userSpaceOnUse',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 1.23456789 0' }
    ]
  };

  const instances = [{
    markerDef,
    position: { x: 0, y: 0 },
    transform: Matrix.identity(3),
    type: 'end'
  }];

  const pathData = MarkerResolver.markersToPathData(instances, 3);

  assert(pathData.includes('.'), 'Test 39: Path data includes decimals');
  // Check that numbers have appropriate precision (3 decimal places)
  const numbers = pathData.match(/\d+\.\d+/g);
  if (numbers && numbers.length > 0) {
    const decimalPlaces = numbers[0].split('.')[1].length;
    assert(decimalPlaces <= 3, 'Test 39: Precision limited to 3 decimal places');
  }
}

// Test 40: Complex marker with transform
{
  const markerDef = {
    id: 'complex',
    markerWidth: 10,
    markerHeight: 10,
    refX: 5,
    refY: 5,
    orient: 45, // Fixed angle
    markerUnits: 'strokeWidth',
    viewBox: null,
    children: [
      { type: 'path', d: 'M 0 0 L 10 0 L 5 10 Z' }
    ]
  };

  const position = { x: 100, y: 200 };
  const tangentAngle = 0;
  const strokeWidth = 2;
  const transform = MarkerResolver.getMarkerTransform(markerDef, position, tangentAngle, strokeWidth, false);

  const instances = [{
    markerDef,
    position,
    transform,
    type: 'end'
  }];

  const pathData = MarkerResolver.markersToPathData(instances, 2);

  assert(pathData.length > 0, 'Test 40: Complex marker produces path data');
  assert(pathData.includes('M'), 'Test 40: Path data starts with M');
  assert(pathData.includes('Z'), 'Test 40: Path data closes with Z');
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n=== Test Summary ===\n');
console.log(`Total tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed > 0) {
  process.exit(1);
}
