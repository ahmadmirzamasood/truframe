/**
 * Local-only stand-in for Google and GitHub OAuth, used by e2e and `pnpm dev` without real
 * OAuth apps. Better Auth runs its real OAuth flow (state, PKCE, callback, account linking);
 * only the provider is replaced. The "authorization code" is the chosen profile, encoded, so
 * it is forgeable by design: `parseAuthEnv` refuses TRUFRAME_OAUTH_MOCK outside local.
 */
import type { GenericOAuthConfig } from "better-auth/plugins";
import { z } from "zod";
import type { OAuthProviderId } from "./env.ts";

export const MOCK_AUTHORIZE_PATH = "/api/dev/oauth/authorize";

export const mockProfileSchema = z.object({
  sub: z.string().min(1).max(64),
  email: z.email(),
  name: z.string().min(1).max(100),
  emailVerified: z.boolean(),
});
export type MockProfile = z.infer<typeof mockProfileSchema>;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const b64 = code.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeMockCode(provider: OAuthProviderId, profile: MockProfile): string {
  return toBase64Url(JSON.stringify({ provider, ...profile }));
}

export function decodeMockCode(code: string): (MockProfile & { provider: string }) | null {
  try {
    const parsed = JSON.parse(fromBase64Url(code)) as unknown;
    const profile = mockProfileSchema.extend({ provider: z.string() }).safeParse(parsed);
    return profile.success ? profile.data : null;
  } catch {
    return null;
  }
}

export function mockOAuthConfig(baseURL: string): GenericOAuthConfig[] {
  return (["google", "github"] as const).map((provider) => ({
    providerId: provider,
    clientId: `mock-${provider}`,
    clientSecret: `mock-${provider}`,
    authorizationUrl: `${baseURL}${MOCK_AUTHORIZE_PATH}?provider=${provider}`,
    scopes: ["email", "profile"],
    pkce: true,
    getToken: async ({ code }) => ({ accessToken: code, tokenType: "Bearer" }),
    getUserInfo: async (tokens) => {
      const profile = tokens.accessToken ? decodeMockCode(tokens.accessToken) : null;
      if (!profile || profile.provider !== provider) return null;
      return {
        id: `${provider}-${profile.sub}`,
        email: profile.email,
        name: profile.name,
        emailVerified: profile.emailVerified,
      };
    },
  }));
}
