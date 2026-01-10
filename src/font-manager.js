/**
 * @fileoverview Font Management Module for SVG-Matrix
 *
 * Core font management functionality extracted from svg-toolbox.js.
 * Provides utilities for:
 * - Font embedding (convert external fonts to base64 data URIs)
 * - Font extraction (extract embedded fonts to files)
 * - Font listing and analysis
 * - Google Fonts character subsetting
 * - Local system font detection
 * - YAML replacement map processing
 *
 * @module font-manager
 * @license MIT
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { homedir, platform } from "os";
import { execFileSync } from "child_process";
import yaml from "js-yaml";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default replacement map filename
 * @constant {string}
 */
export const DEFAULT_REPLACEMENT_MAP = "svgm_replacement_map.yml";

/**
 * Environment variable for custom replacement map path
 * @constant {string}
 */
export const ENV_REPLACEMENT_MAP = "SVGM_REPLACEMENT_MAP";

/**
 * Common web-safe fonts that browsers have built-in
 * @constant {string[]}
 */
export const WEB_SAFE_FONTS = [
  "Arial",
  "Arial Black",
  "Comic Sans MS",
  "Courier New",
  "Georgia",
  "Impact",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Palatino Linotype",
  "Tahoma",
  "Geneva",
  "Helvetica",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
];

/**
 * Font formats and their MIME types
 * @constant {Object}
 */
export const FONT_FORMATS = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".svg": "image/svg+xml",
};

/**
 * System font directories by platform
 * @constant {Object}
 */
export const SYSTEM_FONT_PATHS = {
  darwin: [
    "/Library/Fonts",
    "/System/Library/Fonts",
    join(homedir(), "Library/Fonts"),
  ],
  linux: [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    join(homedir(), ".fonts"),
    join(homedir(), ".local/share/fonts"),
  ],
  win32: [
    join(process.env.WINDIR || "C:\\Windows", "Fonts"),
    join(homedir(), "AppData/Local/Microsoft/Windows/Fonts"),
  ],
};

/**
 * Font cache directory path
 * @constant {string}
 */
export const FONT_CACHE_DIR = join(homedir(), ".cache", "svgm-fonts");

/**
 * Font cache index filename
 * @constant {string}
 */
export const FONT_CACHE_INDEX = "cache-index.json";

/**
 * Maximum cache age in milliseconds (30 days)
 * @constant {number}
 */
export const FONT_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// FONT CACHING SYSTEM
// ============================================================================

/**
 * Initialize font cache directory and index
 * @returns {{cacheDir: string, indexPath: string}}
 */
export function initFontCache() {
  mkdirSync(FONT_CACHE_DIR, { recursive: true });
  const indexPath = join(FONT_CACHE_DIR, FONT_CACHE_INDEX);
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, JSON.stringify({ fonts: {}, lastCleanup: Date.now() }, null, 2));
  }
  return { cacheDir: FONT_CACHE_DIR, indexPath };
}

/**
 * Get cached font if available and not expired
 * @param {string} fontKey - Unique key for the font (URL or family+style+weight hash)
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.subsetted=false] - Whether to look for subsetted version
 * @param {string} [options.chars] - Characters for subset matching
 * @returns {{found: boolean, path?: string, format?: string, age?: number}}
 */
