/**
 * Editor document store (P2-6): a Loro replica of the project, kept in sync with its
 * ProjectRoom, usable offline.
 *
 * - `confirmed` is a Loro doc fed only by the room's updates (the room is authoritative).
 * - `pending` are local transactions the room hasn't confirmed yet. They are sent (and resent
 *   after every reconnect; the room dedupes by id) in order. The document the editor shows is
 *   `confirmed` with the pending ops applied on top; a pending transaction that no longer
 *   applies (someone else's change won) is dropped.
 * - Undo/redo are per user and local: each local transaction records its inverse ops, and undo
 *   sends them as a new transaction, so it never undoes other people's work.
 * - The confirmed snapshot and the pending transactions are cached (IndexedDB in the browser),
 *   so a reload or an offline start shows the last state immediately.
 */
import { loroToDocument } from "@truframe/crdt";
import type { ProjectDocument } from "@truframe/model";
import { applyTransaction, type Op, type OpError, type OpLimits } from "@truframe/ops";
import {
  fromBase64,
  ROOM_PROTOCOL,
  type RoomClientMessage,
  type RoomServerMessage,
  toBase64,
} from "@truframe/protocol";
import { LoroDoc } from "loro-crdt";

export type PendingTx = { id: string; ops: Op[] };

export type CachedState = { snapshot: Uint8Array | null; pending: PendingTx[] };

/** Where the replica is cached between sessions. */
export interface DocCache {
  load(projectId: string): Promise<CachedState | null>;
  save(projectId: string, state: CachedState): Promise<void>;
}

/** The subset of the browser WebSocket the client uses (Node 22 and browsers both fit). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "close" | "error", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export type ConnectionStatus = "connecting" | "online" | "offline";

export type DocClientOptions = {
  projectId: string;
  /** Asks the app for a fresh room token (`POST /api/projects/:id/room-token`). */
  getRoomToken: () => Promise<{ token: string; url: string }>;
  openSocket?: (url: string, protocols: string[]) => SocketLike;
  cache?: DocCache;
  /** Plan limits for local validation; the room checks again with the real ones. */
  limits?: OpLimits;
  newTxId?: () => string;
  /** Reconnect delays in ms (last one repeats). */
  backoff?: number[];
};

export type DocState = {
  doc: ProjectDocument | null;
  status: ConnectionStatus;
  pending: number;
  canUndo: boolean;
  canRedo: boolean;
  /** The last transaction the room or local validation refused. */
  lastError: OpError | null;
};

const OPEN = 1;

