# Phase 6: Code View (read-only, live)

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F5 and §5 (design → code rules); `docs/engineering/ARCHITECTURE.md` §6.2, §6.3, §8 (Code View, Embeds); `docs/product/BILLING.md` §2; `docs/engineering/SECURITY.md` third-party markup row, T3.

**Goal:** users see the real generated code update live as they design. Code View is read-only; nothing flows from code back to design. Tasks P6-1 to P6-5.

**Specifics**
- Code View: a file tree of the whole generated project, a read-only CodeMirror 6 editor (TSX, Astro, CSS, JSON highlighting) and search across files. Do not add editing, custom files or parse-back.
- Compile live and incrementally in a Web Worker, per page and component, debounced.
- Reveal in design (click code → select layer) and reveal in code (select layer → scroll to its code) using the compiler's `spans`.
- Read-only UX: a lock indicator, a clear "Export or push to GitHub to edit code" call to action, and copy behavior per `docs/product/BILLING.md`.
- Embed node (sanitized HTML or URL) and page head/body snippets, rendered only in sandboxed iframes on the usercontent origin.

**Exit:** design→code < 300 ms p50 on a 300-layer page; reveal works both ways in e2e; T3 green. Report with numbers.
