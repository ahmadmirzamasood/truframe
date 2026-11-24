/**
 * Canvas stylesheet. The compiler's `css` output holds per-layer declarations per breakpoint
 * (tablet and mobile hold only changes). The generated site applies them with media queries;
 * the canvas shows every breakpoint at once, so each frame gets its own cascade instead:
 * desktop → tablet → mobile, scoped to `[data-tf-frame="<breakpoint>"]`.
 */
import { activeBreakpoints, type BreakpointId, type ProjectDocument } from "@truframe/model";

export type NodeCss = { desktop: string; tablet?: string; mobile?: string };

/** Breakpoints whose declarations apply inside a frame, in cascade order. */
export function cascadeFor(doc: ProjectDocument, breakpoint: BreakpointId): BreakpointId[] {
  const active = activeBreakpoints(doc.breakpoints);
  return active.slice(0, active.indexOf(breakpoint) + 1);
}

/** Tailwind 4.3.5 `--font-sans` (theme.css); `renderer.test.ts` keeps them equal. */
export const DEFAULT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

/**
 * Tailwind v4 preflight (MIT, tailwindcss 4.3.5 `preflight.css`), trimmed to the elements the
 * compiler emits and scoped to a frame. The frame root stands in for `html` and `body`, and
 * also resets everything the editor's own page would otherwise pass down. Like the page root it
 * is the containing block for absolute layers and a stacking context, so a layer with a
 * negative z-index paints above the frame's background, not behind it.
 */
function preflight(scope: string): string {
  const s = `:where(${scope})`;
  return [
    `${s}{display:block;position:relative;isolation:isolate;margin:0;padding:0;border:0;box-sizing:border-box;line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;font-family:${DEFAULT_SANS};font-feature-settings:normal;font-variation-settings:normal;font-size:16px;font-weight:400;font-style:normal;letter-spacing:normal;text-align:start;text-transform:none;text-decoration:none;white-space:normal;color:#000;background:#fff;-webkit-font-smoothing:auto;-moz-osx-font-smoothing:auto;-webkit-tap-highlight-color:transparent}`,
    `${s} *,${s} ::after,${s} ::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}`,
    `${s} :is(h1,h2,h3,h4,h5,h6){font-size:inherit;font-weight:inherit}`,
    `${s} a{color:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}`,
    `${s} :is(b,strong){font-weight:bolder}`,
    `${s} small{font-size:80%}`,
    `${s} :is(ol,ul,menu){list-style:none}`,
    `${s} :is(img,svg,video,canvas,audio,iframe,embed,object){display:block;vertical-align:middle}`,
    `${s} :is(img,video){max-width:100%;height:auto}`,
    `${s} button{font:inherit;letter-spacing:inherit;color:inherit;border-radius:0;background-color:transparent;opacity:1}`,
    `${s} [hidden]:where(:not([hidden="until-found"])){display:none!important}`,
  ].join("\n");
}

/** The `:root` blocks of the compiler's `tokens.css`, per breakpoint. */
export function parseTokens(
  doc: ProjectDocument,
  tokensCss: string,
): Partial<Record<BreakpointId, string>> {
  const out: Partial<Record<BreakpointId, string>> = {};
  // Desktop is the top-level `:root`; each `@media (width < Npx) { :root {…} }` is the
  // breakpoint whose query that is (tablet's is always < 1200px; mobile's is < tablet width,
  // or < 1200px when Tablet is removed).
  const top = /^:root\s*\{([^}]*)\}/m.exec(tokensCss);
  if (top?.[1]) out.desktop = top[1].trim();
  for (const m of tokensCss.matchAll(/@media \(width < (\d+)px\)\s*\{\s*:root\s*\{([^}]*)\}/g)) {
    const width = Number(m[1]);
    const bp: BreakpointId = width === 1200 && doc.breakpoints.tablet ? "tablet" : "mobile";
    out[bp] = (m[2] ?? "").trim();
  }
  return out;
}

/** The compiler's slug for a font family (`--tf-font-<slug>`): `names.rs` `kebab`. */
export function fontSlug(family: string): string {
  let out = "";
  let prevLowerOrDigit = false;
  for (const c of family) {
    if (/[A-Za-z0-9]/.test(c)) {
      if (/[A-Z]/.test(c) && prevLowerOrDigit && !out.endsWith("-")) out += "-";
      out += c.toLowerCase();
      prevLowerOrDigit = /[a-z0-9]/.test(c);
    } else {
      if (out && !out.endsWith("-")) out += "-";
      prevLowerOrDigit = false;
    }
  }
  out = out.replace(/-+$/, "");
  return out || "custom";
}

/** Every font family the document uses, from layers and font variables. */
export function fontFamilies(doc: ProjectDocument): string[] {
  const families = new Set<string>();
  for (const n of Object.values(doc.nodes))
    for (const props of [n.style.desktop, n.style.tablet, n.style.mobile])
      if (props?.fontFamily) families.add(props.fontFamily);
  for (const v of Object.values(doc.variables))
    if (v.type === "font")
      for (const f of [v.value.desktop, v.value.tablet, v.value.mobile])
        if (f) families.add(f.family);
  return [...families].sort();
}

export const frameScope = (breakpoint: BreakpointId) => `[data-tf-frame="${breakpoint}"]`;

/**
 * The stylesheet for one frame: preflight, variable values at this breakpoint, then each
 * layer's declarations down the cascade. Component layers are matched by `data-tf-c`.
 */
export function frameStylesheet(
  doc: ProjectDocument,
  output: { css: Record<string, NodeCss>; tokens?: string },
  breakpoint: BreakpointId,
): string {
  const { css } = output;
  const scope = frameScope(breakpoint);
  const cascade = cascadeFor(doc, breakpoint);
  const out = [preflight(scope)];
  // Web fonts: the framework's font loader sets `--tf-font-<slug>` on the site; the canvas
  // names the family directly (the editor loads it). System stacks come from tokens.css.
  const fonts = fontFamilies(doc).map(
    (f) => `--tf-font-${fontSlug(f)}: "${f.replaceAll('"', "")}";`,
  );
  if (fonts.length) out.push(`${scope}{${fonts.join("")}}`);
  const tokens = output.tokens ? parseTokens(doc, output.tokens) : {};
  for (const bp of cascade) if (tokens[bp]) out.push(`${scope}{${tokens[bp]}}`);
  const componentNodes = new Set<string>();
  for (const c of Object.values(doc.components)) collect(doc, c.root, componentNodes);
  for (const bp of cascade) {
    for (const [id, decls] of Object.entries(css)) {
      const d = decls[bp];
      if (!d) continue;
      // Component layers first so an instance's own (outer) declarations follow them.
      if (componentNodes.has(id)) out.push(`${scope} [data-tf-c="${id}"]{${d}}`);
    }
    for (const [id, decls] of Object.entries(css)) {
      const d = decls[bp];
      if (d && !componentNodes.has(id)) out.push(`${scope} [data-tf-node="${id}"]{${d}}`);
    }
  }
  return out.join("\n");
}

function collect(doc: ProjectDocument, id: string, into: Set<string>) {
  const n = doc.nodes[id];
  if (!n || into.has(id)) return;
  into.add(id);
  if (n.type === "frame" || n.type === "link") for (const c of n.children) collect(doc, c, into);
}
