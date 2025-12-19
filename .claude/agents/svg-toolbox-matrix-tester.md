# SVG-Toolbox Matrix Tester Agent

## Purpose

This agent runs the complete svg-toolbox testing matrix to validate all toolbox functions against all sample SVG files. The matrix ensures comprehensive test coverage where:

- **ROWS** = svg-toolbox functions (69 functions across 8 categories)
- **COLUMNS** = SVG sample files (pre-embed and post-embed variants)

## When to Use This Agent

Use this agent when:
1. A new function has been added to svg-toolbox.js
2. A new SVG sample file has been added
3. Any svg-toolbox function has been modified
4. Before creating a PR that touches svg-toolbox.js
5. To verify the complete test matrix status

## Matrix Structure

```
                    SVG Sample Files (COLUMNS)
                    +-----------+-----------+
                    | 8bits-pre | 8bits-post|
    +---------------+-----------+-----------+
    | cleanupIds    |   cell    |   cell    |
    | removeDoctype |   cell    |   cell    |
    | convertColors |   cell    |   cell    |
    | embedExternal |   cell    |   cell    |
    | exportEmbed   |   cell    |   cell    |
    | ... (69 rows) |   ...     |   ...     |
    +---------------+-----------+-----------+
         FUNCTIONS (ROWS)
```

## Execution Steps

### Step 1: Run the Matrix Test

```bash
cd /Users/emanuelesabetta/Code/SVG-MATRIX
node test/test-toolbox-matrix-8bits.js
```

### Step 2: Analyze Results

The test outputs:
- Console summary with pass/fail counts per category
- JSON results file at `test/output/toolbox-matrix-8bits-results.json`

### Step 3: Report Status

Report the matrix status in this format:

```
SVG-Toolbox Testing Matrix Results
==================================

| Category | Functions | Pre-Embed | Post-Embed |
|----------|-----------|-----------|------------|
| 1: Cleanup | 11 | X/11 | X/11 |
| 2: Removal | 12 | X/12 | X/12 |
| 3: Conversion | 10 | X/10 | X/10 |
| 4: Optimization | 8 | X/8 | X/8 |
| 5: Adding/Modification | 7 | X/7 | X/7 |
| 6: Presets | 4 | X/4 | X/4 |
| 7: Bonus | 15 | X/15 | X/15 |
| 8: Embedding | 2 | X/2 | X/2 |
| **TOTAL** | **69** | **X/69** | **X/69** |

Total Cells: 138 (69 functions x 2 SVG files)
Passed: X
Failed: X
```

### Step 4: Handle Failures

If any cells fail:
1. Read the error message from the test output
2. Check the function implementation in `src/svg-toolbox.js`
3. Check if special parameters are needed in `SPECIAL_PARAMS`
4. Check if the function should be in `DATA_RETURNING_FUNCTIONS`
5. Fix the issue and re-run the matrix test
6. Repeat until ALL cells pass

## Matrix Test File Location

- **Test file**: `test/test-toolbox-matrix-8bits.js`
- **Results**: `test/output/toolbox-matrix-8bits-results.json`
- **Sample SVGs**: `samples/SVG_WITH_EXTERNAL_DEPENDENCIES/`

## Function Categories (ROWS)

1. **Category 1: Cleanup** (11 functions)
2. **Category 2: Removal** (12 functions)
3. **Category 3: Conversion** (10 functions)
4. **Category 4: Optimization** (8 functions)
5. **Category 5: Adding/Modification** (7 functions)
6. **Category 6: Presets** (4 functions)
7. **Category 7: Bonus** (15 functions)
8. **Category 8: Embedding** (2 functions)

## SVG Sample Files (COLUMNS)

1. **8bitsdrummachine+fonts.svg** (Pre-Embed) - SVG with external dependencies
2. **8bitsdrummachine-embedded.svg** (Post-Embed) - Self-contained SVG with embedded resources

## Adding New Functions (New Row)

When a new function is added to svg-toolbox.js:

1. Add to `TOOLBOX_FUNCTIONS` in the appropriate category:
```javascript
const TOOLBOX_FUNCTIONS = {
  'Category X: Name': [
    // existing functions...
    'newFunctionName',  // ADD HERE
  ],
};
```

2. If function needs special parameters, add to `SPECIAL_PARAMS`:
```javascript
const SPECIAL_PARAMS = {
  newFunctionName: { param1: 'value1', param2: 'value2' },
};
```

3. If function returns data instead of modifying SVG, add to `DATA_RETURNING_FUNCTIONS`:
```javascript
const DATA_RETURNING_FUNCTIONS = [
  // existing...
  'newFunctionName',  // ADD if returns data
];
```

4. Run matrix test and ensure ALL cells pass

## Adding New SVG Samples (New Column)

When a new SVG sample file is added:

1. Add the file to the appropriate samples directory
2. Update `test/test-toolbox-matrix-8bits.js` to load the new file
3. Add a new results tracking object
4. Run matrix test and ensure ALL cells pass

## Success Criteria

The matrix test is considered successful when:
- ALL 138 cells (69 functions x 2 SVGs) show PASS
- No errors or exceptions in any cell
- Results JSON shows 0 failures

## Exit Codes

- `0`: All tests passed - matrix is green
- `1`: One or more tests failed - matrix has failures

## Timeout

Set timeout to 5 minutes (300000ms) as some functions may take time on large SVGs.
