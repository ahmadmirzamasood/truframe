"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@truframe/ui/components/dropdown-menu";
/**
 * Inspector controls (PRD F29 conventions): scrub-able number fields with units, segmented
 * buttons, selects, color + opacity, and the red override dot with "Reset to inherited".
 * Every control commits once (Enter, blur, select, or the end of a scrub), so each edit is one
 * transaction.
 */
import { cn } from "@truframe/ui/lib/utils";
import { MinusIcon, PlusIcon, RotateCcwIcon, Unlink2Icon, VariableIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { hexAlpha, withAlpha } from "./model.ts";

export function Section(props: {
  title: string;
  children?: ReactNode;
  /** `+` on the section title adds optional settings (border, shadow…). */
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  return (
    <section aria-label={props.title} className="grid gap-2 border-b px-3 py-3">
      <div className="flex h-5 items-center justify-between">
        <h3 className="text-[11px] font-semibold">{props.title}</h3>
        {props.onAdd ? (
          <button
            type="button"
            aria-label={`Add ${props.title.toLowerCase()}`}
            onClick={props.onAdd}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
          </button>
        ) : props.onRemove ? (
          <button
            type="button"
            aria-label={`Remove ${props.title.toLowerCase()}`}
            onClick={props.onRemove}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MinusIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

/** A labelled row; `overridden` shows the red dot and a reset action. */
export function Row(props: {
  label: string;
  htmlFor?: string;
  overridden?: boolean;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {props.overridden ? (
          <button
            type="button"
            title="Overridden at this breakpoint. Click to reset to inherited."
            aria-label={`Reset ${props.label} to inherited`}
            onClick={props.onReset}
            className="group grid size-3.5 shrink-0 place-items-center"
          >
            <span className="size-1.5 rounded-full bg-red-500 group-hover:hidden" />
            <RotateCcwIcon className="hidden size-3 text-red-600 group-hover:block" />
          </button>
        ) : null}
        <label htmlFor={props.htmlFor} className="truncate text-[11px] text-muted-foreground">
          {props.label}
        </label>
      </div>
      <div className="flex min-w-0 items-center gap-1">{props.children}</div>
    </div>
  );
}

const inputClass =
  "h-7 w-full min-w-0 rounded-md border border-transparent bg-muted/70 px-2 text-xs tabular-nums outline-none hover:border-border focus:border-ring focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50";

function formatNumber(v: number | undefined): string {
  return v === undefined ? "" : String(Math.round(v * 1000) / 1000);
}

export function NumberField(props: {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Short name shown inside the field (W, H, X…) that doubles as the scrub handle. */
  prefix?: string;
}) {
  const id = useId();
  const step = props.step ?? 1;
  const [text, setText] = useState(formatNumber(props.value));
  const scrub = useRef<{ x: number; start: number; id: number } | null>(null);
  useEffect(() => setText(formatNumber(props.value)), [props.value]);

  const clamp = (v: number) =>
    Math.min(
      props.max ?? Number.POSITIVE_INFINITY,
      Math.max(props.min ?? Number.NEGATIVE_INFINITY, v),
    );
  const commit = (raw: string) => {
    const v = Number(raw.replace(props.unit ?? "", "").trim());
    if (raw.trim() === "" || !Number.isFinite(v)) {
      setText(formatNumber(props.value));
      return;
    }
    const next = clamp(v);
    setText(formatNumber(next));
    if (next !== props.value) props.onCommit(next);
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      {props.prefix ? (
        // Drag the prefix left/right to change the value; one change when released.
        <span
          aria-hidden
          className={cn(
            "absolute left-0 grid h-7 w-6 cursor-ew-resize place-items-center text-[10px] text-muted-foreground select-none",
            props.disabled && "pointer-events-none",
          )}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub.current = { x: e.clientX, start: props.value ?? 0, id: e.pointerId };
          }}
          onPointerMove={(e) => {
            const s = scrub.current;
            if (!s || s.id !== e.pointerId) return;
            const delta = Math.round((e.clientX - s.x) / 2) * step * (e.shiftKey ? 10 : 1);
            setText(formatNumber(clamp(s.start + delta)));
          }}
          onPointerUp={() => {
            if (!scrub.current) return;
            scrub.current = null;
            commit(text);
          }}
        >
          {props.prefix}
        </span>
      ) : null}
      <input
        id={id}
        aria-label={props.label}
        inputMode="decimal"
        disabled={props.disabled}
        placeholder={props.placeholder}
        className={cn(inputClass, props.prefix && "pl-6", props.unit && "pr-7")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const dir = e.key === "ArrowUp" ? 1 : -1;
            const v = clamp((Number(text) || 0) + dir * step * (e.shiftKey ? 10 : 1));
            setText(formatNumber(v));
            props.onCommit(v);
          }
        }}
      />
      {props.unit ? (
        <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground">
          {props.unit}
        </span>
      ) : null}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = () => {
    if (text !== props.value) props.onCommit(text);
  };
  return props.multiline ? (
    <textarea
      aria-label={props.label}
      value={text}
      rows={3}
      placeholder={props.placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      className={cn(inputClass, "h-auto min-h-16 resize-y py-1.5 leading-snug")}
    />
  ) : (
    <input
      aria-label={props.label}
      value={text}
      placeholder={props.placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={inputClass}
    />
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string; icon?: ReactNode; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="flex min-w-0 flex-1 rounded-md bg-muted/70 p-0.5"
    >
      {props.options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented control; buttons keep the compact look and keyboard focus.
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          aria-label={o.icon ? o.label : undefined}
          title={o.label}
          disabled={o.disabled}
          onClick={() => props.onChange(o.value)}
          className={cn(
            "flex h-6 min-w-0 flex-1 items-center justify-center truncate rounded-[5px] px-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40",
            props.value === o.value && "bg-background text-foreground shadow-xs",
          )}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T | "";
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
      className={cn(inputClass, "pr-1")}
    >
      {props.value === "" ? <option value="">{props.placeholder ?? "—"}</option> : null}
      {props.options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A literal color with opacity, or a bound variable shown by name. */
export function ColorField(props: {
  label: string;
  value: string | { var: string } | undefined;
  variableName?: (id: string) => string | undefined;
  /** The bound variable's value at the editing breakpoint (detach keeps it). */
  resolveVariable?: (id: string) => string | undefined;
  onCommit: (value: string) => void;
  /** Offer "bind to a variable" next to a literal color (PRD F13). */
  bind?: { options: readonly BindOption[]; onBind: (id: string) => void };
}) {
  const literal = typeof props.value === "string" ? props.value : undefined;
  const { hex, alpha } = hexAlpha(literal ?? "#000000");
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);
  if (props.value && typeof props.value === "object") {
    const v = props.value.var;
    const resolved = props.resolveVariable?.(v);
    return (
      <BoundChip
        label={props.label}
        name={props.variableName?.(v) ?? v}
        swatch={resolved ?? ""}
        detachable={resolved !== undefined}
        onDetach={() => resolved && props.onCommit(resolved)}
        rebind={props.bind && { kind: "color", ...props.bind }}
      />
    );
  }
  const commitHex = (raw: string) => {
    const v = raw.trim().toLowerCase();
    const full = /^#?[0-9a-f]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
    if (!full) return setText(hex);
    props.onCommit(withAlpha(full, alpha));
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        type="color"
        aria-label={`${props.label} color`}
        value={hex}
        onChange={(e) => props.onCommit(withAlpha(e.target.value, alpha))}
        className="size-7 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <input
        aria-label={`${props.label} hex`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitHex(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commitHex((e.target as HTMLInputElement).value)}
        className={cn(inputClass, "font-mono uppercase")}
      />
      <div className="w-16 shrink-0">
        <NumberField
          label={`${props.label} opacity`}
          value={Math.round(alpha * 100)}
          min={0}
          max={100}
          unit="%"
          onCommit={(v) => props.onCommit(withAlpha(hex, v / 100))}
        />
      </div>
      {props.bind ? (
        <BindMenu
          label={props.label}
          kind="color"
          options={props.bind.options}
          onBind={props.bind.onBind}
        />
      ) : null}
    </div>
  );
}

/** One variable offered by a bind menu, with its value at the editing breakpoint. */
export type BindOption = { id: string; name: string; group: string; preview: string };

/** The variable button next to a field (PRD F13): lists variables of the matching type. */
export function BindMenu(props: {
  label: string;
  options: readonly BindOption[];
  kind: "color" | "spacing";
  onBind: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Bind ${props.label.toLowerCase()} to a variable`}
        title="Bind to a variable"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent data-[state=open]:bg-accent"
      >
        <VariableIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
        {props.options.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No {props.kind} variables yet. Create one in the Variables panel.
          </p>
        ) : (
          props.options.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => props.onBind(o.id)} className="text-xs">
              {props.kind === "color" ? (
                <span
                  className="size-3 shrink-0 rounded-sm border"
                  style={{ background: o.preview }}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">
                {o.group ? <span className="text-muted-foreground">{o.group} / </span> : null}
                {o.name}
              </span>
              {props.kind === "spacing" ? (
                <span className="font-mono text-[10px] text-muted-foreground">{o.preview}</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A bound variable shown by name, with detach (keeps the current value). */
function BoundChip(props: {
  label: string;
  name: string;
  swatch?: string;
  detachable: boolean;
  onDetach: () => void;
  /** Switch to another variable of the same type. */
  rebind?: {
    kind: "color" | "spacing";
    options: readonly BindOption[];
    onBind: (id: string) => void;
  };
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <span
        data-testid="bound-variable"
        title={props.name}
        className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-violet-500/10 px-2 text-xs text-violet-900 dark:text-violet-200"
      >
        {props.swatch !== undefined ? (
          <span
            className="size-3 shrink-0 rounded-sm border"
            style={{ background: props.swatch || "transparent" }}
          />
        ) : (
          <VariableIcon className="size-3 shrink-0" aria-hidden />
        )}
        <span className="truncate">{props.name}</span>
      </span>
      <button
        type="button"
        aria-label={`Detach ${props.label.toLowerCase()} variable`}
        title="Detach variable (keeps the current value)"
        disabled={!props.detachable}
        onClick={props.onDetach}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
      >
        <Unlink2Icon className="size-3.5" />
      </button>
      {props.rebind ? (
        <BindMenu
          label={props.label}
          kind={props.rebind.kind}
          options={props.rebind.options}
          onBind={props.rebind.onBind}
        />
      ) : null}
    </div>
  );
}

/** A px length that can be bound to a spacing variable (gap, padding, size, radius). */
export function SpacingField(props: {
  label: string;
  value: number | { var: string } | undefined;
  onCommit: (value: number) => void;
  /** Absent: the field can't be bound (e.g. per-corner radii). */
  bind?: {
    options: readonly BindOption[];
    name: (id: string) => string | undefined;
    resolve: (id: string) => number | undefined;
    onBind: (id: string) => void;
  };
  prefix?: string;
  unit?: string;
  min?: number;
  placeholder?: string;
}) {
  const v = props.value;
  if (v && typeof v === "object") {
    const resolved = props.bind?.resolve(v.var);
    return (
      <BoundChip
        label={props.label}
        name={props.bind?.name(v.var) ?? v.var}
        detachable={resolved !== undefined}
        onDetach={() => resolved !== undefined && props.onCommit(resolved)}
        rebind={props.bind && { kind: "spacing", ...props.bind }}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      <NumberField
        label={props.label}
        prefix={props.prefix}
        unit={props.unit}
        min={props.min}
        placeholder={props.placeholder}
        value={v}
        onCommit={props.onCommit}
      />
      {props.bind ? (
        <BindMenu
          label={props.label}
          kind="spacing"
          options={props.bind.options}
          onBind={props.bind.onBind}
        />
      ) : null}
    </div>
  );
}
