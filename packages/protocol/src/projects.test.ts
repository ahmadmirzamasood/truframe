import { describe, expect, it } from "vitest";
import { createProjectInput, projectNameSchema, renameProjectInput } from "./projects.ts";

describe("project schemas", () => {
  it("trims names and defaults the template to blank", () => {
    expect(createProjectInput.parse({ name: "  Site  ", framework: "astro" })).toEqual({
      name: "Site",
      framework: "astro",
      templateId: "blank",
    });
  });

  it.each(["", "   ", "x".repeat(81), "bad\u0000name"])("rejects name %j", (name) => {
    expect(projectNameSchema.safeParse(name).success).toBe(false);
  });

  it("rejects unknown frameworks and templates", () => {
    expect(createProjectInput.safeParse({ name: "a", framework: "remix" }).success).toBe(false);
    expect(
      createProjectInput.safeParse({ name: "a", framework: "nextjs", templateId: "shop" }).success,
    ).toBe(false);
  });

  it("allows names with HTML characters (rendered escaped)", () => {
    expect(renameProjectInput.parse({ name: "<b>Site</b>" }).name).toBe("<b>Site</b>");
  });
});
