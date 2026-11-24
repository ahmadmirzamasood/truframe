import { describe, expect, it } from "vitest";
import worker from "./index.ts";

const env = { ROOM_TOKEN_SECRET: "x".repeat(40) } as Env;

describe("truframe-realtime worker", () => {
  it("answers a health check", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: "truframe-realtime", ok: true });
  });

  it("only upgrades /rooms/<id> WebSocket requests", async () => {
    expect((await worker.fetch(new Request("http://localhost/nope"), env)).status).toBe(404);
    expect((await worker.fetch(new Request("http://localhost/rooms/abc"), env)).status).toBe(426);
  });
});
