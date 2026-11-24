import { json, withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { issueRoomToken } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

/** A short-lived token to open the project's realtime room (`new WebSocket(url, ["truframe.v1", token])`). */
export const POST = withWorkspace<{ projectId: string }>(async (ctx, _request, { projectId }) => {
  const { env } = await getServerContext();
  return json(await issueRoomToken(ctx, env as unknown as Record<string, unknown>, projectId));
});
