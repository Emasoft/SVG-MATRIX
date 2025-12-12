/**
 * Animation-Aware Reference Tracking Tests
 *
 * Tests for the animation-references.js module that ensures
 * SVG animations are NEVER destroyed by optimization passes.
 *
 * This directly addresses SVGO's critical flaw of destroying animations
 * by removing "unused" defs that are actually referenced by animations.
 */

import {
  parseUrlId,
  parseHrefId,
  parseAnimationValueIds,
  parseTimingIds,
  parseCSSIds,
  parseJavaScriptIds,
  collectElementReferences,
  collectAllReferences,
  isIdReferenced,
  getIdReferenceInfo,
  findUnreferencedDefs,
  removeUnreferencedDefsSafe,
  ANIMATION_ELEMENTS,
  HREF_ATTRIBUTES,
  URL_ATTRIBUTES,
  TIMING_ATTRIBUTES,
  VALUE_ATTRIBUTES,
} from '../src/animation-references.js';
import { parseSVG } from '../src/svg-parser.js';

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function assertArrayContains(arr, item, message) {
  if (arr.includes(item)) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (array does not contain ${item})`);
  }
}

function assertSetHas(set, item, message) {
  if (set.has(item)) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (set does not have ${item})`);
  }
}

// ============================================================================
// UNIT TESTS: Individual parsing functions
// ============================================================================

console.log('\n=== Animation Reference Parsing Tests ===\n');

console.log('--- parseUrlId tests ---');
assert(parseUrlId('url(#gradient1)') === 'gradient1', 'parses url(#id) syntax');
assert(parseUrlId('url("#filter-blur")') === 'filter-blur', 'parses url("#id") with double quotes');
assert(parseUrlId("url('#mask-alpha')") === 'mask-alpha', "parses url('#id') with single quotes");
assert(parseUrlId('url(  #spacey  )') === 'spacey', 'handles whitespace in url()');
assert(parseUrlId('red') === null, 'returns null for non-url values');
assert(parseUrlId('#000000') === null, 'returns null for color values');
assert(parseUrlId('') === null, 'returns null for empty string');
assert(parseUrlId(null) === null, 'returns null for null');
assert(parseUrlId('url(external.svg#foo)') === null, 'returns null for external URLs');

console.log('\n--- parseHrefId tests ---');
assert(parseHrefId('#symbol1') === 'symbol1', 'parses #id references');
assert(parseHrefId('#FRAME001') === 'FRAME001', 'parses uppercase #id references');
assert(parseHrefId('external.svg#foo') === null, 'returns null for external references');
assert(parseHrefId('http://example.com/') === null, 'returns null for absolute URLs');
assert(parseHrefId('') === null, 'returns null for empty string');
assert(parseHrefId(null) === null, 'returns null for null');

console.log('\n--- parseAnimationValueIds tests ---');
const frameIds = parseAnimationValueIds('#FRAME001;#FRAME002;#FRAME003');
assert(arraysEqual(frameIds, ['FRAME001', 'FRAME002', 'FRAME003']), 'parses frame-by-frame animation values');
const mixedIds = parseAnimationValueIds('#gradient1; url(#gradient2); none; #gradient3');
assertArrayContains(mixedIds, 'gradient1', 'parses mixed values - gradient1');
assertArrayContains(mixedIds, 'gradient2', 'parses mixed values - gradient2 from url()');
assertArrayContains(mixedIds, 'gradient3', 'parses mixed values - gradient3');
const spacedIds = parseAnimationValueIds('  #frame1  ;  #frame2  ');
assert(arraysEqual(spacedIds, ['frame1', 'frame2']), 'handles whitespace');
const singleId = parseAnimationValueIds('#single-frame');
assert(arraysEqual(singleId, ['single-frame']), 'handles single value');
assert(parseAnimationValueIds('0;100;200').length === 0, 'returns empty for numeric values');
assert(parseAnimationValueIds('').length === 0, 'returns empty for empty string');
assert(parseAnimationValueIds(null).length === 0, 'returns empty for null');

