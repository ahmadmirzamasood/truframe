/**
 * ProjectRoom end to end, in a local workerd via Wrangler's test harness: room tokens (T2),
 * the socket half of tenant isolation (T1), two clients converging, idempotent resends,
 * persistence, R2 snapshots and D1 revisions.
 */
import { join } from "node:path";
import { loroToDocument } from "@truframe/crdt";
import { createDb, type D1Binding, forWorkspace, workspacesRepo } from "@truframe/db";
import { insertTestUser } from "@truframe/db/testing";
import { canonical } from "@truframe/ops/testing";
import {
  fromBase64,
  ROOM_PROTOCOL,
  type RoomClaims,
  type RoomServerMessage,
  signRoomToken,
  toBase64,
} from "@truframe/protocol";
import { LoroDoc } from "loro-crdt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const SECRET = "integration-test-room-secret-0123456789abcdef";
const server = createTestHarness({
  root: join(import.meta.dirname, ".."),
  workers: [
    {
      configPath: "wrangler.jsonc",
      secrets: { ROOM_TOKEN_SECRET: SECRET },
      vars: { COMPACT_EVERY: "3" },
    },
  ],
});

let baseUrl: URL;
let env: Env;
let workspaceId: string;
let projectId: string;

beforeAll(async () => {
  baseUrl = (await server.listen()).url;
  const worker = server.getWorker();
  await worker.applyD1Migrations("DB");
  env = (await worker.getEnv()) as Env;
  await insertTestUser(env.DB as unknown as D1Binding, { id: "owner", email: "owner@example.com" });
  const db = createDb(env.DB as unknown as D1Binding);
  const ws = await workspacesRepo(db).ensurePersonal({ userId: "owner", name: "Owner" });
  workspaceId = ws.id;
  const project = await forWorkspace(db, ws.id).projects.create({
    name: "Site",
    framework: "nextjs",
    templateId: "landing",
    createdBy: "owner",
  });
  projectId = project.id;
}, 120_000);

afterAll(async () => {
  await server.close();
});

const claims = (over: Partial<RoomClaims> = {}) => ({
  sub: "owner",
  ws: workspaceId,
  pid: projectId,
  role: "owner" as const,
  plan: "free" as const,
  framework: "nextjs" as const,
  templateId: "landing" as const,
  ...over,
});

const token = async (over: Partial<RoomClaims> = {}, now = Date.now(), secret = SECRET) =>
  (await signRoomToken(claims(over), secret, now)).token;

async function upgrade(path: string, protocols: string | null) {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (protocols) headers["Sec-WebSocket-Protocol"] = protocols;
  const res = await server.fetch(path, { headers });
  return res.status;
}

