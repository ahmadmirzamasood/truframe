import { describe, expect, it } from "vitest";
import { activeBreakpoints, BREAKPOINT_RANGES, DEFAULT_BREAKPOINT_WIDTHS } from "./breakpoints.ts";
import { createDocument, newId } from "./defaults.ts";
import { type ProjectDocument, validateDocument } from "./document.ts";
import type { Node } from "./nodes.ts";
import { templateDocument } from "./templates.ts";

const projectId = "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b";

function seq() {
  let n = 0;
  return () => `id${++n}`;
}

/** A small document with one of everything, built on a blank one. */
function richDoc(): ProjectDocument {
  const doc = createDocument({ id: projectId, framework: "nextjs", ids: seq() });
  const body = doc.nodes.id2 as Extract<Node, { type: "frame" }>;
  doc.variables.brand = {
    id: "brand",
    name: "Brand",
    group: "Colors",
    cssName: "--colors-brand",
    type: "color",
    value: { desktop: "#ff0000", mobile: "#00ff00" },
  };
  doc.variables.space = {
    id: "space",
    name: "Md",
    group: "Spacing",
    cssName: "--spacing-md",
    type: "spacing",
    value: { desktop: 24, tablet: 16 },
  };
  doc.variables.body = {
    id: "body",
    name: "Body",
    group: "Text",
    cssName: "--text-body",
    type: "font",
    value: {
      desktop: { family: "Inter", weight: 400, size: 16, lineHeight: 1.5, letterSpacing: 0 },
    },
  };
  doc.assets.photo = {
    id: "photo",
    name: "photo.png",
    mime: "image/png",
    width: 800,
    height: 600,
    bytes: 1234,
    key: `assets/${"a".repeat(64)}.png`,
  };
  doc.pages.push({
    id: "about",
    name: "About",
    path: "/about",
    seo: { title: "About", description: "", ogImage: "photo", noindex: false },
    root: "aboutBody",
  });
  doc.nodes.aboutBody = {
    id: "aboutBody",
    type: "frame",
    name: "Body",
    tag: "main",
    style: { desktop: {} },
    children: [],
  };
  doc.nodes.hero = {
    id: "hero",
    type: "frame",
    name: "Hero",
    tag: "section",
    style: {
      desktop: {
        display: "stack",
        direction: "row",
        gap: { var: "space" },
        padding: { top: 8, right: 8, bottom: { var: "space" }, left: 8 },
        fill: { type: "solid", color: { var: "brand" } },
      },
      mobile: { direction: "column" },
    },
    children: ["title", "pic", "cta", "card"],
  };
  doc.nodes.title = {
    id: "title",
    type: "text",
    name: "",
    tag: "h1",
    style: { desktop: { font: { var: "body" }, textColor: "#111111" } },
    content: [{ text: "Hello " }, { text: "world", bold: true }],
  };
  doc.nodes.pic = {
    id: "pic",
    type: "image",
    name: "",
    tag: "img",
    assetId: "photo",
    alt: "A photo",
    decorative: false,
    fit: "crop",
    style: { desktop: {} },
  };
  doc.nodes.cta = {
    id: "cta",
    type: "link",
    name: "CTA",
    tag: "a",
    target: { type: "page", pageId: "about" },
    newTab: false,
    style: { desktop: {} },
    children: ["ctaLabel"],
  };
  doc.nodes.ctaLabel = {
    id: "ctaLabel",
    type: "text",
    name: "",
    tag: "span",
    style: { desktop: {} },
    content: [{ text: "About" }],
  };
  doc.nodes.card = {
    id: "card",
    type: "instance",
    name: "Card",
    tag: "div",
    componentId: "Card",
    style: { desktop: {} },
    overrides: {
      variant: { size: "large" },
      props: { title: "Hi" },
      nodes: { cardTitle: { style: { mobile: { fontSize: 12 } } } },
    },
  };
  doc.components.Card = {
    id: "Card",
    name: "Card",
    root: "cardRoot",
    props: [
      {
        name: "title",
        type: "text",
        default: "Title",
        target: { nodeId: "cardTitle", field: "content" },
      },
    ],
    variantProps: [{ name: "size", values: ["default", "large"], default: "default" }],
    variants: {
      "size=large": {
        cardRoot: { desktop: { padding: { top: 32, right: 32, bottom: 32, left: 32 } } },
      },
    },
  };
  doc.nodes.cardRoot = {
    id: "cardRoot",
    type: "frame",
    name: "Card",
    tag: "div",
    style: { desktop: {} },
    children: ["cardTitle"],
  };
  doc.nodes.cardTitle = {
    id: "cardTitle",
    type: "text",
    name: "Title",
    tag: "h3",
    style: { desktop: {} },
    content: [{ text: "Title" }],
  };
  body.children.push("hero");
  return doc;
}

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("missing fixture part");
  return v;
}

