/**
 * The Embed shell on the usercontent origin (P6-5, SECURITY "Third-party markup", T3). The
 * editor frames `/embed?k=<content key>#h=<base64url HTML>` (or `#u=<https URL>`) with
 * `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"`, so the
 * embed's code runs in an opaque origin on another registrable domain: no app cookies,
 * storage or DOM. The content travels in the fragment, which never reaches a server, and
 * there are no messages at all. `k` changes with the content so the frame reloads.
 *
 * Unlike Preview, the CSP allows network and inline script: embeds (maps, videos, forms)
 * need them, and the sandbox plus the separate domain are what keep them boxed in.
 */

const script = `(() => {
  const p = new URLSearchParams(location.hash.slice(1));
  const text = (b64) => {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  try {
    if (p.has("h")) {
      document.write(text(p.get("h") || ""));
    } else if (p.has("u")) {
      const u = new URL(p.get("u") || "");
      if (u.protocol !== "https:") return;
      const f = document.createElement("iframe");
      f.src = u.href;
      f.title = "Embedded content";
      f.setAttribute("style", "display:block;width:100%;height:100%;border:0");
      document.body.append(f);
    }
  } catch {}
})();`;

export function embedShell(): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Embed</title><style>html,body{margin:0;height:100%}</style></head><body><script>${script}</script></body></html>`;
  // No frame-ancestors: Preview frames this shell from its own sandboxed (opaque-origin)
  // document, which no source expression can name. The shell holds no data and no
  // privilege, only what its URL fragment carries, so framing it elsewhere gains nothing.
  const csp = [
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
    "base-uri 'none'",
  ].join("; ");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}
