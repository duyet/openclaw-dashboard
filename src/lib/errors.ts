/**
 * Shared error types and response helpers for API route handlers.
 *
 * All helpers are edge-runtime compatible (no Node.js built-ins).
 */

/**
 * Application-level API error with HTTP status code and optional data payload.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Create a JSON error response.
 *
 * The response body shape is `{ detail: message }` when no data is provided,
 * or `{ detail: message, data: <data> }` when data is present. This mirrors
 * the FastAPI default error response format the frontend expects.
 */
export function errorResponse(
  status: number,
  message: string,
  data?: unknown,
): Response {
  return Response.json(
    { detail: message, ...(data !== undefined ? { data } : {}) },
    { status },
  );
}

/**
 * 404 Not Found response.
 */
export function notFound(message = 'Not found'): Response {
  return errorResponse(404, message);
}

/**
 * 403 Forbidden response.
 */
export function forbidden(message = 'Forbidden'): Response {
  return errorResponse(403, message);
}

/**
 * 400 Bad Request response with an optional data payload.
 */
export function badRequest(message: string, data?: unknown): Response {
  return errorResponse(400, message, data);
}

/**
 * 401 Unauthorized response.
 */
export function unauthorized(message = 'Unauthorized'): Response {
  return errorResponse(401, message);
}

/**
 * Handle an unknown error and return an appropriate Response.
 *
 * - ApiError instances produce the specified status code and message.
 * - All other errors produce a 500 Internal Server Error.
 */
export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.message, error.data);
  }
  console.error('[API Error]', error);
  return errorResponse(500, 'Internal server error');
}
