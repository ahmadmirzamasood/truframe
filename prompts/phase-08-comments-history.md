# Phase 8: Comments and history

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `PRD.md` F18, F19; `ARCHITECTURE.md` §7; `BILLING.md` history retention.

**Goal:** people can discuss designs and recover any past state. Tasks P8-1 to P8-3.

**Specifics**
- Comments in D1, anchored to page, node, breakpoint and offset. They keep their anchor when nodes move and become "detached" when a node is deleted. Support threads, mentions, resolve, live updates through the DO, and email notifications through Resend.
- History: revisions grouped by session with user/agent author and summary; preview any revision; restore creates a new revision (never destructive); compare two revisions; named versions.
- Retention compaction job per plan. Named versions are never compacted within plan limits.

**Exit:** non-destructive restore test; comment anchors survive moves; retention test per plan. Report.
