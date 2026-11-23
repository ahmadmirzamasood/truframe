import { and, count, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../client.ts";
import { uuidv7 } from "../ids.ts";
import { type Framework, projects } from "../schema/index.ts";

export type Project = typeof projects.$inferSelect;

/** How long a soft-deleted project can be restored. */
export const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Project queries for one workspace. Every statement filters on `workspaceId`. */
export function projectsRepo(db: Db, workspaceId: string) {
  const inWorkspace = (projectId: string) =>
    and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId));

  return {
    async list(): Promise<Project[]> {
      return db
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)))
        .orderBy(desc(projects.updatedAt));
    },

    /** Soft-deleted projects that can still be restored. */
    async listTrash(now: Date = new Date()): Promise<Project[]> {
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            isNotNull(projects.deletedAt),
            gte(projects.deletedAt, new Date(now.getTime() - RESTORE_WINDOW_MS)),
          ),
        )
        .orderBy(desc(projects.deletedAt));
    },

    /** An active project of this workspace, or null (also null for other workspaces' ids). */
    async get(projectId: string): Promise<Project | null> {
      const rows = await db
        .select()
        .from(projects)
        .where(and(inWorkspace(projectId), isNull(projects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },

    async countActive(): Promise<number> {
      const rows = await db
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)));
      return rows[0]?.n ?? 0;
    },

    async create(input: {
      name: string;
      framework: Framework;
      templateId: string;
      createdBy: string;
      now?: Date;
    }): Promise<Project> {
      const now = input.now ?? new Date();
      const project: Project = {
        id: uuidv7(now.getTime()),
        workspaceId,
        name: input.name,
        framework: input.framework,
        templateId: input.templateId,
        thumbnail: null,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await db.insert(projects).values(project);
      return project;
    },

    async rename(projectId: string, name: string, now: Date = new Date()): Promise<Project | null> {
      const rows = await db
        .update(projects)
        .set({ name, updatedAt: now })
        .where(and(inWorkspace(projectId), isNull(projects.deletedAt)))
        .returning();
      return rows[0] ?? null;
    },

    /** Copies the project row (framework and template). Document content is copied in P2. */
    async duplicate(
      projectId: string,
      input: { name: string; createdBy: string; now?: Date },
    ): Promise<Project | null> {
      const source = await this.get(projectId);
      if (!source) return null;
      return this.create({
        name: input.name,
        framework: source.framework,
        templateId: source.templateId,
        createdBy: input.createdBy,
        now: input.now,
      });
    },

    async softDelete(projectId: string, now: Date = new Date()): Promise<Project | null> {
      const rows = await db
        .update(projects)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inWorkspace(projectId), isNull(projects.deletedAt)))
        .returning();
      return rows[0] ?? null;
    },

    /** Restores a project deleted less than 30 days ago; null if not found or too old. */
    async restore(projectId: string, now: Date = new Date()): Promise<Project | null> {
      const rows = await db
        .update(projects)
        .set({ deletedAt: null, updatedAt: now })
        .where(
          and(
            inWorkspace(projectId),
            isNotNull(projects.deletedAt),
            gte(projects.deletedAt, new Date(now.getTime() - RESTORE_WINDOW_MS)),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
  };
}
