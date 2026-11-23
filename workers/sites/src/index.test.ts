import { describe, expect, it } from "vitest";
import worker, { workerName } from "./index.ts";

describe("truframe-sites worker", () => {
  it("answers a health check", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: workerName, ok: true });
  });
});