console.log('\n--- parseTimingIds tests ---');
const clickIds = parseTimingIds('button.click');
assert(arraysEqual(clickIds, ['button']), 'parses element.click references');
const beginIds = parseTimingIds('anim1.begin');
assert(arraysEqual(beginIds, ['anim1']), 'parses element.begin references');
const endIds = parseTimingIds('fadeOut.end');
assert(arraysEqual(endIds, ['fadeOut']), 'parses element.end references');
const offsetIds = parseTimingIds('anim1.end+1s');
assert(arraysEqual(offsetIds, ['anim1']), 'parses element.end+offset');
const multiTiming = parseTimingIds('3s; button.click; anim1.end');
assertArrayContains(multiTiming, 'button', 'parses multiple timing - button');
assertArrayContains(multiTiming, 'anim1', 'parses multiple timing - anim1');
assert(arraysEqual(parseTimingIds('el.mousedown'), ['el']), 'handles mousedown event');
assert(arraysEqual(parseTimingIds('el.mouseover'), ['el']), 'handles mouseover event');
assert(arraysEqual(parseTimingIds('el.focusin'), ['el']), 'handles focusin event');
assert(arraysEqual(parseTimingIds('el.repeat'), ['el']), 'handles repeat event');
assert(parseTimingIds('3s').length === 0, 'returns empty for time-only values');
assert(parseTimingIds('click').length === 0, 'returns empty for event-only values');

console.log('\n--- parseCSSIds tests ---');
const cssIds = parseCSSIds('fill: url(#gradient1); stroke: url(#gradient2);');
assertArrayContains(cssIds, 'gradient1', 'parses url(#id) in CSS - gradient1');
assertArrayContains(cssIds, 'gradient2', 'parses url(#id) in CSS - gradient2');
const quotedCssIds = parseCSSIds('fill: url("#gradient1"); stroke: url(\'#gradient2\');');
assertArrayContains(quotedCssIds, 'gradient1', 'parses quoted url(#id) - double quotes');
assertArrayContains(quotedCssIds, 'gradient2', 'parses quoted url(#id) - single quotes');
assert(parseCSSIds('fill: red; stroke: blue;').length === 0, 'returns empty for no refs');
assert(parseCSSIds('').length === 0, 'returns empty for empty string');

console.log('\n--- parseJavaScriptIds tests ---');
const getByIdIds = parseJavaScriptIds("document.getElementById('myElement')");
assertArrayContains(getByIdIds, 'myElement', 'parses getElementById calls');
const doubleQuoteIds = parseJavaScriptIds('document.getElementById("anotherElement")');
assertArrayContains(doubleQuoteIds, 'anotherElement', 'parses getElementById with double quotes');
const qsIds = parseJavaScriptIds("document.querySelector('#targetId')");
assertArrayContains(qsIds, 'targetId', 'parses querySelector with #id');
const qsaIds = parseJavaScriptIds("document.querySelectorAll('#listItem')");
assertArrayContains(qsaIds, 'listItem', 'parses querySelectorAll with #id');
assert(parseJavaScriptIds('var x = 1;').length === 0, 'returns empty for no refs');

// ============================================================================
// INTEGRATION TESTS: Full SVG document analysis
// ============================================================================

console.log('\n=== SVG Document Reference Collection Tests ===\n');

console.log('--- Static reference detection ---');
const staticSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1"><stop offset="0%" stop-color="red"/></linearGradient>
  </defs>
  <rect fill="url(#grad1)" width="100" height="100"/>
</svg>`;
const staticDoc = parseSVG(staticSvg);
const staticRefs = collectAllReferences(staticDoc);
assertSetHas(staticRefs.static, 'grad1', 'detects static url() reference');
assertSetHas(staticRefs.all, 'grad1', 'grad1 in all references');

console.log('\n--- Use element href detection ---');
const useSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <symbol id="icon"><circle r="10"/></symbol>
  </defs>
  <use href="#icon" x="50" y="50"/>
</svg>`;
const useDoc = parseSVG(useSvg);
const useRefs = collectAllReferences(useDoc);
assertSetHas(useRefs.static, 'icon', 'detects use element href reference');

console.log('\n--- xlink:href detection ---');
const xlinkSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <symbol id="sym1"><rect width="10" height="10"/></symbol>
  </defs>
  <use xlink:href="#sym1"/>