const card = (d: ProjectDocument) => must(d.components.Card);

function issuesOf(doc: unknown): string[] {
  const r = validateDocument(doc);
  return r.ok ? [] : r.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

function expectInvalid(mutate: (doc: ProjectDocument) => void, match: RegExp) {
  const doc = richDoc();
  mutate(doc);
  const issues = issuesOf(doc);
  expect(
    issues.some((i) => match.test(i)),
    `expected an issue matching ${match}, got:\n${issues.join("\n")}`,
  ).toBe(true);
}

describe("valid documents", () => {
  it("accepts a blank document with the default breakpoints", () => {
    const doc = createDocument({ id: projectId, framework: "astro" });
    expect(issuesOf(doc)).toEqual([]);
    expect(doc.breakpoints).toEqual({
      desktop: { width: DEFAULT_BREAKPOINT_WIDTHS.desktop },
      tablet: { width: 810 },
      mobile: { width: 390 },
    });
    expect(activeBreakpoints(doc.breakpoints)).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("accepts a document with pages, variables, assets, components and instances", () => {
    expect(issuesOf(richDoc())).toEqual([]);
  });

  it("accepts Tablet and Mobile being removed, keeping their (inactive) overrides", () => {
    const doc = richDoc();
    delete doc.breakpoints.tablet;
    delete doc.breakpoints.mobile;
    expect(issuesOf(doc)).toEqual([]);
    expect(activeBreakpoints(doc.breakpoints)).toEqual(["desktop"]);
  });

  it.each([
    ["desktop", 1200],
    ["desktop", 1920],
    ["tablet", 600],
    ["tablet", 1199],
    ["mobile", 320],
    ["mobile", 599],
  ] as const)("accepts %s width %i", (bp, width) => {
    const doc = richDoc();
    doc.breakpoints[bp] = { width };
    expect(issuesOf(doc)).toEqual([]);
  });

  it("survives a JSON round trip unchanged", () => {
    const doc = richDoc();
    const r = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(r.ok && r.doc).toEqual(doc);
  });

  it("makes ids that the schema accepts", () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe("invalid documents", () => {
  it.each([
    ["desktop", 1199, /desktop width must be at least 1200px/],
    ["tablet", 599, /tablet width must be at least 600px/],
    ["tablet", 1200, /tablet width must be at most 1199px/],
    ["mobile", 319, /mobile width must be at least 320px/],
    ["mobile", 600, /mobile width must be at most 599px/],
    ["mobile", 390.5, /breakpoints.mobile.width/],
  ] as const)("rejects %s width %d", (bp, width, match) => {
    expectInvalid((d) => {
      d.breakpoints[bp] = { width };
    }, match);
  });

  it("rejects a document without Desktop (it can't be deleted)", () => {
    expectInvalid((d) => {
      delete (d.breakpoints as { desktop?: unknown }).desktop;
    }, /^breakpoints.desktop/);
  });

  it("rejects unknown keys anywhere", () => {
    expectInvalid((d) => Object.assign(d, { extra: 1 }), /Unrecognized key/);
    expectInvalid(
      (d) => Object.assign(d.nodes.hero as object, { onclick: "x" }),
      /^nodes.hero: Unrecognized key/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.hero?.style.desktop as object, { color: "red" }),
      /Unrecognized key/,
    );
  });

  it("rejects a wrong schema version and a non-uuid project id", () => {
    expectInvalid((d) => Object.assign(d, { schemaVersion: 2 }), /^schemaVersion/);
    expectInvalid((d) => Object.assign(d, { id: "nope" }), /^id/);
  });

  it("rejects bad values", () => {
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { textColor: "#FFF" }),
      /lowercase hex color/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { fontWeight: 450 }),
      /fontWeight/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { opacity: 2 }),
      /opacity/,
    );
    expectInvalid(
      (d) =>
        Object.assign(d.nodes.hero?.style.desktop as object, {
          width: { type: "fixed", value: -1 },
        }),
      /width/,
    );
    expectInvalid((d) => Object.assign(d.nodes.hero as object, { tag: "h1" }), /^nodes.hero.tag/);
    expectInvalid((d) => Object.assign(d.pages[1] as object, { path: "/About Us" }), /path like/);
  });

  it("rejects script and unsafe link URLs", () => {
    expectInvalid(
      (d) =>
        Object.assign(d.nodes.cta as object, {
          target: { type: "url", href: "javascript:alert(1)" },
        }),
      /http\(s\), mailto/,
    );
    expectInvalid(
      (d) =>
        Object.assign(d.nodes.title as object, {
          content: [{ text: "x", href: "data:text/html,hi" }],
        }),
      /http\(s\), mailto/,
    );
  });

  it("rejects asset keys outside the workspace's assets folder", () => {
    expectInvalid(
      (d) => Object.assign(d.assets.photo as object, { key: "ws/other/assets/x.png" }),
      /^assets.photo.key/,
    );
    expectInvalid(
      (d) => Object.assign(d.assets.photo as object, { key: `assets/../${"a".repeat(64)}.png` }),
      /^assets.photo.key/,
    );
  });

  it("rejects keys that don't match ids", () => {
    expectInvalid(
      (d) => Object.assign(d.nodes.title as object, { id: "other" }),
      /does not match its key/,
    );
  });

  it("rejects duplicate page ids and paths, and a missing home page", () => {
    expectInvalid((d) => Object.assign(d.pages[1] as object, { path: "/" }), /Duplicate page path/);
    expectInvalid(
      (d) => Object.assign(d.pages[1] as object, { id: d.pages[0]?.id }),
      /Duplicate page id/,
    );
    expectInvalid((d) => Object.assign(d.pages[0] as object, { path: "/home" }), /home page/);
  });

  it("rejects broken trees: unknown, shared, orphaned and cyclic nodes", () => {
    expectInvalid(
      (d) => (d.nodes.hero as { children: string[] }).children.push("ghost"),
      /Unknown node "ghost"/,
    );
    expectInvalid(
      (d) => (d.nodes.aboutBody as { children: string[] }).children.push("title"),
      /appears more than once/,
    );
    expectInvalid((d) => {
      d.nodes.loose = {
        id: "loose",
        type: "text",
        name: "",
        tag: "p",
        style: { desktop: {} },
        content: [],
      };
    }, /"loose" is not part of any page/);
    expectInvalid(
      (d) => (d.nodes.hero as { children: string[] }).children.push("hero"),
      /appears more than once/,
    );
  });

  it("rejects a page root that isn't a frame, and children on leaf nodes", () => {
    expectInvalid(
      (d) => Object.assign(d.pages[1] as object, { root: "title" }),
      /page root must be a frame/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.title as object, { children: [] }),
      /Unrecognized key/,
    );
  });

  it("rejects a link inside a link", () => {
    expectInvalid((d) => {
      d.nodes.inner = {
        id: "inner",
        type: "link",
        name: "",
        tag: "a",
        target: { type: "url", href: "#x" },
        newTab: false,
        style: { desktop: {} },
        children: [],
      };
      (d.nodes.cta as { children: string[] }).children.push("inner");
    }, /contains another link/);
  });

  it("rejects unknown and mistyped variable references", () => {
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { textColor: { var: "nope" } }),
      /^nodes.title.style.desktop.textColor: Unknown variable "nope"/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { textColor: { var: "space" } }),
      /is a spacing variable, expected color/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.hero?.style.desktop as object, { gap: { var: "brand" } }),
      /expected spacing/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.title?.style.desktop as object, { font: { var: "brand" } }),
      /expected font/,
    );
    expectInvalid((d) => {
      must(d.nodes.hero).style.mobile = {
        fill: {
          type: "linearGradient",
          angle: 90,
          stops: [
            { color: "#000000", position: 0 },
            { color: { var: "x" }, position: 1 },
          ],
        },
      };
    }, /mobile.fill.stops.1.color: Unknown variable/);
  });

  it("rejects unknown assets and pages", () => {
    expectInvalid(
      (d) => Object.assign(d.nodes.pic as object, { assetId: "missing" }),
      /Unknown asset "missing"/,
    );
    expectInvalid(
      (d) => Object.assign(d.pages[1]?.seo as object, { ogImage: "missing" }),
      /Unknown asset/,
    );
    expectInvalid(
      (d) => Object.assign(d.nodes.cta as object, { target: { type: "page", pageId: "missing" } }),
      /Unknown page/,
    );
    expectInvalid(
      (d) =>
        Object.assign(d.nodes.hero?.style.desktop as object, {
          fill: { type: "image", assetId: "missing", fit: "fill" },
        }),
      /Unknown asset/,
    );
  });

  it("rejects bad components", () => {
    expectInvalid(
      (d) => Object.assign(d.components.Card as object, { name: "card" }),
      /PascalCase/,
    );
    expectInvalid((d) => {
      d.components.Card2 = {
        ...(d.components.Card as object),
        id: "Card2",
        root: "card2Root",
        props: [],
        variants: {},
      } as never;
      d.nodes.card2Root = {
        id: "card2Root",
        type: "frame",
        name: "",
        tag: "div",
        style: { desktop: {} },
        children: [],
      };
    }, /Duplicate component name/);
    expectInvalid((d) => {
      must(card(d).props[0]).target.nodeId = "title";
    }, /not in this component/);
    expectInvalid((d) => {
      must(card(d).props[0]).type = "image";
    }, /must target "assetId"/);
    expectInvalid((d) => {
      card(d).variants = { "size=huge": {} };
    }, /Invalid variant key/);
    expectInvalid((d) => {
      must(card(d).variantProps[0]).default = "huge";
    }, /not one of the values/);
  });

  it("rejects bad instances and a component that contains itself", () => {
    expectInvalid(
      (d) => Object.assign(d.nodes.card as object, { componentId: "Nope" }),
      /Unknown component/,
    );
    expectInvalid((d) => {
      (d.nodes.card as { overrides: { variant: Record<string, string> } }).overrides.variant.size =
        "huge";
    }, /not a value of size/);
    expectInvalid((d) => {
      (d.nodes.card as { overrides: { props: Record<string, unknown> } }).overrides.props.title =
        true;
    }, /does not match prop type text/);
    expectInvalid((d) => {
      (d.nodes.card as { overrides: { nodes: Record<string, unknown> } }).overrides.nodes.title =
        {};
    }, /not in component "Card"/);
    expectInvalid((d) => {
      d.nodes.self = {
        ...(d.nodes.card as object),
        id: "self",
        overrides: { variant: {}, props: {}, nodes: {} },
      } as never;
      (d.nodes.cardRoot as { children: string[] }).children.push("self");
    }, /Component contains itself: Card → Card/);
  });

  it("rejects duplicate variable CSS names", () => {
    expectInvalid(
      (d) => Object.assign(d.variables.space as object, { cssName: "--colors-brand" }),
      /Duplicate CSS name/,
    );
  });

  it("reports every problem, not just the first", () => {
    const doc = richDoc();
    Object.assign(doc.nodes.pic as object, { assetId: "missing" });
    Object.assign(doc.nodes.cta as object, { target: { type: "page", pageId: "missing" } });
    expect(issuesOf(doc)).toHaveLength(2);
  });
});

describe("templates and blank documents share one schema", () => {
  it("validates every template for both frameworks", () => {
    for (const id of ["blank", "landing", "portfolio", "saas"] as const)
      for (const framework of ["nextjs", "astro"] as const)
        expect(issuesOf(templateDocument(id, { projectId, framework }))).toEqual([]);
  });

  it("keeps breakpoint ranges ordered (mobile < tablet < desktop)", () => {
    expect(BREAKPOINT_RANGES.mobile.max).toBeLessThan(BREAKPOINT_RANGES.tablet.min);
    expect(BREAKPOINT_RANGES.tablet.max).toBeLessThan(BREAKPOINT_RANGES.desktop.min);
  });
});
