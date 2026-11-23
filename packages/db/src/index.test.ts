import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@truframe/db", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@truframe/db");
  });
});
