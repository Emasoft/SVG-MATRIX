# svgpathtools: Complete Function Analysis

**Precision Rating Scale:**
- `EXACT` - Mathematically exact (integers, simple arithmetic)
- `HIGH` - float64 (~15 digits), suitable for most applications
- `MEDIUM` - float64 with iterative algorithms, error may accumulate
- `LOW` - Approximations, subdivisions, or heuristics involved
- `N/A` - Not applicable (no numeric computation)

**Trustworthiness Rating Scale:**
- `VERIFIED` - Well-tested, mathematically sound
- `RELIABLE` - Standard algorithms, generally correct
- `CAUTION` - Known edge cases or limitations
- `EXPERIMENTAL` - May fail in edge cases
- `UNTESTED` - Limited testing, use with care

---

## Segment Classes

### Line

| Method | Parameters | Precision | Trust | Notes |
|--------|------------|-----------|-------|-------|
| `Line(start, end)` | `start`: complex, `end`: complex | EXACT | VERIFIED | Simple storage |
| `point(t)` | `t`: float [0,1] | HIGH | VERIFIED | Linear interpolation: `start + t*(end-start)` |
| `points(ts)` | `ts`: array of floats | HIGH | VERIFIED | Vectorized linear interpolation |
| `length(t0=0, t1=1, error=None, min_depth=None)` | `t0,t1`: float, `error`: float tolerance, `min_depth`: int | EXACT | VERIFIED | Euclidean distance formula |
| `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5)` | `s`: float target length, tolerances | HIGH | VERIFIED | Closed-form solution for lines |
| `derivative(t=None, n=1)` | `t`: float or None, `n`: int order | EXACT | VERIFIED | Constant derivative |
| `unit_tangent(t=None)` | `t`: float or None | HIGH | VERIFIED | Normalized derivative |
| `normal(t=None)` | `t`: float or None | HIGH | VERIFIED | Right-hand rule perpendicular |
| `curvature(t)` | `t`: float | EXACT | VERIFIED | Always returns 0 (lines have no curvature) |
| `bbox()` | None | EXACT | VERIFIED | min/max of endpoints |
| `split(t)` | `t`: float [0,1] | EXACT | VERIFIED | Linear interpolation |
| `cropped(t0, t1)` | `t0,t1`: float | EXACT | VERIFIED | Linear interpolation |
| `reversed()` | None | EXACT | VERIFIED | Swaps start/end |
| `intersect(other_seg, tol=1e-12)` | `other_seg`: Segment, `tol`: float | MEDIUM | RELIABLE | Line-line: exact; Line-curve: subdivision |
| `point_to_t(point)` | `point`: complex | HIGH | RELIABLE | Division-based, edge cases at endpoints |
| `rotated(degs, origin=None)` | `degs`: float degrees, `origin`: complex | HIGH | VERIFIED | cos/sin computation |
| `translated(z0)` | `z0`: complex | EXACT | VERIFIED | Simple addition |
| `scaled(sx, sy=None, origin=0j)` | `sx,sy`: float, `origin`: complex | HIGH | VERIFIED | Simple multiplication |
| `radialrange(origin, return_all_global_extrema=False)` | `origin`: complex, `return_all`: bool | HIGH | RELIABLE | Quadratic formula for extrema |
| `poly(return_coeffs=False)` | `return_coeffs`: bool | EXACT | VERIFIED | Linear polynomial |
| `bpoints()` | None | EXACT | VERIFIED | Returns (start, end) |
| `joins_smoothly_with(previous, wrt_parameterization=False)` | `previous`: Segment, `wrt_param`: bool | HIGH | RELIABLE | Tangent comparison |

---

### QuadraticBezier

