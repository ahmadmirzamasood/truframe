/**
 * Inspector logic (PRD F15, F29) as pure functions: the value a field shows at the editing
 * breakpoint, whether it is overridden there, and the ops each control sends.
 */
import {
  activeBreakpoints,
  type BreakpointId,
  childrenOf,
  type Node,
  type ProjectDocument,
  type PropKey,
  type Props,
} from "@truframe/model";
import type { Op } from "@truframe/ops";

/** The value at `bp` after the desktop → tablet → mobile cascade. */
export function effective<K extends PropKey>(
  doc: ProjectDocument,
  node: Node,
  bp: BreakpointId,
  key: K,
): Props[K] {
  let value = undefined as Props[K];
  for (const id of activeBreakpoints(doc.breakpoints)) {
    const v = node.style[id]?.[key];
    if (v !== undefined) value = v;
    if (id === bp) break;
  }
  return value;
}

/** Set at this breakpoint below desktop (shown with a red dot and "Reset to inherited"). */
export function isOverridden(node: Node, bp: BreakpointId, key: PropKey): boolean {
  return bp !== "desktop" && node.style[bp]?.[key] !== undefined;
}

export function setProp<K extends PropKey>(
  id: string,
  bp: BreakpointId,
  key: K,
  value: Props[K] | undefined,
): Op {
  return value === undefined
    ? { op: "resetProp", nodeId: id, breakpoint: bp, key }
    : { op: "setProp", nodeId: id, breakpoint: bp, key, value };
}

export function resetProp(id: string, bp: BreakpointId, key: PropKey): Op {
  return { op: "resetProp", nodeId: id, breakpoint: bp, key };
}

// ——— Layout ———

export type Display = "stack" | "grid" | "free";

/** "Free" is a stack whose children are all absolutely positioned. */
export function displayOf(doc: ProjectDocument, node: Node, bp: BreakpointId): Display {
  if (effective(doc, node, bp, "display") === "grid") return "grid";
  const kids = childrenOf(node);
  const free =
    kids.length > 0 &&
    kids.every((c) => {
      const n = doc.nodes[c];
      return n && effective(doc, n, bp, "position") === "absolute";
    });
  return free ? "free" : "stack";
}

export type Direction = "vertical" | "horizontal" | "wrap";

export function directionOf(doc: ProjectDocument, node: Node, bp: BreakpointId): Direction {
  if (effective(doc, node, bp, "direction") !== "row") return "vertical";
  return effective(doc, node, bp, "wrap") ? "wrap" : "horizontal";
}

export function directionOps(id: string, bp: BreakpointId, d: Direction): Op[] {
  return [
    setProp(id, bp, "display", "stack"),
    setProp(id, bp, "direction", d === "vertical" ? "column" : "row"),
    setProp(id, bp, "wrap", d === "wrap"),
  ];
}

export const ALIGN_POSITIONS = [
  "Top left",
  "Top center",
  "Top right",
  "Center left",
  "Center",
  "Center right",
  "Bottom left",
  "Bottom center",
  "Bottom right",
] as const;
export type AlignPosition = (typeof ALIGN_POSITIONS)[number];

type Edge = "start" | "center" | "end";
const EDGES: Edge[] = ["start", "center", "end"];

/**
 * The compiler maps `align` to align-items (cross axis) and `justify` to justify-content (main
 * axis). In a vertical stack the main axis is vertical; in a row or a grid it is horizontal.
 */
function axes(doc: ProjectDocument, node: Node, bp: BreakpointId) {
  const vertical =
    effective(doc, node, bp, "display") !== "grid" &&
    effective(doc, node, bp, "direction") !== "row";
  return vertical
    ? { v: "justify" as const, h: "align" as const }
    : { v: "align" as const, h: "justify" as const };
}

export function alignPositionOf(doc: ProjectDocument, node: Node, bp: BreakpointId): AlignPosition {
  const a = axes(doc, node, bp);
  const get = (k: "align" | "justify"): Edge => {
    const v = effective(doc, node, bp, k);
    return v === "center" || v === "end" ? v : "start";
  };
  return ALIGN_POSITIONS[EDGES.indexOf(get(a.v)) * 3 + EDGES.indexOf(get(a.h))] as AlignPosition;
}

export function alignOps(
  doc: ProjectDocument,
  node: Node,
  bp: BreakpointId,
  pos: AlignPosition,
): Op[] {
  const i = ALIGN_POSITIONS.indexOf(pos);
  const vEdge = EDGES[Math.floor(i / 3)] as Edge;
  const hEdge = EDGES[i % 3] as Edge;
  const a = axes(doc, node, bp);
  const ops: Op[] = [];
  const main = a.v === "justify" ? vEdge : hEdge;
  const cross = a.v === "align" ? vEdge : hEdge;
  // Keep a Distribute choice on the main axis: only the cross axis changes then.
  const justify = effective(doc, node, bp, "justify");
  if (!(justify === "between" || justify === "around" || justify === "evenly"))
    ops.push(setProp(node.id, bp, "justify", main));
  ops.push(setProp(node.id, bp, "align", cross));
  return ops;
}

