/**
 * Deploys every worker for one environment in dependency order: Durable Object hosts first, so
 * their classes exist before other workers bind to them, then the web app.
 * Usage: `node scripts/deploy.ts staging|production` (needs CLOUDFLARE_API_TOKEN + account ID).
 */
import { execFileSync } from "node:child_process";

const env = process.argv[2];
if (env !== "staging" && env !== "production") {
  console.error("Usage: node scripts/deploy.ts staging|production");
  process.exit(1);
}

const ORDER = ["realtime", "agent", "jobs", "mcp", "sites"];
const run = (args: string[]) =>
  execFileSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });

for (const worker of ORDER) {
  console.log(`\n▶ deploying truframe-${worker}-${env}`);
  run(["--filter", `@truframe/worker-${worker}`, "exec", "wrangler", "deploy", "--env", env]);
}
console.log(`\n▶ deploying truframe-web-${env}`);
run(["--filter", "@truframe/web", `deploy:${env}`]);
