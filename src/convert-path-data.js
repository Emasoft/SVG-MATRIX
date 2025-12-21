/**
 * Convert Path Data - SVGO-equivalent comprehensive path optimizer
 *
 * Applies all path optimizations to minimize path data string length:
 * - Parse path into structured commands
 * - Convert curves to lines when effectively straight
 * - Convert absolute to relative (or vice versa) - pick shorter
 * - Use command shortcuts (L->H/V, C->S, Q->T, L->Z)
 * - Remove leading zeros (0.5 -> .5)
 * - Remove redundant delimiters
 *
 * @module convert-path-data
 */

import Decimal from "decimal.js";

Decimal.set({ precision: 80 });

const D = (x) => (x instanceof Decimal ? x : new Decimal(x));

// SVG path command parameters count
const COMMAND_PARAMS = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
  Z: 0,
  z: 0,
};

/**
 * Parse arc arguments specially - flags are always single 0 or 1 digits.
 * Arc format: rx ry x-axis-rotation large-arc-flag sweep-flag x y
 * Flags can be written without separators: "0 01 20" or "0120"
 * BUG FIX #1: Handle compact notation where flags are concatenated with next number
 * BUG FIX #5: Handle invalid arc flags gracefully - return null to signal parsing failure
 * @param {string} argsStr - Arc arguments string to parse
 * @returns {Array<number>|null} Parsed arc parameters or null if invalid
 */
function parseArcArgs(argsStr) {
  const args = [];
  // Regex to match: number, then optionally flags and more numbers
  // Arc has: rx ry rotation flag flag x y (7 params per arc)
  const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

  let pos = 0;
  let arcIndex = 0; // 0-6 for each parameter in an arc

  while (pos < argsStr.length) {
    // Skip whitespace and commas
    while (pos < argsStr.length && /[\s,]/.test(argsStr[pos])) pos++;
    if (pos >= argsStr.length) break;

    const paramInArc = arcIndex % 7;

    if (paramInArc === 3 || paramInArc === 4) {
      // Flags: must be single 0 or 1 (arc flags are always exactly one character)
      // BUG FIX #1: Handle compact notation like "0120" -> "01" (flags) + "20" (next number)
      if (argsStr[pos] === "0" || argsStr[pos] === "1") {
        args.push(argsStr[pos] === "1" ? 1 : 0);
        pos++;
        arcIndex++;
      } else {
        // BUG FIX #5: Arc flags MUST be exactly 0 or 1 - return null for invalid values
        // This signals the caller to skip this arc command gracefully
        return null;
      }
    } else {
      // Regular number
      numRegex.lastIndex = pos;
      const match = numRegex.exec(argsStr);
      if (match && match.index === pos) {
        args.push(parseFloat(match[0]));
        pos = numRegex.lastIndex;
        arcIndex++;
      } else {
        // No match at current position - skip character
        pos++;
      }
    }
  }

  return args;
}

/**
 * Parse an SVG path d attribute into structured commands.
 * @param {string} d - Path d attribute value
 * @returns {Array<{command: string, args: number[]}>} Parsed commands
 */
