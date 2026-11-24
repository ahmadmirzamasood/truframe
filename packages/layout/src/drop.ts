/**
 * Where a dragged layer lands among a container's children in auto layout (PRD F7). Children
 * are given in order, without the dragged layer; the result is an index into that list.
 */
import type { Point, Rect } from "./geometry.ts";

export type FlowAxis = "row" | "column" | "grid";

/** Index to insert at: before the first child whose center is past the point. */
export function dropIndex(children: readonly Rect[], axis: FlowAxis, p: Point): number {
  if (axis === "grid") return gridDropIndex(children, p);
  for (const [i, r] of children.entries()) {
    const center = axis === "row" ? r.x + r.width / 2 : r.y + r.height / 2;
    if ((axis === "row" ? p.x : p.y) < center) return i;
  }
  return children.length;
}

/** Grids fill row by row: find the row band, then the column within it. */
function gridDropIndex(children: readonly Rect[], p: Point): number {
  for (const [i, r] of children.entries()) {
    const rowBottom = r.y + r.height;
    if (p.y < r.y) return i;
    if (p.y <= rowBottom && p.x < r.x + r.width / 2) return i;
  }
  return children.length;
}

/**
 * The insertion indicator for `index`: a line between two children (or after the last), in
 * the container's coordinates. `container` bounds the line when there are no children.
 */
export function dropLine(
  children: readonly Rect[],
  axis: FlowAxis,
  index: number,
  container: Rect,
): { x1: number; y1: number; x2: number; y2: number } {
  const vertical = axis !== "column";
  const before = children[index - 1];
  const after = children[index];
  if (!before && !after) {
    return vertical
      ? {
          x1: container.x + 2,
          y1: container.y,
          x2: container.x + 2,
          y2: container.y + container.height,
        }
      : {
          x1: container.x,
          y1: container.y + 2,
          x2: container.x + container.width,
          y2: container.y + 2,
        };
  }
  if (vertical) {
    const ref = (after ?? before) as Rect;
    const x =
      before && after && axis === "row"
        ? (before.x + before.width + after.x) / 2
        : after
          ? after.x
          : ref.x + ref.width;
    return { x1: x, y1: ref.y, x2: x, y2: ref.y + ref.height };
  }
  const ref = (after ?? before) as Rect;
  const y =
    before && after
      ? (before.y + before.height + after.y) / 2
      : after
        ? after.y
        : ref.y + ref.height;
  return { x1: ref.x, y1: y, x2: ref.x + ref.width, y2: y };
}
