/**
 * P6A-3: the inspector's Animation section. Each control writes the layer's animation in the
 * document (one undo step each); presets fill the from state; stagger is offered on frames.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Animation } from "@truframe/model";
import { openNewProject } from "./helpers";

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const panel = (page: Page) => page.getByRole("tabpanel", { name: "Inspect" });

async function fill(field: Locator, value: string) {
  await field.fill(value);
  await field.press("Enter");
}

async function selectDeep(page: Page, el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw new Error("layer not visible");
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up("Control");
}

/** Moves focus out of inspector fields so editor shortcuts apply. */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** The animation of the layer whose element matches `selector` in the desktop frame. */
async function animationOf(page: Page, selector: string): Promise<Animation | undefined> {
  const id = await frame(page, "desktop").locator(selector).first().getAttribute("data-tf-node");
  return page.evaluate((nodeId) => {
    const doc = (
      window as unknown as {
        __truframeDoc: () => { nodes: Record<string, { animation?: unknown }> };
      }
    ).__truframeDoc();
    return doc.nodes[nodeId ?? ""]?.animation as never;
  }, id);
}

test("the Animation section edits every animation setting", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Animation", templateId: "landing" });
  const p = panel(page);
  const h1 = "main section h1";
  const anim = () => animationOf(page, h1);

  await selectDeep(page, frame(page, "desktop").locator(h1));
  const section = p.getByRole("region", { name: "Animation" });
  await expect(section).toBeVisible();
  expect(await anim()).toBeUndefined();

  // Add: Slide up, in view, once.
  await section.getByRole("button", { name: "Add animation" }).click();
  await expect
    .poll(anim)
    .toMatchObject({ trigger: "inView", from: { opacity: 0, y: 24 }, once: true });
  await expect(section.getByLabel("Animation preset")).toHaveValue("slide-up");

  // Presets.
  for (const [id, from] of [
    ["fade-in", { opacity: 0 }],
    ["slide-in-left", { opacity: 0, x: -40 }],
    ["slide-in-right", { opacity: 0, x: 40 }],
    ["scale-in", { opacity: 0, scale: 0.9 }],
    ["blur-in", { opacity: 0, blur: 8 }],
    ["slide-up", { opacity: 0, y: 24 }],
  ] as const) {
    await section.getByLabel("Animation preset").selectOption(id);
    await expect.poll(async () => (await anim())?.from).toEqual(from);
  }

  // Trigger, and Once / Every time (In view only).
  await section.getByRole("radio", { name: "Every time" }).click();
  await expect.poll(async () => (await anim())?.once).toBe(false);
  await section.getByRole("radio", { name: "Once" }).click();
  await expect.poll(async () => (await anim())?.once).toBe(true);
  await section.getByRole("radio", { name: "On load" }).click();
  await expect.poll(async () => (await anim())?.trigger).toBe("load");
  await expect(section.getByRole("radio", { name: "Every time" })).toHaveCount(0);
  await section.getByRole("radio", { name: "Loop" }).click();
  await expect.poll(async () => (await anim())?.trigger).toBe("loop");
  await section.getByRole("radio", { name: "In view" }).click();
  await expect.poll(async () => (await anim())?.trigger).toBe("inView");

  // From state: every field; a value equal to the layer's own removes the key.
  await fill(section.getByLabel("From opacity"), "20");
  await fill(section.getByLabel("From move x"), "-12");
  await fill(section.getByLabel("From move y"), "0");
  await fill(section.getByLabel("From scale"), "95");
  await fill(section.getByLabel("From rotate"), "-4");
  await fill(section.getByLabel("From blur"), "2");
  await expect
    .poll(async () => (await anim())?.from)
    .toEqual({ opacity: 0.2, x: -12, scale: 0.95, rotate: -4, blur: 2 });
  await expect(section.getByLabel("Animation preset")).toHaveValue("custom");

  // Timing and easing.
  await fill(section.getByLabel("Animation duration"), "450");
  await fill(section.getByLabel("Animation delay"), "250");
  await section.getByLabel("Animation easing").selectOption("back-out");
  await expect.poll(anim).toMatchObject({ duration: 450, delay: 250, easing: "back-out" });
  // Out of range is clamped to what the model allows.
  await fill(section.getByLabel("Animation duration"), "5");
  await expect.poll(async () => (await anim())?.duration).toBe(50);

  // Per-breakpoint switches, each on its own.
  await section.getByLabel("Off on Tablet").check();
  await expect.poll(async () => (await anim())?.disabledOn).toEqual(["tablet"]);
  await section.getByLabel("Off on Mobile").check();
  await expect.poll(async () => (await anim())?.disabledOn).toEqual(["tablet", "mobile"]);
  await section.getByLabel("Off on Tablet").uncheck();
  await expect.poll(async () => (await anim())?.disabledOn).toEqual(["mobile"]);

  // Text layers can't stagger children.
  await expect(section.getByLabel("Stagger children")).toHaveCount(0);

  // One change is one undo step.
  await blur(page);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await anim())?.disabledOn).toEqual(["tablet", "mobile"]);

  // Remove.
  await selectDeep(page, frame(page, "desktop").locator(h1));
  await p
    .getByRole("region", { name: "Animation" })
    .getByRole("button", { name: "Remove animation" })
    .click();
  await expect.poll(anim).toBeUndefined();

  // Stagger children on a frame (the Features section).
  await selectDeep(page, frame(page, "desktop").locator("main section:nth-of-type(2) h2"));
  await blur(page);
  await page.keyboard.press("Escape"); // up from the heading to its section
  const gridSection = p.getByRole("region", { name: "Animation" });
  await gridSection.getByRole("button", { name: "Add animation" }).click();
  await gridSection.getByLabel("Stagger children").check();
  await fill(gridSection.getByLabel("Stagger between children"), "120");
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await p.screenshot({ path: `${shots}/animation-section.png` });
  const stagger = await page.evaluate(() => {
    const doc = (
      window as unknown as {
        __truframeDoc: () => { nodes: Record<string, { animation?: Animation }> };
      }
    ).__truframeDoc();
    return Object.values(doc.nodes)
      .map((n) => n.animation?.staggerChildren)
      .filter(Boolean);
  });
  expect(stagger).toEqual([120]);
});
