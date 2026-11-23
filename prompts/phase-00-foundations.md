# Phase 0: Foundations

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `ARCHITECTURE.md` §2, §3, §4; `PLAN.md` P0.

**Goal:** monorepo, toolchain, CI and Cloudflare environments. Tasks P0-1 to P0-5.

**Specifics**
- pnpm + Turborepo for JS, Cargo workspace for `crates/`. Create every package and worker from `ARCHITECTURE.md §4` as a stub with one test.
- `apps/web`: Next.js 16 + Tailwind v4 + shadcn, deployed with @opennextjs/cloudflare. Each worker in `workers/` has its own wrangler config; bindings for D1, R2, KV, Queues, Durable Objects across local (Miniflare), staging and production.
- Toolchain: Biome, Vitest, Playwright, cargo fmt/clippy/deny (license allowlist from `AGENTS.md`), `scripts/check-deps.ts` for the dependency rule.
- CI: lint, typecheck, unit, Rust, e2e, staging deploy on main.

**Exit:** all green in CI; staging URL serves the app; `pnpm dev` works locally. Report what was built and the commands you ran.
