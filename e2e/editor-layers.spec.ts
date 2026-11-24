/**
 * P4-8: the Layers panel lists Desktop, Tablet and Mobile trees with code classes; selection
 * syncs with the canvas both ways; rename, hide per breakpoint, lock and drag work.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const tree = (page: Page, bp: string) => page.getByRole("tree", { name: `${bp} layers` });
const top = (page: Page, bp: string) => tree(page, bp).locator('[data-depth="1"]');
const sections = (page: Page, bp: string) =>
  page.locator(`[data-frame="${bp.toLowerCase()}"] main > section`);

test("layers panel: groups, code classes, two-way selection, rename, hide, lock, drag", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Layers", templateId: "landing" });
  await expect(top(page, "Desktop")).toHaveCount(3);
  await expect(
    tree(page, "Desktop").locator('[data-depth="1"] > div:first-child [data-testid="code-class"]'),
  ).toHaveText([".hero", ".features", ".call-to-action"]);

  // Panel → canvas.
  await top(page, "Desktop")
    .nth(1)
    .getByRole("button", { name: /^Features/ })
    .click();
  await expect(page.getByTestId("selection-outline")).toHaveCount(1);
  await expect(
    page.getByRole("tabpanel", { name: "Inspect" }).getByTestId("inspector-name"),
  ).toHaveText("Features");

  // Canvas → panel.
  const hero = await sections(page, "Desktop").first().boundingBox();
  if (!hero) throw new Error("no hero");
  await page.mouse.click(hero.x + 8, hero.y + 8);
  await expect(top(page, "Desktop").first()).toHaveAttribute("aria-selected", "true");
  await expect(top(page, "Desktop").nth(1)).toHaveAttribute("aria-selected", "false");

  // Selecting in the Tablet group edits Tablet.
  await page
    .getByRole("button", { name: /^Tablet/ })
    .first()
    .click();
  await top(page, "Tablet")
    .nth(2)
    .getByRole("button", { name: /^Call to action/ })
    .click();
  await expect(
    page.getByRole("group", { name: "Breakpoints" }).getByRole("button", { name: /Tablet/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Rename: double-click, type, Enter; the code class follows the name.
  await top(page, "Desktop").first().getByRole("button", { name: /^Hero/ }).dblclick();
  const rename = page.getByLabel("Rename Hero");
  await rename.fill("Intro");
  await rename.press("Enter");
  await expect(
    top(page, "Desktop").first().locator(":scope > div").first().getByTestId("code-class"),
  ).toHaveText(".intro");

  // Hide on Mobile only.
  await page
    .getByRole("button", { name: /^Mobile/ })
    .first()
    .click();
  await top(page, "Mobile").first().hover();
  await top(page, "Mobile").first().getByRole("button", { name: "Hide Intro on Mobile" }).click();
  await expect(sections(page, "Mobile").first()).toBeHidden();
  await expect(sections(page, "Desktop").first()).toBeVisible();

  // Lock: the canvas can't pick it; unlock restores it.
  await page.keyboard.press("Escape");
  await top(page, "Desktop").first().hover();
  await top(page, "Desktop").first().getByRole("button", { name: "Lock Intro" }).click();
  await page.mouse.click(hero.x + 8, hero.y + 8);
  await expect(top(page, "Desktop").first()).toHaveAttribute("aria-selected", "false");
  await top(page, "Desktop").first().getByRole("button", { name: "Unlock Intro" }).click();
  await page.mouse.click(hero.x + 8, hero.y + 8);
  await expect(top(page, "Desktop").first()).toHaveAttribute("aria-selected", "true");

  // Drag "Call to action" above "Intro": one transaction.
  const ids = () =>
    sections(page, "Desktop").evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node")));
  const before = await ids();
  const source = top(page, "Desktop").nth(2).locator(":scope > div").first();
  const target = top(page, "Desktop").first().locator(":scope > div").first();
  const t = await target.boundingBox();
  if (!t) throw new Error("no target");
  await source.dragTo(target, { targetPosition: { x: 40, y: 2 } });
  await expect.poll(ids).toEqual([before[2], before[0], before[1]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(ids).toEqual(before);
});
