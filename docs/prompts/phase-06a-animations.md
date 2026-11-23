# Phase 6A: Animation (entrance and scroll-in effects)

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F28 (reduced motion) and F30; `docs/engineering/ARCHITECTURE.md` §5 (animation fields) and §6.1 (animation output); `docs/project/PLAN.md` P6A.

**Goal:** layers animate on load, when scrolled into view, or in a loop, with presets and stagger, using CSS-first output. Tasks P6A-1 to P6A-5.

**Specifics**
- Model and ops for `animation` (trigger, from state, duration, delay, easing, once, stagger children, disabled on tablet/mobile), validated like every other op.
- Compiler: a generated `animations.css` with named keyframes and classes driven by CSS custom properties. Implement "In view" with `animation-timeline: view()` behind `@supports`, plus an IntersectionObserver fallback of ≤ 1 KB (a client component in Next.js, an inline script in the Astro layout). Wrap everything in `prefers-reduced-motion: no-preference`. Animate only transform, opacity and filter. Do not add an animation library.
- Inspector Animation section with presets (Fade in, Slide up, Slide in left/right, Scale in, Blur in) and a per-breakpoint disable.
- Canvas ▶ Play replays the selection by toggling its class; Preview plays all animations for real.
- Add the `set_animation` agent tool schema in `packages/agent-tools`; it gets wired in P7.

**Exit:** goldens for every trigger and preset in both frameworks; Playwright checks on Chrome, Safari and Firefox; reduced-motion test passes; Lighthouse ≥ 90 on an animated template. Report.
