# Phase prompts (v2)

Paste one prompt into a fresh agent session (Claude Code or similar) at the repo root to run that phase. Run them in order; a phase starts only when the previous phase's exit criteria in `docs/project/PLAN.md` pass. You can rerun a prompt in a new session: the agent resumes from `docs/project/TASKS.md` and `docs/project/MEMORY.md`.

| File | Phase |
|---|---|
| `phase-00-foundations.md` | P0 Monorepo, CI, Cloudflare environments |
| `phase-01-accounts-projects.md` | P1 Auth, dashboard, framework choice |
| `phase-02-document-realtime.md` | P2 Document model, ops, Loro, Durable Object sync, undo |
| `phase-03-compiler.md` | P3 Rust compiler: Next.js and Astro output |
| `phase-04-design-view-1.md` | P4 Canvas, breakpoints, auto layout, inspector, layers, pages |
| `phase-05-design-view-2.md` | P5 Variables, components, assets, preview |
| `phase-06-code-view.md` | P6 Read-only Code View, live as you design |
| `phase-06a-animations.md` | P6A Entrance and scroll-in animations |
| `phase-07-agent-skills-mcp.md` | P7 Agent, Skills, MCP |
| `phase-08-comments-history.md` | P8 Comments and history |
| `phase-09-publish-export.md` | P9 Temp links, GitHub, Vercel, image and code export |
| `phase-10-billing-hardening-beta.md` | P10 Billing, security review, beta |
| `task-template.md` | Run a single task from `docs/project/TASKS.md` |
