import { duplicateProjectInput } from "@truframe/protocol";
import { json, readJson, withWorkspace } from "@/lib/server/api";
import { duplicateProject, toDto } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export const POST = withWorkspace<{ projectId: string }>(async (ctx, request, { projectId }) => {
  const { name } = duplicateProjectInput.parse(await readJson(request));
  return json({ project: toDto(await duplicateProject(ctx, projectId, name)) }, 201);
});
