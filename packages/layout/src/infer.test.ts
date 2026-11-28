import { describe, expect, it } from "vitest";
import type { Rect } from "./geometry.ts";
import { INFER_TOLERANCE, inferStack } from "./infer.ts";

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const box = r(0, 0, 400, 400);

describe("inferStack: direction", () => {
  it("nothing is an empty column", () => {
    expect(inferStack([])).toEqual({
      direction: "column",
      wrap: false,
      gap: 0,
      align: "start",
      padding: null,
      order: [],
    });
  });

  it("nothing in a container has zero padding", () => {
    expect(inferStack([], box).padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("one layer is a column", () => {
    const s = inferStack([r(10, 10, 50, 50)]);
    expect(s.direction).toBe("column");
    expect(s.order).toEqual([0]);
  });

  it("side by side is a row", () => {
    expect(inferStack([r(0, 0, 50, 50), r(60, 0, 50, 50)]).direction).toBe("row");
  });

  it("stacked is a column", () => {
    expect(inferStack([r(0, 0, 50, 50), r(0, 60, 50, 50)]).direction).toBe("column");
  });

  it("touching side by side is a row", () => {
    expect(inferStack([r(0, 0, 50, 50), r(50, 0, 50, 50)]).direction).toBe("row");
  });

  it("a row tolerates overlap within the tolerance", () => {
    const s = inferStack([r(0, 0, 50, 50), r(50 - INFER_TOLERANCE, 0, 50, 50)]);
    expect(s.direction).toBe("row");
    expect(s.gap).toBe(0);
  });

  it("a row with uneven tops is still a row", () => {
    expect(inferStack([r(0, 0, 50, 20), r(70, 15, 50, 80), r(140, 5, 50, 30)]).direction).toBe(
      "row",
    );
  });

  it("a column with uneven lefts is still a column", () => {
    expect(inferStack([r(0, 0, 200, 20), r(40, 30, 50, 20), r(10, 60, 90, 20)]).direction).toBe(
      "column",
    );
  });

  it("a diagonal spread wider than tall is a row", () => {
    expect(inferStack([r(0, 0, 20, 20), r(100, 30, 20, 20)]).direction).toBe("row");
  });

  it("a diagonal spread taller than wide is a column", () => {
    expect(inferStack([r(0, 0, 20, 20), r(30, 100, 20, 20)]).direction).toBe("column");
  });

  it("an even diagonal is a column", () => {
    expect(inferStack([r(0, 0, 20, 20), r(40, 40, 20, 20)]).direction).toBe("column");
  });

  it("overlapping layers fall back to a column", () => {
    const s = inferStack([r(0, 0, 100, 100), r(20, 20, 100, 100)]);
    expect(s.direction).toBe("column");
    expect(s.wrap).toBe(false);
    expect(s.gap).toBe(0);
  });

  it("two rows of cards are a wrapping row", () => {
    const cards = [r(0, 0, 80, 60), r(100, 0, 80, 60), r(0, 80, 80, 60), r(100, 80, 80, 60)];
    const s = inferStack(cards);
    expect(s.direction).toBe("row");
    expect(s.wrap).toBe(true);
  });

  it("a short last line still wraps", () => {
    const s = inferStack([r(0, 0, 80, 60), r(100, 0, 80, 60), r(200, 0, 80, 60), r(0, 80, 80, 60)]);
    expect(s.wrap).toBe(true);
    expect(s.order).toEqual([0, 1, 2, 3]);
  });

  it("a line that overlaps itself is not a wrap", () => {
    const s = inferStack([r(0, 0, 80, 60), r(40, 0, 80, 60), r(0, 80, 80, 60), r(100, 80, 80, 60)]);
    expect(s.wrap).toBe(false);
    expect(s.direction).toBe("column");
  });
});

describe("inferStack: order", () => {
  it("a row orders left to right whatever the input order", () => {
    expect(inferStack([r(200, 0, 50, 50), r(0, 0, 50, 50), r(100, 0, 50, 50)]).order).toEqual([
      1, 2, 0,
    ]);
  });

  it("a column orders top to bottom", () => {
    expect(inferStack([r(0, 120, 50, 50), r(0, 0, 50, 50), r(0, 60, 50, 50)]).order).toEqual([
      1, 2, 0,
    ]);
  });

  it("a wrap orders by line, then left to right", () => {
    const cards = [r(100, 80, 80, 60), r(0, 0, 80, 60), r(0, 80, 80, 60), r(100, 0, 80, 60)];
    expect(inferStack(cards).order).toEqual([1, 3, 2, 0]);
  });

  it("overlapping layers order by their centres, top first", () => {
    expect(inferStack([r(20, 40, 100, 100), r(0, 0, 100, 100)]).order).toEqual([1, 0]);
  });

  it("equal positions keep input order", () => {
    expect(inferStack([r(0, 0, 50, 50), r(0, 0, 50, 50)]).order).toEqual([0, 1]);
  });
});

describe("inferStack: gap", () => {
  it("is the space between neighbours in a row", () => {
    expect(inferStack([r(0, 0, 50, 50), r(66, 0, 50, 50)]).gap).toBe(16);
  });

  it("is the space between neighbours in a column", () => {
    expect(inferStack([r(0, 0, 50, 50), r(0, 74, 50, 50)]).gap).toBe(24);
  });

  it("is the median, so one stray spacing doesn't decide", () => {
    const s = inferStack([r(0, 0, 10, 10), r(18, 0, 10, 10), r(36, 0, 10, 10), r(90, 0, 10, 10)]);
    expect(s.gap).toBe(8);
  });

  it("averages the middle two of an even count", () => {
    const s = inferStack([
      r(0, 0, 10, 10),
      r(18, 0, 10, 10),
      r(40, 0, 10, 10),
      r(62, 0, 10, 10),
      r(90, 0, 10, 10),
    ]);
    // Gaps 8, 12, 12, 18 → 12.
    expect(s.gap).toBe(12);
  });

  it("is rounded to whole pixels", () => {
    expect(inferStack([r(0, 0, 50, 50), r(62.6, 0, 50, 50)]).gap).toBe(13);
  });

  it("is never negative", () => {
    expect(inferStack([r(0, 0, 50, 50), r(49, 0, 50, 50)]).gap).toBe(0);
  });

  it("follows the sorted order, not the input order", () => {
    expect(inferStack([r(0, 140, 50, 50), r(0, 0, 50, 50), r(0, 70, 50, 50)]).gap).toBe(20);
  });

  it("a wrap uses the gap within lines", () => {
    const s = inferStack([r(0, 0, 80, 60), r(92, 0, 80, 60), r(0, 72, 80, 60), r(92, 72, 80, 60)]);
    expect(s.gap).toBe(12);
    expect(s.rowGap).toBeUndefined();
  });

  it("a wrap with different space between lines gets a row gap", () => {
    const s = inferStack([r(0, 0, 80, 60), r(92, 0, 80, 60), r(0, 92, 80, 60), r(92, 92, 80, 60)]);
    expect(s.gap).toBe(12);
    expect(s.rowGap).toBe(32);
  });
});

describe("inferStack: align", () => {
  it("a row whose tops line up aligns to the start", () => {
    expect(inferStack([r(0, 10, 50, 20), r(60, 10, 50, 60)]).align).toBe("start");
  });

  it("a row whose centres line up aligns to the centre", () => {
    expect(inferStack([r(0, 20, 50, 20), r(60, 0, 50, 60)]).align).toBe("center");
  });

  it("a row whose bottoms line up aligns to the end", () => {
    expect(inferStack([r(0, 40, 50, 20), r(60, 0, 50, 60), r(120, 30, 50, 30)]).align).toBe("end");
  });

  it("a column whose lefts line up aligns to the start", () => {
    expect(inferStack([r(10, 0, 100, 20), r(10, 30, 40, 20)]).align).toBe("start");
  });

  it("a column whose centres line up aligns to the centre", () => {
    expect(inferStack([r(0, 0, 100, 20), r(30, 30, 40, 20)]).align).toBe("center");
  });

  it("a column whose rights line up aligns to the end", () => {
    expect(inferStack([r(0, 0, 100, 20), r(60, 30, 40, 20)]).align).toBe("end");
  });

  it("lines up within the tolerance", () => {
    expect(inferStack([r(0, 0, 100, 20), r(31, 30, 40, 20)]).align).toBe("center");
  });

  it("nothing lined up aligns to the start", () => {
    expect(inferStack([r(0, 0, 100, 20), r(13, 30, 40, 20), r(71, 60, 10, 20)]).align).toBe(
      "start",
    );
  });

  it("prefers start when start and centre both line up", () => {
    // Equal sizes line up every way; without a container that means start.
    expect(inferStack([r(0, 0, 50, 20), r(0, 30, 50, 20)]).align).toBe("start");
  });

  it("equal-width layers centred in a container stretch", () => {
    expect(inferStack([r(20, 20, 360, 40), r(20, 80, 360, 40)], box).align).toBe("stretch");
  });

  it("equal-width layers on the left of a container align to the start", () => {
    expect(inferStack([r(20, 20, 100, 40), r(20, 80, 100, 40)], box).align).toBe("start");
  });

  it("equal-width layers on the right of a container align to the end", () => {
    expect(inferStack([r(280, 20, 100, 40), r(280, 80, 100, 40)], box).align).toBe("end");
  });

  it("a single layer centred in a container is centred", () => {
    expect(inferStack([r(150, 20, 100, 40)], box).align).toBe("center");
  });

  it("a single layer near the left of a container aligns to the start", () => {
    expect(inferStack([r(24, 24, 100, 40)], box).align).toBe("start");
  });

  it("a single layer near the right of a container aligns to the end", () => {
    expect(inferStack([r(276, 24, 100, 40)], box).align).toBe("end");
  });

  it("a single layer filling a container aligns to the start", () => {
    expect(inferStack([r(0, 0, 400, 40)], box).align).toBe("start");
  });

  it("a wrap aligns by its lines when they agree", () => {
    const s = inferStack([r(0, 20, 80, 20), r(92, 0, 80, 60), r(0, 92, 80, 20), r(92, 72, 80, 60)]);
    expect(s.wrap).toBe(true);
    expect(s.align).toBe("center");
  });

  it("a wrap whose lines disagree aligns to the start", () => {
    const s = inferStack([r(0, 20, 80, 20), r(92, 0, 80, 60), r(0, 72, 80, 20), r(92, 72, 80, 60)]);
    expect(s.wrap).toBe(true);
    expect(s.align).toBe("start");
  });
});

describe("inferStack: padding", () => {
  it("is null without a container", () => {
    expect(inferStack([r(0, 0, 50, 50)]).padding).toBeNull();
  });

  it("is the space around the children's bounds", () => {
    const s = inferStack([r(24, 16, 100, 40), r(24, 72, 200, 40)], r(0, 0, 300, 140));
    expect(s.padding).toEqual({ top: 16, right: 76, bottom: 28, left: 24 });
  });

  it("works with a container away from the origin", () => {
    const s = inferStack([r(110, 210, 50, 50)], r(100, 200, 80, 80));
    expect(s.padding).toEqual({ top: 10, right: 20, bottom: 20, left: 10 });
  });

  it("is rounded and never negative", () => {
    const s = inferStack([r(-5, 10.4, 50, 50)], r(0, 0, 100, 100));
    expect(s.padding).toEqual({ top: 10, right: 55, bottom: 40, left: 0 });
  });

  it("keeps a centred column centred", () => {
    const s = inferStack([r(100, 20, 200, 40), r(150, 80, 100, 40)], box);
    expect(s.align).toBe("center");
    const p = s.padding as NonNullable<typeof s.padding>;
    // Content box centre = container centre, so the children stay where they were.
    expect(p.left).toBe(p.right);
  });
});

describe("inferStack: whole layouts", () => {
  it("a nav bar: logo and links in a centred row", () => {
    const s = inferStack(
      [r(24, 18, 120, 28), r(900, 22, 60, 20), r(984, 22, 60, 20), r(1068, 22, 60, 20)],
      r(0, 0, 1200, 64),
    );
    expect(s).toMatchObject({ direction: "row", wrap: false, align: "center", gap: 24 });
    expect(s.padding).toEqual({ top: 18, right: 72, bottom: 18, left: 24 });
  });

  it("a hero: heading, text and button in a left-aligned column", () => {
    const s = inferStack(
      [r(64, 120, 600, 72), r(64, 216, 480, 48), r(64, 288, 160, 48)],
      r(0, 0, 1200, 480),
    );
    expect(s).toMatchObject({ direction: "column", align: "start", gap: 24 });
  });

  it("a card grid: three by two, wrapping", () => {
    const cards = [0, 1, 2, 3, 4, 5].map((i) =>
      r((i % 3) * 320, Math.floor(i / 3) * 240, 300, 220),
    );
    const s = inferStack(cards, r(0, 0, 940, 460));
    expect(s).toMatchObject({ direction: "row", wrap: true, gap: 20, align: "start" });
    expect(s.order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is deterministic", () => {
    const rects = [r(5, 3, 40, 40), r(70, 9, 40, 40), r(130, 1, 40, 40)];
    expect(inferStack(rects, box)).toEqual(inferStack(rects, box));
  });

  it("doesn't change its input", () => {
    const rects = [r(100, 0, 50, 50), r(0, 0, 50, 50)];
    const copy = structuredClone(rects);
    inferStack(rects);
    expect(rects).toEqual(copy);
  });
});
