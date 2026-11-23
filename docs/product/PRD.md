# Truframe PRD (v2)

> Product requirements. Agent-facing: read the sections for your task before building, and check your work against the acceptance criteria. If this conflicts with `docs/engineering/ARCHITECTURE.md`, `docs/product/BILLING.md` or `docs/engineering/SECURITY.md`, stop and raise it. v1 of this PRD (local tool editing existing repos) is archived in `archive/v1-local-first/`; editing an existing repo is now a "Later" item.

## 1. Pitch

Truframe is a hosted visual website builder for people who want **real code**. You design on a canvas like Framer or Figma, and Truframe writes a clean **Next.js or Astro** project as you go. Every design change shows up live in Code View (one way: design → code). Preview on every breakpoint, share a temporary link for client approval, then publish to Vercel (through GitHub if connected). An agent can design and code with you.

## 2. Users

| Persona | Need |
|---|---|
| **Freelance designer / agency** (primary) | Design client sites visually, get client approval on a link, ship real code the client owns |
| **Design engineer / indie developer** | Design fast, then tweak code directly without losing the visual editor |
| **Founder / marketer** | Build a landing page with an agent, publish to their own Vercel |
| **External agents (Claude Code, Cursor) over MCP** | Read and edit Truframe projects with structured tools |

## 3. Principles
1. **Real, owned code.** Generated code is idiomatic Next.js or Astro + Tailwind, readable by a human, and runs without Truframe.
2. **Design drives code.** Design View is where you edit; Code View shows the generated code live and is read-only. Code never flows back into the design.
3. **Desktop-first, responsive by default.** Every breakpoint uses auto layout (flex or grid) so designs adapt.
4. **Every change is undoable and recoverable** through history.
5. **Agents are first-class.** Everything the UI can do, the agent and MCP can do, with limits per plan.
6. **Honest limits.** Code that the design model can't represent is kept as code and shown clearly, never silently dropped.

## 4. Features

Feature IDs are stable. Plan gating is defined in `docs/product/BILLING.md`; "Pro" below means a paid plan.

### Accounts and projects
**F1. Auth.** Sign in with Google, GitHub, or email (magic link and email + password, verified email). Acceptance: all three work; accounts with the same verified email are linked, not duplicated.

**F2. New project and framework choice.** Before creating a project the user picks **Next.js** (App Router) or **Astro**, plus a template (blank, landing, portfolio, SaaS). The framework is fixed per project in v1 (switching later = duplicate as other framework, Later). Acceptance: both frameworks generate a project that builds and runs with `npm install && npm run dev` with no edits.

**F3. Dashboard.** Projects list, create, duplicate, rename, delete (soft delete, 30-day restore), workspace switcher (personal workspace in v1; teams Later).

### Editor layout
```
┌ Top bar: Pages ▾ | Design View / Code View | Breakpoint bar | Preview | Publish ┐
├ Left panel tabs: Pages · Layers · Components · Variables · Assets ─┬ Canvas ─┬ Right panel tabs: Inspect · Agent · History · Comments ┤
```

**F4. Design View.** Infinite canvas, pan/zoom (10% to 800%), frames per breakpoint shown side by side for the active page. Insert tools: Frame (stack), Text, Image, Link/Button, Icon, Embed, Component instance. Select, multi-select, drag, resize, duplicate, group into stack, copy/paste, align/distribute, snapping and measurements. Keyboard shortcuts and Cmd+K command palette.

**F5. Code View.** File tree of the whole generated project (Next.js or Astro) and a **read-only** code viewer with syntax highlighting, search, and "reveal in design" (click code to select the matching layer) and "reveal in code" (select a layer to jump to its code). Every design change appears in code in real time (< 300 ms). Acceptance: see §5.

**F6. Breakpoints.** Desktop exists by default at **1200 px** and cannot be deleted; its width can be set to any value ≥ 1200 (e.g. 1440, 1920). Below desktop there are at most two breakpoints, **Tablet** (default 810 px) and **Mobile** (default 390 px); each can be removed and re-added, widths editable within their range (Tablet 600 to 1199, Mobile 320 to 599). Styles cascade **desktop → tablet → mobile**: a smaller breakpoint inherits until overridden, and overridden properties are marked in the inspector with a "reset to inherited" action.

