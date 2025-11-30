/**
 * Text-to-Path Module - Convert SVG text elements to path elements
 *
 * Converts text, tspan, and textPath elements to path elements for
 * precise clipping and transformation operations.
 *
 * Note: Requires opentype.js for font parsing (optional dependency).
 * Falls back to bounding box approximation if fonts unavailable.
 *
 * @module text-to-path
 */

import Decimal from 'decimal.js';
import { Matrix } from './matrix.js';
import * as Transforms2D from './transforms2d.js';
import * as PolygonClip from './polygon-clip.js';

Decimal.set({ precision: 80 });

const D = x => (x instanceof Decimal ? x : new Decimal(x));

// Default font metrics when actual font unavailable
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_UNITS_PER_EM = 1000;
const DEFAULT_ASCENDER = 800;
const DEFAULT_DESCENDER = -200;
const DEFAULT_CAP_HEIGHT = 700;

/**
 * Text alignment options for horizontal positioning.
 *
 * Controls where text is anchored relative to its x coordinate:
 * - START: Text begins at x coordinate (default, left-aligned for LTR text)
 * - MIDDLE: Text is centered on x coordinate
 * - END: Text ends at x coordinate (right-aligned for LTR text)
 *
 * @enum {string}
 * @example
 * // Left-align text starting at x=100
 * textToPath("Hello", { x: 100, textAnchor: TextAnchor.START })
 *
 * // Center text on x=100
 * textToPath("Hello", { x: 100, textAnchor: TextAnchor.MIDDLE })
 *
 * // Right-align text ending at x=100
 * textToPath("Hello", { x: 100, textAnchor: TextAnchor.END })
 */
export const TextAnchor = {
  START: 'start',
  MIDDLE: 'middle',
  END: 'end'
};

/**
 * Baseline alignment options for vertical positioning.
 *
 * Controls where text sits relative to its y coordinate based on font metrics:
 * - AUTO/ALPHABETIC: y is the alphabetic baseline (bottom of most letters, default)
 * - MIDDLE/CENTRAL: y is the vertical center of the text
 * - HANGING: y is the top of hanging scripts (e.g., Devanagari)
 * - TEXT_BEFORE_EDGE: y is the top edge of the em box
 * - TEXT_AFTER_EDGE: y is the bottom edge of the em box
 * - IDEOGRAPHIC: y is the ideographic baseline (bottom for CJK characters)
 * - MATHEMATICAL: y is the mathematical baseline
 *
 * Font metrics terminology:
 * - Ascent: Distance from baseline to top of tallest glyphs (e.g., 'd', 'h')
 * - Descent: Distance from baseline to bottom of lowest glyphs (e.g., 'g', 'p')
 * - Em box: The design space containing all glyphs (ascent + descent)
 *
 * @enum {string}
 * @example
 * // Text sits on baseline at y=100 (default)
 * textToPath("Hello", { y: 100, dominantBaseline: DominantBaseline.ALPHABETIC })
 *
 * // Text is vertically centered at y=100
 * textToPath("Hello", { y: 100, dominantBaseline: DominantBaseline.MIDDLE })
 *
 * // Top of text aligns with y=100
 * textToPath("Hello", { y: 100, dominantBaseline: DominantBaseline.HANGING })
 */
export const DominantBaseline = {
  AUTO: 'auto',
  MIDDLE: 'middle',
  HANGING: 'hanging',
  ALPHABETIC: 'alphabetic',
  IDEOGRAPHIC: 'ideographic',
  MATHEMATICAL: 'mathematical',
  CENTRAL: 'central',
  TEXT_AFTER_EDGE: 'text-after-edge',
  TEXT_BEFORE_EDGE: 'text-before-edge'
};

