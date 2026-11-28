/**
 * P6-1: Code View shows the whole generated project for both frameworks: a file tree,
 * a read-only CodeMirror view of each file, and search across files.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const codeView = (page: Page) => page.getByTestId("code-view");
const tree = (page: Page) => page.getByRole("tree", { name: "Project files" });
const content = (page: Page) => codeView(page).locator(".cm-content");

async function openCodeView(page: Page) {
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(codeView(page)).toBeVisible();
}

test("code view: Next.js project, read-only, file tree and search", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, { name: "Code", templateId: "saas" });
  await openCodeView(page);

  // The active page's file opens first, inside its open folder.
  await expect(page.getByTestId("code-path")).toHaveText("app/page.tsx");
  await expect(content(page)).toContainText("export default function HomePage()");
  await expect(content(page)).toHaveAttribute("aria-readonly", "true");
  for (const name of ["app", "package.json", "next.config.ts", "README.md"])
    await expect(tree(page).getByRole("treeitem", { name, exact: true })).toBeVisible();

  // Typing changes nothing: the file is read-only.
  await content(page).click();
  await page.keyboard.type("hello");
  await expect(content(page)).not.toContainText("hello");

  // Other files open from the tree, with their own highlighting.
  await tree(page).getByRole("treeitem", { name: "globals.css", exact: true }).click();
  await expect(page.getByTestId("code-path")).toHaveText("app/globals.css");
  await expect(content(page)).toContainText('@import "tailwindcss"');
  await tree(page).getByRole("treeitem", { name: "package.json", exact: true }).click();
  await expect(content(page)).toContainText('"next"');

  // Keyboard: folders collapse and expand, files open with Enter.
  const app = tree(page).getByRole("treeitem", { name: "app", exact: true });
  await expect(app).toHaveAttribute("aria-expanded", "true");
  await app.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(app).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("aria-expanded", "true");

  // Search across files opens the match in its file.
  await codeView(page).getByRole("tab", { name: "Search" }).click();
  await codeView(page).getByLabel("Search all files").fill("The simplest way");
  await expect(codeView(page).getByRole("status")).toHaveText(/^1 match in 1 file$/);
  await codeView(page)
    .getByRole("button", { name: /^app\/page\.tsx line \d+:/ })
    .click();
  await expect(page.getByTestId("code-path")).toHaveText("app/page.tsx");
  await expect(codeView(page).locator(".cm-tf-revealed")).toHaveText("The simplest way");

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/code-view-nextjs.png` });
});

test("code view: Astro project", async ({ page, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openNewProject(page, context, {
    name: "Astro code",
    templateId: "saas",
    framework: "astro",
  });
  await openCodeView(page);
  await expect(page.getByTestId("code-path")).toHaveText("src/pages/index.astro");
  await expect(content(page)).toContainText('import Base from "../layouts/Base.astro"');
  for (const name of ["src", "astro.config.mjs", "package.json"])
    await expect(tree(page).getByRole("treeitem", { name, exact: true })).toBeVisible();
  await tree(page).getByRole("treeitem", { name: "layouts", exact: true }).click();
  await tree(page).getByRole("treeitem", { name: "Base.astro", exact: true }).click();
  await expect(content(page)).toContainText("<html");

  const shots = process.env.TRUFRAME_SCREENSHOTS;
  if (shots) await page.screenshot({ path: `${shots}/code-view-astro.png` });
});
