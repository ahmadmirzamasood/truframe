import { json, withWorkspace } from "@/lib/server/api";
import { restoreProject, toDto } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export const POST = withWorkspace<{ projectId: string }>(async (ctx, _request, { projectId }) => {
  return json({ project: toDto(await restoreProject(ctx, projectId)) });
});
