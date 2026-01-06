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
  <a href="#svgm---svgo-compatible-optimizer-drop-in-replacement">svgm (SVGO replacement)</a> &#8226;
  <a href="#svgfonts---font-management-cli">svgfonts</a> &#8226;
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

| | SVGO | svgm (this package) |
|--|------|-----------|
| **Math precision** | 15 digits (can accumulate errors) | 80 digits (no errors) |
| **Verification** | None (hope it works) | Mathematical proof each step is correct |
| **Attribute handling** | May lose clip-path, mask, filter | Guarantees ALL attributes preserved |
| **CLI syntax** | `svgo input.svg -o out.svg` | `svgm input.svg -o out.svg` (identical!) |
| **Use case** | Quick file size reduction | Precision-critical applications |

**Drop-in replacement:** The `svgm` command uses the exact same syntax as SVGO. Just replace `svgo` with `svgm` in your scripts.

**Use svgm/svg-matrix when:** CAD, GIS, scientific visualization, animation, or when visual correctness matters.

**Use SVGO when:** Quick optimization where small rounding errors are acceptable.

---

## Command Line Tools

### `svgm` - SVGO-Compatible Optimizer (Drop-in Replacement)

A drop-in replacement for SVGO with identical syntax. Simply replace `svgo` with `svgm`:

```bash
# Basic optimization (same as SVGO)
svgm input.svg -o output.svg

# Optimize folder recursively
svgm -f ./icons/ -o ./optimized/ -r

# Multiple passes for maximum compression
svgm --multipass input.svg -o output.svg

# Pretty print output
svgm --pretty --indent 2 input.svg -o output.svg

# Set precision
svgm -p 2 input.svg -o output.svg

# Show available optimizations
svgm --show-plugins
```

**Options (SVGO-compatible):**

| Option | What It Does |
|--------|--------------|
| `-o <file>` | Output file or folder |
| `-f <folder>` | Input folder (batch mode) |
| `-r, --recursive` | Process folders recursively |
| `-p <n>` | Decimal precision |
| `--multipass` | Multiple optimization passes |
| `--pretty` | Pretty print output |
| `--indent <n>` | Indentation for pretty print |
| `-q, --quiet` | Suppress output |
| `--datauri <type>` | Output as data URI (base64, enc, unenc) |
| `--show-plugins` | List available optimizations |

**Default optimizations (matching SVGO preset-default):**

- Remove DOCTYPE, XML processing instructions, comments, metadata
- Remove editor namespaces (Inkscape, Illustrator, etc.)
- Cleanup IDs, attributes, numeric values
- Convert colors to shorter forms
- Collapse groups, merge paths
- Sort attributes for better gzip compression
- And 20+ more optimizations

Run `svgm --help` for all options.

### Embed External Dependencies

Make SVGs self-contained by embedding external resources as data URIs:

```bash
# Embed all external dependencies
svgm --embed input.svg -o output.svg

# Embed specific resource types
svgm --embed-images --embed-css --embed-fonts input.svg -o output.svg

# Embed external SVG references with mode selection
svgm --embed-external-svgs --embed-svg-mode extract input.svg -o output.svg

# Embed audio files (for interactive SVGs)
svgm --embed-audio input.svg -o output.svg

# Subset fonts to only include used characters (smaller file size)
svgm --embed-fonts --embed-subset-fonts input.svg -o output.svg
```

**Embed options:**

| Option | What It Does |
|--------|--------------|
| `--embed` | Enable all embedding (images, CSS, fonts, scripts, audio) |
| `--embed-images` | Embed raster images as data URIs |
| `--embed-external-svgs` | Embed referenced SVG files |
| `--embed-svg-mode <mode>` | How to embed SVGs: `extract` (symbols only) or `full` |
| `--embed-css` | Embed external stylesheets |
| `--embed-fonts` | Embed web fonts as base64 |
| `--embed-scripts` | Embed external JavaScript |
| `--embed-audio` | Embed audio files as data URIs |
| `--embed-subset-fonts` | Subset fonts to used characters only |
| `--embed-recursive` | Recursively resolve nested dependencies |
| `--embed-max-depth <n>` | Max recursion depth (default: 10) |
| `--embed-timeout <ms>` | Fetch timeout in milliseconds (default: 30000) |
| `--embed-on-missing <mode>` | Action on missing resource: `warn`, `fail`, or `skip` |

