/// <reference lib="webworker" />
/**
 * The editor's compile worker (ARCHITECTURE §6.3): compiles off the main thread so typing
 * and dragging never wait on codegen, and answers with only the files that changed.
 */
import { compile, loadCompiler } from "@truframe/compiler-wasm/browser";
import { type CompileReply, type CompileRequest, diffFiles } from "./compile-diff.ts";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const last = new Map<string, Record<string, string>>();

scope.onmessage = async (e: MessageEvent<CompileRequest>) => {
  const { channel, seq, doc } = e.data;
  let reply: CompileReply;
  try {
    await loadCompiler();
    const t0 = performance.now();
    const { files, ...rest } = compile(doc);
    const ms = performance.now() - t0;
    const diff = diffFiles(last.get(channel) ?? null, files);
    last.set(channel, files);
    reply = { channel, seq, ok: true, diff, rest, ms };
  } catch (error) {
    reply = {
      channel,
      seq,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(reply);
};
