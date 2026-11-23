import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Worker stubs import `cloudflare:workers`; real workerd tests arrive with
      // @cloudflare/vitest-pool-workers in P2.
      "cloudflare:workers": fileURLToPath(
        new URL("./test/cloudflare-workers-shim.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["{apps,packages,workers,scripts}/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.open-next/**", "**/dist/**"],
  },
});
