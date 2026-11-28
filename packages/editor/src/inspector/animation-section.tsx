"use client";

/**
 * The Animation section (PRD F30, P6A-3): trigger, from state, timing, easing, once / every
 * time, stagger children, presets and per-breakpoint switches. Every change writes the whole
 * animation with one `setNodeFields`, so each edit is one undo step.
 */
import {
  ANIMATION_EASINGS,
  ANIMATION_PRESETS,
  type Animation,
  type AnimationEasing,
  type AnimationFrom,
  type AnimationTrigger,
  defaultAnimation,
  type Node,
  type ProjectDocument,
  presetOf,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { PlayIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NumberField, Row, Section, Segmented, SelectField } from "./fields.tsx";

const TRIGGERS: { value: AnimationTrigger; label: string }[] = [
  { value: "load", label: "On load" },
  { value: "inView", label: "In view" },
  { value: "loop", label: "Loop" },
];

const EASING_LABEL: Record<AnimationEasing, string> = {
  ease: "Ease",
  "ease-in": "Ease in",
  "ease-out": "Ease out",
  "ease-in-out": "Ease in out",
  linear: "Linear",
  "back-out": "Back out (overshoot)",
};

/**
 * From-state fields. `scale` and `opacity` show as percentages; a value equal to the layer's
 * own (`rest`) removes the key, so presets still match.
 */
const FROM_FIELDS: {
  key: keyof AnimationFrom;
  label: string;
  unit: string;
  factor: number;
  rest: number;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "opacity", label: "Opacity", unit: "%", factor: 100, rest: 1, min: 0, max: 100, step: 5 },
  { key: "x", label: "Move X", unit: "px", factor: 1, rest: 0, min: -2000, max: 2000, step: 1 },
  { key: "y", label: "Move Y", unit: "px", factor: 1, rest: 0, min: -2000, max: 2000, step: 1 },
  { key: "scale", label: "Scale", unit: "%", factor: 100, rest: 1, min: 0, max: 1000, step: 5 },
  { key: "rotate", label: "Rotate", unit: "°", factor: 1, rest: 0, min: -720, max: 720, step: 1 },
  { key: "blur", label: "Blur", unit: "px", factor: 1, rest: 0, min: 0, max: 100, step: 1 },
];

export function AnimationSection(props: {
  doc: ProjectDocument;
  node: Node;
  apply: (ops: Op[]) => void;
  /** ▶ Play on the canvas (P6A-4); absent where the canvas can't replay. */
  onPlay?: () => void;
}) {
  const { node, doc } = props;
  const a = node.animation;
  const write = (animation: Animation | null) =>
    props.apply([{ op: "setNodeFields", nodeId: node.id, fields: { animation } }]);
  if (!a) {
    return <Section title="Animation" onAdd={() => write(defaultAnimation())} />;
  }
  const change = (patch: Partial<Animation>) => write({ ...a, ...patch });
  const setFrom = (key: keyof AnimationFrom, value: number, rest: number) => {
    const from = { ...a.from };
    if (value === rest) delete from[key];
    else from[key] = value;
    change({ from });
  };
  const preset = presetOf(a.from);
  const staggers = node.type === "frame" || node.type === "link";
  const disabled = (bp: "tablet" | "mobile") => a.disabledOn.includes(bp);
  const toggle = (bp: "tablet" | "mobile", off: boolean) =>
    change({
      disabledOn: (["tablet", "mobile"] as const).filter((b) => (b === bp ? off : disabled(b))),
    });

  return (
    <Section title="Animation" onRemove={() => write(null)}>
      <Row label="Preset">
        <SelectField
          label="Animation preset"
          value={preset ?? "custom"}
          options={[
            ...ANIMATION_PRESETS.map((p) => ({ value: p.id, label: p.name })),
            { value: "custom", label: "Custom", disabled: true },
          ]}
          onChange={(id) => {
            const p = ANIMATION_PRESETS.find((x) => x.id === id);
            if (p) change({ from: { ...p.from } });
          }}
        />
        {props.onPlay ? (
          <button
            type="button"
            aria-label="Play animation"
            title="Play on the canvas"
            onClick={props.onPlay}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 outline-none"
          >
            <PlayIcon className="size-3.5" />
          </button>
        ) : null}
      </Row>
      <Row label="Trigger">
        <Segmented
          label="Animation trigger"
          value={a.trigger}
          options={TRIGGERS}
          onChange={(trigger) => change({ trigger })}
        />
      </Row>
      {a.trigger === "inView" ? (
        <Row label="Play">
          <Segmented
            label="Play once or every time"
            value={a.once ? "once" : "every"}
            options={[
              { value: "once", label: "Once" },
              { value: "every", label: "Every time" },
            ]}
            onChange={(v) => change({ once: v === "once" })}
          />
        </Row>
      ) : null}
      <p className="text-[11px] font-medium text-muted-foreground">From</p>
      {FROM_FIELDS.map((f) => (
        <Row key={f.key} label={f.label}>
          <NumberField
            label={`From ${f.label.toLowerCase()}`}
            value={(a.from[f.key] ?? f.rest) * f.factor}
            min={f.min}
            max={f.max}
            step={f.step}
            unit={f.unit}
            onCommit={(v) => setFrom(f.key, v / f.factor, f.rest)}
          />
        </Row>
      ))}
      <Row label="Duration">
        <NumberField
          label="Animation duration"
          value={a.duration}
          min={50}
          max={10_000}
          step={50}
          unit="ms"
          onCommit={(duration) => change({ duration: Math.round(duration) })}
        />
      </Row>
      <Row label="Delay">
        <NumberField
          label="Animation delay"
          value={a.delay}
          min={0}
          max={10_000}
          step={50}
          unit="ms"
          onCommit={(delay) => change({ delay: Math.round(delay) })}
        />
      </Row>
      <Row label="Easing">
        <SelectField
          label="Animation easing"
          value={a.easing}
          options={ANIMATION_EASINGS.map((e) => ({ value: e, label: EASING_LABEL[e] }))}
          onChange={(easing) => change({ easing })}
        />
      </Row>
      {staggers ? (
        <Check
          label="Stagger children"
          checked={a.staggerChildren !== undefined}
          onChange={(on) => {
            const { staggerChildren: _, ...rest } = a;
            write(on ? { ...rest, staggerChildren: 80 } : rest);
          }}
        >
          {a.staggerChildren !== undefined ? (
            <div className="w-24">
              <NumberField
                label="Stagger between children"
                value={a.staggerChildren}
                min={0}
                max={5000}
                step={10}
                unit="ms"
                onCommit={(v) => change({ staggerChildren: Math.round(v) })}
              />
            </div>
          ) : null}
        </Check>
      ) : null}
      {doc.breakpoints.tablet || doc.breakpoints.mobile ? (
        <div className="grid gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">Turn off on</p>
          {doc.breakpoints.tablet ? (
            <Check
              label="Off on Tablet"
              checked={disabled("tablet")}
              onChange={(off) => toggle("tablet", off)}
            />
          ) : null}
          {doc.breakpoints.mobile ? (
            <Check
              label="Off on Mobile"
              checked={disabled("mobile")}
              onChange={(off) => toggle("mobile", off)}
            />
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Visitors who ask for reduced motion see the layer without animation.
      </p>
    </Section>
  );
}

function Check(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-7 items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        {props.label}
      </label>
      {props.children}
    </div>
  );
}
