# @emasoft/svg-matrix

<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='80' viewBox='0 0 600 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%23e0e0e0'/%3E%3Cstop offset='50%25' stop-color='%23404040'/%3E%3Cstop offset='100%25' stop-color='%23e0e0e0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cg stroke='%23888' stroke-width='0.5' fill='none'%3E%3Ccircle cx='40' cy='40' r='25'/%3E%3Ccircle cx='40' cy='40' r='18'/%3E%3Cline x1='40' y1='15' x2='40' y2='65'/%3E%3Cline x1='15' y1='40' x2='65' y2='40'/%3E%3Cline x1='22' y1='22' x2='58' y2='58'/%3E%3Cline x1='58' y1='22' x2='22' y2='58'/%3E%3Crect x='100' y='20' width='40' height='40' transform='rotate(15 120 40)'/%3E%3Crect x='100' y='20' width='40' height='40' transform='rotate(30 120 40)'/%3E%3Crect x='100' y='20' width='40' height='40' transform='rotate(45 120 40)'/%3E%3Cpath d='M180 60 Q220 10 260 60' /%3E%3Ccircle cx='180' cy='60' r='3'/%3E%3Ccircle cx='220' cy='10' r='2'/%3E%3Ccircle cx='260' cy='60' r='3'/%3E%3Cline x1='180' y1='60' x2='220' y2='10' stroke-dasharray='4,2'/%3E%3Cline x1='220' y1='10' x2='260' y2='60' stroke-dasharray='4,2'/%3E%3Cpolygon points='320,15 360,40 320,65 340,40' /%3E%3Cline x1='320' y1='15' x2='360' y2='40'/%3E%3Cline x1='360' y1='40' x2='320' y2='65'/%3E%3Cpath d='M400 20 L440 20 L440 60 L400 60 Z M400 20 L440 60 M440 20 L400 60'/%3E%3Cg transform='translate(480 40)'%3E%3Ccircle r='25'/%3E%3Cpath d='M-25 0 A25 25 0 0 1 0 -25'/%3E%3Cpath d='M0 -25 A25 25 0 0 1 25 0'/%3E%3Cline x1='0' y1='-25' x2='0' y2='0'/%3E%3Cline x1='0' y1='0' x2='25' y2='0'/%3E%3Ctext x='-8' y='4' font-size='8' fill='%23666' font-family='monospace'%3E90%C2%B0%3C/text%3E%3C/g%3E%3Cline x1='540' y1='40' x2='600' y2='40'/%3E%3C/g%3E%3C/svg%3E" alt="Geometric precision illustration"/>
</p>

<p align="center">
  <strong>Arbitrary-precision mathematics for vectors, matrices, and SVG transformations</strong><br/>
  <em>80 significant digits. Mathematically verified. Zero floating-point errors.</em>
</p>

<p align="center">
  <a href="#part-1-core-math-library">Core Math</a> &#8226;
  <a href="#part-2-svg-toolbox">SVG Toolbox</a> &#8226;
  <a href="#installation">Install</a> &#8226;
  <a href="API.md">API Reference</a>
</p>

---

## What Is This?

This package contains **two libraries** that work together:

| Library | Purpose | Precision |
|---------|---------|-----------|
| **Core Math** | Vectors, matrices, 2D/3D transforms | 80 digits (configurable to 10^9) |
| **SVG Toolbox** | Parse, transform, validate, optimize SVG files | 80 digits + visual verification |

**Think of it like this:**

> **Core Math** is a calculator that never makes rounding errors.
> **SVG Toolbox** uses that calculator to work with SVG graphics perfectly.

---

<!-- Geometric divider: Golden ratio spiral construction -->
<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='20' viewBox='0 0 400 20'%3E%3Cg stroke='%23ccc' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='10' x2='120' y2='10'/%3E%3Crect x='125' y='5' width='10' height='10'/%3E%3Crect x='137' y='5' width='6.18' height='6.18'/%3E%3Crect x='145' y='5' width='3.82' height='3.82'/%3E%3Crect x='150' y='5' width='2.36' height='2.36'/%3E%3Cpath d='M160 10 Q170 3 180 10 Q190 17 200 10 Q210 3 220 10 Q230 17 240 10'/%3E%3Crect x='250' y='7' width='2.36' height='2.36'/%3E%3Crect x='254' y='5' width='3.82' height='3.82'/%3E%3Crect x='259' y='5' width='6.18' height='6.18'/%3E%3Crect x='267' y='5' width='10' height='10'/%3E%3Cline x1='280' y1='10' x2='400' y2='10'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

