# @emasoft/svg-matrix

High-precision matrix, vector, and SVG transformation library for JavaScript. Built on decimal.js for 80-digit precision arithmetic.

## Features

**Linear Algebra**
- Matrix and Vector classes with full linear algebra operations
- LU/QR decomposition, determinant, inverse, solve, matrix exponential

**Affine Transforms**
- 2D (3x3 homogeneous): translation, rotation, scale, skew, reflection
- 3D (4x4 homogeneous): translation, rotation (X/Y/Z/arbitrary axis), scale

**SVG Processing**
- Transform attribute parsing and CTM (Current Transform Matrix) building
- viewBox, preserveAspectRatio, nested viewports, unit resolution
- Shape-to-path conversion (circle, ellipse, rect, line, polygon, polyline)
- Path parsing, normalization (absolute, cubics), transformation

**SVG Element Resolution**
- ClipPath flattening to polygons
- Mask resolution (luminance and alpha)
- Pattern tiling expansion
- Use/symbol inlining with proper transforms
- Marker positioning and orientation

**Advanced**
- Polygon boolean operations (intersection, union, difference, convex hull)
- SVG 2.0 mesh gradient parsing and rasterization
- Text-to-path conversion with font support
- Browser verification against Chrome's native W3C SVG2 implementation

## Requirements

- **Node.js 24.0.0** or higher (ES modules, modern JavaScript features)
- **Playwright** (optional) - for browser verification features

## Precision

| Scenario | Float Error | This Library | Improvement |
|----------|-------------|--------------|-------------|
| GIS/CAD coordinates (1e6+ scale) | 1.69e-7 | 0 | 10^93x |
| 6-level SVG hierarchy | 1.14e-13 | 1e-77 | 10^64x |
| 1000 round-trip transforms | 5.41e-14 | 0 | 10^86x |

**When precision matters:** GIS, CAD, scientific visualization, deep transform hierarchies, accumulated operations.

**When floats suffice:** Simple transforms, small coordinates, visual applications where sub-pixel errors are imperceptible.

```bash
node test/benchmark-precision.js
```

## Installation

```bash
npm install @emasoft/svg-matrix
```

```js
import { Matrix, Vector, Transforms2D, Transforms3D, SVGFlatten } from '@emasoft/svg-matrix';
```

### CDN

```html
<script type="module">
  import { Matrix, Vector, Transforms2D } from 'https://esm.sh/@emasoft/svg-matrix';
</script>
```

## CLI

The library includes a command-line interface for batch processing SVG files.

```bash
# Process single file
svg-matrix flatten input.svg -o output.svg

# Batch process folder
svg-matrix flatten ./svgs/ -o ./output/

# Process files from list
svg-matrix flatten --list files.txt -o ./output/

# Convert shapes to paths
svg-matrix convert input.svg -o output.svg

# Normalize paths to cubic Beziers
svg-matrix normalize input.svg -o output.svg

# Show SVG file info
svg-matrix info input.svg

# Show help
svg-matrix help
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output file or directory |
| `-l, --list <file>` | Read input files from text file |
| `-r, --recursive` | Process directories recursively |
| `-p, --precision <n>` | Decimal precision (default: 6) |
| `-f, --force` | Overwrite existing files |
| `-n, --dry-run` | Show what would be done |
| `-q, --quiet` | Suppress all output except errors |
| `-v, --verbose` | Enable verbose/debug output |
| `--log-file <path>` | Write log to file |

### File List Format

Create a text file with one path per line:

```
# This is a comment
./folder1/file1.svg
./folder2/file2.svg
./entire-folder/
```

## Quick Start

```js
import { Decimal, Matrix, Vector, Transforms2D, SVGFlatten } from '@emasoft/svg-matrix';

Decimal.set({ precision: 80 });

// Compose transforms (right-to-left: scale first, then rotate, then translate)
const M = Transforms2D.translation(10, 20)
  .mul(Transforms2D.rotate(Math.PI / 4))
  .mul(Transforms2D.scale(2));

// Apply to point
const [x, y] = Transforms2D.applyTransform(M, 1, 0);

// Round-trip with inverse
const [xBack, yBack] = Transforms2D.applyTransform(M.inverse(), x, y);
```

---

## API Reference

### Linear Algebra

#### Vector

```js
import { Vector } from '@emasoft/svg-matrix';

