/**
 * @fileoverview Configurable logging for @emasoft/svg-matrix
 * Provides centralized logging control for all library modules.
 *
 * Why buffered writing: appendFileSync blocks the event loop on every log call.
 * For high-volume logging, this creates significant performance impact.
 * Instead, we buffer log messages and flush periodically or on demand.
 * The tradeoff is that logs may be lost on crash - use flush() before
 * critical operations if durability is needed.
 *
 * @module src/logger
 * @license MIT
 *
 * @example
 * import { Logger, setLogLevel, LogLevel } from '@emasoft/svg-matrix';
 *
 * // Suppress all logging
 * setLogLevel(LogLevel.SILENT);
 *
 * // Enable only errors
 * setLogLevel(LogLevel.ERROR);
 *
 * // Enable warnings and errors (default)
 * setLogLevel(LogLevel.WARN);
 *
 * // Enable all logging including debug
 * setLogLevel(LogLevel.DEBUG);
 *
 * // Or configure via Logger object
 * Logger.level = LogLevel.WARN;
 * Logger.logToFile = '/path/to/logfile.log';
 */

// Why: Only appendFileSync is needed - we use sync writes in flush() for reliability
// during shutdown or before critical operations. Async writes were considered but
// the complexity of handling async flush during process exit wasn't worth it.
import { appendFileSync } from 'fs';

// ============================================================================
// CONSTANTS
// ============================================================================
// Why: Centralize configuration values to make tuning easier
const LOG_BUFFER_SIZE = 100;          // Flush after this many messages
const LOG_FLUSH_INTERVAL_MS = 5000;   // Auto-flush every 5 seconds

// ============================================================================
// LOG LEVELS
// ============================================================================
/**
 * Log levels for controlling output verbosity.
 * Why numeric values: Allows simple >= comparisons for level filtering.
 * @enum {number}
 */
export const LogLevel = {
  /** Suppress all logging - use when library is used in production */
  SILENT: 0,
  /** Log only errors - problems that prevent operation */
  ERROR: 1,
  /** Log errors and warnings - issues that may indicate problems */
  WARN: 2,
  /** Log errors, warnings, and info - normal operation status */
  INFO: 3,
  /** Log everything including debug - for development/troubleshooting */
  DEBUG: 4,
};

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================
/**
 * Global logger configuration and methods.
 * Why singleton pattern: Logging configuration should be consistent across
 * all modules in the library. A single Logger object ensures this.
 * @namespace
 */
