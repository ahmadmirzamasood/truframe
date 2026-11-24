// Writes the TS ↔ Rust parity fixtures to fixtures/model/{valid,invalid}/*.json.
// Run after changing the model: `node scripts/model-fixtures.ts`, then `pnpm format`.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { invalidFixtures, validFixtures } from "../packages/model/src/testing/parity.ts";

const root = join(import.meta.dirname, "..", "fixtures", "model");

for (const [dir, fixtures] of [
  ["valid", validFixtures()],
  ["invalid", invalidFixtures()],
] as const) {
  const out = join(root, dir);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith(".json")) rmSync(join(out, f));
  for (const [name, doc] of Object.entries(fixtures)) {
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  }
  console.log(`${dir}: ${Object.keys(fixtures).length} fixtures`);
}
