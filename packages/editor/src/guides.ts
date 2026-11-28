import { useCallback, useEffect, useState } from "react";
import type { Guides } from "./inspector/inspector.tsx";

/**
 * Column guides per breakpoint, remembered per project in this browser (they are an editor
 * aid, not part of the document). Storage can be unavailable; the guides then last the session.
 */
export function useGuides(projectId: string | undefined): [Guides, (g: Guides) => void] {
  const [guides, setGuides] = useState<Guides>({});
  const key = projectId ? `truframe:guides:${projectId}` : null;
  useEffect(() => {
    if (!key) return;
    try {
      const saved = window.localStorage.getItem(key);
      setGuides(saved ? parseGuides(JSON.parse(saved)) : {});
    } catch {
      setGuides({});
    }
  }, [key]);
  const update = useCallback(
    (g: Guides) => {
      setGuides(g);
      if (!key) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(g));
      } catch {
        // Private windows and blocked storage: keep the guides for this session only.
      }
    },
    [key],
  );
  return [guides, update];
}

/** Saved guides that still have the expected shape; anything else is dropped. */
export function parseGuides(value: unknown): Guides {
  const out: Guides = {};
  if (!value || typeof value !== "object") return out;
  for (const bp of ["desktop", "tablet", "mobile"] as const) {
    const g = (value as Record<string, unknown>)[bp] as Record<string, unknown> | undefined;
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    if (g && num(g.columns) && num(g.gutter) && num(g.margin) && typeof g.visible === "boolean")
      out[bp] = {
        columns: Math.min(Math.round(g.columns as number), 48),
        gutter: g.gutter as number,
        margin: g.margin as number,
        visible: g.visible,
      };
  }
  return out;
}
