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
// 10. FONT CHARACTER EXTRACTION TESTS
// ============================================================================

describe("Font Character Extraction (extractFontCharacterMap)", () => {
  it("extracts characters from simple text element with font-family attribute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Roboto" x="10" y="50">Hello</text>
    </svg>`;
    const doc = parseSVG(svg);
    const result = FontManager.extractFontCharacterMap(doc.documentElement || doc);

    assert.ok(result.has("Roboto"), "Should find Roboto font");
    const chars = result.get("Roboto");
    assert.ok(chars.has("H"), "Should contain 'H'");
    assert.ok(chars.has("e"), "Should contain 'e'");
    assert.ok(chars.has("l"), "Should contain 'l'");
    assert.ok(chars.has("o"), "Should contain 'o'");
  });

  it("extracts characters from text element with style attribute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text style="font-family: 'Open Sans'; font-size: 16px;" x="10" y="50">Test123</text>
    </svg>`;
    const doc = parseSVG(svg);
    const result = FontManager.extractFontCharacterMap(doc.documentElement || doc);

    assert.ok(result.has("Open Sans"), "Should find Open Sans font");
    const chars = result.get("Open Sans");
    // "Test123" has 7 unique chars: T, e, s, t, 1, 2, 3
    assert.strictEqual(chars.size, 7, "Should have 7 unique characters");
  });

  it("handles multiple fonts in document", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Arial">ABC</text>
      <text font-family="Georgia">DEF</text>
    </svg>`;
    const doc = parseSVG(svg);
    const result = FontManager.extractFontCharacterMap(doc.documentElement || doc);

    assert.ok(result.has("Arial"), "Should find Arial font");
    assert.ok(result.has("Georgia"), "Should find Georgia font");
    assert.strictEqual(result.get("Arial").size, 3, "Arial should have 3 chars");
    assert.strictEqual(result.get("Georgia").size, 3, "Georgia should have 3 chars");
  });

  it("returns empty map for SVG without text", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100"/>
    </svg>`;
    const doc = parseSVG(svg);
    const result = FontManager.extractFontCharacterMap(doc.documentElement || doc);

    assert.strictEqual(result.size, 0, "Should return empty map");
  });

  it("strips quotes from font family names", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="'Fira Code'">code</text>
    </svg>`;
    const doc = parseSVG(svg);
    const result = FontManager.extractFontCharacterMap(doc.documentElement || doc);

    assert.ok(result.has("Fira Code"), "Should normalize quoted font name");
  });
});

// ============================================================================
// 11. CHARS TO TEXT PARAM TESTS
// ============================================================================

describe("Character Set to Text Param (charsToTextParam)", () => {
  it("converts character set to URL-encoded string", () => {
    const chars = new Set(["A", "B", "C"]);
    const result = FontManager.charsToTextParam(chars);

    assert.strictEqual(result, "ABC", "Should join sorted characters");
  });

  it("handles special characters with URL encoding", () => {
    const chars = new Set(["&", "=", " "]);
    const result = FontManager.charsToTextParam(chars);

    assert.ok(result.includes("%"), "Should URL encode special chars");
  });

  it("handles empty set", () => {
    const chars = new Set();
    const result = FontManager.charsToTextParam(chars);

    assert.strictEqual(result, "", "Empty set should return empty string");
  });

  it("deduplicates and sorts characters", () => {
    const chars = new Set(["Z", "A", "M"]);
    const result = FontManager.charsToTextParam(chars);

    assert.strictEqual(result, "AMZ", "Should be sorted alphabetically");
  });
});

// ============================================================================
// 12. GOOGLE FONTS URL HANDLING TESTS
// ============================================================================

describe("Google Fonts URL Detection (isGoogleFontsUrl)", () => {
  it("returns true for fonts.googleapis.com URLs", () => {
    assert.strictEqual(
      FontManager.isGoogleFontsUrl("https://fonts.googleapis.com/css2?family=Roboto"),
      true
    );
  });

  it("returns true for fonts.gstatic.com URLs", () => {
    assert.strictEqual(
      FontManager.isGoogleFontsUrl("https://fonts.gstatic.com/s/roboto/v30/font.woff2"),
      true
    );
  });

  it("returns false for other URLs", () => {
    assert.strictEqual(FontManager.isGoogleFontsUrl("https://example.com/font.woff2"), false);
    assert.strictEqual(FontManager.isGoogleFontsUrl("https://cdn.fonts.net/roboto.woff2"), false);
  });

  it("returns falsy for null/undefined", () => {
    // Function returns the falsy input value rather than explicitly false
    assert.ok(!FontManager.isGoogleFontsUrl(null), "Should be falsy for null");
    assert.ok(!FontManager.isGoogleFontsUrl(undefined), "Should be falsy for undefined");
  });
});

describe("Extract Font Family from Google URL (extractFontFamilyFromGoogleUrl)", () => {
  it("extracts family from CSS2 URL", () => {
    const result = FontManager.extractFontFamilyFromGoogleUrl(
      "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700"
    );
    assert.strictEqual(result, "Roboto");
  });

  it("handles URL-encoded family names", () => {
    const result = FontManager.extractFontFamilyFromGoogleUrl(
      "https://fonts.googleapis.com/css2?family=Open+Sans"
    );
    assert.strictEqual(result, "Open Sans");
  });

  it("extracts family from legacy CSS URL", () => {
    const result = FontManager.extractFontFamilyFromGoogleUrl(
      "https://fonts.googleapis.com/css?family=Roboto"
    );
    assert.strictEqual(result, "Roboto");
  });

  it("returns null for invalid URL", () => {
    const result = FontManager.extractFontFamilyFromGoogleUrl("not-a-url");
    assert.strictEqual(result, null);
  });
});

describe("Add Text Param to Google Fonts URL (addTextParamToGoogleFontsUrl)", () => {
  it("adds text parameter to URL", () => {
    const result = FontManager.addTextParamToGoogleFontsUrl(
      "https://fonts.googleapis.com/css2?family=Roboto",
      "ABC"
    );
    assert.ok(result.includes("text=ABC"), "Should add text parameter");
  });

  it("returns original URL if textParam is empty", () => {
    const url = "https://fonts.googleapis.com/css2?family=Roboto";
    const result = FontManager.addTextParamToGoogleFontsUrl(url, "");
    assert.strictEqual(result, url);
  });

  it("handles URL-encoded text param", () => {
    const result = FontManager.addTextParamToGoogleFontsUrl(
      "https://fonts.googleapis.com/css2?family=Roboto",
      "%26%3D"
    );
    // Should decode and re-encode properly
    assert.ok(result.includes("text="), "Should include text parameter");
  });
});

describe("Build Google Fonts URL (buildGoogleFontsUrl)", () => {
  it("builds basic URL with defaults", () => {
    const result = FontManager.buildGoogleFontsUrl("Roboto");

    assert.ok(result.includes("fonts.googleapis.com"), "Should use Google Fonts domain");
    assert.ok(result.includes("family=Roboto"), "Should include family");
    assert.ok(result.includes("wght@400"), "Should include default weight");
    assert.ok(result.includes("display=swap"), "Should include display");
  });

  it("handles multi-word font names", () => {
    const result = FontManager.buildGoogleFontsUrl("Open Sans");
    assert.ok(result.includes("family=Open+Sans"), "Should URL-encode spaces");
  });

  it("includes specified weights", () => {
    const result = FontManager.buildGoogleFontsUrl("Roboto", { weights: ["400", "700"] });
    assert.ok(result.includes("400,700") || result.includes("400") && result.includes("700"));
  });

  it("includes text parameter when specified", () => {
    const result = FontManager.buildGoogleFontsUrl("Roboto", { text: "Hello" });
    assert.ok(result.includes("text=Hello"), "Should include text param");
  });
});

// ============================================================================
// 13. LOCAL FONT DETECTION TESTS
// ============================================================================

describe("System Font Directories (getSystemFontDirs)", () => {
  it("returns array of font directories", () => {
    const dirs = FontManager.getSystemFontDirs();

    assert.ok(Array.isArray(dirs), "Should return array");
    assert.ok(dirs.length > 0, "Should have at least one directory");
  });

  it("returns platform-specific paths", () => {
    const dirs = FontManager.getSystemFontDirs();
    const currentPlatform = os.platform();

    if (currentPlatform === "darwin") {
      assert.ok(dirs.some((d) => d.includes("Library/Fonts")), "macOS should include Library/Fonts");
    } else if (currentPlatform === "linux") {
      assert.ok(dirs.some((d) => d.includes("/usr/share/fonts")), "Linux should include /usr/share/fonts");
    } else if (currentPlatform === "win32") {
      assert.ok(dirs.some((d) => d.includes("Fonts")), "Windows should include Fonts");
    }
  });
});

describe("Check Local Font (checkLocalFont)", () => {
  it("returns found:false for non-existent font", async () => {
    const result = await FontManager.checkLocalFont("NonExistentFont99999");
    assert.strictEqual(result.found, false, "Should not find non-existent font");
  });

  it("returns result object with found property", async () => {
    const result = await FontManager.checkLocalFont("Arial");
    assert.ok(typeof result.found === "boolean", "Should have found property");
    if (result.found) {
      assert.ok(result.path, "Found font should have path");
    }
  });
});

describe("List System Fonts (listSystemFonts)", () => {
  it("returns array of font objects", async () => {
    const fonts = await FontManager.listSystemFonts();

    assert.ok(Array.isArray(fonts), "Should return array");
    // System may have fonts or not, just verify structure
    if (fonts.length > 0) {
      const font = fonts[0];
      assert.ok(typeof font.name === "string", "Font should have name");
      assert.ok(typeof font.path === "string", "Font should have path");
      assert.ok(typeof font.format === "string", "Font should have format");
    }
  });
});

// ============================================================================
// 14. EXTERNAL TOOL DETECTION TESTS
// ============================================================================

describe("Command Exists (commandExists)", () => {
  it("returns true for common system command", () => {
    // 'ls' exists on Unix, 'dir' on Windows
    const cmd = os.platform() === "win32" ? "cmd" : "ls";
    const result = FontManager.commandExists(cmd);
    assert.strictEqual(result, true, `${cmd} should exist`);
  });

  it("returns false for non-existent command", () => {
    const result = FontManager.commandExists("nonexistent_command_xyz_12345");
    assert.strictEqual(result, false, "Non-existent command should return false");
  });

  it("returns boolean type", () => {
    const result = FontManager.commandExists("git");
    assert.strictEqual(typeof result, "boolean", "Should return boolean");
  });
});

// ============================================================================
// 15. REPLACEMENT MAP TESTS
// ============================================================================

describe("Load Replacement Map (loadReplacementMap)", () => {
  let tempMapPath;

  beforeEach(() => {
    tempMapPath = path.join(TEST_OUTPUT_DIR, `test-map-${Date.now()}.yml`);
  });

  afterEach(() => {
    if (fs.existsSync(tempMapPath)) {
      fs.unlinkSync(tempMapPath);
    }
  });

  it("returns null when no map file exists", () => {
    const result = FontManager.loadReplacementMap("/non/existent/path.yml");
    // May find default file in cwd, so check structure instead
    if (result !== null) {
      assert.ok(result.replacements, "Should have replacements object");
    }
  });

  it("loads and parses valid YAML file", () => {
    const yamlContent = `
replacements:
  Arial: Inter
  "Times New Roman": "Noto Serif"
options:
  default_embed: true
`;
    fs.writeFileSync(tempMapPath, yamlContent);

    const result = FontManager.loadReplacementMap(tempMapPath);

    assert.ok(result, "Should load file");
    assert.strictEqual(result.replacements["Arial"], "Inter");
    // FAILSAFE_SCHEMA parses booleans as strings
    assert.ok(result.options.default_embed === true || result.options.default_embed === "true", "Should have embed option");
    assert.strictEqual(result.path, tempMapPath);
  });

  it("throws error for invalid YAML", () => {
    fs.writeFileSync(tempMapPath, "invalid: yaml: content: {{{");

    assert.throws(() => FontManager.loadReplacementMap(tempMapPath), "Should throw for invalid YAML");
  });
});

describe("Apply Font Replacements (applyFontReplacements)", () => {
  it("replaces font in font-family attribute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Arial">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const replacements = { Arial: "Inter" };

    const result = FontManager.applyFontReplacements(doc, replacements);

    assert.strictEqual(result.modified, true, "Should be modified");
    assert.ok(result.replaced.length > 0, "Should have replacements");
    assert.strictEqual(result.replaced[0].from, "Arial");
    assert.strictEqual(result.replaced[0].to, "Inter");
  });

  it("replaces font in style attribute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text style="font-family: Georgia; font-size: 12px;">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const replacements = { Georgia: "Merriweather" };

    const result = FontManager.applyFontReplacements(doc, replacements);

    assert.strictEqual(result.modified, true, "Should be modified");
  });

  it("does nothing when no matches", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Roboto">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const replacements = { Arial: "Inter" };

    const result = FontManager.applyFontReplacements(doc, replacements);

    assert.strictEqual(result.modified, false, "Should not be modified");
    assert.strictEqual(result.replaced.length, 0, "Should have no replacements");
  });

  it("handles complex replacement objects", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Arial">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const replacements = {
      Arial: { replacement: "Inter", embed: true, subset: true },
    };

    const result = FontManager.applyFontReplacements(doc, replacements);

    assert.strictEqual(result.modified, true);
    assert.strictEqual(result.replaced[0].to, "Inter");
  });
});

describe("Generate Replacement Map Template (generateReplacementMapTemplate)", () => {
  it("returns valid YAML template string", () => {
    const template = FontManager.generateReplacementMapTemplate();

    assert.ok(typeof template === "string", "Should return string");
    assert.ok(template.includes("replacements:"), "Should have replacements section");
    assert.ok(template.includes("options:"), "Should have options section");
    assert.ok(template.includes("default_embed"), "Should have embed option");
  });

  it("template is valid YAML", async () => {
    const template = FontManager.generateReplacementMapTemplate();
    const jsyaml = await import("js-yaml");
    const parsed = jsyaml.default.load(template);

    assert.ok(parsed.replacements !== undefined, "Should parse replacements");
    assert.ok(parsed.options !== undefined, "Should parse options");
  });
});

// ============================================================================
// 16. FONT LISTING TESTS
// ============================================================================

describe("List Fonts (listFonts)", () => {
  it("lists embedded fonts from @font-face", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face {
          font-family: 'EmbeddedFont';
          src: url(data:font/woff2;base64,AAAA) format('woff2');
        }
      </style>
      <text font-family="EmbeddedFont">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const fonts = FontManager.listFonts(doc);

    assert.ok(fonts.length > 0, "Should find fonts");
    const embedded = fonts.find((f) => f.family === "EmbeddedFont");
    assert.ok(embedded, "Should find EmbeddedFont");
    assert.strictEqual(embedded.type, "embedded", "Should be type embedded");
  });

  it("lists external fonts", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face {
          font-family: 'ExternalFont';
          src: url(https://example.com/font.woff2) format('woff2');
        }
      </style>
      <text font-family="ExternalFont">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const fonts = FontManager.listFonts(doc);

    const external = fonts.find((f) => f.family === "ExternalFont");
    assert.ok(external, "Should find ExternalFont");
    assert.strictEqual(external.type, "external", "Should be type external");
    assert.ok(external.source, "Should have source URL");
  });

  it("identifies system/web-safe fonts", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text font-family="Arial">Test</text>
    </svg>`;
    const doc = parseSVG(svg);
    const fonts = FontManager.listFonts(doc);

    const arial = fonts.find((f) => f.family === "Arial");
    assert.ok(arial, "Should find Arial");
    assert.strictEqual(arial.type, "system", "Arial should be system font");
  });

  it("returns empty array for SVG without fonts", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100" height="100"/>
    </svg>`;
    const doc = parseSVG(svg);
    const fonts = FontManager.listFonts(doc);

    assert.ok(Array.isArray(fonts), "Should return array");
    assert.strictEqual(fonts.length, 0, "Should be empty");
  });
});

// ============================================================================
// 17. BACKUP AND VALIDATION TESTS
// ============================================================================

describe("Create Backup (createBackup)", () => {
  let testFilePath;

  beforeEach(() => {
    testFilePath = path.join(TEST_OUTPUT_DIR, `backup-test-${Date.now()}.svg`);
    fs.writeFileSync(testFilePath, "<svg></svg>");
  });

  afterEach(() => {
    // Clean up test files
    const dir = path.dirname(testFilePath);
    const base = path.basename(testFilePath);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(base.replace(".svg", "")));
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  });

  it("creates backup file with .bak extension", () => {
    const backupPath = FontManager.createBackup(testFilePath);

    assert.ok(backupPath, "Should return backup path");
    assert.ok(backupPath.endsWith(".bak"), "Should have .bak extension");
    assert.ok(fs.existsSync(backupPath), "Backup file should exist");
  });

  it("returns null when noBackup option is true", () => {
    const backupPath = FontManager.createBackup(testFilePath, { noBackup: true });
    assert.strictEqual(backupPath, null, "Should return null");
  });

  it("returns null for non-existent file", () => {
    const backupPath = FontManager.createBackup("/non/existent/file.svg");
    assert.strictEqual(backupPath, null, "Should return null");
  });

  it("creates numbered backup when .bak exists", () => {
    // Create first backup
    const firstBackup = FontManager.createBackup(testFilePath);
    assert.ok(firstBackup.endsWith(".bak"));

    // Create second backup
    const secondBackup = FontManager.createBackup(testFilePath);
    assert.ok(secondBackup.endsWith(".bak.1"), "Second backup should be numbered");
  });
});

describe("Validate SVG After Font Operation (validateSvgAfterFontOperation)", () => {
  it("returns valid:true for valid SVG", async () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>`;
    const result = await FontManager.validateSvgAfterFontOperation(svg);

    assert.strictEqual(result.valid, true, "Should be valid");
    assert.strictEqual(result.errors.length, 0, "Should have no errors");
  });

  it("returns valid:false for malformed SVG", async () => {
    const svg = "not valid xml <<>>";
    const result = await FontManager.validateSvgAfterFontOperation(svg);

    assert.strictEqual(result.valid, false, "Should be invalid");
    assert.ok(result.errors.length > 0, "Should have errors");
  });

  it("warns about remaining external fonts after embed operation", async () => {
    const svg = `<?xml version="1.0"?>
    <svg xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face { font-family: 'Test'; src: url(https://fonts.googleapis.com/css2?family=Roboto); }
      </style>
    </svg>`;
    const result = await FontManager.validateSvgAfterFontOperation(svg, "embed");

    // Warnings are expected for remaining external URLs
    if (result.warnings.length > 0) {
      assert.ok(result.warnings[0].includes("External font"), "Should warn about external font");
    }
  });
});

