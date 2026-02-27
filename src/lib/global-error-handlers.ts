/**
 * Global error handlers for unhandled errors and promise rejections.
 *
 * This module sets up window-level error listeners exactly once.
 * Import this at the application entry point to enable global error logging.
 */

import { createLogger } from "./logger";

const log = createLogger("[GlobalError]");

/**
 * Setup global error handlers for the browser window.
 * Should be called once at application startup.
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    log.error("window:error", event.error, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    log.error("window:unhandledRejection", event.reason, {
      promise: String(event.promise),
    });
  });
}
