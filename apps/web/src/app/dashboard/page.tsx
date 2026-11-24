import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/auth-forms";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";
import { ProjectCard, TrashRow } from "@/components/dashboard/projects";
import { toDto } from "@/lib/server/projects";
import { requireWorkspace } from "@/lib/server/session";

// Session-dependent: never prerender at build time (it would open the local D1 from several
// build workers at once and fail with SQLITE_BUSY).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard · Truframe" };

export default async function DashboardPage() {
  const { user, workspace, repos } = await requireWorkspace();
  const [projects, trash] = await Promise.all([repos.projects.list(), repos.projects.listTrash()]);
  const now = Date.now();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Truframe</span>
          <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
            {workspace.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="signed-in-email" className="truncate">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>

      <section aria-labelledby="projects-heading" className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h1 id="projects-heading" className="text-2xl font-semibold tracking-tight">
            Projects
          </h1>
          <NewProjectDialog />
        </div>
        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No projects yet. Create one to start designing.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Projects">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={toDto(p)} />
            ))}
          </ul>
        )}
      </section>

      {trash.length > 0 ? (
        <section aria-labelledby="trash-heading" className="grid gap-2">
          <h2 id="trash-heading" className="text-sm font-medium text-muted-foreground">
            Recently deleted
          </h2>
          <ul className="divide-y rounded-xl border px-4" aria-label="Recently deleted">
            {trash.map((p) => (
              <TrashRow key={p.id} project={toDto(p)} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
