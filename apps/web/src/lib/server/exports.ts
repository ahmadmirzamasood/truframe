import "server-only";
/**
 * Image export (PRD F29 "Export"). The plan's largest scale is checked here, before any
 * rendering starts. Rendering is the export job (ARCHITECTURE "Image export": Browser Run opens
 * the page's preview at the breakpoint width and screenshots it), which needs the preview
 * renderer (P5-7) and the export worker (P9-7). Until both exist the request stops with
 * `EXPORT_UNAVAILABLE`, after the same checks the real job will use.
 */
import type { WorkspaceContext } from "@truframe/auth";
import { limitFor, planForWorkspace } from "@truframe/billing";
import type { ImageExportInput, ImageExportLimitsDto, ImageExportResult } from "@truframe/protocol";
import { ApiFailure, notFound } from "./api";
import { parseProjectId } from "./projects";

export function imageExportLimits(ctx: WorkspaceContext): ImageExportLimitsDto {
  return { maxScale: limitFor(planForWorkspace(ctx.workspace), "imageExportMaxScale") };
}

export async function requestImageExport(
  ctx: WorkspaceContext,
  projectId: string,
  input: ImageExportInput,
): Promise<ImageExportResult> {
  const project = await ctx.repos.projects.get(parseProjectId(projectId));
  if (!project) throw notFound();
  const { maxScale } = imageExportLimits(ctx);
  if (input.scale > maxScale)
    throw new ApiFailure(
      "LIMIT_REACHED",
      `Your plan exports images up to ${maxScale}×. Upgrade to export at ${input.scale}×.`,
      403,
      { plan: planForWorkspace(ctx.workspace), limit: "imageExportMaxScale", max: maxScale },
    );
  throw new ApiFailure(
    "EXPORT_UNAVAILABLE",
    "Image export isn't available yet. It arrives with page previews and the export service.",
    501,
  );
}
