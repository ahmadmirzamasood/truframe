import { accounts, rateLimits, sessions, users, verifications } from "../schema/index.ts";

/**
 * Tables handed to Better Auth's Drizzle adapter (packages/auth). Better Auth is itself the
 * data-access layer for its own tables, so this is the one sanctioned export of table objects.
 */
export const authAdapterSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  rateLimit: rateLimits,
};
