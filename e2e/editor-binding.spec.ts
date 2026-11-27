/**
 * P5-2: inspector fields bind to variables (color, spacing, radius, size, text style), and
 * editing a variable updates every bound layer on the canvas.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const inspector = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });

/** Ctrl/Cmd+click selects the deepest layer under the pointer. */
async function selectDeep(page: Page, el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw new Error("layer not visible");
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up("Control");
}

async function bind(page: Page, field: string, variable: RegExp) {
  await inspector(page)
    .getByRole("button", { name: `Bind ${field} to a variable` })
    .click();
  await page.getByRole("menuitem", { name: variable }).click();
}

async function editVariable(page: Page, tab: string, name: string, field: string, value: string) {
  await page.getByRole("tab", { name: "Variables" }).click();
  const panel = page.getByTestId("variables-panel");
  await panel.getByRole("tab", { name: tab }).click();
  await panel.getByRole("button", { name: `Edit ${name}` }).click();
  const dialog = page.getByRole("dialog", { name: `Edit ${name}` });
  await dialog.getByLabel(field).fill(value);
  await dialog.getByLabel(field).press("Tab");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("bound layers follow their variables", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Binding", templateId: "landing" });

  // A spacing variable to bind to.
  await page.getByRole("tab", { name: "Variables" }).click();
  const panel = page.getByTestId("variables-panel");
  await panel.getByRole("tab", { name: "Spacing" }).click();
  await panel.getByRole("button", { name: "New variable" }).click();
  const dialog = page.getByRole("dialog", { name: "New variable" });
  await dialog.getByLabel("Name").fill("Pad");
  await dialog.getByLabel("Desktop value").fill("40");
  await dialog.getByRole("button", { name: "Create variable" }).click();
  await expect(panel.getByRole("listitem", { name: "Pad" })).toBeVisible();

  // Both buttons: horizontal padding, radius and width bound to Pad.
  const buttons = frame(page, "desktop").locator("main a");
  await expect(buttons).toHaveCount(2);
  for (const i of [0, 1]) {
    await selectDeep(page, buttons.nth(i).locator("span"));
    await page.keyboard.press("Escape"); // up from the label to the button
    await expect(inspector(page).getByTestId("inspector-name")).toHaveText("Button");
    await bind(page, "padding horizontal", /Pad/);
    await bind(page, "radius", /Pad/);
  }
  await expect(buttons.nth(0)).toHaveCSS("padding-left", "40px");
  await expect(buttons.nth(1)).toHaveCSS("padding-right", "40px");
  await expect(buttons.nth(0)).toHaveCSS("border-top-left-radius", "40px");
  await expect(inspector(page).getByTestId("bound-variable").first()).toHaveText("Pad");

  // The hero's gap, and the heading's color bound to Accent.
  const hero = frame(page, "desktop").locator("main section").first();
  const h1 = hero.locator("h1");
  await selectDeep(page, h1);
  await bind(page, "text", /Accent/);
  await expect(h1).toHaveCSS("color", "rgb(79, 70, 229)");
  await inspector(page).getByLabel("Text resizing").getByRole("radio", { name: /Fixed/ }).click();
  await bind(page, "w", /Pad/);
  await expect(h1).toHaveCSS("width", "40px");
  await page.keyboard.press("Escape");
  await bind(page, "gap", /Pad/);
  await expect(hero).toHaveCSS("row-gap", "40px");

  // Editing the variables updates every bound layer, at every breakpoint.
  await editVariable(page, "Spacing", "Pad", "Desktop value", "56");
  await expect(buttons.nth(0)).toHaveCSS("padding-left", "56px");
  await expect(buttons.nth(1)).toHaveCSS("padding-left", "56px");
  await expect(buttons.nth(0)).toHaveCSS("border-top-left-radius", "56px");
  await expect(h1).toHaveCSS("width", "56px");
  await expect(hero).toHaveCSS("row-gap", "56px");
  await expect(frame(page, "tablet").locator("main a").first()).toHaveCSS("padding-left", "56px");
  await editVariable(page, "Colors", "Accent", "Desktop value hex", "#dc2626");
  await expect(h1).toHaveCSS("color", "rgb(220, 38, 38)");
  await expect(buttons.nth(0)).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(frame(page, "tablet").locator("main a").first()).toHaveCSS(
    "background-color",
    "rgb(220, 38, 38)",
  );

  // Detach keeps the value and stops following the variable.
  await page.getByRole("tab", { name: "Inspect" }).click();
  await selectDeep(page, h1);
  await inspector(page).getByRole("button", { name: "Detach text variable" }).click();
  await editVariable(page, "Colors", "Accent", "Desktop value hex", "#16a34a");
  await expect(buttons.nth(0)).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await expect(h1).toHaveCSS("color", "rgb(220, 38, 38)");

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) {
    await page.getByRole("tab", { name: "Inspect" }).click();
    await selectDeep(page, buttons.nth(0).locator("span"));
    await page.keyboard.press("Escape");
    await inspector(page).getByRole("button", { name: "Bind fill to a variable" }).click();
    await page.screenshot({ path: `${shots}/binding.png` });
  }
});
