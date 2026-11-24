/**
 * Runs real Tailwind v4 over the compiler's output: every utility class the compiler emits
 * must produce CSS, and no layer code class may (PRD F27). This guards the style engine's
 * scale snapping, arbitrary values and variable references against Tailwind's actual parser.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile as compileCss } from "@tailwindcss/node";
import { createDocument, type Node, type ProjectDocument, type Props } from "@truframe/model";
import { beforeAll, describe, expect, it } from "vitest";
import { compile, initCompilerFromDisk } from "./node.ts";

beforeAll(() => initCompilerFromDisk());

/** One frame per style: covers every slot of the style engine. */
const STYLES: Array<{ desktop: Props; tablet?: Props; mobile?: Props }> = [
  { desktop: { display: "stack", direction: "column", gap: 18, align: "center" } },
  { desktop: { display: "stack", wrap: true, justify: "evenly", gap: 13, rowGap: 6 } },
  { desktop: { display: "grid", gridColumns: 3, gridRows: 2, gap: { var: "space" } } },
  {
    desktop: { padding: { top: 1, right: 2, bottom: 3, left: 4 } },
    tablet: { padding: { top: 8, right: 24, bottom: 8, left: 24 } },
    mobile: { padding: { top: 12, right: 12, bottom: 12, left: 12 } },
  },
  {
    desktop: { width: { type: "fixed", value: 321 }, height: { type: "fixed", value: 1200 } },
    mobile: { width: { type: "fill" }, height: { type: "fit" } },
  },
  { desktop: { minWidth: 100, maxWidth: 1200, minHeight: 3, maxHeight: 0, aspectRatio: 1.5 } },
  { desktop: { aspectRatio: 1 }, tablet: { aspectRatio: 16 / 9 } },
  { desktop: { position: "absolute", top: -13, right: -8, bottom: 0, left: 16, zIndex: -1 } },
  { desktop: { zIndex: 10, overflow: "clip" }, mobile: { overflow: "visible" } },
  {
    desktop: { fontFamily: "Inter", fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
    tablet: { fontSize: 14, letterSpacing: 0.02 },
    mobile: { fontSize: 48, letterSpacing: -0.025, lineHeight: 1 },
  },
  { desktop: { fontFamily: "Georgia", textAlign: "justify", textTransform: "uppercase" } },
  { desktop: { font: { var: "heading" }, textDecoration: "line-through" } },
  { desktop: { textColor: "#111111" }, mobile: { textColor: { var: "brand" } } },
  {
    desktop: { fill: { type: "solid", color: "#ffffff" } },
    tablet: {
      fill: {
        type: "linearGradient",
        angle: 90,
        stops: [
          { color: "#000000", position: 0 },
          { color: { var: "brand" }, position: 0.5 },
          { color: "#ffffff", position: 1 },
        ],
      },
    },
  },
  { desktop: { fill: { type: "solid", color: { var: "brand" } } } },
  {
    desktop: {
      border: {
        width: 3,
        color: "#e5e5e5",
        style: "dashed",
        sides: { top: false, right: false, bottom: true, left: false },
      },
      radius: { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 10 },
    },
    mobile: {
      border: {
        width: 1,
        color: { var: "brand" },
        style: "solid",
        sides: { top: true, right: true, bottom: true, left: true },
      },
      radius: 9999,
    },
  },
  {
    desktop: {
      shadows: [
        { x: 0, y: 1, blur: 2, spread: 0, color: "#00000033", inset: true },
        { x: 0, y: 8, blur: 24, spread: -4, color: { var: "brand" }, inset: false },
      ],
      opacity: 0.333,
      blend: "color-dodge",
      blur: 4,
    },
    tablet: { shadows: [], opacity: 0.5, blend: "normal", blur: 0 },
  },
  { desktop: { radius: 12, display: "stack" }, tablet: { display: "grid", gridColumns: 2 } },
];

function styleGallery(): ProjectDocument {
  let n = 0;
  const doc = createDocument({
    id: "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b",
    framework: "nextjs",
    ids: () => `id${++n}`,
  });
  const root = doc.nodes[doc.pages[0]?.root ?? ""];
  if (root?.type !== "frame") throw new Error("no root");
  doc.variables = {
    brand: {
      id: "brand",
      type: "color",
      name: "Brand",
      group: "Brand",
      cssName: "--brand-accent",
      value: { desktop: "#ec221f", mobile: "#c01b18" },
    },
    space: {
      id: "space",
      type: "spacing",
      name: "Space M",
      group: "Spacing",
      cssName: "--space-md",
      value: { desktop: 24, tablet: 16 },
    },
    heading: {
      id: "heading",
      type: "font",
      name: "Heading",
      group: "Text",
      cssName: "--heading",
      value: {
        desktop: { family: "Inter", weight: 700, size: 48, lineHeight: 1.1, letterSpacing: -0.02 },
        mobile: { family: "Inter", weight: 700, size: 32, lineHeight: 1.2, letterSpacing: 0 },
      },
    },
  };
  STYLES.forEach((style, i) => {
    const id = `s${i}`;
    // Absolute children make their parent `relative`; nest one to cover that too.
    const node: Node = {
      id,
      type: "frame",
      name: ["Container", "Flex", "Text center", "Card"][i % 4] ?? "Card",
      tag: "div",
      style,
      hidden: i === 3 ? { tablet: true, mobile: false } : undefined,
      children: [],
    };
    if (node.hidden === undefined) delete node.hidden;
    doc.nodes[id] = node;
    root.children.push(id);
  });
  return doc;
}

/** How Tailwind escapes a class in a selector. */
function selector(cls: string): string {
  return `.${cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`;
}

function classesIn(files: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const text of Object.values(files)) {
    for (const m of text.matchAll(/class(?:Name)?="([^"]*)"/g)) {
      for (const c of (m[1] ?? "").split(/\s+/)) if (c) out.add(c);
    }
  }
  return [...out].sort();
}

