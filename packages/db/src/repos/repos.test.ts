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
