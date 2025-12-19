/**
 * Test script for generateFlexibleSVGTable function
 * Tests various table configurations: simple, grouped columns, hierarchical rows
 */

import { generateFlexibleSVGTable } from '../src/svg-toolbox.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, 'output');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Test 1: Simple 2x2 table
function testSimpleTable() {
  console.log('Test 1: Simple 2x2 table...');

  const svg = generateFlexibleSVGTable({
    title: 'Simple Test Table',
    subtitle: 'A basic 2x2 test',
    columns: [
      { id: 'col1', name: 'Column 1', color: '#1565C0' },
      { id: 'col2', name: 'Column 2', color: '#1976D2' },
    ],
    rowLevels: [
      { id: 'row', name: 'Row', width: 100 },
    ],
    rowData: [[
      { id: 'row1', name: 'Row 1', color: '#E3F2FD' },
      { id: 'row2', name: 'Row 2', color: '#E8F5E9' },
    ]],
    getCellContent: (rowPath, colId) => ({
      lines: ['Test line 1', 'Test line 2'],
      status: 'warn'
    }),
  });

  const outputPath = path.join(outputDir, 'test-simple.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate SVG structure
  if (!svg.includes('<svg xmlns=')) throw new Error('Missing SVG namespace');
  if (!svg.includes('viewBox="')) throw new Error('Missing viewBox');
  if (!svg.includes('preserveAspectRatio="xMinYMin meet"')) throw new Error('Missing preserveAspectRatio');
  if (!svg.includes('width="100%"')) throw new Error('Missing width=100%');
  if (!svg.includes('Simple Test Table')) throw new Error('Missing title');

  console.log('  -> PASS');
  return true;
}

// Test 2: Table with grouped columns
function testGroupedColumns() {
  console.log('Test 2: Grouped columns table...');

  const svg = generateFlexibleSVGTable({
    title: 'Grouped Columns Test',
    columns: [
      { id: 'standalone', name: 'Standalone', color: '#1565C0' },
      { id: 'g1', name: 'Group Item 1', color: '#1976D2', group: 'Group A', groupColor: '#0D47A1' },
      { id: 'g2', name: 'Group Item 2', color: '#1E88E5', group: 'Group A' },
      { id: 'g3', name: 'Group Item 3', color: '#42A5F5', group: 'Group B', groupColor: '#0D47A1' },
    ],
    rowLevels: [
      { id: 'row', name: 'Row', width: 60 },
    ],
    rowData: [[
      { id: 'row1', name: 'Row 1', color: '#E3F2FD' },
    ]],
    getCellContent: () => ({ lines: [], status: 'ok' }),
  });

  const outputPath = path.join(outputDir, 'test-grouped.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate group headers
  if (!svg.includes('Group A')) throw new Error('Missing Group A header');
  if (!svg.includes('Group B')) throw new Error('Missing Group B header');

  console.log('  -> PASS');
  return true;
}

// Test 3: Multi-level row hierarchy
function testHierarchicalRows() {
  console.log('Test 3: Multi-level row hierarchy...');

  const svg = generateFlexibleSVGTable({
    title: 'Multi-Level Hierarchy Test',
    columns: [
      { id: 'data', name: 'Data', color: '#1565C0' },
    ],
    rowLevels: [
      { id: 'category', name: 'Category', width: 100 },
      { id: 'subcategory', name: 'Sub', width: 80 },
      { id: 'item', name: 'Item', width: 80 },
    ],
    rowData: [[
      {
        id: 'catA', name: 'Category A', color: '#E3F2FD',
        children: [
          {
            id: 'subA1', name: 'Sub A1', color: '#BBDEFB',
            children: [
              { id: 'itemX', name: 'Item X', color: '#90CAF9' },
              { id: 'itemY', name: 'Item Y', color: '#64B5F6' },
            ]
          },
          {
            id: 'subA2', name: 'Sub A2', color: '#BBDEFB',
            children: [
              { id: 'itemZ', name: 'Item Z', color: '#90CAF9' },
            ]
          },
        ]
      },
      {
        id: 'catB', name: 'Category B', color: '#E8F5E9',
        children: [
          {
            id: 'subB1', name: 'Sub B1', color: '#C8E6C9',
            children: [
              { id: 'itemW', name: 'Item W', color: '#A5D6A7' },
            ]
          },
        ]
      },
    ]],
    getCellContent: (rowPath) => ({
      lines: rowPath.map(p => p.name),
      status: 'warn'
    }),
  });

  const outputPath = path.join(outputDir, 'test-hierarchy.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate hierarchical structure (cells span correctly)
  if (!svg.includes('Category A')) throw new Error('Missing Category A');
  if (!svg.includes('Sub A1')) throw new Error('Missing Sub A1');
  if (!svg.includes('Item X')) throw new Error('Missing Item X');

  console.log('  -> PASS');
  return true;
}

// Test 4: Large table (10x10)
function testLargeTable() {
  console.log('Test 4: Large 10x10 table...');

  const columns = [];
  for (let i = 1; i <= 10; i++) {
    columns.push({
      id: `col${i}`,
      name: `Column ${i}`,
      color: `hsl(${200 + i * 10}, 70%, ${50 + i * 2}%)`,
    });
  }

  const rows = [];
  for (let i = 1; i <= 10; i++) {
    rows.push({
      id: `row${i}`,
      name: `Row ${i}`,
      color: `hsl(${i * 20}, 30%, 95%)`,
    });
  }

  const svg = generateFlexibleSVGTable({
    title: 'Large Table Test (10x10)',
    subtitle: '100 cells total',
    columns,
    rowLevels: [{ id: 'row', name: 'Row', width: 80 }],
    rowData: [rows],
    getCellContent: (rowPath, colId) => {
      const rowNum = parseInt(rowPath[0].id.replace('row', ''));
      const colNum = parseInt(colId.replace('col', ''));
      const value = rowNum * colNum;
      return {
        lines: [`${rowNum} x ${colNum} = ${value}`],
        status: value > 50 ? 'warn' : 'ok'
      };
    },
  });

  const outputPath = path.join(outputDir, 'test-large.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate all rows and columns
  for (let i = 1; i <= 10; i++) {
    if (!svg.includes(`Row ${i}`)) throw new Error(`Missing Row ${i}`);
    if (!svg.includes(`Column ${i}`)) throw new Error(`Missing Column ${i}`);
  }

  console.log('  -> PASS');
  return true;
}

// Test 5: Table with legend
function testWithLegend() {
  console.log('Test 5: Table with legend...');

  const legendSvg = `
    <rect x="0" y="0" width="20" height="20" fill="#C8E6C9" stroke="#999"/>
    <text x="30" y="15" class="legend-text">OK - No issues</text>
    <rect x="0" y="30" width="20" height="20" fill="#FFF9C4" stroke="#999"/>
    <text x="30" y="45" class="legend-text">Warning - Minor issues</text>
    <rect x="0" y="60" width="20" height="20" fill="#FFCDD2" stroke="#999"/>
    <text x="30" y="75" class="legend-text">Bad - Critical issues</text>
  `;

  const svg = generateFlexibleSVGTable({
    title: 'Table With Legend',
    columns: [
      { id: 'col1', name: 'Status A', color: '#1565C0' },
      { id: 'col2', name: 'Status B', color: '#1976D2' },
    ],
    rowLevels: [{ id: 'row', name: 'Test', width: 100 }],
    rowData: [[
      { id: 'test1', name: 'Test 1', color: '#E3F2FD' },
      { id: 'test2', name: 'Test 2', color: '#E8F5E9' },
    ]],
    getCellContent: (rowPath, colId) => {
      if (rowPath[0].id === 'test1' && colId === 'col1') return { lines: [], status: 'ok' };
      if (rowPath[0].id === 'test1' && colId === 'col2') return { lines: ['Issue 1'], status: 'warn' };
      if (rowPath[0].id === 'test2' && colId === 'col1') return { lines: ['Critical!'], status: 'bad' };
      return { lines: [], status: 'ok' };
    },
    legend: legendSvg,
    options: { legendHeight: 100 },
  });

  const outputPath = path.join(outputDir, 'test-legend.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate legend content
  if (!svg.includes('OK - No issues')) throw new Error('Missing legend OK text');
  if (!svg.includes('Warning - Minor issues')) throw new Error('Missing legend Warning text');
  if (!svg.includes('Bad - Critical issues')) throw new Error('Missing legend Bad text');

  console.log('  -> PASS');
  return true;
}

// Test 6: Custom options
function testCustomOptions() {
  console.log('Test 6: Custom styling options...');

  const svg = generateFlexibleSVGTable({
    title: 'Custom Styled Table',
    columns: [
      { id: 'col1', name: 'Data', color: '#6A1B9A' },
    ],
    rowLevels: [{ id: 'row', name: 'Row', width: 120 }],
    rowData: [[
      { id: 'row1', name: 'Item One', color: '#F3E5F5' },
    ]],
    getCellContent: () => ({
      lines: ['Custom styled cell'],
      status: 'warn'
    }),
    options: {
      minCellWidth: 200,
      minCellHeight: 80,
      titleFontSize: 24,
      okColor: '#B2DFDB',
      warnColor: '#FFE0B2',
      badColor: '#FFCCBC',
      marginTop: 70,
      marginLeft: 40,
    },
  });

  const outputPath = path.join(outputDir, 'test-custom.svg');
  fs.writeFileSync(outputPath, svg);
  console.log(`  -> Saved to ${outputPath}`);
  console.log(`  -> Size: ${(svg.length / 1024).toFixed(1)} KB`);

  // Validate custom colors applied
  if (!svg.includes('#FFE0B2')) throw new Error('Custom warn color not applied');
  if (!svg.includes('transform="translate(40, 70)"')) throw new Error('Custom margins not applied');

  console.log('  -> PASS');
  return true;
}

// Run all tests
async function runTests() {
  console.log('='.repeat(60));
  console.log('Testing generateFlexibleSVGTable()');
  console.log('='.repeat(60));
  console.log('');

  const tests = [
    testSimpleTable,
    testGroupedColumns,
    testHierarchicalRows,
    testLargeTable,
    testWithLegend,
    testCustomOptions,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      console.log(`  -> FAIL: ${error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