/**
 * Parse CSS font-size value and convert to pixels.
 *
 * Supports common CSS units:
 * - px: Pixels (1:1 ratio)
 * - pt: Points (1pt = 1.333px, based on 96 DPI)
 * - em/rem: Relative to default font size (16px)
 * - %: Percentage of default font size
 *
 * @param {string|number} value - Font size value (e.g., "16px", "1.5em", "12pt", "120%")
 * @returns {number} Font size in pixels
 *
 * @example
 * parseFontSize("16px")    // → 16
 * parseFontSize("12pt")    // → 16 (12 * 1.333)
 * parseFontSize("1.5em")   // → 24 (1.5 * 16)
 * parseFontSize("150%")    // → 24 (1.5 * 16)
 * parseFontSize(20)        // → 20 (assumes px)
 * parseFontSize("invalid") // → 16 (default)
 */
export function parseFontSize(value) {
  if (!value) return DEFAULT_FONT_SIZE;

  const match = value.match(/^([\d.]+)(px|pt|em|rem|%)?$/i);
  if (!match) return DEFAULT_FONT_SIZE;

  const num = parseFloat(match[1]);
  const unit = (match[2] || 'px').toLowerCase();

  switch (unit) {
    case 'px': return num;
    case 'pt': return num * 1.333; // 1pt = 1.333px
    case 'em':
    case 'rem': return num * DEFAULT_FONT_SIZE;
    case '%': return num / 100 * DEFAULT_FONT_SIZE;
    default: return num;
  }
}

/**
 * Calculate text metrics (dimensions and baseline offsets) for a string.
 *
 * Uses actual font metrics when available via opentype.js, otherwise
 * falls back to character-count estimation.
 *
 * Font metrics explained:
 * - Width: Horizontal advance width of the text
 * - Height: Total vertical space (ascent + descent)
 * - Ascent: Distance from baseline to top of tallest glyphs (e.g., 'd', 'h', 'b')
 * - Descent: Distance from baseline to bottom of lowest glyphs (e.g., 'g', 'p', 'y')
 *
 * The baseline is the invisible line that most letters "sit" on. Letters like
 * 'a', 'e', 'n' rest on the baseline, while 'd' extends above (ascent) and 'g'
 * extends below (descent).
 *
 * @param {string} text - Text content to measure
 * @param {Object} [style={}] - Text style options
 * @param {string} [style.fontSize='16px'] - Font size (CSS value)
 * @param {string} [style.fontFamily='sans-serif'] - Font family name
 * @param {Object|null} [font=null] - Opentype.js font object for accurate metrics
 * @returns {Object} Text metrics
 * @returns {Decimal} returns.width - Text width in pixels
 * @returns {Decimal} returns.height - Text height in pixels (ascent + descent)
 * @returns {Decimal} returns.ascent - Distance from baseline to top
 * @returns {Decimal} returns.descent - Distance from baseline to bottom (positive value)
 *
 * @example
 * // With font object (accurate)
 * const font = opentype.loadSync('Arial.ttf');
 * const metrics = measureText("Hello", { fontSize: "20px" }, font);
 * // metrics.width → Decimal(55.2)
 * // metrics.ascent → Decimal(16.0)
 * // metrics.descent → Decimal(4.0)
 *
 * @example
 * // Without font (estimated)
 * const metrics = measureText("Hello", { fontSize: "16px" });
 * // metrics.width → Decimal(44.0) // Estimated: 5 chars * 0.55 * 16px
 */
export function measureText(text, style = {}, font = null) {
  const fontSize = parseFontSize(style.fontSize);
  const scale = fontSize / DEFAULT_UNITS_PER_EM;

  if (font && font.getAdvanceWidth) {
    // Use actual font metrics
    const width = font.getAdvanceWidth(text, fontSize);
    const ascent = font.ascender * scale;
    const descent = -font.descender * scale;

    return {
      width: D(width),
      height: D(ascent + descent),
      ascent: D(ascent),
      descent: D(descent)
    };
  }

  // Fallback: estimate based on character count
  // Average character width is ~0.5em for proportional fonts
  const avgCharWidth = fontSize * 0.55;
  const width = text.length * avgCharWidth;
  const ascent = DEFAULT_ASCENDER * scale;
  const descent = -DEFAULT_DESCENDER * scale;

  return {
    width: D(width),
    height: D(ascent + descent),
    ascent: D(ascent),
    descent: D(descent)
  };
}

