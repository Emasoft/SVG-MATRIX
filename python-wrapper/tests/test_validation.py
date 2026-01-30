"""
Tests for svg_matrix validation functions.
"""

import tempfile
from pathlib import Path

import pytest

from svg_matrix import validate_svg, validate_svg_async


# Sample SVGs for testing
VALID_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80" fill="red"/>
</svg>
"""

# Malformed XML - completely broken structure
INVALID_SVG = """This is not XML at all!
<svg xmlns="http://www.w3.org/2000/svg"
  <<<invalid>>>
</broken>
"""


@pytest.fixture
def valid_svg_file(tmp_path: Path) -> Path:
    """Create a temporary valid SVG file."""
    svg_file = tmp_path / "valid.svg"
    svg_file.write_text(VALID_SVG)
    return svg_file


@pytest.fixture
def invalid_svg_file(tmp_path: Path) -> Path:
    """Create a temporary invalid SVG file."""
    svg_file = tmp_path / "invalid.svg"
    svg_file.write_text(INVALID_SVG)
    return svg_file


class TestValidateSvg:
    """Tests for validate_svg function."""

    def test_validate_valid_file(self, valid_svg_file: Path) -> None:
        """Test validation of a valid SVG file."""
        result = validate_svg(valid_svg_file)
        assert result["error"] is None
        # Note: actual validation depends on runtime availability

    def test_validate_nonexistent_file(self) -> None:
        """Test validation of a nonexistent file."""
        result = validate_svg("/nonexistent/path/file.svg")
        assert result["valid"] is False
        assert "not found" in result["error"].lower() or result["issues"]

    def test_validate_svg_string(self) -> None:
        """Test validation of SVG string content."""
        result = validate_svg(VALID_SVG)
        assert result["error"] is None

    def test_validate_invalid_svg_string(self) -> None:
        """Test validation of malformed/non-SVG content returns invalid or error."""
        result = validate_svg(INVALID_SVG)
        # Should either be marked invalid, have issues, or have an error
        is_invalid = not result["valid"]
        has_issues = len(result.get("issues", [])) > 0
        has_error = result.get("error") is not None
        assert is_invalid or has_issues or has_error, f"Expected invalid result, got: {result}"


class TestValidateSvgAsync:
    """Tests for async validation."""

    @pytest.mark.asyncio
    async def test_async_validate(self, valid_svg_file: Path) -> None:
        """Test async validation works."""
        result = await validate_svg_async(valid_svg_file)
        assert result["error"] is None


class TestRuntimeDetection:
    """Tests for runtime detection."""

    def test_runtime_error_message(self) -> None:
        """Test that runtime error has helpful message."""
        from svg_matrix._runtime import RuntimeError

        error = RuntimeError("test")
        assert str(error) == "test"
