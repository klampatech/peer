/**
 * Logger - Structured logging utility using pino
 *
 * Provides consistent logging across the backend with:
 * - JSON output for production
 * - Pretty print in development
 * - Service name tracking
 * - Trace ID support
 */

import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Create the logger instance with appropriate configuration
 */
export const logger = pino({
  level: LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    bindings: (bindings) => ({
      service: 'peer-backend',
      ...bindings,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 * Useful for adding trace IDs or request-specific context
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}