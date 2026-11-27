/**
 * Variables panel logic (PRD F12, F29) as pure functions: CSS names, usage counts, the ops for
 * create, edit, duplicate and delete, and the generated-code preview. A delete first detaches
 * every use (the layers keep the value they showed at every breakpoint) and then removes the
 * variable, all in one transaction.
 */
import {
  activeBreakpoints,
  BREAKPOINT_IDS,
  type BreakpointId,
  type ProjectDocument,
  type PropKey,
  type Props,
  type StyleOverride,
  type Variable,
  varRefsInProps,
} from "@truframe/model";
import type { Op } from "@truframe/ops";

export type VariableType = Variable["type"];
export type FontValue = Extract<Variable, { type: "font" }>["value"]["desktop"];
export type VariableValue<T extends VariableType = VariableType> = Extract<
  Variable,
  { type: T }
>["value"]["desktop"];

export const VARIABLE_TABS: { type: VariableType; label: string }[] = [
  { type: "color", label: "Colors" },
  { type: "spacing", label: "Spacing" },
  { type: "font", label: "Font" },
];

export const TYPE_LABELS: Record<VariableType, string> = {
  color: "Color",
  spacing: "Spacing",
  font: "Font",
};

/** Lowercase ASCII words joined by dashes, like the compiler's `names::kebab`. */
export function kebab(s: string): string {
  let out = "";
  let prevLowerOrDigit = false;
  for (const c of s.normalize("NFKD")) {
    if (/^[A-Za-z0-9]$/.test(c)) {
      // "HeroSection" → "hero-section"
      if (/[A-Z]/.test(c) && prevLowerOrDigit && !out.endsWith("-")) out += "-";
      out += c.toLowerCase();
      prevLowerOrDigit = /[a-z0-9]/.test(c);
    } else {
      if (/^[̀-ͯ]$/.test(c)) continue;
      if (out && !out.endsWith("-")) out += "-";
      prevLowerOrDigit = false;
    }
  }
  return out.replace(/-+$/, "");
}

/** `--<group>-<name>` (ARCHITECTURE §5), always a valid custom property name. */
export function cssNameFor(group: string, name: string): string {
  let slug = [kebab(group), kebab(name)].filter(Boolean).join("-") || "variable";
  if (!/^[a-z]/.test(slug)) slug = `v-${slug}`;
  return `--${slug}`;
}

