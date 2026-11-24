/**
 * Style properties. Layout and sizing live here (not on the node) because they change per
 * breakpoint, e.g. a row that stacks into a column on mobile. Desktop holds the base values;
 * tablet and mobile hold only overrides.
 */
import { z } from "zod";
import {
  colorValueSchema,
  idSchema,
  lengthSchema,
  offsetSchema,
  spacingValueSchema,
  varRefSchema,
} from "./primitives.ts";

const sides = <T extends z.ZodType>(v: T) =>
  z.strictObject({ top: v, right: v, bottom: v, left: v });

export const sizeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fixed"), value: lengthSchema }),
  z.strictObject({ type: z.literal("fill") }),
  z.strictObject({ type: z.literal("fit") }),
]);
export type Size = z.infer<typeof sizeSchema>;

const gradientStop = z.strictObject({
  color: colorValueSchema,
  position: z.number().min(0).max(1),
});

export const fillSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("solid"), color: colorValueSchema }),
  z.strictObject({
    type: z.literal("linearGradient"),
    angle: z.number().min(0).max(360),
    stops: z.array(gradientStop).min(2).max(8),
  }),
  z.strictObject({
    type: z.literal("image"),
    assetId: idSchema,
    fit: z.enum(["fill", "fit", "crop", "tile"]),
  }),
]);
export type Fill = z.infer<typeof fillSchema>;

export const borderSchema = z.strictObject({
  width: z.number().min(0).max(1000),
  color: colorValueSchema,
  style: z.enum(["solid", "dashed", "dotted"]),
  sides: sides(z.boolean()),
});

export const radiusSchema = z.union([
  lengthSchema,
  z.strictObject({
    topLeft: lengthSchema,
    topRight: lengthSchema,
    bottomRight: lengthSchema,
    bottomLeft: lengthSchema,
  }),
]);

export const shadowSchema = z.strictObject({
  x: offsetSchema,
  y: offsetSchema,
  blur: lengthSchema,
  spread: offsetSchema,
  color: colorValueSchema,
  inset: z.boolean(),
});

const span = z.number().int().min(1).max(24);

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

/** Every property is optional: absent means "the default" on desktop and "inherit" below it. */
export const propsSchema = z.strictObject({
  // Auto layout (PRD F7)
  display: z.enum(["stack", "grid"]).optional(),
  direction: z.enum(["row", "column"]).optional(),
  wrap: z.boolean().optional(),
  align: z.enum(["start", "center", "end", "stretch", "baseline"]).optional(),
  justify: z.enum(["start", "center", "end", "between", "around", "evenly"]).optional(),
  gap: spacingValueSchema.optional(),
  rowGap: spacingValueSchema.optional(),
  gridColumns: span.optional(),
  gridRows: span.optional(),
  columnSpan: span.optional(),
  rowSpan: span.optional(),
  padding: sides(spacingValueSchema).optional(),
  // Size and position
  width: sizeSchema.optional(),
  height: sizeSchema.optional(),
  minWidth: lengthSchema.optional(),
  maxWidth: lengthSchema.optional(),
  minHeight: lengthSchema.optional(),
  maxHeight: lengthSchema.optional(),
  aspectRatio: z.number().gt(0).max(100).optional(),
  position: z.enum(["auto", "absolute"]).optional(),
  top: offsetSchema.optional(),
  right: offsetSchema.optional(),
  bottom: offsetSchema.optional(),
  left: offsetSchema.optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
  overflow: z.enum(["visible", "clip"]).optional(),
  // Typography
  font: varRefSchema.optional(),
  fontFamily: z.string().min(1).max(100).optional(),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
  fontSize: z.number().min(1).max(1000).optional(),
  lineHeight: z.number().min(0.5).max(10).optional(),
  letterSpacing: z.number().min(-1).max(1).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  textColor: colorValueSchema.optional(),
  // Appearance
  fill: fillSchema.optional(),
  border: borderSchema.optional(),
  radius: radiusSchema.optional(),
  shadows: z.array(shadowSchema).max(8).optional(),
  opacity: z.number().min(0).max(1).optional(),
  blend: z.enum(BLEND_MODES).optional(),
  blur: z.number().min(0).max(1000).optional(),
});
export type Props = z.infer<typeof propsSchema>;
export type PropKey = keyof Props;
export const PROP_KEYS = Object.keys(propsSchema.shape) as PropKey[];

/** A node's style: desktop base values plus tablet/mobile overrides. */
export const styleSchema = z.strictObject({
  desktop: propsSchema,
  tablet: propsSchema.optional(),
  mobile: propsSchema.optional(),
});
export type Style = z.infer<typeof styleSchema>;

/** Overrides applied on top of a style (component variants, instance overrides). */
export const styleOverrideSchema = z.strictObject({
  desktop: propsSchema.optional(),
  tablet: propsSchema.optional(),
  mobile: propsSchema.optional(),
});
export type StyleOverride = z.infer<typeof styleOverrideSchema>;

export type VariableKind = "color" | "spacing" | "font";

/** Every variable reference inside a set of props, with the variable type it must point at. */
export function varRefsInProps(props: Props): { var: string; kind: VariableKind; key: string }[] {
  const out: { var: string; kind: VariableKind; key: string }[] = [];
  const color = (v: unknown, key: string) => {
    if (typeof v === "object" && v !== null && "var" in v)
      out.push({ var: (v as { var: string }).var, kind: "color", key });
  };
  const spacing = (v: unknown, key: string) => {
    if (typeof v === "object" && v !== null && "var" in v)
      out.push({ var: (v as { var: string }).var, kind: "spacing", key });
  };
  spacing(props.gap, "gap");
  spacing(props.rowGap, "rowGap");
  if (props.padding)
    for (const [side, v] of Object.entries(props.padding)) spacing(v, `padding.${side}`);
  if (props.font) out.push({ var: props.font.var, kind: "font", key: "font" });
  color(props.textColor, "textColor");
  if (props.fill?.type === "solid") color(props.fill.color, "fill.color");
  if (props.fill?.type === "linearGradient")
    for (const [i, s] of props.fill.stops.entries()) color(s.color, `fill.stops.${i}.color`);
  if (props.border) color(props.border.color, "border.color");
  for (const [i, s] of (props.shadows ?? []).entries()) color(s.color, `shadows.${i}.color`);
  return out;
}

/** Asset ids referenced by a set of props (image fills). */
export function assetRefsInProps(props: Props): string[] {
  return props.fill?.type === "image" ? [props.fill.assetId] : [];
}
