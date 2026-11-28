/**
 * Picker requests (P5-5): icon and photo search, fonts for the canvas, and copying a stock
 * photo into a project. Responses carry icon drawings that the editor checks again with the
 * model schema before they reach a document.
 */
import { z } from "zod";

const query = z.string().trim().min(1, "Type something to search for.").max(60);

export const iconSearchQuery = z.strictObject({ q: query });
export const photoSearchQuery = z.strictObject({
  q: z.string().trim().max(60).default(""),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
export const fontCssQuery = z.strictObject({
  family: z.array(z.string().min(1).max(100)).min(1).max(20),
});
export const importPhotoInput = z.strictObject({
  photoId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});
export type ImportPhotoInput = z.infer<typeof importPhotoInput>;

export type PhotoDto = {
  id: string;
  description: string;
  width: number;
  height: number;
  thumbUrl: string;
  author: string;
  authorUrl: string;
  sourceUrl: string;
};
export type PhotoSearchResult = { sample: boolean; photos: PhotoDto[] };
