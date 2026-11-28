import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUuid } from "../ids.ts";
import { createTestDb, insertTestUser, type TestDb } from "../testing.ts";
import {
  forWorkspace,
  LIMIT_REACHED,
  type LimitReached,
  type Project,
  RESTORE_WINDOW_MS,
  workspacesRepo,
} from "./index.ts";

/** Narrows a repo result to a project (fails the test otherwise). */
function project(x: Project | LimitReached | null | undefined): Project {
  if (!x || "limitReached" in x) throw new Error(`expected a project, got ${JSON.stringify(x)}`);
  return x;
}

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await insertTestUser(t.d1, { id: "user-a", email: "a@example.com" });
  await insertTestUser(t.d1, { id: "user-b", email: "b@example.com" });
});
afterAll(() => t.dispose());

describe("workspacesRepo", () => {
  it("creates one personal workspace per user, idempotently", async () => {
    const repo = workspacesRepo(t.db);
    const first = await repo.ensurePersonal({ userId: "user-a", name: "A's workspace" });
    const again = await repo.ensurePersonal({ userId: "user-a", name: "ignored" });
    expect(again.id).toBe(first.id);
    expect(isUuid(first.id)).toBe(true);
    const memberships = await repo.listForUser("user-a");
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
    expect(memberships[0]?.workspace.personal).toBe(true);
  });

  it("returns membership only for members", async () => {
    const repo = workspacesRepo(t.db);
    const a = await repo.ensurePersonal({ userId: "user-a", name: "A" });
    expect(await repo.membership("user-a", a.id)).not.toBeNull();
    expect(await repo.membership("user-b", a.id)).toBeNull();
  });
});

describe("projectsRepo", () => {
  it("creates, lists, renames and duplicates within a workspace", async () => {
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-a", name: "A" });
    const repos = forWorkspace(t.db, ws.id);
    const p = await repos.projects.create({
      name: "Site",
      framework: "astro",
      templateId: "landing",
      createdBy: "user-a",
    });
    expect(p.framework).toBe("astro");
    expect(p.templateId).toBe("landing");
    expect((await repos.projects.rename(p.id, "Renamed"))?.name).toBe("Renamed");
    const copy = project(
      await repos.projects.duplicate(p.id, {
        name: "Renamed copy",
        createdBy: "user-a",
      }),
    );
    expect(copy?.framework).toBe("astro");
    expect(copy?.id).not.toBe(p.id);
    const names = (await repos.projects.list()).map((x) => x.name).sort();
    expect(names).toEqual(expect.arrayContaining(["Renamed", "Renamed copy"]));
  });

  it("soft deletes and restores within 30 days only", async () => {
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-a", name: "A" });
    const repos = forWorkspace(t.db, ws.id);
    const p = await repos.projects.create({
      name: "Trash me",
      framework: "nextjs",
      templateId: "blank",
      createdBy: "user-a",
    });
    const before = await repos.projects.countActive();
    const deletedAt = new Date("2026-01-01T00:00:00Z");
    expect(await repos.projects.softDelete(p.id, deletedAt)).not.toBeNull();
    expect(await repos.projects.get(p.id)).toBeNull();
    expect(await repos.projects.countActive()).toBe(before - 1);
    expect((await repos.projects.listTrash(deletedAt)).map((x) => x.id)).toContain(p.id);

    const tooLate = new Date(deletedAt.getTime() + RESTORE_WINDOW_MS + 1);
    expect(await repos.projects.restore(p.id, tooLate)).toBeNull();
    expect((await repos.projects.listTrash(tooLate)).map((x) => x.id)).not.toContain(p.id);

    const inTime = new Date(deletedAt.getTime() + RESTORE_WINDOW_MS - 1);
    expect(project(await repos.projects.restore(p.id, inTime)).deletedAt).toBeNull();
    expect(await repos.projects.get(p.id)).not.toBeNull();
  });

  it("never reaches another workspace's projects", async () => {
    const wsA = await workspacesRepo(t.db).ensurePersonal({ userId: "user-a", name: "A" });
    const wsB = await workspacesRepo(t.db).ensurePersonal({ userId: "user-b", name: "B" });
    const a = forWorkspace(t.db, wsA.id);
    const b = forWorkspace(t.db, wsB.id);
    const p = await a.projects.create({
      name: "A only",
      framework: "nextjs",
      templateId: "blank",
      createdBy: "user-a",
    });
    expect(await b.projects.get(p.id)).toBeNull();
    expect(await b.projects.rename(p.id, "hijack")).toBeNull();
    expect(await b.projects.duplicate(p.id, { name: "x", createdBy: "user-b" })).toBeNull();
    expect(await b.projects.softDelete(p.id)).toBeNull();
    expect((await b.projects.list()).map((x) => x.id)).not.toContain(p.id);
    expect((await a.projects.get(p.id))?.name).toBe("A only");
  });

  it("requires a workspaceId", () => {
    expect(() => forWorkspace(t.db, "")).toThrow(/workspaceId/);
  });
});

