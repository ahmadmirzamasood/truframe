import { kitchenSink } from "@truframe/model/testing";
import { applyTransaction } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import { resolveAnimation, setAnimationInput, setAnimationOps } from "./set-animation.ts";

const limits = { pagesPerProject: 5 };

describe("set_animation", () => {
  it("fills a preset with defaults", () => {
    expect(resolveAnimation({ preset: "blur-in", trigger: "load" })).toEqual({
      trigger: "load",
      from: { opacity: 0, blur: 8 },
      duration: 600,
      delay: 0,
      easing: "ease-out",
      once: true,
      disabledOn: [],
    });
    expect(resolveAnimation({ from: { scale: 1.1 }, trigger: "loop" })?.from).toEqual({
      scale: 1.1,
    });
    expect(resolveAnimation({ preset: "slide-up", from: { y: 60 } })?.from).toEqual({
      opacity: 0,
      y: 60,
    });
    expect(resolveAnimation(null)).toBeNull();
  });

  it("refuses values the model refuses", () => {
    expect(() => resolveAnimation({ duration: 5 })).toThrow();
    expect(setAnimationInput.safeParse({ nodeIds: [], animation: null }).success).toBe(false);
    expect(
      setAnimationInput.safeParse({ nodeIds: ["a"], animation: { preset: "spin" } }).success,
    ).toBe(false);
  });

  it("becomes ops that apply and validate like any edit", () => {
    const input = setAnimationInput.parse({
      nodeIds: ["hero", "title"],
      animation: { preset: "scale-in", staggerChildren: 60 },
    });
    // Stagger on a text layer is refused by the document validator, so the whole turn fails.
    expect(applyTransaction(kitchenSink(), setAnimationOps(input), limits).ok).toBe(false);
    const ok = applyTransaction(
      kitchenSink(),
      setAnimationOps({ ...input, nodeIds: ["hero"] }),
      limits,
    );
    expect(ok.ok && ok.doc.nodes.hero?.animation?.from).toEqual({ opacity: 0, scale: 0.9 });
  });
});
