/** P4-5: each insert tool adds a layer through one op; inside a selected frame when there is one. */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const desktop = (page: Page) => page.locator('[data-frame="desktop"]');
const tool = (page: Page, name: string) =>
  page.getByRole("toolbar", { name: "Insert" }).getByRole("button", { name: `Insert ${name}` });

test("insert tools add Stack, Grid, Text, Image, Button and Icon layers", async ({
  page,
  context,
}) => {
  await openNewProject(page, context, { name: "Insert", templateId: "blank" });
  const body = desktop(page).locator("main[data-tf-node]");
  await expect(body).toBeAttached();
  await expect(body.locator(":scope > *")).toHaveCount(0);

  // Stack, then everything else goes inside the selected (new) stack.
  await tool(page, "Stack").click();
  const stack = body.locator(":scope > div");
  await expect(stack).toHaveCount(1);
  await expect(stack).toHaveCSS("display", "flex");
  await expect(stack).toHaveCSS("flex-direction", "column");
  await expect(stack).toHaveCSS("padding-top", "24px");

  await tool(page, "Grid").click();
  const grid = stack.locator(":scope > div");
  await expect(grid).toHaveCSS("display", "grid");
  // The grid is selected now: Text, Image, Button and Icon go into it.
  await tool(page, "Text").click();
  await expect(grid.locator(":scope > p")).toHaveText("Text");

  // Keyboard shortcuts work too (I = image, B = button). The text is a leaf, so the image
  // goes after it in the same grid.
  await page.keyboard.press("i");
  await expect(grid.locator(':scope > div[aria-hidden="true"]')).toHaveCSS("width", "320px");
  await page.keyboard.press("b");
  const button = grid.locator(":scope > a");
  await expect(button).toHaveText("Button");
  await expect(button).toHaveCSS("background-color", "rgb(17, 24, 39)");
  // The button is selected and can hold an icon (a link can't hold another button).
  await tool(page, "Icon").click();
  await expect(button.locator(':scope > span[aria-hidden="true"] img')).toHaveAttribute(
    "src",
    /lucide\/star\.svg/,
  );
  await expect(grid.locator(":scope > *")).toHaveCount(3);

  // Every frame shows the new layers, and each insert was one undo step.
  await expect(page.locator('[data-frame="mobile"] main[data-tf-node] div')).toHaveCount(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(button.locator(":scope > span")).toHaveCount(1);
  await expect(button.locator("img")).toHaveCount(0);
});
