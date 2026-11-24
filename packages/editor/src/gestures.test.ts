import type { Rect } from "@truframe/layout";
import { childrenOf, type ProjectDocument, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import {
  type DragContext,
  deleteOps,
  dragOps,
  dragPreview,
  effectiveProp,
  makeAbsoluteOps,
  type ResizeContext,
  resizeEndOps,
  resizePreview,
} from "./gestures.ts";
import { clickTarget, drillTarget, hitPath } from "./hit.ts";
import { parentMap } from "./tree.ts";

const LIMITS = { pagesPerProject: 100 };
const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

function landing() {
  const doc = templateDocument("landing", {
    projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    framework: "nextjs",
  });
  const page = doc.pages[0];
  if (!page) throw new Error("no page");
  const sections = childrenOf(doc.nodes[page.root] as never) as string[];
  return { doc, root: page.root, sections };
}

/** Applies a gesture's ops as one transaction (the editor calls `apply` once per gesture). */
function commit(doc: ProjectDocument, ops: Op[]) {
  expect(ops.length).toBeGreaterThan(0);
  const result = applyTransaction(doc, ops, LIMITS);
  if (!result.ok) throw new Error(result.error.message);
  return result.doc;
}

/** Boxes for the landing page: three 1200×300 sections stacked in the body. */
function boxes(doc: ProjectDocument, root: string, sections: string[]) {
  const map = new Map<string, Rect>([[root, r(0, 0, 1200, 900)]]);
  sections.forEach((id, i) => {
    map.set(id, r(0, i * 300, 1200, 300));
    childrenOf(doc.nodes[id] as never).forEach((c, j) => {
      map.set(c as string, r(300, i * 300 + 40 + j * 60, 600, 50));
    });
  });
  return map;
}

function dragCtx(
  doc: ProjectDocument,
  root: string,
  sections: string[],
  ids: string[],
  start = { x: 600, y: 450 },
): DragContext {
  return {
    doc,
    bp: "desktop",
    pageRoot: root,
    parents: parentMap(doc),
    boxes: boxes(doc, root, sections),
    flow: () => "column",
    ids,
    start,
    snap: 6,
  };
}

describe("hit testing and click targets", () => {
  it("finds the deepest layer under the pointer", () => {
    const { doc, root, sections } = landing();
    const b = boxes(doc, root, sections);
    const heading = childrenOf(doc.nodes[sections[0] as string] as never)[0];
    expect(hitPath(doc, root, b, { x: 400, y: 60 })).toEqual([root, sections[0], heading]);
    expect(hitPath(doc, root, b, { x: 50, y: 350 })).toEqual([root, sections[1]]);
    expect(hitPath(doc, root, b, { x: 5000, y: 5 })).toEqual([]);
  });

  it("selects the top level first, then drills in", () => {
    const { doc, root, sections } = landing();
    const parents = parentMap(doc);
    const path = hitPath(doc, root, boxes(doc, root, sections), { x: 400, y: 60 });
    const [, section, heading] = path;
    expect(clickTarget(path, parents, null, false)).toBe(section);
    // With a sibling's child selected, a click stays at that depth.
    expect(clickTarget(path, parents, heading as string, false)).toBe(heading);
    expect(clickTarget(path, parents, null, true)).toBe(heading);
    expect(drillTarget(path, section as string)).toBe(heading);
    expect(drillTarget(path, heading as string)).toBeNull();
  });
});

describe("gestures are one transaction each", () => {
  it("drag in auto layout reorders siblings", () => {
    const { doc, root, sections } = landing();
    const [a, b, c] = sections as [string, string, string];
    const ctx = dragCtx(doc, root, sections, [c], { x: 600, y: 750 });
    const preview = dragPreview(ctx, { x: 600, y: 20 });
    expect(preview).toMatchObject({ kind: "flow", parentId: root, index: 0 });
    const next = commit(doc, dragOps(ctx, preview));
    expect(childrenOf(next.nodes[root] as never)).toEqual([c, a, b]);
  });

  it("drag reparents into another stack and keeps multi-selection order", () => {
    const { doc, root, sections } = landing();
    const [hero, features] = sections as [string, string];
    const heroKids = childrenOf(doc.nodes[hero] as never) as string[];
    const moved = heroKids.slice(0, 2);
    const ctx = dragCtx(doc, root, sections, moved, { x: 400, y: 60 });
    // Into the features section, below everything in it.
    const preview = dragPreview(ctx, { x: 100, y: 560 });
    expect(preview).toMatchObject({ kind: "flow", parentId: features });
    const next = commit(doc, dragOps(ctx, preview));
    expect(childrenOf(next.nodes[features] as never).slice(-2)).toEqual(moved);
    expect(childrenOf(next.nodes[hero] as never)).toEqual(heroKids.slice(2));
  });

  it("a drop back in place changes nothing", () => {
    const { doc, root, sections } = landing();
    const ctx = dragCtx(doc, root, sections, [sections[1] as string], { x: 600, y: 450 });
    expect(dragOps(ctx, dragPreview(ctx, { x: 600, y: 460 }))).toEqual([]);
  });

  it("never drops a layer into itself", () => {
    const { doc, root, sections } = landing();
    const ctx = dragCtx(doc, root, sections, [sections[0] as string], { x: 600, y: 100 });
    const preview = dragPreview(ctx, { x: 400, y: 60 });
    expect(preview.kind === "flow" && preview.parentId).toBe(root);
  });

  it("absolute position is opt-in, then dragging moves it with snapping", () => {
    const { doc, root, sections } = landing();
    const hero = sections[0] as string;
    const heading = childrenOf(doc.nodes[hero] as never)[0] as string;
    const b = boxes(doc, root, sections);
    let next = commit(
      doc,
      makeAbsoluteOps(heading, "desktop", b.get(heading) as Rect, b.get(hero) as Rect),
    );
    const h = next.nodes[heading];
    if (!h) throw new Error("missing");
    expect(effectiveProp(next, h, "desktop", "position")).toBe("absolute");
    expect(h.style.desktop.left).toBe(300);
    // Drag left by 297 px: the left edge (3) snaps to the section's edge (0).
    const ctx = { ...dragCtx(next, root, sections, [heading], { x: 400, y: 60 }) };
    const preview = dragPreview(ctx, { x: 103, y: 60 });
    expect(preview.kind).toBe("absolute");
    next = commit(next, dragOps(ctx, preview));
    expect(next.nodes[heading]?.style.desktop).toMatchObject({ left: 0, top: 40 });
  });

  it("an absolute move at tablet only overrides tablet", () => {
    const { doc, root, sections } = landing();
    const hero = sections[0] as string;
    const heading = childrenOf(doc.nodes[hero] as never)[0] as string;
    const b = boxes(doc, root, sections);
    let next = commit(
      doc,
      makeAbsoluteOps(heading, "desktop", b.get(heading) as Rect, b.get(hero) as Rect),
    );
    const ctx = {
      ...dragCtx(next, root, sections, [heading], { x: 400, y: 60 }),
      bp: "tablet" as const,
    };
    next = commit(next, dragOps(ctx, dragPreview(ctx, { x: 450, y: 80 })));
    expect(next.nodes[heading]?.style.desktop).toMatchObject({ left: 300, top: 40 });
    expect(next.nodes[heading]?.style.tablet).toMatchObject({ left: 350, top: 60 });
  });

  it("resize sets Fixed sizes from the dragged edges", () => {
    const { doc, root, sections } = landing();
    const hero = sections[0] as string;
    const heading = childrenOf(doc.nodes[hero] as never)[0] as string;
    const b = boxes(doc, root, sections);
    const ctx: ResizeContext = {
      doc,
      bp: "mobile",
      id: heading,
      handle: "e",
      start: b.get(heading) as Rect,
      parent: b.get(hero) as Rect,
      siblings: [],
      snap: 6,
    };
    const { rect } = resizePreview(ctx, 102.4, 30, false);
    expect(rect.width).toBeCloseTo(702.4);
    const next = commit(doc, resizeEndOps(ctx, rect));
    expect(next.nodes[heading]?.style.mobile?.width).toEqual({ type: "fixed", value: 702 });
    expect(next.nodes[heading]?.style.mobile?.height).toBeUndefined();
    // Snaps the right edge to the parent's right edge (1200) within 6 px.
    expect(resizePreview(ctx, 297, 0, false).rect.width).toBe(900);
    expect(resizeEndOps(ctx, ctx.start)).toEqual([]);
  });

  it("delete removes the selection, skipping layers inside deleted ones", () => {
    const { doc, sections } = landing();
    const parents = parentMap(doc);
    const hero = sections[0] as string;
    const heading = childrenOf(doc.nodes[hero] as never)[0] as string;
    const ops = deleteOps([heading, hero], parents);
    expect(ops).toEqual([{ op: "deleteNode", nodeId: hero }]);
    const next = commit(doc, ops);
    expect(next.nodes[heading]).toBeUndefined();
  });
});
