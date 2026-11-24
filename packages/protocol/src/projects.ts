import { z } from "zod";

export const FRAMEWORK_IDS = ["nextjs", "astro"] as const;
export const frameworkSchema = z.enum(FRAMEWORK_IDS);
export type FrameworkId = z.infer<typeof frameworkSchema>;

export const TEMPLATE_IDS = ["blank", "landing", "portfolio", "saas"] as const;
export const templateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof templateIdSchema>;

/** Project names: trimmed, 1–80 characters, no control characters. */
export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(80, "Use 80 characters or fewer.")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Remove control characters from the name.");

export const createProjectInput = z.object({
  name: projectNameSchema,
  framework: frameworkSchema,
  templateId: templateIdSchema.default("blank"),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const renameProjectInput = z.object({ name: projectNameSchema });
export const duplicateProjectInput = z.object({ name: projectNameSchema.optional() });

export const projectIdSchema = z.uuid();

/** A project as the API returns it (dates as ISO strings). */
export const projectDto = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  framework: frameworkSchema,
  templateId: z.string(),
  thumbnail: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type ProjectDto = z.infer<typeof projectDto>;

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "LIMIT_REACHED",
  "RESTORE_EXPIRED",
  "INTERNAL",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every API error body: what happened (`message`) in plain words, plus a stable `code`. */
export const apiError = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

/** Soft-deleted projects can be restored for this many days (matches the db repo). */
export const RESTORE_WINDOW_DAYS = 30;
