/**
 * License allowlist from AGENTS.md ("Clean-room rule"), as pure functions.
 * Allowed: MIT, ISC, BSD-2/3, Apache-2.0, MPL-2.0 (unmodified), 0BSD, CC0, Zlib, Unicode.
 * Not allowed: GPL, AGPL, SSPL, BUSL (and anything else not listed, until the human approves it).
 */

export const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "MPL-2.0",
  "0BSD",
  "CC0-1.0",
  "Zlib",
  "Unicode-DFS-2016",
  "Unicode-3.0",
]);

/** Normalizes common non-SPDX spellings found in package.json files. */
const ALIASES: Record<string, string> = {
  "Apache 2.0": "Apache-2.0",
  "Apache License 2.0": "Apache-2.0",
  "Apache-2": "Apache-2.0",
  BSD: "BSD-3-Clause",
  "BSD*": "BSD-3-Clause",
  "MIT*": "MIT",
  "(MIT)": "MIT",
};

/**
 * Evaluates a (simple) SPDX expression: `OR` needs one allowed side, `AND` needs all.
 * Parentheses are only supported as a flat wrapper, which covers what npm and crates publish.
 */
export function isAllowed(expression: string): boolean {
  const expr = (ALIASES[expression.trim()] ?? expression.trim()).replace(/^\((.*)\)$/, "$1");
  if (/\s+OR\s+/i.test(expr)) return expr.split(/\s+OR\s+/i).some((part) => isAllowed(part));
  if (/\s+AND\s+/i.test(expr)) return expr.split(/\s+AND\s+/i).every((part) => isAllowed(part));
  const id = ALIASES[expr] ?? expr;
  return ALLOWED.has(id);
}

export type LicensedPackage = { name: string; version: string; license: string };
export type Exception = { name: string; license: string; reason: string };

/** Returns packages whose license is not allowed and that have no matching recorded exception. */
export function findLicenseViolations(
  pkgs: LicensedPackage[],
  exceptions: Exception[],
): LicensedPackage[] {
  return pkgs.filter(
    (p) =>
      !isAllowed(p.license) &&
      !exceptions.some((e) => e.license === p.license && matchesName(e.name, p.name)),
  );
}

/** Exception names may end in `*` to cover a family of platform packages. */
function matchesName(pattern: string, name: string): boolean {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}
