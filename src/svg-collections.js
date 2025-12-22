/**
 * SVG Collections - SVGO-compatible reference data
 *
 * This module provides comprehensive SVG element and attribute definitions,
 * default values, and categorization data equivalent to SVGO's _collections.js
 */

// ============================================================================
// INHERITABLE ATTRIBUTES
// ============================================================================

/**
 * CSS properties that inherit from parent elements in SVG
 * Reference: SVG 1.1 spec, CSS inheritance rules
 */
export const inheritableAttrs = new Set([
  'clip-rule',
  'color',
  'color-interpolation',
  'color-interpolation-filters',
  'color-profile',
  'color-rendering',
  'cursor',
  'direction',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'glyph-orientation-horizontal',
  'glyph-orientation-vertical',
  'image-rendering',
  'letter-spacing',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'paint-order',
  'pointer-events',
  'shape-rendering',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-rendering',
  'visibility',
  'word-spacing',
  'writing-mode',
]);

/**
 * Presentation attributes that do NOT inherit
 */
export const nonInheritableAttrs = new Set([
  'clip-path',
  'display',
  'filter',
  'mask',
  'opacity',
  'text-decoration',
  'transform',
  'unicode-bidi',
]);

// ============================================================================
// REFERENCE PROPERTIES
// ============================================================================

/**
 * Attributes that can contain url() references to other elements
 */
export const referencesProps = new Set([
  'clip-path',
  'color-profile',
  'fill',
  'filter',
  'href',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
  'style',
  'xlink:href',
]);

// ============================================================================
// ELEMENT GROUPS
// ============================================================================

export const elemsGroups = {
  animation: new Set([
    // Include both mixed-case and lowercase for case-insensitive matching
    'animate', 'animateColor', 'animatecolor', 'animateMotion', 'animatemotion',
    'animateTransform', 'animatetransform', 'set'
  ]),
  descriptive: new Set([
    'desc', 'metadata', 'title'
  ]),
  shape: new Set([
    'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect'
  ]),
  structural: new Set([
    'defs', 'g', 'svg', 'symbol', 'use'
  ]),
  paintServer: new Set([
    'hatch', 'linearGradient', 'meshGradient', 'pattern', 'radialGradient', 'solidColor'
  ]),
  nonRendering: new Set([
    // Include both mixed-case and lowercase for case-insensitive matching
    'clipPath', 'clippath', 'filter', 'linearGradient', 'lineargradient',
    'marker', 'mask', 'pattern', 'radialGradient', 'radialgradient',
    'solidColor', 'solidcolor', 'symbol'
  ]),
  container: new Set([
    'a', 'defs', 'g', 'marker', 'mask', 'pattern', 'svg', 'switch', 'symbol'
  ]),
  textContent: new Set([
    'altGlyph', 'altGlyphDef', 'altGlyphItem', 'glyph', 'glyphRef',
    'text', 'textPath', 'tref', 'tspan'
  ]),
  filterPrimitive: new Set([
    'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
    'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
    'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
    'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
    'feOffset', 'feSpecularLighting', 'feTile', 'feTurbulence'
  ]),
  lightSource: new Set([
    'feDistantLight', 'fePointLight', 'feSpotLight'
  ]),
};

// ============================================================================
// EDITOR NAMESPACES
// ============================================================================

/**
 * Namespaces used by various SVG editors that can be safely removed
 */
