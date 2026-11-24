import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import { createDocument, type ProjectDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addPageOps,
  checkPath,
  deletePageOps,
  duplicatePageOps,
  movePageOps,
  moveToFolderOps,
  pageTree,
  renameFolderOps,
  routeFile,
  setHomeOps,
  slugify,
} from "./pages.ts";

const LIMITS = { pagesPerProject: 100 };
beforeAll(() => initCompilerFromDisk());

function counter() {
  let i = 0;
  return () => `id${++i}`;
}

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, LIMITS);
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

/** The compiled route files are exactly the pages' routes. */
function expectRoutesMatch(doc: ProjectDocument) {
  for (const framework of ["nextjs", "astro"] as const) {
    const files = Object.keys(compile(doc, framework).files).filter((f) =>
      framework === "nextjs" ? /^app\/(.+\/)?page\.tsx$/.test(f) : f.startsWith("src/pages/"),
    );
    expect(files.sort()).toEqual(doc.pages.map((p) => routeFile(framework, p.path)).sort());
  }
}

describe("pages", () => {
  it("add, folders, duplicate, home, rename folder, reorder and delete keep routes in step", () => {
    const ids = counter();
    let doc = createDocument({
      id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      framework: "nextjs",
      ids,
    });
    const add = (name: string, folder: string | null = null) => {
      const r = addPageOps(doc, name, folder, ids);
      doc = commit(doc, r.ops);
      return r.pageId;
    };
    const about = add("About us");
    add("About us");
    const post = add("First post", "blog");
    add("Getting started", "docs/guides");
    expect(doc.pages.map((p) => p.path)).toEqual([
      "/",
      "/about-us",
      "/about-us-2",
      "/blog/first-post",
      "/docs/guides/getting-started",
    ]);
    expectRoutesMatch(doc);

    const copy = duplicatePageOps(doc, post, ids);
    doc = commit(doc, copy?.ops ?? []);
    expect(doc.pages.find((p) => p.id === copy?.pageId)?.path).toBe("/blog/first-post-copy");
    // The copy has its own layers.
    const original = doc.pages.find((p) => p.id === post);
    const dup = doc.pages.find((p) => p.id === copy?.pageId);
    expect(dup?.root).not.toBe(original?.root);

    doc = commit(doc, setHomeOps(doc, about));
    expect(doc.pages.find((p) => p.id === about)?.path).toBe("/");
    expect(doc.pages[0]?.path).toBe("/home");

    const renamed = renameFolderOps(doc, "blog", "Journal");
    if (!renamed.ok) throw new Error(renamed.message);
    doc = commit(doc, renamed.ops);
    expect(doc.pages.filter((p) => p.path.startsWith("/journal/")).length).toBe(2);

    doc = commit(doc, moveToFolderOps(doc, doc.pages[0]?.id as string, "journal"));
    expect(doc.pages[0]?.path).toBe("/journal/home");
    doc = commit(doc, movePageOps(about, 0));
    expect(doc.pages[0]?.id).toBe(about);

    const del = deletePageOps(doc, post);
    if (!del.ok) throw new Error(del.message);
    doc = commit(doc, del.ops);
    expectRoutesMatch(doc);
  });

  it("refuses to delete the home page or reuse a path", () => {
    const doc = createDocument({
      id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      framework: "astro",
      ids: counter(),
    });
    const home = doc.pages[0]?.id as string;
    expect(deletePageOps(doc, home)).toEqual({
      ok: false,
      message: "The home page can't be deleted. Set another page as home first.",
    });
    expect(checkPath(doc, home, "/about")).toMatchObject({ ok: false });
    expect(checkPath(doc, "x", "About Us")).toMatchObject({ ok: false });
    expect(checkPath(doc, "x", "about-us/")).toEqual({ ok: true, path: "/about-us" });
    expect(checkPath(doc, "x", "/")).toMatchObject({ ok: false });
    expect(slugify("Café & Bar!")).toBe("cafe-bar");
  });

  it("groups pages under folders from their paths", () => {
    const ids = counter();
    let doc = createDocument({
      id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      framework: "nextjs",
      ids,
    });
    doc = commit(doc, addPageOps(doc, "Post", "blog", ids).ops);
    doc = commit(doc, addPageOps(doc, "Intro", "docs/guides", ids).ops);
    expect(
      pageTree(doc).map((i) =>
        i.kind === "page" ? `${i.depth}:${i.page.path}` : `${i.depth}:[${i.folder}]`,
      ),
    ).toEqual([
      "0:/",
      "0:[blog]",
      "1:/blog/post",
      "0:[docs]",
      "1:[docs/guides]",
      "2:/docs/guides/intro",
    ]);
  });
});
