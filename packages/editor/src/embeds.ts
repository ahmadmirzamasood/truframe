/**
 * Where the editor shows an embed (P6-5): the usercontent origin's `/embed` shell, with the
 * content in the URL fragment (never sent to a server) and a content key in the query so a
 * changed embed reloads (a fragment-only change wouldn't).
 */
import type { EmbedNode } from "@truframe/model";

export function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A short, stable key of the content (FNV-1a), only to make the URL change with it. */
function contentKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function embedFrameUrl(origin: string, source: EmbedNode["source"]): string {
  const fragment =
    source.type === "html" ? `h=${base64Url(source.html)}` : `u=${encodeURIComponent(source.url)}`;
  return `${origin}/embed?k=${contentKey(fragment)}#${fragment}`;
}
