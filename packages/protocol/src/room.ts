/**
 * ProjectRoom wire protocol (ARCHITECTURE §7, SECURITY "Room tokens").
 *
 * The web app issues a short-lived room token after checking the session and the project's
 * workspace. The realtime worker verifies it before a WebSocket reaches the ProjectRoom. The
 * token is `<base64url(JSON claims)>.<base64url(HMAC-SHA256)>`, signed with
 * `ROOM_TOKEN_SECRET`, which both workers hold. Browsers send it as the second WebSocket
 * subprotocol (`["truframe.v1", token]`), so it never appears in URLs or access logs.
 */
import { z } from "zod";

export const ROOM_PROTOCOL = "truframe.v1";
export const ROOM_TOKEN_TTL_SECONDS = 5 * 60;
/** Largest WebSocket message a room accepts. */
export const ROOM_MAX_MESSAGE_BYTES = 1024 * 1024;

export const roomClaimsSchema = z.strictObject({
  v: z.literal(1),
  /** User id. */
  sub: z.string().min(1),
  /** Workspace id. */
  ws: z.string().min(1),
  /** Project id: the room the token opens. */
  pid: z.string().min(1),
  role: z.enum(["owner", "editor", "viewer"]),
  plan: z.enum(["free", "pro"]),
  /** Used once, to seed a new document. */
  framework: z.enum(["nextjs", "astro"]),
  templateId: z.enum(["blank", "landing", "portfolio", "saas"]),
  /** Issued at / expires at, in Unix seconds. */
  iat: z.number().int(),
  exp: z.number().int(),
});
export type RoomClaims = z.infer<typeof roomClaimsSchema>;

export type RoomTokenFailure = "malformed" | "bad_signature" | "expired";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  if (secret.length < 32) throw new Error("ROOM_TOKEN_SECRET must be at least 32 characters");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Signs claims; `iat` and `exp` are set from `now` (milliseconds). */
export async function signRoomToken(
  claims: Omit<RoomClaims, "v" | "iat" | "exp">,
  secret: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const iat = Math.floor(now / 1000);
  const full: RoomClaims = { v: 1, ...claims, iat, exp: iat + ROOM_TOKEN_TTL_SECONDS };
  const body = base64url(encoder.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return { token: `${body}.${base64url(new Uint8Array(sig))}`, expiresAt: full.exp * 1000 };
}

/** Verifies the signature first (constant time), then the claims and expiry. */
export async function verifyRoomToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<{ ok: true; claims: RoomClaims } | { ok: false; reason: RoomTokenFailure }> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 4096)
    return { ok: false, reason: "malformed" };
  const sigBytes = fromBase64url(sig);
  const bodyBytes = fromBase64url(body);
  if (!sigBytes || !bodyBytes) return { ok: false, reason: "malformed" };
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    sigBytes,
    encoder.encode(body),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parsed = roomClaimsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  if (parsed.data.exp * 1000 <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims: parsed.data };
}

/** Reads the token from `Sec-WebSocket-Protocol: truframe.v1, <token>`. */
export function roomTokenFromProtocols(header: string | null): string | null {
  const parts = (header ?? "").split(",").map((p) => p.trim());
  return parts[0] === ROOM_PROTOCOL && parts[1] ? parts[1] : null;
}

/** Binary data (Loro updates, version vectors) travels as base64 inside JSON messages. */
const base64 = z
  .string()
  .max(2 * ROOM_MAX_MESSAGE_BYTES)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/);

/** Client → room. */
export const roomClientMessageSchema = z.discriminatedUnion("t", [
  /** Ask for every change after `vv` (an encoded Loro version vector), or everything if null. */
  z.strictObject({ t: z.literal("sync"), vv: base64.nullable() }),
  /** A transaction of ops. `id` is chosen by the client and makes resends idempotent. */
  z.strictObject({
    t: z.literal("tx"),
    id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    ops: z.array(z.unknown()).min(1).max(10_000),
  }),
]);
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;

/** Room → client. */
export type RoomServerMessage =
  | { t: "hello"; projectId: string; role: RoomClaims["role"] }
  /** Loro update bytes; `txId` is set when the update is a client's accepted transaction. */
  | { t: "update"; data: string; txId?: string; by?: string }
  /** A transaction the room had already applied (a resend); its update was sent before. */
  | { t: "ack"; id: string }
  | { t: "reject"; id: string; error: { code: string; message: string } }
  | { t: "error"; code: "BAD_MESSAGE" | "FORBIDDEN" | "TOO_LARGE"; message: string };

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
