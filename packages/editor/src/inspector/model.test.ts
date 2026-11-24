import { createDocument, type Node, type ProjectDocument, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { describe, expect, it } from "vitest";
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
