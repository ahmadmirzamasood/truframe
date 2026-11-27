import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { assets } from "../schema/index.ts";

export type AssetRow = typeof assets.$inferSelect;
export type NewAsset = Omit<AssetRow, "workspaceId" | "createdAt"> & { createdAt?: Date };

/** The workspace's stored files: each R2 object counts once, however many projects use it. */
export type StorageUsage = { bytes: number; files: number };

export const ASSET_LIMIT_REACHED = { limitReached: true } as const;

/** Asset rows of one workspace. Every statement filters on `workspaceId`. */
export function assetsRepo(db: Db, workspaceId: string) {
  /** Distinct stored objects of the workspace (a re-upload of the same file is free). */
  const objects = sql`(select r2_key, max(bytes) as bytes from ${assets} where workspace_id = ${workspaceId} group by r2_key)`;
  return {
    async usage(): Promise<StorageUsage> {
      const rows = await db.all<{ bytes: number | null; files: number }>(
        sql`select coalesce(sum(o.bytes), 0) as bytes, count(*) as files from ${objects} o`,
      );
      return { bytes: Number(rows[0]?.bytes ?? 0), files: Number(rows[0]?.files ?? 0) };
    },

    /**
     * Inserts the row unless it would take the workspace over its file count or storage. A file
     * already stored (same key) adds nothing. Check and insert are one statement, so
     * concurrent uploads can't race past the limits.
     */
    async createWithinLimits(
      input: NewAsset,
      limits: { maxFiles: number; maxBytes: number },
    ): Promise<AssetRow | typeof ASSET_LIMIT_REACHED> {
      const row: AssetRow = { ...input, workspaceId, createdAt: input.createdAt ?? new Date() };
      const files = Number.isFinite(limits.maxFiles) ? limits.maxFiles : Number.MAX_SAFE_INTEGER;
      const bytes = Number.isFinite(limits.maxBytes) ? limits.maxBytes : Number.MAX_SAFE_INTEGER;
      const result = await db.run(sql`
        insert into ${assets} (id, workspace_id, project_id, r2_key, name, mime, bytes, width, height, sha256, created_by, created_at)
        select ${row.id}, ${workspaceId}, ${row.projectId}, ${row.r2Key}, ${row.name}, ${row.mime}, ${row.bytes}, ${row.width}, ${row.height}, ${row.sha256}, ${row.createdBy}, ${row.createdAt.getTime()}
        where exists (select 1 from ${assets} where workspace_id = ${workspaceId} and r2_key = ${row.r2Key})
          or ((select count(*) from ${objects} o) < ${files}
              and (select coalesce(sum(o.bytes), 0) from ${objects} o) + ${row.bytes} <= ${bytes})`);
      return result.meta.changes === 1 ? row : ASSET_LIMIT_REACHED;
    },

    async get(projectId: string, assetId: string): Promise<AssetRow | null> {
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.workspaceId, workspaceId),
            eq(assets.projectId, projectId),
            eq(assets.id, assetId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    /** A row of this project for the stored file, which authorizes serving it. */
    async findByKey(projectId: string, r2Key: string): Promise<AssetRow | null> {
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.workspaceId, workspaceId),
            eq(assets.projectId, projectId),
            eq(assets.r2Key, r2Key),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async listForProject(projectId: string): Promise<AssetRow[]> {
      return db
        .select()
        .from(assets)
        .where(and(eq(assets.workspaceId, workspaceId), eq(assets.projectId, projectId)));
    },

    /** Removes the row; returns whether another row still uses its file (keep the object). */
    async delete(
      projectId: string,
      assetId: string,
    ): Promise<{ deleted: AssetRow | null; keyStillUsed: boolean }> {
      const rows = await db
        .delete(assets)
        .where(
          and(
            eq(assets.workspaceId, workspaceId),
            eq(assets.projectId, projectId),
            eq(assets.id, assetId),
          ),
        )
        .returning();
      const deleted = rows[0] ?? null;
      if (!deleted) return { deleted, keyStillUsed: false };
      const others = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.workspaceId, workspaceId), eq(assets.r2Key, deleted.r2Key)))
        .limit(1);
      return { deleted, keyStillUsed: others.length > 0 };
    },
  };
}
