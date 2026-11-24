/**
 * Applies ops to a plain document. This is the reference semantics: the Loro binding (P2-4)
 * must produce the same document. A transaction is atomic: it applies every op to a copy,
 * validates the result (schema, references, plan limits) and returns the new document with the
 * ops that undo it, or an error and no change.
 */
import {
  childrenOf,
  type Issue,
  type Node,
  nodeSchema,
  type ProjectDocument,
  propsSchema,
  validateDocument,
} from "@truframe/model";
import { type Op, opSchema } from "./ops.ts";

/** Limits the caller resolves from the workspace's plan (`@truframe/billing`). */
export type OpLimits = { pagesPerProject: number };

export type OpErrorCode = "INVALID_OP" | "NOT_FOUND" | "INVALID_DOCUMENT" | "LIMIT_REACHED";

export type OpError = {
  code: OpErrorCode;
  message: string;
  /** Index of the failing op in the transaction, when one op is to blame. */
  opIndex?: number;
  issues?: Issue[];
};

export type ApplyResult =
  | { ok: true; doc: ProjectDocument; inverse: Op[] }
  | { ok: false; error: OpError };

class OpFailure extends Error {
  constructor(
    readonly code: OpErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: OpErrorCode, message: string): never => {
  throw new OpFailure(code, message);
};

/**
 * Applies `ops` in order as one transaction. `ops` may be untrusted (they are parsed here).
 * On success, applying `inverse` to the returned document restores the input document.
 */
export function applyTransaction(
  doc: ProjectDocument,
  ops: readonly unknown[],
  limits: OpLimits,
): ApplyResult {
  const draft = structuredClone(doc);
  const inverses: Op[][] = [];
  for (const [i, raw] of ops.entries()) {
    const parsed = opSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: {
          code: "INVALID_OP",
          message: `Op ${i}: ${first?.path.join(".") || "op"}: ${first?.message ?? "invalid"}`,
          opIndex: i,
        },
      };
    }
    try {
      inverses.push(applyOp(draft, parsed.data));
    } catch (e) {
      if (e instanceof OpFailure) {
        return { ok: false, error: { code: e.code, message: `Op ${i}: ${e.message}`, opIndex: i } };
      }
      throw e;
    }
  }
  if (draft.pages.length > limits.pagesPerProject && draft.pages.length > doc.pages.length) {
    return {
      ok: false,
      error: {
        code: "LIMIT_REACHED",
        message: `This plan allows ${limits.pagesPerProject} pages per project.`,
      },
    };
  }
  const result = validateDocument(draft);
  if (!result.ok) {
    const first = result.issues[0];
    return {
      ok: false,
      error: {
        code: "INVALID_DOCUMENT",
        message: `The change would make the document invalid: ${first?.path.join(".")}: ${first?.message}`,
        issues: result.issues,
      },
    };
  }
  return { ok: true, doc: result.doc, inverse: inverses.reverse().flat() };
}

