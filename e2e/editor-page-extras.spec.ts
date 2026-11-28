/**
 * P5-9: Page inspector extras. Selection colors change a literal color everywhere in one undo
 * step; column guides are set per breakpoint and remembered for the project; Export offers the
 * plan's scales and goes through the export API, which enforces the plan's largest scale.
 */
import { expect, type Locator, test } from "@playwright/test";
import { openNewProject, ownClientIp, signInWithMock, unique } from "./helpers";

async function fill(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

test("page inspector: selection colors, guides per breakpoint, export", async ({
  page,
  context,
  browser,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const pid = await openNewProject(page, context, { name: "Extras", templateId: "landing" });
  const p = page.getByRole("tabpanel", { name: "Inspect" });
  const origin = new URL(page.url()).origin;

  // Selection colors: one change everywhere, undone in one step.
  const colors = p.getByRole("list", { name: "Selection colors" });
  const before = await colors.getByRole("listitem").count();
  const white = page.locator('[data-frame="desktop"] a span').first();
  const original = await white.evaluate((el) => getComputedStyle(el).color);
  await fill(p.getByLabel("Page color #ffffff hex"), "#fefce8");
  await expect(white).toHaveCSS("color", "rgb(254, 252, 232)");
  await expect(colors.getByRole("listitem")).toHaveCount(before);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(white).toHaveCSS("color", original);

  // Guides per breakpoint, remembered after a reload.
  const breakpoints = page.getByRole("group", { name: "Breakpoints" });
  await fill(p.getByLabel("Guide columns"), "4");
  await expect(page.getByTestId("column-guide")).toHaveCount(4);
  await breakpoints.getByRole("button", { name: /Mobile/ }).click();
  await expect(p.getByLabel("Guide columns")).toHaveValue("12");
  await fill(p.getByLabel("Guide columns"), "2");
  await expect(page.getByTestId("column-guide")).toHaveCount(6);
  await breakpoints.getByRole("button", { name: /Desktop/ }).click();
  await expect(p.getByLabel("Guide columns")).toHaveValue("4");
  await page.reload();
  await expect(page.getByTestId("sync-status")).toHaveText("Online");
  await expect(page.getByTestId("column-guide")).toHaveCount(6);

  // Export: Free allows up to 2×; the request goes to the export API.
  const scale = p.getByLabel("Export scale");
  await expect(scale.locator("option", { hasText: "4×" })).toBeDisabled();
  await expect(scale.locator("option", { hasText: "3×" })).toHaveText("3× (upgrade)");
  await expect(scale.locator("option", { hasText: "2×" })).toBeEnabled();
  await p.getByLabel("Export format").selectOption("webp");
  await scale.selectOption("2");
  const sent = page.waitForRequest(
    (r) => r.url().endsWith(`/api/projects/${pid}/exports/image`) && r.method() === "POST",
  );
  await p.getByRole("button", { name: "Export Home (Desktop)" }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    breakpoint: "desktop",
    format: "webp",
    scale: 2,
  });
  // Rendering needs the preview (P5-7) and the export worker (P9-7): a plain message for now.
  await expect(p.getByRole("alert")).toContainText("Image export isn't available yet");

  // The server enforces the plan's largest scale and validates the input.
  const api = (data: unknown, ctx = context) =>
    ctx.request.post(`/api/projects/${pid}/exports/image`, { data, headers: { origin } });
  const body = { pageId: "p", breakpoint: "mobile", format: "png", scale: 4 };
  const tooBig = await api(body);
  expect(tooBig.status()).toBe(403);
  expect((await tooBig.json()).error).toMatchObject({
    code: "LIMIT_REACHED",
    details: { limit: "imageExportMaxScale", max: 2 },
  });
  expect((await api({ ...body, scale: 9 })).status()).toBe(400);

  // Another user can't use this project's export.
  const other = await browser.newContext({ baseURL: origin });
  await ownClientIp(other);
  await signInWithMock(await other.newPage(), unique("other"));
  expect((await api({ ...body, scale: 1 }, other)).status()).toBe(404);
  expect((await other.request.get(`/api/projects/${pid}/exports/image`)).status()).toBe(404);
  await other.close();

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/page-extras.png` });
});
