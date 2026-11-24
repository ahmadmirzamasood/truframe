/**
 * Hit testing against measured layer boxes (frame-local world coordinates), and the
 * click-to-select rules. Boxes come from the rendered DOM; the walk follows the model tree so
 * the answer is a layer path, not a DOM node.
 */

import { containsPoint, type Point, type Rect } from "@truframe/layout";
import { childrenOf, type ProjectDocument } from "@truframe/model";
import { type ParentMap, pathTo } from "./tree.ts";

export type Boxes = ReadonlyMap<string, Rect>;

/** The deepest layer under `p` and its ancestors, root first. Later siblings paint on top. */
export function hitPath(doc: ProjectDocument, rootId: string, boxes: Boxes, p: Point): string[] {
  const root = boxes.get(rootId);
  if (!root || !containsPoint(root, p)) return [];
  const path = [rootId];
  let cur = rootId;
  for (;;) {
    const node = doc.nodes[cur];
    if (!node) break;
    const kids = childrenOf(node);
    let next: string | null = null;
    for (let i = kids.length - 1; i >= 0; i--) {
      const id = kids[i] as string;
      const box = boxes.get(id);
      if (box && box.width > 0 && box.height > 0 && containsPoint(box, p)) {
        next = id;
        break;
      }
    }
    if (!next) break;
    path.push(next);
    cur = next;
  }
  return path;
}

/**
 * Which layer a click selects (Figma-like): the layer at the current level, i.e. the child of
 * the deepest hit ancestor that contains the current selection's parent. With nothing
 * selected that is a direct child of the page body. `deep` (Ctrl/Cmd) selects the deepest.
 */
export function clickTarget(
  path: readonly string[],
  parents: ParentMap,
  selected: string | null,
  deep: boolean,
): string | null {
  if (path.length === 0) return null;
  if (deep || path.length === 1) return path.at(-1) as string;
  const context = selected ? pathTo(parents, selected).slice(0, -1) : [path[0] as string];
  // The deepest path entry that is in the selection's ancestor chain.
  let level = 0;
  for (const [i, id] of path.entries()) if (context.includes(id)) level = i;
  return path[Math.min(level + 1, path.length - 1)] as string;
}

/** Double-click goes one level into the selected layer. */
export function drillTarget(path: readonly string[], selected: string | null): string | null {
  if (!selected) return null;
  const i = path.indexOf(selected);
  if (i < 0) return null;
  return path[i + 1] ?? null;
}
