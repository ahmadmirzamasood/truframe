import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes SQL migrations that wrangler applies (`pnpm db:migrate`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
