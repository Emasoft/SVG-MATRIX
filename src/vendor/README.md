# Vendor Dependencies

This directory contains third-party code used by SVG-MATRIX for SVG 2.0 browser compatibility.

## Files

| File | Size | License | Author |
|------|------|---------|--------|
| inkscape-mesh-polyfill.js | ~35KB | GPLv3 | Tavmjong Bah |
| inkscape-mesh-polyfill.min.js | ~16KB | GPLv3 | Tavmjong Bah |
| inkscape-hatch-polyfill.js | ~10KB | CC0 | Valentin Ionita |
| inkscape-hatch-polyfill.min.js | ~5KB | CC0 | Valentin Ionita |

---

## inkscape-mesh-polyfill.js / inkscape-mesh-polyfill.min.js

**Source:** https://gitlab.com/Tavmjong/mesh.js/
**Author:** Tavmjong Bah
**License:** GNU General Public License version 3 or later (GPLv3+)
**Copyright:** 2017 Tavmjong Bah

### Description

JavaScript polyfill for SVG 2.0 mesh gradients. Renders mesh gradients to HTML5 Canvas and converts them to images for browser compatibility.

### Features

- Multi-patch grid support (multiple meshrows and meshpatches)
- Bezier curve edge parsing (l, L, c, C path commands)
- Adaptive tessellation via de Casteljau subdivision
- gradientTransform support (translate, rotate, scale, skew, matrix)
- Proper shape clipping via clipPath
- objectBoundingBox and userSpaceOnUse gradientUnits

### License Notice

This file is distributed under the GNU General Public License version 3 or later.
See https://www.gnu.org/licenses/gpl-3.0.html for the full license text.

**IMPORTANT:** When using SVG-MATRIX with the `--svg2-polyfills` option on SVGs
containing mesh gradients, the generated SVG files will contain this GPLv3-licensed
polyfill code embedded in a `<script>` element. Distribution of such files must
comply with GPLv3 terms.

### Usage in SVG-MATRIX

The polyfill is automatically embedded when:
1. The SVG contains `<meshgradient>` elements
2. The `--svg2-polyfills` CLI option is used

The polyfill runs in the browser at page load and:
1. Detects elements using mesh gradient fills
2. Rasterizes each mesh gradient to a Canvas
3. Converts the Canvas to a PNG data URL
4. Creates an `<image>` element with proper clipping
5. Replaces the original fill with the rasterized image

---

## inkscape-hatch-polyfill.js / inkscape-hatch-polyfill.min.js

**Source:** https://gitlab.com/inkscape/inkscape/-/tree/master/src/extension/internal/polyfill
**Author:** Valentin Ionita (2019)
**License:** CC0 / Public Domain
**Copyright:** None (dedicated to public domain)

### Description

JavaScript polyfill for SVG 2.0 hatch patterns. Converts SVG 2 `<hatch>` elements
to SVG 1.1 `<pattern>` elements for browser compatibility.

### Features

- Full SVG path command support (M, L, C, S, Q, T, A, H, V, Z)
- Both relative and absolute path coordinates
- objectBoundingBox and userSpaceOnUse coordinate systems
- Hatch rotation and transform support
- Multiple hatchpath elements with offset values
- Proper pitch and spacing calculations
- Pattern tiling and repetition

### License Notice

This file is dedicated to the public domain under CC0 (Creative Commons Zero).
See https://creativecommons.org/publicdomain/zero/1.0/ for details.

There are no restrictions on distribution or use of this polyfill.

### Usage in SVG-MATRIX

The polyfill is automatically embedded when:
1. The SVG contains `<hatch>` elements
2. The `--svg2-polyfills` CLI option is used

The polyfill runs in the browser at page load and:
1. Detects elements using hatch pattern fills
2. Calculates bounding boxes and pitch values
3. Generates equivalent `<pattern>` elements
4. Updates fill references to use the generated patterns

---

## Minified vs Full Versions

By default, SVG-MATRIX uses the minified polyfills for smaller file sizes:
- Mesh: ~16KB minified vs ~35KB full
- Hatch: ~5KB minified vs ~10KB full

Use `--no-minify-polyfills` to embed the full, readable versions (useful for debugging).
