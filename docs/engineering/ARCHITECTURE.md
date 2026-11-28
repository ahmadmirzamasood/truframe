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
| Generated output | **Next.js 16 App Router + Tailwind v4 + TypeScript**, or **Astro 7 + Tailwind v4** (Astro 7 was current when P3 started; pins in `crates/compiler/templates/astro/package.json`) | Modern defaults with the widest reach | CSS Modules output (Later option) |
| Tests | Vitest, Rust `cargo test` + `insta` snapshots, Playwright, fast-check / proptest | — | — |
| Tooling | pnpm + Turborepo, Biome, Cargo workspace, wrangler | — | — |

## 3. Where Rust is used (and where it isn't)
1. **`crates/compiler` (core, from day one).** Model → files (Next.js and Astro adapters). Uses `oxc` to validate the TSX it emits (every generated file must parse; done in the golden tests, so oxc is a dev-dependency and not in the WASM) and our own printer for TSX and Astro. It is compiled to WASM (`wasm-bindgen`) and runs in three places: a Web Worker in the editor (real-time Code View), the AgentSession/MCP Workers (agents read generated code), and the BuildWorker (final build files). It is also tested natively with `cargo test`. Size budget: < 2.5 MB WASM gzipped.
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

**Component ops (P5-3).** `addComponent { component, nodes }` (nodes[0] is the root), `updateComponent { componentId, fields }` (name, props, variantProps, variants) and `deleteComponent` (fails validation while instances exist). The editor composes them: create = `deleteNode` + `addComponent` with the same layers + `insertNodes` of an instance; detach = `deleteNode` + `insertNodes` of a resolved copy.

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

**Output contract (P3-1).** `compile(doc)` returns `{ files, spans, css, assets }` (`OUTPUT_VERSION` 1):
- `files`: path → text, sorted by path (`BTreeMap`).
- `spans`: `{ node, path, start, end }` per element that renders a layer. Offsets are **UTF-16 code units** (JS strings, CodeMirror), `end` exclusive, covering the whole element from `<` to the closing `>`.
- `css`: node id → `{ desktop, tablet?, mobile? }` CSS declarations for the canvas; tablet/mobile hold only changes, like the classes.
- `assets`: `{ assetId, key, path }` for every uploaded asset the project references; the build job copies `key` from R2 to `path`.
- `instanceCss` (P5-3, omitted when empty): instance id → component layer id → `{ desktop, tablet?, mobile? }` for instances whose layers differ from the component's own (a non-default variant or layer overrides). The renderer scopes these under the instance.
The printer (`crates/compiler/src/printer.rs`) lays out an element tree: two-space indent, double quotes, 80 columns, attributes one per line when the opening tag doesn't fit, text content never re-wrapped (so designed whitespace survives). The WASM build is `packages/compiler-wasm` (`initCompiler(module | bytes)`, `compile(doc, framework?)`); the generated glue in `pkg/` is built by `pnpm compiler:build`, not committed.

