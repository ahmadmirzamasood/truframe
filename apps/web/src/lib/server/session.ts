import "server-only";
import { resolveWorkspace, WorkspaceAccessError, type WorkspaceContext } from "@truframe/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getServerContext } from "./context";

export const getSession = cache(async () => {
  const { auth } = await getServerContext();
  return auth.api.getSession({ headers: await headers() });
});

/** For pages that need a signed-in user; sends everyone else to sign-in. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/**
 * Session → workspace context for pages: signed-in user, their workspace (personal unless
 * `workspaceId` is given and they are a member) and repos bound to it. Non-members get 404.
 */
export async function requireWorkspace(workspaceId?: string | null): Promise<WorkspaceContext> {
  const session = await requireSession();
  const { db } = await getServerContext();
  try {
    return await resolveWorkspace(db, session.user, workspaceId);
  } catch (e) {
    if (e instanceof WorkspaceAccessError) notFound();
    throw e;
  }
}
