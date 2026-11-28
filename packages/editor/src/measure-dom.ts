/**
 * A layer's rendered box in a breakpoint frame, unscaled (world pixels at the frame's zoom
 * undone). Every box shares the viewport origin, so compare boxes, don't read positions.
 */
import type { Rect } from "@truframe/layout";
import type { BreakpointId } from "@truframe/model";

export function measureLayer(bp: BreakpointId, id: string): Rect | null {
  const frame = document.querySelector<HTMLElement>(`[data-frame="${bp}"]`);
  const el = frame?.querySelector<HTMLElement>(`[data-tf-node="${id}"]`);
  if (!frame || !el) return null;
  const scale = frame.getBoundingClientRect().width / (frame.offsetWidth || 1);
  const r = el.getBoundingClientRect();
  return { x: r.left / scale, y: r.top / scale, width: r.width / scale, height: r.height / scale };
}
