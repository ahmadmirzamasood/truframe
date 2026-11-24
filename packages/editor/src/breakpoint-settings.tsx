"use client";

import {
  BREAKPOINT_IDS,
  BREAKPOINT_RANGES,
  type BreakpointId,
  type Breakpoints,
} from "@truframe/model";
import { Button } from "@truframe/ui/components/button";
import { Input } from "@truframe/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@truframe/ui/components/popover";
import { PlusIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { addOps, checkBreakpointWidth, removeOps, setWidthOps } from "./breakpoints.ts";
import type { EditorHost } from "./host.ts";
import { BREAKPOINT_LABEL } from "./labels.ts";

function WidthRow(props: { id: BreakpointId; width: number; apply: EditorHost["apply"] }) {
  const { id } = props;
  const [value, setValue] = useState(String(props.width));
  const [error, setError] = useState<string | null>(null);
  // Follow remote changes while the field isn't being edited.
  useEffect(() => setValue(String(props.width)), [props.width]);
  const errorId = `bp-${id}-error`;
  const { min, max } = BREAKPOINT_RANGES[id];

  const commit = (e?: FormEvent) => {
    e?.preventDefault();
    const check = checkBreakpointWidth(id, value);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    if (check.width === props.width) return;
    const failure = props.apply(setWidthOps(id, check.width));
    if (failure) setError(failure.message);
  };

  return (
    <form onSubmit={commit} className="grid gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={`bp-${id}`} className="w-16 text-sm">
          {BREAKPOINT_LABEL[id]}
        </label>
        <div className="relative flex-1">
          <Input
            id={`bp-${id}`}
            inputMode="numeric"
            className="h-8 pr-8 font-mono tabular-nums"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : `bp-${id}-range`}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => commit()}
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
            px
          </span>
        </div>
        {id === "desktop" ? (
          <span className="size-8" aria-hidden />
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${BREAKPOINT_LABEL[id]}`}
            title={`Remove ${BREAKPOINT_LABEL[id]}`}
            onClick={() => props.apply(removeOps(id))}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="pl-18 text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p id={`bp-${id}-range`} className="pl-18 text-xs text-muted-foreground">
          {id === "desktop" ? `${min} px or wider. Can't be removed.` : `${min} to ${max} px`}
        </p>
      )}
    </form>
  );
}

export function BreakpointSettings(props: {
  breakpoints: Breakpoints;
  apply: EditorHost["apply"];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Breakpoint settings"
          title="Breakpoint settings"
        >
          <Settings2Icon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="grid w-80 gap-3" aria-label="Breakpoint settings">
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold">Breakpoints</p>
          <p className="text-xs text-muted-foreground">
            Styles flow from Desktop to Tablet to Mobile until you change them.
          </p>
        </div>
        {BREAKPOINT_IDS.map((id) => {
          const bp = props.breakpoints[id];
          if (bp) return <WidthRow key={id} id={id} width={bp.width} apply={props.apply} />;
          if (id === "desktop") return null;
          return (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => props.apply(addOps(id))}
            >
              <PlusIcon />
              Add {BREAKPOINT_LABEL[id]}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
