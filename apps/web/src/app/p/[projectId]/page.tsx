import { codeAccess, planForWorkspace } from "@truframe/billing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectEditor } from "@/components/editor/project-editor";
import { getServerContext } from "@/lib/server/context";
import { previewOrigin } from "@/lib/server/preview";
import { isProjectId } from "@/lib/server/projects";
import { requireWorkspace } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Editor · Truframe" };

export default async function EditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) notFound();
  const { repos, workspace } = await requireWorkspace();
  const project = await repos.projects.get(projectId);
  if (!project) notFound();
  return (
    <ProjectEditor
      projectId={project.id}
      projectName={project.name}
      previewOrigin={previewOrigin(await getServerContext())}
      codeAccess={codeAccess(planForWorkspace(workspace))}
    />
  );
}
