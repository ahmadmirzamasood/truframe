import { defaultBreakpoints } from "@truframe/model";
import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitRect,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  screenToWorld,
  stepZoom,
  worldRectToScreen,
  worldToScreen,
  zoomAt,
  zoomByWheel,
  zoomLabel,
} from "./camera.ts";
import { FRAME_GAP, layoutFrames } from "./frames.ts";

const cam = { x: 100, y: 50, zoom: 2 };

describe("camera", () => {
  it("converts between world and screen both ways", () => {
    expect(worldToScreen(cam, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 });
    expect(screenToWorld(cam, { x: 120, y: 90 })).toEqual({ x: 10, y: 20 });
    expect(worldRectToScreen(cam, { x: 0, y: 0, width: 10, height: 5 })).toEqual({
      x: 100,
      y: 50,
      width: 20,
      height: 10,
    });
  });

  it("clamps zoom to 10%–800%", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(zoomAt(cam, { x: 0, y: 0 }, 50).zoom).toBe(8);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(cam, anchor);
    for (const z of [0.1, 0.5, 1, 3.7, 8]) {
      const next = zoomAt(cam, anchor, z);
      const after = screenToWorld(next, anchor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
    const wheeled = zoomByWheel(cam, anchor, -100);
    expect(wheeled.zoom).toBeGreaterThan(cam.zoom);
    expect(screenToWorld(wheeled, anchor).x).toBeCloseTo(before.x, 9);
    expect(zoomByWheel(cam, anchor, 100).zoom).toBeLessThan(cam.zoom);
  });

  it("pans in screen pixels", () => {
    expect(panBy(cam, -10, 5)).toEqual({ x: 90, y: 55, zoom: 2 });
  });

  it("steps through preset zooms and stops at the limits", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.8, -1)).toBe(0.75);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(0.1, -1)).toBe(0.1);
    expect(zoomLabel(0.333)).toBe("33%");
  });

  it("fits a rectangle centered without zooming past 100%", () => {
    const rect = { x: 0, y: 0, width: 2000, height: 1000 };
    const fitted = fitRect(rect, { width: 1048, height: 800 }, 24);
    expect(fitted.zoom).toBeCloseTo(0.5, 9);
    const center = worldToScreen(fitted, { x: 1000, y: 500 });
    expect(center.x).toBeCloseTo(524, 9);
    expect(center.y).toBeCloseTo(400, 9);
    expect(fitRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 800, height: 600 }).zoom).toBe(
      1,
    );
    expect(fitRect({ x: 0, y: 0, width: 1e7, height: 1 }, { width: 800, height: 600 }).zoom).toBe(
      MIN_ZOOM,
    );
  });
});

describe("frames", () => {
  it("lays breakpoint frames side by side, widest first", () => {
    const frames = layoutFrames(defaultBreakpoints(), { desktop: 2000, mobile: 3000 });
    expect(frames.map((f) => f.breakpoint)).toEqual(["desktop", "tablet", "mobile"]);
    expect(frames.map((f) => f.rect)).toEqual([
      { x: 0, y: 0, width: 1200, height: 2000 },
      { x: 1200 + FRAME_GAP, y: 0, width: 810, height: 800 },
      { x: 1200 + 810 + 2 * FRAME_GAP, y: 0, width: 390, height: 3000 },
    ]);
  });

  it("skips removed breakpoints", () => {
    const frames = layoutFrames({ desktop: { width: 1440 }, mobile: { width: 375 } });
    expect(frames.map((f) => [f.breakpoint, f.rect.x])).toEqual([
      ["desktop", 0],
      ["mobile", 1440 + FRAME_GAP],
    ]);
  });
});
