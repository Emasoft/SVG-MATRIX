/**
 * Unit tests for css-specificity.js
 *
 * Tests all CSS specificity calculation functions including:
 * - Selector parsing (parseSelector)
 * - Specificity calculation (calculateSpecificity)
 * - Specificity comparison (compareSpecificity)
 * - Selector sorting (sortBySpecificity)
 * - Selector stringification and verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as CSSSpec from '../src/css-specificity.js';

describe('CSSSpecificity', () => {

  describe('parseSelector - simple selectors', () => {
    it('should parse type selector', () => {
      const result = CSSSpec.parseSelector('div');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'type', 'type is type');
      assert.equal(result[0].value, 'div', 'value is div');
    });

    it('should parse class selector', () => {
      const result = CSSSpec.parseSelector('.foo');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'class', 'type is class');
      assert.equal(result[0].value, 'foo', 'value is foo');
    });

    it('should parse ID selector', () => {
      const result = CSSSpec.parseSelector('#bar');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'id', 'type is id');
      assert.equal(result[0].value, 'bar', 'value is bar');
    });

    it('should parse universal selector', () => {
      const result = CSSSpec.parseSelector('*');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'universal', 'type is universal');
      assert.equal(result[0].value, '*', 'value is *');
    });

    it('should parse attribute selector', () => {
      const result = CSSSpec.parseSelector('[type="text"]');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'attr', 'type is attr');
      assert.equal(result[0].value, 'type="text"', 'value contains attribute');
    });

    it('should parse attribute selector without value', () => {
      const result = CSSSpec.parseSelector('[disabled]');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'attr', 'type is attr');
      assert.equal(result[0].value, 'disabled', 'value is attribute name');
    });

    it('should parse pseudo-class', () => {
      const result = CSSSpec.parseSelector(':hover');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'pseudo-class', 'type is pseudo-class');
      assert.equal(result[0].value, 'hover', 'value is hover');
    });

    it('should parse pseudo-element with double colon', () => {
      const result = CSSSpec.parseSelector('::before');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'pseudo-element', 'type is pseudo-element');
      assert.equal(result[0].value, 'before', 'value is before');
    });

    it('should parse hyphenated names', () => {
      const result = CSSSpec.parseSelector('.my-class');
      assert.equal(result[0].value, 'my-class', 'hyphenated class name');

      const result2 = CSSSpec.parseSelector('#my-id');
      assert.equal(result2[0].value, 'my-id', 'hyphenated id');
    });
  });

  describe('parseSelector - compound selectors', () => {
    it('should parse type with class', () => {
      const result = CSSSpec.parseSelector('div.foo');
      assert.equal(result.length, 2, 'two components');
      assert.equal(result[0].type, 'type', 'first is type');
      assert.equal(result[1].type, 'class', 'second is class');
    });

    it('should parse type with id', () => {
      const result = CSSSpec.parseSelector('div#main');
      assert.equal(result.length, 2, 'two components');
      assert.equal(result[0].type, 'type', 'first is type');
      assert.equal(result[1].type, 'id', 'second is id');
    });

    it('should parse type with multiple classes', () => {
      const result = CSSSpec.parseSelector('div.foo.bar.baz');
      assert.equal(result.length, 4, 'four components');
      assert.equal(result[0].type, 'type', 'first is type');
      assert.equal(result[1].type, 'class', 'second is class');
      assert.equal(result[2].type, 'class', 'third is class');
      assert.equal(result[3].type, 'class', 'fourth is class');
    });

    it('should parse complex compound selector', () => {
      const result = CSSSpec.parseSelector('div.class#id:hover::before');
      assert.equal(result.length, 5, 'five components');
      assert.equal(result[0].type, 'type', 'type');
      assert.equal(result[1].type, 'class', 'class');
      assert.equal(result[2].type, 'id', 'id');
      assert.equal(result[3].type, 'pseudo-class', 'pseudo-class');
      assert.equal(result[4].type, 'pseudo-element', 'pseudo-element');
    });

    it('should parse selector with attribute and pseudo-class', () => {
      const result = CSSSpec.parseSelector('input[type="text"]:focus');
      assert.equal(result.length, 3, 'three components');
      assert.equal(result[0].type, 'type', 'type');
      assert.equal(result[1].type, 'attr', 'attribute');
      assert.equal(result[2].type, 'pseudo-class', 'pseudo-class');
    });
  });

  describe('parseSelector - complex selectors with combinators', () => {
    it('should parse descendant combinator', () => {
      const result = CSSSpec.parseSelector('div p');
      assert.equal(result.length, 2, 'two components');
      assert.equal(result[0].value, 'div', 'first is div');
      assert.equal(result[1].value, 'p', 'second is p');
    });

    it('should parse child combinator', () => {
      const result = CSSSpec.parseSelector('ul > li');
      // Note: combinator is not included in result, just the selectors
      assert.ok(result.some(c => c.value === 'ul'), 'contains ul');
      assert.ok(result.some(c => c.value === 'li'), 'contains li');
    });

    it('should parse adjacent sibling combinator', () => {
      const result = CSSSpec.parseSelector('h1 + p');
      assert.ok(result.some(c => c.value === 'h1'), 'contains h1');
      assert.ok(result.some(c => c.value === 'p'), 'contains p');
    });

    it('should parse general sibling combinator', () => {
      const result = CSSSpec.parseSelector('h1 ~ p');
      assert.ok(result.some(c => c.value === 'h1'), 'contains h1');
      assert.ok(result.some(c => c.value === 'p'), 'contains p');
    });

    it('should parse multi-level descendant selector', () => {
      const result = CSSSpec.parseSelector('nav ul li a');
      assert.equal(result.length, 4, 'four components');
    });

    it('should parse mixed combinators', () => {
      const result = CSSSpec.parseSelector('div.container > ul.menu li');
      // Should have: div, .container, ul, .menu, li
      assert.ok(result.length >= 5, 'at least 5 components');
    });
  });

  describe('parseSelector - :not() pseudo-class', () => {
    it('should parse :not() with simple selector', () => {
      const result = CSSSpec.parseSelector(':not(.hidden)');
      assert.equal(result.length, 1, 'one component');
      assert.equal(result[0].type, 'pseudo-class', 'type is pseudo-class');
      assert.ok(result[0].value.includes('not('), 'value includes not(');
      assert.ok(result[0].value.includes('.hidden'), 'value includes .hidden');
    });

    it('should parse element:not(.class)', () => {
      const result = CSSSpec.parseSelector('div:not(.hidden)');
      assert.equal(result.length, 2, 'two components');
      assert.equal(result[0].type, 'type', 'first is type');
      assert.equal(result[1].type, 'pseudo-class', 'second is pseudo-class');
    });

    it('should parse :not() with id selector', () => {
      const result = CSSSpec.parseSelector(':not(#main)');
      assert.equal(result.length, 1, 'one component');
      assert.ok(result[0].value.includes('#main'), 'value includes #main');
    });
  });

  describe('parseSelector - error handling', () => {
    it('should throw on empty string', () => {
      assert.throws(() => {
        CSSSpec.parseSelector('');
      }, /non-empty string/, 'should throw for empty');
    });

    it('should throw on whitespace-only string', () => {
      assert.throws(() => {
        CSSSpec.parseSelector('   ');
      }, /non-empty string/, 'should throw for whitespace');
    });

    it('should throw on non-string input', () => {
      assert.throws(() => {
        CSSSpec.parseSelector(null);
      }, /non-empty string/, 'should throw for null');

      assert.throws(() => {
        CSSSpec.parseSelector(123);
      }, /non-empty string/, 'should throw for number');
    });

    it('should throw on unclosed attribute selector', () => {
      assert.throws(() => {
        CSSSpec.parseSelector('[type="text"');
      }, /Unclosed brackets/i, 'should throw for unclosed bracket');
    });

    it('should throw on invalid ID selector', () => {
      assert.throws(() => {
        CSSSpec.parseSelector('#');
      }, /Invalid ID selector/, 'should throw for lone #');
    });

    it('should throw on invalid class selector', () => {
      assert.throws(() => {
        CSSSpec.parseSelector('.');
      }, /Invalid class selector/, 'should throw for lone .');
    });
  });

  describe('calculateSpecificity', () => {
    it('should return [0,0,0] for universal selector', () => {
      const result = CSSSpec.calculateSpecificity('*');
      assert.deepEqual(result, [0, 0, 0], 'universal has no specificity');
    });

    it('should return [0,0,1] for type selector', () => {
      const result = CSSSpec.calculateSpecificity('div');
      assert.deepEqual(result, [0, 0, 1], 'type has c=1');
    });

    it('should return [0,1,0] for class selector', () => {
      const result = CSSSpec.calculateSpecificity('.foo');
      assert.deepEqual(result, [0, 1, 0], 'class has b=1');
    });

    it('should return [1,0,0] for ID selector', () => {
      const result = CSSSpec.calculateSpecificity('#bar');
      assert.deepEqual(result, [1, 0, 0], 'ID has a=1');
    });

    it('should return [0,1,0] for attribute selector', () => {
      const result = CSSSpec.calculateSpecificity('[type]');
      assert.deepEqual(result, [0, 1, 0], 'attribute has b=1');
    });

    it('should return [0,1,0] for pseudo-class', () => {
      const result = CSSSpec.calculateSpecificity(':hover');
      assert.deepEqual(result, [0, 1, 0], 'pseudo-class has b=1');
    });

    it('should return [0,0,1] for pseudo-element', () => {
      const result = CSSSpec.calculateSpecificity('::before');
      assert.deepEqual(result, [0, 0, 1], 'pseudo-element has c=1');
    });

    it('should add specificities for compound selector', () => {
      // div.class#id has: 1 type, 1 class, 1 id = [1, 1, 1]
      const result = CSSSpec.calculateSpecificity('div.class#id');
      assert.deepEqual(result, [1, 1, 1], 'compound selector sums components');
    });

    it('should handle multiple classes', () => {
      const result = CSSSpec.calculateSpecificity('.a.b.c');
      assert.deepEqual(result, [0, 3, 0], 'three classes = b=3');
    });

    it('should handle multiple IDs', () => {
      const result = CSSSpec.calculateSpecificity('#a#b');
      assert.deepEqual(result, [2, 0, 0], 'two IDs = a=2');
    });

    it('should handle descendant selector', () => {
      // div p = 2 type selectors = [0, 0, 2]
      const result = CSSSpec.calculateSpecificity('div p');
      assert.deepEqual(result, [0, 0, 2], 'descendant adds specificities');
    });

    it('should handle complex selector', () => {
      // #nav ul li.active a:hover = 1 ID, 2 classes/pseudo-classes (active, hover), 3 types (ul, li, a)
      const result = CSSSpec.calculateSpecificity('#nav ul li.active a:hover');
      assert.deepEqual(result, [1, 2, 3], 'complex selector');
    });

    it('should handle :not() - count argument, not :not itself', () => {
      // :not(.hidden) = 1 class (inside :not)
      const result = CSSSpec.calculateSpecificity(':not(.hidden)');
      assert.deepEqual(result, [0, 1, 0], ':not(.class) counts the class');
    });

    it('should handle div:not(.hidden)', () => {
      // div:not(.hidden) = 1 type + 1 class = [0, 1, 1]
      const result = CSSSpec.calculateSpecificity('div:not(.hidden)');
      assert.deepEqual(result, [0, 1, 1], 'div:not(.hidden)');
    });

    it('should handle :not(#id)', () => {
      const result = CSSSpec.calculateSpecificity(':not(#main)');
      assert.deepEqual(result, [1, 0, 0], ':not(#id) counts the ID');
    });

    it('should accept pre-parsed components', () => {
      const components = [
        { type: 'type', value: 'div' },
        { type: 'class', value: 'foo' }
      ];
      const result = CSSSpec.calculateSpecificity(components);
      assert.deepEqual(result, [0, 1, 1], 'accepts array input');
    });
  });

  describe('compareSpecificity', () => {
    it('should return 0 for equal specificities', () => {
      const result = CSSSpec.compareSpecificity([0, 1, 0], [0, 1, 0]);
      assert.equal(result, 0, 'equal specificities');
    });

    it('should return 1 when first > second (a differs)', () => {
      const result = CSSSpec.compareSpecificity([1, 0, 0], [0, 5, 5]);
      assert.equal(result, 1, 'ID beats classes and types');
    });

    it('should return -1 when first < second (a differs)', () => {
      const result = CSSSpec.compareSpecificity([0, 5, 5], [1, 0, 0]);
      assert.equal(result, -1, 'classes/types lose to ID');
    });

    it('should return 1 when first > second (b differs)', () => {
      const result = CSSSpec.compareSpecificity([0, 2, 0], [0, 1, 5]);
      assert.equal(result, 1, 'more classes beats more types');
    });

    it('should return -1 when first < second (b differs)', () => {
      const result = CSSSpec.compareSpecificity([0, 1, 5], [0, 2, 0]);
      assert.equal(result, -1, 'fewer classes loses');
    });

    it('should return 1 when first > second (c differs)', () => {
      const result = CSSSpec.compareSpecificity([0, 0, 5], [0, 0, 2]);
      assert.equal(result, 1, 'more types wins');
    });

    it('should return -1 when first < second (c differs)', () => {
      const result = CSSSpec.compareSpecificity([0, 0, 2], [0, 0, 5]);
      assert.equal(result, -1, 'fewer types loses');
    });

    it('should throw on invalid spec1', () => {
      assert.throws(() => {
        CSSSpec.compareSpecificity([0, 1], [0, 1, 0]);
      }, /array of 3/, 'should throw for 2-element array');
    });

    it('should throw on invalid spec2', () => {
      assert.throws(() => {
        CSSSpec.compareSpecificity([0, 1, 0], 'invalid');
      }, /array of 3/, 'should throw for non-array');
    });
  });

  describe('sortBySpecificity', () => {
    it('should sort rules by specificity ascending', () => {
      const rules = [
        { selector: '#bar', style: 'color: blue' },
        { selector: 'div', style: 'color: green' },
        { selector: '.foo', style: 'color: red' }
      ];
      const sorted = CSSSpec.sortBySpecificity(rules);

      assert.equal(sorted[0].selector, 'div', 'type first (lowest)');
      assert.equal(sorted[1].selector, '.foo', 'class second');
      assert.equal(sorted[2].selector, '#bar', 'ID last (highest)');
    });

    it('should preserve source order for equal specificity', () => {
      const rules = [
        { selector: '.a', style: 'color: red' },
        { selector: '.b', style: 'color: blue' },
        { selector: '.c', style: 'color: green' }
      ];
      const sorted = CSSSpec.sortBySpecificity(rules);

      // All have same specificity, should preserve order
      assert.equal(sorted[0].selector, '.a', 'first preserved');
      assert.equal(sorted[1].selector, '.b', 'second preserved');
      assert.equal(sorted[2].selector, '.c', 'third preserved');
    });

    it('should handle complex selectors', () => {
      const rules = [
        { selector: '#nav .item', style: '' },     // [1, 1, 0]
        { selector: 'div.container p', style: '' }, // [0, 1, 2]
        { selector: 'div', style: '' },             // [0, 0, 1]
        { selector: '#main', style: '' }            // [1, 0, 0]
      ];
      const sorted = CSSSpec.sortBySpecificity(rules);

      assert.equal(sorted[0].selector, 'div', 'lowest');
      assert.equal(sorted[1].selector, 'div.container p', 'second');
      assert.equal(sorted[2].selector, '#main', 'third');
      assert.equal(sorted[3].selector, '#nav .item', 'highest');
    });

    it('should throw on non-array input', () => {
      assert.throws(() => {
        CSSSpec.sortBySpecificity('not an array');
      }, /must be an array/, 'should throw for string');
    });

    it('should throw on rule without selector', () => {
      assert.throws(() => {
        CSSSpec.sortBySpecificity([{ style: 'color: red' }]);
      }, /selector/, 'should throw for missing selector');
    });

    it('should handle empty array', () => {
      const result = CSSSpec.sortBySpecificity([]);
      assert.deepEqual(result, [], 'empty array unchanged');
    });

    it('should handle single rule', () => {
      const rules = [{ selector: '.foo', style: '' }];
      const sorted = CSSSpec.sortBySpecificity(rules);
      assert.equal(sorted.length, 1, 'single rule unchanged');
      assert.equal(sorted[0].selector, '.foo', 'rule preserved');
    });
  });

  describe('stringifySelector', () => {
    it('should stringify type selector', () => {
      const components = [{ type: 'type', value: 'div' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, 'div', 'type selector');
    });

    it('should stringify class selector', () => {
      const components = [{ type: 'class', value: 'foo' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, '.foo', 'class selector');
    });

    it('should stringify ID selector', () => {
      const components = [{ type: 'id', value: 'bar' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, '#bar', 'ID selector');
    });

    it('should stringify attribute selector', () => {
      const components = [{ type: 'attr', value: 'type="text"' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, '[type="text"]', 'attribute selector');
    });

    it('should stringify pseudo-class', () => {
      const components = [{ type: 'pseudo-class', value: 'hover' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, ':hover', 'pseudo-class');
    });

    it('should stringify pseudo-element', () => {
      const components = [{ type: 'pseudo-element', value: 'before' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, '::before', 'pseudo-element');
    });

    it('should stringify universal selector', () => {
      const components = [{ type: 'universal', value: '*' }];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, '*', 'universal selector');
    });

    it('should stringify compound selector', () => {
      const components = [
        { type: 'type', value: 'div' },
        { type: 'class', value: 'foo' },
        { type: 'id', value: 'bar' }
      ];
      const result = CSSSpec.stringifySelector(components);
      assert.equal(result, 'div.foo#bar', 'compound selector');
    });

    it('should throw on non-array input', () => {
      assert.throws(() => {
        CSSSpec.stringifySelector('not array');
      }, /must be an array/, 'should throw for string');
    });
  });

  describe('verifySelector', () => {
    it('should verify simple selectors', () => {
      assert.ok(CSSSpec.verifySelector('div'), 'type');
      assert.ok(CSSSpec.verifySelector('.foo'), 'class');
      assert.ok(CSSSpec.verifySelector('#bar'), 'id');
      assert.ok(CSSSpec.verifySelector('*'), 'universal');
    });

    it('should verify compound selectors', () => {
      assert.ok(CSSSpec.verifySelector('div.foo'), 'type.class');
      assert.ok(CSSSpec.verifySelector('div.foo#bar'), 'type.class#id');
      assert.ok(CSSSpec.verifySelector('input[type="text"]'), 'with attribute');
    });

    it('should verify selectors with pseudo-classes', () => {
      assert.ok(CSSSpec.verifySelector(':hover'), 'pseudo-class alone');
      assert.ok(CSSSpec.verifySelector('a:hover'), 'element:pseudo-class');
    });

    it('should verify selectors with pseudo-elements', () => {
      assert.ok(CSSSpec.verifySelector('::before'), 'pseudo-element alone');
      assert.ok(CSSSpec.verifySelector('p::first-line'), 'element::pseudo-element');
    });

    it('should handle complex compound selectors', () => {
      assert.ok(
        CSSSpec.verifySelector('div.class#id:hover::before'),
        'complex compound'
      );
    });
  });

  describe('SELECTOR_TYPES constant', () => {
    it('should export SELECTOR_TYPES', () => {
      const types = CSSSpec.default.SELECTOR_TYPES;
      assert.ok(types, 'SELECTOR_TYPES exported');
      assert.equal(types.ID, 'id', 'ID type');
      assert.equal(types.CLASS, 'class', 'CLASS type');
      assert.equal(types.ATTRIBUTE, 'attr', 'ATTRIBUTE type');
      assert.equal(types.PSEUDO_CLASS, 'pseudo-class', 'PSEUDO_CLASS type');
      assert.equal(types.PSEUDO_ELEMENT, 'pseudo-element', 'PSEUDO_ELEMENT type');
      assert.equal(types.TYPE, 'type', 'TYPE type');
      assert.equal(types.UNIVERSAL, 'universal', 'UNIVERSAL type');
    });
  });

  describe('real-world selector examples', () => {
    it('should handle Bootstrap-like selectors', () => {
      const spec1 = CSSSpec.calculateSpecificity('.btn.btn-primary');
      assert.deepEqual(spec1, [0, 2, 0], 'two classes');

      const spec2 = CSSSpec.calculateSpecificity('.navbar-nav .nav-item.active .nav-link');
      assert.deepEqual(spec2, [0, 4, 0], 'four classes');
    });

    it('should handle SVG selectors', () => {
      const spec1 = CSSSpec.calculateSpecificity('svg path');
      assert.deepEqual(spec1, [0, 0, 2], 'svg path');

      const spec2 = CSSSpec.calculateSpecificity('svg .icon path');
      assert.deepEqual(spec2, [0, 1, 2], 'svg .icon path');

      const spec3 = CSSSpec.calculateSpecificity('#mysvg .layer1 rect.highlighted');
      assert.deepEqual(spec3, [1, 2, 1], 'complex SVG selector');
    });

    it('should handle form selectors', () => {
      const spec = CSSSpec.calculateSpecificity('input[type="text"]:focus:valid');
      assert.deepEqual(spec, [0, 3, 1], 'input with attribute and pseudo-classes');
    });

    it('should handle link selectors', () => {
      const spec = CSSSpec.calculateSpecificity('a:link:hover::after');
      // a = 1 type, :link = 1 pseudo-class, :hover = 1 pseudo-class, ::after = 1 pseudo-element
      assert.deepEqual(spec, [0, 2, 2], 'link selector');
    });

    it('should handle negation selectors', () => {
      const spec = CSSSpec.calculateSpecificity('li:not(.hidden):not(:last-child)');
      // li = 1 type, :not(.hidden) = 1 class, :not(:last-child) = 1 pseudo-class
      assert.deepEqual(spec, [0, 2, 1], 'multiple :not()');
    });
  });

  describe('edge cases', () => {
    it('should handle selectors with numbers in names', () => {
      const result = CSSSpec.parseSelector('.col-md-6');
      assert.equal(result[0].value, 'col-md-6', 'class with numbers');
    });

    it('should handle underscores in names', () => {
      const result = CSSSpec.parseSelector('.my_class');
      assert.equal(result[0].value, 'my_class', 'class with underscore');
    });

    it('should handle data attributes', () => {
      const result = CSSSpec.parseSelector('[data-value="123"]');
      assert.equal(result[0].type, 'attr', 'data attribute');
      assert.ok(result[0].value.includes('data-value'), 'contains data-value');
    });

    it('should handle attribute selectors with operators', () => {
      const result1 = CSSSpec.parseSelector('[class^="btn"]');
      assert.equal(result1[0].type, 'attr', 'starts with');

      const result2 = CSSSpec.parseSelector('[class$="primary"]');
      assert.equal(result2[0].type, 'attr', 'ends with');

      const result3 = CSSSpec.parseSelector('[class*="btn"]');
      assert.equal(result3[0].type, 'attr', 'contains');
    });
  });
});
