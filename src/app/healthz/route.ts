export const runtime = "edge";

/**
 * Health check endpoint.
 * GET /healthz
 */
export async function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}
