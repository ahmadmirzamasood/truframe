// Secrets come from `.dev.vars` locally and from Workers secrets when deployed. `wrangler types`
// sees them only when `.dev.vars` exists (not in CI), so they are declared here as well.
interface Env {
  ROOM_TOKEN_SECRET: string;
}
