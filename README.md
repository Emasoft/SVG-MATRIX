# @emasoft/svg-matrix

A JavaScript library for working with SVG files, matrices, and geometric transformations.
Uses high-precision math (80 digits!) so your calculations are always accurate.

---

## How to Install

### Step 1: Check you have Node.js 24 or newer

Open your terminal and type:

```bash
node --version
```

You should see `v24.0.0` or higher. If not, download Node.js from https://nodejs.org

### Step 2: Install the package

In your terminal, go to your project folder and type:

```bash
npm install @emasoft/svg-matrix
```

That's it! The package is now installed.

---

## How to Use It

### In your JavaScript/TypeScript file

Add this line at the top of your file:

```js
import { Matrix, Vector, Transforms2D } from '@emasoft/svg-matrix';
```

Now you can use all the tools!

### In an HTML page (no install needed)

Just add this inside your HTML:

```html
<script type="module">
  import { Matrix, Transforms2D } from 'https://esm.sh/@emasoft/svg-matrix';

  // Your code here
</script>
```

---

## Command Line Tools

After installing, you get two commands you can run in your terminal:

### `svg-matrix` - Process SVG files

| What you type | What it does |
|---------------|--------------|
| `svg-matrix flatten input.svg -o output.svg` | Bakes all transforms into the shapes |
| `svg-matrix convert input.svg -o output.svg` | Turns circles, rectangles into paths |
| `svg-matrix normalize input.svg -o output.svg` | Makes all path commands consistent |
| `svg-matrix info input.svg` | Shows info about the SVG file |

**Options you can add:**

| Option | What it does |
|--------|--------------|
| `-o output.svg` | Where to save the result |
| `-r` | Process all SVG files in subfolders too |
| `-f` | Overwrite files without asking |
| `-q` | Don't print messages |

### `svglinter` - Check SVG files for problems

| What you type | What it does |
|---------------|--------------|
| `svglinter myfile.svg` | Check one file for problems |
| `svglinter icons/` | Check all SVG files in a folder |
| `svglinter --fix icons/` | Fix problems automatically |
| `svglinter --errors-only icons/` | Only show serious problems |

