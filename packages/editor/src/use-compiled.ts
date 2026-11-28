"use client";

/**
 * Compiles the document in the browser so the canvas uses the compiler's own CSS
 * (ARCHITECTURE §6.1 "Parity"), and Code View shows the same output. The compile runs in a
 * Web Worker (ARCHITECTURE §6.3).
 */
import type { CompileOutput, Span } from "@truframe/compiler-wasm";
import type { ProjectDocument } from "@truframe/model";
import type { CompiledCss } from "@truframe/renderer";
import { useEffect, useState } from "react";
import { listenCompile, requestCompile, workersAvailable } from "./compile-client.ts";

/**
 * The compiler's CSS plus each layer's code class (PRD F27), read from its output, and the
 * generated files and spans for Code View.
 */
export type Compiled = CompiledCss & {
  classes: ReadonlyMap<string, string>;
  files: Readonly<Record<string, string>>;
  spans: readonly Span[];
};

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
const ANIMATIONS = { nextjs: "app/animations.css", astro: "src/styles/animations.css" } as const;

function toCompiled(out: CompileOutput, framework: ProjectDocument["framework"]): Compiled {
  return {
    css: out.css,
    instanceCss: out.instanceCss,
    tokens: out.files[TOKENS[framework]],
    animations: out.animations,
    animationsCss: out.files[ANIMATIONS[framework]],
    classes: codeClasses(out.files, out.spans),
    files: out.files,
    spans: out.spans,
  };
}

/**
 * Compiles `doc` in the compile worker (P6-2) and keeps the last good output on error.
 * `channel` separates documents that are compiled side by side (the project and the
 * main component being edited), so each keeps its own file diff in the worker.
 */
export function useCompiled(doc: ProjectDocument | null, channel = "project"): CompileState {
  const [state, setState] = useState<CompileState>({ status: "loading" });
  const key = doc ? `${channel}:${doc.id}` : null;
  const framework = doc?.framework;

  useEffect(() => {
    if (!key || !framework || !workersAvailable()) return;
    return listenCompile(key, (r) =>
      setState((prev) =>
        r.ok
          ? { status: "ready", output: toCompiled(r.output, framework) }
          : // Keep showing the last good output; the message explains why it's stale.
            {
              status: "error",
              message: r.message,
              output: prev.status === "loading" ? null : prev.output,
            },
      ),
    );
  }, [key, framework]);

  useEffect(() => {
    if (!doc || !key) return;
    if (workersAvailable()) {
      requestCompile(key, doc);
      return;
    }
    // No workers (tests, very old browsers): compile on the main thread.
    let cancelled = false;
    void import("@truframe/compiler-wasm/browser")
      .then(async ({ loadCompiler, compile }) => {
        await loadCompiler();
        if (!cancelled)
          setState({ status: "ready", output: toCompiled(compile(doc), doc.framework) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          output: prev.status === "loading" ? null : prev.output,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [doc, key]);
  return state;
}
