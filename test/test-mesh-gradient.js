/**
 * Test suite for Mesh Gradient Module
 * Tests parsing, evaluation, rasterization, and clipping of SVG 2.0 mesh gradients
 */

import Decimal from 'decimal.js';
import * as MeshGradient from '../src/mesh-gradient.js';
import * as PolygonClip from '../src/polygon-clip.js';
import * as fs from 'fs';
import * as path from 'path';

Decimal.set({ precision: 80 });

const D = x => new Decimal(x);

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertClose(a, b, tolerance = 1e-10, message = '') {
  const diff = Math.abs(Number(a) - Number(b));
  if (diff > tolerance) {
    throw new Error(`${message}: expected ${a} ~ ${b}, diff = ${diff}`);
  }
}

console.log('\n======================================================================');
console.log('MESH GRADIENT TESTS');
console.log('======================================================================\n');

// ============================================================================
// Color Parsing Tests
// ============================================================================

test('parseColor: rgb() format', () => {
  const c = MeshGradient.parseColor('rgb(255, 128, 64)');
  assert(c.r === 255, 'Red should be 255');
  assert(c.g === 128, 'Green should be 128');
  assert(c.b === 64, 'Blue should be 64');
  assert(c.a === 255, 'Alpha should be 255');
});

test('parseColor: rgba() format', () => {
  const c = MeshGradient.parseColor('rgba(100, 150, 200, 0.5)');
  assert(c.r === 100, 'Red should be 100');
  assert(c.g === 150, 'Green should be 150');
  assert(c.b === 200, 'Blue should be 200');
  assertClose(c.a, 127.5, 1, 'Alpha should be ~127.5');
});

test('parseColor: hex 6-digit', () => {
  const c = MeshGradient.parseColor('#ff8040');
  assert(c.r === 255, 'Red should be 255');
  assert(c.g === 128, 'Green should be 128');
  assert(c.b === 64, 'Blue should be 64');
});

test('parseColor: hex 3-digit', () => {
  const c = MeshGradient.parseColor('#f84');
  assert(c.r === 255, 'Red should be 255');
  assert(c.g === 136, 'Green should be 136');
  assert(c.b === 68, 'Blue should be 68');
});

test('parseColor: named color', () => {
  const c = MeshGradient.parseColor('blue');
  assert(c.r === 0, 'Red should be 0');
  assert(c.g === 0, 'Green should be 0');
  assert(c.b === 255, 'Blue should be 255');
});

test('parseColor: with opacity multiplier', () => {
  const c = MeshGradient.parseColor('white', 0.5);
  assert(c.r === 255, 'Red should be 255');
  assertClose(c.a, 127.5, 1, 'Alpha should be ~127.5');
});

// ============================================================================
// Color Interpolation Tests
// ============================================================================

test('lerpColor: midpoint interpolation', () => {
  const c1 = MeshGradient.color(0, 0, 0, 255);
  const c2 = MeshGradient.color(255, 255, 255, 255);
  const mid = MeshGradient.lerpColor(c1, c2, 0.5);
  assertClose(mid.r, 127.5, 1, 'Red midpoint');
  assertClose(mid.g, 127.5, 1, 'Green midpoint');
  assertClose(mid.b, 127.5, 1, 'Blue midpoint');
});

test('lerpColor: t=0 returns first color', () => {
  const c1 = MeshGradient.color(100, 50, 25, 255);
  const c2 = MeshGradient.color(200, 150, 75, 255);
  const result = MeshGradient.lerpColor(c1, c2, 0);
  assert(result.r === 100, 'Should return first color');
});

test('lerpColor: t=1 returns second color', () => {
  const c1 = MeshGradient.color(100, 50, 25, 255);
  const c2 = MeshGradient.color(200, 150, 75, 255);
  const result = MeshGradient.lerpColor(c1, c2, 1);
  assert(result.r === 200, 'Should return second color');
});

test('bilinearColor: center of quad', () => {
  const c00 = MeshGradient.color(0, 0, 0, 255);
  const c10 = MeshGradient.color(255, 0, 0, 255);
  const c01 = MeshGradient.color(0, 255, 0, 255);
  const c11 = MeshGradient.color(0, 0, 255, 255);

  const center = MeshGradient.bilinearColor(c00, c10, c01, c11, 0.5, 0.5);
  // At center, should be average of all four
  assertClose(center.r, 63.75, 1, 'Red at center');
  assertClose(center.g, 63.75, 1, 'Green at center');
  assertClose(center.b, 63.75, 1, 'Blue at center');
});

