/**
 * Components (PRD F11, F29) as pure functions: create from a layer, place and detach
 * instances, exposed props, variant properties, variant styles and instance overrides. Every
 * action is one transaction built from the component ops (`addComponent`, `updateComponent`,
 * `deleteComponent`) and node ops.
 */
import {
  BREAKPOINT_IDS,
  type BreakpointId,
  type Component,
  childrenOf,
  type InstanceNode,
  type Node,
  type ProjectDocument,
  type Props,
  type StyleOverride,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { parentMap } from "./tree.ts";

export type PropType = Component["props"][number]["type"];
export type PropField = Component["props"][number]["target"]["field"];

/** "hero card" → "HeroCard", always a valid, unique component name. */
export function componentName(doc: ProjectDocument, raw: string, exceptId?: string): string {
  const words = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words.map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1)).join("") || "Component";
  if (!/^[A-Z]/.test(base)) base = `C${base}`;
  base = base.slice(0, 60);
  const taken = new Set(
    Object.values(doc.components)
      .filter((c) => c.id !== exceptId)
      .map((c) => c.name.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

/** A prop name in camelCase, unique among the component's props and variant props. */
export function propName(c: Component, raw: string): string {
  const words = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base =
    words
      .map((w, i) => (i === 0 ? w.toLowerCase() : (w[0]?.toUpperCase() ?? "") + w.slice(1)))
      .join("") || "prop";
  if (!/^[a-z]/.test(base)) base = `p${base}`;
  base = base.slice(0, 60);
  const taken = new Set([...c.props.map((p) => p.name), ...c.variantProps.map((p) => p.name)]);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

function subtree(doc: ProjectDocument, rootId: string): Node[] {
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

/** The component a node belongs to (its tree), if any. */
export function componentOf(doc: ProjectDocument, nodeId: string): Component | undefined {
  const parents = parentMap(doc);
  let id = nodeId;
  for (let p = parents.get(id); p; p = parents.get(id)) id = p;
  return Object.values(doc.components).find((c) => c.root === id);
}

export function instancesOf(doc: ProjectDocument, componentId: string): InstanceNode[] {
  return Object.values(doc.nodes).filter(
    (n): n is InstanceNode => n.type === "instance" && n.componentId === componentId,
  );
}

const INSTANCE_TAGS = new Set<string>([
  "div",
  "section",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "article",
  "li",
]);

/**
 * Turns a layer into a component and puts an instance in its place, in one transaction. The
 * layer keeps its id and becomes the component's root; the instance starts with no style of
 * its own, so it takes its size and position from the root (outer slots) like any instance.
 */
export function createComponentOps(
  doc: ProjectDocument,
  nodeId: string,
  ids: { component: string; instance: string },
): { ok: true; ops: Op[] } | { ok: false; message: string } {
  const node = doc.nodes[nodeId];
  const parent = parentMap(doc).get(nodeId);
  if (!node || !parent) return { ok: false, message: "Select a layer inside the page first." };
  if (Object.values(doc.components).some((c) => c.root === nodeId))
    return { ok: false, message: "This layer is already a component." };
  if (node.type === "instance")
    return { ok: false, message: "This layer is already an instance of a component." };
  const parentNode = doc.nodes[parent] as Node;
  const index = childrenOf(parentNode).indexOf(nodeId);
  const component: Component = {
    id: ids.component,
    name: componentName(doc, node.name || node.type),
    root: nodeId,
    props: [],
    variantProps: [],
    variants: {},
  };
  const instance: InstanceNode = {
    id: ids.instance,
    type: "instance",
    name: node.name || component.name,
    tag: INSTANCE_TAGS.has(node.tag) ? (node.tag as InstanceNode["tag"]) : "div",
    style: { desktop: {} },
    componentId: ids.component,
    overrides: { variant: {}, props: {}, nodes: {} },
  };
  return {
    ok: true,
    ops: [
      { op: "deleteNode", nodeId },
      { op: "addComponent", component, nodes: subtree(doc, nodeId) },
      { op: "insertNodes", parentId: parent, index, nodes: [instance] },
    ],
  };
}

export function newInstance(c: Component, id: string): InstanceNode {
  return {
    id,
    type: "instance",
    name: c.name,
    tag: "div",
    style: { desktop: {} },
    componentId: c.id,
    overrides: { variant: {}, props: {}, nodes: {} },
  };
}

/** "size=large,tone=dark" for the instance's chosen (or default) values. */
export function variantKey(c: Component, selected: Record<string, string>): string {
  return c.variantProps.map((vp) => `${vp.name}=${selected[vp.name] ?? vp.default}`).join(",");
}

export function defaultVariantKey(c: Component): string {
  return variantKey(c, {});
}

function mergeStyle<T extends StyleOverride>(base: T, over: StyleOverride | undefined): T {
  if (!over) return base;
  const out = structuredClone(base) as Record<BreakpointId, Props | undefined>;
  for (const bp of BREAKPOINT_IDS) {
    const o = over[bp];
    if (o) out[bp] = { ...(out[bp] ?? {}), ...o };
  }
  return out as T;
}

/**
 * Replaces an instance with a plain copy of its component's layers (new ids), with the
 * instance's variant, prop values and overrides applied, in one transaction.
 */
export function detachOps(
  doc: ProjectDocument,
  instanceId: string,
  newId: () => string,
): { ops: Op[]; rootId: string } | null {
  const inst = doc.nodes[instanceId];
  if (inst?.type !== "instance") return null;
  const c = doc.components[inst.componentId];
  const parent = parentMap(doc).get(instanceId);
  if (!c || !parent) return null;
  const index = childrenOf(doc.nodes[parent] as Node).indexOf(instanceId);
  const variant = c.variants[variantKey(c, inst.overrides.variant)] ?? {};
  const ids = new Map(subtree(doc, c.root).map((n) => [n.id, newId()]));
  const props = new Map<string, Record<string, unknown>>();
  for (const p of c.props) {
    const value = Object.hasOwn(inst.overrides.props, p.name)
      ? inst.overrides.props[p.name]
      : p.default;
    const o = props.get(p.target.nodeId) ?? {};
    o[p.target.field] = value;
    props.set(p.target.nodeId, o);
  }
  const nodes = subtree(doc, c.root).map((orig) => {
    const n = structuredClone(orig) as Node & Record<string, unknown>;
    n.id = ids.get(orig.id) as string;
    if ("children" in n) n.children = (n.children as string[]).map((id) => ids.get(id) as string);
    n.style = mergeStyle(n.style, variant[orig.id]);
    const p = props.get(orig.id) ?? {};
    if (typeof p.content === "string" && n.type === "text") n.content = [{ text: p.content }];
    if (p.assetId !== undefined && n.type === "image") n.assetId = p.assetId as string | null;
    if (typeof p.href === "string" && n.type === "link") n.target = { type: "url", href: p.href };
    if (p.visible === false) n.hidden = { desktop: true };
    const o = inst.overrides.nodes[orig.id];
    if (o) {
      n.style = mergeStyle(n.style, o.style);
      if (o.content && n.type === "text") n.content = o.content;
      if (o.assetId !== undefined && n.type === "image") n.assetId = o.assetId;
      if (o.alt !== undefined && n.type === "image") n.alt = o.alt;
      if (o.hidden) n.hidden = { ...n.hidden, ...o.hidden };
    }
    if (orig.id === c.root) {
      n.style = mergeStyle(n.style, inst.style);
      n.name = inst.name || n.name;
      if (inst.hidden) n.hidden = { ...n.hidden, ...inst.hidden };
    }
    return n as Node;
  });
  return {
    ops: [
      { op: "deleteNode", nodeId: instanceId },
      { op: "insertNodes", parentId: parent, index, nodes },
    ],
    rootId: ids.get(c.root) as string,
  };
}

/** Detaches every instance, then deletes the component: one transaction. */
export function deleteComponentOps(
  doc: ProjectDocument,
  componentId: string,
  newId: () => string,
): Op[] {
  const ops: Op[] = [];
  // Instances inside other components' trees and on pages alike.
  for (const inst of instancesOf(doc, componentId)) {
    const r = detachOps(doc, inst.id, newId);
    if (r) ops.push(...r.ops);
  }
  ops.push({ op: "deleteComponent", componentId });
  return ops;
}

export function renameComponentOps(doc: ProjectDocument, id: string, raw: string): Op[] {
  return [
    { op: "updateComponent", componentId: id, fields: { name: componentName(doc, raw, id) } },
  ];
}

// ——— Exposed props ———

/** Which field of a layer can become a prop, with its type and current value. */
export function exposable(node: Node): { field: PropField; type: PropType; label: string }[] {
  const out: { field: PropField; type: PropType; label: string }[] = [];
  if (node.type === "text") out.push({ field: "content", type: "text", label: "Text" });
  if (node.type === "image") out.push({ field: "assetId", type: "image", label: "Image" });
  if (node.type === "link") out.push({ field: "href", type: "link", label: "Link" });
  out.push({ field: "visible", type: "boolean", label: "Visibility" });
  return out;
}

function currentValue(node: Node, field: PropField): string | boolean | null {
  switch (field) {
    case "content":
      return node.type === "text" ? node.content.map((s) => s.text).join("") : "";
    case "assetId":
      return node.type === "image" ? node.assetId : null;
    case "href":
      return node.type === "link" && node.target.type === "url" ? node.target.href : "/";
    case "visible":
      return true;
  }
}

export function exposePropOps(
  doc: ProjectDocument,
  componentId: string,
  nodeId: string,
  field: PropField,
  name?: string,
): Op[] {
  const c = doc.components[componentId];
  const node = doc.nodes[nodeId];
  const kind = node && exposable(node).find((e) => e.field === field);
  if (!c || !node || !kind) return [];
  const prop = {
    name: propName(c, name ?? (node.name || kind.label)),
    type: kind.type,
    default: currentValue(node, field),
    target: { nodeId, field },
  };
  return [{ op: "updateComponent", componentId, fields: { props: [...c.props, prop] } }];
}

/** Removes a prop; instances drop their value for it in the same transaction. */
export function removePropOps(doc: ProjectDocument, componentId: string, name: string): Op[] {
  const c = doc.components[componentId];
  if (!c) return [];
  const ops: Op[] = instancesOf(doc, componentId)
    .filter((i) => Object.hasOwn(i.overrides.props, name))
    .map((i) => ({ op: "setInstanceOverride", nodeId: i.id, kind: "props", key: name }));
  ops.push({
    op: "updateComponent",
    componentId,
    fields: { props: c.props.filter((p) => p.name !== name) },
  });
  return ops;
}

// ——— Variants ———

function slug(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parses "Small, Large" into variant values. */
export function parseValues(raw: string): string[] {
  return [...new Set(raw.split(",").map(slug).filter(Boolean))].slice(0, 20);
}

/**
 * Re-keys the variant styles after the variant props change: keeps the styles of every
 * combination that still exists (props still there, values still allowed).
 */
function rekey(c: Component, next: Component["variantProps"]): Component["variants"] {
  const out: Component["variants"] = {};
  for (const [key, styles] of Object.entries(c.variants)) {
    const parts = Object.fromEntries(key.split(",").map((p) => p.split("=") as [string, string]));
    const values = next.map((vp) => {
      const v = parts[vp.name] ?? vp.default;
      return vp.values.includes(v) ? `${vp.name}=${v}` : null;
    });
    if (values.some((v) => v === null)) continue;
    // A removed prop keeps only the styles of its default value.
    const removed = c.variantProps.filter((vp) => !next.some((n) => n.name === vp.name));
    if (removed.some((vp) => parts[vp.name] !== vp.default)) continue;
    out[values.join(",")] = styles;
  }
  return out;
}

export function setVariantPropsOps(
  doc: ProjectDocument,
  componentId: string,
  next: Component["variantProps"],
): Op[] {
  const c = doc.components[componentId];
  if (!c) return [];
  const ops: Op[] = [];
  // Instances whose chosen value no longer exists fall back to the default.
  for (const inst of instancesOf(doc, componentId))
    for (const [name, value] of Object.entries(inst.overrides.variant)) {
      const vp = next.find((p) => p.name === name);
      const keep = vp?.values.includes(value) && vp.default !== value;
      if (!keep)
        ops.push({ op: "setInstanceOverride", nodeId: inst.id, kind: "variant", key: name });
    }
  ops.push({
    op: "updateComponent",
    componentId,
    fields: { variantProps: next, variants: rekey(c, next) },
  });
  return ops;
}

export function addVariantPropOps(
  doc: ProjectDocument,
  componentId: string,
  rawName: string,
  rawValues: string,
): { ok: true; ops: Op[] } | { ok: false; message: string } {
  const c = doc.components[componentId];
  if (!c) return { ok: false, message: "No such component." };
  const values = parseValues(rawValues);
  if (values.length < 1)
    return { ok: false, message: "List at least one value, e.g. small, large." };
  const name = propName(c, rawName || "variant");
  return {
    ok: true,
    ops: setVariantPropsOps(doc, componentId, [
      ...c.variantProps,
      { name, values, default: values[0] as string },
    ]),
  };
}

/**
 * While a non-default variant is being edited, style edits to the component's layers become
 * variant overrides instead of changes to the layers. Other ops pass through.
 */
export function routeToVariant(
  doc: ProjectDocument,
  componentId: string,
  key: string,
  ops: readonly Op[],
): Op[] {
  const c = doc.components[componentId];
  if (!c || key === defaultVariantKey(c)) return [...ops];
  const inTree = new Set(subtree(doc, c.root).map((n) => n.id));
  const variants = structuredClone(c.variants);
  variants[key] ??= {};
  const styles = variants[key];
  const out: Op[] = [];
  let changed = false;
  for (const op of ops) {
    if ((op.op === "setProp" || op.op === "resetProp") && inTree.has(op.nodeId)) {
      styles[op.nodeId] ??= {};
      const s = styles[op.nodeId] as Record<BreakpointId, Record<string, unknown>>;
      s[op.breakpoint] ??= {};
      const props = s[op.breakpoint] as Record<string, unknown>;
      if (op.op === "setProp") props[op.key] = op.value;
      else delete props[op.key];
      if (Object.keys(props).length === 0) delete s[op.breakpoint];
      if (Object.keys(s).length === 0) delete styles[op.nodeId];
      changed = true;
    } else out.push(op);
  }
  if (Object.keys(styles).length === 0) delete variants[key];
  if (changed) out.push({ op: "updateComponent", componentId, fields: { variants } });
  return out;
}

/** The component's layers as a variant shows them (for the canvas while editing it). */
export function withVariant(
  doc: ProjectDocument,
  componentId: string,
  key: string,
): ProjectDocument {
  const c = doc.components[componentId];
  const styles = c?.variants[key];
  if (!c || !styles) return doc;
  const next = { ...doc, nodes: { ...doc.nodes } };
  for (const [id, s] of Object.entries(styles)) {
    const n = doc.nodes[id];
    if (n) next.nodes[id] = { ...n, style: mergeStyle(n.style, s) } as Node;
  }
  return next;
}

// ——— Instance overrides ———

/** Sets (or clears, at the default) one variant value of an instance. */
export function setVariantOps(c: Component, inst: InstanceNode, name: string, value: string): Op[] {
  const vp = c.variantProps.find((p) => p.name === name);
  if (!vp) return [];
  return [
    value === vp.default
      ? { op: "setInstanceOverride", nodeId: inst.id, kind: "variant", key: name }
      : { op: "setInstanceOverride", nodeId: inst.id, kind: "variant", key: name, value },
  ];
}

/** Sets a prop value of an instance; the component's default clears the override. */
export function setPropValueOps(
  c: Component,
  inst: InstanceNode,
  name: string,
  value: string | boolean | null,
): Op[] {
  const p = c.props.find((x) => x.name === name);
  if (!p) return [];
  return [
    value === p.default
      ? { op: "setInstanceOverride", nodeId: inst.id, kind: "props", key: name }
      : { op: "setInstanceOverride", nodeId: inst.id, kind: "props", key: name, value },
  ];
}

export function isInstanceOverridden(inst: InstanceNode): boolean {
  const o = inst.overrides;
  return (
    Object.keys(o.variant).length + Object.keys(o.props).length + Object.keys(o.nodes).length > 0
  );
}

/** Reset override: every variant choice, prop value and layer override back to the main's. */
export function resetOverridesOps(inst: InstanceNode): Op[] {
  const ops: Op[] = [];
  for (const kind of ["variant", "props", "nodes"] as const)
    for (const key of Object.keys(inst.overrides[kind]))
      ops.push({ op: "setInstanceOverride", nodeId: inst.id, kind, key });
  return ops;
}

/** Text of a layer inside the instance: overrides set it per layer (narrowest override). */
export function setLayerTextOps(inst: InstanceNode, nodeId: string, text: string | null): Op[] {
  const o = { ...(inst.overrides.nodes[nodeId] ?? {}) };
  if (text === null) delete o.content;
  else o.content = [{ text }];
  return [
    Object.keys(o).length
      ? { op: "setInstanceOverride", nodeId: inst.id, kind: "nodes", key: nodeId, value: o }
      : { op: "setInstanceOverride", nodeId: inst.id, kind: "nodes", key: nodeId },
  ];
}

/** Hides or shows a layer inside the instance (an override of that layer only). */
export function setLayerHiddenOps(inst: InstanceNode, nodeId: string, hidden: boolean): Op[] {
  const o = { ...(inst.overrides.nodes[nodeId] ?? {}) };
  if (hidden) o.hidden = { desktop: true };
  else delete o.hidden;
  return [
    Object.keys(o).length
      ? { op: "setInstanceOverride", nodeId: inst.id, kind: "nodes", key: nodeId, value: o }
      : { op: "setInstanceOverride", nodeId: inst.id, kind: "nodes", key: nodeId },
  ];
}

export const MAIN_PAGE_ID = "__main-component";
/** The frame the main component sits in on the canvas; it exists only in the view. */
export const MAIN_BODY_ID = "__main-body";

/** Components whose trees contain an instance of `componentId`, directly or through others. */
function usersOf(doc: ProjectDocument, componentId: string): Set<string> {
  const users = new Set<string>([componentId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of Object.values(doc.components)) {
      if (users.has(c.id)) continue;
      if (subtree(doc, c.root).some((n) => n.type === "instance" && users.has(n.componentId))) {
        users.add(c.id);
        grew = true;
      }
    }
  }
  return users;
}

/**
 * The document the canvas shows while a main component is edited: the component's layers (in
 * the chosen variant) inside the body of a single page, so they render, hit-test, select and
 * compile like page layers. The body exists only in this view. Components that use this one
 * are left out (they can't be drawn without it).
 */
export function mainComponentView(
  doc: ProjectDocument,
  componentId: string,
  key: string,
): ProjectDocument | null {
  const c = doc.components[componentId];
  if (!c) return null;
  const base = withVariant(doc, componentId, key);
  const users = usersOf(doc, componentId);
  return {
    ...base,
    pages: [
      {
        id: MAIN_PAGE_ID,
        name: c.name,
        path: "/",
        seo: { title: c.name, description: "", ogImage: null, noindex: true },
        root: MAIN_BODY_ID,
      },
    ],
    nodes: {
      ...base.nodes,
      [MAIN_BODY_ID]: {
        id: MAIN_BODY_ID,
        type: "frame",
        name: c.name,
        tag: "div",
        style: {
          desktop: {
            display: "stack",
            direction: "column",
            align: "start",
            width: { type: "fill" },
            height: { type: "fit" },
          },
        },
        children: [c.root],
      },
    },
    components: Object.fromEntries(Object.entries(doc.components).filter(([id]) => !users.has(id))),
  };
}
