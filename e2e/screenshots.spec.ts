// Not part of the suite: run with TRUFRAME_SCREENSHOTS=<dir> to save PR screenshots.
import { expect, test } from "@playwright/test";
import { openDialog, ownClientIp, signInWithMock, unique } from "./helpers";

const dir = process.env.TRUFRAME_SCREENSHOTS;
test.skip(!dir, "set TRUFRAME_SCREENSHOTS to a folder to capture screenshots");

test("capture auth and dashboard screens", async ({ page, context }) => {
  await ownClientIp(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-in");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await page.screenshot({ path: `${dir}/sign-in.png` });
  await page.goto("/sign-up");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await page.screenshot({ path: `${dir}/sign-up.png` });

  await signInWithMock(page, unique("shots"));
  for (const [name, framework, template] of [
    ["Studio portfolio", "Astro", "Portfolio"],
    ["Pricing site", "Next.js", "SaaS"],
  ]) {
    const dialog = await openDialog(page, "New project", "New project");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("radio", { name: framework }).check();
    await dialog.getByRole("radio", { name: template }).check();
    await dialog.getByRole("button", { name: "Create project" }).click();
    await expect(dialog).toBeHidden();
  }
  const list = page.getByRole("list", { name: "Projects" });
  await list
    .getByRole("listitem", { name: "Pricing site" })
    .getByRole("button", { name: "Duplicate" })
    .click();
  const copy = list.getByRole("listitem", { name: "Pricing site copy" });
  await copy.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("list", { name: "Recently deleted" })).toBeVisible();
  await page.screenshot({ path: `${dir}/dashboard.png` });

  const dialog = await openDialog(page, "New project", "New project");
  await dialog.getByRole("radio", { name: "Landing page" }).check();
  await page.screenshot({ path: `${dir}/new-project-dialog.png` });
});
