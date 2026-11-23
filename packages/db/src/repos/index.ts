import type { Db } from "../client.ts";
import { auditRepo } from "./audit.ts";
import { projectsRepo } from "./projects.ts";
import { usageRepo } from "./usage.ts";
import { workspacesRepo } from "./workspaces.ts";

export type { AuditEntry } from "./audit.ts";
export { type Project, RESTORE_WINDOW_MS } from "./projects.ts";
export type { Membership, Workspace } from "./workspaces.ts";

/**
 * Repositories scoped to one workspace. The only way to reach workspace data: callers must
 * first resolve `workspaceId` from the session (membership check), then call this.
 */
export function forWorkspace(db: Db, workspaceId: string) {
  if (!workspaceId) throw new Error("forWorkspace: workspaceId is required");
  return {
    workspaceId,
    projects: projectsRepo(db, workspaceId),
    usage: usageRepo(db, workspaceId),
    audit: auditRepo(db, workspaceId),
  };
}

export type WorkspaceRepos = ReturnType<typeof forWorkspace>;

export { workspacesRepo };
