/**
 * Wrangler does not inherit bindings into environments, so every env repeats them by hand.
 * These checks catch drift: a binding added to dev but not staging, or staging pointing at a
 * production resource.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const CONFIGS = [
  "apps/web",
  "workers/realtime",
  "workers/agent",
  "workers/mcp",
  "workers/jobs",
  "workers/sites",
];
const ENVS = ["staging", "production"] as const;

type Named = { binding?: string; name?: string };
type EnvConfig = {
  name: string;
  vars?: Record<string, string>;
  d1_databases?: (Named & { database_name: string; database_id?: string })[];
  r2_buckets?: (Named & { bucket_name: string })[];
  kv_namespaces?: (Named & { id?: string })[];
  queues?: { producers?: (Named & { queue: string })[]; consumers?: { queue: string }[] };
  durable_objects?: { bindings: (Named & { class_name: string; script_name?: string })[] };
  services?: (Named & { service: string })[];
};
type Config = EnvConfig & { env: Record<string, EnvConfig> };

/** Our wrangler.jsonc files only use full-line `//` comments (the header). */
function readConfig(dir: string): Config {
  const text = readFileSync(join(root, dir, "wrangler.jsonc"), "utf8");
  return JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n"),
  ) as Config;
}

function bindingNames(c: EnvConfig): Record<string, string[]> {
  const names = (xs: Named[] | undefined) => (xs ?? []).map((x) => x.binding ?? x.name ?? "?");
  return {
    d1: names(c.d1_databases),
    r2: names(c.r2_buckets),
    kv: names(c.kv_namespaces),
    queueProducers: names(c.queues?.producers),
    queueConsumers: (c.queues?.consumers ?? []).map((q) =>
      q.queue.replace(/-(dev|staging|production)-/, "-<env>-"),
    ),
    durableObjects: names(c.durable_objects?.bindings),
    services: names(c.services),
  };
}

/** Every resource and worker reference an env uses, so we can check it targets that env. */
function resourceNames(c: EnvConfig): string[] {
  return [
    c.name,
    ...(c.d1_databases ?? []).map((d) => d.database_name),
    ...(c.r2_buckets ?? []).map((b) => b.bucket_name),
    ...(c.queues?.producers ?? []).map((q) => q.queue),
    ...(c.queues?.consumers ?? []).map((q) => q.queue),
    ...(c.durable_objects?.bindings ?? []).flatMap((d) => (d.script_name ? [d.script_name] : [])),
    ...(c.services ?? []).map((s) => s.service),
  ];
}

describe.each(CONFIGS)("%s/wrangler.jsonc", (dir) => {
  const config = readConfig(dir);

  it("defines staging and production", () => {
    expect(Object.keys(config.env).sort()).toEqual([...ENVS].sort());
  });

  it("points dev (top level) only at dev resources", () => {
    expect(config.vars?.TRUFRAME_ENV).toBe("local");
    for (const name of resourceNames(config)) expect(name).toMatch(/-dev($|-)/);
  });

  it.each(ENVS)("repeats every binding in %s", (env) => {
    expect(bindingNames(config.env[env] as EnvConfig)).toEqual(bindingNames(config));
  });

  it.each(ENVS)("points %s only at its own resources", (env) => {
    const c = config.env[env] as EnvConfig;
    expect(c.vars?.TRUFRAME_ENV).toBe(env);
    for (const name of resourceNames(c)) expect(name).toMatch(new RegExp(`-${env}($|-)`));
  });
});