/** The CSS name for a variable, numbered (`-2`, `-3`) when another variable already has it. */
export function uniqueCssName(
  doc: ProjectDocument,
  group: string,
  name: string,
  exceptId?: string,
): string {
  const taken = new Set(
    Object.values(doc.variables)
      .filter((v) => v.id !== exceptId)
      .map((v) => v.cssName),
  );
  const base = cssNameFor(group, name);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** A variable's value at a breakpoint after the desktop → tablet → mobile cascade. */
export function valueAt<V extends Variable>(
  doc: ProjectDocument,
  v: V,
  bp: BreakpointId,
): V["value"]["desktop"] {
  let value: V["value"]["desktop"] = v.value.desktop;
  for (const b of activeBreakpoints(doc.breakpoints)) {
    value = (v.value[b] as V["value"]["desktop"] | undefined) ?? value;
    if (b === bp) break;
  }
  return value;
}

function stylesOf(doc: ProjectDocument): { style: StyleOverride; place: string }[] {
  const out: { style: StyleOverride; place: string }[] = [];
  for (const node of Object.values(doc.nodes)) {
    out.push({ style: node.style, place: `node:${node.id}` });
    if (node.type === "instance")
      for (const [nodeId, o] of Object.entries(node.overrides.nodes))
        if (o.style) out.push({ style: o.style, place: `override:${node.id}/${nodeId}` });
  }
  for (const c of Object.values(doc.components))
    for (const [key, overrides] of Object.entries(c.variants))
      for (const [nodeId, style] of Object.entries(overrides))
        out.push({ style, place: `variant:${c.id}/${key}/${nodeId}` });
  return out;
}

/** How many layers (and instance or variant overrides) use each variable. */
export function usageCounts(doc: ProjectDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { style } of stylesOf(doc)) {
    const used = new Set<string>();
    for (const bp of BREAKPOINT_IDS) {
      const props = style[bp];
      if (props) for (const ref of varRefsInProps(props)) used.add(ref.var);
    }
    for (const id of used) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function usageLabel(n: number): string {
  return n === 0 ? "Not used" : n === 1 ? "Used in 1 place" : `Used in ${n} places`;
}

export type VariableDraft<T extends VariableType = VariableType> = {
  type: T;
  name: string;
  group: string;
  value: {
    desktop: VariableValue<T>;
    tablet?: VariableValue<T>;
    mobile?: VariableValue<T>;
  };
};

export function defaultValue<T extends VariableType>(type: T): VariableValue<T> {
  const values: { [K in VariableType]: VariableValue<K> } = {
    color: "#2563eb",
    spacing: 16,
    font: { family: "Inter", weight: 400, size: 16, lineHeight: 1.5, letterSpacing: 0 },
  };
  return values[type] as VariableValue<T>;
}

export function checkDraft(draft: VariableDraft): string | null {
  if (!draft.name.trim()) return "Give the variable a name.";
  if (draft.name.length > 100) return "Use a name of 100 characters or fewer.";
  if (draft.group.length > 100) return "Use a group of 100 characters or fewer.";
  return null;
}

function toVariable(id: string, draft: VariableDraft, cssName: string): Variable {
  const value: Record<string, unknown> = { desktop: draft.value.desktop };
  // Tablet and Mobile follow Desktop until set; a value equal to the one above adds nothing.
  for (const bp of ["tablet", "mobile"] as const) {
    const v = draft.value[bp];
    if (v !== undefined) value[bp] = v;
  }
  return {
    id,
    type: draft.type,
    name: draft.name.trim(),
    group: draft.group.trim(),
    cssName,
    value,
  } as Variable;
}

export function createVariableOps(
  doc: ProjectDocument,
  draft: VariableDraft,
  id: string,
): { ops: Op[]; variable: Variable } {
  const variable = toVariable(id, draft, uniqueCssName(doc, draft.group, draft.name));
  return { ops: [{ op: "upsertVariable", variable }], variable };
}

/** Saves an edited variable. Renaming or regrouping it renames its CSS custom property. */
export function updateVariableOps(doc: ProjectDocument, id: string, draft: VariableDraft): Op[] {
  const old = doc.variables[id];
  if (!old) return [];
  const renamed = old.name !== draft.name.trim() || old.group !== draft.group.trim();
  const cssName = renamed ? uniqueCssName(doc, draft.group, draft.name, id) : old.cssName;
  return [
    { op: "upsertVariable", variable: toVariable(id, { ...draft, type: old.type }, cssName) },
  ];
}

export function draftOf(v: Variable): VariableDraft {
  return {
    type: v.type,
    name: v.name,
    group: v.group,
    value: structuredClone(v.value),
  } as VariableDraft;
}

/** "Accent" → "Accent copy", "Accent copy 2", … */
export function duplicateVariableOps(
  doc: ProjectDocument,
  id: string,
  newVariableId: string,
): { ops: Op[]; id: string } {
  const v = doc.variables[id];
  if (!v) return { ops: [], id };
  const names = new Set(Object.values(doc.variables).map((x) => `${x.group}\u0000${x.name}`));
  let name = `${v.name} copy`;
  for (let i = 2; names.has(`${v.group}\u0000${name}`); i++) name = `${v.name} copy ${i}`;
  return {
    ops: createVariableOps(doc, { ...draftOf(v), name }, newVariableId).ops,
    id: newVariableId,
  };
}

// ——— Delete (detach every use, then remove) ———

const FONT_PARTS = [
  ["fontFamily", "family"],
  ["fontWeight", "weight"],
  ["fontSize", "size"],
  ["lineHeight", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
] as const satisfies readonly (readonly [PropKey, keyof FontValue])[];

/** `value` with every `{ var: id }` inside it replaced by `literal`. */
function replaceRef(value: unknown, id: string, literal: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => replaceRef(v, id, literal));
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Object.keys(o).length === 1 && o.var === id) return literal;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, replaceRef(v, id, literal)]));
  }
  return value;
}

function refersTo(value: unknown, id: string): boolean {
  if (Array.isArray(value)) return value.some((v) => refersTo(v, id));
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.var === id && Object.keys(o).length === 1) return true;
    return Object.values(o).some((v) => refersTo(v, id));
  }
  return false;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The props to write so a style shows, at every breakpoint, the literal values the variable
 * gave it. Per-breakpoint variable values become per-breakpoint overrides where the layer had
 * none.
 */
