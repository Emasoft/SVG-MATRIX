# ClipPath Verification Strategy

## Overview

This document outlines comprehensive verification strategies for the clipPath implementation. The goal is to ensure mathematical correctness, browser compatibility, precision guarantees, and edge case handling.

---

## 1. Unit Tests (Function-Level Verification)

### 1.1 pathToPolygon()

| Test Case | Input | Expected Output | Verification |
|-----------|-------|-----------------|--------------|
| Simple rect path | `M 0 0 L 10 0 L 10 10 L 0 10 Z` | 4 vertices at corners | Assert vertex count and positions |
| Cubic bezier | `M 0 0 C 10 0 10 10 0 10` | ~20 sampled points | Assert curve passes through control region |
| Arc command | `M 0 0 A 10 10 0 0 1 20 0` | Semicircle points | Assert all points on circle |
| Relative commands | `M 0 0 l 10 0 l 0 10 l -10 0 z` | 4 vertices | Assert same as absolute equivalent |
| Mixed commands | Complex path with all types | Valid polygon | Assert no NaN, correct vertex count |

### 1.2 shapeToPolygon()

| Shape Type | Test Case | Verification |
|------------|-----------|--------------|
| circle | r=10, cx=50, cy=50 | All points equidistant from center |
| ellipse | rx=20, ry=10 | Points satisfy ellipse equation |
| rect | x=0, y=0, w=100, h=50 | 4 vertices at corners |
| rect + rx/ry | Rounded corners | Arc sampling at corners |
| polygon | points="0,0 10,0 5,10" | 3 vertices matching points |
| path | Complex path | Matches pathToPolygon() |

### 1.3 resolveClipPath()

| Test Case | clipPathUnits | Expected Behavior |
|-----------|---------------|-------------------|
| Single rect clip | userSpaceOnUse | Clip in absolute coords |
| Single rect clip | objectBoundingBox | Clip scaled to element bbox |
| Multiple shapes | userSpaceOnUse | Union of all shapes |
| With transform | N/A | Transform applied to all children |
| Empty clipPath | N/A | Returns empty polygon |

### 1.4 applyClipPath()

| Subject | Clip | Expected Result |
|---------|------|-----------------|
| Large rect | Small rect | Small rect area |
| Circle | Square | Quarter-circle cuts at intersections |
| Non-overlapping | Any | Empty result |
| Subject inside clip | Any | Subject unchanged |
| Clip inside subject | Any | Clip area only |

---

## 2. Mathematical Verification

### 2.1 Area Conservation

```
For any clipping operation:
  Area(result) <= min(Area(subject), Area(clip))
  Area(result) >= 0
```

**Test Implementation:**
```javascript
function verifyAreaConservation(subject, clip, result) {
  const subjectArea = PolygonClip.polygonArea(subject).abs();
  const clipArea = PolygonClip.polygonArea(clip).abs();
  const resultArea = PolygonClip.polygonArea(result).abs();

  assert(resultArea.lte(subjectArea), 'Result area <= subject area');
  assert(resultArea.lte(clipArea), 'Result area <= clip area');
  assert(resultArea.gte(0), 'Result area >= 0');
}
```

### 2.2 Point Containment

```
For any point P in result:
  P must be inside subject AND inside clip
```

**Test Implementation:**
```javascript
function verifyPointContainment(result, subject, clip) {
  for (const p of result) {
    const inSubject = PolygonClip.pointInPolygon(p, subject);
    const inClip = PolygonClip.pointInPolygon(p, clip);

    assert(inSubject >= 0, 'Result point inside/on subject');
    assert(inClip >= 0, 'Result point inside/on clip');
  }
}
```

### 2.3 Boundary Verification

```
For any edge E in result:
  E must lie on subject boundary OR clip boundary OR be new (intersection)
```

