import { applyTransactionToLoro, documentToLoro, loroToDocument } from "@truframe/crdt";
import { type Node, templateDocument } from "@truframe/model";
import { FIXTURE_PROJECT_ID } from "@truframe/model/testing";
import { canonical } from "@truframe/ops/testing";
import { fromBase64, type RoomServerMessage, toBase64 } from "@truframe/protocol";
import { LoroDoc, VersionVector } from "loro-crdt";
import { describe, expect, it } from "vitest";
import { DocClient, type SocketLike } from "./client.ts";
import { memoryCache } from "./idb-cache.ts";

const limits = { pagesPerProject: 10 };

/** An in-memory stand-in for ProjectRoom with the same message contract. */
class FakeRoom {
  readonly loro = new LoroDoc();
  online = true;
  private readonly sockets = new Set<FakeSocket>();
  private readonly seen = new Set<string>();

  constructor() {
    documentToLoro(
      this.loro,
      templateDocument("landing", { projectId: FIXTURE_PROJECT_ID, framework: "nextjs" }),
    );
  }

  open(): SocketLike {
    const socket = new FakeSocket(this);
    if (!this.online) {
      queueMicrotask(() => socket.fire("close"));
      return socket;
    }
    this.sockets.add(socket);
    queueMicrotask(() => {
      socket.readyState = 1;
      socket.fire("open");
    });
    return socket;
  }

  /** The network goes away: every socket closes and new ones fail until `restore()`. */
  cut() {
    this.online = false;
    for (const s of [...this.sockets]) s.close();
  }

  restore() {
    this.online = true;
  }

  drop(socket: FakeSocket) {
    this.sockets.delete(socket);
  }

  receive(from: FakeSocket, raw: string) {
    const msg = JSON.parse(raw) as { t: string; vv?: string | null; id?: string; ops?: unknown[] };
    if (msg.t === "sync") {
      const vv = msg.vv ? VersionVector.decode(fromBase64(msg.vv)) : undefined;
      return from.deliver({
        t: "update",
        data: toBase64(this.loro.export({ mode: "update", from: vv })),
      });
    }
    if (msg.t !== "tx" || !msg.id) return;
    if (this.seen.has(msg.id)) return from.deliver({ t: "ack", id: msg.id });
    const before = this.loro.oplogVersion();
    const result = applyTransactionToLoro(this.loro, msg.ops ?? [], limits);
    if (!result.ok) return from.deliver({ t: "reject", id: msg.id, error: result.error });
    this.seen.add(msg.id);
    const update = toBase64(this.loro.export({ mode: "update", from: before }));
    for (const s of this.sockets) s.deliver({ t: "update", data: update, txId: msg.id });
  }

