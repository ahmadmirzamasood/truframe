import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import { type InstanceNode, type ProjectDocument, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addVariantPropOps,
  componentName,
  createComponentOps,
  deleteComponentOps,
  detachOps,
  exposePropOps,
  instancesOf,
  newInstance,
  removePropOps,
  resetOverridesOps,
  routeToVariant,
  setLayerTextOps,
  setPropValueOps,
  setVariantOps,
  setVariantPropsOps,
  withVariant,
} from "./components.ts";

beforeAll(() => initCompilerFromDisk());

const PROJECT = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
let n = 0;
const ids = () => `x${++n}`;

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, { pagesPerProject: 100 });
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

/** The landing template with its first button turned into a component. */
function withButton(framework: "nextjs" | "astro" = "nextjs") {
  const doc = templateDocument("landing", { projectId: PROJECT, framework });
  const button = Object.values(doc.nodes).find((x) => x.type === "link");
  if (!button) throw new Error("no button");
  const r = createComponentOps(doc, button.id, { component: "btn", instance: "inst1" });
  if (!r.ok) throw new Error(r.message);
  return { before: doc, doc: commit(doc, r.ops), buttonId: button.id };
}

const page = (doc: ProjectDocument, fw: "nextjs" | "astro") =>
  compile(doc, fw).files[fw === "nextjs" ? "app/page.tsx" : "src/pages/index.astro"] ?? "";

describe("names", () => {
  it("makes unique PascalCase component names", () => {
    const { doc } = withButton();
    expect(componentName(doc, "pricing card")).toBe("PricingCard");
    expect(componentName(doc, "Button")).toBe("Button2");
    expect(componentName(doc, "3d")).toBe("C3d");
    expect(componentName(doc, "")).toBe("Component");
  });
});

describe("create from a layer", () => {
  for (const fw of ["nextjs", "astro"] as const) {
    it(`compiles to a component file and an import in ${fw}`, () => {
      const { doc } = withButton(fw);
      expect(doc.components.btn?.name).toBe("Button");
      const files = compile(doc, fw).files;
      const file = fw === "nextjs" ? "components/Button.tsx" : "src/components/Button.astro";
      expect(files[file]).toBeDefined();
      const p = page(doc, fw);
      expect(p).toMatch(/import Button from "[^"]*components\/Button(\.astro)?";/);
      expect(p).toContain("<Button");
    });
  }

  it("keeps the layer's look: instance and root CSS together equal the layer's", () => {
    const { before, doc, buttonId } = withButton();
    const decls = (css?: { desktop: string }) =>
      (css?.desktop ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);
    const out = compile(doc, "nextjs");
    expect([...decls(out.css.inst1), ...decls(out.css[buttonId])].sort()).toEqual(
      decls(compile(before, "nextjs").css[buttonId]).sort(),
    );
  });

  it("refuses an instance or a page root", () => {
    const { doc } = withButton();
    expect(createComponentOps(doc, "inst1", { component: "c", instance: "i" }).ok).toBe(false);
    const root = doc.pages[0]?.root as string;
    expect(createComponentOps(doc, root, { component: "c", instance: "i" }).ok).toBe(false);
  });

  it("undo restores the layer", () => {
    const { before } = withButton();
    const button = Object.values(before.nodes).find((x) => x.type === "link");
    const r = createComponentOps(before, button?.id ?? "", { component: "c", instance: "i" });
    if (!r.ok) throw new Error(r.message);
    const result = applyTransaction(before, r.ops, { pagesPerProject: 100 });
    if (!result.ok) throw new Error(result.error.message);
    expect(commit(result.doc, result.inverse)).toEqual(before);
  });
});

describe("instances and detach", () => {
  it("detaching gives back the same page code", () => {
    const { before, doc } = withButton();
    const r = detachOps(doc, "inst1", ids);
    if (!r) throw new Error("no detach");
    // Once the component is gone too, even the code classes are the same again.
    const detached = commit(commit(doc, r.ops), [{ op: "deleteComponent", componentId: "btn" }]);
    for (const fw of ["nextjs", "astro"] as const)
      expect(page(detached, fw)).toBe(page({ ...before, framework: fw }, fw));
  });

  it("places more instances and deletes a component by detaching them", () => {
    let { doc } = withButton();
    const c = doc.components.btn;
    if (!c) throw new Error("no component");
    const root = doc.pages[0]?.root as string;
    doc = commit(doc, [
      { op: "insertNodes", parentId: root, index: 0, nodes: [newInstance(c, "inst2")] },
    ]);
    expect(instancesOf(doc, "btn")).toHaveLength(2);
    const next = commit(doc, deleteComponentOps(doc, "btn", ids));
    expect(next.components.btn).toBeUndefined();
    expect(Object.values(next.nodes).filter((x) => x.type === "instance")).toHaveLength(0);
  });
});