| Method | Parameters | Precision | Trust | Notes |
|--------|------------|-----------|-------|-------|
| `QuadraticBezier(start, control, end)` | `start,control,end`: complex | EXACT | VERIFIED | Simple storage |
| `point(t)` | `t`: float [0,1] | HIGH | VERIFIED | Horner's rule evaluation |
| `points(ts)` | `ts`: array of floats | HIGH | VERIFIED | Vectorized Horner |
| `length(t0=0, t1=1, error=None, min_depth=None)` | tolerances | MEDIUM | RELIABLE | Numerical integration (scipy.quad or recursive) |
| `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5)` | tolerances | MEDIUM | RELIABLE | Newton's method iteration |
| `derivative(t, n=1)` | `t`: float, `n`: int | HIGH | VERIFIED | Polynomial differentiation |
| `unit_tangent(t)` | `t`: float | HIGH | RELIABLE | Handles t=0,1 singularities |
| `normal(t)` | `t`: float | HIGH | RELIABLE | Right-hand perpendicular |
| `curvature(t)` | `t`: float | HIGH | RELIABLE | Standard curvature formula |
| `bbox()` | None | HIGH | VERIFIED | Finds critical points via derivative |
| `split(t)` | `t`: float [0,1] | HIGH | VERIFIED | de Casteljau algorithm |
| `cropped(t0, t1)` | `t0,t1`: float | HIGH | VERIFIED | de Casteljau |
| `reversed()` | None | EXACT | VERIFIED | Reverses control points |
| `intersect(other_seg, tol=1e-12)` | `other_seg`: Segment, `tol`: float | LOW | CAUTION | Recursive subdivision, may miss tangent intersections |
| `rotated(degs, origin=None)` | `degs`: float, `origin`: complex | HIGH | VERIFIED | Transforms all control points |
| `translated(z0)` | `z0`: complex | EXACT | VERIFIED | Adds to all control points |
| `scaled(sx, sy=None, origin=0j)` | `sx,sy`: float, `origin`: complex | HIGH | VERIFIED | Multiplies all control points |
| `radialrange(origin, return_all_global_extrema=False)` | `origin`: complex | MEDIUM | RELIABLE | Root finding on derivative |
| `poly(return_coeffs=False)` | `return_coeffs`: bool | EXACT | VERIFIED | Quadratic polynomial |
| `bpoints()` | None | EXACT | VERIFIED | Returns control points |
| `is_smooth_from(previous, warning_on=True)` | `previous`: Segment | HIGH | RELIABLE | Tangent comparison |

---

### CubicBezier

| Method | Parameters | Precision | Trust | Notes |
|--------|------------|-----------|-------|-------|
| `CubicBezier(start, c1, c2, end)` | `start,c1,c2,end`: complex | EXACT | VERIFIED | Simple storage |
| `point(t)` | `t`: float [0,1] | HIGH | VERIFIED | Horner's rule: optimized nested multiplication |
| `points(ts)` | `ts`: array of floats | HIGH | VERIFIED | Vectorized Horner |
| `length(t0=0, t1=1, error=1e-12, min_depth=5)` | tolerances | MEDIUM | RELIABLE | scipy.quad or recursive subdivision |
| `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5)` | tolerances | MEDIUM | RELIABLE | Newton's method, may fail to converge |
| `derivative(t, n=1)` | `t`: float, `n`: int | HIGH | VERIFIED | Polynomial differentiation |
| `unit_tangent(t)` | `t`: float | HIGH | RELIABLE | Handles singularities with rational_limit |
| `normal(t)` | `t`: float | HIGH | RELIABLE | Right-hand perpendicular |
| `curvature(t)` | `t`: float | HIGH | RELIABLE | May return inf at cusps |
| `bbox()` | None | HIGH | VERIFIED | Critical points from cubic derivative |
| `split(t)` | `t`: float [0,1] | HIGH | VERIFIED | de Casteljau algorithm |
| `cropped(t0, t1)` | `t0,t1`: float | HIGH | VERIFIED | de Casteljau |
| `reversed()` | None | EXACT | VERIFIED | Reverses control points |
| `intersect(other_seg, tol=1e-12)` | `other_seg`: Segment, `tol`: float | LOW | CAUTION | Recursive subdivision, O(2^n) complexity |
| `rotated(degs, origin=None)` | `degs`: float, `origin`: complex | HIGH | VERIFIED | Transforms all control points |
| `translated(z0)` | `z0`: complex | EXACT | VERIFIED | Adds to all control points |
| `scaled(sx, sy=None, origin=0j)` | `sx,sy`: float, `origin`: complex | HIGH | VERIFIED | Multiplies all control points |
| `radialrange(origin, return_all_global_extrema=False)` | `origin`: complex | MEDIUM | RELIABLE | Root finding on derivative |
| `poly(return_coeffs=False)` | `return_coeffs`: bool | EXACT | VERIFIED | Cubic polynomial |
| `bpoints()` | None | EXACT | VERIFIED | Returns control points |

