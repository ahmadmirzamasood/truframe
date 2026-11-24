/** Resizing a rectangle from one of its eight handles. */
import type { Rect } from "./geometry.ts";
import type { Edges } from "./snap.ts";

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

export function handleEdges(h: Handle): Edges {
  return {
    top: h.includes("n"),
    bottom: h.includes("s"),
    left: h.includes("w"),
    right: h.includes("e"),
  };
}

/**
 * The rectangle after dragging handle `h` by (dx, dy). The opposite edges stay put; sizes
 * never go below `min`. With `keepRatio` (Shift) a corner keeps the starting aspect ratio.
 */
export function resizeRect(
  start: Rect,
  h: Handle,
  dx: number,
  dy: number,
  options: { min?: number; keepRatio?: boolean } = {},
): Rect {
  const min = options.min ?? 1;
  const e = handleEdges(h);
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (e.left) left = Math.min(left + dx, right - min);
  if (e.right) right = Math.max(right + dx, left + min);
  if (e.top) top = Math.min(top + dy, bottom - min);
  if (e.bottom) bottom = Math.max(bottom + dy, top + min);
  let width = right - left;
  let height = bottom - top;
  if (options.keepRatio && (e.left || e.right) && (e.top || e.bottom) && start.height > 0) {
    const ratio = start.width / start.height;
    if (width / ratio > height) height = width / ratio;
    else width = height * ratio;
    if (e.left) left = right - width;
    if (e.top) top = bottom - height;
  }
  return { x: left, y: top, width, height };
}
