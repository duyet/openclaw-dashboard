/**
 * Drizzle ORM schema for OpenClaw Mission Control.
 *
 * All 27 tables ported from the Python SQLModel backend to Cloudflare D1 (SQLite).
 *
 * SQLite adaptations:
 * - UUIDs stored as text with crypto.randomUUID() defaults
 * - JSON/JSONB fields stored as text with $type<T>() annotations
 * - Datetimes stored as ISO-8601 text strings
 * - Booleans stored as integers with { mode: 'boolean' }
 * - Enums modeled via text columns with enum arrays
 * - Arrays serialized as JSON text
 */

import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Helper: UUID primary key default
// ---------------------------------------------------------------------------
const uuidPk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

// ---------------------------------------------------------------------------
// 1. organizations
// ---------------------------------------------------------------------------
export const organizations = sqliteTable(
  "organizations",
  {
    id: uuidPk(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_organizations_name").on(table.name)]
);

// ---------------------------------------------------------------------------
// 2. users
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: uuidPk(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    preferredName: text("preferred_name"),
    pronouns: text("pronouns"),
    timezone: text("timezone"),
    notes: text("notes"),
    context: text("context"),
    isSuperAdmin: integer("is_super_admin", { mode: "boolean" })
      .notNull()
      .default(false),
    activeOrganizationId: text("active_organization_id").references(
      () => organizations.id
    ),
  },
  (table) => [
    uniqueIndex("uq_users_clerk_user_id").on(table.clerkUserId),
    index("idx_users_email").on(table.email),
    index("idx_users_active_organization_id").on(table.activeOrganizationId),
  ]
);

// ---------------------------------------------------------------------------
// 3. organization_members
// ---------------------------------------------------------------------------
export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
    allBoardsRead: integer("all_boards_read", { mode: "boolean" })
      .notNull()
      .default(false),
    allBoardsWrite: integer("all_boards_write", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_organization_members_org_user").on(
      table.organizationId,
      table.userId
    ),
    index("idx_organization_members_organization_id").on(table.organizationId),
    index("idx_organization_members_user_id").on(table.userId),
    index("idx_organization_members_role").on(table.role),
  ]
);

// ---------------------------------------------------------------------------
// 4. organization_invites
// ---------------------------------------------------------------------------
export const organizationInvites = sqliteTable(
  "organization_invites",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    invitedEmail: text("invited_email").notNull(),
    token: text("token").notNull(),
    role: text("role").notNull().default("member"),
    allBoardsRead: integer("all_boards_read", { mode: "boolean" })
      .notNull()
      .default(false),
    allBoardsWrite: integer("all_boards_write", { mode: "boolean" })
      .notNull()
      .default(false),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
    acceptedAt: text("accepted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_org_invites_token").on(table.token),
    index("idx_organization_invites_organization_id").on(table.organizationId),
    index("idx_organization_invites_invited_email").on(table.invitedEmail),
    index("idx_organization_invites_role").on(table.role),
    index("idx_organization_invites_created_by_user_id").on(
      table.createdByUserId
    ),
    index("idx_organization_invites_accepted_by_user_id").on(
      table.acceptedByUserId
    ),
  ]
);

// ---------------------------------------------------------------------------
// 5. gateways
// ---------------------------------------------------------------------------
export const gateways = sqliteTable(
  "gateways",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    url: text("url").notNull(),
    token: text("token"),
    workspaceRoot: text("workspace_root").notNull(),
    deviceToken: text("device_token"),
    deviceTokenGrantedAt: text("device_token_granted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_gateways_organization_id").on(table.organizationId)]
);

// ---------------------------------------------------------------------------
// 6. board_groups
// ---------------------------------------------------------------------------
export const boardGroups = sqliteTable(
  "board_groups",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_board_groups_organization_id").on(table.organizationId),
    index("idx_board_groups_slug").on(table.slug),
  ]
);

