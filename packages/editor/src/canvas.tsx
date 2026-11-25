"use client";

import { unionRects } from "@truframe/layout";
import type { BreakpointId, Breakpoints } from "@truframe/model";
import { Button } from "@truframe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@truframe/ui/components/dropdown-menu";
import { cn } from "@truframe/ui/lib/utils";
import { MinusIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Camera,
  fitRect,
  panBy,
  stepZoom,
  worldToScreen,
  zoomAt,
  zoomByWheel,
  zoomLabel,
} from "./camera.ts";
import { type FrameBox, layoutFrames } from "./frames.ts";

/** An empty page still gets a frame you can see and drop into. */
const MIN_FRAME_HEIGHT = 400;

import { BREAKPOINT_LABEL } from "./labels.ts";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable]"))
  );
}

export type CanvasApi = {
  fit: () => void;
  zoomTo: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export function Canvas(props: {
  breakpoints: Breakpoints;
  editing: BreakpointId;
  onEditingChange: (id: BreakpointId) => void;
  /** Content of each breakpoint frame, rendered at the frame's width in world space. */
  renderFrame: (id: BreakpointId) => ReactNode;
  /** Changes when the page changes, so the camera fits the new page. */
  fitKey: string;
  /** False while frame content is still loading; the first fit waits for it. */
  contentReady: boolean;
  /** Filled with the zoom actions so commands can drive the camera. */
  apiRef?: { current: CanvasApi | null };
  /** Screen-space layer above the frames (selection, handles, guides). */
  overlay?: (ctx: {
    camera: Camera;
    frames: FrameBox[];
    world: HTMLDivElement | null;
    panning: boolean;
  }) => ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // Frames are as tall as their content (the page body is "Fit"), measured unscaled.
  const [heights, setHeights] = useState<Partial<Record<BreakpointId, number>>>({});
  const world = useRef<HTMLDivElement>(null);
  const [worldEl, setWorldEl] = useState<HTMLDivElement | null>(null);
  const setWorldRef = useCallback((el: HTMLDivElement | null) => {
    world.current = el;
    setWorldEl(el);
  }, []);
  useLayoutEffect(() => {
    const el = world.current;
    if (!el || !props.contentReady) return;
    const measure = () => {
      const next: Partial<Record<BreakpointId, number>> = {};
      for (const f of el.querySelectorAll<HTMLElement>("[data-frame] > [data-tf-frame]"))
        next[f.dataset.tfFrame as BreakpointId] = Math.max(MIN_FRAME_HEIGHT, f.offsetHeight);
      setHeights((prev) =>
        Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([k, v]) => prev[k as BreakpointId] === v)
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const f of el.querySelectorAll("[data-frame] > [data-tf-frame]")) observer.observe(f);
    return () => observer.disconnect();
  });
  const frames = layoutFrames(props.breakpoints, heights);
  const bounds = unionRects(frames.map((f) => f.rect));

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (bounds && size.width > 0) setCamera(fitRect(bounds, size));
  }, [bounds, size]);

  // Fit once the viewport is measured, and again for each page.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    const measured = frames.every((f) => heights[f.breakpoint] !== undefined);
    if (size.width === 0 || !measured || fittedFor.current === props.fitKey) return;
    fittedFor.current = props.fitKey;
    fit();
  }, [size.width, props.fitKey, frames, heights, fit]);

  const center = useCallback(() => ({ x: size.width / 2, y: size.height / 2 }), [size]);
  const zoomTo = useCallback(
    (zoom: number) => setCamera((c) => (c ? zoomAt(c, center(), zoom) : c)),
    [center],
  );

  // Wheel: pan, or zoom with Ctrl/Cmd (trackpad pinch arrives as Ctrl+wheel). Non-passive so
  // the browser doesn't zoom the page instead.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const anchor = { x: e.clientX - box.left, y: e.clientY - box.top };
      const scale = e.deltaMode === 1 ? 16 : 1;
      setCamera((c) => {
        if (!c) return c;
        if (e.ctrlKey || e.metaKey) return zoomByWheel(c, anchor, e.deltaY * scale);
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        return panBy(c, -dx * scale, -dy * scale);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Zoom is driven by commands (Shift+1, Shift+0, Mod+Plus/Minus); Space-to-pan stays here.
  useEffect(() => {
    if (!props.apiRef) return;
    props.apiRef.current = {
      fit,
      zoomTo,
      zoomIn: () => setCamera((c) => (c ? zoomAt(c, center(), stepZoom(c.zoom, 1)) : c)),
      zoomOut: () => setCamera((c) => (c ? zoomAt(c, center(), stepZoom(c.zoom, -1)) : c)),
    };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTyping(e.target) && e.code === "Space" && !e.repeat) setSpaceDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!(e.button === 1 || (e.button === 0 && spaceDown))) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    setCamera((c) => (c ? panBy(c, dx, dy) : c));
  };
  const endPan = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setPanning(false);
  };

  return (
    <div
      ref={viewport}
      data-testid="canvas-viewport"
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#f0f0f0] select-none dark:bg-neutral-900",
        spaceDown && "cursor-grab",
        panning && "cursor-grabbing",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      {props.contentReady ? (
        <>
          <div
            ref={setWorldRef}
            data-testid="canvas-world"
            className="absolute top-0 left-0 origin-top-left"
            style={{
              // Laid out (and measured) before the first fit, but not shown until then.
              visibility: camera ? undefined : "hidden",
              transform: camera
                ? `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`
                : undefined,
            }}
          >
            {frames.map(({ breakpoint, rect }) => (
              <div
                key={breakpoint}
                data-frame={breakpoint}
                className="absolute overflow-hidden bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.06)]"
                style={{ left: rect.x, top: rect.y, width: rect.width, minHeight: rect.height }}
              >
                {props.renderFrame(breakpoint)}
              </div>
            ))}
          </div>
          {camera && props.overlay
            ? props.overlay({ camera, frames, world: worldEl, panning: spaceDown || panning })
            : null}
          {/* Labels live in screen space so they stay readable at any zoom. */}
          {frames.map(({ breakpoint, rect }) => {
            if (!camera) return null;
            const p = worldToScreen(camera, rect);
            const active = breakpoint === props.editing;
            return (
              <button
                key={breakpoint}
                type="button"
                onClick={() => props.onEditingChange(breakpoint)}
                aria-pressed={active}
                className={cn(
                  "absolute flex max-w-60 items-center gap-1.5 truncate rounded px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground",
                  active && "text-primary",
                )}
                style={{ left: p.x - 4, top: p.y - 22 }}
              >
                {BREAKPOINT_LABEL[breakpoint]}
                <span className="font-mono tabular-nums opacity-70">{rect.width}</span>
              </button>
            );
          })}
        </>
      ) : null}
      <ZoomControls
        zoom={camera?.zoom ?? 1}
        onZoomIn={() => setCamera((c) => (c ? zoomAt(c, center(), stepZoom(c.zoom, 1)) : c))}
        onZoomOut={() => setCamera((c) => (c ? zoomAt(c, center(), stepZoom(c.zoom, -1)) : c))}
        onZoomTo={zoomTo}
        onFit={fit}
      />
    </div>
  );
}

function ZoomControls(props: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (z: number) => void;
  onFit: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button size="icon-xs" variant="ghost" aria-label="Zoom out" onClick={props.onZoomOut}>
        <MinusIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="ghost"
            className="w-14 font-mono tabular-nums"
            aria-label={`Zoom ${zoomLabel(props.zoom)}`}
            data-testid="zoom-level"
          >
            {zoomLabel(props.zoom)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem onSelect={props.onFit}>
            Zoom to fit <kbd className="ml-auto text-xs text-muted-foreground">Shift+1</kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {[0.5, 1, 2].map((z) => (
            <DropdownMenuItem key={z} onSelect={() => props.onZoomTo(z)}>
              Zoom to {zoomLabel(z)}
              {z === 1 ? (
                <kbd className="ml-auto text-xs text-muted-foreground">Shift+0</kbd>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="icon-xs" variant="ghost" aria-label="Zoom in" onClick={props.onZoomIn}>
        <PlusIcon />
      </Button>
    </div>
  );
}
