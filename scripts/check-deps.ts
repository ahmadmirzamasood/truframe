/**
 * Enforces the internal dependency rule (ARCHITECTURE.md §4) across the pnpm workspace.
 * Usage: `node scripts/check-deps.ts` (run by `pnpm lint`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  checkDependencyRule,
  extractImports,
  packageOfSpecifier,
  type WorkspacePackage,
} from "./lib/dependency-rule.ts";

const root = join(import.meta.dirname, "..");
const GROUPS = ["apps", "packages", "workers"];
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|astro)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".open-next", ".turbo", ".wrangler"]);

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE_EXT.test(entry) && !entry.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function loadWorkspace(): WorkspacePackage[] {
  const pkgs: WorkspacePackage[] = [];
  for (const group of GROUPS) {
    const groupDir = join(root, group);
    let entries: string[];
    try {
      entries = readdirSync(groupDir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      const dir = join(groupDir, entry);
      let manifest: PackageJson;
      try {
        manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
      } catch {
        continue;
      }
      if (!manifest.name) continue;
      const declared = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      })
        .map(packageOfSpecifier)
        .filter((n): n is string => n !== null);
      const imported = new Set<string>();
      for (const file of walk(dir, [])) {
        for (const name of extractImports(readFileSync(file, "utf8"))) imported.add(name);
      }
      pkgs.push({
        name: manifest.name,
        dir: relative(root, dir).split(sep).join("/"),
        declared: [...new Set(declared)].sort(),
        imported: [...imported].sort(),
      });
    }
  }
  return pkgs;
}

const pkgs = loadWorkspace();
const violations = checkDependencyRule(pkgs);
if (violations.length > 0) {
  console.error(`Dependency rule: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ${v.pkg}: ${v.message}`);
  console.error("See ARCHITECTURE.md §4 for the rule.");
  process.exit(1);
}
console.log(`Dependency rule: ${pkgs.length} workspace packages OK`);