/**
 * Convert a single character to SVG path data using font glyph outlines.
 *
 * A glyph is the visual representation of a character in a specific font.
 * This function extracts the glyph's vector outline and converts it to
 * SVG path commands (M, L, C, Z, etc.).
 *
 * When font is unavailable, returns a rectangular approximation based on
 * estimated character dimensions.
 *
 * @param {string} char - Single character to convert to path
 * @param {Object|null} font - Opentype.js font object (if null, uses fallback)
 * @param {number} fontSize - Font size in pixels
 * @param {number} [x=0] - X position of the character baseline
 * @param {number} [y=0] - Y position of the character baseline
 * @returns {string} SVG path data string (e.g., "M10,20 L30,40 Z")
 *
 * @example
 * // With font object (produces actual glyph outline)
 * const font = opentype.loadSync('Arial.ttf');
 * const path = getCharPath('A', font, 24, 100, 50);
 * // → "M100,50 L112,20 L124,50 Z M106,35 L118,35 Z"
 *
 * @example
 * // Without font (produces rectangle approximation)
 * const path = getCharPath('A', null, 16, 0, 0);
 * // → "M0,-12.8 L8.8,-12.8 L8.8,3.2 L0,3.2 Z"
 */
export function getCharPath(char, font, fontSize, x = 0, y = 0) {
  if (font && font.getPath) {
    const path = font.getPath(char, x, y, fontSize);
    return path.toPathData();
  }

  // Fallback: return a rectangle approximation
  const metrics = measureText(char, { fontSize: fontSize + 'px' });
  const width = Number(metrics.width);
  const ascent = Number(metrics.ascent);
  const descent = Number(metrics.descent);

  return `M${x},${y - ascent} L${x + width},${y - ascent} L${x + width},${y + descent} L${x},${y + descent} Z`;
}

/**
 * Convert a text string to SVG path data with full layout support.
 *
 * This is the main text-to-path conversion function. It:
 * 1. Measures the text to determine its bounding box
 * 2. Applies text-anchor alignment (horizontal positioning)
 * 3. Applies dominant-baseline alignment (vertical positioning)
 * 4. Converts each character to a glyph path
 * 5. Positions each glyph with letter-spacing applied
 *
 * Text rendering concepts:
 * - Advance width: The horizontal distance to move after rendering a character
 * - Letter spacing: Additional space added between characters
 * - Kerning: Font-specific spacing adjustments between character pairs (not yet supported)
 *
 * @param {string} text - Text content to convert
 * @param {Object} [options={}] - Layout and styling options
 * @param {number} [options.x=0] - X coordinate of text anchor point
 * @param {number} [options.y=0] - Y coordinate of text baseline
 * @param {number|string} [options.fontSize=16] - Font size (number in px or CSS string)
 * @param {string} [options.fontFamily='sans-serif'] - Font family name
 * @param {string} [options.textAnchor='start'] - Horizontal alignment (start|middle|end)
 * @param {string} [options.dominantBaseline='auto'] - Vertical alignment
 * @param {number|string} [options.letterSpacing=0] - Extra space between characters
 * @param {Object|null} [options.font=null] - Opentype.js font object for accurate rendering
 * @returns {string} Combined SVG path data for all characters (space-separated)
 *
 * @example
 * // Basic usage with default alignment (left-aligned, sitting on baseline)
 * const path = textToPath("Hello", { x: 100, y: 100, fontSize: 20 });
 *
 * @example
 * // Center-aligned, vertically centered text
 * const path = textToPath("Hello", {
 *   x: 100,
 *   y: 100,
 *   fontSize: 20,
 *   textAnchor: TextAnchor.MIDDLE,
 *   dominantBaseline: DominantBaseline.MIDDLE
 * });
 *
 * @example
 * // With font object and letter spacing
 * const font = opentype.loadSync('Arial.ttf');
 * const path = textToPath("Spaced", {
 *   x: 0,
 *   y: 50,
 *   fontSize: 24,
 *   letterSpacing: 5,
 *   font: font
 * });
 */
