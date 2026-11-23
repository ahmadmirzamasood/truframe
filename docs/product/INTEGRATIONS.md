# Truframe Integrations

> Agent-facing. Every integration lives in `packages/integrations/<name>` behind a small interface. OAuth tokens are encrypted at rest (see `docs/engineering/SECURITY.md`), scoped to a workspace, and revocable from Settings → Integrations.

## v1 (launch)

| Integration | Purpose | How | Plan |
|---|---|---|---|
| **Google** | Sign in | OAuth 2.0 / OIDC through Better Auth | All |
| **GitHub (login)** | Sign in | OAuth App through Better Auth, scope `read:user user:email` | All |
| **Email** | Magic link, verification, password reset, comment notifications, approval notifications | **Resend** API from a Worker; templates in `packages/emails` (React Email) | All |
| **GitHub (repo)** | Push generated code | **GitHub App** (not the login OAuth app): the user installs it on chosen repos; we use installation tokens with `contents: write`, `metadata: read`. We create the repo or use an empty existing one, commit on each publish, and never force-push | Pro |
| **Vercel** | Deploy | **Vercel Integration** (OAuth) → access token per team. If GitHub is connected: create/link a Vercel project to the repo so pushes auto-deploy. Otherwise: direct deploy via the deployments API with file upload. We read deployment status and logs to show in Publish | Pro; Free: 1 project, direct deploy with badge |
| **Polar** | Subscriptions, checkout, portal, usage | Hosted checkout + webhooks | All |
| **Anthropic** | Built-in agent models | API from the agent Durable Object; BYO key for Pro | All |
| **Google Fonts** | Font picker, self-hosted in generated code (`next/font/google`, Astro font files) | Static font list synced daily to R2 | All |
| **Iconify** | Icon picker (Lucide, Phosphor, etc.) | Icons inlined as SVG components in generated code; proxy + cache via Worker | All |
| **Unsplash** | Stock photos in the Assets panel | API through a Worker proxy; follow their attribution and hotlinking rules (download into R2 when inserted, trigger the download endpoint) | All |
| **MCP clients** (Claude Code, Cursor, Claude Desktop, etc.) | External agents | Remote MCP server with OAuth (per-workspace consent) | All, metered |

## Next (post-launch, by expected demand)
1. **Netlify** and **Cloudflare Workers** publishing (same Publish interface as Vercel).
2. **Custom domains** for Truframe-hosted sites.
3. **Figma** import (frames → stacks, styles → variables) via Figma REST API.
4. **Analytics**: Vercel Analytics toggle in generated code; Plausible / Umami snippet option.
5. **Forms**: built-in form handling (Workers + D1) or Formspree; email notifications via Resend.
6. **CMS**: Sanity / Contentful bindings for CMS collections (after native CMS collections).
7. **Slack / Discord**: comment and approval notifications.
8. **Lottie / Rive** embeds.

## Integration interface
```ts
interface PublishTarget {
  id: 'vercel' | 'netlify' | 'cloudflare';
  connect(workspaceId): Promise<ConnectResult>;           // OAuth start
  listProjects(conn): Promise<RemoteProject[]>;
  deploy(conn, build: BuildArtifact | GitRef): Promise<DeploymentId>;
  status(conn, id): AsyncIterable<DeployEvent>;           // streamed to the Publish dialog
  disconnect(conn): Promise<void>;
}
```
`GitProvider` (GitHub now, GitLab/Bitbucket later) and `AuthProvider` follow the same pattern. Adding a host should not touch the editor beyond a new option in the Publish menu.
