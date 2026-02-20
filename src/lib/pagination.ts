/**
 * Pagination utilities for API route handlers.
 *
 * Port of fastapi-pagination LimitOffset pagination to TypeScript.
 * Compatible with the wire format the frontend expects.
 *
 * All helpers are edge-runtime compatible (no Node.js built-ins).
 */

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface PaginationDefaults {
  /** Default page size when the `limit` query param is absent. Defaults to 50. */
  limit?: number;
  /** Hard ceiling on page size. Requests above this are clamped. Defaults to 200. */
  maxLimit?: number;
}

/**
 * Parse `limit` and `offset` search parameters from a URL.
 *
 * - `limit` is clamped to `[1, maxLimit]` (default max: 200).
 * - `offset` is clamped to `[0, +Infinity)`.
 * - Non-numeric or missing values fall back to safe defaults.
 */
export function parsePaginationParams(
  url: URL,
  defaults?: PaginationDefaults
): PaginationParams {
  const defaultLimit = defaults?.limit ?? 50;
  const maxLimit = defaults?.maxLimit ?? 200;

  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");

  const parsedLimit = rawLimit !== null ? parseInt(rawLimit, 10) : NaN;
  const parsedOffset = rawOffset !== null ? parseInt(rawOffset, 10) : NaN;

  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit, 1),
    maxLimit
  );
  const offset = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0);

  return { limit, offset };
}

/**
 * Alias for `parsePaginationParams` kept for backward compatibility with
 * existing route handlers that call `parsePagination`.
 */
export function parsePagination(url: URL, defaultLimit = 50): PaginationParams {
  return parsePaginationParams(url, { limit: defaultLimit });
}

/**
 * Construct a `PaginatedResponse<T>` object from a slice of items, the total
 * count from the DB, and the parsed pagination params.
 *
 * Returns a plain object (not a `Response`) so callers can enrich it before
 * serialising. Use `Response.json(paginatedResponse(...))` to send it.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    items,
    total,
    limit: params.limit,
    offset: params.offset,
  };
}

/**
 * Build a JSON `Response` for a paginated result set.
 *
 * Includes `X-Total-Count` and `Access-Control-Expose-Headers` headers so the
 * count is accessible from the browser.
 */
export function paginatedJsonResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams
): Response {
  return Response.json(
    { items, total, limit: params.limit, offset: params.offset },
    {
      headers: {
        "X-Total-Count": String(total),
        "Access-Control-Expose-Headers": "X-Total-Count",
      },
    }
  );
}
