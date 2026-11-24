/**
 * Loro layout of a project document, and ops → Loro mutations.
 *
 * Root containers:
 * - `meta` (map): schemaVersion, id, framework, settings; `meta.breakpoints` (mergeable map)
 *   holds `desktop`/`tablet`/`mobile` → `{ width }`.
 * - `pages` (movable list of page ids) for order, `pageData` (map) page id → Page JSON.
 * - `tree` (tree, fractional index): one tree node per document node. Page and component roots
 *   are tree roots; children order is the tree order, so concurrent moves can't duplicate a
 *   node or make a cycle. Each tree node's data map holds the node's fields as JSON values,
 *   except `style`, which is a mergeable map of mergeable breakpoint maps (one key per prop),
 *   so two people can edit different props of one layer without losing either change.
 * - `ids` (map): document node id → Loro TreeID.
 * - `components`, `variables`, `assets` (maps): id → JSON.
 *
 * Breakpoint style maps are never deleted: an empty tablet/mobile map means "no overrides".
 * Deleting and re-creating a mergeable map would bring back its old contents.
 */
import {
  BREAKPOINT_IDS,
  type BreakpointId,
  childrenOf,
  type Node,
  type Page,
  type ProjectDocument,
} from "@truframe/model";
import { type ApplyResult, applyTransaction, type Op, type OpLimits } from "@truframe/ops";
import type { LoroDoc, LoroMap, LoroMovableList, LoroTree, LoroTreeNode, TreeID } from "loro-crdt";

type Json = Record<string, unknown>;

const meta = (doc: LoroDoc) => doc.getMap("meta");
const breakpoints = (doc: LoroDoc) => meta(doc).ensureMergeableMap("breakpoints");
const pageOrder = (doc: LoroDoc): LoroMovableList => doc.getMovableList("pages");
const pageData = (doc: LoroDoc) => doc.getMap("pageData");
const ids = (doc: LoroDoc) => doc.getMap("ids");
function tree(doc: LoroDoc): LoroTree {
  const t = doc.getTree("tree");
  if (!t.isFractionalIndexEnabled()) t.enableFractionalIndex(0);
  return t;
}

/** Thrown when the Loro doc and the document disagree; a bug, never user input. */
export class BindingError extends Error {}

function treeNode(doc: LoroDoc, nodeId: string): LoroTreeNode {
  const treeId = ids(doc).get(nodeId) as TreeID | undefined;
  const node = treeId ? tree(doc).getNodeByID(treeId) : undefined;
  if (!node || node.isDeleted()) throw new BindingError(`No tree node for "${nodeId}"`);
  return node;
}

function styleMap(data: LoroMap, bp: BreakpointId): LoroMap {
  return data.ensureMergeableMap("style").ensureMergeableMap(bp);
}

/** Writes a node's fields into a tree node's data map (not its children). */
function writeNode(doc: LoroDoc, target: LoroTreeNode, node: Node) {
  const data = target.data;
  for (const [key, value] of Object.entries(node)) {
    if (key === "children" || key === "style") continue;
    data.set(key, value);
  }
  for (const bp of BREAKPOINT_IDS) {
    const map = styleMap(data, bp);
    for (const [key, value] of Object.entries(node.style[bp] ?? {})) map.set(key, value);
  }
  ids(doc).set(node.id, target.id);
}

/** Creates a subtree (`nodes[0]` is its root) under `parent` (or as a root) at `index`. */
function createSubtree(
  doc: LoroDoc,
  nodes: readonly Node[],
  parent: LoroTreeNode | undefined,
  index: number | undefined,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const create = (node: Node, under: LoroTreeNode | undefined, at: number | undefined) => {
    const created = under ? under.createNode(at) : tree(doc).createNode(undefined, at);
    writeNode(doc, created, node);
    childrenOf(node).forEach((childId, i) => {
      const child = byId.get(childId);
      if (!child) throw new BindingError(`Subtree is missing "${childId}"`);
      create(child, created, i);
    });
  };
  create(nodes[0] as Node, parent, index);
}

function deleteSubtree(doc: LoroDoc, nodeId: string) {
  const root = treeNode(doc, nodeId);
  const stack: LoroTreeNode[] = [root];
  while (stack.length) {
    const n = stack.pop() as LoroTreeNode;
    ids(doc).delete(n.data.get("id") as string);
    stack.push(...(n.children() ?? []));
  }
  tree(doc).delete(root.id);
}

/** Seeds an empty Loro doc with a document (one commit). */
export function documentToLoro(doc: LoroDoc, input: ProjectDocument, message = "seed"): void {
  const m = meta(doc);
  m.set("schemaVersion", input.schemaVersion);
  m.set("id", input.id);
  m.set("framework", input.framework);
  m.set("settings", input.settings);
  const bps = breakpoints(doc);
  for (const bp of BREAKPOINT_IDS) {
    const value = input.breakpoints[bp];
    if (value) bps.set(bp, value);
  }
  input.pages.forEach((page, i) => {
    pageOrder(doc).insert(i, page.id);
    pageData(doc).set(page.id, page);
  });
  const roots = [
    ...input.pages.map((p) => p.root),
    ...Object.values(input.components).map((c) => c.root),
  ];
  for (const rootId of roots) createSubtree(doc, subtreeNodes(input, rootId), undefined, undefined);
  for (const [key, map] of [
    ["components", input.components],
    ["variables", input.variables],
    ["assets", input.assets],
  ] as const) {
    for (const [id, value] of Object.entries(map)) doc.getMap(key).set(id, value);
  }
  doc.commit({ message });
}