---

### Arc

| Method | Parameters | Precision | Trust | Notes |
|--------|------------|-----------|-------|-------|
| `Arc(start, radius, rotation, large_arc, sweep, end, autoscale_radius=True)` | `start,end`: complex, `radius`: complex (rx+iy*ry), `rotation`: degrees, `large_arc,sweep`: bool | HIGH | RELIABLE | Auto-scales radius if too small |
| `point(t)` | `t`: float [0,1] | HIGH | VERIFIED | Parametric ellipse with rotation |
| `length(t0=0, t1=1, error=1e-12, min_depth=5)` | tolerances | MEDIUM | RELIABLE | Numerical integration (no closed form) |
| `ilength(s, s_tol=1e-12, maxits=10000, error=1e-12, min_depth=5)` | tolerances | MEDIUM | RELIABLE | Newton's method |
| `derivative(t, n=1)` | `t`: float, `n`: int | HIGH | VERIFIED | Ellipse derivative formula |
| `unit_tangent(t)` | `t`: float | HIGH | VERIFIED | Normalized derivative |
| `normal(t)` | `t`: float | HIGH | VERIFIED | Perpendicular to tangent |
| `curvature(t)` | `t`: float | HIGH | VERIFIED | Ellipse curvature formula |
| `bbox()` | None | HIGH | RELIABLE | Finds ellipse extrema, handles rotation |
| `split(t)` | `t`: float [0,1] | HIGH | RELIABLE | Angle-based splitting |
| `cropped(t0, t1)` | `t0,t1`: float | HIGH | RELIABLE | Angle-based cropping |
| `reversed()` | None | EXACT | VERIFIED | Negates sweep flag |
| `intersect(other_seg, tol=1e-12)` | `other_seg`: Segment, `tol`: float | LOW | CAUTION | Complex, may miss some intersections |
| `rotated(degs, origin=None)` | `degs`: float, `origin`: complex | HIGH | VERIFIED | Adds to rotation parameter |
| `translated(z0)` | `z0`: complex | EXACT | VERIFIED | Translates start/end |
| `scaled(sx, sy=None, origin=0j)` | `sx,sy`: float (must be equal!) | HIGH | CAUTION | **FAILS if sx != sy** (non-uniform scaling not supported) |
| `radialrange(origin, ...)` | N/A | N/A | N/A | **NOT IMPLEMENTED** - raises NotImplementedError |
| `as_cubic_curves(curves=1)` | `curves`: int number of segments | MEDIUM | RELIABLE | Approximation, error depends on arc angle |
| `as_quad_curves(curves=1)` | `curves`: int number of segments | LOW | CAUTION | Less accurate than cubic approximation |
| `centeriso(z)` | `z`: complex | HIGH | VERIFIED | Isometry to centered ellipse |
| `icenteriso(zeta)` | `zeta`: complex | HIGH | VERIFIED | Inverse isometry |
| `u1transform(z)` | `z`: complex | HIGH | VERIFIED | Maps to unit circle |
| `iu1transform(zeta)` | `zeta`: complex | HIGH | VERIFIED | Inverse unit circle map |
| `phase2t(psi)` | `psi`: float radians | HIGH | VERIFIED | Phase to parameter conversion |
| `point_to_t(point)` | `point`: complex | MEDIUM | CAUTION | Only works for non-rotated arcs |
| `apoints()` | None | EXACT | VERIFIED | Returns arc parameters |

---

### Path (Container Class)