**Style engine (P3-2, `crates/compiler/src/style`).** Each style property maps to a *slot* (display, gap, padding, width, flex, font size, background…). Per breakpoint the engine takes the cascaded props, builds one declaration per slot (classes + CSS), and emits all slots on desktop and, for tablet/mobile, only slots that differ from the breakpoint above. A slot that disappears is reset to its initial value (`tablet:flex-initial`); a declaration that replaces a different kind adds a clear first (a gradient over a solid color adds `bg-transparent`). The canvas CSS is built from the same declarations. Rules:
- Spacing lengths (gap, padding, insets, fixed sizes, min/max) use Tailwind's `--spacing` scale when the px value is even (`18px` → `gap-4.5`), `px` for 1px, otherwise an arbitrary value (`gap-[13px]`). Font sizes, weights, line heights, letter spacing and radii use theme names only on exact matches.
- Fill depends on the parent at each breakpoint: in a stack it is `flex-1` on the main axis and `self-stretch` on the cross axis (Fixed/Fit children get `flex-none`, Figma-like); in a grid or block parent it is `w-full`/`h-full`. An absolute child ignores its parent's flex, and a parent with absolute children gets `relative`.
- Variables are referenced as CSS variables in classes (`bg-(--brand-accent)`, `p-(--space-md)`, `text-(color:--brand-accent)`), so a variable name can never collide with a Tailwind theme name. Spacing variables also bind a single `radius` (`rounded-(--x)`) and fixed sizes (`w-(--x)`, `h-(--x)`) since P5-2. `tokens.css` still adds `@theme inline` mappings (`--color-brand-accent`, `--spacing-space-md`, `--text-heading…`, `--font-heading`) so exported projects can use them as utilities.
- A bound text style (`font: { var }`) supplies family, size, weight, line height and letter spacing through `<cssName>-family/-size/-weight/-line-height/-letter-spacing`; a value set on the layer itself wins for that part only.
- Font families are referenced as `--tf-font-<slug>`: the framework's font loader sets it for web fonts (P3-3/P3-4), `tokens.css` declares system stacks (Arial, Georgia, …).
- `truncate: true` is Tailwind's `truncate` (overflow hidden, ellipsis, nowrap) in its own slot; turned off below, it resets all three (P4-7a).
- Hidden per breakpoint is part of the display slot (`hidden` / `tablet:flex`, or the tag's natural display).
- Media queries: `tablet` = `(width < 1200px)`; `mobile` = `(width < <tablet width>px)`, or `(width < 1200px)` when Tablet is removed. Tablet is declared first so mobile wins where both match.
- Component roots split slots: outer (display, position, insets, spans, flex, size) come from the instance; the rest from the component.
- `packages/compiler-wasm/src/tailwind.test.ts` runs real Tailwind v4 (`@tailwindcss/node`) over the output: every emitted utility must produce CSS and no layer code class may.

**Next.js adapter (P3-3, `crates/compiler/src/adapters/next.rs`).** Output: `app/layout.tsx` (fonts, `lang`, `globals.css`), `app/<path>/page.tsx` per page with a static `metadata` export (title, description, `robots` for noindex), `components/<Name>.tsx`, `app/globals.css` + `app/tokens.css`, and fixed files from `crates/compiler/templates/next/` (`package.json`, `package-lock.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `.gitignore`) plus a README. Choices:
- **Static export** (`output: "export"`, `images.unoptimized`), so the same build serves temp links, Vercel and a ZIP. Images are `next/image` with `src="/assets/<file>"` and the asset's intrinsic width/height; files go to `public/assets/` (listed in `assets`).
- **Fonts:** every non-system family becomes `next/font/google` with `variable: "--tf-font-<slug>"` and the weights the design uses with it (walked with inheritance). Builds need network access to Google Fonts; the browser never calls Google.
- **Links:** internal paths (`/…`, page targets) use `next/link`; anchors, external, `mailto:`/`tel:` use `<a>`. New tab adds `rel="noopener noreferrer"`. A link with tag `button` still renders `<a>` (a navigating button is a link; real buttons need forms, Later).
- **Components:** one file per component, `props` typed (`text`/`link` → `string`, `boolean`, image → `{ src, width, height } | null`), defaults inline (`props.title ?? "Starter"`). Variants become a typed prop each and a `Partial<Record<variantKey, classes>>` lookup per layer they change, falling back to the base classes. The root takes `className` from the instance (outer slots + the instance's code class). Boolean and image props render with `{cond && <el />}`. An instance with per-layer overrides (`overrides.nodes`) is rendered inline with the variant, props and overrides applied, instead of importing the component.
- **Placeholders:** an image with no asset is a `div` with a grey background (`role="img"` + `aria-label` when it has alt text). Icons are `<img src="https://api.iconify.design/<set>/<icon>.svg">` inside the layer element until the Iconify integration (P5) inlines SVGs. URL embeds are a lazy `iframe`; HTML embeds render empty until the sanitizer (P6).
- `package-lock.json` is the same for every project (dependencies don't vary per design), so `npm ci` works on any generated project and the goldens store it once (`crates/compiler/templates/`).

**Astro adapter (P3-4, `crates/compiler/src/adapters/astro.rs`).** Output: `src/pages/<path>.astro` per page (wrapped in `Base` with title, description, noindex), `src/layouts/Base.astro` (imports `global.css`, `<Font cssVariable>` per web font, `lang`), `src/components/<Name>.astro` (`interface Props` with `class`, variant unions and typed props; `Astro.props` read as `props.x ?? default`), `src/styles/global.css` + `tokens.css`, `astro.config.mjs` (Tailwind v4 via `@tailwindcss/vite`, top-level `fonts` with `fontProviders.google()`, `cssVariable` and the weights in use), and fixed files from `crates/compiler/templates/astro/`. Images import their file from `src/assets/` and render `<Image>` from `astro:assets` (sizes inferred); image props are `ImageMetadata | null`. CSS background images use `public/assets/` like Next.js. All links are `<a>`. Components self-close in both syntaxes; HTML elements never self-close in Astro.

**Goldens (P3-3).** `fixtures/compiler/<name>/input.json` comes from `scripts/lib/compiler-fixtures.ts` (validated documents: templates, model fixtures and one fixture per compiler feature; `node scripts/compiler-fixtures.ts`). `crates/compiler/tests/goldens.rs` compiles each for every framework and compares with `expected/<framework>/files/**` and `expected/<framework>/output.json` (spans, css, assets); it also parses every generated `.ts/.tsx/.mjs` with oxc, checks determinism and that spans cover elements. Update after a reviewed change: `UPDATE_GOLDENS=1 cargo test -p truframe-compiler --test goldens`. `node scripts/build-fixtures.ts nextjs|astro` builds and type-checks them (one `npm ci`, then each fixture swapped in, placeholder images for assets).

### 6.2 One way only
There is no parse-back. Generated files are never edited by users or agents; every change is a design op, and the compiler regenerates the affected files. `spans` exist only for "reveal in code / reveal in design" in Code View and for agents reading code.

### 6.3 Where it runs
Editor: a Web Worker runs compile incrementally (per page/component, debounced 50 ms) to keep Code View live. Agent/MCP Workers: compile on demand when an agent reads code. Jobs: full compile for builds, exports and publish.

## 7. Realtime and persistence
- **ProjectRoom DO**: one per project, accepts WebSocket connections after verifying a short-lived signed room token issued by the web app (user + project + role + plan). It applies validated ops to the Loro doc, broadcasts updates, persists Loro updates to DO SQLite, compacts them into a snapshot in R2 every N ops or 5 minutes, and records revisions.
- **Loro layout (P2-4, `packages/crdt`):** `meta` map (schemaVersion, id, framework, settings, and a mergeable `breakpoints` map); `pages` movable list of page ids + `pageData` map (id → Page JSON); `tree` (LoroTree, fractional index) with one tree node per layer, page and component roots as tree roots, so concurrent moves can't duplicate a node or form a cycle; each tree node's data map holds the node's fields as JSON, except `style`, a mergeable map of mergeable per-breakpoint maps (one key per prop) so concurrent edits to different props merge; `ids` map (node id → TreeID); `components`, `variables`, `assets` maps (id → JSON). Breakpoint style maps are never deleted (empty = no overrides), because re-creating a mergeable map resurfaces its old contents. Page fields, text content, instance overrides, components and variables are last-writer-wins per value. Concurrent offline edits can still merge into a document that breaks a reference rule (e.g. a variable deleted while someone binds it); ProjectRoom validates the merged state (P2-5).
- **ProjectRoom as built (P2-5):** the web app issues a room token (`POST /api/projects/:id/room-token` → `{ token, url, expiresAt }`; claims: user, workspace, project, role, plan, framework, template, 5-minute expiry; HMAC-SHA256 with `ROOM_TOKEN_SECRET`, shared by `apps/web` and `workers/realtime`). The browser opens `new WebSocket(url, ["truframe.v1", token])`, so the token never appears in a URL. The realtime worker verifies the token and passes the claims to the DO in a header that only it can set. The room is **authoritative**: clients send `{ t: "tx", id, ops }`; the room validates and applies the ops (`applyTransactionToLoro`, plan limits from the claims' plan) and broadcasts the Loro update to everyone (`{ t: "update", data, txId, by }`), or answers `reject` with the typed error. Clients never send Loro bytes, so a client can't inject arbitrary CRDT history. `{ t: "sync", vv }` returns what a client is missing. Transaction ids make resends idempotent (`ack`). Storage: DO SQLite holds the latest snapshot plus updates since it. Compaction (every 200 updates or 5 minutes after the first change) rewrites the snapshot, copies it to R2 (`ws/<workspaceId>/projects/<projectId>/snapshots/<ms>.loro`) and inserts a `revisions` row in D1 grouping the authors and change count. The room seeds a new document from the project's template the first time it opens. Locally, `workers/realtime` runs with `--persist-to ../../apps/web/.wrangler/state` so it shares the web app's D1 and R2.
- **History:** a revision = a Loro version (frontiers) plus metadata (author: user|agent, summary, timestamp) in D1. Restore = checkout the old version into a new transaction (never destructive). Named versions are pinned revisions. Retention by plan (`docs/product/BILLING.md`): revisions older than retention are compacted, named versions are kept.
- **Comments:** stored in D1 (`comments`, `comment_threads`) anchored to `{pageId, nodeId, breakpoint, offset}`; the DO broadcasts changes. Anchors survive node moves; if a node is deleted the thread is kept as "detached".
- **Offline:** the editor keeps the Loro doc in IndexedDB and syncs on reconnect.
- **Editor store as built (P2-6, `packages/sync`):** `DocClient` holds a Loro replica that only the room's updates change, plus a list of pending local transactions. The document the editor shows is the replica with the pending ops applied on top; a pending transaction that no longer applies after someone else's change is dropped, and the room's `reject` drops it too. On every (re)connect the client sends `sync` with its version vector and resends all pending transactions; the room's tx-id dedupe makes that safe. The replica snapshot and the pending transactions are cached in IndexedDB, so a reload, even offline, shows the last state at once. Undo/redo are local and per user: each transaction records its inverse ops, and undo sends them as a new transaction, so it never reverts someone else's work; steps that no longer apply are skipped. The editor page loads `@truframe/sync` (and Loro's WASM) with a dynamic import.

## 8. Editor
- **Design View**: a canvas world (CSS transform) containing one frame per breakpoint for the active page, rendered by `packages/renderer` directly from the model (no iframe, no build). Overlays (selection, handles, guides, measurements) are drawn in screen space. Hit-testing uses a model-side spatial index from rendered boxes.
- **Renderer as built (P4-3, `packages/renderer`):** `buildPageTree(doc, pageId)` returns the same elements the compiler emits for a page (`tree.rs`: tags, `<a>` for links, `<img>` with width/height for `next/image`, figure/picture wrappers, placeholder `div`s, icon and embed wrappers, rich text `<strong>/<em>/<u>/<br>`). Each layer element carries `data-tf-node`; elements drawn from a component's own layers carry `data-tf-c`, and the instance root also gets `data-tf-node`. `frameStylesheet(doc, { css, tokens }, breakpoint)` scopes everything to `[data-tf-frame="<bp>"]`: a trimmed Tailwind preflight in which the frame root stands in for `html`/`body` (also `position: relative` and `isolation: isolate`, so absolute layers and negative z-index behave as on the page), the `:root` blocks of the compiler's `tokens.css` down the cascade, then every layer's declarations for desktop, tablet, mobile in order. `RenderedFrame` (React, `createElement` only, so Node can run it) draws one frame. The editor compiles the document in the browser (`@truframe/compiler-wasm/browser`, WASM fetched once from the bundled asset) on every change and keeps the last good output on error.
- **Parity (P4-3):** `scripts/parity.ts` builds golden Next.js projects (`build-fixtures.ts --keep-out`), serves each static export, and screenshots the site and the renderer's frame for every page and breakpoint at the breakpoint width; more than 1% differing pixels (pixelmatch, threshold 0.1) fails. CI job `canvas-parity`. Known gaps, left out of the parity list until fixed: web fonts (the canvas names the family but doesn't load it yet; P5 Google Fonts), instance layers (the compiler records one CSS entry per component layer, so per-instance variants and overrides aren't distinguished on the canvas; the compiler should key them per instance in P5), remote embeds/icons.
- **Gestures as built (P4-6):** `SelectionLayer` (screen-space overlay above the frames) measures every `[data-tf-node]` box per frame after each render, in frame-local world pixels, plus each container's flow (grid / row / column from its computed style). Clicks hit-test the model tree over those boxes. A press becomes a drag after 3 screen px; absolute layers move with `snapMove` (6 screen px threshold), others reorder/reparent with `dropIndex` into the deepest container that can take them (within 24 world px of a container's edge along its parent's flow, the drop goes beside it). Resize handles set Fixed width/height at the editing breakpoint (absolute layers also get left/top). Every gesture previews locally and calls `apply` once on pointer-up with the ops from `gestures.ts`, so it is one transaction and one undo step.
- **Pages (P4-9):** folders are not stored; they are the path prefixes of pages (`/blog/first-post` is in `blog`) and compile to nested routes (`app/blog/first-post/page.tsx`, `src/pages/blog/first-post.astro`). Folder actions rewrite page paths with `updatePage` ops in one transaction.
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
