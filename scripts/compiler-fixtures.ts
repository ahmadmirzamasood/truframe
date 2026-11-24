// Writes the compiler golden inputs to fixtures/compiler/<name>/input.json.
// Then regenerate the expected output: UPDATE_GOLDENS=1 cargo test -p truframe-compiler --test goldens
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateDocument } from "../packages/model/src/index.ts";
import { compilerFixtures } from "./lib/compiler-fixtures.ts";

const root = join(import.meta.dirname, "..", "fixtures", "compiler");
let failed = false;
for (const [name, doc] of Object.entries(compilerFixtures())) {
  const result = validateDocument(doc);
  if (!result.ok) {
    failed = true;
    console.error(`${name}: invalid document`, JSON.stringify(result.issues, null, 2));
    continue;
  }
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "input.json"), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`${Object.keys(compilerFixtures()).length} compiler fixtures`);
if (failed) process.exit(1);
