"use client";

/**
 * Compiles the document in the browser so the canvas uses the compiler's own CSS
 * (ARCHITECTURE §6.1 "Parity"). Runs on the main thread for now: one page compiles in about
 * 12 ms; the incremental Web Worker compile is P6.
 */
import type { ProjectDocument } from "@truframe/model";
import type { CompiledCss } from "@truframe/renderer";
import { useEffect, useState } from "react";

/** The compiler's CSS plus each layer's code class (PRD F27), read from its output. */
export type Compiled = CompiledCss & { classes: ReadonlyMap<string, string> };

export type CompileState =
  | { status: "loading" }
  | { status: "ready"; output: Compiled }
  | { status: "error"; message: string; output: Compiled | null };

/**
 * A layer's code class is the first class on its element in the generated file, so the
 * Layers panel shows exactly what Code View and the exported repo will contain.
 */
export function codeClasses(
  files: Readonly<Record<string, string>>,
  spans: readonly { node: string; path: string; start: number; end: number }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of spans) {
    if (out.has(s.node)) continue;
    const source = files[s.path];
    if (!source) continue;
    // The opening tag only: up to the first ">" that ends it.
    const open = source.slice(s.start, s.end).split(">")[0] ?? "";
    const m = /\bclass(?:Name)?="([^"\s]+)/.exec(open);
    if (m?.[1]) out.set(s.node, m[1]);
  }
  return out;
}

const TOKENS = { nextjs: "app/tokens.css", astro: "src/styles/tokens.css" } as const;

export function useCompiled(doc: ProjectDocument | null): CompileState {
  const [state, setState] = useState<CompileState>({ status: "loading" });
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void import("@truframe/compiler-wasm/browser")
      .then(async ({ loadCompiler, compile }) => {
        await loadCompiler();
        if (cancelled) return;
        const out = compile(doc);
        setState({
          status: "ready",
          output: {
            css: out.css,
            tokens: out.files[TOKENS[doc.framework]],
            classes: codeClasses(out.files, out.spans),
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Keep showing the last good output; the message explains why it's stale.
        setState((prev) => ({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          output: prev.status === "loading" ? null : prev.output,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);
  return state;
}
