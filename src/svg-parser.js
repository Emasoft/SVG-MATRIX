/**
 * SVG Parser - Lightweight DOM-like SVG parsing for Node.js
 *
 * Creates element objects with DOM-like interface (getAttribute, children, tagName)
 * without requiring external dependencies. Designed for svg-matrix resolver modules.
 *
 * @module svg-parser
 */

import Decimal from "decimal.js";

Decimal.set({ precision: 80 });

/**
 * Recursively set ownerDocument on an element and all its descendants.
 * @param {SVGElement} el - Element to set ownerDocument on
 * @param {SVGDocument} doc - The document object
 */
function setOwnerDocument(el, doc) {
  el.ownerDocument = doc;
  for (const child of el.children) {
    // eslint-disable-next-line no-use-before-define -- Class hoisting is intentional
    if (child instanceof SVGElement) {
      setOwnerDocument(child, doc);
    }
  }
}

/**
 * Parse an SVG string into a DOM-like element tree.
 * @param {string} svgString - Raw SVG content
 * @returns {SVGElement} Root element with DOM-like interface
 */
export function parseSVG(svgString) {
  // Normalize whitespace but preserve content
  const normalized = svgString.trim();

  // Parse into element tree
  const root = parseElement(normalized, 0);

  if (!root.element) {
    throw new Error("Failed to parse SVG: no root element found");
  }

  // Create document and set ownerDocument on all elements
  // eslint-disable-next-line no-use-before-define -- Class hoisting is intentional
  const doc = new SVGDocument(root.element);
  setOwnerDocument(root.element, doc);

  return root.element;
}

/**
 * Simple document-like object that provides createElement functionality.
 * Used by ownerDocument to allow element creation in DOM manipulation functions.
 * @class
 * @property {SVGElement|null} documentElement - Root SVG element of the document
 */
class SVGDocument {
  /**
   * Creates a new SVGDocument instance.
   * @param {SVGElement|null} rootElement - The root element of the document
   */
  constructor(rootElement = null) {
    this.documentElement = rootElement;
  }

  /**
   * Create a new SVGElement with the given tag name.
   * @param {string} tagName - Element tag name
   * @returns {SVGElement}
   */
  createElement(tagName) {
    // eslint-disable-next-line no-use-before-define -- Class hoisting is intentional
    const el = new SVGElement(tagName);
    el.ownerDocument = this;
    return el;
  }

  /**
   * Create a new SVGElement with namespace (for compatibility).
   * @param {string} namespace - Namespace URI (ignored, always SVG)
   * @param {string} tagName - Element tag name
   * @returns {SVGElement}
   */
  createElementNS(namespace, tagName) {
    return this.createElement(tagName);
  }
}

/**
 * SVG Element class with DOM-like interface.
 * Provides getAttribute, querySelectorAll, children, etc.
 * @class
 * @property {string} tagName - Element tag name (preserves original case)
 * @property {string} nodeName - Uppercase element tag name
 * @property {Object} _attributes - Internal attributes storage
 * @property {Array<SVGElement|string>} children - Child elements and text nodes
 * @property {Array<SVGElement|string>} childNodes - Alias for children
 * @property {string} textContent - Text content of the element
 * @property {SVGElement|null} parentNode - Parent element reference
 * @property {SVGDocument|null} ownerDocument - Document that owns this element
 */
export class SVGElement {
  /**
   * Creates a new SVGElement instance.
   * @param {string} tagName - Element tag name
   * @param {Object} attributes - Element attributes (key-value pairs)
   * @param {Array<SVGElement|string>} children - Child elements and text nodes
   * @param {string} textContent - Text content of the element
   */
  constructor(tagName, attributes = {}, children = [], textContent = "") {
    // Preserve original case for W3C SVG compliance (linearGradient, clipPath, etc.)
    this.tagName = tagName;
    this.nodeName = tagName.toUpperCase();
    this._attributes = { ...attributes };
    this.children = children;
    this.childNodes = children;
    this.textContent = textContent;
    this.parentNode = null;
    this.ownerDocument = null; // Will be set by parseSVG or SVGDocument.createElement

    // Set parent references
    for (const child of children) {
      if (child instanceof SVGElement) {
        child.parentNode = this;
      }
    }
  }

  /**
   * Get attribute value by name.
   * @param {string} name - Attribute name
   * @returns {string|null} Attribute value or null
   */
  getAttribute(name) {
    return this._attributes[name] ?? null;
  }

