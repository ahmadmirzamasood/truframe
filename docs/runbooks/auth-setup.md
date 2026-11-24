# Auth setup (owner)

Truframe signs users in with Google, GitHub, email + password and email magic links (Better Auth). Locally, everything runs without real accounts: Google and GitHub are mocked, emails are printed instead of sent, and Turnstile uses Cloudflare's test keys. A deployed environment (staging, production) needs the accounts and keys below. The app refuses to start auth on a deployed environment if any of them is missing, if Turnstile test keys are set, or if the mock is on (`packages/auth/src/env.ts`).

Never paste these values into chat, commits or issues. Put them in Cloudflare as Worker secrets (step 6).

## What to create (once per environment)

Replace `<APP_URL>` with the environment's app origin, e.g. `https://staging.truframe.com` (staging) or `https://app.truframe.com` (production).

### 1. Auth secret
- Generate one per environment: `openssl rand -base64 32`.
- Secret name: `BETTER_AUTH_SECRET`. Var: `BETTER_AUTH_URL=<APP_URL>`.
- Changing the secret signs everyone out.

### 2. Google OAuth client
1. Google Cloud console → APIs & Services → OAuth consent screen. App name "Truframe", support email, and the scopes `email`, `profile`, `openid` only. Publish the app when you leave testing.
2. Credentials → Create credentials → OAuth client ID → **Web application**.
   - Authorized JavaScript origin: `<APP_URL>`
   - Authorized redirect URI: `<APP_URL>/api/auth/callback/google`
3. Secret names: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### 3. GitHub OAuth app
1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App. Use the organization that will own Truframe if there is one. This is not the GitHub App used for publishing in P9.
   - Homepage URL: `<APP_URL>`
   - Authorization callback URL: `<APP_URL>/api/auth/callback/github`
2. Generate a client secret.
3. Secret names: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
4. Truframe requests `read:user` and `user:email`. GitHub may report an email as unverified; such an email is **not** linked to an existing account (by design).

### 4. Resend (email)
1. Create a Resend account and add the sending domain (e.g. `mail.truframe.com`). Add the DNS records Resend shows (SPF, DKIM, and optionally DMARC) and wait until the domain is verified.
2. Create an API key with **Sending access** only, restricted to that domain.
3. Secret: `RESEND_API_KEY`. Var: `EMAIL_FROM`, e.g. `Truframe <hello@mail.truframe.com>`.

### 5. Cloudflare Turnstile
1. Cloudflare dashboard → Turnstile → Add widget. Hostnames: the app host(s) for that environment. Mode: **Managed**.
2. Var: `TURNSTILE_SITE_KEY` (public). Secret: `TURNSTILE_SECRET_KEY`.
3. Turnstile guards the endpoints that can create an account: `/api/auth/sign-up/email` and `/api/auth/sign-in/magic-link`.

### 6. Put them on the Worker
From `apps/web`, for each environment (`staging` shown):
```
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --env staging
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --env staging
pnpm exec wrangler secret put RESEND_API_KEY --env staging
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env staging
```
Non-secret values (`BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY`) can also be secrets, or `vars` in that env of `apps/web/wrangler.jsonc`. Don't set `TRUFRAME_OAUTH_MOCK` on deployed environments.

Then apply the database migrations (needs the Cloudflare connection from `cloudflare-setup.md`):
```
pnpm --filter @truframe/web exec wrangler d1 migrations apply DB --remote --env staging
```

### 7. Check it on staging
- Sign up with email + password; the verification email arrives from `EMAIL_FROM`; the link signs you in.
- Request a magic link from `/sign-in`; it signs you in.
- "Continue with Google" and "Continue with GitHub" each land on `/dashboard`.
- Sign in with Google using the same email as the password account: you get the same account, not a new one.

## Local development
`apps/web/.dev.vars.example` (copied to `.dev.vars`) is ready to use:
- `TRUFRAME_OAUTH_MOCK=1` replaces Google and GitHub with a local consent page at `/api/dev/oauth/authorize`. Better Auth still runs its real OAuth flow (state, PKCE, callback, linking).
- With no `RESEND_API_KEY`, emails print to the `pnpm dev` log (`[dev email] ... link=...`) and can be read at `/api/dev/mail?to=<email>`. Both dev routes return 404 outside local.
- Turnstile test keys always pass. The widget still loads from `challenges.cloudflare.com`, so local sign-up needs internet.
- To try real Google/GitHub locally, create separate dev OAuth apps with `http://localhost:3000/api/auth/callback/<provider>`, fill the `*_CLIENT_ID/SECRET` values and clear `TRUFRAME_OAUTH_MOCK`.
