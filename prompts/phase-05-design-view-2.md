# Phase 5: Design View II (variables, components, assets, preview)

Read `AGENTS.md`, `MEMORY.md`, `PLAN.md` and `TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `PRD.md` F8, F11–F14; `ARCHITECTURE.md` §5, §8, §10 origins; `INTEGRATIONS.md` fonts, icons, Unsplash; `SECURITY.md` uploads and user-code rows, T3, T4; `BILLING.md` storage limits; `PRD.md` F28 and F29 (variants, variables, assets, accessibility checks).

**Goal:** the design system, assets and preview. Tasks P5-1 to P5-7.

**Specifics**
- Variables: color, text style (composite, per breakpoint) and spacing/number. They compile to CSS custom properties and `@theme`. Binding works from the inspector for color, spacing, radius, size and text. Deleting a variable warns with its usage count.
- Components: create from a selection, main and instances, the narrowest override, exposed props, detach. Each component compiles to its own file with imports.
- Assets: signed R2 uploads, magic-byte sniffing, SVG sanitizer, plan size limits, Cloudflare Images variants, folders, search, replace everywhere, alt text. Pickers for Google Fonts, Iconify and Unsplash go through Worker proxies (follow Unsplash's attribution rules).
- Inference for "Add auto layout" and "Group into stack" (direction, gap, align) as our own rules with ≥ 40 tests.
- Preview button: full screen on the usercontent origin, with Desktop, Tablet, Mobile and side-by-side modes.

**Exit:** editing a variable updates bound nodes and generated CSS; components compile in both frameworks; T3 and T4 green. Report.