  /**
   * Set attribute value.
   * @param {string} name - Attribute name
   * @param {string} value - Attribute value
   */
  setAttribute(name, value) {
    this._attributes[name] = value;
  }

  /**
   * Check if attribute exists.
   * @param {string} name - Attribute name
   * @returns {boolean}
   */
  hasAttribute(name) {
    return name in this._attributes;
  }

  /**
   * Remove attribute.
   * @param {string} name - Attribute name
   */
  removeAttribute(name) {
    delete this._attributes[name];
  }

  /**
   * Get all attribute names.
   * @returns {string[]}
   */
  getAttributeNames() {
    return Object.keys(this._attributes);
  }

  /**
   * Find all descendants matching a tag name.
   * @param {string} tagName - Tag name to match (case-insensitive)
   * @returns {SVGElement[]}
   */
  getElementsByTagName(tagName) {
    const tag = tagName.toLowerCase();
    const results = [];

    const search = (el) => {
      for (const child of el.children) {
        if (child instanceof SVGElement) {
          // Case-insensitive tag matching (tagName preserves original case)
          if (child.tagName.toLowerCase() === tag || tag === "*") {
            results.push(child);
          }
          search(child);
        }
      }
    };

    search(this);
    return results;
  }

  /**
   * Find element by ID.
   * @param {string} id - Element ID
   * @returns {SVGElement|null}
   */
  getElementById(id) {
    const search = (el) => {
      if (el.getAttribute("id") === id) {
        return el;
      }
      for (const child of el.children) {
        if (child instanceof SVGElement) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this);
  }

  /**
   * Find first matching descendant (simple selector support).
   * Supports: tagName, #id, .class, [attr], [attr=value]
   * @param {string} selector - CSS-like selector
   * @returns {SVGElement|null}
   */
  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }

  /**
   * Find all matching descendants.
   * @param {string} selector - CSS-like selector
   * @returns {SVGElement[]}
   */
  querySelectorAll(selector) {
    const results = [];
    const matchers = parseSelector(selector);

    const search = (el) => {
      for (const child of el.children) {
        if (child instanceof SVGElement) {
          if (matchesAllSelectors(child, matchers)) {
            results.push(child);
          }
          search(child);
        }
      }
    };

    search(this);
    return results;
  }

  /**
   * Check if element matches selector.
   * @param {string} selector - CSS-like selector
   * @returns {boolean}
   */
  matches(selector) {
    const matchers = parseSelector(selector);
    return matchesAllSelectors(this, matchers);
  }

  /**
   * Clone element (deep by default).
   * DOM spec: Cloned nodes preserve ownerDocument from original.
   * @param {boolean} deep - Clone children too
   * @returns {SVGElement}
   */
  cloneNode(deep = true) {
    const clonedChildren = deep
      ? // eslint-disable-next-line no-confusing-arrow -- Prettier multiline format
        this.children.map((c) =>
          c instanceof SVGElement ? c.cloneNode(true) : c,
        )
      : [];
    const cloned = new SVGElement(
      this.tagName,
      { ...this._attributes },
      clonedChildren,
      this.textContent,
    );
    // Preserve ownerDocument - set on cloned element and all its children
    if (this.ownerDocument) {
      const setDocRecursive = (el, doc) => {
        el.ownerDocument = doc;
        for (const child of el.children) {
          if (child instanceof SVGElement) setDocRecursive(child, doc);
        }
      };
      setDocRecursive(cloned, this.ownerDocument);
    }
    return cloned;
  }

  /**
   * Append child element.
   * DOM spec: If child already has a parent, remove it first.
   * @param {SVGElement} child
   * @returns {SVGElement} The appended child
   */
  appendChild(child) {
    // DOM spec: Remove child from its current parent before appending
    if (child instanceof SVGElement && child.parentNode) {
      child.parentNode.removeChild(child);
    }
    if (child instanceof SVGElement) {
      child.parentNode = this;
    }
    this.children.push(child);
    this.childNodes = this.children;
    return child;
  }

