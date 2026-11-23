import { defineConfig } from "vitest/config";

// Each workspace folder is its own Vitest project; worker tests move to
// @cloudflare/vitest-pool-workers when workers gain real bindings (P2).
export default defineConfig({
  test: {
    projects: ["packages/*", "workers/*", "apps/web", "scripts"],
    passWithNoTests: false,
  },
});
