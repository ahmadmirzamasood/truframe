# Truframe Security (v2: hosted)

> Agent-facing. Truframe is a multi-tenant SaaS. It stores customers' designs and code, runs builds of user-written code, holds GitHub and Vercel tokens, and lets LLM agents and external MCP clients act on projects. This file defines the threat model, the required controls, and the test checklist that gates phases in `docs/project/PLAN.md`.

## 1. Assets
1. Customer projects (design docs, code, assets): integrity and confidentiality across tenants.
2. Third-party tokens: GitHub App installations, Vercel tokens, MCP OAuth grants, BYO Anthropic keys.
3. Accounts and sessions.
4. Our infrastructure and bill (abuse of builds, agents, storage, Browser Rendering).
5. Customer sites' visitors (temp links must not become phishing or malware hosts).

## 2. Threats and controls

| Area | Threat | Control |
|---|---|---|
| Tenant isolation | User A reads or edits user B's project | Every D1 query goes through a repository layer that requires `workspaceId`; every request is authorized by `(user, workspace, project, role)`; ProjectRoom accepts only a signed, 5-minute room token naming the project; R2 keys are prefixed `ws/<workspaceId>/` and are only reachable through signed URLs or authorized handlers; IDs are random (UUIDv7/ULID), never sequential |
| Auth | Account takeover, session theft | Better Auth with HttpOnly, Secure, SameSite=Lax cookies; email verification before linking accounts by email; rate-limited sign-in and magic links; password hashing with scrypt/argon2 (library default); optional TOTP 2FA (Later); session revocation on password change |
| CSRF / XSS in app | Forged requests, script injection via project names, comments or rich text | Next.js server actions/route handlers check Origin; strict CSP on `app.truframe.com` (no inline scripts except nonce'd, no `unsafe-eval`); React escaping; comments rendered as plain text + mentions; no user HTML on the app origin |
| Third-party markup | Embeds and head/body snippets running with the app's privileges | **Embed code never runs on the app origin.** Embeds and Preview render in sandboxed iframes on `usercontent.truframe.site` (separate registrable domain) with `sandbox="allow-scripts"` (no same-origin with the app), postMessage only with origin checks and schema validation |
| Build sandbox | Malicious `package.json` scripts, crypto mining, exfiltration, lateral movement | Builds run in Cloudflare Containers with no secrets, no platform bindings, CPU/memory/time limits (e.g. 2 vCPU, 4 GB, 5 min), egress allowlist (npm registry only), fresh container per build, output size limit; dependency installs use `--ignore-scripts` for packages not in our template allowlist (Pro users can enable scripts per project, with a warning) |
| Temp links hosting | Phishing, malware, SEO spam on `*.truframe.site` | Separate domain from app; `noindex`; Free links expire in 7 days and carry a badge; abuse report link; automated scan of builds for known phishing kit patterns and external form posts to credential-collecting endpoints; ability to take a link down instantly (KV flag) |
| Uploads | Malicious SVGs, polyglots, oversized files | MIME sniffing (magic bytes) must match the extension; allowlist PNG/JPEG/WebP/AVIF/GIF/SVG; SVG sanitized (strip scripts, event handlers, foreign objects, external refs) and served from the usercontent domain with `Content-Type` set and `Content-Security-Policy: sandbox`; size limits per plan; sha256 dedupe |
| Third-party tokens | Token theft from DB or logs | Encrypt at rest with AES-256-GCM using a key in Workers secrets (envelope: per-row data key wrapped by the master key, key version stored for rotation); never log; never send to the model, the browser or containers; GitHub App installation tokens fetched just-in-time (1-hour expiry); minimal scopes |
| Publish | Pushing to the wrong repo, overwriting user work | Only from a user click (never agents/MCP); repo + branch confirmed in the dialog; commits only (no force push, no history rewrite); if the branch has commits not made by Truframe since our last push, stop and ask |
| Agent | Prompt injection via page text, comments, skills, uploaded file names, code | Tools operate only inside the current project; no network, no shell, no publish, no billing, no cross-project access; tool outputs labeled as untrusted data; per-turn op budget (nodes, files, bytes) with pause for confirmation; user skills sanitized and shown to the user before activation; secrets redacted from code sent to the model |
| MCP | Stolen OAuth tokens, over-broad access | OAuth 2.1 with PKCE; consent lists workspace + projects + scopes (`read`, `write`); tokens short-lived with refresh rotation; revoke in Settings; per-client rate limits and monthly quotas (`docs/product/BILLING.md`); audit log of every write call |
| Billing | Webhook spoofing, plan bypass | Verify provider signature; idempotent by event id; plan limits enforced server-side in the ops validator, job enqueuers and agent/MCP meters, never only in the UI |
| Abuse / cost | Free-tier farming, build or agent abuse, DoS | Cloudflare Rate Limiting bindings per user/IP; Turnstile on signup; email verification before agent and publish; per-plan concurrency limits; Browser Rendering and build quotas; anomaly alerts on spend |
| Supply chain | Malicious or vulnerable dependencies | Lockfiles; `pnpm audit` and `cargo audit` in CI; Renovate with review; license allowlist (see `AGENTS.md`); pinned template dependencies for generated projects |
| Privacy | Leaking customer data | Data stays in Cloudflare (R2/D1/DO); model provider receives only what the user's agent run needs; no training on customer data; telemetry without content; data export and account deletion (hard delete within 30 days) |

## 3. Required controls checklist
- [x] Repository layer enforces `workspaceId` on every query (lint rule forbids importing Drizzle tables outside `packages/db/repos`). (P1-1: `forWorkspace()` repos, Biome `noRestrictedImports`; T1 API e2e in P1-7.)
- [x] Room tokens: HMAC-signed, 5-minute expiry, bound to user + project + role. (P2-5: `packages/protocol/src/room.ts`, verified in `workers/realtime` before the Durable Object; T2 in `workers/realtime/src/room.integration.test.ts`.)
- [ ] CSP and security headers on app, usercontent and sites origins (separate policies).
- [ ] Sandboxed iframes for all user code; postMessage origin + schema checks both ways.
- [ ] Build container: no secrets, egress allowlist, limits, one build per container.
- [x] Upload pipeline: sniffing, SVG sanitizer, size limits, sandbox CSP on serve. (P5-4: `packages/integrations/src/assets`, `apps/web/src/lib/server/assets.ts`; T4 green. Files are served from the app origin with `sandbox` CSP and `nosniff` until the usercontent domain exists; moving them there is part of the domain setup.)
- [ ] Token encryption with key rotation support; no tokens in logs (log redaction middleware).
- [ ] Agent and MCP tool allowlist; no publish/billing/delete-project tools; per-turn budgets.
- [ ] Webhook signature verification + idempotency.
- [ ] Rate limits on auth, uploads, agent, MCP, builds, exports.
- [ ] Turnstile on signup; email verification gating.
- [ ] Temp link takedown switch and abuse reporting.
- [ ] Audit log for publish, integration connect/disconnect, MCP grants, billing changes, deletions.
- [ ] Backups: D1 Time Travel enabled; R2 snapshots versioned; restore runbook tested.

## 4. Test checklist (gates)
| ID | Test | Gate |
|---|---|---|
| T1 | User B cannot read/write user A's project via API, room socket, R2 URL, MCP, or agent tools | P2, P7 |
| T2 | Expired/forged room token rejected | P2 |
| T3 | Embed / snippet script cannot access app cookies, storage or DOM | P6 |
| T4 | SVG with `<script>`, `onload`, `foreignObject`, external `href` is sanitized; polyglot upload rejected | P4 |
| T5 | Build container cannot reach non-allowlisted hosts or read any secret/env; build with infinite loop is killed at the limit | P8 |
| T6 | Temp link serves `noindex`; password protection works; takedown flag returns 451 | P8 |
| T7 | Integration tokens are encrypted in D1 and absent from logs (log scan test) | P8 |
| T8 | Agent with injected instructions in page text/comments/skills does not call disallowed tools or exceed budget | P7 |
| T9 | MCP token for project X cannot touch project Y; quota and rate limit enforced | P7 |
| T10 | Forged billing webhook rejected; duplicate event processed once | P9 |
| T11 | Plan limits enforced server-side when the UI is bypassed (direct API/WS) | P9 |
| T12 | Account deletion removes D1 rows, R2 objects and DO state | P9 |

## 5. Reporting
Publish `security.txt` and a disclosure policy before public beta. Until then, report to the owner directly.
