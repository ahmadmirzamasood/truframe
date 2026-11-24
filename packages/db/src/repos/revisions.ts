import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { uuidv7 } from "../ids.ts";
import { projects, revisions } from "../schema/index.ts";

export type Revision = typeof revisions.$inferSelect;

export type NewRevision = Omit<Revision, "id" | "workspaceId" | "createdAt"> & { now?: Date };

/** Revision rows for one workspace's projects. */
export function revisionsRepo(db: Db, workspaceId: string) {
  return {
    /** Records a revision; returns null if the project is not in this workspace. */
    async record(input: NewRevision): Promise<Revision | null> {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, input.projectId)));
      if (!project) return null;
      const now = input.now ?? new Date();
      const row: Revision = {
        id: uuidv7(now.getTime()),
        workspaceId,
        projectId: input.projectId,
        frontiers: input.frontiers,
        snapshotKey: input.snapshotKey,
        authorKind: input.authorKind,
        authorIds: input.authorIds,
        changeCount: input.changeCount,
        summary: input.summary,
        createdAt: now,
      };
      await db.insert(revisions).values(row);
      return row;
    },

    /** Newest first. */
    async list(projectId: string, limit = 50): Promise<Revision[]> {
      return db
        .select()
        .from(revisions)
        .where(and(eq(revisions.workspaceId, workspaceId), eq(revisions.projectId, projectId)))
        .orderBy(desc(revisions.createdAt), desc(revisions.id))
        .limit(limit);
    },
  };
}