  /**
   * Remove child element.
   * @param {SVGElement} child
   * @returns {SVGElement} The removed child
   */
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      this.childNodes = this.children;
      if (child instanceof SVGElement) {
        child.parentNode = null;
      }
    }
    return child;
  }

  /**
   * Insert child before reference node.
   * DOM spec: Removes newChild from its current parent before inserting.
   * @param {SVGElement} newChild
   * @param {SVGElement} refChild
   * @returns {SVGElement} The inserted child
   */
  insertBefore(newChild, refChild) {
    // DOM spec: Remove newChild from its current parent first
    if (newChild instanceof SVGElement && newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    const idx = this.children.indexOf(refChild);
    if (idx >= 0) {
      if (newChild instanceof SVGElement) {
        newChild.parentNode = this;
      }
      this.children.splice(idx, 0, newChild);
      this.childNodes = this.children;
    } else {
      this.appendChild(newChild);
    }
    return newChild;
  }

  /**
   * Replace child element.
   * DOM spec: Removes newChild from its current parent before replacing.
   * @param {SVGElement} newChild
   * @param {SVGElement} oldChild
   * @returns {SVGElement} The replaced (old) child
   */
  replaceChild(newChild, oldChild) {
    // DOM spec: Remove newChild from its current parent first
    if (newChild instanceof SVGElement && newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    const idx = this.children.indexOf(oldChild);
    if (idx >= 0) {
      if (oldChild instanceof SVGElement) {
        oldChild.parentNode = null;
      }
      if (newChild instanceof SVGElement) {
        newChild.parentNode = this;
      }
      this.children[idx] = newChild;
      this.childNodes = this.children;
    }
    return oldChild;
  }

  /**
   * Get computed style (stub - returns inline styles only).
   * @returns {Object}
   */
  get style() {
    const styleAttr = this.getAttribute("style") || "";
    const styles = {};
    styleAttr.split(";").forEach((pair) => {
      const [key, val] = pair.split(":").map((s) => s.trim());
      if (key && val) {
        styles[key] = val;
      }
    });
    return styles;
  }

  /**
   * Get first child element.
   * @returns {SVGElement|null}
   */
  get firstChild() {
    return this.children[0] || null;
  }

  /**
   * Get last child element.
   * @returns {SVGElement|null}
   */
  get lastChild() {
    return this.children[this.children.length - 1] || null;
  }

  /**
   * Get next sibling.
   * @returns {SVGElement|null}
   */
  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const idx = siblings.indexOf(this);
    return siblings[idx + 1] || null;
  }

  /**
   * Get previous sibling.
   * @returns {SVGElement|null}
   */
  get previousSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }

  /**
   * Serialize to SVG string.
   * @param {number} indent - Indentation level
   * @param {boolean} minify - Whether to minify output (no whitespace/newlines)
   * @returns {string}
   */
  serialize(indent = 0, minify = false) {
    const pad = minify ? "" : "  ".repeat(indent);

    // Check for CDATA pending marker (used by embedExternalDependencies for scripts)
    const needsCDATA = this._attributes["data-cdata-pending"] === "true";

    // Build attributes string, excluding internal marker attributes
    const attrs = Object.entries(this._attributes)
      .filter(([k]) => k !== "data-cdata-pending") // Remove internal marker
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(" ");

    const attrStr = attrs ? " " + attrs : "";

    // Self-closing tag for empty elements
    if (this.children.length === 0 && !this.textContent) {
      return `${pad}<${this.tagName}${attrStr}/>`;
    }

    const separator = minify ? "" : "\n";

    // Serialize children (including animation elements inside text elements)
    /* eslint-disable no-confusing-arrow -- Prettier multiline format */
    const childStr = this.children
      .map((c) =>
        c instanceof SVGElement
          ? c.serialize(indent + 1, minify)
          : escapeText(c),
      )
      .join(separator);
    /* eslint-enable no-confusing-arrow */

    // CRITICAL FIX: Elements can have BOTH textContent AND children
    // Example: <text>Some text<set attributeName="display" .../></text>
    // We must include both, not choose one or the other
    let content = "";
    if (this.textContent && this.children.length > 0) {
      // Both text and children - combine them
      if (needsCDATA) {
        // Wrap textContent in CDATA without escaping for script/style elements
        content = `<![CDATA[\n${this.textContent}\n]]>` + separator + childStr;
      } else {
        content = escapeText(this.textContent) + separator + childStr;
      }
    } else if (this.textContent) {
      // Only text content
      if (needsCDATA) {
        // Wrap in CDATA without escaping for script/style elements
        content = `<![CDATA[\n${this.textContent}\n]]>`;
      } else {
        content = escapeText(this.textContent);
      }
    } else {
      // Only children
      content = childStr;
    }

    if (this.children.length === 0) {
      return `${pad}<${this.tagName}${attrStr}>${content}</${this.tagName}>`;
    }

    return `${pad}<${this.tagName}${attrStr}>${separator}${content}${separator}${pad}</${this.tagName}>`;
  }

  /**
   * Get outerHTML-like representation.
   * @returns {string}
   */
  get outerHTML() {
    return this.serialize(0);
  }

  /**
   * Get innerHTML-like representation.
   * @returns {string}
   */
  get innerHTML() {
    return this.children
      .map((c) => (c instanceof SVGElement ? c.serialize(0) : escapeText(c)))
      .join("\n");
  }
}

