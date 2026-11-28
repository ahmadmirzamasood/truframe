/**
 * `set_animation` (ARCHITECTURE §9): sets, changes or removes the animation of layers. The
 * input is compact for models: a preset and a few overrides; omitted fields take the
 * defaults. It becomes one `setNodeFields` op per layer, so it is validated like any edit.
 * Wired into AgentSession and MCP in P7.
 */
import {
  ANIMATION_DISABLE_BREAKPOINTS,
  ANIMATION_EASINGS,
  ANIMATION_PRESETS,
  ANIMATION_TRIGGERS,
  type Animation,
  animationFromSchema,
  animationSchema,
  defaultAnimation,
  idSchema,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { z } from "zod";

const presetIds = ANIMATION_PRESETS.map((p) => p.id) as [
  (typeof ANIMATION_PRESETS)[number]["id"],
  ...(typeof ANIMATION_PRESETS)[number]["id"][],
];

export const setAnimationInput = z.strictObject({
  nodeIds: z.array(idSchema).min(1).max(100).describe("Layers to change"),
  animation: z
    .strictObject({
      preset: z.enum(presetIds).optional().describe("Starting from state; `from` overrides it"),
      trigger: z.enum(ANIMATION_TRIGGERS).optional().describe("Default inView"),
      from: animationFromSchema.optional().describe("px for x/y/blur, degrees for rotate"),
      duration: z.number().int().optional().describe("ms, default 600"),
      delay: z.number().int().optional().describe("ms, default 0"),
      easing: z.enum(ANIMATION_EASINGS).optional().describe("Default ease-out"),
      once: z.boolean().optional().describe("In view: play once (default) or every time"),
      staggerChildren: z.number().int().optional().describe("ms between children (frames)"),
      disabledOn: z.array(z.enum(ANIMATION_DISABLE_BREAKPOINTS)).optional(),
    })
    .nullable()
    .describe("null removes the animation"),
});
export type SetAnimationInput = z.infer<typeof setAnimationInput>;

export const setAnimationTool = {
  name: "set_animation",
  description:
    "Animate layers on load, when scrolled into view, or in a loop (CSS, reduced-motion safe). " +
    `Presets: ${presetIds.join(", ")}. Example: {"nodeIds":["cards"],"animation":` +
    `{"preset":"slide-up","staggerChildren":80}}. Pass "animation": null to remove.`,
  input: setAnimationInput,
} as const;

/** The full animation an input describes, or null to remove it. */
export function resolveAnimation(input: SetAnimationInput["animation"]): Animation | null {
  if (input === null) return null;
  const { preset, from, ...rest } = input;
  const base = defaultAnimation();
  const presetFrom = ANIMATION_PRESETS.find((p) => p.id === preset)?.from;
  const merged = {
    ...base,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    from: { ...(presetFrom ?? (from ? {} : base.from)), ...from },
  };
  return animationSchema.parse(merged);
}

export function setAnimationOps(input: SetAnimationInput): Op[] {
  const animation = resolveAnimation(input.animation);
  return input.nodeIds.map((nodeId) => ({ op: "setNodeFields", nodeId, fields: { animation } }));
}