test('bilinearColor: corner returns exact color', () => {
  const c00 = MeshGradient.color(100, 0, 0, 255);
  const c10 = MeshGradient.color(0, 100, 0, 255);
  const c01 = MeshGradient.color(0, 0, 100, 255);
  const c11 = MeshGradient.color(50, 50, 50, 255);

  const corner = MeshGradient.bilinearColor(c00, c10, c01, c11, 0, 0);
  assert(corner.r === 100, 'Corner (0,0) should return c00');
});

// ============================================================================
// Bezier Curve Tests
// ============================================================================

test('evalCubicBezier: t=0 returns start point', () => {
  const p0 = MeshGradient.point(0, 0);
  const p1 = MeshGradient.point(10, 20);
  const p2 = MeshGradient.point(30, 20);
  const p3 = MeshGradient.point(40, 0);

  const result = MeshGradient.evalCubicBezier(p0, p1, p2, p3, D(0));
  assertClose(result.x, 0, 1e-10, 'x at t=0');
  assertClose(result.y, 0, 1e-10, 'y at t=0');
});

test('evalCubicBezier: t=1 returns end point', () => {
  const p0 = MeshGradient.point(0, 0);
  const p1 = MeshGradient.point(10, 20);
  const p2 = MeshGradient.point(30, 20);
  const p3 = MeshGradient.point(40, 0);

  const result = MeshGradient.evalCubicBezier(p0, p1, p2, p3, D(1));
  assertClose(result.x, 40, 1e-10, 'x at t=1');
  assertClose(result.y, 0, 1e-10, 'y at t=1');
});

test('evalCubicBezier: t=0.5 on symmetric curve', () => {
  const p0 = MeshGradient.point(0, 0);
  const p1 = MeshGradient.point(0, 10);
  const p2 = MeshGradient.point(10, 10);
  const p3 = MeshGradient.point(10, 0);

  const mid = MeshGradient.evalCubicBezier(p0, p1, p2, p3, D(0.5));
  // For this symmetric curve, midpoint should be at (5, 7.5)
  assertClose(mid.x, 5, 1e-10, 'x at midpoint');
  assertClose(mid.y, 7.5, 1e-10, 'y at midpoint');
});

test('splitBezier: produces two valid curves', () => {
  const curve = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 20),
    MeshGradient.point(30, 20),
    MeshGradient.point(40, 0)
  ];

  const [left, right] = MeshGradient.splitBezier(curve);

  // Left curve starts at original start
  assertClose(left[0].x, 0, 1e-10, 'Left start x');
  assertClose(left[0].y, 0, 1e-10, 'Left start y');

  // Right curve ends at original end
  assertClose(right[3].x, 40, 1e-10, 'Right end x');
  assertClose(right[3].y, 0, 1e-10, 'Right end y');

  // Curves meet at midpoint
  assertClose(left[3].x, right[0].x, 1e-10, 'Curves meet x');
  assertClose(left[3].y, right[0].y, 1e-10, 'Curves meet y');
});

// ============================================================================
// Coons Patch Tests
// ============================================================================

test('CoonsPatch: evaluate corner (0,0)', () => {
  // Simple rectangular patch
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [
    [MeshGradient.color(255, 0, 0, 255), MeshGradient.color(0, 255, 0, 255)],
    [MeshGradient.color(0, 0, 255, 255), MeshGradient.color(255, 255, 0, 255)]
  ];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const result = patch.evaluate(D(0), D(0));

  assertClose(result.point.x, 0, 1e-10, 'Corner x');
  assertClose(result.point.y, 0, 1e-10, 'Corner y');
  assert(result.color.r === 255, 'Corner color red');
});

test('CoonsPatch: evaluate center', () => {
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [
    [MeshGradient.color(0, 0, 0, 255), MeshGradient.color(0, 0, 0, 255)],
    [MeshGradient.color(0, 0, 0, 255), MeshGradient.color(0, 0, 0, 255)]
  ];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const result = patch.evaluate(D(0.5), D(0.5));

  // Center of rectangular patch should be at (15, 15)
  assertClose(result.point.x, 15, 1e-10, 'Center x');
  assertClose(result.point.y, 15, 1e-10, 'Center y');
});

