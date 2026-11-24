import { enabledOAuthProviders, turnstileSiteKey } from "@truframe/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OAuthButtons, SignUpForm } from "@/components/auth/auth-forms";
import { getServerContext } from "@/lib/server/context";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Create account · Truframe" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  const { authEnv } = await getServerContext();
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Already have one?{" "}
          <a className="underline underline-offset-4" href="/sign-in">
            Sign in
          </a>
        </p>
      </div>
      <OAuthButtons providers={enabledOAuthProviders(authEnv)} next="/dashboard" />
      <SignUpForm siteKey={turnstileSiteKey(authEnv)} />
    </>
  );
}
