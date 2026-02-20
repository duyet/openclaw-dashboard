export const runtime = 'edge';

import { handleApiError } from '@/lib/errors';

/**
 * GET /api/v1/souls
 * Return a static list of soul templates.
 * Currently returns an empty list; will be populated when soul templates
 * are fully implemented.
 */
export async function GET() {
  try {
    return Response.json({ items: [], total: 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
