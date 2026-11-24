"use client";

/**
 * Selection, hover, drag, resize, snapping guides and measurements on the canvas
 * (PRD F4, ARCHITECTURE §8). Layer boxes are measured from the rendered frames into
 * frame-local world coordinates; overlays are drawn in screen space so lines stay one pixel
 * wide at any zoom. Gestures preview while the pointer moves and call `apply` once at the end.
 */
import {
  type FlowAxis,
  type Guide,
  HANDLES,
  type Handle,
  type Measure,
  measureBetween,
  type Point,
  type Rect,
} from "@truframe/layout";
import type { BreakpointId, ProjectDocument } from "@truframe/model";
import type { Op } from "@truframe/ops";
import { cn } from "@truframe/ui/lib/utils";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Camera, screenToWorld, worldRectToScreen } from "./camera.ts";
import type { FrameBox } from "./frames.ts";
import {
  type DragContext,
  type DragPreview,
  deleteOps,
  dragOps,
  dragPreview,
  type ResizeContext,
  resizeEndOps,
  resizePreview,
} from "./gestures.ts";
import { type Boxes, clickTarget, drillTarget, hitPath } from "./hit.ts";
import type { Guides } from "./inspector/inspector.tsx";
import { parentMap } from "./tree.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_START = 3;
/** Snap distance on screen. */
const SNAP_PX = 6;

type Measured = Map<BreakpointId, { boxes: Map<string, Rect>; flows: Map<string, FlowAxis> }>;

function measure(world: HTMLElement): Measured {
  const out: Measured = new Map();
  for (const frame of world.querySelectorAll<HTMLElement>("[data-frame]")) {
    const bp = frame.dataset.frame as BreakpointId;
    const fr = frame.getBoundingClientRect();
    const zoom = frame.offsetWidth > 0 ? fr.width / frame.offsetWidth : 1;
    const boxes = new Map<string, Rect>();
    const flows = new Map<string, FlowAxis>();
    for (const el of frame.querySelectorAll<HTMLElement>("[data-tf-node]")) {
      const id = el.dataset.tfNode as string;
      const r = el.getBoundingClientRect();
      boxes.set(id, {
        x: (r.left - fr.left) / zoom,
        y: (r.top - fr.top) / zoom,
        width: r.width / zoom,
        height: r.height / zoom,
      });
      const cs = getComputedStyle(el);
      flows.set(
        id,
        cs.display.includes("grid")
          ? "grid"
          : cs.display.includes("flex") && cs.flexDirection.startsWith("row")
            ? "row"
            : "column",
      );
    }
    out.set(bp, { boxes, flows });
  }
  return out;
}

type Session =
  | {
      kind: "press";
      start: { x: number; y: number };
      bp: BreakpointId;
      world: Point;
      ids: string[];
    }
  | { kind: "drag"; ctx: DragContext; preview: DragPreview; frame: Rect }
  | {
      kind: "resize";
      ctx: ResizeContext;
      start: { x: number; y: number };
      rect: Rect;
      guides: Guide[];
      frame: Rect;
    };

export type SelectionLayerProps = {
  doc: ProjectDocument;
  pageRoot: string;
  camera: Camera;
  frames: FrameBox[];
  world: HTMLElement | null;
  /** Changes whenever the rendered content may have moved (document, compile output). */
  renderKey: unknown;
  editing: BreakpointId;
  onEditingChange: (bp: BreakpointId) => void;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  apply: (ops: Op[]) => { message: string } | null;
  /** Space is held: the canvas pans instead. */
  panning: boolean;
  guides?: Guides;
  /** Locked layers (and everything inside them) can't be picked on the canvas. */
  locked?: ReadonlySet<string>;
};

