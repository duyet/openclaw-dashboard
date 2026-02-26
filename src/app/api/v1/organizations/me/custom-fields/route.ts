export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, asc } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boardTaskCustomFields,
  taskCustomFieldDefinitions,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/organizations/me/custom-fields
 * List task custom field definitions for the authenticated user's active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB, env);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const definitions = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.organizationId, actor.orgId))
      .orderBy(asc(taskCustomFieldDefinitions.label));

    // Fetch board bindings for each definition
    const definitionIds = definitions.map((d) => d.id);
    let boardBindings: Array<{
      taskCustomFieldDefinitionId: string;
      boardId: string;
    }> = [];

    if (definitionIds.length > 0) {
      boardBindings = await db
        .select({
          taskCustomFieldDefinitionId:
            boardTaskCustomFields.taskCustomFieldDefinitionId,
          boardId: boardTaskCustomFields.boardId,
        })
        .from(boardTaskCustomFields);
    }

    // Group board IDs by definition
    const boardIdsByDef = new Map<string, string[]>();
    for (const binding of boardBindings) {
      if (!definitionIds.includes(binding.taskCustomFieldDefinitionId))
        continue;
      const list = boardIdsByDef.get(binding.taskCustomFieldDefinitionId) || [];
      list.push(binding.boardId);
      boardIdsByDef.set(binding.taskCustomFieldDefinitionId, list);
    }

    const result = definitions.map((def) => ({
      ...def,
      board_ids: boardIdsByDef.get(def.id) || [],
    }));

    return Response.json({ data: result, status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
