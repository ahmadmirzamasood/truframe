import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ProjectDocument, parseDocument } from "@truframe/model";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cascadeFor, fontSlug, frameStylesheet, parseTokens } from "./css.ts";
import { renderFrame } from "./react.ts";
import { buildPageTree, type RChild, type RElement } from "./tree.ts";

const root = join(import.meta.dirname, "..", "..", "..", "fixtures", "compiler");
type Output = {
  css: Record<string, { desktop: string; tablet?: string; mobile?: string }>;
  spans: { node: string; path: string; start: number; end: number }[];
  assets: { assetId: string; path: string }[];
};

const fixtures = readdirSync(root)
  .sort()
  .map((name) => {
    const dir = join(root, name);
    const doc = parseDocument(JSON.parse(readFileSync(join(dir, "input.json"), "utf8")));
    const exp = join(dir, "expected", "nextjs");
    const output = JSON.parse(readFileSync(join(exp, "output.json"), "utf8")) as Output;
    const file = (p: string) => readFileSync(join(exp, "files", p), "utf8");
    return { name, doc, output, file };
  });

function pageFile(path: string) {
  return path === "/" ? "app/page.tsx" : `app${path}/page.tsx`;
}

/** Layer id → tag, in document order, as the renderer draws it. */
function rendered(
  el: RChild,
  isInline: (instanceId: string) => boolean,
  out: [string, string][] = [],
  inline = false,
): [string, string][] {
  if (typeof el === "string") return out;
  // Inline instances (instances with per-layer overrides) are spanned by component layer id.
  const id = el.attrs["data-tf-node"] ?? (inline ? el.attrs["data-tf-c"] : undefined);
  if (typeof id === "string") out.push([id, el.tag]);
  const node = el.attrs["data-tf-node"];
  const inner = inline || (typeof node === "string" && isInline(node));
  for (const c of el.children) rendered(c, isInline, out, inner);
  return out;
}

const COMPONENT_TAG = /^[A-Z]/;

describe("renderer element tree matches the compiler (all goldens, Next.js)", () => {
  for (const { name, doc, output, file } of fixtures) {
    it(name, () => {
      for (const page of doc.pages) {
        const path = pageFile(page.path);
        const source = file(path);
        // The compiler's spans: every layer element in that page file, in order.
        const expected = output.spans
          .filter((s) => s.path === path)
          .map((s) => {
            const tag = /^<([A-Za-z][\w.]*)/.exec(source.slice(s.start, s.end))?.[1] ?? "?";
            return [s.node, tag] as [string, string];
          });
        const tree = buildPageTree(doc, page.id, {
          assetUrl: (id) =>
            output.assets.find((a) => a.assetId === id)?.path.replace(/^public/, "") ?? null,
        });
        expect(tree).not.toBeNull();
        const got = rendered(tree as RElement, (id) => {
          const n = doc.nodes[id];
          return n?.type === "instance" && Object.keys(n.overrides.nodes).length > 0;
        });
        expect(got.map(([id]) => id)).toEqual(expected.map(([id]) => id));
        for (const [i, [id, tag]] of expected.entries()) {
          if (COMPONENT_TAG.test(tag) && tag !== "Link" && tag !== "Image") continue;
          const want = tag === "Link" ? "a" : tag === "Image" ? "img" : tag;
          expect([id, got[i]?.[1]]).toEqual([id, want]);
        }
      }
    });
  }
});

describe("frame stylesheet", () => {
  const landing = fixtures.find((f) => f.name === "template-landing");
  const variables = fixtures.find((f) => f.name === "variables");

  it("cascades desktop → tablet → mobile, skipping removed breakpoints", () => {
    const doc = landing?.doc as ProjectDocument;
    expect(cascadeFor(doc, "desktop")).toEqual(["desktop"]);
    expect(cascadeFor(doc, "mobile")).toEqual(["desktop", "tablet", "mobile"]);
    const noTablet = { ...doc, breakpoints: { desktop: { width: 1200 }, mobile: { width: 390 } } };
    expect(cascadeFor(noTablet, "mobile")).toEqual(["desktop", "mobile"]);
  });

  it("emits each layer's declarations in cascade order, scoped to the frame", () => {
    const { doc, output } = landing as (typeof fixtures)[number];
    const sheet = frameStylesheet(doc, output, "mobile");
    const id = Object.entries(output.css).find(([, c]) => c.mobile)?.[0] as string;
    const desktopAt = sheet.indexOf(
      `[data-tf-frame="mobile"] [data-tf-node="${id}"]{${output.css[id]?.desktop}}`,
    );
    const mobileAt = sheet.indexOf(
      `[data-tf-frame="mobile"] [data-tf-node="${id}"]{${output.css[id]?.mobile}}`,
    );
    expect(desktopAt).toBeGreaterThan(0);
    expect(mobileAt).toBeGreaterThan(desktopAt);
    expect(frameStylesheet(doc, output, "desktop")).not.toContain(output.css[id]?.mobile);
  });

  it("takes variable values per breakpoint from the compiler's tokens.css", () => {
    const { doc, file } = variables as (typeof fixtures)[number];
    const tokens = parseTokens(doc, file("app/tokens.css"));
    expect(tokens.desktop).toContain("--brand-accent: #ec221f;");
    expect(tokens.tablet).toContain("--brand-accent: #d11d1a;");
    expect(tokens.mobile).toContain("--brand-accent: #b01815;");
    const noTablet = { ...doc, breakpoints: { desktop: { width: 1200 }, mobile: { width: 390 } } };
    expect(
      parseTokens(
        noTablet,
        ":root {\n  --a: 1px;\n}\n@media (width < 1200px) {\n  :root {\n    --a: 2px;\n  }\n}",
      ),
    ).toEqual({
      desktop: "--a: 1px;",
      mobile: "--a: 2px;",
    });
  });

  it("slugs font families like the compiler", () => {
    expect(fontSlug("Playfair Display")).toBe("playfair-display");
    expect(fontSlug("IBM Plex Sans")).toBe("ibm-plex-sans");
    expect(fontSlug("!!")).toBe("custom");
  });
});

describe("React output", () => {
  it("renders a frame with its width, stylesheet and layer ids", () => {
    const { doc, output } = fixtures.find(
      (f) => f.name === "template-landing",
    ) as (typeof fixtures)[number];
    const page = doc.pages[0];
    const html = renderToStaticMarkup(
      renderFrame({
        doc,
        output,
        pageId: page?.id ?? "",
        breakpoint: "tablet",
      }) as React.ReactElement,
    );
    expect(html).toMatch(/^<div data-tf-frame="tablet" style="width:810px"><style>/);
    expect(html).toContain(`data-tf-node="${page?.root}"`);
    expect(html).toContain("Launch something people love");
  });
});