describe("usage and audit", () => {
  it("increments counters per workspace", async () => {
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-b", name: "B" });
    const repos = forWorkspace(t.db, ws.id);
    expect(await repos.usage.get("2026-11", "agent_credits")).toBe(0);
    expect(await repos.usage.increment("2026-11", "agent_credits", 3)).toBe(3);
    expect(await repos.usage.increment("2026-11", "agent_credits")).toBe(4);
    expect(await repos.usage.get("2026-11", "agent_credits")).toBe(4);
  });

  it("records audit entries for the workspace", async () => {
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-b", name: "B" });
    const repos = forWorkspace(t.db, ws.id);
    await repos.audit.record({
      actorUserId: "user-b",
      action: "project.delete",
      targetType: "project",
      targetId: "p1",
      meta: { name: "x" },
    });
    const entries = await repos.audit.list();
    expect(entries[0]?.action).toBe("project.delete");
    expect(entries[0]?.meta).toEqual({ name: "x" });
  });
});

describe("plan limits inside the write", () => {
  it("never creates more than maxActive projects, even concurrently", async () => {
    await insertTestUser(t.d1, { id: "user-limit", email: "limit@example.com" });
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-limit", name: "L" });
    const repos = forWorkspace(t.db, ws.id);
    const input = (n: number) => ({
      name: `P${n}`,
      framework: "nextjs" as const,
      templateId: "blank",
      createdBy: "user-limit",
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => repos.projects.createWithinLimit(input(i), 3)),
    );
    expect(results.filter((r) => r === LIMIT_REACHED)).toHaveLength(5);
    expect(await repos.projects.countActive()).toBe(3);

    // Duplicate and restore respect the same limit; deleting frees a slot.
    const first = (await repos.projects.list())[0];
    if (!first) throw new Error("no project");
    expect(
      await repos.projects.duplicate(first.id, {
        name: "x",
        createdBy: "user-limit",
        maxActive: 3,
      }),
    ).toBe(LIMIT_REACHED);
    await repos.projects.softDelete(first.id);
    project(await repos.projects.createWithinLimit(input(9), 3));
    expect(await repos.projects.restore(first.id, new Date(), 3)).toBe(LIMIT_REACHED);
    expect(await repos.projects.restore("missing-id", new Date(), 3)).toBeNull();
    expect(await repos.projects.countActive()).toBe(3);
  });

  it("treats an infinite limit as unlimited", async () => {
    await insertTestUser(t.d1, { id: "user-pro", email: "pro@example.com" });
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-pro", name: "P" });
    const repos = forWorkspace(t.db, ws.id);
    for (let i = 0; i < 5; i++) {
      project(
        await repos.projects.createWithinLimit(
          { name: `P${i}`, framework: "astro", templateId: "blank", createdBy: "user-pro" },
          Number.POSITIVE_INFINITY,
        ),
      );
    }
    expect(await repos.projects.countActive()).toBe(5);
  });
});

