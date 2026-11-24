/**
 * Operation types (ARCHITECTURE §5). Every change to a document is one of these, validated
 * before it is applied. The `op` field names the operation; payloads reuse the model schemas.
 */
import {
  BREAKPOINT_IDS,
  idSchema,
  nodeSchema,
  pageSchema,
  propsSchema,
  variableSchema,
} from "@truframe/model";
import { z } from "zod";

const index = z.number().int().min(0).max(100_000);
const breakpoint = z.enum(BREAKPOINT_IDS);
const propKey = z.enum(Object.keys(propsSchema.shape) as [keyof typeof propsSchema.shape]);

/** Inserts a subtree: `nodes[0]` is its root, the rest are its descendants. */
export const insertNodesOp = z.strictObject({
  op: z.literal("insertNodes"),
  parentId: idSchema,
  index,
  nodes: z.array(nodeSchema).min(1).max(5000),
});

/** Deletes a node and everything inside it. */
export const deleteNodeOp = z.strictObject({ op: z.literal("deleteNode"), nodeId: idSchema });

/** `index` is the position among the new parent's children once the node has been taken out. */
export const moveNodeOp = z.strictObject({
  op: z.literal("moveNode"),
  nodeId: idSchema,
  parentId: idSchema,
  index,
});

/** Sets one style prop at one breakpoint. The value is checked against that prop's schema. */
export const setPropOp = z.strictObject({
  op: z.literal("setProp"),
  nodeId: idSchema,
  breakpoint,
  key: propKey,
  value: z.unknown(),
});

/** Removes a prop at a breakpoint: back to the default (desktop) or to inherited (below it). */
export const resetPropOp = z.strictObject({
  op: z.literal("resetProp"),
  nodeId: idSchema,
  breakpoint,
  key: propKey,
});

/** Node fields that `setNodeFields` may change; `null` removes an optional field. */
export const NODE_FIELDS = [
  "name",
  "tag",
  "hidden",
  "content",
  "assetId",
  "alt",
  "decorative",
  "fit",
  "target",
  "newTab",
  "ariaLabel",
  "set",
  "icon",
  "source",
] as const;

export const setNodeFieldsOp = z.strictObject({
  op: z.literal("setNodeFields"),
  nodeId: idSchema,
  fields: z.partialRecord(z.enum(NODE_FIELDS), z.unknown()),
});

export const setInstanceOverrideOp = z.strictObject({
  op: z.literal("setInstanceOverride"),
  nodeId: idSchema,
  kind: z.enum(["variant", "props", "nodes"]),
  key: z.string().min(1).max(100),
  /** Omit to remove the override. */
  value: z.unknown().optional(),
});

/** Adds a page with its body subtree (`nodes[0]` is the page root frame). */
export const addPageOp = z.strictObject({
  op: z.literal("addPage"),
  index,
  page: pageSchema,
  nodes: z.array(nodeSchema).min(1).max(5000),
});

export const deletePageOp = z.strictObject({ op: z.literal("deletePage"), pageId: idSchema });

export const updatePageOp = z.strictObject({
  op: z.literal("updatePage"),
  pageId: idSchema,
  fields: pageSchema.pick({ name: true, path: true, seo: true }).partial(),
});

export const movePageOp = z.strictObject({ op: z.literal("movePage"), pageId: idSchema, index });

/** Sets a breakpoint's width, or removes Tablet/Mobile with `null` (Desktop can't be removed). */
export const setBreakpointOp = z.strictObject({
  op: z.literal("setBreakpoint"),
  breakpoint,
  width: z.number().int().nullable(),
});

export const upsertVariableOp = z.strictObject({
  op: z.literal("upsertVariable"),
  variable: variableSchema,
});

export const deleteVariableOp = z.strictObject({
  op: z.literal("deleteVariable"),
  variableId: idSchema,
});

export const setSettingsOp = z.strictObject({
  op: z.literal("setSettings"),
  settings: z.strictObject({ lang: z.string() }),
});

export const opSchema = z.discriminatedUnion("op", [
  insertNodesOp,
  deleteNodeOp,
  moveNodeOp,
  setPropOp,
  resetPropOp,
  setNodeFieldsOp,
  setInstanceOverrideOp,
  addPageOp,
  deletePageOp,
  updatePageOp,
  movePageOp,
  setBreakpointOp,
  upsertVariableOp,
  deleteVariableOp,
  setSettingsOp,
]);
export type Op = z.infer<typeof opSchema>;
export type OpName = Op["op"];

/** A transaction: the ops of one gesture or one agent turn, applied atomically, one undo step. */
export const transactionSchema = z.strictObject({
  id: z.string().min(1).max(100),
  ops: z.array(opSchema).min(1).max(10_000),
});
export type Transaction = z.infer<typeof transactionSchema>;
