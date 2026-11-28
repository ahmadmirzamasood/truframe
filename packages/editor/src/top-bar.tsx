"use client";

import { activeBreakpoints, type BreakpointId, type ProjectDocument } from "@truframe/model";
import { Button } from "@truframe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@truframe/ui/components/dropdown-menu";
import { cn } from "@truframe/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CommandIcon,
  MonitorIcon,
  PlayIcon,
  Redo2Icon,
  SmartphoneIcon,
  TabletIcon,
  Undo2Icon,
} from "lucide-react";
import { BreakpointSettings } from "./breakpoint-settings.tsx";
import type { EditorHost } from "./host.ts";
import { BREAKPOINT_LABEL } from "./labels.ts";

export { BREAKPOINT_LABEL };

export type EditorView = "design" | "code";

const BREAKPOINT_ICON = { desktop: MonitorIcon, tablet: TabletIcon, mobile: SmartphoneIcon };

const STATUS_LABEL: Record<EditorHost["sync"]["status"], string> = {
  loading: "Loading…",
  connecting: "Connecting…",
  online: "Online",
  offline: "Offline",
};

function SegmentButton(props: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      aria-label={props.label}
      onClick={props.onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        props.pressed && "bg-background text-foreground shadow-xs",
      )}
    >
      {props.children}
    </button>
  );
}

export function TopBar(props: {
  host: EditorHost;
  doc: ProjectDocument | null;
  pageId: string | null;
  onPageChange: (id: string) => void;
  onManagePages: () => void;
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  breakpoint: BreakpointId;
  onBreakpointChange: (id: BreakpointId) => void;
  backHref: string;
  BackLink: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
  onOpenCommands: () => void;
  /** Absent where Preview isn't configured. */
  onPreview?: () => void;
}) {
  const { host, doc, BackLink } = props;
  const page = doc?.pages.find((p) => p.id === props.pageId);
  const breakpoints = doc ? activeBreakpoints(doc.breakpoints) : [];
  const { sync } = host;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-background px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <BackLink
          href={props.backHref}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          <span className="sr-only">Projects</span>
        </BackLink>
        <h1 className="truncate px-1 text-sm font-semibold">{host.projectName}</h1>
        <span className="text-muted-foreground/60" aria-hidden>
          /
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={!doc}>
              <span className="sr-only">Pages: </span>
              <span className="max-w-40 truncate">{page?.name ?? "Pages"}</span>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Pages</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={props.pageId ?? ""} onValueChange={props.onPageChange}>
              {doc?.pages.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{p.path}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onManagePages}>Manage pages…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3">
        <fieldset className="flex items-center rounded-md bg-muted p-0.5">
          <legend className="sr-only">View</legend>
          <SegmentButton
            pressed={props.view === "design"}
            onClick={() => props.onViewChange("design")}
          >
            Design
          </SegmentButton>
          <SegmentButton pressed={props.view === "code"} onClick={() => props.onViewChange("code")}>
            Code
          </SegmentButton>
        </fieldset>
        <fieldset aria-label="Breakpoints" className="flex items-center rounded-md bg-muted p-0.5">
          <legend className="sr-only">Breakpoints</legend>
          {breakpoints.map((id) => {
            const Icon = BREAKPOINT_ICON[id];
            const width = doc?.breakpoints[id]?.width;
            return (
              <SegmentButton
                key={id}
                pressed={props.breakpoint === id}
                onClick={() => props.onBreakpointChange(id)}
                label={`${BREAKPOINT_LABEL[id]} ${width}px`}
              >
                <Icon className="size-3.5" aria-hidden />
                <span>{BREAKPOINT_LABEL[id]}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {width}
                </span>
              </SegmentButton>
            );
          })}
        </fieldset>
        {doc ? <BreakpointSettings breakpoints={doc.breakpoints} apply={host.apply} /> : null}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        <output
          data-testid="sync-status"
          aria-live="polite"
          className={cn(
            "mr-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground",
            sync.status === "offline" && "bg-amber-100 text-amber-900",
          )}
        >
          {STATUS_LABEL[sync.status]}
          {sync.pending
            ? ` · ${sync.pending} unsaved ${sync.pending === 1 ? "change" : "changes"}`
            : ""}
        </output>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Commands"
          title="Commands (Ctrl+K)"
          onClick={props.onOpenCommands}
        >
          <CommandIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!sync.canUndo}
          onClick={host.undo}
        >
          <Undo2Icon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!sync.canRedo}
          onClick={host.redo}
        >
          <Redo2Icon />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ml-1 h-7"
          disabled={!props.onPreview || !doc}
          title={props.onPreview ? "Preview" : "Preview isn't configured on this server"}
          onClick={props.onPreview}
        >
          <PlayIcon aria-hidden />
          Preview
        </Button>
        <Button size="sm" className="h-7" disabled title="Coming soon">
          Publish
        </Button>
      </div>
    </header>
  );
}
