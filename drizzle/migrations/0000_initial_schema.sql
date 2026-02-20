-- OpenClaw Mission Control – Initial Schema
-- Dialect : SQLite (Cloudflare D1)
-- Generated: 2026-02-20
-- All 29 tables created in dependency order (no forward FK references).

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organizations` (
  `id`         TEXT PRIMARY KEY NOT NULL,
  `name`       TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_organizations_name`
  ON `organizations` (`name`);

-- ---------------------------------------------------------------------------
-- 2. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`                     TEXT PRIMARY KEY NOT NULL,
  `clerk_user_id`          TEXT NOT NULL,
  `email`                  TEXT,
  `name`                   TEXT,
  `preferred_name`         TEXT,
  `pronouns`               TEXT,
  `timezone`               TEXT,
  `notes`                  TEXT,
  `context`                TEXT,
  `is_super_admin`         INTEGER NOT NULL DEFAULT 0,
  `active_organization_id` TEXT REFERENCES `organizations` (`id`)
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_users_clerk_user_id`
  ON `users` (`clerk_user_id`);

CREATE INDEX IF NOT EXISTS `idx_users_email`
  ON `users` (`email`);

CREATE INDEX IF NOT EXISTS `idx_users_active_organization_id`
  ON `users` (`active_organization_id`);

-- ---------------------------------------------------------------------------
-- 3. organization_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organization_members` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `user_id`          TEXT NOT NULL REFERENCES `users` (`id`),
  `role`             TEXT NOT NULL DEFAULT 'member',
  `all_boards_read`  INTEGER NOT NULL DEFAULT 0,
  `all_boards_write` INTEGER NOT NULL DEFAULT 0,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_organization_members_org_user`
  ON `organization_members` (`organization_id`, `user_id`);

