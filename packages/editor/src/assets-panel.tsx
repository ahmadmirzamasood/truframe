"use client";

/**
 * Assets panel (PRD F14, F29): search, folders, an upload drop zone listing the accepted
 * types, a thumbnail grid (click to insert as an image layer) with Rename, Alt text, Move to
 * folder, Replace everywhere and Delete (with its usage count), and the storage meter.
 */
import type { Asset, ProjectDocument } from "@truframe/model";
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
import { MoreHorizontalIcon, SearchIcon, UploadIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACCEPTED_LABEL,
  ACCEPTED_TYPES,
  assetUsage,
  deleteAssetOps,
  folderNames,
  formatBytes,
  listAssets,
  replaceEverywhereOps,
  updateAssetOps,
} from "./assets.ts";
import type { AssetHost, AssetUsage, PickerHost } from "./host.ts";
import { PhotoPicker } from "./pickers.tsx";

type Apply = (ops: Op[]) => { message: string } | null;
type Editing = { kind: "rename" | "alt" | "folder"; asset: Asset } | null;

export function AssetsPanel(props: {
  doc: ProjectDocument;
  host: AssetHost | undefined;
  pickers?: PickerHost;
  apply: Apply;
  onInsert: (asset: Asset) => void;
}) {
  const { doc, host } = props;
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [usage, setUsage] = useState<AssetUsage | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const replacer = useRef<HTMLInputElement>(null);
  const replacing = useRef<Asset | null>(null);
  const counts = useMemo(() => assetUsage(doc), [doc]);
  const folders = folderNames(doc);
  const assets = listAssets(doc, folder, query);

  const refreshUsage = useCallback(() => {
    void host?.usage().then(setUsage);
  }, [host]);
  useEffect(refreshUsage, [refreshUsage]);

  const run = (ops: Op[]) => {
    const failure = props.apply(ops);
    if (failure) setError(failure.message);
    return !failure;
  };

  const upload = async (files: FileList | File[]) => {
    if (!host) return;
    setError(null);
    for (const file of [...files]) {
      setBusy((n) => n + 1);
      const r = await host.upload(file);
      setBusy((n) => n - 1);
      if (!r.ok) {
        setError(`${file.name}: ${r.message}`);
        continue;
      }
      const asset = folder ? { ...r.asset, folder } : r.asset;
      run([{ op: "upsertAsset", asset }]);
    }
    refreshUsage();
  };

  const replace = async (file: File) => {
    const old = replacing.current;
    if (!host || !old) return;
    setBusy((n) => n + 1);
    const r = await host.upload(file);
    setBusy((n) => n - 1);
    if (!r.ok) return setError(`${file.name}: ${r.message}`);
    const asset = { ...r.asset, folder: old.folder, alt: old.alt };
    // One transaction: the new file in, every use moved to it, the old entry out.
    run([
      { op: "upsertAsset", asset },
      ...replaceEverywhereOps(doc, old.id, asset.id),
      { op: "deleteAsset", assetId: old.id },
    ]);
    refreshUsage();
  };

  return (
    <div className="grid gap-2 py-2 text-xs" data-testid="assets-panel">
      <div className="relative mx-2">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search assets"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 w-full rounded-md bg-muted/70 pr-2 pl-7 text-xs outline-none focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>
      {folders.length ? (
        <div role="radiogroup" aria-label="Folders" className="flex flex-wrap gap-1 px-2">
          {[null, ...folders].map((f) => (
            // biome-ignore lint/a11y/useSemanticElements: chip-style filter buttons.
            <button
              key={f ?? "all"}
              type="button"
              role="radio"
              aria-checked={folder === f}
              onClick={() => setFolder(f)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                folder === f
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {f ?? "All"}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={!host}
        onClick={() => picker.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "mx-2 grid place-items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground hover:bg-accent/50 disabled:opacity-50",
          over && "border-foreground bg-accent",
        )}
      >
        <UploadIcon className="size-4" aria-hidden />
        <span className="font-medium text-foreground">
          {busy ? `Uploading ${busy} file${busy === 1 ? "" : "s"}…` : "Upload images"}
        </span>
        <span>Drop files here or click. {ACCEPTED_LABEL}.</span>
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        aria-label="Choose images to upload"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replacer}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Choose a replacement image"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void replace(f);
          e.target.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="mx-2 rounded bg-destructive/10 px-2 py-1 text-destructive">
          {error}
        </p>
      ) : null}
      {assets.length === 0 ? (
        <p className="px-3 py-3 text-center text-muted-foreground">
          {query ? "No assets match your search." : "No images yet."}
        </p>
      ) : (
        <ul aria-label="Assets" className="grid grid-cols-2 gap-2 px-2">
          {assets.map((a) => (
            <li key={a.id} aria-label={a.name} className="group relative grid gap-1">
              <button
                type="button"
                title={`Insert ${a.name}`}
                aria-label={`Insert ${a.name}`}
                onClick={() => props.onInsert(a)}
                className="grid aspect-square place-items-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] hover:ring-2 hover:ring-ring/40"
              >
                {host ? (
                  <img
                    src={host.url(a, 320)}
                    alt={a.alt ?? ""}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                ) : null}
              </button>
              <div className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 flex-1 truncate" title={a.name}>
                  {a.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${a.name}`}
                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => props.onInsert(a)}>Insert</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing({ kind: "rename", asset: a })}>
                      Rename…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing({ kind: "alt", asset: a })}>
                      Alt text…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing({ kind: "folder", asset: a })}>
                      Move to folder…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!host}
                      onSelect={() => {
                        replacing.current = a;
                        replacer.current?.click();
                      }}
                    >
                      Replace everywhere…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDeleting(a)}
                    >
                      Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {a.width} × {a.height} · {formatBytes(a.bytes)}
                {counts.get(a.id)
                  ? ` · ${counts.get(a.id)} use${counts.get(a.id) === 1 ? "" : "s"}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {usage ? <StorageMeter usage={usage} /> : null}
      {editing ? (
        <EditDialog
          editing={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            const field = editing.kind === "rename" ? "name" : editing.kind;
            if (run(updateAssetOps(doc, editing.asset.id, { [field]: value }))) setEditing(null);
          }}
        />
      ) : null}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              {deleting && counts.get(deleting.id)
                ? `It's used in ${counts.get(deleting.id)} place${counts.get(deleting.id) === 1 ? "" : "s"}. Image layers become placeholders and image fills are removed.`
                : "It isn't used anywhere."}{" "}
              Undo brings it back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting && run(deleteAssetOps(doc, deleting.id))) setDeleting(null);
              }}
            >
              Delete asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {props.pickers ? (
        <PhotoPicker
          host={props.pickers}
          onAdded={(asset) => {
            run([{ op: "upsertAsset", asset: folder ? { ...asset, folder } : asset }]);
            refreshUsage();
          }}
        />
      ) : null}
    </div>
  );
}

function StorageMeter({ usage }: { usage: AssetUsage }) {
  const ratio = usage.maxBytes ? Math.min(1, usage.bytes / usage.maxBytes) : 0;
  return (
    <div className="mx-2 grid gap-1 border-t pt-2" data-testid="storage-meter">
      {/* biome-ignore lint/a11y/useSemanticElements: a styled bar; <meter> can't be themed consistently across browsers. */}
      <div
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={usage.maxBytes ?? usage.bytes}
        aria-valuenow={usage.bytes}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", ratio >= 0.9 ? "bg-destructive" : "bg-foreground")}
          style={{ width: `${Math.max(ratio * 100, usage.bytes ? 2 : 0)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatBytes(usage.bytes)}
        {usage.maxBytes ? ` of ${formatBytes(usage.maxBytes)}` : ""} · {usage.files}
        {usage.maxFiles ? ` of ${usage.maxFiles}` : ""} files
      </p>
    </div>
  );
}

const TITLES = { rename: "Rename asset", alt: "Alt text", folder: "Move to folder" } as const;

function EditDialog(props: {
  editing: NonNullable<Editing>;
  folders: string[];
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const { kind, asset } = props.editing;
  const [value, setValue] = useState(
    kind === "rename" ? asset.name : kind === "alt" ? (asset.alt ?? "") : (asset.folder ?? ""),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSave(value);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{TITLES[kind]}</DialogTitle>
            <DialogDescription>
              {kind === "alt"
                ? "New image layers start with this text. Describe the image for people who can't see it."
                : kind === "folder"
                  ? "Leave empty to keep it at the top level."
                  : asset.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-field">
              {kind === "rename" ? "Name" : kind === "alt" ? "Alt text" : "Folder"}
            </Label>
            <Input
              id="asset-field"
              autoFocus
              list={kind === "folder" ? "asset-folders" : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {kind === "folder" ? (
              <datalist id="asset-folders">
                {props.folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