export function parsePath(d) {
  if (!d || typeof d !== "string") return [];

  const commands = [];
  const cmdRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();

    if (cmd === "Z" || cmd === "z") {
      commands.push({ command: "Z", args: [] });
      // BUG FIX #1: Check for implicit M after Z (numbers after Z should start a new subpath)
      const remainingNums = argsStr.match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g);
      if (remainingNums && remainingNums.length >= 2) {
        // Implicit M command after Z
        commands.push({
          command: "M",
          args: [parseFloat(remainingNums[0]), parseFloat(remainingNums[1])],
        });
        // Continue parsing remaining args as implicit L
        for (let i = 2; i + 1 < remainingNums.length; i += 2) {
          commands.push({
            command: "L",
            args: [
              parseFloat(remainingNums[i]),
              parseFloat(remainingNums[i + 1]),
            ],
          });
        }
      }
      continue;
    }

    let nums;
    if (cmd === "A" || cmd === "a") {
      // Arc commands need special parsing for flags
      nums = parseArcArgs(argsStr);

      // BUG FIX #5: If arc parsing failed due to invalid flags, skip this command
      if (nums === null) {
        console.warn(
          `Invalid arc command with malformed flags - skipping: ${cmd}${argsStr}`,
        );
        continue; // Skip this command and continue processing the rest
      }

      // BUG FIX #2: Normalize negative arc radii to absolute values per SVG spec Section 8.3.8
      // Process each complete arc (7 parameters)
      for (let i = 0; i < nums.length; i += 7) {
        if (i + 6 < nums.length) {
          nums[i] = Math.abs(nums[i]); // rx
          nums[i + 1] = Math.abs(nums[i + 1]); // ry
        }
      }
    } else {
      // Regular commands - use standard number regex
      const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
      nums = [];
      let numMatch;
      while ((numMatch = numRegex.exec(argsStr)) !== null) {
        nums.push(parseFloat(numMatch[0]));
      }
    }

    const paramCount = COMMAND_PARAMS[cmd];

    if (paramCount === 0 || nums.length === 0) {
      commands.push({ command: cmd, args: [] });
    } else {
      for (let i = 0; i < nums.length; i += paramCount) {
        const args = nums.slice(i, i + paramCount);
        if (args.length === paramCount) {
          const effectiveCmd =
            i > 0 && (cmd === "M" || cmd === "m")
              ? cmd === "M"
                ? "L"
                : "l"
              : cmd;
          commands.push({ command: effectiveCmd, args });
        } else if (args.length > 0) {
          // BUG FIX #4: Warn when args are incomplete
          console.warn(
            `Incomplete ${cmd} command: expected ${paramCount} args, got ${args.length} - remaining args dropped`,
          );
        }
      }
    }
  }

  return commands;
}

/**
 * Format a number with optimal precision and minimal characters.
 * @param {number} num - Number to format
 * @param {number} precision - Maximum decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(num, precision = 3) {
  // BUG FIX #3: Handle NaN, Infinity, -Infinity
  if (!isFinite(num)) return "0";
  if (num === 0) return "0";

  const factor = Math.pow(10, precision);
  const rounded = Math.round(num * factor) / factor;

  let str = rounded.toFixed(precision);

  if (str.includes(".")) {
    str = str.replace(/\.?0+$/, "");
  }

  if (str.startsWith("0.")) {
    str = str.substring(1);
  } else if (str.startsWith("-0.")) {
    str = "-" + str.substring(2);
  }

  if (str === "" || str === "." || str === "-.") {
    str = "0";
  }

  return str;
}

/**
 * Convert a command to absolute form.
 */
export function toAbsolute(cmd, cx, cy) {
  const { command, args } = cmd;

  if (command === command.toUpperCase()) return cmd;

  const absCmd = command.toUpperCase();
  const absArgs = [...args];

  switch (command) {
    case "m":
    case "l":
    case "t":
      absArgs[0] += cx;
      absArgs[1] += cy;
      break;
    case "h":
      absArgs[0] += cx;
      break;
    case "v":
      absArgs[0] += cy;
      break;
    case "c":
      absArgs[0] += cx;
      absArgs[1] += cy;
      absArgs[2] += cx;
      absArgs[3] += cy;
      absArgs[4] += cx;
      absArgs[5] += cy;
      break;
    case "s":
    case "q":
      absArgs[0] += cx;
      absArgs[1] += cy;
      absArgs[2] += cx;
      absArgs[3] += cy;
      break;
    case "a":
      absArgs[5] += cx;
      absArgs[6] += cy;
      break;
  }

  return { command: absCmd, args: absArgs };
}

/**
 * Convert a command to relative form.
 */
export function toRelative(cmd, cx, cy) {
  const { command, args } = cmd;

  if (command === command.toLowerCase() && command !== "z") return cmd;
  if (command === "Z" || command === "z") return { command: "z", args: [] };

  const relCmd = command.toLowerCase();
  const relArgs = [...args];

  switch (command) {
    case "M":
    case "L":
    case "T":
      relArgs[0] -= cx;
      relArgs[1] -= cy;
      break;
    case "H":
      relArgs[0] -= cx;
      break;
    case "V":
      relArgs[0] -= cy;
      break;
    case "C":
      relArgs[0] -= cx;
      relArgs[1] -= cy;
      relArgs[2] -= cx;
      relArgs[3] -= cy;
      relArgs[4] -= cx;
      relArgs[5] -= cy;
      break;
    case "S":
    case "Q":
      relArgs[0] -= cx;
      relArgs[1] -= cy;
      relArgs[2] -= cx;
      relArgs[3] -= cy;
      break;
    case "A":
      relArgs[5] -= cx;
      relArgs[6] -= cy;
      break;
  }

  return { command: relCmd, args: relArgs };
}

