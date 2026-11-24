/**
 * Breakpoints (PRD F6). Desktop always exists and is the width you design at (≥ 1200 px).
 * Tablet and Mobile are optional and carry only overrides (desktop-first cascade).
 */
import { z } from "zod";

export const BREAKPOINT_IDS = ["desktop", "tablet", "mobile"] as const;
export type BreakpointId = (typeof BREAKPOINT_IDS)[number];

/** Inclusive width ranges in px. Desktop's upper bound is a sanity cap, not a product rule. */
export const BREAKPOINT_RANGES = {
  desktop: { min: 1200, max: 7680 },
  tablet: { min: 600, max: 1199 },
  mobile: { min: 320, max: 599 },
} as const satisfies Record<BreakpointId, { min: number; max: number }>;

export const DEFAULT_BREAKPOINT_WIDTHS = {
  desktop: 1200,
  tablet: 810,
  mobile: 390,
} as const satisfies Record<BreakpointId, number>;

const breakpoint = (id: BreakpointId) => {
  const { min, max } = BREAKPOINT_RANGES[id];
  return z.strictObject({
    width: z
      .number()
      .int()
      .min(min, `${id} width must be at least ${min}px`)
      .max(max, `${id} width must be at most ${max}px`),
  });
};

/** Desktop is required, so it can't be deleted; Tablet and Mobile may be absent. */
export const breakpointsSchema = z.strictObject({
  desktop: breakpoint("desktop"),
  tablet: breakpoint("tablet").optional(),
  mobile: breakpoint("mobile").optional(),
});
export type Breakpoints = z.infer<typeof breakpointsSchema>;

export function defaultBreakpoints(): Breakpoints {
  return {
    desktop: { width: DEFAULT_BREAKPOINT_WIDTHS.desktop },
    tablet: { width: DEFAULT_BREAKPOINT_WIDTHS.tablet },
    mobile: { width: DEFAULT_BREAKPOINT_WIDTHS.mobile },
  };
}

/** The breakpoints that exist, widest first (the cascade order). */
export function activeBreakpoints(b: Breakpoints): BreakpointId[] {
  return BREAKPOINT_IDS.filter((id) => b[id] !== undefined);
}