export function textToPath(text, options = {}) {
  const {
    x = 0,
    y = 0,
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = 'sans-serif',
    textAnchor = TextAnchor.START,
    dominantBaseline = DominantBaseline.AUTO,
    letterSpacing = 0,
    font = null
  } = options;

  if (!text || text.length === 0) return '';

  const fontSizePx = parseFontSize(fontSize + (typeof fontSize === 'number' ? 'px' : ''));
  const metrics = measureText(text, { fontSize: fontSizePx + 'px' }, font);

  // Calculate starting position based on text-anchor
  let startX = D(x);
  switch (textAnchor) {
    case TextAnchor.MIDDLE:
      startX = startX.minus(metrics.width.div(2));
      break;
    case TextAnchor.END:
      startX = startX.minus(metrics.width);
      break;
  }

  // Adjust for dominant-baseline
  let baselineY = D(y);
  switch (dominantBaseline) {
    case DominantBaseline.MIDDLE:
    case DominantBaseline.CENTRAL:
      baselineY = baselineY.plus(metrics.ascent.minus(metrics.height.div(2)));
      break;
    case DominantBaseline.HANGING:
    case DominantBaseline.TEXT_BEFORE_EDGE:
      baselineY = baselineY.plus(metrics.ascent);
      break;
    case DominantBaseline.IDEOGRAPHIC:
    case DominantBaseline.TEXT_AFTER_EDGE:
      baselineY = baselineY.minus(metrics.descent);
      break;
    // AUTO and ALPHABETIC use default baseline
  }

  // Build path for each character
  const paths = [];
  let currentX = startX;
  const letterSpacingPx = parseFontSize(letterSpacing + (typeof letterSpacing === 'number' ? 'px' : ''));

  for (const char of text) {
    if (char === ' ') {
      // Space - just advance
      const spaceMetrics = measureText(' ', { fontSize: fontSizePx + 'px' }, font);
      currentX = currentX.plus(spaceMetrics.width).plus(letterSpacingPx);
      continue;
    }

    const charPath = getCharPath(char, font, fontSizePx, Number(currentX), Number(baselineY));
    paths.push(charPath);

    const charMetrics = measureText(char, { fontSize: fontSizePx + 'px' }, font);
    currentX = currentX.plus(charMetrics.width).plus(letterSpacingPx);
  }

  return paths.join(' ');
}

/**
 * Convert text to a polygon representation of its bounding box.
 *
 * This function is used for clipping operations. Instead of converting
 * text to actual glyph paths (which is computationally expensive), it
 * creates a simple rectangular polygon that approximates the text's area.
 *
 * The polygon is a rectangle with 4 vertices, positioned according to
 * text-anchor and dominant-baseline alignment rules.
 *
 * Use case: When you need to clip text against shapes, this provides
 * a fast approximation. For precise clipping of actual letter shapes,
 * use textToPath() instead.
 *
 * @param {Object} textElement - Text element configuration
 * @param {number} [textElement.x=0] - X coordinate
 * @param {number} [textElement.y=0] - Y coordinate
 * @param {number|string} [textElement.fontSize=16] - Font size
 * @param {string} [textElement.textAnchor='start'] - Horizontal alignment
 * @param {string} [textElement.dominantBaseline='auto'] - Vertical alignment
 * @param {string} textElement.text - Text content
 * @param {Object} [options={}] - Additional options
 * @param {number} [options.samples=10] - Unused (reserved for future path sampling)
 * @param {Object|null} [options.font=null] - Opentype.js font for accurate metrics
 * @returns {Array<Array<Decimal>>} Array of 4 polygon vertices [[x,y], [x,y], [x,y], [x,y]]
 *
 * @example
 * // Get bounding box polygon for text
 * const polygon = textToPolygon({
 *   x: 100,
 *   y: 100,
 *   fontSize: 20,
 *   text: "Hello",
 *   textAnchor: TextAnchor.START
 * });
 * // → [[Decimal(100), Decimal(84)], [Decimal(155), Decimal(84)],
 * //    [Decimal(155), Decimal(104)], [Decimal(100), Decimal(104)]]
 *
 * @example
 * // Use for clipping operations
 * const textBox = textToPolygon({ x: 50, y: 50, text: "Clip me" });
 * const circle = createCirclePolygon(50, 50, 30);
 * const clipped = PolygonClip.polygonIntersection(textBox, circle);
 */
