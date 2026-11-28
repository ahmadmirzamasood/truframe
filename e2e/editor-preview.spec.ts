/**
 * P5-7: Preview full screen at Desktop, Tablet, Mobile and side by side, following links
 * between pages, live as the document changes. And T3 for Preview: the page renders in a
 * sandboxed iframe on the usercontent origin, where script can't read the app's cookies or
 * storage, reach the editor's DOM, or call the app.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const USERCONTENT = process.env.TRUFRAME_E2E_USERCONTENT_URL ?? "http://127.0.0.1:8791";
const dialog = (page: Page) => page.getByRole("dialog", { name: "Preview" });
const frame = (page: Page, bp: string) => page.frameLocator(`iframe[title="Preview at ${bp}"]`);
const size = (page: Page, name: string) =>
  dialog(page).getByRole("radiogroup", { name: "Preview size" }).getByRole("radio", { name });

test("preview: breakpoints, side by side, links between pages, isolation (T3)", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Preview", templateId: "saas" });

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  const desktop = frame(page, "Desktop");
  await expect(
    desktop.getByRole("heading", { name: "The simplest way to run your team" }),
  ).toBeVisible();
  const iframe = page.locator('iframe[title="Preview at Desktop"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("src", `${USERCONTENT}/preview`);

  // Mobile renders at the mobile width with the mobile cascade.
  await size(page, "Mobile").click();
  await expect(page.locator("iframe")).toHaveCount(1);
  const mobile = page.locator('iframe[title="Preview at Mobile"]');
  await expect(mobile).toHaveAttribute("style", /width: 390px/);
  await expect(
    frame(page, "Mobile").getByRole("heading", { name: "The simplest way to run your team" }),
  ).toBeVisible();

  // Side by side: all three at once, scaled to fit.
  await size(page, "Side by side").click();
  await expect(page.locator("iframe")).toHaveCount(3);
  for (const bp of ["Desktop", "Tablet", "Mobile"])
    await expect(frame(page, bp).getByRole("heading", { level: 1 })).toBeVisible();
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/preview-side-by-side.png` });

  // A link to another page opens that page in Preview.
  await size(page, "Desktop").click();
  await frame(page, "Desktop").getByRole("link", { name: "Start a free trial" }).click();
  await expect(frame(page, "Desktop").getByRole("heading", { name: "Pricing" })).toBeVisible();
  await expect(dialog(page).getByLabel("Page")).toHaveValue(/.+/);
  await expect(dialog(page).getByLabel("Page").locator("option:checked")).toHaveText(
    "Pricing (/pricing)",
  );
  if (shots) await page.screenshot({ path: `${shots}/preview-desktop.png` });

  // T3: script in the preview frame can't reach the app.
  const child = page.frames().find((f) => f.url().startsWith(`${USERCONTENT}/preview`));
  if (!child) throw new Error("no preview frame");
  const probe = await child.evaluate(async (app) => {
    const attempt = async (fn: () => unknown) => {
      try {
        const v = await fn();
        return `allowed:${String(v)}`;
      } catch (e) {
        return `blocked:${(e as Error).name}`;
      }
    };
    return {
      origin: window.origin,
      cookie: await attempt(() => document.cookie),
      localStorage: await attempt(() => window.localStorage.length),
      parentDom: await attempt(() => window.parent.document.title),
      fetchApp: await attempt(() => fetch(`${app}/api/projects`).then((r) => r.status)),
    };
  }, new URL(page.url()).origin);
  expect(probe.origin).toBe("null");
  expect(probe.cookie).toMatch(/^blocked:/);
  expect(probe.localStorage).toMatch(/^blocked:/);
  expect(probe.parentDom).toMatch(/^blocked:/);
  expect(probe.fetchApp).toMatch(/^blocked:/);

  // Escape closes Preview and leaves the editor as it was.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeEnabled();
});

test("preview shell refuses to be framed by other origins and runs sandboxed", async ({
  request,
}) => {
  const res = await request.get(`${USERCONTENT}/preview`);
  expect(res.status()).toBe(200);
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("sandbox allow-scripts");
  const app = new URL(process.env.TRUFRAME_E2E_BASE_URL ?? "http://localhost:3000").origin;
  expect(csp).toContain(`frame-ancestors ${app}`);
  expect(csp).toContain("default-src 'none'");
});