  doc() {
    return loroToDocument(this.loro);
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  private readonly handlers = new Map<string, ((e: { data: unknown }) => void)[]>();
  constructor(private readonly room: FakeRoom) {}
  send(data: string) {
    if (this.readyState !== 1) throw new Error("not open");
    queueMicrotask(() => this.room.receive(this, data));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.room.drop(this);
    queueMicrotask(() => this.fire("close"));
  }
  addEventListener(type: string, listener: (e: { data: unknown }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }
  fire(type: string, data?: unknown) {
    for (const h of this.handlers.get(type) ?? []) h({ data });
  }
  deliver(msg: RoomServerMessage) {
    if (this.readyState === 1) queueMicrotask(() => this.fire("message", JSON.stringify(msg)));
  }
}

const settle = async (ms = 30) => {
  await new Promise((r) => setTimeout(r, ms));
};

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await settle(10);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

let txCounter = 0;
function client(room: FakeRoom, cache = memoryCache()) {
  return new DocClient({
    projectId: FIXTURE_PROJECT_ID,
    getRoomToken: async () => ({ token: "t", url: "ws://room" }),
    openSocket: () => room.open(),
    cache,
    limits,
    newTxId: () => `tx_test_${++txCounter}`,
    backoff: [10],
  });
}

const textNode = (id: string, words: string): Node => ({
  id,
  type: "text",
  name: "",
  tag: "p",
  style: { desktop: {} },
  content: [{ text: words }],
});

function insertText(c: DocClient, id: string, words: string) {
  const doc = c.state().doc;
  if (!doc) throw new Error("not loaded");
  return c.apply([
    {
      op: "insertNodes",
      parentId: doc.pages[0]?.root as string,
      index: 0,
      nodes: [textNode(id, words)],
    },
  ]);
}

describe("DocClient", () => {
  it("loads the room's document and shows local edits immediately", async () => {
    const room = new FakeRoom();
    const a = client(room);
    await a.start();
    await until(() => a.state().status === "online", "online");
    expect(canonical(a.state().doc)).toBe(canonical(room.doc()));
    expect(insertText(a, "hello", "Hello")).toBeNull();
    expect(a.state().doc?.nodes.hello).toBeDefined();
    await until(() => a.state().pending === 0, "confirmation");
    expect(room.doc().nodes.hello).toBeDefined();
    a.stop();
  });

  it("keeps editing offline and converges with another client after reconnecting", async () => {
    const room = new FakeRoom();
    const a = client(room);
    const b = client(room);
    await Promise.all([a.start(), b.start()]);
    await until(() => a.state().status === "online" && b.state().status === "online", "online");

    room.cut();
    await until(() => a.state().status === "offline", "offline");
    insertText(a, "offlineA", "Written offline");
    expect(a.state().pending).toBe(1);
    expect(a.state().doc?.nodes.offlineA).toBeDefined();

    room.restore();
    await until(() => b.state().status === "online", "b back online");
    insertText(b, "fromB", "B was online");
    await until(
      () =>
        a.state().pending === 0 &&
        b.state().pending === 0 &&
        Boolean(b.state().doc?.nodes.offlineA),
      "convergence",
    );
    expect(canonical(a.state().doc)).toBe(canonical(b.state().doc));
    expect(canonical(a.state().doc)).toBe(canonical(room.doc()));
    a.stop();
    b.stop();
  });

  it("restores cached state, including unsent edits, after a reload while offline", async () => {
    const room = new FakeRoom();
    const cache = memoryCache();
    const first = client(room, cache);
    await first.start();
    await until(() => first.state().status === "online", "online");
    room.cut();
    await until(() => first.state().status === "offline", "offline");
    insertText(first, "unsent", "Not sent yet");
    await first.flush();
    first.stop();

    // Reload with the network still down: the cache alone shows the document and the edit.
    const reloaded = client(room, cache);
    await reloaded.start();
    expect(reloaded.state().doc?.nodes.unsent).toBeDefined();
    expect(reloaded.state().pending).toBe(1);

    room.restore();
    await until(() => reloaded.state().pending === 0, "sent after reconnect");
    expect(room.doc().nodes.unsent).toBeDefined();
    reloaded.stop();
  });

  it("undoes and redoes only this user's own changes", async () => {
    const room = new FakeRoom();
    const a = client(room);
    const b = client(room);
    await Promise.all([a.start(), b.start()]);
    await until(() => a.state().status === "online" && b.state().status === "online", "online");

    insertText(a, "mine", "A's layer");
    await until(() => Boolean(b.state().doc?.nodes.mine), "b sees a");
    insertText(b, "theirs", "B's layer");
    await until(() => Boolean(a.state().doc?.nodes.theirs), "a sees b");

    expect(a.undo()).toBe(true);
    await until(() => !b.state().doc?.nodes.mine && a.state().pending === 0, "undo synced");
    expect(a.state().doc?.nodes.theirs).toBeDefined(); // B's work is untouched
    expect(a.state().canUndo).toBe(false);
    expect(a.redo()).toBe(true);
    await until(() => Boolean(b.state().doc?.nodes.mine), "redo synced");
    expect(canonical(a.state().doc)).toBe(canonical(b.state().doc));
    a.stop();
    b.stop();
  });

  it("skips an undo step that no longer applies", async () => {
    const room = new FakeRoom();
    const a = client(room);
    const b = client(room);
    await Promise.all([a.start(), b.start()]);
    await until(() => a.state().status === "online" && b.state().status === "online", "online");
    insertText(a, "shared", "Shared layer");
    await until(() => Boolean(b.state().doc?.nodes.shared), "b sees it");
    a.apply([{ op: "setNodeFields", nodeId: "shared", fields: { name: "Renamed by A" } }]);
    await until(() => a.state().pending === 0, "rename confirmed");
    b.apply([{ op: "deleteNode", nodeId: "shared" }]);
    await until(() => !a.state().doc?.nodes.shared, "a sees delete");
    // Undoing the rename can't apply to a deleted layer; undoing the insert can't either
    // (it would delete a layer that's already gone), so both are skipped.
    expect(a.undo()).toBe(false);
    expect(a.state().canUndo).toBe(false);
    a.stop();
    b.stop();
  });

  it("drops a pending edit the room rejects and reports why", async () => {
    const room = new FakeRoom();
    const a = client(room);
    const b = client(room);
    await Promise.all([a.start(), b.start()]);
    await until(() => a.state().status === "online" && b.state().status === "online", "online");
    insertText(a, "victim", "Will be deleted");
    await until(() => Boolean(b.state().doc?.nodes.victim), "b sees it");

    room.cut();
    await until(() => a.state().status === "offline" && b.state().status === "offline", "offline");
    a.apply([{ op: "setNodeFields", nodeId: "victim", fields: { name: "Edited offline" } }]);
    b.apply([{ op: "deleteNode", nodeId: "victim" }]);
    room.restore();
    await until(() => a.state().pending === 0 && b.state().pending === 0, "both settled");
    await settle();
    expect(canonical(a.state().doc)).toBe(canonical(b.state().doc));
    expect(a.state().doc?.nodes.victim).toBeUndefined();
    a.stop();
    b.stop();
  });

  it("refuses invalid local edits without sending them", async () => {
    const room = new FakeRoom();
    const a = client(room);
    await a.start();
    await until(() => a.state().status === "online", "online");
    const error = a.apply([{ op: "deleteNode", nodeId: "missing" }]);
    expect(error?.code).toBe("NOT_FOUND");
    expect(a.state().pending).toBe(0);
    expect(a.state().lastError?.code).toBe("NOT_FOUND");
    a.stop();
  });
});
