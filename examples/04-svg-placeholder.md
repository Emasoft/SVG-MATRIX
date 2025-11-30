# SVG-Specific Examples (04-08) - Placeholder

The examples 04-08 require the SVG-specific modules (SVGFlatten, PolygonClip, ClipPathResolver, MeshGradient, etc.) which are complex production modules. These examples would demonstrate:

## 04-svg-transforms.js
- Parsing SVG transform attributes
- Building Current Transformation Matrix (CTM) from element hierarchy
- Handling viewBox and preserveAspectRatio
- Converting shapes to paths with transforms applied

## 05-polygon-clipping.js
- Creating and manipulating polygons
- Boolean operations (intersection, union, difference)
- Point-in-polygon tests
- Convex hull computation

## 06-clippath-resolution.js
- Resolving clipPath elements
- Coordinate system transformations (userSpaceOnUse vs objectBoundingBox)
- Applying clip paths to shapes
- Generating clipped path data

## 07-mesh-gradient.js
- Parsing SVG 2.0 mesh gradient structure
- Coons patch evaluation for smooth color interpolation
- Rasterizing to canvas
- Polygon approximation for export to non-SVG formats

## 08-mask-pattern-use.js
- Mask resolution with luminance/alpha modes
- Pattern tiling and transformation
- Resolving &lt;use&gt; and &lt;symbol&gt; elements
- Handling nested references

## Creating Full Examples

To create working examples for these modules, you would need to:

1. Study the actual implementation in `src/svg-flatten.js`, `src/polygon-clip.js`, etc.
2. Create sample SVG structures or load actual SVG files
3. Demonstrate the API with realistic use cases
4. Show edge cases and error handling

The first three examples (01-03) demonstrate the core Matrix, Vector, and Transform APIs which are the foundation for all the SVG-specific functionality.

## Running the Core Examples

```bash
# Run the basic matrix/vector example
node examples/01-basic-matrix-vector.js

# Run 2D transforms example
node examples/02-2d-transforms.js

# Run 3D transforms example
node examples/03-3d-transforms.js
```

These examples are fully functional and demonstrate the arbitrary-precision transformation capabilities that underpin the SVG processing modules.
