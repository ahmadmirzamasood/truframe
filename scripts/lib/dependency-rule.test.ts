import { describe, expect, it } from "vitest";
import {
  checkDependencyRule,
  extractImports,
  kindOf,
  packageOfSpecifier,
  type WorkspacePackage,
} from "./dependency-rule.ts";

const pkg = (
  name: string,
  dir: string,
  declared: string[] = [],
  imported: string[] = declared,
): WorkspacePackage => ({ name: `@truframe/${name}`, dir, declared, imported });

const base = [
  pkg("model", "packages/model"),
  pkg("ops", "packages/ops", ["@truframe/model"]),
  pkg("layout", "packages/layout"),
  pkg("protocol", "packages/protocol"),
  pkg("billing", "packages/billing"),
  pkg("ui", "packages/ui"),
  pkg("editor", "packages/editor", ["@truframe/ui", "@truframe/ops"]),
  pkg("web", "apps/web", ["@truframe/editor"]),
  pkg("worker-jobs", "workers/jobs", ["@truframe/billing"]),
];

describe("kindOf", () => {
  it("classifies packages", () => {
    expect(kindOf({ name: "@truframe/ops", dir: "packages/ops" })).toBe("core");
    expect(kindOf({ name: "@truframe/editor", dir: "packages/editor" })).toBe("ui");
    expect(kindOf({ name: "@truframe/web", dir: "apps/web" })).toBe("app");
    expect(kindOf({ name: "@truframe/worker-mcp", dir: "workers/mcp" })).toBe("worker");
    expect(kindOf({ name: "@truframe/db", dir: "packages/db" })).toBe("package");
  });
});

describe("extractImports", () => {
  it("finds static, type, dynamic, re-export and require specifiers and strips subpaths", () => {
    const src = `
      import { a } from "@truframe/model";
      import type { B } from '@truframe/ops/types';
      export * from "@truframe/layout";
      import "@truframe/protocol/side-effect";
      const c = await import("@truframe/billing");
      const d = require("@truframe/db");
      import x from "react";
    `;
    expect(extractImports(src)).toEqual([
      "@truframe/billing",
      "@truframe/db",
      "@truframe/layout",
      "@truframe/model",
      "@truframe/ops",
      "@truframe/protocol",
    ]);
  });

  it("ignores non-workspace specifiers", () => {
    expect(packageOfSpecifier("@truframeish/x")).toBeNull();
    expect(packageOfSpecifier("@truframe/ops/deep/file")).toBe("@truframe/ops");
  });
});

describe("checkDependencyRule", () => {
  it("accepts the documented layout", () => {
    expect(checkDependencyRule(base)).toEqual([]);
  });

  it("rejects core packages depending on non-core packages", () => {
    const v = checkDependencyRule([
      ...base.filter((p) => p.name !== "@truframe/model"),
      pkg("model", "packages/model", ["@truframe/billing"]),
    ]);
    expect(v.map((x) => x.message)).toEqual([
      expect.stringContaining("core packages (model, ops, layout, protocol) may only depend"),
    ]);
  });

  it("rejects workers importing UI packages", () => {
    const v = checkDependencyRule([
      ...base,
      pkg("worker-agent", "workers/agent", ["@truframe/ui"]),
    ]);
    expect(v).toEqual([
      { pkg: "@truframe/worker-agent", message: "workers must not import UI package @truframe/ui" },
    ]);
  });

  it("rejects anything importing a worker or app", () => {
    const v = checkDependencyRule([
      ...base,
      pkg("renderer", "packages/renderer", ["@truframe/worker-jobs"]),
    ]);
    expect(v[0]?.message).toContain("deploy units");
  });

  it("rejects undeclared imports", () => {
    const v = checkDependencyRule([
      ...base,
      pkg("skills", "packages/skills", [], ["@truframe/billing"]),
    ]);
    expect(v[0]).toEqual({
      pkg: "@truframe/skills",
      message: "imports @truframe/billing but does not declare it in package.json",
    });
  });

  it("rejects cycles", () => {
    const v = checkDependencyRule([
      pkg("a", "packages/a", ["@truframe/b"]),
      pkg("b", "packages/b", ["@truframe/a"]),
    ]);
    expect(v.map((x) => x.message)).toContain(
      "dependency cycle: @truframe/a → @truframe/b → @truframe/a",
    );
  });
});