// ---------------------------------------------------------------------------
// 7. boards
// ---------------------------------------------------------------------------
export const boards = sqliteTable(
  "boards",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    gatewayId: text("gateway_id").references(() => gateways.id),
    boardGroupId: text("board_group_id").references(() => boardGroups.id),
    boardType: text("board_type").notNull().default("goal"),
    objective: text("objective"),
    successMetrics: text("success_metrics").$type<Record<
      string,
      unknown
    > | null>(),
    targetDate: text("target_date"),
    goalConfirmed: integer("goal_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    goalSource: text("goal_source"),
    requireApprovalForDone: integer("require_approval_for_done", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    requireReviewBeforeDone: integer("require_review_before_done", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    blockStatusChangesWithPendingApproval: integer(
      "block_status_changes_with_pending_approval",
      { mode: "boolean" }
    )
      .notNull()
      .default(false),
    onlyLeadCanChangeStatus: integer("only_lead_can_change_status", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    maxAgents: integer("max_agents").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_boards_organization_id").on(table.organizationId),
    index("idx_boards_slug").on(table.slug),
    index("idx_boards_gateway_id").on(table.gatewayId),
    index("idx_boards_board_group_id").on(table.boardGroupId),
    index("idx_boards_board_type").on(table.boardType),
  ]
);

// ---------------------------------------------------------------------------
// 8. organization_board_access
// ---------------------------------------------------------------------------
export const organizationBoardAccess = sqliteTable(
  "organization_board_access",
  {
    id: uuidPk(),
    organizationMemberId: text("organization_member_id")
      .notNull()
      .references(() => organizationMembers.id),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
    canWrite: integer("can_write", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_org_board_access_member_board").on(
      table.organizationMemberId,
      table.boardId
    ),
    index("idx_org_board_access_organization_member_id").on(
      table.organizationMemberId
    ),
    index("idx_org_board_access_board_id").on(table.boardId),
  ]
);

// ---------------------------------------------------------------------------
// 9. organization_invite_board_access
// ---------------------------------------------------------------------------
export const organizationInviteBoardAccess = sqliteTable(
  "organization_invite_board_access",
  {
    id: uuidPk(),
    organizationInviteId: text("organization_invite_id")
      .notNull()
      .references(() => organizationInvites.id),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    canRead: integer("can_read", { mode: "boolean" }).notNull().default(true),
    canWrite: integer("can_write", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_org_invite_board_access_invite_board").on(
      table.organizationInviteId,
      table.boardId
    ),
    index("idx_org_invite_board_access_organization_invite_id").on(
      table.organizationInviteId
    ),
    index("idx_org_invite_board_access_board_id").on(table.boardId),
  ]
);

// ---------------------------------------------------------------------------
// 10. agents
// ---------------------------------------------------------------------------
export const agents = sqliteTable(
  "agents",
  {
    id: uuidPk(),
    boardId: text("board_id").references(() => boards.id),
    gatewayId: text("gateway_id")
      .notNull()
      .references(() => gateways.id),
    name: text("name").notNull(),
    status: text("status", {
      enum: [
        "provisioning",
        "online",
        "offline",
        "updating",
        "deleting",
        "deleted",
      ],
    })
      .notNull()
      .default("provisioning"),
    openclawSessionId: text("openclaw_session_id"),
    agentTokenHash: text("agent_token_hash"),
    heartbeatConfig: text("heartbeat_config").$type<Record<
      string,
      unknown
    > | null>(),
    identityProfile: text("identity_profile").$type<Record<
      string,
      unknown
    > | null>(),
    identityTemplate: text("identity_template"),
    soulTemplate: text("soul_template"),
    provisionRequestedAt: text("provision_requested_at"),
    provisionConfirmTokenHash: text("provision_confirm_token_hash"),
    provisionAction: text("provision_action"),
    deleteRequestedAt: text("delete_requested_at"),
    deleteConfirmTokenHash: text("delete_confirm_token_hash"),
    lastSeenAt: text("last_seen_at"),
    sessionStatus: text("session_status"),
    sessionLastActivityAt: text("session_last_activity_at"),
    sessionSyncedAt: text("session_synced_at"),
    isBoardLead: integer("is_board_lead", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_agents_board_id").on(table.boardId),
    index("idx_agents_gateway_id").on(table.gatewayId),
    index("idx_agents_name").on(table.name),
    index("idx_agents_status").on(table.status),
    index("idx_agents_openclaw_session_id").on(table.openclawSessionId),
    index("idx_agents_agent_token_hash").on(table.agentTokenHash),
    index("idx_agents_provision_confirm_token_hash").on(
      table.provisionConfirmTokenHash
    ),
    index("idx_agents_provision_action").on(table.provisionAction),
    index("idx_agents_delete_confirm_token_hash").on(
      table.deleteConfirmTokenHash
    ),
    index("idx_agents_is_board_lead").on(table.isBoardLead),
  ]
);

// ---------------------------------------------------------------------------
// 11. tasks
// ---------------------------------------------------------------------------
export const tasks = sqliteTable(
  "tasks",
  {
    id: uuidPk(),
    boardId: text("board_id").references(() => boards.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["inbox", "in_progress", "review", "done", "blocked", "cancelled"],
    })
      .notNull()
      .default("inbox"),
    priority: text("priority", { enum: ["low", "medium", "high", "critical"] })
      .notNull()
      .default("medium"),
    dueAt: text("due_at"),
    inProgressAt: text("in_progress_at"),
    previousInProgressAt: text("previous_in_progress_at"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    assignedAgentId: text("assigned_agent_id").references(() => agents.id),
    autoCreated: integer("auto_created", { mode: "boolean" })
      .notNull()
      .default(false),
    autoReason: text("auto_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_tasks_board_id").on(table.boardId),
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_priority").on(table.priority),
    index("idx_tasks_created_by_user_id").on(table.createdByUserId),
    index("idx_tasks_assigned_agent_id").on(table.assignedAgentId),
  ]
);

// ---------------------------------------------------------------------------
// 12. task_dependencies
// ---------------------------------------------------------------------------
export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    dependsOnTaskId: text("depends_on_task_id")
      .notNull()
      .references(() => tasks.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_task_dependencies_task_id_depends_on_task_id").on(
      table.taskId,
      table.dependsOnTaskId
    ),
    index("idx_task_dependencies_board_id").on(table.boardId),
    index("idx_task_dependencies_task_id").on(table.taskId),
    index("idx_task_dependencies_depends_on_task_id").on(table.dependsOnTaskId),
  ]
);

// ---------------------------------------------------------------------------
// 13. task_fingerprints
// ---------------------------------------------------------------------------
export const taskFingerprints = sqliteTable(
  "task_fingerprints",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    fingerprintHash: text("fingerprint_hash").notNull(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_task_fingerprints_board_id").on(table.boardId),
    index("idx_task_fingerprints_fingerprint_hash").on(table.fingerprintHash),
  ]
);

// ---------------------------------------------------------------------------
// 14. approvals
// ---------------------------------------------------------------------------
export const approvals = sqliteTable(
  "approvals",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    taskId: text("task_id").references(() => tasks.id),
    agentId: text("agent_id").references(() => agents.id),
    actionType: text("action_type").notNull(),
    payload: text("payload").$type<Record<string, unknown> | null>(),
    confidence: real("confidence").notNull(),
    rubricScores: text("rubric_scores").$type<Record<string, number> | null>(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_approvals_board_id").on(table.boardId),
    index("idx_approvals_task_id").on(table.taskId),
    index("idx_approvals_agent_id").on(table.agentId),
    index("idx_approvals_status").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// 15. approval_task_links
// ---------------------------------------------------------------------------
export const approvalTaskLinks = sqliteTable(
  "approval_task_links",
  {
    id: uuidPk(),
    approvalId: text("approval_id")
      .notNull()
      .references(() => approvals.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_approval_task_links_approval_id_task_id").on(
      table.approvalId,
      table.taskId
    ),
    index("idx_approval_task_links_approval_id").on(table.approvalId),
    index("idx_approval_task_links_task_id").on(table.taskId),
  ]
);

// ---------------------------------------------------------------------------
// 16. board_memory
// ---------------------------------------------------------------------------
export const boardMemory = sqliteTable(
  "board_memory",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    content: text("content").notNull(),
    tags: text("tags").$type<string[] | null>(),
    isChat: integer("is_chat", { mode: "boolean" }).notNull().default(false),
    source: text("source"),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_board_memory_board_id").on(table.boardId),
    index("idx_board_memory_is_chat").on(table.isChat),
  ]
);

// ---------------------------------------------------------------------------
// 17. board_group_memory
// ---------------------------------------------------------------------------
export const boardGroupMemory = sqliteTable(
  "board_group_memory",
  {
    id: uuidPk(),
    boardGroupId: text("board_group_id")
      .notNull()
      .references(() => boardGroups.id),
    content: text("content").notNull(),
    tags: text("tags").$type<string[] | null>(),
    isChat: integer("is_chat", { mode: "boolean" }).notNull().default(false),
    source: text("source"),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_board_group_memory_board_group_id").on(table.boardGroupId),
    index("idx_board_group_memory_is_chat").on(table.isChat),
  ]
);

// ---------------------------------------------------------------------------
// 18. board_onboarding_sessions
// ---------------------------------------------------------------------------
export const boardOnboardingSessions = sqliteTable(
  "board_onboarding_sessions",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    sessionKey: text("session_key").notNull(),
    status: text("status", { enum: ["active", "completed", "cancelled"] })
      .notNull()
      .default("active"),
    messages: text("messages").$type<Array<Record<string, unknown>> | null>(),
    draftGoal: text("draft_goal").$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_board_onboarding_sessions_board_id").on(table.boardId),
    index("idx_board_onboarding_sessions_status").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// 19. board_webhooks
// ---------------------------------------------------------------------------
export const boardWebhooks = sqliteTable(
  "board_webhooks",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    agentId: text("agent_id").references(() => agents.id),
    description: text("description").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_board_webhooks_board_id").on(table.boardId),
    index("idx_board_webhooks_agent_id").on(table.agentId),
    index("idx_board_webhooks_enabled").on(table.enabled),
  ]
);

// ---------------------------------------------------------------------------
// 20. board_webhook_payloads
// ---------------------------------------------------------------------------
export const boardWebhookPayloads = sqliteTable(
  "board_webhook_payloads",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => boardWebhooks.id),
    payload: text("payload").$type<unknown>(),
    headers: text("headers").$type<Record<string, string> | null>(),
    sourceIp: text("source_ip"),
    contentType: text("content_type"),
    receivedAt: text("received_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_board_webhook_payloads_board_id").on(table.boardId),
    index("idx_board_webhook_payloads_webhook_id").on(table.webhookId),
    index("idx_board_webhook_payloads_received_at").on(table.receivedAt),
  ]
);

// ---------------------------------------------------------------------------
// 21. activity_events
// ---------------------------------------------------------------------------
export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: uuidPk(),
    eventType: text("event_type").notNull(),
    message: text("message"),
    agentId: text("agent_id").references(() => agents.id),
    taskId: text("task_id").references(() => tasks.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_activity_events_event_type").on(table.eventType),
    index("idx_activity_events_agent_id").on(table.agentId),
    index("idx_activity_events_task_id").on(table.taskId),
  ]
);

