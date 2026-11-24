"use client";

/**
 * Compiles the document in the browser so the canvas uses the compiler's own CSS
 * (ARCHITECTURE §6.1 "Parity"). Runs on the main thread for now: one page compiles in about
 * 12 ms; the incremental Web Worker compile is P6.
 */
import type { ProjectDocument } from "@truframe/model";
import type { CompiledCss } from "@truframe/renderer";
import { useEffect, useState } from "react";

export type CompileState =
  | { status: "loading" }
  | { status: "ready"; output: CompiledCss }
  | { status: "error"; message: string; output: CompiledCss | null };

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
          output: { css: out.css, tokens: out.files[TOKENS[doc.framework]] },
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
