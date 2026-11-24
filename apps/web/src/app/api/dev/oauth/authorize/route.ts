import { encodeMockCode, mockProfileSchema } from "@truframe/auth";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

const PROVIDERS = { google: "Google", github: "GitHub" } as const;
type Provider = keyof typeof PROVIDERS;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function guard(): Promise<{ baseURL: string } | Response> {
  const { authEnv } = await getServerContext();
  if (authEnv.TRUFRAME_ENV !== "local" || authEnv.TRUFRAME_OAUTH_MOCK !== "1") {
    return new Response("Not found", { status: 404 });
  }
  return { baseURL: authEnv.BETTER_AUTH_URL };
}

function isProvider(p: string | null): p is Provider {
  return p === "google" || p === "github";
}

/** Local mock of the provider's consent screen (TRUFRAME_OAUTH_MOCK=1). */
export async function GET(request: Request): Promise<Response> {
  const g = await guard();
  if (g instanceof Response) return g;
  const q = new URL(request.url).searchParams;
  const provider = q.get("provider");
  const redirectUri = q.get("redirect_uri") ?? "";
  if (!isProvider(provider) || !redirectUri.startsWith(`${g.baseURL}/api/auth/callback/`)) {
    return new Response("Bad request", { status: 400 });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mock ${PROVIDERS[provider]} sign-in</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui;max-width:420px;margin:48px auto;padding:0 16px">
<h1>Mock ${PROVIDERS[provider]}</h1>
<p>Local development only. Pick the identity ${PROVIDERS[provider]} should return.</p>
<form method="post" style="display:grid;gap:12px">
<input type="hidden" name="provider" value="${provider}">
<input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
<input type="hidden" name="state" value="${esc(q.get("state") ?? "")}">
<label>Email <input name="email" type="email" required value="dev@example.com"></label>
<label>Name <input name="name" required value="Dev User"></label>
<label><input name="email_verified" type="checkbox" checked> Email verified</label>
<button type="submit">Continue</button>
</form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  const g = await guard();
  if (g instanceof Response) return g;
  const form = await request.formData();
  const provider = String(form.get("provider"));
  const redirectUri = String(form.get("redirect_uri") ?? "");
  if (!isProvider(provider) || !redirectUri.startsWith(`${g.baseURL}/api/auth/callback/`)) {
    return new Response("Bad request", { status: 400 });
  }
  const email = String(form.get("email") ?? "").toLowerCase();
  const profile = mockProfileSchema.safeParse({
    sub: email,
    email,
    name: String(form.get("name") ?? ""),
    emailVerified: form.get("email_verified") === "on",
  });
  if (!profile.success) return new Response("Invalid profile", { status: 400 });
  const target = new URL(redirectUri);
  target.searchParams.set("code", encodeMockCode(provider, profile.data));
  target.searchParams.set("state", String(form.get("state") ?? ""));
  return Response.redirect(target.toString(), 302);
}