export const editorNamespaces = new Set([
  'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://inkscape.sourceforge.net/DTD/sodipodi-0.dtd',
  'http://www.inkscape.org/namespaces/inkscape',
  'http://www.bohemiancoding.com/sketch/ns',
  'http://ns.adobe.com/AdobeIllustrator/10.0/',
  'http://ns.adobe.com/Graphs/1.0/',
  'http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/',
  'http://ns.adobe.com/Variables/1.0/',
  'http://ns.adobe.com/SaveForWeb/1.0/',
  'http://ns.adobe.com/Extensibility/1.0/',
  'http://ns.adobe.com/Flows/1.0/',
  'http://ns.adobe.com/ImageReplacement/1.0/',
  'http://ns.adobe.com/GenericCustomNamespace/1.0/',
  'http://ns.adobe.com/XPath/1.0/',
  'http://schemas.microsoft.com/visio/2003/SVGExtensions/',
  'http://taptrix.com/vectorillustrator/svg_extensions',
  'http://www.figma.com/figma/ns',
  'http://purl.org/dc/elements/1.1/',
  'http://creativecommons.org/ns#',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'http://www.serif.com/',
  'http://www.vector.evaxdesign.sk',
  // Additional editor namespaces
  'http://www.corel.com/coreldraw/svg',
  'http://gravit.io/ns',
  'http://serif.com/affinity',
  'http://canva.com/ns',
]);

// ============================================================================
// NAMED COLORS
// ============================================================================

/**
 * SVG named colors to hex values
 * Note: CSS color names are case-insensitive per spec.
 * All keys are lowercase. When looking up colors, normalize input with .toLowerCase()
 */
