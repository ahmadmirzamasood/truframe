import { describe, expect, it } from "vitest";
import {
  fromBase64,
  ROOM_TOKEN_TTL_SECONDS,
  roomClientMessageSchema,
  roomTokenFromProtocols,
  signRoomToken,
  toBase64,
  verifyRoomToken,
} from "./room.ts";

const secret = "test-room-secret-0123456789abcdefghijklmnop";
const claims = {
  sub: "user-a",
  ws: "ws-a",
  pid: "project-a",
  role: "owner" as const,
  plan: "free" as const,
  framework: "nextjs" as const,
  templateId: "landing" as const,
};
const now = Date.UTC(2026, 10, 24, 12);

describe("room tokens (T2)", () => {
  it("round-trips claims and expires after 5 minutes", async () => {
    const { token, expiresAt } = await signRoomToken(claims, secret, now);
    expect(expiresAt).toBe(now + ROOM_TOKEN_TTL_SECONDS * 1000);
    const ok = await verifyRoomToken(token, secret, now + 299_000);
    expect(ok).toMatchObject({ ok: true, claims: { ...claims, v: 1 } });
    expect(await verifyRoomToken(token, secret, now + 300_000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await signRoomToken(claims, `${secret}-other`, now);
    expect(await verifyRoomToken(token, secret, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects edited claims (e.g. another project or role)", async () => {
    const { token } = await signRoomToken(claims, secret, now);
    const [body, sig] = token.split(".") as [string, string];
    const json = JSON.parse(atob(body.replaceAll("-", "+").replaceAll("_", "/")));
    const forged = btoa(JSON.stringify({ ...json, pid: "project-b", role: "owner" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(await verifyRoomToken(`${forged}.${sig}`, secret, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects malformed tokens", async () => {
    for (const bad of ["", "abc", "a.b.c", "!!.!!", `${"a".repeat(5000)}.b`]) {
      expect((await verifyRoomToken(bad, secret, now)).ok).toBe(false);
    }
  });

  it("refuses short secrets", async () => {
    await expect(signRoomToken(claims, "short", now)).rejects.toThrow(/at least 32/);
  });

  it("reads the token from the WebSocket subprotocol header", () => {
    expect(roomTokenFromProtocols("truframe.v1, abc.def")).toBe("abc.def");
    expect(roomTokenFromProtocols("other, abc.def")).toBeNull();
    expect(roomTokenFromProtocols(null)).toBeNull();
  });
});

describe("room messages", () => {
  it("accepts sync and tx messages and rejects others", () => {
    expect(roomClientMessageSchema.safeParse({ t: "sync", vv: null }).success).toBe(true);
    expect(
      roomClientMessageSchema.safeParse({ t: "tx", id: "tx_12345678", ops: [{ op: "x" }] }).success,
    ).toBe(true);
    expect(roomClientMessageSchema.safeParse({ t: "tx", id: "short", ops: [{}] }).success).toBe(
      false,
    );
    expect(roomClientMessageSchema.safeParse({ t: "update", data: "" }).success).toBe(false);
  });

  it("encodes binary as base64", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});
