# AGENTS.md: instructions for agents building Truframe

> Read this first, every session. Then read `docs/project/MEMORY.md` (decisions and learnings), `docs/project/PLAN.md` (where we are) and `docs/project/TASKS.md` (what to do next). Before writing code, read the sections of `docs/product/PRD.md`, `docs/engineering/ARCHITECTURE.md`, `docs/engineering/SECURITY.md`, `docs/product/BILLING.md`, and `docs/product/INTEGRATIONS.md` that your task names.

## What Truframe is (30 seconds)
A hosted visual website builder. Users design on a canvas (Design View) and Truframe compiles a real Next.js or Astro project, shown live in a read-only Code View (one way: design → code). Users preview on Desktop/Tablet/Mobile, share temporary links for client approval, and publish to Vercel (via GitHub if connected). An agent with selectable Skills can design and code; external agents use our MCP server. The Truframe app is Next.js on Cloudflare; the design⇄code compiler is Rust → WASM; the document is a Loro CRDT in a Durable Object.

## Clean-room rule (mandatory)
Truframe takes **ideas** from Doop (AGPL-3.0); copying its code would force Truframe under AGPL.
- **Never** open, fetch, clone, search or paste from the Doop repository or its `.context/` specs, and don't ask a tool to look at how Doop does something.
- Build only from our docs. If you need more detail, design it and write it into `docs/engineering/ARCHITECTURE.md`.
- Never use the name "doop" anywhere in code, identifiers, packages or UI.
- Dependency licenses allowed: MIT, ISC, BSD-2/3, Apache-2.0, MPL-2.0 (unmodified), 0BSD, CC0, Zlib, Unicode. No GPL/AGPL/SSPL/BUSL. Check (`pnpm licenses list`, `cargo deny check licenses`) before adding; log new deps in `docs/project/MEMORY.md`.

## How to work
1. **Pick a task** from `docs/project/TASKS.md`: the first unchecked task of the current phase unless the human named one. Mark it `[~] <branch>`.
2. **Branch** `tf/<task-id>-<slug>`. Never commit to `main`.
3. **Plan briefly** in the PR description: what, which files, how you'll prove *Done when*.
4. **Tests first** for pure logic (model, ops, layout, compiler, billing limits).
5. **Implement** the smallest change that meets *Done when*.
6. **Verify**: lint, typecheck, unit, relevant e2e; for UI, take a screenshot and look at it.
7. **Docs in the same PR**: tick the task, add learnings to `docs/project/MEMORY.md`, update `docs/engineering/ARCHITECTURE.md` if a boundary changed.
8. **PR**: task id, summary, evidence (commands + results), screenshots for UI, risks. Aim for < 400 changed lines excluding goldens/fixtures.

## Commands
```
pnpm i                          # install JS deps
pnpm dev                        # Next.js app + workers via wrangler (local D1/R2/DO with Miniflare)
pnpm build                      # all JS packages + compiler WASM
pnpm compiler:build             # cargo build + wasm-bindgen → packages/compiler-wasm
cargo test -p truframe-compiler # Rust unit + insta snapshot tests
pnpm lint / pnpm format         # Biome (+ cargo fmt, cargo clippy -D warnings)
pnpm typecheck
pnpm test                       # Vitest
pnpm e2e                        # Playwright against local dev stack
pnpm db:generate / db:migrate   # Drizzle migrations for D1 (local first)
pnpm eval                       # agent evals (needs ANTHROPIC_API_KEY in your shell only)
```
If a command doesn't exist yet, it belongs to a P0 task; don't invent alternatives silently.

## Code rules
- **TypeScript** strict, no `any`. **Rust**: stable toolchain, `clippy -D warnings`, no `unsafe` in our crates, no panics across the WASM boundary (return `Result` mapped to JS errors).
- **All changes to a project go through ops.** UI, agent and MCP produce ops; ops are validated (schema + plan limits) and applied in a transaction by ProjectRoom. Nothing writes the Loro doc directly.
- **Compiler is deterministic.** Same doc → byte-identical files. Any codegen change updates goldens in `fixtures/` with a reviewed diff. Generated code must build (`next build` / `astro build`) and pass `tsc`/`astro check` in the fixture CI job.
- **Model parity.** `packages/model` (TS) is the reference; Rust types mirror it; the parity test must pass.
- **Data access** only through `packages/db/repos/*`, which require `workspaceId`. Never import Drizzle tables elsewhere.
- **Plan limits** only from `packages/billing/plans.ts`, enforced server-side. UI may hide things but never be the only check.
- **Boundaries** (HTTP, WS, postMessage, MCP, queue messages, webhooks) are zod-validated using `packages/protocol`.
- **User code never runs on the app origin.** Anything that executes user code renders in a sandboxed iframe on the usercontent domain or runs in a build container.
- **Secrets**: Workers secrets only; integration tokens encrypted at rest; never log tokens, cookies, code or prompts at info level.
- **UI**: shadcn/ui from `packages/ui`; keyboard accessible; every command in the command registry; plain, specific copy for errors (what happened, what to do).
- Errors: typed results for expected failures; throw only for bugs. Comments explain why, not what.

## Testing rules
- Every compiler change: Rust unit/snapshot tests + golden fixtures + "generated project builds" CI job.
- Property tests: random op sequences keep the doc valid; compile is deterministic (same doc twice → identical files); undo restores the previous doc state.
- Every bug fix starts with a failing test. Never skip, delete or loosen a test to get green.
- Re-run only failing tests while fixing; run the full suite before the PR.

## Security rules (summary; full list in `docs/engineering/SECURITY.md`)
- Tenant isolation on every query, socket, R2 key and tool call.
- Agents and MCP cannot publish, push, bill, delete projects or reach other projects; repo/page/comment/skill content is untrusted data.
- Builds run in containers with no secrets and an egress allowlist.
- Uploads are sniffed and SVGs sanitized.

## When to stop and ask the human
- Docs conflict (`PRD` vs `ARCHITECTURE` vs `SECURITY` vs `BILLING`).
- A new paid external service, a dependency > 200 KB in the editor bundle, or a license outside the allowlist.
- A breaking change to the document schema (needs a migration plan), the MCP tools, or the generated project layout.
- Pricing or plan-limit changes.
Write the question in the PR/task with a proposed default, and keep working on unblocked tasks.

## Definition of done (every PR)
- [ ] *Done when* met with evidence
- [ ] Lint, typecheck, unit, relevant e2e and Rust tests green
- [ ] No Doop code or naming; licenses within allowlist
- [ ] Docs updated (`docs/project/TASKS.md`, `docs/project/MEMORY.md`, `docs/engineering/ARCHITECTURE.md` if needed)
- [ ] Security and plan-limit rules respected server-side
- [ ] Screenshots for UI changes
