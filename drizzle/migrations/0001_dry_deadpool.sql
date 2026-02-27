ALTER TABLE `gateways` ADD `device_token` text;--> statement-breakpoint
ALTER TABLE `gateways` ADD `device_token_granted_at` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `session_status` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `session_last_activity_at` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `session_synced_at` text;
