import { readFileSync } from "node:fs";
import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import {
  activeBreakpoints,
  type BreakpointId,
  type Node,
  PROP_KEYS,
  type ProjectDocument,
  parseDocument,
} from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createVariableOps,
  cssNameFor,
  deleteVariableOps,
  duplicateVariableOps,
  groupsOf,
  kebab,
  tokensPreview,
  updateVariableOps,
  usageCounts,
  type VariableDraft,
  valueAt,
} from "./variables.ts";

beforeAll(() => initCompilerFromDisk());

const fixture = (): ProjectDocument =>
  parseDocument(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/compiler/variables/input.json", import.meta.url),
        "utf8",
      ),
    ),
  );

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, { pagesPerProject: 100 });
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

const tokens = (doc: ProjectDocument, framework: "nextjs" | "astro" = "nextjs") => {
  const files = compile(doc, framework).files;
  return files[framework === "nextjs" ? "app/tokens.css" : "src/styles/tokens.css"] ?? "";
};

/** Every prop of a node at a breakpoint with variables replaced by their values. */
function resolved(doc: ProjectDocument, node: Node, bp: BreakpointId) {
  const out: Record<string, unknown> = {};
  for (const key of PROP_KEYS) {
    let v: unknown;
    for (const b of activeBreakpoints(doc.breakpoints)) {
      const x = node.style[b]?.[key];
      if (x !== undefined) v = x;
      if (b === bp) break;
    }
    if (v === undefined) continue;
    out[key] = JSON.parse(JSON.stringify(v), (_k, x) => {
      if (x && typeof x === "object" && typeof x.var === "string") {
        const variable = doc.variables[x.var];
        return variable ? valueAt(doc, variable, bp) : x;
      }
      return x;
    });
  }
  // A text style resolves into its parts; a part set on the layer wins.
  const font = out.font as Record<string, unknown> | undefined;
  if (font) {
    const parts = [
      ["fontFamily", "family"],
      ["fontWeight", "weight"],
      ["fontSize", "size"],
      ["lineHeight", "lineHeight"],
      ["letterSpacing", "letterSpacing"],
    ];
    for (const [key, part] of parts) out[key as string] ??= font[part as string];
    delete out.font;
  }
  return out;
}

describe("CSS names", () => {
  it("joins group and name like the compiler's kebab-case", () => {
    expect(cssNameFor("Brand", "Accent")).toBe("--brand-accent");
    expect(cssNameFor("", "Space MD")).toBe("--space-md");
    expect(cssNameFor("Brand", "HeroBlue")).toBe("--brand-hero-blue");
    expect(cssNameFor("", "2xl")).toBe("--v-2xl");
    expect(cssNameFor("", "  ")).toBe("--variable");
    expect(cssNameFor("Größe", "Café")).toBe("--gro-e-cafe");
    expect(kebab("IBM Plex Sans")).toBe("ibm-plex-sans");
  });
});

describe("create", () => {
  const drafts: VariableDraft[] = [
    {
      type: "color",
      name: "Highlight",
      group: "Brand",
      value: { desktop: "#ff0066", tablet: "#ee0055", mobile: "#dd0044" },
    },
    { type: "spacing", name: "Section", group: "Space", value: { desktop: 96, mobile: 48 } },
    {
      type: "font",
      name: "Body",
      group: "Text",
      value: {
        desktop: { family: "Inter", weight: 400, size: 18, lineHeight: 1.6, letterSpacing: 0 },
        tablet: { family: "Inter", weight: 400, size: 17, lineHeight: 1.6, letterSpacing: 0 },
        mobile: { family: "Inter", weight: 500, size: 16, lineHeight: 1.5, letterSpacing: 0.01 },
      },
    },
  ];
  for (const draft of drafts) {
    it(`a ${draft.type} variable compiles to tokens.css exactly as previewed`, () => {
      const doc = fixture();
      const { ops, variable } = createVariableOps(doc, draft, "new1");
      const next = commit(doc, ops);
      const preview = tokensPreview(next, draft, variable.cssName);
      for (const framework of ["nextjs", "astro"] as const) {
        const css = tokens(next, framework);
        // Each preview line is in the compiled file, and the media blocks hold the same lines.
        for (const line of preview.split("\n").filter((l) => l.includes("--")))
          expect(css).toContain(line.trim());
        expect(css).toContain(`@media (width < 1200px)`);
      }
      expect(tokens(doc)).not.toContain(variable.cssName);
    });
  }

  it("numbers a CSS name that is taken", () => {
    const doc = fixture();
    const { variable } = createVariableOps(
      doc,
      { type: "color", name: "Accent", group: "Brand", value: { desktop: "#000000" } },
      "x",
    );
    expect(variable.cssName).toBe("--brand-accent-2");
  });
});

