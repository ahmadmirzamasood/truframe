CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`frontiers` text NOT NULL,
	`snapshot_key` text,
	`author_kind` text NOT NULL,
	`author_ids` text NOT NULL,
	`change_count` integer NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `revisions_project_id_idx` ON `revisions` (`project_id`,`created_at`);