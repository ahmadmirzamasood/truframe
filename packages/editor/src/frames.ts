/**
 * Breakpoint frames on the canvas (PRD F4/F6): one frame per active breakpoint for the active
 * page, side by side, widest first, top-aligned, each at its breakpoint width.
 */
import type { Rect } from "@truframe/layout";
import { activeBreakpoints, type BreakpointId, type Breakpoints } from "@truframe/model";

/** World-space gap between frames. Labels sit above each frame, outside it. */
export const FRAME_GAP = 120;
/** Height used for a frame whose content hasn't been measured yet. */
export const DEFAULT_FRAME_HEIGHT = 800;

export type FrameBox = { breakpoint: BreakpointId; rect: Rect };

export function layoutFrames(
  breakpoints: Breakpoints,
  heights: Partial<Record<BreakpointId, number>> = {},
  gap = FRAME_GAP,
): FrameBox[] {
  let x = 0;
  return activeBreakpoints(breakpoints).map((id) => {
    const width = breakpoints[id]?.width ?? 0;
    const rect = { x, y: 0, width, height: Math.max(1, heights[id] ?? DEFAULT_FRAME_HEIGHT) };
    x += width + gap;
    return { breakpoint: id, rect };
  });
}
