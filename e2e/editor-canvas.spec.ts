/** P4-2: breakpoint frames side by side on a pannable, zoomable canvas. */
import { expect, test } from "@playwright/test";
import { openNewProject } from "./helpers";

test("canvas shows breakpoint frames and zooms and pans", async ({ page, context }) => {
  await openNewProject(page, context, { name: "Canvas test", templateId: "landing" });
  const viewport = page.getByTestId("canvas-viewport");
  const frames = viewport.locator("[data-frame]");
  await expect(frames).toHaveCount(3);

  // Side by side, widest first, at breakpoint widths (scaled by the fitted zoom).
  const boxes = await Promise.all([0, 1, 2].map(async (i) => frames.nth(i).boundingBox()));
  const [d, t, m] = boxes.map((b) => b ?? { x: 0, y: 0, width: 0, height: 0 });
  expect(d.x).toBeLessThan(t.x);
  expect(t.x).toBeLessThan(m.x);
  expect(d.width / m.width).toBeCloseTo(1200 / 390, 1);

  const zoom = page.getByTestId("zoom-level");
  await expect(zoom).not.toHaveText("100%");
  await page.keyboard.press("Shift+Digit0");
  await expect(zoom).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveText("150%");
  await page.keyboard.press("Control+Minus");
  await expect(zoom).toHaveText("100%");

  // Ctrl+wheel zooms around the cursor; plain wheel pans.
  const box = (await viewport.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 200);
  await page.keyboard.up("Control");
  await expect(zoom).not.toHaveText("100%");
  const before = await frames.first().boundingBox();
  await page.mouse.wheel(0, 120);
  await expect
    .poll(async () => (await frames.first().boundingBox())?.y)
    .toBeLessThan(before?.y ?? 0);

  await page.keyboard.press("Shift+Digit1");
  await page
    .getByRole("button", { name: /Tablet/ })
    .last()
    .click();
  await expect(
    page.getByRole("group", { name: "Breakpoints" }).getByRole("button", { name: /Tablet/ }),
  ).toHaveAttribute("aria-pressed", "true");
});
