import { describe, expect, it } from "vitest";
import { AuthConfigError, enabledOAuthProviders, parseAuthEnv } from "./env.ts";
import { decodeMockCode, encodeMockCode } from "./mock-oauth.ts";

const base = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
};
const deployed = {
  TRUFRAME_ENV: "staging",
  BETTER_AUTH_URL: "https://staging.truframe.com",
  BETTER_AUTH_SECRET: "x".repeat(32),
  TURNSTILE_SITE_KEY: "0x4AAAAAAA",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAA-secret",
  RESEND_API_KEY: "re_real",
};

describe("parseAuthEnv", () => {
  it("accepts a minimal local env", () => {
    expect(parseAuthEnv(base).TRUFRAME_ENV).toBe("local");
  });

  it("accepts a complete deployed env", () => {
    expect(parseAuthEnv(deployed).TRUFRAME_ENV).toBe("staging");
  });

  it.each([
    [{ TRUFRAME_OAUTH_MOCK: "1" }, /TRUFRAME_OAUTH_MOCK/],
    [{ BETTER_AUTH_URL: "http://staging.truframe.com" }, /https/],
    [{ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }, /test keys/],
    [{ RESEND_API_KEY: "" }, /RESEND_API_KEY/],
    [{ GOOGLE_CLIENT_ID: "id" }, /GOOGLE_CLIENT_SECRET/],
  ])("rejects unsafe deployed config %o", (override, message) => {
    expect(() => parseAuthEnv({ ...deployed, ...override })).toThrow(message);
  });

  it("never echoes secret values in errors", () => {
    try {
      parseAuthEnv({ ...base, BETTER_AUTH_SECRET: "tooshort-secret-value" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AuthConfigError);
      expect(String(e)).not.toContain("tooshort-secret-value");
    }
  });

  it("lists configured or mocked OAuth providers", () => {
    expect(enabledOAuthProviders(parseAuthEnv(base))).toEqual([]);
    expect(
      enabledOAuthProviders(
        parseAuthEnv({ ...base, GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b" }),
      ),
    ).toEqual(["github"]);
    expect(enabledOAuthProviders(parseAuthEnv({ ...base, TRUFRAME_OAUTH_MOCK: "1" }))).toEqual([
      "google",
      "github",
    ]);
  });
});

describe("mock OAuth code", () => {
  it("round-trips a profile and rejects junk", () => {
    const profile = { sub: "1", email: "zoe@example.com", name: "Zoë", emailVerified: true };
    expect(decodeMockCode(encodeMockCode("google", profile))).toEqual({
      provider: "google",
      ...profile,
    });
    expect(decodeMockCode("not-a-code")).toBeNull();
  });
});
