"use client";

/**
 * The Inspect tab (PRD F15, F29). Shows the selection's properties at the editing breakpoint;
 * values inherited from a wider breakpoint are shown as is, values set here get a red dot and
 * "Reset to inherited". Each control sends one transaction.
 */
import {
  activeBreakpoints,
  BLEND_MODES,
  type BreakpointId,
  childrenOf,
  type Node,
  type Page,
  type ProjectDocument,
  type PropKey,
  type Props,
  TAGS,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { Button } from "@truframe/ui/components/button";
import { cn } from "@truframe/ui/lib/utils";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ComponentIcon,
  CopyIcon,
  FrameIcon,
  ImageIcon,
  LinkIcon,
  type LucideIcon,
  StarIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addAutoLayoutOps } from "../auto-layout.ts";
import { checkBreakpointWidth } from "../breakpoints.ts";
import { deleteOps, duplicateOps, makeAbsoluteOps } from "../gestures.ts";
import type { AssetHost, ExportHost, FontOption, ImageExportRequest, PickerHost } from "../host.ts";
import { BREAKPOINT_LABEL } from "../labels.ts";
import { measureLayer } from "../measure-dom.ts";
import { IconPicker, SvgPreview } from "../pickers.tsx";
import { parentMap } from "../tree.ts";
import { valueAt } from "../variables.ts";
import { EmbedSection, PageCodeSection } from "./code-sections.tsx";
import {
  type ComponentActions,
  CreateComponent,
  ExposeSection,
  InstanceSections,
  MainComponentSections,
} from "./component-sections.tsx";
import {
  type BindOption,
  ColorField,
  NumberField,
  Row,
  Section,
  Segmented,
  SelectField,
  SpacingField,
  TextField,
} from "./fields.tsx";
import {
  ALIGN_POSITIONS,
  type AlignPosition,
  accessibilityChecks,
  alignOps,
  alignPositionOf,
  DISTRIBUTE,
  DISTRIBUTE_LABEL,
  type Direction,
  type Display,
  directionOf,
  directionOps,
  displayOf,
  distributeOf,
  distributeOps,
  effective,
  isOverridden,
  type MeasureLayer,
  paddingSides,
  pageColors,
  replaceColorOps,
  resetProp,
  SIZE_LABEL,
  type SizeMode,
  setProp,
  TEXT_RESIZING_LABEL,
  type TextResizing,
  textResizingOf,
  textResizingOps,
} from "./model.ts";

export type ColumnGuides = { columns: number; gutter: number; margin: number; visible: boolean };
export type Guides = Partial<Record<BreakpointId, ColumnGuides>>;

const TYPE_LABEL: Record<Node["type"], string> = {
  frame: "Section",
  text: "Text",
  image: "Image",
  link: "Link",
  icon: "Icon",
  embed: "Embed",
  instance: "Instance",
};
const TYPE_ICON: Record<Node["type"], LucideIcon> = {
  frame: FrameIcon,
  text: TypeIcon,
  image: ImageIcon,
  link: LinkIcon,
  icon: StarIcon,
  embed: FrameIcon,
  instance: ComponentIcon,
};

/** System families (local stacks in the compiler); web fonts come from the picker host. */
const SYSTEM_FAMILIES = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
];
/** Without a picker host (tests, previews): a few web fonts with the usual weights. */
const FALLBACK_FONTS: FontOption[] = ["Inter", "Roboto", "Playfair Display"].map((family) => ({
  family,
  weights: [400, 700],
}));
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

type Ctx = {
  doc: ProjectDocument;
  node: Node;
  bp: BreakpointId;
  apply: (ops: Op[]) => void;
  assets?: AssetHost;
  pickers?: PickerHost;
};

/** Unscaled box of a layer in the editing frame, and of its parent. */
function measure(bp: BreakpointId, id: string, parentId?: string) {
  const rect = measureLayer(bp, id);
  if (!rect) return null;
  const parent = (parentId && measureLayer(bp, parentId)) || rect;
  return { rect, parent };
}

/** Row bound to one style prop: shows the cascaded value, the red dot, and resets. */
function PropRow(props: { ctx: Ctx; label: string; keys: PropKey[]; children: React.ReactNode }) {
  const { node, bp, apply } = props.ctx;
  const overridden = props.keys.some((k) => isOverridden(node, bp, k));
  return (
    <Row
      label={props.label}
      overridden={overridden}
      onReset={() =>
        apply(
          props.keys.filter((k) => isOverridden(node, bp, k)).map((k) => resetProp(node.id, bp, k)),
        )
      }
    >
      {props.children}
    </Row>
  );
}

function set<K extends PropKey>(ctx: Ctx, key: K, value: Props[K] | undefined) {
  ctx.apply([setProp(ctx.node.id, ctx.bp, key, value)]);
}

function get<K extends PropKey>(ctx: Ctx, key: K): Props[K] {
  return effective(ctx.doc, ctx.node, ctx.bp, key);
}

/** A color variable's value at the breakpoint (desktop → tablet → mobile). */
function variableColor(doc: ProjectDocument, bp: BreakpointId, id: string): string | undefined {
  const v = doc.variables[id];
  if (v?.type !== "color") return undefined;
  let value: string | undefined;
  for (const b of activeBreakpoints(doc.breakpoints)) {
    value = v.value[b] ?? value;
    if (b === bp) break;
  }
  return value;
}

function bindOptions(ctx: Ctx, type: "color" | "spacing"): BindOption[] {
  return Object.values(ctx.doc.variables)
    .filter((v) => v.type === type)
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
    .map((v) => {
      const value = valueAt(ctx.doc, v, ctx.bp);
      return {
        id: v.id,
        name: v.name,
        group: v.group,
        preview: typeof value === "number" ? `${value}px` : String(value),
      };
    });
}

function colorBind(ctx: Ctx, onBind: (id: string) => void) {
  return { options: bindOptions(ctx, "color"), onBind };
}

