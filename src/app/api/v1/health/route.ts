export const runtime = 'edge';

/**
 * Health check endpoints.
 * GET /api/v1/health, /api/v1/healthz, /api/v1/readyz
 */
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
