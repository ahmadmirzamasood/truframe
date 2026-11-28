/**
 * The messages between the editor and its compile worker (ARCHITECTURE §6.3), and the file
 * diff that keeps them small: after the first compile only files that changed cross the
 * thread boundary (the two lockfiles alone are ~270 KB and never change).
 */
import type { CompileOutput } from "@truframe/compiler-wasm";
import type { ProjectDocument } from "@truframe/model";

/** Each channel (the real document, the main-component view) keeps its own last files. */
export type CompileRequest = { channel: string; seq: number; doc: ProjectDocument };

export type FileDiff = {
  /** Every file on the first compile of a channel; afterwards only new or changed ones. */
  changed: Record<string, string>;
  removed: string[];
};

export type CompileReply =
  | {
      channel: string;
      seq: number;
      ok: true;
      diff: FileDiff;
      rest: Omit<CompileOutput, "files">;
      /** Time spent compiling inside the worker. */
      ms: number;
    }
  | { channel: string; seq: number; ok: false; message: string };

export function diffFiles(
  prev: Readonly<Record<string, string>> | null,
  next: Readonly<Record<string, string>>,
): FileDiff {
  const changed: Record<string, string> = {};
  for (const [path, text] of Object.entries(next)) if (prev?.[path] !== text) changed[path] = text;
  const removed = prev ? Object.keys(prev).filter((p) => !(p in next)) : [];
  return { changed, removed };
}

/**
 * Applies a diff and returns a new map, sorted by path like the compiler's own output.
 * Unchanged files keep their string identity, so React can skip work for them.
 */
export function applyDiff(
  prev: Readonly<Record<string, string>> | null,
  diff: FileDiff,
): Record<string, string> {
  const merged: Record<string, string> = { ...prev, ...diff.changed };
  for (const p of diff.removed) delete merged[p];
  const out: Record<string, string> = {};
  for (const p of Object.keys(merged).sort()) out[p] = merged[p] as string;
  return out;
}
