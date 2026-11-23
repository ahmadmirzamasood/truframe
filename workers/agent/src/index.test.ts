import { describe, expect, it } from "vitest";
import worker from "./index.ts";

describe("truframe-agent worker", () => {
  it("answers a health check", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: "truframe-agent", ok: true });
  });
});
