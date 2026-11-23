# Cloudflare setup (staging and production)

Owner: human with access to the Truframe Cloudflare account. Agents cannot do these steps: they need account credentials.

## Environments

| Env | Wrangler | Worker names | `TRUFRAME_ENV` | Resources |
|---|---|---|---|---|
| dev | top level of each `wrangler.jsonc` | `truframe-<worker>-dev` | `local` | Simulated by Miniflare; nothing on Cloudflare |
| staging | `--env staging` | `truframe-<worker>-staging` | `staging` | `truframe-staging*` |
| production | `--env production` | `truframe-<worker>-production` | `production` | `truframe-production*` |

Workers: `web` (Next.js via OpenNext, `apps/web`), `realtime`, `agent`, `mcp`, `jobs`, `sites` (`workers/*`).

## Bindings

| Binding | Type | Resource (`<env>` = dev, staging, production) | Used by |
|---|---|---|---|
| `DB` | D1 | `truframe-<env>` | web, realtime, agent, mcp, jobs |
| `FILES` | R2 | `truframe-<env>-files` | web, realtime, agent, jobs, sites |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 | `truframe-<env>-next-cache` | web (OpenNext incremental cache) |
| `CONFIG` | KV | auto-provisioned | web, mcp, jobs, sites |
| `JOBS` | Queue producer | `truframe-<env>-jobs` | web, realtime, jobs |
| (consumer) | Queue consumer | `truframe-<env>-jobs`, DLQ `truframe-<env>-jobs-dlq` | jobs |
| `PROJECT_ROOM` | Durable Object `ProjectRoom` | defined in `truframe-realtime-<env>` | realtime, web, agent, mcp |
| `AGENT_SESSION` | Durable Object `AgentSession` | defined in `truframe-agent-<env>` | agent, web, mcp |
| `WORKER_SELF_REFERENCE` | Service | `truframe-web-<env>` | web (OpenNext) |
| `IMAGES` | Images | account Images | web (`next/image`) |
| `ASSETS` | Static assets | `.open-next/assets` | web |

`scripts/lib/wrangler-config.test.ts` fails if an env is missing a binding or points at another env's resource.

## One-time setup per environment

Run from a Linux or macOS shell, or from CI. OpenNext's build does not work on Windows without Developer Mode, because it creates symlinks.

1. `pnpm i`, then `pnpm exec wrangler login`, or export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. Create the shared resources once. Every worker in an env must point at the same D1 database and KV namespace. Don't rely on per-worker auto-provisioning for these, because each worker could create its own copy.
   ```sh
   ENV=staging   # then repeat with ENV=production
   pnpm exec wrangler d1 create truframe-$ENV
   pnpm exec wrangler kv namespace create truframe-$ENV-config
   pnpm exec wrangler r2 bucket create truframe-$ENV-files
   pnpm exec wrangler r2 bucket create truframe-$ENV-next-cache
   pnpm exec wrangler queues create truframe-$ENV-jobs
   pnpm exec wrangler queues create truframe-$ENV-jobs-dlq
   ```
3. Paste the printed D1 `database_id` into every `d1_databases` entry of that env. Paste the KV `id` into every `kv_namespaces` entry. Then commit the change.
4. Deploy in dependency order, so Durable Object classes exist before anything binds to them:
   ```sh
   pnpm deploy:staging   # realtime → agent → jobs → mcp → sites → web
   ```
5. Smoke test: `curl https://truframe-web-staging.<account-subdomain>.workers.dev/api/health` must return `{"ok":true,...}`.

## CI secrets (GitHub environments)

The GitHub environments `staging` and `production` already exist. `production` requires the owner's review and accepts deployments from `main` only. The `deploy-staging` CI job is skipped until the repository variable `CLOUDFLARE_DEPLOY_ENABLED` is `true`. Set it after adding the secrets below:

```sh
gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true
```

Add these to each environment:

- `CLOUDFLARE_API_TOKEN`: an API token with Workers Scripts, D1, R2, KV, Queues: Edit and Account Settings: Read, limited to the Truframe account.
- `CLOUDFLARE_ACCOUNT_ID`.
- Variable `STAGING_URL` (staging environment only): the deployed web URL, used by the post-deploy smoke e2e.

## Local development

`pnpm dev` runs `next dev` for `apps/web` and `wrangler dev` for each worker. Ports: web 3000, realtime 8787, agent 8788, mcp 8789, jobs 8790, sites 8791. Miniflare simulates D1, R2, KV, Queues and Durable Objects. The dev registry connects the web app's Durable Object bindings to the realtime and agent workers while they run. Local state lives in each package's `.wrangler/` folder. Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`.
