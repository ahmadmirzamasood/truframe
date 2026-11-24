import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    [undefined, "/dashboard"],
    ["/p/123", "/p/123"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    [["/a", "/b"], "/a"],
  ])("%o → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
