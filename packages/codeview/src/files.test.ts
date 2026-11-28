import { describe, expect, it } from "vitest";
import {
  buildFileTree,
  languageFor,
  nodeAt,
  parentFolders,
  type Span,
  searchFiles,
  spanFor,
} from "./files.ts";

describe("buildFileTree", () => {
  it("nests folders, folders first, sorted by name", () => {
    const tree = buildFileTree([
      "package.json",
      "app/page.tsx",
      "app/about/page.tsx",
      "README.md",
      "app/globals.css",
      "components/Card.tsx",
    ]);
    expect(tree.map((e) => e.name)).toEqual(["app", "components", "package.json", "README.md"]);
    const app = tree[0];
    expect(app?.kind === "folder" && app.children.map((c) => c.path)).toEqual([
      "app/about",
      "app/globals.css",
      "app/page.tsx",
    ]);
  });

  it("lists the folders above a file", () => {
    expect(parentFolders("src/pages/blog/post.astro")).toEqual([
      "src",
      "src/pages",
      "src/pages/blog",
    ]);
    expect(parentFolders("README.md")).toEqual([]);
  });
});

describe("searchFiles", () => {
  const files = {
    "b.tsx": 'const a = 1;\n  <h1 className="hero-title">Hello</h1>\n',
    "a.css": ".hero { color: red }\n.Hero2 {}\n",
  };

  it("finds every match with line, column and offsets, in path order", () => {
    const { results, total } = searchFiles(files, "hero");
    expect(total).toBe(3);
    expect(results.map((r) => r.path)).toEqual(["a.css", "b.tsx"]);
    const m = results[1]?.matches[0];
    expect(m).toMatchObject({ line: 2, column: 18 });
    expect(files["b.tsx"].slice(m?.from, m?.to)).toBe("hero");
    expect(m?.preview.slice(m.previewFrom, m.previewFrom + 4)).toBe("hero");
    expect(m?.preview.startsWith("<h1")).toBe(true);
  });

  it("is case-insensitive unless asked", () => {
    expect(searchFiles(files, "HERO").total).toBe(3);
    expect(searchFiles(files, "Hero", { caseSensitive: true }).total).toBe(1);
  });

  it("stops at the limit and says so", () => {
    const r = searchFiles({ "x.txt": "aaaa", "y.txt": "aa" }, "a", { limit: 5 });
    expect(r.total).toBe(5);
    expect(r.truncated).toBe(true);
    expect(r.results.map((x) => x.matches.length)).toEqual([4, 1]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchFiles(files, "")).toEqual({ results: [], total: 0, truncated: false });
  });
});

describe("span lookups", () => {
  const spans: Span[] = [
    { node: "root", path: "app/page.tsx", start: 10, end: 200 },
    { node: "title", path: "app/page.tsx", start: 40, end: 80 },
    { node: "card", path: "app/page.tsx", start: 90, end: 120 },
    { node: "card-title", path: "components/Card.tsx", start: 30, end: 60 },
    { node: "card", path: "components/Card.tsx", start: 20, end: 90 },
  ];

  it("picks the innermost element under the cursor", () => {
    expect(nodeAt(spans, "app/page.tsx", 50)).toBe("title");
    expect(nodeAt(spans, "app/page.tsx", 85)).toBe("root");
    expect(nodeAt(spans, "app/page.tsx", 200)).toBeNull();
    expect(nodeAt(spans, "components/Card.tsx", 40)).toBe("card-title");
  });

  it("reveals a layer in the preferred file first", () => {
    expect(spanFor(spans, "card", ["components/Card.tsx"])?.path).toBe("components/Card.tsx");
    expect(spanFor(spans, "card", [null, "app/page.tsx"])?.path).toBe("app/page.tsx");
    expect(spanFor(spans, "card-title")?.path).toBe("components/Card.tsx");
    expect(spanFor(spans, "missing")).toBeNull();
  });
});

describe("languageFor", () => {
  it("maps generated files to a highlighter", () => {
    expect(
      [
        "app/page.tsx",
        "astro.config.mjs",
        "src/pages/index.astro",
        "app/globals.css",
        "package.json",
        "README.md",
        ".gitignore",
        "next.config.ts",
      ].map(languageFor),
    ).toEqual(["tsx", "js", "astro", "css", "json", "markdown", "text", "ts"]);
  });
});
