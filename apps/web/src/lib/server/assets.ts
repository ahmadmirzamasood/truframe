import "server-only";
/**
 * Asset uploads and serving (PRD F14, SECURITY "Uploads", T4). Flow:
 * 1. `issueUpload`: the signed-in user asks to upload a file to a project; the plan's per-file
 *    size is checked and a 10-minute signed upload URL comes back.
 * 2. `receiveUpload`: the upload URL accepts the bytes. Magic bytes decide the type, polyglots
 *    and mislabelled files are refused, SVGs are rebuilt by the sanitizer, the size is read from
 *    the header, and the file is stored content-addressed in R2 under the workspace prefix. The
 *    D1 row is inserted only if the workspace stays within its file count and storage.
 * 3. `serveFile`: files are served only to members of the project's workspace, with the
 *    sniffed type, `nosniff` and a sandbox CSP, so even an SVG can't run script if opened.
 */
import type { WorkspaceContext } from "@truframe/auth";
import { limitFor, planForWorkspace } from "@truframe/billing";
import { type AssetRow, forWorkspace } from "@truframe/db";
import {
  cloudflareImages,
  type ImagesBinding,
  imageSize,
  originalImages,
  sanitizeSvg,
  sniffUpload,
  variantWidth,
} from "@truframe/integrations";
import type { Asset } from "@truframe/model";
import {
  type AssetUsageDto,
  type CreateUploadInput,
  signUploadToken,
  type UploadTicket,
  verifyUploadToken,
} from "@truframe/protocol";
import { ApiFailure, notFound } from "./api";
import type { ServerContext } from "./context";
import { parseProjectId } from "./projects";

const MB = 1024 * 1024;

function limits(ctx: { workspace: { id: string } }) {
  const plan = planForWorkspace(ctx.workspace);
  return {
    plan,
    fileBytes: limitFor(plan, "assetFileBytes"),
    files: limitFor(plan, "assetFiles"),
    bytes: limitFor(plan, "assetStorageBytes"),
  };
}

const size = (n: number) =>
  n >= MB ? `${Math.round((n / MB) * 10) / 10} MB` : `${Math.ceil(n / 1024)} KB`;

/** Upload URLs are signed with a key derived from the auth secret (`@truframe/protocol`). */
function uploadSecret(server: ServerContext): string {
  return server.authEnv.BETTER_AUTH_SECRET;
}

async function activeProject(ctx: WorkspaceContext, projectId: string) {
  const project = await ctx.repos.projects.get(parseProjectId(projectId));
  if (!project) throw notFound();
  return project;
}

export async function issueUpload(
  server: ServerContext,
  ctx: WorkspaceContext,
  projectId: string,
  input: CreateUploadInput,
): Promise<UploadTicket> {
  const project = await activeProject(ctx, projectId);
  const l = limits(ctx);
  if (input.bytes > l.fileBytes)
    throw new ApiFailure(
      "LIMIT_REACHED",
      `This file is ${size(input.bytes)}. Your plan allows files up to ${size(l.fileBytes)}.`,
      403,
      { plan: l.plan, limit: "assetFileBytes", max: l.fileBytes },
    );
  const usage = await ctx.repos.assets.usage();
  if (usage.files >= l.files || usage.bytes + input.bytes > l.bytes) throw storageFull(l, usage);
  const { token, expiresAt } = await signUploadToken(
    { sub: ctx.user.id, ws: ctx.workspace.id, pid: project.id, name: input.name, max: l.fileBytes },
    uploadSecret(server),
  );
  return { url: `/api/uploads/${token}`, expiresAt, maxBytes: l.fileBytes };
}

