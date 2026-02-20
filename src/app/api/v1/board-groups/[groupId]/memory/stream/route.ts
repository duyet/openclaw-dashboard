export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boardGroupMemory } from "@/lib/db/schema";
import { handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/board-groups/[groupId]/memory/stream
 * Stream board group memory events as Server-Sent Events.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { groupId } = await params;

    const url = new URL(request.url);
    const since = url.searchParams.get("since") || new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const seen = new Set<string>();
        let lastSeen = since;

        while (!request.signal.aborted) {
          try {
            const memories = await db
              .select()
              .from(boardGroupMemory)
              .where(
                and(
                  eq(boardGroupMemory.boardGroupId, groupId),
                  sql`${boardGroupMemory.createdAt} >= ${lastSeen}`
                )
              )
              .orderBy(boardGroupMemory.createdAt);

            for (const memory of memories) {
              if (seen.has(memory.id)) continue;
              if (seen.size > 2000) seen.clear();
              seen.add(memory.id);
              if (memory.createdAt > lastSeen) lastSeen = memory.createdAt;
              controller.enqueue(
                encoder.encode(
                  `event: update\ndata: ${JSON.stringify(memory)}\n\n`
                )
              );
            }

            controller.enqueue(encoder.encode(`: ping\n\n`));
            await new Promise((r) => setTimeout(r, 2000));
          } catch {
            break;
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
