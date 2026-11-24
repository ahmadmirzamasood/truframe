import { TEMPLATE_IDS } from "@truframe/protocol";
import { describe, expect, it } from "vitest";
import { TEMPLATES, templateDocument } from "./templates.ts";

type Doc = { schemaVersion: number; breakpoints: Record<string, number>; pages: Page[] };
type Page = { id: string; path: string; nodes: unknown[] };

describe("templates", () => {
  it("offers exactly the template ids the API accepts", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
  });

  it.each(TEMPLATES.map((t) => t.id))("%s is a well-formed starter document", (id) => {
    const doc = templateDocument(id) as Doc;
    expect(doc.schemaVersion).toBe(0);
    expect(doc.breakpoints).toEqual({ desktop: 1200, tablet: 810, mobile: 390 });
    expect(doc.pages[0]?.path).toBe("/");
    const paths = doc.pages.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("returns a fresh copy each time", () => {
    const a = templateDocument("landing") as Doc;
    a.pages = [];
    expect((templateDocument("landing") as Doc).pages.length).toBeGreaterThan(0);
  });
});
