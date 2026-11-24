/** P4-4: Desktop ≥ 1200 and not removable; Tablet/Mobile add, remove, resize within range. */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const bar = (page: Page) => page.getByRole("group", { name: "Breakpoints" });
const frames = (page: Page) => page.getByTestId("canvas-viewport").locator("[data-frame]");

async function openSettings(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Breakpoint settings" });
  await expect(async () => {
    if (!(await dialog.isVisible()))
      await page.getByRole("button", { name: "Breakpoint settings" }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

async function setWidth(page: Page, label: string, value: string) {
  const dialog = await openSettings(page);
  const input = dialog.getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Enter");
  return dialog;
}

test("breakpoints can be resized, removed and re-added within their ranges", async ({
  page,
  context,
}) => {
  await openNewProject(page, context, { name: "Breakpoints", templateId: "landing" });
  await expect(frames(page)).toHaveCount(3);

  // Desktop: any width from 1200 up; it has no remove button.
  let dialog = await setWidth(page, "Desktop", "1100");
  await expect(dialog.getByRole("alert")).toHaveText("Desktop must be at least 1200 px wide.");
  await expect(bar(page).getByRole("button", { name: /Desktop/ })).toContainText("1200");
  dialog = await setWidth(page, "Desktop", "1440");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /Desktop/ })).toContainText("1440");
  await expect(dialog.getByRole("button", { name: "Remove Desktop" })).toHaveCount(0);

  // Tablet: 600 to 1199.
  dialog = await setWidth(page, "Tablet", "1300");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Tablet width must be between 600 and 1199 px.",
  );
  dialog = await setWidth(page, "Tablet", "768");
  await expect(bar(page).getByRole("button", { name: /Tablet/ })).toContainText("768");

  // Mobile: 320 to 599; typing junk explains what is expected.
  dialog = await setWidth(page, "Mobile", "wide");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter a width in pixels. Mobile width must be between 320 and 599 px.",
  );
  dialog = await setWidth(page, "Mobile", "375");
  await expect(bar(page).getByRole("button", { name: /Mobile/ })).toContainText("375");

  // Remove Tablet: two frames left; add it back at its default width.
  await dialog.getByRole("button", { name: "Remove Tablet" }).click();
  await expect(frames(page)).toHaveCount(2);
  await expect(bar(page).getByRole("button")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Add Tablet" }).click();
  await expect(frames(page)).toHaveCount(3);
  await expect(bar(page).getByRole("button", { name: /Tablet/ })).toContainText("810");

  // The canvas frames follow the widths (Desktop now 1440 wide, Mobile 375).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Digit0");
  await expect(frames(page).first()).toHaveCSS("width", "1440px");
  await expect(frames(page).last()).toHaveCSS("width", "375px");

  // It persists: a reload shows the same breakpoints.
  await page.reload();
  await expect(page.getByTestId("sync-status")).toHaveText("Online");
  await expect(bar(page).getByRole("button")).toHaveText([/1440/, /810/, /375/]);
});