const v = Vector.from([1, 2, 3]);
const w = Vector.from([4, 5, 6]);

v.add(w)              // Element-wise addition
v.sub(w)              // Element-wise subtraction
v.scale(2)            // Scalar multiplication
v.dot(w)              // Dot product → Decimal
v.cross(w)            // Cross product (3D)
v.norm()              // Euclidean length
v.normalize()         // Unit vector
v.angleBetween(w)     // Angle in radians
v.projectOnto(w)      // Vector projection
v.orthogonal()        // Perpendicular vector
v.distance(w)         // Euclidean distance
v.toNumberArray()     // [1, 2, 3]
```

#### Matrix

```js
import { Matrix } from '@emasoft/svg-matrix';

const A = Matrix.from([[1, 2], [3, 4]]);
const I = Matrix.identity(3);
const Z = Matrix.zeros(2, 3);

A.add(B)              // Element-wise addition
A.sub(B)              // Element-wise subtraction
A.mul(B)              // Matrix multiplication
A.transpose()         // Transpose
A.trace()             // Sum of diagonal
A.determinant()       // Determinant
A.inverse()           // Matrix inverse
A.solve([1, 1])       // Solve Ax = b
A.lu()                // { L, U, P } decomposition
A.qr()                // { Q, R } decomposition
A.exp()               // Matrix exponential
A.applyToVector(v)    // Matrix-vector product
```

### Transforms

#### 2D (3x3 matrices)

```js
import { Transforms2D } from '@emasoft/svg-matrix';

Transforms2D.translation(tx, ty)
Transforms2D.scale(sx, sy)              // sy defaults to sx
Transforms2D.rotate(theta)              // radians
Transforms2D.rotateAroundPoint(theta, px, py)
Transforms2D.skew(ax, ay)
Transforms2D.stretchAlongAxis(ux, uy, k)
Transforms2D.reflectX()                 // flip across X axis
Transforms2D.reflectY()                 // flip across Y axis
Transforms2D.reflectOrigin()

// Apply to point
const [x, y] = Transforms2D.applyTransform(matrix, px, py);
```

#### 3D (4x4 matrices)

```js
import { Transforms3D } from '@emasoft/svg-matrix';

Transforms3D.translation(tx, ty, tz)
Transforms3D.scale(sx, sy, sz)
Transforms3D.rotateX(theta)
Transforms3D.rotateY(theta)
Transforms3D.rotateZ(theta)
Transforms3D.rotateAroundAxis(ux, uy, uz, theta)
Transforms3D.rotateAroundPoint(ux, uy, uz, theta, px, py, pz)
Transforms3D.reflectXY()                // flip Z
Transforms3D.reflectXZ()                // flip Y
Transforms3D.reflectYZ()                // flip X

const [x, y, z] = Transforms3D.applyTransform(matrix, px, py, pz);
```

### SVG Processing

#### SVGFlatten - Transform Parsing & CTM

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

// Parse transform attributes
const m = SVGFlatten.parseTransformAttribute('translate(50,50) rotate(45) scale(2)');

// Build CTM from transform stack
const ctm = SVGFlatten.buildCTM([
  'scale(1.5)',
  'translate(-13.6, -10.2)',
  'rotate(15)',
  'matrix(0.716, 0, 0, 1.397, 0, 0)'
]);

// Apply to point
const { x, y } = SVGFlatten.applyToPoint(ctm, 10, 10);

// Transform path data
const transformed = SVGFlatten.transformPathData('M 100 100 L 200 200', ctm);

// viewBox handling
const viewBox = SVGFlatten.parseViewBox('0 0 100 100');
const par = SVGFlatten.parsePreserveAspectRatio('xMidYMid meet');
const vbTransform = SVGFlatten.computeViewBoxTransform(viewBox, 800, 600, par);

// Full CTM with viewBox + nested transforms
const fullCtm = SVGFlatten.buildFullCTM([
  { type: 'svg', width: 800, height: 600, viewBox: '0 0 400 300' },
  { type: 'g', transform: 'translate(50, 50)' },
  { type: 'g', transform: 'rotate(45)' },
  { type: 'element', transform: 'scale(2)' }
]);

// Unit resolution (px, %, em, pt, in, cm, mm, pc)
SVGFlatten.resolveLength('50%', 800);   // → 400
SVGFlatten.resolveLength('1in', 800);   // → 96

// objectBoundingBox transform
const bboxTransform = SVGFlatten.objectBoundingBoxTransform(100, 50, 200, 100);
```

