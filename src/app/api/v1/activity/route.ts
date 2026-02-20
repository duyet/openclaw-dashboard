export const runtime = 'edge';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { activityEvents } from '@/lib/db/schema';
import { requireActorContext } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { parsePagination, paginatedResponse } from '@/lib/pagination';
import { sql } from 'drizzle-orm';

/**
 * GET /api/v1/activity
 * List activity events.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    const result = await db
      .select()
      .from(activityEvents)
      .orderBy(sql`${activityEvents.createdAt} desc`)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityEvents);

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}
