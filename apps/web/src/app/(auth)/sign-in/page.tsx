import { enabledOAuthProviders, turnstileSiteKey } from "@truframe/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MagicLinkForm, OAuthButtons, PasswordSignInForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/safe-next";
import { getServerContext } from "@/lib/server/context";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sign in · Truframe" };

const NOTICES: Record<string, string> = {
  oauth:
    "That sign-in didn't work. If you already have an account with this email, sign in the way you did before, or use an email link.",
  link: "That sign-in link is invalid or has expired. Ask for a new one.",
};

export default async function SignInPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.searchParams;
  const next = safeNext(params.next);
  if (await getSession()) redirect(next);
  const { authEnv } = await getServerContext();
  const error = typeof params.error === "string" ? (NOTICES[params.error] ?? NOTICES.oauth) : null;
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          New to Truframe?{" "}
          <a className="underline underline-offset-4" href="/sign-up">
            Create an account
          </a>
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {error}
        </p>
      ) : null}
      {params.reset ? (
        <p role="status" className="rounded-md border p-3 text-sm">
          Password changed. Sign in with your new password.
        </p>
      ) : null}
      <OAuthButtons providers={enabledOAuthProviders(authEnv)} next={next} />
      <PasswordSignInForm next={next} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <MagicLinkForm siteKey={turnstileSiteKey(authEnv)} next={next} />
    </>
  );
}
