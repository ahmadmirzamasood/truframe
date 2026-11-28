/**
 * The project document (ARCHITECTURE §5). `documentSchema` checks shape; `checkIntegrity`
 * checks references between parts (tree structure, ids, variable types). `validateDocument`
 * runs both and is what every boundary should call.
 */
import { z } from "zod";
import { breakpointsSchema } from "./breakpoints.ts";
import { childrenOf, type Node, nodeSchema, propValueSchema } from "./nodes.ts";
import {
  colorSchema,
  hrefSchema,
  httpsUrlSchema,
  idSchema,
  lengthSchema,
  projectIdSchema,
} from "./primitives.ts";
import {
  assetRefsInProps,
  type Props,
  styleOverrideSchema,
  type VariableKind,
  varRefsInProps,
} from "./style.ts";

export const SCHEMA_VERSION = 1 as const;
export const FRAMEWORKS = ["nextjs", "astro"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/** "/" or "/a/b-c": lowercase segments, compiled to routes. */
export const pagePathSchema = z
  .string()
  .regex(
    /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/,
    "Expected a path like / or /about",
  );

export const pageSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(200),
  path: pagePathSchema,
  seo: z.strictObject({
    title: z.string().max(300),
    description: z.string().max(1000),
    ogImage: idSchema.nullable(),
    noindex: z.boolean(),
  }),
  /** The page body: a frame node. */
  root: idSchema,
});
export type Page = z.infer<typeof pageSchema>;

const perBreakpoint = <T extends z.ZodType>(v: T) =>
  z.strictObject({ desktop: v, tablet: v.optional(), mobile: v.optional() });

export const fontValueSchema = z.strictObject({
  family: z.string().min(1).max(100),
  weight: z.number().int().min(100).max(900).multipleOf(100),
  size: z.number().min(1).max(1000),
  lineHeight: z.number().min(0.5).max(10),
  letterSpacing: z.number().min(-1).max(1),
});

const variableBase = {
  id: idSchema,
  name: z.string().min(1).max(100),
  group: z.string().max(100),
  /** The CSS custom property, e.g. `--brand-accent`. */
  cssName: z
    .string()
    .regex(
      /^--[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
      "Expected a CSS custom property like --brand-accent",
    ),
};

export const variableSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...variableBase, type: z.literal("color"), value: perBreakpoint(colorSchema) }),
  z.strictObject({
    ...variableBase,
    type: z.literal("spacing"),
    value: perBreakpoint(lengthSchema),
  }),
  z.strictObject({
    ...variableBase,
    type: z.literal("font"),
    value: perBreakpoint(fontValueSchema),
  }),
]);
export type Variable = z.infer<typeof variableSchema>;

const propNameSchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{0,63}$/, "Expected a camelCase prop name");

export const componentPropSchema = z.strictObject({
  name: propNameSchema,
  type: z.enum(["text", "image", "link", "boolean"]),
  default: propValueSchema,
  /** The node and field this prop drives inside the component. */
  target: z.strictObject({
    nodeId: idSchema,
    field: z.enum(["content", "assetId", "href", "visible"]),
  }),
});

export const componentSchema = z.strictObject({
  id: idSchema,
  name: z.string().regex(/^[A-Z][A-Za-z0-9]{0,63}$/, "Expected a PascalCase component name"),
  root: idSchema,
  props: z.array(componentPropSchema).max(50),
  variantProps: z
    .array(
      z.strictObject({
        name: propNameSchema,
        values: z
          .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
          .min(1)
          .max(20),
        default: z.string(),
      }),
    )
    .max(10),
  /** Keyed by "prop=value,prop=value" (props in `variantProps` order); node id → overrides. */
  variants: z.record(z.string(), z.record(idSchema, styleOverrideSchema)),
});
export type Component = z.infer<typeof componentSchema>;

export const ASSET_MIME_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
} as const;

