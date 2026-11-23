# Phase 4: Design View I

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F4, F6, F7, F9, F10, F15 and the editor layout; `docs/engineering/ARCHITECTURE.md` §8; `docs/product/PRD.md` §9 (Doop ideas to reimplement); `docs/product/PRD.md` F27, F28 and F29 (every listed option must be present).

**Goal:** design pages visually across Desktop, Tablet and Mobile with auto layout. Tasks P4-1 to P4-10.

**Specifics**
- Editor layout exactly as in the PRD: top bar (pages menu, Design/Code toggle, breakpoint bar, Preview, Publish); left tabs Pages, Layers, Components, Variables, Assets; right tabs Inspect, Agent, History, Comments.
- Canvas: the frames for the active page are rendered by `packages/renderer` straight from the model using the compiler's CSS. Overlays are drawn in screen space.
- Breakpoints: Desktop width can be set to 1200 or more and cannot be deleted. Tablet and Mobile can be added, removed and resized within their ranges.
- Auto layout: Stack (flex) and Grid controls. Children size as Fixed, Fill or Fit. Absolute position is opt-in. In the inspector, show override markers and a reset-to-inherited action for tablet and mobile.
- Inspector per `docs/product/PRD.md` F29: no hover state, no margin, no Block display; Align is a dropdown (9 positions); Space between / around / evenly are separate Distribute buttons, not in the dropdown.
- Gestures (drag to reorder or reparent, resize, snapping, measurements) each produce one transaction. Put the snapping and measurement math in `packages/layout` as pure functions with tests.
- Layers panel: Desktop, Tablet and Mobile groups, each with its own layer tree. Pages panel with page settings. Command registry and Cmd+K.

**Exit:** an e2e test builds a 3-section landing page on all breakpoints using only the UI; screenshot parity between canvas and built site ≤ 1%. Report with screenshots.