/** A WebSocket client with a Loro replica fed only by the room's updates. */
class Client {
  readonly loro = new LoroDoc();
  private readonly inbox: RoomServerMessage[] = [];
  private waiters: (() => void)[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as RoomServerMessage;
      if (msg.t === "update") this.loro.import(fromBase64(msg.data));
      this.inbox.push(msg);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  static async connect(t: string): Promise<Client> {
    const url = new URL(`/rooms/${projectId}`, baseUrl);
    url.protocol = "ws:";
    const ws = new WebSocket(url.toString(), [ROOM_PROTOCOL, t]);
    const client = new Client(ws);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("WebSocket failed")));
    });
    await client.next((m) => m.t === "hello");
    client.send({ t: "sync", vv: null });
    await client.next((m) => m.t === "update" && !m.txId);
    return client;
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Waits for (and consumes) the first queued message matching `match`. */
  async next(
    match: (m: RoomServerMessage) => boolean,
    timeoutMs = 10_000,
  ): Promise<RoomServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(match);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as RoomServerMessage;
      if (Date.now() > deadline) throw new Error(`Timed out; inbox: ${JSON.stringify(this.inbox)}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  doc() {
    return loroToDocument(this.loro);
  }

  close() {
    this.ws.close();
  }
}

const text = (id: string) => ({
  id,
  type: "text",
  name: "",
  tag: "p",
  style: { desktop: {} },
  content: [{ text: id }],
});

describe("room tokens (T2) and socket isolation (T1)", () => {
  it("refuses a missing, forged, expired or other-project token", async () => {
    const path = `/rooms/${projectId}`;
    expect(await upgrade(path, null)).toBe(401);
    expect(await upgrade(path, `${ROOM_PROTOCOL}, not-a-token`)).toBe(401);
    expect(
      await upgrade(path, `${ROOM_PROTOCOL}, ${await token({}, Date.now(), `${SECRET}-forged`)}`),
    ).toBe(401);
    expect(
      await upgrade(path, `${ROOM_PROTOCOL}, ${await token({}, Date.now() - 6 * 60_000)}`),
    ).toBe(401);
    // A valid token for another project can't open this room.
    const otherProject = await token({ pid: "0199a0b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b" });
    expect(await upgrade(path, `${ROOM_PROTOCOL}, ${otherProject}`)).toBe(403);
  });

  it("refuses a valid token for this project id from another workspace", async () => {
    const owner = await Client.connect(await token());
    owner.close();
    const res = await upgrade(
      `/rooms/${projectId}`,
      `${ROOM_PROTOCOL}, ${await token({ ws: "another-workspace" })}`,
    );
    expect(res).toBe(403);
  });
});

describe("ProjectRoom sync", () => {
  it("seeds the document from the template and converges two clients", async () => {
    const a = await Client.connect(await token());
    const b = await Client.connect(await token({ sub: "teammate" }));
    const doc = a.doc();
    expect(doc.id).toBe(projectId);
    expect(Object.values(doc.nodes).some((n) => n.tag === "h1")).toBe(true);
    const body = doc.pages[0]?.root as string;

    a.send({
      t: "tx",
      id: "tx-a-000001",
      ops: [{ op: "insertNodes", parentId: body, index: 0, nodes: [text("fromA")] }],
    });
    await a.next((m) => m.t === "update" && m.txId === "tx-a-000001");
    await b.next((m) => m.t === "update" && m.txId === "tx-a-000001");
    b.send({
      t: "tx",
      id: "tx-b-000001",
      ops: [{ op: "setProp", nodeId: "fromA", breakpoint: "mobile", key: "fontSize", value: 14 }],
    });
    await a.next((m) => m.t === "update" && m.txId === "tx-b-000001");
    await b.next((m) => m.t === "update" && m.txId === "tx-b-000001");

    expect(canonical(a.doc())).toBe(canonical(b.doc()));
    expect(a.doc().nodes.fromA?.style.mobile).toEqual({ fontSize: 14 });
    a.close();
    b.close();
  });

  it("rejects invalid transactions and viewers, and acks resends without reapplying", async () => {
    const a = await Client.connect(await token());
    a.send({ t: "tx", id: "tx-bad-00001", ops: [{ op: "deleteNode", nodeId: "nope" }] });
    expect(await a.next((m) => m.t === "reject")).toMatchObject({
      id: "tx-bad-00001",
      error: { code: "NOT_FOUND" },
    });

    const viewer = await Client.connect(await token({ sub: "viewer", role: "viewer" }));
    viewer.send({
      t: "tx",
      id: "tx-view-0001",
      ops: [{ op: "setSettings", settings: { lang: "de" } }],
    });
    expect(await viewer.next((m) => m.t === "reject")).toMatchObject({
      error: { code: "FORBIDDEN" },
    });

    a.send({ t: "tx", id: "tx-once-0001", ops: [{ op: "setSettings", settings: { lang: "fr" } }] });
    await a.next((m) => m.t === "update" && m.txId === "tx-once-0001");
    a.send({ t: "tx", id: "tx-once-0001", ops: [{ op: "setSettings", settings: { lang: "de" } }] });
    await a.next((m) => m.t === "ack" && m.id === "tx-once-0001");
    expect(a.doc().settings.lang).toBe("fr");

    a.send({ t: "nonsense" });
    expect(await a.next((m) => m.t === "error")).toMatchObject({ code: "BAD_MESSAGE" });
    a.close();
    viewer.close();
  });

  it("syncs only what a reconnecting client is missing", async () => {
    const a = await Client.connect(await token());
    const vv = toBase64(a.loro.oplogVersion().encode());
    const known = canonical(a.doc());
    a.close();
    const b = await Client.connect(await token());
    b.send({ t: "tx", id: "tx-gap-00001", ops: [{ op: "setSettings", settings: { lang: "es" } }] });
    await b.next((m) => m.t === "update" && m.txId === "tx-gap-00001");
    b.close();

    // A reconnects with its old replica and asks only for changes after its version.
    const c = await Client.connect(await token());
    const replica = new LoroDoc();
    replica.import(fromBase64(toBase64(c.loro.export({ mode: "snapshot" }))));
    expect(canonical(loroToDocument(replica))).not.toBe(known);
    c.send({ t: "sync", vv });
    const delta = (await c.next((m) => m.t === "update" && !m.txId)) as { data: string };
    expect(fromBase64(delta.data).byteLength).toBeLessThan(
      c.loro.export({ mode: "snapshot" }).byteLength,
    );
    c.close();
  });
});

describe("persistence", () => {
  it("stores snapshot + updates, compacts to R2 and records revisions in D1", async () => {
    const storage = await server
      .getWorker()
      .getDurableObjectStorage("PROJECT_ROOM", { name: projectId });
    const a = await Client.connect(await token());
    for (let i = 0; i < 4; i++) {
      a.send({
        t: "tx",
        id: `tx-persist-${i}`,
        ops: [{ op: "setSettings", settings: { lang: i % 2 ? "en" : "it" } }],
      });
      await a.next((m) => m.t === "update" && m.txId === `tx-persist-${i}`);
    }

    // The room's stored snapshot plus updates rebuild exactly the document clients have.
    const [snapshot] = await storage.exec<{ data: ArrayBuffer }>("SELECT data FROM snapshot");
    const updates = await storage.exec<{ data: ArrayBuffer }>(
      "SELECT data FROM updates ORDER BY seq",
    );
    const rebuilt = new LoroDoc();
    rebuilt.import(new Uint8Array((snapshot as { data: ArrayBuffer }).data));
    for (const u of updates) rebuilt.import(new Uint8Array(u.data));
    expect(canonical(loroToDocument(rebuilt))).toBe(canonical(a.doc()));
    // COMPACT_EVERY is 3 in this test, so pending updates never pile up past it.
    expect(updates.length).toBeLessThan(3);

    const objects = await env.FILES.list({
      prefix: `ws/${workspaceId}/projects/${projectId}/snapshots/`,
    });
    expect(objects.objects.length).toBeGreaterThan(0);
    const latest = objects.objects.at(-1);
    const r2Doc = new LoroDoc();
    r2Doc.import(
      new Uint8Array(
        await ((await env.FILES.get(latest?.key as string)) as R2ObjectBody).arrayBuffer(),
      ),
    );
    expect(loroToDocument(r2Doc).id).toBe(projectId);

    const revisions = await forWorkspace(
      createDb(env.DB as unknown as D1Binding),
      workspaceId,
    ).revisions.list(projectId);
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions[0]).toMatchObject({ authorKind: "user", projectId });
    expect(revisions[0]?.authorIds).toContain("owner");
    expect(revisions[0]?.frontiers.length).toBeGreaterThan(0);
    a.close();
  });
});