**Test Implementation:**
```javascript
function verifyBoundaryPoints(result, subject, clip) {
  for (let i = 0; i < result.length; i++) {
    const p = result[i];
    const onSubjectBoundary = isOnBoundary(p, subject);
    const onClipBoundary = isOnBoundary(p, clip);

    assert(onSubjectBoundary || onClipBoundary,
      'Result vertex on subject or clip boundary');
  }
}
```

### 2.4 Convexity Preservation

```
If both subject and clip are convex:
  result must be convex
```

---

## 3. Browser Verification (Visual Correctness)

### 3.1 Strategy

Use Playwright to:
1. Render SVG with clipPath in browser
2. Get actual pixel data
3. Compare with our computed geometry

### 3.2 Test SVG Templates

```xml
<!-- Test 1: Simple rect clip -->
<svg width="100" height="100">
  <defs>
    <clipPath id="clip1">
      <rect x="25" y="25" width="50" height="50"/>
    </clipPath>
  </defs>
  <circle cx="50" cy="50" r="40" fill="red" clip-path="url(#clip1)"/>
</svg>
```

### 3.3 Pixel Comparison

```javascript
async function verifyWithBrowser(svgWithClip, ourResult) {
  // 1. Render original SVG in browser
  const browserPixels = await browser.renderSVG(svgWithClip);

  // 2. Create SVG with our flattened result (no clipPath)
  const flattenedSVG = createSVGFromPolygon(ourResult);
  const ourPixels = await browser.renderSVG(flattenedSVG);

  // 3. Compare pixels
  const diff = comparePixels(browserPixels, ourPixels);

  // Allow small differences for anti-aliasing
  assert(diff.maxDelta < 3, 'Pixel difference within tolerance');
  assert(diff.mismatchPercent < 0.5, 'Less than 0.5% pixel mismatch');
}
```

### 3.4 Browser Test Cases

| Test ID | Subject | ClipPath | clipPathUnits | Transform |
|---------|---------|----------|---------------|-----------|
| B001 | Circle | Rect | userSpaceOnUse | None |
| B002 | Rect | Circle | userSpaceOnUse | None |
| B003 | Ellipse | Polygon | userSpaceOnUse | None |
| B004 | Path | Rect | userSpaceOnUse | None |
| B005 | Circle | Rect | objectBoundingBox | None |
| B006 | Rect | Rect | userSpaceOnUse | rotate(45) |
| B007 | Circle | Rect | userSpaceOnUse | scale(0.5) |
| B008 | Complex path | Complex path | userSpaceOnUse | None |

---

## 4. Precision Verification

### 4.1 High-Precision Coordinates

Test with coordinates that would fail in floating-point:

```javascript
// Near-parallel edges that require high precision
const subject = [
  point('0', '0'),
  point('1000000.00000000001', '0.00000000001'),
  point('1000000', '1'),
  point('0', '1')
];

const clip = [
  point('500000', '-0.5'),
  point('500001', '-0.5'),
  point('500001', '1.5'),
  point('500000', '1.5')
];
```

### 4.2 Compare with IEEE 754

```javascript
function comparePrecision(subject, clip) {
  // Our Decimal.js result
  const ourResult = applyClipPath(subject, clip);

  // Simulate floating-point result
  const floatSubject = subject.map(p => ({ x: p.x.toNumber(), y: p.y.toNumber() }));
  const floatClip = clip.map(p => ({ x: p.x.toNumber(), y: p.y.toNumber() }));
  // ... run with float library

  // Our result should be more accurate
  assert(ourPrecision > floatPrecision, 'Decimal.js more precise than float');
}
```

### 4.3 Round-Trip Precision

```javascript
function testRoundTrip(polygon) {
  // Convert to path data
  const pathData = polygonToPathData(polygon, 40); // 40 decimal places

  // Convert back to polygon
  const recovered = pathToPolygon(pathData, 1); // 1 sample per segment (linear)

  // Compare
  for (let i = 0; i < polygon.length; i++) {
    const diff = polygon[i].x.minus(recovered[i].x).abs();
    assert(diff.lt('1e-35'), 'Round-trip preserves 35+ digits');
  }
}
```