export const Logger = {
  /**
   * Current log level. Messages below this level are suppressed.
   * Why WARN default: Library users typically only want to see problems,
   * not routine operation info. They can increase to INFO/DEBUG if needed.
   * @type {number}
   */
  level: LogLevel.WARN,

  /**
   * Optional file path for logging output.
   * Why null default: File logging must be explicitly enabled to avoid
   * unexpected file creation in user's project directories.
   * @type {string|null}
   */
  logToFile: null,

  /**
   * Whether to include timestamps in log output.
   * Why false default: Timestamps add noise for casual use. Enable for
   * debugging timing issues or when correlating with other logs.
   * @type {boolean}
   */
  timestamps: false,

  /**
   * Internal buffer for batching file writes.
   * Why buffering: Reduces I/O overhead by batching multiple log messages
   * into single file operations. See module docstring for tradeoffs.
   * @type {string[]}
   * @private
   */
  _buffer: [],

  /**
   * Timer reference for periodic flushing.
   * Why: Ensures buffered messages are written even during idle periods.
   * Without this, buffered messages might never be written if logging stops.
   * @type {NodeJS.Timeout|null}
   * @private
   */
  _flushTimer: null,

  /**
   * Format a log message with optional timestamp.
   * Why centralized formatting: Ensures consistent log format across all
   * log levels. Makes parsing and grep'ing logs easier.
   * @param {string} level - Log level name
   * @param {string} message - Message to format
   * @returns {string} Formatted message
   * @private
   */
  _format(level, message) {
    if (this.timestamps) {
      const ts = new Date().toISOString();
      return `[${ts}] [${level}] ${message}`;
    }
    return `[${level}] ${message}`;
  },

  /**
   * Add message to buffer and flush if needed.
   * Why buffer + conditional flush: Balances write efficiency with
   * message timeliness. Large bursts are batched, but messages aren't
   * delayed indefinitely.
   * @param {string} message - Message to buffer
   * @private
   */
  _bufferWrite(message) {
    if (!this.logToFile) return;

    this._buffer.push(message);

    // Why: Flush when buffer is full to prevent unbounded memory growth
    if (this._buffer.length >= LOG_BUFFER_SIZE) {
      this.flush();
    }

    // Why: Start auto-flush timer if not already running
    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => this.flush(), LOG_FLUSH_INTERVAL_MS);
      // Why: unref() prevents timer from keeping process alive when done
      this._flushTimer.unref();
    }
  },

  /**
   * Flush buffered messages to file.
   * Why public: Allows callers to force immediate write before critical
   * operations or shutdown. Uses sync write during flush for reliability.
   */
  flush() {
    if (!this.logToFile || this._buffer.length === 0) return;

    try {
      // Why sync here: flush() is called when reliability matters more
      // than performance (shutdown, before risky operation)
      const content = this._buffer.join('\n') + '\n';
      appendFileSync(this.logToFile, content);
      this._buffer = [];
    } catch {
      // Why silent: Can't log a logging failure. Clear buffer to prevent
      // infinite growth if file is consistently unwritable.
      this._buffer = [];
    }
  },

  /**
   * Log an error message. Always logged unless SILENT.
   * Why always flush errors: Errors may precede crashes. Immediate
   * write ensures the error is captured even if crash follows.
   * @param {string} message - Error message
   * @param {...any} args - Additional arguments
   */
  error(message, ...args) {
    if (this.level >= LogLevel.ERROR) {
      const formatted = this._format('ERROR', message);
      console.error(formatted, ...args);
      this._bufferWrite(formatted + (args.length ? ' ' + args.join(' ') : ''));
      // Why: Errors are important enough to flush immediately
      this.flush();
    }
  },

  /**
   * Log a warning message. Logged at WARN level and above.
   * @param {string} message - Warning message
   * @param {...any} args - Additional arguments
   */
  warn(message, ...args) {
    if (this.level >= LogLevel.WARN) {
      const formatted = this._format('WARN', message);
      console.warn(formatted, ...args);
      this._bufferWrite(formatted + (args.length ? ' ' + args.join(' ') : ''));
    }
  },

  /**
   * Log an info message. Logged at INFO level and above.
   * @param {string} message - Info message
   * @param {...any} args - Additional arguments
   */
  info(message, ...args) {
    if (this.level >= LogLevel.INFO) {
      const formatted = this._format('INFO', message);
      console.log(formatted, ...args);
      this._bufferWrite(formatted + (args.length ? ' ' + args.join(' ') : ''));
    }
  },

  /**
   * Log a debug message. Logged only at DEBUG level.
   * @param {string} message - Debug message
   * @param {...any} args - Additional arguments
   */
  debug(message, ...args) {
    if (this.level >= LogLevel.DEBUG) {
      const formatted = this._format('DEBUG', message);
      console.log(formatted, ...args);
      this._bufferWrite(formatted + (args.length ? ' ' + args.join(' ') : ''));
    }
  },

  /**
   * Clean up resources. Call before process exit.
   * Why: Flushes any remaining buffered messages and clears the timer.
   * Without this, messages in buffer would be lost on exit.
   */
  shutdown() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this.flush();
  },
};

/**
 * Set the global log level.
 * Why convenience function: Provides a more explicit API than directly
 * modifying Logger.level. Also allows future validation or side effects.
 * @param {number} level - Log level from LogLevel enum
 */
export function setLogLevel(level) {
  // Why: Validate level is within valid range to catch typos
  if (level < LogLevel.SILENT || level > LogLevel.DEBUG) {
    throw new Error(`Invalid log level: ${level}. Use LogLevel.SILENT (0) through LogLevel.DEBUG (4)`);
  }
  Logger.level = level;
}

/**
 * Get the current log level.
 * Why: Allows callers to save/restore log level around noisy operations.
 * @returns {number} Current log level
 */
export function getLogLevel() {
  return Logger.level;
}

/**
 * Enable file logging.
 * Why separate function: Encapsulates the setup of file logging including
 * timestamp configuration. Clearer intent than setting multiple properties.
 * @param {string} filePath - Path to log file
 * @param {boolean} [withTimestamps=true] - Include timestamps
 */
export function enableFileLogging(filePath, withTimestamps = true) {
  // Why: Don't accept empty/null paths - would cause confusing errors later
  if (!filePath) {
    throw new Error('File path required for enableFileLogging()');
  }
  Logger.logToFile = filePath;
  Logger.timestamps = withTimestamps;
}

/**
 * Disable file logging.
 * Why: Clean shutdown of file logging. Flushes buffer to ensure no
 * messages are lost, then clears the file path.
 */
export function disableFileLogging() {
  Logger.flush(); // Why: Don't lose buffered messages
  Logger.logToFile = null;
}

export default Logger;
