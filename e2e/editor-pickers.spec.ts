/**
 * P5-5: Pickers. Web fonts from the catalog with only their weights, and the canvas loads
 * them through the app; icons searched through the proxy and drawn inline; stock photos copied
 * into the project's assets (sample photos locally: no Unsplash key, TRUFRAME_INTEGRATIONS_MOCK).
 */
import { expect, test } from "@playwright/test";
import { openNewProject, ownClientIp, signInWithMock, unique } from "./helpers";

test("pickers: fonts, icons and photos", async ({ page, context, browser }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const pid = await openNewProject(page, context, { name: "Pickers", templateId: "blank" });
  const p = page.getByRole("tabpanel", { name: "Inspect" });
  const origin = new URL(page.url()).origin;

  // Fonts: a catalog family offers only its weights; the canvas asks the proxy for it.
  await page.getByRole("button", { name: "Insert Text" }).click();
  const css = page.waitForRequest((r) => r.url().includes("/api/fonts/css?family=Space%20Mono"));
  await p.getByLabel("Font family").selectOption("Space Mono");
  await css;
  await expect(page.getByTestId("canvas-fonts")).toHaveAttribute("href", /family=Space%20Mono/);
  const weights = p.getByLabel("Font weight").locator("option");
  await expect(weights).toHaveText(["400", "700"]);
  await expect(page.locator('[data-frame="desktop"] p', { hasText: "Text" })).toHaveCSS(
    "font-family",
    /Space Mono/,
  );

  // Icons: the starter drawing, then one picked from a search, drawn inline on the canvas.
  await page.getByRole("button", { name: "Insert Icon" }).click();
  await expect(p.getByTestId("icon-name")).toContainText("star");
  await p.getByLabel("Search icons").fill("check");
  await p.getByLabel("Search icons").press("Enter");
  await p.getByRole("list", { name: "Icons" }).getByRole("button", { name: "local:check" }).click();
  await expect(p.getByTestId("icon-name")).toContainText("check");
  const icon = page.locator('[data-frame="desktop"] svg path[d="M5 12l5 5L20 7"]');
  await expect(icon).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(p.getByTestId("icon-name")).toContainText("star");

  // Photos: sample results locally; adding one stores it as a project asset.
  await page.getByRole("tab", { name: "Assets" }).click();
  const photos = page.getByRole("region", { name: "Photos" });
  await photos.getByLabel("Search photos").fill("ocean");
  await photos.getByLabel("Search photos").press("Enter");
  await expect(photos.getByText("Sample photos")).toBeVisible();
  await photos.getByRole("button", { name: "Add photo: Sample Ocean" }).click();
  await expect(page.getByTestId("assets-panel").getByText("sample-ocean.svg")).toBeVisible();

  // The proxies need a session and validate input; another user can't import into this project.
  const api = context.request;
  expect((await api.get("/api/icons?q=")).status()).toBe(400);
  expect((await api.get("/api/fonts/files/..%2F..%2Fetc%2Fpasswd")).status()).toBe(404);
  const anon = await browser.newContext({ baseURL: origin });
  expect((await anon.request.get("/api/icons?q=star")).status()).toBe(401);
  await anon.close();
  const other = await browser.newContext({ baseURL: origin });
  await ownClientIp(other);
  await signInWithMock(await other.newPage(), unique("other"));
  const imported = await other.request.post(`/api/projects/${pid}/photos`, {
    data: { photoId: "ocean" },
    headers: { origin },
  });
  expect(imported.status()).toBe(404);
  await other.close();

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/pickers.png` });
});
