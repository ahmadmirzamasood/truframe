import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@truframe/ops", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@truframe/ops");
  });
});
