"""
SVG conversion functions.

Provides conversion between SVG formats (Inkscape to plain SVG, etc.)
and various transformations.
"""

from pathlib import Path
from typing import Optional, Union

from svg_matrix._runtime import run_command


def to_plain_svg(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
) -> bool:
    """
    Convert Inkscape SVG to plain SVG.

    Removes Inkscape-specific namespaces and elements (sodipodi:*, inkscape:*)
    while preserving the visual appearance.

    Args:
        input_path: Path to Inkscape SVG file
        output_path: Path for output file (None to overwrite input)

    Returns:
        True if conversion succeeded, False otherwise

    Example:
        >>> to_plain_svg("drawing.svg", "drawing_plain.svg")
        True
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svg-matrix", "to-plain", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    try:
        result = run_command(args, timeout=60)
        return result.returncode == 0
    except Exception:
        return False


def flatten(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    *,
    flatten_transforms: bool = True,
    flatten_groups: bool = True,
    flatten_clipaths: bool = True,
) -> bool:
    """
    Flatten an SVG by baking transforms, ungrouping, and removing clipPaths.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)
        flatten_transforms: Whether to bake transforms into coordinates
        flatten_groups: Whether to ungroup nested groups
        flatten_clipaths: Whether to apply and remove clipPaths

    Returns:
        True if flattening succeeded, False otherwise
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svg-matrix", "flatten", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    if not flatten_transforms:
        args.append("--no-transforms")

    if not flatten_groups:
        args.append("--no-groups")

    if not flatten_clipaths:
        args.append("--no-clippaths")

    try:
        result = run_command(args, timeout=60)
        return result.returncode == 0
    except Exception:
        return False


def convert_shapes(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
) -> bool:
    """
    Convert basic shapes (rect, circle, ellipse, line, polygon, polyline) to paths.

    This enables more aggressive path optimization and ensures compatibility
    with tools that only understand path elements.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)

    Returns:
        True if conversion succeeded, False otherwise
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svg-matrix", "shapes-to-paths", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    try:
        result = run_command(args, timeout=60)
        return result.returncode == 0
    except Exception:
        return False


def embed_fonts(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
) -> bool:
    """
    Embed external fonts into an SVG file.

    Converts font references to embedded data URIs or inline font definitions.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)

    Returns:
        True if embedding succeeded, False otherwise
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svgfonts", "embed", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    try:
        result = run_command(args, timeout=120)
        return result.returncode == 0
    except Exception:
        return False


def convert_text_to_paths(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
) -> bool:
    """
    Convert text elements to path outlines.

    This ensures text renders correctly without requiring font availability.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)

    Returns:
        True if conversion succeeded, False otherwise
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svg-matrix", "text-to-paths", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    try:
        result = run_command(args, timeout=120)
        return result.returncode == 0
    except Exception:
        return False
