/**
 * Pages panel logic (PRD F9): add, rename, reorder, folders, duplicate, delete, home page and
 * page settings. Folders are path prefixes (`/blog/first-post` lives in the `blog` folder), so
 * they compile straight to nested routes. Every action is one transaction.
 */
import {
  childrenOf,
  type Node,
  newId,
  newPage,
  type Page,
  type ProjectDocument,
  pagePathSchema,
} from "@truframe/model";
import type { Op } from "@truframe/ops";

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "page";
}

/** `base` if no page uses it, otherwise `base-2`, `base-3`… */
export function uniquePath(doc: ProjectDocument, base: string, except?: string): string {
  const taken = new Set(doc.pages.filter((p) => p.id !== except).map((p) => p.path));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function folderOf(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
}

export function joinPath(folder: string | null, slug: string): string {
  return folder ? `/${folder}/${slug}` : `/${slug}`;
}

/** Checks a typed path; the message says what is allowed. */
export function checkPath(
  doc: ProjectDocument,
  pageId: string,
  raw: string,
): { ok: true; path: string } | { ok: false; message: string } {
  const path = raw.trim().replace(/\/+$/, "") || "/";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  if (!pagePathSchema.safeParse(withSlash).success)
    return {
      ok: false,
      message: "Use lowercase letters, numbers and dashes, like /about or /blog/first-post.",
    };
  const page = doc.pages.find((p) => p.id === pageId);
  if (withSlash === "/" && page?.path !== "/")
    return { ok: false, message: "Use Set as home page to make this the home page." };
  if (page?.path === "/" && withSlash !== "/")
    return { ok: false, message: "The home page's path is /. Set another page as home first." };
  if (doc.pages.some((p) => p.id !== pageId && p.path === withSlash))
    return { ok: false, message: `Another page already uses ${withSlash}.` };
  return { ok: true, path: withSlash };
}

export function addPageOps(
  doc: ProjectDocument,
  name: string,
  folder: string | null = null,
  ids: () => string = newId,
): { ops: Op[]; pageId: string } {
  const pageId = ids();
  const { page, root } = newPage({
    id: pageId,
    rootId: ids(),
    name,
    path: uniquePath(doc, joinPath(folder, slugify(name))),
  });
  return { ops: [{ op: "addPage", index: doc.pages.length, page, nodes: [root] }], pageId };
}

function cloneTree(doc: ProjectDocument, rootId: string, ids: () => string): Node[] {
  const out: Node[] = [];
  const walk = (id: string): string => {
    const n = doc.nodes[id];
    if (!n) throw new Error(`Missing layer ${id}`);
    const copy = structuredClone(n) as Node;
    copy.id = ids();
    out.push(copy);
    if (copy.type === "frame" || copy.type === "link") copy.children = childrenOf(n).map(walk);
    return copy.id;
  };
  walk(rootId);
  return out;
}

export function duplicatePageOps(
  doc: ProjectDocument,
  pageId: string,
  ids: () => string = newId,
): { ops: Op[]; pageId: string } | null {
  const index = doc.pages.findIndex((p) => p.id === pageId);
  const page = doc.pages[index];
  if (!page) return null;
  const nodes = cloneTree(doc, page.root, ids);
  const id = ids();
  const name = `${page.name} copy`;
  const base = page.path === "/" ? "/home-copy" : `${page.path}-copy`;
  const copy: Page = {
    ...structuredClone(page),
    id,
    name,
    root: (nodes[0] as Node).id,
    path: uniquePath(doc, base),
  };
  return { ops: [{ op: "addPage", index: index + 1, page: copy, nodes }], pageId: id };
}

export type PageResult = { ok: true; ops: Op[] } | { ok: false; message: string };

export function deletePageOps(doc: ProjectDocument, pageId: string): PageResult {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return { ok: false, message: "That page no longer exists." };
  if (page.path === "/")
    return {
      ok: false,
      message: "The home page can't be deleted. Set another page as home first.",
    };
  return { ok: true, ops: [{ op: "deletePage", pageId }] };
}

/** The new home page takes `/`; the old one gets a path from its name. */
export function setHomeOps(doc: ProjectDocument, pageId: string): Op[] {
  const page = doc.pages.find((p) => p.id === pageId);
  const home = doc.pages.find((p) => p.path === "/");
  if (!page || !home || page.id === home.id) return [];
  const rest = doc.pages.filter((p) => p.id !== page.id && p.id !== home.id);
  const taken = new Set(rest.map((p) => p.path));
  let path = `/${slugify(home.name)}`;
  for (let i = 2; taken.has(path) || path === "/"; i++) path = `/${slugify(home.name)}-${i}`;
  return [
    { op: "updatePage", pageId: home.id, fields: { path } },
    { op: "updatePage", pageId: page.id, fields: { path: "/" } },
  ];
}

export function movePageOps(pageId: string, index: number): Op[] {
  return [{ op: "movePage", pageId, index }];
}

/** Moves a page into a folder (or to the top level with `null`), keeping its slug. */
export function moveToFolderOps(doc: ProjectDocument, pageId: string, folder: string | null): Op[] {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page || page.path === "/") return [];
  const slug = page.path.split("/").filter(Boolean).at(-1) ?? "page";
  const path = uniquePath(doc, joinPath(folder, slug), pageId);
  return path === page.path ? [] : [{ op: "updatePage", pageId, fields: { path } }];
}

