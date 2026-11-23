# Phase 3: Compiler v1 (Rust)

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `PRD.md` §5 and F2, F6, F7, F11, F12; `ARCHITECTURE.md` §3 and §6 in full; `MEMORY.md` styling decisions; `PRD.md` F27 (layer code classes), F28 (accessible output) and F29 (variables, tokens.css).

**Goal:** turn a document into a clean, deterministic, buildable Next.js or Astro project. Tasks P3-1 to P3-6.

**Specifics**
- `compile(project) → { files, spans, css }` in Rust. Use a deterministic printer with Prettier-compatible style. Expose it through wasm-bindgen as `packages/compiler-wasm`, with no panics across the boundary.
- Style engine: Props become Tailwind v4 classes. Desktop values are the base classes. Tablet and mobile overrides use `tablet:` and `mobile:` custom variants declared in the generated global CSS with max-width media queries taken from the breakpoints. Use scale classes when the value is exact, arbitrary values otherwise. Bound variables reference CSS custom properties and `@theme` tokens.
- Next.js adapter (App Router, `next/image`, `next/font`, components folder) and Astro adapter (`astro:assets`, layouts, components) exactly as in `ARCHITECTURE.md §6.1`. Generated projects include a short README explaining the breakpoint variants.
- The renderer will reuse `css` (per-node canvas CSS), so emit it now.
- Golden fixtures in `fixtures/`, plus a CI job that runs `npm ci && npm run build` and the type check on generated projects for both frameworks.

**Exit:** ≥ 40 goldens; both frameworks build and type-check; compiling one page takes < 30 ms in WASM. Report with numbers.
