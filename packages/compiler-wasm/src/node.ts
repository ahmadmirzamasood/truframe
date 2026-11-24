/** Node entry: loads the WASM file from disk (build it with `pnpm compiler:build`). */
import { readFileSync } from "node:fs";
import { initCompiler } from "./index.ts";

export * from "./index.ts";

export const WASM_PATH = new URL("../pkg/compiler_bg.wasm", import.meta.url);

/** Initializes the compiler from `pkg/compiler_bg.wasm`. */
export function initCompilerFromDisk(): void {
  initCompiler(readFileSync(WASM_PATH));
}
