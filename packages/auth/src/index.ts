/** Better Auth configuration (Google, GitHub, email magic link + password). */
export { AUTH_RATE_LIMITS, type Auth, CAPTCHA_ENDPOINTS, createAuth } from "./auth.ts";
export {
  AuthConfigError,
  type AuthEnv,
  enabledOAuthProviders,
  type OAuthProviderId,
  parseAuthEnv,
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  turnstileSiteKey,
} from "./env.ts";
export {
  decodeMockCode,
  encodeMockCode,
  MOCK_AUTHORIZE_PATH,
  type MockProfile,
  mockProfileSchema,
} from "./mock-oauth.ts";
