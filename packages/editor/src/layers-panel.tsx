"use client";

/**
 * Layers panel (PRD F10, F27): Desktop, Tablet and Mobile groups, each with the page's layer
 * tree. Rows show the layer's code class; selecting a row selects it on the canvas at that
 * breakpoint and vice versa. Rename (double-click), hide per breakpoint, lock, and drag to
 * reorder or reparent (one transaction per drop).
 */
import {
  activeBreakpoints,
  type BreakpointId,
  childrenOf,
  type Node,
  type Page,
  type ProjectDocument,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { cn } from "@truframe/ui/lib/utils";
import {
  ChevronRightIcon,
  ComponentIcon,
  EyeIcon,
  EyeOffIcon,
  FrameIcon,
  ImageIcon,
  LinkIcon,
  LockIcon,
  type LucideIcon,
  StarIcon,
  TypeIcon,
  UnlockIcon,
} from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reorderOps } from "./gestures.ts";
import { BREAKPOINT_LABEL } from "./labels.ts";
import { canContain, isAncestor, parentMap } from "./tree.ts";

const ICON: Record<Node["type"], LucideIcon> = {
  frame: FrameIcon,
  text: TypeIcon,
  image: ImageIcon,
  link: LinkIcon,
  icon: StarIcon,
  embed: FrameIcon,
  instance: ComponentIcon,
};