/** Applies one parsed op to `doc` in place and returns the ops that undo it. */
function applyOp(doc: ProjectDocument, op: Op): Op[] {
  switch (op.op) {
    case "insertNodes": {
      const parent = container(doc, op.parentId);
      if (op.index > parent.children.length)
        fail("INVALID_OP", `Index ${op.index} is out of range`);
      addSubtree(doc, op.nodes);
      parent.children.splice(op.index, 0, (op.nodes[0] as Node).id);
      return [{ op: "deleteNode", nodeId: (op.nodes[0] as Node).id }];
    }
    case "deleteNode": {
      node(doc, op.nodeId);
      const at = parentOf(doc, op.nodeId);
      if (!at) return fail("INVALID_OP", `"${op.nodeId}" is a page or component root`);
      const nodes = removeSubtree(doc, op.nodeId);
      at.parent.children.splice(at.index, 1);
      return [{ op: "insertNodes", parentId: at.parent.id, index: at.index, nodes }];
    }
    case "moveNode": {
      node(doc, op.nodeId);
      const from = parentOf(doc, op.nodeId);
      if (!from) return fail("INVALID_OP", `"${op.nodeId}" is a page or component root`);
      const to = container(doc, op.parentId);
      if (subtreeIds(doc, op.nodeId).has(op.parentId))
        fail("INVALID_OP", `Can't move "${op.nodeId}" into itself`);
      from.parent.children.splice(from.index, 1);
      if (op.index > to.children.length) fail("INVALID_OP", `Index ${op.index} is out of range`);
      to.children.splice(op.index, 0, op.nodeId);
      return [{ op: "moveNode", nodeId: op.nodeId, parentId: from.parent.id, index: from.index }];
    }
    case "setProp": {
      const target = node(doc, op.nodeId);
      const value = propsSchema.shape[op.key].safeParse(op.value);
      if (!value.success || value.data === undefined)
        fail(
          "INVALID_OP",
          `Invalid value for ${op.key}: ${value.error?.issues[0]?.message ?? "missing"}`,
        );
      target.style[op.breakpoint] ??= {};
      const props = target.style[op.breakpoint] as Record<string, unknown>;
      const before = props[op.key];
      props[op.key] = value.data;
      return [
        before === undefined
          ? { op: "resetProp", nodeId: op.nodeId, breakpoint: op.breakpoint, key: op.key }
          : {
              op: "setProp",
              nodeId: op.nodeId,
              breakpoint: op.breakpoint,
              key: op.key,
              value: before,
            },
      ];
    }
    case "resetProp": {
      const target = node(doc, op.nodeId);
      const props = target.style[op.breakpoint] as Record<string, unknown> | undefined;
      const before = props?.[op.key];
      if (!props || before === undefined) return [];
      delete props[op.key];
      // Empty overrides are removed, so a set followed by a reset leaves no trace.
      if (op.breakpoint !== "desktop" && Object.keys(props).length === 0)
        delete target.style[op.breakpoint];
      return [
        { op: "setProp", nodeId: op.nodeId, breakpoint: op.breakpoint, key: op.key, value: before },
      ];
    }
    case "setNodeFields": {
      const target = node(doc, op.nodeId) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...target };
      const undo: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(op.fields)) {
        if (!(key in target) && value === null) continue;
        undo[key] = key in target ? target[key] : null;
        if (value === null) delete next[key];
        else next[key] = value;
      }
      const parsed = nodeSchema.safeParse(next);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        fail("INVALID_OP", `${first?.path.join(".")}: ${first?.message}`);
      }
      doc.nodes[op.nodeId] = parsed.data as Node;
      return Object.keys(undo).length
        ? [{ op: "setNodeFields", nodeId: op.nodeId, fields: undo }]
        : [];
    }
    case "setInstanceOverride": {
      const target = node(doc, op.nodeId);
      if (target.type !== "instance")
        return fail("INVALID_OP", `"${op.nodeId}" is not an instance`);
      const map = target.overrides[op.kind] as Record<string, unknown>;
      const had = Object.hasOwn(map, op.key);
      const before = map[op.key];
      // No `value` removes the override (a `null` value is meaningful: "no image").
      if (op.value === undefined) delete map[op.key];
      else map[op.key] = op.value;
      const undo = {
        op: "setInstanceOverride",
        nodeId: op.nodeId,
        kind: op.kind,
        key: op.key,
      } as const;
      return [had ? { ...undo, value: before } : undo];
    }
    case "addPage": {
      if (doc.pages.some((p) => p.id === op.page.id))
        fail("INVALID_OP", `Page "${op.page.id}" already exists`);
      if (op.page.root !== (op.nodes[0] as Node).id)
        fail("INVALID_OP", "nodes[0] must be the page root");
      if (op.index > doc.pages.length) fail("INVALID_OP", `Index ${op.index} is out of range`);
      addSubtree(doc, op.nodes);
      doc.pages.splice(op.index, 0, op.page);
      return [{ op: "deletePage", pageId: op.page.id }];
    }
    case "deletePage": {
      const i = pageIndex(doc, op.pageId);
      const [page] = doc.pages.splice(i, 1);
      if (!page) return fail("NOT_FOUND", `No page "${op.pageId}"`);
      const nodes = removeSubtree(doc, page.root);
      return [{ op: "addPage", index: i, page, nodes }];
    }
    case "updatePage": {
      const page = doc.pages[pageIndex(doc, op.pageId)] as Record<string, unknown>;
      const undo: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(op.fields)) {
        if (value === undefined) continue;
        undo[key] = page[key];
        page[key] = value;
      }
      return Object.keys(undo).length
        ? [{ op: "updatePage", pageId: op.pageId, fields: undo as never }]
        : [];
    }
    case "movePage": {
      const from = pageIndex(doc, op.pageId);
      if (op.index >= doc.pages.length) fail("INVALID_OP", `Index ${op.index} is out of range`);
      const [page] = doc.pages.splice(from, 1);
      doc.pages.splice(op.index, 0, page as (typeof doc.pages)[number]);
      return [{ op: "movePage", pageId: op.pageId, index: from }];
    }
    case "setBreakpoint": {
      const before = doc.breakpoints[op.breakpoint]?.width ?? null;
      if (op.width === null) {
        if (op.breakpoint === "desktop") fail("INVALID_OP", "Desktop can't be removed");
        delete doc.breakpoints[op.breakpoint];
      } else {
        doc.breakpoints[op.breakpoint] = { width: op.width };
      }
      return [{ op: "setBreakpoint", breakpoint: op.breakpoint, width: before }];
    }
    case "upsertVariable": {
      const before = doc.variables[op.variable.id];
      doc.variables[op.variable.id] = op.variable;
      return [
        before
          ? { op: "upsertVariable", variable: before }
          : { op: "deleteVariable", variableId: op.variable.id },
      ];
    }
    case "deleteVariable": {
      const before = doc.variables[op.variableId];
      if (!before) return fail("NOT_FOUND", `No variable "${op.variableId}"`);
      delete doc.variables[op.variableId];
      return [{ op: "upsertVariable", variable: before }];
    }
    case "setSettings": {
      const before = doc.settings;
      doc.settings = op.settings;
      return [{ op: "setSettings", settings: before }];
    }
  }
}

