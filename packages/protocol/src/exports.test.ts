import { describe, expect, it } from "vitest";
import { imageExportInput } from "./exports.ts";

describe("image export input", () => {
  const ok = { pageId: "p1", breakpoint: "mobile", format: "webp", scale: 2 };
  it("accepts a page, breakpoint, format and scale", () => {
    expect(imageExportInput.parse(ok)).toEqual(ok);
  });
  it.each([
    { scale: 0 },
    { scale: 5 },
    { scale: 1.5 },
    { format: "gif" },
    { breakpoint: "watch" },
    { pageId: "" },
    { extra: true },
  ])("refuses %o", (patch) => {
    expect(imageExportInput.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});
