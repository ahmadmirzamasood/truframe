# Truframe Build Plan (v2)

> Agent-facing. Phases run in order; each has a goal, deliverables and **exit criteria that must pass before the next phase starts**. Tasks are in `docs/project/TASKS.md`; the prompt to start each phase is in `docs/prompts/`.

## Milestones
| Milestone | Phases | What a user can do |
|---|---|---|
| **M0 Foundations** | P0 | Nothing yet: repo, CI, Cloudflare environments |
| **M1 Projects** | P1–P3 | Sign in, create a Next.js or Astro project, the document syncs, and the compiler produces a project that builds |
| **M2 Design** | P4–P5 | Design pages visually with breakpoints, auto layout, variables, components, assets; preview on all breakpoints |
| **M3 Code + motion** | P6, P6A | Read-only Code View, live as you design; entrance and scroll-in animations |
| **M4 Agent + collaboration** | P7–P8 | Agent with Skills, MCP, comments, history |
| **M5 Ship** | P9–P10 | Temp links, Vercel/GitHub publish, image/code export, billing, hardened beta |

## Phases

### P0 Foundations
- **Goal:** a monorepo and platform every later phase builds on.
- **Deliverables:** pnpm + Turborepo + Cargo workspace per `docs/engineering/ARCHITECTURE.md §4`; Biome, Vitest, Playwright, cargo fmt/clippy/deny; Next.js app deployed to Cloudflare with OpenNext (staging + production environments); wrangler configs for D1, R2, KV, DO, Queues bindings; GitHub Actions (lint, typecheck, unit, Rust, e2e, deploy to staging on main); agent docs at the repo root.
- **Exit:** `pnpm i && pnpm build && pnpm test && cargo test` green in CI; staging URL serves the app; local dev runs with Miniflare.

### P1 Accounts, dashboard, project creation
- **Goal:** users can sign up and create a project with a framework choice.
- **Deliverables:** Drizzle schema + migrations (users/auth, workspaces, projects, usage); Better Auth with Google, GitHub, email magic link + password, Resend emails, Turnstile; personal workspace on signup; dashboard (list, create, duplicate, rename, soft delete/restore); New Project dialog (Next.js / Astro + template); `packages/billing/plans.ts` with Free/Pro limits (enforcement hooks only, no payments yet).
- **Exit:** all three sign-in methods work end to end on staging; tenant isolation test T1 (API part) green.

### P2 Document core and realtime
- **Goal:** a project document that syncs, persists and has history.
- **Deliverables:** `packages/model` schema (TS) + Rust mirror + parity test; `packages/ops` with validation and transactions; Loro integration; ProjectRoom DO (room tokens, WebSocket, apply/broadcast, persistence, R2 snapshots, revisions in D1); editor client store with IndexedDB offline cache; undo/redo per transaction.
- **Exit:** property tests (random op sequences stay valid; undo restores); two browsers stay in sync; reload restores state; T1 (socket) and T2 green.

### P3 Compiler v1
- **Goal:** document → clean, buildable Next.js and Astro projects.
- **Deliverables:** `crates/compiler` with model types, Next.js and Astro adapters, Tailwind v4 output with breakpoint variants and variables, deterministic printer, `spans` map, per-node canvas CSS; WASM bindings + JS wrapper; golden fixtures; CI job that runs `npm ci && npm run build` on generated fixture projects for both frameworks.
- **Exit:** ≥ 40 golden fixtures; both frameworks build and type-check in CI; compile one page < 30 ms (WASM, measured).

### P4 Design View I
- **Goal:** design pages visually.
- **Deliverables:** editor shell (top bar, left/right panel tabs); canvas camera; renderer using compiler CSS; breakpoint frames (Desktop 1200 fixed and resizable ≥ 1200; Tablet/Mobile add/remove/resize within ranges); insert tools (Frame, Text, Image placeholder, Link/Button, Icon); selection, multi-select, drag, resize (Fixed/Fill/Fit), snapping, measurements; auto layout Stack/Grid controls; per-breakpoint overrides with "reset to inherited"; Inspector core sections; Layers panel (Desktop/Tablet/Mobile groups); Pages panel; command registry + Cmd+K.
- **Exit:** e2e builds a 3-section landing page on all three breakpoints using only the UI; generated code matches the design (screenshot parity test between canvas and built site, ≤ 1% pixel diff).

### P5 Design View II
- **Goal:** the design system and assets features.
- **Deliverables:** Variables panel (color, text style, spacing) + binding in inspector; Components panel (create, main/instance, overrides, exposed props); Assets panel (upload to R2 via signed URL, sniffing, SVG sanitizer, Cloudflare Images variants, folders, replace, alt text, Unsplash, Iconify, Google Fonts); "Add auto layout" and "Group into stack" inference; Preview button (Desktop/Tablet/Mobile/side by side) on the usercontent origin.
- **Exit:** editing a variable updates every bound element and the generated CSS; components compile to component files with imports; T3 and T4 green.

