import type { Rect } from "@truframe/layout";
import { type Node, type ProjectDocument, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import { addAutoLayoutOps, canAddAutoLayout, groupable, groupIntoStackOps } from "./auto-layout.ts";
import { createNodes } from "./insert.ts";
import { parentMap } from "./tree.ts";

const LIMITS = { pagesPerProject: 100 };

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, LIMITS);
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

function counter(prefix: string) {
  let i = 0;
  return () => `${prefix}${(i++).toString(16).padStart(4, "0")}-0000-7000-8000-000000000000`;
}

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** A landing page plus a Free frame with three absolute children at the given boxes. */
function freeFrame(kids: Rect[]) {
  const base = templateDocument("blank", {
    projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    framework: "nextjs",
  });
  const root = base.pages[0]?.root as string;
  const id = counter("0190aaaa-");
  const frame = createNodes("stack", id)[0] as Node & { children: string[] };
  const children = kids.map((b, i) => {
    const n = createNodes("stack", id)[0] as Node;
    n.name = `Card ${i}`;
    n.style.desktop = {
      ...n.style.desktop,
      position: "absolute",
      left: b.x,
      top: b.y,
      width: { type: "fixed", value: b.width },
      height: { type: "fixed", value: b.height },
    };
    return n;
  });
  frame.children = children.map((c) => c.id);
  const doc = commit(base, [
    { op: "insertNodes", parentId: root, index: 0, nodes: [frame, ...children] },
  ]);
  const boxes = new Map<string, Rect>([[frame.id, r(0, 0, 600, 400)]]);
  for (const [i, c] of children.entries()) boxes.set(c.id, kids[i] as Rect);
  return { doc, root, frame: frame.id, kids: children.map((c) => c.id), boxes, newId: id };
}

describe("Add auto layout", () => {
  it("applies to a frame with absolute children only", () => {
    const f = freeFrame([r(20, 20, 100, 60), r(140, 20, 100, 60)]);
    expect(canAddAutoLayout(f.doc, f.frame, "desktop")).toBe(true);
    expect(canAddAutoLayout(f.doc, f.kids[0] as string, "desktop")).toBe(false);
    expect(canAddAutoLayout(f.doc, f.root, "desktop")).toBe(false);
  });

  it("turns a free row into a stack that keeps the children in place", () => {
    const f = freeFrame([r(140, 20, 100, 60), r(20, 20, 100, 60), r(260, 20, 100, 60)]);
    const ops = addAutoLayoutOps(f.doc, f.frame, "desktop", (id) => f.boxes.get(id) ?? null);
    const doc = commit(f.doc, ops as Op[]);
    const style = doc.nodes[f.frame]?.style.desktop;
    expect(style).toMatchObject({
      display: "stack",
      direction: "row",
      wrap: false,
      gap: 20,
      align: "start",
      padding: { top: 20, right: 240, bottom: 320, left: 20 },
    });
    // Reordered left to right, out of absolute positioning, left/top cleared.
    expect((doc.nodes[f.frame] as { children: string[] }).children).toEqual([
      f.kids[1],
      f.kids[0],
      f.kids[2],
    ]);
    for (const k of f.kids) {
      const s = doc.nodes[k]?.style.desktop;
      expect(s?.position).toBe("auto");
      expect(s?.left).toBeUndefined();
      expect(s?.top).toBeUndefined();
      expect(s?.width).toEqual({ type: "fixed", value: 100 });
    }
  });

  it("infers a centred column", () => {
    const f = freeFrame([r(200, 20, 200, 40), r(250, 80, 100, 40)]);
    const doc = commit(
      f.doc,
      addAutoLayoutOps(f.doc, f.frame, "desktop", (id) => f.boxes.get(id) ?? null) as Op[],
    );
    expect(doc.nodes[f.frame]?.style.desktop).toMatchObject({
      direction: "column",
      align: "center",
      gap: 20,
    });
  });

  it("at tablet only changes tablet", () => {
    const f = freeFrame([r(20, 20, 100, 60), r(140, 20, 100, 60)]);
    const ops = addAutoLayoutOps(f.doc, f.frame, "tablet", (id) => f.boxes.get(id) ?? null);
    expect((ops as Op[]).every((o) => !("breakpoint" in o) || o.breakpoint === "tablet")).toBe(
      true,
    );
  });

  it("does nothing when a child isn't rendered", () => {
    const f = freeFrame([r(20, 20, 100, 60), r(140, 20, 100, 60)]);
    f.boxes.delete(f.kids[1] as string);
    expect(addAutoLayoutOps(f.doc, f.frame, "desktop", (id) => f.boxes.get(id) ?? null)).toBeNull();
  });
});

