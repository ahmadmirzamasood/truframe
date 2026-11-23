# Phase 10: Billing, hardening and beta

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/BILLING.md` in full; all of `docs/engineering/SECURITY.md`; `docs/product/PRD.md` §7; `docs/project/PLAN.md` risks.

**Goal:** a paid, secure product for 50 beta users. Tasks P10-1 to P10-7.

**Specifics**
- Polar: products for Free/Pro monthly and yearly, hosted checkout, customer portal, verified and idempotent webhooks as the source of truth, 14-day trial once per account, and downgrade rules (over-limit items become read-only; nothing is deleted). Top-up packs.
- Usage meters UI with warnings at 80% and 100%.
- Audit every limit server-side (ops, jobs, agent, MCP) and fix gaps (T11).
- Security review of every control in `docs/engineering/SECURITY.md`; `security.txt`; account deletion and data export (T12).
- Templates polished to Lighthouse ≥ 90; onboarding; backups and restore drill; spend alerts; status page.

**Exit:** every `docs/engineering/SECURITY.md` item and T10–T12 green; sandbox billing e2e; 5 tester sites published. Report.