export const colorsNames = {
  'aliceblue': '#f0f8ff',
  'antiquewhite': '#faebd7',
  'aqua': '#0ff',
  'aquamarine': '#7fffd4',
  'azure': '#f0ffff',
  'beige': '#f5f5dc',
  'bisque': '#ffe4c4',
  'black': '#000',
  'blanchedalmond': '#ffebcd',
  'blue': '#00f',
  'blueviolet': '#8a2be2',
  'brown': '#a52a2a',
  'burlywood': '#deb887',
  'cadetblue': '#5f9ea0',
  'chartreuse': '#7fff00',
  'chocolate': '#d2691e',
  'coral': '#ff7f50',
  'cornflowerblue': '#6495ed',
  'cornsilk': '#fff8dc',
  'crimson': '#dc143c',
  'cyan': '#0ff',
  'darkblue': '#00008b',
  'darkcyan': '#008b8b',
  'darkgoldenrod': '#b8860b',
  'darkgray': '#a9a9a9',
  'darkgreen': '#006400',
  'darkgrey': '#a9a9a9',
  'darkkhaki': '#bdb76b',
  'darkmagenta': '#8b008b',
  'darkolivegreen': '#556b2f',
  'darkorange': '#ff8c00',
  'darkorchid': '#9932cc',
  'darkred': '#8b0000',
  'darksalmon': '#e9967a',
  'darkseagreen': '#8fbc8f',
  'darkslateblue': '#483d8b',
  'darkslategray': '#2f4f4f',
  'darkslategrey': '#2f4f4f',
  'darkturquoise': '#00ced1',
  'darkviolet': '#9400d3',
  'deeppink': '#ff1493',
  'deepskyblue': '#00bfff',
  'dimgray': '#696969',
  'dimgrey': '#696969',
  'dodgerblue': '#1e90ff',
  'firebrick': '#b22222',
  'floralwhite': '#fffaf0',
  'forestgreen': '#228b22',
  'fuchsia': '#f0f',
  'gainsboro': '#dcdcdc',
  'ghostwhite': '#f8f8ff',
  'gold': '#ffd700',
  'goldenrod': '#daa520',
  'gray': '#808080',
  'green': '#008000',
  'greenyellow': '#adff2f',
  'grey': '#808080',
  'honeydew': '#f0fff0',
  'hotpink': '#ff69b4',
  'indianred': '#cd5c5c',
  'indigo': '#4b0082',
  'ivory': '#fffff0',
  'khaki': '#f0e68c',
  'lavender': '#e6e6fa',
  'lavenderblush': '#fff0f5',
  'lawngreen': '#7cfc00',
  'lemonchiffon': '#fffacd',
  'lightblue': '#add8e6',
  'lightcoral': '#f08080',
  'lightcyan': '#e0ffff',
  'lightgoldenrodyellow': '#fafad2',
  'lightgray': '#d3d3d3',
  'lightgreen': '#90ee90',
  'lightgrey': '#d3d3d3',
  'lightpink': '#ffb6c1',
  'lightsalmon': '#ffa07a',
  'lightseagreen': '#20b2aa',
  'lightskyblue': '#87cefa',
  'lightslategray': '#789',
  'lightslategrey': '#789',
  'lightsteelblue': '#b0c4de',
  'lightyellow': '#ffffe0',
  'lime': '#0f0',
  'limegreen': '#32cd32',
  'linen': '#faf0e6',
  'magenta': '#f0f',
  'maroon': '#800000',
  'mediumaquamarine': '#66cdaa',
  'mediumblue': '#0000cd',
  'mediumorchid': '#ba55d3',
  'mediumpurple': '#9370db',
  'mediumseagreen': '#3cb371',
  'mediumslateblue': '#7b68ee',
  'mediumspringgreen': '#00fa9a',
  'mediumturquoise': '#48d1cc',
  'mediumvioletred': '#c71585',
  'midnightblue': '#191970',
  'mintcream': '#f5fffa',
  'mistyrose': '#ffe4e1',
  'moccasin': '#ffe4b5',
  'navajowhite': '#ffdead',
  'navy': '#000080',
  'oldlace': '#fdf5e6',
  'olive': '#808000',
  'olivedrab': '#6b8e23',
  'orange': '#ffa500',
  'orangered': '#ff4500',
  'orchid': '#da70d6',
  'palegoldenrod': '#eee8aa',
  'palegreen': '#98fb98',
  'paleturquoise': '#afeeee',
  'palevioletred': '#db7093',
  'papayawhip': '#ffefd5',
  'peachpuff': '#ffdab9',
  'peru': '#cd853f',
  'pink': '#ffc0cb',
  'plum': '#dda0dd',
  'powderblue': '#b0e0e6',
  'purple': '#800080',
  'rebeccapurple': '#639',
  'red': '#f00',
  'rosybrown': '#bc8f8f',
  'royalblue': '#4169e1',
  'saddlebrown': '#8b4513',
  'salmon': '#fa8072',
  'sandybrown': '#f4a460',
  'seagreen': '#2e8b57',
  'seashell': '#fff5ee',
  'sienna': '#a0522d',
  'silver': '#c0c0c0',
  'skyblue': '#87ceeb',
  'slateblue': '#6a5acd',
  'slategray': '#708090',
  'slategrey': '#708090',
  'snow': '#fffafa',
  'springgreen': '#00ff7f',
  'steelblue': '#4682b4',
  'tan': '#d2b48c',
  'teal': '#008080',
  'thistle': '#d8bfd8',
  'tomato': '#ff6347',
  'turquoise': '#40e0d0',
  'violet': '#ee82ee',
  'wheat': '#f5deb3',
  'white': '#fff',
  'whitesmoke': '#f5f5f5',
  'yellow': '#ff0',
  'yellowgreen': '#9acd32',
};

/**
 * Hex values that have shorter color names
 */
export const colorsShortNames = {
  '#f0ffff': 'azure',
  '#f5f5dc': 'beige',
  '#ffe4c4': 'bisque',
  '#a52a2a': 'brown',
  '#ff7f50': 'coral',
  '#ffd700': 'gold',
  '#808080': 'gray',
  '#008000': 'green',
  '#4b0082': 'indigo',
  '#fffff0': 'ivory',
  '#f0e68c': 'khaki',
  '#faf0e6': 'linen',
  '#800000': 'maroon',
  '#000080': 'navy',
  '#808000': 'olive',
  '#ffa500': 'orange',
  '#da70d6': 'orchid',
  '#cd853f': 'peru',
  '#ffc0cb': 'pink',
  '#dda0dd': 'plum',
  '#800080': 'purple',
  '#f00': 'red',
  '#fa8072': 'salmon',
  '#a0522d': 'sienna',
  '#c0c0c0': 'silver',
  '#fffafa': 'snow',
  '#d2b48c': 'tan',
  '#008080': 'teal',
  '#ff6347': 'tomato',
  '#ee82ee': 'violet',
  '#f5deb3': 'wheat',
  '#fff': 'white',
  '#ff0': 'yellow',
};

