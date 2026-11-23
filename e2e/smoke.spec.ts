import { expect, test } from "@playwright/test";

test("home page renders with app styles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Design websites visually. Get real code.",
  );
  // The shadcn button proves Tailwind + @truframe/ui styles are compiled into the app.
  const cta = page.getByRole("link", { name: "Check platform status" });
  await expect(cta).toHaveAttribute("data-slot", "button");
  await expect(cta).toHaveCSS("display", "inline-flex");
});

test("health endpoint reaches every Cloudflare binding", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; checks: Record<string, string> };
  expect(body.ok).toBe(true);
  expect(body.checks).toEqual({
    d1: "ok",
    r2: "ok",
    kv: "ok",
    queue: "ok",
    projectRoom: "ok",
    agentSession: "ok",
  });
});
