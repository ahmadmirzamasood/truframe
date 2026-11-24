/**
 * ProjectRoom: one Durable Object per project (ARCHITECTURE §7).
 *
 * The room is authoritative. Clients send transactions of ops; the room validates them against
 * its document (`applyTransactionToLoro`: schema, references, plan limits), applies them to its
 * Loro doc and broadcasts the resulting Loro update to everyone. Clients never send Loro bytes.
 *
 * Storage (DO SQLite): the latest snapshot plus the updates since it, and recent transaction
 * ids for idempotent resends. Every `COMPACT_EVERY` updates, or 5 minutes after the first
 * change, the room compacts: it writes a fresh snapshot, copies it to R2 and records a revision
 * row in D1.
 */
import { DurableObject } from "cloudflare:workers";
import { PLANS } from "@truframe/billing";
import { applyTransactionToLoro, documentToLoro } from "@truframe/crdt";
import { createDb, forWorkspace } from "@truframe/db";
import { templateDocument } from "@truframe/model";
import {
  fromBase64,
  ROOM_MAX_MESSAGE_BYTES,
  ROOM_PROTOCOL,
  type RoomClaims,
  type RoomServerMessage,
  roomClaimsSchema,
  roomClientMessageSchema,
  toBase64,
} from "@truframe/protocol";
import { LoroDoc, VersionVector } from "loro-crdt";

/** Header the realtime worker sets after verifying the room token. Never trusted from clients. */
export const CLAIMS_HEADER = "x-truframe-room-claims";

const DEFAULT_COMPACT_EVERY = 200;
const COMPACT_AFTER_MS = 5 * 60 * 1000;
const TX_ID_RETENTION_MS = 24 * 60 * 60 * 1000;

type Meta = {
  workspaceId: string;
  projectId: string;
  pendingChanges: number;
  pendingAuthors: string[];
};

