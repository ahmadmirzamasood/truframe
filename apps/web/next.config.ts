import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@truframe/ui",
    "@truframe/auth",
    "@truframe/db",
    "@truframe/emails",
    "@truframe/protocol",
    "@truframe/model",
    "@truframe/billing",
    "@truframe/ops",
    "@truframe/crdt",
    "@truframe/sync",
    "@truframe/editor",
    "@truframe/codeview",
    "@truframe/renderer",
    "@truframe/layout",
    "@truframe/compiler-wasm",
    "@truframe/integrations",
  ],
  poweredByHeader: false,
};

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings (D1, R2, KV, Queues, DO) through Miniflare.
initOpenNextCloudflareForDev();
