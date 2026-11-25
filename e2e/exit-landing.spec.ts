/**
 * Phase 4 exit (docs/project/PLAN.md): build a 3-section landing page on Desktop, Tablet and
 * Mobile using only the editor UI, then save the document and a 100% screenshot of every
 * canvas frame to `test-results/exit-landing/`. `node scripts/parity.ts --doc … --canvas …`
 * builds the generated site and compares it with those screenshots (≤ 1% differing pixels);
 * CI runs it right after this test.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const OUT = join("test-results", "exit-landing");

const inspector = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });
const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"] [data-tf-frame]`);

async function insert(page: Page, tool: string) {
  await page
    .getByRole("toolbar", { name: "Insert" })
    .getByRole("button", { name: `Insert ${tool}` })
    .click();
}

async function field(page: Page, label: string, value: string) {
  const f = inspector(page).getByLabel(label, { exact: true });
  await f.fill(value);
  await f.press("Enter");
  await f.blur();
}

async function text(page: Page, words: string) {
  const f = inspector(page).getByLabel("Text content");
  await f.fill(words);
  await f.blur();
}

async function radio(page: Page, group: string, option: string) {
  await inspector(page)
    .getByRole("radiogroup", { name: group })
    .getByRole("radio", { name: option })
    .click();
}

async function select(page: Page, label: string, value: string) {
  await inspector(page).getByLabel(label, { exact: true }).selectOption(value);
}

/** Selects a layer through the Layers panel (Desktop group). */
async function pick(page: Page, name: RegExp) {
  await page
    .getByRole("tree", { name: "Desktop layers" })
    .getByRole("button", { name })
    .first()
    .click();
}

async function deselect(page: Page) {
  await page.locator("body").focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Escape");
}

async function section(page: Page, name: string, fill: string | null, padding: [string, string]) {
  await deselect(page);
  await insert(page, "Stack");
  await field(page, "Layer name", name);
  await select(page, "Semantic tag", "section");
  await select(page, "Align", "Top center");
  await field(page, "Gap", "24");
  await field(page, "Padding horizontal", padding[0]);
  await field(page, "Padding vertical", padding[1]);
  if (fill) {
    await radio(page, "Fill type", "Solid");
    await field(page, "Fill hex", fill);
  }
}

