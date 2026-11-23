# Truframe Memory

> Agent-facing, long-lived project memory. Read at the start of every session; append in the same PR as the work that taught you something. Keep entries short, dated (YYYY-MM-DD) and factual. Fix or strike entries that become wrong.

## Current state
- **Phase:** P0 Foundations: code complete locally; P0-3 (staging deploy) and P0-4 (CI run on GitHub) blocked on owner accounts
- **Last updated:** 2026-11-24
- **Repo:** https://github.com/ahmadmirzamasood/truframe (public, default branch `main`). Work on `tf/<task-id>-<slug>` branches and open PRs. `archive/v1-local-first/` is not in this repo.

## Decisions log
| Date | Decision | Why | Alternatives |
|---|---|---|---|
| 2026-11-23 | Take **ideas only** from Doop (AGPL-3.0), never code or spec text | AGPL would force Truframe's source open | Commercial license from Doop's maintainer |
| 2026-11-23 | **Pivot to v2:** hosted visual builder that generates new Next.js or Astro projects; editing existing repos moved to Later | Owner's product direction (Framer-like design + real code + publish) | v1 local tool |
| 2026-11-23 | User picks Next.js or Astro per project before creating it | Owner requirement | — |
| 2026-11-23 | Design document (Loro CRDT) is the only source of truth; code is compiled from it | Freeform visual design needs a model the code can't drive | Code as source of truth |
| 2026-11-23 | **One-way sync: design → code only.** Code View is read-only; no parse-back, no custom files, no Code Components in v1 | Owner decision; removes the hardest, riskiest part | Two-way sync with parse-back (dropped) |
| 2026-11-23 | Truframe app on Next.js 16, hosted on Cloudflare (OpenNext): D1, R2, KV, DO, Queues, Containers, Browser Rendering | Owner's choice; one platform | Vercel + Neon + S3 |
| 2026-11-23 | Rust for the compiler (`crates/compiler`, oxc, WASM) + Loro CRDT | One fast deterministic implementation everywhere | TypeScript compiler |
| 2026-11-23 | Auth: Better Auth (Google, GitHub, email magic link + password); email via Resend | Runs on Workers, MIT, owns user table | Clerk, Auth.js |
| 2026-11-23 | Payments: Polar (merchant of record) recommended | Handles tax; works beyond Stripe countries | Paddle, Lemon Squeezy, Stripe |
| 2026-11-23 | Agent: Anthropic TS SDK loop in a Durable Object; default `claude-sonnet-5-5`, deep `claude-opus-5-5` | Claude Agent SDK needs Node, not workerd | Cloudflare Agents SDK + AI SDK |
| 2026-11-23 | Breakpoints: Desktop 1200 (fixed, width ≥ 1200 editable), Tablet (810 default, removable), Mobile (390 default, removable); desktop-first cascade | Owner requirement | — |
| 2026-11-23 | Generated styling: Tailwind v4 with `tablet`/`mobile` custom variants (max-width media queries) and variables as CSS custom properties + `@theme` | Desktop-first cascade with clean classes | Mobile-first Tailwind defaults (doesn't match desktop-first design) |
| 2026-11-23 | **Free users can publish 1 project to Vercel** (direct deploy, badge); GitHub push and ZIP export are Pro | Owner chose on decision card | All code delivery Pro |
| 2026-11-23 | Hosting targets: Vercel first; Netlify/Cloudflare later behind `PublishTarget` interface | Owner requirement | — |
| 2026-11-23 | Inspector and panel options listed in `PRD.md` F29 are required; exact visual design is open | Owner shared reference mockups (options, not final visuals) | — |
| 2026-11-23 | Every layer has a code class shown next to its name and emitted as the element's first class (`PRD.md` F27); accessibility built in (F28) | Owner request: identify layers in code | data attributes |
| 2026-11-23 | Component variants, per-breakpoint variable values, accessibility checks moved into v1 | Shown in owner mockups | Later |
| 2026-11-24 | Animation: entrance/scroll-in effects in new phase P6A (hover transitions dropped with hover state), advanced motion Later; CSS-first output, no animation library by default | Owner agreed; keeps sites light and both frameworks identical | Motion/GSAP runtime |
| 2026-11-24 | TypeScript pinned to **5.9.3**, not 7.x | TS 7 (native) is new; Next 16 and tooling are proven on 5.9. Revisit in a later phase | TS 7.0 |
| 2026-11-24 | Rust pinned to **1.99.1** stable via `rust-toolchain.toml` (rustfmt, clippy) | AGENTS.md requires stable; the local default is nightly | `stable` channel (floats) |
| 2026-11-24 | Internal TS packages are source-only (`exports: ./src/index.ts`), no build step; only `apps/web` and `workers/*` build | Less tooling, Next/wrangler bundle TS directly | tsc/tsup per package |
| 2026-11-24 | License exceptions **approved** by the owner: `@img/sharp-*` (LGPL-3.0 libvips binary, dev/build only), `caniuse-lite` (CC-BY-4.0 data), BlueOak-1.0.0 packages (`glob`, `graceful-fs`, `lru-cache`, `minimatch`, `minipass`, `path-scurry`). These are recorded by name in `licenses.exceptions.json`. New packages under these licenses still need asking | Transitive deps of next, OpenNext and wrangler; permissive or dev-only | Widening the allowlist itself |
| 2026-11-24 | GitHub repo `ahmadmirzamasood/truframe` is **public**, with a proprietary `LICENSE` (source-visible, all rights reserved) | Owner decision | Private repo |
| 2026-11-24 | CI `deploy-staging` is gated on repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` | Cloudflare is not connected yet, and main must stay green | Failing deploy job |
| 2026-11-24 | Dependabot ignores major bumps of `typescript`, `vitest`/`@vitest/*` and `@types/node` (`.github/dependabot.yml`) | Those versions are pinned on purpose (TS 5.9, Vitest 4 for vitest-pool-workers, Node 22) | Closing each bump PR by hand |
| 2026-11-24 | Inspector simplified: no At rest/Hover state, no margin, no Block display, Align is a dropdown (not a 3×3 matrix) and Space between/around/evenly are separate Distribute buttons; keep blend modes, image features, guides, export | Owner decision | Mockup version |

## Open questions (owner; defaults in place)
- Pricing numbers and limits in `BILLING.md` (proposal).
- Truframe's own license (default: proprietary). `LICENSE` (all rights reserved, holder "Truframe") and `"license": "UNLICENSED"` were committed in P0-5; the owner should confirm the legal entity name.
- Cloudflare: the account exists but is not connected yet (owner, 2026-11-24). Work stays local until then. P0-3's staging deploy and the CI `deploy-staging` job wait on it (see `docs/runbooks/cloudflare-setup.md`).
- Domain names: `truframe.com` (app) and a separate domain for user content (`truframe.site` assumed). Must be a different registrable domain.
- Payments provider final choice depends on where the company is registered.

## Glossary
- **Design document / doc:** the Loro CRDT holding a project's pages, nodes, components, variables, assets and code files.
- **Op / transaction:** a validated change to the doc; a transaction = one gesture or one agent turn = one undo step.
- **Generated files:** everything in Code View; produced by the compiler, read-only.
- **Embed:** a node holding sanitized third-party HTML or a URL (maps, videos, widgets); the only way to add custom markup.
- **Temp link:** hosted preview at `*.truframe.site` for client approval.
- **Credit:** unit of built-in agent usage (`BILLING.md §3`). **MCP call:** one external tool call.

## Gotchas
- Next.js `output: 'export'` can't use server features; temp links for Next.js projects are static in v1.
- Workers bundle size limits: keep compiler WASM < 2.5 MB gz.
- Loro and the Rust model types must stay in parity with `packages/model`; CI parity test is mandatory.

## Conventions learned
- 2026-11-24: `.gitattributes` forces LF everywhere (Windows dev machines have `core.autocrlf=true`; goldens must be byte-identical).
- 2026-11-24: pnpm 11 enforces `minimumReleaseAge` (~1 day). Pin versions at least a day old instead of adding `minimumReleaseAgeExclude` entries. Install scripts are allowed only via `allowBuilds` in `pnpm-workspace.yaml` (esbuild, workerd).
- 2026-11-24: `worker-configuration.d.ts` is generated by `wrangler types` in each worker's `typecheck` script and gitignored (16k lines each). Package scripts run under cmd.exe on Windows: no `/dev/null` redirects.
- 2026-11-24: Repo scripts are plain `.ts` run with Node's built-in type stripping (`node scripts/x.ts`, Node ≥ 22.18): erasable syntax only, import with `.ts` extensions (`allowImportingTsExtensions` is in the base tsconfig).
- 2026-11-24: Run `pnpm check:licenses` after **every** dependency change; it is not part of `pnpm lint`. In P0-3, next brought in BlueOak/CC-BY packages that went unnoticed until the final clean-install run.
- 2026-11-24: `pnpm lint` = Biome CI + `scripts/check-deps.ts` (dependency rule) + `cargo fmt --check` + `cargo clippy -D warnings`. `pnpm check:licenses` = npm allowlist (`scripts/check-licenses.ts`, exceptions in `licenses.exceptions.json`) + `cargo deny check licenses bans sources`. Biome ignores Markdown (it would reflow the docs).
- 2026-11-24: One root `vitest.config.ts` (single project) includes `{apps,packages,workers,scripts}/**/*.test.ts(x)`. Worker tests run in Node with `cloudflare:workers` aliased to `test/cloudflare-workers-shim.ts`; switch to `@cloudflare/vitest-pool-workers` in P2. That pool needs **Vitest 4** (peer `^4.1.0`), which is why Vitest is pinned to 4.1.12, not 5.
- 2026-11-24: A worker's main module may export **only** entrypoints (default handler, DO classes, `WorkerEntrypoint`s). Exporting a plain constant makes workerd fail at startup ("Incorrect type for map entry"). Unit tests don't catch this; `pnpm dev` does.
- 2026-11-24: `@opennextjs/cloudflare build` fails on Windows with `EPERM symlink` (needs Developer Mode). Build/deploy the web worker on Linux (CI) or in Docker (`node:22-bookworm`). `next build` and `next dev` work on Windows.
- 2026-11-24: shadcn CLI in `packages/ui` resolves aliases via the package's tsconfig `paths` (`@truframe/ui/*` → `./src/*`) and needs a `hooks` export. It once rewrote an import to `from "cn"` and **installed an unrelated npm package `cn`**: review every `shadcn add` diff and package.json change.
- 2026-11-24: Wrangler bindings are not inherited by `env.*`; `scripts/lib/wrangler-config.test.ts` checks each env repeats them and points only at its own `truframe-<env>*` resources. Local dev ports: web 3000, realtime 8787, agent 8788, mcp 8789, jobs 8790, sites 8791.
- 2026-11-24: First GitHub CI run caught three Linux-only problems that local Windows runs missed. (1) Concurrent `wrangler dev` processes fail with `Address already in use (socket "direct:1:default")` unless each worker has a fixed `dev.inspector_port` (9230 to 9234). (2) `next build` type-checks against the gitignored `cloudflare-env.d.ts`, so the web `build` script runs `wrangler types` first. (3) On Linux, sharp's libvips is a separate `@img/sharp-libvips-<platform>` package licensed plain `LGPL-3.0-or-later`. Reproduce CI locally in `node:22-bookworm` via Docker before pushing infra changes.
- 2026-11-24: CI (`.github/workflows/ci.yml`): jobs lint, typecheck, unit, rust, build (incl. OpenNext + `wrangler deploy --dry-run --env staging`), e2e (Playwright starts `pnpm dev` and waits for `/api/health` = 200, i.e. all bindings up), deploy-staging (push to main, GitHub environment `staging`, then smoke e2e against `vars.STAGING_URL`). Actions are pinned to commit SHAs; Dependabot updates them weekly. Check workflow edits with `docker run --rm -v <repo>/.github:/w rhysd/actionlint -no-color /w/workflows/ci.yml`.

## Dependencies added (name, license, why)
- turbo 2.11.13 (MIT): task runner. typescript 5.9.3 (Apache-2.0). wrangler 4.166.0 (MIT OR Apache-2.0): Workers dev/deploy. [P0-1]
- @biomejs/biome 2.6.8 (MIT OR Apache-2.0), vitest 5.1.1 (MIT), @playwright/test 1.65.1 (Apache-2.0), @types/node 22.20.5 (MIT). cargo-deny (MIT OR Apache-2.0) is a dev tool installed with `cargo install cargo-deny --locked`. [P0-2]
- next 16.4.6 (MIT), react/react-dom 19.3.1 (MIT), @opennextjs/cloudflare 1.20.18 (MIT), tailwindcss + @tailwindcss/postcss 4.3.5 (MIT), @types/react(-dom) 19.3.0 (MIT); in `packages/ui`: radix-ui 1.8.1 (MIT), class-variance-authority 0.7.1 (Apache-2.0), clsx 2.1.1 (MIT), tailwind-merge 3.7.1 (MIT), lucide-react 1.77.0 (ISC), tw-animate-css 1.4.0 (MIT). Vitest moved 5.1.1 → 4.1.12 (MIT). [P0-3]
- **License exception pending owner approval:** `@img/sharp-*` (Apache-2.0 AND LGPL-3.0-or-later), the libvips binary pulled in by wrangler/miniflare and next. Dev/build tooling only, never bundled. Recorded in `licenses.exceptions.json`. [P0-2]

## Benchmarks
- 2026-11-24: `truframe-web` OpenNext bundle (P0 skeleton: home page + `/api/health`), `wrangler deploy --dry-run --env staging` in `node:22-bookworm`: **4,546 KiB raw / 959 KiB gzip** (Workers limit 3 MiB free / 10 MiB paid, compressed).