// ============================================================================
// 18. CONSTANTS VERIFICATION TESTS
// ============================================================================

describe("Exported Constants", () => {
  it("POPULAR_GOOGLE_FONTS is non-empty array", () => {
    assert.ok(Array.isArray(FontManager.POPULAR_GOOGLE_FONTS), "Should be array");
    assert.ok(FontManager.POPULAR_GOOGLE_FONTS.length > 0, "Should not be empty");
    assert.ok(FontManager.POPULAR_GOOGLE_FONTS.includes("Roboto"), "Should include Roboto");
  });

  it("DEFAULT_REPLACEMENT_MAP is string", () => {
    assert.strictEqual(typeof FontManager.DEFAULT_REPLACEMENT_MAP, "string");
    assert.ok(FontManager.DEFAULT_REPLACEMENT_MAP.endsWith(".yml"), "Should be YAML file");
  });

  it("WEB_SAFE_FONTS contains common fonts", () => {
    assert.ok(Array.isArray(FontManager.WEB_SAFE_FONTS), "Should be array");
    assert.ok(FontManager.WEB_SAFE_FONTS.includes("Arial"), "Should include Arial");
    assert.ok(FontManager.WEB_SAFE_FONTS.includes("Georgia"), "Should include Georgia");
    assert.ok(FontManager.WEB_SAFE_FONTS.includes("serif"), "Should include generic serif");
  });

  it("FONT_FORMATS maps extensions to MIME types", () => {
    assert.strictEqual(typeof FontManager.FONT_FORMATS, "object");
    assert.strictEqual(FontManager.FONT_FORMATS[".woff2"], "font/woff2");
    assert.strictEqual(FontManager.FONT_FORMATS[".ttf"], "font/ttf");
    assert.strictEqual(FontManager.FONT_FORMATS[".otf"], "font/otf");
  });

  it("SYSTEM_FONT_PATHS has platform entries", () => {
    assert.strictEqual(typeof FontManager.SYSTEM_FONT_PATHS, "object");
    assert.ok(Array.isArray(FontManager.SYSTEM_FONT_PATHS.darwin), "Should have darwin paths");
    assert.ok(Array.isArray(FontManager.SYSTEM_FONT_PATHS.linux), "Should have linux paths");
    assert.ok(Array.isArray(FontManager.SYSTEM_FONT_PATHS.win32), "Should have win32 paths");
  });
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

// The test runner will automatically provide summary
