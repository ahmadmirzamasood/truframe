/**
 * Input documents for the compiler's golden fixtures (`fixtures/compiler/<name>/input.json`).
 * Each one targets a part of the compiler; together they cover every node type, style slot,
 * breakpoint rule, component feature and both frameworks (each input is compiled for both).
 *
 * Regenerate inputs with `node scripts/compiler-fixtures.ts`, then the expected output with
 * `UPDATE_GOLDENS=1 cargo test -p truframe-compiler --test goldens`.
 */
import { createHash } from "node:crypto";
import {
  createDocument,
  type Node,
  type Page,
  type ProjectDocument,
  type Props,
  type Style,
  templateDocument,
} from "../../packages/model/src/index.ts";
import {
  desktopOnly,
  FIXTURE_PROJECT_ID,
  kitchenSink,
  richDoc,
} from "../../packages/model/src/testing/fixtures.ts";

type Builder = {
  doc: ProjectDocument;
  /** Adds a node and returns its id. */
  /** Adds a node (validated with the whole document) and returns its id. */
  add(node: { type: string; id?: string; [key: string]: unknown }): string;
  frame(name: string, style: Style | Props, children: string[], tag?: string): string;
  text(name: string, text: string, style?: Style | Props, tag?: string): string;
  page(name: string, path: string, children: string[], seo?: Partial<Page["seo"]>): void;
  asset(id: string, name: string, width: number, height: number): string;
};

const isStyle = (s: Style | Props): s is Style => "desktop" in s;
const st = (s: Style | Props | undefined): Style =>
  s === undefined ? { desktop: {} } : isStyle(s) ? s : { desktop: s };

