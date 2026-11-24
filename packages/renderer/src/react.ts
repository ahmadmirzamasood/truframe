/**
 * React output for the renderer. Plain `createElement` (no JSX) so the same module also runs
 * under Node's type stripping (the parity script renders it with `renderToStaticMarkup`).
 */
import type { BreakpointId, ProjectDocument } from "@truframe/model";
import { type CSSProperties, createElement, type ReactNode, useMemo } from "react";
import { frameStylesheet, type NodeCss } from "./css.ts";
import { buildPageTree, type RChild, type RElement, type TreeOptions } from "./tree.ts";

function styleObject(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl
      .slice(0, i)
      .trim()
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[prop] = decl.slice(i + 1).trim();
  }
  return out as CSSProperties;
}

export function toReact(node: RChild, key?: number): ReactNode {
  if (typeof node === "string") return node;
  const { style, ...rest } = node.attrs;
  const props: Record<string, unknown> = { ...rest, key };
  if (typeof style === "string") props.style = styleObject(style);
  const children = node.children.map((c, i) => toReact(c, i));
  return createElement(node.tag, props, ...(children.length ? children : []));
}

export type CompiledCss = { css: Record<string, NodeCss>; tokens?: string };

export type RenderedFrameProps = {
  doc: ProjectDocument;
  output: CompiledCss;
  pageId: string;
  breakpoint: BreakpointId;
  options?: TreeOptions;
};

/** One breakpoint frame: the page rendered at the breakpoint width with its own cascade. */
export function RenderedFrame(props: RenderedFrameProps): ReactNode {
  const { doc, output, pageId, breakpoint, options } = props;
  const sheet = useMemo(() => frameStylesheet(doc, output, breakpoint), [doc, output, breakpoint]);
  const tree = useMemo(() => buildPageTree(doc, pageId, options), [doc, pageId, options]);
  return frameElement(doc, breakpoint, sheet, tree);
}

/** Same as `RenderedFrame` without hooks, for server rendering and tests. */
export function renderFrame(props: RenderedFrameProps): ReactNode {
  const { doc, output, pageId, breakpoint, options } = props;
  return frameElement(
    doc,
    breakpoint,
    frameStylesheet(doc, output, breakpoint),
    buildPageTree(doc, pageId, options),
  );
}

function frameElement(
  doc: ProjectDocument,
  breakpoint: BreakpointId,
  sheet: string,
  tree: RElement | null,
): ReactNode {
  const width = doc.breakpoints[breakpoint]?.width ?? 0;
  return createElement(
    "div",
    // `lang` as on the site's <html>: browsers pick fallback fonts by language.
    { "data-tf-frame": breakpoint, lang: doc.settings.lang, style: { width } },
    createElement("style", null, sheet),
    tree ? toReact(tree) : null,
  );
}