export const assetSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(255),
  mime: z.enum(Object.keys(ASSET_MIME_TYPES) as [keyof typeof ASSET_MIME_TYPES]),
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
  bytes: z.number().int().min(1),
  /**
   * The R2 key relative to the workspace prefix. The server adds `ws/<workspaceId>/`, so a
   * document can never point at another tenant's objects.
   */
  key: z.string().regex(/^assets\/[0-9a-f]{64}\.(?:png|jpg|webp|avif|gif|svg)$/),
  /** Assets panel folder; empty or absent is the top level (P5-4). */
  folder: z.string().max(100).optional(),
  /** Alt text new image layers start with (PRD F14); each layer keeps its own. */
  alt: z.string().max(1000).optional(),
  /** Who made a stock photo and where it came from (Unsplash attribution, P5-5). */
  credit: z
    .strictObject({
      source: z.enum(["unsplash"]),
      author: z.string().min(1).max(200),
      authorUrl: httpsUrlSchema,
      sourceUrl: httpsUrlSchema,
    })
    .optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const documentSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: projectIdSchema,
  framework: z.enum(FRAMEWORKS),
  settings: z.strictObject({
    /** `lang` on `<html>` (PRD F28). */
    lang: z
      .string()
      .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Expected a language tag like en or pt-BR"),
  }),
  breakpoints: breakpointsSchema,
  pages: z.array(pageSchema).min(1).max(1000),
  nodes: z.record(idSchema, nodeSchema),
  components: z.record(idSchema, componentSchema),
  variables: z.record(idSchema, variableSchema),
  assets: z.record(idSchema, assetSchema),
});
export type ProjectDocument = z.infer<typeof documentSchema>;

export type Issue = { path: (string | number)[]; message: string };
export type ValidationResult = { ok: true; doc: ProjectDocument } | { ok: false; issues: Issue[] };

export function validateDocument(input: unknown): ValidationResult {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
        message: i.message,
      })),
    };
  }
  const issues = checkIntegrity(parsed.data);
  return issues.length ? { ok: false, issues } : { ok: true, doc: parsed.data };
}

/** Parses or throws; for trusted inputs (fixtures, tests). */
export function parseDocument(input: unknown): ProjectDocument {
  const r = validateDocument(input);
  if (!r.ok) {
    const first = r.issues[0];
    throw new Error(
      `Invalid document: ${first?.path.join(".")}: ${first?.message} (${r.issues.length} issue(s))`,
    );
  }
  return r.doc;
}

