import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// `pnpm dev` serves the web app on 3000 (see docs/runbooks/cloudflare-setup.md).
const baseURL = process.env.TRUFRAME_E2E_BASE_URL ?? "http://localhost:3000";
// The realtime worker (8787). Override when that port is taken locally; the web app's
// TRUFRAME_REALTIME_URL must point at the same place.
const realtimeURL = process.env.TRUFRAME_E2E_REALTIME_URL ?? "http://127.0.0.1:8787";
// The sites worker (8791): the usercontent origin Preview frames. The web app's
// TRUFRAME_USERCONTENT_URL must point at the same place.
const usercontentURL = process.env.TRUFRAME_E2E_USERCONTENT_URL ?? "http://127.0.0.1:8791";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // next dev compiles each route on first request; allow for that on cold runs.
  expect: { timeout: 20_000 },
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Against a deployed URL (staging smoke) no local server is started.
  webServer: process.env.TRUFRAME_E2E_BASE_URL
    ? undefined
    : [
        {
          // The web app. Its other Durable Object and queue bindings are declared but not
          // needed (the health check runs without those workers), and with every worker's
          // `wrangler dev` running, next dev on Windows keeps full-reloading pages
          // (see docs/project/MEMORY.md).
          command: "pnpm --filter @truframe/web dev",
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          // Show dev server logs so a worker that fails to start is diagnosable in CI.
          stdout: "pipe",
          timeout: 180_000,
        },
        {
          // The realtime worker (ProjectRoom) for editor sync tests. It gets its own dev registry:
          // the web app never calls the DO itself (browsers connect to the worker), and on
          // Windows a shared registry made next dev full-reload much more often.
          command: "pnpm --filter @truframe/worker-realtime dev",
          env: { WRANGLER_REGISTRY_PATH: join(tmpdir(), "truframe-e2e-wrangler-registry") },
          url: `${realtimeURL}/health`,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          timeout: 180_000,
        },
        {
          // The usercontent origin for Preview (P5-7): a static shell, no bindings needed.
          command: "pnpm --filter @truframe/worker-sites dev",
          env: { WRANGLER_REGISTRY_PATH: join(tmpdir(), "truframe-e2e-wrangler-registry-sites") },
          url: `${usercontentURL}/health`,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          timeout: 180_000,
        },
      ],
});