**F7. Auto layout.** Every breakpoint's root and every frame uses auto layout: **Stack (flex)** with direction, gap, padding, align, distribute, wrap; or **Grid** with columns, rows, gaps, and per-child span. Children size as Fixed, Fill, or Fit. A child can opt out with "absolute position" inside its parent. Acceptance: output CSS uses flex/grid only; no absolute layouts unless the user chose absolute.

**F8. Preview.** The Preview button opens a full-screen preview with a Desktop / Tablet / Mobile switcher (and "all side by side"), live links between pages.

### Panels
**F9. Pages panel.** All pages of the project in one list (one project file holds all pages). Add, rename, reorder, duplicate, delete, set home page, nest under folders (→ nested routes), page settings (slug, title, description, OG image, noindex). Each page maps to a route file in the generated code.

**F10. Layers panel.** Shows the three breakpoints (Desktop, Tablet, Mobile) as top-level groups, each expandable into its layer tree. Hide per breakpoint, lock, rename, drag to reorder/reparent. Selecting a layer selects it on canvas and vice versa. Each layer row shows its **code class** next to its name (e.g. `Hero Section .hero-section`); the same class is the first class on that element in the generated code (F27).

**F11. Components panel.** Create a component from a selection; edit the main component; place instances; instance overrides (text, image, link, visibility, variable bindings); props exposed explicitly. Every component becomes a component file in Code View (`components/Name.tsx` or `src/components/Name.astro`) and its instances become imports + usages. Variants: Later. **Variants are in v1:** a component can define variant properties (e.g. Size, State, Tone) with values; instances pick a variant from dropdowns, and overridden properties show a red dot. Instance inspector: Go to main component, Detach, Reset override (F29).

**F12. Variables panel.** Variables behave as CSS custom properties. Types: **Color**, **Text style** (font family, size, weight, line height, letter spacing, per breakpoint), **Spacing/Number**. Create, rename, group, delete (with "used in N places" warning). Modes (light/dark): Later. Generated code: `:root` CSS variables + Tailwind v4 `@theme` tokens. Panel tabs are **Colors · Spacing · Font** (Font = text style). **Every variable can have per-breakpoint values** (Desktop required; Tablet and Mobile follow Desktop until set). The CSS output goes to `tokens.css`, and the create dialog shows a live preview of the generated code (F29).

**F13. Variable binding.** In the inspector, any color, spacing (padding, gap, radius, size) or text property can be bound to a variable of a matching type. Bound values show the variable name; editing the variable updates every bound element in all views; unbinding keeps the current value.

**F14. Assets panel.** Upload images (PNG, JPEG, WebP, AVIF, GIF, SVG) by drag-drop or picker; folders; search; replace an asset everywhere; delete with "used in N places" warning; alt text. Images are optimized on upload and served responsive. Generated code references assets under `public/` (Next.js) or `src/assets/` (Astro, using `astro:assets`). Accepted upload types in v1: PNG, JPEG, WebP, GIF, SVG (AVIF Later). The panel shows a storage meter for plan limits ("38 of 250 MB · 4 of 100 files").

**F15. Inspector.** Context-sensitive properties for the selection: position/size, auto layout, spacing, typography, fill, border, radius, shadow, opacity, effects (blur), link, visibility per breakpoint, variable bindings, component props, accessibility (alt, aria-label, semantic tag: section/header/nav/footer/h1–h6/p/button/a). **Must include every option listed in F29**; accessibility per F28. This also adds: Overflow (Visible/Clip), Display (Grid/Stack/Free), an Align dropdown with separate Distribute buttons (Space between / around / evenly), blend modes, image fit (Fill/Fit/Crop/Tile) and aspect ratio, **Accessibility Checks** (contrast at every breakpoint, missing alt text), and for pages **Selection colors** (change a color everywhere), **Guides** and **Export**.

**F16. Agent tab.** Chat with an agent that can see the current page, selection and screenshots, and can make design changes and code changes through Truframe tools. User chooses **Skills** (F17) before or during a chat. Changes appear live and are grouped as one history entry per agent turn with "undo turn". Stop anytime. Usage limited per plan.

