/**
 * Auto-layout inference (PRD F4, F7, P5-6): given where layers sit, the stack that reproduces
 * them. "Add auto layout" turns a frame of absolutely positioned children into a stack;
 * "Group into stack" wraps a selection in a new one. Our own rules:
 *
 * 1. Direction. Children that follow each other left to right without overlapping make a row;
 *    top to bottom, a column. When both hold (a diagonal), the axis they spread along more
 *    wins; ties are columns. When neither holds but the children form two or more rows that
 *    each don't overlap horizontally, it is a wrapping row. Otherwise a column in reading order.
 * 2. Gap. The median space between neighbours along the direction (so one stray spacing
 *    doesn't decide), rounded, never negative. A wrapping row also gets a row gap when the
 *    space between its lines differs from the gap.
 * 3. Align. On the cross axis, whether the children's starts, centres or ends line up (within
 *    `INFER_TOLERANCE`), preferring start, then centre, then end. Children of equal cross size
 *    that line up every way are placed by where they sit in the container: centred and as
 *    wide as each other with several children means stretch.
 * 4. Padding (with a container). The space between the container and the children's bounds on
 *    each side, rounded, never negative; with it, the stack renders where the layers were.
 */
import type { Rect } from "./geometry.ts";

export type StackAlign = "start" | "center" | "end" | "stretch";
export type Sides = { top: number; right: number; bottom: number; left: number };

export type InferredStack = {
  direction: "row" | "column";
  wrap: boolean;
  gap: number;
  /** Space between the lines of a wrapping row, when it differs from `gap`. */
  rowGap?: number;
  align: StackAlign;
  /** Null without a container. */
  padding: Sides | null;
  /** Indices of the input rects in stack order. */
  order: number[];
};

/** Pixels of slack for "touching", "lined up" and "the same size" (rendering rounds). */
export const INFER_TOLERANCE = 2;

type Axis = "x" | "y";
const size = (a: Axis) => (a === "x" ? "width" : "height");
const start = (r: Rect, a: Axis) => r[a];
const end = (r: Rect, a: Axis) => r[a] + r[size(a)];
const mid = (r: Rect, a: Axis) => r[a] + r[size(a)] / 2;

const range = (v: readonly number[]) => Math.max(...v) - Math.min(...v);

