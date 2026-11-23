/**
 * Fails when an npm dependency's license is outside the AGENTS.md allowlist and has no entry in
 * `licenses.exceptions.json`. Rust crates are checked by `cargo deny check licenses` (deny.toml).
 * Usage: `node scripts/check-licenses.ts` (run by `pnpm check:licenses`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Exception,
  findLicenseViolations,
  type LicensedPackage,
} from "./lib/license-policy.ts";

const root = join(import.meta.dirname, "..");
type PnpmLicenses = Record<string, { name: string; versions: string[]; license: string }[]>;

const raw = execFileSync("pnpm", ["licenses", "list", "--json"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});
const listed = JSON.parse(raw) as PnpmLicenses;
const pkgs: LicensedPackage[] = Object.values(listed)
  .flat()
  .flatMap((p) => p.versions.map((version) => ({ name: p.name, version, license: p.license })));

const exceptions = (
  JSON.parse(readFileSync(join(root, "licenses.exceptions.json"), "utf8")) as { npm: Exception[] }
).npm;

const violations = findLicenseViolations(pkgs, exceptions);
if (violations.length > 0) {
  console.error(`Licenses: ${violations.length} package(s) outside the allowlist (AGENTS.md):`);
  for (const p of violations) console.error(`  ${p.name}@${p.version}: ${p.license}`);
  console.error("Remove the dependency or ask the owner and record an exception.");
  process.exit(1);
}
console.log(
  `Licenses: ${pkgs.length} npm packages OK (${exceptions.length} recorded exception(s))`,
);
