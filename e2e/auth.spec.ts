import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

// Each test acts as its own client IP: auth routes are rate-limited per IP (local reads
// x-forwarded-for; deployed envs read cf-connecting-ip, which clients cannot set).
test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${info.workerIndex}.${info.repeatEachIndex}.${(Date.now() % 250) + 1}`,
  });
});

const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Reads the newest link the local dev email sender delivered to `to`. */
async function emailLink(request: APIRequestContext, to: string): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/dev/mail?to=${encodeURIComponent(to)}`);
        const messages = (await res.json()) as { link: string | null }[];
        link = messages.at(-1)?.link ?? null;
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return link ?? "";
}

async function expectSignedIn(page: Page, email: string) {
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("signed-in-email")).toHaveText(email);
}

/** Turnstile's test site key passes on its own; wait until the token is in place. */
async function waitForTurnstile(page: Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 20_000,
  });
}

test("email + password: sign up, verify by email, sign out, sign in", async ({ page, request }) => {
  const email = unique("pw");
  const password = "correct horse battery staple";
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Pat Example");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);

  // Unverified: password sign-in is refused with a clear message.
  await page.goto("/sign-in");
  const pwForm = page.getByRole("form", { name: "Sign in with password" });
  await pwForm.getByLabel("Email").fill(email);
  await pwForm.getByLabel("Password").fill(password);
  await pwForm.getByRole("button", { name: "Sign in" }).click();
  await expect(pwForm.getByRole("alert")).toContainText("Verify your email");

  await page.goto(await emailLink(request, email));
  await expectSignedIn(page, email);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await pwForm.getByLabel("Email").fill(email);
  await pwForm.getByLabel("Password").fill(password);
  await pwForm.getByRole("button", { name: "Sign in" }).click();
  await expectSignedIn(page, email);
});

test("magic link: request a link and sign in from it", async ({ page, request }) => {
  const email = unique("magic");
  await page.goto("/sign-in");
  const form = page.getByRole("form", { name: "Email me a sign-in link" });
  await form.getByLabel("Email").fill(email);
  await waitForTurnstile(page);
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.goto(await emailLink(request, email));
  await expectSignedIn(page, email);
});

for (const provider of ["Google", "GitHub"] as const) {
  test(`${provider} (mock OAuth): sign in through the provider redirect`, async ({ page }) => {
    const email = unique(provider.toLowerCase());
    await page.goto("/sign-in");
    await page.getByRole("button", { name: `Continue with ${provider}` }).click();
    await expect(page.getByRole("heading", { name: `Mock ${provider}` })).toBeVisible();
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
    await expectSignedIn(page, email);
  });
}

test("dashboard requires a session", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