function subtreeNodes(doc: ProjectDocument, rootId: string): Node[] {
  const out: Node[] = [];
  const stack = [rootId];
  while (stack.length) {
    const n = doc.nodes[stack.pop() as string];
    if (!n) continue;
    out.push(n);
    stack.push(...[...childrenOf(n)].reverse());
  }
  return out;
}

function readNode(n: LoroTreeNode): Node {
  const data = n.data;
  const node: Json = {};
  for (const key of data.keys()) if (key !== "style") node[key] = data.get(key);
  const style: Json = {};
  for (const bp of BREAKPOINT_IDS) {
    const props = styleMap(data, bp).toJSON() as Json;
    if (bp === "desktop" || Object.keys(props).length) style[bp] = props;
  }
  node.style = style;
  if (node.type === "frame" || node.type === "link")
    node.children = (n.children() ?? []).map((c) => c.data.get("id") as string);
  return node as Node;
}

/** The plain document a Loro doc holds. */
export function loroToDocument(doc: LoroDoc): ProjectDocument {
  const m = meta(doc);
  const nodes: Record<string, Node> = {};
  for (const n of tree(doc).getNodes({ withDeleted: false })) {
    const node = readNode(n);
    nodes[node.id] = node;
  }
  const bpsJson = breakpoints(doc).toJSON() as ProjectDocument["breakpoints"];
  const bps: Json = {};
  for (const bp of BREAKPOINT_IDS) if (bpsJson[bp]) bps[bp] = bpsJson[bp];
  return {
    schemaVersion: m.get("schemaVersion"),
    id: m.get("id"),
    framework: m.get("framework"),
    settings: m.get("settings"),
    breakpoints: bps,
    pages: (pageOrder(doc).toJSON() as string[]).map((id) => pageData(doc).get(id) as Page),
    nodes,
    components: doc.getMap("components").toJSON(),
    variables: doc.getMap("variables").toJSON(),
    assets: doc.getMap("assets").toJSON(),
  } as ProjectDocument;
}

/** Mirrors one already-validated op onto the Loro doc. */
export function applyOpToLoro(doc: LoroDoc, op: Op): void {
  switch (op.op) {
    case "insertNodes":
      createSubtree(doc, op.nodes, treeNode(doc, op.parentId), op.index);
      return;
    case "deleteNode":
      deleteSubtree(doc, op.nodeId);
      return;
    case "moveNode":
      treeNode(doc, op.nodeId).move(treeNode(doc, op.parentId), op.index);
      return;
    case "setProp":
      styleMap(treeNode(doc, op.nodeId).data, op.breakpoint).set(op.key, op.value);
      return;
    case "resetProp":
      styleMap(treeNode(doc, op.nodeId).data, op.breakpoint).delete(op.key);
      return;
    case "setNodeFields": {
      const data = treeNode(doc, op.nodeId).data;
      for (const [key, value] of Object.entries(op.fields)) {
        if (value === null) data.delete(key);
        else if (value !== undefined) data.set(key, value);
      }
      return;
    }
    case "setInstanceOverride": {
      const data = treeNode(doc, op.nodeId).data;
      const overrides = structuredClone(data.get("overrides")) as Record<string, Json>;
      const map = overrides[op.kind] as Json;
      if (op.value === undefined) delete map[op.key];
      else map[op.key] = op.value;
      data.set("overrides", overrides);
      return;
    }
    case "addPage":
      createSubtree(doc, op.nodes, undefined, undefined);
      pageData(doc).set(op.page.id, op.page);
      pageOrder(doc).insert(op.index, op.page.id);
      return;
    case "deletePage": {
      const page = pageData(doc).get(op.pageId) as Page;
      deleteSubtree(doc, page.root);
      pageData(doc).delete(op.pageId);
      pageOrder(doc).delete(pageIndex(doc, op.pageId), 1);
      return;
    }
    case "updatePage": {
      const page = pageData(doc).get(op.pageId) as Page;
      const next: Json = { ...page };
      for (const [k, v] of Object.entries(op.fields)) if (v !== undefined) next[k] = v;
      pageData(doc).set(op.pageId, next);
      return;
    }
    case "movePage":
      pageOrder(doc).move(pageIndex(doc, op.pageId), op.index);
      return;
    case "setBreakpoint":
      if (op.width === null) breakpoints(doc).delete(op.breakpoint);
      else breakpoints(doc).set(op.breakpoint, { width: op.width });
      return;
    case "upsertVariable":
      doc.getMap("variables").set(op.variable.id, op.variable);
      return;
    case "deleteVariable":
      doc.getMap("variables").delete(op.variableId);
      return;
    case "setSettings":
      meta(doc).set("settings", op.settings);
      return;
  }
}

function pageIndex(doc: LoroDoc, pageId: string): number {
  const i = (pageOrder(doc).toJSON() as string[]).indexOf(pageId);
  if (i < 0) throw new BindingError(`No page "${pageId}" in the page order`);
  return i;
}

/**
 * Validates `ops` against the document the Loro doc holds (`applyTransaction`), and if they
 * are valid applies them to the Loro doc as one commit. Returns the `applyTransaction` result.
 */
export function applyTransactionToLoro(
  doc: LoroDoc,
  ops: readonly unknown[],
  limits: OpLimits,
  commit: { origin?: string; message?: string } = {},
): ApplyResult {
  const result = applyTransaction(loroToDocument(doc), ops, limits);
  if (!result.ok) return result;
  // Apply the parsed ops, never the raw input.
  for (const op of result.ops) applyOpToLoro(doc, op);
  doc.commit(commit);
  return result;
}
