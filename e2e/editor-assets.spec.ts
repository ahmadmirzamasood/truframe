/**
 * P5-4: the Assets panel uploads (drop zone / picker), shows thumbnails and the storage meter,
 * inserts images onto the canvas (loaded from the authorized file URL), renames, sets alt
 * text, files into folders, searches, replaces everywhere and deletes with its usage count.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

/** A w×h PNG with no pixel data beyond the header and one IDAT (valid enough for browsers). */
const PNG_RED = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000020000000208020000" +
    "00fdd49a730000001649444154789c63f8cfc0f01f0c18183030000003" +
    "f706010d7b0ca20000000049454e44ae426082",
  "hex",
);
const SVG_BLUE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#2563eb"/></svg>';

const frame = (page: Page, bp: string) => page.locator(`[data-frame="${bp}"]`);
const doc = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __truframeDoc: () => {
          assets: Record<string, { name: string; folder?: string; alt?: string }>;
        };
      }
    ).__truframeDoc(),
  );

test("assets panel: upload, insert, edit, replace and delete", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Assets", templateId: "blank" });
  await page.getByRole("tab", { name: "Assets" }).click();
  const panel = page.getByTestId("assets-panel");
  await expect(panel).toContainText("PNG, JPEG, WebP, GIF, SVG");

  await panel.getByLabel("Choose images to upload").setInputFiles([
    { name: "red.png", mimeType: "image/png", buffer: PNG_RED },
    { name: "blue.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG_BLUE) },
  ]);
  const grid = panel.getByRole("list", { name: "Assets" });
  await expect(grid.getByRole("listitem")).toHaveCount(2);
  await expect(grid.getByRole("listitem", { name: "blue.svg" })).toContainText("40 × 20");
  await expect(panel.getByTestId("storage-meter")).toContainText("2 of 100 files");
  // Thumbnails load through the authorized file URL.
  await expect
    .poll(() =>
      grid
        .getByRole("listitem", { name: "blue.svg" })
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  // A file that isn't an image is refused with a plain message.
  await panel.getByLabel("Choose images to upload").setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("<html>not an image</html>"),
  });
  await expect(panel.getByRole("alert")).toContainText(
    "Upload a PNG, JPEG, WebP, GIF or SVG image.",
  );

  // Insert: an image layer on the canvas showing the file.
  await grid.getByRole("button", { name: "Insert blue.svg" }).click();
  const img = frame(page, "desktop").locator("img");
  await expect(img).toHaveCount(1);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("tabpanel", { name: "Inspect" }).getByTestId("inspector-name"),
  ).toHaveText("blue");

  // Rename, alt text, folder; search.
  const actions = (name: string) => grid.getByRole("button", { name: `Actions for ${name}` });
  await actions("red.png").click();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await page.getByRole("dialog", { name: "Rename asset" }).getByLabel("Name").fill("Red dot");
  await page.getByRole("button", { name: "Save" }).click();
  await actions("Red dot").click();
  await page.getByRole("menuitem", { name: "Alt text…" }).click();
  await page.getByRole("dialog", { name: "Alt text" }).getByLabel("Alt text").fill("A red dot");
  await page.getByRole("button", { name: "Save" }).click();
  await actions("Red dot").click();
  await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  await page.getByRole("dialog", { name: "Move to folder" }).getByLabel("Folder").fill("Icons");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("radio", { name: "Icons" })).toBeVisible();
  await panel.getByRole("radio", { name: "Icons" }).click();
  await expect(grid.getByRole("listitem")).toHaveCount(1);
  await panel.getByRole("radio", { name: "All" }).click();
  await panel.getByLabel("Search assets").fill("red dot");
  await expect(grid.getByRole("listitem")).toHaveCount(1);
  await panel.getByLabel("Search assets").fill("");
  const after = await doc(page);
  expect(Object.values(after.assets).find((a) => a.name === "Red dot")).toMatchObject({
    folder: "Icons",
    alt: "A red dot",
  });

  // Replace everywhere: the layer now shows the new file; the old entry is gone.
  await actions("blue.svg").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Replace everywhere…" }).click();
  await (await chooser).setFiles({
    name: "green.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(SVG_BLUE.replace("#2563eb", "#16a34a")),
  });
  await expect(grid.getByRole("listitem", { name: "green.svg" })).toBeVisible();
  await expect(grid.getByRole("listitem", { name: "blue.svg" })).toHaveCount(0);
  await expect(grid.getByRole("listitem", { name: "green.svg" })).toContainText("1 use");
  await expect(img).toHaveAttribute("src", /\.svg/);

  // Delete warns with the usage count; the layer becomes a placeholder; undo restores it.
  await actions("green.svg").click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete green.svg?" });
  await expect(confirm).toContainText("used in 1 place");
  await confirm.getByRole("button", { name: "Delete asset" }).click();
  await expect(frame(page, "desktop").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frame(page, "desktop").locator("img")).toHaveCount(1);

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/assets.png` });
});
