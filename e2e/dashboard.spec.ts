import { expect, test } from "@playwright/test";
import { openDialog, ownClientIp, signInWithMock, unique } from "./helpers";

test.beforeEach(async ({ context, page }) => {
  await ownClientIp(context);
  await signInWithMock(page, unique("dash"));
});

test("create, rename, duplicate, delete and restore a project", async ({ page }) => {
  const projects = page.getByRole("list", { name: "Projects" });
  await expect(page.getByText("No projects yet")).toBeVisible();

  // Create (Astro).
  const dialog = await openDialog(page, "New project", "New project");
  await dialog.getByLabel("Name").fill("Portfolio site");
  await dialog.getByRole("radio", { name: "Astro" }).check();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toBeHidden();
  const card = projects.getByRole("listitem", { name: "Portfolio site" });
  await expect(card).toContainText("Astro");

  // Rename.
  await card.getByRole("button", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename project" });
  await rename.getByLabel("Name").fill("Studio site");
  await rename.getByRole("button", { name: "Save" }).click();
  const renamed = projects.getByRole("listitem", { name: "Studio site" });
  await expect(renamed).toBeVisible();

  // Duplicate keeps the framework.
  await renamed.getByRole("button", { name: "Duplicate" }).click();
  const copy = projects.getByRole("listitem", { name: "Studio site copy" });
  await expect(copy).toContainText("Astro");

  // Soft delete, then restore from "Recently deleted".
  await copy.getByRole("button", { name: "Delete" }).click();
  await expect(copy).toBeHidden();
  const trash = page.getByRole("list", { name: "Recently deleted" });
  const deleted = trash.getByRole("listitem", { name: "Studio site copy" });
  await expect(deleted).toContainText("restorable for 30 more days");
  await deleted.getByRole("button", { name: "Restore" }).click();
  await expect(projects.getByRole("listitem", { name: "Studio site copy" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recently deleted" })).toBeHidden();

  // Survives a reload (persisted server-side).
  await page.reload();
  await expect(projects.getByRole("listitem")).toHaveCount(2);
});

test("shows a clear error for an invalid name", async ({ page }) => {
  const dialog = await openDialog(page, "New project", "New project");
  await dialog.getByLabel("Name").fill("   ");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the project a name.");
});