</svg>`;
const xlinkDoc = parseSVG(xlinkSvg);
const xlinkRefs = collectAllReferences(xlinkDoc);
assertSetHas(xlinkRefs.static, 'sym1', 'detects xlink:href reference');

// ============================================================================
// CRITICAL TEST: Frame-by-frame animation preservation
// ============================================================================

console.log('\n=== CRITICAL: Frame-by-Frame Animation Detection ===\n');

const fbfSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <g id="FRAME001"><circle cx="10" cy="50" r="10" fill="red"/></g>
    <g id="FRAME002"><circle cx="30" cy="50" r="10" fill="blue"/></g>
    <g id="FRAME003"><circle cx="50" cy="50" r="10" fill="green"/></g>
    <g id="FRAME004"><circle cx="70" cy="50" r="10" fill="yellow"/></g>
    <g id="FRAME005"><circle cx="90" cy="50" r="10" fill="purple"/></g>
  </defs>
  <use xlink:href="#FRAME001">
    <animate attributeName="xlink:href"
             values="#FRAME001;#FRAME002;#FRAME003;#FRAME004;#FRAME005"
             dur="0.5s"
             repeatCount="indefinite"/>
  </use>
</svg>`;

const fbfDoc = parseSVG(fbfSvg);
const fbfRefs = collectAllReferences(fbfDoc);

// These are the critical references that SVGO destroys!
assertSetHas(fbfRefs.animation, 'FRAME001', 'detects FRAME001 in animation values');
assertSetHas(fbfRefs.animation, 'FRAME002', 'detects FRAME002 in animation values');
assertSetHas(fbfRefs.animation, 'FRAME003', 'detects FRAME003 in animation values');
assertSetHas(fbfRefs.animation, 'FRAME004', 'detects FRAME004 in animation values');
assertSetHas(fbfRefs.animation, 'FRAME005', 'detects FRAME005 in animation values');
assert(fbfRefs.animation.size >= 5, 'all 5 frames detected as animation refs');

console.log('\n--- SMIL from/to reference detection ---');
const fromToSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <g id="start-state"><rect width="10" height="10"/></g>
    <g id="end-state"><rect width="20" height="20"/></g>
  </defs>
  <use xlink:href="#start-state">
    <animate attributeName="xlink:href" from="#start-state" to="#end-state" dur="2s"/>
  </use>
</svg>`;
const fromToDoc = parseSVG(fromToSvg);
const fromToRefs = collectAllReferences(fromToDoc);
assertSetHas(fromToRefs.animation, 'start-state', 'detects from="#start-state" reference');
assertSetHas(fromToRefs.animation, 'end-state', 'detects to="#end-state" reference');

console.log('\n--- SMIL timing reference detection ---');
const timingSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect id="trigger" width="100" height="100" fill="red"/>
  <circle id="animated" cx="50" cy="50" r="20" fill="blue">
    <animate attributeName="r" from="20" to="40" dur="1s" begin="trigger.click"/>
  </circle>
  <rect id="chained" width="50" height="50" fill="green">
    <animate attributeName="opacity" from="1" to="0" dur="0.5s" begin="animated.end+0.5s"/>
  </rect>
</svg>`;
const timingDoc = parseSVG(timingSvg);
const timingRefs = collectAllReferences(timingDoc);
assertSetHas(timingRefs.animation, 'trigger', 'detects begin="trigger.click" reference');
assertSetHas(timingRefs.animation, 'animated', 'detects begin="animated.end+0.5s" reference');

console.log('\n--- animateMotion mpath detection ---');
const mpathSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <path id="motionPath" d="M0,0 C50,0 50,100 100,100"/>
  </defs>
  <circle cx="0" cy="0" r="5" fill="red">
    <animateMotion dur="5s" repeatCount="indefinite">
      <mpath xlink:href="#motionPath"/>
    </animateMotion>
  </circle>
