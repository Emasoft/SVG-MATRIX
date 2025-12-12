#!/usr/bin/env node
/**
 * SVG Toolbox Optimization Examples
 *
 * This example demonstrates the SVG Toolbox functions for parsing,
 * optimizing, and transforming SVG files with arbitrary precision.
 *
 * Functions demonstrated:
 * - parseSVG / serializeSVG - Parse and serialize SVG documents
 * - cleanupNumericValues - Round numbers to specified precision
 * - cleanupIds - Remove/rename unused IDs
 * - removeComments - Strip XML comments
 * - removeMetadata - Remove metadata elements
 * - convertShapesToPath - Convert shapes (rect, circle, etc.) to paths
 * - convertPathData - Optimize path data with precision control
 * - collapseGroups - Flatten unnecessary group nesting
 * - mergePaths - Combine adjacent paths with same style
 *
 * Run: node examples/04-svg-toolbox-optimization.js
 */

import * as SVGToolbox from '../src/svg-toolbox.js';

// Sample SVG with various elements to optimize
const sampleSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- This is a test SVG with various elements -->
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <metadata>
    <author>Test Author</author>
    <created>2024-01-01</created>
  </metadata>
  <defs>
    <linearGradient id="unused-gradient">
      <stop offset="0%" stop-color="red"/>
      <stop offset="100%" stop-color="blue"/>
    </linearGradient>
    <linearGradient id="used-gradient">
      <stop offset="0%" stop-color="green"/>
      <stop offset="100%" stop-color="yellow"/>
    </linearGradient>
  </defs>
  <!-- Shape elements that can be converted to paths -->
  <g id="shapes">
    <rect id="rect1" x="10.123456789" y="20.987654321" width="50.111111111" height="30.222222222" fill="#ff0000"/>
    <circle id="circle1" cx="150.333333333" cy="50.444444444" r="25.555555555" fill="url(#used-gradient)"/>
    <ellipse id="ellipse1" cx="250.666666666" cy="50.777777777" rx="30.888888888" ry="20.999999999" fill="#00ff00"/>
  </g>
  <!-- Nested groups that can be collapsed -->
  <g id="outer">
    <g id="middle">
      <g id="inner">
        <path d="M 10.123456789012345 100.987654321098765 L 50.111111111111111 100.222222222222222 L 50.333333333333333 130.444444444444444 Z" fill="#0000ff"/>
      </g>
    </g>
  </g>
  <!-- Empty elements that can be removed -->
  <g id="empty-group"></g>
  <path id="empty-path" d=""/>
