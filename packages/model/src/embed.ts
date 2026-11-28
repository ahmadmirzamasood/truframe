/**
 * Embed HTML (P6-5, SECURITY "Third-party markup"). Embed code runs only inside sandboxed
 * iframes: on the usercontent origin in the editor, and as a sandboxed `srcdoc` frame on the
 * published site, so it can't reach the page around it. Sanitizing therefore removes what
 * could act on that frame's own document from outside the user's intent: control
 * characters, `<base>` (rewrites every relative URL) and `<meta http-equiv>` (refresh
 * redirects, CSP and cookie headers). Everything else, scripts included, is the embed's job.
 */
export const EMBED_HTML_MAX = 100_000;

const BASE_OR_HTTP_EQUIV = /<base\b[^>]*>|<meta\b[^>]*\bhttp-equiv\b[^>]*>/gi;
// C0 controls other than tab, line feed and carriage return.
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitizeEmbedHtml(html: string): string {
  let out = html.replace(CONTROL, "");
  // Repeat until stable, so removing one tag can't assemble another.
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(BASE_OR_HTTP_EQUIV, "");
  }
  return out.trim();
}
