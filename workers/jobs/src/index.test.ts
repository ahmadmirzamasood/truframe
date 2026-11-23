import { describe, expect, it } from "vitest";
import worker from "./index.ts";

describe("truframe-jobs worker", () => {
  it("answers a health check", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: "truframe-jobs", ok: true });
  });
});

describe("truframe-jobs queue consumer", () => {
  it("acks every message", async () => {
    const acked: string[] = [];
    const messages = ["a", "b"].map((id) => ({ id, ack: () => acked.push(id) }));
    await worker.queue({ messages } as unknown as MessageBatch);
    expect(acked).toEqual(["a", "b"]);
  });
});