// ============================================================================
// INTERNAL PARSING FUNCTIONS
// ============================================================================

/**
 * Check if whitespace should be preserved based on xml:space attribute.
 * BUG FIX 2: Helper function to check xml:space="preserve" on element or ancestors
 * @private
 * @param {SVGElement} element - Element to check for xml:space attribute
 * @returns {boolean} True if whitespace should be preserved, false otherwise
 */
function _shouldPreserveWhitespace(element) {
  let current = element;
  while (current) {
    const xmlSpace = current.getAttribute("xml:space");
    if (xmlSpace === "preserve") return true;
    if (xmlSpace === "default") return false;
    current = current.parentNode;
  }
  return false;
}

/**
 * Parse a single element from SVG string.
 * @private
 * @param {string} str - SVG string to parse
 * @param {number} pos - Current position in string
 * @param {boolean} inheritPreserveSpace - Whether xml:space="preserve" is inherited from ancestor
 * @returns {{element: SVGElement|null, endPos: number}} Parsed element and final position
 */
function parseElement(str, pos, inheritPreserveSpace = false) {
  // Use local variable to avoid reassigning parameter (ESLint no-param-reassign)
  let position = pos;

  // Skip whitespace and comments
  while (position < str.length) {
    const ws = str.slice(position).match(/^(\s+)/);
    if (ws) {
      position += ws[1].length;
      continue;
    }

    // Skip comments
    if (str.slice(position, position + 4) === "<!--") {
      const endComment = str.indexOf("-->", position + 4);
      if (endComment === -1) break;
      position = endComment + 3;
      continue;
    }

    // Skip CDATA
    if (str.slice(position, position + 9) === "<![CDATA[") {
      const endCdata = str.indexOf("]]>", position + 9);
      if (endCdata === -1) break;
      position = endCdata + 3;
      continue;
    }

    // Skip processing instructions (<?xml ...?>)
    if (str.slice(position, position + 2) === "<?") {
      const endPI = str.indexOf("?>", position + 2);
      if (endPI === -1) break;
      position = endPI + 2;
      continue;
    }

    // Skip DOCTYPE (can contain internal subset with brackets)
    if (str.slice(position, position + 9).toUpperCase() === "<!DOCTYPE") {
      let depth = 0;
      let i = position + 9;
      while (i < str.length) {
        if (str[i] === "[") depth++;
        else if (str[i] === "]") depth--;
        else if (str[i] === ">" && depth === 0) {
          position = i + 1;
          break;
        }
        i++;
      }
      if (i >= str.length) {
        // Malformed DOCTYPE, skip to end
        break;
      }
      continue;
    }

    break;
  }

  if (position >= str.length || str[position] !== "<") {
    return { element: null, endPos: position };
  }

  // Parse opening tag
  const tagMatch = str.slice(position).match(/^<([a-zA-Z][a-zA-Z0-9_:-]*)/);
  if (!tagMatch) {
    return { element: null, endPos: position };
  }

  const tagName = tagMatch[1];
  position += tagMatch[0].length;

  // Parse attributes
  const attributes = {};
  while (position < str.length) {
    // Skip whitespace
    const ws = str.slice(position).match(/^(\s+)/);
    if (ws) {
      position += ws[1].length;
    }

    // Check for end of tag
    if (str[position] === ">") {
      position++;
      break;
    }

    if (str.slice(position, position + 2) === "/>") {
      position += 2;
      // Self-closing tag
      return {
        element: new SVGElement(tagName, attributes, []),
        endPos: position,
      };
    }

    // Parse attribute
    const attrMatch = str
      .slice(position)
      .match(/^([a-zA-Z][a-zA-Z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrValue =
        attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3];
      attributes[attrName] = unescapeAttr(attrValue);
      position += attrMatch[0].length;
    } else {
      // Boolean attribute or malformed - skip
      const boolAttr = str.slice(position).match(/^([a-zA-Z][a-zA-Z0-9_:-]*)/);
      if (boolAttr) {
        attributes[boolAttr[1]] = "";
        position += boolAttr[0].length;
      } else {
        position++;
      }
    }
  }

  // Parse children
  const children = [];
  let textContent = "";
  const closingTag = `</${tagName}>`;

  while (position < str.length) {
    // Check for closing tag
    if (
      str.slice(position, position + closingTag.length).toLowerCase() ===
      closingTag.toLowerCase()
    ) {
      position += closingTag.length;
      break;
    }

    // Check for child element
    if (str[position] === "<" && str[position + 1] !== "/") {
      // Check for CDATA
      if (str.slice(position, position + 9) === "<![CDATA[") {
        const endCdata = str.indexOf("]]>", position + 9);
        if (endCdata !== -1) {
          textContent += str.slice(position + 9, endCdata);
          position = endCdata + 3;
          continue;
        }
      }

      // Check for comment
      if (str.slice(position, position + 4) === "<!--") {
        const endComment = str.indexOf("-->", position + 4);
        if (endComment !== -1) {
          position = endComment + 3;
          continue;
        }
      }

      // BUG FIX 1: Pass down xml:space inheritance to children
      // Determine what to pass: if current element has xml:space, use it; otherwise inherit
      const currentXmlSpace = attributes["xml:space"];
      const childInheritPreserve =
        currentXmlSpace === "preserve"
          ? true
          : currentXmlSpace === "default"
            ? false
            : inheritPreserveSpace;

      const child = parseElement(str, position, childInheritPreserve);
      if (child.element) {
        children.push(child.element);
        position = child.endPos;
      } else {
        position++;
      }
    } else if (str[position] === "<" && str[position + 1] === "/") {
      // Closing tag for this element
      const closeMatch = str
        .slice(position)
        .match(/^<\/([a-zA-Z][a-zA-Z0-9_:-]*)>/);
      if (closeMatch && closeMatch[1].toLowerCase() === tagName.toLowerCase()) {
        position += closeMatch[0].length;
        break;
      }
      position++;
    } else {
      // Text content
      const nextTag = str.indexOf("<", position);
      if (nextTag === -1) {
        textContent += str.slice(position);
        position = str.length;
      } else {
        textContent += str.slice(position, nextTag);
        position = nextTag;
      }
    }
  }

  // BUG FIX 1: Create element first to set up parent references
  const element = new SVGElement(tagName, attributes, children, "");

  // BUG FIX 1: Check xml:space on this element, otherwise use inherited value
  // xml:space="preserve" means preserve whitespace
  // xml:space="default" means collapse/trim whitespace
  // If not specified, inherit from ancestor
  const currentXmlSpace = attributes["xml:space"];
  const preserveWhitespace =
    currentXmlSpace === "preserve"
      ? true
      : currentXmlSpace === "default"
        ? false
        : inheritPreserveSpace;

  const processedText = preserveWhitespace
    ? unescapeText(textContent)
    : unescapeText(textContent.trim());
  element.textContent = processedText;

  return { element, endPos: position };
}

/**
 * Parse CSS-like selector into matchers.
 * @private
 * @param {string} selector - CSS-like selector string
 * @returns {Array<{tag: string|null, id: string|null, classes: Array<string>, attrs: Array<{name: string, value: string|undefined}>}>} Array of matcher objects
 */
function parseSelector(selector) {
  const matchers = [];
  const parts = selector.trim().split(/\s*,\s*/);

  for (const part of parts) {
    const matcher = { tag: null, id: null, classes: [], attrs: [] };

    // Parse selector parts
    let remaining = part;

    // Tag name
    const tagMatch = remaining.match(/^([a-zA-Z][a-zA-Z0-9_-]*)/);
    if (tagMatch) {
      matcher.tag = tagMatch[1].toLowerCase();
      remaining = remaining.slice(tagMatch[0].length);
    }

    // ID
    const idMatch = remaining.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/);
    if (idMatch) {
      matcher.id = idMatch[1];
      remaining = remaining.replace(idMatch[0], "");
    }

    // Classes
    const classMatches = remaining.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g);
    for (const m of classMatches) {
      matcher.classes.push(m[1]);
    }

    // Attributes [attr] or [attr=value]
    const attrMatches = remaining.matchAll(
      /\[([a-zA-Z][a-zA-Z0-9_:-]*)(?:=["']?([^"'\]]+)["']?)?\]/g,
    );
    for (const m of attrMatches) {
      matcher.attrs.push({ name: m[1], value: m[2] });
    }

    matchers.push(matcher);
  }

  return matchers;
}