/** The bind props of a SpacingField for one value of the selection. */
function spacingBind(ctx: Ctx, onBind: (id: string) => void) {
  return {
    options: bindOptions(ctx, "spacing"),
    name: (id: string) => ctx.doc.variables[id]?.name,
    resolve: (id: string) => {
      const v = ctx.doc.variables[id];
      return v?.type === "spacing" ? valueAt(ctx.doc, v, ctx.bp) : undefined;
    },
    onBind,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether `id` is `ancestor` or inside it. */
function within(parents: Map<string, string>, id: string, ancestor: string): boolean {
  for (let at: string | undefined = id; at; at = parents.get(at)) if (at === ancestor) return true;
  return false;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

// ——— Sections ———

function PositionSize(props: { ctx: Ctx; parentId?: string; text?: boolean }) {
  const { ctx } = props;
  const { node, bp } = ctx;
  const absolute = get(ctx, "position") === "absolute";
  const box = measure(bp, node.id, props.parentId);
  const size = (key: "width" | "height") => {
    const v = get(ctx, key);
    const mode: SizeMode = v?.type ?? "fit";
    const current: number | { var: string } =
      v?.type === "fixed"
        ? v.value
        : Math.round((key === "width" ? box?.rect.width : box?.rect.height) ?? 0);
    return (
      <PropRow ctx={ctx} label={key === "width" ? "Width" : "Height"} keys={[key]}>
        <SpacingField
          label={key === "width" ? "W" : "H"}
          prefix={key === "width" ? "W" : "H"}
          value={current}
          min={0}
          onCommit={(value) => set(ctx, key, { type: "fixed", value })}
          bind={spacingBind(ctx, (id) => set(ctx, key, { type: "fixed", value: { var: id } }))}
        />
        <div className="w-20 shrink-0">
          <SelectField
            label={`${key === "width" ? "Width" : "Height"} sizing`}
            value={mode}
            options={(["fixed", "fill", "fit"] as const).map((m) => ({
              value: m,
              label: SIZE_LABEL[m],
            }))}
            onChange={(m) =>
              set(ctx, key, m === "fixed" ? { type: "fixed", value: current } : { type: m })
            }
          />
        </div>
      </PropRow>
    );
  };
  return (
    <Section title="Position and Size">
      {props.parentId ? (
        <PropRow ctx={ctx} label="Position" keys={["position", "left", "top"]}>
          <Segmented
            label="Position"
            value={absolute ? "absolute" : "auto"}
            options={[
              { value: "auto", label: "Auto" },
              { value: "absolute", label: "Absolute" },
            ]}
            onChange={(v) => {
              if (v === "absolute" && box)
                ctx.apply(makeAbsoluteOps(node.id, bp, box.rect, box.parent));
              if (v === "auto") ctx.apply([setProp(node.id, bp, "position", "auto")]);
            }}
          />
        </PropRow>
      ) : null}
      {absolute ? (
        <PropRow ctx={ctx} label="X / Y" keys={["left", "top"]}>
          <NumberField
            label="X"
            prefix="X"
            value={num(get(ctx, "left")) ?? 0}
            onCommit={(v) => set(ctx, "left", v)}
          />
          <NumberField
            label="Y"
            prefix="Y"
            value={num(get(ctx, "top")) ?? 0}
            onCommit={(v) => set(ctx, "top", v)}
          />
        </PropRow>
      ) : null}
      {props.text ? (
        <PropRow ctx={ctx} label="Resizing" keys={["width", "height"]}>
          <Segmented<TextResizing>
            label="Text resizing"
            value={textResizingOf(ctx.doc, node, bp)}
            options={(["autoWidth", "autoHeight", "fixed"] as const).map((m) => ({
              value: m,
              label: TEXT_RESIZING_LABEL[m],
              // Short visible text; the full name stays the accessible name.
              icon: (
                <span>
                  {m === "autoWidth" ? "Auto W" : m === "autoHeight" ? "Auto H" : "Fixed"}
                </span>
              ),
            }))}
            onChange={(m) => box && ctx.apply(textResizingOps(node.id, bp, m, box.rect))}
          />
        </PropRow>
      ) : null}
      {size("width")}
      {size("height")}
    </Section>
  );
}

function Layout(props: { ctx: Ctx }) {
  const { ctx } = props;
  const { doc, node, bp } = ctx;
  const display = displayOf(doc, node, bp);
  const setDisplay = (d: Display) => {
    if (d === "grid")
      ctx.apply([
        setProp(node.id, bp, "display", "grid"),
        setProp(node.id, bp, "gridColumns", num(get(ctx, "gridColumns")) ?? 2),
      ]);
    else if (d === "stack") {
      // From Free: infer the stack from where the children are (Add auto layout).
      const inferred =
        display === "free"
          ? addAutoLayoutOps(doc, node.id, bp, (id) => measureLayer(bp, id))
          : null;
      if (inferred?.length) return ctx.apply(inferred);
      // Back to auto layout: children leave absolute positioning at this breakpoint.
      const kids = childrenOf(node).filter((c) => {
        const n = doc.nodes[c];
        return n && effective(doc, n, bp, "position") === "absolute";
      });
      ctx.apply([
        setProp(node.id, bp, "display", "stack"),
        ...(d === "stack" && display === "free"
          ? kids.map((c) => setProp(c, bp, "position", "auto"))
          : []),
      ]);
    } else {
      const ops: Op[] = [setProp(node.id, bp, "display", "stack")];
      for (const c of childrenOf(node)) {
        const m = measure(bp, c, node.id);
        if (m) ops.push(...makeAbsoluteOps(c, bp, m.rect, m.parent));
      }
      ctx.apply(ops);
    }
  };
  return (
    <Section title="Layout">
      <PropRow ctx={ctx} label="Display" keys={["display"]}>
        <Segmented<Display>
          label="Display"
          value={display}
          options={[
            { value: "grid", label: "Grid" },
            { value: "stack", label: "Stack" },
            { value: "free", label: "Free" },
          ]}
          onChange={setDisplay}
        />
      </PropRow>
      {display === "stack" ? (
        <PropRow ctx={ctx} label="Direction" keys={["direction", "wrap"]}>
          <Segmented<Direction>
            label="Direction"
            value={directionOf(doc, node, bp)}
            options={[
              { value: "vertical", label: "Vertical" },
              { value: "horizontal", label: "Horizontal" },
              { value: "wrap", label: "Wrap" },
            ]}
            onChange={(d) => ctx.apply(directionOps(node.id, bp, d))}
          />
        </PropRow>
      ) : null}
      {display === "grid" ? (
        <PropRow ctx={ctx} label="Grid" keys={["gridColumns", "gridRows"]}>
          <NumberField
            label="Columns"
            prefix="C"
            value={num(get(ctx, "gridColumns")) ?? 1}
            min={1}
            max={24}
            onCommit={(v) => set(ctx, "gridColumns", Math.round(v))}
          />
          <NumberField
            label="Rows"
            prefix="R"
            value={num(get(ctx, "gridRows"))}
            placeholder="Auto"
            min={1}
            max={24}
            onCommit={(v) => set(ctx, "gridRows", Math.round(v))}
          />
        </PropRow>
      ) : null}
      {display !== "free" ? (
        <>
          <PropRow ctx={ctx} label="Align" keys={["align", "justify"]}>
            <SelectField<AlignPosition>
              label="Align"
              value={alignPositionOf(doc, node, bp)}
              options={ALIGN_POSITIONS.map((p) => ({ value: p, label: p }))}
              onChange={(p) => ctx.apply(alignOps(doc, node, bp, p))}
            />
          </PropRow>
          <PropRow ctx={ctx} label="Distribute" keys={["justify"]}>
            <Segmented
              label="Distribute"
              value={distributeOf(doc, node, bp)}
              options={DISTRIBUTE.map((d) => ({
                value: d,
                label: DISTRIBUTE_LABEL[d].replace("Space ", ""),
              }))}
              onChange={(d) => ctx.apply(distributeOps(doc, node, bp, d))}
            />
          </PropRow>
          <PropRow ctx={ctx} label="Gap" keys={["gap", "rowGap"]}>
            <SpacingField
              label="Gap"
              prefix="↔"
              value={get(ctx, "gap") ?? 0}
              min={0}
              unit="px"
              onCommit={(v) => set(ctx, "gap", v)}
              bind={spacingBind(ctx, (id) => set(ctx, "gap", { var: id }))}
            />
            {display === "grid" ? (
              <SpacingField
                label="Row gap"
                prefix="↕"
                value={get(ctx, "rowGap") ?? get(ctx, "gap") ?? 0}
                min={0}
                unit="px"
                onCommit={(v) => set(ctx, "rowGap", v)}
                bind={spacingBind(ctx, (id) => set(ctx, "rowGap", { var: id }))}
              />
            ) : null}
          </PropRow>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Children are positioned freely (absolute) inside this frame.
        </p>
      )}
    </Section>
  );
}

function Padding(props: { ctx: Ctx }) {
  const { ctx } = props;
  const p = paddingSides(get(ctx, "padding"));
  const [expanded, setExpanded] = useState(!same(p.top, p.bottom) || !same(p.left, p.right));
  const commit = (next: typeof p) => set(ctx, "padding", next);
  // A bound side shows the variable name, which needs the full row.
  const anyBound = Object.values(p).some((v) => typeof v === "object");
  return (
    <Section title="Padding">
      <PropRow ctx={ctx} label="Padding" keys={["padding"]}>
        {expanded ? (
          <div className={cn("grid flex-1 gap-1", anyBound ? "grid-cols-1" : "grid-cols-2")}>
            {(["top", "right", "bottom", "left"] as const).map((s) => (
              <SpacingField
                key={s}
                label={`Padding ${s}`}
                prefix={s[0]?.toUpperCase()}
                value={p[s]}
                min={0}
                onCommit={(v) => commit({ ...p, [s]: v })}
                bind={spacingBind(ctx, (id) => commit({ ...p, [s]: { var: id } }))}
              />
            ))}
          </div>
        ) : (
          <div className={cn("grid flex-1 gap-1", anyBound ? "grid-cols-1" : "grid-cols-2")}>
            <SpacingField
              label="Padding horizontal"
              prefix="H"
              value={p.left}
              min={0}
              onCommit={(v) => commit({ ...p, left: v, right: v })}
              bind={spacingBind(ctx, (id) =>
                commit({ ...p, left: { var: id }, right: { var: id } }),
              )}
            />
            <SpacingField
              label="Padding vertical"
              prefix="V"
              value={p.top}
              min={0}
              onCommit={(v) => commit({ ...p, top: v, bottom: v })}
              bind={spacingBind(ctx, (id) =>
                commit({ ...p, top: { var: id }, bottom: { var: id } }),
              )}
            />
          </div>
        )}
        <button
          type="button"
          aria-label={expanded ? "Edit padding as two values" : "Edit padding per side"}
          aria-pressed={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <FrameIcon className="size-3.5" />
        </button>
      </PropRow>
    </Section>
  );
}

function Fill(props: { ctx: Ctx; title?: string }) {
  const { ctx } = props;
  const fill = get(ctx, "fill");
  const type = fill?.type === "linearGradient" ? "gradient" : (fill?.type ?? "none");
  return (
    <Section title={props.title ?? "Fill"}>
      <PropRow ctx={ctx} label="Type" keys={["fill"]}>
        <Segmented
          label="Fill type"
          value={type}
          options={[
            { value: "none", label: "None" },
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Image", disabled: !Object.keys(ctx.doc.assets).length },
          ]}
          onChange={(t) => {
            if (t === "none") set(ctx, "fill", undefined);
            if (t === "solid") set(ctx, "fill", { type: "solid", color: "#e5e5e5" });
            const first = Object.keys(ctx.doc.assets)[0];
            if (t === "image" && first)
              set(ctx, "fill", { type: "image", assetId: first, fit: "fill" });
            if (t === "gradient")
              set(ctx, "fill", {
                type: "linearGradient",
                angle: 180,
                stops: [
                  { color: "#ffffff", position: 0 },
                  { color: "#e5e5e5", position: 1 },
                ],
              });
          }}
        />
      </PropRow>
      {fill?.type === "solid" ? (
        <Row label="Color">
          <ColorField
            resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
            variableName={(id) => ctx.doc.variables[id]?.name}
            label="Fill"
            value={fill.color}
            onCommit={(c) => set(ctx, "fill", { type: "solid", color: c })}
            bind={colorBind(ctx, (id) => set(ctx, "fill", { type: "solid", color: { var: id } }))}
          />
        </Row>
      ) : null}
      {fill?.type === "image" ? (
        <>
          <Row label="Image">
            <SelectField
              label="Fill image"
              value={fill.assetId}
              options={Object.values(ctx.doc.assets).map((a) => ({ value: a.id, label: a.name }))}
              onChange={(id) => set(ctx, "fill", { ...fill, assetId: id })}
            />
          </Row>
          <Row label="Fit">
            <Segmented
              label="Fill image fit"
              value={fill.fit}
              options={[
                { value: "fill", label: "Fill" },
                { value: "fit", label: "Fit" },
                { value: "crop", label: "Crop" },
                { value: "tile", label: "Tile" },
              ]}
              onChange={(fit) => set(ctx, "fill", { ...fill, fit })}
            />
          </Row>
        </>
      ) : null}
      {fill?.type === "linearGradient" ? (
        <>
          <Row label="Angle">
            <NumberField
              label="Gradient angle"
              value={fill.angle}
              min={0}
              max={360}
              unit="°"
              onCommit={(a) => set(ctx, "fill", { ...fill, angle: a })}
            />
          </Row>
          {fill.stops.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stops have no ids; their order is their identity.
            <Row key={`${i}-${s.position}`} label={`Stop ${i + 1}`}>
              <ColorField
                resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
                variableName={(id) => ctx.doc.variables[id]?.name}
                label={`Stop ${i + 1}`}
                value={s.color}
                onCommit={(c) =>
                  set(ctx, "fill", {
                    ...fill,
                    stops: fill.stops.map((x, j) => (j === i ? { ...x, color: c } : x)),
                  })
                }
                bind={colorBind(ctx, (id) =>
                  set(ctx, "fill", {
                    ...fill,
                    stops: fill.stops.map((x, j) => (j === i ? { ...x, color: { var: id } } : x)),
                  }),
                )}
              />
            </Row>
          ))}
        </>
      ) : null}
    </Section>
  );
}

function Border(props: { ctx: Ctx; title?: string }) {
  const { ctx } = props;
  const border = get(ctx, "border");
  const radius = get(ctx, "radius");
  const bound = typeof radius === "object" && "var" in radius;
  const [corners, setCorners] = useState(typeof radius === "object" && !bound);
  const all = (v: number) => ({ topLeft: v, topRight: v, bottomRight: v, bottomLeft: v });
  // Per-corner editing starts from a bound radius's current value.
  const r =
    typeof radius === "number"
      ? all(radius)
      : radius && "var" in radius
        ? all(spacingBind(ctx, () => {}).resolve(radius.var) ?? 0)
        : (radius ?? all(0));
  const sidesValue = border
    ? Object.values(border.sides).every(Boolean)
      ? "all"
      : (Object.entries(border.sides).find(([, v]) => v)?.[0] ?? "all")
    : "all";
  return (
    <Section
      title={props.title ?? "Border"}
      onAdd={
        border
          ? undefined
          : () =>
              set(ctx, "border", {
                width: 1,
                color: "#000000",
                style: "solid",
                sides: { top: true, right: true, bottom: true, left: true },
              })
      }
      onRemove={border ? () => set(ctx, "border", undefined) : undefined}
    >
      {border ? (
        <>
          <PropRow ctx={ctx} label="Stroke" keys={["border"]}>
            <ColorField
              resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
              variableName={(id) => ctx.doc.variables[id]?.name}
              label="Border"
              value={border.color}
              onCommit={(c) => set(ctx, "border", { ...border, color: c })}
              bind={colorBind(ctx, (id) => set(ctx, "border", { ...border, color: { var: id } }))}
            />
          </PropRow>
          <Row label="Width">
            <NumberField
              label="Border width"
              value={border.width}
              min={0}
              unit="px"
              onCommit={(w) => set(ctx, "border", { ...border, width: w })}
            />
            <div className="w-24 shrink-0">
              <SelectField
                label="Border style"
                value={border.style}
                options={(["solid", "dashed", "dotted"] as const).map((s) => ({
                  value: s,
                  label: s[0]?.toUpperCase() + s.slice(1),
                }))}
                onChange={(s) => set(ctx, "border", { ...border, style: s })}
              />
            </div>
          </Row>
          <Row label="Sides">
            <Segmented
              label="Border sides"
              value={sidesValue}
              options={[
                { value: "all", label: "All" },
                { value: "top", label: "T" },
                { value: "right", label: "R" },
                { value: "bottom", label: "B" },
                { value: "left", label: "L" },
              ]}
              onChange={(s) =>
                set(ctx, "border", {
                  ...border,
                  sides:
                    s === "all"
                      ? { top: true, right: true, bottom: true, left: true }
                      : {
                          top: s === "top",
                          right: s === "right",
                          bottom: s === "bottom",
                          left: s === "left",
                        },
                })
              }
            />
          </Row>
        </>
      ) : null}
      <PropRow ctx={ctx} label="Radius" keys={["radius"]}>
        {corners ? (
          <div className="grid flex-1 grid-cols-4 gap-1">
            {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((c) => (
              <NumberField
                key={c}
                label={`Radius ${c}`}
                value={r[c]}
                min={0}
                onCommit={(v) => set(ctx, "radius", { ...r, [c]: v })}
              />
            ))}
          </div>
        ) : (
          <SpacingField
            label="Radius"
            prefix="R"
            value={typeof radius === "number" || bound ? radius : r.topLeft}
            min={0}
            unit="px"
            onCommit={(v) => set(ctx, "radius", v)}
            bind={spacingBind(ctx, (id) => set(ctx, "radius", { var: id }))}
          />
        )}
        <button
          type="button"
          aria-label={corners ? "One radius for all corners" : "Radius per corner"}
          aria-pressed={corners}
          onClick={() => setCorners((c) => !c)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <FrameIcon className="size-3.5" />
        </button>
      </PropRow>
    </Section>
  );
}

function Shadow(props: { ctx: Ctx }) {
  const { ctx } = props;
  const shadows = get(ctx, "shadows") ?? [];
  const update = (next: typeof shadows) => set(ctx, "shadows", next.length ? next : undefined);
  return (
    <Section
      title="Shadow"
      onAdd={() =>
        update([...shadows, { x: 0, y: 4, blur: 12, spread: 0, color: "#00000026", inset: false }])
      }
    >
      {shadows.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: shadows have no ids; their order is their identity.
        <div key={`${i}-${s.x}-${s.y}`} className="grid gap-1.5 rounded-md border p-2">
          <div className="grid grid-cols-4 gap-1">
            {(["x", "y", "blur", "spread"] as const).map((k) => (
              <NumberField
                key={k}
                label={`Shadow ${i + 1} ${k}`}
                prefix={k === "blur" ? "B" : k === "spread" ? "S" : k.toUpperCase()}
                value={s[k]}
                min={k === "blur" ? 0 : undefined}
                onCommit={(v) => update(shadows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <ColorField
              resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
              variableName={(id) => ctx.doc.variables[id]?.name}
              label={`Shadow ${i + 1}`}
              value={s.color}
              onCommit={(c) => update(shadows.map((x, j) => (j === i ? { ...x, color: c } : x)))}
              bind={colorBind(ctx, (id) =>
                update(shadows.map((x, j) => (j === i ? { ...x, color: { var: id } } : x))),
              )}
            />
            <button
              type="button"
              aria-label={`Remove shadow ${i + 1}`}
              onClick={() => update(shadows.filter((_, j) => j !== i))}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </Section>
  );
}

function LayerSection(props: { ctx: Ctx; radius?: boolean }) {
  const { ctx } = props;
  const { node, bp } = ctx;
  const hidden = Boolean(
    activeBreakpoints(ctx.doc.breakpoints)
      .slice(0, activeBreakpoints(ctx.doc.breakpoints).indexOf(bp) + 1)
      .reduce<boolean | undefined>((acc, id) => node.hidden?.[id] ?? acc, undefined),
  );
  return (
    <Section title="Layer">
      <Row label={`Visible on ${BREAKPOINT_LABEL[bp]}`}>
        <Segmented
          label={`Visible on ${BREAKPOINT_LABEL[bp]}`}
          value={hidden ? "hidden" : "visible"}
          options={[
            { value: "visible", label: "Visible" },
            { value: "hidden", label: "Hidden" },
          ]}
          onChange={(v) =>
            ctx.apply([
              {
                op: "setNodeFields",
                nodeId: node.id,
                fields: { hidden: { ...node.hidden, [bp]: v === "hidden" } },
              },
            ])
          }
        />
      </Row>
      <PropRow ctx={ctx} label="Opacity" keys={["opacity"]}>
        <NumberField
          label="Opacity"
          value={Math.round((get(ctx, "opacity") ?? 1) * 100)}
          min={0}
          max={100}
          unit="%"
          onCommit={(v) => set(ctx, "opacity", v / 100)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Blend" keys={["blend"]}>
        <SelectField
          label="Blend mode"
          value={get(ctx, "blend") ?? "normal"}
          options={BLEND_MODES.map((m) => ({
            value: m,
            label: m[0]?.toUpperCase() + m.slice(1).replace("-", " "),
          }))}
          onChange={(m) => set(ctx, "blend", m === "normal" ? undefined : m)}
        />
      </PropRow>
      {props.radius ? (
        <PropRow ctx={ctx} label="Radius" keys={["radius"]}>
          <NumberField
            label="Radius"
            value={num(get(ctx, "radius")) ?? 0}
            min={0}
            unit="px"
            onCommit={(v) => set(ctx, "radius", v)}
          />
        </PropRow>
      ) : null}
    </Section>
  );
}

function StyleSection(props: { ctx: Ctx }) {
  const { ctx } = props;
  return (
    <Section title="Style">
      <Row label="Name">
        <TextField
          label="Layer name"
          value={ctx.node.name}
          onCommit={(name) =>
            ctx.apply([{ op: "setNodeFields", nodeId: ctx.node.id, fields: { name } }])
          }
        />
      </Row>
      <PropRow ctx={ctx} label="Overflow" keys={["overflow"]}>
        <Segmented
          label="Overflow"
          value={get(ctx, "overflow") ?? "visible"}
          options={[
            { value: "visible", label: "Visible" },
            { value: "clip", label: "Clip" },
          ]}
          onChange={(v) => set(ctx, "overflow", v)}
        />
      </PropRow>
    </Section>
  );
}

function Typography(props: { ctx: Ctx }) {
  const { ctx } = props;
  const fontVars = Object.values(ctx.doc.variables).filter((v) => v.type === "font");
  const font = get(ctx, "font");
  const align = get(ctx, "textAlign") ?? "left";
  const webFonts = ctx.pickers?.fonts ?? FALLBACK_FONTS;
  const family = get(ctx, "fontFamily");
  const webFont = webFonts.find((f) => f.family === family);
  return (
    <Section title="Typography">
      <p
        data-testid="typography-preview"
        className="truncate rounded-md bg-muted/50 px-2 py-1.5"
        style={{
          fontFamily: get(ctx, "fontFamily"),
          fontWeight: get(ctx, "fontWeight"),
          letterSpacing: get(ctx, "letterSpacing") ? `${get(ctx, "letterSpacing")}em` : undefined,
          textDecoration: get(ctx, "textDecoration"),
          textTransform: get(ctx, "textTransform"),
        }}
      >
        Aa The quick brown fox
      </p>
      {fontVars.length ? (
        <PropRow ctx={ctx} label="Style" keys={["font"]}>
          <SelectField
            label="Font variable"
            value={font?.var ?? ""}
            placeholder="No variable"
            options={fontVars.map((v) => ({ value: v.id, label: v.name }))}
            onChange={(id) => set(ctx, "font", { var: id })}
          />
        </PropRow>
      ) : null}
      <PropRow ctx={ctx} label="Family" keys={["fontFamily"]}>
        <SelectField
          label="Font family"
          value={family ?? ""}
          placeholder="Default"
          options={[
            ...SYSTEM_FAMILIES.map((f) => ({ value: f, label: f })),
            ...webFonts.map((f) => ({ value: f.family, label: f.family })),
            ...(family && !SYSTEM_FAMILIES.includes(family) && !webFont
              ? [{ value: family, label: family }]
              : []),
          ]}
          onChange={(f) => {
            // A web font only has some weights; keep the nearest so the site still builds.
            const w = get(ctx, "fontWeight") ?? 400;
            const weights = webFonts.find((o) => o.family === f)?.weights;
            const nearest = weights?.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
            ctx.apply([
              setProp(ctx.node.id, ctx.bp, "fontFamily", f),
              ...(nearest !== undefined && nearest !== w
                ? [setProp(ctx.node.id, ctx.bp, "fontWeight", nearest)]
                : []),
            ]);
          }}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Weight" keys={["fontWeight"]}>
        <SelectField
          label="Font weight"
          value={String(get(ctx, "fontWeight") ?? 400) as `${(typeof WEIGHTS)[number]}`}
          options={WEIGHTS.filter((w) => !webFont || webFont.weights.includes(w)).map((w) => ({
            value: String(w) as `${typeof w}`,
            label: String(w),
          }))}
          onChange={(w) => set(ctx, "fontWeight", Number(w))}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Size" keys={["fontSize", "lineHeight"]}>
        <NumberField
          label="Font size"
          prefix="S"
          value={get(ctx, "fontSize") ?? 16}
          min={1}
          unit="px"
          onCommit={(v) => set(ctx, "fontSize", v)}
        />
        <NumberField
          label="Line height"
          prefix="LH"
          value={get(ctx, "lineHeight")}
          placeholder="Auto"
          min={0.5}
          max={10}
          step={0.05}
          onCommit={(v) => set(ctx, "lineHeight", v)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Letter spacing" keys={["letterSpacing"]}>
        <NumberField
          label="Letter spacing"
          value={get(ctx, "letterSpacing") ?? 0}
          min={-1}
          max={1}
          step={0.01}
          unit="em"
          onCommit={(v) => set(ctx, "letterSpacing", v)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Align" keys={["textAlign"]}>
        <Segmented
          label="Text align"
          value={align}
          options={[
            { value: "left", label: "Left", icon: <AlignLeftIcon className="size-3.5" /> },
            { value: "center", label: "Center", icon: <AlignCenterIcon className="size-3.5" /> },
            { value: "right", label: "Right", icon: <AlignRightIcon className="size-3.5" /> },
            { value: "justify", label: "Justify", icon: <AlignJustifyIcon className="size-3.5" /> },
          ]}
          onChange={(v) => set(ctx, "textAlign", v)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Decoration" keys={["textDecoration"]}>
        <SelectField
          label="Text decoration"
          value={get(ctx, "textDecoration") ?? "none"}
          options={(["none", "underline", "line-through"] as const).map((v) => ({
            value: v,
            label: v === "none" ? "None" : v === "underline" ? "Underline" : "Strikethrough",
          }))}
          onChange={(v) => set(ctx, "textDecoration", v)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Transform" keys={["textTransform"]}>
        <SelectField
          label="Text transform"
          value={get(ctx, "textTransform") ?? "none"}
          options={(["none", "uppercase", "lowercase", "capitalize"] as const).map((v) => ({
            value: v,
            label: v[0]?.toUpperCase() + v.slice(1),
          }))}
          onChange={(v) => set(ctx, "textTransform", v)}
        />
      </PropRow>
      <PropRow ctx={ctx} label="Truncate" keys={["truncate"]}>
        <Segmented
          label="Truncation"
          value={get(ctx, "truncate") ? "truncate" : "wrap"}
          options={[
            { value: "wrap", label: "Wrap" },
            { value: "truncate", label: "One line …" },
          ]}
          onChange={(v) => set(ctx, "truncate", v === "truncate")}
        />
      </PropRow>
    </Section>
  );
}

function Accessibility(props: { ctx: Ctx }) {
  const { node, apply } = props.ctx;
  const tags = TAGS[node.type] as readonly string[];
  return (
    <Section title="Accessibility">
      <Row label="Tag">
        <SelectField
          label="Semantic tag"
          value={node.tag}
          options={tags.map((t) => ({ value: t, label: t }))}
          onChange={(tag) => apply([{ op: "setNodeFields", nodeId: node.id, fields: { tag } }])}
        />
      </Row>
      {node.type === "link" ? (
        <Row label="Label">
          <TextField
            label="Accessible label"
            value={node.ariaLabel ?? ""}
            placeholder="For icon-only links"
            onCommit={(v) =>
              apply([
                {
                  op: "setNodeFields",
                  nodeId: node.id,
                  fields: { ariaLabel: v.trim() ? v : null },
                },
              ])
            }
          />
        </Row>
      ) : null}
      {node.type === "link" ? (
        // The generated focus ring uses the link's own text color (`currentColor`), so this
        // is the link's text color; labels with their own color keep it.
        <PropRow ctx={props.ctx} label="Focus ring" keys={["textColor"]}>
          <ColorField
            resolveVariable={(id) => variableColor(props.ctx.doc, props.ctx.bp, id)}
            variableName={(id) => props.ctx.doc.variables[id]?.name}
            label="Focus ring"
            value={get(props.ctx, "textColor") ?? "#000000"}
            onCommit={(c) => set(props.ctx, "textColor", c)}
            bind={colorBind(props.ctx, (id) => set(props.ctx, "textColor", { var: id }))}
          />
        </PropRow>
      ) : null}
    </Section>
  );
}

/** Rendered layer sizes from the canvas frames (offset sizes ignore the canvas zoom). */
const measureOnCanvas: MeasureLayer = (nodeId, bp) => {
  const el = document.querySelector<HTMLElement>(
    `[data-frame="${bp}"] [data-tf-node="${CSS.escape(nodeId)}"]`,
  );
  return el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
};

/**
 * Changes whenever the canvas draws new compiler output. The compile runs in a worker, so
 * the CSS for a change arrives after the document does; measurements wait for both.
 */
export const CanvasPaint = createContext<unknown>(null);

function Checks(props: { doc: ProjectDocument; rootId: string; onSelect: (id: string) => void }) {
  const parents = useMemo(() => parentMap(props.doc), [props.doc]);
  const paint = useContext(CanvasPaint);
  // Measure after the canvas has rendered this document with its compiled CSS.
  const [painted, setPainted] = useState<ProjectDocument | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `paint` is the trigger, not an input: new compiled CSS means new sizes to measure.
  useEffect(() => {
    setPainted(null);
    const raf = requestAnimationFrame(() => setPainted(props.doc));
    return () => cancelAnimationFrame(raf);
  }, [props.doc, paint]);
  const checks = useMemo(
    () =>
      accessibilityChecks(
        props.doc,
        props.rootId,
        parents,
        painted === props.doc ? measureOnCanvas : undefined,
      ),
    [props.doc, props.rootId, parents, painted],
  );
  return (
    <Section title="Accessibility Checks">
      {checks.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No problems found.</p>
      ) : (
        <ul className="grid gap-1" aria-label="Accessibility problems">
          {checks.map((c) => (
            <li key={`${c.nodeId}-${c.bp}-${c.message}`}>
              <button
                type="button"
                onClick={() => props.onSelect(c.nodeId)}
                className="w-full rounded px-1.5 py-1 text-left text-[11px] text-amber-800 hover:bg-amber-50"
              >
                {c.message}
                {c.bp ? ` (${BREAKPOINT_LABEL[c.bp]})` : ""} ·{" "}
                {props.doc.nodes[c.nodeId]?.name || props.doc.nodes[c.nodeId]?.type}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TextContent(props: { ctx: Ctx }) {
  const { node, apply } = props.ctx;
  if (node.type !== "text") return null;
  const plain = node.content.map((s) => s.text).join("");
  const rich = node.content.some((s) => s.bold || s.italic || s.underline || s.href);
  return (
    <Section title="Content">
      <Row label="Name">
        <TextField
          label="Layer name"
          value={node.name}
          onCommit={(name) => apply([{ op: "setNodeFields", nodeId: node.id, fields: { name } }])}
        />
      </Row>
      <TextField
        label="Text content"
        multiline
        value={plain}
        onCommit={(text) =>
          apply([{ op: "setNodeFields", nodeId: node.id, fields: { content: [{ text }] } }])
        }
      />
      {rich ? (
        <p className="text-[11px] text-muted-foreground">
          Editing here replaces bold, italic and links in this text.
        </p>
      ) : null}
    </Section>
  );
}

/** Replace (upload a new file for this layer) and From assets (pick an uploaded one). */
function ImagePickers({ ctx }: { ctx: Ctx }) {
  const { node, doc, apply } = ctx;
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (node.type !== "image") return null;
  const pick = (id: string) => {
    const a = doc.assets[id];
    const fields: Record<string, unknown> = { assetId: id };
    if (a?.alt && !node.alt) fields.alt = a.alt;
    apply([{ op: "setNodeFields", nodeId: node.id, fields }]);
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          disabled={!ctx.assets || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Uploading…" : "Replace"}
        </Button>
        <SelectField
          label="From assets"
          value={node.assetId ?? ""}
          placeholder="From assets"
          options={Object.values(doc.assets).map((a) => ({ value: a.id, label: a.name }))}
          onChange={(id) => pick(id)}
        />
      </div>
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
        aria-label="Upload an image for this layer"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !ctx.assets) return;
          setBusy(true);
          const r = await ctx.assets.upload(file);
          setBusy(false);
          if (!r.ok) return setProblem(r.message);
          setProblem(null);
          apply([
            { op: "upsertAsset", asset: r.asset },
            { op: "setNodeFields", nodeId: node.id, fields: { assetId: r.asset.id } },
          ]);
        }}
      />
      {problem ? (
        <p role="alert" className="text-[11px] text-destructive">
          {problem}
        </p>
      ) : null}
    </>
  );
}

function ImageSection(props: { ctx: Ctx }) {
  const { ctx } = props;
  const { node, doc, apply } = ctx;
  if (node.type !== "image") return null;
  const asset = node.assetId ? doc.assets[node.assetId] : undefined;
  const ratio = get(ctx, "aspectRatio");
  const ratioValue =
    ratio === 16 / 9 ? "16:9" : ratio === 4 / 3 ? "4:3" : ratio === 1 ? "1:1" : "auto";
  return (
    <Section title="Image">
      <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-[#e5e5e5]">
          {asset && ctx.assets ? (
            <img src={ctx.assets.url(asset, 320)} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 text-[11px]">
          <p className="truncate font-medium">{asset?.name ?? "Placeholder"}</p>
          <p className="text-muted-foreground">
            {asset ? `${asset.width} × ${asset.height}` : "No image chosen"}
          </p>
        </div>
      </div>
      <ImagePickers ctx={ctx} />
      <Row label="Fit">
        <Segmented
          label="Image fit"
          value={node.fit}
          options={[
            { value: "fill", label: "Fill" },
            { value: "fit", label: "Fit" },
            { value: "crop", label: "Crop" },
            { value: "tile", label: "Tile" },
          ]}
          onChange={(fit) => apply([{ op: "setNodeFields", nodeId: node.id, fields: { fit } }])}
        />
      </Row>
      <PropRow ctx={ctx} label="Ratio" keys={["aspectRatio"]}>
        <Segmented
          label="Aspect ratio"
          value={ratioValue}
          options={[
            { value: "auto", label: "Auto" },
            { value: "16:9", label: "16:9" },
            { value: "4:3", label: "4:3" },
            { value: "1:1", label: "1:1" },
          ]}
          onChange={(v) =>
            set(
              ctx,
              "aspectRatio",
              v === "auto" ? undefined : v === "16:9" ? 16 / 9 : v === "4:3" ? 4 / 3 : 1,
            )
          }
        />
      </PropRow>
      <Row label="Alt text">
        <TextField
          label="Alt text"
          value={node.alt}
          placeholder={node.decorative ? "Decorative" : "Describe the image"}
          onCommit={(alt) => apply([{ op: "setNodeFields", nodeId: node.id, fields: { alt } }])}
        />
      </Row>
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={node.decorative}
          onChange={(e) =>
            apply([
              { op: "setNodeFields", nodeId: node.id, fields: { decorative: e.target.checked } },
            ])
          }
        />
        Decorative (empty alt)
      </label>
    </Section>
  );
}

function IconSection(props: { ctx: Ctx }) {
  const { ctx } = props;
  const node = ctx.node;
  if (node.type !== "icon") return null;
  return (
    <Section title="Icon">
      <div className="flex items-center gap-2">
        {node.svg ? (
          <SvgPreview svg={node.svg} />
        ) : (
          <span className="size-5 rounded bg-muted" aria-hidden />
        )}
        <p className="truncate text-xs" data-testid="icon-name">
          {node.icon} <span className="text-muted-foreground">({node.set})</span>
        </p>
      </div>
      {ctx.pickers ? (
        <IconPicker
          host={ctx.pickers}
          onPick={(i) =>
            ctx.apply([
              {
                op: "setNodeFields",
                nodeId: node.id,
                fields: { set: i.set, icon: i.icon, svg: i.svg },
              },
            ])
          }
        />
      ) : null}
    </Section>
  );
}

function LinkSection(props: { ctx: Ctx }) {
  const { node, doc, apply } = props.ctx;
  if (node.type !== "link") return null;
  const target = node.target;
  return (
    <Section title="Link">
      <Row label="Goes to">
        <SelectField
          label="Link target"
          value={target.type === "page" ? target.pageId : "url"}
          options={[
            { value: "url", label: "URL…" },
            ...doc.pages.map((p) => ({ value: p.id, label: `${p.name} (${p.path})` })),
          ]}
          onChange={(v) =>
            apply([
              {
                op: "setNodeFields",
                nodeId: node.id,
                fields: {
                  target: v === "url" ? { type: "url", href: "#" } : { type: "page", pageId: v },
                },
              },
            ])
          }
        />
      </Row>
      {target.type === "url" ? (
        <Row label="URL">
          <TextField
            label="Link URL"
            value={target.href}
            onCommit={(href) =>
              apply([
                { op: "setNodeFields", nodeId: node.id, fields: { target: { type: "url", href } } },
              ])
            }
          />
        </Row>
      ) : null}
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={node.newTab}
          onChange={(e) =>
            apply([{ op: "setNodeFields", nodeId: node.id, fields: { newTab: e.target.checked } }])
          }
        />
        Open in a new tab
      </label>
    </Section>
  );
}

function Arrange(props: { ctx: Ctx; onSelectionChange: (ids: string[]) => void }) {
  const { doc, node, apply } = props.ctx;
  const parents = parentMap(doc);
  return (
    <Section title="Arrange">
      <div className="grid grid-cols-2 gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => {
            const { ops, copies } = duplicateOps(
              doc,
              parents,
              [node.id],
              () => `n${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`,
            );
            apply(ops);
            props.onSelectionChange(copies);
          }}
        >
          <CopyIcon />
          Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => {
            apply(deleteOps([node.id], parents));
            props.onSelectionChange([]);
          }}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </Section>
  );
}

// ——— Page (nothing selected) ———

/** Page Export: format and scale (up to the plan's largest), exported at the editing breakpoint. */
function ExportSection(props: {
  exports?: ExportHost;
  pageId: string;
  pageName: string;
  bp: BreakpointId;
}) {
  const { exports } = props;
  const [format, setFormat] = useState<ImageExportRequest["format"]>("png");
  const [scale, setScale] = useState(1);
  const [maxScale, setMaxScale] = useState<number | null>(null);
  const [status, setStatus] = useState<{ busy: boolean; problem: string | null }>({
    busy: false,
    problem: null,
  });
  useEffect(() => {
    let live = true;
    void exports?.maxScale().then((m) => {
      if (live) setMaxScale(m);
    });
    return () => {
      live = false;
    };
  }, [exports]);
  const run = async () => {
    if (!exports) return;
    setStatus({ busy: true, problem: null });
    const r = await exports.image({ pageId: props.pageId, breakpoint: props.bp, format, scale });
    if (!r.ok) return setStatus({ busy: false, problem: r.message });
    setStatus({ busy: false, problem: null });
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `${props.pageName}-${props.bp}@${scale}x.${format === "jpeg" ? "jpg" : format}`;
    a.click();
  };
  return (
    <Section title="Export">
      <div className="grid grid-cols-2 gap-1">
        <SelectField
          label="Export format"
          value={format}
          options={[
            { value: "png", label: "PNG" },
            { value: "jpeg", label: "JPEG" },
            { value: "webp", label: "WebP" },
          ]}
          onChange={(f) => setFormat(f as ImageExportRequest["format"])}
        />
        <SelectField
          label="Export scale"
          value={String(scale)}
          options={[1, 2, 3, 4].map((s) => ({
            value: String(s),
            label: maxScale !== null && s > maxScale ? `${s}× (upgrade)` : `${s}×`,
            disabled: maxScale !== null && s > maxScale,
          }))}
          onChange={(s) => setScale(Number(s))}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={!exports || status.busy}
        onClick={run}
      >
        {status.busy ? "Exporting…" : `Export ${props.pageName} (${BREAKPOINT_LABEL[props.bp]})`}
      </Button>
      {status.problem ? (
        <p role="alert" className="text-[11px] text-destructive">
          {status.problem}
        </p>
      ) : null}
    </Section>
  );
}

function PageInspector(props: InspectorProps & { page: Page }) {
  const { doc, page, bp } = props;
  const root = doc.nodes[page.root];
  const [widthError, setWidthError] = useState<string | null>(null);
  const colors = pageColors(doc, page.root);
  const guides = props.guides[bp] ?? { columns: 12, gutter: 24, margin: 32, visible: false };
  if (!root) return null;
  const ctx: Ctx = { doc, node: root, bp, apply: props.apply };
  const updatePage = (fields: Partial<Pick<Page, "name" | "path" | "seo">>) =>
    props.apply([{ op: "updatePage", pageId: page.id, fields }]);
  const setGuides = (g: Partial<ColumnGuides>) =>
    props.onGuidesChange({ ...props.guides, [bp]: { ...guides, ...g } });
  return (
    <>
      <Section title="Editing breakpoint">
        <Segmented
          label="Editing breakpoint"
          value={bp}
          options={activeBreakpoints(doc.breakpoints).map((b) => ({
            value: b,
            label: BREAKPOINT_LABEL[b],
          }))}
          onChange={props.onBreakpointChange}
        />
      </Section>
      <Section title="Page">
        <Row label="Title">
          <TextField
            label="Page title"
            value={page.seo.title}
            onCommit={(title) => updatePage({ seo: { ...page.seo, title } })}
          />
        </Row>
        <Row label="Path">
          <TextField
            label="Page path"
            value={page.path}
            onCommit={(path) => updatePage({ path })}
          />
        </Row>
        <Row label="Description">
          <TextField
            label="Page description"
            multiline
            value={page.seo.description}
            onCommit={(description) => updatePage({ seo: { ...page.seo, description } })}
          />
        </Row>
      </Section>
      <PageCodeSection page={page} apply={props.apply} />
      <Section title="Size and Position">
        <Row label="Width">
          <NumberField
            label="Breakpoint width"
            prefix="W"
            value={doc.breakpoints[bp]?.width}
            unit="px"
            onCommit={(v) => {
              const check = checkBreakpointWidth(bp, String(v));
              setWidthError(check.ok ? null : check.message);
              if (check.ok)
                props.apply([{ op: "setBreakpoint", breakpoint: bp, width: check.width }]);
            }}
          />
        </Row>
        {widthError ? (
          <p role="alert" className="text-[11px] text-destructive">
            {widthError}
          </p>
        ) : null}
        <Row label="Height">
          <span className="h-7 flex-1 rounded-md bg-muted/70 px-2 text-xs leading-7 text-muted-foreground">
            Fit
          </span>
        </Row>
      </Section>
      <Layout ctx={ctx} />
      <Padding ctx={ctx} />
      <Fill ctx={ctx} />
      <Section title="Selection colors">
        {colors.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No colors on this page yet.</p>
        ) : null}
        <ul className="grid gap-1" aria-label="Selection colors">
          {colors.map(([color, count]) => (
            <li key={color} className="flex items-center gap-1">
              <ColorField
                resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
                variableName={(id) => ctx.doc.variables[id]?.name}
                label={`Page color ${color}`}
                value={color}
                onCommit={(to) => props.apply(replaceColorOps(doc, page.root, color, to))}
              />
              <span
                className="w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums"
                title={`Used ${count} times`}
              >
                {count}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Guides">
        <Row label="Columns">
          <NumberField
            label="Guide columns"
            value={guides.columns}
            min={1}
            max={24}
            onCommit={(v) => setGuides({ columns: Math.round(v), visible: true })}
          />
        </Row>
        <Row label="Gutter / margin">
          <NumberField
            label="Guide gutter"
            value={guides.gutter}
            min={0}
            unit="px"
            onCommit={(v) => setGuides({ gutter: v })}
          />
          <NumberField
            label="Guide margin"
            value={guides.margin}
            min={0}
            unit="px"
            onCommit={(v) => setGuides({ margin: v })}
          />
        </Row>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={guides.visible}
            onChange={(e) => setGuides({ visible: e.target.checked })}
          />
          Show column guides on {BREAKPOINT_LABEL[bp]}
        </label>
      </Section>
      <ExportSection exports={props.exports} pageId={page.id} pageName={page.name} bp={bp} />
      <Checks doc={doc} rootId={page.root} onSelect={(id) => props.onSelectionChange([id])} />
    </>
  );
}

// ——— Entry ———

export type InspectorProps = {
  doc: ProjectDocument;
  page: Page;
  selection: string[];
  bp: BreakpointId;
  onBreakpointChange: (bp: BreakpointId) => void;
  onSelectionChange: (ids: string[]) => void;
  apply: (ops: Op[]) => void;
  guides: Guides;
  onGuidesChange: (g: Guides) => void;
  components?: ComponentActions;
  /** Uploads and file URLs, when the app provides them. */
  assets?: AssetHost;
  /** Image export, when the app provides it. */
  exports?: ExportHost;
  pickers?: PickerHost;
};

export function Inspector(props: InspectorProps) {
  const { doc, bp, selection } = props;
  const parents = useMemo(() => parentMap(doc), [doc]);
  if (selection.length > 1) {
    return (
      <div className="grid">
        <Header icon={FrameIcon} name={`${selection.length} layers`} type="Selection" bp={bp} />
        <Section title="Arrange">
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              props.apply(deleteOps(selection, parents));
              props.onSelectionChange([]);
            }}
          >
            <Trash2Icon />
            Delete {selection.length} layers
          </Button>
        </Section>
      </div>
    );
  }
  const node = selection[0] ? doc.nodes[selection[0]] : undefined;
  const editing = props.components?.editing;
  // The main component comes from the editor: the view document leaves it out of `components`.
  const main = editing?.component;
  if (main && (!node || node.id === props.page.root)) {
    return (
      <div className="grid">
        <Header icon={ComponentIcon} name={main.name} type="Main component" bp={bp} />
        <MainComponentSections
          doc={props.components?.doc ?? doc}
          c={main}
          variantKey={editing.variantKey}
          apply={props.apply}
          onVariantKey={(k) => props.components?.setVariantKey(k)}
          onDone={() => props.components?.done()}
          onSelect={(id) => props.onSelectionChange([id])}
        />
      </div>
    );
  }
  if (!node || node.id === props.page.root) {
    return (
      <div className="grid">
        <Header icon={FrameIcon} name={props.page.name} type="Page" bp={bp} />
        <PageInspector {...props} />
      </div>
    );
  }
  const ctx: Ctx = {
    doc,
    node,
    bp,
    apply: props.apply,
    assets: props.assets,
    pickers: props.pickers,
  };
  const parentId = parents.get(node.id);
  const container = node.type === "frame" || node.type === "link";
  if (node.type === "instance") {
    const c = doc.components[node.componentId];
    return (
      <div className="grid" key={node.id}>
        <Header
          icon={ComponentIcon}
          name={node.name || c?.name || "Instance"}
          type={`Instance of ${c?.name ?? "a missing component"}`}
          bp={bp}
        />
        <InstanceSections
          doc={props.components?.doc ?? doc}
          inst={node}
          apply={props.apply}
          actions={props.components}
          onSelectionChange={props.onSelectionChange}
        />
        <PositionSize ctx={ctx} parentId={parentId} />
        <LayerSection ctx={ctx} />
        <Accessibility ctx={ctx} />
      </div>
    );
  }
  const inMain = main && within(parents, node.id, main.root) ? main : undefined;
  const create = props.components?.create;
  return (
    <div className="grid" key={node.id}>
      <Header
        icon={TYPE_ICON[node.type]}
        name={node.name || TYPE_LABEL[node.type]}
        type={
          node.type === "frame"
            ? node.tag === "section"
              ? "Section"
              : "Frame"
            : TYPE_LABEL[node.type]
        }
        bp={bp}
      />
      {node.type === "frame" || node.type === "text" || node.type === "link" ? (
        <CreateComponent
          onCreate={create && node.id !== main?.root ? () => create(node.id) : undefined}
        />
      ) : null}
      {inMain ? (
        <ExposeSection
          doc={props.components?.doc ?? doc}
          c={inMain}
          node={node}
          apply={props.apply}
        />
      ) : null}
      {node.type === "text" ? <TextContent ctx={ctx} /> : null}
      {node.type === "frame" ? <StyleSection ctx={ctx} /> : null}
      {node.type === "image" ? <ImageSection ctx={ctx} /> : null}
      {node.type === "link" ? <LinkSection ctx={ctx} /> : null}
      {node.type === "icon" ? <IconSection ctx={ctx} /> : null}
      {node.type === "embed" ? <EmbedSection node={node} apply={props.apply} /> : null}
      <PositionSize ctx={ctx} parentId={parentId} text={node.type === "text"} />
      {container ? <Layout ctx={ctx} /> : null}
      {container ? <Padding ctx={ctx} /> : null}
      {node.type === "text" ? <Typography ctx={ctx} /> : null}
      {node.type === "text" || node.type === "image" ? (
        <LayerSection ctx={ctx} radius={node.type === "image"} />
      ) : null}
      {node.type === "text" ? (
        <Section title="Fill">
          <PropRow ctx={ctx} label="Text color" keys={["textColor"]}>
            <ColorField
              resolveVariable={(id) => variableColor(ctx.doc, ctx.bp, id)}
              variableName={(id) => ctx.doc.variables[id]?.name}
              label="Text"
              value={get(ctx, "textColor") ?? "#000000"}
              onCommit={(c) => set(ctx, "textColor", c)}
              bind={colorBind(ctx, (id) => set(ctx, "textColor", { var: id }))}
            />
          </PropRow>
        </Section>
      ) : node.type !== "image" ? (
        <Fill ctx={ctx} />
      ) : null}
      {node.type !== "text" ? (
        <Border ctx={ctx} title={node.type === "image" ? "Stroke" : "Border"} />
      ) : null}
      <Shadow ctx={ctx} />
      {container ? <LayerSection ctx={ctx} /> : null}
      <Accessibility ctx={ctx} />
      {node.type === "image" ? (
        <Arrange ctx={ctx} onSelectionChange={props.onSelectionChange} />
      ) : null}
      <Checks doc={doc} rootId={node.id} onSelect={(id) => props.onSelectionChange([id])} />
    </div>
  );
}

function Header(props: { icon: LucideIcon; name: string; type: string; bp: BreakpointId }) {
  const Icon = props.icon;
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" data-testid="inspector-name">
          {props.name}
        </p>
        <p className="text-[11px] text-muted-foreground">{props.type}</p>
      </div>
      <span
        data-testid="inspector-breakpoint"
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-medium",
          props.bp === "desktop" ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-700",
        )}
      >
        {BREAKPOINT_LABEL[props.bp]}
      </span>
    </div>
  );
}
