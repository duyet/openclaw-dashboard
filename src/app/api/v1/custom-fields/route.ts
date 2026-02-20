export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boardTaskCustomFields,
  taskCustomFieldDefinitions,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/custom-fields
 * List task custom field definitions for the active organization.
 */
export async function GET(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const definitions = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.organizationId, actor.orgId))
      .orderBy(sql`lower(${taskCustomFieldDefinitions.label}) asc`);

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

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/custom-fields
 * Create a task custom field definition.
 */
export async function POST(request: Request) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.field_key) throw new ApiError(422, "field_key is required");
    const boardIds = body.board_ids as string[];
    if (!boardIds || boardIds.length === 0) {
      throw new ApiError(422, "At least one board must be selected");
    }

    const now = new Date().toISOString();
    const defId = crypto.randomUUID();
    const fieldKey = body.field_key as string;

    await db.insert(taskCustomFieldDefinitions).values({
      id: defId,
      organizationId: actor.orgId,
      fieldKey,
      label: (body.label as string) || fieldKey,
      fieldType: ((body.field_type as string) || "text") as
        | "text"
        | "text_long"
        | "integer"
        | "decimal"
        | "boolean"
        | "date"
        | "date_time"
        | "url"
        | "json",
      uiVisibility: ((body.ui_visibility as string) || "always") as
        | "always"
        | "if_set"
        | "hidden",
      validationRegex: (body.validation_regex as string) || null,
      description: (body.description as string) || null,
      required: (body.required as boolean) ?? false,
      defaultValue: body.default_value != null ? body.default_value : null,
      createdAt: now,
      updatedAt: now,
    });

    // Create board bindings
    for (const boardId of boardIds) {
      await db.insert(boardTaskCustomFields).values({
        id: crypto.randomUUID(),
        boardId,
        taskCustomFieldDefinitionId: defId,
        createdAt: now,
      });
    }

    const result = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.id, defId))
      .limit(1);

    return Response.json(
      { ...result[0], board_ids: boardIds },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
