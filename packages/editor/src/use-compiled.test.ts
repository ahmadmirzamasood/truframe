import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import { templateDocument } from "@truframe/model";
import { beforeAll, describe, expect, it } from "vitest";
import { codeClasses } from "./use-compiled.ts";

beforeAll(() => initCompilerFromDisk());

describe("code classes", () => {
  for (const framework of ["nextjs", "astro"] as const) {
    it(`reads each layer's first class from the ${framework} output`, () => {
      const doc = templateDocument("landing", {
        projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
        framework,
      });
      const out = compile(doc);
      const classes = codeClasses(out.files, out.spans);
      const page = doc.pages[0];
      const body = page ? doc.nodes[page.root] : undefined;
      if (body?.type !== "frame") throw new Error("no body");
      expect(classes.get(body.id)).toBe("body");
      expect(body.children.map((id) => classes.get(id))).toEqual([
        "hero",
        "features",
        "call-to-action",
      ]);
      // Every rendered layer has one, and they are unique on the page.
      const values = [...classes.values()];
      expect(new Set(values).size).toBe(values.length);
    });
  }
});
