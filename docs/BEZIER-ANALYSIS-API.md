# Bezier Curve Analysis API

**svg-matrix** provides arbitrary-precision Bezier curve analysis that surpasses Python's `svgpathtools` in precision and mathematical rigor.

## Precision Comparison

| Library | Precision | Digits | Notes |
|---------|-----------|--------|-------|
| svgpathtools | float64 | ~15 | Python complex numbers |
| **svg-matrix** | Decimal.js | **80** (configurable to 10^9) | Arbitrary precision |

## Modules Overview

### BezierAnalysis
Differential geometry operations on Bezier curves.

```javascript
import { BezierAnalysis } from '@emasoft/svg-matrix';

// Control points as [x, y] arrays or {x, y} objects
const cubic = [
  [0, 0],      // P0 (start)
  [0.5, 1],    // P1 (control 1)
  [1.5, 1],    // P2 (control 2)
  [2, 0]       // P3 (end)
];

// Point evaluation (de Casteljau - numerically stable)
const pt = BezierAnalysis.bezierPoint(cubic, 0.5);  // {x: Decimal, y: Decimal}

// Derivatives (any order)
const d1 = BezierAnalysis.bezierDerivative(cubic, 0.5, 1);  // 1st derivative
const d2 = BezierAnalysis.bezierDerivative(cubic, 0.5, 2);  // 2nd derivative

// Tangent and normal (unit vectors)
const tangent = BezierAnalysis.bezierTangent(cubic, 0.5);
const normal = BezierAnalysis.bezierNormal(cubic, 0.5);

// Curvature (signed, exact formula)
const kappa = BezierAnalysis.bezierCurvature(cubic, 0.5);

// Split curve at t (de Casteljau)
const [left, right] = BezierAnalysis.bezierSplit(cubic, 0.5);

// Exact bounding box (finds critical points)
const bbox = BezierAnalysis.bezierBoundingBox(cubic);
// {minX, maxX, minY, maxY} as Decimal

// Crop to parameter range
const cropped = BezierAnalysis.bezierCrop(cubic, 0.25, 0.75);
```

### ArcLength
Arc length computation with Gauss-Legendre quadrature.

```javascript
import { ArcLength } from '@emasoft/svg-matrix';

// Compute arc length
const length = ArcLength.arcLength(cubic, 0, 1);  // Full curve
const partial = ArcLength.arcLength(cubic, 0.25, 0.75);  // Partial

// Inverse: find t for target arc length
const t = ArcLength.inverseArcLength(cubic, length.div(2));  // t at midpoint by arc length

// Path arc length (multi-segment)
const segments = [cubic1, cubic2, cubic3];
const totalLength = ArcLength.pathArcLength(segments);

// Create lookup table for fast reparameterization
const table = ArcLength.createArcLengthTable(cubic, 100);

// Verify precision
const { absoluteError, relativeError } = ArcLength.verifyArcLength(cubic);
```

### PathAnalysis
Path-level operations using Green's theorem and ray casting.

```javascript
import { PathAnalysis } from '@emasoft/svg-matrix';

// Signed area (Green's theorem)
const area = PathAnalysis.pathArea(segments);  // Positive=CCW, Negative=CW

// Absolute area
const absArea = PathAnalysis.pathAbsoluteArea(segments);

// Closest point on path to a query point
const result = PathAnalysis.closestPointOnPath(segments, [1.5, 0.5]);
// { point: {x, y}, segmentIndex, t, distance }

// Farthest point
const far = PathAnalysis.farthestPointOnPath(segments, [0, 0]);

// Point-in-path (ray casting algorithm)
const inside = PathAnalysis.pointInPath(segments, [1, 0.5]);  // true/false

// Path properties
const closed = PathAnalysis.isPathClosed(segments);
const continuous = PathAnalysis.isPathContinuous(segments);
const smooth = PathAnalysis.isPathSmooth(segments);  // G1 continuity

// Find kinks (discontinuities in tangent)
const kinks = PathAnalysis.findKinks(segments);
// [{segmentIndex, t, angle}]

// Bounding box
const bbox = PathAnalysis.pathBoundingBox(segments);

// Total path length
const pathLen = PathAnalysis.pathLength(segments);
```

### BezierIntersections
Precise intersection detection with verification.