### Export Embedded Resources

Extract embedded resources from self-contained SVGs back to external files:

```bash
# Export all embedded resources to a folder
svgm --export input.svg -o output.svg --export-dir ./resources/

# Dry run - show what would be exported without writing files
svgm --export --export-dry-run input.svg

# Export only images
svgm --export --export-images input.svg -o output.svg --export-dir ./images/

# Extract resources without modifying the SVG
svgm --export --export-only input.svg --export-dir ./resources/

# Custom filename prefix for exported files
svgm --export --export-prefix myapp_ input.svg -o output.svg --export-dir ./assets/
```

**Export options:**

| Option | What It Does |
|--------|--------------|
| `--export` | Enable resource extraction mode |
| `--export-dir <path>` | Output directory for extracted files |
| `--export-prefix <str>` | Filename prefix for exported files |
| `--export-images` | Export embedded images only |
| `--export-audio` | Export embedded audio only |
| `--export-video` | Export embedded video only |
| `--export-scripts` | Export inline scripts to .js files |
| `--export-styles` | Export inline styles to .css files |
| `--export-fonts` | Export embedded fonts |
| `--export-only` | Extract files only, don't modify SVG |
| `--export-dry-run` | Preview extraction without writing files |
| `--export-ids <ids>` | Only export from specific element IDs |

### YAML Configuration

Instead of CLI flags, you can use a YAML configuration file:

```yaml
# svgm.yml
precision: 4
multipass: true
pretty: true
indent: 2

embed:
  images: true
  externalSVGs: true
  externalSVGMode: extract
  css: true
  fonts: true
  scripts: true
  audio: true
  subsetFonts: true
  recursive: true
  maxRecursionDepth: 10
  timeout: 30000
  onMissingResource: warn

export:
  outputDir: ./resources/
  filenamePrefix: resource_
  images: true
  audio: true
  video: true
  scripts: true
  styles: true
  fonts: true
  extractOnly: false
  dryRun: false
```

```bash
# Use config file
svgm -c svgm.yml input.svg -o output.svg
```

### Namespace Preservation

Preserve vendor-specific namespaces during optimization:

```bash
# Preserve Inkscape/Sodipodi namespaces (layers, guides, document settings)
svgm --preserve-ns inkscape input.svg -o output.svg

# Preserve multiple vendor namespaces
svgm --preserve-ns inkscape,illustrator input.svg -o output.svg

# Available namespaces: inkscape, sodipodi, illustrator, sketch, ai, serif, vectornator, figma
```

### SVG 2.0 Polyfills

Enable browser compatibility for SVG 2.0 features:

```bash
# Add polyfills for mesh gradients and hatches
svgm --svg2-polyfills input.svg -o output.svg

# Combine with namespace preservation
svgm --preserve-ns inkscape --svg2-polyfills input.svg -o output.svg
```

Supported SVG 2.0 features:
- **Mesh gradients** (`<meshGradient>`) - Rendered via canvas fallback
- **Hatches** (`<hatch>`) - Converted to SVG 1.1 patterns

---

### `svg-matrix` - Advanced SVG Processing

For precision-critical operations beyond simple optimization:

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

---

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

### `svgfonts` - Font Management CLI

Dedicated tool for SVG font operations: embedding, extraction, replacement, and analysis.

