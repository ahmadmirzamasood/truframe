import { describe, expect, it } from "vitest";
import { dropIndex, dropLine } from "./drop.ts";
import { measureBetween } from "./measure.ts";
import { handleEdges, resizeRect } from "./resize.ts";
import { snapMove, snapResize, snapTargets } from "./snap.ts";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("dropIndex", () => {
  const column = [r(0, 0, 100, 40), r(0, 50, 100, 40), r(0, 100, 100, 40)];
  it("finds the slot in a column by vertical center", () => {
    expect(dropIndex(column, "column", { x: 50, y: 5 })).toBe(0);
    expect(dropIndex(column, "column", { x: 50, y: 30 })).toBe(1);
    expect(dropIndex(column, "column", { x: 50, y: 75 })).toBe(2);
    expect(dropIndex(column, "column", { x: 50, y: 500 })).toBe(3);
    expect(dropIndex([], "column", { x: 0, y: 0 })).toBe(0);
  });
  it("finds the slot in a row by horizontal center", () => {
    const row = [r(0, 0, 40, 40), r(50, 0, 40, 40)];
    expect(dropIndex(row, "row", { x: 10, y: 20 })).toBe(0);
    expect(dropIndex(row, "row", { x: 30, y: 20 })).toBe(1);
    expect(dropIndex(row, "row", { x: 95, y: 20 })).toBe(2);
  });
  it("fills grids row by row", () => {
    const grid = [r(0, 0, 40, 40), r(50, 0, 40, 40), r(0, 50, 40, 40), r(50, 50, 40, 40)];
    expect(dropIndex(grid, "grid", { x: 60, y: 10 })).toBe(1);
    expect(dropIndex(grid, "grid", { x: 85, y: 10 })).toBe(2);
    expect(dropIndex(grid, "grid", { x: 5, y: 60 })).toBe(2);
    expect(dropIndex(grid, "grid", { x: 95, y: 95 })).toBe(4);
  });
  it("draws the indicator between children", () => {
    expect(dropLine(column, "column", 1, r(0, 0, 100, 140))).toEqual({
      x1: 0,
      y1: 45,
      x2: 100,
      y2: 45,
    });
    expect(dropLine(column, "column", 3, r(0, 0, 100, 140)).y1).toBe(140);
    expect(dropLine([], "row", 0, r(10, 10, 100, 50))).toEqual({ x1: 12, y1: 10, x2: 12, y2: 60 });
  });
});

describe("snapping", () => {
  const parent = r(0, 0, 400, 300);
  const sibling = r(200, 100, 100, 50);
  const targets = snapTargets(parent, [sibling]);

  it("snaps a moved edge or center within the threshold and reports guides", () => {
    const { rect, guides } = snapMove(r(203, 10, 50, 20), targets, 5);
    expect(rect.x).toBe(200);
    expect(rect.y).toBe(10);
    expect(guides).toEqual([{ axis: "x", at: 200, from: 0, to: 300 }]);
    expect(snapMove(r(173, 147, 50, 20), targets, 5).rect).toEqual(r(175, 150, 50, 20));
  });

  it("leaves the rectangle alone outside the threshold", () => {
    expect(snapMove(r(110, 60, 20, 20), targets, 4)).toEqual({
      rect: r(110, 60, 20, 20),
      guides: [],
    });
  });

  it("snaps only the dragged edges when resizing", () => {
    expect(snapResize(r(10, 10, 187, 40), { right: true }, targets, 5).rect).toEqual(
      r(10, 10, 190, 40),
    );
    const left = snapResize(r(4, 10, 100, 40), { left: true }, targets, 5).rect;
    expect(left).toEqual(r(0, 10, 104, 40));
  });
});

describe("resizeRect", () => {
  const start = r(100, 100, 200, 100);
  it("moves only the dragged edges", () => {
    expect(resizeRect(start, "se", 20, 10)).toEqual(r(100, 100, 220, 110));
    expect(resizeRect(start, "nw", 20, 10)).toEqual(r(120, 110, 180, 90));
    expect(resizeRect(start, "e", 50, 999)).toEqual(r(100, 100, 250, 100));
    expect(handleEdges("sw")).toEqual({ top: false, bottom: true, left: true, right: false });
  });
  it("never collapses below the minimum", () => {
    expect(resizeRect(start, "w", 500, 0)).toEqual(r(299, 100, 1, 100));
    expect(resizeRect(start, "s", 0, -500, { min: 10 })).toEqual(r(100, 100, 200, 10));
  });
  it("keeps the aspect ratio on corners with Shift", () => {
    const out = resizeRect(start, "se", 100, 0, { keepRatio: true });
    expect(out.width / out.height).toBeCloseTo(2, 9);
    expect(out.width).toBe(300);
  });
});

describe("measureBetween", () => {
  it("measures gaps between separate layers", () => {
    const m = measureBetween(r(0, 0, 100, 100), r(130, 0, 50, 50));
    expect(m).toEqual([{ x1: 100, y1: 50, x2: 130, y2: 50, distance: 30 }]);
    expect(measureBetween(r(0, 0, 100, 100), r(0, 140, 50, 50))[0]?.distance).toBe(40);
  });
  it("measures insets when one contains the other", () => {
    const m = measureBetween(r(10, 20, 80, 50), r(0, 0, 100, 100));
    expect(m.map((l) => l.distance)).toEqual([10, 10, 20, 30]);
  });
});