function detachStyle(
  doc: ProjectDocument,
  style: StyleOverride,
  v: Variable,
): { bp: BreakpointId; key: PropKey; value: unknown }[] {
  const writes: { bp: BreakpointId; key: PropKey; value: unknown }[] = [];
  const next: Record<BreakpointId, Record<string, unknown>> = {
    desktop: { ...style.desktop },
    tablet: { ...style.tablet },
    mobile: { ...style.mobile },
  };
  const write = (bp: BreakpointId, key: PropKey, value: unknown) => {
    writes.push({ bp, key, value });
    if (value === undefined) delete next[bp][key];
    else next[bp][key] = value;
  };
  const active = activeBreakpoints(doc.breakpoints);
  const order = [...active, ...BREAKPOINT_IDS.filter((b) => !active.includes(b))];
  const cascaded = (
    s: Record<BreakpointId, Props | Record<string, unknown> | undefined>,
    bp: BreakpointId,
    key: PropKey,
  ) => {
    if (!active.includes(bp)) return s[bp]?.[key as keyof typeof s.desktop];
    let out: unknown;
    for (const b of active) {
      const x = s[b]?.[key as keyof typeof s.desktop];
      if (x !== undefined) out = x;
      if (b === bp) break;
    }
    return out;
  };
  const orig = style as Record<BreakpointId, Props | undefined>;

  if (v.type === "font") {
    for (const bp of order) {
      if (!refersTo(cascaded(orig, bp, "font"), v.id)) continue;
      const fv = valueAt(doc, v, bp);
      for (const [key, part] of FONT_PARTS) {
        const own = cascaded(orig, bp, key);
        const want = own ?? fv[part];
        if (!same(cascaded(next, bp, key), want)) write(bp, key, want);
      }
    }
    for (const bp of BREAKPOINT_IDS)
      if (refersTo(style[bp]?.font, v.id)) write(bp, "font", undefined);
    return writes;
  }

  const keys = new Set<PropKey>();
  for (const bp of BREAKPOINT_IDS)
    for (const [k, x] of Object.entries(style[bp] ?? {}))
      if (refersTo(x, v.id)) keys.add(k as PropKey);
  for (const key of keys) {
    for (const bp of order) {
      const was = cascaded(orig, bp, key);
      if (!refersTo(was, v.id)) continue;
      const want = replaceRef(was, v.id, valueAt(doc, v, bp));
      if (!same(cascaded(next, bp, key), want)) write(bp, key, want);
    }
  }
  return writes;
}

/** Detaches every use of the variable, then deletes it: one transaction, one undo step. */
export function deleteVariableOps(doc: ProjectDocument, id: string): Op[] {
  const v = doc.variables[id];
  if (!v) return [];
  const ops: Op[] = [];
  for (const node of Object.values(doc.nodes)) {
    for (const w of detachStyle(doc, node.style, v))
      ops.push(
        w.value === undefined
          ? { op: "resetProp", nodeId: node.id, breakpoint: w.bp, key: w.key }
          : { op: "setProp", nodeId: node.id, breakpoint: w.bp, key: w.key, value: w.value },
      );
    if (node.type !== "instance") continue;
    for (const [nodeId, o] of Object.entries(node.overrides.nodes)) {
      if (!o.style || !refersTo(o.style, id)) continue;
      const style: StyleOverride = structuredClone(o.style);
      for (const w of detachStyle(doc, o.style, v)) {
        style[w.bp] ??= {};
        const props = style[w.bp] as Record<string, unknown>;
        if (w.value === undefined) delete props[w.key];
        else props[w.key] = w.value;
      }
      ops.push({
        op: "setInstanceOverride",
        nodeId: node.id,
        kind: "nodes",
        key: nodeId,
        value: { ...o, style },
      });
    }
  }
  for (const c of Object.values(doc.components)) {
    if (!refersTo(c.variants, id)) continue;
    const variants = structuredClone(c.variants);
    for (const styles of Object.values(variants))
      for (const style of Object.values(styles)) {
        if (!refersTo(style, id)) continue;
        // detachStyle reads the original before this loop writes into the same object.
        for (const w of detachStyle(doc, structuredClone(style), v)) {
          style[w.bp] ??= {};
          const props = style[w.bp] as Record<string, unknown>;
          if (w.value === undefined) delete props[w.key];
          else props[w.key] = w.value;
        }
      }
    ops.push({ op: "updateComponent", componentId: c.id, fields: { variants } });
  }
  ops.push({ op: "deleteVariable", variableId: id });
  return ops;
}

