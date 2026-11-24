"use client";

import { TEMPLATES, type TemplateMeta } from "@truframe/model";
import { FRAMEWORK_IDS, type FrameworkId } from "@truframe/protocol";
import { Button } from "@truframe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@truframe/ui/components/dialog";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import { type FormEvent, useState } from "react";
import { projectsApi } from "@/lib/api-client";
import { ErrorText, FRAMEWORK_LABEL, useMutation } from "./projects";

const FRAMEWORK_HINT: Record<FrameworkId, string> = {
  nextjs: "React with the App Router. Good for apps that will grow.",
  astro: "Ships almost no JavaScript. Good for content sites.",
};

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [framework, setFramework] = useState<FrameworkId>("nextjs");
  const [templateId, setTemplateId] = useState<TemplateMeta["id"]>("blank");
  const { pending, error, setError, run } = useMutation();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    if (await run(() => projectsApi.create({ name, framework, templateId }))) {
      setOpen(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setFramework("nextjs");
          setTemplateId("blank");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>New project</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Pick the framework Truframe generates. You can't change it later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="new-project-name">Name</Label>
            <Input
              id="new-project-name"
              name="name"
              defaultValue="Untitled site"
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Framework</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FRAMEWORK_IDS.map((id) => (
                <label
                  key={id}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="framework"
                      value={id}
                      checked={framework === id}
                      onChange={() => setFramework(id)}
                      className="accent-primary"
                    />
                    {FRAMEWORK_LABEL[id]}
                  </span>
                  <span className="text-muted-foreground">{FRAMEWORK_HINT[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Template</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)}
                      className="accent-primary"
                    />
                    {t.name}
                  </span>
                  <span className="text-muted-foreground">{t.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