export function getCachedFont(fontKey, options = {}) {
  const { subsetted = false, chars = "" } = options;
  const { indexPath } = initFontCache();

  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const cacheKey = subsetted ? `${fontKey}:subset:${hashString(chars)}` : fontKey;
    const entry = index.fonts[cacheKey];

    if (!entry) return { found: false };

    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > FONT_CACHE_MAX_AGE) {
      return { found: false, expired: true };
    }

    // Check if file still exists
    if (!existsSync(entry.path)) {
      return { found: false, missing: true };
    }

    return {
      found: true,
      path: entry.path,
      format: entry.format,
      age,
      size: entry.size,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Store font in cache
 * @param {string} fontKey - Unique key for the font
 * @param {Buffer|string} content - Font content
 * @param {Object} options - Options
 * @param {string} options.format - Font format (woff2, woff, ttf, otf)
 * @param {string} [options.family] - Font family name
 * @param {boolean} [options.subsetted=false] - Whether this is a subsetted version
 * @param {string} [options.chars] - Characters included in subset
 * @returns {{success: boolean, path?: string, error?: string}}
 */
export function cacheFontData(fontKey, content, options) {
  const { format, family = "unknown", subsetted = false, chars = "" } = options;
  const { cacheDir, indexPath } = initFontCache();

  try {
    // Generate unique filename
    const hash = hashString(fontKey + (subsetted ? chars : ""));
    const ext = format.startsWith(".") ? format : `.${format}`;
    const filename = `${sanitizeFilename(family)}_${hash.slice(0, 8)}${subsetted ? "_subset" : ""}${ext}`;
    const fontPath = join(cacheDir, filename);

    // Write font file
    const buffer = typeof content === "string" ? Buffer.from(content, "base64") : content;
    writeFileSync(fontPath, buffer);

    // Update index
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const cacheKey = subsetted ? `${fontKey}:subset:${hashString(chars)}` : fontKey;
    index.fonts[cacheKey] = {
      path: fontPath,
      format: ext.slice(1),
      family,
      timestamp: Date.now(),
      size: buffer.length,
      subsetted,
      charsHash: subsetted ? hashString(chars) : null,
    };
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    return { success: true, path: fontPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clean up expired cache entries
 * @returns {{removed: number, freedBytes: number}}
 */
export function cleanupFontCache() {
  const { indexPath } = initFontCache();
  let removed = 0;
  let freedBytes = 0;

  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const now = Date.now();
    const keysToRemove = [];

    for (const [key, entry] of Object.entries(index.fonts)) {
      const age = now - entry.timestamp;
      if (age > FONT_CACHE_MAX_AGE) {
        keysToRemove.push(key);
        if (existsSync(entry.path)) {
          freedBytes += entry.size || 0;
          try {
            unlinkSync(entry.path);
          } catch {
            // File may already be deleted
          }
        }
        removed++;
      }
    }

    // Remove from index
    for (const key of keysToRemove) {
      delete index.fonts[key];
    }

    index.lastCleanup = now;
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    return { removed, freedBytes };
  } catch {
    return { removed: 0, freedBytes: 0 };
  }
}

/**
 * Get cache statistics
 * @returns {{totalFonts: number, totalSize: number, oldestAge: number, newestAge: number}}
 */
export function getFontCacheStats() {
  const { indexPath } = initFontCache();

  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const fonts = Object.values(index.fonts);
    const now = Date.now();

    if (fonts.length === 0) {
      return { totalFonts: 0, totalSize: 0, oldestAge: 0, newestAge: 0 };
    }

    const ages = fonts.map((f) => now - f.timestamp);
    return {
      totalFonts: fonts.length,
      totalSize: fonts.reduce((sum, f) => sum + (f.size || 0), 0),
      oldestAge: Math.max(...ages),
      newestAge: Math.min(...ages),
    };
  } catch {
    return { totalFonts: 0, totalSize: 0, oldestAge: 0, newestAge: 0 };
  }
}

/**
 * Simple string hash for cache keys
 * @param {string} str - String to hash
 * @returns {string} Hex hash
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Sanitize filename for cache storage
 * @param {string} name - Original name
 * @returns {string} Safe filename
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
}

// ============================================================================
// FONT SUBSETTING (using fonttools/pyftsubset)
// ============================================================================

/**
 * Check if fonttools (pyftsubset) is available
 * @returns {boolean}
 */
export function isFonttoolsAvailable() {
  return commandExists("pyftsubset");
}

/**
 * Subset a font file to include only specified characters
 * Uses fonttools/pyftsubset when available
 *
 * @param {string} fontPath - Path to input font file (TTF/OTF/WOFF/WOFF2)
 * @param {string} chars - Characters to include in subset
 * @param {Object} [options={}] - Options
 * @param {string} [options.outputPath] - Output path (default: auto-generated)
 * @param {string} [options.outputFormat] - Output format (woff2, woff, ttf)
 * @param {boolean} [options.layoutFeatures=true] - Include OpenType layout features
 * @returns {Promise<{success: boolean, path?: string, size?: number, originalSize?: number, error?: string}>}
 */
export async function subsetFont(fontPath, chars, options = {}) {
  const { outputFormat = "woff2", layoutFeatures = true } = options;

  if (!existsSync(fontPath)) {
    return { success: false, error: `Font file not found: ${fontPath}` };
  }

  if (!isFonttoolsAvailable()) {
    return { success: false, error: "fonttools not installed. Install with: pip install fonttools brotli" };
  }

  if (!chars || chars.length === 0) {
    return { success: false, error: "No characters specified for subsetting" };
  }

  // Get original size
  const originalSize = statSync(fontPath).size;

  // Generate output path
  const inputExt = extname(fontPath);
  const inputBase = basename(fontPath, inputExt);
  const outputExt = outputFormat.startsWith(".") ? outputFormat : `.${outputFormat}`;
  const outputPath = options.outputPath || join(dirname(fontPath), `${inputBase}_subset${outputExt}`);

  try {
    // Build pyftsubset command
    const args = [
      fontPath,
      `--text=${chars}`,
      `--output-file=${outputPath}`,
      `--flavor=${outputFormat.replace(".", "")}`,
    ];

    // Add layout features if requested
    if (layoutFeatures) {
      args.push("--layout-features=*");
    }

    // Add options for better compression
    if (outputFormat === "woff2" || outputFormat === ".woff2") {
      args.push("--with-zopfli");
    }

    // Execute pyftsubset
    execFileSync("pyftsubset", args, {
      stdio: "pipe",
      timeout: 60000,
    });

    if (!existsSync(outputPath)) {
      return { success: false, error: "Subsetting completed but output file not created" };
    }

    const newSize = statSync(outputPath).size;
    const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

    return {
      success: true,
      path: outputPath,
      size: newSize,
      originalSize,
      savings: `${savings}%`,
      chars: chars.length,
    };
  } catch (err) {
    return { success: false, error: `Subsetting failed: ${err.message}` };
  }
}

/**
 * Subset font from buffer/base64 data
 * Writes to temp file, subsets, and returns result
 *
 * @param {Buffer|string} fontData - Font data (Buffer or base64 string)
 * @param {string} chars - Characters to include
 * @param {Object} [options={}] - Options
 * @param {string} [options.inputFormat] - Input format hint (ttf, otf, woff, woff2)
 * @param {string} [options.outputFormat='woff2'] - Output format
 * @returns {Promise<{success: boolean, data?: Buffer, size?: number, originalSize?: number, error?: string}>}
 */
export async function subsetFontData(fontData, chars, options = {}) {
  const { inputFormat = "ttf", outputFormat = "woff2" } = options;
  const tmpDir = join(FONT_CACHE_DIR, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const tmpId = `subset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputExt = inputFormat.startsWith(".") ? inputFormat : `.${inputFormat}`;
  const tmpInput = join(tmpDir, `${tmpId}_input${inputExt}`);
  const outputExt = outputFormat.startsWith(".") ? outputFormat : `.${outputFormat}`;
  const tmpOutput = join(tmpDir, `${tmpId}_output${outputExt}`);

  try {
    // Write input file
    const buffer = typeof fontData === "string" ? Buffer.from(fontData, "base64") : fontData;
    writeFileSync(tmpInput, buffer);

    // Subset
    const result = await subsetFont(tmpInput, chars, {
      outputPath: tmpOutput,
      outputFormat,
    });

    if (!result.success) {
      return result;
    }

    // Read output
    const outputData = readFileSync(tmpOutput);

    // Cleanup temp files
    try {
      unlinkSync(tmpInput);
      unlinkSync(tmpOutput);
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: true,
      data: outputData,
      size: outputData.length,
      originalSize: buffer.length,
      savings: result.savings,
    };
  } catch (err) {
    // Cleanup on error
    try {
      if (existsSync(tmpInput)) unlinkSync(tmpInput);
      if (existsSync(tmpOutput)) unlinkSync(tmpOutput);
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: err.message };
  }
}

// ============================================================================
// WOFF2 COMPRESSION
// ============================================================================

/**
 * Convert font to WOFF2 format using fonttools
 *
 * @param {string} fontPath - Path to input font (TTF/OTF/WOFF)
 * @param {Object} [options={}] - Options
 * @param {string} [options.outputPath] - Output path (default: same dir with .woff2 ext)
 * @returns {Promise<{success: boolean, path?: string, size?: number, originalSize?: number, error?: string}>}
 */
export async function convertToWoff2(fontPath, options = {}) {
  if (!existsSync(fontPath)) {
    return { success: false, error: `Font file not found: ${fontPath}` };
  }

  if (!isFonttoolsAvailable()) {
    return { success: false, error: "fonttools not installed. Install with: pip install fonttools brotli" };
  }

  const originalSize = statSync(fontPath).size;
  const inputExt = extname(fontPath);
  const inputBase = basename(fontPath, inputExt);
  const outputPath = options.outputPath || join(dirname(fontPath), `${inputBase}.woff2`);

  // Skip if already WOFF2
  if (inputExt.toLowerCase() === ".woff2") {
    copyFileSync(fontPath, outputPath);
    return { success: true, path: outputPath, size: originalSize, originalSize, alreadyWoff2: true };
  }

  try {
    // Use fonttools woff2 compress - output is positional argument, not -o flag
    execFileSync("fonttools", ["ttLib.woff2", "compress", fontPath, outputPath], {
      stdio: "pipe",
      timeout: 60000,
    });

    if (!existsSync(outputPath)) {
      return { success: false, error: "Conversion completed but output file not created" };
    }

    const newSize = statSync(outputPath).size;
    const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

    return {
      success: true,
      path: outputPath,
      size: newSize,
      originalSize,
      savings: `${savings}%`,
    };
  } catch (err) {
    return { success: false, error: `WOFF2 conversion failed: ${err.message}` };
  }
}

/**
 * Convert font buffer to WOFF2
 *
 * @param {Buffer|string} fontData - Font data (Buffer or base64)
 * @param {Object} [options={}] - Options
 * @param {string} [options.inputFormat='ttf'] - Input format hint
 * @returns {Promise<{success: boolean, data?: Buffer, size?: number, originalSize?: number, error?: string}>}
 */
export async function convertDataToWoff2(fontData, options = {}) {
  const { inputFormat = "ttf" } = options;
  const tmpDir = join(FONT_CACHE_DIR, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const tmpId = `woff2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputExt = inputFormat.startsWith(".") ? inputFormat : `.${inputFormat}`;
  const tmpInput = join(tmpDir, `${tmpId}_input${inputExt}`);
  const tmpOutput = join(tmpDir, `${tmpId}_output.woff2`);

  try {
    // Write input
    const buffer = typeof fontData === "string" ? Buffer.from(fontData, "base64") : fontData;
    writeFileSync(tmpInput, buffer);

    // Convert
    const result = await convertToWoff2(tmpInput, { outputPath: tmpOutput });

    if (!result.success) {
      return result;
    }

    // Read output
    const outputData = readFileSync(tmpOutput);

    // Cleanup
    try {
      unlinkSync(tmpInput);
      unlinkSync(tmpOutput);
    } catch {
      // Ignore
    }

    return {
      success: true,
      data: outputData,
      size: outputData.length,
      originalSize: buffer.length,
      savings: result.savings,
    };
  } catch (err) {
    try {
      if (existsSync(tmpInput)) unlinkSync(tmpInput);
      if (existsSync(tmpOutput)) unlinkSync(tmpOutput);
    } catch {
      // Ignore
    }
    return { success: false, error: err.message };
  }
}

// ============================================================================
// DUPLICATE @FONT-FACE DETECTION
// ============================================================================

/**
 * Detect duplicate @font-face rules in SVG document
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {{duplicates: Array<{family: string, weight: string, style: string, count: number, indices: number[]}>, total: number}}
 */
export function detectDuplicateFontFaces(doc) {
  const styleElements = doc.querySelectorAll?.("style") || [];
  const fontFaces = [];
  let index = 0;

  // Extract all @font-face rules
  for (const styleEl of styleElements) {
    const css = styleEl.textContent || "";
    const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
    let match;

    while ((match = fontFaceRegex.exec(css)) !== null) {
      const block = match[1];

      // Extract properties
      const familyMatch = block.match(/font-family:\s*(['"]?)([^;'"]+)\1/i);
      const weightMatch = block.match(/font-weight:\s*([^;]+)/i);
      const styleMatch = block.match(/font-style:\s*([^;]+)/i);
      const srcMatch = block.match(/src:\s*([^;]+)/i);

      const family = familyMatch ? familyMatch[2].trim() : "";
      const weight = weightMatch ? weightMatch[1].trim() : "400";
      const style = styleMatch ? styleMatch[1].trim() : "normal";
      const src = srcMatch ? srcMatch[1].trim() : "";

      fontFaces.push({
        family,
        weight,
        style,
        src,
        index: index++,
        fullMatch: match[0],
        styleElement: styleEl,
      });
    }
  }

  // Group by family+weight+style
  const groups = new Map();
  for (const ff of fontFaces) {
    const key = `${ff.family}|${ff.weight}|${ff.style}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(ff);
  }

  // Find duplicates
  const duplicates = [];
  for (const [key, entries] of groups) {
    if (entries.length > 1) {
      const [family, weight, style] = key.split("|");
      duplicates.push({
        family,
        weight,
        style,
        count: entries.length,
        indices: entries.map((e) => e.index),
        entries,
      });
    }
  }

  return { duplicates, total: fontFaces.length };
}

/**
 * Merge duplicate @font-face rules, keeping the first occurrence
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {{modified: boolean, removed: number, keptIndices: number[]}}
 */
export function mergeDuplicateFontFaces(doc) {
  const { duplicates } = detectDuplicateFontFaces(doc);

  if (duplicates.length === 0) {
    return { modified: false, removed: 0, keptIndices: [] };
  }

  let removed = 0;
  const keptIndices = [];

  for (const dup of duplicates) {
    // Keep the first entry, remove the rest
    const [keep, ...toRemove] = dup.entries;
    keptIndices.push(keep.index);

    for (const entry of toRemove) {
      // Remove from style element
      const styleEl = entry.styleElement;
      if (styleEl && styleEl.textContent) {
        styleEl.textContent = styleEl.textContent.replace(entry.fullMatch, "");
        removed++;
      }
    }
  }

  return { modified: removed > 0, removed, keptIndices };
}

// ============================================================================
// INTELLIGENT FONT SEARCH
// ============================================================================

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score 0-1 (1 = identical)
 */
export function stringSimilarity(a, b) {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.8;
  }

  // Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower[i - 1] === aLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[bLower.length][aLower.length];
  const maxLen = Math.max(aLower.length, bLower.length);
  return 1 - distance / maxLen;
}

/**
 * Normalize font family name for comparison
 * @param {string} name - Font family name
 * @returns {string} Normalized name
 */
export function normalizeFontName(name) {
  return name
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*(regular|normal|book|roman|medium|text)\s*$/i, "")
    .trim();
}

/**
 * List of common Google Fonts (for heuristic matching)
 * @constant {string[]}
 */
export const POPULAR_GOOGLE_FONTS = [
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Oswald",
  "Source Sans Pro",
  "Raleway",
  "PT Sans",
  "Merriweather",
  "Noto Sans",
  "Ubuntu",
  "Playfair Display",
  "Nunito",
  "Poppins",
  "Inter",
  "Fira Code",
  "Fira Sans",
  "Work Sans",
  "Quicksand",
  "Inconsolata",
  "Source Code Pro",
  "JetBrains Mono",
  "IBM Plex Sans",
  "IBM Plex Mono",
  "Libre Baskerville",
  "Crimson Text",
  "EB Garamond",
  "Spectral",
  "Bitter",
  "Zilla Slab",
];

/**
 * Search for similar fonts across available sources
 *
 * @param {string} fontFamily - Font family name to search for
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.includeGoogle=true] - Search Google Fonts
 * @param {boolean} [options.includeLocal=true] - Search local system fonts
 * @param {number} [options.maxResults=10] - Maximum results to return
 * @param {number} [options.minSimilarity=0.3] - Minimum similarity threshold
 * @returns {Promise<Array<{name: string, source: string, similarity: number, weight?: string, path?: string}>>}
 */
export async function searchSimilarFonts(fontFamily, options = {}) {
  const {
    includeGoogle = true,
    includeLocal = true,
    maxResults = 10,
    minSimilarity = 0.3,
  } = options;

  const normalizedQuery = normalizeFontName(fontFamily);
  const results = [];

  // Search Google Fonts
  if (includeGoogle) {
    for (const googleFont of POPULAR_GOOGLE_FONTS) {
      const similarity = stringSimilarity(normalizedQuery, normalizeFontName(googleFont));
      if (similarity >= minSimilarity) {
        results.push({
          name: googleFont,
          source: "google",
          similarity,
          url: buildGoogleFontsUrl(googleFont),
        });
      }
    }
  }

  // Search local system fonts
  if (includeLocal) {
    const systemFonts = await listSystemFonts();
    for (const font of systemFonts) {
      const similarity = stringSimilarity(normalizedQuery, normalizeFontName(font.name));
      if (similarity >= minSimilarity) {
        results.push({
          name: font.name,
          source: "local",
          similarity,
          path: font.path,
          format: font.format,
        });
      }
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Remove duplicates (same name from different sources)
  const seen = new Set();
  const uniqueResults = results.filter((r) => {
    const key = normalizeFontName(r.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueResults.slice(0, maxResults);
}

/**
 * Search and suggest font alternatives when original is unavailable
 *
 * @param {string} fontFamily - Original font family
 * @param {string} [originalUrl] - Original font URL that failed
 * @param {Object} [options={}] - Options
 * @returns {Promise<{found: boolean, alternatives: Array, recommendation?: Object}>}
 */
export async function findFontAlternatives(fontFamily, originalUrl, options = {}) {
  const alternatives = await searchSimilarFonts(fontFamily, {
    maxResults: 10,
    minSimilarity: 0.4,
    ...options,
  });

  if (alternatives.length === 0) {
    return { found: false, alternatives: [] };
  }

  // Recommend the best match
  const recommendation = alternatives[0];

  return {
    found: true,
    alternatives,
    recommendation,
    originalUrl,
    message: `Font "${fontFamily}" not found. Best match: "${recommendation.name}" (${Math.round(recommendation.similarity * 100)}% match) from ${recommendation.source}`,
  };
}

/**
 * Try to download a font from available sources
 *
 * @param {string} fontFamily - Font family name
 * @param {Object} [options={}] - Options
 * @param {string} [options.preferredSource] - Preferred source (google, local, fontget, fnt)
 * @param {string} [options.outputDir] - Output directory for downloaded font
 * @param {string[]} [options.weights=['400']] - Font weights to download
 * @returns {Promise<{success: boolean, path?: string, source?: string, error?: string}>}
 */
export async function downloadFont(fontFamily, options = {}) {
  const {
    preferredSource,
    outputDir = join(FONT_CACHE_DIR, "downloads"),
    weights = ["400"],
  } = options;

  mkdirSync(outputDir, { recursive: true });

  // Try preferred source first
  const sources = preferredSource
    ? [preferredSource, "google", "local", "fontget", "fnt"].filter((s, i, a) => a.indexOf(s) === i)
    : ["google", "local", "fontget", "fnt"];

  for (const source of sources) {
    try {
      switch (source) {
        case "local": {
          const localResult = await checkLocalFont(fontFamily);
          if (localResult.found) {
            return { success: true, path: localResult.path, source: "local" };
          }
          break;
        }

        case "google": {
          // Try Google Fonts CSS API
          const url = buildGoogleFontsUrl(fontFamily, { weights });
          try {
            const response = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; svgm/1.0)" },
            });
            if (response.ok) {
              const css = await response.text();
              // Extract WOFF2 URL from CSS
              const woff2Match = css.match(/url\(([^)]+\.woff2[^)]*)\)/i);
              if (woff2Match) {
                const fontUrl = woff2Match[1].replace(/['"]/g, "");
                const fontResponse = await fetch(fontUrl);
                if (fontResponse.ok) {
                  const buffer = Buffer.from(await fontResponse.arrayBuffer());
                  const filename = `${sanitizeFilename(fontFamily)}.woff2`;
                  const fontPath = join(outputDir, filename);
                  writeFileSync(fontPath, buffer);
                  return { success: true, path: fontPath, source: "google" };
                }
              }
            }
          } catch {
            // Try next source
          }
          break;
        }

        case "fontget": {
          const result = await downloadWithFontGet(fontFamily, outputDir);
          if (result.success) {
            return { success: true, path: result.path, source: "fontget" };
          }
          break;
        }

        case "fnt": {
          const result = await downloadWithFnt(fontFamily, outputDir);
          if (result.success) {
            return { success: true, path: result.path, source: "fnt" };
          }
          break;
        }
        default:
          // Unknown source, skip
          break;
      }
    } catch {
      // Continue to next source
    }
  }

  return { success: false, error: `Could not download font "${fontFamily}" from any source` };
}

// ============================================================================
// FONT CHARACTER EXTRACTION
// ============================================================================

/**
 * Extract all text content from SVG and map to fonts.
 * Returns a Map where keys are font family names and values are Sets of characters used.
 *
 * @param {Object} element - SVG element to scan (DOM element or JSDOM document)
 * @returns {Map<string, Set<string>>} Font to characters map
 */
export function extractFontCharacterMap(element) {
  const fontMap = new Map();

  const addCharsToFont = (fontFamily, text) => {
    if (!fontFamily || !text) return;
    // Normalize font family name (remove quotes, trim, take first in stack)
    const normalizedFont = fontFamily
      .replace(/['"]/g, "")
      .trim()
      .split(",")[0]
      .trim();
    if (!fontMap.has(normalizedFont)) {
      fontMap.set(normalizedFont, new Set());
    }
    const charSet = fontMap.get(normalizedFont);
    for (const char of text) {
      charSet.add(char);
    }
  };

  const walk = (el) => {
    if (!el) return;

    // Get font-family from style attribute
    const style = el.getAttribute?.("style") || "";
    const fontMatch = style.match(/font-family:\s*([^;]+)/i);
    const fontFromStyle = fontMatch ? fontMatch[1] : null;

    // Get font-family from font-family attribute
    const fontFromAttr = el.getAttribute?.("font-family");

    // Get font-family from CSS face attribute (for foreignObject content)
    const faceAttr = el.getAttribute?.("face");

    const fontFamily = fontFromStyle || fontFromAttr || faceAttr;

    // Get text content from this element
    // Some DOM implementations (like our svg-parser) store text directly in textContent
    // without creating actual childNode text nodes. Handle both cases.
    let directTextContent = "";

    // First try childNodes for standard DOM implementations
    if (el.childNodes && el.childNodes.length > 0) {
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          // TEXT_NODE
          directTextContent += node.nodeValue || "";
        }
      }
    }

    // If no text found via childNodes, but this is a text/tspan element,
    // use textContent directly (but only if it has no children to avoid double-counting)
    const isTextElement = el.tagName === "text" || el.tagName === "tspan";
    if (!directTextContent && isTextElement && el.textContent) {
      // Only use textContent if there are no child elements (which would have their own fonts)
      const hasChildElements = el.children && el.children.length > 0;
      if (!hasChildElements) {
        directTextContent = el.textContent;
      }
    }

    if (fontFamily && directTextContent.trim()) {
      addCharsToFont(fontFamily, directTextContent);
    }

    // Also check for text in <text> and <tspan> elements with inherited font
    if (isTextElement) {
      // Try to get inherited font from ancestors if no font on this element
      let inheritedFont = fontFamily;
      if (!inheritedFont && el.parentNode) {
        const parentStyle = el.parentNode.getAttribute?.("style") || "";
        const parentFontMatch = parentStyle.match(/font-family:\s*([^;]+)/i);
        inheritedFont = parentFontMatch
          ? parentFontMatch[1]
          : el.parentNode.getAttribute?.("font-family");
      }
      if (inheritedFont && !fontFamily && directTextContent.trim()) {
        addCharsToFont(inheritedFont, directTextContent);
      }
    }

    // Recurse into children
    if (el.children) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  walk(element);
  return fontMap;
}

/**
 * Convert font character map to URL-safe text parameter.
 * @param {Set<string>} charSet - Set of characters
 * @returns {string} URL-encoded unique characters
 */
export function charsToTextParam(charSet) {
  const uniqueChars = [...charSet].sort().join("");
  return encodeURIComponent(uniqueChars);
}

// ============================================================================
// GOOGLE FONTS UTILITIES
// ============================================================================

/**
 * Check if URL is a Google Fonts URL.
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isGoogleFontsUrl(url) {
  return (
    url &&
    (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com"))
  );
}

/**
 * Extract font family name from Google Fonts URL.
 * @param {string} url - Google Fonts URL
 * @returns {string|null} Font family name
 */
export function extractFontFamilyFromGoogleUrl(url) {
  try {
    const urlObj = new URL(url);
    const family = urlObj.searchParams.get("family");
    if (family) {
      // Handle "Fira+Mono" or "Fira Mono:400,700"
      return family.split(":")[0].replace(/\+/g, " ");
    }
  } catch {
    // Try regex fallback
    const match = url.match(/family=([^&:]+)/);
    if (match) {
      return match[1].replace(/\+/g, " ");
    }
  }
  return null;
}

/**
 * Add text parameter to Google Fonts URL for character subsetting.
 * This dramatically reduces font file size by only including needed glyphs.
 *
 * @param {string} url - Original Google Fonts URL
 * @param {string} textParam - URL-encoded characters to include
 * @returns {string} Modified URL with text parameter
 */
export function addTextParamToGoogleFontsUrl(url, textParam) {
  if (!textParam) return url;

  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set("text", decodeURIComponent(textParam));
    return urlObj.toString();
  } catch {
    // Fallback: append to URL string
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}text=${textParam}`;
  }
}

/**
 * Build Google Fonts URL for a font family.
 * @param {string} fontFamily - Font family name
 * @param {Object} [options={}] - Options
 * @param {string[]} [options.weights=['400']] - Font weights to include
 * @param {string[]} [options.styles=['normal']] - Font styles
 * @param {string} [options.text] - Characters to subset
 * @param {string} [options.display='swap'] - Font-display value
 * @returns {string} Google Fonts URL
 */
export function buildGoogleFontsUrl(fontFamily, options = {}) {
  const {
    weights = ["400"],
    styles: _styles = ["normal"],
    text,
    display = "swap",
  } = options;

  const encodedFamily = fontFamily.replace(/ /g, "+");
  const weightStr = weights.join(",");

  let url = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=${display}`;

  if (text) {
    url += `&text=${encodeURIComponent(text)}`;
  }

  return url;
}

// ============================================================================
// LOCAL FONT DETECTION
// ============================================================================

/**
 * Get system font directories for current platform
 * @returns {string[]} Array of font directory paths
 */
export function getSystemFontDirs() {
  const os = platform();
  return SYSTEM_FONT_PATHS[os] || [];
}

/**
 * Recursively read directory, compatible with Node 18.0+
 * Node 18.17+ has native recursive support, older versions need manual recursion
 * @private
 * @param {string} dir - Directory to read
 * @returns {Array<{name: string, path: string, isDirectory: () => boolean}>}
 */
function readdirRecursive(dir) {
  const results = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        results.push(...readdirRecursive(fullPath));
      } else {
        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: () => false,
        });
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return results;
}

/**
 * Check if a font is installed locally on the system.
 * @param {string} fontFamily - Font family name to check
 * @returns {Promise<{found: boolean, path?: string}>}
 */
export async function checkLocalFont(fontFamily) {
  const fontDirs = getSystemFontDirs();
  const normalizedName = fontFamily.toLowerCase().replace(/ /g, "");

  // Common font file naming patterns
  const patterns = [
    fontFamily.replace(/ /g, ""),
    fontFamily.replace(/ /g, "-"),
    fontFamily.replace(/ /g, "_"),
    normalizedName,
  ];

  for (const dir of fontDirs) {
    if (!existsSync(dir)) continue;

    try {
      const files = readdirRecursive(dir);

      for (const file of files) {
        if (file.isDirectory()) continue;

        const ext = extname(file.name).toLowerCase();
        if (!FONT_FORMATS[ext]) continue;

        const baseName = basename(file.name, ext).toLowerCase();

        for (const pattern of patterns) {
          if (baseName.includes(pattern.toLowerCase())) {
            return {
              found: true,
              path: file.path,
            };
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return { found: false };
}

/**
 * List all installed system fonts.
 * @returns {Promise<Array<{name: string, path: string, format: string}>>}
 */
export async function listSystemFonts() {
  const fonts = [];
  const fontDirs = getSystemFontDirs();

  for (const dir of fontDirs) {
    if (!existsSync(dir)) continue;

    try {
      const files = readdirRecursive(dir);

      for (const file of files) {
        if (file.isDirectory()) continue;

        const ext = extname(file.name).toLowerCase();
        const format = FONT_FORMATS[ext];
        if (!format) continue;

        const name = basename(file.name, ext);
        fonts.push({
          name,
          path: file.path,
          format: ext.slice(1),
        });
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return fonts;
}

// ============================================================================
// EXTERNAL TOOL INTEGRATION
// ============================================================================

/**
 * Check if a command exists in PATH
 * Cross-platform: uses 'where' on Windows, 'which' on Unix
 * @param {string} cmd - Command name
 * @returns {boolean}
 */
export function commandExists(cmd) {
  try {
    // Security: use execFileSync with array args to prevent command injection
    // Windows uses 'where', Unix uses 'which'
    const checkCmd = platform() === "win32" ? "where" : "which";
    execFileSync(checkCmd, [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Download font using FontGet (npm package)
 * @param {string} fontFamily - Font family name
 * @param {string} outputDir - Output directory
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function downloadWithFontGet(fontFamily, outputDir) {
  if (!commandExists("fontget")) {
    return { success: false, error: "FontGet not installed. Run: npm install -g fontget" };
  }

  try {
    mkdirSync(outputDir, { recursive: true });
    execFileSync("fontget", [fontFamily, "-o", outputDir], {
      stdio: "pipe",
      timeout: 60000,
    });

    // Find downloaded file
    const files = readdirSync(outputDir);
    const fontFile = files.find((f) => Object.keys(FONT_FORMATS).some((ext) => f.endsWith(ext)));

    if (fontFile) {
      return { success: true, path: join(outputDir, fontFile) };
    }
    return { success: false, error: "No font file found after download" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Download font using fnt (Homebrew package)
 * @param {string} fontFamily - Font family name
 * @param {string} outputDir - Output directory
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function downloadWithFnt(fontFamily, outputDir) {
  if (!commandExists("fnt")) {
    return { success: false, error: "fnt not installed. Run: brew install alexmyczko/fnt/fnt" };
  }

  try {
    mkdirSync(outputDir, { recursive: true });
    execFileSync("fnt", ["install", fontFamily], {
      stdio: "pipe",
      timeout: 60000,
    });

    // fnt installs to ~/.fonts by default
    const fntFontsDir = join(homedir(), ".fonts");
    if (existsSync(fntFontsDir)) {
      const files = readdirSync(fntFontsDir);
      const normalizedName = fontFamily.toLowerCase().replace(/ /g, "");
      const fontFile = files.find((f) => {
        const base = basename(f, extname(f)).toLowerCase();
        return (
          base.includes(normalizedName) &&
          Object.keys(FONT_FORMATS).some((ext) => f.endsWith(ext))
        );
      });

      if (fontFile) {
        const srcPath = join(fntFontsDir, fontFile);
        const destPath = join(outputDir, fontFile);
        copyFileSync(srcPath, destPath);
        return { success: true, path: destPath };
      }
    }
    return { success: false, error: "Font installed but file not found" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// REPLACEMENT MAP HANDLING
// ============================================================================

/**
 * Load font replacement map from YAML file.
 *
 * @param {string} [mapPath] - Path to YAML file. If not provided, checks:
 *   1. SVGM_REPLACEMENT_MAP environment variable
 *   2. ./svgm_replacement_map.yml in current directory
 * @returns {{replacements: Object, options: Object} | null} Parsed map or null if not found
 */
export function loadReplacementMap(mapPath) {
  // Priority: explicit path > env var > default file
  const pathsToTry = [
    mapPath,
    process.env[ENV_REPLACEMENT_MAP],
    join(process.cwd(), DEFAULT_REPLACEMENT_MAP),
    join(process.cwd(), "svgm_replacement_map_default.yml"),
  ].filter(Boolean);

  for (const p of pathsToTry) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf8");
        // Use FAILSAFE_SCHEMA for security (no function execution)
        const parsed = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA });

        return {
          replacements: parsed.replacements || {},
          options: parsed.options || {
            default_embed: true,
            default_subset: true,
            fallback_source: "google",
            auto_download: true,
          },
          path: p,
        };
      } catch (err) {
        throw new Error(`Failed to parse replacement map ${p}: ${err.message}`);
      }
    }
  }

  return null;
}

/**
 * Apply font replacements to an SVG document.
 *
 * @param {Object} doc - Parsed SVG document
 * @param {Object} replacements - Font replacement map {original: replacement}
 * @returns {{modified: boolean, replaced: Array<{from: string, to: string}>}}
 */
export function applyFontReplacements(doc, replacements) {
  const result = { modified: false, replaced: [] };

  const replaceInStyle = (styleStr) => {
    let modified = styleStr;
    for (const [original, replacement] of Object.entries(replacements)) {
      const pattern = new RegExp(
        `(font-family:\\s*)(['"]?)${escapeRegex(original)}\\2`,
        "gi"
      );
      if (pattern.test(modified)) {
        const newValue =
          typeof replacement === "string" ? replacement : replacement.replacement;
        modified = modified.replace(pattern, `$1$2${newValue}$2`);
        result.replaced.push({ from: original, to: newValue });
        result.modified = true;
      }
    }
    return modified;
  };

  const replaceInAttribute = (el, attrName) => {
    const value = el.getAttribute(attrName);
    if (!value) return;

    for (const [original, replacement] of Object.entries(replacements)) {
      const pattern = new RegExp(`^(['"]?)${escapeRegex(original)}\\1$`, "i");
      if (pattern.test(value.trim())) {
        const newValue =
          typeof replacement === "string" ? replacement : replacement.replacement;
        el.setAttribute(attrName, newValue);
        result.replaced.push({ from: original, to: newValue });
        result.modified = true;
      }
    }
  };

  // Walk all elements
  const walk = (el) => {
    if (!el) return;

    // Replace in style attribute
    const style = el.getAttribute?.("style");
    if (style) {
      const newStyle = replaceInStyle(style);
      if (newStyle !== style) {
        el.setAttribute("style", newStyle);
      }
    }

    // Replace in font-family attribute
    replaceInAttribute(el, "font-family");

    // Replace in face attribute (for foreignObject)
    replaceInAttribute(el, "face");

    // Recurse
    if (el.children) {
      for (const child of el.children) {
        walk(child);
      }
    }
  };

  // Also check <style> elements
  const styleElements = doc.querySelectorAll?.("style") || [];
  for (const styleEl of styleElements) {
    if (styleEl.textContent) {
      const newContent = replaceInStyle(styleEl.textContent);
      if (newContent !== styleEl.textContent) {
        styleEl.textContent = newContent;
      }
    }
  }

  walk(doc.documentElement || doc);

  return result;
}

/**
 * Escape string for use in regex
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// FONT LISTING AND ANALYSIS
// ============================================================================

/**
 * Font information structure
 * @typedef {Object} FontInfo
 * @property {string} family - Font family name
 * @property {string} type - 'embedded' | 'external' | 'system'
 * @property {string} [source] - URL or path for external fonts
 * @property {number} [size] - Size in bytes for embedded fonts
 * @property {Set<string>} [usedChars] - Characters used in SVG
 */

/**
 * List all fonts used in an SVG document.
 *
 * @param {Object} doc - Parsed SVG document
 * @returns {FontInfo[]} Array of font information
 */
export function listFonts(doc) {
  const fonts = new Map();

  // Get character usage map
  const charMap = extractFontCharacterMap(doc.documentElement || doc);

  // Find @font-face rules in <style> elements
  const styleElements = doc.querySelectorAll?.("style") || [];
  for (const styleEl of styleElements) {
    const css = styleEl.textContent || "";
    const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
    let match;

    while ((match = fontFaceRegex.exec(css)) !== null) {
      const block = match[1];

      // Extract font-family
      const familyMatch = block.match(/font-family:\s*(['"]?)([^;'"]+)\1/i);
      const family = familyMatch ? familyMatch[2].trim() : null;
      if (!family) continue;

      // Extract src url
      const srcMatch = block.match(/src:\s*url\((['"]?)([^)'"]+)\1\)/i);
      const src = srcMatch ? srcMatch[2] : null;

      // Determine type
      let type = "embedded";
      let source = null;

      if (src) {
        if (src.startsWith("data:")) {
          type = "embedded";
          // Calculate size from base64
          const base64Match = src.match(/base64,(.+)/);
          if (base64Match) {
            const size = Math.ceil((base64Match[1].length * 3) / 4);
            if (!fonts.has(family)) {
              fonts.set(family, { family, type, size, usedChars: charMap.get(family) });
            }
            continue;
          }
        } else {
          type = "external";
          source = src;
        }
      }

      if (!fonts.has(family)) {
        fonts.set(family, { family, type, source, usedChars: charMap.get(family) });
      }
    }
  }

  // Add fonts from character map that aren't in @font-face (system fonts)
  for (const [family, chars] of charMap) {
    if (!fonts.has(family)) {
      fonts.set(family, {
        family,
        type: WEB_SAFE_FONTS.includes(family) ? "system" : "unknown",
        usedChars: chars,
      });
    }
  }

  return Array.from(fonts.values());
}

// ============================================================================
// BACKUP SYSTEM
// ============================================================================

/**
 * Create a backup of a file before modifying it.
 *
 * @param {string} filePath - Path to file to backup
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.noBackup=false] - Skip backup creation
 * @param {number} [options.maxBackups=100] - Maximum numbered backups
 * @returns {string|null} Path to backup file, or null if skipped
 */
export function createBackup(filePath, options = {}) {
  const { noBackup = false, maxBackups = 100 } = options;

  if (noBackup || !existsSync(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.bak`;

  // If backup exists, create numbered backup
  let counter = 1;
  let finalBackupPath = backupPath;

  while (existsSync(finalBackupPath)) {
    finalBackupPath = `${filePath}.bak.${counter++}`;
    if (counter > maxBackups) {
      throw new Error(`Too many backup files (>${maxBackups}). Clean up old backups.`);
    }
  }

  copyFileSync(filePath, finalBackupPath);
  return finalBackupPath;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate SVG after font operations.
 *
 * @param {string} svgContent - SVG content to validate
 * @param {string} [operation] - Operation that was performed
 * @returns {{valid: boolean, warnings: string[], errors: string[]}}
 */
export async function validateSvgAfterFontOperation(svgContent, operation) {
  const result = { valid: true, warnings: [], errors: [] };

  try {
    // Dynamic import JSDOM
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
    const doc = dom.window.document;

    // Check for parser errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      result.valid = false;
      result.errors.push(`Invalid SVG: ${parseError.textContent}`);
      return result;
    }

    // Verify SVG root element exists
    const svg = doc.querySelector("svg");
    if (!svg) {
      result.valid = false;
      result.errors.push("Missing <svg> root element");
      return result;
    }

    // Operation-specific validation
    if (operation === "embed") {
      // Check for remaining external font URLs
      const styleElements = doc.querySelectorAll("style");
      for (const style of styleElements) {
        const css = style.textContent || "";
        const urlMatches = css.match(/url\((['"]?)(?!data:)([^)'"]+)\1\)/gi);
        if (urlMatches) {
          for (const match of urlMatches) {
            if (
              match.includes("fonts.googleapis.com") ||
              match.includes("fonts.gstatic.com")
            ) {
              result.warnings.push(`External font URL still present: ${match}`);
            }
          }
        }
      }
    }

    if (operation === "replace") {
      // Verify font families are valid
      const fonts = listFonts(doc);
      for (const font of fonts) {
        if (font.type === "unknown" && font.usedChars?.size > 0) {
          result.warnings.push(
            `Font "${font.family}" is used but not defined or recognized`
          );
        }
      }
    }

    dom.window.close();
  } catch (err) {
    result.valid = false;
    result.errors.push(`Validation failed: ${err.message}`);
  }

  return result;
}

// ============================================================================
// TEMPLATE GENERATION
// ============================================================================

/**
 * Generate YAML replacement map template
 * @returns {string} YAML template content
 */
export function generateReplacementMapTemplate() {
  return `# SVG Font Replacement Map
# ========================
# This file defines font replacements for SVG processing.
#
# Format:
#   original_font: replacement_font
#
# Examples:
#   "Arial": "Inter"           # Replace Arial with Inter
#   "Times New Roman": "Noto Serif"
#
# Font sources (in priority order):
#   1. Local system fonts
#   2. Google Fonts (default, free)
#   3. FontGet (npm: fontget)
#   4. fnt (brew: alexmyczko/fnt/fnt)
#
# Options per font:
#   embed: true                # Embed as base64 (default: true)
#   subset: true               # Only include used glyphs (default: true)
#   source: "google"           # Force specific source
#   weight: "400,700"          # Specific weights to include
#   style: "normal,italic"     # Specific styles
#
# Advanced format:
#   "Arial":
#     replacement: "Inter"
#     embed: true
#     subset: true
#     source: "google"
#     weights: ["400", "500", "700"]

replacements:
  # Add your font mappings here
  # "Original Font": "Replacement Font"

options:
  default_embed: true
  default_subset: true
  fallback_source: "google"
  auto_download: true
`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Character extraction
  extractFontCharacterMap,
  charsToTextParam,

  // Google Fonts
  isGoogleFontsUrl,
  extractFontFamilyFromGoogleUrl,
  addTextParamToGoogleFontsUrl,
  buildGoogleFontsUrl,
  POPULAR_GOOGLE_FONTS,

  // Local fonts
  getSystemFontDirs,
  checkLocalFont,
  listSystemFonts,

  // External tools
  commandExists,
  downloadWithFontGet,
  downloadWithFnt,

  // Replacement map
  loadReplacementMap,
  applyFontReplacements,
  generateReplacementMapTemplate,

  // Font listing
  listFonts,

  // Backup and validation
  createBackup,
  validateSvgAfterFontOperation,

  // Font caching
  initFontCache,
  getCachedFont,
  cacheFontData,
  cleanupFontCache,
  getFontCacheStats,

  // Font subsetting (requires fonttools/pyftsubset)
  isFonttoolsAvailable,
  subsetFont,
  subsetFontData,

  // WOFF2 compression (requires fonttools)
  convertToWoff2,
  convertDataToWoff2,

  // Duplicate detection
  detectDuplicateFontFaces,
  mergeDuplicateFontFaces,

  // Intelligent font search
  stringSimilarity,
  normalizeFontName,
  searchSimilarFonts,
  findFontAlternatives,
  downloadFont,

  // Constants
  DEFAULT_REPLACEMENT_MAP,
  ENV_REPLACEMENT_MAP,
  WEB_SAFE_FONTS,
  FONT_FORMATS,
  SYSTEM_FONT_PATHS,
  FONT_CACHE_DIR,
  FONT_CACHE_INDEX,
  FONT_CACHE_MAX_AGE,
};
