/**
 * Browser entry: fetches and compiles the WASM file once. The bundler (Next.js) emits
 * `compiler_bg.wasm` as a static asset from the `new URL(…, import.meta.url)` reference.
 */
import { initCompiler, isCompilerReady } from "./index.ts";

export * from "./index.ts";

let loading: Promise<void> | null = null;

export function loadCompiler(): Promise<void> {
  if (isCompilerReady()) return Promise.resolve();
  loading ??= (async () => {
    const res = await fetch(new URL("../pkg/compiler_bg.wasm", import.meta.url));
    if (!res.ok) throw new Error(`Couldn't load the compiler (${res.status})`);
    initCompiler(await WebAssembly.compile(await res.arrayBuffer()));
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