export const DISTRIBUTE = ["packed", "between", "around", "evenly"] as const;
export type Distribute = (typeof DISTRIBUTE)[number];
export const DISTRIBUTE_LABEL: Record<Distribute, string> = {
  packed: "Packed",
  between: "Space between",
  around: "Space around",
  evenly: "Space evenly",
};

export function distributeOf(doc: ProjectDocument, node: Node, bp: BreakpointId): Distribute {
  const j = effective(doc, node, bp, "justify");
  return j === "between" || j === "around" || j === "evenly" ? j : "packed";
}

export function distributeOps(
  doc: ProjectDocument,
  node: Node,
  bp: BreakpointId,
  d: Distribute,
): Op[] {
  if (d !== "packed") return [setProp(node.id, bp, "justify", d)];
  // Back to packed: the main-axis edge of the current Align position.
  const i = ALIGN_POSITIONS.indexOf(alignPositionOf(doc, node, bp));
  const a = axes(doc, node, bp);
  const edge = EDGES[a.v === "justify" ? Math.floor(i / 3) : i % 3] as Edge;
  return [setProp(node.id, bp, "justify", edge)];
}

// ——— Size ———

export type SizeMode = "fixed" | "fill" | "fit";
export const SIZE_LABEL: Record<SizeMode, string> = { fixed: "Fixed", fill: "Fill", fit: "Hug" };

export function sizeOps(
  id: string,
  bp: BreakpointId,
  key: "width" | "height",
  mode: SizeMode,
  current: number,
): Op[] {
  return [
    setProp(
      id,
      bp,
      key,
      mode === "fixed"
        ? { type: "fixed", value: Math.max(0, Math.round(current)) }
        : { type: mode },
    ),
  ];
}

export type TextResizing = "autoWidth" | "autoHeight" | "fixed";
export const TEXT_RESIZING_LABEL: Record<TextResizing, string> = {
  autoWidth: "Auto width",
  autoHeight: "Auto height",
  fixed: "Fixed",
};

export function textResizingOf(doc: ProjectDocument, node: Node, bp: BreakpointId): TextResizing {
  const w = effective(doc, node, bp, "width");
  const h = effective(doc, node, bp, "height");
  if (h?.type === "fixed" && w?.type === "fixed") return "fixed";
  if (w?.type === "fixed" || w?.type === "fill") return "autoHeight";
  return "autoWidth";
}

export function textResizingOps(
  id: string,
  bp: BreakpointId,
  mode: TextResizing,
  box: { width: number; height: number },
): Op[] {
  const fixed = (v: number) => ({ type: "fixed" as const, value: Math.max(1, Math.round(v)) });
  if (mode === "autoWidth")
    return [setProp(id, bp, "width", { type: "fit" }), setProp(id, bp, "height", { type: "fit" })];
  if (mode === "autoHeight")
    return [setProp(id, bp, "width", fixed(box.width)), setProp(id, bp, "height", { type: "fit" })];
  return [setProp(id, bp, "width", fixed(box.width)), setProp(id, bp, "height", fixed(box.height))];
}

// ——— Padding ———

export type Sides = { top: number; right: number; bottom: number; left: number };

/** Padding sides with missing values as 0; bound sides stay variable references. */
export function paddingSides(p: Props["padding"]): NonNullable<Props["padding"]> {
  return { top: p?.top ?? 0, right: p?.right ?? 0, bottom: p?.bottom ?? 0, left: p?.left ?? 0 };
}

export function numericSides(p: Props["padding"]): Sides {
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  return { top: n(p?.top), right: n(p?.right), bottom: n(p?.bottom), left: n(p?.left) };
}

// ——— Colors ———

export function hexAlpha(color: string): { hex: string; alpha: number } {
  const hex = color.slice(0, 7);
  const alpha = color.length === 9 ? Number.parseInt(color.slice(7), 16) / 255 : 1;
  return { hex, alpha: Math.round(alpha * 100) / 100 };
}

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  const base = hex.toLowerCase().slice(0, 7);
  return a >= 255 ? base : `${base}${a.toString(16).padStart(2, "0")}`;
}

const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;

function subtree(doc: ProjectDocument, rootId: string): Node[] {
  const out: Node[] = [];
  const walk = (id: string) => {
    const n = doc.nodes[id];
    if (!n) return;
    out.push(n);
    for (const c of childrenOf(n)) walk(c);
  };
  walk(rootId);
  return out;
}

/** Literal colors in a set of props (variables are left alone). */
function colorsIn(p: Props): string[] {
  const out: unknown[] = [p.textColor];
  if (p.fill?.type === "solid") out.push(p.fill.color);
  if (p.fill?.type === "linearGradient") out.push(...p.fill.stops.map((s) => s.color));
  if (p.border) out.push(p.border.color);
  for (const s of p.shadows ?? []) out.push(s.color);
  return out.filter((c): c is string => typeof c === "string");
}

