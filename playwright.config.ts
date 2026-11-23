import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TRUFRAME_E2E_PORT ?? 3000);
const baseURL = process.env.TRUFRAME_E2E_BASE_URL ?? `http://localhost:${port}`;

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
        command: `pnpm --filter @truframe/web dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
