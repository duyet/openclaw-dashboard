export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/activity/task-comments/stream
 * Stream task comment activity events as Server-Sent Events.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const url = new URL(request.url);
    const since = url.searchParams.get("since") || new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const seen = new Set<string>();
        let lastSeen = since;

        while (!request.signal.aborted) {
          try {
            const events = await db
              .select()
              .from(activityEvents)
              .where(sql`${activityEvents.createdAt} >= ${lastSeen}`)
              .orderBy(activityEvents.createdAt);

            // Filter for task-comment-like events
            const commentEvents = events.filter(
              (e) =>
                e.eventType === "task.comment" ||
                e.eventType === "task.comment.created" ||
                e.eventType.startsWith("task.comment")
            );

            for (const event of commentEvents) {
              if (seen.has(event.id)) continue;
              if (seen.size > 2000) seen.clear();
              seen.add(event.id);
              if (event.createdAt > lastSeen) lastSeen = event.createdAt;
              controller.enqueue(
                encoder.encode(
                  `event: update\ndata: ${JSON.stringify(event)}\n\n`
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