function storageFull(l: ReturnType<typeof limits>, usage: { bytes: number; files: number }) {
  const what =
    usage.files >= l.files
      ? `${usage.files} of ${l.files} files`
      : `${size(usage.bytes)} of ${size(l.bytes)}`;
  return new ApiFailure(
    "LIMIT_REACHED",
    `Your storage is full (${what}). Delete unused assets or upgrade to upload more.`,
    403,
    { plan: l.plan, limit: usage.files >= l.files ? "assetFiles" : "assetStorageBytes" },
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads at most `max` bytes; a longer body is refused without buffering all of it. */
async function readCapped(request: Request, max: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) throw tooLarge(max);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw tooLarge(max);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const tooLarge = (max: number) =>
  new ApiFailure("LIMIT_REACHED", `This file is larger than ${size(max)}, your plan's limit.`, 413);

export async function receiveUpload(
  server: ServerContext,
  token: string,
  request: Request,
  newId: () => string,
): Promise<Asset> {
  const verified = await verifyUploadToken(token, uploadSecret(server));
  if (!verified.ok)
    throw verified.reason === "expired"
      ? new ApiFailure("UPLOAD_EXPIRED", "This upload link has expired. Try the upload again.", 410)
      : new ApiFailure("UPLOAD_REJECTED", "This upload link isn't valid.", 403);
  const c = verified.claims;
  const repos = forWorkspace(server.db, c.ws);
  const project = await repos.projects.get(c.pid);
  if (!project) throw notFound();

  let bytes = await readCapped(request, c.max);
  const sniffed = sniffUpload(bytes, c.name);
  if (!sniffed.ok)
    throw new ApiFailure("UPLOAD_REJECTED", sniffed.message, 415, { reason: sniffed.code });
  if (sniffed.mime === "image/svg+xml") {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!clean.ok) throw new ApiFailure("UPLOAD_REJECTED", clean.message, 415, { reason: "SVG" });
    bytes = new TextEncoder().encode(clean.svg);
  }
  const dims = imageSize(sniffed.mime, bytes);
  if (!dims)
    throw new ApiFailure("UPLOAD_REJECTED", "This image file is damaged or incomplete.", 415, {
      reason: "DIMENSIONS",
    });
  const sha = await sha256Hex(bytes);
  const key = `assets/${sha}.${sniffed.ext}`;
  const objectKey = `ws/${c.ws}/${key}`;
  if (!(await server.env.FILES.head(objectKey)))
    await server.env.FILES.put(objectKey, bytes, {
      httpMetadata: { contentType: sniffed.mime },
      sha256: sha,
    });
  const l = limits({ workspace: { id: c.ws } });
  const id = newId();
  const name = [...c.name]
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 255);
  const row = await repos.assets.createWithinLimits(
    {
      id,
      projectId: project.id,
      r2Key: key,
      name,
      mime: sniffed.mime,
      bytes: bytes.byteLength,
      width: dims.width,
      height: dims.height,
      sha256: sha,
      createdBy: c.sub,
    },
    { maxFiles: l.files, maxBytes: l.bytes },
  );
  if ("limitReached" in row) {
    // The object may be new and now unreferenced; leave it only if another row uses it.
    if (!(await repos.assets.findByKey(project.id, key))) await server.env.FILES.delete(objectKey);
    throw storageFull(l, await repos.assets.usage());
  }
  return toAsset(row);
}

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime as Asset["mime"],
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    key: row.r2Key,
  };
}

export async function storageUsage(ctx: WorkspaceContext): Promise<AssetUsageDto> {
  const l = limits(ctx);
  const u = await ctx.repos.assets.usage();
  const fin = (n: number) => (Number.isFinite(n) ? n : null);
  return { ...u, maxBytes: fin(l.bytes), maxFiles: fin(l.files), maxFileBytes: fin(l.fileBytes) };
}

export async function deleteAsset(
  server: ServerContext,
  ctx: WorkspaceContext,
  projectId: string,
  assetId: string,
): Promise<void> {
  const project = await activeProject(ctx, projectId);
  const r = await ctx.repos.assets.delete(project.id, assetId);
  if (!r.deleted) throw notFound();
  if (!r.keyStillUsed) await server.env.FILES.delete(`ws/${ctx.workspace.id}/${r.deleted.r2Key}`);
}

const KEY = /^assets\/[0-9a-f]{64}\.(png|jpg|webp|gif|svg)$/;

/** Serves a project's file to members of its workspace only. */
export async function serveFile(
  server: ServerContext,
  ctx: WorkspaceContext,
  projectId: string,
  key: string,
  width: number | null,
): Promise<Response> {
  if (!KEY.test(key)) throw notFound();
  const project = await activeProject(ctx, projectId);
  const row = await ctx.repos.assets.findByKey(project.id, key);
  if (!row) throw notFound();
  const object = await server.env.FILES.get(`ws/${ctx.workspace.id}/${key}`);
  if (!object) throw notFound();
  const images = (server.env as unknown as { IMAGES?: ImagesBinding }).IMAGES;
  const w = variantWidth(width);
  const variants = images ? cloudflareImages(images) : originalImages;
  const out =
    w && w < row.width
      ? await variants.variant(object.body, row.mime, w)
      : { body: object.body, contentType: row.mime };
  return new Response(out.body, {
    headers: {
      "content-type": out.contentType,
      "x-content-type-options": "nosniff",
      // Even opened directly, a file is inert: no script, no plugins, no forms.
      "content-security-policy":
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "content-disposition": `inline; filename="${row.name.replace(/[^\w.-]+/g, "_")}"`,
      "cache-control": "private, max-age=31536000, immutable",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