**F17. Skills.** Selectable skill packs that shape the agent: built-in (e.g. Landing page, Portfolio, SaaS pricing, SEO pass, Accessibility review, Copywriting, Brand from logo) and user-created (Pro). A skill = instructions + optional starter components/variables. Multiple skills can be active.

**F18. Comments tab.** Comments pinned to an element or canvas point, threads, @mentions, resolve. Clients viewing a temporary link can comment (name + email, no account) when the owner allows. Email notification via the email integration.

**F19. History tab.** Automatic revisions (every change grouped into sessions), named versions ("v1 sent to client"), preview any revision, restore (creates a new revision, never destroys), compare two revisions. Retention by plan (`docs/product/BILLING.md`).

### Output
**F20. Publish.** The Publish button offers:
1. **Temporary link** (client approval): a hosted preview at `https://<slug>-<id>.truframe.site`, optional password, expiry, `noindex`, client comments and an "Approve" button that notifies the owner.
2. **Publish to Vercel:** connect Vercel (OAuth). If **GitHub is connected**, Truframe commits the generated project to the chosen repo/branch and the linked Vercel project deploys automatically; otherwise Truframe deploys files directly through the Vercel API. Shows deploy status, URL and logs. Other hosts (Netlify, Cloudflare) Later.

**F21. GitHub.** Connect GitHub (GitHub App), create a new repo or pick an existing empty one, choose branch. Each publish is one commit with a generated message. Truframe never force-pushes. Code is one-way out of Truframe: changes made in GitHub are not pulled back, and the next publish overwrites generated files (Truframe warns if the branch has outside commits).

**F22. Image export.** Export a selection, frame or whole page per breakpoint as **PNG, JPEG or WebP** at 1×/2×/3× with quality for JPEG/WebP.

**F23. Code export (Pro).** Download the project as a ZIP. GitHub push and Vercel publish are also code delivery and follow the same gating (see `docs/product/BILLING.md` §2 for the recommended rule).

### Platform
**F24. MCP server.** Remote MCP endpoint so external agents can read and edit projects with OAuth consent per workspace, metered per `docs/product/BILLING.md`.

**F25. Billing.** Free and Pro plans (`docs/product/BILLING.md`), checkout, upgrade/downgrade, invoices, usage meters (agent, MCP, storage, temporary links) visible in settings.

**F26. Integrations.** See `docs/product/INTEGRATIONS.md`.

### Layer classes, accessibility and panel options
**F27. Layer code classes.** Every layer row in the Layers panel shows its code class next to the name in muted monospace (e.g. `Hero Section  .hero-section`). The generated code puts that class first on the element, before the Tailwind utilities (`className="hero-section flex gap-6"`; Astro `class=`). Rules:
- Kebab-case of the layer name, ASCII only; unnamed layers use their type (`section`, `text`, `image`).
- Unique per page (`-2`, `-3` in tree order); inside components scoped as `component-name__layer`.
- Names that collide with Tailwind utilities or variants (`container`, `flex`, `hidden`, `group`, `peer`, `block`, `grid`…) get `-el`.
- Renaming a layer renames its class. The class carries no CSS; it exists for identification in Code View, devtools and the exported repo. Code View search matches it, and clicking it in Layers reveals the element in Code View.

**F28. Accessibility.** Built in at both the editor and the output level:
- **Semantic tag** on every layer (Accessibility section → Tag: div, section, header, footer, nav, main, aside, article, h1–h6, p, span, a, button, img, figure…), with sensible defaults per layer type.
- **Alt text** for every image (empty = warning; "decorative" toggle emits `alt=""`).
- **Accessibility Checks** in the inspector for the selection and for the whole page: text and focus-ring contrast (WCAG 2.1 AA) at every breakpoint, missing alt text, heading order (single h1, no skipped levels), links/buttons without an accessible name, and tap targets under 24 px on mobile. Each problem links to its layer.
- **Generated code:** landmarks from tags, `lang` on `<html>`, visible focus styles, `aria-label` field for icon-only links and buttons, reduced-motion respect for any animation.
- The editor itself is keyboard-navigable and meets WCAG 2.1 AA contrast.