export function textToPolygon(textElement, options = {}) {
  const {
    x = 0,
    y = 0,
    fontSize = DEFAULT_FONT_SIZE,
    textAnchor = TextAnchor.START,
    dominantBaseline = DominantBaseline.AUTO,
    text = ''
  } = textElement;

  const { samples = 10, font = null } = options;
  const fontSizePx = parseFontSize(fontSize + (typeof fontSize === 'number' ? 'px' : ''));
  const metrics = measureText(text, { fontSize: fontSizePx + 'px' }, font);

  // Calculate bounding box
  let startX = D(x);
  switch (textAnchor) {
    case TextAnchor.MIDDLE:
      startX = startX.minus(metrics.width.div(2));
      break;
    case TextAnchor.END:
      startX = startX.minus(metrics.width);
      break;
  }

  let topY = D(y).minus(metrics.ascent);
  switch (dominantBaseline) {
    case DominantBaseline.MIDDLE:
    case DominantBaseline.CENTRAL:
      topY = D(y).minus(metrics.height.div(2));
      break;
    case DominantBaseline.HANGING:
    case DominantBaseline.TEXT_BEFORE_EDGE:
      topY = D(y);
      break;
    case DominantBaseline.IDEOGRAPHIC:
    case DominantBaseline.TEXT_AFTER_EDGE:
      topY = D(y).minus(metrics.height).plus(metrics.descent);
      break;
  }

  // Return bounding box as polygon
  const endX = startX.plus(metrics.width);
  const bottomY = topY.plus(metrics.height);

  return [
    PolygonClip.point(startX, topY),
    PolygonClip.point(endX, topY),
    PolygonClip.point(endX, bottomY),
    PolygonClip.point(startX, bottomY)
  ];
}

/**
 * Parse an SVG <text> DOM element into a structured data object.
 *
 * Extracts all relevant attributes and child elements (tspan) from an
 * SVG text element, converting them into a format suitable for processing.
 *
 * SVG text structure:
 * - <text>: Main container with position and style
 * - <tspan>: Inline spans within text that can have different positions/styles
 * - Direct text nodes: Text content not wrapped in tspan
 *
 * Position attributes:
 * - x, y: Absolute position
 * - dx, dy: Relative offset from x, y
 *
 * Style can come from:
 * 1. Inline style attribute: style="font-size: 20px; fill: red"
 * 2. Direct attributes: font-size="20" fill="red"
 * 3. CSS classes (not handled by this function)
 *
 * @param {Element} textElement - SVG <text> DOM element to parse
 * @returns {Object} Structured text data
 * @returns {number} returns.x - X coordinate
 * @returns {number} returns.y - Y coordinate
 * @returns {number} returns.dx - X offset
 * @returns {number} returns.dy - Y offset
 * @returns {string} returns.text - Direct text content (excluding tspans)
 * @returns {Object} returns.style - Extracted style properties
 * @returns {string} returns.style.fontSize - Font size (e.g., "16px")
 * @returns {string} returns.style.fontFamily - Font family name
 * @returns {string} returns.style.fontWeight - Font weight (normal|bold|100-900)
 * @returns {string} returns.style.fontStyle - Font style (normal|italic|oblique)
 * @returns {string} returns.style.textAnchor - Horizontal alignment
 * @returns {string} returns.style.dominantBaseline - Vertical alignment
 * @returns {string} returns.style.letterSpacing - Letter spacing
 * @returns {string} returns.style.fill - Fill color
 * @returns {Array<Object>} returns.tspans - Array of tspan elements
 * @returns {string|null} returns.transform - Transform attribute value
 *
 * @example
 * // Parse a simple text element
 * const svg = document.querySelector('svg');
 * const textEl = svg.querySelector('text');
 * const data = parseTextElement(textEl);
 * // data.text → "Hello"
 * // data.style.fontSize → "20px"
 *
 * @example
 * // Parse text with tspans
 * // <text x="10" y="20">Hello <tspan dy="5">World</tspan></text>
 * const data = parseTextElement(textEl);
 * // data.text → "Hello"
 * // data.tspans[0].text → "World"
 * // data.tspans[0].dy → 5
 */
