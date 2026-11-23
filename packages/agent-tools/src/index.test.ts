import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("@truframe/agent-tools", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@truframe/agent-tools");
  });
});
