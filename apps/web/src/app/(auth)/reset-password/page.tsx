import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Choose a new password · Truframe" };

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await props.searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p role="alert" className="text-sm">
          This reset link is invalid or has expired.{" "}
          <a className="underline underline-offset-4" href="/forgot-password">
            Ask for a new one
          </a>
          .
        </p>
      )}
    </>
  );
}