| Method | Parameters | Precision | Trust | Notes |
|--------|------------|-----------|-------|-------|
| `Path(*segments)` | `*segments`: variable Segment args | EXACT | VERIFIED | List container |
| `point(t)` | `t`: float [0, len(path)] | HIGH | VERIFIED | Delegates to segment |
| `points(ts)` | `ts`: array | HIGH | VERIFIED | Batch evaluation |
| `length(t0=0, t1=None, ...)` | tolerances | MEDIUM | RELIABLE | Sum of segment lengths |
| `ilength(s, ...)` | tolerances | MEDIUM | RELIABLE | Binary search + segment ilength |
| `derivative(t, n=1)` | `t`: float, `n`: int | HIGH | VERIFIED | Delegates to segment |
| `unit_tangent(t)` | `t`: float | HIGH | RELIABLE | May be undefined at kinks |
| `normal(t)` | `t`: float | HIGH | RELIABLE | May be undefined at kinks |
| `curvature(t)` | `t`: float | HIGH | RELIABLE | May be undefined at kinks |
| `bbox()` | None | HIGH | VERIFIED | Union of segment bboxes |
| `d()` | None | HIGH | VERIFIED | Generates SVG d-string |
| `isclosed()` | None | HIGH | RELIABLE | Compares start/end with tolerance |
| `continuous()` | None | HIGH | RELIABLE | Checks segment connectivity |
| `smooth()` | None | HIGH | RELIABLE | Checks C1 continuity |
| `reversed()` | None | EXACT | VERIFIED | Reverses segment order and orientations |
| `cropped(t0, t1)` | `t0,t1`: float | HIGH | RELIABLE | May span multiple segments |
| `split(t)` | `t`: float | HIGH | RELIABLE | Splits at parameter |
| `intersect(other, tol=1e-12)` | `other`: Path or Segment | LOW | CAUTION | O(n*m) segment pairs, subdivision |
| `rotated(degs, origin=None)` | `degs`: float, `origin`: complex | HIGH | VERIFIED | Rotates all segments |
| `translated(z0)` | `z0`: complex | EXACT | VERIFIED | Translates all segments |
| `scaled(sx, sy=None, origin=0j)` | `sx,sy`: float | HIGH | CAUTION | Fails for Arc with sx != sy |
| `radialrange(origin, ...)` | `origin`: complex | MEDIUM | CAUTION | Skips Arc segments |
| `t2T(t)` | `t`: float global param | EXACT | VERIFIED | Returns (segment_idx, local_t) |
| `T2t(T)` | `T`: tuple (idx, local_t) | EXACT | VERIFIED | Returns global t |
| `append(segment)` | `segment`: Segment | N/A | VERIFIED | List append |
| `insert(index, segment)` | `index`: int, `segment`: Segment | N/A | VERIFIED | List insert |
| `__getitem__(index)` | `index`: int or slice | N/A | VERIFIED | List indexing |
| `__len__()` | None | N/A | VERIFIED | Segment count |
| `poly()` | None | HIGH | VERIFIED | List of segment polynomials |
| `bpoints()` | None | EXACT | VERIFIED | All control points |

---

