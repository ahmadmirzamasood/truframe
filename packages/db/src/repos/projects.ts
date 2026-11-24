import { and, count, desc, eq, gte, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { uuidv7 } from "../ids.ts";
import { type Framework, projects } from "../schema/index.ts";

export type Project = typeof projects.$inferSelect;

/** How long a soft-deleted project can be restored. */
export const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Returned instead of a project when a plan limit (`maxActive`) would be exceeded. */
export const LIMIT_REACHED = { limitReached: true } as const;
export type LimitReached = typeof LIMIT_REACHED;

type NewProject = {
  name: string;
  framework: Framework;
  templateId: string;
  createdBy: string;
  now?: Date;
};

/** Project queries for one workspace. Every statement filters on `workspaceId`. */
export function projectsRepo(db: Db, workspaceId: string) {
  const inWorkspace = (projectId: string) =>
    and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId));

  const newProject = (input: NewProject): Project => {
    const now = input.now ?? new Date();
    return {
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
  };

  /** True while the workspace has fewer than `max` active projects; evaluated inside the write. */
  const underLimit = (max: number): SQL =>
    sql`(select count(*) from ${projects} p where p.workspace_id = ${workspaceId} and p.deleted_at is null) < ${max}`;

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

    /** Creates a project with no plan check (internal use and tests). */
    async create(input: NewProject): Promise<Project> {
      const project = newProject(input);
      await db.insert(projects).values(project);
      return project;
    },

    /**
     * Creates a project unless the workspace already has `maxActive` active projects. The
     * count check and the insert are one SQL statement, so concurrent requests can't race past
     * the limit.
     */
    async createWithinLimit(input: NewProject, maxActive: number): Promise<Project | LimitReached> {
      if (!Number.isFinite(maxActive)) return this.create(input);
      const project = newProject(input);
      const t = project.createdAt.getTime();
      const result = await db.run(sql`
        insert into ${projects} (id, workspace_id, name, framework, template_id, thumbnail, created_by, created_at, updated_at, deleted_at)
        select ${project.id}, ${workspaceId}, ${project.name}, ${project.framework}, ${project.templateId}, null, ${project.createdBy}, ${t}, ${t}, null
        where ${underLimit(maxActive)}`);
      return result.meta.changes === 1 ? project : LIMIT_REACHED;
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
      input: { name: string; createdBy: string; now?: Date; maxActive?: number },
    ): Promise<Project | LimitReached | null> {
      const source = await this.get(projectId);
      if (!source) return null;
      const copy = {
        name: input.name,
        framework: source.framework,
        templateId: source.templateId,
        createdBy: input.createdBy,
        now: input.now,
      };
      return input.maxActive === undefined
        ? this.create(copy)
        : this.createWithinLimit(copy, input.maxActive);
    },

    async softDelete(projectId: string, now: Date = new Date()): Promise<Project | null> {
      const rows = await db
        .update(projects)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(inWorkspace(projectId), isNull(projects.deletedAt)))
        .returning();
      return rows[0] ?? null;
    },

    /**
     * Restores a project deleted less than 30 days ago. Null if not found or too old;
     * `LIMIT_REACHED` if restoring would exceed `maxActive` (checked inside the update).
     */
    async restore(
      projectId: string,
      now: Date = new Date(),
      maxActive?: number,
    ): Promise<Project | LimitReached | null> {
      const restorable = and(
        inWorkspace(projectId),
        isNotNull(projects.deletedAt),
        gte(projects.deletedAt, new Date(now.getTime() - RESTORE_WINDOW_MS)),
      );
      const limited = maxActive !== undefined && Number.isFinite(maxActive);
      const rows = await db
        .update(projects)
        .set({ deletedAt: null, updatedAt: now })
        .where(limited ? and(restorable, underLimit(maxActive)) : restorable)
        .returning();
      if (rows[0]) return rows[0];
      if (!limited) return null;
      const stillThere = await db
        .select({ id: projects.id })
        .from(projects)
        .where(restorable)
        .limit(1);
      return stillThere.length ? LIMIT_REACHED : null;
    },
  };
}
