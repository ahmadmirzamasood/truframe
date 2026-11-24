import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email · Truframe" };

export default async function CheckEmailPage(props: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await props.searchParams;
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="text-sm text-muted-foreground">
        We sent a verification link to {email ? <strong>{email}</strong> : "your email"}. Open it to
        finish creating your account. The link expires in 1 hour.
      </p>
      <a className="text-sm underline underline-offset-4" href="/sign-in">
        Back to sign in
      </a>
    </div>
  );
}
