import { defineConfig, devices } from "@playwright/test";

// `pnpm dev` serves the web app on 3000 (see docs/runbooks/cloudflare-setup.md).
const baseURL = process.env.TRUFRAME_E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Against a deployed URL (staging smoke) no local server is started.
  webServer: process.env.TRUFRAME_E2E_BASE_URL
    ? undefined
    : {
        // All workers too, so Durable Object and queue bindings resolve through the dev registry.
        command: "pnpm dev",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        // Show dev server logs so a worker that fails to start is diagnosable in CI.
        stdout: "pipe",
        timeout: 180_000,
      },
});