export function parseTextElement(textElement) {
  const data = {
    x: parseFloat(textElement.getAttribute('x') || '0'),
    y: parseFloat(textElement.getAttribute('y') || '0'),
    dx: parseFloat(textElement.getAttribute('dx') || '0'),
    dy: parseFloat(textElement.getAttribute('dy') || '0'),
    text: '',
    style: {},
    tspans: [],
    transform: textElement.getAttribute('transform') || null
  };

  // Extract style attributes
  const style = textElement.getAttribute('style') || '';
  const styleObj = {};
  style.split(';').forEach(prop => {
    const [key, value] = prop.split(':').map(s => s.trim());
    if (key && value) styleObj[key] = value;
  });

  data.style = {
    fontSize: styleObj['font-size'] || textElement.getAttribute('font-size') || '16px',
    fontFamily: styleObj['font-family'] || textElement.getAttribute('font-family') || 'sans-serif',
    fontWeight: styleObj['font-weight'] || textElement.getAttribute('font-weight') || 'normal',
    fontStyle: styleObj['font-style'] || textElement.getAttribute('font-style') || 'normal',
    textAnchor: styleObj['text-anchor'] || textElement.getAttribute('text-anchor') || 'start',
    dominantBaseline: styleObj['dominant-baseline'] || textElement.getAttribute('dominant-baseline') || 'auto',
    letterSpacing: styleObj['letter-spacing'] || textElement.getAttribute('letter-spacing') || '0',
    fill: styleObj['fill'] || textElement.getAttribute('fill') || 'black'
  };

  // Get direct text content (excluding tspan content)
  const directText = [];
  for (const node of textElement.childNodes) {
    if (node.nodeType === 3) { // Text node
      directText.push(node.textContent);
    }
  }
  data.text = directText.join('').trim();

  // Parse tspan children
  const tspans = textElement.querySelectorAll('tspan');
  tspans.forEach(tspan => {
    data.tspans.push({
      x: tspan.getAttribute('x') ? parseFloat(tspan.getAttribute('x')) : null,
      y: tspan.getAttribute('y') ? parseFloat(tspan.getAttribute('y')) : null,
      dx: parseFloat(tspan.getAttribute('dx') || '0'),
      dy: parseFloat(tspan.getAttribute('dy') || '0'),
      text: tspan.textContent || ''
    });
  });

  return data;
}

/**
 * Convert parsed text data to SVG path element data with tspan support.
 *
 * This is a high-level function that processes an entire text element
 * including all its tspan children. It:
 * 1. Converts the main text content to path data
 * 2. Converts each tspan to path data at its specific position
 * 3. Combines all paths into a single path data string
 * 4. Preserves fill color and transform attributes
 *
 * tspan positioning rules:
 * - If tspan has x/y: Use those absolute coordinates
 * - If tspan has only dx/dy: Add to previous position
 * - If tspan has both: x/y sets absolute, dx/dy adds offset
 *
 * The function tracks the "current position" which advances after each
 * tspan based on its text width.
 *
 * @param {Object} textData - Parsed text data from parseTextElement()
 * @param {number} textData.x - Text X position
 * @param {number} textData.y - Text Y position
 * @param {number} textData.dx - X offset
 * @param {number} textData.dy - Y offset
 * @param {string} textData.text - Main text content
 * @param {Object} textData.style - Text styling
 * @param {Array<Object>} textData.tspans - Array of tspan data
 * @param {string|null} textData.transform - Transform attribute
 * @param {Object} [options={}] - Conversion options
 * @param {Object|null} [options.font=null] - Opentype.js font object
 * @returns {Object} Path element data ready for SVG rendering
 * @returns {string} returns.d - Combined SVG path data string
 * @returns {string} returns.fill - Fill color
 * @returns {string|null} returns.transform - Transform attribute (preserved)
 *
 * @example
 * // Convert simple text
 * const textData = parseTextElement(textElement);
 * const pathData = textElementToPath(textData);
 * // pathData.d → "M10,20 L15,20 C20,25..." (path commands)
 * // pathData.fill → "black"
 * // pathData.transform → null
 *
 * @example
 * // Convert text with tspans and transform
 * // <text x="10" y="20" transform="rotate(45)">
 * //   Hello <tspan dy="5">World</tspan>
 * // </text>
 * const pathData = textElementToPath(textData, { font: myFont });
 * // pathData.d → "M10,20 L... M15,25 L..." (main text + tspan paths)
 * // pathData.transform → "rotate(45)"
 */