/**
 * Check if element matches all selector matchers.
 * @private
 * @param {SVGElement} el - Element to check
 * @param {Array<{tag: string|null, id: string|null, classes: Array<string>, attrs: Array<{name: string, value: string|undefined}>}>} matchers - Array of matcher objects
 * @returns {boolean} True if element matches any matcher
 */
function matchesAllSelectors(el, matchers) {
  return matchers.some((matcher) => {
    // Case-insensitive tag matching (tagName preserves original case)
    if (matcher.tag && el.tagName.toLowerCase() !== matcher.tag) return false;
    if (matcher.id && el.getAttribute("id") !== matcher.id) return false;

    const elClasses = (el.getAttribute("class") || "").split(/\s+/);
    for (const cls of matcher.classes) {
      if (!elClasses.includes(cls)) return false;
    }

    for (const attr of matcher.attrs) {
      if (!el.hasAttribute(attr.name)) return false;
      if (attr.value !== undefined && el.getAttribute(attr.name) !== attr.value)
        return false;
    }

    return true;
  });
}

/**
 * Escape text content for XML.
 * @private
 * @param {string|undefined|null} str - Text to escape
 * @returns {string} Escaped text
 */
function escapeText(str) {
  // Filter out undefined/null values to prevent "undefined" string in output
  if (str === undefined || str === null) return "";
  if (typeof str !== "string") return String(str);
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape attribute value for XML.
 * @private
 */
function escapeAttr(str) {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Unescape attribute value from XML.
 * Handles numeric entities (decimal and hex) and named entities.
 * @private
 */
function unescapeAttr(str) {
  if (!str) return str;
  return (
    str
      // Decode hex entities first: &#x41; or &#X41; -> A (case-insensitive)
      // BUG FIX 1 & 4: Use fromCodePoint for surrogate pairs, validate code point range
      .replace(/&#[xX]([0-9A-Fa-f]+);/g, (match, hex) => {
        const codePoint = parseInt(hex, 16);
        // BUG FIX 2: Validate XML-invalid characters (NULL and control characters)
        const isXMLInvalid =
          codePoint === 0 ||
          (codePoint >= 0x1 && codePoint <= 0x8) ||
          (codePoint >= 0xb && codePoint <= 0xc) ||
          (codePoint >= 0xe && codePoint <= 0x1f) ||
          codePoint === 0xfffe ||
          codePoint === 0xffff;
        // BUG FIX 4: Validate code point range (0x0 to 0x10FFFF, excluding surrogates)
        if (
          isXMLInvalid ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "\uFFFD"; // Replacement character for invalid code points
        }
        return String.fromCodePoint(codePoint);
      })
      // Decode decimal entities: &#65; -> A
      // BUG FIX 1 & 4: Use fromCodePoint for surrogate pairs, validate code point range
      .replace(/&#(\d+);/g, (match, dec) => {
        const codePoint = parseInt(dec, 10);
        // BUG FIX 2: Validate XML-invalid characters (NULL and control characters)
        const isXMLInvalid =
          codePoint === 0 ||
          (codePoint >= 0x1 && codePoint <= 0x8) ||
          (codePoint >= 0xb && codePoint <= 0xc) ||
          (codePoint >= 0xe && codePoint <= 0x1f) ||
          codePoint === 0xfffe ||
          codePoint === 0xffff;
        // BUG FIX 4: Validate code point range (0x0 to 0x10FFFF, excluding surrogates)
        if (
          isXMLInvalid ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "\uFFFD"; // Replacement character for invalid code points
        }
        return String.fromCodePoint(codePoint);
      })
      // Then named entities (order matters - & last to avoid double-decoding)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, "\u00A0") // BUG FIX 3: Add support for non-breaking space entity
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  );
}

