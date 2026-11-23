import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@truframe/skills", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@truframe/skills");
  });
});
