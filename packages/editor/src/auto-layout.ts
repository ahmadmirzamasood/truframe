/**
 * "Add auto layout" and "Group into stack" (PRD F4, F7, P5-6). The rules live in
 * `inferStack` (`packages/layout`); this turns its answer into the ops of one transaction, so
 * each command is one undo step. Boxes are the rendered boxes at the editing breakpoint.
 */
import { type InferredStack, inferStack, type Rect } from "@truframe/layout";
import { type BreakpointId, childrenOf, type Node, type ProjectDocument } from "@truframe/model";
import type { Op } from "@truframe/ops";
import { effectiveProp, isAbsolute } from "./gestures.ts";
import { type ParentMap, parentMap } from "./tree.ts";

/** A layer's rendered box at the editing breakpoint (any shared origin), or null. */
export type MeasureBox = (id: string) => Rect | null;

const set = (nodeId: string, bp: BreakpointId, key: string, value: unknown): Op =>
  ({ op: "setProp", nodeId, breakpoint: bp, key, value }) as Op;
const reset = (nodeId: string, bp: BreakpointId, key: string): Op =>
  ({ op: "resetProp", nodeId, breakpoint: bp, key }) as Op;

function stackOps(id: string, bp: BreakpointId, s: InferredStack, node?: Node): Op[] {
  const ops: Op[] = [
    set(id, bp, "display", "stack"),
    set(id, bp, "direction", s.direction),
    set(id, bp, "wrap", s.wrap),
    set(id, bp, "gap", s.gap),
    set(id, bp, "align", s.align),
  ];
  if (s.rowGap !== undefined) ops.push(set(id, bp, "rowGap", s.rowGap));
  else if (node?.style[bp]?.rowGap !== undefined) ops.push(reset(id, bp, "rowGap"));
  if (s.padding) ops.push(set(id, bp, "padding", s.padding));
  return ops;
}

/** Children leave absolute positioning at this breakpoint (their left/top go with it). */
function inFlowOps(doc: ProjectDocument, ids: readonly string[], bp: BreakpointId): Op[] {
  return ids.flatMap((c) => {
    const n = doc.nodes[c];
    if (!n || !isAbsolute(doc, c, bp)) return [];
    return [
      set(c, bp, "position", "auto"),
      ...(["left", "top", "right", "bottom"] as const)
        .filter((k) => n.style[bp]?.[k] !== undefined)
        .map((k) => reset(c, bp, k)),
    ];
  });
}

/** Moves `ordered` into `parentId` at indices 0, 1, … in that order (skipping no-ops). */
function orderOps(current: readonly string[], ordered: readonly string[], parentId: string): Op[] {
  const list = [...current];
  const ops: Op[] = [];
  ordered.forEach((id, k) => {
    const at = list.indexOf(id);
    if (at === k) return;
    if (at >= 0) list.splice(at, 1);
    list.splice(k, 0, id);
    ops.push({ op: "moveNode", nodeId: id, parentId, index: k });
  });
  return ops;
}

/**
 * The frame lays out its children as a stack inferred from where they are now: direction,
 * gap, align and padding, children reordered along the direction and out of absolute
 * positioning. Null when it can't apply (not a frame, nothing to lay out, not rendered).
 */
export function addAutoLayoutOps(
  doc: ProjectDocument,
  id: string,
  bp: BreakpointId,
  measure: MeasureBox,
): Op[] | null {
  const node = doc.nodes[id];
  if (node?.type !== "frame") return null;
  const kids = childrenOf(node);
  const container = measure(id);
  const boxes = kids.map(measure);
  if (!kids.length || !container || boxes.some((b) => !b)) return null;
  const s = inferStack(boxes as Rect[], container);
  const ordered = s.order.map((i) => kids[i] as string);
  return [
    ...stackOps(id, bp, s, node),
    ...inFlowOps(doc, kids, bp),
    ...orderOps(kids, ordered, id),
  ];
}