---

## 5. Edge Case Testing

### 5.1 Degenerate Cases

| Case | Input | Expected | Verification |
|------|-------|----------|--------------|
| Empty clipPath | No children | Empty result | `result.length === 0` |
| Zero-size clip | `<rect width="0" height="0"/>` | Empty result | `result.length === 0` |
| Point clip | Single point | Empty result | `result.length === 0` |
| Line clip | Two points | Empty result | `result.length === 0` |
| Same polygons | subject === clip | Subject unchanged | Area preserved |

### 5.2 Topological Edge Cases

| Case | Description | Verification |
|------|-------------|--------------|
| Touching at vertex | Polygons share single vertex | Correct vertex handling |
| Touching at edge | Polygons share edge segment | No duplicate vertices |
| Contained | Clip entirely inside subject | Result === clip |
| Containing | Subject entirely inside clip | Result === subject |
| Multiple islands | Result has multiple polygons | All polygons returned |
| Hole creation | Clip creates hole | Hole handled (or error) |

### 5.3 Numerical Edge Cases

| Case | Values | Expected Issue |
|------|--------|----------------|
| Very small coords | 1e-50 | Underflow handling |
| Very large coords | 1e50 | Overflow handling |
| Near-zero angles | angle < 1e-40 | Collinearity detection |
| Nearly parallel | denom ~ 1e-60 | Intersection stability |

### 5.4 Circular References

```javascript
function testCircularClipPath() {
  const defs = new Map();
  defs.set('clip1', {
    id: 'clip1',
    'clip-path': 'url(#clip2)',
    children: [{ type: 'rect', x: 0, y: 0, width: 100, height: 100 }]
  });
  defs.set('clip2', {
    id: 'clip2',
    'clip-path': 'url(#clip1)', // Circular!
    children: [{ type: 'rect', x: 25, y: 25, width: 50, height: 50 }]
  });

  // Should not infinite loop, should warn and return
  const result = resolveNestedClipPath(defs.get('clip1'), defs, element);
  assert(result !== undefined, 'Circular reference handled');
}
```

---

## 6. clipPathUnits Verification

### 6.1 userSpaceOnUse

```javascript
function testUserSpaceOnUse() {
  const clipPath = {
    clipPathUnits: 'userSpaceOnUse',
    children: [{ type: 'rect', x: 0, y: 0, width: 50, height: 50 }]
  };

  const element = { type: 'rect', x: 100, y: 100, width: 200, height: 200 };

  // Clip region should be at (0,0)-(50,50), NOT relative to element
  const result = resolveClipPath(clipPath, element);

  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX.toNumber(), 0);
  assertClose(bbox.minY.toNumber(), 0);
  assertClose(bbox.maxX.toNumber(), 50);
  assertClose(bbox.maxY.toNumber(), 50);
}
```

### 6.2 objectBoundingBox

```javascript
function testObjectBoundingBox() {
  const clipPath = {
    clipPathUnits: 'objectBoundingBox',
    children: [{ type: 'rect', x: 0.25, y: 0.25, width: 0.5, height: 0.5 }]
  };

  const element = { type: 'rect', x: 100, y: 100, width: 200, height: 200 };

  // Clip region should be at 25% to 75% of element bbox
  // = (150, 150) to (250, 250)
  const result = resolveClipPath(clipPath, element);

  const bbox = PolygonClip.boundingBox(result);
  assertClose(bbox.minX.toNumber(), 150);
  assertClose(bbox.minY.toNumber(), 150);
  assertClose(bbox.maxX.toNumber(), 250);
  assertClose(bbox.maxY.toNumber(), 250);
}
```

---

## 7. Transform Verification

### 7.1 clipPath transform Attribute

