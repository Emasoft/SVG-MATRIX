# SVGPathTools Complete API Reference

This document provides a comprehensive reference for all public functions, methods, and classes in the svgpathtools library.

---

## Table of Contents

1. [Public API Exports](#public-api-exports)
2. [Path Segment Classes](#path-segment-classes)
   - [Line](#class-line)
   - [QuadraticBezier](#class-quadraticbezier)
   - [CubicBezier](#class-cubicbezier)
   - [Arc](#class-arc)
3. [Path Class](#class-path)
4. [Path Construction Functions](#path-construction-functions)
5. [Bezier Functions](#bezier-functions)
6. [Polynomial Tools](#polynomial-tools)
7. [Miscellaneous Utilities](#miscellaneous-utilities)
8. [SVG Parsing Functions](#svg-parsing-functions)
9. [SVG Writing Functions](#svg-writing-functions)
10. [Document Handling](#document-handling)

---

## Public API Exports

The svgpathtools module exports the following components:

### Bezier Operations
- `bezier_point` - Evaluate Bezier curve at parameter t
- `bezier2polynomial` - Convert Bezier to polynomial form
- `polynomial2bezier` - Convert polynomial to Bezier
- `split_bezier` - Split Bezier curve at parameter t
- `bezier_bounding_box` - Calculate bounding box
- `bezier_intersections` - Find intersections between two Bezier curves
- `bezier_by_line_intersections` - Find Bezier-line intersections

### Path Classes & Functions
- `Path` - Container for path segments
- `Line` - Linear segment
- `QuadraticBezier` - Quadratic Bezier segment
- `CubicBezier` - Cubic Bezier segment
- `Arc` - Elliptical arc segment
- `bezier_segment` - Create appropriate Bezier segment from control points
- `is_bezier_segment` - Check if object is a Bezier segment
- `is_path_segment` - Check if object is any path segment
- `is_bezier_path` - Check if path contains only Bezier segments
- `concatpaths` - Concatenate multiple paths
- `poly2bez` - Convert polynomial to Bezier
- `bpoints2bezier` - Convert control points to Bezier
- `closest_point_in_path` - Find closest point on path to given point
- `farthest_point_in_path` - Find farthest point on path from given point
- `path_encloses_pt` - Check if path encloses a point
- `bbox2path` - Convert bounding box to rectangular path
- `polygon` - Create closed polygon path
- `polyline` - Create open polyline path

### Parsing & Output
- `parse_path` - Parse SVG path d-string
- `disvg` - Display SVG file (opens in browser)
- `wsvg` - Write SVG file to disk
- `paths2Drawing` - Create svgwrite.Drawing object

### Mathematical Tools
- `polyroots` - Find polynomial roots
- `polyroots01` - Find polynomial roots in [0,1]
- `rational_limit` - Compute limit of rational function
- `real` - Extract real part
- `imag` - Extract imaginary part

### Utilities
- `hex2rgb` - Convert hex color to RGB tuple
- `rgb2hex` - Convert RGB tuple to hex color
- `smoothed_path` - Create smoothed path
- `smoothed_joint` - Create smooth joint between segments
- `is_differentiable` - Check if path is differentiable
- `kinks` - Find kinks (non-differentiable points) in path

### Document Handling
- `Document` - SVG document class
- `CONVERSIONS` - Element conversion dictionary
- `CONVERT_ONLY_PATHS` - Flag for path-only conversion
- `SVG_GROUP_TAG` - SVG group tag constant
- `SVG_NAMESPACE` - SVG namespace URI
- `SaxDocument` - SAX-based document parser

### Optional Imports (require additional dependencies)
- `svg2paths` - Extract paths from SVG file
- `svg2paths2` - Extract paths with attributes
- `svgstr2paths` - Extract paths from SVG string

---

## Path Segment Classes

### Class: Line

Represents a straight line segment between two points.

#### Constructor

```python
Line(start, end)
```

**Parameters:**
- `start` (complex) - Starting point
- `end` (complex) - Ending point

#### Methods

##### `__hash__() -> int`
Returns hash of the line segment.

##### `__repr__() -> str`
Returns string representation.

##### `__eq__(other) -> bool`
Checks equality with another segment.

##### `__ne__(other) -> bool`
Checks inequality with another segment.

##### `__getitem__(item) -> complex`
Returns control point by index (0 or 1).

**Parameters:**
- `item` (int) - Index (0 for start, 1 for end)

**Returns:** complex number representing the control point

##### `__len__() -> int`
Returns 2 (number of control points).

##### `joins_smoothly_with(previous, wrt_parameterization=False) -> bool`
Checks if segment joins smoothly with previous segment.

**Parameters:**
- `previous` - Previous segment
- `wrt_parameterization` (bool, default=False) - Check tangent magnitude continuity

**Returns:** bool indicating smooth join

##### `point(t) -> complex`
Evaluates curve at parameter t ∈ [0,1].

**Parameters:**
- `t` (float) - Parameter value in [0,1]

**Returns:** complex number representing point on curve

##### `points(ts) -> array`
Batch evaluation at multiple parameters.

**Parameters:**
- `ts` (array-like) - Array of parameter values

**Returns:** numpy array of complex numbers

##### `length(t0=0, t1=1, error=None, min_depth=None) -> float`
Returns arc length between parameters.

**Parameters:**
- `t0` (float, default=0) - Start parameter
- `t1` (float, default=1) - End parameter
- `error` (float, optional) - Error tolerance for numerical integration
- `min_depth` (int, optional) - Minimum recursion depth

**Returns:** float arc length

##### `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5) -> float`
Inverse arc length: returns t for given length s.

**Parameters:**
- `s` (float) - Arc length from start
- `s_tol` (float, default=1e-12) - Tolerance for length
- `maxits` (int, default=10000) - Maximum iterations
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float parameter t

##### `bpoints() -> tuple[complex, complex]`
Returns control points (start, end).

**Returns:** tuple of two complex numbers

##### `poly(return_coeffs=False) -> np.poly1d | tuple`
Returns polynomial representation.

**Parameters:**
- `return_coeffs` (bool, default=False) - Return coefficients instead of poly1d

**Returns:** np.poly1d object or tuple of coefficients

##### `derivative(t=None, n=1) -> complex`
Returns nth derivative at t.

**Parameters:**
- `t` (float, optional) - Parameter value (None returns symbolic derivative)
- `n` (int, default=1) - Derivative order

**Returns:** complex number or derivative function

##### `unit_tangent(t=None) -> complex`
Returns unit tangent vector.

**Parameters:**
- `t` (float, optional) - Parameter value

**Returns:** complex number with magnitude 1

##### `normal(t=None) -> complex`
Returns right-hand rule unit normal vector.

**Parameters:**
- `t` (float, optional) - Parameter value

**Returns:** complex number with magnitude 1

##### `curvature(t) -> float`
Returns curvature (always 0 for lines).

**Parameters:**
- `t` (float) - Parameter value

**Returns:** 0.0

##### `reversed() -> Line`
Returns segment with reversed orientation.

**Returns:** new Line object

##### `intersect(other_seg, tol=1e-12) -> list[tuple]`
Returns intersection parameters [(t1, t2), ...].

**Parameters:**
- `other_seg` - Other segment to intersect with
- `tol` (float, default=1e-12) - Tolerance for intersection detection

**Returns:** list of tuples (t1, t2) where this.point(t1) ≈ other.point(t2)

##### `bbox() -> tuple`
Returns bounding box (xmin, xmax, ymin, ymax).

**Returns:** tuple of four floats

##### `point_to_t(point) -> float | None`
Returns parameter t if point lies on segment.

**Parameters:**
- `point` (complex) - Point to test

**Returns:** float parameter or None if point not on segment

##### `cropped(t0, t1) -> Line`
Returns cropped copy from t0 to t1.

**Parameters:**
- `t0` (float) - Start parameter
- `t1` (float) - End parameter

**Returns:** new Line object

##### `split(t) -> tuple[Line, Line]`
Splits at parameter t.

**Parameters:**
- `t` (float) - Split parameter

**Returns:** tuple of two Line objects

##### `radialrange(origin, return_all_global_extrema=False) -> tuple`
Returns distance extrema relative to origin.

**Parameters:**
- `origin` (complex) - Origin point
- `return_all_global_extrema` (bool, default=False) - Return all extrema

**Returns:** tuple ((d_min, t_min), (d_max, t_max))

##### `rotated(degs, origin=None) -> Line`
Returns rotated copy.

**Parameters:**
- `degs` (float) - Rotation angle in degrees (counter-clockwise)
- `origin` (complex, optional) - Center of rotation (default: 0+0j)

**Returns:** new Line object

##### `translated(z0) -> Line`
Returns translated copy.

**Parameters:**
- `z0` (complex) - Translation vector

**Returns:** new Line object

##### `scaled(sx, sy=None, origin=0j) -> Line`
Returns scaled copy.

**Parameters:**
- `sx` (float) - Scale factor for x-axis
- `sy` (float, optional) - Scale factor for y-axis (default: same as sx)
- `origin` (complex, default=0j) - Center of scaling

**Returns:** new Line object

---

### Class: QuadraticBezier

Represents a quadratic Bezier curve with one control point.

#### Constructor

```python
QuadraticBezier(start, control, end)
```

**Parameters:**
- `start` (complex) - Starting point
- `control` (complex) - Control point
- `end` (complex) - Ending point

#### Methods

##### `__hash__() -> int`
Returns hash of the quadratic Bezier segment.

##### `__repr__() -> str`
Returns string representation.

##### `__eq__(other) -> bool`
Checks equality with another segment.

##### `__ne__(other) -> bool`
Checks inequality with another segment.

##### `__getitem__(item) -> complex`
Returns control point by index (0, 1, or 2).

**Parameters:**
- `item` (int) - Index (0=start, 1=control, 2=end)

**Returns:** complex number representing the control point

##### `__len__() -> int`
Returns 3 (number of control points).

##### `is_smooth_from(previous, warning_on=True) -> bool`
Checks smooth joining (for d-string creation).

**Parameters:**
- `previous` - Previous segment
- `warning_on` (bool, default=True) - Enable warnings

**Returns:** bool indicating smooth join

##### `joins_smoothly_with(previous, wrt_parameterization=False, error=0) -> bool`
Checks tangent continuity with previous segment.

**Parameters:**
- `previous` - Previous segment
- `wrt_parameterization` (bool, default=False) - Check tangent magnitude
- `error` (float, default=0) - Tolerance for comparison

**Returns:** bool indicating smooth join

##### `point(t) -> complex`
Evaluates curve at parameter t.

**Parameters:**
- `t` (float) - Parameter value in [0,1]

**Returns:** complex number representing point on curve

##### `points(ts) -> array`
Batch evaluation at multiple parameters.

**Parameters:**
- `ts` (array-like) - Array of parameter values

**Returns:** numpy array of complex numbers

##### `length(t0=0, t1=1, error=None, min_depth=None) -> float`
Arc length computation.

**Parameters:**
- `t0` (float, default=0) - Start parameter
- `t1` (float, default=1) - End parameter
- `error` (float, optional) - Error tolerance
- `min_depth` (int, optional) - Minimum recursion depth

**Returns:** float arc length

##### `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5) -> float`
Inverse arc length.

**Parameters:**
- `s` (float) - Arc length from start
- `s_tol` (float, default=1e-12) - Tolerance
- `maxits` (int, default=10000) - Maximum iterations
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float parameter t

##### `bpoints() -> tuple`
Returns (start, control, end).

**Returns:** tuple of three complex numbers

##### `poly(return_coeffs=False) -> np.poly1d | tuple`
Polynomial representation.

**Parameters:**
- `return_coeffs` (bool, default=False) - Return coefficients instead of poly1d

**Returns:** np.poly1d object or tuple of coefficients

##### `derivative(t, n=1) -> complex`
Returns nth derivative.

**Parameters:**
- `t` (float) - Parameter value
- `n` (int, default=1) - Derivative order

**Returns:** complex number representing derivative

##### `unit_tangent(t) -> complex`
Returns unit tangent.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `normal(t) -> complex`
Returns unit normal.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `curvature(t) -> float`
Returns curvature.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** float curvature value

##### `reversed() -> QuadraticBezier`
Returns reversed segment.

**Returns:** new QuadraticBezier object

##### `intersect(other_seg, tol=1e-12) -> list[tuple]`
Finds intersections.

**Parameters:**
- `other_seg` - Other segment to intersect with
- `tol` (float, default=1e-12) - Tolerance for intersection detection

**Returns:** list of tuples (t1, t2)

##### `bbox() -> tuple`
Returns bounding box.

**Returns:** tuple (xmin, xmax, ymin, ymax)

##### `split(t) -> tuple[QuadraticBezier, QuadraticBezier]`
Splits at parameter.

**Parameters:**
- `t` (float) - Split parameter

**Returns:** tuple of two QuadraticBezier objects

##### `cropped(t0, t1) -> QuadraticBezier`
Returns cropped segment.

**Parameters:**
- `t0` (float) - Start parameter
- `t1` (float) - End parameter

**Returns:** new QuadraticBezier object

##### `radialrange(origin, return_all_global_extrema=False) -> tuple`
Distance extrema.

**Parameters:**
- `origin` (complex) - Origin point
- `return_all_global_extrema` (bool, default=False) - Return all extrema

**Returns:** tuple ((d_min, t_min), (d_max, t_max))

##### `rotated(degs, origin=None) -> QuadraticBezier`
Returns rotated copy.

**Parameters:**
- `degs` (float) - Rotation angle in degrees
- `origin` (complex, optional) - Center of rotation

**Returns:** new QuadraticBezier object

##### `translated(z0) -> QuadraticBezier`
Returns translated copy.

**Parameters:**
- `z0` (complex) - Translation vector

**Returns:** new QuadraticBezier object

##### `scaled(sx, sy=None, origin=0j) -> QuadraticBezier`
Returns scaled copy.

**Parameters:**
- `sx` (float) - Scale factor for x-axis
- `sy` (float, optional) - Scale factor for y-axis
- `origin` (complex, default=0j) - Center of scaling

**Returns:** new QuadraticBezier object

---

### Class: CubicBezier

Represents a cubic Bezier curve with two control points.

#### Constructor

```python
CubicBezier(start, control1, control2, end)
```

**Parameters:**
- `start` (complex) - Starting point
- `control1` (complex) - First control point
- `control2` (complex) - Second control point
- `end` (complex) - Ending point

#### Methods

##### `__hash__() -> int`
Returns hash of the cubic Bezier segment.

##### `__repr__() -> str`
Returns string representation.

##### `__eq__(other) -> bool`
Checks equality with another segment.

##### `__ne__(other) -> bool`
Checks inequality with another segment.

##### `__getitem__(item) -> complex`
Returns control point by index (0, 1, 2, or 3).

**Parameters:**
- `item` (int) - Index (0=start, 1=control1, 2=control2, 3=end)

**Returns:** complex number representing the control point

##### `__len__() -> int`
Returns 4 (number of control points).

##### `is_smooth_from(previous, warning_on=True) -> bool`
Checks smooth joining.

**Parameters:**
- `previous` - Previous segment
- `warning_on` (bool, default=True) - Enable warnings

**Returns:** bool indicating smooth join

##### `joins_smoothly_with(previous, wrt_parameterization=False) -> bool`
Checks tangent continuity.

**Parameters:**
- `previous` - Previous segment
- `wrt_parameterization` (bool, default=False) - Check tangent magnitude

**Returns:** bool indicating smooth join

##### `point(t) -> complex`
Evaluates via Horner's rule.

**Parameters:**
- `t` (float) - Parameter value in [0,1]

**Returns:** complex number representing point on curve

##### `points(ts) -> array`
Batch evaluation.

**Parameters:**
- `ts` (array-like) - Array of parameter values

**Returns:** numpy array of complex numbers

##### `length(t0=0, t1=1, error=1e-12, min_depth=5) -> float`
Arc length using scipy.quad or recursive approximation.

**Parameters:**
- `t0` (float, default=0) - Start parameter
- `t1` (float, default=1) - End parameter
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float arc length

##### `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5) -> float`
Inverse arc length.

**Parameters:**
- `s` (float) - Arc length from start
- `s_tol` (float, default=1e-12) - Tolerance
- `maxits` (int, default=10000) - Maximum iterations
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float parameter t

##### `bpoints() -> tuple`
Returns (start, control1, control2, end).

**Returns:** tuple of four complex numbers

##### `poly(return_coeffs=False) -> np.poly1d | tuple`
Polynomial representation.

**Parameters:**
- `return_coeffs` (bool, default=False) - Return coefficients instead of poly1d

**Returns:** np.poly1d object or tuple of coefficients

##### `derivative(t, n=1) -> complex`
Returns nth derivative.

**Parameters:**
- `t` (float) - Parameter value
- `n` (int, default=1) - Derivative order

**Returns:** complex number representing derivative

##### `unit_tangent(t) -> complex`
Returns unit tangent.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `normal(t) -> complex`
Returns unit normal.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `curvature(t) -> float`
Returns curvature.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** float curvature value

##### `reversed() -> CubicBezier`
Returns reversed segment.

**Returns:** new CubicBezier object

##### `intersect(other_seg, tol=1e-12) -> list[tuple]`
Finds intersections.

**Parameters:**
- `other_seg` - Other segment to intersect with
- `tol` (float, default=1e-12) - Tolerance for intersection detection

**Returns:** list of tuples (t1, t2)

##### `bbox() -> tuple`
Returns bounding box.

**Returns:** tuple (xmin, xmax, ymin, ymax)

##### `split(t) -> tuple[CubicBezier, CubicBezier]`
Splits at parameter.

**Parameters:**
- `t` (float) - Split parameter

**Returns:** tuple of two CubicBezier objects

##### `cropped(t0, t1) -> CubicBezier`
Returns cropped segment.

**Parameters:**
- `t0` (float) - Start parameter
- `t1` (float) - End parameter

**Returns:** new CubicBezier object

##### `radialrange(origin, return_all_global_extrema=False) -> tuple`
Distance extrema.

**Parameters:**
- `origin` (complex) - Origin point
- `return_all_global_extrema` (bool, default=False) - Return all extrema

**Returns:** tuple ((d_min, t_min), (d_max, t_max))

##### `rotated(degs, origin=None) -> CubicBezier`
Returns rotated copy.

**Parameters:**
- `degs` (float) - Rotation angle in degrees
- `origin` (complex, optional) - Center of rotation

**Returns:** new CubicBezier object

##### `translated(z0) -> CubicBezier`
Returns translated copy.

**Parameters:**
- `z0` (complex) - Translation vector

**Returns:** new CubicBezier object

##### `scaled(sx, sy=None, origin=0j) -> CubicBezier`
Returns scaled copy.

**Parameters:**
- `sx` (float) - Scale factor for x-axis
- `sy` (float, optional) - Scale factor for y-axis
- `origin` (complex, default=0j) - Center of scaling

**Returns:** new CubicBezier object

---

### Class: Arc

Represents an elliptical arc segment following SVG arc specifications.

#### Constructor

```python
Arc(start, radius, rotation, large_arc, sweep, end, autoscale_radius=True)
```

**Parameters:**
- `start` (complex) - Starting point
- `radius` (complex) - Radii as rx + 1j*ry where rx/ry are semi-axes
- `rotation` (float) - X-axis rotation in degrees
- `large_arc` (bool) - Large arc flag (0 or 1)
- `sweep` (bool) - Sweep direction flag (0 or 1)
- `end` (complex) - Ending point
- `autoscale_radius` (bool, default=True) - Auto-scale radius if too small

#### Methods

##### `apoints() -> tuple`
Returns arc parameters (start, radius, rotation, large_arc, sweep, end).

**Returns:** tuple of six values

##### `__hash__() -> int`
Returns hash of the arc segment.

##### `__repr__() -> str`
Returns string representation.

##### `__eq__(other) -> bool`
Checks equality with another segment.

##### `__ne__(other) -> bool`
Checks inequality with another segment.

##### `_parameterize()`
Computes center, theta, delta from arc parameters (internal method).

##### `point(t) -> complex`
Evaluates arc at parameter t.

**Parameters:**
- `t` (float) - Parameter value in [0,1]

**Returns:** complex number representing point on arc

##### `point_to_t(point) -> float | None`
Returns parameter for point (non-rotated arcs only).

**Parameters:**
- `point` (complex) - Point on arc

**Returns:** float parameter or None if not on arc or arc is rotated

##### `centeriso(z) -> complex`
Isometry to centered aligned ellipse.

**Parameters:**
- `z` (complex) - Point to transform

**Returns:** complex transformed point

##### `icenteriso(zeta) -> complex`
Inverse centeriso transformation.

**Parameters:**
- `zeta` (complex) - Point in centered space

**Returns:** complex original point

##### `u1transform(z) -> complex`
Maps to unit circle.

**Parameters:**
- `z` (complex) - Point to transform

**Returns:** complex point on unit circle

##### `iu1transform(zeta) -> complex`
Inverse u1transform.

**Parameters:**
- `zeta` (complex) - Point on unit circle

**Returns:** complex original point

##### `length(t0=0, t1=1, error=1e-12, min_depth=5) -> float`
Arc length via numerical integration.

**Parameters:**
- `t0` (float, default=0) - Start parameter
- `t1` (float, default=1) - End parameter
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float arc length

##### `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5) -> float`
Inverse arc length.

**Parameters:**
- `s` (float) - Arc length from start
- `s_tol` (float, default=1e-12) - Tolerance
- `maxits` (int, default=10000) - Maximum iterations
- `error` (float, default=1e-12) - Error tolerance
- `min_depth` (int, default=5) - Minimum recursion depth

**Returns:** float parameter t

##### `joins_smoothly_with(previous, wrt_parameterization=False, error=0) -> bool`
Checks tangent continuity.

**Parameters:**
- `previous` - Previous segment
- `wrt_parameterization` (bool, default=False) - Check tangent magnitude
- `error` (float, default=0) - Tolerance

**Returns:** bool indicating smooth join

##### `derivative(t, n=1) -> complex`
Returns nth derivative.

**Parameters:**
- `t` (float) - Parameter value
- `n` (int, default=1) - Derivative order

**Returns:** complex number representing derivative

##### `unit_tangent(t) -> complex`
Returns unit tangent.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `normal(t) -> complex`
Returns unit normal.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** complex number with magnitude 1

##### `curvature(t) -> float`
Returns curvature.

**Parameters:**
- `t` (float) - Parameter value

**Returns:** float curvature value

##### `reversed() -> Arc`
Returns reversed arc (sweep flag negated).

**Returns:** new Arc object

##### `phase2t(psi) -> float`
Converts phase (radians) to parameter t.

**Parameters:**
- `psi` (float) - Phase angle in radians

**Returns:** float parameter t

##### `intersect(other_seg, tol=1e-12) -> list[tuple]`
Finds intersections with other segments.

**Parameters:**
- `other_seg` - Other segment to intersect with
- `tol` (float, default=1e-12) - Tolerance for intersection detection

**Returns:** list of tuples (t1, t2)

##### `bbox() -> tuple`
Returns bounding box with extrema analysis.

**Returns:** tuple (xmin, xmax, ymin, ymax)

##### `split(t) -> tuple[Arc, Arc]`
Splits at parameter.

**Parameters:**
- `t` (float) - Split parameter

**Returns:** tuple of two Arc objects

##### `cropped(t0, t1) -> Arc`
Returns cropped segment.

**Parameters:**
- `t0` (float) - Start parameter
- `t1` (float) - End parameter

**Returns:** new Arc object

##### `radialrange(origin, return_all_global_extrema=False)`
Not implemented for Arc segments.

**Raises:** NotImplementedError

##### `rotated(degs, origin=None) -> Arc`
Returns rotated copy.

**Parameters:**
- `degs` (float) - Rotation angle in degrees
- `origin` (complex, optional) - Center of rotation

**Returns:** new Arc object

##### `translated(z0) -> Arc`
Returns translated copy.

**Parameters:**
- `z0` (complex) - Translation vector

**Returns:** new Arc object

##### `scaled(sx, sy=None, origin=0j) -> Arc`
Returns scaled copy (equal axes only).

**Parameters:**
- `sx` (float) - Scale factor for x-axis
- `sy` (float, optional) - Scale factor for y-axis (must equal sx)
- `origin` (complex, default=0j) - Center of scaling

**Returns:** new Arc object

**Note:** Raises error if sx ≠ sy (non-uniform scaling not supported)

##### `as_cubic_curves(curves=1) -> generator[CubicBezier]`
Approximates arc as cubic spline segments.

**Parameters:**
- `curves` (int, default=1) - Number of cubic curves

**Yields:** CubicBezier objects

##### `as_quad_curves(curves=1) -> generator[QuadraticBezier]`
Approximates arc as quadratic spline segments.

**Parameters:**
- `curves` (int, default=1) - Number of quadratic curves

**Yields:** QuadraticBezier objects

---

## Class: Path

A mutable sequence container for path segments implementing the Path interface.

### Constructor

```python
Path(*segments, **kw)
```

**Parameters:**
- `*segments` - Variable number of path segments
- `**kw` - Keyword arguments (reserved for future use)

### Methods

Path implements all MutableSequence methods plus segment-like operations. The Path class has 40+ methods including standard sequence operations and geometric transformations.

#### Sequence Operations

##### `__getitem__(index) -> Segment | Path`
Gets segment(s) by index or slice.

##### `__setitem__(index, value)`
Sets segment(s) by index or slice.

##### `__delitem__(index)`
Deletes segment(s) by index or slice.

##### `__len__() -> int`
Returns number of segments.

##### `__repr__() -> str`
Returns string representation.

##### `__eq__(other) -> bool`
Checks equality.

##### `__ne__(other) -> bool`
Checks inequality.

##### `__hash__() -> int`
Returns hash.

##### `append(segment)`
Appends segment to path.

##### `insert(index, segment)`
Inserts segment at index.

#### Geometric Properties

##### `point(t) -> complex`
Evaluates path at parameter t ∈ [0, len(path)].

**Parameters:**
- `t` (float) - Global parameter (segment index + local parameter)

**Returns:** complex point on path

##### `points(ts) -> array`
Batch evaluation at multiple parameters.

##### `length(t0=0, t1=None, error=None, min_depth=None) -> float`
Returns path length.

##### `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5) -> float`
Inverse arc length.

##### `bpoints() -> list`
Returns all control points.

##### `poly() -> list[np.poly1d]`
Returns polynomial representation of each segment.

##### `derivative(t, n=1) -> complex`
Returns derivative at parameter t.

##### `unit_tangent(t) -> complex`
Returns unit tangent at parameter t.

##### `normal(t) -> complex`
Returns unit normal at parameter t.

##### `curvature(t) -> float`
Returns curvature at parameter t.

##### `bbox() -> tuple`
Returns bounding box for entire path.

#### Path Properties

##### `d() -> str`
Returns SVG path d-string representation.

##### `isclosed() -> bool`
Checks if path is closed (end connects to start).

##### `continuous() -> bool`
Checks if path is continuous (no gaps between segments).

##### `smooth() -> bool`
Checks if path is smooth (C1 continuous).

##### `joins_smoothly_with(previous, wrt_parameterization=False) -> bool`
Checks if path joins smoothly with previous segment.

#### Transformations

##### `reversed() -> Path`
Returns path with reversed orientation.

##### `rotated(degs, origin=None) -> Path`
Returns rotated path.

##### `translated(z0) -> Path`
Returns translated path.

##### `scaled(sx, sy=None, origin=0j) -> Path`
Returns scaled path.

#### Subdivision

##### `cropped(t0, t1) -> Path`
Returns cropped path segment.

##### `split(t) -> tuple[Path, Path]`
Splits path at parameter t.

#### Intersection

##### `intersect(other, tol=1e-12) -> list[tuple]`
Finds intersections with another path or segment.

##### `radialrange(origin, return_all_global_extrema=False) -> tuple`
Returns distance extrema relative to origin.

#### Parameter Conversion

##### `t2T(t) -> tuple[int, float]`
Converts global parameter to (segment_index, local_parameter).

**Parameters:**
- `t` (float) - Global parameter

**Returns:** tuple (segment_index, local_t)

##### `T2t(T) -> float`
Converts (segment_index, local_parameter) to global parameter.

**Parameters:**
- `T` (tuple) - Tuple (segment_index, local_t)

**Returns:** float global parameter

---

## Path Construction Functions

### `bezier_segment(*bpoints) -> Line | QuadraticBezier | CubicBezier`

Creates appropriate Bezier segment from control points.

**Parameters:**
- `*bpoints` - 2, 3, or 4 complex control points

**Returns:** Line (2 points), QuadraticBezier (3 points), or CubicBezier (4 points)

---

### `bpoints2bezier(bpoints) -> CubicBezier | QuadraticBezier | Line`

Converts list of 2-4 control points to appropriate Bezier type.

**Parameters:**
- `bpoints` (list) - List of 2-4 complex control points

**Returns:** Line, QuadraticBezier, or CubicBezier object

---

### `poly2bez(poly, return_bpoints=False) -> Bezier | list`

Converts polynomial to Bezier representation.

**Parameters:**
- `poly` (np.poly1d) - Polynomial object
- `return_bpoints` (bool, default=False) - Return control points instead of Bezier

**Returns:** Bezier object or list of control points

---

### `bbox2path(xmin, xmax, ymin, ymax) -> Path`

Converts bounding box to rectangular Path.

**Parameters:**
- `xmin` (float) - Minimum x coordinate
- `xmax` (float) - Maximum x coordinate
- `ymin` (float) - Minimum y coordinate
- `ymax` (float) - Maximum y coordinate

**Returns:** Path object representing rectangle

---

### `polyline(*points) -> Path`

Creates Path of line segments connecting points.

**Parameters:**
- `*points` - Variable number of complex points

**Returns:** Path object with line segments

---

### `polygon(*points) -> Path`

Creates closed Path connecting points.

**Parameters:**
- `*points` - Variable number of complex points

**Returns:** Closed Path object (last point connects to first)

---

### `concatpaths(list_of_paths) -> Path`

Concatenates multiple paths into single path.

**Parameters:**
- `list_of_paths` (list) - List of Path objects

**Returns:** Single Path object containing all segments

---

## Path Analysis Functions

### `is_bezier_segment(seg) -> bool`

Checks if segment is Line, QuadraticBezier, or CubicBezier.

**Parameters:**
- `seg` - Segment object to check

**Returns:** True if Bezier segment, False otherwise

---

### `is_path_segment(seg) -> bool`

Checks if segment is any valid path segment (including Arc).

**Parameters:**
- `seg` - Object to check

**Returns:** True if valid path segment, False otherwise

---

### `is_bezier_path(path) -> bool`

Verifies all segments in path are Bezier objects (no Arcs).

**Parameters:**
- `path` (Path) - Path object to check

**Returns:** True if all segments are Bezier, False otherwise

---

### `closest_point_in_path(pt, path) -> tuple`

Finds closest point on path to given point.

**Parameters:**
- `pt` (complex) - Reference point
- `path` (Path) - Path to search

**Returns:** tuple (distance, t, segment_index)

---

### `farthest_point_in_path(pt, path) -> tuple`

Finds farthest point on path from given point.

**Parameters:**
- `pt` (complex) - Reference point
- `path` (Path) - Path to search

**Returns:** tuple (distance, t, segment_index)

---

### `path_encloses_pt(pt, opt, path) -> bool`

Checks if point is enclosed by closed path using ray casting.

**Parameters:**
- `pt` (complex) - Point to test
- `opt` (complex) - Point known to be outside path
- `path` (Path) - Closed path

**Returns:** True if point is enclosed, False otherwise

---

## Transformation Functions

### `rotate(curve, degs, origin=None) -> Path | Segment`

Rotates curve counter-clockwise by degrees around origin.

**Parameters:**
- `curve` (Path | Segment) - Curve to rotate
- `degs` (float) - Rotation angle in degrees
- `origin` (complex, optional) - Center of rotation (default: 0+0j)

**Returns:** Rotated Path or Segment

---

### `translate(curve, z0) -> Path | Segment`

Shifts curve by complex quantity.

**Parameters:**
- `curve` (Path | Segment) - Curve to translate
- `z0` (complex) - Translation vector

**Returns:** Translated Path or Segment

---

### `scale(curve, sx, sy=None, origin=0j) -> Path | Segment`

Scales curve by diagonal matrix.

**Parameters:**
- `curve` (Path | Segment) - Curve to scale
- `sx` (float) - Scale factor for x-axis
- `sy` (float, optional) - Scale factor for y-axis (default: same as sx)
- `origin` (complex, default=0j) - Center of scaling

**Returns:** Scaled Path or Segment

---

### `transform(curve, tf) -> Path | Segment`

Applies 3×3 homogeneous transformation matrix.

**Parameters:**
- `curve` (Path | Segment) - Curve to transform
- `tf` (array-like) - 3×3 transformation matrix

**Returns:** Transformed Path or Segment

---

### `transform_segments_together(path, transformation) -> Path`

Applies transformation while preserving joint continuity.

**Parameters:**
- `path` (Path) - Path to transform
- `transformation` (callable) - Transformation function

**Returns:** Transformed Path with preserved continuity

---

## Bezier Functions

### `n_choose_k(n, k) -> int`

Calculates binomial coefficient "n choose k".

**Parameters:**
- `n` (int) - Total number of items
- `k` (int) - Number of items to choose

**Returns:** int binomial coefficient

---

### `bernstein(n, t) -> list`

Returns Bernstein basis polynomials b_{i,n} evaluated at t.

**Parameters:**
- `n` (int) - Polynomial degree
- `t` (float) - Parameter value

**Returns:** list of n+1 values [b_{0,n}(t), ..., b_{n,n}(t)]

---

### `bezier_point(p, t) -> complex`

Evaluates Bezier curve at parameter t using control points.

**Parameters:**
- `p` (list) - List of complex control points
- `t` (float) - Parameter value in [0,1]

**Returns:** complex point on curve

**Note:** Uses Horner's rule for cubic and lower order curves. Be concerned about numerical stability with high order curves.

---

### `bezier2polynomial(p, numpy_ordering=True, return_poly1d=False) -> tuple | np.poly1d`

Converts Bezier control points to polynomial coefficients.

**Parameters:**
- `p` (list) - List of control points
- `numpy_ordering` (bool, default=True) - Output coefficients in reverse standard order
- `return_poly1d` (bool, default=False) - Return numpy.poly1d object

**Returns:** tuple of coefficients or np.poly1d object

---

### `polynomial2bezier(poly) -> CubicBezier | QuadraticBezier | Line`

Converts polynomial to appropriate Bezier object.

**Parameters:**
- `poly` (np.poly1d | sequence) - Polynomial object or coefficients

**Returns:** CubicBezier, QuadraticBezier, or Line object

**Note:** Only works for cubic or lower order polynomials

---

### `split_bezier(bpoints, t) -> tuple`

Splits Bezier curve at parameter t using de Casteljau's algorithm.

**Parameters:**
- `bpoints` (list) - List of control points
- `t` (float) - Split parameter in [0,1]

**Returns:** tuple (left_bpoints, right_bpoints)

---

### `halve_bezier(p) -> tuple`

Splits Bezier curve at t=0.5.

**Parameters:**
- `p` (list) - List of control points

**Returns:** tuple (left_bpoints, right_bpoints)

---

### `bezier_bounding_box(bez) -> tuple`

Returns bounding box for Bezier segment.

**Parameters:**
- `bez` (Line | QuadraticBezier | CubicBezier) - Bezier segment

**Returns:** tuple (xmin, xmax, ymin, ymax)

**Note:** Not particularly efficient for non-cubic cases

---

### `bezier_real_minmax(p) -> tuple`

Returns minimum and maximum for any real cubic Bezier.

**Parameters:**
- `p` (list) - List of 4 real control points

**Returns:** tuple (min_value, max_value)

---

### `bezier_intersections(bez1, bez2, longer_length, tol=1e-8, tol_deC=1e-8) -> list[tuple]`

Finds intersections between two Bezier curves.

**Parameters:**
- `bez1` (list) - Control points [P0, P1, ..., PN] for first curve
- `bez2` (list) - Control points [Q0, Q1, ..., QM] for second curve
- `longer_length` (float) - Length (or upper bound) of longer curve
- `tol` (float, default=1e-8) - Minimum distance between distinct solutions
- `tol_deC` (float, default=1e-8) - Distance tolerance for intersection

**Returns:** list of tuples (t, s) where bez1.point(t) ≈ bez2.point(s)

---

### `bezier_by_line_intersections(bezier, line) -> list[tuple]`

Finds intersections between Bezier curve and line.

**Parameters:**
- `bezier` (QuadraticBezier | CubicBezier) - Bezier segment
- `line` (Line) - Line segment

**Returns:** list of tuples (t1, t2) where bezier.point(t1) ≈ line.point(t2)

---

### `box_area(xmin, xmax, ymin, ymax) -> float`

Computes area of rectangle.

**Parameters:**
- `xmin` (float) - Minimum x coordinate
- `xmax` (float) - Maximum x coordinate
- `ymin` (float) - Minimum y coordinate
- `ymax` (float) - Maximum y coordinate

**Returns:** float area

---

### `boxes_intersect(box1, box2) -> bool`

Determines if two rectangles intersect.

**Parameters:**
- `box1` (tuple) - Rectangle as (xmin, xmax, ymin, ymax)
- `box2` (tuple) - Rectangle as (xmin, xmax, ymin, ymax)

**Returns:** True if rectangles intersect, False otherwise

---

### `interval_intersection_width(a, b, c, d) -> float`

Returns width of intersection of intervals [a,b] and [c,d].

**Parameters:**
- `a` (float) - Start of first interval
- `b` (float) - End of first interval
- `c` (float) - Start of second interval
- `d` (float) - End of second interval

**Returns:** float width of intersection (0 if no intersection)

---

## Segment Geometry Functions

### `bezier_unit_tangent(seg, t) -> complex`

Returns unit tangent vector at parameter t.

**Parameters:**
- `seg` (Segment) - Path segment
- `t` (float) - Parameter value

**Returns:** complex unit vector

---

### `segment_curvature(seg, t, use_inf=False) -> float`

Returns curvature at parameter t.

**Parameters:**
- `seg` (Segment) - Path segment
- `t` (float) - Parameter value
- `use_inf` (bool, default=False) - Return infinity for undefined curvature

**Returns:** float curvature value

---

### `bezier_radialrange(seg, origin, return_all_global_extrema=False) -> tuple`

Returns distance extrema from origin.

**Parameters:**
- `seg` (Segment) - Path segment
- `origin` (complex) - Origin point
- `return_all_global_extrema` (bool, default=False) - Return all extrema

**Returns:** tuple ((d_min, t_min), (d_max, t_max))

---

### `segment_length(curve, start, end, start_point, end_point, error, min_depth, depth) -> float`

Recursively approximates arc length via line segments (internal function).

**Parameters:**
- `curve` (Segment) - Curve to measure
- `start` (float) - Start parameter
- `end` (float) - End parameter
- `start_point` (complex) - Point at start
- `end_point` (complex) - Point at end
- `error` (float) - Error tolerance
- `min_depth` (int) - Minimum recursion depth
- `depth` (int) - Current recursion depth

**Returns:** float arc length

---

### `inv_arclength(curve, s, s_tol, maxits, error, min_depth) -> float`

Returns parameter t such that arc length from 0 to t equals s (internal function).

**Parameters:**
- `curve` (Segment) - Curve
- `s` (float) - Target arc length
- `s_tol` (float) - Tolerance for length
- `maxits` (int) - Maximum iterations
- `error` (float) - Error tolerance
- `min_depth` (int) - Minimum recursion depth

**Returns:** float parameter t

---

### `crop_bezier(seg, t0, t1) -> Segment`

Crops Bezier segment from t0 to t1.

**Parameters:**
- `seg` (Line | QuadraticBezier | CubicBezier) - Bezier segment
- `t0` (float) - Start parameter
- `t1` (float) - End parameter

**Returns:** Cropped segment of same type

---

## Polynomial Tools

### `polyroots(p, realroots=False, condition=lambda r: True) -> list`

Returns roots of polynomial with given coefficients.

**Parameters:**
- `p` (list | np.poly1d) - Coefficients: p[0]*x^n + p[1]*x^(n-1) + ... + p[n]
- `realroots` (bool, default=False) - Return only real roots
- `condition` (callable, default=lambda r: True) - Additional filter function

**Returns:** list of roots (complex or real depending on realroots)

---

### `polyroots01(p) -> list`

Returns real roots between 0 and 1 of polynomial.

**Parameters:**
- `p` (list | np.poly1d) - Coefficients: p[0]*x^n + p[1]*x^(n-1) + ... + p[n]

**Returns:** list of real roots in [0, 1]

---

### `rational_limit(f, g, t0) -> float`

Computes limit of rational function (f/g)(t) as t approaches t0.

**Parameters:**
- `f` (np.poly1d) - Numerator polynomial
- `g` (np.poly1d) - Denominator polynomial
- `t0` (float) - Limit point

**Returns:** float limit value

**Raises:** ValueError if limit does not exist

---

### `real(z) -> np.poly1d | float`

Extracts real component from complex polynomial or number.

**Parameters:**
- `z` (np.poly1d | complex) - Input polynomial or number

**Returns:** Real part as np.poly1d or float

---

### `imag(z) -> np.poly1d | float`

Extracts imaginary component from complex polynomial or number.

**Parameters:**
- `z` (np.poly1d | complex) - Input polynomial or number

**Returns:** Imaginary part as np.poly1d or float

---

### `poly_real_part(poly) -> np.poly1d`

**Deprecated.** Use `real(poly)` instead.

---

### `poly_imag_part(poly) -> np.poly1d`

**Deprecated.** Use `imag(poly)` instead.

---

## Miscellaneous Utilities

### `hex2rgb(value) -> tuple`

Converts hexadecimal color string to RGB 3-tuple.

**Parameters:**
- `value` (str) - Hex color string (e.g., '#0000FF')

**Returns:** tuple (r, g, b) with values 0-255

**Example:**
```python
hex2rgb('#0000FF')  # Returns (0, 0, 255)
```

---

### `rgb2hex(rgb) -> str`

Converts RGB 3-tuple to hexadecimal color string.

**Parameters:**
- `rgb` (tuple) - RGB values as (r, g, b) with values 0-255

**Returns:** str hex color (e.g., '#0000FF')

**Example:**
```python
rgb2hex((0, 0, 255))  # Returns '#0000FF'
```

---

### `isclose(a, b, rtol=1e-5, atol=1e-8) -> bool`

Fast floating-point comparison (similar to np.isclose).

**Parameters:**
- `a` (float) - First value
- `b` (float) - Second value
- `rtol` (float, default=1e-5) - Relative tolerance
- `atol` (float, default=1e-8) - Absolute tolerance

**Returns:** True if |a - b| ≤ atol + rtol * |b|

---

### `open_in_browser(file_location) -> None`

Attempts to open file in default web browser.

**Parameters:**
- `file_location` (str) - Path to file

**Returns:** None

---

## SVG Parsing Functions

### `svg2paths(svg_file_location, return_svg_attributes=False, convert_circles_to_paths=True, convert_ellipses_to_paths=True, convert_lines_to_paths=True, convert_polylines_to_paths=True, convert_polygons_to_paths=True, convert_rectangles_to_paths=True) -> tuple`

Extracts paths from SVG file.

**Parameters:**
- `svg_file_location` (str) - Path to SVG file
- `return_svg_attributes` (bool, default=False) - Return SVG root attributes
- `convert_circles_to_paths` (bool, default=True) - Convert circle elements
- `convert_ellipses_to_paths` (bool, default=True) - Convert ellipse elements
- `convert_lines_to_paths` (bool, default=True) - Convert line elements
- `convert_polylines_to_paths` (bool, default=True) - Convert polyline elements
- `convert_polygons_to_paths` (bool, default=True) - Convert polygon elements
- `convert_rectangles_to_paths` (bool, default=True) - Convert rect elements

**Returns:**
- If `return_svg_attributes=False`: tuple (paths, attributes)
  - `paths` - list of Path objects
  - `attributes` - list of dicts with element attributes
- If `return_svg_attributes=True`: tuple (paths, attributes, svg_attributes)
  - `svg_attributes` - dict of SVG root element attributes

---

### `svg2paths2(svg_file_location, return_svg_attributes=True, ...) -> tuple`

Convenience function identical to `svg2paths()` with `return_svg_attributes=True` by default.

**Parameters:** Same as `svg2paths()`

**Returns:** tuple (paths, attributes, svg_attributes)

---

### `svgstr2paths(svg_string, return_svg_attributes=False, ...) -> tuple`

Extracts paths from SVG string instead of file.

**Parameters:**
- `svg_string` (str) - SVG content as string
- Other parameters same as `svg2paths()`

**Returns:** Same as `svg2paths()`

---

### SVG Element Conversion Functions

These functions convert SVG element attributes to path d-strings:

#### `path2pathd(path) -> str`

Extracts d-attribute from path element.

**Parameters:**
- `path` - SVG path element

**Returns:** str path d-string

---

#### `ellipse2pathd(ellipse, use_cubics=False) -> str`

Converts ellipse/circle parameters to path d-string.

**Parameters:**
- `ellipse` - SVG ellipse or circle element
- `use_cubics` (bool, default=False) - Use cubic Beziers instead of arcs

**Returns:** str path d-string

---

#### `polyline2pathd(polyline, is_polygon=False) -> str`

Converts polyline points-attribute to path d-string.

**Parameters:**
- `polyline` - SVG polyline element
- `is_polygon` (bool, default=False) - Close path for polygon

**Returns:** str path d-string

---

#### `polygon2pathd(polyline, is_polygon=True) -> str`

Converts polygon points-attribute to path d-string.

**Parameters:**
- `polyline` - SVG polygon element
- `is_polygon` (bool, default=True) - Always True for polygons

**Returns:** str path d-string

**Note:** For n points, resulting path has n lines (even if some have zero length)

---

#### `rect2pathd(rect) -> str`

Converts SVG rect element to path d-string.

**Parameters:**
- `rect` - SVG rect element

**Returns:** str path d-string (counter-clockwise from top-left)

---

#### `line2pathd(l) -> str`

Converts SVG line element to path d-string.

**Parameters:**
- `l` - SVG line element

**Returns:** str path d-string

---

## SVG Writing Functions

### `disvg(paths=None, colors=None, filename=None, stroke_widths=None, nodes=None, node_colors=None, node_radii=None, openinbrowser=True, timestamp=None, margin_size=0.1, mindim=600, dimensions=None, viewbox=None, text=None, text_path=None, font_size=None, attributes=None, svg_attributes=None, svgwrite_debug=False, paths2Drawing=False, baseunit='px') -> None | svgwrite.Drawing`

Creates and optionally displays SVG file.

**Parameters:**
- `paths` (list, optional) - List of Path or segment objects
- `colors` (list, optional) - List of color strings (CSS colors or hex)
- `filename` (str, optional) - Output filename (generates temp file if None)
- `stroke_widths` (list, optional) - List of stroke widths
- `nodes` (list, optional) - List of points to draw as circles
- `node_colors` (list, optional) - Colors for nodes
- `node_radii` (list, optional) - Radii for nodes
- `openinbrowser` (bool, default=True) - Open SVG in browser after creation
- `timestamp` (bool, optional) - Add timestamp to filename
- `margin_size` (float, default=0.1) - Margin as fraction of canvas
- `mindim` (int, default=600) - Minimum canvas dimension in pixels
- `dimensions` (tuple, optional) - Canvas dimensions (width, height)
- `viewbox` (tuple, optional) - ViewBox (xmin, ymin, width, height)
- `text` (list, optional) - List of text strings to add
- `text_path` (list, optional) - List of paths for text to follow
- `font_size` (float, optional) - Font size for text
- `attributes` (list, optional) - List of dicts with element attributes
- `svg_attributes` (dict, optional) - Attributes for SVG root element
- `svgwrite_debug` (bool, default=False) - Enable svgwrite debug mode
- `paths2Drawing` (bool, default=False) - Return Drawing object instead of saving
- `baseunit` (str, default='px') - Base unit for dimensions

**Returns:**
- None if saving to file
- svgwrite.Drawing object if paths2Drawing=True

---

### `wsvg(paths=None, colors=None, filename=None, stroke_widths=None, nodes=None, node_colors=None, node_radii=None, openinbrowser=False, timestamp=False, ...) -> None | svgwrite.Drawing`

Write SVG to disk without opening in browser.

**Parameters:** Same as `disvg()` but with different defaults:
- `openinbrowser` (bool, default=False)
- `timestamp` (bool, default=False)

**Returns:** Same as `disvg()`

---

### `paths2Drawing(paths=None, colors=None, filename=None, stroke_widths=None, nodes=None, node_colors=None, node_radii=None, openinbrowser=False, timestamp=False, margin_size=0.1, mindim=600, dimensions=None, viewbox=None, text=None, text_path=None, font_size=None, attributes=None, svg_attributes=None, svgwrite_debug=False, paths2Drawing=True, baseunit='px') -> svgwrite.Drawing`

Creates and returns svgwrite.Drawing object without saving.

**Parameters:** Same as `disvg()` but with:
- `paths2Drawing` (bool, default=True)

**Returns:** svgwrite.Drawing object

---

### Supporting Functions

#### `str2colorlist(s, default_color=None) -> list`

Converts character string to color list (internal function).

**Parameters:**
- `s` (str) - String of color characters
- `default_color` (optional) - Default color for empty values

**Returns:** list of color strings

---

#### `is3tuple(c) -> bool`

Checks if input is 3-element tuple (internal function).

**Parameters:**
- `c` - Value to check

**Returns:** True if tuple with 3 elements

---

#### `big_bounding_box(paths_n_stuff) -> tuple`

Returns minimal upright bounding box for collection of objects.

**Parameters:**
- `paths_n_stuff` (iterable) - Paths, segments, or complex points

**Returns:** tuple (xmin, xmax, ymin, ymax)

---

## Document Handling

### `Document` Class

SVG document class for parsing and manipulating SVG files.

**Note:** Detailed documentation for Document class methods not provided in source extracts. Refer to source code or additional documentation.

---

### Constants

#### `CONVERSIONS`
Dictionary mapping SVG element types to conversion functions.

#### `CONVERT_ONLY_PATHS`
Flag indicating path-only conversion mode.

#### `SVG_GROUP_TAG`
String constant for SVG group tag.

#### `SVG_NAMESPACE`
String constant for SVG namespace URI.

---

### `SaxDocument` Class

SAX-based SVG document parser for streaming/large files.

**Note:** Detailed documentation for SaxDocument class methods not provided in source extracts. Refer to source code or additional documentation.

---

## Additional Functions

### `smoothed_path(path, ...) -> Path`

Creates smoothed version of path.

**Note:** Detailed parameters not provided in source extracts.

---

### `smoothed_joint(seg1, seg2, ...) -> Segment`

Creates smooth joint between two segments.

**Note:** Detailed parameters not provided in source extracts.

---

### `is_differentiable(path, t) -> bool`

Checks if path is differentiable at parameter t.

**Note:** Detailed parameters not provided in source extracts.

---

### `kinks(path) -> list`

Finds non-differentiable points (kinks) in path.

**Note:** Detailed parameters not provided in source extracts.

---

## Notes

- All segment classes use complex numbers for 2D points (real = x, imag = y)
- Parameters `t` are typically in range [0,1] for segments
- For Path objects, global parameter `t` ranges from 0 to `len(path)`
- Most geometric operations preserve the type of input (Path → Path, Segment → Segment)
- Transformations return new objects (immutable operations)
- Many functions have optional `error` and `min_depth` parameters for numerical accuracy control
- Arc segments have limitations on certain operations (e.g., non-uniform scaling)

---

## Version Information

This API reference is based on svgpathtools library code analysis. Version information not explicitly provided in module exports.

---

*Generated: 2025-12-10*
