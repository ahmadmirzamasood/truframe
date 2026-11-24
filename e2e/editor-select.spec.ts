/**
 * P4-6: select, multi-select, hover, drag to reorder/reparent, resize (Fixed), snapping and
 * measurement on the canvas. Every gesture is one undo step.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const sections = (page: Page, bp = "desktop") =>
  frame(page, bp).locator("main[data-tf-node] > section");

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
}

async function dragBy(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test("select, drag to reorder, resize, measure and delete on the canvas", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Gestures", templateId: "landing" });
  await expect(sections(page)).toHaveCount(3);
  await page.keyboard.press("Shift+Digit1");
  const names = async () =>
    sections(page).evaluateAll((els) =>
      els.map((e) => e.className.split(" ")[0] ?? e.getAttribute("data-tf-node")),
    );
  const ids = await sections(page).evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-tf-node")),
  );

  // Click selects the section (top level first); its size shows under it.
  const hero = await box(sections(page).first());
  await page.mouse.click(hero.x + 10, hero.y + 10);
  await expect(page.getByTestId("selection-size")).toHaveText(/^1200 × \d+$/);

  // Drag the last section above the first: one drop indicator, one transaction.
  const cta = await box(sections(page).last());
  await page.mouse.move(cta.x + 40, cta.y + cta.height / 2);
  await page.mouse.down();
  await page.mouse.move(cta.x + 45, cta.y + cta.height / 2 + 5, { steps: 2 });
  await page.mouse.move(hero.x + 40, hero.y + 3, { steps: 10 });
  await expect(page.getByTestId("drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() => sections(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node"))))
    .toEqual([ids[2], ids[0], ids[1]]);
  // Every frame shows the new order.
  await expect
    .poll(() =>
      sections(page, "mobile").evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node"))),
    )
    .toEqual([ids[2], ids[0], ids[1]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => sections(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node"))))
    .toEqual(ids);
  expect(await names()).toHaveLength(3);

  // Double-click drills into the hero: its heading is selected.
  const heading = frame(page, "desktop").locator("main section h1");
  const h = await box(heading);
  await page.mouse.dblclick(h.x + h.width / 2, h.y + h.height / 2);
  const before = (await box(heading)).width;

  // Resize on Mobile only: click the heading in the mobile frame, drag its right handle.
  const mobileHeading = frame(page, "mobile").locator("main section h1");
  const mh = await box(mobileHeading);
  await page.mouse.dblclick(mh.x + mh.width / 2, mh.y + mh.height / 2);
  await expect(
    page.getByRole("group", { name: "Breakpoints" }).getByRole("button", { name: /Mobile/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const handle = page.locator('[data-handle="e"]');
  const hb = await box(handle);
  await dragBy(
    page,
    { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 },
    { x: hb.x + hb.width / 2 - 40, y: hb.y + hb.height / 2 },
  );
  const mobileWidth = await mobileHeading.evaluate((el) => getComputedStyle(el).width);
  expect(Number.parseFloat(mobileWidth)).toBeLessThan(
    mh.width / ((await box(frame(page, "mobile"))).width / 390) - 20,
  );
  // Desktop keeps its width: the override is Mobile only.
  expect((await box(heading)).width).toBeCloseTo(before, 0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => mobileHeading.evaluate((el) => el.style.width || getComputedStyle(el).width))
    .not.toBe(mobileWidth);

  // Alt shows distances to the parent.
  await page.mouse.move(mh.x + 2, mh.y + 2);
  await page.keyboard.down("Alt");
  await page.mouse.move(mh.x + 4, mh.y + 4);
  await expect(page.getByTestId("measure-label").first()).toBeVisible();
  await page.keyboard.up("Alt");

  // Shift+click adds a second section; Delete removes both in one step.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const s0 = await box(sections(page).nth(0));
  const s1 = await box(sections(page).nth(1));
  await page.mouse.click(s0.x + 10, s0.y + 10);
  await expect(page.getByTestId("selection-outline")).toHaveCount(1);
  await page.keyboard.down("Shift");
  await page.mouse.click(s1.x + 10, s1.y + 10);
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("selection-outline")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(sections(page)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(sections(page)).toHaveCount(3);
});