```javascript
function testClipPathTransform() {
  const clipPath = {
    transform: 'translate(10, 10) rotate(45)',
    children: [{ type: 'rect', x: 0, y: 0, width: 20, height: 20 }]
  };

  // Result should be a rotated square translated by (10,10)
  const result = resolveClipPath(clipPath, element);

  // Verify center is at expected position
  const centroid = computeCentroid(result);
  assertClose(centroid.x.toNumber(), 10 + 10, 1); // ~20
  assertClose(centroid.y.toNumber(), 10 + 10, 1); // ~20
}
```

### 7.2 Element transform Inheritance

```javascript
function testElementTransform() {
  const clipPath = {
    children: [{ type: 'rect', x: 0, y: 0, width: 50, height: 50 }]
  };

  const element = {
    type: 'rect',
    x: 0, y: 0, width: 100, height: 100,
    transform: 'scale(2)'
  };

  const ctm = parseTransform('scale(2)');
  const result = applyClipPath(element, clipPath, ctm);

  // With CTM, element is 0-200 but clip is 0-50 (unscaled)
  // So result should be 0-50 in user space
}
```

---

## 8. Performance Benchmarks

### 8.1 Timing Targets

| Operation | Polygon Size | Target Time |
|-----------|--------------|-------------|
| pathToPolygon | 100 commands | < 10ms |
| shapeToPolygon | circle (20 samples) | < 1ms |
| polygonIntersection | 100 x 100 vertices | < 50ms |
| resolveClipPath | 5 shapes | < 20ms |
| applyClipPath | complex | < 100ms |

### 8.2 Memory Limits

```javascript
function testMemoryUsage() {
  const before = process.memoryUsage().heapUsed;

  // Process large polygon
  const largePolygon = generatePolygon(10000);
  const result = someOperation(largePolygon);

  const after = process.memoryUsage().heapUsed;
  const delta = after - before;

  assert(delta < 100 * 1024 * 1024, 'Memory usage < 100MB');
}
```

---

## 9. Test Matrix

### 9.1 Shape Combinations

|  | Rect Clip | Circle Clip | Polygon Clip | Path Clip |
|--|-----------|-------------|--------------|-----------|
| **Rect Subject** | B001 | B002 | B003 | B004 |
| **Circle Subject** | B005 | B006 | B007 | B008 |
| **Ellipse Subject** | B009 | B010 | B011 | B012 |
| **Polygon Subject** | B013 | B014 | B015 | B016 |
| **Path Subject** | B017 | B018 | B019 | B020 |

### 9.2 Transform Combinations

- No transform
- translate only
- scale only
- rotate only
- skew only
- Combined transforms
- Nested transforms (element + clipPath)

---

## 10. Regression Test Suite

### 10.1 Saved Test Cases

Store known-good results:

```javascript
const REGRESSION_TESTS = [
  {
    id: 'REG001',
    subject: { type: 'circle', cx: 50, cy: 50, r: 40 },
    clipPath: { children: [{ type: 'rect', x: 25, y: 25, width: 50, height: 50 }] },
    expectedArea: 1250.663..., // Calculated known-good value
    expectedVertexCount: 84
  },
  // ... more test cases
];
```

### 10.2 Automated Regression

```javascript
for (const test of REGRESSION_TESTS) {
  const result = applyClipPath(test.subject, test.clipPath);

  const area = PolygonClip.polygonArea(result[0]).abs().toNumber();
  assertClose(area, test.expectedArea, 0.001, `Regression ${test.id} area`);

  assert(result[0].length === test.expectedVertexCount,
    `Regression ${test.id} vertex count`);
}
```

---

## 11. Implementation Checklist

- [ ] Unit tests for pathToPolygon (all command types)
- [ ] Unit tests for shapeToPolygon (all shape types)
- [ ] Unit tests for resolveClipPath (both units types)
- [ ] Unit tests for applyClipPath (various combinations)
- [ ] Mathematical area conservation tests
- [ ] Mathematical point containment tests
- [ ] Browser visual comparison tests
- [ ] High-precision coordinate tests
- [ ] Edge case tests (empty, degenerate, circular)
- [ ] Transform verification tests
- [ ] Performance benchmarks
- [ ] Regression test suite
