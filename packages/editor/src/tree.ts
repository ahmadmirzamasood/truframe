/** Tree helpers over the flat node map. */
import { childrenOf, type Node, type ProjectDocument } from "@truframe/model";

export type ParentMap = Map<string, string>;

export function parentMap(doc: ProjectDocument): ParentMap {
  const out: ParentMap = new Map();
  for (const n of Object.values(doc.nodes)) for (const c of childrenOf(n)) out.set(c, n.id);
  return out;
}

/** Ids from the tree root down to `id` (inclusive). */
export function pathTo(parents: ParentMap, id: string): string[] {
  const out = [id];
  let cur = parents.get(id);
  while (cur) {
    out.unshift(cur);
    cur = parents.get(cur);
  }
  return out;
}

export function isAncestor(parents: ParentMap, ancestor: string, id: string): boolean {
  let cur = parents.get(id);
  while (cur) {
    if (cur === ancestor) return true;
    cur = parents.get(cur);
  }
  return false;
}

/** Frames and links hold children; a link can't hold a link. */
export function canContain(
  doc: ProjectDocument,
  parentId: string,
  childIds: readonly string[],
): boolean {
  const parent = doc.nodes[parentId];
  if (!parent || (parent.type !== "frame" && parent.type !== "link")) return false;
  if (parent.type === "link") return !childIds.some((id) => containsLink(doc, id));
  return true;
}

function containsLink(doc: ProjectDocument, id: string): boolean {
  const n = doc.nodes[id];
  if (!n) return false;
  return n.type === "link" || childrenOf(n).some((c) => containsLink(doc, c));
}

export function nodeAt(doc: ProjectDocument, id: string): Node | undefined {
  return doc.nodes[id];
}

/** The page or main component whose tree holds a layer (reveal in design, P6-3). */
export type Owner = { kind: "page"; id: string } | { kind: "component"; id: string };

export function ownerOf(doc: ProjectDocument, id: string, parents = parentMap(doc)): Owner | null {
  if (!doc.nodes[id]) return null;
  const root = pathTo(parents, id)[0];
  const page = doc.pages.find((p) => p.root === root);
  if (page) return { kind: "page", id: page.id };
  const component = Object.values(doc.components).find((c) => c.root === root);
  return component ? { kind: "component", id: component.id } : null;
}
