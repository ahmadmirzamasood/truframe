/**
 * P5-6: "Add auto layout" turns a Free frame back into a stack inferred from where its
 * children are, keeping them in place; "Group into stack" wraps a selection in a new stack.
 * Each is one undo step.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const sections = (page: Page) => page.locator('[data-frame="desktop"] main > section');
const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("not rendered");
  return b;
};
const radio = (page: Page, group: string, name: string) =>
  page
    .getByRole("tabpanel", { name: "Inspect" })
    .getByRole("radiogroup", { name: group })
    .getByRole("radio", { name });

test("auto layout: infer a stack from a Free frame, group a selection into a stack", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Auto layout", templateId: "landing" });
  await page.keyboard.press("Shift+Digit1");

  // Add auto layout: Free keeps the hero's children where they are, Shift+A infers the stack.
  const hero = sections(page).first();
  const kids = hero.locator(":scope > *");
  const before = await Promise.all((await kids.all()).map(box));
  const h = await box(hero);
  await page.mouse.click(h.x + 6, h.y + 6);
  await radio(page, "Display", "Free").click();
  await expect(radio(page, "Display", "Free")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Shift+A");
  await expect(radio(page, "Display", "Stack")).toHaveAttribute("aria-checked", "true");
  await expect(radio(page, "Direction", "Vertical")).toHaveAttribute("aria-checked", "true");
  await expect(kids.first()).toHaveCSS("position", "static");
  const after = await Promise.all((await kids.all()).map(box));
  for (const [i, b] of before.entries()) {
    expect(Math.abs((after[i]?.x ?? 0) - b.x), `child ${i} x`).toBeLessThanOrEqual(2);
    expect(Math.abs((after[i]?.y ?? 0) - b.y), `child ${i} y`).toBeLessThanOrEqual(2);
  }
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(radio(page, "Display", "Free")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(radio(page, "Display", "Stack")).toHaveAttribute("aria-checked", "true");

  // Group into stack: two sections become one stack in their place, in order.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const s1 = await box(sections(page).nth(1));
  const s2 = await box(sections(page).nth(2));
  await page.mouse.click(s2.x + 10, s2.y + 10);
  await page.keyboard.down("Shift");
  await page.mouse.click(s1.x + 10, s1.y + 10);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-outline")).toHaveCount(2);
  await page.keyboard.press("Control+g");
  const stacked = page.locator('[data-frame="desktop"] main > div > section');
  await expect(stacked).toHaveCount(2);
  await expect(sections(page)).toHaveCount(1);
  await expect(page.getByTestId("inspector-name")).toHaveText("Stack");
  await expect(radio(page, "Direction", "Vertical")).toHaveAttribute("aria-checked", "true");
  const g1 = await box(stacked.nth(0));
  expect(Math.abs(g1.y - s1.y)).toBeLessThanOrEqual(2);
  // Full-width sections stay full width inside the new stack.
  expect(Math.abs(g1.width - s1.width)).toBeLessThanOrEqual(2);

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/auto-layout.png` });

  await page.keyboard.press("Control+z");
  await expect(sections(page)).toHaveCount(3);
});
