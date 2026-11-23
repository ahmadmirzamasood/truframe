import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { uuidv7 } from "../ids.ts";
import { type MemberRole, workspaceMembers, workspaces } from "../schema/index.ts";

export type Workspace = typeof workspaces.$inferSelect;
export type Membership = { workspace: Workspace; role: MemberRole };

/**
 * Workspace lookups keyed by the signed-in user. This is how a request finds its workspace
 * context; everything below a workspace goes through `forWorkspace()` repos.
 */
export function workspacesRepo(db: Db) {
  return {
    /** Idempotent: returns the existing personal workspace if the user already has one. */
    async ensurePersonal(input: { userId: string; name: string; now?: Date }): Promise<Workspace> {
      const existing = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.ownerUserId, input.userId), eq(workspaces.personal, true)))
        .limit(1);
      if (existing[0]) return existing[0];
      const now = input.now ?? new Date();
      const workspace: Workspace = {
        id: uuidv7(now.getTime()),
        name: input.name,
        personal: true,
        ownerUserId: input.userId,
        createdAt: now,
      };
      await db.batch([
        db.insert(workspaces).values(workspace),
        db.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: input.userId,
          role: "owner",
          createdAt: now,
        }),
      ]);
      return workspace;
    },

    async listForUser(userId: string): Promise<Membership[]> {
      const rows = await db
        .select({ workspace: workspaces, role: workspaceMembers.role })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, userId))
        .orderBy(asc(workspaces.personal), asc(workspaces.createdAt));
      // Personal workspace first.
      return rows.sort((a, b) => Number(b.workspace.personal) - Number(a.workspace.personal));
    },

    /** The user's membership in one workspace, or null when they are not a member. */
    async membership(userId: string, workspaceId: string): Promise<Membership | null> {
      const rows = await db
        .select({ workspace: workspaces, role: workspaceMembers.role })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
