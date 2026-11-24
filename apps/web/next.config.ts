import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@truframe/ui", "@truframe/auth", "@truframe/db", "@truframe/emails"],
  poweredByHeader: false,
};

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings (D1, R2, KV, Queues, DO) through Miniflare.
// Local D1/R2/KV state lives at the repo root, outside the app folder: next dev watches this
// folder, and SQLite touching files under apps/web/.wrangler caused an endless recompile loop.
initOpenNextCloudflareForDev({ persist: { path: "../../.wrangler/state/v3" } });
