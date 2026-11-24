import { createDocument, defaultBreakpoints } from "@truframe/model";
import { applyTransaction } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import {
  addOps,
  canRemove,
  checkBreakpointWidth,
  missingBreakpoints,
  removeOps,
  setWidthOps,
} from "./breakpoints.ts";

const LIMITS = { pagesPerProject: 100 };

const doc = () =>
  createDocument({ id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", framework: "nextjs" });

describe("breakpoint widths", () => {
  it("accepts widths in range, with or without px", () => {
    expect(checkBreakpointWidth("desktop", "1440")).toEqual({ ok: true, width: 1440 });
    expect(checkBreakpointWidth("tablet", " 768px ")).toEqual({ ok: true, width: 768 });
    expect(checkBreakpointWidth("mobile", "320")).toEqual({ ok: true, width: 320 });
    expect(checkBreakpointWidth("mobile", "599")).toEqual({ ok: true, width: 599 });
  });

  it("explains what is allowed when a width is refused", () => {
    expect(checkBreakpointWidth("desktop", "1199")).toEqual({
      ok: false,
      message: "Desktop must be at least 1200 px wide.",
    });
    expect(checkBreakpointWidth("tablet", "1200")).toEqual({
      ok: false,
      message: "Tablet width must be between 600 and 1199 px.",
    });
    expect(checkBreakpointWidth("mobile", "600")).toMatchObject({ ok: false });
    expect(checkBreakpointWidth("mobile", "abc")).toEqual({
      ok: false,
      message: "Enter a width in pixels. Mobile width must be between 320 and 599 px.",
    });
    expect(checkBreakpointWidth("tablet", "700.5")).toEqual({
      ok: false,
      message: "Use a whole number of pixels.",
    });
  });
});

describe("breakpoint ops", () => {
  it("resize, remove and re-add Tablet and Mobile", () => {
    let d = doc();
    for (const ops of [
      setWidthOps("desktop", 1440),
      removeOps("tablet"),
      setWidthOps("mobile", 375),
    ]) {
      const r = applyTransaction(d, ops, LIMITS);
      expect(r.ok).toBe(true);
      if (r.ok) d = r.doc;
    }
    expect(d.breakpoints).toEqual({ desktop: { width: 1440 }, mobile: { width: 375 } });
    expect(missingBreakpoints(d.breakpoints)).toEqual(["tablet"]);
    const r = applyTransaction(d, addOps("tablet"), LIMITS);
    expect(r.ok && r.doc.breakpoints.tablet).toEqual({ width: 810 });
    expect(missingBreakpoints(defaultBreakpoints())).toEqual([]);
  });

  it("never removes Desktop", () => {
    expect(canRemove("desktop")).toBe(false);
    const r = applyTransaction(
      doc(),
      [{ op: "setBreakpoint", breakpoint: "desktop", width: null }],
      LIMITS,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range widths at the op level too", () => {
    const r = applyTransaction(doc(), setWidthOps("tablet", 1300), LIMITS);
    expect(r.ok).toBe(false);
  });
});
