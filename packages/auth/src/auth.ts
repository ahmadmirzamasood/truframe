import { authAdapterSchema, authUsersRepo, type Db, uuidv7, workspacesRepo } from "@truframe/db";
import { type AuthEmail, type EmailSender, renderAuthEmail } from "@truframe/emails";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { captcha, genericOAuth, magicLink } from "better-auth/plugins";
import type { AuthEnv } from "./env.ts";
import { mockOAuthConfig } from "./mock-oauth.ts";

export type CreateAuthOptions = {
  db: Db;
  env: AuthEnv;
  email: EmailSender;
  /** Runs email sends after the response (Workers `ctx.waitUntil`); awaited when absent. */
  waitUntil?: (promise: Promise<unknown>) => void;
};

export const PERSONAL_WORKSPACE_NAME = "Personal";

/** Endpoints that need a Turnstile token: the ones that can create an account. */
export const CAPTCHA_ENDPOINTS = ["/sign-up/email", "/sign-in/magic-link"];

/**
 * Per-IP limits on top of Better Auth's default (100 per 10 s). Stored in D1, so they hold
 * across Worker isolates. Paths are relative to /api/auth.
 */
export const AUTH_RATE_LIMITS = {
  "/sign-in/email": { window: 60, max: 10 },
  "/sign-up/email": { window: 60, max: 5 },
  "/sign-in/magic-link": { window: 60, max: 5 },
  "/request-password-reset": { window: 60, max: 5 },
  "/send-verification-email": { window: 60, max: 5 },
  "/sign-in/social": { window: 60, max: 20 },
} as const;

export function createAuth(options: CreateAuthOptions) {
  const { db, env } = options;
  const users = authUsersRepo(db);
  const local = env.TRUFRAME_ENV === "local";

  const send = async (email: AuthEmail) => {
    const job = renderAuthEmail(email).then((m) => options.email.send(m));
    if (options.waitUntil) {
      // Errors are logged without the address or link.
      options.waitUntil(job.catch((e: unknown) => console.error("auth email failed", String(e))));
    } else {
      await job;
    }
  };

  const plugins = [
    magicLink({
      expiresIn: 300,
      sendMagicLink: async ({ email, url }) => send({ kind: "magic-link", to: email, url }),
    }),
    ...(env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: env.TURNSTILE_SECRET_KEY,
            endpoints: CAPTCHA_ENDPOINTS,
          }),
        ]
      : []),
    ...(env.TRUFRAME_OAUTH_MOCK === "1"
      ? [genericOAuth({ config: mockOAuthConfig(env.BETTER_AUTH_URL) })]
      : []),
    // Must stay last: applies Set-Cookie from server actions.
    nextCookies(),
  ];

  return betterAuth({
    appName: "Truframe",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "sqlite", schema: authAdapterSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send({ kind: "reset-password", to: user.email, url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        send({ kind: "verify-email", to: user.email, url }),
    },
    socialProviders:
      env.TRUFRAME_OAUTH_MOCK === "1"
        ? {}
        : {
            ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
              ? {
                  google: {
                    clientId: env.GOOGLE_CLIENT_ID,
                    clientSecret: env.GOOGLE_CLIENT_SECRET,
                    prompt: "select_account" as const,
                  },
                }
              : {}),
            ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
              ? {
                  github: {
                    clientId: env.GITHUB_CLIENT_ID,
                    clientSecret: env.GITHUB_CLIENT_SECRET,
                  },
                }
              : {}),
          },
    account: {
      // Link a new Google/GitHub sign-in to an existing user only when the provider says the
      // email is verified (no trustedProviders). See the account.create hook below.
      // requireLocalEmailVerified: false lets the real owner in over an unverified sign-up; the
      // account.create hook then removes that unverified password and its sessions.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        allowDifferentEmails: false,
        requireLocalEmailVerified: false,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 10,
      max: 100,
      customRules: AUTH_RATE_LIMITS,
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      // Cloudflare sets cf-connecting-ip and overwrites any client value. Locally there is no
      // proxy, so e2e can set x-forwarded-for to act as different clients.
      ipAddress: { ipAddressHeaders: local ? ["x-forwarded-for"] : ["cf-connecting-ip"] },
      useSecureCookies: !local,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: !local },
    },
    databaseHooks: {
      user: {
        create: {
          // Every user gets a personal workspace at signup (idempotent; `resolveWorkspace`
          // also creates it lazily if this hook ever failed).
          after: async (user) => {
            await workspacesRepo(db).ensurePersonal({
              userId: user.id,
              name: PERSONAL_WORKSPACE_NAME,
            });
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            // A verified identity (OAuth, magic link) is being attached. If the user row was
            // created by an email+password sign-up that never verified, drop that password
            // and its sessions first, so the address's real owner gets the account alone.
            if (account.providerId !== "credential") {
              const user = await users.get(account.userId);
              if (user && !user.emailVerified) await users.dropUnverifiedCredentials(user.id);
            }
            return { data: account };
          },
        },
      },
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
