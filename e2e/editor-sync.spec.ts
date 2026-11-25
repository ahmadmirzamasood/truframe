/**
 * P2-6: two browsers editing one project stay in sync, offline edits sync on reconnect, a reload
 * restores the document, and undo only undoes your own change. Needs the realtime worker
 * (Playwright starts it alongside the web app).
 */
import { type Browser, expect, type Page, test } from "@playwright/test";
import { ownClientIp, signInWithMock, unique } from "./helpers";

async function openEditor(browser: Browser, email: string, projectId?: string) {
  const context = await browser.newContext();
  await ownClientIp(context);
  const page = await context.newPage();
  await signInWithMock(page, email);
  let id = projectId;
  if (!id) {
    const res = await context.request.post("/api/projects", {
      data: { name: "Sync test", framework: "nextjs", templateId: "landing" },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(res.status()).toBe(201);
    id = ((await res.json()) as { project: { id: string } }).project.id;
  }
  await page.goto(`/p/${id}`);
  await expect(page.getByTestId("sync-status")).toHaveText("Online");
  return { context, page, projectId: id };
}

/** Top-level layers of the page, as the Layers panel lists them for Desktop. */
const layers = (page: Page) =>
  page.getByRole("tree", { name: "Desktop layers" }).locator('[data-depth="1"]');

/** Inserts a text layer (one transaction) and types its words (a second one). */
async function addText(page: Page, words: string) {
  await page
    .getByRole("toolbar", { name: "Insert" })
    .getByRole("button", { name: "Insert Text" })
    .click();
  const content = page.getByRole("tabpanel", { name: "Inspect" }).getByLabel("Text content");
  await content.fill(words);
  await content.blur();
}

test("offline edits sync on reconnect and two browsers converge", async ({ browser }) => {
  const email = unique("sync");
  const a = await openEditor(browser, email);
  const b = await openEditor(browser, email, a.projectId);
  // The landing template's three sections.
  await expect(layers(a.page)).toHaveCount(3);
  await expect(layers(b.page)).toHaveCount(3);

  // Live: B sees A's change.
  await addText(a.page, "Typed while online");
  await expect(b.page.getByRole("treeitem", { name: "Typed while online" })).toBeVisible();

  // A goes offline and keeps editing; B edits meanwhile and doesn't see A's offline change.
  await a.context.setOffline(true);
  await expect(a.page.getByTestId("sync-status")).toContainText("Offline");
  await addText(a.page, "Typed while offline");
  await expect(a.page.getByTestId("sync-status")).toHaveText("Offline · 2 unsaved changes");
  await addText(b.page, "B kept working");
  await expect(b.page.getByRole("treeitem", { name: "Typed while offline" })).toHaveCount(0);

  // Back online: both browsers end with the same layers in the same order.
  await a.context.setOffline(false);
  await expect(a.page.getByTestId("sync-status")).toHaveText("Online");
  await expect(b.page.getByRole("treeitem", { name: "Typed while offline" })).toBeVisible();
  await expect(a.page.getByRole("treeitem", { name: "B kept working" })).toBeVisible();
  const order = await layers(a.page).allTextContents();
  await expect(layers(b.page)).toHaveText(order);
  expect(order).toHaveLength(6);

  // A reload restores the same document.
  await b.page.reload();
  await expect(b.page.getByTestId("sync-status")).toHaveText("Online");
  await expect(layers(b.page)).toHaveText(order);

  // Undo removes only A's last change, for everyone; Redo brings it back.
  await a.page.getByRole("button", { name: "Undo" }).click();
  await expect(b.page.getByRole("treeitem", { name: "Typed while offline" })).toHaveCount(0);
  await expect(b.page.getByRole("treeitem", { name: "B kept working" })).toBeVisible();
  await a.page.getByRole("button", { name: "Redo" }).click();
  await expect(b.page.getByRole("treeitem", { name: "Typed while offline" })).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test("the editor is only reachable for your own projects", async ({ browser }) => {
  const a = await openEditor(browser, unique("owner"));
  const intruder = await browser.newContext();
  await ownClientIp(intruder);
  const page = await intruder.newPage();
  await signInWithMock(page, unique("intruder"));
  const res = await page.goto(`/p/${a.projectId}`);
  expect(res?.status()).toBe(404);
  await a.context.close();
  await intruder.close();
});
