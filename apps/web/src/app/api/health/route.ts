import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Probe = "ok" | "missing" | "error";

async function probe(present: boolean, run: () => Promise<unknown>): Promise<Probe> {
  if (!present) return "missing";
  try {
    await run();
    return "ok";
  } catch {
    // Details stay server-side; the health endpoint is public.
    return "error";
  }
}

/** Reports whether each Cloudflare binding is wired and answering (local Miniflare or deployed). */
export async function GET(): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const checks = {
    d1: await probe(Boolean(env.DB), () => env.DB.prepare("select 1 as one").first()),
    r2: await probe(Boolean(env.FILES), () => env.FILES.head("health/probe")),
    kv: await probe(Boolean(env.CONFIG), () => env.CONFIG.get("health:probe")),
    queue: (env.JOBS ? "ok" : "missing") satisfies Probe,
    projectRoom: (env.PROJECT_ROOM ? "ok" : "missing") satisfies Probe,
    agentSession: (env.AGENT_SESSION ? "ok" : "missing") satisfies Probe,
  };
  const ok = Object.values(checks).every((c) => c === "ok");
  return Response.json(
    { ok, env: env.TRUFRAME_ENV ?? "unknown", checks },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
