# Phase 1: Accounts, dashboard and project creation

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F1–F3; `docs/engineering/ARCHITECTURE.md` §2 (auth, email, DB), §11; `docs/engineering/SECURITY.md` tenant isolation, auth, abuse rows, T1; `docs/product/BILLING.md` §2 limits.

**Goal:** users sign up with Google, GitHub or email, and create a Next.js or Astro project. Tasks P1-1 to P1-7.

**Specifics**
- Drizzle schema for D1 with a repos layer that requires `workspaceId`; a lint rule that forbids importing tables elsewhere.
- Better Auth: Google, GitHub and email (magic link + password). Require email verification, link accounts by verified email only, use Resend + React Email templates, put Turnstile on signup, and rate-limit auth routes.
- Create a personal workspace on signup. Dashboard: list, create, duplicate, rename, soft delete with 30-day restore.
- New Project dialog: pick Next.js or Astro, then a template. Templates are document JSON fixtures; for now they can be minimal.
- Put plan limits in `packages/billing/plans.ts` as one config and enforce them server-side (start with the project count).

**Exit:** all three sign-in methods work on staging; T1 (API) green. Report.
