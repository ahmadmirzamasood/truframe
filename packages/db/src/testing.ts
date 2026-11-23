/**
 * Test helper: a real local D1 (Miniflare, in memory) with every migration applied.
 * Import from `@truframe/db/testing` in tests only; never from app or worker code.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { createDb, type D1Binding, type Db } from "./client.ts";

export const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

/** Migration SQL split into statements, in filename order (what wrangler applies). */
export function migrationStatements(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint"))
    .map((s) => s.trim())
    .filter(Boolean);
}

export type TestDb = { db: Db; d1: D1Binding; dispose: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  // Wrangler's platform proxy: a real local D1 in workerd, nothing persisted to disk.
  const proxy = await getPlatformProxy<{ DB: unknown }>({
    configPath: join(import.meta.dirname, "..", "test", "wrangler.jsonc"),
    persist: false,
    remoteBindings: false,
  });
  const d1 = proxy.env.DB as D1Binding;
  for (const statement of migrationStatements()) {
    await d1.prepare(statement).run();
  }
  return { db: createDb(d1), d1, dispose: () => proxy.dispose() };
}

/** Inserts a bare user row (what Better Auth would create) and returns its id. */
export async function insertTestUser(
  d1: D1Binding,
  input: { id: string; email: string; name?: string },
): Promise<string> {
  const now = Date.now();
  await d1
    .prepare(
      "insert into users (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, 1, ?, ?)",
    )
    .bind(input.id, input.name ?? input.email, input.email, now, now)
    .run();
  return input.id;
}
