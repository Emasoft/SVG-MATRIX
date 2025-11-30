/**
 * Unit tests for Mask Resolver Module
 * Tests mask parsing, luminance/alpha calculations, and clipping operations
 */

import Decimal from 'decimal.js';
import * as MaskResolver from '../src/mask-resolver.js';
import * as PolygonClip from '../src/polygon-clip.js';

Decimal.set({ precision: 80 });

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}

function assertEqual(actual, expected, msg = '') {
  const a = actual instanceof Decimal ? Number(actual) : actual;
  const e = expected instanceof Decimal ? Number(expected) : expected;
  if (typeof a === 'number' && typeof e === 'number') {
    if (Math.abs(a - e) > 1e-10) {
      throw new Error(`${msg} Expected ${e}, got ${a}`);
    }
  } else if (a !== e) {
    throw new Error(`${msg} Expected ${e}, got ${a}`);
  }
}

function assertClose(actual, expected, tolerance = 0.01, msg = '') {
  const a = actual instanceof Decimal ? Number(actual) : actual;
  const e = expected instanceof Decimal ? Number(expected) : expected;
  if (Math.abs(a - e) > tolerance) {
    throw new Error(`${msg} Expected ~${e}, got ${a} (tolerance: ${tolerance})`);
  }
}

function assertTrue(val, msg = '') {
  if (!val) throw new Error(msg || 'Expected true');
}

function assertFalse(val, msg = '') {
  if (val) throw new Error(msg || 'Expected false');
}

// ============================================================================
// MaskType Constants Tests
// ============================================================================

test('MaskType LUMINANCE constant is correct', () => {
  assertEqual(MaskResolver.MaskType.LUMINANCE, 'luminance');
});

test('MaskType ALPHA constant is correct', () => {
  assertEqual(MaskResolver.MaskType.ALPHA, 'alpha');
});

// ============================================================================
// Color to Luminance Tests
// ============================================================================

test('colorToLuminance: white returns 1', () => {
  const lum = MaskResolver.colorToLuminance('white');
  assertEqual(lum, 1);
});

test('colorToLuminance: black returns 0', () => {
  const lum = MaskResolver.colorToLuminance('black');
  assertEqual(lum, 0);
});

test('colorToLuminance: #FFFFFF returns 1', () => {
  const lum = MaskResolver.colorToLuminance('#FFFFFF');
  assertClose(lum, 1, 0.001);
});

test('colorToLuminance: #000000 returns 0', () => {
  const lum = MaskResolver.colorToLuminance('#000000');
  assertClose(lum, 0, 0.001);
});

test('colorToLuminance: #FF0000 (red) returns correct luminance', () => {
  // Red luminance = 0.2126
  const lum = MaskResolver.colorToLuminance('#FF0000');
  assertClose(lum, 0.2126, 0.001);
});

test('colorToLuminance: #00FF00 (green) returns correct luminance', () => {
  // Green luminance = 0.7152
  const lum = MaskResolver.colorToLuminance('#00FF00');
  assertClose(lum, 0.7152, 0.001);
});

test('colorToLuminance: #0000FF (blue) returns correct luminance', () => {
  // Blue luminance = 0.0722
  const lum = MaskResolver.colorToLuminance('#0000FF');
  assertClose(lum, 0.0722, 0.001);
});

test('colorToLuminance: rgb(128,128,128) gray returns ~0.5', () => {
  const lum = MaskResolver.colorToLuminance('rgb(128, 128, 128)');
  assertClose(lum, 0.502, 0.01);
});

test('colorToLuminance: short hex #FFF returns 1', () => {
  const lum = MaskResolver.colorToLuminance('#FFF');
  assertClose(lum, 1, 0.001);
});

test('colorToLuminance: short hex #000 returns 0', () => {
  const lum = MaskResolver.colorToLuminance('#000');
  assertClose(lum, 0, 0.001);
});

test('colorToLuminance: none returns 0', () => {
  const lum = MaskResolver.colorToLuminance('none');
  assertEqual(lum, 0);
});

test('colorToLuminance: transparent returns 0', () => {
  const lum = MaskResolver.colorToLuminance('transparent');
  assertEqual(lum, 0);
});

test('colorToLuminance: null returns 0', () => {
  const lum = MaskResolver.colorToLuminance(null);
  assertEqual(lum, 0);
});

test('colorToLuminance: gray named color returns 0.5', () => {
  const lum = MaskResolver.colorToLuminance('gray');
  assertEqual(lum, 0.5);
});

// ============================================================================
// getMaskChildOpacity Tests
// ============================================================================

test('getMaskChildOpacity: alpha mask with full opacity', () => {
  const child = { fill: 'white', fillOpacity: 1, opacity: 1 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.ALPHA);
  assertEqual(result, 1);
});

