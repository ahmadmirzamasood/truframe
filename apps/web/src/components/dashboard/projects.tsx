"use client";

import { TEMPLATES } from "@truframe/model";
import type { FrameworkId, ProjectDto } from "@truframe/protocol";
import { RESTORE_WINDOW_DAYS } from "@truframe/protocol";
import { Button } from "@truframe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@truframe/ui/components/dialog";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiRequestError, projectsApi } from "@/lib/api-client";

export const FRAMEWORK_LABEL: Record<FrameworkId, string> = { nextjs: "Next.js", astro: "Astro" };

/** Runs a mutation, shows its error, refreshes server data on success. */
export function useMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Something went wrong. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const templateName = (id: string) => TEMPLATES.find((t) => t.id === id)?.name ?? "Custom";

function RenameDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pending, error, run } = useMutation();
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    if (await run(() => projectsApi.rename(project.id, name))) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>The name is only shown in Truframe.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`rename-${project.id}`}>Name</Label>
            <Input
              id={`rename-${project.id}`}
              name="name"
              defaultValue={project.name}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectCard({ project }: { project: ProjectDto }) {
  const { pending, error, run } = useMutation();
  const [renaming, setRenaming] = useState(false);
  return (
    <li
      className="flex flex-col overflow-hidden rounded-xl border bg-card"
      aria-label={project.name}
    >
      <div
        aria-hidden
        className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground"
      >
        {FRAMEWORK_LABEL[project.framework]}
      </div>
      <div className="grid gap-1 p-4">
        <h3 className="truncate font-medium" title={project.name}>
          {project.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {FRAMEWORK_LABEL[project.framework]} · {templateName(project.templateId)} · Edited{" "}
          {dateFormat.format(new Date(project.updatedAt))}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1 px-3 pb-3">
        <Button size="sm" asChild>
          <Link href={`/p/${project.id}`}>Open</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => projectsApi.duplicate(project.id))}
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => projectsApi.remove(project.id))}
        >
          Delete
        </Button>
      </div>
      {error ? (
        <div className="px-4 pb-3">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}
      <RenameDialog project={project} open={renaming} onOpenChange={setRenaming} />
    </li>
  );
}

export function TrashRow({ project, now }: { project: ProjectDto; now: number }) {
  const { pending, error, run } = useMutation();
  const deletedAt = new Date(project.deletedAt ?? project.updatedAt).getTime();
  const daysLeft = Math.max(
    0,
    Math.ceil((deletedAt + RESTORE_WINDOW_DAYS * 86_400_000 - now) / 86_400_000),
  );
  return (
    <li className="flex items-center justify-between gap-3 py-2" aria-label={project.name}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="text-xs text-muted-foreground">
          Deleted · restorable for {daysLeft} more {daysLeft === 1 ? "day" : "days"}
        </p>
        <ErrorText>{error}</ErrorText>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => projectsApi.restore(project.id))}
      >
        Restore
      </Button>
    </li>
  );
}
