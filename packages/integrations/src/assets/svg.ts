/**
 * SVG sanitizer (SECURITY "Uploads", test T4). It doesn't patch the input: it tokenizes the
 * file and writes a new one containing only allowlisted elements and attributes, so anything
 * it doesn't understand is dropped rather than passed through. Removed: scripts, event
 * handlers, `foreignObject`, styles, animation, external references (`href`, `url()` and
 * `xml:base` that aren't a same-document `#id`), DOCTYPEs and entities (refused outright),
 * processing instructions and comments.
 */

const ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textPath",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feFlood",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "feDropShadow",
  "feFuncA",
  "feFuncR",
  "feFuncG",
  "feFuncB",
]);

const ATTRIBUTES = new Set([
  "id",
  "class",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "d",
  "points",
  "pathLength",
  "transform",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "offset",
  "stop-color",
  "stop-opacity",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "color",
  "display",
  "visibility",
  "clip-path",
  "clip-rule",
  "clipPathUnits",
  "mask",
  "maskUnits",
  "maskContentUnits",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "marker-start",
  "marker-mid",
  "marker-end",
  "filter",
  "filterUnits",
  "primitiveUnits",
  "in",
  "in2",
  "result",
  "mode",
  "type",
  "values",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "stdDeviation",
  "dx",
  "dy",
  "radius",
  "flood-color",
  "flood-opacity",
  "tableValues",
  "slope",
  "intercept",
  "amplitude",
  "exponent",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "startOffset",
  "lengthAdjust",
  "textLength",
  "xmlns",
  "xmlns:xlink",
  "version",
  "role",
  "aria-label",
  "aria-hidden",
  "focusable",
  // Same-document references only; checked below.
  "href",
  "xlink:href",
]);

export type SanitizeResult =
  | { ok: true; svg: string; removed: string[] }
  | { ok: false; message: string };

const escapeText = (s: string) =>
  s
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

/** Decodes the entities XML predefines plus numeric ones (so `&#106;avascript:` is caught). */
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const code = k[1] === "x" ? Number.parseInt(k.slice(2), 16) : Number(k.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[k] ?? "";
  });
}

/** `url(...)` values must point inside the document. */
function safeValue(name: string, raw: string): string | null {
  const value = decode(raw).trim();
  // Browsers ignore whitespace and control characters inside a URL scheme ("java	script:").
  const lower = [...value.toLowerCase()].filter((ch) => ch.charCodeAt(0) > 32).join("");
  if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("expression("))
    return null;
  if (name === "href" || name === "xlink:href")
    return /^#[A-Za-z0-9_.:-]+$/.test(value) ? value : null;
  for (const m of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi))
    if (!/^#[A-Za-z0-9_.:-]+$/.test(m[2] ?? "")) return null;
  return value;
}

type Token =
  | { kind: "open"; name: string; attrs: [string, string][]; selfClosing: boolean }
  | { kind: "close"; name: string }
  | { kind: "text"; text: string };

function* tokens(src: string): Generator<Token | { kind: "error"; message: string }> {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      yield { kind: "text", text: src.slice(i) };
      return;
    }
    if (lt > i) yield { kind: "text", text: src.slice(i, lt) };
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      yield { kind: "text", text: src.slice(lt + 9, end < 0 ? src.length : end) };
      i = end < 0 ? src.length : end + 3;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE and entity declarations can expand into anything; refuse the file.
      yield { kind: "error", message: "SVG files with a DOCTYPE or entities can't be uploaded." };
      return;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt);
      yield { kind: "close", name: src.slice(lt + 2, end < 0 ? undefined : end).trim() };
      i = end < 0 ? src.length : end + 1;
    } else {
      const m = /^<([A-Za-z][\w:.-]*)/.exec(src.slice(lt, lt + 200));
      if (!m) {
        yield { kind: "text", text: "<" };
        i = lt + 1;
        continue;
      }
      let j = lt + m[0].length;
      const attrs: [string, string][] = [];
      const attrRe = /\s*([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
      for (;;) {
        attrRe.lastIndex = j;
        const a = attrRe.exec(src);
        if (!a || a[0].trim() === "") break;
        attrs.push([a[1] as string, a[2] ?? a[3] ?? a[4] ?? ""]);
        j = attrRe.lastIndex;
      }
      const rest = /^\s*(\/?)>/.exec(src.slice(j, j + 50));
      if (!rest) {
        yield { kind: "error", message: "This SVG file isn't well formed." };
        return;
      }
      yield { kind: "open", name: m[1] as string, attrs, selfClosing: rest[1] === "/" };
      i = j + rest[0].length;
    }
  }
}

/** Sanitizes SVG text. The result always has an `<svg>` root with the SVG namespace. */
export function sanitizeSvg(input: string): SanitizeResult {
  const removed = new Set<string>();
  const out: string[] = [];
  /** Open elements; a dropped element drops its content too. */
  const stack: { name: string; keep: boolean }[] = [];
  let sawRoot = false;
  /** Set once the root closes: nothing after it is kept. */
  let done = false;
  for (const t of tokens(input.replace(/^﻿/, ""))) {
    if (t.kind === "error") return { ok: false, message: t.message };
    if (done) continue;
    const dropping = stack.some((e) => !e.keep);
    if (t.kind === "text") {
      if (!dropping && stack.length) out.push(escapeText(decode(t.text)));
      continue;
    }
    if (t.kind === "close") {
      // Close back to the matching element; a stray close tag is ignored. Unclosed elements
      // inside it (HTML like <img> in a foreignObject) close with it.
      const at = stack.map((e) => e.name).lastIndexOf(t.name);
      if (at < 0) continue;
      while (stack.length > at) {
        const e = stack.pop();
        if (e?.keep) out.push(`</${e.name}>`);
      }
      if (sawRoot && stack.length === 0) done = true;
      continue;
    }
    const keep = !dropping && ELEMENTS.has(t.name) && (sawRoot || t.name === "svg");
    if (!keep) {
      if (!dropping) removed.add(`<${t.name}>`);
      if (!t.selfClosing) stack.push({ name: t.name, keep: false });
      continue;
    }
    const isRoot = !sawRoot;
    sawRoot = true;
    const attrs: string[] = [];
    for (const [name, raw] of t.attrs) {
      if (!ATTRIBUTES.has(name) || (isRoot && (name === "xmlns" || name === "xmlns:xlink"))) {
        if (!(isRoot && name.startsWith("xmlns")))
          removed.add(name.startsWith("on") ? "event handlers" : name);
        continue;
      }
      const value = safeValue(name, raw);
      if (value === null) {
        removed.add(`${name} (external or script reference)`);
        continue;
      }
      attrs.push(`${name}="${escapeAttr(value)}"`);
    }
    if (isRoot)
      attrs.unshift(
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns:xlink="http://www.w3.org/1999/xlink"',
      );
    const open = `<${t.name}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
    if (t.selfClosing) {
      out.push(`${open}/>`);
      if (isRoot) done = true;
    } else {
      out.push(`${open}>`);
      stack.push({ name: t.name, keep: true });
    }
  }
  if (!sawRoot) return { ok: false, message: "This file has no <svg> element." };
  while (stack.length) {
    const e = stack.pop();
    if (e?.keep) out.push(`</${e.name}>`);
  }
  return { ok: true, svg: out.join(""), removed: [...removed] };
}
