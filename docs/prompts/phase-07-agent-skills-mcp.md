# Phase 7: Agent, Skills and MCP

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F16, F17, F24; `docs/engineering/ARCHITECTURE.md` §9 in full; `docs/product/BILLING.md` §3 (credits, MCP quotas, rate limits); `docs/engineering/SECURITY.md` agent and MCP rows, T8, T9.

**Goal:** agents design and code through the same ops, metered by plan. Tasks P7-1 to P7-7.

**Specifics**
- Tool schemas in `packages/agent-tools` with compact outputs. `insert_nodes` takes a compact JSX-like tree for bulk inserts. `set_animation` adds transitions and effects (`docs/product/PRD.md` F30). Code is read-only for agents (`read_code_file`); every change is a design op. Agents get no publish, GitHub, Vercel, billing or delete-project tools.
- AgentSession DO: Anthropic TypeScript SDK with streaming. The default model is `claude-sonnet-5-5`; the deep toggle uses `claude-opus-5-5`. Each turn is one transaction with "undo turn". Support Stop, per-turn budgets, credit metering before and after each call, and BYO key for Pro (encrypted).
- Skills: built-in packs as `SKILL.md` folders, a picker in the Agent tab, and user skills for Pro (sanitized and previewed before use).
- Screenshot tool via Browser Rendering.
- MCP Worker: McpAgent + workers-oauth-provider, a consent screen (workspace, projects, read/write), and per-plan monthly quotas and per-minute rate limits from `plans.ts`. Screenshots cost extra calls. Audit-log every write.
- Eval harness: ≥ 30 tasks plus prompt-injection fixtures.

**Exit:** ≥ 80% eval pass built-in; ≥ 70% via external Claude Code; T8 and T9 green. Report with the eval table.
