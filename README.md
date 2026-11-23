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

## Docs

Only the files that tools expect at the repo root stay there: `README.md`, `AGENTS.md`, `CLAUDE.md` and `LICENSE`. Every other doc lives in [`docs/`](docs/README.md).

Coding agents: read `AGENTS.md` first. `CLAUDE.md` imports it.

| Folder | Contents |
|---|---|
| [`docs/product/`](docs/product) | What we build: `PRD.md`, `BILLING.md`, `INTEGRATIONS.md` |
| [`docs/engineering/`](docs/engineering) | How it's built: `ARCHITECTURE.md`, `SECURITY.md` |
| [`docs/project/`](docs/project) | Where we are: `PLAN.md`, `TASKS.md`, `MEMORY.md` |
| [`docs/prompts/`](docs/prompts) | One prompt per phase, plus a single-task template |
| [`docs/runbooks/`](docs/runbooks) | Operations: Cloudflare environments and deploys |

`LICENSE` is proprietary (owner default; see the open questions in `docs/project/MEMORY.md`).
