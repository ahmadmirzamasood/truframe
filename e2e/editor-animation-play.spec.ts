/**
 * P6A-4: ▶ Play replays the selection's animation on the canvas (in every frame, honoring the
 * per-breakpoint switches), and Preview plays animations for real: on load, In view through
 * the usercontent shell's IntersectionObserver, stagger, and nothing under reduced motion.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const canvas = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const preview = (page: Page) => page.frameLocator('iframe[title="Preview at Desktop"]');
type W = { __truframeApply: (ops: unknown[]) => unknown };

/** Running CSS animations on an element: name, play state and current opacity. */
const animState = (el: Locator) =>
  el.evaluate((e) => ({
    classes: e.className,
    names: e.getAnimations().map((a) => (a as CSSAnimation).animationName),
    playState: getComputedStyle(e).animationPlayState,
    opacity: Number(getComputedStyle(e).opacity),
  }));

async function selectDeep(page: Page, el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw new Error("layer not visible");
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up("Control");
}

test("Play on the canvas and real playback in Preview", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Play", templateId: "landing" });
  const id = (sel: string) =>
    canvas(page, "desktop").locator(sel).first().getAttribute("data-tf-node");
  const h1 = (await id("main section h1")) as string;
  const hero = (await id("main > section")) as string;
  const features = (await id("main section:nth-of-type(2)")) as string;
  const featureText = await canvas(page, "desktop")
    .locator("main section:nth-of-type(2) > *")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-tf-node") as string));
  const cta = (await id("main section:nth-of-type(3)")) as string;
  const base = { delay: 0, easing: "linear", once: true, disabledOn: [] };
  const failure = await page.evaluate(
    (ops) => (window as unknown as W).__truframeApply(ops),
    [
      {
        op: "setNodeFields",
        nodeId: h1,
        fields: {
          animation: { ...base, trigger: "load", from: { opacity: 0, y: 40 }, duration: 2000 },
        },
      },
      {
        op: "setNodeFields",
        nodeId: features,
        fields: {
          animation: {
            ...base,
            trigger: "inView",
            from: { opacity: 0 },
            duration: 400,
            staggerChildren: 300,
          },
        },
      },
      {
        op: "setNodeFields",
        nodeId: cta,
        fields: {
          animation: {
            ...base,
            trigger: "inView",
            from: { opacity: 0, scale: 0.8 },
            duration: 800,
          },
        },
      },
      // A tall hero pushes the call to action below the fold in Preview.
      {
        op: "setProp",
        nodeId: hero,
        breakpoint: "desktop",
        key: "height",
        value: { type: "fixed", value: 1600 },
      },
    ],
  );
  expect(failure).toBeNull();

  // Canvas: nothing moves while designing.
  const canvasH1 = canvas(page, "desktop").locator("main section h1");
  await expect.poll(async () => (await animState(canvasH1)).names).toEqual([]);

  // ▶ Play: the layer animates in every frame, then the classes come off again.
  await selectDeep(page, canvasH1);
  const section = page.getByRole("tabpanel", { name: "Inspect" }).getByRole("region", {
    name: "Animation",
  });
  await section.getByRole("button", { name: "Play animation" }).click();
  for (const bp of ["desktop", "tablet", "mobile"]) {
    const s = await animState(canvas(page, bp).locator("main section h1"));
    expect(s.classes).toContain("tf-anim");
    expect(s.names).toEqual(["tf-in"]);
    expect(s.opacity).toBeLessThan(1);
  }
  await expect
    .poll(async () => (await animState(canvasH1)).classes, { timeout: 5000 })
    .not.toContain("tf-anim");

  // Off on Mobile: Play leaves the mobile frame still.
  await section.getByLabel("Off on Mobile").check();
  await section.getByRole("button", { name: "Play animation" }).click();
  expect((await animState(canvasH1)).names).toEqual(["tf-in"]);
  expect((await animState(canvas(page, "mobile").locator("main section h1"))).names).toEqual([]);

  // Play from the command palette too (stagger: the Features section's children).
  await selectDeep(page, canvas(page, "desktop").locator("main section:nth-of-type(2) h2"));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("Play animation");
  await page.keyboard.press("Enter");
  const children = canvas(page, "desktop").locator("main section:nth-of-type(2) > *");
  await expect.poll(async () => (await animState(children.nth(0))).names).toEqual(["tf-in"]);
  expect((await animState(children.nth(1))).names).toEqual(["tf-in"]);
  expect(
    (await animState(canvas(page, "desktop").locator("main section:nth-of-type(2)"))).names,
  ).toEqual([]);
  expect(featureText.length).toBe(2);

  // Preview plays for real.
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const pv = preview(page);
  const pvH1 = pv.locator("h1");
  await expect(pvH1).toHaveClass(/tf-anim tf-load/);
  expect((await animState(pvH1)).names).toEqual(["tf-in"]);
  // In view, once, in view at load: the shell adds tf-in, and the stagger delays differ.
  const pvKids = pv.locator("main section:nth-of-type(2) > *");
  await expect(pvKids.nth(0)).toHaveClass(/tf-view-once/);
  const delays = await pvKids.evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).animationDelay),
  );
  expect(delays).toEqual(["0s", "0.3s"]);
  // The call to action waits below the fold, paused at its from state.
  const pvCta = pv.locator("main section:nth-of-type(3)");
  await expect(pvCta).toHaveClass(/tf-view-once/);
  await expect(pvCta).not.toHaveClass(/tf-in/);
  let s = await animState(pvCta);
  expect(s.playState).toBe("paused");
  expect(s.opacity).toBe(0);
  await pvCta.scrollIntoViewIfNeeded();
  await expect(pvCta).toHaveClass(/tf-in/);
  s = await animState(pvCta);
  expect(s.playState).toBe("running");
  await expect.poll(async () => (await animState(pvCta)).opacity, { timeout: 5000 }).toBe(1);
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/preview-animation.png` });

  // Reduced motion: no animation at all, every layer at its own style.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("dialog", { name: "Preview" }).getByLabel("Page").selectOption({ index: 0 });
  await expect.poll(async () => (await animState(pvH1)).names).toEqual([]);
  expect((await animState(pvH1)).opacity).toBe(1);
  expect((await animState(pvCta)).names).toEqual([]);
});