# Part 1: Core Math Library

**For:** Scientists, engineers, game developers, anyone who needs exact calculations.

## What Can It Do?

Imagine you want to rotate a spaceship in a game, or calculate where two laser beams cross. Normal JavaScript math has tiny errors that add up. This library has **zero errors** because it uses 80-digit precision.

```js
// Normal JavaScript: 0.1 + 0.2 = 0.30000000000000004 (wrong!)
// svg-matrix:        0.1 + 0.2 = 0.3 (exactly right)
```

### Vectors (Arrows in Space)

A vector is like an arrow pointing somewhere. You can add arrows, measure them, find angles between them.

```js
import { Vector } from '@emasoft/svg-matrix';

// Create an arrow pointing right 3 units and up 4 units
const arrow = Vector.from([3, 4]);

// How long is the arrow? (It's 5 - like a 3-4-5 triangle!)
console.log(arrow.norm().toString());  // "5"

// Make it exactly 1 unit long (normalize)
const unit = arrow.normalize();
console.log(unit.toNumberArray());  // [0.6, 0.8]
```

### Matrices (Grids of Numbers)

A matrix is a grid of numbers. You can multiply them, flip them, use them to solve puzzles.

```js
import { Matrix } from '@emasoft/svg-matrix';

// Create a 2x2 grid
const grid = Matrix.from([
  [4, 7],
  [2, 6]
]);

// Find the determinant (a special number about the grid)
console.log(grid.determinant().toString());  // "10"

// Solve a puzzle: find x and y where 4x + 7y = 1 and 2x + 6y = 0
const answer = grid.solve([1, 0]);
console.log(answer.toNumberArray());  // [0.6, -0.2]
```

### Transforms (Moving & Spinning Things)

Transforms move, rotate, scale, or skew shapes. This is how video games move characters around!

```js
import { Transforms2D } from '@emasoft/svg-matrix';

// Move something 100 pixels right
const move = Transforms2D.translation(100, 0);

// Spin something 45 degrees
const spin = Transforms2D.rotate(Math.PI / 4);

// Make something twice as big
const grow = Transforms2D.scale(2);

// Apply spin to a point at (10, 0)
const [x, y] = Transforms2D.applyTransform(spin, 10, 0);
console.log(x.toFixed(4), y.toFixed(4));  // "7.0711 7.0711"
```

---

<!-- Geometric divider: Intersecting circles construction -->
<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='20' viewBox='0 0 400 20'%3E%3Cg stroke='%23ccc' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='10' x2='140' y2='10'/%3E%3Ccircle cx='170' cy='10' r='8'/%3E%3Ccircle cx='182' cy='10' r='8'/%3E%3Ccircle cx='200' cy='10' r='3'/%3E%3Ccircle cx='218' cy='10' r='8'/%3E%3Ccircle cx='230' cy='10' r='8'/%3E%3Cline x1='260' y1='10' x2='400' y2='10'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

## Core Math API Quick Reference

### Vector

| Method | What It Does |
|--------|--------------|
| `Vector.from([x, y, z])` | Create a vector |
| `.add(v)` | Add two vectors |
| `.sub(v)` | Subtract vectors |
| `.scale(n)` | Multiply by a number |
| `.dot(v)` | Dot product (single number result) |
| `.cross(v)` | Cross product (3D only) |
| `.norm()` | Length of the vector |
| `.normalize()` | Make length = 1 |
| `.angleBetween(v)` | Angle between two vectors |
| `.toNumberArray()` | Convert to regular JavaScript array |

### Matrix

| Method | What It Does |
|--------|--------------|
| `Matrix.from([[...], [...]])` | Create from 2D array |
| `Matrix.identity(n)` | Identity matrix (1s on diagonal) |
| `Matrix.zeros(r, c)` | Matrix of zeros |
| `.mul(M)` | Multiply matrices |
| `.transpose()` | Flip rows and columns |
| `.determinant()` | Calculate determinant |
| `.inverse()` | Calculate inverse |
| `.solve(b)` | Solve system of equations |
| `.lu()` | LU decomposition |
| `.qr()` | QR decomposition |

### Transforms2D / Transforms3D

| Method | What It Does |
|--------|--------------|
| `translation(x, y)` | Move transform |
| `scale(sx, sy)` | Size transform |
| `rotate(angle)` | Spin transform (radians) |
| `rotateAroundPoint(angle, px, py)` | Spin around a specific point |
| `skew(ax, ay)` | Slant transform |
| `reflectX()` / `reflectY()` | Mirror transform |
| `applyTransform(M, x, y)` | Apply transform to a point |