#### GeometryToPath - Shape Conversion

```js
import { GeometryToPath } from '@emasoft/svg-matrix';

// Shape to path
GeometryToPath.circleToPathData(cx, cy, r, precision)
GeometryToPath.ellipseToPathData(cx, cy, rx, ry, precision)
GeometryToPath.rectToPathData(x, y, w, h, rx, ry, useArcs, precision)
GeometryToPath.lineToPathData(x1, y1, x2, y2, precision)
GeometryToPath.polylineToPathData(points, precision)
GeometryToPath.polygonToPathData(points, precision)
GeometryToPath.convertElementToPath(element, precision)

// Path manipulation
GeometryToPath.parsePathData(pathData)          // → [{command, args}]
GeometryToPath.pathArrayToString(commands)      // → path string
GeometryToPath.pathToAbsolute(pathData)         // relative → absolute
GeometryToPath.pathToCubics(pathData)           // all → cubic Beziers
GeometryToPath.transformPathData(pathData, matrix, precision)

// Bezier kappa constant: 4*(sqrt(2)-1)/3
GeometryToPath.getKappa()
```

#### BrowserVerify - Chrome Verification

```js
import { BrowserVerify } from '@emasoft/svg-matrix';

// One-off verification
await BrowserVerify.verifyViewBox(800, 600, '0 0 400 300', 'xMidYMid meet');
await BrowserVerify.verifyTransform('rotate(45) translate(100, 50) scale(2)');

// Session-based verification
const verifier = new BrowserVerify.BrowserVerifier();
await verifier.init({ headless: true });
await verifier.verifyViewBoxTransform(800, 600, '0 0 100 100');
await verifier.verifyMatrix(ctm, { width: 100, height: 100, transform: '...' });
await verifier.verifyPointTransform(ctm, 10, 20, config);
await verifier.close();

// Standard test suite (28 tests including W3C issue #215 cases)
await BrowserVerify.runStandardTests({ verbose: true });
```

### Polygon Operations

#### PolygonClip

```js
import { PolygonClip } from '@emasoft/svg-matrix';

const square = [
  PolygonClip.point(0, 0),
  PolygonClip.point(2, 0),
  PolygonClip.point(2, 2),
  PolygonClip.point(0, 2)
];

// Boolean operations
PolygonClip.polygonIntersection(poly1, poly2)
PolygonClip.polygonUnion(poly1, poly2)
PolygonClip.polygonDifference(poly1, poly2)

// Properties
PolygonClip.polygonArea(polygon)
PolygonClip.isCounterClockwise(polygon)
PolygonClip.isConvex(polygon)
PolygonClip.pointInPolygon(point, polygon)  // 1=inside, 0=boundary, -1=outside

// Convex hull
PolygonClip.convexHull(points)

// Bounding box
PolygonClip.boundingBox(polygon)  // {minX, minY, maxX, maxY}
PolygonClip.bboxIntersects(bbox1, bbox2)
```

#### ClipPathResolver

```js
import { ClipPathResolver } from '@emasoft/svg-matrix';

// Parse and resolve clipPath
const clipData = ClipPathResolver.parseClipPathElement(element);
const clipPolygon = ClipPathResolver.resolveClipPath(clipData, targetBBox);

// Shape to polygon
ClipPathResolver.shapeToPolygon({ type: 'circle', cx: 100, cy: 100, r: 50 }, { samples: 32 })
ClipPathResolver.pathToPolygon(pathData, { samples: 20 })
ClipPathResolver.polygonToPathData(polygon)

// Apply clipPath to element
ClipPathResolver.applyClipPath(elementData, clipPathData, targetBBox)
```

### SVG Element Resolution

#### UseSymbolResolver

```js
import { UseSymbolResolver } from '@emasoft/svg-matrix';

const useData = UseSymbolResolver.parseUseElement(useElement);
const symbolData = UseSymbolResolver.parseSymbolElement(symbolElement);
const resolved = UseSymbolResolver.resolveUse(useData, svgDocument);
const flattened = UseSymbolResolver.flattenResolvedUse(resolved);
UseSymbolResolver.resolveAllUses(svgDocument)
```

#### MarkerResolver

