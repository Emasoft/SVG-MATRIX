# Detailed Investigation Findings - SVG Function Test Failures

## Test Failure Matrix

### All 8 Functions - Common Failure Points

```
FILE                        | animate-02 | coords-view | filters-felem | linking-04 | linking-07 | paths-data-20
                            | (undefined)| (structure) | (null+broken) | (undefined)| (structure)| (arc error)
----------------------------+------------+-------------+---------------+------------+------------+-----------
simplifyPaths               |    YES     |     YES     |      YES      |    YES     |    YES     |    YES (6th)
removeAttributesBySelector  |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeAttrs                 |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeEditorsNSData         |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeStyleElement          |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeTitle                 |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeUselessDefs           |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
removeXlink                 |    YES     |     YES     |      YES      |    YES     |    YES     |    NO
```

**Observations:**
- All 8 functions fail on the same 5 core files (animate-dom-02, coords-viewattr-01, filters-felem-01, linking-a-04, linking-a-07)
- Only simplifyPaths has an additional 6th failure (paths-data-20)
- **Total: 7 functions × 5 failures = 35 shared failures + 1 unique = 36 failures**

---

## Failure Analysis by Category

### Category A: XML Structure Imbalance (7 functions × 2 files = 14 failures)

**Affected Files:**
- `coords-viewattr-01-b.svg`: 51 open tags vs 68 close tags (imbalance: +17)
- `linking-a-07-t.svg`: 24 open tags vs 35 close tags (imbalance: +11)

**Error Pattern:**
```
Validation Errors:
XML structure: 51 open tags, 68 close tags, 2 self-closing
```

**Root Cause:** SVG Serialization Logic

The serializer (in `svg-parser.js`) appears to be producing unbalanced XML. This could be due to:

1. **Self-closing tag handling:** Elements marked as self-closing may still be getting closing tags
2. **Tag counting algorithm:** The regex pattern for counting tags may not correctly handle:
   - Attributes with `/` in values
   - CDATA sections
   - Comments containing tag-like content
   - Attributes with embedded `>` characters

3. **Element trees with empty content:** Elements with no children should be self-closed but might be output as `<element></element>` + counted twice

**Evidence from Line Diff:**
Original has multi-line formatted XML:
```xml
<svg id="svg-root" width="100%" height="100%" 
  viewBox="0 0 480 360" xmlns="http://www.w3.org/2000/svg" 
  xmlns:xlink="http://www.w3.org/1999/xlink">
```

Processed is single-line minified:
```xml
<?xml version="1.0" encoding="UTF-8"?><svg id="svg-root"...viewBox="0 0 480 360"...></svg>
```

The minification itself is not the problem - the problem is that the minified output has incorrect tag balance.

---

### Category B: "undefined" String Warnings (4 functions × 2 files = 8 failures)

**Affected Files:**
- `animate-dom-02-f.svg`
- `linking-a-04-t.svg`

**Error Pattern:**
```
Validation Errors:
CRITICAL: Contains "undefined" string - data corruption
```

**Actual Content Analysis:**

File: animate-dom-02-f.svg (Original)
```xml
<d:testdescription>
  <p>This tests that the methods on the ElementTimeControl
     interface returned undefined when invoked...
  <p>...typeof a.beginElement() == 'undefined'...
</d:testdescription>
```

**Root Cause:** FALSE POSITIVE

The word "undefined" appears in:
1. Test descriptions explaining JavaScript return values
2. JavaScript code snippets (`typeof ... == 'undefined'`)
3. Comments and literal text content

The validation rule correctly checks: "if output has 'undefined' but input doesn't"
However, both input AND output contain "undefined" in legitimate places.

**Hypothesis for Error Message:**
The error files in `/tmp/svg-function-tests/*/failed/*.errors.txt` contain STALE error messages from a previous test run with different validation logic. The current validation logic (at line 94-98) should NOT flag these as errors.

---

### Category C: "null" Value Warnings (7 functions × 1 file = 7 failures)

**Affected File:**
- `filters-felem-01-b.svg`

**Error Pattern:**
```
Validation Errors:
CRITICAL: Contains "null" value - data corruption

Warnings:
Pre-existing broken refs in original: notthere
```

**Actual Content Analysis:**