</svg>`;
const mpathDoc = parseSVG(mpathSvg);
const mpathRefs = collectAllReferences(mpathDoc);
assertSetHas(mpathRefs.animation, 'motionPath', 'detects mpath xlink:href reference');

console.log('\n--- CSS url() in style element detection ---');
const cssSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cssGrad"><stop offset="0%" stop-color="blue"/></linearGradient>
  </defs>
  <style>
    .styled { fill: url(#cssGrad); }
  </style>
  <rect class="styled" width="100" height="100"/>
</svg>`;
const cssDoc = parseSVG(cssSvg);
const cssRefs = collectAllReferences(cssDoc);
assertSetHas(cssRefs.css, 'cssGrad', 'detects url(#id) in style element');
assertSetHas(cssRefs.all, 'cssGrad', 'cssGrad in all references');

console.log('\n--- JavaScript getElementById detection ---');
const jsSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <g id="dynamicContent"><text>Dynamic</text></g>
  </defs>
  <script>
    var el = document.getElementById('dynamicContent');
    el.style.display = 'block';
  </script>
</svg>`;
const jsDoc = parseSVG(jsSvg);
const jsRefs = collectAllReferences(jsDoc);
assertSetHas(jsRefs.js, 'dynamicContent', 'detects getElementById reference');
assertSetHas(jsRefs.all, 'dynamicContent', 'dynamicContent in all references');

// ============================================================================
// findUnreferencedDefs tests
// ============================================================================

console.log('\n=== findUnreferencedDefs Tests ===\n');

const defsSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <g id="FRAME001"><rect width="10" height="10"/></g>
    <g id="FRAME002"><rect width="20" height="20"/></g>
    <g id="UNUSED"><rect width="30" height="30"/></g>
  </defs>
  <use xlink:href="#FRAME001">
    <animate attributeName="xlink:href" values="#FRAME001;#FRAME002" dur="1s"/>
  </use>
</svg>`;

const defsDoc = parseSVG(defsSvg);
const defsResult = findUnreferencedDefs(defsDoc);

assertArrayContains(defsResult.animationReferenced, 'FRAME001', 'FRAME001 identified as animation-referenced');
assertArrayContains(defsResult.animationReferenced, 'FRAME002', 'FRAME002 identified as animation-referenced');
assertArrayContains(defsResult.safeToRemove, 'UNUSED', 'UNUSED identified as safe to remove');
assert(!defsResult.safeToRemove.includes('FRAME001'), 'FRAME001 NOT in safeToRemove');
assert(!defsResult.safeToRemove.includes('FRAME002'), 'FRAME002 NOT in safeToRemove');

// ============================================================================
// removeUnreferencedDefsSafe tests
// ============================================================================

console.log('\n=== removeUnreferencedDefsSafe Tests ===\n');

const removeSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <g id="FRAME001"><rect width="10" height="10"/></g>
    <g id="FRAME002"><rect width="20" height="20"/></g>
    <g id="UNUSED1"><rect width="30" height="30"/></g>
    <g id="UNUSED2"><rect width="40" height="40"/></g>
  </defs>
  <use xlink:href="#FRAME001">
    <animate attributeName="xlink:href" values="#FRAME001;#FRAME002" dur="1s"/>
  </use>
