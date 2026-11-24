/**
 * Measurements between two layers (hold Alt): the gaps between their edges, or, when one
 * contains the other, the inset on each side.
 */
import type { Rect } from "./geometry.ts";

export type Measure = { x1: number; y1: number; x2: number; y2: number; distance: number };

const round = (v: number) => Math.round(v * 100) / 100;

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Distance lines from `a` (the selection) to `b` (the hovered layer). */
export function measureBetween(a: Rect, b: Rect): Measure[] {
  const line = (x1: number, y1: number, x2: number, y2: number): Measure => ({
    x1,
    y1,
    x2,
    y2,
    distance: round(Math.abs(x2 - x1) + Math.abs(y2 - y1)),
  });
  const ay = a.y + a.height / 2;
  const ax = a.x + a.width / 2;
  if (contains(b, a) || contains(a, b)) {
    const [outer, inner] = contains(b, a) ? [b, a] : [a, b];
    const cy = inner.y + inner.height / 2;
    const cx = inner.x + inner.width / 2;
    return [
      line(outer.x, cy, inner.x, cy),
      line(inner.x + inner.width, cy, outer.x + outer.width, cy),
      line(cx, outer.y, cx, inner.y),
      line(cx, inner.y + inner.height, cx, outer.y + outer.height),
    ].filter((m) => m.distance > 0);
  }
  const out: Measure[] = [];
  if (b.x >= a.x + a.width) out.push(line(a.x + a.width, ay, b.x, ay));
  else if (b.x + b.width <= a.x) out.push(line(b.x + b.width, ay, a.x, ay));
  if (b.y >= a.y + a.height) out.push(line(ax, a.y + a.height, ax, b.y));
  else if (b.y + b.height <= a.y) out.push(line(ax, b.y + b.height, ax, a.y));
  return out;
}
