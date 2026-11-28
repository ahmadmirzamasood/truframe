import { describe, expect, it } from "vitest";
import { parseGuides } from "./guides.ts";

describe("saved column guides", () => {
  it("keeps well-formed guides per breakpoint", () => {
    const g = { columns: 4, gutter: 16, margin: 20, visible: true };
    expect(parseGuides({ desktop: g, mobile: { ...g, columns: 2 } })).toEqual({
      desktop: g,
      mobile: { ...g, columns: 2 },
    });
  });
  it("drops anything malformed", () => {
    expect(parseGuides(null)).toEqual({});
    expect(parseGuides("x")).toEqual({});
    expect(
      parseGuides({
        desktop: { columns: "4", gutter: 1, margin: 1, visible: true },
        tablet: { columns: -1, gutter: 1, margin: 1, visible: true },
        watch: { columns: 1, gutter: 1, margin: 1, visible: true },
      }),
    ).toEqual({});
  });
  it("caps the column count", () => {
    const g = { columns: 1e6, gutter: 0, margin: 0, visible: true };
    expect(parseGuides({ desktop: g }).desktop?.columns).toBe(48);
  });
});
