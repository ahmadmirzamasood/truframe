import { type BrowserContext, expect, type Page } from "@playwright/test";

export const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Each test acts as its own client IP (auth routes are rate-limited per IP; local only). */
export async function ownClientIp(context: BrowserContext): Promise<void> {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
}

/** Signs in through the local mock Google provider and lands on the dashboard. */
export async function signInWithMock(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Mock Google" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Clicks a trigger until its dialog opens (a click before hydration does nothing in dev). */
export async function openDialog(page: Page, trigger: string, dialogName: string) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: trigger }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}
