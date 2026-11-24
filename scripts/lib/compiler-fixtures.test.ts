import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocument } from "../../packages/model/src/index.ts";
import { compilerFixtures } from "./compiler-fixtures.ts";

const root = join(import.meta.dirname, "..", "..", "fixtures", "compiler");

describe("compiler golden inputs", () => {
  const fixtures = compilerFixtures();

  it("are valid documents", () => {
    for (const [name, doc] of Object.entries(fixtures)) {
      const result = validateDocument(doc);
      expect(result.ok ? [] : result.issues, name).toEqual([]);
    }
  });

  it("match fixtures/compiler (run node scripts/compiler-fixtures.ts)", () => {
    const onDisk = readdirSync(root).sort();
    expect(onDisk).toEqual(Object.keys(fixtures).sort());
    for (const [name, doc] of Object.entries(fixtures)) {
      const text = readFileSync(join(root, name, "input.json"), "utf8");
      expect(text, name).toBe(`${JSON.stringify(doc, null, 2)}\n`);
    }
  });

  it("are enough for the Phase 3 exit (≥ 40 goldens over both frameworks)", () => {
    expect(Object.keys(fixtures).length * 2).toBeGreaterThanOrEqual(40);
  });
});
