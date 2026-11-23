# Truframe: agent docs (v2)

Truframe is a hosted visual website builder that writes real code. Design on a canvas and watch the code update live (design → code, Code View is read-only), choose Next.js or Astro per project, preview on Desktop/Tablet/Mobile, share temporary links for client approval, and publish to Vercel (through GitHub if connected). An agent with selectable Skills, and external agents over MCP, can design and code too.

These files go at the root of the Truframe repo and are written for coding agents.

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
| `archive/v1-local-first/` | Earlier plan (local tool for existing repos), kept for reference |

Start with `prompts/phase-00-foundations.md`.
