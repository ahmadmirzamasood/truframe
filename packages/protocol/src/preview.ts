/**
 * Preview postMessage protocol (P5-7, SECURITY "Third-party markup"). The editor renders a
 * page and posts it to a sandboxed iframe on the usercontent origin; the iframe only reports
 * that it is ready and which link was clicked. Messages from the iframe arrive from an opaque
 * origin ("null"), so the editor checks the sender window and this schema, never the origin.
 */
import { z } from "zod";

export const PREVIEW_PATH = "/preview";

/** Editor → iframe. Files are blobs keyed by the URL the markup uses for them. */
export type PreviewRender = {
  type: "tf-preview:render";
  html: string;
  /** @font-face rules; their file URLs are keys of `files` too. */
  css: string;
  lang: string;
  title: string;
  files: Record<string, Blob>;
};

/** A link inside the preview: a site path, or an outside URL the editor may open. */
export const previewFrameMessage = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("tf-preview:ready") }),
  /** Escape pressed inside the frame (focus there hides keys from the editor). */
  z.strictObject({ type: z.literal("tf-preview:escape") }),
  z.strictObject({
    type: z.literal("tf-preview:navigate"),
    path: z
      .string()
      .max(2048)
      // One leading slash: "//host" is another site, not a page path.
      .regex(/^\/(?!\/)[^\s]*$/),
  }),
  z.strictObject({
    type: z.literal("tf-preview:open"),
    url: z
      .string()
      .max(2048)
      .regex(/^(?:https?:\/\/|mailto:|tel:)[^\s]+$/i),
  }),
]);
export type PreviewFrameMessage = z.infer<typeof previewFrameMessage>;

/** The page path a preview link points at, without its query or #anchor. */
export function previewPagePath(path: string): string {
  const bare = path.replace(/[?#].*$/, "");
  return bare.length > 1 ? bare.replace(/\/+$/, "") : "/";
}

/**
 * The usercontent origin from config, or null: a bare origin, https outside local, and on a
 * different host from the app (cookies are scoped by host, not port).
 */
export function usercontentOrigin(
  value: string | undefined,
  appUrl: string,
  env: "local" | "staging" | "production",
): string | null {
  try {
    const u = new URL(value ?? "");
    const app = new URL(appUrl);
    const secure = u.protocol === "https:" || (env === "local" && u.protocol === "http:");
    if (!secure || u.origin !== value || u.hostname === app.hostname) return null;
    return u.origin;
  } catch {
    return null;
  }
}