test("Phase 4 exit: a 3-section landing page built with the UI on every breakpoint", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  // Wide enough that "Zoom to fit" shows all three frames at 100%.
  await page.setViewportSize({ width: 3300, height: 2200 });
  await openNewProject(page, context, { name: "Exit landing", templateId: "blank" });
  await expect(page.getByRole("tree", { name: "Desktop layers" })).toBeAttached();

  // 1. Hero: heading, intro and a button.
  await section(page, "Hero", "#eef2ff", ["32", "96"]);
  await insert(page, "Text");
  await text(page, "Design it. Ship real code.");
  await select(page, "Semantic tag", "h1");
  await field(page, "Font size", "56");
  await select(page, "Font weight", "700");
  await radio(page, "Text align", "Center");
  await insert(page, "Text");
  await text(page, "A visual builder that writes the Next.js and Astro code for you.");
  await field(page, "Font size", "20");
  await radio(page, "Text align", "Center");
  await insert(page, "Button");
  await pick(page, /^Button/);
  await field(page, "Fill hex", "#4f46e5");
  await pick(page, /^Label/);
  await text(page, "Start building");

  // 2. Features: a heading and a 3-column grid of cards.
  await section(page, "Features", null, ["32", "80"]);
  await insert(page, "Text");
  await text(page, "Why teams use it");
  await select(page, "Semantic tag", "h2");
  await field(page, "Font size", "36");
  await select(page, "Font weight", "700");
  await pick(page, /^Features/);
  await insert(page, "Grid");
  await field(page, "Layer name", "Cards");
  await field(page, "Padding horizontal", "0");
  await field(page, "Padding vertical", "0");
  for (const [i, words] of ["Visual and exact", "Real, readable code", "Yours to keep"].entries()) {
    if (i === 0) await pick(page, /^Cards/);
    await insert(page, "Text");
    await text(page, words);
    await field(page, "Font size", "18");
  }

  // 3. Call to action on a dark band.
  await section(page, "Call to action", "#111827", ["32", "80"]);
  await insert(page, "Text");
  await text(page, "Start your first site today");
  await select(page, "Semantic tag", "h2");
  await field(page, "Font size", "32");
  await field(page, "Text hex", "#ffffff");
  await insert(page, "Button");
  // The new button is the last one on the page.
  await page
    .getByRole("tree", { name: "Desktop layers" })
    .getByRole("button", { name: /^Button/ })
    .last()
    .click();
  await field(page, "Fill hex", "#ffffff");
  await page
    .getByRole("tree", { name: "Desktop layers" })
    .getByRole("button", { name: /^Label/ })
    .last()
    .click();
  await field(page, "Text hex", "#111827");
  await text(page, "Get started");

  // Tablet: two columns, a smaller heading.
  await page
    .getByTestId("layers-panel")
    .getByRole("button", { name: /^Tablet/ })
    .click();
  await page
    .getByRole("tree", { name: "Tablet layers" })
    .getByRole("button", { name: /^Cards/ })
    .click();
  await field(page, "Columns", "2");
  await page
    .getByRole("tree", { name: "Tablet layers" })
    .getByRole("button", { name: /^Design it/ })
    .click();
  await field(page, "Font size", "44");

  // Mobile: one column, tighter hero.
  await page
    .getByTestId("layers-panel")
    .getByRole("button", { name: /^Mobile/ })
    .click();
  await page
    .getByRole("tree", { name: "Mobile layers" })
    .getByRole("button", { name: /^Cards/ })
    .click();
  await field(page, "Columns", "1");
  await page
    .getByRole("tree", { name: "Mobile layers" })
    .getByRole("button", { name: /^Design it/ })
    .click();
  await field(page, "Font size", "34");
  await page
    .getByRole("tree", { name: "Mobile layers" })
    .getByRole("button", { name: /^Hero/ })
    .click();
  await field(page, "Padding horizontal", "20");
  await field(page, "Padding vertical", "56");

  // The page has the three sections, and each breakpoint got its own layout.
  for (const bp of ["desktop", "tablet", "mobile"])
    await expect(frame(page, bp).locator("main > section")).toHaveCount(3);
  const cards = (bp: string) =>
    frame(page, bp).locator("main > section").nth(1).locator(":scope > div");
  await expect(cards("desktop")).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+$/);
  await expect(cards("tablet")).toHaveCSS("grid-template-columns", /^\S+ \S+$/);
  await expect(cards("mobile")).toHaveCSS("grid-template-columns", /^\S+$/);
  await expect(frame(page, "desktop").locator("h1")).toHaveCSS("font-size", "56px");
  await expect(frame(page, "tablet").locator("h1")).toHaveCSS("font-size", "44px");
  await expect(frame(page, "mobile").locator("h1")).toHaveCSS("font-size", "34px");
  await expect(page.getByTestId("sync-status")).toHaveText("Online");

  // Save the document and each frame at 100% (no selection, no hover, no guides).
  await deselect(page);
  await page.mouse.move(1, 1);
  await page.keyboard.press("Shift+Digit1");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  mkdirSync(OUT, { recursive: true });
  const doc = (await page.evaluate(() =>
    (window as unknown as { __truframeDoc: () => unknown }).__truframeDoc(),
  )) as {
    pages: { id: string }[];
  };
  writeFileSync(join(OUT, "doc.json"), JSON.stringify(doc, null, 2));
  const pageId = doc.pages[0]?.id as string;
  for (const bp of ["desktop", "tablet", "mobile"])
    await frame(page, bp).screenshot({
      path: join(OUT, `${pageId}-${bp}.png`),
      animations: "disabled",
    });
});