CREATE INDEX IF NOT EXISTS `idx_organization_members_organization_id`
  ON `organization_members` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_organization_members_user_id`
  ON `organization_members` (`user_id`);

CREATE INDEX IF NOT EXISTS `idx_organization_members_role`
  ON `organization_members` (`role`);

-- ---------------------------------------------------------------------------
-- 4. organization_invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organization_invites` (
  `id`                   TEXT PRIMARY KEY NOT NULL,
  `organization_id`      TEXT NOT NULL REFERENCES `organizations` (`id`),
  `invited_email`        TEXT NOT NULL,
  `token`                TEXT NOT NULL,
  `role`                 TEXT NOT NULL DEFAULT 'member',
  `all_boards_read`      INTEGER NOT NULL DEFAULT 0,
  `all_boards_write`     INTEGER NOT NULL DEFAULT 0,
  `created_by_user_id`   TEXT REFERENCES `users` (`id`),
  `accepted_by_user_id`  TEXT REFERENCES `users` (`id`),
  `accepted_at`          TEXT,
  `created_at`           TEXT NOT NULL,
  `updated_at`           TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_org_invites_token`
  ON `organization_invites` (`token`);

CREATE INDEX IF NOT EXISTS `idx_organization_invites_organization_id`
  ON `organization_invites` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_organization_invites_invited_email`
  ON `organization_invites` (`invited_email`);

CREATE INDEX IF NOT EXISTS `idx_organization_invites_role`
  ON `organization_invites` (`role`);

CREATE INDEX IF NOT EXISTS `idx_organization_invites_created_by_user_id`
  ON `organization_invites` (`created_by_user_id`);

CREATE INDEX IF NOT EXISTS `idx_organization_invites_accepted_by_user_id`
  ON `organization_invites` (`accepted_by_user_id`);

-- ---------------------------------------------------------------------------
-- 5. gateways
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gateways` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`             TEXT NOT NULL,
  `url`              TEXT NOT NULL,
  `token`            TEXT,
  `workspace_root`   TEXT NOT NULL,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_gateways_organization_id`
  ON `gateways` (`organization_id`);

-- ---------------------------------------------------------------------------
-- 6. board_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_groups` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`             TEXT NOT NULL,
  `slug`             TEXT NOT NULL,
  `description`      TEXT,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_groups_organization_id`
  ON `board_groups` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_board_groups_slug`
  ON `board_groups` (`slug`);

-- ---------------------------------------------------------------------------
-- 7. boards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `boards` (
  `id`                                        TEXT PRIMARY KEY NOT NULL,
  `organization_id`                           TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`                                      TEXT NOT NULL,
  `slug`                                      TEXT NOT NULL,
  `description`                               TEXT NOT NULL DEFAULT '',
  `gateway_id`                                TEXT REFERENCES `gateways` (`id`),
  `board_group_id`                            TEXT REFERENCES `board_groups` (`id`),
  `board_type`                                TEXT NOT NULL DEFAULT 'goal',
  `objective`                                 TEXT,
  `success_metrics`                           TEXT,
  `target_date`                               TEXT,
  `goal_confirmed`                            INTEGER NOT NULL DEFAULT 0,
  `goal_source`                               TEXT,
  `require_approval_for_done`                 INTEGER NOT NULL DEFAULT 1,
  `require_review_before_done`                INTEGER NOT NULL DEFAULT 0,
  `block_status_changes_with_pending_approval` INTEGER NOT NULL DEFAULT 0,
  `only_lead_can_change_status`               INTEGER NOT NULL DEFAULT 0,
  `max_agents`                                INTEGER NOT NULL DEFAULT 1,
  `created_at`                                TEXT NOT NULL,
  `updated_at`                                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_boards_organization_id`
  ON `boards` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_boards_slug`
  ON `boards` (`slug`);

CREATE INDEX IF NOT EXISTS `idx_boards_gateway_id`
  ON `boards` (`gateway_id`);

CREATE INDEX IF NOT EXISTS `idx_boards_board_group_id`
  ON `boards` (`board_group_id`);

CREATE INDEX IF NOT EXISTS `idx_boards_board_type`
  ON `boards` (`board_type`);

-- ---------------------------------------------------------------------------
-- 8. organization_board_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organization_board_access` (
  `id`                      TEXT PRIMARY KEY NOT NULL,
  `organization_member_id`  TEXT NOT NULL REFERENCES `organization_members` (`id`),
  `board_id`                TEXT NOT NULL REFERENCES `boards` (`id`),
  `can_read`                INTEGER NOT NULL DEFAULT 1,
  `can_write`               INTEGER NOT NULL DEFAULT 0,
  `created_at`              TEXT NOT NULL,
  `updated_at`              TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_org_board_access_member_board`
  ON `organization_board_access` (`organization_member_id`, `board_id`);

CREATE INDEX IF NOT EXISTS `idx_org_board_access_organization_member_id`
  ON `organization_board_access` (`organization_member_id`);

CREATE INDEX IF NOT EXISTS `idx_org_board_access_board_id`
  ON `organization_board_access` (`board_id`);

-- ---------------------------------------------------------------------------
-- 9. organization_invite_board_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organization_invite_board_access` (
  `id`                       TEXT PRIMARY KEY NOT NULL,
  `organization_invite_id`   TEXT NOT NULL REFERENCES `organization_invites` (`id`),
  `board_id`                 TEXT NOT NULL REFERENCES `boards` (`id`),
  `can_read`                 INTEGER NOT NULL DEFAULT 1,
  `can_write`                INTEGER NOT NULL DEFAULT 0,
  `created_at`               TEXT NOT NULL,
  `updated_at`               TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_org_invite_board_access_invite_board`
  ON `organization_invite_board_access` (`organization_invite_id`, `board_id`);

CREATE INDEX IF NOT EXISTS `idx_org_invite_board_access_organization_invite_id`
  ON `organization_invite_board_access` (`organization_invite_id`);

CREATE INDEX IF NOT EXISTS `idx_org_invite_board_access_board_id`
  ON `organization_invite_board_access` (`board_id`);

-- ---------------------------------------------------------------------------
-- 10. agents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agents` (
  `id`                          TEXT PRIMARY KEY NOT NULL,
  `board_id`                    TEXT REFERENCES `boards` (`id`),
  `gateway_id`                  TEXT NOT NULL REFERENCES `gateways` (`id`),
  `name`                        TEXT NOT NULL,
  `status`                      TEXT NOT NULL DEFAULT 'provisioning',
  `openclaw_session_id`         TEXT,
  `agent_token_hash`            TEXT,
  `heartbeat_config`            TEXT,
  `identity_profile`            TEXT,
  `identity_template`           TEXT,
  `soul_template`               TEXT,
  `provision_requested_at`      TEXT,
  `provision_confirm_token_hash` TEXT,
  `provision_action`            TEXT,
  `delete_requested_at`         TEXT,
  `delete_confirm_token_hash`   TEXT,
  `last_seen_at`                TEXT,
  `is_board_lead`               INTEGER NOT NULL DEFAULT 0,
  `created_at`                  TEXT NOT NULL,
  `updated_at`                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_agents_board_id`
  ON `agents` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_agents_gateway_id`
  ON `agents` (`gateway_id`);

CREATE INDEX IF NOT EXISTS `idx_agents_name`
  ON `agents` (`name`);

CREATE INDEX IF NOT EXISTS `idx_agents_status`
  ON `agents` (`status`);

CREATE INDEX IF NOT EXISTS `idx_agents_openclaw_session_id`
  ON `agents` (`openclaw_session_id`);

CREATE INDEX IF NOT EXISTS `idx_agents_agent_token_hash`
  ON `agents` (`agent_token_hash`);

CREATE INDEX IF NOT EXISTS `idx_agents_provision_confirm_token_hash`
  ON `agents` (`provision_confirm_token_hash`);

CREATE INDEX IF NOT EXISTS `idx_agents_provision_action`
  ON `agents` (`provision_action`);

CREATE INDEX IF NOT EXISTS `idx_agents_delete_confirm_token_hash`
  ON `agents` (`delete_confirm_token_hash`);

CREATE INDEX IF NOT EXISTS `idx_agents_is_board_lead`
  ON `agents` (`is_board_lead`);

-- ---------------------------------------------------------------------------
-- 11. tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id`                      TEXT PRIMARY KEY NOT NULL,
  `board_id`                TEXT REFERENCES `boards` (`id`),
  `title`                   TEXT NOT NULL,
  `description`             TEXT,
  `status`                  TEXT NOT NULL DEFAULT 'inbox',
  `priority`                TEXT NOT NULL DEFAULT 'medium',
  `due_at`                  TEXT,
  `in_progress_at`          TEXT,
  `previous_in_progress_at` TEXT,
  `created_by_user_id`      TEXT REFERENCES `users` (`id`),
  `assigned_agent_id`       TEXT REFERENCES `agents` (`id`),
  `auto_created`            INTEGER NOT NULL DEFAULT 0,
  `auto_reason`             TEXT,
  `created_at`              TEXT NOT NULL,
  `updated_at`              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_tasks_board_id`
  ON `tasks` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_tasks_status`
  ON `tasks` (`status`);

CREATE INDEX IF NOT EXISTS `idx_tasks_priority`
  ON `tasks` (`priority`);

CREATE INDEX IF NOT EXISTS `idx_tasks_created_by_user_id`
  ON `tasks` (`created_by_user_id`);

CREATE INDEX IF NOT EXISTS `idx_tasks_assigned_agent_id`
  ON `tasks` (`assigned_agent_id`);

-- ---------------------------------------------------------------------------
-- 12. task_dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_dependencies` (
  `id`                 TEXT PRIMARY KEY NOT NULL,
  `board_id`           TEXT NOT NULL REFERENCES `boards` (`id`),
  `task_id`            TEXT NOT NULL REFERENCES `tasks` (`id`),
  `depends_on_task_id` TEXT NOT NULL REFERENCES `tasks` (`id`),
  `created_at`         TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_task_dependencies_task_id_depends_on_task_id`
  ON `task_dependencies` (`task_id`, `depends_on_task_id`);

CREATE INDEX IF NOT EXISTS `idx_task_dependencies_board_id`
  ON `task_dependencies` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_task_dependencies_task_id`
  ON `task_dependencies` (`task_id`);

CREATE INDEX IF NOT EXISTS `idx_task_dependencies_depends_on_task_id`
  ON `task_dependencies` (`depends_on_task_id`);

-- ---------------------------------------------------------------------------
-- 13. task_fingerprints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_fingerprints` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `board_id`         TEXT NOT NULL REFERENCES `boards` (`id`),
  `fingerprint_hash` TEXT NOT NULL,
  `task_id`          TEXT NOT NULL REFERENCES `tasks` (`id`),
  `created_at`       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_task_fingerprints_board_id`
  ON `task_fingerprints` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_task_fingerprints_fingerprint_hash`
  ON `task_fingerprints` (`fingerprint_hash`);

-- ---------------------------------------------------------------------------
-- 14. approvals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approvals` (
  `id`            TEXT PRIMARY KEY NOT NULL,
  `board_id`      TEXT NOT NULL REFERENCES `boards` (`id`),
  `task_id`       TEXT REFERENCES `tasks` (`id`),
  `agent_id`      TEXT REFERENCES `agents` (`id`),
  `action_type`   TEXT NOT NULL,
  `payload`       TEXT,
  `confidence`    REAL NOT NULL,
  `rubric_scores` TEXT,
  `status`        TEXT NOT NULL DEFAULT 'pending',
  `created_at`    TEXT NOT NULL,
  `resolved_at`   TEXT
);

CREATE INDEX IF NOT EXISTS `idx_approvals_board_id`
  ON `approvals` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_approvals_task_id`
  ON `approvals` (`task_id`);

CREATE INDEX IF NOT EXISTS `idx_approvals_agent_id`
  ON `approvals` (`agent_id`);

CREATE INDEX IF NOT EXISTS `idx_approvals_status`
  ON `approvals` (`status`);

-- ---------------------------------------------------------------------------
-- 15. approval_task_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_task_links` (
  `id`          TEXT PRIMARY KEY NOT NULL,
  `approval_id` TEXT NOT NULL REFERENCES `approvals` (`id`),
  `task_id`     TEXT NOT NULL REFERENCES `tasks` (`id`),
  `created_at`  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_approval_task_links_approval_id_task_id`
  ON `approval_task_links` (`approval_id`, `task_id`);

CREATE INDEX IF NOT EXISTS `idx_approval_task_links_approval_id`
  ON `approval_task_links` (`approval_id`);

CREATE INDEX IF NOT EXISTS `idx_approval_task_links_task_id`
  ON `approval_task_links` (`task_id`);

-- ---------------------------------------------------------------------------
-- 16. board_memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_memory` (
  `id`         TEXT PRIMARY KEY NOT NULL,
  `board_id`   TEXT NOT NULL REFERENCES `boards` (`id`),
  `content`    TEXT NOT NULL,
  `tags`       TEXT,
  `is_chat`    INTEGER NOT NULL DEFAULT 0,
  `source`     TEXT,
  `created_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_memory_board_id`
  ON `board_memory` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_board_memory_is_chat`
  ON `board_memory` (`is_chat`);

-- ---------------------------------------------------------------------------
-- 17. board_group_memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_group_memory` (
  `id`             TEXT PRIMARY KEY NOT NULL,
  `board_group_id` TEXT NOT NULL REFERENCES `board_groups` (`id`),
  `content`        TEXT NOT NULL,
  `tags`           TEXT,
  `is_chat`        INTEGER NOT NULL DEFAULT 0,
  `source`         TEXT,
  `created_at`     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_group_memory_board_group_id`
  ON `board_group_memory` (`board_group_id`);

CREATE INDEX IF NOT EXISTS `idx_board_group_memory_is_chat`
  ON `board_group_memory` (`is_chat`);

-- ---------------------------------------------------------------------------
-- 18. board_onboarding_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_onboarding_sessions` (
  `id`          TEXT PRIMARY KEY NOT NULL,
  `board_id`    TEXT NOT NULL REFERENCES `boards` (`id`),
  `session_key` TEXT NOT NULL,
  `status`      TEXT NOT NULL DEFAULT 'active',
  `messages`    TEXT,
  `draft_goal`  TEXT,
  `created_at`  TEXT NOT NULL,
  `updated_at`  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_onboarding_sessions_board_id`
  ON `board_onboarding_sessions` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_board_onboarding_sessions_status`
  ON `board_onboarding_sessions` (`status`);

-- ---------------------------------------------------------------------------
-- 19. board_webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_webhooks` (
  `id`          TEXT PRIMARY KEY NOT NULL,
  `board_id`    TEXT NOT NULL REFERENCES `boards` (`id`),
  `agent_id`    TEXT REFERENCES `agents` (`id`),
  `description` TEXT NOT NULL,
  `enabled`     INTEGER NOT NULL DEFAULT 1,
  `created_at`  TEXT NOT NULL,
  `updated_at`  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_webhooks_board_id`
  ON `board_webhooks` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_board_webhooks_agent_id`
  ON `board_webhooks` (`agent_id`);

CREATE INDEX IF NOT EXISTS `idx_board_webhooks_enabled`
  ON `board_webhooks` (`enabled`);

-- ---------------------------------------------------------------------------
-- 20. board_webhook_payloads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_webhook_payloads` (
  `id`           TEXT PRIMARY KEY NOT NULL,
  `board_id`     TEXT NOT NULL REFERENCES `boards` (`id`),
  `webhook_id`   TEXT NOT NULL REFERENCES `board_webhooks` (`id`),
  `payload`      TEXT,
  `headers`      TEXT,
  `source_ip`    TEXT,
  `content_type` TEXT,
  `received_at`  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_board_webhook_payloads_board_id`
  ON `board_webhook_payloads` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_board_webhook_payloads_webhook_id`
  ON `board_webhook_payloads` (`webhook_id`);

CREATE INDEX IF NOT EXISTS `idx_board_webhook_payloads_received_at`
  ON `board_webhook_payloads` (`received_at`);

-- ---------------------------------------------------------------------------
-- 21. activity_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_events` (
  `id`         TEXT PRIMARY KEY NOT NULL,
  `event_type` TEXT NOT NULL,
  `message`    TEXT,
  `agent_id`   TEXT REFERENCES `agents` (`id`),
  `task_id`    TEXT REFERENCES `tasks` (`id`),
  `created_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_activity_events_event_type`
  ON `activity_events` (`event_type`);

CREATE INDEX IF NOT EXISTS `idx_activity_events_agent_id`
  ON `activity_events` (`agent_id`);

CREATE INDEX IF NOT EXISTS `idx_activity_events_task_id`
  ON `activity_events` (`task_id`);

-- ---------------------------------------------------------------------------
-- 22. tags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tags` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`             TEXT NOT NULL,
  `slug`             TEXT NOT NULL,
  `color`            TEXT NOT NULL DEFAULT '9e9e9e',
  `description`      TEXT,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tags_organization_id_slug`
  ON `tags` (`organization_id`, `slug`);

CREATE INDEX IF NOT EXISTS `idx_tags_organization_id`
  ON `tags` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_tags_slug`
  ON `tags` (`slug`);

-- ---------------------------------------------------------------------------
-- 23. tag_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tag_assignments` (
  `id`         TEXT PRIMARY KEY NOT NULL,
  `task_id`    TEXT NOT NULL REFERENCES `tasks` (`id`),
  `tag_id`     TEXT NOT NULL REFERENCES `tags` (`id`),
  `created_at` TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tag_assignments_task_id_tag_id`
  ON `tag_assignments` (`task_id`, `tag_id`);

CREATE INDEX IF NOT EXISTS `idx_tag_assignments_task_id`
  ON `tag_assignments` (`task_id`);

CREATE INDEX IF NOT EXISTS `idx_tag_assignments_tag_id`
  ON `tag_assignments` (`tag_id`);

-- ---------------------------------------------------------------------------
-- 24. task_custom_field_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_custom_field_definitions` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `field_key`        TEXT NOT NULL,
  `label`            TEXT NOT NULL,
  `field_type`       TEXT NOT NULL DEFAULT 'text',
  `ui_visibility`    TEXT NOT NULL DEFAULT 'always',
  `validation_regex` TEXT,
  `description`      TEXT,
  `required`         INTEGER NOT NULL DEFAULT 0,
  `default_value`    TEXT,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_task_custom_field_definitions_org_id_field_key`
  ON `task_custom_field_definitions` (`organization_id`, `field_key`);

CREATE INDEX IF NOT EXISTS `idx_task_custom_field_definitions_organization_id`
  ON `task_custom_field_definitions` (`organization_id`);

CREATE INDEX IF NOT EXISTS `idx_task_custom_field_definitions_field_key`
  ON `task_custom_field_definitions` (`field_key`);

-- ---------------------------------------------------------------------------
-- 25. task_custom_field_values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_custom_field_values` (
  `id`                              TEXT PRIMARY KEY NOT NULL,
  `task_id`                         TEXT NOT NULL REFERENCES `tasks` (`id`),
  `task_custom_field_definition_id` TEXT NOT NULL REFERENCES `task_custom_field_definitions` (`id`),
  `value`                           TEXT,
  `created_at`                      TEXT NOT NULL,
  `updated_at`                      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_task_custom_field_values_task_id_task_custom_field_definition_id`
  ON `task_custom_field_values` (`task_id`, `task_custom_field_definition_id`);

CREATE INDEX IF NOT EXISTS `idx_task_custom_field_values_task_id`
  ON `task_custom_field_values` (`task_id`);

CREATE INDEX IF NOT EXISTS `idx_task_custom_field_values_task_custom_field_definition_id`
  ON `task_custom_field_values` (`task_custom_field_definition_id`);

-- ---------------------------------------------------------------------------
-- 26. board_task_custom_fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `board_task_custom_fields` (
  `id`                              TEXT PRIMARY KEY NOT NULL,
  `board_id`                        TEXT NOT NULL REFERENCES `boards` (`id`),
  `task_custom_field_definition_id` TEXT NOT NULL REFERENCES `task_custom_field_definitions` (`id`),
  `created_at`                      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_board_task_custom_fields_board_id_task_custom_field_definition_id`
  ON `board_task_custom_fields` (`board_id`, `task_custom_field_definition_id`);

CREATE INDEX IF NOT EXISTS `idx_board_task_custom_fields_board_id`
  ON `board_task_custom_fields` (`board_id`);

CREATE INDEX IF NOT EXISTS `idx_board_task_custom_fields_task_custom_field_definition_id`
  ON `board_task_custom_fields` (`task_custom_field_definition_id`);

-- ---------------------------------------------------------------------------
-- 27. marketplace_skills
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `marketplace_skills` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`             TEXT NOT NULL,
  `description`      TEXT,
  `category`         TEXT,
  `risk`             TEXT,
  `source`           TEXT,
  `source_url`       TEXT NOT NULL,
  `metadata`         TEXT NOT NULL,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_marketplace_skills_org_source_url`
  ON `marketplace_skills` (`organization_id`, `source_url`);

CREATE INDEX IF NOT EXISTS `idx_marketplace_skills_organization_id`
  ON `marketplace_skills` (`organization_id`);

-- ---------------------------------------------------------------------------
-- 28. skill_packs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `skill_packs` (
  `id`               TEXT PRIMARY KEY NOT NULL,
  `organization_id`  TEXT NOT NULL REFERENCES `organizations` (`id`),
  `name`             TEXT NOT NULL,
  `description`      TEXT,
  `source_url`       TEXT NOT NULL,
  `branch`           TEXT NOT NULL DEFAULT 'main',
  `metadata`         TEXT NOT NULL,
  `created_at`       TEXT NOT NULL,
  `updated_at`       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_skill_packs_org_source_url`
  ON `skill_packs` (`organization_id`, `source_url`);

CREATE INDEX IF NOT EXISTS `idx_skill_packs_organization_id`
  ON `skill_packs` (`organization_id`);

-- ---------------------------------------------------------------------------
-- 29. gateway_installed_skills
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gateway_installed_skills` (
  `id`         TEXT PRIMARY KEY NOT NULL,
  `gateway_id` TEXT NOT NULL REFERENCES `gateways` (`id`),
  `skill_id`   TEXT NOT NULL REFERENCES `marketplace_skills` (`id`),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_gateway_installed_skills_gateway_id_skill_id`
  ON `gateway_installed_skills` (`gateway_id`, `skill_id`);

CREATE INDEX IF NOT EXISTS `idx_gateway_installed_skills_gateway_id`
  ON `gateway_installed_skills` (`gateway_id`);

CREATE INDEX IF NOT EXISTS `idx_gateway_installed_skills_skill_id`
  ON `gateway_installed_skills` (`skill_id`);