export function textElementToPath(textData, options = {}) {
  const { font = null } = options;

  const pathOptions = {
    x: textData.x + textData.dx,
    y: textData.y + textData.dy,
    fontSize: textData.style.fontSize,
    fontFamily: textData.style.fontFamily,
    textAnchor: textData.style.textAnchor,
    dominantBaseline: textData.style.dominantBaseline,
    letterSpacing: textData.style.letterSpacing,
    font
  };

  // Convert main text
  let pathData = textToPath(textData.text, pathOptions);

  // Convert tspans
  let currentX = pathOptions.x;
  let currentY = pathOptions.y;

  for (const tspan of textData.tspans) {
    const tspanX = tspan.x !== null ? tspan.x : currentX + tspan.dx;
    const tspanY = tspan.y !== null ? tspan.y : currentY + tspan.dy;

    const tspanPath = textToPath(tspan.text, {
      ...pathOptions,
      x: tspanX,
      y: tspanY
    });

    if (tspanPath) {
      pathData += ' ' + tspanPath;
    }

    // Update position for next tspan
    const metrics = measureText(tspan.text, { fontSize: pathOptions.fontSize }, font);
    currentX = tspanX + Number(metrics.width);
    currentY = tspanY;
  }

  return {
    d: pathData.trim(),
    fill: textData.style.fill,
    transform: textData.transform
  };
}

/**
 * Calculate the axis-aligned bounding box for text.
 *
 * Returns the smallest rectangle that completely contains the text,
 * accounting for text-anchor alignment. This is useful for:
 * - Hit testing (checking if point is inside text area)
 * - Layout calculations (positioning elements around text)
 * - Viewport optimization (determining what text is visible)
 *
 * The bounding box includes all text and tspans combined.
 *
 * Note: This returns the bounding box in the text's local coordinate space,
 * before any transforms are applied. If textData has a transform attribute,
 * you'll need to apply it separately to get screen coordinates.
 *
 * @param {Object} textData - Parsed text data from parseTextElement()
 * @param {number} textData.x - Text X position
 * @param {number} textData.y - Text Y position
 * @param {number} textData.dx - X offset
 * @param {number} textData.dy - Y offset
 * @param {string} textData.text - Text content
 * @param {Object} textData.style - Text styling
 * @param {string} textData.style.fontSize - Font size
 * @param {string} textData.style.textAnchor - Horizontal alignment
 * @param {Array<Object>} textData.tspans - Array of tspan data
 * @param {Object} [options={}] - Options
 * @param {Object|null} [options.font=null] - Opentype.js font object
 * @returns {Object} Axis-aligned bounding box
 * @returns {number} returns.x - Left edge X coordinate
 * @returns {number} returns.y - Top edge Y coordinate
 * @returns {number} returns.width - Box width in pixels
 * @returns {number} returns.height - Box height in pixels
 *
 * @example
 * // Get bounding box for left-aligned text
 * const textData = { x: 100, y: 50, dx: 0, dy: 0, text: "Hello",
 *                    style: { fontSize: "20px", textAnchor: "start" },
 *                    tspans: [] };
 * const bbox = getTextBBox(textData);
 * // bbox → { x: 100, y: 34, width: 55, height: 20 }
 *
 * @example
 * // Get bounding box for center-aligned text
 * const textData = { x: 100, y: 50, dx: 0, dy: 0, text: "Hello",
 *                    style: { fontSize: "20px", textAnchor: "middle" },
 *                    tspans: [] };
 * const bbox = getTextBBox(textData);
 * // bbox → { x: 72.5, y: 34, width: 55, height: 20 }
 */