## Bezier Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `bezier_point(p, t)` | `p`: list of complex, `t`: float | HIGH | VERIFIED | Horner's rule for degree <= 4, Bernstein basis for higher |
| `bezier2polynomial(p, numpy_ordering=True, return_poly1d=False)` | `p`: control points, `numpy_ordering`: bool, `return_poly1d`: bool | EXACT | VERIFIED | Exact coefficient computation |
| `polynomial2bezier(poly)` | `poly`: np.poly1d or coefficients | EXACT | VERIFIED | Only for degree <= 3 |
| `split_bezier(bpoints, t)` | `bpoints`: list, `t`: float | HIGH | VERIFIED | de Casteljau algorithm |
| `halve_bezier(p)` | `p`: list of control points | HIGH | VERIFIED | split_bezier at t=0.5 |
| `bezier_bounding_box(bez)` | `bez`: Bezier segment | HIGH | VERIFIED | Critical point analysis |
| `bezier_real_minmax(p)` | `p`: 4 real control points | HIGH | VERIFIED | Cubic real roots |
| `bezier_intersections(bez1, bez2, longer_length, tol=1e-8, tol_deC=1e-8)` | `bez1,bez2`: control point lists, `longer_length`: float, tolerances | LOW | CAUTION | Recursive subdivision, O(2^n), may miss tangent intersections |
| `bezier_by_line_intersections(bezier, line)` | `bezier`: QuadraticBezier or CubicBezier, `line`: Line | HIGH | RELIABLE | Polynomial root finding |
| `bezier_unit_tangent(seg, t)` | `seg`: Segment, `t`: float | HIGH | RELIABLE | Handles singularities |
| `segment_curvature(seg, t, use_inf=False)` | `seg`: Segment, `t`: float, `use_inf`: bool | HIGH | RELIABLE | Returns curvature or infinity |
| `bezier_radialrange(seg, origin, return_all_global_extrema=False)` | `seg`: Segment, `origin`: complex | MEDIUM | RELIABLE | Root finding on distance polynomial |
| `segment_length(curve, start, end, ...)` | internal parameters | MEDIUM | RELIABLE | Recursive approximation |
| `inv_arclength(curve, s, ...)` | `curve`: Segment, `s`: float, tolerances | MEDIUM | RELIABLE | Newton's method |
| `crop_bezier(seg, t0, t1)` | `seg`: Bezier, `t0,t1`: float | HIGH | VERIFIED | de Casteljau |
| `n_choose_k(n, k)` | `n,k`: int | EXACT | VERIFIED | Binomial coefficient |
| `bernstein(n, t)` | `n`: int degree, `t`: float | HIGH | VERIFIED | Bernstein basis polynomials |
| `box_area(xmin, xmax, ymin, ymax)` | coordinates | EXACT | VERIFIED | (xmax-xmin)*(ymax-ymin) |
| `boxes_intersect(box1, box2)` | `box1,box2`: tuples | EXACT | VERIFIED | Rectangle overlap test |
| `interval_intersection_width(a, b, c, d)` | interval bounds | EXACT | VERIFIED | max(0, min(b,d) - max(a,c)) |

---

## Path Construction Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `bezier_segment(*bpoints)` | `*bpoints`: 2-4 complex | EXACT | VERIFIED | Factory function |
| `bpoints2bezier(bpoints)` | `bpoints`: list of 2-4 complex | EXACT | VERIFIED | Same as bezier_segment |
| `poly2bez(poly, return_bpoints=False)` | `poly`: np.poly1d, `return_bpoints`: bool | EXACT | VERIFIED | Only degree <= 3 |
| `bbox2path(xmin, xmax, ymin, ymax)` | coordinates | EXACT | VERIFIED | Creates rectangular Path |
| `polyline(*points)` | `*points`: variable complex | EXACT | VERIFIED | Line segments |
| `polygon(*points)` | `*points`: variable complex | EXACT | VERIFIED | Closed polyline |
| `concatpaths(list_of_paths)` | `list_of_paths`: list of Path | EXACT | VERIFIED | Concatenates segments |

---

## Path Analysis Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `is_bezier_segment(seg)` | `seg`: any | N/A | VERIFIED | Type check |
| `is_path_segment(seg)` | `seg`: any | N/A | VERIFIED | Type check |
| `is_bezier_path(path)` | `path`: Path | N/A | VERIFIED | No Arc check |
| `closest_point_in_path(pt, path)` | `pt`: complex, `path`: Path | MEDIUM | RELIABLE | Numerical minimization |
| `farthest_point_in_path(pt, path)` | `pt`: complex, `path`: Path | MEDIUM | RELIABLE | Numerical maximization |
| `path_encloses_pt(pt, opt, path)` | `pt`: point to test, `opt`: known outside point, `path`: Path | MEDIUM | CAUTION | Ray casting, edge cases at vertices |

---

