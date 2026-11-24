"use client";

import { Button } from "@truframe/ui/components/button";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { useTurnstile } from "./turnstile";

type Provider = "google" | "github";
const PROVIDER_LABEL: Record<Provider, string> = { google: "Google", github: "GitHub" };

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null | undefined>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const message = await fn();
      if (message) setError(message);
    } catch {
      setError("We couldn't reach Truframe. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

export function OAuthButtons({ providers, next }: { providers: Provider[]; next: string }) {
  const { pending, error, run } = useSubmit();
  if (providers.length === 0) return null;
  return (
    <div className="grid gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const { error } = await authClient.signIn.social({
                provider,
                callbackURL: next,
                errorCallbackURL: "/sign-in?error=oauth",
              });
              return error ? authErrorMessage(error) : null;
            })
          }
        >
          Continue with {PROVIDER_LABEL[provider]}
        </Button>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function PasswordSignInForm({ next }: { next: string }) {
  const router = useRouter();
  const { pending, error, run } = useSubmit();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const { error } = await authClient.signIn.email({
        email: field(form, "email"),
        password: String(form.get("password") ?? ""),
      });
      if (error) return authErrorMessage(error);
      router.push(next);
      router.refresh();
      return null;
    });
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-label="Sign in with password">
      <div className="grid gap-1.5">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="signin-password">Password</Label>
          <a href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
            Forgot password?
          </a>
        </div>
        <Input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function MagicLinkForm({ siteKey, next }: { siteKey: string | null; next: string }) {
  const captcha = useTurnstile(siteKey);
  const { pending, error, run } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = field(form, "email");
    run(async () => {
      if (captcha.enabled && !captcha.token) return "Wait for the security check to finish.";
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: next,
        errorCallbackURL: "/sign-in?error=link",
        fetchOptions: captcha.token ? { headers: { "x-captcha-response": captcha.token } } : {},
      });
      captcha.reset();
      if (error) return authErrorMessage(error);
      setSentTo(email);
      return null;
    });
  };
  if (sentTo) {
    return (
      <p role="status" className="text-sm">
        Check <strong>{sentTo}</strong> for a sign-in link. It expires in 5 minutes.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-label="Email me a sign-in link">
      <div className="grid gap-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input id="magic-email" name="email" type="email" autoComplete="email" required />
      </div>
      {captcha.slot}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

export function SignUpForm({ siteKey }: { siteKey: string | null }) {
  const router = useRouter();
  const captcha = useTurnstile(siteKey);
  const { pending, error, run } = useSubmit();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = field(form, "email");
    run(async () => {
      if (captcha.enabled && !captcha.token) return "Wait for the security check to finish.";
      const { error } = await authClient.signUp.email({
        name: field(form, "name"),
        email,
        password: String(form.get("password") ?? ""),
        callbackURL: "/dashboard",
        fetchOptions: captcha.token ? { headers: { "x-captcha-response": captcha.token } } : {},
      });
      captcha.reset();
      if (error) return authErrorMessage(error);
      router.push(`/check-email?email=${encodeURIComponent(email)}`);
      return null;
    });
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-label="Create account">
      <div className="grid gap-1.5">
        <Label htmlFor="signup-name">Name</Label>
        <Input id="signup-name" name="name" autoComplete="name" required maxLength={100} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          aria-describedby="signup-password-hint"
        />
        <p id="signup-password-hint" className="text-xs text-muted-foreground">
          At least 10 characters.
        </p>
      </div>
      {captcha.slot}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { pending, error, run } = useSubmit();
  const [sent, setSent] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const { error } = await authClient.requestPasswordReset({
        email: field(form, "email"),
        redirectTo: "/reset-password",
      });
      if (error) return authErrorMessage(error);
      setSent(true);
      return null;
    });
  };
  if (sent) {
    return (
      <p role="status" className="text-sm">
        If an account uses that email, we sent a link to reset the password.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-label="Reset password">
      <div className="grid gap-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { pending, error, run } = useSubmit();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      const { error } = await authClient.resetPassword({
        newPassword: String(form.get("password") ?? ""),
        token,
      });
      if (error) return authErrorMessage(error);
      router.push("/sign-in?reset=1");
      return null;
    });
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-3" aria-label="Choose a new password">
      <div className="grid gap-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
