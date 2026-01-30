"""
SVG validation functions.

Provides validation of SVG files against SVG 1.1 and SVG 2.0 specifications.
"""

import asyncio
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Union

from svg_matrix._runtime import run_command


def validate_svg(
    svg_input: Union[str, Path],
    *,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Validate an SVG file or string.

    Args:
        svg_input: Path to SVG file or SVG string content
        strict: If True, treat warnings as errors

    Returns:
        Dictionary with:
        - valid (bool): Whether the SVG is valid
        - issues (list): List of issues found
        - error (str|None): Error message if validation failed

    Example:
        >>> result = validate_svg("icon.svg")
        >>> if result["valid"]:
        ...     print("SVG is valid!")
        >>> else:
        ...     for issue in result["issues"]:
        ...         print(f"Issue: {issue['reason']}")
    """
    svg_path = Path(svg_input) if not str(svg_input).strip().startswith("<") else None

    # If it's a file path
    if svg_path and svg_path.exists():
        return _validate_file(svg_path, strict=strict)

    # If it looks like SVG content
    if str(svg_input).strip().startswith("<"):
        return _validate_string(str(svg_input), strict=strict)

    # File doesn't exist
    return {
        "valid": False,
        "issues": [],
        "error": f"File not found: {svg_input}",
    }


def _validate_file(svg_path: Path, *, strict: bool = False) -> Dict[str, Any]:
    """Validate an SVG file using the CLI."""
    try:
        args = ["svglinter", str(svg_path.resolve())]
        if strict:
            args.append("--strict")

        result = run_command(args, timeout=30)

        # svglinter returns 0 for valid, non-zero for invalid
        if result.returncode == 0:
            return {"valid": True, "issues": [], "error": None}

        # Try to parse JSON output
        try:
            output = result.stdout.strip()
            if output.startswith("{"):
                data = json.loads(output)
                return {
                    "valid": False,
                    "issues": data.get("issues", []),
                    "error": None,
                }
        except json.JSONDecodeError:
            pass

        # Fallback: parse stderr as issues
        issues = []
        if result.stderr:
            for line in result.stderr.strip().split("\n"):
                if line:
                    issues.append({"reason": line})

        return {
            "valid": False,
            "issues": issues or [{"reason": "Validation failed"}],
            "error": None,
        }

    except Exception as e:
        return {"valid": False, "issues": [], "error": str(e)}


def _validate_string(svg_content: str, *, strict: bool = False) -> Dict[str, Any]:
    """Validate SVG string content using stdin."""
    import tempfile

    # Write to temp file and validate
    with tempfile.NamedTemporaryFile(mode="w", suffix=".svg", delete=False) as f:
        f.write(svg_content)
        temp_path = Path(f.name)

    try:
        return _validate_file(temp_path, strict=strict)
    finally:
        temp_path.unlink(missing_ok=True)


async def validate_svg_async(
    svg_input: Union[str, Path],
    *,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Async version of validate_svg.

    Args:
        svg_input: Path to SVG file or SVG string content
        strict: If True, treat warnings as errors

    Returns:
        Dictionary with validation results
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: validate_svg(svg_input, strict=strict)
    )


def get_svg_info(svg_path: Union[str, Path]) -> Dict[str, Any]:
    """
    Get information about an SVG file.

    Args:
        svg_path: Path to SVG file

    Returns:
        Dictionary with SVG metadata (dimensions, elements, etc.)
    """
    try:
        result = run_command(["svg-matrix", "info", str(svg_path)], timeout=30)

        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"info": result.stdout.strip(), "error": None}

        return {"error": result.stderr.strip() or "Failed to get info"}

    except Exception as e:
        return {"error": str(e)}