// ============================================================================
// COLOR PROPERTIES
// ============================================================================

/**
 * Attributes that accept color values
 */
export const colorsProps = new Set([
  'color',
  'fill',
  'flood-color',
  'lighting-color',
  'stop-color',
  'stroke',
]);

// ============================================================================
// ALL SVG ELEMENTS
// ============================================================================

/**
 * Complete list of known SVG elements
 */
export const knownElements = new Set([
  // Structural elements
  'svg', 'g', 'defs', 'symbol', 'use',
  // Shape elements
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  // Text elements
  'text', 'tspan', 'tref', 'textPath', 'altGlyph', 'altGlyphDef',
  'altGlyphItem', 'glyph', 'glyphRef',
  // Gradient elements
  'linearGradient', 'radialGradient', 'meshGradient', 'stop',
  // Container elements
  'a', 'marker', 'mask', 'pattern', 'clipPath', 'switch',
  // Filter elements
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur',
  'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
  'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence',
  // Descriptive elements
  'title', 'desc', 'metadata',
  // Animation elements
  'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'mpath',
  // Other elements
  'image', 'foreignObject', 'view', 'style', 'script',
  'solidColor', 'hatch', 'hatchpath',
]);

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * General presentation attribute default values
 */
export const presentationDefaults = {
  // Fill defaults
  'fill': '#000',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',

  // Stroke defaults
  'stroke': 'none',
  'stroke-width': '1',
  'stroke-opacity': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',

  // Opacity/visibility defaults
  'opacity': '1',
  'visibility': 'visible',
  'display': 'inline',

  // Clip/mask defaults
  'clip': 'auto',
  'clip-path': 'none',
  'clip-rule': 'nonzero',
  'mask': 'none',

  // Marker defaults
  'marker-start': 'none',
  'marker-mid': 'none',
  'marker-end': 'none',

  // Color defaults
  'stop-color': '#000',
  'stop-opacity': '1',
  'flood-color': '#000',
  'flood-opacity': '1',
  'lighting-color': '#fff',

  // Rendering defaults
  'color-interpolation': 'sRGB',
  'color-interpolation-filters': 'linearRGB',
  'color-rendering': 'auto',
  'shape-rendering': 'auto',
  'text-rendering': 'auto',
  'image-rendering': 'auto',

  // Paint defaults
  'paint-order': 'normal',
  'vector-effect': 'none',

  // Text defaults
  'text-anchor': 'start',
  'text-overflow': 'clip',
  'text-decoration': 'none',
  'dominant-baseline': 'auto',
  'alignment-baseline': 'baseline',
  'baseline-shift': 'baseline',
  'writing-mode': 'lr-tb',
  'direction': 'ltr',
  'unicode-bidi': 'normal',
  'letter-spacing': 'normal',
  'word-spacing': 'normal',

  // Font defaults
  'font-style': 'normal',
  'font-variant': 'normal',
  'font-weight': 'normal',
  'font-stretch': 'normal',
  'font-size': 'medium',
  'font-size-adjust': 'none',

  // Deprecated but still present
  'glyph-orientation-vertical': 'auto',
  'glyph-orientation-horizontal': '0deg',
};

/**
 * Element-specific default values
 */
