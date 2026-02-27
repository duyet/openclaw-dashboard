/**
 * Shared logging utilities for client-side components.
 *
 * Provides consistent error formatting with context, timestamps,
 * and structured error details for debugging.
 */

type ErrorContext = Record<string, unknown>;

/**
 * Format an error value into a structured object for logging.
 */
function formatError(error: unknown): ErrorContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { error };
}

/**
 * Create a scoped logger with a prefix for identifying the log source.
 */
export function createLogger(prefix: string) {
  return {
    /**
     * Log an error with context and optional extra data.
     */
    error(context: string, error: unknown, extra?: ErrorContext): void {
      const errorDetails: ErrorContext = {
        context,
        timestamp: new Date().toISOString(),
        ...formatError(error),
        ...extra,
      };
      console.error(prefix, context, errorDetails);
    },

    /**
     * Log informational data with optional context.
     */
    info(context: string, data?: unknown): void {
      console.log(prefix, context, data ?? "");
    },
  };
}