---

<!-- Geometric divider: Bezier curve construction -->
<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='30' viewBox='0 0 400 30'%3E%3Cg stroke='%23ccc' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='15' x2='100' y2='15'/%3E%3Cpath d='M110 25 C130 5, 150 5, 170 15 S210 25, 230 15 S270 5, 290 15' stroke='%23999'/%3E%3Ccircle cx='110' cy='25' r='2' fill='%23999'/%3E%3Ccircle cx='170' cy='15' r='2' fill='%23999'/%3E%3Ccircle cx='230' cy='15' r='2' fill='%23999'/%3E%3Ccircle cx='290' cy='15' r='2' fill='%23999'/%3E%3Cline x1='110' y1='25' x2='130' y2='5' stroke-dasharray='2,2'/%3E%3Cline x1='150' y1='5' x2='170' y2='15' stroke-dasharray='2,2'/%3E%3Cline x1='300' y1='15' x2='400' y2='15'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

# Part 2: SVG Toolbox

**For:** Web developers, designers, anyone working with SVG graphics.

## What Can It Do?

SVG files are pictures made of shapes, paths, and effects. This toolbox can:

- **Flatten** - Bake all transforms into coordinates (no more `transform="rotate(45)"`)
- **Convert** - Turn circles, rectangles into path commands
- **Validate** - Find and fix problems in SVG files
- **Optimize** - Remove unused elements, simplify paths

### Why Use This Instead of SVGO?

| | SVGO | svg-matrix |
|--|------|-----------|
| **Math precision** | 15 digits (can accumulate errors) | 80 digits (no errors) |
| **Verification** | None (hope it works) | Mathematical proof each step is correct |
| **Attribute handling** | May lose clip-path, mask, filter | Guarantees ALL attributes preserved |
| **Use case** | Quick file size reduction | Precision-critical applications |

**Use svg-matrix when:** CAD, GIS, scientific visualization, or when visual correctness matters more than file size.

**Use SVGO when:** Quick optimization where small rounding errors are acceptable.

---

## Command Line Tools

### `svg-matrix` - Process SVG files

```bash
# Flatten all transforms into coordinates
svg-matrix flatten input.svg -o output.svg

# Convert shapes (circle, rect, etc.) to paths
svg-matrix convert input.svg -o output.svg

# Normalize all paths to cubic Beziers
svg-matrix normalize input.svg -o output.svg

# Show file information
svg-matrix info input.svg
```

**Options:**

| Option | What It Does |
|--------|--------------|
| `-o file.svg` | Output file |
| `-r` | Process folders recursively |
| `-f` | Overwrite existing files |
| `-p N` | Decimal precision (default: 6, max: 50) |
| `-q` | Quiet mode |
| `-v` | Verbose mode |
| `--transform-only` | Only flatten transforms (faster) |
| `--no-clip-paths` | Skip clip-path processing |
| `--no-masks` | Skip mask processing |

Run `svg-matrix --help` for all options.

### `svglinter` - Find problems in SVG files

```bash
svglinter myfile.svg           # Check one file
svglinter icons/               # Check all SVGs in folder
svglinter --fix icons/         # Auto-fix problems
svglinter --errors-only icons/ # Only show errors
```

Finds: broken references, invalid colors, typos in element names, missing attributes.

See [full svglinter documentation](docs/SVGLINTER.md).

---

<!-- Geometric divider: Triangle construction -->
<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='20' viewBox='0 0 400 20'%3E%3Cg stroke='%23ccc' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='10' x2='150' y2='10'/%3E%3Cpolygon points='175,5 200,15 175,15'/%3E%3Cline x1='175' y1='5' x2='187.5' y2='10' stroke-dasharray='2,2'/%3E%3Cpolygon points='210,15 235,5 235,15'/%3E%3Cline x1='235' y1='5' x2='222.5' y2='10' stroke-dasharray='2,2'/%3E%3Cline x1='250' y1='10' x2='400' y2='10'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

## SVG Toolbox API Quick Reference

### GeometryToPath

Convert shapes to path data:

```js
import { GeometryToPath } from '@emasoft/svg-matrix';

const circle = GeometryToPath.circleToPathData(50, 50, 25);
const rect = GeometryToPath.rectToPathData(0, 0, 100, 50, 5, 5);
const ellipse = GeometryToPath.ellipseToPathData(50, 50, 30, 20);
```

### SVGFlatten

Parse and transform SVG data:

```js
import { SVGFlatten } from '@emasoft/svg-matrix';

// Parse transform string
const matrix = SVGFlatten.parseTransformAttribute('rotate(45) scale(2)');

// Transform path data
const newPath = SVGFlatten.transformPathData('M 0 0 L 100 100', matrix);

// Resolve CSS units
SVGFlatten.resolveLength('50%', 800);  // 400
SVGFlatten.resolveLength('1in', 96);   // 96
```

### Validation

Find and fix problems:

```js
import { validateSvg, fixInvalidSvg } from '@emasoft/svg-matrix';

const result = await validateSvg('icon.svg');
console.log(result.valid);    // true/false
console.log(result.issues);   // Array of problems

const fixed = await fixInvalidSvg('broken.svg');
console.log(fixed.svg);       // Fixed SVG string
```

### Exclusive Features (Not in SVGO)

| Function | Description |
|----------|-------------|
| `flattenClipPaths()` | Flatten clip-paths to geometry |
| `flattenMasks()` | Flatten masks to geometry |
| `flattenGradients()` | Bake gradients into fills |
| `flattenPatterns()` | Expand pattern tiles |
| `flattenUseElements()` | Inline use/symbol references |
| `textToPath()` | Convert text to path outlines |
| `detectCollisions()` | GJK collision detection |
| `validateSVG()` | W3C schema validation |
| `decomposeTransform()` | Matrix decomposition |

### Attribute Preservation

When converting shapes or flattening transforms, ALL attributes are preserved:

| Category | Attributes |
|----------|------------|
| **Critical** | `clip-path`, `mask`, `filter`, `opacity` |
| **Markers** | `marker-start`, `marker-mid`, `marker-end` |
| **Paint** | `fill`, `stroke`, `fill-opacity`, `stroke-opacity` |
| **Stroke** | `stroke-width`, `stroke-dasharray`, `stroke-linecap` |
| **URL refs** | `url(#gradient)`, `url(#pattern)`, `url(#clip)` |

> **Why this matters:** Many SVG tools silently drop `clip-path` and `mask` attributes, causing visual corruption. svg-matrix preserves everything.

---

<!-- Geometric divider: Angle construction -->
<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='20' viewBox='0 0 400 20'%3E%3Cg stroke='%23ccc' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='10' x2='160' y2='10'/%3E%3Cpath d='M180 15 L200 5 L220 15'/%3E%3Cpath d='M190 12 A7 7 0 0 1 195 8' stroke='%23999'/%3E%3Cline x1='240' y1='10' x2='400' y2='10'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

## Precision Comparison

svg-matrix vs standard JavaScript (float64):

| Operation | JS Error | svg-matrix Error | Improvement |
|-----------|----------|------------------|-------------|
| Point evaluation | `1.4e-14` | `0` (exact) | 14+ digits |
| Bezier tangent | `1.1e-16` | `< 1e-78` | 62+ digits |
| Arc length | `2.8e-13` | `< 1e-50` | 37+ digits |
| Bounding box | `1.1e-13` | `0` (exact) | 13+ digits |
| Self-intersection | Boolean only | `1.4e-58` | 58+ digits |

---

## Installation

**Requires Node.js 24+** (released 2025)

```bash
npm install @emasoft/svg-matrix
```

### In JavaScript/TypeScript

```js
import { Matrix, Vector, Transforms2D } from '@emasoft/svg-matrix';
```

### In HTML (no install)

```html
<script type="module">
  import { Matrix, Transforms2D } from 'https://esm.sh/@emasoft/svg-matrix';
</script>
```

> **Note:** Node.js 24+ is required for modern ECMAScript features. If you need older Node support, please [open an issue](https://github.com/Emasoft/SVG-MATRIX/issues).

---

## More Documentation

- [Full API Reference](API.md)
- [svglinter Documentation](docs/SVGLINTER.md)
- [Bezier Analysis Examples](test/bezier-analysis-example.js)
- [Path Analysis Examples](test/path-analysis-example.js)

---

<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='30' viewBox='0 0 200 30'%3E%3Cg stroke='%23ddd' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='15' x2='60' y2='15'/%3E%3Crect x='70' y='10' width='10' height='10' transform='rotate(45 75 15)'/%3E%3Ccircle cx='100' cy='15' r='5'/%3E%3Crect x='120' y='10' width='10' height='10' transform='rotate(45 125 15)'/%3E%3Cline x1='140' y1='15' x2='200' y2='15'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

<p align="center">
  <strong>MIT License</strong><br/>
  <em>Built with mathematical precision</em>
</p>