The linter finds things like:
- Broken references (pointing to IDs that don't exist)
- Typos in element or attribute names
- Invalid colors or values
- Missing required attributes

See [full svglinter documentation](docs/SVGLINTER.md) for the complete list of checks.

---

## Quick Examples

### Example 1: Work with vectors

```js
import { Vector } from '@emasoft/svg-matrix';

// Create two vectors
const a = Vector.from([3, 4]);
const b = Vector.from([1, 0]);

// Get the length of vector a (it's 5, like a 3-4-5 triangle!)
console.log(a.norm().toString());  // "5"

// Add them together
const sum = a.add(b);
console.log(sum.toNumberArray());  // [4, 4]
```

### Example 2: Work with matrices

```js
import { Matrix } from '@emasoft/svg-matrix';

// Create a 2x2 matrix
const M = Matrix.from([
  [1, 2],
  [3, 4]
]);

// Calculate its determinant
console.log(M.determinant().toString());  // "-2"

// Get the inverse matrix
const inv = M.inverse();
```

### Example 3: Transform a point

```js
import { Transforms2D } from '@emasoft/svg-matrix';

// Move a point 100 units to the right
const move = Transforms2D.translation(100, 0);

// Apply to point (10, 20)
const [newX, newY] = Transforms2D.applyTransform(move, 10, 20);
console.log(newX, newY);  // 110, 20
```

### Example 4: Convert a circle to a path

```js
import { GeometryToPath } from '@emasoft/svg-matrix';

// Turn a circle (center 50,50 radius 25) into path commands
const pathData = GeometryToPath.circleToPathData(50, 50, 25);
console.log(pathData);
// "M75,50 A25,25 0 1,1 25,50 A25,25 0 1,1 75,50"
```

---

## What's Inside

| Category | What you can do |
|----------|-----------------|
| **Vectors** | Add, subtract, dot product, cross product, normalize, find angles |
| **Matrices** | Multiply, invert, transpose, solve equations, decompose (LU, QR) |
| **2D Transforms** | Move, rotate, scale, skew, reflect shapes |
| **3D Transforms** | Same as 2D but for 3D graphics |
| **SVG Shapes** | Convert circles, rectangles, etc. to path commands |
| **SVG Paths** | Parse, normalize, transform path data |
| **SVG Validation** | Find and fix problems in SVG files |

---

## API Reference

### Vector

| Method | Description | Example |
|--------|-------------|---------|
| `Vector.from(arr)` | Create vector | `Vector.from([1, 2, 3])` |
| `.add(v)` | Addition | `v.add(w)` |
| `.sub(v)` | Subtraction | `v.sub(w)` |
| `.scale(s)` | Scalar multiply | `v.scale(2)` |
| `.dot(v)` | Dot product | `v.dot(w)` → Decimal |
| `.cross(v)` | Cross product (3D) | `v.cross(w)` |
| `.norm()` | Euclidean length | `v.norm()` |
| `.normalize()` | Unit vector | `v.normalize()` |
| `.angleBetween(v)` | Angle (radians) | `v.angleBetween(w)` |
| `.distance(v)` | Euclidean distance | `v.distance(w)` |
| `.toNumberArray()` | To JS array | `[1, 2, 3]` |

```js
import { Vector } from '@emasoft/svg-matrix';

const v = Vector.from([3, 4]);
console.log(v.norm().toString());        // "5"
console.log(v.normalize().toNumberArray()); // [0.6, 0.8]
```

---

### Matrix

| Method | Description | Example |
|--------|-------------|---------|
| `Matrix.from(arr)` | Create from 2D array | `Matrix.from([[1,2],[3,4]])` |
| `Matrix.identity(n)` | Identity matrix | `Matrix.identity(3)` |
| `Matrix.zeros(r, c)` | Zero matrix | `Matrix.zeros(2, 3)` |
| `.mul(M)` | Matrix multiply | `A.mul(B)` |
| `.transpose()` | Transpose | `A.transpose()` |
| `.determinant()` | Determinant | `A.determinant()` |
| `.inverse()` | Inverse | `A.inverse()` |
| `.solve(b)` | Solve Ax = b | `A.solve([1, 1])` |
| `.lu()` | LU decomposition | `{ L, U, P }` |
| `.qr()` | QR decomposition | `{ Q, R }` |
| `.exp()` | Matrix exponential | `A.exp()` |

```js
import { Matrix } from '@emasoft/svg-matrix';

const A = Matrix.from([[4, 7], [2, 6]]);
console.log(A.determinant().toString());  // "10"
const x = A.solve([1, 0]);                // Solve Ax = [1, 0]
```

---

### Transforms2D

| Method | Description |
|--------|-------------|
| `translation(tx, ty)` | Translation matrix |
| `scale(sx, sy?)` | Scale matrix (sy defaults to sx) |
| `rotate(theta)` | Rotation matrix (radians) |
| `rotateAroundPoint(theta, px, py)` | Rotate around point |
| `skew(ax, ay)` | Skew matrix |
| `reflectX()` / `reflectY()` | Reflection matrices |
| `applyTransform(M, x, y)` | Apply matrix to point |

```js
import { Transforms2D } from '@emasoft/svg-matrix';

// Rotate 45 degrees around origin
const R = Transforms2D.rotate(Math.PI / 4);
const [x, y] = Transforms2D.applyTransform(R, 10, 0);
// Result: [7.07..., 7.07...]

// Compose: translate, then rotate, then scale
const M = Transforms2D.translation(100, 50)
  .mul(Transforms2D.rotate(Math.PI / 6))
  .mul(Transforms2D.scale(2));
```

---

### Transforms3D

| Method | Description |
|--------|-------------|
| `translation(tx, ty, tz)` | Translation matrix |
| `scale(sx, sy, sz)` | Scale matrix |
| `rotateX(theta)` | Rotate around X axis |
| `rotateY(theta)` | Rotate around Y axis |
| `rotateZ(theta)` | Rotate around Z axis |
| `rotateAroundAxis(ux, uy, uz, theta)` | Rotate around arbitrary axis |
| `applyTransform(M, x, y, z)` | Apply matrix to point |

```js
import { Transforms3D } from '@emasoft/svg-matrix';

const R = Transforms3D.rotateY(Math.PI / 2);  // 90 degrees around Y
const [x, y, z] = Transforms3D.applyTransform(R, 1, 0, 0);
// Result: [0, 0, -1]
```

---

### SVGFlatten

| Method | Description |
|--------|-------------|
| `parseTransformAttribute(str)` | Parse SVG transform string |
| `buildCTM(transforms[])` | Build CTM from transform stack |
| `applyToPoint(ctm, x, y)` | Transform a point |
| `transformPathData(pathData, ctm)` | Transform path data |
| `parseViewBox(str)` | Parse viewBox attribute |
| `parsePreserveAspectRatio(str)` | Parse preserveAspectRatio |
| `computeViewBoxTransform(vb, w, h, par)` | Compute viewBox transform |
| `resolveLength(str, ref)` | Resolve CSS length units |

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

// Parse and apply SVG transforms
const ctm = SVGFlatten.parseTransformAttribute('translate(50,50) rotate(45) scale(2)');
const { x, y } = SVGFlatten.applyToPoint(ctm, 10, 10);

// Transform path data
const transformed = SVGFlatten.transformPathData('M 0 0 L 100 100', ctm);

// Resolve units
SVGFlatten.resolveLength('50%', 800);  // → 400
SVGFlatten.resolveLength('1in', 96);   // → 96
```

---

### GeometryToPath

| Method | Description |
|--------|-------------|
| `circleToPathData(cx, cy, r)` | Circle to path |
| `ellipseToPathData(cx, cy, rx, ry)` | Ellipse to path |
| `rectToPathData(x, y, w, h, rx?, ry?)` | Rectangle to path |
| `lineToPathData(x1, y1, x2, y2)` | Line to path |
| `polylineToPathData(points)` | Polyline to path |
| `polygonToPathData(points)` | Polygon to path |
| `parsePathData(d)` | Parse path to commands |
| `pathToAbsolute(d)` | Convert to absolute |
| `pathToCubics(d)` | Convert to cubic Beziers |
| `transformPathData(d, matrix)` | Transform path |

```js
import { GeometryToPath } from '@emasoft/svg-matrix';

// Convert shapes to paths
const circle = GeometryToPath.circleToPathData(100, 100, 50);
const rect = GeometryToPath.rectToPathData(0, 0, 200, 100, 10, 10);

// Parse and normalize paths
const commands = GeometryToPath.parsePathData('M 0 0 l 10 10 h 20');
const absolute = GeometryToPath.pathToAbsolute('m 0 0 l 10 10');
const cubics = GeometryToPath.pathToCubics('M 0 0 Q 50 50 100 0');
```

---

### PolygonClip

| Method | Description |
|--------|-------------|
| `point(x, y)` | Create point |
| `polygonIntersection(p1, p2)` | Boolean intersection |
| `polygonUnion(p1, p2)` | Boolean union |
| `polygonDifference(p1, p2)` | Boolean difference |
| `polygonArea(p)` | Signed area |
| `isConvex(p)` | Check if convex |
| `pointInPolygon(pt, p)` | Point containment (1=in, 0=on, -1=out) |
| `convexHull(points)` | Compute convex hull |
| `boundingBox(p)` | Get bounding box |

```js
import { PolygonClip } from '@emasoft/svg-matrix';

const square = [
  PolygonClip.point(0, 0), PolygonClip.point(2, 0),
  PolygonClip.point(2, 2), PolygonClip.point(0, 2)
];
const triangle = [
  PolygonClip.point(1, 0), PolygonClip.point(3, 0),
  PolygonClip.point(2, 2)
];

const intersection = PolygonClip.polygonIntersection(square, triangle);
const area = PolygonClip.polygonArea(square);  // 4
```

---

### ClipPathResolver

| Method | Description |
|--------|-------------|
| `parseClipPathElement(el)` | Parse clipPath element |
| `resolveClipPath(data, bbox)` | Resolve to polygon |
| `shapeToPolygon(shape, opts)` | Shape to polygon |
| `pathToPolygon(d, opts)` | Path to polygon |
| `applyClipPath(el, clip, bbox)` | Apply clipping |

```js
import { ClipPathResolver } from '@emasoft/svg-matrix';

const polygon = ClipPathResolver.shapeToPolygon(
  { type: 'circle', cx: 100, cy: 100, r: 50 },
  { samples: 32 }
);
```

---

### UseSymbolResolver

| Method | Description |
|--------|-------------|
| `parseUseElement(el)` | Parse use element |
| `parseSymbolElement(el)` | Parse symbol element |
| `resolveUse(data, doc)` | Resolve use reference |
| `flattenResolvedUse(resolved)` | Flatten to paths |
| `resolveAllUses(doc)` | Resolve all use elements |

```js
import { UseSymbolResolver } from '@emasoft/svg-matrix';

// Resolve all <use> elements in document
const flattened = UseSymbolResolver.resolveAllUses(svgDocument);
```

---

### MarkerResolver

| Method | Description |
|--------|-------------|
| `parseMarkerElement(el)` | Parse marker element |
| `getPathVertices(d)` | Get vertices from path |
| `getMarkerTransform(marker, vertex, angle, stroke)` | Compute marker transform |
| `resolveMarkers(d, opts)` | Resolve all markers |
| `markersToPathData(instances)` | Convert to path data |

```js
import { MarkerResolver } from '@emasoft/svg-matrix';

const instances = MarkerResolver.resolveMarkers(pathD, {
  'marker-start': startMarker,
  'marker-end': endMarker,
  strokeWidth: 2
});
```

---

### PatternResolver

| Method | Description |
|--------|-------------|
| `parsePatternElement(el)` | Parse pattern element |
| `resolvePattern(data, bbox)` | Resolve pattern tiles |
| `applyPattern(el, pattern, bbox)` | Apply pattern fill |
| `patternToPathData(data, bbox)` | Convert to path data |

```js
import { PatternResolver } from '@emasoft/svg-matrix';

const tiles = PatternResolver.resolvePattern(patternData, targetBBox);
```

---

### MaskResolver

| Method | Description |
|--------|-------------|
| `parseMaskElement(el)` | Parse mask element |
| `resolveMask(data, bbox)` | Resolve mask polygon |
| `applyMask(polygon, mask, bbox)` | Apply mask clipping |
| `colorToLuminance(rgb)` | Compute sRGB luminance |

```js
import { MaskResolver } from '@emasoft/svg-matrix';

const maskPolygon = MaskResolver.resolveMask(maskData, targetBBox);
```

---

### MeshGradient (SVG 2.0)

| Method | Description |
|--------|-------------|
| `parseMeshGradientElement(el)` | Parse mesh gradient |
| `CoonsPatch` | Coons patch class |
| `rasterizeMeshGradient(data, w, h)` | Rasterize to ImageData |
| `meshGradientToPolygons(data, opts)` | Convert to polygons |

```js
import { MeshGradient } from '@emasoft/svg-matrix';

const patch = new MeshGradient.CoonsPatch(top, right, bottom, left, colors);
const { point, color } = patch.evaluate(0.5, 0.5);

const imageData = MeshGradient.rasterizeMeshGradient(meshData, 256, 256);
```

---

### TextToPath

| Method | Description |
|--------|-------------|
| `textToPath(text, opts)` | Convert text to path |
| `parseTextElement(el)` | Parse text element |
| `textElementToPath(data, opts)` | Text element to path |
| `measureText(text, style, font)` | Measure text |
| `getTextBBox(data)` | Get text bounding box |

```js
import { TextToPath } from '@emasoft/svg-matrix';
import opentype from 'opentype.js';

const font = await opentype.load('font.ttf');
const pathData = TextToPath.textToPath("Hello", {
  x: 100, y: 100, fontSize: 24, font
});
```

---

### BrowserVerify

| Method | Description |
|--------|-------------|
| `verifyViewBox(w, h, vb, par)` | Verify viewBox transform |
| `verifyTransform(str)` | Verify transform attribute |
| `BrowserVerifier` | Session-based verifier class |
| `runStandardTests(opts)` | Run W3C test suite |

```js
import { BrowserVerify } from '@emasoft/svg-matrix';

// One-off verification
await BrowserVerify.verifyTransform('rotate(45) translate(100, 50)');

// Run standard test suite (28 tests)
await BrowserVerify.runStandardTests({ verbose: true });
```

---

### validateSvg / fixInvalidSvg

| Function | Description |
|----------|-------------|
| `validateSvg(input)` | Validate SVG file or string |
| `fixInvalidSvg(input)` | Auto-fix issues |

```js
import { validateSvg, fixInvalidSvg } from '@emasoft/svg-matrix';

const result = await validateSvg('icon.svg');
console.log(result.valid);   // true/false
console.log(result.issues);  // Array of { type, severity, line, reason }

const fixed = await fixInvalidSvg('broken.svg');
console.log(fixed.svg);      // Fixed SVG string
```

---

### Logging

| Function | Description |
|----------|-------------|
| `setLogLevel(level)` | Set log level |
| `enableFileLogging(path)` | Log to file |
| `LogLevel.SILENT` | No output |
| `LogLevel.ERROR` | Errors only |
| `LogLevel.WARN` | Warnings + errors (default) |
| `LogLevel.DEBUG` | All output |

```js
import { setLogLevel, LogLevel } from '@emasoft/svg-matrix';

setLogLevel(LogLevel.SILENT);  // Suppress all logging
```

---

### Convenience Exports

```js
import {
  // Quick transforms
  translate2D, rotate2D, scale2D, transform2D,
  translate3D, scale3D, transform3D,

  // Quick shapes
  circleToPath, ellipseToPath, rectToPath, lineToPath,
  polygonToPath, polylineToPath,

  // Quick paths
  parsePath, pathToString, pathToAbsolute, pathToCubics, transformPath,

  // Quick matrix/vector
  identity, zeros, vec, mat,

  // Precision
  setPrecision, getPrecision, getKappa
} from '@emasoft/svg-matrix';
```

---

## SVGO vs svg-matrix

| Aspect | SVGO | svg-matrix |
|--------|------|------------|
| **Precision** | 15 digits (JS float) | 80 digits (Decimal.js) |
| **Verification** | None | Mathematical inverse verification |
| **Architecture** | Monolithic optimizer | Modular toolkit |
| **Use Case** | Production optimization | Precision-critical apps |

**Use svg-matrix when:** GIS, CAD, scientific visualization, deep transform hierarchies, or when you need mathematical verification.

**Use SVGO when:** Production optimization, file size reduction, standard precision is acceptable.

---

## Exclusive Features

These features are not available in SVGO:

| Function | Description |
|----------|-------------|
| `flattenClipPaths()` | Flatten clip-paths to geometry |
| `flattenMasks()` | Flatten masks to geometry |
| `flattenGradients()` | Bake gradients into fills |
| `flattenPatterns()` | Bake patterns into fills |
| `flattenFilters()` | Bake filter effects |
| `flattenUseElements()` | Inline use references |
| `textToPath()` | Text to path geometry |
| `imageToPath()` | Trace raster to paths |
| `detectCollisions()` | GJK collision detection |
| `measureDistance()` | Distance between shapes |
| `validateSVG()` | W3C schema validation |
| `simplifyPath()` | Bezier simplification |
| `decomposeTransform()` | Matrix decomposition |

---

## License

MIT
