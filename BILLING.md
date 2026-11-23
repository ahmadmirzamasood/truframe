# Truframe Billing and Limits (proposal)

> Status: **proposal**; the Free + Vercel rule is decided, the rest is for the owner to confirm. Numbers are starting points to validate in beta against real costs. Agents: all limits are read from one config (`packages/billing/plans.ts`), never hard-coded in features; enforcement is server-side only.

## 1. Plans

| | **Free** | **Pro** | **Team** (Later) |
|---|---|---|---|
| Price | $0 | **$24 / month**, or **$19 / month billed yearly** | per seat, with roles and shared libraries |
| Who | Try Truframe, small personal sites | Freelancers, agencies, indie devs | Studios and companies |

## 2. Feature matrix

| Feature | Free | Pro |
|---|---|---|
| Projects | 3 | Unlimited |
| Pages per project | 5 | 150 |
| Frameworks (Next.js, Astro) | Both | Both |
| Design View | Yes | Yes |
| Code View (read-only, live) | View only; copy disabled (soft deterrent, not real protection) | View and copy |
| Breakpoints (Desktop + Tablet + Mobile) | Yes | Yes |
| Components, Variables, Assets, Layers, Pages | Yes | Yes |
| Variable binding | Yes | Yes |
| Comments (team) | Yes | Yes |
| Client comments + Approve on temporary links | No | Yes |
| Preview (all breakpoints) | Yes | Yes |
| Temporary links | 1 active, 7-day expiry, Truframe badge | 25 active, expiry up to 90 days, password, no badge |
| **Code export (ZIP download)** | No | Yes |
| **Push to GitHub** | No | Yes |
| **Publish to Vercel** | 1 project, direct deploy (no GitHub), "Made with Truframe" badge | Unlimited, via GitHub or direct, no badge |
| Image export PNG / JPEG / WebP | 1× and 2× | 1× to 4×, batch export of all breakpoints |
| History | 7 days, 3 named versions | 1 year, unlimited named versions |
| Asset storage | 250 MB, 100 files, 5 MB per file | 25 GB, 10,000 files, 50 MB per file |
| Agent credits / month | 30 | 1,500 |
| Bring your own Anthropic key (agent doesn't use credits) | No | Yes |
| Built-in Skills | Yes | Yes |
| Custom Skills | No | Up to 50 |
| External MCP access | Yes, limited (see §3) | Yes |
| Support | Community | Email, 2 business days |

**Decided 2026-11-23: Free + Vercel.** Free users can publish 1 project to Vercel by direct deploy (no GitHub) with a small "Made with Truframe" badge. GitHub push and ZIP export stay Pro. This was accepted knowing that source can technically be pulled from a Vercel deployment.

## 3. Agent credits and MCP calls

Two different things are metered:

1. **Agent credits.** These cover Truframe's built-in agent, where Truframe pays the model provider. **1 credit = 1 agent turn using up to 20k input + 2k output tokens.** Larger turns cost more credits, rounded up. A turn's internal tool calls are included; they are not counted as MCP calls.
2. **MCP calls.** These cover external agents (Claude Code, Cursor and others) calling Truframe's remote MCP server. The user pays their own model costs. Each tool call counts as 1.

| Limit | Free | Pro |
|---|---|---|
| Agent credits per month | 30 | 1,500 |
| Max tool calls inside one agent turn | 25 | 100 |
| Max concurrent agent runs | 1 | 3 |
| **External MCP calls per month** | **500** | **20,000** |
| MCP rate limit | 20 calls / minute | 120 calls / minute |
| MCP write calls (edits) | Included in the monthly total | Included |
| Connected MCP clients | 1 | 10 |
| Screenshot tool calls (expensive) | Count as 5 calls | Count as 2 calls |
| When the limit is hit | Hard stop until reset; upgrade prompt | Hard stop by default; optional top-up packs: 500 credits for $10, 10,000 MCP calls for $5 |
| BYO key | No | Agent turns on your key use no credits, still subject to rate limits |

Rules:
- Counters reset monthly on the billing anniversary (Free: the signup day).
- Read-only MCP tools on a project you own still count. This keeps the abuse surface simple.
- Users see usage meters in Settings → Usage, and get an in-app warning at 80% and 100%.
- Targets to check in beta: the model cost of the agent should stay ≤ 30% of Pro revenue at the median user. Infrastructure cost per free user should stay < $0.15 / month. If either is missed, change the credit size, not the price.

## 4. Payments provider

**Recommended: Polar** (merchant of record). It handles global sales tax/VAT, subscriptions, a customer portal, usage-based billing and webhooks. A merchant of record also works for a company outside Stripe's supported countries. Stripe does not onboard Pakistan-registered businesses directly, which matters if Truframe is registered there.
Alternatives: Paddle or Lemon Squeezy (also merchants of record); Stripe if the company is registered in a supported country (e.g. a US LLC via Stripe Atlas).

Implementation notes:
- Checkout and the portal are hosted by the provider; we store `customer_id`, `subscription_id`, `plan`, `status`, `current_period_end` in D1.
- Webhooks are the source of truth for plan changes. They are verified by signature and handled idempotently (event id table).
- Downgrade: data is kept and over-limit items become read-only (e.g. projects beyond 3 can be viewed and exported as images but not edited). Nothing is deleted.
- Trials: 14-day Pro trial, once per account, no card required.
