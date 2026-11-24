/** Defaults for new documents and nodes. */
import { defaultBreakpoints } from "./breakpoints.ts";
import { type Framework, type Page, type ProjectDocument, SCHEMA_VERSION } from "./document.ts";
import { type FrameNode, type Node, type NodeType, TAGS } from "./nodes.ts";
import type { Style } from "./style.ts";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A random 12-character id (about 62 bits), valid as a node/page/component/variable id. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

export function defaultTag<T extends NodeType>(type: T): (typeof TAGS)[T][0] {
  return TAGS[type][0];
}

/** The body frame of a page: a full-width vertical stack. */
export function pageRootStyle(): Style {
  return {
    desktop: {
      display: "stack",
      direction: "column",
      width: { type: "fill" },
      height: { type: "fit" },
    },
  };
}

export function newPage(input: { id: string; rootId: string; name: string; path: string }): {
  page: Page;
  root: FrameNode;
} {
  return {
    page: {
      id: input.id,
      name: input.name,
      path: input.path,
      seo: { title: input.name, description: "", ogImage: null, noindex: false },
      root: input.rootId,
    },
    root: {
      id: input.rootId,
      type: "frame",
      name: "Body",
      tag: "main",
      style: pageRootStyle(),
      children: [],
    },
  };
}

/** A blank document: one empty home page and the default breakpoints. */
export function createDocument(input: {
  id: string;
  framework: Framework;
  lang?: string;
  ids?: () => string;
}): ProjectDocument {
  const id = input.ids ?? newId;
  const { page, root } = newPage({ id: id(), rootId: id(), name: "Home", path: "/" });
  const nodes: Record<string, Node> = { [root.id]: root };
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    framework: input.framework,
    settings: { lang: input.lang ?? "en" },
    breakpoints: defaultBreakpoints(),
    pages: [page],
    nodes,
    components: {},
    variables: {},
    assets: {},
  };
}
