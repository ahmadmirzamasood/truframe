import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth.ts";

export const FRAMEWORKS = ["nextjs", "astro"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const MEMBER_ROLES = ["owner", "editor"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** A user's own workspace, created on signup. Teams are Later. */
  personal: integer("personal", { mode: "boolean" }).notNull().default(false),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_id_idx").on(t.userId),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    framework: text("framework", { enum: FRAMEWORKS }).notNull(),
    templateId: text("template_id").notNull(),
    /** R2 key of the dashboard thumbnail; null until thumbnails are rendered. */
    thumbnail: text("thumbnail"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    /** Soft delete: restorable for 30 days, then purged. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("projects_workspace_id_idx").on(t.workspaceId, t.deletedAt)],
);

/** Usage counters per workspace, billing period (e.g. `2026-11` or `all`) and metric. */
export const usage = sqliteTable(
  "usage",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.period, t.metric] })],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** Small JSON object; never tokens, prompts or code. */
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("audit_log_workspace_id_idx").on(t.workspaceId, t.createdAt)],
);

/**
 * Document revisions (ARCHITECTURE §7): a Loro version of a project's document plus who changed
 * it. ProjectRoom records one per compaction, grouping the changes since the previous one.
 */
export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Loro frontiers (`[{ peer, counter }]`) to check the document out at this revision. */
    frontiers: text("frontiers", { mode: "json" })
      .notNull()
      .$type<{ peer: string; counter: number }[]>(),
    /** R2 key of the snapshot taken with this revision, relative to the workspace prefix. */
    snapshotKey: text("snapshot_key"),
    authorKind: text("author_kind", { enum: ["user", "agent"] }).notNull(),
    /** User ids whose transactions this revision groups. */
    authorIds: text("author_ids", { mode: "json" }).notNull().$type<string[]>(),
    changeCount: integer("change_count").notNull(),
    summary: text("summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("revisions_project_id_idx").on(t.projectId, t.createdAt)],
);