export function getTextBBox(textData, options = {}) {
  const { font = null } = options;

  const fontSize = parseFontSize(textData.style.fontSize);
  let totalText = textData.text;

  for (const tspan of textData.tspans) {
    totalText += tspan.text;
  }

  const metrics = measureText(totalText, { fontSize: fontSize + 'px' }, font);

  let x = D(textData.x + textData.dx);
  const textAnchor = textData.style.textAnchor;

  switch (textAnchor) {
    case TextAnchor.MIDDLE:
      x = x.minus(metrics.width.div(2));
      break;
    case TextAnchor.END:
      x = x.minus(metrics.width);
      break;
  }

  return {
    x: Number(x),
    y: textData.y + textData.dy - Number(metrics.ascent),
    width: Number(metrics.width),
    height: Number(metrics.height)
  };
}

/**
 * Clip text against a polygon using bounding box intersection.
 *
 * This function performs polygon clipping between a text's bounding box
 * and an arbitrary clipping polygon. It's used to determine which parts
 * of the text are visible within a clipping region.
 *
 * Clipping process:
 * 1. Convert text to its bounding box polygon (4 vertices)
 * 2. Compute intersection with the clip polygon
 * 3. Return resulting polygon(s) representing visible area
 *
 * The result is an array of polygons because clipping can produce:
 * - Empty array: Text is completely clipped (not visible)
 * - One polygon: Simple intersection
 * - Multiple polygons: If clip region creates disconnected visible areas
 *
 * Note: This clips the text's bounding box, not the actual glyph shapes.
 * For precise glyph-level clipping, convert text to paths first using
 * textToPath() then clip those paths.
 *
 * @param {Object} textData - Parsed text data from parseTextElement()
 * @param {number} textData.x - Text X position
 * @param {number} textData.y - Text Y position
 * @param {number} textData.dx - X offset
 * @param {number} textData.dy - Y offset
 * @param {string} textData.text - Text content
 * @param {Object} textData.style - Text styling with fontSize, textAnchor, dominantBaseline
 * @param {Array<Array<Decimal>>} clipPolygon - Clipping polygon vertices [[x,y], [x,y], ...]
 * @param {Object} [options={}] - Options
 * @param {Object|null} [options.font=null] - Opentype.js font object
 * @returns {Array<Array<Array<Decimal>>>} Array of clipped polygons (may be empty)
 *
 * @example
 * // Clip text against a rectangular region
 * const textData = parseTextElement(textElement);
 * const clipRect = [
 *   PolygonClip.point(0, 0),
 *   PolygonClip.point(100, 0),
 *   PolygonClip.point(100, 100),
 *   PolygonClip.point(0, 100)
 * ];
 * const clipped = clipText(textData, clipRect);
 * // clipped → [[[x1,y1], [x2,y2], ...]] (visible portion)
 *
 * @example
 * // Check if text is completely clipped
 * const clipped = clipText(textData, smallClipRegion);
 * if (clipped.length === 0) {
 *   console.log("Text is not visible");
 * }
 */
export function clipText(textData, clipPolygon, options = {}) {
  const textPolygon = textToPolygon({
    x: textData.x + textData.dx,
    y: textData.y + textData.dy,
    fontSize: textData.style.fontSize,
    textAnchor: textData.style.textAnchor,
    dominantBaseline: textData.style.dominantBaseline,
    text: textData.text
  }, options);

  return PolygonClip.polygonIntersection(textPolygon, clipPolygon);
}
