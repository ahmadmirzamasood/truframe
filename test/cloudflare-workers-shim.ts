/**
 * Minimal stand-in for the `cloudflare:workers` module so worker stubs can be unit tested in Node.
 * Real Durable Object/queue tests run in workerd via @cloudflare/vitest-pool-workers (from P2).
 */
export class DurableObject<Env = unknown> {
  protected ctx: unknown;
  protected env: Env;
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class WorkerEntrypoint<Env = unknown> {
  protected env: Env;
  constructor(_ctx: unknown, env: Env) {
    this.env = env;
  }
}
