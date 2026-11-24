import { workspacesRepo } from "@truframe/db";
import { createTestDb, insertTestUser, type TestDb } from "@truframe/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "./auth.ts";
import { parseAuthEnv } from "./env.ts";
import { resolveWorkspace, WorkspaceAccessError } from "./workspace-context.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.dispose());

describe("personal workspace on signup", () => {
  it("creates exactly one owner workspace when Better Auth creates a user", async () => {
    const auth = createAuth({
      db: t.db,
      env: parseAuthEnv({
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
      }),
      email: { send: async () => {} },
    });
    const res = await auth.api.signUpEmail({
      body: { email: "new@example.com", password: "correct horse battery", name: "New" },
    });
    const memberships = await workspacesRepo(t.db).listForUser(res.user.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: "owner", workspace: { personal: true } });
  });
});

describe("resolveWorkspace", () => {
  it("returns the personal workspace, creating it if missing", async () => {
    await insertTestUser(t.d1, { id: "u-lazy", email: "lazy@example.com" });
    const user = { id: "u-lazy", email: "lazy@example.com", name: "Lazy" };
    const first = await resolveWorkspace(t.db, user);
    const again = await resolveWorkspace(t.db, user);
    expect(first.workspace.personal).toBe(true);
    expect(again.workspace.id).toBe(first.workspace.id);
    expect(first.repos.workspaceId).toBe(first.workspace.id);
  });

  it("allows a member's workspace and refuses anyone else's", async () => {
    await insertTestUser(t.d1, { id: "u-a", email: "a@example.com" });
    await insertTestUser(t.d1, { id: "u-b", email: "b@example.com" });
    const a = { id: "u-a", email: "a@example.com", name: "A" };
    const b = { id: "u-b", email: "b@example.com", name: "B" };
    const wsA = (await resolveWorkspace(t.db, a)).workspace;
    expect((await resolveWorkspace(t.db, a, wsA.id)).role).toBe("owner");
    await expect(resolveWorkspace(t.db, b, wsA.id)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(resolveWorkspace(t.db, b, "not-a-real-id")).rejects.toBeInstanceOf(
      WorkspaceAccessError,
    );
  });
});