test('getMaskChildOpacity: alpha mask with 50% fill opacity', () => {
  const child = { fill: 'white', fillOpacity: 0.5, opacity: 1 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.ALPHA);
  assertEqual(result, 0.5);
});

test('getMaskChildOpacity: alpha mask with combined opacity', () => {
  const child = { fill: 'white', fillOpacity: 0.5, opacity: 0.5 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.ALPHA);
  assertEqual(result, 0.25);
});

test('getMaskChildOpacity: luminance mask with white fill', () => {
  const child = { fill: 'white', fillOpacity: 1, opacity: 1 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.LUMINANCE);
  assertEqual(result, 1);
});

test('getMaskChildOpacity: luminance mask with black fill', () => {
  const child = { fill: 'black', fillOpacity: 1, opacity: 1 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.LUMINANCE);
  assertEqual(result, 0);
});

test('getMaskChildOpacity: luminance mask with red fill', () => {
  const child = { fill: '#FF0000', fillOpacity: 1, opacity: 1 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.LUMINANCE);
  assertClose(result, 0.2126, 0.001);
});

test('getMaskChildOpacity: luminance mask with opacity and color', () => {
  const child = { fill: 'white', fillOpacity: 0.5, opacity: 0.8 };
  const result = MaskResolver.getMaskChildOpacity(child, MaskResolver.MaskType.LUMINANCE);
  // 0.5 * 0.8 * 1 (white luminance) = 0.4
  assertEqual(result, 0.4);
});

// ============================================================================
// getMaskRegion Tests
// ============================================================================

test('getMaskRegion: objectBoundingBox uses default -10% to 120%', () => {
  const maskData = {
    maskUnits: 'objectBoundingBox',
    x: -0.1,
    y: -0.1,
    width: 1.2,
    height: 1.2
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 100 };

  const region = MaskResolver.getMaskRegion(maskData, targetBBox);

  // x = 100 + (-0.1 * 200) = 80
  assertClose(Number(region.x), 80, 0.001);
  // y = 100 + (-0.1 * 100) = 90
  assertClose(Number(region.y), 90, 0.001);
  // width = 1.2 * 200 = 240
  assertClose(Number(region.width), 240, 0.001);
  // height = 1.2 * 100 = 120
  assertClose(Number(region.height), 120, 0.001);
});

test('getMaskRegion: userSpaceOnUse uses explicit values', () => {
  const maskData = {
    maskUnits: 'userSpaceOnUse',
    x: 50,
    y: 50,
    width: 300,
    height: 200
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 100 };

  const region = MaskResolver.getMaskRegion(maskData, targetBBox);

  assertClose(Number(region.x), 50, 0.001);
  assertClose(Number(region.y), 50, 0.001);
  assertClose(Number(region.width), 300, 0.001);
  assertClose(Number(region.height), 200, 0.001);
});

test('getMaskRegion: userSpaceOnUse with null values uses defaults', () => {
  const maskData = {
    maskUnits: 'userSpaceOnUse',
    x: null,
    y: null,
    width: null,
    height: null
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 100 };

  const region = MaskResolver.getMaskRegion(maskData, targetBBox);

  // Defaults: x - 10%, y - 10%, width * 1.2, height * 1.2
  assertClose(Number(region.x), 80, 0.001);
  assertClose(Number(region.y), 90, 0.001);
  assertClose(Number(region.width), 240, 0.001);
  assertClose(Number(region.height), 120, 0.001);
});

// ============================================================================
// maskChildToPolygon Tests
// ============================================================================

test('maskChildToPolygon: rect child to polygon', () => {
  const child = {
    type: 'rect',
    x: 10,
    y: 20,
    width: 100,
    height: 50
  };
  const targetBBox = { x: 0, y: 0, width: 200, height: 200 };

  const polygon = MaskResolver.maskChildToPolygon(child, targetBBox, 'userSpaceOnUse');

  assertTrue(polygon.length >= 4, 'Rect should produce at least 4 vertices');
});

test('maskChildToPolygon: circle child to polygon', () => {
  const child = {
    type: 'circle',
    cx: 50,
    cy: 50,
    r: 25
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const polygon = MaskResolver.maskChildToPolygon(child, targetBBox, 'userSpaceOnUse', 16);

  assertTrue(polygon.length >= 16, 'Circle should produce at least 16 vertices');
});

test('maskChildToPolygon: objectBoundingBox scales coordinates', () => {
  const child = {
    type: 'rect',
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8
  };
  const targetBBox = { x: 100, y: 100, width: 200, height: 100 };

  const polygon = MaskResolver.maskChildToPolygon(child, targetBBox, 'objectBoundingBox');

  // Vertices should be scaled to target bbox
  assertTrue(polygon.length >= 4, 'Should produce polygon');
});

// ============================================================================
// resolveMask Tests
// ============================================================================

test('resolveMask: single rect child produces polygon with opacity', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: 'white',
        fillOpacity: 0.5,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 1, 'Should produce one region');
  assertEqual(result[0].opacity, 0.5, 'Opacity should be 0.5');
  assertTrue(result[0].polygon.length >= 3, 'Polygon should have vertices');
});

