/**
 * Every document the store hands the editor is a fresh object tree (transactions clone the
 * document, the room's confirmation rebuilds it), so React can't tell which layers changed.
 * `shareDoc` reuses the previous version's objects wherever the content is equal: unchanged
 * layers keep their identity (memoized Layers rows skip them), and a version equal to the
 * previous one returns the previous document itself, so nothing re-renders or recompiles.
 */
import type { ProjectDocument } from "@truframe/model";

/** Deep equality for JSON data; key order doesn't matter (the CRDT may reorder keys). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const rb = b as Record<string, unknown>;
  const ra = a as Record<string, unknown>;
  return ka.every((k) => Object.hasOwn(rb, k) && same(ra[k], rb[k]));
}

export function shareDoc(
  prev: ProjectDocument | null,
  next: ProjectDocument | null,
): ProjectDocument | null {
  if (!prev || !next || prev === next || prev.id !== next.id) return next;
  let changed = false;
  const nodes: ProjectDocument["nodes"] = {};
  for (const [id, node] of Object.entries(next.nodes)) {
    const old = prev.nodes[id];
    if (old && same(old, node)) nodes[id] = old;
    else {
      nodes[id] = node;
      changed = true;
    }
  }
  if (Object.keys(prev.nodes).length !== Object.keys(next.nodes).length) changed = true;
  const out = { ...next, nodes } as ProjectDocument;
  for (const key of Object.keys(next) as (keyof ProjectDocument)[]) {
    if (key === "nodes") continue;
    if (same(prev[key], next[key])) (out as Record<string, unknown>)[key] = prev[key];
    else changed = true;
  }
  if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
  return changed ? out : prev;
}
