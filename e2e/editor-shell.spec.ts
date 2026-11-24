/** P4-1: the editor shell renders the PRD layout (top bar, left and right panel tabs). */
import { expect, test } from "@playwright/test";
import { ownClientIp, signInWithMock, unique } from "./helpers";

test("editor shell shows the top bar and both panels", async ({ page, context }) => {
  await ownClientIp(context);
  await signInWithMock(page, unique("shell"));
  const res = await context.request.post("/api/projects", {
    data: { name: "Shell test", framework: "nextjs", templateId: "landing" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(201);
  const { project } = (await res.json()) as { project: { id: string } };
  await page.goto(`/p/${project.id}`);
  await expect(page.getByTestId("sync-status")).toHaveText("Online");

  // Top bar: project, pages menu, Design/Code toggle, breakpoint bar, Preview, Publish.
  const top = page.getByRole("banner");
  await expect(top.getByRole("heading", { name: "Shell test" })).toBeVisible();
  await expect(top.getByRole("button", { name: /Pages: Home/ })).toBeVisible();
  await expect(top.getByRole("button", { name: "Design" })).toHaveAttribute("aria-pressed", "true");
  await expect(top.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "false");
  const breakpoints = top.getByRole("group", { name: "Breakpoints" });
  await expect(breakpoints.getByRole("button")).toHaveText([
    /Desktop\s*1200/,
    /Tablet\s*810/,
    /Mobile\s*390/,
  ]);
  await expect(top.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(top.getByRole("button", { name: "Publish" })).toBeVisible();

  // Left tabs: Pages, Layers, Components, Variables, Assets.
  const left = page.getByRole("tablist", { name: "Left panel tabs" });
  await expect(left.getByRole("tab")).toHaveCount(5);
  for (const name of ["Pages", "Layers", "Components", "Variables", "Assets"]) {
    await expect(left.getByRole("tab", { name })).toBeVisible();
  }
  await expect(left.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");

  // Right tabs: Inspect, Agent, History, Comments.
  const right = page.getByRole("tablist", { name: "Right panel tabs" });
  await expect(right.getByRole("tab")).toHaveText(["Inspect", "Agent", "History", "Comments"]);
  await right.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("tabpanel", { name: "History" })).toBeVisible();

  // Switching breakpoint updates the inspector badge; the pages menu lists pages.
  await breakpoints.getByRole("button", { name: /Mobile/ }).click();
  await right.getByRole("tab", { name: "Inspect" }).click();
  await expect(page.getByRole("tabpanel", { name: "Inspect" })).toContainText("Mobile");
  await top.getByRole("button", { name: /Pages: Home/ }).click();
  await expect(page.getByRole("menuitemradio", { name: /Home/ })).toBeVisible();
  await page.getByRole("menuitem", { name: "Manage pages…" }).click();
  await expect(left.getByRole("tab", { name: "Pages" })).toHaveAttribute("aria-selected", "true");

  await top.getByRole("button", { name: "Code" }).click();
  await expect(page.getByRole("main", { name: "Code" })).toContainText("read-only");
});
