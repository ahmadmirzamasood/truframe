import { desc, eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { uuidv7 } from "../ids.ts";
import { auditLog } from "../schema/index.ts";

export type AuditEntry = typeof auditLog.$inferSelect;

export function auditRepo(db: Db, workspaceId: string) {
  return {
    async record(input: {
      actorUserId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      meta?: Record<string, unknown>;
      now?: Date;
    }): Promise<void> {
      const now = input.now ?? new Date();
      await db.insert(auditLog).values({
        id: uuidv7(now.getTime()),
        workspaceId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        meta: input.meta ?? null,
        createdAt: now,
      });
    },

    async list(limit = 50): Promise<AuditEntry[]> {
      return db
        .select()
        .from(auditLog)
        .where(eq(auditLog.workspaceId, workspaceId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);
    },
  };
}
