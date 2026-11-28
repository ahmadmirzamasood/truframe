import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import { type ProjectDocument, templateDocument } from "@truframe/model";
import { beforeAll, describe, expect, it } from "vitest";
import { applyDiff, diffFiles } from "./compile-diff.ts";

beforeAll(() => initCompilerFromDisk());

/** The document with its first text layer's content replaced. */
function setText(doc: ProjectDocument, text: string): ProjectDocument {
  const id = Object.keys(doc.nodes).find((k) => doc.nodes[k]?.type === "text");
  const node = id ? doc.nodes[id] : undefined;
  if (!id || node?.type !== "text") throw new Error("no text layer");
  return { ...doc, nodes: { ...doc.nodes, [id]: { ...node, content: [{ text }] } } };
}

describe("compile file diff", () => {
  it("sends everything first, then only what changed", () => {
    expect(diffFiles(null, { b: "2", a: "1" })).toEqual({
      changed: { b: "2", a: "1" },
      removed: [],
    });
    expect(diffFiles({ a: "1", b: "2", c: "3" }, { a: "1", b: "two", d: "4" })).toEqual({
      changed: { b: "two", d: "4" },
      removed: ["c"],
    });
  });

  it("rebuilds the same files, sorted, keeping unchanged strings", () => {
    const prev = { a: "1", c: "3" };
    const next = applyDiff(prev, { changed: { b: "2", c: "three" }, removed: ["a"] });
    expect(next).toEqual({ b: "2", c: "three" });
    expect(Object.keys(next)).toEqual(["b", "c"]);
  });

  it("round-trips a real edit: one page file changes, lockfiles don't cross", () => {
    const doc = templateDocument("saas", {
      projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      framework: "nextjs",
    });
    const before = compile(doc).files;
    const edited = setText(doc, "Changed headline");
    const after = compile(edited).files;
    const diff = diffFiles(before, after);
    expect(Object.keys(diff.changed)).toEqual(["app/page.tsx"]);
    expect(applyDiff(before, diff)).toEqual(after);
  });
});