async function tailwind(files: Record<string, string>, entry: string, candidates: string[]) {
  const base = dirname(fileURLToPath(import.meta.url));
  const tokens = files[entry.replace(/[^/]+$/, "tokens.css")] ?? "";
  // Inline tokens.css so the compile doesn't need the generated project on disk.
  const css = (files[entry] ?? "").replace(/@import "\.\/tokens\.css";/, tokens);
  const compiler = await compileCss(css, { base, onDependency: () => {} });
  return compiler.build(candidates);
}

describe("generated classes against Tailwind v4", () => {
  for (const framework of ["nextjs", "astro"] as const) {
    it(`every utility produces CSS and no code class does (${framework})`, async () => {
      const out = compile(styleGallery(), framework);
      const entry = framework === "nextjs" ? "app/globals.css" : "src/styles/global.css";
      const classes = classesIn(out.files);
      const css = await tailwind(out.files, entry, classes);
      const codeClasses = new Set(
        Object.values(out.files).flatMap((t) =>
          [...t.matchAll(/class(?:Name)?="([^ "]+)/g)].map((m) => m[1] ?? ""),
        ),
      );
      const missing = classes.filter((c) => !codeClasses.has(c) && !css.includes(selector(c)));
      expect(missing).toEqual([]);
      const leaking = [...codeClasses].filter((c) => css.includes(`${selector(c)} `));
      expect(leaking).toEqual([]);
      expect(classes.length).toBeGreaterThan(80);
    });
  }

  it("declares the breakpoint variants as max-width media queries", async () => {
    const out = compile(styleGallery());
    const css = await tailwind(out.files, "app/globals.css", ["tablet:gap-4", "mobile:gap-2"]);
    expect(css).toMatch(/@media \(width < 1200px\)\s*\{\s*\.tablet\\:gap-4\s*\{\s*gap: calc/);
    expect(css).toMatch(/@media \(width < 810px\)\s*\{\s*\.mobile\\:gap-2\s*\{\s*gap: calc/);
    // Mobile is declared after tablet, so it wins where both match.
    expect(css.indexOf("width < 810px")).toBeGreaterThan(css.indexOf("width < 1200px"));
  });

  it("writes per-breakpoint variable values to tokens.css", () => {
    const tokens = compile(styleGallery()).files["app/tokens.css"] ?? "";
    expect(tokens).toContain("--brand-accent: #ec221f;");
    expect(tokens).toMatch(/@media \(width < 1200px\) \{\s*:root \{\s*--space-md: 16px;/);
    expect(tokens).toMatch(
      /@media \(width < 810px\) \{\s*:root \{\s*--brand-accent: #c01b18;\s*--heading-size: 32px;\s*--heading-line-height: 1.2;\s*--heading-letter-spacing: 0em;/,
    );
    expect(tokens).toContain("--color-brand-accent: var(--brand-accent);");
    expect(tokens).toContain("--tf-font-georgia: Georgia, serif;");
  });

  it("puts the layer code class first, guarded against Tailwind names", () => {
    const page = compile(styleGallery()).files["app/page.tsx"] ?? "";
    expect(page).toContain('className="container-el flex flex-col');
    expect(page).toContain('className="flex-el flex flex-wrap');
    expect(page).toContain('className="text-center-el grid');
    expect(page).toContain('className="container-el-2 ');
  });
});