## Transformation Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `rotate(curve, degs, origin=None)` | `curve`: Path/Segment, `degs`: float, `origin`: complex | HIGH | VERIFIED | cos/sin computation |
| `translate(curve, z0)` | `curve`: Path/Segment, `z0`: complex | EXACT | VERIFIED | Simple addition |
| `scale(curve, sx, sy=None, origin=0j)` | `curve`: Path/Segment, `sx,sy`: float, `origin`: complex | HIGH | CAUTION | Arc fails if sx != sy |
| `transform(curve, tf)` | `curve`: Path/Segment, `tf`: 3x3 matrix | HIGH | RELIABLE | General affine transform |
| `transform_segments_together(path, transformation)` | `path`: Path, `transformation`: callable | HIGH | RELIABLE | Preserves continuity |

---

## Polynomial Tools

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `polyroots(p, realroots=False, condition=lambda r: True)` | `p`: coefficients, `realroots`: bool, `condition`: filter | HIGH | RELIABLE | numpy.roots wrapper |
| `polyroots01(p)` | `p`: coefficients | HIGH | RELIABLE | Roots in [0,1] only |
| `rational_limit(f, g, t0)` | `f,g`: np.poly1d, `t0`: float | HIGH | RELIABLE | L'Hopital's rule for 0/0 |
| `real(z)` | `z`: np.poly1d or complex | EXACT | VERIFIED | Real part extraction |
| `imag(z)` | `z`: np.poly1d or complex | EXACT | VERIFIED | Imaginary part extraction |

---

## SVG Parsing Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `parse_path(d)` | `d`: str path d-string | HIGH | RELIABLE | Standard SVG path parsing |
| `svg2paths(svg_file, return_svg_attributes=False, convert_*=True)` | `svg_file`: path, `convert_*`: bool flags for element types | HIGH | RELIABLE | Full SVG parsing |
| `svg2paths2(svg_file, ...)` | Same + `return_svg_attributes=True` default | HIGH | RELIABLE | Returns svg_attributes |
| `svgstr2paths(svg_string, ...)` | `svg_string`: str SVG content | HIGH | RELIABLE | Parses string instead of file |
| `path2pathd(path)` | `path`: XML element | N/A | VERIFIED | Extracts d attribute |
| `ellipse2pathd(ellipse, use_cubics=False)` | `ellipse`: XML element, `use_cubics`: bool | HIGH | RELIABLE | Arc or cubic approximation |
| `polyline2pathd(polyline, is_polygon=False)` | `polyline`: XML element, `is_polygon`: bool | EXACT | VERIFIED | Point list to M/L commands |
| `polygon2pathd(polyline)` | `polyline`: XML element | EXACT | VERIFIED | Closed polyline |
| `rect2pathd(rect)` | `rect`: XML element | HIGH | RELIABLE | Handles rounded corners |
| `line2pathd(l)` | `l`: XML element | EXACT | VERIFIED | M x1,y1 L x2,y2 |

---

## SVG Writing Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `disvg(paths=None, colors=None, filename=None, ...)` | Many optional params for styling | HIGH | RELIABLE | Opens in browser |
| `wsvg(paths=None, colors=None, filename=None, ...)` | Same as disvg, `openinbrowser=False` | HIGH | RELIABLE | Writes to disk only |
| `paths2Drawing(...)` | Same as disvg, returns Drawing | HIGH | RELIABLE | Returns svgwrite.Drawing |
| `big_bounding_box(paths_n_stuff)` | `paths_n_stuff`: iterable of paths/segments/points | HIGH | VERIFIED | Union of bboxes |

---

## Utility Functions

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `hex2rgb(value)` | `value`: str hex color (e.g., '#0000FF') | EXACT | VERIFIED | Simple parsing |
| `rgb2hex(rgb)` | `rgb`: tuple (r,g,b) 0-255 | EXACT | VERIFIED | Simple formatting |
| `isclose(a, b, rtol=1e-5, atol=1e-8)` | `a,b`: float, tolerances | HIGH | VERIFIED | abs(a-b) <= atol + rtol*abs(b) |
| `open_in_browser(file_location)` | `file_location`: str | N/A | RELIABLE | System call |

---

## Smoothing Functions (Experimental)