File: filters-felem-01-b.svg (Original)
```xml
<defs>
  <filter id="null"/>
  <filter id="nullreg" filterUnits="objectBoundingBox" x="40%" y="40%" width="20%" height="20%"/>
</defs>
<g>
  <circle r="40" fill="red" cx="130" cy="210" filter="url(#null)"/>
  <text>Null filter</text>
</g>
```

**Root Cause:** MISLEADING ERROR

The word "null" appears in:
1. Filter element ID: `<filter id="null"/>`
2. Test label text: "Null filter"
3. Comment about null filter testing

The validation rule checks: "if output has pattern `>null<` or `="null"` but input doesn't"
However, both input AND output contain the `id="null"` attribute.

**Additional Issue (Pre-existing):**
The file legitimately contains a broken reference: `filter="url(#notthere)"` - this is intentional in the W3C test file (testing error handling).

---

### Category D: Arc Flag Parsing Error (simplifyPaths only, 1 file = 1 failure)

**Affected File:**
- `paths-data-20-f.svg`

**Error:**
```
Error: Invalid arc flag at position 8: expected 0 or 1, got '6'
    at parseArcArgs (file:///Users/emanuelesabetta/Code/SVG-MATRIX/src/convert-path-data.js:59:15)
    at parsePath (file:///Users/emanuelesabetta/Code/SVG-MATRIX/src/convert-path-data.js:119:14)
```

**Root Cause:** Arc Flag Parsing Bug

The `parseArcArgs()` function in `convert-path-data.js` at line 59 expects arc flags to be 0 or 1, but encountered '6'.

**Why This Matters:**
Arc flags in SVG path data are part of elliptical arc commands (A/a). Format:
```
A rx ry x-axis-rotation large-arc-flag sweep-flag x y
```

Where:
- `large-arc-flag` must be 0 or 1
- `sweep-flag` must be 0 or 1

A value of '6' indicates:
1. Malformed input data in the test file, OR
2. Incorrect parsing logic that's reading the wrong position/character

**The "position 8" reference:**
- Position 8 likely refers to the 8th numeric character parsed
- This suggests the parser is off by some number of positions
- Or the input has unexpected spacing/formatting

---

## Validation Logic Issues

### Issue #1: Error Message Caching

The error files were generated with validation logic that's now outdated. Current validation messages say "ZERO TOLERANCE VIOLATION" but cached files say "data corruption".

**Evidence:**
- Test report JSON contains old error messages
- These don't match current `svg-function-test-runner.mjs` code
- Need to regenerate tests after fixes

### Issue #2: Tag Balance Regex Accuracy

The regex patterns used to count tags may not handle all edge cases:

```javascript
// Current (from test runner)
const origOpenTags = (origStripped.match(/<[a-zA-Z][^/>]*(?<!\/)\s*>/g) || []).length;
const origCloseTags = (origStripped.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
```

**Potential Issues:**
- Regex `(?<!/)` uses negative lookbehind - works in Node.js but might have edge cases
- Comment and CDATA stripping happens before counting
- But CDATA might contain `<tag>` patterns that look like XML tags
- Self-closing tags `/>` might not be counted properly

### Issue #3: String Content vs Structure

The "undefined" and "null" string checks don't distinguish between:
1. Literal string content in text/attributes (valid)
2. Corrupted data (invalid)

A better approach would be to check for specific patterns like:
- `="undefined"` (attribute corruption)
- `>undefined<` (text corruption at element boundaries)
- Escaped sequences: `&quot;undefined&quot;`

---

## Summary Table

| Root Cause | Category | Affected Functions | Affected Files | Count | Severity |
|-----------|----------|-------------------|-----------------|-------|----------|
| XML structure imbalance | Serialization | 7/8 | 2 files | 14 | HIGH |
| "undefined" string (false positive) | Validation | 4/8 | 2 files | 8 | LOW |
| "null" string (false positive) | Validation | 7/8 | 1 file | 7 | LOW |
| Arc flag parsing error | Path parsing | 1/8 | 1 file | 1 | HIGH |
| **TOTAL** | - | - | 5 unique files | 30 | - |

---

## Next Steps

### Immediate Actions
1. Fix XML serialization in `svg-parser.js`
2. Fix arc flag parsing in `convert-path-data.js`
3. Regenerate test reports
4. Update validation rules or suppress false positives

### Investigation Tools
- Check actual vs expected output for coords-viewattr-01-b.svg
- Compare tag structures before/after serialization
- Trace path parsing for paths-data-20-f.svg with debug output
- Review `svg-parser.js` serialization algorithm

