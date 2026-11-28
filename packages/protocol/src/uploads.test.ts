import { describe, expect, it } from "vitest";
import { signRoomToken } from "./room.ts";
import { signUploadToken, UPLOAD_TOKEN_TTL_SECONDS, verifyUploadToken } from "./uploads.ts";

const SECRET = "x".repeat(40);
const claims = { sub: "u1", ws: "w1", pid: "p1", name: "logo.svg", max: 5_000_000 };

describe("upload tokens", () => {
  it("round-trips and expires", async () => {
    const { token } = await signUploadToken(claims, SECRET, 1_000_000);
    const ok = await verifyUploadToken(token, SECRET, 1_000_000 + 1000);
    expect(ok).toMatchObject({ ok: true, claims: { ...claims, v: 1 } });
    const late = await verifyUploadToken(
      token,
      SECRET,
      1_000_000 + UPLOAD_TOKEN_TTL_SECONDS * 1000,
    );
    expect(late).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampering, other secrets and room tokens signed with the same secret", async () => {
    const { token } = await signUploadToken(claims, SECRET);
    const [body, sig] = token.split(".");
    const forged = `${btoa(JSON.stringify({ ...JSON.parse(atob((body ?? "").replaceAll("-", "+").replaceAll("_", "/"))), max: 9e9 })).replace(/=+$/, "")}.${sig}`;
    expect(await verifyUploadToken(forged, SECRET)).toMatchObject({ ok: false });
    expect(await verifyUploadToken(token, "y".repeat(40))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    const room = await signRoomToken(
      {
        sub: "u1",
        ws: "w1",
        pid: "p1",
        role: "owner",
        plan: "free",
        framework: "nextjs",
        templateId: "blank",
      },
      SECRET,
    );
    expect(await verifyUploadToken(room.token, SECRET)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(await verifyUploadToken("nope", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });
});