```javascript
import { BezierIntersections } from '@emasoft/svg-matrix';

// Line-line intersection (Cramer's rule - exact)
const line1 = [[0, 0], [2, 2]];
const line2 = [[0, 2], [2, 0]];
const pt = BezierIntersections.lineLineIntersection(line1, line2);
// {x, y, t1, t2} or null if parallel

// Bezier-line intersection
const intersections = BezierIntersections.bezierLineIntersection(cubic, line);
// [{x, y, tBezier, tLine}]

// Bezier-Bezier intersection (subdivision + Newton refinement)
const xings = BezierIntersections.bezierBezierIntersection(cubic1, cubic2, {
  tolerance: '1e-40',  // 40-digit precision
  maxIterations: 100
});
// [{x, y, t1, t2}]

// Self-intersection detection
const selfX = BezierIntersections.bezierSelfIntersection(loopCurve);

// Path-path intersection
const pathXings = BezierIntersections.pathPathIntersection(path1, path2);
// [{point, seg1Index, seg2Index, t1, t2}]

// Verify intersection point is on both curves
const valid = BezierIntersections.verifyIntersection(cubic1, cubic2, intersection, '1e-30');
```

## Key Advantages Over svgpathtools

### 1. Arbitrary Precision
```javascript
import { setPrecision } from '@emasoft/svg-matrix';
setPrecision(200);  // 200-digit precision for extreme accuracy
```

### 2. Numerically Stable Algorithms
- **de Casteljau** for point evaluation (vs Horner which can accumulate error)
- **Gauss-Legendre quadrature** with 50-digit precomputed nodes/weights
- **Newton-Raphson refinement** for intersection detection

### 3. Exact Bounding Boxes
svgpathtools samples at fixed t values. svg-matrix finds actual critical points:

```javascript
// svg-matrix finds exact extrema by solving derivative = 0
const bbox = BezierAnalysis.bezierBoundingBox(cubic);
// Exact to 80 significant digits
```

### 4. Verified Intersections
```javascript
// Every intersection can be verified to specified tolerance
const valid = BezierIntersections.verifyIntersection(c1, c2, pt, '1e-50');
```

### 5. No float64 Limitations
svgpathtools fails at GIS-scale coordinates or tiny tolerances:

```javascript
// GIS coordinates work perfectly
const gisPoint = [[139.7563, 35.6895], ...];  // Tokyo coordinates
// No precision loss at 80 digits
```

## Function Mapping: svgpathtools to svg-matrix

| svgpathtools | svg-matrix | Precision Gain |
|--------------|------------|----------------|
| `CubicBezier.point(t)` | `BezierAnalysis.bezierPoint(pts, t)` | 15 -> 80 digits |
| `CubicBezier.derivative(t)` | `BezierAnalysis.bezierDerivative(pts, t)` | 15 -> 80 digits |
| `CubicBezier.unit_tangent(t)` | `BezierAnalysis.bezierTangent(pts, t)` | 15 -> 80 digits |
| `CubicBezier.normal(t)` | `BezierAnalysis.bezierNormal(pts, t)` | 15 -> 80 digits |
| `CubicBezier.curvature(t)` | `BezierAnalysis.bezierCurvature(pts, t)` | 15 -> 80 digits |
| `CubicBezier.split(t)` | `BezierAnalysis.bezierSplit(pts, t)` | 15 -> 80 digits |
| `CubicBezier.bbox()` | `BezierAnalysis.bezierBoundingBox(pts)` | Exact critical pts |
| `CubicBezier.cropped(t0, t1)` | `BezierAnalysis.bezierCrop(pts, t0, t1)` | 15 -> 80 digits |
| `CubicBezier.length()` | `ArcLength.arcLength(pts)` | Gauss-Legendre |
| `CubicBezier.ilength(s)` | `ArcLength.inverseArcLength(pts, s)` | 15 -> 80 digits |
| `Path.area()` | `PathAnalysis.pathArea(segs)` | Green's theorem exact |
| `Path.iscontinuous()` | `PathAnalysis.isPathContinuous(segs)` | Configurable tol |
| `Path.isclosed()` | `PathAnalysis.isPathClosed(segs)` | Configurable tol |
| `seg1.intersect(seg2)` | `BezierIntersections.bezierBezierIntersection()` | Verified results |

## Installation

```bash
npm install @emasoft/svg-matrix
```

```javascript
import {
  BezierAnalysis,
  ArcLength,
  PathAnalysis,
  BezierIntersections,
  setPrecision
} from '@emasoft/svg-matrix';

// Set desired precision (default 80)
setPrecision(100);
```
