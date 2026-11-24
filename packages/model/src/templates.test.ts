import { TEMPLATE_IDS } from "@truframe/protocol";
import { describe, expect, it } from "vitest";
import { checkIntegrity, documentSchema } from "./document.ts";
import { TEMPLATES, templateDocument } from "./templates.ts";

const projectId = "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b";

describe("templates", () => {
  it("offers exactly the template ids the API accepts", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
  });

  it.each(TEMPLATES.flatMap((t) => [[t.id, "nextjs"] as const, [t.id, "astro"] as const]))(
    "%s (%s) expands to a valid document",
    (id, framework) => {
      const doc = templateDocument(id, { projectId, framework });
      expect(documentSchema.safeParse(doc).success).toBe(true);
      expect(checkIntegrity(doc)).toEqual([]);
      expect(doc.id).toBe(projectId);
      expect(doc.framework).toBe(framework);
      expect(doc.breakpoints).toEqual({
        desktop: { width: 1200 },
        tablet: { width: 810 },
        mobile: { width: 390 },
      });
      expect(doc.pages[0]?.path).toBe("/");
    },
  );

  it("is deterministic and returns a fresh copy each time", () => {
    const a = templateDocument("landing", { projectId, framework: "nextjs" });
    const b = templateDocument("landing", { projectId, framework: "nextjs" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    a.pages = [];
    expect(
      templateDocument("landing", { projectId, framework: "nextjs" }).pages.length,
    ).toBeGreaterThan(0);
  });

  it("gives the landing page sections, headings and a button bound to the accent color", () => {
    const doc = templateDocument("landing", { projectId, framework: "nextjs" });
    const nodes = Object.values(doc.nodes);
    expect(nodes.filter((n) => n.tag === "section")).toHaveLength(3);
    expect(nodes.filter((n) => n.tag === "h1")).toHaveLength(1);
    const button = nodes.find((n) => n.type === "link");
    expect(button?.style.desktop.fill).toEqual({ type: "solid", color: { var: "accent" } });
  });
});
