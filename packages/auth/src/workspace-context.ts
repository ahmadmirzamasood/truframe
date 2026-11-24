import {
  type Db,
  forWorkspace,
  type MemberRole,
  type Workspace,
  type WorkspaceRepos,
  workspacesRepo,
} from "@truframe/db";
import { PERSONAL_WORKSPACE_NAME } from "./auth.ts";

export type SessionUser = { id: string; email: string; name: string };

export type WorkspaceContext = {
  user: SessionUser;
  workspace: Workspace;
  role: MemberRole;
  /** Repos bound to this workspace: the only way request code reaches workspace data. */
  repos: WorkspaceRepos;
};

export class WorkspaceAccessError extends Error {
  constructor() {
    super("You don't have access to this workspace.");
  }
}

/**
 * Turns a signed-in user into a workspace context. With no `workspaceId`, uses the personal
 * workspace (created here if the signup hook never ran). With one, the user must be a member;
 * otherwise `WorkspaceAccessError` (callers answer 404, not 403, to avoid leaking ids).
 */
export async function resolveWorkspace(
  db: Db,
  user: SessionUser,
  workspaceId?: string | null,
): Promise<WorkspaceContext> {
  const workspaces = workspacesRepo(db);
  if (workspaceId) {
    const membership = await workspaces.membership(user.id, workspaceId);
    if (!membership) throw new WorkspaceAccessError();
    return { user, ...membership, repos: forWorkspace(db, membership.workspace.id) };
  }
  const memberships = await workspaces.listForUser(user.id);
  const personal = memberships.find((m) => m.workspace.personal);
  if (personal) return { user, ...personal, repos: forWorkspace(db, personal.workspace.id) };
  const workspace = await workspaces.ensurePersonal({
    userId: user.id,
    name: PERSONAL_WORKSPACE_NAME,
  });
  return { user, workspace, role: "owner", repos: forWorkspace(db, workspace.id) };
}