function median(v: readonly number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const spacing = (v: number) => Math.max(0, Math.round(v));

/** Indices sorted along `a`, then along the other axis. */
function sortedAlong(rects: readonly Rect[], idx: readonly number[], a: Axis): number[] {
  const b: Axis = a === "x" ? "y" : "x";
  return [...idx].sort((i, j) => {
    const ri = rects[i] as Rect;
    const rj = rects[j] as Rect;
    return start(ri, a) - start(rj, a) || start(ri, b) - start(rj, b) || i - j;
  });
}

/** Whether the rects, in this order, follow each other along `a` without overlapping. */
function follows(rects: readonly Rect[], order: readonly number[], a: Axis): boolean {
  for (let k = 1; k < order.length; k++) {
    const prev = rects[order[k - 1] as number] as Rect;
    const next = rects[order[k] as number] as Rect;
    if (start(next, a) < end(prev, a) - INFER_TOLERANCE) return false;
  }
  return true;
}

function gapsAlong(rects: readonly Rect[], order: readonly number[], a: Axis): number[] {
  const out: number[] = [];
  for (let k = 1; k < order.length; k++)
    out.push(
      start(rects[order[k] as number] as Rect, a) - end(rects[order[k - 1] as number] as Rect, a),
    );
  return out;
}

/** Rows of a wrapping layout: a rect starts a new line once it is below the current one. */
function lines(rects: readonly Rect[]): number[][] | null {
  const byY = sortedAlong(
    rects,
    rects.map((_, i) => i),
    "y",
  );
  const out: number[][] = [];
  let bottom = Number.NEGATIVE_INFINITY;
  for (const i of byY) {
    const r = rects[i] as Rect;
    if (out.length === 0 || r.y >= bottom - INFER_TOLERANCE) {
      out.push([i]);
      bottom = end(r, "y");
    } else {
      (out.at(-1) as number[]).push(i);
      bottom = Math.max(bottom, end(r, "y"));
    }
  }
  if (out.length < 2) return null;
  const sorted = out.map((line) => sortedAlong(rects, line, "x"));
  return sorted.every((line) => follows(rects, line, "x")) ? sorted : null;
}

/** Where a block sits on axis `a` inside `container`. */
function placement(union: Rect, container: Rect, a: Axis): "start" | "center" | "end" {
  const lead = start(union, a) - start(container, a);
  const trail = end(container, a) - end(union, a);
  if (Math.abs(lead - trail) <= INFER_TOLERANCE && lead > INFER_TOLERANCE) return "center";
  return lead <= trail ? "start" : "end";
}

function bounds(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}

function inferAlign(rects: readonly Rect[], cross: Axis, container?: Rect): StackAlign {
  const starts = range(rects.map((r) => start(r, cross)));
  const mids = range(rects.map((r) => mid(r, cross)));
  const ends = range(rects.map((r) => end(r, cross)));
  const t = INFER_TOLERANCE;
  const sameSize = starts <= t && ends <= t;
  if (sameSize) {
    if (!container) return "start";
    const where = placement(bounds(rects), container, cross);
    return where === "center" && rects.length > 1 ? "stretch" : where;
  }
  if (starts <= t) return "start";
  if (mids <= t) return "center";
  if (ends <= t) return "end";
  return "start";
}

function paddingFor(rects: readonly Rect[], container: Rect): Sides {
  const u = bounds(rects);
  return {
    top: spacing(u.y - container.y),
    right: spacing(end(container, "x") - end(u, "x")),
    bottom: spacing(end(container, "y") - end(u, "y")),
    left: spacing(u.x - container.x),
  };
}

/** The stack that lays out `rects` (frame-local boxes) as they are; see the rules above. */
export function inferStack(rects: readonly Rect[], container?: Rect): InferredStack {
  const padding = container ? (rects.length ? paddingFor(rects, container) : zero()) : null;
  const all = rects.map((_, i) => i);
  if (rects.length === 0)
    return { direction: "column", wrap: false, gap: 0, align: "start", padding, order: [] };
  if (rects.length === 1)
    return {
      direction: "column",
      wrap: false,
      gap: 0,
      align: container ? placement(rects[0] as Rect, container, "x") : "start",
      padding,
      order: [0],
    };

  const byX = sortedAlong(rects, all, "x");
  const byY = sortedAlong(rects, all, "y");
  const row = follows(rects, byX, "x");
  const column = follows(rects, byY, "y");
  if (row || column) {
    const spreadX = range(rects.map((r) => mid(r, "x")));
    const spreadY = range(rects.map((r) => mid(r, "y")));
    const direction = row && (!column || spreadX > spreadY) ? "row" : "column";
    const main: Axis = direction === "row" ? "x" : "y";
    const order = direction === "row" ? byX : byY;
    return {
      direction,
      wrap: false,
      gap: spacing(median(gapsAlong(rects, order, main))),
      align: inferAlign(rects, main === "x" ? "y" : "x", container),
      padding,
      order,
    };
  }

  const rows = lines(rects);
  if (rows) {
    const gap = spacing(median(rows.flatMap((line) => gapsAlong(rects, line, "x"))));
    const lineBoxes = rows.map((line) => bounds(line.map((i) => rects[i] as Rect)));
    const between: number[] = [];
    for (let k = 1; k < lineBoxes.length; k++)
      between.push((lineBoxes[k] as Rect).y - end(lineBoxes[k - 1] as Rect, "y"));
    const rowGap = spacing(median(between));
    // Align within each line: the lines' children must agree for it to mean anything.
    const aligns = rows.map((line) =>
      line.length > 1
        ? inferAlign(
            line.map((i) => rects[i] as Rect),
            "y",
          )
        : null,
    );
    const known = aligns.filter((a): a is StackAlign => a !== null);
    const align = known.length && known.every((a) => a === known[0]) ? known[0] : "start";
    return {
      direction: "row",
      wrap: true,
      gap,
      ...(Math.abs(rowGap - gap) > INFER_TOLERANCE ? { rowGap } : {}),
      align: align as StackAlign,
      padding,
      order: rows.flat(),
    };
  }

  // Overlapping layers: a column in reading order, touching.
  const order = [...all].sort((i, j) => {
    const ri = rects[i] as Rect;
    const rj = rects[j] as Rect;
    return mid(ri, "y") - mid(rj, "y") || mid(ri, "x") - mid(rj, "x") || i - j;
  });
  return {
    direction: "column",
    wrap: false,
    gap: 0,
    align: inferAlign(rects, "x", container),
    padding,
    order,
  };
}

function zero(): Sides {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}