/**
 * Unescape text content from XML.
 * Handles numeric entities (decimal and hex) and named entities.
 * @private
 */
function unescapeText(str) {
  if (!str) return str;
  return (
    str
      // Decode hex entities: &#x41; or &#X41; -> A (case-insensitive)
      // BUG FIX 1 & 4: Use fromCodePoint for surrogate pairs, validate code point range
      .replace(/&#[xX]([0-9A-Fa-f]+);/g, (match, hex) => {
        const codePoint = parseInt(hex, 16);
        // BUG FIX 2: Validate XML-invalid characters (NULL and control characters)
        const isXMLInvalid =
          codePoint === 0 ||
          (codePoint >= 0x1 && codePoint <= 0x8) ||
          (codePoint >= 0xb && codePoint <= 0xc) ||
          (codePoint >= 0xe && codePoint <= 0x1f) ||
          codePoint === 0xfffe ||
          codePoint === 0xffff;
        // BUG FIX 4: Validate code point range (0x0 to 0x10FFFF, excluding surrogates)
        if (
          isXMLInvalid ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "\uFFFD"; // Replacement character for invalid code points
        }
        return String.fromCodePoint(codePoint);
      })
      // Decode decimal entities: &#65; -> A
      // BUG FIX 1 & 4: Use fromCodePoint for surrogate pairs, validate code point range
      .replace(/&#(\d+);/g, (match, dec) => {
        const codePoint = parseInt(dec, 10);
        // BUG FIX 2: Validate XML-invalid characters (NULL and control characters)
        const isXMLInvalid =
          codePoint === 0 ||
          (codePoint >= 0x1 && codePoint <= 0x8) ||
          (codePoint >= 0xb && codePoint <= 0xc) ||
          (codePoint >= 0xe && codePoint <= 0x1f) ||
          codePoint === 0xfffe ||
          codePoint === 0xffff;
        // BUG FIX 4: Validate code point range (0x0 to 0x10FFFF, excluding surrogates)
        if (
          isXMLInvalid ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "\uFFFD"; // Replacement character for invalid code points
        }
        return String.fromCodePoint(codePoint);
      })
      // Named entities (& last)
      .replace(/&nbsp;/g, "\u00A0") // BUG FIX 3: Add support for non-breaking space entity
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Build a defs map from SVG root element.
 * Maps IDs to their definition elements.
 * @param {SVGElement} svgRoot - Parsed SVG root
 * @returns {Map<string, SVGElement>}
 */