export const elementDefaults = {
  'circle': { 'cx': '0', 'cy': '0' },
  'ellipse': { 'cx': '0', 'cy': '0' },
  'line': { 'x1': '0', 'y1': '0', 'x2': '0', 'y2': '0' },
  'rect': { 'x': '0', 'y': '0', 'rx': '0', 'ry': '0' },
  'image': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
  'svg': { 'x': '0', 'y': '0', 'preserveAspectRatio': 'xMidYMid meet' },
  'symbol': { 'preserveAspectRatio': 'xMidYMid meet' },
  'marker': {
    'markerUnits': 'strokeWidth',
    'refX': '0', 'refY': '0',
    'markerWidth': '3', 'markerHeight': '3'
  },
  'linearGradient': {
    'x1': '0', 'y1': '0', 'x2': '100%', 'y2': '0',
    'spreadMethod': 'pad'
  },
  'radialGradient': {
    'cx': '50%', 'cy': '50%', 'r': '50%',
    // Note: fx and fy default to cx and cy values respectively per SVG spec,
    // but this cannot be expressed in static defaults. Omitted to avoid incorrect values.
    'spreadMethod': 'pad'
  },
  'pattern': {
    'x': '0', 'y': '0',
    'patternUnits': 'objectBoundingBox',
    'patternContentUnits': 'userSpaceOnUse'
  },
  'clipPath': { 'clipPathUnits': 'userSpaceOnUse' },
  'mask': {
    'maskUnits': 'objectBoundingBox',
    'maskContentUnits': 'userSpaceOnUse',
    'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%'
  },
  'filter': {
    'primitiveUnits': 'objectBoundingBox',
    'x': '-10%', 'y': '-10%', 'width': '120%', 'height': '120%'
  },
  'feBlend': { 'mode': 'normal' },
  'feColorMatrix': { 'type': 'matrix' },
  'feComposite': { 'operator': 'over', 'k1': '0', 'k2': '0', 'k3': '0', 'k4': '0' },
  'feConvolveMatrix': { 'order': '3', 'bias': '0', 'edgeMode': 'duplicate', 'preserveAlpha': 'false' },
  'feDisplacementMap': { 'scale': '0', 'xChannelSelector': 'A', 'yChannelSelector': 'A' },
  'feDistantLight': { 'azimuth': '0', 'elevation': '0' },
  'fePointLight': { 'x': '0', 'y': '0', 'z': '0' },
  'feSpotLight': {
    'x': '0', 'y': '0', 'z': '0',
    'pointsAtX': '0', 'pointsAtY': '0', 'pointsAtZ': '0',
    'specularExponent': '1'
  },
  'feTurbulence': {
    'baseFrequency': '0', 'numOctaves': '1', 'seed': '0',
    'stitchTiles': 'noStitch', 'type': 'turbulence'
  },
  'feFuncR': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncG': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncB': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'feFuncA': { 'type': 'identity', 'slope': '1', 'intercept': '0', 'amplitude': '1', 'exponent': '1', 'offset': '0' },
  'a': { 'target': '_self' },
  'textPath': { 'startOffset': '0' },
  'animate': { 'begin': '0s' },
  'animateMotion': { 'rotate': '0' },
};

// ============================================================================
// ELEMENT-SPECIFIC SETS (P4 Edge Cases)
// ============================================================================

/**
 * Text-related elements that can contain text content
 */
export const textElems = new Set([
  'altGlyph', 'textPath', 'tref', 'tspan', 'text', 'title', 'desc'
]);

/**
 * Elements that can contain path data
 */
export const pathElems = new Set([
  'glyph', 'missing-glyph', 'path'
]);

// ============================================================================
// ATTRIBUTE GROUPS (P4-4: 15 SVGO-compatible attribute groups)
// ============================================================================

/**
 * Complete attribute groups matching SVGO's _collections.js
 */
