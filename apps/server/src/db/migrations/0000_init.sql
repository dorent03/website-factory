CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`customer_id` text,
	`website_id` text,
	`agent` text NOT NULL,
	`requested_agent` text NOT NULL,
	`fallback_used` integer DEFAULT false NOT NULL,
	`role` text NOT NULL,
	`objective` text NOT NULL,
	`context` text,
	`allowed_paths` text NOT NULL,
	`input_artifacts` text NOT NULL,
	`expected_output` text NOT NULL,
	`timeout_ms` integer NOT NULL,
	`write` integer NOT NULL,
	`status` text NOT NULL,
	`exit_code` integer,
	`duration_ms` integer,
	`error` text DEFAULT '' NOT NULL,
	`error_kind` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`stdout_tail` text DEFAULT '' NOT NULL,
	`stderr_tail` text DEFAULT '' NOT NULL,
	`output` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `tasks_job` ON `agent_tasks` (`job_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`health` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`website_id` text,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`license` text DEFAULT '' NOT NULL,
	`local_path` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`review_status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`role` text NOT NULL,
	`agent` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`job_id` text,
	`annotations` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `consent_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`test_results` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customer_legal_profiles` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`marketing` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_slug_unique` ON `customers` (`slug`);--> statement-breakpoint
CREATE TABLE `design_systems` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`contrast` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`customer_id` text,
	`website_id` text,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`steps` text NOT NULL,
	`input` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`website_version` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`website_version` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`inventory_version` integer NOT NULL,
	`content` text NOT NULL,
	`manual_edits` integer DEFAULT false NOT NULL,
	`review_status` text NOT NULL,
	`generated_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `privacy_inventories` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`version` integer NOT NULL,
	`website_version` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `privacy_services` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`website_id` text NOT NULL,
	`service_key` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `privacy_inventories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `qa_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`website_version` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`providers` text NOT NULL,
	`summary` text,
	`error` text DEFAULT '' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`provider` text NOT NULL,
	`retrieved_at` text NOT NULL,
	`confidence` real NOT NULL,
	`status` text NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_customer` ON `research_sources` (`customer_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `website_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`number` integer NOT NULL,
	`label` text NOT NULL,
	`dir_name` text NOT NULL,
	`git_commit` text NOT NULL,
	`agent` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`task_id` text,
	`prompt` text NOT NULL,
	`files_changed` text NOT NULL,
	`impact` text,
	`qa_state` text NOT NULL,
	`legal_state` text NOT NULL,
	`restored_from` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_site_number` ON `website_versions` (`website_id`,`number`);--> statement-breakpoint
CREATE TABLE `websites` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`site_type` text NOT NULL,
	`status` text NOT NULL,
	`generator` text DEFAULT 'static-html' NOT NULL,
	`functionality` text NOT NULL,
	`hosting` text NOT NULL,
	`brief` text,
	`brief_approved` integer DEFAULT false NOT NULL,
	`concepts` text,
	`concept_review` text,
	`selected_concept` text,
	`current_version` text,
	`gate` text,
	`staleness` text NOT NULL,
	`imported` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `websites_customer_slug` ON `websites` (`customer_id`,`slug`);