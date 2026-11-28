"use client";

/**
 * Main-thread side of the compile worker. One worker serves every channel. While a compile
 * is running, newer documents for the same channel replace each other and only the newest
 * is sent next, so a burst of edits costs one extra compile, not one per edit.
 *
 * Replies come back in order and each carries a diff against the worker's previous files
 * for that channel, so every successful reply is applied, even when a newer one is queued.
 */
import type { CompileOutput } from "@truframe/compiler-wasm";
import type { ProjectDocument } from "@truframe/model";
import { applyDiff, type CompileReply, type CompileRequest } from "./compile-diff.ts";

export type ChannelResult =
  | { ok: true; output: CompileOutput; ms: number }
  | { ok: false; message: string };

type Channel = {
  seq: number;
  busy: boolean;
  queued: ProjectDocument | null;
  sentDoc: ProjectDocument | null;
  files: Record<string, string> | null;
  listener: ((r: ChannelResult) => void) | null;
  /** The newest result shown, handed to a listener that subscribes later. */
  last: ChannelResult | null;
};

let worker: Worker | null = null;
const channels = new Map<string, Channel>();

function channelFor(name: string): Channel {
  let c = channels.get(name);
  if (!c) {
    c = {
      seq: 0,
      busy: false,
      queued: null,
      sentDoc: null,
      files: null,
      listener: null,
      last: null,
    };
    channels.set(name, c);
  }
  return c;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<CompileReply>) => onReply(e.data);
  worker = w;
  return w;
}

function onReply(reply: CompileReply) {
  const c = channelFor(reply.channel);
  c.busy = false;
  if (reply.ok) {
    c.files = applyDiff(c.files, reply.diff);
    // Only the newest document's result is shown; an older one would flash stale code.
    if (!c.queued)
      publish(c, { ok: true, output: { ...reply.rest, files: c.files }, ms: reply.ms });
  } else if (!c.queued) {
    publish(c, { ok: false, message: reply.message });
  }
  const next = c.queued;
  c.queued = null;
  if (next) send(reply.channel, c, next);
}

function publish(c: Channel, r: ChannelResult) {
  c.last = r;
  c.listener?.(r);
}

function send(name: string, c: Channel, doc: ProjectDocument) {
  c.busy = true;
  c.sentDoc = doc;
  c.seq += 1;
  const req: CompileRequest = { channel: name, seq: c.seq, doc };
  getWorker().postMessage(req);
}

/** Compiles `doc` on `channel`; the result goes to the channel's listener. */
export function requestCompile(name: string, doc: ProjectDocument): void {
  const c = channelFor(name);
  if (c.busy) {
    c.queued = doc;
    return;
  }
  if (doc === c.sentDoc && c.last) {
    c.listener?.(c.last);
    return;
  }
  send(name, c, doc);
}

export function listenCompile(name: string, listener: (r: ChannelResult) => void): () => void {
  const c = channelFor(name);
  c.listener = listener;
  if (c.last) listener(c.last);
  return () => {
    if (c.listener === listener) c.listener = null;
  };
}

export function workersAvailable(): boolean {
  return typeof Worker !== "undefined";
}
