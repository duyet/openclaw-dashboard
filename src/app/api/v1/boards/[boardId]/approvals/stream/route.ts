export const runtime = "edge";
export const dynamic = "force-dynamic";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { approvals } from "@/lib/db/schema";
import { handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/boards/[boardId]/approvals/stream
 * Stream approval updates for a board as Server-Sent Events.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB, env);
    const { boardId } = await params;

    const url = new URL(request.url);
    const since = url.searchParams.get("since") || new Date().toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const seen = new Set<string>();
        let lastSeen = since;

        while (!request.signal.aborted) {
          try {
            const approvalList = await db
              .select()
              .from(approvals)
              .where(
                and(
                  eq(approvals.boardId, boardId),
                  sql`${approvals.createdAt} >= ${lastSeen}`
                )
              );

            for (const approval of approvalList) {
              const key = `${approval.id}:${approval.resolvedAt || approval.createdAt}`;
              if (seen.has(key)) continue;
              if (seen.size > 2000) seen.clear();
              seen.add(key);
              if (approval.createdAt > lastSeen) lastSeen = approval.createdAt;
              controller.enqueue(
                encoder.encode(
                  `event: update\ndata: ${JSON.stringify(approval)}\n\n`
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