test('resolveMask: multiple children produce multiple regions', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      },
      {
        type: 'circle',
        cx: 75,
        cy: 75,
        r: 20,
        fill: 'white',
        fillOpacity: 0.5,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 2, 'Should produce two regions');
});

test('resolveMask: luminance mask uses color luminance', () => {
  const maskData = {
    maskType: 'luminance',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: '#FF0000', // Red = 0.2126 luminance
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 1);
  assertClose(result[0].opacity, 0.2126, 0.001);
});

// ============================================================================
// applyMask Tests
// ============================================================================

test('applyMask: clips target polygon with mask region', () => {
  const targetPolygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];

  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 25,
        y: 25,
        width: 50,
        height: 50,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.applyMask(targetPolygon, maskData, targetBBox);

  assertTrue(result.length >= 1, 'Should produce clipped result');
  assertTrue(result[0].polygon.length >= 3, 'Clipped polygon should have vertices');
  assertEqual(result[0].opacity, 1);
});

test('applyMask: zero opacity regions are skipped', () => {
  const targetPolygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];

  const maskData = {
    maskType: 'luminance',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 25,
        y: 25,
        width: 50,
        height: 50,
        fill: 'black', // Zero luminance
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.applyMask(targetPolygon, maskData, targetBBox);

  assertEqual(result.length, 0, 'Black mask should produce no result');
});

// ============================================================================
// maskToClipPath Tests
// ============================================================================

test('maskToClipPath: converts mask to simple polygon', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.maskToClipPath(maskData, targetBBox);

  assertTrue(result.length >= 4, 'Should produce polygon');
});

test('maskToClipPath: respects opacity threshold', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        fill: 'white',
        fillOpacity: 0.3, // Below default 0.5 threshold
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.maskToClipPath(maskData, targetBBox, 0.5);

  assertEqual(result.length, 0, 'Below threshold should produce empty result');
});

test('maskToClipPath: lower threshold includes low opacity regions', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        fill: 'white',
        fillOpacity: 0.3,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.maskToClipPath(maskData, targetBBox, 0.2);

  assertTrue(result.length >= 4, 'Lower threshold should include region');
});

// ============================================================================
// maskToPathData Tests
// ============================================================================

test('maskToPathData: generates valid SVG path', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const pathData = MaskResolver.maskToPathData(maskData, targetBBox);

  assertTrue(pathData.startsWith('M'), 'Should start with M command');
  assertTrue(pathData.includes('L'), 'Should contain L commands');
  assertTrue(pathData.endsWith('Z'), 'Should end with Z command');
});

test('maskToPathData: empty mask returns empty string', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: []
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const pathData = MaskResolver.maskToPathData(maskData, targetBBox);

  assertEqual(pathData, '');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Edge case: empty children array', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: []
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 0);
});

test('Edge case: very small mask region', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 50,
        y: 50,
        width: 0.001,
        height: 0.001,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  // Should not throw
  const result = MaskResolver.resolveMask(maskData, targetBBox);
  assertTrue(Array.isArray(result));
});

test('Edge case: mask with ellipse child', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'ellipse',
        cx: 50,
        cy: 50,
        rx: 40,
        ry: 20,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 1);
  assertTrue(result[0].polygon.length >= 8, 'Ellipse should produce multiple vertices');
});

test('Edge case: mask with polygon child', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'polygon',
        points: '25,5 45,45 5,45',
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMask(maskData, targetBBox);

  assertEqual(result.length, 1);
  assertTrue(result[0].polygon.length >= 3, 'Polygon should have vertices');
});

test('Edge case: rgb color with spaces', () => {
  const lum = MaskResolver.colorToLuminance('rgb( 255 , 255 , 255 )');
  assertClose(lum, 1, 0.001);
});

test('Edge case: unknown color defaults to white', () => {
  const lum = MaskResolver.colorToLuminance('unknowncolor');
  assertEqual(lum, 1);
});

// ============================================================================
// Mesh Gradient Mask Support Tests
// ============================================================================

test('parseGradientReference: extracts gradient ID from url()', () => {
  const id = MaskResolver.parseGradientReference('url(#myGradient)');
  assertEqual(id, 'myGradient');
});

