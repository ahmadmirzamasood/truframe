# Phase 9: Publish and export

Read `AGENTS.md`, `docs/project/MEMORY.md`, `docs/project/PLAN.md` and `docs/project/TASKS.md` in full before doing anything else, then the doc sections named below. Follow the clean-room rule in `AGENTS.md`: never open or copy from the Doop repository; design from our docs only.

Work through this phase's tasks in `docs/project/TASKS.md` in order, one branch and one PR per task (`tf/<task-id>-<slug>`), meeting each *Done when* with evidence. Mark tasks `[~]` when you start and `[x]` when done. Record learnings, new dependencies (with license) and benchmarks in `docs/project/MEMORY.md` in the same PR. If a doc is wrong or blocks you, propose a fix in the PR and continue with unblocked tasks; ask the human only for the cases under "When to stop and ask" in `AGENTS.md`. For any third-party API (Cloudflare, OpenNext, Better Auth, Loro, oxc, Anthropic SDK, MCP, Polar, Vercel, GitHub), read its current docs before coding; do not rely on memory.

**Read:** `docs/product/PRD.md` F20–F23; `docs/engineering/ARCHITECTURE.md` §10; `docs/product/INTEGRATIONS.md` GitHub and Vercel; `docs/product/BILLING.md` §2 (Free: 1 Vercel project with badge, GitHub/ZIP Pro); `docs/engineering/SECURITY.md` build, temp-link, token and publish rows, T5–T7.

**Goal:** designs leave Truframe as temp links, Vercel deployments, GitHub commits, images and ZIPs. Tasks P9-1 to P9-8.

**Specifics**
- Build job: compile, then build in a Cloudflare Container (static output) with no secrets, limits and an egress allowlist; upload output to R2.
- `workers/sites`: `<slug>-<id>.truframe.site` with password, expiry, noindex, badge on Free and a takedown flag. Client review adds a comment widget (name + email) and an Approve button that emails the owner.
- Publish dialog: Temporary link, or Vercel. With GitHub connected, commit through the GitHub App (Git Data API, never force; stop if the branch moved) and let the git-linked Vercel project deploy. Without GitHub, deploy directly through the Vercel API. Stream status and logs.
- Publish actions only run from a user click.
- Encrypt every integration token (envelope encryption with rotation) and add log redaction.
- Image export PNG/JPEG/WebP through Browser Rendering at the plan's scales; ZIP code export for Pro.

**Exit:** nightly e2e reaches a live Vercel URL with and without GitHub; T5, T6 and T7 green. Report with links from the test accounts.
