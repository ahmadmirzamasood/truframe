import { describe, expect, it } from "vitest";
import worker from "./index.ts";
import { appOrigin } from "./preview.ts";

const env = { TRUFRAME_ENV: "local", TRUFRAME_APP_ORIGIN: "http://localhost:3000" } as Env;
const get = (path: string, e: Env = env) =>
  worker.fetch(new Request(`http://127.0.0.1:8791${path}`), e);

describe("truframe-sites worker", () => {
  it("answers a health check", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: "truframe-sites", ok: true });
  });

  it("serves the preview shell sandboxed, framable only by the app, with no network", async () => {
    const res = await get("/preview");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors http://localhost:3000");
    expect(csp).not.toMatch(/connect-src/);
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/]+=*'/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await res.text();
    expect(html).toContain('const APP = "http://localhost:3000"');
  });

  it("the script hash matches the inline script", async () => {
    const res = await get("/preview");
    const js = /<script>([\s\S]*)<\/script>/.exec(await res.text())?.[1] ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(js));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(res.headers.get("content-security-policy")).toContain(`'sha256-${hash}'`);
  });

  it("lets the preview frame only this origin's embed shell", async () => {
    const csp = (await get("/preview")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-src http://127.0.0.1:8791");
  });

  it("serves the embed shell sandboxed without same-origin", async () => {
    const res = await get("/embed?k=1");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain(
      "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
    );
    expect(csp).not.toContain("allow-same-origin");
    // Preview frames it from an opaque origin, which frame-ancestors can't name.
    expect(csp).not.toContain("frame-ancestors");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // The content comes from the fragment only: nothing from the query is echoed.
    expect(await (await get("/embed?k=%3Cscript%3E")).text()).not.toContain("<script>alert");
    expect((await get("/embed", { TRUFRAME_ENV: "staging" } as Env)).status).toBe(503);
  });

  it("refuses to serve the preview without a valid app origin", async () => {
    const res = await get("/preview", { TRUFRAME_ENV: "staging" } as Env);
    expect(res.status).toBe(503);
  });

  it("404s anything else", async () => {
    expect((await get("/preview/x")).status).toBe(404);
    expect((await get("/rooms")).status).toBe(404);
  });
});

describe("appOrigin", () => {
  it.each([
    [
      { TRUFRAME_ENV: "local", TRUFRAME_APP_ORIGIN: "http://localhost:3000" },
      "http://localhost:3000",
    ],
    [
      { TRUFRAME_ENV: "production", TRUFRAME_APP_ORIGIN: "https://app.truframe.com" },
      "https://app.truframe.com",
    ],
    [{ TRUFRAME_ENV: "production", TRUFRAME_APP_ORIGIN: "http://app.truframe.com" }, null],
    [{ TRUFRAME_ENV: "local", TRUFRAME_APP_ORIGIN: "http://localhost:3000/" }, null],
    [{ TRUFRAME_ENV: "local", TRUFRAME_APP_ORIGIN: "*" }, null],
    [{ TRUFRAME_ENV: "local" }, null],
  ])("%o → %s", (env, expected) => {
    expect(appOrigin(env)).toBe(expected);
  });
});
