export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { and, eq } from "drizzle-orm";
import { requireActorContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { organizationBoardAccess, organizationMembers } from "@/lib/db/schema";
import { ApiError, handleApiError } from "@/lib/errors";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

/**
 * GET /api/v1/organizations/[orgId]/board-access
 * List board access grants for the organization.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    await requireActorContext(request, env.DB);
    const { orgId } = await params;

    const url = new URL(request.url);
    const { limit, offset } = parsePagination(url);
    const memberId = url.searchParams.get("member_id");
    const boardId = url.searchParams.get("board_id");

    // Get all members of this org first
    const members = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    const memberIds = members.map((m) => m.id);
    if (!memberIds.length) {
      return Response.json(paginatedResponse([], 0, { limit, offset }));
    }

    let result = await db
      .select()
      .from(organizationBoardAccess)
      .limit(limit)
      .offset(offset);

    // Filter to this org's members
    result = result.filter((a) => memberIds.includes(a.organizationMemberId));

    // Apply optional filters
    if (memberId) {
      result = result.filter((a) => a.organizationMemberId === memberId);
    }
    if (boardId) {
      result = result.filter((a) => a.boardId === boardId);
    }

    return Response.json(
      paginatedResponse(result, result.length, { limit, offset })
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/organizations/[orgId]/board-access
 * Grant board access to a member.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { env } = getRequestContext();
    const db = getDb(env.DB);
    const actor = await requireActorContext(request, env.DB);
    const { orgId } = await params;

    if (actor.type !== "user") {
      throw new ApiError(403, "Only users can grant board access");
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (!body.organization_member_id) {
      throw new ApiError(422, "organization_member_id is required");
    }
    if (!body.board_id) {
      throw new ApiError(422, "board_id is required");
    }

    const organizationMemberId = body.organization_member_id as string;
    const boardId = body.board_id as string;

    // Verify the member belongs to this org
    const member = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, organizationMemberId),
          eq(organizationMembers.organizationId, orgId)
        )
      )
      .limit(1);

    if (!member.length) {
      throw new ApiError(404, "Member not found in this organization");
    }

    const now = new Date().toISOString();
    const accessId = crypto.randomUUID();

    await db.insert(organizationBoardAccess).values({
      id: accessId,
      organizationMemberId,
      boardId,
      canRead: (body.can_read as boolean) ?? true,
      canWrite: (body.can_write as boolean) ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const result = await db
      .select()
      .from(organizationBoardAccess)
      .where(eq(organizationBoardAccess.id, accessId))
      .limit(1);

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