export function SelectionLayer(props: SelectionLayerProps) {
  const { doc, pageRoot, camera, frames, world, editing, selection } = props;
  const layer = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured>(new Map());
  const [hover, setHover] = useState<{ bp: BreakpointId; id: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [alt, setAlt] = useState(false);
  const parents = useMemo(() => parentMap(doc), [doc]);

  // Re-measure after every render that could move layers, and when frames resize.
  // biome-ignore lint/correctness/useExhaustiveDependencies: renderKey stands for the content.
  useLayoutEffect(() => {
    if (!world) return;
    const run = () => setMeasured(measure(world));
    run();
    const observer = new ResizeObserver(run);
    for (const f of world.querySelectorAll("[data-frame] > [data-tf-frame]")) observer.observe(f);
    return () => observer.disconnect();
  }, [world, props.renderKey, frames.length]);

  const frameRect = useCallback(
    (bp: BreakpointId) => frames.find((f) => f.breakpoint === bp)?.rect ?? null,
    [frames],
  );
  const toScreen = (bp: BreakpointId, r: Rect): Rect | null => {
    const f = frameRect(bp);
    return f ? worldRectToScreen(camera, { ...r, x: f.x + r.x, y: f.y + r.y }) : null;
  };

  /** Viewport point → frame under it and the frame-local world point. */
  const locate = (e: { clientX: number; clientY: number }) => {
    const box = layer.current?.getBoundingClientRect();
    if (!box) return null;
    const screen = { x: e.clientX - box.left, y: e.clientY - box.top };
    const w = screenToWorld(camera, screen);
    for (const f of frames) {
      const r = f.rect;
      if (w.x >= r.x && w.x <= r.x + r.width && w.y >= r.y && w.y <= r.y + r.height)
        return { bp: f.breakpoint, local: { x: w.x - r.x, y: w.y - r.y }, screen };
    }
    return { bp: null, local: w, screen };
  };

  const boxesOf = (bp: BreakpointId): Boxes => measured.get(bp)?.boxes ?? new Map();
  const pick = (bp: BreakpointId, p: Point): string[] => {
    const path = hitPath(doc, pageRoot, boxesOf(bp), p);
    const cut = path.findIndex((id) => props.locked?.has(id));
    return cut >= 0 ? path.slice(0, cut) : path;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || props.panning) return;
    const at = locate(e);
    if (!at) return;
    if (!at.bp) {
      props.onSelectionChange([]);
      return;
    }
    const path = pick(at.bp, at.local);
    const target = clickTarget(path, parents, selection.at(-1) ?? null, e.ctrlKey || e.metaKey);
    if (at.bp !== editing) props.onEditingChange(at.bp);
    if (!target) {
      props.onSelectionChange([]);
      return;
    }
    if (e.shiftKey) {
      props.onSelectionChange(
        selection.includes(target) ? selection.filter((s) => s !== target) : [...selection, target],
      );
      return;
    }
    const ids = selection.includes(target) ? selection : [target];
    if (!selection.includes(target)) props.onSelectionChange(ids);
    e.currentTarget.setPointerCapture(e.pointerId);
    setSession({ kind: "press", start: at.screen, bp: at.bp, world: at.local, ids });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    setAlt(e.altKey);
    const at = locate(e);
    if (!at) return;
    if (!session) {
      if (!at.bp || props.panning) return setHover(null);
      const path = pick(at.bp, at.local);
      const id = clickTarget(path, parents, selection.at(-1) ?? null, e.ctrlKey || e.metaKey);
      setHover(id ? { bp: at.bp, id } : null);
      return;
    }
    if (session.kind === "press") {
      if (Math.hypot(at.screen.x - session.start.x, at.screen.y - session.start.y) < DRAG_START)
        return;
      const ids = session.ids.filter((id) => id !== pageRoot);
      const frame = frameRect(session.bp);
      if (ids.length === 0 || !frame) return;
      const ctx: DragContext = {
        doc,
        bp: session.bp,
        pageRoot,
        parents,
        boxes: boxesOf(session.bp),
        flow: (id) => measured.get(session.bp)?.flows.get(id) ?? "column",
        ids: orderInDocument(ids, parents, doc),
        start: session.world,
        snap: SNAP_PX / camera.zoom,
      };
      const w = screenToWorld(camera, at.screen);
      setSession({
        kind: "drag",
        ctx,
        preview: dragPreview(ctx, { x: w.x - frame.x, y: w.y - frame.y }),
        frame,
      });
      return;
    }
    if (session.kind === "drag") {
      const f = session.frame;
      const w = screenToWorld(camera, at.screen);
      setSession({ ...session, preview: dragPreview(session.ctx, { x: w.x - f.x, y: w.y - f.y }) });
      return;
    }
    const dx = (at.screen.x - session.start.x) / camera.zoom;
    const dy = (at.screen.y - session.start.y) / camera.zoom;
    const { rect, guides } = resizePreview(session.ctx, dx, dy, e.shiftKey);
    setSession({ ...session, rect, guides });
  };

  const onPointerUp = () => {
    const s = session;
    setSession(null);
    if (!s || s.kind === "press") return;
    // One gesture, one transaction.
    const ops = s.kind === "drag" ? dragOps(s.ctx, s.preview) : resizeEndOps(s.ctx, s.rect);
    if (ops.length) props.apply(ops);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const at = locate(e);
    if (!at?.bp) return;
    const next = drillTarget(pick(at.bp, at.local), selection.at(-1) ?? null);
    if (next) props.onSelectionChange([next]);
  };

  const startResize = (handle: Handle, e: React.PointerEvent) => {
    const id = selection[0];
    const boxes = boxesOf(editing);
    const box = id ? boxes.get(id) : undefined;
    const parentId = id ? parents.get(id) : undefined;
    const parent = parentId ? boxes.get(parentId) : undefined;
    const frame = frameRect(editing);
    if (!id || !box || !parent || !parentId || !frame || e.button !== 0) return;
    e.stopPropagation();
    layer.current?.setPointerCapture(e.pointerId);
    const siblings = ((doc.nodes[parentId] as { children?: string[] }).children ?? [])
      .filter((s) => s !== id)
      .flatMap((s) => (boxes.get(s) ? [boxes.get(s) as Rect] : []));
    const box0 = layer.current?.getBoundingClientRect();
    setSession({
      kind: "resize",
      ctx: {
        doc,
        bp: editing,
        id,
        handle,
        start: box,
        parent,
        siblings,
        snap: SNAP_PX / camera.zoom,
      },
      start: { x: e.clientX - (box0?.left ?? 0), y: e.clientY - (box0?.top ?? 0) },
      rect: box,
      guides: [],
      frame,
    });
  };

  // Keyboard: Escape selects the parent, Delete removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setAlt(e.altKey);
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]"))
        return;
      if (e.key === "Escape" && selection.length) {
        const parent = parents.get(selection[0] as string);
        props.onSelectionChange(parent && parent !== pageRoot ? [parent] : []);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
        e.preventDefault();
        const ops = deleteOps(selection, parents);
        if (ops.length && !props.apply(ops)) props.onSelectionChange([]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => setAlt(e.altKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selection, parents, pageRoot, props.onSelectionChange, props.apply]);

  // ——— Drawing ———
  const overlays: ReactNode[] = [];
  // Column guides: equal columns between the side margins, per breakpoint.
  for (const f of frames) {
    const g = props.guides?.[f.breakpoint];
    if (!g?.visible || g.columns < 1) continue;
    const inner = f.rect.width - 2 * g.margin;
    const col = (inner - g.gutter * (g.columns - 1)) / g.columns;
    if (col <= 0) continue;
    for (let i = 0; i < g.columns; i++) {
      const r = toScreen(f.breakpoint, {
        x: g.margin + i * (col + g.gutter),
        y: 0,
        width: col,
        height: f.rect.height,
      });
      if (r)
        overlays.push(
          <div
            key={`col-${f.breakpoint}-${i}`}
            data-testid="column-guide"
            className="pointer-events-none absolute bg-red-500/8"
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />,
        );
    }
  }
  const outline = (key: string, r: Rect | null, className: string, testId?: string) =>
    r
      ? overlays.push(
          <div
            key={key}
            data-testid={testId}
            className={cn("pointer-events-none absolute", className)}
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          />,
        )
      : null;

  const editingBoxes = boxesOf(editing);
  const resizing = session?.kind === "resize" ? session : null;
  const dragging = session?.kind === "drag" ? session : null;

  if (hover && !selection.includes(hover.id) && !session) {
    const b = boxesOf(hover.bp).get(hover.id);
    if (b) outline("hover", toScreen(hover.bp, b), "outline outline-1 outline-[#0d99ff]");
  }
  for (const id of selection) {
    for (const f of frames) {
      const b = boxesOf(f.breakpoint).get(id);
      if (!b) continue;
      const active = f.breakpoint === editing;
      const r = resizing && active && id === resizing.ctx.id ? resizing.rect : b;
      outline(
        `sel-${f.breakpoint}-${id}`,
        toScreen(f.breakpoint, r),
        active ? "outline-2 outline outline-[#0d99ff]" : "outline outline-1 outline-[#0d99ff]/40",
        active ? "selection-outline" : undefined,
      );
    }
  }
  const single = selection.length === 1 && selection[0] !== pageRoot ? selection[0] : null;
  const singleBox = single ? (resizing?.rect ?? editingBoxes.get(single)) : undefined;
  const singleScreen = singleBox ? toScreen(editing, singleBox) : null;
  if (singleScreen && !dragging) {
    for (const h of HANDLES) {
      const x =
        singleScreen.x +
        (h.includes("w") ? 0 : h.includes("e") ? singleScreen.width : singleScreen.width / 2);
      const y =
        singleScreen.y +
        (h.includes("n") ? 0 : h.includes("s") ? singleScreen.height : singleScreen.height / 2);
      overlays.push(
        <div
          key={`h-${h}`}
          data-handle={h}
          aria-hidden
          onPointerDown={(e) => startResize(h, e)}
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-[#0d99ff] bg-white"
          style={{ left: x, top: y, cursor: `${h}-resize` }}
        />,
      );
    }
    // The size pill would sit on top of the bottom distance while measuring.
    if (!alt)
      overlays.push(
        <div
          key="size"
          data-testid="selection-size"
          className="pointer-events-none absolute -translate-x-1/2 rounded-[3px] bg-[#0d99ff] px-1 py-px font-mono text-[10px] leading-4 text-white tabular-nums"
          style={{
            left: singleScreen.x + singleScreen.width / 2,
            top: singleScreen.y + singleScreen.height + 6,
          }}
        >
          {Math.round(singleBox?.width ?? 0)} × {Math.round(singleBox?.height ?? 0)}
        </div>,
      );
  }

  const guides: Guide[] =
    resizing?.guides ?? (dragging?.preview.kind === "absolute" ? dragging.preview.guides : []);
  const guideFrame = resizing ? editing : (dragging?.ctx.bp ?? editing);
  for (const [i, g] of guides.entries()) {
    const r =
      g.axis === "x"
        ? toScreen(guideFrame, { x: g.at, y: g.from, width: 0, height: g.to - g.from })
        : toScreen(guideFrame, { x: g.from, y: g.at, width: g.to - g.from, height: 0 });
    if (r)
      overlays.push(
        <div
          key={`g-${i}`}
          data-testid="snap-guide"
          className="pointer-events-none absolute bg-[#f24822]"
          style={{
            left: r.x,
            top: r.y,
            width: Math.max(1, r.width),
            height: Math.max(1, r.height),
          }}
        />,
      );
  }

  if (dragging) {
    const p = dragging.preview;
    const bp = dragging.ctx.bp;
    if (p.kind === "flow") {
      outline(
        "ghost",
        toScreen(bp, p.ghost),
        "outline outline-1 outline-dashed outline-[#0d99ff] bg-[#0d99ff]/5",
      );
      const { x1, y1, x2, y2 } = p.line;
      const r = toScreen(bp, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      });
      if (r)
        overlays.push(
          <div
            key="drop"
            data-testid="drop-indicator"
            className="pointer-events-none absolute bg-[#0d99ff]"
            style={{
              left: r.x - (r.width ? 0 : 1),
              top: r.y - (r.height ? 0 : 1),
              width: Math.max(2, r.width),
              height: Math.max(2, r.height),
            }}
          />,
        );
      const target = boxesOf(bp).get(p.parentId);
      if (target)
        outline("drop-target", toScreen(bp, target), "outline outline-1 outline-[#0d99ff]");
    } else if (p.kind === "absolute") {
      for (const m of p.moves)
        outline(
          `mv-${m.id}`,
          toScreen(bp, m.rect),
          "outline outline-1 outline-[#0d99ff] bg-[#0d99ff]/5",
        );
    }
  }

  // Alt: distances from the selection to the hovered layer (or its parent).
  if (alt && single && singleBox && !session) {
    const other =
      hover && hover.id !== single && hover.bp === editing ? hover.id : parents.get(single);
    const ob = other ? editingBoxes.get(other) : undefined;
    if (ob) {
      if (other && other !== parents.get(single))
        outline("m-other", toScreen(editing, ob), "outline outline-1 outline-[#f24822]");
      for (const [i, m] of measureBetween(singleBox, ob).entries())
        overlays.push(measureLine(i, m, (r) => toScreen(editing, r)));
    }
  }

  return (
    <div
      ref={layer}
      data-testid="selection-layer"
      // The canvas is a pointer surface; keyboard users select through the Layers panel.
      role="application"
      aria-label="Design canvas"
      className={cn("absolute inset-0", props.panning && "pointer-events-none")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setSession(null)}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      {overlays}
    </div>
  );
}

