import { describe, expect, it } from "vitest";
import { isUuid, uuidv7 } from "./ids.ts";

describe("uuidv7", () => {
  it("has version 7 and RFC 9562 variant bits", () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("sorts by creation time and is random within a millisecond", () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
    expect(uuidv7(5)).not.toBe(uuidv7(5));
  });
});
