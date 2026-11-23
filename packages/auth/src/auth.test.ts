import { authUsersRepo } from "@truframe/db";
import { createTestDb, type TestDb } from "@truframe/db/testing";
import type { EmailMessage } from "@truframe/emails";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, createAuth } from "./auth.ts";
import { parseAuthEnv } from "./env.ts";
import { encodeMockCode, type MockProfile } from "./mock-oauth.ts";

const BASE = "http://localhost:3000";
let t: TestDb;
let auth: Auth;
const outbox: EmailMessage[] = [];
let ip = 0;

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth({
    db: t.db,
    env: parseAuthEnv({
      TRUFRAME_ENV: "local",
      BETTER_AUTH_URL: BASE,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
      TRUFRAME_OAUTH_MOCK: "1",
    }),
    email: { send: async (m) => void outbox.push(m) },
  });
});
afterAll(() => t.dispose());

/** A browser-ish client: cookie jar, Origin header, its own IP (rate limits are per IP). */
function client() {
  const jar = new Map<string, string>();
  const myIp = `10.0.0.${++ip}`;
  const request = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const url = path.startsWith("http") ? path : `${BASE}/api/auth${path}`;
    const headers = new Headers({ origin: BASE, "x-forwarded-for": myIp });
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.body) headers.set("content-type", "application/json");
    const res = await auth.handler(
      new Request(url, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
        redirect: "manual",
      }),
    );
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name, ...rest] = (pair ?? "").split("=");
      if (!name) continue;
      const value = rest.join("=");
      if (value === "" || /max-age=0/i.test(c)) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };
  return {
    request,
    async session(): Promise<{ user: { email: string; emailVerified: boolean } } | null> {
      const res = await request("/get-session");
      return (await res.json()) as { user: { email: string; emailVerified: boolean } } | null;
    },
    async oauth(provider: "google" | "github", profile: MockProfile) {
      const start = await request("/sign-in/social", {
        body: { provider, callbackURL: "/dashboard" },
      });
      const { url } = (await start.json()) as { url: string };
      const state = new URL(url).searchParams.get("state") ?? "";
      const cb = new URL(`${BASE}/api/auth/callback/${provider}`);
      cb.searchParams.set("code", encodeMockCode(provider, profile));
      cb.searchParams.set("state", state);
      return request(cb.toString());
    },
  };
}

const lastLink = (to: string) => {
  const m = [...outbox].reverse().find((x) => x.to === to);
  return m?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
};

describe("email and password", () => {
  it("requires verification before sign-in, then verifies through the emailed link", async () => {
    const c = client();
    const email = "pw@example.com";
    const signUp = await c.request("/sign-up/email", {
      body: { email, password: "correct horse battery", name: "Pat" },
    });
    expect(signUp.status).toBe(200);
    expect(await c.session()).toBeNull();
    const early = await c.request("/sign-in/email", {
      body: { email, password: "correct horse battery" },
    });
    expect(early.status).toBe(403);

    const link = lastLink(email);
    expect(link).toContain("/api/auth/verify-email?token=");
    const verify = await c.request(link);
    expect([200, 302]).toContain(verify.status);
    expect((await c.session())?.user.emailVerified).toBe(true);

    const other = client();
    const ok = await other.request("/sign-in/email", {
      body: { email, password: "correct horse battery" },
    });
    expect(ok.status).toBe(200);
    const bad = await client().request("/sign-in/email", {
      body: { email, password: "wrong pw!!" },
    });
    expect(bad.status).toBe(401);
  });

  it("rejects short passwords", async () => {
    const res = await client().request("/sign-up/email", {
      body: { email: "short@example.com", password: "short", name: "S" },
    });
    expect(res.status).toBe(400);
  });
});

describe("magic link", () => {
  it("signs up and signs in from the emailed link", async () => {
    const c = client();
    const email = "magic@example.com";
    const res = await c.request("/sign-in/magic-link", {
      body: { email, callbackURL: "/dashboard" },
    });
    expect(res.status).toBe(200);
    const link = lastLink(email);
    expect(link).toContain("/api/auth/magic-link/verify?token=");
    const verify = await c.request(link);
    expect(verify.status).toBe(302);
    expect((await c.session())?.user.email).toBe(email);
  });
});

describe("OAuth (mock provider) and account linking", () => {
  it("signs in with Google and GitHub, linking by verified email", async () => {
    const email = "oauth@example.com";
    const g = client();
    const res = await g.oauth("google", { sub: "1", email, name: "O", emailVerified: true });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect((await g.session())?.user.email).toBe(email);

    const gh = client();
    await gh.oauth("github", { sub: "9", email, name: "O", emailVerified: true });
    expect((await gh.session())?.user.email).toBe(email);
    const user = await authUsersRepo(t.db).findByEmail(email);
    expect(await authUsersRepo(t.db).providers(user?.id ?? "")).toEqual(["github", "google"]);
  });

  it("does not link an unverified provider email to an existing account", async () => {
    const email = "nolink@example.com";
    await client().oauth("google", { sub: "2", email, name: "N", emailVerified: true });
    const attacker = client();
    const res = await attacker.oauth("github", {
      sub: "3",
      email,
      name: "X",
      emailVerified: false,
    });
    expect(res.headers.get("location")).toMatch(/error=/);
    expect(await attacker.session()).toBeNull();
    const user = await authUsersRepo(t.db).findByEmail(email);
    expect(await authUsersRepo(t.db).providers(user?.id ?? "")).toEqual(["google"]);
  });

  it("drops an unverified password when the real owner signs in with Google", async () => {
    const email = "prehijack@example.com";
    await client().request("/sign-up/email", {
      body: { email, password: "attacker password", name: "Attacker" },
    });
    const owner = client();
    await owner.oauth("google", { sub: "4", email, name: "Owner", emailVerified: true });
    expect((await owner.session())?.user.email).toBe(email);
    const user = await authUsersRepo(t.db).findByEmail(email);
    expect(await authUsersRepo(t.db).providers(user?.id ?? "")).toEqual(["google"]);
    const attacker = await client().request("/sign-in/email", {
      body: { email, password: "attacker password" },
    });
    expect(attacker.status).not.toBe(200);
  });
});

describe("rate limits", () => {
  it("limits sign-up attempts per IP", async () => {
    const c = client();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await c.request("/sign-up/email", {
        body: { email: `rl${i}@example.com`, password: "correct horse battery", name: "R" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Turnstile", () => {
  it("rejects sign-up without a captcha token when Turnstile is on", async () => {
    const guarded = createAuth({
      db: t.db,
      env: parseAuthEnv({
        TRUFRAME_ENV: "local",
        BETTER_AUTH_URL: BASE,
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      }),
      email: { send: async () => {} },
    });
    const res = await guarded.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          origin: BASE,
          "content-type": "application/json",
          "x-forwarded-for": "10.9.9.9",
        },
        body: JSON.stringify({
          email: "cap@example.com",
          password: "correct horse battery",
          name: "C",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await authUsersRepo(t.db).findByEmail("cap@example.com")).toBeNull();
  });
});