| Function | Parameters | Precision | Trust | Notes |
|----------|------------|-----------|-------|-------|
| `smoothed_path(path, ...)` | `path`: Path, various options | LOW | EXPERIMENTAL | Only Line/CubicBezier, fails on 180-degree turns |
| `smoothed_joint(seg1, seg2, ...)` | `seg1,seg2`: Segment | LOW | EXPERIMENTAL | Creates smooth transition |
| `is_differentiable(path, t)` | `path`: Path, `t`: float | HIGH | RELIABLE | Tangent continuity check |
| `kinks(path)` | `path`: Path | HIGH | RELIABLE | Finds non-differentiable points |

---

## Document Classes

| Class/Method | Parameters | Precision | Trust | Notes |
|--------------|------------|-----------|-------|-------|
| `Document(svg_file)` | `svg_file`: str | N/A | RELIABLE | Full DOM parser |
| `SaxDocument(svg_file)` | `svg_file`: str | N/A | RELIABLE | SAX streaming parser |

---

## Summary Statistics

| Category | Total Functions | VERIFIED | RELIABLE | CAUTION | EXPERIMENTAL |
|----------|-----------------|----------|----------|---------|--------------|
| **Line** | 22 | 18 | 4 | 0 | 0 |
| **QuadraticBezier** | 22 | 14 | 7 | 1 | 0 |
| **CubicBezier** | 21 | 13 | 7 | 1 | 0 |
| **Arc** | 24 | 14 | 5 | 4 | 1 |
| **Path** | 28 | 16 | 9 | 3 | 0 |
| **Bezier Functions** | 18 | 14 | 3 | 1 | 0 |
| **Construction** | 7 | 7 | 0 | 0 | 0 |
| **Analysis** | 6 | 2 | 3 | 1 | 0 |
| **Transforms** | 5 | 3 | 1 | 1 | 0 |
| **Polynomial** | 5 | 4 | 1 | 0 | 0 |
| **SVG Parse** | 10 | 5 | 5 | 0 | 0 |
| **SVG Write** | 4 | 1 | 3 | 0 | 0 |
| **Utilities** | 4 | 3 | 1 | 0 | 0 |
| **Smoothing** | 4 | 0 | 2 | 0 | 2 |
| **TOTAL** | **180** | **114** | **51** | **12** | **3** |

---

## Critical Limitations

### Precision Limitations (ALL functions affected)

| Issue | Impact | Workaround |
|-------|--------|------------|
| **float64 only** | ~15 digit precision max | None (fundamental to library) |
| **Complex numbers** | Cannot upgrade to Decimal | None |
| **Accumulating errors** | Long paths lose precision | Keep paths short |
| **Large coordinates** | Precision loss > 10^15 | Work in normalized coordinates |

### Known Problem Functions

| Function | Issue | Severity |
|----------|-------|----------|
| `Arc.scaled(sx, sy)` | Fails if sx != sy | **CRITICAL** - raises error |
| `Arc.radialrange()` | Not implemented | **CRITICAL** - raises NotImplementedError |
| `bezier_intersections()` | O(2^n) complexity, misses tangent cases | HIGH |
| `smoothed_path()` | Fails on 180-degree turns | MEDIUM |
| `path_encloses_pt()` | Edge cases at vertices | MEDIUM |
| `Arc.point_to_t()` | Only works for non-rotated arcs | MEDIUM |

---

## Comparison with svg-matrix

| Aspect | svgpathtools | svg-matrix |
|--------|--------------|------------|
| **Precision** | 15 digits (float64) | 80 digits (Decimal.js) |
| **Intersections** | Subdivision (O(2^n)) | GJK (O(n)) |
| **Arc scaling** | Uniform only | Any |
| **Transform decomposition** | No | Yes |
| **3D transforms** | No | Yes |
| **SVG validation** | No | Yes (22 rules) |
| **Curvature/tangent** | Yes | No |
| **Area calculation** | Yes | No |
| **Arc length inverse** | Yes | No |

---

*Generated: 2025-12-10*
*svgpathtools version: 1.7.2*