/** What a row is called: its name, else a text's words, else its type. */
export function layerLabel(node: Node): string {
  if (node.name.trim()) return node.name;
  if (node.type === "text") {
    const text = node.content
      .map((s) => s.text)
      .join("")
      .trim();
    if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  return node.type[0]?.toUpperCase() + node.type.slice(1);
}

/** Hidden at a breakpoint after the cascade (hidden on desktop hides below too unless shown). */
export function hiddenAt(doc: ProjectDocument, node: Node, bp: BreakpointId): boolean {
  let hidden = false;
  for (const id of activeBreakpoints(doc.breakpoints)) {
    const v = node.hidden?.[id];
    if (v !== undefined) hidden = v;
    if (id === bp) break;
  }
  return hidden;
}

type Drop = { targetId: string; position: "before" | "after" | "inside" };

/** The ops for dropping `dragId` relative to a row: one transaction. */
export function layerDropOps(doc: ProjectDocument, dragId: string, drop: Drop): Op[] {
  const parents = parentMap(doc);
  if (dragId === drop.targetId || isAncestor(parents, dragId, drop.targetId)) return [];
  if (drop.position === "inside") {
    if (!canContain(doc, drop.targetId, [dragId])) return [];
    const kids = childrenOf(doc.nodes[drop.targetId] as Node).filter((c) => c !== dragId);
    return reorderOps(doc, parents, [dragId], drop.targetId, kids.length);
  }
  const parentId = parents.get(drop.targetId);
  if (!parentId || !canContain(doc, parentId, [dragId])) return [];
  const kids = childrenOf(doc.nodes[parentId] as Node).filter((c) => c !== dragId);
  const at = kids.indexOf(drop.targetId) + (drop.position === "after" ? 1 : 0);
  return reorderOps(doc, parents, [dragId], parentId, at);
}

export type LayersPanelProps = {
  doc: ProjectDocument;
  page: Page;
  selection: string[];
  editing: BreakpointId;
  onSelect: (ids: string[], bp: BreakpointId) => void;
  apply: (ops: Op[]) => void;
  classes: ReadonlyMap<string, string>;
  locked: ReadonlySet<string>;
  onToggleLock: (id: string) => void;
};

export function LayersPanel(props: LayersPanelProps) {
  const { doc, page } = props;
  const [open, setOpen] = useState<Partial<Record<BreakpointId, boolean>>>({ desktop: true });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; drop: Drop | null } | null>(null);
  const root = doc.nodes[page.root];
  if (!root) return null;

  // The editing breakpoint's group opens when you select something there.
  const isOpen = (bp: BreakpointId) =>
    Boolean(open[bp]) || (props.selection.length > 0 && bp === props.editing);

  return (
    <div className="grid gap-px py-1 text-xs" data-testid="layers-panel">
      {activeBreakpoints(doc.breakpoints).map((bp) => (
        <div key={bp}>
          <button
            type="button"
            aria-expanded={isOpen(bp)}
            onClick={() => setOpen((o) => ({ ...o, [bp]: !isOpen(bp) }))}
            className={cn(
              "flex h-7 w-full items-center gap-1 px-2 text-left font-medium hover:bg-accent",
              bp === props.editing && "text-foreground",
            )}
          >
            <ChevronRightIcon
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                isOpen(bp) && "rotate-90",
              )}
              aria-hidden
            />
            {BREAKPOINT_LABEL[bp]}
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {doc.breakpoints[bp]?.width}
            </span>
          </button>
          {isOpen(bp) ? (
            <div role="tree" aria-label={`${BREAKPOINT_LABEL[bp]} layers`} className="grid">
              {childrenOf(root).map((id) => (
                <LayerRow
                  key={id}
                  {...props}
                  id={id}
                  bp={bp}
                  depth={1}
                  collapsed={collapsed}
                  onToggleCollapse={(nid) =>
                    setCollapsed((c) => {
                      const next = new Set(c);
                      if (next.has(nid)) next.delete(nid);
                      else next.add(nid);
                      return next;
                    })
                  }
                  drag={drag}
                  setDrag={setDrag}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LayerRow(
  props: LayersPanelProps & {
    id: string;
    bp: BreakpointId;
    depth: number;
    collapsed: ReadonlySet<string>;
    onToggleCollapse: (id: string) => void;
    drag: { id: string; drop: Drop | null } | null;
    setDrag: (d: { id: string; drop: Drop | null } | null) => void;
  },
) {
  const { doc, id, bp, depth } = props;
  const node = doc.nodes[id];
  const [renaming, setRenaming] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const selected = props.selection.includes(id) && bp === props.editing;
  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  if (!node) return null;
  const label = layerLabel(node);
  const kids = childrenOf(node);
  const expanded = kids.length > 0 && !props.collapsed.has(id);
  const hidden = hiddenAt(doc, node, bp);
  const locked = props.locked.has(id);
  const Icon = ICON[node.type];
  const drop = props.drag?.drop?.targetId === id ? props.drag.drop : null;

  const onDragOver = (e: DragEvent) => {
    if (!props.drag || props.drag.id === id) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientY - r.top) / r.height;
    const container = node.type === "frame" || node.type === "link";
    const position: Drop["position"] =
      container && t > 0.25 && t < 0.75 ? "inside" : t < 0.5 ? "before" : "after";
    if (drop?.position !== position)
      props.setDrag({ id: props.drag.id, drop: { targetId: id, position } });
  };

  return (
    <div
      role="treeitem"
      aria-label={label}
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={kids.length ? expanded : undefined}
      data-depth={depth}
      tabIndex={-1}
      className="grid outline-none"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the row is a drag-and-drop target; its buttons carry the keyboard actions. */}
      <div
        ref={row}
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
          props.setDrag({ id, drop: null });
        }}
        onDragOver={onDragOver}
        onDragLeave={() =>
          drop && props.setDrag(props.drag ? { id: props.drag.id, drop: null } : null)
        }
        onDrop={(e) => {
          e.preventDefault();
          const d = props.drag;
          props.setDrag(null);
          if (!d?.drop) return;
          const ops = layerDropOps(doc, d.id, d.drop);
          if (ops.length) props.apply(ops);
        }}
        onDragEnd={() => props.setDrag(null)}
        className={cn(
          "group relative flex h-7 items-center gap-1 pr-1 hover:bg-accent/70",
          selected && "bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950",
          hidden && "text-muted-foreground",
          drop?.position === "inside" && "ring-2 ring-[#0d99ff] ring-inset",
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {drop && drop.position !== "inside" ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-0 h-0.5 bg-[#0d99ff]",
              drop.position === "before" ? "top-0" : "bottom-0",
            )}
            style={{ left: 4 + depth * 12 }}
          />
        ) : null}
        {kids.length ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            onClick={() => props.onToggleCollapse(id)}
            className="grid size-4 shrink-0 place-items-center text-muted-foreground"
          >
            <ChevronRightIcon
              className={cn("size-3 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {renaming ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to rename.
            autoFocus
            aria-label={`Rename ${label}`}
            defaultValue={node.name}
            className="h-5 min-w-0 flex-1 rounded border bg-background px-1 text-xs outline-none"
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value !== node.name)
                props.apply([
                  { op: "setNodeFields", nodeId: id, fields: { name: e.target.value } },
                ]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              const ids = e.shiftKey
                ? props.selection.includes(id)
                  ? props.selection.filter((s) => s !== id)
                  : [...props.selection, id]
                : [id];
              props.onSelect(ids, bp);
            }}
            onDoubleClick={() => setRenaming(true)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline"
          >
            <span className="truncate">{label}</span>
            {props.classes.get(id) ? (
              <span
                className="truncate font-mono text-[10px] text-muted-foreground"
                data-testid="code-class"
              >
                .{props.classes.get(id)}
              </span>
            ) : null}
          </button>
        )}
        <button
          type="button"
          aria-label={`${locked ? "Unlock" : "Lock"} ${label}`}
          aria-pressed={locked}
          onClick={() => props.onToggleLock(id)}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground",
            !locked && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {locked ? <LockIcon className="size-3" /> : <UnlockIcon className="size-3" />}
        </button>
        <button
          type="button"
          aria-label={`${hidden ? "Show" : "Hide"} ${label} on ${BREAKPOINT_LABEL[bp]}`}
          aria-pressed={hidden}
          onClick={() =>
            props.apply([
              {
                op: "setNodeFields",
                nodeId: id,
                fields: { hidden: { ...node.hidden, [bp]: !hidden } },
              },
            ])
          }
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground",
            !hidden && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {hidden ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
        </button>
      </div>
      {expanded ? (
        // biome-ignore lint/a11y/useSemanticElements: a nested tree level, not a form group.
        <div role="group" className="grid">
          {kids.map((k) => (
            <LayerRow key={k} {...props} id={k} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Locks are an editing aid kept per browser and project; they don't change the site. */
export function useLocks(projectId: string | undefined) {
  const key = projectId ? `tf-locks:${projectId}` : null;
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!key) return;
    try {
      setLocked(new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]));
    } catch {
      setLocked(new Set());
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) =>
      setLocked((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (key) {
          try {
            localStorage.setItem(key, JSON.stringify([...next]));
          } catch {
            // Storage can be unavailable (private mode); locks then last for this tab only.
          }
        }
        return next;
      }),
    [key],
  );
  return useMemo(() => ({ locked, toggle }), [locked, toggle]);
}