```bash
# List all fonts used in an SVG
svgfonts list icon.svg

# Embed external fonts as base64 data URIs
svgfonts embed icon.svg -o icon-embedded.svg

# Embed with character subsetting (smaller file size)
svgfonts embed --subset icon.svg -o icon-embedded.svg

# Apply font replacement map
svgfonts replace --map fonts.yml icons/*.svg

# Interactive font management mode
svgfonts interactive document.svg

# Generate YAML replacement map template
svgfonts template > svgm_replacement_map.yml

# Extract embedded fonts to files
svgfonts extract --extract-dir ./fonts/ document.svg
```

**Commands:**

| Command | Description |
|---------|-------------|
| `list` | List fonts in SVG (family, type, size, used characters) |
| `embed` | Embed external fonts as base64 data URIs |
| `extract` | Extract embedded fonts to files |
| `replace` | Apply font replacement map from YAML |
| `interactive` | Interactive font management mode |
| `template` | Generate YAML replacement map template |

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file (default: overwrite input) |
| `-r, --recursive` | Process directories recursively |
| `--subset` | Only embed glyphs used in SVG (default) |
| `--full` | Embed complete font files |
| `--map <file>` | Path to replacement YAML |
| `--extract-dir <dir>` | Directory for extracted fonts |
| `--no-backup` | Skip backup creation |
| `--validate` | Validate SVG after operations |
| `--dry-run` | Preview changes without writing |

**Font Replacement Map (YAML):**

```yaml
# svgm_replacement_map.yml
replacements:
  "Arial": "Inter"
  "Times New Roman": "Noto Serif"
  "Courier New": "Fira Code"

options:
  default_embed: true
  default_subset: true
  fallback_source: "google"
  auto_download: true
```

Use environment variable `SVGM_REPLACEMENT_MAP` to set default map path.

Run `svgfonts --help` for all options.

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
import { validateSVG, fixInvalidSVG } from '@emasoft/svg-matrix';

const result = await validateSVG('icon.svg');
console.log(result.valid);    // true/false
console.log(result.issues);   // Array of problems

const fixed = await fixInvalidSVG('broken.svg');
console.log(fixed.svg);       // Fixed SVG string
```

### Inkscape Support Module

```javascript
import { InkscapeSupport } from '@emasoft/svg-matrix';

// Check if element is an Inkscape layer
InkscapeSupport.isInkscapeLayer(element);

// Find all layers in document
const layers = InkscapeSupport.findLayers(doc);

// Get document settings from sodipodi:namedview
const settings = InkscapeSupport.getNamedViewSettings(doc);
```

### SVG 2.0 Polyfills Module

```javascript
import { SVG2Polyfills } from '@emasoft/svg-matrix';

// Detect SVG 2.0 features in document
const features = SVG2Polyfills.detectSVG2Features(doc);

// Inject polyfills into document
SVG2Polyfills.injectPolyfills(doc);
```

### Embedding and Exporting Resources

```js
import { embedExternalDependencies, exportEmbeddedResources } from '@emasoft/svg-matrix';

// Embed external resources into SVG
const embedded = await embedExternalDependencies(svgString, {
  basePath: '/path/to/file.svg',
  embedImages: true,
  embedFonts: true,
  embedCSS: true,
  embedScripts: true,
  embedAudio: true,
  subsetFonts: true,
  onMissingResource: 'warn',
  timeout: 30000,
});

// Export embedded resources back to external files
const result = await exportEmbeddedResources(embeddedSvg, {
  outputDir: './extracted/',
  filenamePrefix: 'resource_',
  extractImages: true,
  extractAudio: true,
  extractVideo: true,
  extractScripts: true,
  extractStyles: true,
  extractFonts: true,
  extractOnly: false,  // true = extract without modifying SVG
  dryRun: false,       // true = preview only, don't write files
  elementIds: null,    // filter by element IDs
  onProgress: (phase, current, total) => console.log(`${phase}: ${current}/${total}`),
});

