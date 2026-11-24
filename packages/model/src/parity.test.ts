// TS half of the model parity check; the Rust half is crates/compiler/tests/parity.rs.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocument } from "./document.ts";
import { invalidFixtures, validFixtures } from "./testing/parity.ts";

const root = join(import.meta.dirname, "..", "..", "..", "fixtures", "model");

function readDir(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(join(root, dir)).sort()) {
    if (f.endsWith(".json"))
      out[f.slice(0, -5)] = JSON.parse(readFileSync(join(root, dir, f), "utf8"));
  }
  return out;
}

describe("model parity fixtures", () => {
  it.each(["valid", "invalid"] as const)(
    "fixtures/model/%s matches the generator (run `node scripts/model-fixtures.ts`)",
    (dir) => {
      const expected = dir === "valid" ? validFixtures() : invalidFixtures();
      expect(readDir(dir)).toEqual(JSON.parse(JSON.stringify(expected)));
    },
  );

  it.each(Object.keys(validFixtures()))("valid/%s passes the TypeScript validator", (name) => {
    const r = validateDocument(readDir("valid")[name]);
    expect(r.ok ? [] : r.issues).toEqual([]);
  });

  it.each(Object.keys(invalidFixtures()))("invalid/%s fails the TypeScript validator", (name) => {
    expect(validateDocument(readDir("invalid")[name]).ok).toBe(false);
  });
});
