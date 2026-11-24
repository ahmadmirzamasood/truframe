import type { EmailMessage } from "./messages.tsx";

export type EmailSender = { send(message: EmailMessage): Promise<void> };

export type SenderConfig = {
  /** `local` allows the dev sender; `staging`/`production` require Resend. */
  env: string;
  resendApiKey?: string;
  from?: string;
  /** Local only: where the dev sender keeps messages (e2e reads them back). */
  devOutbox?: (message: EmailMessage) => Promise<void>;
  fetch?: typeof fetch;
};

export class EmailConfigError extends Error {}

/** Resend over its REST API (no SDK: one fetch call, nothing to bundle). */
export function resendSender(config: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailSender {
  const doFetch = config.fetch ?? fetch;
  return {
    async send(message) {
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      // The body may echo the address; status is enough for logs.
      if (!res.ok) throw new Error(`Resend rejected the email (HTTP ${res.status})`);
    },
  };
}

/** Logs to the console and keeps the message in the dev outbox. Never used outside local. */
export function devSender(outbox?: (message: EmailMessage) => Promise<void>): EmailSender {
  return {
    async send(message) {
      const link = message.text.match(/https?:\/\/\S+/)?.[0] ?? "(no link)";
      console.info(`[dev email] to=${message.to} subject="${message.subject}" link=${link}`);
      await outbox?.(message);
    },
  };
}

export function createEmailSender(config: SenderConfig): EmailSender {
  if (config.resendApiKey) {
    if (!config.from)
      throw new EmailConfigError("EMAIL_FROM is required when RESEND_API_KEY is set");
    return resendSender({ apiKey: config.resendApiKey, from: config.from, fetch: config.fetch });
  }
  if (config.env === "local") return devSender(config.devOutbox);
  throw new EmailConfigError(
    `RESEND_API_KEY is not set for env "${config.env}". See docs/runbooks/auth-setup.md.`,
  );
}