console.log(result.extractedFiles);  // Array of extracted file info
console.log(result.summary);         // { images, audio, scripts, stylesheets, fonts, totalSize }
console.log(result.doc);             // Modified SVG string (null if extractOnly)
```

---

## SVG Embedding Options

When using SVG files in web pages, the embedding method affects what features work:

| Embedding Method | Animation (SMIL) | JavaScript | Audio | Use Case |
|------------------|------------------|------------|-------|----------|
| `<img src="file.svg">` | Yes | No | No | Static display, icons |
| `<object data="file.svg">` | Yes | Yes | No* | Interactive SVGs |
| `<embed src="file.svg">` | Yes | Yes | No* | Legacy support |
| `<iframe src="file.svg">` | Yes | Yes | No* | Isolated context |
| Inline `<svg>...</svg>` | Yes | Yes | No* | Full DOM access |
| Standalone (file://) | Yes | Yes | No | Direct file viewing |
| Standalone (http://) | Yes | Yes | No* | Web server |

*Audio requires user interaction due to browser autoplay policies.

### SVG Audio Playback Limitations

Modern browsers (Chrome, Firefox, Safari) enforce strict autoplay policies that significantly limit audio playback in SVG files:

| Scenario | Protocol | Example | Audio |
|----------|----------|---------|-------|
| Standalone SVG | `file://` | `file:///path/to/sample.svg` | ❌ **Blocked** |
| Standalone SVG | `http://` | `http://localhost:8080/sample.svg` | ❌ **Blocked** |
| HTML with hardcoded audio data URIs | `file://` | `file:///path/to/sample.html` | ❌ **Blocked** (even after click) |
| HTML with hardcoded audio data URIs | `http://` | `http://localhost:8080/sample.html` | ❌ **Blocked** (even after click) |
| HTML extracts audio from SVG dynamically | `file://` | `file:///path/to/sample.html` | ✅ **Works** (after click) |
| HTML extracts audio from SVG dynamically | `http://` | `http://localhost:8080/sample.html` | ✅ **Works** (after click) |

**Key findings:**
- Audio elements inside SVG `<foreignObject>` are blocked by browsers regardless of protocol or embedding method
- Audio sources must be set **dynamically** (not hardcoded in HTML) for playback to work
- Empty `<audio>` elements + dynamic `src` assignment on load + `play()` on click = success
- Hardcoded data URIs in HTML `<source>` tags fail even with user click
- There is no workaround for truly autonomous SVG audio playback

**Technical reasons:**
1. SVG has no native `<audio>` element - audio requires HTML `<foreignObject>`
2. Browser autoplay policies block audio without direct user gesture
3. Click events inside SVG don't propagate as "trusted" user gestures for audio
4. This is a browser security feature, not an SVG limitation

**Recommended approach for SVG with audio:**

Extract audio sources from the SVG at runtime and play them via HTML `<audio>` elements. This keeps the SVG file unchanged while enabling audio playback. See `samples/SVG_WITH_EMBEDDED_AUDIO/test-embed-with-audio.html` for a complete working example.

```html
<!-- HTML wrapper that extracts audio from SVG -->
<div class="player-container">
  <object id="svgObject" data="animation.svg" type="image/svg+xml"></object>
  <div class="click-overlay" id="overlay">Click to Play</div>
</div>
<audio id="audio_external" preload="auto"></audio>

<script>
const svgObject = document.getElementById('svgObject');
const audio = document.getElementById('audio_external');
let svgRoot = null;

// On SVG load: pause animation and extract audio source
svgObject.addEventListener('load', function() {
  const svgDoc = svgObject.contentDocument;
  svgRoot = svgDoc.documentElement;
  svgRoot.pauseAnimations();  // Pause SMIL animation

  // Extract audio source from SVG (audio data stays in SVG file)
  const svgAudio = svgDoc.getElementById('audio1');
  if (svgAudio) {
    const source = svgAudio.querySelector('source');
    if (source) audio.src = source.src;  // Copy data URI to HTML audio
  }
});

// On user click: start animation and audio together
document.getElementById('overlay').addEventListener('click', function() {
  this.style.display = 'none';
  svgRoot.unpauseAnimations();  // Resume SMIL animation
  audio.play();                  // Play audio from HTML context
});
</script>
```