export class ProjectRoom extends DurableObject<Env> {
  private loro: LoroDoc | null = null;
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (seq INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS txs (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
    `);
  }

  override async fetch(request: Request): Promise<Response> {
    const parsed = roomClaimsSchema.safeParse(
      JSON.parse(request.headers.get(CLAIMS_HEADER) ?? "null"),
    );
    if (!parsed.success) return new Response("Missing room claims", { status: 400 });
    const claims = parsed.data;
    const meta = this.meta();
    if (meta && (meta.projectId !== claims.pid || meta.workspaceId !== claims.ws)) {
      return new Response("This token is for another project", { status: 403 });
    }
    this.load(claims);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(claims);
    this.send(server, { t: "hello", projectId: claims.pid, role: claims.role });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": ROOM_PROTOCOL },
    });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const claims = ws.deserializeAttachment() as RoomClaims;
    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > ROOM_MAX_MESSAGE_BYTES) {
      return this.send(ws, { t: "error", code: "TOO_LARGE", message: "Message is too large." });
    }
    let json: unknown;
    try {
      json = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "Expected JSON." });
    }
    const parsed = roomClientMessageSchema.safeParse(json);
    if (!parsed.success) {
      return this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "Unknown message." });
    }
    const msg = parsed.data;
    const loro = this.load(claims);

    if (msg.t === "sync") {
      let from: VersionVector | undefined;
      try {
        from = msg.vv ? VersionVector.decode(fromBase64(msg.vv)) : undefined;
      } catch {
        return this.send(ws, { t: "error", code: "BAD_MESSAGE", message: "Invalid version." });
      }
      return this.send(ws, { t: "update", data: toBase64(loro.export({ mode: "update", from })) });
    }

    if (claims.role === "viewer") {
      return this.send(ws, {
        t: "reject",
        id: msg.id,
        error: { code: "FORBIDDEN", message: "You can view this project but not edit it." },
      });
    }
    if (this.sql.exec("SELECT 1 FROM txs WHERE id = ?", msg.id).toArray().length) {
      return this.send(ws, { t: "ack", id: msg.id });
    }
    const before = loro.oplogVersion();
    const result = applyTransactionToLoro(loro, msg.ops, PLANS[claims.plan].limits, {
      origin: claims.sub,
      message: msg.id,
    });
    if (!result.ok) {
      return this.send(ws, { t: "reject", id: msg.id, error: result.error });
    }
    const update = loro.export({ mode: "update", from: before });
    this.sql.exec("INSERT INTO updates (data) VALUES (?)", update.buffer as ArrayBuffer);
    this.sql.exec("INSERT INTO txs (id, at) VALUES (?, ?)", msg.id, Date.now());
    const meta = this.meta() as Meta;
    this.setMeta({
      ...meta,
      pendingChanges: meta.pendingChanges + 1,
      pendingAuthors: [...new Set([...meta.pendingAuthors, claims.sub])],
    });
    const out: RoomServerMessage = {
      t: "update",
      data: toBase64(update),
      txId: msg.id,
      by: claims.sub,
    };
    for (const peer of this.ctx.getWebSockets()) this.send(peer, out);

    if (meta.pendingChanges + 1 >= this.compactEvery()) await this.compact();
    else if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + COMPACT_AFTER_MS);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, reason);
    } catch {
      // Already closed.
    }
  }

  override async alarm(): Promise<void> {
    if ((this.meta()?.pendingChanges ?? 0) > 0) await this.compact();
  }

  /** Loads the Loro doc from storage, seeding it from the template the first time. */
  private load(claims: RoomClaims): LoroDoc {
    if (this.loro) return this.loro;
    const loro = new LoroDoc();
    const [snap] = this.sql
      .exec<{ data: ArrayBuffer }>("SELECT data FROM snapshot WHERE id = 1")
      .toArray();
    if (snap) {
      loro.import(new Uint8Array(snap.data));
      const updates = this.sql
        .exec<{ data: ArrayBuffer }>("SELECT data FROM updates ORDER BY seq")
        .toArray()
        .map((u) => new Uint8Array(u.data));
      if (updates.length) loro.importBatch(updates);
    } else {
      documentToLoro(
        loro,
        templateDocument(claims.templateId, { projectId: claims.pid, framework: claims.framework }),
        `seed:${claims.templateId}`,
      );
      this.writeSnapshot(loro);
      this.setMeta({
        workspaceId: claims.ws,
        projectId: claims.pid,
        pendingChanges: 0,
        pendingAuthors: [],
      });
    }
    this.loro = loro;
    return loro;
  }

  private writeSnapshot(loro: LoroDoc): Uint8Array {
    const snapshot = loro.export({ mode: "snapshot" });
    this.sql.exec(
      "INSERT INTO snapshot (id, data) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data",
      snapshot.buffer as ArrayBuffer,
    );
    this.sql.exec("DELETE FROM updates");
    return snapshot;
  }

  /** Folds pending updates into a snapshot, copies it to R2 and records a revision in D1. */
  private async compact(): Promise<void> {
    const loro = this.loro;
    const meta = this.meta();
    if (!loro || !meta || meta.pendingChanges === 0) return;
    const now = Date.now();
    // Local state first: if R2 or D1 fail, nothing is lost and the next compaction retries.
    const snapshot = this.writeSnapshot(loro);
    this.sql.exec("DELETE FROM txs WHERE at < ?", now - TX_ID_RETENTION_MS);
    this.setMeta({ ...meta, pendingChanges: 0, pendingAuthors: [] });
    await this.ctx.storage.deleteAlarm();

    const key = `projects/${meta.projectId}/snapshots/${now}.loro`;
    try {
      await this.env.FILES.put(`ws/${meta.workspaceId}/${key}`, snapshot);
      await forWorkspace(createDb(this.env.DB), meta.workspaceId).revisions.record({
        projectId: meta.projectId,
        frontiers: loro.frontiers().map((f) => ({ peer: String(f.peer), counter: f.counter })),
        snapshotKey: key,
        authorKind: "user",
        authorIds: meta.pendingAuthors,
        changeCount: meta.pendingChanges,
        summary: null,
        now: new Date(now),
      });
    } catch (e) {
      console.error("ProjectRoom compaction: saving the snapshot or revision failed", {
        projectId: meta.projectId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private compactEvery(): number {
    // Optional var, set only by tests to compact sooner.
    const n = Number((this.env as Env & { COMPACT_EVERY?: string }).COMPACT_EVERY);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_COMPACT_EVERY;
  }

  private meta(): Meta | null {
    const [row] = this.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'room'")
      .toArray();
    return row ? (JSON.parse(row.value) as Meta) : null;
  }

  private setMeta(meta: Meta) {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES ('room', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      JSON.stringify(meta),
    );
  }

  private send(ws: WebSocket, msg: RoomServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The socket closed; the client will resync when it reconnects.
    }
  }
}
