/**
 * P4-7: every inspector section changes the canvas through ops; tablet/mobile edits are
 * overrides with a red dot and "Reset to inherited".
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const panel = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });

async function fill(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

/** Ctrl/Cmd+click selects the deepest layer under the pointer. */
async function selectDeep(page: Page, el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw new Error("layer not visible");
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up("Control");
}

test("inspector sections edit the selection at the editing breakpoint", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Inspector", templateId: "landing" });
  const p = panel(page);

  // Page (nothing selected): page settings, page colors, guides.
  await expect(p.getByTestId("inspector-name")).toHaveText("Home");
  await fill(p.getByLabel("Page title"), "Welcome");
  await expect(p.getByLabel("Page title")).toHaveValue("Welcome");
  await expect(
    p.getByRole("list", { name: "Selection colors" }).getByRole("listitem").first(),
  ).toBeVisible();
  await fill(p.getByLabel("Page color #ffffff hex"), "#fefce8");
  await expect(frame(page, "desktop").locator("a span").first()).toHaveCSS(
    "color",
    "rgb(254, 252, 232)",
  );
  await fill(p.getByLabel("Guide columns"), "4");
  await expect(page.getByTestId("column-guide")).toHaveCount(4);

  // Text: content and typography on Desktop.
  const h1 = frame(page, "desktop").locator("main section h1");
  await selectDeep(page, h1);
  await expect(p.getByTestId("inspector-name")).toHaveText(/Text|.+/);
  await fill(p.getByLabel("Text content"), "Hello, world");
  await p.getByLabel("Text content").blur();
  await expect(h1).toHaveText("Hello, world");
  await fill(p.getByLabel("Font size"), "40");
  await expect(h1).toHaveCSS("font-size", "40px");
  await p.getByLabel("Font weight").selectOption("400");
  await expect(h1).toHaveCSS("font-weight", "400");
  await p.getByRole("radio", { name: "Right" }).click();
  await expect(h1).toHaveCSS("text-align", "right");
  await p.getByLabel("Text transform").selectOption("uppercase");
  await expect(h1).toHaveCSS("text-transform", "uppercase");
  await p
    .getByRole("radiogroup", { name: "Truncation" })
    .getByRole("radio", { name: "One line …" })
    .click();
  await expect(h1).toHaveCSS("text-overflow", "ellipsis");
  await expect(h1).toHaveCSS("white-space", "nowrap");
  await p
    .getByRole("radiogroup", { name: "Truncation" })
    .getByRole("radio", { name: "Wrap" })
    .click();
  await expect(h1).toHaveCSS("white-space", "normal");

  // Mobile override: red dot, then reset to inherited.
  await page
    .getByRole("group", { name: "Breakpoints" })
    .getByRole("button", { name: /Mobile/ })
    .click();
  await expect(p.getByTestId("inspector-breakpoint")).toHaveText("Mobile");
  const mobileH1 = frame(page, "mobile").locator("main section h1");
  await fill(p.getByLabel("Font size"), "22");
  await expect(mobileH1).toHaveCSS("font-size", "22px");
  await expect(h1).toHaveCSS("font-size", "40px");
  await p.getByRole("button", { name: "Reset Size to inherited" }).click();
  await expect(mobileH1).toHaveCSS("font-size", "40px");
  await expect(p.getByRole("button", { name: "Reset Size to inherited" })).toHaveCount(0);
  // Visibility per breakpoint: hidden on Mobile only.
  await p
    .getByRole("radiogroup", { name: "Visible on Mobile" })
    .getByRole("radio", { name: "Hidden" })
    .click();
  await expect(mobileH1).toBeHidden();
  await expect(h1).toBeVisible();
  await page
    .getByRole("group", { name: "Breakpoints" })
    .getByRole("button", { name: /Desktop/ })
    .click();

  // Text color: bound to a variable; detach keeps its value, then set a literal.
  await expect(p.getByTestId("bound-variable")).toContainText("Ink");
  await p.getByRole("button", { name: "Detach text variable" }).click();
  await fill(p.getByLabel("Text hex"), "#f3f4f6");
  await expect(h1).toHaveCSS("color", "rgb(243, 244, 246)");
  await expect(p.getByRole("list", { name: "Accessibility problems" })).toContainText("contrast");

  // Section: style, layout, padding, fill, border, radius, shadow, layer, tag.
  await p.getByLabel("Text hex").blur();
  await page.keyboard.press("Escape");
  const hero = frame(page, "desktop").locator("main > section").first();
  await expect(p.getByTestId("inspector-name")).toHaveText("Hero");
  await p
    .getByRole("radiogroup", { name: "Direction" })
    .getByRole("radio", { name: "Horizontal" })
    .click();
  await expect(hero).toHaveCSS("flex-direction", "row");
  await p.getByLabel("Align").selectOption("Bottom right");
  // Newer Chromium reports flex-end as flow-end.
  await expect(hero).toHaveCSS("justify-content", /^(flex|flow)-end$/);
  await expect(hero).toHaveCSS("align-items", /^(flex|flow)-end$/);
  await p
    .getByRole("radiogroup", { name: "Distribute" })
    .getByRole("radio", { name: "between" })
    .click();
  await expect(hero).toHaveCSS("justify-content", "space-between");
  await fill(p.getByLabel("Gap", { exact: true }), "10");
  await expect(hero).toHaveCSS("column-gap", "10px");
  await fill(p.getByLabel("Padding horizontal"), "50");
  await expect(hero).toHaveCSS("padding-left", "50px");
  await p
    .getByRole("radiogroup", { name: "Overflow" })
    .getByRole("radio", { name: "Clip" })
    .click();
  await expect(hero).toHaveCSS("overflow-x", "clip");
  await p
    .getByRole("radiogroup", { name: "Fill type" })
    .getByRole("radio", { name: "Solid" })
    .click();
  await fill(p.getByLabel("Fill hex"), "#dbeafe");
  await expect(hero).toHaveCSS("background-color", "rgb(219, 234, 254)");
  await p.getByRole("button", { name: "Add border" }).click();
  await expect(hero).toHaveCSS("border-top-width", "1px");
  await fill(p.getByLabel("Radius", { exact: true }), "12");
  await expect(hero).toHaveCSS("border-top-left-radius", "12px");
  await p.getByRole("button", { name: "Add shadow" }).click();
  await expect(hero).not.toHaveCSS("box-shadow", "none");
  await fill(p.getByLabel("Opacity", { exact: true }), "50");
  await expect(hero).toHaveCSS("opacity", "0.5");
  await p.getByLabel("Semantic tag").selectOption("header");
  await expect(frame(page, "desktop").locator("main > header")).toHaveCount(1);

  // Position: absolute is opt-in.
  await p
    .getByRole("radiogroup", { name: "Position" })
    .getByRole("radio", { name: "Absolute" })
    .click();
  await expect(frame(page, "desktop").locator("main > header")).toHaveCSS("position", "absolute");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frame(page, "desktop").locator("main > header")).toHaveCSS("position", "static");

  // Image: fit, ratio, alt text (inserted at the end of the page).
  await page.locator("body").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page
    .getByRole("toolbar", { name: "Insert" })
    .getByRole("button", { name: "Insert Image" })
    .click();
  await expect(p.getByTestId("inspector-name")).toHaveText("Image");
  await p
    .getByRole("radiogroup", { name: "Aspect ratio" })
    .getByRole("radio", { name: "1:1" })
    .click();
  await fill(p.getByLabel("Alt text"), "A photo");
  const img = frame(page, "desktop").locator('main > div[role="img"]');
  await expect(img).toHaveAttribute("aria-label", "A photo");
  await expect(img).toHaveCSS("aspect-ratio", "1 / 1");
  await p
    .getByRole("radiogroup", { name: "Image fit" })
    .getByRole("radio", { name: "Fit" })
    .click();
  await expect(
    p.getByRole("radiogroup", { name: "Image fit" }).getByRole("radio", { name: "Fit" }),
  ).toHaveAttribute("aria-checked", "true");
});
