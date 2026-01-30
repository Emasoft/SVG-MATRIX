"""
CLI wrapper functions and entry points.

Provides direct access to the svg-matrix CLI tools from Python.
"""

import json
import sys
from pathlib import Path
from typing import List, Optional, Dict, Any, Union

from svg_matrix._runtime import run_command, ensure_runtime


def run_svgm(args: List[str], *, timeout: int = 120) -> Dict[str, Any]:
    """
    Run the svgm CLI with given arguments.

    Args:
        args: Command-line arguments (e.g., ["input.svg", "-o", "output.svg"])
        timeout: Timeout in seconds

    Returns:
        Dictionary with:
        - returncode (int): Process return code
        - stdout (str): Standard output
        - stderr (str): Standard error

    Example:
        >>> result = run_svgm(["--help"])
        >>> print(result["stdout"])
    """
    try:
        result = run_command(["svgm"] + args, timeout=timeout)
        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": str(e),
        }


def run_svg_matrix(args: List[str], *, timeout: int = 120) -> Dict[str, Any]:
    """
    Run the svg-matrix CLI with given arguments.

    Args:
        args: Command-line arguments (e.g., ["info", "file.svg"])
        timeout: Timeout in seconds

    Returns:
        Dictionary with returncode, stdout, stderr
    """
    try:
        result = run_command(["svg-matrix"] + args, timeout=timeout)
        return {
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except Exception as e:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": str(e),
        }


def get_info(svg_path: Union[str, Path]) -> Dict[str, Any]:
    """
    Get information about an SVG file.

    Args:
        svg_path: Path to SVG file

    Returns:
        Dictionary with SVG information (dimensions, element counts, etc.)
    """
    result = run_svg_matrix(["info", str(svg_path)])

    if result["returncode"] == 0:
        try:
            return json.loads(result["stdout"])
        except json.JSONDecodeError:
            return {"raw_output": result["stdout"]}

    return {"error": result["stderr"] or "Failed to get info"}


# CLI entry points for pyproject.toml scripts


def svgm_main() -> None:
    """Entry point for svgm-py command."""
    ensure_runtime()
    result = run_svgm(sys.argv[1:], timeout=300)
    if result["stdout"]:
        print(result["stdout"], end="")
    if result["stderr"]:
        print(result["stderr"], end="", file=sys.stderr)
    sys.exit(result["returncode"])


def svg_matrix_main() -> None:
    """Entry point for svg-matrix-py command."""
    ensure_runtime()
    result = run_svg_matrix(sys.argv[1:], timeout=300)
    if result["stdout"]:
        print(result["stdout"], end="")
    if result["stderr"]:
        print(result["stderr"], end="", file=sys.stderr)
    sys.exit(result["returncode"])


def svgfonts_main() -> None:
    """Entry point for svgfonts-py command."""
    ensure_runtime()
    try:
        result = run_command(["svgfonts"] + sys.argv[1:], timeout=300)
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        sys.exit(result.returncode)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def svglinter_main() -> None:
    """Entry point for svglinter-py command."""
    ensure_runtime()
    try:
        result = run_command(["svglinter"] + sys.argv[1:], timeout=300)
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        sys.exit(result.returncode)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
