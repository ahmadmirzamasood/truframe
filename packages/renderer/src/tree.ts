/**
 * Model → element tree (ARCHITECTURE §8). Mirrors the elements the compiler emits
 * (`crates/compiler/src/tree.rs`) so the compiler's per-node canvas CSS lays the canvas out
 * exactly like the generated site: same tags, same nesting, same wrappers.
 *
 * Every element that renders a layer carries `data-tf-node` (the layer id); elements drawn
 * from a component's own layers carry `data-tf-c` (the component layer id) instead, plus
 * `data-tf-node` on the instance root.
 */
import type {
  Component,
  InstanceNode,
  LinkNode,
  Node,
  ProjectDocument,
  SvgElement,
  TextSpan,
} from "@truframe/model";

export type RChild = RElement | string;
export type RElement = {
  tag: string;
  attrs: Record<string, string | number>;
  children: RChild[];
};

export type TreeOptions = {
  /** URL of an uploaded asset (the compiler's `assets[].path` minus `public`, or a CDN URL). */
  assetUrl?: (assetId: string) => string | null;
  /**
   * Where the editor shows an embed (P6-5): a sandboxed frame on the usercontent origin, or
   * null where there is none (then the embed is a labelled placeholder). Without this option
   * (Node, parity) embeds render as the compiler emits them.
   */
  embedUrl?: (source: EmbedSource) => string | null;
};

type EmbedSource = Extract<Node, { type: "embed" }>["source"];

/** The compiler's sandbox for HTML embeds on the published site (tree.rs EMBED_SANDBOX). */
export const EMBED_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";

const el = (tag: string, attrs: RElement["attrs"] = {}, children: RChild[] = []): RElement => ({
  tag,
  attrs,
  children,
});

