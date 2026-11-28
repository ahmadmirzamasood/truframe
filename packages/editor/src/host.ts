/**
 * What the editor needs from the app that hosts it. The app owns the document store
 * (`@truframe/sync` in apps/web); the editor only reads the document and sends ops.
 */
import type { Asset, IconSvg, ProjectDocument } from "@truframe/model";
import type { Op } from "@truframe/ops";

export type SyncSummary = {
  status: "loading" | "connecting" | "online" | "offline";
  /** Local transactions the room hasn't confirmed yet. */
  pending: number;
  canUndo: boolean;
  canRedo: boolean;
  /** The last change the room or local validation refused. */
  lastError: { message: string } | null;
};

/** The workspace storage used against the plan (Assets panel meter); null = unlimited. */
export type AssetUsage = {
  bytes: number;
  files: number;
  maxBytes: number | null;
  maxFiles: number | null;
  maxFileBytes: number | null;
};

/** Uploads and file URLs (P5-4). The app checks, sanitizes and stores files server-side. */
export type AssetHost = {
  /** Uploads one file; the asset comes back ready for an `upsertAsset` op. */
  upload: (file: File) => Promise<{ ok: true; asset: Asset } | { ok: false; message: string }>;
  /** An authorized URL for the file, optionally a resized variant. */
  url: (asset: Asset, width?: number) => string;
  usage: () => Promise<AssetUsage | null>;
};

/** One page exported as an image (Page inspector, Export section). */
export type ImageExportRequest = {
  pageId: string;
  breakpoint: "desktop" | "tablet" | "mobile";
  format: "png" | "jpeg" | "webp";
  scale: number;
};

/** Image export (P5-9); the plan's largest scale is enforced server-side. */
export type ExportHost = {
  /** The largest scale the plan allows, or null when it can't be read. */
  maxScale: () => Promise<number | null>;
  image: (
    input: ImageExportRequest,
  ) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;
};

type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

/** A web font the Typography picker offers, with the weights the family has. */
export type FontOption = { family: string; weights: number[] };
export type IconOption = { set: string; icon: string; svg: IconSvg };
export type PhotoOption = {
  id: string;
  description: string;
  thumbUrl: string;
  author: string;
  authorUrl: string;
  sourceUrl: string;
};

/** Fonts, icons and stock photos (P5-5), all through the app's server proxies. */
export type PickerHost = {
  fonts: FontOption[];
  /** The stylesheet that loads these families on the canvas, or null for none. */
  fontCssUrl: (families: string[]) => string | null;
  icons: (query: string) => Promise<Result<{ icons: IconOption[] }>>;
  photos: (query: string) => Promise<Result<{ sample: boolean; photos: PhotoOption[] }>>;
  /** Copies a photo into the project's assets; the asset comes back for `upsertAsset`. */
  importPhoto: (photoId: string) => Promise<Result<{ asset: Asset }>>;
};

export type EditorHost = {
  projectName: string;
  doc: ProjectDocument | null;
  sync: SyncSummary;
  /** Applies one transaction (one undo step). Returns the error if it doesn't apply. */
  apply: (ops: Op[]) => { message: string } | null;
  undo: () => void;
  redo: () => void;
  /** Absent where uploads aren't available (tests, previews). */
  assets?: AssetHost;
  /** Absent where image export isn't available. */
  exports?: ExportHost;
  /** Absent where the pickers aren't available (tests, previews). */
  pickers?: PickerHost;
};
