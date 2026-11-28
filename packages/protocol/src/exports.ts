/**
 * Image export of a page (PRD F29 "Export", ARCHITECTURE "Image export"). The editor asks for a
 * page at one breakpoint, format and scale; the server checks the plan's largest scale before
 * any rendering starts.
 */
import { z } from "zod";

export const EXPORT_FORMATS = ["png", "jpeg", "webp"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Scales the UI offers; the plan decides which are allowed (`imageExportMaxScale`). */
export const EXPORT_SCALES = [1, 2, 3, 4] as const;

export const imageExportInput = z.strictObject({
  pageId: z.string().min(1).max(100),
  breakpoint: z.enum(["desktop", "tablet", "mobile"]),
  format: z.enum(EXPORT_FORMATS),
  scale: z.number().int().min(1).max(4),
});
export type ImageExportInput = z.infer<typeof imageExportInput>;

/** What the signed-in workspace may export. */
export const imageExportLimitsDto = z.strictObject({ maxScale: z.number().int().positive() });
export type ImageExportLimitsDto = z.infer<typeof imageExportLimitsDto>;

/** A finished export: a short-lived download URL. */
export const imageExportResult = z.strictObject({ url: z.string(), expiresAt: z.string() });
export type ImageExportResult = z.infer<typeof imageExportResult>;