</svg>`;

const removeDoc = parseSVG(removeSvg);
const removeResult = removeUnreferencedDefsSafe(removeDoc);

assertArrayContains(removeResult.removed, 'UNUSED1', 'UNUSED1 removed');
assertArrayContains(removeResult.removed, 'UNUSED2', 'UNUSED2 removed');
assertArrayContains(removeResult.keptForAnimation, 'FRAME001', 'FRAME001 kept for animation');
assertArrayContains(removeResult.keptForAnimation, 'FRAME002', 'FRAME002 kept for animation');

// Verify elements still exist in DOM
const defs = removeDoc.getElementsByTagName('defs')[0];
const childIds = Array.from(defs.children).map(el => el.getAttribute('id'));
assertArrayContains(childIds, 'FRAME001', 'FRAME001 still in DOM after safe removal');
assertArrayContains(childIds, 'FRAME002', 'FRAME002 still in DOM after safe removal');
assert(!childIds.includes('UNUSED1'), 'UNUSED1 removed from DOM');
assert(!childIds.includes('UNUSED2'), 'UNUSED2 removed from DOM');

// ============================================================================
// Constants tests
// ============================================================================

console.log('\n=== Module Constants Tests ===\n');

assertArrayContains(ANIMATION_ELEMENTS, 'animate', 'ANIMATION_ELEMENTS contains animate');
assertArrayContains(ANIMATION_ELEMENTS, 'animateTransform', 'ANIMATION_ELEMENTS contains animateTransform');
assertArrayContains(ANIMATION_ELEMENTS, 'animateMotion', 'ANIMATION_ELEMENTS contains animateMotion');
assertArrayContains(ANIMATION_ELEMENTS, 'set', 'ANIMATION_ELEMENTS contains set');

assertArrayContains(HREF_ATTRIBUTES, 'href', 'HREF_ATTRIBUTES contains href');
assertArrayContains(HREF_ATTRIBUTES, 'xlink:href', 'HREF_ATTRIBUTES contains xlink:href');

assertArrayContains(URL_ATTRIBUTES, 'fill', 'URL_ATTRIBUTES contains fill');
assertArrayContains(URL_ATTRIBUTES, 'stroke', 'URL_ATTRIBUTES contains stroke');
assertArrayContains(URL_ATTRIBUTES, 'clip-path', 'URL_ATTRIBUTES contains clip-path');
assertArrayContains(URL_ATTRIBUTES, 'mask', 'URL_ATTRIBUTES contains mask');
assertArrayContains(URL_ATTRIBUTES, 'filter', 'URL_ATTRIBUTES contains filter');

assertArrayContains(TIMING_ATTRIBUTES, 'begin', 'TIMING_ATTRIBUTES contains begin');
assertArrayContains(TIMING_ATTRIBUTES, 'end', 'TIMING_ATTRIBUTES contains end');

assertArrayContains(VALUE_ATTRIBUTES, 'values', 'VALUE_ATTRIBUTES contains values');
assertArrayContains(VALUE_ATTRIBUTES, 'from', 'VALUE_ATTRIBUTES contains from');
assertArrayContains(VALUE_ATTRIBUTES, 'to', 'VALUE_ATTRIBUTES contains to');
assertArrayContains(VALUE_ATTRIBUTES, 'by', 'VALUE_ATTRIBUTES contains by');

// ============================================================================
// Helper function tests
// ============================================================================

console.log('\n=== Helper Function Tests ===\n');

console.log('--- isIdReferenced ---');
const isRefSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="grad"/></defs>
  <rect fill="url(#grad)"/>
</svg>`;
const isRefDoc = parseSVG(isRefSvg);
assert(isIdReferenced(isRefDoc, 'grad') === true, 'isIdReferenced returns true for referenced ID');

const notRefSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="unused"/></defs>
  <rect fill="red"/>
</svg>`;
const notRefDoc = parseSVG(notRefSvg);
assert(isIdReferenced(notRefDoc, 'unused') === false, 'isIdReferenced returns false for unreferenced ID');

console.log('\n--- getIdReferenceInfo ---');
const staticInfoSvg = `<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="grad"/></defs>
  <rect fill="url(#grad)"/>
</svg>`;
const staticInfoDoc = parseSVG(staticInfoSvg);
const staticInfo = getIdReferenceInfo(staticInfoDoc, 'grad');
assert(staticInfo.referenced === true, 'getIdReferenceInfo - referenced is true');
assert(staticInfo.type === 'static', 'getIdReferenceInfo - type is static');
assert(staticInfo.sources.length > 0, 'getIdReferenceInfo - has sources');

const animInfoSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs><g id="frame"/></defs>
  <use xlink:href="#frame">
    <animate attributeName="xlink:href" values="#frame" dur="1s"/>
  </use>
</svg>`;
const animInfoDoc = parseSVG(animInfoSvg);
const animInfo = getIdReferenceInfo(animInfoDoc, 'frame');
assert(animInfo.referenced === true, 'getIdReferenceInfo - animation ref is true');
assert(animInfo.type === 'animation', 'getIdReferenceInfo - type is animation');

const noRefInfo = getIdReferenceInfo(notRefDoc, 'unused');
assert(noRefInfo.referenced === false, 'getIdReferenceInfo - unreferenced is false');
assert(noRefInfo.type === null, 'getIdReferenceInfo - type is null for unreferenced');
assert(noRefInfo.sources.length === 0, 'getIdReferenceInfo - no sources for unreferenced');

// ============================================================================
// Summary
// ============================================================================

console.log('\n=== Animation References Tests Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
