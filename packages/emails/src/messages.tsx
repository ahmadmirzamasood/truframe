import { render, toPlainText } from "@react-email/render";
import { ActionEmail } from "./templates/action-email.tsx";

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export type AuthEmail =
  | { kind: "verify-email"; to: string; url: string }
  | { kind: "magic-link"; to: string; url: string }
  | { kind: "reset-password"; to: string; url: string };

const COPY = {
  "verify-email": {
    subject: "Verify your email for Truframe",
    heading: "Verify your email",
    intro: "Confirm this address to finish creating your Truframe account.",
    action: "Verify email",
    expiry: "1 hour",
  },
  "magic-link": {
    subject: "Your Truframe sign-in link",
    heading: "Sign in to Truframe",
    intro: "Use this link to sign in. It works once.",
    action: "Sign in",
    expiry: "5 minutes",
  },
  "reset-password": {
    subject: "Reset your Truframe password",
    heading: "Reset your password",
    intro: "Someone asked to reset the password for this account. Choose a new one here.",
    action: "Choose a new password",
    expiry: "1 hour",
  },
} as const;

export async function renderAuthEmail(email: AuthEmail): Promise<EmailMessage> {
  const copy = COPY[email.kind];
  const html = await render(
    <ActionEmail
      preview={copy.intro}
      heading={copy.heading}
      intro={copy.intro}
      action={copy.action}
      url={email.url}
      expiry={copy.expiry}
    />,
  );
  return { to: email.to, subject: copy.subject, html, text: toPlainText(html) };
}