export const attrsGroups = {
  animationAddition: new Set([
    'additive', 'accumulate'
  ]),
  animationAttributeTarget: new Set([
    'attributeType', 'attributeName'
  ]),
  animationEvent: new Set([
    'onbegin', 'onend', 'onrepeat', 'onload'
  ]),
  animationTiming: new Set([
    'begin', 'dur', 'end', 'min', 'max', 'restart', 'repeatCount', 'repeatDur', 'fill'
  ]),
  animationValue: new Set([
    'calcMode', 'values', 'keyTimes', 'keySplines', 'from', 'to', 'by'
  ]),
  conditionalProcessing: new Set([
    'requiredFeatures', 'requiredExtensions', 'systemLanguage'
  ]),
  core: new Set([
    'id', 'tabindex', 'xml:base', 'xml:lang', 'xml:space', 'lang'
  ]),
  graphicalEvent: new Set([
    'onfocusin', 'onfocusout', 'onactivate', 'onclick', 'onmousedown',
    'onmouseup', 'onmouseover', 'onmousemove', 'onmouseout', 'onload'
  ]),
  presentation: new Set([
    'alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule',
    'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile',
    'color-rendering', 'cursor', 'direction', 'display', 'dominant-baseline',
    'enable-background', 'fill', 'fill-opacity', 'fill-rule', 'filter',
    'flood-color', 'flood-opacity', 'font', 'font-family', 'font-size',
    'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
    'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'image-rendering',
    'kerning', 'letter-spacing', 'lighting-color', 'marker', 'marker-end',
    'marker-mid', 'marker-start', 'mask', 'opacity', 'overflow', 'paint-order',
    'pointer-events', 'shape-rendering', 'stop-color', 'stop-opacity', 'stroke',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'text-anchor',
    'text-decoration', 'text-rendering', 'transform', 'transform-origin',
    'unicode-bidi', 'vector-effect', 'visibility', 'word-spacing', 'writing-mode'
  ]),
  xlink: new Set([
    'xlink:href', 'xlink:show', 'xlink:actuate', 'xlink:type', 'xlink:role',
    'xlink:arcrole', 'xlink:title'
  ]),
  documentEvent: new Set([
    'onunload', 'onabort', 'onerror', 'onresize', 'onscroll', 'onzoom'
  ]),
  documentElementEvent: new Set([
    'oncopy', 'oncut', 'onpaste'
  ]),
  globalEvent: new Set([
    'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose',
    'oncuechange', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
    'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended',
    'onerror', 'onfocus', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup',
    'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmousedown',
    'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover',
    'onmouseup', 'onmousewheel', 'onpause', 'onplay', 'onplaying', 'onprogress',
    'onratechange', 'onreset', 'onresize', 'onscroll', 'onseeked', 'onseeking',
    'onselect', 'onshow', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate',
    'ontoggle', 'onvolumechange', 'onwaiting'
  ]),
  filterPrimitive: new Set([
    'x', 'y', 'width', 'height', 'result'
  ]),
  transferFunction: new Set([
    'type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'
  ]),
};

// ============================================================================
// DEPRECATED ATTRIBUTES (P4-5)
// ============================================================================

/**
 * Deprecated attributes per group - used for warnings or removal
 */
export const attrsGroupsDeprecated = {
  presentation: new Set([
    'enable-background', 'glyph-orientation-horizontal', 'glyph-orientation-vertical',
    'kerning', 'clip'
  ]),
  xlink: new Set([
    'xlink:type', 'xlink:role', 'xlink:arcrole', 'xlink:title', 'xlink:show', 'xlink:actuate'
  ]),
  core: new Set([
    'xml:base', 'xml:lang', 'xml:space'
  ]),
};

// ============================================================================
// PARENT-CHILD VALIDATION (P4-1: allowedChildrenPerElement)
// ============================================================================

/**
 * Defines which child elements are allowed for each SVG element
 * Used for validation and removing invalid children
 */
