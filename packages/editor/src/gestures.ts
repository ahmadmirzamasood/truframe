/**
 * Canvas gestures (PRD F4, F7). A gesture previews while the pointer moves and produces the
 * ops of exactly one transaction when it ends, so every drag, resize or reorder is one undo
 * step. All coordinates are frame-local world pixels (unscaled).
 */

import {
  dropIndex,
  dropLine,
  type FlowAxis,
  type Guide,
  type Handle,
  handleEdges,
  type Point,
  type Rect,
  resizeRect,
  snapMove,
  snapResize,
  snapTargets,
} from "@truframe/layout";
import {
  activeBreakpoints,
  type BreakpointId,
  type Node,
  type ProjectDocument,
  type Props,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { type Boxes, hitPath } from "./hit.ts";
import { canContain, isAncestor, type ParentMap } from "./tree.ts";

/** The value a prop has at a breakpoint after the desktop → tablet → mobile cascade. */
export function effectiveProp<K extends keyof Props>(
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

export function isAbsolute(doc: ProjectDocument, id: string, bp: BreakpointId): boolean {
  const n = doc.nodes[id];
  return Boolean(n && effectiveProp(doc, n, bp, "position") === "absolute");
}

const px = (v: number) => Math.round(v);

/** Moves `ids` (in document order) into `parentId` before its child at `index`. */
export function reorderOps(
  doc: ProjectDocument,
  parents: ParentMap,
  ids: readonly string[],
  parentId: string,
  index: number,
): Op[] {
  const target = doc.nodes[parentId];
  if (!target || (target.type !== "frame" && target.type !== "link")) return [];
  // The first sibling that will follow the moved layers, or the end.
  const others = target.children.filter((c) => !ids.includes(c));
  const anchor = others[index] ?? null;
  const children = new Map<string, string[]>();
  const list = (id: string) => {
    if (!children.has(id)) {
      const n = doc.nodes[id];
      children.set(id, n && (n.type === "frame" || n.type === "link") ? [...n.children] : []);
    }
    return children.get(id) as string[];
  };
  const ops: Op[] = [];
  for (const id of ids) {
    const from = parents.get(id);
    if (!from) continue;
    const fromList = list(from);
    const at = fromList.indexOf(id);
    fromList.splice(at, 1);
    const toList = list(parentId);
    const to = anchor ? toList.indexOf(anchor) : toList.length;
    toList.splice(to, 0, id);
    ops.push({ op: "moveNode", nodeId: id, parentId, index: to });
  }
  // Dropping a layer back where it was is not a change.
  const unchanged =
    ops.every((o) => o.op === "moveNode" && parents.get(o.nodeId) === parentId) &&
    target.children.join() === list(parentId).join();
  return unchanged ? [] : ops;
}

/** Absolute layers move by setting left/top at the editing breakpoint. */
export function moveAbsoluteOps(
  bp: BreakpointId,
  moves: readonly { id: string; left: number; top: number }[],
): Op[] {
  return moves.flatMap(({ id, left, top }) => [
    { op: "setProp", nodeId: id, breakpoint: bp, key: "left", value: px(left) } as const,
    { op: "setProp", nodeId: id, breakpoint: bp, key: "top", value: px(top) } as const,
  ]);
}

/** Resizing fixes the dragged dimensions (Fixed sizing); absolute layers also move. */
export function resizeOps(
  id: string,
  bp: BreakpointId,
  handle: Handle,
  rect: Rect,
  parent: Rect,
  absolute: boolean,
): Op[] {
  const e = handleEdges(handle);
  const ops: Op[] = [];
  if (e.left || e.right)
    ops.push({
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "width",
      value: { type: "fixed", value: px(rect.width) },
    });
  if (e.top || e.bottom)
    ops.push({
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "height",
      value: { type: "fixed", value: px(rect.height) },
    });
  if (absolute && e.left)
    ops.push({
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "left",
      value: px(rect.x - parent.x),
    });
  if (absolute && e.top)
    ops.push({
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "top",
      value: px(rect.y - parent.y),
    });
  return ops;
}

/**
 * Absolute position is opt-in (PRD F7): the layer keeps its place and size inside its parent,
 * now as left/top and fixed width/height at this breakpoint.
 */
export function makeAbsoluteOps(id: string, bp: BreakpointId, rect: Rect, parent: Rect): Op[] {
  return [
    { op: "setProp", nodeId: id, breakpoint: bp, key: "position", value: "absolute" },
    { op: "setProp", nodeId: id, breakpoint: bp, key: "left", value: px(rect.x - parent.x) },
    { op: "setProp", nodeId: id, breakpoint: bp, key: "top", value: px(rect.y - parent.y) },
    {
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "width",
      value: { type: "fixed", value: px(rect.width) },
    },
    {
      op: "setProp",
      nodeId: id,
      breakpoint: bp,
      key: "height",
      value: { type: "fixed", value: px(rect.height) },
    },
  ];
}

export function deleteOps(ids: readonly string[], parents: ParentMap): Op[] {
  // Deleting a parent deletes its children; skip layers inside another deleted layer.
  return ids
    .filter((id) => parents.has(id) && !ids.some((o) => o !== id && isAncestor(parents, o, id)))
    .map((id) => ({ op: "deleteNode", nodeId: id }) as const);
}

// ——— Drag sessions ———

export type DragContext = {
  doc: ProjectDocument;
  bp: BreakpointId;
  pageRoot: string;
  parents: ParentMap;
  boxes: Boxes;
  /** How a container lays out its children (from the rendered CSS). */
  flow: (containerId: string) => FlowAxis;
  ids: readonly string[];
  start: Point;
  /** Snap distance in world pixels (constant on screen, so it shrinks as you zoom in). */
  snap: number;
};

export type DragPreview =
  | { kind: "none" }
  | {
      kind: "absolute";
      moves: { id: string; rect: Rect; left: number; top: number }[];
      guides: Guide[];
    }
  | {
      kind: "flow";
      parentId: string;
      index: number;
      line: { x1: number; y1: number; x2: number; y2: number };
      ghost: Rect;
    };

/** World pixels at a container's edges that mean "beside", not "inside". */
const EDGE_BAND = 24;

export function dragPreview(ctx: DragContext, p: Point): DragPreview {
  const { doc, bp, ids, boxes } = ctx;
  const first = ids[0];
  const firstBox = first ? boxes.get(first) : undefined;
  if (!first || !firstBox) return { kind: "none" };
  const dx = p.x - ctx.start.x;
  const dy = p.y - ctx.start.y;

  if (ids.every((id) => isAbsolute(doc, id, bp))) {
    const parentId = ctx.parents.get(first);
    const parent = parentId ? boxes.get(parentId) : undefined;
    if (!parentId || !parent) return { kind: "none" };
    const siblings = (doc.nodes[parentId] as { children?: string[] }).children ?? [];
    const targets = snapTargets(
      parent,
      siblings
        .filter((s) => !ids.includes(s))
        .flatMap((s) => (boxes.get(s) ? [boxes.get(s) as Rect] : [])),
    );
    const snapped = snapMove(
      { ...firstBox, x: firstBox.x + dx, y: firstBox.y + dy },
      targets,
      ctx.snap,
    );
    const sdx = snapped.rect.x - firstBox.x;
    const sdy = snapped.rect.y - firstBox.y;
    const moves = ids.flatMap((id) => {
      const b = boxes.get(id);
      const parentBox = boxes.get(ctx.parents.get(id) ?? "");
      if (!b || !parentBox) return [];
      const rect = { ...b, x: b.x + sdx, y: b.y + sdy };
      return [{ id, rect, left: rect.x - parentBox.x, top: rect.y - parentBox.y }];
    });
    return { kind: "absolute", moves, guides: snapped.guides };
  }

  // Auto layout: find the deepest container under the pointer that can take the layers.
  const path = hitPath(doc, ctx.pageRoot, boxes, p);
  let parentId: string | null = null;
  for (let i = path.length - 1; i >= 0; i--) {
    const id = path[i] as string;
    if (ids.includes(id) || ids.some((d) => isAncestor(ctx.parents, d, id))) continue;
    if (canContain(doc, id, ids)) {
      parentId = id;
      break;
    }
  }
  if (!parentId) return { kind: "none" };
  // Near a container's leading or trailing edge (along its parent's flow), drop beside it
  // rather than into it, so siblings can be reordered around containers.
  for (;;) {
    const outer = ctx.parents.get(parentId);
    const box = boxes.get(parentId);
    if (!outer || !box || !canContain(doc, outer, ids)) break;
    const axis = ctx.flow(outer);
    const size = axis === "row" ? box.width : box.height;
    const pos = axis === "row" ? p.x - box.x : p.y - box.y;
    const band = Math.min(size * 0.25, EDGE_BAND);
    if (pos > band && pos < size - band) break;
    parentId = outer;
  }
  const container = doc.nodes[parentId] as { children: string[] };
  const kids = container.children.filter((c) => !ids.includes(c));
  const kidBoxes = kids.flatMap((c) => (boxes.get(c) ? [boxes.get(c) as Rect] : []));
  const axis = ctx.flow(parentId);
  const index = dropIndex(kidBoxes, axis, p);
  const line = dropLine(kidBoxes, axis, index, boxes.get(parentId) as Rect);
  return {
    kind: "flow",
    parentId,
    index,
    line,
    ghost: { ...firstBox, x: firstBox.x + dx, y: firstBox.y + dy },
  };
}

/** The ops for a finished drag: one transaction, or none when nothing changes. */
export function dragOps(ctx: DragContext, preview: DragPreview): Op[] {
  if (preview.kind === "absolute") return moveAbsoluteOps(ctx.bp, preview.moves);
  if (preview.kind === "flow")
    return reorderOps(ctx.doc, ctx.parents, ctx.ids, preview.parentId, preview.index);
  return [];
}

// ——— Resize sessions ———

export type ResizeContext = {
  doc: ProjectDocument;
  bp: BreakpointId;
  id: string;
  handle: Handle;
  start: Rect;
  parent: Rect;
  siblings: Rect[];
  snap: number;
};

export function resizePreview(
  ctx: ResizeContext,
  dx: number,
  dy: number,
  keepRatio: boolean,
): { rect: Rect; guides: Guide[] } {
  const raw = resizeRect(ctx.start, ctx.handle, dx, dy, { keepRatio });
  if (keepRatio) return { rect: raw, guides: [] };
  return snapResize(raw, handleEdges(ctx.handle), snapTargets(ctx.parent, ctx.siblings), ctx.snap);
}

export function resizeEndOps(ctx: ResizeContext, rect: Rect): Op[] {
  const moved = ["x", "y", "width", "height"].some(
    (k) => Math.round(rect[k as keyof Rect]) !== Math.round(ctx.start[k as keyof Rect]),
  );
  if (!moved) return [];
  return resizeOps(
    ctx.id,
    ctx.bp,
    ctx.handle,
    rect,
    ctx.parent,
    isAbsolute(ctx.doc, ctx.id, ctx.bp),
  );
}
