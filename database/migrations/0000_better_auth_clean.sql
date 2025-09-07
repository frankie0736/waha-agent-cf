CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`aihubmix_key` text,
	`kb_limit` integer DEFAULT 5 NOT NULL,
	`agent_limit` integer DEFAULT 3 NOT NULL,
	`wa_limit` integer DEFAULT 2 NOT NULL,
	`last_active_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`timezone` text,
	`city` text,
	`country` text,
	`region` text,
	`region_code` text,
	`colo` text,
	`latitude` text,
	`longitude` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kb_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`kb_id` text NOT NULL,
	`doc_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`vector_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kb_id` text NOT NULL,
	`filename` text NOT NULL,
	`filetype` text NOT NULL,
	`filesize` integer NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `kb_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `agent_kb_links` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`kb_id` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`prompt_system` text NOT NULL,
	`model` text DEFAULT 'gpt-3.5-turbo' NOT NULL,
	`temperature` real DEFAULT 0.7 NOT NULL,
	`max_tokens` integer DEFAULT 1000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`wa_account_id` text NOT NULL,
	`chat_key` text NOT NULL,
	`last_turn` integer DEFAULT 0 NOT NULL,
	`auto_reply_state` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_chat_key_unique` ON `conversations` (`chat_key`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_key` text NOT NULL,
	`turn` integer NOT NULL,
	`stage` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	`result` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_key` text NOT NULL,
	`turn` integer NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wa_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wa_account_id` text NOT NULL,
	`agent_id` text,
	`waha_api_url` text NOT NULL,
	`waha_api_key` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`qr_code` text,
	`status` text DEFAULT 'connecting' NOT NULL,
	`auto_reply_state` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wa_sessions_wa_account_id_unique` ON `wa_sessions` (`wa_account_id`);