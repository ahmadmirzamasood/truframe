import { z } from "zod";

/** Turnstile's published test keys (always pass). Local and CI only. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

/**
 * Auth-related Worker vars and secrets. Names are documented in apps/web/.dev.vars.example and
 * docs/runbooks/auth-setup.md. Read per request from the Cloudflare env, never from the client.
 */
export const authEnvSchema = z
  .object({
    TRUFRAME_ENV: z.enum(["local", "staging", "production"]).default("local"),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    GITHUB_CLIENT_ID: optional,
    GITHUB_CLIENT_SECRET: optional,
    TURNSTILE_SITE_KEY: optional,
    TURNSTILE_SECRET_KEY: optional,
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,
    /** `1` replaces Google and GitHub with a local mock provider (e2e). Local only. */
    TRUFRAME_OAUTH_MOCK: optional,
  })
  .superRefine((env, ctx) => {
    const deployed = env.TRUFRAME_ENV !== "local";
    if (deployed && env.TRUFRAME_OAUTH_MOCK === "1") {
      ctx.addIssue({ code: "custom", message: "TRUFRAME_OAUTH_MOCK is only allowed locally" });
    }
    if (deployed && !env.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", message: "BETTER_AUTH_URL must be https outside local" });
    }
    if (deployed && (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY)) {
      ctx.addIssue({ code: "custom", message: "Turnstile keys are required outside local" });
    }
    if (
      deployed &&
      [env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY].some((k) => k?.startsWith("1x0000"))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Turnstile test keys are not allowed outside local",
      });
    }
    if (deployed && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", message: "RESEND_API_KEY is required outside local" });
    }
    for (const p of ["GOOGLE", "GITHUB"] as const) {
      if (Boolean(env[`${p}_CLIENT_ID`]) !== Boolean(env[`${p}_CLIENT_SECRET`])) {
        ctx.addIssue({ code: "custom", message: `Set both ${p}_CLIENT_ID and ${p}_CLIENT_SECRET` });
      }
    }
  });

export type AuthEnv = z.infer<typeof authEnvSchema>;

export class AuthConfigError extends Error {}

/** Parses the env; the error lists variable names and problems, never values. */
export function parseAuthEnv(raw: Record<string, unknown>): AuthEnv {
  const result = authEnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
    );
    throw new AuthConfigError(`Auth configuration is invalid: ${problems.join("; ")}`);
  }
  return result.data;
}

export type OAuthProviderId = "google" | "github";

/** Providers the sign-in page should offer (configured or mocked). */
export function enabledOAuthProviders(env: AuthEnv): OAuthProviderId[] {
  if (env.TRUFRAME_OAUTH_MOCK === "1") return ["google", "github"];
  const out: OAuthProviderId[] = [];
  if (env.GOOGLE_CLIENT_ID) out.push("google");
  if (env.GITHUB_CLIENT_ID) out.push("github");
  return out;
}

/** The Turnstile site key the browser should use, or null when Turnstile is off. */
export function turnstileSiteKey(env: AuthEnv): string | null {
  return env.TURNSTILE_SITE_KEY ?? null;
}
