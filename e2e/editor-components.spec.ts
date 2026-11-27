/**
 * P5-3: create a component from a layer, place instances, edit the main component (exposed
 * props and a variant), pick variants and prop values per instance, reset and detach. The
 * resulting document compiles to a component file with imports in both frameworks.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { compile, initCompilerFromDisk } from "../packages/compiler-wasm/src/node.ts";
import { openNewProject } from "./helpers";

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const inspector = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __truframeDoc: () => unknown }).__truframeDoc());

async function selectDeep(page: Page, el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw new Error("layer not visible");
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up("Control");
}

async function fill(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

test("components: create, instances, main, variants, props, detach", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Components", templateId: "landing" });
  const p = inspector(page);
  const links = frame(page, "desktop").locator("main a");
  await expect(links).toHaveCount(2);

  // Create a component from the first button.
  await selectDeep(page, links.first().locator("span"));
  await page.keyboard.press("Escape");
  await expect(p.getByTestId("inspector-name")).toHaveText("Button");
  await p.getByRole("button", { name: "Create component" }).click();
  await expect(p.getByText("Instance of Button").first()).toBeVisible();
  await expect(links.first()).toHaveCSS("background-color", "rgb(79, 70, 229)");
  await expect(links.first()).toHaveCSS("padding-left", "24px");

  // Place a second instance from the Components panel.
  await page.getByRole("tab", { name: "Components" }).click();
  const panel = page.getByTestId("components-panel");
  await expect(panel.getByRole("listitem", { name: "Button" })).toContainText("1 instance");
  await panel.getByRole("button", { name: "Insert Button" }).click();
  await expect(panel.getByRole("listitem", { name: "Button" })).toContainText("2 instances");
  await expect(links).toHaveCount(3);
  const second = links.nth(1);

  // Edit the main component: expose the label text and add a Size variant.
  await page.getByRole("tab", { name: "Inspect" }).click();
  await p.getByRole("button", { name: "Main" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Editing main component" }),
  ).toBeVisible();
  const main = frame(page, "desktop").locator("a").first();
  await selectDeep(page, main.locator("span"));
  await p.getByRole("button", { name: "Expose text" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(p.getByTestId("inspector-name")).toHaveText("Button");
  await expect(p.getByText("Main component")).toBeVisible();
  await expect(p.getByRole("region", { name: "Properties", exact: true })).toContainText("label");
  await p.getByRole("button", { name: "Add variant properties" }).click();
  await p.getByLabel("Variant property name").fill("Size");
  await p.getByLabel("Variant values").fill("default, large");
  await p.getByRole("button", { name: "Add property" }).click();
  await p.getByLabel("Editing size").selectOption("large");
  await expect(p.getByTestId("editing-variant")).toContainText("size=large");
  // Style the large variant: wider padding and a bigger radius.
  await selectDeep(page, main.locator("span"));
  await page.keyboard.press("Escape");
  await fill(p.getByLabel("Padding horizontal", { exact: true }), "48");
  await expect(main).toHaveCSS("padding-left", "48px");
  await page.getByRole("button", { name: "Back to page" }).first().click();
  await expect(links).toHaveCount(3);
  // The default variant didn't change.
  await expect(links.first()).toHaveCSS("padding-left", "24px");

  // Per instance: pick the variant and set the label.
  // Instances are one layer on the page: a click inside selects the instance.
  await selectDeep(page, second.locator("span"));
  await expect(p.getByText("Instance of Button").first()).toBeVisible();
  await p.getByLabel("Variant size").selectOption("large");
  await expect(second).toHaveCSS("padding-left", "48px");
  await expect(links.first()).toHaveCSS("padding-left", "24px");
  await expect(p.getByRole("button", { name: "Reset size override" })).toBeVisible();
  await fill(p.getByLabel("Property label"), "Buy now");
  await expect(second).toHaveText("Buy now");
  await expect(links.first()).toHaveText("Get started");

  // The document compiles to a component file with a typed variant and imports.
  initCompilerFromDisk();
  const current = (await doc(page)) as Parameters<typeof compile>[0];
  const next = compile(current, "nextjs").files;
  expect(next["components/Button.tsx"]).toMatch(/size\?: "default" \| "large"/);
  expect(next["app/page.tsx"]).toContain('import Button from "@/components/Button";');
  expect(next["app/page.tsx"]).toContain('size="large"');
  expect(next["app/page.tsx"]).toContain('label="Buy now"');
  const astro = compile(current, "astro").files;
  expect(astro["src/components/Button.astro"]).toBeDefined();
  expect(astro["src/pages/index.astro"]).toMatch(
    /import Button from "[^"]*components\/Button\.astro";/,
  );

  // Reset, then detach.
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(second).toHaveCSS("padding-left", "24px");
  await expect(second).toHaveText("Get started");
  await p.getByRole("button", { name: "Detach" }).click();
  await expect(p.getByTestId("inspector-name")).toHaveText("Button");
  await expect(p.getByText("Instance of Button").first()).toHaveCount(0);
  await page.getByRole("tab", { name: "Components" }).click();
  await expect(panel.getByRole("listitem", { name: "Button" })).toContainText("1 instance");

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) {
    await page.getByRole("tab", { name: "Inspect" }).click();
    await selectDeep(page, links.first().locator("span"));
    await p.getByLabel("Variant size").selectOption("large");
    await page.getByRole("tab", { name: "Components" }).click();
    await page.screenshot({ path: `${shots}/components.png` });
  }
});
