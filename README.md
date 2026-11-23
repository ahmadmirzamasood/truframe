# Truframe

Truframe is a hosted visual website builder that writes real code. Design on a canvas and watch the code update live (design → code, Code View is read-only), choose Next.js or Astro per project, preview on Desktop/Tablet/Mobile, share temporary links for client approval, and publish to Vercel (through GitHub if connected). An agent with selectable Skills, and external agents over MCP, can design and code too.

## Quick start

Requirements: Node >= 22.18, pnpm 11 (`corepack enable`), Rust (the version in `rust-toolchain.toml` is installed automatically), and `cargo install cargo-deny --locked` for the license check.

```sh
pnpm i
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm dev            # web on http://localhost:3000 + all workers on Miniflare (D1, R2, KV, Queues, DO)
pnpm lint && pnpm typecheck && pnpm test && cargo test
pnpm e2e            # Playwright; starts `pnpm dev` if it is not running
```

`http://localhost:3000/api/health` reports whether every Cloudflare binding answers. Staging and production setup: `docs/runbooks/cloudflare-setup.md`.

## Docs for agents and humans

These root files are written for coding agents. Read `AGENTS.md` first.

| File | What it is |
|---|---|
| `AGENTS.md` (+ `CLAUDE.md`) | How to work in this repo: workflow, rules, clean-room rule, definition of done |
| `MEMORY.md` | Decisions log, open questions, glossary, gotchas |
| `PRD.md` | Product requirements F1–F29 (incl. layer code classes, accessibility, panel options), design → code rules, Doop ideas adopted |
| `ARCHITECTURE.md` | Cloudflare + Next.js stack, document model, Rust compiler, realtime, agent/MCP, publish |
| `BILLING.md` | Free vs Pro, agent credits, MCP call quotas, payments provider |
| `INTEGRATIONS.md` | v1 and next integrations and the integration interfaces |
| `SECURITY.md` | Threat model, controls, test gates T1–T12 |
| `PLAN.md` | Phases P0–P10, milestones, exit criteria, risks |
| `TASKS.md` | Task backlog, one PR per task |
| `prompts/` | One prompt per phase + single-task template |
| `docs/runbooks/` | Operational runbooks (Cloudflare environments, deploys) |
| `LICENSE` | Proprietary (owner default; see `MEMORY.md` open questions) |

Start with `prompts/phase-00-foundations.md`.
