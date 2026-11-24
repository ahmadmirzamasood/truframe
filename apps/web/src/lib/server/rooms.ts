import "server-only";
import type { WorkspaceContext } from "@truframe/auth";
import { planForWorkspace } from "@truframe/billing";
import { roomClaimsSchema, signRoomToken } from "@truframe/protocol";
import { z } from "zod";
import { ApiFailure, notFound } from "./api";
import { parseProjectId } from "./projects";

const roomEnvSchema = z.object({
  TRUFRAME_ENV: z.enum(["local", "staging", "production"]),
  ROOM_TOKEN_SECRET: z.string().min(32),
  TRUFRAME_REALTIME_URL: z.url(),
});

/** The realtime config, or a typed 500 that never echoes the values. */
function roomEnv(env: Record<string, unknown>) {
  const parsed = roomEnvSchema.safeParse(env);
  const ok =
    parsed.success &&
    (parsed.data.TRUFRAME_ENV === "local" ||
      parsed.data.TRUFRAME_REALTIME_URL.startsWith("wss://"));
  if (!ok || !parsed.success) {
    throw new ApiFailure("INTERNAL", "Live editing isn't configured on this server.", 500);
  }
  return parsed.data;
}

/**
 * Issues a 5-minute room token for a project the caller's workspace owns (ARCHITECTURE §7).
 * Unknown, deleted and other workspaces' projects are all 404.
 */
export async function issueRoomToken(
  ctx: WorkspaceContext,
  env: Record<string, unknown>,
  id: string,
) {
  const config = roomEnv(env);
  const project = await ctx.repos.projects.get(parseProjectId(id));
  if (!project) throw notFound();
  const templateId = roomClaimsSchema.shape.templateId.safeParse(project.templateId);
  const { token, expiresAt } = await signRoomToken(
    {
      sub: ctx.user.id,
      ws: ctx.workspace.id,
      pid: project.id,
      role: ctx.role,
      plan: planForWorkspace(ctx.workspace),
      framework: project.framework,
      templateId: templateId.success ? templateId.data : "blank",
    },
    config.ROOM_TOKEN_SECRET,
  );
  return {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    url: new URL(`/rooms/${project.id}`, config.TRUFRAME_REALTIME_URL).toString(),
  };
}
