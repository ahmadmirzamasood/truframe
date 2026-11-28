"use client";

/**
 * Inspector sections for components (PRD F11, F29): Create component, the instance inspector
 * (Go to main component, Detach, Reset override, variant dropdowns, exposed properties, layer
 * overrides), the main component's own settings (name, variant properties, the variant being
 * edited, exposed properties) and "Expose as property" for a layer inside the main.
 */
import {
  type Component,
  childrenOf,
  type InstanceNode,
  type Node,
  newId,
  type ProjectDocument,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { Button } from "@truframe/ui/components/button";
import {
  ComponentIcon,
  CornerUpLeftIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  Unlink2Icon,
} from "lucide-react";
import { useState } from "react";
import {
  addVariantPropOps,
  defaultVariantKey,
  detachOps,
  exposable,
  exposePropOps,
  isInstanceOverridden,
  removePropOps,
  renameComponentOps,
  resetOverridesOps,
  setLayerHiddenOps,
  setLayerTextOps,
  setPropValueOps,
  setVariantOps,
  setVariantPropsOps,
  variantKey,
} from "../components.ts";
import { Row, Section, SelectField, TextField } from "./fields.tsx";

type Apply = (ops: Op[]) => void;

/** Actions the editor provides for components (its own state: which main is being edited). */
export type ComponentActions = {
  /** The real document (the canvas may show a view of the main component instead). */
  doc: ProjectDocument;
  create: (nodeId: string) => void;
  editMain: (componentId: string) => void;
  /** The main component being edited, and its variant. */
  editing: { component: Component; variantKey: string } | null;
  setVariantKey: (key: string) => void;
  done: () => void;
};

export function CreateComponent(props: { onCreate?: () => void }) {
  return (
    <div className="border-b px-3 py-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full"
        disabled={!props.onCreate}
        onClick={props.onCreate}
        title="Turn this layer into a reusable component"
      >
        <ComponentIcon />
        Create component
      </Button>
    </div>
  );
}

function OverrideDot(props: { label: string; onReset: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Reset ${props.label} override`}
      title="Overridden on this instance. Click to reset."
      onClick={props.onReset}
      className="group grid size-3.5 shrink-0 place-items-center"
    >
      <span className="size-1.5 rounded-full bg-red-500 group-hover:hidden" />
      <RotateCcwIcon className="hidden size-3 text-red-600 group-hover:block" />
    </button>
  );
}

/** Text layers and other layers inside a component, in tree order. */
function layersOf(doc: ProjectDocument, c: Component): Node[] {
  const out: Node[] = [];
  const stack = [c.root];
  while (stack.length) {
    const n = doc.nodes[stack.pop() as string];
    if (!n) continue;
    out.push(n);
    stack.push(...[...childrenOf(n)].reverse());
  }
  return out;
}

export function InstanceSections(props: {
  doc: ProjectDocument;
  inst: InstanceNode;
  apply: Apply;
  actions?: ComponentActions;
  onSelectionChange: (ids: string[]) => void;
}) {
  const { doc, inst, apply } = props;
  const c = doc.components[inst.componentId];
  if (!c) return null;
  const textLayers = layersOf(doc, c).filter((n) => n.type === "text");
  const exposed = new Set(c.props.map((p) => p.target.nodeId));
  return (
    <>
      <Section title="Component">
        <div className="grid grid-cols-3 gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={() => props.actions?.editMain(c.id)}
            disabled={!props.actions}
            title="Go to main component"
          >
            <CornerUpLeftIcon />
            Main
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              const r = detachOps(doc, inst.id, newId);
              if (!r) return;
              apply(r.ops);
              props.onSelectionChange([r.rootId]);
            }}
          >
            <Unlink2Icon />
            Detach
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!isInstanceOverridden(inst)}
            onClick={() => apply(resetOverridesOps(inst))}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </div>
      </Section>
      {c.variantProps.length ? (
        <Section title="Variant">
          {c.variantProps.map((vp) => {
            const value = inst.overrides.variant[vp.name] ?? vp.default;
            return (
              <div key={vp.name} className="flex items-center gap-1">
                {Object.hasOwn(inst.overrides.variant, vp.name) ? (
                  <OverrideDot
                    label={vp.name}
                    onReset={() => apply(setVariantOps(c, inst, vp.name, vp.default))}
                  />
                ) : null}
                <div className="flex-1">
                  <Row label={vp.name}>
                    <SelectField
                      label={`Variant ${vp.name}`}
                      value={value}
                      options={vp.values.map((v) => ({ value: v, label: v }))}
                      onChange={(v) => apply(setVariantOps(c, inst, vp.name, v))}
                    />
                  </Row>
                </div>
              </div>
            );
          })}
        </Section>
      ) : null}
      {c.props.length ? (
        <Section title="Properties">
          {c.props.map((p) => {
            const overridden = Object.hasOwn(inst.overrides.props, p.name);
            const value = overridden ? inst.overrides.props[p.name] : p.default;
            const set = (v: string | boolean | null) => apply(setPropValueOps(c, inst, p.name, v));
            return (
              <div key={p.name} className="flex items-center gap-1">
                {overridden ? <OverrideDot label={p.name} onReset={() => set(p.default)} /> : null}
                <div className="flex-1">
                  <Row label={p.name}>
                    {p.type === "boolean" ? (
                      <input
                        type="checkbox"
                        aria-label={`Property ${p.name}`}
                        checked={value !== false}
                        onChange={(e) => set(e.target.checked)}
                        className="size-4"
                      />
                    ) : p.type === "image" ? (
                      <SelectField
                        label={`Property ${p.name}`}
                        value={typeof value === "string" ? value : "none"}
                        options={[
                          { value: "none", label: "No image" },
                          ...Object.values(doc.assets).map((a) => ({ value: a.id, label: a.name })),
                        ]}
                        onChange={(v) => set(v === "none" ? null : v)}
                      />
                    ) : (
                      <TextField
                        label={`Property ${p.name}`}
                        value={typeof value === "string" ? value : ""}
                        onCommit={(v) => set(v)}
                      />
                    )}
                  </Row>
                </div>
              </div>
            );
          })}
        </Section>
      ) : null}
      {textLayers.some((t) => !exposed.has(t.id)) ? (
        <Section title="Layer overrides">
          {textLayers
            .filter((t) => !exposed.has(t.id))
            .map((t) => {
              const o = inst.overrides.nodes[t.id];
              const text =
                (o?.content ?? (t.type === "text" ? t.content : [])).map((s) => s.text).join("") ??
                "";
              const label = t.name || "Text";
              return (
                <div key={t.id} className="flex items-center gap-1">
                  {o ? (
                    <OverrideDot
                      label={label}
                      onReset={() =>
                        apply([
                          { op: "setInstanceOverride", nodeId: inst.id, kind: "nodes", key: t.id },
                        ])
                      }
                    />
                  ) : null}
                  <div className="flex-1">
                    <Row label={label}>
                      <TextField
                        label={`Override ${label}`}
                        value={text}
                        onCommit={(v) => apply(setLayerTextOps(inst, t.id, v))}
                      />
                      <input
                        type="checkbox"
                        aria-label={`Show ${label}`}
                        title="Visible on this instance"
                        checked={!o?.hidden?.desktop}
                        onChange={(e) => apply(setLayerHiddenOps(inst, t.id, !e.target.checked))}
                        className="size-4 shrink-0"
                      />
                    </Row>
                  </div>
                </div>
              );
            })}
        </Section>
      ) : null}
    </>
  );
}

/** Settings of the main component being edited (nothing selected in its tree). */
export function MainComponentSections(props: {
  doc: ProjectDocument;
  c: Component;
  variantKey: string;
  apply: Apply;
  onVariantKey: (key: string) => void;
  onDone: () => void;
  onSelect: (id: string) => void;
}) {
  const { doc, c, apply } = props;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [values, setValues] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const selected = Object.fromEntries(
    props.variantKey
      .split(",")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string]),
  );
  return (
    <>
      <Section title="Component">
        <Row label="Name">
          <TextField
            label="Component name"
            value={c.name}
            onCommit={(v) => v.trim() && apply(renameComponentOps(doc, c.id, v))}
          />
        </Row>
        <Button variant="outline" size="xs" onClick={props.onDone}>
          <CornerUpLeftIcon />
          Back to page
        </Button>
      </Section>
      <Section title="Variant properties" onAdd={() => setAdding(true)}>
        {c.variantProps.length === 0 && !adding ? (
          <p className="text-[11px] text-muted-foreground">
            Add a property such as Size with values small, large. Each combination can change the
            layers' styles.
          </p>
        ) : null}
        {c.variantProps.map((vp) => (
          <div key={vp.name} className="grid gap-1">
            <Row label={vp.name}>
              <SelectField
                label={`Editing ${vp.name}`}
                value={selected[vp.name] ?? vp.default}
                options={vp.values.map((v) => ({
                  value: v,
                  label: v === vp.default ? `${v} (default)` : v,
                }))}
                onChange={(v) => props.onVariantKey(variantKey(c, { ...selected, [vp.name]: v }))}
              />
              <button
                type="button"
                aria-label={`Remove variant property ${vp.name}`}
                onClick={() =>
                  apply(
                    setVariantPropsOps(
                      doc,
                      c.id,
                      c.variantProps.filter((x) => x.name !== vp.name),
                    ),
                  )
                }
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </Row>
            <Row label="Values">
              <TextField
                label={`Values of ${vp.name}`}
                value={vp.values.join(", ")}
                onCommit={(raw) => {
                  const list = raw
                    .split(",")
                    .map((v) =>
                      v
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-+|-+$/g, ""),
                    )
                    .filter(Boolean);
                  if (!list.length) return;
                  apply(
                    setVariantPropsOps(
                      doc,
                      c.id,
                      c.variantProps.map((x) =>
                        x.name === vp.name
                          ? {
                              ...x,
                              values: [...new Set(list)],
                              default: list.includes(x.default) ? x.default : (list[0] as string),
                            }
                          : x,
                      ),
                    ),
                  );
                }}
              />
            </Row>
          </div>
        ))}
        {adding ? (
          <form
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const r = addVariantPropOps(doc, c.id, name, values);
              if (!r.ok) return setProblem(r.message);
              apply(r.ops);
              setAdding(false);
              setName("");
              setValues("");
              setProblem(null);
            }}
          >
            <input
              aria-label="Variant property name"
              placeholder="Name, e.g. Size"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 rounded-md bg-muted/70 px-2 text-xs outline-none focus:bg-background"
            />
            <input
              aria-label="Variant values"
              placeholder="Values, e.g. small, large"
              value={values}
              onChange={(e) => setValues(e.target.value)}
              className="h-7 rounded-md bg-muted/70 px-2 text-xs outline-none focus:bg-background"
            />
            {problem ? <p className="text-[11px] text-destructive">{problem}</p> : null}
            <div className="flex gap-1">
              <Button type="submit" size="xs">
                <PlusIcon />
                Add property
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
        {c.variantProps.length ? (
          <p className="text-[11px] text-muted-foreground" data-testid="editing-variant">
            {props.variantKey === defaultVariantKey(c)
              ? "Editing the default variant: changes apply to every variant."
              : `Editing ${props.variantKey.replaceAll(",", ", ")}: changes apply to this variant only.`}
          </p>
        ) : null}
      </Section>
      <Section title="Properties">
        {c.props.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Select a layer in the component and expose its text, image, link or visibility as a
            property that instances can change.
          </p>
        ) : (
          c.props.map((p) => (
            <Row key={p.name} label={p.name}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs"
                onClick={() => props.onSelect(p.target.nodeId)}
              >
                {p.type} · {doc.nodes[p.target.nodeId]?.name || p.target.nodeId}
              </button>
              <button
                type="button"
                aria-label={`Remove property ${p.name}`}
                onClick={() => apply(removePropOps(doc, c.id, p.name))}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </Row>
          ))
        )}
      </Section>
    </>
  );
}

/** For a layer inside the main component: expose one of its fields as a component prop. */
export function ExposeSection(props: {
  doc: ProjectDocument;
  c: Component;
  node: Node;
  apply: Apply;
}) {
  const { doc, c, node } = props;
  const taken = new Set(
    c.props.filter((p) => p.target.nodeId === node.id).map((p) => p.target.field),
  );
  const options = exposable(node).filter((e) => !taken.has(e.field));
  if (!options.length) return null;
  return (
    <Section title="Component property">
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.field}
            variant="outline"
            size="xs"
            onClick={() => props.apply(exposePropOps(doc, c.id, node.id, o.field))}
          >
            <PlusIcon />
            Expose {o.label.toLowerCase()}
          </Button>
        ))}
      </div>
    </Section>
  );
}
