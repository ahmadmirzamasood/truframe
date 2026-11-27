/**
 * What the editor needs from the app that hosts it. The app owns the document store
 * (`@truframe/sync` in apps/web); the editor only reads the document and sends ops.
 */
import type { Asset, ProjectDocument } from "@truframe/model";
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
};
