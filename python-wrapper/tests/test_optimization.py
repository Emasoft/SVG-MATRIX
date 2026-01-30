"""
Tests for svg_matrix optimization functions.
"""

from pathlib import Path

import pytest

from svg_matrix import optimize_svg, optimize_paths


SAMPLE_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <!-- This is a comment -->
  <rect x="10" y="10" width="80" height="80" fill="red"/>
  <circle cx="50" cy="50" r="30" fill="blue"/>
</svg>
"""


@pytest.fixture
def sample_svg_file(tmp_path: Path) -> Path:
    """Create a temporary SVG file."""
    svg_file = tmp_path / "sample.svg"
    svg_file.write_text(SAMPLE_SVG)
    return svg_file


class TestOptimizeSvg:
    """Tests for optimize_svg function."""

    def test_optimize_nonexistent_file(self) -> None:
        """Test optimization of nonexistent file returns False."""
        result = optimize_svg("/nonexistent/path/file.svg")
        assert result is False

    def test_optimize_to_output_file(
        self, sample_svg_file: Path, tmp_path: Path
    ) -> None:
        """Test optimization with output file."""
        output_file = tmp_path / "optimized.svg"
        # Note: actual optimization depends on runtime availability
        # This test verifies the function doesn't crash
        optimize_svg(sample_svg_file, output_file)

    def test_optimize_with_precision(
        self, sample_svg_file: Path, tmp_path: Path
    ) -> None:
        """Test optimization with custom precision."""
        output_file = tmp_path / "optimized.svg"
        optimize_svg(sample_svg_file, output_file, precision=3)


class TestOptimizePaths:
    """Tests for optimize_paths function."""

    def test_optimize_paths_nonexistent(self) -> None:
        """Test path optimization of nonexistent file."""
        result = optimize_paths("/nonexistent/path/file.svg")
        assert result is False
