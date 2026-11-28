/**
 * Pure helpers behind Code View (ARCHITECTURE §8): the file tree, search across files and
 * the span lookups used by reveal in design / reveal in code. No DOM, so Vitest runs them.
 */

/** Where a layer's element sits in a generated file (UTF-16 offsets, `end` exclusive). */
export type Span = { node: string; path: string; start: number; end: number };

export type TreeFolder = { kind: "folder"; name: string; path: string; children: TreeEntry[] };
export type TreeFile = { kind: "file"; name: string; path: string };
export type TreeEntry = TreeFolder | TreeFile;

/** Folders first, then files, each sorted by name (the way editors list a project). */
export function buildFileTree(paths: readonly string[]): TreeEntry[] {
  const root: TreeFolder = { kind: "folder", name: "", path: "", children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let folder = root;
    parts.forEach((name, i) => {
      if (i === parts.length - 1) {
        folder.children.push({ kind: "file", name, path });
        return;
      }
      const sub = parts.slice(0, i + 1).join("/");
      let next = folder.children.find(
        (c): c is TreeFolder => c.kind === "folder" && c.name === name,
      );
      if (!next) {
        next = { kind: "folder", name, path: sub, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
  }
  const sort = (entries: TreeEntry[]): TreeEntry[] =>
    entries
      .map((e) => (e.kind === "folder" ? { ...e, children: sort(e.children) } : e))
      .sort((a, b) => (a.kind === b.kind ? byName(a.name, b.name) : a.kind === "folder" ? -1 : 1));
  return sort(root.children);
}

/** Case-insensitive, with a stable tie-break, so the order never depends on the locale. */
function byName(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The folders that contain a path, outermost first (`app/about/page.tsx` → app, app/about). */
export function parentFolders(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export type SearchMatch = {
  /** 1-based, as editors show them. */
  line: number;
  column: number;
  /** UTF-16 offsets into the file. */
  from: number;
  to: number;
  /** The matched line, trimmed to a readable length around the match. */
  preview: string;
  /** Where the match sits inside `preview`. */
  previewFrom: number;
};
export type SearchResult = { path: string; matches: SearchMatch[] };

export const SEARCH_LIMIT = 500;

/**
 * Plain-text search over every generated file, in path order. Stops after `limit` matches
 * so a one-letter query on the lockfile can't freeze the editor; `truncated` says so.
 */
export function searchFiles(
  files: Readonly<Record<string, string>>,
  query: string,
  options: { caseSensitive?: boolean; limit?: number } = {},
): { results: SearchResult[]; total: number; truncated: boolean } {
  const limit = options.limit ?? SEARCH_LIMIT;
  const results: SearchResult[] = [];
  let total = 0;
  if (!query) return { results, total, truncated: false };
  const needle = options.caseSensitive ? query : query.toLowerCase();
  for (const path of Object.keys(files).sort()) {
    const text = files[path] ?? "";
    const hay = options.caseSensitive ? text : text.toLowerCase();
    const matches: SearchMatch[] = [];
    let at = hay.indexOf(needle);
    while (at !== -1) {
      if (total === limit) {
        if (matches.length) results.push({ path, matches });
        return { results, total, truncated: true };
      }
      matches.push(matchAt(text, at, at + query.length));
      total += 1;
      at = hay.indexOf(needle, at + Math.max(needle.length, 1));
    }
    if (matches.length) results.push({ path, matches });
  }
  return { results, total, truncated: false };
}

const PREVIEW_BEFORE = 24;
const PREVIEW_LENGTH = 100;

function matchAt(text: string, from: number, to: number): SearchMatch {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = text.indexOf("\n", from);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  let line = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < from; i = text.indexOf("\n", i + 1)) line += 1;
  const raw = text.slice(lineStart, lineEnd);
  const indent = raw.length - raw.trimStart().length;
  const start = Math.max(lineStart + indent, from - PREVIEW_BEFORE);
  const preview = text.slice(start, Math.min(lineEnd, start + PREVIEW_LENGTH));
  return { line, column: from - lineStart + 1, from, to, preview, previewFrom: from - start };
}

/** The innermost layer whose element contains `offset` in `path`, or null. */
export function nodeAt(spans: readonly Span[], path: string, offset: number): string | null {
  let best: Span | null = null;
  for (const s of spans) {
    if (s.path !== path || offset < s.start || offset >= s.end) continue;
    if (!best || s.end - s.start < best.end - best.start) best = s;
  }
  return best?.node ?? null;
}

/**
 * Where to reveal a layer: its element in `preferPath` (the open file) if it has one there,
 * then in the page's file, then anywhere (a component's own file).
 */
export function spanFor(
  spans: readonly Span[],
  node: string,
  preferPaths: readonly (string | null | undefined)[] = [],
): Span | null {
  const own = spans.filter((s) => s.node === node);
  for (const p of preferPaths) {
    const hit = own.find((s) => s.path === p);
    if (hit) return hit;
  }
  return own[0] ?? null;
}

export type LanguageId = "tsx" | "ts" | "js" | "astro" | "css" | "json" | "markdown" | "text";

export function languageFor(path: string): LanguageId {
  const ext = /\.([a-z]+)$/i.exec(path)?.[1]?.toLowerCase();
  switch (ext) {
    case "tsx":
      return "tsx";
    case "ts":
    case "mts":
      return "ts";
    case "js":
    case "mjs":
    case "cjs":
      return "js";
    case "astro":
      return "astro";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "text";
  }
}