/** Every literal color on a page (Selection colors) with how often it is used, most used first. */
export function pageColors(doc: ProjectDocument, rootId: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const n of subtree(doc, rootId))
    for (const bp of BREAKPOINTS) {
      const p = n.style[bp];
      if (p) for (const c of colorsIn(p)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** Replaces one literal color everywhere on the page, in one transaction. */
export function replaceColorOps(
  doc: ProjectDocument,
  rootId: string,
  from: string,
  to: string,
): Op[] {
  const swap = <T>(c: T): T => (c === from ? (to as T) : c);
  const ops: Op[] = [];
  for (const n of subtree(doc, rootId))
    for (const bp of BREAKPOINTS) {
      const p = n.style[bp];
      if (!p) continue;
      const set = (key: PropKey, before: unknown, after: unknown) => {
        if (JSON.stringify(before) !== JSON.stringify(after))
          ops.push({ op: "setProp", nodeId: n.id, breakpoint: bp, key, value: after });
      };
      if (p.textColor !== undefined) set("textColor", p.textColor, swap(p.textColor));
      if (p.fill?.type === "solid") set("fill", p.fill, { ...p.fill, color: swap(p.fill.color) });
      if (p.fill?.type === "linearGradient")
        set("fill", p.fill, {
          ...p.fill,
          stops: p.fill.stops.map((s) => ({ ...s, color: swap(s.color) })),
        });
      if (p.border) set("border", p.border, { ...p.border, color: swap(p.border.color) });
      if (p.shadows)
        set(
          "shadows",
          p.shadows,
          p.shadows.map((s) => ({ ...s, color: swap(s.color) })),
        );
    }
  return ops;
}

// ——— Accessibility checks (PRD F28) ———

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

function resolveColor(doc: ProjectDocument, v: unknown, bp: BreakpointId): string | null {
  if (typeof v === "string") return v.slice(0, 7);
  if (v && typeof v === "object" && "var" in v) {
    const variable = doc.variables[(v as { var: string }).var];
    if (variable?.type !== "color") return null;
    let value: string | undefined;
    for (const id of activeBreakpoints(doc.breakpoints)) {
      value = variable.value[id] ?? value;
      if (id === bp) break;
    }
    return value?.slice(0, 7) ?? null;
  }
  return null;
}

export type Check = { nodeId: string; bp: BreakpointId | null; message: string };

/** Contrast (WCAG AA), missing alt text and heading order, for a subtree. */
export function accessibilityChecks(
  doc: ProjectDocument,
  rootId: string,
  parents: Map<string, string>,
): Check[] {
  const checks: Check[] = [];
  const headings: { id: string; level: number }[] = [];
  const background = (id: string, bp: BreakpointId): string => {
    let cur: string | undefined = id;
    while (cur) {
      const n: Node | undefined = doc.nodes[cur];
      const fill = n ? effective(doc, n, bp, "fill") : undefined;
      if (fill?.type === "solid") {
        const c = resolveColor(doc, fill.color, bp);
        if (c) return c;
      }
      cur = parents.get(cur);
    }
    return "#ffffff";
  };
  const textColor = (id: string, bp: BreakpointId): string => {
    let cur: string | undefined = id;
    while (cur) {
      const n: Node | undefined = doc.nodes[cur];
      const c = n ? resolveColor(doc, effective(doc, n, bp, "textColor"), bp) : null;
      if (c) return c;
      cur = parents.get(cur);
    }
    return "#000000";
  };
  const walk = (id: string) => {
    const n = doc.nodes[id];
    if (!n) return;
    if (n.type === "text") {
      for (const bp of activeBreakpoints(doc.breakpoints)) {
        const ratio = contrastRatio(textColor(id, bp), background(id, bp));
        const size = effective(doc, n, bp, "fontSize") ?? 16;
        const weight = effective(doc, n, bp, "fontWeight") ?? 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        if (ratio < need)
          checks.push({ nodeId: id, bp, message: `Text contrast ${ratio}:1 is below ${need}:1` });
      }
      const level = /^h([1-6])$/.exec(n.tag)?.[1];
      if (level) headings.push({ id, level: Number(level) });
    }
    if (n.type === "image" && !n.decorative && !n.alt.trim())
      checks.push({ nodeId: id, bp: null, message: "Image has no alt text" });
    if (n.type === "link" && !n.ariaLabel && !hasText(doc, id))
      checks.push({ nodeId: id, bp: null, message: "Link or button has no accessible name" });
    for (const c of childrenOf(n)) walk(c);
  };
  walk(rootId);
  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length > 1)
    for (const h of h1.slice(1))
      checks.push({ nodeId: h.id, bp: null, message: "More than one h1 on the page" });
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1] as { level: number };
    const cur = headings[i] as { id: string; level: number };
    if (cur.level > prev.level + 1)
      checks.push({
        nodeId: cur.id,
        bp: null,
        message: `Heading skips from h${prev.level} to h${cur.level}`,
      });
  }
  return checks;
}

function hasText(doc: ProjectDocument, id: string): boolean {
  const n = doc.nodes[id];
  if (!n) return false;
  if (n.type === "text") return n.content.some((s) => s.text.trim());
  if (n.type === "image") return Boolean(n.alt.trim());
  return childrenOf(n).some((c) => hasText(doc, c));
}
