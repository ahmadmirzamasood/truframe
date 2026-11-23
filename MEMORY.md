# Truframe Memory

> Agent-facing, long-lived project memory. Read at the start of every session; append in the same PR as the work that taught you something. Keep entries short, dated (YYYY-MM-DD) and factual. Fix or strike entries that become wrong.

## Current state
- **Phase:** P0 Foundations (not started)
- **Last updated:** 2026-11-23
- **Repo:** not created yet. Docs drafted in the project's shared files (`truframe/`). v1 docs (local tool for existing repos) archived in `archive/v1-local-first/`.

## Decisions log
| Date | Decision | Why | Alternatives |
|---|---|---|---|
| 2026-11-23 | Take **ideas only** from Doop (AGPL-3.0), never code or spec text | AGPL would force Truframe's source open | Commercial license from Doop's maintainer |
| 2026-11-23 | **Pivot to v2:** hosted visual builder that generates new Next.js or Astro projects; editing existing repos moved to Later | Owner's product direction (Framer-like design + real code + publish) | v1 local tool |
| 2026-11-23 | User picks Next.js or Astro per project before creating it | Owner requirement | — |
| 2026-11-23 | Design document (Loro CRDT) is the only source of truth; code is compiled from it | Freeform visual design needs a model the code can't drive | Code as source of truth |
| 2026-11-23 | **One-way sync: design → code only.** Code View is read-only; no parse-back, no custom files, no Code Components in v1 | Owner decision; removes the hardest, riskiest part | Two-way sync with parse-back (dropped) |
| 2026-11-23 | Truframe app on Next.js 16, hosted on Cloudflare (OpenNext): D1, R2, KV, DO, Queues, Containers, Browser Rendering | Owner's choice; one platform | Vercel + Neon + S3 |
| 2026-11-23 | Rust for the compiler (`crates/compiler`, oxc, WASM) + Loro CRDT | One fast deterministic implementation everywhere | TypeScript compiler |
| 2026-11-23 | Auth: Better Auth (Google, GitHub, email magic link + password); email via Resend | Runs on Workers, MIT, owns user table | Clerk, Auth.js |
| 2026-11-23 | Payments: Polar (merchant of record) recommended | Handles tax; works beyond Stripe countries | Paddle, Lemon Squeezy, Stripe |
| 2026-11-23 | Agent: Anthropic TS SDK loop in a Durable Object; default `claude-sonnet-5-5`, deep `claude-opus-5-5` | Claude Agent SDK needs Node, not workerd | Cloudflare Agents SDK + AI SDK |
| 2026-11-23 | Breakpoints: Desktop 1200 (fixed, width ≥ 1200 editable), Tablet (810 default, removable), Mobile (390 default, removable); desktop-first cascade | Owner requirement | — |
| 2026-11-23 | Generated styling: Tailwind v4 with `tablet`/`mobile` custom variants (max-width media queries) and variables as CSS custom properties + `@theme` | Desktop-first cascade with clean classes | Mobile-first Tailwind defaults (doesn't match desktop-first design) |
| 2026-11-23 | **Free users can publish 1 project to Vercel** (direct deploy, badge); GitHub push and ZIP export are Pro | Owner chose on decision card | All code delivery Pro |
| 2026-11-23 | Hosting targets: Vercel first; Netlify/Cloudflare later behind `PublishTarget` interface | Owner requirement | — |
| 2026-11-23 | Inspector and panel options listed in `PRD.md` F29 are required; exact visual design is open | Owner shared reference mockups (options, not final visuals) | — |
| 2026-11-23 | Every layer has a code class shown next to its name and emitted as the element's first class (`PRD.md` F27); accessibility built in (F28) | Owner request: identify layers in code | data attributes |
| 2026-11-23 | Component variants, per-breakpoint variable values, accessibility checks moved into v1 | Shown in owner mockups | Later |
| 2026-11-24 | Animation: entrance/scroll-in effects in new phase P6A (hover transitions dropped with hover state), advanced motion Later; CSS-first output, no animation library by default | Owner agreed; keeps sites light and both frameworks identical | Motion/GSAP runtime |
| 2026-11-24 | Inspector simplified: no At rest/Hover state, no margin, no Block display, Align is a dropdown (not a 3×3 matrix) and Space between/around/evenly are separate Distribute buttons; keep blend modes, image features, guides, export | Owner decision | Mockup version |

## Open questions (owner; defaults in place)
- Pricing numbers and limits in `BILLING.md` (proposal).
- Truframe's own license (default: proprietary).
- Domain names: `truframe.com` (app) and a separate domain for user content (`truframe.site` assumed). Must be a different registrable domain.
- Payments provider final choice depends on where the company is registered.

## Glossary
- **Design document / doc:** the Loro CRDT holding a project's pages, nodes, components, variables, assets and code files.
- **Op / transaction:** a validated change to the doc; a transaction = one gesture or one agent turn = one undo step.
- **Generated files:** everything in Code View; produced by the compiler, read-only.
- **Embed:** a node holding sanitized third-party HTML or a URL (maps, videos, widgets); the only way to add custom markup.
- **Temp link:** hosted preview at `*.truframe.site` for client approval.
- **Credit:** unit of built-in agent usage (`BILLING.md §3`). **MCP call:** one external tool call.

## Gotchas
- Next.js `output: 'export'` can't use server features; temp links for Next.js projects are static in v1.
- Workers bundle size limits: keep compiler WASM < 2.5 MB gz.
- Loro and the Rust model types must stay in parity with `packages/model`; CI parity test is mandatory.

## Conventions learned
- (none yet)

## Dependencies added (name, license, why)
- (none yet)

## Benchmarks
- (none yet)
