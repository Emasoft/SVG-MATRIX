/**
 * Unit Tests for Font Manager New Features
 *
 * Tests the following new functionality in font-manager.js:
 * 1. Font Caching System (initFontCache, getCachedFont, cacheFontData, cleanupFontCache, getFontCacheStats)
 * 2. Font Subsetting (isFonttoolsAvailable, subsetFont, subsetFontData)
 * 3. WOFF2 Compression (convertToWoff2, convertDataToWoff2)
 * 4. Duplicate Detection (detectDuplicateFontFaces, mergeDuplicateFontFaces)
 * 5. Intelligent Font Search (stringSimilarity, normalizeFontName, searchSimilarFonts, findFontAlternatives, downloadFont)
 *
 * Coverage: ~20 tests
 *
 * @module test-font-manager-features
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as FontManager from "../src/font-manager.js";
import { parseSVG } from "../src/svg-parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test output directory for generated files
const TEST_OUTPUT_DIR = path.join(__dirname, "output", "font-manager-tests");

// ============================================================================
// TEST FIXTURES
// ============================================================================

// SVG with duplicate @font-face rules
const SVG_WITH_DUPLICATE_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <style type="text/css">
    @font-face {
      font-family: 'TestFont';
      font-weight: 400;
      font-style: normal;
      src: url(data:font/woff2;base64,AAAA) format('woff2');
    }
    @font-face {
      font-family: 'TestFont';
      font-weight: 400;
      font-style: normal;
      src: url(data:font/woff2;base64,BBBB) format('woff2');
    }
    @font-face {
      font-family: 'AnotherFont';
      font-weight: 700;
      font-style: italic;
      src: url(data:font/woff2;base64,CCCC) format('woff2');
    }
  </style>
  <text font-family="TestFont" x="10" y="50">Hello World</text>
</svg>`;

// SVG with no duplicate fonts
const SVG_WITH_UNIQUE_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <style type="text/css">
    @font-face {
      font-family: 'FontA';
      font-weight: 400;
      src: url(data:font/woff2;base64,AAAA) format('woff2');
    }
    @font-face {
      font-family: 'FontB';
      font-weight: 700;
      src: url(data:font/woff2;base64,BBBB) format('woff2');
    }
  </style>
  <text font-family="FontA" x="10" y="50">Test</text>
</svg>`;

// SVG with multiple duplicate sets
const SVG_WITH_MULTIPLE_DUPLICATES = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <style type="text/css">
    @font-face { font-family: 'Font1'; font-weight: 400; font-style: normal; src: url(a); }
    @font-face { font-family: 'Font1'; font-weight: 400; font-style: normal; src: url(b); }
    @font-face { font-family: 'Font1'; font-weight: 400; font-style: normal; src: url(c); }
    @font-face { font-family: 'Font2'; font-weight: 700; font-style: normal; src: url(d); }
    @font-face { font-family: 'Font2'; font-weight: 700; font-style: normal; src: url(e); }
  </style>
  <text>Test</text>
</svg>`;

// ============================================================================
// SETUP AND TEARDOWN
// ============================================================================

// Ensure test output directory exists
before(async () => {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

// Clean up test output after all tests
after(async () => {
  // Optionally clean up test files
  // fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

// ============================================================================
// 1. STRING SIMILARITY TESTS
// ============================================================================

describe("String Similarity (stringSimilarity)", () => {
  it("returns 1 for identical strings", () => {
    const result = FontManager.stringSimilarity("Roboto", "Roboto");
    assert.strictEqual(result, 1, "Identical strings should have similarity 1");
  });

  it("returns 1 for identical strings with different case", () => {
    const result = FontManager.stringSimilarity("ROBOTO", "roboto");
    assert.strictEqual(result, 1, "Case-insensitive comparison should return 1");
  });

  it("returns 0.8 when one string contains the other", () => {
    const result = FontManager.stringSimilarity("Roboto Mono", "Roboto");
    assert.strictEqual(result, 0.8, "Containment should return 0.8");
  });

  it("returns 0 for empty strings", () => {
    const result = FontManager.stringSimilarity("", "Roboto");
    assert.strictEqual(result, 0, "Empty string comparison should return 0");
  });

  it("calculates Levenshtein similarity for different strings", () => {
    const result = FontManager.stringSimilarity("Roboto", "Roberto");
    assert.ok(result > 0.7 && result < 1, `Similarity ${result} should be between 0.7 and 1`);
  });

  it("returns low similarity for very different strings", () => {
    const result = FontManager.stringSimilarity("Arial", "ZapfDingbats");
    assert.ok(result < 0.5, `Similarity ${result} should be less than 0.5 for different strings`);
  });
});

// ============================================================================
// 2. FONT NAME NORMALIZATION TESTS
// ============================================================================

describe("Font Name Normalization (normalizeFontName)", () => {
  it("removes quotes from font name", () => {
    const result = FontManager.normalizeFontName("'Roboto'");
    assert.strictEqual(result, "roboto");
  });

  it("removes double quotes from font name", () => {
    const result = FontManager.normalizeFontName('"Open Sans"');
    assert.strictEqual(result, "open sans");
  });

  it("trims whitespace and normalizes multiple spaces", () => {
    const result = FontManager.normalizeFontName("  Fira   Code  ");
    assert.strictEqual(result, "fira code");
  });

  it("removes weight/style suffixes like Regular, Normal, Book", () => {
    assert.strictEqual(FontManager.normalizeFontName("Roboto Regular"), "roboto");
    assert.strictEqual(FontManager.normalizeFontName("Arial Normal"), "arial");
    assert.strictEqual(FontManager.normalizeFontName("Georgia Book"), "georgia");
    assert.strictEqual(FontManager.normalizeFontName("Times Roman"), "times");
    assert.strictEqual(FontManager.normalizeFontName("Helvetica Medium"), "helvetica");
    assert.strictEqual(FontManager.normalizeFontName("Source Sans Text"), "source sans");
  });
});

// ============================================================================
// 3. FONT CACHING SYSTEM TESTS
// ============================================================================

describe("Font Caching System", () => {
  let testCacheKey;

  beforeEach(() => {
    // Generate unique cache key for each test
    testCacheKey = `test-font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  it("initFontCache creates cache directory and index", () => {
    const result = FontManager.initFontCache();

    assert.ok(result.cacheDir, "Should return cache directory path");
    assert.ok(result.indexPath, "Should return index file path");
    assert.ok(fs.existsSync(result.cacheDir), "Cache directory should exist");
    assert.ok(fs.existsSync(result.indexPath), "Index file should exist");
  });

  it("getCachedFont returns found:false for non-existent font", () => {
    const result = FontManager.getCachedFont("non-existent-font-key-12345");

    assert.strictEqual(result.found, false, "Should not find non-existent font");
  });

  it("cacheFontData stores font and returns success", () => {
    const testContent = Buffer.from("fake font data for testing");
    const result = FontManager.cacheFontData(testCacheKey, testContent, {
      format: "woff2",
      family: "TestFamily",
    });

    assert.strictEqual(result.success, true, "Should succeed in caching");
    assert.ok(result.path, "Should return path to cached file");
    assert.ok(fs.existsSync(result.path), "Cached file should exist");
  });

  it("getCachedFont retrieves previously cached font", () => {
    const testContent = Buffer.from("cached font content");
    const cacheResult = FontManager.cacheFontData(testCacheKey, testContent, {
      format: "woff2",
      family: "CachedFont",
    });

    assert.strictEqual(cacheResult.success, true);

    const getResult = FontManager.getCachedFont(testCacheKey);

    assert.strictEqual(getResult.found, true, "Should find cached font");
    assert.strictEqual(getResult.path, cacheResult.path, "Paths should match");
    assert.strictEqual(getResult.format, "woff2", "Format should match");
  });

  it("getFontCacheStats returns correct statistics", () => {
    // Cache a test font first
    const testContent = Buffer.from("stats test font data");
    FontManager.cacheFontData(`stats-test-${Date.now()}`, testContent, {
      format: "ttf",
      family: "StatsTest",
    });

    const stats = FontManager.getFontCacheStats();

    assert.ok(typeof stats.totalFonts === "number", "Should have totalFonts");
    assert.ok(typeof stats.totalSize === "number", "Should have totalSize");
    assert.ok(typeof stats.oldestAge === "number", "Should have oldestAge");
    assert.ok(typeof stats.newestAge === "number", "Should have newestAge");
    assert.ok(stats.totalFonts >= 1, "Should have at least 1 font cached");
  });

  it("cleanupFontCache removes expired entries", () => {
    // This test verifies the cleanup function runs without error
    // Actual expiration testing would require time manipulation
    const result = FontManager.cleanupFontCache();

    assert.ok(typeof result.removed === "number", "Should return removed count");
    assert.ok(typeof result.freedBytes === "number", "Should return freedBytes");
  });
});

// ============================================================================
// 4. FONT SUBSETTING TESTS
// ============================================================================

describe("Font Subsetting", () => {
  it("isFonttoolsAvailable returns boolean", () => {
    const result = FontManager.isFonttoolsAvailable();
    assert.strictEqual(typeof result, "boolean", "Should return boolean");
  });

  it("subsetFont fails gracefully for non-existent file", async () => {
    const result = await FontManager.subsetFont("/non/existent/font.ttf", "ABC");

    assert.strictEqual(result.success, false, "Should fail for missing file");
    assert.ok(result.error, "Should have error message");
    assert.ok(result.error.includes("not found"), "Error should mention file not found");
  });

  it("subsetFont fails when no characters specified", async () => {
    const { cacheDir } = FontManager.initFontCache();
    const dummyPath = path.join(cacheDir, "dummy.ttf");

    // Create a dummy file
    fs.writeFileSync(dummyPath, "dummy");

    const result = await FontManager.subsetFont(dummyPath, "");

    assert.strictEqual(result.success, false, "Should fail with empty chars");
    assert.ok(result.error.includes("No characters"), "Error should mention no characters");

    // Cleanup
    fs.unlinkSync(dummyPath);
  });

  it("subsetFontData fails when fonttools not available or invalid data", async () => {
    const fakeData = Buffer.from("not a real font");
    const result = await FontManager.subsetFontData(fakeData, "ABC");

    assert.strictEqual(result.success, false, "Should fail with invalid font data");
    assert.ok(result.error, "Should have error message");
  });
});

// ============================================================================
// 5. WOFF2 COMPRESSION TESTS
// ============================================================================

describe("WOFF2 Compression", () => {
  it("convertToWoff2 fails gracefully for non-existent file", async () => {
    const result = await FontManager.convertToWoff2("/non/existent/font.ttf");

    assert.strictEqual(result.success, false, "Should fail for missing file");
    assert.ok(result.error.includes("not found"), "Error should mention file not found");
  });

  it("convertDataToWoff2 fails with invalid font data", async () => {
    const fakeData = Buffer.from("invalid font content");
    const result = await FontManager.convertDataToWoff2(fakeData);

    assert.strictEqual(result.success, false, "Should fail with invalid data");
    assert.ok(result.error, "Should have error message");
  });
});

// ============================================================================
// 6. DUPLICATE FONT-FACE DETECTION TESTS
// ============================================================================

describe("Duplicate @font-face Detection", () => {
  it("detectDuplicateFontFaces finds duplicate font rules", () => {
    const doc = parseSVG(SVG_WITH_DUPLICATE_FONTS);
    const result = FontManager.detectDuplicateFontFaces(doc);

    assert.ok(result.duplicates.length > 0, "Should find duplicates");
    assert.strictEqual(result.total, 3, "Should count all 3 font-face rules");

    // Find the TestFont duplicate
    const testFontDup = result.duplicates.find((d) => d.family === "TestFont");
    assert.ok(testFontDup, "Should find TestFont duplicate");
    assert.strictEqual(testFontDup.count, 2, "TestFont should have 2 duplicates");
    assert.strictEqual(testFontDup.weight, "400", "Weight should be 400");
    assert.strictEqual(testFontDup.style, "normal", "Style should be normal");
  });

  it("detectDuplicateFontFaces returns empty for unique fonts", () => {
    const doc = parseSVG(SVG_WITH_UNIQUE_FONTS);
    const result = FontManager.detectDuplicateFontFaces(doc);

    assert.strictEqual(result.duplicates.length, 0, "Should find no duplicates");
    assert.strictEqual(result.total, 2, "Should count 2 font-face rules");
  });

  it("detectDuplicateFontFaces handles multiple duplicate sets", () => {
    const doc = parseSVG(SVG_WITH_MULTIPLE_DUPLICATES);
    const result = FontManager.detectDuplicateFontFaces(doc);

    assert.strictEqual(result.duplicates.length, 2, "Should find 2 duplicate sets");
    assert.strictEqual(result.total, 5, "Should count all 5 font-face rules");

    const font1Dup = result.duplicates.find((d) => d.family === "Font1");
    const font2Dup = result.duplicates.find((d) => d.family === "Font2");

    assert.ok(font1Dup, "Should find Font1 duplicate set");
    assert.ok(font2Dup, "Should find Font2 duplicate set");
    assert.strictEqual(font1Dup.count, 3, "Font1 should have 3 duplicates");
    assert.strictEqual(font2Dup.count, 2, "Font2 should have 2 duplicates");
  });

  it("mergeDuplicateFontFaces removes duplicate rules", () => {
    const doc = parseSVG(SVG_WITH_DUPLICATE_FONTS);
    const result = FontManager.mergeDuplicateFontFaces(doc);

    assert.strictEqual(result.modified, true, "Should modify document");
    assert.strictEqual(result.removed, 1, "Should remove 1 duplicate");
    assert.ok(result.keptIndices.length > 0, "Should track kept indices");
  });

  it("mergeDuplicateFontFaces does nothing for unique fonts", () => {
    const doc = parseSVG(SVG_WITH_UNIQUE_FONTS);
    const result = FontManager.mergeDuplicateFontFaces(doc);

    assert.strictEqual(result.modified, false, "Should not modify document");
    assert.strictEqual(result.removed, 0, "Should remove nothing");
  });
});

// ============================================================================
// 7. INTELLIGENT FONT SEARCH TESTS
// ============================================================================

describe("Intelligent Font Search", () => {
  it("searchSimilarFonts finds similar fonts from Google Fonts list", async () => {
    const results = await FontManager.searchSimilarFonts("Roboto", {
      includeGoogle: true,
      includeLocal: false,
      maxResults: 5,
    });

    assert.ok(results.length > 0, "Should find at least one result");

    // Should find exact match for Roboto
    const exactMatch = results.find((r) => r.name === "Roboto");
    assert.ok(exactMatch, "Should find exact Roboto match");
    assert.strictEqual(exactMatch.similarity, 1, "Exact match should have similarity 1");
    assert.strictEqual(exactMatch.source, "google", "Source should be google");
  });

  it("searchSimilarFonts respects minSimilarity threshold", async () => {
    const results = await FontManager.searchSimilarFonts("Inter", {
      includeGoogle: true,
      includeLocal: false,
      minSimilarity: 0.8,
    });

    // All results should have similarity >= 0.8
    for (const result of results) {
      assert.ok(result.similarity >= 0.8, `Similarity ${result.similarity} should be >= 0.8`);
    }
  });

  it("searchSimilarFonts respects maxResults limit", async () => {
    const results = await FontManager.searchSimilarFonts("Sans", {
      includeGoogle: true,
      includeLocal: false,
      maxResults: 3,
      minSimilarity: 0.1,
    });

    assert.ok(results.length <= 3, "Should return at most 3 results");
  });

  it("findFontAlternatives returns alternatives with recommendation", async () => {
    const result = await FontManager.findFontAlternatives("Roboto Mono", null, {
      includeGoogle: true,
      includeLocal: false,
    });

    assert.strictEqual(result.found, true, "Should find alternatives");
    assert.ok(result.alternatives.length > 0, "Should have alternatives array");
    assert.ok(result.recommendation, "Should have recommendation");
    assert.ok(result.message, "Should have message");
  });

  it("findFontAlternatives handles no matches gracefully", async () => {
    const result = await FontManager.findFontAlternatives("XYZNONEXISTENT12345", null, {
      includeGoogle: true,
      includeLocal: false,
      minSimilarity: 0.99, // Very high threshold to ensure no matches
    });

    assert.strictEqual(result.found, false, "Should not find alternatives");
    assert.deepStrictEqual(result.alternatives, [], "Alternatives should be empty");
  });
});

// ============================================================================
// 8. FONT DOWNLOAD TESTS (Limited - depends on network/tools)
// ============================================================================

describe("Font Download", () => {
  it("downloadFont fails gracefully for unavailable font", async () => {
    const result = await FontManager.downloadFont("NonExistentFont12345XYZ", {
      preferredSource: "local", // Try local first (will fail)
    });

    // Should fail since font doesn't exist locally
    // The function tries multiple sources, so we check the final result
    assert.ok(
      !result.success || result.source === "local",
      "Should fail or find local only"
    );
  });
});

// ============================================================================
// 9. EDGE CASES AND ERROR HANDLING
// ============================================================================

describe("Edge Cases and Error Handling", () => {
  it("stringSimilarity handles special characters", () => {
    const result = FontManager.stringSimilarity("Font-Name_123", "Font-Name_123");
    assert.strictEqual(result, 1, "Should handle special characters");
  });

  it("normalizeFontName handles empty string", () => {
    const result = FontManager.normalizeFontName("");
    assert.strictEqual(result, "", "Should return empty string");
  });

  it("detectDuplicateFontFaces handles SVG without style elements", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>';
    const doc = parseSVG(svg);
    const result = FontManager.detectDuplicateFontFaces(doc);

    assert.strictEqual(result.duplicates.length, 0, "Should find no duplicates");
    assert.strictEqual(result.total, 0, "Should have 0 total font-face rules");
  });

  it("cacheFontData handles base64 string input", () => {
    const base64Content = Buffer.from("test font data").toString("base64");
    const cacheKey = `base64-test-${Date.now()}`;

    const result = FontManager.cacheFontData(cacheKey, base64Content, {
      format: "woff2",
      family: "Base64Test",
    });

    assert.strictEqual(result.success, true, "Should handle base64 string");
    assert.ok(result.path, "Should return path");
  });

  it("getCachedFont handles subsetted fonts", () => {
    const cacheKey = `subset-test-${Date.now()}`;
    const chars = "ABCDabcd1234";

    // Cache a subsetted font
    FontManager.cacheFontData(cacheKey, Buffer.from("subset data"), {
      format: "woff2",
      family: "SubsetTest",
      subsetted: true,
      chars,
    });

    // Retrieve with same chars
    const result = FontManager.getCachedFont(cacheKey, {
      subsetted: true,
      chars,
    });

    assert.strictEqual(result.found, true, "Should find subsetted font with matching chars");
  });
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

// The test runner will automatically provide summary
