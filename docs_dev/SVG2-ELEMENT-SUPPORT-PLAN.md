# SVG 2.0 Element Support Plan

## Overview

This document outlines the implementation plan for supporting all SVG 2.0 elements in the svg-matrix library, with emphasis on flattening operations and arbitrary-precision mathematics.

## Element Categories

### 1. Basic Shapes (DONE)
Already implemented in `svg-flatten.js`:
- `rect` - Rectangle with optional rounded corners
- `circle` - Circle element
- `ellipse` - Ellipse element
- `line` - Line element
- `polyline` - Connected line segments
- `polygon` - Closed polygon
- `path` - General path with M, L, C, Q, A, Z commands

### 2. Container Elements (PARTIAL)
| Element | Status | Notes |
|---------|--------|-------|
| `g` | Partial | Transform inheritance works, need full flattening |
| `svg` | Partial | viewBox/preserveAspectRatio implemented |
| `defs` | Basic | Definition container |
| `symbol` | TODO | Needs resolution for `use` |
| `use` | TODO | Needs href resolution and transform composition |
| `switch` | TODO | Conditional processing |

### 3. Gradient Elements
| Element | Status | Notes |
|---------|--------|-------|
| `linearGradient` | Browser | Handled by browser rendering |
| `radialGradient` | Browser | Handled by browser rendering |
| `meshGradient` | **TODO** | SVG 2.0 - Requires rasterization/approximation |
| `stop` | Browser | Gradient color stops |

### 4. ClipPath and Masking (DONE/PARTIAL)
| Element | Status | Notes |
|---------|--------|-------|
| `clipPath` | **DONE** | Full implementation with Decimal.js precision |
| `mask` | TODO | Alpha/luminance masking |

### 5. Pattern
| Element | Status | Notes |
|---------|--------|-------|
| `pattern` | TODO | Tiled fill patterns |

### 6. Text Elements
| Element | Status | Notes |
|---------|--------|-------|
| `text` | TODO | Needs font metrics and path conversion |
| `tspan` | TODO | Text span with positioning |
| `textPath` | TODO | Text on a path |

### 7. Marker
| Element | Status | Notes |
|---------|--------|-------|
| `marker` | TODO | Path endpoint markers |

### 8. Image
| Element | Status | Notes |
|---------|--------|-------|
| `image` | TODO | Embedded/external images |

### 9. Filter Effects
| Element | Status | Notes |
|---------|--------|-------|
| `filter` | TODO | Filter container |
| `feBlend` | TODO | Blending modes |
| `feColorMatrix` | TODO | Color transformation |
| `feGaussianBlur` | TODO | Gaussian blur |
| ... | TODO | All other fe* elements |

---

## Implementation Priority

### Phase 1: Mesh Gradient Support (HIGH PRIORITY)
**Goal**: Enable flattening of SVG 2.0 mesh gradients

1. **Parse meshGradient structure**
   - Read meshrow/meshpatch/stop hierarchy
   - Parse Coons patch bezier paths
   - Extract color stops and opacity

2. **Rasterize mesh patches**
   - Implement bicubic Coons patch evaluation
   - Adaptive subdivision for smooth color transitions
   - Generate canvas/image data

3. **Integration with clipPath**
   - Apply clipPath to mesh gradient fills
   - Support both userSpaceOnUse and objectBoundingBox

### Phase 2: Text-to-Path Conversion
**Goal**: Convert text elements to paths for precise clipping

1. **Font loading and metrics**
   - Use opentype.js or fontkit for font parsing
   - Support web fonts and system fonts

2. **Text layout**
   - Handle text positioning (x, y, dx, dy)
   - Support text-anchor and dominant-baseline
   - Handle tspan offsets

3. **Path generation**
   - Convert glyphs to path data
   - Apply transforms

### Phase 3: Mask Flattening
**Goal**: Flatten mask effects into geometry

1. **Mask types**
   - Luminance masks
   - Alpha masks

2. **Implementation approach**
   - Convert mask to grayscale values
   - Apply as opacity modifier or geometry intersection

### Phase 4: Pattern Support
**Goal**: Flatten pattern fills

1. **Pattern parsing**
   - Read patternUnits and patternContentUnits
   - Handle pattern transforms

2. **Pattern instantiation**
   - Tile pattern across bounding box
   - Clip to element bounds

### Phase 5: Use/Symbol Resolution
**Goal**: Resolve use references

1. **Symbol lookup**
   - Find referenced symbol by href/xlink:href
   - Clone symbol content

2. **Transform composition**
   - Apply use element transforms
   - Handle viewBox on symbol

---

## Mesh Gradient Technical Details

### Coons Patch Structure

```
meshgradient
  gradientUnits="userSpaceOnUse|objectBoundingBox"
  x="start-x" y="start-y"
  type="bilinear|coons"

  meshrow
    meshpatch
      stop path="c x1,y1 x2,y2 x3,y3" style="stop-color:..."  (top edge)
      stop path="c x1,y1 x2,y2 x3,y3" style="stop-color:..."  (right edge)
      stop path="c x1,y1 x2,y2 x3,y3" style="stop-color:..."  (bottom edge)
      stop path="c x1,y1 x2,y2 x3,y3" style="stop-color:..."  (left edge)
```

### Color Interpolation

For **bilinear** type:
```
C(u,v) = (1-u)(1-v)C00 + u(1-v)C10 + (1-u)v*C01 + u*v*C11
```

For **coons** (bicubic) type:
- Uses Coons patch formula with bezier boundary curves
- Color is interpolated using tensor product surfaces

### Flattening Strategy

1. **Adaptive subdivision** - Subdivide patches until flat enough
2. **Rasterization** - Convert to pixel data at specified resolution
3. **Path approximation** - Generate filled paths with solid colors (for vector output)

---

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/mesh-gradient.js` | Mesh gradient parsing and rasterization |
| ~~`src/text-to-path.js`~~ | ~~Text element to path conversion~~ (REMOVED - requires proprietary fonts) |
| `src/mask-resolver.js` | Mask flattening |
| `src/pattern-resolver.js` | Pattern tiling and flattening |
| `src/use-resolver.js` | Use/symbol reference resolution |
| `src/svg-flatten.js` | Update to integrate new modules |
| `src/index.js` | Export new modules |

---

## Testing Strategy

1. **Unit tests** for each new module
2. **Browser verification** comparing our output to native rendering
3. **Precision tests** ensuring Decimal.js calculations are accurate
4. **Edge case tests** for degenerate inputs
5. **Integration tests** combining multiple features (e.g., mesh gradient + clipPath)

---

## Dependencies

- **Existing**: decimal.js (already included)
- ~~**For text**: opentype.js or fontkit (optional, for text-to-path)~~ (REMOVED - text-to-path feature dropped)
- **For testing**: Playwright (already used)

---

## Verification Approach

Following the established pattern:
1. Mathematical invariant tests
2. Browser visual comparison
3. Numerical precision verification
4. Edge case stress testing
