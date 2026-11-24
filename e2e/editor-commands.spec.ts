/** P4-10: shortcuts, the Cmd+K palette and the shortcut sheet all run registered commands. */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const sections = (page: Page) =>
  page
    .locator('[data-frame="desktop"] main > section')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node")));

test("command palette, shortcut sheet and keyboard commands", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Commands", templateId: "landing" });
  const zoom = page.getByTestId("zoom-level");

  // Cmd/Ctrl+K opens the palette; typing filters; Enter runs the command.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette.getByRole("combobox", { name: "Search commands" })).toBeFocused();
  await page.keyboard.type("zoom 100");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(zoom).toHaveText("100%");
  await page.keyboard.press("Shift+Digit1");
  await expect(zoom).not.toHaveText("100%");

  // The palette lists insert tools too; clicking one runs it.
  await page.getByRole("button", { name: "Commands" }).click();
  await page.keyboard.type("insert text");
  await page.getByRole("option", { name: /Insert Text/ }).click();
  await expect(page.locator('[data-frame="desktop"] main > p')).toHaveText("Text");

  // Keyboard: select a section, move it with Alt+↑, duplicate with Ctrl+D, delete.
  const before = await sections(page);
  await page
    .getByRole("tree", { name: "Desktop layers" })
    .getByRole("button", { name: /^Features/ })
    .click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sections(page)).toEqual([before[1], before[0], before[2]]);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await sections(page)).length).toBe(4);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await sections(page)).length).toBe(3);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await sections(page)).length).toBe(4);

  // Alt+3 edits Mobile; ? opens the shortcut sheet.
  await page.keyboard.press("Alt+Digit3");
  await expect(
    page.getByRole("group", { name: "Breakpoints" }).getByRole("button", { name: /Mobile/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+Slash");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet.getByRole("region", { name: "Insert" })).toContainText("Insert Stack");
  await expect(sheet.getByRole("region", { name: "Edit" })).toContainText("Undo");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