**F29. Panel options (must be present; exact visual design is up to the designer).**
- **Right panel tabs:** Inspect · Agent · History · Comments. The inspector header shows the layer icon, name, type ("Section", "Text", "Image", "Instance of Pricing Card", "Page") and a badge with the breakpoint being edited.
- **Shared inspector conventions:** W/H sizing dropdown Fixed / Fill / Hug; scrub-able number fields with px units; red dot marks values overridden from the component main or the inherited breakpoint; a field bound to a variable shows the variable name with a detach icon; `+` on a section title adds optional settings.
- **Section / Frame:** Create component · Style (Overflow Visible/Clip, Name) · Position and Size (X, Y, W, H) · Layout (Display Grid / Stack / Free, Direction vertical / horizontal / wrap, Align dropdown (Top left, Top center, Top right, Center left, Center, Center right, Bottom left, Bottom center, Bottom right), Distribute buttons (segmented: Packed · Space between · Space around · Space evenly, for the main axis), Gap) · Padding (2 values, expand to 4 sides) · Fill (Solid / Gradient / Image, color + opacity) · Border (stroke color, opacity, sides All/T/R/B/L, Radius with per-corner option) · Shadow · Accessibility (Tag) · Accessibility Checks.
- **Text:** Create component · Content (Name, multiline Content) · Position and Size with resizing Auto width / Auto height / Fixed · Typography (live preview, family, weight, size, line height, letter spacing, alignment left/center/right/justify, advanced: decoration, transform, truncation; bind a Font variable) · Layer (Opacity, Blend) · Fill (text color) · Shadow · Accessibility (Tag) · Accessibility Checks.
- **Image:** preview with file name and pixel size · Replace · From assets · Fit Fill / Fit / Crop / Tile · Alt text · Position and Size · Ratio Auto / 16:9 / 4:3 / 1:1 · Layer (Blend, Radius) · Stroke (color, opacity, width, radius) · Shadow · Accessibility (Tag img / picture / figure) · Arrange (Duplicate, Delete).
- **Component instance:** Go to main component · Detach · Reset override · Position and Size · Variant (one dropdown per variant property, e.g. Size, State, Tone) · Properties (exposed props such as Title, Price, Badge) · Layer (Opacity, Blend). **Component variants are in v1.**
- **Page (nothing selected):** Editing breakpoint switcher (Desktop / Tablet / Mobile) · Page (Title, Path, Description) · Size and Position (breakpoint width, height Fit) · Layout (Display, Direction, Alignment, Gap) · Padding · Fill · **Selection colors** (every literal color on the page; change one to change it everywhere) · Guides (column/row guides per breakpoint) · Export (PNG/JPEG/WebP, scale) · Accessibility Checks.
- **Variables panel:** search and `+`; tabs **Colors / Spacing / Font**; groups (e.g. Brand, Neutral); rows with swatch or preview, name, value; rename, reorder, duplicate, delete with usage count. **New variable dialog:** Name, Type (Color / Spacing / Font), Group, **value per breakpoint** (Desktop required; Tablet and Mobile follow Desktop until set), live **Generated code** preview (`:root { --brand-accent: #ec221f; }` written to `tokens.css`).
- **Assets panel (Images):** search, upload drop zone listing accepted types (PNG, JPEG, WebP, GIF, SVG), thumbnail grid with rename / alt text / replace / delete and drag to canvas, **storage meter** (e.g. "38 of 250 MB · 4 of 100 files").

**F30. Animation.** Animations are settings on a layer, compiled to CSS-first code (no animation library by default). v1 level:
- **Entrance and scroll-in effects (phase P6A):** an **Animation** section in the inspector with Trigger (On load · In view · Loop), From state (opacity, move X/Y, scale, rotate, blur), Duration, Delay, Easing, Play once / every time, and **Stagger children** (for stacks and grids). A per-breakpoint toggle can disable it on Tablet or Mobile. A ▶ Play button on the canvas previews the selection; Preview mode plays everything for real. Presets: Fade in, Slide up, Slide in left/right, Scale in, Blur in.
- **Output:** CSS `@keyframes` + utility classes. "In view" uses CSS scroll-driven animations (`animation-timeline: view()`) where supported, and a ~1 KB IntersectionObserver fallback that adds a class (a small client component in Next.js, an inline `<script>` in Astro).
- **Rules:** animate only transform, opacity and filter; every animation is wrapped in `@media (prefers-reduced-motion: no-preference)` (F28); Lighthouse budgets still apply.
- **Later:** advanced animation (parallax and scroll-progress effects, page transitions, keyframe timeline, Lottie/Rive embeds, optional spring physics via Motion for Next.js).