export class DocClient {
  private readonly confirmed = new LoroDoc();
  private pending: PendingTx[] = [];
  private undoStack: Op[][] = [];
  private redoStack: Op[][] = [];
  private view: ProjectDocument | null = null;
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = "offline";
  private lastError: OpError | null = null;
  private readonly listeners = new Set<(state: DocState) => void>();
  private stopped = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly options: DocClientOptions) {}

  /** Loads the cache, then connects. Resolves once the cached state (if any) is shown. */
  async start(): Promise<void> {
    const cached = await this.options.cache?.load(this.options.projectId);
    if (cached?.snapshot) this.confirmed.import(cached.snapshot);
    this.pending = cached?.pending ?? [];
    this.recompute();
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close(1000, "closed");
    this.socket = null;
  }

  /** Drops the connection as if the network went away (reconnects after backoff). */
  disconnect(): void {
    this.socket?.close(4000, "disconnect");
  }

  /** Reconnects now instead of waiting for the backoff (e.g. the browser came back online). */
  reconnect(): void {
    if (this.stopped || this.status !== "offline") return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.connect();
  }

  subscribe(listener: (state: DocState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return () => this.listeners.delete(listener);
  }

  state(): DocState {
    return {
      doc: this.view,
      status: this.status,
      pending: this.pending.length,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      lastError: this.lastError,
    };
  }

  /** Applies a transaction locally and sends it. Returns the error if it doesn't apply. */
  apply(ops: Op[]): OpError | null {
    const error = this.commit(ops);
    if (!error) this.redoStack = [];
    return error;
  }

  undo(): boolean {
    return this.step(this.undoStack, this.redoStack);
  }

  redo(): boolean {
    return this.step(this.redoStack, this.undoStack);
  }

  private step(from: Op[][], to: Op[][]): boolean {
    // Skip steps that no longer apply (someone else changed or deleted those layers).
    while (from.length) {
      const ops = from.pop() as Op[];
      const result = this.validate(ops);
      if (!result.ok) continue;
      this.enqueue(ops);
      to.push(result.inverse);
      this.publish();
      return true;
    }
    this.publish();
    return false;
  }

  private commit(ops: Op[]): OpError | null {
    const result = this.validate(ops);
    if (!result.ok) {
      this.lastError = result.error;
      this.publish();
      return result.error;
    }
    this.enqueue(result.ops);
    this.undoStack.push(result.inverse);
    this.publish();
    return null;
  }

  private validate(ops: Op[]) {
    if (!this.view) {
      return {
        ok: false as const,
        error: { code: "INVALID_DOCUMENT" as const, message: "The document hasn't loaded yet." },
      };
    }
    return applyTransaction(this.view, ops, this.limits());
  }

  private enqueue(ops: Op[]) {
    const tx = { id: this.newTxId(), ops };
    this.pending.push(tx);
    this.lastError = null;
    this.recompute();
    this.persist();
    if (this.status === "online") this.send({ t: "tx", id: tx.id, ops: tx.ops });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus("connecting");
    let socket: SocketLike;
    try {
      const { token, url } = await this.options.getRoomToken();
      socket = (this.options.openSocket ?? defaultOpenSocket)(url, [ROOM_PROTOCOL, token]);
    } catch {
      return this.scheduleReconnect();
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      const vv = this.confirmed.oplogVersion().encode();
      this.send({ t: "sync", vv: vv.length ? toBase64(vv) : null });
    });
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private scheduleReconnect() {
    this.setStatus("offline");
    if (this.stopped || this.retryTimer) return;
    const delays = this.options.backoff ?? [500, 1000, 2000, 5000, 10_000, 30_000];
    const delay = delays[Math.min(this.attempt, delays.length - 1)] ?? 30_000;
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private onMessage(raw: string) {
    let msg: RoomServerMessage;
    try {
      msg = JSON.parse(raw) as RoomServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case "update": {
        this.confirmed.import(fromBase64(msg.data));
        if (msg.txId) this.pending = this.pending.filter((p) => p.id !== msg.txId);
        if (!msg.txId && this.status !== "online") {
          // The reply to `sync`: now caught up, resend everything not yet confirmed.
          this.attempt = 0;
          this.setStatus("online");
          for (const p of this.pending) this.send({ t: "tx", id: p.id, ops: p.ops });
        }
        this.recompute();
        this.persist();
        this.publish();
        return;
      }
      case "ack":
        this.pending = this.pending.filter((p) => p.id !== msg.id);
        this.persist();
        this.publish();
        return;
      case "reject":
        this.pending = this.pending.filter((p) => p.id !== msg.id);
        this.lastError = msg.error as OpError;
        this.recompute();
        this.persist();
        this.publish();
        return;
      default:
        return;
    }
  }

  /** The shown document: confirmed state plus every pending transaction that still applies. */
  private recompute() {
    const base = this.confirmed.oplogVersion().length() > 0 ? loroToDocument(this.confirmed) : null;
    if (!base) {
      this.view = null;
      return;
    }
    let doc = base;
    const kept: PendingTx[] = [];
    for (const tx of this.pending) {
      const result = applyTransaction(doc, tx.ops, this.limits());
      if (result.ok) {
        doc = result.doc;
        kept.push(tx);
      }
    }
    this.pending = kept;
    this.view = doc;
  }

  private persist() {
    const cache = this.options.cache;
    if (!cache) return;
    const state: CachedState = {
      snapshot: this.confirmed.export({ mode: "snapshot" }),
      pending: structuredClone(this.pending),
    };
    // Saves run in order so an older state never overwrites a newer one.
    this.saveChain = this.saveChain
      .then(() => cache.save(this.options.projectId, state))
      .catch(() => undefined);
  }

  /** Resolves when every queued cache write has finished (for tests and page unload). */
  flush(): Promise<void> {
    return this.saveChain;
  }

  private send(msg: RoomClientMessage) {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.publish();
  }

  private publish() {
    const state = this.state();
    for (const l of this.listeners) l(state);
  }

  private limits(): OpLimits {
    return this.options.limits ?? { pagesPerProject: Number.POSITIVE_INFINITY };
  }

  private newTxId(): string {
    return this.options.newTxId?.() ?? `tx_${crypto.randomUUID().replaceAll("-", "")}`;
  }
}

function defaultOpenSocket(url: string, protocols: string[]): SocketLike {
  return new WebSocket(url, protocols) as unknown as SocketLike;
}
