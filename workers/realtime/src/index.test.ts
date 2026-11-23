import { describe, expect, it } from "vitest";
import worker from "./index.ts";

describe("truframe-realtime worker", () => {
  it("answers a health check", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: "truframe-realtime", ok: true });
  });
});

describe("ProjectRoom stub", () => {
  it("responds", async () => {
    const { ProjectRoom } = await import("./index.ts");
    const room = new ProjectRoom({} as DurableObjectState, {} as Env);
    expect(await (await room.fetch()).json()).toEqual({ durableObject: "ProjectRoom", ok: true });
  });
});