/** An icon shape; React spells SVG attributes in camelCase (`strokeWidth`). */
function svgElement(e: SvgElement): RElement {
  const attrs: RElement["attrs"] = {};
  for (const [k, v] of Object.entries(e.attrs))
    if (v !== undefined) attrs[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return el(e.tag, attrs, (e.children ?? []).map(svgElement));
}

/** Fixed classes the compiler puts on inner elements, as inline styles. */
const FILL = "display:block;width:100%;height:100%";
const EMBED_PLACEHOLDER =
  "display:grid;place-items:center;background:#f4f4f5;color:#71717a;font:12px system-ui,sans-serif";
const FIT_CSS = { fill: "cover", crop: "cover", fit: "contain", tile: "none" } as const;

function linkHref(doc: ProjectDocument, target: LinkNode["target"]): string {
  if (target.type === "url") return target.href;
  return doc.pages.find((p) => p.id === target.pageId)?.path ?? "/";
}

function richText(spans: readonly TextSpan[]): RChild[] {
  const out: RChild[] = [];
  for (const s of spans) {
    let parts: RChild[] = [];
    s.text.split("\n").forEach((line, i) => {
      if (i > 0) parts.push(el("br"));
      if (line) parts.push(line);
    });
    if (s.underline) parts = [el("u", {}, parts)];
    if (s.italic) parts = [el("em", {}, parts)];
    if (s.bold) parts = [el("strong", {}, parts)];
    if (s.href) parts = [el("a", { href: s.href }, parts)];
    out.push(...parts);
  }
  return out;
}

type Overlay = {
  content?: TextSpan[];
  assetId?: string | null;
  href?: string;
  /** Not rendered (a false visibility prop on an imported instance). */
  removed?: boolean;
  /** Rendered but hidden (a false visibility prop on an inlined instance). */
  hidden?: boolean;
};

class Builder {
  private readonly doc: ProjectDocument;
  private readonly options: TreeOptions;

  // Plain fields, not parameter properties: Node's type stripping runs this file as is.
  constructor(doc: ProjectDocument, options: TreeOptions) {
    this.doc = doc;
    this.options = options;
  }

  node(
    id: string,
    ctx: { component?: Component; overlay?: Map<string, Overlay> } = {},
  ): RElement | null {
    const n = this.doc.nodes[id];
    if (!n) return null;
    const overlay = ctx.overlay?.get(id) ?? {};
    if (overlay.removed) return null;
    const mark: RElement["attrs"] = ctx.component ? { "data-tf-c": id } : { "data-tf-node": id };
    if (overlay.hidden) mark.hidden = "hidden";
    const kids = (ids: readonly string[]) =>
      ids.map((c) => this.node(c, ctx)).filter((c): c is RElement => c !== null);
    switch (n.type) {
      case "frame":
        return el(n.tag, mark, kids(n.children));
      case "text":
        return el(n.tag, mark, richText(overlay.content ?? n.content));
      case "link": {
        const attrs: RElement["attrs"] = {
          href: overlay.href ?? linkHref(this.doc, n.target),
          ...mark,
        };
        if (n.newTab) Object.assign(attrs, { target: "_blank", rel: "noopener noreferrer" });
        if (n.ariaLabel) attrs["aria-label"] = n.ariaLabel;
        return el("a", attrs, kids(n.children));
      }
      case "image":
        return this.image(n, mark, overlay);
      case "icon":
        if (n.svg)
          return el(n.tag, { ...mark, "aria-hidden": "true" }, [
            el(
              "svg",
              { xmlns: "http://www.w3.org/2000/svg", viewBox: n.svg.viewBox, style: FILL },
              n.svg.body.map(svgElement),
            ),
          ]);
        return el(n.tag, { ...mark, "aria-hidden": "true" }, [
          el("img", {
            src: `https://api.iconify.design/${n.set}/${n.icon}.svg`,
            alt: "",
            style: FILL,
          }),
        ]);
      case "embed": {
        const title = n.name.trim() || "Embedded content";
        const frame = { title, loading: "lazy", style: `${FILL};border:0` };
        if (this.options.embedUrl) {
          const src = this.options.embedUrl(n.source);
          return el(n.tag, mark, [
            src
              ? el("iframe", { ...frame, src, sandbox: EMBED_SANDBOX, "data-tf-embed": "" })
              : el("div", { "data-tf-embed": "", style: `${FILL};${EMBED_PLACEHOLDER}` }, [
                  "Embed (shown in Preview and on the site)",
                ]),
          ]);
        }
        return el(n.tag, mark, [
          n.source.type === "url"
            ? el("iframe", { ...frame, src: n.source.url })
            : el("iframe", { ...frame, srcDoc: n.source.html, sandbox: EMBED_SANDBOX }),
        ]);
      }
      case "instance":
        return this.instance(n);
    }
  }

  private image(
    n: Extract<Node, { type: "image" }>,
    mark: RElement["attrs"],
    overlay: Overlay,
  ): RElement {
    const assetId = overlay.assetId !== undefined ? overlay.assetId : n.assetId;
    const alt = n.decorative ? "" : n.alt;
    const asset = assetId ? this.doc.assets[assetId] : undefined;
    const src = assetId && asset ? this.options.assetUrl?.(assetId) : null;
    if (!asset || !src) {
      // Placeholder: the compiler's CSS gives it the grey background.
      return el(
        "div",
        alt ? { ...mark, role: "img", "aria-label": alt } : { ...mark, "aria-hidden": "true" },
      );
    }
    // next/image with `unoptimized` renders a plain <img> with these attributes.
    const img: RElement["attrs"] = {
      alt,
      width: asset.width,
      height: asset.height,
      decoding: "async",
      src,
    };
    if (n.tag === "img") return el("img", { ...img, ...mark, style: "color:transparent" });
    return el(n.tag, mark, [
      el("img", {
        ...img,
        style: `color:transparent;width:100%;height:100%;object-fit:${FIT_CSS[n.fit]}`,
      }),
    ]);
  }

  private instance(n: InstanceNode): RElement | null {
    const c = this.doc.components[n.componentId];
    if (!c) return el(n.tag, { "data-tf-node": n.id });
    // Props drive content, images, hrefs and visibility of the component's layers. An
    // instance with per-layer overrides is inlined by the compiler, where a false visibility
    // prop hides the layer instead of omitting it, and hrefs stay the component's.
    const inline = Object.keys(n.overrides.nodes).length > 0;
    const overlay = new Map<string, Overlay>();
    for (const p of c.props) {
      const value = Object.hasOwn(n.overrides.props, p.name)
        ? n.overrides.props[p.name]
        : p.default;
      const o = overlay.get(p.target.nodeId) ?? {};
      if (p.target.field === "content" && typeof value === "string") o.content = [{ text: value }];
      if (p.target.field === "assetId") {
        o.assetId = typeof value === "string" ? value : null;
        // An imported component renders an image prop with `{image && <img />}`.
        if (o.assetId === null && !inline) o.removed = true;
      }
      if (p.target.field === "href" && typeof value === "string" && !inline) o.href = value;
      if (p.target.field === "visible" && value === false) {
        if (inline) o.hidden = true;
        else o.removed = true;
      }
      overlay.set(p.target.nodeId, o);
    }
    for (const [nodeId, o] of Object.entries(n.overrides.nodes)) {
      const cur = overlay.get(nodeId) ?? {};
      if (o.content) cur.content = o.content;
      if (o.assetId !== undefined) cur.assetId = o.assetId;
      // Per-breakpoint visibility overrides come with the layer's CSS.
      if (o.hidden) cur.hidden = false;
      overlay.set(nodeId, cur);
    }
    const root = this.node(c.root, { component: c, overlay });
    if (!root) return null;
    root.attrs["data-tf-node"] = n.id;
    return root;
  }
}

/** The element tree of a page body (the page's root frame). */
export function buildPageTree(
  doc: ProjectDocument,
  pageId: string,
  options: TreeOptions = {},
): RElement | null {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return null;
  return new Builder(doc, options).node(page.root);
}