### P6 Code View (read-only, live)
- **Goal:** see the real code update as you design.
- **Deliverables:** Code View (file tree, read-only CodeMirror 6 with TSX/Astro/CSS/JSON highlighting, search across files); live incremental compile in a Web Worker; reveal-in-design and reveal-in-code via `spans`; "Export / push to GitHub to edit" call to action; Embed node + page head/body snippets (sanitized, rendered in sandboxed iframes).
- **Exit:** design→code < 300 ms p50 on a 300-layer page; reveal works both directions in e2e; T3 green for Embeds.

### P6A Animation: entrance and scroll-in effects
- **Goal:** layers can animate in on load, when scrolled into view, or loop, with presets and stagger.
- **Deliverables:** model fields; Animation inspector section with presets; per-breakpoint disable; canvas ▶ Play and Preview playback; compiler output (`animations.css`, scroll-driven CSS with ≤ 1 KB IntersectionObserver fallback for Next.js and Astro); reduced-motion wrapping; agent `set_animation` tool schema (wired in P7).
- **Exit:** goldens for every trigger and preset in both frameworks; built fixture sites animate in Chrome, Safari and Firefox (Playwright video check); reduced-motion test shows no animation; Lighthouse ≥ 90 on an animated template.

### P7 Agent, Skills, MCP
- **Goal:** agents design and code through the same ops, within plan limits.
- **Deliverables:** `packages/agent-tools` schemas; AgentSession DO (Anthropic SDK, streaming, stop, per-turn transaction and "undo turn", budgets, credit metering, BYO key for Pro); Agent tab UI; Skills (built-in packs, picker, user skills for Pro); Browser Rendering screenshot tool; MCP Worker with OAuth + metering + rate limits; eval harness (≥ 30 tasks).
- **Exit:** eval pass rate ≥ 80%; external Claude Code completes ≥ 70% via MCP; T8 and T9 green.

### P8 Collaboration and history
- **Goal:** comment and recover.
- **Deliverables:** Comments tab (pinned threads, mentions, resolve, email notifications); History tab (revision list grouped by session, preview, restore as new revision, named versions, compare); retention by plan.
- **Exit:** restore is non-destructive and tested; comments survive node moves.

### P9 Publish and export
- **Goal:** sites leave Truframe.
- **Deliverables:** build job with Cloudflare Containers; `workers/sites` temp links (password, expiry, noindex, client comments, Approve + email); GitHub App integration (repo create/select, commit via Git Data API); Vercel integration (git-linked and direct deploy, status/logs stream, Free = 1 project with badge); image export PNG/JPEG/WebP via Browser Rendering; ZIP code export (Pro).
- **Exit:** e2e from design to live Vercel URL both with and without GitHub (nightly job on test accounts); T5, T6, T7 green.

### P10 Billing, hardening, beta
- **Goal:** a paid product 50 beta users can rely on.
- **Deliverables:** Polar checkout, portal, webhooks, plan sync, usage meters UI, 80%/100% warnings, downgrade rules, 14-day trial; full security review against `docs/engineering/SECURITY.md`; rate limits and spend alerts; onboarding and templates polish; Lighthouse ≥ 90 on templates; backups/restore runbook; status page; docs site.
- **Exit:** every `docs/engineering/SECURITY.md` checklist item and T10–T12 green; 5 real sites designed and published by testers; billing tested in sandbox end to end.

## Later
Teams/roles and live multiplayer cursors; component variants; variable modes (dark mode); CMS collections; forms; advanced animation (parallax, page transitions, timeline, Lottie/Rive, spring physics); Netlify and Cloudflare publishing; custom domains; Figma import; import existing repos (v1 idea); pull from GitHub; framework switching.

## Risks
| Risk | Mitigation |
|---|---|
| Users expect to edit code in Code View | Clear read-only state with "Export / push to GitHub to edit code"; Embeds and head/body snippets for custom code; revisit editable code after beta feedback |
| Canvas ≠ generated site | Renderer uses the compiler's CSS; screenshot parity test in CI |
| Cloudflare platform limits (Worker size, DO memory, Containers availability, Browser Rendering quotas) | Size budgets; snapshot compaction; quotas per plan; keep platform code behind adapters so hosting can change |
| Desktop-first output vs Tailwind's mobile-first defaults | Custom `tablet`/`mobile` variants declared in generated CSS; documented in generated README |
| Agent cost vs pricing | Credit sizing in `docs/product/BILLING.md`; BYO key for Pro; monitor cost per credit in beta |
| Abuse of free builds and temp links | Quotas, Turnstile, email verification, takedown switch, phishing scan |
| AGPL contamination | Clean-room rule; no Doop repo in agent context |