test('CoonsPatch: bounding box', () => {
  const top = [
    MeshGradient.point(10, 5),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0),
    MeshGradient.point(40, 5)
  ];
  const right = [
    MeshGradient.point(40, 5),
    MeshGradient.point(50, 15),
    MeshGradient.point(50, 25),
    MeshGradient.point(40, 35)
  ];
  const bottom = [
    MeshGradient.point(10, 35),
    MeshGradient.point(20, 40),
    MeshGradient.point(30, 40),
    MeshGradient.point(40, 35)
  ];
  const left = [
    MeshGradient.point(10, 5),
    MeshGradient.point(0, 15),
    MeshGradient.point(0, 25),
    MeshGradient.point(10, 35)
  ];

  const colors = [[MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)],
                  [MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)]];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const bbox = patch.getBBox();

  assertClose(bbox.minX, 0, 1e-10, 'minX');
  assertClose(bbox.maxX, 50, 1e-10, 'maxX');
  assertClose(bbox.minY, 0, 1e-10, 'minY');
  assertClose(bbox.maxY, 40, 1e-10, 'maxY');
});

test('CoonsPatch: isFlat for rectangular patch', () => {
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [[MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)],
                  [MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)]];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  assert(patch.isFlat(), 'Rectangular patch should be flat');
});

test('CoonsPatch: subdivide produces 4 patches', () => {
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, -5),
    MeshGradient.point(20, -5),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(35, 10),
    MeshGradient.point(35, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 35),
    MeshGradient.point(20, 35),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(-5, 10),
    MeshGradient.point(-5, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [
    [MeshGradient.color(255, 0, 0, 255), MeshGradient.color(0, 255, 0, 255)],
    [MeshGradient.color(0, 0, 255, 255), MeshGradient.color(255, 255, 0, 255)]
  ];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const subdivided = patch.subdivide();

  assert(subdivided.length === 4, 'Should produce 4 sub-patches');
  assert(subdivided[0] instanceof MeshGradient.CoonsPatch, 'Sub-patches should be CoonsPatch');
});

// ============================================================================
// Mesh to Polygon Conversion Tests
// ============================================================================

test('meshGradientToPolygons: produces polygon grid', () => {
  // Create a simple test mesh with one patch
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [
    [MeshGradient.color(255, 0, 0, 255), MeshGradient.color(0, 255, 0, 255)],
    [MeshGradient.color(0, 0, 255, 255), MeshGradient.color(255, 255, 0, 255)]
  ];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const meshData = { patches: [patch] };

  const polygons = MeshGradient.meshGradientToPolygons(meshData, { subdivisions: 4 });

  // 4x4 subdivisions = 16 quads
  assert(polygons.length === 16, `Should produce 16 polygons, got ${polygons.length}`);

  // Each polygon should have 4 vertices
  for (const { polygon } of polygons) {
    assert(polygon.length === 4, 'Each polygon should have 4 vertices');
  }

  // Each should have a color
  for (const { color } of polygons) {
    assert(color.r !== undefined, 'Each polygon should have a color');
  }
});

// ============================================================================
// Clipping Tests
// ============================================================================

test('clipMeshGradient: clips to rectangle', () => {
  // Create a patch
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [
    [MeshGradient.color(255, 0, 0, 255), MeshGradient.color(0, 255, 0, 255)],
    [MeshGradient.color(0, 0, 255, 255), MeshGradient.color(255, 255, 0, 255)]
  ];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const meshData = { patches: [patch] };

  // Clip to a smaller rectangle (10,10)-(20,20)
  const clipPolygon = [
    PolygonClip.point(10, 10),
    PolygonClip.point(20, 10),
    PolygonClip.point(20, 20),
    PolygonClip.point(10, 20)
  ];

  const clipped = MeshGradient.clipMeshGradient(meshData, clipPolygon, { subdivisions: 4 });

  assert(clipped.length > 0, 'Should produce clipped polygons');

  // All clipped polygons should be within the clip region
  for (const { polygon } of clipped) {
    for (const vertex of polygon) {
      assert(Number(vertex.x) >= 9.99 && Number(vertex.x) <= 20.01, 'X within clip bounds');
      assert(Number(vertex.y) >= 9.99 && Number(vertex.y) <= 20.01, 'Y within clip bounds');
    }
  }
});

