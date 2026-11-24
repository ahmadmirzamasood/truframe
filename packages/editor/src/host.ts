/**
 * What the editor needs from the app that hosts it. The app owns the document store
 * (`@truframe/sync` in apps/web); the editor only reads the document and sends ops.
 */
import type { ProjectDocument } from "@truframe/model";
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

export type EditorHost = {
  projectName: string;
  doc: ProjectDocument | null;
  sync: SyncSummary;
  /** Applies one transaction (one undo step). Returns the error if it doesn't apply. */
  apply: (ops: Op[]) => { message: string } | null;
  undo: () => void;
  redo: () => void;
};
