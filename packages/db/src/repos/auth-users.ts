import { and, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { accounts, sessions, users } from "../schema/index.ts";

export type AuthUser = typeof users.$inferSelect;

/** User-level auth helpers that Better Auth's hooks need (not workspace data). */
export function authUsersRepo(db: Db) {
  return {
    async get(userId: string): Promise<AuthUser | null> {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return rows[0] ?? null;
    },

    async findByEmail(email: string): Promise<AuthUser | null> {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * Removes the password login and every session of an account whose email was never
     * verified. Called before a verified identity is linked to it, so whoever registered the
     * address first without proving it cannot keep a way in (account pre-hijacking).
     */
    async dropUnverifiedCredentials(userId: string): Promise<void> {
      await db.batch([
        db
          .delete(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"))),
        db.delete(sessions).where(eq(sessions.userId, userId)),
      ]);
    },

    async providers(userId: string): Promise<string[]> {
      const rows = await db
        .select({ providerId: accounts.providerId })
        .from(accounts)
        .where(eq(accounts.userId, userId));
      return rows.map((r) => r.providerId).sort();
    },
  };
}
