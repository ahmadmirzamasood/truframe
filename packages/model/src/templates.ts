/**
 * Starter templates for new projects. Each template is a short JSON outline in `./templates/`
 * (pages → sections → text, links, images). `templateDocument` expands an outline into a full,
 * valid document with deterministic ids and default styles, which seeds the project document.
 */
import { defaultBreakpoints } from "./breakpoints.ts";
import { newPage } from "./defaults.ts";
import type { Variable } from "./document.ts";
import {
  type Framework,
  type Page,
  type ProjectDocument,
  parseDocument,
  SCHEMA_VERSION,
} from "./document.ts";
import type { Node, TAGS } from "./nodes.ts";
import blank from "./templates/blank.json" with { type: "json" };
import landing from "./templates/landing.json" with { type: "json" };
import portfolio from "./templates/portfolio.json" with { type: "json" };
import saas from "./templates/saas.json" with { type: "json" };

export type TemplateMeta = {
  id: "blank" | "landing" | "portfolio" | "saas";
  name: string;
  description: string;
};

/** Display order in the New Project dialog. */
export const TEMPLATES: readonly TemplateMeta[] = [
  { id: "blank", name: "Blank", description: "One empty page." },
  { id: "landing", name: "Landing page", description: "Hero, features and a call to action." },
  { id: "portfolio", name: "Portfolio", description: "Intro, selected work and an About page." },
  { id: "saas", name: "SaaS", description: "Product hero and a pricing page." },
];

type OutlineItem =
  | { type: "section"; name: string; children: OutlineItem[] }
  | { type: "text"; tag: (typeof TAGS)["text"][number]; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "image"; alt: string };
type Outline = { pages: { id: string; name: string; path: string; nodes: OutlineItem[] }[] };

const OUTLINES: Record<TemplateMeta["id"], Outline> = {
  blank: blank as Outline,
  landing: landing as Outline,
  portfolio: portfolio as Outline,
  saas: saas as Outline,
};

const ACCENT = "accent";
const INK = "ink";

function variables(): Record<string, Variable> {
  return {
    [ACCENT]: {
      id: ACCENT,
      name: "Accent",
      group: "Brand",
      cssName: "--brand-accent",
      type: "color",
      value: { desktop: "#4f46e5" },
    },
    [INK]: {
      id: INK,
      name: "Ink",
      group: "Neutral",
      cssName: "--neutral-ink",
      type: "color",
      value: { desktop: "#111827" },
    },
  };
}

const TEXT_SIZES: Partial<Record<string, { desktop: number; mobile: number }>> = {
  h1: { desktop: 56, mobile: 36 },
  h2: { desktop: 36, mobile: 28 },
};

function expand(item: OutlineItem, ids: () => string, nodes: Record<string, Node>): string {
  const id = ids();
  switch (item.type) {
    case "section":
      nodes[id] = {
        id,
        type: "frame",
        name: item.name,
        tag: "section",
        style: {
          desktop: {
            display: "stack",
            direction: "column",
            align: "center",
            gap: 24,
            padding: { top: 96, right: 32, bottom: 96, left: 32 },
            width: { type: "fill" },
            height: { type: "fit" },
          },
          mobile: { gap: 16, padding: { top: 56, right: 20, bottom: 56, left: 20 } },
        },
        children: item.children.map((c) => expand(c, ids, nodes)),
      };
      break;
    case "text": {
      const size = TEXT_SIZES[item.tag];
      nodes[id] = {
        id,
        type: "text",
        name: "",
        tag: item.tag,
        style: {
          desktop: {
            textColor: { var: INK },
            textAlign: "center",
            fontSize: size?.desktop ?? 18,
            ...(size ? { fontWeight: 700 } : {}),
          },
          ...(size ? { mobile: { fontSize: size.mobile } } : {}),
        },
        content: [{ text: item.text }],
      };
      break;
    }
    case "link": {
      const textId = ids();
      nodes[textId] = {
        id: textId,
        type: "text",
        name: "Label",
        tag: "span",
        style: { desktop: { textColor: "#ffffff", fontWeight: 600 } },
        content: [{ text: item.text }],
      };
      nodes[id] = {
        id,
        type: "link",
        name: "Button",
        tag: "a",
        target: { type: "url", href: item.href },
        newTab: false,
        style: {
          desktop: {
            display: "stack",
            direction: "row",
            padding: { top: 12, right: 24, bottom: 12, left: 24 },
            fill: { type: "solid", color: { var: ACCENT } },
            radius: 8,
          },
        },
        children: [textId],
      };
      break;
    }
    case "image":
      nodes[id] = {
        id,
        type: "image",
        name: "",
        tag: "img",
        assetId: null,
        alt: item.alt,
        decorative: false,
        fit: "crop",
        style: { desktop: { width: { type: "fill" }, aspectRatio: 1.5, radius: 12 } },
      };
      break;
  }
  return id;
}

/** The starter document for a template: valid, with deterministic ids. */
export function templateDocument(
  id: TemplateMeta["id"],
  input: { projectId: string; framework: Framework },
): ProjectDocument {
  const outline = OUTLINES[id];
  const nodes: Record<string, Node> = {};
  const pages: Page[] = outline.pages.map((p) => {
    let n = 0;
    const ids = () => `${p.id}-${++n}`;
    const { page, root } = newPage({
      id: p.id,
      rootId: `${p.id}-body`,
      name: p.name,
      path: p.path,
    });
    root.children = p.nodes.map((item) => expand(item, ids, nodes));
    nodes[root.id] = root;
    return page;
  });
  return parseDocument({
    schemaVersion: SCHEMA_VERSION,
    id: input.projectId,
    framework: input.framework,
    settings: { lang: "en" },
    breakpoints: defaultBreakpoints(),
    pages,
    nodes,
    components: {},
    variables: id === "blank" ? {} : variables(),
    assets: {},
  } satisfies ProjectDocument);
}