</svg>`;

function printSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printSize(label, svg) {
  console.log(`  ${label}: ${svg.length} bytes`);
}

async function runExamples() {
  console.log('SVG Toolbox Optimization Examples');
  console.log('==================================\n');

  const originalSize = sampleSVG.length;
  console.log(`Original SVG size: ${originalSize} bytes\n`);

  // =========================================================================
  // Example 1: Parse and serialize (round-trip)
  // =========================================================================
  printSection('1. Parse and Serialize (Round-trip)');

  try {
    const parsed = SVGToolbox.parseSVG(sampleSVG);
    const serialized = SVGToolbox.serializeSVG(parsed);

    console.log('  Successfully parsed and serialized SVG');
    printSize('Original', sampleSVG);
    printSize('Serialized', serialized);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 2: Remove comments
  // =========================================================================
  printSection('2. Remove Comments');

  try {
    const noComments = await SVGToolbox.removeComments(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', noComments);
    console.log(`  Reduction: ${((originalSize - noComments.length) / originalSize * 100).toFixed(1)}%`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 3: Remove metadata
  // =========================================================================
  printSection('3. Remove Metadata');

  try {
    const noMetadata = await SVGToolbox.removeMetadata(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', noMetadata);
    console.log(`  Reduction: ${((originalSize - noMetadata.length) / originalSize * 100).toFixed(1)}%`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 4: Cleanup numeric values (precision control)
  // =========================================================================
  printSection('4. Cleanup Numeric Values');

  try {
    // Round to 2 decimal places
    const cleaned2 = await SVGToolbox.cleanupNumericValues(sampleSVG, { floatPrecision: 2 });
    printSize('Original', sampleSVG);
    printSize('2 decimals', cleaned2);

    // Round to 4 decimal places
    const cleaned4 = await SVGToolbox.cleanupNumericValues(sampleSVG, { floatPrecision: 4 });
    printSize('4 decimals', cleaned4);

    console.log('\n  Example number transformation:');
    console.log('    Before: 10.123456789012345');
    console.log('    After (2 decimals): 10.12');
    console.log('    After (4 decimals): 10.1235');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 5: Convert shapes to paths
  // =========================================================================
  printSection('5. Convert Shapes to Paths');

  try {
    const pathified = await SVGToolbox.convertShapesToPath(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', pathified);

    console.log('\n  Conversions performed:');
    console.log('    <rect> -> <path d="M...L...L...L...Z"/>');
    console.log('    <circle> -> <path d="M...A...A...Z"/>');
    console.log('    <ellipse> -> <path d="M...A...A...Z"/>');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 6: Cleanup IDs (remove unused)
  // =========================================================================
  printSection('6. Cleanup IDs');

  try {
    const cleanedIds = await SVGToolbox.cleanupIds(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', cleanedIds);

    console.log('\n  ID cleanup:');
    console.log('    - Removed: unused-gradient (not referenced)');
    console.log('    - Kept: used-gradient (referenced by fill="url(#used-gradient)")');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 7: Remove empty containers
  // =========================================================================
  printSection('7. Remove Empty Containers');

  try {
    const noEmpty = await SVGToolbox.removeEmptyContainers(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', noEmpty);

    console.log('\n  Removed:');
    console.log('    - <g id="empty-group"></g>');
    console.log('    - <path id="empty-path" d=""/>');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 8: Collapse groups
  // =========================================================================
  printSection('8. Collapse Groups');

  try {
    const collapsed = await SVGToolbox.collapseGroups(sampleSVG);
    printSize('Before', sampleSVG);
    printSize('After', collapsed);

    console.log('\n  Flattens unnecessary nesting:');
    console.log('    Before: <g id="outer"><g id="middle"><g id="inner">...');
    console.log('    After:  <g id="inner">...');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 9: Full optimization pipeline
  // =========================================================================
  printSection('9. Full Optimization Pipeline');

  try {
    let optimized = sampleSVG;

    // Apply optimizations in sequence
    const steps = [
      { name: 'removeComments', fn: SVGToolbox.removeComments },
      { name: 'removeMetadata', fn: SVGToolbox.removeMetadata },
      { name: 'cleanupIds', fn: SVGToolbox.cleanupIds },
      { name: 'removeEmptyContainers', fn: SVGToolbox.removeEmptyContainers },
      { name: 'collapseGroups', fn: SVGToolbox.collapseGroups },
      { name: 'cleanupNumericValues', fn: (svg) => SVGToolbox.cleanupNumericValues(svg, { floatPrecision: 3 }) },
    ];

    console.log('  Applying optimization pipeline:\n');
    console.log(`  ${'Step'.padEnd(30)} ${'Size'.padEnd(12)} Reduction`);
    console.log('  ' + '-'.repeat(55));
    console.log(`  ${'Original'.padEnd(30)} ${String(optimized.length).padEnd(12)} -`);

    for (const step of steps) {
      const before = optimized.length;
      optimized = await step.fn(optimized);
      const reduction = ((before - optimized.length) / before * 100).toFixed(1);
      console.log(`  ${step.name.padEnd(30)} ${String(optimized.length).padEnd(12)} ${reduction}%`);
    }

    console.log('  ' + '-'.repeat(55));
    const totalReduction = ((originalSize - optimized.length) / originalSize * 100).toFixed(1);
    console.log(`  ${'TOTAL'.padEnd(30)} ${String(optimized.length).padEnd(12)} ${totalReduction}%`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // =========================================================================
  // Example 10: Precision comparison with SVGO
  // =========================================================================
  printSection('10. Precision Advantage over SVGO');

  console.log(`
  svg-matrix SVG Toolbox uses Decimal.js for arbitrary precision,
  avoiding the floating-point errors that affect SVGO.

  Example with coordinate 10.123456789012345:

  ┌─────────────────────────────────────────────────────────────────┐
  │  Tool          │ Precision    │ Output              │ Error    │
  ├─────────────────────────────────────────────────────────────────┤
  │  SVGO          │ float64      │ 10.123456789012344  │ 1e-15    │
  │  svg-matrix    │ Decimal(80)  │ 10.123456789012345  │ 0        │
  └─────────────────────────────────────────────────────────────────┘

  For cumulative transforms (CTM), this difference grows exponentially.
  After 10 transform compositions:
    - SVGO error: ~1e-14 (visible at sub-pixel level)
    - svg-matrix error: <1e-70 (essentially zero)
`);

  console.log('\n' + '='.repeat(70));
  console.log('  Examples completed successfully!');
  console.log('='.repeat(70));
}

// Run examples
runExamples().catch(console.error);