test('clipMeshGradient: empty result for non-overlapping', () => {
  const top = [
    MeshGradient.point(0, 0),
    MeshGradient.point(10, 0),
    MeshGradient.point(20, 0),
    MeshGradient.point(30, 0)
  ];
  const right = [
    MeshGradient.point(30, 0),
    MeshGradient.point(30, 10),
    MeshGradient.point(30, 20),
    MeshGradient.point(30, 30)
  ];
  const bottom = [
    MeshGradient.point(0, 30),
    MeshGradient.point(10, 30),
    MeshGradient.point(20, 30),
    MeshGradient.point(30, 30)
  ];
  const left = [
    MeshGradient.point(0, 0),
    MeshGradient.point(0, 10),
    MeshGradient.point(0, 20),
    MeshGradient.point(0, 30)
  ];

  const colors = [[MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)],
                  [MeshGradient.color(0,0,0,255), MeshGradient.color(0,0,0,255)]];

  const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
  const meshData = { patches: [patch] };

  // Clip to rectangle outside the mesh
  const clipPolygon = [
    PolygonClip.point(100, 100),
    PolygonClip.point(200, 100),
    PolygonClip.point(200, 200),
    PolygonClip.point(100, 200)
  ];

  const clipped = MeshGradient.clipMeshGradient(meshData, clipPolygon, { subdivisions: 4 });

  assert(clipped.length === 0, 'Non-overlapping clip should produce empty result');
});

test('clippedMeshToSVG: generates valid path data', () => {
  const clippedPolygons = [
    {
      polygon: [
        PolygonClip.point(10, 10),
        PolygonClip.point(20, 10),
        PolygonClip.point(20, 20),
        PolygonClip.point(10, 20)
      ],
      color: { r: 128, g: 64, b: 32, a: 255 }
    }
  ];

  const svgPaths = MeshGradient.clippedMeshToSVG(clippedPolygons);

  assert(svgPaths.length === 1, 'Should produce one path');
  assert(svgPaths[0].pathData.startsWith('M'), 'Path should start with M');
  assert(svgPaths[0].pathData.endsWith('Z'), 'Path should end with Z');
  assert(svgPaths[0].fill.startsWith('rgba'), 'Fill should be rgba');
});

// ============================================================================
// Sample SVG Parsing Test
// ============================================================================

test('parseMeshGradientElement structure check (mock)', () => {
  // Test the structure parsing with mock element
  const mockElement = {
    getAttribute: (name) => {
      const attrs = {
        x: '10',
        y: '20',
        type: 'bilinear',
        gradientUnits: 'userSpaceOnUse',
        gradientTransform: 'translate(5, 5)'
      };
      return attrs[name] || null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'meshrow') {
        return [{
          querySelectorAll: (sel) => {
            if (sel === 'meshpatch') {
              return [{
                querySelectorAll: (s) => {
                  if (s === 'stop') {
                    return [
                      {
                        getAttribute: (n) => n === 'path' ? 'c 10,0 20,0 30,0' :
                                           n === 'style' ? 'stop-color:#ff0000;stop-opacity:1' : null
                      }
                    ];
                  }
                  return [];
                }
              }];
            }
            return [];
          }
        }];
      }
      return [];
    }
  };

  const data = MeshGradient.parseMeshGradientElement(mockElement);

  assert(data.x === '10', 'X should be parsed');
  assert(data.y === '20', 'Y should be parsed');
  assert(data.type === 'bilinear', 'Type should be parsed');
  assert(data.gradientUnits === 'userSpaceOnUse', 'gradientUnits should be parsed');
  assert(data.meshrows.length === 1, 'Should have one meshrow');
  assert(data.meshrows[0].meshpatches.length === 1, 'Should have one meshpatch');
});

// ============================================================================
// Print Results
// ============================================================================

console.log('┌─────────────────────────────────────────────────────────┬──────────┐');
console.log('│ Test Name                                               │ Status   │');
console.log('├─────────────────────────────────────────────────────────┼──────────┤');

let passed = 0;
let failed = 0;

for (const r of results) {
  const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const name = r.name.length > 55 ? r.name.slice(0, 52) + '...' : r.name.padEnd(55);
  console.log(`│ ${name} │ ${status}     │`);
  if (r.passed) passed++;
  else {
    failed++;
    console.log(`│   Error: ${r.error.slice(0, 52)}${r.error.length > 52 ? '...' : ''}`.padEnd(62) + '│          │');
  }
}

console.log('└─────────────────────────────────────────────────────────┴──────────┘');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
