/**
 * Typed wrapper around the WASM build of `crates/compiler` (ARCHITECTURE §6).
 *
 * The WASM module is loaded explicitly with `initCompiler()` so the same code runs in Node,
 * Web Workers and Cloudflare Workers, which each obtain the module differently. Node callers
 * can use `@truframe/compiler-wasm/node`, which loads it from disk.
 */
import type { Framework, ProjectDocument } from "@truframe/model";
import { compile as compileWasm, initSync, outputVersion } from "../pkg/compiler.js";

/** Where a layer's element sits in a generated file (UTF-16 offsets, `end` exclusive). */
export type Span = { node: string; path: string; start: number; end: number };

/** Canvas CSS declarations for one layer; tablet/mobile hold only changes from above. */
export type NodeCss = { desktop: string; tablet?: string; mobile?: string };

/** An uploaded asset the generated project needs, and its path inside the project. */
export type AssetFile = { assetId: string; key: string; path: string };

export type CompileOutput = {
  /** Path → content, sorted by path. */
  files: Record<string, string>;
  spans: Span[];
  /** Node id → canvas CSS. */
  css: Record<string, NodeCss>;
  /**
   * Instance id → component layer id → canvas CSS, for instances with a non-default variant
   * or layer overrides. Absent when there are none.
   */
  instanceCss?: Record<string, Record<string, NodeCss>>;
  assets: AssetFile[];
  /** Node id → animation, for every element that plays one. Absent when none do. */
  animations?: Record<string, NodeAnimation>;
};

/**
 * What the canvas needs to replay a layer's animation (P6A-4): base classes
 * (`tf-anim tf-view-once`), `--tf-*` declarations, and whether it plays at Tablet/Mobile.
 */
export type NodeAnimation = { classes: string; vars: string; tablet: boolean; mobile: boolean };

let ready = false;

/** Loads the compiler from a compiled module or the raw `.wasm` bytes. Safe to call twice. */
export function initCompiler(module: WebAssembly.Module | BufferSource): void {
  if (ready) return;
  initSync({ module });
  ready = true;
}

export function isCompilerReady(): boolean {
  return ready;
}

/**
 * Compiles a validated document. `framework` overrides the document's own framework.
 * Throws an `Error` (never a panic) when the document can't be read.
 */
export function compile(doc: ProjectDocument, framework?: Framework): CompileOutput {
  if (!ready) throw new Error("Compiler not initialized: call initCompiler() first");
  return JSON.parse(compileWasm(JSON.stringify(doc), framework)) as CompileOutput;
}

/** Compiles a document given as JSON text (skips one stringify for large documents). */
export function compileJson(json: string, framework?: Framework): CompileOutput {
  if (!ready) throw new Error("Compiler not initialized: call initCompiler() first");
  return JSON.parse(compileWasm(json, framework)) as CompileOutput;
}

export function compilerOutputVersion(): number {
  if (!ready) throw new Error("Compiler not initialized: call initCompiler() first");
  return outputVersion();
}