function measureLine(i: number, m: Measure, toScreen: (r: Rect) => Rect | null): ReactNode {
  const r = toScreen({
    x: Math.min(m.x1, m.x2),
    y: Math.min(m.y1, m.y2),
    width: Math.abs(m.x2 - m.x1),
    height: Math.abs(m.y2 - m.y1),
  });
  if (!r) return null;
  return (
    <div
      key={`m-${i}`}
      className="pointer-events-none absolute"
      style={{ left: r.x, top: r.y, width: Math.max(1, r.width), height: Math.max(1, r.height) }}
    >
      <div className="absolute inset-0 bg-[#f24822]" />
      <span
        data-testid="measure-label"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#f24822] px-1 font-mono text-[10px] leading-4 text-white tabular-nums"
      >
        {Math.round(m.distance)}
      </span>
    </div>
  );
}

/** Sorts ids into document (tree) order so a multi-layer move keeps their order. */
function orderInDocument(
  ids: string[],
  parents: Map<string, string>,
  doc: ProjectDocument,
): string[] {
  const order = new Map<string, number>();
  let i = 0;
  const walk = (id: string) => {
    order.set(id, i++);
    const n = doc.nodes[id];
    if (n && (n.type === "frame" || n.type === "link")) for (const c of n.children) walk(c);
  };
  const roots = new Set<string>();
  for (const id of ids) {
    let top = id;
    while (parents.get(top)) top = parents.get(top) as string;
    roots.add(top);
  }
  for (const r of roots) walk(r);
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
