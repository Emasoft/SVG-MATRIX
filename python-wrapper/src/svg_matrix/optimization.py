"""
SVG optimization functions.

Provides optimization of SVG files for reduced file size and improved rendering.
"""

from pathlib import Path
from typing import Optional, Union

from svg_matrix._runtime import run_command


def optimize_svg(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    *,
    precision: int = 6,
    minify: bool = True,
    remove_comments: bool = True,
    remove_metadata: bool = True,
) -> bool:
    """
    Optimize an SVG file.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)
        precision: Decimal precision for numbers (default: 6)
        minify: Whether to minify output (default: True)
        remove_comments: Whether to remove comments (default: True)
        remove_metadata: Whether to remove metadata (default: True)

    Returns:
        True if optimization succeeded, False otherwise

    Example:
        >>> optimize_svg("large.svg", "small.svg", precision=4)
        True
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svgm", str(input_path.resolve())]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    args.extend(["-p", str(precision)])

    if not minify:
        args.append("--no-minify")

    if not remove_comments:
        args.append("--keep-comments")

    if not remove_metadata:
        args.append("--keep-metadata")

    try:
        result = run_command(args, timeout=120)
        return result.returncode == 0
    except Exception:
        return False


def optimize_paths(
    input_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    *,
    precision: int = 6,
) -> bool:
    """
    Optimize only path data in an SVG file.

    This is a lighter optimization that focuses on path data compression
    without modifying other elements.

    Args:
        input_path: Path to input SVG file
        output_path: Path for output file (None to overwrite input)
        precision: Decimal precision for numbers (default: 6)

    Returns:
        True if optimization succeeded, False otherwise
    """
    input_path = Path(input_path)
    if not input_path.exists():
        return False

    args = ["svgm", str(input_path.resolve()), "--paths-only"]

    if output_path:
        args.extend(["-o", str(Path(output_path).resolve())])

    args.extend(["-p", str(precision)])

    try:
        result = run_command(args, timeout=120)
        return result.returncode == 0
    except Exception:
        return False


def batch_optimize(
    input_dir: Union[str, Path],
    output_dir: Optional[Union[str, Path]] = None,
    *,
    precision: int = 6,
    recursive: bool = False,
) -> dict:
    """
    Optimize all SVG files in a directory.

    Args:
        input_dir: Input directory path
        output_dir: Output directory (None to overwrite in place)
        precision: Decimal precision for numbers
        recursive: Whether to process subdirectories

    Returns:
        Dictionary with counts: {"processed": N, "succeeded": M, "failed": K}
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir) if output_dir else input_dir

    if not input_dir.is_dir():
        return {"processed": 0, "succeeded": 0, "failed": 0, "error": "Not a directory"}

    output_dir.mkdir(parents=True, exist_ok=True)

    pattern = "**/*.svg" if recursive else "*.svg"
    svg_files = list(input_dir.glob(pattern))

    processed = 0
    succeeded = 0
    failed = 0

    for svg_file in svg_files:
        processed += 1

        # Calculate relative path for output
        rel_path = svg_file.relative_to(input_dir)
        out_file = output_dir / rel_path

        # Ensure output directory exists
        out_file.parent.mkdir(parents=True, exist_ok=True)

        if optimize_svg(svg_file, out_file, precision=precision):
            succeeded += 1
        else:
            failed += 1

    return {"processed": processed, "succeeded": succeeded, "failed": failed}