export const allowedChildrenPerElement = {
  'svg': new Set([
    'a', 'altGlyphDef', 'animate', 'animateColor', 'animateMotion', 'animateTransform',
    'circle', 'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face',
    'foreignObject', 'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata',
    'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script',
    'set', 'style', 'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'g': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'defs': new Set([
    'a', 'altGlyphDef', 'animate', 'animateColor', 'animateMotion', 'animateTransform',
    'circle', 'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face',
    'foreignObject', 'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata',
    'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script',
    'set', 'style', 'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view',
    // SVG 2.0 elements
    'meshgradient', 'meshGradient', 'hatch', 'solidcolor', 'solidColor'
  ]),
  'symbol': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'marker': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'clipPath': new Set([
    'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle', 'desc',
    'ellipse', 'line', 'metadata', 'path', 'polygon', 'polyline', 'rect', 'set', 'text',
    'title', 'use'
  ]),
  'mask': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'pattern': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'a': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'clipPath', 'cursor', 'defs', 'desc', 'ellipse', 'filter', 'font', 'font-face', 'foreignObject',
    'g', 'image', 'line', 'linearGradient', 'marker', 'mask', 'metadata', 'path',
    'pattern', 'polygon', 'polyline', 'radialGradient', 'rect', 'script', 'set', 'style',
    'svg', 'switch', 'symbol', 'text', 'title', 'use', 'view'
  ]),
  'switch': new Set([
    'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'circle',
    'cursor', 'desc', 'ellipse', 'foreignObject', 'g', 'image', 'line', 'metadata', 'path',
    'polygon', 'polyline', 'rect', 'set', 'svg', 'switch', 'text', 'title', 'use', 'view'
  ]),
  'text': new Set([
    'a', 'altGlyph', 'animate', 'animateColor', 'animateMotion', 'animateTransform',
    'desc', 'metadata', 'set', 'textPath', 'title', 'tref', 'tspan'
  ]),
  'textPath': new Set([
    'a', 'altGlyph', 'animate', 'animateColor', 'desc', 'metadata', 'set', 'title', 'tref', 'tspan'
  ]),
  'tspan': new Set([
    'a', 'altGlyph', 'animate', 'animateColor', 'desc', 'metadata', 'set', 'title', 'tref', 'tspan'
  ]),
  'linearGradient': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'set', 'stop', 'title'
  ]),
  'radialGradient': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'set', 'stop', 'title'
  ]),
  // SVG 2.0 mesh gradient element hierarchy
  'meshgradient': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'meshrow', 'set', 'title'
  ]),
  'meshGradient': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'meshrow', 'set', 'title'
  ]),
  'meshrow': new Set([
    'meshpatch'
  ]),
  'meshpatch': new Set([
    'stop'
  ]),
  // SVG 2.0 hatch element
  'hatch': new Set([
    'animate', 'animateTransform', 'desc', 'hatchpath', 'hatchPath', 'metadata', 'script', 'set', 'style', 'title'
  ]),
  'hatchpath': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'script', 'set', 'title'
  ]),
  'hatchPath': new Set([
    'animate', 'animateTransform', 'desc', 'metadata', 'script', 'set', 'title'
  ]),
  'filter': new Set([
    'animate', 'animateTransform', 'desc', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
    'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
    'feDropShadow', 'feFlood', 'feGaussianBlur', 'feImage', 'feMerge', 'feMorphology',
    'feOffset', 'feSpecularLighting', 'feTile', 'feTurbulence', 'metadata', 'set', 'title'
  ]),
  'feBlend': new Set(['animate', 'set']),
  'feColorMatrix': new Set(['animate', 'set']),
  'feComponentTransfer': new Set(['feFuncA', 'feFuncB', 'feFuncG', 'feFuncR']),
  'feComposite': new Set(['animate', 'set']),
  'feConvolveMatrix': new Set(['animate', 'set']),
  'feDiffuseLighting': new Set(['animate', 'feDistantLight', 'fePointLight', 'feSpotLight', 'set']),
  'feDisplacementMap': new Set(['animate', 'set']),
  'feDropShadow': new Set(['animate', 'set']),
  'feFlood': new Set(['animate', 'set']),
  'feFuncA': new Set(['animate', 'set']),
  'feFuncB': new Set(['animate', 'set']),
  'feFuncG': new Set(['animate', 'set']),
  'feFuncR': new Set(['animate', 'set']),
  'feGaussianBlur': new Set(['animate', 'set']),
  'feImage': new Set(['animate', 'set']),
  'feMerge': new Set(['feMergeNode']),
  'feMergeNode': new Set(['animate', 'set']),
  'feMorphology': new Set(['animate', 'set']),
  'feOffset': new Set(['animate', 'set']),
  'feSpecularLighting': new Set(['animate', 'feDistantLight', 'fePointLight', 'feSpotLight', 'set']),
  'feTile': new Set(['animate', 'set']),
  'feTurbulence': new Set(['animate', 'set']),
  'animate': new Set(['desc', 'metadata', 'title']),
  'animateColor': new Set(['desc', 'metadata', 'title']),
  'animateMotion': new Set(['desc', 'metadata', 'mpath', 'title']),
  'animateTransform': new Set(['desc', 'metadata', 'title']),
  'set': new Set(['desc', 'metadata', 'title']),
  // Shape elements cannot have children (except animation)
  'circle': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'ellipse': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'line': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'path': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'polygon': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'polyline': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'rect': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'image': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  'use': new Set(['animate', 'animateColor', 'animateMotion', 'animateTransform', 'desc', 'metadata', 'set', 'title']),
  // Descriptive elements have no children
  'title': new Set([]),
  'desc': new Set([]),
  'metadata': new Set([]),  // Can have any XML content, but SVG-wise empty
  // Light source elements
  'feDistantLight': new Set(['animate', 'set']),
  'fePointLight': new Set(['animate', 'set']),
  'feSpotLight': new Set(['animate', 'set']),
  // Stop element
  'stop': new Set(['animate', 'set']),
  // Other elements
  'foreignObject': new Set([]),  // Can contain any non-SVG content
  'style': new Set([]),
  'script': new Set([]),
  'view': new Set(['desc', 'metadata', 'title']),
  'mpath': new Set(['desc', 'metadata', 'title']),
};