export function buildDefsMap(svgRoot) {
  const defsMap = new Map();

  // Find all elements with IDs
  const addToMap = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      defsMap.set(id, el);
    }
    for (const child of el.children) {
      if (child instanceof SVGElement) {
        addToMap(child);
      }
    }
  };

  addToMap(svgRoot);
  return defsMap;
}

/**
 * Find all elements with a specific attribute.
 * @param {SVGElement} root - Root element
 * @param {string} attrName - Attribute to search for
 * @returns {SVGElement[]}
 */
export function findElementsWithAttribute(root, attrName) {
  const results = [];

  const search = (el) => {
    if (el.hasAttribute(attrName)) {
      results.push(el);
    }
    for (const child of el.children) {
      if (child instanceof SVGElement) {
        search(child);
      }
    }
  };

  search(root);
  return results;
}

/**
 * Get the URL reference from a url() value.
 * @param {string} urlValue - Value like "url(#foo)" or "url(foo.svg#bar)"
 * @returns {string|null} The reference ID or null
 */
export function parseUrlReference(urlValue) {
  if (!urlValue) return null;
  const match = urlValue.match(/url\(\s*["']?#?([^"')]+)["']?\s*\)/i);
  return match ? match[1] : null;
}

/**
 * Serialize SVG element tree back to string.
 * @param {SVGElement} root - Root element
 * @param {Object} options - Serialization options
 * @param {boolean} options.minify - Whether to minify output (no whitespace/newlines)
 * @returns {string}
 */
export function serializeSVG(root, options = {}) {
  // Validate that root is a proper SVGElement with serialize method
  if (!root || typeof root.serialize !== "function") {
    // If root is already a string, return it directly
    if (typeof root === "string") return root;
    throw new Error(
      `serializeSVG: expected SVGElement with serialize method, got ${root?.constructor?.name || typeof root}`,
    );
  }
  const minify = options.minify || false;
  const xmlDecl = '<?xml version="1.0" encoding="UTF-8"?>';
  const separator = minify ? "" : "\n";
  return xmlDecl + separator + root.serialize(0, minify);
}

export default {
  parseSVG,
  SVGElement,
  buildDefsMap,
  findElementsWithAttribute,
  parseUrlReference,
  serializeSVG,
};