/**
 * Convert L command to H or V when applicable.
 */
export function lineToHV(cmd, cx, cy, tolerance = 1e-6) {
  const { command, args } = cmd;
  if (command !== "L" && command !== "l") return null;

  const isAbs = command === "L";
  const endX = isAbs ? args[0] : cx + args[0];
  const endY = isAbs ? args[1] : cy + args[1];

  if (Math.abs(endY - cy) < tolerance) {
    return isAbs
      ? { command: "H", args: [endX] }
      : { command: "h", args: [endX - cx] };
  }
  if (Math.abs(endX - cx) < tolerance) {
    return isAbs
      ? { command: "V", args: [endY] }
      : { command: "v", args: [endY - cy] };
  }
  return null;
}

/**
 * Check if a line command returns to subpath start (can use Z).
 */
export function lineToZ(cmd, cx, cy, startX, startY, tolerance = 1e-6) {
  const { command, args } = cmd;
  if (command !== "L" && command !== "l") return false;

  const isAbs = command === "L";
  const endX = isAbs ? args[0] : cx + args[0];
  const endY = isAbs ? args[1] : cy + args[1];

  return (
    Math.abs(endX - startX) < tolerance && Math.abs(endY - startY) < tolerance
  );
}

/**
 * Check if a cubic bezier is effectively a straight line.
 */
export function isCurveStraight(
  x0,
  y0,
  cp1x,
  cp1y,
  cp2x,
  cp2y,
  x3,
  y3,
  tolerance = 0.5,
) {
  const chordLengthSq = (x3 - x0) ** 2 + (y3 - y0) ** 2;

  if (chordLengthSq < 1e-10) {
    const d1 = Math.sqrt((cp1x - x0) ** 2 + (cp1y - y0) ** 2);
    const d2 = Math.sqrt((cp2x - x0) ** 2 + (cp2y - y0) ** 2);
    return Math.max(d1, d2) < tolerance;
  }

  const chordLength = Math.sqrt(chordLengthSq);
  const d1 =
    Math.abs((y3 - y0) * cp1x - (x3 - x0) * cp1y + x3 * y0 - y3 * x0) /
    chordLength;
  const d2 =
    Math.abs((y3 - y0) * cp2x - (x3 - x0) * cp2y + x3 * y0 - y3 * x0) /
    chordLength;

  return Math.max(d1, d2) < tolerance;
}

/**
 * Convert a straight cubic bezier to a line command.
 */
export function straightCurveToLine(cmd, cx, cy, tolerance = 0.5) {
  const { command, args } = cmd;
  if (command !== "C" && command !== "c") return null;

  const isAbs = command === "C";
  const cp1x = isAbs ? args[0] : cx + args[0];
  const cp1y = isAbs ? args[1] : cy + args[1];
  const cp2x = isAbs ? args[2] : cx + args[2];
  const cp2y = isAbs ? args[3] : cy + args[3];
  const endX = isAbs ? args[4] : cx + args[4];
  const endY = isAbs ? args[5] : cy + args[5];

  if (isCurveStraight(cx, cy, cp1x, cp1y, cp2x, cp2y, endX, endY, tolerance)) {
    return isAbs
      ? { command: "L", args: [endX, endY] }
      : { command: "l", args: [endX - cx, endY - cy] };
  }
  return null;
}

/**
 * Serialize a single command to string with minimal characters.
 * @param {Object} cmd - The command object
 * @param {string|null} prevCommand - Previous command letter
 * @param {number} precision - Decimal precision
 * @param {boolean} prevLastArgHadDecimal - Whether previous command's last arg had a decimal point
 * @returns {{str: string, lastArgHadDecimal: boolean}} Serialized string and decimal info for next command
 */
