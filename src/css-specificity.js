/**
 * CSS Specificity Calculation
 *
 * Calculates CSS selector specificity according to W3C spec.
 * https://www.w3.org/TR/selectors-3/#specificity
 *
 * Note: This module deals with integer counts (not precision-critical),
 * but follows project patterns for consistency.
 */

// Selector component types
const SELECTOR_TYPES = {
  ID: "id", // #foo
  CLASS: "class", // .foo
  ATTRIBUTE: "attr", // [foo]
  PSEUDO_CLASS: "pseudo-class", // :hover
  PSEUDO_ELEMENT: "pseudo-element", // ::before
  TYPE: "type", // div
  UNIVERSAL: "universal", // *
};

/**
 * Parse a CSS selector string into its component parts.
 *
 * Handles:
 * - Tag names (div, span)
 * - Classes (.foo)
 * - IDs (#bar)
 * - Attribute selectors ([type="text"])
 * - Pseudo-classes (:hover, :not())
 * - Pseudo-elements (::before, :after)
 * - Combinators (>, +, ~, space)
 *
 * @param {string} selectorString - CSS selector to parse
 * @returns {Array<Object>} Array of parsed selector components
 * @throws {Error} If selector syntax is invalid
 *
 * @example
 * parseSelector('div.class#id:hover::before')
 * // Returns array of component objects with type and value
 */
export function parseSelector(selectorString) {
  if (typeof selectorString !== "string" || !selectorString.trim()) {
    throw new Error("Selector must be a non-empty string");
  }

  const selector = selectorString.trim();
  const components = [];

  // Split by combinators first (>, +, ~, space) to handle complex selectors
  const parts = splitByCombinators(selector);

  for (const part of parts) {
    if (!part.trim()) continue;

    const partComponents = parseSimpleSelector(part.trim());
    components.push(...partComponents);
  }

  return components;
}

/**
 * Split selector by combinators while preserving them.
 * Handles: descendant (space), child (>), adjacent sibling (+), general sibling (~)
 * Correctly ignores combinators inside quotes, brackets, and parentheses.
 *
 * @param {string} selector - Selector string
 * @returns {Array<string>} Parts split by combinators
 */
function splitByCombinators(selector) {
  if (typeof selector !== "string") {
    throw new Error("Selector must be a string");
  }

  // Track nesting depth separately for brackets and parens, and quote state
  const parts = [];
  let current = "";
  let bracketDepth = 0; // Track nesting in []
  let parenDepth = 0; // Track nesting in ()
  let inQuote = false; // Track if inside quoted string
  let quoteChar = null; // Which quote character (' or ")

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    const prevChar = i > 0 ? selector[i - 1] : null;

    // Handle quotes (ignore escaped quotes)
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = null;
      }
    }

    // Only track brackets/parens outside quotes
    if (!inQuote) {
      if (char === "[" && prevChar !== "\\") {
        bracketDepth++;
      } else if (char === "]" && prevChar !== "\\") {
        bracketDepth--;
        if (bracketDepth < 0) {
          throw new Error(`Unbalanced brackets at position ${i}`);
        }
      } else if (char === "(" && prevChar !== "\\") {
        parenDepth++;
      } else if (char === ")" && prevChar !== "\\") {
        parenDepth--;
        if (parenDepth < 0) {
          throw new Error(`Unbalanced parentheses at position ${i}`);
        }
      }
    }

    // Only split on combinators when not inside quotes, brackets, or parens
    if (!inQuote && bracketDepth === 0 && parenDepth === 0) {
      if (char === ">" || char === "+" || char === "~") {
        const trimmed = current.trim();
        if (trimmed) parts.push(trimmed);
        // Don't push combinator as separate part - combinators don't contribute to specificity
        current = "";
        continue;
      } else if (char === " ") {
        const trimmed = current.trim();
        if (trimmed) {
          parts.push(trimmed);
          current = "";
          continue;
        } else {
          // Skip consecutive spaces
          continue;
        }
      }
    }

    current += char;
  }

  if (inQuote) {
    throw new Error(`Unclosed quote in selector`);
  }
  if (bracketDepth !== 0) {
    throw new Error("Unclosed brackets in selector");
  }
  if (parenDepth !== 0) {
    throw new Error("Unclosed parentheses in selector");
  }

  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  return parts;
}

