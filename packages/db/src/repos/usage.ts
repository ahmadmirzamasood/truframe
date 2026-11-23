import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { usage } from "../schema/index.ts";

/** Usage counters for one workspace. `period` is e.g. `2026-11` (monthly) or `all`. */
export function usageRepo(db: Db, workspaceId: string) {
  return {
    async get(period: string, metric: string): Promise<number> {
      const rows = await db
        .select({ count: usage.count })
        .from(usage)
        .where(
          and(
            eq(usage.workspaceId, workspaceId),
            eq(usage.period, period),
            eq(usage.metric, metric),
          ),
        )
        .limit(1);
      return rows[0]?.count ?? 0;
    },

    /** Atomic upsert-increment; returns the new count. */
    async increment(period: string, metric: string, by = 1): Promise<number> {
      const rows = await db
        .insert(usage)
        .values({ workspaceId, period, metric, count: by })
        .onConflictDoUpdate({
          target: [usage.workspaceId, usage.period, usage.metric],
          set: { count: sql`${usage.count} + ${by}` },
        })
        .returning({ count: usage.count });
      return rows[0]?.count ?? by;
    },
  };
}
