export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  boardTaskCustomFields,
  taskCustomFieldDefinitions,
} from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";

/**
 * GET /api/v1/custom-fields/:fieldId
 * Get a single custom field definition.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  try {
    const { fieldId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (!actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const result = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(
        and(
          eq(taskCustomFieldDefinitions.id, fieldId),
          eq(taskCustomFieldDefinitions.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new ApiError(404, "Custom field not found");
    }

    const boardBindings = await db
      .select({ boardId: boardTaskCustomFields.boardId })
      .from(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.taskCustomFieldDefinitionId, fieldId));

    return Response.json({
      ...result[0],
      board_ids: boardBindings.map((b) => b.boardId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/custom-fields/:fieldId
 * Update a custom field definition.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  try {
    const { fieldId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(
        and(
          eq(taskCustomFieldDefinitions.id, fieldId),
          eq(taskCustomFieldDefinitions.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Custom field not found");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof body.label === "string") updates.label = body.label;
    if (typeof body.field_type === "string")
      updates.fieldType = body.field_type;
    if (typeof body.ui_visibility === "string")
      updates.uiVisibility = body.ui_visibility;
    if (body.validation_regex !== undefined)
      updates.validationRegex = body.validation_regex || null;
    if (body.description !== undefined)
      updates.description = body.description || null;
    if (typeof body.required === "boolean") updates.required = body.required;
    if (body.default_value !== undefined) {
      updates.defaultValue =
        body.default_value != null ? JSON.stringify(body.default_value) : null;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await db
        .update(taskCustomFieldDefinitions)
        .set(updates)
        .where(eq(taskCustomFieldDefinitions.id, fieldId));
    }

    // Update board bindings if provided
    if (Array.isArray(body.board_ids)) {
      await db
        .delete(boardTaskCustomFields)
        .where(eq(boardTaskCustomFields.taskCustomFieldDefinitionId, fieldId));

      const now = new Date().toISOString();
      for (const boardId of body.board_ids) {
        await db.insert(boardTaskCustomFields).values({
          id: crypto.randomUUID(),
          boardId,
          taskCustomFieldDefinitionId: fieldId,
          createdAt: now,
        });
      }
    }

    const result = await db
      .select()
      .from(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.id, fieldId))
      .limit(1);

    const boardBindings = await db
      .select({ boardId: boardTaskCustomFields.boardId })
      .from(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.taskCustomFieldDefinitionId, fieldId));

    return Response.json({
      ...result[0],
      board_ids: boardBindings.map((b) => b.boardId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/custom-fields/:fieldId
 * Delete a custom field definition and its board bindings.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  try {
    const { fieldId } = await params;
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);

    if (actor.type !== "user" || !actor.orgId) {
      throw new ApiError(403, "No active organization");
    }

    const existing = await db
      .select({ id: taskCustomFieldDefinitions.id })
      .from(taskCustomFieldDefinitions)
      .where(
        and(
          eq(taskCustomFieldDefinitions.id, fieldId),
          eq(taskCustomFieldDefinitions.organizationId, actor.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new ApiError(404, "Custom field not found");
    }

    // Delete board bindings first
    await db
      .delete(boardTaskCustomFields)
      .where(eq(boardTaskCustomFields.taskCustomFieldDefinitionId, fieldId));

    await db
      .delete(taskCustomFieldDefinitions)
      .where(eq(taskCustomFieldDefinitions.id, fieldId));

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
