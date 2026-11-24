/**
 * Leaf value schemas shared by the document model. Everything is strict (unknown keys are
 * rejected) so the TypeScript reference and the Rust mirror agree on one exact JSON shape.
 */
import { z } from "zod";

/** Ids of nodes, pages, components, variables and assets: unique within one document. */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Expected an id (1 to 64 of A-Z a-z 0-9 _ -)");
export type Id = z.infer<typeof idSchema>;

/** Project ids come from D1 (UUIDv7). */
export const projectIdSchema = z.uuid();

/** Lowercase hex only, so equal colors are equal strings (deterministic output). */
export const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/, "Expected a lowercase hex color (#rrggbb or #rrggbbaa)");

export const varRefSchema = z.strictObject({ var: idSchema });
export type VarRef = z.infer<typeof varRefSchema>;

export const colorValueSchema = z.union([colorSchema, varRefSchema]);
export type ColorValue = z.infer<typeof colorValueSchema>;

/** Pixel offsets that may be negative (insets, shadow offsets). */
export const offsetSchema = z.number().min(-100_000).max(100_000);
/** Non-negative pixel lengths. */
export const lengthSchema = z.number().min(0).max(100_000);

export const spacingValueSchema = z.union([lengthSchema, varRefSchema]);
export type SpacingValue = z.infer<typeof spacingValueSchema>;

/**
 * Links a site may contain. `javascript:` and other schemes are refused so generated sites
 * can't carry script URLs.
 */
export const hrefSchema = z
  .string()
  .max(2048)
  .refine(
    (v) => /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9()\-.\s]+|\/[^\s]*|#[^\s]*)$/i.test(v),
    "Expected an http(s), mailto: or tel: URL, a /path or a #anchor",
  );

export const httpsUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v), "Expected an https:// URL");

/** One run of text with the same formatting. */
export const textSpanSchema = z.strictObject({
  text: z.string().max(100_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  href: hrefSchema.optional(),
});
export type TextSpan = z.infer<typeof textSpanSchema>;

export const richTextSchema = z.array(textSpanSchema).max(1000);
