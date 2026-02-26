export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/agents/stream
 * Stream agent updates as Server-Sent Events.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);

    const url = new URL(request.url);
    const boardId = url.searchParams.get("board_id");
    const since = url.searchParams.get("since") || new Date().toISOString();

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const seen = new Set<string>();
        let lastSeen = since;

        while (!request.signal.aborted) {
          try {
            let agentList = await db
              .select()
              .from(agents)
              .where(sql`${agents.updatedAt} >= ${lastSeen}`);

            if (boardId) {
              agentList = agentList.filter((a) => a.boardId === boardId);
            }

            for (const agent of agentList) {
              const key = `${agent.id}:${agent.updatedAt}`;
              if (seen.has(key)) continue;
              if (seen.size > 2000) seen.clear();
              seen.add(key);
              lastSeen =
                agent.updatedAt > lastSeen ? agent.updatedAt : lastSeen;
              controller.enqueue(
                encoder.encode(
                  `event: update\ndata: ${JSON.stringify(agent)}\n\n`
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