/** Renames a folder: every page path under it moves, in one transaction. */
export function renameFolderOps(doc: ProjectDocument, folder: string, name: string): PageResult {
  const to = slugify(name);
  const prefix = `/${folder}/`;
  const parentPrefix = folder.includes("/") ? `${folder.slice(0, folder.lastIndexOf("/"))}/` : "";
  const target = `/${parentPrefix}${to}`;
  const ops: Op[] = [];
  for (const p of doc.pages) {
    if (p.path === `/${folder}`)
      ops.push({ op: "updatePage", pageId: p.id, fields: { path: target } });
    else if (p.path.startsWith(prefix))
      ops.push({
        op: "updatePage",
        pageId: p.id,
        fields: { path: `${target}/${p.path.slice(prefix.length)}` },
      });
  }
  const moved = new Set(ops.map((o) => (o.op === "updatePage" ? o.pageId : "")));
  const clash = doc.pages.find(
    (p) => !moved.has(p.id) && (p.path === target || p.path.startsWith(`${target}/`)),
  );
  if (clash) return { ok: false, message: `${target} is already used by ${clash.name}.` };
  return { ok: true, ops };
}

export type PageTreeItem =
  | { kind: "page"; page: Page; depth: number }
  | { kind: "folder"; folder: string; name: string; depth: number };

/** Pages in document order, grouped under folders taken from their paths. */
export function pageTree(doc: ProjectDocument): PageTreeItem[] {
  const out: PageTreeItem[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    const folder = folderOf(page.path);
    const parts = folder ? folder.split("/") : [];
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (seen.has(path)) return;
      seen.add(path);
      out.push({ kind: "folder", folder: path, name, depth: i });
    });
    out.push({ kind: "page", page, depth: parts.length });
  }
  return out;
}

/** Every folder in use, for the "Folder" setting. */
export function folders(doc: ProjectDocument): string[] {
  return [...new Set(pageTree(doc).flatMap((i) => (i.kind === "folder" ? [i.folder] : [])))].sort();
}

/** The route file the compiler writes for a page path. */
export function routeFile(framework: ProjectDocument["framework"], path: string): string {
  if (framework === "nextjs") return path === "/" ? "app/page.tsx" : `app${path}/page.tsx`;
  return path === "/" ? "src/pages/index.astro" : `src/pages${path}.astro`;
}
