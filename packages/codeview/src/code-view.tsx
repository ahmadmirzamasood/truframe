"use client";

/**
 * Code View (PRD F5): the whole generated project as a file tree, one read-only file at a
 * time in CodeMirror, and plain-text search across every file. Nothing here writes back:
 * the files come from the compiler and change only when the design changes.
 */
import { cn } from "@truframe/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FolderIcon,
  SearchIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeEditor, type Reveal } from "./code-editor.tsx";
import {
  buildFileTree,
  nodeAt,
  parentFolders,
  type SearchResult,
  type Span,
  searchFiles,
  spanFor,
  type TreeEntry,
} from "./files.ts";

import { type CodeAccess, EditCodeCallToAction, ReadOnlyBadge } from "./read-only.tsx";

const NO_SPANS: readonly Span[] = [];

export type CodeViewProps = {
  files: Readonly<Record<string, string>>;
  /** The file to open first (the active page's file). */
  defaultPath: string | null;
  /** Shown above the code, next to the file path (lock indicator, calls to action). */
  header?: ReactNode;
  /** Shown instead of the code when the last compile failed. */
  error?: string | null;
  /** Where each layer's element is (reveal in code / reveal in design, P6-3). */
  spans?: readonly Span[];
  /** The selected layer: its code is revealed when the selection changes. */
  selectedNode?: string | null;
  /** A click in the code picked this layer (null: outside any layer). */
  onPickNode?: (id: string | null) => void;
  /** What the plan allows with the code; without it, copy is allowed and no call to action. */
  access?: CodeAccess;
};

type Row = { entry: TreeEntry; depth: number };

function visibleRows(entries: TreeEntry[], open: ReadonlySet<string>, depth = 0): Row[] {
  return entries.flatMap((entry) => [
    { entry, depth },
    ...(entry.kind === "folder" && open.has(entry.path)
      ? visibleRows(entry.children, open, depth + 1)
      : []),
  ]);
}

