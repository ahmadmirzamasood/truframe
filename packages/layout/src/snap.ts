/**
 * Snapping for absolute moves and resizes (ARCHITECTURE §8): the moving rectangle's edges and
 * center snap to the parent's and siblings' edges and centers within a threshold. Returns the
 * snapped rectangle and the guide lines to draw. (Equal-spacing snapping is not done yet.)
 */
import type { Rect } from "./geometry.ts";

export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

export type SnapTargets = { xs: number[]; ys: number[]; rects: Rect[] };

/** Edges and centers of the parent and every sibling. */
export function snapTargets(parent: Rect, siblings: readonly Rect[]): SnapTargets {
  const all = [parent, ...siblings];
  return {
    xs: all.flatMap((r) => [r.x, r.x + r.width / 2, r.x + r.width]),
    ys: all.flatMap((r) => [r.y, r.y + r.height / 2, r.y + r.height]),
    rects: [parent, ...siblings],
  };
}

function nearest(values: readonly number[], targets: readonly number[], threshold: number) {
  let best: { delta: number; target: number } | null = null;
  for (const v of values)
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta)))
        best = { delta: d, target: t };
    }
  return best;
}

function guidesAt(axis: "x" | "y", at: number, moved: Rect, rects: readonly Rect[]): Guide[] {
  // A guide spans the moved rectangle and every rectangle that touches the line.
  const touching = [moved, ...rects].filter((r) =>
    axis === "x"
      ? [r.x, r.x + r.width / 2, r.x + r.width].some((v) => Math.abs(v - at) < 0.5)
      : [r.y, r.y + r.height / 2, r.y + r.height].some((v) => Math.abs(v - at) < 0.5),
  );
  const lo = Math.min(...touching.map((r) => (axis === "x" ? r.y : r.x)));
  const hi = Math.max(...touching.map((r) => (axis === "x" ? r.y + r.height : r.x + r.width)));
  return [{ axis, at, from: lo, to: hi }];
}

/** Snaps a moved rectangle (all edges and the center move together). */
export function snapMove(
  rect: Rect,
  targets: SnapTargets,
  threshold: number,
): { rect: Rect; guides: Guide[] } {
  const sx = nearest([rect.x, rect.x + rect.width / 2, rect.x + rect.width], targets.xs, threshold);
  const sy = nearest(
    [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
    targets.ys,
    threshold,
  );
  const out = { ...rect, x: rect.x + (sx?.delta ?? 0), y: rect.y + (sy?.delta ?? 0) };
  const guides: Guide[] = [];
  if (sx) guides.push(...guidesAt("x", sx.target, out, targets.rects));
  if (sy) guides.push(...guidesAt("y", sy.target, out, targets.rects));
  return { rect: out, guides };
}

export type Edges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };

/** Snaps only the edges being dragged by a resize handle. */
export function snapResize(
  rect: Rect,
  edges: Edges,
  targets: SnapTargets,
  threshold: number,
): { rect: Rect; guides: Guide[] } {
  let { x, y, width, height } = rect;
  const guides: Guide[] = [];
  const snapX = (v: number) => nearest([v], targets.xs, threshold);
  const snapY = (v: number) => nearest([v], targets.ys, threshold);
  if (edges.left) {
    const s = snapX(x);
    if (s) {
      x += s.delta;
      width -= s.delta;
    }
  } else if (edges.right) {
    const s = snapX(x + width);
    if (s) width += s.delta;
  }
  if (edges.top) {
    const s = snapY(y);
    if (s) {
      y += s.delta;
      height -= s.delta;
    }
  } else if (edges.bottom) {
    const s = snapY(y + height);
    if (s) height += s.delta;
  }
  const out = { x, y, width: Math.max(1, width), height: Math.max(1, height) };
  if (edges.left && snapX(out.x)?.delta === 0)
    guides.push(...guidesAt("x", out.x, out, targets.rects));
  if (edges.right && snapX(out.x + out.width)?.delta === 0)
    guides.push(...guidesAt("x", out.x + out.width, out, targets.rects));
  if (edges.top && snapY(out.y)?.delta === 0)
    guides.push(...guidesAt("y", out.y, out, targets.rects));
  if (edges.bottom && snapY(out.y + out.height)?.delta === 0)
    guides.push(...guidesAt("y", out.y + out.height, out, targets.rects));
  return { rect: out, guides };
}
