/**
 * Layer animation (PRD F30, ARCHITECTURE §5): an entrance, scroll-in or looping effect from a
 * "from" state to the layer's own style. CSS-first: the compiler turns it into classes and
 * custom properties over `animations.css`; only transform, opacity and filter ever animate.
 */
import { z } from "zod";

export const ANIMATION_TRIGGERS = ["load", "inView", "loop"] as const;
export type AnimationTrigger = (typeof ANIMATION_TRIGGERS)[number];

/** Named easings; the compiler maps each to a CSS timing function. */
export const ANIMATION_EASINGS = [
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "linear",
  "back-out",
] as const;
export type AnimationEasing = (typeof ANIMATION_EASINGS)[number];

/** Breakpoints an animation can be switched off on (Desktop always plays). */
export const ANIMATION_DISABLE_BREAKPOINTS = ["tablet", "mobile"] as const;

/** The state the layer animates from; an absent key means "same as the layer's own style". */
export const animationFromSchema = z.strictObject({
  opacity: z.number().min(0).max(1).optional(),
  /** Pixels. */
  x: z.number().min(-2000).max(2000).optional(),
  y: z.number().min(-2000).max(2000).optional(),
  scale: z.number().min(0).max(10).optional(),
  /** Degrees. */
  rotate: z.number().min(-720).max(720).optional(),
  /** Pixels of blur. */
  blur: z.number().min(0).max(100).optional(),
});
export type AnimationFrom = z.infer<typeof animationFromSchema>;

const ms = (max: number) => z.number().int().min(0).max(max);

export const animationSchema = z.strictObject({
  trigger: z.enum(ANIMATION_TRIGGERS),
  from: animationFromSchema,
  /** Milliseconds. */
  duration: ms(10_000).min(50),
  delay: ms(10_000),
  easing: z.enum(ANIMATION_EASINGS),
  /** Play once, or every time the layer enters the viewport (In view only). */
  once: z.boolean(),
  /**
   * Milliseconds between children: the layer's direct children play the animation one after
   * another and the layer itself stays still. Only for layers with children.
   */
  staggerChildren: ms(5000).optional(),
  disabledOn: z
    .array(z.enum(ANIMATION_DISABLE_BREAKPOINTS))
    .max(2)
    .refine((a) => new Set(a).size === a.length, "Each breakpoint can be listed once"),
});
export type Animation = z.infer<typeof animationSchema>;

export const ANIMATION_PRESETS = [
  { id: "fade-in", name: "Fade in", from: { opacity: 0 } },
  { id: "slide-up", name: "Slide up", from: { opacity: 0, y: 24 } },
  { id: "slide-in-left", name: "Slide in left", from: { opacity: 0, x: -40 } },
  { id: "slide-in-right", name: "Slide in right", from: { opacity: 0, x: 40 } },
  { id: "scale-in", name: "Scale in", from: { opacity: 0, scale: 0.9 } },
  { id: "blur-in", name: "Blur in", from: { opacity: 0, blur: 8 } },
] as const satisfies readonly { id: string; name: string; from: AnimationFrom }[];
export type AnimationPresetId = (typeof ANIMATION_PRESETS)[number]["id"];

/** The animation a new Animation section starts with (Slide up, in view, once). */
export function defaultAnimation(): Animation {
  return {
    trigger: "inView",
    from: { opacity: 0, y: 24 },
    duration: 600,
    delay: 0,
    easing: "ease-out",
    once: true,
    disabledOn: [],
  };
}

/** The preset whose from state equals `from` exactly, if any. */
export function presetOf(from: AnimationFrom): AnimationPresetId | undefined {
  const keys = (f: AnimationFrom) =>
    Object.entries(f)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
  const want = JSON.stringify(keys(from));
  return ANIMATION_PRESETS.find((p) => JSON.stringify(keys(p.from)) === want)?.id;
}
