import { imageExportInput } from "@truframe/protocol";
import { json, notFound, readJson, withWorkspace } from "@/lib/server/api";
import { imageExportLimits, requestImageExport } from "@/lib/server/exports";
import { parseProjectId } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** The largest export scale the workspace's plan allows. */
export const GET = withWorkspace<{ projectId: string }>(async (ctx, _request, { projectId }) => {
  if (!(await ctx.repos.projects.get(parseProjectId(projectId)))) throw notFound();
  return json({ limits: imageExportLimits(ctx) });
});

/** Exports a page as an image at one breakpoint, format and scale. */
export const POST = withWorkspace<{ projectId: string }>(async (ctx, request, { projectId }) => {
  const input = imageExportInput.parse(await readJson(request));
  return json(await requestImageExport(ctx, projectId, input), 201);
});
