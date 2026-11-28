/**
 * P6-3: reveal in code (select a layer → Code View shows its element) and reveal in design
 * (click in the code → that layer is selected, on its own page, and shown on the canvas).
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const codeView = (page: Page) => page.getByTestId("code-view");
/** The highlighted element; CodeMirror draws a multi-line mark as one span per line. */
const revealed = (page: Page) =>
  expect.poll(async () =>
    (await codeView(page).locator(".cm-tf-revealed").allTextContents()).join("\n"),
  );
const layers = (page: Page) => page.getByRole("tree", { name: "Desktop layers" });

async function runCommand(page: Page, name: string) {
  await page.getByRole("button", { name: "Commands" }).click();
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: "Search commands" }).fill(name);
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
}

test("reveal in code and reveal in design", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Reveal", templateId: "saas" });

  // Reveal in code: select a layer on the canvas side, then switch.
  await layers(page)
    .getByRole("treeitem", { name: "Button", exact: true })
    .getByRole("button", { name: /^Button \./ })
    .first()
    .click();
  await runCommand(page, "Reveal in code");
  await expect(page.getByTestId("code-path")).toHaveText("app/page.tsx");
  await revealed(page).toContain("Start a free trial");
  await revealed(page).toContain('href="/pricing"');

  // Code View follows the selection.
  await layers(page)
    .getByRole("treeitem", { name: "Trusted by teams at" })
    .getByRole("button", { name: /^Trusted by teams at/ })
    .click();
  await revealed(page).toMatch(/^<p className="text-el-2[\s\S]*Trusted by teams at\s*<\/p>$/);
  await expect(codeView(page).locator(".cm-tf-revealed").first()).toBeInViewport();

  // Reveal in design: click in the code; that layer is selected.
  await codeView(page)
    .locator(".cm-line", { hasText: "The simplest way to run your team" })
    .click();
  const heading = layers(page).getByRole("treeitem", { name: "The simplest way to run your team" });
  await expect(heading).toHaveAttribute("aria-selected", "true");
  await revealed(page).toContain("<h1");
  await expect(page.getByRole("tabpanel", { name: "Inspect" })).toContainText("Text");
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/code-reveal.png` });

  await runCommand(page, "Reveal in design");
  await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible();
  await expect(page.getByTestId("selection-size")).toBeVisible();
  await expect(heading).toHaveAttribute("aria-selected", "true");

  // Code of another page: clicking in it opens that page with the layer selected.
  await page.getByRole("button", { name: "Code", exact: true }).click();
  const tree = page.getByRole("tree", { name: "Project files" });
  await tree.getByRole("treeitem", { name: "pricing", exact: true }).click();
  // Rows are flat and folders come first, so the pricing page file is the first page.tsx.
  await tree.getByRole("treeitem", { name: "page.tsx", exact: true }).first().click();
  await expect(page.getByTestId("code-path")).toHaveText("app/pricing/page.tsx");
  await codeView(page)
    .locator(".cm-line", { hasText: /^\s*Pricing\s*$/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /Pages: Pricing/ })).toBeVisible();
  await expect(layers(page).getByRole("treeitem", { selected: true })).toHaveCount(1);
});