/** Cross-reference checks on a shape-valid document. Returns every problem found. */
export function checkIntegrity(doc: ProjectDocument): Issue[] {
  const issues: Issue[] = [];
  const add = (path: Issue["path"], message: string) => issues.push({ path, message });

  for (const [key, map] of [
    ["nodes", doc.nodes],
    ["components", doc.components],
    ["variables", doc.variables],
    ["assets", doc.assets],
  ] as const) {
    for (const [id, item] of Object.entries(map)) {
      if (item.id !== id) add([key, id, "id"], `Id "${item.id}" does not match its key "${id}"`);
    }
  }

  // Pages
  const pageIds = new Set<string>();
  const paths = new Set<string>();
  doc.pages.forEach((page, i) => {
    if (pageIds.has(page.id)) add(["pages", i, "id"], `Duplicate page id "${page.id}"`);
    pageIds.add(page.id);
    if (paths.has(page.path)) add(["pages", i, "path"], `Duplicate page path "${page.path}"`);
    paths.add(page.path);
    if (page.seo.ogImage !== null && !doc.assets[page.seo.ogImage])
      add(["pages", i, "seo", "ogImage"], `Unknown asset "${page.seo.ogImage}"`);
  });
  if (!paths.has("/")) add(["pages"], 'The project needs a home page with path "/"');

  // Tree: every node belongs to exactly one tree, rooted at a page or a component.
  const owner = new Map<string, string>(); // node id → tree owner ("page:<id>" | "component:<id>")
  const walk = (rootId: string, tree: string, path: Issue["path"]) => {
    const stack: string[] = [rootId];
    while (stack.length) {
      const id = stack.pop() as string;
      const node = doc.nodes[id];
      if (!node) {
        add(path, `Unknown node "${id}"`);
        continue;
      }
      if (owner.has(id)) {
        add(["nodes", id], `Node "${id}" appears more than once in the document tree`);
        continue;
      }
      owner.set(id, tree);
      for (const child of [...childrenOf(node)].reverse()) stack.push(child);
    }
  };
  doc.pages.forEach((page, i) => {
    const root = doc.nodes[page.root];
    if (root && root.type !== "frame") add(["pages", i, "root"], "A page root must be a frame");
    walk(page.root, `page:${page.id}`, ["pages", i, "root"]);
  });
  for (const [id, c] of Object.entries(doc.components))
    walk(c.root, `component:${id}`, ["components", id, "root"]);
  for (const id of Object.keys(doc.nodes)) {
    if (!owner.has(id)) add(["nodes", id], `Node "${id}" is not part of any page or component`);
  }

  // Per-node references
  const checkVarRefs = (props: Props | undefined, path: Issue["path"]) => {
    if (!props) return;
    for (const ref of varRefsInProps(props)) {
      const v = doc.variables[ref.var];
      if (!v) add([...path, ...ref.key.split(".")], `Unknown variable "${ref.var}"`);
      else if (v.type !== ref.kind)
        add(
          [...path, ...ref.key.split(".")],
          `Variable "${ref.var}" is a ${v.type} variable, expected ${ref.kind}`,
        );
    }
    for (const asset of assetRefsInProps(props)) {
      if (!doc.assets[asset]) add([...path, "fill", "assetId"], `Unknown asset "${asset}"`);
    }
  };
  const checkStyle = (
    style: { desktop?: Props; tablet?: Props; mobile?: Props },
    path: Issue["path"],
  ) => {
    for (const bp of ["desktop", "tablet", "mobile"] as const)
      checkVarRefs(style[bp], [...path, bp]);
  };

  for (const [id, node] of Object.entries(doc.nodes)) {
    const path = ["nodes", id];
    checkStyle(node.style, [...path, "style"]);
    checkNode(doc, node, path, add);
    if (node.type === "link") {
      // A link inside a link is invalid HTML (nested interactive content).
      const stack = [...node.children];
      while (stack.length) {
        const child = doc.nodes[stack.pop() as string];
        if (!child) continue;
        if (child.type === "link")
          add([...path, "children"], `Link "${id}" contains another link "${child.id}"`);
        stack.push(...childrenOf(child));
      }
    }
    if (node.type === "instance") {
      for (const [nodeId, o] of Object.entries(node.overrides.nodes)) {
        if (o.style) checkStyle(o.style, [...path, "overrides", "nodes", nodeId, "style"]);
      }
    }
  }

  // Components
  const componentNames = new Set<string>();
  for (const [id, c] of Object.entries(doc.components)) {
    const path = ["components", id];
    const lower = c.name.toLowerCase();
    if (componentNames.has(lower)) add([...path, "name"], `Duplicate component name "${c.name}"`);
    componentNames.add(lower);
    const inTree = (nodeId: string) => owner.get(nodeId) === `component:${id}`;
    const propNames = new Set<string>();
    c.props.forEach((p, i) => {
      if (propNames.has(p.name)) add([...path, "props", i, "name"], `Duplicate prop "${p.name}"`);
      propNames.add(p.name);
      if (!inTree(p.target.nodeId))
        add([...path, "props", i, "target"], `Node "${p.target.nodeId}" is not in this component`);
      const target = doc.nodes[p.target.nodeId];
      const fits = { text: "content", image: "assetId", link: "href", boolean: "visible" } as const;
      if (fits[p.type] !== p.target.field)
        add(
          [...path, "props", i, "target", "field"],
          `A ${p.type} prop must target "${fits[p.type]}"`,
        );
      if (target && !propTargetFits(target, p.target.field))
        add(
          [...path, "props", i, "target"],
          `A ${target.type} node has no "${p.target.field}" field`,
        );
      if (!propValueFits(p.type, p.default))
        add([...path, "props", i, "default"], `Default does not match prop type ${p.type}`);
    });
    const variantNames = new Set<string>();
    c.variantProps.forEach((vp, i) => {
      if (variantNames.has(vp.name) || propNames.has(vp.name))
        add([...path, "variantProps", i, "name"], `Duplicate prop "${vp.name}"`);
      variantNames.add(vp.name);
      if (new Set(vp.values).size !== vp.values.length)
        add([...path, "variantProps", i, "values"], "Duplicate variant value");
      if (!vp.values.includes(vp.default))
        add([...path, "variantProps", i, "default"], `"${vp.default}" is not one of the values`);
    });
    for (const [key, overrides] of Object.entries(c.variants)) {
      const vpath = [...path, "variants", key];
      if (!variantKeyValid(c, key)) add(vpath, `Invalid variant key "${key}"`);
      for (const [nodeId, style] of Object.entries(overrides)) {
        if (!inTree(nodeId)) add([...vpath, nodeId], `Node "${nodeId}" is not in this component`);
        checkStyle(style, [...vpath, nodeId]);
      }
    }
  }

  // Instances: component exists, overrides fit it, and no component contains itself.
  const uses = new Map<string, Set<string>>(); // component id → components its tree instantiates
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type !== "instance") continue;
    const path = ["nodes", id];
    const c = doc.components[node.componentId];
    if (!c) {
      add([...path, "componentId"], `Unknown component "${node.componentId}"`);
      continue;
    }
    const tree = owner.get(id);
    if (tree?.startsWith("component:")) {
      const from = tree.slice("component:".length);
      if (!uses.has(from)) uses.set(from, new Set());
      uses.get(from)?.add(c.id);
    }
    for (const [name, value] of Object.entries(node.overrides.variant)) {
      const vp = c.variantProps.find((p) => p.name === name);
      if (!vp) add([...path, "overrides", "variant", name], `Unknown variant prop "${name}"`);
      else if (!vp.values.includes(value))
        add([...path, "overrides", "variant", name], `"${value}" is not a value of ${name}`);
    }
    for (const [name, value] of Object.entries(node.overrides.props)) {
      const p = c.props.find((q) => q.name === name);
      if (!p) add([...path, "overrides", "props", name], `Unknown prop "${name}"`);
      else if (!propValueFits(p.type, value))
        add([...path, "overrides", "props", name], `Value does not match prop type ${p.type}`);
    }
    for (const nodeId of Object.keys(node.overrides.nodes)) {
      if (owner.get(nodeId) !== `component:${c.id}`)
        add(
          [...path, "overrides", "nodes", nodeId],
          `Node "${nodeId}" is not in component "${c.id}"`,
        );
    }
  }
  const cycle = findCycle(uses);
  if (cycle)
    add(["components", cycle[0] as string], `Component contains itself: ${cycle.join(" → ")}`);

  // Variables
  const cssNames = new Set<string>();
  for (const [id, v] of Object.entries(doc.variables)) {
    if (cssNames.has(v.cssName))
      add(["variables", id, "cssName"], `Duplicate CSS name "${v.cssName}"`);
    cssNames.add(v.cssName);
  }

  return issues;
}

