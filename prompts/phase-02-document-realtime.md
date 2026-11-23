# Phase 2: Document core and realtime

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `PRD.md` §3 principles, F6, F7, F19; `ARCHITECTURE.md` §5 and §7 in full; `SECURITY.md` T1, T2.

**Goal:** a project document that is validated, synced, persisted, undoable and versioned. Tasks P2-1 to P2-6.

**Specifics**
- `packages/model` is the reference schema (zod). Breakpoints: Desktop 1200 by default, width ≥ 1200, cannot be deleted; Tablet (default 810, range 600–1199) and Mobile (default 390, range 320–599) can be removed. Styles are desktop-first: tablet and mobile store only overrides.
- Mirror the model in Rust inside `crates/compiler`, with a JSON parity test in CI.
- `packages/ops`: every change is an op, validated against the schema and plan limits; a transaction = one undo step; ops have inverses.
- Store the document in Loro. ProjectRoom DO: HMAC room tokens (5 min), the WebSocket hibernation API, apply and broadcast, SQLite persistence, R2 snapshot compaction, and revision rows in D1.
- Client: Loro replica, IndexedDB offline cache, reconnect sync, per-user undo/redo.

**Exit:** property tests over 1,000 runs; two clients converge; offline edits sync; T1 (socket) and T2 green. Report.