// ---------------------------------------------------------------------------
// 22. tags
// ---------------------------------------------------------------------------
export const tags = sqliteTable(
  "tags",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color").notNull().default("9e9e9e"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_tags_organization_id_slug").on(
      table.organizationId,
      table.slug
    ),
    index("idx_tags_organization_id").on(table.organizationId),
    index("idx_tags_slug").on(table.slug),
  ]
);

// ---------------------------------------------------------------------------
// 23. tag_assignments
// ---------------------------------------------------------------------------
export const tagAssignments = sqliteTable(
  "tag_assignments",
  {
    id: uuidPk(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_tag_assignments_task_id_tag_id").on(
      table.taskId,
      table.tagId
    ),
    index("idx_tag_assignments_task_id").on(table.taskId),
    index("idx_tag_assignments_tag_id").on(table.tagId),
  ]
);

// ---------------------------------------------------------------------------
// 24. task_custom_field_definitions
// ---------------------------------------------------------------------------
export const taskCustomFieldDefinitions = sqliteTable(
  "task_custom_field_definitions",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type", {
      enum: [
        "text",
        "text_long",
        "integer",
        "decimal",
        "boolean",
        "date",
        "date_time",
        "url",
        "json",
      ],
    })
      .notNull()
      .default("text"),
    uiVisibility: text("ui_visibility", {
      enum: ["always", "if_set", "hidden"],
    })
      .notNull()
      .default("always"),
    validationRegex: text("validation_regex"),
    description: text("description"),
    required: integer("required", { mode: "boolean" }).notNull().default(false),
    defaultValue: text("default_value").$type<unknown>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_task_custom_field_definitions_org_id_field_key").on(
      table.organizationId,
      table.fieldKey
    ),
    index("idx_task_custom_field_definitions_organization_id").on(
      table.organizationId
    ),
    index("idx_task_custom_field_definitions_field_key").on(table.fieldKey),
  ]
);