/**
 * Parse a simple selector (no combinators).
 *
 * @param {string} selector - Simple selector string
 * @returns {Array<Object>} Array of component objects
 */
function parseSimpleSelector(selector) {
  if (typeof selector !== "string") {
    throw new Error("Selector must be a string");
  }

  const components = [];
  let i = 0;

  while (i < selector.length) {
    const char = selector[i];

    // ID selector
    if (char === "#") {
      // ID must start with letter, hyphen, or underscore (not digit)
      const match = selector.slice(i).match(/^#([a-zA-Z_-][\w-]*)/);
      if (!match) throw new Error(`Invalid ID selector at position ${i}`);
      components.push({ type: SELECTOR_TYPES.ID, value: match[1] });
      i += match[0].length;
    }
    // Class selector
    else if (char === ".") {
      // Class must start with letter, hyphen, or underscore (not digit)
      const match = selector.slice(i).match(/^\.([a-zA-Z_-][\w-]*)/);
      if (!match) throw new Error(`Invalid class selector at position ${i}`);
      components.push({ type: SELECTOR_TYPES.CLASS, value: match[1] });
      i += match[0].length;
    }
    // Attribute selector
    else if (char === "[") {
      const endIdx = findMatchingBracket(selector, i);
      if (endIdx === -1)
        throw new Error(`Unclosed attribute selector at position ${i}`);
      const attrContent = selector.slice(i + 1, endIdx);
      components.push({ type: SELECTOR_TYPES.ATTRIBUTE, value: attrContent });
      i = endIdx + 1;
    }
    // Pseudo-element (::) or pseudo-class (:)
    else if (char === ":") {
      if (i + 1 < selector.length && selector[i + 1] === ":") {
        // Pseudo-element with :: syntax
        const match = selector.slice(i).match(/^::([\w-]+)/);
        if (!match) throw new Error(`Invalid pseudo-element at position ${i}`);
        components.push({
          type: SELECTOR_TYPES.PSEUDO_ELEMENT,
          value: match[1],
        });
        i += match[0].length;
      } else {
        // Pseudo-class (may have arguments like :not()) or legacy pseudo-element
        const match = selector.slice(i).match(/^:([\w-]+)/);
        if (!match) throw new Error(`Invalid pseudo-class at position ${i}`);

        let pseudoValue = match[1];
        i += match[0].length;

        // Check for function notation like :not()
        if (i < selector.length && selector[i] === "(") {
          const endIdx = findMatchingParen(selector, i);
          if (endIdx === -1)
            throw new Error(`Unclosed pseudo-class function at position ${i}`);
          pseudoValue += selector.slice(i, endIdx + 1);
          i = endIdx + 1;
        }

        // Handle legacy pseudo-elements (CSS2 syntax with single colon)
        // These should be treated as pseudo-elements, not pseudo-classes
        const legacyPseudoElements = [
          "before",
          "after",
          "first-line",
          "first-letter",
        ];
        const isPseudoElement = legacyPseudoElements.includes(pseudoValue);

        components.push({
          type: isPseudoElement
            ? SELECTOR_TYPES.PSEUDO_ELEMENT
            : SELECTOR_TYPES.PSEUDO_CLASS,
          value: pseudoValue,
        });
      }
    }
    // Universal selector (with potential namespace)
    else if (char === "*") {
      let nextIdx = i + 1;

      // Check for namespace separator (ns|* or *|*)
      if (nextIdx < selector.length && selector[nextIdx] === "|") {
        // This is a namespace prefix, skip it
        nextIdx++; // Skip the |
        if (nextIdx < selector.length && selector[nextIdx] === "*") {
          nextIdx++; // Skip the * after |
        }
      }

      components.push({ type: SELECTOR_TYPES.UNIVERSAL, value: "*" });
      i = nextIdx;
    }
    // Type selector (element name) or namespace
    else if (/[a-zA-Z]/.test(char)) {
      // Type selectors must start with a letter (not digit or hyphen alone)
      const match = selector.slice(i).match(/^([a-zA-Z][\w-]*)/);
      if (!match) throw new Error(`Invalid type selector at position ${i}`);

      let value = match[1];
      let nextIdx = i + match[0].length;

      // Check for namespace separator (|)
      if (nextIdx < selector.length && selector[nextIdx] === "|") {
        // This is a namespace prefix, skip it for specificity purposes
        // The actual element name follows the |
        nextIdx++; // Skip the |
        const elementMatch = selector
          .slice(nextIdx)
          .match(/^([a-zA-Z*][\w-]*)/);
        if (elementMatch) {
          value = elementMatch[1]; // Use the element name after namespace
          nextIdx += elementMatch[0].length;
        }
      }

      components.push({ type: SELECTOR_TYPES.TYPE, value });
      i = nextIdx;
    }
    // Skip combinators (should not be in simple selector after splitByCombinators)
    else if (char === ">" || char === "+" || char === "~" || char === " ") {
      i++;
    } else {
      throw new Error(`Unexpected character '${char}' at position ${i}`);
    }
  }

  return components;
}

/**
 * Find matching closing bracket for attribute selector.
 * Handles quoted strings correctly (ignores brackets inside quotes).
 *
 * @param {string} str - String to search
 * @param {number} startIdx - Index of opening bracket
 * @returns {number} Index of closing bracket or -1 if not found
 */
function findMatchingBracket(str, startIdx) {
  if (typeof str !== "string") {
    throw new Error("str must be a string");
  }
  if (typeof startIdx !== "number" || startIdx < 0 || startIdx >= str.length) {
    throw new Error("startIdx must be a valid index within the string");
  }

  let depth = 0;
  let inQuote = false;
  let quoteChar = null;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : null;

    // Handle quotes (ignore escaped quotes)
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = null;
      }
    }

    // Only count brackets outside quotes
    if (!inQuote) {
      if (char === "[" && prevChar !== "\\") depth++;
      if (char === "]" && prevChar !== "\\") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Find matching closing parenthesis for pseudo-class function.
 * Handles quoted strings correctly (ignores parens inside quotes).
 *
 * @param {string} str - String to search
 * @param {number} startIdx - Index of opening parenthesis
 * @returns {number} Index of closing parenthesis or -1 if not found
 */
function findMatchingParen(str, startIdx) {
  if (typeof str !== "string") {
    throw new Error("str must be a string");
  }
  if (typeof startIdx !== "number" || startIdx < 0 || startIdx >= str.length) {
    throw new Error("startIdx must be a valid index within the string");
  }

  let depth = 0;
  let inQuote = false;
  let quoteChar = null;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : null;

    // Handle quotes (ignore escaped quotes)
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = null;
      }
    }

    // Only count parens outside quotes
    if (!inQuote) {
      if (char === "(" && prevChar !== "\\") depth++;
      if (char === ")" && prevChar !== "\\") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Calculate CSS specificity for a selector.
 * Returns [a, b, c] where:
 * - a = count of ID selectors
 * - b = count of class selectors, attribute selectors, and pseudo-classes
 * - c = count of type selectors and pseudo-elements
 *
 * Universal selector (*) and combinators do not contribute to specificity.
 *
 * Note: Special pseudo-class handling:
 * - :not(), :is(), :has() don't count themselves, but their arguments do
 * - :where() has zero specificity (neither it nor its arguments count)
 * - :nth-child() and :nth-last-child() can have an "of" clause whose selector contributes
 *
 * @param {string|Array<Object>} selector - CSS selector string or parsed components
 * @returns {Array<number>} [a, b, c] specificity values
 *
 * @example
 * calculateSpecificity('div.class#id:hover::before')
 * // Returns [1, 2, 2] (1 ID, 2 class+pseudo-class, 2 type+pseudo-element)
 */
export function calculateSpecificity(selector) {
  // Parse if string, otherwise assume it's already parsed
  const components =
    typeof selector === "string" ? parseSelector(selector) : selector;

  if (!Array.isArray(components)) {
    throw new Error("Selector must be a string or an array of components");
  }

  let a = 0; // IDs
  let b = 0; // Classes, attributes, pseudo-classes
  let c = 0; // Types, pseudo-elements

  for (const component of components) {
    if (!component || typeof component.type !== "string") {
      throw new Error("Invalid component: must have a 'type' property");
    }
    switch (component.type) {
      case SELECTOR_TYPES.ID:
        a++;
        break;

      case SELECTOR_TYPES.CLASS:
      case SELECTOR_TYPES.ATTRIBUTE:
        b++;
        break;

      case SELECTOR_TYPES.PSEUDO_CLASS: {
        // Handle special pseudo-classes with complex specificity rules
        const value = component.value;

        // :where() has zero specificity - skip entirely
        if (value.startsWith("where(") && value.endsWith(")")) {
          // Neither :where() nor its arguments contribute to specificity
          break;
        }

        // :not(), :is(), :has() don't count themselves, but their arguments do
        if (
          (value.startsWith("not(") ||
            value.startsWith("is(") ||
            value.startsWith("has(")) &&
          value.endsWith(")")
        ) {
          const funcName = value.match(/^(\w+)\(/)[1];
          const content = value.slice(funcName.length + 1, -1); // Extract content inside parens

          if (content.trim()) {
            // Process each selector in the argument list (comma-separated)
            // For :is() and :not(), use the highest specificity among arguments
            const selectors = splitSelectorList(content);
            let maxSpec = [0, 0, 0];

            for (const sel of selectors) {
              if (sel.trim()) {
                const selSpec = calculateSpecificity(sel.trim());
                if (compareSpecificity(selSpec, maxSpec) > 0) {
                  maxSpec = selSpec;
                }
              }
            }

            a += maxSpec[0];
            b += maxSpec[1];
            c += maxSpec[2];
          }
          break;
        }

        // :nth-child() and :nth-last-child() with "of S" clause
        if (
          (value.startsWith("nth-child(") ||
            value.startsWith("nth-last-child(")) &&
          value.endsWith(")")
        ) {
          const funcName = value.match(/^([\w-]+)\(/)[1];
          const content = value.slice(funcName.length + 1, -1);

          // Check for "of S" clause
          const ofMatch = content.match(/\s+of\s+(.+)$/);
          if (ofMatch) {
            const ofSelector = ofMatch[1].trim();
            const ofSpec = calculateSpecificity(ofSelector);
            a += ofSpec[0];
            b += ofSpec[1];
            c += ofSpec[2];
          }
          // The :nth-child() itself still counts as a pseudo-class
          b++;
          break;
        }

        // All other pseudo-classes count normally
        b++;
        break;
      }

      case SELECTOR_TYPES.TYPE:
      case SELECTOR_TYPES.PSEUDO_ELEMENT:
        c++;
        break;

      case SELECTOR_TYPES.UNIVERSAL:
        // Universal selector doesn't contribute to specificity
        break;

      default:
        // No default case needed - all known SELECTOR_TYPES handled above
        // Unknown types are silently ignored per CSS spec
        break;
    }
  }

  return [a, b, c];
}

/**
 * Split a comma-separated selector list into individual selectors.
 * Handles nested parens/brackets correctly.
 *
 * @param {string} selectorList - Comma-separated selector list
 * @returns {Array<string>} Individual selectors
 */
function splitSelectorList(selectorList) {
  if (typeof selectorList !== "string") {
    throw new Error("selectorList must be a string");
  }

  const selectors = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let inQuote = false;
  let quoteChar = null;

  for (let i = 0; i < selectorList.length; i++) {
    const char = selectorList[i];
    const prevChar = i > 0 ? selectorList[i - 1] : null;

    // Handle quotes
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = null;
      }
    }

    if (!inQuote) {
      if (char === "(") parenDepth++;
      if (char === ")") parenDepth--;
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;

      // Split on comma only at top level
      if (char === "," && parenDepth === 0 && bracketDepth === 0) {
        selectors.push(current);
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current) {
    selectors.push(current);
  }

  return selectors;
}

/**
 * Compare two specificity values.
 *
 * @param {Array<number>} spec1 - First specificity [a, b, c]
 * @param {Array<number>} spec2 - Second specificity [a, b, c]
 * @returns {number} -1 if spec1 < spec2, 0 if equal, 1 if spec1 > spec2
 *
 * @example
 * compareSpecificity([1, 0, 0], [0, 2, 1]) // Returns 1 (ID beats classes)
 * compareSpecificity([0, 1, 2], [0, 1, 2]) // Returns 0 (equal)
 */
export function compareSpecificity(spec1, spec2) {
  if (!Array.isArray(spec1) || spec1.length !== 3) {
    throw new Error("spec1 must be an array of 3 numbers");
  }
  if (!Array.isArray(spec2) || spec2.length !== 3) {
    throw new Error("spec2 must be an array of 3 numbers");
  }

  // Validate all elements are valid numbers
  for (let i = 0; i < 3; i++) {
    if (
      typeof spec1[i] !== "number" ||
      !Number.isFinite(spec1[i]) ||
      spec1[i] < 0
    ) {
      throw new Error(`spec1[${i}] must be a non-negative finite number`);
    }
    if (
      typeof spec2[i] !== "number" ||
      !Number.isFinite(spec2[i]) ||
      spec2[i] < 0
    ) {
      throw new Error(`spec2[${i}] must be a non-negative finite number`);
    }
  }

  // Compare lexicographically: a first, then b, then c
  for (let i = 0; i < 3; i++) {
    if (spec1[i] < spec2[i]) return -1;
    if (spec1[i] > spec2[i]) return 1;
  }

  return 0; // Equal
}

/**
 * Sort CSS rules by specificity (ascending order).
 * Uses stable sort to preserve source order for rules with equal specificity.
 *
 * @param {Array<Object>} rules - Array of rule objects with 'selector' property
 * @returns {Array<Object>} Sorted array of rules
 *
 * @example
 * const rules = [
 *   { selector: '.foo', style: 'color: red' },
 *   { selector: '#bar', style: 'color: blue' },
 *   { selector: 'div', style: 'color: green' }
 * ];
 * sortBySpecificity(rules)
 * // Returns rules sorted: div, .foo, #bar
 */
export function sortBySpecificity(rules) {
  if (!Array.isArray(rules)) {
    throw new Error("rules must be an array");
  }

  // Create array of [rule, specificity, originalIndex] tuples
  const withSpec = rules.map((rule, index) => {
    if (!rule || typeof rule.selector !== "string") {
      throw new Error(`Rule at index ${index} must have a 'selector' property`);
    }
    return [rule, calculateSpecificity(rule.selector), index];
  });

  // Stable sort by specificity, using original index to preserve source order
  withSpec.sort((a, b) => {
    const cmp = compareSpecificity(a[1], b[1]);
    if (cmp !== 0) return cmp;
    // If specificity is equal, maintain original order (stable sort)
    return a[2] - b[2];
  });

  // Extract just the rules
  return withSpec.map((tuple) => tuple[0]);
}

/**
 * Stringify parsed selector components back to selector string.
 * Used for verification (round-trip testing).
 *
 * @param {Array<Object>} components - Parsed selector components
 * @returns {string} Selector string
 */
export function stringifySelector(components) {
  if (!Array.isArray(components)) {
    throw new Error("components must be an array");
  }

  return components
    .map((component, index) => {
      if (!component || typeof component.type !== "string") {
        throw new Error(
          `Component at index ${index} must have a 'type' property`,
        );
      }
      if (component.value === undefined) {
        throw new Error(
          `Component at index ${index} must have a 'value' property`,
        );
      }
      switch (component.type) {
        case SELECTOR_TYPES.ID:
          return `#${component.value}`;
        case SELECTOR_TYPES.CLASS:
          return `.${component.value}`;
        case SELECTOR_TYPES.ATTRIBUTE:
          return `[${component.value}]`;
        case SELECTOR_TYPES.PSEUDO_CLASS:
          return `:${component.value}`;
        case SELECTOR_TYPES.PSEUDO_ELEMENT:
          return `::${component.value}`;
        case SELECTOR_TYPES.TYPE:
          return component.value;
        case SELECTOR_TYPES.UNIVERSAL:
          return "*";
        default:
          // Unknown types stringify to empty string for graceful degradation
          return "";
      }
    })
    .join("");
}

/**
 * Verify selector parsing by round-trip test.
 * Parse selector, stringify it, and compare (ignoring whitespace).
 *
 * @param {string} selector - Selector to verify
 * @returns {boolean} True if round-trip matches
 */
export function verifySelector(selector) {
  if (typeof selector !== "string") {
    throw new Error("Selector must be a string");
  }

  const components = parseSelector(selector);
  const reconstructed = stringifySelector(components);

  // Normalize whitespace for comparison
  const normalize = (s) => s.replace(/\s+/g, "");

  return normalize(selector) === normalize(reconstructed);
}

export default {
  SELECTOR_TYPES,
  parseSelector,
  calculateSpecificity,
  compareSpecificity,
  sortBySpecificity,
  stringifySelector,
  verifySelector,
};
