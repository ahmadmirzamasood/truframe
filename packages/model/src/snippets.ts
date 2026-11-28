/**
 * Page head/body code snippets (P6-5, PRD §5): analytics tags, verification metas, fonts,
 * JSON-LD. They are stored as data, never as markup (like icons): a short list of allowed
 * elements with their attributes and text. The editor parses what the user pastes with
 * `parseSnippet` and shows it again with `printSnippet`; the compiler turns the data into
 * `next/script` / JSX elements (Next.js) or HTML (Astro). Snippets never run in the editor.
 */
import { z } from "zod";

export const SNIPPET_TAGS = ["script", "style", "meta", "link", "noscript"] as const;
export type SnippetTag = (typeof SNIPPET_TAGS)[number];
const VOID: ReadonlySet<string> = new Set(["meta", "link"]);

export const SNIPPET_MAX_ELEMENTS = 20;
export const SNIPPET_MAX_TEXT = 50_000;

const attrName = z
  .string()
  .regex(/^[a-z][a-z0-9_.:-]{0,63}$/, "Expected a lowercase attribute name");
/** `src`/`href` must be https (or http) or a path on the site itself. */
const URL_ATTRS: ReadonlySet<string> = new Set(["src", "href"]);
const safeUrl = (v: string) => /^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(v);

export const snippetElementSchema = z
  .strictObject({
    tag: z.enum(SNIPPET_TAGS),
    /** In the order written; a boolean attribute has the value "". */
    attrs: z.array(z.tuple([attrName, z.string().max(4000)])).max(30),
    /** The element's content: script or style source, or noscript markup. Empty for meta/link. */
    text: z.string().max(SNIPPET_MAX_TEXT),
  })
  .refine((e) => !VOID.has(e.tag) || e.text === "", "meta and link elements have no content")
  .refine(
    (e) => e.attrs.every(([k, v]) => !URL_ATTRS.has(k) || safeUrl(v)),
    "src and href must start with https://, http:// or /",
  )
  .refine(
    (e) => !/<\/(script|style|noscript)/i.test(e.text),
    "The content can't close its own element",
  );
export type SnippetElement = z.infer<typeof snippetElementSchema>;

export const pageCodeSchema = z.strictObject({
  /** Added to the page's `<head>` (scripts in Next.js load after the page is interactive). */
  head: z.array(snippetElementSchema).max(SNIPPET_MAX_ELEMENTS),
  /** Added at the end of the page's `<body>`. */
  body: z.array(snippetElementSchema).max(SNIPPET_MAX_ELEMENTS),
});
export type PageCode = z.infer<typeof pageCodeSchema>;

export type SnippetParse =
  | { ok: true; elements: SnippetElement[] }
  | { ok: false; message: string };

const ALLOWED = `Only <script>, <style>, <noscript>, <meta> and <link> can go in page code.`;

/**
 * Parses pasted head/body code. Accepts a sequence of allowed elements, whitespace and
 * comments; anything else is refused with a message that says what to change.
 */
export function parseSnippet(source: string): SnippetParse {
  const elements: SnippetElement[] = [];
  let i = 0;
  const s = source;
  const fail = (message: string): SnippetParse => ({ ok: false, message });
  while (i < s.length) {
    const ws = /^\s+/.exec(s.slice(i));
    if (ws) {
      i += ws[0].length;
      continue;
    }
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) return fail("A comment isn't closed with -->.");
      i = end + 3;
      continue;
    }
    const open = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(s.slice(i));
    if (!open) return fail(`Unexpected text "${s.slice(i, i + 20).trim()}". ${ALLOWED}`);
    const tag = (open[1] ?? "").toLowerCase();
    if (!(SNIPPET_TAGS as readonly string[]).includes(tag))
      return fail(`<${tag}> isn't allowed. ${ALLOWED}`);
    i += open[0].length;
    const attrs: [string, string][] = [];
    for (;;) {
      const sp = /^\s*/.exec(s.slice(i));
      i += sp?.[0].length ?? 0;
      if (s.startsWith("/>", i)) {
        i += 2;
        break;
      }
      if (s[i] === ">") {
        i += 1;
        break;
      }
      const a = /^([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(s.slice(i));
      if (!a) return fail(`The <${tag}> tag isn't closed with >.`);
      attrs.push([(a[1] ?? "").toLowerCase(), decodeEntities(a[2] ?? a[3] ?? a[4] ?? "")]);
      i += a[0].length;
    }
    let text = "";
    if (!VOID.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "i").exec(s.slice(i));
      if (!close) return fail(`<${tag}> needs a closing </${tag}>.`);
      text = s.slice(i, i + close.index);
      i += close.index + close[0].length;
    }
    const parsed = snippetElementSchema.safeParse({ tag, attrs, text });
    if (!parsed.success) return fail(`<${tag}>: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
    elements.push(parsed.data);
    if (elements.length > SNIPPET_MAX_ELEMENTS)
      return fail(`Page code can have at most ${SNIPPET_MAX_ELEMENTS} elements.`);
  }
  return { ok: true, elements };
}

/** The few character references attribute values use, so print → parse is stable. */
function decodeEntities(v: string): string {
  return v.replace(/&(quot|amp|lt|gt|#39|apos);/g, (_, e: string) =>
    e === "quot" ? '"' : e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : "'",
  );
}

const escapeAttr = (v: string) => v.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/** The elements as HTML, one per line (what the editor shows and Astro outputs). */
export function printSnippet(elements: readonly SnippetElement[]): string {
  return elements
    .map((e) => {
      const attrs = e.attrs
        .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`))
        .join("");
      return VOID.has(e.tag) ? `<${e.tag}${attrs}>` : `<${e.tag}${attrs}>${e.text}</${e.tag}>`;
    })
    .join("\n");
}
