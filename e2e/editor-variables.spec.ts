/**
 * P5-1: the Variables panel creates, edits, renames, duplicates and deletes variables; the
 * compiled tokens (which the canvas uses) follow every change.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

type Doc = {
  variables: Record<string, { name: string; cssName: string; value: Record<string, unknown> }>;
};

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"] > [data-tf-frame]`);
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __truframeDoc: () => Doc }).__truframeDoc());
/** A custom property as the canvas frame resolves it (from the compiler's tokens.css). */
const cssVar = (page: Page, bp: string, name: string) =>
  frame(page, bp).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test("variables panel: create, edit, rename, duplicate and delete", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Variables", templateId: "landing" });
  await page.getByRole("tab", { name: "Variables" }).click();
  const panel = page.getByTestId("variables-panel");
  await expect(panel.getByRole("listitem", { name: "Accent" })).toBeVisible();
  await expect(panel.getByRole("listitem", { name: "Ink" })).toBeVisible();
  const button = frame(page, "desktop").locator("a").first();
  await expect(button).toHaveCSS("background-color", "rgb(79, 70, 229)");

  // New color variable with a Tablet value; the dialog previews the generated code.
  await panel.getByRole("button", { name: "New variable" }).click();
  const dialog = page.getByRole("dialog", { name: "New variable" });
  await dialog.getByLabel("Name").fill("Highlight");
  await dialog.getByLabel("Group").fill("Brand");
  await dialog.getByLabel("Desktop value hex").fill("#ff0066");
  await dialog.getByLabel("Desktop value hex").press("Tab");
  await dialog.getByTestId("variable-value-tablet").getByRole("button", { name: /Set/ }).click();
  await dialog.getByLabel("Tablet value hex").fill("#00aa55");
  await dialog.getByLabel("Tablet value hex").press("Tab");
  const code = dialog.getByTestId("generated-code");
  await expect(code).toContainText("--brand-highlight: #ff0066;");
  await expect(code).toContainText("@media (width < 1200px)");
  await expect(code).toContainText("--brand-highlight: #00aa55;");
  await expect(code).toContainText("--color-brand-highlight: var(--brand-highlight);");
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/variables-dialog.png` });
  await dialog.getByRole("button", { name: "Create variable" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole("listitem", { name: "Highlight" })).toBeVisible();
  await expect.poll(() => cssVar(page, "desktop", "--brand-highlight")).toBe("#ff0066");
  await expect.poll(() => cssVar(page, "tablet", "--brand-highlight")).toBe("#00aa55");
  await expect.poll(() => cssVar(page, "mobile", "--brand-highlight")).toBe("#00aa55");
  if (shots) await page.screenshot({ path: `${shots}/variables-panel.png` });

  // A spacing variable on the Spacing tab.
  await panel.getByRole("tab", { name: "Spacing" }).click();
  await panel.getByRole("button", { name: "New variable" }).click();
  const spacing = page.getByRole("dialog", { name: "New variable" });
  await expect(spacing.getByRole("radio", { name: "Spacing" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await spacing.getByLabel("Name").fill("Section");
  await spacing.getByLabel("Group").fill("Space");
  await spacing.getByLabel("Desktop value").fill("96");
  await spacing.getByLabel("Desktop value").press("Tab");
  await expect(spacing.getByTestId("generated-code")).toContainText("--space-section: 96px;");
  await spacing.getByRole("button", { name: "Create variable" }).click();
  await expect(panel.getByRole("listitem", { name: "Section" })).toBeVisible();
  await expect.poll(() => cssVar(page, "desktop", "--space-section")).toBe("96px");

  // Editing Accent's value updates the bound button and the compiled token.
  await panel.getByRole("tab", { name: "Colors" }).click();
  await panel.getByRole("button", { name: "Edit Accent" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Accent" });
  await edit.getByLabel("Desktop value hex").fill("#16a34a");
  await edit.getByLabel("Desktop value hex").press("Tab");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(button).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await expect.poll(() => cssVar(page, "desktop", "--brand-accent")).toBe("#16a34a");

  // Renaming renames the custom property; the button stays bound.
  await panel.getByRole("button", { name: "Edit Accent" }).click();
  const rename = page.getByRole("dialog", { name: "Edit Accent" });
  await rename.getByLabel("Name").fill("Primary");
  await expect(rename.getByTestId("generated-code")).toContainText("--brand-primary: #16a34a;");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await doc(page)).variables.accent?.cssName)
    .toBe("--brand-primary");
  await expect.poll(() => cssVar(page, "desktop", "--brand-primary")).toBe("#16a34a");
  await expect(button).toHaveCSS("background-color", "rgb(22, 163, 74)");

  // Duplicate.
  await panel.getByRole("button", { name: "Actions for Primary" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(panel.getByRole("listitem", { name: "Primary copy" })).toBeVisible();

  // Search filters the list.
  await panel.getByLabel("Search variables").fill("ink");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await panel.getByLabel("Search variables").fill("");

  // Delete warns with the usage count; bound layers keep their color.
  await panel.getByRole("button", { name: "Actions for Primary", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Primary?" });
  await expect(confirm).toContainText(/Used in \d+ places?/);
  await confirm.getByRole("button", { name: "Delete variable" }).click();
  await expect(panel.getByRole("listitem", { name: "Primary", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await doc(page)).variables.accent).toBeUndefined();
  await expect(button).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await expect.poll(() => cssVar(page, "desktop", "--brand-primary")).toBe("");

  // Undo brings the variable and its bindings back in one step.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(panel.getByRole("listitem", { name: "Primary", exact: true })).toBeVisible();
  await expect.poll(() => cssVar(page, "desktop", "--brand-primary")).toBe("#16a34a");
});
