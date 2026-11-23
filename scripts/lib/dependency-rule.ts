/**
 * The internal dependency rule from ARCHITECTURE.md §4, as pure functions so it can be unit tested.
 *
 * - `model`, `ops`, `layout`, `protocol` (core) depend only on each other.
 * - UI packages never import workers; workers never import UI packages.
 * - Nothing imports an app or a worker: they are deploy units, reached over HTTP or bindings.
 * - Every `@truframe/*` import in source must be declared in package.json (keeps the graph honest).
 * - No cycles.
 */

export type WorkspacePackage = {
  name: string;
  /** Repo-relative directory, e.g. `packages/ops`. */
  dir: string;
  /** `@truframe/*` names declared in dependencies, devDependencies or peerDependencies. */
  declared: string[];
  /** `@truframe/*` package names imported from source files (subpaths stripped). */
  imported: string[];
};

export type Violation = { pkg: string; message: string };

const SCOPE = "@truframe/";
export const CORE = new Set(["model", "ops", "layout", "protocol"].map((n) => SCOPE + n));
export const UI = new Set(["ui", "editor", "codeview", "renderer"].map((n) => SCOPE + n));

export type Kind = "core" | "ui" | "app" | "worker" | "package";

export function kindOf(pkg: Pick<WorkspacePackage, "name" | "dir">): Kind {
  if (pkg.dir.startsWith("apps/")) return "app";
  if (pkg.dir.startsWith("workers/")) return "worker";
  if (CORE.has(pkg.name)) return "core";
  if (UI.has(pkg.name)) return "ui";
  return "package";
}

/** `@truframe/ops/sub/path` → `@truframe/ops`. Returns null for non-workspace specifiers. */
export function packageOfSpecifier(spec: string): string | null {
  if (!spec.startsWith(SCOPE)) return null;
  const name = spec.slice(SCOPE.length).split("/")[0];
  return name ? SCOPE + name : null;
}

/** Collects bare `@truframe/*` specifiers from import/export/require/dynamic import statements. */
export function extractImports(source: string): string[] {
  const found = new Set<string>();
  const re =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](@truframe\/[^"']+)["']/g;
  for (const match of source.matchAll(re)) {
    const pkg = packageOfSpecifier(match[1] ?? "");
    if (pkg) found.add(pkg);
  }
  return [...found].sort();
}

export function checkDependencyRule(pkgs: WorkspacePackage[]): Violation[] {
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  const violations: Violation[] = [];

  for (const pkg of pkgs) {
    const kind = kindOf(pkg);
    for (const name of pkg.imported) {
      if (name !== pkg.name && !pkg.declared.includes(name)) {
        violations.push({
          pkg: pkg.name,
          message: `imports ${name} but does not declare it in package.json`,
        });
      }
    }
    const edges = new Set([...pkg.declared, ...pkg.imported]);
    for (const name of edges) {
      const target = byName.get(name);
      if (!target) {
        violations.push({ pkg: pkg.name, message: `depends on unknown workspace package ${name}` });
        continue;
      }
      const targetKind = kindOf(target);
      if (targetKind === "app" || targetKind === "worker") {
        violations.push({
          pkg: pkg.name,
          message: `depends on ${name}; apps and workers are deploy units and cannot be imported`,
        });
      }
      if (kind === "core" && targetKind !== "core") {
        violations.push({
          pkg: pkg.name,
          message: `core packages (model, ops, layout, protocol) may only depend on each other, not ${name}`,
        });
      }
      if (kind === "worker" && targetKind === "ui") {
        violations.push({ pkg: pkg.name, message: `workers must not import UI package ${name}` });
      }
    }
  }

  for (const cycle of findCycles(pkgs)) {
    violations.push({ pkg: cycle[0] ?? "?", message: `dependency cycle: ${cycle.join(" → ")}` });
  }
  return violations;
}

function findCycles(pkgs: WorkspacePackage[]): string[][] {
  const graph = new Map(pkgs.map((p) => [p.name, [...new Set([...p.declared, ...p.imported])]]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (name: string): void => {
    const s = state.get(name);
    if (s === "done") return;
    if (s === "visiting") {
      cycles.push([...stack.slice(stack.indexOf(name)), name]);
      return;
    }
    state.set(name, "visiting");
    stack.push(name);
    for (const next of graph.get(name) ?? []) {
      if (graph.has(next)) visit(next);
    }
    stack.pop();
    state.set(name, "done");
  };

  for (const name of [...graph.keys()].sort()) visit(name);
  return cycles;
}