/** A blank document with a builder; the home page body gets `children`. */
function build(fill: (b: Builder) => string[]): ProjectDocument {
  let n = 0;
  const doc = createDocument({
    id: FIXTURE_PROJECT_ID,
    framework: "nextjs",
    ids: () => `id${++n}`,
  });
  const home = doc.pages[0];
  if (!home) throw new Error("no home page");
  let next = 0;
  const b: Builder = {
    doc,
    add(node) {
      const id = node.id ?? `n${++next}`;
      doc.nodes[id] = { ...node, id } as unknown as Node;
      return id;
    },
    frame(name, style, children, tag = "div") {
      return b.add({ type: "frame", name, tag, style: st(style), children });
    },
    text(name, text, style, tag = "p") {
      return b.add({ type: "text", name, tag, style: st(style), content: [{ text }] });
    },
    page(name, path, children, seo) {
      const root = b.frame("Body", { display: "stack", direction: "column" }, children, "main");
      const id = `page${doc.pages.length + 1}`;
      doc.pages.push({
        id,
        name,
        path,
        seo: { title: name, description: "", ogImage: null, noindex: false, ...seo },
        root,
      });
    },
    asset(id, name, width, height) {
      const ext = name.split(".").pop() ?? "png";
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext === "svg" ? "svg+xml" : ext}`;
      doc.assets[id] = {
        id,
        name,
        mime: mime as never,
        width,
        height,
        bytes: 1000,
        key: `assets/${createHash("sha256").update(id).digest("hex")}.${ext}`,
      };
      return id;
    },
  };
  const children = fill(b);
  const body = doc.nodes[home.root];
  if (body?.type === "frame") body.children.push(...children);
  return doc;
}

const pad = (y: number, x: number) => ({ top: y, right: x, bottom: y, left: x });
const fixed = (value: number) => ({ type: "fixed" as const, value });
const FILL = { type: "fill" as const };

export function compilerFixtures(): Record<string, ProjectDocument> {
  const tpl = (id: "blank" | "landing" | "portfolio" | "saas") =>
    templateDocument(id, { projectId: FIXTURE_PROJECT_ID, framework: "nextjs" });
  return {
    "template-blank": tpl("blank"),
    "template-landing": tpl("landing"),
    "template-portfolio": tpl("portfolio"),
    "template-saas": tpl("saas"),
    "model-kitchen-sink": kitchenSink(),
    "model-rich": richDoc(),
    "model-desktop-only": desktopOnly(),

    "hero-responsive": build((b) => {
      const title = b.text(
        "Title",
        "Ship sites people remember",
        {
          desktop: { fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.025 },
          tablet: { fontSize: 48 },
          mobile: { fontSize: 36, textAlign: "center" },
        },
        "h1",
      );
      const lede = b.text("Lede", "Design on a canvas. Get real code.", {
        desktop: { fontSize: 20, textColor: "#52525b", maxWidth: 560 },
        mobile: { fontSize: 18 },
      });
      const copy = b.frame(
        "Copy",
        {
          desktop: { display: "stack", direction: "column", gap: 24, width: FILL },
          mobile: { align: "center" },
        },
        [title, lede],
      );
      const art = b.add({
        type: "image",
        name: "Hero art",
        tag: "img",
        style: {
          desktop: { width: fixed(480), height: fixed(360), radius: 24 },
          mobile: { width: FILL, height: fixed(240) },
        },
        assetId: b.asset("heroart", "Hero Art.png", 1440, 1080),
        alt: "A canvas with frames for desktop, tablet and mobile",
        decorative: false,
        fit: "fill",
      });
      return [
        b.frame(
          "Hero",
          {
            desktop: {
              display: "stack",
              gap: 64,
              align: "center",
              padding: pad(96, 64),
              fill: { type: "solid", color: "#fafafa" },
            },
            tablet: { gap: 32, padding: pad(64, 32) },
            mobile: { direction: "column", gap: 24, padding: pad(48, 16) },
          },
          [copy, art],
          "section",
        ),
      ];
    }),

    "grid-gallery": build((b) => {
      const items = ["One", "Two", "Three", "Four", "Five"].map((name, i) =>
        b.add({
          type: "image",
          name,
          tag: "figure",
          style: {
            desktop: {
              columnSpan: i === 0 ? 2 : 1,
              rowSpan: i === 0 ? 2 : 1,
              aspectRatio: i === 0 ? 1 : 4 / 3,
              radius: 12,
              overflow: "clip",
            },
            mobile: { columnSpan: 1, rowSpan: 1 },
          },
          assetId: b.asset(`photo${i}`, `photo ${i + 1}.jpg`, 1200, 900),
          alt: `Photo ${i + 1}`,
          decorative: false,
          fit: i % 2 ? "fit" : "crop",
        }),
      );
      return [
        b.frame(
          "Gallery",
          {
            desktop: { display: "grid", gridColumns: 4, gap: 16, padding: pad(64, 64) },
            tablet: { gridColumns: 2 },
            mobile: { gridColumns: 1, gap: 8, padding: pad(24, 16) },
          },
          items,
          "section",
        ),
      ];
    }),

    typography: build((b) => {
      const heads = (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag, i) =>
        b.text(
          `Heading ${i + 1}`,
          `Heading level ${i + 1}`,
          { fontSize: [60, 48, 36, 30, 24, 20][i] },
          tag,
        ),
      );
      const rich = b.add({
        type: "text",
        name: "Rich",
        tag: "p",
        style: { desktop: { fontSize: 18, lineHeight: 1.625, textAlign: "justify" } },
        content: [
          { text: "Plain, " },
          { text: "bold", bold: true },
          { text: ", " },
          { text: "italic", italic: true },
          { text: ", " },
          { text: "underlined", underline: true },
          { text: ", " },
          { text: "all three", bold: true, italic: true, underline: true },
          { text: " and " },
          { text: "a link", href: "https://example.com/docs" },
          { text: ".\nA second line." },
        ],
      });
      const quote = b.text(
        "Quote",
        "Simplicity is the ultimate sophistication.",
        {
          fontSize: 24,
          textTransform: "uppercase",
          letterSpacing: 0.1,
          textDecoration: "none",
          truncate: true,
        },
        "blockquote",
      );
      const small = b.text(
        "Fine print",
        "Prices exclude tax.",
        { fontSize: 12, textColor: "#71717a" },
        "span",
      );
      return [
        b.frame(
          "Article",
          { display: "stack", direction: "column", gap: 16, padding: pad(48, 48) },
          [...heads, rich, quote, small],
          "article",
        ),
      ];
    }),

    variables: build((b) => {
      b.doc.variables = {
        accent: {
          id: "accent",
          type: "color",
          name: "Accent",
          group: "Brand",
          cssName: "--brand-accent",
          value: { desktop: "#ec221f", tablet: "#d11d1a", mobile: "#b01815" },
        },
        ink: {
          id: "ink",
          type: "color",
          name: "Ink",
          group: "Neutral",
          cssName: "--neutral-ink",
          value: { desktop: "#18181b" },
        },
        gutter: {
          id: "gutter",
          type: "spacing",
          name: "Gutter",
          group: "Spacing",
          cssName: "--space-gutter",
          value: { desktop: 64, tablet: 32, mobile: 16 },
        },
        stack: {
          id: "stack",
          type: "spacing",
          name: "Stack",
          group: "Spacing",
          cssName: "--space-stack",
          value: { desktop: 24, mobile: 24 },
        },
        round: {
          id: "round",
          type: "spacing",
          name: "Round",
          group: "Radius",
          cssName: "--radius-round",
          value: { desktop: 12, tablet: 8 },
        },
        ctaWidth: {
          id: "ctaWidth",
          type: "spacing",
          name: "CTA width",
          group: "Size",
          cssName: "--size-cta-width",
          value: { desktop: 240, mobile: 180 },
        },
        display: {
          id: "display",
          type: "font",
          name: "Display",
          group: "Text",
          cssName: "--font-display",
          value: {
            desktop: {
              family: "Inter",
              weight: 800,
              size: 64,
              lineHeight: 1.05,
              letterSpacing: -0.03,
            },
            tablet: {
              family: "Inter",
              weight: 800,
              size: 48,
              lineHeight: 1.1,
              letterSpacing: -0.02,
            },
            mobile: {
              family: "Inter",
              weight: 700,
              size: 36,
              lineHeight: 1.15,
              letterSpacing: -0.01,
            },
          },
        },
      };
      const v = (id: string) => ({ var: id });
      const title = b.text(
        "Title",
        "Bound to variables",
        { font: v("display"), textColor: v("ink") },
        "h1",
      );
      const cta = b.add({
        type: "link",
        name: "CTA",
        tag: "a",
        style: {
          desktop: {
            padding: { top: 12, right: v("stack"), bottom: 12, left: v("stack") },
            fill: { type: "solid", color: v("accent") },
            textColor: "#ffffff",
            radius: v("round"),
            width: { type: "fixed", value: v("ctaWidth") },
          },
        },
        target: { type: "url", href: "#start" },
        newTab: false,
        children: [b.text("Label", "Start", { fontWeight: 600 }, "span")],
      });
      return [
        b.frame(
          "Section",
          {
            display: "stack",
            direction: "column",
            gap: v("stack"),
            padding: {
              top: v("gutter"),
              right: v("gutter"),
              bottom: v("gutter"),
              left: v("gutter"),
            },
            border: {
              width: 1,
              color: v("accent"),
              style: "solid",
              sides: { top: false, right: false, bottom: true, left: false },
            },
          },
          [title, cta],
          "section",
        ),
      ];
    }),

    fonts: build((b) => {
      const head = b.text(
        "Headline",
        "Editorial headline",
        { fontFamily: "Playfair Display", fontSize: 48, fontWeight: 700 },
        "h1",
      );
      const sub = b.text(
        "Subhead",
        "With a serif subhead",
        { fontFamily: "Playfair Display", fontSize: 24, fontWeight: 400 },
        "h2",
      );
      const body = b.text("Body", "Body copy inherits Inter from its section.", { fontSize: 16 });
      const strong = b.text("Strong", "Semibold label", { fontWeight: 600 }, "span");
      const sys = b.text("System", "Georgia is a system font.", { fontFamily: "Georgia" });
      return [
        b.frame(
          "Story",
          { display: "stack", direction: "column", gap: 12, fontFamily: "Inter" },
          [head, sub, body, strong, sys],
          "article",
        ),
      ];
    }),

    images: build((b) => {
      const photo = b.asset("photo", "team.jpg", 1600, 900);
      const logo = b.asset("logo", "logo.svg", 120, 40);
      const img = (name: string, tag: string, extra: Record<string, unknown>) =>
        b.add({
          type: "image",
          name,
          tag,
          style: { desktop: { width: fixed(320), height: fixed(180) } },
          assetId: photo,
          alt: `${name} photo`,
          decorative: false,
          fit: "fill",
          ...extra,
        });
      return [
        b.frame("Images", { display: "stack", wrap: true, gap: 16 }, [
          img("Plain", "img", {}),
          img("Contained", "img", { fit: "fit" }),
          img("Tiled", "img", { fit: "tile" }),
          img("Figure", "figure", { fit: "crop" }),
          img("Picture", "picture", {}),
          img("Decorative", "img", { decorative: true, alt: "ignored" }),
          img("Placeholder", "img", { assetId: null, alt: "Coming soon" }),
          img("Empty placeholder", "img", { assetId: null, alt: "" }),
          b.add({
            type: "image",
            name: "Logo",
            tag: "img",
            style: { desktop: { width: fixed(120), height: fixed(40) } },
            assetId: logo,
            alt: "Acme",
            decorative: false,
            fit: "fit",
          }),
        ]),
      ];
    }),

    links: build((b) => {
      b.page("About", "/about", [b.text("About", "About us", {}, "h1")]);
      const link = (
        name: string,
        target: unknown,
        extra: Record<string, unknown>,
        children: string[],
      ) =>
        b.add({
          type: "link",
          name,
          tag: "a",
          style: { desktop: { display: "stack", gap: 8, align: "center" } },
          target,
          newTab: false,
          children,
          ...extra,
        });
      const icon = b.add({
        type: "icon",
        name: "Arrow",
        tag: "span",
        style: { desktop: { width: fixed(16), height: fixed(16) } },
        set: "lucide",
        icon: "arrow-right",
      });
      return [
        b.frame(
          "Nav",
          { display: "stack", gap: 24, justify: "between" },
          [
            link("Page link", { type: "page", pageId: "page2" }, {}, [
              b.text("t1", "About", {}, "span"),
            ]),
            link("Path link", { type: "url", href: "/about#team" }, {}, [
              b.text("t2", "Team", {}, "span"),
            ]),
            link("Anchor", { type: "url", href: "#pricing" }, {}, [
              b.text("t3", "Pricing", {}, "span"),
            ]),
            link("External", { type: "url", href: "https://example.com" }, { newTab: true }, [
              b.text("t4", "Docs", {}, "span"),
            ]),
            link("Mail", { type: "url", href: "mailto:hello@example.com" }, {}, [
              b.text("t5", "Email", {}, "span"),
            ]),
            link("Phone", { type: "url", href: "tel:+1 555 0100" }, {}, [
              b.text("t6", "Call", {}, "span"),
            ]),
            link(
              "Icon only",
              { type: "url", href: "/about" },
              { ariaLabel: "Next page", tag: "button" },
              [icon],
            ),
          ],
          "nav",
        ),
      ];
    }),

    "absolute-position": build((b) => {
      const badge = b.text(
        "Badge",
        "New",
        {
          desktop: {
            position: "absolute",
            top: -8,
            right: -8,
            zIndex: 10,
            padding: pad(2, 8),
            fill: { type: "solid", color: "#16a34a" },
            textColor: "#ffffff",
            radius: 9999,
            fontSize: 12,
          },
          mobile: { position: "auto" },
        },
        "span",
      );
      const back = b.frame(
        "Backdrop",
        {
          desktop: {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: -1,
            opacity: 0.4,
            blur: 24,
            fill: { type: "solid", color: "#a5b4fc" },
          },
        },
        [],
      );
      return [
        b.frame(
          "Card",
          {
            display: "stack",
            direction: "column",
            padding: pad(24, 24),
            width: fixed(320),
            radius: 16,
          },
          [back, b.text("Body", "Positioned children"), badge],
        ),
      ];
    }),

    "hidden-per-breakpoint": build((b) => {
      const desktopNav = b.frame(
        "Desktop nav",
        { display: "stack", gap: 24 },
        [b.text("a", "Home", {}, "span"), b.text("b", "Work", {}, "span")],
        "nav",
      );
      b.doc.nodes[desktopNav] = {
        ...b.doc.nodes[desktopNav],
        hidden: { mobile: true },
      } as unknown as Node;
      const menu = b.text("Menu", "Menu", { fontWeight: 600 }, "span");
      b.doc.nodes[menu] = {
        ...b.doc.nodes[menu],
        hidden: { desktop: true, mobile: false },
      } as unknown as Node;
      const tabletOnly = b.text("Tablet note", "Tablet only", {}, "p");
      b.doc.nodes[tabletOnly] = {
        ...b.doc.nodes[tabletOnly],
        hidden: { desktop: true, tablet: false, mobile: true },
      } as unknown as Node;
      return [
        b.frame(
          "Header",
          { display: "stack", justify: "between", align: "center", padding: pad(16, 32) },
          [b.text("Logo", "Acme", { fontWeight: 700 }), desktopNav, menu, tabletOnly],
          "header",
        ),
      ];
    }),

    "nested-routes": build((b) => {
      b.page("About", "/about", [b.text("h", "About", {}, "h1")], { description: "Who we are." });
      b.page("Blog", "/blog", [b.text("h", "Blog", {}, "h1")]);
      b.page("First post", "/blog/first-post", [b.text("h", "First post", {}, "h1")], {
        title: "First post | Blog",
      });
      b.page("Deep", "/docs/guides/getting-started", [b.text("h", "Getting started", {}, "h1")]);
      return [b.text("Home", "Home", {}, "h1")];
    }),

    seo: build((b) => {
      b.page("Private", "/private", [b.text("h", "Not indexed", {}, "h1")], {
        noindex: true,
        description: "Only for the team.",
      });
      const home = b.doc.pages[0];
      if (home)
        home.seo = {
          title: 'Acme — "Quotes" & <Symbols>',
          description: "Line one.\nLine two with 'quotes'.",
          ogImage: null,
          noindex: false,
        };
      return [b.text("Title", "SEO", {}, "h1")];
    }),

    // P6-5: head/body code on two pages; scripts through next/script, data scripts plain.
    "page-code": build((b) => {
      const home = b.doc.pages[0];
      if (home)
        home.code = {
          head: [
            {
              tag: "script",
              attrs: [
                ["defer", ""],
                ["data-domain", "example.com"],
                ["src", "https://plausible.io/js/script.js"],
              ],
              text: "",
            },
            {
              tag: "meta",
              attrs: [
                ["name", "google-site-verification"],
                ["content", "abc123"],
              ],
              text: "",
            },
            {
              tag: "link",
              attrs: [
                ["rel", "preconnect"],
                ["href", "https://fonts.gstatic.com"],
                ["crossorigin", ""],
              ],
              text: "",
            },
            {
              tag: "script",
              attrs: [["type", "application/ld+json"]],
              text: '{"@context":"https://schema.org","@type":"Organization","name":"Acme \\"Q\\""}',
            },
          ],
          body: [
            { tag: "script", attrs: [], text: "window.tfLoaded = true;" },
            { tag: "noscript", attrs: [], text: '<img src="https://px.example.com/1.gif" alt="">' },
          ],
        };
      b.page("About", "/about", [b.text("Title", "About", {}, "h1")]);
      const about = b.doc.pages[1];
      if (about)
        about.code = { head: [], body: [{ tag: "style", attrs: [], text: "body{margin:0}" }] };
      return [b.text("Title", "Page code", {}, "h1")];
    }),

    "embed-and-icons": build((b) => [
      b.add({
        type: "embed",
        name: "Map",
        tag: "figure",
        style: { desktop: { width: FILL, aspectRatio: 16 / 9 } },
        source: { type: "url", url: "https://www.openstreetmap.org/export/embed.html" },
      }),
      b.add({
        type: "embed",
        name: "",
        tag: "div",
        style: { desktop: { height: fixed(120) } },
        source: { type: "url", url: "https://example.com/widget" },
      }),
      b.add({
        type: "embed",
        name: "Snippet",
        tag: "section",
        style: { desktop: { height: fixed(80) } },
        source: { type: "html", html: "<script>alert(1)</script>" },
      }),
      b.frame(
        "Icons",
        { display: "stack", gap: 8 },
        ["star", "heart", "check"].map((icon) =>
          b.add({
            type: "icon",
            name: icon,
            tag: "span",
            style: { desktop: { width: fixed(24), height: fixed(24), textColor: "#f59e0b" } },
            set: "lucide",
            icon,
          }),
        ),
      ),
    ]),

    "special-characters": build((b) => {
      b.doc.settings.lang = "de-CH";
      return [
        b.text("Braces", "Use {curly} braces, <angle> brackets & ampersands."),
        b.text("Quotes", `"Double", 'single' and \`backticks\` \\ backslash.`),
        b.text("Unicode", "Grüezi 👋 — naïve café, 日本語."),
        b.text("Whitespace", "  leading and trailing  ", { textAlign: "center" }),
        b.text("Multiline", "Line one\nLine two\n\nLine four"),
        b.text(
          "Long",
          "This sentence is long enough that the printer must move it onto its own line instead of keeping it next to the tag.",
        ),
      ];
    }),

    backgrounds: build((b) => {
      const tile = b.asset("pattern", "pattern.png", 64, 64);
      const cover = b.asset("cover", "cover.webp", 2400, 1200);
      const box = (name: string, style: Style | Props) => b.frame(name, style, []);
      return [
        b.frame("Backgrounds", { display: "grid", gridColumns: 3, gap: 16 }, [
          box("Solid", { height: fixed(120), fill: { type: "solid", color: "#0ea5e9" } }),
          box("Alpha", { height: fixed(120), fill: { type: "solid", color: "#0ea5e980" } }),
          box("Gradient", {
            height: fixed(120),
            fill: {
              type: "linearGradient",
              angle: 135,
              stops: [
                { color: "#6366f1", position: 0 },
                { color: "#ec4899", position: 0.6 },
                { color: "#f59e0b", position: 1 },
              ],
            },
          }),
          box("Tile", { height: fixed(120), fill: { type: "image", assetId: tile, fit: "tile" } }),
          box("Cover", {
            desktop: { height: fixed(120), fill: { type: "image", assetId: cover, fit: "fill" } },
            mobile: { fill: { type: "solid", color: "#111827" } },
          }),
          box("Contain", {
            height: fixed(120),
            fill: { type: "image", assetId: cover, fit: "fit" },
            blend: "multiply",
          }),
        ]),
      ];
    }),

    "borders-and-effects": build((b) => {
      const box = (name: string, style: Props) =>
        b.frame(name, { width: fixed(160), height: fixed(100), ...style }, []);
      return [
        b.frame("Effects", { display: "stack", wrap: true, gap: 24, padding: pad(32, 32) }, [
          box("Hairline", {
            border: {
              width: 1,
              color: "#e4e4e7",
              style: "solid",
              sides: { top: true, right: true, bottom: true, left: true },
            },
            radius: 8,
          }),
          box("Dashed", {
            border: {
              width: 2,
              color: "#a1a1aa",
              style: "dashed",
              sides: { top: true, right: true, bottom: true, left: true },
            },
            radius: 12,
          }),
          box("Underline", {
            border: {
              width: 3,
              color: "#18181b",
              style: "solid",
              sides: { top: false, right: false, bottom: true, left: false },
            },
          }),
          box("Corners", { radius: { topLeft: 24, topRight: 4, bottomRight: 24, bottomLeft: 4 } }),
          box("Pill", { radius: 9999, fill: { type: "solid", color: "#f4f4f5" } }),
          box("Shadow", {
            shadows: [
              { x: 0, y: 10, blur: 15, spread: -3, color: "#0000001a", inset: false },
              { x: 0, y: 4, blur: 6, spread: -4, color: "#0000001a", inset: false },
            ],
            radius: 16,
          }),
          box("Inset", {
            shadows: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#0000000d", inset: true }],
          }),
          box("Faded", { opacity: 0.5, fill: { type: "solid", color: "#22c55e" } }),
          box("Blurred", { blur: 8, fill: { type: "solid", color: "#22c55e" } }),
          box("Clipped", {
            overflow: "clip",
            minWidth: 100,
            maxWidth: 400,
            minHeight: 50,
            maxHeight: 300,
          }),
        ]),
      ];
    }),

    "sizing-in-stacks": build((b) => {
      const cell = (name: string, style: Props) =>
        b.frame(name, { padding: pad(8, 8), fill: { type: "solid", color: "#e0e7ff" }, ...style }, [
          b.text(`${name} label`, name, {}, "span"),
        ]);
      const row = b.frame(
        "Row",
        { display: "stack", gap: 12, align: "stretch", height: fixed(120) },
        [
          cell("Fixed", { width: fixed(120) }),
          cell("Fill", { width: FILL }),
          cell("Fit", { width: { type: "fit" } }),
          cell("Stretch", { height: FILL, width: fixed(80) }),
        ],
      );
      const column = b.frame(
        "Column",
        { display: "stack", direction: "column", gap: 12, align: "start" },
        [
          cell("Full width", { width: FILL }),
          cell("Grow", { height: FILL }),
          cell("Fixed height", { height: fixed(48) }),
        ],
      );
      const responsive = b.frame(
        "Responsive",
        { desktop: { display: "stack", gap: 16 }, mobile: { direction: "column" } },
        [cell("Left", { width: FILL }), cell("Right", { width: FILL })],
      );
      return [
        b.frame(
          "Layouts",
          { display: "stack", direction: "column", gap: 32, padding: pad(32, 32) },
          [row, column, responsive],
        ),
      ];
    }),

    "code-class-collisions": build((b) => [
      b.frame("Container", { display: "stack" }, [
        b.text("Flex", "Flex"),
        b.text("Grid", "Grid"),
        b.text("Hidden", "Hidden"),
        b.text("Text center", "Text center"),
        b.text("Card", "Card 1"),
        b.text("Card", "Card 2"),
        b.text("Card", "Card 3"),
        b.text("", "Unnamed text"),
        b.text("✨", "Emoji name"),
        b.text("2024 plans", "Starts with a digit"),
        b.text("HeroSection", "Pascal case"),
        b.text("P", "Single letter"),
        b.text("P", "Single letter again"),
        b.text("Group", "Variant name"),
        b.text("Mobile", "Our breakpoint variant"),
      ]),
    ]),

    "no-tablet": build((b) => {
      delete b.doc.breakpoints.tablet;
      b.doc.breakpoints.desktop.width = 1440;
      return [
        b.frame(
          "Split",
          {
            desktop: { display: "stack", gap: 48, padding: pad(80, 80) },
            tablet: { gap: 999 },
            mobile: { direction: "column", gap: 16, padding: pad(24, 16) },
          },
          [
            b.text("Left", "Tablet overrides stay in the document but are inactive.", {
              desktop: { fontSize: 20 },
              mobile: { fontSize: 16 },
            }),
            b.text("Right", "Mobile applies below 1200px.", {}),
          ],
          "section",
        ),
      ];
    }),

    "desktop-only-wide": build((b) => {
      delete b.doc.breakpoints.tablet;
      delete b.doc.breakpoints.mobile;
      b.doc.breakpoints.desktop.width = 1920;
      return [
        b.frame(
          "Banner",
          {
            desktop: { display: "stack", justify: "center", padding: pad(40, 40) },
            mobile: { padding: pad(8, 8) },
          },
          [b.text("Text", "No smaller breakpoints")],
        ),
      ];
    }),

    "component-basic": build((b) => {
      const title = b.text("Title", "Starter", { fontSize: 20, fontWeight: 600 }, "h3");
      const price = b.text("Price", "$0", { fontSize: 36, fontWeight: 700 });
      const root = b.frame(
        "Pricing card",
        {
          display: "stack",
          direction: "column",
          gap: 8,
          padding: pad(24, 24),
          width: fixed(280),
          radius: 16,
          border: {
            width: 1,
            color: "#e4e4e7",
            style: "solid",
            sides: { top: true, right: true, bottom: true, left: true },
          },
        },
        [title, price],
        "article",
      );
      b.doc.components.card = {
        id: "card",
        name: "PricingCard",
        root,
        props: [
          {
            name: "title",
            type: "text",
            default: "Starter",
            target: { nodeId: title, field: "content" },
          },
          {
            name: "price",
            type: "text",
            default: "$0",
            target: { nodeId: price, field: "content" },
          },
        ],
        variantProps: [],
        variants: {},
      };
      const inst = (name: string, props: Record<string, string>, style: Props = {}) =>
        b.add({
          type: "instance",
          name,
          tag: "div",
          style: { desktop: style },
          componentId: "card",
          overrides: { variant: {}, props, nodes: {} },
        });
      return [
        b.frame(
          "Pricing",
          {
            desktop: { display: "stack", gap: 24, justify: "center" },
            mobile: { direction: "column", align: "center" },
          },
          [
            inst("Free", {}),
            inst("Pro", { title: "Pro", price: "$24" }, { width: FILL }),
            inst("Pricing card", { title: "Team", price: "$99" }),
          ],
          "section",
        ),
      ];
    }),

    "component-variants": build((b) => {
      const label = b.text("Label", "Click me", { fontWeight: 600 }, "span");
      const root = b.add({
        type: "link",
        name: "Button",
        tag: "a",
        style: {
          desktop: {
            display: "stack",
            align: "center",
            padding: pad(10, 16),
            radius: 8,
            fill: { type: "solid", color: "#18181b" },
            textColor: "#ffffff",
          },
        },
        target: { type: "url", href: "#" },
        newTab: false,
        children: [label],
      });
      b.doc.components.btn = {
        id: "btn",
        name: "Button",
        root,
        props: [
          {
            name: "label",
            type: "text",
            default: "Click me",
            target: { nodeId: label, field: "content" },
          },
          { name: "href", type: "link", default: "#", target: { nodeId: root, field: "href" } },
        ],
        variantProps: [
          { name: "size", values: ["small", "default", "large"], default: "default" },
          { name: "tone", values: ["dark", "light"], default: "dark" },
        ],
        variants: {
          "size=small,tone=dark": {
            [root]: { desktop: { padding: pad(6, 12), radius: 6 } },
            [label]: { desktop: { fontSize: 14 } },
          },
          "size=large,tone=dark": {
            [root]: { desktop: { padding: pad(14, 24) } },
            [label]: { desktop: { fontSize: 18 } },
          },
          "size=default,tone=light": {
            [root]: {
              desktop: {
                fill: { type: "solid", color: "#ffffff" },
                textColor: "#18181b",
                border: {
                  width: 1,
                  color: "#e4e4e7",
                  style: "solid",
                  sides: { top: true, right: true, bottom: true, left: true },
                },
              },
            },
          },
        },
      };
      const inst = (
        name: string,
        variant: Record<string, string>,
        props: Record<string, string> = {},
      ) =>
        b.add({
          type: "instance",
          name,
          tag: "div",
          style: { desktop: {} },
          componentId: "btn",
          overrides: { variant, props, nodes: {} },
        });
      return [
        b.frame("Buttons", { display: "stack", gap: 12, align: "center" }, [
          inst("Default", {}),
          inst("Small", { size: "small" }, { label: "Small" }),
          inst("Large", { size: "large" }, { label: "Get started", href: "/signup" }),
          inst("Light", { tone: "light" }, { label: "Learn more", href: "https://example.com" }),
        ]),
      ];
    }),

    "component-image-and-boolean-props": build((b) => {
      const avatar = b.asset("avatar", "avatar.png", 256, 256);
      const other = b.asset("other", "Other Person.jpg", 512, 512);
      const photo = b.add({
        type: "image",
        name: "Photo",
        tag: "img",
        style: { desktop: { width: fixed(64), height: fixed(64), radius: 9999 } },
        assetId: avatar,
        alt: "",
        decorative: true,
        fit: "fill",
      });
      const name = b.text("Name", "Ada Lovelace", { fontWeight: 600 });
      const badge = b.text("Badge", "Verified", { fontSize: 12, textColor: "#16a34a" }, "span");
      const root = b.frame("Person", { display: "stack", gap: 12, align: "center" }, [
        photo,
        name,
        badge,
      ]);
      b.doc.components.person = {
        id: "person",
        name: "PersonChip",
        root,
        props: [
          {
            name: "photo",
            type: "image",
            default: avatar,
            target: { nodeId: photo, field: "assetId" },
          },
          {
            name: "name",
            type: "text",
            default: "Ada Lovelace",
            target: { nodeId: name, field: "content" },
          },
          {
            name: "verified",
            type: "boolean",
            default: true,
            target: { nodeId: badge, field: "visible" },
          },
        ],
        variantProps: [],
        variants: {},
      };
      const inst = (n: string, props: Record<string, unknown>) =>
        b.add({
          type: "instance",
          name: n,
          tag: "li",
          style: { desktop: {} },
          componentId: "person",
          overrides: { variant: {}, props, nodes: {} },
        });
      return [
        b.frame(
          "People",
          { display: "stack", direction: "column", gap: 16 },
          [
            inst("Ada", {}),
            inst("Grace", { name: "Grace Hopper", photo: other, verified: false }),
            inst("Nobody", { name: "No photo", photo: null }),
          ],
          "ul",
        ),
      ];
    }),

    "component-inline-overrides": build((b) => {
      const heading = b.text("Heading", "Feature", { fontSize: 20, fontWeight: 600 }, "h3");
      const body = b.text("Body", "Describe the feature.", { textColor: "#52525b" });
      const icon = b.add({
        type: "image",
        name: "Icon",
        tag: "img",
        style: { desktop: { width: fixed(40), height: fixed(40) } },
        assetId: null,
        alt: "",
        decorative: true,
        fit: "fit",
      });
      const root = b.frame(
        "Feature",
        { display: "stack", direction: "column", gap: 8, padding: pad(16, 16) },
        [icon, heading, body],
      );
      const pic = b.asset("bolt", "bolt.svg", 40, 40);
      b.doc.components.feature = {
        id: "feature",
        name: "Feature",
        root,
        props: [
          {
            name: "heading",
            type: "text",
            default: "Feature",
            target: { nodeId: heading, field: "content" },
          },
        ],
        variantProps: [{ name: "emphasis", values: ["normal", "strong"], default: "normal" }],
        variants: {
          "emphasis=strong": {
            [root]: { desktop: { fill: { type: "solid", color: "#fef3c7" }, radius: 12 } },
          },
        },
      };
      return [
        b.frame(
          "Features",
          { display: "grid", gridColumns: 3, gap: 24 },
          [
            b.add({
              type: "instance",
              name: "Plain",
              tag: "div",
              style: { desktop: {} },
              componentId: "feature",
              overrides: { variant: {}, props: {}, nodes: {} },
            }),
            b.add({
              type: "instance",
              name: "Fast",
              tag: "div",
              style: { desktop: { columnSpan: 2 } },
              componentId: "feature",
              overrides: {
                variant: { emphasis: "strong" },
                props: { heading: "Fast" },
                nodes: {
                  [body]: {
                    content: [
                      { text: "Compiles in " },
                      { text: "milliseconds", bold: true },
                      { text: "." },
                    ],
                    style: { desktop: { textColor: "#92400e" } },
                  },
                  [icon]: { assetId: pic, alt: "Lightning bolt" },
                },
              },
            }),
            b.add({
              type: "instance",
              name: "Hidden body",
              tag: "div",
              style: { desktop: {} },
              componentId: "feature",
              overrides: {
                variant: {},
                props: { heading: "Short" },
                nodes: { [body]: { hidden: { desktop: true } } },
              },
            }),
          ],
          "section",
        ),
      ];
    }),
  };
}
