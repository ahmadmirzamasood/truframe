import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type AuthEnv, createAuth, parseAuthEnv } from "@truframe/auth";
import { createDb, type Db } from "@truframe/db";
import { createEmailSender, type EmailMessage } from "@truframe/emails";
import { cache } from "react";

/** Dev outbox in KV so e2e (and you) can read emails sent locally. Local env only. */
export const DEV_MAIL_PREFIX = "dev-mail:";

async function storeDevMail(kv: KVNamespace, message: EmailMessage): Promise<void> {
  const key = `${DEV_MAIL_PREFIX}${message.to.toLowerCase()}`;
  const previous = (await kv.get<EmailMessage[]>(key, "json")) ?? [];
  await kv.put(key, JSON.stringify([...previous, message].slice(-10)), { expirationTtl: 3600 });
}

export type ServerContext = {
  env: CloudflareEnv;
  authEnv: AuthEnv;
  db: Db;
  auth: ReturnType<typeof createAuth>;
};

/** Per-request server context: bindings, validated auth env, D1 and Better Auth. */
export const getServerContext = cache(async (): Promise<ServerContext> => {
  const { env, ctx } = await getCloudflareContext({ async: true });
  const authEnv = parseAuthEnv(env as unknown as Record<string, unknown>);
  const db = createDb(env.DB);
  const email = createEmailSender({
    env: authEnv.TRUFRAME_ENV,
    resendApiKey: authEnv.RESEND_API_KEY,
    from: authEnv.EMAIL_FROM,
    devOutbox: authEnv.TRUFRAME_ENV === "local" ? (m) => storeDevMail(env.CONFIG, m) : undefined,
  });
  const auth = createAuth({
    db,
    env: authEnv,
    email,
    waitUntil: authEnv.TRUFRAME_ENV === "local" ? undefined : (p) => ctx.waitUntil(p),
  });
  return { env, authEnv, db, auth };
});