describe("edit", () => {
  it("changing a value updates the compiled CSS", () => {
    const doc = fixture();
    const v = doc.variables.accent;
    if (v?.type !== "color") throw new Error("fixture");
    const next = commit(
      doc,
      updateVariableOps(doc, "accent", {
        type: "color",
        name: v.name,
        group: v.group,
        value: { desktop: "#00ff00" },
      }),
    );
    expect(tokens(next)).toContain("--brand-accent: #00ff00;");
    expect(tokens(next)).not.toContain("#d11d1a");
  });

  it("renaming renames the custom property and every reference to it", () => {
    const doc = fixture();
    const v = doc.variables.accent;
    if (v?.type !== "color") throw new Error("fixture");
    const next = commit(
      doc,
      updateVariableOps(doc, "accent", { ...v, name: "Primary", value: v.value }),
    );
    expect(next.variables.accent?.cssName).toBe("--brand-primary");
    const out = compile(next, "nextjs");
    expect(out.files["app/tokens.css"]).toContain("--color-brand-primary: var(--brand-primary);");
    const all = Object.values(out.files).join("\n");
    expect(all).not.toContain("--brand-accent");
    expect(all).toContain("(--brand-primary)");
  });
});

describe("usage and delete", () => {
  it("counts layers that use each variable", () => {
    const doc = fixture();
    const counts = usageCounts(doc);
    expect(counts.get("accent")).toBeGreaterThan(0);
    expect([...counts.keys()].every((id) => doc.variables[id])).toBe(true);
  });

  for (const id of ["accent", "ink", "gutter", "stack", "display"]) {
    it(`deleting "${id}" detaches every use and keeps what each layer showed`, () => {
      const doc = fixture();
      if (!doc.variables[id]) return;
      const next = commit(doc, deleteVariableOps(doc, id));
      expect(next.variables[id]).toBeUndefined();
      expect(usageCounts(next).get(id)).toBeUndefined();
      for (const node of Object.values(doc.nodes)) {
        const after = next.nodes[node.id];
        if (!after) throw new Error("node removed");
        for (const bp of activeBreakpoints(doc.breakpoints))
          expect(resolved(next, after, bp), `${node.id} at ${bp}`).toEqual(resolved(doc, node, bp));
      }
      // And the compiled file no longer mentions it.
      expect(tokens(next)).not.toContain(doc.variables[id]?.cssName ?? "");
    });
  }
});

describe("duplicate and list", () => {
  it("duplicates with a copy name and its own CSS name", () => {
    const doc = fixture();
    const r = duplicateVariableOps(doc, "accent", "accent2");
    const next = commit(doc, r.ops);
    expect(next.variables.accent2?.name).toBe("Accent copy");
    expect(next.variables.accent2?.cssName).toBe("--brand-accent-copy");
    expect(next.variables.accent2?.value).toEqual(doc.variables.accent?.value);
    const again = commit(next, duplicateVariableOps(next, "accent", "accent3").ops);
    expect(again.variables.accent3?.name).toBe("Accent copy 2");
  });

  it("groups by group name and filters by search", () => {
    const doc = fixture();
    const groups = groupsOf(doc, "color");
    expect(groups.map((g) => g.group)).toEqual(["Brand", "Neutral"]);
    expect(groupsOf(doc, "color", "ink").flatMap((g) => g.variables.map((v) => v.id))).toEqual([
      "ink",
    ]);
  });
});