// ---------------------------------------------------------------------------
// 25. task_custom_field_values
// ---------------------------------------------------------------------------
export const taskCustomFieldValues = sqliteTable(
  "task_custom_field_values",
  {
    id: uuidPk(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    taskCustomFieldDefinitionId: text("task_custom_field_definition_id")
      .notNull()
      .references(() => taskCustomFieldDefinitions.id),
    value: text("value").$type<unknown>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex(
      "uq_task_custom_field_values_task_id_task_custom_field_definition_id"
    ).on(table.taskId, table.taskCustomFieldDefinitionId),
    index("idx_task_custom_field_values_task_id").on(table.taskId),
    index("idx_task_custom_field_values_task_custom_field_definition_id").on(
      table.taskCustomFieldDefinitionId
    ),
  ]
);

// ---------------------------------------------------------------------------
// 26. board_task_custom_fields
// ---------------------------------------------------------------------------
export const boardTaskCustomFields = sqliteTable(
  "board_task_custom_fields",
  {
    id: uuidPk(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    taskCustomFieldDefinitionId: text("task_custom_field_definition_id")
      .notNull()
      .references(() => taskCustomFieldDefinitions.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex(
      "uq_board_task_custom_fields_board_id_task_custom_field_definition_id"
    ).on(table.boardId, table.taskCustomFieldDefinitionId),
    index("idx_board_task_custom_fields_board_id").on(table.boardId),
    index("idx_board_task_custom_fields_task_custom_field_definition_id").on(
      table.taskCustomFieldDefinitionId
    ),
  ]
);

// ---------------------------------------------------------------------------
// 27. marketplace_skills
// ---------------------------------------------------------------------------
export const marketplaceSkills = sqliteTable(
  "marketplace_skills",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    risk: text("risk"),
    source: text("source"),
    sourceUrl: text("source_url").notNull(),
    metadata: text("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(
        () => JSON.stringify({}) as unknown as Record<string, unknown>
      ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_marketplace_skills_org_source_url").on(
      table.organizationId,
      table.sourceUrl
    ),
    index("idx_marketplace_skills_organization_id").on(table.organizationId),
  ]
);

// ---------------------------------------------------------------------------
// 28. skill_packs
// ---------------------------------------------------------------------------
export const skillPacks = sqliteTable(
  "skill_packs",
  {
    id: uuidPk(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    sourceUrl: text("source_url").notNull(),
    branch: text("branch").notNull().default("main"),
    metadata: text("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .$defaultFn(
        () => JSON.stringify({}) as unknown as Record<string, unknown>
      ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_skill_packs_org_source_url").on(
      table.organizationId,
      table.sourceUrl
    ),
    index("idx_skill_packs_organization_id").on(table.organizationId),
  ]
);

// ---------------------------------------------------------------------------
// 29. gateway_installed_skills
// ---------------------------------------------------------------------------
export const gatewayInstalledSkills = sqliteTable(
  "gateway_installed_skills",
  {
    id: uuidPk(),
    gatewayId: text("gateway_id")
      .notNull()
      .references(() => gateways.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => marketplaceSkills.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_gateway_installed_skills_gateway_id_skill_id").on(
      table.gatewayId,
      table.skillId
    ),
    index("idx_gateway_installed_skills_gateway_id").on(table.gatewayId),
    index("idx_gateway_installed_skills_skill_id").on(table.skillId),
  ]
);

// ===========================================================================
// Relations (Drizzle relational queries)
// ===========================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invites: many(organizationInvites),
  gateways: many(gateways),
  boardGroups: many(boardGroups),
  boards: many(boards),
  tags: many(tags),
  taskCustomFieldDefinitions: many(taskCustomFieldDefinitions),
  marketplaceSkills: many(marketplaceSkills),
  skillPacks: many(skillPacks),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  activeOrganization: one(organizations, {
    fields: [users.activeOrganizationId],
    references: [organizations.id],
  }),
  memberships: many(organizationMembers),
  createdTasks: many(tasks),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
    boardAccess: many(organizationBoardAccess),
  })
);

