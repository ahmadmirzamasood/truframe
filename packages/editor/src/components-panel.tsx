"use client";

/**
 * Components panel (PRD F11, F29): every component with its instance count. Create one from
 * the selected layer, click a row to place an instance, or use the row menu to edit the main
 * component, rename it or delete it (its instances are detached first).
 */
import type { ProjectDocument } from "@truframe/model";
import { Button } from "@truframe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@truframe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@truframe/ui/components/dropdown-menu";
import { cn } from "@truframe/ui/lib/utils";
import { ComponentIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { instancesOf } from "./components.ts";

export function ComponentsPanel(props: {
  doc: ProjectDocument;
  /** The selected layer that "Create component" would turn into one. */
  selected: string | null;
  editingId: string | null;
  error: string | null;
  onCreate: (nodeId: string) => void;
  onInsert: (componentId: string) => void;
  onEditMain: (componentId: string) => void;
  onRename: (componentId: string, name: string) => void;
  onDelete: (componentId: string) => void;
}) {
  const { doc } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const list = Object.values(doc.components).sort((a, b) => a.name.localeCompare(b.name));
  const selected = props.selected ? doc.nodes[props.selected] : undefined;
  const canCreate = Boolean(selected && selected.type !== "instance");
  const del = deleting ? doc.components[deleting] : undefined;
  const delCount = deleting ? instancesOf(doc, deleting).length : 0;

  return (
    <div className="grid gap-1 py-2 text-xs" data-testid="components-panel">
      <div className="px-2 pb-1">
        <Button
          size="xs"
          variant="outline"
          className="w-full"
          disabled={!canCreate}
          title={canCreate ? undefined : "Select a layer to turn into a component"}
          onClick={() => props.selected && props.onCreate(props.selected)}
        >
          <PlusIcon />
          Create component from selection
        </Button>
      </div>
      {props.error ? (
        <p role="alert" className="mx-2 rounded bg-destructive/10 px-2 py-1 text-destructive">
          {props.error}
        </p>
      ) : null}
      {list.length === 0 ? (
        <p className="px-3 py-4 text-center text-muted-foreground">
          No components yet. Select a layer and create one to reuse it across pages.
        </p>
      ) : (
        <ul className="grid" aria-label="Components">
          {list.map((c) => {
            const count = instancesOf(doc, c.id).length;
            return (
              <li
                key={c.id}
                aria-label={c.name}
                className={cn(
                  "group flex h-8 items-center gap-2 pr-1 pl-3 hover:bg-accent/70",
                  props.editingId === c.id && "bg-accent",
                )}
              >
                <ComponentIcon className="size-3.5 shrink-0 text-violet-600" aria-hidden />
                {renaming === c.id ? (
                  <input
                    aria-label={`Rename ${c.name}`}
                    defaultValue={c.name}
                    // biome-ignore lint/a11y/noAutofocus: the user just chose Rename.
                    autoFocus
                    onBlur={(e) => {
                      setRenaming(null);
                      if (e.target.value.trim() && e.target.value !== c.name)
                        props.onRename(c.id, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="h-6 min-w-0 flex-1 rounded bg-background px-1.5 outline-none ring-1 ring-ring"
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                    title="Insert an instance"
                    aria-label={`Insert ${c.name}`}
                    onClick={() => props.onInsert(c.id)}
                    onDoubleClick={() => props.onEditMain(c.id)}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {count === 1 ? "1 instance" : `${count} instances`}
                    </span>
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${c.name}`}
                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => props.onInsert(c.id)}>
                      Insert instance
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => props.onEditMain(c.id)}>
                      Edit main component
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRenaming(c.id)}>Rename</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(c.id)}
                    >
                      Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={Boolean(del)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {del?.name}?</DialogTitle>
            <DialogDescription>
              {delCount > 0
                ? `${delCount === 1 ? "Its instance becomes" : `Its ${delCount} instances become`} plain layers that look the same, no longer linked to a component.`
                : "It has no instances."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) props.onDelete(deleting);
                setDeleting(null);
              }}
            >
              Delete component
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
