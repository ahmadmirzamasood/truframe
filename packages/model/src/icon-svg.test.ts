import { describe, expect, it } from "vitest";
import { iconSvgSchema, type SvgElement } from "./nodes.ts";

const path = (attrs: SvgElement["attrs"]): SvgElement => ({ tag: "path", attrs });
const ok = (body: SvgElement[], viewBox = "0 0 24 24") =>
  iconSvgSchema.safeParse({ viewBox, body }).success;

describe("icon svg", () => {
  it("accepts shapes with presentation attributes", () => {
    expect(ok([path({ d: "M5 12h14", stroke: "currentColor", "stroke-width": "2" })])).toBe(true);
    expect(
      ok([{ tag: "g", attrs: { transform: "rotate(45 12 12)" }, children: [path({ d: "M0 0" })] }]),
    ).toBe(true);
  });

  it.each([
    ["url references", [path({ d: "M0 0", fill: "url(#a)" })]],
    ["quotes and angle brackets", [path({ d: '"><script>' })]],
    ["colons", [path({ fill: "javascript:x" })]],
    ["unknown attributes", [{ tag: "path", attrs: { onload: "x" } } as unknown as SvgElement]],
    ["unknown tags", [{ tag: "use", attrs: {} } as unknown as SvgElement]],
    ["no shapes", []],
  ])("refuses %s", (_, body) => {
    expect(ok(body as SvgElement[])).toBe(false);
  });

  it("refuses bad view boxes and deep nesting", () => {
    expect(ok([path({ d: "M0 0" })], "0 0 24")).toBe(false);
    let deep: SvgElement = path({ d: "M0 0" });
    for (let i = 0; i < 6; i++) deep = { tag: "g", attrs: {}, children: [deep] };
    expect(ok([deep])).toBe(false);
  });
});