describe("Group into stack", () => {
  it("only groups siblings", () => {
    const f = freeFrame([r(20, 20, 100, 60), r(140, 20, 100, 60)]);
    const parents = parentMap(f.doc);
    expect(groupable(f.doc, parents, f.kids)).toEqual({ parentId: f.frame, ids: f.kids });
    expect(groupable(f.doc, parents, [f.frame, f.kids[0] as string])).toBeNull();
  });

  it("wraps absolute siblings in an absolute stack at their bounds, ordered", () => {
    const f = freeFrame([r(140, 40, 100, 60), r(20, 40, 100, 60), r(400, 300, 50, 50)]);
    const pair = [f.kids[0] as string, f.kids[1] as string];
    const out = groupIntoStackOps(f.doc, pair, "desktop", (id) => f.boxes.get(id) ?? null, f.newId);
    const doc = commit(f.doc, out?.ops as Op[]);
    const stack = doc.nodes[out?.stackId as string] as Node & { children: string[] };
    expect(stack.style.desktop).toMatchObject({
      display: "stack",
      direction: "row",
      gap: 20,
      align: "start",
      position: "absolute",
      left: 20,
      top: 40,
      width: { type: "fit" },
    });
    expect(stack.children).toEqual([f.kids[1], f.kids[0]]);
    expect((doc.nodes[f.frame] as { children: string[] }).children).toEqual([
      out?.stackId,
      f.kids[2],
    ]);
    expect(doc.nodes[f.kids[0] as string]?.style.desktop?.position).toBe("auto");
  });

  it("groups flow siblings in place, as a flow stack", () => {
    const doc0 = templateDocument("landing", {
      projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      framework: "nextjs",
    });
    const root = doc0.pages[0]?.root as string;
    const sections = (doc0.nodes[root] as { children: string[] }).children;
    const boxes = new Map<string, Rect>([[root, r(0, 0, 1200, 900)]]);
    for (const [i, s] of sections.entries()) boxes.set(s, r(0, i * 300, 1200, 300));
    const pick = [sections[2] as string, sections[1] as string];
    const out = groupIntoStackOps(
      doc0,
      pick,
      "desktop",
      (id) => boxes.get(id) ?? null,
      counter("0190bbbb-"),
    );
    const doc = commit(doc0, out?.ops as Op[]);
    const stack = doc.nodes[out?.stackId as string] as Node & { children: string[] };
    expect(stack.style.desktop).toMatchObject({
      direction: "column",
      gap: 0,
      // The sections fill the page width; a Fit stack would shrink them.
      width: { type: "fill" },
      height: { type: "fit" },
    });
    expect(stack.style.desktop?.position).toBeUndefined();
    expect(stack.children).toEqual([sections[1], sections[2]]);
    expect((doc.nodes[root] as { children: string[] }).children.indexOf(stack.id)).toBe(1);
  });

  it("a wrapping group keeps its width so it still wraps", () => {
    const f = freeFrame([r(0, 0, 80, 60), r(100, 0, 80, 60), r(0, 80, 80, 60), r(100, 80, 80, 60)]);
    const out = groupIntoStackOps(
      f.doc,
      f.kids,
      "desktop",
      (id) => f.boxes.get(id) ?? null,
      f.newId,
    );
    const stack = commit(f.doc, out?.ops as Op[]).nodes[out?.stackId as string];
    expect(stack?.style.desktop).toMatchObject({
      wrap: true,
      width: { type: "fixed", value: 180 },
    });
  });
});
