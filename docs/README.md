# Truframe docs

Agent-facing docs, written to be read by coding agents and humans alike. The agent workflow and rules are in [`AGENTS.md`](../AGENTS.md) at the repo root.

## Product: what we build
| File | What it is |
|---|---|
| [`product/PRD.md`](product/PRD.md) | Product requirements F1–F29 (incl. layer code classes, accessibility, panel options), design → code rules, ideas adopted |
| [`product/BILLING.md`](product/BILLING.md) | Free vs Pro, agent credits, MCP call quotas, payments provider |
| [`product/INTEGRATIONS.md`](product/INTEGRATIONS.md) | v1 and next integrations and the integration interfaces |

## Engineering: how it's built
| File | What it is |
|---|---|
| [`engineering/ARCHITECTURE.md`](engineering/ARCHITECTURE.md) | Cloudflare + Next.js stack, repo layout, document model, Rust compiler, realtime, agent/MCP, publish |
| [`engineering/SECURITY.md`](engineering/SECURITY.md) | Threat model, controls, test gates T1–T12 |

## Project: where we are
| File | What it is |
|---|---|
| [`project/PLAN.md`](project/PLAN.md) | Phases P0–P10, milestones, exit criteria, risks |
| [`project/TASKS.md`](project/TASKS.md) | Task backlog, one PR per task |
| [`project/MEMORY.md`](project/MEMORY.md) | Decisions log, open questions, conventions, dependencies, benchmarks |

## Prompts and runbooks
| Folder | What it is |
|---|---|
| [`prompts/`](prompts) | One prompt per phase (start with `phase-00-foundations.md`) + single-task template |
| [`runbooks/`](runbooks) | Operational runbooks: [Cloudflare setup](runbooks/cloudflare-setup.md) |

## Conventions
- Refer to docs by their repo-root path (for example `docs/engineering/ARCHITECTURE.md §4`), so a reference works from any file.
- New docs go in the matching folder. Only `README.md`, `AGENTS.md`, `CLAUDE.md` and `LICENSE` stay at the repo root, because tools look for them there.
