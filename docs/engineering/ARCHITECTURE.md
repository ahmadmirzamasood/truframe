# Truframe Architecture (v2: hosted)

> Agent-facing map of the system. Change it in the same PR as any change that moves a boundary, adds a service or swaps a dependency, and log the decision in `docs/project/MEMORY.md`. v1 (local tool) is archived in `archive/v1-local-first/`.

## 1. Overview

Truframe is a web app on **Cloudflare**. The Truframe app is built with **Next.js**. Each project is a **design document** (a CRDT) held by a Durable Object. A **compiler**, written in Rust and compiled to WASM, turns the document into a Next.js or Astro project. Design View renders the document directly. Code View shows the compiled files read-only (one way: design → code). Builds for temporary links run in isolated containers; publishing goes to GitHub and Vercel.

```
Browser (app.truframe.com)
┌──────────────────────────────────────────────────────────────────────────────┐
│ Next.js app (dashboard, editor, settings)                                    │
│  Editor: Canvas renderer ─ Panels ─ Inspector ─ Agent ─ Comments ─ History   │
│   Loro doc (local replica) → Compiler WASM (Web Worker) → Code View (read-only)│
└──────────────┬───────────────────────────────┬───────────────────────────────┘
               │ HTTPS (Next.js on Workers)    │ WebSocket (doc sync, presence, agent stream)
┌──────────────▼───────────────┐   ┌───────────▼──────────────────────────────────┐
│ Web Worker (OpenNext)        │   │ ProjectRoom Durable Object (1 per project)    │
│ auth (Better Auth), API,     │   │ Loro doc, op validation, revisions,           │
│ billing webhooks, uploads    │   │ snapshots → R2, comments fan-out              │
└───┬─────────┬────────┬───────┘   └──────▲────────────────────▲──────────────────┘
    │ D1      │ R2     │ Queues           │ ops                │ ops
    ▼         ▼        ▼                  │                    │
  D1 (SQL)  R2 (assets,  ┌────────────────┴──┐   ┌──────────────┴───────────────┐
            snapshots,   │ AgentSession DO    │   │ MCP Worker (remote MCP,      │
            builds)      │ (Anthropic API,    │   │ OAuth, metering)             │
                         │  tools, skills)    │   └──────────────────────────────┘
                         └────────────────────┘
  Queue consumers: BuildWorker → Cloudflare Containers (npm build) → R2 → *.truframe.site
                   PublishWorker → GitHub App (commit) → Vercel (deploy / git-linked)
                   ExportWorker → Browser Rendering (PNG/JPEG/WebP), ZIP export
                   EmailWorker → Resend
```

## 2. Stack decisions