describe("revisionsRepo", () => {
  it("records and lists revisions only within the project's workspace", async () => {
    await insertTestUser(t.d1, { id: "user-rev", email: "rev@example.com" });
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-rev", name: "R" });
    const other = await workspacesRepo(t.db).ensurePersonal({ userId: "user-b", name: "B" });
    const repos = forWorkspace(t.db, ws.id);
    const p = await repos.projects.create({
      name: "Site",
      framework: "nextjs",
      templateId: "blank",
      createdBy: "user-rev",
    });
    const base = {
      projectId: p.id,
      frontiers: [{ peer: "1", counter: 4 }],
      snapshotKey: `projects/${p.id}/snapshots/1.loro`,
      authorKind: "user" as const,
      authorIds: ["user-rev"],
      changeCount: 5,
      summary: null,
    };
    const first = await repos.revisions.record({ ...base, now: new Date(1000) });
    const second = await repos.revisions.record({ ...base, changeCount: 2, now: new Date(2000) });
    expect(first?.workspaceId).toBe(ws.id);
    expect((await repos.revisions.list(p.id)).map((r) => r.id)).toEqual([second?.id, first?.id]);
    expect((await repos.revisions.list(p.id))[0]?.frontiers).toEqual(base.frontiers);
    // Another workspace can neither write to nor read this project's history.
    const theirs = forWorkspace(t.db, other.id);
    expect(await theirs.revisions.record(base)).toBeNull();
    expect(await theirs.revisions.list(p.id)).toEqual([]);
  });
});

describe("assetsRepo", () => {
  const row = (id: string, projectId: string, key: string, bytes: number) => ({
    id,
    projectId,
    r2Key: key,
    name: `${id}.png`,
    mime: "image/png",
    bytes,
    width: 10,
    height: 10,
    sha256: key.slice(7, 71),
    createdBy: null,
  });
  const key = (c: string) => `assets/${c.repeat(64)}.png`;

  it("enforces file count and storage inside the write, counting each stored file once", async () => {
    await insertTestUser(t.d1, { id: "user-asset", email: "asset@example.com" });
    const ws = await workspacesRepo(t.db).ensurePersonal({ userId: "user-asset", name: "As" });
    const repos = forWorkspace(t.db, ws.id);
    const p = project(
      await repos.projects.create({
        name: "A",
        framework: "nextjs",
        templateId: "blank",
        createdBy: "user-asset",
      }),
    );
    const limits = { maxFiles: 2, maxBytes: 1000 };
    // Concurrent uploads of different files: only two fit.
    const results = await Promise.all(
      ["a", "b", "c", "d"].map((c, i) =>
        repos.assets.createWithinLimits(row(`x${i}`, p.id, key(c), 100), limits),
      ),
    );
    expect(results.filter((r) => "limitReached" in r)).toHaveLength(2);
    expect(await repos.assets.usage()).toEqual({ bytes: 200, files: 2 });
    // The same file again (another layer, another project) is free.
    const stored = results.find((r) => !("limitReached" in r));
    if (!stored || "limitReached" in stored) throw new Error("none stored");
    expect(
      await repos.assets.createWithinLimits(row("dup", p.id, stored.r2Key, 100), limits),
    ).not.toHaveProperty("limitReached");
    expect(await repos.assets.usage()).toEqual({ bytes: 200, files: 2 });
    // Storage bytes: a big file fails even under the file count.
    const bigger = { maxFiles: 10, maxBytes: 1000 };
    expect(
      await repos.assets.createWithinLimits(row("big", p.id, key("e"), 801), bigger),
    ).toHaveProperty("limitReached");
    // Deleting one row keeps the object while another row uses it.
    expect((await repos.assets.delete(p.id, "dup")).keyStillUsed).toBe(true);
    expect((await repos.assets.delete(p.id, stored.id)).keyStillUsed).toBe(false);
  });

  it("never reaches another workspace's assets", async () => {
    const a = await workspacesRepo(t.db).ensurePersonal({ userId: "user-asset", name: "As" });
    const b = await workspacesRepo(t.db).ensurePersonal({ userId: "user-b", name: "B" });
    const pa = (await forWorkspace(t.db, a.id).projects.list())[0];
    if (!pa) throw new Error("no project");
    const [mine] = await forWorkspace(t.db, a.id).assets.listForProject(pa.id);
    if (!mine) throw new Error("no asset");
    const other = forWorkspace(t.db, b.id).assets;
    expect(await other.get(pa.id, mine.id)).toBeNull();
    expect(await other.findByKey(pa.id, mine.r2Key)).toBeNull();
    expect((await other.delete(pa.id, mine.id)).deleted).toBeNull();
    expect(await forWorkspace(t.db, a.id).assets.get(pa.id, mine.id)).not.toBeNull();
  });
});
