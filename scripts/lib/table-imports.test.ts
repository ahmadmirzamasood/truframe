import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Proves biome.json's noRestrictedImports override: Drizzle and table imports are allowed only
// inside packages/db (docs/engineering/SECURITY.md §3, first checklist item).
const root = join(import.meta.dirname, "..", "..");
const probes: string[] = [];

function lint(relDir: string, source: string): string {
  const dir = join(root, relDir, `__lint_probe_${process.pid}_${probes.length}`);
  probes.push(dir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "probe.ts");
  writeFileSync(file, source);
  try {
    execFileSync(process.execPath, [biomeBin(), "lint", file], { cwd: root, stdio: "pipe" });
    return "";
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    return `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`;
  }
}

function biomeBin(): string {
  return join(root, "node_modules", "@biomejs", "biome", "bin", "biome");
}

afterAll(() => {
  for (const dir of probes) rmSync(dir, { recursive: true, force: true });
});

describe("table import lint rule", () => {
  it("forbids drizzle-orm and table imports outside packages/db", () => {
    const out = lint(
      "apps/web/src",
      [
        'import { eq } from "drizzle-orm";',
        'import { projects } from "@truframe/db/src/schema/app.ts";',
        'import { users } from "../../../../packages/db/src/schema/auth.ts";',
        "export const used = [eq, projects, users];",
        "",
      ].join("\n"),
    );
    expect(out.match(/lint\/style\/noRestrictedImports/g)).toHaveLength(3);
  }, 60_000);

  it("allows repos from @truframe/db and drizzle inside packages/db", () => {
    expect(
      lint(
        "apps/web/src",
        'import { forWorkspace } from "@truframe/db";\nexport const used = forWorkspace;\n',
      ),
    ).not.toMatch(/noRestrictedImports/);
    expect(
      lint("packages/db/src/repos", 'import { eq } from "drizzle-orm";\nexport const used = eq;\n'),
    ).not.toMatch(/noRestrictedImports/);
  }, 60_000);
});
