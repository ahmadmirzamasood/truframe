/**
 * P5-8: Accessibility Checks in the inspector flag focus-ring contrast per breakpoint and tap
 * targets under 24 px on mobile (measured on the canvas); each problem selects its layer.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const panel = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });

async function fill(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

test("accessibility checks: focus ring contrast and tap targets", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "A11y", templateId: "blank" });
  const p = panel(page);

  await page.getByRole("button", { name: "Insert Button" }).click();
  await expect(p.getByTestId("inspector-name")).toHaveText("Button");
  const problems = p.getByRole("list", { name: "Accessibility problems" });
  await expect(p.getByText("No problems found.")).toBeVisible();

  // A white focus ring on a white page fails at every breakpoint.
  await fill(p.getByLabel("Focus ring hex"), "#ffffff");
  await expect(problems.getByRole("button", { name: /Focus ring contrast/ })).toHaveCount(3);

  // Generated sites draw the ring in the link's color.
  const link = page.locator('[data-frame="desktop"] a').first();
  await expect(link).toHaveCSS("color", "rgb(255, 255, 255)");
  await fill(p.getByLabel("Focus ring hex"), "#1d4ed8");
  await expect(problems).toHaveCount(0);

  // Mobile: shrink the button below 24 px.
  await page
    .getByRole("group", { name: "Breakpoints" })
    .getByRole("button", { name: /Mobile/ })
    .click();
  // Padding sets a minimum size, so remove it too: the check reports the rendered size.
  await fill(p.getByLabel("Padding horizontal", { exact: true }), "0");
  await fill(p.getByLabel("W", { exact: true }), "18");
  await expect(problems.getByRole("button", { name: /Tap target 18 × \d+ px/ })).toBeVisible();

  // The problem links to its layer, from the page inspector too.
  await p.getByLabel("W", { exact: true }).blur();
  await page.keyboard.press("Escape");
  await expect(p.getByTestId("inspector-name")).toHaveText("Home");
  await problems.getByRole("button", { name: /Tap target/ }).click();
  await expect(p.getByTestId("inspector-name")).toHaveText("Button");

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/a11y-checks.png` });
});
