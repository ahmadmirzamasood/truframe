import "server-only";
import type { WorkspaceContext } from "@truframe/auth";
import { LimitError, limitFor, planForWorkspace } from "@truframe/billing";
import { LIMIT_REACHED, type LimitReached, type Project } from "@truframe/db";
import {
  type CreateProjectInput,
  type ProjectDto,
  projectIdSchema,
  RESTORE_WINDOW_DAYS,
} from "@truframe/protocol";
import { ApiFailure, notFound } from "./api";

/** The caller's plan limit on active projects (Free: 3). */
function maxProjects(ctx: WorkspaceContext): number {
  return limitFor(planForWorkspace(ctx.workspace), "projects");
}

/** Turns the repo's LIMIT_REACHED into the typed API error (403 LIMIT_REACHED). */
function withinLimit<T extends Project | null>(ctx: WorkspaceContext, result: T | LimitReached): T {
  if (result === LIMIT_REACHED) {
    const plan = planForWorkspace(ctx.workspace);
    const limit = limitFor(plan, "projects");
    const e = new LimitError(plan, "projects", limit, limit);
    throw new ApiFailure("LIMIT_REACHED", e.message, 403, { plan, limit: "projects", max: limit });
  }
  return result as T;
}

export function toDto(p: Project): ProjectDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    framework: p.framework,
    templateId: p.templateId,
    thumbnail: p.thumbnail,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString() ?? null,
  };
}

export function isProjectId(id: string): boolean {
  return projectIdSchema.safeParse(id).success;
}

/** Ids that aren't UUIDs can't exist; answer 404 without a query. */
export function parseProjectId(id: string): string {
  const parsed = projectIdSchema.safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

export async function createProject(ctx: WorkspaceContext, input: CreateProjectInput) {
  const project = withinLimit(
    ctx,
    await ctx.repos.projects.createWithinLimit(
      { ...input, createdBy: ctx.user.id },
      maxProjects(ctx),
    ),
  );
  await ctx.repos.audit.record({
    actorUserId: ctx.user.id,
    action: "project.create",
    targetType: "project",
    targetId: project.id,
    meta: { framework: project.framework, templateId: project.templateId },
  });
  return project;
}

export async function renameProject(ctx: WorkspaceContext, id: string, name: string) {
  const project = await ctx.repos.projects.rename(parseProjectId(id), name);
  if (!project) throw notFound();
  return project;
}

export async function duplicateProject(ctx: WorkspaceContext, id: string, name?: string) {
  const projectId = parseProjectId(id);
  const source = await ctx.repos.projects.get(projectId);
  if (!source) throw notFound();
  const copyName = name ?? `${source.name} copy`.slice(0, 80);
  const copy = withinLimit(
    ctx,
    await ctx.repos.projects.duplicate(projectId, {
      name: copyName,
      createdBy: ctx.user.id,
      maxActive: maxProjects(ctx),
    }),
  );
  if (!copy) throw notFound();
  await ctx.repos.audit.record({
    actorUserId: ctx.user.id,
    action: "project.duplicate",
    targetType: "project",
    targetId: copy.id,
    meta: { from: projectId },
  });
  return copy;
}

export async function deleteProject(ctx: WorkspaceContext, id: string) {
  const project = await ctx.repos.projects.softDelete(parseProjectId(id));
  if (!project) throw notFound();
  await ctx.repos.audit.record({
    actorUserId: ctx.user.id,
    action: "project.delete",
    targetType: "project",
    targetId: project.id,
  });
  return project;
}

export async function restoreProject(ctx: WorkspaceContext, id: string) {
  const project = withinLimit(
    ctx,
    await ctx.repos.projects.restore(parseProjectId(id), new Date(), maxProjects(ctx)),
  );
  if (!project) {
    throw new ApiFailure(
      "RESTORE_EXPIRED",
      `This project can't be restored. Deleted projects can be restored for ${RESTORE_WINDOW_DAYS} days.`,
      404,
    );
  }
  await ctx.repos.audit.record({
    actorUserId: ctx.user.id,
    action: "project.restore",
    targetType: "project",
    targetId: project.id,
  });
  return project;
}