export function serializeCommand(
  cmd,
  prevCommand,
  precision = 3,
  prevLastArgHadDecimal = false,
) {
  const { command, args } = cmd;

  if (command === "Z" || command === "z") {
    return { str: "z", lastArgHadDecimal: false };
  }

  // SPECIAL HANDLING FOR ARC COMMANDS
  // Arc format: rx ry rotation large-arc-flag sweep-flag x y
  // Per SVG spec: flags MUST be exactly 0 or 1, arc commands CANNOT be implicitly repeated
  if (command === "A" || command === "a") {
    const arcArgs = [
      formatNumber(args[0], precision), // rx
      formatNumber(args[1], precision), // ry
      formatNumber(args[2], precision), // rotation
      args[3] ? "1" : "0", // large-arc-flag (FORCE 0/1)
      args[4] ? "1" : "0", // sweep-flag (FORCE 0/1)
      formatNumber(args[5], precision), // x
      formatNumber(args[6], precision), // y
    ].join(" "); // ALWAYS use space delimiters for arcs to avoid invalid double-decimals

    // Arc commands CANNOT be implicitly repeated - always include command letter
    return {
      str: command + arcArgs,
      lastArgHadDecimal: arcArgs.includes("."),
    };
  }

  const formattedArgs = args.map((n) => formatNumber(n, precision));

  let argsStr = "";
  for (let i = 0; i < formattedArgs.length; i++) {
    const arg = formattedArgs[i];
    if (i === 0) {
      argsStr = arg;
    } else {
      const prevArg = formattedArgs[i - 1];
      const prevHasDecimal = prevArg.includes(".");

      if (arg.startsWith("-")) {
        // Negative sign is always a valid delimiter
        argsStr += arg;
      } else if (arg.startsWith(".") && prevHasDecimal) {
        // Decimal point works as delimiter only if prev already has a decimal
        // e.g., "-2.5" + ".3" = "-2.5.3" parses as -2.5 and .3 (number can't have two decimals)
        // but "0" + ".3" = "0.3" would merge into single number 0.3!
        argsStr += arg;
      } else {
        // Need space delimiter
        argsStr += " " + arg;
      }
    }
  }

  // Track whether our last arg has a decimal (for next command's delimiter decision)
  const lastArg = formattedArgs[formattedArgs.length - 1] || "";
  const thisLastArgHadDecimal = lastArg.includes(".");

  // Decide if we need command letter or can use implicit continuation
  // Arc commands CANNOT be implicitly repeated per SVG spec
  let cmdStr = command;
  if (prevCommand === "M" && command === "L") cmdStr = "";
  else if (prevCommand === "m" && command === "l") cmdStr = "";
  else if (prevCommand === command && command !== "A" && command !== "a")
    cmdStr = "";

  if (cmdStr) {
    // Explicit command letter - always safe, no delimiter needed
    return { str: cmdStr + argsStr, lastArgHadDecimal: thisLastArgHadDecimal };
  } else {
    // Implicit command - need to check delimiter between commands
    const firstArg = formattedArgs[0] || "";

    if (firstArg.startsWith("-")) {
      // Negative sign always works as delimiter
      return { str: argsStr, lastArgHadDecimal: thisLastArgHadDecimal };
    } else if (firstArg.startsWith(".") && prevLastArgHadDecimal) {
      // Decimal point works only if prev command's last arg already had a decimal
      return { str: argsStr, lastArgHadDecimal: thisLastArgHadDecimal };
    } else {
      // Need space delimiter
      return { str: " " + argsStr, lastArgHadDecimal: thisLastArgHadDecimal };
    }
  }
}

/**
 * Serialize a complete path to minimal string.
 */
export function serializePath(commands, precision = 3) {
  if (commands.length === 0) return "";

  let result = "";
  let prevCommand = null;
  let prevLastArgHadDecimal = false;

  for (const cmd of commands) {
    const { str, lastArgHadDecimal } = serializeCommand(
      cmd,
      prevCommand,
      precision,
      prevLastArgHadDecimal,
    );
    result += str;
    prevCommand = cmd.command;
    prevLastArgHadDecimal = lastArgHadDecimal;
  }

  return result;
}

/**
 * Optimize a path d attribute.
 * @param {string} d - Original path d attribute
 * @param {Object} [options={}] - Optimization options
 * @returns {{d: string, originalLength: number, optimizedLength: number, savings: number}}
 */
