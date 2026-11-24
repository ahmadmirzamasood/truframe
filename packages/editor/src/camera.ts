/**
 * Canvas camera (PRD F4): a world → screen transform `screen = world × zoom + (x, y)`.
 * Pure functions; the canvas applies the result as one CSS transform on the world layer.
 */
import type { Point, Rect } from "@truframe/layout";

export type Camera = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Zoom in/out buttons and shortcuts step through these. */
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom };
}

export function worldToScreen(cam: Camera, p: Point): Point {
  return { x: p.x * cam.zoom + cam.x, y: p.y * cam.zoom + cam.y };
}

export function worldRectToScreen(cam: Camera, r: Rect): Rect {
  const { x, y } = worldToScreen(cam, r);
  return { x, y, width: r.width * cam.zoom, height: r.height * cam.zoom };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Zooms to `zoom` (clamped) keeping the world point under `anchor` (screen) in place. */
export function zoomAt(cam: Camera, anchor: Point, zoom: number): Camera {
  const z = clampZoom(zoom);
  const world = screenToWorld(cam, anchor);
  return { zoom: z, x: anchor.x - world.x * z, y: anchor.y - world.y * z };
}

/** Wheel/pinch zoom: a smooth factor from the wheel delta (negative delta zooms in). */
export function zoomByWheel(cam: Camera, anchor: Point, deltaY: number): Camera {
  const factor = Math.exp(-Math.max(-100, Math.min(100, deltaY)) * 0.01);
  return zoomAt(cam, anchor, cam.zoom * factor);
}

/** The next step above (dir 1) or below (dir -1) the current zoom. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir === 1) return ZOOM_STEPS.find((s) => s > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - eps) ?? MIN_ZOOM;
}

/**
 * The camera that shows `rect` centered in a viewport of `size`, leaving `padding` px on every
 * side. Never zooms in past `maxZoom` (fitting a small frame shouldn't blow it up).
 */
export function fitRect(
  rect: Rect,
  size: { width: number; height: number },
  padding = 48,
  maxZoom = 1,
): Camera {
  const w = Math.max(1, size.width - padding * 2);
  const h = Math.max(1, size.height - padding * 2);
  const zoom = clampZoom(
    Math.min(maxZoom, w / Math.max(1, rect.width), h / Math.max(1, rect.height)),
  );
  return {
    zoom,
    x: size.width / 2 - (rect.x + rect.width / 2) * zoom,
    y: size.height / 2 - (rect.y + rect.height / 2) * zoom,
  };
}

/** Rounds the zoom to a percentage for display ("33%", "100%"). */
export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
