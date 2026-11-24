import { renameProjectInput } from "@truframe/protocol";
import { json, notFound, readJson, withWorkspace } from "@/lib/server/api";
import { deleteProject, parseProjectId, renameProject, toDto } from "@/lib/server/projects";

export const dynamic = "force-dynamic";
type Params = { projectId: string };

export const GET = withWorkspace<Params>(async (ctx, _request, { projectId }) => {
  const project = await ctx.repos.projects.get(parseProjectId(projectId));
  if (!project) throw notFound();
  return json({ project: toDto(project) });
});

/** Rename. */
export const PATCH = withWorkspace<Params>(async (ctx, request, { projectId }) => {
  const { name } = renameProjectInput.parse(await readJson(request));
  return json({ project: toDto(await renameProject(ctx, projectId, name)) });
});

/** Soft delete (restorable for 30 days). */
export const DELETE = withWorkspace<Params>(async (ctx, _request, { projectId }) => {
  return json({ project: toDto(await deleteProject(ctx, projectId)) });
});