function checkNode(
  doc: ProjectDocument,
  node: Node,
  path: Issue["path"],
  add: (p: Issue["path"], m: string) => void,
) {
  if (node.type === "image" && node.assetId !== null && !doc.assets[node.assetId])
    add([...path, "assetId"], `Unknown asset "${node.assetId}"`);
  if (
    node.type === "link" &&
    node.target.type === "page" &&
    !doc.pages.some((p) => p.id === (node.target as { pageId: string }).pageId)
  )
    add([...path, "target", "pageId"], `Unknown page "${node.target.pageId}"`);
  if (node.type === "instance") {
    for (const [nodeId, o] of Object.entries(node.overrides.nodes)) {
      if (o.assetId && !doc.assets[o.assetId])
        add([...path, "overrides", "nodes", nodeId, "assetId"], `Unknown asset "${o.assetId}"`);
    }
  }
}

function propTargetFits(node: Node, field: "content" | "assetId" | "href" | "visible"): boolean {
  switch (field) {
    case "content":
      return node.type === "text";
    case "assetId":
      return node.type === "image";
    case "href":
      return node.type === "link";
    case "visible":
      return true;
  }
}

function propValueFits(type: "text" | "image" | "link" | "boolean", value: unknown): boolean {
  switch (type) {
    case "text":
      return typeof value === "string";
    case "image":
      return value === null || (typeof value === "string" && idSchema.safeParse(value).success);
    case "link":
      return typeof value === "string" && hrefSchema.safeParse(value).success;
    case "boolean":
      return typeof value === "boolean";
  }
}

/** "size=large,tone=dark": every variant prop exactly once, in declaration order. */
function variantKeyValid(c: Component, key: string): boolean {
  const parts = key.split(",");
  if (parts.length !== c.variantProps.length) return false;
  return c.variantProps.every((vp, i) => {
    const [name, value] = (parts[i] ?? "").split("=");
    return name === vp.name && value !== undefined && vp.values.includes(value);
  });
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    if (state.get(n) === "done") return null;
    if (state.get(n) === "visiting") return [...stack.slice(stack.indexOf(n)), n];
    state.set(n, "visiting");
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      const c = visit(m);
      if (c) return c;
    }
    stack.pop();
    state.set(n, "done");
    return null;
  };
  for (const n of [...graph.keys()].sort()) {
    const c = visit(n);
    if (c) return c;
  }
  return null;
}

export type VariableType = VariableKind;
