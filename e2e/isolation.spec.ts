/**
 * T1 (API part), docs/engineering/SECURITY.md §4: user B cannot read or write user A's project
 * through the HTTP API. Socket, R2, MCP and agent parts of T1 arrive with P2 and P7.
 */
import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";
import { ownClientIp, signInWithMock, unique } from "./helpers";

type Project = { id: string; name: string; workspaceId: string };

async function userSession(browser: Browser, prefix: string) {
  const context = await browser.newContext();
  await ownClientIp(context);
  const page = await context.newPage();
  await signInWithMock(page, unique(prefix));
  const origin = new URL(page.url()).origin;
  return { context, api: context.request, origin };
}

const json = (origin: string) => ({ headers: { origin } });

async function createProject(api: APIRequestContext, origin: string, name: string) {
  const res = await api.post("/api/projects", {
    data: { name, framework: "astro", templateId: "landing" },
    ...json(origin),
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { project: Project }).project;
}

test("user B cannot read, change, copy, delete or restore user A's project", async ({
  browser,
}) => {
  const a = await userSession(browser, "tenant-a");
  const b = await userSession(browser, "tenant-b");
  const project = await createProject(a.api, a.origin, "A's private site");
  const base = `/api/projects/${project.id}`;

  // Read.
  expect((await b.api.get(base)).status()).toBe(404);
  const bList = (await (await b.api.get("/api/projects")).json()) as { projects: Project[] };
  expect(bList.projects.map((p) => p.id)).not.toContain(project.id);

  // Write: every mutation answers 404 with the typed error, exactly as for a missing id.
  const attempts = [
    () => b.api.patch(base, { data: { name: "pwned" }, ...json(b.origin) }),
    () => b.api.post(`${base}/duplicate`, { data: {}, ...json(b.origin) }),
    () => b.api.delete(base, json(b.origin)),
  ];
  for (const attempt of attempts) {
    const res = await attempt();
    expect(res.status()).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  }

  // Restore of A's deleted project.
  expect((await a.api.delete(base, json(a.origin))).status()).toBe(200);
  expect((await b.api.post(`${base}/restore`, json(b.origin))).status()).toBe(404);
  const bTrash = (await (await b.api.get("/api/projects?trash=1")).json()) as {
    projects: Project[];
  };
  expect(bTrash.projects.map((p) => p.id)).not.toContain(project.id);
  expect((await a.api.post(`${base}/restore`, json(a.origin))).status()).toBe(200);

  // Choosing A's workspace explicitly doesn't help B.
  const viaWorkspace = await b.api.get(`/api/projects?workspace=${project.workspaceId}`);
  expect(viaWorkspace.status()).toBe(404);
  expect((await b.api.get(`${base}?workspace=${project.workspaceId}`)).status()).toBe(404);

  // A's project is untouched and B's copy attempts created nothing.
  const after = (await (await a.api.get(base)).json()) as { project: Project };
  expect(after.project.name).toBe("A's private site");
  const bProjects = (await (await b.api.get("/api/projects")).json()) as { projects: Project[] };
  expect(bProjects.projects).toHaveLength(0);

  await a.context.close();
  await b.context.close();
});

test("the API requires a session and refuses cross-site writes", async ({ browser, request }) => {
  // No session.
  expect((await request.get("/api/projects")).status()).toBe(401);
  const anon = await request.post("/api/projects", {
    data: { name: "x", framework: "nextjs" },
    headers: { origin: "http://localhost:3000" },
  });
  expect(anon.status()).toBe(401);

  // Signed in, but the write comes from another origin (CSRF) or carries no Origin.
  const a = await userSession(browser, "tenant-csrf");
  const evil = await a.api.post("/api/projects", {
    data: { name: "x", framework: "nextjs" },
    headers: { origin: "https://evil.example" },
  });
  expect(evil.status()).toBe(403);
  expect(((await evil.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN_ORIGIN");
  const list = (await (await a.api.get("/api/projects")).json()) as { projects: Project[] };
  expect(list.projects).toHaveLength(0);
  await a.context.close();
});

test("ids that are not UUIDs and malformed bodies get typed errors", async ({ browser }) => {
  const a = await userSession(browser, "tenant-input");
  expect((await a.api.get("/api/projects/not-a-uuid")).status()).toBe(404);
  const bad = await a.api.post("/api/projects", {
    data: { name: "x", framework: "remix" },
    ...json(a.origin),
  });
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  await a.context.close();
});
