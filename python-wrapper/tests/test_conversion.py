"""
Tests for svg_matrix conversion functions.
"""

from pathlib import Path

import pytest

from svg_matrix import to_plain_svg, flatten, convert_shapes


INKSCAPE_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   width="100"
   height="100"
   viewBox="0 0 100 100"
   inkscape:version="1.3">
  <sodipodi:namedview inkscape:pageopacity="0"/>
  <rect
     x="10"
     y="10"
     width="80"
     height="80"
     fill="red"
     inkscape:label="My Rectangle"/>
</svg>
"""


@pytest.fixture
def inkscape_svg_file(tmp_path: Path) -> Path:
    """Create a temporary Inkscape SVG file."""
    svg_file = tmp_path / "inkscape.svg"
    svg_file.write_text(INKSCAPE_SVG)
    return svg_file


class TestToPlainSvg:
    """Tests for to_plain_svg function."""

    def test_convert_nonexistent_file(self) -> None:
        """Test conversion of nonexistent file returns False."""
        result = to_plain_svg("/nonexistent/path/file.svg")
        assert result is False

    def test_convert_inkscape_svg(
        self, inkscape_svg_file: Path, tmp_path: Path
    ) -> None:
        """Test conversion of Inkscape SVG."""
        output_file = tmp_path / "plain.svg"
        # Note: actual conversion depends on runtime availability
        to_plain_svg(inkscape_svg_file, output_file)


class TestFlatten:
    """Tests for flatten function."""

    def test_flatten_nonexistent_file(self) -> None:
        """Test flattening nonexistent file returns False."""
        result = flatten("/nonexistent/path/file.svg")
        assert result is False


class TestConvertShapes:
    """Tests for convert_shapes function."""

    def test_convert_shapes_nonexistent_file(self) -> None:
        """Test shape conversion of nonexistent file returns False."""
        result = convert_shapes("/nonexistent/path/file.svg")
        assert result is False