```js
import { MarkerResolver } from '@emasoft/svg-matrix';

const markerData = MarkerResolver.parseMarkerElement(markerElement);
const vertices = MarkerResolver.getPathVertices(pathData);
const transform = MarkerResolver.getMarkerTransform(markerData, vertex, angle, strokeWidth);
const instances = MarkerResolver.resolveMarkers(pathD, { 'marker-start': m1, 'marker-end': m2, strokeWidth: 2 });
MarkerResolver.markersToPathData(instances)
```

#### PatternResolver

```js
import { PatternResolver } from '@emasoft/svg-matrix';

const patternData = PatternResolver.parsePatternElement(patternElement);
const tiles = PatternResolver.resolvePattern(patternData, targetBBox);
PatternResolver.applyPattern(elementData, patternData, targetBBox)
PatternResolver.patternToClipPath(patternData, targetBBox)
PatternResolver.patternToPathData(patternData, targetBBox)
```

#### MaskResolver

```js
import { MaskResolver } from '@emasoft/svg-matrix';

const maskData = MaskResolver.parseMaskElement(maskElement);
const maskPolygon = MaskResolver.resolveMask(maskData, targetBBox);
MaskResolver.applyMask(elementPolygon, maskData, targetBBox)
MaskResolver.colorToLuminance({ r, g, b })  // sRGB luminance
```

### Advanced Features

#### MeshGradient (SVG 2.0)

```js
import { MeshGradient } from '@emasoft/svg-matrix';

// Parse mesh gradient
const meshDef = MeshGradient.parseMeshGradientElement(element);
const meshData = MeshGradient.parseMeshGradient(meshDef);

// Coons patch evaluation
const patch = new MeshGradient.CoonsPatch(topEdge, rightEdge, bottomEdge, leftEdge, cornerColors);
const { point, color } = patch.evaluate(u, v);

// Rasterize to ImageData
const imageData = MeshGradient.rasterizeMeshGradient(meshData, width, height);

// Convert to polygons for vector export
const polygons = MeshGradient.meshGradientToPolygons(meshData, { subdivisions: 16 });

// Clip and export
const clipped = MeshGradient.clipMeshGradient(meshData, clipPolygon, { subdivisions: 32 });
const svgPaths = MeshGradient.clippedMeshToSVG(clipped);
```

#### TextToPath

```js
import { TextToPath } from '@emasoft/svg-matrix';
import opentype from 'opentype.js';

const font = await opentype.load('font.ttf');

// Convert text to path
const pathData = TextToPath.textToPath("Hello", {
  x: 100, y: 100,
  fontSize: 24,
  font: font,
  textAnchor: TextToPath.TextAnchor.MIDDLE,
  dominantBaseline: TextToPath.DominantBaseline.MIDDLE
});

// Parse text element
const textData = TextToPath.parseTextElement(textElement);
const result = TextToPath.textElementToPath(textData, { font });

// Measure text
const metrics = TextToPath.measureText("Hello", { fontSize: "20px" }, font);
const bbox = TextToPath.getTextBBox(textData);
```

### Convenience Functions

Direct exports for common operations:

```js
import {
  // Transforms
  translate2D, rotate2D, scale2D, transform2D,
  translate3D, scale3D, transform3D,

  // Shape conversion
  circleToPath, ellipseToPath, rectToPath, lineToPath,
  polygonToPath, polylineToPath,

  // Path manipulation
  parsePath, pathToString, pathToAbsolute, pathToCubics, transformPath,
  elementToPath,

  // Matrix/Vector creation
  identity, zeros, vec, mat,

  // Precision control
  setPrecision, getPrecision,

  // Constants
  getKappa
} from '@emasoft/svg-matrix';
```

### Logging

Control library logging output:

```js
import { Logger, LogLevel, setLogLevel, enableFileLogging } from '@emasoft/svg-matrix';

// Suppress all logging
setLogLevel(LogLevel.SILENT);

// Enable only errors
setLogLevel(LogLevel.ERROR);

// Enable warnings and errors (default)
setLogLevel(LogLevel.WARN);

// Enable all logging including debug
setLogLevel(LogLevel.DEBUG);

// Write logs to file
enableFileLogging('/path/to/log.txt');

// Direct Logger access
Logger.level = LogLevel.INFO;
Logger.warn('Custom warning');
Logger.debug('Debug info');
```

## License

MIT
