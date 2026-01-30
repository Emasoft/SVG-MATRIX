"""
svg-matrix: Python wrapper for svg-matrix SVG processing library.

This package provides Python bindings to the svg-matrix Node.js library,
enabling arbitrary-precision SVG optimization, validation, and manipulation.

Example usage:
    from svg_matrix import validate_svg, optimize_svg, to_plain_svg

    # Validate an SVG file
    result = validate_svg("icon.svg")
    if result["valid"]:
        print("SVG is valid!")

    # Optimize an SVG file
    optimize_svg("input.svg", "output.svg")

    # Convert Inkscape SVG to plain SVG
    to_plain_svg("inkscape.svg", "plain.svg")
"""

__version__ = "1.3.6"

from svg_matrix.validation import validate_svg, validate_svg_async
from svg_matrix.optimization import optimize_svg, optimize_paths
from svg_matrix.conversion import to_plain_svg, flatten, convert_shapes
from svg_matrix.cli import run_svgm, run_svg_matrix, get_info

__all__ = [
    # Version
    "__version__",
    # Validation
    "validate_svg",
    "validate_svg_async",
    # Optimization
    "optimize_svg",
    "optimize_paths",
    # Conversion
    "to_plain_svg",
    "flatten",
    "convert_shapes",
    # CLI access
    "run_svgm",
    "run_svg_matrix",
    "get_info",
]