export const organizationInvitesRelations = relations(
  organizationInvites,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [organizationInvites.organizationId],
      references: [organizations.id],
    }),
    createdByUser: one(users, {
      fields: [organizationInvites.createdByUserId],
      references: [users.id],
      relationName: "inviteCreator",
    }),
    acceptedByUser: one(users, {
      fields: [organizationInvites.acceptedByUserId],
      references: [users.id],
      relationName: "inviteAcceptor",
    }),
    boardAccess: many(organizationInviteBoardAccess),
  })
);

export const gatewaysRelations = relations(gateways, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [gateways.organizationId],
    references: [organizations.id],
  }),
  boards: many(boards),
  agents: many(agents),
  installedSkills: many(gatewayInstalledSkills),
}));

export const boardGroupsRelations = relations(boardGroups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [boardGroups.organizationId],
    references: [organizations.id],
  }),
  boards: many(boards),
  memory: many(boardGroupMemory),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [boards.organizationId],
    references: [organizations.id],
  }),
  gateway: one(gateways, {
    fields: [boards.gatewayId],
    references: [gateways.id],
  }),
  boardGroup: one(boardGroups, {
    fields: [boards.boardGroupId],
    references: [boardGroups.id],
  }),
  agents: many(agents),
  tasks: many(tasks),
  approvals: many(approvals),
  memory: many(boardMemory),
  onboardingSessions: many(boardOnboardingSessions),
  webhooks: many(boardWebhooks),
  webhookPayloads: many(boardWebhookPayloads),
  taskDependencies: many(taskDependencies),
  taskFingerprints: many(taskFingerprints),
  boardAccess: many(organizationBoardAccess),
  boardTaskCustomFields: many(boardTaskCustomFields),
}));