export function convertPathData(d, options = {}) {
  const {
    floatPrecision = 3,
    straightCurves = true,
    lineShorthands = true,
    convertToZ = true,
    utilizeAbsolute = true,
    straightTolerance = 0.5,
  } = options;

  const originalLength = d.length;
  const commands = parsePath(d);

  if (commands.length === 0) {
    return { d, originalLength, optimizedLength: originalLength, savings: 0 };
  }

  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;
  const optimized = [];

  for (let i = 0; i < commands.length; i++) {
    let cmd = commands[i];

    // BUG FIX #3: Convert zero arc radii to line per SVG spec Section 8.3.4
    // When rx or ry is 0, the arc degenerates to a straight line
    if (
      (cmd.command === "A" || cmd.command === "a") &&
      (cmd.args[0] === 0 || cmd.args[1] === 0)
    ) {
      const isAbs = cmd.command === "A";
      const endX = cmd.args[5];
      const endY = cmd.args[6];
      cmd = isAbs
        ? { command: "L", args: [endX, endY] }
        : { command: "l", args: [endX, endY] };
    }

    // 1. Straight curve to line
    if (straightCurves && (cmd.command === "C" || cmd.command === "c")) {
      const lineCmd = straightCurveToLine(cmd, cx, cy, straightTolerance);
      if (lineCmd) cmd = lineCmd;
    }

    // 2. Line shorthands (L -> H/V)
    if (lineShorthands && (cmd.command === "L" || cmd.command === "l")) {
      const hvCmd = lineToHV(cmd, cx, cy);
      if (hvCmd) cmd = hvCmd;
    }

    // 3. Line to Z
    if (convertToZ && (cmd.command === "L" || cmd.command === "l")) {
      if (lineToZ(cmd, cx, cy, startX, startY)) {
        cmd = { command: "z", args: [] };
      }
    }

    // 4. Choose shorter form (absolute vs relative)
    if (utilizeAbsolute && cmd.command !== "Z" && cmd.command !== "z") {
      const abs = toAbsolute(cmd, cx, cy);
      const rel = toRelative(cmd, cx, cy);
      // Bug fix: serializeCommand returns {str, lastArgHadDecimal} object,
      // so we need to extract .str before comparing lengths
      const absResult = serializeCommand(abs, null, floatPrecision);
      const relResult = serializeCommand(rel, null, floatPrecision);
      cmd = relResult.str.length < absResult.str.length ? rel : abs;
    }

    optimized.push(cmd);

    // Update position
    const finalCmd = toAbsolute(cmd, cx, cy);
    switch (finalCmd.command) {
      case "M":
        cx = finalCmd.args[0];
        cy = finalCmd.args[1];
        startX = cx;
        startY = cy;
        break;
      case "L":
      case "T":
        cx = finalCmd.args[0];
        cy = finalCmd.args[1];
        break;
      case "H":
        cx = finalCmd.args[0];
        break;
      case "V":
        cy = finalCmd.args[0];
        break;
      case "C":
        cx = finalCmd.args[4];
        cy = finalCmd.args[5];
        break;
      case "S":
      case "Q":
        cx = finalCmd.args[2];
        cy = finalCmd.args[3];
        break;
      case "A":
        cx = finalCmd.args[5];
        cy = finalCmd.args[6];
        break;
      case "Z":
        cx = startX;
        cy = startY;
        break;
    }
  }

  const optimizedD = serializePath(optimized, floatPrecision);

  return {
    d: optimizedD,
    originalLength,
    optimizedLength: optimizedD.length,
    savings: originalLength - optimizedD.length,
  };
}

/**
 * Optimize all path elements in an SVG document.
 */
export function optimizeDocumentPaths(root, options = {}) {
  let pathsOptimized = 0;
  let totalSavings = 0;
  const details = [];

  const processElement = (el) => {
    const tagName = el.tagName?.toLowerCase();

    if (tagName === "path") {
      const d = el.getAttribute("d");
      if (d) {
        const result = convertPathData(d, options);
        if (result.savings > 0) {
          el.setAttribute("d", result.d);
          pathsOptimized++;
          totalSavings += result.savings;
          details.push({
            id: el.getAttribute("id") || null,
            originalLength: result.originalLength,
            optimizedLength: result.optimizedLength,
            savings: result.savings,
          });
        }
      }
    }

    for (const child of el.children || []) {
      processElement(child);
    }
  };

  processElement(root);
  return { pathsOptimized, totalSavings, details };
}

export default {
  parsePath,
  formatNumber,
  toAbsolute,
  toRelative,
  lineToHV,
  lineToZ,
  isCurveStraight,
  straightCurveToLine,
  serializeCommand,
  serializePath,
  convertPathData,
  optimizeDocumentPaths,
};