// ============================================================================
// CSS PSEUDO-CLASSES (P4 Edge Case: inlineStyles support)
// ============================================================================

/**
 * CSS pseudo-classes that cannot be evaluated server-side
 * (must be preserved in stylesheets)
 */
export const pseudoClasses = {
  // User action pseudo-classes - cannot be evaluated
  userAction: new Set([
    ':hover', ':active', ':focus', ':focus-within', ':focus-visible'
  ]),
  // Tree-structural pseudo-classes - can sometimes be evaluated
  treeStructural: new Set([
    ':root', ':empty', ':first-child', ':last-child', ':only-child',
    ':first-of-type', ':last-of-type', ':only-of-type',
    ':nth-child', ':nth-last-child', ':nth-of-type', ':nth-last-of-type'
  ]),
  // Link pseudo-classes
  link: new Set([
    ':link', ':visited', ':any-link', ':local-link', ':target'
  ]),
  // Input pseudo-classes
  input: new Set([
    ':enabled', ':disabled', ':read-only', ':read-write', ':placeholder-shown',
    ':default', ':checked', ':indeterminate', ':valid', ':invalid', ':in-range',
    ':out-of-range', ':required', ':optional'
  ]),
  // Linguistic pseudo-classes
  linguistic: new Set([
    ':lang', ':dir'
  ]),
  // Negation and matching
  functional: new Set([
    ':not', ':is', ':where', ':has'
  ]),
  // All pseudo-classes that prevent inlining
  preventInlining: new Set([
    ':hover', ':active', ':focus', ':focus-within', ':focus-visible',
    ':visited', ':target', ':lang', ':dir', ':not', ':is', ':where', ':has'
  ])
};

// ============================================================================
// EXPANDED EDITOR NAMESPACES
// ============================================================================

/**
 * Additional editor namespaces beyond the base set
 * Note: These are now integrated directly into editorNamespaces above
 * to avoid post-export mutation issues. This export is kept for backwards compatibility.
 */
export const additionalEditorNamespaces = new Set([
  // CorelDraw
  'http://www.corel.com/coreldraw/svg',
  // Gravit Designer
  'http://gravit.io/ns',
  // Affinity
  'http://serif.com/affinity',
  // Canva
  'http://canva.com/ns',
]);
