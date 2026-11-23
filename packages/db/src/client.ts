import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema/index.ts";

export type Db = DrizzleD1Database<typeof schema>;
/** The D1 binding type drizzle expects (from @cloudflare/workers-types). */
export type D1Binding = Parameters<typeof drizzle>[0];

/** Wraps a D1 binding. Cheap; create one per request. */
export function createDb(d1: D1Binding): Db {
  return drizzle(d1, { schema });
}
