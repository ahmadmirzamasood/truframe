/**
 * P6-4: Code View's read-only state. A lock says the code is generated; the call to action
 * explains where to edit code instead; on Free, copying is refused with a plain notice
 * (BILLING §2: a soft deterrent). Pro copy waits for plans to exist (P10): the rule itself
 * is unit-tested in `packages/billing` (`codeAccess`).
 */
import { expect, test } from "@playwright/test";
import { openNewProject } from "./helpers";

test("code view is read-only, explains how to edit code, and Free can't copy", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Read only", templateId: "landing" });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  const view = page.getByTestId("code-view");
  const content = view.locator(".cm-content");
  await expect(content).toContainText("export default function HomePage()");

  // The lock and its explanation.
  const lock = view.getByTestId("code-read-only");
  await expect(lock).toHaveText("Read-only");
  await expect(lock).toHaveAttribute("title", /Change the design to change the code/);

  // Typing, pasting and deleting change nothing.
  await content.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("x");
  await expect(content).toContainText("export default function HomePage()");

  // Free: copy is refused and says why; the clipboard keeps what it had.
  await page.evaluate(() => navigator.clipboard.writeText("before"));
  await content.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await expect(view.getByRole("status")).toContainText("Copying code is part of Pro");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("before");
  await view.getByRole("button", { name: "Dismiss" }).click();
  await expect(view.getByRole("status")).toHaveCount(0);

  // The call to action explains where code is edited, and the plan rule.
  await view.getByRole("button", { name: "Export or push to GitHub to edit code" }).click();
  const popover = page.getByRole("dialog", { name: "Editing code" });
  await expect(popover).toContainText("export the project as a ZIP or push it");
  await expect(popover).toContainText("Code export and GitHub push are part of Pro.");
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/code-read-only.png` });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});
