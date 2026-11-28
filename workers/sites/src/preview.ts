/**
 * The Preview shell on the usercontent origin (P5-7, SECURITY "Third-party markup"). The editor
 * frames it with `sandbox="allow-scripts"`, so it runs in an opaque origin: no cookies, no
 * storage, no access to the editor's DOM. Its CSP repeats the sandbox (if it is opened on its
 * own), allows only this inline script, blob:/data: media and inline styles, and no network,
 * so rendered content can't call anywhere. Only `appOrigin` may frame it or talk to it.
 *
 * The script takes rendered pages from the editor (`tf-preview:render`), swaps file URLs for
 * blob URLs created here, and reports clicked links back instead of navigating.
 */

const script = (appOrigin: string) => `(() => {
  const APP = ${JSON.stringify(appOrigin)};
  let urls = [];
  const fonts = document.getElementById("tf-fonts");
  // In view animations (P6A-4): the generated site's IntersectionObserver fallback, so
  // Preview plays them as the site does.
  let io = null;
  const watch = () => {
    if (io) io.disconnect();
    if (!("IntersectionObserver" in window)) return;
    const view = CSS.supports("animation-timeline: view()");
    io = new IntersectionObserver((entries) => {
      for (const { target: el, isIntersecting } of entries) {
        const once = el.classList.contains("tf-view-once");
        if (isIntersecting) {
          el.classList.add("tf-in");
          if (once) io.unobserve(el);
        } else if (!once && el.classList.contains("tf-in")) {
          el.classList.remove("tf-in");
          el.style.animation = "none";
          void el.offsetWidth;
          el.style.animation = "";
        }
      }
    }, { threshold: 0.15 });
    const selector = view ? ".tf-view-once" : ".tf-view-once, .tf-view";
    for (const el of document.querySelectorAll(selector)) io.observe(el);
  };
  addEventListener("message", (e) => {
    if (e.source !== parent || e.origin !== APP) return;
    const m = e.data;
    if (!m || m.type !== "tf-preview:render" || typeof m.html !== "string") return;
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    let html = m.html;
    let css = typeof m.css === "string" ? m.css : "";
    const files = m.files && typeof m.files === "object" ? m.files : {};
    for (const key of Object.keys(files)) {
      const blob = files[key];
      if (!(blob instanceof Blob) || !key) continue;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      html = html.split(key).join(url);
      css = css.split(key).join(url);
    }
    document.documentElement.lang = typeof m.lang === "string" ? m.lang : "";
    document.title = typeof m.title === "string" ? m.title : "Preview";
    fonts.textContent = css;
    document.body.innerHTML = html;
    watch();
  });
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return;
    e.preventDefault();
    const page = href.startsWith("/") && !href.startsWith("//");
    const type = page ? "tf-preview:navigate" : "tf-preview:open";
    parent.postMessage(type === "tf-preview:navigate" ? { type, path: href } : { type, url: href }, APP);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") parent.postMessage({ type: "tf-preview:escape" }, APP);
  });
  parent.postMessage({ type: "tf-preview:ready" }, APP);
})();`;

/** The app origin from config: https outside local, an origin only (no path). */
export function appOrigin(env: { TRUFRAME_ENV?: string; TRUFRAME_APP_ORIGIN?: string }) {
  try {
    const u = new URL(env.TRUFRAME_APP_ORIGIN ?? "");
    const secure =
      u.protocol === "https:" || (env.TRUFRAME_ENV === "local" && u.protocol === "http:");
    return secure && u.origin === env.TRUFRAME_APP_ORIGIN ? u.origin : null;
  } catch {
    return null;
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export async function previewShell(appOrigin: string, selfOrigin: string): Promise<Response> {
  const js = script(appOrigin);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><style>body{margin:0;background:#fff}</style><style id="tf-fonts"></style></head><body><script>${js}</script></body></html>`;
  const csp = [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src 'sha256-${await sha256(js)}'`,
    "style-src 'unsafe-inline'",
    "img-src blob: data:",
    "font-src blob: data:",
    "media-src blob:",
    // Embeds on the page are frames of this origin's /embed shell (P6-5).
    `frame-src ${selfOrigin}`,
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${appOrigin}`,
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
