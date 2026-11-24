/**
 * Breakpoint management rules (PRD F6): Desktop is always there and at least 1200 px wide;
 * Tablet and Mobile can be removed, re-added at their defaults, and resized within range.
 * Pure helpers so the UI and its tests share one source of the messages.
 */
import {
  BREAKPOINT_RANGES,
  type BreakpointId,
  type Breakpoints,
  DEFAULT_BREAKPOINT_WIDTHS,
} from "@truframe/model";
import type { Op } from "@truframe/ops";

const LABEL: Record<BreakpointId, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export type WidthCheck = { ok: true; width: number } | { ok: false; message: string };

/** Checks a typed width before any op is sent; the message says what is allowed. */
export function checkBreakpointWidth(id: BreakpointId, raw: string): WidthCheck {
  const { min, max } = BREAKPOINT_RANGES[id];
  const text = raw.trim().replace(/px$/i, "").trim();
  const width = Number(text);
  const range =
    id === "desktop"
      ? `${LABEL[id]} must be at least ${min} px wide.`
      : `${LABEL[id]} width must be between ${min} and ${max} px.`;
  if (text === "" || !Number.isFinite(width))
    return { ok: false, message: `Enter a width in pixels. ${range}` };
  if (!Number.isInteger(width)) return { ok: false, message: "Use a whole number of pixels." };
  if (width < min || width > max) return { ok: false, message: range };
  return { ok: true, width };
}

export function setWidthOps(id: BreakpointId, width: number): Op[] {
  return [{ op: "setBreakpoint", breakpoint: id, width }];
}

/** Desktop can't be removed. */
export function canRemove(id: BreakpointId): boolean {
  return id !== "desktop";
}

export function removeOps(id: Exclude<BreakpointId, "desktop">): Op[] {
  return [{ op: "setBreakpoint", breakpoint: id, width: null }];
}

/** Re-adding a breakpoint brings it back at its default width. */
export function addOps(id: Exclude<BreakpointId, "desktop">): Op[] {
  return [{ op: "setBreakpoint", breakpoint: id, width: DEFAULT_BREAKPOINT_WIDTHS[id] }];
}

export function missingBreakpoints(b: Breakpoints): Exclude<BreakpointId, "desktop">[] {
  return (["tablet", "mobile"] as const).filter((id) => b[id] === undefined);
}
