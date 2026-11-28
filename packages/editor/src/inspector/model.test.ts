import { createDocument, type Node, type ProjectDocument, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import { createComponentOps } from "../components.ts";
import { createNodes, insertOps } from "../insert.ts";
import { parentMap } from "../tree.ts";
import {
  accessibilityChecks,
  alignOps,
  alignPositionOf,
  contrastRatio,
  directionOf,
  directionOps,
  displayOf,
  distributeOf,
  distributeOps,
  effective,
  hexAlpha,
  isOverridden,
  type MeasureLayer,
  pageColors,
  replaceColorOps,
  resetProp,
  setProp,
  textResizingOf,
  textResizingOps,
  withAlpha,
} from "./model.ts";

const LIMITS = { pagesPerProject: 100 };
const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, LIMITS);
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

function counter(prefix: string) {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function withStack() {
  let doc = createDocument({ id: ID, framework: "nextjs", ids: counter("p") });
  const root = doc.pages[0]?.root as string;
  const nodes = createNodes("stack", counter("s"));
  doc = commit(doc, insertOps(nodes, { parentId: root, index: 0 }));
  return { doc, root, id: nodes[0]?.id as string };
}

describe("cascade and overrides", () => {
  it("shows inherited values and marks overrides below desktop", () => {
    let { doc, id } = withStack();
    doc = commit(doc, [setProp(id, "tablet", "gap", 8)]);
    const node = doc.nodes[id] as Node;
    expect(effective(doc, node, "desktop", "gap")).toBe(16);
    expect(effective(doc, node, "tablet", "gap")).toBe(8);
    expect(effective(doc, node, "mobile", "gap")).toBe(8);
    expect(isOverridden(node, "tablet", "gap")).toBe(true);
    expect(isOverridden(node, "mobile", "gap")).toBe(false);
    expect(isOverridden(node, "desktop", "gap")).toBe(false);
    doc = commit(doc, [resetProp(id, "tablet", "gap")]);
    expect(doc.nodes[id]?.style.tablet).toBeUndefined();
  });
});

describe("layout controls", () => {
  it("maps the 9 align positions onto align/justify by direction", () => {
    let { doc, id } = withStack();
    const node = () => doc.nodes[id] as Node;
    doc = commit(doc, alignOps(doc, node(), "desktop", "Bottom right"));
    // Vertical stack: the main axis (justify) is vertical.
    expect(node().style.desktop).toMatchObject({ justify: "end", align: "end" });
    doc = commit(doc, alignOps(doc, node(), "desktop", "Top center"));
    expect(node().style.desktop).toMatchObject({ justify: "start", align: "center" });
    expect(alignPositionOf(doc, node(), "desktop")).toBe("Top center");
    // Horizontal: the same kind of position swaps the props.
    doc = commit(doc, directionOps(id, "desktop", "horizontal"));
    doc = commit(doc, alignOps(doc, node(), "desktop", "Center right"));
    expect(node().style.desktop).toMatchObject({ justify: "end", align: "center" });
    expect(directionOf(doc, node(), "desktop")).toBe("horizontal");
    doc = commit(doc, directionOps(id, "mobile", "wrap"));
    expect(directionOf(doc, node(), "mobile")).toBe("wrap");
    expect(directionOf(doc, node(), "desktop")).toBe("horizontal");
  });

  it("distribute is separate buttons and keeps the cross-axis align", () => {
    let { doc, id } = withStack();
    const node = () => doc.nodes[id] as Node;
    doc = commit(doc, alignOps(doc, node(), "desktop", "Center"));
    doc = commit(doc, distributeOps(doc, node(), "desktop", "between"));
    expect(distributeOf(doc, node(), "desktop")).toBe("between");
    doc = commit(doc, alignOps(doc, node(), "desktop", "Center left"));
    expect(node().style.desktop).toMatchObject({ justify: "between", align: "start" });
    doc = commit(doc, distributeOps(doc, node(), "desktop", "packed"));
    expect(node().style.desktop.justify).toBe("start");
  });

  it("reports Stack until every child is absolute (Free)", () => {
    let { doc, id } = withStack();
    expect(displayOf(doc, doc.nodes[id] as Node, "desktop")).toBe("stack");
    const kid = createNodes("text", counter("k"));
    doc = commit(doc, [
      ...insertOps(kid, { parentId: id, index: 0 }),
      setProp("k1", "desktop", "position", "absolute"),
    ]);
    expect(displayOf(doc, doc.nodes[id] as Node, "desktop")).toBe("free");
  });
});

describe("text resizing", () => {
  it("switches between auto width, auto height and fixed", () => {
    let doc = createDocument({ id: ID, framework: "nextjs" });
    const root = doc.pages[0]?.root as string;
    doc = commit(
      doc,
      insertOps(
        createNodes("text", () => "t1"),
        { parentId: root, index: 0 },
      ),
    );
    const node = () => doc.nodes.t1 as Node;
    expect(textResizingOf(doc, node(), "desktop")).toBe("autoWidth");
    doc = commit(doc, textResizingOps("t1", "desktop", "autoHeight", { width: 200.4, height: 20 }));
    expect(textResizingOf(doc, node(), "desktop")).toBe("autoHeight");
    doc = commit(doc, textResizingOps("t1", "desktop", "fixed", { width: 200, height: 48 }));
    expect(textResizingOf(doc, node(), "desktop")).toBe("fixed");
  });
});

describe("colors", () => {
  it("splits and joins hex alpha", () => {
    expect(hexAlpha("#11223380")).toEqual({ hex: "#112233", alpha: 0.5 });
    expect(withAlpha("#112233", 1)).toBe("#112233");
    expect(withAlpha("#112233", 0.5)).toBe("#11223380");
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  });

  it("lists page colors and replaces one everywhere in one transaction", () => {
    let doc = templateDocument("landing", { projectId: ID, framework: "nextjs" });
    const root = doc.pages[0]?.root as string;
    const white = pageColors(doc, root).find(([c]) => c === "#ffffff");
    expect(white?.[1]).toBeGreaterThan(0);
    doc = commit(doc, replaceColorOps(doc, root, "#ffffff", "#fafafa"));
    expect(pageColors(doc, root).some(([c]) => c === "#ffffff")).toBe(false);
    expect(pageColors(doc, root).find(([c]) => c === "#fafafa")?.[1]).toBe(white?.[1]);
  });
});

describe("accessibility checks", () => {
  it("flags low contrast per breakpoint, missing alt and heading order", () => {
    let doc = createDocument({ id: ID, framework: "nextjs" });
    const root = doc.pages[0]?.root as string;
    const ids = counter("x");
    doc = commit(doc, [
      ...insertOps(createNodes("text", ids), { parentId: root, index: 0 }),
      ...insertOps(createNodes("image", ids), { parentId: root, index: 1 }),
      setProp("x1", "mobile", "textColor", "#dddddd"),
      { op: "setNodeFields", nodeId: "x1", fields: { tag: "h3" } },
    ]);
    const checks = accessibilityChecks(doc, root, parentMap(doc));
    expect(checks).toContainEqual({
      nodeId: "x1",
      bp: "mobile",
      message: expect.stringMatching(/contrast/),
    });
    expect(checks.some((c) => c.nodeId === "x1" && c.bp === "desktop")).toBe(false);
    expect(checks).toContainEqual({ nodeId: "x2", bp: null, message: "Image has no alt text" });
  });
});

describe("focus ring and tap target checks", () => {
  const setup = (ops: (link: string, root: string) => Op[]) => {
    let doc = createDocument({ id: ID, framework: "nextjs" });
    const root = doc.pages[0]?.root as string;
    const ids = counter("b");
    doc = commit(doc, insertOps(createNodes("button", ids), { parentId: root, index: 0 }));
    doc = commit(doc, ops("b1", root));
    return { doc, root, link: "b1" };
  };
  const messages = (doc: ProjectDocument, root: string, measure?: MeasureLayer) =>
    accessibilityChecks(doc, root, parentMap(doc), measure).filter((c) => c.nodeId === "b1");

  it("passes the default button on a white page", () => {
    const { doc, root } = setup(() => []);
    expect(messages(doc, root)).toEqual([]);
  });

  it("flags a focus ring that matches a dark page background, per breakpoint", () => {
    const { doc, root } = setup((_, r) => [
      setProp(r, "tablet", "fill", { type: "solid", color: "#111111" }),
    ]);
    const m = messages(doc, root);
    expect(m.map((c) => c.bp)).toEqual(["tablet", "mobile"]);
    expect(m[0]?.message).toMatch(/^Focus ring contrast [\d.]+:1 is below 3:1$/);
  });

  it("passes once the focus ring color contrasts with the parent", () => {
    const { doc, root } = setup((l, r) => [
      setProp(r, "desktop", "fill", { type: "solid", color: "#111111" }),
      setProp(l, "desktop", "textColor", "#ffffff"),
    ]);
    expect(messages(doc, root)).toEqual([]);
  });

  it("uses the parent background, not the button's own fill", () => {
    // A white ring on the button's dark fill would pass; on the white page it doesn't.
    const { doc, root } = setup((l) => [setProp(l, "desktop", "textColor", "#ffffff")]);
    expect(messages(doc, root).map((c) => c.bp)).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("flags tap targets under 24 px on mobile from fixed sizes", () => {
    const { doc, root } = setup((l) => [
      setProp(l, "mobile", "height", { type: "fixed", value: 20 }),
      setProp(l, "mobile", "width", { type: "fixed", value: 80 }),
    ]);
    expect(messages(doc, root)).toEqual([
      { nodeId: "b1", bp: "mobile", message: "Tap target 80 × 20 px is under 24 px" },
    ]);
  });

  it("uses measured sizes from the canvas when given", () => {
    const { doc, root } = setup(() => []);
    const small: MeasureLayer = (id, bp) =>
      id === "b1" && bp === "mobile" ? { w: 23, h: 40 } : null;
    expect(messages(doc, root, small)).toEqual([
      { nodeId: "b1", bp: "mobile", message: "Tap target 23 × 40 px is under 24 px" },
    ]);
    const fine: MeasureLayer = () => ({ w: 24, h: 24 });
    expect(messages(doc, root, fine)).toEqual([]);
  });

  it("skips tap targets hidden on mobile", () => {
    const { doc, root } = setup((l) => [
      setProp(l, "mobile", "height", { type: "fixed", value: 10 }),
      { op: "setNodeFields", nodeId: l, fields: { hidden: { mobile: true } } },
    ]);
    expect(messages(doc, root)).toEqual([]);
  });
});

describe("selection colors with component instances", () => {
  it("counts and replaces colors set as instance overrides, not the component's own", () => {
    let doc = createDocument({ id: ID, framework: "nextjs" });
    const root = doc.pages[0]?.root as string;
    doc = commit(doc, insertOps(createNodes("button", counter("b")), { parentId: root, index: 0 }));
    const made = createComponentOps(doc, "b1", { component: "c1", instance: "i1" });
    if (!made.ok) throw new Error(made.message);
    doc = commit(doc, made.ops);
    const layer = doc.components.c1?.root as string;
    doc = commit(doc, [
      {
        op: "setInstanceOverride",
        nodeId: "i1",
        kind: "nodes",
        key: layer,
        value: { style: { mobile: { fill: { type: "solid", color: "#ff0000" } } } },
      },
    ]);
    const colors = new Map(pageColors(doc, root));
    expect(colors.get("#ff0000")).toBe(1);
    // The component main's own fill isn't a page color.
    expect(colors.has("#111827")).toBe(false);

    const ops = replaceColorOps(doc, root, "#ff0000", "#00aa00");
    expect(ops).toEqual([
      {
        op: "setInstanceOverride",
        nodeId: "i1",
        kind: "nodes",
        key: layer,
        value: { style: { mobile: { fill: { type: "solid", color: "#00aa00" } } } },
      },
    ]);
    doc = commit(doc, ops);
    expect(new Map(pageColors(doc, root)).get("#00aa00")).toBe(1);
  });
});
