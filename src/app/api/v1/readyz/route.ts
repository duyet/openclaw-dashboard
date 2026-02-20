export const runtime = 'edge';

/**
 * Readiness check endpoint.
 * GET /api/v1/readyz
 */
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
