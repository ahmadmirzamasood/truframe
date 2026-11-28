/**
 * Nodes (layers). Nodes live in one flat map per document; frames and links list their
 * children by id. A node's code class is derived from its name (PRD F27) and is not stored.
 */
import { z } from "zod";
import { hrefSchema, httpsUrlSchema, idSchema, richTextSchema } from "./primitives.ts";
import { styleOverrideSchema, styleSchema } from "./style.ts";

export const NODE_TYPES = ["frame", "text", "image", "link", "icon", "embed", "instance"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** Semantic tags allowed per node type (PRD F28); the first is the default. */
export const TAGS = {
  frame: [
    "div",
    "section",
    "header",
    "footer",
    "nav",
    "main",
    "aside",
    "article",
    "figure",
    "ul",
    "ol",
    "li",
  ],
  text: ["p", ...HEADINGS, "span", "blockquote", "li", "label", "div"],
  image: ["img", "picture", "figure"],
  link: ["a", "button"],
  icon: ["span", "div"],
  embed: ["div", "section", "figure"],
  instance: ["div", "section", "header", "footer", "nav", "main", "aside", "article", "li"],
} as const satisfies Record<NodeType, readonly [string, ...string[]]>;

export const hiddenSchema = z.strictObject({
  desktop: z.boolean().optional(),
  tablet: z.boolean().optional(),
  mobile: z.boolean().optional(),
});

const base = <T extends NodeType>(type: T) =>
  ({
    id: idSchema,
    type: z.literal(type),
    name: z.string().max(200),
    tag: z.enum(TAGS[type]),
    hidden: hiddenSchema.optional(),
    style: styleSchema,
  }) as const;

const childrenSchema = z.array(idSchema).max(10_000);

export const frameNodeSchema = z.strictObject({ ...base("frame"), children: childrenSchema });

export const textNodeSchema = z.strictObject({ ...base("text"), content: richTextSchema });

export const imageNodeSchema = z.strictObject({
  ...base("image"),
  /** Null while the image is a placeholder. */
  assetId: idSchema.nullable(),
  alt: z.string().max(1000),
  /** Decorative images emit `alt=""` (PRD F28). */
  decorative: z.boolean(),
  fit: z.enum(["fill", "fit", "crop", "tile"]),
});

export const linkTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("url"), href: hrefSchema }),
  z.strictObject({ type: z.literal("page"), pageId: idSchema }),
]);

export const linkNodeSchema = z.strictObject({
  ...base("link"),
  target: linkTargetSchema,
  newTab: z.boolean(),
  /** For icon-only links and buttons (PRD F28). */
  ariaLabel: z.string().max(500).optional(),
  children: childrenSchema,
});

const iconPart = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
/**
 * An icon's drawing (P5-5), kept as data rather than markup so it can't carry script: only
 * these shape tags and presentation attributes, values without `url(` references. The canvas
 * builds it as elements and the compiler inlines it as `<svg>`.
 */
export const SVG_TAGS = [
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
] as const;
export const SVG_ATTRS = [
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "fill",
  "fill-rule",
  "fill-opacity",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
] as const;
export type SvgElement = {
  tag: (typeof SVG_TAGS)[number];
  attrs: Partial<Record<(typeof SVG_ATTRS)[number], string>>;
  children?: SvgElement[];
};
const svgValue = z
  .string()
  .max(20_000)
  .regex(/^[A-Za-z0-9 .,#%+\-()]*$/, "Unsupported characters in an SVG value")
  .refine((v) => !/url\s*\(/i.test(v), "SVG references aren't supported");
export const svgElementSchema: z.ZodType<SvgElement> = z.lazy(() =>
  z.strictObject({
    tag: z.enum(SVG_TAGS),
    attrs: z.partialRecord(z.enum(SVG_ATTRS), svgValue),
    children: z.array(svgElementSchema).max(100).optional(),
  }),
);
const count = (els: SvgElement[], depth: number): number =>
  depth > 4
    ? Number.POSITIVE_INFINITY
    : els.reduce((n, e) => n + 1 + count(e.children ?? [], depth + 1), 0);
export const iconSvgSchema = z
  .strictObject({
    viewBox: z.string().regex(/^-?\d+(?:\.\d+)? -?\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?$/),
    body: z.array(svgElementSchema).min(1).max(200),
  })
  .refine((s) => count(s.body, 0) <= 500, "An icon can have at most 500 shapes, 4 levels deep");
export type IconSvg = z.infer<typeof iconSvgSchema>;

export const iconNodeSchema = z.strictObject({
  ...base("icon"),
  set: iconPart,
  icon: iconPart,
  /** Absent on icons from before P5-5: those compile to an Iconify image URL. */
  svg: iconSvgSchema.optional(),
});

export const embedNodeSchema = z.strictObject({
  ...base("embed"),
  /** Raw HTML is stored as typed and sanitized when rendered or compiled (P6). */
  source: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("html"), html: z.string().max(100_000) }),
    z.strictObject({ type: z.literal("url"), url: httpsUrlSchema }),
  ]),
});

/** A component prop value: text, an image asset id (or null), a link href, or a visibility flag. */
export const propValueSchema = z.union([z.string().max(100_000), z.boolean(), z.null()]);

export const nodeOverrideSchema = z.strictObject({
  style: styleOverrideSchema.optional(),
  content: richTextSchema.optional(),
  assetId: idSchema.nullable().optional(),
  alt: z.string().max(1000).optional(),
  hidden: hiddenSchema.optional(),
});

export const instanceNodeSchema = z.strictObject({
  ...base("instance"),
  componentId: idSchema,
  overrides: z.strictObject({
    variant: z.record(z.string(), z.string()),
    props: z.record(z.string(), propValueSchema),
    nodes: z.record(idSchema, nodeOverrideSchema),
  }),
});

export const nodeSchema = z.discriminatedUnion("type", [
  frameNodeSchema,
  textNodeSchema,
  imageNodeSchema,
  linkNodeSchema,
  iconNodeSchema,
  embedNodeSchema,
  instanceNodeSchema,
]);
export type Node = z.infer<typeof nodeSchema>;
export type FrameNode = z.infer<typeof frameNodeSchema>;
export type TextNode = z.infer<typeof textNodeSchema>;
export type ImageNode = z.infer<typeof imageNodeSchema>;
export type LinkNode = z.infer<typeof linkNodeSchema>;
export type InstanceNode = z.infer<typeof instanceNodeSchema>;
export type NodeOverride = z.infer<typeof nodeOverrideSchema>;

/** Node types that hold children. */
export function childrenOf(node: Node): readonly string[] {
  return node.type === "frame" || node.type === "link" ? node.children : [];
}