export const organizationBoardAccessRelations = relations(
  organizationBoardAccess,
  ({ one }) => ({
    member: one(organizationMembers, {
      fields: [organizationBoardAccess.organizationMemberId],
      references: [organizationMembers.id],
    }),
    board: one(boards, {
      fields: [organizationBoardAccess.boardId],
      references: [boards.id],
    }),
  })
);

export const organizationInviteBoardAccessRelations = relations(
  organizationInviteBoardAccess,
  ({ one }) => ({
    invite: one(organizationInvites, {
      fields: [organizationInviteBoardAccess.organizationInviteId],
      references: [organizationInvites.id],
    }),
    board: one(boards, {
      fields: [organizationInviteBoardAccess.boardId],
      references: [boards.id],
    }),
  })
);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  board: one(boards, {
    fields: [agents.boardId],
    references: [boards.id],
  }),
  gateway: one(gateways, {
    fields: [agents.gatewayId],
    references: [gateways.id],
  }),
  tasks: many(tasks),
  approvals: many(approvals),
  activityEvents: many(activityEvents),
  webhooks: many(boardWebhooks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  board: one(boards, {
    fields: [tasks.boardId],
    references: [boards.id],
  }),
  createdByUser: one(users, {
    fields: [tasks.createdByUserId],
    references: [users.id],
  }),
  assignedAgent: one(agents, {
    fields: [tasks.assignedAgentId],
    references: [agents.id],
  }),
  dependencies: many(taskDependencies),
  fingerprints: many(taskFingerprints),
  approvals: many(approvals),
  approvalLinks: many(approvalTaskLinks),
  tagAssignments: many(tagAssignments),
  customFieldValues: many(taskCustomFieldValues),
  activityEvents: many(activityEvents),
}));

export const taskDependenciesRelations = relations(
  taskDependencies,
  ({ one }) => ({
    board: one(boards, {
      fields: [taskDependencies.boardId],
      references: [boards.id],
    }),
    task: one(tasks, {
      fields: [taskDependencies.taskId],
      references: [tasks.id],
      relationName: "dependencyTask",
    }),
    dependsOnTask: one(tasks, {
      fields: [taskDependencies.dependsOnTaskId],
      references: [tasks.id],
      relationName: "dependencyTarget",
    }),
  })
);

export const taskFingerprintsRelations = relations(
  taskFingerprints,
  ({ one }) => ({
    board: one(boards, {
      fields: [taskFingerprints.boardId],
      references: [boards.id],
    }),
    task: one(tasks, {
      fields: [taskFingerprints.taskId],
      references: [tasks.id],
    }),
  })
);