## 5. Design → code rules (one way)
- The **design document** is the only source of truth. Code View shows the files the compiler generates from it, regenerated on every change.
- Code View is **read-only** in v1: no typing, no custom files, no code-to-design sync. Users who want to change code export it (Pro) or push it to GitHub and edit there.
- Generated code is Prettier-formatted with stable ordering, so diffs between revisions are minimal.
- Custom code needs (scripts, analytics tags) are covered by **Embed** nodes and page settings (head/body code snippets), not by editing generated files.
- Later (only if users ask): editable custom files and code components.

## 6. Key flows
1. **Start:** sign up → New project → pick Next.js or Astro → pick template → editor opens on Desktop 1200 with Tablet and Mobile.
2. **Design:** add stacks and text, bind colors to variables, make a component, upload a hero image, check Tablet and Mobile overrides.
3. **Code:** switch to Code View, see `app/page.tsx` update as you move things; click a line to select its layer in the design.
4. **Agent:** pick skills "Landing page" + "SEO pass" → "Add a pricing section with 3 tiers using our brand colors" → watch it build → undo turn or keep.
5. **Client approval:** Publish → Temporary link → password → send → client comments → owner fixes → client clicks Approve.
6. **Ship:** Publish → Vercel → (GitHub connected) commit to repo → Vercel deploys → live URL.

## 7. Non-functional requirements
| Area | Requirement |
|---|---|
| Performance | Canvas 60 fps with 500 layers on a page; design→code update < 300 ms p50; editor load < 3 s on broadband |
| Reliability | No data loss: every change persisted within 2 s; offline edits sync when back online |
| Output quality | Generated projects pass `tsc`/`astro check`, ESLint defaults, and Lighthouse ≥ 90 performance/accessibility on templates |
| Security | See `docs/engineering/SECURITY.md` (multi-tenant isolation, user-code sandboxing, token encryption) |
| Accessibility | Editor keyboard-navigable; generated sites use semantic tags and alt text prompts |
| Browsers | Editor: latest Chrome, Edge, Safari, Firefox (desktop). Viewing previews: all modern browsers incl. mobile |

## 8. Later (not v1)
Teams and roles; realtime multiplayer cursors (data model supports it from day one); variable modes (dark mode); more interaction states (hover, focus, active, pressed) with transitions; CMS collections; forms backend; advanced animation (parallax and scroll-progress effects, page transitions, keyframe timeline, Lottie/Rive embeds, optional spring physics via Motion for Next.js); import existing Next.js/Astro repo; pull changes from GitHub; Netlify/Cloudflare publishing; custom domains on Truframe hosting; Figma import; localization; switch framework on an existing project.

## 9. Ideas adopted from Doop (clean-room, ideas only)
| Idea | Use in v2 |
|---|---|
| Canvas camera, frames, selection/resize/snapping, measurement | Yes, core of Design View |
| Flex/grouping inference (wrap selection into a stack with inferred direction and gap) | Yes, "Add auto layout" and "Group into stack" |
| Scrub number fields, one history entry per gesture | Yes |
| Command registry feeding shortcuts, palette, menus | Yes |
| Tailwind v4 / Paper-style token naming | Yes, for Variables output |
| Component main + instances + narrowest override | **Now yes** (v1 had skipped it): Truframe owns the model again |
| Comments pinned to elements, activity, follow agent | Yes (comments v1, follow agent Later) |
| Frame versions and approval | Yes in spirit: named versions + client Approve on temporary links |
| MCP edit pattern: compact reads, structured edits, find-and-replace that must match once, screenshot to verify | Yes |
| Iframe runtime + bridge | Used for Preview and Embeds only; Design View renders the model directly |