export function CodeView({
  files,
  defaultPath,
  header,
  error,
  spans = NO_SPANS,
  selectedNode = null,
  onPickNode,
  access,
}: CodeViewProps) {
  const [copyNotice, setCopyNotice] = useState(false);
  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildFileTree(paths), [paths]);
  const [chosen, setChosen] = useState<string | null>(null);
  const openPath =
    chosen && chosen in files
      ? chosen
      : defaultPath && defaultPath in files
        ? defaultPath
        : (paths[0] ?? null);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(defaultPath ? parentFolders(defaultPath) : []),
  );
  // The default file can arrive after the first render (the compile finishes later).
  useEffect(() => {
    if (defaultPath) setOpen((prev) => new Set([...prev, ...parentFolders(defaultPath)]));
  }, [defaultPath]);
  const [tab, setTab] = useState<"files" | "search">("files");
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const seq = useRef(0);

  const openFile = useCallback(
    (path: string, range?: { from: number; to: number }, move = true) => {
      setChosen(path);
      setOpen((prev) => new Set([...prev, ...parentFolders(path)]));
      if (range) {
        seq.current += 1;
        setReveal({ ...range, seq: seq.current, move });
      } else setReveal(null);
    },
    [],
  );

  // Reveal in code: when the selected layer changes, show its element, preferring the open
  // file, then the page's file. A layer picked in the code is only marked, not jumped to.
  const revealed = useRef<string | null>(null);
  const picked = useRef<string | null>(null);
  const openRef = useRef(openPath);
  openRef.current = openPath;
  useEffect(() => {
    if (!selectedNode) {
      revealed.current = null;
      return;
    }
    if (selectedNode === revealed.current) return;
    const span = spanFor(spans, selectedNode, [openRef.current, defaultPath]);
    if (!span) return;
    revealed.current = selectedNode;
    const move = picked.current !== selectedNode;
    picked.current = null;
    openFile(span.path, { from: span.start, to: span.end }, move);
  }, [selectedNode, spans, defaultPath, openFile]);

  const pick = (offset: number) => {
    if (!openPath) return;
    const id = nodeAt(spans, openPath, offset);
    picked.current = id;
    onPickNode?.(id);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]" data-testid="code-view">
      <nav aria-label="Generated files" className="flex min-h-0 flex-col border-r">
        <div
          role="tablist"
          aria-label="Code View sidebar"
          className="flex h-10 shrink-0 items-center gap-1 border-b px-2"
        >
          <SidebarTab
            selected={tab === "files"}
            onClick={() => setTab("files")}
            icon={<FileCodeIcon />}
          >
            Files
          </SidebarTab>
          <SidebarTab
            selected={tab === "search"}
            onClick={() => setTab("search")}
            icon={<SearchIcon />}
          >
            Search
          </SidebarTab>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {tab === "files" ? (
            <FileTree
              rows={visibleRows(tree, open)}
              openPath={openPath}
              onToggle={(path) =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(path)) next.add(path);
                  return next;
                })
              }
              onOpen={(path) => openFile(path)}
            />
          ) : (
            <SearchPanel
              files={files}
              query={query}
              onQueryChange={setQuery}
              caseSensitive={caseSensitive}
              onCaseSensitiveChange={setCaseSensitive}
              onOpen={openFile}
            />
          )}
        </div>
      </nav>
      <section aria-label="Code" className="flex min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-3">
          <p className="min-w-0 truncate font-mono text-xs" data-testid="code-path">
            {openPath ?? "No files"}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {header}
            <ReadOnlyBadge />
            {access ? <EditCodeCallToAction access={access} /> : null}
          </div>
        </div>
        {copyNotice ? (
          <p
            role="status"
            className="flex items-center gap-2 border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
          >
            Copying code is part of Pro. On Free you can view all of it here.
            <button
              type="button"
              className="ml-auto underline"
              onClick={() => setCopyNotice(false)}
            >
              Dismiss
            </button>
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
          >
            The code is out of date: {error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          {openPath ? (
            <CodeEditor
              path={openPath}
              text={files[openPath] ?? ""}
              reveal={reveal}
              onPick={pick}
              copyAllowed={access?.copy ?? true}
              onCopyBlocked={() => setCopyNotice(true)}
            />
          ) : (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              Compiling the project…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SidebarTab(props: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.selected}
      onClick={props.onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium [&_svg]:size-3.5",
        props.selected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function FileTree(props: {
  rows: Row[];
  openPath: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const focused = props.rows.some((r) => r.entry.path === focus)
    ? focus
    : (props.openPath ?? props.rows[0]?.entry.path);

  const move = (to: number) => {
    const row = props.rows[Math.max(0, Math.min(props.rows.length - 1, to))];
    if (!row) return;
    setFocus(row.entry.path);
    refs.current.get(row.entry.path)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, i: number, row: Row) => {
    const { entry } = row;
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(props.rows.length - 1);
    else if (e.key === "ArrowRight" && entry.kind === "folder") props.onToggle(entry.path);
    else if (e.key === "ArrowLeft" && entry.kind === "folder") props.onToggle(entry.path);
    else if (e.key === "Enter" || e.key === " ") {
      if (entry.kind === "folder") props.onToggle(entry.path);
      else props.onOpen(entry.path);
    } else return;
    e.preventDefault();
  };

  return (
    <div role="tree" aria-label="Project files">
      {props.rows.map((row, i) => {
        const { entry, depth } = row;
        const isFolder = entry.kind === "folder";
        const expanded = isFolder && (props.rows[i + 1]?.depth ?? -1) > depth;
        return (
          <div
            key={entry.path}
            ref={(el) => {
              if (el) refs.current.set(entry.path, el);
              else refs.current.delete(entry.path);
            }}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={isFolder ? expanded : undefined}
            aria-selected={!isFolder && entry.path === props.openPath}
            tabIndex={entry.path === focused ? 0 : -1}
            onFocus={() => setFocus(entry.path)}
            onKeyDown={(e) => onKeyDown(e, i, row)}
            onClick={() => (isFolder ? props.onToggle(entry.path) : props.onOpen(entry.path))}
            style={{ paddingLeft: 8 + depth * 12 }}
            className={cn(
              "flex h-7 cursor-default items-center gap-1.5 pr-2 text-xs outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0",
              !isFolder && entry.path === props.openPath
                ? "bg-muted font-medium"
                : "hover:bg-muted/60",
            )}
          >
            {isFolder ? (
              <>
                {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                <FolderIcon className="text-muted-foreground" />
              </>
            ) : (
              <FileCodeIcon className="ml-5 text-muted-foreground" />
            )}
            <span className="truncate">{entry.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function SearchPanel(props: {
  files: Readonly<Record<string, string>>;
  query: string;
  onQueryChange: (q: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (v: boolean) => void;
  onOpen: (path: string, range: { from: number; to: number }) => void;
}) {
  const found = useMemo(
    () => searchFiles(props.files, props.query, { caseSensitive: props.caseSensitive }),
    [props.files, props.query, props.caseSensitive],
  );
  return (
    <div className="grid gap-2 px-2">
      <input
        type="search"
        aria-label="Search all files"
        placeholder="Search all files"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: the panel opens because the user wants to type
        autoFocus
        className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={props.caseSensitive}
          onChange={(e) => props.onCaseSensitiveChange(e.target.checked)}
        />
        Match case
      </label>
      {props.query ? (
        <p role="status" className="text-xs text-muted-foreground">
          {found.total === 0
            ? "No matches"
            : `${found.total}${found.truncated ? "+" : ""} ${found.total === 1 ? "match" : "matches"} in ${found.results.length} ${found.results.length === 1 ? "file" : "files"}`}
        </p>
      ) : null}
      <ul aria-label="Search results" className="grid gap-2">
        {found.results.map((r: SearchResult) => (
          <li key={r.path}>
            <p className="truncate font-mono text-[11px] font-medium">{r.path}</p>
            <ul>
              {r.matches.map((m) => (
                <li key={m.from}>
                  <button
                    type="button"
                    onClick={() => props.onOpen(r.path, { from: m.from, to: m.to })}
                    className="block w-full truncate rounded px-1 py-0.5 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted"
                    aria-label={`${r.path} line ${m.line}: ${m.preview.trim()}`}
                  >
                    <span className="mr-1.5 text-muted-foreground/70">{m.line}</span>
                    {m.preview.slice(0, m.previewFrom)}
                    <mark className="rounded-sm bg-yellow-200 text-foreground">
                      {m.preview.slice(m.previewFrom, m.previewFrom + (m.to - m.from))}
                    </mark>
                    {m.preview.slice(m.previewFrom + (m.to - m.from))}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