| Layer | Choice | Why | Alternatives |
|---|---|---|---|
| App framework | **Next.js 16 (App Router)**, React 19, TypeScript strict | Owner's choice; one framework for marketing, dashboard and editor | — |
| Hosting | **Cloudflare Workers** via **@opennextjs/cloudflare** | Owner's choice; D1/R2/DO/Queues under one platform | Vercel (owner may move later; keep platform code behind adapters) |
| Realtime + document | **Durable Objects** (SQLite-backed) + **Loro** CRDT (Rust, WASM) | One room per project, strong ordering, built-in history/time travel, multiplayer-ready, offline edits | Yjs (JS, mature; weaker history API), Liveblocks (hosted, cost) |
| Database | **Cloudflare D1** + **Drizzle ORM** | SQL on the same platform; Drizzle has D1 support and typed migrations | Neon Postgres via Hyperdrive (if D1 limits hurt) |
| Files | **R2** (assets, snapshots, builds, exports); **Cloudflare Images** binding for resize/format | Zero egress fees; image variants without our own encoder | Our own WASM encoders |
| Cache/config | **Workers KV** (temp-link routing, flags) | Fast global reads | — |
| Background jobs | **Cloudflare Queues** | Builds, exports, publish, emails, webhooks | Workflows (consider for multi-step publish) |
| Build sandbox | **Cloudflare Containers** (Sandbox SDK) | Runs `npm install && build` of user projects in isolation | External CI |
| Screenshots/export | **Cloudflare Browser Rendering** (Puppeteer) | Exact PNG/JPEG/WebP of the real render for export and agent verification | html-to-image in the browser (inaccurate) |
| Auth | **Better Auth** (Google, GitHub, email magic link + password) with Drizzle/D1 adapter | MIT, runs on Workers, owns our user table, account linking | Auth.js, Clerk (hosted, cost) |
| Email | **Resend** + React Email | Simple API, good deliverability | Postmark |
| Payments | **Polar** (merchant of record), see `docs/product/BILLING.md` | Handles tax; available beyond Stripe countries | Paddle, Lemon Squeezy, Stripe |
| Agent | **Anthropic TypeScript SDK** tool loop inside a Durable Object; default `claude-sonnet-5-5`, deep mode `claude-opus-5-5` | Runs on workerd; streaming; we control tools and metering. (The Claude Agent SDK needs a Node process, so it doesn't fit Workers.) | Cloudflare Agents SDK + AI SDK (good option for the DO plumbing; can combine) |
| MCP | **Cloudflare Agents SDK `McpAgent`** + **workers-oauth-provider** | Remote MCP with OAuth on Workers | @modelcontextprotocol/sdk on a Node server |
| Compiler | **Rust** crate `truframe-compiler` using **oxc** (parser), compiled to WASM | One fast, deterministic implementation for browser, agent and build workers | TypeScript (slower, two implementations drift) |
| Editor UI | Tailwind v4, **shadcn/ui** (Radix), **zustand**, **cmdk**, **lucide-react**, **dnd-kit** | Standard, accessible | — |
| Code View | **CodeMirror 6** (read-only) + file tree, search, reveal-in-design via `spans` | Light, good TSX/Astro highlighting | Monaco (heavier) |
| Generated output | **Next.js 16 App Router + Tailwind v4 + TypeScript**, or **Astro 5 + Tailwind v4** | Modern defaults with the widest reach | CSS Modules output (Later option) |
| Tests | Vitest, Rust `cargo test` + `insta` snapshots, Playwright, fast-check / proptest | — | — |
| Tooling | pnpm + Turborepo, Biome, Cargo workspace, wrangler | — | — |

## 3. Where Rust is used (and where it isn't)
1. **`crates/compiler` (core, from day one).** Model → files (Next.js and Astro adapters). Uses `oxc` to validate the TSX it emits (every generated file must parse) and our own printer for TSX and Astro. It is compiled to WASM (`wasm-bindgen`) and runs in three places: a Web Worker in the editor (real-time Code View), the AgentSession/MCP Workers (agents read generated code), and the BuildWorker (final build files). It is also tested natively with `cargo test`. Size budget: < 2.5 MB WASM gzipped.
2. **Loro** (dependency, not our code). The CRDT document, history and sync are a Rust library shipped as WASM.
3. **Later, only if profiling shows a need:** spatial index for snapping and hit-testing on very large pages (`rstar` → WASM).

Not in Rust: the UI, the Workers glue, auth, billing and integrations (TypeScript). Image encoding is done by Cloudflare Images and Browser Rendering, so no Rust is needed there.

## 4. Repository layout
```
truframe/
├─ apps/
│  └─ web/                     Next.js app: marketing, auth, dashboard, editor route /p/[projectId], settings
├─ workers/
│  ├─ realtime/                ProjectRoom DO (doc, sync, revisions, comments fan-out)
│  ├─ agent/                   AgentSession DO (model loop, tools, skills, metering)
│  ├─ mcp/                     Remote MCP server + OAuth
│  ├─ jobs/                    Queue consumers: build, publish, export, email, webhooks
│  └─ sites/                   Serves *.truframe.site temporary links from R2 (password, expiry, approve)
├─ crates/
│  └─ compiler/                Rust: codegen; wasm-bindgen bindings
├─ packages/
│  ├─ model/                   Document schema (TS) + generated Rust types parity tests
│  ├─ ops/                     Operation types, validation, history grouping
│  ├─ renderer/                Model → DOM for canvas and Preview (uses compiler's CSS)
│  ├─ editor/                  Canvas, tools, selection, snapping, panels, inspector
│  ├─ codeview/                File tree, CodeMirror, sync glue
│  ├─ layout/                  Pure layout math: snapping, auto-layout inference, measurement
│  ├─ db/                      Drizzle schema + migrations (D1)
│  ├─ auth/                    Better Auth config
│  ├─ billing/                 Plans, limits, usage counters, Polar client
│  ├─ integrations/            github, vercel, unsplash, iconify, fonts, resend
│  ├─ agent-tools/             Tool schemas shared by AgentSession and MCP
│  ├─ skills/                  Built-in skill packs (SKILL.md + assets)
│  ├─ emails/                  React Email templates
│  ├─ ui/                      Shared shadcn components
│  └─ protocol/                zod schemas: API, WS messages, ops on the wire
└─ fixtures/                   Model documents + expected compiled output (golden)
```
Dependency rule: `model`, `ops`, `layout`, `protocol` have no internal deps except each other (`ops`→`model`). UI packages never import workers. Workers import `agent-tools`, `billing`, `db`, `integrations` but not UI.
Enforced by `scripts/check-deps.ts` (part of `pnpm lint`). Apps and workers are deploy units and are never imported by other packages; every `@truframe/*` import must be declared in `package.json`.

**Cloudflare environments and bindings (P0).** Each deployable (`apps/web` via OpenNext, `workers/*`) has its own `wrangler.jsonc` with three environments: dev (top level, simulated by Miniflare), `staging` and `production`. Workers are named `truframe-<worker>-<env>`. Binding names are the same everywhere: `DB` (D1), `FILES` (R2), `NEXT_INC_CACHE_R2_BUCKET` (R2, web only), `CONFIG` (KV), `JOBS` (queue), `PROJECT_ROOM` (DO class `ProjectRoom`, hosted by `realtime`), `AGENT_SESSION` (DO class `AgentSession`, hosted by `agent`). `docs/runbooks/cloudflare-setup.md` has the full table and setup steps. A worker's main module may export only Worker entrypoints (default handler, DO classes, `WorkerEntrypoint`s): workerd rejects any other named export.

## 5. Design document model
Stored as a Loro doc per project. TypeScript is the reference (`packages/model`); Rust mirrors it with serde, and parity tests in CI catch drift.

```
Project { id, framework: 'next'|'astro', settings, breakpoints, pages[], components{}, variables{}, assets{} }
Breakpoints { desktop: { width>=1200 }, tablet?: { width 600..1199 }, mobile?: { width 320..599 } }
Page { id, name, slug, parentId?, seo{title,description,ogImage,noindex}, root: NodeId }
Node =
  | Frame     { layout: Stack{dir,gap,padding,align,justify,wrap} | Grid{cols,rows,gap,padding}, children[] }
  | Text      { content (rich spans), textStyle? }
  | Image     { assetId, fit, alt }
  | Link      { href|pageId, target, children[] }   // also buttons
  | Icon      { set, name }
  | Embed     { html (sanitized) | url }
  | Instance  { componentId, overrides{} }
Every node: { id, name, codeClass (derived from name, unique per page; see PRD F27), tag (semantic), sizing{w: fixed|fill|fit, h: ...}, position: auto|absolute, style: Style, hidden: {desktop,tablet,mobile} }
Style = { desktop: Props, tablet?: Partial<Props>, mobile?: Partial<Props> }   // desktop-first cascade (no hover/interaction states in v1)
Props values = literal | { var: VariableId }
Node animation (optional): animation { trigger: load|inView|loop, from{opacity,x,y,scale,rotate,blur}, duration, delay, easing, once, staggerChildren?, disabledOn: [tablet|mobile] }
Variable { id, name, group, cssName (--group-name), type: color|spacing|font, value: { desktop, tablet?, mobile? } }   // per-breakpoint values
Component { id, name, root: NodeId, props: [{name,type,default, target node+field}], variantProps: [{name, values[]}], variants: { "<prop=value,...>": StyleOverrides } }
Instance overrides: { variant: {prop: value}, props: {name: value}, nodes: {nodeId: partial style/text/image} }
```

**Breakpoint semantics.** Desktop styles apply at ≥ 1200 px. Desktop's width setting (≥ 1200) is the width you design at on the canvas, not a media query. Tablet styles apply below 1200 px. Mobile styles apply below the tablet width's lower bound (default `< 810px`; the mobile breakpoint's media query is `width < tablet.width`). Removing Tablet makes Mobile inherit from Desktop directly.

**Schema details (P2-1, `packages/model`).** The sketch above is implemented with these concrete choices:
- One JSON shape, strict everywhere (unknown keys are rejected), `schemaVersion: 1`. `validateDocument()` = zod shape check + `checkIntegrity()` (references between parts); every boundary calls it.
- Nodes live in one flat map `nodes{id → Node}`; frames and links list `children` by id. Pages and components each own one tree (`root`). Every node belongs to exactly one tree: no shared, orphaned or cyclic nodes. A link can't contain a link.
- Layout and sizing (`display`, `direction`, `gap`, `padding`, `width`/`height` Fixed/Fill/Fit, `position`, insets…) are **style props**, not node fields, because they change per breakpoint (a row that stacks on mobile). `Style = { desktop: Props, tablet?: Props, mobile?: Props }`, every prop optional.
- `codeClass` is derived from the layer name at compile/display time and not stored.
- Pages have a `path` (`/`, `/about`, `/blog/post`) instead of `slug` + `parentId`; a home page `/` is required.
- Removing Tablet or Mobile deletes only the breakpoint entry. Overrides stored for it stay in the doc, inactive, and come back if it is re-added.
- Variable references are checked for type (`textColor` must point at a color variable, `gap` at spacing, `font` at font).
- Link hrefs allow only http(s), mailto:, tel:, `/path` and `#anchor`. Asset `key`s are relative (`assets/<sha256>.<ext>`); the server adds the `ws/<workspaceId>/` prefix, so a document can't point at another tenant's objects.
- Colors are lowercase hex (`#rrggbb`/`#rrggbbaa`) so equal colors are equal strings.
- The Rust mirror (`crates/compiler/src/model`, serde) reads the same JSON and rejects unknown keys; it trusts the TS validator for ranges and references. `fixtures/model` + the CI parity job keep them in step (P2-2).
- Starter templates are short JSON outlines expanded by `templateDocument(id, { projectId, framework })` into valid documents with deterministic ids.

**Operations** (`packages/ops`): `insertNode`, `deleteNode`, `moveNode`, `setProp(nodeId, breakpoint, key, value)`, `resetProp`, `setText`, `bindVariable`, `createComponent`, `detachInstance`, `setOverride`, `upsertVariable`, `addPage`, `updatePage`, `addAsset`, `setCodeFile`, etc. Every op is validated against the schema and the user's plan limits before it is applied to the Loro doc. A **transaction** groups the ops of one gesture or one agent turn, and is one undo step.

**Ops as built (P2-3).** `applyTransaction(doc, ops, limits)` in `packages/ops` is the reference semantics: it parses each op (zod), applies them in order to a copy of the plain document, then runs `validateDocument` on the result and checks plan limits (`pagesPerProject`, only when the count grows, so a downgraded project can still be edited). It returns the new document and the inverse ops (newest first), or a typed error (`INVALID_OP`, `NOT_FOUND`, `INVALID_DOCUMENT`, `LIMIT_REACHED`) with no change. Reference rules are not duplicated in ops: deleting a page a link points at, or a variable in use, fails document validation. `setProp`/`resetProp` drop an empty tablet/mobile override object so set-then-reset leaves no trace; `setNodeFields` takes `null` to remove optional fields; `setInstanceOverride` without `value` removes an override. The Loro binding (P2-4) must produce the same documents.

## 6. Compiler (design ⇄ code)

### 6.1 Codegen
`compile(project) → { files: Map<path,text>, spans: NodeId ↔ (path, range), css: per-node canvas CSS }`
- **Next.js adapter:** `app/layout.tsx`, `app/<slug>/page.tsx` per page, `components/<Name>.tsx` per component, `app/globals.css` (Tailwind v4 import, `@theme` from variables, `:root` CSS variables, custom variants for breakpoints), `public/assets/*` references, `next.config.ts`, `package.json`, `tsconfig.json`, `README.md`. Images use `next/image`, fonts use `next/font`.
- **Astro adapter:** `src/pages/<slug>.astro`, `src/layouts/Base.astro`, `src/components/<Name>.astro`, `src/styles/global.css`, `astro.config.mjs` with the Tailwind v4 Vite plugin, `src/assets/*` with `astro:assets` `<Image>`.
- **Styles:** Tailwind v4 classes. Desktop values are the base classes; tablet and mobile overrides use custom variants declared in `globals.css`: `@custom-variant tablet (@media (width < 1200px));` and `@custom-variant mobile (@media (width < 810px));` (values come from the breakpoints). Bound variables become `bg-(--color-brand)` / theme utilities; unbound values snap to the Tailwind scale when exact, otherwise arbitrary values.
- **Layer classes:** every element gets its node's `codeClass` as the first class, before the utilities (`className="hero-section flex gap-6"`). Inside components the class is `component-name__layer`. The compiler refuses names that collide with Tailwind utilities or variants (suffix `-el`). These classes carry no CSS.
- **Animation:** Entrance and scroll-in effects compile to named `@keyframes` in a generated `animations.css` plus classes (`tf-anim-fade-up` with CSS custom properties for distance, duration, delay, stagger index). "In view" uses `animation-timeline: view()` behind `@supports`, with a ≤ 1 KB IntersectionObserver fallback (`components/InView.tsx` client component for Next.js, inline script in Astro layout). Everything sits inside `@media (prefers-reduced-motion: no-preference)`. Only transform, opacity and filter are animated. The canvas renderer uses the same CSS and replays an animation on ▶ by toggling its class.
- **Variables output:** `tokens.css` (imported by the global stylesheet) holds `:root` custom properties for desktop values, plus `@media (width < 1200px)` / `(width < <tablet>px)` blocks for tablet/mobile values, and `@theme inline` mappings so utilities like `bg-brand-accent` and `gap-(--spacing-md)` work. Font variables compile to a group of properties plus a `text-<name>` utility.
- **Variants:** each component variant compiles to a typed prop (`size: 'large' | 'default'`) that selects class sets inside the component file (a plain lookup object, no runtime library).
- **Determinism:** same document gives byte-identical output; stable attribute and class ordering; our own printer with Prettier-compatible style. A golden test suite (`fixtures/`) checks this.
- **Parity:** the canvas renderer uses the `css` output from the same compile step, so what you see in Design View equals the generated site's CSS.

### 6.2 One way only
There is no parse-back. Generated files are never edited by users or agents; every change is a design op, and the compiler regenerates the affected files. `spans` exist only for "reveal in code / reveal in design" in Code View and for agents reading code.

### 6.3 Where it runs
Editor: a Web Worker runs compile incrementally (per page/component, debounced 50 ms) to keep Code View live. Agent/MCP Workers: compile on demand when an agent reads code. Jobs: full compile for builds, exports and publish.

## 7. Realtime and persistence
- **ProjectRoom DO**: one per project, accepts WebSocket connections after verifying a short-lived signed room token issued by the web app (user + project + role + plan). It applies validated ops to the Loro doc, broadcasts updates, persists Loro updates to DO SQLite, compacts them into a snapshot in R2 every N ops or 5 minutes, and records revisions.
- **History:** a revision = a Loro version (frontiers) plus metadata (author: user|agent, summary, timestamp) in D1. Restore = checkout the old version into a new transaction (never destructive). Named versions are pinned revisions. Retention by plan (`docs/product/BILLING.md`): revisions older than retention are compacted, named versions are kept.
- **Comments:** stored in D1 (`comments`, `comment_threads`) anchored to `{pageId, nodeId, breakpoint, offset}`; the DO broadcasts changes. Anchors survive node moves; if a node is deleted the thread is kept as "detached".
- **Offline:** the editor keeps the Loro doc in IndexedDB and syncs on reconnect.

## 8. Editor
- **Design View**: a canvas world (CSS transform) containing one frame per breakpoint for the active page, rendered by `packages/renderer` directly from the model (no iframe, no build). Overlays (selection, handles, guides, measurements) are drawn in screen space. Hit-testing uses a model-side spatial index from rendered boxes.
- **Embeds** on the canvas render in a sandboxed iframe on the usercontent origin (§10). This is the only place third-party markup runs in the browser.
- **Code View**: read-only CodeMirror with file tree and search; clicking code selects the layer (via `spans`), selecting a layer reveals its code.
- **Preview**: full-screen, renders the model with the renderer at the chosen breakpoint width (iframe on usercontent origin for isolation), with real links.
- **Panels**: Pages, Layers (Desktop/Tablet/Mobile groups → trees), Components, Variables, Assets (left); Inspector, Agent, Comments, History (right). All commands go through a command registry (shortcuts, Cmd+K, menus).
- **Layout tools** (`packages/layout`): snapping (parent, siblings, equal spacing), "Add auto layout" (infer direction and gap from children), "Group into stack", resize with Fixed/Fill/Fit semantics.

## 9. Agent, Skills and MCP
- **AgentSession DO** per run: loads the active skills into the system prompt, calls the Anthropic API with streaming and Truframe tools, and applies tool results as ops through ProjectRoom in one transaction per turn. It streams progress to the editor (which node it is touching), honors Stop, and meters credits (`docs/product/BILLING.md`) before and after each model call.
- **Tools** (`packages/agent-tools`, zod schemas, shared with MCP):
  - Read: `get_project`, `list_pages`, `get_page_tree` (compact), `get_node`, `find_nodes`, `get_variables`, `get_components`, `list_assets`, `read_code_file` (generated code, read-only), `get_comments`.
  - Design ops: `insert_nodes` (accepts a compact JSX-like tree for bulk insert), `update_node` (props per breakpoint), `move_node`, `delete_nodes`, `bind_variable`, `set_animation` (entrance/scroll effects on nodes), `upsert_variables`, `create_component`, `set_instance_overrides`, `add_page`, `update_page`.
  - Code is read-only for agents too (`read_code_file`); all changes are design ops.
  - Verify: `screenshot` (page, breakpoint, optional node), `get_compile_diagnostics`.
  - Not available to agents: publish, GitHub, Vercel, billing, deleting projects, inviting people.
- **Skills** (`packages/skills`): folders with `SKILL.md` (frontmatter: name, description, when to use) plus optional `components.json` / `variables.json` starter assets. Built-in skills ship with the app; user skills (Pro) are stored in D1/R2 and sanitized. Active skills are listed in the chat header.
- **MCP Worker**: remote MCP (streamable HTTP) with OAuth 2.1 (workers-oauth-provider). Consent screen picks workspace and projects; scopes `read` and `write`. Same tools as the agent; every call is metered and rate-limited per `docs/product/BILLING.md`.

## 10. Builds, temporary links, publish, export
- **Origins:** app at `app.truframe.com`; user content at a separate registrable domain, `*.truframe.site` (temporary links) and `usercontent.truframe.site` (Preview, Embeds). The app origin never runs user code.
- **Temporary link:** PublishDialog → `build` job → compile → Cloudflare Container runs `npm ci && npm run build` (Next.js `output: 'export'`, Astro static) with no secrets and restricted egress (npm registry only) → output uploaded to R2 under `builds/<buildId>/` → KV maps `<slug>-<id>` → build + password hash + expiry → `workers/sites` serves it with `X-Robots-Tag: noindex`, injects the client comment/approve widget if enabled. Projects whose custom code needs a server get a clear "needs server runtime; use Vercel" message (SSR temp links Later via Workers for Platforms).
- **Publish to Vercel:** `publish` job → compile → if GitHub connected: commit the generated tree to the repo branch through the GitHub App (Git Data API: blobs, tree, commit, update ref; never force) → the Vercel project linked to that repo deploys; we poll and stream status. Without GitHub: upload files with the Vercel deployments API. Generated projects include a `vercel.json` only when needed.
- **Image export:** `export` job → Browser Rendering opens the Preview URL with a signed one-time token at the breakpoint width, screenshots the page/frame/node at the chosen scale as PNG/JPEG/WebP → R2 → signed download URL.
- **Code export (Pro):** `export` job → compile → ZIP → R2 → signed URL (expires in 1 hour).

## 11. Data model (D1, main tables)
`users, accounts, sessions, verifications, rate_limits` (Better Auth) · `workspaces, workspace_members` · `projects (id, workspace_id, name, framework, thumbnail, deleted_at)` · `revisions (project_id, version, author_type, author_id, summary, created_at, named)` · `comments, comment_threads` · `assets (id, project_id, r2_key, mime, bytes, width, height, alt, sha256)` · `skills (workspace_id, name, r2_key)` · `integrations (workspace_id, provider, encrypted_token, scopes, meta)` · `deployments (project_id, target, status, url, build_id)` · `temp_links (project_id, slug, build_id, password_hash, expires_at, approve_enabled, approved_at)` · `subscriptions (workspace_id, provider_ids, plan, status, period_end)` · `usage (workspace_id, period, metric, count)` · `mcp_clients, oauth_grants` · `audit_log` · `webhook_events (id unique)`.
All queries are scoped by `workspace_id` through a repository layer; no raw cross-tenant queries. In code, `workspacesRepo(db)` resolves a user's memberships, and `forWorkspace(db, workspaceId)` returns the only repos that touch workspace data (`packages/db/src/repos`). IDs are UUIDv7. Projects also carry `template_id`, `created_by` and `updated_at`; `deleted_at` is a soft delete that can be restored for 30 days.

**Auth (P1).** `packages/auth` builds Better Auth per request (Drizzle adapter on D1, `authAdapterSchema` from `@truframe/db`), mounted at `/api/auth/*` in `apps/web`. Methods: email + password (verification required), magic link, Google, GitHub. Linking happens only by provider-verified email. Turnstile guards `/sign-up/email` and `/sign-in/magic-link`. Rate limits are stored in D1. Emails are rendered by `packages/emails` (React Email) and sent by Resend, or by a dev outbox locally. Local-only dev routes live under `/api/dev/*` and return 404 elsewhere.

## 12. Performance budgets
Canvas 60 fps at 500 layers; compile one page < 30 ms in the worker; design→code < 300 ms p50; op round trip to DO < 150 ms p50 (same region); editor JS < 900 KB gz initial (Code View and the TS service lazy-loaded); compiler WASM < 2.5 MB gz; temp-link build < 90 s p50.