This approach:
1. Keeps SVG file unchanged (read-only) - audio data URIs remain in SVG
2. Extracts audio sources at runtime to HTML `<audio>` elements
3. Pauses SMIL animation until user clicks
4. Starts animation and audio simultaneously for perfect sync
5. Audio plays from HTML context where browser allows it

### Audio Alternatives Research (2024-2025)

Extensive testing confirms there is **no way to bypass Chrome's autoplay policy** without user interaction. This is by design for user experience.

#### What Doesn't Work

| Method | Status | Why It Fails |
|--------|--------|--------------|
| SVG 2.0 native `<audio>` | ❌ | Same autoplay restrictions apply |
| SMIL `<audio>` element | ❌ | Poor browser support + autoplay blocked |
| `<foreignObject>` bypass | ❌ | No special privileges for embedded HTML |
| Web Audio API (AudioContext) | ❌ | Starts in "suspended" state, same restrictions |
| CSS audio / `background-sound` | ❌ | Does not exist in any specification |
| Data URIs / Blob URLs | ❌ | Encoding method doesn't affect autoplay policy |
| SVG `onload` event | ❌ | Not considered a user gesture |
| SMIL animation `beginEvent` | ❌ | Animation events are not user gestures |
| `xlink:href` to audio file | ❌ | Creates link, doesn't trigger playback |

#### What Works

| Method | Status | Notes |
|--------|--------|-------|
| User click/touch/keydown | ✅ | **Mandatory** - no exceptions |
| HTML wrapper with dynamic audio extraction | ✅ | **Best practice** (see example above) |
| PWA (Progressive Web App) | ✅ | Desktop only, requires user to install app |
| Media Engagement Index (MEI) | ⚠️ | Chrome-only, long-term strategy |

#### Media Engagement Index (MEI)

Chrome tracks media consumption per domain. After meeting these criteria, autoplay may be allowed on future visits:
- User plays media for >7 seconds
- Audio is unmuted
- Tab is active and visible
- Video element is >200x140 pixels

This is a **long-term strategy** for apps with repeat users, not an immediate solution.

#### Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| User gesture required | ✅ | ✅ | ✅ | ✅ |
| Web Audio API | ✅ | ✅ | ⚠️ iOS quirks | ✅ |
| Data URI audio | ✅ | ⚠️ >1MB issues | ✅ | ✅ |
| MEI autoplay | ✅ | ❌ | ❌ | ✅ |
| PWA autoplay | ✅ | ⚠️ | ⚠️ | ✅ |

**Conclusion:** User interaction is mandatory. The HTML wrapper approach with dynamic audio extraction (`test-embed-with-audio.html`) is the industry best practice recommended by browser vendors.

---

### Exclusive Features (Not in SVGO)

| Function | Description |
|----------|-------------|
| `flattenClipPaths()` | Flatten clip-paths to geometry |
| `flattenMasks()` | Flatten masks to geometry |
| `flattenGradients()` | Bake gradients into fills |
| `flattenPatterns()` | Expand pattern tiles |
| `flattenUseElements()` | Inline use/symbol references |
| `embedExternalDependencies()` | Embed external resources as data URIs |
| `exportEmbeddedResources()` | Extract embedded resources to files |
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

### In HTML (ESM via CDN)

```html
<script type="module">
  import { Matrix, Transforms2D } from 'https://esm.sh/@emasoft/svg-matrix';
</script>
```

### Browser Bundles (Self-Contained)

Three pre-bundled libraries are available for direct browser use via CDN:

| Bundle | Size | Purpose | Global Variable |
|--------|------|---------|-----------------|
| `svg-matrix.min.js` | ~45KB | Math only (Matrix, Vector, Transforms) | `SVGMatrixLib` |
| `svg-toolbox.min.js` | ~120KB | SVG manipulation (browser-compatible subset) | `SVGToolbox` |
| `svgm.min.js` | ~150KB | Complete library (math + toolbox) | `SVGM` |

