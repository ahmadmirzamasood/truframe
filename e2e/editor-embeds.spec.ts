/**
 * P6-5 and SECURITY T3 for embeds and snippets. Embed code runs, but only in sandboxed frames
 * on the usercontent origin (on the canvas and inside Preview): it gets an opaque origin and
 * can't read the app's cookies or storage, reach the editor's DOM or call the app. Page code
 * snippets never run in the editor at all; they compile into the generated project.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const USERCONTENT = process.env.TRUFRAME_E2E_USERCONTENT_URL ?? "http://127.0.0.1:8791";

// Runs inside the embed and writes what it could reach into its own page.
const PROBE = `<p id="probe">running</p>
<script>
  const out = ["ran", "origin:" + self.origin];
  try { out.push("cookie:" + (document.cookie || "empty")); } catch (e) { out.push("cookie:blocked"); }
  try { localStorage.setItem("x", "1"); out.push("storage:ok"); } catch (e) { out.push("storage:blocked"); }
  try { out.push("parent:" + parent.document.title); } catch (e) { out.push("parent:blocked"); }
  try { parent.__tfEmbedEscaped = true; out.push("parent-write:ok"); } catch (e) { out.push("parent-write:blocked"); }
  const show = () => { document.getElementById("probe").textContent = out.join(" "); };
  show();
  fetch("${"http://localhost:3000"}/api/health", { credentials: "include" })
    .then((r) => r.text()).then(() => out.push("fetch:ok"), () => out.push("fetch:blocked")).then(show);
</script>`;

const BLOCKED = [
  "ran",
  "origin:null",
  "storage:blocked",
  "parent:blocked",
  "parent-write:blocked",
  "fetch:blocked",
];

async function expectBoxedIn(probe: ReturnType<ReturnType<Page["frameLocator"]>["locator"]>) {
  for (const part of BLOCKED) await expect(probe).toContainText(part);
  // Cookies: an opaque origin either throws or sees none of the app's.
  await expect(probe).toContainText(/cookie:(blocked|empty)/);
}

test("embeds run boxed in on the usercontent origin; page code never runs in the editor (T3)", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Embeds", templateId: "landing" });

  // Insert an embed and give it code.
  await page
    .getByRole("toolbar", { name: "Insert" })
    .getByRole("button", { name: "Insert Embed" })
    .click();
  const inspector = page.getByRole("tabpanel", { name: "Inspect" });
  await inspector.getByLabel("Embed code").fill(PROBE);
  await inspector.getByLabel("Embed code").blur();

  // On the canvas: a sandboxed frame of the usercontent /embed shell, with no same-origin.
  const frameEl = page.locator('[data-tf-frame="desktop"] iframe[data-tf-embed]');
  await expect(frameEl).toHaveAttribute("src", new RegExp(`^${USERCONTENT}/embed\\?k=\\w+#h=`));
  const sandbox = (await frameEl.getAttribute("sandbox")) ?? "";
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  const canvasProbe = page
    .frameLocator('[data-tf-frame="desktop"] iframe[data-tf-embed]')
    .locator("#probe");
  await expectBoxedIn(canvasProbe);
  expect(await page.evaluate(() => "__tfEmbedEscaped" in window)).toBe(false);
  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/embed-canvas.png` });

  // Page code: refused when it isn't allowed markup, stored when it is, and never run here.
  await page.keyboard.press("Escape");
  const head = inspector.getByLabel("Head code");
  await head.fill("<div>nope</div>");
  await head.blur();
  await expect(inspector.getByRole("alert")).toContainText("<div> isn't allowed");
  await head.fill('<script>window.__tfSnippetRan = true; document.title = "changed";</script>');
  await head.blur();
  await expect(inspector.getByRole("alert")).toHaveCount(0);
  const title = await page.title();
  expect(await page.evaluate(() => "__tfSnippetRan" in window)).toBe(false);
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("script")].some((s) =>
        s.textContent?.includes("__tfSnippetRan"),
      ),
    ),
  ).toBe(false);

  // Preview: the embed runs boxed in inside the preview frame too; the snippet doesn't run.
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Preview at Desktop"]');
  // The embed is at the end of the page and loads lazily, like on the site.
  await preview.locator("iframe[data-tf-embed]").scrollIntoViewIfNeeded();
  await expectBoxedIn(preview.frameLocator("iframe[data-tf-embed]").locator("#probe"));
  await expect(preview.locator("script", { hasText: "__tfSnippetRan" })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/embed-preview.png` });
  await page.keyboard.press("Escape");
  expect(await page.title()).toBe(title);
  expect(await page.evaluate(() => "__tfEmbedEscaped" in window)).toBe(false);

  // The code goes into the generated project: a sandboxed srcdoc frame and next/script.
  await page.getByRole("button", { name: "Code", exact: true }).click();
  const code = page.getByTestId("code-view").locator(".cm-content");
  await expect(code).toContainText('import Script from "next/script";');
  await expect(code).toContainText("window.__tfSnippetRan = true;");
  // CodeMirror only draws visible lines; search finds the embed's sandbox further down.
  const view = page.getByTestId("code-view");
  await view.getByRole("tab", { name: "Search" }).click();
  await view
    .getByLabel("Search all files")
    .fill('sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"');
  await expect(view.getByRole("status")).toHaveText("1 match in 1 file");
});
