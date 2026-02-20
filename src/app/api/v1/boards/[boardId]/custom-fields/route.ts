export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq, sql } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boards,
  boardTaskCustomFields,
  taskCustomFieldDefinitions,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/boards/:boardId/custom-fields
 * List custom field definitions bound to this board.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);

    // Join boardTaskCustomFields with taskCustomFieldDefinitions
    const result = await db
      .select({
        id: boardTaskCustomFields.id,
        boardId: boardTaskCustomFields.boardId,
        taskCustomFieldDefinitionId:
          boardTaskCustomFields.taskCustomFieldDefinitionId,
        createdAt: boardTaskCustomFields.createdAt,
        fieldKey: taskCustomFieldDefinitions.fieldKey,
        label: taskCustomFieldDefinitions.label,
        fieldType: taskCustomFieldDefinitions.fieldType,
        uiVisibility: taskCustomFieldDefinitions.uiVisibility,
        validationRegex: taskCustomFieldDefinitions.validationRegex,
        description: taskCustomFieldDefinitions.description,
        required: taskCustomFieldDefinitions.required,
        defaultValue: taskCustomFieldDefinitions.defaultValue,
      })
      .from(boardTaskCustomFields)
      .innerJoin(
        taskCustomFieldDefinitions,
        eq(
          taskCustomFieldDefinitions.id,
          boardTaskCustomFields.taskCustomFieldDefinitionId
        )
      )
      .where(eq(boardTaskCustomFields.boardId, boardId))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.boardId, boardId));

    const total = countResult[0]?.count ?? 0;

    return Response.json(paginatedResponse(result, total, { limit, offset }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/boards/:boardId/custom-fields
 * Bind a custom field definition to a board.
 * Body: { task_custom_field_definition_id: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can bind custom fields");
    }

    // Verify board exists
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, boardId))
      .limit(1);

    if (board.length === 0) {
      throw new ApiError(404, "Board not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const definitionId = body.task_custom_field_definition_id;

    if (!definitionId || typeof definitionId !== "string") {
      throw new ApiError(422, "task_custom_field_definition_id is required");
    }

    // Verify the definition exists
    const definition = await db
      .select({ id: taskCustomFieldDefinitions.id })
      .from(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.id, definitionId))
      .limit(1);

    if (definition.length === 0) {
      throw new ApiError(404, "Custom field definition not found");
    }

    // Check for duplicate binding
    const existing = await db
      .select({ id: boardTaskCustomFields.id })
      .from(boardTaskCustomFields)
      .where(
        and(
          eq(boardTaskCustomFields.boardId, boardId),
          eq(boardTaskCustomFields.taskCustomFieldDefinitionId, definitionId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ApiError(409, "Custom field is already bound to this board");
    }

    const now = new Date().toISOString();
    const bindingId = crypto.randomUUID();

    await db.insert(boardTaskCustomFields).values({
      id: bindingId,
      boardId,
      taskCustomFieldDefinitionId: definitionId,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.id, bindingId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