test('parseGradientReference: handles spaces in url()', () => {
  const id = MaskResolver.parseGradientReference('url( #gradient123 )');
  assertEqual(id, 'gradient123');
});

test('parseGradientReference: returns null for solid colors', () => {
  const id = MaskResolver.parseGradientReference('red');
  assertEqual(id, null);
});

test('parseGradientReference: returns null for null input', () => {
  const id = MaskResolver.parseGradientReference(null);
  assertEqual(id, null);
});

test('rgbToLuminance: white returns 1', () => {
  const lum = MaskResolver.rgbToLuminance({ r: 255, g: 255, b: 255 });
  assertClose(lum, 1, 0.001);
});

test('rgbToLuminance: black returns 0', () => {
  const lum = MaskResolver.rgbToLuminance({ r: 0, g: 0, b: 0 });
  assertEqual(lum, 0);
});

test('rgbToLuminance: red returns 0.2126', () => {
  const lum = MaskResolver.rgbToLuminance({ r: 255, g: 0, b: 0 });
  assertClose(lum, 0.2126, 0.001);
});

test('rgbToLuminance: green returns 0.7152', () => {
  const lum = MaskResolver.rgbToLuminance({ r: 0, g: 255, b: 0 });
  assertClose(lum, 0.7152, 0.001);
});

test('rgbToLuminance: blue returns 0.0722', () => {
  const lum = MaskResolver.rgbToLuminance({ r: 0, g: 0, b: 255 });
  assertClose(lum, 0.0722, 0.001);
});

test('rgbToLuminance: null returns 0', () => {
  const lum = MaskResolver.rgbToLuminance(null);
  assertEqual(lum, 0);
});

test('createMeshGradientMask: creates mask structure', () => {
  // Simple mock mesh data with a patch
  const meshData = {
    patches: []
  };
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  const mask = MaskResolver.createMeshGradientMask(meshData, bounds, 'luminance');

  assertEqual(mask.type, 'meshGradientMask');
  assertEqual(mask.maskType, 'luminance');
  assertTrue(Array.isArray(mask.regions));
});

test('resolveMaskWithGradients: falls back to solid fill for non-gradient', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: 'white',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  const result = MaskResolver.resolveMaskWithGradients(maskData, targetBBox, {});

  assertEqual(result.length, 1);
  assertEqual(result[0].opacity, 1);
});

test('resolveMaskWithGradients: handles gradient reference with no defs', () => {
  const maskData = {
    maskType: 'alpha',
    maskContentUnits: 'userSpaceOnUse',
    children: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: 'url(#nonexistent)',
        fillOpacity: 1,
        opacity: 1
      }
    ]
  };
  const targetBBox = { x: 0, y: 0, width: 100, height: 100 };

  // Should fall back to solid fill behavior
  const result = MaskResolver.resolveMaskWithGradients(maskData, targetBBox, {});

  // Since gradient not found, uses solid fallback
  assertEqual(result.length, 1);
});

// ============================================================================
// Shape-based Mesh Gradient Clipping Tests
// ============================================================================

test('getMeshGradientBoundary: empty patches returns empty', () => {
  const meshData = { patches: [] };
  const result = MaskResolver.getMeshGradientBoundary(meshData);
  assertEqual(result.length, 0);
});

test('getMeshGradientBoundary: null patches returns empty', () => {
  const meshData = {};
  const result = MaskResolver.getMeshGradientBoundary(meshData);
  assertEqual(result.length, 0);
});

test('meshGradientToClipPath: empty mesh returns empty', () => {
  const meshData = { patches: [] };
  const result = MaskResolver.meshGradientToClipPath(meshData);
  assertEqual(result.length, 0);
});

test('clipWithMeshGradientShape: empty mesh returns empty', () => {
  const targetPolygon = [
    PolygonClip.point(0, 0),
    PolygonClip.point(100, 0),
    PolygonClip.point(100, 100),
    PolygonClip.point(0, 100)
  ];
  const meshData = { patches: [] };

  const result = MaskResolver.clipWithMeshGradientShape(targetPolygon, meshData);
  assertEqual(result.length, 0);
});

// ============================================================================
// Print Results
// ============================================================================

console.log('\n======================================================================');
console.log('MASK RESOLVER UNIT TESTS');
console.log('======================================================================\n');

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
    const errMsg = r.error.length > 52 ? r.error.slice(0, 49) + '...' : r.error;
    console.log(`│   Error: ${errMsg.padEnd(47)} │          │`);
  }
}

console.log('└─────────────────────────────────────────────────────────┴──────────┘');
console.log(`\nTotal: ${results.length} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m\n`);

if (failed > 0) process.exit(1);
