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
export const iconNodeSchema = z.strictObject({ ...base("icon"), set: iconPart, icon: iconPart });

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
