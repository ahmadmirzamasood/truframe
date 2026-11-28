/** Documents shared by the model tests and the TS ↔ Rust parity fixtures (`fixtures/model`). */
import { createDocument } from "../defaults.ts";
import type { ProjectDocument } from "../document.ts";
import type { Node } from "../nodes.ts";

export const FIXTURE_PROJECT_ID = "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b";

function seq() {
  let n = 0;
  return () => `id${++n}`;
}

/** A small document with one of everything, built on a blank one. */
export function richDoc(): ProjectDocument {
  const doc = createDocument({ id: FIXTURE_PROJECT_ID, framework: "nextjs", ids: seq() });
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

/** `richDoc` plus every node type, fill, size and optional field, so parity covers all shapes. */
export function kitchenSink(): ProjectDocument {
  const doc = richDoc();
  const hero = doc.nodes.hero as Extract<Node, { type: "frame" }>;
  hero.hidden = { tablet: true };
  hero.style.tablet = {
    display: "grid",
    gridColumns: 2,
    gridRows: 3,
    rowGap: 12,
    wrap: true,
    align: "stretch",
    justify: "between",
    overflow: "clip",
    minWidth: 100,
    maxWidth: 1000,
    minHeight: 10,
    maxHeight: 900,
    height: { type: "fixed", value: 640 },
    fill: {
      type: "linearGradient",
      angle: 45,
      stops: [
        { color: "#000000", position: 0 },
        { color: { var: "brand" }, position: 1 },
      ],
    },
    border: {
      width: 1,
      color: "#11223344",
      style: "dashed",
      sides: { top: true, right: false, bottom: true, left: false },
    },
    radius: { topLeft: 4, topRight: 8, bottomRight: 0, bottomLeft: 2.5 },
    shadows: [{ x: 0, y: 4, blur: 12, spread: -2, color: { var: "brand" }, inset: false }],
    opacity: 0.9,
    blend: "color-dodge",
    blur: 2,
  };
  doc.nodes.icon = {
    id: "icon",
    type: "icon",
    name: "Arrow",
    tag: "span",
    set: "lucide",
    icon: "arrow-right",
    svg: {
      viewBox: "0 0 24 24",
      body: [
        {
          tag: "g",
          attrs: {
            fill: "none",
            stroke: "currentColor",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "2",
          },
          children: [{ tag: "path", attrs: { d: "M5 12h14m-7-7l7 7l-7 7" } }],
        },
      ],
    },
    style: {
      desktop: {
        position: "absolute",
        top: -4,
        right: 0,
        bottom: 0,
        left: 10,
        zIndex: 2,
        columnSpan: 2,
        rowSpan: 1,
        aspectRatio: 1,
        width: { type: "fixed", value: 24 },
      },
    },
  };
  doc.nodes.map = {
    id: "map",
    type: "embed",
    name: "Map",
    tag: "figure",
    source: { type: "url", url: "https://maps.example.com/embed?q=1" },
    style: { desktop: { fill: { type: "image", assetId: "photo", fit: "tile" } } },
  };
  doc.nodes.widget = {
    id: "widget",
    type: "embed",
    name: "Widget",
    tag: "div",
    source: { type: "html", html: '<div class="w">Hi</div>' },
    style: { desktop: {} },
  };
  doc.nodes.mail = {
    id: "mail",
    type: "link",
    name: "Mail",
    tag: "button",
    target: { type: "url", href: "mailto:hi@example.com" },
    newTab: true,
    ariaLabel: "Email us",
    children: [],
    style: { desktop: { radius: 999 } },
  };
  doc.nodes.blankPic = {
    id: "blankPic",
    type: "image",
    name: "Placeholder",
    tag: "figure",
    assetId: null,
    alt: "",
    decorative: true,
    fit: "fill",
    style: { desktop: {} },
  };
  hero.children.push("icon", "map", "widget", "mail", "blankPic");
  const title = doc.nodes.title as Extract<Node, { type: "text" }>;
  title.content.push({ text: "!", italic: true, underline: true, href: "https://example.com" });
  title.style.desktop = {
    ...title.style.desktop,
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 48,
    lineHeight: 1.1,
    letterSpacing: -0.02,
    textAlign: "center",
    textDecoration: "line-through",
    textTransform: "uppercase",
    truncate: true,
  };
  const card = doc.nodes.card as Extract<Node, { type: "instance" }>;
  card.overrides.nodes.cardTitle = {
    style: { tablet: { textColor: "#ffffff" } },
    content: [{ text: "Overridden" }],
    hidden: { mobile: true },
  };
  const component = doc.components.Card;
  if (component) {
    component.props.push({
      name: "showTitle",
      type: "boolean",
      default: true,
      target: { nodeId: "cardTitle", field: "visible" },
    });
  }
  card.overrides.props.showTitle = false;
  doc.assets.logo = {
    id: "logo",
    name: "logo.svg",
    mime: "image/svg+xml",
    width: 64,
    height: 64,
    bytes: 900,
    key: `assets/${"b".repeat(64)}.svg`,
    credit: {
      source: "unsplash",
      author: "Ada Example",
      authorUrl: "https://unsplash.com/@ada?utm_source=truframe&utm_medium=referral",
      sourceUrl: "https://unsplash.com/?utm_source=truframe&utm_medium=referral",
    },
  };
  return doc;
}

/** Desktop only: Tablet and Mobile removed, their overrides kept but inactive. */
export function desktopOnly(): ProjectDocument {
  const doc = richDoc();
  delete doc.breakpoints.tablet;
  delete doc.breakpoints.mobile;
  doc.breakpoints.desktop.width = 1440;
  doc.settings.lang = "pt-BR";
  doc.framework = "astro";
  return doc;
}