describe("props and overrides", () => {
  it("exposes a text prop, sets it per instance and resets it", () => {
    let { doc, buttonId } = withButton();
    const label = doc.nodes[(doc.nodes[buttonId] as { children: string[] }).children[0] ?? ""];
    const btn = doc.components.btn;
    if (!label || !btn) throw new Error("fixture");
    doc = commit(doc, exposePropOps(doc, "btn", label.id, "content"));
    const prop = doc.components.btn?.props[0];
    expect(prop?.name).toBe("label");
    expect(prop?.type).toBe("text");
    const c = doc.components.btn;
    if (!c) throw new Error("gone");
    doc = commit(doc, setPropValueOps(c, doc.nodes.inst1 as InstanceNode, "label", "Buy now"));
    expect(page(doc, "nextjs")).toContain('label="Buy now"');
    expect(compile(doc, "nextjs").files["components/Button.tsx"]).toContain("props.label");
    doc = commit(doc, resetOverridesOps(doc.nodes.inst1 as InstanceNode));
    expect(page(doc, "nextjs")).not.toContain("Buy now");
    doc = commit(doc, removePropOps(doc, "btn", "label"));
    expect(doc.components.btn?.props).toEqual([]);
  });

  it("a layer text override inlines the instance with the new text", () => {
    let { doc, buttonId } = withButton();
    const label = doc.nodes[(doc.nodes[buttonId] as { children: string[] }).children[0] ?? ""];
    doc = commit(doc, setLayerTextOps(doc.nodes.inst1 as InstanceNode, label?.id ?? "", "Hi!"));
    expect(page(doc, "nextjs")).toContain("Hi!");
    expect(compile(doc, "nextjs").instanceCss?.inst1).toBeDefined();
  });
});

describe("variants", () => {
  it("adds a variant prop, styles a variant, picks it on an instance", () => {
    let { doc, buttonId } = withButton();
    const add = addVariantPropOps(doc, "btn", "Size", "Default, Large");
    if (!add.ok) throw new Error(add.message);
    doc = commit(doc, add.ops);
    expect(doc.components.btn?.variantProps).toEqual([
      { name: "size", values: ["default", "large"], default: "default" },
    ]);
    // Style edits while editing "size=large" become variant overrides.
    const routed = routeToVariant(doc, "btn", "size=large", [
      { op: "setProp", nodeId: buttonId, breakpoint: "desktop", key: "radius", value: 20 },
    ]);
    expect(routed.map((o) => o.op)).toEqual(["updateComponent"]);
    doc = commit(doc, routed);
    expect(doc.nodes[buttonId]?.style.desktop.radius).toBe(8);
    expect(withVariant(doc, "btn", "size=large").nodes[buttonId]?.style.desktop.radius).toBe(20);
    const c = doc.components.btn;
    if (!c) throw new Error("gone");
    doc = commit(doc, setVariantOps(c, doc.nodes.inst1 as InstanceNode, "size", "large"));
    for (const fw of ["nextjs", "astro"] as const) {
      expect(page(doc, fw)).toContain('size="large"');
      expect(compile(doc, fw).instanceCss?.inst1?.[buttonId]?.desktop).toContain(
        "border-radius: 20px",
      );
    }
    expect(compile(doc, "nextjs").files["components/Button.tsx"]).toMatch(
      /size\?: "default" \| "large"/,
    );
    // Detach keeps the variant's look.
    const d = detachOps(doc, "inst1", ids);
    const detached = commit(doc, d?.ops ?? []);
    expect(detached.nodes[d?.rootId ?? ""]?.style.desktop.radius).toBe(20);
  });

  it("removing a value drops its styles and resets instances that used it", () => {
    let { doc, buttonId } = withButton();
    const add = addVariantPropOps(doc, "btn", "tone", "light, dark");
    if (!add.ok) throw new Error(add.message);
    doc = commit(doc, add.ops);
    doc = commit(
      doc,
      routeToVariant(doc, "btn", "tone=dark", [
        { op: "setProp", nodeId: buttonId, breakpoint: "desktop", key: "opacity", value: 0.5 },
      ]),
    );
    const c = doc.components.btn;
    if (!c) throw new Error("gone");
    doc = commit(doc, setVariantOps(c, doc.nodes.inst1 as InstanceNode, "tone", "dark"));
    doc = commit(
      doc,
      setVariantPropsOps(doc, "btn", [{ name: "tone", values: ["light"], default: "light" }]),
    );
    expect(doc.components.btn?.variants).toEqual({});
    expect((doc.nodes.inst1 as InstanceNode).overrides.variant).toEqual({});
  });
});

describe("variables in variants", () => {
  it("deleting a variable detaches it from variant styles too", async () => {
    const { deleteVariableOps } = await import("./variables.ts");
    let { doc, buttonId } = withButton();
    const add = addVariantPropOps(doc, "btn", "tone", "light, dark");
    if (!add.ok) throw new Error(add.message);
    doc = commit(doc, add.ops);
    doc = commit(
      doc,
      routeToVariant(doc, "btn", "tone=dark", [
        {
          op: "setProp",
          nodeId: buttonId,
          breakpoint: "desktop",
          key: "textColor",
          value: { var: "ink" },
        },
      ]),
    );
    doc = commit(doc, deleteVariableOps(doc, "ink"));
    expect(doc.components.btn?.variants["tone=dark"]?.[buttonId]?.desktop?.textColor).toBe(
      "#111827",
    );
  });
});
