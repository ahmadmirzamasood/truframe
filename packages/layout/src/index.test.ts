import { describe, expect, it } from "vitest";
import { containsPoint, rectCenter, unionRects } from "./index.ts";

describe("geometry", () => {
  it("unions rectangles", () => {
    expect(unionRects([])).toBeNull();
    expect(
      unionRects([
        { x: 0, y: 10, width: 10, height: 10 },
        { x: 20, y: 0, width: 5, height: 5 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 25, height: 20 });
  });

  it("tests containment edges inclusively and finds centers", () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    expect(containsPoint(r, { x: 10, y: 20 })).toBe(true);
    expect(containsPoint(r, { x: 10.1, y: 0 })).toBe(false);
    expect(rectCenter(r)).toEqual({ x: 5, y: 10 });
  });
});
