import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser auth client; talks to /api/auth on the same origin. */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });

/** Turns a Better Auth error into copy for the form (what happened, what to do). */
export function authErrorMessage(error: {
  status?: number;
  message?: string;
  code?: string;
}): string {
  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (error.status === 403 && /verif/i.test(error.message ?? ""))
    return "Verify your email first. We sent you a link; check your inbox and spam folder.";
  if (error.code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don't match.";
  if (error.code === "USER_ALREADY_EXISTS")
    return "An account with this email already exists. Sign in instead.";
  if (/captcha/i.test(error.message ?? "") || /captcha/i.test(error.code ?? ""))
    return "The security check failed. Reload the page and try again.";
  return error.message || "Something went wrong. Try again.";
}