export const approvalsRelations = relations(approvals, ({ one, many }) => ({
  board: one(boards, {
    fields: [approvals.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [approvals.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [approvals.agentId],
    references: [agents.id],
  }),
  taskLinks: many(approvalTaskLinks),
}));

export const approvalTaskLinksRelations = relations(
  approvalTaskLinks,
  ({ one }) => ({
    approval: one(approvals, {
      fields: [approvalTaskLinks.approvalId],
      references: [approvals.id],
    }),
    task: one(tasks, {
      fields: [approvalTaskLinks.taskId],
      references: [tasks.id],
    }),
  })
);

export const boardMemoryRelations = relations(boardMemory, ({ one }) => ({
  board: one(boards, {
    fields: [boardMemory.boardId],
    references: [boards.id],
  }),
}));

export const boardGroupMemoryRelations = relations(
  boardGroupMemory,
  ({ one }) => ({
    boardGroup: one(boardGroups, {
      fields: [boardGroupMemory.boardGroupId],
      references: [boardGroups.id],
    }),
  })
);

export const boardOnboardingSessionsRelations = relations(
  boardOnboardingSessions,
  ({ one }) => ({
    board: one(boards, {
      fields: [boardOnboardingSessions.boardId],
      references: [boards.id],
    }),
  })
);

export const boardWebhooksRelations = relations(
  boardWebhooks,
  ({ one, many }) => ({
    board: one(boards, {
      fields: [boardWebhooks.boardId],
      references: [boards.id],
    }),
    agent: one(agents, {
      fields: [boardWebhooks.agentId],
      references: [agents.id],
    }),
    payloads: many(boardWebhookPayloads),
  })
);

export const boardWebhookPayloadsRelations = relations(
  boardWebhookPayloads,
  ({ one }) => ({
    board: one(boards, {
      fields: [boardWebhookPayloads.boardId],
      references: [boards.id],
    }),
    webhook: one(boardWebhooks, {
      fields: [boardWebhookPayloads.webhookId],
      references: [boardWebhooks.id],
    }),
  })
);

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  agent: one(agents, {
    fields: [activityEvents.agentId],
    references: [agents.id],
  }),
  task: one(tasks, {
    fields: [activityEvents.taskId],
    references: [tasks.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tags.organizationId],
    references: [organizations.id],
  }),
  assignments: many(tagAssignments),
}));

export const tagAssignmentsRelations = relations(tagAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [tagAssignments.taskId],
    references: [tasks.id],
  }),
  tag: one(tags, {
    fields: [tagAssignments.tagId],
    references: [tags.id],
  }),
}));

export const taskCustomFieldDefinitionsRelations = relations(
  taskCustomFieldDefinitions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [taskCustomFieldDefinitions.organizationId],
      references: [organizations.id],
    }),
    values: many(taskCustomFieldValues),
    boardBindings: many(boardTaskCustomFields),
  })
);

export const taskCustomFieldValuesRelations = relations(
  taskCustomFieldValues,
  ({ one }) => ({
    task: one(tasks, {
      fields: [taskCustomFieldValues.taskId],
      references: [tasks.id],
    }),
    definition: one(taskCustomFieldDefinitions, {
      fields: [taskCustomFieldValues.taskCustomFieldDefinitionId],
      references: [taskCustomFieldDefinitions.id],
    }),
  })
);

export const boardTaskCustomFieldsRelations = relations(
  boardTaskCustomFields,
  ({ one }) => ({
    board: one(boards, {
      fields: [boardTaskCustomFields.boardId],
      references: [boards.id],
    }),
    definition: one(taskCustomFieldDefinitions, {
      fields: [boardTaskCustomFields.taskCustomFieldDefinitionId],
      references: [taskCustomFieldDefinitions.id],
    }),
  })
);

export const marketplaceSkillsRelations = relations(
  marketplaceSkills,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [marketplaceSkills.organizationId],
      references: [organizations.id],
    }),
    installations: many(gatewayInstalledSkills),
  })
);

export const skillPacksRelations = relations(skillPacks, ({ one }) => ({
  organization: one(organizations, {
    fields: [skillPacks.organizationId],
    references: [organizations.id],
  }),
}));

export const gatewayInstalledSkillsRelations = relations(
  gatewayInstalledSkills,
  ({ one }) => ({
    gateway: one(gateways, {
      fields: [gatewayInstalledSkills.gatewayId],
      references: [gateways.id],
    }),
    skill: one(marketplaceSkills, {
      fields: [gatewayInstalledSkills.skillId],
      references: [marketplaceSkills.id],
    }),
  })
);
