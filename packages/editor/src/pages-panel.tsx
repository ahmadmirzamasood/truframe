"use client";

/**
 * Pages panel (PRD F9): every page of the project in one tree, with folders from paths. Add,
 * rename, reorder (drag), duplicate, delete, set the home page, and page settings (slug and
 * SEO). Each action is one transaction.
 */
import type { Page, ProjectDocument } from "@truframe/model";
import type { Op } from "@truframe/ops";
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
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import { cn } from "@truframe/ui/lib/utils";
import {
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  HomeIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  addPageOps,
  checkPath,
  deletePageOps,
  duplicatePageOps,
  folderOf,
  folders,
  joinPath,
  movePageOps,
  pageTree,
  renameFolderOps,
  setHomeOps,
  slugify,
} from "./pages.ts";

type Apply = (ops: Op[]) => { message: string } | null;

export function PagesPanel(props: {
  doc: ProjectDocument;
  activePageId: string;
  onOpenPage: (id: string) => void;
  apply: Apply;
}) {
  const { doc } = props;
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Page | null>(null);
  const [naming, setNaming] = useState<{ kind: "page" | "folder"; folder: string | null } | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; after: boolean } | null>(
    null,
  );

  const run = (ops: Op[]) => {
    if (ops.length === 0) return true;
    const failure = props.apply(ops);
    setError(failure ? failure.message : null);
    return !failure;
  };

  const addPage = (name: string, folder: string | null) => {
    const r = addPageOps(doc, name, folder);
    if (run(r.ops)) props.onOpenPage(r.pageId);
  };

  return (
    <div className="grid gap-1 py-1 text-xs" data-testid="pages-panel">
      <div className="flex items-center gap-1 px-2 pb-1">
        <Button
          size="xs"
          variant="outline"
          onClick={() => setNaming({ kind: "page", folder: null })}
        >
          <FilePlusIcon />
          Add page
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setNaming({ kind: "folder", folder: null })}
        >
          <FolderPlusIcon />
          New folder
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mx-2 rounded bg-destructive/10 px-2 py-1 text-destructive">
          {error}
        </p>
      ) : null}
      <div role="tree" aria-label="Pages" className="grid">
        {pageTree(doc).map((item) => {
          if (item.kind === "folder") {
            return (
              <div
                key={`f:${item.folder}`}
                role="treeitem"
                aria-label={`Folder ${item.name}`}
                aria-level={item.depth + 1}
                tabIndex={-1}
                className="group flex h-7 items-center gap-1.5 pr-1 hover:bg-accent/70"
                style={{ paddingLeft: 8 + item.depth * 14 }}
              >
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {renaming === `f:${item.folder}` ? (
                  <InlineName
                    label={`Rename folder ${item.name}`}
                    value={item.name}
                    onDone={(name) => {
                      setRenaming(null);
                      if (!name || slugify(name) === item.name) return;
                      const r = renameFolderOps(doc, item.folder, name);
                      if (r.ok) run(r.ops);
                      else setError(r.message);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onDoubleClick={() => setRenaming(`f:${item.folder}`)}
                  >
                    {item.name}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Add a page to ${item.name}`}
                  onClick={() => setNaming({ kind: "page", folder: item.folder })}
                  className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <PlusIcon className="size-3" />
                </button>
              </div>
            );
          }
          const { page } = item;
          const home = page.path === "/";
          const active = page.id === props.activePageId;
          return (
            // biome-ignore lint/a11y/useFocusableInteractive: rows are reached through their buttons.
            <div
              key={page.id}
              role="treeitem"
              aria-label={page.name}
              aria-level={item.depth + 1}
              aria-selected={active}
              draggable
              onDragStart={() => setDrag({ id: page.id, over: null, after: false })}
              onDragOver={(e) => {
                if (!drag || drag.id === page.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                if (drag.over !== page.id || drag.after !== after)
                  setDrag({ ...drag, over: page.id, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const d = drag;
                setDrag(null);
                if (!d?.over) return;
                const order = doc.pages.map((p) => p.id).filter((id) => id !== d.id);
                run(movePageOps(d.id, order.indexOf(d.over) + (d.after ? 1 : 0)));
              }}
              onDragEnd={() => setDrag(null)}
              className={cn(
                "group relative flex h-7 items-center gap-1.5 pr-1 hover:bg-accent/70",
                active && "bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950",
              )}
              style={{ paddingLeft: 8 + item.depth * 14 }}
            >
              {drag?.over === page.id ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 h-0.5 bg-[#0d99ff]",
                    drag.after ? "bottom-0" : "top-0",
                  )}
                />
              ) : null}
              {home ? (
                <HomeIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label="Home page"
                />
              ) : (
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              {renaming === page.id ? (
                <InlineName
                  label={`Rename ${page.name}`}
                  value={page.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name && name !== page.name)
                      run([{ op: "updatePage", pageId: page.id, fields: { name } }]);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => props.onOpenPage(page.id)}
                  onDoubleClick={() => setRenaming(page.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline"
                >
                  <span className="truncate">{page.name}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {page.path}
                  </span>
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${page.name} actions`}
                    className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRenaming(page.id)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSettings(page)}>
                    Page settings…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      const r = duplicatePageOps(doc, page.id);
                      if (r && run(r.ops)) props.onOpenPage(r.pageId);
                    }}
                  >
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={home} onSelect={() => run(setHomeOps(doc, page.id))}>
                    Set as home page
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => {
                      const r = deletePageOps(doc, page.id);
                      if (!r.ok) setError(r.message);
                      else if (run(r.ops) && active)
                        props.onOpenPage(doc.pages.find((p) => p.path === "/")?.id ?? "");
                    }}
                  >
                    Delete page
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
      <NameDialog
        state={naming}
        onClose={() => setNaming(null)}
        onSubmit={(name) => {
          if (!naming) return;
          if (naming.kind === "page") addPage(name, naming.folder);
          // A folder exists once a page is in it: start it with one.
          else addPage("New page", joinPath(naming.folder, slugify(name)).slice(1));
          setNaming(null);
        }}
      />
      {settings ? (
        <PageSettings
          doc={doc}
          page={settings}
          onClose={() => setSettings(null)}
          apply={(ops) => {
            const failure = props.apply(ops);
            return failure;
          }}
        />
      ) : null}
    </div>
  );
}

function InlineName(props: { label: string; value: string; onDone: (value: string) => void }) {
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: shown because the user asked to rename.
      autoFocus
      aria-label={props.label}
      defaultValue={props.value}
      className="h-5 min-w-0 flex-1 rounded border bg-background px-1 text-xs outline-none"
      onBlur={(e) => props.onDone(e.target.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") props.onDone("");
      }}
    />
  );
}

function NameDialog(props: {
  state: { kind: "page" | "folder"; folder: string | null } | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const kind = props.state?.kind ?? "page";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) props.onSubmit(name.trim());
    setName("");
  };
  return (
    <Dialog open={props.state !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{kind === "page" ? "New page" : "New folder"}</DialogTitle>
            <DialogDescription>
              {kind === "page"
                ? `The page's path comes from its name${props.state?.folder ? ` inside /${props.state.folder}` : ""}. You can change it in page settings.`
                : "Folders become nested routes, like /blog/first-post. The folder starts with one page."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              {kind === "page" ? "Add page" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PageSettings(props: {
  doc: ProjectDocument;
  page: Page;
  onClose: () => void;
  apply: Apply;
}) {
  const { doc, page } = props;
  const home = page.path === "/";
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(home ? "" : (page.path.split("/").at(-1) ?? ""));
  const [folder, setFolder] = useState(folderOf(page.path) ?? "");
  const [title, setTitle] = useState(page.seo.title);
  const [description, setDescription] = useState(page.seo.description);
  const [noindex, setNoindex] = useState(page.seo.noindex);
  const [error, setError] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    let path = page.path;
    if (!home) {
      const check = checkPath(doc, page.id, joinPath(folder || null, slug));
      if (!check.ok) return setError(check.message);
      path = check.path;
    }
    if (!name.trim()) return setError("Give the page a name.");
    const failure = props.apply([
      {
        op: "updatePage",
        pageId: page.id,
        fields: { name: name.trim(), path, seo: { ...page.seo, title, description, noindex } },
      },
    ]);
    if (failure) return setError(failure.message);
    props.onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Page settings</DialogTitle>
            <DialogDescription>Route and search settings for {page.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ps-name">Name</Label>
            <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {home ? (
            <p className="text-sm text-muted-foreground">This is the home page. Its path is /.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ps-folder">Folder</Label>
                <select
                  id="ps-folder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">(top level)</option>
                  {folders(doc).map((f) => (
                    <option key={f} value={f}>
                      /{f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ps-slug">Slug</Label>
                <Input id="ps-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <p className="col-span-2 font-mono text-xs text-muted-foreground">
                {joinPath(folder || null, slug || "…")}
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="ps-title">SEO title</Label>
            <Input id="ps-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ps-description">Description</Label>
            <textarea
              id="ps-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ps-og">Social image</Label>
            <select
              id="ps-og"
              disabled
              className="h-9 rounded-md border bg-transparent px-2 text-sm text-muted-foreground"
            >
              <option>Choose from Assets (available with uploads)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
            />
            Hide from search engines (noindex)
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
