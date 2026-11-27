/**
 * Signed upload URLs (SECURITY "Uploads"). The app checks the session, the project and the
 * plan's limits, then hands the browser a URL carrying an upload token. The upload handler
 * accepts the bytes only with a valid, unexpired token, and only up to the size it names. The
 * token is `<base64url(JSON claims)>.<base64url(HMAC-SHA256)>`; the key is derived from the
 * auth secret with a fixed label, so an upload token can never pass as a room or session token.
 */
import { z } from "zod";

export const UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;
const LABEL = "truframe-upload-token-v1";

export const uploadClaimsSchema = z.strictObject({
  v: z.literal(1),
  sub: z.string().min(1),
  ws: z.string().min(1),
  pid: z.string().min(1),
  /** File name as the user picked it (the type is sniffed from the bytes). */
  name: z.string().min(1).max(255),
  /** Largest body the upload may have, from the plan. */
  max: z.number().int().positive(),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type UploadClaims = z.infer<typeof uploadClaimsSchema>;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
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

async function key(secret: string, usage: "sign" | "verify") {
  if (secret.length < 32)
    throw new Error("The upload signing secret must be at least 32 characters");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${LABEL}:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signUploadToken(
  claims: Omit<UploadClaims, "v" | "iat" | "exp">,
  secret: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const iat = Math.floor(now / 1000);
  const full: UploadClaims = { v: 1, ...claims, iat, exp: iat + UPLOAD_TOKEN_TTL_SECONDS };
  const body = b64url(encoder.encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret, "sign"), encoder.encode(body));
  return { token: `${body}.${b64url(new Uint8Array(sig))}`, expiresAt: full.exp * 1000 };
}

export async function verifyUploadToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<
  | { ok: true; claims: UploadClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" }
> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const sigBytes = fromB64url(sig);
  const bodyBytes = fromB64url(body);
  if (!sigBytes || !bodyBytes) return { ok: false, reason: "malformed" };
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret, "verify"),
    sigBytes,
    encoder.encode(body),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const claims = uploadClaimsSchema.safeParse(parsed);
  if (!claims.success) return { ok: false, reason: "malformed" };
  if (claims.data.exp * 1000 <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims: claims.data };
}

/** `POST /api/projects/:id/assets/uploads`: ask for a signed upload URL. */
export const createUploadInput = z.strictObject({
  name: z.string().trim().min(1).max(255),
  /** The file's size as the browser reports it; the upload itself is checked again. */
  bytes: z.number().int().positive(),
});
export type CreateUploadInput = z.infer<typeof createUploadInput>;

export type UploadTicket = { url: string; expiresAt: number; maxBytes: number };

/** Storage use of the workspace against its plan (the Assets panel meter). */
export type AssetUsageDto = {
  bytes: number;
  files: number;
  maxBytes: number | null;
  maxFiles: number | null;
  maxFileBytes: number | null;
};
