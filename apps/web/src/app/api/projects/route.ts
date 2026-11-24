import { createProjectInput } from "@truframe/protocol";
import { json, readJson, withWorkspace } from "@/lib/server/api";
import { createProject, toDto } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** GET: active projects (or `?trash=1` for restorable deleted ones) of the caller's workspace. */
export const GET = withWorkspace(async (ctx, request) => {
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const projects = trash ? await ctx.repos.projects.listTrash() : await ctx.repos.projects.list();
  return json({ workspaceId: ctx.workspace.id, projects: projects.map(toDto) });
});

export const POST = withWorkspace(async (ctx, request) => {
  const input = createProjectInput.parse(await readJson(request));
  return json({ project: toDto(await createProject(ctx, input)) }, 201);
});