**Math Library (SVGMatrixLib):**

```html
<script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-matrix.min.js"></script>
<script>
  // Note: Uses SVGMatrixLib to avoid conflict with native browser SVGMatrix
  const { Matrix, Vector, Transforms2D } = SVGMatrixLib;

  // Rotate a point around the origin
  const rotation = Transforms2D.rotate(Math.PI / 4);
  const [x, y] = Transforms2D.applyTransform(rotation, 10, 0);
  console.log('Rotated point:', x.toFixed(4), y.toFixed(4)); // 7.0711 7.0711
</script>
```

**SVG Toolbox (SVGToolbox):**

```html
<script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svg-toolbox.min.js"></script>
<script>
  const { GeometryToPath, SVGFlatten, validateSVG } = SVGToolbox;

  // Convert circle to path
  const circlePath = GeometryToPath.circleToPathData(50, 50, 25);
  console.log('Circle as path:', circlePath);

  // Parse transform string
  const matrix = SVGFlatten.parseTransformAttribute('rotate(45) scale(2)');
</script>
```

**Complete Library (SVGM):**

```html
<script src="https://cdn.jsdelivr.net/npm/@emasoft/svg-matrix/dist/svgm.min.js"></script>
<script>
  // Access both math and toolbox
  const { Matrix, Vector, Transforms2D } = SVGM;
  const { GeometryToPath, SVGFlatten } = SVGM;

  // Use any functionality from either library
  const v = Vector.from([3, 4]);
  console.log('Vector length:', v.norm().toString()); // 5
</script>
```

> **Note:** Node.js 24+ is required for CLI tools and server-side usage. Browser bundles work in all modern browsers (ES2020+). If you need older Node support, please [open an issue](https://github.com/Emasoft/SVG-MATRIX/issues).

---

## More Documentation

- [Full API Reference](API.md)
- [svglinter Documentation](docs/SVGLINTER.md)
- [Bezier Analysis Examples](test/bezier-analysis-example.js)
- [Path Analysis Examples](test/path-analysis-example.js)

---

## Third-Party Licenses

This project is licensed under the MIT License (see [LICENSE](LICENSE)).

### SVG 2.0 Polyfill Dependencies

When using the `--svg2-polyfills` option with `svgm` or `svg-matrix`, the following third-party code is embedded in the output SVG:

**Inkscape mesh.js Polyfill** by Tavmjong Bah

- **Purpose:** Provides browser compatibility for SVG 2.0 mesh gradients via canvas fallback
- **License:** GNU General Public License version 3 or later (GPLv3)
- **Source:** [https://gitlab.com/Tavmjong/mesh.js/](https://gitlab.com/Tavmjong/mesh.js/)
- **Location:** `src/vendor/inkscape-mesh-polyfill.js`

**Important:** When you use `--svg2-polyfills`, the generated SVG file will contain GPLv3-licensed JavaScript code. This means:
- The output SVG file is subject to GPLv3 terms
- If you distribute the SVG, you must provide source code access as required by GPLv3
- Without `--svg2-polyfills`, all generated files remain under MIT license

---

<p align="center">
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='30' viewBox='0 0 200 30'%3E%3Cg stroke='%23ddd' stroke-width='0.5' fill='none'%3E%3Cline x1='0' y1='15' x2='60' y2='15'/%3E%3Crect x='70' y='10' width='10' height='10' transform='rotate(45 75 15)'/%3E%3Ccircle cx='100' cy='15' r='5'/%3E%3Crect x='120' y='10' width='10' height='10' transform='rotate(45 125 15)'/%3E%3Cline x1='140' y1='15' x2='200' y2='15'/%3E%3C/g%3E%3C/svg%3E" alt=""/>
</p>

<p align="center">
  <strong>MIT License</strong><br/>
  <em>Built with mathematical precision</em>
</p>
