/**
 * P4-9: the Pages panel adds, renames, nests in folders, duplicates, reorders, sets the home
 * page, edits page settings and deletes; the pages menu and paths follow.
 */
import { expect, type Page, test } from "@playwright/test";
import { openNewProject } from "./helpers";

const tree = (page: Page) => page.getByRole("tree", { name: "Pages" });
const row = (page: Page, name: string) => tree(page).getByRole("treeitem", { name, exact: true });

async function addPage(page: Page, name: string, button = "Add page") {
  await page.getByTestId("pages-panel").getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog
    .getByRole("button", { name: button === "Add page" ? "Add page" : "Create folder" })
    .click();
  await expect(dialog).toBeHidden();
}

async function action(page: Page, pageName: string, item: string) {
  const r = row(page, pageName);
  await r.hover();
  await r.getByRole("button", { name: `${pageName} actions` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("pages panel manages pages, folders, home page and settings", async ({ page, context }) => {
  await openNewProject(page, context, { name: "Pages", templateId: "blank" });
  await page
    .getByRole("tablist", { name: "Left panel tabs" })
    .getByRole("tab", { name: "Pages" })
    .click();
  await expect(row(page, "Home")).toContainText("/");

  // Add a page: its path comes from its name, and it opens.
  await addPage(page, "About us");
  await expect(row(page, "About us")).toContainText("/about-us");
  await expect(
    page.getByRole("banner").getByRole("button", { name: /Pages: About us/ }),
  ).toBeVisible();

  // A folder starts with one page and becomes a nested route.
  await addPage(page, "Blog", "New folder");
  await expect(tree(page).getByRole("treeitem", { name: "Folder blog" })).toBeVisible();
  await expect(row(page, "New page")).toContainText("/blog/new-page");

  // Rename (double-click) and page settings (slug, SEO, noindex).
  await row(page, "New page").getByRole("button").first().dblclick();
  await page.getByLabel("Rename New page").fill("First post");
  await page.getByLabel("Rename New page").press("Enter");
  await action(page, "First post", "Page settings…");
  const settings = page.getByRole("dialog", { name: "Page settings" });
  await settings.getByLabel("Slug").fill("Hello World");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByRole("alert")).toContainText("lowercase letters");
  await settings.getByLabel("Slug").fill("hello-world");
  await settings.getByLabel("SEO title").fill("Hello, world");
  await settings.getByLabel("Hide from search engines (noindex)").check();
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings).toBeHidden();
  await expect(row(page, "First post")).toContainText("/blog/hello-world");

  // Duplicate, then delete the copy.
  await action(page, "About us", "Duplicate");
  await expect(row(page, "About us copy")).toContainText("/about-us-copy");
  await action(page, "About us copy", "Delete page");
  await expect(row(page, "About us copy")).toHaveCount(0);

  // The home page can't be deleted; set another page as home instead.
  await action(page, "Home", "Delete page");
  await expect(page.getByTestId("pages-panel").getByRole("alert")).toContainText(
    "home page can't be deleted",
  );
  await action(page, "About us", "Set as home page");
  await expect(row(page, "About us")).toContainText("/");
  await expect(row(page, "Home")).toContainText("/home");

  // Drag to reorder: About us moves above Home.
  await row(page, "About us").dragTo(row(page, "Home"), { targetPosition: { x: 40, y: 2 } });
  await expect(tree(page).getByRole("treeitem").first()).toHaveAccessibleName("About us");

  // The pages menu lists the same pages and paths.
  await page
    .getByRole("banner")
    .getByRole("button", { name: /Pages:/ })
    .click();
  await expect(page.getByRole("menuitemradio")).toHaveText([
    /About us\s*\//,
    /Home\s*\/home/,
    /First post\s*\/blog\/hello-world/,
  ]);
});