function node(doc: ProjectDocument, id: string): Node {
  const n = doc.nodes[id];
  if (!n) return fail("NOT_FOUND", `No node "${id}"`);
  return n;
}

function container(doc: ProjectDocument, id: string): Node & { children: string[] } {
  const n = node(doc, id);
  if (n.type !== "frame" && n.type !== "link")
    return fail("INVALID_OP", `A ${n.type} node can't contain other nodes`);
  return n;
}

function parentOf(
  doc: ProjectDocument,
  id: string,
): { parent: Node & { children: string[] }; index: number } | null {
  for (const n of Object.values(doc.nodes)) {
    if (n.type !== "frame" && n.type !== "link") continue;
    const index = n.children.indexOf(id);
    if (index >= 0) return { parent: n, index };
  }
  return null;
}

function subtreeIds(doc: ProjectDocument, rootId: string): Set<string> {
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    out.add(id);
    const n = doc.nodes[id];
    if (n) stack.push(...childrenOf(n));
  }
  return out;
}

/** Adds subtree nodes (root first). Ids must be new; the tree shape is checked at the end. */
function addSubtree(doc: ProjectDocument, nodes: readonly Node[]) {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (doc.nodes[n.id] || ids.has(n.id)) fail("INVALID_OP", `Node "${n.id}" already exists`);
    ids.add(n.id);
  }
  for (const n of nodes) doc.nodes[n.id] = n;
}

/** Removes a subtree and returns its nodes in pre-order (root first), ready to re-insert. */
function removeSubtree(doc: ProjectDocument, rootId: string): Node[] {
  const out: Node[] = [];
  const stack = [rootId];
  while (stack.length) {
    const n = doc.nodes[stack.pop() as string];
    if (!n) continue;
    out.push(n);
    delete doc.nodes[n.id];
    stack.push(...[...childrenOf(n)].reverse());
  }
  return out;
}

function pageIndex(doc: ProjectDocument, id: string): number {
  const i = doc.pages.findIndex((p) => p.id === id);
  if (i < 0) return fail("NOT_FOUND", `No page "${id}"`);
  return i;
}
