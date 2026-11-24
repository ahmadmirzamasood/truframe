import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import {
  childrenOf,
  type ProjectDocument,
  templateDocument,
  validateDocument,
} from "@truframe/model";
import { applyTransaction } from "@truframe/ops";
import { beforeAll, describe, expect, it } from "vitest";
import { createNodes, INSERT_TOOLS, insertOps, insertTarget } from "./insert.ts";

const LIMITS = { pagesPerProject: 100 };
const landing = () =>
  templateDocument("landing", {
    projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    framework: "nextjs",
  });

function counter() {
  let n = 0;
  return () => `new${++n}`;
}

beforeAll(() => initCompilerFromDisk());

function apply(doc: ProjectDocument, ops: ReturnType<typeof insertOps>) {
  const r = applyTransaction(doc, ops, LIMITS);
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

describe("insert tools", () => {
  for (const tool of INSERT_TOOLS) {
    it(`${tool}: inserts a valid layer at the end of the page, as one op`, () => {
      const doc = landing();
      const page = doc.pages[0];
      if (!page) throw new Error("no page");
      const nodes = createNodes(tool, counter());
      const target = insertTarget(doc, page.root, null, tool);
      const ops = insertOps(nodes, target);
      expect(ops).toHaveLength(1);
      const next = apply(doc, ops);
      expect(validateDocument(next).ok).toBe(true);
      const body = childrenOf(next.nodes[page.root] as never);
      expect(body.at(-1)).toBe(nodes[0]?.id);
      // The compiler renders it (one element span per new layer).
      const out = compile(next);
      for (const n of nodes) expect(out.spans.some((s) => s.node === n.id)).toBe(true);
    });
  }

  it("goes inside a selected frame, or after a selected leaf", () => {
    const doc = landing();
    const page = doc.pages[0];
    if (!page) throw new Error("no page");
    const sections = childrenOf(doc.nodes[page.root] as never);
    const hero = sections[0] as string;
    expect(insertTarget(doc, page.root, hero, "text")).toEqual({
      parentId: hero,
      index: childrenOf(doc.nodes[hero] as never).length,
    });
    const heading = childrenOf(doc.nodes[hero] as never)[0] as string;
    expect(insertTarget(doc, page.root, heading, "text")).toEqual({ parentId: hero, index: 1 });
  });

  it("never puts a button inside a link", () => {
    const doc = landing();
    const page = doc.pages[0];
    if (!page) throw new Error("no page");
    const link = Object.values(doc.nodes).find((n) => n.type === "link");
    if (!link) throw new Error("no link");
    const label = childrenOf(link)[0] as string;
    const target = insertTarget(doc, page.root, label, "button");
    expect(target.parentId).not.toBe(link.id);
    const next = apply(doc, insertOps(createNodes("button", counter()), target));
    expect(validateDocument(next).ok).toBe(true);
    // A text can still go inside the link.
    expect(insertTarget(doc, page.root, link.id, "text").parentId).toBe(link.id);
  });
});
