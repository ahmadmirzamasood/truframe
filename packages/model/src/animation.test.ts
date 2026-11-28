import { describe, expect, it } from "vitest";
import { ANIMATION_PRESETS, animationSchema, defaultAnimation, presetOf } from "./animation.ts";
import { validateDocument } from "./document.ts";
import { kitchenSink } from "./testing/fixtures.ts";

describe("animation schema", () => {
  it("accepts the default and every preset", () => {
    expect(animationSchema.safeParse(defaultAnimation()).success).toBe(true);
    for (const p of ANIMATION_PRESETS)
      expect(animationSchema.safeParse({ ...defaultAnimation(), from: p.from }).success).toBe(true);
  });

  it.each([
    ["a duration under 50 ms", { duration: 10 }],
    ["a fractional delay", { delay: 1.5 }],
    ["an unknown trigger", { trigger: "hover" }],
    ["an unknown easing", { easing: "spring" }],
    ["opacity above 1", { from: { opacity: 1.5 } }],
    ["an unknown from key", { from: { skew: 4 } }],
    ["a repeated breakpoint", { disabledOn: ["mobile", "mobile"] }],
    ["Desktop in disabledOn", { disabledOn: ["desktop"] }],
    ["a stagger over 5 s", { staggerChildren: 6000 }],
  ])("refuses %s", (_, patch) => {
    expect(animationSchema.safeParse({ ...defaultAnimation(), ...patch }).success).toBe(false);
  });

  it("matches presets by their exact from state", () => {
    expect(presetOf({ opacity: 0, y: 24 })).toBe("slide-up");
    expect(presetOf({ y: 24, opacity: 0 })).toBe("slide-up");
    expect(presetOf({ opacity: 0, blur: 8 })).toBe("blur-in");
    expect(presetOf({ opacity: 0, y: 30 })).toBeUndefined();
    expect(presetOf({})).toBeUndefined();
  });

  it("allows stagger children on frames and links only", () => {
    const doc = kitchenSink();
    expect(validateDocument(doc).ok).toBe(true);
    const title = doc.nodes.title;
    if (!title) throw new Error("fixture");
    title.animation = { ...defaultAnimation(), staggerChildren: 50 };
    const r = validateDocument(doc);
    expect(r.ok ? [] : r.issues.map((i) => i.path.join("."))).toEqual([
      "nodes.title.animation.staggerChildren",
    ]);
  });
});