// ——— Display ———

export function groupsOf(
  doc: ProjectDocument,
  type: VariableType,
  query = "",
): { group: string; variables: Variable[] }[] {
  const q = query.trim().toLowerCase();
  const vars = Object.values(doc.variables)
    .filter((v) => v.type === type)
    .filter(
      (v) =>
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.group.toLowerCase().includes(q) ||
        v.cssName.includes(q),
    )
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = new Map<string, Variable[]>();
  for (const v of vars) groups.set(v.group, [...(groups.get(v.group) ?? []), v]);
  return [...groups].map(([group, variables]) => ({ group, variables }));
}

export function groupNames(doc: ProjectDocument): string[] {
  return [
    ...new Set(
      Object.values(doc.variables)
        .map((v) => v.group)
        .filter(Boolean),
    ),
  ].sort();
}

const num = (n: number) => String(Math.round(n * 10_000) / 10_000);

export function formatValue(type: VariableType, value: VariableValue): string {
  if (type === "color") return (value as string).toUpperCase();
  if (type === "spacing") return `${num(value as number)}px`;
  const f = value as FontValue;
  return `${f.family} ${f.weight} · ${num(f.size)}/${num(f.lineHeight)}`;
}

function declarations(
  cssName: string,
  type: VariableType,
  value: VariableValue,
  base?: VariableValue,
) {
  if (type === "color") return [`${cssName}: ${value};`];
  if (type === "spacing") return [`${cssName}: ${num(value as number)}px;`];
  const f = value as FontValue;
  const b = base as FontValue | undefined;
  const out: string[] = [];
  if (!b || b.family !== f.family)
    out.push(`${cssName}-family: var(--tf-font-${kebab(f.family) || "custom"});`);
  if (!b || b.size !== f.size) out.push(`${cssName}-size: ${num(f.size)}px;`);
  if (!b || b.weight !== f.weight) out.push(`${cssName}-weight: ${f.weight};`);
  if (!b || b.lineHeight !== f.lineHeight)
    out.push(`${cssName}-line-height: ${num(f.lineHeight)};`);
  if (!b || b.letterSpacing !== f.letterSpacing)
    out.push(`${cssName}-letter-spacing: ${num(f.letterSpacing)}em;`);
  return out;
}

/**
 * The `tokens.css` lines this variable adds, in the compiler's format (checked against the
 * compiler in `variables.test.ts`).
 */
export function tokensPreview(doc: ProjectDocument, draft: VariableDraft, cssName: string): string {
  const { tablet: t, mobile: m } = doc.breakpoints;
  const d = draft.value.desktop;
  const tv = t ? draft.value.tablet : undefined;
  const tablet = tv !== undefined && !same(tv, d) ? tv : undefined;
  const above = tv ?? d;
  const mv = m ? draft.value.mobile : undefined;
  const mobile = mv !== undefined && !same(mv, above) ? mv : undefined;
  const lines = [":root {", ...declarations(cssName, draft.type, d).map((l) => `  ${l}`), "}"];
  const media = (q: string, decls: string[]) =>
    decls.length
      ? ["", `@media ${q} {`, "  :root {", ...decls.map((l) => `    ${l}`), "  }", "}"]
      : [];
  if (tablet !== undefined)
    lines.push(...media("(width < 1200px)", declarations(cssName, draft.type, tablet, d)));
  if (mobile !== undefined)
    lines.push(
      ...media(
        t ? `(width < ${t.width}px)` : "(width < 1200px)",
        declarations(cssName, draft.type, mobile, above),
      ),
    );
  const slug = cssName.slice(2);
  const theme =
    draft.type === "color"
      ? [`--color-${slug}: var(${cssName});`]
      : draft.type === "spacing"
        ? [`--spacing-${slug}: var(${cssName});`]
        : [
            `--font-${slug}: var(${cssName}-family);`,
            `--text-${slug}: var(${cssName}-size);`,
            `--text-${slug}--line-height: var(${cssName}-line-height);`,
            `--text-${slug}--letter-spacing: var(${cssName}-letter-spacing);`,
            `--text-${slug}--font-weight: var(${cssName}-weight);`,
          ];
  lines.push("", "@theme inline {", ...theme.map((l) => `  ${l}`), "}");
  return lines.join("\n");
}
