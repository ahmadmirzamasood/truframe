import { createDocument } from "@truframe/model";
import { beforeAll, describe, expect, it } from "vitest";
import { compile, compileJson, compilerOutputVersion, initCompilerFromDisk } from "./node.ts";

beforeAll(() => initCompilerFromDisk());

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const blank = (framework: "nextjs" | "astro") =>
  createDocument({ id: "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b", framework, ids: ids() });

describe("compiler (WASM)", () => {
  it("compiles a blank Next.js project", () => {
    const out = compile(blank("nextjs"));
    expect(out.files["app/page.tsx"]).toContain('<main className="body"');
    expect(out.files["app/layout.tsx"]).toContain('<html lang="en">');
    expect(out.spans).toContainEqual(
      expect.objectContaining({ node: "id2", path: "app/page.tsx" }),
    );
  });

  it("compiles a blank Astro project", () => {
    const out = compile(blank("astro"));
    expect(out.files["src/pages/index.astro"]).toContain('<main class="body"');
  });

  it("overrides the framework", () => {
    expect(Object.keys(compile(blank("nextjs"), "astro").files)).toContain("src/pages/index.astro");
  });

  it("is deterministic", () => {
    const doc = blank("nextjs");
    expect(JSON.stringify(compile(doc))).toBe(JSON.stringify(compile(structuredClone(doc))));
  });

  it("spans point at the element text (UTF-16 offsets)", () => {
    const out = compile(blank("nextjs"));
    const span = out.spans.find((s) => s.node === "id2");
    const text = out.files[span?.path ?? ""] ?? "";
    expect(text.slice(span?.start, span?.end)).toMatch(/^<main[\s\S]*\/>$/);
  });

  it("throws an Error for documents it can't read, without crashing the module", () => {
    expect(() => compileJson("{}")).toThrow(/invalid document/);
    expect(() => compileJson('{"schemaVersion": 99}')).toThrow();
    expect(() => compile(blank("nextjs"), "vue" as never)).toThrow(/unknown framework/);
    // The module still works afterwards.
    expect(compile(blank("astro")).files["src/pages/index.astro"]).toBeDefined();
  });

  it("reports the output contract version", () => {
    expect(compilerOutputVersion()).toBe(1);
  });
});