/** Siblings under one container, in their parent's order, or null. */
export function groupable(
  doc: ProjectDocument,
  parents: ParentMap,
  ids: readonly string[],
): { parentId: string; ids: string[] } | null {
  const parentId = ids[0] ? parents.get(ids[0]) : undefined;
  const parent = parentId ? doc.nodes[parentId] : undefined;
  if (!parentId || !parent || (parent.type !== "frame" && parent.type !== "link")) return null;
  if (!ids.every((i) => parents.get(i) === parentId)) return null;
  return { parentId, ids: parent.children.filter((c) => ids.includes(c)) };
}

/**
 * Wraps sibling layers in a new stack whose direction, gap and align fit where they are. The
 * stack takes the first layer's place and sizes to fit (a wrapping row keeps its width, or it
 * would never wrap). Absolutely positioned layers move into flow inside an absolute stack at
 * their bounds. The inferred layout is the stack's base (desktop) style: it is a new layer.
 */
export function groupIntoStackOps(
  doc: ProjectDocument,
  ids: readonly string[],
  bp: BreakpointId,
  measure: MeasureBox,
  newId: () => string,
): { ops: Op[]; stackId: string } | null {
  const parents = parentMap(doc);
  const group = groupable(doc, parents, ids);
  if (!group) return null;
  const boxes = group.ids.map(measure);
  const parentBox = measure(group.parentId);
  if (boxes.some((b) => !b) || !parentBox) return null;
  const rects = boxes as Rect[];
  const s = inferStack(rects);
  const union = {
    x: Math.min(...rects.map((r) => r.x)),
    y: Math.min(...rects.map((r) => r.y)),
    right: Math.max(...rects.map((r) => r.x + r.width)),
  };
  const absolute = group.ids.every((i) => isAbsolute(doc, i, bp));
  const fills = (key: "width" | "height") =>
    group.ids.some((i) => {
      const n = doc.nodes[i];
      return n !== undefined && effectiveProp(doc, n, bp, key)?.type === "fill";
    });
  const stackId = newId();
  const stack: Node = {
    id: stackId,
    type: "frame",
    name: "Stack",
    tag: "div",
    style: {
      desktop: {
        display: "stack",
        direction: s.direction,
        wrap: s.wrap,
        gap: s.gap,
        ...(s.rowGap !== undefined ? { rowGap: s.rowGap } : {}),
        align: s.align,
        // Fill children would collapse inside a Fit stack: the stack fills where they do.
        width: fills("width")
          ? { type: "fill" }
          : s.wrap
            ? { type: "fixed", value: Math.round(union.right - union.x) }
            : { type: "fit" },
        height: fills("height") ? { type: "fill" } : { type: "fit" },
      },
    },
    children: [],
  };
  if (absolute) {
    const at = {
      position: "absolute" as const,
      left: Math.round(union.x - parentBox.x),
      top: Math.round(union.y - parentBox.y),
    };
    stack.style[bp] = { ...stack.style[bp], ...at };
  }
  const parent = doc.nodes[group.parentId] as Node & { children: string[] };
  const index = parent.children.indexOf(group.ids[0] as string);
  const ordered = s.order.map((i) => group.ids[i] as string);
  return {
    stackId,
    ops: [
      { op: "insertNodes", parentId: group.parentId, index, nodes: [stack] },
      ...ordered.map((id, k): Op => ({ op: "moveNode", nodeId: id, parentId: stackId, index: k })),
      ...(absolute ? inFlowOps(doc, group.ids, bp) : []),
    ],
  };
}

/**
 * Whether "Add auto layout" means something for this layer at this breakpoint: a stack frame
 * with absolutely positioned children. (A grid already is auto layout; its Fill children
 * would not survive becoming a row.)
 */
export function canAddAutoLayout(doc: ProjectDocument, id: string, bp: BreakpointId): boolean {
  const n = doc.nodes[id];
  if (n?.type !== "frame" || n.children.length === 0) return false;
  if (effectiveProp(doc, n, bp, "display") === "grid") return false;
  return n.children.some((c) => isAbsolute(doc, c, bp));
}
