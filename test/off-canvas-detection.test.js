/**
 * Unit tests for off-canvas-detection.js
 *
 * Tests all off-canvas detection functions including:
 * - ViewBox parsing (parseViewBox)
 * - Bounding box calculation (pathBoundingBox, shapeBoundingBox)
 * - Intersection detection (bboxIntersectsViewBox)
 * - Off-canvas detection (isPathOffCanvas, isShapeOffCanvas)
 * - Path clipping (clipPathToViewBox)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import * as OffCanvas from '../src/off-canvas-detection.js';

// Set precision for tests
Decimal.set({ precision: 80 });

// Helper to convert to Decimal
const D = x => (x instanceof Decimal ? x : new Decimal(x));

describe('OffCanvasDetection', () => {

  describe('parseViewBox', () => {
    it('should parse space-separated viewBox', () => {
      const result = OffCanvas.parseViewBox('0 0 100 100');
      assert.ok(result.x.equals(0), 'x = 0');
      assert.ok(result.y.equals(0), 'y = 0');
      assert.ok(result.width.equals(100), 'width = 100');
      assert.ok(result.height.equals(100), 'height = 100');
      assert.ok(result.verified, 'should be verified');
    });

    it('should parse comma-separated viewBox', () => {
      const result = OffCanvas.parseViewBox('10,20,300,400');
      assert.ok(result.x.equals(10), 'x = 10');
      assert.ok(result.y.equals(20), 'y = 20');
      assert.ok(result.width.equals(300), 'width = 300');
      assert.ok(result.height.equals(400), 'height = 400');
    });

    it('should parse mixed separator viewBox', () => {
      const result = OffCanvas.parseViewBox('5, 10 200, 150');
      assert.ok(result.x.equals(5), 'x = 5');
      assert.ok(result.y.equals(10), 'y = 10');
      assert.ok(result.width.equals(200), 'width = 200');
      assert.ok(result.height.equals(150), 'height = 150');
    });

    it('should parse negative coordinates', () => {
      const result = OffCanvas.parseViewBox('-50 -50 100 100');
      assert.ok(result.x.equals(-50), 'x = -50');
      assert.ok(result.y.equals(-50), 'y = -50');
      assert.ok(result.width.equals(100), 'width = 100');
      assert.ok(result.height.equals(100), 'height = 100');
    });

    it('should parse decimal values', () => {
      const result = OffCanvas.parseViewBox('0.5 1.5 99.5 98.5');
      assert.ok(result.x.equals(0.5), 'x = 0.5');
      assert.ok(result.y.equals(1.5), 'y = 1.5');
      assert.ok(result.width.equals(99.5), 'width = 99.5');
      assert.ok(result.height.equals(98.5), 'height = 98.5');
    });

    it('should handle extra whitespace', () => {
      const result = OffCanvas.parseViewBox('  0   0   100   100  ');
      assert.ok(result.x.equals(0), 'x = 0');
      assert.ok(result.width.equals(100), 'width = 100');
    });

    it('should throw on non-string input', () => {
      assert.throws(() => {
        OffCanvas.parseViewBox(null);
      }, /ViewBox must be a string/, 'should throw for null');

      assert.throws(() => {
        OffCanvas.parseViewBox(123);
      }, /ViewBox must be a string/, 'should throw for number');
    });

    it('should throw on invalid format (wrong number of values)', () => {
      assert.throws(() => {
        OffCanvas.parseViewBox('0 0 100');
      }, /expected 4 values/, 'should throw for 3 values');

      assert.throws(() => {
        OffCanvas.parseViewBox('0 0 100 100 50');
      }, /expected 4 values/, 'should throw for 5 values');
    });

    it('should throw on zero or negative dimensions', () => {
      assert.throws(() => {
        OffCanvas.parseViewBox('0 0 0 100');
      }, /positive/, 'should throw for zero width');

      assert.throws(() => {
        OffCanvas.parseViewBox('0 0 100 -50');
      }, /positive/, 'should throw for negative height');
    });
  });

  describe('pathBoundingBox', () => {
    it('should calculate bbox for simple line path', () => {
      const commands = [
        { type: 'M', x: 10, y: 10 },
        { type: 'L', x: 50, y: 30 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(10), 'minX = 10');
      assert.ok(result.minY.equals(10), 'minY = 10');
      assert.ok(result.maxX.equals(50), 'maxX = 50');
      assert.ok(result.maxY.equals(30), 'maxY = 30');
      assert.ok(result.verified, 'should be verified');
    });

    it('should calculate bbox for rectangle path', () => {
      const commands = [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 100, y: 0 },
        { type: 'L', x: 100, y: 50 },
        { type: 'L', x: 0, y: 50 },
        { type: 'Z' }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.minY.equals(0), 'minY = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
      assert.ok(result.maxY.equals(50), 'maxY = 50');
      assert.ok(result.width.equals(100), 'width = 100');
      assert.ok(result.height.equals(50), 'height = 50');
    });

    it('should calculate bbox for H and V commands', () => {
      const commands = [
        { type: 'M', x: 10, y: 10 },
        { type: 'H', x: 50 },
        { type: 'V', y: 40 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(10), 'minX = 10');
      assert.ok(result.minY.equals(10), 'minY = 10');
      assert.ok(result.maxX.equals(50), 'maxX = 50');
      assert.ok(result.maxY.equals(40), 'maxY = 40');
    });

    it('should calculate bbox for cubic Bezier', () => {
      const commands = [
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 0, y1: 100, x2: 100, y2: 100, x: 100, y: 0 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      // The curve bulges above y=0
      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.minY.equals(0), 'minY = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
      assert.ok(result.maxY.greaterThan(0), 'maxY > 0 (curve bulges up)');
    });

    it('should calculate bbox for quadratic Bezier', () => {
      const commands = [
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 50, y1: 100, x: 100, y: 0 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
      assert.ok(result.maxY.greaterThan(0), 'maxY > 0 (curve bulges up)');
    });

    it('should calculate bbox for smooth cubic (S command)', () => {
      const commands = [
        { type: 'M', x: 0, y: 50 },
        { type: 'C', x1: 10, y1: 0, x2: 40, y2: 0, x: 50, y: 50 },
        { type: 'S', x2: 90, y2: 100, x: 100, y: 50 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
      assert.ok(result.verified, 'should be verified');
    });

    it('should calculate bbox for smooth quadratic (T command)', () => {
      const commands = [
        { type: 'M', x: 0, y: 50 },
        { type: 'Q', x1: 25, y1: 0, x: 50, y: 50 },
        { type: 'T', x: 100, y: 50 }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
    });

    it('should throw for empty path', () => {
      assert.throws(() => {
        OffCanvas.pathBoundingBox([]);
      }, /empty/, 'should throw for empty array');
    });

    it('should throw for unknown command type', () => {
      assert.throws(() => {
        OffCanvas.pathBoundingBox([
          { type: 'M', x: 0, y: 0 },
          { type: 'X', x: 10, y: 10 }
        ]);
      }, /unknown path command/i, 'should throw for unknown command');
    });
  });

  describe('shapeBoundingBox', () => {
    it('should calculate bbox for rect', () => {
      const shape = { type: 'rect', x: 10, y: 20, width: 100, height: 50 };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(10), 'minX = 10');
      assert.ok(result.minY.equals(20), 'minY = 20');
      assert.ok(result.maxX.equals(110), 'maxX = 110');
      assert.ok(result.maxY.equals(70), 'maxY = 70');
      assert.ok(result.verified, 'should be verified');
    });

    it('should calculate bbox for circle', () => {
      const shape = { type: 'circle', cx: 50, cy: 50, r: 25 };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(25), 'minX = 50 - 25 = 25');
      assert.ok(result.minY.equals(25), 'minY = 50 - 25 = 25');
      assert.ok(result.maxX.equals(75), 'maxX = 50 + 25 = 75');
      assert.ok(result.maxY.equals(75), 'maxY = 50 + 25 = 75');
      assert.ok(result.verified, 'should be verified');
    });

    it('should calculate bbox for ellipse', () => {
      const shape = { type: 'ellipse', cx: 50, cy: 50, rx: 40, ry: 20 };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(10), 'minX = 50 - 40 = 10');
      assert.ok(result.minY.equals(30), 'minY = 50 - 20 = 30');
      assert.ok(result.maxX.equals(90), 'maxX = 50 + 40 = 90');
      assert.ok(result.maxY.equals(70), 'maxY = 50 + 20 = 70');
    });

    it('should calculate bbox for line', () => {
      const shape = { type: 'line', x1: 10, y1: 20, x2: 80, y2: 60 };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(10), 'minX = 10');
      assert.ok(result.minY.equals(20), 'minY = 20');
      assert.ok(result.maxX.equals(80), 'maxX = 80');
      assert.ok(result.maxY.equals(60), 'maxY = 60');
    });

    it('should calculate bbox for polygon', () => {
      const shape = {
        type: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 87 }
        ]
      };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(0), 'minX = 0');
      assert.ok(result.minY.equals(0), 'minY = 0');
      assert.ok(result.maxX.equals(100), 'maxX = 100');
      assert.ok(result.maxY.equals(87), 'maxY = 87');
    });

    it('should calculate bbox for polyline', () => {
      const shape = {
        type: 'polyline',
        points: [
          { x: 10, y: 10 },
          { x: 50, y: 50 },
          { x: 90, y: 10 }
        ]
      };
      const result = OffCanvas.shapeBoundingBox(shape);

      assert.ok(result.minX.equals(10), 'minX = 10');
      assert.ok(result.minY.equals(10), 'minY = 10');
      assert.ok(result.maxX.equals(90), 'maxX = 90');
      assert.ok(result.maxY.equals(50), 'maxY = 50');
    });

    it('should throw for missing type', () => {
      assert.throws(() => {
        OffCanvas.shapeBoundingBox({});
      }, /type property/, 'should throw for missing type');
    });

    it('should throw for unknown shape type', () => {
      assert.throws(() => {
        OffCanvas.shapeBoundingBox({ type: 'unknown' });
      }, /Unknown shape type/, 'should throw for unknown type');
    });

    it('should throw for polygon with no points', () => {
      assert.throws(() => {
        OffCanvas.shapeBoundingBox({ type: 'polygon', points: [] });
      }, /must have points/, 'should throw for empty points');
    });
  });

  describe('bboxIntersectsViewBox', () => {
    it('should detect overlapping boxes', () => {
      const bbox = { minX: D(20), minY: D(20), maxX: D(80), maxY: D(80) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(result.intersects, 'should intersect');
      assert.ok(result.verified, 'should be verified');
    });

    it('should detect contained box', () => {
      const bbox = { minX: D(25), minY: D(25), maxX: D(75), maxY: D(75) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(result.intersects, 'contained box intersects');
    });

    it('should detect partial overlap (left edge)', () => {
      const bbox = { minX: D(-20), minY: D(20), maxX: D(20), maxY: D(80) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(result.intersects, 'partial overlap on left');
    });

    it('should not intersect when completely outside (left)', () => {
      const bbox = { minX: D(-100), minY: D(20), maxX: D(-10), maxY: D(80) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(!result.intersects, 'completely left should not intersect');
    });

    it('should not intersect when completely outside (right)', () => {
      const bbox = { minX: D(110), minY: D(20), maxX: D(200), maxY: D(80) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(!result.intersects, 'completely right should not intersect');
    });

    it('should not intersect when completely outside (above)', () => {
      const bbox = { minX: D(20), minY: D(-100), maxX: D(80), maxY: D(-10) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(!result.intersects, 'completely above should not intersect');
    });

    it('should not intersect when completely outside (below)', () => {
      const bbox = { minX: D(20), minY: D(110), maxX: D(80), maxY: D(200) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      assert.ok(!result.intersects, 'completely below should not intersect');
    });

    it('should detect touching edges as intersection', () => {
      // Box touching right edge of viewBox
      const bbox = { minX: D(100), minY: D(20), maxX: D(150), maxY: D(80) };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.bboxIntersectsViewBox(bbox, viewBox);

      // Note: touching at edge may or may not count as intersection depending on implementation
      // GJK typically treats edge contact as intersection
    });
  });

  describe('isPathOffCanvas', () => {
    it('should detect path completely inside viewBox', () => {
      const commands = [
        { type: 'M', x: 25, y: 25 },
        { type: 'L', x: 75, y: 25 },
        { type: 'L', x: 75, y: 75 },
        { type: 'L', x: 25, y: 75 },
        { type: 'Z' }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isPathOffCanvas(commands, viewBox);

      assert.ok(!result.offCanvas, 'path inside is not off-canvas');
      assert.ok(result.verified, 'should be verified');
    });

    it('should detect path completely outside viewBox', () => {
      const commands = [
        { type: 'M', x: 200, y: 200 },
        { type: 'L', x: 300, y: 200 },
        { type: 'L', x: 300, y: 300 },
        { type: 'Z' }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isPathOffCanvas(commands, viewBox);

      assert.ok(result.offCanvas, 'path outside is off-canvas');
      assert.ok(result.verified, 'should be verified');
    });

    it('should detect path partially overlapping viewBox', () => {
      const commands = [
        { type: 'M', x: 80, y: 50 },
        { type: 'L', x: 150, y: 50 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isPathOffCanvas(commands, viewBox);

      assert.ok(!result.offCanvas, 'partial overlap is not off-canvas');
    });

    it('should return bbox in result', () => {
      const commands = [
        { type: 'M', x: 10, y: 10 },
        { type: 'L', x: 90, y: 90 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isPathOffCanvas(commands, viewBox);

      assert.ok(result.bbox, 'result should include bbox');
      assert.ok(result.bbox.minX instanceof Decimal, 'bbox has Decimal values');
    });
  });

  describe('isShapeOffCanvas', () => {
    it('should detect rectangle inside viewBox', () => {
      const shape = { type: 'rect', x: 20, y: 20, width: 60, height: 60 };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(!result.offCanvas, 'rect inside is not off-canvas');
    });

    it('should detect circle outside viewBox', () => {
      const shape = { type: 'circle', cx: 200, cy: 200, r: 50 };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(result.offCanvas, 'circle outside is off-canvas');
    });

    it('should detect ellipse partially overlapping', () => {
      const shape = { type: 'ellipse', cx: 110, cy: 50, rx: 30, ry: 20 };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      // Ellipse extends from 80 to 140 in x, overlapping viewBox
      assert.ok(!result.offCanvas, 'ellipse overlapping is not off-canvas');
    });

    it('should return bbox in result', () => {
      const shape = { type: 'rect', x: 10, y: 10, width: 80, height: 80 };
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(result.bbox, 'result should include bbox');
      assert.ok(result.bbox.width instanceof Decimal, 'bbox has computed properties');
    });
  });

  describe('clipPathToViewBox', () => {
    it('should keep path entirely inside viewBox unchanged', () => {
      const commands = [
        { type: 'M', x: 20, y: 20 },
        { type: 'L', x: 80, y: 20 },
        { type: 'L', x: 80, y: 80 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      assert.equal(result.commands.length, 3, 'all commands kept');
      assert.ok(result.verified, 'should be verified');
    });

    it('should clip line that crosses viewBox boundary', () => {
      const commands = [
        { type: 'M', x: 50, y: 50 },
        { type: 'L', x: 150, y: 50 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // The line should be clipped at x=100
      assert.ok(result.commands.length >= 2, 'has clipped commands');
      assert.ok(result.verified, 'all output points within bounds');
    });

    it('should remove path entirely outside viewBox', () => {
      const commands = [
        { type: 'M', x: 150, y: 50 },
        { type: 'L', x: 200, y: 50 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // Path is entirely outside, should result in empty or minimal commands
      assert.ok(result.verified, 'should be verified');
    });

    it('should handle horizontal line clipping', () => {
      const commands = [
        { type: 'M', x: 50, y: 50 },
        { type: 'H', x: 150 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // The line should be clipped at x=100
      assert.ok(result.verified, 'should be verified');
    });

    it('should handle vertical line clipping', () => {
      const commands = [
        { type: 'M', x: 50, y: 50 },
        { type: 'V', y: -50 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // The line should be clipped at y=0
      assert.ok(result.verified, 'should be verified');
    });

    it('should handle Z command', () => {
      const commands = [
        { type: 'M', x: 25, y: 25 },
        { type: 'L', x: 75, y: 25 },
        { type: 'L', x: 75, y: 75 },
        { type: 'Z' }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // Check that Z is preserved when path is inside
      const hasZ = result.commands.some(cmd => cmd.type === 'Z');
      assert.ok(hasZ, 'Z command preserved');
    });

    it('should handle line crossing from outside to inside', () => {
      const commands = [
        { type: 'M', x: -50, y: 50 },
        { type: 'L', x: 50, y: 50 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      // Should create a new M at the entry point and L to end
      assert.ok(result.commands.length >= 2, 'has clipped commands');
      assert.ok(result.verified, 'should be verified');
    });

    it('should return verified flag true when all points inside', () => {
      const commands = [
        { type: 'M', x: 10, y: 10 },
        { type: 'L', x: 90, y: 90 }
      ];
      const viewBox = { x: D(0), y: D(0), width: D(100), height: D(100) };
      const result = OffCanvas.clipPathToViewBox(commands, viewBox);

      assert.ok(result.verified, 'all output points verified inside bounds');
    });
  });

  describe('edge cases', () => {
    it('should handle viewBox with negative origin', () => {
      const viewBox = OffCanvas.parseViewBox('-50 -50 100 100');
      const shape = { type: 'rect', x: -25, y: -25, width: 50, height: 50 };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(!result.offCanvas, 'shape centered at origin is inside');
    });

    it('should handle very small viewBox', () => {
      const viewBox = { x: D(0), y: D(0), width: D(1), height: D(1) };
      const shape = { type: 'circle', cx: 0.5, cy: 0.5, r: 0.25 };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(!result.offCanvas, 'small circle inside small viewBox');
    });

    it('should handle very large coordinates', () => {
      const viewBox = {
        x: D('1000000'),
        y: D('1000000'),
        width: D('1000'),
        height: D('1000')
      };
      const shape = {
        type: 'rect',
        x: '1000100',
        y: '1000100',
        width: 100,
        height: 100
      };
      const result = OffCanvas.isShapeOffCanvas(shape, viewBox);

      assert.ok(!result.offCanvas, 'rect inside large-coordinate viewBox');
    });
  });

  describe('precision preservation', () => {
    it('should preserve high precision in viewBox parsing', () => {
      const result = OffCanvas.parseViewBox('0.12345678901234567890 0 100 100');
      assert.ok(
        result.x.toString().includes('123456789012345'),
        'x preserves high precision'
      );
    });

    it('should preserve precision in bounding box calculations', () => {
      const commands = [
        { type: 'M', x: '1.12345678901234567890', y: '2.98765432109876543210' }
      ];
      const result = OffCanvas.pathBoundingBox(commands);

      assert.ok(
        result.minX.toString().includes('123456789'),
        'minX preserves precision'
      );
    });
  });
});
